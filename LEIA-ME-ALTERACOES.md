# Alterações aplicadas — RSVP Pro

## v1.1.0 — Audiobook + Mobile

- **Modo Audiobook (voz real):** novo botão 🔊 dentro do leitor (atalho `V`). Lê o texto do PDF
  com voz nativa do navegador (Web Speech API) — offline, sem backend e sem chaves de API.
- **Sincronização "karaokê":** a palavra falada é destacada na tela em tempo real.
- **Seletor de voz** (prioriza vozes naturais/neurais em português) e **velocidade 0,75×–2×**.
- **Arrastar e soltar PDF** direto na biblioteca para importar.
- **Responsividade mobile reforçada:** player, alternador de modos, presets e seletor de voz
  agora se comportam corretamente em telas pequenas (botões circulares não esticam, faixas
  roláveis, topbar sem quebrar, áreas de toque ≥ 44px, `safe-area-inset`).
- **Atalhos:** `N` (navegação) e `V` (alternar RSVP ↔ Audiobook); atalhos ignorados ao digitar em campos.
- Novos arquivos: `src/tts.js`. Preferências de voz/modo/velocidade são salvas no `localStorage`.

## v1.0.x — Ajustes anteriores

Ajustes rápidos de impacto visual/performance, sem mexer no núcleo que já funcionava.

### O que foi melhorado

- Tela inicial premium com promessa clara.
- Botão “Começar leitura agora”.
- Botão “Testar demonstração”.
- Botão “Instalar app” para PWA.
- Cards de status: biblioteca, palavras, ritmo e último arquivo.
- Loading mais bonito com barra de progresso na extração do PDF.
- Rodapé com posicionamento mais profissional.
- PDF.js agora carrega sob demanda, apenas quando o usuário importa PDF.
- Extração do PDF cede tempo para a interface respirar a cada poucas páginas.
- Sidebar do leitor agora renderiza uma janela inteligente de palavras, evitando travar em PDFs grandes.
- Nomes dos temas ficaram mais comerciais.

## Arquivos alterados

- src/App.jsx
- src/components/Library.jsx
- src/components/Reader.jsx
- src/index.css
- src/pdfExtract.js

## Como gerar a nova versão

Dentro da pasta do projeto, rode:

```bash
npm run build
```

Depois publique somente a pasta:

```txt
dist
```

no Netlify.

## Observação

Eu não removi funcionalidades existentes. O objetivo foi dar um “tcham” visual e reduzir pontos de lentidão sem desmontar a operação.
