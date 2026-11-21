import { useState } from 'react'
import { Cloud, KeyRound, LogOut, MailCheck } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Spinner } from '../ui/Bits'
import { usePoetry } from '../../store/usePoetry'
import { useStore } from '../../store/useStore'
import { auth as copy } from '../../lib/copy'

export function GoogleButton({ className = '' }) {
  const signInWithGoogle = usePoetry((s) => s.signInWithGoogle)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  return (
    <div className={className}>
      <button
        type="button"
        className="btn h-11 w-full justify-center gap-3 bg-white !text-[#1f1f1f] hover:!bg-[#f2f2f2]"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await signInWithGoogle()
          } catch (e) {
            setError(e.message)
            setBusy(false)
          }
        }}
      >
        {busy ? (
          <Spinner size={16} />
        ) : (
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
            <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
          </svg>
        )}
        {copy.login.google}
      </button>
      {error && <p className="mt-2 text-sm text-ember">{error}</p>}
    </div>
  )
}

export function AuthDialog({ open, onClose }) {
  const signIn = usePoetry((s) => s.signIn)
  const signUp = usePoetry((s) => s.signUp)
  const resetPassword = usePoetry((s) => s.resetPassword)
  const [mode, setMode] = useState('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'in') {
        await signIn(email.trim(), password)
        onClose()
      } else if (mode === 'up') {
        const { needsConfirmation } = await signUp(email.trim(), password)
        if (needsConfirmation) setSent('confirm')
        else onClose()
      } else {
        await resetPassword(email.trim())
        setSent('reset')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const t = copy.dialog
  return (
    <Dialog open={open} onClose={onClose} title={t.titles[mode]} width="max-w-md">
      {sent ? (
        <div className="py-4 text-center">
          <MailCheck className="mx-auto mb-3 text-sage" size={28} />
          <p className="font-display text-xl">{t.sentTitle}</p>
          <p className="mt-2 text-sm text-ink-2">
            {sent === 'confirm' ? t.sentConfirm(email) : t.sentReset(email)}
          </p>
          <button
            className="btn mt-5"
            onClick={() => {
              setSent(null)
              setMode('in')
            }}
          >
            {t.back}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-ink-2">{t.intro[mode]}</p>
          <GoogleButton />
          <p className="text-center text-xs text-ink-3">{t.or}</p>
          <label className="block">
            <span className="mb-1 block text-xs text-ink-3">{t.email}</span>
            <input className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {mode !== 'reset' && (
            <label className="block">
              <span className="mb-1 block text-xs text-ink-3">{t.password}</span>
              <input
                className="field"
                type="password"
                autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                minLength={6}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === 'up' && <span className="mt-1 block text-xs text-ink-3">{t.passwordHint}</span>}
            </label>
          )}
          {error && <p className="rounded-xl bg-[rgba(212,105,63,0.12)] px-3 py-2 text-sm text-ember">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy && <Spinner size={15} />} {t.submit[mode]}
          </button>
          <div className="flex flex-wrap justify-between gap-2 pt-1 text-sm">
            {mode !== 'in' ? (
              <button type="button" className="text-dusk hover:underline" onClick={() => setMode('in')}>
                {t.switchToIn}
              </button>
            ) : (
              <button type="button" className="text-dusk hover:underline" onClick={() => setMode('up')}>
                {t.switchToUp}
              </button>
            )}
            {mode === 'in' && (
              <button type="button" className="text-ink-3 hover:underline" onClick={() => setMode('reset')}>
                {t.forgot}
              </button>
            )}
          </div>
        </form>
      )}
    </Dialog>
  )
}

export function NewPasswordDialog() {
  const recovery = usePoetry((s) => s.auth.recovery)
  const setNewPassword = usePoetry((s) => s.setNewPassword)
  const toast = useStore((s) => s.toast)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await setNewPassword(password)
      toast(copy.newPassword.done)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={recovery} onClose={() => usePoetry.setState((s) => ({ auth: { ...s.auth, recovery: false } }))} title={copy.newPassword.title} width="max-w-md">
      <form onSubmit={submit} className="space-y-3">
        <input className="field" type="password" minLength={6} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label={copy.newPassword.label} />
        {error && <p className="text-sm text-ember">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy && <Spinner size={15} />} <KeyRound size={15} /> {copy.newPassword.save}
        </button>
      </form>
    </Dialog>
  )
}

export function AccountBar() {
  const auth = usePoetry((s) => s.auth)
  const guestCount = usePoetry((s) => s.guestCount)
  const importGuest = usePoetry((s) => s.importGuest)
  const signOut = usePoetry((s) => s.signOut)
  const toast = useStore((s) => s.toast)
  const [open, setOpen] = useState(false)
  const [moving, setMoving] = useState(false)

  if (auth.status === 'unavailable')
    return <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-2">{copy.account.unavailable}</p>

  const move = async () => {
    setMoving(true)
    try {
      const n = await importGuest()
      toast(copy.account.moved(n))
    } catch (err) {
      toast(copy.account.moveFailed(err.message), { tone: 'error' })
    } finally {
      setMoving(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface/60 px-4 py-3 sm:flex-row sm:items-center">
        <Cloud size={18} className={auth.status === 'signedIn' ? 'text-sage' : 'text-ink-3'} />
        <p className="flex-1 text-sm text-ink-2">
          {auth.status === 'loading'
            ? copy.account.checking
            : auth.status === 'signedIn'
              ? copy.account.synced(auth.user.email)
              : copy.account.guest}
        </p>
        <div className="flex flex-wrap gap-2">
          {auth.status === 'signedIn' && guestCount > 0 && (
            <button className="btn btn-sm btn-primary" onClick={move} disabled={moving}>
              {moving && <Spinner size={13} />} Pasar {guestCount} {guestCount === 1 ? 'poema' : 'poemas'} de este navegador
            </button>
          )}
          {auth.status === 'signedIn' ? (
            <button className="btn btn-sm" onClick={() => signOut()}>
              <LogOut size={14} /> {copy.account.signOut}
            </button>
          ) : (
            auth.status === 'signedOut' && (
              <button className="btn btn-sm btn-ink" onClick={() => setOpen(true)}>
                {copy.account.signIn}
              </button>
            )
          )}
        </div>
      </div>
      <AuthDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
