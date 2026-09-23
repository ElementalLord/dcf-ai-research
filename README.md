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
- `http://localhost:3000/ask` — grounded question answering with inspectable citations

In production, set `CORPUS_ADMIN_TOKEN` and send it as a Bearer token to corpus administration APIs. Without it, corpus administration is disabled in production. Supabase service-role and Gemini credentials remain server-only.

## Retrieval architecture

Questions are routed into the existing expert parameter framework. Retrieval combines approved claims, PostgreSQL full-text search over approved-source chunks, and Gemini vector similarity. Reciprocal rank fusion merges the bounded result lists, overlapping evidence is removed, Gemini reranks when needed, and only the final compact evidence set is sent to generation. If embeddings fail, lexical and approved-claim retrieval continue. If generation is unavailable, the API returns a strictly extractive cited evidence response rather than hanging or inventing an answer.

Candidate claims, events, and relationships remain proposals. Accepting a candidate creates a normal `needs_review` claim; only the existing human review workflow can make it approved knowledge.

## Validation

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
```

Supabase changes are versioned under `supabase/migrations/` and are additive.
