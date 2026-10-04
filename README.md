# DCF Inspiring Personalities AI

An internal research and grounded-answer system built with Next.js, Supabase, and Gemini. The curated claim workflow remains intact and is complemented by a searchable source corpus.

## Local development

Copy `.env.example` to `.env.local` and provide the existing project credentials. Server secrets must never use a `NEXT_PUBLIC_` prefix.

```bash
npm install
npm run dev
```

Open:

- `http://localhost:3000/` — research claim entry and progress
- `http://localhost:3000/review` — human claim review
- `http://localhost:3000/corpus` — internal corpus ingestion, tagging, embeddings, proposal review, and retrieval debug
- `http://localhost:3000/corpus/onboard` — reusable personality/source onboarding and evidence-depth coverage
- `http://localhost:3000/corpus/external` — Brave discovery preview and bounded corpus expansion
- `http://localhost:3000/corpus/sources` — approved internet scopes, separate evidence authorization, and live-cache inspection
- `http://localhost:3000/ask` — grounded question answering with inspectable citations

In production, set `CORPUS_ADMIN_TOKEN` and send it as a Bearer token to corpus administration APIs. Without it, corpus administration is disabled in production. Supabase service-role and Gemini credentials remain server-only.

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
```

Supabase changes are versioned under `supabase/migrations/` and are additive.

### Controlled web discovery

Set `BRAVE_SEARCH_API_KEY` in `.env.local` to enable server-side Brave Web Search. The app and local retrieval work without it. Brave returns candidate URLs only; each URL must pass the source registry's search and fetch permissions. The existing safe fetcher verifies DNS and every redirect, extracts the original page, stores it in `live_research_cache`, and indexes original passages. Brave snippets never enter evidence or citations.

Apply migrations before opening `/corpus/external`. Select a personality, set a hard request limit, and click **Preview Research Plan**. The preview reads the actual aliases, expert fields, corpus coverage, source titles, events, and relationships without spending a Brave request. Click **Run Limited Expansion** only after reviewing the queries. Each step searches at most once and fetches at most two approved pages. **Stop**, **Continue**, and **Resume** control a persisted run. Three consecutive steps without new chunks end the run. Search results have a separate 24-hour cache keyed by normalized query. The UI lists rejected candidate URLs for source-policy review; it never approves them automatically.

Ask uses local retrieval and known approved pages first. It only invokes Brave when evidence remains insufficient and the registry has a broad approved search/fetch scope. An exact URL alone does not justify spending a web search. Provider failures leave local Ask and corpus retrieval working. Fetch and lexical indexing require no Gemini calls; embeddings and AI enrichment remain explicit corpus actions.

### Free-tier resilient Ask

Core ingestion, aliases, deterministic routing, lexical retrieval, approved live
fetch/cache, citations and extractive answers work without AI. Existing
`AI_SYNTHESIS_MODE=local` remains the default. Set `SYNTHESIS_PROVIDER=gemini`
(or the compatible `AI_SYNTHESIS_MODE=gemini`) for optional grounded synthesis.
`SYNTHESIS_MODEL` overrides `GEMINI_GENERATION_MODEL`; `SYNTHESIS_TIMEOUT_MS`
defaults to 8000 and is bounded to 250–12000 ms. Secrets stay server-side.

Set `SYNTHESIS_DISABLED=true` to simulate unavailable synthesis without removing
keys; set `EMBEDDINGS_DISABLED=true` to test lexical-only retrieval. The normal
Ask path makes at most one generative API attempt, with no SDK retries or
Interactions fallback. Confirmed quota/rate/configuration/model errors open a
60-second process-local circuit; transient/timeout errors open it for 15 seconds.
Every request still retrieves approved evidence before checking the 24-hour
answer cache. Only validated generated answers are cached, so local excerpts
cannot suppress a later recovered synthesis provider. Evidence content,
provenance, citations, personality scope and policy determine the cache key.

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
