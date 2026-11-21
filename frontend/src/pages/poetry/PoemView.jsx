import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { motion } from 'motion/react'
import { ArrowLeft, Copy, Download, ExternalLink, Focus, Gift, Printer, RefreshCw, Settings2, Type, X } from 'lucide-react'
import { Spinner } from '../../components/ui/Bits'
import { Popover } from '../../components/studio/StudioBits'
import { JurisdictionSelect, PoemText, Portrait, RightsBadge, SourceErrors, useJurisdiction } from '../../components/poetry/PoetryBits'
import { NotesPanel, SaveControl } from '../../components/poetry/CollectionControls'
import WriteFromPoem from '../../components/poetry/WriteFromPoem'
import { FONTS, PAPERS, READER_DEFAULTS, WIDTHS, authorPath, getReaderPrefs, lifespan, poetryApi, pubLine, quotation, saveReaderPrefs } from '../../lib/poetry'
import { usePoetry } from '../../store/usePoetry'
import { useStore } from '../../store/useStore'

const ShareDialog = lazy(() => import('../../components/social/ShareDialog'))

function ReaderSettings({ prefs, setPrefs }) {
  const [open, setOpen] = useState(false)
  const set = (patch) => setPrefs((p) => ({ ...p, ...patch }))
  return (
    <div className="relative">
      <button className="btn btn-icon" onClick={() => setOpen((o) => !o)} aria-label="Ajustes de lectura" aria-expanded={open} title="Ajustes de lectura">
        <Settings2 size={17} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} align="right" className="w-80 space-y-4 p-4">
        <div>
          <p className="mb-2 flex items-center justify-between text-xs text-ink-3">
            Tamaño <span className="font-mono">{prefs.size}px</span>
          </p>
          <div className="flex items-center gap-2">
            <Type size={13} className="text-ink-3" />
            <input type="range" min={15} max={32} step={1} value={prefs.size} onChange={(e) => set({ size: Number(e.target.value) })} className="w-full accent-[var(--accent)]" aria-label="Tamaño de letra" />
            <Type size={19} className="text-ink-3" />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs text-ink-3">Papel</p>
          <div className="grid grid-cols-5 gap-1.5">
            {Object.entries(PAPERS).map(([k, p]) => (
              <button
                key={k}
                className={`poem-sheet ${p.className} h-11 rounded-md text-[10px] font-medium ring-offset-2 ring-offset-[var(--surface)] ${prefs.paper === k ? 'ring-2 ring-accent' : ''}`}
                style={{ color: 'var(--poem-ink)' }}
                onClick={() => set({ paper: k })}
                aria-pressed={prefs.paper === k}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs text-ink-3">Tipografía</p>
          <div className="grid grid-cols-4 gap-1.5">
            {Object.entries(FONTS).map(([k, f]) => (
              <button key={k} className="chip justify-center !px-2" data-active={prefs.font === k} style={{ fontFamily: f.family }} onClick={() => set({ font: k })}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="mb-2 text-xs text-ink-3">Ancho</p>
            <select className="field h-9 py-0 text-sm" value={prefs.width} onChange={(e) => set({ width: e.target.value })}>
              {Object.entries(WIDTHS).map(([k, w]) => (
                <option key={k} value={k}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-2 text-xs text-ink-3">Alineación</p>
            <select className="field h-9 py-0 text-sm" value={prefs.align} onChange={(e) => set({ align: e.target.value })}>
              <option value="left">Izquierda</option>
              <option value="center">Bloque centrado</option>
            </select>
          </div>
        </div>
        <button className="btn btn-sm btn-ghost w-full" onClick={() => setPrefs({ ...READER_DEFAULTS })}>
          Restablecer
        </button>
      </Popover>
    </div>
  )
}

function PdfMenu({ rec }) {
  const toast = useStore((s) => s.toast)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const [styles, setStyles] = useState(null)
  const [unsupported, setUnsupported] = useState(false)

  const openMenu = async () => {
    setOpen((o) => !o)
    if (!styles) {
      const mod = await import('../../lib/poemPdf')
      setStyles(mod.PDF_STYLES)
    }
  }
  const download = async (key) => {
    setBusy(key)
    try {
      const { downloadPoemPdf, UnsupportedScriptError } = await import('../../lib/poemPdf')
      try {
        const size = await downloadPoemPdf(rec, key)
        toast(`PDF listo (${Math.max(1, Math.round(size / 1024))} KB).`)
        setOpen(false)
      } catch (err) {
        if (err instanceof UnsupportedScriptError) setUnsupported(true)
        else throw err
      }
    } catch (err) {
      toast(`No se pudo crear el PDF: ${err.message}`, { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="relative">
      <button className="btn" onClick={openMenu} aria-expanded={open}>
        <Download size={16} /> PDF
      </button>
      <Popover open={open} onClose={() => setOpen(false)} align="right" className="w-80 p-2">
        <p className="px-3 pt-2 pb-1 text-xs text-ink-3">Edición A5 con tipografía incrustada, fuente y estado de derechos.</p>
        {!styles ? (
          <div className="p-3">
            <Spinner size={15} />
          </div>
        ) : (
          Object.entries(styles).map(([k, s]) => (
            <button key={k} className="flex w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-surface-2" onClick={() => download(k)} disabled={!!busy}>
              {busy === k ? <Spinner size={15} /> : <Download size={15} className="mt-0.5 text-ink-3" />}
              <span>
                <span className="block font-medium">{s.label}</span>
                <span className="block text-xs text-ink-3">{s.hint}</span>
              </span>
            </button>
          ))
        )}
        {unsupported && (
          <div className="m-2 rounded-xl border border-line p-3 text-xs text-ink-2">
            Este poema usa caracteres que nuestras tipografías no incluyen.
            <button
              className="btn btn-sm mt-2 w-full"
              onClick={async () => {
                const { printPoem } = await import('../../lib/poemPdf')
                printPoem(rec)
              }}
            >
              <Printer size={14} /> Imprimir / guardar como PDF desde el navegador
            </button>
          </div>
        )}
      </Popover>
    </div>
  )
}

function Sheet({ rec, prefs }) {
  const paper = PAPERS[prefs.paper] || PAPERS.crema
  const font = FONTS[prefs.font] || FONTS.garamond
  const width = WIDTHS[prefs.width] || WIDTHS.medio
  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.2, 0.75, 0.2, 1] }}
      className={`poem-sheet ${paper.className} mx-auto w-full px-6 pt-12 pb-10 md:px-14 md:pt-16 md:pb-14`}
      style={{ maxWidth: `calc(${width.max} + 7rem)` }}
      lang={rec.lang}
    >
      <header className="mb-8 text-center">
        <h1 className="poem-title" style={{ fontSize: `${Math.round(prefs.size * 1.9)}px` }}>
          {rec.title}
        </h1>
        {(rec.altTitle || rec.subtitle) && <p className="poem-meta mt-2 font-serif italic" style={{ fontSize: `${prefs.size * 0.85}px` }}>{rec.altTitle || rec.subtitle}</p>}
        {rec.author && (
          <p className="poem-accent mt-3 font-serif italic" style={{ fontSize: `${prefs.size * 0.95}px` }}>
            {rec.author.name}
            {lifespan(rec.author) && <span className="poem-meta not-italic"> · {lifespan(rec.author)}</span>}
          </p>
        )}
        {rec.translator && <p className="poem-meta mt-1 font-serif text-sm italic">Traducción de {rec.translator.name}</p>}
        {pubLine(rec) && <p className="poem-meta mt-1 font-serif text-sm">{pubLine(rec)}</p>}
        <div className="poem-ornament mt-6 text-[10px]">✦</div>
      </header>
      <div className={prefs.align === 'center' ? 'mx-auto w-fit max-w-full' : 'mx-auto'} style={{ maxWidth: width.max }}>
        <PoemText lines={rec.lines} style={{ fontFamily: font.family, fontSize: `${prefs.size}px`, lineHeight: prefs.font === 'courier' ? 1.75 : 1.62 }} />
      </div>
      <footer className="poem-meta mt-12 border-t border-current/15 pt-4 text-center font-serif text-[12.5px] italic opacity-90">{rec.attribution}</footer>
    </motion.article>
  )
}

function ReferenceCard({ rec }) {
  return (
    <article className="poem-sheet poem-paper-marfil mx-auto w-full max-w-2xl px-7 py-10 text-center md:px-12" lang={rec.lang}>
      <p className="poem-accent mb-3 font-mono text-[11px] tracking-[0.18em] uppercase">Referencia bibliográfica</p>
      <h1 className="poem-title text-[2.2rem] md:text-[2.8rem]">{rec.title}</h1>
      {rec.author && (
        <p className="poem-accent mt-2 font-serif text-lg italic">
          {rec.author.name} <span className="poem-meta not-italic">· {lifespan(rec.author)}</span>
        </p>
      )}
      {rec.translator && <p className="poem-meta mt-1 font-serif italic">Traducción de {rec.translator.name}</p>}
      {pubLine(rec) && <p className="poem-meta mt-1 font-serif">{pubLine(rec)}</p>}
      <p className="poem-meta mt-1 font-mono text-xs">{rec.linecount} versos · {rec.langName}</p>
      <div className="poem-ornament my-6 text-[10px]">✦</div>
      <p className="mx-auto max-w-lg font-serif text-[15px] leading-relaxed" style={{ color: 'var(--poem-ink)' }}>
        {rec.rights.explanation}
      </p>
      <a className="btn mt-6 border-[rgba(60,40,22,0.25)] bg-[rgba(60,40,22,0.06)] text-[#22201c]" href={rec.source.pageUrl} target="_blank" rel="noreferrer">
        Leer en {rec.source.name} <ExternalLink size={14} />
      </a>
    </article>
  )
}

export default function PoemView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useStore((s) => s.toast)
  const [j] = useJurisdiction()
  const [state, setState] = useState({ status: 'loading' })
  const [prefs, setPrefsState] = useState(getReaderPrefs)
  const [focus, setFocus] = useState(false)
  const [retry, setRetry] = useState(0)
  const social = useStore((s) => s.authRequired)
  const [sharing, setSharing] = useState(false)
  const init = usePoetry((s) => s.init)
  const item = usePoetry((s) => s.items.find((i) => i.pid === id))
  const storedRef = useRef(null)
  storedRef.current = item

  useEffect(() => init(), [init])
  const setPrefs = useCallback((fn) => {
    setPrefsState((p) => {
      const next = typeof fn === 'function' ? fn(p) : fn
      saveReaderPrefs(next)
      return next
    })
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    setState({ status: 'loading' })
    poetryApi
      .poem(id, ctrl.signal)
      .then((rec) => setState({ status: 'ready', rec }))
      .catch((err) => {
        if (err.name === 'AbortError') return
        const saved = storedRef.current
        if (saved?.text && err.status !== 404) {
          // Source unreachable: fall back to the copy kept in the collection (only
          // ever stored when the poem is free in every jurisdiction).
          setState({ status: 'ready', offline: err.message, rec: offlineRecord(saved) })
        } else setState({ status: 'error', error: err.message, code: err.status })
      })
    return () => ctrl.abort()
  }, [id, j, retry])

  useEffect(() => {
    if (!focus) return
    const onKey = (e) => e.key === 'Escape' && setFocus(false)
    window.addEventListener('keydown', onKey)
    document.documentElement.requestFullscreen?.().catch(() => {})
    return () => {
      window.removeEventListener('keydown', onKey)
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [focus])

  const rec = state.rec
  const free = Boolean(rec?.lines && rec.rights.allowsFullText)

  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(`${what} copiada.`)
    } catch {
      toast('No se pudo copiar al portapapeles.', { tone: 'error' })
    }
  }

  if (state.status === 'loading')
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-ink-2">
        <Spinner /> Abriendo el poema…
      </div>
    )
  if (state.status === 'error')
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <SourceErrors errors={[{ message: state.error }]} />
        <div className="mt-5 flex justify-center gap-2">
          {state.code !== 404 && (
            <button className="btn" onClick={() => setRetry((r) => r + 1)}>
              <RefreshCw size={15} /> Reintentar
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => navigate('/poesia')}>
            Volver a la antología
          </button>
        </div>
      </div>
    )

  if (focus && free)
    return (
      <div className="poetry-focus px-4 py-10 md:py-16" role="dialog" aria-label="Modo concentración">
        <button className="btn btn-icon btn-sm fixed top-4 right-4 z-10 opacity-40 transition hover:opacity-100" onClick={() => setFocus(false)} aria-label="Salir del modo concentración (Esc)">
          <X size={18} />
        </button>
        <Sheet rec={rec} prefs={prefs} />
      </div>
    )

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center gap-2">
        <button className="btn btn-ghost btn-sm -ml-2" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} /> Volver
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {free && <ReaderSettings prefs={prefs} setPrefs={setPrefs} />}
          {free && (
            <button className="btn btn-icon" onClick={() => setFocus(true)} aria-label="Modo concentración" title="Modo concentración">
              <Focus size={17} />
            </button>
          )}
          {free && <PdfMenu rec={rec} />}
          <WriteFromPoem rec={rec} />
          {social && !state.offline && (
            <button className="btn" onClick={() => setSharing(true)} title="Compartir con tus amigos de la Tertulia">
              <Gift size={16} /> Compartir
            </button>
          )}
          <SaveControl rec={rec} />
        </div>
      </div>
      {sharing && (
        <Suspense fallback={null}>
          <ShareDialog open={sharing} onClose={() => setSharing(false)} kind="poem" item={rec} />
        </Suspense>
      )}

      {state.offline && (
        <div className="mb-5">
          <SourceErrors errors={[{ message: `La fuente no responde (${state.offline}). Mostramos la copia de dominio público guardada en tu colección.` }]} />
        </div>
      )}
      <SourceErrors errors={rec.errors} />

      {free ? <Sheet rec={rec} prefs={prefs} /> : <ReferenceCard rec={rec} />}

      <div className="mx-auto mt-10 grid max-w-5xl gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-line bg-surface/60 p-5">
          <p className="kicker mb-3">Derechos y fuente</p>
          <RightsBadge rights={rec.rights} />
          <p className="mt-3 text-sm text-ink-2">{rec.rights.explanation}</p>
          {rec.rights.license && rec.rights.licenseUrl && (
            <a href={rec.rights.licenseUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-dusk">
              {rec.rights.license} <ExternalLink size={12} />
            </a>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <JurisdictionSelect />
          </div>
          <div className="mt-5 border-t border-line pt-4 text-sm">
            <p className="text-ink-3">{rec.source.note}</p>
            <a href={rec.source.pageUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-dusk">
              Ver en {rec.source.name} <ExternalLink size={12} />
            </a>
            <div className="mt-4 rounded-xl bg-surface-2 p-3 font-serif text-[13.5px] italic">{rec.attribution}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn btn-sm btn-ghost" onClick={() => copy(rec.attribution, 'Atribución')}>
                <Copy size={13} /> Copiar atribución
              </button>
              {free && (
                <button className="btn btn-sm btn-ghost" onClick={() => copy(quotation(rec), 'Cita')}>
                  <Copy size={13} /> Copiar poema con cita
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-line bg-surface/60 p-5">
          {rec.author?.qid ? (
            <Link to={authorPath(rec.author.qid)} className="group mb-5 flex items-center gap-4">
              <Portrait poet={rec.author} size={56} />
              <div>
                <p className="kicker mb-0.5">Autor</p>
                <p className="font-display text-2xl group-hover:text-dusk">{rec.author.name}</p>
                <p className="font-mono text-xs text-ink-3">{lifespan(rec.author)}</p>
              </div>
            </Link>
          ) : null}
          <p className="kicker mb-3">Mis notas</p>
          {item ? (
            <NotesPanel item={item} />
          ) : (
            <p className="text-sm text-ink-3">Guarda el poema en tu colección para añadir notas personales.</p>
          )}
        </section>
      </div>
    </div>
  )
}

function offlineRecord(saved) {
  return {
    id: saved.pid,
    ref: { source: saved.source || (saved.pid.startsWith('pdb.') ? 'poetrydb' : 'wikisource'), sourceId: saved.pid },
    title: saved.title,
    lang: saved.language,
    langName: saved.language,
    collection: saved.collection,
    year: saved.year,
    author: saved.author,
    translator: saved.translatorName ? { name: saved.translatorName } : null,
    lines: saved.text.split('\n'),
    linecount: saved.linecount,
    source: { name: saved.sourceName, pageUrl: saved.sourceUrl, note: 'Copia guardada en tu colección.' },
    rights: { status: saved.rightsStatus, label: saved.rightsStatus === 'open_license' ? 'Licencia abierta' : 'Dominio público', explanation: saved.rightsNote, allowsFullText: true, universal: true, license: saved.license },
    attribution: `«${saved.title}»${saved.author ? `, ${saved.author.name}` : ''}. Fuente: ${saved.sourceName} — ${saved.sourceUrl}`,
    errors: [],
  }
}
