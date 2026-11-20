import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { Spinner } from '../../components/ui/Bits'
import { PoetCard, SourceErrors, useJurisdiction } from '../../components/poetry/PoetryBits'
import { LANGS, poetryApi } from '../../lib/poetry'

const SECTIONS = { colombiana: 'Poesía colombiana', clasica: 'Poesía clásica', latinoamericana: 'Poesía latinoamericana', universal: 'Poesía universal', contemporanea: 'Poesía contemporánea' }
const ERAS = { antigua: 'Antigüedad', medieval: 'Edad Media', 'xvi-xvii': 'Siglos XVI–XVII', xviii: 'Siglo XVIII', xix: 'Siglo XIX', xx: 'Siglo XX' }
const MOVEMENTS = {
  antiguedad: 'Antigüedad', medieval: 'Edad Media', 'siglo-de-oro': 'Siglo de Oro', renacimiento: 'Renacimiento inglés', romanticismo: 'Romanticismo',
  simbolismo: 'Simbolismo', modernismo: 'Modernismo', 'generacion-27': 'Generación del 27', vanguardias: 'Vanguardias',
}

export default function PoetList() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [j] = useJurisdiction()
  const [state, setState] = useState({ status: 'loading' })
  const section = params.get('seccion') || ''
  const movement = params.get('movimiento') || ''
  const era = params.get('epoca') || ''
  const language = params.get('idioma') || ''

  useEffect(() => {
    const ctrl = new AbortController()
    setState({ status: 'loading' })
    poetryApi
      .poets({ section, movement, era, language }, ctrl.signal)
      .then((r) => setState({ status: 'ready', ...r }))
      .catch((err) => err.name !== 'AbortError' && setState({ status: 'error', error: err.message }))
    return () => ctrl.abort()
  }, [section, movement, era, language, j])

  const set = (k, v) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next)
  }
  const title = SECTIONS[section] || [MOVEMENTS[movement], ERAS[era]].filter(Boolean).join(' · ') || 'Todos los autores'

  return (
    <div>
      <button className="btn btn-ghost btn-sm mb-4 -ml-2" onClick={() => navigate('/poesia')}>
        <ArrowLeft size={15} /> Antología
      </button>
      <header className="mb-8">
        <p className="kicker kicker-dusk mb-2">Autores</p>
        <h1 className="font-display text-[2.3rem] leading-tight font-light md:text-[3.2rem]">{title}</h1>
        {!section && (
          <div className="mt-5 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-20 text-xs text-ink-3">Movimiento</span>
              <button className="chip" data-active={!movement} onClick={() => set('movimiento', '')}>
                Todos
              </button>
              {Object.entries(MOVEMENTS).map(([k, v]) => (
                <button key={k} className="chip" data-active={movement === k} onClick={() => set('movimiento', k)}>
                  {v}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-20 text-xs text-ink-3">Época</span>
              <button className="chip" data-active={!era} onClick={() => set('epoca', '')}>
                Todas
              </button>
              {Object.entries(ERAS).map(([k, v]) => (
                <button key={k} className="chip" data-active={era === k} onClick={() => set('epoca', k)}>
                  {v}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-20 text-xs text-ink-3">Idioma</span>
              <button className="chip" data-active={!language} onClick={() => set('idioma', '')}>
                Todos
              </button>
              {LANGS.map((l) => (
                <button key={l.key} className="chip" data-active={language === l.key} onClick={() => set('idioma', l.key)}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>
      {state.status === 'loading' && <Spinner />}
      {state.status === 'error' && <SourceErrors errors={[{ message: state.error }]} />}
      {state.status === 'ready' && (
        <>
          <SourceErrors errors={state.errors} />
          <p className="mb-4 font-mono text-[11px] text-ink-3">{state.poets.length} autores · fechas y retratos de Wikidata</p>
          {state.poets.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {state.poets.map((p) => (
                <PoetCard key={p.qid} poet={p} />
              ))}
            </div>
          ) : (
            <p className="text-ink-2">Ningún autor de la antología encaja con estos filtros.</p>
          )}
        </>
      )}
    </div>
  )
}
