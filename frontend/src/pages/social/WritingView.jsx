import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { motion } from 'motion/react'
import { ArrowLeft, PenLine, Send, Trash2 } from 'lucide-react'
import { Spinner } from '../../components/ui/Bits'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { Avatar } from '../../components/social/SocialBits'
import { CategoryStamp } from '../../components/studio/StudioBits'
import { AUDIENCES, lettersApi, longDate, publicationsApi, when } from '../../lib/social'
import { publish as publishCopy, writings as copy } from '../../lib/copy'
import { useStore } from '../../store/useStore'

/** Reading a published writing: the typed page as its author wrote it, nothing truncated. */
export default function WritingView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useStore((s) => s.toast)
  const [state, setState] = useState({ status: 'loading' })
  const [cover, setCover] = useState(null)
  const [busy, setBusy] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [reply, setReply] = useState('')
  const [replyTo, setReplyTo] = useState({})

  const load = useCallback(async () => {
    try {
      const pub = await publicationsApi.get(id)
      setState({ status: 'ready', pub })
      return pub
    } catch (err) {
      setState({ status: 'error', error: err.message })
      return null
    }
  }, [id])
  useEffect(() => {
    setState({ status: 'loading' })
    setCover(null)
    load()
  }, [load])

  // Covers need the session, so they are fetched and shown from memory (never a public URL).
  const coverUrl = state.pub?.cover?.url
  useEffect(() => {
    if (!coverUrl) return
    let url
    let alive = true
    lettersApi
      .coverUrl(coverUrl)
      .then((u) => {
        url = u
        if (alive) setCover(u)
      })
      .catch(() => {})
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [coverUrl])

  const act = async (name, fn, ok) => {
    setBusy(name)
    try {
      await fn()
      if (ok) toast(ok, { tone: 'success' })
      await load()
    } catch (err) {
      toast(err.message, { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  if (state.status === 'loading')
    return (
      <div className="flex items-center gap-2 py-16 text-ink-2">
        <Spinner /> Abriendo el escrito…
      </div>
    )
  if (state.status === 'error')
    return (
      <div className="py-16 text-center">
        <p className="font-display text-2xl">Este escrito no está aquí</p>
        <p className="mt-2 text-ink-2">No existe, su autor lo ha retirado o no está pensado para ti.</p>
        <Link to="/tertulia/escritos" className="btn mt-6">
          Volver a escritos
        </Link>
      </div>
    )

  const pub = state.pub
  const mine = pub.mine
  const sendReply = async (text, threadUserId) => {
    if (!text.trim()) return
    await act('reply', () => publicationsApi.comment(pub.id, text.trim(), threadUserId))
    if (threadUserId) setReplyTo((r) => ({ ...r, [threadUserId]: '' }))
    else setReply('')
  }

  return (
    <div className="mx-auto max-w-[52rem]">
      <Link to="/tertulia/escritos" className="mb-6 inline-flex items-center gap-2 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Escritos
      </Link>

      {mine && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface/60 px-4 py-3 text-sm">
          <span className={`h-2 w-2 rounded-full ${pub.audience === 'friends' ? 'bg-sage' : 'bg-ink-3'}`} />
          <span className="min-w-0 flex-1 text-ink-2">
            {AUDIENCES[pub.audience].label}
            {pub.withdrawn ? ' · retirado' : ''} · publicado {when(pub.publishedAt)}
            {pub.pendingChanges ? ` · ${publishCopy.pending}` : ''}
          </span>
          <div className="flex flex-wrap gap-2">
            {pub.pendingChanges && (
              <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act('refresh', () => publicationsApi.refresh(pub.id), publishCopy.updated)}>
                {busy === 'refresh' && <Spinner size={13} />} {publishCopy.update}
              </button>
            )}
            {pub.audience === 'friends' ? (
              <button className="btn btn-sm" disabled={!!busy} onClick={() => act('aud', () => publicationsApi.update(pub.id, { audience: 'private' }), publishCopy.withdrawn)}>
                {publishCopy.withdraw}
              </button>
            ) : (
              <button className="btn btn-sm" disabled={!!busy} onClick={() => act('aud', () => publicationsApi.update(pub.id, { audience: 'friends' }), 'Ahora lo leen tus amigos.')}>
                Abrir a mis amigos
              </button>
            )}
            {pub.sourceId && (
              <Link to={`/estudio/escrito/${pub.sourceId}`} className="btn btn-sm">
                <PenLine size={13} /> Abrir en el estudio
              </Link>
            )}
            <button className="btn btn-sm btn-ghost text-ink-3" onClick={() => setConfirm(true)} aria-label="Eliminar publicación">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}

      <motion.article initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }} aria-label={pub.title}>
        <div className="manuscript typewriter-sheet letter-marfil relative rounded-[4px] px-6 pt-12 pb-16 sm:px-14 md:px-20">
          <div className="mb-8 flex items-start justify-between gap-6">
            <div className="flex items-center gap-3">
              <Avatar person={pub.author} size={34} />
              <div className="typed text-[12.5px] leading-snug opacity-80">
                {pub.author?.username ? (
                  <Link to={`/tertulia/lector/${pub.author.username}`} className="underline-offset-4 hover:underline">
                    {pub.author.name}
                  </Link>
                ) : (
                  pub.author?.name
                )}
                <br />
                {longDate(pub.publishedAt)}
              </div>
            </div>
            {pub.category && <CategoryStamp category={pub.category} />}
          </div>
          {cover && (
            <figure className="mb-8">
              <img src={cover} alt="" className="mx-auto max-h-[28rem] w-auto rounded-[2px] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)]" />
            </figure>
          )}
          <h1 className="typed mb-6 text-center text-[clamp(18px,2.4vw,24px)] font-bold tracking-[0.12em] uppercase">{pub.title}</h1>
          {pub.intro && <p className="typed mb-8 text-center text-[15px] italic opacity-80">{pub.intro}</p>}
          <div className="typed text-[clamp(16px,1.9vw,19px)] leading-[1.85] break-words whitespace-pre-wrap">{pub.content}</div>
        </div>
        <p className="mt-5 text-center font-mono text-[11px] text-ink-3">
          {pub.wordCount} palabras
          {pub.updatedAt ? ` · actualizado ${when(pub.updatedAt)}` : ''} · para {AUDIENCES[pub.audience].label.toLowerCase()}
        </p>
      </motion.article>

      {mine ? (
        <section className="mt-10">
          <p className="kicker mb-3">{copy.replies}</p>
          <p className="mb-4 text-sm text-ink-3">{copy.authorHint}</p>
          {pub.reactions?.length > 0 && (
            <ul className="mb-5 flex flex-wrap gap-2">
              {pub.reactions.map((r, i) => (
                <li key={i} className="chip !cursor-default">
                  {r.person.name}: {r.label.toLowerCase()}
                </li>
              ))}
            </ul>
          )}
          {pub.threads.length === 0 && <p className="text-sm text-ink-3">Nadie te ha escrito todavía.</p>}
          <ul className="space-y-6">
            {pub.threads.map((t) => (
              <li key={t.reader.id} className="rounded-2xl border border-line p-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Avatar person={t.reader} size={26} /> {t.reader.name}
                </p>
                <Messages messages={t.messages} onDelete={(mid) => act('del', () => publicationsApi.deleteComment(pub.id, mid))} />
                <Reply
                  value={replyTo[t.reader.id] || ''}
                  onChange={(v) => setReplyTo((r) => ({ ...r, [t.reader.id]: v }))}
                  onSend={() => sendReply(replyTo[t.reader.id] || '', t.reader.id)}
                  busy={busy === 'reply'}
                  label={`Responder a ${t.reader.name}`}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="mt-10">
          <p className="kicker mb-3">{copy.reactions}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Reacciones">
            {pub.reactionOptions.map((o) => (
              <button
                key={o.key}
                className="chip"
                data-active={pub.myReaction === o.key}
                aria-pressed={pub.myReaction === o.key}
                disabled={!!busy}
                onClick={() => act('react', () => publicationsApi.react(pub.id, pub.myReaction === o.key ? null : o.key))}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="kicker mt-8 mb-2">{copy.replies}</p>
          {pub.threads[0] && <Messages messages={pub.threads[0].messages} onDelete={(mid) => act('del', () => publicationsApi.deleteComment(pub.id, mid))} />}
          <Reply value={reply} onChange={setReply} onSend={() => sendReply(reply)} busy={busy === 'reply'} label="Responder al autor" hint={copy.replyHint} />
        </section>
      )}

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          try {
            await publicationsApi.remove(pub.id)
            toast('Publicación eliminada. El escrito sigue en tu estudio.', { tone: 'success' })
            navigate('/tertulia/escritos')
          } catch (err) {
            toast(err.message, { tone: 'error' })
          }
        }}
        title="Eliminar la publicación"
        message="Se borrará de la Tertulia con sus reacciones y respuestas. Tu escrito original sigue en el Writer's Studio."
        confirmLabel="Eliminar"
        danger
      />
    </div>
  )
}

function Messages({ messages, onDelete }) {
  return (
    <ul className="mb-3 space-y-2">
      {messages.map((m) => (
        <li key={m.id} className={`flex ${m.mine ? 'justify-end' : ''}`}>
          <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.mine ? 'bg-accent-soft' : 'bg-surface-2'}`}>
            <p className="break-words whitespace-pre-wrap">{m.body}</p>
            <p className="mt-1 flex items-center gap-2 font-mono text-[10px] text-ink-3">
              {when(m.createdAt)}
              {m.mine && (
                <button className="underline" onClick={() => onDelete(m.id)} aria-label="Borrar mi mensaje">
                  borrar
                </button>
              )}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function Reply({ value, onChange, onSend, busy, label, hint }) {
  return (
    <div className="mt-2">
      <textarea className="field" rows={2} maxLength={1000} value={value} onChange={(e) => onChange(e.target.value)} placeholder={copy.replyPlaceholder} aria-label={label} />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-ink-3">{hint}</span>
        <button className="btn btn-sm btn-primary" onClick={onSend} disabled={busy || !value.trim()}>
          {busy ? <Spinner size={13} /> : <Send size={13} />} Enviar
        </button>
      </div>
    </div>
  )
}
