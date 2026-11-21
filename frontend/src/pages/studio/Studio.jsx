import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { ArrowRight, Feather, Search, Settings2, TriangleAlert } from 'lucide-react'
import { useStudio } from '../../store/useStudio'
import { useStore } from '../../store/useStore'
import WritingCard from '../../components/studio/WritingCard'

const PublishDialog = lazy(() => import('../../components/social/PublishDialog'))
import CoverPicker from '../../components/studio/CoverPicker'
import CategoryManager from '../../components/studio/CategoryManager'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { displayTitle, drafts, relativeTime } from '../../lib/studio'
import { fold } from '../../lib/match'
import { studio as copy } from '../../lib/copy'

const SORTS = {
  updated: { label: 'Última modificación', fn: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') },
  created: { label: 'Más recientes', fn: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') },
  oldest: { label: 'Más antiguos', fn: (a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') },
  title: { label: 'Título (A–Z)', fn: (a, b) => displayTitle(a).localeCompare(displayTitle(b), 'es') },
  manual: { label: 'Orden personal', fn: (a, b) => (a.position ?? 0) - (b.position ?? 0) || (b.createdAt || '').localeCompare(a.createdAt || '') },
}

function readSort() {
  try {
    return localStorage.getItem('bt-studio-sort') || 'updated'
  } catch {
    return 'updated'
  }
}

function NewSheet() {
  return (
    <Link to="/estudio/escrito/nuevo" className="group block" aria-label="Nuevo escrito">
      <div className="manuscript book book-lift !aspect-[3/4] flex flex-col items-center justify-center gap-3 border border-dashed border-[rgba(60,40,22,0.25)]">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--typed)] text-[var(--sheet)] transition group-hover:scale-110">
          <Feather size={22} />
        </span>
        <span className="typed text-[13px] font-bold tracking-[0.14em] uppercase">Nuevo escrito</span>
        <span className="typed px-6 text-center text-[11px] opacity-60">Una hoja en blanco te espera en la máquina.</span>
      </div>
    </Link>
  )
}

export default function Studio() {
  const navigate = useNavigate()
  const status = useStudio((s) => s.status)
  const error = useStudio((s) => s.error)
  const writings = useStudio((s) => s.writings)
  const categories = useStudio((s) => s.categories)
  const resume = useStudio((s) => s.resume)
  const load = useStudio((s) => s.load)
  const patchWriting = useStudio((s) => s.patchWriting)
  const removeWriting = useStudio((s) => s.removeWriting)
  const reorder = useStudio((s) => s.reorder)
  const createCategory = useStudio((s) => s.createCategory)
  const toast = useStore((s) => s.toast)

  const [q, setQ] = useState('')
  const [cat, setCat] = useState(null)
  const [sort, setSortState] = useState(readSort)
  const [managerOpen, setManagerOpen] = useState(false)
  const [coverFor, setCoverFor] = useState(null)
  const [publishFor, setPublishFor] = useState(null)
  const social = useStore((s) => s.authRequired)
  const [toDelete, setToDelete] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const [newDraft] = useState(() => drafts.read('new'))

  useEffect(() => {
    load()
  }, [load])

  const setSort = (s) => {
    setSortState(s)
    try {
      localStorage.setItem('bt-studio-sort', s)
    } catch {
      /* ignore */
    }
  }

  const catById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])
  const sorted = useMemo(() => [...writings].sort(SORTS[sort].fn), [writings, sort])
  const visible = useMemo(() => {
    const fq = fold(q)
    return sorted.filter((w) => (!cat || w.categoryId === cat) && (!fq || fold(`${w.title} ${w.description}`).includes(fq)))
  }, [sorted, cat, q])
  const totalWords = writings.reduce((s, w) => s + (w.wordCount || 0), 0)
  const lastWritten = writings.reduce((m, w) => ((w.lastWrittenAt || '') > m ? w.lastWrittenAt : m), '')
  const manual = sort === 'manual' && !q && !cat
  const resumeWriting = resume && writings.find((w) => w.id === resume.id)
  const hasDraft = newDraft && (newDraft.content?.trim() || newDraft.title?.trim())

  const move = (id, dir) => {
    const ids = sorted.map((w) => w.id)
    const i = ids.indexOf(id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    reorder(ids)
  }

  const drop = (targetId) => {
    if (!dragId || dragId === targetId) return
    const ids = sorted.map((w) => w.id).filter((id) => id !== dragId)
    ids.splice(ids.indexOf(targetId), 0, dragId)
    reorder(ids)
  }

  const coverWriting = coverFor && writings.find((w) => w.id === coverFor)

  return (
    <div>
      <header className="relative mb-10 grid gap-8 md:mb-14 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-80 w-[46rem] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(244,176,88,0.16),transparent)]" aria-hidden="true" />
        <div>
          <p className="kicker mb-3">{copy.kicker}</p>
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.2, 0.75, 0.2, 1] }}
            className="font-display text-[2.6rem] leading-[0.98] font-light text-balance md:text-[4.2rem]"
          >
            {copy.title[0]} <em className="display-wonk">{copy.title[1]}</em>
          </motion.h1>
          <p className="mt-4 font-mono text-[13px] text-ink-2">
            {writings.length
              ? `${writings.length} ${writings.length === 1 ? 'escrito' : 'escritos'} · ${totalWords.toLocaleString('es-ES')} palabras${lastWritten ? ` · última escritura ${relativeTime(lastWritten)}` : ''}`
              : copy.subEmpty}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn h-12" onClick={() => setManagerOpen(true)}>
            <Settings2 size={16} /> Categorías
          </button>
          <button className="btn btn-primary h-12 px-6 text-base" onClick={() => navigate('/estudio/escrito/nuevo')}>
            <Feather size={18} /> Nuevo escrito
          </button>
        </div>
      </header>

      {hasDraft && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm">
          <TriangleAlert size={16} className="text-accent" />
          <span className="flex-1">Tienes un escrito nuevo que no llegó a guardarse en el servidor; sigue a salvo en este dispositivo.</span>
          <Link to="/estudio/escrito/nuevo" className="btn btn-sm btn-primary">
            Recuperarlo
          </Link>
        </div>
      )}

      {resumeWriting && !q && !cat && (
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-12 grid items-center gap-6 md:grid-cols-[1fr_auto]">
          <Link to={`/estudio/escrito/${resume.id}`} className="manuscript group relative block overflow-hidden rounded-[4px] px-6 py-6 shadow-[0_24px_50px_-28px_rgba(0,0,0,0.85)] md:px-10">
            <p className="typed mb-3 text-[11px] font-bold tracking-[0.16em] uppercase opacity-60">Continúa donde lo dejaste · {displayTitle(resumeWriting)}</p>
            <p className="typed relative max-h-[7.5em] overflow-hidden text-[15px] leading-[1.85] whitespace-pre-line">
              {resume.before.length >= 260 ? '…' : ''}
              {resume.before}
              <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse bg-[var(--ribbon)]" />
            </p>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-[var(--sheet)] to-transparent" />
          </Link>
          <button className="btn btn-ink h-12 px-6" onClick={() => navigate(`/estudio/escrito/${resume.id}`)}>
            Seguir escribiendo <ArrowRight size={16} />
          </button>
        </motion.section>
      )}

      {/* Toolbar */}
      <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <button className="chip shrink-0" data-active={cat === null} onClick={() => setCat(null)}>
            Todos <span className="font-mono text-[11px] opacity-60">{writings.length}</span>
          </button>
          {categories.map((c) => (
            <button key={c.id} className="chip shrink-0" data-active={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)}>
              <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
              {c.name}
              <span className="font-mono text-[11px] opacity-60">{c.count || 0}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 lg:w-64 lg:flex-none">
            <Search size={15} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
            <input className="field h-10 rounded-full pl-10" placeholder="Buscar por título…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="field h-10 w-auto rounded-full" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar escritos">
            {Object.entries(SORTS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {sort === 'manual' && (q || cat) && <p className="-mt-4 mb-6 text-xs text-ink-3">Quita la búsqueda y el filtro para reordenar arrastrando.</p>}
      {manual && writings.length > 1 && <p className="-mt-4 mb-6 text-xs text-ink-3">Arrastra las portadas para ordenar tu biblioteca a tu gusto.</p>}

      {status === 'error' && writings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong p-10 text-center">
          <p className="font-display text-2xl">No pudimos abrir tu estudio</p>
          <p className="mt-2 text-sm text-ink-2">{error}</p>
          <button className="btn btn-primary mt-5" onClick={() => load()}>
            Reintentar
          </button>
        </div>
      ) : status !== 'ready' && writings.length === 0 ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i}>
              <div className="shimmer aspect-[3/4] rounded" />
              <div className="shimmer mt-3 h-4 w-3/4 rounded" />
            </div>
          ))}
        </div>
      ) : writings.length === 0 ? (
        <div className="grid items-center gap-10 rounded-[28px] border border-dashed border-line-strong p-8 md:grid-cols-[220px_1fr] md:p-12">
          <div className="mx-auto w-44 md:w-full">
            <NewSheet />
          </div>
          <div>
            <h2 className="font-display text-3xl">{copy.empty.title}</h2>
            <p className="mt-3 max-w-lg text-ink-2">
              {copy.empty.body}
            </p>
            <button className="btn btn-primary mt-6 h-12 px-6" onClick={() => navigate('/estudio/escrito/nuevo')}>
              <Feather size={18} /> {copy.empty.cta}
            </button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong p-10 text-center">
          <p className="font-display text-2xl">Ningún escrito coincide</p>
          <p className="mt-2 text-sm text-ink-2">Prueba con otro título o quita el filtro de categoría.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {!q && !cat && <NewSheet />}
          {visible.map((w, i) => (
            <WritingCard
              key={w.id}
              writing={w}
              index={i}
              category={catById[w.categoryId]}
              categories={categories}
              manual={manual}
              dragging={dragId === w.id}
              dropTarget={manual && overId === w.id && dragId !== w.id}
              onChangeCategory={async (id) => {
                const res = await patchWriting(w.id, { categoryId: id })
                if (res) toast(`Movido a «${catById[id]?.name}».`, { tone: 'success' })
              }}
              onCreateCategory={(name) => createCategory(name)}
              onCover={() => setCoverFor(w.id)}
              onPublish={social ? () => setPublishFor(w.id) : undefined}
              onDelete={() => setToDelete(w)}
              onMove={(dir) => move(w.id, dir)}
              dragHandlers={
                manual
                  ? {
                      onDragStart: (e) => {
                        setDragId(w.id)
                        e.dataTransfer.effectAllowed = 'move'
                      },
                      onDragOver: (e) => {
                        e.preventDefault()
                        if (overId !== w.id) setOverId(w.id)
                      },
                      onDrop: (e) => {
                        e.preventDefault()
                        drop(w.id)
                        setDragId(null)
                        setOverId(null)
                      },
                      onDragEnd: () => {
                        setDragId(null)
                        setOverId(null)
                      },
                    }
                  : {}
              }
            />
          ))}
        </div>
      )}

      <CategoryManager open={managerOpen} onClose={() => setManagerOpen(false)} />
      {social && publishFor && (
        <Suspense fallback={null}>
          <PublishDialog open onClose={() => setPublishFor(null)} writingId={publishFor} />
        </Suspense>
      )}
      <CoverPicker
        open={!!coverWriting}
        onClose={() => setCoverFor(null)}
        writing={coverWriting}
        category={coverWriting && catById[coverWriting.categoryId]}
        onSelect={async (img) => {
          await patchWriting(coverWriting.id, { coverImageId: img ? img.id : null, cover: img || null })
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="¿Eliminar este escrito?"
        message={`«${toDelete ? displayTitle(toDelete) : ''}» se borrará de tu estudio. Podrás deshacerlo durante unos segundos.`}
        confirmLabel="Eliminar escrito"
        danger
        onConfirm={() => removeWriting(toDelete.id)}
      />
    </div>
  )
}
