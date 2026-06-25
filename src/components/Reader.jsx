import { useState, useEffect, useRef, useCallback } from 'react'
import { getBook, updateProgress } from '../storage.js'
import { splitWordForDisplay } from '../rsvp.js'
import { Audiobook, loadVoices, pickBestVoice, speechSupported } from '../tts.js'

const SPEEDS = [
  { label: 'Lento', wpm: 200 },
  { label: 'Normal', wpm: 350 },
  { label: 'Rápido', wpm: 500 },
  { label: 'Turbo', wpm: 700 },
]

const AUDIO_SPEEDS = [
  { label: '0.75×', rate: 0.75 },
  { label: '1×', rate: 1 },
  { label: '1.25×', rate: 1.25 },
  { label: '1.5×', rate: 1.5 },
  { label: '2×', rate: 2 },
]

const CONTEXT_BEFORE = 4
const CONTEXT_AFTER = 4

// Words shown around the current position in the sidebar.
// This avoids rendering giant PDFs all at once and keeps navigation smooth.
const SIDEBAR_WINDOW = 220

export default function Reader({ bookId, prefs, themes, updatePrefs, onBack }) {
  const [book, setBook] = useState(null)
  const [wordIndex, setWordIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [wpm, setWpm] = useState(prefs.wpm)
  const [finished, setFinished] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // ── Audiobook state ──
  const [mode, setMode] = useState(prefs.mode === 'audio' ? 'audio' : 'rsvp')
  const [voices, setVoices] = useState([])
  const [voiceURI, setVoiceURI] = useState(prefs.voiceURI || null)
  const [audioRate, setAudioRate] = useState(prefs.audioRate || 1)
  const [audioError, setAudioError] = useState('')
  const supported = speechSupported()

  const intervalRef = useRef(null)
  const wpmRef = useRef(wpm)
  const wordIndexRef = useRef(wordIndex)
  const bookRef = useRef(null)
  const activeWordRef = useRef(null)
  const speakerRef = useRef(null)
  const wakeLockRef = useRef(null)

  // Load book
  useEffect(() => {
    let alive = true
    getBook(bookId).then(b => {
      if (!alive) return
      if (!b) { onBack(); return }
      setBook(b)
      bookRef.current = b
      const startIdx = b.progress || 0
      setWordIndex(startIdx)
      wordIndexRef.current = startIdx
      if (startIdx >= b.words.length - 1 && b.words.length > 0) {
        setFinished(true)
      }
    })
    return () => { alive = false }
  }, [bookId])

  // Sync refs
  useEffect(() => { wpmRef.current = wpm }, [wpm])
  useEffect(() => { wordIndexRef.current = wordIndex }, [wordIndex])

  // Load system voices once
  useEffect(() => {
    if (!supported) return
    let alive = true
    loadVoices().then(vs => {
      if (!alive) return
      setVoices(vs)
      setVoiceURI(prev => {
        if (prev && vs.some(v => v.voiceURI === prev)) return prev
        const best = pickBestVoice(vs)
        return best ? best.voiceURI : prev
      })
    })
    return () => { alive = false }
  }, [supported])

  const selectedVoice = voices.find(v => v.voiceURI === voiceURI) || null

  // Create / dispose the audiobook engine for the current book
  useEffect(() => {
    if (!book || !supported) return
    const sp = new Audiobook(book.words)
    sp.onWord = (idx) => { setWordIndex(idx); wordIndexRef.current = idx }
    sp.onEnd = () => {
      setPlaying(false)
      setFinished(true)
      updateProgress(book.id, book.words.length - 1)
    }
    sp.onError = (msg) => { setAudioError(msg); setPlaying(false) }
    speakerRef.current = sp
    return () => { sp.dispose(); speakerRef.current = null }
  }, [book, supported])

  // Keep engine voice/rate in sync
  useEffect(() => {
    const sp = speakerRef.current
    if (!sp) return
    sp.setVoice(selectedVoice)
  }, [selectedVoice])

  useEffect(() => {
    const sp = speakerRef.current
    if (!sp) return
    sp.setRate(audioRate)
  }, [audioRate])

  // Save progress periodically
  useEffect(() => {
    if (!book) return
    const timer = setTimeout(() => {
      updateProgress(book.id, wordIndex)
    }, 500)
    return () => clearTimeout(timer)
  }, [wordIndex, book])

  // Scroll active word into view in sidebar
  useEffect(() => {
    if (sidebarOpen && activeWordRef.current) {
      activeWordRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [sidebarOpen, wordIndex])

  // RSVP playback engine (timer driven)
  const startPlaying = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    const tick = () => {
      const b = bookRef.current
      if (!b) return
      const next = wordIndexRef.current + 1
      if (next >= b.words.length) {
        clearInterval(intervalRef.current)
        setPlaying(false)
        setFinished(true)
        updateProgress(b.id, b.words.length - 1)
        return
      }
      setWordIndex(next)
      wordIndexRef.current = next
    }
    const delay = Math.round(60000 / wpmRef.current)
    intervalRef.current = setInterval(tick, delay)
  }, [])

  const stopPlaying = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
  }, [])

  // Handle play/pause across both modes
  useEffect(() => {
    if (mode === 'audio') {
      stopPlaying()
      const sp = speakerRef.current
      if (!sp) return
      if (playing) { setAudioError(''); sp.play(wordIndexRef.current) }
      else sp.stop()
      return
    }

    // RSVP mode
    speakerRef.current && speakerRef.current.stop()
    if (playing) startPlaying()
    else stopPlaying()
    return () => stopPlaying()
  }, [playing, mode])

  // Restart RSVP interval when WPM changes while playing
  useEffect(() => {
    if (mode === 'rsvp' && playing) { stopPlaying(); startPlaying() }
    updatePrefs({ wpm })
  }, [wpm])

  // Persist audiobook preferences
  useEffect(() => { updatePrefs({ mode }) }, [mode])
  useEffect(() => { if (voiceURI) updatePrefs({ voiceURI }) }, [voiceURI])
  useEffect(() => { updatePrefs({ audioRate }) }, [audioRate])

  // Stop any speech when leaving the reader
  useEffect(() => () => { speakerRef.current && speakerRef.current.stop() }, [])

  // Keep the screen awake while actively reading or narrating. The lock is
  // released automatically when paused, when leaving, or by the OS when the
  // tab is hidden — so we also re-acquire it when the tab becomes visible.
  useEffect(() => {
    if (!('wakeLock' in navigator) || !playing) return
    let cancelled = false

    const acquire = async () => {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      } catch { /* user denied or not allowed in this context */ }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {})
        wakeLockRef.current = null
      }
    }
  }, [playing])

  // Seek helper: keeps refs + engine consistent
  const seekTo = useCallback((idx) => {
    const max = (bookRef.current?.words.length ?? 1) - 1
    const clamped = Math.max(0, Math.min(idx, max))
    setWordIndex(clamped)
    wordIndexRef.current = clamped
    if (mode === 'audio' && playing && speakerRef.current) {
      speakerRef.current.play(clamped)
    }
    return clamped
  }, [mode, playing])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.code === 'Space') { e.preventDefault(); setPlaying(p => !p) }
      if (e.code === 'ArrowRight') { setPlaying(false); seekTo(wordIndexRef.current + 1) }
      if (e.code === 'ArrowLeft') { setPlaying(false); seekTo(wordIndexRef.current - 1) }
      if (e.code === 'KeyN') setSidebarOpen(p => !p)
      if (e.code === 'KeyV') { setPlaying(false); setMode(m => m === 'audio' ? 'rsvp' : 'audio') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [seekTo])

  const handleRestart = () => {
    setFinished(false)
    setPlaying(false)
    setWordIndex(0)
    wordIndexRef.current = 0
    updateProgress(book.id, 0)
  }

  const handleSidebarClick = (idx) => {
    setPlaying(false)
    seekTo(idx)
    setFinished(false)
  }

  const switchMode = (next) => {
    if (next === mode) return
    setPlaying(false)
    setAudioError('')
    setMode(next)
  }

  if (!book) return null

  const words = book.words
  const progress = words.length > 0 ? (wordIndex / (words.length - 1)) * 100 : 0
  const effWpm = mode === 'audio' ? Math.round(audioRate * 165) : wpm
  const remaining = words.length > 0 ? Math.ceil((words.length - wordIndex) / Math.max(effWpm, 1)) : 0
  const currentWord = words[wordIndex] || ''
  const chars = splitWordForDisplay(currentWord)

  // Context strip
  const ctxStart = Math.max(0, wordIndex - CONTEXT_BEFORE)
  const ctxEnd = Math.min(words.length - 1, wordIndex + CONTEXT_AFTER)
  const ctxWords = words.slice(ctxStart, ctxEnd + 1)

  // Sidebar window: show only a smart slice around current word for better performance
  const sidebarStart = Math.max(0, wordIndex - SIDEBAR_WINDOW)
  const sidebarEnd = Math.min(words.length - 1, wordIndex + SIDEBAR_WINDOW)
  const sidebarWords = words.slice(sidebarStart, sidebarEnd + 1)

  if (finished) {
    return (
      <div className="reader-view">
        <ReaderTopbar book={book} effWpm={effWpm} mode={mode} themes={themes} prefs={prefs} updatePrefs={updatePrefs} onBack={onBack} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        <div className="reader-progress-bar"><div className="reader-progress-fill" style={{ width: '100%' }} /></div>
        <div className="finish-screen">
          <div className="finish-emoji">🎉</div>
          <h2>Leitura concluída!</h2>
          <p>Você terminou <strong>{book.name}</strong>.<br />{words.length.toLocaleString('pt-BR')} palavras no total.</p>
          <div className="finish-actions">
            <button className="btn btn-primary" onClick={handleRestart}>↺ Reler do início</button>
            <button className="btn btn-ghost" onClick={onBack}>← Biblioteca</button>
          </div>
        </div>
        <AppFooter />
      </div>
    )
  }

  return (
    <div className="reader-shell">
      {/* ── Sidebar ── */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">Navegação</span>
          <button className="btn-icon" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>
        <div className="sidebar-meta">
          <span>{Math.round(progress)}% concluído</span>
          <span>{wordIndex.toLocaleString('pt-BR')} / {words.length.toLocaleString('pt-BR')} palavras</span>
        </div>
        <div className="sidebar-body">
          {sidebarStart > 0 && (
            <button className="sidebar-jump" onClick={() => handleSidebarClick(Math.max(0, sidebarStart - SIDEBAR_WINDOW))}>
              ↑ Ver trecho anterior
            </button>
          )}
          {sidebarWords.map((w, i) => {
            const absoluteIndex = sidebarStart + i
            const isCurrent = absoluteIndex === wordIndex
            const isRead = absoluteIndex < wordIndex
            return (
              <span
                key={absoluteIndex}
                ref={isCurrent ? activeWordRef : null}
                className={`sb-word${isCurrent ? ' sb-word-current' : ''}${isRead ? ' sb-word-read' : ''}`}
                onClick={() => handleSidebarClick(absoluteIndex)}
              >
                {w}{' '}
              </span>
            )
          })}
          {sidebarEnd < words.length - 1 && (
            <button className="sidebar-jump" onClick={() => handleSidebarClick(Math.min(words.length - 1, sidebarEnd + 1))}>
              Ver próximo trecho ↓
            </button>
          )}
        </div>
        <div className="sidebar-footer">
          <span>feito por Gustavo de Almeida Silva</span>
        </div>
      </aside>

      {/* ── Main reader ── */}
      <div className="reader-view">
        <ReaderTopbar book={book} effWpm={effWpm} mode={mode} themes={themes} prefs={prefs} updatePrefs={updatePrefs} onBack={onBack} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        <div className="reader-progress-bar">
          <div className="reader-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        {/* Mode switch: RSVP (visual) ↔ Audiobook (voz) */}
        <div className="mode-switch" role="tablist" aria-label="Modo de leitura">
          <button
            className={`mode-tab${mode === 'rsvp' ? ' active' : ''}`}
            onClick={() => switchMode('rsvp')}
            role="tab"
            aria-selected={mode === 'rsvp'}
          >👁 Leitura RSVP</button>
          <button
            className={`mode-tab${mode === 'audio' ? ' active' : ''}`}
            onClick={() => switchMode('audio')}
            role="tab"
            aria-selected={mode === 'audio'}
            disabled={!supported}
            title={supported ? 'Ouça o PDF com voz real (V)' : 'Seu navegador não suporta voz'}
          >🔊 Audiobook</button>
        </div>

        {mode === 'audio' && !supported && (
          <div className="audio-warning">
            Seu navegador não oferece síntese de voz. Use o Chrome ou o Microsoft Edge para o modo Audiobook.
          </div>
        )}
        {mode === 'audio' && audioError && (
          <div className="audio-warning">{audioError}</div>
        )}

        {/* Word stage */}
        <div className="word-stage" onClick={() => setPlaying(p => !p)} style={{ cursor: 'pointer' }}>
          {mode === 'audio' && (
            <div className={`audio-badge${playing ? ' speaking' : ''}`}>
              <span className="audio-wave"><i /><i /><i /><i /><i /></span>
              {playing ? 'Narrando…' : 'Audiobook'}
            </div>
          )}
          <div className="word-display">
            {chars.map((c, i) => (
              <span key={i} className={c.highlight ? 'word-char-highlight' : 'word-char'}>
                {c.char}
              </span>
            ))}
          </div>

          <div className="word-counter">
            <span>📍 {wordIndex + 1} / {words.length.toLocaleString('pt-BR')}</span>
            <span>· {Math.round(progress)}%</span>
            <span>· ~{remaining} min restantes</span>
          </div>
        </div>

        {/* Context strip */}
        <div className="context-strip">
          <div className="context-text">
            {ctxWords.map((w, i) => {
              const absIdx = ctxStart + i
              const isCurrent = absIdx === wordIndex
              return (
                <span key={i}>
                  <span className={isCurrent ? 'context-word-current' : 'context-word'}>{w}</span>
                  {i < ctxWords.length - 1 ? ' ' : ''}
                </span>
              )
            })}
          </div>
        </div>

        {/* Controls */}
        <div className="reader-controls">
          <div className="controls-main">
            <button className="ctrl-btn ctrl-btn-sm" title="Início" onClick={() => { setPlaying(false); seekTo(0) }}>⏮</button>
            <button className="ctrl-btn ctrl-btn-md" title="Voltar (←)" onClick={() => { setPlaying(false); seekTo(wordIndex - 1) }}>◀</button>
            <button className="ctrl-btn ctrl-btn-lg" onClick={() => setPlaying(p => !p)} title={playing ? 'Pausar (Espaço)' : 'Iniciar (Espaço)'}>
              {playing ? '⏸' : '▶'}
            </button>
            <button className="ctrl-btn ctrl-btn-md" title="Avançar (→)" onClick={() => { setPlaying(false); seekTo(wordIndex + 1) }}>▶</button>
            <button className="ctrl-btn ctrl-btn-sm" title="Ir para o fim" onClick={() => { setPlaying(false); seekTo(words.length - 1) }}>⏭</button>
          </div>

          {mode === 'rsvp' ? (
            <div className="controls-secondary">
              {SPEEDS.map(s => (
                <button key={s.wpm} className={`speed-btn${wpm === s.wpm ? ' active' : ''}`} onClick={() => setWpm(s.wpm)}>
                  {s.label}
                </button>
              ))}
              <input
                className="wpm-input"
                type="number"
                min={50}
                max={2000}
                value={wpm}
                onChange={e => { const v = parseInt(e.target.value); if (v >= 50 && v <= 2000) setWpm(v) }}
                title="Palavras por minuto"
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ppm</span>
            </div>
          ) : (
            <div className="controls-secondary">
              {AUDIO_SPEEDS.map(s => (
                <button key={s.rate} className={`speed-btn${audioRate === s.rate ? ' active' : ''}`} onClick={() => setAudioRate(s.rate)}>
                  {s.label}
                </button>
              ))}
              <select
                className="voice-select"
                value={voiceURI || ''}
                onChange={e => setVoiceURI(e.target.value)}
                title="Voz da narração"
                disabled={!supported || voices.length === 0}
              >
                {voices.length === 0 && <option value="">Carregando vozes…</option>}
                {voices.map(v => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang}){v.localService ? '' : ' · online'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <AppFooter />
      </div>
    </div>
  )
}

function AppFooter() {
  return (
    <div className="app-footer">
      Feito por <strong>Gustavo de Almeida Silva</strong> · Leitura RSVP Pro
    </div>
  )
}

function ReaderTopbar({ book, effWpm, mode, themes, prefs, updatePrefs, onBack, sidebarOpen, setSidebarOpen }) {
  return (
    <div className="reader-topbar">
      <button className="btn-icon" onClick={onBack} title="Voltar à biblioteca">←</button>
      <button
        className={`btn-icon${sidebarOpen ? ' btn-icon-active' : ''}`}
        onClick={() => setSidebarOpen(p => !p)}
        title="Navegação do texto (N)"
        style={{ fontSize: 16 }}
      >☰</button>
      <span className="reader-book-title">{book.name}</span>
      <select
        className="theme-select"
        value={prefs.theme}
        onChange={e => updatePrefs({ theme: e.target.value })}
        style={{ fontSize: 12 }}
      >
        {themes.map(t => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>
      <span className="reader-wpm">{mode === 'audio' ? '🔊 ' : ''}{effWpm} ppm</span>
    </div>
  )
}
