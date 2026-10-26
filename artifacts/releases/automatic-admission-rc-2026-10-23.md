# Automatic admission release candidate — 2026-10-23

Base: `b9655d515010848b0b9e58da397c1d77230f044b`. Apply `automatic-admission-rc-2026-10-23.patch` to that base. The patch was checked against a fresh local clone. It excludes the unrelated UI, feedback, and historical-review working-tree changes.

## Included files

Runtime: `src/lib/live-research/on-demand-engine.ts`, `src/lib/live-research/research-quality.ts`, `src/lib/live-research/retention-rights.ts`, `src/lib/live-research/search-credibility.ts`. The existing Ask, verification, and Resources code at `b9655d5` is preserved.

Migration: `supabase/migrations/20261023010000_harden_demand_retention_rights.sql`.

Fixtures and tests: `tests/corpus/demand-local-db.test.ts`, `tests/corpus/google-source-verification.test.ts`, `tests/corpus/knowledge-verification.test.ts`, `tests/corpus/on-demand-engine.test.ts`, `tests/corpus/research-quality.test.ts`, `tests/fixtures/bose-source-selection-2026-10-23.json`.

## Checks

Scoped `b9655d5` clone: 435 offline tests passed, 10 skipped; 9 isolated Supabase tests passed; lint, typecheck, and production build passed. The build used only isolated Supabase configuration. Full working tree: 435 offline tests passed, 16 skipped; lint, typecheck, and production build passed. No paid provider calls were made.

## Production release and rollback

After separate production authorization, apply the rights-hardening migration, then deploy this exact patch with `DEMAND_AUTO_ADMISSION_ENABLED=false` and existing research and evidence-policy settings preserved. Confirm Ask and Resources health before any admission activation. The migration changes the admission RPC only; it does not rewrite existing claims or sources.

For a failed rollout, leave automatic admission off and restore the preceding application version. If admission is later enabled and must be stopped, set `DEMAND_AUTO_ADMISSION_ENABLED=false` or set the admission pause control; retain the rights-hardening migration and all existing data. Do not roll back the migration to a weaker rights gate.

Activation still requires an authorized bounded live-provider validation on a genuinely licensed, accessible original source, with actual Gemini verification and a second Ask proving local reuse. A source that denies automated access or lacks article-level retention rights must stay research-only or be rejected.
