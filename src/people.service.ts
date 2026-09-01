import { z } from 'zod'

const openStatesResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      party: z.string(),
      image: z.string().nullish(),
      current_role: z
        .object({
          title: z.string(),
        })
        .nullish(),
      jurisdiction: z.object({
        name: z.string(),
      }),
    }),
  ),
  pagination: z.object({
    page: z.number().int(),
    max_page: z.number().int(),
  }),
})

export interface Person {
  id: string
  name: string
  role: string | null
  imageUrl: string | null
  state: string
  party: string
}

export interface FetchPeopleResult {
  fetched: number
  people: Person[]
}

export class PeopleService {
  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error('OPENSTATES_API_KEY não configurada')
    }
  }

  async fetchByState(state: string): Promise<FetchPeopleResult> {
    const results: z.infer<typeof openStatesResponseSchema>['results'] = []
    let page = 1
    let maxPage = 5

    //do {
    const response = await this.fetchPage(state, page)
    //results.push(...response.results)
    //maxPage = response.pagination.max_page
    //page++
    //} while (page <= maxPage)

    const people: Person[] = response.results.map((person) => ({
      id: person.id,
      name: person.name,
      role: person.current_role?.title ?? null,
      imageUrl: person.image || null,
      state: person.jurisdiction.name,
      party: person.party,
    }))

    return {
      fetched: people.length,
      people,
    }
  }

  private async fetchPage(state: string, page: number) {
    const url = new URL('https://v3.openstates.org/people')

    url.searchParams.set('jurisdiction', state)
    url.searchParams.set('page', String(page))
    url.searchParams.set('per_page', '10')

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-API-KEY': this.apiKey,
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      throw new Error(`OpenStates respondeu com status ${response.status}`)
    }

    return openStatesResponseSchema.parse(await response.json())
  }
}
