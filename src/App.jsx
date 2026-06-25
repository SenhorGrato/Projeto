import { useState, useEffect } from 'react'
import { getPrefs, savePrefs } from './storage.js'
import Library from './components/Library.jsx'
import Reader from './components/Reader.jsx'

const THEMES = [
  { id: 'dark', label: 'Foco Executivo' },
  { id: 'light', label: 'Clareza Premium' },
  { id: 'pastel', label: 'Conforto Visual' },
  { id: 'neutral', label: 'Modo Minimalista' },
  { id: 'night', label: 'Leitura Noturna' },
]

export default function App() {
  const [prefs, setPrefs] = useState(getPrefs)
  const [currentBookId, setCurrentBookId] = useState(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', prefs.theme)
    savePrefs(prefs)
  }, [prefs])

  const updatePrefs = (updates) => setPrefs(p => ({ ...p, ...updates }))

  return (
    <div className="app">
      {currentBookId ? (
        <Reader
          bookId={currentBookId}
          prefs={prefs}
          themes={THEMES}
          updatePrefs={updatePrefs}
          onBack={() => setCurrentBookId(null)}
        />
      ) : (
        <Library
          prefs={prefs}
          themes={THEMES}
          updatePrefs={updatePrefs}
          onOpen={(id) => setCurrentBookId(id)}
        />
      )}
    </div>
  )
}
