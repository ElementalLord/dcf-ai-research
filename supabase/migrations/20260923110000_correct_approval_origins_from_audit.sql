-- Correct benchmark approval origins from the append-only audit log rather
-- than broad metadata that was also attached to pre-existing approvals.

update public.claims c
set approval_origin = case
      when exists (
        select 1 from public.corpus_change_audit a
        where a.entity_type = 'claim'
          and a.entity_id = c.id
          and a.actor = 'system_test_bulk_approval'
          and a.action in ('bulk_test_approval', 'candidate_test_approval')
      ) then 'system_test_bulk'
      else 'imported_existing'
    end,
    approval_batch_id = case
      when exists (
        select 1 from public.corpus_change_audit a
        where a.entity_type = 'claim' and a.entity_id = c.id and a.actor = 'system_test_bulk_approval'
      ) then (select id from public.corpus_change_batches where batch_key = 'vishvamitra-master-corpus-2026-09-23')
      else null
    end,
    approval_note = case
      when exists (
        select 1 from public.corpus_change_audit a
        where a.entity_type = 'claim' and a.entity_id = c.id and a.actor = 'system_test_bulk_approval'
      ) then 'Bulk-approved for internal retrieval benchmark testing; not equivalent to mentor sign-off.'
      else 'Approval imported from the pre-existing reviewed corpus; reviewer class was not encoded in the legacy schema.'
    end,
    approved_by_label = case
      when exists (
        select 1 from public.corpus_change_audit a
        where a.entity_type = 'claim' and a.entity_id = c.id and a.actor = 'system_test_bulk_approval'
      ) then 'system_test_bulk_approval'
      else 'imported_existing'
    end
where c.personality_id = (select id from public.personalities where lower(canonical_name) = 'vishvamitra' limit 1)
  and c.review_status = 'approved';

update public.sources s
set approval_origin = case
      when exists (
        select 1 from public.corpus_change_audit a
        where a.entity_type = 'source'
          and a.entity_id = s.id
          and a.actor = 'system_test_bulk_approval'
          and a.action in ('bulk_test_approval', 'source_added')
      ) then 'system_test_bulk'
      else 'imported_existing'
    end,
    approval_batch_id = case
      when exists (
        select 1 from public.corpus_change_audit a
        where a.entity_type = 'source' and a.entity_id = s.id and a.actor = 'system_test_bulk_approval'
      ) then (select id from public.corpus_change_batches where batch_key = 'vishvamitra-master-corpus-2026-09-23')
      else null
    end,
    approval_note = case
      when exists (
        select 1 from public.corpus_change_audit a
        where a.entity_type = 'source' and a.entity_id = s.id and a.actor = 'system_test_bulk_approval'
      ) then 'Bulk-approved for internal retrieval benchmark testing; not equivalent to mentor sign-off.'
      else 'Evidence approval imported from the pre-existing source registry.'
    end,
    approved_by_label = case
      when exists (
        select 1 from public.corpus_change_audit a
        where a.entity_type = 'source' and a.entity_id = s.id and a.actor = 'system_test_bulk_approval'
      ) then 'system_test_bulk_approval'
      else 'imported_existing'
    end
where exists (
  select 1 from public.source_personalities sp
  join public.personalities p on p.id = sp.personality_id
  where sp.source_id = s.id and lower(p.canonical_name) = 'vishvamitra'
);

update public.approved_source_access asa
set approval_origin = 'system_test_bulk',
    approval_batch_id = (select id from public.corpus_change_batches where batch_key = 'vishvamitra-master-corpus-2026-09-23'),
    approval_note = 'Network access approved for internal benchmark testing; evidence acceptance remains separately controlled.',
    approved_by_label = 'system_test_bulk_approval',
    approved_at = coalesce(approved_at, updated_at, now())
where asa.evidence_use_status = 'approved'
  and (
    asa.notes ilike '%bulk approved%'
    or exists (
      select 1
      from public.sources s
      join public.corpus_change_audit a on a.entity_type = 'source' and a.entity_id = s.id
      where a.actor = 'system_test_bulk_approval'
        and a.action in ('bulk_test_approval', 'source_added')
        and asa.scope_type = 'EXACT_URL'
        and asa.exact_url = s.url
    )
  );
