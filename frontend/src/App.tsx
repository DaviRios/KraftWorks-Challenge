import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import styles from './App.module.css'
import { PeopleDirectory } from './features/people/components/PeopleDirectory'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 60_000,
    },
  },
})

function BrandMark() {
  return (
    <svg aria-hidden="true" className={styles.brandMark} viewBox="0 0 36 36">
      <path d="M4 8.6 16.4 3v11.1L4 19.7V8.6Z" />
      <path d="m19.6 1.6 12.4-1v11.1l-12.4 1V1.6Z" />
      <path d="M4 23.6 16.4 18v11.1L4 34.7V23.6Z" />
      <path d="m19.6 16.6 12.4-1v11.1l-12.4 5.6V16.6Z" />
    </svg>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className={styles.app}>
        <header className={styles.header}>
          <a className={styles.brand} href="#conteudo" aria-label="Representa, início">
            <BrandMark />
            <span>Representa</span>
          </a>
          <div className={styles.sourceLabel}>
            <span aria-hidden="true" />
            Dados OpenStates
          </div>
        </header>

        <main id="conteudo">
          <section className={styles.hero}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>Diretório público</p>
              <h1>
                Encontre quem
                <br />
                <span>representa você.</span>
              </h1>
              <p className={styles.intro}>
                Consulte pessoas em cargos políticos por estado e partido, de forma
                simples e direta.
              </p>
            </div>

            <div aria-hidden="true" className={styles.heroAccent}>
              <div className={styles.accentCard}>
                <span className={styles.accentValue}>50</span>
                <small>estados para explorar</small>
              </div>
              <div className={styles.accentLines} />
            </div>
          </section>

          <PeopleDirectory />
        </main>

        <footer className={styles.footer}>
          <div className={styles.footerBrand}>
            <BrandMark />
            <strong>Representa</strong>
          </div>
          <p>Informação pública, apresentada com clareza.</p>
        </footer>
      </div>
    </QueryClientProvider>
  )
}

export default App
