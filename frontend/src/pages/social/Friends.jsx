import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AtSign, Check, Feather, Mail, RefreshCw, Search, UserMinus, UserPlus, X } from 'lucide-react'
import { SectionHead, Spinner } from '../../components/ui/Bits'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { PersonLine } from '../../components/social/SocialBits'
import { socialApi, when } from '../../lib/social'
import { useSocial } from '../../store/useSocial'
import { useStore } from '../../store/useStore'
import { startLetter } from './Correspondence'

function useAction() {
  const toast = useStore((s) => s.toast)
  const [busy, setBusy] = useState(null)
  const run = async (key, fn, okMsg) => {
    setBusy(key)
    try {
      const r = await fn()
      if (okMsg) toast(okMsg, { tone: 'success' })
      return r
    } catch (err) {
      toast(err.message, { tone: 'error' })
      return null
    } finally {
      setBusy(null)
    }
  }
  return [busy, run]
}

export function RelationButton({ person, onChanged }) {
  const [busy, run] = useAction()
  const send = async () => {
    const r = await run('send', () => socialApi.sendRequest(person.id), null)
    if (r) onChanged?.({ ...person, relationship: r.status === 'accepted' ? 'friends' : 'pending_out' })
  }
  switch (person.relationship) {
    case 'friends':
      return (
        <span className="inline-flex items-center gap-1 text-sm text-sage">
          <Check size={14} /> Amigos
        </span>
      )
    case 'pending_out':
      return <span className="font-mono text-[11px] text-ink-3">Solicitud enviada</span>
    case 'pending_in':
      return (
        <button className="btn btn-sm btn-primary" onClick={send} disabled={!!busy}>
          {busy ? <Spinner size={13} /> : <Check size={14} />} Aceptar
        </button>
      )
    case 'blocked':
      return <span className="font-mono text-[11px] text-ink-3">Bloqueado</span>
    case 'self':
      return <span className="font-mono text-[11px] text-ink-3">Eres tú</span>
    default:
      return (
        <button className="btn btn-sm" onClick={send} disabled={!!busy}>
          {busy ? <Spinner size={13} /> : <UserPlus size={14} />} Añadir
        </button>
      )
  }
}

function FindPeople({ onChanged }) {
  const [mode, setMode] = useState('name')
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (mode !== 'name') return
    const term = q.trim()
    if (term.replace(/^@/, '').length < 2) {
      setResults(null)
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    const t = setTimeout(() => {
      socialApi
        .search(term, ctrl.signal)
        .then((r) => {
          setResults(r)
          setError(null)
        })
        .catch((err) => err.name !== 'AbortError' && setError(err.message))
        .finally(() => setLoading(false))
    }, 280)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q, mode])

  const lookup = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      setResults([await socialApi.lookup(q.trim())])
    } catch (err) {
      setResults([])
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  const update = (person) => {
    setResults((list) => list?.map((p) => (p.id === person.id ? person : p)))
    onChanged()
  }

  return (
    <section className="mb-12 rounded-3xl border border-line bg-surface/50 p-5 md:p-6">
      <SectionHead kicker="Encontrar lectores" title="¿A quién quieres invitar?" className="!mb-4" />
      <div className="mb-3 flex gap-1.5">
        <button className="chip !h-8 text-[13px]" data-active={mode === 'name'} onClick={() => { setMode('name'); setResults(null); setError(null) }}>
          <AtSign size={13} /> Nombre o @usuario
        </button>
        <button className="chip !h-8 text-[13px]" data-active={mode === 'email'} onClick={() => { setMode('email'); setResults(null); setError(null) }}>
          <Mail size={13} /> Correo exacto
        </button>
      </div>
      <form onSubmit={mode === 'email' ? lookup : (e) => e.preventDefault()} className="relative">
        <Search size={15} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
        <input
          className="field h-11 rounded-full pr-28 pl-10"
          type={mode === 'email' ? 'email' : 'search'}
          placeholder={mode === 'email' ? 'nombre@dominio.com' : 'Escribe al menos dos letras'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={mode === 'email' ? 'Correo exacto' : 'Buscar por nombre o @usuario'}
        />
        {mode === 'email' && (
          <button className="btn btn-sm btn-primary absolute top-1.5 right-1.5 h-8 rounded-full" disabled={loading || !q.includes('@')}>
            Buscar
          </button>
        )}
      </form>
      {mode === 'email' && <p className="mt-2 text-xs text-ink-3">Solo encuentra a quien escribas exactamente y permita que lo busquen así. No mostramos el correo de nadie.</p>}
      <div className="mt-4">
        {loading && <Spinner size={15} />}
        {error && <p className="text-sm text-ink-2">{error}</p>}
        {results && !loading && !results.length && !error && <p className="text-sm text-ink-3">No encontramos a nadie con ese nombre.</p>}
        {results?.length > 0 && (
          <ul className="divide-y divide-line">
            {results.map((p) => (
              <li key={p.id} className="py-3">
                <PersonLine person={p} to={p.username ? `/tertulia/lector/${p.username}` : undefined} sub={p.affinity?.length ? `Os une: ${p.affinity.join(', ')}` : p.bio}>
                  <RelationButton person={p} onChanged={update} />
                </PersonLine>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default function Friends() {
  const navigate = useNavigate()
  const refreshSummary = useSocial((s) => s.refreshSummary)
  const invalidateFriends = useSocial((s) => s.invalidateFriends)
  const [busy, run] = useAction()
  const [reqs, setReqs] = useState(null)
  const [friends, setFriends] = useState({ status: 'loading', items: [] })
  const [blocks, setBlocks] = useState(null)
  const [toRemove, setToRemove] = useState(null)

  const loadReqs = useCallback(() => socialApi.requests().then(setReqs).catch(() => setReqs({ received: [], sent: [] })), [])
  const loadFriends = useCallback(async (offset = 0) => {
    setFriends((s) => ({ ...s, status: offset ? 'more' : 'loading' }))
    try {
      const r = await socialApi.friends({ offset, limit: 30 })
      setFriends((s) => ({ status: 'ready', items: offset ? [...s.items, ...r.items] : r.items, next: r.next, total: r.total }))
    } catch (err) {
      setFriends((s) => ({ ...s, status: 'error', error: err.message }))
    }
  }, [])
  const reload = useCallback(() => {
    loadReqs()
    loadFriends(0)
    refreshSummary()
    invalidateFriends()
  }, [loadReqs, loadFriends, refreshSummary, invalidateFriends])
  useEffect(() => reload(), [reload])

  const accept = (r) => run(`a${r.id}`, () => socialApi.accept(r.id), `Ya eres amigo de ${r.person.name}.`).then(reload)
  const decline = (r) => run(`d${r.id}`, () => socialApi.decline(r.id)).then(reload)
  const cancel = (r) => run(`c${r.id}`, () => socialApi.cancel(r.id)).then(reload)
  const remove = (f) => run(`r${f.id}`, () => socialApi.removeFriend(f.id), `${f.name} ya no está en tu tertulia.`).then(reload)
  const unblock = (b) => run(`u${b.id}`, () => socialApi.unblock(b.id)).then(() => socialApi.blocks().then(setBlocks))
  const write = (f) => run(`w${f.id}`, () => startLetter(navigate, { to: f.id }))

  return (
    <div>
      <header className="mb-8">
        <p className="kicker mb-3">Amigos</p>
        <h1 className="font-display text-[2.4rem] leading-[1] font-light md:text-[3.4rem]">
          Tu <em className="display-wonk">tertulia</em>
        </h1>
        <p className="mt-3 max-w-xl text-ink-2">Las personas con las que compartes libros, poemas y cartas. La amistad es mutua: solo existe cuando las dos partes la aceptan.</p>
      </header>

      {reqs?.received?.length > 0 && (
        <section className="mb-10">
          <SectionHead kicker="Solicitudes" title="Quieren sumarte a su tertulia" />
          <ul className="space-y-3">
            {reqs.received.map((r) => (
              <li key={r.id} className="rounded-2xl border border-accent/40 bg-accent-soft p-3">
                <PersonLine person={r.person} to={r.person.username ? `/tertulia/lector/${r.person.username}` : undefined} sub={when(r.createdAt)}>
                  <button className="btn btn-sm btn-primary" onClick={() => accept(r)} disabled={!!busy}>
                    {busy === `a${r.id}` ? <Spinner size={13} /> : <Check size={14} />} Aceptar
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => decline(r)} disabled={!!busy} aria-label={`Rechazar a ${r.person.name}`}>
                    <X size={14} /> <span className="hidden sm:inline">Ahora no</span>
                  </button>
                </PersonLine>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-3">Si rechazas una solicitud, la otra persona no recibe ningún aviso.</p>
        </section>
      )}

      <section className="mb-12">
        <SectionHead kicker="Amistades" title={friends.total ? `Tus amigos · ${friends.total}` : 'Tus amigos'} />
        {friends.status === 'loading' ? (
          <Spinner />
        ) : friends.status === 'error' ? (
          <p className="text-ink-2">
            {friends.error}{' '}
            <button className="text-dusk underline" onClick={() => loadFriends(0)}>
              <RefreshCw size={12} className="inline" /> Reintentar
            </button>
          </p>
        ) : !friends.items.length ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-ink-2">Aún no tienes amigos aquí. Busca a alguien más abajo para enviarle una solicitud.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {friends.items.map((f) => (
              <li key={f.id} className="rounded-2xl border border-line bg-surface/50 p-3">
                <PersonLine person={f} to={f.username ? `/tertulia/lector/${f.username}` : undefined} sub={f.since ? `desde ${when(f.since)}` : ''}>
                  <button className="btn btn-sm" onClick={() => write(f)} disabled={!!busy} title={`Escribir una carta a ${f.name}`}>
                    {busy === `w${f.id}` ? <Spinner size={13} /> : <Feather size={14} />} <span className="hidden sm:inline">Carta</span>
                  </button>
                  <button className="btn btn-icon btn-sm btn-ghost" onClick={() => setToRemove(f)} aria-label={`Quitar a ${f.name} de tus amigos`} title="Quitar amistad">
                    <UserMinus size={14} />
                  </button>
                </PersonLine>
              </li>
            ))}
          </ul>
        )}
        {friends.next != null && (
          <button className="btn btn-sm mt-4" onClick={() => loadFriends(friends.next)} disabled={friends.status === 'more'}>
            Ver más
          </button>
        )}
      </section>

      <FindPeople onChanged={reload} />

      {reqs?.sent?.length > 0 && (
        <section className="mb-10">
          <SectionHead kicker="Enviadas" title="Solicitudes que esperan respuesta" />
          <ul className="space-y-2">
            {reqs.sent.map((r) => (
              <li key={r.id}>
                <PersonLine person={r.person} sub={`enviada ${when(r.createdAt)}`} size={36}>
                  <button className="btn btn-sm btn-ghost" onClick={() => cancel(r)} disabled={!!busy}>
                    {busy === `c${r.id}` ? <Spinner size={13} /> : <X size={14} />} Cancelar
                  </button>
                </PersonLine>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="rounded-2xl border border-line p-4" onToggle={(e) => e.currentTarget.open && blocks === null && socialApi.blocks().then(setBlocks).catch(() => setBlocks([]))}>
        <summary className="cursor-pointer text-sm text-ink-2">Personas bloqueadas</summary>
        <div className="mt-3">
          {blocks === null ? (
            <Spinner size={14} />
          ) : !blocks.length ? (
            <p className="text-sm text-ink-3">No has bloqueado a nadie. Puedes hacerlo desde el perfil de cualquier lector.</p>
          ) : (
            <ul className="space-y-2">
              {blocks.map((b) => (
                <li key={b.id}>
                  <PersonLine person={b} size={32} sub={`desde ${when(b.since)}`}>
                    <button className="btn btn-sm" onClick={() => unblock(b)} disabled={!!busy}>
                      Desbloquear
                    </button>
                  </PersonLine>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <ConfirmDialog
        open={!!toRemove}
        onClose={() => setToRemove(null)}
        onConfirm={() => remove(toRemove)}
        title="Quitar de tus amigos"
        message={`${toRemove?.name} dejará de ver lo que le compartiste y tú lo que te compartió. Las cartas que ya os escribisteis seguirán en la correspondencia de cada uno.`}
        confirmLabel="Quitar amistad"
        danger
      />
      <p className="mt-10 text-center text-xs text-ink-3">
        ¿Cómo te ven los demás? <Link to="/tertulia/ficha" className="text-dusk underline">Revisa tu ficha y tu privacidad</Link>.
      </p>
    </div>
  )
}
