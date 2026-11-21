import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Ellipsis, FolderInput, GripVertical, Image, Megaphone, PenLine, Trash2 } from 'lucide-react'
import { CategoryList, Popover, WritingCover } from './StudioBits'
import { displayTitle, relativeTime, shortDate } from '../../lib/studio'

/** One writing in the studio library: cover, title, category, dates. */
export default function WritingCard({
  writing,
  category,
  categories,
  index = 0,
  manual = false,
  dragging = false,
  dropTarget = false,
  onChangeCategory,
  onCreateCategory,
  onCover,
  onPublish,
  onDelete,
  onMove,
  dragHandlers = {},
}) {
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  const [catMenu, setCatMenu] = useState(false)
  const href = `/estudio/escrito/${writing.id}`
  const title = displayTitle(writing)

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: dragging ? 0.35 : 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.035, duration: 0.45, ease: [0.2, 0.75, 0.2, 1] }}
      className={`group relative rounded-[10px] ${dropTarget ? 'outline-2 outline-offset-8 outline-accent outline-dashed' : ''}`}
      draggable={manual}
      {...dragHandlers}
    >
      <Link to={href} className="block" aria-label={`Abrir ${title}`} draggable={false}>
        <WritingCover writing={writing} category={category} lift />
      </Link>
      {manual && (
        <span className="pointer-events-none absolute top-2 left-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur transition group-hover:opacity-100" title="Arrastra para reordenar">
          <GripVertical size={14} />
        </span>
      )}

      <div className="mt-3 px-0.5">
        <div className="flex items-start gap-2">
          <Link to={href} className="min-w-0 flex-1" draggable={false}>
            <h3 className={`font-display text-[16px] leading-snug line-clamp-2 transition-colors group-hover:text-accent ${writing.title?.trim() ? '' : 'italic text-ink-2'}`}>{title}</h3>
          </Link>
          <div className="relative -mt-1 -mr-1 shrink-0">
            <button className="btn btn-ghost btn-icon btn-sm text-ink-3" onClick={() => setMenu(!menu)} aria-label="Opciones del escrito" aria-expanded={menu}>
              <Ellipsis size={16} />
            </button>
            <Popover open={menu} onClose={() => { setMenu(false); setCatMenu(false) }} align="right" className="w-60">
              {catMenu ? (
                <CategoryList
                  categories={categories}
                  value={writing.categoryId}
                  onCreate={onCreateCategory}
                  onChange={(id) => {
                    onChangeCategory(id)
                    setMenu(false)
                    setCatMenu(false)
                  }}
                />
              ) : (
                <div className="py-1 text-sm">
                  <MenuItem icon={PenLine} onClick={() => navigate(href)}>
                    Seguir escribiendo
                  </MenuItem>
                  <MenuItem icon={FolderInput} onClick={() => setCatMenu(true)}>
                    Cambiar categoría
                  </MenuItem>
                  {onPublish && (
                    <MenuItem icon={Megaphone} onClick={() => { setMenu(false); onPublish() }}>
                      Publicar en Tertulia
                    </MenuItem>
                  )}
                  <MenuItem icon={Image} onClick={() => { setMenu(false); onCover() }}>
                    Cambiar portada
                  </MenuItem>
                  {manual && (
                    <>
                      <MenuItem icon={ArrowLeft} onClick={() => { setMenu(false); onMove(-1) }}>
                        Mover antes
                      </MenuItem>
                      <MenuItem icon={ArrowRight} onClick={() => { setMenu(false); onMove(1) }}>
                        Mover después
                      </MenuItem>
                    </>
                  )}
                  <div className="my-1 h-px bg-line" />
                  <MenuItem icon={Trash2} danger onClick={() => { setMenu(false); onDelete() }}>
                    Eliminar…
                  </MenuItem>
                </div>
              )}
            </Popover>
          </div>
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-2">
          {category && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: category.color }} />}
          <span className="truncate">{category?.name || 'Sin categoría'}</span>
          <span className="text-ink-3">· {writing.wordCount.toLocaleString('es-ES')} palabras</span>
        </p>
        {writing.description && <p className="mt-1.5 font-serif text-[14.5px] leading-snug text-ink-2 italic line-clamp-2">{writing.description}</p>}
        <p className="mt-2 font-mono text-[10.5px] tracking-[0.04em] text-ink-3 uppercase">
          Creado {shortDate(writing.createdAt)} · editado {relativeTime(writing.updatedAt)}
        </p>
      </div>
    </motion.article>
  )
}

function MenuItem({ icon: Icon, children, onClick, danger }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition hover:bg-surface-2 ${danger ? 'text-[var(--ember)]' : ''}`}>
      <Icon size={15} className={danger ? '' : 'text-ink-3'} />
      {children}
    </button>
  )
}
