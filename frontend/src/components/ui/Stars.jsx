import { useState } from 'react'

function StarShape({ fill, size }) {
  // fill: 0, 0.5, 1
  const id = `half-${size}-${fill}`
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={id}>
          <stop offset={fill === 1 ? '100%' : fill === 0.5 ? '50%' : '0%'} stopColor="currentColor" />
          <stop offset={fill === 1 ? '100%' : fill === 0.5 ? '50%' : '0%'} stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.8l2.75 5.82 6.35.77-4.68 4.37 1.2 6.29L12 16.97l-5.62 3.08 1.2-6.29L2.9 9.39l6.35-.77L12 2.8z"
        fill={`url(#${id})`}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Read-only or interactive 5-star rating with half steps. */
export default function Stars({ value, onChange, size = 18, className = '', showValue = false }) {
  const [hover, setHover] = useState(null)
  const interactive = typeof onChange === 'function'
  const shown = hover ?? value ?? 0

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <div
        className={`inline-flex items-center text-brass ${interactive ? 'cursor-pointer' : ''}`}
        onMouseLeave={() => setHover(null)}
        role={interactive ? 'radiogroup' : 'img'}
        aria-label={value ? `${value} de 5 estrellas` : 'Sin calificar'}
      >
        {[1, 2, 3, 4, 5].map((i) => {
          const fill = shown >= i ? 1 : shown >= i - 0.5 ? 0.5 : 0
          if (!interactive) {
            return (
              <span key={i} className={fill ? '' : 'opacity-30'}>
                <StarShape fill={fill} size={size} />
              </span>
            )
          }
          return (
            <span key={i} className="relative inline-block transition-transform hover:scale-110" style={{ width: size, height: size }}>
              <span className={fill ? '' : 'opacity-35'}>
                <StarShape fill={fill} size={size} />
              </span>
              <button
                type="button"
                aria-label={`${i - 0.5} estrellas`}
                className="absolute inset-y-0 left-0 w-1/2"
                onMouseEnter={() => setHover(i - 0.5)}
                onClick={() => onChange(value === i - 0.5 ? null : i - 0.5)}
              />
              <button
                type="button"
                aria-label={`${i} estrellas`}
                className="absolute inset-y-0 right-0 w-1/2"
                onMouseEnter={() => setHover(i)}
                onClick={() => onChange(value === i ? null : i)}
              />
            </span>
          )
        })}
      </div>
      {showValue && (
        <span className="font-mono text-xs text-ink-3">{shown ? String(shown).replace('.', ',') : '—'}</span>
      )}
    </div>
  )
}
