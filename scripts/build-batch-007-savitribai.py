"""Claim-level decisions checked against Narake's NCERT memorial-lecture essay."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "artifacts/corpus-verification"
URL = "https://www.ncert.nic.in/pdf/publication/otherpublications/Memorial-Lectures-Series/FINAL%20COVER%20OF%20SAVIRTIBAI%20PHULE.pdf"
originals = {json.loads(line)["claim_id"][:8]: json.loads(line) for line in (ROOT / "decision-ledger.jsonl").read_text().splitlines()}

# prefix, PDF pages (zero based), decision, revised wording, epistemic type, rationale
rows = [
 ("25c136e6", "PDF pp. 10–11, lines 300–311", "REVISE AND APPROVE", "Hari Narake cites government records for Jyotirao Phule's education of Savitribai at home after marriage and an 1851 Bombay Guardian report concerning her further education; he also records her teacher training in Ahmednagar and Pune.", "SCHOLARLY_ATTRIBUTION", "The original conflated government records with the newspaper report. Narake distinguishes them."),
 ("7ac96059", "PDF p. 10, lines 300–315", "APPROVE", None, "SCHOLARLY_ATTRIBUTION", "Narake explicitly describes training at Farrar's institution and Mitchell's Normal School; the claim attributes the account."),
 ("8787018f", "PDF cover p. 0, line 48; essay pp. 25–26, lines 875–887", "REVISE AND APPROVE", "Hari Narake's essay dates Savitribai Phule's death during plague relief to 10 March 1897, while the cover chronology of the same NCERT booklet says 19 March; the discrepancy requires checking against a contemporary death record.", "CONTESTED", "The conflict is visible within the inspected NCERT booklet. The original's separate university biography agreement was not checked here and is omitted."),
 ("ba565e39", "PDF p. 10, lines 293–295", "APPROVE", None, "HISTORICAL_FACT", "Narake directly supplies the date and village; the surrounding western-India context follows the documented school activity."),
 ("b24333d3", "PDF p. 19, lines 621–645", "APPROVE", None, "SCHOLARLY_ATTRIBUTION", "The historian's account directly describes the widow shelter, childbirth assistance and care for children."),
 ("d0445e5b", "PDF pp. 25–26, lines 868–887", "APPROVE", None, "SCHOLARLY_ATTRIBUTION", "Narake directly describes Yeshwant's hospital and Savitribai bringing patients there."),
 ("67488e84", "PDF p. 22, lines 750–755", "APPROVE", None, "SCHOLARLY_ATTRIBUTION", "The passage records the marriage pledge of education and equal rights for women."),
 ("a4cabecf", "PDF pp. 21–22, lines 726–740", "APPROVE", None, "SCHOLARLY_ATTRIBUTION", "Narake directly describes priestless, low-cost marriages without dowry."),
 ("506dddf0", "PDF p. 10, lines 309–315", "APPROVE", None, "SCHOLARLY_INTERPRETATION", "The wording names Narake and qualifies his interpretive claim about public life."),
 ("7bfdd484", "PDF pp. 13–14, lines 420–435", "APPROVE", None, "SCHOLARLY_ATTRIBUTION", "Narake reports the archival application and the three named schools with 1851–52 dates."),
 ("944f6918", "PDF pp. 21–22, lines 726–740", "APPROVE", None, "SCHOLARLY_ATTRIBUTION", "The passage says Savitribai inspired the first marriage and bore its expenses, and dates it 25 December 1873."),
 ("b3a996c1", "PDF p. 25, lines 837–869", "APPROVE", None, "SCHOLARLY_ATTRIBUTION", "The passage explicitly says she led the movement after Jyotirao's death and chaired its 1893 conference."),
 ("86c4920b", "PDF pp. 6–7, lines 150–170, 183–187", "APPROVE", None, "MODERN_RECEPTION", "NCERT states the memorial series' educational recognition purpose and lists Savitribai's lecture."),
 ("263c076a", "PDF p. 16, lines 518–537", "APPROVE", None, "SCHOLARLY_ATTRIBUTION", "Narake reports poverty and disinterest as drop-out causes, with practical financial and curriculum responses."),
 ("2f80f915", "PDF p. 16, lines 527–537", "APPROVE", None, "SCHOLARLY_ATTRIBUTION", "The passage reports community outreach and parent literacy; the claim's causal phrasing is a bounded interpretation of those practices."),
 ("8391cad4", "PDF p. 16, lines 518–526", "APPROVE", None, "TEXTUAL_ASSERTION", "Narake reproduces the 1852 report's proposed industrial department and its stated purpose."),
 ("868f69cb", "PDF p. 16, lines 518–526", "APPROVE", None, "SCHOLARLY_ATTRIBUTION", "The passage explicitly attributes vocational education and self-reliance to both Phules."),
 ("c88fb96f", "PDF pp. 14–15, lines 430–435 and 473–484", "APPROVE", None, "HISTORICAL_FACT", "The archival reports as cited identify her as headmistress and describe her unpaid school work."),
 ("e71d639e", "PDF pp. 16–17, lines 544–557", "APPROVE", None, "SCHOLARLY_ATTRIBUTION", "Narake states the right/wrong and truth/untruth ideal and describes encouragement of creativity."),
 ("6e42d0c1", "PDF p. 13, lines 401–409", "REVISE AND APPROVE", "Hari Narake describes Jyotirao Phule visiting Farrar's existing girls' school at Ahmednagar before beginning the Phules' school work in Pune; a claim that they founded India's first girls' school needs this qualification.", "SCHOLARLY_ATTRIBUTION", "The inspected passage directly establishes an earlier girls' school in Ahmednagar; the revised wording avoids an unqualified national first."),
 ("56a15ec9", "PDF p. 5, lines 136–149", "APPROVE", None, "TEXTUAL_ASSERTION", "The adapted poem directly addresses Shudras and Ati-Shudras and links English learning with escaping caste authority; adaptation status is preserved."),
 ("5d478bab", "PDF p. 27, lines 931–947", "APPROVE", None, "HISTORICAL_FACT", "Narake dates the anthology to 1854 and describes its subject range."),
 ("789ce60a", "PDF p. 1, lines 51–81", "APPROVE", None, "TEXTUAL_ASSERTION", "The NCERT adaptation directly compares knowledge and riches and urges study; the claim distinguishes adaptation from Marathi original."),
]

decisions = []
for prefix, locator, decision, revised, kind, rationale in rows:
    original = originals[prefix]
    assert original["personality"] == "Savitribai Phule" and original["decision"] is None
    decisions.append({
        "claim_id": original["claim_id"], "personality": original["personality"],
        "original_claim_text": original["original_claim_text"], "decision": decision,
        "final_proposed_wording": revised or original["original_claim_text"],
        "epistemic_type": kind,
        "evidence_references": [{"source_id": original["original_source_ids"][0], "url": URL,
            "locator": locator, "source_authority": "NCERT 2009 memorial booklet; historian Hari Narake's essay or reproduced source text, full PDF inspected 2026-10-19",
            "independence_assessment": "One scholarly source work, sometimes quoting archival material; its reproduced records are not counted as independent corroboration without the archival originals.",
            "original_source_inspected": True}],
        "verification_rationale": rationale, "original_source_inspected": True,
        "material_limitation": "NCERT booklet is a retrospective secondary account; archival originals and conflicting dates require separate checking for broader claims.",
        "removal_reason": None,
    })
assert len(decisions) == 23 and len({d["claim_id"] for d in decisions}) == 23
(ROOT / "batch-007-decisions.json").write_text(json.dumps(decisions, ensure_ascii=False, indent=2) + "\n")
print("wrote 23 source-checked Savitribai decisions; two group claims remain pending")
