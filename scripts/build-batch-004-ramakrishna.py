"""Record individually checked Ramakrishna claims from the Gospel introduction.

The introduction is a retrospective Ramakrishna Order account. Its index URL is
not itself passage evidence; each decision links the actual chapter inspected.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "artifacts/corpus-verification"
ledger = [json.loads(line) for line in (ROOT / "decision-ledger.jsonl").read_text().splitlines()]
originals = {row["claim_id"][:8]: row for row in ledger}
BASE = "https://www.ramakrishnavivekananda.info/gospel/introduction/"

# prefix, chapter, passage locator, decision, proposed wording, type, rationale
rows = [
    ("4a430925", "kali.htm", "lines 3, 10–11", "APPROVE", None, "TRADITIONAL_NARRATIVE", "The Order text directly gives the dedication date, founder, shrine dedication, and Ramkumar appointment. The wording already attributes the account."),
    ("ecc7fc2c", "boyhood.htm", "lines 5, 7, 13", "APPROVE", None, "TRADITIONAL_NARRATIVE", "The Order text directly supplies place, date, childhood name, and brahmin family context. This is its traditional biographical dating."),
    ("463a43cf", "christianity.htm", "lines 3–7", "APPROVE", None, "TRADITIONAL_NARRATIVE", "The chapter reports the date, Bible readings, and vision. The claim attributes the experience to the Order rather than establishing it independently."),
    ("6d6352c0", "totapuri.htm", "lines 2–3", "REVISE AND APPROVE", "Nikhilananda's Ramakrishna Order biography dates Totapuri's arrival at Dakshineswar to late 1864 and says he was perhaps born in Punjab.", "TRADITIONAL_NARRATIVE", "The inspected chapter supports the Order's account; the separate scholarly reference mentioned in the original wording was not checked for this decision, so that clause is removed."),
    ("71062ea0", "the_first_vision.htm", "lines 13–15", "APPROVE", None, "TRADITIONAL_NARRATIVE", "Nikhilananda explicitly presents Ramakrishna's later first-person recollection, including the sword and reported vision. The wording marks it as reported and not independently attested."),
    ("d3d4217a", "the_brahmani.htm", "lines 3–5, 20–21", "REVISE AND APPROVE", "The Ramakrishna Order's account says a Bhairavi Brahmani skilled in Tantric and Vaishnava practice reassured Ramakrishna about his visions, described his state as mahabhava, and later became his guru.", "TRADITIONAL_NARRATIVE", "The chapter directly supports the encounter and reported interpretation. An exact arrival year is not given on this page, so the date was removed."),
    ("f4e89c5c", "islam.htm", "lines 2–4", "APPROVE", None, "TRADITIONAL_NARRATIVE", "The chapter directly states the late-1866 practice, Muslim guide, changed observances, three-day period, and vision; its own 'perhaps' is retained."),
    ("c387e462", "last_days.htm", "lines 22–23", "APPROVE", None, "TRADITIONAL_NARRATIVE", "The Order narrative directly reports the ochre cloth and interprets it as laying the monastic order's foundation. This is an attributed institutional account."),
    ("ad245e15", "last_days.htm", "lines 37–38", "REVISE AND APPROVE", "The Ramakrishna Order's account says Ramakrishna told Narendra at Cossipore that he had given him all he possessed spiritually; the account presents this as a transmission during samadhi.", "TRADITIONAL_NARRATIVE", "The inspected chapter records the speech and interpretation. The original's assertion about scholars and official accounts was not verified here and is omitted."),
    ("db679fec", "the_brahmani.htm", "lines 7–13", "APPROVE", None, "TRADITIONAL_NARRATIVE", "The text directly reports the Brahmani's avatar proclamation, Vaishnavcharan's agreement, and Ramakrishna's reported response; all are attributed."),
    ("e33d7beb", "marriage.htm", "lines 3–5", "REVISE AND APPROVE", "Nikhilananda's Ramakrishna Order biography says Ramakrishna married Saradamani of Jayrambati when she was five and describes their marriage as permanently unconsummated.", "TRADITIONAL_NARRATIVE", "The Order chapter supports the description. The original's claim of scholarly corroboration was not verified for this decision and is removed; the private-life assertion remains explicitly attributed."),
    ("e76a77c7", "relation_with_wife.htm", "lines 3, 8–11", "APPROVE", None, "TRADITIONAL_NARRATIVE", "The chapter reports Sarada's 1872 arrival, the worship ceremony, the reported samadhi, and the Order's spiritual interpretation. The wording preserves attribution."),
    ("9a849445", "totapuris_lesson.htm", "paragraph beginning 'After the departure of Totapuri'", "APPROVE", None, "TRADITIONAL_NARRATIVE", "The chapter quotes Ramakrishna's reported six-month recollection. The wording correctly identifies an unverified subjective state."),
]

decisions = []
for prefix, chapter, locator, decision, proposed, kind, reason in rows:
    original = originals[prefix]
    assert original["personality"] == "Ramakrishna Paramahamsa" and original["decision"] is None
    decisions.append({
        "claim_id": original["claim_id"],
        "personality": original["personality"],
        "original_claim_text": original["original_claim_text"],
        "decision": decision,
        "final_proposed_wording": proposed or original["original_claim_text"],
        "epistemic_type": kind,
        "evidence_references": [{
            "source_id": None,
            "url": BASE + chapter,
            "locator": locator,
            "source_authority": "Swami Nikhilananda's retrospective introduction to The Gospel of Sri Ramakrishna, hosted by the Ramakrishna Order; original chapter inspected 2026-10-19",
            "independence_assessment": "Institutional devotional account; direct evidence for what the Order says, not independent corroboration of reported private or mystical events.",
            "original_source_inspected": True,
        }],
        "verification_rationale": reason,
        "original_source_inspected": True,
        "material_limitation": "Retrospective institutional account; private and mystical events cannot be independently established from this source alone.",
        "removal_reason": None,
    })

assert len(decisions) == 13
(ROOT / "batch-004-decisions.json").write_text(json.dumps(decisions, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {len(decisions)} individually checked decisions")
