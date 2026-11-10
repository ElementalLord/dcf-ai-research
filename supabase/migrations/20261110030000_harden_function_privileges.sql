-- Security advisor cleanup before the ownership transfer.
-- These are trigger / event-trigger functions; Postgres checks EXECUTE only when a
-- trigger is created, not when it fires, so revoking it does not change behaviour.
-- It removes them from the anon/authenticated RPC surface (/rest/v1/rpc/...).
REVOKE EXECUTE ON FUNCTION public.guard_demand_auto_admission() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.suspend_demand_claim_passages() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- Pin search_path so the trigger cannot resolve objects from a caller-controlled schema.
ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;
