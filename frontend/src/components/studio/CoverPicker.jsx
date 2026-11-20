import { useEffect, useRef, useState } from 'react'
import { Check, ImagePlus, Images, Trash2, Type, Upload } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Segmented, Spinner } from '../ui/Bits'
import { WritingCover } from './StudioBits'
import { prepareImage, studioApi } from '../../lib/studio'
import { useStudio } from '../../store/useStudio'
import { useStore } from '../../store/useStore'

/**
 * Choose a cover: upload from the device (on phones this opens the photo
 * library), reuse an image from the studio's own library, or go without one
 * (the typed manuscript page is shown instead).
 */
export default function CoverPicker({ open, onClose, writing, category, onSelect }) {
  const images = useStudio((s) => s.images)
  const loadImages = useStudio((s) => s.loadImages)
  const addImage = useStudio((s) => s.addImage)
  const deleteImage = useStudio((s) => s.deleteImage)
  const toast = useStore((s) => s.toast)
  const [tab, setTab] = useState('upload')
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [confirmImg, setConfirmImg] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open && images === null) loadImages()
    if (open) setTab(writing?.cover ? 'library' : 'upload')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const upload = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      const prepared = await prepareImage(file)
      const img = await studioApi.uploadImage(prepared.blob, prepared)
      addImage(img)
      await onSelect(img)
      toast('Portada actualizada.', { tone: 'success' })
      onClose()
    } catch (err) {
      toast(err.message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const choose = async (img) => {
    await onSelect(img)
    onClose()
  }

  const remove = async (img) => {
    const res = await deleteImage(img.id, confirmImg === img.id)
    if (res.inUse) {
      setConfirmImg(img.id)
      toast(`Es la portada de ${res.inUse} escrito(s). Pulsa de nuevo para borrarla igualmente.`, { tone: 'info' })
    } else if (res.ok) {
      setConfirmImg(null)
      if (writing?.cover?.id === img.id) await onSelect(null, { silent: true })
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Portada del escrito" width="max-w-3xl">
      <div className="grid gap-6 sm:grid-cols-[150px_1fr]">
        <div className="hidden sm:block">
          <p className="kicker mb-2">Ahora</p>
          {writing && <WritingCover writing={writing} category={category} />}
        </div>
        <div className="min-w-0">
          <Segmented
            layoutId="cover-tabs"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'upload', label: 'Subir imagen', icon: <Upload size={14} /> },
              { value: 'library', label: 'Tus imágenes', icon: <Images size={14} /> },
              { value: 'none', label: 'Sin imagen', icon: <Type size={14} /> },
            ]}
          />

          {tab === 'upload' && (
            <label
              onDragOver={(e) => {
                e.preventDefault()
                setDrag(true)
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDrag(false)
                upload(e.dataTransfer.files?.[0])
              }}
              className={`mt-5 flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-[22px] border-2 border-dashed p-8 text-center transition ${drag ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-ink-3'}`}
            >
              {busy ? <Spinner size={26} className="text-accent" /> : <ImagePlus size={30} className="text-ink-3" />}
              <span className="font-display text-xl">{busy ? 'Preparando la portada…' : 'Arrastra una imagen o elige una de tu dispositivo'}</span>
              <span className="max-w-sm text-sm text-ink-3">JPG, PNG, WebP o GIF. Las fotos grandes se reducen automáticamente para que tu estudio siga ligero. En el móvil puedes elegirla de tu galería.</span>
              <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
            </label>
          )}

          {tab === 'library' && (
            <div className="mt-5">
              {images === null ? (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="shimmer aspect-[3/4] rounded" />
                  ))}
                </div>
              ) : images.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-ink-2">
                  Aún no has subido imágenes. Las que subas quedarán aquí para reutilizarlas en otros escritos.
                </p>
              ) : (
                <div className="grid max-h-[50vh] grid-cols-3 gap-3 overflow-y-auto p-1 sm:grid-cols-4">
                  {images.map((img) => {
                    const current = writing?.cover?.id === img.id
                    return (
                      <div key={img.id} className="group relative">
                        <button
                          onClick={() => choose(img)}
                          className={`relative block aspect-[3/4] w-full overflow-hidden rounded-[4px] transition ${current ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'opacity-90 hover:opacity-100'}`}
                          aria-label="Usar esta imagen como portada"
                        >
                          <img src={img.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                          {current && (
                            <span className="absolute top-1.5 left-1.5 grid h-6 w-6 place-items-center rounded-full bg-accent text-accent-ink">
                              <Check size={14} />
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => remove(img)}
                          className={`absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full text-white backdrop-blur transition ${confirmImg === img.id ? 'bg-[var(--ember)] opacity-100' : 'bg-black/55 opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                          aria-label="Borrar imagen de la biblioteca"
                          title={confirmImg === img.id ? 'Pulsa otra vez para borrarla' : 'Borrar de tu biblioteca de imágenes'}
                        >
                          <Trash2 size={13} />
                        </button>
                        {img.usedBy > 0 && <p className="mt-1 text-center font-mono text-[10px] text-ink-3">en {img.usedBy} escrito(s)</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'none' && (
            <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div className="w-36 shrink-0">
                {writing && <WritingCover writing={{ ...writing, cover: null }} category={category} />}
              </div>
              <div>
                <p className="font-display text-xl">La primera página como portada</p>
                <p className="mt-1 text-sm text-ink-2">Sin imagen, tu escrito se muestra como una hoja mecanografiada: el título, la categoría y sus primeras líneas.</p>
                <button className="btn btn-ink mt-4" onClick={() => choose(null)} disabled={!writing?.cover}>
                  {writing?.cover ? 'Quitar la imagen' : 'Ya no tiene imagen'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}
