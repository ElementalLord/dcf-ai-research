# How to run and verify DCF

## Prerequisites

- Node.js compatible with the checked-in Next.js version
- npm
- access to the existing Supabase project for database-backed features
- the existing provider credentials only when testing optional AI or web-search features

Do not commit `.env.local` or secret values.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with credentials supplied through DCF's approved secret-sharing process. Open `http://localhost:3000` for the public entry point and `http://localhost:3000/explore` for the Phase 1 collection.

The static public profiles read the checked-in portable dataset. Supabase-backed APIs, Resources, Ask, live research, and administrative functions need their corresponding server configuration.

## Reasonable closeout validation

```bash
npm run typecheck
npm run lint
npx vitest run tests/phase1-demo.test.ts
npm run build
npm run start
```

With the production server running, verify the public routes:

```bash
node scripts/verify-phase1-demo.mjs http://localhost:3000
```

The verifier should report 25 personalities, five presentation categories, 25 profile routes, and 27 checked public routes.

## Regenerate the portable dataset

```bash
node --env-file=.env.local scripts/export-phase1-personalities.mjs
```

This reads the live database and replaces the generated export and Mentor-package artifacts. It does not approve claims or create Mentor sign-off. After regeneration, inspect the diff, parse the JSON, confirm the counts and source joins, rerun the focused test/build, and obtain any review required by the [content pipeline SOP](../content-pipeline-sop.md).

Never hand-edit the generated JSON. Correct the source data or exporter and regenerate it.

## Environment variable names

The authoritative list is `.env.example`. Current names are:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `BRAVE_SEARCH_API_KEY`
- `GEMINI_GENERATION_MODEL`
- `GEMINI_GROUNDING_MODEL`
- `GEMINI_EMBEDDING_MODEL`
- `ENABLE_MODEL_RERANK`
- `EVIDENCE_POLICY_MODE`
- `CORPUS_ADMIN_TOKEN_HASH`
- `ADMIN_SESSION_SECRET`
- `SYNTHESIS_ALTERNATE_MODEL`
- `SYNTHESIS_TIMEOUT_MS`
- `SYNTHESIS_DISABLED`
- `EMBEDDINGS_DISABLED`

Commented provider and diagnostic overrides in `.env.example` are optional. `SUPABASE_SERVICE_ROLE_KEY`, AI/search keys, and administrator values are server-only and must never receive a `NEXT_PUBLIC_` prefix.

For deployment and the short manual production check, use the [deployment guide](deployment.md).
