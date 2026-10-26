# DCF — Full-corpus evidence assessment (25 personalities / 1,585 claims)
**Assessment type:** Comprehensive structured evidence audit with targeted earlier independent source cross-checks. **Not** complete independent historical verification. **No new claims have been given final APPROVE/REMOVE dispositions.**

This archive checks **every exported claim** for linked source/passage status, available evidence and traceability, proposed epistemic class, potential textual mismatch, duplication and policy risks. The complete original webpages/books and licensed full passages are not in the export; a local excerpt cannot establish the authenticity of its purported original source. Therefore no 1,585-claim final verification can honestly be claimed from this material alone.

## Observed corpus-wide results

| Metric | Count |
|---|---:|
| Unique claims assessed | 1,585 |
| Personalities | 25 |
| Original status `draft` | 1,008 |
| Original status `approved` | 464 |
| Original status `needs_review` | 112 |
| Original status `rejected` | 1 |
| No active support passage through approved linked source | 188 |
| Missing assigned epistemic type | 1,390 |
| Previously independently cross-checked claim cores (not final approvals) | 28 |
| Potential near-duplicate records (heuristic, not final) | 38 |
| Newly finalized APPROVE / REMOVE decisions | **0 / 0** |

## Evidence-gate meaning

**EXCLUDE_FROM_STRICT_RELEASE_UNTIL_EVIDENCE_REPAIRED:** no suitable linked active passage, malformed claim, or missing source URL. This is a defensible **non-publication** recommendation, not an assertion that the claim is historically false or irreparable.

**DOCUMENTARY_REVIEW_REQUIRED:** export includes linked active approved-source excerpts, but actual entailment, source authenticity, edition, and relevant independent corroboration still need primary checking. **Do not import these as approved claims.**

The lexical-overlap measure is a retrieval diagnostic only. For instance an Ashoka inscriptional paraphrase may score low yet be correct; an invented claim can coincidentally have high overlap. Missing or disputed records are not automatically disproved.

## Personality-by-personality coverage

| Personality | Claims | Missing active supporting passages | Missing epistemic type | Near-duplicate candidates | Previous core source cross-checks |
|---|---:|---:|---:|---:|---:|
| A. P. J. Abdul Kalam | 49 | 0 | 49 | 0 | 4 |
| Adi Shankaracharya | 33 | 0 | 33 | 0 | 6 |
| Agastya | 34 | 1 | 34 | 0 | 3 |
| Ashoka | 53 | 0 | 53 | 0 | 3 |
| Bhagat Singh | 49 | 0 | 49 | 0 | 2 |
| C. V. Raman | 52 | 0 | 52 | 0 | 0 |
| Chhatrapati Shivaji Maharaj | 60 | 0 | 60 | 0 | 0 |
| Guru Nanak | 46 | 0 | 46 | 0 | 0 |
| J. R. D. Tata | 42 | 0 | 42 | 0 | 0 |
| Jagadish Chandra Bose | 49 | 0 | 49 | 0 | 0 |
| Jamsetji Tata | 52 | 0 | 52 | 0 | 0 |
| M. S. Subbulakshmi | 57 | 0 | 57 | 0 | 0 |
| Rabindranath Tagore | 42 | 0 | 42 | 0 | 4 |
| Rajaraja Chola I | 53 | 0 | 53 | 16 | 4 |
| Ramakrishna Paramahamsa | 64 | 0 | 64 | 0 | 0 |
| Rani Lakshmibai of Jhansi | 53 | 0 | 53 | 0 | 0 |
| Satyajit Ray | 44 | 0 | 44 | 0 | 2 |
| Savitribai Phule | 47 | 0 | 47 | 0 | 0 |
| Srinivasa Ramanujan | 57 | 0 | 57 | 0 | 0 |
| Subhas Chandra Bose | 49 | 0 | 49 | 0 | 0 |
| Swami Vivekananda | 60 | 0 | 60 | 0 | 0 |
| Vasistha | 25 | 4 | 25 | 0 | 0 |
| Verghese Kurien | 57 | 0 | 57 | 0 | 0 |
| Vishvamitra | 393 | 183 | 198 | 22 | 0 |
| Yajnavalkya | 65 | 0 | 65 | 0 | 0 |

## Required to produce actual final approved-or-removed ledger

1. Open the original works and verify the exact relevant passages, source identity, edition, and qualifiers, not simply the source snippets copied from the database.
2. Classify and validate every claim epistemically; some are tradition/textual attributions or modern interpretation, not events asserted as independently historical.
3. Where a claim has no active passage (especially Vishvamitra), retrieve a valid source excerpt independently or remove it from public eligibility.
4. Apply corroboration requirements by claim class; URLs mirroring the same work do not count as independent sources.
5. Record a final APPROVE (with exact wording and source evidence) or REMOVE (with evidence-based reason) for **each claim ID**. Then test those decisions in an isolated DB before production.

## Fields

- `safe_publication_gate`: prevents accidental premature publication; it is NOT a final factual assessment.
- `suggested_epistemic_type`: heuristic starting point, not adjudicated.
- `independent_claim_core_crosscheck_from_prior_batch`: flags 28 claims whose **factual cores** were selectively checked against outside sources, not final claim eligibility.
- `final_approve_or_remove`: intentionally null until true primary verification. Filling this with guesses would misrepresent the audit.
- Individual personality Markdown files are self-contained for continuing source-level review.
- `EXTERNAL_CORE_CHECKS.md` documents the 28 selected independently checked claim cores and original source URLs.

## Evidence limitations

The export has 1,728 claim-source relationships and clipped passages. Source access, work identity, independent corroboration, and retention rights cannot be comprehensively checked from excerpts alone. No production database has been accessed or changed. No paid provider research was triggered by this analysis.
