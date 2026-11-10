-- The site reads and writes only through the server-side service_role key, so the
-- public API roles need no table privileges. TRUNCATE in particular bypasses
-- row-level security. Remove the leftovers and stop future tables inheriting them.
REVOKE REFERENCES, TRIGGER, TRUNCATE, MAINTAIN ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE REFERENCES, TRIGGER, TRUNCATE, MAINTAIN ON TABLES FROM anon, authenticated;
