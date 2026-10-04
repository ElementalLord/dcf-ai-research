# Model usage before resilience refactor

Audit of clean repository HEAD before edits; baseline: 58 tests passing.

| Call site | Purpose / frequency | Mode / blocking | Cache | Timeout / retry / failure |
| --- | --- | --- | --- | --- |
| answer.ts → generateText | Final grounded answer, once per uncached Ask with AI_SYNTHESIS_MODE=gemini | Interactive, blocking | None | generateContent 8s; non-quota failure then Interactions up to 12s; fallback local prose; 429 opens 60s process cooldown |
| rerank.ts → generateText | Optional reranking when ENABLE_MODEL_RERANK=true and >32 candidates; potentially twice with live refresh, per personality | Interactive, blocking | None | 25s requested, same two-API fallback; deterministic order on failure |
| tagging.ts → generateText | Ambiguous parameter classification, batches of 8 | Explicit corpus action / onboarding, blocking | No AI result checkpoint | 30s requested; common two-API fallback; fails whole tagging action |
| candidate-claims.ts → generateText | Candidate claims/events/relationships, one per chunk, up to 25 | Explicit corpus action / onboarding, blocking | Proposal deduplication, no completion checkpoint | 40s requested; common two-API fallback; abort loses progress position |
| embeddings.ts → embedContent | Query embedding when claims+lexical <2 and inventory has embeddings | Interactive, blocking | None | Ask races 4s but underlying three-attempt request continues; all failures retry with 300/600ms backoff |
| live-research/cache.ts → embedSourceChunks → embedContent | Automatic embedding after every newly fetched page | Interactive, blocking | Stored vectors | Same three attempts per batch; swallowed error; competes with Ask quota |
| embeddings.ts → embedContent | Chunk enrichment, batch of 16 | Explicit corpus action / onboarding, blocking | Stored vectors; skips completed embeddings | Three attempts, no transport timeout; marks batch failed and continues on quota |
| gemini.ts → interactions.create | Second generation API after non-quota generateContent error | All above generation callers | None | Up to 12s, then 60s cooldown for all errors |

No other AI vendors or API calls found in src/ or scripts/. Routing, pronouns,
query expansion, sufficiency, HTML extraction, chunking, source authorization,
live URL discovery/fetch/cache, citation rendering and approval are code-only.
Routine page loads do not run ingestion. Claims, lexical RPC, inventory and live
source count already start concurrently; semantic search intentionally waits for
local candidate counts to avoid spending interactive embedding quota.
