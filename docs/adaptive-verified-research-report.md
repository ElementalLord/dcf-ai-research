# Adaptive verified research: implementation and controlled Vishvamitra run

Date: 2026-10-04. Repository: `dcf-ai-research`.

## Discovery and admission

Previously, `discoverWebCandidates` rejected a Brave URL unless an approved registry rule already matched its host/path and allowed both search and fetch. Unknown domains never reached verification. Now Brave results enter an untrusted candidate set after URL normalization. A bounded HTTPS preview applies DNS/SSRF checks, manual redirect validation, a 12-second timeout, content-type checks, and a 256 KiB transfer cap. The preview is never indexed or cited. Only an admitted exact URL can enter the existing approved full-fetch/cache/ingestion path, which retains its 12 MiB limit and redirect authorization on every hop.

The verifier records title, authorship/editor/translator, institution, publisher, journal, year, DOI/ISBN/edition/work, source family, type/layer, access statement, independent-work key, concrete signals/failures, decision, and approval origin. These are extracted from the original page; Brave titles and snippets do not supply evidence or verification metadata. Outcomes include `VERIFIED_WORK`, `APPROVED_FOR_EVIDENCE`, `BIBLIOGRAPHIC_ONLY`, and specific rejection states. Automatic admission is controlled by `ADAPTIVE_AUTO_ADMIT=false` (enabled otherwise) and is available only through the admin API. A newly admitted rule is `EXACT_URL`, with `approval_origin=verified_auto` in both the rule and the evidence source. It never claims mentor approval.

### Admission criteria

- **Institutional page:** an explicitly named institution on a `.edu`, `.ac.*`, or government host, a named author/editor, a relevant original page, and DOI/edition or journal plus year. A suffix alone does not pass.
- **Scholarly publisher:** DOI, named author, journal, year, and publisher together, even on a nonacademic host suffix.
- **Public-domain primary work:** original-script passages, at least ten explicit verse locations, a named translator and publication year, a named work, and a public-domain attribution on the original page. The admitted identity includes work, translator, and year.
- **Evidence access:** substantial original text and an explicit open-access, reusable-license, or public-domain statement. Otherwise a credible record stays bibliographic only. Restricted pages without inspectable bibliography are unverifiable.
- **Rejection:** missing provenance/relevance, anonymous low-quality platforms, unsafe URLs or redirects, unsupported content, and a previously admitted identical underlying work.

The same work key identifies edition/translation mirrors before admission. Full-content hashing in the existing cache also merges identical originals. Coverage counts pages and independent works separately; old Rigveda sukta pages now group by work/edition stem rather than inflating independence. Approved claims need multiple *independent work keys* for corroboration.

`verified_source_families` can be promoted after three separately approved pages with the same institution, project family, host, and two-segment-or-deeper path. Only institution identity is inherited inside that exact path. Every child still receives its own safety, relevance, work, access, duplicate, and exact-URL evidence checks. No host-wide evidence rule is created. This run discovered one new work-level family, but **promoted zero verified project scopes** because only one page passed admission. This limitation is visible in the admin UI.

## Adaptive loop and depth

Admin preview reports present depth, weak parameter areas, a six-question deterministic lexical retrieval benchmark, five initial queries, and initial Brave cost. Guided mode pauses after each five-query batch; explicit admin auto mode continues. Each batch recalculates the actual database parameter fields and passage links, then plans the next five queries from weak areas, absent primary/scholarly evidence, known works and relationships, and promising candidate hosts. Site-restricted follow-ups change search ranking only; they do not grant trust.

Depth uses field coverage, linked original passages, independent works, primary/scholarly balance, textual layers, exact approved-claim links, and contested claims. The states are `EMPTY`, `THIN`, `BASIC`, `GOOD`, `DEEP`, and `CONTESTED`. Important dimensions need `GOOD` or `DEEP`; other dimensions must reach at least `BASIC`; three broad benchmark questions must retrieve five passages from three independent works and two layers. This is deliberately stricter than a claim or URL count. The benchmark uses lexical database retrieval only, with zero Gemini calls.

Stop reasons are `sufficient`, `saturated` (three consecutive zero-yield batches or no remaining distinct query), `budget`, and `manual_stop`; provider errors pause. The default hard budget is **50 paid Brave calls per run**, maximum 50, with **five queries per batch**. Cache hits do not consume paid-call budget. The initial Vishvamitra exercise was capped at 20 Brave calls total across its development runs; it did not silently raise that cap.

## Controlled Vishvamitra result

The acceptance exercise included two initial automatic runs, a one-call automatic probe, three one-query guided checks against a previously obtained Brave result, and three exploratory Brave queries used to diagnose ranking. The guided focus was necessary to surface the credible work within this 20-call ceiling; the automatic runs alone did not reach depth. No claim of autonomous research completeness is made.

| Stage | Queries processed | Paid Brave calls | Cached searches | Outcome |
| --- | ---: | ---: | ---: | --- |
| Auto run 1, round 1 | 5 | 4 | 1 | 50 URL occurrences, 0 admitted |
| Auto run 1, round 2 | 5 | 5 | 0 | 50 occurrences, saturated under the earlier two-batch threshold |
| Auto run 2, round 1 | 5 | 5 | 0 | 50 occurrences, 0 admitted |
| Auto run 2, round 2 | 5 | 2 | 3 | 50 occurrences, saturated under the earlier two-batch threshold |
| One-call auto probe | 1 | 1 | 0 | Budget stop, 0 admitted |
| Exploratory Brave queries | 3 | 3 | 0 | Found a previously unknown work index |
| Guided verification/reindex checks | 3 | 0 | 3 | Followed a relevant same-project link, admitted and reindexed one original |
| **Total** | **24 run queries + 3 exploratory** | **20** | **7 run cache hits** | Final guided run manually stopped at ceiling |

The final code uses a **three-batch** saturation threshold; the two earlier auto runs used the preceding two-batch version during implementation. This distinction matters when interpreting their stop records.

Across all six run records, 243 candidate URL occurrences yielded 98 durable verification rows for 70 distinct URLs across 54 domains. Durable outcomes were 19 security failures, 71 unverifiable pages, 6 low-quality rejections, and 2 approvals for the same URL in separate runs. There were **no bibliographic-only records** and **no newly verified scholarly sources** in this bounded sample. A rejected example is an anonymous Blogspot biography; it lacked institutional/authorship provenance and was a low-quality platform. Restricted Quora pages lacked inspectable bibliography. These counts are run/row counts, not independent-source counts.

The new source was [Swaveda's Rigveda Mandala 3 original page](https://www.swaveda.com/texts/rigveda/3/), reached from a Brave-discovered Rigveda index by a same-project link naming Viśvāmitra. It was absent from the original registry. The original page explicitly attributes a public-domain 1896 translation to Ralph T. H. Griffith, contains Sanskrit original script, and exposes individual hymn/verse references. The exact child URL was admitted with `verified_auto`; the index and the whole domain were not approved for evidence. Its work key is `rigveda|ralph t. h. griffith|1896`. This is one new primary work and one candidate work family; there are zero promoted institutional source-family scopes.

The original page was fetched twice during extraction refinement (one unique original URL). The first extraction created 145 broad chunks; the final verse-aware reindex created 613 active chunks with locations such as `3.53.9`. Only six direct name-bearing passages are linked to Vishvamitra and tagged to relevant parameter fields; unrelated verses remain in the source but are excluded from personality retrieval. This raised personality-linked active chunks from **819 to 825**, URLs from **125 to 126**, and conservatively grouped independent works from **34 to 35**. Textual Contribution stayed `GOOD`; the other nine dimensions stayed `BASIC`. No area reached `DEEP`. The six-question lexical benchmark still reports broad readiness `false` (the “Who is Vishvamitra?” top 30 contained only two independent works and no exact-location results).

Approved claims with exact chunk links remained **198/386 before and after**. Claims supported by multiple independent works remained **76 before and after**. The run created **zero new claim-to-passage links**. Exact *source passage* provenance improved through 613 verse-addressed chunks, but claim-level attribution remains an important gap. There were zero Gemini calls during source discovery and verification. Further targeted research and conservative claim linking would be useful; this corpus is **not research-depth ready**.

## Verification and inspection

Additive migrations `20261004010000` through `20261004040000` were applied to the linked Supabase database. RLS remains enabled and anon/authenticated access revoked on the new tables. Admin UI: [External Research](http://localhost:3000/corpus/external) (local development instance). The source review shows status, reasons, provenance, independence key, access, search-gap context, family, batch metrics, and benchmark results. Production access continues to require the existing `CORPUS_ADMIN_TOKEN` configuration.

Final local gates: **133 tests passed**, TypeScript typecheck passed, ESLint passed, and the Next.js production build passed. The final commit hash is recorded in the corresponding git commit rather than embedded here to avoid a self-referential commit change.
