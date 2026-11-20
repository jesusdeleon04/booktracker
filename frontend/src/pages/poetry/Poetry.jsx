import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { ArrowRight, BookHeart, Dices, Feather, MoonStar, RefreshCw, Search, Sparkles } from 'lucide-react'
import DiscoveryFeed from '../../components/poetry/DiscoveryFeed'
import StringLights from '../../components/ui/StringLights'
import { SectionHead, Spinner } from '../../components/ui/Bits'
import { JurisdictionSelect, PoetCard, PoemText, Portrait, RightsBadge, Skeleton, SourceErrors, useJurisdiction } from '../../components/poetry/PoetryBits'
import { authorPath, lifespan, poemPath, poetryApi, stanzas } from '../../lib/poetry'
import { usePoetry } from '../../store/usePoetry'
import { useStore } from '../../store/useStore'

function DailyPoem() {
  const [j] = useJurisdiction()
  const [state, setState] = useState({ status: 'loading' })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const ctrl = new AbortController()
    setState({ status: 'loading' })
    poetryApi
      .daily(ctrl.signal)
      .then((poem) => setState({ status: 'ready', poem }))
      .catch((err) => err.name !== 'AbortError' && setState({ status: 'error', error: err.message }))
    return () => ctrl.abort()
  }, [j, retry])

  if (state.status === 'loading')
    return (
      <div className="poem-sheet poem-paper-crema mx-auto max-w-2xl px-8 py-10">
        <Skeleton className="mb-3 h-8 w-2/3 !bg-[rgba(60,40,22,0.08)]" />
        <Skeleton className="mb-8 h-4 w-1/3 !bg-[rgba(60,40,22,0.08)]" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="mb-2.5 h-4 !bg-[rgba(60,40,22,0.06)]" />
        ))}
      </div>
    )
  if (state.status === 'error')
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-line-strong p-8 text-center">
        <p className="text-ink-2">No hemos podido traer el poema del día: {state.error}</p>
        <button className="btn btn-sm mt-4" onClick={() => setRetry((r) => r + 1)}>
          <RefreshCw size={14} /> Reintentar
        </button>
      </div>
    )
  const p = state.poem
  const first = stanzas(p.lines || []).slice(0, 4)
  const shown = first.reduce((n, s) => n + s.length, 0)
  const day = new Date(`${p.day}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <motion.article initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="poem-sheet poem-paper-crema relative mx-auto w-full max-w-3xl px-7 pt-10 pb-7 md:px-14">
      <p className="poem-accent mb-4 text-center font-mono text-[11px] tracking-[0.2em] uppercase">Poema del día · {day}</p>
      <h2 className="poem-title text-center text-[2.3rem] md:text-[3.2rem]">{p.title}</h2>
      {p.altTitle && <p className="poem-meta mt-1 text-center font-serif italic">{p.altTitle}</p>}
      <p className="poem-accent mt-2 text-center font-serif text-lg italic">
        {p.author?.name} <span className="poem-meta not-italic">· {lifespan(p.author)}</span>
      </p>
      <div className="poem-ornament my-6 text-xs">✦</div>
      {p.lines ? (
        <div className="mx-auto w-fit max-w-full">
          <PoemText lines={first.flatMap((s, i) => (i ? ['', ...s] : s))} className="font-serif text-[1.2rem] leading-[1.7] md:text-[1.3rem]" />
        </div>
      ) : (
        <p className="poem-meta text-center font-serif italic">{p.rights.explanation}</p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(60,40,22,0.14)] pt-4">
        <span className="poem-meta font-mono text-[11px]">
          {p.source.name} · <RightsBadge rights={p.rights} short />
        </span>
        <Link to={poemPath(p.id)} className="btn btn-sm border-[rgba(60,40,22,0.25)] bg-[rgba(60,40,22,0.06)] text-[#2a1e15]">
          {p.linecount > shown ? `Leer los ${p.linecount} versos` : 'Abrir en el lector'} <ArrowRight size={14} />
        </Link>
      </div>
    </motion.article>
  )
}

function Row({ title, subtitle, poets, to }) {
  return (
    <section className="mb-12">
      <SectionHead
        title={title}
        subtitle={subtitle}
        action={
          to && (
            <Link to={to} className="btn btn-sm btn-ghost">
              Ver todos <ArrowRight size={14} />
            </Link>
          )
        }
      />
      <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {poets.map((p) => (
          <div key={p.qid} className="w-[15.5rem] shrink-0 snap-start">
            <PoetCard poet={p} />
          </div>
        ))}
      </div>
    </section>
  )
}

export default function Poetry() {
  const navigate = useNavigate()
  const [j] = useJurisdiction()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [feedOpen, setFeedOpen] = useState(false)
  const items = usePoetry((s) => s.items)
  const init = usePoetry((s) => s.init)

  useEffect(() => init(), [init])
  useEffect(() => {
    const ctrl = new AbortController()
    poetryApi
      .explore(ctrl.signal)
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((err) => err.name !== 'AbortError' && setError(err.message))
    return () => ctrl.abort()
  }, [j])

  const submit = (e) => {
    e.preventDefault()
    if (q.trim()) navigate(`/poesia/buscar?q=${encodeURIComponent(q.trim())}`)
  }

  const Side = ({ title, kicker, children }) => (
    <section className="rounded-3xl border border-line bg-surface/50 p-4">
      {kicker && <p className="kicker kicker-dusk mb-1">{kicker}</p>}
      <h2 className="mb-3 font-display text-xl leading-tight">{title}</h2>
      {children}
    </section>
  )
  const sideSkeleton = <Skeleton className="h-40" />

  return (
    <div>
      <header className="dusk-sky relative -mx-4 -mt-6 mb-8 overflow-hidden px-4 pt-14 pb-6 md:-mx-8 md:px-8">
        <StringLights swags={4} perSwag={8} height={52} className="pointer-events-none absolute inset-x-0 top-0 opacity-90" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="kicker kicker-dusk mb-2 inline-flex items-center gap-2">
              <MoonStar size={14} /> Biblioteca de poesía
            </p>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-display text-[2rem] leading-[1] font-light text-balance md:text-[2.8rem]"
            >
              Una antología que <em className="display-wonk">se lee</em> a la hora azul
            </motion.h1>
          </div>
          <form onSubmit={submit} className="relative w-full lg:w-[22rem]">
            <Search size={15} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
            <input
              className="field h-11 rounded-full pr-20 pl-10 text-sm"
              placeholder="Buscar autor, verso, tema…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Buscar poesía"
            />
            <button className="btn btn-sm btn-primary absolute top-1.5 right-1.5 h-8 rounded-full px-3" type="submit">
              Buscar
            </button>
          </form>
        </div>
      </header>

      {error && !data && <SourceErrors errors={[{ message: `No se pudo cargar la exploración: ${error}` }]} />}
      {data && <SourceErrors errors={data.errors} />}

      <div className="mb-14 grid gap-6 xl:grid-cols-[16rem_minmax(0,1fr)_16rem] xl:items-start">
        {/* Centre: the poem of the day */}
        <div className="min-w-0 xl:order-2">
          <DailyPoem />
        </div>

        {/* Left: ways in */}
        <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 xl:order-1 xl:block xl:space-y-4">
          {data ? (
            <>
              <Side kicker="Por temas" title="¿De qué quieres leer?">
                <div className="flex flex-wrap gap-1.5">
                  {data.themes.map((t) => (
                    <Link key={t.key} to={`/poesia/buscar?tema=${t.key}`} className="chip !h-8 !px-3 text-[13px]">
                      {t.label}
                    </Link>
                  ))}
                </div>
              </Side>
              <Side kicker="Épocas" title="Un paseo por los siglos">
                <div className="flex flex-wrap gap-1.5">
                  {data.eras.map((e) => (
                    <Link key={e.key} to={`/poesia/poetas?epoca=${e.key}`} className="chip !h-8 !px-3 text-[13px]">
                      {e.label}
                    </Link>
                  ))}
                </div>
              </Side>
              <div className="md:col-span-2 xl:col-span-1">
                <Side kicker="Movimientos" title="Escuelas y generaciones">
                  <ul className="-mx-2">
                    {data.movements.map((m) => (
                      <li key={m.key}>
                        <Link to={`/poesia/poetas?movimiento=${m.key}`} className="group flex items-baseline justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                          <span className="group-hover:text-dusk">{m.label}</span>
                          <span className="font-mono text-[11px] text-ink-3">{m.count}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Side>
              </div>
            </>
          ) : (
            sideSkeleton
          )}
        </div>

        {/* Right: your library and featured voices */}
        <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 xl:order-3 xl:block xl:space-y-4">
          <Side kicker="Tu rincón" title="Seguir leyendo">
            <div className="flex flex-col gap-2">
              <button className="btn w-full justify-start" onClick={() => setFeedOpen(true)}>
                <Dices size={16} /> Descubrimiento al azar
              </button>
              <Link to="/poesia/coleccion" className="btn w-full justify-start">
                <BookHeart size={16} /> Mi colección {items.length ? <span className="ml-auto font-mono text-xs opacity-60">{items.length}</span> : null}
              </Link>
              <Link to="/estudio" className="btn btn-ghost w-full justify-start">
                <Feather size={16} /> Escribir en el estudio
              </Link>
            </div>
          </Side>
          {data ? (
            <Side kicker="Autores destacados" title="Voces para empezar">
              <div className="-mx-1 space-y-1">
                {data.featured.slice(0, 8).map((p) => (
                  <Link key={p.qid} to={authorPath(p.qid)} className="group flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-surface-2">
                    <Portrait poet={p} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[1.05rem] leading-tight group-hover:text-dusk">{p.name}</span>
                      <span className="font-mono text-[10.5px] text-ink-3">{lifespan(p)}</span>
                    </span>
                    <span className="h-2 w-2 shrink-0 rounded-full" title={p.rights?.label} style={{ background: p.rights?.status === 'public_domain' ? 'var(--sage)' : 'var(--ember)' }} />
                  </Link>
                ))}
              </div>
              <Link to="/poesia/poetas" className="mt-2 inline-flex items-center gap-1 text-sm text-dusk">
                Ver todos los autores <ArrowRight size={13} />
              </Link>
            </Side>
          ) : (
            sideSkeleton
          )}
        </div>
      </div>

      {data && data.sections.map((s) => <Row key={s.key} title={s.title} subtitle={s.subtitle} poets={s.poets} to={`/poesia/poetas?seccion=${s.key}`} />)}

      <aside className="mt-6 rounded-3xl border border-line bg-surface/60 p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <p className="font-display text-xl">Derechos de autor, con prudencia</p>
            <p className="mt-1 text-sm text-ink-2">
              Mostramos el texto completo solo si es de dominio público o tiene licencia abierta en la jurisdicción elegida (comprobamos las fechas de autor y traductor). Para obras protegidas o dudosas verás la referencia y el enlace a la fuente.
            </p>
          </div>
          <JurisdictionSelect />
        </div>
      </aside>
      <DiscoveryFeed open={feedOpen} onClose={() => setFeedOpen(false)} />
    </div>
  )
}
