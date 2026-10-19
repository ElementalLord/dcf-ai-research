# Corpus verification preflight — 2026-10-18

This is a read-only inventory of the configured database, captured as a private local JSON snapshot. It is **not a claim verification report or final disposition ledger**. No production rows were changed, no paid research API was called, and no isolated PostgreSQL clone was created.

## Inventory

- Claims: **1585** across 25 personalities. Sources: 473; source passages: 2854; claim-source links: 1728; claim-passage links: 1679.
- `draft`: 1008.
- `approved`: 464.
- `needs_review`: 112.
- `rejected`: 1.
- Strict-origin eligible before cleanup: **25** claims in **6** personalities. This is an origin/status count, not a full Ask coverage measurement.
- Current approved claims: 464; of these, 430 have `system_test_bulk` origin and 9 have `imported_existing` origin.

## Evidence and classification gaps

- Claims without an approved supporting source link: 7.
- Claims without an active supporting passage from an approved source: 184. A passage link or excerpt is only a lead; it does not establish entailment.
- Claims without a `claim_epistemics` row: 114. Claims without an assigned epistemic type, including absent rows: 1390.
- Claims whose stored evidence contract is not explicitly satisfied: 1457. This stored flag is not a substitute for direct review.
- Approved claims without an assigned epistemic type: 269.
- Claim-source links with a nonempty excerpt: 1722/1728.
- Stored explicit claim conflict relations: 0. Their absence does not show that the corpus is conflict-free.

## By personality

| Personality | Claims | Current approved | Strict-origin eligible | Missing active supporting passage |
|---|---:|---:|---:|---:|
| Vishvamitra | 393 | 390 | 0 | 179 |
| Yajnavalkya | 65 | 0 | 0 | 0 |
| Ramakrishna Paramahamsa | 64 | 0 | 0 | 0 |
| Swami Vivekananda | 60 | 5 | 5 | 0 |
| Chhatrapati Shivaji Maharaj | 60 | 0 | 0 | 0 |
| M. S. Subbulakshmi | 57 | 0 | 0 | 0 |
| Srinivasa Ramanujan | 57 | 0 | 0 | 0 |
| Verghese Kurien | 57 | 5 | 5 | 0 |
| Rajaraja Chola I | 53 | 0 | 0 | 0 |
| Rani Lakshmibai of Jhansi | 53 | 0 | 0 | 0 |
| Ashoka | 53 | 0 | 0 | 0 |
| C. V. Raman | 52 | 0 | 0 | 0 |
| Jamsetji Tata | 52 | 0 | 0 | 0 |
| Subhas Chandra Bose | 49 | 0 | 0 | 0 |
| Bhagat Singh | 49 | 49 | 0 | 0 |
| Jagadish Chandra Bose | 49 | 0 | 0 | 0 |
| A. P. J. Abdul Kalam | 49 | 1 | 1 | 0 |
| Savitribai Phule | 47 | 0 | 0 | 0 |
| Guru Nanak | 46 | 0 | 0 | 0 |
| Satyajit Ray | 44 | 5 | 5 | 0 |
| J. R. D. Tata | 42 | 0 | 0 | 0 |
| Rabindranath Tagore | 42 | 0 | 0 | 0 |
| Agastya | 34 | 0 | 0 | 1 |
| Adi Shankaracharya | 33 | 5 | 5 | 0 |
| Vasistha | 25 | 4 | 4 | 4 |

## Source and epistemic inventory

| Source type | Source records | Claim-source links |
|---|---:|---:|
| `primary_text` | 211 | 592 |
| `institutional` | 154 | 579 |
| `scholarly_article` | 82 | 438 |
| `scholarly_book` | 25 | 116 |
| `dcf_content` | 1 | 3 |

| Epistemic type | Claims |
|---|---:|
| `UNCLASSIFIED` | 1390 |
| `TRADITIONAL_NARRATIVE` | 91 |
| `TEXTUAL_ASSERTION` | 48 |
| `SYNTHETIC_INTERPRETATION` | 28 |
| `METHODOLOGICAL` | 12 |
| `NORMATIVE_RELEVANCE` | 11 |
| `MODERN_RECEPTION` | 2 |
| `SCHOLARLY_INTERPRETATION` | 1 |
| `HISTORICAL_FACT` | 1 |
| `CONTESTED` | 1 |

## Verification blocker and required next work

The snapshot exposes metadata and stored passages but does not establish source identity, accuracy, independence, passage entailment, historical precision, or rights for each of 1,585 claims. The local Supabase container was absent; the configured remote database was used only for read-only extraction. There is no isolated PostgreSQL database to apply and test decisions. Assigning APPROVED or REMOVED now would misrepresent the evidence. The final disposition totals therefore remain **undetermined**, and all original statuses remain intact.

Before finalization: create a disposable database with the complete schema and data; review each claim against its original source and passage, logging corrections, corroboration, conflicts, and a reasoned decision; apply those decisions only to the disposable database; gate all retrieval paths including passage RPCs and profiles; invalidate old answer caches; then run real strict-mode Ask and profile checks and compare coverage. Preserve original data until a separate production migration is authorized.

No research/API cost was incurred in this preflight. Paid external research has not been budgeted or authorized. No SQL migration, test result, or production-build result should be interpreted as evidence that this cleanup is complete.

## Baseline validation

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test:run`: 407 passed, 5 skipped across 39 test files.
- `npm run build`: passed with Next.js 16.3.5.
- Real PostgreSQL cleanup validation and strict-mode retrieval after cleanup: not run, because an isolated full-data database and verified decision ledger do not yet exist.
