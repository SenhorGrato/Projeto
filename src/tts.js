/**
 * Audiobook engine — text-to-speech with word-level sync for RSVP.
 *
 * Uses the browser's native Web Speech API (SpeechSynthesis): high quality,
 * fully offline, no backend and no API keys. It reads the same words the
 * RSVP reader shows and reports each spoken word back so the on-screen
 * highlight stays in sync ("karaoke" effect).
 */

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

let voicesPromise = null

/** Loads the available system voices (they arrive asynchronously). */
export function loadVoices() {
  if (!speechSupported()) return Promise.resolve([])
  if (voicesPromise) return voicesPromise

  voicesPromise = new Promise((resolve) => {
    const synth = window.speechSynthesis
    const existing = synth.getVoices()
    if (existing && existing.length) {
      resolve(existing)
      return
    }

    let done = false
    const finish = () => {
      if (done) return
      done = true
      synth.removeEventListener('voiceschanged', onChange)
      resolve(synth.getVoices() || [])
    }
    const onChange = () => {
      const v = synth.getVoices()
      if (v && v.length) finish()
    }

    synth.addEventListener('voiceschanged', onChange)
    // Some browsers never fire the event — fall back after a short wait.
    setTimeout(finish, 1800)
  })

  return voicesPromise
}

/**
 * Picks the most natural-sounding voice for the given language, preferring
 * neural / online ("natural") voices when available.
 */
export function pickBestVoice(voices, lang = 'pt-BR') {
  if (!voices || !voices.length) return null

  const base = lang.slice(0, 2).toLowerCase()
  const matching = voices.filter(v => (v.lang || '').toLowerCase().startsWith(base))
  const pool = matching.length ? matching : voices

  const scored = pool.map(v => {
    const name = (v.name || '').toLowerCase()
    let score = 0
    if (name.includes('natural')) score += 6
    if (name.includes('neural')) score += 6
    if (!v.localService) score += 3 // online voices are usually higher fidelity
    if ((v.lang || '').toLowerCase() === lang.toLowerCase()) score += 2
    if (name.includes('google')) score += 2
    if (name.includes('microsoft')) score += 1
    // Nice Brazilian Portuguese voices commonly present on Windows/Edge.
    if (/(francisca|antonio|maria|daniel|thalita|brenda|donato|fabio|giovanna|leila|leticia|manuela|nicolau|valerio|yara)/.test(name)) score += 2
    return { v, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0].v
}

const SENTENCE_END = /[.!?…]["')\]]?$/
const SOFT_BREAK = 220
const HARD_BREAK = 420

export class Audiobook {
  constructor(words) {
    this.synth = window.speechSynthesis
    this.words = words || []
    this.voice = null
    this.rate = 1
    this.pitch = 1

    this.currentWord = 0
    this._active = false // intentionally speaking
    this._utter = null
    this._chunkEnd = 0

    // Time-based highlight estimator. Many "online/natural" voices (notably
    // Edge's) never fire `boundary` events, so the karaoke highlight would
    // freeze at the start of each chunk. When that happens we advance the
    // highlight ourselves using an estimated speaking pace.
    this._estTimer = null
    this._boundarySeen = false

    this.onWord = null // (wordIndex) => void
    this.onEnd = null // () => void
    this.onError = null // (message) => void

    // Chrome/Edge can silently pause long synthesis — nudge it periodically.
    this._keepAlive = setInterval(() => {
      if (this._active && this.synth && this.synth.speaking && !this.synth.paused) {
        try { this.synth.resume() } catch {}
      }
    }, 8000)
  }

  setVoice(voice) {
    const changed = this.voice !== voice
    this.voice = voice || null
    if (changed && this._active) this.play(this.currentWord)
  }

  setRate(rate) {
    const r = Math.max(0.5, Math.min(2.5, rate || 1))
    const changed = Math.abs(r - this.rate) > 0.001
    this.rate = r
    // Rate only applies to new utterances, so restart from the current word.
    if (changed && this._active) this.play(this.currentWord)
  }

  isActive() {
    return this._active
  }

  /** Starts (or restarts) speaking from a given word index. */
  play(fromWord = this.currentWord) {
    if (!this.synth) {
      this.onError && this.onError('Síntese de voz indisponível neste navegador.')
      return
    }
    this.currentWord = Math.max(0, Math.min(fromWord, this.words.length - 1))
    this._active = true
    try { this.synth.cancel() } catch {}
    this._speakNext()
  }

  /** Stops speaking but keeps the current position. */
  stop() {
    this._active = false
    this._utter = null
    this._stopEstimator()
    if (this.synth) {
      try { this.synth.cancel() } catch {}
    }
  }

  // Advances the highlight by estimated time across the current chunk's words.
  // Used only as a fallback when the engine doesn't report word boundaries.
  _startEstimator(text, ranges) {
    this._stopEstimator()
    if (!ranges.length || !text.length) return
    // ~15 chars/s is a reasonable neutral TTS pace at rate 1; scales with rate.
    const charsPerSec = 15 * this.rate
    const totalMs = Math.max(300, (text.length / charsPerSec) * 1000)
    const start = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    this._estTimer = setInterval(() => {
      if (!this._active || this._boundarySeen) { this._stopEstimator(); return }
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
      const frac = Math.min(0.999, (now - start) / totalMs)
      const charPos = frac * text.length
      let r = ranges[0]
      for (let k = 0; k < ranges.length; k++) {
        if (charPos >= ranges[k].start) r = ranges[k]
        else break
      }
      if (r && r.index !== this.currentWord) {
        this.currentWord = r.index
        this.onWord && this.onWord(r.index)
      }
    }, 80)
  }

  _stopEstimator() {
    if (this._estTimer) { clearInterval(this._estTimer); this._estTimer = null }
  }

  // Real pause: keeps the current utterance so resume() continues mid-word
  // (instead of restarting the chunk). Falls back gracefully if unsupported.
  pause() {
    this._stopEstimator()
    if (this.synth && this.synth.speaking && !this.synth.paused) {
      try { this.synth.pause() } catch {}
    }
  }

  // Resumes a paused utterance. Returns true if it actually resumed.
  resume() {
    if (this.synth && this.synth.paused) {
      this._active = true
      try { this.synth.resume() } catch {}
      return true
    }
    return false
  }

  dispose() {
    this.stop()
    if (this._keepAlive) clearInterval(this._keepAlive)
    this._keepAlive = null
  }

  _speakNext() {
    this._stopEstimator()
    if (!this._active) return
    if (this.currentWord >= this.words.length) {
      this._active = false
      this.onEnd && this.onEnd()
      return
    }

    const startWord = this.currentWord
    let text = ''
    const ranges = []
    let i = startWord
    for (; i < this.words.length; i++) {
      const w = this.words[i]
      const sep = text.length ? ' ' : ''
      const start = text.length + sep.length
      text += sep + w
      ranges.push({ start, end: text.length, index: i })

      if (text.length >= SOFT_BREAK && SENTENCE_END.test(w)) { i++; break }
      if (text.length >= HARD_BREAK) { i++; break }
    }
    const nextStart = i
    this._chunkEnd = nextStart

    const u = new SpeechSynthesisUtterance(text)
    if (this.voice) u.voice = this.voice
    u.lang = (this.voice && this.voice.lang) || 'pt-BR'
    u.rate = this.rate
    u.pitch = this.pitch

    // New chunk: assume no boundary support until the engine proves otherwise.
    this._boundarySeen = false

    u.onstart = () => {
      // If real boundary events arrive, this estimator stops itself on the
      // first one (see onboundary). Otherwise it carries the whole chunk.
      this._startEstimator(text, ranges)
    }

    u.onboundary = (e) => {
      if (e.name && e.name !== 'word') return
      // Engine reports real word boundaries — trust them over the estimator.
      this._boundarySeen = true
      this._stopEstimator()
      const ci = e.charIndex || 0
      let r = null
      for (let k = 0; k < ranges.length; k++) {
        if (ci >= ranges[k].start && ci < ranges[k].end) { r = ranges[k]; break }
      }
      if (!r) r = ranges[ranges.length - 1]
      if (r) {
        this.currentWord = r.index
        this.onWord && this.onWord(r.index)
      }
    }

    u.onend = () => {
      this._stopEstimator()
      if (this._active && this._utter === u) {
        this.currentWord = nextStart
        this._speakNext()
      }
    }

    u.onerror = (e) => {
      // "interrupted"/"canceled" happen on deliberate restarts — ignore those.
      if (e && (e.error === 'interrupted' || e.error === 'canceled')) return
      this._active = false
      this.onError && this.onError('Não foi possível reproduzir a voz. Tente outra voz.')
    }

    this._utter = u
    try {
      this.synth.speak(u)
    } catch {
      this._active = false
      this.onError && this.onError('Falha ao iniciar a leitura em voz.')
    }
  }
}
