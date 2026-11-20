import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from 'motion/react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GraduationCap,
  Heart,
  Lightbulb,
  Plus,
  Sailboat,
  Search,
  Star,
  X,
} from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import Cover from '../components/book/Cover'
import { Spinner } from '../components/ui/Bits'
import { Wordmark } from '../components/layout/AppShell'
import Motif from './onboarding/Motifs'
import StringLights from '../components/ui/StringLights'
import { Fleuron } from '../components/ui/BookPage'
import { authorsLine } from '../lib/format'

const QUESTIONS = [
  {
    key: 'complexity',
    q: '¿Qué tipo de historias prefieres?',
    a: { v: -1, label: 'Sencillas', desc: 'Directas y fluidas, que se leen solas.', motif: 'simple' },
    b: { v: 1, label: 'Complejas', desc: 'Con capas, ambigüedad y segundas lecturas.', motif: 'complex' },
  },
  {
    key: 'length',
    q: '¿Libros cortos o extensos?',
    a: { v: -1, label: 'Cortos', desc: 'Menos de 250 páginas, intensos.', motif: 'short' },
    b: { v: 1, label: 'Extensos', desc: 'Tomos, sagas, mundos enteros.', motif: 'long' },
  },
  {
    key: 'pace',
    q: '¿Introspección o acción?',
    a: { v: -1, label: 'Introspectivas', desc: 'Lo que ocurre por dentro de los personajes.', motif: 'introspective' },
    b: { v: 1, label: 'Llenas de acción', desc: 'Giros, persecuciones, ritmo constante.', motif: 'action' },
  },
  {
    key: 'focus',
    q: '¿Qué te atrapa más?',
    a: { v: -1, label: 'Personajes complejos', desc: 'Gente que parece real y te acompaña.', motif: 'characters' },
    b: { v: 1, label: 'Tramas elaboradas', desc: 'Engranajes, misterios, estructura.', motif: 'plot' },
  },
  {
    key: 'era',
    q: '¿Clásicos o contemporáneos?',
    a: { v: -1, label: 'Literatura clásica', desc: 'Obras que han resistido al tiempo.', motif: 'classic' },
    b: { v: 1, label: 'Literatura contemporánea', desc: 'Voces y temas de nuestro tiempo.', motif: 'contemporary' },
  },
]

const PURPOSES = [
  { key: 'pensar', label: 'Pensar', desc: 'Ideas que incomodan y abren preguntas.', icon: Lightbulb, color: '#D3AE66' },
  { key: 'sentir', label: 'Sentir', desc: 'Historias que te atraviesan.', icon: Heart, color: '#E2603A' },
  { key: 'aprender', label: 'Aprender', desc: 'Entender cómo funciona el mundo.', icon: GraduationCap, color: '#98B08E' },
  { key: 'escapar', label: 'Escapar', desc: 'Otros mundos, otras vidas.', icon: Sailboat, color: '#7B8FB8' },
]

const LANGS = [
  { key: 'es', label: 'Español', desc: 'Prioriza ediciones en castellano.' },
  { key: 'en', label: 'English', desc: 'Prefer English editions.' },
  { key: 'any', label: 'Me da igual', desc: 'Ediciones originales o la más conocida.' },
]

const STEPS = ['genres', 'taste', 'swipe', 'favorites', 'reveal']

function useDebounced(value, delay = 350) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

const slide = {
  initial: (dir) => ({ opacity: 0, x: dir * 60 }),
  animate: { opacity: 1, x: 0, transition: { duration: 0.5, ease: [0.2, 0.75, 0.2, 1] } },
  exit: (dir) => ({ opacity: 0, x: dir * -60, transition: { duration: 0.25 } }),
}

export default function Onboarding() {
  const navigate = useNavigate()
  const meta = useStore((s) => s.meta)
  const profile = useStore((s) => s.profile)
  const completeOnboarding = useStore((s) => s.completeOnboarding)
  const toast = useStore((s) => s.toast)

  const [step, setStep] = useState(-1) // -1 = welcome
  const [dir, setDir] = useState(1)
  const [name, setName] = useState(profile?.displayName || '')
  const [genres, setGenres] = useState(profile?.genres || [])
  const [prefs, setPrefs] = useState({ complexity: 0, length: 0, pace: 0, focus: 0, era: 0, purposes: [], language: 'es', ...(profile?.preferences || {}) })
  const [swipes, setSwipes] = useState([])
  const [authors, setAuthors] = useState(profile?.favoriteAuthors || [])
  const [favBooks, setFavBooks] = useState([])
  const [addToLibrary, setAddToLibrary] = useState(true)
  const [covers, setCovers] = useState(null)
  const [deck, setDeck] = useState(null)
  const deckKey = useRef('')

  useEffect(() => {
    api
      .get('/onboarding/genres', { lang: 'es' })
      .then(setCovers)
      .catch(() => setCovers({}))
  }, [])

  const loadDeck = useCallback((g, lang) => {
    const key = `${g.join(',')}|${lang}`
    if (deckKey.current === key) return
    deckKey.current = key
    setDeck(null)
    api
      .get('/onboarding/deck', { genres: g.join(','), lang })
      .then((d) => deckKey.current === key && setDeck(d))
      .catch(() => deckKey.current === key && setDeck([]))
  }, [])

  const go = (to) => {
    setDir(to > step ? 1 : -1)
    setStep(to)
    window.scrollTo({ top: 0 })
  }

  const skipAll = async () => {
    try {
      await completeOnboarding({ displayName: name, genres: [], preferences: { language: 'es' }, favoriteAuthors: [], swipes: [], favoriteBooks: [] })
      navigate('/')
    } catch (e) {
      toast(e.message, { tone: 'error' })
    }
  }

  const finish = async () => {
    return completeOnboarding({
      displayName: name,
      genres,
      preferences: prefs,
      favoriteAuthors: authors,
      swipes: swipes.map(({ item, verdict }) => ({ item, verdict })),
      favoriteBooks: favBooks,
      addToLibrary,
    })
  }

  const allCovers = useMemo(() => Object.values(covers || {}).flat(), [covers])

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      {step >= 0 && (
        <header className="fixed inset-x-0 top-0 z-30 bg-gradient-to-b from-bg via-bg/90 to-transparent">
          <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 pt-4 pb-6 md:px-8">
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => go(step - 1)} aria-label="Atrás" disabled={step === 4}>
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-1 gap-1.5">
              {STEPS.map((s, i) => (
                <div key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <motion.div className="h-full bg-accent" initial={false} animate={{ width: i < step ? '100%' : i === step ? '50%' : '0%' }} transition={{ duration: 0.5 }} />
                </div>
              ))}
            </div>
            <span className="kicker w-10 text-right">
              {Math.min(step + 1, 5)}/5
            </span>
          </div>
        </header>
      )}

      <AnimatePresence mode="wait" custom={dir}>
        <motion.div key={step} custom={dir} variants={slide} initial="initial" animate="animate" exit="exit">
          {step === -1 && <Welcome covers={allCovers} name={name} setName={setName} onStart={() => go(0)} onSkip={skipAll} />}
          {step === 0 && (
            <GenresStep
              meta={meta}
              covers={covers}
              selected={genres}
              setSelected={setGenres}
              onNext={() => {
                loadDeck(genres, prefs.language || 'es')
                go(1)
              }}
            />
          )}
          {step === 1 && (
            <TasteStep
              prefs={prefs}
              setPrefs={setPrefs}
              onDone={() => {
                loadDeck(genres, prefs.language || 'es')
                go(2)
              }}
            />
          )}
          {step === 2 && <SwipeStep deck={deck} meta={meta} swipes={swipes} setSwipes={setSwipes} onNext={() => go(3)} />}
          {step === 3 && (
            <FavoritesStep
              swipes={swipes}
              deck={deck}
              authors={authors}
              setAuthors={setAuthors}
              books={favBooks}
              setBooks={setFavBooks}
              addToLibrary={addToLibrary}
              setAddToLibrary={setAddToLibrary}
              onNext={() => go(4)}
            />
          )}
          {step === 4 && <Reveal finish={finish} meta={meta} name={name} onBack={() => go(3)} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* ─── Welcome ─────────────────────────────────────────────────────────── */

function CoverColumn({ items, duration, reverse }) {
  const doubled = [...items, ...items]
  return (
    <div className="relative h-full overflow-hidden">
      <motion.div
        className="flex flex-col gap-4"
        animate={{ y: reverse ? ['-50%', '0%'] : ['0%', '-50%'] }}
        transition={{ repeat: Infinity, ease: 'linear', duration }}
      >
        {doubled.map((c, i) => (
          <Cover key={i} book={c} compact eager className="w-full" />
        ))}
      </motion.div>
    </div>
  )
}

function Welcome({ covers, name, setName, onStart, onSkip }) {
  const cols = useMemo(() => {
    const out = [[], [], [], [], []]
    covers.forEach((c, i) => out[i % 5].push(c))
    return out.filter((c) => c.length >= 2)
  }, [covers])

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-6">
      <div className="sepia-photo pointer-events-none absolute inset-0 grid grid-cols-3 gap-4 px-4 opacity-[0.6] md:grid-cols-5" aria-hidden="true">
        {cols.length
          ? cols.map((c, i) => <CoverColumn key={i} items={c} duration={50 + i * 9} reverse={i % 2 === 1} />)
          : [0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col gap-4 pt-10">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="shimmer aspect-[2/3] rounded" />
                ))}
              </div>
            ))}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--bg)_22%,transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-bg/10 via-bg/45 to-bg" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-[radial-gradient(60%_70%_at_50%_0%,rgba(255,190,100,0.22),transparent_70%)]" />
      <StringLights className="absolute inset-x-0 top-0 z-10" height={120} swags={3} perSwag={10} />

      <div className="relative z-10 w-full max-w-xl py-16 text-center">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-10 flex justify-center">
          <Wordmark />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.8, ease: [0.2, 0.75, 0.2, 1] }}
          className="font-display text-[3rem] leading-[0.95] font-light text-balance md:text-[4.6rem]"
        >
          Cuéntanos qué te hace <em className="display-wonk text-accent [text-shadow:0_0_40px_rgba(233,163,79,0.45)]">pasar páginas</em>.
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="mx-auto mt-5 max-w-md text-ink-2">
          En dos minutos construimos tu perfil literario. Con él, cada recomendación tendrá una razón de ser.
        </motion.p>
        <motion.form
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          onSubmit={(e) => {
            e.preventDefault()
            onStart()
          }}
          className="mx-auto mt-9 flex max-w-sm flex-col gap-3"
        >
          <input
            className="field h-12 text-center font-display text-lg"
            placeholder="¿Cómo te llamamos? (opcional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
          />
          <button className="btn btn-primary h-12 text-base" type="submit">
            Empezar <ArrowRight size={18} />
          </button>
          <button type="button" className="mt-1 text-sm text-ink-3 underline-offset-4 hover:text-ink-2 hover:underline" onClick={onSkip}>
            Saltar por ahora
          </button>
        </motion.form>
      </div>
    </div>
  )
}

/* ─── Step layout ─────────────────────────────────────────────────────── */

function StepFrame({ kicker, title, sub, children, footer }) {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-24 pb-36 md:px-8">
      <p className="kicker mb-3">{kicker}</p>
      <h1 className="font-display text-[2.4rem] leading-[1] font-light text-balance md:text-[3.6rem]">{title}</h1>
      {sub && <p className="mt-3 max-w-xl text-ink-2">{sub}</p>}
      <div className="mt-9">{children}</div>
      {footer && (
        <div className="pb-safe pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-bg via-bg/95 to-transparent pt-10">
          <div className="pointer-events-auto mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pb-4 md:px-8">{footer}</div>
        </div>
      )}
    </div>
  )
}

/* ─── Genres ──────────────────────────────────────────────────────────── */

function GenresStep({ meta, covers, selected, setSelected, onNext }) {
  const toggle = (k) => setSelected((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
  return (
    <StepFrame
      kicker="Paso 1 · Géneros"
      title={
        <>
          ¿Qué mundos <em className="display-wonk">te llaman</em>?
        </>
      }
      sub="Elige al menos tres. Puedes elegir todos los que quieras: no hay respuestas equivocadas."
      footer={
        <>
          <span className="text-sm text-ink-2">
            <span className="font-display text-2xl text-ink">{selected.length}</span> elegidos
          </span>
          <button className="btn btn-primary h-12 px-6" disabled={selected.length < 3} onClick={onNext}>
            {selected.length < 3 ? `Elige ${3 - selected.length} más` : 'Continuar'} <ArrowRight size={17} />
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {meta.genres.map((g, i) => {
          const on = selected.includes(g.key)
          const cs = covers?.[g.key] || []
          return (
            <motion.button
              key={g.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.025 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => toggle(g.key)}
              aria-pressed={on}
              className="group relative h-44 overflow-hidden rounded-[22px] text-left sm:h-52"
              style={{ background: `linear-gradient(150deg, ${g.colors[0]}, ${g.colors[1]})` }}
            >
              <div className="absolute top-[-14%] right-[-4%] flex w-[64%] items-start justify-end">
                {cs.length
                  ? cs.map((c, j) => (
                      <div
                        key={j}
                        className="w-[44%] shrink-0 transition-transform duration-500 group-hover:translate-y-2"
                        style={{ transform: `rotate(${(j - 1) * 9}deg) translateY(${j === 1 ? 10 : 0}px)`, marginLeft: j ? '-18%' : 0, zIndex: j === 1 ? 2 : 1 }}
                      >
                        <Cover book={c} compact eager />
                      </div>
                    ))
                  : covers === null &&
                    [0, 1, 2].map((j) => (
                      <div key={j} className="w-[44%] shrink-0 opacity-30" style={{ marginLeft: j ? '-18%' : 0 }}>
                        <div className="aspect-[2/3] animate-pulse rounded bg-white/30" />
                      </div>
                    ))}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
              <div className="relative flex h-full flex-col justify-between p-4 text-white">
                <span
                  className={`grid h-7 w-7 place-items-center rounded-full border transition ${on ? 'scale-100 border-white bg-white text-black' : 'border-white/50 bg-black/10'}`}
                >
                  {on ? <Check size={15} strokeWidth={3} /> : <Plus size={14} />}
                </span>
                <div>
                  <p className="font-display text-[1.35rem] leading-[1.05] font-medium drop-shadow">{g.label}</p>
                  <p className="mt-1 text-[11.5px] leading-snug text-white/75">{g.tagline}</p>
                </div>
              </div>
              <motion.div
                className="pointer-events-none absolute inset-0 rounded-[22px]"
                initial={false}
                animate={{ boxShadow: on ? 'inset 0 0 0 3px #fff' : 'inset 0 0 0 0px #fff' }}
              />
            </motion.button>
          )
        })}
      </div>
    </StepFrame>
  )
}

/* ─── Taste ("this or that") ──────────────────────────────────────────── */

function TasteStep({ prefs, setPrefs, onDone }) {
  const [i, setI] = useState(0)
  const total = QUESTIONS.length + 2
  const next = () => (i + 1 < total ? setI(i + 1) : onDone())
  const choose = (key, v) => {
    setPrefs({ ...prefs, [key]: v })
    setTimeout(next, 260)
  }
  const qn = QUESTIONS[i]

  return (
    <StepFrame
      kicker={`Paso 2 · Preferencias · ${i + 1} de ${total}`}
      title={qn ? qn.q : i === QUESTIONS.length ? '¿Para qué lees?' : '¿En qué idioma prefieres tus ediciones?'}
      sub={qn ? 'Toca la que más se parezca a ti. Si no lo tienes claro, elige el equilibrio.' : i === QUESTIONS.length ? 'Puedes elegir varias.' : 'Lo usamos para mostrarte títulos y portadas en tu idioma cuando existan.'}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => (i > 0 ? setI(i - 1) : null)} disabled={i === 0}>
            <ArrowLeft size={16} /> Anterior
          </button>
          {i === QUESTIONS.length && (
            <button className="btn btn-primary h-12 px-6" onClick={next}>
              Continuar <ArrowRight size={17} />
            </button>
          )}
        </>
      }
    >
      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.35 }}>
          {qn && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {[qn.a, qn.b].map((opt) => {
                  const on = prefs[qn.key] === opt.v
                  return (
                    <motion.button
                      key={opt.label}
                      whileHover={{ y: -4 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => choose(qn.key, opt.v)}
                      className={`group relative overflow-hidden rounded-[26px] border p-6 text-left transition-colors sm:p-8 ${on ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong'}`}
                    >
                      <Motif name={opt.motif} className={`mb-6 h-24 w-36 transition-colors sm:h-32 sm:w-48 ${on ? 'text-accent' : 'text-ink-2 group-hover:text-ink'}`} />
                      <p className="font-display text-3xl leading-tight sm:text-4xl">{opt.label}</p>
                      <p className="mt-2 text-ink-2">{opt.desc}</p>
                      {on && (
                        <span className="absolute top-5 right-5 grid h-8 w-8 place-items-center rounded-full bg-accent text-accent-ink">
                          <Check size={16} />
                        </span>
                      )}
                    </motion.button>
                  )
                })}
              </div>
              <div className="mt-5 flex justify-center">
                <button className="chip h-10 px-5" onClick={() => choose(qn.key, 0)}>
                  Un poco de ambos
                </button>
              </div>
            </>
          )}
          {i === QUESTIONS.length && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {PURPOSES.map((p) => {
                const on = prefs.purposes.includes(p.key)
                return (
                  <motion.button
                    key={p.key}
                    whileHover={{ y: -4 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() =>
                      setPrefs({ ...prefs, purposes: on ? prefs.purposes.filter((x) => x !== p.key) : [...prefs.purposes, p.key] })
                    }
                    className={`relative flex min-h-48 flex-col justify-between rounded-[26px] border p-5 text-left transition-colors ${on ? 'border-transparent' : 'border-line bg-surface hover:border-line-strong'}`}
                    style={on ? { background: p.color, color: '#140d08' } : undefined}
                  >
                    <p.icon size={30} strokeWidth={1.5} />
                    <div>
                      <p className="font-display text-3xl">{p.label}</p>
                      <p className={`mt-1 text-sm ${on ? 'text-black/70' : 'text-ink-2'}`}>{p.desc}</p>
                    </div>
                    {on && (
                      <span className="absolute top-4 right-4 grid h-7 w-7 place-items-center rounded-full bg-black/80 text-white">
                        <Check size={14} />
                      </span>
                    )}
                  </motion.button>
                )
              })}
            </div>
          )}
          {i === QUESTIONS.length + 1 && (
            <div className="grid gap-3 sm:grid-cols-3">
              {LANGS.map((l) => {
                const on = prefs.language === l.key
                return (
                  <motion.button
                    key={l.key}
                    whileHover={{ y: -4 }}
                    onClick={() => choose('language', l.key)}
                    className={`rounded-[26px] border p-6 text-left transition-colors ${on ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong'}`}
                  >
                    <p className="font-display text-3xl">{l.label}</p>
                    <p className="mt-1 text-sm text-ink-2">{l.desc}</p>
                  </motion.button>
                )
              })}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </StepFrame>
  )
}

/* ─── Swipe deck ──────────────────────────────────────────────────────── */

function SwipeCard({ item, meta, onDecide, isTop, depth, flyRef }) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-240, 240], [-14, 14])
  const likeOpacity = useTransform(x, [30, 130], [0, 1])
  const nopeOpacity = useTransform(x, [-130, -30], [1, 0])
  const loveOpacity = useTransform(y, [-130, -40], [1, 0])

  const fly = (verdict) => {
    const to = verdict === 'like' ? { x: 600, y: 40 } : verdict === 'dislike' ? { x: -600, y: 40 } : { x: 0, y: -700 }
    animate(x, to.x, { duration: 0.35 })
    animate(y, to.y, { duration: 0.35 })
    setTimeout(() => onDecide(verdict), 220)
  }

  useEffect(() => {
    if (!isTop) return
    const onKey = (e) => {
      if (e.key === 'ArrowRight') fly('like')
      if (e.key === 'ArrowLeft') fly('dislike')
      if (e.key === 'ArrowUp') fly('love')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (isTop) flyRef.current = fly
  })

  const themes = (item.themes || []).slice(0, 3).map((t) => meta.themes.find((x) => x.key === t)?.label).filter(Boolean)
  const genre = meta.genres.find((g) => g.key === (item.deckGenre || item.genres?.[0]))

  return (
    <motion.div
      className="absolute inset-0"
      style={isTop ? { x, y, rotate, zIndex: 10 } : { zIndex: 10 - depth }}
      initial={{ scale: 0.92, y: 30, opacity: 0 }}
      animate={{ scale: 1 - depth * 0.05, y: depth * 18, opacity: depth > 2 ? 0 : 1 }}
      transition={{ type: 'spring', damping: 24, stiffness: 260 }}
      drag={isTop}
      dragSnapToOrigin
      dragElastic={0.9}
      onDragEnd={(_, info) => {
        if (info.offset.x > 120 || info.velocity.x > 700) fly('like')
        else if (info.offset.x < -120 || info.velocity.x < -700) fly('dislike')
        else if (info.offset.y < -120 || info.velocity.y < -700) fly('love')
      }}
    >
      <div className="relative flex h-full flex-col overflow-hidden rounded-[30px] border border-line bg-surface shadow-[var(--shadow-pop)]">
        <div className="relative flex flex-1 items-center justify-center overflow-hidden px-10 pt-8 pb-4" style={genre ? { background: `linear-gradient(160deg, ${genre.colors[0]}, ${genre.colors[1]})` } : undefined}>
          <div className="absolute inset-0 scale-125 opacity-40 blur-2xl">
            {item.coverUrl && <img src={item.coverUrl} alt="" className="h-full w-full object-cover" draggable={false} />}
          </div>
          <Cover book={item} eager className="relative w-[44%] max-w-[190px] min-w-[120px]" />
          {isTop && (
            <>
              <motion.span style={{ opacity: likeOpacity }} className="absolute top-6 left-6 -rotate-12 rounded-xl border-[3px] border-[#9be08a] px-3 py-1 font-mono text-lg font-medium tracking-widest text-[#9be08a]">
                ME ATRAE
              </motion.span>
              <motion.span style={{ opacity: nopeOpacity }} className="absolute top-6 right-6 rotate-12 rounded-xl border-[3px] border-[#ff7a59] px-3 py-1 font-mono text-lg font-medium tracking-widest text-[#ff7a59]">
                PASO
              </motion.span>
              <motion.span style={{ opacity: loveOpacity }} className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-xl border-[3px] border-[#ffd36e] px-3 py-1 font-mono text-lg font-medium tracking-widest whitespace-nowrap text-[#ffd36e]">
                YA LO LEÍ ★
              </motion.span>
            </>
          )}
        </div>
        <div className="p-5">
          <p className="kicker mb-1">{genre?.label}{item.year ? ` · ${item.year}` : ''}</p>
          <h3 className="font-display text-2xl leading-tight line-clamp-2">{item.title}</h3>
          <p className="mt-0.5 text-sm text-ink-2">{authorsLine(item.authors, 2)}</p>
          {themes.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {themes.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function SwipeStep({ deck, meta, swipes, setSwipes, onNext }) {
  const decided = new Set(swipes.map((s) => s.item.id))
  const remaining = (deck || []).filter((d) => !decided.has(d.id))
  const total = deck?.length || 0
  const decide = (item, verdict) => setSwipes((prev) => [...prev, { item, verdict }])
  const top = remaining[0]
  const flyRef = useRef(null)

  return (
    <StepFrame
      kicker="Paso 3 · Afinar"
      title={
        <>
          Desliza para <em className="display-wonk">afinar</em> tu gusto.
        </>
      }
      sub="Derecha si te atrae, izquierda si no es para ti, arriba si ya lo leíste y te encantó. También puedes usar las flechas del teclado."
      footer={
        <>
          <span className="hidden w-28 text-sm text-ink-2 sm:block">
            {swipes.length} de {total || '…'}
          </span>
          {top ? (
            <div className="flex items-center gap-3">
              <button className="grid h-14 w-14 place-items-center rounded-full border border-line-strong bg-surface text-[#ff7a59] transition hover:scale-105" onClick={() => flyRef.current?.('dislike')} aria-label="No es para mí" title="No es para mí (←)">
                <X size={24} />
              </button>
              <button className="grid h-12 w-12 place-items-center rounded-full border border-line-strong bg-surface text-[#ffd36e] transition hover:scale-105" onClick={() => flyRef.current?.('love')} aria-label="Ya lo leí y me encantó" title="Ya lo leí y me encantó (↑)">
                <Star size={20} />
              </button>
              <button className="grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-ink transition hover:scale-105" onClick={() => flyRef.current?.('like')} aria-label="Me atrae" title="Me atrae (→)">
                <Heart size={24} />
              </button>
            </div>
          ) : (
            <span />
          )}
          <button className="btn btn-primary h-12 px-5 sm:px-6" onClick={onNext} disabled={!deck}>
            {remaining.length && swipes.length < 5 ? 'Saltar' : 'Continuar'} <ArrowRight size={17} />
          </button>
        </>
      }
    >
      <div className="mx-auto flex max-w-sm flex-col items-center">
        <div className="relative h-[440px] w-full sm:h-[470px]">
          {!deck && (
            <div className="absolute inset-0 grid place-items-center rounded-[30px] border border-dashed border-line-strong text-center">
              <div>
                <Spinner className="mx-auto mb-3 text-accent" size={22} />
                <p className="font-display text-xl">Reuniendo libros para ti…</p>
                <p className="mt-1 text-sm text-ink-3">Obras reales de tus géneros, desde Open Library.</p>
              </div>
            </div>
          )}
          {deck && remaining.length === 0 && (
            <div className="absolute inset-0 grid place-items-center rounded-[30px] border border-dashed border-line-strong p-8 text-center">
              <div>
                <p className="font-display text-3xl">¡Listo!</p>
                <p className="mt-2 text-ink-2">
                  {swipes.filter((s) => s.verdict !== 'dislike').length} libros te llamaron la atención. Ya sabemos bastante más de ti.
                </p>
              </div>
            </div>
          )}
          {remaining
            .slice(0, 3)
            .reverse()
            .map((item) => {
              const depth = remaining.indexOf(item)
              return <SwipeCard key={item.id} item={item} meta={meta} depth={depth} isTop={depth === 0} flyRef={flyRef} onDecide={(v) => decide(item, v)} />
            })}
        </div>
      </div>
    </StepFrame>
  )
}

/* ─── Favorite authors & books ────────────────────────────────────────── */

function FavoritesStep({ swipes, deck, authors, setAuthors, books, setBooks, addToLibrary, setAddToLibrary, onNext }) {
  const [aq, setAq] = useState('')
  const [bq, setBq] = useState('')
  const [aRes, setARes] = useState([])
  const [bRes, setBRes] = useState([])
  const [aLoading, setALoading] = useState(false)
  const [bLoading, setBLoading] = useState(false)
  const da = useDebounced(aq.trim())
  const db = useDebounced(bq.trim())

  useEffect(() => {
    if (da.length < 2) return setARes([])
    const c = new AbortController()
    setALoading(true)
    api
      .authors(da, c.signal)
      .then(setARes)
      .catch(() => {})
      .finally(() => !c.signal.aborted && setALoading(false))
    return () => c.abort()
  }, [da])

  useEffect(() => {
    if (db.length < 2) return setBRes([])
    const c = new AbortController()
    setBLoading(true)
    api
      .search(db, c.signal)
      .then((d) => setBRes(d.items.slice(0, 8)))
      .catch(() => {})
      .finally(() => !c.signal.aborted && setBLoading(false))
    return () => c.abort()
  }, [db])

  // Real authors from the books they reacted to (liked first), then the rest of the deck.
  const suggested = useMemo(() => {
    const liked = swipes.filter((s) => s.verdict !== 'dislike').map((s) => s.item)
    const pool = [...liked, ...(deck || [])]
    const names = []
    pool.forEach((b) => {
      const a = b.authors?.[0]
      if (a && !names.includes(a) && /^[\p{Script=Latin}\s.'’\-()]+$/u.test(a)) names.push(a)
    })
    return names.slice(0, 12)
  }, [swipes, deck])

  const hasAuthor = (n) => authors.some((a) => a.name.toLowerCase() === n.toLowerCase())
  const addAuthor = (a) => !hasAuthor(a.name) && setAuthors([...authors, a])
  const removeAuthor = (n) => setAuthors(authors.filter((a) => a.name !== n))
  const hasBook = (b) => books.some((x) => x.id === b.id)
  const toggleBook = (b) => setBooks(hasBook(b) ? books.filter((x) => x.id !== b.id) : [...books, b])

  return (
    <StepFrame
      kicker="Paso 4 · Afinidades"
      title={
        <>
          Autores que admiras, libros que <em className="display-wonk">te marcaron</em>.
        </>
      }
      sub="Opcional, pero es la señal más fuerte para tus recomendaciones."
      footer={
        <>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={addToLibrary} onChange={(e) => setAddToLibrary(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Añadir esos libros a mi biblioteca como leídos
          </label>
          <button className="btn btn-primary h-12 px-6" onClick={onNext}>
            Ver mi perfil <ArrowRight size={17} />
          </button>
        </>
      }
    >
      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="font-display text-2xl">Autores</h2>
          <div className="relative mt-3">
            <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
            <input className="field pl-10" placeholder="Busca un autor: Borges, Woolf, Murakami…" value={aq} onChange={(e) => setAq(e.target.value)} />
            {aLoading && <Spinner size={14} className="absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-3" />}
          </div>
          {aRes.length > 0 && (
            <div className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-2xl border border-line bg-surface p-1.5">
              {aRes.map((a) => (
                <button
                  key={a.key}
                  onClick={() => {
                    addAuthor({ name: a.name, key: a.key, photo: a.photo })
                    setAq('')
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-surface-2"
                >
                  <AuthorPhoto src={a.photo} name={a.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.name}</span>
                    <span className="block truncate text-xs text-ink-3">
                      {a.topWork ? `«${a.topWork}»` : ''} {a.workCount ? `· ${a.workCount} obras` : ''}
                    </span>
                  </span>
                  {hasAuthor(a.name) ? <Check size={16} className="text-accent" /> : <Plus size={16} className="text-ink-3" />}
                </button>
              ))}
            </div>
          )}
          {authors.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {authors.map((a) => (
                <span key={a.name} className="flex items-center gap-2 rounded-full bg-ink py-1 pr-1.5 pl-1 text-sm text-bg">
                  <AuthorPhoto src={a.photo} name={a.name} size={26} />
                  {a.name}
                  <button onClick={() => removeAuthor(a.name)} className="grid h-5 w-5 place-items-center rounded-full bg-bg/20" aria-label={`Quitar ${a.name}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {suggested.length > 0 && (
            <>
              <p className="kicker mt-6 mb-2">Sugeridos por tus elecciones</p>
              <div className="flex flex-wrap gap-1.5">
                {suggested.filter((n) => !hasAuthor(n)).map((n) => (
                  <button key={n} className="chip" onClick={() => addAuthor({ name: n })}>
                    <Plus size={12} /> {n}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        <section>
          <h2 className="font-display text-2xl">Libros favoritos</h2>
          <div className="relative mt-3">
            <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
            <input className="field pl-10" placeholder="Título o autor de un libro que te encantó…" value={bq} onChange={(e) => setBq(e.target.value)} />
            {bLoading && <Spinner size={14} className="absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-3" />}
          </div>
          {bRes.length > 0 && (
            <div className="mt-3 grid grid-cols-4 gap-3">
              {bRes.map((b) => (
                <button key={b.id} onClick={() => toggleBook(b)} className="group relative text-left">
                  <Cover book={b} compact className={hasBook(b) ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''} />
                  {hasBook(b) && (
                    <span className="absolute top-1 right-1 z-10 grid h-6 w-6 place-items-center rounded-full bg-accent text-accent-ink">
                      <Check size={13} />
                    </span>
                  )}
                  <p className="mt-1 text-[11px] leading-tight line-clamp-2">{b.title}</p>
                </button>
              ))}
            </div>
          )}
          {books.length > 0 && (
            <>
              <p className="kicker mt-6 mb-3">Tu estantería de favoritos · {books.length}</p>
              <div className="flex flex-wrap gap-3">
                {books.map((b, i) => (
                  <motion.div key={b.id} initial={{ y: 20, opacity: 0, rotate: 0 }} animate={{ y: 0, opacity: 1, rotate: (i % 3) - 1 }} className="relative w-20">
                    <Cover book={b} compact />
                    <button
                      onClick={() => toggleBook(b)}
                      className="absolute -top-2 -right-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-ink text-bg"
                      aria-label={`Quitar ${b.title}`}
                    >
                      <X size={12} />
                    </button>
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </StepFrame>
  )
}

function AuthorPhoto({ src, name, size = 34 }) {
  const [ok, setOk] = useState(!!src)
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-3 font-display text-sm text-ink-2" style={{ width: size, height: size }}>
      {ok && src ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setOk(false)} onLoad={(e) => e.currentTarget.naturalWidth < 5 && setOk(false)} />
      ) : (
        name?.[0]
      )}
    </span>
  )
}

/* ─── Reveal ──────────────────────────────────────────────────────────── */

function Reveal({ finish, meta, name, onBack }) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('building')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const started = useRef(false)
  const lines = ['Leyendo tus géneros…', 'Interpretando tus decisiones…', 'Conectando autores y temas…', 'Dando forma a tu perfil…']
  const [line, setLine] = useState(0)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const t = setInterval(() => setLine((l) => Math.min(l + 1, lines.length - 1)), 700)
    const minWait = new Promise((r) => setTimeout(r, 2600))
    Promise.all([finish(), minWait])
      .then(([d]) => {
        setData(d)
        setPhase('done')
      })
      .catch((e) => setError(e.message))
      .finally(() => clearInterval(t))
  }, [finish, lines.length])

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <p className="font-display text-3xl">Algo falló al guardar tu perfil</p>
          <p className="mt-2 text-ink-2">{error}</p>
          <button className="btn btn-primary mt-6" onClick={onBack}>
            Volver
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'building') {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <div className="mb-8 flex items-end justify-center gap-1.5">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <motion.span
                key={i}
                className="w-4 rounded-[2px]"
                style={{ background: meta.genres[(i * 3) % meta.genres.length]?.colors[1] }}
                animate={{ height: [20, 60 + (i % 3) * 14, 20] }}
                transition={{ repeat: Infinity, duration: 1.4, delay: i * 0.1 }}
              />
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.p key={line} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="font-display text-2xl">
              {lines[line]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    )
  }

  const insights = data.insights
  const arche = insights.archetype
  const topGenres = insights.taste.genres.slice(0, 5)
  const themes = insights.taste.themes.slice(0, 6)

  return (
    <div className="mx-auto max-w-4xl px-4 pt-24 pb-24 md:px-8">
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="kicker mb-4 text-center">
        {name ? `${name}, tu perfil literario` : 'Tu perfil literario'}
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 40, rotate: -1.2 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.9, ease: [0.2, 0.75, 0.2, 1] }}
        className="paper-sheet overflow-hidden rounded-[4px_10px_10px_4px] px-7 py-10 md:px-14 md:py-12"
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-black/15 to-transparent" aria-hidden="true" />
        <p className="kicker text-center">Capítulo primero · tu arquetipo</p>
        <Fleuron className="mx-auto mt-4 max-w-md" />
        <h1 className="mt-5 text-center font-display text-[2.4rem] leading-[1] font-medium tracking-[0.04em] text-balance md:text-[4rem]" style={{ fontVariant: 'small-caps' }}>
          {arche.name}
        </h1>
        <p className="prose-book mx-auto mt-6 max-w-2xl text-center !text-[19px] !text-[var(--paper-ink)] italic">{arche.description}</p>

        <div className="mt-10 grid gap-10 md:grid-cols-2">
          <div>
            <p className="kicker mb-3">Tus géneros</p>
            <div className="space-y-2.5">
              {topGenres.map((g, i) => {
                const gm = meta.genres.find((x) => x.key === g.key)
                return (
                  <div key={g.key}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{g.label}</span>
                      <span className="font-mono text-xs text-ink-3">{Math.round(g.weight * 100)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: gm ? `linear-gradient(90deg, ${gm.colors[0]}, ${gm.colors[1]})` : 'var(--accent)' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${g.weight * 100}%` }}
                        transition={{ delay: 0.4 + i * 0.1, duration: 0.9 }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div>
            {themes.length > 0 && (
              <>
                <p className="kicker mb-3">Temas que te atraen</p>
                <div className="flex flex-wrap gap-2">
                  {themes.map((t, i) => (
                    <motion.span key={t.key} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6 + i * 0.08 }} className="chip" data-active={i === 0}>
                      {t.label}
                    </motion.span>
                  ))}
                </div>
              </>
            )}
            {insights.purposes.length > 0 && (
              <>
                <p className="kicker mt-6 mb-2">Lees para</p>
                <p className="font-display text-2xl">{insights.purposes.map((p) => p.label.toLowerCase()).join(' · ')}</p>
              </>
            )}
            {data.added > 0 && (
              <p className="mt-6 text-sm text-ink-2">
                Añadimos {data.added} {data.added === 1 ? 'libro' : 'libros'} a tu biblioteca y a «Mis favoritos».
              </p>
            )}
          </div>
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }} className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <button className="btn btn-primary h-12 px-6 text-base" onClick={() => navigate('/descubrir')}>
          Ver mis recomendaciones <ArrowRight size={18} />
        </button>
        <button className="btn h-12 px-6 text-base" onClick={() => navigate('/')}>
          Ir a mi biblioteca
        </button>
      </motion.div>
    </div>
  )
}
