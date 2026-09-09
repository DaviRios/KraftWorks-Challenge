import type { PrismaClient } from '../generated/prisma/client.js'
import type { ListPeopleFilters, Person, StateLastUpdate } from './people.types.js'

export class PeopleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async updatesByState(): Promise<StateLastUpdate[]> {
    const updates = await this.prisma.person.groupBy({
      by: ['state'],
      _max: {
        updatedAt: true,
      },
    })

    return updates.map((update) => ({
      state: update.state,
      updatedAt: update._max.updatedAt,
    }))
  }

  async upsertMany(people: Person[]): Promise<void> {
    await this.prisma.$transaction(
      people.map((person) =>
        this.prisma.person.upsert({
          where: {
            externalId: person.id,
          },
          create: {
            externalId: person.id,
            name: person.name,
            role: person.role,
            imageUrl: person.imageUrl,
            state: person.state,
            party: person.party,
          },
          update: {
            name: person.name,
            role: person.role,
            imageUrl: person.imageUrl,
            state: person.state,
            party: person.party,
          },
        }),
      ),
    )
  }

  async findAll(filters: ListPeopleFilters = {}): Promise<Person[]> {
    const records = await this.prisma.person.findMany({
      where: {
        ...(filters.state
          ? {
              state: filters.state,
            }
          : {}),
        ...(filters.party
          ? {
              party: {
                equals: filters.party,
                mode: 'insensitive',
              },
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      select: {
        externalId: true,
        name: true,
        role: true,
        imageUrl: true,
        state: true,
        party: true,
      },
    })

    return records.map((person) => ({
      id: person.externalId,
      name: person.name,
      role: person.role,
      imageUrl: person.imageUrl,
      state: person.state,
      party: person.party,
    }))
  }
}
