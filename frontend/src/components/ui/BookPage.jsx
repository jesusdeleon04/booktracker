import { motion } from 'motion/react'

/** Ornamental rule with a fleuron, as in a printed chapter opening. */
export function Fleuron({ className = '' }) {
  return (
    <div className={`flex items-center gap-4 text-[var(--text-3)] ${className}`} aria-hidden="true">
      <span className="h-px flex-1 bg-[var(--line-strong)]" />
      <span className="font-display text-xl leading-none">❦</span>
      <span className="h-px flex-1 bg-[var(--line-strong)]" />
    </div>
  )
}

/**
 * A printed book page lying on the desk: cream paper, gutter shadow, small-caps
 * chapter title and a drop cap. Children render inside the page.
 */
export default function BookPage({ kicker, title, lead, children, footer, className = '' }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24, rotate: -0.4 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.8, ease: [0.2, 0.75, 0.2, 1] }}
      className={`paper-sheet overflow-hidden rounded-[4px_10px_10px_4px] px-7 py-10 md:px-16 md:py-14 ${className}`}
    >
      {/* gutter shadow + page edge */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-black/15 to-transparent" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-y-3 right-0 w-1 bg-[repeating-linear-gradient(180deg,rgba(0,0,0,0.08)_0_1px,transparent_1px_3px)]" aria-hidden="true" />
      <div className="relative">
        {kicker && <p className="kicker text-center">{kicker}</p>}
        <Fleuron className="mx-auto mt-4 max-w-md" />
        <h2 className="mt-5 text-center font-display text-[2.3rem] leading-[1] font-medium tracking-[0.04em] text-balance md:text-[3.8rem]" style={{ fontVariant: 'small-caps' }}>
          {title}
        </h2>
        {lead && (
          <p className="prose-book mx-auto mt-7 max-w-2xl !text-[19px] !leading-[1.6] !text-[var(--paper-ink)] first-letter:float-left first-letter:mt-1 first-letter:mr-2.5 first-letter:font-display first-letter:text-[4.2rem] first-letter:leading-[0.78] first-letter:font-semibold first-letter:text-[#8c4c11]">
            {lead}
          </p>
        )}
        {children}
        {footer && <p className="kicker mt-9 text-center">{footer}</p>}
      </div>
    </motion.section>
  )
}
