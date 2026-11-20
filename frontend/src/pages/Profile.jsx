import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { Download, Moon, RotateCcw, Search, Sun, Trash2, Upload, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { api } from '../lib/api'
import { PageTitle, Spinner } from '../components/ui/Bits'
import BookPage from '../components/ui/BookPage'
import { ConfirmDialog } from '../components/ui/Dialog'

const PURPOSES = [
  { key: 'pensar', label: 'Pensar' },
  { key: 'sentir', label: 'Sentir' },
  { key: 'aprender', label: 'Aprender' },
  { key: 'escapar', label: 'Escapar' },
]

function Panel({ kicker, title, children, className = '' }) {
  return (
    <section className={`rounded-[26px] border border-line bg-surface p-6 md:p-7 ${className}`}>
      {kicker && <p className="kicker">{kicker}</p>}
      {title && <h2 className="mt-1 mb-5 font-display text-2xl">{title}</h2>}
      {children}
    </section>
  )
}

function AuthorEditor({ authors, onChange }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (q.trim().length < 2) return setRes([])
    const c = new AbortController()
    const t = setTimeout(() => {
      setLoading(true)
      api
        .authors(q.trim(), c.signal)
        .then(setRes)
        .catch(() => {})
        .finally(() => !c.signal.aborted && setLoading(false))
    }, 350)
    return () => {
      clearTimeout(t)
      c.abort()
    }
  }, [q])
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {authors.length === 0 && <p className="text-sm text-ink-3">Aún no has elegido autores favoritos.</p>}
        {authors.map((a) => (
          <span key={a.name} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pr-1.5 pl-3 text-sm">
            {a.name}
            <button onClick={() => onChange(authors.filter((x) => x.name !== a.name))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-surface-3" aria-label={`Quitar ${a.name}`}>
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <Search size={15} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
        <input className="field pl-10" placeholder="Añadir autor…" value={q} onChange={(e) => setQ(e.target.value)} />
        {loading && <Spinner size={14} className="absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-3" />}
      </div>
      {res.length > 0 && (
        <div className="mt-2 max-h-60 overflow-y-auto rounded-2xl border border-line p-1">
          {res.map((a) => (
            <button
              key={a.key}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-surface-2"
              onClick={() => {
                if (!authors.some((x) => x.name === a.name)) onChange([...authors, { name: a.name, key: a.key, photo: a.photo }])
                setQ('')
              }}
            >
              <span>
                {a.name} <span className="text-ink-3">{a.topWork ? `· «${a.topWork}»` : ''}</span>
              </span>
              <span className="text-xs text-ink-3">{a.workCount} obras</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Profile() {
  const navigate = useNavigate()
  const profile = useStore((s) => s.profile)
  const insights = useStore((s) => s.insights)
  const meta = useStore((s) => s.meta)
  const books = useStore((s) => s.books)
  const health = useStore((s) => s.health)
  const updateProfile = useStore((s) => s.updateProfile)
  const setTheme = useStore((s) => s.setTheme)
  const toast = useStore((s) => s.toast)
  const boot = useStore((s) => s.boot)
  const [name, setName] = useState(profile.displayName)
  const [goal, setGoal] = useState(profile.readingGoal)
  const [prefs, setPrefs] = useState({ complexity: 0, length: 0, pace: 0, focus: 0, era: 0, purposes: [], language: 'es', ...profile.preferences })
  const [dirtyPrefs, setDirtyPrefs] = useState(false)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const fileRef = useRef(null)

  const arche = insights?.archetype
  const taste = insights?.taste

  const savePrefs = async () => {
    await updateProfile({ preferences: prefs })
    setDirtyPrefs(false)
  }

  const exportData = async () => {
    try {
      const data = await api.get('/export', { images: 1 })
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `booktracker-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      toast('Copia de seguridad descargada.', { tone: 'success' })
    } catch (e) {
      toast(e.message, { tone: 'error' })
    }
  }

  const importData = async (file, replace = false) => {
    try {
      const data = replace ? pendingImport.data : JSON.parse(await file.text())
      const res = await api.post(replace ? '/import?replace=1' : '/import', data)
      toast(`Importados ${res.books} libros${res.writings != null ? ` y ${res.writings} escritos` : ''}.`, { tone: 'success' })
      setPendingImport(null)
      useStore.setState({ status: 'idle' })
      await boot()
    } catch (e) {
      if (e.status === 409 && e.payload?.needsConfirm) {
        // The account already has data: ask before replacing it.
        setPendingImport({ data: JSON.parse(await file.text()), books: e.payload.books, writings: e.payload.writings })
        return
      }
      toast(e instanceof SyntaxError ? 'El archivo no es un JSON válido.' : e.message, { tone: 'error' })
    }
  }

  const [pendingImport, setPendingImport] = useState(null)

  const wipe = async () => {
    try {
      await api.del('/data')
      useStore.setState({ status: 'idle', discover: { plan: null, sections: {}, seed: 0, version: -1 } })
      await boot()
      navigate('/bienvenida')
    } catch (e) {
      toast(e.message, { tone: 'error' })
    }
  }

  const axes = insights?.axes || []

  return (
    <div>
      <PageTitle kicker="Tu perfil lector">
        Tu <em className="display-wonk">ADN</em> literario
      </PageTitle>

      {/* Archetype poster */}
      {arche && (
        <BookPage
          className="mb-6"
          kicker="Tu arquetipo lector"
          title={arche.name}
          lead={arche.description}
          footer={`Construido con ${taste?.signals || 0} señales · ${books.length} libros en tu biblioteca`}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel kicker="Afinidades" title="Lo que define tu gusto">
          <div className="space-y-3">
            {(taste?.genres || []).slice(0, 7).map((g) => {
              const gm = meta.genres.find((x) => x.key === g.key)
              return (
                <div key={g.key}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{gm?.label || g.key}</span>
                    <span className="font-mono text-xs text-ink-3">{Math.round(g.weight * 100)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: gm ? `linear-gradient(90deg, ${gm.colors[0]}, ${gm.colors[1]})` : 'var(--accent)' }}
                      initial={{ width: 0 }}
                      animate={{ width: `${g.weight * 100}%` }}
                      transition={{ duration: 0.8 }}
                    />
                  </div>
                </div>
              )
            })}
            {!taste?.genres?.length && <p className="text-sm text-ink-3">Elige géneros o añade libros para ver tus afinidades.</p>}
          </div>
          {taste?.themes?.length > 0 && (
            <>
              <p className="kicker mt-7 mb-2">Temas recurrentes</p>
              <div className="flex flex-wrap gap-1.5">
                {taste.themes.map((t, i) => (
                  <span key={t.key} className="chip" style={{ opacity: 0.5 + t.weight * 0.5 }} data-active={i === 0}>
                    {t.label}
                  </span>
                ))}
              </div>
            </>
          )}
          {taste?.authors?.length > 0 && (
            <>
              <p className="kicker mt-7 mb-2">Autores con más peso</p>
              <p className="font-display text-lg leading-relaxed">{taste.authors.slice(0, 6).map((a) => a.name).join(' · ')}</p>
            </>
          )}
        </Panel>

        <Panel kicker="Preferencias" title="Cómo te gusta leer">
          <div className="space-y-5">
            {axes.map((ax) => (
              <div key={ax.axis}>
                <div className="mb-2 flex justify-between text-sm">
                  <span className={prefs[ax.axis] < 0 ? 'text-ink' : 'text-ink-3'}>{ax.low}</span>
                  <span className={prefs[ax.axis] > 0 ? 'text-ink' : 'text-ink-3'}>{ax.high}</span>
                </div>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.5}
                  value={prefs[ax.axis] ?? 0}
                  onChange={(e) => {
                    setPrefs({ ...prefs, [ax.axis]: Number(e.target.value) })
                    setDirtyPrefs(true)
                  }}
                  className="slider"
                  aria-label={`${ax.low} o ${ax.high}`}
                />
              </div>
            ))}
            <div>
              <p className="kicker mb-2">Lees para</p>
              <div className="flex flex-wrap gap-1.5">
                {PURPOSES.map((p) => {
                  const on = prefs.purposes?.includes(p.key)
                  return (
                    <button
                      key={p.key}
                      className="chip"
                      data-active={on}
                      onClick={() => {
                        setPrefs({ ...prefs, purposes: on ? prefs.purposes.filter((x) => x !== p.key) : [...(prefs.purposes || []), p.key] })
                        setDirtyPrefs(true)
                      }}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <label className="block">
              <span className="kicker mb-2 block">Idioma de las ediciones</span>
              <select
                className="field"
                value={prefs.language}
                onChange={(e) => {
                  setPrefs({ ...prefs, language: e.target.value })
                  setDirtyPrefs(true)
                }}
              >
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="any">Cualquiera (original)</option>
              </select>
            </label>
            <button className="btn btn-primary w-full" disabled={!dirtyPrefs} onClick={savePrefs}>
              {dirtyPrefs ? 'Guardar preferencias' : 'Preferencias guardadas'}
            </button>
          </div>
        </Panel>

        <Panel kicker="Géneros favoritos" title="Tus mundos">
          <div className="flex flex-wrap gap-1.5">
            {meta.genres.map((g) => {
              const on = profile.genres.includes(g.key)
              return (
                <button
                  key={g.key}
                  className="chip"
                  data-active={on}
                  onClick={() => updateProfile({ genres: on ? profile.genres.filter((x) => x !== g.key) : [...profile.genres, g.key] }, { quiet: true })}
                >
                  {g.label}
                </button>
              )
            })}
          </div>
          <p className="kicker mt-8 mb-3">Autores favoritos</p>
          <AuthorEditor authors={profile.favoriteAuthors} onChange={(a) => updateProfile({ favoriteAuthors: a }, { quiet: true })} />
        </Panel>

        <Panel kicker="Ajustes" title="Tu espacio">
          <div className="space-y-6">
            <label className="block">
              <span className="kicker mb-2 block">Nombre</span>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== profile.displayName && updateProfile({ displayName: name }, { quiet: true })} placeholder="¿Cómo te llamamos?" />
            </label>
            <label className="block">
              <span className="kicker mb-2 block">Reto de lectura {new Date().getFullYear()}</span>
              <div className="flex gap-2">
                <input type="number" min={1} max={500} className="field" value={goal} onChange={(e) => setGoal(e.target.value)} />
                <button className="btn shrink-0" disabled={Number(goal) === profile.readingGoal || !Number(goal)} onClick={() => updateProfile({ readingGoal: Number(goal) }, { quiet: true }).then(() => toast('Reto actualizado.', { tone: 'success' }))}>
                  Guardar
                </button>
              </div>
            </label>
            <div>
              <span className="kicker mb-2 block">Apariencia</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['ink', 'Noche', Moon],
                  ['paper', 'Papel', Sun],
                ].map(([k, label, Icon]) => (
                  <button
                    key={k}
                    onClick={() => setTheme(k)}
                    className={`flex h-14 items-center justify-center gap-2 rounded-2xl border font-medium transition ${profile.theme === k ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'}`}
                  >
                    <Icon size={16} /> {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="kicker mb-2 block">Fuentes bibliográficas</span>
              <ul className="space-y-1.5 text-sm">
                <li className="flex items-center justify-between">
                  <span>Open Library</span>
                  <span className={health?.sources?.openlibrary?.available === false ? 'text-accent' : 'text-sage'}>
                    {health?.sources?.openlibrary?.available === false ? 'No responde' : 'Conectada'}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Google Books</span>
                  <span className={health?.sources?.google?.available ? 'text-sage' : 'text-ink-3'}>
                    {health?.sources?.google?.available ? (health.sources.google.keyConfigured ? 'Conectada (con clave)' : 'Conectada') : health?.sources?.google?.keyConfigured ? 'Cuota agotada' : 'Sin clave · cuota pública agotada'}
                  </span>
                </li>
              </ul>
              {!health?.sources?.google?.keyConfigured && (
                <p className="mt-2 text-xs text-ink-3">Opcional: añade una clave gratuita de Google Books en backend/.env para enriquecer sinopsis en español. Todo funciona sin ella.</p>
              )}
            </div>
          </div>
        </Panel>
      </div>

      <Panel kicker="Tus datos" title="Copia de seguridad y reinicio" className="mt-6">
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={exportData}>
            <Download size={15} /> Exportar biblioteca (JSON)
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Importar copia
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files[0] && importData(e.target.files[0])} />
          <button className="btn" onClick={() => navigate('/bienvenida')}>
            <RotateCcw size={15} /> Repetir el onboarding
          </button>
          <button className="btn btn-ghost text-accent" onClick={() => setConfirmWipe(true)}>
            <Trash2 size={15} /> Borrar todos mis datos
          </button>
        </div>
        <p className="mt-3 text-xs text-ink-3">La copia incluye libros, listas, perfil, escritos del Estudio y sus portadas. Importar en una cuenta con datos te pide confirmación antes de reemplazarlos.</p>
      </Panel>

      <ConfirmDialog
        open={!!pendingImport}
        onClose={() => setPendingImport(null)}
        onConfirm={() => importData(null, true)}
        title="Esta cuenta ya tiene datos"
        message={`Ahora mismo tienes ${pendingImport?.books ?? 0} libros y ${pendingImport?.writings ?? 0} escritos. Importar la copia reemplazará la biblioteca, las listas y los escritos actuales por los del archivo. Exporta antes una copia si quieres conservarlos.`}
        confirmLabel="Reemplazar"
        danger
      />
      <ConfirmDialog
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        title="¿Borrar todos tus datos?"
        message="Se eliminarán tu biblioteca, tus listas, tus reseñas y tu perfil literario. Esta acción no se puede deshacer. Tus escritos del Estudio no se tocan. Si quieres conservarlo todo, exporta antes una copia."
        confirmLabel="Borrar todo"
        danger
        onConfirm={wipe}
      />
    </div>
  )
}
