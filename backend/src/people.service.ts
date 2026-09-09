import { z } from 'zod'
import type { PeopleRepository } from './people.repository.js'
import type { ListPeopleFilters, Person } from './people.types.js'

const OPENSTATES_PER_PAGE = 50
const DEFAULT_RATE_LIMIT_RETRIES = 3
const DEFAULT_RATE_LIMIT_WAIT_MS = 60_000
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000

type Sleep = (milliseconds: number) => Promise<void>
type Now = () => Date

export interface PeopleServiceOptions {
  maxRateLimitRetries?: number
  sleep?: Sleep
  now?: Now
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

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
        id: z.string(),
        name: z.string(),
      }),
    }),
  ),
  pagination: z.object({
    page: z.number().int(),
    max_page: z.number().int(),
  }),
})

export interface SyncPeopleResult {
  fetched: number
  people: Person[]
}

export interface SyncAllPeopleResult {
  fetched: number
  states: number
}

export class SyncAlreadyRunningError extends Error {
  constructor() {
    super('A synchronization is already running')
    this.name = 'SyncAlreadyRunningError'
  }
}

export const US_STATE_CODES = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  'DC',
] as const

export class PeopleService {
  private readonly maxRateLimitRetries: number
  private readonly sleep: Sleep
  private readonly now: Now
  private syncInProgress = false

  constructor(
    private readonly apiKey: string,
    private readonly peopleRepository: PeopleRepository,
    options: PeopleServiceOptions = {},
  ) {
    if (!apiKey) {
      throw new Error('OPENSTATES_API_KEY não configurada')
    }

    this.maxRateLimitRetries = options.maxRateLimitRetries ?? DEFAULT_RATE_LIMIT_RETRIES
    this.sleep = options.sleep ?? sleep
    this.now = options.now ?? (() => new Date())
  }

  private extractStateCode(jurisdictionId: string): string {
    const stateCode =
      jurisdictionId.match(/\/state:([a-z]{2})(?:\/|$)/i)?.[1] ??
      jurisdictionId.match(/\/district:(dc)(?:\/|$)/i)?.[1]

    if (!stateCode) {
      throw new Error(`Cannot extract state of jurisdiction: ${jurisdictionId}`)
    }

    return stateCode.toUpperCase()
  }

  async syncAll(): Promise<SyncAllPeopleResult> {
    if (this.syncInProgress) {
      throw new SyncAlreadyRunningError()
    }

    this.syncInProgress = true

    try {
      const cutoff = new Date(this.now().getTime() - CACHE_MAX_AGE_MS)
      const updates = await this.peopleRepository.updatesByState()
      const updatesByState = new Map(
        updates.map(({ state, updatedAt }) => [state, updatedAt]),
      )
      let fetched = 0
      let states = 0

      for (const state of US_STATE_CODES) {
        const lastUpdatedAt = updatesByState.get(state)
        const isStale = !lastUpdatedAt || lastUpdatedAt < cutoff

        if (isStale) {
          const result = await this.syncByState(state)
          fetched += result.fetched
          states++
        }
      }

      return {
        fetched,
        states,
      }
    } finally {
      this.syncInProgress = false
    }
  }

  async syncByState(state: string): Promise<SyncPeopleResult> {
    const results: z.infer<typeof openStatesResponseSchema>['results'] = []
    let page = 1
    let maxPage = 1

    do {
      const response = await this.fetchPage(state, page)
      results.push(...response.results)
      maxPage = response.pagination.max_page
      page++
    } while (page <= maxPage)

    const people: Person[] = results.map((person) => ({
      id: person.id,
      name: person.name,
      role: person.current_role?.title ?? null,
      imageUrl: person.image ?? null,
      state: this.extractStateCode(person.jurisdiction.id),
      party: person.party,
    }))

    await this.peopleRepository.upsertMany(people)

    return {
      fetched: people.length,
      people,
    }
  }

  private async fetchPage(state: string, page: number) {
    const url = new URL('https://v3.openstates.org/people')

    url.searchParams.set('jurisdiction', state)
    url.searchParams.set('page', String(page))
    url.searchParams.set('per_page', String(OPENSTATES_PER_PAGE))

    let rateLimitRetries = 0

    while (true) {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'X-API-KEY': this.apiKey,
        },
        signal: AbortSignal.timeout(15_000),
      })

      if (response.status === 429 && rateLimitRetries < this.maxRateLimitRetries) {
        rateLimitRetries++
        await this.sleep(this.getRetryDelayMilliseconds(response))
        continue
      }

      if (!response.ok) {
        throw new Error(`OpenStates respondeu com status ${response.status}`)
      }

      return openStatesResponseSchema.parse(await response.json())
    }
  }

  private getRetryDelayMilliseconds(response: Response): number {
    const retryAfter = response.headers.get('retry-after')

    if (!retryAfter) {
      return DEFAULT_RATE_LIMIT_WAIT_MS
    }

    const seconds = Number(retryAfter)

    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1_000
    }

    const retryAt = Date.parse(retryAfter)

    if (Number.isNaN(retryAt)) {
      return DEFAULT_RATE_LIMIT_WAIT_MS
    }

    return Math.max(retryAt - Date.now(), 0)
  }

  async list(filters: ListPeopleFilters = {}): Promise<Person[]> {
    return this.peopleRepository.findAll(filters)
  }
}
