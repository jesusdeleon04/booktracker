import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { ArrowUpRight, BookMarked, BookOpen, Check, Feather, ThumbsDown } from 'lucide-react'
import { Sheet } from '../ui/Dialog'
import Cover from './Cover'
import Stars from '../ui/Stars'
import RecCard, { RecCardSkeleton } from './RecCard'
import Shelf from './Shelf'
import { Spinner } from '../ui/Bits'
import { api } from '../../lib/api'
import { useStore } from '../../store/useStore'
import { STATUS, authorsLine, languageNote } from '../../lib/format'

function Meta({ label, value }) {
  if (!value) return null
  return (
    <div>
      <dt className="kicker !text-[10px]">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  )
}

/** Detail sheet for any catalog book (search results, recommendations). */
export default function BookPreview() {
  const preview = useStore((s) => s.preview)
  const close = useStore((s) => s.closePreview)
  return (
    <Sheet open={!!preview} onClose={close} label="Ficha del libro">
      {preview && <PreviewBody key={preview.item.id} item={preview.item} reasons={preview.reasons} onClose={close} />}
    </Sheet>
  )
}

function PreviewBody({ item, reasons, onClose }) {
  const navigate = useNavigate()
  const genreMap = useStore((s) => s.genreMap)
  const addBook = useStore((s) => s.addBook)
  const updateBook = useStore((s) => s.updateBook)
  const feedback = useStore((s) => s.feedback)
  const toast = useStore((s) => s.toast)
  const inLibrary = useStore((s) => s.findInLibrary(item))
  const prefLang = useStore((s) => s.profile?.preferences?.language || 'es')
  const [full, setFull] = useState(null)
  const [loading, setLoading] = useState(true)
  const [similar, setSimilar] = useState(null)
  const [adding, setAdding] = useState(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .catalogBook(item.id)
      .then((d) => alive && setFull(d))
      .catch(() => alive && setFull(null))
      .finally(() => alive && setLoading(false))
    api
      .similar({ id: item.id })
      .then((d) => alive && setSimilar(d.items))
      .catch(() => alive && setSimilar([]))
    return () => {
      alive = false
    }
  }, [item.id])

  const book = { ...item, ...(full || {}), description: full?.description || item.description, reasons }
  const description = book.description || ''
  const longDesc = description.length > 520

  const add = async (status) => {
    setAdding(status)
    const res = await addBook(book, { status })
    setAdding(null)
    if (res.book && !res.duplicate) {
      toast(`«${res.book.title}» añadido a ${STATUS[status].label}.`, { tone: 'success' })
    }
  }

  const dismiss = async () => {
    if (await feedback(item, 'dismiss')) {
      toast('No volveremos a recomendártelo.', { tone: 'info' })
      onClose()
    }
  }

  return (
    <div>
      {/* Backdrop */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 scale-125 opacity-50 blur-3xl saturate-150">
          {book.coverUrl && <img src={book.coverUrl} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-bg/60 to-bg" />
        <div className="relative flex gap-5 px-6 pt-14 pb-6 sm:px-8">
          <motion.div
            initial={{ rotate: -4, y: 10, opacity: 0 }}
            animate={{ rotate: -1.5, y: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 16 }}
            className="w-32 shrink-0 sm:w-40"
          >
            <Cover book={book} eager />
          </motion.div>
          <div className="flex min-w-0 flex-col justify-end">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {(book.genres || []).slice(0, 3).map((g) => (
                <span key={g} className="tag">
                  {genreMap[g]?.label || g}
                </span>
              ))}
            </div>
            <h2 className="font-display text-2xl leading-tight text-balance sm:text-3xl">{book.title}</h2>
            {book.subtitle && <p className="mt-1 text-sm text-ink-2 line-clamp-2">{book.subtitle}</p>}
            <p className="mt-2 text-ink-2">{authorsLine(book.authors, 3)}</p>
            {book.rating && book.ratingsCount >= 5 ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-ink-3">
                <Stars value={Math.round(book.rating * 2) / 2} size={12} />
                {String(book.rating.toFixed(1)).replace('.', ',')} · {book.ratingsCount} valoraciones
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-7 px-6 pb-10 sm:px-8">
        {/* Actions */}
        {inLibrary ? (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="kicker">En tu biblioteca</p>
                <p className="mt-1 font-medium" style={{ color: STATUS[inLibrary.status].color }}>
                  {STATUS[inLibrary.status].label}
                </p>
              </div>
              <button
                className="btn btn-ink btn-sm"
                onClick={() => {
                  onClose()
                  navigate(`/libro/${inLibrary.id}`)
                }}
              >
                Ver ficha <ArrowUpRight size={14} />
              </button>
            </div>
            {inLibrary.status === 'read' && (
              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <span className="text-sm text-ink-2">¿Qué te pareció?</span>
                <Stars value={inLibrary.rating} onChange={(r) => updateBook(inLibrary.id, { rating: r })} size={20} />
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="kicker mb-2.5">Añadir a mi biblioteca</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['want', BookMarked],
                ['reading', BookOpen],
                ['read', Check],
              ].map(([s, Icon]) => (
                <button
                  key={s}
                  onClick={() => add(s)}
                  disabled={!!adding}
                  className={`flex h-12 items-center justify-center gap-1.5 rounded-2xl border border-line text-sm font-semibold transition hover:-translate-y-0.5 ${s === 'want' ? 'bg-ink text-bg' : 'bg-surface hover:bg-surface-2'}`}
                >
                  {adding === s ? <Spinner size={15} /> : <Icon size={15} />}
                  {STATUS[s].label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-3">Importamos automáticamente portada, sinopsis, editorial, páginas, ISBN y géneros.</p>
          </div>
        )}

        {/* Why */}
        {reasons?.length > 0 && (
          <section className="paper-sheet -rotate-[0.6deg] rounded-[4px] px-5 pt-4 pb-5">
            <span className="absolute -top-2.5 left-1/2 h-5 w-20 -translate-x-1/2 rotate-[2deg] bg-[#e9d9b4]/80 shadow-sm" aria-hidden="true" />
            <p className="font-hand mb-2 flex items-center gap-1.5 text-[22px] leading-none text-[var(--paper-ink)]">
              <Feather size={15} className="text-[#a65d19]" /> Por qué podría gustarte
            </p>
            <ul className="space-y-1">
              {reasons.map((r) => (
                <li key={r} className="font-hand flex gap-2 text-[19px] leading-[1.2] text-[var(--paper-ink)]">
                  <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#a65d19]" />
                  {r}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Description */}
        <section>
          <p className="kicker mb-2">Sinopsis</p>
          {loading && !description ? (
            <div className="space-y-2">
              <div className="shimmer h-3 rounded" />
              <div className="shimmer h-3 w-11/12 rounded" />
              <div className="shimmer h-3 w-4/5 rounded" />
            </div>
          ) : description ? (
            <>
              <div className={`prose-book whitespace-pre-line ${!expanded && longDesc ? 'line-clamp-[8]' : ''}`}>{description}</div>
              {longDesc && (
                <button className="mt-2 text-sm font-medium text-accent" onClick={() => setExpanded(!expanded)}>
                  {expanded ? 'Leer menos' : 'Leer más'}
                </button>
              )}
              {languageNote(description, prefLang) && <p className="mt-2 text-xs text-ink-3">{languageNote(description, prefLang)}</p>}
              {item.descriptionDerived && !full?.description && (
                <p className="mt-2 text-xs text-ink-3">Resumen generado a partir de los datos del catálogo: la fuente no ofrece sinopsis.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-ink-3">Las fuentes no ofrecen sinopsis para esta obra.</p>
          )}
        </section>

        {/* Metadata */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border border-line p-4 sm:grid-cols-3">
          <Meta label="Publicación" value={book.year || book.publishedDate} />
          <Meta label="Páginas" value={book.pageCount} />
          <Meta label="Editorial" value={book.publisher} />
          <Meta label="ISBN" value={book.isbn13 || book.isbn10} />
          <Meta label="Idioma" value={book.language?.toUpperCase()} />
          <Meta label="Fuente" value={book.source === 'google' ? 'Google Books' : 'Open Library'} />
        </dl>

        {!inLibrary && reasons?.length > 0 && (
          <button className="btn btn-ghost btn-sm text-ink-3" onClick={dismiss}>
            <ThumbsDown size={14} /> No me interesa
          </button>
        )}

        {/* Similar */}
        <section>
          <p className="kicker mb-3">Libros similares</p>
          {similar === null ? (
            <div className="flex gap-4 overflow-hidden">
              {[0, 1, 2].map((i) => (
                <RecCardSkeleton key={i} width="w-[128px]" />
              ))}
            </div>
          ) : similar.length ? (
            <Shelf>
              {similar.slice(0, 10).map((s, i) => (
                <RecCard key={s.id} item={s} index={i} width="w-[128px]" />
              ))}
            </Shelf>
          ) : (
            <p className="text-sm text-ink-3">No encontramos obras suficientemente parecidas.</p>
          )}
        </section>
        {loading && (
          <p className="flex items-center gap-2 text-xs text-ink-3">
            <Spinner size={12} /> Completando datos desde las fuentes…
          </p>
        )}
      </div>
    </div>
  )
}
