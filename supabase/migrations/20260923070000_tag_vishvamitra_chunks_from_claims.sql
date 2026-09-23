-- Deterministic parameter tagging derived from existing curated claim-source
-- associations. This avoids making corpus usability depend on generation quota.

create or replace function public.tag_vishvamitra_chunks_from_claim_sources()
returns table (personality_tags_upserted bigint, parameter_tags_upserted bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  personality_count bigint := 0;
  parameter_count bigint := 0;
begin
  with inserted as (
    insert into public.chunk_personalities(
      chunk_id, personality_id, relationship, relevance_score, tagging_method, confidence
    )
    select distinct
      sc.id,
      c.personality_id,
      'subject',
      1,
      'rule',
      1
    from public.claims c
    join public.personalities p on p.id = c.personality_id
    join public.claim_sources cs on cs.claim_id = c.id
    join public.source_chunks sc on sc.source_id = cs.source_id and sc.is_active
    where p.canonical_name = 'Vishvamitra'
      and c.review_status = 'approved'
    on conflict (chunk_id, personality_id) do update set
      relevance_score = greatest(coalesce(chunk_personalities.relevance_score, 0), excluded.relevance_score),
      confidence = greatest(coalesce(chunk_personalities.confidence, 0), excluded.confidence)
    returning 1
  )
  select count(*) into personality_count from inserted;

  with inserted as (
    insert into public.chunk_parameter_fields(
      chunk_id, parameter_field_id, confidence, tagging_method
    )
    select distinct
      sc.id,
      c.parameter_field_id,
      0.80,
      'rule'
    from public.claims c
    join public.personalities p on p.id = c.personality_id
    join public.claim_sources cs on cs.claim_id = c.id
    join public.source_chunks sc on sc.source_id = cs.source_id and sc.is_active
    where p.canonical_name = 'Vishvamitra'
      and c.review_status = 'approved'
      and c.parameter_field_id is not null
    on conflict (chunk_id, parameter_field_id) do update set
      confidence = greatest(coalesce(chunk_parameter_fields.confidence, 0), excluded.confidence)
    returning 1
  )
  select count(*) into parameter_count from inserted;

  return query select personality_count, parameter_count;
end;
$$;

revoke execute on function public.tag_vishvamitra_chunks_from_claim_sources() from public, anon, authenticated;
grant execute on function public.tag_vishvamitra_chunks_from_claim_sources() to service_role;

comment on function public.tag_vishvamitra_chunks_from_claim_sources() is
  'Deterministically tags Vishvamitra chunks using approved claims already curated to the same source.';
