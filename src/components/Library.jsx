import { useEffect, useMemo, useRef, useState } from 'react'
import { getBooks, saveBook, deleteBook } from '../storage.js'
import { extractTextFromPDF } from '../pdfExtract.js'

const DEMO_TEXT = `A leitura dinâmica não é sobre correr sem entender. É sobre criar foco, ritmo e clareza. Com o RSVP Pro, você transforma textos longos em uma experiência objetiva, limpa e sem distrações. Importe um PDF, escolha a velocidade ideal e leia palavra por palavra com destaque visual no ponto certo. O resultado é uma leitura mais concentrada, com menos ruído e mais produtividade. Este modo demonstração existe para você sentir a experiência antes mesmo de enviar um arquivo.`

export default function Library({ prefs, themes, updatePrefs, onOpen }) {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [loadingPct, setLoadingPct] = useState(0)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()

  const refresh = async () => setBooks(await getBooks())

  useEffect(() => { refresh() }, [])

  const stats = useMemo(() => {
    const totalWords = books.reduce((sum, book) => sum + (book.words?.length || 0), 0)
    const inProgress = books.filter(book => book.status === 'reading').length
    const done = books.filter(book => book.status === 'done').length
    const lastBook = books[0]?.name || 'Nenhum PDF importado'

    return { totalWords, inProgress, done, lastBook }
  }, [books])

  useEffect(() => {
    const handler = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) {
      alert('Se o botão de instalação não aparecer, use o menu do navegador e escolha “Adicionar à tela inicial” ou “Instalar app”.')
      return
    }

    installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (file) await processFile(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  const processFile = async (file) => {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      alert('Por favor, selecione um arquivo PDF.')
      return
    }

    setLoading(true)
    setLoadingPct(4)
    setLoadingMsg('Preparando seu PDF...')

    try {
      const words = await extractTextFromPDF(file, (pct) => {
        setLoadingPct(pct)
        setLoadingMsg(`Extraindo texto... ${pct}%`)
      })

      if (words.length === 0) {
        alert('Não foi possível extrair texto deste PDF. Tente um PDF com texto selecionável.')
        setLoading(false)
        return
      }

      const book = {
        id: Date.now().toString(),
        name: file.name.replace(/\.pdf$/i, ''),
        words,
        progress: 0,
        status: 'new',
        addedAt: new Date().toISOString(),
      }

      await saveBook(book)
      await refresh()
    } catch (err) {
      console.error(err)
      alert(err?.message || 'Erro ao processar o PDF. Verifique se o arquivo está correto.')
    }

    setLoading(false)
    setLoadingPct(0)
  }

  const handleDemo = async () => {
    const words = DEMO_TEXT.split(/\s+/).map(w => w.trim()).filter(Boolean)
    const demoBook = {
      id: `demo-${Date.now()}`,
      name: 'Demonstração RSVP Pro',
      words,
      progress: 0,
      status: 'new',
      addedAt: new Date().toISOString(),
    }

    await saveBook(demoBook)
    await refresh()
    onOpen(demoBook.id)
  }

  const handleDelete = async (id) => {
    if (!confirm('Remover este livro da biblioteca?')) return
    await deleteBook(id)
    await refresh()
  }

  const handleRestart = async (book) => {
    await saveBook({ ...book, progress: 0, status: 'new' })
    await refresh()
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) processFile(file)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    if (!dragOver) setDragOver(true)
  }

  const handleDragLeave = (e) => {
    if (e.currentTarget === e.target) setDragOver(false)
  }

  return (
    <>
      {loading && (
        <div className="loader-overlay">
          <div className="loader-box loader-box-premium">
            <div className="spinner" />
            <div>
              <p className="loader-title">{loadingMsg}</p>
              <p className="loader-subtitle">Organizando sua leitura inteligente. Já estamos no playbook da performance.</p>
            </div>
            <div className="loader-progress" aria-label="Progresso da extração">
              <div className="loader-progress-fill" style={{ width: `${loadingPct}%` }} />
            </div>
            <span className="loader-percent">{loadingPct}%</span>
          </div>
        </div>
      )}

      <div
        className={`library-view${dragOver ? ' drag-over' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {dragOver && (
          <div className="drop-hint">
            <div className="drop-hint-box">📥 Solte o PDF aqui para importar</div>
          </div>
        )}
        <div className="library-header">
          <div className="logo">
            <div className="logo-icon">R</div>
            <span className="logo-name">RSVP Pro</span>
          </div>
          <div className="header-actions">
            <select
              className="theme-select"
              value={prefs.theme}
              onChange={e => updatePrefs({ theme: e.target.value })}
            >
              {themes.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <button className="btn btn-ghost hide-mobile" onClick={handleInstall}>Instalar app</button>
            <button className="btn btn-primary" onClick={() => fileRef.current.click()}>
              <span>＋</span> Importar PDF
            </button>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={handleFile}
        />

        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">Leitura dinâmica com foco executivo</span>
            <h1>Transforme PDFs longos em sessões de leitura objetivas.</h1>
            <p>
              Importe seu PDF, escolha a velocidade e acompanhe a leitura palavra por palavra — ou ative o <strong>modo Audiobook</strong> e ouça o texto com voz real. Tudo numa experiência limpa, rápida e sem distrações.
            </p>
            <div className="hero-actions">
              <button className="btn btn-primary btn-hero" onClick={() => fileRef.current.click()}>Começar leitura agora</button>
              <button className="btn btn-ghost btn-hero" onClick={handleDemo}>Testar demonstração</button>
              <button className="btn btn-ghost btn-hero show-mobile" onClick={handleInstall}>Instalar app</button>
            </div>
          </div>
          <div className="hero-card" aria-hidden="true">
            <div className="hero-card-top">
              <span>Modo foco</span>
              <strong>{prefs.wpm || 350} ppm</strong>
            </div>
            <div className="hero-word">
              <span>per</span><strong>for</strong><span>mance</span>
            </div>
            <div className="hero-mini-progress"><span /></div>
            <p>Sem distrações. Sem ruído. Só execução.</p>
          </div>
        </section>

        <section className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Biblioteca</span>
            <strong>{books.length}</strong>
            <small>{books.length === 1 ? 'PDF importado' : 'PDFs importados'}</small>
          </div>
          <div className="stat-card">
            <span className="stat-label">Volume</span>
            <strong>{stats.totalWords.toLocaleString('pt-BR')}</strong>
            <small>palavras mapeadas</small>
          </div>
          <div className="stat-card">
            <span className="stat-label">Ritmo atual</span>
            <strong>{prefs.wpm || 350}</strong>
            <small>palavras por minuto</small>
          </div>
          <div className="stat-card">
            <span className="stat-label">Último arquivo</span>
            <strong className="stat-file" title={stats.lastBook}>{stats.lastBook}</strong>
            <small>{stats.inProgress} em andamento · {stats.done} concluído</small>
          </div>
        </section>

        {books.length === 0 ? (
          <div className="empty-state premium-empty">
            <div className="empty-icon">📚</div>
            <h2>Sua biblioteca está pronta para o primeiro PDF.</h2>
            <p>Faça um teste rápido com a demonstração ou importe um PDF real para começar sua leitura com método.</p>
            <div className="empty-actions">
              <button className="btn btn-primary" onClick={() => fileRef.current.click()}>
                Adicionar primeiro PDF
              </button>
              <button className="btn btn-ghost" onClick={handleDemo}>
                Testar demonstração
              </button>
            </div>
          </div>
        ) : (
          <div className="book-grid">
            <div className="section-title">Minha Biblioteca — {books.length} {books.length === 1 ? 'livro' : 'livros'}</div>
            {books.map(book => {
              const pct = book.words.length > 0
                ? Math.round((book.progress / book.words.length) * 100)
                : 0
              return (
                <div key={book.id} className="book-card">
                  <div className="book-icon">
                    {book.status === 'done' ? '✅' : book.status === 'reading' ? '📖' : '📄'}
                  </div>
                  <div className="book-info">
                    <div className="book-name" title={book.name}>{book.name}</div>
                    <div className="book-meta">
                      <span className={`book-status status-${book.status === 'new' ? 'new' : book.status === 'done' ? 'done' : 'reading'}`}>
                        {book.status === 'new' ? 'Não iniciado' : book.status === 'done' ? 'Concluído' : 'Em andamento'}
                      </span>
                      <span className="book-progress-text">{pct}% · {book.words.length.toLocaleString('pt-BR')} palavras</span>
                    </div>
                    <div className="book-progress-bar">
                      <div className="book-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="book-actions">
                    <button className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 12px' }} onClick={() => onOpen(book.id)}>
                      {book.status === 'new' ? 'Iniciar' : book.status === 'done' ? 'Reler' : 'Continuar'}
                    </button>
                    <button className="btn-icon" title="Reiniciar" onClick={() => handleRestart(book)}>↺</button>
                    <button className="btn-icon" title="Excluir" style={{ color: '#ef4444' }} onClick={() => handleDelete(book.id)}>✕</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="app-footer" style={{ marginTop: 24 }}>
          Leitura dinâmica com RSVP: foco, velocidade e retenção em uma experiência sem distrações.
        </div>
      </div>
    </>
  )
}
