/**
 * Gets the optimal fixation point (ORP) for a word.
 * Returns the index of the letter to highlight.
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
 */
export function splitWordForDisplay(word) {
  const highlightIdx = getHighlightIndex(word)
  return word.split('').map((char, i) => ({
    char,
    highlight: i === highlightIdx
  }))
}
