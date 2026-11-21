import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { ArrowRight, BookOpen, Check, Compass, Minus, Plus } from 'lucide-react'
import { useStore } from '../store/useStore'
import Cover from '../components/book/Cover'
import BookTile from '../components/book/BookTile'
import RecCard, { RecCardSkeleton } from '../components/book/RecCard'
import Shelf from '../components/book/Shelf'
import Stars from '../components/ui/Stars'
import { EmptyState, Progress, Ring, SectionHead } from '../components/ui/Bits'
import { useSection } from '../hooks/useDiscover'
import { authorsLine, greeting, mastheadDate, plural } from '../lib/format'
import { readThisYear } from '../lib/stats'
import StringLights from '../components/ui/StringLights'
import { books as copy, discover as discoverCopy } from '../lib/copy'

function ReadingCard({ book, index }) {
  const updateBook = useStore((s) => s.updateBook)
  const toast = useStore((s) => s.toast)
  const [justFinished, setJustFinished] = useState(false)
  const pct = book.pageCount && book.currentPage ? Math.round((book.currentPage / book.pageCount) * 100) : 0
  const bump = (d) => updateBook(book.id, { currentPage: Math.max(0, Math.min(book.pageCount || 99999, (book.currentPage || 0) + d)) }, { silent: true })

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="flex min-w-0 gap-4 rounded-[26px] border border-line bg-surface p-4 sm:gap-5 sm:pr-5"
    >
      <Link to={`/libro/${book.id}`} className="w-20 shrink-0 sm:w-28">
        <Cover book={book} lift />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link to={`/libro/${book.id}`} className="font-display text-xl leading-tight line-clamp-2 hover:text-accent">
          {book.title}
        </Link>
        <p className="mt-0.5 truncate text-sm text-ink-2">{authorsLine(book.authors, 1)}</p>
        <div className="mt-auto pt-4">
          {justFinished ? (
            <div>
              <p className="mb-1.5 text-sm">¿Qué te pareció?</p>
              <Stars
                value={null}
                size={22}
                onChange={async (r) => {
                  await updateBook(book.id, { rating: r })
                  toast(copy.toasts.ratingSaved, { tone: 'success' })
                }}
              />
            </div>
          ) : (
            <>
              <div className="mb-1.5 flex items-baseline justify-between text-xs text-ink-3">
                <span>{book.currentPage ? `Página ${book.currentPage}` : 'Sin empezar'}{book.pageCount ? ` de ${book.pageCount}` : ''}</span>
                <span className="font-mono">{book.pageCount ? `${pct}%` : ''}</span>
              </div>
              <Progress value={pct} />
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <button className="btn btn-icon btn-sm" onClick={() => bump(-10)} aria-label="Restar 10 páginas">
                  <Minus size={13} />
                </button>
                <button className="btn btn-sm !px-2.5" onClick={() => bump(10)} aria-label="Sumar 10 páginas">
                  <Plus size={13} /> 10
                </button>
                <button
                  className="btn btn-sm sm:ml-auto"
                  onClick={async () => {
                    await updateBook(book.id, { status: 'read' })
                    setJustFinished(true)
                    toast(copy.toasts.finished(book.title), { tone: 'success' })
                  }}
                >
                  <Check size={13} /> Terminado
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function NextRead() {
  const plan = useStore((s) => s.discover.plan)
  const seed = useStore((s) => s.discover.seed)
  const data = useSection('for-you', plan ? seed : 0)
  const openPreview = useStore((s) => s.openPreview)
  const items = data?.items || []
  if (data && !data.loading && items.length === 0) return null
  const pick = items[0]
  return (
    <section className="mb-16">
      <SectionHead
        kicker={copy.home.next.kicker}
        title={copy.home.next.title}
        action={
          <Link to="/descubrir" className="btn btn-sm">
            {copy.home.next.more} <ArrowRight size={14} />
          </Link>
        }
      />
      {!pick ? (
        <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
          <div className="shimmer h-72 rounded-[26px]" />
          <div className="flex gap-5 overflow-hidden">
            {[0, 1, 2].map((i) => (
              <RecCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <button
            onClick={() => openPreview(pick, { reasons: pick.reasons })}
            className="group relative flex gap-5 overflow-hidden rounded-[26px] border border-line p-5 text-left"
          >
            <div className="absolute inset-0 -z-10">
              {pick.coverUrl && <img src={pick.coverUrl} alt="" className="h-full w-full scale-125 object-cover opacity-30 blur-3xl" />}
              <div className="absolute inset-0 bg-surface/70" />
            </div>
            <Cover book={pick} lift className="w-32 shrink-0" />
            <div className="min-w-0">
              <p className="font-hand mb-1 text-[21px] leading-none text-accent">{discoverCopy.topPick}</p>
              <h3 className="font-display text-2xl leading-tight line-clamp-3 group-hover:text-accent">{pick.title}</h3>
              <p className="mt-1 text-sm text-ink-2">{authorsLine(pick.authors, 1)}</p>
              <p className="font-hand mt-3 text-[18px] leading-[1.15] text-ink-2 line-clamp-3">{pick.reasons[0]}</p>
            </div>
          </button>
          <Shelf>
            {items.slice(1, 9).map((it, i) => (
              <RecCard key={it.id} item={it} index={i} width="w-[140px]" showReason={false} />
            ))}
          </Shelf>
        </div>
      )}
    </section>
  )
}

export default function Home() {
  const books = useStore((s) => s.books)
  const profile = useStore((s) => s.profile)
  const insights = useStore((s) => s.insights)
  const openPalette = useStore((s) => s.openPalette)
  const reading = books.filter((b) => b.status === 'reading')
  const want = books.filter((b) => b.status === 'want')
  const recentRead = useMemo(
    () => books.filter((b) => b.status === 'read').sort((a, b) => (b.finishedAt || b.addedAt || '').localeCompare(a.finishedAt || a.addedAt || '')),
    [books],
  )
  const year = new Date().getFullYear()
  const yearCount = readThisYear(books)
  const goal = profile?.readingGoal || 12
  const name = profile?.displayName

  return (
    <div>
      <StringLights className="-mx-4 -mt-8 mb-2 md:-mx-8 md:-mt-12" height={84} swags={3} perSwag={9} />
      <header className="mb-14 grid gap-10 md:mb-20 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="kicker mb-4">{mastheadDate()}</p>
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.2, 0.75, 0.2, 1] }}
            className="font-display text-[2.7rem] leading-[0.98] font-light text-balance md:text-[4.6rem]"
          >
            {greeting()}
            {name ? `, ${name}` : ''}.
            <br />
            <span className="text-ink-2">
              {reading.length ? (
                <>
                  {copy.home.headline.reading(reading.length).lead} <em className="display-wonk text-ink">{copy.home.headline.reading(reading.length).em}</em> {copy.home.headline.reading(reading.length).tail}
                </>
              ) : books.length ? (
                <>
                  {copy.home.headline.shelved.lead} <em className="display-wonk text-ink">{copy.home.headline.shelved.em}</em> {copy.home.headline.shelved.tail}
                </>
              ) : (
                <>
                  {copy.home.headline.empty.lead} <em className="display-wonk text-ink">{copy.home.headline.empty.em}</em> {copy.home.headline.empty.tail}
                </>
              )}
            </span>
          </motion.h1>
          {insights?.archetype && (
            <Link to="/perfil" className="mt-5 inline-flex items-center gap-2 text-sm text-ink-2 hover:text-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> {insights.archetype.name}
            </Link>
          )}
        </div>
        <Link to="/estadisticas" className="flex items-center gap-5 rounded-[26px] border border-line bg-surface p-5 transition hover:border-line-strong">
          <Ring value={yearCount} max={goal} size={104} stroke={7}>
            <div>
              <p className="font-display text-3xl leading-none">{yearCount}</p>
              <p className="font-mono text-[10px] text-ink-3">de {goal}</p>
            </div>
          </Ring>
          <div>
            <p className="kicker">Reto {year}</p>
            <p className="mt-1 max-w-[12rem] font-display text-lg leading-snug">
              {yearCount >= goal ? copy.home.challenge.done(yearCount) : copy.home.challenge.left(goal - yearCount)}
            </p>
          </div>
        </Link>
      </header>

      {books.length === 0 && (
        <EmptyState
          className="mb-16"
          title={copy.home.firstEmpty.title}
          action={
            <>
              <button className="btn btn-primary" onClick={() => openPalette('add')}>
                <Plus size={16} /> {copy.home.firstEmpty.add}
              </button>
              <Link to="/descubrir" className="btn">
                <Compass size={16} /> {copy.home.firstEmpty.discover}
              </Link>
            </>
          }
        >
          {copy.home.firstEmpty.body}
        </EmptyState>
      )}

      {reading.length > 0 && (
        <section className="mb-16">
          <SectionHead kicker={copy.home.reading.kicker} title={copy.home.reading.title} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {reading.map((b, i) => (
              <ReadingCard key={b.id} book={b} index={i} />
            ))}
          </div>
        </section>
      )}

      <NextRead />

      {want.length > 0 && (
        <section className="mb-16">
          <SectionHead
            kicker={copy.home.wantKicker(want.length)}
            title="Quiero leer"
            action={
              <Link to="/biblioteca?tab=want" className="btn btn-sm">
                Ver todos <ArrowRight size={14} />
              </Link>
            }
          />
          <Shelf>
            {want.slice(0, 14).map((b, i) => (
              <div key={b.id} className="w-[140px] sm:w-[160px]">
                <BookTile book={b} index={i} showStatus={false} />
              </div>
            ))}
          </Shelf>
        </section>
      )}

      {recentRead.length > 0 && (
        <section className="mb-10">
          <SectionHead
            kicker={copy.home.recent.kicker}
            title={copy.home.recent.title}
            action={
              <Link to="/biblioteca?tab=read" className="btn btn-sm">
                Ver todos <ArrowRight size={14} />
              </Link>
            }
          />
          <Shelf>
            {recentRead.slice(0, 14).map((b, i) => (
              <div key={b.id} className="w-[140px] sm:w-[160px]">
                <BookTile book={b} index={i} showStatus={false} />
              </div>
            ))}
          </Shelf>
        </section>
      )}

      {books.length > 0 && reading.length === 0 && (
        <div className="mt-6 flex items-center justify-between gap-4 rounded-[26px] border border-dashed border-line-strong p-6">
          <div className="flex items-center gap-4">
            <BookOpen className="text-ink-3" />
            <p className="text-ink-2">{copy.home.nothingOpen}</p>
          </div>
          <button className="btn btn-sm shrink-0" onClick={() => openPalette('add')}>
            <Plus size={14} /> Añadir
          </button>
        </div>
      )}
    </div>
  )
}
