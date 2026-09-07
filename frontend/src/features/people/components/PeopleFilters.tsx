import { PARTIES, STATES } from '../constants/filters'
import styles from './PeopleFilters.module.css'

interface PeopleFiltersProps {
  state: string
  party: string
  disabled?: boolean
  onStateChange: (state: string) => void
  onPartyChange: (party: string) => void
}

function SelectChevron() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export function PeopleFilters({
  state,
  party,
  disabled,
  onStateChange,
  onPartyChange,
}: PeopleFiltersProps) {
  return (
    <form className={styles.filters} aria-label="Filtros de representantes">
      <div className={styles.filterIntro}>
        <span className={styles.filterIcon} aria-hidden="true">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path
              d="M4 6h16M7 12h10m-7 6h4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.8"
            />
          </svg>
        </span>
        <div>
          <strong>Refine sua consulta</strong>
          <small>Atualização automática</small>
        </div>
      </div>

      <label className={styles.field}>
        <span>Estado</span>
        <span className={styles.selectWrap}>
          <select
            aria-label="Filtrar por estado"
            disabled={disabled}
            value={state}
            onChange={(event) => onStateChange(event.target.value)}
          >
            {STATES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <SelectChevron />
        </span>
      </label>

      <label className={styles.field}>
        <span>Partido</span>
        <span className={styles.selectWrap}>
          <select
            aria-label="Filtrar por partido"
            disabled={disabled}
            value={party}
            onChange={(event) => onPartyChange(event.target.value)}
          >
            {PARTIES.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <SelectChevron />
        </span>
      </label>
    </form>
  )
}
