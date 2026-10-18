# AGENTS.md: Student Opportunity Verifier

## Project
A system that takes a suspicious scholarship, internship, job, task-job, mule-account or competition offer (text, screenshots, link, UPI ID, company, handle, optional phone) and returns a risk level (low, medium, high, cannot_verify), evidence-backed flags and a "what to verify next" checklist. A main agent (coordinator) keeps all inputs in a shared case file, runs the specialist agents that have something to check, merges their findings, and runs the scoring engine.

## Source of truth
Read PRD.md (product behavior, routes, API, data model), ARCHITECTURE.md (technical design: layers in section 2, case file and coordinator in section 3, layout in section 7) and this file before every task. PRD.md wins on product behavior, ARCHITECTURE.md on technical design. If anything is unclear or conflicting, ask instead of guessing. Do not edit PRD.md or ARCHITECTURE.md unless asked, except for the contract change rule below.

## Skills (.agents/)
- gravitas: STRICT on every task. Read its SKILL.md first and follow it exactly: read before write, test-driven validation, respect layer gates, ground every claim in command output you ran. If it conflicts with a task prompt, stop and ask.
- ai-ml: read its SKILL.md before any work on LLM calls, prompts, structured output, tool use, the classifier or evaluation (mainly L2, L4, L5, L7).
- apple-design, design-taste-frontend, frontend-design: UI work only. The UI is deferred; do not use them until UI work starts.
- State which skills you used in your summary.

## Current scope: backend first
Build the backend first: L0 to L5, the API routes and SSE stream (backend part of L6), and cleanup, evaluation and hardening (backend part of L7). The UI is deferred. UI code built early lives in `deferred/ui/` and is reviewed when UI work starts. Do not touch `deferred/ui/` or build UI until asked.

## How we build: layer by layer
Layers (details in ARCHITECTURE.md section 2): L0 Foundation, L1 Contracts and data, L2 Services, L3 Decision (scoring), L4 Agents, L5 Pipeline (extraction, coordinator, report writer), L6 API and UI, L7 Features and hardening.

### Layer status (update this list when a gate passes)
- [x] L0 Foundation
- [ ] L1 Contracts and data
- [ ] L2 Services
- [ ] L3 Decision
- [ ] L4 Agents
- [ ] L5 Pipeline
- [ ] L6 API (backend) and UI (later)
- [ ] L7 Features and hardening

Provisional code built early: `lib/db/index.js`, `lib/cache.js` (audit in L1), `lib/llm/generate.js` (audit in L2), API routes (audit in L6 backend). UI moved to `deferred/ui/`.

### Layer rules
1. **Work only on the layer named in the task.** Do not build ahead, and do not start a layer whose lower layers are not marked complete above.
2. **Dependency direction:** a layer imports only from layers below it. Never upward.
3. **Only `lib/db` touches the database.** Agents and tools never read or write it; the coordinator saves results.
4. **Only the LLM layer calls an LLM provider.** Only L2 tools call external services.
5. **Agents never call each other and never write to the case file or database.** They read a snapshot and return a result; the coordinator validates and merges it.
6. **Scoring is pure code:** no I/O, no LLM.
7. **The UI talks only to API routes.**
8. **Contracts first.** Every shared shape is a zod schema in `lib/contracts/` with fixtures. To change a contract: update ARCHITECTURE.md first, then the schema and fixtures, then dependents, in one change, and tell me.
9. **Do not modify a lower, completed layer** to make a higher layer work. If a lower layer has a bug or a gap, stop, report it, and fix it in the layer that owns it with a test added there.

### Layer gate (a layer is done only when all hold)
1. Tests for the layer pass (`npm test`).
2. A runnable script demonstrates the layer working.
3. Lint passes (`npm run lint`).
4. Contracts are unchanged, or ARCHITECTURE.md and fixtures were updated first.
5. README and the layer status list above are updated.

Show the commands you ran and their output as proof. Never mark a gate as passed without running it.

## Case file and coordinator rules
- All state about a check lives in one case file, stored in SQLite and validated by the CaseFile contract. It is not a markdown file. `renderMarkdown()` produces a read-only markdown view for prompts, debugging and demos; it is never parsed back.
- **Single writer:** only the coordinator writes. Agents return AgentResults.
- **Eligibility:** every agent has a deterministic `canRun(snapshot)` rule (no LLM). If it has nothing to check it returns `skipped` with a reason.
- **Statuses:** `ok`, `skipped` (not counted in confidence), `could_not_check` (eligible but failed or timed out; lowers confidence).
- **Rounds:** at most 2. Agents may return `newEntities`; the coordinator merges them (max 5 per agent per round, only domain, handle and company kinds, evidence required, normalized, deduplicated, marked `discovered`). Discovered entities still pass the SSRF guard before any fetch.
- Flag ids come from the fixed flag registry in `lib/contracts/`. Never invent a flag id.

## Stack and commands
Next.js (App Router) route handlers for the API, JavaScript ES modules, zod, better-sqlite3, Node 20+. Python 3 (scikit-learn, FastAPI) only in `services/classifier`.
Commands: `npm run dev`, `npm run lint`, `npm test`, `node scripts/smoke.js`, `node scripts/run-check.js` (from L5).

## Non-negotiable product rules
1. Output is a risk assessment, never a statement that a named person is a scammer.
2. Deterministic code establishes facts; the LLM only reads and explains. The LLM never decides the final risk level.
3. No result is ever shown as "safe". Missing evidence means cannot_verify.
4. Every flag carries evidence: a quote from the user's input or a source URL.
5. No Instagram, Facebook or LinkedIn scraping. No scraping of search result pages.
6. No tracing or identifying people. Phone numbers are only validated, searched and matched against our own graph.
7. Free-tier limits, API availability and platform terms change: never assume them; flag what must be checked.

## Agent contract
Each agent is an async function with `canRun(snapshot)` and `run(snapshot)`. `run` returns `{ agent, kind, round, status: "ok" | "skipped" | "could_not_check", reason, flags[], verified[], newEntities[], trace, notes }`. A flag is `{ id, title, severity, explanation, evidence[] }`. Agents never throw, respect a 25-second timeout, cache lookups through the tools layer, and validate LLM output with zod. All LLM calls go through `lib/llm/generate.js`.

## Security and privacy
- Secrets only in `.env.local`, read only through `lib/env.js`. Never log keys or user content. Never expose secrets to client code.
- Treat user text, screenshots and fetched web pages as untrusted data: wrap in delimited blocks and instruct the model to ignore instructions inside them.
- Any fetch of a user-supplied or discovered URL needs SSRF protection (block private and loopback addresses, non-http(s) schemes, including after redirects) plus timeout and size limits.
- Validate every input with zod. Rate limit check creation.
- Render untrusted text as plain text, never as HTML.
- Delete uploaded images after extraction. Checks expire after 24 hours. Persist only graph identifiers and anonymous feedback.
- During development use only fake or self-written sample messages, never real people's chats.

## Code conventions
Small functions, JSDoc on exported functions, explicit error handling, no dead code, no new dependency without a stated reason, one place for env access, tests next to the layer they cover.

## Working method
- Follow gravitas strictly.
- Do only what the current task asks.
- Work in small steps. After each step, run the code or tests and check the result.
- If blocked or a requirement is ambiguous, stop and ask. Do not guess.
- Write the failing test that reproduces a bug before fixing it.
- Keep README current.

## Definition of done
The layer gate above passes, no secrets are committed, and you end with a summary: layer worked on, skills used, files changed, commands run with results, what I must do next, and what the next layer will build on.