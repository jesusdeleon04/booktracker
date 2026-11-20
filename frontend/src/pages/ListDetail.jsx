import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import BookTile from '../components/book/BookTile'
import { EmptyState } from '../components/ui/Bits'
import { ConfirmDialog } from '../components/ui/Dialog'
import { ListFormDialog, PickBooksDialog } from '../components/book/ListDialogs'
import NotFound from './NotFound'

export default function ListDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const list = useStore((s) => s.lists.find((l) => l.id === Number(id)))
  const books = useStore((s) => s.books)
  const deleteList = useStore((s) => s.deleteList)
  const toggleInList = useStore((s) => s.toggleInList)
  const [editing, setEditing] = useState(false)
  const [picking, setPicking] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const items = useMemo(() => {
    if (!list) return []
    const byId = Object.fromEntries(books.map((b) => [b.id, b]))
    return list.bookIds.map((bid) => byId[bid]).filter(Boolean)
  }, [list, books])

  if (!list) return <NotFound />

  const pages = items.reduce((s, b) => s + (b.pageCount || 0), 0)
  const read = items.filter((b) => b.status === 'read').length

  return (
    <div>
      <Link to="/biblioteca?tab=lists" className="mb-8 inline-flex items-center gap-2 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Listas
      </Link>
      <header className="relative mb-10 overflow-hidden rounded-[30px] border border-line p-7 md:p-10" style={{ background: `radial-gradient(100% 120% at 0% 0%, ${list.color}40, transparent 60%), var(--surface)` }}>
        <p className="kicker mb-3 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: list.color }} /> Lista personal
        </p>
        <h1 className="font-display text-[2.4rem] leading-none font-light md:text-[3.6rem]">
          {list.emoji && <span className="mr-3 opacity-70">{list.emoji}</span>}
          {list.name}
        </h1>
        {list.description && <p className="mt-3 max-w-xl text-ink-2">{list.description}</p>}
        <p className="kicker mt-6">
          {items.length} libros · {read} leídos{pages ? ` · ${pages.toLocaleString('es-ES')} páginas` : ''}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button className="btn btn-ink" onClick={() => setPicking(true)}>
            <Plus size={16} /> Añadir libros
          </button>
          <button className="btn" onClick={() => setEditing(true)}>
            <Pencil size={15} /> Editar
          </button>
          <button className="btn btn-ghost text-ink-3" onClick={() => setConfirm(true)}>
            <Trash2 size={15} /> Eliminar lista
          </button>
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title="Una lista por estrenar"
          action={
            <button className="btn btn-primary" onClick={() => setPicking(true)}>
              <Plus size={16} /> Elegir libros de mi biblioteca
            </button>
          }
        >
          Añade libros desde aquí o desde la ficha de cualquier libro con «Añadir a lista».
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-x-5 gap-y-9 xs:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((b, i) => (
            <div key={b.id} className="group/item relative">
              <BookTile book={b} index={i} />
              <button
                onClick={() => toggleInList(list.id, b.id)}
                className="absolute top-2 left-2 z-20 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition group-hover/item:opacity-100 focus:opacity-100"
                aria-label={`Quitar ${b.title} de la lista`}
                title="Quitar de la lista"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && <ListFormDialog open={editing} onClose={() => setEditing(false)} list={list} />}
      <PickBooksDialog open={picking} onClose={() => setPicking(false)} list={list} />
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="¿Eliminar esta lista?"
        message={`Se eliminará «${list.name}». Los libros seguirán en tu biblioteca.`}
        confirmLabel="Eliminar lista"
        danger
        onConfirm={async () => {
          await deleteList(list.id)
          navigate('/biblioteca?tab=lists')
        }}
      />
    </div>
  )
}
