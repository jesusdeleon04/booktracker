// "Mi colección de poesía" state: Supabase when signed in, this browser otherwise.
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { cloud, guest, cloudAvailable } from '../lib/poetryCloud'

let initialised = false

export const usePoetry = create((set, get) => ({
  auth: { status: cloudAvailable ? 'loading' : 'unavailable', user: null, recovery: false },
  mode: 'guest',
  status: 'idle', // idle | loading | ready | error
  error: null,
  categories: [],
  items: [],
  guestCount: 0,

  adapter: () => (get().mode === 'cloud' ? cloud : guest),

  init() {
    if (initialised) return
    initialised = true
    if (!supabase) {
      get().load()
      return
    }
    supabase.auth.getSession().then(({ data }) => get()._applySession(data.session))
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') set((s) => ({ auth: { ...s.auth, recovery: true } }))
      // Defer: Supabase recommends not awaiting other calls inside this callback.
      setTimeout(() => get()._applySession(session), 0)
    })
  },

  _applySession(session) {
    const user = session?.user || null
    const prev = get().auth.user
    set((s) => ({ auth: { ...s.auth, status: user ? 'signedIn' : 'signedOut', user }, mode: user ? 'cloud' : 'guest' }))
    if ((prev?.id || null) !== (user?.id || null) || get().status === 'idle') get().load()
  },

  async load() {
    set({ status: 'loading', error: null, guestCount: guest.count() })
    try {
      const { categories, items } = await get().adapter().load()
      set({ categories, items, status: 'ready' })
    } catch (err) {
      set({ status: 'error', error: err.message })
    }
  },

  itemFor: (pid) => get().items.find((i) => i.pid === pid) || null,

  async save(rec, categoryId = null) {
    const item = await get().adapter().save(rec, { categoryId })
    set((s) => ({ items: [item, ...s.items.filter((i) => i.id !== item.id && i.pid !== item.pid)] }))
    return item
  },

  async update(item, patch) {
    const before = get().items
    set((s) => ({ items: s.items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)) }))
    try {
      const updated = await get().adapter().update(item, patch)
      set((s) => ({ items: s.items.map((i) => (i.id === item.id ? { ...updated, notes: i.notes } : i)) }))
      return updated
    } catch (err) {
      set({ items: before })
      throw err
    }
  },

  toggleFavorite: (item) => get().update(item, { isFavorite: !item.isFavorite }),

  async remove(item) {
    await get().adapter().remove(item)
    set((s) => ({ items: s.items.filter((i) => i.id !== item.id) }))
  },

  async addNote(item, body) {
    const note = await get().adapter().addNote(item, body)
    set((s) => ({ items: s.items.map((i) => (i.id === item.id ? { ...i, notes: [...(i.notes || []), note] } : i)) }))
    return note
  },
  async updateNote(item, note, body) {
    const updated = await get().adapter().updateNote(note, body)
    set((s) => ({
      items: s.items.map((i) => (i.id === item.id ? { ...i, notes: i.notes.map((n) => (n.id === note.id ? { ...n, ...updated } : n)) } : i)),
    }))
  },
  async removeNote(item, note) {
    await get().adapter().removeNote(note)
    set((s) => ({ items: s.items.map((i) => (i.id === item.id ? { ...i, notes: i.notes.filter((n) => n.id !== note.id) } : i)) }))
  },

  async createCategory(name, color) {
    const c = await get().adapter().createCategory({ name: name.trim(), color }, get().categories.length)
    set((s) => ({ categories: [...s.categories, c] }))
    return c
  },
  async updateCategory(cat, patch) {
    const c = await get().adapter().updateCategory(cat, patch)
    set((s) => ({ categories: s.categories.map((x) => (x.id === cat.id ? { ...x, ...c } : x)) }))
  },
  async removeCategory(cat) {
    await get().adapter().removeCategory(cat)
    set((s) => ({
      categories: s.categories.filter((x) => x.id !== cat.id),
      items: s.items.map((i) => (i.categoryId === cat.id ? { ...i, categoryId: null } : i)),
    }))
  },

  async setCover(item, blob) {
    const updated = await get().adapter().uploadCover(item, blob, get().auth.user?.id)
    set((s) => ({ items: s.items.map((i) => (i.id === item.id ? { ...updated, notes: i.notes } : i)) }))
  },
  async clearCover(item) {
    const updated = await get().adapter().removeCover(item)
    set((s) => ({ items: s.items.map((i) => (i.id === item.id ? { ...updated, notes: i.notes } : i)) }))
  },

  /** Move the poems saved in this browser to the signed-in account. */
  async importGuest() {
    const { items } = guest.readAll()
    const moved = []
    for (const it of items) {
      const saved = await cloud.saveSnapshot(it)
      if (it.isFavorite) await cloud.update(saved, { isFavorite: true })
      for (const n of it.notes || []) await cloud.addNote(saved, n.body)
      moved.push(it.id)
    }
    guest.clearItems(moved)
    await get().load()
    return moved.length
  },

  // ── auth ────────────────────────────────────────────────────────────────
  async signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(authMessage(error))
  },
  async signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${window.location.pathname}`, queryParams: { prompt: 'select_account' } },
    })
    if (error) throw new Error(authMessage(error))
  },
  async signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/poesia/coleccion` },
    })
    if (error) throw new Error(authMessage(error))
    return { needsConfirmation: !data.session }
  },
  async resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/poesia/coleccion` })
    if (error) throw new Error(authMessage(error))
  },
  async setNewPassword(password) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(authMessage(error))
    set((s) => ({ auth: { ...s.auth, recovery: false } }))
  },
  async signOut() {
    await supabase.auth.signOut()
  },
}))

function authMessage(error) {
  const m = error?.message || ''
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.'
  if (/Email not confirmed/i.test(m)) return 'Confirma tu correo antes de entrar (revisa tu bandeja de entrada).'
  if (/already registered|already exists/i.test(m)) return 'Ya existe una cuenta con ese correo. Inicia sesión.'
  if (/Password should be|at least/i.test(m)) return 'La contraseña es demasiado corta (mínimo 6 caracteres).'
  if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera unos minutos.'
  if (/Failed to fetch|network/i.test(m)) return 'No hay conexión con Supabase.'
  return m || 'No se pudo completar la operación.'
}
