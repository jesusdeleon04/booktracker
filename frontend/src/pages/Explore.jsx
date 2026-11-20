import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { useStore } from '../store/useStore'
import { api } from '../lib/api'
import RecCard, { RecCardSkeleton } from '../components/book/RecCard'
import { EmptyState, Spinner } from '../components/ui/Bits'
import NotFound from './NotFound'

const KIND_LABEL = { genre: 'Género', mood: 'Estado de ánimo', theme: 'Tema' }

export default function Explore() {
  const { kind, key } = useParams()
  const meta = useStore((s) => s.meta)
  const [items, setItems] = useState(null)
  const [page, setPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)

  const entry =
    kind === 'genre'
      ? meta.genres.find((g) => g.key === key)
      : kind === 'mood'
        ? meta.moods.find((m) => m.key === key)
        : kind === 'theme'
          ? meta.themes.find((t) => t.key === key)
          : null

  useEffect(() => {
    if (!entry) return
    let alive = true
    setItems(null)
    setPage(1)
    setError(null)
    api
      .explore(kind, key, 1)
      .then((d) => alive && setItems(d.items))
      .catch((e) => alive && (setError(e.message), setItems([])))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, key])

  if (!entry) return <NotFound />

  const more = async () => {
    setLoadingMore(true)
    try {
      const d = await api.explore(kind, key, page + 1)
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id))
        return [...prev, ...d.items.filter((i) => !seen.has(i.id))]
      })
      setPage(page + 1)
    } finally {
      setLoadingMore(false)
    }
  }

  const colors = entry.colors || ['var(--surface-2)', 'var(--surface-3)']
  const blurb = entry.tagline || entry.blurb || 'Libros que exploran este tema, ordenados según tu perfil.'

  return (
    <div>
      <Link to="/descubrir" className="mb-8 inline-flex items-center gap-2 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Descubrir
      </Link>
      <header className="relative mb-12 overflow-hidden rounded-[30px] p-8 text-white md:p-12" style={{ background: `linear-gradient(140deg, ${colors[0]}, ${colors[1]})` }}>
        <div className="absolute -right-10 -bottom-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <p className="font-mono text-[11px] tracking-[0.16em] uppercase opacity-70">{KIND_LABEL[kind]}</p>
        <h1 className="mt-2 font-display text-[2.8rem] leading-none font-light md:text-[4.4rem]">{entry.label}</h1>
        <p className="mt-3 max-w-lg text-white/80">{blurb}</p>
        <p className="mt-5 text-xs text-white/60">Obras reales de Open Library{useStore.getState().health?.sources?.google?.available ? ' y Google Books' : ''}, ordenadas según tu perfil lector.</p>
      </header>

      {items === null ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <RecCardSkeleton key={i} width="w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No encontramos libros aquí">{error || 'Las fuentes no devolvieron resultados para esta exploración. Prueba otra.'}</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {items.map((item, i) => (
              <RecCard key={item.id} item={item} index={i % 12} width="w-full" />
            ))}
          </div>
          <div className="mt-12 flex justify-center">
            <button className="btn" onClick={more} disabled={loadingMore}>
              {loadingMore ? <Spinner size={15} /> : null} Cargar más
            </button>
          </div>
        </>
      )}
    </div>
  )
}
