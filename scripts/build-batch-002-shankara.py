#!/usr/bin/env python3
"""Materialize manually assessed SEP/IEP Shankara decisions with stable claim IDs."""

import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "artifacts/corpus-verification"
EXPORT = ROOT / ".corpus-cache/exports/dcf-claims-independent-review-2026-10-18.zip"
SEP = "https://plato.stanford.edu/entries/shankara/"
IEP = "https://iep.utm.edu/advaita-vedanta/"
HINDU = "https://iep.utm.edu/hindu-ph/"
UPANISADS = "https://iep.utm.edu/upanisad/"
SANSKRIT = "https://sanskritdocuments.org/doc_giitaa/gItAshAMkarabhAShya.pdf"

# Each row is an individual passage-level judgment after inspecting both full entries.
# Format: ID prefix, source, locator, disposition, type, final wording if revised,
# rationale, material limitation or removal reason.
ASSESSMENTS = [
    ("6eedc4ab", SEP, "Life and Works, line 44", "REVISE AND APPROVE", "CONTESTED",
     "Scholarly datings of Shankara differ: proposed ranges include 788–820 CE, 700–750 CE, and the late seventh to early eighth centuries.",
     "SEP enumerates the three dating proposals. The internal corpus-policy sentence was removed; none of these ranges is treated as settled.", None),
    ("110d5f9b", IEP, "History, lines 23–24; Brahman/Jiva section, lines 40–43", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "IEP identifies the two later schools and their differing accounts of avidya; the warning against projecting later positions backward follows the chronology.", None),
    ("6146df78", IEP, "History, lines 22–23", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "IEP directly contrasts Mandana Misra's greater accommodation of knowledge and works with Shankara's knowledge-only position.", None),
    ("d51d4e9b", IEP, "Introduction, line 3; History, line 19", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "IEP explicitly states Advaita's origins predate Shankara; SEP Life and Works line 48 independently calls him a systematizer.", None),
    ("da6ebdd0", SEP, "Introduction, line 18; Life and Works, lines 57–59", "APPROVE", "MODERN_RECEPTION", None,
     "SEP documents continuing influence on contemporary lineages, while separating present reception from disputed early biography.", None),
    ("fb507cbb", SEP, "Introduction, line 18; Life and Works, line 48", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "SEP uses the authoritative/influential characterization and expressly says Shankara did not found Advaita.", None),
    ("4ec3c901", SEP, "Life and Works, lines 45–46", "APPROVE", "TRADITIONAL_NARRATIVE", None,
     "SEP places the Kaladi birth story in centuries-later hagiographies and says dependable biographical records are lacking.", None),
    ("6037e150", SEP, "Life and Works, line 44", "REMOVE FROM ACTIVE CORPUS", "CONTESTED", None,
     "The underlying date uncertainty is supported, but this record repeats the chronology already retained in claim 6eedc4ab.", "duplicate or malformed record"),
    ("6ef8c100", SEP, "Life and Works, lines 45–47 and 57", "REVISE AND APPROVE", "SCHOLARLY_INTERPRETATION",
     "The Shankaravijaya biographies were composed centuries after Shankara's death; their accounts of his birthplace, travels, and debates are hagiographical traditions.",
     "SEP supports the late composition and listed biographical narratives. The original reference to miracles lacked a pinpoint in this entry and was removed.", None),
    ("711cf2d2", SEP, "Introduction, lines 17–18; Life and Works, lines 44–46", "REMOVE FROM ACTIVE CORPUS", "SCHOLARLY_INTERPRETATION", None,
     "The statement is supported but duplicates the retained chronology and intellectual-significance records without a distinct proposition.", "duplicate or malformed record"),
    ("7ea0f689", SEP, "Life and Works, line 45", "APPROVE", "METHODOLOGICAL", None,
     "SEP directly states the absence of dependable life records apart from sparse clues in Shankara's writings.", None),
    ("967e920a", SEP, "Life and Works, line 45", "APPROVE", "CONTESTED", None,
     "SEP directly contrasts the Shaiva traditional identity with scholarly Vaishnava arguments; the claim preserves disagreement.", None),
    ("3145b253", IEP, "Error, True Knowledge and Practical Teachings, lines 74–75", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "IEP says knowledge alone liberates and action prepares or purifies the mind; this matches the two-part proposition.", None),
    ("563b9b45", IEP, "Error, True Knowledge and Practical Teachings, lines 72–73", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "IEP enumerates the four qualifications and their role in the discipline associated with Shankara.", None),
    ("94339bed", SEP, "Introduction, line 17", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "SEP explicitly identifies listening, reflection, and contemplation as learning methods in his teaching system.", None),
    ("ae4b169c", IEP, "Error, True Knowledge and Practical Teachings, lines 74–75", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "IEP directly rejects knowledge-plus-action as a joint liberating cause and assigns action the preparatory role.", None),
    ("d5db24e8", SEP, "Introduction, line 18; Metaphysics, line 67; Methods, lines 202–204", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "SEP equates direct recognition with moksha and explains why action cannot newly produce an already present freedom.", None),
    ("44984def", SEP, "Life and Works, lines 46 and 57", "APPROVE", "TRADITIONAL_NARRATIVE", None,
     "SEP attributes the all-India narrative to hagiography and describes monastic foundations as purported, as the claim does.", None),
    ("04ab8e88", IEP, "Error, True Knowledge and Practical Teachings, lines 63–67", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "IEP locates adhyasa in the Brahma Sutra commentary preamble and defines it as superimposed identity or properties.", None),
    ("17f2e466", IEP, "Brahman, Jiva, Isvara, and Maya, line 31", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "IEP explicitly says consciousness is Brahman's nature rather than a property; this is a doctrinal account, not an empirical assertion.", None),
    ("24588828", IEP, "Error, True Knowledge and Practical Teachings, lines 63–65", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "IEP states that adhyasa requires a substratum and explains error as misapprehension of it.", None),
    ("42e1e4c3", IEP, "Introduction, lines 3–4", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "IEP gives the literal non-secondness rendering and denies the world's independent existence apart from Brahman.", None),
    ("60f530b0", IEP, "Brahman, Jiva, Isvara, and Maya, line 31", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "IEP directly characterizes Brahman as underlying reality and pure existence, consciousness, and bliss.", None),
    ("84b4c463", IEP, "Brahman, Jiva, Isvara, and Maya, line 40", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "IEP explicitly attributes beginningless avidya and the fruitless first-origin question to Shankara.", None),
    ("a85760f8", SEP, "Introduction, line 17; Life and Works, lines 54–55", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "SEP identifies systematic metaphysics, language, epistemology, and liberating pedagogy as distinctive features.", None),
    ("b7ccb18f", IEP, "Introduction, lines 4–6; Brahman, Jiva section, lines 34–36", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "IEP states the world is experienced and neither wholly real nor wholly unreal, with no independent ultimate existence.", None),
    ("d8f9f1b9", SEP, "Life and Works, lines 51–56; Methods, lines 202–204", "REVISE AND APPROVE", "SCHOLARLY_INTERPRETATION",
     "Shankara systematized nondual interpretation of the Upanishads and taught liberation through knowledge; many later works attributed to him have disputed authorship.",
     "SEP supports both the philosophical summary and authorship caution. The revised wording specifies the disputed attributions.", None),
    ("8f24c364", HINDU, "Vedanta, Bhedabheda, lines 234–240", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "IEP explicitly describes textual evidence for Bhedabheda-like pre-Shankara commentaries, noting that most are lost; the claim preserves the evidential qualifier.", None),
    ("d488392f", UPANISADS, "The Upanishads and Vedanta, lines 138–145", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "IEP distinguishes the three Vedanta branches and details Ramanuja's and Madhva's different objections to identity.", None),
    ("a2282d0d", UPANISADS, "The Upanishads and Vedanta, lines 140–141", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "IEP directly attributes the atman–brahman identity reading to Shankara.", None),
    ("00674e84", UPANISADS, "The Upanishads and Vedanta, lines 138–140", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "IEP names the canonical triad and the three major commentators; SEP Life and Works lines 50–52 independently identifies Shankara's commentaries.", None),
    ("28401dfa", SANSKRIT, "PDF title; HTML companion document information, lines 9651–9670", "APPROVE", "TEXTUAL_ASSERTION", None,
     "The live Sanskrit Documents PDF and companion metadata identify a text under the Shankara-bhashya title. This verifies repository labeling, not historical authorship.", "The volunteer transcription may not be reproduced for site promotion without permission; this claim uses metadata only."),
    ("62814db2", UPANISADS, "The Upanishads and Vedanta, lines 142–143", "APPROVE", "SCHOLARLY_INTERPRETATION", None,
     "IEP explicitly says Shankara treated the Upanishads as models for interpretive method, using literary criteria.", None),
]

with zipfile.ZipFile(EXPORT) as archive:
    originals = [json.loads(line) for line in archive.open("claims_audit.jsonl") if line.strip()]
assert len(ASSESSMENTS) == 33
output = []
for prefix, url, locator, decision, kind, wording, rationale, removal_reason in ASSESSMENTS:
    matches = [row for row in originals if row["claim_id"].startswith(prefix)]
    assert len(matches) == 1 and matches[0]["personality_name"] == "Adi Shankaracharya", prefix
    row = matches[0]
    linked = [link for link in row["sources"] if link["source"].get("url", "").rstrip("/") == url.rstrip("/")]
    assert len(linked) == 1 or (prefix == "d8f9f1b9" and not linked), prefix
    output.append({
        "claim_id": row["claim_id"],
        "personality": row["personality_name"],
        "original_claim_text": row["claim_text"],
        "decision": decision,
        "final_proposed_wording": wording or row["claim_text"],
        "epistemic_type": kind,
        "evidence_references": [{
            "source_id": linked[0]["source_id"] if linked else None, "url": url, "locator": locator,
            "source_authority": "Volunteer text repository; title and document metadata checked against the live PDF and companion page" if url == SANSKRIT else "Scholarly encyclopedia entry by a named professional philosopher; full live entry inspected 2026-10-19",
            "independence_assessment": "Repository label is not independent evidence of eighth-century authorship." if url == SANSKRIT else "Separate scholarly work from the database excerpt; SEP and IEP are distinct editorial works, though not assumed independent when repeating shared underlying scholarship.",
            "original_source_inspected": True,
        }],
        "verification_rationale": rationale,
        "original_source_inspected": True,
        "material_limitation": "Interpretive claims are attributed to the scholarly entry; primary commentary or an independent specialist study may refine details." if kind == "SCHOLARLY_INTERPRETATION" else (removal_reason if url == SANSKRIT else None),
        "removal_reason": removal_reason if decision == "REMOVE FROM ACTIVE CORPUS" else None,
    })
(WORK / "batch-002-decisions.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
print(f"Wrote {len(output)} evidence-checked Shankara decisions")
