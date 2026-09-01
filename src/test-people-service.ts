import { PeopleService } from './people.service.js'

async function main() {
  const apiKey = process.env.OPENSTATES_API_KEY

  if (!apiKey) {
    throw new Error('OPENSTATES_API_KEY não configurada')
  }

  const peopleService = new PeopleService(apiKey)

  const response = await peopleService.fetchByState('California')

  console.log(`Quantidade recebida: ${response.fetched}`)

  console.table(
    response.people.map((person) => ({
      name: person.name,
      party: person.party,
      role: person.role,
      state: person.state,
    })),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
