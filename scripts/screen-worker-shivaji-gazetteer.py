"""Record a non-final screen and source-access hold for Sangli Gazetteer group."""
import json
from pathlib import Path

base=Path('artifacts/corpus-verification')
cache=json.loads((base/'source-cache/export-excerpts/502ae471-010c-49a9-bb03-e15ba5525bc9.json').read_text())
ledger={r['claim_id']:r for r in map(json.loads,(base/'decision-ledger.jsonl').open())}
source=cache['source']['url']
rows=[]
for cid in cache['claim_ids']:
    r=ledger[cid]
    assert not r['decision']
    rows.append({'claim_id':cid,'personality':r['personality'],'claim_text':r['original_claim_text'],
      'status':'SCREEN_ONLY','candidate_source_url':source,'candidate_source_id':cache['source_id'],
      'stored_passage_ids':r['original_passage_ids'],
      'screen_result':'stored excerpt located; underlying original page unavailable for independent passage review',
      'source_relevance':'provisional_from_export_only','exact_factual_support':'UNASSESSED',
      'historical_accuracy':'UNASSESSED','corroboration':'UNASSESSED',
      'limitations':['Publisher page returned HTTP 502 or timed out on direct reinspection.',
        'Search-engine snippets and prior export excerpts are diagnostic leads, not final evidence.',
        'Historical statements require examination of the actual passage and applicable corroboration.']})
(base/'worker-shivaji-gazetteer-screening.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows))
(base/'worker-shivaji-gazetteer-decisions.json').write_text('[]\n')
(base/'worker-shivaji-gazetteer-holds.json').write_text(json.dumps({
  'source_url':source,'source_id':cache['source_id'],'status':'SOURCE_ACCESS_HOLD',
  'claim_ids':cache['claim_ids'],'count':len(cache['claim_ids']),
  'access_attempts':['https://www.gazetteers.maharashtra.gov.in/…/SANGLI/his_maratha%20period.html — HTTP 502 and timeout',
      'https://gazetteers.maharashtra.gov.in/…/SANGLI/his_maratha%20period.html — timeout',
      'publisher Sangli District PDF — HTTP 502',
      'Google Books 1969 edition — snippet view only'],
  'resume_requirement':'Inspect full publisher page or original 1969 print/PDF pages, then corroborate historical event and institutional-rule claims as needed. Do not finalize from indexed snippets or stored excerpts.',
  'removed':0,'approved':0,'revised':0,'research_spend_usd':0
},ensure_ascii=False,indent=2)+'\n')
print(len(rows),'screen only; 0 decisions')
