import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getPeople } from '../api/getPeople'
import { STATES } from '../constants/filters'
import { Pagination } from './Pagination'
import styles from './PeopleDirectory.module.css'
import { PeopleFilters } from './PeopleFilters'
import { PersonCard } from './PersonCard'

const PAGE_SIZE = 9
const LOADING_CARD_KEYS = [
  'loading-card-a',
  'loading-card-b',
  'loading-card-c',
  'loading-card-d',
  'loading-card-e',
  'loading-card-f',
]

function LoadingCards() {
  return (
    <div className={styles.grid} aria-label="Carregando representantes" role="status">
      {LOADING_CARD_KEYS.map((key) => (
        <div className={styles.skeleton} key={key}>
          <div />
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  )
}

export function PeopleDirectory() {
  const [state, setState] = useState('CA')
  const [party, setParty] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const peopleQuery = useQuery({
    queryKey: ['people', state, party],
    queryFn: () => getPeople({ state, party }),
    placeholderData: keepPreviousData,
  })

  const people = peopleQuery.data ?? []
  const totalPages = Math.max(1, Math.ceil(people.length / PAGE_SIZE))
  const currentPeople = people.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )
  const selectedState = STATES.find((option) => option.value === state)?.label ?? state

  function handleStateChange(nextState: string) {
    setState(nextState)
    setCurrentPage(1)
  }

  function handlePartyChange(nextParty: string) {
    setParty(nextParty)
    setCurrentPage(1)
  }

  function handlePageChange(page: number) {
    setCurrentPage(page)
    document
      .getElementById('resultados')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section className={styles.directory} id="resultados">
      <PeopleFilters
        disabled={peopleQuery.isPending}
        party={party}
        state={state}
        onPartyChange={handlePartyChange}
        onStateChange={handleStateChange}
      />

      <div className={styles.resultsHeader}>
        <div>
          <p className={styles.sectionLabel}>Representantes</p>
          <h2>{selectedState}</h2>
        </div>
        <p className={styles.resultCount} aria-live="polite">
          <span aria-hidden="true" />
          {peopleQuery.isPending
            ? 'Buscando pessoas...'
            : `${people.length} ${people.length === 1 ? 'pessoa encontrada' : 'pessoas encontradas'}`}
        </p>
      </div>

      {peopleQuery.isPending ? <LoadingCards /> : null}

      {peopleQuery.isError ? (
        <div className={styles.feedback} role="alert">
          <span className={styles.feedbackIcon} aria-hidden="true">
            !
          </span>
          <div>
            <h3>Não foi possível carregar os representantes</h3>
            <p>{peopleQuery.error.message}</p>
          </div>
          <button type="button" onClick={() => peopleQuery.refetch()}>
            Tentar novamente
          </button>
        </div>
      ) : null}

      {!peopleQuery.isPending && !peopleQuery.isError && people.length === 0 ? (
        <div className={styles.feedback}>
          <span className={styles.feedbackIcon} aria-hidden="true">
            0
          </span>
          <div>
            <h3>Nenhuma pessoa encontrada</h3>
            <p>Tente escolher outro partido ou estado para ampliar a consulta.</p>
          </div>
        </div>
      ) : null}

      {!peopleQuery.isPending && !peopleQuery.isError && people.length > 0 ? (
        <>
          <div
            className={`${styles.grid} ${peopleQuery.isFetching ? styles.isFetching : ''}`}
            aria-busy={peopleQuery.isFetching}
          >
            {currentPeople.map((person) => (
              <PersonCard key={person.id} person={person} />
            ))}
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </>
      ) : null}
    </section>
  )
}
