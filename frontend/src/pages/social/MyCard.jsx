import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Eye, ImagePlus, Search, X } from 'lucide-react'
import { SectionHead, Spinner } from '../../components/ui/Bits'
import { Avatar } from '../../components/social/SocialBits'
import { prepareCover } from '../../lib/poetryCloud'
import { socialApi } from '../../lib/social'
import { fold } from '../../lib/match'
import { useStore } from '../../store/useStore'

const LEVELS = { everyone: 'Todo el mundo', friends: 'Solo mis amigos', nobody: 'Nadie' }
const FIELDS = [
  ['showGenres', 'Géneros favoritos'],
  ['showAuthors', 'Autores favoritos'],
  ['showBooks', 'Libros que me acompañan'],
  ['showReading', 'Lo que estoy leyendo'],
]

/** "Tu ficha": the public literary card and its privacy. */
export default function MyCard() {
  const toast = useStore((s) => s.toast)
  const books = useStore((s) => s.books)
  const [me, setMe] = useState(null)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [q, setQ] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    socialApi
      .me()
      .then((m) => {
        setMe(m)
        setForm({ displayName: m.displayName, username: m.username, bio: m.bio, favoriteBookIds: m.favoriteBooks.map((b) => b.bookId), privacy: m.privacy })
      })
      .catch((err) => setError(err.message))
  }, [])

  const candidates = useMemo(() => {
    const fq = fold(q)
    return books.filter((b) => !form?.favoriteBookIds.includes(b.id) && (!fq || fold(`${b.title} ${b.authors.join(' ')}`).includes(fq))).slice(0, 8)
  }, [books, q, form?.favoriteBookIds])

  if (error) return <p className="text-ink-2">No se pudo cargar tu ficha: {error}</p>
  if (!form)
    return (
      <div className="flex items-center gap-2 text-ink-2">
        <Spinner /> Cargando tu ficha…
      </div>
    )

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const setPrivacy = (patch) => setForm((f) => ({ ...f, privacy: { ...f.privacy, ...patch } }))
  const save = async (e) => {
    e?.preventDefault()
    setSaving(true)
    try {
      const m = await socialApi.updateMe(form)
      setMe(m)
      toast('Ficha guardada.', { tone: 'success' })
    } catch (err) {
      toast(err.message, { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }
  const avatarAction = async (fn) => {
    setUploading(true)
    try {
      setMe(await fn())
    } catch (err) {
      toast(err.message, { tone: 'error' })
    } finally {
      setUploading(false)
    }
  }
  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) avatarAction(async () => socialApi.uploadAvatar(await prepareCover(file, 512)))
  }
  const favs = form.favoriteBookIds.map((id) => books.find((b) => b.id === id)).filter(Boolean)

  return (
    <form onSubmit={save} className="mx-auto max-w-3xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker mb-3">Tu ficha</p>
          <h1 className="font-display text-[2.4rem] leading-[1] font-light md:text-[3.2rem]">
            Cómo te <em className="display-wonk">presentas</em>
          </h1>
        </div>
        <Link to={`/tertulia/lector/${me.username}`} className="btn">
          <Eye size={15} /> Ver como me ven
        </Link>
      </header>

      <section className="mb-10 rounded-3xl border border-line bg-surface/50 p-5 md:p-6">
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="flex flex-col items-center gap-3">
            <Avatar person={me} size={96} />
            <div className="flex flex-col gap-1.5">
              <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Spinner size={13} /> : <ImagePlus size={14} />} Subir foto
              </button>
              {me.googleAvatar && me.avatarMode !== 'google' && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => avatarAction(() => socialApi.updateMe({ avatarMode: 'google' }))}>
                  Usar la de Google
                </button>
              )}
              {me.avatarMode !== 'none' && (me.googleAvatar || me.hasCustomAvatar) && (
                <button type="button" className="btn btn-sm btn-ghost text-ink-3" onClick={() => avatarAction(() => socialApi.updateMe({ avatarMode: 'none' }))}>
                  Solo iniciales
                </button>
              )}
              {me.hasCustomAvatar && (
                <button type="button" className="btn btn-sm btn-ghost text-ink-3" onClick={() => avatarAction(() => socialApi.deleteAvatar())}>
                  Borrar mi foto
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onFile} />
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            <label className="block">
              <span className="kicker mb-1.5 block">Nombre visible</span>
              <input className="field" maxLength={80} value={form.displayName} placeholder={me.googleName || 'Tu nombre'} onChange={(e) => set({ displayName: e.target.value })} />
              {me.googleName && <span className="mt-1 block text-xs text-ink-3">En Google te llamas «{me.googleName}». Lo que escribas aquí tiene prioridad y Google no lo cambiará.</span>}
            </label>
            <label className="block">
              <span className="kicker mb-1.5 block">Nombre de usuario</span>
              <span className="relative block">
                <span className="absolute top-1/2 left-3.5 -translate-y-1/2 font-mono text-ink-3">@</span>
                <input className="field pl-8 font-mono" maxLength={24} value={form.username} onChange={(e) => set({ username: e.target.value.toLowerCase() })} pattern="[a-z0-9][a-z0-9_.]{1,22}[a-z0-9]" title="3 a 24 caracteres: letras, números, «_» o «.»" />
              </span>
            </label>
            <label className="block">
              <span className="kicker mb-1.5 block">Sobre ti</span>
              <textarea className="field" rows={3} maxLength={400} value={form.bio} onChange={(e) => set({ bio: e.target.value })} placeholder="Qué lees, qué escribes, qué te conmueve…" />
            </label>
          </div>
        </div>
      </section>

      <section className="mb-10">
        <SectionHead kicker="Libros que te acompañan" title="Elige hasta ocho de tu biblioteca" />
        {favs.length > 0 && (
          <ul className="mb-4 flex flex-wrap gap-2">
            {favs.map((b) => (
              <li key={b.id} className="chip !cursor-default">
                {b.title}
                <button type="button" onClick={() => set({ favoriteBookIds: form.favoriteBookIds.filter((x) => x !== b.id) })} aria-label={`Quitar ${b.title}`}>
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {form.favoriteBookIds.length < 8 && (
          <div>
            <div className="relative max-w-md">
              <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
              <input className="field h-10 pl-9" placeholder="Buscar en tu biblioteca" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {candidates.map((b) => (
                <button type="button" key={b.id} className="chip !h-8 text-[13px]" onClick={() => set({ favoriteBookIds: [...form.favoriteBookIds, b.id] })}>
                  + {b.title}
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-3">
          Tus géneros y autores favoritos se editan en tu <Link to="/perfil" className="text-dusk underline">perfil lector</Link>.
        </p>
      </section>

      <section className="mb-10 rounded-3xl border border-line bg-surface/50 p-5 md:p-6">
        <SectionHead kicker="Privacidad" title="Quién te encuentra y qué ve" />
        <label className="flex items-start gap-3 py-2">
          <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={form.privacy.discoverable} onChange={(e) => setPrivacy({ discoverable: e.target.checked })} />
          <span>
            <span className="block font-medium">Aparecer en la búsqueda por nombre y @usuario</span>
            <span className="block text-sm text-ink-3">Si lo desactivas, solo te verán tus amigos y quien tenga una solicitud contigo.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 py-2">
          <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={form.privacy.emailLookup} onChange={(e) => setPrivacy({ emailLookup: e.target.checked })} />
          <span>
            <span className="block font-medium">Permitir que me encuentren escribiendo mi correo exacto</span>
            <span className="block text-sm text-ink-3">
              Tu correo{me.email ? <> (<span className="font-mono">{me.email}</span>)</> : null} nunca se muestra a nadie: solo lo ves tú. Sirve para que quien ya lo conoce pueda encontrarte.
            </span>
          </span>
        </label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {FIELDS.map(([key, label]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-sm text-ink-2">{label}</span>
              <select className="field h-10" value={form.privacy[key]} onChange={(e) => setPrivacy({ [key]: e.target.value })}>
                {Object.entries(LEVELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-3">Tu nombre, tu @usuario, tu foto y tu presentación los ve quien puede ver tu ficha. Tus cartas nunca aparecen en ningún perfil.</p>
      </section>

      <div className="sticky bottom-24 z-10 flex justify-end lg:bottom-6">
        <button className="btn btn-primary h-11 px-6 shadow-[var(--shadow-pop)]" disabled={saving}>
          {saving && <Spinner size={15} />} Guardar ficha
        </button>
      </div>
    </form>
  )
}
