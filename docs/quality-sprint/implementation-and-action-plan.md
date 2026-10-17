# Quality sprint implementation and action plan

## Implemented

- Captured a read-only live baseline before database-backed changes: 25 personalities, 1,575 claims, 473 sources, and the exact current status split.
- Added a versioned 300-question dataset with evidence requirements, known source/passage IDs, expected answer elements, expected outcomes, and result placeholders.
- Added a capped evaluator that exercises the real `/api/ask` route and classifies retrieval failure, citation mismatch, unsupported synthesis, excessive uncertainty, unjustified confidence, and technical errors.
- Added deterministic evidence-assessment proposals to the review API and UI. Proposals never change claim status and always preserve human authority.
- Generated a 300-item foundational review queue (12 per personality); 279 currently lack a final approval/rejection status.
- Added a live readiness dashboard with explicit retrieval and publication readiness, domain concentration, source authority, primary coverage, passage coverage, review progress, evaluation metrics, latency, external reliance, and gaps.
- Added an additive evaluation-registry migration. It was not applied to the linked project because the Supabase CLI profile is unavailable; the dashboard uses the checked-in evaluation snapshot until the migration is applied and results are published.
- Preserved every claim, source, citation, review status, and original evidence record. No bulk approval or destructive migration was performed.

## Measured result

The 300-question local-pipeline run completed with zero technical errors and zero external/model calls. Retrieval was sufficient for 76/300 questions; 46/300 had structurally passage-backed citations. A proposed generic-query fallback was tested on 25 questions, showed no measurable improvement, and was removed.

## Prioritized remaining work

1. **Resolve passage coverage for the highest-impact profiles** — Swami Vivekananda, Adi Shankaracharya, Vasistha, Satyajit Ray, and Verghese Kurien. Highest expected gain; medium effort.
2. **Human-review the 300 foundational claims** using the generated queue, beginning with claims that already have exact passages. High publication-readiness gain; medium effort.
3. **Repair generic routing only from traced failures** by exposing server diagnostics to authenticated evaluation runs, then add regression tests per fixed question. High retrieval gain; medium effort.
4. **Add independent scholarly/primary works where concentration is high** through authorized acquisition tasks, not uncontrolled search. High evidence-quality gain; high effort.
5. **Apply the additive evaluation migration and publish runs** so dashboard evaluation metrics come from the database rather than the checked-in snapshot. Medium operational gain; low effort once CLI authentication is restored.
6. **Run a capped model-based factual grader after human references are approved.** This run deliberately did not claim factual accuracy from API success or lexical overlap. Medium confidence gain; controlled cost.

- Integrity note: five exact-URL duplicate groups and eight normalized same-personality claim duplicate groups pre-date this read-only sprint.

## Reproduction

```bash
npm run quality:audit
SYNTHESIS_PROVIDER=local AI_SYNTHESIS_MODE=local SYNTHESIS_DISABLED=true EMBEDDINGS_DISABLED=true GEMINI_API_KEY= BRAVE_SEARCH_API_KEY= npm run dev
npm run quality:evaluate -- data/quality-evaluation-v1.json artifacts/quality-sprint/evaluation-results.json --limit=300
npm run quality:report
npm run typecheck
npm run lint
npm run test:run
npm run build
```
