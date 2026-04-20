# Right First Time

AI-powered Amazon listing optimization platform for TP-Link product teams.

## Quick Start

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build
```

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — full system architecture, data models, Multi-Agent SOP
- [`docs/html-prompt-reference.txt`](docs/html-prompt-reference.txt) — original prototype reference

## Project Structure

```
├── public/              # Static assets (logo, favicon)
├── src/
│   ├── agents/          # 5-Agent SOP pipeline (DataFetch → ContextBuilder → ContentGen → Compliance → Evaluation)
│   ├── components/
│   │   ├── layout/      # Sidebar, SidebarGroup
│   │   ├── modals/      # CreateTask, Persona, Rule, Category, Delete modals
│   │   ├── settings/    # SettingsAndRules, LLMConfig, TinyfishConfig, PersonaLibrary, CategoryRules
│   │   ├── ui/          # Badge, ProgressBar
│   │   └── workspace/   # Workspace, EditorSection, EvaluationReport, GenSettingsBar, SourceDataPanel
│   ├── i18n/            # zh.json / en.json translations
│   ├── services/        # tinyfish.ts, llm.ts API clients
│   ├── store/           # Zustand: taskStore, rulesStore, settingsStore
│   └── types/           # TypeScript interface definitions
├── docs/                # Architecture docs & reference materials
└── [config files]       # vite.config.ts, tailwind.config.js, tsconfig*.json
```

## Tech Stack

| Layer | Library |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 6 |
| Styling | Tailwind CSS 3 |
| State | Zustand 5 (with localStorage persistence) |
| i18n | i18next + react-i18next |
| Icons | lucide-react |
| AI APIs | OpenAI / Anthropic / Google Gemini |
| Data Fetch | Tinyfish API |
