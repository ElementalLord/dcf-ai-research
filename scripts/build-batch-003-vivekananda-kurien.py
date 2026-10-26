#!/usr/bin/env python3
"""Materialize source-checked Belur Math and Kurien institutional-source decisions."""

import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "artifacts/corpus-verification"
EXPORT = ROOT / ".corpus-cache/exports/dcf-claims-independent-review-2026-10-18.zip"
BELUR = "https://belurmath.org/swami-vivekananda/"
WFP = "https://www.worldfoodprize.org/index.cfm/87428/40143/the_world_food_prize_pays_tribute_to_1989_laureate_dr_verghese_kurien"
NDDB = "https://www.nddb.coop/about/chairman/vkurien"
AMUL = "https://www.amuldairy.com/dr_kurien.php"
SPEECH = "https://drkurien.com/october-17-1989/"

# ID prefix, source URL, source location, decision, epistemic type, revised wording,
# evidence-specific rationale, and any material limitation.
ASSESSMENTS = [
    ("2956ea6c", BELUR, "Awakening His Countrymen, lines 175–179", "APPROVE", "HISTORICAL_FACT", None,
     "The Order's biography directly dates the return and describes lectures about religion and uplift.", None),
    ("be3364aa", BELUR, "Early life, line 143", "APPROVE", "HISTORICAL_FACT", None,
     "Belur Math explicitly records an association with the Brahmo movement; the claim attributes the record to Belur Math.", None),
    ("0322cc9d", BELUR, "Biography, lines 141–143, 152–154, 171–185", "REVISE AND APPROVE", "SCHOLARLY_INTERPRETATION",
     "Belur Math's biography presents Vivekananda as a monk and Vedanta lecturer who travelled internationally and helped establish the Ramakrishna Mission and Belur Math.",
     "The original broad vocational synthesis was narrowed to the institution's documented biography.", "Institutional biography is a participant account; impact claims would need independent assessment."),
    ("1b080ff0", BELUR, "Early life, line 143", "APPROVE", "HISTORICAL_FACT", None,
     "The biography directly reports Calcutta University graduation and study of Western philosophy and history.", None),
    ("510eec4d", BELUR, "Early life, line 142", "APPROVE", "HISTORICAL_FACT", None,
     "The Order gives the pre-monastic name, Kolkata birthplace, and 12 January 1863 date.", None),
    ("d389f5b2", BELUR, "Discovery of Real India, lines 158–162", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "The biography links travel with concern for poverty, practical education, and confidence in the masses; the claim attributes that reading to Belur Math.", "This is the Order's interpretation of his motives."),
    ("ef6ba99b", BELUR, "Beginnings of a Monastic Brotherhood, lines 152–154", "APPROVE", "HISTORICAL_FACT", None,
     "The biography dates Ramakrishna's death to 1886 and describes the Baranagar community formed afterward.", None),
    ("ab8e3fcc", BELUR, "Founding of Ramakrishna Mission, lines 181–183", "APPROVE", "HISTORICAL_FACT", None,
     "The founding date and monks-and-lay-members purpose are explicit in the institution's own history.", None),
    ("d14c737b", BELUR, "Belur Math, lines 184–186", "APPROVE", "HISTORICAL_FACT", None,
     "Belur Math records his 1898 acquisition of Belur land for a permanent monastic home.", None),
    ("e5f3862e", BELUR, "Discovery of Real India, lines 159–164", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "The biography expressly combines secular education, spiritual teaching, and self-confidence in its account of his programme.", "Attributed Order account; not independent proof of social impact."),
    ("97902d17", BELUR, "With Sri Ramakrishna, lines 145–147", "APPROVE", "TRADITIONAL_NARRATIVE", None,
     "Belur Math recounts the question and response; the claim properly marks this as the Order's account.", "The reported dialogue is not independently contemporaneously attested here."),
    ("9fc61920", BELUR, "With Sri Ramakrishna, line 145", "APPROVE", "TRADITIONAL_NARRATIVE", None,
     "The biography says an English professor first told Narendra about Ramakrishna, and the claim preserves that attribution.", "This is the Order's retrospective account."),
    ("af02de58", BELUR, "With Sri Ramakrishna, lines 145–146", "APPROVE", "TRADITIONAL_NARRATIVE", None,
     "The biography describes Narendra's religious doubts before the meeting; the claim attributes the account.", "Inner state is known through retrospective testimony."),
    ("c4d4ce8e", BELUR, "With Sri Ramakrishna, lines 145–147", "APPROVE", "TRADITIONAL_NARRATIVE", None,
     "Belur Math supplies November 1881 and the direct question; the claim explicitly says Belur Math dates the encounter.", "Other chronologies may place the first meeting differently; retain attribution."),
    ("fcc8401e", BELUR, "Beginnings of a Monastic Brotherhood, lines 152–154", "APPROVE", "TRADITIONAL_NARRATIVE", None,
     "The Order says Ramakrishna instructed Narendra to form a monastic order; attribution is explicit.", "Retrospective institutional tradition."),
    ("7206448f", SPEECH, "Acceptance speech, lines 9–23", "APPROVE", "TEXTUAL_ASSERTION", None,
     "Kurien's published acceptance speech explicitly credits collective contributors and dairy farmers over his own individual accomplishment.", "Speech is hosted by the Kurien memorial site; archival provenance of the transcript should be retained."),
    ("edecc47a", SPEECH, "Acceptance speech, lines 21–24", "REVISE AND APPROVE", "SCHOLARLY_INTERPRETATION",
     "Kurien argued that farmer-owned processing and direct marketing returned a greater share of the consumer's payment to dairy producers.",
     "The direct passage supports Kurien's stated economic rationale; the original unqualified causal conclusion was recast as his argument.", "The speech does not independently measure the size of the gain."),
    ("5542934d", WFP, "Background, line 41", "APPROVE", "HISTORICAL_FACT", None,
     "The award foundation's 2012 biographical tribute directly reports the 1940 science degree.", None),
    ("7f406348", WFP, "Background, line 41", "APPROVE", "HISTORICAL_FACT", None,
     "The tribute directly reports a government scholarship and Michigan State master's degree in 1948; Amul independently corroborates the institution and year.", None),
    ("810f1e3c", WFP, "Background, line 43", "APPROVE", "HISTORICAL_FACT", None,
     "The tribute names the Government Research Creamery in Anand and 1949; Amul gives an arrival date of 13 May 1949.", None),
    ("84a2f266", WFP, "Background, line 42", "APPROVE", "HISTORICAL_FACT", None,
     "The tribute explicitly identifies Jamshedpur engineering studies and nine months' Bangalore dairy training.", None),
    ("9ee5ecd9", WFP, "Background, lines 40–43", "APPROVE", "HISTORICAL_FACT", None,
     "The tribute gives Kerala and 26 November 1921, then places his dairy career in Anand; Amul independently gives Kozhikode and Anand.", None),
    ("fa8f0682", WFP, "Background, line 41", "APPROVE", "HISTORICAL_FACT", None,
     "The foundation's biography directly reports the 1943 mechanical-engineering bachelor's degree from Madras University.", None),
    ("01474b6e", WFP, "Achievements, lines 50–51", "REVISE AND APPROVE", "HISTORICAL_FACT",
     "After the Kaira cooperative's success, Prime Minister Lal Bahadur Shastri created the National Dairy Development Board in 1965 to replicate the model nationally.",
     "The tribute directly supports the sequence, prime minister, board, and year. The broad causal claim about government sponsorship was removed.", None),
    ("c49dd80e", NDDB, "Kurien biography, line 243", "APPROVE", "HISTORICAL_FACT", None,
     "NDDB directly records Kurien establishing IRMA in Anand in 1979 for cooperative management training and research; WFP tribute line 63 agrees.", None),
    ("e9171056", SPEECH, "Acceptance speech, lines 21–24 and 37", "REVISE AND APPROVE", "SCHOLARLY_INTERPRETATION",
     "Kurien described Operation Flood as a combination of farmer-owned cooperatives, professional management, processing, markets, and supportive policy, rather than an individual technological achievement.",
     "His own speech supplies the institutional synthesis; WFP tribute lines 48–56 independently describes the multi-actor programme. The original broader significance claim was narrowed and attributed.", "The magnitude of national impact requires separate evaluation."),
    ("3eca349c", WFP, "Award notice, lines 30–35; honors, line 60", "REVISE AND APPROVE", "HISTORICAL_FACT",
     "Kurien received the 1989 World Food Prize for his work on India's cooperative dairy-development system.",
     "The foundation directly records the award and stated basis. The original farmer-credit clause overlaps the separately retained speech claim 7206448f.", None),
    ("aead8773", WFP, "Honors, line 60", "APPROVE", "HISTORICAL_FACT", None,
     "The award foundation lists the 1999 Padma Vibhushan by name and year.", None),
    ("05942d45", WFP, "Achievements, lines 49–50", "APPROVE", "HISTORICAL_FACT", None,
     "The tribute directly describes an in-house processing plant and cooperative direct marketing at the Kaira union.", None),
]

with zipfile.ZipFile(EXPORT) as archive:
    originals = [json.loads(line) for line in archive.open("claims_audit.jsonl") if line.strip()]
assert len(ASSESSMENTS) == 29
output = []
for prefix, url, locator, decision, kind, wording, rationale, limitation in ASSESSMENTS:
    matches = [row for row in originals if row["claim_id"].startswith(prefix)]
    assert len(matches) == 1, prefix
    row = matches[0]
    expected_person = "Swami Vivekananda" if url == BELUR else "Verghese Kurien"
    assert row["personality_name"] == expected_person, prefix
    linked = [link for link in row["sources"] if link["source"].get("url", "").rstrip("/") == url.rstrip("/")]
    # Kurien's original WFP profile did not render in the live fetch. Accessible
    # foundation tribute, NDDB, Amul, and original speech were inspected instead.
    assert len(linked) == 1 if url == BELUR else len(linked) <= 1
    authority = "Ramakrishna Math and Mission's own biography; authoritative for institutional records, retrospective for reported dialogue" if url == BELUR else (
        "Kurien's published 1989 acceptance speech" if url == SPEECH else
        "National Dairy Development Board institutional biography" if url == NDDB else
        "World Food Prize Foundation's 2012 laureate tribute")
    output.append({
        "claim_id": row["claim_id"], "personality": row["personality_name"],
        "original_claim_text": row["claim_text"], "decision": decision,
        "final_proposed_wording": wording or row["claim_text"], "epistemic_type": kind,
        "evidence_references": [{"source_id": linked[0]["source_id"] if linked else None,
                                 "url": url, "locator": locator, "source_authority": authority,
                                 "independence_assessment": "Institutional participant account; independently corroborated only where rationale names another source." if url == BELUR else "Distinct original speech or institutional issuer account; additional institutional corroboration is named in the rationale where used.",
                                 "original_source_inspected": True}],
        "verification_rationale": rationale, "original_source_inspected": True,
        "material_limitation": limitation, "removal_reason": None,
    })
(WORK / "batch-003-decisions.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
print(f"Wrote {len(output)} source-checked Vivekananda/Kurien decisions")
