# Rishi Knowledge quality evaluation

Run: 2026-10-14T03:55:21.045Z
Suite: rishi-quality-v1 (300 questions; 12 for each of 25 personalities)
Mode: real application pipeline with deterministic local synthesis; external search cap 0; paid-model call cap 0.

## Overall result

- Strict deterministic pass: 65/300 (21.7%)
- Retrieval sufficient: 76/300 (25.3%)
- Valid, registered citation IDs: 46/300 (15.3%)
- Passage-backed citation structure: 46/300 (15.3%)
- Technical errors: 0
- External searches and paid model calls: 0

A deterministic pass means the response matched the required answer/qualify/decline behavior and any non-declined response had valid, passage-bearing citations. It is **not** a factual-accuracy grade. Every substantive answer remains marked for human factual review.

## Per personality

| Personality | Strict pass | Retrieval | Citation IDs | Citation support | Avg ms | Approved claims | Local passages |
|---|---:|---:|---:|---:|---:|---:|---:|
| Rabindranath Tagore | 2/12 | 2/12 | 2/12 | 2/12 | 1271 | 0/42 | 36 |
| Srinivasa Ramanujan | 3/12 | 3/12 | 1/12 | 1/12 | 2218 | 0/57 | 57 |
| Rani Lakshmibai of Jhansi | 2/12 | 3/12 | 1/12 | 1/12 | 1157 | 0/53 | 49 |
| Vishvamitra | 7/12 | 9/12 | 8/12 | 8/12 | 2810 | 390/393 | 922 |
| Satyajit Ray | 1/12 | 1/12 | 1/12 | 1/12 | 1147 | 0/42 | 35 |
| Jagadish Chandra Bose | 2/12 | 2/12 | 0/12 | 0/12 | 1061 | 0/49 | 37 |
| Swami Vivekananda | 2/12 | 2/12 | 0/12 | 0/12 | 1098 | 0/58 | 58 |
| Adi Shankaracharya | 1/12 | 2/12 | 2/12 | 2/12 | 1142 | 0/31 | 31 |
| Vasistha | 3/12 | 3/12 | 1/12 | 1/12 | 2201 | 0/23 | 22 |
| C. V. Raman | 3/12 | 3/12 | 3/12 | 3/12 | 1837 | 0/52 | 50 |
| Yajnavalkya | 4/12 | 6/12 | 6/12 | 6/12 | 1078 | 0/65 | 65 |
| Chhatrapati Shivaji Maharaj | 2/12 | 2/12 | 0/12 | 0/12 | 1289 | 0/60 | 60 |
| Savitribai Phule | 4/12 | 4/12 | 2/12 | 2/12 | 1155 | 0/47 | 47 |
| Guru Nanak | 2/12 | 3/12 | 3/12 | 3/12 | 1213 | 0/46 | 44 |
| Bhagat Singh | 2/12 | 3/12 | 2/12 | 2/12 | 1300 | 49/49 | 26 |
| J. R. D. Tata | 3/12 | 4/12 | 2/12 | 2/12 | 1060 | 0/42 | 35 |
| A. P. J. Abdul Kalam | 3/12 | 4/12 | 2/12 | 2/12 | 1115 | 0/49 | 49 |
| M. S. Subbulakshmi | 1/12 | 1/12 | 1/12 | 1/12 | 1112 | 0/57 | 56 |
| Subhas Chandra Bose | 2/12 | 2/12 | 0/12 | 0/12 | 1347 | 0/49 | 34 |
| Verghese Kurien | 5/12 | 5/12 | 3/12 | 3/12 | 1151 | 0/55 | 52 |
| Ramakrishna Paramahamsa | 1/12 | 2/12 | 2/12 | 2/12 | 1088 | 0/64 | 63 |
| Jamsetji Tata | 2/12 | 2/12 | 2/12 | 2/12 | 3231 | 0/52 | 45 |
| Rajaraja Chola I | 2/12 | 2/12 | 0/12 | 0/12 | 1244 | 0/53 | 27 |
| Agastya | 3/12 | 3/12 | 1/12 | 1/12 | 1995 | 0/34 | 42 |
| Ashoka | 3/12 | 3/12 | 1/12 | 1/12 | 1087 | 0/53 | 46 |

## Per tested skill

| Skill | Strict pass | Retrieval | Citation support |
|---|---:|---:|---:|
| identity | 13/25 | 13/25 | 13/25 |
| major_contributions | 7/25 | 7/25 | 7/25 |
| works_or_teachings | 0/25 | 3/25 | 3/25 |
| chronology | 1/25 | 1/25 | 1/25 |
| citation_precision | 3/25 | 3/25 | 3/25 |
| relationships | 0/25 | 1/25 | 1/25 |
| primary_text_interpretation | 16/25 | 16/25 | 9/25 |
| competing_interpretations | 0/25 | 4/25 | 4/25 |
| incomplete_evidence | 0/25 | 0/25 | 0/25 |
| unsupported_premise | 24/25 | 24/25 | 1/25 |
| multi_source_reasoning | 1/25 | 4/25 | 4/25 |
| limits_and_misconceptions | 0/25 | 0/25 | 0/25 |

## Failure interpretation

Most failures are clean abstentions caused by retrieval failure or missing corpus coverage, not hallucinated answers. That behavior is safer than unsupported synthesis, but it is not demo-ready completeness. The full response, citations, latency, outcome, and failure labels for every item are stored in `artifacts/quality-sprint/evaluation-results.json`.
