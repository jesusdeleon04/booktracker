import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import Cover from './Cover'
import { useStore } from '../../store/useStore'
import { fold } from '../../lib/match'
import { authorsLine } from '../../lib/format'

export const LIST_COLORS = ['#E2603A', '#D3AE66', '#98B08E', '#7B8FB8', '#B07A9E', '#C2566B', '#5E8C7A', '#A0763E']
const EMOJIS = ['♥', '↺', '✦', '☾', '❧', '✎', '☀', '✧', '⚑', '∞']

/** Create or edit a custom list. */
export function ListFormDialog({ open, onClose, list, initialBookIds = [], onCreated }) {
  const createList = useStore((s) => s.createList)
  const updateList = useStore((s) => s.updateList)
  const [name, setName] = useState(list?.name || '')
  const [description, setDescription] = useState(list?.description || '')
  const [color, setColor] = useState(list?.color || LIST_COLORS[0])
  const [emoji, setEmoji] = useState(list?.emoji || '')

  const submit = async (e) => {
    e?.preventDefault()
    if (!name.trim()) return
    if (list) {
      await updateList(list.id, { name, description, color, emoji })
      onClose()
    } else {
      const created = await createList({ name, description, color, emoji, bookIds: initialBookIds })
      if (created) {
        onCreated?.(created)
        onClose()
        setName('')
        setDescription('')
      }
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={list ? 'Editar lista' : 'Nueva lista'}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!name.trim()}>
            {list ? 'Guardar' : 'Crear lista'}
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="kicker mb-1.5 block !text-[10px]">Nombre</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Libros que me cambiaron la vida" autoFocus />
        </label>
        <label className="block">
          <span className="kicker mb-1.5 block !text-[10px]">Descripción</span>
          <input className="field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" />
        </label>
        <div>
          <span className="kicker mb-2 block !text-[10px]">Color</span>
          <div className="flex flex-wrap gap-2">
            {LIST_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                className="grid h-8 w-8 place-items-center rounded-full transition hover:scale-110"
                style={{ background: c, boxShadow: color === c ? '0 0 0 2px var(--bg), 0 0 0 4px var(--text)' : 'none' }}
                aria-label={`Color ${c}`}
              >
                {color === c && <Check size={14} color="#111" />}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="kicker mb-2 block !text-[10px]">Símbolo</span>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" data-active={!emoji} className="chip" onClick={() => setEmoji('')}>
              Ninguno
            </button>
            {EMOJIS.map((e) => (
              <button type="button" key={e} data-active={emoji === e} className="chip w-9 justify-center !px-0" onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
        </div>
      </form>
    </Dialog>
  )
}

/** Toggle a book's membership in lists. */
export function AddToListDialog({ open, onClose, bookId }) {
  const lists = useStore((s) => s.lists)
  const toggleInList = useStore((s) => s.toggleInList)
  const [creating, setCreating] = useState(false)
  return (
    <>
      <Dialog open={open && !creating} onClose={onClose} title="Añadir a una lista" width="max-w-md">
        <div className="space-y-1.5">
          {lists.map((l) => {
            const on = l.bookIds.includes(bookId)
            return (
              <button
                key={l.id}
                onClick={() => toggleInList(l.id, bookId)}
                className="flex w-full items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left transition hover:bg-surface-2"
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg text-sm" style={{ background: l.color, color: '#140d08' }}>
                  {l.emoji || l.name[0]}
                </span>
                <span className="flex-1">
                  <span className="block font-medium">{l.name}</span>
                  <span className="text-xs text-ink-3">{l.bookIds.length} libros</span>
                </span>
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full border transition ${on ? 'border-transparent bg-accent text-accent-ink' : 'border-line-strong'}`}
                >
                  {on && <Check size={14} />}
                </span>
              </button>
            )
          })}
          <button onClick={() => setCreating(true)} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-line-strong px-4 py-3 text-left text-ink-2 transition hover:text-ink">
            <Plus size={16} /> Crear una lista nueva
          </button>
        </div>
      </Dialog>
      <ListFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        initialBookIds={bookId ? [bookId] : []}
      />
    </>
  )
}

/** Pick library books to add to a list. */
export function PickBooksDialog({ open, onClose, list }) {
  const books = useStore((s) => s.books)
  const toggleInList = useStore((s) => s.toggleInList)
  const [q, setQ] = useState('')
  const filtered = books.filter((b) => fold(`${b.title} ${b.authors.join(' ')}`).includes(fold(q)))
  return (
    <Dialog open={open} onClose={onClose} title={`Añadir a «${list?.name || ''}»`} width="max-w-xl">
      <input className="field mb-4" placeholder="Filtrar tu biblioteca…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {books.length === 0 && <p className="text-sm text-ink-2">Tu biblioteca está vacía todavía.</p>}
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
        {filtered.map((b) => {
          const on = list?.bookIds.includes(b.id)
          return (
            <button key={b.id} onClick={() => toggleInList(list.id, b.id)} className="group relative text-left">
              <Cover book={b} compact className={`transition ${on ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'opacity-80 group-hover:opacity-100'}`} />
              {on && (
                <span className="absolute top-1.5 right-1.5 z-10 grid h-6 w-6 place-items-center rounded-full bg-accent text-accent-ink">
                  <Check size={14} />
                </span>
              )}
              <p className="mt-1.5 text-xs leading-snug line-clamp-2">{b.title}</p>
              <p className="truncate text-[11px] text-ink-3">{authorsLine(b.authors, 1)}</p>
            </button>
          )
        })}
      </div>
    </Dialog>
  )
}
