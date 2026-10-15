# Evaluation-suite validity and evidence-gap audit

Date: 2026-10-15
Audited suite: `rishi-quality-v1`
Replacement suite: `rishi-quality-v2`

## Question audit

- Valid questions unchanged: 297
- Malformed questions found and replaced: 3
- All replacements concern Verghese Kurien and the accidental artistic-template mismatch.
- No question was changed because the system failed it.
- No within-personality duplicate question was found.

## Failure categories

| Category | Count |
|---|---:|
| NO_LOCAL_EVIDENCE | 1 |
| EVIDENCE_EXISTS_NOT_APPROVED | 181 |
| APPROVED_EVIDENCE_NOT_RETRIEVED | 24 |
| RETRIEVED_BUT_INSUFFICIENT | 22 |
| QUESTION_PROBLEM | 3 |
| OTHER | 0 |

The map covers failed questions from the existing full run, with the five recent profiles replaced by their post-human-approval results. The three malformed v1 questions remain classified as `QUESTION_PROBLEM`; their v2 replacements have not been used to claim a corpus-quality change.

## Five-profile detail

| Personality | Q | Category | Exact missing topic or failure | Draft/review evidence | New evidence | Retrieval issue |
|---|---:|---|---|---|---|---|
| Adi Shankaracharya | 03 | RETRIEVED_BUT_INSUFFICIENT | Teaching evidence was retrieved, but secure works and disputed attributions were not fully distinguished. | Yes | No | No |
| Adi Shankaracharya | 04 | APPROVED_EVIDENCE_NOT_RETRIEVED | The approved eighth-century chronology and uncertainty claim did not rank sufficiently. | Yes | No | Yes |
| Adi Shankaracharya | 05 | APPROVED_EVIDENCE_NOT_RETRIEVED | Approved identity and chronology evidence exists but was not selected. | Yes | No | Yes |
| Adi Shankaracharya | 06 | EVIDENCE_EXISTS_NOT_APPROVED | Mandana Misra, predecessor traditions, and later Vedanta relationships remain draft. | Yes | No | No |
| Adi Shankaracharya | 07 | RETRIEVED_BUT_INSUFFICIENT | Textual evidence was retrieved, but the response crossed the intended primary-witness qualification boundary. | Yes | No | No |
| Adi Shankaracharya | 08 | RETRIEVED_BUT_INSUFFICIENT | Evidence was retrieved but did not produce the required qualified comparison. | Yes | No | No |
| Adi Shankaracharya | 09 | EVIDENCE_EXISTS_NOT_APPROVED | Chronology, sectarian identity, hagiography, and authorship uncertainties are documented in draft claims. | Yes | No | No |
| Adi Shankaracharya | 11 | APPROVED_EVIDENCE_NOT_RETRIEVED | Approved SEP and IEP-backed claims span multiple sources but did not support a completed synthesis. | Yes | No | Yes |
| Adi Shankaracharya | 12 | EVIDENCE_EXISTS_NOT_APPROVED | Hagiographic biography, exact dates, and broad authorship claims remain draft and reviewable. | Yes | No | No |
| Satyajit Ray | 03 | EVIDENCE_EXISTS_NOT_APPROVED | Major films, literature, music, design, and attribution limits are covered by draft claims. | Yes | No | No |
| Satyajit Ray | 04 | EVIDENCE_EXISTS_NOT_APPROVED | Education, career development, international recognition, and death chronology remain draft. | Yes | No | No |
| Satyajit Ray | 05 | APPROVED_EVIDENCE_NOT_RETRIEVED | Approved birth, background, and multi-role evidence exists but did not rank. | Yes | No | Yes |
| Satyajit Ray | 06 | EVIDENCE_EXISTS_NOT_APPROVED | Subrata Mitra, Bansi Chandragupta, Ravi Shankar, and film-society relationships remain draft. | Yes | No | No |
| Satyajit Ray | 07 | RETRIEVED_BUT_INSUFFICIENT | An original-work or contemporary-record passage was retrieved, but the answer exceeded the expected decline/qualification boundary. | Yes | No | No |
| Satyajit Ray | 08 | EVIDENCE_EXISTS_NOT_APPROVED | Humanism, realism, politics, collaboration, and reception interpretations remain draft. | Yes | No | No |
| Satyajit Ray | 09 | EVIDENCE_EXISTS_NOT_APPROVED | Draft claims explicitly separate Ray's stated method from later critical interpretation. | Yes | No | No |
| Satyajit Ray | 11 | APPROVED_EVIDENCE_NOT_RETRIEVED | Approved biography, film, and production evidence spans multiple sources but did not produce synthesis. | Yes | No | Yes |
| Satyajit Ray | 12 | EVIDENCE_EXISTS_NOT_APPROVED | Overclaims about sole authorship, scores, influence, and declared intent are covered by drafts. | Yes | No | No |
| Swami Vivekananda | 02 | EVIDENCE_EXISTS_NOT_APPROVED | Major teachings, yoga paths, service, and works remain mostly draft. | Yes | No | No |
| Swami Vivekananda | 03 | EVIDENCE_EXISTS_NOT_APPROVED | Secure works and teachings versus later interpretation need review of existing draft claims. | Yes | No | No |
| Swami Vivekananda | 04 | EVIDENCE_EXISTS_NOT_APPROVED | Travel, Brahmo setting, Ramakrishna chronology, and reception chronology remain draft. | Yes | No | No |
| Swami Vivekananda | 05 | APPROVED_EVIDENCE_NOT_RETRIEVED | Approved birth, pre-monastic identity, vocation, and institutional claims did not rank. | Yes | No | Yes |
| Swami Vivekananda | 06 | EVIDENCE_EXISTS_NOT_APPROVED | Ramakrishna, the early monastic brotherhood, and intellectual influences remain draft. | Yes | No | No |
| Swami Vivekananda | 08 | RETRIEVED_BUT_INSUFFICIENT | Competing Advaita and neo-Vedanta evidence was retrieved, but the response did not provide the required qualified comparison. | Yes | No | No |
| Swami Vivekananda | 09 | EVIDENCE_EXISTS_NOT_APPROVED | Existing contested-interpretation claims identify unresolved issues but remain unpublished. | Yes | No | No |
| Swami Vivekananda | 11 | APPROVED_EVIDENCE_NOT_RETRIEVED | Multiple approved claims and sources exist, but the multi-source synthesis did not retrieve them sufficiently. | Yes | No | Yes |
| Swami Vivekananda | 12 | EVIDENCE_EXISTS_NOT_APPROVED | Claims about overstatement, secrecy, hierarchy, and reception remain draft. | Yes | No | No |
| Vasistha | 02 | EVIDENCE_EXISTS_NOT_APPROVED | The Dharmasutra attribution, teachings, and broader textual associations remain unapproved. | Yes | No | No |
| Vasistha | 03 | EVIDENCE_EXISTS_NOT_APPROVED | Existing claims distinguish Rigvedic attribution, epic roles, and the Dharmasutra, but most remain outside publication. | Yes | No | No |
| Vasistha | 04 | APPROVED_EVIDENCE_NOT_RETRIEVED | The approved cross-layer synthesis directly addresses chronology and textual layers but did not rank. | Yes | No | Yes |
| Vasistha | 05 | APPROVED_EVIDENCE_NOT_RETRIEVED | Approved royal-priest and Rigvedic-attribution evidence exists but was not retrieved for this formulation. | Yes | No | Yes |
| Vasistha | 06 | EVIDENCE_EXISTS_NOT_APPROVED | The Vishvamitra conflict, reconciliation, royal counsel, and Rama relationships are extensively represented in needs-review claims. | Yes | No | No |
| Vasistha | 08 | NO_LOCAL_EVIDENCE | The corpus lacks strong scholarly evidence for two defensible interpretations of Vasistha's teachings and later reception. | No | Yes | No |
| Vasistha | 09 | EVIDENCE_EXISTS_NOT_APPROVED | The unresolved identity across Rigvedic and epic layers is present in the unapproved acaa016e claim. | Yes | No | No |
| Vasistha | 11 | APPROVED_EVIDENCE_NOT_RETRIEVED | Approved Vedic Heritage Portal and Ramayana evidence spans multiple sources but did not yield synthesis. | Yes | No | Yes |
| Vasistha | 12 | EVIDENCE_EXISTS_NOT_APPROVED | The cross-period continuous-biography warning remains unapproved. | Yes | No | No |
| Verghese Kurien | 02 | QUESTION_PROBLEM | The v1 question incorrectly asks an institution-builder about artistic contributions. | N/A | N/A | N/A |
| Verghese Kurien | 03 | QUESTION_PROBLEM | The v1 qualification question repeats the same artistic template mismatch. | N/A | N/A | N/A |
| Verghese Kurien | 04 | APPROVED_EVIDENCE_NOT_RETRIEVED | Approved education and Anand-arrival chronology exists but did not rank for the chronology wording. | Yes | No | Yes |
| Verghese Kurien | 06 | EVIDENCE_EXISTS_NOT_APPROVED | Tribhuvandas Patel, H. M. Dalaya, farmers, government, and professional-management relationships remain mostly draft. | Yes | No | No |
| Verghese Kurien | 08 | QUESTION_PROBLEM | The v1 question incorrectly asks about an artistic legacy rather than institutional legacy and Operation Flood impact. | N/A | N/A | N/A |
| Verghese Kurien | 09 | EVIDENCE_EXISTS_NOT_APPROVED | Independent evaluation, autonomy, distributional limits, and causal-attribution claims remain draft. | Yes | No | No |
| Verghese Kurien | 11 | APPROVED_EVIDENCE_NOT_RETRIEVED | Approved institutional and impact-limit claims span multiple sources but did not yield synthesis. | Yes | No | Yes |
| Verghese Kurien | 12 | EVIDENCE_EXISTS_NOT_APPROVED | Draft evidence addresses sole-hero narratives, government roles, poverty claims, and programme attribution limits. | Yes | No | No |

## Top ten knowledge gaps

| # | Personality | Missing topic | Questions | Existing evidence | Best next action |
|---:|---|---|---|---|---|
| 1 | Vasistha | Textual layers, attributed works, Vishvamitra relationship, and limits of a continuous biography | 02, 03, 04, 06, 08, 09, 11, 12 | Twenty needs-review claims plus one draft cover epic roles and identity limits; competing scholarly interpretations remain thin. | REVIEW_EXISTING_CLAIMS |
| 2 | Swami Vivekananda | Major teachings, yoga paths, service, works, lineage, and qualified reception | 02, 03, 04, 06, 08, 09, 11, 12 | A large passage-backed draft and needs-review set already covers these areas. | REVIEW_EXISTING_CLAIMS |
| 3 | Adi Shankaracharya | Secure corpus, disputed attribution, hagiography, interlocutors, and later Vedanta reception | 03, 04, 06, 07, 08, 09, 11, 12 | Strong SEP/IEP-backed draft claims exist; five broad claims are approved. | REVIEW_EXISTING_CLAIMS |
| 4 | Satyajit Ray | Major filmography, collaborators, craft, critical interpretation, and attribution limits | 03, 04, 06, 07, 08, 09, 11, 12 | Extensive passage-backed drafts cover films, design, music, collaborators, and interpretation. | REVIEW_EXISTING_CLAIMS |
| 5 | Verghese Kurien | Operation Flood phases, cooperative design, collaborators, institutions, and independently evaluated impact | 02, 03, 06, 08, 09, 11, 12 | Five claims are approved and a large draft set covers the remaining institutional and impact questions. | REVIEW_EXISTING_CLAIMS |
| 6 | A. P. J. Abdul Kalam | Technical leadership, SLV-III, missile programmes, institutions, and evidence-bounded legacy | 01, 02, 03, 05, 07, 08, 11 | Passage-linked claims exist but remain outside human approval. | REVIEW_EXISTING_CLAIMS |
| 7 | C. V. Raman | Raman effect, experimental method, institutional work, collaborators, and scientific legacy | 01, 02, 03, 05, 07, 08, 11 | A broad curated claim set exists but remains unapproved. | REVIEW_EXISTING_CLAIMS |
| 8 | Jagadish Chandra Bose | Radio/microwave research, plant-response experiments, instruments, priority limits, and institutions | 01, 02, 03, 05, 07, 08, 11, 12 | Curated claims span the relevant scientific framework but remain unapproved. | REVIEW_EXISTING_CLAIMS |
| 9 | M. S. Subbulakshmi | Musical formation, repertoire, landmark performances, collaborations, service, and reception | 01, 02, 03, 05, 06, 07, 08, 11 | A large multi-lens claim set exists but has not crossed the publication boundary. | REVIEW_EXISTING_CLAIMS |
| 10 | Ashoka | Edicts, dhamma, governance, chronology, political context, and contested legacy | 01, 02, 03, 04, 05, 07, 08, 11 | Local passages and candidate claims exist, but the evaluation run had no human-approved claim base. | REVIEW_EXISTING_CLAIMS |

## Validation

- Personalities: 25
- Questions: 300
- Exactly 12 per personality: yes
- Duplicate IDs: 0
- Replacement smoke test: all three corrected Kurien questions executed with zero technical errors; results were not folded into the corpus-quality counts above.
