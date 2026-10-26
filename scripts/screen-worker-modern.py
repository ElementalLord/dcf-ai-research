"""Non-final screening of this worker's pending source groups.

The audit excerpts are leads, never proof that a source is accurate or live.
"""
import json
import re
import zipfile
from collections import defaultdict
from pathlib import Path

BASE = Path('artifacts/corpus-verification')
NAMES = {'M. S. Subbulakshmi', 'Verghese Kurien', 'Swami Vivekananda', 'Satyajit Ray', 'Rabindranath Tagore'}
ledger = {r['claim_id']: r for r in map(json.loads, (BASE/'decision-ledger.jsonl').open())}
archive = zipfile.ZipFile('.corpus-cache/exports/dcf-claims-independent-review-2026-10-18.zip')
audit = {r['claim_id']: r for r in map(json.loads, archive.read('claims_audit.jsonl').decode().splitlines())}
groups = json.loads((BASE/'source-review-groups.json').read_text())['groups']
by_id = {}
for group in groups:
    if group['personality'] not in NAMES:
        continue
    for doc in group['documents']:
        for cid in doc['claim_ids']:
            if cid not in ledger or ledger[cid]['decision']:
                continue
            by_id.setdefault(cid, []).append((group['work_key'], doc['url']))

def tokens(s):
    return set(re.findall(r'[a-z]{4,}|\d{4}', s.lower())) - {
        'claim', 'claims', 'source', 'sources', 'rather', 'through', 'which', 'their', 'about',
        'after', 'before', 'during', 'among', 'under', 'would', 'could', 'should', 'from',
        'with', 'that', 'this', 'than', 'into', 'more', 'both', 'also', 'only', 'were', 'when'
    }

out = []
for cid in sorted(by_id):
    r = ledger[cid]
    a = audit[cid]
    excerpts = []
    for link in a.get('sources', []):
        if link.get('evidence_excerpt'):
            excerpts.append(link['evidence_excerpt'])
        for p in link.get('passages', []):
            if p.get('excerpt'):
                excerpts.append(p['excerpt'])
    excerpt = max(excerpts, key=len, default='')
    common = tokens(r['original_claim_text']) & tokens(excerpt)
    status = 'candidate_passage_overlap' if len(common) >= 3 else 'needs_passage_or_source_recheck'
    out.append({
        'claim_id': cid, 'personality': r['personality'], 'status': 'SCREEN_ONLY',
        'screen_result': status, 'claim_text': r['original_claim_text'],
        'candidate_source_groups': [{'work_key': k, 'url': u} for k, u in by_id[cid]],
        'stored_excerpt_present': bool(excerpt), 'overlap_terms': sorted(common)[:16],
        'source_relevance': 'provisional_lexical_overlap' if common else 'not_established',
        'exact_factual_support': 'UNASSESSED', 'contradictions': 'UNASSESSED',
        'duplicate_status': 'UNASSESSED',
        'epistemic_proposal': (a.get('epistemics') or {}).get('proposed_type'),
        'limitations': ['Stored citation and excerpt are diagnostic leads, not independent verification.',
                        'Original document, full context, accuracy, contradictions, and corroboration still require assessment.'],
    })
(BASE/'worker-modern-screening.jsonl').write_text(''.join(json.dumps(x, ensure_ascii=False)+'\n' for x in out))
print(len(out), 'SCREEN_ONLY records')
