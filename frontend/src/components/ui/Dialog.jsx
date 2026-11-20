import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
}

/** Centered modal dialog. */
export function Dialog({ open, onClose, title, children, width = 'max-w-lg', footer }) {
  useEscape(open, onClose)
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'var(--overlay)' }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`relative flex max-h-[92dvh] w-full ${width} flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-[var(--shadow-pop)] sm:rounded-3xl`}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 30, stiffness: 340 }}
          >
            {title && (
              <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
                <h2 className="font-display text-xl">{title}</h2>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Cerrar">
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** Side sheet on desktop, bottom sheet on mobile. */
export function Sheet({ open, onClose, children, label = 'Panel' }) {
  useEscape(open, onClose)
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[55]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 backdrop-blur-[3px]" style={{ background: 'var(--overlay)' }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[28px] border border-line bg-bg shadow-[var(--shadow-pop)] md:inset-y-3 md:right-3 md:left-auto md:max-h-none md:w-[min(560px,calc(100vw-1.5rem))] md:rounded-[28px]"
            initial={{ x: 0, y: '100%' }}
            animate={{ x: 0, y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 34, stiffness: 320 }}
          >
            <button
              className="btn btn-icon btn-sm absolute top-4 right-4 z-20 border-transparent bg-surface/80 backdrop-blur"
              onClick={onClose}
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
            <div className="overflow-y-auto overscroll-contain">{children}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirmar', danger }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-md"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className={`btn ${danger ? 'btn-primary' : 'btn-ink'}`}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-ink-2">{message}</p>
    </Dialog>
  )
}
