-- Run inside a transaction. Refuse to discard any real plan saved after release.
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM public.suno_work_plans) OR EXISTS(SELECT 1 FROM public.suno_page_budgets) THEN
  RAISE EXCEPTION 'Retain saved plans: roll back the app and preserve these additive tables';
 END IF;
END $$;
DROP FUNCTION public.suno_operations_plan(uuid,jsonb);
DROP FUNCTION public.suno_operations_report(uuid,date,date,uuid,date);
DROP TABLE public.suno_work_plans,public.suno_page_budgets;
DELETE FROM app_private.schema_migrations WHERE version='202611240101';
DELETE FROM app_private.suno_workspace_migration_files WHERE filename='202611240101_suno_operations_reports.sql';
NOTIFY pgrst,'reload schema';
