import { useState } from 'react'
import { motion } from 'motion/react'
import { Wordmark } from '../layout/AppShell'
import StringLights from '../ui/StringLights'
import { AuthDialog, GoogleButton } from '../poetry/AuthPanel'
import { auth } from '../../lib/copy'

/** Shown instead of the app when the server requires a signed-in account. */
export default function LoginScreen() {
  const [email, setEmail] = useState(false)
  const t = auth.login
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-10">
      <StringLights swags={4} perSwag={8} height={64} className="pointer-events-none absolute inset-x-0 top-0 opacity-90" />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-sm text-center">
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>
        <h1 className="font-display text-[2.4rem] leading-[1.02] font-light text-balance">
          {t.title[0]} <em className="display-wonk">{t.title[1]}</em>
        </h1>
        <p className="mt-4 text-sm text-ink-2">{t.subtitle}</p>
        <div className="mt-8 space-y-3">
          <GoogleButton />
          <button className="btn w-full justify-center" onClick={() => setEmail(true)}>
            {t.withEmail}
          </button>
        </div>
        <p className="mt-8 text-xs text-ink-3">{t.footnote}</p>
      </motion.div>
      <AuthDialog open={email} onClose={() => setEmail(false)} />
    </div>
  )
}
