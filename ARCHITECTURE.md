# Architecture: Student Opportunity Verifier

Companion to PRD.md · Draft v2 · 18 October 2026 (layered build method added in section 2)

PRD.md defines what the product does. This file defines how it is built. Where they conflict, PRD.md wins on product behavior and this file wins on technical design.

## 1. Design principles

1. **Deterministic code establishes facts; the LLM reads and explains.** Domain age, DNS, registry lookups and scoring are plain functions. The LLM interprets language, summarizes findings and writes the report. It never decides the final risk level.
2. **Evidence first.** Every flag carries a quote from the user's input or a source URL. A claim without evidence is not shown.
3. **Fail soft.** Any lookup, agent or service can fail. A failure becomes `could_not_check`, lowers confidence, and never crashes a run.
4. **Untrusted input everywhere.** User text, screenshots and fetched web pages may contain instructions aimed at the model. They are always treated as data.
5. **Privacy by design.** Collect the minimum, delete early, store only identifiers with consent.
6. **Provider-agnostic.** LLM, search and classifier sit behind small interfaces so any can be replaced.
7. **Cache everything external.** Saves quota, speeds repeat checks, and makes demos reliable.

## 2. Layers and build method

The system is built **layer by layer, bottom-up**. Each layer is finished, tested and demonstrated before the next one starts. This keeps errors close to where they start and makes every later layer easy to test against stable foundations.

### 2.1 Layer map

| Layer | Name | Contains | Depends on | Exit gate |
|---|---|---|---|---|
| L0 | Foundation | Repo, Next.js init, env validation, logging, lint, test runner, folder structure | nothing | Dev server, lint and tests run; missing env variables fail with a clear message |
| L1 | Contracts and data | zod schemas for every shared shape (Check, Entity, Flag, AgentResult, ScoreResult, Report, progress events), fixtures for each, SQLite schema and migrations, state machine, cache | L0 | Every fixture validates; invalid data is rejected; invalid state transitions are rejected |
| L2 | Services | LLM layer (`generate`), tools (domain, payments, search, fetchPage with SSRF guard, youtubeComments), scam graph, classifier service and client | L0, L1 | Each service has mocked tests plus a runnable script proving one real call; failures return error results and never throw |
| L3 | Decision | Scoring engine: weights, hard rules, thresholds, confidence. Pure code | L1 | Fixture tests: clear scam gives High, genuine gives Low, thin evidence gives Cannot verify; every result lists the rules that fired |
| L4 | Agents | Six agents (Message Analyst, Website Forensics, Official Verifier, Reputation / OSINT, Payment and Entity, plus the classifier client wrapper) and the agent registry | L1, L2 | Each agent passes tests with mocked tools and LLM; every flag has evidence; timeout and failure produce could_not_check |
| L5 | Pipeline | Extraction (regex and vision), orchestrator, report writer, progress events, cleanup job | L1 to L4 | `scripts/run-check.js` runs a full check from the command line on fixtures and on a live example and produces a valid report |
| L6 | API and UI | API routes, SSE stream, pages (landing, check, confirmation, progress, report, guides), components | L1, L5 | The full browser flow works on mobile and desktop: submit, confirm, progress, report |
| L7 | Features and hardening | College email, fraud help, guide content, feedback, rate limiting, privacy cleanup, evaluation script, README, demo script | L6 | Evaluation script runs, privacy checks pass, demo rehearsed |

### 2.2 Build order and runtime flow

Build order is bottom-up: L0, L1, L2, L3, L4, L5, L6, L7.

Runtime flow is top-down and passes through the same layers:

```
Browser
  -> API routes ................................ L6
      -> Pipeline: extraction .................. L5
      -> Orchestrator .......................... L5
          -> Agents (run in parallel) .......... L4
              -> LLM, tools, graph, classifier . L2
          <- agent results, validated by contracts (L1)
      -> Scoring ............................... L3
      -> Report writer (uses the LLM layer) .... L5
      -> Database: checks, results, report ..... L1
Browser <- report through the API and SSE ...... L6
```

Why bottom-up: the UI and pipeline are the most visible parts but depend on everything else. Building the stable layers first means each higher layer is tested against code that already works.

### 2.3 Dependency rules

1. A layer imports only from layers below it. Never upward.
2. Only L1 (`lib/db`) touches the database. Agents and tools never read or write the database. The pipeline passes them a context and saves their results.
3. Only the LLM layer talks to an LLM provider. Only L2 tools talk to external services.
4. Agents never call each other. The orchestrator coordinates them.
5. Scoring (L3) is pure: results in, score out. No I/O and no LLM.
6. The UI talks only to API routes, never to agents or services.

### 2.4 Contracts first

Every shared shape lives in `lib/contracts/` as a zod schema with fixtures in `lib/contracts/fixtures/`. All layers validate data against these schemas at their boundaries. The UI can be built against the fixtures before the backend exists.

Change control: a contract change is made in this file first, then in `lib/contracts/`, then in the layers that depend on it, with fixtures and tests updated in the same change.

### 2.5 Layer gates

A layer is complete only when all of these hold:

1. Tests for the layer pass.
2. A runnable script demonstrates the layer working (a real call for services, a fixture run for agents and scoring, a command-line check for the pipeline).
3. Lint passes.
4. Contracts are unchanged, or this file and the fixtures were updated first.
5. The README and the layer status list in AGENTS.md are updated.

No work on the next layer starts before the gate passes. A bug found in a later layer is fixed in the layer that owns it, with a test added there.

### 2.6 Parallel tracks (do not block the layers)

- **Data track:** collect the classifier dataset and the 50 to 100 case test set, fill the known-domains list and the graph seed file. Needed for real classifier metrics (L2) and the evaluation script (L7).
- **UI track:** once the L1 fixtures exist, pages and components can be built against them while the backend layers continue.
- **Keys and accounts track:** obtain the search API key and optional keys before the L2 search work.

## 3. System overview

```
Browser (Next.js UI)
   |  HTTPS: forms, uploads, SSE progress
   v
Next.js server (App Router API routes)
   |-- Validation (zod) + rate limiting
   |-- Extraction (regex + vision LLM)
   |-- Orchestrator
   |       |-- Message Analyst ........ LLM
   |       |-- Website Forensics ...... domain tools + LLM summary
   |       |-- Official Verifier ...... search + fetch + LLM
   |       |-- Reputation / OSINT ..... search + fetch + YouTube API + LLM
   |       |-- Payment & Entity ....... payment tools + graph lookup
   |       '-- Classifier client ...... HTTP to Python service
   |-- Scoring engine (pure code)
   |-- Report writer (LLM)
   '-- SQLite (checks, results, cache, graph, feedback)

Python service (FastAPI): TF-IDF + logistic regression classifier

External: LLM provider, search API, RDAP/DNS/crt.sh/Wayback,
          Safe Browsing, URLScan, YouTube Data API
```

## 4. Components

| Component | Responsibility | Location |
|---|---|---|
| UI | Forms, confirmation editor, progress timeline, report, guides | `app/` |
| API routes | Validation, state transitions, SSE, actions | `app/api/` |
| Extraction | Regex entities, vision-LLM screenshot reading | `lib/extract.js` |
| Orchestrator | Runs agents in parallel, timeouts, progress events | `lib/orchestrator.js` |
| Agents | Six investigation units sharing one contract | `lib/agents/` |
| Tools | Plain functions for external lookups | `lib/tools/` |
| LLM layer | One `generate()` interface over providers | `lib/llm/` |
| Scoring | Weights, hard rules, thresholds, confidence | `lib/scoring/` |
| Graph | Scam identifier graph read and write | `lib/graph.js` |
| Classifier service | Train and serve the text classifier | `services/classifier/` |
| DB | SQLite access, migrations, state machine | `lib/db/` |
| Contracts | zod schemas and fixtures for every shared shape | `lib/contracts/` |
| Cache | TTL cache over `lookup_cache` | `lib/cache.js` |
| Env | The only place environment variables are read | `lib/env.js` |

## 5. Technology

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js 20 or newer | |
| Web framework | Next.js (App Router), JavaScript ES modules | One codebase for UI and API |
| Validation | zod | Inputs, env, LLM outputs |
| Database | SQLite via better-sqlite3 | Needs a persistent disk. For serverless hosting, move to Postgres (for example Supabase) behind `lib/db` |
| Classifier | Python 3, scikit-learn, FastAPI | Separate small service |
| Phone validation | libphonenumber-js | Validation only |
| LLM | Provider chosen by env | Must support image input |
| Search | Provider chosen by env | Google Programmable Search, Brave Search or similar |

## 6. Repository layout

```
/
  AGENTS.md
  PRD.md
  ARCHITECTURE.md
  .agents/                skills used by the coding agent
  app/
    page.js               landing
    check/page.js         input form
    check/[id]/page.js    confirm, progress, report
    guides/               guides index and [type]
    report-fraud/         post-payment help
    about/
    api/
      health/
      checks/             create, read, confirm, stream, report,
                          feedback, save-to-graph, college-email, fraud-summary
      guides/
  lib/
    env.js
    contracts/            zod schemas and fixtures for every shared shape
    cache.js
    extract.js
    orchestrator.js
    graph.js
    classifier.js         HTTP client for the Python service
    llm/generate.js
    db/
    agents/
    tools/
    scoring/
    data/                 known-domains.json, seed-graph.json
  services/classifier/
    data/dataset.csv
    train.py
    app.py
    requirements.txt
  scripts/
    smoke.js
    run-check.js          runs a full check from the command line
    seedGraph.js
    evaluate.js
  docs/
  data/                   app.db (gitignored)
```

## 7. Check lifecycle

State machine (invalid transitions are rejected in `lib/db`):

| From | To | Trigger |
|---|---|---|
| created | extracting | Inputs stored |
| extracting | awaiting_confirmation | Extraction finished |
| awaiting_confirmation | investigating | User confirms entities |
| investigating | scoring | All agents finished or timed out |
| scoring | report_ready | Report saved |
| any | failed | Unrecoverable error |

Sequence:

1. `POST /api/checks` validates input, creates the check (expires in 24 hours), stores inputs, starts extraction.
2. Extraction runs regex over all text and the vision model over each image, then deletes image files.
3. The UI shows extracted text and entities for editing. `POST /api/checks/:id/confirm` saves edits and starts the orchestrator in the background.
4. The orchestrator runs all agents plus the classifier with `Promise.allSettled`, each under a 25-second timeout, emitting progress events.
5. Scoring computes score, level and confidence from the saved results.
6. The report writer produces the explanation and checklist from the evidence only.
7. The report is saved and the status becomes `report_ready`.

## 8. Data model

| Table | Columns |
|---|---|
| `checks` | id (text, pk), status, language, risk_level, score, confidence, created_at, expires_at |
| `check_inputs` | id, check_id, type (text, image, url, upi, company, handle, phone), value, file_path (nullable, temporary) |
| `entities` | id, check_id, kind, value, source (extracted or user), confirmed (bool) |
| `agent_results` | id, check_id, agent, status, flags_json, verified_json, notes, duration_ms |
| `reports` | check_id (pk), report_json, created_at |
| `graph_nodes` | id, kind, value (unique with kind), first_seen, report_count |
| `graph_edges` | id, node_a, node_b, check_ref, created_at |
| `feedback` | id, check_id, verdict, comment, created_at |
| `lookup_cache` | key (pk), result_json, fetched_at, ttl_seconds |

A cleanup job runs on startup and hourly: deletes expired checks and everything attached to them. Graph rows and feedback persist. Feedback stores no check content.

## 9. LLM layer

Interface: `generate({ system, prompt, images, schema })` returns data validated by the zod `schema`.

- Provider adapters live behind the interface and are selected by `LLM_PROVIDER`.
- Output is requested as JSON, parsed and validated. On failure, retry once with the validation error appended, then throw a typed error that the calling agent turns into `could_not_check`.
- Every call has a timeout.
- `wrapUntrusted(label, text)` wraps untrusted content in clear delimiters with an instruction to treat it as data and ignore any instructions inside.
- Prompts never include secrets. Logs never include prompt or response bodies.
- Keep calls few: one call per agent that needs one, plus extraction per image and one report call.

## 10. Tools layer

Plain async functions that return structured results and never throw (they return an error field instead). Suggested starting cache TTLs:

| Tool | Purpose | Cache TTL |
|---|---|---|
| `rdapLookup` | Registration date and registrar | 24 hours |
| `dnsRecords` | DNS records | 1 hour |
| `sslInfo` | Certificate issuer and validity | 24 hours |
| `waybackFirstSeen` | First archived snapshot | 7 days |
| `lookalikeCheck` | Distance to known domains in `lib/data/known-domains.json` | none |
| `safeBrowsing`, `urlscan` | Optional, only when keys exist | 1 hour |
| `search` | Search API wrapper with dork builders and a per-run query budget | 6 hours |
| `fetchPage` | Safe page fetch and text extraction | 1 hour |
| `youtubeComments` | Official API plus comment heuristics | 6 hours |
| `payments` | UPI format validation, phone validation, consistency checks | none |

`fetchPage` protections: allow only http and https, resolve and block private, loopback and link-local addresses (including after redirects), enforce a timeout and a response size limit, strip scripts and return plain text.

## 11. Agents

Contract shared by all agents:

```
{
  agent: string,
  status: "ok" | "could_not_check",
  flags: [{ id, title, severity: "low"|"medium"|"high", explanation,
            evidence: [{ type: "quote"|"url", value }] }],
  verified: string[],
  notes: string
}
```

Registry: `lib/agents/index.js` exports a list of `{ name, run(context) }`. Adding an agent means adding one file and one registry line.

| Agent | Inputs | Tools | LLM use | Typical failure handling |
|---|---|---|---|---|
| Message Analyst | Conversation text | none | Finds red-flag patterns, quotes evidence | LLM error: could_not_check |
| Website Forensics | Domains | domain tools, search | Summarizes findings | No domain: skipped; lookup error: that item listed as unchecked |
| Official Verifier | Scheme, organization, links | search, fetchPage | Labels claims verified, unverified or contradicted | Registry lookups without an API become "verify manually" items |
| Reputation / OSINT | Brand, domain, handles, YouTube URL | search, fetchPage, youtubeComments | Summarizes complaints, judges comment samples | No results is reported as "no reports found", never as safe |
| Payment and Entity | UPI IDs, phone, domains, handles | payments, graph, search | none or light | Graph error: could_not_check for that part |
| Classifier client | Conversation text | HTTP to Python service | none | Service down: contributes nothing, listed as could_not_check |

The orchestrator emits events: `{ type: "agent", agent, status: "started"|"done"|"could_not_check", summary }`, `{ type: "stage", stage }` and `{ type: "complete" }`.

## 12. Scoring

Pure code in `lib/scoring/score.js`, configured by one file (`lib/scoring/config.js`) so weights can be tuned against the test set.

1. Sum flag weights (by flag id, falling back to severity).
2. Add up to 25 points from the classifier probability when present.
3. Apply hard rules, each forcing High: fee demand for a scholarship; request to rent or hand over a bank account, SIM or ATM card; graph match with a known scam.
4. Map the score: below 25 Low, 25 to 59 Medium, 60 and above High.
5. If fewer than 40% of relevant agents completed and the score is below 60, return Cannot verify.
6. Confidence is the share of relevant checks that completed (Low, Medium, High).

The function returns the score, level, confidence and the list of rules and flags that contributed, so every result is explainable.

## 13. Report writer

One `generate()` call. Input: the agents' evidence and the scoring result only. Output (zod-validated): summary in the chosen language, scam type guess, flags with plain-language explanations and sources, verified items, could-not-check items, a step-by-step checklist (including manual registry links), actions and disclaimer. The prompt forbids inventing facts and requires saying so when evidence is thin.

## 14. Classifier service

- **Training:** `train.py` builds TF-IDF features (word and character n-grams), fits logistic regression on a stratified 80/20 split with a fixed seed, prints precision, recall, F1 and the confusion matrix, and saves `model.joblib` and `metrics.json`.
- **Serving:** `app.py` (FastAPI) exposes `POST /classify` (returns label, probability and top terms) and `GET /health`.
- **Client:** `lib/classifier.js` calls the service with a short timeout. If it fails, the classifier simply contributes nothing.
- **Data:** the starter dataset is synthetic and only for pipeline testing. Real, sourced data must replace it before any metric is reported.

## 15. Scam graph

- **Write policy:** only from High-risk reports, only with explicit consent, only identifiers.
- **Operations:** `upsertNode`, `link`, `lookup(identifier)` returning earlier report counts and linked identifiers.
- **Use in a check:** the Payment and Entity agent looks up every UPI ID, domain, handle and phone number. A match emits a hard-rule flag showing linked identifiers.
- **Seeding:** `scripts/seedGraph.js` loads `lib/data/seed-graph.json`, which must be filled from public advisories.

## 16. API surface

The routes and payloads are defined in PRD.md section 6. Technical notes:

- Route handlers validate input with zod and return `{ error, code }` with user-safe messages.
- `GET /api/checks/:id/stream` uses Server-Sent Events with the event shapes in section 11. The client falls back to polling `GET /api/checks/:id` if the stream drops.
- Rate limiting is per IP on check creation (in-memory is enough for the demo).
- A check can be read only by its id. Ids are long random strings.

## 17. Frontend

- **Pages:** as listed in PRD.md section 4. `/check/[id]` renders one of three views based on the check status: confirmation editor, live progress timeline, final report.
- **State:** server state fetched per check, SSE for progress. No global state library needed.
- **Design:** tokens for color, type scale, spacing, radius and dark mode defined once. UI work follows the skills in `.agents/` (frontend design and Apple design among them). Mobile-first, accessible, readable on low-end phones.
- **Rendering untrusted text:** user and fetched text is always rendered as plain text, never as HTML.

## 18. Security and privacy

| Threat | Control |
|---|---|
| Prompt injection from messages, screenshots or web pages | Delimited untrusted blocks, instructions to ignore embedded commands, agents have no action-taking tools, LLM does not decide the risk level |
| SSRF through user-supplied URLs | `fetchPage` blocks private addresses and unsafe schemes, including after redirects, with timeout and size limits |
| Abuse and quota exhaustion | Rate limiting, per-run query budgets, caching |
| Data exposure | Images deleted after extraction, checks expire in 24 hours, only identifiers persist with consent, no content in logs |
| Secret leakage | Secrets only in `.env.local`, read only through `lib/env.js`, never sent to the client |
| XSS | Untrusted text rendered as text, framework escaping, no raw HTML injection |
| Defamation risk | Output is a risk assessment with sources, never a statement that a named person is a scammer |
| Misuse for tracking people | No tracing of individuals, phone numbers only validated, searched and matched in our own graph |

The design takes India's Digital Personal Data Protection Act, 2023 into account (minimum data, stated purpose, deletion). Get proper legal advice before any public launch.

## 19. Reliability and performance

- Per-agent timeout 25 seconds. Whole pipeline target under 60 seconds.
- Agents run in parallel, so total time is roughly the slowest agent.
- Cache hits make repeat checks near-instant.
- Every agent degrades independently. The report lists what could not be checked.
- Retries only for transient network errors, with a small limit.

## 20. Testing and observability

- **Unit tests:** scoring (weights, hard rules, thresholds, cannot_verify), entity regex extraction, UPI and phone validators, SSRF guard, state machine.
- **Agent tests:** mocked tools and mocked `generate()` with fixed fixtures, checking that flags always include evidence.
- **Smoke test:** `scripts/smoke.js` creates a check, fetches it, and calls `generate()` if keys are set.
- **Evaluation:** `scripts/evaluate.js` runs labeled cases through the full pipeline and prints agreement, a confusion table and failures.
- **Logging:** structured logs with check id, stage, agent, duration and status. No user content, no secrets.
- **Layer gates:** no layer is complete until its tests pass and a runnable script demonstrates it (section 2.5).

## 21. Configuration

| Variable | Required | Purpose |
|---|---|---|
| `LLM_PROVIDER` | yes | Selects the LLM adapter |
| `LLM_API_KEY` | yes | LLM credentials |
| `LLM_MODEL` | yes | Model name (vision-capable) |
| `SEARCH_PROVIDER` | later | Search adapter |
| `SEARCH_API_KEY` | later | Search credentials |
| `YOUTUBE_API_KEY` | optional | YouTube comment analysis |
| `SAFE_BROWSING_API_KEY` | optional | Link safety lookup |
| `URLSCAN_API_KEY` | optional | URLScan lookup |
| `CLASSIFIER_URL` | later | Python classifier service address |
| `DB_PATH` | optional | SQLite file, default `./data/app.db` |

## 22. Extension points

- New agent: one file in `lib/agents/` plus a registry entry.
- New LLM or search provider: one adapter behind the existing interface.
- Better classifier: replace the model inside the Python service, keeping the same `/classify` contract.
- Later channels: browser extension or WhatsApp bot calling the same API.
- Moving to Postgres: reimplement `lib/db` and `lib/cache.js` only.

## 23. Open decisions

- LLM provider and model for the first build.
- Search provider and its free quota.
- Which regional languages to support after Hindi.
- Owner of classifier data collection and the 50 to 100 case test set.
- Hosting target (persistent disk for SQLite, or Postgres).