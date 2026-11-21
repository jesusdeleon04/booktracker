import { Send } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useSocial } from '../../store/useSocial'
import { tertulia as copy } from '../../lib/copy'

/**
 * "Compartir libro": the same action everywhere a book appears. It only exists
 * with accounts (the Tertulia) and always opens the one share dialog mounted in
 * the app shell, so every entry point sends through the same mechanism.
 *
 *  - variant "full": prominent, for a book's own page and detail sheet.
 *  - variant "tile": compact but labelled, under cards and rows.
 *  - variant "icon": for tight rows; keeps an accessible name.
 */
export default function ShareBookButton({ book, variant = 'full', className = '' }) {
  const social = useStore((s) => s.authRequired)
  const open = useSocial((s) => s.openShareBook)
  if (!social || !book) return null
  const label = copy.shareBook.label
  const aria = `${label}: ${book.title}`
  const click = (e) => {
    e.preventDefault()
    e.stopPropagation()
    open(book)
  }
  if (variant === 'icon')
    return (
      <button type="button" className={`btn btn-share btn-icon btn-sm ${className}`} onClick={click} aria-label={aria} title={label}>
        <Send size={14} />
      </button>
    )
  if (variant === 'tile')
    return (
      <button type="button" className={`btn-share-tile ${className}`} onClick={click} aria-label={aria}>
        <Send size={12} /> {label}
      </button>
    )
  return (
    <button type="button" className={`btn btn-share h-11 w-full justify-center ${className}`} onClick={click} aria-label={aria}>
      <Send size={16} /> {label}
    </button>
  )
}
