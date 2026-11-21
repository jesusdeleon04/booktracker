import { Suspense, lazy } from 'react'
import { useStore } from '../../store/useStore'
import { useSocial } from '../../store/useSocial'

const ShareDialog = lazy(() => import('./ShareDialog'))

/** The single "Compartir libro" dialog, mounted once in the app shell (accounts only). */
export default function ShareBookHost() {
  const social = useStore((s) => s.authRequired)
  const book = useSocial((s) => s.shareBook)
  const close = useSocial((s) => s.closeShareBook)
  if (!social || !book) return null
  return (
    <Suspense fallback={null}>
      <ShareDialog open onClose={close} kind="book" item={book} />
    </Suspense>
  )
}
