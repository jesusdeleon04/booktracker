import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { motion } from 'motion/react'
import { ArrowLeft, Check, ListPlus, Minus, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import Cover from '../components/book/Cover'
import Stars from '../components/ui/Stars'
import StatusPicker from '../components/book/StatusPicker'
import RecCard, { RecCardSkeleton } from '../components/book/RecCard'
import Shelf from '../components/book/Shelf'
import { Progress, SectionHead, Spinner } from '../components/ui/Bits'
import { ConfirmDialog } from '../components/ui/Dialog'
import { EditBookDialog } from '../components/book/BookForm'
import { AddToListDialog } from '../components/book/ListDialogs'
import { api } from '../lib/api'
import { STATUS, daysBetween, formatDate, languageNote, todayISO } from '../lib/format'
import NotFound from './NotFound'

function MetaItem({ label, children }) {
  if (children == null || children === '' || children === false) return null
  return (
    <div className="border-t border-line pt-3">
      <dt className="kicker !text-[10px]">{label}</dt>
      <dd className="mt-1 text-[15px]">{children}</dd>
    </div>
  )
}

/** Autosaving text area for notes and reviews. */
function NoteField({ label, hint, value, onSave, placeholder }) {
  const [draft, setDraft] = useState(value || '')
  const [state, setState] = useState('idle')
  useEffect(() => setDraft(value || ''), [value])
  const save = async () => {
    if (draft === (value || '')) return
    setState('saving')
    try {
      await onSave(draft)
      setState('saved')
      setTimeout(() => setState('idle'), 1800)
    } catch {
      setState('idle')
    }
  }
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="font-hand text-[26px] leading-none text-ink">{label}</p>
        <span className="text-xs text-ink-3">
          {state === 'saving' && 'Guardando…'}
          {state === 'saved' && (
            <span className="flex items-center gap-1 text-sage">
              <Check size={12} /> Guardado
            </span>
          )}
          {state === 'idle' && draft !== (value || '') && 'Sin guardar'}
        </span>
      </div>
      <textarea
        className="journal"
        rows={6}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
      />
      {hint && <p className="mt-1.5 text-xs text-ink-3">{hint}</p>}
    </div>
  )
}

export default function BookDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const book = useStore((s) => s.books.find((b) => b.id === Number(id)))
  const lists = useStore((s) => s.lists)
  const genreMap = useStore((s) => s.genreMap)
  const themes = useStore((s) => s.meta.themes)
  const updateBook = useStore((s) => s.updateBook)
  const deleteBook = useStore((s) => s.deleteBook)
  const refreshBook = useStore((s) => s.refreshBook)
  const toast = useStore((s) => s.toast)
  const prefLang = useStore((s) => s.profile?.preferences?.language || 'es')
  const [editing, setEditing] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [similar, setSimilar] = useState(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!book) return
    let alive = true
    setSimilar(null)
    api
      .similar({ bookId: book.id })
      .then((d) => alive && setSimilar(d.items))
      .catch(() => alive && setSimilar([]))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id])

  if (!book) return <NotFound />

  const setStatus = async (status) => {
    if (status === book.status) return
    await updateBook(book.id, { status })
    toast(status === 'read' ? '¡Terminado! ¿Qué te pareció? Califícalo cuando quieras.' : `Movido a ${STATUS[status].label}.`, { tone: 'success' })
  }

  const progress = book.pageCount && book.currentPage ? Math.round((book.currentPage / book.pageCount) * 100) : 0
  const setPage = (p) => updateBook(book.id, { currentPage: Math.max(0, Math.min(book.pageCount || 99999, p)) }, { silent: true })
  const memberLists = lists.filter((l) => l.bookIds.includes(book.id))
  const themeLabels = (book.themes || []).map((t) => themes.find((x) => x.key === t)?.label).filter(Boolean)
  const days = daysBetween(book.startedAt, book.finishedAt)
  const longDesc = (book.description || '').length > 700

  return (
    <div>
      {/* Backdrop */}
      <div className="pointer-events-none absolute inset-x-0 top-16 -z-10 h-[520px] overflow-hidden" aria-hidden="true">
        {book.coverUrl && <img src={book.coverUrl} alt="" className="h-full w-full scale-110 object-cover opacity-25 blur-[90px] saturate-150" />}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-bg/70 to-bg" />
      </div>

      <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/biblioteca'))} className="mb-8 inline-flex items-center gap-2 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Volver
      </button>

      <div className="grid gap-10 lg:grid-cols-[minmax(240px,320px)_1fr] lg:gap-16">
        {/* Left column */}
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <motion.div
            initial={{ opacity: 0, y: 20, rotate: -2 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ type: 'spring', damping: 18 }}
            whileHover={{ rotate: -1.2, y: -4 }}
            className="mx-auto w-52 sm:w-60 lg:w-full"
          >
            <Cover book={book} eager />
          </motion.div>

          <StatusPicker value={book.status} onChange={setStatus} layoutId="detail-status" size="sm" />

          <div className="card space-y-4 p-4">
            <div className="flex items-center justify-between">
              <span className="kicker">Tu calificación</span>
              <Stars value={book.rating} onChange={(r) => updateBook(book.id, { rating: r })} size={22} showValue />
            </div>
            {book.status === 'reading' && (
              <div className="border-t border-line pt-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="kicker">Progreso</span>
                  <span className="font-mono text-xs text-ink-2">{book.pageCount ? `${progress}%` : ''}</span>
                </div>
                <Progress value={progress} />
                <div className="mt-3 flex items-center gap-2">
                  <button className="btn btn-icon btn-sm" onClick={() => setPage((book.currentPage || 0) - 10)} aria-label="Restar 10 páginas">
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    className="field h-8 flex-1 text-center"
                    value={book.currentPage || ''}
                    placeholder="Página"
                    onChange={(e) => setPage(Number(e.target.value) || 0)}
                    aria-label="Página actual"
                  />
                  <button className="btn btn-icon btn-sm" onClick={() => setPage((book.currentPage || 0) + 10)} aria-label="Sumar 10 páginas">
                    <Plus size={14} />
                  </button>
                </div>
                <p className="mt-2 text-center text-xs text-ink-3">{book.pageCount ? `de ${book.pageCount} páginas` : 'Número de páginas desconocido'}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 border-t border-line pt-4">
              <label>
                <span className="kicker mb-1 block !text-[10px]">Empezado</span>
                <input type="date" className="field h-9 px-2 text-sm" max={todayISO()} value={book.startedAt || ''} onChange={(e) => updateBook(book.id, { startedAt: e.target.value || null })} />
              </label>
              <label>
                <span className="kicker mb-1 block !text-[10px]">Terminado</span>
                <input
                  type="date"
                  className="field h-9 px-2 text-sm"
                  max={todayISO()}
                  value={book.finishedAt || ''}
                  disabled={book.status !== 'read'}
                  onChange={(e) => updateBook(book.id, { finishedAt: e.target.value || null })}
                />
              </label>
            </div>
            {days != null && days >= 0 && book.status === 'read' && (
              <p className="text-center text-xs text-ink-3">Lo leíste en {days === 0 ? 'un solo día' : `${days} días`}.</p>
            )}
          </div>

          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="kicker">Listas</span>
              <button className="btn btn-sm" onClick={() => setListOpen(true)}>
                <ListPlus size={14} /> Añadir a lista
              </button>
            </div>
            {memberLists.length ? (
              <div className="flex flex-wrap gap-1.5">
                {memberLists.map((l) => (
                  <Link key={l.id} to={`/biblioteca/listas/${l.id}`} className="chip">
                    <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                    {l.name}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-3">Aún no está en ninguna lista.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm" onClick={() => setEditing(true)}>
              <Pencil size={13} /> Editar ficha
            </button>
            <button
              className="btn btn-sm"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true)
                await refreshBook(book.id)
                setRefreshing(false)
              }}
              title="Completar los datos que falten desde Open Library / Google Books"
            >
              {refreshing ? <Spinner size={13} /> : <RefreshCw size={13} />} Completar datos
            </button>
            <button className="btn btn-sm btn-ghost text-ink-3" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={13} /> Eliminar
            </button>
          </div>
        </aside>

        {/* Right column */}
        <article className="min-w-0">
          <div className="mb-4 flex flex-wrap gap-1.5">
            {(book.genres || []).map((g) => (
              <Link key={g} to={`/explorar/genre/${g}`} className="tag transition hover:text-ink">
                {genreMap[g]?.label || g}
              </Link>
            ))}
            <span className="tag" style={{ color: STATUS[book.status].color, background: STATUS[book.status].soft }}>
              {STATUS[book.status].label}
            </span>
          </div>
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-display text-[2.4rem] leading-[1.02] font-light text-balance md:text-[3.6rem]">
            {book.title}
          </motion.h1>
          {book.subtitle && <p className="mt-2 font-display text-xl text-ink-2 italic">{book.subtitle}</p>}
          <p className="mt-4 text-lg">
            {book.authors.length ? (
              book.authors.map((a, i) => (
                <span key={a}>
                  {i > 0 && ', '}
                  <Link to={`/biblioteca?autor=${encodeURIComponent(a)}`} className="underline decoration-line-strong underline-offset-4 hover:decoration-accent">
                    {a}
                  </Link>
                </span>
              ))
            ) : (
              <span className="text-ink-3">Autor desconocido</span>
            )}
          </p>

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <MetaItem label="Publicación">{book.publishedDate || book.year}</MetaItem>
            <MetaItem label="Primera edición">{book.year && book.publishedDate && !book.publishedDate.includes(String(book.year)) ? book.year : null}</MetaItem>
            <MetaItem label="Páginas">{book.pageCount}</MetaItem>
            <MetaItem label="Editorial">{book.publisher}</MetaItem>
            <MetaItem label="ISBN">{book.isbn13 || book.isbn10 ? <span className="font-mono text-sm">{book.isbn13 || book.isbn10}</span> : null}</MetaItem>
            <MetaItem label="Idioma">{book.language ? book.language.toUpperCase() : null}</MetaItem>
            <MetaItem label="Terminado">{book.finishedAt ? formatDate(book.finishedAt) : null}</MetaItem>
            <MetaItem label="Añadido">{book.addedAt ? formatDate(book.addedAt.slice(0, 10)) : null}</MetaItem>
            <MetaItem label="Fuente">{{ openlibrary: 'Open Library', google: 'Google Books', manual: 'Manual' }[book.source]}</MetaItem>
          </dl>

          <section className="mt-10">
            <p className="kicker mb-3">Sinopsis</p>
            {book.description ? (
              <>
                <div className={`prose-book whitespace-pre-line ${!expanded && longDesc ? 'line-clamp-[10]' : ''}`}>{book.description}</div>
                {longDesc && (
                  <button className="mt-2 text-sm font-medium text-accent" onClick={() => setExpanded(!expanded)}>
                    {expanded ? 'Leer menos' : 'Leer más'}
                  </button>
                )}
                {languageNote(book.description, prefLang) && <p className="mt-2 text-xs text-ink-3">{languageNote(book.description, prefLang)}</p>}
              </>
            ) : (
              <p className="text-ink-3">
                Sin sinopsis. Prueba «Completar datos» o{' '}
                <button className="text-accent underline-offset-4 hover:underline" onClick={() => setEditing(true)}>
                  escribe una tú
                </button>
                .
              </p>
            )}
          </section>

          {(themeLabels.length > 0 || book.categories?.length > 0) && (
            <section className="mt-8">
              {themeLabels.length > 0 && (
                <>
                  <p className="kicker mb-2">Temas</p>
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {book.themes.map((t, i) => (
                      <Link key={t} to={`/explorar/theme/${t}`} className="chip">
                        {themeLabels[i]}
                      </Link>
                    ))}
                  </div>
                </>
              )}
              {book.categories?.length > 0 && (
                <details className="group">
                  <summary className="kicker cursor-pointer list-none hover:text-ink-2">Categorías del catálogo ({book.categories.length}) ▾</summary>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {book.categories.slice(0, 40).map((c) => (
                      <span key={c} className="tag !normal-case !tracking-normal">
                        {c}
                      </span>
                    ))}
                  </div>
                </details>
              )}
            </section>
          )}

          <section className="mt-12 grid gap-8 xl:grid-cols-2">
            <NoteField
              label="Tu reseña"
              value={book.review}
              placeholder={book.status === 'read' ? '¿Qué te dejó este libro?' : 'Escríbela cuando lo termines… o antes.'}
              onSave={(review) => updateBook(book.id, { review })}
              hint="Se guarda automáticamente al salir del campo."
            />
            <NoteField
              label="Notas personales"
              value={book.notes}
              placeholder="Citas, ideas sueltas, páginas que releer…"
              onSave={(notes) => updateBook(book.id, { notes })}
            />
          </section>
        </article>
      </div>

      <section className="mt-20">
        <SectionHead kicker="Siguiendo el hilo" title="Libros similares" subtitle="Comparten temas, tono o mundo con este libro." />
        {similar === null ? (
          <div className="flex gap-5 overflow-hidden">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <RecCardSkeleton key={i} />
            ))}
          </div>
        ) : similar.length ? (
          <Shelf>
            {similar.map((s, i) => (
              <RecCard key={s.id} item={s} index={i} />
            ))}
          </Shelf>
        ) : (
          <p className="text-ink-3">No encontramos obras suficientemente parecidas en el catálogo.</p>
        )}
      </section>

      {editing && <EditBookDialog book={book} open={editing} onClose={() => setEditing(false)} />}
      <AddToListDialog open={listOpen} onClose={() => setListOpen(false)} bookId={book.id} />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="¿Eliminar este libro?"
        message={`«${book.title}» saldrá de tu biblioteca y de tus listas, con su reseña y notas. Podrás deshacerlo durante unos segundos.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={() => {
          navigate('/biblioteca')
          deleteBook(book.id)
        }}
      />
    </div>
  )
}
