import { useRef } from 'react'
import { Link } from 'react-router'
import { motion, useInView } from 'motion/react'
import { ArrowRight, BookmarkPlus, Check, Play, RefreshCw } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useDiscoverPlan, useSection } from '../hooks/useDiscover'
import RecCard, { RecCardSkeleton, useQuickAdd } from '../components/book/RecCard'
import Cover from '../components/book/Cover'
import Shelf from '../components/book/Shelf'
import { PageTitle, SectionHead } from '../components/ui/Bits'
import StringLights from '../components/ui/StringLights'
import { authorsLine } from '../lib/format'

function ForYouHero({ item }) {
  const openPreview = useStore((s) => s.openPreview)
  const inLibrary = useStore((s) => s.findInLibrary(item))
  const quickAdd = useQuickAdd()
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative mb-8 grid overflow-hidden rounded-[30px] border border-line md:grid-cols-[300px_1fr]"
    >
      <div className="absolute inset-0 -z-10">
        {item.coverUrl && <img src={item.coverUrl} alt="" className="h-full w-full scale-125 object-cover opacity-30 blur-3xl saturate-150" />}
        <div className="absolute inset-0 bg-gradient-to-r from-surface/40 via-surface/85 to-surface" />
        <div className="absolute inset-0 bg-[radial-gradient(70%_90%_at_100%_0%,rgba(60,85,140,0.28),transparent_60%),radial-gradient(50%_60%_at_20%_100%,rgba(240,165,80,0.16),transparent_70%)]" />
      </div>
      <div className="flex items-center justify-center p-8 md:p-10">
        <button onClick={() => openPreview(item, { reasons: item.reasons })} className="w-44 transition hover:-rotate-1 md:w-full" aria-label={`Ver ${item.title}`}>
          <Cover book={item} eager />
        </button>
      </div>
      <div className="flex flex-col justify-center p-7 pt-0 md:p-10 md:pl-2">
        <p className="font-hand mb-2 text-[24px] leading-none text-accent">tu mejor coincidencia</p>
        <h3 className="font-display text-3xl leading-tight text-balance md:text-[2.6rem]">{item.title}</h3>
        <p className="mt-2 text-ink-2">
          {authorsLine(item.authors)}
          {item.year ? ` · ${item.year}` : ''}
          {item.pageCount ? ` · ${item.pageCount} págs.` : ''}
        </p>
        {item.description && <p className="prose-book mt-4 max-w-2xl !text-[15px] line-clamp-4">{item.description}</p>}
        <ul className="mt-5 space-y-1">
          {item.reasons.map((r) => (
            <li key={r} className="font-hand flex gap-2 text-[19px] leading-[1.2] text-ink">
              <span className="mt-[10px] h-1 w-1 shrink-0 rounded-full bg-accent" />
              {r}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-2">
          {inLibrary ? (
            <Link to={`/libro/${inLibrary.id}`} className="btn btn-ink">
              <Check size={15} /> En tu biblioteca
            </Link>
          ) : (
            <button className="btn btn-primary" onClick={() => quickAdd(item, 'want')}>
              <BookmarkPlus size={15} /> Quiero leerlo
            </button>
          )}
          <button className="btn" onClick={() => openPreview(item, { reasons: item.reasons })}>
            Ver ficha completa
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function DiscoverSection({ section, seed, eager }) {
  const ref = useRef(null)
  const inView = useInView(ref, { margin: '500px 0px', once: true })
  const data = useSection(section.key, seed, eager || inView)
  const loading = !data || data.loading
  const items = data?.items || []
  const isForYou = section.key === 'for-you'

  if (!loading && items.length === 0) {
    if (data?.error) {
      return (
        <section ref={ref} className="mb-16">
          <SectionHead title={section.title} subtitle={section.subtitle} />
          <p className="text-sm text-ink-3">No pudimos cargar esta sección ahora mismo ({data.error}).</p>
        </section>
      )
    }
    return <div ref={ref} />
  }

  return (
    <section ref={ref} className="mb-16">
      <SectionHead kicker={isForYou ? 'Recomendaciones' : null} title={section.title} subtitle={section.subtitle} />
      {loading ? (
        <div className="flex gap-5 overflow-hidden">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <RecCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          {isForYou && items[0] && <ForYouHero item={items[0]} />}
          <Shelf>
            {(isForYou ? items.slice(1) : items).map((item, i) => (
              <RecCard key={item.id} item={item} index={i} onDismiss={() => {}} />
            ))}
          </Shelf>
        </>
      )}
    </section>
  )
}

function MoodStrip() {
  const moods = useStore((s) => s.meta.moods)
  return (
    <section className="mb-16">
      <SectionHead kicker="Explorar" title="¿Qué te pide el cuerpo hoy?" subtitle="Elige un estado de ánimo y te mostramos libros reales que encajan con él y contigo." />
      <div className="shelf-scroll !gap-3">
        {moods.map((m, i) => (
          <motion.div key={m.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Link
              to={`/explorar/mood/${m.key}`}
              className="group relative flex h-40 w-56 flex-col justify-end overflow-hidden rounded-[22px] p-5 text-white transition hover:-translate-y-1"
              style={{ background: `linear-gradient(145deg, ${m.colors[0]}, ${m.colors[1]})` }}
            >
              <span className="absolute top-4 right-4 font-mono text-[10px] tracking-widest opacity-60">0{i + 1}</span>
              <div className="absolute -top-6 -right-6 h-28 w-28 rounded-full bg-white/10 blur-xl transition group-hover:scale-125" />
              <p className="font-display text-2xl leading-tight">{m.label}</p>
              <p className="mt-1 text-xs leading-snug text-white/75">{m.blurb}</p>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

function GenreAndThemeIndex() {
  const { genres, themes } = useStore((s) => s.meta)
  return (
    <section className="mb-8 grid gap-12 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <SectionHead title="Por género" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {genres.map((g) => (
            <Link
              key={g.key}
              to={`/explorar/genre/${g.key}`}
              className="group flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5 transition hover:border-line-strong hover:bg-surface-2"
            >
              <span className="h-8 w-6 shrink-0 rounded-[3px] shadow transition group-hover:-rotate-6" style={{ background: `linear-gradient(160deg, ${g.colors[0]}, ${g.colors[1]})` }} />
              <span className="text-sm leading-tight">{g.label}</span>
            </Link>
          ))}
        </div>
      </div>
      <div>
        <SectionHead title="Por tema" />
        <div className="flex flex-wrap gap-2">
          {themes.map((t) => (
            <Link key={t.key} to={`/explorar/theme/${t.key}`} className="chip h-9 px-4">
              {t.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

export default function Discover() {
  const { plan, seed, signals, reload } = useDiscoverPlan()
  const insights = useStore((s) => s.insights)

  return (
    <div>
      <StringLights className="-mx-4 -mt-8 mb-2 md:-mx-8 md:-mt-12" height={76} swags={4} perSwag={8} />
      <PageTitle
        kicker={insights?.archetype ? `Perfil: ${insights.archetype.name}` : 'Descubrir'}
        sub={
          signals > 0
            ? 'Cada recomendación sale de catálogos reales y se explica: tus géneros, tus temas, tus autores y lo que has calificado.'
            : 'Completa tu perfil o añade libros a tu biblioteca para afinar las recomendaciones.'
        }
        right={
          <>
            <Link to="/descubrir/inmersivo" className="btn btn-ink">
              <Play size={14} /> Modo inmersivo
            </Link>
            <button className="btn" onClick={() => reload(seed + 1)} title="Ver otras recomendaciones">
              <RefreshCw size={15} /> Otras ideas
            </button>
          </>
        }
      >
        Tu próxima <em className="display-wonk">lectura</em>
      </PageTitle>

      {!plan ? (
        <div className="mb-16">
          <div className="shimmer mb-8 h-80 rounded-[30px]" />
          <div className="flex gap-5 overflow-hidden">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <RecCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : (
        plan.slice(0, 2).map((s) => <DiscoverSection key={`${s.key}-${seed}`} section={s} seed={seed} eager />)
      )}

      <MoodStrip />

      {plan && plan.slice(2).map((s) => <DiscoverSection key={`${s.key}-${seed}`} section={s} seed={seed} />)}

      <GenreAndThemeIndex />
      <div className="mt-10 flex justify-center">
        <Link to="/descubrir/inmersivo" className="btn">
          Descubrir en modo inmersivo <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  )
}
