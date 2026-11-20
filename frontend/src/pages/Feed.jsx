import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { BookmarkPlus, Check, ChevronDown, Info, Sparkles, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { api } from '../lib/api'
import Cover from '../components/book/Cover'
import BookPreview from '../components/book/BookPreview'
import { Spinner } from '../components/ui/Bits'
import { useDiscoverPlan } from '../hooks/useDiscover'
import { useQuickAdd } from '../components/book/RecCard'
import { authorsLine } from '../lib/format'

function Slide({ entry, active, onNext }) {
  const { item, section } = entry
  const openPreview = useStore((s) => s.openPreview)
  const inLibrary = useStore((s) => s.findInLibrary(item))
  const feedback = useStore((s) => s.feedback)
  const genreMap = useStore((s) => s.genreMap)
  const quickAdd = useQuickAdd()
  const [done, setDone] = useState(null)

  const act = async (kind) => {
    if (kind === 'want' || kind === 'read') {
      const res = await quickAdd(item, kind)
      if (res.book) setDone(kind)
      setTimeout(onNext, 450)
    } else if (kind === 'dismiss') {
      await feedback(item, 'dismiss')
      setDone('dismiss')
      setTimeout(onNext, 250)
    }
  }

  const genre = genreMap[item.genres?.[0]]
  const status = done || (inLibrary ? inLibrary.status : null)

  return (
    <section className="relative flex h-dvh snap-start snap-always items-center justify-center overflow-hidden">
      <div className="absolute inset-0 -z-10">
        {item.coverUrl && <img src={item.coverUrl} alt="" className="h-full w-full scale-125 object-cover opacity-45 blur-[70px] saturate-150" />}
        <div className="absolute inset-0" style={{ background: genre ? `linear-gradient(180deg, ${genre.colors[0]}55, transparent 40%, var(--bg) 92%)` : 'linear-gradient(180deg, transparent, var(--bg) 92%)' }} />
      </div>

      <div className="mx-auto flex h-full w-full max-w-5xl flex-col items-center justify-center gap-6 px-6 pt-16 pb-10 md:flex-row md:gap-14">
        <motion.div
          className="w-[46vw] max-w-[260px] min-w-[150px] md:w-[300px] md:max-w-none"
          animate={active ? { y: [0, -8, 0], rotate: [-1.5, -0.5, -1.5] } : { y: 0 }}
          transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
        >
          <button onClick={() => openPreview(item, { reasons: item.reasons })} aria-label="Ver ficha" className="block w-full">
            <Cover book={item} eager={active} />
          </button>
        </motion.div>

        <div className="w-full max-w-lg pr-14 md:pr-0">
          <p className="kicker mb-2 flex items-center gap-1.5 !text-ink-2">
            <Sparkles size={12} className="text-accent" /> {section}
          </p>
          <h2 className="font-display text-3xl leading-[1.05] text-balance md:text-5xl">{item.title}</h2>
          <p className="mt-2 text-ink-2">
            {authorsLine(item.authors)}
            {item.year ? ` · ${item.year}` : ''}
            {item.pageCount ? ` · ${item.pageCount} págs.` : ''}
          </p>
          {item.description && <p className="prose-book mt-4 !text-[15px] line-clamp-4">{item.description}</p>}
          <ul className="mt-4 space-y-1.5">
            {item.reasons.slice(0, 2).map((r) => (
              <li key={r} className="font-hand flex gap-2 text-[21px] leading-[1.15] text-ink">
                <span className="mt-[11px] h-1 w-1 shrink-0 rounded-full bg-accent" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Action rail */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-4 md:right-8 md:bottom-1/2 md:translate-y-1/2">
        {[
          { k: 'want', icon: BookmarkPlus, label: 'Quiero leer', on: status === 'want' },
          { k: 'read', icon: Check, label: 'Ya lo leí', on: status === 'read' },
          { k: 'dismiss', icon: X, label: 'No me interesa', on: status === 'dismiss' },
          { k: 'info', icon: Info, label: 'Detalles' },
        ].map((a) => (
          <button
            key={a.k}
            onClick={() => (a.k === 'info' ? openPreview(item, { reasons: item.reasons }) : act(a.k))}
            disabled={(!!inLibrary || !!done) && a.k !== 'info'}
            className="group flex flex-col items-center gap-1 disabled:opacity-60"
            aria-label={a.label}
          >
            <span
              className={`grid h-12 w-12 place-items-center rounded-full border backdrop-blur-md transition group-hover:scale-110 ${a.on ? 'border-transparent bg-accent text-accent-ink' : 'border-line-strong bg-bg/50 text-ink'}`}
            >
              <a.icon size={20} />
            </span>
            <span className="text-[10.5px] font-medium text-ink-2">{a.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export default function Feed() {
  const navigate = useNavigate()
  const { plan, seed } = useDiscoverPlan()
  const sections = useStore((s) => s.discover.sections)
  const setSection = useStore((s) => s.setSection)
  const [active, setActive] = useState(0)
  const scroller = useRef(null)
  const loadingRef = useRef(false)

  // Load shelves one after another, so the first slides appear quickly.
  useEffect(() => {
    if (!plan || loadingRef.current) return
    loadingRef.current = true
    ;(async () => {
      for (const s of plan) {
        if (useStore.getState().discover.sections[s.key]?.items?.length) continue
        try {
          const d = await api.section(s.key, seed)
          setSection(s.key, { ...d, loading: false })
        } catch {
          /* skip section */
        }
      }
    })()
  }, [plan, seed, setSection])

  const entries = useMemo(() => {
    if (!plan) return []
    const seen = new Set()
    const out = []
    // Interleave shelves for variety: 2 from each shelf in turn.
    const queues = plan.map((s) => ({ title: s.title, items: [...(sections[s.key]?.items || [])] }))
    let added = true
    while (added) {
      added = false
      for (const q of queues) {
        for (let k = 0; k < 2 && q.items.length; k++) {
          const item = q.items.shift()
          if (!seen.has(item.id)) {
            seen.add(item.id)
            out.push({ item, section: q.title })
            added = true
          }
        }
      }
    }
    return out
  }, [plan, sections])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onScroll = () => setActive(Math.round(el.scrollTop / el.clientHeight))
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [entries.length > 0])

  const goTo = (i) => {
    const el = scroller.current
    if (el) el.scrollTo({ top: i * el.clientHeight, behavior: 'smooth' })
  }

  useEffect(() => {
    const onKey = (e) => {
      if (useStore.getState().preview) return
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        goTo(Math.min(entries.length - 1, active + 1))
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        goTo(Math.max(0, active - 1))
      } else if (e.key === 'Escape') {
        navigate('/descubrir')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="fixed inset-0 bg-bg">
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-bg/80 to-transparent px-4 py-4 md:px-8">
        <p className="kicker">
          Modo inmersivo {entries.length ? `· ${Math.min(active + 1, entries.length)} / ${entries.length}` : ''}
        </p>
        <button className="btn btn-sm border-line-strong bg-bg/40 backdrop-blur" onClick={() => navigate('/descubrir')}>
          <X size={15} /> Salir
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="grid h-full place-items-center text-center">
          <div>
            <Spinner className="mx-auto mb-3 text-accent" size={24} />
            <p className="font-display text-2xl">Preparando tu feed de libros…</p>
            <p className="mt-1 text-sm text-ink-3">Buscando en catálogos reales según tu perfil.</p>
          </div>
        </div>
      ) : (
        <div ref={scroller} className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll">
          {entries.map((e, i) => (
            <Slide key={e.item.id} entry={e} active={i === active} onNext={() => goTo(i + 1)} />
          ))}
          <section className="grid h-dvh snap-start place-items-center text-center">
            <div>
              <p className="font-display text-3xl">Has llegado al final… por ahora.</p>
              <p className="mt-2 text-ink-2">Califica lo que leas y vuelve: el feed aprende de ti.</p>
              <button className="btn btn-primary mt-6" onClick={() => navigate('/descubrir')}>
                Volver a Descubrir
              </button>
            </div>
          </section>
        </div>
      )}

      {entries.length > 0 && active === 0 && (
        <motion.div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center text-ink-3" animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.6 }}>
          <ChevronDown size={22} />
        </motion.div>
      )}
      <BookPreview />
    </div>
  )
}
