import { PrismaClient } from '../generated/prisma/client.js'
import { Person } from './people.service.js'

export class PeopleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertMany(people: Person[]) {
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

  async findAll() {
    return this.prisma.person.findMany()
  }
}
