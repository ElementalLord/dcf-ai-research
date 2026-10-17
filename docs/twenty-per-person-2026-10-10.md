# Twenty sources and claims per person — 10 October 2026

The live Resources corpus now meets the requested **minimum of 20 approved source records and 20 current claim records for every available person**. “Approved source” here means the publisher page and the cited passage were checked for this enrichment; AI-checked source status is not human approval of the linked claim. New claims remain `needs_review` with `ai_candidate` origin.

| Person | Approved sources | Current claims |
| --- | ---: | ---: |
| Vishvamitra | 135 | 393 |
| Vasistha | 20 | 23 |
| Agastya | 20 | 33 |
| C. V. Raman | 20 | 52 |
| Srinivasa Ramanujan | 20 | 57 |
| Swami Vivekananda | 20 | 58 |
| Chhatrapati Shivaji Maharaj | 20 | 60 |
| A. P. J. Abdul Kalam | 20 | 49 |

`scripts/ensure-twenty-resources.mjs` is the reproducible enrichment. Its dry run fetched all 57 proposed new URLs and checked a person-specific anchor on each page before any write. For Agastya's ten Rigveda hymn pages, it also checked that the hymn-specific metadata names Agastya. Ten previously linked Vasistha hymn pages were separately checked for Vasistha attribution and moved from candidate to approved source status.

The additions comprise ten original-paper and archive sources for Raman; ten Ramanujan archival and contemporary records; eight separate Vivekananda lectures; ten Maharashtra government fort pages about Shivaji; nine speeches from Kalam's presidential archive; and ten Vedic Heritage hymn pages for Agastya. Every new source has a person link, a linked reviewable claim, an evidence excerpt, and a stored passage. An integrity query confirmed **57 of 57** for each relationship.

The [full source access audit](./resource-source-audit-2026-10-10.md) now covers all 288 linked source records, including these 57 additions. All 57 new pages were readable and their attached excerpts matched. The audit also records unresolved external-link and evidence-wording problems in the older corpus. Reaching the 20/20 count does not resolve those older citation issues or make the new claims human-reviewed.
