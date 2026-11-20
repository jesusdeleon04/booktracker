import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { BookMarked, BookOpen, Check, CornerDownLeft, PenLine, ScanBarcode, Search, X } from 'lucide-react'
import Cover from '../book/Cover'
import { Spinner } from '../ui/Bits'
import { api } from '../../lib/api'
import { fold } from '../../lib/match'
import { STATUS, authorsLine } from '../../lib/format'
import { useStore } from '../../store/useStore'
import { useQuickAdd } from '../book/RecCard'

function useDebounced(value, delay) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

const looksLikeIsbn = (q) => /^[\d\s-]{10,17}[xX]?$/.test(q.trim()) && [10, 13].includes(q.replace(/[^\dxX]/g, '').length)

/** Global search: your library first, then the catalog (Open Library / Google Books). */
export default function CommandPalette() {
  const { open, mode } = useStore((s) => s.palette)
  const close = useStore((s) => s.closePalette)
  const openPalette = useStore((s) => s.openPalette)

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase()
      const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        openPalette('search')
      } else if (e.key === '/' && !typing) {
        e.preventDefault()
        openPalette('search')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openPalette])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] flex justify-center p-0 sm:p-6 sm:pt-[9vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 backdrop-blur-md" style={{ background: 'var(--overlay)' }} onClick={close} />
          <motion.div
            initial={{ y: -16, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -10, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 30, stiffness: 380 }}
            className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden border-line bg-surface shadow-[var(--shadow-pop)] sm:h-auto sm:max-h-[80vh] sm:rounded-[28px] sm:border"
          >
            <PaletteBody mode={mode} onClose={close} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function PaletteBody({ mode, onClose }) {
  const navigate = useNavigate()
  const books = useStore((s) => s.books)
  const findInLibrary = useStore((s) => s.findInLibrary)
  const openPreview = useStore((s) => s.openPreview)
  const setManualOpen = useStore((s) => s.setManualOpen)
  const health = useStore((s) => s.health)
  const quickAdd = useQuickAdd()
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [active, setActive] = useState(0)
  const [adding, setAdding] = useState(null)
  const inputRef = useRef(null)
  const debounced = useDebounced(q.trim(), 380)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (debounced.length < 2) {
      setResults([])
      setError(null)
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    api
      .search(debounced, ctrl.signal)
      .then((d) => setResults(d.items))
      .catch((e) => e.name !== 'AbortError' && setError(e.message))
      .finally(() => !ctrl.signal.aborted && setLoading(false))
    return () => ctrl.abort()
  }, [debounced])

  const local = useMemo(() => {
    const f = fold(q)
    if (f.length < 2 || mode === 'add') return []
    return books
      .filter((b) => fold(`${b.title} ${b.authors.join(' ')} ${b.isbn13}`).includes(f))
      .slice(0, 5)
  }, [q, books, mode])

  const rows = useMemo(() => [...local.map((b) => ({ type: 'local', b })), ...results.map((b) => ({ type: 'remote', b }))], [local, results])

  useEffect(() => setActive(0), [rows.length])

  const choose = (row) => {
    if (!row) return
    if (row.type === 'local') {
      onClose()
      navigate(`/libro/${row.b.id}`)
    } else {
      openPreview(row.b)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(rows.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(rows[active])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const add = async (item, status) => {
    setAdding(`${item.id}:${status}`)
    await quickAdd(item, status)
    setAdding(null)
  }

  const isbnMode = looksLikeIsbn(q)

  return (
    <>
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        {isbnMode ? <ScanBarcode size={20} className="text-accent" /> : <Search size={20} className="text-ink-3" />}
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={mode === 'add' ? 'Título, autor o ISBN del libro que quieres añadir…' : 'Busca en tu biblioteca y en el catálogo…'}
          className="min-w-0 flex-1 bg-transparent font-display text-xl outline-none placeholder:text-ink-3 sm:text-2xl"
          aria-label="Buscar libros"
        />
        {loading && <Spinner size={18} className="text-ink-3" />}
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Cerrar">
          <X size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {q.trim().length < 2 && (
          <div className="px-4 py-8 text-center">
            <p className="font-display text-2xl">{mode === 'add' ? '¿Qué libro añadimos?' : 'Encuentra cualquier libro'}</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">
              Escribe un título, un autor o pega un ISBN. Traemos la portada, la sinopsis y todos los datos automáticamente.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {['Cien años de soledad', 'Ursula K. Le Guin', '9788420674209'].map((s) => (
                <button key={s} className="chip" onClick={() => setQ(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {local.length > 0 && <p className="kicker px-3 pt-2 pb-1">En tu biblioteca</p>}
        {local.map((b, i) => (
          <button
            key={`l${b.id}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose({ type: 'local', b })}
            className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition ${active === i ? 'bg-surface-2' : ''}`}
          >
            <Cover book={b} compact className="w-9 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display">{b.title}</p>
              <p className="truncate text-xs text-ink-2">{authorsLine(b.authors)}</p>
            </div>
            <span className="tag" style={{ color: STATUS[b.status].color }}>
              {STATUS[b.status].short}
            </span>
          </button>
        ))}

        {q.trim().length >= 2 && (
          <p className="kicker flex items-center justify-between px-3 pt-3 pb-1">
            <span>{isbnMode ? 'Resultado por ISBN' : 'En el catálogo'}</span>
            {!loading && results.length > 0 && <span className="normal-case tracking-normal">{results.length} resultados</span>}
          </p>
        )}
        {loading && results.length === 0 &&
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <div className="shimmer h-[66px] w-11 rounded" />
              <div className="flex-1 space-y-2">
                <div className="shimmer h-4 w-2/3 rounded" />
                <div className="shimmer h-3 w-1/3 rounded" />
              </div>
            </div>
          ))}
        {error && <p className="px-3 py-4 text-sm text-accent">{error}</p>}
        {!loading && !error && debounced.length >= 2 && results.length === 0 && (
          <p className="px-3 py-4 text-sm text-ink-2">No encontramos coincidencias. Prueba con el autor, otro idioma o el ISBN.</p>
        )}
        {results.map((b, j) => {
          const i = local.length + j
          const owned = findInLibrary(b)
          return (
            <div
              key={b.id}
              onMouseEnter={() => setActive(i)}
              className={`group flex items-center gap-3 rounded-2xl px-3 py-2 transition ${active === i ? 'bg-surface-2' : ''}`}
            >
              <button onClick={() => choose({ type: 'remote', b })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Cover book={b} compact className="w-11 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-display leading-snug line-clamp-2">{b.title}</p>
                  <p className="truncate text-xs text-ink-2">
                    {authorsLine(b.authors)}
                    {b.year ? ` · ${b.year}` : ''}
                    {b.pageCount ? ` · ${b.pageCount} págs.` : ''}
                  </p>
                </div>
              </button>
              {owned ? (
                <span className="tag shrink-0" style={{ color: STATUS[owned.status].color }}>
                  <Check size={11} /> En tu biblioteca
                </span>
              ) : (
                <div className={`flex shrink-0 gap-1 transition ${active === i ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'}`}>
                  {[
                    ['want', BookMarked],
                    ['reading', BookOpen],
                    ['read', Check],
                  ].map(([s, Icon]) => (
                    <button
                      key={s}
                      onClick={() => add(b, s)}
                      className="grid h-8 w-8 place-items-center rounded-full border border-line bg-surface text-ink-2 transition hover:text-bg"
                      style={{ '--h': STATUS[s].color }}
                      onMouseOver={(e) => (e.currentTarget.style.background = STATUS[s].color)}
                      onMouseOut={(e) => (e.currentTarget.style.background = '')}
                      title={`Añadir a ${STATUS[s].label}`}
                      aria-label={`Añadir a ${STATUS[s].label}`}
                    >
                      {adding === `${b.id}:${s}` ? <Spinner size={13} /> : <Icon size={14} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-xs text-ink-3">
        <span className="flex items-center gap-3">
          <span className="hidden items-center gap-1 sm:flex">
            <CornerDownLeft size={12} /> abrir
          </span>
          <span>
            Fuentes: Open Library {health?.sources?.openlibrary?.available === false ? '✕' : '✓'} · Google Books{' '}
            {health?.sources?.google?.available ? '✓' : '(sin cuota)'}
          </span>
        </span>
        <button className="flex items-center gap-1.5 font-medium text-ink-2 hover:text-ink" onClick={() => setManualOpen(true)}>
          <PenLine size={13} /> ¿No lo encuentras? Añádelo a mano
        </button>
      </div>
    </>
  )
}
