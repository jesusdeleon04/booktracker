import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Bell } from 'lucide-react'
import { Popover } from '../studio/StudioBits'
import { Spinner } from '../ui/Bits'
import { Avatar } from './SocialBits'
import { noticeText, socialApi, when } from '../../lib/social'
import { useSocial } from '../../store/useSocial'

/** Discreet bell in the top bar: a dot when something is waiting. */
export default function NotificationBell() {
  const navigate = useNavigate()
  const summary = useSocial((s) => s.summary)
  const refreshSummary = useSocial((s) => s.refreshSummary)
  const startPolling = useSocial((s) => s.startPolling)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(null)

  useEffect(() => startPolling(), [startPolling])
  useEffect(() => {
    if (!open) return
    setItems(null)
    socialApi
      .notifications(0, 8)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]))
  }, [open])

  const pending = summary.notifications || 0
  const go = async (n) => {
    setOpen(false)
    if (!n.read) socialApi.markRead({ ids: [n.id] }).then(refreshSummary).catch(() => {})
    navigate(noticeText(n).to)
  }
  const readAll = async () => {
    await socialApi.markRead({ all: true }).catch(() => {})
    setItems((list) => list?.map((n) => ({ ...n, read: true })))
    refreshSummary()
  }

  return (
    <div className="relative">
      <button
        className="btn btn-icon relative"
        onClick={() => setOpen((o) => !o)}
        aria-label={pending ? `Avisos: ${pending} sin leer` : 'Avisos'}
        aria-expanded={open}
        title="Avisos de la Tertulia"
      >
        <Bell size={17} />
        {pending > 0 && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-accent letter-unread-dot" aria-hidden="true" />}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} align="right" className="w-[min(22rem,calc(100vw-2rem))] p-2">
        <div className="flex items-center justify-between px-2 pt-1 pb-2">
          <p className="kicker">Avisos</p>
          {pending > 0 && (
            <button className="text-xs text-dusk hover:underline" onClick={readAll}>
              Marcar todo como leído
            </button>
          )}
        </div>
        {items === null ? (
          <div className="p-3">
            <Spinner size={15} />
          </div>
        ) : items.length === 0 ? (
          <p className="px-2 pb-3 text-sm text-ink-3">Nada nuevo por ahora.</p>
        ) : (
          <ul className="space-y-0.5">
            {items.map((n) => {
              const t = noticeText(n)
              return (
                <li key={n.id}>
                  <button onClick={() => go(n)} className={`flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2 ${n.read ? 'opacity-70' : ''}`}>
                    <Avatar person={n.actor} size={32} />
                    <span className="min-w-0 flex-1 text-sm">
                      <strong className="font-medium">{t.who}</strong> {t.text}
                      <span className="block font-mono text-[10.5px] text-ink-3">{when(n.createdAt)}</span>
                    </span>
                    {!n.read && <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <Link to="/tertulia/avisos" onClick={() => setOpen(false)} className="mt-1 block rounded-xl px-2 py-2 text-center text-sm text-dusk hover:bg-surface-2">
          Ver todos los avisos
        </Link>
      </Popover>
    </div>
  )
}
