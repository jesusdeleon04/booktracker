import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { Plus } from 'lucide-react'
import { useStore } from '../store/useStore'
import Cover from '../components/book/Cover'
import Stars from '../components/ui/Stars'
import { EmptyState, PageTitle, Ring, Segmented } from '../components/ui/Bits'
import { availableYears, computeStats } from '../lib/stats'
import { MONTHS_SHORT, monthName, num, plural } from '../lib/format'
import { hashString } from '../lib/match'

function Card({ children, className = '', delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ delay, duration: 0.55, ease: [0.2, 0.75, 0.2, 1] }}
      className={`rounded-[26px] border border-line bg-surface p-6 ${className}`}
    >
      {children}
    </motion.div>
  )
}

function BigNumber({ label, value, sub, delay }) {
  return (
    <Card delay={delay} className="flex flex-col justify-between">
      <p className="kicker">{label}</p>
      <p className="mt-6 font-display text-5xl leading-none font-light">{value}</p>
      {sub && <p className="mt-2 text-sm text-ink-3">{sub}</p>}
    </Card>
  )
}

/** Each month is a little shelf; each finished book is a spine. */
function MonthShelves({ months, genreMap }) {
  const navigate = useNavigate()
  const [hover, setHover] = useState(null)
  // Books stand upright: thickness ~ pages, height varies a little per title.
  const thickness = (b) => Math.max(12, Math.min(30, (b.pageCount || 280) / 22))
  return (
    <div>
      <div className="flex h-48 items-end gap-1 sm:gap-2">
        {months.map((books, i) => (
          <div key={i} className="flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] overflow-hidden px-0.5">
            {books.length === 0 && <span className="mb-0.5 h-3 w-full rounded-[1px] bg-surface-3/40" />}
            {books.map((b, j) => {
              const g = genreMap[b.genres?.[0]]
              const h = 62 + (hashString(b.title) % 34)
              return (
                <motion.button
                  key={b.id}
                  initial={{ opacity: 0, scaleY: 0 }}
                  animate={{ opacity: 1, scaleY: 1 }}
                  transition={{ delay: 0.1 + i * 0.05 + j * 0.06, type: 'spring', damping: 16 }}
                  onMouseEnter={() => setHover(b)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(b)}
                  onClick={() => navigate(`/libro/${b.id}`)}
                  className="relative origin-bottom rounded-t-[3px] shadow-md transition-[filter,translate] hover:-translate-y-1 hover:brightness-125"
                  style={{
                    height: `${h}%`,
                    flex: `0 1 ${thickness(b)}px`,
                    minWidth: 3,
                    background: g ? `linear-gradient(180deg, ${g.colors[1]}, ${g.colors[0]})` : 'var(--surface-3)',
                  }}
                  aria-label={`${b.title}, terminado en ${monthName(i)}`}
                >
                  <span className="absolute inset-x-0 top-[14%] h-px bg-white/30" />
                  <span className="absolute inset-x-0 bottom-[12%] h-px bg-white/20" />
                </motion.button>
              )
            })}
          </div>
        ))}
      </div>
      <div className="h-2 rounded-sm bg-gradient-to-b from-surface-3 to-surface-2 shadow-[0_6px_14px_-6px_rgba(0,0,0,0.6)]" />
      <div className="mt-2 flex gap-1 sm:gap-2">
        {months.map((books, i) => (
          <div key={i} className="flex-1 text-center">
            <p className="font-mono text-[10px] text-ink-3 uppercase">{MONTHS_SHORT[i]}</p>
            <p className="font-display text-sm">{books.length || '·'}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 h-5 text-center text-sm text-ink-2">
        {hover ? (
          <>
            <span className="font-display italic">{hover.title}</span> · {hover.authors[0]}
            {hover.pageCount ? ` · ${hover.pageCount} págs.` : ''}
          </>
        ) : (
          <span className="text-ink-3">Cada lomo es un libro terminado: su color indica el género y su grosor, las páginas.</span>
        )}
      </p>
    </div>
  )
}

function YearBars({ years }) {
  const max = Math.max(1, ...years.map((y) => y.count))
  return (
    <div className="flex h-48 items-end gap-3">
      {years.map((y, i) => (
        <div key={y.year} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
          <span className="font-display text-sm">{y.count}</span>
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: `${(y.count / max) * 78}%` }}
            transition={{ delay: i * 0.06, duration: 0.8, ease: [0.2, 0.75, 0.2, 1] }}
            className="w-full max-w-14 rounded-t-lg"
            style={{ background: i === years.length - 1 ? 'var(--accent)' : 'var(--surface-3)' }}
          />
          <span className="font-mono text-[10px] text-ink-3">{y.year}</span>
        </div>
      ))}
    </div>
  )
}

export default function Stats() {
  const books = useStore((s) => s.books)
  const genreMap = useStore((s) => s.genreMap)
  const profile = useStore((s) => s.profile)
  const openPalette = useStore((s) => s.openPalette)
  const years = useMemo(() => availableYears(books), [books])
  const [year, setYear] = useState(years[0])
  const st = useMemo(() => computeStats(books, year), [books, year])
  const isYear = year !== 'all'
  const goal = profile?.readingGoal || 12

  const options = [...years.map((y) => ({ value: y, label: String(y) })), { value: 'all', label: 'Siempre' }]

  if (books.length === 0) {
    return (
      <div>
        <PageTitle kicker="Estadísticas">
          Tu vida <em className="display-wonk">lectora</em>
        </PageTitle>
        <EmptyState
          title="Aún no hay nada que contar"
          action={
            <button className="btn btn-primary" onClick={() => openPalette('add')}>
              <Plus size={16} /> Añadir libros
            </button>
          }
        >
          Cuando añadas y termines libros, aquí verás tu evolución: géneros, autores, páginas, ritmo y récords.
        </EmptyState>
      </div>
    )
  }

  return (
    <div>
      <PageTitle kicker="Estadísticas" right={<Segmented options={options} value={year} onChange={setYear} layoutId="year-tabs" />}>
        {isYear ? (
          <>
            Tu {year} en <em className="display-wonk">libros</em>
          </>
        ) : (
          <>
            Tu vida <em className="display-wonk">lectora</em>
          </>
        )}
      </PageTitle>

      {/* Hero */}
      <Card className="mb-5 grid gap-8 overflow-hidden md:grid-cols-[1fr_auto] md:items-center md:p-10">
        <div>
          <p className="font-display text-[2.2rem] leading-[1.05] font-light text-balance md:text-[3.4rem]">
            {isYear ? `En ${year} has leído ` : 'Has leído '}
            <em className="display-wonk text-accent">{plural(st.readCount, 'libro', 'libros')}</em>
            {st.pages > 0 && (
              <>
                {' '}
                y <em className="display-wonk">{num(st.pages)}</em> páginas
              </>
            )}
            .
          </p>
          {st.inScope.length > 0 && (
            <div className="mt-6 flex -space-x-4">
              {st.inScope.slice(0, 9).map((b, i) => (
                <Link key={b.id} to={`/libro/${b.id}`} className="w-14 transition hover:z-10 hover:-translate-y-2" style={{ transform: `rotate(${(i % 3) - 1}deg)` }}>
                  <Cover book={b} compact />
                </Link>
              ))}
            </div>
          )}
        </div>
        {isYear && year === new Date().getFullYear() && (
          <div className="flex items-center gap-4">
            <Ring value={st.readCount} max={goal} size={132} stroke={8}>
              <div>
                <p className="font-display text-4xl leading-none">{Math.round(Math.min(1, st.readCount / goal) * 100)}%</p>
                <p className="font-mono text-[10px] text-ink-3">del reto</p>
              </div>
            </Ring>
            <div className="text-sm text-ink-2">
              <p>
                Meta: <span className="text-ink">{goal} libros</span>
              </p>
              <Link to="/perfil" className="text-accent hover:underline">
                Cambiar meta
              </Link>
            </div>
          </div>
        )}
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-5 lg:grid-cols-4">
        <BigNumber label="Leídos en total" value={num(st.allReadCount)} sub="desde que usas Booktracker" delay={0.05} />
        <BigNumber label="Leyendo ahora" value={st.readingCount} sub="libros abiertos" delay={0.1} />
        <BigNumber label="Pendientes" value={st.wantCount} sub="en «Quiero leer»" delay={0.15} />
        <BigNumber
          label="Valoración media"
          value={st.avgRating ? st.avgRating.toFixed(1).replace('.', ',') : '—'}
          sub={st.ratedCount ? `sobre ${plural(st.ratedCount, 'libro calificado', 'libros calificados')}` : 'aún sin calificaciones'}
          delay={0.2}
        />
      </div>

      {isYear && (
        <Card className="mb-5">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="kicker">Evolución mensual</p>
              <h2 className="mt-1 font-display text-2xl">Cada mes, un estante</h2>
            </div>
            {st.withPages > 0 && <p className="hidden text-sm text-ink-3 sm:block">{num(Math.round(st.pages / 12))} páginas / mes de media</p>}
          </div>
          <MonthShelves months={st.months} genreMap={genreMap} />
        </Card>
      )}

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <p className="kicker">Géneros más frecuentes</p>
          <h2 className="mt-1 mb-6 font-display text-2xl">Lo que más lees</h2>
          {st.genres.length ? (
            <div className="space-y-3.5">
              {st.genres.slice(0, 8).map((g, i) => {
                const gm = genreMap[g.key]
                return (
                  <div key={g.key}>
                    <div className="mb-1 flex justify-between text-sm">
                      <Link to={`/biblioteca?genero=${g.key}`} className="hover:text-accent">
                        {gm?.label || g.key}
                      </Link>
                      <span className="font-mono text-xs text-ink-3">{Math.round(g.share * 100)}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-surface-3">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: gm ? `linear-gradient(90deg, ${gm.colors[0]}, ${gm.colors[1]})` : 'var(--accent)' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${(g.value / st.genres[0].value) * 100}%` }}
                        transition={{ delay: i * 0.06, duration: 0.8 }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-ink-3">Sin libros terminados en este periodo.</p>
          )}
        </Card>

        <Card>
          <p className="kicker">Autores más leídos</p>
          <h2 className="mt-1 mb-5 font-display text-2xl">Tus voces de cabecera</h2>
          {st.authors.length ? (
            <ol className="divide-y divide-line">
              {st.authors.slice(0, 6).map((a, i) => (
                <li key={a.name} className="flex items-center gap-4 py-2.5">
                  <span className="w-6 font-display text-2xl text-ink-3">{i + 1}</span>
                  <div className="flex -space-x-3">
                    {a.covers.slice(0, 3).map((b) => (
                      <Cover key={b.id} book={b} compact className="w-8" />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link to={`/biblioteca?autor=${encodeURIComponent(a.name)}`} className="block truncate font-medium hover:text-accent">
                      {a.name}
                    </Link>
                    <p className="text-xs text-ink-3">{plural(a.count, 'libro', 'libros')}</p>
                  </div>
                  {a.avg != null && <Stars value={Math.round(a.avg * 2) / 2} size={12} />}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-ink-3">Sin libros terminados en este periodo.</p>
          )}
        </Card>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <Card>
          <p className="kicker">Calificaciones</p>
          <h2 className="mt-1 mb-6 font-display text-2xl">Cómo puntúas</h2>
          <div className="space-y-2.5">
            {[5, 4, 3, 2, 1].map((s) => {
              const v = st.dist[s - 1]
              const maxD = Math.max(1, ...st.dist)
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="w-16 text-right font-mono text-xs text-brass">{'★'.repeat(s)}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-surface-3">
                    <motion.div
                      className="h-full rounded bg-brass"
                      initial={{ width: 0 }}
                      animate={{ width: `${(v / maxD) * 100}%` }}
                      transition={{ duration: 0.8 }}
                    />
                  </div>
                  <span className="w-6 font-mono text-xs text-ink-3">{v}</span>
                </div>
              )
            })}
          </div>
        </Card>

        <Card>
          <p className="kicker">Evolución anual</p>
          <h2 className="mt-1 mb-6 font-display text-2xl">Año tras año</h2>
          {st.years.length ? (
            <YearBars years={st.years} />
          ) : (
            <p className="text-sm text-ink-3">Marca la fecha en que terminas cada libro para ver tu evolución.</p>
          )}
        </Card>
      </div>

      <Card>
        <p className="kicker">Récords {isYear ? `de ${year}` : ''}</p>
        <h2 className="mt-1 mb-6 font-display text-2xl">Momentos destacados</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['Tu favorito', st.records.favorite, (b) => <Stars value={b.rating} size={12} />],
            ['El más largo', st.records.longest, (b) => `${num(b.pageCount)} páginas`],
            ['El más breve', st.records.shortest, (b) => `${num(b.pageCount)} páginas`],
            ['El más antiguo', st.records.oldest, (b) => `Publicado en ${b.year}`],
            ['Lectura más rápida', st.records.fastest?.b, () => (st.records.fastest.days === 0 ? 'En un día' : `En ${st.records.fastest.days} días`)],
          ].map(([label, b, sub]) => (
            <div key={label} className="flex gap-3">
              {b ? (
                <>
                  <Link to={`/libro/${b.id}`} className="w-14 shrink-0">
                    <Cover book={b} compact lift />
                  </Link>
                  <div className="min-w-0">
                    <p className="kicker !text-[10px]">{label}</p>
                    <Link to={`/libro/${b.id}`} className="mt-1 block font-display leading-tight line-clamp-2 hover:text-accent">
                      {b.title}
                    </Link>
                    <div className="mt-1 text-xs text-ink-3">{sub(b)}</div>
                  </div>
                </>
              ) : (
                <div>
                  <p className="kicker !text-[10px]">{label}</p>
                  <p className="mt-1 text-sm text-ink-3">Sin datos suficientes</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
