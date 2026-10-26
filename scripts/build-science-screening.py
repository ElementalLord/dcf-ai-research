#!/usr/bin/env python3
"""First-pass triage only; never produces publication decisions."""
import json
from pathlib import Path

ROOT = Path('artifacts/corpus-verification')
NAMES = {'C. V. Raman', 'Jagadish Chandra Bose', 'Srinivasa Ramanujan', 'A. P. J. Abdul Kalam'}
ledger = {r['claim_id']: r for r in map(json.loads, (ROOT/'decision-ledger.jsonl').open())}
audit = {r['claim_id']: r for r in map(json.loads, (ROOT/'audit/ALL_CLAIMS_EVIDENCE_AUDIT.jsonl').open())}
out = ROOT/'worker-science-screening.jsonl'
with out.open('w') as f:
    for cid, r in ledger.items():
        if r['personality'] not in NAMES or r['decision'] is not None:
            continue
        a = audit[cid]
        excerpt = a.get('best_visible_support_excerpt') or ''
        url = a.get('best_linked_source_url') or ''
        overlap = a.get('visible_passage_overlap_heuristic')
        record = {
            'claim_id': cid, 'personality': r['personality'], 'screening_status': 'SCREEN_ONLY',
            'claim_text': r['original_claim_text'],
            'source_group_url': url, 'source_title': a.get('best_linked_source_title'),
            'exported_excerpt': excerpt, 'exported_passage_ids': a.get('passage_ids', []),
            'screening_source_relevance': 'CANDIDATE_RELEVANT' if url and excerpt else 'NEEDS_SOURCE_DISCOVERY',
            'screening_support': 'POSSIBLE_DIRECT_SUPPORT' if overlap is not None and overlap >= 0.35 else 'NEEDS_PASSAGE_CHECK',
            'overlap_heuristic': overlap,
            'contradiction_screen': 'NOT_ESTABLISHED_FROM_EXPORT',
            'duplicate_candidate_ids': [d.get('claim_id') for d in a.get('near_duplicate_candidates', []) if isinstance(d, dict)],
            'epistemic_proposal_unverified': a.get('suggested_epistemic_type'),
            'limitations': 'Exported excerpt and citation are diagnostic only; independently inspect source, context, historical accuracy and corroboration before any final decision.',
            'final_decision': None,
        }
        f.write(json.dumps(record, ensure_ascii=False)+'\n')
print(sum(1 for _ in out.open()), out)
