import assert from 'node:assert/strict'
import { describe, it, type TestContext } from 'node:test'
import { ZodError } from 'zod'

import type { PeopleRepository } from '../../src/people.repository.js'
import {
  PeopleService,
  type PeopleServiceOptions,
  SyncAlreadyRunningError,
  US_STATE_CODES,
} from '../../src/people.service.js'
import { makeOpenStatesPage, makeOpenStatesPerson, makePerson } from './fixtures.js'

function setup(
  t: TestContext,
  apiKey = 'unit-test-api-key',
  options: PeopleServiceOptions = {},
) {
  const repository = {
    updatesByState: t.mock.fn<PeopleRepository['updatesByState']>(async () => []),
    upsertMany: t.mock.fn<PeopleRepository['upsertMany']>(async () => undefined),
    findAll: t.mock.fn<PeopleRepository['findAll']>(async () => []),
  }
  // Nenhum teste usa o fetch real, mesmo quando não configura uma resposta.
  const fetchMock = t.mock.method(globalThis, 'fetch')
  fetchMock.mock.mockImplementation(async () => {
    throw new Error('Chamada fetch sem resposta simulada')
  })
  const service = new PeopleService(apiKey, repository as unknown as PeopleRepository, {
    maxRateLimitRetries: 0,
    ...options,
  })

  return { service, repository, fetchMock }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('PeopleService', { concurrency: false }, () => {
  it('rejeita uma chave da OpenStates vazia', (t) => {
    assert.throws(() => setup(t, ''), {
      message: 'OPENSTATES_API_KEY não configurada',
    })
  })

  it('sincroniza todos os estados sequencialmente e soma as pessoas', async (t) => {
    const { service, repository, fetchMock } = setup(t)
    fetchMock.mock.mockImplementation(async (input) => {
      assert.ok(input instanceof URL)
      const state = input.searchParams.get('jurisdiction')
      assert.ok(state)

      return jsonResponse(
        makeOpenStatesPage([
          makeOpenStatesPerson({
            id: `ocd-person/${state.toLowerCase()}`,
            name: `Person ${state}`,
            jurisdiction: {
              id:
                state === 'DC'
                  ? 'ocd-jurisdiction/country:us/district:dc/government'
                  : `ocd-jurisdiction/country:us/state:${state.toLowerCase()}/government`,
              name: state,
            },
          }),
        ]),
      )
    })

    assert.deepEqual(await service.syncAll(), {
      fetched: US_STATE_CODES.length,
      states: US_STATE_CODES.length,
    })
    assert.deepEqual(
      fetchMock.mock.calls.map(({ arguments: [input] }) => {
        assert.ok(input instanceof URL)
        return input.searchParams.get('jurisdiction')
      }),
      [...US_STATE_CODES],
    )
    assert.equal(repository.upsertMany.mock.callCount(), US_STATE_CODES.length)
    assert.equal(repository.updatesByState.mock.callCount(), 1)
  })

  it('ignora todos os estados atualizados há menos de sete dias', async (t) => {
    const now = new Date('2026-09-09T12:00:00.000Z')
    const { service, repository, fetchMock } = setup(t, 'unit-test-api-key', {
      now: () => now,
    })
    repository.updatesByState.mock.mockImplementation(async () =>
      US_STATE_CODES.map((state) => ({
        state,
        updatedAt: new Date('2026-09-08T12:00:00.000Z'),
      })),
    )

    assert.deepEqual(await service.syncAll(), {
      fetched: 0,
      states: 0,
    })
    assert.equal(repository.updatesByState.mock.callCount(), 1)
    assert.equal(fetchMock.mock.callCount(), 0)
    assert.equal(repository.upsertMany.mock.callCount(), 0)
  })

  it('sincroniza somente estados vencidos ou ausentes do cache', async (t) => {
    const now = new Date('2026-09-09T12:00:00.000Z')
    const { service, repository, fetchMock } = setup(t, 'unit-test-api-key', {
      now: () => now,
    })
    repository.updatesByState.mock.mockImplementation(async () =>
      US_STATE_CODES.filter((state) => state !== 'DC').map((state) => ({
        state,
        updatedAt:
          state === 'CA'
            ? new Date('2026-09-01T11:59:59.999Z')
            : new Date('2026-09-08T12:00:00.000Z'),
      })),
    )
    fetchMock.mock.mockImplementation(async (input) => {
      assert.ok(input instanceof URL)
      const state = input.searchParams.get('jurisdiction')
      assert.ok(state === 'CA' || state === 'DC')

      return jsonResponse(
        makeOpenStatesPage([
          makeOpenStatesPerson({
            id: `ocd-person/${state.toLowerCase()}`,
            jurisdiction: {
              id:
                state === 'DC'
                  ? 'ocd-jurisdiction/country:us/district:dc/government'
                  : 'ocd-jurisdiction/country:us/state:ca/government',
              name: state,
            },
          }),
        ]),
      )
    })

    assert.deepEqual(await service.syncAll(), {
      fetched: 2,
      states: 2,
    })
    assert.deepEqual(
      fetchMock.mock.calls.map(({ arguments: [input] }) => {
        assert.ok(input instanceof URL)
        return input.searchParams.get('jurisdiction')
      }),
      ['CA', 'DC'],
    )
    assert.equal(repository.updatesByState.mock.callCount(), 1)
    assert.equal(repository.upsertMany.mock.callCount(), 2)
  })

  it('rejeita uma segunda sincronização enquanto a primeira está ativa', async (t) => {
    const now = new Date('2026-09-09T12:00:00.000Z')
    const { service, repository, fetchMock } = setup(t, 'unit-test-api-key', {
      now: () => now,
    })
    let releaseUpdates: (
      updates: Awaited<ReturnType<PeopleRepository['updatesByState']>>,
    ) => void = () => undefined
    const pendingUpdates = new Promise<
      Awaited<ReturnType<PeopleRepository['updatesByState']>>
    >((resolve) => {
      releaseUpdates = resolve
    })
    repository.updatesByState.mock.mockImplementation(async () => pendingUpdates)

    const firstSync = service.syncAll()
    await Promise.resolve()

    await assert.rejects(service.syncAll(), SyncAlreadyRunningError)

    releaseUpdates(
      US_STATE_CODES.map((state) => ({
        state,
        updatedAt: now,
      })),
    )
    assert.deepEqual(await firstSync, { fetched: 0, states: 0 })
    assert.equal(repository.updatesByState.mock.callCount(), 1)
    assert.equal(fetchMock.mock.callCount(), 0)
  })

  it('interrompe a sincronização geral quando um estado falha', async (t) => {
    const now = new Date('2026-09-09T12:00:00.000Z')
    const { service, repository, fetchMock } = setup(t, 'unit-test-api-key', {
      now: () => now,
    })
    fetchMock.mock.mockImplementation(async (input) => {
      assert.ok(input instanceof URL)
      const state = input.searchParams.get('jurisdiction')

      if (state === 'AZ') {
        return new Response('Erro', { status: 503 })
      }

      return jsonResponse(makeOpenStatesPage())
    })

    await assert.rejects(service.syncAll(), {
      message: 'OpenStates respondeu com status 503',
    })
    assert.deepEqual(
      fetchMock.mock.calls.map(({ arguments: [input] }) => {
        assert.ok(input instanceof URL)
        return input.searchParams.get('jurisdiction')
      }),
      ['AL', 'AK', 'AZ'],
    )
    assert.equal(repository.upsertMany.mock.callCount(), 2)

    repository.updatesByState.mock.mockImplementation(async () =>
      US_STATE_CODES.map((state) => ({ state, updatedAt: now })),
    )
    assert.deepEqual(await service.syncAll(), { fetched: 0, states: 0 })
  })

  it('autentica a consulta, aplica timeout e mapeia os campos', async (t) => {
    const { service, repository, fetchMock } = setup(t)
    const signal = new AbortController().signal
    const timeout = t.mock.method(AbortSignal, 'timeout', () => signal)
    fetchMock.mock.mockImplementation(async () => jsonResponse(makeOpenStatesPage()))

    const result = await service.syncByState('CA')

    assert.deepEqual(result, { fetched: 1, people: [makePerson()] })
    assert.equal(fetchMock.mock.callCount(), 1)
    const [input, options] = fetchMock.mock.calls[0].arguments
    assert.ok(input instanceof URL)
    assert.equal(input.origin, 'https://v3.openstates.org')
    assert.equal(input.pathname, '/people')
    assert.deepEqual(Object.fromEntries(input.searchParams), {
      jurisdiction: 'CA',
      page: '1',
      per_page: '50',
    })
    assert.deepEqual(options?.headers, {
      Accept: 'application/json',
      'X-API-KEY': 'unit-test-api-key',
    })
    assert.equal(options?.signal, signal)
    assert.equal(timeout.mock.callCount(), 1)
    assert.deepEqual(timeout.mock.calls[0].arguments, [15_000])
    assert.equal(repository.upsertMany.mock.callCount(), 1)
    assert.deepEqual(repository.upsertMany.mock.calls[0].arguments, [[makePerson()]])
    assert.equal(repository.findAll.mock.callCount(), 0)
  })

  it('persiste o conjunto completo após buscar todas as páginas', async (t) => {
    const { service, repository, fetchMock } = setup(t)
    const sourcePeople = [
      makeOpenStatesPerson(),
      makeOpenStatesPerson({ id: 'ocd-person/john-doe', name: 'John Doe' }),
      makeOpenStatesPerson({ id: 'ocd-person/alex-doe', name: 'Alex Doe' }),
    ]
    fetchMock.mock.mockImplementation(async (input) => {
      assert.ok(input instanceof URL)
      assert.equal(input.searchParams.get('jurisdiction'), 'CA')
      assert.equal(input.searchParams.get('per_page'), '50')
      assert.equal(repository.upsertMany.mock.callCount(), 0)
      const page = Number(input.searchParams.get('page'))
      assert.ok(page >= 1 && page <= 3)
      return jsonResponse(makeOpenStatesPage([sourcePeople[page - 1]], page, 3))
    })

    const result = await service.syncByState('CA')

    assert.deepEqual(result, {
      fetched: 3,
      people: [
        makePerson(),
        makePerson({ id: 'ocd-person/john-doe', name: 'John Doe' }),
        makePerson({ id: 'ocd-person/alex-doe', name: 'Alex Doe' }),
      ],
    })
    assert.deepEqual(
      fetchMock.mock.calls.map(({ arguments: [input] }) => {
        assert.ok(input instanceof URL)
        return input.searchParams.get('page')
      }),
      ['1', '2', '3'],
    )
    assert.equal(repository.upsertMany.mock.callCount(), 1)
    assert.deepEqual(repository.upsertMany.mock.calls[0].arguments, [result.people])
  })

  it('retorna contagem zero quando a OpenStates não encontra pessoas', async (t) => {
    const { service, repository, fetchMock } = setup(t)
    fetchMock.mock.mockImplementation(async () => jsonResponse(makeOpenStatesPage([])))

    assert.deepEqual(await service.syncByState('CA'), { fetched: 0, people: [] })
    assert.equal(fetchMock.mock.callCount(), 1)
    assert.equal(repository.upsertMany.mock.callCount(), 1)
    assert.deepEqual(repository.upsertMany.mock.calls[0].arguments, [[]])
  })

  it('continua a paginação quando uma página intermediária está vazia', async (t) => {
    const { service, fetchMock } = setup(t)
    fetchMock.mock.mockImplementationOnce(
      async () => jsonResponse(makeOpenStatesPage([], 1, 2)),
      0,
    )
    fetchMock.mock.mockImplementationOnce(
      async () => jsonResponse(makeOpenStatesPage([makeOpenStatesPerson()], 2, 2)),
      1,
    )

    assert.deepEqual(await service.syncByState('CA'), {
      fetched: 1,
      people: [makePerson()],
    })
    assert.equal(fetchMock.mock.callCount(), 2)
  })

  for (const optionalValue of [null, undefined]) {
    it(`converte imagem e cargo ${optionalValue} em null`, async (t) => {
      const { service, repository, fetchMock } = setup(t)
      fetchMock.mock.mockImplementation(async () =>
        jsonResponse(
          makeOpenStatesPage([
            makeOpenStatesPerson({ image: optionalValue, current_role: optionalValue }),
          ]),
        ),
      )

      const expected = makePerson({ role: null, imageUrl: null })
      assert.deepEqual(await service.syncByState('CA'), {
        fetched: 1,
        people: [expected],
      })
      assert.deepEqual(repository.upsertMany.mock.calls[0].arguments, [[expected]])
    })
  }

  for (const [jurisdictionId, expectedState] of [
    ['ocd-jurisdiction/country:us/state:ny/government', 'NY'],
    ['ocd-jurisdiction/country:us/state:Tx/government', 'TX'],
    ['ocd-jurisdiction/country:us/state:CA', 'CA'],
    ['ocd-jurisdiction/country:us/district:dc/government', 'DC'],
  ]) {
    it(`extrai o estado do identificador ${jurisdictionId}`, async (t) => {
      const { service, fetchMock } = setup(t)
      fetchMock.mock.mockImplementation(async () =>
        jsonResponse(
          makeOpenStatesPage([
            makeOpenStatesPerson({
              jurisdiction: { id: jurisdictionId, name: 'Nome da jurisdição' },
            }),
          ]),
        ),
      )

      const result = await service.syncByState(expectedState)

      assert.equal(result.people[0].state, expectedState)
    })
  }

  for (const jurisdictionId of [
    'ocd-jurisdiction/country:us/government',
    'ocd-jurisdiction/country:us/state:california/government',
    'ocd-jurisdiction/country:us/state:ca-extra/government',
    'ocd-jurisdiction/country:us/district:ny/government',
  ]) {
    it(`não persiste uma jurisdição inválida: ${jurisdictionId}`, async (t) => {
      const { service, repository, fetchMock } = setup(t)
      fetchMock.mock.mockImplementation(async () =>
        jsonResponse(
          makeOpenStatesPage([
            makeOpenStatesPerson(),
            makeOpenStatesPerson({
              jurisdiction: { id: jurisdictionId, name: 'Unknown' },
            }),
          ]),
        ),
      )

      await assert.rejects(service.syncByState('CA'), {
        message: `Cannot extract state of jurisdiction: ${jurisdictionId}`,
      })
      assert.equal(repository.upsertMany.mock.callCount(), 0)
    })
  }

  for (const status of [401, 429, 500]) {
    it(`propaga o status HTTP ${status} sem persistir dados`, async (t) => {
      const { service, repository, fetchMock } = setup(t)
      fetchMock.mock.mockImplementation(async () => new Response('Erro', { status }))

      await assert.rejects(service.syncByState('CA'), {
        message: `OpenStates respondeu com status ${status}`,
      })
      assert.equal(fetchMock.mock.callCount(), 1)
      assert.equal(repository.upsertMany.mock.callCount(), 0)
    })
  }

  it('aguarda e repete uma página limitada pela OpenStates', async (t) => {
    const wait = t.mock.fn<(milliseconds: number) => Promise<void>>(async () =>
      Promise.resolve(),
    )
    const { service, repository, fetchMock } = setup(t, 'unit-test-api-key', {
      maxRateLimitRetries: 1,
      sleep: wait,
    })
    fetchMock.mock.mockImplementationOnce(
      async () =>
        new Response('Limite excedido', {
          status: 429,
          headers: { 'Retry-After': '2' },
        }),
      0,
    )
    fetchMock.mock.mockImplementationOnce(
      async () => jsonResponse(makeOpenStatesPage()),
      1,
    )

    assert.deepEqual(await service.syncByState('CA'), {
      fetched: 1,
      people: [makePerson()],
    })
    assert.equal(fetchMock.mock.callCount(), 2)
    assert.deepEqual(wait.mock.calls[0].arguments, [2_000])
    assert.equal(repository.upsertMany.mock.callCount(), 1)
  })

  it('aguarda um minuto quando o 429 não informa Retry-After', async (t) => {
    const wait = t.mock.fn<(milliseconds: number) => Promise<void>>(async () =>
      Promise.resolve(),
    )
    const { service, fetchMock } = setup(t, 'unit-test-api-key', {
      maxRateLimitRetries: 1,
      sleep: wait,
    })
    fetchMock.mock.mockImplementationOnce(
      async () => new Response('Limite excedido', { status: 429 }),
      0,
    )
    fetchMock.mock.mockImplementationOnce(
      async () => jsonResponse(makeOpenStatesPage()),
      1,
    )

    await service.syncByState('CA')

    assert.deepEqual(wait.mock.calls[0].arguments, [60_000])
  })

  it('propaga erros de rede sem persistir dados', async (t) => {
    const { service, repository, fetchMock } = setup(t)
    const error = new TypeError('Falha de rede simulada')
    fetchMock.mock.mockImplementation(async () => {
      throw error
    })

    await assert.rejects(service.syncByState('CA'), (reason) => reason === error)
    assert.equal(repository.upsertMany.mock.callCount(), 0)
  })

  it('propaga o timeout sem aguardar quinze segundos', async (t) => {
    const { service, repository, fetchMock } = setup(t)
    const error = new DOMException('Tempo esgotado', 'TimeoutError')
    const signal = AbortSignal.abort(error)
    t.mock.method(AbortSignal, 'timeout', () => signal)
    fetchMock.mock.mockImplementation(async (_input, options) => {
      assert.equal(options?.signal, signal)
      throw signal.reason
    })

    await assert.rejects(service.syncByState('CA'), (reason) => reason === error)
    assert.equal(repository.upsertMany.mock.callCount(), 0)
  })

  it('rejeita JSON malformado sem persistir dados', async (t) => {
    const { service, repository, fetchMock } = setup(t)
    fetchMock.mock.mockImplementation(async () => new Response('{'))

    await assert.rejects(service.syncByState('CA'), SyntaxError)
    assert.equal(repository.upsertMany.mock.callCount(), 0)
  })

  const invalidResponses: [string, unknown][] = [
    ['results ausente', { pagination: { page: 1, max_page: 1 } }],
    ['results não é uma lista', { ...makeOpenStatesPage(), results: null }],
    ['pagination ausente', { results: [] }],
    ['pessoa incompleta', makeOpenStatesPage([{ id: 'ocd-person/incomplete' }])],
    ['partido nulo', makeOpenStatesPage([{ ...makeOpenStatesPerson(), party: null }])],
    [
      'jurisdição sem identificador',
      makeOpenStatesPage([
        { ...makeOpenStatesPerson(), jurisdiction: { name: 'California' } },
      ]),
    ],
    ['page fracionada', makeOpenStatesPage([], 1.5, 2)],
    ['max_page fracionada', makeOpenStatesPage([], 1, 2.5)],
  ]

  for (const [description, body] of invalidResponses) {
    it(`rejeita a resposta da OpenStates com ${description}`, async (t) => {
      const { service, repository, fetchMock } = setup(t)
      fetchMock.mock.mockImplementation(async () => jsonResponse(body))

      await assert.rejects(service.syncByState('CA'), ZodError)
      assert.equal(repository.upsertMany.mock.callCount(), 0)
    })
  }

  for (const [description, response] of [
    ['erro HTTP', () => new Response('Erro', { status: 503 })],
    ['resposta inválida', () => jsonResponse({ results: [] })],
  ] as const) {
    it(`não salva dados parciais após ${description} na página 2`, async (t) => {
      const { service, repository, fetchMock } = setup(t)
      fetchMock.mock.mockImplementationOnce(
        async () => jsonResponse(makeOpenStatesPage([makeOpenStatesPerson()], 1, 3)),
        0,
      )
      fetchMock.mock.mockImplementationOnce(async () => response(), 1)

      await assert.rejects(
        service.syncByState('CA'),
        description === 'erro HTTP'
          ? { message: 'OpenStates respondeu com status 503' }
          : ZodError,
      )
      assert.equal(fetchMock.mock.callCount(), 2)
      assert.equal(repository.upsertMany.mock.callCount(), 0)
    })
  }

  it('propaga a falha da persistência sem retornar sucesso', async (t) => {
    const { service, repository, fetchMock } = setup(t)
    const error = new Error('Falha na transação simulada')
    fetchMock.mock.mockImplementation(async () => jsonResponse(makeOpenStatesPage()))
    repository.upsertMany.mock.mockImplementation(async () => {
      throw error
    })

    await assert.rejects(service.syncByState('CA'), (reason) => reason === error)
    assert.equal(repository.upsertMany.mock.callCount(), 1)
  })

  it('lista o cache sem filtros e sem consultar a OpenStates', async (t) => {
    const { service, repository, fetchMock } = setup(t)
    const people = [makePerson()]
    repository.findAll.mock.mockImplementation(async () => people)

    assert.deepEqual(await service.list(), people)
    assert.equal(repository.findAll.mock.callCount(), 1)
    assert.deepEqual(repository.findAll.mock.calls[0].arguments, [{}])
    assert.equal(fetchMock.mock.callCount(), 0)
    assert.equal(repository.upsertMany.mock.callCount(), 0)
  })

  it('encaminha os filtros de estado e partido para a consulta ao cache', async (t) => {
    const { service, repository, fetchMock } = setup(t)
    const filters = { state: 'NY', party: 'Republican' }
    const people = [makePerson(filters)]
    repository.findAll.mock.mockImplementation(async () => people)

    assert.deepEqual(await service.list(filters), people)
    assert.equal(repository.findAll.mock.callCount(), 1)
    assert.deepEqual(repository.findAll.mock.calls[0].arguments, [filters])
    assert.equal(fetchMock.mock.callCount(), 0)
    assert.equal(repository.upsertMany.mock.callCount(), 0)
  })

  it('retorna uma lista vazia quando o cache não possui registros', async (t) => {
    const { service, fetchMock } = setup(t)

    assert.deepEqual(await service.list(), [])
    assert.equal(fetchMock.mock.callCount(), 0)
  })

  it('propaga erros de leitura do cache sem tentar a API externa', async (t) => {
    const { service, repository, fetchMock } = setup(t)
    const error = new Error('Falha de leitura simulada')
    repository.findAll.mock.mockImplementation(async () => {
      throw error
    })

    await assert.rejects(service.list(), (reason) => reason === error)
    assert.equal(fetchMock.mock.callCount(), 0)
    assert.equal(repository.upsertMany.mock.callCount(), 0)
  })
})
