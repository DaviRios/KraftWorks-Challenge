import type { Person } from '../../src/people.types.js'

interface OpenStatesPerson {
  id: string
  name: string
  party: string
  image?: string | null
  current_role?: { title: string } | null
  jurisdiction: { id: string; name: string }
}

export function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'ocd-person/jane-doe',
    name: 'Jane Doe',
    role: 'Senator',
    imageUrl: 'https://example.com/jane.jpg',
    state: 'CA',
    party: 'Democratic',
    ...overrides,
  }
}

export function makeOpenStatesPerson(
  overrides: Partial<OpenStatesPerson> = {},
): OpenStatesPerson {
  return {
    id: 'ocd-person/jane-doe',
    name: 'Jane Doe',
    party: 'Democratic',
    image: 'https://example.com/jane.jpg',
    current_role: { title: 'Senator' },
    jurisdiction: {
      id: 'ocd-jurisdiction/country:us/state:ca/government',
      name: 'California',
    },
    ...overrides,
  }
}

export function makeOpenStatesPage(
  results: unknown[] = [makeOpenStatesPerson()],
  page = 1,
  maxPage = 1,
) {
  return { results, pagination: { page, max_page: maxPage } }
}
