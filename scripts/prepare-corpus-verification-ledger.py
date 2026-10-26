#!/usr/bin/env python3
"""Build a conservative, resumable ledger from the audit and database export."""

import collections
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "artifacts/corpus-verification"
AUDIT = WORK / "audit"
EXPORT = ROOT / ".corpus-cache/exports/dcf-claims-independent-review-2026-10-18.zip"


def jsonl(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


audit = jsonl(AUDIT / "ALL_CLAIMS_EVIDENCE_AUDIT.jsonl")
with zipfile.ZipFile(EXPORT) as archive:
    original = [json.loads(line) for line in archive.open("claims_audit.jsonl") if line.strip()]

assert len(audit) == len(original) == 1585
by_id = {row["claim_id"]: row for row in original}
assert len(by_id) == 1585
assert {row["claim_id"] for row in audit} == set(by_id)

report_ids = []
for report in sorted(AUDIT.glob("*FULL-REVIEW.md")):
    report_ids += re.findall(r"^### \d+\. `([0-9a-f-]{36})`", report.read_text(), re.M)
assert len(report_ids) == len(set(report_ids)) == 1585
assert set(report_ids) == set(by_id)

decisions = [row for path in sorted(WORK.glob("batch-*-decisions.json")) for row in json.loads(path.read_text())]
decision_by_id = {row["claim_id"]: row for row in decisions}
receipt_path = WORK / "isolated-supabase-receipt.json"
if not receipt_path.exists():
    receipt_path = WORK / "isolated-review-db-receipt.json"
applied_ids = set(json.loads(receipt_path.read_text())["applied_claim_ids"]) if receipt_path.exists() else set()
assert len(decision_by_id) == len(decisions)
assert set(decision_by_id) <= set(by_id)
assert applied_ids <= set(decision_by_id)
allowed = {"APPROVE", "REVISE AND APPROVE", "REMOVE FROM ACTIVE CORPUS"}
allowed_types = {
    "TEXTUAL_ASSERTION", "TRADITIONAL_NARRATIVE", "HISTORICAL_FACT",
    "CONTEMPORARY_OBSERVATION", "SCIENTIFIC_PRIORITY", "CAUSAL_SIGNIFICANCE",
    "HISTORICAL_INFERENCE", "SCHOLARLY_ATTRIBUTION", "SCHOLARLY_INTERPRETATION",
    "SYNTHETIC_INTERPRETATION", "MODERN_RECEPTION", "NORMATIVE_RELEVANCE",
    "CONTESTED", "METHODOLOGICAL",
}
for decision in decisions:
    assert decision["decision"] in allowed
    assert decision["final_proposed_wording"]
    assert decision["epistemic_type"]
    assert decision["epistemic_type"] in allowed_types
    assert decision["evidence_references"]
    assert decision["verification_rationale"]
    if decision["decision"] == "APPROVE":
        assert decision["final_proposed_wording"] == by_id[decision["claim_id"]]["claim_text"]

rows = []
for audit_row in audit:
    claim_id = audit_row["claim_id"]
    source = by_id[claim_id]
    assert source["claim_text"] == audit_row["claim_text"]
    decision = decision_by_id.get(claim_id)
    rows.append({
        "claim_id": claim_id,
        "personality_id": source["personality_id"],
        "personality": audit_row["personality"],
        "original_claim_text": source["claim_text"],
        "original_review_status": source["current_status"],
        "original_approval_origin": source["approval_origin"],
        "original_source_ids": [entry["source_id"] for entry in source["sources"]],
        "original_passage_ids": [p["chunk_id"] for entry in source["sources"] for p in entry["passages"]],
        "audit_publication_gate": audit_row["safe_publication_gate"],
        "review_state": "evidence_assessed" if decision else "PENDING_ORIGINAL_SOURCE_REVIEW",
        "decision": decision["decision"] if decision else None,
        "final_proposed_wording": decision["final_proposed_wording"] if decision else None,
        "epistemic_type": decision["epistemic_type"] if decision else None,
        "evidence_references": decision["evidence_references"] if decision else [],
        "verification_rationale": decision["verification_rationale"] if decision else None,
        "original_source_inspected": decision.get("original_source_inspected", False) if decision else False,
        "material_limitation": decision.get("material_limitation") if decision else None,
        "removal_reason": decision.get("removal_reason") if decision else None,
        "applied_to_isolated_database": claim_id in applied_ids,
    })

output = WORK / "decision-ledger.jsonl"
with output.open("w") as file:
    for row in rows:
        file.write(json.dumps(row, ensure_ascii=False) + "\n")

counts = collections.defaultdict(lambda: collections.Counter())
for row in rows:
    counts[row["personality"]][row["decision"] or "PENDING"] += 1
summary = {
    "total": len(rows),
    "evidence_assessed": len(decisions),
    "pending": len(rows) - len(decisions),
    "decision_counts": dict(collections.Counter(row["decision"] or "PENDING" for row in rows)),
    "by_personality": {name: dict(counter) for name, counter in sorted(counts.items())},
    "applied_to_isolated_database": len(applied_ids),
}
(WORK / "progress-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps(summary, indent=2))
