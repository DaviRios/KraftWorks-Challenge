export interface ListPeopleFilters {
  state?: string
  party?: string
}

export interface StateLastUpdate {
  state: string
  updatedAt: Date | null
}

export interface Person {
  id: string
  name: string
  role: string | null
  imageUrl: string | null
  state: string
  party: string | null
}
