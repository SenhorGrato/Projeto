# 📚 Leitura RSVP Pro

Leitor RSVP **+ Audiobook** para PDFs. Importe um PDF, o app extrai o texto e exibe uma palavra por vez no centro da tela, com destaque na letra estratégica para leitura dinâmica — **ou** ative o modo Audiobook e ouça o texto com voz real, totalmente offline.

---

## 🔊 Modo Audiobook (voz real)

- Botão **🔊 Audiobook** dentro do leitor (atalho `V`).
- Usa a síntese de voz nativa do navegador (Web Speech API): alta fidelidade, **sem internet, sem backend e sem chaves de API**.
- A palavra falada é destacada na tela em tempo real (efeito "karaokê").
- Seletor de voz (prioriza vozes naturais/neurais em português) e velocidade de 0,75× a 2×.
- Funciona melhor no **Google Chrome** e **Microsoft Edge** (que trazem vozes em português de altíssima qualidade).

> O modo RSVP (visual) continua funcionando exatamente como antes. Os dois modos compartilham o mesmo progresso de leitura.

---

## ⚡ Instalação e Execução

### Pré-requisitos
- **Node.js 18+** instalado → [nodejs.org](https://nodejs.org)

### Passos

```bash
# 1. Entre na pasta do projeto
cd leitura-rsvp-pro

# 2. Instale as dependências
npm install

# 3. Rode em modo desenvolvimento
npm run dev
```

Abra **http://localhost:5173** no navegador.

### Build para produção

```bash
npm run build
npm run preview  # para testar o build
```

---

## 🗂️ Estrutura de Arquivos

```
leitura-rsvp-pro/
├── index.html
├── package.json
├── vite.config.js
├── public/
│   └── favicon.svg
└── src/
    ├── main.jsx          # Entrada React
    ├── App.jsx           # Roteamento Library ↔ Reader
    ├── index.css         # Todos os estilos + 5 temas
    ├── storage.js        # localStorage (livros + preferências)
    ├── pdfExtract.js     # Extração de texto via PDF.js
    ├── tts.js            # Motor de Audiobook (Web Speech API + sync de palavra)
    ├── rsvp.js           # Algoritmo de highlight (ORP)
    └── components/
        ├── Library.jsx   # Tela da biblioteca
        └── Reader.jsx    # Leitor RSVP
```

---

## 📱 Como usar

1. **Abrir o app** → http://localhost:5173
2. **Clicar em "+ PDF"** → escolha um arquivo PDF
3. **Aguardar extração** → o texto é extraído automaticamente
4. **Clicar em "Iniciar"** → o livro aparece na biblioteca
5. **Ajustar velocidade** → Lento / Normal / Rápido / Turbo
6. **Pressionar ▶ ou Espaço** → leitura começa!

### Atalhos de teclado
| Tecla | Ação |
|-------|------|
| `Espaço` | Iniciar / Pausar |
| `→` | Próxima palavra |
| `←` | Palavra anterior |
| `N` | Abrir / fechar navegação |
| `V` | Alternar entre RSVP e Audiobook |

### Velocidades disponíveis
| Modo | PPM |
|------|-----|
| Lento | 200 |
| Normal | 350 |
| Rápido | 500 |
| Turbo | 700 |
| Manual | 50–2000 |

### Temas disponíveis
- 🌑 Escuro Elegante
- ☀️ Claro Suave
- 🌸 Pastel Confortável
- ⬜ Neutro Profissional
- 🌙 Foco Noturno

---

## 📲 Instalar como PWA (app no celular/desktop)

O app já é um PWA. Após abrir no navegador:

**No celular (Android/iOS):**
- Abra no Chrome/Safari → menu → "Adicionar à tela inicial"

**No computador (Chrome/Edge):**
- Aparece um ícone de instalação na barra de endereço → clique e instale

---

## 🔒 Privacidade

- **Nenhum dado sai do seu dispositivo.**
- Tudo é salvo no `localStorage` do navegador.
- Não há backend, login ou nuvem.

---

## ⚠️ Limitações

- PDFs escaneados (imagens) não têm texto extraível → use PDFs com texto digital.
- PDFs muito grandes (500+ páginas) podem demorar alguns segundos para processar.
- O progresso é salvo por navegador (não sincroniza entre dispositivos).
