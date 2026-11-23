-- A later intentional date correction must never be overwritten by rollback.
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM app_private.suno_inquiry_date_repairs r JOIN contacts c ON r.relation_name='contacts' AND c.id=r.record_id WHERE c.first_interaction_at IS DISTINCT FROM r.new_value)
 OR EXISTS(SELECT 1 FROM app_private.suno_inquiry_date_repairs r JOIN ad_contact_sources s ON r.relation_name='ad_contact_sources' AND s.contact_id=r.record_id WHERE s.first_inquiry_at IS DISTINCT FROM r.new_value)
 THEN RAISE EXCEPTION 'Inquiry dates changed after repair; reconcile the encrypted backup before rollback';END IF;
END $$;
DROP TRIGGER suno_guard_contact_inquiry_time ON contacts;
DROP TRIGGER suno_guard_source_inquiry_time ON ad_contact_sources;
UPDATE contacts c SET first_interaction_at=r.old_value FROM app_private.suno_inquiry_date_repairs r WHERE r.relation_name='contacts' AND c.id=r.record_id AND c.first_interaction_at=r.new_value;
UPDATE ad_contact_sources s SET first_inquiry_at=r.old_value FROM app_private.suno_inquiry_date_repairs r WHERE r.relation_name='ad_contact_sources' AND s.contact_id=r.record_id AND s.first_inquiry_at=r.new_value;
DROP FUNCTION app_private.suno_guard_contact_inquiry_time(),app_private.suno_guard_source_inquiry_time(),app_private.suno_supported_inquiry_time(timestamptz,timestamptz,timestamptz);
DROP TABLE app_private.suno_inquiry_date_repairs;
DELETE FROM app_private.schema_migrations WHERE version='202611240102';
DELETE FROM app_private.suno_workspace_migration_files WHERE filename='202611240102_suno_inquiry_timestamp_integrity.sql';
