import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { ChevronDown, ChevronUp, RefreshCw, X } from 'lucide-react'
import { Spinner } from '../ui/Bits'
import { PoemText, RightsBadge } from './PoetryBits'
import { lifespan, poemPath, poetryApi } from '../../lib/poetry'

/** Vertical, scroll-snapping feed of random poems: scroll (or use the arrows) to the next one. */
export default function DiscoveryFeed({ open, onClose }) {
  const [poems, setPoems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [index, setIndex] = useState(0)
  const scroller = useRef(null)
  const seen = useRef(new Set())
  const busy = useRef(false)

  const more = useCallback(async (n = 1) => {
    if (busy.current) return
    busy.current = true
    setLoading(true)
    setError(null)
    try {
      for (let i = 0, tries = 0; i < n && tries < n * 4; tries++) {
        const p = await poetryApi.random()
        if (seen.current.has(p.id)) continue
        seen.current.add(p.id)
        setPoems((list) => [...list, p])
        i++
      }
    } catch (err) {
      setError(err.message)
    } finally {
      busy.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (!poems.length) more(2)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const go = useCallback((delta) => {
    const el = scroller.current
    if (el) el.scrollBy({ top: delta * el.clientHeight, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'j') go(1)
      else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, go])

  const onScroll = (e) => {
    const el = e.currentTarget
    const i = Math.round(el.scrollTop / el.clientHeight)
    if (i !== index) setIndex(i)
  }

  // Keep one poem ahead of the reader.
  useEffect(() => {
    if (open && poems.length && index >= poems.length - 2 && !error) more(1)
  }, [open, index, poems.length, error, more])

  if (!open) return null
  return createPortal(
    <div className="poetry-focus !overflow-hidden" role="dialog" aria-modal="true" aria-label="Descubrimiento al azar">
      <div className="absolute top-4 right-4 left-4 z-10 flex items-center justify-between">
        <p className="kicker kicker-dusk">Descubrimiento al azar{poems.length ? ` · ${index + 1}` : ''}</p>
        <button className="btn btn-icon btn-sm" onClick={onClose} aria-label="Cerrar (Esc)">
          <X size={18} />
        </button>
      </div>

      <div ref={scroller} onScroll={onScroll} className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto overscroll-contain">
        {poems.map((p) => (
          <section key={p.id} className="flex h-full snap-start snap-always items-center justify-center px-4 py-16">
            <article className="poem-sheet poem-paper-crema flex max-h-full w-full max-w-xl flex-col px-6 pt-8 pb-5 md:px-10">
              <h2 className="poem-title text-center text-[1.8rem] md:text-[2.2rem]">{p.title}</h2>
              <p className="poem-accent mt-1 text-center font-serif text-lg italic">
                {p.author?.name} <span className="poem-meta not-italic">· {lifespan(p.author)}</span>
              </p>
              <div className="poem-ornament my-4 text-xs">✦</div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto w-fit max-w-full">
                  <PoemText lines={p.lines} className="font-serif text-[1.05rem] leading-[1.6]" />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(60,40,22,0.14)] pt-3">
                <span className="poem-meta font-mono text-[11px]">
                  {p.source.name} · <RightsBadge rights={p.rights} short />
                </span>
                <Link to={poemPath(p.id)} onClick={onClose} className="btn btn-sm border-[rgba(60,40,22,0.25)] bg-[rgba(60,40,22,0.06)] text-[#2a1e15]">
                  Abrir en el lector
                </Link>
              </div>
            </article>
          </section>
        ))}
        {(loading || error) && (
          <section className="flex h-full snap-start items-center justify-center px-4 text-center">
            {error ? (
              <div>
                <p className="mb-3 text-ink-2">{error}</p>
                <button className="btn" onClick={() => more(1)}>
                  <RefreshCw size={15} /> Reintentar
                </button>
              </div>
            ) : (
              <span className="flex items-center gap-2 text-ink-2">
                <Spinner /> Buscando otro poema…
              </span>
            )}
          </section>
        )}
      </div>

      <div className="absolute right-4 bottom-6 z-10 flex flex-col gap-2">
        <button className="btn btn-icon" onClick={() => go(-1)} disabled={index === 0} aria-label="Poema anterior">
          <ChevronUp size={18} />
        </button>
        <button className="btn btn-icon btn-primary" onClick={() => go(1)} aria-label="Siguiente poema">
          <ChevronDown size={18} />
        </button>
      </div>
    </div>,
    document.body,
  )
}
