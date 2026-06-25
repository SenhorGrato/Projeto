import { loadPdfDocument } from './pdfExtract.js'

/**
 * OCR fallback for scanned PDFs (pages that are images, with no selectable
 * text). Renders each page to a canvas and runs Tesseract on it.
 *
 * Tesseract and its language data are loaded lazily/from CDN, so this only
 * works online — which is fine, since it's a fallback for documents the
 * normal extractor can't read at all.
 */
export async function ocrPdfToWords(file, onProgress) {
  const { createWorker } = await import('tesseract.js')
  const pdf = await loadPdfDocument(file)
  const totalPages = pdf.numPages

  const worker = await createWorker('por+eng', 1)

  try {
    let text = ''
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 2 }) // upscale for legibility
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')

      await page.render({ canvasContext: ctx, viewport }).promise
      const { data } = await worker.recognize(canvas)
      text += ' ' + (data && data.text ? data.text : '')

      // Release the canvas memory before the next (often large) page.
      canvas.width = 0
      canvas.height = 0

      if (onProgress) onProgress(Math.round((i / totalPages) * 100))
    }

    return text.replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean)
  } finally {
    await worker.terminate()
  }
}
