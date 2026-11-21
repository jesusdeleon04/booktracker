import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Feather, Send } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Spinner } from '../ui/Bits'
import { CategoryStamp } from '../studio/StudioBits'
import { AUDIENCES, newKey, publicationsApi, when } from '../../lib/social'
import { studioApi } from '../../lib/studio'
import { useStore } from '../../store/useStore'
import { useStudio } from '../../store/useStudio'
import { publish as copy } from '../../lib/copy'

/**
 * "Publicar en Tertulia" from the studio. Two moments:
 *  - the writing was never published: preview, title, optional introduction and an
 *    audience the author must choose before anything is sent;
 *  - it already has a publication: audience, update (explicit) and withdraw.
 * The writing is read from the server so what is previewed is what gets published;
 * the editor flushes its pending save first.
 */
export default function PublishDialog({ open, onClose, writingId, flush, onChanged }) {
  const toast = useStore((s) => s.toast)
  const categories = useStudio((s) => s.categories)
  const [state, setState] = useState({ status: 'loading' })
  const [title, setTitle] = useState('')
  const [intro, setIntro] = useState('')
  const [audience, setAudience] = useState(null)
  const [busy, setBusy] = useState(null)
  const [done, setDone] = useState(null)
  const key = useRef(newKey())

  const load = async () => {
    setState({ status: 'loading' })
    try {
      await flush?.()
      const [writing, { publication }] = await Promise.all([studioApi.get(writingId), publicationsApi.byWriting(writingId)])
      setTitle(writing.title || '')
      setAudience(publication ? publication.audience : null)
      setState({ status: 'ready', writing, publication })
    } catch (err) {
      setState({ status: 'error', error: err.message })
    }
  }
  useEffect(() => {
    if (!open) return
    key.current = newKey()
    setDone(null)
    setIntro('')
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, writingId])

  const run = async (name, fn, okMessage) => {
    setBusy(name)
    try {
      const res = await fn()
      if (okMessage) toast(okMessage, { tone: 'success' })
      onChanged?.()
      return res
    } catch (err) {
      toast(err.message, { tone: 'error' })
      return null
    } finally {
      setBusy(null)
    }
  }

  const { writing, publication } = state
  const category = writing && categories.find((c) => c.id === writing.categoryId)
  const empty = writing && !(writing.content || '').trim()

  const publishNow = async () => {
    const res = await run('publish', () => publicationsApi.publish({ writingId, audience, title, intro, clientKey: key.current }))
    if (res) setDone(res)
  }

  let body = null
  let footer = null
  if (state.status === 'loading')
    body = (
      <div className="flex items-center gap-2 py-10 text-ink-2">
        <Spinner /> Preparando la vista previa…
      </div>
    )
  else if (state.status === 'error') body = <p className="py-6 text-ember">{state.error}</p>
  else if (done) {
    body = (
      <div className="py-4 text-center" role="status">
        <Feather className="mx-auto mb-3 text-accent" size={26} />
        <p className="font-display text-2xl">{copy.done}</p>
        <p className="mt-2 text-sm text-ink-2">{done.audience === 'friends' ? copy.doneFriends : copy.donePrivate}</p>
      </div>
    )
    footer = (
      <>
        <button className="btn" onClick={onClose}>
          Seguir escribiendo
        </button>
        <Link to={`/tertulia/escritos/${done.id}`} className="btn btn-primary">
          {copy.view}
        </Link>
      </>
    )
  } else if (publication) {
    const changed = audience !== publication.audience
    body = (
      <div>
        <div className="mb-4 flex items-center gap-2 text-sm text-ink-2">
          <span className={`h-2 w-2 rounded-full ${publication.audience === 'friends' ? 'bg-sage' : 'bg-ink-3'}`} />
          {AUDIENCES[publication.audience].label} · publicado {when(publication.publishedAt)}
          {publication.updatedAt ? ` · actualizado ${when(publication.updatedAt)}` : ''}
        </div>
        <p className="kicker mb-2">{copy.audience}</p>
        <AudienceChoice value={audience} onChange={setAudience} />
        {changed && (
          <button className="btn btn-sm mt-3" disabled={!!busy} onClick={async () => { await run('audience', () => publicationsApi.update(publication.id, { audience }), 'Audiencia cambiada.'); load() }}>
            {busy === 'audience' && <Spinner size={13} />} {copy.saveAudience}
          </button>
        )}
        <div className="mt-5 rounded-2xl border border-line bg-surface-2/50 p-4 text-sm">
          {publication.pendingChanges ? (
            <>
              <p className="text-ink-2">{copy.pending}</p>
              <button className="btn btn-primary btn-sm mt-3" disabled={!!busy} onClick={async () => { await run('refresh', () => publicationsApi.refresh(publication.id), copy.updated); load() }}>
                {busy === 'refresh' && <Spinner size={13} />} {copy.update}
              </button>
            </>
          ) : (
            <p className="text-ink-3">{copy.upToDate}</p>
          )}
        </div>
      </div>
    )
    footer = (
      <>
        {publication.audience === 'friends' && (
          <button className="btn mr-auto" disabled={!!busy} onClick={async () => { await run('withdraw', () => publicationsApi.update(publication.id, { audience: 'private' }), copy.withdrawn); load() }}>
            {busy === 'withdraw' && <Spinner size={13} />} {copy.withdraw}
          </button>
        )}
        <button className="btn" onClick={onClose}>
          Cerrar
        </button>
        <Link to={`/tertulia/escritos/${publication.id}`} className="btn btn-primary">
          {copy.view}
        </Link>
      </>
    )
  } else {
    body = (
      <div>
        {empty && <p className="mb-4 rounded-xl bg-accent-soft px-3 py-2 text-sm">{copy.empty}</p>}
        <p className="mb-4 text-sm text-ink-2">{copy.intro}</p>
        <div className="manuscript typewriter-sheet mb-5 max-h-64 overflow-y-auto rounded-[4px] px-6 pt-6 pb-8" aria-label="Vista previa">
          <div className="mb-3 flex items-start justify-between gap-3">
            <span className="typed text-[11.5px] opacity-70">Vista previa</span>
            {category && <CategoryStamp category={category} className="!text-[11px]" />}
          </div>
          <h3 className="typed mb-4 text-center text-[15px] font-bold tracking-[0.1em] uppercase">{title || 'Sin título'}</h3>
          {intro.trim() && <p className="typed mb-4 text-[13px] italic opacity-80">{intro.trim()}</p>}
          <div className="typed text-[14px] leading-[1.75] break-words whitespace-pre-wrap">{writing.content}</div>
        </div>
        <label className="block">
          <span className="kicker mb-1.5 block">{copy.titleLabel}</span>
          <input className="field" maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sin título" />
        </label>
        <label className="mt-4 block">
          <span className="kicker mb-1.5 block">{copy.introLabel}</span>
          <textarea className="field" rows={2} maxLength={600} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder={copy.introPlaceholder} />
        </label>
        <p className="kicker mt-5 mb-2">{copy.audience}</p>
        <AudienceChoice value={audience} onChange={setAudience} />
        <p className="mt-2 text-xs text-ink-3">{copy.audienceNote}</p>
      </div>
    )
    footer = (
      <>
        <button className="btn" onClick={onClose} disabled={!!busy}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={publishNow} disabled={!!busy || !audience || empty}>
          {busy === 'publish' ? <Spinner size={15} /> : <Send size={15} />} {audience ? copy.confirmFor(AUDIENCES[audience].label) : copy.confirm}
        </button>
      </>
    )
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} title={publication && !done ? copy.manage : copy.title} width="max-w-xl" footer={footer}>
      {body}
    </Dialog>
  )
}

function AudienceChoice({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Audiencia" className="grid gap-2 sm:grid-cols-2">
      {Object.entries(AUDIENCES).map(([k, a]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          onClick={() => onChange(k)}
          className={`rounded-2xl border px-4 py-3 text-left transition ${value === k ? 'border-accent/70 bg-accent-soft' : 'border-line hover:border-line-strong'}`}
        >
          <span className="block font-medium">{a.label}</span>
          <span className="block text-xs text-ink-3">{a.hint}</span>
        </button>
      ))}
    </div>
  )
}
