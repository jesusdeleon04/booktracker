import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { LayoutGrid, List as ListIcon, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import BookTile from '../components/book/BookTile'
import Cover from '../components/book/Cover'
import Stars from '../components/ui/Stars'
import { EmptyState, PageTitle, Segmented } from '../components/ui/Bits'
import { ListFormDialog } from '../components/book/ListDialogs'
import { STATUS, authorsLine, formatDate } from '../lib/format'
import { fold } from '../lib/match'

const TABS = [
  { value: 'all', label: 'Todos' },
  { value: 'reading', label: 'Leyendo' },
  { value: 'read', label: 'Leídos' },
  { value: 'want', label: 'Quiero leer' },
  { value: 'lists', label: 'Listas' },
]

const SORTS = {
  recent: { label: 'Añadidos recientemente', fn: (a, b) => (b.addedAt || '').localeCompare(a.addedAt || '') },
  finished: { label: 'Fecha de lectura', fn: (a, b) => (b.finishedAt || '').localeCompare(a.finishedAt || '') },
  rating: { label: 'Mejor valorados', fn: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) },
  title: { label: 'Título (A–Z)', fn: (a, b) => a.title.localeCompare(b.title, 'es') },
  author: { label: 'Autor (A–Z)', fn: (a, b) => (a.authors[0] || '').localeCompare(b.authors[0] || '', 'es') },
  year: { label: 'Año de publicación', fn: (a, b) => (b.year || 0) - (a.year || 0) },
}

const EMPTY_COPY = {
  all: ['Tu biblioteca está esperando', 'Añade el libro que tienes en la mesilla, o el que te cambió la vida. Nosotros traemos la portada y los datos.'],
  reading: ['Nada en curso', 'Cuando empieces un libro, márcalo como «Leyendo» y seguiremos tu progreso página a página.'],
  read: ['Aún no hay lecturas terminadas', 'Los libros que termines aparecerán aquí, con tu calificación y tu reseña.'],
  want: ['Tu lista de deseos está vacía', 'Guarda aquí lo que quieres leer. Descubrir está lleno de ideas.'],
}

export default function Library() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'all'
  const books = useStore((s) => s.books)
  const lists = useStore((s) => s.lists)
  const genreMap = useStore((s) => s.genreMap)
  const openPalette = useStore((s) => s.openPalette)
  const [q, setQ] = useState('')
  const [genre, setGenre] = useState(params.get('genero') || '')
  const [author, setAuthor] = useState(params.get('autor') || '')
  const [sort, setSort] = useState('recent')
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem('bt-lib-view') || 'grid'
    } catch {
      return 'grid'
    }
  })
  const [showFilters, setShowFilters] = useState(!!(params.get('genero') || params.get('autor')))
  const [newList, setNewList] = useState(false)

  const counts = useMemo(() => {
    const c = { all: books.length, reading: 0, read: 0, want: 0 }
    books.forEach((b) => (c[b.status] += 1))
    return c
  }, [books])

  const genreOptions = useMemo(() => {
    const c = {}
    books.forEach((b) => (b.genres || []).forEach((g) => (c[g] = (c[g] || 0) + 1)))
    return Object.entries(c).sort((a, b) => b[1] - a[1])
  }, [books])

  const authorOptions = useMemo(() => {
    const c = {}
    books.forEach((b) => b.authors.slice(0, 1).forEach((a) => (c[a] = (c[a] || 0) + 1)))
    return Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [books])

  const filtered = useMemo(() => {
    const fq = fold(q)
    return books
      .filter((b) => tab === 'all' || b.status === tab)
      .filter((b) => !genre || (b.genres || []).includes(genre))
      .filter((b) => !author || b.authors.includes(author))
      .filter((b) => !fq || fold(`${b.title} ${b.authors.join(' ')} ${b.publisher} ${b.isbn13}`).includes(fq))
      .sort(SORTS[sort].fn)
  }, [books, tab, genre, author, q, sort])

  const setTab = (t) => {
    const next = new URLSearchParams(params)
    next.set('tab', t)
    setParams(next, { replace: true })
  }
  const setViewMode = (v) => {
    setView(v)
    try {
      localStorage.setItem('bt-lib-view', v)
    } catch {
      /* ignore */
    }
  }
  const activeFilters = (genre ? 1 : 0) + (author ? 1 : 0)

  return (
    <div>
      <PageTitle
        kicker={`${counts.all} libros · ${counts.read} leídos · ${counts.reading} en curso · ${counts.want} pendientes`}
        right={
          <button className="btn btn-primary" onClick={() => openPalette('add')}>
            <Plus size={16} /> Añadir libro
          </button>
        }
      >
        Tu <em className="display-wonk">biblioteca</em>
      </PageTitle>

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented options={TABS.map((t) => ({ ...t, count: t.value === 'lists' ? lists.length : counts[t.value] }))} value={tab} onChange={setTab} layoutId="lib-tabs" />
        {tab !== 'lists' && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1 lg:w-64 lg:flex-none">
              <Search size={15} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
              <input className="field h-10 rounded-full pl-10" placeholder="Filtrar por título, autor…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button className={`btn btn-icon relative ${showFilters ? 'bg-surface-2' : ''}`} onClick={() => setShowFilters(!showFilters)} aria-label="Filtros">
              <SlidersHorizontal size={16} />
              {activeFilters > 0 && <span className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-accent font-mono text-[9px] text-accent-ink">{activeFilters}</span>}
            </button>
            <div className="flex rounded-full border border-line p-0.5">
              <button className={`grid h-9 w-9 place-items-center rounded-full ${view === 'grid' ? 'bg-surface-3 text-ink' : 'text-ink-3'}`} onClick={() => setViewMode('grid')} aria-label="Vista de portadas">
                <LayoutGrid size={15} />
              </button>
              <button className={`grid h-9 w-9 place-items-center rounded-full ${view === 'list' ? 'bg-surface-3 text-ink' : 'text-ink-3'}`} onClick={() => setViewMode('list')} aria-label="Vista de lista">
                <ListIcon size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {tab !== 'lists' && showFilters && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6 grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-3">
          <label>
            <span className="kicker mb-1.5 block !text-[10px]">Género</span>
            <select className="field" value={genre} onChange={(e) => setGenre(e.target.value)}>
              <option value="">Todos los géneros</option>
              {genreOptions.map(([g, n]) => (
                <option key={g} value={g}>
                  {genreMap[g]?.label || g} ({n})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="kicker mb-1.5 block !text-[10px]">Autor</span>
            <select className="field" value={author} onChange={(e) => setAuthor(e.target.value)}>
              <option value="">Todos los autores</option>
              {authorOptions.map(([a, n]) => (
                <option key={a} value={a}>
                  {a} ({n})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="kicker mb-1.5 block !text-[10px]">Ordenar por</span>
            <select className="field" value={sort} onChange={(e) => setSort(e.target.value)}>
              {Object.entries(SORTS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {activeFilters > 0 && (
            <button
              className="btn btn-ghost btn-sm justify-self-start sm:col-span-3"
              onClick={() => {
                setGenre('')
                setAuthor('')
              }}
            >
              <X size={14} /> Limpiar filtros
            </button>
          )}
        </motion.div>
      )}

      {tab === 'lists' ? (
        <ListsGrid lists={lists} books={books} onNew={() => setNewList(true)} />
      ) : filtered.length === 0 ? (
        books.length && (q || genre || author) ? (
          <EmptyState title="Ningún libro coincide">Prueba con otros filtros o borra la búsqueda.</EmptyState>
        ) : (
          <EmptyState
            title={EMPTY_COPY[tab][0]}
            action={
              <>
                <button className="btn btn-primary" onClick={() => openPalette('add')}>
                  <Plus size={16} /> Añadir un libro
                </button>
                <Link to="/descubrir" className="btn">
                  Descubrir
                </Link>
              </>
            }
          >
            {EMPTY_COPY[tab][1]}
          </EmptyState>
        )
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-9 xs:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((b, i) => (
            <BookTile key={b.id} book={b} index={i} showStatus={tab === 'all'} />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {filtered.map((b) => (
            <Link key={b.id} to={`/libro/${b.id}`} className="flex items-center gap-4 bg-surface px-4 py-3 transition hover:bg-surface-2">
              <Cover book={b} compact className="w-11 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[17px]">{b.title}</p>
                <p className="truncate text-sm text-ink-2">{authorsLine(b.authors)}</p>
              </div>
              <div className="hidden w-40 text-sm text-ink-3 md:block">{(b.genres || []).slice(0, 2).map((g) => genreMap[g]?.label).join(', ')}</div>
              <div className="hidden w-32 text-sm text-ink-3 sm:block">{b.finishedAt ? formatDate(b.finishedAt) : b.year || ''}</div>
              <div className="hidden w-24 sm:block">{b.rating != null && <Stars value={b.rating} size={12} />}</div>
              <span className="tag w-24 justify-center" style={{ color: STATUS[b.status].color, background: STATUS[b.status].soft }}>
                {STATUS[b.status].short}
              </span>
            </Link>
          ))}
        </div>
      )}
      <ListFormDialog open={newList} onClose={() => setNewList(false)} />
    </div>
  )
}

function ListsGrid({ lists, books, onNew }) {
  const byId = useMemo(() => Object.fromEntries(books.map((b) => [b.id, b])), [books])
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {lists.map((l, i) => {
        const items = l.bookIds.map((id) => byId[id]).filter(Boolean)
        return (
          <motion.div key={l.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Link to={`/biblioteca/listas/${l.id}`} className="group block overflow-hidden rounded-[24px] border border-line bg-surface transition hover:-translate-y-1 hover:border-line-strong">
              <div className="relative h-48 overflow-hidden" style={{ background: `linear-gradient(140deg, ${l.color}55, transparent 70%), var(--surface-2)` }}>
                <div className="absolute inset-x-6 bottom-[-28px] flex items-end justify-center">
                  {items.length ? (
                    items.slice(0, 5).map((b, j) => (
                      <div
                        key={b.id}
                        className="w-[26%] transition-transform duration-500 group-hover:-translate-y-2"
                        style={{ marginLeft: j ? '-8%' : 0, transform: `rotate(${(j - 2) * 5}deg)`, zIndex: 5 - Math.abs(j - 2) }}
                      >
                        <Cover book={b} compact />
                      </div>
                    ))
                  ) : (
                    <p className="mb-16 font-display text-5xl opacity-40">{l.emoji || '❧'}</p>
                  )}
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                  <h3 className="font-display text-xl">{l.name}</h3>
                </div>
                <p className="mt-1 text-sm text-ink-2 line-clamp-1">{l.description || ' '}</p>
                <p className="kicker mt-3">{items.length} libros</p>
              </div>
            </Link>
          </motion.div>
        )
      })}
      <button onClick={onNew} className="flex min-h-[18rem] flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-line-strong text-ink-2 transition hover:border-ink-3 hover:text-ink">
        <span className="grid h-12 w-12 place-items-center rounded-full border border-line-strong">
          <Plus size={20} />
        </span>
        <span className="font-display text-xl">Nueva lista</span>
        <span className="max-w-[16rem] text-center text-sm text-ink-3">Filosofía, relecturas, libros para el verano… tú decides.</span>
      </button>
    </div>
  )
}
