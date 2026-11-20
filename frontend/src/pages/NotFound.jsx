import { Link } from 'react-router'

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="kicker mb-4">Error 404</p>
        <h1 className="font-display text-6xl font-light md:text-8xl">
          Página <em className="display-wonk text-accent">arrancada</em>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-ink-2">Esta página no existe o el libro ya no está en tu biblioteca.</p>
        <Link to="/" className="btn btn-primary mt-8">
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
