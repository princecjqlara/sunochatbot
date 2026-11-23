-- Correct only the known Unix-seconds-as-milliseconds error, grounded in the
-- independent contact creation time. Preserve every unsupported historical date.
BEGIN;
CREATE TABLE app_private.suno_inquiry_date_repairs(
 relation_name text NOT NULL,record_id uuid NOT NULL,column_name text NOT NULL,
 old_value timestamptz NOT NULL,new_value timestamptz NOT NULL,reference_created_at timestamptz NOT NULL,
 repaired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL DEFAULT 'Unix seconds interpreted as milliseconds; independent creation time agrees',
 PRIMARY KEY(relation_name,record_id,column_name,old_value)
);
REVOKE ALL ON app_private.suno_inquiry_date_repairs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON app_private.suno_inquiry_date_repairs TO service_role;

CREATE FUNCTION app_private.suno_supported_inquiry_time(p_value timestamptz,p_created timestamptz,p_asof timestamptz) RETURNS timestamptz
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN p_value>='1970-01-01T00:00:00Z'::timestamptz AND p_value<'1971-01-01T00:00:00Z'::timestamptz
  AND to_timestamp(extract(epoch FROM p_value)*1000) BETWEEN '2000-01-01T00:00:00Z'::timestamptz AND p_asof+interval '1 minute'
  AND to_timestamp(extract(epoch FROM p_value)*1000) BETWEEN p_created-interval '1 day' AND p_created+interval '1 minute'
 THEN to_timestamp(extract(epoch FROM p_value)*1000) ELSE p_value END
$$;
CREATE FUNCTION app_private.suno_guard_contact_inquiry_time() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE corrected timestamptz;BEGIN
 corrected:=app_private.suno_supported_inquiry_time(NEW.first_interaction_at,NEW.created_at,statement_timestamp());
 IF corrected IS DISTINCT FROM NEW.first_interaction_at THEN
  INSERT INTO app_private.suno_inquiry_date_repairs(relation_name,record_id,column_name,old_value,new_value,reference_created_at)
   VALUES('contacts',NEW.id,'first_interaction_at',NEW.first_interaction_at,corrected,NEW.created_at) ON CONFLICT DO NOTHING;
  NEW.first_interaction_at:=corrected;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION app_private.suno_guard_source_inquiry_time() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE reference timestamptz;corrected timestamptz;BEGIN
 SELECT created_at INTO reference FROM contacts WHERE id=NEW.contact_id AND page_id=NEW.page_id;
 corrected:=app_private.suno_supported_inquiry_time(NEW.first_inquiry_at,reference,statement_timestamp());
 IF corrected IS DISTINCT FROM NEW.first_inquiry_at THEN
  INSERT INTO app_private.suno_inquiry_date_repairs(relation_name,record_id,column_name,old_value,new_value,reference_created_at)
   VALUES('ad_contact_sources',NEW.contact_id,'first_inquiry_at',NEW.first_inquiry_at,corrected,reference) ON CONFLICT DO NOTHING;
  NEW.first_inquiry_at:=corrected;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER suno_guard_contact_inquiry_time BEFORE INSERT OR UPDATE OF first_interaction_at ON public.contacts
 FOR EACH ROW EXECUTE FUNCTION app_private.suno_guard_contact_inquiry_time();
CREATE TRIGGER suno_guard_source_inquiry_time BEFORE INSERT OR UPDATE OF first_inquiry_at ON public.ad_contact_sources
 FOR EACH ROW EXECUTE FUNCTION app_private.suno_guard_source_inquiry_time();
-- Trigger the guarded correction without substituting a record-creation date
-- for an inquiry. Every changed timestamp retains its original precision.
UPDATE contacts SET first_interaction_at=first_interaction_at
 WHERE app_private.suno_supported_inquiry_time(first_interaction_at,created_at,statement_timestamp()) IS DISTINCT FROM first_interaction_at;
UPDATE ad_contact_sources s SET first_inquiry_at=s.first_inquiry_at FROM contacts c
 WHERE c.id=s.contact_id AND c.page_id=s.page_id AND app_private.suno_supported_inquiry_time(s.first_inquiry_at,c.created_at,statement_timestamp()) IS DISTINCT FROM s.first_inquiry_at;
REVOKE ALL ON FUNCTION app_private.suno_supported_inquiry_time(timestamptz,timestamptz,timestamptz),app_private.suno_guard_contact_inquiry_time(),app_private.suno_guard_source_inquiry_time() FROM PUBLIC,anon,authenticated;
INSERT INTO app_private.schema_migrations(version,description) VALUES('202611240102','Evidence-bounded inquiry timestamp repairs and guards; preserve original chatbot implementation');
COMMIT;
