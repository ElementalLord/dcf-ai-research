# Adaptive source-family research: implementation and measured exercise

Date: 2026-10-04. Personality: Vishvamitra (`2853f4ed-98b1-4ef8-9f30-30f85d42edad`). This report records the linked corpus and the four controlled runs. It distinguishes implemented behavior from results actually achieved.

## Why the earlier loop stopped at BASIC

The previous loop converted a coverage gap to a narrow topic query, inspected only a few result URLs, and stopped after repeated zero-chunk batches. A guided query happened to find Swaveda's Mandala 3 page. Its 613 active verse-addressed chunks entered the corpus, but ingestion did not write `claim_chunks`. More text therefore did not yield a supported claim or a higher depth rating. The page also represents one underlying Griffith translation, rather than 613 independent works or an institutional research project.

The current planner reads live parameter and field coverage, aliases, source titles, relationship and event names, and prior bibliographic records. Each query records a source target, strategy, weakness reason, and expected gain. Strategies include repository, named work, journal, scholar, textual reference, textual development, spelling variant, and topic. Query-level attempts, credible admissions, distinct work keys, and exact links are recorded; zero-yield strategies receive a penalty after repeated attempts. Strategy exhaustion and overall corpus sufficiency are separate decisions. The run may continue while depth is BASIC when viable strategies and search budget remain.

Candidate URLs are ranked for verification, with institutional and scholarly paths preferred. This rank confers no evidence status. Every URL is checked individually. An unknown institutional family can be promoted only after three distinct approved pages with the same institution and a common project path, plus a same-host project/about page that documents the named institution and editorial or textual work. The promoted path uses the longest common parent of those pages. Promotion passes along the institution, never blanket evidence approval. Scope navigation stays on the verified host and path. Exploration is capped at 12 preview requests per query, 120 candidate pages per run, two link levels, 256 KiB preview per page, 3 MiB of previews per query, and a serial 250 ms delay. These mechanisms are implemented and tested, but no family met promotion criteria in the controlled run.

The hierarchy is source family → underlying work/edition → exact page → passage locator. `independent_work_key` is used to avoid treating mirrors as independent scholarship. The admin run view now includes this hierarchy and per-query integration counts.

The per-query report distinguishes candidate URLs, pages attempted, verified pages, new families, new work keys, new sources, chunks, support links, and changes in exact and corroborated claim coverage. Its weighted gain per paid call awards 8 points for a family, 5 for a work, 4 for an additionally supported claim, 3 for additional independent corroboration, 10 for a parameter depth increase, and at most 5 points for raw chunk growth; it divides by paid research calls. The weights are a transparent planning heuristic, while the underlying counts remain visible.

## Provenance and linking

[Swaveda's Mandala 3 page](https://www.swaveda.com/texts/rigveda/3/) labels the text as Griffith's English rendering and says 62 hymns, 617 verses, with 611 English alignments. [Its source list](https://www.swaveda.com/sources/) identifies Ralph T. H. Griffith's *The Hymns of the Rigveda* (1896). [Its about page](https://www.swaveda.com/about/) describes an independent project and AI-drafted articles; it does not document an institutional editorial board or peer review. The database now classifies the page as `PRIMARY_TEXT_REPRODUCTION`, credits Griffith's translation, and leaves the Sanskrit base edition unidentified. Its 613 active local locators need comparison against the site's 617/611 inventory before claiming completeness.

New verified-page integration checks claims against chunks using normalized transliteration and Rigveda, Ramayana, and Mahabharata locators. It records EXACT, STRONG, PARTIAL, RELATED, or UNRESOLVED. EXACT requires a matching locator plus quotation or substantial wording; only EXACT becomes a `supports` claim link. STRONG and PARTIAL become `context` links. The coverage calculator excludes these weaker adaptive links from exact-passage coverage. Existing curated links remain intact. The integration report records unlinked reasons and can create at most two pending, deterministic name-at-locator candidate claims per source. It also attempts conservative event and relationship passage links. The code never auto-approves candidate claims.

On the existing Swaveda source, relinking produced **1 EXACT and 5 STRONG links** across 613 active chunks. The latest idempotent relink added zero further links and reported **607 unlinked chunks**: 368 locator-only matches with insufficient wording, 2 entity-only overlaps, and 237 with no corresponding claim or wording. The one EXACT link attaches to a claim already supported elsewhere, so personality-wide exact-claim coverage stayed **198/386 (51.3%)**. No pending candidate claim was created. This is a small provenance improvement, not a depth improvement.

## Controlled research exercise

The budget was **30 new paid Brave research calls**; there were **zero Brave verification-search calls** and **zero Gemini calls for discovery or verification**. Search cache hits did not count against the paid limit. Each row below is one intended five-query batch, except the partial batches. Candidate counts are search results, not verified sources. There were four run records because development fixes and manual stop/resume boundaries occurred during the exercise.

| Run/batch | Paid Brave | Cache hits | Candidate URLs | Strategies in order | Result |
| --- | ---: | ---: | ---: | --- | --- |
| 1/1 | 5 | 0 | 50 | repository, work, journal, textual reference, textual development | 0 admitted |
| 1/2 | 5 | 0 | 46 | variant, scholar, topic, repository, work | 0 admitted |
| 1/3 | 2 | 0 | 18 | journal, textual reference | 0 admitted |
| 2/1 | 5 | 0 | 24 | repository, work, journal, textual reference, textual development | 1 bibliographic record |
| 3/1 | 2 | 3 | 22 | repository, work, journal, textual reference, textual development | same bibliographic record |
| 3/2 | 0 | 5 | 33 | variant, scholar, topic, repository, work | 0 admitted |
| 3/3 | 3 | 2 | 40 | journal, textual reference, textual development, variant, scholar | 0 admitted |
| 4/1 | 5 | 0 | 30 | journal, textual reference, repository, work, topic | same bibliographic record |
| 4/2 | 3 | 0 | 28 | repository, textual development, variant | 0 admitted |
| **Total** | **30** | **10** | **291 result occurrences** | | **0 admitted** |

### Exact query log

Each entry records the query, strategy, target source type, and paid/cache outcome. These are historical queries from the controlled exercise; they are not a proposed future plan.

Run 1, batch 1:

- repository / institutional_repository: "Vishvamitra" Contested or Uncertain Aspects university repository thesis (1 paid, 0 cached)
- work / primary_edition: "Vishvamitra" "Valmiki Ramayana — Bala Kanda" edition (1 paid, 0 cached)
- journal / peer_reviewed_scholarship: "Vishvamitra" Contested or Uncertain Aspects journal Vedic Sanskrit (1 paid, 0 cached)
- textual_reference / primary_edition: "Vishvamitra" "Dasharatha" textual reference academic (1 paid, 0 cached)
- textual_development / peer_reviewed_scholarship: "Vishvamitra" Contested or Uncertain Aspects textual development Rigveda Ramayana (1 paid, 0 cached)

Run 1, batch 2:

- variant / primary_edition: "Viśvāmitra" Contested or Uncertain Aspects academic (1 paid, 0 cached)
- scholar / scholarly_reference: "Vishvamitra" "Valmiki Ramayana — Bala Kanda" scholarly analysis (1 paid, 0 cached)
- topic / primary_edition: "Vishvamitra" Contested or Uncertain Aspects critical edition Sanskrit text (1 paid, 0 cached)
- repository / institutional_repository: "Vishvamitra" Tapas and Sadhana university repository thesis (1 paid, 0 cached)
- work / primary_edition: "Vishvamitra" "Mahabharata" edition (1 paid, 0 cached)

Run 1, batch 3:

- journal / peer_reviewed_scholarship: "Vishvamitra" Tapas and Sadhana journal Vedic Sanskrit (1 paid, 0 cached)
- textual_reference / primary_edition: "Vishvamitra" "Vashishta" textual reference academic (1 paid, 0 cached)

Run 2, batch 1:

- repository / institutional_repository: "Viśvāmitra" VedaWeb Rigveda digital scholarly edition (1 paid, 0 cached)
- work / scholarly_reference: "Viśvāmitra" "Vedic Index of Names and Subjects" (1 paid, 0 cached)
- journal / peer_reviewed_scholarship: "Viśvāmitra" "Journal of the Royal Asiatic Society" Vedic (1 paid, 0 cached)
- textual_reference / primary_edition: "Viśvāmitra" "Rigveda 3.33" academic edition (1 paid, 0 cached)
- textual_development / peer_reviewed_scholarship: "Viśvāmitra" Rigvedic Ramayana historical textual development scholarship (1 paid, 0 cached)

Run 3, batch 1:

- repository / institutional_repository: "II. Viśvāmitra, Vasiṣṭha, Hariścandra, and Śunaḥśepa" university repository 1917 (1 paid, 0 cached)
- work / peer_reviewed_scholarship: "II. Viśvāmitra, Vasiṣṭha, Hariścandra, and Śunaḥśepa" "F. E. Pargiter" full text (1 paid, 0 cached)
- journal / peer_reviewed_scholarship: "Viśvāmitra" "Journal of the Royal Asiatic Society" Vedic (0 paid, 1 cached)
- textual_reference / primary_edition: "Viśvāmitra" "Rigveda 3.33" academic edition (0 paid, 1 cached)
- textual_development / peer_reviewed_scholarship: "Viśvāmitra" Rigvedic Ramayana historical textual development scholarship (0 paid, 1 cached)

Run 3, batch 2:

- variant / primary_edition: "Viśvāmitra" Contested or Uncertain Aspects academic (0 paid, 1 cached)
- scholar / scholarly_reference: "Vishvamitra" "Valmiki Ramayana — Bala Kanda" scholarly analysis (0 paid, 1 cached)
- topic / primary_edition: "Vishvamitra" Contested or Uncertain Aspects critical edition Sanskrit text (0 paid, 1 cached)
- repository / institutional_repository: "Viśvāmitra" VedaWeb Rigveda digital scholarly edition (0 paid, 1 cached)
- work / scholarly_reference: "Viśvāmitra" "Vedic Index of Names and Subjects" (0 paid, 1 cached)

Run 3, batch 3:

- journal / peer_reviewed_scholarship: "Vishvamitra" Contested or Uncertain Aspects journal Vedic Sanskrit (0 paid, 1 cached)
- textual_reference / primary_edition: "Vishvamitra" "Mythologization vs. historical core" Sanskrit edition (1 paid, 0 cached)
- textual_development / peer_reviewed_scholarship: "Vishvamitra" Contested or Uncertain Aspects textual development Rigveda Ramayana (0 paid, 1 cached)
- variant / primary_edition: "Visvamitra" Contested or Uncertain Aspects academic (1 paid, 0 cached)
- scholar / scholarly_reference: "Vishvamitra" "Mahabharata" scholarly analysis (1 paid, 0 cached)

Run 4, batch 1:

- journal / peer_reviewed_scholarship: "Viśvāmitra" Vasistha historical philology open access journal (1 paid, 0 cached)
- textual_reference / primary_edition: "Viśvāmitra" Aitareya Brahmana Sunahsepa edition university (1 paid, 0 cached)
- repository / scholarly_reference: "Viśvāmitra" site:sanskrit-lexicon.uni-koeln.de Vedic Index (1 paid, 0 cached)
- work / scholarly_reference: "Viśvāmitra" Macdonell Keith Vedic Index university scan (1 paid, 0 cached)
- topic / primary_edition: "Vishvamitra" Tapas and Sadhana critical edition Sanskrit text (1 paid, 0 cached)

Run 4, batch 2:

- repository / institutional_repository: "Viśvāmitra" Vedic studies site:ac.in thesis (1 paid, 0 cached)
- textual_development / peer_reviewed_scholarship: "Vishvamitra" Tapas and Sadhana textual development Rigveda Ramayana (1 paid, 0 cached)
- variant / primary_edition: "Vishwamitra" Contested or Uncertain Aspects academic (1 paid, 0 cached)

The distinct scholarly record was F. E. Pargiter, “II. Viśvāmitra, Vasiṣṭha, Hariścandra, and Śunaḥśepa,” *Journal of the Royal Asiatic Society* (1917), DOI `10.1017/S0035869X00049911` ([publisher record](https://www.cambridge.org/core/journals/journal-of-the-royal-asiatic-society/article/abs/ii-visvamitra-vasistha-hariscandra-and-sunahsepa/35D21CA5E42342B71D6BC7725F2C814A)). It was classified `BIBLIOGRAPHIC_ONLY`: the available page did not provide inspectable, licensed full text. It is a research lead, not a cited evidence passage. The record appeared in three runs and counts as **one** bibliographic work, not three independent scholarly sources.

**Measured gain per paid Brave query:** zero admitted pages, zero promoted families, zero independent evidence works, zero new primary or scholarly evidence sources, zero internally discovered approved pages, zero new chunks, zero new exact/strong/partial links, and zero candidate claims. No corpus page was gained without another Brave call. Among verified candidates, common rejection reasons were restricted pages, absent named institutional/editorial metadata, and absent explicit full-text rights. Ten cached repeat queries in run 3 exposed a five-run history limit; the planner now reads 50 recent runs and carries strategy performance into new runs. The exercise stopped at the explicit 30-new-call ceiling. These results do not establish true global research saturation; they establish a budget-limited admission failure across several query strategies.

## Corpus and answer benchmark

Before and after this exercise: 126 sources, 35 counted independent works, 825 active chunks, 386 approved claims, 198 approved claims with an exact passage, and 76 claims with independent corroboration. Overall depth remained **BASIC**. Textual Contribution remained **GOOD**; every other parameter remained **BASIC** because exact passage coverage was insufficient. No parameter became GOOD or DEEP. The weakest high-priority areas remain role, tapas, philosophy, historical context, and contested material. The source count and independent-work count include legacy/imported corpus data and should not be mistaken for new admissions.

| Parameter | Exact claims / approved claims, before and after | Depth, before and after |
| --- | ---: | --- |
| Vocation / Role | 14/26 | BASIC → BASIC |
| Textual Contribution | 47/65 | GOOD → GOOD |
| Tapas and Sadhana | 17/37 | BASIC → BASIC |
| Philosophical / Doctrinal Position | 16/34 | BASIC → BASIC |
| Parampara and Lineage | 17/41 | BASIC → BASIC |
| Inner Qualities | 15/31 | BASIC → BASIC |
| Relational / Social Role | 29/43 | BASIC → BASIC |
| Historical and Textual Context | 17/34 | BASIC → BASIC |
| Contested / Uncertain Aspects | 14/41 | BASIC → BASIC |
| Contemporary Relevance | 11/33 | BASIC → BASIC |

Seven requested `/api/ask` questions returned HTTP 200, but all seven returned `extractive_fallback`. The first Gemini synthesis call timed out; the provider circuit then avoided six further generation calls. The answers cite retrieved approved claims and passages but read as evidence lists, and the lineage answer prioritized mentor/student relationships over ancestry. They cannot be reported as an answer-quality gain. The run used **one Gemini generation call for benchmarking**, separate from the zero corpus-research Gemini calls.

Concise evidence-grounded answers to three requested questions:

1. **Who is Vishvamitra?** He is a Vedic seer name associated with Rigveda Mandala 3 and its Vishvamitra family tradition. The later *Ramayana* presents him as a sage who guides Rama and Lakshmana and describes a transformation from royal sage to Brahmarshi. Those are related textual traditions, not a single independently verified biography. Sources: [Rigveda 3.33](https://vedicheritage.gov.in/samhitas/rigveda/shakala-samhita/rigveda-shakala-samhita-mandal-03-sukta-033/), [Rigveda 3.62](https://vedicheritage.gov.in/hi/samhitas/rigveda/shakala-samhita/rigveda-shakala-samhita-mandal-03-sukta-062/), [Ramayana Bala Kanda 1.63](https://www.valmikiramayan.net/utf8/baala/sarga63/bala_63_prose.htm).
2. **Rigvedic versus Ramayana Vishvamitra.** Rigvedic materials associate the name and lineage with hymns, including Mandala 3 and the Savitr verse at 3.62.10. *Bala Kanda* develops a narrative personality: royal ancestry, conflict, ascetic striving, and Rama's mentorship. Epic episodes should not be projected back as established facts about the Vedic seer. Sources: [Vedic Heritage Rigveda overview](https://vedicheritage.gov.in/samhitas/rigveda/), [IIT Kanpur Bala Kanda 1.34](https://www.valmiki.iitk.ac.in/sloka?field_kanda_tid=1&field_sarga_value=34&language=dv), [Ramayana introduction](https://www.valmikiramayan.net/utf8/ramayana.shtml).
3. **Historically.** The secure claim here is textual: the Vedic tradition preserves the designation Gāthina Viśvāmitra and associates it with specific hymns. Details of an individual lifetime, exact dates, and the historical identity behind later epic biography remain unestablished by this corpus. Sources: [Rigveda 3.33](https://vedicheritage.gov.in/samhitas/rigveda/shakala-samhita/rigveda-shakala-samhita-mandal-03-sukta-033/), [Rigveda 3.62](https://vedicheritage.gov.in/hi/samhitas/rigveda/shakala-samhita/rigveda-shakala-samhita-mandal-03-sukta-062/), [Ramayana introduction](https://www.valmikiramayan.net/utf8/ramayana.shtml).

## Validation and open work

Tests: 143 passing across 17 files, including new planner, family-scope, locator, transliteration, and linking cases. TypeScript typecheck and ESLint pass. Production build result and commit hash are recorded in the final response. Admin URL: `http://localhost:3000/corpus/external` during local development (or `/corpus/external` on the deployed app).

Open work: an institutional project can still be rejected before three verified pages accumulate because page-local author, edition, and rights metadata are often sparse; one known bibliographic article needs an inspectable full text; baseline imported source classifications need audit; and answer synthesis should recover gracefully from a provider timeout. The controlled exercise did **not** reach the requested goal of materially deeper evidence or answers.
