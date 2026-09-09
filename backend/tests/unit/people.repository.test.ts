import assert from 'node:assert/strict'
import { describe, it, type TestContext } from 'node:test'

import { PeopleRepository } from '../../src/people.repository.js'
import type {
  ListPeopleFilters,
  Person,
  StateLastUpdate,
} from '../../src/people.types.js'
import { makePerson } from './fixtures.js'

const personSelect = {
  externalId: true,
  name: true,
  role: true,
  imageUrl: true,
  state: true,
  party: true,
}

type DatabasePerson = Omit<Person, 'id'> & {
  id: string
  externalId: string
  createdAt: Date
  updatedAt: Date
}

function makeRecord(overrides: Partial<DatabasePerson> = {}): DatabasePerson {
  const { id: externalId, ...person } = makePerson()
  return {
    ...person,
    id: 'b8e70dba-fdf4-4b12-a81c-92dce8d011e1',
    externalId,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  }
}

function setup(
  t: TestContext,
  records: DatabasePerson[] = [],
  stateUpdates: StateLastUpdate[] = [],
) {
  // Somente os métodos usados pelo repositório: nenhum PrismaClient é criado.
  const prisma = {
    person: {
      upsert: t.mock.fn((_args: unknown) => Promise.resolve(undefined)),
      findMany: t.mock.fn(async (_args: unknown) => records),
      groupBy: t.mock.fn(async (_args: unknown) =>
        stateUpdates.map(({ state, updatedAt }) => ({
          state,
          _max: { updatedAt },
        })),
      ),
    },
    $transaction: t.mock.fn(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  }
  const repository = new PeopleRepository(
    prisma as unknown as ConstructorParameters<typeof PeopleRepository>[0],
  )

  return { repository, prisma }
}

describe('PeopleRepository.updatesByState', () => {
  it('retorna a atualização mais recente agrupada por estado', async (t) => {
    const updates = [
      {
        state: 'CA',
        updatedAt: new Date('2026-09-08T12:00:00.000Z'),
      },
      {
        state: 'DC',
        updatedAt: null,
      },
    ]
    const { repository, prisma } = setup(t, [], updates)

    assert.deepEqual(await repository.updatesByState(), updates)
    assert.equal(prisma.person.groupBy.mock.callCount(), 1)
    assert.deepEqual(prisma.person.groupBy.mock.calls[0].arguments, [
      {
        by: ['state'],
        _max: {
          updatedAt: true,
        },
      },
    ])
  })
})

describe('PeopleRepository.upsertMany', () => {
  it('usa o ID externo e mapeia criação e atualização', async (t) => {
    const { repository, prisma } = setup(t)

    assert.equal(await repository.upsertMany([makePerson()]), undefined)

    assert.equal(prisma.person.upsert.mock.callCount(), 1)
    assert.deepEqual(prisma.person.upsert.mock.calls[0].arguments, [
      {
        where: { externalId: 'ocd-person/jane-doe' },
        create: {
          externalId: 'ocd-person/jane-doe',
          name: 'Jane Doe',
          role: 'Senator',
          imageUrl: 'https://example.com/jane.jpg',
          state: 'CA',
          party: 'Democratic',
        },
        update: {
          name: 'Jane Doe',
          role: 'Senator',
          imageUrl: 'https://example.com/jane.jpg',
          state: 'CA',
          party: 'Democratic',
        },
      },
    ])
    assert.equal(prisma.$transaction.mock.callCount(), 1)
    const [operations] = prisma.$transaction.mock.calls[0].arguments
    assert.equal(operations.length, 1)
    assert.equal(operations[0], prisma.person.upsert.mock.calls[0].result)
  })

  it('encaminha todos os upserts para uma única transação', async (t) => {
    const { repository, prisma } = setup(t)
    const people = [
      makePerson(),
      makePerson({ id: 'ocd-person/john-doe', name: 'John Doe', state: 'NY' }),
    ]

    await repository.upsertMany(people)

    assert.equal(prisma.person.upsert.mock.callCount(), 2)
    assert.equal(prisma.$transaction.mock.callCount(), 1)
    const [operations] = prisma.$transaction.mock.calls[0].arguments
    assert.equal(operations.length, 2)
    for (const [index, call] of prisma.person.upsert.mock.calls.entries()) {
      assert.equal(operations[index], call.result)
      const { id: externalId, ...fields } = people[index]
      assert.deepEqual(call.arguments, [
        {
          where: { externalId },
          create: { externalId, ...fields },
          update: fields,
        },
      ])
    }
    assert.equal(prisma.person.findMany.mock.callCount(), 0)
  })

  it('preserva valores nulos na criação e atualização', async (t) => {
    const { repository, prisma } = setup(t)

    await repository.upsertMany([
      makePerson({ role: null, imageUrl: null, party: null }),
    ])

    assert.deepEqual(prisma.person.upsert.mock.calls[0].arguments, [
      {
        where: { externalId: 'ocd-person/jane-doe' },
        create: {
          externalId: 'ocd-person/jane-doe',
          name: 'Jane Doe',
          role: null,
          imageUrl: null,
          state: 'CA',
          party: null,
        },
        update: {
          name: 'Jane Doe',
          role: null,
          imageUrl: null,
          state: 'CA',
          party: null,
        },
      },
    ])
  })

  it('aceita uma lista vazia sem criar operações de upsert', async (t) => {
    const { repository, prisma } = setup(t)

    await repository.upsertMany([])

    assert.equal(prisma.person.upsert.mock.callCount(), 0)
    assert.equal(prisma.$transaction.mock.callCount(), 1)
    assert.deepEqual(prisma.$transaction.mock.calls[0].arguments, [[]])
  })

  it('propaga uma rejeição da transação', async (t) => {
    const { repository, prisma } = setup(t)
    const error = new Error('Transação recusada')
    prisma.$transaction.mock.mockImplementation(async () => {
      throw error
    })

    await assert.rejects(
      repository.upsertMany([makePerson()]),
      (reason) => reason === error,
    )
    assert.equal(prisma.$transaction.mock.callCount(), 1)
  })

  it('propaga uma falha ao montar o upsert sem iniciar a transação', async (t) => {
    const { repository, prisma } = setup(t)
    const error = new Error('Argumentos de upsert recusados')
    prisma.person.upsert.mock.mockImplementation(() => {
      throw error
    })

    await assert.rejects(
      repository.upsertMany([makePerson()]),
      (reason) => reason === error,
    )
    assert.equal(prisma.$transaction.mock.callCount(), 0)
  })
})

describe('PeopleRepository.findAll', () => {
  it('consulta sem filtros, ordena por nome e retorna campos públicos', async (t) => {
    const { repository, prisma } = setup(t, [makeRecord()])

    assert.deepEqual(await repository.findAll(), [makePerson()])
    assert.equal(prisma.person.findMany.mock.callCount(), 1)
    assert.deepEqual(prisma.person.findMany.mock.calls[0].arguments, [
      { where: {}, orderBy: { name: 'asc' }, select: personSelect },
    ])
    assert.equal(prisma.person.upsert.mock.callCount(), 0)
    assert.equal(prisma.$transaction.mock.callCount(), 0)
  })

  it('retorna o ID externo e preserva campos nulos', async (t) => {
    const { repository } = setup(t, [
      makeRecord(),
      makeRecord({
        id: '76a23d6b-4e6c-4194-aad9-912d686c843b',
        externalId: 'ocd-person/john-doe',
        name: 'John Doe',
        role: null,
        imageUrl: null,
        party: null,
      }),
    ])

    assert.deepEqual(await repository.findAll(), [
      makePerson(),
      makePerson({
        id: 'ocd-person/john-doe',
        name: 'John Doe',
        role: null,
        imageUrl: null,
        party: null,
      }),
    ])
  })

  const filterCases: [string, ListPeopleFilters, unknown][] = [
    ['estado', { state: 'CA' }, { state: 'CA' }],
    [
      'partido sem diferenciar maiúsculas',
      { party: 'dEmOcRaTiC' },
      { party: { equals: 'dEmOcRaTiC', mode: 'insensitive' } },
    ],
    [
      'estado e partido juntos',
      { state: 'NY', party: 'Republican' },
      { state: 'NY', party: { equals: 'Republican', mode: 'insensitive' } },
    ],
    ['filtros vazios', { state: '', party: '' }, {}],
  ]

  for (const [description, filters, expectedWhere] of filterCases) {
    it(`monta a consulta com ${description}`, async (t) => {
      const { repository, prisma } = setup(t)

      await repository.findAll(filters)

      assert.equal(prisma.person.findMany.mock.callCount(), 1)
      assert.deepEqual(prisma.person.findMany.mock.calls[0].arguments, [
        { where: expectedWhere, orderBy: { name: 'asc' }, select: personSelect },
      ])
    })
  }

  it('retorna uma lista vazia quando a consulta não encontra registros', async (t) => {
    const { repository } = setup(t)

    assert.deepEqual(await repository.findAll({ state: 'CA' }), [])
  })

  it('propaga falhas de leitura do Prisma', async (t) => {
    const { repository, prisma } = setup(t)
    const error = new Error('Leitura recusada')
    prisma.person.findMany.mock.mockImplementation(async () => {
      throw error
    })

    await assert.rejects(repository.findAll(), (reason) => reason === error)
  })
})
