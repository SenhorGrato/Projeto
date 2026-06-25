import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

let pdfjsPromise = null

async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
      return pdfjsLib
    })
  }

  return pdfjsPromise
}

// Exposed so the OCR fallback can reuse a single pdf.js instance.
export async function loadPdfDocument(file) {
  const pdfjsLib = await getPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  })
  return loadingTask.promise
}

function waitForNextFrame() {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 0)
  })
}

// Turns pdf.js text items into visual lines. Prefers the engine's own line
// markers (hasEOL); falls back to grouping by vertical position when the PDF
// doesn't provide them.
function itemsToLines(items) {
  const hasEOL = items.some(it => it.hasEOL)

  if (hasEOL) {
    const lines = []
    let cur = ''
    for (const it of items) {
      cur += it.str
      if (it.hasEOL) { lines.push(cur); cur = '' }
    }
    if (cur) lines.push(cur)
    return lines.map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  }

  // Position-based fallback: bucket items by their Y coordinate.
  const rows = []
  for (const it of items) {
    const y = it.transform ? it.transform[5] : 0
    const x = it.transform ? it.transform[4] : 0
    let row = rows.find(r => Math.abs(r.y - y) <= 2)
    if (!row) { row = { y, parts: [] }; rows.push(row) }
    row.parts.push({ x, str: it.str })
  }
  rows.sort((a, b) => b.y - a.y) // PDF Y grows upward → top lines first
  return rows
    .map(r => {
      r.parts.sort((a, b) => a.x - b.x)
      return r.parts.map(p => p.str).join(' ').replace(/\s+/g, ' ').trim()
    })
    .filter(Boolean)
}

// Normalizes a line for repetition detection: digits → '#' so paginated
// headers ("Página 12" / "Página 13") collapse to the same signature.
function normalizeLine(s) {
  return s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()
}

// Finds short lines that repeat across many pages — running headers/footers.
function findRepeatedLines(pageLines) {
  const counts = new Map()
  for (const lines of pageLines) {
    const seen = new Set()
    for (const ln of lines) {
      const n = normalizeLine(ln)
      if (!n || n.length > 80) continue // long lines are almost certainly body text
      if (seen.has(n)) continue
      seen.add(n)
      counts.set(n, (counts.get(n) || 0) + 1)
    }
  }
  const threshold = Math.max(3, Math.ceil(pageLines.length * 0.3))
  const repeated = new Set()
  for (const [n, c] of counts) {
    if (c >= threshold) repeated.add(n)
  }
  return repeated
}

// Joins lines into flowing text, healing words split by a hyphen at line end.
function joinLines(lines) {
  let out = ''
  for (const line of lines) {
    // trailing ASCII hyphen or soft hyphen → word continues on next line
    if (/[-­]$/.test(line)) {
      out += line.replace(/[-­]$/, '')
    } else {
      out += line + ' '
    }
  }
  return out.replace(/\s+/g, ' ').trim()
}

function textToWords(text) {
  return text.split(/\s+/).map(w => w.trim()).filter(Boolean)
}

export async function extractTextFromPDF(file, onProgress) {
  const pdf = await loadPdfDocument(file)
  const totalPages = pdf.numPages
  const pageLines = []

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pageLines.push(itemsToLines(content.items))
    if (onProgress) onProgress(Math.round((i / totalPages) * 100))
    if (i % 3 === 0) await waitForNextFrame()
  }

  const repeated = findRepeatedLines(pageLines)

  const kept = []
  for (const lines of pageLines) {
    for (const ln of lines) {
      const t = ln.trim()
      if (!t) continue
      if (repeated.has(normalizeLine(t))) continue   // header/footer
      if (/^[\s.\-—–]*\d{1,4}[\s.\-—–]*$/.test(t)) continue // bare page number
      kept.push(t)
    }
  }

  return textToWords(joinLines(kept))
}

// Quick check used to decide whether an OCR fallback is warranted.
export function looksLikeNoText(words) {
  return !words || words.length < 5
}
