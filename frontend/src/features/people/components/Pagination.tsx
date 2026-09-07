import styles from './Pagination.module.css'

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

type PaginationItem = number | 'ellipsis-start' | 'ellipsis-end'

function getPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const items: PaginationItem[] = [1]

  if (currentPage > 4) items.push('ellipsis-start')

  const firstMiddlePage = Math.max(2, currentPage - 1)
  const lastMiddlePage = Math.min(totalPages - 1, currentPage + 1)

  for (let page = firstMiddlePage; page <= lastMiddlePage; page += 1) {
    items.push(page)
  }

  if (currentPage < totalPages - 3) items.push('ellipsis-end')

  items.push(totalPages)
  return items
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null

  const items = getPaginationItems(currentPage, totalPages)

  return (
    <nav className={styles.pagination} aria-label="Paginação dos resultados">
      <button
        type="button"
        aria-label="Página anterior"
        className={styles.navButton}
        disabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        ←
      </button>

      <div className={styles.pages}>
        {items.map((item) =>
          typeof item === 'number' ? (
            <button
              type="button"
              aria-current={item === currentPage ? 'page' : undefined}
              className={styles.pageButton}
              key={item}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          ) : (
            <span aria-hidden="true" className={styles.ellipsis} key={item}>
              ···
            </span>
          ),
        )}
      </div>

      <button
        type="button"
        aria-label="Próxima página"
        className={styles.navButton}
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        →
      </button>
    </nav>
  )
}
