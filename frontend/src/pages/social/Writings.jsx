import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Feather } from 'lucide-react'
import { Spinner } from '../../components/ui/Bits'
import PublicationCard from '../../components/social/PublicationCard'
import { publicationsApi } from '../../lib/social'
import { writings as copy } from '../../lib/copy'

/** "Escritos": what friends published from their studios, and your own publications. */
export default function Writings() {
  const [box, setBox] = useState('feed') // feed | mine
  const [state, setState] = useState({ status: 'loading', items: [], more: false })

  const load = useCallback(
    async (offset = 0) => {
      try {
        const res = await publicationsApi.list({ scope: box, offset, limit: 12 })
        setState((s) => ({ status: 'ready', items: offset ? [...s.items, ...res.items] : res.items, more: res.more }))
      } catch (err) {
        setState({ status: 'error', items: [], more: false, error: err.message })
      }
    },
    [box],
  )
  useEffect(() => {
    setState({ status: 'loading', items: [], more: false })
    load(0)
  }, [load])

  return (
    <div>
      <header className="mb-8">
        <p className="kicker mb-3">{copy.kicker}</p>
        <h1 className="font-display text-[2.4rem] leading-[1] font-light md:text-[3.4rem]">
          {copy.title[0]} <em className="display-wonk">{copy.title[1]}</em>
        </h1>
        <p className="mt-3 max-w-xl text-ink-2">{copy.sub}</p>
      </header>
      <div className="mb-8 flex flex-wrap items-center gap-2">
        <button className="chip" data-active={box === 'feed'} onClick={() => setBox('feed')}>
          De tus amigos
        </button>
        <button className="chip" data-active={box === 'mine'} onClick={() => setBox('mine')}>
          Los tuyos
        </button>
        <Link to="/estudio" className="btn btn-sm ml-auto">
          <Feather size={14} /> Ir al estudio
        </Link>
      </div>

      {state.status === 'loading' && (
        <div className="flex items-center gap-2 py-10 text-ink-2">
          <Spinner /> Abriendo los pliegos…
        </div>
      )}
      {state.status === 'error' && <p className="text-ember">{state.error}</p>}
      {state.status === 'ready' && state.items.length === 0 && (
        <div className="rounded-[28px] border border-dashed border-line-strong px-6 py-14 text-center">
          <h2 className="font-display text-2xl">{box === 'feed' ? copy.emptyFeed[0] : copy.emptyMine[0]}</h2>
          <p className="mx-auto mt-2 max-w-md text-ink-2">{box === 'feed' ? copy.emptyFeed[1] : copy.emptyMine[1]}</p>
          <Link to={box === 'feed' ? '/tertulia/amigos' : '/estudio'} className="btn btn-primary mt-6">
            {box === 'feed' ? 'Buscar amigos' : 'Abrir el estudio'}
          </Link>
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        {state.items.map((p) => (
          <PublicationCard key={p.id} pub={p} showAuthor={box === 'feed'} />
        ))}
      </div>
      {state.more && (
        <div className="mt-8 flex justify-center">
          <button className="btn" onClick={() => load(state.items.length)}>
            Ver más
          </button>
        </div>
      )}
    </div>
  )
}
