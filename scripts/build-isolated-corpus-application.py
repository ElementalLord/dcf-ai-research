#!/usr/bin/env python3
"""Generate SQL for the disposable local Supabase review copy only.

Never run this output against a remote database. It snapshots all original rows,
gates every claim, and then activates only individually assessed decisions.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "artifacts/corpus-verification"
rows = [json.loads(line) for line in (ROOT / "decision-ledger.jsonl").read_text().splitlines()]
decided = [row for row in rows if row["decision"]]
assert len(rows) == 1585 and len(decided) > 0

def literal(value):
    return "'" + str(value).replace("'", "''") + "'"

sql = [
    "BEGIN;",
    "SET LOCAL session_replication_role = replica;",
    "CREATE SCHEMA IF NOT EXISTS corpus_verification_audit;",
    "CREATE TABLE IF NOT EXISTS corpus_verification_audit.original_claims AS SELECT * FROM public.claims;",
    "CREATE TABLE IF NOT EXISTS corpus_verification_audit.original_claim_epistemics AS SELECT * FROM public.claim_epistemics;",
    "CREATE TABLE IF NOT EXISTS corpus_verification_audit.original_claim_sources AS SELECT * FROM public.claim_sources;",
    "CREATE TABLE IF NOT EXISTS corpus_verification_audit.original_claim_chunks AS SELECT * FROM public.claim_chunks;",
    "CREATE TABLE IF NOT EXISTS corpus_verification_audit.decisions (claim_id uuid PRIMARY KEY, decision text NOT NULL, evidence_record jsonb NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());",
    "DO $$ BEGIN IF (SELECT count(*) FROM corpus_verification_audit.original_claims) <> 1585 THEN RAISE EXCEPTION 'baseline mismatch'; END IF; END $$;",
    "ALTER TABLE public.claims DROP CONSTRAINT IF EXISTS claims_approval_origin_check;",
    "ALTER TABLE public.claims ADD CONSTRAINT claims_approval_origin_check CHECK (approval_origin IN ('human_manual','mentor_review','system_test_bulk','imported_existing','ai_candidate','automated_evidence_verification','corpus_evidence_review'));",
    "UPDATE public.claims SET review_status='needs_review', approved_at=NULL, approved_by_label=NULL WHERE review_status <> 'rejected';",
]
for row in decided:
    record = json.dumps(row, ensure_ascii=False, separators=(",", ":"))
    sql.append(f"INSERT INTO corpus_verification_audit.decisions (claim_id, decision, evidence_record) VALUES ({literal(row['claim_id'])}::uuid,{literal(row['decision'])},{literal(record)}::jsonb);")
    if row["decision"] == "REMOVE FROM ACTIVE CORPUS":
        sql.append(f"UPDATE public.claims SET review_status='rejected', approval_note='Excluded after corpus evidence review; original preserved in corpus_verification_audit' WHERE id={literal(row['claim_id'])}::uuid;")
    else:
        sql.append(f"UPDATE public.claims SET claim_text={literal(row['final_proposed_wording'])},review_status='approved',approval_origin='corpus_evidence_review',approval_note='Evidence assessed in isolated corpus review; see corpus_verification_audit.decisions',approved_by_label='Corpus evidence review',approved_at=now() WHERE id={literal(row['claim_id'])}::uuid;")
        sql.append(f"UPDATE public.claim_epistemics SET epistemic_type={literal(row['epistemic_type'])},contract_status='SUPPORTED',contract_satisfied=true,contract_basis='Source-specific corpus review; see corpus_verification_audit.decisions',reviewer_kind='ai_assisted',review_note='Evidence assessment in isolated review copy',reviewed_at=now() WHERE claim_id={literal(row['claim_id'])}::uuid;")
sql += [
    f"DO $$ BEGIN IF (SELECT count(*) FROM corpus_verification_audit.decisions) <> {len(decided)} THEN RAISE EXCEPTION 'decision count mismatch'; END IF; END $$;",
    "COMMIT;",
]
(ROOT / "isolated-application.sql").write_text("\n".join(sql) + "\n")
print(f"generated isolated-only SQL for {len(decided)} decisions")
