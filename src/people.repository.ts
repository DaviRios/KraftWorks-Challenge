import { PrismaClient } from '../generated/prisma/client.js'
import type { ListPeopleFilters, Person } from './people.service.js'

export class PeopleRepository {
  constructor(private readonly prisma: PrismaClient) {}

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
      orderBy: {
        name: 'asc',
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
