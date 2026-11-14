# Known limitations

This document distinguishes items that affect final release operations from opportunities for later improvement. None of the data-quality notes below reverses the supplied Mentor approval of the final 25 Phase 1 profiles.

## Phase 1 acceptance limitations

- **Deployment is external.** The repository has no checked-in hosting-project association, deployment workflow, or Git remote. The current branch/commit must be connected to DCF's selected existing provider and configured there.
- **Deployed visual QA remains outstanding.** Desktop and mobile smoke testing must be performed against the production URL after deployment. Local responsive rules and routes have been validated, but that is not a substitute for the final browser check.

These are marked `USER ACTION REQUIRED` in the final acceptance checklist.

## Future improvement opportunities

- Many internal atomic claims retain `draft`, `needs_review`, imported, or system-test provenance even though the selected final Phase 1 profiles are approved. Profile approval and claim-level state intentionally remain separate.
- Some category-framework dimensions have thinner evidence than others. 27 profile sections across the 25 people have no approved evidence (most are contested-aspects sections where every candidate was withheld); each carries a visible limited-information note rather than inferred content. In the Rishi and Ruler parameter views, empty parameters (for example Ashoka's succession, or present-day relevance for Agastya and Vasistha) are marked the same way.
- Era and region are curated in `data/phase1-curation.json`, not stored in the database's `personalities.era` and `personalities.region` columns. A later migration could move them into the database; until then the curation file is the source.
- Rishi and Ruler parameters are mapped from the database's existing claim tags. Rishis map directly; rulers were researched with the broader political-leader framework, so their claims are assigned by documented rules plus per-claim overrides. Adi Shankaracharya is shown with the rishi parameters for comparability within the Sages group, although he was an acharya.
- Role lenses are assembled deterministically from claim tags; the scope document's AI-written, lens-specific explanation is not used on public profiles, so each lens reorders and highlights the same approved statements rather than rewriting them.
- The website setting “AI can add sources and facts” needs migration `20261114010000_ai_knowledge_switch.sql` applied for database-level enforcement; without it the application checks still apply.
- About two-thirds of claims still carry the database default `evidenceType: "uncertain"`. The site now uses the certainty rating instead, but classifying those claims properly is worthwhile Phase 2 work.
- The exporter withheld 161 contested or sensitive statements that did not meet the enhanced sourcing standard. Withholding means the evidence package was insufficient for publication; it is not a finding that every statement is false.
- Exact duplicate or near-duplicate cleanup candidates may remain in internal source, passage, or claim records. The public export uses deterministic selection and does not require destructive cleanup for acceptance.
- Evaluation-result registry/storage work is not part of the committed Phase 1 release and should remain deferred until separately reviewed and applied through the normal migration process.
- Ask, Gemini synthesis, live research, readiness tools, and broad quality/evaluation infrastructure are prototypes beyond required Phase 1 scope. They are not fully productionized editorial or Q&A services.
- Retrieval may abstain or fall back to extractive evidence when local support is insufficient or an external provider is unavailable. This is safer than generating an unsupported answer.
- Live-source availability, URLs, provider quotas, and search results can change. The stored source record and passages preserve provenance, but links may require later maintenance.

See [Phase 2 recommendations](phase2-recommendations.md) for prioritized follow-up rather than treating these opportunities as missing Phase 1 acceptance work.
