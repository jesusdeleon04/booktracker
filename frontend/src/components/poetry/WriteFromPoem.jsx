import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Feather, NotebookPen, Sparkles } from 'lucide-react'
import { Popover } from '../studio/StudioBits'
import { Spinner } from '../ui/Bits'
import { newClientKey, studioApi } from '../../lib/studio'
import { useStore } from '../../store/useStore'

/** Reference stored with the writing: ids and link only, never the text. */
function inspirationOf(rec, kind) {
  return {
    poemId: rec.id,
    title: rec.title,
    author: rec.author?.name || '',
    source: rec.source?.name || '',
    url: rec.source?.pageUrl || '',
    rights: rec.rights?.label || '',
    kind,
  }
}

/**
 * Opens a new writing in the Writer's Studio linked to a poem. The poem itself
 * is copied as a quotation only when it is free (public domain / open licence);
 * otherwise the writing carries just the reference.
 */
export async function createWritingFromPoem(rec, kind) {
  const ov = await studioApi.overview().catch(() => null)
  const wanted = kind === 'reflection' ? 'Reflexiones' : 'Poesía'
  const category = ov?.categories?.find((c) => c.name === wanted)
  const free = Boolean(rec.lines && rec.rights?.allowsFullText)
  const ref = `«${rec.title}»${rec.author ? `, de ${rec.author.name}` : ''} — ${rec.source?.name} · ${rec.rights?.label}`
  const quote = free ? `${rec.lines.map((l) => (l.trim() ? `    ${l}` : '')).join('\n')}\n\n    — ${rec.attribution}\n\n` : ''
  const data = {
    title: kind === 'reflection' ? `Reflexión sobre «${rec.title}»` : `Inspirado en «${rec.title}»`,
    description: `${kind === 'reflection' ? 'Reflexión sobre' : 'Inspirado en'} ${ref}. ${rec.source?.pageUrl || ''}`.slice(0, 600),
    content: kind === 'reflection' ? quote : '',
    categoryId: category?.id,
    clientKey: newClientKey(),
    inspiration: inspirationOf(rec, kind),
  }
  return studioApi.create(data)
}

export default function WriteFromPoem({ rec, className = '' }) {
  const navigate = useNavigate()
  const toast = useStore((s) => s.toast)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const free = Boolean(rec.lines && rec.rights?.allowsFullText)

  const go = async (kind) => {
    setBusy(kind)
    try {
      const w = await createWritingFromPoem(rec, kind)
      navigate(`/estudio/escrito/${w.id}`)
    } catch (err) {
      toast(`No se pudo crear el escrito: ${err.message}`, { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Feather size={16} /> Escribir
      </button>
      <Popover open={open} onClose={() => setOpen(false)} align="right" className="w-80 p-2">
        <button className="flex w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-surface-2" onClick={() => go('reflection')} disabled={!!busy}>
          {busy === 'reflection' ? <Spinner size={16} /> : <NotebookPen size={17} className="mt-0.5 text-dusk" />}
          <span>
            <span className="block font-medium">Escribir una reflexión</span>
            <span className="block text-xs text-ink-3">
              {free ? 'Nueva hoja en el estudio con el poema citado y su atribución.' : 'Nueva hoja con la referencia del poema (está protegido: no copiamos el texto).'}
            </span>
          </span>
        </button>
        <button className="flex w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-surface-2" onClick={() => go('inspired')} disabled={!!busy}>
          {busy === 'inspired' ? <Spinner size={16} /> : <Sparkles size={17} className="mt-0.5 text-accent" />}
          <span>
            <span className="block font-medium">Crear un escrito inspirado</span>
            <span className="block text-xs text-ink-3">Hoja en blanco en «Poesía» que recuerda qué poema te inspiró.</span>
          </span>
        </button>
      </Popover>
    </div>
  )
}
