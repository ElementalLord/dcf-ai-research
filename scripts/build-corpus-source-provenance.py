#!/usr/bin/env python3
"""Summarize inspected works and exact claim-to-passage locators for review."""

import json
from collections import defaultdict
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "artifacts/corpus-verification"
decisions = [row for path in sorted(root.glob("batch-*-decisions.json")) for row in json.loads(path.read_text())]
works = defaultdict(lambda: {"claim_ids": set(), "passages": []})
for row in decisions:
    for evidence in row["evidence_references"]:
        work = works[evidence["url"]]
        work["claim_ids"].add(row["claim_id"])
        work["passages"].append({"claim_id": row["claim_id"], "locator": evidence["locator"],
            "original_source_id": evidence.get("source_id"), "source_authority": evidence.get("source_authority"),
            "independence_assessment": evidence.get("independence_assessment")})

output = {"assessed_claims": len(decisions), "source_works": len(works),
    "source_references": sum(len(item["passages"]) for item in works.values()),
    "works": [{"url": url, "claim_count": len(item["claim_ids"]), "claim_ids": sorted(item["claim_ids"]),
        "passages": item["passages"]} for url, item in sorted(works.items())]}
assert all(p["locator"] for item in output["works"] for p in item["passages"])
(root / "source-provenance-summary.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
print(f"{output['source_works']} works, {output['source_references']} passage references")
