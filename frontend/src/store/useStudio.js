import { create } from 'zustand'
import { drafts, studioApi } from '../lib/studio'
import { useStore } from './useStore'

const toast = (...args) => useStore.getState().toast(...args)

/** Writer's Studio state: writings (summaries), categories and the image library. */
export const useStudio = create((set, get) => ({
  status: 'idle', // idle | loading | ready | error
  error: null,
  writings: [],
  categories: [],
  resume: null,
  images: null,

  load: async ({ quiet = false } = {}) => {
    if (!quiet) set({ status: get().status === 'ready' ? 'ready' : 'loading', error: null })
    try {
      const data = await studioApi.overview()
      set({ writings: data.writings, categories: data.categories, resume: data.resume, status: 'ready' })
      return data
    } catch (err) {
      set({ status: 'error', error: err.message })
      return null
    }
  },

  categoryById: (id) => get().categories.find((c) => c.id === id) || null,

  /** Insert or update a writing summary (called by the editor after each save). */
  upsertWriting: (summary) => {
    if (!summary?.id) return
    set((s) => {
      const exists = s.writings.some((w) => w.id === summary.id)
      const writings = exists ? s.writings.map((w) => (w.id === summary.id ? { ...w, ...summary } : w)) : [summary, ...s.writings]
      return { writings, categories: recount(s.categories, writings) }
    })
  },

  patchWriting: async (id, patch) => {
    const prev = get().writings
    set((s) => {
      const writings = s.writings.map((w) => (w.id === id ? { ...w, ...patch } : w))
      return { writings, categories: recount(s.categories, writings) }
    })
    try {
      const summary = await studioApi.patch(id, patch)
      get().upsertWriting(summary)
      return summary
    } catch (err) {
      set((s) => ({ writings: prev, categories: recount(s.categories, prev) }))
      toast(err.message, { tone: 'error' })
      return null
    }
  },

  /** Delete with an undo window: the full text is kept in memory until the toast expires. */
  removeWriting: async (id) => {
    let full = null
    try {
      full = await studioApi.get(id)
    } catch {
      /* deleting anyway */
    }
    const prev = get().writings
    set((s) => {
      const writings = s.writings.filter((w) => w.id !== id)
      return { writings, categories: recount(s.categories, writings) }
    })
    try {
      await studioApi.remove(id)
      drafts.clear(id) // ids can be reused: never leave a stale local copy behind
    } catch (err) {
      set((s) => ({ writings: prev, categories: recount(s.categories, prev) }))
      toast(err.message, { tone: 'error' })
      return false
    }
    toast(`«${full?.title || 'Sin título'}» se ha eliminado.`, {
      duration: 9000,
      action: full
        ? {
            label: 'Deshacer',
            run: async () => {
              const restored = await studioApi.create({
                title: full.title,
                content: full.content,
                description: full.description,
                categoryId: full.categoryId,
                coverImageId: full.cover?.id,
                caret: full.caret,
              })
              get().upsertWriting(restored)
              toast('Escrito restaurado.', { tone: 'success' })
            },
          }
        : undefined,
    })
    return true
  },

  reorder: async (ids) => {
    const byId = Object.fromEntries(get().writings.map((w) => [w.id, w]))
    set({ writings: get().writings.map((w) => ({ ...w, position: ids.indexOf(w.id) === -1 ? w.position : ids.indexOf(w.id) })) })
    try {
      await studioApi.order(ids.filter((id) => byId[id]))
    } catch (err) {
      toast(err.message, { tone: 'error' })
      get().load({ quiet: true })
    }
  },

  // ── categories ───────────────────────────────────────────────────────────
  createCategory: async (name, color) => {
    try {
      const cat = await studioApi.createCategory({ name, color })
      set((s) => ({ categories: [...s.categories, cat] }))
      return cat
    } catch (err) {
      toast(err.message, { tone: 'error' })
      return null
    }
  },
  updateCategory: async (id, patch) => {
    try {
      const cat = await studioApi.updateCategory(id, patch)
      set((s) => ({ categories: s.categories.map((c) => (c.id === id ? { ...c, ...cat } : c)) }))
      return cat
    } catch (err) {
      toast(err.message, { tone: 'error' })
      return null
    }
  },
  deleteCategory: async (id, moveTo) => {
    try {
      const res = await studioApi.deleteCategory(id, moveTo)
      set((s) => {
        const writings = s.writings.map((w) => (w.categoryId === id ? { ...w, categoryId: res.movedTo } : w))
        return { writings, categories: recount(s.categories.filter((c) => c.id !== id), writings) }
      })
      return res
    } catch (err) {
      toast(err.message, { tone: 'error' })
      return null
    }
  },

  // ── image library ────────────────────────────────────────────────────────
  loadImages: async () => {
    try {
      const images = await studioApi.images()
      set({ images })
      return images
    } catch (err) {
      toast(err.message, { tone: 'error' })
      return []
    }
  },
  addImage: (img) => set((s) => ({ images: [img, ...(s.images || [])] })),
  deleteImage: async (id, force = false) => {
    try {
      await studioApi.deleteImage(id, force)
      set((s) => ({
        images: (s.images || []).filter((i) => i.id !== id),
        writings: s.writings.map((w) => (w.cover?.id === id ? { ...w, cover: null } : w)),
      }))
      return { ok: true }
    } catch (err) {
      if (err.status === 409) return { inUse: err.payload?.usedBy || 1 }
      toast(err.message, { tone: 'error' })
      return { ok: false }
    }
  },
}))

function recount(categories, writings) {
  const counts = {}
  writings.forEach((w) => (counts[w.categoryId] = (counts[w.categoryId] || 0) + 1))
  return categories.map((c) => ({ ...c, count: counts[c.id] || 0 }))
}
