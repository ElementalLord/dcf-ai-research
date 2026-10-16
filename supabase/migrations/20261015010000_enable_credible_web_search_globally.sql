-- Ask should research every available person on the credible web. Preserve blocked
-- domain decisions, but remove the global allowlist mode that otherwise disables
-- both Google grounding and Brave discovery for profiles without registered sources.
update public.search_policy
set mode = 'credible_web', updated_at = now()
where id = true
  and mode = 'approved_domains_only';
