// Persistência do RSVP Pro.
//
// Livros vão para o IndexedDB (sem limite prático de ~5 MB do localStorage,
// que estourava com PDFs grandes). As preferências, pequenas, continuam no
// localStorage para leitura síncrona no primeiro render.

const DB_NAME = 'rsvp_pro'
const DB_VERSION = 1
const STORE = 'books'

const PREFS_KEY = 'rsvp_prefs_v2'
const LEGACY_BOOKS_KEY = 'rsvp_books_v2' // localStorage antigo (migração one-time)

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(mode, run) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const store = t.objectStore(STORE)
    let result
    Promise.resolve(run(store)).then(r => { result = r }).catch(reject)
    t.oncomplete = () => resolve(result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error || new Error('Transação abortada'))
  }))
}

function reqAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Migra livros do localStorage antigo para o IndexedDB uma única vez.
let migrated = false
async function migrateLegacy() {
  if (migrated) return
  migrated = true
  let legacy
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_BOOKS_KEY) || '[]')
  } catch {
    legacy = []
  }
  if (!Array.isArray(legacy) || legacy.length === 0) return
  try {
    await tx('readwrite', store => { legacy.forEach(b => store.put(b)) })
    localStorage.removeItem(LEGACY_BOOKS_KEY)
  } catch (err) {
    console.warn('Falha ao migrar biblioteca do localStorage:', err)
  }
}

// ===== BOOKS (assíncrono) =====

export async function getBooks() {
  try {
    await migrateLegacy()
    const books = await tx('readonly', store => reqAsPromise(store.getAll()))
    // Mais recentes primeiro (mantém o comportamento do unshift anterior).
    return (books || []).sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''))
  } catch (err) {
    console.error('Erro ao ler biblioteca:', err)
    return []
  }
}

export async function saveBook(book) {
  try {
    await tx('readwrite', store => reqAsPromise(store.put(book)))
  } catch (err) {
    if (err && err.name === 'QuotaExceededError') {
      throw new Error('Sem espaço de armazenamento no navegador para salvar este livro. Remova livros antigos e tente novamente.')
    }
    throw err
  }
}

export async function deleteBook(id) {
  await tx('readwrite', store => reqAsPromise(store.delete(id)))
}

export async function getBook(id) {
  try {
    await migrateLegacy()
    return await tx('readonly', store => reqAsPromise(store.get(id))) || null
  } catch (err) {
    console.error('Erro ao ler livro:', err)
    return null
  }
}

// Merges arbitrary fields (wpm, bookmarks, ...) into a stored book.
export async function updateBookFields(id, fields) {
  try {
    await tx('readwrite', async store => {
      const book = await reqAsPromise(store.get(id))
      if (!book) return
      Object.assign(book, fields)
      await reqAsPromise(store.put(book))
    })
  } catch (err) {
    console.error('Erro ao atualizar livro:', err)
  }
}

// ===== BACKUP (export / import) =====

export async function exportLibrary() {
  const books = await getBooks()
  return { app: 'leitura-rsvp-pro', version: 1, exportedAt: new Date().toISOString(), books }
}

export async function importLibrary(payload) {
  const books = Array.isArray(payload) ? payload : payload && payload.books
  if (!Array.isArray(books)) throw new Error('Arquivo de backup inválido.')
  let imported = 0
  await tx('readwrite', store => {
    for (const b of books) {
      if (b && b.id && Array.isArray(b.words)) { store.put(b); imported++ }
    }
  })
  return imported
}

export async function updateProgress(id, wordIndex) {
  try {
    await tx('readwrite', async store => {
      const book = await reqAsPromise(store.get(id))
      if (!book) return
      book.progress = wordIndex
      book.status = wordIndex >= book.words.length - 1
        ? 'done'
        : wordIndex > 0 ? 'reading' : 'new'
      await reqAsPromise(store.put(book))
    })
  } catch (err) {
    console.error('Erro ao salvar progresso:', err)
  }
}

// ===== PREFS (síncrono, localStorage) =====

export function getPrefs() {
  try {
    return {
      theme: 'dark',
      wpm: 350,
      mode: 'rsvp',        // 'rsvp' (visual) ou 'audio' (audiobook)
      audioRate: 1,        // velocidade da voz (0.5–2.0)
      voiceURI: null,      // voz preferida do audiobook
      ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
    }
  } catch {
    return { theme: 'dark', wpm: 350, mode: 'rsvp', audioRate: 1, voiceURI: null }
  }
}

export function savePrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}
