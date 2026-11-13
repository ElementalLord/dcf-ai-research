# Knowledge harvest

Whenever an Ask answer uses live search, DCF also records what that search read, so the next question can start from it.

## What happens on each question

1. **Local evidence first.** Approved Library claims and passages are retrieved and checked exactly as before.
2. **Recall before paying.** If a gap remains, DCF looks up works that earlier questions about the same person found credible and whose indexed topics overlap this question (`recall_knowledge_sources`). It re-reads up to two of those pages and accepts a passage only if the page still directly supports the question. If that closes the gap, no Google or Brave call is made.
3. **Live search.** Otherwise the existing Google grounding, Brave and demand-research paths run unchanged.
4. **Harvest after the response.** Once the answer has been sent (`after()` in `/api/ask`), every live passage the research read, cited or not, is grouped by work, scored, and stored in one transaction (`record_knowledge_harvest`).
5. **Look further into the same pages.** For up to three of the best works, DCF re-reads the page and indexes up to four other fact-dense passages that name the person. A later question on a different topic can then find the page through recall.

Harvesting never changes or delays an answer. It needs no extra model or search-provider call: only free page reads and two database round trips.

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

## Review

Harvested works are not approved knowledge and are never cited from memory. In **Resources → Knowledge engine → Source harvest** an administrator can:

- **Add to Library**: creates an ordinary candidate source (`approval_origin = ai_candidate`), mapped to each personality it has findings for. Approval remains the existing human review step.
- **Reject**: the work is no longer recalled, and later findings from it are marked rejected.
- **Restore**: undo a rejection.

A trusted work that answered at least two distinct questions and was cited at least twice is flagged **Ready to add**.

## Settings

| Variable | Default | Effect |
|---|---|---|
| `KNOWLEDGE_HARVEST_ENABLED` | on | `false` turns off both harvesting and recall |
| `KNOWLEDGE_DEEP_HARVEST_ENABLED` | on | `false` skips the extra same-page passages |

If the migration `20261113010000_knowledge_harvest.sql` has not been applied, Ask behaves exactly as before: the code detects the missing tables and stops trying for ten minutes at a time.

## Testing

- `tests/knowledge-harvest.test.ts`: scoring, topic terms, planning, persistence and recall.
- `tests/knowledge-harvest-page.test.ts`: the real page parser on a realistic HTML page.
- `tests/corpus/resilient-flow.test.ts`: recall and harvest scheduling through the full Ask pipeline.
- `supabase/tests/knowledge_harvest_test.sql`: the migration's functions against a scratch PostgreSQL database.
