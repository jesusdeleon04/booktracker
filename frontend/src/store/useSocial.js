// Tertulia state shared by the shell (badges) and the pickers (friends).
import { create } from 'zustand'
import { socialApi } from '../lib/social'

let timer = null

export const useSocial = create((set, get) => ({
  summary: { notifications: 0, letters: 0, requests: 0 },
  friends: null, // cached list for pickers; null = not loaded
  friendsError: null,
  shareBook: null, // the book being shared right now (one dialog for the whole app)

  async refreshSummary() {
    try {
      const summary = await socialApi.summary()
      set({ summary })
    } catch {
      /* badges are a nicety: never break the page */
    }
  },

  /** Poll every 60 s while the tab is visible, and on focus. */
  startPolling() {
    if (timer) return
    const tick = () => document.visibilityState === 'visible' && get().refreshSummary()
    get().refreshSummary()
    timer = setInterval(tick, 60_000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
  },

  async loadFriends(force = false) {
    if (get().friends && !force) return get().friends
    try {
      const { items } = await socialApi.friends({ all: 1 })
      set({ friends: items, friendsError: null })
      return items
    } catch (err) {
      set({ friendsError: err.message })
      return []
    }
  },
  invalidateFriends: () => set({ friends: null }),
  openShareBook: (book) => set({ shareBook: book }),
  closeShareBook: () => set({ shareBook: null }),
}))
