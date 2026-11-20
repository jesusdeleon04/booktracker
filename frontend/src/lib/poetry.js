// Poetry library: API client, reader preferences and small helpers.
import { api } from './api'

const J_KEY = 'bt-poetry-jurisdiction'
const READER_KEY = 'bt-poetry-reader'

export const JURISDICTIONS = [
  { key: 'intl', label: 'Internacional (prudente: vida + 80)' },
  { key: 'es', label: 'España' },
  { key: 'mx', label: 'México' },
  { key: 'co', label: 'Colombia' },
  { key: 'ar', label: 'Argentina' },
  { key: 'cl', label: 'Chile' },
  { key: 'pe', label: 'Perú' },
  { key: 'uy', label: 'Uruguay' },
  { key: 've', label: 'Venezuela' },
  { key: 'eu', label: 'Unión Europea' },
  { key: 'us', label: 'Estados Unidos' },
]

export const LANGS = [
  { key: 'es', label: 'Español' },
  { key: 'en', label: 'Inglés' },
  { key: 'fr', label: 'Francés' },
  { key: 'de', label: 'Alemán' },
]
export const LANG_NAME = { es: 'español', en: 'inglés', fr: 'francés', de: 'alemán' }

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode: preferences simply don't persist */
  }
}

export function getJurisdiction() {
  const j = read(J_KEY, 'intl')
  return JURISDICTIONS.some((x) => x.key === j) ? j : 'intl'
}
export function setJurisdiction(j) {
  write(J_KEY, j)
  window.dispatchEvent(new CustomEvent('bt-poetry-jurisdiction', { detail: j }))
}

export const READER_DEFAULTS = { size: 20, paper: 'crema', font: 'garamond', width: 'medio', align: 'center' }
export const PAPERS = {
  crema: { label: 'Crema', className: 'poem-paper-crema' },
  marfil: { label: 'Marfil', className: 'poem-paper-marfil' },
  sepia: { label: 'Sepia', className: 'poem-paper-sepia' },
  pergamino: { label: 'Pergamino', className: 'poem-paper-pergamino' },
  noche: { label: 'Hora azul', className: 'poem-paper-noche' },
}
export const FONTS = {
  garamond: { label: 'Garamond', family: 'var(--font-serif)' },
  cormorant: { label: 'Cormorant', family: 'var(--font-display)' },
  courier: { label: 'Máquina', family: 'var(--font-mono)' },
  sans: { label: 'Sans', family: 'var(--font-sans)' },
}
export const WIDTHS = { estrecho: { label: 'Estrecho', max: '30rem' }, medio: { label: 'Medio', max: '38rem' }, amplio: { label: 'Amplio', max: '50rem' } }

export function getReaderPrefs() {
  return { ...READER_DEFAULTS, ...read(READER_KEY, {}) }
}
export function saveReaderPrefs(prefs) {
  write(READER_KEY, prefs)
}

const withJ = (params = {}) => ({ ...params, j: getJurisdiction() })

export const poetryApi = {
  meta: () => api.get('/poetry/meta'),
  interpret: (q, signal) => api.get('/poetry/interpret', { q }, { signal }),
  search: (params, signal) => api.get('/poetry/search', withJ(params), { signal }),
  poem: (id, signal) => api.get(`/poetry/poems/${encodeURIComponent(id)}`, withJ(), { signal }),
  author: (qid, signal) => api.get(`/poetry/authors/${encodeURIComponent(qid)}`, withJ(), { signal }),
  poets: (params, signal) => api.get('/poetry/poets', withJ(params), { signal }),
  explore: (signal) => api.get('/poetry/explore', withJ(), { signal }),
  daily: (signal) => api.get('/poetry/daily', withJ(), { signal }),
  random: (lang) => api.get('/poetry/random', withJ({ lang })),
}

/** "1836–1870", "c. 650 a. C. – 570 a. C.", "1914–1998", "n. 1936". */
export function lifespan(p) {
  if (!p) return ''
  const y = (v) => (v == null ? '' : v < 0 ? `${-v} a. C.` : String(v))
  const { birthYear: b, deathYear: d } = p
  if (b != null && d != null) return b < 0 || d < 0 ? `${y(b)} – ${y(d)}` : `${b}–${d}`
  if (d != null) return `† ${y(d)}`
  if (b != null) return `n. ${y(b)}`
  return ''
}

export const RIGHTS_TONE = {
  public_domain: { color: 'var(--sage)', soft: 'var(--sage-soft)', short: 'Dominio público' },
  open_license: { color: 'var(--dusk)', soft: 'var(--dusk-soft)', short: 'Licencia abierta' },
  protected: { color: 'var(--ember)', soft: 'rgba(212, 105, 63, 0.12)', short: 'Protegido' },
  unknown: { color: 'var(--text-3)', soft: 'var(--surface-2)', short: 'Por verificar' },
}

export const isFree = (rights) => Boolean(rights?.allowsFullText)

/** Split verse lines into stanzas (empty line = stanza break). */
export function stanzas(lines) {
  const out = [[]]
  for (const l of lines || []) {
    if (!l.trim()) {
      if (out[out.length - 1].length) out.push([])
    } else out[out.length - 1].push(l)
  }
  return out.filter((s) => s.length)
}

/** Leading spaces → indentation in `ch`; the rest of the line. */
export function splitIndent(line) {
  const m = /^( *)(.*)$/.exec(line)
  return { indent: m[1].length, text: m[2] }
}

export function poemPath(id) {
  return `/poesia/poema/${encodeURIComponent(id)}`
}

export function authorPath(qid) {
  return `/poesia/autor/${qid}`
}

/** Plain-text quotation with attribution (only for free texts). */
export function quotation(rec) {
  if (!rec?.lines) return ''
  return `${rec.lines.join('\n')}\n\n— ${rec.attribution}`
}

/** "Les Fleurs du mal (1861)" or "Rimas · 1871", without repeating the year. */
export function pubLine(rec) {
  const coll = rec?.collection || ''
  const year = rec?.year && !coll.includes(String(rec.year)) ? rec.year : null
  return [coll, year].filter(Boolean).join(' · ')
}
