# Quality sprint artifacts

Captured from the live Supabase database at 2026-10-14T03:46:36.068Z. No claim or source review status was changed.

- Baseline: `baseline.json`
- Stable 300-question suite: `../../data/quality-evaluation-v1.json` (SHA-256 `7b9fddcb10410fd10500c30ab47918913c024a2cda017eac41fec57a1cec26d9`)
- Foundational human-review queue: `human-review-queue.json` (300 claims; 12 per personality)
- Evidence gaps: `evidence-gaps.csv`

Reproduce with:

```bash
node --env-file=.env.local scripts/quality-sprint-audit.mjs
```
