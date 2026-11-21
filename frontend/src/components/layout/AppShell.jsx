import { useEffect } from 'react'
import { Link, NavLink, useLocation, useNavigate, useOutlet } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ChartColumn, Compass, Feather, House, Library, Mail, MoonStar, Plus, Search } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useSocial } from '../../store/useSocial'
import BookPreview from '../book/BookPreview'
import CommandPalette from '../search/CommandPalette'
import { ManualAddDialog } from '../book/BookForm'
import NotificationBell from '../social/NotificationBell'
import { brand } from '../../lib/copy'
import ShareBookHost from '../social/ShareBookHost'

const NAV = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/descubrir', label: 'Descubrir', icon: Compass },
  { to: '/biblioteca', label: 'Biblioteca', icon: Library },
  { to: '/poesia', label: 'Poesía', icon: MoonStar },
  { to: '/estudio', label: 'Estudio', icon: Feather },
  { to: '/tertulia', label: 'Tertulia', icon: Mail, social: true },
  { to: '/estadisticas', label: 'Estadísticas', short: 'Datos', icon: ChartColumn },
]
const NAV_BY = Object.fromEntries(NAV.map((n) => [n.to, n]))

/** Letters waiting to be opened or friends waiting for an answer. */
function useTertuliaWaiting() {
  const summary = useSocial((s) => s.summary)
  return (summary.letters || 0) + (summary.requests || 0) > 0
}

export function Wordmark({ className = '' }) {
  return (
    <Link to="/" className={`group flex items-center gap-2 ${className}`} aria-label={brand.homeLabel}>
      <svg width="22" height="26" viewBox="0 0 22 26" aria-hidden="true" className="transition-transform duration-500 group-hover:-rotate-6">
        <path d="M2 3.5A2.5 2.5 0 0 1 4.5 1h13A2.5 2.5 0 0 1 20 3.5V25l-9-5-9 5V3.5z" fill="var(--accent)" />
        <path d="M6 7h10M6 11h7" stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="font-display text-[1.35rem] leading-none tracking-tight">
        Book<em className="display-wonk font-normal">tracker</em>
      </span>
    </Link>
  )
}

function Avatar() {
  const profile = useStore((s) => s.profile)
  const initial = (profile?.displayName || 'L').trim()[0]?.toUpperCase()
  return (
    <NavLink
      to="/perfil"
      className={({ isActive }) =>
        `grid h-10 w-10 place-items-center rounded-full border font-display text-lg transition ${isActive ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong bg-surface hover:border-ink-3'}`
      }
      aria-label="Tu perfil lector"
      title="Tu perfil lector"
    >
      {initial}
    </NavLink>
  )
}

function TopBar() {
  const openPalette = useStore((s) => s.openPalette)
  const social = useStore((s) => s.authRequired)
  const waiting = useTertuliaWaiting()
  const nav = NAV.filter((n) => social || !n.social)
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-4 px-4 md:px-8">
        <Wordmark />
        <nav className={`hidden items-center gap-0.5 lg:flex ${social ? 'ml-2 xl:ml-6' : 'ml-6'}`} aria-label="Principal">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `relative py-2 text-sm font-medium transition-colors ${social ? 'px-2.5 xl:px-3' : 'px-3'} ${isActive ? 'text-ink' : 'text-ink-2 hover:text-ink'}`
              }
            >
              {({ isActive }) => (
                <>
                  {social && n.short ? (
                    <>
                      <span className="xl:hidden">{n.short}</span>
                      <span className="hidden xl:inline">{n.label}</span>
                    </>
                  ) : (
                    n.label
                  )}
                  {n.social && waiting && <span className="letter-unread-dot absolute top-1.5 right-0.5 h-1.5 w-1.5 rounded-full bg-accent" aria-label="Tienes algo esperando" />}
                  {isActive && <motion.span layoutId="nav-underline" className="absolute inset-x-3 -bottom-[17px] h-[2px] bg-accent" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => openPalette('search')}
            className="hidden h-10 items-center gap-3 rounded-full border border-line bg-surface pr-2 pl-4 text-sm text-ink-3 transition hover:border-line-strong hover:text-ink-2 sm:flex"
          >
            <Search size={15} />
            <span className={`pr-6 whitespace-nowrap md:hidden ${social ? '2xl:inline' : 'xl:inline'}`}>Buscar libros, autores, ISBN…</span>
            <kbd className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] md:hidden lg:inline">Ctrl K</kbd>
          </button>
          <button onClick={() => openPalette('search')} className="btn btn-icon sm:hidden" aria-label="Buscar">
            <Search size={18} />
          </button>
          <button onClick={() => openPalette('add')} className="btn btn-primary hidden md:inline-flex" aria-label="Añadir libro">
            <Plus size={16} /> <span className="md:hidden xl:inline">Añadir libro</span>
          </button>
          {social && <NotificationBell />}
          <Avatar />
        </div>
      </div>
    </header>
  )
}

function MobileNav() {
  const openPalette = useStore((s) => s.openPalette)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const inStudio = pathname.startsWith('/estudio')
  const inPoetry = pathname.startsWith('/poesia')
  const social = useStore((s) => s.authRequired)
  const waiting = useTertuliaWaiting()
  // With accounts, the last slot belongs to the Tertulia; statistics stay one tap away from Inicio and the profile.
  const items = [NAV_BY['/'], NAV_BY['/descubrir'], NAV_BY['/biblioteca'], null, NAV_BY['/poesia'], NAV_BY['/estudio'], social ? NAV_BY['/tertulia'] : NAV_BY['/estadisticas']]
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/85 backdrop-blur-xl lg:hidden" aria-label="Principal móvil">
      <div className="mx-auto grid max-w-xl grid-cols-7 items-center px-1 pt-1.5">
        {items.map((n, i) =>
          n ? (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `flex min-w-0 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium ${isActive ? 'text-ink' : 'text-ink-3'}`}
            >
              {({ isActive }) => (
                <>
                  <span className="relative">
                    <n.icon size={21} strokeWidth={isActive ? 2.2 : 1.7} />
                    {n.social && waiting && <span className="letter-unread-dot absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-accent" aria-label="Tienes algo esperando" />}
                  </span>
                  <span className="max-w-full truncate">{n.short || n.label}</span>
                </>
              )}
            </NavLink>
          ) : (
            <div key={i} className="flex justify-center">
              <button
                onClick={() => (inStudio ? navigate('/estudio/escrito/nuevo') : inPoetry ? navigate('/poesia/buscar') : openPalette('add'))}
                className="grid h-12 w-12 -translate-y-1 place-items-center rounded-2xl bg-accent text-accent-ink shadow-[0_10px_30px_-10px_var(--accent)] transition active:scale-95"
                aria-label={inStudio ? 'Nuevo escrito' : inPoetry ? 'Buscar poesía' : 'Añadir libro'}
              >
                {inStudio ? <Feather size={22} /> : inPoetry ? <Search size={22} /> : <Plus size={24} />}
              </button>
            </div>
          ),
        )}
      </div>
    </nav>
  )
}

export default function AppShell() {
  const location = useLocation()
  const outlet = useOutlet()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])

  return (
    <div className="min-h-dvh">
      <TopBar />
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.32, ease: [0.2, 0.75, 0.2, 1] }}
          className="mx-auto max-w-[1320px] px-4 pt-8 pb-32 md:px-8 md:pt-12 lg:pb-24"
        >
          {outlet}
        </motion.main>
      </AnimatePresence>
      <MobileNav />
      <BookPreview />
      <CommandPalette />
      <ManualAddDialog />
      <ShareBookHost />
    </div>
  )
}
