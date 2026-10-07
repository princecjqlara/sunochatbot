-- These tables are accessed through authenticated server routes and workers.
BEGIN;

ALTER TABLE public.page_activity_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_sync_leases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.page_activity_history FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.page_sync_leases FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.page_activity_history TO postgres, service_role;
GRANT ALL ON public.page_sync_leases TO postgres, service_role;

INSERT INTO app_private.schema_migrations (version, description)
VALUES ('20261005_001', 'Restrict internal Page history and sync leases to server access')
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description;

NOTIFY pgrst, 'reload schema';
COMMIT;
