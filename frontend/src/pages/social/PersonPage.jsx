import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { motion } from 'motion/react'
import { Ban, Check, Feather, UserMinus, UserPlus, X } from 'lucide-react'
import { Spinner } from '../../components/ui/Bits'
import { ConfirmDialog } from '../../components/ui/Dialog'
import Cover from '../../components/book/Cover'
import { Avatar } from '../../components/social/SocialBits'
import { BookShelf } from '../../components/social/FavoriteShelf'
import PublicationCard from '../../components/social/PublicationCard'
import { socialApi, when } from '../../lib/social'
import { useSocial } from '../../store/useSocial'
import { useStore } from '../../store/useStore'
import { startLetter } from './Correspondence'

/** A reader's card, as its owner lets you see it. */
export default function PersonPage() {
  const { username } = useParams()
  const navigate = useNavigate()
  const toast = useStore((s) => s.toast)
  const invalidateFriends = useSocial((s) => s.invalidateFriends)
  const refreshSummary = useSocial((s) => s.refreshSummary)
  const [state, setState] = useState({ status: 'loading' })
  const [busy, setBusy] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(() => {
    socialApi
      .person(username)
      .then((p) => setState({ status: 'ready', p }))
      .catch((err) => setState({ status: 'error', error: err.message }))
  }, [username])
  useEffect(() => {
    setState({ status: 'loading' })
    load()
  }, [load])

  const act = async (key, fn, msg) => {
    setBusy(key)
    try {
      await fn()
      if (msg) toast(msg, { tone: 'success' })
      invalidateFriends()
      refreshSummary()
      load()
    } catch (err) {
      toast(err.message, { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  if (state.status === 'loading')
    return (
      <div className="flex items-center gap-2 py-16 text-ink-2">
        <Spinner /> Buscando la ficha…
      </div>
    )
  if (state.status === 'error')
    return (
      <div className="py-16 text-center">
        <p className="font-display text-2xl">Esta ficha no está disponible</p>
        <p className="mt-2 text-ink-2">{state.error}</p>
        <Link to="/tertulia/amigos" className="btn mt-6">
          Volver a amigos
        </Link>
      </div>
    )
  const p = state.p
  const rel = p.relationship
  return (
    <div className="mx-auto max-w-3xl">
      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="paper-sheet mb-10 rounded-[6px] px-6 py-8 md:px-10">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:text-left">
          <Avatar person={p} size={104} />
          <div className="min-w-0 flex-1">
            <p className="kicker mb-1">Ficha de lector</p>
            <h1 className="font-display text-[2.4rem] leading-none">{p.name}</h1>
            <p className="mt-1 font-mono text-sm opacity-70">@{p.username}</p>
            {p.bio && <p className="mt-4 font-serif text-[1.1rem] leading-relaxed whitespace-pre-wrap">{p.bio}</p>}
            {p.friendsSince && <p className="mt-3 font-mono text-[11px] opacity-60">Amigos desde {when(p.friendsSince)}</p>}
            {p.affinity?.length > 0 && <p className="mt-3 text-sm">Os une: {p.affinity.join(', ')}</p>}
          </div>
        </div>
        {rel !== 'self' && (
          <div className="mt-6 flex flex-wrap justify-center gap-2 sm:justify-start">
            {rel === 'friends' && (
              <>
                <button className="btn btn-primary" onClick={() => act('letter', () => startLetter(navigate, { to: p.id }))} disabled={!!busy}>
                  {busy === 'letter' ? <Spinner size={14} /> : <Feather size={15} />} Escribirle una carta
                </button>
                <button className="btn" onClick={() => setConfirm('remove')} disabled={!!busy}>
                  <UserMinus size={15} /> Quitar amistad
                </button>
              </>
            )}
            {rel === 'none' && (
              <button className="btn btn-primary" onClick={() => act('send', () => socialApi.sendRequest(p.id), 'Solicitud enviada.')} disabled={!!busy}>
                {busy === 'send' ? <Spinner size={14} /> : <UserPlus size={15} />} Enviar solicitud de amistad
              </button>
            )}
            {rel === 'pending_out' && (
              <button className="btn" onClick={() => act('cancel', () => socialApi.cancel(p.requestId), 'Solicitud cancelada.')} disabled={!!busy || !p.requestId}>
                <X size={15} /> Cancelar solicitud
              </button>
            )}
            {rel === 'pending_in' && (
              <>
                <button className="btn btn-primary" onClick={() => act('accept', () => socialApi.accept(p.requestId), `Ya eres amigo de ${p.name}.`)} disabled={!!busy}>
                  <Check size={15} /> Aceptar solicitud
                </button>
                <button className="btn" onClick={() => act('decline', () => socialApi.decline(p.requestId))} disabled={!!busy}>
                  Ahora no
                </button>
              </>
            )}
            {rel === 'blocked' ? (
              <button className="btn btn-ghost" onClick={() => act('unblock', () => socialApi.unblock(p.id), 'Desbloqueado.')} disabled={!!busy}>
                Desbloquear
              </button>
            ) : (
              <button className="btn btn-ghost text-ink-3" onClick={() => setConfirm('block')} disabled={!!busy}>
                <Ban size={15} /> Bloquear
              </button>
            )}
          </div>
        )}
      </motion.header>

      {p.archetype?.name && (
        <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="mb-12 text-center">
          <p className="kicker mb-3">{p.name.split(' ')[0]} lee como…</p>
          <h2 className="mx-auto max-w-xl font-display text-[2rem] leading-[1.05] font-medium tracking-[0.03em] text-balance md:text-[2.8rem]" style={{ fontVariant: 'small-caps' }}>
            {p.archetype.name}
          </h2>
          {p.archetype.description && <p className="prose-book mx-auto mt-4 max-w-xl !text-[17px] italic">{p.archetype.description}</p>}
        </motion.section>
      )}

      {p.favoriteBooks?.length > 0 && (
        <section className="mb-12">
          <p className="kicker mb-1">{rel === 'self' ? 'Tu estantería' : 'Su estantería'}</p>
          <h2 className="mb-3 font-display text-2xl">{p.favoriteBooks.length === 1 ? 'El libro que le acompaña' : 'Libros que le acompañan'}</h2>
          <BookShelf books={p.favoriteBooks} />
        </section>
      )}

      {(p.genres?.length > 0 || p.authors?.length > 0) && (
        <section className="mb-12 grid gap-8 sm:grid-cols-2">
          {p.genres?.length > 0 && (
            <div>
              <p className="kicker mb-3">Géneros favoritos</p>
              <div className="flex flex-wrap gap-1.5">
                {p.genres.map((g) => (
                  <span key={g.key} className="chip !cursor-default">
                    {g.label}
                  </span>
                ))}
              </div>
            </div>
          )}
          {p.authors?.length > 0 && (
            <div>
              <p className="kicker mb-3">Autores de cabecera</p>
              <p className="font-serif text-[1.1rem] leading-relaxed italic">{p.authors.join(' · ')}</p>
            </div>
          )}
        </section>
      )}

      {p.writings?.length > 0 && (
        <section className="mb-12">
          <p className="kicker mb-1">Escritos</p>
          <h2 className="mb-4 font-display text-2xl">Lo que ha escrito</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {p.writings.map((w) => (
              <PublicationCard key={w.id} pub={w} showAuthor={false} />
            ))}
          </div>
        </section>
      )}

      {p.reading?.length > 0 && (
        <section className="mb-8">
          <p className="kicker mb-3">Leyendo ahora</p>
          <ul className="grid grid-cols-4 gap-4 sm:grid-cols-6">
            {p.reading.map((b, i) => (
              <li key={i}>
                <Cover book={b} compact />
                <p className="mt-2 line-clamp-2 text-xs">{b.title}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {rel !== 'self' && rel !== 'friends' && !p.genres && !p.authors && !p.favoriteBooks && !p.archetype && (
        <p className="text-center text-sm text-ink-3">El resto de su ficha solo lo ven sus amigos.</p>
      )}
      {rel === 'self' && (
        <p className="text-center text-sm text-ink-3">
          Así ven tu ficha los demás según tu privacidad. <Link to="/tertulia/ficha" className="text-dusk underline">Editarla</Link>
        </p>
      )}

      <ConfirmDialog
        open={confirm === 'remove'}
        onClose={() => setConfirm(null)}
        onConfirm={() => act('remove', () => socialApi.removeFriend(p.id), `${p.name} ya no está en tu tertulia.`)}
        title="Quitar de tus amigos"
        message="Dejaréis de ver lo que os habéis compartido. Las cartas ya enviadas se quedan en la correspondencia de cada uno."
        confirmLabel="Quitar amistad"
        danger
      />
      <ConfirmDialog
        open={confirm === 'block'}
        onClose={() => setConfirm(null)}
        onConfirm={() => act('block', () => socialApi.block(p.id), 'Bloqueado. No podrá encontrarte ni escribirte.')}
        title={`Bloquear a ${p.name}`}
        message="No podrá encontrarte, enviarte solicitudes ni compartir nada contigo, y termina vuestra amistad si la había. No recibirá ningún aviso. Las cartas que ya tienes se quedan contigo."
        confirmLabel="Bloquear"
        danger
      />
    </div>
  )
}
