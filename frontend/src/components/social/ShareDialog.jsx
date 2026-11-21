import { useRef, useState } from 'react'
import { Check, Gift, Send } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Spinner } from '../ui/Bits'
import Cover from '../book/Cover'
import FriendPicker from './FriendPicker'
import { newKey, socialApi } from '../../lib/social'
import { useSocial } from '../../store/useSocial'
import { useStore } from '../../store/useStore'
import { tertulia } from '../../lib/copy'

const BOOK_FIELDS = ['id', 'title', 'subtitle', 'authors', 'description', 'coverUrl', 'year', 'publisher', 'pageCount', 'isbn13', 'language', 'categories', 'genres']

/**
 * Share a book (kind="book": a book of the user's library, or a catalog book that
 * isn't on their shelves yet) or a poem (kind="poem": the poem record from the
 * reader) with one or several friends. Both go through the Tertulia's existing
 * endpoints; the server re-checks friendship and, for poems, the rights, and a
 * single key makes a double press send once.
 */
export default function ShareDialog({ open, onClose, kind, item: given }) {
  const toast = useStore((s) => s.toast)
  const friends = useSocial((s) => s.friends)
  // A catalog book that is already in the library is shared from the library (with its rating).
  const inLibrary = useStore((s) => (kind === 'book' && given ? s.findInLibrary(given) : null))
  const item = inLibrary || given
  const isLibraryBook = kind === 'book' && typeof item?.id === 'number'
  const [to, setTo] = useState([])
  const [note, setNote] = useState('')
  const [withRating, setWithRating] = useState(true)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null) // { names }
  const key = useRef(newKey()) // one share, even if the button is pressed twice
  const copy = tertulia.shareBook

  const close = () => {
    if (busy) return
    setTo([])
    setNote('')
    setDone(null)
    key.current = newKey()
    onClose()
  }
  const send = async () => {
    setBusy(true)
    try {
      const body = { recipients: to, note, clientKey: key.current }
      let res
      if (kind === 'book') {
        const payload = isLibraryBook ? { bookId: item.id } : { book: Object.fromEntries(BOOK_FIELDS.map((k) => [k, item[k]]).filter(([, v]) => v != null)) }
        res = await socialApi.shareBook({ ...body, ...payload, includeRating: withRating })
      } else {
        res = await socialApi.sharePoem({ ...body, poemId: item.id })
      }
      const names = (friends || []).filter((f) => to.includes(f.id)).map((f) => f.name)
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : names[0] || `${res.count} ${res.count === 1 ? 'amigo' : 'amigos'}`
      if (kind === 'book') {
        setDone({ names: list })
        toast(copy.sent(item.title, list), { tone: 'success' })
      } else {
        toast(
          res.textShared
            ? 'Poema compartido.'
            : 'Poema compartido como referencia: está protegido, así que no enviamos su texto.',
          { tone: 'success' },
        )
        key.current = newKey()
        setTo([])
        setNote('')
        onClose()
      }
    } catch (err) {
      toast(err.message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const title = kind === 'book' ? copy.title : 'Compartir este poema'
  const book = (
    <div className="mb-5 flex items-center gap-4 rounded-2xl border border-line bg-surface-2/60 p-3.5">
      {kind === 'book' ? (
        <div className="w-16 shrink-0">
          <Cover book={item} compact />
        </div>
      ) : (
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-dusk-soft text-dusk">
          <Gift size={18} />
        </span>
      )}
      <div className="min-w-0">
        <p className="line-clamp-2 font-display text-lg leading-tight">{item?.title}</p>
        <p className="truncate text-sm text-ink-3">
          {kind === 'book' ? [(item?.authors || []).join(', '), item?.year].filter(Boolean).join(' · ') : item?.author?.name}
        </p>
        {kind === 'book' && !isLibraryBook && <p className="mt-1 text-xs text-ink-3">{copy.notInLibrary}</p>}
      </div>
    </div>
  )

  if (done)
    return (
      <Dialog open={open} onClose={close} title={copy.doneTitle} footer={<button className="btn btn-primary" onClick={close}>{copy.close}</button>}>
        {book}
        <div className="py-2 text-center" role="status">
          <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-sage-soft text-sage">
            <Check size={22} />
          </span>
          <p className="text-ink-2">{copy.doneBody(done.names)}</p>
        </div>
      </Dialog>
    )

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      footer={
        <>
          <button className="btn" onClick={close} disabled={busy}>
            {copy.cancel}
          </button>
          <button className="btn btn-primary" onClick={send} disabled={busy || !to.length}>
            {busy ? <Spinner size={15} /> : <Send size={15} />} {copy.send}
            {to.length > 1 ? ` (${to.length})` : ''}
          </button>
        </>
      }
    >
      {book}
      <p className="kicker mb-2">{copy.to}</p>
      <FriendPicker value={to} onChange={setTo} />
      <label className="mt-5 block">
        <span className="kicker mb-2 block">{copy.note}</span>
        <textarea
          className="journal w-full resize-y !text-[1.25rem]"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={kind === 'book' ? copy.notePlaceholder : 'Me acordé de ti al leerlo…'}
        />
      </label>
      {isLibraryBook && item?.rating ? (
        <label className="mt-3 flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={withRating} onChange={(e) => setWithRating(e.target.checked)} className="accent-[var(--accent)]" />
          {copy.includeRating(item.rating)}
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
