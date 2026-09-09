import assert from 'node:assert/strict'
import { describe, it, type TestContext } from 'node:test'
import type { FastifyInstance } from 'fastify'
import type { ZodType } from 'zod'

import { peopleController } from '../../src/people.controller.js'
import {
  type PeopleService,
  SyncAlreadyRunningError,
  US_STATE_CODES,
} from '../../src/people.service.js'
import type { ListPeopleFilters } from '../../src/people.types.js'
import { makePerson } from './fixtures.js'

interface UnitRequest {
  body: ListPeopleFilters
  query: ListPeopleFilters
  log: { error(details: unknown, message: string): void }
}

interface UnitReply {
  code(statusCode: number): UnitReply
  send(payload: unknown): UnitReply
}

interface CapturedRoute {
  schema: {
    body?: ZodType
    querystring?: ZodType
    response: Record<number, ZodType>
  }
  handler(request: UnitRequest, reply: UnitReply): Promise<unknown>
}

async function setup(t: TestContext) {
  const routes = new Map<string, CapturedRoute>()
  const service = {
    syncAll: t.mock.fn<PeopleService['syncAll']>(async () => ({
      fetched: 0,
      states: 0,
    })),
    list: t.mock.fn<PeopleService['list']>(async () => []),
  }
  // Captura schemas e handlers sem criar Fastify, servidor HTTP ou sockets.
  const app = {
    withTypeProvider() {
      return this
    },
    post(
      path: string,
      options: Pick<CapturedRoute, 'schema'>,
      handler: CapturedRoute['handler'],
    ) {
      routes.set(`POST ${path}`, { schema: options.schema, handler })
    },
    get(
      path: string,
      options: Pick<CapturedRoute, 'schema'>,
      handler: CapturedRoute['handler'],
    ) {
      routes.set(`GET ${path}`, { schema: options.schema, handler })
    },
  }
  const logError = t.mock.fn<(details: unknown, message: string) => void>()
  const request: UnitRequest = {
    body: { state: 'CA' },
    query: { state: 'CA' },
    log: { error: logError },
  }
  const reply = {
    statusCode: 200,
    payload: undefined as unknown,
    code(statusCode: number) {
      this.statusCode = statusCode
      return this
    },
    send(payload: unknown) {
      this.payload = payload
      return this
    },
  }

  await peopleController(app as unknown as FastifyInstance, {
    peopleService: service as unknown as PeopleService,
  })

  function route(key: string): CapturedRoute {
    const captured = routes.get(key)
    assert.ok(captured, `Rota não registrada: ${key}`)
    return captured
  }

  return { routes, route, service, request, reply, logError }
}

describe('peopleController', () => {
  it('registra as rotas de consulta e sincronização', async (t) => {
    const { routes } = await setup(t)

    assert.deepEqual([...routes.keys()].sort(), ['GET /people', 'POST /people/sync'])
  })

  it('sincroniza todos os estados e envia o resumo com status 200', async (t) => {
    const { route, service, request, reply, logError } = await setup(t)
    const sync = route('POST /people/sync')
    assert.equal(sync.schema.body, undefined)
    const result = { fetched: 123, states: US_STATE_CODES.length }
    service.syncAll.mock.mockImplementation(async () => result)

    assert.equal(await sync.handler(request, reply), reply)
    assert.equal(reply.statusCode, 200)
    assert.deepEqual(reply.payload, result)
    assert.equal(service.syncAll.mock.callCount(), 1)
    assert.deepEqual(service.syncAll.mock.calls[0].arguments, [])
    assert.equal(service.list.mock.callCount(), 0)
    assert.equal(logError.mock.callCount(), 0)
  })

  it('envia sucesso também quando a sincronização não encontra pessoas', async (t) => {
    const { route, request, reply } = await setup(t)

    await route('POST /people/sync').handler(request, reply)

    assert.equal(reply.statusCode, 200)
    assert.deepEqual(reply.payload, {
      fetched: 0,
      states: 0,
    })
  })

  it('responde 409 quando uma sincronização já está em andamento', async (t) => {
    const { route, service, request, reply, logError } = await setup(t)
    service.syncAll.mock.mockImplementation(async () => {
      throw new SyncAlreadyRunningError()
    })

    assert.equal(await route('POST /people/sync').handler(request, reply), reply)
    assert.equal(reply.statusCode, 409)
    assert.deepEqual(reply.payload, {
      message: 'A synchronization is already running',
    })
    assert.equal(logError.mock.callCount(), 0)
  })

  for (const error of [new Error('Detalhes internos da falha'), 'Falha sem Error']) {
    it(`responde 502 e registra a falha: ${String(error)}`, async (t) => {
      const { route, service, request, reply, logError } = await setup(t)
      service.syncAll.mock.mockImplementation(async () => {
        throw error
      })

      assert.equal(await route('POST /people/sync').handler(request, reply), reply)
      assert.equal(reply.statusCode, 502)
      assert.deepEqual(reply.payload, {
        message: 'Failed to sync people from OpenStates API',
      })
      assert.equal(logError.mock.callCount(), 1)
      assert.deepEqual(logError.mock.calls[0].arguments, [
        { err: error },
        'Failed to sync people from OpenStates API',
      ])
      assert.equal(service.syncAll.mock.callCount(), 1)
      assert.equal(service.list.mock.callCount(), 0)
    })
  }

  it('encaminha os filtros normalizados e envia a lista com status 200', async (t) => {
    const { route, service, request, reply } = await setup(t)
    const list = route('GET /people')
    assert.ok(list.schema.querystring)
    request.query = list.schema.querystring.parse({
      state: ' ny ',
      party: ' Republican ',
    }) as ListPeopleFilters
    const people = [makePerson({ state: 'NY', party: 'Republican' })]
    service.list.mock.mockImplementation(async () => people)

    assert.equal(await list.handler(request, reply), reply)
    assert.equal(reply.statusCode, 200)
    assert.deepEqual(reply.payload, people)
    assert.equal(service.list.mock.callCount(), 1)
    assert.deepEqual(service.list.mock.calls[0].arguments, [
      { state: 'NY', party: 'Republican' },
    ])
    assert.equal(service.syncAll.mock.callCount(), 0)
  })

  it('envia uma lista vazia quando o serviço não encontra pessoas', async (t) => {
    const { route, service, request, reply } = await setup(t)

    await route('GET /people').handler(request, reply)

    assert.equal(reply.statusCode, 200)
    assert.deepEqual(reply.payload, [])
    assert.deepEqual(service.list.mock.calls[0].arguments, [{ state: 'CA' }])
    assert.equal(service.syncAll.mock.callCount(), 0)
  })

  it('delega ao chamador o tratamento de erros do handler de listagem', async (t) => {
    const { route, service, request, reply } = await setup(t)
    const error = new Error('Falha ao consultar o cache')
    service.list.mock.mockImplementation(async () => {
      throw error
    })

    await assert.rejects(
      route('GET /people').handler(request, reply),
      (reason) => reason === error,
    )
    assert.equal(reply.payload, undefined)
    assert.equal(service.syncAll.mock.callCount(), 0)
  })
})

for (const [routeKey, schemaKey] of [['GET /people', 'querystring']] as const) {
  describe(`Schema de entrada de ${routeKey}`, () => {
    it('normaliza a sigla e aceita um partido opcional', async (t) => {
      const { route } = await setup(t)
      const schema = route(routeKey).schema[schemaKey]
      assert.ok(schema)

      assert.deepEqual(schema.parse({ state: ' ca ', party: ' Democratic ' }), {
        state: 'CA',
        party: 'Democratic',
      })
      assert.deepEqual(schema.parse({ state: 'ny' }), { state: 'NY' })
      assert.deepEqual(schema.parse({ state: 'CA', party: '  ' }), {
        state: 'CA',
        party: '',
      })
    })

    const invalidInputs: [string, unknown][] = [
      ['payload ausente', undefined],
      ['estado ausente', {}],
      ['estado nulo', { state: null }],
      ['estado numérico', { state: 12 }],
      ['estado vazio', { state: '  ' }],
      ['estado com uma letra', { state: 'C' }],
      ['estado com três letras', { state: 'CAL' }],
      ['estado com número', { state: 'C1' }],
      ['estado com pontuação', { state: 'C!' }],
      ['estado com acento', { state: 'ÇA' }],
    ]

    for (const [description, input] of invalidInputs) {
      it(`rejeita ${description}`, async (t) => {
        const { route } = await setup(t)
        const schema = route(routeKey).schema[schemaKey]
        assert.ok(schema)

        assert.equal(schema.safeParse(input).success, false)
      })
    }

    it('rejeita partido com tipo diferente de string', async (t) => {
      const { route } = await setup(t)
      const schema = route(routeKey).schema[schemaKey]
      assert.ok(schema)

      for (const party of [null, 123, true, [], {}]) {
        assert.equal(schema.safeParse({ state: 'CA', party }).success, false)
      }
    })
  })
}

describe('Schemas de resposta de peopleController', () => {
  it('aceita pessoas com cargo, foto e partido nulos na consulta', async (t) => {
    const { route } = await setup(t)
    const people = [makePerson({ role: null, imageUrl: null, party: null })]

    assert.deepEqual(route('GET /people').schema.response[200].parse(people), people)
  })

  it('valida as contagens do resumo da sincronização', async (t) => {
    const { route } = await setup(t)
    const schema = route('POST /people/sync').schema.response[200]

    assert.deepEqual(schema.parse({ fetched: 0, states: US_STATE_CODES.length }), {
      fetched: 0,
      states: US_STATE_CODES.length,
    })
    assert.deepEqual(schema.parse({ fetched: 0, states: 0 }), {
      fetched: 0,
      states: 0,
    })
    for (const fetched of [-1, 1.5, '1', null, undefined]) {
      assert.equal(
        schema.safeParse({ fetched, states: US_STATE_CODES.length }).success,
        false,
      )
    }
    for (const states of [-1, 1.5, '51', null, undefined]) {
      assert.equal(schema.safeParse({ fetched: 0, states }).success, false)
    }
  })

  it('rejeita pessoas sem os campos obrigatórios ou com estado inválido', async (t) => {
    const { route } = await setup(t)
    const listSchema = route('GET /people').schema.response[200]

    for (const person of [{ id: 'incomplete' }, makePerson({ state: 'California' })]) {
      assert.equal(listSchema.safeParse([person]).success, false)
    }
  })
})
