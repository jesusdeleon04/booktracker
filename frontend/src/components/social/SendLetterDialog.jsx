import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Mail, Send } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Spinner } from '../ui/Bits'
import FriendPicker from './FriendPicker'
import { EnvelopeCard, WaxSeal } from './SocialBits'
import { SEALS, STATIONERY, lettersApi, newKey } from '../../lib/social'
import { useStore } from '../../store/useStore'

/**
 * "Enviar carta" from the Writer's Studio editor. The letter is the writing as
 * it is now (saved first): it is frozen once sent; the draft stays editable.
 */
export default function SendLetterDialog({ open, onClose, writingId, getDoc, flush, preselect = [], replyTo = null, senderName = '', onSent }) {
  const toast = useStore((s) => s.toast)
  const [to, setTo] = useState(preselect)
  const [subject, setSubject] = useState('')
  const [stationery, setStationery] = useState('marfil')
  const [seal, setSeal] = useState('lacre')
  const [step, setStep] = useState('compose') // compose | confirm | sending | sent
  const [sentId, setSentId] = useState(null)
  const key = useRef(newKey())

  useEffect(() => {
    if (open) {
      setSubject(getDoc()?.title || '')
      setTo((t) => (t.length ? t : preselect))
      setStep('compose')
      key.current = newKey()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const content = open ? getDoc()?.content || '' : ''
  const empty = !content.trim()

  const send = async () => {
    setStep('sending')
    try {
      await flush?.() // the draft on the server matches what you see
      const res = await lettersApi.send({
        writingId, recipients: to, subject, content: getDoc()?.content || content, stationery, seal, clientKey: key.current, inReplyTo: replyTo,
      })
      setSentId(res.id)
      setStep('sent')
      onSent?.(res)
    } catch (err) {
      setStep('confirm')
      toast(err.message, { tone: 'error' })
    }
  }

  const close = () => {
    if (step === 'sending') return
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={step === 'sent' ? 'Carta enviada' : 'Enviar como carta'}
      width="max-w-xl"
      footer={
        step === 'sent' ? (
          <>
            <button className="btn" onClick={close}>
              Seguir escribiendo
            </button>
            <Link to={`/tertulia/cartas/${sentId}`} className="btn btn-primary">
              <Mail size={15} /> Ver la carta enviada
            </Link>
          </>
        ) : step === 'compose' ? (
          <>
            <button className="btn" onClick={close}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={() => setStep('confirm')} disabled={!to.length || empty}>
              Continuar
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={() => setStep('compose')} disabled={step === 'sending'}>
              Volver
            </button>
            <button className="btn btn-primary" onClick={send} disabled={step === 'sending'}>
              {step === 'sending' ? <Spinner size={15} /> : <Send size={15} />} Sellar y enviar
            </button>
          </>
        )
      }
    >
      <AnimatePresence mode="wait">
        {step === 'compose' && (
          <motion.div key="compose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {empty && <p className="mb-4 rounded-xl bg-accent-soft px-3 py-2 text-sm">La hoja está en blanco: escribe algo antes de enviarla.</p>}
            <p className="kicker mb-2">Para</p>
            <FriendPicker value={to} onChange={setTo} max={10} />
            <label className="mt-5 block">
              <span className="kicker mb-2 block">Asunto (opcional)</span>
              <input className="field" maxLength={300} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Sin asunto" />
            </label>
            <p className="kicker mt-5 mb-2">Papel</p>
            <div className="grid grid-cols-5 gap-2">
              {Object.entries(STATIONERY).map(([k, s]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStationery(k)}
                  aria-pressed={stationery === k}
                  title={s.hint}
                  className={`manuscript letter-${k} h-16 rounded-md text-[10px] font-semibold tracking-wide transition ${stationery === k ? 'ring-2 ring-accent ring-offset-2 ring-offset-[var(--surface)]' : 'opacity-80 hover:opacity-100'}`}
                >
                  <span className="typed">{s.label}</span>
                </button>
              ))}
            </div>
            <p className="kicker mt-5 mb-2">Lacre</p>
            <div className="flex gap-3">
              {Object.entries(SEALS).map(([k, s]) => (
                <button key={k} type="button" onClick={() => setSeal(k)} aria-pressed={seal === k} title={s.label} className={`rounded-full p-1 transition ${seal === k ? 'ring-2 ring-accent' : ''}`}>
                  <WaxSeal seal={k} letter="" size={30} />
                  <span className="sr-only">{s.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
        {(step === 'confirm' || step === 'sending') && (
          <motion.div key="confirm" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="mx-auto max-w-sm">
              <EnvelopeCard letter={{ stationery, seal, sentAt: new Date().toISOString(), subject }} from={{ name: senderName || 'Tu carta' }} />
            </div>
            <p className="mt-5 text-center text-sm text-ink-2">
              Una vez enviada, la carta queda tal como está: no podrás corregirla. El borrador seguirá en tu estudio.
            </p>
          </motion.div>
        )}
        {step === 'sent' && (
          <motion.div key="sent" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="py-4 text-center">
            <motion.div initial={{ y: 0, rotate: 0 }} animate={{ y: -8, rotate: -3 }} transition={{ duration: 0.8, ease: [0.2, 0.75, 0.2, 1] }} className="mx-auto mb-5 max-w-[14rem]">
              <EnvelopeCard letter={{ stationery, seal, sentAt: new Date().toISOString() }} from={{ name: 'En camino' }} compact />
            </motion.div>
            <p className="font-display text-2xl">Tu carta va en camino</p>
            <p className="mt-1 text-sm text-ink-2">Aparecerá en la correspondencia de quien la recibe, cerrada con tu lacre.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </Dialog>
  )
}
