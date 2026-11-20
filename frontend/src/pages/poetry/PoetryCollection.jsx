import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { BookOpen, ExternalLink, Heart, ImagePlus, MessageSquareText, Plus, RefreshCw, Search, Settings2, Trash2, X } from 'lucide-react'
import { EmptyState, Spinner } from '../../components/ui/Bits'
import { ConfirmDialog, Dialog, Sheet } from '../../components/ui/Dialog'
import { AccountBar, NewPasswordDialog } from '../../components/poetry/AuthPanel'
import { CategoryDot, NotesPanel } from '../../components/poetry/CollectionControls'
import { RightsBadge } from '../../components/poetry/PoetryBits'
import { CATEGORY_COLORS, prepareCover } from '../../lib/poetryCloud'
import { RIGHTS_TONE, lifespan, poemPath } from '../../lib/poetry'
import { fold } from '../../lib/match'
import { usePoetry } from '../../store/usePoetry'
import { useStore } from '../../store/useStore'

const SORTS = {
  recent: { label: 'Guardados recientemente', fn: (a, b) => b.savedAt.localeCompare(a.savedAt) },
  title: { label: 'Título (A–Z)', fn: (a, b) => a.title.localeCompare(b.title, 'es') },
  author: { label: 'Autor (A–Z)', fn: (a, b) => (a.author?.name || '').localeCompare(b.author?.name || '', 'es') },
}

function rightsOf(item) {
  const tone = RIGHTS_TONE[item.rightsStatus] || RIGHTS_TONE.unknown
  return { status: item.rightsStatus, label: tone.short, explanation: item.rightsNote }
}

function Cover({ item, category }) {
  if (item.coverUrl)
    return (
      <div className="relative aspect-[3/4] overflow-hidden rounded-[4px] shadow-[var(--shadow-book)]">
        <img src={item.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-10 text-white">
          <p className="font-display text-lg leading-tight">{item.title}</p>
        </div>
      </div>
    )
  return (
    <div className="poem-sheet poem-paper-crema flex aspect-[3/4] flex-col px-4 pt-6 pb-4">
      <p className="poem-accent mb-2 font-mono text-[9.5px] tracking-[0.2em] uppercase">{category?.name || 'Poema'}</p>
      <p className="poem-title text-[1.3rem]">{item.title}</p>
      <p className="poem-meta mt-1 font-serif text-sm italic">{item.author?.name}</p>
      {item.firstLine ? (
        <p className="poem-meta mt-auto line-clamp-3 font-serif text-[13px] leading-snug">«{item.firstLine}…»</p>
      ) : (
        <p className="poem-meta mt-auto font-serif text-[12px] italic">Referencia guardada</p>
      )}
    </div>
  )
}

function CategoriesDialog({ open, onClose }) {
  const categories = usePoetry((s) => s.categories)
  const items = usePoetry((s) => s.items)
  const createCategory = usePoetry((s) => s.createCategory)
  const updateCategory = usePoetry((s) => s.updateCategory)
  const removeCategory = usePoetry((s) => s.removeCategory)
  const toast = useStore((s) => s.toast)
  const [name, setName] = useState('')
  const [toDelete, setToDelete] = useState(null)
  const run = async (fn) => {
    try {
      await fn()
    } catch (err) {
      toast(err.message, { tone: 'error' })
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Categorías" width="max-w-md">
      <ul className="space-y-2">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <input
              type="color"
              value={c.color}
              onChange={(e) => run(() => updateCategory(c, { color: e.target.value }))}
              className="h-8 w-8 shrink-0 cursor-pointer rounded-full border border-line bg-transparent"
              aria-label={`Color de ${c.name}`}
            />
            <input
              className="field h-9 flex-1"
              defaultValue={c.name}
              maxLength={60}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== c.name) run(() => updateCategory(c, { name: v }))
                else e.target.value = c.name
              }}
              aria-label="Nombre de la categoría"
            />
            <span className="w-6 text-center font-mono text-xs text-ink-3">{items.filter((i) => i.categoryId === c.id).length}</span>
            <button className="btn btn-icon btn-sm btn-ghost" onClick={() => setToDelete(c)} aria-label={`Borrar ${c.name}`}>
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          run(async () => {
            await createCategory(name, CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length])
            setName('')
          })
        }}
      >
        <input className="field h-10 flex-1" placeholder="Nueva categoría" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-ink h-10" disabled={!name.trim()}>
          <Plus size={15} /> Añadir
        </button>
      </form>
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => run(() => removeCategory(toDelete))}
        title="Borrar categoría"
        message={`Los poemas de «${toDelete?.name}» seguirán en tu colección, sin categoría.`}
        confirmLabel="Borrar"
        danger
      />
    </Dialog>
  )
}

function ItemSheet({ item, onClose }) {
  const categories = usePoetry((s) => s.categories)
  const update = usePoetry((s) => s.update)
  const remove = usePoetry((s) => s.remove)
  const setCover = usePoetry((s) => s.setCover)
  const clearCover = usePoetry((s) => s.clearCover)
  const toggleFavorite = usePoetry((s) => s.toggleFavorite)
  const toast = useStore((s) => s.toast)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const run = async (fn) => {
    try {
      await fn()
    } catch (err) {
      toast(err.message, { tone: 'error' })
    }
  }
  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    await run(async () => setCover(item, await prepareCover(file)))
    setBusy(false)
  }
  const category = categories.find((c) => c.id === item.categoryId)
  return (
    <div className="p-5 md:p-7">
      <div className="mb-5 flex gap-4 pr-10">
        <div className="w-28 shrink-0">
          <Cover item={item} category={category} />
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-2xl leading-tight">{item.title}</h2>
          {item.author && (
            <p className="mt-1 font-serif italic text-ink-2">
              {item.author.name} <span className="not-italic text-ink-3">· {lifespan(item.author)}</span>
            </p>
          )}
          <p className="mt-1 text-xs text-ink-3">
            {item.sourceName} · guardado el {new Date(item.savedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <RightsBadge rights={rightsOf(item)} className="mt-2" />
        </div>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        <Link to={poemPath(item.pid)} className="btn btn-primary btn-sm">
          <BookOpen size={14} /> Leer
        </Link>
        <button className="btn btn-sm" onClick={() => run(() => toggleFavorite(item))} aria-pressed={item.isFavorite}>
          <Heart size={14} className={item.isFavorite ? 'fill-current text-[#c0473a]' : ''} /> {item.isFavorite ? 'Favorito' : 'Marcar favorito'}
        </button>
        <a className="btn btn-sm btn-ghost" href={item.sourceUrl} target="_blank" rel="noreferrer">
          Fuente <ExternalLink size={12} />
        </a>
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-3">Categoría</span>
          <select className="field h-10" value={item.categoryId || ''} onChange={(e) => run(() => update(item, { categoryId: e.target.value || null }))}>
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="mb-1 block text-xs text-ink-3">Portada (opcional)</span>
          <div className="flex gap-2">
            <button className="btn btn-sm h-10 flex-1" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? <Spinner size={13} /> : <ImagePlus size={14} />} {item.coverUrl ? 'Cambiar' : 'Subir imagen'}
            </button>
            {item.coverUrl && (
              <button className="btn btn-sm btn-icon h-10 w-10" onClick={() => run(() => clearCover(item))} aria-label="Quitar portada">
                <X size={14} />
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onFile} />
        </div>
      </div>
      <p className="kicker mb-3">Notas personales</p>
      <NotesPanel item={item} />
      <div className="mt-8 border-t border-line pt-4">
        <button className="btn btn-sm btn-ghost text-ember" onClick={() => setConfirm(true)}>
          <Trash2 size={14} /> Quitar de la colección
        </button>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() =>
          run(async () => {
            await remove(item)
            onClose()
            toast('Poema quitado de tu colección.')
          })
        }
        title="Quitar de la colección"
        message={`Se borrarán «${item.title}», sus notas y su portada de tu colección. El poema seguirá disponible en la biblioteca.`}
        confirmLabel="Quitar"
        danger
      />
    </div>
  )
}

export default function PoetryCollection() {
  const init = usePoetry((s) => s.init)
  const status = usePoetry((s) => s.status)
  const error = usePoetry((s) => s.error)
  const items = usePoetry((s) => s.items)
  const categories = usePoetry((s) => s.categories)
  const load = usePoetry((s) => s.load)
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('recent')
  const [openId, setOpenId] = useState(null)
  const [manage, setManage] = useState(false)

  useEffect(() => init(), [init])

  const catById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])
  const visible = useMemo(() => {
    const fq = fold(q)
    return items
      .filter((i) => filter === 'all' || (filter === 'fav' ? i.isFavorite : filter === 'none' ? !i.categoryId : i.categoryId === filter))
      .filter((i) => !fq || fold(`${i.title} ${i.author?.name || ''} ${i.collection || ''} ${(i.notes || []).map((n) => n.body).join(' ')}`).includes(fq))
      .sort(SORTS[sort].fn)
  }, [items, filter, q, sort])
  const openItem = items.find((i) => i.id === openId)
  const favCount = items.filter((i) => i.isFavorite).length

  return (
    <div>
      <header className="mb-8 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="kicker kicker-dusk mb-3">Biblioteca de poesía</p>
          <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="font-display text-[2.6rem] leading-[0.98] font-light md:text-[4.2rem]">
            Mi colección de <em className="display-wonk">poesía</em>
          </motion.h1>
          <p className="mt-3 font-mono text-[13px] text-ink-2">
            {items.length} {items.length === 1 ? 'poema' : 'poemas'} · {favCount} favoritos · {items.reduce((n, i) => n + (i.notes?.length || 0), 0)} notas
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn h-11" onClick={() => setManage(true)}>
            <Settings2 size={16} /> Categorías
          </button>
          <Link to="/poesia" className="btn btn-primary h-11">
            <Plus size={16} /> Descubrir poemas
          </Link>
        </div>
      </header>

      <div className="mb-8">
        <AccountBar />
      </div>

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <button className="chip shrink-0" data-active={filter === 'all'} onClick={() => setFilter('all')}>
            Todos <span className="font-mono text-[11px] opacity-60">{items.length}</span>
          </button>
          <button className="chip shrink-0" data-active={filter === 'fav'} onClick={() => setFilter('fav')}>
            <Heart size={12} className="fill-current text-[#c0473a]" /> Favoritos <span className="font-mono text-[11px] opacity-60">{favCount}</span>
          </button>
          {categories.map((c) => (
            <button key={c.id} className="chip shrink-0" data-active={filter === c.id} onClick={() => setFilter(filter === c.id ? 'all' : c.id)}>
              <CategoryDot color={c.color} /> {c.name}
              <span className="font-mono text-[11px] opacity-60">{items.filter((i) => i.categoryId === c.id).length}</span>
            </button>
          ))}
          {items.some((i) => !i.categoryId) && (
            <button className="chip shrink-0" data-active={filter === 'none'} onClick={() => setFilter('none')}>
              Sin categoría
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 lg:w-64 lg:flex-none">
            <Search size={15} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
            <input className="field h-10 rounded-full pl-10" placeholder="Título, autor, nota…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en mi colección" />
          </div>
          <select className="field h-10 w-auto rounded-full" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar">
            {Object.entries(SORTS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {status === 'loading' && !items.length ? (
        <div className="flex items-center gap-2 text-ink-2">
          <Spinner /> Cargando tu colección…
        </div>
      ) : status === 'error' ? (
        <div className="rounded-2xl border border-dashed border-line-strong p-8 text-center">
          <p className="text-ink-2">No se pudo cargar la colección: {error}</p>
          <button className="btn mt-4" onClick={() => load()}>
            <RefreshCw size={15} /> Reintentar
          </button>
        </div>
      ) : !items.length ? (
        <EmptyState
          title="Tu antología personal empieza aquí"
          action={
            <Link to="/poesia" className="btn btn-primary">
              Explorar la biblioteca
            </Link>
          }
        >
          Guarda poemas desde el lector: los ordenarás por categorías, marcarás favoritos y les añadirás notas.
        </EmptyState>
      ) : visible.length ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((it, i) => (
            <motion.button
              key={it.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.03 }}
              className="group text-left"
              onClick={() => setOpenId(it.id)}
            >
              <div className="transition group-hover:-translate-y-1">
                <Cover item={it} category={catById[it.categoryId]} />
              </div>
              <div className="mt-3 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[1.1rem] leading-tight">{it.title}</p>
                  <p className="truncate text-xs text-ink-3">{it.author?.name}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 pt-1 text-ink-3">
                  {it.notes?.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 font-mono text-[10px]">
                      <MessageSquareText size={12} /> {it.notes.length}
                    </span>
                  )}
                  {it.isFavorite && <Heart size={13} className="fill-current text-[#c0473a]" />}
                  {catById[it.categoryId] && <CategoryDot color={catById[it.categoryId].color} />}
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      ) : (
        <p className="text-ink-2">Nada coincide con este filtro.</p>
      )}

      <Sheet open={!!openItem} onClose={() => setOpenId(null)} label="Poema guardado">
        {openItem && <ItemSheet item={openItem} onClose={() => setOpenId(null)} />}
      </Sheet>
      <CategoriesDialog open={manage} onClose={() => setManage(false)} />
      <NewPasswordDialog />
    </div>
  )
}
