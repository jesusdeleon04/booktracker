import { useMemo, useState } from 'react'
import { hashString } from '../../lib/match'

// Old cloth and leather bindings with gold-foil lettering.
const PALETTES = [
  ['#5E2219', '#E2C17E'],
  ['#233A2C', '#D9B771'],
  ['#1E2B41', '#D8BA7C'],
  ['#4A2C3E', '#E0C089'],
  ['#6B4A1F', '#F0DDB0'],
  ['#2A211A', '#E9A34F'],
  ['#2F4650', '#E3CB98'],
  ['#57212C', '#E6C58A'],
  ['#1D3533', '#D3AE66'],
  ['#3E2F22', '#E8D3A6'],
]

/** Typographic cover for books without an image — still looks like a book. */
export function GeneratedCover({ title, authors, compact }) {
  const h = hashString(title || '?')
  const [bg, fg] = PALETTES[h % PALETTES.length]
  const pattern = h % 3
  return (
    <div className="absolute inset-0 flex flex-col p-[9%]" style={{ background: bg, color: fg }}>
      <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(120% 80% at 30% 10%, rgba(255,255,255,0.18), transparent 60%), repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0 1px, transparent 1px 3px)' }} />
      <div className="absolute inset-[5%] rounded-[2px] border opacity-50" style={{ borderColor: fg }} />
      {pattern === 0 && (
        <div className="absolute right-[-20%] bottom-[-12%] aspect-square w-[85%] rounded-full opacity-[0.13]" style={{ background: fg }} />
      )}
      {pattern === 1 && (
        <div
          className="absolute inset-x-0 bottom-0 h-1/3 opacity-[0.12]"
          style={{ background: `repeating-linear-gradient(0deg, ${fg} 0 1px, transparent 1px 7px)` }}
        />
      )}
      {pattern === 2 && <div className="absolute top-[38%] right-[12%] left-[12%] h-px opacity-40" style={{ background: fg }} />}
      <div className="relative mt-[8%] flex-1">
        <p
          className={`font-display leading-[1.05] font-semibold break-words ${compact ? 'text-[11px]' : 'text-[clamp(13px,1.6vw,22px)]'}`}
          style={{ fontStyle: 'italic', textShadow: '0 1px 0 rgba(0,0,0,0.35)' }}
        >
          {title}
        </p>
      </div>
      {!compact && (
        <p className="relative font-mono text-[9px] tracking-[0.14em] uppercase opacity-80 line-clamp-2">
          {(authors || []).slice(0, 2).join(' · ')}
        </p>
      )}
    </div>
  )
}

// Open Library serves three sizes; small thumbnails don't need the large file.
function sized(url, compact) {
  if (!url || !compact) return url
  return url.replace(/(covers\.openlibrary\.org\/b\/(?:id|isbn)\/[^-]+)-L\.jpg/, '$1-M.jpg')
}

/**
 * A book cover with physical treatment (spine, gloss, shadow), lazy image,
 * fallback chain (primary → alternate source → typographic cover).
 */
export default function Cover({ book, className = '', compact = false, lift = false, eager = false, style }) {
  const sources = useMemo(
    () => [book?.coverUrl, book?.coverAltUrl].filter(Boolean).map((u) => sized(u, compact)),
    [book?.coverUrl, book?.coverAltUrl, compact],
  )
  const key = sources.join('|')
  // Derived state keyed by the source list: resets synchronously when the book changes,
  // so a cached image that loads instantly is never marked "not loaded" afterwards.
  const [state, setState] = useState({ key, idx: 0, loaded: null })
  const current = state.key === key ? state : { key, idx: 0, loaded: null }
  if (state.key !== key) setState(current)

  const src = sources[current.idx]
  const failed = current.idx >= sources.length
  const loaded = current.loaded === src

  const next = () => setState((s) => ({ ...s, key, idx: s.idx + 1 }))
  const markLoaded = (img) => {
    if (img.naturalWidth < 12) next()
    else setState((s) => (s.loaded === img.getAttribute('src') ? s : { ...s, key, loaded: img.getAttribute('src') }))
  }

  return (
    <div className={`book ${lift ? 'book-lift' : ''} ${className}`} style={style}>
      {(failed || !src) && <GeneratedCover title={book?.title} authors={book?.authors} compact={compact} />}
      {src && !failed && (
        <>
          {!loaded && <div className="shimmer absolute inset-0" />}
          <img
            key={src}
            src={src}
            alt={`Portada de ${book?.title || 'libro'}`}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            ref={(el) => {
              if (el && el.complete && el.naturalWidth > 0 && current.loaded !== src) markLoaded(el)
            }}
            onLoad={(e) => markLoaded(e.currentTarget)}
            onError={next}
            className={`transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          />
        </>
      )}
    </div>
  )
}
