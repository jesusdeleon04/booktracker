import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Horizontal scroller with arrow controls on desktop and snap on touch. */
export default function Shelf({ children, className = '' }) {
  const ref = useRef(null)
  const scroll = (dir) => {
    const el = ref.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }
  return (
    <div className={`group/shelf relative ${className}`}>
      <div ref={ref} className="shelf-scroll">
        {children}
      </div>
      <button
        onClick={() => scroll(-1)}
        aria-label="Anterior"
        className="btn btn-icon absolute top-[38%] -left-3 z-10 hidden -translate-y-1/2 border-line-strong bg-surface/90 opacity-0 shadow-lg backdrop-blur transition group-hover/shelf:opacity-100 md:flex"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        onClick={() => scroll(1)}
        aria-label="Siguiente"
        className="btn btn-icon absolute top-[38%] -right-3 z-10 hidden -translate-y-1/2 border-line-strong bg-surface/90 opacity-0 shadow-lg backdrop-blur transition group-hover/shelf:opacity-100 md:flex"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
