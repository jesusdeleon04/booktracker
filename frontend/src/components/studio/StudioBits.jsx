import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Plus } from 'lucide-react'
import { displayTitle } from '../../lib/studio'

/** Category as a crooked rubber stamp in the category's ink colour. */
export function CategoryStamp({ category, className = '', style }) {
  if (!category) return null
  return (
    <span className={`stamp ${className}`} style={{ color: category.color, ...style }}>
      {category.name}
    </span>
  )
}

/**
 * Cover for writings without an image: the first typed page of the
 * manuscript itself — title, category stamp, the opening lines fading out.
 */
export function ManuscriptCover({ writing, category }) {
  const excerpt = (writing.excerpt ?? writing.content ?? '').trim()
  return (
    <div className="manuscript absolute inset-0 flex flex-col px-[11%] pt-[13%] pb-[7%]">
      <CategoryStamp category={category} className="absolute top-[5%] right-[6%] !text-[4.2cqw]" />
      <p className="typed mt-[6%] text-center text-[6.4cqw] leading-[1.25] font-bold tracking-[0.1em] uppercase line-clamp-3">
        {writing.title?.trim() || 'Sin título'}
      </p>
      <div className="typed mx-auto mt-[4%] h-px w-1/4 bg-current opacity-30" />
      <div className="relative mt-[8%] flex-1 overflow-hidden">
        {excerpt ? (
          <p className="typed text-[4.4cqw] leading-[1.75] whitespace-pre-line opacity-85">{excerpt}</p>
        ) : (
          <p className="typed text-center text-[4.4cqw] italic opacity-40">(hoja en blanco)</p>
        )}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[var(--sheet)] via-[var(--sheet)]/70 to-transparent" />
      </div>
      <p className="typed text-center text-[3.8cqw] opacity-45">— 1 —</p>
    </div>
  )
}

/** Editorial cover: user image with a typed catalogue label, or the manuscript page. */
export function WritingCover({ writing, category, className = '', lift = false }) {
  const [broken, setBroken] = useState(false)
  const hasImage = writing.cover?.url && !broken
  return (
    <div className={`@container book ${lift ? 'book-lift' : ''} !aspect-[3/4] ${className}`}>
      {hasImage ? (
        <>
          <img
            src={writing.cover.url}
            alt={`Portada de ${displayTitle(writing)}`}
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
          <div className="manuscript absolute inset-x-[8%] bottom-[7%] z-[3] rounded-[2px] px-[6%] py-[5%] shadow-[0_6px_14px_-6px_rgba(0,0,0,0.6)]">
            <p className="typed text-[6.2cqw] leading-[1.2] font-bold tracking-[0.08em] uppercase line-clamp-2">
              {writing.title?.trim() || 'Sin título'}
            </p>
            {category && (
              <p className="typed mt-[3%] flex items-center gap-[3%] text-[4.3cqw] opacity-70">
                <span className="inline-block h-[1.2cqw] w-[1.2cqw] min-w-[5px] min-h-[5px] rounded-full" style={{ background: category.color }} />
                {category.name}
              </p>
            )}
          </div>
        </>
      ) : (
        <ManuscriptCover writing={writing} category={category} />
      )}
    </div>
  )
}

/** Lightweight popover: closes on outside click and Escape. */
export function Popover({ open, onClose, children, className = '', align = 'left' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && onClose()
    const onKey = (e) => e.key === 'Escape' && onClose()
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.16 }}
          className={`absolute top-full z-50 mt-2 min-w-56 rounded-2xl border border-line-strong bg-surface p-1 text-ink shadow-[var(--shadow-pop)] ${align === 'right' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'} ${className}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Category list with inline "new category". */
export function CategoryList({ categories, value, onChange, onCreate }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    const cat = await onCreate?.(n)
    if (cat) {
      setName('')
      setAdding(false)
      onChange(cat.id)
    }
  }
  return (
    <div className="max-h-80 overflow-y-auto">
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-surface-2"
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
          <span className="flex-1">{c.name}</span>
          {value === c.id && <Check size={15} className="text-accent" />}
        </button>
      ))}
      {onCreate &&
        (adding ? (
          <form onSubmit={submit} className="flex gap-1.5 p-1.5">
            <input autoFocus className="field h-9 py-1 text-sm" placeholder="Nombre de la categoría" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <button className="btn btn-primary btn-sm h-9" disabled={!name.trim()}>
              Crear
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-ink-2 transition hover:bg-surface-2 hover:text-ink">
            <Plus size={14} /> Nueva categoría
          </button>
        ))}
    </div>
  )
}
