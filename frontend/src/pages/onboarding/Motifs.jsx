// Small line illustrations for the "this or that" questions. Pure SVG, themed via currentColor.

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }

const motifs = {
  simple: (
    <svg viewBox="0 0 120 80" className="h-full w-full">
      <path {...S} d="M10 40 C 35 25, 55 55, 80 40 S 110 30, 112 40" />
    </svg>
  ),
  complex: (
    <svg viewBox="0 0 120 80" className="h-full w-full">
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} {...S} opacity={1 - i * 0.15} d={`M8 ${22 + i * 9} C 30 ${8 + i * 12}, 50 ${60 - i * 6}, 72 ${30 + i * 7} S 104 ${18 + i * 11}, 112 ${30 + i * 6}`} />
      ))}
    </svg>
  ),
  short: (
    <svg viewBox="0 0 120 80" className="h-full w-full">
      {[34, 46, 58, 70, 82].map((x, i) => (
        <rect key={x} {...S} x={x} y={22 + (i % 2) * 4} width="8" height={50 - (i % 2) * 4} rx="1" />
      ))}
      <path {...S} d="M24 72h76" />
    </svg>
  ),
  long: (
    <svg viewBox="0 0 120 80" className="h-full w-full">
      <rect {...S} x="22" y="14" width="30" height="58" rx="2" />
      <rect {...S} x="56" y="20" width="22" height="52" rx="2" />
      <rect {...S} x="82" y="10" width="16" height="62" rx="2" />
      <path {...S} d="M28 24h18M28 30h18M60 30h14" />
      <path {...S} d="M14 72h92" />
    </svg>
  ),
  introspective: (
    <svg viewBox="0 0 120 80" className="h-full w-full">
      {[30, 22, 14, 6].map((r, i) => (
        <circle key={r} {...S} cx="60" cy="40" r={r} opacity={0.4 + i * 0.2} />
      ))}
    </svg>
  ),
  action: (
    <svg viewBox="0 0 120 80" className="h-full w-full">
      {[0, 1, 2, 3].map((i) => (
        <path key={i} {...S} d={`M${12 + i * 8} ${62 - i * 4} L${70 + i * 10} ${22 + i * 2}`} opacity={1 - i * 0.18} />
      ))}
      <path {...S} d="M92 16 L108 20 L100 34" />
    </svg>
  ),
  characters: (
    <svg viewBox="0 0 120 80" className="h-full w-full">
      <circle {...S} cx="46" cy="30" r="12" />
      <path {...S} d="M24 70c2-14 12-22 22-22s20 8 22 22" />
      <circle {...S} cx="78" cy="34" r="10" opacity="0.6" />
      <path {...S} opacity="0.6" d="M62 70c2-11 9-18 16-18s15 7 17 18" />
    </svg>
  ),
  plot: (
    <svg viewBox="0 0 120 80" className="h-full w-full">
      <path {...S} d="M20 10h80v60H20V22M32 22h56v36H32V34M44 34h32v12H56" />
      <circle cx="56" cy="46" r="2.5" fill="currentColor" />
    </svg>
  ),
  classic: (
    <svg viewBox="0 0 120 80" className="h-full w-full">
      <path {...S} d="M24 22h72M30 16h60l6 6M24 22l6-6" />
      {[34, 54, 74].map((x) => (
        <path key={x} {...S} d={`M${x} 26v38M${x + 12} 26v38`} />
      ))}
      <path {...S} d="M22 68h76M18 72h84" />
    </svg>
  ),
  contemporary: (
    <svg viewBox="0 0 120 80" className="h-full w-full">
      <rect {...S} x="22" y="18" width="34" height="34" />
      <rect {...S} x="44" y="30" width="30" height="30" opacity="0.7" />
      <circle {...S} cx="86" cy="30" r="12" />
      <path {...S} d="M70 66h34" />
    </svg>
  ),
}

export default function Motif({ name, className = '' }) {
  return <div className={className}>{motifs[name]}</div>
}
