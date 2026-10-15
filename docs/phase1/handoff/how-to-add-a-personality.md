# How to add personality #26

Use the existing workflow; do not create a parallel spreadsheet, biography file, or frontend-only record. The [content pipeline SOP](../content-pipeline-sop.md) is authoritative and provides the detailed review criteria.

1. **Select the personality.** Check aliases and existing identities, corpus purpose, balance, suitability, and DCF policy.
2. **Determine the category and framework.** Reuse the best-fitting detailed research category and document any justified framework change.
3. **Define research questions.** Turn the framework into a plan covering identity, context, qualities, contributions, challenges, relationships, contested aspects where relevant, and contemporary relevance.
4. **Discover strong sources.** Prioritize primary texts, scholarly work, archives, and reputable institutions.
5. **Catalogue sources.** Record authorship, institution, date, type, edition, URL, authority, access, and limitations; deduplicate before adding.
6. **Ingest usable material.** Store original accessible content, preserve locators and textual layers, and spot-check extraction.
7. **Create and link passages.** Keep enough context, attach precise locators, and tag the correct personality and framework field.
8. **Draft evidence-grounded claims.** Use one proposition per claim and match wording to what the passage establishes.
9. **Assign epistemic types.** Distinguish historical fact, primary-text attribution, traditional narrative, scholarly interpretation, inference, and modern interpretation.
10. **Link claims to framework fields and lenses.** Keep personality knowledge in data so generic application code can present it.
11. **Review contested or sensitive material.** Require two independent credible sources, including at least one primary or scholarly source, or withhold it.
12. **Perform human review.** Check the exact claim, passage, source, wording, classification, and placement; record the decision and notes.
13. **Obtain Mentor sign-off.** Present a readable profile with sources, contested material, gaps, and visible review state. Record the written decision separately from claim approval.
14. **Generate the structured profile.** Assemble only eligible cited material and keep uncertainty visible.
15. **Regenerate the portable dataset.** Run `node --env-file=.env.local scripts/export-phase1-personalities.mjs`, then validate counts and joins.
16. **Verify the public profile.** Confirm routing, search/filter discovery, lenses, citations, source details, related people, and responsive readability.
17. **Publish.** Release only the DCF- and Mentor-authorized profile version and record the dataset/schema version.

Adding personality #26 may require an explicit new public-presentation decision because the Phase 1 five-by-five mapping is fixed and approved. Do not silently change that mapping to accommodate a new record.
