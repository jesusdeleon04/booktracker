// Thin fetch wrapper around the Booktracker API (/api is proxied to Flask in dev).
import { supabase } from './supabase'
import { errors } from './copy'

let cachedToken = null
if (supabase) {
  supabase.auth.getSession().then(({ data }) => (cachedToken = data.session?.access_token || null)).catch(() => {})
  supabase.auth.onAuthStateChange((_event, session) => (cachedToken = session?.access_token || null))
}

/** Login header for the Booktracker API (synchronous: also usable while the page unloads). */
export function authHeaders() {
  return cachedToken ? { Authorization: `Bearer ${cachedToken}` } : {}
}

async function freshAuthHeaders() {
  if (!supabase) return {}
  try {
    // getSession refreshes an expired token before we use it.
    const { data } = await supabase.auth.getSession()
    cachedToken = data.session?.access_token || null
  } catch {
    /* keep whatever we had */
  }
  return authHeaders()
}

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

async function request(method, path, { params, body, signal } = {}) {
  let url = `/api${path}`
  if (params) {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v)
    })
    const s = qs.toString()
    if (s) url += `?${s}`
  }
  let res
  try {
    res = await fetch(url, {
      method,
      signal,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(await freshAuthHeaders()) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError(errors.server, 0)
  }
  let payload = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }
  if (!res.ok || (payload && payload.ok === false)) {
    throw new ApiError(payload?.error || `Error ${res.status}`, res.status, payload)
  }
  return payload ? payload.data : null
}

export const api = {
  get: (path, params, opts) => request('GET', path, { params, ...opts }),
  post: (path, body, opts) => request('POST', path, { body: body ?? {}, ...opts }),
  patch: (path, body) => request('PATCH', path, { body }),
  del: (path) => request('DELETE', path),

  // catalog
  search: (q, signal) => request('GET', '/catalog/search', { params: { q, limit: 20 }, signal }),
  catalogBook: (id) => request('GET', '/catalog/book', { params: { id } }),
  authors: (q, signal) => request('GET', '/catalog/authors', { params: { q }, signal }),

  // discover
  discoverPlan: () => request('GET', '/discover'),
  section: (key, seed = 0) => request('GET', '/discover/section', { params: { key, seed } }),
  similar: (params) => request('GET', '/discover/similar', { params }),
  explore: (kind, key, page = 1) => request('GET', '/explore', { params: { kind, key, page } }),
}
