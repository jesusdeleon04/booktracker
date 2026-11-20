import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { CloudOff, Heart, Scale } from 'lucide-react'
import { JURISDICTIONS, RIGHTS_TONE, authorPath, getJurisdiction, lifespan, poemPath, setJurisdiction, splitIndent, stanzas } from '../../lib/poetry'

/** Current jurisdiction, kept in sync across the app. */
export function useJurisdiction() {
  const [j, setJ] = useState(getJurisdiction)
  useEffect(() => {
    const on = (e) => setJ(e.detail)
    window.addEventListener('bt-poetry-jurisdiction', on)
    return () => window.removeEventListener('bt-poetry-jurisdiction', on)
  }, [])
  return [j, setJurisdiction]
}

export function JurisdictionSelect({ className = '' }) {
  const [j, setJ] = useJurisdiction()
  return (
    <label className={`inline-flex items-center gap-2 text-sm ${className}`}>
      <Scale size={15} className="shrink-0 text-ink-3" />
      <span className="sr-only">Jurisdicción para comprobar los derechos de autor</span>
      <select className="field h-9 w-auto rounded-full py-0 text-sm" value={j} onChange={(e) => setJ(e.target.value)}>
        {JURISDICTIONS.map((x) => (
          <option key={x.key} value={x.key}>
            {x.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function RightsBadge({ rights, className = '', short = false }) {
  if (!rights) return null
  const tone = RIGHTS_TONE[rights.status] || RIGHTS_TONE.unknown
  const label = short ? tone.short : rights.label || tone.short
  return (
    <span className={`rights-seal ${className}`} style={{ color: tone.color, background: tone.soft }} title={rights.explanation || label}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.color }} />
      {label}
      {rights.provisional && rights.status !== 'unknown' ? <span className="opacity-60">·</span> : null}
    </span>
  )
}

export function Portrait({ poet, size = 64, className = '' }) {
  const [broken, setBroken] = useState(false)
  const initials = (poet?.name || '?')
    .split(/\s+/)
    .filter((w) => /^[A-ZÁÉÍÓÚÑÜ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
  return (
    <div className={`portrait shrink-0 ${className}`} style={{ width: size, height: size * 1.18 }}>
      {poet?.image && !broken ? (
        <img src={poet.image} alt={`Retrato de ${poet.name}`} loading="lazy" onError={() => setBroken(true)} referrerPolicy="no-referrer" />
      ) : (
        <span className="grid h-full w-full place-items-center font-display text-ink-2" style={{ fontSize: size * 0.36 }}>
          {initials}
        </span>
      )}
    </div>
  )
}

export function PoetCard({ poet, compact = false }) {
  return (
    <Link to={authorPath(poet.qid)} className="group flex w-full items-center gap-4 rounded-2xl border border-line bg-surface/60 p-3 pr-4 transition hover:border-line-strong hover:bg-surface">
      <Portrait poet={poet} size={compact ? 44 : 54} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[1.2rem] leading-tight group-hover:text-dusk">{poet.name}</p>
        <p className="mt-0.5 font-mono text-[11px] text-ink-3">{lifespan(poet)}</p>
        {!compact && poet.rights && <RightsBadge rights={poet.rights} short className="mt-1.5" />}
      </div>
    </Link>
  )
}

/** A poem's verse with stanzas, indentation and hanging wrap preserved. */
export function PoemText({ lines, className = '', style }) {
  return (
    <div className={`poem-verse ${className}`} style={style}>
      {stanzas(lines).map((st, i) => (
        <div className="poem-stanza" key={i}>
          {st.map((l, j) => {
            const { indent, text } = splitIndent(l)
            return (
              <div className="poem-line" key={j} style={{ '--indent': `${indent * 0.5}ch` }}>
                {text}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Search / list result. */
export function PoemCard({ item, saved, index = 0 }) {
  const author = item.author || (item.authors ? { name: item.authors.map((a) => a.name).join(' · ') } : null)
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 10) * 0.03 }}>
      <Link to={poemPath(item.id)} className="group block h-full">
        <article className="poem-sheet poem-paper-crema flex h-full flex-col px-5 pt-5 pb-4 transition group-hover:-translate-y-0.5">
          <div className="mb-2 flex items-start justify-between gap-3">
            <h3 className="poem-title text-[1.35rem]">{item.title}</h3>
            {saved && <Heart size={15} className="mt-1 shrink-0 fill-current text-[#a8321f]" aria-label="En tu colección" />}
          </div>
          {author && (
            <p className="poem-accent font-serif text-[15px] italic">
              {author.name}
              {author.birthYear || author.deathYear ? <span className="poem-meta not-italic"> · {lifespan(author)}</span> : null}
            </p>
          )}
          {item.collection && <p className="poem-meta mt-0.5 line-clamp-1 font-serif text-[13px]">{item.collection}</p>}
          {item.preview?.length ? (
            <PoemText lines={item.preview} className="poem-meta mt-3 font-serif text-[14.5px] leading-[1.55]" />
          ) : (
            <p className="poem-meta mt-3 font-serif text-[13.5px] italic opacity-80">
              {item.rights?.allowsFullText ? 'Ábrelo para leerlo completo.' : 'Referencia y enlace a la fuente.'}
            </p>
          )}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
            <RightsBadge rights={item.rights} short />
            <span className="font-mono text-[10.5px] tracking-wide text-[#8f7a62] uppercase">
              {item.sourceName}
              {item.linecount ? ` · ${item.linecount} v.` : ''}
            </span>
          </div>
        </article>
      </Link>
    </motion.div>
  )
}

export function SourceErrors({ errors }) {
  if (!errors?.length) return null
  const seen = new Set()
  return (
    <div className="space-y-2">
      {errors
        .filter((e) => !seen.has(e.message) && seen.add(e.message))
        .map((e, i) => (
          <p key={i} className="flex items-start gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink-2">
            <CloudOff size={15} className="mt-0.5 shrink-0 text-ember" />
            {e.message}
          </p>
        ))}
    </div>
  )
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />
}
