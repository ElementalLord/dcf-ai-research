# Known limitations

This document distinguishes items that affect final release operations from opportunities for later improvement. None of the data-quality notes below reverses the supplied Mentor approval of the final 25 Phase 1 profiles.

## Phase 1 acceptance limitations

- **Deployment is external.** The repository has no checked-in hosting-project association, deployment workflow, or Git remote. The current branch/commit must be connected to DCF's selected existing provider and configured there.
- **Deployed visual QA remains outstanding.** Desktop and mobile smoke testing must be performed against the production URL after deployment. Local responsive rules and routes have been validated, but that is not a substitute for the final browser check.

These are marked `USER ACTION REQUIRED` in the final acceptance checklist.

## Future improvement opportunities

- Many internal atomic claims retain `draft`, `needs_review`, imported, or system-test provenance even though the selected final Phase 1 profiles are approved. Profile approval and claim-level state intentionally remain separate.
- Some category-framework dimensions have thinner evidence than others. Empty or thin optional sections are disclosed rather than filled by inference.
- The exporter withheld 164 contested or sensitive statements that did not meet the enhanced sourcing standard. Withholding means the evidence package was insufficient for publication; it is not a finding that every statement is false.
- Exact duplicate or near-duplicate cleanup candidates may remain in internal source, passage, or claim records. The public export uses deterministic selection and does not require destructive cleanup for acceptance.
- Evaluation-result registry/storage work is not part of the committed Phase 1 release and should remain deferred until separately reviewed and applied through the normal migration process.
- Ask, Gemini synthesis, live research, readiness tools, and broad quality/evaluation infrastructure are prototypes beyond required Phase 1 scope. They are not fully productionized editorial or Q&A services.
- Retrieval may abstain or fall back to extractive evidence when local support is insufficient or an external provider is unavailable. This is safer than generating an unsupported answer.
- Live-source availability, URLs, provider quotas, and search results can change. The stored source record and passages preserve provenance, but links may require later maintenance.

See [Phase 2 recommendations](phase2-recommendations.md) for prioritized follow-up rather than treating these opportunities as missing Phase 1 acceptance work.
