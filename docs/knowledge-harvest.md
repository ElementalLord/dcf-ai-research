# Knowledge harvest

Whenever an Ask answer uses live search, DCF also records what that search read, so the next question can start from it.

## What happens on each question

1. **Local evidence first.** Approved Library claims and passages are retrieved and checked exactly as before.
2. **Recall before paying.** If a gap remains, DCF looks up works that earlier questions about the same person found credible and whose indexed topics overlap this question (`recall_knowledge_sources`). It re-reads up to two of those pages and accepts a passage only if the page still directly supports the question. If that closes the gap, no Google or Brave call is made.
3. **Live search.** Otherwise the existing Google grounding, Brave and demand-research paths run unchanged.
4. **Harvest after the response.** Once the answer has been sent (`after()` in `/api/ask`), every live passage the research read, cited or not, is grouped by work, scored, and stored in one transaction (`record_knowledge_harvest`).
5. **Look further into the same pages.** For up to three of the best works, DCF re-reads the page and indexes up to four other fact-dense passages that name the person. A later question on a different topic can then find the page through recall.

Harvesting never changes or delays an answer. Recording sources needs no model or search-provider call. Autonomous admission, described below, adds at most four small model calls after the response, and only when the evidence could qualify.

## Credibility score

`src/lib/knowledge-harvest/credibility.ts` gives each work a 0–100 score. Every point belongs to a named signal, and the signals are stored with the row so a reviewer can see why.

| Signal | Points |
|---|---|
| Publisher standing (authoritative / credible secondary / general web) | 40 / 32 / 8 |
| Evidence type (primary or scholarly / institutional or traditional / edited secondary) | 12 / 10 / 8 |
| Stated identity: title, author, publisher, date, journal, DOI or ISBN | up to 15 |
| Best passage support against a real question (exact / strong / partial) | 15 / 11 / 4 |
| Independent works from other publishers agreeing in the same research | 5 each, up to 10 |
| Open licence declared on the page | 3 |
| Site allowed by an administrator | 10 |
| Track record: distinct questions answered and times cited | up to 10 |
| Could not be re-read (per consecutive failure) | −5, down to −15 |

Tiers: **trusted** 75+, **credible** 50+, **provisional** 30+, **unverified** below 30. An unrecognized publisher is capped at 74 (never trusted without review), or at 49 when the page names no author or publisher. Only trusted and credible works are recalled.

Never stored: non-HTTPS pages, user-generated or aggregator sites (Wikipedia, Quora, Reddit, Medium and similar), sites an administrator blocked, and works with no directly supporting passage.

## What is stored

| Table | One row per | Holds |
|---|---|---|
| `knowledge_sources` | work (DOI, ISBN, title and author, or page) | identity, publisher standing, evidence type, score, tier, signals, rights, usage counters, review status |
| `knowledge_findings` | supporting passage, per work and personality | locator, passage hash, topic terms, support level, corroboration, counters |
| `knowledge_harvest_runs` | harvesting answer | counts, recall use, whether a paid search was avoided |

**Retention.** A passage's words are kept only when the page itself declares an open licence (Creative Commons or public domain). Otherwise the finding is a pointer: where the passage is, a hash of it, and its topic terms. This matches the existing rule that unlicensed source text is never retained.

**Privacy.** No question text, answer text or user identifier is stored. A question is kept only as a hash of its topic terms, to count distinct questions.

## Autonomous admission

The pipeline needs no reviewer. After a harvest is recorded, `src/lib/knowledge-harvest/admission.ts` turns verified facts into approved claims that later answers use as local evidence. A proposition is published only when every gate passes:

1. **Source standing.** Each cited work is credible or trusted and comes from a recognized publisher; general-web sources never qualify.
2. **Evidence contract.** Two works from different publishers, or one trusted work from an authoritative publisher. If the evidence cannot meet this, no model call is made.
3. **Atomic extraction.** One model call proposes plain factual propositions from the passages (at most three are verified per answer).
4. **Deterministic checks.** Every number, date and material word must be present in each cited passage. Quotations, hedged wording, superlatives, priority ("first", "only"), causal and interpretive claims are held back, as is wording copied from a source.
5. **Entailment check.** A second model call must find the exact proposition supported, with matching entities, dates and qualifiers, and independent documents.
6. **Corpus consistency.** Duplicates are skipped. If an approved claim states a competing date or quantity, the new one is held, and the older one is withdrawn if it was also machine-admitted.
7. **Publication.** `admit_harvest_verified_claim` re-checks standing, independence and a one-hour read recency from its own records, never from the caller, inside one transaction.

Admitted claims carry `approval_origin = automated_evidence_verification` and `storage_mode = harvest_verified`: DCF's own wording, a locator, and an approved source record, with no source text. Two-work claims are stored with high certainty, single-work claims with medium. A claim is valid for a year and is renewed whenever a later answer verifies it again.

Everything that is held back is logged with its reason in `demand_verification_decisions` and shown under **Verification decisions** in Resources.

### Safeguards that need no person

- A claim found to conflict with newer verified evidence is withdrawn from answers automatically.
- A source a person left pending or rejected in the Library is never approved by the machine.
- At most 200 claims are admitted per day.
- The existing Gemini rate caps apply to the two verification calls.

### Optional controls

Nothing below is required for the pipeline to run. In **Resources → Knowledge engine**:

- **Pause automatic admission** stops new claims (the existing switch; it is enforced inside the database).
- **Reject** on a harvested source stops its reuse and withdraws the claims that rest on it. **Restore** undoes it.
- **Add as candidate** puts a harvested work into the Library review queue by hand.

## Keeping approved claims usable

Answers only use an approved claim whose evidence meets the standard for its type (`claim_epistemics.contract_status`). A claim whose type is still unresolved is also used when its evidence meets the standard of every type it could be, except for date and historicity questions.

After each answer, `refreshBlockedEpistemics` re-evaluates that person's blocked claims with the current classifier and evidence contracts (at most once every six hours per person per server). It is upgrade-only: it writes a claim only when the new evaluation makes it usable, never re-blocks a usable claim, and leaves human and mentor decisions alone. It makes no model or search call.

On 2026-11-13 this was run once across all 25 people: 348 approved claims left blocked by the 2026-11-10 AI-review transition became usable. The prior rows are in `corpus_verification_audit.epistemics_refresh_2026_11_13`; `scripts/rollback-epistemics-refresh-2026-11-13.sql` restores them.

## Settings

| Variable | Default | Effect |
|---|---|---|
| `KNOWLEDGE_HARVEST_ENABLED` | on | `false` turns off both harvesting and recall |
| `KNOWLEDGE_DEEP_HARVEST_ENABLED` | on | `false` skips the extra same-page passages |
| `KNOWLEDGE_AUTO_ADMISSION_ENABLED` | on | `false` records sources but publishes no claims |
| `EPISTEMIC_AUTO_REFRESH_ENABLED` | on | `false` stops the upgrade-only re-evaluation after answers |

If the migrations `20261113010000_knowledge_harvest.sql` and `20261113020000_autonomous_harvest_admission.sql` have not been applied, Ask behaves exactly as before: the code detects the missing tables and stops trying for ten minutes at a time.

## Testing

- `tests/knowledge-harvest.test.ts`: scoring, topic terms, planning, persistence and recall.
- `tests/knowledge-admission.test.ts`: every autonomous admission gate.
- `tests/knowledge-harvest-page.test.ts`: the real page parser on a realistic HTML page.
- `tests/corpus/resilient-flow.test.ts`: recall and harvest scheduling through the full Ask pipeline.
- `supabase/tests/knowledge_harvest_test.sql` and `supabase/tests/autonomous_admission_test.sql`: the migrations' functions against a scratch PostgreSQL database.
