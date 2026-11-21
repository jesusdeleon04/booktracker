import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { RefreshCw } from 'lucide-react'
import { Spinner } from '../../components/ui/Bits'
import { Avatar } from '../../components/social/SocialBits'
import { noticeText, socialApi, when } from '../../lib/social'
import { useSocial } from '../../store/useSocial'
import { tertulia as copy } from '../../lib/copy'

export default function Notices() {
  const navigate = useNavigate()
  const refreshSummary = useSocial((s) => s.refreshSummary)
  const [state, setState] = useState({ status: 'loading', items: [] })

  const load = useCallback(async (offset = 0) => {
    setState((s) => ({ ...s, status: offset ? 'more' : 'loading' }))
    try {
      const r = await socialApi.notifications(offset, 25)
      setState((s) => ({ status: 'ready', items: offset ? [...s.items, ...r.items] : r.items, next: r.next }))
    } catch (err) {
      setState((s) => ({ ...s, status: 'error', error: err.message }))
    }
  }, [])
  useEffect(() => {
    load(0)
  }, [load])

  const open = (n) => {
    if (!n.read) socialApi.markRead({ ids: [n.id] }).then(refreshSummary).catch(() => {})
    navigate(noticeText(n).to)
  }
  const readAll = async () => {
    await socialApi.markRead({ all: true }).catch(() => {})
    setState((s) => ({ ...s, items: s.items.map((n) => ({ ...n, read: true })) }))
    refreshSummary()
  }
  const unread = state.items.filter((n) => !n.read).length

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker mb-3">{copy.notices.kicker}</p>
          <h1 className="font-display text-[2.4rem] leading-[1] font-light">{copy.notices.title}</h1>
        </div>
        {unread > 0 && (
          <button className="btn btn-sm" onClick={readAll}>
            Marcar todo como leído
          </button>
        )}
      </header>
      {state.status === 'loading' ? (
        <Spinner />
      ) : state.status === 'error' ? (
        <p className="text-ink-2">
          {state.error}{' '}
          <button className="text-dusk underline" onClick={() => load(0)}>
            <RefreshCw size={12} className="inline" /> Reintentar
          </button>
        </p>
      ) : !state.items.length ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-ink-2">Todavía no hay avisos. Aquí sabrás cuándo te escriben, te recomiendan algo o aceptan tu solicitud.</p>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {state.items.map((n) => {
              const t = noticeText(n)
              return (
                <li key={n.id}>
                  <button onClick={() => open(n)} className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface ${n.read ? 'opacity-70' : ''}`}>
                    <Avatar person={n.actor} size={36} />
                    <span className="min-w-0 flex-1">
                      <strong className="font-medium">{t.who}</strong> {t.text}
                      <span className="block font-mono text-[11px] text-ink-3">{when(n.createdAt)}</span>
                    </span>
                    {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Sin leer" />}
                  </button>
                </li>
              )
            })}
          </ul>
          {state.next != null && (
            <div className="mt-6 text-center">
              <button className="btn" onClick={() => load(state.next)} disabled={state.status === 'more'}>
                Ver más
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
