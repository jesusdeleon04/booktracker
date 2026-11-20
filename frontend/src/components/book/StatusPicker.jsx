import { motion } from 'motion/react'
import { BookMarked, BookOpen, Check } from 'lucide-react'
import { STATUS } from '../../lib/format'

const ICONS = { want: BookMarked, reading: BookOpen, read: Check }
const ORDER = ['want', 'reading', 'read']

/** Three-way reading status switch. */
export default function StatusPicker({ value, onChange, layoutId = 'status', size = 'md' }) {
  return (
    <div className={`grid grid-cols-3 gap-1 rounded-2xl border border-line bg-surface p-1 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
      {ORDER.map((s) => {
        const Icon = ICONS[s]
        const active = value === s
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`relative flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors ${size === 'sm' ? 'h-9 px-2' : 'h-11 px-3'} ${active ? '' : 'text-ink-2 hover:text-ink'}`}
            style={active ? { color: '#140d08' } : undefined}
            aria-pressed={active}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-xl"
                style={{ background: STATUS[s].color }}
                transition={{ type: 'spring', damping: 30, stiffness: 380 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              <Icon size={size === 'sm' ? 14 : 16} />
              {STATUS[s].label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
