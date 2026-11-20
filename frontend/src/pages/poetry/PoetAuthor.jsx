import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { motion } from 'motion/react'
import { ArrowLeft, BookOpen, ExternalLink, Scale } from 'lucide-react'
import { Spinner } from '../../components/ui/Bits'
import { JurisdictionSelect, PoemCard, Portrait, RightsBadge, SourceErrors, useJurisdiction } from '../../components/poetry/PoetryBits'
import { LANGS, lifespan, poetryApi } from '../../lib/poetry'
import { usePoetry } from '../../store/usePoetry'

function PoemsFrom({ qid, source, lang, savedPids }) {
  const [j] = useJurisdiction()
  const [state, setState] = useState({ status: 'loading', items: [] })
  useEffect(() => {
    const ctrl = new AbortController()
    setState({ status: 'loading', items: [] })
    poetryApi
      .search({ author: qid, source, lang, limit: 18 }, ctrl.signal)
      .then((r) => setState({ status: 'ready', ...r }))
      .catch((err) => err.name !== 'AbortError' && setState({ status: 'error', items: [], errors: [{ message: err.message }] }))
    return () => ctrl.abort()
  }, [qid, source, lang, j])
  const more = async () => {
    setState((s) => ({ ...s, status: 'more' }))
    try {
      const r = await poetryApi.search({ author: qid, source, lang, limit: 18, offset: state.next })
      setState((s) => ({ ...s, status: 'ready', items: [...s.items, ...r.items], next: r.next, errors: r.errors }))
    } catch (err) {
      setState((s) => ({ ...s, status: 'ready', errors: [{ message: err.message }] }))
    }
  }
  if (state.status === 'loading') return <Spinner />
  return (
    <div>
      <SourceErrors errors={state.errors} />
      {state.note && <p className="text-sm text-ink-3">{state.note}</p>}
      {state.items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {state.items.map((it, i) => (
            <PoemCard key={it.id} item={it} index={i} saved={savedPids.has(it.id)} />
          ))}
        </div>
      ) : (
        !state.errors?.length && <p className="text-sm text-ink-3">Esta fuente no tiene poemas de este autor.</p>
      )}
      {state.next != null && (
        <div className="mt-5 text-center">
          <button className="btn" onClick={more} disabled={state.status === 'more'}>
            {state.status === 'more' && <Spinner size={15} />} Cargar más
          </button>
        </div>
      )}
    </div>
  )
}

export default function PoetAuthor() {
  const { qid } = useParams()
  const navigate = useNavigate()
  const [j] = useJurisdiction()
  const [state, setState] = useState({ status: 'loading' })
  const [tab, setTab] = useState(null)
  const items = usePoetry((s) => s.items)
  const init = usePoetry((s) => s.init)
  const savedPids = useMemo(() => new Set(items.map((i) => i.pid)), [items])

  useEffect(() => init(), [init])
  useEffect(() => {
    const ctrl = new AbortController()
    setState({ status: 'loading' })
    poetryApi
      .author(qid, ctrl.signal)
      .then((a) => setState({ status: 'ready', a }))
      .catch((err) => err.name !== 'AbortError' && setState({ status: 'error', error: err.message, code: err.status }))
    return () => ctrl.abort()
  }, [qid, j])

  const a = state.a
  const tabs = useMemo(() => {
    if (!a) return []
    const out = a.sources.wikisource.map((l) => ({ key: `ws-${l}`, label: `Wikisource · ${LANGS.find((x) => x.key === l)?.label || l}`, source: 'wikisource', lang: l }))
    if (a.sources.poetrydb) out.unshift({ key: 'pdb', label: 'PoetryDB', source: 'poetrydb' })
    // Originals first: the author's own language before translations.
    const own = a.writesIn || []
    return out.sort((x, y) => (own.includes(y.lang) ? 1 : 0) - (own.includes(x.lang) ? 1 : 0))
  }, [a])
  useEffect(() => setTab(null), [qid])
  const active = tabs.find((t) => t.key === tab) || tabs[0]
  const protectedWork = a?.rights?.status === 'protected'

  if (state.status === 'loading')
    return (
      <div className="flex items-center gap-2 py-20 text-ink-2">
        <Spinner /> Consultando Wikidata y Wikipedia…
      </div>
    )
  if (state.status === 'error')
    return (
      <div className="py-16">
        <SourceErrors errors={[{ message: state.error }]} />
        <button className="btn mt-4" onClick={() => navigate('/poesia')}>
          Volver a la antología
        </button>
      </div>
    )

  return (
    <div>
      <button className="btn btn-ghost btn-sm mb-4 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft size={15} /> Volver
      </button>
      <header className="dusk-sky relative -mx-4 mb-10 rounded-b-[2rem] px-4 pt-6 pb-8 md:-mx-8 md:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
            <Portrait poet={a} size={150} />
          </motion.div>
          <div className="min-w-0 flex-1">
            <p className="kicker kicker-dusk mb-2">{a.isPoet ? 'Poeta' : 'Autor'}</p>
            <h1 className="font-display text-[2.6rem] leading-[0.98] font-light md:text-[4rem]">{a.name}</h1>
            <p className="mt-2 font-mono text-sm text-ink-2">
              {lifespan(a)}
              {a.countries?.length ? ` · ${a.countries.join(', ')}` : ''}
            </p>
            {a.description && <p className="mt-1 text-ink-2 first-letter:uppercase">{a.description}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[...(a.curatedMovements || []), ...(a.movements || []).filter((m) => !(a.curatedMovements || []).some((c) => c.label.toLowerCase() === m.label.toLowerCase()))]
                .slice(0, 5)
                .map((m) =>
                  m.key ? (
                    <Link key={m.key} to={`/poesia/poetas?movimiento=${m.key}`} className="chip">
                      {m.label}
                    </Link>
                  ) : (
                    <span key={m.qid} className="chip !cursor-default first-letter:uppercase">
                      {m.label}
                    </span>
                  ),
                )}
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          {a.bio?.extract && (
            <section className="mb-10">
              <p className="max-w-3xl font-serif text-[1.15rem] leading-[1.75] text-ink first-letter:float-left first-letter:mr-2 first-letter:font-display first-letter:text-[3.4rem] first-letter:leading-[0.8] first-letter:text-dusk">
                {a.bio.extract}
              </p>
              {a.bio.url && (
                <a className="mt-2 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink" href={a.bio.url} target="_blank" rel="noreferrer">
                  Wikipedia ({a.bio.lang}) <ExternalLink size={12} />
                </a>
              )}
            </section>
          )}

          {protectedWork ? (
            <section className="mb-10 rounded-3xl border border-line bg-surface/60 p-5">
              <p className="flex items-center gap-2 font-display text-xl">
                <Scale size={18} className="text-ember" /> Obra protegida
              </p>
              <p className="mt-1 text-ink-2">{a.rights.explanation} No reproducimos sus poemas: abajo tienes sus obras con referencias y enlaces a fuentes fiables.</p>
            </section>
          ) : (
            tabs.length > 0 && (
              <section className="mb-12">
                <h2 className="mb-3 font-display text-2xl">Poemas</h2>
                <div className="no-scrollbar mb-5 flex gap-1.5 overflow-x-auto">
                  {tabs.map((t) => (
                    <button key={t.key} className="chip shrink-0" data-active={active?.key === t.key} onClick={() => setTab(t.key)}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {active && <PoemsFrom key={active.key} qid={a.qid} source={active.source} lang={active.lang} savedPids={savedPids} />}
              </section>
            )
          )}
          {!protectedWork && !tabs.length && (
            <p className="mb-10 text-ink-2">Ninguna de nuestras fuentes de texto libre (Wikisource, PoetryDB) tiene poemas de este autor. Puedes consultar sus obras como referencias.</p>
          )}

          {a.works?.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-1 font-display text-2xl">Obras</h2>
              <p className="mb-4 text-sm text-ink-3">Referencias bibliográficas de Wikidata, con enlace a Wikipedia cuando existe.</p>
              <ol className="divide-y divide-line rounded-2xl border border-line">
                {a.works.map((w) => (
                  <li key={w.qid}>
                    <a href={w.url} target="_blank" rel="noreferrer" className="flex items-baseline gap-3 px-4 py-3 transition hover:bg-surface">
                      <BookOpen size={14} className="shrink-0 translate-y-0.5 text-ink-3" />
                      <span className="min-w-0 flex-1">
                        <span className="font-serif text-[1.05rem] italic">{w.title}</span>
                        <span className="ml-2 text-xs text-ink-3">{w.kind}</span>
                      </span>
                      <span className="font-mono text-xs text-ink-3">{w.year || ''}</span>
                      <span className="hidden text-[11px] text-ink-3 sm:inline">{w.source}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl border border-line bg-surface/60 p-5">
            <p className="kicker mb-2">Derechos de autor</p>
            <RightsBadge rights={a.rights} />
            <p className="mt-3 text-sm text-ink-2">{a.rights.explanation}</p>
            <JurisdictionSelect className="mt-4" />
          </div>
          <div className="rounded-3xl border border-line bg-surface/60 p-5 text-sm">
            <p className="kicker mb-2">Fuentes</p>
            <ul className="space-y-1.5">
              <li>
                <a className="inline-flex items-center gap-1 hover:text-dusk" href={a.links.wikidata} target="_blank" rel="noreferrer">
                  Wikidata · {a.qid} <ExternalLink size={12} />
                </a>
              </li>
              {a.links.wikipedia && (
                <li>
                  <a className="inline-flex items-center gap-1 hover:text-dusk" href={a.links.wikipedia} target="_blank" rel="noreferrer">
                    Wikipedia <ExternalLink size={12} />
                  </a>
                </li>
              )}
              {Object.entries(a.links.wikisource || {}).map(([l, url]) => (
                <li key={l}>
                  <a className="inline-flex items-center gap-1 hover:text-dusk" href={url} target="_blank" rel="noreferrer">
                    Wikisource ({l}) <ExternalLink size={12} />
                  </a>
                </li>
              ))}
            </ul>
            <SourceErrors errors={a.errors} />
          </div>
        </aside>
      </div>
    </div>
  )
}
