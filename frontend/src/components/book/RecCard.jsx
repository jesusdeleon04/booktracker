import { useState } from 'react'
import { motion } from 'motion/react'
import { BookmarkPlus, Check, Feather, X } from 'lucide-react'
import Cover from './Cover'
import { useStore } from '../../store/useStore'
import { authorsLine } from '../../lib/format'
import { books as copy } from '../../lib/copy'
import ShareBookButton from '../social/ShareBookButton'

export function useQuickAdd() {
  const addBook = useStore((s) => s.addBook)
  const toast = useStore((s) => s.toast)
  return async (item, status = 'want', extra = {}) => {
    const res = await addBook(item, { status, ...extra })
    if (res.book && !res.duplicate) {
      const label = { want: 'Quiero leer', reading: 'Leyendo', read: 'Leídos' }[status]
      toast(copy.toasts.added(res.book.title, label), { tone: 'success' })
    }
    return res
  }
}

/** Recommendation / catalog card: cover, why it fits, quick actions. */
export default function RecCard({ item, index = 0, width = 'w-[164px] sm:w-[184px]', showReason = true, showDescription = false, onDismiss }) {
  const openPreview = useStore((s) => s.openPreview)
  const inLibrary = useStore((s) => s.findInLibrary(item))
  const feedback = useStore((s) => s.feedback)
  const toast = useStore((s) => s.toast)
  const quickAdd = useQuickAdd()
  const [busy, setBusy] = useState(false)

  const dismiss = async (e) => {
    e.stopPropagation()
    const ok = await feedback(item, 'dismiss')
    if (ok) {
      onDismiss?.(item)
      toast(copy.toasts.dismissed, { tone: 'info' })
    }
  }
  const save = async (e) => {
    e.stopPropagation()
    setBusy(true)
    await quickAdd(item, 'want')
    setBusy(false)
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.04, duration: 0.5, ease: [0.2, 0.75, 0.2, 1] }}
      className={`group ${width}`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => openPreview(item, { reasons: item.reasons })}
        onKeyDown={(e) => e.key === 'Enter' && openPreview(item, { reasons: item.reasons })}
        className="relative cursor-pointer"
        aria-label={`Ver ${item.title}`}
      >
        <Cover book={item} lift />
        <div className="absolute inset-x-2 bottom-2 z-10 flex justify-between opacity-100 transition md:translate-y-1 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100">
          {inLibrary ? (
            <span className="flex h-8 items-center gap-1 rounded-full bg-black/60 px-2.5 text-[11px] font-medium text-white backdrop-blur">
              <Check size={12} /> En tu biblioteca
            </span>
          ) : (
            <button
              onClick={save}
              disabled={busy}
              className="flex h-8 items-center gap-1 rounded-full bg-white/90 px-2.5 text-[11px] font-semibold text-black shadow backdrop-blur transition hover:bg-white"
              aria-label="Añadir a Quiero leer"
            >
              <BookmarkPlus size={13} /> Quiero leer
            </button>
          )}
          {onDismiss !== undefined && !inLibrary && (
            <button
              onClick={dismiss}
              className="grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80"
              aria-label="No me interesa"
              title="No me interesa"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 px-0.5">
        <h3
          className="cursor-pointer font-display text-[15px] leading-snug line-clamp-2 hover:text-accent"
          onClick={() => openPreview(item, { reasons: item.reasons })}
        >
          {item.title}
        </h3>
        <p className="mt-0.5 truncate text-[13px] text-ink-2">
          {authorsLine(item.authors, 1)}
          {item.year ? <span className="text-ink-3"> · {item.year}</span> : null}
        </p>
        {showDescription && item.description && (
          <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3 line-clamp-3">{item.description}</p>
        )}
        {showReason && item.reasons?.[0] && (
          <p className="mt-2 flex gap-1.5 text-ink-2">
            <Feather size={13} className="mt-[3px] shrink-0 text-accent" />
            <span className="font-hand line-clamp-3 text-[16.5px] leading-[1.12]">{item.reasons[0]}</span>
          </p>
        )}
        <ShareBookButton book={item} variant="tile" />
      </div>
    </motion.article>
  )
}

export function RecCardSkeleton({ width = 'w-[164px] sm:w-[184px]' }) {
  return (
    <div className={width}>
      <div className="shimmer aspect-[2/3] rounded-[3px_6px_6px_3px]" />
      <div className="shimmer mt-3 h-4 w-4/5 rounded" />
      <div className="shimmer mt-2 h-3 w-1/2 rounded" />
      <div className="shimmer mt-3 h-3 w-full rounded" />
    </div>
  )
}
