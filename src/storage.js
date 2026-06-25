const BOOKS_KEY = 'rsvp_books_v2'
const PREFS_KEY = 'rsvp_prefs_v2'

// ===== BOOKS =====

export function getBooks() {
  try {
    return JSON.parse(localStorage.getItem(BOOKS_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveBook(book) {
  const books = getBooks()
  const idx = books.findIndex(b => b.id === book.id)
  if (idx >= 0) books[idx] = book
  else books.unshift(book)
  localStorage.setItem(BOOKS_KEY, JSON.stringify(books))
}

export function deleteBook(id) {
  const books = getBooks().filter(b => b.id !== id)
  localStorage.setItem(BOOKS_KEY, JSON.stringify(books))
}

export function getBook(id) {
  return getBooks().find(b => b.id === id) || null
}

export function updateProgress(id, wordIndex) {
  const books = getBooks()
  const idx = books.findIndex(b => b.id === id)
  if (idx < 0) return
  books[idx].progress = wordIndex
  books[idx].status = wordIndex >= books[idx].words.length - 1
    ? 'done'
    : wordIndex > 0 ? 'reading' : 'new'
  localStorage.setItem(BOOKS_KEY, JSON.stringify(books))
}

// ===== PREFS =====

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
