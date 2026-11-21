import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { motion } from 'motion/react'
import { RefreshCw } from 'lucide-react'
import { useStore } from './store/useStore'
import { usePoetry } from './store/usePoetry'
import { api } from './lib/api'
import { supabase } from './lib/supabase'
import LoginScreen from './components/auth/LoginScreen'
import AppShell, { Wordmark } from './components/layout/AppShell'
import Toaster from './components/ui/Toaster'
import Home from './pages/Home'
import Library from './pages/Library'
import BookDetail from './pages/BookDetail'
import NotFound from './pages/NotFound'

const Discover = lazy(() => import('./pages/Discover'))
const Feed = lazy(() => import('./pages/Feed'))
const Explore = lazy(() => import('./pages/Explore'))
const ListDetail = lazy(() => import('./pages/ListDetail'))
const Stats = lazy(() => import('./pages/Stats'))
const Profile = lazy(() => import('./pages/Profile'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Studio = lazy(() => import('./pages/studio/Studio'))
const StudioEditor = lazy(() => import('./pages/studio/Editor'))
const Poetry = lazy(() => import('./pages/poetry/Poetry'))
const PoetrySearch = lazy(() => import('./pages/poetry/PoetrySearch'))
const PoemView = lazy(() => import('./pages/poetry/PoemView'))
const PoetAuthor = lazy(() => import('./pages/poetry/PoetAuthor'))
const PoetList = lazy(() => import('./pages/poetry/PoetList'))
const PoetryCollection = lazy(() => import('./pages/poetry/PoetryCollection'))
const Tertulia = lazy(() => import('./pages/social/Tertulia'))
const Correspondence = lazy(() => import('./pages/social/Correspondence'))
const LetterView = lazy(() => import('./pages/social/LetterView'))
const Gifts = lazy(() => import('./pages/social/Gifts'))
const Friends = lazy(() => import('./pages/social/Friends'))
const Notices = lazy(() => import('./pages/social/Notices'))
const MyCard = lazy(() => import('./pages/social/MyCard'))
const PersonPage = lazy(() => import('./pages/social/PersonPage'))

function Splash({ error, onRetry }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>
        {error ? (
          <>
            <p className="font-display text-2xl">No pudimos abrir tu biblioteca</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">{error}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-ink-3">¿Está en marcha el servidor? Ejecuta <code className="font-mono">npm run dev</code> en la raíz del proyecto.</p>
            <button className="btn btn-primary mt-6" onClick={onRetry}>
              <RefreshCw size={15} /> Reintentar
            </button>
          </>
        ) : (
          <div className="flex items-end justify-center gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.span
                key={i}
                className="w-3 rounded-[2px]"
                style={{ background: ['var(--accent)', 'var(--brass)', 'var(--sage)', 'var(--text-3)', 'var(--accent)'][i] }}
                animate={{ height: [18, 34, 18] }}
                transition={{ repeat: Infinity, duration: 1.1, delay: i * 0.12, ease: 'easeInOut' }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const status = useStore((s) => s.status)
  const bootError = useStore((s) => s.bootError)
  const boot = useStore((s) => s.boot)
  const onboarded = useStore((s) => s.profile?.onboarded)
  const location = useLocation()

  // Multi-user mode: the server tells us whether a login is needed. Without one
  // (local use) the app opens exactly as before.
  const [cfg, setCfg] = useState(null)
  const authStatus = usePoetry((s) => s.auth.status)
  const userId = usePoetry((s) => s.auth.user?.id)
  useEffect(() => {
    api
      .get('/config')
      .catch(() => ({ authRequired: false }))
      .then((c) => {
        // The Tertulia (friends, letters) only exists with real accounts.
        useStore.setState({ authRequired: !!c.authRequired })
        setCfg(c)
      })
  }, [])
  useEffect(() => {
    if (cfg?.authRequired) usePoetry.getState().init()
  }, [cfg])
  useEffect(() => {
    if (!cfg) return
    if (!cfg.authRequired) boot()
    else if (authStatus === 'signedIn') boot()
  }, [cfg, authStatus, userId, boot])
  // Signing out (or switching account) must never leave the previous person's data on screen.
  const lastUser = useRef(null)
  useEffect(() => {
    if (!cfg?.authRequired || authStatus === 'loading') return
    const current = userId || null
    if (lastUser.current !== null && lastUser.current !== current) window.location.assign('/')
    lastUser.current = current
  }, [cfg, authStatus, userId])

  // A stale or invalid session must never strand the user on an error screen: drop it and show the login.
  useEffect(() => {
    if (cfg?.authRequired && status === 'error' && /sesi[oó]n/i.test(bootError || '')) {
      Promise.resolve(supabase?.auth.signOut({ scope: 'local' })).finally(() => window.location.replace('/'))
    }
  }, [cfg, status, bootError])

  // Public page: reachable without logging in (Google asks for a privacy-policy link).
  if (location.pathname === '/privacidad') return <Suspense fallback={null}><Privacy /></Suspense>
  if (!cfg || (cfg.authRequired && authStatus === 'loading')) return <Splash />
  if (cfg.authRequired && authStatus !== 'signedIn') return <LoginScreen />
  if (status !== 'ready') return <Splash error={status === 'error' ? bootError : null} onRetry={boot} />

  const inOnboarding = location.pathname.startsWith('/bienvenida')
  if (!onboarded && !inOnboarding) return <Navigate to="/bienvenida" replace />

  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Routes>
        <Route path="/bienvenida" element={<Onboarding />} />
        <Route path="/descubrir/inmersivo" element={<Feed />} />
        <Route path="/estudio/escrito/:id" element={<StudioEditor />} />
        {cfg.authRequired && <Route path="/tertulia/cartas/:id" element={<LetterView />} />}
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="descubrir" element={<Discover />} />
          <Route path="explorar/:kind/:key" element={<Explore />} />
          <Route path="biblioteca" element={<Library />} />
          <Route path="biblioteca/listas/:id" element={<ListDetail />} />
          <Route path="libro/:id" element={<BookDetail />} />
          <Route path="estadisticas" element={<Stats />} />
          <Route path="perfil" element={<Profile />} />
          <Route path="estudio" element={<Studio />} />
          <Route path="poesia" element={<Poetry />} />
          <Route path="poesia/buscar" element={<PoetrySearch />} />
          <Route path="poesia/poema/:id" element={<PoemView />} />
          <Route path="poesia/autor/:qid" element={<PoetAuthor />} />
          <Route path="poesia/poetas" element={<PoetList />} />
          <Route path="poesia/coleccion" element={<PoetryCollection />} />
          {cfg.authRequired && (
            <Route path="tertulia" element={<Tertulia />}>
              <Route index element={<Correspondence />} />
              <Route path="obsequios" element={<Gifts />} />
              <Route path="amigos" element={<Friends />} />
              <Route path="avisos" element={<Notices />} />
              <Route path="ficha" element={<MyCard />} />
              <Route path="lector/:username" element={<PersonPage />} />
            </Route>
          )}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <Toaster />
    </Suspense>
  )
}
