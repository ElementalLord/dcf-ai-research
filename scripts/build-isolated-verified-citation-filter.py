#!/usr/bin/env python3
"""Limit newly approved local-review claim links to inspected evidence sources.

The original claim-source and claim-chunk links remain in the isolated audit
schema. This script never connects to a database; it emits local-only SQL.
"""

import json
from pathlib import Path

work = Path(__file__).resolve().parents[1] / "artifacts/corpus-verification"
rows = []
for path in sorted(work.glob("batch-*-decisions.json")):
    if int(path.name.split("-")[1]) >= 8:
        rows.extend(json.loads(path.read_text()))
rows = [row for row in rows if row["decision"] != "REMOVE FROM ACTIVE CORPUS"]
assert rows

def lit(value):
    return "'" + str(value).replace("'", "''") + "'"

links = []
for row in rows:
    for ref in row["evidence_references"]:
        assert ref["source_id"] and ref["locator"]
        links.append((row["claim_id"], ref["source_id"], ref["locator"]))
values = ",\n".join(f"({lit(claim_id)}::uuid,{lit(source_id)}::uuid,{lit(locator)})" for claim_id, source_id, locator in links)
claim_ids = ",".join(f"{lit(row['claim_id'])}::uuid" for row in rows)
sql = f"""BEGIN;
CREATE TEMP TABLE verified_citation_links(claim_id uuid, source_id uuid, locator text) ON COMMIT DROP;
INSERT INTO verified_citation_links VALUES
{values};
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM verified_citation_links v LEFT JOIN public.claim_sources cs
    ON cs.claim_id=v.claim_id AND cs.source_id=v.source_id WHERE cs.claim_id IS NULL)
  THEN RAISE EXCEPTION 'verified source link missing from claim'; END IF;
  IF EXISTS (SELECT 1 FROM public.claims c WHERE c.id IN ({claim_ids})
    AND (c.review_status <> 'approved' OR c.approval_origin <> 'corpus_evidence_review'))
  THEN RAISE EXCEPTION 'unexpected claim status'; END IF;
END $$;
DELETE FROM public.claim_sources cs WHERE cs.claim_id IN ({claim_ids})
  AND NOT EXISTS (SELECT 1 FROM verified_citation_links v WHERE v.claim_id=cs.claim_id AND v.source_id=cs.source_id);
DELETE FROM public.claim_chunks cc USING public.source_chunks sc
  WHERE cc.chunk_id=sc.id AND cc.claim_id IN ({claim_ids})
  AND NOT EXISTS (SELECT 1 FROM verified_citation_links v WHERE v.claim_id=cc.claim_id AND v.source_id=sc.source_id);
UPDATE public.claim_sources cs SET page_or_section=v.locator
  FROM verified_citation_links v WHERE cs.claim_id=v.claim_id AND cs.source_id=v.source_id;
UPDATE public.source_chunks sc SET is_active=EXISTS (
  SELECT 1 FROM public.claim_chunks cc JOIN public.claims c ON c.id=cc.claim_id
  WHERE cc.chunk_id=sc.id AND c.review_status='approved' AND c.approval_origin='corpus_evidence_review');
TRUNCATE public.answer_cache, public.live_research_cache, public.web_search_cache;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.claim_sources cs WHERE cs.claim_id IN ({claim_ids})
  AND NOT EXISTS (SELECT 1 FROM verified_citation_links v WHERE v.claim_id=cs.claim_id AND v.source_id=cs.source_id))
THEN RAISE EXCEPTION 'unverified citation link remains'; END IF; END $$;
COMMIT;
"""
path = work / "isolated-verified-citation-filter.sql"
path.write_text(sql)
print(json.dumps({"approved_claims": len(rows), "verified_links": len(links), "output": str(path)}))
