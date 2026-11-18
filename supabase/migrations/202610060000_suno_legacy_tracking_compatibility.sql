BEGIN;
-- Historical Suno repair SQL also runs in clean compatibility rehearsals.
-- The real Suno database already owns this private ledger.
CREATE SCHEMA IF NOT EXISTS app_private;
CREATE TABLE IF NOT EXISTS app_private.sunobot_migration_files(
 filename text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now(),sql_text text
);
REVOKE ALL ON app_private.sunobot_migration_files FROM PUBLIC,anon,authenticated;
COMMIT;
