import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { Feather, RefreshCw } from 'lucide-react'
import { Spinner } from '../../components/ui/Bits'
import { Avatar, EnvelopeCard } from '../../components/social/SocialBits'
import { lettersApi, when } from '../../lib/social'
import { newClientKey, studioApi } from '../../lib/studio'
import { useSocial } from '../../store/useSocial'
import { useStore } from '../../store/useStore'

const FILTERS = { all: 'Todas', unread: 'Sin abrir', read: 'Leídas' }

/** Start a new letter: a private draft in the studio's "Cartas" category. */
export async function startLetter(navigate, { to, replyTo, subject } = {}) {
  const ov = await studioApi.overview().catch(() => null)
  const cat = ov?.categories?.find((c) => c.name === 'Cartas')
  const w = await studioApi.create({ title: subject || '', content: '', categoryId: cat?.id, clientKey: newClientKey() })
  const qs = new URLSearchParams({ carta: '1' })
  if (to) qs.set('para', String(to))
  if (replyTo) qs.set('respuesta', String(replyTo))
  navigate(`/estudio/escrito/${w.id}?${qs}`)
}

export default function Correspondence() {
  const navigate = useNavigate()
  const toast = useStore((s) => s.toast)
  const refreshSummary = useSocial((s) => s.refreshSummary)
  const [params, setParams] = useSearchParams()
  const box = params.get('caja') === 'enviadas' ? 'sent' : 'inbox'
  const filter = FILTERS[params.get('filtro')] ? params.get('filtro') : 'all'
  const [state, setState] = useState({ status: 'loading', items: [] })
  const [starting, setStarting] = useState(false)

  const load = useCallback(
    async (offset = 0) => {
      setState((s) => ({ ...s, status: offset ? 'more' : 'loading', ...(offset ? {} : { items: [] }) }))
      try {
        const r = await lettersApi.list({ box, filter: box === 'sent' ? undefined : filter, offset, limit: 18 })
        setState((s) => ({ status: 'ready', items: offset ? [...s.items, ...r.items] : r.items, next: r.next, unread: r.unread }))
      } catch (err) {
        setState((s) => ({ ...s, status: 'error', error: err.message }))
      }
    },
    [box, filter],
  )
  useEffect(() => {
    load(0)
    refreshSummary()
  }, [load, refreshSummary])

  const write = async () => {
    setStarting(true)
    try {
      await startLetter(navigate)
    } catch (err) {
      toast(err.message, { tone: 'error' })
      setStarting(false)
    }
  }
  const set = (patch) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next)
  }

  return (
    <div>
      <header className="relative mb-10 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
        <div className="pointer-events-none absolute -top-16 left-0 -z-10 h-64 w-[36rem] bg-[radial-gradient(closest-side,rgba(244,176,88,0.14),transparent)]" aria-hidden="true" />
        <div>
          <p className="kicker mb-3">Correspondencia</p>
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="font-display text-[2.6rem] leading-[0.98] font-light text-balance md:text-[4rem]">
            Cartas <em className="display-wonk">escritas a máquina</em>
          </motion.h1>
          <p className="mt-3 max-w-xl text-ink-2">Lo que te escriben tus amigos llega cerrado con lacre. Ábrelo cuando tengas un momento para leerlo con calma.</p>
        </div>
        <button className="btn btn-primary h-12 px-6 text-base" onClick={write} disabled={starting}>
          {starting ? <Spinner size={16} /> : <Feather size={18} />} Escribir una carta
        </button>
      </header>

      <div className="mb-8 flex flex-wrap items-center gap-2">
        <button className="chip" data-active={box === 'inbox'} onClick={() => set({ caja: null })}>
          Recibidas {state.unread ? <span className="font-mono text-[11px] text-accent">{state.unread} sin abrir</span> : null}
        </button>
        <button className="chip" data-active={box === 'sent'} onClick={() => set({ caja: 'enviadas', filtro: null })}>
          Enviadas
        </button>
        {box === 'inbox' && (
          <span className="ml-auto flex gap-1">
            {Object.entries(FILTERS).map(([k, label]) => (
              <button key={k} className="chip !h-8 text-[13px]" data-active={filter === k} onClick={() => set({ filtro: k === 'all' ? null : k })}>
                {label}
              </button>
            ))}
          </span>
        )}
      </div>

      {state.status === 'loading' ? (
        <div className="flex items-center gap-2 text-ink-2">
          <Spinner /> Abriendo el buzón…
        </div>
      ) : state.status === 'error' ? (
        <div className="rounded-2xl border border-dashed border-line-strong p-8 text-center">
          <p className="text-ink-2">No se pudo abrir la correspondencia: {state.error}</p>
          <button className="btn mt-4" onClick={() => load(0)}>
            <RefreshCw size={15} /> Reintentar
          </button>
        </div>
      ) : !state.items.length ? (
        <div className="mx-auto max-w-md py-10 text-center">
          <div className="mx-auto mb-6 max-w-[15rem] opacity-80">
            <EnvelopeCard letter={{ stationery: 'marfil', seal: 'lacre', sentAt: new Date().toISOString() }} from={{ name: '' }} open />
          </div>
          <p className="font-display text-2xl">
            {box === 'sent' ? 'Aún no has enviado cartas' : filter === 'unread' ? 'No hay cartas sin abrir' : 'Tu buzón está vacío'}
          </p>
          <p className="mt-2 text-ink-2">
            {box === 'sent'
              ? 'Escribe una en el Writer’s Studio y envíasela a un amigo.'
              : 'Cuando un amigo te escriba, su carta aparecerá aquí, cerrada con su lacre.'}
          </p>
        </div>
      ) : (
        <>
          <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
            {state.items.map((l, i) => (
              <motion.li key={l.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 9) * 0.04 }}>
                <Link to={`/tertulia/cartas/${l.id}`} className="group block" aria-label={box === 'sent' ? `Carta enviada: ${l.subject || 'sin asunto'}` : `Carta de ${l.sender?.name}${l.readAt ? '' : ', sin abrir'}`}>
                  <div className="transition duration-300 group-hover:-translate-y-1 group-hover:-rotate-[0.6deg]">
                    <EnvelopeCard
                      letter={l}
                      from={box === 'sent' ? { name: l.recipients.map((r) => r.person.name).join(', ') } : l.sender}
                      open={box === 'sent' || !!l.readAt}
                    />
                  </div>
                  <div className="mt-3 flex items-start gap-3">
                    {box === 'inbox' && <Avatar person={l.sender} size={30} />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-[1.15rem] leading-tight">
                        {l.subject || (box === 'sent' ? 'Sin asunto' : l.readAt ? 'Sin asunto' : 'Una carta para ti')}
                      </p>
                      <p className="font-mono text-[11px] text-ink-3">
                        {box === 'sent'
                          ? `Enviada ${when(l.sentAt)} · ${l.recipients.filter((r) => r.readAt).length}/${l.recipients.length} abierta${l.recipients.length === 1 ? '' : 's'}`
                          : `${l.readAt ? 'Leída' : 'Sin abrir'} · ${when(l.deliveredAt)}`}
                      </p>
                      {l.excerpt && <p className="typed mt-1.5 line-clamp-2 text-[12.5px] opacity-75" style={{ color: 'var(--text-2)' }}>{l.excerpt}</p>}
                    </div>
                    {box === 'inbox' && !l.readAt && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent letter-unread-dot" aria-hidden="true" />}
                  </div>
                </Link>
              </motion.li>
            ))}
          </ul>
          {state.next != null && (
            <div className="mt-10 text-center">
              <button className="btn" onClick={() => load(state.next)} disabled={state.status === 'more'}>
                {state.status === 'more' && <Spinner size={14} />} Ver más cartas
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
