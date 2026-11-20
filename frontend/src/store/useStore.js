import { create } from 'zustand'
import { api, ApiError } from '../lib/api'
import { buildLibraryIndex, findInIndex } from '../lib/match'

let toastId = 0

function applyTheme(theme) {
  const t = theme === 'paper' ? 'paper' : 'ink'
  document.documentElement.dataset.theme = t
  try {
    localStorage.setItem('bt-theme', t)
  } catch {
    /* private mode */
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', t === 'paper' ? '#ECE2CF' : '#140E0A')
}

export const useStore = create((set, get) => ({
  // ── state ────────────────────────────────────────────────────────────────
  status: 'idle', // idle | loading | ready | error
  bootError: null,
  meta: { genres: [], themes: [], moods: [], purposes: [] },
  genreMap: {},
  profile: null,
  insights: null,
  books: [],
  libraryIndex: new Map(),
  lists: [],
  health: null,
  libraryVersion: 0,
  toasts: [],
  preview: null, // { item, reasons, origin }
  palette: { open: false, mode: 'search' },
  manualOpen: false,
  discover: { plan: null, sections: {}, seed: 0, version: -1 },

  // ── boot ─────────────────────────────────────────────────────────────────
  boot: async () => {
    if (get().status === 'loading') return
    set({ status: 'loading', bootError: null })
    try {
      const [meta, profileData, books, lists] = await Promise.all([
        api.get('/meta'),
        api.get('/profile'),
        api.get('/books'),
        api.get('/lists'),
      ])
      const genreMap = Object.fromEntries(meta.genres.map((g) => [g.key, g]))
      applyTheme(profileData.profile.theme)
      set({
        meta,
        genreMap,
        profile: profileData.profile,
        insights: profileData.insights,
        books,
        libraryIndex: buildLibraryIndex(books),
        lists,
        status: 'ready',
      })
      api.get('/health').then((health) => set({ health })).catch(() => {})
    } catch (err) {
      set({ status: 'error', bootError: err.message })
    }
  },

  // ── toasts ───────────────────────────────────────────────────────────────
  toast: (message, opts = {}) => {
    const id = ++toastId
    const t = { id, message, tone: opts.tone || 'default', action: opts.action, icon: opts.icon }
    set((s) => ({ toasts: [...s.toasts.slice(-3), t] }))
    setTimeout(() => get().dismissToast(id), opts.duration || (opts.action ? 6000 : 3200))
    return id
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // ── overlays ─────────────────────────────────────────────────────────────
  openPreview: (item, extra = {}) => set({ preview: { item, ...extra }, palette: { ...get().palette, open: false } }),
  closePreview: () => set({ preview: null }),
  openPalette: (mode = 'search') => set({ palette: { open: true, mode } }),
  closePalette: () => set((s) => ({ palette: { ...s.palette, open: false } })),
  setManualOpen: (manualOpen) => set({ manualOpen, palette: { ...get().palette, open: false } }),

  // ── library helpers ──────────────────────────────────────────────────────
  _setBooks: (books) =>
    set((s) => ({ books, libraryIndex: buildLibraryIndex(books), libraryVersion: s.libraryVersion + 1 })),
  findInLibrary: (item) => findInIndex(get().libraryIndex, item),
  bookById: (id) => get().books.find((b) => b.id === Number(id)),

  addBook: async (item, personal = {}) => {
    const existing = get().findInLibrary(item)
    if (existing) {
      get().toast(`«${existing.title}» ya está en tu biblioteca.`, { tone: 'info' })
      return { duplicate: true, book: existing }
    }
    try {
      const book = await api.post('/books', { book: item, ...personal })
      get()._setBooks([book, ...get().books])
      if (book.shelfIds?.length) get().reloadLists()
      return { book }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const dup = get().bookById(err.payload?.existingId)
        get().toast('Este libro ya está en tu biblioteca.', { tone: 'info' })
        return { duplicate: true, book: dup }
      }
      get().toast(err.message, { tone: 'error' })
      return { error: err }
    }
  },

  updateBook: async (id, patch, { silent = false } = {}) => {
    const prev = get().books
    const optimistic = prev.map((b) => (b.id === id ? { ...b, ...patch } : b))
    get()._setBooks(optimistic)
    try {
      const book = await api.patch(`/books/${id}`, patch)
      get()._setBooks(get().books.map((b) => (b.id === id ? book : b)))
      return book
    } catch (err) {
      get()._setBooks(prev)
      if (!silent) get().toast(err.message, { tone: 'error' })
      throw err
    }
  },

  deleteBook: async (id) => {
    const book = get().bookById(id)
    if (!book) return
    const prev = get().books
    get()._setBooks(prev.filter((b) => b.id !== id))
    try {
      await api.del(`/books/${id}`)
      get().reloadLists()
      get().toast(`«${book.title}» eliminado de tu biblioteca.`, {
        action: {
          label: 'Deshacer',
          run: async () => {
            const restored = await api.post('/books', {
              book: { ...book, id: book.catalogId },
              status: book.status,
              rating: book.rating,
              startedAt: book.startedAt,
              finishedAt: book.finishedAt,
              currentPage: book.currentPage,
              notes: book.notes,
              review: book.review,
              shelfIds: book.shelfIds,
            })
            get()._setBooks([restored, ...get().books])
            get().reloadLists()
            get().toast('Libro restaurado.', { tone: 'success' })
          },
        },
      })
    } catch (err) {
      get()._setBooks(prev)
      get().toast(err.message, { tone: 'error' })
    }
  },

  refreshBook: async (id) => {
    try {
      const res = await api.post(`/books/${id}/refresh`)
      get()._setBooks(get().books.map((b) => (b.id === id ? res.book : b)))
      get().toast(
        res.updated.length ? `Datos actualizados: ${res.updated.length} campos completados.` : 'La ficha ya estaba completa.',
        { tone: 'success' },
      )
    } catch (err) {
      get().toast(err.message, { tone: 'error' })
    }
  },

  // ── lists ────────────────────────────────────────────────────────────────
  reloadLists: async () => {
    try {
      const [lists, books] = await Promise.all([api.get('/lists'), api.get('/books')])
      set({ lists })
      get()._setBooks(books)
    } catch {
      /* non critical */
    }
  },
  createList: async (data) => {
    try {
      const list = await api.post('/lists', data)
      set({ lists: [...get().lists, list] })
      get().toast(`Lista «${list.name}» creada.`, { tone: 'success' })
      if (data.bookIds?.length) get().reloadLists()
      return list
    } catch (err) {
      get().toast(err.message, { tone: 'error' })
      return null
    }
  },
  updateList: async (id, data) => {
    try {
      const list = await api.patch(`/lists/${id}`, data)
      set({ lists: get().lists.map((l) => (l.id === id ? list : l)) })
      return list
    } catch (err) {
      get().toast(err.message, { tone: 'error' })
      return null
    }
  },
  deleteList: async (id) => {
    const list = get().lists.find((l) => l.id === id)
    try {
      await api.del(`/lists/${id}`)
      set({ lists: get().lists.filter((l) => l.id !== id) })
      get().reloadLists()
      get().toast(`Lista «${list?.name}» eliminada.`)
    } catch (err) {
      get().toast(err.message, { tone: 'error' })
    }
  },
  toggleInList: async (listId, bookId) => {
    const list = get().lists.find((l) => l.id === listId)
    if (!list) return
    const inList = list.bookIds.includes(bookId)
    // optimistic
    set({
      lists: get().lists.map((l) =>
        l.id === listId ? { ...l, bookIds: inList ? l.bookIds.filter((b) => b !== bookId) : [bookId, ...l.bookIds] } : l,
      ),
    })
    get()._setBooks(
      get().books.map((b) =>
        b.id === bookId
          ? { ...b, shelfIds: inList ? b.shelfIds.filter((s) => s !== listId) : [...b.shelfIds, listId] }
          : b,
      ),
    )
    try {
      const updated = inList
        ? await api.del(`/lists/${listId}/books/${bookId}`)
        : await api.post(`/lists/${listId}/books`, { bookId })
      set({ lists: get().lists.map((l) => (l.id === listId ? updated : l)) })
      get().toast(inList ? `Quitado de «${list.name}».` : `Añadido a «${list.name}».`, { tone: 'success' })
    } catch (err) {
      get().reloadLists()
      get().toast(err.message, { tone: 'error' })
    }
  },

  // ── profile ──────────────────────────────────────────────────────────────
  updateProfile: async (patch, { quiet = false } = {}) => {
    try {
      const data = await api.patch('/profile', patch)
      if (patch.theme) applyTheme(patch.theme)
      set((s) => ({ profile: data.profile, insights: data.insights, libraryVersion: s.libraryVersion + 1 }))
      if (!quiet) get().toast('Perfil actualizado. Tus recomendaciones se ajustarán.', { tone: 'success' })
      return data
    } catch (err) {
      get().toast(err.message, { tone: 'error' })
      return null
    }
  },
  setTheme: (theme) => {
    applyTheme(theme)
    set((s) => ({ profile: { ...s.profile, theme } }))
    api.patch('/profile', { theme }).catch(() => {})
  },
  completeOnboarding: async (payload) => {
    const data = await api.post('/onboarding/complete', payload)
    const [books, lists] = await Promise.all([api.get('/books'), api.get('/lists')])
    set((s) => ({
      profile: data.profile,
      insights: data.insights,
      lists,
      discover: { plan: null, sections: {}, seed: 0, version: -1 },
      libraryVersion: s.libraryVersion + 1,
    }))
    get()._setBooks(books)
    return data
  },
  reloadInsights: async () => {
    try {
      const insights = await api.get('/insights')
      set({ insights })
    } catch {
      /* ignore */
    }
  },

  // ── recommendations ──────────────────────────────────────────────────────
  feedback: async (item, kind) => {
    try {
      await api.post('/feedback', { item: { ...item, terms: undefined }, kind })
      set((s) => {
        // remove dismissed items from cached shelves
        const sections = {}
        Object.entries(s.discover.sections).forEach(([k, sec]) => {
          sections[k] = sec?.items ? { ...sec, items: sec.items.filter((i) => i.id !== item.id) } : sec
        })
        return { discover: { ...s.discover, sections } }
      })
      return true
    } catch (err) {
      get().toast(err.message, { tone: 'error' })
      return false
    }
  },
  setDiscover: (patch) => set((s) => ({ discover: { ...s.discover, ...patch } })),
  setSection: (key, data) =>
    set((s) => ({ discover: { ...s.discover, sections: { ...s.discover.sections, [key]: data } } })),
}))

export const useGenre = (key) => useStore((s) => s.genreMap[key])
