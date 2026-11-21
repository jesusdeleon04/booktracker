// Tertulia: API client and small shared definitions.
import { api, ApiError, authHeaders } from './api'

export const socialApi = {
  me: () => api.get('/social/me'),
  updateMe: (body) => api.patch('/social/me', body),
  deleteAvatar: () => api.del('/social/me/avatar'),
  async uploadAvatar(blob) {
    const form = new FormData()
    form.append('file', blob, 'avatar.webp')
    let res
    try {
      res = await fetch('/api/social/me/avatar', { method: 'POST', body: form, headers: authHeaders() })
    } catch {
      throw new ApiError('No se pudo conectar con el servidor para subir la imagen.', 0)
    }
    const payload = await res.json().catch(() => null)
    if (!res.ok || payload?.ok === false) throw new ApiError(payload?.error || `Error ${res.status}`, res.status, payload)
    return payload.data
  },
  summary: () => api.get('/social/summary'),
  notifications: (offset = 0, limit = 20) => api.get('/social/notifications', { offset, limit }),
  markRead: (body) => api.post('/social/notifications/read', body),
  search: (q, signal) => api.get('/social/search', { q }, { signal }),
  lookup: (email) => api.post('/social/lookup', { email }),
  person: (username) => api.get(`/social/people/${encodeURIComponent(username)}`),
  friends: (params = {}) => api.get('/social/friends', params),
  requests: () => api.get('/social/requests'),
  sendRequest: (userId) => api.post('/social/requests', { userId }),
  accept: (id) => api.post(`/social/requests/${id}/accept`),
  decline: (id) => api.post(`/social/requests/${id}/decline`),
  cancel: (id) => api.del(`/social/requests/${id}`),
  removeFriend: (userId) => api.del(`/social/friends/${userId}`),
  blocks: () => api.get('/social/blocks'),
  block: (userId) => api.post('/social/blocks', { userId }),
  unblock: (userId) => api.del(`/social/blocks/${userId}`),
  shareBook: (body) => api.post('/social/books', body),
  sharePoem: (body) => api.post('/social/poems', body),
  shared: (params) => api.get('/social/shared', params),
  sharedItem: (kind, id) => api.get(`/social/shared/${kind}/${id}`),
  react: (kind, id, body) => api.post(`/social/shared/${kind}/${id}/react`, body),
  markSaved: (kind, id, body = {}) => api.post(`/social/shared/${kind}/${id}/saved`, body),
  hideShared: (kind, id) => api.post(`/social/shared/${kind}/${id}/hide`),
}

export const lettersApi = {
  send: (body) => api.post('/letters', body),
  list: (params) => api.get('/letters', params),
  get: (id) => api.get(`/letters/${id}`),
  read: (id) => api.post(`/letters/${id}/read`),
  hide: (id) => api.post(`/letters/${id}/hide`),
  byWriting: (id) => api.get(`/letters/by-writing/${id}`),
  /** Letter covers are private: fetched with the session and shown from memory. */
  async coverUrl(url) {
    const res = await fetch(url, { headers: authHeaders() })
    if (!res.ok) throw new ApiError('No se pudo cargar la portada.', res.status)
    return URL.createObjectURL(await res.blob())
  },
}

export const STATIONERY = {
  marfil: { label: 'Marfil', hint: 'La hoja de siempre, recién salida del rodillo.' },
  verjurado: { label: 'Verjurado', hint: 'Papel de hilos, como el de las cartas de antes.' },
  aerograma: { label: 'Aerograma', hint: 'Papel azul de correo aéreo con su ribete.' },
  sepia: { label: 'Sepia', hint: 'Una hoja que parece haber esperado años.' },
  noche: { label: 'Hora azul', hint: 'Tinta clara sobre papel de noche.' },
}

export const SEALS = {
  lacre: { label: 'Lacre rojo', color: '#9e2b25' },
  azul: { label: 'Azul tinta', color: '#2c4a78' },
  verde: { label: 'Verde musgo', color: '#3d6647' },
  oro: { label: 'Oro viejo', color: '#a8812f' },
}

export const REACTIONS = {
  book: [
    { key: 'gracias', label: 'Gracias' },
    { key: 'lo_leere', label: 'Lo leeré pronto' },
    { key: 'me_encanta', label: 'Me encanta la idea' },
    { key: 'ya_lo_lei', label: 'Ya lo había leído' },
  ],
  poem: [
    { key: 'gracias', label: 'Gracias' },
    { key: 'conmovido', label: 'Me ha conmovido' },
    { key: 'me_encanta', label: 'Me encanta' },
  ],
}

export function newKey() {
  return globalThis.crypto?.randomUUID?.() || `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export function initials(name = '') {
  return (
    name
      .replace(/^@/, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '·'
  )
}

const rtf = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat('es', { numeric: 'auto' }) : null

/** "hace 3 horas", "ayer", "12 de marzo". */
export function when(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = (d.getTime() - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (rtf && abs < 60) return 'ahora mismo'
  if (rtf && abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (rtf && abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (rtf && abs < 86400 * 6) return rtf.format(Math.round(diff / 86400), 'day')
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

export function longDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/** The notification line for each kind (no letter content ever goes here). */
export function noticeText(n) {
  const who = n.actor?.name || 'Alguien'
  switch (n.kind) {
    case 'friend_request':
      return { who, text: 'quiere sumarte a su tertulia.', to: '/tertulia/amigos' }
    case 'friend_accept':
      return { who, text: 'aceptó tu solicitud. Ya sois amigos.', to: n.actor?.username ? `/tertulia/lector/${n.actor.username}` : '/tertulia/amigos' }
    case 'book':
      return { who, text: 'te recomienda un libro.', to: `/tertulia/obsequios?abrir=book-${n.refId}` }
    case 'poem':
      return { who, text: 'comparte un poema contigo.', to: `/tertulia/obsequios?abrir=poem-${n.refId}` }
    case 'letter':
      return { who, text: 'te ha escrito una carta.', to: `/tertulia/cartas/${n.refId}` }
    case 'book_reply':
      return { who, text: 'respondió a tu recomendación.', to: '/tertulia/obsequios?caja=enviados' }
    case 'poem_reply':
      return { who, text: 'respondió al poema que le enviaste.', to: '/tertulia/obsequios?caja=enviados' }
    default:
      return { who, text: 'tiene algo para ti.', to: '/tertulia' }
  }
}
