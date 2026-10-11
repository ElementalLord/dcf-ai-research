# Rani Lakshmibai population — 2026-10-11

Personality: `26758dfe-ffe6-4c2c-b6c5-682353713af3`, **Rani Lakshmibai of Jhansi**.

## Scope and result

- Reused `political_leader` / **Monarchs and Political Leaders** and ten existing fields. No new category, personality-specific application branch, migration, or retrieval system.
- Added **13 source records and 53 explanatory draft claims**. The thirteenth source supplies essential scholarly regency and military-authority context; several records are chapters/pages within the same publication, not independent corroboration.
- Sources carry `ai_candidate` provenance; source evidence is available to Ask. Claims remain `draft`, with proposed epistemic types requiring review. No mentor or human approval was simulated.
- Linked original passages to the personality, shared fields, claims, and sources. Historical/gender/reception evidence is reused across fields. Competing responsibility and death-date claims link both accounts.
- Political, Military, Administrative, Social, and Cultural lenses appear normally. Cultural questions now recognize gender, historical reputation, and legacy wording. Colonial/historical questions use the shared context and interpretation fields.

Resources → Web search now displays:

> Live web research is currently off because search is limited to approved sources and no sources are approved.

**Review search mode** focuses the existing selector. The condition uses all saved rules, not a filtered list, and excludes blocked/paused rules from the allowed count. It does not change the setting. The actual policy remains `approved_domains_only` with **zero allowed domains**.

## Evidence inventory

| Record | Evidence and access |
| --- | --- |
| District Jhansi, History | Royal marriage in 1842 and state/succession context |
| District Jhansi, Palace of Rani Lakshmi Bai | John Lang and legal resistance in 1854; court authority |
| NCERT, From Trade to Territory | Dalhousie, annexations, Doctrine of Lapse, Jhansi in 1854; text PDF |
| NCERT, When People Revolt | Wider uprising, Meerut, Nana Saheb, Tantia Tope, Begum Hazrat Mahal, Crown rule; text PDF |
| R. C. Majumdar, The Sepoy Mutiny and the Revolt of 1857 (1957), IGNCA | Short transcriptions visually checked on printed pp. 147–155; original PDF SHA-256 recorded |
| Hugh Rose, Jhansi dispatch, London Gazette (1858) | Original text PDFs, pp. 3358–3361: mobilization, defense, artillery, women, relief attempt, escape, partisan accusations |
| Hugh Rose, Kalpi dispatch, London Gazette (1859 publication of 1858 report) | Original text PDF, p. 1595: coalition, logistics, political/military significance |
| National Army Museum, Decisive events | Gwalior, Scindia's troops, 17 June death date; treated as modern military interpretation |
| The Leader, 31 July 1858, university-hosted NCSE archive | Original archive transcript: 18 June death date and restoration of Gwalior ruler; short public-domain snapshot, runtime fetch intermittent |
| Harleen Singh, Introduction (2014) | Public Cambridge chapter summary: regency denied and forces reorganized; complete dated contextual paragraph |
| Harleen Singh, India's Aryan Queen (2014) | Public Cambridge chapter summary: contradictory, racialized and sexualized British literary portrayals |
| Prachi Deshpande, Making of an Indian Nationalist Archive (2008) | Peer-reviewed article's public abstract: Marathi/Hindi narratives, regional projects, nationalist womanhood |
| S. R. Nathan, foreword to Women Against the Raj (2008), ISEAS | Public institutional summary: INA women's regiment and later invocation of Lakshmibai |

URLs and exact anchors are in `data/lakshmibai-corpus.mjs`. Public summaries/abstracts are not represented as access to full scholarly chapters. The scanned history was transcribed locally; transcriptions from different pages are never concatenated into an evidence passage.

## Coverage and contested areas

Covered: Manikarnika/royal marriage; Company expansion and adopted succession; June 1857 killings and administrative crisis; Erskine's provisional recognition; Orchha conflict; March–April 1858 defense and escape; Kalpi coalition; Gwalior and June 1858 death; military organization, political authority, women in defense, colonial portrayals, nationalist literature and INA commemoration.

The corpus distinguishes Lakshmibai's reported coercion, British accusations, and Majumdar's later exonerating interpretation. It does not declare her responsibility for the killings settled. The exact death day remains **17 versus 18 June**, attributed to the respective sources. The museum's simplified Kalpi chronology also differs from the original Gazette report; the corpus uses the Gazette's attributed **24 May** date rather than silently reconciling them.

Remaining gaps: detailed early-life chronology and disputed birth year; broader evidence about royal-women's everyday social expectations; specific poetry and post-independence commemorations. These were not filled with biography-site folklore or invented quotations.

## Verification

- Dry-run verified every claim anchor before writes; later idempotent runs added no duplicate claims.
- Authenticated Resources API: 13 sources, 53 claims, all drafts, with epistemic proposals. Resources page includes the personality.
- Browser: personality selectable in AI; five shared lens buttons visible.
- Five distinct requested Ask questions returned HTTP 200, `complete`, and cited answers. Selected questions were repeated only to repair observed failures. See `lakshmibai-ask-check-2026-10-11.json`.
- Initial clipped excerpts lost attribution/context and the novelty question abstained. Complete original sentences, the dated introduction, cross-field links, and shared context/leadership vocabulary corrected this. A one-word shared framing correction prevents `unusual` from being treated as a required literal fact.
- Typecheck, changed-file ESLint, production build, and the focused context/lens suite (19 tests) passed. No large benchmark was run.

## Reproduction

`node scripts/populate-lakshmibai.mjs` verifies originals without writing. Add `--apply` to populate through the existing Supabase schema. Optional `--source-cache=/path/to/downloads` uses previously downloaded originals with filenames specified in the dataset. The scanned PDF must match its recorded hash. The original NCSE transcript snapshot is explicitly disclosed. The runner preserves superseded excerpts for provenance and excludes them from Ask; it does not disable shared chunks used by another personality.
