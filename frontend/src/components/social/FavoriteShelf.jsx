import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import Cover from '../book/Cover'
import { Dialog } from '../ui/Dialog'
import { fold } from '../../lib/match'
import { useStore } from '../../store/useStore'
import { tertulia } from '../../lib/copy'

// Widths that make the row feel hand-arranged instead of a grid, repeated in a fixed order.
const WIDTHS = [118, 104, 126, 110, 98, 122, 106, 114]
const TILTS = [-1.2, 0.8, -0.4, 1.4, -0.9, 0.5, -1.4, 1]

/**
 * A small shelf of covers standing on a plank: the reader's chosen books, in the
 * order they chose. Covers keep their proportions and scroll sideways on small
 * screens. Selecting one opens the book's card (only what the owner saved on the
 * shelf — nothing else from their library).
 */
export function BookShelf({ books }) {
  const [open, setOpen] = useState(null)
  const genreMap = useStore((s) => s.genreMap)
  if (!books?.length) return null
  return (
    <div>
      <div className="no-scrollbar -mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="list">
        <div className="relative flex w-max min-w-full items-end gap-4 px-4 pt-4 pb-0 sm:gap-5 sm:px-6">
          {books.map((b, i) => (
            <button
              key={`${b.bookId}-${i}`}
              type="button"
              role="listitem"
              onClick={() => setOpen(b)}
              aria-label={`${b.title}${b.authors?.length ? `, de ${b.authors.join(', ')}` : ''}`}
              className="group relative shrink-0 origin-bottom transition duration-300 hover:-translate-y-2"
              style={{ width: WIDTHS[i % WIDTHS.length], rotate: `${TILTS[i % TILTS.length]}deg`, marginBottom: i % 3 === 1 ? 6 : 0 }}
            >
              <Cover book={b} lift />
            </button>
          ))}
        </div>
        {/* the plank */}
        <div
          className="relative -mt-px h-4 w-full min-w-max rounded-[2px] shadow-[0_14px_22px_-10px_rgba(0,0,0,0.65)]"
          style={{ background: 'linear-gradient(180deg, #7a5532 0%, #4b3220 55%, #33220f 100%)', boxShadow: 'inset 0 1px 0 rgba(255,220,170,0.28), 0 14px 22px -10px rgba(0,0,0,0.65)' }}
          aria-hidden="true"
        />
      </div>

      <Dialog open={!!open} onClose={() => setOpen(null)} title={open?.title || ''}>
        {open && (
          <div className="flex gap-4">
            <div className="w-28 shrink-0 sm:w-32">
              <Cover book={open} lift />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-ink-2">{(open.authors || []).join(', ')}</p>
              {open.year ? <p className="mt-0.5 font-mono text-xs text-ink-3">{open.year}</p> : null}
              {open.genres?.length > 0 && (
                <p className="mt-3 flex flex-wrap gap-1.5">
                  {open.genres.map((g) => (
                    <span key={g} className="chip !h-6 !cursor-default text-[12px]">
                      {genreMap?.[g]?.label || g}
                    </span>
                  ))}
                </p>
              )}
              {open.description ? <p className="prose-book mt-3 !text-[14.5px] whitespace-pre-line">{open.description}{open.description.length >= 500 ? '…' : ''}</p> : null}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}

/**
 * Editor for the shelf shown on the profile: pick from the user's own library,
 * reorder, remove, and show/hide the whole shelf. Only the selection is stored
 * for the profile; the library itself is never touched.
 */
export function ShelfEditor({ ids, onChange, visible, onVisible, level, onLevel, max = 8 }) {
  const books = useStore((s) => s.books)
  const lists = useStore((s) => s.lists)
  const [q, setQ] = useState('')
  const copy = tertulia.shelf

  const byId = useMemo(() => Object.fromEntries(books.map((b) => [b.id, b])), [books])
  const chosen = ids.map((id) => byId[id]).filter(Boolean)
  const favoriteIds = useMemo(() => new Set((lists.find((l) => l.name === 'Favoritos')?.bookIds) || []), [lists])
  const candidates = useMemo(() => {
    const fq = fold(q)
    return books
      .filter((b) => !ids.includes(b.id) && (!fq || fold(`${b.title} ${b.authors.join(' ')}`).includes(fq)))
      .sort((a, b) => Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id)))
      .slice(0, 18)
  }, [books, ids, q, favoriteIds])

  const move = (i, d) => {
    const next = [...ids]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div>
      <label className="mb-3 flex items-start gap-3">
        <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={visible} onChange={(e) => onVisible(e.target.checked)} />
        <span>
          <span className="block font-medium">{copy.show}</span>
          {!visible && <span className="block text-sm text-ink-3">{copy.hiddenNote}</span>}
        </span>
      </label>
      {visible && (
        <label className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-2">
          Quién la ve
          <select className="field h-9 w-auto" value={level} onChange={(e) => onLevel(e.target.value)} aria-label="Quién ve la estantería">
            <option value="friends">Solo mis amigos</option>
            <option value="everyone">Todo el mundo</option>
          </select>
        </label>
      )}

      {chosen.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-3">{copy.empty}</p>
      ) : (
        <ul className={`no-scrollbar -mx-4 mb-2 flex gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0 ${visible ? '' : 'opacity-50'}`}>
          {chosen.map((b, i) => (
            <li key={b.id} className="w-24 shrink-0">
              <Cover book={b} compact />
              <div className="mt-2 flex items-center justify-between">
                <button type="button" className="btn btn-icon btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={copy.moveLeft(b.title)}>
                  <ChevronLeft size={14} />
                </button>
                <button type="button" className="btn btn-icon btn-sm" onClick={() => onChange(ids.filter((x) => x !== b.id))} aria-label={copy.remove(b.title)}>
                  <X size={14} />
                </button>
                <button type="button" className="btn btn-icon btn-sm" onClick={() => move(i, 1)} disabled={i === chosen.length - 1} aria-label={copy.moveRight(b.title)}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5">
        <p className="kicker mb-2">{copy.pickFrom}</p>
        {ids.length >= max ? (
          <p className="text-sm text-ink-3">{copy.full}</p>
        ) : (
          <>
            <div className="relative max-w-md">
              <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
              <input className="field h-10 pl-9" placeholder={copy.search} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {favoriteIds.size > 0 && !q && <p className="mt-2 text-xs text-ink-3">{copy.favoritesFirst}</p>}
            <ul className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
              {candidates.map((b) => (
                <li key={b.id}>
                  <button type="button" className="block w-full text-left transition hover:-translate-y-0.5" onClick={() => onChange([...ids, b.id])} aria-label={`Añadir «${b.title}» a la estantería`} title={b.title}>
                    <Cover book={b} compact />
                  </button>
                </li>
              ))}
              {candidates.length === 0 && <li className="col-span-full text-sm text-ink-3">Ningún libro de tu biblioteca coincide.</li>}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
