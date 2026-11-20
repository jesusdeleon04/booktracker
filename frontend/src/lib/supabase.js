// Centralised Supabase client for Booktracker.
//
// Every module that talks to Supabase (auth, future library sync, storage…)
// should import from here instead of calling createClient() itself, so there is
// exactly one client, one session and one place to configure it.
//
// Configuration comes from Vite env vars (frontend/.env.local):
//   VITE_SUPABASE_URL              https://<project-ref>.supabase.co
//   VITE_SUPABASE_PUBLISHABLE_KEY  sb_publishable_...
// The publishable key is safe in the browser: data access is governed by Row
// Level Security. Secret / service_role keys must never be used here.
//
// Nothing in the app uses this client yet — the current data still lives in
// the Flask + SQLite backend. This module only prepares the connection.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

if (publishableKey && /^sb_secret_|service_role/.test(publishableKey)) {
  // Fail loudly rather than ship an admin credential to the browser.
  throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY contiene una clave secreta. Usa la clave publicable (sb_publishable_...).')
}

export const supabaseConfig = Object.freeze({
  url: url || null,
  projectRef: url ? new URL(url).hostname.split('.')[0] : null,
  configured: Boolean(url && publishableKey),
})

export const supabase = supabaseConfig.configured
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'booktracker-auth',
      },
      global: { headers: { 'x-client-info': 'booktracker-web' } },
    })
  : null

/** Returns the client or throws a clear error when the env vars are missing. */
export function getSupabase() {
  if (!supabase) {
    throw new Error('Supabase no está configurado: define VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en frontend/.env.local.')
  }
  return supabase
}

/**
 * Read-only connectivity check against the project's Auth health endpoint.
 * It does not touch the database and needs no tables.
 */
export async function checkSupabaseConnection({ timeoutMs = 8000 } = {}) {
  if (!supabaseConfig.configured) return { ok: false, reason: 'not-configured' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const started = performance.now()
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: publishableKey },
      signal: ctrl.signal,
    })
    const body = await res.json().catch(() => null)
    return {
      ok: res.ok,
      status: res.status,
      projectRef: supabaseConfig.projectRef,
      latencyMs: Math.round(performance.now() - started),
      auth: body ? { name: body.name, version: body.version } : null,
    }
  } catch (err) {
    return { ok: false, reason: err.name === 'AbortError' ? 'timeout' : err.message }
  } finally {
    clearTimeout(timer)
  }
}
