// Client-side matching between catalog results and library books, mirroring
// the backend's duplicate detection (ids, ISBN, normalised title + author).

export function fold(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const ARTICLES = new Set(['el', 'la', 'los', 'las', 'lo', 'un', 'una', 'y', 'de', 'del', 'the', 'a', 'an', 'of', 'and', 'le', 'les', 'l', 'il', 'der', 'die', 'das', 'o', 'e'])

function translit(s) {
  return s
    .replaceAll('sky', 'ski')
    .replaceAll('skii', 'ski')
    .replaceAll('y', 'i')
    .replaceAll('ck', 'k')
    .replaceAll('ph', 'f')
    .replaceAll('th', 't')
    .replaceAll('w', 'v')
    .replaceAll('j', 'i')
    .replace(/(.)\1/g, '$1')
}

export function authorKey(name) {
  if (!name) return ''
  if (name.includes(',')) return translit(fold(name.split(',')[0]).split(' ').pop())
  return translit(fold(name).split(' ').pop())
}

function baseTitle(title) {
  return fold((title || '').split(/\s[:\-–—]\s|:\s|\s\(/)[0])
}

export function looseKey(title, authors) {
  const words = baseTitle(title)
    .split(' ')
    .filter((w) => w && !ARTICLES.has(w))
    .sort()
  return `${words.join(' ')}|${authorKey(authors?.[0])}`
}

export function buildLibraryIndex(books) {
  const index = new Map()
  for (const b of books) {
    const keys = [b.dedupeKey, b.catalogId, b.olWorkKey && `ol:${b.olWorkKey}`, b.googleId && `gb:${b.googleId}`, b.isbn13 && `isbn:${b.isbn13}`, `loose:${looseKey(b.title, b.authors)}`]
    keys.filter(Boolean).forEach((k) => index.set(k, b))
  }
  return index
}

export function findInIndex(index, item) {
  if (!item) return null
  const keys = [item.id, item.dedupeKey, item.olWorkKey && `ol:${item.olWorkKey}`, item.googleId && `gb:${item.googleId}`, item.isbn13 && `isbn:${item.isbn13}`, `loose:${looseKey(item.title, item.authors)}`]
  for (const k of keys) {
    if (k && index.has(k)) return index.get(k)
  }
  return null
}

export function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < (s || '').length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}
