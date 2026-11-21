import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { BookPlus, Check, ExternalLink, Heart, RefreshCw, Trash2 } from 'lucide-react'
import { Spinner } from '../../components/ui/Bits'
import { Sheet } from '../../components/ui/Dialog'
import Cover from '../../components/book/Cover'
import Stars from '../../components/ui/Stars'
import { PoemText, RightsBadge } from '../../components/poetry/PoetryBits'
import { Avatar } from '../../components/social/SocialBits'
import { REACTIONS, socialApi, when } from '../../lib/social'
import { lifespan, poemPath, poetryApi } from '../../lib/poetry'
import { usePoetry } from '../../store/usePoetry'
import { useSocial } from '../../store/useSocial'
import { useStore } from '../../store/useStore'

function Note({ text, who }) {
  if (!text) return null
  return (
    <div className="journal relative mt-4 -rotate-[0.4deg] !py-2 !pl-[3.6rem] !text-[1.25rem] shadow-[0_6px_14px_-8px_rgba(0,0,0,0.5)]">
      <span className="absolute -top-2 left-8 h-4 w-14 rotate-[-4deg] bg-[rgba(233,163,79,0.35)]" aria-hidden="true" />
      <p className="whitespace-pre-wrap">{text}</p>
      {who && <p className="text-right text-[1.05rem] opacity-70">— {who}</p>}
    </div>
  )
}

function Reply({ item, onChange }) {
  const toast = useStore((s) => s.toast)
  const [reply, setReply] = useState(item.reply || '')
  const [busy, setBusy] = useState(false)
  if (item.direction === 'sent') {
    return item.reaction || item.reply ? (
      <div className="mt-4 rounded-2xl border border-line bg-surface-2/60 p-3 text-sm">
        <p className="kicker mb-1">Su respuesta</p>
        {item.reactionLabel && <p className="font-medium">«{item.reactionLabel}»</p>}
        {item.reply && <p className="mt-1 whitespace-pre-wrap text-ink-2">{item.reply}</p>}
      </div>
    ) : (
      <p className="mt-4 text-xs text-ink-3">{item.seen ? 'Lo ha visto.' : 'Aún no lo ha abierto.'}</p>
    )
  }
  const send = async (patch) => {
    setBusy(true)
    try {
      onChange(await socialApi.react(item.kind, item.id, patch))
    } catch (err) {
      toast(err.message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-5">
      <p className="kicker mb-2">Responder</p>
      <div className="flex flex-wrap gap-1.5">
        {REACTIONS[item.kind].map((r) => (
          <button key={r.key} className="chip !h-8 text-[13px]" data-active={item.reaction === r.key} disabled={busy} onClick={() => send({ reaction: item.reaction === r.key ? null : r.key })}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input className="field h-10 flex-1" maxLength={500} placeholder="Unas palabras para quien te lo envió…" value={reply} onChange={(e) => setReply(e.target.value)} />
        <button className="btn h-10" disabled={busy || reply === (item.reply || '')} onClick={() => send({ reply })}>
          {busy ? <Spinner size={13} /> : 'Enviar'}
        </button>
      </div>
    </div>
  )
}

function BookGift({ item, onChange }) {
  const addBook = useStore((s) => s.addBook)
  const openPreview = useStore((s) => s.openPreview)
  const toast = useStore((s) => s.toast)
  const findInLibrary = useStore((s) => s.findInLibrary)
  const [adding, setAdding] = useState(null)
  const book = item.book
  const mine = item.savedBookId ? { id: item.savedBookId } : findInLibrary(book)
  const add = async (status) => {
    setAdding(status)
    const res = await addBook(book, { status })
    setAdding(null)
    const saved = res.book
    if (saved) {
      await socialApi.markSaved('book', item.id, { bookId: saved.id }).catch(() => {})
      onChange({ ...item, savedBookId: saved.id })
      if (!res.duplicate) toast(`«${saved.title}» está ya en tu biblioteca.`, { tone: 'success' })
    }
  }
  return (
    <div>
      <div className="flex gap-5">
        <button className="w-28 shrink-0 sm:w-32" onClick={() => openPreview(book)} aria-label={`Ver la ficha de ${book.title}`}>
          <Cover book={book} />
        </button>
        <div className="min-w-0">
          <h2 className="font-display text-[1.7rem] leading-tight">{book.title}</h2>
          <p className="mt-1 text-ink-2">{book.authors.join(', ')}</p>
          {(book.year || book.publisher) && <p className="mt-1 font-mono text-[11px] text-ink-3">{[book.year, book.publisher].filter(Boolean).join(' · ')}</p>}
          {item.senderRating ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-ink-2">
              <Stars value={item.senderRating} size={14} /> <span>su valoración</span>
            </div>
          ) : null}
        </div>
      </div>
      <Note text={item.note} who={item.direction === 'received' ? item.person.name : null} />
      {book.description && <p className="mt-5 text-[15px] leading-relaxed text-ink-2">{book.description}</p>}
      {item.direction === 'received' && (
        <div className="mt-5 flex flex-wrap gap-2">
          {mine ? (
            <Link to={`/libro/${mine.id}`} className="btn btn-sm">
              <Check size={14} className="text-sage" /> En tu biblioteca
            </Link>
          ) : (
            <>
              <button className="btn btn-sm btn-primary" onClick={() => add('want')} disabled={!!adding}>
                {adding === 'want' ? <Spinner size={13} /> : <BookPlus size={14} />} Guardar en Quiero leer
              </button>
              <button className="btn btn-sm" onClick={() => add('reading')} disabled={!!adding}>
                {adding === 'reading' && <Spinner size={13} />} Empezar a leerlo
              </button>
            </>
          )}
          <button className="btn btn-sm btn-ghost" onClick={() => openPreview(book)}>
            Ver ficha
          </button>
        </div>
      )}
      <Reply item={item} onChange={onChange} />
    </div>
  )
}

function PoemGift({ item, onChange }) {
  const toast = useStore((s) => s.toast)
  const save = usePoetry((s) => s.save)
  const init = usePoetry((s) => s.init)
  const [saving, setSaving] = useState(false)
  const p = item.poem
  useEffect(() => init(), [init])
  const keep = async () => {
    setSaving(true)
    try {
      // The reader's own rights check decides what is stored in *their* collection.
      const rec = await poetryApi.poem(p.id)
      await save(rec)
      await socialApi.markSaved('poem', item.id)
      onChange({ ...item, saved: true })
      toast('Guardado en tu colección de poesía.', { tone: 'success' })
    } catch (err) {
      toast(err.message, { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }
  return (
    <div>
      <article className="poem-sheet poem-paper-crema px-6 pt-8 pb-6 md:px-10" lang={p.lang}>
        <h2 className="poem-title text-center text-[1.9rem]">{p.title}</h2>
        {p.altTitle && <p className="poem-meta mt-1 text-center font-serif italic">{p.altTitle}</p>}
        {p.author && (
          <p className="poem-accent mt-2 text-center font-serif text-lg italic">
            {p.author.name} {lifespan(p.author) && <span className="poem-meta not-italic">· {lifespan(p.author)}</span>}
          </p>
        )}
        {p.translator && <p className="poem-meta text-center font-serif text-sm italic">Traducción de {p.translator}</p>}
        <div className="poem-ornament my-5 text-[10px]">✦</div>
        {p.lines ? (
          <div className="mx-auto w-fit max-w-full">
            <PoemText lines={p.lines} className="font-serif text-[1.08rem] leading-[1.65]" />
          </div>
        ) : (
          <p className="poem-meta mx-auto max-w-md text-center font-serif italic">
            Este poema está protegido por derechos de autor o no podemos verificarlos, así que no se comparte su texto. Puedes leerlo en su fuente
            {p.rights?.status !== 'protected' ? ' o en el lector, si es libre en tu país' : ''}.
          </p>
        )}
        {p.attribution && <p className="poem-meta mt-8 border-t border-[rgba(60,40,22,0.14)] pt-3 text-center font-serif text-[12.5px] italic">{p.attribution}</p>}
      </article>
      <Note text={item.note} who={item.direction === 'received' ? item.person.name : null} />
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <RightsBadge rights={p.rights} short />
        <Link to={poemPath(p.id)} className="btn btn-sm">
          Abrir en el lector
        </Link>
        {p.source?.pageUrl && (
          <a className="btn btn-sm btn-ghost" href={p.source.pageUrl} target="_blank" rel="noreferrer">
            {p.source.name} <ExternalLink size={12} />
          </a>
        )}
        {item.direction === 'received' &&
          (item.saved ? (
            <span className="inline-flex items-center gap-1 text-sm text-sage">
              <Check size={14} /> En tu colección
            </span>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={keep} disabled={saving}>
              {saving ? <Spinner size={13} /> : <Heart size={14} />} Guardar en mi colección
            </button>
          ))}
      </div>
      <Reply item={item} onChange={onChange} />
    </div>
  )
}

function GiftSheet({ target, onClose, onChanged }) {
  const toast = useStore((s) => s.toast)
  const [state, setState] = useState({ status: 'loading' })
  useEffect(() => {
    if (!target) return
    setState({ status: 'loading' })
    socialApi
      .sharedItem(target.kind, target.id)
      .then((item) => {
        setState({ status: 'ready', item })
        onChanged(item)
      })
      .catch((err) => setState({ status: 'error', error: err.message }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.kind, target?.id])
  const item = state.item
  const update = (next) => {
    setState({ status: 'ready', item: next })
    onChanged(next)
  }
  const hide = async () => {
    try {
      await socialApi.hideShared(item.kind, item.id)
      onChanged({ ...item, removed: true })
      onClose()
    } catch (err) {
      toast(err.message, { tone: 'error' })
    }
  }
  return (
    <Sheet open={!!target} onClose={onClose} label="Obsequio">
      <div className="p-5 pt-14 md:p-8 md:pt-14">
        {state.status === 'loading' && <Spinner />}
        {state.status === 'error' && <p className="text-ink-2">{state.error}</p>}
        {item && (
          <>
            <div className="mb-6 flex items-center gap-3">
              <Avatar person={item.person} size={40} />
              <p className="text-sm text-ink-2">
                {item.direction === 'received' ? (
                  <>
                    <strong className="font-medium text-ink">{item.person.name}</strong> {item.kind === 'book' ? 'te recomienda este libro' : 'comparte contigo este poema'}
                  </>
                ) : (
                  <>
                    Para <strong className="font-medium text-ink">{item.person.name}</strong>
                  </>
                )}
                <span className="block font-mono text-[11px] text-ink-3">{when(item.createdAt)}</span>
              </p>
            </div>
            {item.kind === 'book' ? <BookGift item={item} onChange={update} /> : <PoemGift item={item} onChange={update} />}
            <div className="mt-8 border-t border-line pt-4">
              <button className="btn btn-sm btn-ghost text-ink-3" onClick={hide}>
                <Trash2 size={13} /> Quitar de {item.direction === 'received' ? 'mis obsequios' : 'mis enviados'}
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}

function GiftCard({ item, onOpen, index }) {
  const unseen = item.direction === 'received' && !item.seen
  return (
    <motion.li initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 10) * 0.03 }}>
      <button className="group block h-full w-full text-left" onClick={onOpen}>
        {item.kind === 'book' ? (
          <div className="flex h-full gap-4 rounded-3xl border border-line bg-surface/60 p-4 transition group-hover:border-line-strong">
            <div className="w-20 shrink-0">
              <Cover book={item.book} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="kicker mb-1">Libro recomendado</p>
              <p className="line-clamp-2 font-display text-[1.25rem] leading-tight">{item.book.title}</p>
              <p className="truncate text-sm text-ink-3">{item.book.authors.join(', ')}</p>
              {item.note && <p className="handwritten mt-2 line-clamp-2 text-[1.15rem] leading-tight text-ink-2">«{item.note}»</p>}
            </div>
          </div>
        ) : (
          <div className="poem-sheet poem-paper-crema flex h-full flex-col px-5 pt-5 pb-4 transition group-hover:-translate-y-0.5">
            <p className="poem-accent mb-1 font-mono text-[10px] tracking-[0.18em] uppercase">Poema</p>
            <p className="poem-title text-[1.3rem]">{item.poem.title}</p>
            <p className="poem-meta font-serif text-sm italic">{item.poem.author?.name}</p>
            {item.poem.lines?.length ? (
              <PoemText lines={item.poem.lines.slice(0, 4)} className="poem-meta mt-3 font-serif text-[14px] leading-[1.55]" />
            ) : (
              <p className="poem-meta mt-3 font-serif text-[13px] italic">Referencia y enlace a la fuente.</p>
            )}
          </div>
        )}
        <div className="mt-2 flex items-center gap-2 px-1 text-sm">
          <Avatar person={item.person} size={22} />
          <span className="min-w-0 flex-1 truncate text-ink-2">
            {item.direction === 'received' ? `De ${item.person.name}` : `Para ${item.person.name}`} · <span className="font-mono text-[11px] text-ink-3">{when(item.createdAt)}</span>
          </span>
          {unseen && <span className="h-2 w-2 rounded-full bg-accent letter-unread-dot" aria-label="Nuevo" />}
          {item.direction === 'sent' && (item.reaction || item.reply) && <span className="font-mono text-[10.5px] text-sage">respondido</span>}
        </div>
      </button>
    </motion.li>
  )
}

export default function Gifts() {
  const [params, setParams] = useSearchParams()
  const refreshSummary = useSocial((s) => s.refreshSummary)
  const box = params.get('caja') === 'enviados' ? 'sent' : 'received'
  const kind = ['book', 'poem'].includes(params.get('tipo')) ? params.get('tipo') : undefined
  const [state, setState] = useState({ status: 'loading', items: [] })
  const [target, setTarget] = useState(null)

  const load = useCallback(
    async (offset = 0) => {
      setState((s) => ({ ...s, status: offset ? 'more' : 'loading', ...(offset ? {} : { items: [] }) }))
      try {
        const r = await socialApi.shared({ box, kind, offset, limit: 18 })
        setState((s) => ({ status: 'ready', items: offset ? [...s.items, ...r.items] : r.items, next: r.next, unseen: r.unseen }))
      } catch (err) {
        setState((s) => ({ ...s, status: 'error', error: err.message }))
      }
    },
    [box, kind],
  )
  useEffect(() => {
    load(0)
  }, [load])
  useEffect(() => {
    const open = params.get('abrir')
    const m = open && /^(book|poem)-(\d+)$/.exec(open)
    if (m) setTarget({ kind: m[1], id: Number(m[2]) })
  }, [params])

  const set = (patch) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next)
  }
  const changed = (item) => {
    setState((s) => ({
      ...s,
      items: item.removed ? s.items.filter((i) => !(i.kind === item.kind && i.id === item.id)) : s.items.map((i) => (i.kind === item.kind && i.id === item.id ? { ...i, ...item, seen: true } : i)),
    }))
    refreshSummary()
  }
  const closeSheet = () => {
    setTarget(null)
    if (params.get('abrir')) set({ abrir: null })
  }

  return (
    <div>
      <header className="mb-8">
        <p className="kicker mb-3">Obsequios</p>
        <h1 className="font-display text-[2.4rem] leading-[1] font-light md:text-[3.4rem]">
          Libros y poemas <em className="display-wonk">que te regalan</em>
        </h1>
        <p className="mt-3 max-w-xl text-ink-2">Recomendaciones y poemas que tus amigos eligieron pensando en ti, con sus palabras.</p>
      </header>
      <div className="mb-8 flex flex-wrap items-center gap-2">
        <button className="chip" data-active={box === 'received'} onClick={() => set({ caja: null })}>
          Recibidos {state.unseen ? <span className="font-mono text-[11px] text-accent">{state.unseen} nuevos</span> : null}
        </button>
        <button className="chip" data-active={box === 'sent'} onClick={() => set({ caja: 'enviados' })}>
          Enviados
        </button>
        <span className="ml-auto flex gap-1">
          {[
            [undefined, 'Todo'],
            ['book', 'Libros'],
            ['poem', 'Poemas'],
          ].map(([k, label]) => (
            <button key={label} className="chip !h-8 text-[13px]" data-active={kind === k} onClick={() => set({ tipo: k })}>
              {label}
            </button>
          ))}
        </span>
      </div>
      {state.status === 'loading' ? (
        <div className="flex items-center gap-2 text-ink-2">
          <Spinner /> Cargando obsequios…
        </div>
      ) : state.status === 'error' ? (
        <div className="rounded-2xl border border-dashed border-line-strong p-8 text-center">
          <p className="text-ink-2">{state.error}</p>
          <button className="btn mt-4" onClick={() => load(0)}>
            <RefreshCw size={15} /> Reintentar
          </button>
        </div>
      ) : !state.items.length ? (
        <div className="rounded-3xl border border-dashed border-line-strong px-6 py-14 text-center">
          <p className="font-display text-2xl">{box === 'sent' ? 'Todavía no has regalado nada' : 'Aún no te han regalado libros ni poemas'}</p>
          <p className="mx-auto mt-2 max-w-md text-ink-2">
            {box === 'sent' ? (
              <>
                Desde la ficha de un libro de tu <Link to="/biblioteca" className="text-dusk underline">biblioteca</Link> o desde el lector de{' '}
                <Link to="/poesia" className="text-dusk underline">poesía</Link> puedes compartirlos con tus amigos.
              </>
            ) : (
              'Cuando un amigo te recomiende un libro o te comparta un poema, lo encontrarás aquí.'
            )}
          </p>
        </div>
      ) : (
        <>
          <ul className="grid gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
            {state.items.map((it, i) => (
              <GiftCard key={`${it.kind}-${it.id}`} item={it} index={i} onOpen={() => setTarget({ kind: it.kind, id: it.id })} />
            ))}
          </ul>
          {state.next != null && (
            <div className="mt-10 text-center">
              <button className="btn" onClick={() => load(state.next)} disabled={state.status === 'more'}>
                {state.status === 'more' && <Spinner size={14} />} Ver más
              </button>
            </div>
          )}
        </>
      )}
      <GiftSheet target={target} onClose={closeSheet} onChanged={changed} />
    </div>
  )
}
