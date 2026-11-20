import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Dialog } from '../ui/Dialog'
import StatusPicker from './StatusPicker'
import Cover from './Cover'
import { useStore } from '../../store/useStore'

const EMPTY = { title: '', authors: '', year: '', pageCount: '', publisher: '', isbn13: '', coverUrl: '', description: '', genres: [] }

function toForm(book) {
  if (!book) return EMPTY
  return {
    title: book.title || '',
    authors: (book.authors || []).join(', '),
    year: book.year || '',
    pageCount: book.pageCount || '',
    publisher: book.publisher || '',
    isbn13: book.isbn13 || book.isbn10 || '',
    coverUrl: book.coverUrl || '',
    description: book.description || '',
    genres: book.genres || [],
  }
}

function fromForm(f) {
  return {
    title: f.title.trim(),
    authors: f.authors
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean),
    year: f.year ? Number(f.year) : null,
    pageCount: f.pageCount ? Number(f.pageCount) : null,
    publisher: f.publisher.trim(),
    isbn13: f.isbn13.trim(),
    coverUrl: f.coverUrl.trim(),
    description: f.description.trim(),
    genres: f.genres,
  }
}

function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="kicker mb-1.5 block !text-[10px]">{label}</span>
      {children}
    </label>
  )
}

function BookFields({ form, setForm }) {
  const genres = useStore((s) => s.meta.genres)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  return (
    <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
      <div className="hidden sm:block">
        <Cover book={{ title: form.title || 'Sin título', authors: form.authors ? [form.authors] : [], coverUrl: form.coverUrl }} />
      </div>
      <div className="grid gap-3">
        <Field label="Título *">
          <input className="field" value={form.title} onChange={set('title')} required autoFocus />
        </Field>
        <Field label="Autores (separados por comas)">
          <input className="field" value={form.authors} onChange={set('authors')} />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Año">
            <input className="field" inputMode="numeric" value={form.year} onChange={set('year')} />
          </Field>
          <Field label="Páginas">
            <input className="field" inputMode="numeric" value={form.pageCount} onChange={set('pageCount')} />
          </Field>
          <Field label="ISBN" className="col-span-2 sm:col-span-1">
            <input className="field" value={form.isbn13} onChange={set('isbn13')} />
          </Field>
        </div>
        <Field label="Editorial">
          <input className="field" value={form.publisher} onChange={set('publisher')} />
        </Field>
        <Field label="URL de la portada">
          <input className="field" value={form.coverUrl} onChange={set('coverUrl')} placeholder="https://…" />
        </Field>
      </div>
      <Field label="Géneros" className="sm:col-span-2">
        <div className="flex flex-wrap gap-1.5">
          {genres.map((g) => {
            const on = form.genres.includes(g.key)
            return (
              <button
                type="button"
                key={g.key}
                data-active={on}
                className="chip"
                onClick={() => setForm({ ...form, genres: on ? form.genres.filter((x) => x !== g.key) : [...form.genres, g.key].slice(0, 4) })}
              >
                {g.label}
              </button>
            )
          })}
        </div>
      </Field>
      <Field label="Descripción" className="sm:col-span-2">
        <textarea className="field" value={form.description} onChange={set('description')} rows={5} />
      </Field>
    </div>
  )
}

/** Manual entry for books that aren't in any catalog. */
export function ManualAddDialog() {
  const open = useStore((s) => s.manualOpen)
  const setOpen = useStore((s) => s.setManualOpen)
  const addBook = useStore((s) => s.addBook)
  const toast = useStore((s) => s.toast)
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [status, setStatus] = useState('want')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e?.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    const res = await addBook(fromForm(form), { status })
    setSaving(false)
    if (res.book && !res.duplicate) {
      toast(`«${res.book.title}» añadido a tu biblioteca.`, { tone: 'success' })
      setOpen(false)
      setForm(EMPTY)
      navigate(`/libro/${res.book.id}`)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Añadir un libro a mano"
      width="max-w-2xl"
      footer={
        <>
          <button className="btn" onClick={() => setOpen(false)}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!form.title.trim() || saving}>
            {saving ? 'Guardando…' : 'Añadir'}
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <StatusPicker value={status} onChange={setStatus} layoutId="manual-status" size="sm" />
        <BookFields form={form} setForm={setForm} />
      </form>
    </Dialog>
  )
}

/** Edit bibliographic data of a library book. */
export function EditBookDialog({ book, open, onClose }) {
  const updateBook = useStore((s) => s.updateBook)
  const toast = useStore((s) => s.toast)
  const [form, setForm] = useState(() => toForm(book))
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e?.preventDefault()
    setSaving(true)
    try {
      await updateBook(book.id, fromForm(form))
      toast('Ficha actualizada.', { tone: 'success' })
      onClose()
    } catch {
      /* toast already shown */
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Editar ficha"
      width="max-w-2xl"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!form.title.trim() || saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <BookFields form={form} setForm={setForm} />
      </form>
    </Dialog>
  )
}
