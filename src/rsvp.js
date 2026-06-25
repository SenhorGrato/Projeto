/**
 * Gets the optimal recognition point (ORP) for a word.
 * Returns the index of the letter the eye should fixate on.
 */
export function getHighlightIndex(word) {
  const clean = word.replace(/[^a-zA-ZÀ-ÖØ-öø-ÿ]/g, '')
  const len = clean.length
  if (len === 0) return 0
  if (len === 1) return 0
  if (len <= 3) return 0
  if (len <= 6) return 1
  if (len <= 9) return 2
  if (len <= 13) return 3
  return 4
}

/**
 * Returns array of {char, highlight} objects for rendering.
 * (Kept for compatibility; the reader now uses splitWordORP.)
 */
export function splitWordForDisplay(word) {
  const highlightIdx = getHighlightIndex(word)
  return word.split('').map((char, i) => ({
    char,
    highlight: i === highlightIdx
  }))
}

/**
 * Splits a word around its ORP so the reader can keep the pivot letter pinned
 * to a fixed horizontal position on screen — the defining trait of RSVP. The
 * ORP index is computed on the cleaned word but mapped back to the original
 * string so punctuation stays in place.
 */
export function splitWordORP(word) {
  const w = word || ''
  if (!w) return { before: '', orp: '', after: '' }

  const cleanIdx = getHighlightIndex(w)

  // Map the clean-letter index back onto the original word (skipping non-letters).
  const isLetter = (c) => /[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(c)
  let seen = -1
  let pivot = 0
  for (let i = 0; i < w.length; i++) {
    if (isLetter(w[i])) {
      seen++
      if (seen === cleanIdx) { pivot = i; break }
    }
    pivot = i
  }

  return {
    before: w.slice(0, pivot),
    orp: w.slice(pivot, pivot + 1),
    after: w.slice(pivot + 1),
  }
}
