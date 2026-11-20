import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, ArrowRight, Info, Search } from 'lucide-react'
import { SectionHead, Spinner } from '../../components/ui/Bits'
import { PoemCard, PoetCard, Portrait, RightsBadge, Skeleton, SourceErrors, useJurisdiction } from '../../components/poetry/PoetryBits'
import { LANGS, LANG_NAME, authorPath, lifespan, poetryApi } from '../../lib/poetry'
import { usePoetry } from '../../store/usePoetry'

const THEMES = {
  amor: 'Amor', muerte: 'Muerte', naturaleza: 'Naturaleza', mar: 'El mar', noche: 'La noche', tiempo: 'El tiempo',
  soledad: 'Soledad', melancolia: 'Melancolía', espiritualidad: 'Espiritualidad', guerra: 'Guerra', libertad: 'Libertad',
  suenos: 'Sueños', primavera: 'Primavera', luna: 'La luna',
}

/** One source's results, fetched independently so a slow or failing source never blocks the rest. */
function SourceBlock({ label, params, savedPids }) {
  const [j] = useJurisdiction()
  const [state, setState] = useState({ status: 'loading', items: [], next: null, errors: [] })
  const key = JSON.stringify(params) + j

  useEffect(() => {
    const ctrl = new AbortController()
    setState({ status: 'loading', items: [], next: null, errors: [] })
    poetryApi
      .search({ ...params, limit: 12 }, ctrl.signal)
      .then((r) => setState({ status: 'ready', items: r.items, next: r.next, errors: r.errors, note: r.note, total: r.total }))
      .catch((err) => err.name !== 'AbortError' && setState({ status: 'error', items: [], errors: [{ message: err.message }] }))
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const more = async () => {
    setState((s) => ({ ...s, status: 'more' }))
    try {
      const r = await poetryApi.search({ ...params, limit: 12, offset: state.next })
      setState((s) => ({ ...s, status: 'ready', items: [...s.items, ...r.items.filter((x) => !s.items.some((y) => y.id === x.id))], next: r.next, errors: r.errors }))
    } catch (err) {
      setState((s) => ({ ...s, status: 'ready', errors: [{ message: err.message }] }))
    }
  }

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl">{label}</h2>
        {state.status === 'ready' && (
          <span className="font-mono text-[11px] text-ink-3">
            {state.total != null ? `${state.total} resultados` : `${state.items.length}${state.next ? '+' : ''} resultados`}
          </span>
        )}
      </div>
      <SourceErrors errors={state.errors} />
      {state.note && <p className="text-sm text-ink-3">{state.note}</p>}
      {state.status === 'loading' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : state.items.length ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {state.items.map((it, i) => (
              <PoemCard key={it.id} item={it} index={i} saved={savedPids.has(it.id)} />
            ))}
          </div>
          {state.next != null && (
            <div className="mt-5 text-center">
              <button className="btn" onClick={more} disabled={state.status === 'more'}>
                {state.status === 'more' ? <Spinner size={15} /> : null} Cargar más
              </button>
            </div>
          )}
        </>
      ) : (
        state.status === 'ready' && !state.errors?.length && !state.note && <p className="text-sm text-ink-3">Sin resultados en esta fuente.</p>
      )}
    </section>
  )
}

function MovementOrEra({ interp }) {
  const [poets, setPoets] = useState(null)
  const [j] = useJurisdiction()
  const params = useMemo(
    () => ({ movement: interp.movement?.key, era: interp.era?.key, language: interp.language || undefined }),
    [interp.movement?.key, interp.era?.key, interp.language],
  )
  useEffect(() => {
    const ctrl = new AbortController()
    poetryApi
      .poets(params, ctrl.signal)
      .then((r) => setPoets(r.poets))
      .catch(() => setPoets([]))
    return () => ctrl.abort()
  }, [params, j])
  const label = [interp.movement?.label, interp.era?.label, interp.language && `en ${LANG_NAME[interp.language]}`].filter(Boolean).join(' · ')
  const qs = new URLSearchParams(Object.entries({ movimiento: params.movement, epoca: params.era, idioma: params.language }).filter(([, v]) => v)).toString()
  return (
    <section className="mb-12">
      <SectionHead
        kicker="Autores"
        title={label}
        action={
          <Link to={`/poesia/poetas?${qs}`} className="btn btn-sm btn-ghost">
            Ver lista <ArrowRight size={14} />
          </Link>
        }
      />
      {poets === null ? (
        <Spinner />
      ) : poets.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {poets.slice(0, 16).map((p) => (
            <PoetCard key={p.qid} poet={p} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-3">No hay autores de nuestra antología que encajen con esa combinación.</p>
      )}
    </section>
  )
}

export default function PoetrySearch() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const q = params.get('q') || ''
  const tema = params.get('tema') || ''
  const langParam = params.get('idioma') || ''
  const [input, setInput] = useState(q)
  const [interp, setInterp] = useState(null)
  const [interpError, setInterpError] = useState(null)
  const items = usePoetry((s) => s.items)
  const init = usePoetry((s) => s.init)
  const savedPids = useMemo(() => new Set(items.map((i) => i.pid)), [items])

  useEffect(() => init(), [init])
  useEffect(() => setInput(q), [q])
  useEffect(() => {
    setInterp(null)
    setInterpError(null)
    if (!q) return
    const ctrl = new AbortController()
    poetryApi
      .interpret(q, ctrl.signal)
      .then(setInterp)
      .catch((err) => {
        if (err.name === 'AbortError') return
        setInterpError(err.message)
        setInterp({ query: q, terms: q })
      })
    return () => ctrl.abort()
  }, [q])

  const submit = (e) => {
    e.preventDefault()
    const v = input.trim()
    if (v) setParams({ q: v, ...(langParam ? { idioma: langParam } : {}) })
  }
  const setLang = (l) => {
    const next = new URLSearchParams(params)
    if (l) next.set('idioma', l)
    else next.delete('idioma')
    setParams(next)
  }

  // Which sources to ask, and with what.
  const lang = langParam || interp?.language || ''
  const theme = tema || interp?.theme?.key || ''
  const author = interp?.author
  const authorProtected = author && author.rights?.status === 'protected'
  const blocks = []
  if (theme || (interp && !author && !interp.movement && !interp.era) || (interp?.terms && (interp.movement || interp.era))) {
    const base = theme ? { theme } : { q }
    const langs = lang ? [lang] : theme ? ['es', 'en', 'de'] : ['es', 'en']
    for (const l of langs) blocks.push({ key: `ws-${l}`, label: `Wikisource · ${LANGS.find((x) => x.key === l)?.label}`, params: { ...base, source: 'wikisource', lang: l } })
    if (!lang || lang === 'en') blocks.push({ key: 'pdb', label: 'PoetryDB · poesía clásica en inglés', params: { ...base, source: 'poetrydb' } })
  } else if (author && !authorProtected) {
    // Originals first (the author's own language), then Spanish; the rest is one
    // click away in the language chips or on the author's page.
    const available = Object.keys(author.wikisource || {})
    const own = author.writesIn || []
    const langs = lang
      ? available.filter((l) => l === lang)
      : [...new Set([...own.filter((l) => available.includes(l)), ...(available.includes('es') ? ['es'] : [])])].slice(0, 2)
    if (author.poetrydb && (!lang || lang === 'en')) blocks.push({ key: 'pdba', label: 'PoetryDB · textos de Project Gutenberg', params: { author: author.qid, source: 'poetrydb' } })
    for (const l of langs) blocks.push({ key: `wsa-${l}`, label: `Wikisource · ${LANGS.find((x) => x.key === l)?.label}${own.includes(l) ? ' · original' : ' · traducciones'}`, params: { author: author.qid, source: 'wikisource', lang: l } })
  }

  const heading = tema ? `Poemas sobre ${THEMES[tema]?.toLowerCase() || tema}` : q ? `«${q}»` : 'Buscar poesía'

  return (
    <div>
      <button className="btn btn-ghost btn-sm mb-4 -ml-2" onClick={() => navigate('/poesia')}>
        <ArrowLeft size={15} /> Antología
      </button>
      <header className="mb-8">
        <p className="kicker kicker-dusk mb-2">Biblioteca de poesía</p>
        <h1 className="font-display text-[2.3rem] leading-tight font-light md:text-[3.2rem]">{heading}</h1>
        <form onSubmit={submit} className="relative mt-5 max-w-2xl">
          <Search size={16} className="absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" />
          <input className="field h-12 rounded-full pr-24 pl-11" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Autor, título, verso, tema, movimiento, época…" aria-label="Buscar poesía" />
          <button className="btn btn-primary absolute top-1 right-1 h-10 rounded-full px-4" type="submit">
            Buscar
          </button>
        </form>
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-ink-3">Idioma:</span>
          <button className="chip" data-active={!langParam} onClick={() => setLang('')}>
            Todos
          </button>
          {LANGS.map((l) => (
            <button key={l.key} className="chip" data-active={langParam === l.key} onClick={() => setLang(l.key)}>
              {l.label}
            </button>
          ))}
        </div>
        {!q && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(THEMES).map(([k, v]) => (
              <Link key={k} to={`/poesia/buscar?tema=${k}${langParam ? `&idioma=${langParam}` : ''}`} className="chip" data-active={tema === k}>
                {v}
              </Link>
            ))}
          </div>
        )}
      </header>

      {interpError && <SourceErrors errors={[{ message: `No pudimos interpretar la búsqueda (${interpError}); buscamos el texto tal cual.` }]} />}

      {q && !interp && !interpError && (
        <div className="flex items-center gap-2 text-ink-2">
          <Spinner size={16} /> Interpretando tu búsqueda…
        </div>
      )}

      {interp && (interp.theme || interp.movement || interp.era || interp.language) && (
        <p className="mb-6 flex flex-wrap items-center gap-2 text-sm text-ink-2">
          <Info size={14} className="text-dusk" /> Entendemos:
          {interp.theme && <span className="chip !cursor-default">tema · {interp.theme.label}</span>}
          {interp.movement && <span className="chip !cursor-default">movimiento · {interp.movement.label}</span>}
          {interp.era && <span className="chip !cursor-default">época · {interp.era.label}</span>}
          {interp.language && <span className="chip !cursor-default">idioma · {LANG_NAME[interp.language]}</span>}
        </p>
      )}

      {author && (
        <Link to={authorPath(author.qid)} className="group mb-10 flex flex-col gap-5 rounded-3xl border border-line bg-surface/60 p-5 transition hover:border-dusk/50 sm:flex-row sm:items-center">
          <Portrait poet={author} size={84} />
          <div className="min-w-0 flex-1">
            <p className="kicker mb-1">Autor</p>
            <p className="font-display text-3xl group-hover:text-dusk">{author.name}</p>
            <p className="text-sm text-ink-2">
              {lifespan(author)}
              {author.description ? ` · ${author.description}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RightsBadge rights={author.rights} />
            </div>
            {authorProtected && <p className="mt-2 max-w-2xl text-sm text-ink-2">{author.rights.explanation} En su página verás sus obras con referencias y enlaces fiables.</p>}
          </div>
          <span className="btn btn-sm self-start sm:self-center">
            Ver autor <ArrowRight size={14} />
          </span>
        </Link>
      )}

      {interp && (interp.movement || interp.era) && <MovementOrEra interp={interp} />}

      {(tema || interp) &&
        blocks.map((b) => <SourceBlock key={b.key + JSON.stringify(b.params)} label={b.label} params={b.params} savedPids={savedPids} />)}

      {interp && !blocks.length && !author && !interp.movement && !interp.era && (
        <p className="text-ink-2">Prueba con un autor, un título o un verso.</p>
      )}
    </div>
  )
}
