# Student Opportunity Verifier

A website where students and parents can submit suspicious scholarships, internships, task-jobs, mule-account solicitations, or competitions to receive an evidence-backed risk assessment, source citations, and actionable next steps.

---

## 1. Setup & Installation

### Requirements
- **Node.js**: `v20.0.0+`
- **npm**: `v10.0.0+`

### Installation
Clone the repository and install dependencies:
```bash
npm install
```

Copy the example environment template:
```bash
cp .env.example .env.local
```

Configure your LLM credentials in `.env.local` (e.g. Gemini API key).

---

## 2. Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_PROVIDER` | **Yes** | `gemini` | LLM adapter (`gemini`, `openai`) |
| `LLM_API_KEY` | **Yes** | - | API key for LLM calls |
| `LLM_MODEL` | **Yes** | `gemini-2.5-flash` | Model identifier |
| `SEARCH_PROVIDER` | No (L2) | - | Search provider for OSINT |
| `SEARCH_API_KEY` | No (L2) | - | Search API credentials |
| `YOUTUBE_API_KEY` | No | - | Official YouTube Data API for comment analysis |
| `SAFE_BROWSING_API_KEY` | No | - | Google Safe Browsing API |
| `URLSCAN_API_KEY` | No | - | urlscan.io API |
| `CLASSIFIER_URL` | No (L2) | `http://localhost:8000` | Address of Python scikit-learn classifier service |
| `DB_PATH` | No | `./data/app.db` | Local SQLite database file location |

All environment variables are validated through [`lib/env.js`](file:///home/shreyas_95/Documents/PROJECTS/MY%20PROJECTS/DEM/lib/env.js). Missing required variables fail clearly with specific error messages and never print secret values.

---

## 3. How to Run

### Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

### Linting
```bash
npm run lint
```

### Unit Tests
```bash
npm test
```

### Smoke Test
```bash
node scripts/smoke.js
```
The smoke test verifies check creation in SQLite, state retention, 24-hour expiration calculation, and (if `LLM_API_KEY` is present) calls `generate()` with a strict Zod schema.

---

## 4. Project Structure

```
.
├── AGENTS.md               # Product rules, layer boundaries, and invariants
├── ARCHITECTURE.md         # Technical architecture and layer definitions
├── PRD.md                  # Product requirements and data specifications
├── app/
│   ├── globals.css         # Design tokens, Apple-inspired translucent materials
│   ├── layout.js           # Responsive header and disclaimer footer
│   ├── page.js             # Landing page (hero, 3 steps, 6 scam types, CTA)
│   ├── check/
│   │   ├── page.js         # Check submission form
│   │   └── [id]/page.js    # Investigation details and status view
│   └── api/
│       ├── health/route.js # Health probe (?llm=1 runs small generate() test)
│       └── checks/
│           ├── route.js    # POST /api/checks (creates check)
│           └── [id]/route.js # GET /api/checks/:id
├── lib/
│   ├── env.js              # Single place reading and validating process.env with Zod
│   ├── db/
│   │   └── index.js        # SQLite migrations (PRD tables) and check state machine
│   ├── cache.js            # TTL cache implementation on lookup_cache table
│   └── llm/
│       └── generate.js     # Unified generate() wrapper, retry, and wrapUntrusted()
├── scripts/
│   └── smoke.js            # End-to-end smoke test script
├── tests/
│   └── foundation.test.js  # Node.js native test suite for L0 Foundation
└── .env.example            # Environment template
```

---

## 5. Layer Progress

- [x] **L0 Foundation** (Passed: Next.js init, env validation, SQLite schema & state machine, LLM adapter, cache, API routes, responsive UI, lint & smoke tests)
- [ ] L1 Contracts and data
- [ ] L2 Services
- [ ] L3 Decision
- [ ] L4 Agents
- [ ] L5 Pipeline
- [ ] L6 API and UI
- [ ] L7 Features and hardening
