import { useRef, useState } from 'react'
import { Gift, Send } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Spinner } from '../ui/Bits'
import FriendPicker from './FriendPicker'
import { newKey, socialApi } from '../../lib/social'
import { useStore } from '../../store/useStore'

/**
 * Recommend a book (kind="book", item = a book of the user's library) or share a
 * poem (kind="poem", item = the poem record from the reader) with friends.
 * The server re-checks friendship and, for poems, the rights.
 */
export default function ShareDialog({ open, onClose, kind, item }) {
  const toast = useStore((s) => s.toast)
  const [to, setTo] = useState([])
  const [note, setNote] = useState('')
  const [withRating, setWithRating] = useState(true)
  const [busy, setBusy] = useState(false)
  const key = useRef(newKey()) // one share, even if the button is pressed twice

  const close = () => {
    if (busy) return
    setTo([])
    setNote('')
    key.current = newKey()
    onClose()
  }

  const send = async () => {
    setBusy(true)
    try {
      const body = { recipients: to, note, clientKey: key.current }
      const res =
        kind === 'book'
          ? await socialApi.shareBook({ ...body, bookId: item.id, includeRating: withRating })
          : await socialApi.sharePoem({ ...body, poemId: item.id })
      toast(
        kind === 'book'
          ? `Recomendación enviada a ${res.count} ${res.count === 1 ? 'amigo' : 'amigos'}.`
          : res.textShared
            ? 'Poema compartido.'
            : 'Poema compartido como referencia: está protegido, así que no enviamos su texto.',
        { tone: 'success' },
      )
      setBusy(false)
      close()
    } catch (err) {
      setBusy(false)
      toast(err.message, { tone: 'error' })
    }
  }

  const title = kind === 'book' ? 'Recomendar a un amigo' : 'Compartir este poema'
  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      footer={
        <>
          <button className="btn" onClick={close} disabled={busy}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={send} disabled={busy || !to.length}>
            {busy ? <Spinner size={15} /> : <Send size={15} />} Enviar
          </button>
        </>
      }
    >
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-line bg-surface-2/60 p-3">
        {kind === 'book' && item?.coverUrl ? (
          <img src={item.coverUrl} alt="" className="h-16 w-11 shrink-0 rounded-[3px] object-cover shadow" />
        ) : (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-dusk-soft text-dusk">
            <Gift size={18} />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-display text-lg leading-tight">{item?.title}</p>
          <p className="truncate text-sm text-ink-3">{kind === 'book' ? (item?.authors || []).join(', ') : item?.author?.name}</p>
        </div>
      </div>
      <p className="kicker mb-2">¿Con quién?</p>
      <FriendPicker value={to} onChange={setTo} />
      <label className="mt-5 block">
        <span className="kicker mb-2 block">Unas palabras (opcional)</span>
        <textarea
          className="journal w-full resize-y !text-[1.25rem]"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={kind === 'book' ? 'Creo que te gustaría porque…' : 'Me acordé de ti al leerlo…'}
        />
      </label>
      {kind === 'book' && item?.rating ? (
        <label className="mt-3 flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={withRating} onChange={(e) => setWithRating(e.target.checked)} className="accent-[var(--accent)]" />
          Incluir mi valoración ({item.rating}★)
        </label>
      ) : null}
      {kind === 'poem' && !item?.rights?.universal && (
        <p className="mt-3 text-xs text-ink-3">
          Este poema no es libre en todas las jurisdicciones: tu amigo recibirá la referencia y el enlace a la fuente, y podrá leerlo en el lector si es libre en su país.
        </p>
      )}
    </Dialog>
  )
}
