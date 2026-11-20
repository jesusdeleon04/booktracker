import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { useStudio } from '../../store/useStudio'
import { useStore } from '../../store/useStore'
import { CATEGORY_COLORS } from '../../lib/studio'

function ColorDots({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="h-5 w-5 rounded-full transition hover:scale-110"
          style={{ background: c, boxShadow: value === c ? '0 0 0 2px var(--surface), 0 0 0 3.5px var(--text)' : 'none' }}
          aria-label={`Color ${c}`}
        />
      ))}
    </div>
  )
}

function Row({ cat, categories }) {
  const updateCategory = useStudio((s) => s.updateCategory)
  const deleteCategory = useStudio((s) => s.deleteCategory)
  const toast = useStore((s) => s.toast)
  const [name, setName] = useState(cat.name)
  const [colors, setColors] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const others = categories.filter((c) => c.id !== cat.id)
  const [moveTo, setMoveTo] = useState(others.find((c) => c.name.toLowerCase() === 'otros')?.id || others[0]?.id)

  const saveName = async () => {
    const n = name.trim()
    if (!n || n === cat.name) return setName(cat.name)
    const ok = await updateCategory(cat.id, { name: n })
    if (!ok) setName(cat.name)
  }

  const remove = async () => {
    const res = await deleteCategory(cat.id, moveTo)
    if (res) {
      const target = categories.find((c) => c.id === res.movedTo)
      toast(res.moved ? `Categoría eliminada. ${res.moved} escrito(s) pasaron a «${target?.name}».` : 'Categoría eliminada.', { tone: 'success' })
    }
  }

  return (
    <li className="rounded-2xl border border-line px-3 py-2.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setColors(!colors)}
          className="h-6 w-6 shrink-0 rounded-full ring-1 ring-line-strong transition hover:scale-110"
          style={{ background: cat.color }}
          aria-label="Cambiar color"
        />
        <input
          className="min-w-0 flex-1 bg-transparent py-1 font-medium outline-none focus:border-b focus:border-accent"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-label="Nombre de la categoría"
        />
        <span className="font-mono text-xs text-ink-3">{cat.count || 0}</span>
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm text-ink-3"
          onClick={() => setDeleting(!deleting)}
          disabled={categories.length <= 1}
          aria-label={`Eliminar ${cat.name}`}
          title={categories.length <= 1 ? 'Necesitas al menos una categoría' : 'Eliminar categoría'}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {colors && (
        <div className="mt-2.5 pl-9">
          <ColorDots
            value={cat.color}
            onChange={(c) => {
              updateCategory(cat.id, { color: c })
              setColors(false)
            }}
          />
        </div>
      )}
      {deleting && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-3 text-sm">
          {cat.count > 0 ? (
            <>
              <span>Mover sus {cat.count} escrito(s) a</span>
              <select className="field h-9 w-auto py-1" value={moveTo} onChange={(e) => setMoveTo(Number(e.target.value))}>
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <span>¿Eliminar «{cat.name}»? No tiene escritos.</span>
          )}
          <button className="btn btn-sm ml-auto border-transparent bg-[var(--ember)] text-white hover:bg-[var(--ember)]" onClick={remove}>
            Eliminar
          </button>
          <button className="btn btn-sm" onClick={() => setDeleting(false)}>
            Cancelar
          </button>
        </div>
      )}
    </li>
  )
}

/** Create, rename, recolour and delete studio categories. */
export default function CategoryManager({ open, onClose }) {
  const categories = useStudio((s) => s.categories)
  const createCategory = useStudio((s) => s.createCategory)
  const [name, setName] = useState('')
  const [color, setColor] = useState(CATEGORY_COLORS[3])

  const add = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    const cat = await createCategory(name.trim(), color)
    if (cat) setName('')
  }

  return (
    <Dialog open={open} onClose={onClose} title="Categorías" width="max-w-lg">
      <p className="mb-4 text-sm text-ink-2">Cada escrito pertenece a una categoría principal. Si eliminas una, eliges adónde se mudan sus escritos.</p>
      <ul className="space-y-2">
        {categories.map((c) => (
          <Row key={c.id} cat={c} categories={categories} />
        ))}
      </ul>
      <form onSubmit={add} className="mt-5 rounded-2xl border border-dashed border-line-strong p-3">
        <p className="kicker mb-2">Nueva categoría</p>
        <div className="flex gap-2">
          <input className="field" placeholder="Microrrelatos, Canciones, Viajes…" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <button className="btn btn-primary shrink-0" disabled={!name.trim()}>
            <Plus size={15} /> Crear
          </button>
        </div>
        <div className="mt-3">
          <ColorDots value={color} onChange={setColor} />
        </div>
      </form>
    </Dialog>
  )
}
