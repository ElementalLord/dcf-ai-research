# Resources source audit — 10 October 2026

This full scan covers **all 288 source records linked to a person** in the live Resources corpus, including the rejected-record view and the 57 sources added in the 20-per-person enrichment. The companion [CSV](./resource-source-audit-2026-10-10.csv) lists every original URL, access result, evidence-match counts, and any readable alternate link. The reproducible scanner is `scripts/audit-resource-sources.mjs`. Scan completed at 2026-10-10 13:31:53 UTC.

## What was checked

- Opened every original URL with a timed HTTP request, extracted page or PDF text, and recorded HTTP, TLS, timeout, and missing-link failures.
- Compared every attached evidence excerpt for a current claim with the extracted text, accepting an exact normalized match or a contiguous seven-word-or-longer partial match. The matcher preserves Sanskrit and other non-Latin scripts. Rejected claims were excluded from the evidence comparison.
- Checked that each source has attached current-claim evidence or a stored passage. All 288 have at least one; the rejected, URL-less internal test source has stored passages but cannot independently substantiate them.
- Previously validated 32 distinct readable Bala Kanda chapter URLs as parallel translations for 36 IIT Kanpur source records, 35 linked to a person. These remain labeled as a *parallel translation*, not the original IIT Kanpur edition.
- Previously validated direct OCR text links for three Internet Archive scans. These remain labeled as OCR and should be compared with page images before quoting.

The excerpt comparison is a wording and access check, **not** a semantic fact check or a guarantee of factual accuracy.

## Results

| Result | Source records |
| --- | ---: |
| Original page readable by scanner | 234 |
| Original IIT Kanpur URL failed TLS hostname validation | 35 |
| Maharashtra Gazetteers original URL had an expired certificate | 3 |
| PDF request timed out | 6 |
| Automated request received HTTP 403 | 9 |
| No original URL (rejected internal test framework) | 1 |

On the 234 readable pages, **370 attached evidence excerpts** had a full or partial wording match, **258** had no wording match, and **6** could not be checked as text. All 57 recently added pages were readable and their attached excerpts matched; the 258 misses are in older Vishvamitra material. Many of those excerpts are English summaries attached to Sanskrit pages, or book-scan descriptions attached to archive landing pages. A miss does not establish that the historical claim is false, but the current link and wording alone do not prove it to a reader. The 72 readable source records on which *none* of the attached wording matched now show a visible evidence-check warning in Resources.

All original pages for Agastya, A. P. J. Abdul Kalam, C. V. Raman, Srinivasa Ramanujan, and Swami Vivekananda were readable (20/20 each). Vasistha's 35 linked source records were readable. Shivaji had 16/20 readable; three Gazetteer certificate failures and one publisher 403 remain. Vishvamitra had 86/136 readable source records, including the rejected internal test source in the 136 total; the other 50 had the access problems listed above.

## Corrections and visibility

- Added verified, chapter-specific parallel translation links to 36 IIT Kanpur source records. The original citation remains visible and its TLS problem is named.
- Added direct OCR links to three Internet Archive scan records and labeled the OCR limitation.
- Flagged the three Gazetteer certificate failures and the HTTP/PDF retrieval failures in source details. A 403 or timeout in this scanner does not prove a normal browser cannot open the page.
- Added evidence-check warnings to the 72 readable records with no attached wording match. Source details and linked claim details show these warnings; readers can open the original citation and inspect stored passages.
- Published the scan date, access result, and excerpt-match counts to all 288 linked source records. The Resources list marks all 126 records with an access or evidence warning as **Source check needed**.
- Rejected the URL-less internal **DCF — Parameters to study Rishis** testing record as an external research source and returned its three solely supported approved claims to `needs_review`.
- Clarified Resources badges so bulk test approval reads **Approved for testing** and AI source approval reads **AI checked**; neither is presented as a human fact check.

## Remaining verification limits

**100% factual accuracy cannot be certified by this scan.** External sites can change; automated requests can be blocked when browser access works; OCR, paraphrase, and translation differences prevent exact wording checks. The 258 unmatched excerpts need individual semantic comparison with their cited passages. Three Gazetteer originals have certificate errors, six PDFs timed out, nine pages returned HTTP 403, and 35 IIT Kanpur originals have TLS hostname errors. Claims that still require expert review retain their review status; test approvals are identified as such. No original source was silently replaced with another edition.
