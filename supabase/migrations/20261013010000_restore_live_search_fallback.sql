-- An empty domain allowlist disables both Google grounding and Brave fallback.
-- Restore the default credible-web policy only for that unusable configuration;
-- preserve every explicit allowlist and blocked-domain decision.
update public.search_policy
set mode = 'credible_web', updated_at = now()
where id = true
  and mode = 'approved_domains_only'
  and not exists (
    select 1 from public.search_source_rules where status = 'allowed'
  );
