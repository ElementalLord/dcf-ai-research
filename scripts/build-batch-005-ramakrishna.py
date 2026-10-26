"""Build independently inspected Ramakrishna source-group decisions.

The archive's Gospel URL is a table of contents. Every retained citation below
points instead to an inspected chapter and a supporting passage in that chapter.
The Gospel is a disciple's retrospective published record/translation, not an
independent transcript or proof of private religious experiences.
"""

import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "artifacts/corpus-verification"
ledger = {json.loads(line)["claim_id"][:8]: json.loads(line) for line in (root / "decision-ledger.jsonl").read_text().splitlines()}
intro = "https://www.ramakrishnavivekananda.info/gospel/introduction/"
gospel = "https://www.ramakrishnavivekananda.info/gospel/"

# prefix, verdict, replacement (None means exact original), type, citations,
# assessment of direct support and limitations. All URLs were opened and their
# cited passages inspected on 2026-10-19.
rows = [
    ("08cff6a7", "REVISE AND APPROVE", "In his introduction to The Gospel of Sri Ramakrishna, Swami Nikhilananda calls Ramakrishna the first religious prophet in recorded history to teach harmony among religions. This is the Order's retrospective devotional assessment, not an independently established priority claim.", "MODERN_RECEPTION", [(intro + "summary_of.htm", "lines 3–9"), (intro + "keshab.htm", "lines 3–7")], "The summary directly makes the superlative claim. The adjacent Keshab chapter says Keshab's harmony concept was deepened through contact with Ramakrishna, so the superlative cannot be adopted as an established historical ranking."),
    ("2d6d5273", "APPROVE", None, "TRADITIONAL_NARRATIVE", [(intro + "keshab.htm", "lines 3–7")], "Nikhilananda's Keshab chapter explicitly makes each comparison in the claim. The wording attributes these judgments to the Order."),
    ("53c4046e", "APPROVE", None, "TRADITIONAL_NARRATIVE", [(intro + "masters_method.htm", "lines 2–4")], "The Order's chapter contains both the teacher characterization and the reported guru/father/master saying. These remain attributed to that account."),
    ("7180fef3", "APPROVE", None, "TRADITIONAL_NARRATIVE", [(intro + "narendra.htm", "lines 8–15")], "The Order's retrospective narrative directly gives Narendra's age, Brahmo affiliation, song, reported private exchange, and reported reaction. The claim clearly says it is the Order's account."),
    ("b0d5d60d", "APPROVE", None, "TRADITIONAL_NARRATIVE", [(intro + "narendra.htm", "lines 20–22")], "The chapter directly recounts Narendra's skepticism, Ramakrishna's response, and the money-changer comparison. This is attributed retrospective narrative, not independent observation of private thoughts."),
    ("0f36dc1e", "REVISE AND APPROVE", "In a note to his English Gospel, translator Swami Nikhilananda explains Ramakrishna's phrase kamini-kanchan ('woman and gold') as 'lust and greed' and says he used 'woman' for the sex instinct when addressing male devotees.", "TEXTUAL_ASSERTION", [(gospel + "volume_1/01_master_and_disciple.htm", "translator's note 1, lines 243–246")], "The original translator note directly supports the account of Nikhilananda's explanation. The separate assertion about critics disputing it has been removed because this decision did not establish that with checked criticism."),
    ("1d81056a", "APPROVE", None, "HISTORICAL_FACT", [(gospel + "volume_2/52_after_the_passing_away.htm", "lines 4–12"), ("https://belurmath.org/surendra-nath-mitra/", "paragraph beginning 'After Sri Ramakrishna’s Maha Samadhi'"), ("https://belurmath.org/ramakrishna-math-baranagar/", "opening description")], "The disciple chronicle identifies the post-death Baranagore house and Surendra's rental support; the Order's separate Surendra and Baranagar pages directly identify it as the first monastery. These are institutionally related accounts rather than independent scholarly corroboration."),
    ("41d4823f", "APPROVE", None, "TEXTUAL_ASSERTION", [(gospel + "volume_2/34_bankim_chandra.htm", "6 December 1884 entry, lines 4 and 60–70")], "M.'s dated record directly states all three parts: selfless work as a path, difficulty in the present age, and the duty to seek refuge in God. This verifies what the Gospel records, not an independent verbatim transcript."),
    ("52dc3737", "REVISE AND APPROVE", "In M.'s Gospel record, Ramakrishna contrasts the jnani, who reaches Brahman through 'not this, not this', with the vijnani, who sees the steps and roof as made of the same materials and sees Brahman manifested as the universe and living beings.", "TEXTUAL_ASSERTION", [(gospel + "volume_1/03_visit_to_vidyasagar.htm", "5 August 1882 entry, lines 55–59")], "The Vidyasagar chapter directly supports the doctrinal contrast. Attribution to M.'s record was added so a theological position is not stated as an empirical fact."),
    ("9dfc87bf", "APPROVE", None, "TEXTUAL_ASSERTION", [(gospel + "volume_1/20_rules.htm", "entry preceding 23 March 1884, lines 74–76")], "The Gospel explicitly records this statement to Bhagavan Das, identified as a Brahmo devotee. The final clause is a transparent inference from the juxtaposition, not a claim that the prediction came true."),
    ("a22646cc", "APPROVE", None, "TEXTUAL_ASSERTION", [(gospel + "volume_1/03_visit_to_vidyasagar.htm", "5 August 1882 entry, lines 53–56")], "The dated Vidyasagar passage directly gives the food/body-consciousness premise and recommended servant/devotee stance. The claim says 'is recorded arguing', preserving its status as reported teaching."),
    ("bc2dadea", "APPROVE", None, "TEXTUAL_ASSERTION", [(gospel + "volume_1/04_advice_to_householders.htm", "13 August 1882 entry, lines 4–15")], "The dated Gospel section directly records the all-paths statement and roof/stairs/rope comparison. It is framed as what M. records, not an externally demonstrated religious proposition."),
    ("0886e626", "APPROVE", None, "TEXTUAL_ASSERTION", [(gospel + "volume_1/03_visit_to_vidyasagar.htm", "5 August 1882 entry, lines 3, 33–39")], "The Vidyasagar chapter supplies the date, the teaching about uttered scripture and Brahman, and Vidyasagar's reported reaction. The wording identifies it as a recorded exchange."),
    ("a4fcf4d2", "APPROVE", None, "TEXTUAL_ASSERTION", [(gospel + "volume_1/05_the_master_and_keshab.htm", "27 October 1882 entry, lines 4–5 and 165–169")], "M.'s dated steamboat account directly records the child/mother analogy and his statement about human gurus and disciples. The claim remains about what is recorded."),
    ("038f67fd", "APPROVE", None, "TRADITIONAL_NARRATIVE", [("https://belurmath.org/sri-sarada-devi/", "Leading the Sangha after the Master's Passing, lines 157–159")], "Belur Math directly reports the disciples' bringing Sarada Devi to Kolkata and her subsequent acceptance of seekers. The honorific and universal embrace are attributed to the institution."),
]

out = []
for prefix, decision, wording, kind, references, rationale in rows:
    original = ledger[prefix]
    assert original["personality"] == "Ramakrishna Paramahamsa" and original["decision"] is None
    evidence = []
    for url, locator in references:
        evidence.append({
            "source_id": None,
            "url": url,
            "locator": locator,
            "source_authority": "Swami Nikhilananda's published Gospel translation/introduction hosted on ramakrishnavivekananda.info, or Belur Math's institutional account; passage inspected 2026-10-19",
            "independence_assessment": "Institutional or disciple/translator account; directly supports attributed wording or textual content, but does not independently prove private experiences or verbatim nineteenth-century speech.",
            "original_source_inspected": True,
        })
    out.append({
        "claim_id": original["claim_id"],
        "personality": original["personality"],
        "original_claim_text": original["original_claim_text"],
        "decision": decision,
        "final_proposed_wording": wording or original["original_claim_text"],
        "epistemic_type": kind,
        "evidence_references": evidence,
        "verification_rationale": rationale,
        "original_source_inspected": True,
        "material_limitation": "Order/disciples' retrospective accounts are primary for the reported tradition and textual record, but are not independent corroboration of private events or the precision of historical dialogue.",
        "removal_reason": None,
    })

assert len(out) == 15 and len({r["claim_id"] for r in out}) == 15
(root / "batch-005-decisions.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {len(out)} individually checked Ramakrishna decisions")
