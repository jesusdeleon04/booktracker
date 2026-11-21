import { useState } from 'react'
import { Link } from 'react-router'
import { BookOpen, Feather, MoonStar, Sparkles } from 'lucide-react'
import { SEALS, initials, longDate } from '../../lib/social'

/** Round portrait: custom photo, Google photo or a monogram. */
export function Avatar({ person, size = 40, className = '' }) {
  const [broken, setBroken] = useState(false)
  const src = person?.avatar && !broken ? person.avatar : null
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-line-strong bg-surface-2 font-display text-ink-2 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : initials(person?.name)}
    </span>
  )
}

export function PersonLine({ person, sub, to, children, size = 44 }) {
  const name = (
    <>
      <Avatar person={person} size={size} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[1.15rem] leading-tight">{person?.name}</span>
        <span className="block truncate font-mono text-[11px] text-ink-3">
          {person?.username ? `@${person.username}` : ''}
          {sub ? `${person?.username ? ' · ' : ''}${sub}` : ''}
        </span>
      </span>
    </>
  )
  return (
    <div className="flex items-center gap-3">
      {to ? (
        <Link to={to} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl transition hover:text-dusk">
          {name}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{name}</span>
      )}
      {children && <span className="flex shrink-0 items-center gap-1.5">{children}</span>}
    </div>
  )
}

export function WaxSeal({ seal = 'lacre', letter = '·', size = 44, className = '', style }) {
  return (
    <span className={`wax-seal wax-${seal} ${className}`} style={{ width: size, height: size, fontSize: size * 0.42, ...style }} aria-hidden="true">
      {letter}
    </span>
  )
}

const STAMP_ICONS = { marfil: Feather, verjurado: BookOpen, aerograma: Sparkles, sepia: Feather, noche: MoonStar }

export function Stamp({ stationery = 'marfil', size = 38 }) {
  const Icon = STAMP_ICONS[stationery] || Feather
  return (
    <span className="post-stamp" style={{ width: size, height: size * 1.2 }} aria-hidden="true">
      <span className="text-[#8a5a2b]">
        <Icon size={size * 0.45} strokeWidth={1.4} />
      </span>
    </span>
  )
}

/** An envelope for the correspondence lists: sealed until read. */
export function EnvelopeCard({ letter, from, open = false, compact = false }) {
  const name = from?.name || ''
  const sealColor = SEALS[letter.seal]?.color
  return (
    <div className={`envelope envelope-${letter.stationery}`} data-open={open}>
      <div className="envelope-flap" />
      <div className="absolute top-3 right-3 z-[3]">
        <Stamp stationery={letter.stationery} size={compact ? 26 : 34} />
      </div>
      <div className="postmark top-3 right-14 z-[3] h-12 w-12 sm:right-16 sm:h-14 sm:w-14" style={{ color: sealColor }}>
        {new Date(letter.sentAt || letter.deliveredAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
      </div>
      {!open && (
        <div className="absolute top-[58%] left-1/2 z-[4] -translate-x-1/2 -translate-y-1/2">
          <WaxSeal seal={letter.seal} letter={initials(name)[0]} size={compact ? 34 : 44} />
        </div>
      )}
      <div className="absolute inset-x-4 bottom-3 z-[3] min-w-0">
        <p className="handwritten truncate text-[1.35rem] leading-none sm:text-[1.6rem]">{name}</p>
        {letter.subject && open && <p className="mt-1 truncate font-mono text-[10.5px] opacity-70">{letter.subject}</p>}
      </div>
    </div>
  )
}

export function letterDateLine(iso) {
  return longDate(iso)
}
