#!/usr/bin/env python3
"""Generate an incremental, guarded SQL application for the local review clone."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "artifacts/corpus-verification"
rows = [json.loads(line) for line in (ROOT / "decision-ledger.jsonl").read_text().splitlines()]
receipt = json.loads((ROOT / "isolated-supabase-receipt.json").read_text())
applied = set(receipt["applied_claim_ids"])
new = [row for row in rows if row["decision"] and row["claim_id"] not in applied]
assert len(rows) == 1585 and len(new) > 0

def lit(value):
    return "'" + str(value).replace("'", "''") + "'"

sql = ["BEGIN;", "SET LOCAL session_replication_role = replica;"]
for row in new:
    id_ = lit(row["claim_id"])
    original = lit(row["original_claim_text"])
    sql.append(f"DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM corpus_verification_audit.original_claims WHERE id={id_}::uuid AND claim_text={original}) OR EXISTS (SELECT 1 FROM corpus_verification_audit.decisions WHERE claim_id={id_}::uuid) THEN RAISE EXCEPTION 'baseline/decision conflict for {row['claim_id']}'; END IF; END $$;")
    record = lit(json.dumps(row, ensure_ascii=False, separators=(",", ":")))
    sql.append(f"INSERT INTO corpus_verification_audit.decisions(claim_id,decision,evidence_record) VALUES ({id_}::uuid,{lit(row['decision'])},{record}::jsonb);")
    if row["decision"] == "REMOVE FROM ACTIVE CORPUS":
        sql.append(f"UPDATE public.claims SET review_status='rejected',approval_note='Excluded after corpus evidence review; original preserved in audit schema',approved_at=NULL WHERE id={id_}::uuid;")
    else:
        sql.append(f"UPDATE public.claims SET claim_text={lit(row['final_proposed_wording'])},review_status='approved',approval_origin='corpus_evidence_review',approval_note='Evidence assessed in isolated corpus review; see audit schema',approved_by_label='Corpus evidence review',approved_at=now() WHERE id={id_}::uuid;")
        sql.append(f"UPDATE public.claim_epistemics SET epistemic_type={lit(row['epistemic_type'])},contract_status='SUPPORTED',contract_satisfied=true,contract_basis='Source-specific corpus review; see audit schema',reviewer_kind='ai_assisted',review_note='Evidence assessment in isolated review copy',reviewed_at=now() WHERE claim_id={id_}::uuid;")
sql.append("UPDATE public.source_chunks sc SET is_active=true WHERE EXISTS (SELECT 1 FROM public.claim_chunks cc JOIN public.claims c ON c.id=cc.claim_id WHERE cc.chunk_id=sc.id AND c.review_status='approved' AND c.approval_origin='corpus_evidence_review');")
sql.append("UPDATE public.source_chunks sc SET is_active=false WHERE NOT EXISTS (SELECT 1 FROM public.claim_chunks cc JOIN public.claims c ON c.id=cc.claim_id WHERE cc.chunk_id=sc.id AND c.review_status='approved' AND c.approval_origin='corpus_evidence_review');")
sql.append("TRUNCATE public.answer_cache, public.live_research_cache, public.web_search_cache;")
sql.append(f"DO $$ BEGIN IF (SELECT count(*) FROM corpus_verification_audit.decisions) <> {len(applied)+len(new)} THEN RAISE EXCEPTION 'decision count mismatch'; END IF; END $$;")
sql.append("COMMIT;")
(ROOT / "isolated-increment.sql").write_text("\n".join(sql) + "\n")
print(f"generated local-only increment for {len(new)} claims")
