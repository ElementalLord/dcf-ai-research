# DCF Inspiring Personalities AI

An evidence-grounded public collection and internal research system built with Next.js, Supabase, and Gemini. The Phase 1 demo presents 25 approved personality profiles while preserving the curated claim and source workflow.

## Phase 1 handoff

Start with [`docs/phase1/handoff/README.md`](docs/phase1/handoff/README.md) for the final non-technical project overview, repository map, operating instructions, limitations, deployment checklist, and Phase 2 recommendations. The final acceptance status is recorded in [`docs/phase1/FINAL-ACCEPTANCE-CHECKLIST.md`](docs/phase1/FINAL-ACCEPTANCE-CHECKLIST.md).

## Phase 1 public demo

- `/` — clear entry point to the collection
- `/explore` — browse five approved presentation categories; search and filter all 25 personalities
- `/explore/[slug]` — structured profile, relevant lenses, cited sources, and related personalities
- `/ai` — optional deeper exploration through the existing Ask prototype
- `/resources` — restricted research and editorial workspace

The public collection reads `data/exports/dcf-phase1-personalities.json`. The approved five-by-five presentation mapping is maintained separately in `data/phase1-presentation.json` so the detailed research taxonomy is not overwritten. Regenerate the export from the live database with:

```bash
node --env-file=.env.local scripts/export-phase1-personalities.mjs
```

The public Explore and profile routes are statically generated and do not need browser-side database credentials. Server APIs, Ask, and Resources continue to use the environment variables documented in `.env.example`; `SUPABASE_SERVICE_ROLE_KEY`, Gemini/Brave keys, and admin secrets must remain server-only.

## Local development

Copy `.env.example` to `.env.local` and provide the existing project credentials. Server secrets must never use a `NEXT_PUBLIC_` prefix.

```bash
npm install
npm run dev
```

Open:

- `http://localhost:3000/` — Phase 1 public entry point
- `http://localhost:3000/explore` — personality discovery and profiles
- `http://localhost:3000/ai` — questions, answer depth, citations, and source details
- `http://localhost:3000/resources` — restricted person-centered source and claim management

Run `npm run admin:setup` to generate a private Resources access key. The command prints the key once and stores only its SHA-256 hash and a separate session signing secret in the ignored, owner-readable `.env.local` file. Restart a running dev server after setup. Administrators sign in with the key; the browser receives a signed, HTTP-only 12-hour session cookie. Programmatic corpus APIs can use the same key as a Bearer value supplied at runtime. All Resources, legacy research/review, and corpus data routes check authorization server-side in development and production. For deployment, configure `CORPUS_ADMIN_TOKEN_HASH` and `ADMIN_SESSION_SECRET` as server-only environment variables. Supabase service-role and Gemini credentials remain server-only.

The earlier `/research`, `/review`, and `/corpus` workspaces remain available from Resources after sign-in. `/ask` now redirects to `/ai`. Resources uses the existing Supabase tables and review endpoints: approved records must return to review before their content is edited, candidate sources and draft claims can be removed only when provenance permits, and approval decisions keep their original audit/review behavior.

## Retrieval architecture

Questions are routed into the existing expert parameter framework. Retrieval combines approved claims, PostgreSQL full-text search over approved-source chunks, and Gemini vector similarity. Reciprocal rank fusion merges the bounded result lists, overlapping evidence is removed, Gemini reranks when needed, and only the final compact evidence set is sent to generation. If embeddings fail, lexical and approved-claim retrieval continue. If generation is unavailable, the API returns a strictly extractive cited evidence response rather than hanging or inventing an answer.

Local evidence is assessed before any network activity. Sufficient questions remain in `FAST` mode. Weak or cross-layer questions may enter `EXPANDED` or `RESEARCH` mode, where the backend can discover and fetch only URLs permitted by `approved_source_access`. Exact-URL and path-prefix rules override broader domain rules. Fetches also reject unsafe schemes, credentials, non-standard ports, private/link-local addresses, oversized responses, excessive redirects, and redirects outside the registry.

Network access authorization, source evidence approval, claim review status, approval origin, and evidence type are independent states. Successful approved fetches use ETag/Last-Modified validators and a configurable TTL in `live_research_cache`; extracted passages are deterministically chunked into the corpus with live-cache provenance. A repeated valid request uses the local/cache path rather than refetching the page.

`EVIDENCE_POLICY_MODE=test` permits approved test-bulk and imported claims for internal evaluation. `EVIDENCE_POLICY_MODE=strict` restricts claim retrieval to approved human/manual or mentor-reviewed material; direct passages remain governed by source evidence approval. Test-bulk approval is never presented as mentor sign-off.

Candidate claims, events, and relationships remain proposals. Accepting a candidate creates a normal `needs_review` claim; only the existing human review workflow can make it approved knowledge.

## Validation

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
node scripts/verify-phase1-demo.mjs http://localhost:3000
```

Supabase changes are versioned under `supabase/migrations/` and are additive.

## Deployment

The repository has no checked-in hosting-project metadata or deployment workflow. Use the project’s existing hosting account, configure the environment variables from `.env.example`, run `npm run build`, and deploy the resulting Next.js application through that account’s normal workflow. Do not expose server-only variables with a `NEXT_PUBLIC_` prefix.

### Controlled web discovery

Set `BRAVE_SEARCH_API_KEY` in `.env.local` to enable server-side Brave Web Search. The app and local retrieval work without it. In managed corpus expansion, Brave candidate URLs must pass the approved source registry before ingestion; the safe fetcher verifies DNS and every redirect, extracts the original page, and indexes original passages. Brave snippets never enter evidence or citations.

Normal Ask uses a separate Search Sources policy in restricted Resources. Its default **Credible Web** mode discovers new domains, then checks source provenance and fetches original content before it becomes request-scoped evidence. **Approved Domains Only** admits only administrator-allowed domains; **Custom** permits credible discovery with explicit allow, block, and temporary-disable rules. Every Google grounding result and Brave candidate is checked server-side, including redirect destinations. Search approval is separate from permanent Library source and claim approval. Strong new domains appear as discovered candidates in Resources without being auto-approved.

Apply migrations before opening `/corpus/external`. Select a personality, set a hard request limit, and click **Preview Research Plan**. The preview reads the actual aliases, expert fields, corpus coverage, source titles, events, and relationships without spending a Brave request. Click **Run Limited Expansion** only after reviewing the queries. Each step searches at most once and fetches at most two approved pages. **Stop**, **Continue**, and **Resume** control a persisted run. Three consecutive steps without new chunks end the run. Search results have a separate 24-hour cache keyed by normalized query. The UI lists rejected candidate URLs for source-policy review; it never approves them automatically.

Ask retrieves local evidence, makes one question-focused Gemini Google Search grounding call, then uses Brave and fetched original pages when grounding cannot fill the gap. `GEMINI_GROUNDING_MODEL` defaults to `gemini-3.5-flash-lite`; synthesis remains independently configured. Local evidence still works when providers fail. Balanced answers select a small set of essential and supporting evidence and usually fit in 2–4 compact paragraphs. Google summaries and Brave snippets never become evidence on their own.

### Free-tier resilient Ask

Core ingestion, aliases, deterministic routing, lexical retrieval, approved live
fetch/cache, citations and extractive answers work without AI. When
`GEMINI_API_KEY` is configured, Ask uses Gemini synthesis by default. Set
`SYNTHESIS_PROVIDER=local` (or `AI_SYNTHESIS_MODE=local`) for deterministic-only
mode. `SYNTHESIS_MODEL` overrides `GEMINI_GENERATION_MODEL`; the default is
`gemini-3.7-flash`. On a transient provider failure only, Ask makes one bounded
attempt with `SYNTHESIS_ALTERNATE_MODEL` (default `gemini-3.5-flash-lite`).
Synthesis allows up to 2,048 output tokens and a 40-second timeout (bounded to
250–45,000 ms). Secrets and provider diagnostics stay server-side.

Set `SYNTHESIS_DISABLED=true` to simulate unavailable synthesis without removing
keys; set `EMBEDDINGS_DISABLED=true` to test lexical-only retrieval. The normal
Ask path normally makes one generative API attempt. A 503/network failure or
timeout can use the alternate model once; quota, rate, authentication, invalid
request, unsupported-model and citation-validation failures do not trigger it.
Confirmed quota/rate/configuration/model errors open a
60-second process-local circuit; transient/timeout errors open it for 15 seconds.
Every request still retrieves approved evidence before checking the 24-hour
answer cache. Only validated generated answers are cached, so local excerpts
cannot suppress a later recovered synthesis provider. Evidence content,
provenance, citations, personality scope, policy, synthesis model and
the current synthesis prompt version determine the cache key. Set
`ANSWER_CACHE_DISABLED=true` only for a fresh-generation development audit.

Broad Ask questions gather parameter-linked approved claims and source passages,
then rank evidence for the actual question and select only the strongest records.
Focused questions use smaller context budgets. Scope-aware coverage checks identify
missing topics before live research; snippets remain discovery metadata. Run the
real-app benchmark with `node scripts/ask-quality-benchmark.mjs <personality-uuid> <output.json>`.

Apply additive migrations before AI ingestion. AI tagging and proposal extraction
checkpoint input hashes, saved model output and completion per batch/chunk.
Embedding enrichment also checkpoints batches and skips stored vectors on resume.
Jobs stop on provider failure and resume by re-running the same action/plan;
completed model work is reused. Live-page fetches index text without embedding it;
use the explicit corpus Embed action for optional enrichment. Do not run multiple
admin jobs for the same source concurrently.

Developer details show request call counts, provider/circuit state, error category,
cache identity/hit, fallback type, evidence size, per-stage latency and aggregate
process-local counters. Counters reset on process restart; no personal data or
external analytics service is used. Independent claims, lexical search (including
cached passages), approved event/relationship support, inventory and registry
queries run concurrently. Semantic retrieval intentionally follows local results
and only spends quota when local candidates are sparse.
