# Savitribai Phule corpus — 11 October 2026

Added only Savitribai Phule (`7dd19728-dbbf-4288-a3ec-ddb57806b863`) through the generic DCF corpus pipeline. No personality-specific application behavior or redesign.

## Framework and corpus

Reusable **Educators and Social Reformers** (`educator_social_reformer`): background and education; schools and educational practice; institutions and collective work; caste, gender and social equality; partnerships and contemporaries; care and relief; writings and ideas; historical context; legacy; contested interpretations. Shared research vocabulary maps “gender inequality” to “discrimination against women” and “long-term impact” to “legacy”.

**9 sources, 47 claims.** Claims remain draft, with proposed epistemic types requiring review. Sources and verified original passages are AI-curated candidates admitted through the existing source approval workflow; no human approval is implied. Claims are not duplicated for lenses.

Sources: NCERT's first memorial lecture and Hari Narake's historical essay; three Mahatma Phule Chair university records (life/work, chronology, associates); Rosalind O’Hanlon's Cambridge chapter summary; attributed letters in modern English translation; Muktabai's translated 1855 pupil essay; Azim Premji University's graphic biography; Pune University's 2014–15 institutional quality report. Cambridge access covers the public chapter summary, not the full chapter.

Coverage includes early learning and marriage; partnership with Jyotirao; Bhidewada and later girls' schools; schooling of marginalized communities and adults; institutional pedagogy and access barriers; caste and gender reform; widows and infant care; resistance; Satyashodhak organizing and marriage practices; poetry and letters; famine and plague service; later educational recognition. Historical significance is framed around access to knowledge, women's public authority and challenges to caste exclusion in nineteenth-century western India.

Lenses: **Educational, Social, Cultural, Political, Institutional, Literary**. Gender uses the existing Cultural lens and social-equality field.

## Qualifications and gaps

- “First” teacher/school honorifics are qualified: the corpus recognizes pre-existing missionary schooling and distinguishes pioneering Indian-led work from absolute priority.
- The spare-sari harassment story is later biographical tradition, not independently verified contemporary testimony.
- Letters are attributed translations; English poems are adaptations. Muktabai's essay is a pupil's voice. Graphic dialogue is modern dramatization.
- NCERT's cover and essay disagree on the death date and widow-home chronology. Claims use the essay's 10 March 1897 death date and corroborated 1863 home date, retaining the discrepancy.
- *Bavankashi Subodh Ratnakar* is dated 1892 by NCERT and 1891 by the letters' modern editorial introduction; an edition check remains needed.
- The 1893 leadership account is distinguished from the more specific Saswad conference chairing account. Jyotirao's documented policies and household actions are not reassigned to Savitribai alone.

Remaining gaps: original Marathi editions and manuscripts; independent archival confirmation of particular anecdotes; fuller contemporary classroom evidence and later reception scholarship. No further search is needed for the present bounded corpus.

## Verification

Resources returns all 9 source records and 47 draft claims; its server-rendered personality list includes Savitribai. AI browser selection shows the six expected lens buttons. All five requested representative API questions returned HTTP 200 with complete answers and valid citation references, recorded in `savitribai-phule-ask-check-2026-10-11.json`. The initial caste/gender and impact abstentions were resolved through shared vocabulary and a complete original contextual passage, without changing the generic retrieval architecture.

Typecheck, production build, changed-file ESLint, and the focused lens/context tests passed (19 tests). The population dry-run verifies all 47 exact anchors. Re-running apply retains the same sources and claims.

Reproduce:

```sh
node scripts/populate-savitribai-phule.mjs
node scripts/populate-savitribai-phule.mjs --apply
```

An optional `--source-cache=/path/to/cache` uses original downloaded publications; filenames are listed in the dataset.
