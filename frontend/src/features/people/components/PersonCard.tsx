import { useState } from 'react'
import type { Person } from '../api/getPeople'
import { getStateName } from '../constants/filters'
import styles from './PersonCard.module.css'

interface PersonCardProps {
  person: Person
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  return `${parts[0]?.[0] ?? ''}${parts.at(-1)?.[0] ?? ''}`.toUpperCase()
}

function getPartyTone(party: string | null) {
  const normalizedParty = party?.toLowerCase() ?? ''

  if (normalizedParty.includes('democrat')) return 'democratic'
  if (normalizedParty.includes('republican')) return 'republican'
  if (normalizedParty.includes('green')) return 'green'
  if (normalizedParty.includes('independent')) return 'independent'
  return 'neutral'
}

export function PersonCard({ person }: PersonCardProps) {
  const [hasImageError, setHasImageError] = useState(false)
  const hasImage = Boolean(person.imageUrl) && !hasImageError
  const party = person.party ?? 'Não informado'

  return (
    <article className={styles.card}>
      <div className={styles.portrait}>
        {hasImage ? (
          <img
            alt={`Retrato de ${person.name}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            src={person.imageUrl ?? undefined}
            onError={() => setHasImageError(true)}
          />
        ) : (
          <div className={styles.fallback} aria-label="Foto indisponível" role="img">
            <span>{getInitials(person.name)}</span>
          </div>
        )}

        <span className={styles.stateBadge}>{person.state}</span>
      </div>

      <div className={styles.content}>
        <p className={styles.location}>
          <svg aria-hidden="true" viewBox="0 0 20 20">
            <path
              d="M10 17s5-4.7 5-9a5 5 0 1 0-10 0c0 4.3 5 9 5 9Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle cx="10" cy="8" r="1.7" fill="currentColor" />
          </svg>
          {getStateName(person.state)}
        </p>
        <h3>{person.name}</h3>
        <div className={styles.cardFooter}>
          <span className={styles.party} data-tone={getPartyTone(person.party)}>
            <span aria-hidden="true" />
            {party}
          </span>
          <span className={styles.arrow} aria-hidden="true">
            ↗
          </span>
        </div>
      </div>
    </article>
  )
}
