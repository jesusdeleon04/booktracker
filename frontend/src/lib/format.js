const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseDate(iso) {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m) return null
  return new Date(y, m - 1, d || 1)
}

export function formatDate(iso, { withYear = true } = {}) {
  const d = parseDate(iso)
  if (!d) return ''
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}${withYear ? ` de ${d.getFullYear()}` : ''}`
}

export function mastheadDate(date = new Date()) {
  return `${DAYS[date.getDay()]} ${date.getDate()} · ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

export function greeting(date = new Date()) {
  const h = date.getHours()
  if (h < 6) return 'Buenas noches'
  if (h < 13) return 'Buenos días'
  if (h < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

export function plural(n, one, many) {
  return `${n.toLocaleString('es-ES')} ${n === 1 ? one : many}`
}

export function num(n) {
  return (n || 0).toLocaleString('es-ES')
}

export function authorsLine(authors, max = 2) {
  if (!authors?.length) return 'Autor desconocido'
  if (authors.length <= max) return authors.join(', ')
  return `${authors.slice(0, max).join(', ')} y ${authors.length - max} más`
}

export function ratingLabel(r) {
  if (r == null) return ''
  return `${String(r).replace('.', ',')}`
}

export function monthName(i) {
  return MONTHS[i]
}

export function daysBetween(a, b) {
  const da = parseDate(a)
  const db = parseDate(b)
  if (!da || !db) return null
  return Math.round((db - da) / 86400000)
}

export const STATUS = {
  want: { label: 'Quiero leer', short: 'Pendiente', color: 'var(--dusk)', soft: 'var(--dusk-soft)' },
  reading: { label: 'Leyendo', short: 'Leyendo', color: 'var(--accent)', soft: 'var(--accent-soft)' },
  read: { label: 'Leído', short: 'Leído', color: 'var(--sage)', soft: 'var(--sage-soft)' },
}

const LANG_HINTS = {
  es: [' el ', ' la ', ' los ', ' que ', ' una ', ' del ', ' por ', ' con ', ' su ', ' es '],
  en: [' the ', ' and ', ' of ', ' is ', ' to ', ' with ', ' his ', ' her ', ' that ', ' this '],
  pt: [' um ', ' uma ', ' não ', ' com ', ' os ', ' das ', ' ao ', ' sua ', ' são ', ' pela '],
  fr: [' le ', ' les ', ' des ', ' une ', ' est ', ' et ', ' du ', ' dans ', ' qui ', ' sur '],
  it: [' il ', ' gli ', ' della ', ' che ', ' una ', ' è ', ' nel ', ' sono ', ' per ', ' degli '],
  de: [' der ', ' die ', ' und ', ' das ', ' ist ', ' nicht ', ' mit ', ' ein ', ' eine ', ' sich '],
}
const LANG_NAMES = { es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés', it: 'italiano', de: 'alemán' }

/** Very small stop-word heuristic to tell the reader a synopsis isn't in Spanish. */
export function guessLanguage(text) {
  if (!text || text.length < 80) return null
  const t = ` ${text.toLowerCase().replace(/[.,;:!?()«»"“”]/g, ' ')} `
  let best = null
  let bestScore = 0
  for (const [lang, words] of Object.entries(LANG_HINTS)) {
    const score = words.reduce((n, w) => n + (t.split(w).length - 1), 0)
    if (score > bestScore) {
      best = lang
      bestScore = score
    }
  }
  return bestScore >= 3 ? best : null
}

export function languageNote(text, preferred = 'es') {
  const lang = guessLanguage(text)
  if (!lang || preferred === 'any' || lang === preferred) return null
  return `Sinopsis original en ${LANG_NAMES[lang]}: es la única disponible en las fuentes.`
}
