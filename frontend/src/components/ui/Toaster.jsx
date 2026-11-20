import { AnimatePresence, motion } from 'motion/react'
import { Check, Info, TriangleAlert } from 'lucide-react'
import { useStore } from '../../store/useStore'

const ICONS = { success: Check, error: TriangleAlert, info: Info }

export default function Toaster() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex flex-col items-center gap-2 px-4 lg:bottom-8" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICONS[t.tone]
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ type: 'spring', damping: 26, stiffness: 380 }}
              className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full border border-line-strong bg-ink py-2 pr-2 pl-4 text-sm text-bg shadow-[var(--shadow-pop)]"
            >
              {Icon && (
                <span
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full"
                  style={{ background: t.tone === 'error' ? 'var(--ember)' : t.tone === 'success' ? 'var(--sage)' : 'var(--dusk)', color: '#111' }}
                >
                  <Icon size={12} strokeWidth={3} />
                </span>
              )}
              <span className="py-1 font-medium">{t.message}</span>
              {t.action ? (
                <button
                  className="rounded-full bg-bg/15 px-3 py-1 font-semibold text-bg transition hover:bg-bg/25"
                  onClick={() => {
                    dismiss(t.id)
                    t.action.run()
                  }}
                >
                  {t.action.label}
                </button>
              ) : (
                <span className="w-2" />
              )}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
