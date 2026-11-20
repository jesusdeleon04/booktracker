// Writer's Studio helpers: API calls, local drafts, text statistics, image prep.
import { api, ApiError, authHeaders } from './api'

export const studioApi = {
  overview: () => api.get('/studio'),
  get: (id) => api.get(`/studio/writings/${id}`),
  create: (data) => api.post('/studio/writings', data),
  patch: (id, data) => api.patch(`/studio/writings/${id}`, data),
  remove: (id) => api.del(`/studio/writings/${id}`),
  order: (ids) => api.post('/studio/order', { ids }),
  createCategory: (data) => api.post('/studio/categories', data),
  updateCategory: (id, data) => api.patch(`/studio/categories/${id}`, data),
  deleteCategory: (id, moveTo) => api.del(`/studio/categories/${id}${moveTo ? `?moveTo=${moveTo}` : ''}`),
  images: () => api.get('/studio/images'),
  deleteImage: (id, force = false) => api.del(`/studio/images/${id}${force ? '?force=1' : ''}`),
  async uploadImage(blob, { width, height, name = 'portada' } = {}) {
    const form = new FormData()
    form.append('file', blob, name)
    if (width) form.append('width', String(width))
    if (height) form.append('height', String(height))
    let res
    try {
      res = await fetch('/api/studio/images', { method: 'POST', body: form, headers: authHeaders() })
    } catch {
      throw new ApiError('No se pudo conectar con el servidor para subir la imagen.', 0)
    }
    const payload = await res.json().catch(() => null)
    if (!res.ok || payload?.ok === false) throw new ApiError(payload?.error || `Error ${res.status}`, res.status, payload)
    return payload.data
  },
}

// ─── text statistics ────────────────────────────────────────────────────────

export function textStats(text = '') {
  const words = (text.match(/\S+/g) || []).length
  return {
    words,
    chars: text.length,
    charsNoSpaces: text.replace(/\s/g, '').length,
    // ~200 palabras por minuto, a ritmo de lectura atenta
    minutes: words ? Math.max(1, Math.round(words / 200)) : 0,
  }
}

export function displayTitle(w) {
  if (w.title?.trim()) return w.title.trim()
  const first = (w.excerpt || w.content || '').trim().split('\n')[0]
  return first ? `${first.slice(0, 48)}${first.length > 48 ? '…' : ''}` : 'Sin título'
}

// ─── dates ──────────────────────────────────────────────────────────────────

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function parseIso(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

export function clock(d) {
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export function longDate(iso) {
  const d = parseIso(iso)
  if (!d) return ''
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`
}

export function shortDate(iso) {
  const d = parseIso(iso)
  if (!d) return ''
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${sameYear ? '' : ` ${d.getFullYear()}`}`
}

/** "hace un momento", "hace 12 min", "hoy a las 21:04", "ayer a las 9:10", "3 nov" */
export function relativeTime(iso) {
  const d = parseIso(iso)
  if (!d) return ''
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 45) return 'hace un momento'
  if (diff < 3600) return `hace ${Math.round(diff / 60)} min`
  const today = new Date()
  const yesterday = new Date(Date.now() - 86400000)
  if (d.toDateString() === today.toDateString()) return `hoy a las ${clock(d)}`
  if (d.toDateString() === yesterday.toDateString()) return `ayer a las ${clock(d)}`
  return shortDate(iso)
}

// ─── local drafts (crash recovery) ──────────────────────────────────────────
// Every keystroke batch is mirrored in localStorage before it reaches the
// server, so closing the tab or losing the connection never loses text.

const DRAFT_PREFIX = 'bt-studio-draft:'

export const drafts = {
  read(id) {
    try {
      const raw = localStorage.getItem(DRAFT_PREFIX + id)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },
  write(id, data) {
    try {
      localStorage.setItem(DRAFT_PREFIX + id, JSON.stringify({ ...data, savedLocalAt: Date.now() }))
      return true
    } catch {
      return false // private mode or quota: the server copy still exists
    }
  },
  clear(id) {
    try {
      localStorage.removeItem(DRAFT_PREFIX + id)
    } catch {
      /* ignore */
    }
  },
  move(from, to, extra = {}) {
    const d = drafts.read(from)
    drafts.clear(from)
    if (d) drafts.write(to, { ...d, ...extra })
  },
}

/** A unique key per new-writing session: creating twice yields one writing. */
export function newClientKey() {
  return globalThis.crypto?.randomUUID?.() || `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export const studioPrefs = {
  read() {
    try {
      return { sound: false, guide: true, counters: true, eyeLevel: true, size: 'm', ...JSON.parse(localStorage.getItem('bt-studio-prefs') || '{}') }
    } catch {
      return { sound: false, guide: true, counters: true, eyeLevel: true, size: 'm' }
    }
  },
  write(prefs) {
    try {
      localStorage.setItem('bt-studio-prefs', JSON.stringify(prefs))
    } catch {
      /* ignore */
    }
  },
}

export function lastCategory() {
  try {
    return Number(localStorage.getItem('bt-studio-last-category')) || null
  } catch {
    return null
  }
}
export function rememberCategory(id) {
  try {
    localStorage.setItem('bt-studio-last-category', String(id))
  } catch {
    /* ignore */
  }
}

// ─── images ─────────────────────────────────────────────────────────────────

/** Downscale big photos in the browser before uploading (keeps covers light). */
export async function prepareImage(file, maxSide = 1600) {
  if (!file?.type?.startsWith('image/')) throw new Error('El archivo no es una imagen.')
  if (file.type === 'image/gif') return { blob: file, width: null, height: null, name: file.name }
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    if (/image\/(jpeg|png|webp)/.test(file.type)) return { blob: file, width: null, height: null, name: file.name }
    throw new Error('Este formato de imagen no se puede leer en el navegador. Prueba con JPG o PNG.')
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86))
  const finalBlob = blob || (await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88)))
  return { blob: finalBlob, width, height, name: (file.name || 'portada').replace(/\.\w+$/, '') + '.webp' }
}

export const CATEGORY_COLORS = ['#B07A9E', '#93ABD4', '#A1B47F', '#E9A34F', '#D4693F', '#C4B19A', '#D8B46E', '#7FB0A8', '#F2C14E', '#8C7964', '#C2566B', '#5E8C7A']
