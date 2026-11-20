import { Link } from 'react-router'
import { motion } from 'motion/react'
import Cover from './Cover'
import Stars from '../ui/Stars'
import { STATUS, authorsLine } from '../../lib/format'

/** Library book in a grid: cover-first, quiet metadata underneath. */
export default function BookTile({ book, index = 0, showStatus = true, showRating = true }) {
  const progress =
    book.status === 'reading' && book.pageCount && book.currentPage ? Math.round((book.currentPage / book.pageCount) * 100) : null
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 14) * 0.035, duration: 0.5, ease: [0.2, 0.75, 0.2, 1] }}
    >
      <Link to={`/libro/${book.id}`} className="group block" aria-label={`${book.title} — ${authorsLine(book.authors)}`}>
        <div className="relative">
          <Cover book={book} lift />
          {showStatus && (
            <span
              className="absolute top-0 right-3 z-10 h-7 w-4 shadow-md"
              title={STATUS[book.status]?.label}
              style={{
                background: STATUS[book.status]?.color,
                clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%)',
              }}
            />
          )}
          {progress != null && (
            <div className="absolute inset-x-2 bottom-2 z-10 h-1 overflow-hidden rounded-full bg-black/40 backdrop-blur">
              <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
        <div className="mt-3 px-0.5">
          <h3 className="font-display text-[15px] leading-snug text-ink line-clamp-2 transition-colors group-hover:text-accent">
            {book.title}
          </h3>
          <p className="mt-0.5 truncate text-[13px] text-ink-2">{authorsLine(book.authors, 1)}</p>
          {showRating && book.rating != null && <Stars value={book.rating} size={12} className="mt-1.5" />}
        </div>
      </Link>
    </motion.div>
  )
}
