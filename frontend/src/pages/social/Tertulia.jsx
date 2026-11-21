import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router'
import { Bell, Feather, Gift, Mail, UserRound, Users } from 'lucide-react'
import { useSocial } from '../../store/useSocial'

const TABS = [
  { to: '/tertulia', end: true, label: 'Correspondencia', icon: Mail, badge: 'letters' },
  { to: '/tertulia/obsequios', label: 'Obsequios', icon: Gift },
  { to: '/tertulia/escritos', label: 'Escritos', icon: Feather },
  { to: '/tertulia/amigos', label: 'Amigos', icon: Users, badge: 'requests' },
  { to: '/tertulia/avisos', label: 'Avisos', icon: Bell, badge: 'notifications' },
  { to: '/tertulia/ficha', label: 'Tu ficha', icon: UserRound },
]

/** The Tertulia: correspondence first, then gifts, friends and notices. */
export default function Tertulia() {
  const summary = useSocial((s) => s.summary)
  const startPolling = useSocial((s) => s.startPolling)
  useEffect(() => startPolling(), [startPolling])
  return (
    <div>
      <nav className="no-scrollbar -mx-4 mb-8 flex gap-1 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0" aria-label="Tertulia">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `relative flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-medium transition ${isActive ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`
            }
          >
            {({ isActive }) => (
              <>
                <t.icon size={15} />
                {t.label}
                {t.badge && summary[t.badge] > 0 && (
                  <span className="rounded-full bg-accent px-1.5 font-mono text-[10px] leading-4 text-accent-ink">{summary[t.badge]}</span>
                )}
                {isActive && <span className="absolute inset-x-3 -bottom-px h-[2px] bg-accent" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
