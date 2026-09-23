-- Supplement exact/FTS provenance matching with bounded token-overlap matching.
-- Candidate chunks remain restricted to an existing curated claim_sources link.

create or replace function public.backfill_vishvamitra_claim_chunks_overlap(
  minimum_matched_terms integer default 2,
  minimum_overlap_ratio double precision default 0.10,
  maximum_links_per_claim integer default 2
)
returns table (links_upserted bigint, claims_linked bigint)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  affected bigint := 0;
  linked bigint := 0;
begin
  if minimum_matched_terms < 2 or minimum_matched_terms > 20 then
    raise exception 'minimum_matched_terms must be between 2 and 20';
  end if;
  if minimum_overlap_ratio < 0.05 or minimum_overlap_ratio > 1 then
    raise exception 'minimum_overlap_ratio must be between 0.05 and 1';
  end if;
  if maximum_links_per_claim < 1 or maximum_links_per_claim > 5 then
    raise exception 'maximum_links_per_claim must be between 1 and 5';
  end if;

  with pairs as (
    select
      c.id as claim_id,
      sc.id as chunk_id,
      cs.id as claim_source_id,
      overlap_counts.matched_terms,
      overlap_counts.total_terms,
      overlap_counts.matched_terms::double precision / nullif(overlap_counts.total_terms, 0) as overlap_ratio,
      row_number() over (
        partition by c.id
        order by
          overlap_counts.matched_terms::double precision / nullif(overlap_counts.total_terms, 0) desc,
          overlap_counts.matched_terms desc,
          sc.chunk_index
      ) as rank_for_claim
    from public.claims c
    join public.personalities p on p.id = c.personality_id
    join public.claim_sources cs on cs.claim_id = c.id and cs.relationship = 'supports'
    join public.sources s on s.id = cs.source_id and s.source_status = 'approved'
    join public.source_chunks sc on sc.source_id = s.id and sc.is_active
    join public.chunk_personalities cp on cp.chunk_id = sc.id and cp.personality_id = c.personality_id
    join lateral (
      select
        count(*)::integer as total_terms,
        count(*) filter (
          where position(' ' || term || ' ' in ' ' || lower(regexp_replace(sc.chunk_text, '[^a-z0-9]+', ' ', 'g')) || ' ') > 0
        )::integer as matched_terms
      from (
        select distinct term
        from regexp_split_to_table(
          lower(regexp_replace(coalesce(cs.evidence_excerpt, '') || ' ' || c.claim_text, '[^a-z0-9]+', ' ', 'g')),
          '\s+'
        ) as term
        where length(term) >= 4
          and term not in (
            'about', 'after', 'again', 'also', 'been', 'being', 'from', 'have', 'into', 'more',
            'should', 'that', 'their', 'there', 'these', 'they', 'this', 'those', 'through', 'under',
            'very', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'vishvamitra', 'vishwamitra'
          )
      ) terms
    ) overlap_counts on overlap_counts.total_terms > 0
    where p.canonical_name = 'Vishvamitra'
      and c.review_status = 'approved'
  ),
  selected as (
    select
      claim_id,
      chunk_id,
      claim_source_id,
      matched_terms,
      total_terms,
      overlap_ratio,
      least(0.96, 0.76 + least(0.12, matched_terms * 0.02) + least(0.08, overlap_ratio * 0.20)) as confidence
    from pairs
    where matched_terms >= minimum_matched_terms
      and overlap_ratio >= minimum_overlap_ratio
      and rank_for_claim <= maximum_links_per_claim
  ),
  upserted as (
    insert into public.claim_chunks(claim_id, chunk_id, relationship, confidence, link_method, metadata)
    select
      claim_id,
      chunk_id,
      'supports',
      confidence,
      'curated_source_token_overlap',
      jsonb_build_object(
        'claim_source_id', claim_source_id,
        'matched_terms', matched_terms,
        'total_terms', total_terms,
        'overlap_ratio', overlap_ratio,
        'backfill_batch_key', 'vishvamitra-master-corpus-2026-09-23',
        'backfilled_by', 'system_test_bulk_approval'
      )
    from selected
    on conflict (claim_id, chunk_id) do update set
      confidence = greatest(coalesce(claim_chunks.confidence, 0), excluded.confidence),
      link_method = case
        when coalesce(claim_chunks.confidence, 0) >= excluded.confidence then claim_chunks.link_method
        else excluded.link_method
      end,
      metadata = claim_chunks.metadata || excluded.metadata
    returning claim_id
  )
  select count(*), count(distinct claim_id) into affected, linked from upserted;

  return query select affected, linked;
end;
$$;

revoke execute on function public.backfill_vishvamitra_claim_chunks_overlap(integer, double precision, integer) from public, anon, authenticated;
grant execute on function public.backfill_vishvamitra_claim_chunks_overlap(integer, double precision, integer) to service_role;

comment on function public.backfill_vishvamitra_claim_chunks_overlap(integer, double precision, integer) is
  'Backfills confidence-labelled claim passage links by significant-term overlap, strictly within existing curated claim-source relationships.';
