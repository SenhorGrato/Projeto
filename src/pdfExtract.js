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

function waitForNextFrame() {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 0)
  })
}

export async function extractTextFromPDF(file, onProgress) {
  const pdfjsLib = await getPdfJs()
  const arrayBuffer = await file.arrayBuffer()

  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  })

  const pdf = await loadingTask.promise
  const totalPages = pdf.numPages
  const texts = []

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map(item => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (pageText) texts.push(pageText)
    if (onProgress) onProgress(Math.round((i / totalPages) * 100))

    if (i % 3 === 0) {
      await waitForNextFrame()
    }
  }

  const fullText = texts.join(' ')
  const words = fullText
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 0)

  return words
}
