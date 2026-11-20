import { useCallback, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { api } from '../lib/api'

// Shared state for Discover, Home and the immersive feed: the shelf plan and
// each shelf's items live in the store so navigating back is instant.

export function useDiscoverPlan() {
  const discover = useStore((s) => s.discover)
  const libraryVersion = useStore((s) => s.libraryVersion)
  const setDiscover = useStore((s) => s.setDiscover)
  const toast = useStore((s) => s.toast)

  const load = useCallback(
    async (seed = 0) => {
      setDiscover({ plan: null, sections: {}, seed, version: useStore.getState().libraryVersion })
      try {
        const data = await api.discoverPlan()
        setDiscover({ plan: data.sections, signals: data.signals })
      } catch (e) {
        toast(e.message, { tone: 'error' })
        setDiscover({ plan: [] })
      }
    },
    [setDiscover, toast],
  )

  useEffect(() => {
    if (discover.version !== libraryVersion || !discover.plan) load(discover.seed || 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { ...discover, reload: load }
}

export function useSection(key, seed, enabled = true) {
  const data = useStore((s) => s.discover.sections[key])
  const setSection = useStore((s) => s.setSection)
  useEffect(() => {
    if (!enabled || data) return
    setSection(key, { loading: true, items: [] })
    api
      .section(key, seed)
      .then((d) => setSection(key, { ...d, loading: false }))
      .catch((e) => setSection(key, { loading: false, items: [], error: e.message }))
  }, [key, seed, enabled, data, setSection])
  return data
}
