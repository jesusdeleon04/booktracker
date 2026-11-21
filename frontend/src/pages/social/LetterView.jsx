import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Feather, PenLine, Trash2 } from 'lucide-react'
import { Spinner } from '../../components/ui/Bits'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { Avatar, Stamp, WaxSeal } from '../../components/social/SocialBits'
import { STATIONERY, initials, lettersApi, longDate, when } from '../../lib/social'
import { useSocial } from '../../store/useSocial'
import { useStore } from '../../store/useStore'
import { startLetter } from './Correspondence'

const EASE = [0.2, 0.75, 0.2, 1]

/** Closed envelope → broken seal → open flap → the sheet comes out. */
function Opening({ letter, onOpened }) {
  const [phase, setPhase] = useState('sealed') // sealed | breaking | lifting
  const reduce = useReducedMotion()
  const first = letter.sender?.name || ''
  const open = () => {
    if (reduce) return onOpened()
    setPhase('breaking')
    setTimeout(() => setPhase('lifting'), 520)
    setTimeout(onOpened, 1500)
  }
  return (
    <motion.div className="mx-auto flex min-h-[80dvh] max-w-xl flex-col items-center justify-center px-4" exit={{ opacity: 0, y: 30, transition: { duration: 0.35 } }}>
      <p className="kicker mb-6 text-center">Ha llegado una carta</p>
      <div className="relative w-full" style={{ perspective: 1200 }}>
        {/* The sheet waiting inside */}
        <motion.div
          className={`manuscript letter-${letter.stationery} absolute inset-x-[7%] top-[8%] h-[80%] rounded-[3px] shadow-lg`}
          initial={{ y: 0 }}
          animate={phase === 'lifting' ? { y: '-62%' } : { y: 0 }}
          transition={{ duration: 0.85, ease: EASE, delay: 0.15 }}
          style={{ zIndex: 1 }}
        >
          <div className="typed p-5 text-[11px] opacity-60">{letter.subject || ''}</div>
        </motion.div>
        <div className={`envelope envelope-${letter.stationery}`} style={{ overflow: 'visible', zIndex: 2 }}>
          <motion.div
            className="envelope-flap"
            initial={{ rotateX: 0 }}
            animate={phase === 'sealed' ? { rotateX: 0 } : { rotateX: 180 }}
            transition={{ duration: 0.55, ease: EASE, delay: 0.2 }}
            style={{ transformStyle: 'preserve-3d', backfaceVisibility: 'visible', zIndex: phase === 'lifting' ? 0 : 3 }}
          />
          <div className="absolute top-3 right-3 z-[3]">
            <Stamp stationery={letter.stationery} />
          </div>
          <div className="absolute inset-x-5 bottom-4 z-[3]">
            <p className="font-mono text-[10px] tracking-[0.16em] uppercase opacity-60">De</p>
            <p className="handwritten text-[1.8rem] leading-none">{first}</p>
          </div>
          <AnimatePresence>
            {phase === 'sealed' && (
              <motion.div
                className="absolute top-[58%] left-1/2 z-[4] -translate-x-1/2 -translate-y-1/2"
                exit={{ scale: 1.25, rotate: -18, opacity: 0, transition: { duration: 0.4 } }}
              >
                <WaxSeal seal={letter.seal} letter={initials(first)[0]} size={64} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <motion.div animate={{ opacity: phase === 'sealed' ? 1 : 0 }} className="mt-10 text-center">
        <p className="text-sm text-ink-2">
          {longDate(letter.sentAt)}
          {letter.subject ? <> · «{letter.subject}»</> : null}
        </p>
        <button className="btn btn-primary mt-5 h-12 px-7 text-base" onClick={open} disabled={phase !== 'sealed'} autoFocus>
          Romper el lacre
        </button>
      </motion.div>
    </motion.div>
  )
}

function Reading({ letter, cover }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="mx-auto w-full max-w-[52rem] px-2 sm:px-4"
      aria-label={letter.subject ? `Carta: ${letter.subject}` : 'Carta'}
    >
      <div className={`manuscript typewriter-sheet letter-${letter.stationery} relative rounded-[4px] px-6 pt-12 pb-16 sm:px-14 md:px-20`}>
        <div className="letter-body">
          <div className="mb-10 flex items-start justify-between gap-6">
            <div className="typed text-[12.5px] leading-relaxed opacity-75">
              {letter.role === 'recipient' ? (
                <>
                  Para {letter.recipient?.name}
                  <br />
                  De {letter.sender?.name}
                </>
              ) : (
                <>
                  De {letter.sender?.name}
                  <br />
                  Para {(letter.recipients || []).map((r) => r.person.name).join(', ')}
                </>
              )}
            </div>
            <div className="flex shrink-0 items-start gap-3">
              <span className="typed hidden text-right text-[12.5px] opacity-75 sm:block">{longDate(letter.sentAt)}</span>
              <Stamp stationery={letter.stationery} size={34} />
            </div>
          </div>
          {cover && (
            <figure className="mb-10">
              <img src={cover} alt="" className="mx-auto max-h-[28rem] w-auto rounded-[2px] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)]" />
            </figure>
          )}
          {letter.subject && <h1 className="typed mb-10 text-center text-[clamp(18px,2.4vw,24px)] font-bold tracking-[0.12em] uppercase">{letter.subject}</h1>}
          <div className="typed text-[clamp(16px,1.9vw,19px)] leading-[1.85] break-words whitespace-pre-wrap">{letter.content}</div>
          <div className="mt-14 flex justify-end">
            <WaxSeal seal={letter.seal} letter={initials(letter.sender?.name)[0]} size={40} style={{ opacity: 0.85, transform: 'rotate(-8deg)' }} />
          </div>
        </div>
      </div>
      <p className="mt-5 text-center font-mono text-[11px] text-ink-3">
        {STATIONERY[letter.stationery]?.label} · {letter.words} palabras · correspondencia privada
      </p>
    </motion.article>
  )
}

export default function LetterView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useStore((s) => s.toast)
  const refreshSummary = useSocial((s) => s.refreshSummary)
  const [state, setState] = useState({ status: 'loading' })
  const [opened, setOpened] = useState(false)
  const [cover, setCover] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [replying, setReplying] = useState(false)
  const coverRef = useRef(null)

  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    setOpened(false)
    lettersApi
      .get(id)
      .then((letter) => {
        if (!alive) return
        setState({ status: 'ready', letter })
        if (letter.role !== 'recipient' || letter.readAt) setOpened(true)
        if (letter.cover)
          lettersApi
            .coverUrl(letter.cover.url)
            .then((u) => {
              coverRef.current = u
              if (alive) setCover(u)
            })
            .catch(() => {})
      })
      .catch((err) => alive && setState({ status: 'error', error: err.message, code: err.status }))
    return () => {
      alive = false
      if (coverRef.current) URL.revokeObjectURL(coverRef.current)
    }
  }, [id])

  const letter = state.letter
  const onOpened = async () => {
    setOpened(true)
    window.scrollTo({ top: 0 })
    try {
      const r = await lettersApi.read(letter.id)
      setState((s) => ({ ...s, letter: { ...s.letter, readAt: r.readAt } }))
      refreshSummary()
    } catch {
      /* reading works even if the receipt fails */
    }
  }
  const remove = async () => {
    try {
      await lettersApi.hide(letter.id)
      toast(letter.role === 'recipient' ? 'Carta quitada de tu correspondencia.' : 'Carta quitada de tus enviadas.', { tone: 'success' })
      navigate(letter.role === 'recipient' ? '/tertulia' : '/tertulia?caja=enviadas')
    } catch (err) {
      toast(err.message, { tone: 'error' })
    }
  }
  const reply = async () => {
    setReplying(true)
    try {
      await startLetter(navigate, { to: letter.sender?.id, replyTo: letter.id, subject: letter.subject ? `Re: ${letter.subject}` : '' })
    } catch (err) {
      setReplying(false)
      toast(err.message, { tone: 'error' })
    }
  }

  return (
    <div className="min-h-dvh pb-24">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-2 px-3 sm:px-6">
          <Link to={letter?.role === 'sender' ? '/tertulia?caja=enviadas' : '/tertulia'} className="btn btn-ghost btn-sm">
            <ArrowLeft size={16} /> Correspondencia
          </Link>
          {letter && opened && (
            <div className="ml-auto flex items-center gap-2">
              {letter.role === 'recipient' && letter.sender?.id && (
                <button className="btn btn-sm btn-primary" onClick={reply} disabled={replying}>
                  {replying ? <Spinner size={13} /> : <Feather size={14} />} Responder con una carta
                </button>
              )}
              {letter.role === 'sender' && letter.sourceWritingId && (
                <Link to={`/estudio/escrito/${letter.sourceWritingId}`} className="btn btn-sm">
                  <PenLine size={14} /> Ir al borrador
                </Link>
              )}
              <button className="btn btn-icon btn-sm btn-ghost" onClick={() => setConfirm(true)} aria-label="Quitar de mi correspondencia" title="Quitar de mi correspondencia">
                <Trash2 size={15} />
              </button>
            </div>
          )}
        </div>
      </header>

      {state.status === 'loading' && (
        <div className="flex min-h-[60dvh] items-center justify-center gap-2 text-ink-2">
          <Spinner /> Buscando la carta…
        </div>
      )}
      {state.status === 'error' && (
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <p className="font-display text-2xl">Esta carta no está aquí</p>
          <p className="mt-2 text-ink-2">{state.code === 404 ? 'No existe, la quitaste de tu correspondencia o no fue escrita para ti.' : state.error}</p>
          <Link to="/tertulia" className="btn mt-6">
            Volver a la correspondencia
          </Link>
        </div>
      )}
      {letter && (
        <AnimatePresence mode="wait">
          {!opened ? (
            <Opening key="opening" letter={letter} onOpened={onOpened} />
          ) : (
            <div key="reading" className="pt-10">
              {letter.inReplyTo && (
                <p className="mb-6 text-center text-sm text-ink-3">
                  En respuesta a{' '}
                  <Link to={`/tertulia/cartas/${letter.inReplyTo.id}`} className="text-dusk underline-offset-4 hover:underline">
                    «{letter.inReplyTo.subject || 'una carta'}»
                  </Link>
                </p>
              )}
              <Reading letter={letter} cover={cover} />
              {letter.role === 'sender' && letter.recipients?.length > 0 && (
                <section className="mx-auto mt-10 max-w-xl px-4">
                  <p className="kicker mb-3">Registro de envío</p>
                  <ul className="divide-y divide-line rounded-2xl border border-line">
                    {letter.recipients.map((r, i) => (
                      <li key={i} className="flex items-center gap-3 px-4 py-3">
                        <Avatar person={r.person} size={30} />
                        <span className="min-w-0 flex-1 truncate">{r.person.name}</span>
                        <span className="font-mono text-[11px] text-ink-3">{r.readAt ? `abierta ${when(r.readAt)}` : 'aún cerrada'}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-ink-3">Enviada {when(letter.sentAt)}. Una carta enviada no se puede modificar.</p>
                </section>
              )}
            </div>
          )}
        </AnimatePresence>
      )}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={remove}
        title="Quitar de tu correspondencia"
        message={
          letter?.role === 'recipient'
            ? 'La carta desaparecerá solo de tu correspondencia. Quien te la escribió conservará su copia.'
            : 'La carta desaparecerá solo de tus enviadas. Quienes la recibieron la conservarán.'
        }
        confirmLabel="Quitar"
        danger
      />
    </div>
  )
}
