import { motion } from 'motion/react'
import { LoaderCircle } from 'lucide-react'

export function Spinner({ size = 18, className = '' }) {
  return <LoaderCircle size={size} className={`animate-spin ${className}`} />
}

/** Editorial section heading: kicker + serif title + optional action. */
export function SectionHead({ kicker, title, subtitle, action, className = '' }) {
  return (
    <div className={`mb-5 flex items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {kicker && <p className="kicker mb-1.5">{kicker}</p>}
        <h2 className="font-display text-[1.6rem] leading-tight md:text-3xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/** Big page title with italic emphasis. */
export function PageTitle({ kicker, children, sub, right }) {
  return (
    <header className="mb-8 flex flex-col gap-5 md:mb-12 md:flex-row md:items-end md:justify-between">
      <div>
        {kicker && <p className="kicker mb-3">{kicker}</p>}
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.2, 0.75, 0.2, 1] }}
          className="font-display text-[2.6rem] leading-[0.98] font-light text-balance md:text-[4.2rem]"
        >
          {children}
        </motion.h1>
        {sub && <p className="mt-3 max-w-xl text-ink-2">{sub}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </header>
  )
}

export function EmptyState({ icon: Icon, title, children, action, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-[28px] border border-dashed border-line-strong px-6 py-14 text-center ${className}`}
    >
      <div className="mx-auto mb-5 flex h-28 w-24 items-end justify-center gap-1.5">
        {[64, 88, 74].map((h, i) => (
          <motion.div
            key={i}
            initial={{ height: 0 }}
            animate={{ height: h }}
            transition={{ delay: 0.1 + i * 0.08, type: 'spring', damping: 14 }}
            className="w-5 rounded-[3px] border border-line-strong"
            style={{ background: ['var(--accent-soft)', 'var(--brass-soft)', 'var(--sage-soft)'][i] }}
          />
        ))}
      </div>
      {Icon && <Icon className="mx-auto mb-3 text-ink-3" size={20} />}
      <h3 className="font-display text-2xl">{title}</h3>
      {children && <p className="mx-auto mt-2 max-w-md text-ink-2">{children}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </motion.div>
  )
}

export function Segmented({ options, value, onChange, layoutId = 'seg', className = '' }) {
  return (
    <div className={`no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1 ${className}`}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`relative flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors ${active ? 'text-bg' : 'text-ink-2 hover:text-ink'}`}
          >
            {active && (
              <motion.span layoutId={layoutId} className="absolute inset-0 rounded-full bg-ink" transition={{ type: 'spring', damping: 30, stiffness: 400 }} />
            )}
            <span className="relative flex items-center gap-2">
              {o.icon}
              {o.label}
              {o.count != null && <span className={`font-mono text-[11px] ${active ? 'opacity-70' : 'text-ink-3'}`}>{o.count}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function GenreDot({ genre, size = 8 }) {
  if (!genre) return null
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${genre.colors[0]}, ${genre.colors[1]})` }}
    />
  )
}

export function Progress({ value, className = '', color = 'var(--accent)' }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-surface-3 ${className}`}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }}
        transition={{ duration: 0.8, ease: [0.2, 0.75, 0.2, 1] }}
      />
    </div>
  )
}

export function Ring({ value, max, size = 120, stroke = 8, children }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = max ? Math.min(1, value / max) : 0
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 1.2, ease: [0.2, 0.75, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}
