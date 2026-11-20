import { useMemo } from 'react'

/**
 * A strand of warm string lights hanging in swags across its container —
 * the attic library / garden-at-night motif from the visual references.
 * Pure CSS/SVG, decorative only.
 */
export default function StringLights({ swags = 2, perSwag = 9, height = 96, sag = 0.62, className = '', dim = false }) {
  const bulbs = useMemo(() => {
    const out = []
    for (let s = 0; s < swags; s++) {
      const start = s / swags
      const end = (s + 1) / swags
      const y0 = s % 2 ? 14 : 8
      const y1 = s % 2 ? 8 : 14
      for (let i = 1; i < perSwag; i++) {
        const t = i / perSwag
        const x = (start + (end - start) * t) * 100
        const y = y0 + (y1 - y0) * t + (height * sag) * 4 * t * (1 - t)
        const seed = (s * 31 + i * 17) % 23
        out.push({ x, y, delay: (seed / 23) * 3, dur: 2.6 + (seed % 7) * 0.35, big: seed % 4 === 0 })
      }
    }
    return out
  }, [swags, perSwag, height, sag])

  const path = useMemo(() => {
    let d = ''
    for (let s = 0; s < swags; s++) {
      const x0 = (s / swags) * 1000
      const x1 = ((s + 1) / swags) * 1000
      const y0 = s % 2 ? 14 : 8
      const y1 = s % 2 ? 8 : 14
      const cx = (x0 + x1) / 2
      const cy = (y0 + y1) / 2 + height * sag * 2
      d += `${s === 0 ? `M${x0},${y0}` : ''} Q${cx},${cy} ${x1},${y1} `
    }
    return d
  }, [swags, height, sag])

  return (
    <div className={`pointer-events-none ${className}`} style={{ height }} aria-hidden="true">
      <div className="relative h-full w-full">
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 1000 ${height}`} preserveAspectRatio="none">
        <path d={path} fill="none" stroke="rgba(30,20,12,0.75)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
      {bulbs.map((b, i) => (
        <span
          key={i}
          className="bulb absolute -translate-x-1/2"
          style={{
            left: `${b.x}%`,
            top: b.y - 1,
            '--delay': `${b.delay}s`,
            '--dur': `${b.dur}s`,
          }}
        >
          <span className="mx-auto block h-[3px] w-[3px] rounded-sm bg-[#2a1d12]" />
          <span
            className="block rounded-full"
            style={{
              width: b.big ? 9 : 7,
              height: b.big ? 11 : 9,
              background: 'radial-gradient(circle at 50% 40%, #fff8e1 0%, #ffd790 45%, #f0a347 100%)',
              boxShadow: dim
                ? '0 0 8px 2px rgba(245, 175, 85, 0.45)'
                : '0 0 10px 3px rgba(255, 190, 100, 0.55), 0 0 28px 8px rgba(245, 160, 70, 0.22)',
            }}
          />
        </span>
      ))}
      </div>
    </div>
  )
}
