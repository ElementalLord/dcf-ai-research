# Available people corpus enrichment — 2026-10-10

These counts are the earlier 10-source baseline. For the later live counts after the 20-per-person enrichment, see [the updated report](./twenty-per-person-2026-10-10.md).

`node --env-file=.env.local scripts/enrich-available-people.mjs` verifies the
original pages and candidate passage links without database writes. Add
`--apply` to make the repeatable, deduplicated updates.

| Person | Linked sources | Approved sources | Source-linked claims | Combined |
| --- | ---: | ---: | ---: | ---: |
| Vishvamitra | 136 | 136 | 393 | 529 |
| Vasistha | 35 | 10 | 23 | 58 |
| Agastya | 10 | 10 | 24 | 34 |
| C. V. Raman | 10 | 10 | 42 | 52 |
| Srinivasa Ramanujan | 10 | 10 | 47 | 57 |
| Swami Vivekananda | 12 | 12 | 50 | 62 |
| Chhatrapati Shivaji Maharaj | 10 | 10 | 50 | 60 |
| A. P. J. Abdul Kalam | 11 | 11 | 40 | 51 |

The enrichment added ten distinct, publisher-linked sources with excerpt and
claim links: three for Raman, four for Ramanujan, and three for Shivaji. It
promoted 18 Vasistha and 18 Agastya passage-backed candidate statements into
reviewable claim records. Seven additional Vasistha source pages were checked
against the originals and moved from candidate to approved source status.

New and promoted claims retain `ai_candidate` origin and review status. The
application's strict evidence policy excludes them from approved-claim
retrieval until an actual reviewer approves each claim. Source passages remain
linked separately for evidence inspection.
