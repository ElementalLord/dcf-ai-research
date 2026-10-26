#!/usr/bin/env python3
"""Index pending claims by source work, document, and passage for review batches."""

import collections
import json
import re
import unicodedata
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "artifacts/corpus-verification"
EXPORT = ROOT / ".corpus-cache/exports/dcf-claims-independent-review-2026-10-18.zip"


def normal(text):
    text = unicodedata.normalize("NFKD", text or "").lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


with zipfile.ZipFile(EXPORT) as archive:
    claims = [json.loads(line) for line in archive.open("claims_audit.jsonl") if line.strip()]
decisions = {json.loads(line)["claim_id"] for line in (WORK / "decision-ledger.jsonl").open() if json.loads(line)["decision"]}

groups = collections.defaultdict(lambda: {"claims": set(), "documents": collections.defaultdict(lambda: {"claims": set(), "passages": collections.defaultdict(set)}), "themes": collections.Counter(), "epistemic_proposals": collections.Counter()})
unlinked = []
for claim in claims:
    if claim["claim_id"] in decisions:
        continue
    if not claim["sources"]:
        unlinked.append(claim["claim_id"])
    for link in claim["sources"]:
        source = link["source"]
        work = " | ".join([normal(source.get("author")), normal(source.get("title")), str(source.get("publication_year") or "")])
        key = (claim["personality_name"], work)
        group = groups[key]
        group["claims"].add(claim["claim_id"])
        group["themes"][claim["lens"]["field_label"] if claim.get("lens") else "unassigned"] += 1
        group["epistemic_proposals"][(claim.get("epistemics") or {}).get("proposed_type") or "unclassified"] += 1
        doc = group["documents"][source.get("url") or "NO_URL"]
        doc["claims"].add(claim["claim_id"])
        for passage in link["passages"]:
            doc["passages"][passage["chunk_id"]].add(claim["claim_id"])

output = []
for (personality, work), group in groups.items():
    output.append({
        "personality": personality,
        "work_key": work,
        "pending_claim_count": len(group["claims"]),
        "pending_claim_ids": sorted(group["claims"]),
        "themes": dict(group["themes"]),
        "epistemic_proposals": dict(group["epistemic_proposals"]),
        "documents": [{"url": url, "claim_count": len(doc["claims"]), "claim_ids": sorted(doc["claims"]),
                       "passage_groups": [{"passage_id": passage_id, "claim_ids": sorted(ids)} for passage_id, ids in doc["passages"].items()]}
                      for url, doc in group["documents"].items()],
    })
output.sort(key=lambda row: (-row["pending_claim_count"], row["personality"], row["work_key"]))
(WORK / "source-review-groups.json").write_text(json.dumps({"groups": output, "unlinked_claim_ids": unlinked}, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"pending_claims": len(claims)-len(decisions), "source_work_groups": len(output), "unlinked_claims": len(unlinked), "top_groups": [{"personality": row["personality"], "count": row["pending_claim_count"], "url": row["documents"][0]["url"]} for row in output[:15]]}, indent=2))
