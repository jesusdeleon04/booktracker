import { Link } from 'react-router'
import { Wordmark } from '../components/layout/AppShell'

/** Public page (no login): what BookTracker stores and how to remove it. */
export default function Privacy() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <Wordmark />
      <h1 className="mt-10 font-display text-[2.6rem] leading-tight font-light">Política de privacidad</h1>
      <div className="mt-6 space-y-5 font-serif text-[1.08rem] leading-relaxed text-ink-2">
        <p>BookTracker es un proyecto personal y educativo para llevar el registro de tus lecturas, escribir y guardar poesía. Esta página explica qué datos guardamos y cómo borrarlos.</p>
        <h2 className="font-display text-2xl text-ink">Qué datos guardamos</h2>
        <ul className="list-disc space-y-1.5 pl-6">
          <li>Al iniciar sesión con Google: tu correo electrónico y tu nombre, solo para identificar tu cuenta. No accedemos a tu Gmail, contactos ni Drive.</li>
          <li>Lo que tú creas en la app: libros, listas, reseñas, tu perfil lector, tus escritos y portadas del Estudio y tu colección de poesía.</li>
        </ul>
        <h2 className="font-display text-2xl text-ink">Quién puede verlos</h2>
        <p>Solo tú. Cada cuenta tiene sus propios datos y ninguna otra persona puede consultarlos. No vendemos ni compartimos tus datos, y no usamos publicidad.</p>
        <h2 className="font-display text-2xl text-ink">Dónde se guardan</h2>
        <p>En Supabase (base de datos y autenticación). Para mostrar libros y poemas consultamos servicios públicos como Open Library, Wikisource, Wikidata y PoetryDB, a los que no enviamos tus datos personales.</p>
        <h2 className="font-display text-2xl text-ink">Cómo borrar tus datos</h2>
        <p>Desde tu perfil puedes exportar una copia de todo y usar «Borrar todos mis datos». Para eliminar también tu cuenta, escribe a quien administra la app y la borraremos junto con todo lo asociado.</p>
      </div>
      <Link to="/" className="btn mt-10">Volver a BookTracker</Link>
    </div>
  )
}
