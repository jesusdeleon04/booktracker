// "Mi colección de poesía": storage adapters with one interface.
//
//  * cloud  — Supabase (signed-in user). Rows are protected by RLS; the poem's
//             bibliographic data lives once in the shared catalog
//             (poetry_poems / poetry_authors) and the user's collection only
//             points to it. Covers go to the private `poetry-covers` bucket.
//  * guest  — this browser only (localStorage), so the feature works before the
//             user creates an account; items can be moved to the cloud later.
//
// Full texts are stored only when the poem is free in every jurisdiction the
// app knows (rights.universal); otherwise only the reference is kept.
import { getSupabase, supabaseConfig } from './supabase'

export const DEFAULT_CATEGORIES = [
  { name: 'Amor', color: '#c97a7a' },
  { name: 'Melancolía', color: '#7d8fb3' },
  { name: 'Existencialismo', color: '#9a8bb0' },
  { name: 'Naturaleza', color: '#7fa07a' },
  { name: 'Espiritualidad', color: '#c9a35f' },
  { name: 'Soledad', color: '#6f8f99' },
  { name: 'Otros', color: '#8a8478' },
]
export const CATEGORY_COLORS = ['#c97a7a', '#7d8fb3', '#9a8bb0', '#7fa07a', '#c9a35f', '#6f8f99', '#8a8478', '#c4865a', '#5f8f86', '#a07a9a']
const FREE = ['public_domain', 'open_license']

/** Catalog payload for a poem record from the API (never protected text). */
export function catalogPayload(rec) {
  const storeText = Boolean(rec.lines && rec.rights?.allowsFullText && rec.rights?.universal && FREE.includes(rec.rights.status))
  const first = storeText ? rec.lines.find((l) => l.trim())?.trim() || null : null
  return {
    source: rec.ref.source,
    sourceId: rec.id,
    sourceName: rec.source.name,
    sourceUrl: rec.source.pageUrl,
    title: rec.title,
    language: rec.lang,
    collection: rec.collection || null,
    year: rec.year ?? null,
    linecount: rec.linecount ?? null,
    translatorName: rec.translator?.name || null,
    author: rec.author
      ? { qid: rec.author.qid || null, name: rec.author.name, birthYear: rec.author.birthYear ?? null, deathYear: rec.author.deathYear ?? null, image: rec.author.image || null }
      : null,
    rightsStatus: rec.rights.status,
    rightsNote: (rec.rights.explanation || '').slice(0, 2000),
    license: rec.rights.license || null,
    licenseUrl: rec.rights.licenseUrl || null,
    text: storeText ? rec.lines.join('\n') : null,
    firstLine: first,
  }
}

const now = () => new Date().toISOString()

// ── normalisation ──────────────────────────────────────────────────────────

function fromCloud(row, signed = {}) {
  const p = row.poem || {}
  const a = p.author || null
  return {
    id: row.id,
    pid: p.source_id,
    poemId: p.id,
    title: p.title,
    author: a ? { qid: a.wikidata_id, name: a.name, birthYear: a.birth_year, deathYear: a.death_year, image: a.image_url } : p.author_name ? { name: p.author_name } : null,
    translatorName: p.translator_name,
    language: p.language,
    collection: p.collection,
    year: p.year,
    linecount: p.linecount,
    firstLine: p.first_line,
    text: p.text,
    sourceName: p.source_name,
    sourceUrl: p.source_url,
    rightsStatus: p.rights_status,
    rightsNote: p.rights_note,
    license: p.license,
    categoryId: row.category_id,
    isFavorite: row.is_favorite,
    coverPath: row.cover_path,
    coverUrl: row.cover_path ? signed[row.cover_path] || null : null,
    savedAt: row.saved_at,
    updatedAt: row.updated_at,
    notes: (row.notes || [])
      .map((n) => ({ id: n.id, body: n.body, createdAt: n.created_at, updatedAt: n.updated_at }))
      .sort((x, y) => x.createdAt.localeCompare(y.createdAt)),
  }
}

const ITEM_SELECT =
  'id,category_id,is_favorite,cover_path,saved_at,updated_at,' +
  'poem:poetry_poems(id,source,source_id,source_name,source_url,title,author_name,translator_name,language,collection,year,linecount,first_line,rights_status,rights_note,license,license_url,text,' +
  'author:poetry_authors(wikidata_id,name,birth_year,death_year,image_url)),' +
  'notes:poetry_notes(id,body,created_at,updated_at)'

function check({ data, error }) {
  if (error) throw new Error(friendly(error))
  return data
}

function friendly(error) {
  const msg = error?.message || String(error)
  if (/JWT|session|not authenticated|Inicia sesión/i.test(msg)) return 'Tu sesión ha caducado. Vuelve a iniciar sesión.'
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'No hay conexión con Supabase. Revisa tu conexión a internet.'
  if (/duplicate key|unique/i.test(msg)) return 'Ya existe un elemento con ese nombre.'
  return msg
}

async function signCovers(sb, paths) {
  const list = [...new Set(paths.filter(Boolean))]
  if (!list.length) return {}
  const { data } = await sb.storage.from('poetry-covers').createSignedUrls(list, 60 * 60 * 12)
  return Object.fromEntries((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]))
}

// ── cloud adapter ──────────────────────────────────────────────────────────

export const cloud = {
  kind: 'cloud',
  async load() {
    const sb = getSupabase()
    check(await sb.rpc('poetry_ensure_default_categories'))
    const [cats, rows] = await Promise.all([
      sb.from('poetry_categories').select('id,name,color,position,created_at').order('position').order('created_at'),
      sb.from('poetry_collection').select(ITEM_SELECT).order('saved_at', { ascending: false }),
    ])
    const categories = check(cats).map((c) => ({ id: c.id, name: c.name, color: c.color, position: c.position }))
    const data = check(rows)
    const signed = await signCovers(sb, data.map((r) => r.cover_path))
    return { categories, items: data.map((r) => fromCloud(r, signed)) }
  },
  async save(rec, { categoryId = null } = {}) {
    const sb = getSupabase()
    const poemId = check(await sb.rpc('poetry_save_poem', { p: catalogPayload(rec) }))
    if (!poemId) throw new Error('No se pudo registrar el poema en el catálogo.')
    const row = check(
      await sb.from('poetry_collection').upsert({ poem_id: poemId, category_id: categoryId }, { onConflict: 'user_id,poem_id' }).select(ITEM_SELECT).single(),
    )
    return fromCloud(row)
  },
  async saveSnapshot(item) {
    // Used to move guest items: rebuild a minimal record from the stored snapshot.
    return cloud.save(snapshotToRecord(item), { categoryId: null })
  },
  async update(item, patch) {
    const sb = getSupabase()
    const body = {}
    if ('categoryId' in patch) body.category_id = patch.categoryId
    if ('isFavorite' in patch) body.is_favorite = patch.isFavorite
    if ('coverPath' in patch) body.cover_path = patch.coverPath
    const row = check(await sb.from('poetry_collection').update(body).eq('id', item.id).select(ITEM_SELECT).single())
    const signed = await signCovers(sb, [row.cover_path])
    return fromCloud(row, signed)
  },
  async remove(item) {
    const sb = getSupabase()
    check(await sb.from('poetry_collection').delete().eq('id', item.id))
    if (item.coverPath) await sb.storage.from('poetry-covers').remove([item.coverPath])
  },
  async addNote(item, body) {
    const sb = getSupabase()
    const n = check(await sb.from('poetry_notes').insert({ item_id: item.id, body }).select('id,body,created_at,updated_at').single())
    return { id: n.id, body: n.body, createdAt: n.created_at, updatedAt: n.updated_at }
  },
  async updateNote(note, body) {
    const sb = getSupabase()
    const n = check(await sb.from('poetry_notes').update({ body }).eq('id', note.id).select('id,body,created_at,updated_at').single())
    return { id: n.id, body: n.body, createdAt: n.created_at, updatedAt: n.updated_at }
  },
  async removeNote(note) {
    check(await getSupabase().from('poetry_notes').delete().eq('id', note.id))
  },
  async createCategory({ name, color }, position) {
    const c = check(await getSupabase().from('poetry_categories').insert({ name, color, position }).select('id,name,color,position').single())
    return c
  },
  async updateCategory(cat, patch) {
    return check(await getSupabase().from('poetry_categories').update(patch).eq('id', cat.id).select('id,name,color,position').single())
  },
  async removeCategory(cat) {
    check(await getSupabase().from('poetry_categories').delete().eq('id', cat.id))
  },
  async uploadCover(item, blob, userId) {
    const sb = getSupabase()
    const path = `${userId}/${item.id}-${Date.now()}.webp`
    check(await sb.storage.from('poetry-covers').upload(path, blob, { contentType: blob.type || 'image/webp', upsert: false }))
    const updated = await cloud.update(item, { coverPath: path })
    if (item.coverPath && item.coverPath !== path) await sb.storage.from('poetry-covers').remove([item.coverPath])
    return updated
  },
  async removeCover(item) {
    const updated = await cloud.update(item, { coverPath: null })
    if (item.coverPath) await getSupabase().storage.from('poetry-covers').remove([item.coverPath])
    return updated
  },
}

// ── guest adapter (this browser) ───────────────────────────────────────────

const GUEST_KEY = 'bt-poetry-guest-v1'

function readGuest() {
  try {
    const raw = localStorage.getItem(GUEST_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return {
    categories: DEFAULT_CATEGORIES.map((c, i) => ({ id: crypto.randomUUID(), name: c.name, color: c.color, position: i })),
    items: [],
  }
}
function writeGuest(state) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(state))
  } catch {
    throw new Error('El navegador no tiene espacio para guardar más (prueba una portada más pequeña o inicia sesión).')
  }
}
function mutateGuest(fn) {
  const state = readGuest()
  const out = fn(state)
  writeGuest(state)
  return out
}

function snapshot(rec, base = {}) {
  const p = catalogPayload(rec)
  return {
    id: base.id || crypto.randomUUID(),
    pid: rec.id,
    poemId: null,
    title: rec.title,
    author: p.author,
    translatorName: p.translatorName,
    language: rec.lang,
    collection: p.collection,
    year: p.year,
    linecount: p.linecount,
    firstLine: p.firstLine,
    text: p.text,
    sourceName: p.sourceName,
    sourceUrl: p.sourceUrl,
    rightsStatus: p.rightsStatus,
    rightsNote: p.rightsNote,
    license: p.license,
    source: p.source,
    categoryId: base.categoryId ?? null,
    isFavorite: base.isFavorite ?? false,
    coverPath: null,
    coverUrl: base.coverUrl || null,
    savedAt: base.savedAt || now(),
    updatedAt: now(),
    notes: base.notes || [],
  }
}

/** Rebuild the minimum of an API record from a stored item (guest → cloud). */
export function snapshotToRecord(item) {
  const status = item.rightsStatus
  return {
    id: item.pid,
    ref: { source: item.source || (item.pid.startsWith('pdb.') ? 'poetrydb' : 'wikisource') },
    title: item.title,
    lang: item.language,
    collection: item.collection,
    year: item.year,
    linecount: item.linecount,
    author: item.author,
    translator: item.translatorName ? { name: item.translatorName } : null,
    source: { name: item.sourceName, pageUrl: item.sourceUrl },
    rights: { status, explanation: item.rightsNote, license: item.license, allowsFullText: Boolean(item.text), universal: Boolean(item.text) },
    lines: item.text ? item.text.split('\n') : null,
  }
}

export const guest = {
  kind: 'guest',
  async load() {
    const s = readGuest()
    if (!localStorage.getItem(GUEST_KEY)) writeGuest(s)
    return { categories: s.categories, items: [...s.items].sort((a, b) => b.savedAt.localeCompare(a.savedAt)) }
  },
  async save(rec, { categoryId = null } = {}) {
    return mutateGuest((s) => {
      const i = s.items.findIndex((x) => x.pid === rec.id)
      const item = snapshot(rec, i >= 0 ? { ...s.items[i], categoryId } : { categoryId })
      if (i >= 0) s.items[i] = item
      else s.items.push(item)
      return item
    })
  },
  async update(item, patch) {
    return mutateGuest((s) => {
      const i = s.items.findIndex((x) => x.id === item.id)
      if (i < 0) throw new Error('Este poema ya no está en tu colección.')
      s.items[i] = { ...s.items[i], ...patch, updatedAt: now() }
      return s.items[i]
    })
  },
  async remove(item) {
    mutateGuest((s) => {
      s.items = s.items.filter((x) => x.id !== item.id)
    })
  },
  async addNote(item, body) {
    const note = { id: crypto.randomUUID(), body, createdAt: now(), updatedAt: now() }
    mutateGuest((s) => {
      const it = s.items.find((x) => x.id === item.id)
      if (it) it.notes = [...(it.notes || []), note]
    })
    return note
  },
  async updateNote(note, body) {
    let updated = null
    mutateGuest((s) => {
      for (const it of s.items) {
        const n = (it.notes || []).find((x) => x.id === note.id)
        if (n) {
          n.body = body
          n.updatedAt = now()
          updated = { ...n }
        }
      }
    })
    return updated
  },
  async removeNote(note) {
    mutateGuest((s) => {
      for (const it of s.items) it.notes = (it.notes || []).filter((x) => x.id !== note.id)
    })
  },
  async createCategory({ name, color }, position) {
    return mutateGuest((s) => {
      if (s.categories.some((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase())) throw new Error('Ya existe una categoría con ese nombre.')
      const c = { id: crypto.randomUUID(), name: name.trim(), color, position }
      s.categories.push(c)
      return c
    })
  },
  async updateCategory(cat, patch) {
    return mutateGuest((s) => {
      if (patch.name && s.categories.some((c) => c.id !== cat.id && c.name.trim().toLowerCase() === patch.name.trim().toLowerCase()))
        throw new Error('Ya existe una categoría con ese nombre.')
      const c = s.categories.find((x) => x.id === cat.id)
      Object.assign(c, patch)
      return { ...c }
    })
  },
  async removeCategory(cat) {
    mutateGuest((s) => {
      s.categories = s.categories.filter((c) => c.id !== cat.id)
      for (const it of s.items) if (it.categoryId === cat.id) it.categoryId = null
    })
  },
  async uploadCover(item, blob) {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = () => reject(new Error('No se pudo leer la imagen.'))
      r.readAsDataURL(blob)
    })
    return guest.update(item, { coverUrl: dataUrl })
  },
  async removeCover(item) {
    return guest.update(item, { coverUrl: null })
  },
  count() {
    try {
      return JSON.parse(localStorage.getItem(GUEST_KEY) || '{}').items?.length || 0
    } catch {
      return 0
    }
  },
  readAll() {
    return readGuest()
  },
  clearItems(ids) {
    mutateGuest((s) => {
      s.items = s.items.filter((x) => !ids.includes(x.id))
    })
  },
}

export const cloudAvailable = supabaseConfig.configured

/** Resize an image file to a small webp cover (max 900 px). */
export async function prepareCover(file, max = 900) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Formato no admitido: usa JPG, PNG, WebP o GIF.')
  if (file.size > 15 * 1024 * 1024) throw new Error('La imagen supera los 15 MB.')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82))
  if (!blob) throw new Error('No se pudo procesar la imagen.')
  return blob
}
