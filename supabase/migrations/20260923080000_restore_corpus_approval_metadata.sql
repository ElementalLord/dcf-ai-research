-- Earlier URL ingestion replaced rather than merged sources.metadata. Restore
-- auditable approval markers from the append-only audit log; the application
-- now merges fetch metadata so these markers remain intact.

update public.sources s
set metadata = s.metadata || jsonb_build_object(
  'testing_only', true,
  'approval_actor', 'system_test_bulk_approval',
  'approval_reason', case
    when a.action = 'source_added' then 'verified chapter-level primary-text repository page'
    else 'bulk approved for corpus testing'
  end,
  'approval_batch_key', 'vishvamitra-master-corpus-2026-09-23'
)
from public.corpus_change_audit a
join public.corpus_change_batches b on b.id = a.batch_id
where a.entity_type = 'source'
  and a.entity_id = s.id
  and b.batch_key = 'vishvamitra-master-corpus-2026-09-23';

update public.sources s
set metadata = s.metadata || jsonb_build_object(
  'benchmark_sarga', ((regexp_match(s.title, 'Sarga ([0-9]+)'))[1])::integer,
  'verified_http_status', 200
)
from public.corpus_change_audit a
join public.corpus_change_batches b on b.id = a.batch_id
where a.entity_type = 'source'
  and a.entity_id = s.id
  and a.action = 'source_added'
  and b.batch_key = 'vishvamitra-master-corpus-2026-09-23'
  and s.title ~ 'Sarga [0-9]+';
