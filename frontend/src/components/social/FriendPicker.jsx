import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Check, Search } from 'lucide-react'
import { Spinner } from '../ui/Bits'
import { Avatar } from './SocialBits'
import { fold } from '../../lib/match'
import { useSocial } from '../../store/useSocial'

/** Choose one or several accepted friends. */
export default function FriendPicker({ value, onChange, max = 20 }) {
  const friends = useSocial((s) => s.friends)
  const error = useSocial((s) => s.friendsError)
  const loadFriends = useSocial((s) => s.loadFriends)
  const [q, setQ] = useState('')
  useEffect(() => {
    loadFriends(true)
  }, [loadFriends])
  // Only current friends can be chosen (a link may preselect someone who no longer is).
  useEffect(() => {
    if (friends && value.some((id) => !friends.some((f) => f.id === id))) onChange(value.filter((id) => friends.some((f) => f.id === id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friends])
  const list = useMemo(() => {
    const fq = fold(q)
    return (friends || []).filter((f) => !fq || fold(`${f.name} ${f.username || ''}`).includes(fq))
  }, [friends, q])

  if (friends === null && !error)
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-ink-2">
        <Spinner size={15} /> Buscando a tus amigos…
      </div>
    )
  if (error) return <p className="py-3 text-sm text-ember">No se pudo cargar la lista de amigos: {error}</p>
  if (!friends.length)
    return (
      <div className="rounded-2xl border border-dashed border-line-strong p-5 text-center text-sm text-ink-2">
        Todavía no tienes amigos en la Tertulia.{' '}
        <Link to="/tertulia/amigos" className="text-dusk underline">
          Busca a alguien
        </Link>{' '}
        para compartir con él o con ella.
      </div>
    )

  const toggle = (id) => {
    if (value.includes(id)) onChange(value.filter((x) => x !== id))
    else if (value.length < max) onChange([...value, id])
  }
  return (
    <div>
      {friends.length > 6 && (
        <div className="relative mb-2">
          <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input className="field h-9 pl-9 text-sm" placeholder="Buscar entre tus amigos" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      <ul className="max-h-64 space-y-1 overflow-y-auto pr-1" role="listbox" aria-multiselectable="true" aria-label="Amigos">
        {list.map((f) => {
          const on = value.includes(f.id)
          return (
            <li key={f.id}>
              <button
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(f.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${on ? 'border-accent/60 bg-accent-soft' : 'border-transparent hover:bg-surface-2'}`}
              >
                <Avatar person={f} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{f.name}</span>
                  {f.username && <span className="block truncate font-mono text-[11px] text-ink-3">@{f.username}</span>}
                </span>
                <span className={`grid h-5 w-5 place-items-center rounded-full border ${on ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong'}`}>
                  {on && <Check size={12} strokeWidth={3} />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {max > 1 && <p className="mt-2 text-xs text-ink-3">{value.length ? `${value.length} seleccionado${value.length === 1 ? '' : 's'}` : 'Elige uno o varios amigos.'}</p>}
    </div>
  )
}
