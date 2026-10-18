# Product Requirements Document: Student Opportunity Verifier

Working title · Draft v1 · 17 October 2026 · Prepared for Shreyas and team

## 1. Overview

### 1.1 Problem

Students constantly meet scholarships, internships, jobs, freelance work, competitions, websites and messages online. Many are genuine, but others are designed to collect money or personal information. Documented patterns include fake scholarship links circulating on WhatsApp (for example the fake National Sports Scholarship 2026-27 flagged by PIB Fact Check), internship offers that demand a "registration fee", Telegram task jobs that start with small payouts and then ask for deposits, and offers to rent out a student's bank account, which turns the student into a money mule.

The challenge is not only detecting scams but helping users understand why something may be risky and what to verify before acting.

### 1.2 Product vision

A website where a student submits a suspicious offer (text, screenshot, link, payment ID) and receives a **risk level, plain-language reasons backed by sources, and a checklist of what to verify before taking action**. The system investigates like an analyst: it reads the message, inspects the website, checks official sources, searches for public reports, and links payment IDs across reports.

### 1.3 Goals

1. Give every submission one of four outcomes: Low, Medium, High, or Cannot verify.
2. Explain every flag in simple language with a source the user can open.
3. Tell the user exactly what to verify next and how.
4. Help victims act fast (reporting steps and a pre-filled complaint summary).
5. Get smarter over time through a scam intelligence graph and user feedback.

### 1.4 Non-goals

- Declaring a person or organisation "a scammer". Output is a risk assessment with evidence.
- Tracing, locating or identifying private individuals (no IP, location or name lookup from a phone number).
- Scraping Instagram, Facebook or LinkedIn.
- Guaranteeing that an offer is safe. "No reports found" is never shown as "safe".

### 1.5 Target users

- School and college students (primary), looking at scholarships, internships, jobs, competitions.
- Parents of students (secondary), who are targeted by scholarship calls.
- College placement cells and teachers (later), who can share the tool.

### 1.6 Success metrics

| Metric | Target for demo |
|---|---|
| Classifier F1 on held-out test set | Report the real number, aim above 0.85 |
| End-to-end agreement with human labels (50-100 test cases) | Above 80% |
| Time from submit to report | Under 60 seconds |
| Every flag in a report has a source or quoted evidence | 100% |

## 2. Scam types in scope

| Type | Typical pattern | Key signals the system looks for |
|---|---|---|
| Fake scholarship | WhatsApp or SMS link, call to parents, "selected" message | Fee requested, non-.gov.in domain, not listed on the official portal, APK download, QR code requests |
| Fake internship or job | Offer without interview, "registration" or "training" fee, impersonated placement cell | Free-mail recruiter, personal UPI ID, urgency, company not found in registries |
| Task or part-time job | Telegram or WhatsApp group, small early payouts, then a deposit | Off-platform contact, "like and earn", deposit for a premium task, fake earning screenshots |
| Money mule offer | "Rent your account", "receive money for a commission", currency exchange pitch | Request for bank account, ATM card or SIM, commission per transfer |
| Fake competition or certificate | Entry fee, instant certificate, borrowed brand name | Unverifiable organiser, certificate sold for a fee, copied branding |
| Overseas study or visa agent | Deposit for admission, forged confirmation letters | Direct admission claims, deposits to personal accounts |

## 3. Inputs

| Input | Format and limits | How it is used |
|---|---|---|
| Message text | Pasted text, up to 10,000 characters | Message Analyst, classifier |
| Chat screenshots | Up to 5 images, PNG or JPG, 5 MB each | Vision extraction, then same as text |
| Link or website | URL | Website Forensics, Official Verifier, Reputation |
| UPI ID or payment details | Text, validated by format | Payment and Entity checker, graph |
| Company or organisation name | Text | Official Verifier, Reputation |
| Social handle or channel link | YouTube, Reddit, public Telegram channel (no Instagram scraping) | Reputation / OSINT |
| YouTube video URL | URL | Comment analysis through the official API |
| Phone number (optional) | Text, validated with libphonenumber | Validation, scam-report search, graph match only. No tracing, no name or location lookup |
| Language preference | English, Hindi, others later | Report language |

At least one of text, image or link is required. All other fields are optional. The more the user provides, the higher the confidence of the report.

## 4. Website structure and routes

| Route | Purpose |
|---|---|
| `/` | Landing page: what the tool does, example scams, a "Check an offer" button |
| `/check` | New check form: text box, image upload, optional fields (link, UPI ID, company, handle, phone), language selector, consent checkbox |
| `/check/[id]` | One page with three states: extraction confirmation, live progress, final report |
| `/guides` | List of scam types |
| `/guides/[type]` | Guide for one scam type (how it works, red flags, what to do) |
| `/report-fraud` | "I already paid or shared details" help: steps and complaint summary generator |
| `/about` | How it works, data sources, limits, privacy |
| `/feedback` | Optional page or modal for "this was right / wrong" |

Shared UI components: input form, extracted-entities editor, progress timeline, risk badge, flag card (title, explanation, evidence links), checklist, action buttons, disclaimer footer.

## 5. End-to-end user flow

A check moves through these states: `created`, `extracting`, `awaiting_confirmation`, `investigating`, `scoring`, `report_ready` (or `failed`).

1. **Submit.** The user opens `/check`, adds inputs and ticks the consent box ("I understand this is a risk assessment, not a legal verdict"). The frontend calls `POST /api/checks`.
2. **Extraction.** The backend stores the inputs and starts extraction: a vision model reads each screenshot (messages, sender label, timestamps, links, amounts, payment IDs) and regex finds URLs, UPI IDs, emails, amounts and phone numbers in all text.
3. **Confirm.** The user lands on `/check/[id]` in the `awaiting_confirmation` state and sees what was read: the conversation text and a list of detected entities (domains, UPI IDs, company names, handles). They can edit, delete or add items. This prevents wrong readings from corrupting the report. They click "Start check".
4. **Investigation.** The frontend calls `POST /api/checks/:id/confirm`. The orchestrator starts all agents in parallel. The page shows a live timeline (for example "Checking website... done", "Searching for reports... in progress") using server-sent events or polling.
5. **Scoring.** When agents finish or time out, the scoring engine combines flags and the classifier output into a risk level.
6. **Report.** The report writer produces the explanation, checklist and recommended actions in the chosen language.
7. **Act.** The user can open any source link, copy the checklist, generate a draft email to the college or placement cell, open the "I already paid" help, or mark the report as right or wrong.
8. **Optional save.** If the user agrees, identifiers (UPI ID, domain, handle) from a High-risk report are saved to the scam graph. Screenshots and message text are not saved.

## 6. Backend API

All routes are JSON unless stated. Base path `/api`.

| Method and route | Purpose | Request | Response |
|---|---|---|---|
| `POST /checks` | Create a check and start extraction | multipart: text, images, url, upiId, company, handle, phone, language | checkId, status |
| `GET /checks/:id` | Read state and extracted entities | none | status, extracted text and entities |
| `POST /checks/:id/confirm` | Confirm or edit entities and start the investigation | entities, text | status: investigating |
| `GET /checks/:id/stream` | Live progress (server-sent events) | none | events with agent, status, summary |
| `GET /checks/:id/report` | Final report | none | report object (section 11) |
| `POST /checks/:id/feedback` | User feedback | verdict (right or wrong), optional comment | ok |
| `POST /checks/:id/save-to-graph` | Save identifiers with consent | consent: true | number saved |
| `POST /checks/:id/college-email` | Draft an email to the college or placement cell | recipientType | subject, body |
| `POST /checks/:id/fraud-summary` | Pre-filled complaint summary | optional amount, date, paymentMethod | text |
| `GET /guides/:type` | Guide content | none | guide content |

Internal service (not public): `POST classifier/classify` takes the message text and returns a label, a probability and the top contributing terms.

Conventions: every check has an id, expires after 24 hours, and can be fetched only with its id. Errors return an error message and code with user-safe wording.

## 7. Processing pipeline: what runs, when, and which model

The design principle is **deterministic code for facts, LLM for reading and explaining**. The LLM never decides the final risk level.

| Stage | When | What runs | Model or tool type | Output |
|---|---|---|---|---|
| 0. Validation | On submit | Input checks, file type and size limits, regex entity extraction | Code | Validated inputs, raw entities |
| 1. Screenshot extraction | On submit, per image | Read messages, sender, links, payment IDs, amounts | Vision-capable LLM | Text and entities |
| 2. Confirmation | After extraction | User edits entities | UI | Confirmed inputs |
| 3a. Classifier | After confirm, parallel | Score message text | Trained ML model (Python service) | Scam probability, top terms |
| 3b. Message Analyst | After confirm, parallel | Find red-flag patterns in the conversation | LLM, no tools | Flags with quoted evidence |
| 3c. Website Forensics | After confirm, parallel, if a domain exists | Domain age, DNS, SSL, lookalike check, Wayback, Safe Browsing, URLScan, copied-text check | Code tools plus a short LLM summary | Flags with evidence |
| 3d. Official Verifier | After confirm, parallel | Check .gov.in, official portal or PIB mentions, company registry claims | Search API plus LLM reading results | Verified, unverified or contradicted claims |
| 3e. Reputation / OSINT | After confirm, parallel | Dorks, Trustpilot single lookup, Reddit, YouTube comments, public Telegram content | Search API, official APIs, LLM judging | Flags with source links |
| 3f. Payment and Entity | After confirm, parallel | Search UPI ID, domain or handle; query the scam graph | Code plus search | Matches and flags |
| 4. Scoring | When 3a-3f finish or after timeout | Weighted flags and hard rules | Code | Risk level, score, confidence |
| 5. Report writer | After scoring | Explanation, checklist, actions, translation | LLM | Final report |
| 6. Persistence | After report | Store report, optionally save to graph | Code | Database rows |

Timeouts: each agent has a 25-second limit. A timed-out agent returns a could_not_check status and lowers confidence instead of failing the whole check.

## 8. Agent specifications

Every agent returns the same structure: agent name, status, a list of flags, a list of verified items, and notes. Each flag has an id, title, severity, explanation and evidence. Evidence is either a quoted snippet from the user's input or a source URL.

### 8.1 Orchestrator

Starts all agents with `Promise.allSettled`, enforces timeouts, streams progress, and passes the merged results to scoring. It contains no AI of its own.

### 8.2 Message Analyst

- **Input:** conversation text.
- **Looks for:** fee or deposit requests, urgency or deadlines, pressure to move to WhatsApp or Telegram, selection without interview, guaranteed income, requests for bank details or OTPs, impersonation of an authority, task-and-deposit scripts, mule-style requests (account rental, commission per transfer).
- **Tools:** none.
- **Note:** spelling mistakes are a weak signal, used only as a minor input.

### 8.3 Website Forensics

- **Input:** domain or URL.
- **Checks:** domain age and registrar (RDAP), DNS records, SSL certificate, lookalike distance to well-known organisations, certificate transparency for sibling domains (crt.sh), Wayback history, Google Safe Browsing, URLScan, VirusTotal, copied About-page text via quoted search, missing contact or legal pages.
- **Tools:** each check is a plain function. The LLM only summarises the combined findings.

### 8.4 Official Verifier

- **Input:** claimed scheme, organisation or registration.
- **Checks:** whether the link is a .gov.in domain, whether the scheme appears on the official scholarship portal or the sponsoring ministry site, whether PIB Fact Check or the institution has published a warning, whether a claimed company registration can be found.
- **Method:** site-restricted searches such as `site:gov.in "scheme name"`. Registry lookups that have no free API (for example MCA or GST) are shown as "verify manually" links in the checklist rather than claimed as checked.

### 8.5 Reputation / OSINT

- **Input:** brand, domain, handle, link.
- **Dorks (generated by the agent, executed by code):** scam or fraud keywords with the brand, `site:reddit.com`, `site:trustpilot.com`, complaint sites, a minus-site search to see what others say about a domain, and quoted distinctive text to find copying.
- **Trustpilot:** locate the company page through search, then read the public page for review count, rating spread, dates and reply behaviour. Single user-triggered lookups only, and the current terms of service must be checked first. A missing page is reported as "no reputation history found".
- **Review patterns:** bursts of five-star reviews on nearby dates, near-identical wording, reviewers with one review.
- **Comments (YouTube):** official YouTube Data API, with heuristics (duplicate and near-duplicate ratio, generic praise, emoji-only comments, posting bursts) plus LLM judgement on a sample.
- **Reddit:** through site-restricted search, or the official API subject to current terms.
- **Telegram:** public channel content supplied by the user as a link, pasted text or screenshot. Automated access only where the platform's terms allow it.

### 8.6 Payment and Entity Checker

- **Input:** UPI IDs, domains, handles, phone number.
- **Checks:** scam-report search on each identifier, graph lookup for earlier reports, phone validation and classification (libphonenumber), consistency checks (for example a government scheme asking for payment to a personal-looking ID).
- **Phone numbers:** never traced. Used only for validation, report search and graph matching.

## 9. ML classifier

- **Task:** classify message text as scam-like or genuine, with a probability and the terms that drove the score.
- **Data:** a labeled set built from public scam advisories and news reports, Reddit scam posts, and genuine notices from official career pages and scholarship portals. Target 500 or more examples across the scam types, with a fixed test split (20%) never used for training.
- **Models:** baseline of TF-IDF plus logistic regression (scikit-learn). Stretch goal: fine-tune a multilingual transformer for Hindi and English.
- **Serving:** small Python FastAPI service called by the Node backend.
- **Reporting:** precision, recall and F1 on the test split, a confusion matrix, and a list of failure cases shown honestly in the presentation.
- **Role in the product:** one input to the score. It does not override evidence from agents.

## 10. Scoring engine

Plain code, fully explainable. The initial values below are starting points to tune against the test set.

- Each flag has a severity weight (for example fee before selection: 30, personal payment ID for an organisation: 25, domain under 30 days old: 20, not found on official portal: 20, urgency: 10, off-platform contact: 10).
- The classifier probability adds up to 25 points.
- **Hard rules override the sum:** a fee demand for a scholarship, any request to rent or hand over a bank account, SIM or ATM card, or a match with a known scam in the graph results in High.
- **Thresholds:** below 25 is Low, 25 to 59 is Medium, 60 and above is High.
- **Cannot verify:** if fewer than 40% of the relevant checks completed and the score is below 60, the outcome is Cannot verify, never Low.
- **Confidence:** the share of relevant checks that completed, shown as Low, Medium or High confidence.

## 11. Report

The report returned by `GET /checks/:id/report` contains these fields:

| Field | Content |
|---|---|
| riskLevel | low, medium, high or cannot_verify |
| score and confidence | Number from 0 to 100 and a confidence label |
| scamTypeGuess | scholarship, internship, task job, mule offer, competition, overseas agent or unknown |
| summary | Plain-language summary in the chosen language |
| flags | List of flags, each with title, severity, explanation and evidence (quote or source link) |
| verified | Things that checked out (for example valid SSL) |
| couldNotCheck | Checks that failed or were skipped |
| checklist | What to verify next, step by step |
| actions | Buttons to show: college email, fraud help |
| disclaimer | Risk assessment based on public information, not a legal verdict |

Report page sections: risk badge with confidence, summary, flag cards (each expandable with sources), what we could not check, the "what to verify next" checklist, action buttons, feedback buttons, disclaimer.

The report writer must only use evidence supplied by the agents. If the evidence is thin, it says so.

## 12. Scam intelligence graph

- **Nodes:** UPI ID, domain, social handle, phone number, company name.
- **Edges:** two nodes appeared together in one reported scam.
- **Use:** on each check, look up every identifier. A match with a node from a High-risk report adds a hard-rule flag and shows linked identifiers (for example, this UPI ID was reported together with these two domains).
- **Writes:** only from High-risk reports, only with user consent, only identifiers (never screenshots or chat text).
- **Demo data:** seeded with identifiers from public scam advisories. The presentation states this clearly.
- **Implementation:** two database tables (graph_nodes and graph_edges) are enough for the demo. A graph visualisation page is optional.

## 13. Data model

| Table | Key fields |
|---|---|
| `checks` | id, status, language, risk_level, score, confidence, created_at, expires_at |
| `check_inputs` | check_id, type (text, image, url, upi, company, handle, phone), value or temporary file reference |
| `entities` | check_id, kind, value, source (extracted or user-added), confirmed |
| `agent_results` | check_id, agent, status, flags_json, duration_ms |
| `reports` | check_id, report_json |
| `graph_nodes` | id, kind, value, first_seen, report_count |
| `graph_edges` | node_a, node_b, check_ref, created_at |
| `feedback` | check_id, verdict, comment, created_at |
| `lookup_cache` | key, result_json, fetched_at, ttl |

Retention: checks, inputs and reports are deleted after 24 hours. Uploaded images are deleted right after extraction. Only graph rows and anonymous feedback persist.

## 14. External services

| Purpose | Service | Notes |
|---|---|---|
| LLM (text and vision) | Free-tier provider to start | Behind one generate wrapper so the provider can be swapped. Check current free-tier limits |
| Web search and dorks | Search API (Google Programmable Search, Brave Search or similar) | Do not scrape results pages. Check quotas and cache results |
| Domain data | RDAP, DNS, crt.sh, Wayback Machine | Free |
| Link safety | Google Safe Browsing, URLScan, VirusTotal | Free tiers, rate-limited |
| YouTube comments | YouTube Data API | Daily quota applies |
| Reddit | Site-restricted search or official API | Check current terms and limits |
| Phone validation | libphonenumber | Local library |

All limits and terms must be re-checked before the demo, since free tiers change.

## 15. Reliability

- **Caching:** every external lookup is cached by key (domain, query, ID) with a time-to-live, so repeated checks are instant and quota-friendly.
- **Rate limiting:** per-IP limits on check creation to prevent abuse.
- **Failures:** any lookup that fails returns could_not_check for that item. The report lists what could not be checked.
- **Structured outputs:** all LLM calls ask for strict JSON and are validated against a schema. Invalid output is retried once, then the agent returns could_not_check.
- **Prompt injection defence:** scam messages and fetched pages can contain instructions aimed at the model. All user and web content is passed as data inside clearly delimited blocks, the model is told to ignore any instructions inside it, and agents have no tools that can take actions on the user's behalf.

## 16. Privacy, security and legal

- Output is always worded as a risk assessment with evidence. It never states that a named person is a scammer.
- No tracing or identification of individuals. Phone numbers get validation, report search and graph matching only.
- Users are told to crop out other people's private details before uploading screenshots.
- Images are deleted after extraction. Checks expire after 24 hours. Saving to the graph needs explicit consent.
- Design with India's Digital Personal Data Protection Act, 2023 in mind: collect the minimum, state the purpose, and allow deletion. Get proper legal advice before any public launch.
- Provide a "report an error" route and a visible disclaimer on every report.
- Accessibility: readable on low-end phones, simple language, Hindi output.

## 17. Evaluation plan

1. Build a test set of 50 to 100 real examples (scam and genuine, across all scam types) collected from public advisories and official notices.
2. Measure the classifier alone (precision, recall, F1, confusion matrix).
3. Measure the full pipeline: does the risk level match the human label, and where does it fail?
4. Measure latency and the share of checks with at least one could_not_check item.
5. Run a small trial with 5 to 10 students and ask whether the report told them something useful and what to do next.

Present failures honestly. It builds trust with judges.

## 18. Tech stack

- **Frontend:** Next.js with React.
- **Backend:** Node.js (Next.js API routes or a separate Express service), JavaScript throughout for the team.
- **Agents:** plain JavaScript functions around LLM API calls (no heavy framework needed), orchestrated with `Promise.allSettled`.
- **Classifier service:** Python, scikit-learn, FastAPI.
- **Database:** SQLite for the demo, with a path to Postgres (for example Supabase).
- **Hosting:** a host with a persistent disk for SQLite, or Postgres if deploying to serverless.

## 19. Build plan

**Round 1 (presentation only):** this PRD, the architecture diagram, three example walkthroughs (fake scholarship, fake internship, task job), the test-set and metrics plan, and the privacy approach.

**Round 2 is built layer by layer, bottom-up.** Each layer must pass its exit gate before the next starts. The full layer rules, dependency rules and gates are in ARCHITECTURE.md section 2.

| Layer | What it delivers | Exit gate |
|---|---|---|
| L0 Foundation | Project setup, env validation, logging, lint and test runner | Dev server, lint and tests run; missing env variables fail clearly |
| L1 Contracts and data | Shared schemas and fixtures, database, state machine, cache | All fixtures validate; invalid data and transitions are rejected |
| L2 Services | LLM layer, domain and payment tools, search and page fetch (with SSRF guard), YouTube comments, scam graph, classifier service | Mocked tests plus one real call per service; failures never throw |
| L3 Decision | Scoring engine with hard rules and cannot_verify | Fixture tests give High, Low and Cannot verify as expected |
| L4 Agents | The six agents and registry | Tests with mocked tools; every flag has evidence; failures become could_not_check |
| L5 Pipeline | Extraction, orchestrator, report writer, progress events, cleanup job | A full check runs from the command line and produces a valid report |
| L6 API and UI | Routes, live progress, pages for the whole user flow | Submit, confirm, progress and report work on mobile and desktop |
| L7 Features and hardening | College email, fraud help, guides, feedback, rate limits, privacy cleanup, evaluation, demo script | Evaluation script runs, privacy checks pass, demo rehearsed |

**Parallel tracks:** collecting the classifier dataset and the 50 to 100 case test set, seeding the graph and known-domains list, and building the UI against fixtures once L1 exists.

If time is short, cut inside L7 and the optional parts of L4 (YouTube comments, extra OSINT), but keep L0 to L6, the classifier and the scam graph, since they carry the technical story.

## 20. Risks and open questions

| Risk | Mitigation |
|---|---|
| Free-tier API limits or terms change | Provider wrapper, caching, checking limits early |
| Trustpilot and platform terms restrict automated access | Single user-triggered lookups, official APIs, screenshot fallback |
| Not enough labeled data | Start collecting immediately, keep a simple baseline model, report test-set size honestly |
| Wrong extraction from screenshots | Mandatory confirmation step |
| False positives hurting genuine organisations | Wording as risk assessment, evidence links, feedback route, Cannot verify outcome |
| Team has little prior AI experience | Build one agent first, grow step by step |

Open questions: exact time available before round 2, which LLM provider to start with, which regional languages to support first, and who owns the classifier work.

## 21. Round 1 presentation outline

1. The problem, with real recent cases.
2. Why existing tools fall short (a verdict without evidence, no student focus).
3. The solution in one sentence.
4. Live-flow walkthrough using one example (screenshots of the planned UI).
5. Architecture: multi-agent investigation, trained classifier, official-source verification, scam intelligence graph.
6. Safety and privacy approach.
7. Evaluation plan with metrics.
8. Impact and roadmap (browser extension, WhatsApp bot, college partnerships).