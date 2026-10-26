#!/usr/bin/env python3
"""Resumable DCF corpus screening and evidence-decision coordination.

Screening uses only exported excerpts and is NEVER a final decision. Human/agent
workers must inspect the actual source separately and write worker decisions.
"""

import argparse
import collections
import hashlib
import json
import os
import re
import tempfile
import zipfile
from pathlib import Path
from urllib.parse import urlparse

BASE = Path(__file__).resolve().parents[1]
WORK = BASE / "artifacts/corpus-verification"
EXPORT = BASE / ".corpus-cache/exports/dcf-claims-independent-review-2026-10-18.zip"
CACHE = WORK / "source-cache/export-excerpts"


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False, encoding="utf-8") as file:
        json.dump(value, file, ensure_ascii=False, indent=2)
        file.write("\n")
        name = file.name
    os.replace(name, path)


def atomic_jsonl(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False, encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
        name = file.name
    os.replace(name, path)


def records():
    with zipfile.ZipFile(EXPORT) as archive:
        original = [json.loads(line) for line in archive.open("claims_audit.jsonl") if line.strip()]
    ledger = [json.loads(line) for line in (WORK / "decision-ledger.jsonl").read_text().splitlines()]
    assert len(original) == len(ledger) == 1585
    by_id = {row["claim_id"]: row for row in original}
    assert len(by_id) == 1585 and set(by_id) == {row["claim_id"] for row in ledger}
    return by_id, ledger


def normalized(text):
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def words(text):
    return set(re.findall(r"[a-z]{4,}|\d{4}", text.lower()))


def source_cache(original):
    grouped = {}
    for row in original.values():
        for link in row["sources"]:
            source_id = link["source_id"]
            item = grouped.setdefault(source_id, {"source_id": source_id, "source": link["source"], "claim_ids": set(), "passages": {}})
            item["claim_ids"].add(row["claim_id"])
            for passage in link["passages"]:
                text = passage.get("excerpt") or ""
                item["passages"][passage["chunk_id"]] = {
                    "chunk_id": passage["chunk_id"], "locator": passage.get("page_or_section") or passage.get("section_title"),
                    "text_sha256": hashlib.sha256(text.encode()).hexdigest(),
                    "excerpt_preview": text[:240], "excerpt_truncated": len(text) > 240 or passage.get("excerpt_truncated", False),
                    "screen_only": True,
                }
    CACHE.mkdir(parents=True, exist_ok=True)
    for item in grouped.values():
        path = CACHE / f"{item['source_id']}.json"
        data = {"source_id": item["source_id"], "source": item["source"],
                "claim_ids": sorted(item["claim_ids"]), "passages": sorted(item["passages"].values(), key=lambda p: p["chunk_id"]),
                "cache_kind": "short_exported_excerpts_for_screening_only", "live_original_inspected": False}
        if not path.exists():
            atomic_json(path, data)
    return grouped


def screen(limit):
    original, ledger = records()
    initially_decided = set()
    for batch_number in range(1, 8):
        initially_decided.update(row["claim_id"] for row in json.loads((WORK / f"batch-{batch_number:03d}-decisions.json").read_text()))
    screening_cohort = [row for row in ledger if row["claim_id"] not in initially_decided]
    pending_ids = {row["claim_id"] for row in ledger if row["decision"] is None}
    cohort_ids = {row["claim_id"] for row in screening_cohort}
    cache = source_cache(original)
    path = WORK / "screening.jsonl"
    old = {row["claim_id"]: row for row in (json.loads(line) for line in path.read_text().splitlines())
           if row["claim_id"] in cohort_ids} if path.exists() else {}
    added = refreshed = 0
    norm_counts = collections.Counter(normalized(row["original_claim_text"]) for row in screening_cohort)
    for row in screening_cohort:
        previous = old.get(row["claim_id"])
        if previous and previous.get("screening_version") == 2:
            continue
        if limit and added + refreshed >= limit:
            continue
        source = original[row["claim_id"]]
        claim_words = words(row["original_claim_text"])
        dates = set(re.findall(r"\b(?:1[0-9]{3}|20[0-9]{2})\b", row["original_claim_text"]))
        candidates = []
        for link in source["sources"]:
            document = link["source"]
            excerpts = [(passage, passage.get("excerpt") or "") for passage in link["passages"]]
            best = max(excerpts, key=lambda pair: len(claim_words & words(pair[1])), default=(None, ""))
            passage, excerpt = best
            overlap = round(len(claim_words & words(excerpt)) / max(1, len(claim_words)), 3)
            excerpt_dates = set(re.findall(r"\b(?:1[0-9]{3}|20[0-9]{2})\b", excerpt))
            title_overlap = round(len(claim_words & words(document.get("title") or "")) / max(1, len(claim_words)), 3)
            candidates.append({
                "source_id": link["source_id"], "url": document.get("url"), "title": document.get("title"),
                "source_type": document.get("source_type"), "publisher": document.get("publisher_or_institution"),
                "passage_id": passage.get("chunk_id") if passage else None,
                "locator": (passage.get("page_or_section") or passage.get("section_title")) if passage else link.get("page_or_section"),
                "export_excerpt_overlap": overlap, "title_relevance_overlap": title_overlap,
                "export_excerpt_support_hint": "HIGH_LEXICAL_MATCH" if overlap >= .55 and not (dates - excerpt_dates)
                    else "PARTIAL_LEXICAL_MATCH" if overlap >= .25 else "LOW_LEXICAL_MATCH",
                "claim_dates_absent_from_export_excerpt": sorted(dates - excerpt_dates),
                "possible_date_conflict": bool(dates and excerpt_dates and dates.isdisjoint(excerpt_dates)),
                "possible_negation_mismatch": bool(re.search(r"\b(?:not|never|no)\b", row["original_claim_text"], re.I))
                    != bool(re.search(r"\b(?:not|never|no)\b", excerpt, re.I)),
                "has_exported_passage": bool(excerpt), "export_excerpt_truncated": bool(passage and passage.get("excerpt_truncated")),
                "source_cache_file": str(CACHE / f"{link['source_id']}.json"),
            })
        candidates.sort(key=lambda c: (-c["export_excerpt_overlap"], not c["has_exported_passage"], c["source_id"]))
        old[row["claim_id"]] = {
            "claim_id": row["claim_id"], "personality": row["personality"], "status": "SCREEN_ONLY", "screening_version": 2,
            "original_claim_text": row["original_claim_text"], "epistemic_proposal": (source.get("epistemics") or {}).get("epistemic_type"),
            "exact_normalized_duplicate_count": norm_counts[normalized(row["original_claim_text"])],
            "source_candidates": candidates, "screening_limits": [
                "Exported excerpts are not independent verification of the live original work.",
                "Lexical, date, and negation flags are routing hints, not entailment or contradiction findings.",
            ], "final_decision": None,
        }
        if previous: refreshed += 1
        else: added += 1
    atomic_jsonl(path, [old[row["claim_id"]] for row in screening_cohort if row["claim_id"] in old])
    summary = {"pending_claims": len(pending_ids), "screened_claims": len(old), "current_pending_screened_claims": len(set(old) & pending_ids), "newly_screened_this_run": added,
               "refreshed_this_run": refreshed,
               "unscreened_claims": len(cohort_ids)-len(old), "cached_export_source_documents": len(cache),
               "screening_is_final_verification": False}
    atomic_json(WORK / "screening-summary.json", summary)
    print(json.dumps(summary))


def rank(limit):
    _, ledger = records()
    pending = {row["claim_id"] for row in ledger if row["decision"] is None}
    groups = json.loads((WORK / "source-review-groups.json").read_text())["groups"]
    authority = {"nobelprize.org": 5, "isro.gov.in": 5, "presidentofindia.nic.in": 5,
                 "ncert.nic.in": 4, "hf.uio.no": 4, "valmiki.iitk.ac.in": 4,
                 "plato.stanford.edu": 4, "archive.org": 2}
    ranked = []
    for group in groups:
        ids = set(group["pending_claim_ids"]) & pending
        if not ids: continue
        documents = group.get("documents", [])
        domains = [urlparse(item.get("url") or "").netloc.lower() for item in documents]
        auth = max((next((v for k,v in authority.items() if d.endswith(k)), 2) for d in domains), default=1)
        passages = sum(len(item.get("passage_groups", [])) for item in documents)
        coverage = min(1, passages/max(1,len(ids)))
        score = round(len(ids)*2 + auth*3 + coverage*8 - max(0,len(documents)-1)*2, 2)
        ranked.append({"personality": group["personality"], "work_key": group["work_key"],
                       "pending_claim_count": len(ids), "source_urls": [d.get("url") for d in documents],
                       "score": score, "authority_prior": auth, "exported_passage_coverage_hint": round(coverage,2)})
    ranked.sort(key=lambda x: (-x["score"], x["personality"], x["work_key"]))
    # The full list stays available; the displayed queue interleaves personalities
    # so one difficult corpus cannot permanently starve other source groups.
    atomic_json(WORK / "ranked-source-queue.json", ranked)
    shown, per_personality = [], collections.Counter()
    for item in ranked:
        if per_personality[item["personality"]] >= 2: continue
        shown.append(item); per_personality[item["personality"]] += 1
        if len(shown) >= limit: break
    print(json.dumps(shown, ensure_ascii=False, indent=2))


def merge(paths):
    original, ledger = records()
    decided = {row["claim_id"] for row in ledger if row["decision"]}
    incoming, holds, owners = [], [], {}
    allowed = {"APPROVE", "REVISE AND APPROVE", "REMOVE FROM ACTIVE CORPUS"}
    for name in paths:
        path = Path(name)
        rows = json.loads(path.read_text())
        assert isinstance(rows, list) and rows, f"Empty worker file: {path}"
        for row in rows:
            id_ = row["claim_id"]
            assert id_ in original and id_ not in decided, f"Unknown or previously decided ID: {id_}"
            assert id_ not in owners, f"Conflicting worker outputs for {id_}: {owners.get(id_)}, {path}"
            owners[id_] = str(path)
            assert row["decision"] in allowed and row["verification_rationale"]
            assert row["original_claim_text"] == original[id_]["claim_text"]
            assert row["personality"] == original[id_]["personality_name"]
            assert row.get("original_source_inspected") is True
            assert row.get("evidence_references")
            assert all(e.get("url", "").startswith("https://") and e.get("locator") and e.get("original_source_inspected") is True
                       and e.get("source_authority") and e.get("independence_assessment") for e in row["evidence_references"])
            if row["decision"] == "APPROVE": assert row["final_proposed_wording"] == row["original_claim_text"]
            if row["decision"] == "REMOVE FROM ACTIVE CORPUS": assert row.get("removal_reason")
            if row["decision"] == "REVISE AND APPROVE": assert row["final_proposed_wording"]
            normalized_row = dict(row)
            if row["decision"] == "REMOVE FROM ACTIVE CORPUS" and not row.get("final_proposed_wording"):
                normalized_row["final_proposed_wording"] = row["original_claim_text"]
            linked_source_ids = {link["source_id"] for link in original[id_]["sources"]}
            unlinked = [ref.get("source_id") for ref in row["evidence_references"]
                        if not ref.get("source_id") or ref["source_id"] not in linked_source_ids]
            if unlinked:
                holds.append({"claim_id": id_, "worker_file": str(path), "reason": "Verified source has no established claim-source link in the original corpus", "unlinked_source_ids": unlinked, "proposed_decision": normalized_row})
            else:
                incoming.append(normalized_row)
    existing_batches = sorted(WORK.glob("batch-*-decisions.json"))
    next_number = max((int(path.name.split("-")[1]) for path in existing_batches), default=0) + 1
    target = WORK / f"batch-{next_number:03d}-decisions.json"
    hold_target = WORK / f"batch-{next_number:03d}-provenance-holds.json"
    atomic_json(hold_target, holds)
    atomic_json(target, sorted(incoming, key=lambda row: row["claim_id"]))
    print(json.dumps({"merged_decisions": len(incoming), "provenance_holds": len(holds), "worker_files": paths, "output": str(target), "hold_file": str(hold_target)}))


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    screen_cmd = commands.add_parser("screen")
    screen_cmd.add_argument("--limit", type=int, default=0, help="new claims to screen; 0 means all")
    rank_cmd = commands.add_parser("rank")
    rank_cmd.add_argument("--limit", type=int, default=25)
    merge_cmd = commands.add_parser("merge")
    merge_cmd.add_argument("worker_files", nargs="+")
    args = parser.parse_args()
    if args.command == "screen": screen(args.limit)
    elif args.command == "rank": rank(args.limit)
    else: merge(args.worker_files)


if __name__ == "__main__": main()
