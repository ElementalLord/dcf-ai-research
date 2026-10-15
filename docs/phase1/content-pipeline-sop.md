# DCF personality content pipeline SOP

This is the repeatable process for adding personality #26, #50, or #100. It describes the actual DCF workflow: category frameworks organize research, sources are registered and ingested, passages support atomic claims, claims receive explicit epistemic and human review, and a separate export assembles audience-facing profiles without changing claim approval.

## Roles and non-negotiable rules

- The researcher or intern gathers, records, and revises evidence.
- AI may accelerate discovery, extraction, tagging, comparison, and draft wording. AI output is always a candidate until a human reviews it.
- A human reviewer decides whether a source is credible, whether a passage supports a claim, whether wording is balanced, and whether the claim should be approved.
- The Mentor makes final curatorial decisions, resolves sensitive/contested inclusion, approves the official category presentation, and gives written profile sign-off.
- Every factual profile statement needs at least one approved credible source.
- Contested or sensitive statements need two independent credible sources, including at least one primary or scholarly source.
- Network-access approval, source approval, source ingestion, claim review, profile readiness, and Mentor approval are separate states. Never treat one as another.
- Do not fill a framework field with speculation. Mark the gap, explain why it is not relevant, or continue research.

## 1. Select the personality

Write a short selection note explaining why the person belongs in the DCF corpus, the intended audience value, and how the addition affects category balance. Search the identity and alias registry first so a spelling variant does not create a duplicate. Confirm the person is deceased and suitable under DCF policy.

**Human judgment required:** final selection, scope, balance, and cultural sensitivity.

## 2. Assign a category and framework

Review every existing category before proposing a new one. Assign the primary category whose parameter framework best fits the person; add a secondary category only when it represents a real second research framework. Do not force a person into a category merely to satisfy a numerical target.

Record canonical name, alternate names, aliases, and category membership. Review the category’s parameters and fields. Note fields that are irrelevant and fields that will require special care.

**Mentor judgment required:** a new category, a material framework change, or an official Phase 1 presentation-group decision.

## 3. Make a research plan

Turn the framework into a checklist. At minimum plan for vocation/role, values or qualities, contributions, historical/social context, challenges, relevant leadership/relationships, contested aspects where appropriate, and contemporary relevance. Add category-specific questions. Identify likely primary sources, scholarly works, institutional archives, and known contested questions before searching.

AI may suggest search terms and missing dimensions. A researcher must verify that the plan is appropriate and not biased toward the easiest available sources.

## 4. Discover sources

Search for original works, speeches, letters, inscriptions, government or institutional records, university/archive material, peer-reviewed scholarship, and reputable scholarly books. Use tertiary sources for orientation, not as the sole foundation for a sensitive claim. Record the original page, edition, repository, author/institution, date, and stable URL rather than a search snippet.

AI and web search may produce candidates. Discovery is not approval.

## 5. Evaluate source quality

For each candidate ask:

- Who created and published it?
- Is it primary, scholarly, institutional, or merely tertiary?
- Is the edition or translation identified?
- Is the source independent of the other sources, or do they repeat the same account?
- Does it have stable locators such as page, section, verse, inscription, date, or archive identifier?
- Does it have an agenda or limitation that readers need to know?
- Is use legally and technically permitted?

Record source type, textual layer, citation, rights/access note, and limitations. Approve the source for evidence only after this evaluation. Access permission alone does not approve its claims.

**Human judgment required:** credibility, independence, edition/translation quality, and suitability for sensitive claims.

## 6. Register and ingest sources

Create or reuse the source record; deduplicate by stable URL, title, edition, and content. Link it to the personality. Ingest the original accessible text, not search snippets or AI summaries. Preserve section titles, pages or verses, language, textual layer, content hash, and access metadata. Check that parsing did not drop headings, join unrelated pages, or import navigation text.

AI can help detect duplicates and parsing problems. A human must spot-check the stored text against the original.

## 7. Extract passages

Split the source into coherent, citable passages. Keep enough surrounding context to avoid changing the meaning. Tag each passage to the personality and relevant framework field. Record precise locators. Do not tag a passage as evidence merely because it mentions the name.

AI may propose passage boundaries and tags. A human must verify high-value or sensitive passages and every passage later used to approve a contested claim.

## 8. Draft atomic claims

Write one proposition per claim whenever possible. Match the wording to what the passage actually establishes. Separate direct fact, primary-text attribution, traditional narrative, scholarly interpretation, historical inference, and modern interpretation. Avoid praise language unless the source and context justify it.

Every claim must link to its supporting passage/source and framework field. AI-drafted claims remain `draft` or `needs_review`; do not auto-approve them.

## 9. Classify epistemic type

Assign the evidence or epistemic type that describes what kind of statement this is. For example, a dated letter is different from an epic narrative, a scholarly interpretation, or a modern spiritual reading. If one sentence mixes types, split it. Record uncertainty and textual layer rather than presenting a disputed chronology as settled fact.

AI may flag compound or mismatched claims. A human resolves the classification when the type changes the evidence standard or audience wording.

## 10. Link citations

For each claim, attach the exact supporting source and, when possible, the exact stored passage. Record page/section/verse and a concise evidence excerpt. Check that the relationship is `supports`, `context`, or `contradicts` as appropriate. A relevant source title without an exact supporting passage is not enough for strong approval.

## 11. Handle contested claims

Mark the claim and framework field clearly. Require at least two genuinely independent credible sources and at least one primary or scholarly source. Compare terminology, chronology, perspective, and source dependence. Write balanced wording that distinguishes fact, attribution, interpretation, and uncertainty.

If the rule is not met, omit the statement from the profile or place it in the Mentor queue with the evidence gap. Never invent corroboration or count reproductions of the same account as independent support.

**Mentor judgment required:** inclusion of sensitive material, balance of wording, and unresolved cultural or historical disputes.

## 12. Conduct human review

The reviewer reads the claim, exact passage, source metadata, epistemic classification, and framework placement. Choose approve, request changes, or reject. Record reviewer identity, date, and notes. Approval means the wording is supported; it does not constitute Mentor sign-off on the complete profile.

Do not bulk-approve claims to meet a count. System-test-bulk records must stay labeled and are not equivalent to editorial approval.

## 13. Revise

Respond to every requested change. Narrow overbroad wording, split compound claims, correct locators, improve source quality, or explicitly leave a gap. Preserve rejected records and review history for auditability. Re-submit revised claims through the normal human workflow.

## 14. Obtain Mentor sign-off

Give the Mentor a readable profile—not raw tables—plus source list, contested material, unresolved concerns, and visible claim states. The Mentor chooses **APPROVE**, **APPROVE WITH CHANGES**, or **RETURN FOR REVISION**, and supplies name, written confirmation, date, and notes.

Record sign-off separately from individual claim approval. If changes are requested, revise the claims/profile and return for a new decision. No AI or export script may mark this step complete.

## 15. Generate the profile

Assemble a concise, audience-readable profile from eligible cited claims. Cover the person rather than displaying database mechanics: introduction, life/context, qualities, contributions, challenges, leadership/relationships where relevant, approved contested material, and contemporary relevance. Keep citation markers near each statement and retain nuance.

The current deterministic generator is:

```bash
node --env-file=.env.local scripts/export-phase1-personalities.mjs
```

It does not paraphrase or invent facts. An editor may improve flow only when every revised factual statement remains traceable to its citations and is re-reviewed when meaning changes.

## 16. Export the portable dataset

Run the exporter, open `data/exports/dcf-phase1-personalities.json`, and verify:

- expected personality count;
- identity and category memberships;
- framework metadata;
- profile section coverage;
- source/citation joins;
- review counts and approval origins;
- withheld contested claims;
- Mentor status;
- `generatedAt` and schema version.

Validate the JSON independently of the web application. Keep the schema document beside the release. Never hand-edit the generated JSON; correct the database or generator and regenerate it.

## 17. Publish into the demo

Publish only the profile version authorized by DCF and the Mentor. Preserve citations and do not hide uncertainty or contested status. Confirm that the demo reads the portable fields correctly, that source links resolve, and that no draft-only material is shown as approved. Record the dataset/schema version used by the demo so a release can be reproduced.

## Release checklist for every new personality

- [ ] Identity and aliases checked for duplicates.
- [ ] Primary and any secondary category approved.
- [ ] Framework research plan completed or gaps explained.
- [ ] Sources evaluated and registered with full metadata.
- [ ] Original passages ingested and spot-checked.
- [ ] Claims are atomic, classified, and precisely cited.
- [ ] Every factual profile statement has an approved credible source.
- [ ] Contested statements meet the two-source rule or are withheld.
- [ ] Human review decisions and revision history are recorded.
- [ ] Readable Mentor package generated.
- [ ] Written, dated Mentor decision recorded.
- [ ] Portable JSON regenerated and validated.
- [ ] Demo publication matches the signed-off profile.
