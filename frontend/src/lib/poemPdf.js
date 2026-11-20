// Editorial PDF of a poem (A5), generated in the browser with embedded OFL fonts.
// Fonts are embedded whole: pdf-lib's subsetting drops glyphs of fonts with
// ligature tables (EB Garamond, Cormorant), which made letters vanish.
// Only free texts (public domain / open licence for the reader's jurisdiction)
// can be exported: the caller never receives protected lines from the API, and
// this module refuses to build an empty or reference-only PDF.
import { PDFDocument, rgb, degrees } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import ebRegular from '@expo-google-fonts/eb-garamond/400Regular/EBGaramond_400Regular.ttf?url'
import ebItalic from '@expo-google-fonts/eb-garamond/400Regular_Italic/EBGaramond_400Regular_Italic.ttf?url'
import cormorantMedium from '@expo-google-fonts/cormorant-garamond/500Medium/CormorantGaramond_500Medium.ttf?url'
import courierRegular from '@expo-google-fonts/courier-prime/400Regular/CourierPrime_400Regular.ttf?url'
import courierBold from '@expo-google-fonts/courier-prime/700Bold/CourierPrime_700Bold.ttf?url'
import courierItalic from '@expo-google-fonts/courier-prime/400Regular_Italic/CourierPrime_400Regular_Italic.ttf?url'
import sansRegular from '@expo-google-fonts/instrument-sans/400Regular/InstrumentSans_400Regular.ttf?url'
import sansSemi from '@expo-google-fonts/instrument-sans/600SemiBold/InstrumentSans_600SemiBold.ttf?url'
import sansItalic from '@expo-google-fonts/instrument-sans/400Regular_Italic/InstrumentSans_400Regular_Italic.ttf?url'
import { lifespan, pubLine } from './poetry'

const hex = (h) => {
  const n = parseInt(h.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

export const PDF_STYLES = {
  clasico: {
    label: 'Clásico',
    hint: 'Garamond sobre papel crema, título centrado y ornamento.',
    // Cormorant's italic can't be embedded by fontkit; EB Garamond's italic pairs well.
    fonts: { title: cormorantMedium, titleItalic: ebItalic, body: ebRegular, italic: ebItalic },
    bg: '#f8f1e3', ink: '#2a1e15', soft: '#7a6650', accent: '#9c5a22',
    titleSize: 23, bodySize: 11.6, leading: 1.5, align: 'center', upperTitle: false,
  },
  moderno: {
    label: 'Moderno',
    hint: 'Sans serif limpia sobre blanco, alineación a la izquierda.',
    fonts: { title: sansSemi, titleItalic: sansItalic, body: sansRegular, italic: sansItalic },
    bg: '#ffffff', ink: '#1d232c', soft: '#6b7480', accent: '#3e5985',
    titleSize: 19, bodySize: 10.6, leading: 1.62, align: 'left', upperTitle: false,
  },
  mecanografiado: {
    label: 'Mecanografiado',
    hint: 'Courier en hoja de máquina de escribir, con cinta roja.',
    fonts: { title: courierBold, titleItalic: courierItalic, body: courierRegular, italic: courierItalic },
    bg: '#f3ead6', ink: '#2a1f17', soft: '#6e5d4a', accent: '#a8321f',
    titleSize: 15, bodySize: 10.2, leading: 1.62, align: 'left', upperTitle: true,
  },
}

const PAGE = { w: 419.53, h: 595.28 } // A5 in points
const M = { top: 62, bottom: 66, left: 54, right: 46 }

const cache = new Map()
async function fontBytes(url) {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error('No se pudo cargar la tipografía del PDF.')
        return r.arrayBuffer()
      }),
    )
  }
  return cache.get(url)
}

export class UnsupportedScriptError extends Error {}

function wrap(text, font, size, maxWidth) {
  const words = text.split(/(\s+)/)
  const lines = []
  let current = ''
  for (const w of words) {
    const next = current + w
    if (current && font.widthOfTextAtSize(next.trimEnd(), size) > maxWidth) {
      lines.push(current.trimEnd())
      current = w.trimStart()
    } else current = next
  }
  if (current.trim()) lines.push(current.trimEnd())
  // A single word longer than the measure: hard-break it.
  return lines.flatMap((l) => {
    if (font.widthOfTextAtSize(l, size) <= maxWidth) return [l]
    const parts = []
    let buf = ''
    for (const ch of l) {
      if (font.widthOfTextAtSize(buf + ch, size) > maxWidth) {
        parts.push(buf)
        buf = ch
      } else buf += ch
    }
    if (buf) parts.push(buf)
    return parts
  })
}

function sanitize(s) {
  // Drop zero-width marks; spell out Latin ligatures (U+FB00-FB06), which fontkit spaces badly.
  return (s || '').replace(/\t/g, '    ').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/[\ufb00-\ufb06]/g, (c) => c.normalize('NFKC'))
}

/** Build the PDF and return its bytes. */
export async function buildPoemPdf(rec, styleKey = 'clasico') {
  if (!rec?.lines?.length || !rec.rights?.allowsFullText) {
    throw new Error('Este poema no puede descargarse: solo exportamos textos de dominio público o con licencia abierta.')
  }
  const st = PDF_STYLES[styleKey] || PDF_STYLES.clasico
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const [title, titleItalic, body, italic] = await Promise.all(
    [st.fonts.title, st.fonts.titleItalic, st.fonts.body, st.fonts.italic].map(async (u) => doc.embedFont(await fontBytes(u), { subset: false })),
  )

  // Refuse scripts our fonts can't draw (the UI falls back to printing).
  const supported = new Set(body.getCharacterSet())
  const missing = [...new Set([...rec.lines.join(''), ...rec.title].filter((c) => c.trim() && !supported.has(c.codePointAt(0))))]
  if (missing.length) throw new UnsupportedScriptError(`Caracteres no disponibles en la tipografía: ${missing.slice(0, 6).join(' ')}`)

  const ink = hex(st.ink)
  const soft = hex(st.soft)
  const accent = hex(st.accent)
  const measure = PAGE.w - M.left - M.right
  const size = st.bodySize
  const lh = size * st.leading
  const pages = []
  let page
  let y

  const newPage = () => {
    page = doc.addPage([PAGE.w, PAGE.h])
    page.drawRectangle({ x: 0, y: 0, width: PAGE.w, height: PAGE.h, color: hex(st.bg) })
    if (styleKey === 'mecanografiado') {
      // A faint left margin rule and punch holes, like a typed sheet.
      page.drawLine({ start: { x: M.left - 16, y: 0 }, end: { x: M.left - 16, y: PAGE.h }, thickness: 0.4, color: hex('#c98f7d'), opacity: 0.5 })
    }
    pages.push(page)
    y = PAGE.h - M.top
  }
  const text = (s, { font = body, sz = size, color = ink, x = null, align = 'left', opacity = 1 } = {}) => {
    const w = font.widthOfTextAtSize(s, sz)
    const px = x ?? (align === 'center' ? (PAGE.w - w) / 2 : align === 'right' ? PAGE.w - M.right - w : M.left)
    page.drawText(s, { x: px, y, size: sz, font, color, opacity })
  }

  newPage()

  // ── title block ─────────────────────────────────────────────────────────
  const tAlign = st.align
  const titleText = sanitize(st.upperTitle ? rec.title.toUpperCase() : rec.title)
  if (styleKey === 'clasico') {
    text('— poema —', { font: italic, sz: 8.5, color: soft, align: 'center' })
    y -= 26
  }
  for (const l of wrap(titleText, title, st.titleSize, measure)) {
    text(l, { font: title, sz: st.titleSize, align: tAlign })
    y -= st.titleSize * 1.18
  }
  const subtitle = rec.altTitle || rec.subtitle
  if (subtitle) {
    y -= 2
    for (const l of wrap(sanitize(subtitle), titleItalic, size + 0.5, measure)) {
      text(l, { font: titleItalic, sz: size + 0.5, color: soft, align: tAlign })
      y -= (size + 0.5) * 1.35
    }
  }
  y -= 6
  const life = lifespan(rec.author)
  const by = rec.author ? `${rec.author.name}${life ? `  (${life})` : ''}` : 'Autoría desconocida'
  text(sanitize(by), { font: st.upperTitle ? body : italic, sz: size, color: accent, align: tAlign })
  y -= size * 1.5
  if (rec.translator?.name) {
    text(sanitize(`Traducción de ${rec.translator.name}`), { font: italic, sz: size - 1.5, color: soft, align: tAlign })
    y -= size * 1.4
  }
  const meta = pubLine(rec)
  if (meta) {
    for (const l of wrap(sanitize(meta), italic, size - 2, measure)) {
      text(l, { font: italic, sz: size - 2, color: soft, align: tAlign })
      y -= (size - 2) * 1.4
    }
  }
  // ornament / rule
  y -= 10
  if (styleKey === 'clasico') {
    const cx = PAGE.w / 2
    page.drawLine({ start: { x: cx - 46, y: y + 3 }, end: { x: cx - 8, y: y + 3 }, thickness: 0.5, color: accent })
    page.drawLine({ start: { x: cx + 8, y: y + 3 }, end: { x: cx + 46, y: y + 3 }, thickness: 0.5, color: accent })
    page.drawRectangle({ x: cx - 2.6, y: y + 0.4, width: 5.2, height: 5.2, color: accent, rotate: degrees(45), xSkew: degrees(0) })
  } else if (styleKey === 'moderno') {
    page.drawRectangle({ x: M.left, y: y + 2, width: 34, height: 2, color: accent })
  } else {
    text('* * *', { sz: size, color: accent, align: 'left' })
  }
  y -= 28

  // ── verse ───────────────────────────────────────────────────────────────
  // Poems are set flush left as a block; the classic style centres the block
  // (not each line), the way printed anthologies do.
  const stanzaList = []
  let cur = []
  for (const raw of rec.lines) {
    if (!raw.trim()) {
      if (cur.length) stanzaList.push(cur)
      cur = []
    } else cur.push(sanitize(raw))
  }
  if (cur.length) stanzaList.push(cur)

  const spaceW = body.widthOfTextAtSize(' ', size)
  const setLines = stanzaList.map((st2) =>
    st2.flatMap((line) => {
      const m = /^( *)(.*)$/.exec(line)
      const indent = Math.min(m[1].length * spaceW * 0.9, measure * 0.4)
      const parts = wrap(m[2], body, size, measure - indent)
      return parts.map((p, i) => ({ text: p, indent: i === 0 ? indent : indent + size * 1.6 }))
    }),
  )
  let blockLeft = M.left
  if (styleKey === 'clasico') {
    const widest = Math.max(...setLines.flat().map((l) => l.indent + body.widthOfTextAtSize(l.text, size)))
    blockLeft = M.left + Math.max(0, (measure - widest) / 2)
  }
  const bottom = M.bottom + 10
  setLines.forEach((stanza, si) => {
    const need = stanza.length * lh
    const fitsOnFresh = need <= PAGE.h - M.top - bottom
    if (y - need < bottom && fitsOnFresh && stanza.length <= 16 && si > 0) newPage()
    stanza.forEach((l) => {
      if (y < bottom) newPage()
      page.drawText(l.text, { x: blockLeft + l.indent, y, size, font: body, color: ink })
      y -= lh
    })
    y -= lh * 0.75
  })

  // ── colophon ────────────────────────────────────────────────────────────
  const r = rec.rights
  const colo = [
    rec.attribution,
    `Estado de derechos: ${r.label}${r.jurisdictionLabel ? ` (${r.jurisdictionLabel})` : ''}. ${r.explanation || ''}`,
    r.license ? `Licencia: ${r.license}${r.licenseUrl ? ` — ${r.licenseUrl}` : ''}` : null,
    `Edición generada con BookTracker el ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
  ].filter(Boolean)
  const cs = 7.4
  const colLines = colo.flatMap((c) => [...wrap(sanitize(c), italic, cs, measure), ''])
  const colHeight = colLines.length * cs * 1.45 + 20
  if (y - colHeight < M.bottom - 20) newPage()
  y = Math.max(M.bottom + colHeight - 8, Math.min(y - 8, M.bottom + colHeight + 40))
  page.drawLine({ start: { x: M.left, y: y + 10 }, end: { x: M.left + 60, y: y + 10 }, thickness: 0.4, color: soft })
  for (const l of colLines) {
    if (l) page.drawText(l, { x: M.left, y, size: cs, font: italic, color: soft })
    y -= cs * 1.45
  }

  // ── folios ──────────────────────────────────────────────────────────────
  pages.forEach((p, i) => {
    const label = String(i + 1)
    const w = italic.widthOfTextAtSize(label, 8.5)
    p.drawText(label, { x: (PAGE.w - w) / 2, y: 30, size: 8.5, font: italic, color: soft })
  })

  doc.setTitle(rec.title)
  if (rec.author?.name) doc.setAuthor(rec.author.name)
  doc.setSubject(rec.attribution)
  doc.setCreator('BookTracker · Biblioteca de poesía')
  doc.setProducer('BookTracker (pdf-lib)')
  doc.setLanguage(rec.lang || 'es')
  return doc.save()
}

export function pdfFileName(rec) {
  const clean = (s) => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, ' ')
  return `${clean(rec.title).slice(0, 60) || 'poema'}${rec.author?.name ? ` - ${clean(rec.author.name)}` : ''}.pdf`
}

export async function downloadPoemPdf(rec, styleKey) {
  const bytes = await buildPoemPdf(rec, styleKey)
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = pdfFileName(rec)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return blob.size
}

/** Fallback for scripts the embedded fonts don't cover: the browser's print dialog. */
export function printPoem(rec) {
  if (!rec?.lines?.length || !rec.rights?.allowsFullText) return
  const w = window.open('', '_blank', 'noopener=no,width=720,height=900')
  if (!w) return
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const body = rec.lines.map((l) => (l.trim() ? `<div>${esc(l).replace(/^( +)/, (m) => '&nbsp;'.repeat(m.length))}</div>` : '<div class="gap"></div>')).join('')
  w.document.write(`<!doctype html><html lang="${esc(rec.lang)}"><head><meta charset="utf-8"><title>${esc(rec.title)}</title>
<style>@page{size:A5;margin:18mm 16mm}body{font-family:Georgia,serif;color:#2a1e15;line-height:1.55}h1{font-weight:500;margin:0 0 4px}
.by{color:#9c5a22;font-style:italic;margin-bottom:22px}.gap{height:.9em}.colo{margin-top:28px;font-size:9px;color:#7a6650;font-style:italic}</style></head>
<body><h1>${esc(rec.title)}</h1><div class="by">${esc(rec.author?.name || '')}</div>${body}<p class="colo">${esc(rec.attribution)}<br>${esc(rec.rights.label)} · ${esc(rec.rights.explanation)}</p>
<script>window.onload=()=>{window.print()}</script></body></html>`)
  w.document.close()
}
