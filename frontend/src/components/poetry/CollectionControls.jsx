import { useState } from 'react'
import { Link } from 'react-router'
import { BookmarkPlus, Check, Heart, Pencil, Trash2 } from 'lucide-react'
import { Popover } from '../studio/StudioBits'
import { Spinner } from '../ui/Bits'
import { usePoetry } from '../../store/usePoetry'
import { useStore } from '../../store/useStore'

export function CategoryDot({ color, size = 8 }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color || 'var(--text-3)' }} />
}

/** Save / favourite / categorise a poem from the reader. */
export function SaveControl({ rec }) {
  const toast = useStore((s) => s.toast)
  const item = usePoetry((s) => s.items.find((i) => i.pid === rec.id))
  const categories = usePoetry((s) => s.categories)
  const mode = usePoetry((s) => s.mode)
  const save = usePoetry((s) => s.save)
  const update = usePoetry((s) => s.update)
  const toggleFavorite = usePoetry((s) => s.toggleFavorite)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const doSave = async (categoryId) => {
    setBusy(true)
    try {
      await save(rec, categoryId)
      setOpen(false)
      toast(mode === 'cloud' ? 'Guardado en tu colección.' : 'Guardado en este navegador. Inicia sesión para sincronizarlo.', { tone: 'success' })
    } catch (err) {
      toast(err.message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  const run = async (fn) => {
    try {
      await fn()
    } catch (err) {
      toast(err.message, { tone: 'error' })
    }
  }

  if (!item)
    return (
      <div className="relative">
        <button className="btn btn-primary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <BookmarkPlus size={16} /> Guardar
        </button>
        <Popover open={open} onClose={() => setOpen(false)} className="w-72 p-2">
          <p className="px-3 pt-2 pb-1 text-xs text-ink-3">¿En qué categoría?</p>
          {categories.map((c) => (
            <button key={c.id} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2" onClick={() => doSave(c.id)} disabled={busy}>
              <CategoryDot color={c.color} /> {c.name}
            </button>
          ))}
          <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-2 hover:bg-surface-2" onClick={() => doSave(null)} disabled={busy}>
            {busy ? <Spinner size={14} /> : <CategoryDot />} Sin categoría
          </button>
          {!rec.rights?.allowsFullText && <p className="px-3 pt-2 pb-1 text-[11px] text-ink-3">Es una obra protegida o sin verificar: guardaremos solo la referencia.</p>}
        </Popover>
      </div>
    )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className="btn btn-icon"
        onClick={() => run(() => toggleFavorite(item))}
        aria-pressed={item.isFavorite}
        aria-label={item.isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
        title={item.isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
      >
        <Heart size={17} className={item.isFavorite ? 'fill-current text-[#c0473a]' : ''} />
      </button>
      <label className="relative">
        <span className="sr-only">Categoría</span>
        <select className="field h-10 w-auto rounded-full pr-8 text-sm" value={item.categoryId || ''} onChange={(e) => run(() => update(item, { categoryId: e.target.value || null }))}>
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <Link to="/poesia/coleccion" className="btn btn-sm btn-ghost text-sage">
        <Check size={15} /> En tu colección
      </Link>
    </div>
  )
}

/** Personal notes on a saved poem. */
export function NotesPanel({ item }) {
  const toast = useStore((s) => s.toast)
  const addNote = usePoetry((s) => s.addNote)
  const updateNote = usePoetry((s) => s.updateNote)
  const removeNote = usePoetry((s) => s.removeNote)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    setBusy(true)
    try {
      if (editing) await updateNote(item, editing, body)
      else await addNote(item, body)
      setDraft('')
      setEditing(null)
    } catch (err) {
      toast(err.message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {(item.notes || []).length > 0 && (
        <ul className="mb-4 space-y-3">
          {item.notes.map((n) => (
            <li key={n.id} className="journal group relative !py-2 !text-[1.2rem]">
              <p className="whitespace-pre-wrap">{n.body}</p>
              <div className="flex items-center justify-between font-sans text-[11px] text-[#8f7a62]">
                <span>{new Date(n.updatedAt || n.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span className="flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    className="rounded p-1 hover:bg-[rgba(60,40,22,0.08)]"
                    aria-label="Editar nota"
                    onClick={() => {
                      setEditing(n)
                      setDraft(n.body)
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="rounded p-1 hover:bg-[rgba(60,40,22,0.08)]"
                    aria-label="Borrar nota"
                    onClick={() => removeNote(item, n).catch((err) => toast(err.message, { tone: 'error' }))}
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit}>
        <textarea className="journal w-full resize-y !text-[1.2rem]" rows={3} placeholder="Escribe una nota personal…" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={20000} aria-label="Nota personal" />
        <div className="mt-2 flex justify-end gap-2">
          {editing && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setEditing(null)
                setDraft('')
              }}
            >
              Cancelar
            </button>
          )}
          <button className="btn btn-sm btn-ink" disabled={busy || !draft.trim()}>
            {busy && <Spinner size={13} />} {editing ? 'Guardar cambios' : 'Añadir nota'}
          </button>
        </div>
      </form>
    </div>
  )
}
