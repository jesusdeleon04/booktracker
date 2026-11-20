import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Copy, ExternalLink, Heart, X } from 'lucide-react'
import { Spinner } from '../ui/Bits'
import { PoemText, RightsBadge } from './PoetryBits'
import { lifespan, poemPath, poetryApi, quotation } from '../../lib/poetry'
import { usePoetry } from '../../store/usePoetry'
import { useStore } from '../../store/useStore'

/** Read a saved poem inside the studio, rights-checked like everywhere else. */
function Reader({ item, onBack }) {
  const toast = useStore((s) => s.toast)
  const [state, setState] = useState({ status: 'loading' })
  useEffect(() => {
    const ctrl = new AbortController()
    poetryApi
      .poem(item.pid, ctrl.signal)
      .then((rec) => setState({ status: 'ready', rec }))
      .catch((err) => {
        if (err.name === 'AbortError') return
        if (item.text) setState({ status: 'ready', offline: true, rec: { title: item.title, author: item.author, lines: item.text.split('\n'), rights: { status: item.rightsStatus, label: 'Dominio público', allowsFullText: true }, attribution: `«${item.title}»${item.author ? `, ${item.author.name}` : ''}. Fuente: ${item.sourceName} — ${item.sourceUrl}` } })
        else setState({ status: 'error', error: err.message })
      })
    return () => ctrl.abort()
  }, [item])
  const rec = state.rec
  const free = Boolean(rec?.lines && rec.rights?.allowsFullText)
  return (
    <div>
      <button className="btn btn-ghost btn-sm mb-3 -ml-2" onClick={onBack}>
        <ArrowLeft size={14} /> Antología
      </button>
      {state.status === 'loading' && <Spinner />}
      {state.status === 'error' && <p className="text-sm text-ink-2">No se pudo abrir: {state.error}</p>}
      {rec && (
        <article className="poem-sheet poem-paper-crema px-5 py-6">
          <h3 className="poem-title text-[1.5rem]">{rec.title}</h3>
          <p className="poem-accent font-serif text-[15px] italic">
            {rec.author?.name} <span className="poem-meta not-italic">· {lifespan(rec.author)}</span>
          </p>
          <div className="mt-4">
            {free ? (
              <PoemText lines={rec.lines} className="font-serif text-[15.5px] leading-[1.6]" />
            ) : (
              <p className="poem-meta font-serif text-sm italic">{rec.rights.explanation}</p>
            )}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[rgba(60,40,22,0.14)] pt-3">
            <RightsBadge rights={rec.rights} short />
            {free && (
              <button
                className="btn btn-sm ml-auto border-[rgba(60,40,22,0.2)] bg-transparent text-[#2a1e15]"
                onClick={() =>
                  navigator.clipboard
                    .writeText(quotation(rec))
                    .then(() => toast('Cita copiada con su atribución.'))
                    .catch(() => toast('No se pudo copiar.', { tone: 'error' }))
                }
              >
                <Copy size={13} /> Copiar cita
              </button>
            )}
            {!free && rec.source?.pageUrl && (
              <a className="btn btn-sm ml-auto" href={rec.source.pageUrl} target="_blank" rel="noreferrer">
                Fuente <ExternalLink size={12} />
              </a>
            )}
          </div>
        </article>
      )}
    </div>
  )
}

export default function AnthologyPanel({ open, onClose }) {
  const init = usePoetry((s) => s.init)
  const items = usePoetry((s) => s.items)
  const status = usePoetry((s) => s.status)
  const [reading, setReading] = useState(null)
  const [showAll, setShowAll] = useState(false)
  useEffect(() => {
    if (open) init()
  }, [open, init])
  const favorites = useMemo(() => items.filter((i) => i.isFavorite), [items])
  const list = showAll || !favorites.length ? items : favorites

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: -24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -24, opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          className="studio-chrome fixed inset-x-0 bottom-0 z-40 max-h-[82dvh] overflow-y-auto rounded-t-[26px] border border-line bg-surface p-5 shadow-[var(--shadow-pop)] md:inset-x-auto md:top-20 md:bottom-4 md:left-4 md:max-h-none md:w-[360px] md:rounded-[26px]"
          aria-label="Antología: tus poemas guardados"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="kicker kicker-dusk">Antología</p>
              <p className="font-display text-xl">Poemas para acompañarte</p>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Cerrar antología">
              <X size={16} />
            </button>
          </div>
          {reading ? (
            <Reader item={reading} onBack={() => setReading(null)} />
          ) : status === 'loading' && !items.length ? (
            <Spinner />
          ) : !items.length ? (
            <p className="text-sm text-ink-2">
              Aún no has guardado poemas. <Link to="/poesia" className="text-dusk underline">Explora la biblioteca de poesía</Link> y guarda los que quieras tener a mano.
            </p>
          ) : (
            <>
              {favorites.length > 0 && (
                <div className="mb-3 flex gap-1.5">
                  <button className="chip" data-active={!showAll} onClick={() => setShowAll(false)}>
                    <Heart size={12} className="fill-current text-[#c0473a]" /> Favoritos
                  </button>
                  <button className="chip" data-active={showAll} onClick={() => setShowAll(true)}>
                    Todos
                  </button>
                </div>
              )}
              <ul className="space-y-1.5">
                {list.map((it) => (
                  <li key={it.id}>
                    <button className="w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-surface-2" onClick={() => setReading(it)}>
                      <p className="font-display text-[1.1rem] leading-tight">{it.title}</p>
                      <p className="text-xs text-ink-3">{it.author?.name}</p>
                    </button>
                  </li>
                ))}
              </ul>
              <Link to="/poesia/coleccion" className="mt-4 inline-flex items-center gap-1 text-sm text-dusk">
                Abrir mi colección <ExternalLink size={12} />
              </Link>
            </>
          )}
          {reading && (
            <Link to={poemPath(reading.pid)} className="mt-4 inline-flex items-center gap-1 text-sm text-dusk">
              Abrir en el lector <ExternalLink size={12} />
            </Link>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
