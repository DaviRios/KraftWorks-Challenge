import type { paths } from './schema'

export type Person =
  paths['/api/people']['get']['responses'][200]['content']['application/json'][number]

export interface PeopleFilters {
  state: string
  party: string
}

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(
  /\/$/,
  '',
)

async function getErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string }
    return payload.message ?? 'Não foi possível consultar as pessoas.'
  } catch {
    return 'Não foi possível consultar as pessoas.'
  }
}

export async function getPeople({ state, party }: PeopleFilters) {
  const query = new URLSearchParams({ state })

  if (party) {
    query.set('party', party)
  }

  const response = await fetch(`${apiUrl}/api/people?${query.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }

  return (await response.json()) as Person[]
}
