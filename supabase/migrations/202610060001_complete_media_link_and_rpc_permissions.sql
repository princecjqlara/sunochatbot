BEGIN;

ALTER TABLE public.chatbot_knowledge_documents
  ADD COLUMN IF NOT EXISTS media_asset_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.chatbot_knowledge_documents'::regclass
      AND conname = 'chatbot_knowledge_documents_media_asset_id_fkey'
  ) THEN
    ALTER TABLE public.chatbot_knowledge_documents
      ADD CONSTRAINT chatbot_knowledge_documents_media_asset_id_fkey
      FOREIGN KEY (media_asset_id) REFERENCES public.chatbot_media_assets(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_chatbot_knowledge_documents_media_asset
  ON public.chatbot_knowledge_documents(media_asset_id)
  WHERE media_asset_id IS NOT NULL;

DO $$
DECLARE
  app_function RECORD;
BEGIN
  FOR app_function IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', app_function.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres, service_role', app_function.signature);
  END LOOP;
END;
$$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

INSERT INTO app_private.schema_migrations (version, description)
VALUES ('20261006_001', 'Complete media reverse linkage and restrict privileged application RPCs to server access')
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description;

ALTER TABLE app_private.sunobot_migration_files ADD COLUMN IF NOT EXISTS sql_text TEXT;
NOTIFY pgrst, 'reload schema';
COMMIT;
