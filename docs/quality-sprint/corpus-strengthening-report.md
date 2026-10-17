# Targeted corpus-strengthening sprint

Run date: 2026-10-14

## Scope and selection

The sprint touched only Swami Vivekananda, Adi Shankaracharya, Vasistha, Satyajit Ray, and Verghese Kurien. They were selected because identity or basic retrieval already worked in parts of the corpus, deeper questions repeatedly abstained, related failures clustered around a few reusable topics, and strong sources were already present in the Library.

| Personality | Main reusable gaps | Approved sources reused | Corpus change |
|---|---|---|---|
| Swami Vivekananda | Vocation; works and teachings; Ramakrishna; service; competing interpretations | Belur Math biography, Vivekananda primary texts, a contemporary newspaper report, and independent scholarship | 8 foundational passages cross-tagged; 2 passage-backed synthesis claims added as drafts |
| Adi Shankaracharya | Chronology; Advaita teaching; works; practice; hagiography versus history | Stanford Encyclopedia of Philosophy, Internet Encyclopedia of Philosophy, and the received *Bhagavadgita Sankarabhasya* text | 8 foundational passages cross-tagged; 2 passage-backed synthesis claims added as drafts |
| Vasistha | Rigvedic attribution; royal-priest role; Vishvamitra; textual layers; biography limits | Vedic Heritage Portal and approved *Valmiki Ramayana* passages | 8 foundational passages linked/cross-tagged; 2 passage-backed synthesis claims added as drafts |
| Satyajit Ray | Multi-role identity; major works; craft; collaboration; social interpretation | Ray estate/society biographies, BFI, Academy, and production-history material | 8 foundational passages cross-tagged; 2 passage-backed synthesis claims added as drafts |
| Verghese Kurien | Institution building; cooperative model; Operation Flood; collaborators; impact limits | World Food Prize, NDDB, Amul, Kurien's World Bank chapter, and independent World Bank evaluation | 8 foundational passages cross-tagged; 2 passage-backed synthesis claims added as drafts |

No new personality, retrieval behavior, evidence threshold, source-status decision, or claim approval was introduced. No live search was needed; the sprint reused approved Library sources. Ten synthesis claims remain `draft` and require human review.

## Human-review priorities

Review the two new broad synthesis claims for each personality first, followed by three existing foundational claims from the 300-claim queue:

- **Swami Vivekananda:** `0322cc9d`, `2f6bb48d`, then identity (`510eec4d`), Chicago address (`4efc52f0`), and Ramakrishna Mission (`ab8e3fcc`).
- **Adi Shankaracharya:** `711cf2d2`, `d8f9f1b9`, then Atman/Brahman (`a2282d0d`), listening-reflection-contemplation (`94339bed`), and knowledge/action (`ae4b169c`).
- **Vasistha:** `ea0757da`, `acaa016e`, then family-priest role (`20024701`), Rama's departure (`e05a95af`), and Rigveda 7.47 attribution (`a4bfc06c`).
- **Satyajit Ray:** `8ffbecea`, `bccf145e`, then identity/background (`bd38fcd8`), Apu Trilogy (`0bb2e3f5`), and *Charulata*/Tagore (`afe4c265`).
- **Verghese Kurien:** `e9171056`, `4b36a24a`, then Anand arrival (`810f1e3c`), technical formation (`fa8f0682`), and dairy/industrial training (`84a2f266`).

These are priorities, not approvals.

## Targeted evaluation: before versus after

Each existing 12-question subset was run before and after with local deterministic synthesis, zero external searches, and zero paid-model calls.

| Personality | Strict pass | Sufficient evidence | Passage-backed citations | Abstentions |
|---|---:|---:|---:|---:|
| Swami Vivekananda | 2 → 2 | 2 → 2 | 0 → 0 | 12 → 12 |
| Adi Shankaracharya | 1 → 1 | 2 → 2 | 2 → 2 | 10 → 10 |
| Vasistha | 3 → 3 | 3 → 3 | 1 → 1 | 11 → 11 |
| Satyajit Ray | 1 → 1 | 1 → 1 | 1 → 1 | 11 → 11 |
| Verghese Kurien | 5 → 5 | 5 → 5 | 3 → 3 | 9 → 9 |

The flat result is intentional evidence about the current publication boundary: passage cross-tagging and new draft synthesis claims do not make Ask use unapproved claims. The safety bar was not lowered to manufacture gains.

## Cleanup and remaining weaknesses

No duplicate records were deleted. The five exact-URL groups and eight normalized claim groups are outside these five profiles; merging them safely would require reference reassignment and review-history preservation, so cleanup would have exceeded this sprint's narrow scope.

The evaluation-registry migration remains unapplied and the checked-in snapshot fallback remains in place.

The main remaining weakness is publication readiness: the profiles have useful approved source passages but almost no approved foundational claims, and several questions require explicit cross-source or uncertainty-aware synthesis. The single best next step is human review of the 25 claims listed above, beginning with the 10 new broad synthesis claims, followed by another five-profile-only evaluation.
