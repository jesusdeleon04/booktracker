import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowLeft,
  Check,
  CloudOff,
  Download,
  Image as ImageIcon,
  LoaderCircle,
  Mail,
  Megaphone,
  Maximize2,
  MoonStar,
  Minimize2,
  PanelRight,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useStudio } from '../../store/useStudio'
import { useStore } from '../../store/useStore'
import { CategoryList, CategoryStamp, Popover, WritingCover } from '../../components/studio/StudioBits'
import CoverPicker from '../../components/studio/CoverPicker'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { clock, drafts, lastCategory, longDate, newClientKey, relativeTime, rememberCategory, studioApi, studioPrefs, textStats } from '../../lib/studio'
import { authHeaders } from '../../lib/api'
import { typewriter } from '../../lib/typewriterSound'
import { lettersApi, when } from '../../lib/social'
import { brand, publish as publishCopy } from '../../lib/copy'

const AnthologyPanel = lazy(() => import('../../components/poetry/AnthologyPanel'))
const SendLetterDialog = lazy(() => import('../../components/social/SendLetterDialog'))
const PublishDialog = lazy(() => import('../../components/social/PublishDialog'))

const FIELDS = ['title', 'content', 'description', 'categoryId', 'coverImageId']
const SIZES = { s: 17, m: 19, l: 21 }
const LINE = 1.85

const pick = (w) => ({
  title: w.title || '',
  content: w.content || '',
  description: w.description || '',
  categoryId: w.categoryId ?? null,
  coverImageId: w.coverImageId ?? w.cover?.id ?? null,
})
const sameDoc = (a, b) => FIELDS.every((f) => (a?.[f] ?? null) === (b?.[f] ?? null))

/** Measures where the caret sits inside a textarea (pixels from its top). */
function useCaretMeter() {
  const mirror = useRef(null)
  useEffect(() => () => mirror.current?.remove(), [])
  return useCallback((el, pos) => {
    if (!el) return 0
    let m = mirror.current
    if (!m) {
      m = document.createElement('div')
      m.setAttribute('aria-hidden', 'true')
      document.body.appendChild(m)
      mirror.current = m
    }
    const cs = getComputedStyle(el)
    m.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;top:0;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;'
    for (const p of ['boxSizing', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'wordSpacing', 'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) {
      m.style[p] = cs[p]
    }
    m.style.width = `${el.clientWidth}px`
    m.textContent = el.value.slice(0, pos)
    const span = document.createElement('span')
    span.textContent = el.value.slice(pos, pos + 1) || '.'
    m.appendChild(span)
    return span.offsetTop
  }, [])
}

function SaveBadge({ state, isNew }) {
  const map = {
    saved: { icon: Check, text: state.at ? `Guardado · ${clock(state.at)}` : 'Guardado', tone: 'text-sage' },
    dirty: { icon: null, text: 'Sin guardar…', tone: 'text-ink-2', dot: true },
    saving: { icon: LoaderCircle, text: 'Guardando…', tone: 'text-ink-2', spin: true },
    offline: { icon: CloudOff, text: 'Sin conexión · a salvo en este dispositivo', tone: 'text-accent' },
    error: { icon: CloudOff, text: 'No se pudo guardar · reintentando (copia local a salvo)', tone: 'text-accent' },
    conflict: { icon: TriangleAlert, text: 'Hay otra versión de este escrito', tone: 'text-[var(--ember)]' },
    idle: { icon: null, text: isNew ? 'Empieza a escribir: se guarda solo' : 'Guardado', tone: 'text-ink-3' },
  }
  const s = map[state.status] || map.idle
  const Icon = s.icon
  return (
    <span className={`flex items-center gap-1.5 text-xs ${s.tone}`} role="status" aria-live="polite">
      {s.dot && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
      {Icon && <Icon size={13} className={s.spin ? 'animate-spin' : ''} />}
      {s.text}
    </span>
  )
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2 hover:bg-surface-2">
      <span className="mt-0.5">
        <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      </span>
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
    </label>
  )
}

export default function StudioEditor() {
  const { id: routeId } = useParams()
  const navigate = useNavigate()
  const categories = useStudio((s) => s.categories)
  const studioStatus = useStudio((s) => s.status)
  const loadStudio = useStudio((s) => s.load)
  const upsertWriting = useStudio((s) => s.upsertWriting)
  const createCategory = useStudio((s) => s.createCategory)
  const removeWriting = useStudio((s) => s.removeWriting)
  const toast = useStore((s) => s.toast)
  // Tertulia: any writing can be sent as a letter (multi-user mode only).
  const social = useStore((s) => s.authRequired)
  const senderName = useStore((s) => s.profile?.displayName || '')
  const [params] = useSearchParams()
  const letterMode = social && params.get('carta') === '1'
  const letterTo = Number(params.get('para')) || null
  const replyTo = Number(params.get('respuesta')) || null
  const [letterOpen, setLetterOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [sentLetters, setSentLetters] = useState(null)

  const [doc, setDoc] = useState(null)
  const [cover, setCover] = useState(null)
  const [meta, setMeta] = useState({})
  const [phase, setPhase] = useState('loading')
  const [notice, setNotice] = useState(null)
  const [save, setSave] = useState({ status: 'idle', at: null })
  const [prefs, setPrefsState] = useState(studioPrefs.read)
  const [focusMode, setFocusMode] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [catOpen, setCatOpen] = useState(false)
  const [coverOpen, setCoverOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [guideTop, setGuideTop] = useState(null)
  const [typing, setTyping] = useState(false)
  const [anthologyOpen, setAnthologyOpen] = useState(false)

  const textRef = useRef(null)
  const titleRef = useRef(null)
  const idRef = useRef(null)
  const versionRef = useRef(null)
  const clientKeyRef = useRef(null) // identity of a not-yet-created writing
  const createdAtRef = useRef(null) // identity of a created one (ids can be reused)
  const docRef = useRef(null)
  const sentRef = useRef(null) // last version of the fields the server has
  const caretRef = useRef({ caret: 0, scroll: 0 })
  const sentCaretRef = useRef(null)
  const timers = useRef({ debounce: null, max: null, local: null, typing: null })
  const inflight = useRef(false)
  const pending = useRef(false)
  const retryDelay = useRef(2000)
  const saveRef = useRef(null)
  const mountedRef = useRef(true)
  const deletedRef = useRef(false)
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const measureCaret = useCaretMeter()

  const fontSize = SIZES[prefs.size] || SIZES.m
  const lineHeightPx = fontSize * LINE
  const category = useMemo(() => categories.find((c) => c.id === doc?.categoryId) || null, [categories, doc?.categoryId])
  const stats = useMemo(() => textStats(doc?.content || ''), [doc?.content])

  const setPrefs = (patch) => {
    const next = { ...prefsRef.current, ...patch }
    setPrefsState(next)
    studioPrefs.write(next)
  }

  // ── local safety copy ───────────────────────────────────────────────────
  const writeLocalNow = useCallback(() => {
    if (!docRef.current || deletedRef.current) return true
    clearTimeout(timers.current.local)
    return drafts.write(idRef.current ?? 'new', {
      ...docRef.current,
      ...caretRef.current,
      baseVersion: versionRef.current,
      clientKey: clientKeyRef.current,
      writingCreatedAt: createdAtRef.current,
    })
  }, [])
  const writeLocalSoon = useCallback(() => {
    clearTimeout(timers.current.local)
    timers.current.local = setTimeout(writeLocalNow, 250)
  }, [writeLocalNow])

  // ── server save ─────────────────────────────────────────────────────────
  const schedule = useCallback((delay = 1200) => {
    const t = timers.current
    clearTimeout(t.debounce)
    t.debounce = setTimeout(() => saveRef.current(), delay)
    if (!t.max) t.max = setTimeout(() => {
      t.max = null
      saveRef.current()
    }, 8000)
  }, [])

  const performSave = useCallback(
    async ({ keepalive = false, force = false } = {}) => {
      const t = timers.current
      clearTimeout(t.debounce)
      clearTimeout(t.max)
      t.max = null
      const d = docRef.current
      if (!d || !sentRef.current || deletedRef.current) return
      const changed = {}
      FIELDS.forEach((f) => {
        if ((d[f] ?? null) !== (sentRef.current[f] ?? null)) changed[f] = d[f] ?? null
      })
      const hasChanges = Object.keys(changed).length > 0
      const caretChanged = caretRef.current.caret !== sentCaretRef.current
      if (!hasChanges && !caretChanged) {
        setSave((s) => (s.status === 'conflict' ? s : { status: 'saved', at: s.at }))
        return
      }
      if (!idRef.current && !d.title.trim() && !d.content.trim()) return // nothing worth creating yet
      if (keepalive) {
        // The page is going away: fire and forget; the local copy covers failures.
        if (!idRef.current) return
        const payload = { ...changed, ...caretRef.current, ...(hasChanges ? { baseVersion: versionRef.current } : {}) }
        if (payload.categoryId == null) delete payload.categoryId
        const body = JSON.stringify(payload)
        if (body.length < 60000) {
          try {
            fetch(`/api/studio/writings/${idRef.current}`, { method: 'PATCH', keepalive: true, headers: { 'Content-Type': 'application/json', ...authHeaders() }, body })
          } catch {
            /* the local draft will restore it */
          }
        }
        return
      }
      if (inflight.current) {
        pending.current = true
        return
      }
      inflight.current = true
      if (hasChanges) setSave((s) => ({ ...s, status: 'saving' }))
      const snapshot = { ...d }
      const caretSent = caretRef.current.caret
      try {
        let res
        if (!idRef.current) {
          res = await studioApi.create({ ...pick(d), caret: caretSent, clientKey: clientKeyRef.current })
          idRef.current = res.id
          createdAtRef.current = res.createdAt
          if (res.categoryId != null && docRef.current.categoryId == null) {
            docRef.current = { ...docRef.current, categoryId: res.categoryId }
            setDoc(docRef.current)
          }
          snapshot.categoryId = snapshot.categoryId ?? res.categoryId
          drafts.move('new', res.id, { writingCreatedAt: res.createdAt })
          navigate(`/estudio/escrito/${res.id}`, { replace: true })
        } else {
          const body = { ...changed, ...caretRef.current }
          if (body.categoryId == null) delete body.categoryId
          if (hasChanges) body.baseVersion = versionRef.current
          if (force) body.force = true
          res = await studioApi.patch(idRef.current, body)
        }
        versionRef.current = res.version
        sentRef.current = pick(snapshot)
        sentCaretRef.current = caretSent
        retryDelay.current = 2000
        upsertWriting(res)
        setMeta({ createdAt: res.createdAt, updatedAt: res.updatedAt, lastWrittenAt: res.lastWrittenAt })
        if (sameDoc(docRef.current, snapshot)) {
          drafts.clear(idRef.current)
          if (hasChanges) setSave({ status: 'saved', at: new Date() })
        } else {
          setSave((s) => ({ ...s, status: 'dirty' }))
          schedule(600)
        }
      } catch (err) {
        if (err.status === 409) {
          setNotice({ kind: 'conflict', server: err.payload?.writing })
          setSave((s) => ({ ...s, status: 'conflict' }))
        } else {
          setSave((s) => ({ ...s, status: navigator.onLine ? 'error' : 'offline' }))
          if (mountedRef.current && (!err.status || err.status >= 500)) {
            clearTimeout(t.debounce)
            t.debounce = setTimeout(() => saveRef.current(), retryDelay.current)
            retryDelay.current = Math.min(retryDelay.current * 2, 30000)
          }
        }
      } finally {
        inflight.current = false
        if (pending.current) {
          pending.current = false
          schedule(300)
        }
      }
    },
    [navigate, schedule, upsertWriting],
  )
  saveRef.current = performSave

  const update = useCallback(
    (patch) => {
      const next = { ...docRef.current, ...patch }
      docRef.current = next
      setDoc(next)
      setSave((s) => (s.status === 'conflict' ? s : { ...s, status: 'dirty' }))
      writeLocalSoon()
      schedule()
    },
    [schedule, writeLocalSoon],
  )

  // ── caret: guide line, eye-level scrolling, persistence ───────────────
  const rafRef = useRef(0)
  const refreshCaret = useCallback(
    ({ follow = false } = {}) => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const el = textRef.current
        if (!el) return
        const pos = el.selectionStart
        caretRef.current.caret = pos
        const top = measureCaret(el, pos)
        setGuideTop(top)
        if (follow && prefsRef.current.eyeLevel) {
          const y = el.getBoundingClientRect().top + top
          const vh = window.innerHeight
          if (y > vh * 0.62 || y < vh * 0.18) window.scrollBy({ top: y - vh * 0.42, behavior: 'smooth' })
        }
      })
    },
    [measureCaret],
  )

  // A new writing starts in the last category used (or «Otros»).
  useEffect(() => {
    const d = docRef.current
    if (!d || idRef.current || !categories.length) return
    if (d.categoryId != null && categories.some((c) => c.id === d.categoryId)) return
    const fallback = categories.find((c) => c.name.toLowerCase() === 'otros') || categories[0]
    docRef.current = { ...d, categoryId: fallback.id }
    setDoc(docRef.current)
  }, [categories, doc])

  // Browsers without `field-sizing: content` grow the textarea by hand.
  useLayoutEffect(() => {
    const el = textRef.current
    if (!el || (typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content'))) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [doc?.content, fontSize, phase])

  // ── load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (studioStatus === 'idle') loadStudio()
  }, [studioStatus, loadStudio])

  const restoredCaret = useRef(null)
  useEffect(() => {
    if (routeId !== 'nuevo' && Number(routeId) === idRef.current) return // created right here
    let alive = true
    setPhase('loading')
    setNotice(null)
    ;(async () => {
      if (routeId === 'nuevo') {
        const local = drafts.read('new')
        idRef.current = null
        versionRef.current = null
        createdAtRef.current = null
        clientKeyRef.current = local?.clientKey || newClientKey()
        sentRef.current = { title: '', content: '', description: '', categoryId: null, coverImageId: null }
        const initial = local
          ? pick(local)
          : { title: '', content: '', description: '', categoryId: lastCategory(), coverImageId: null }
        docRef.current = initial
        setDoc(initial)
        setCover(null)
        setMeta({})
        setSave({ status: 'idle', at: null })
        restoredCaret.current = { caret: local?.caret ?? initial.content.length, scroll: null }
        setPhase('ready')
        if (local && (local.content?.trim() || local.title?.trim())) {
          setNotice({ kind: 'restored', at: local.savedLocalAt })
          schedule(400)
        }
        return
      }
      try {
        const server = await studioApi.get(routeId)
        if (!alive) return
        const serverDoc = pick(server)
        const stored = drafts.read(server.id)
        const local = stored && stored.writingCreatedAt === server.createdAt ? stored : null
        if (stored && !local) drafts.clear(server.id) // left over from another writing with the same id
        idRef.current = server.id
        createdAtRef.current = server.createdAt
        clientKeyRef.current = null
        versionRef.current = server.version
        sentRef.current = serverDoc
        sentCaretRef.current = server.caret
        let initial = serverDoc
        let caret = server.caret
        if (local && !sameDoc(pick(local), serverDoc)) {
          initial = { ...pick(local), categoryId: local.categoryId ?? serverDoc.categoryId }
          caret = local.caret ?? caret
          if (local.baseVersion) versionRef.current = local.baseVersion
          setNotice({ kind: 'restored', at: local.savedLocalAt, server: serverDoc })
          schedule(600)
        } else if (local) {
          drafts.clear(server.id)
        }
        docRef.current = initial
        setDoc(initial)
        setCover(server.cover)
        setMeta({ createdAt: server.createdAt, updatedAt: server.updatedAt, lastWrittenAt: server.lastWrittenAt, inspiration: server.inspiration })
        setSave({ status: 'saved', at: null })
        restoredCaret.current = { caret: Math.min(caret ?? 0, initial.content.length), scroll: server.scroll }
        setPhase('ready')
      } catch (err) {
        if (alive) setPhase(err.status === 404 ? 'missing' : 'error')
      }
    })()
    return () => {
      alive = false
    }
  }, [routeId, schedule])

  // Put the writer back exactly where they left off.
  useLayoutEffect(() => {
    if (phase !== 'ready' || !restoredCaret.current || !textRef.current) return
    const el = textRef.current
    const { caret } = restoredCaret.current
    restoredCaret.current = null
    el.focus({ preventScroll: true })
    el.setSelectionRange(caret, caret)
    caretRef.current.caret = caret
    requestAnimationFrame(() => {
      const top = measureCaret(el, caret)
      setGuideTop(top)
      const y = el.getBoundingClientRect().top + window.scrollY + top
      window.scrollTo({ top: Math.max(0, y - window.innerHeight * 0.42) })
    })
  }, [phase, measureCaret])

  // ── leaving the page: never lose text ─────────────────────────────────
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        writeLocalNow()
        saveRef.current()
      }
    }
    const onBeforeUnload = (e) => {
      const stored = writeLocalNow()
      saveRef.current({ keepalive: true })
      const unsynced = docRef.current && sentRef.current && !sameDoc(docRef.current, sentRef.current)
      if (!stored && unsynced) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      caretRef.current.scroll = max > 0 ? Math.min(1, window.scrollY / max) : 0
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('scroll', onScroll, { passive: true })
    const t = timers.current
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('scroll', onScroll)
      writeLocalNow()
      saveRef.current()
      clearTimeout(t.typing)
    }
  }, [writeLocalNow])

  // ── focus mode ──────────────────────────────────────────────────────────
  const toggleFocus = useCallback(async (on) => {
    const next = on ?? !document.documentElement.classList.contains('studio-focusing')
    setFocusMode(next)
    document.documentElement.classList.toggle('studio-focusing', next)
    try {
      if (next && !document.fullscreenElement) await document.documentElement.requestFullscreen?.()
      if (!next && document.fullscreenElement) await document.exitFullscreen?.()
    } catch {
      /* fullscreen is optional */
    }
    textRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement && document.documentElement.classList.contains('studio-focusing')) {
        document.documentElement.classList.remove('studio-focusing')
        setFocusMode(false)
      }
    }
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        writeLocalNow()
        saveRef.current()
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        toggleFocus()
      } else if (e.key === 'Escape' && document.documentElement.classList.contains('studio-focusing') && !document.fullscreenElement) {
        toggleFocus(false)
      }
    }
    document.addEventListener('fullscreenchange', onFs)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      window.removeEventListener('keydown', onKey)
      document.documentElement.classList.remove('studio-focusing')
    }
  }, [toggleFocus, writeLocalNow])

  // ── letters sent from this draft (Tertulia) ────────────────────────────
  const loadSentLetters = useCallback(() => {
    if (!social || !idRef.current) return
    lettersApi
      .byWriting(idRef.current)
      .then(setSentLetters)
      .catch(() => setSentLetters([]))
  }, [social])
  useEffect(() => {
    if (panelOpen) loadSentLetters()
  }, [panelOpen, loadSentLetters])
  const flushForLetter = useCallback(async () => {
    writeLocalNow()
    await saveRef.current()
  }, [writeLocalNow])

  // ── typing ──────────────────────────────────────────────────────────────
  const onKeyDown = (e) => {
    setTyping(true)
    clearTimeout(timers.current.typing)
    timers.current.typing = setTimeout(() => setTyping(false), 1800)
    if (!prefsRef.current.sound || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
    if (e.key === 'Enter') typewriter.carriageReturn()
    else if (e.key === 'Backspace' || e.key === 'Delete') typewriter.backspace()
    else if (e.key === ' ') typewriter.space()
    else if (e.key.length === 1) {
      typewriter.key()
      const el = e.currentTarget
      const col = el.selectionStart - (el.value.lastIndexOf('\n', el.selectionStart - 1) + 1)
      if (col === 58) typewriter.bell()
    }
  }

  const download = () => {
    const d = docRef.current
    const name = (d.title || 'escrito').replace(/[\\/:*?"<>|]+/g, '').slice(0, 80) || 'escrito'
    const blob = new Blob([`${d.title ? `${d.title}\n\n` : ''}${d.content}\n`], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${name}.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // ── states ──────────────────────────────────────────────────────────────
  if (phase === 'missing' || phase === 'error') {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <p className="kicker mb-3">Writer's Studio</p>
          <h1 className="font-display text-4xl">{phase === 'missing' ? 'Este escrito ya no está aquí' : 'No pudimos abrir el escrito'}</h1>
          <p className="mt-3 text-ink-2">{phase === 'missing' ? 'Puede que lo hayas eliminado.' : `Comprueba que el servidor de ${brand.name} está en marcha.`}</p>
          <Link to="/estudio" className="btn btn-primary mt-6">
            Volver al estudio
          </Link>
        </div>
      </div>
    )
  }

  const isNew = !idRef.current
  const hideChrome = focusMode
  const lastWritten = meta.lastWrittenAt

  return (
    <div className={`min-h-dvh ${focusMode ? 'studio-focus' : ''}`}>
      {/* deeper shadow around the sheet while focusing */}
      <div
        className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-700"
        style={{ opacity: focusMode ? 1 : 0, background: 'radial-gradient(70% 80% at 50% 40%, transparent 35%, rgba(5,3,2,0.7))' }}
        aria-hidden="true"
      />

      {/* Top bar */}
      <header className={`studio-chrome studio-top fixed inset-x-0 top-0 z-30 ${hideChrome ? '' : 'max-md:border-b max-md:border-line max-md:bg-bg/90 max-md:backdrop-blur-md md:bg-gradient-to-b md:from-bg md:via-bg/85 md:to-transparent'}`}>
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:px-6">
          <Link to="/estudio" className="btn btn-ghost btn-sm" aria-label="Volver al estudio">
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Estudio</span>
          </Link>
          <div className="mx-auto hidden min-w-0 px-2 sm:block">
            <SaveBadge state={save} isNew={isNew} />
          </div>
          <div className="mx-auto sm:hidden" />
          <button
            className={`btn btn-ghost btn-icon btn-sm ${prefs.sound ? 'text-accent' : ''}`}
            onClick={() => setPrefs({ sound: !prefs.sound })}
            aria-label={prefs.sound ? 'Desactivar sonido de teclas' : 'Activar sonido de teclas'}
            title={prefs.sound ? 'Sonido de máquina: activado' : 'Sonido de máquina: desactivado'}
            aria-pressed={prefs.sound}
          >
            {prefs.sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <div className="relative">
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSettingsOpen(!settingsOpen)} aria-label="Ajustes de escritura" aria-expanded={settingsOpen}>
              <SlidersHorizontal size={16} />
            </button>
            <Popover open={settingsOpen} onClose={() => setSettingsOpen(false)} align="right" className="w-72 p-2">
              <p className="kicker px-3 pt-1 pb-2">Tamaño de la letra</p>
              <div className="mb-2 grid grid-cols-3 gap-1 px-2">
                {Object.entries(SIZES).map(([k, px]) => (
                  <button key={k} onClick={() => setPrefs({ size: k })} className={`rounded-lg py-1.5 font-mono transition ${prefs.size === k ? 'bg-ink text-bg' : 'hover:bg-surface-2'}`} style={{ fontSize: px - 4 }}>
                    Aa
                  </button>
                ))}
              </div>
              <Toggle label="Sonido de máquina de escribir" hint="Teclas, retorno de carro y campanilla." checked={prefs.sound} onChange={(v) => setPrefs({ sound: v })} />
              <Toggle label="Línea guía" hint="Resalta suavemente la línea en la que escribes." checked={prefs.guide} onChange={(v) => setPrefs({ guide: v })} />
              <Toggle label="Escribir a la altura de los ojos" hint="La página sube sola para que no escribas al borde de la pantalla." checked={prefs.eyeLevel} onChange={(v) => setPrefs({ eyeLevel: v })} />
              <Toggle label="Mostrar contadores" hint="Palabras, caracteres y tiempo de lectura." checked={prefs.counters} onChange={(v) => setPrefs({ counters: v })} />
            </Popover>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => toggleFocus()} aria-label={focusMode ? 'Salir del modo enfoque' : 'Modo enfoque sin distracciones'} title="Modo enfoque (Ctrl+Mayús+F)">
            {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            className={`btn btn-ghost btn-icon btn-sm ${anthologyOpen ? 'bg-surface-2 text-dusk' : ''}`}
            onClick={() => setAnthologyOpen(!anthologyOpen)}
            aria-expanded={anthologyOpen}
            aria-label="Antología: consultar tus poemas guardados"
            title="Antología de poesía"
          >
            <MoonStar size={16} />
          </button>
          {social && !letterMode && (
            <button
              className="btn btn-sm btn-share"
              onClick={() => setPublishOpen(true)}
              disabled={isNew || phase !== 'ready'}
              aria-label={publishCopy.action}
              title={isNew ? 'Escribe algo primero: se publica un escrito guardado' : 'Publicar este escrito en la Tertulia'}
            >
              <Megaphone size={15} /> <span className="hidden sm:inline">{publishCopy.action}</span>
            </button>
          )}
          {social && (
            <button
              className={`btn btn-sm ${letterMode ? 'btn-primary' : ''}`}
              onClick={() => setLetterOpen(true)}
              disabled={isNew || phase !== 'ready'}
              aria-label="Enviar como carta"
              title={isNew ? 'Escribe algo primero: la carta sale de un borrador guardado' : 'Enviar este escrito como carta a tus amigos'}
            >
              <Mail size={15} /> <span className="hidden sm:inline">Enviar carta</span>
            </button>
          )}
          <button className={`btn btn-sm ${panelOpen ? 'bg-surface-2' : ''}`} onClick={() => setPanelOpen(!panelOpen)} aria-expanded={panelOpen}>
            <PanelRight size={15} /> <span className="hidden sm:inline">Detalles</span>
          </button>
        </div>
      </header>

      <main className={`relative z-10 mx-auto max-w-[880px] px-2 pt-20 pb-40 transition-transform duration-500 sm:px-6 ${panelOpen ? 'xl:-translate-x-[170px]' : ''}`}>
        <AnimatePresence>
          {notice && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`studio-chrome mb-4 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${notice.kind === 'conflict' ? 'border-[var(--ember)]/50 bg-[var(--ember)]/10' : 'border-accent/40 bg-accent-soft'}`}
            >
              <TriangleAlert size={16} className={notice.kind === 'conflict' ? 'text-[var(--ember)]' : 'text-accent'} />
              {notice.kind === 'restored' ? (
                <>
                  <span className="flex-1">Recuperamos lo que escribiste{notice.at ? ` ${relativeTime(new Date(notice.at).toISOString())}` : ''} y no llegó a guardarse. Ya está a salvo.</span>
                  {notice.server && (
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        docRef.current = { ...notice.server }
                        setDoc(docRef.current)
                        drafts.clear(idRef.current)
                        clearTimeout(timers.current.debounce)
                        setSave({ status: 'saved', at: null })
                        setNotice(null)
                      }}
                    >
                      Descartar y usar la versión guardada
                    </button>
                  )}
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setNotice(null)} aria-label="Cerrar aviso">
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1">Este escrito se modificó en otra ventana mientras escribías. Tu texto sigue aquí; elige qué versión conservar.</span>
                  <button className="btn btn-sm" onClick={download}>
                    <Download size={13} /> Descargar la mía
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      const w = notice.server
                      if (!w) return
                      versionRef.current = w.version
                      sentRef.current = pick(w)
                      docRef.current = pick(w)
                      setDoc(docRef.current)
                      drafts.clear(idRef.current)
                      setSave({ status: 'saved', at: null })
                      setNotice(null)
                    }}
                  >
                    Usar la otra
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setNotice(null)
                      setSave((s) => ({ ...s, status: 'dirty' }))
                      performSave({ force: true })
                    }}
                  >
                    Conservar la mía
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {letterMode && phase === 'ready' && (
          <div className="studio-chrome mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface/80 px-4 py-3 text-sm">
            <Mail size={16} className="text-accent" />
            <span className="min-w-0 flex-1">
              {replyTo ? 'Estás respondiendo a una carta.' : 'Estás escribiendo una carta.'} Se guarda sola como borrador en tu estudio y solo sale cuando la selles.
            </span>
            <button className="btn btn-primary btn-sm" onClick={() => setLetterOpen(true)} disabled={isNew}>
              Enviar carta
            </button>
          </div>
        )}

        {phase === 'loading' || !doc ? (
          <div className="mt-10">
            <div className="platen mx-6 sm:mx-12" />
            <div className="manuscript typewriter-sheet -mt-3 h-[70vh] rounded-b-[4px] opacity-80" />
          </div>
        ) : (
          <>
            {/* The platen the sheet comes out of */}
            <div className="platen relative z-20 mx-5 sm:mx-12" aria-hidden="true" />
            <motion.div
              initial={{ y: -40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.7, ease: [0.2, 0.75, 0.2, 1] }}
              className="manuscript typewriter-sheet relative z-10 -mt-3 rounded-b-[4px] px-5 pt-14 pb-[40vh] sm:px-14 md:px-20"
              onClick={(e) => {
                if (e.target === e.currentTarget) textRef.current?.focus()
              }}
            >
              <input
                ref={titleRef}
                value={doc.title}
                onChange={(e) => update({ title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    textRef.current?.focus()
                  }
                }}
                placeholder="SIN TÍTULO"
                maxLength={300}
                className="typewriter-input text-center text-[clamp(19px,2.6vw,26px)] font-bold tracking-[0.12em] uppercase"
                aria-label="Título del escrito"
              />
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                <div className="relative">
                  <button onClick={() => setCatOpen(!catOpen)} className="transition hover:scale-105" aria-label="Elegir categoría" aria-expanded={catOpen}>
                    {category ? <CategoryStamp category={category} className="!text-[11.5px]" /> : <span className="stamp text-[var(--typed)]/60">Elegir categoría</span>}
                  </button>
                  <Popover open={catOpen} onClose={() => setCatOpen(false)} align="center" className="w-64">
                    <CategoryList
                      categories={categories}
                      value={doc.categoryId}
                      onCreate={(name) => createCategory(name)}
                      onChange={(id) => {
                        update({ categoryId: id })
                        rememberCategory(id)
                        setCatOpen(false)
                      }}
                    />
                  </Popover>
                </div>
                <span className="typed text-[12px] opacity-60">{longDate(meta.createdAt || new Date().toISOString())}</span>
              </div>
              {meta.inspiration && (
                <p className="typed mt-3 text-center text-[12px] opacity-70">
                  {meta.inspiration.kind === 'reflection' ? 'Reflexión sobre ' : 'Inspirado en '}
                  <Link to={`/poesia/poema/${encodeURIComponent(meta.inspiration.poemId)}`} className="underline decoration-dotted underline-offset-4 hover:opacity-100">
                    «{meta.inspiration.title}»{meta.inspiration.author ? `, de ${meta.inspiration.author}` : ''}
                  </Link>
                </p>
              )}
              <div className="typed mx-auto mt-6 mb-10 h-px w-24 bg-current opacity-25" />

              <div className="relative">
                {prefs.guide && guideTop !== null && (
                  <div className="line-guide" style={{ top: guideTop, height: lineHeightPx, opacity: typing || !focusMode ? 1 : 0.6 }} aria-hidden="true" />
                )}
                <textarea
                  ref={textRef}
                  value={doc.content}
                  onChange={(e) => {
                    update({ content: e.target.value })
                    refreshCaret({ follow: true })
                  }}
                  onKeyDown={onKeyDown}
                  onSelect={() => {
                    refreshCaret()
                    writeLocalSoon()
                  }}
                  onFocus={() => refreshCaret()}
                  placeholder="Empieza a escribir. Todo se guarda solo, palabra a palabra."
                  spellCheck
                  className="typewriter-input autosize relative min-h-[45vh]"
                  style={{ fontSize, lineHeight: LINE }}
                  aria-label="Texto del escrito"
                  rows={8}
                />
              </div>
            </motion.div>
          </>
        )}
      </main>

      {anthologyOpen && (
        <Suspense fallback={null}>
          <AnthologyPanel open={!hideChrome} onClose={() => setAnthologyOpen(false)} />
        </Suspense>
      )}

      {/* Status line, typed at the bottom like a page footer */}
      {doc && (
        <footer className={`studio-chrome pointer-events-none fixed inset-x-0 bottom-3 z-30 flex justify-center px-3 transition-transform duration-500 ${panelOpen ? 'xl:-translate-x-[170px]' : ''}`}>
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-line bg-bg/85 px-4 py-2 font-mono text-[11.5px] text-ink-2 shadow-[var(--shadow-pop)] backdrop-blur">
            {prefs.counters && (
              <>
                <span>{stats.words.toLocaleString('es-ES')} palabras</span>
                <span className="text-ink-3">·</span>
                <span>{stats.chars.toLocaleString('es-ES')} caracteres</span>
                <span className="text-ink-3">·</span>
                <span>{stats.minutes ? `${stats.minutes} min de lectura` : 'sin leer aún'}</span>
                {lastWritten && (
                  <>
                    <span className="hidden text-ink-3 sm:inline">·</span>
                    <span className="hidden sm:inline">última escritura {relativeTime(lastWritten)}</span>
                  </>
                )}
                <span className="text-ink-3">·</span>
              </>
            )}
            <SaveBadge state={save} isNew={isNew} />
          </div>
        </footer>
      )}

      {/* Details panel */}
      <AnimatePresence>
        {panelOpen && doc && (
          <motion.aside
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="studio-chrome fixed inset-x-0 bottom-0 z-40 max-h-[82dvh] overflow-y-auto rounded-t-[26px] border border-line bg-surface p-5 shadow-[var(--shadow-pop)] md:inset-x-auto md:top-20 md:right-4 md:bottom-4 md:max-h-none md:w-[340px] md:rounded-[26px]"
            aria-label="Detalles del escrito"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl">Detalles</h2>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setPanelOpen(false)} aria-label="Cerrar detalles">
                <X size={16} />
              </button>
            </div>

            <p className="kicker mb-2">Portada</p>
            <div className="flex gap-4">
              <div className="w-28 shrink-0">
                <WritingCover writing={{ ...doc, cover }} category={category} />
              </div>
              <div className="flex flex-col justify-center gap-2">
                <button className="btn btn-sm" onClick={() => setCoverOpen(true)} disabled={isNew}>
                  <ImageIcon size={13} /> {cover ? 'Cambiar' : 'Añadir imagen'}
                </button>
                {cover && (
                  <button
                    className="btn btn-sm btn-ghost text-ink-3"
                    onClick={() => {
                      setCover(null)
                      update({ coverImageId: null })
                    }}
                  >
                    Quitar imagen
                  </button>
                )}
                {isNew && <p className="text-xs text-ink-3">Escribe algo primero y podrás añadir una portada.</p>}
              </div>
            </div>

            <p className="kicker mt-6 mb-2">Categoría</p>
            <div className="rounded-2xl border border-line p-1">
              <CategoryList
                categories={categories}
                value={doc.categoryId}
                onCreate={(name) => createCategory(name)}
                onChange={(id) => {
                  update({ categoryId: id })
                  rememberCategory(id)
                }}
              />
            </div>

            <label className="mt-6 block">
              <span className="kicker mb-2 block">Descripción (opcional)</span>
              <textarea
                className="field min-h-24 font-serif text-[15px]"
                maxLength={600}
                placeholder="Unas líneas para recordar de qué va…"
                value={doc.description}
                onChange={(e) => update({ description: e.target.value })}
              />
            </label>

            <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="kicker !text-[10px]">Palabras</dt>
                <dd>{stats.words.toLocaleString('es-ES')}</dd>
              </div>
              <div>
                <dt className="kicker !text-[10px]">Caracteres</dt>
                <dd>
                  {stats.chars.toLocaleString('es-ES')} <span className="text-ink-3">({stats.charsNoSpaces.toLocaleString('es-ES')} sin espacios)</span>
                </dd>
              </div>
              <div>
                <dt className="kicker !text-[10px]">Lectura</dt>
                <dd>{stats.minutes ? `~${stats.minutes} min` : '—'}</dd>
              </div>
              <div>
                <dt className="kicker !text-[10px]">Creado</dt>
                <dd>{meta.createdAt ? longDate(meta.createdAt) : 'Aún sin guardar'}</dd>
              </div>
              <div>
                <dt className="kicker !text-[10px]">Modificado</dt>
                <dd>{meta.updatedAt ? relativeTime(meta.updatedAt) : '—'}</dd>
              </div>
              <div>
                <dt className="kicker !text-[10px]">Última escritura</dt>
                <dd>{meta.lastWrittenAt ? relativeTime(meta.lastWrittenAt) : '—'}</dd>
              </div>
            </dl>

            {social && !isNew && (
              <div className="mt-6 border-t border-line pt-5">
                <p className="kicker mb-2">Enviado como carta</p>
                {sentLetters === null ? (
                  <p className="text-xs text-ink-3">Consultando…</p>
                ) : sentLetters.length ? (
                  <ul className="space-y-1.5 text-sm">
                    {sentLetters.map((l) => (
                      <li key={l.id}>
                        <Link to={`/tertulia/cartas/${l.id}`} className="hover:underline">
                          A {l.to.join(', ') || 'alguien que ya no está'}
                        </Link>{' '}
                        <span className="text-xs text-ink-3">· {when(l.sentAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-ink-3">Todavía no lo has enviado. Las cartas enviadas no cambian aunque sigas editando este borrador.</p>
                )}
                <button className="btn btn-sm mt-3" onClick={() => setLetterOpen(true)}>
                  <Mail size={13} /> Enviar como carta
                </button>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
              <button className="btn btn-sm" onClick={download}>
                <Download size={13} /> Descargar .txt
              </button>
              {!isNew && (
                <button className="btn btn-sm btn-ghost text-[var(--ember)]" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={13} /> Eliminar escrito
                </button>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {social && publishOpen && (
        <Suspense fallback={null}>
          <PublishDialog open={publishOpen} onClose={() => setPublishOpen(false)} writingId={idRef.current} flush={flushForLetter} />
        </Suspense>
      )}

      {social && letterOpen && (
        <Suspense fallback={null}>
          <SendLetterDialog
            open={letterOpen}
            onClose={() => setLetterOpen(false)}
            writingId={idRef.current}
            getDoc={() => docRef.current}
            flush={flushForLetter}
            preselect={letterTo ? [letterTo] : []}
            replyTo={replyTo}
            senderName={senderName}
            onSent={loadSentLetters}
          />
        </Suspense>
      )}
      <CoverPicker
        open={coverOpen}
        onClose={() => setCoverOpen(false)}
        writing={doc ? { ...doc, cover } : null}
        category={category}
        onSelect={async (img) => {
          setCover(img || null)
          update({ coverImageId: img ? img.id : null })
          writeLocalNow()
          await saveRef.current()
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="¿Eliminar este escrito?"
        message="Se borrará de tu estudio. Podrás deshacerlo durante unos segundos desde el aviso que aparecerá."
        confirmLabel="Eliminar escrito"
        danger
        onConfirm={async () => {
          const id = idRef.current
          deletedRef.current = true
          clearTimeout(timers.current.debounce)
          clearTimeout(timers.current.max)
          clearTimeout(timers.current.local)
          drafts.clear(id)
          navigate('/estudio')
          await removeWriting(id)
        }}
      />
    </div>
  )
}
