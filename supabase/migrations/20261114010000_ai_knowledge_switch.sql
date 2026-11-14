-- One website setting controls whether AI may add sources and facts to the research database.
--
-- The setting is demand_budget_policy.auto_admission_paused, shown in Resources > Knowledge as
-- "AI can add sources and facts" (checked = not paused). The application checks it before any AI
-- write; these triggers enforce it inside the database as well, for every path:
--   * claims or library sources approved by a machine origin
--     ('automated_evidence_verification' for live-research and harvest admission,
--      'verified_auto' for admin corpus expansion), on insert or when an update approves them;
--   * new entries in the AI research registry (knowledge_sources).
-- People can still approve, edit, reject and suspend anything while AI additions are off.

COMMENT ON COLUMN public.demand_budget_policy.auto_admission_paused IS
  'Website setting "AI can add sources and facts", inverted: true means AI may not add sources, claims or registry entries.';

CREATE OR REPLACE FUNCTION public.ai_knowledge_additions_paused()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  -- Fail closed: a missing policy row counts as paused.
  SELECT coalesce((SELECT auto_admission_paused FROM public.demand_budget_policy WHERE id = true), true);
$$;

CREATE OR REPLACE FUNCTION public.guard_ai_claim_additions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.approval_origin IN ('automated_evidence_verification', 'verified_auto')
    AND NEW.review_status = 'approved'
    AND (TG_OP = 'INSERT' OR OLD.review_status IS DISTINCT FROM 'approved' OR OLD.approval_origin IS DISTINCT FROM NEW.approval_origin)
    AND public.ai_knowledge_additions_paused() THEN
    RAISE EXCEPTION 'AI additions are turned off in the website settings' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_ai_source_additions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.approval_origin IN ('automated_evidence_verification', 'verified_auto')
    AND NEW.source_status = 'approved'
    AND (TG_OP = 'INSERT' OR OLD.source_status IS DISTINCT FROM 'approved' OR OLD.approval_origin IS DISTINCT FROM NEW.approval_origin)
    AND public.ai_knowledge_additions_paused() THEN
    RAISE EXCEPTION 'AI additions are turned off in the website settings' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_ai_registry_additions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.ai_knowledge_additions_paused() THEN
    RAISE EXCEPTION 'AI additions are turned off in the website settings' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- Replaces the narrower insert-only guard from 20261018030000.
DROP TRIGGER IF EXISTS guard_demand_auto_admission_trigger ON public.claims;

DROP TRIGGER IF EXISTS guard_ai_claim_additions_trigger ON public.claims;
CREATE TRIGGER guard_ai_claim_additions_trigger BEFORE INSERT OR UPDATE ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.guard_ai_claim_additions();

DROP TRIGGER IF EXISTS guard_ai_source_additions_trigger ON public.sources;
CREATE TRIGGER guard_ai_source_additions_trigger BEFORE INSERT OR UPDATE ON public.sources
  FOR EACH ROW EXECUTE FUNCTION public.guard_ai_source_additions();

DROP TRIGGER IF EXISTS guard_ai_registry_additions_trigger ON public.knowledge_sources;
CREATE TRIGGER guard_ai_registry_additions_trigger BEFORE INSERT ON public.knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION public.guard_ai_registry_additions();

REVOKE EXECUTE ON FUNCTION public.ai_knowledge_additions_paused() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_ai_claim_additions() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_ai_source_additions() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_ai_registry_additions() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_knowledge_additions_paused() TO service_role;
