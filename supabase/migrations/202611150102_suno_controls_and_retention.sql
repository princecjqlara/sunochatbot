BEGIN;
-- Profile controls must show the same human hold enforced by the delivery guard.
DO $$ DECLARE definition text;marker text:='WHEN s.status=''stopped''';BEGIN
 definition:=pg_get_functiondef('get_contact_controls(uuid,uuid[])'::regprocedure);
 IF strpos(definition,marker)=0 THEN RAISE EXCEPTION 'Contact controls implementation changed';END IF;
 definition:=replace(definition,marker,'WHEN s.human_pause_status IN (''paused'',''checking'',''held'') THEN ''human_handoff'' '||marker);
 EXECUTE definition;
END $$;
CREATE INDEX suno_song_work_request_retention ON suno_song_work_requests(created_at,id);
ALTER FUNCTION veo_storage_maintenance() RENAME TO veo_storage_maintenance_before_suno;
CREATE FUNCTION veo_storage_maintenance() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;removed integer:=0;BEGIN
 result:=veo_storage_maintenance_before_suno();
 IF NOT coalesce((result->>'skipped')::boolean,false) THEN
  WITH expired AS (SELECT id FROM suno_song_work_requests WHERE created_at<now()-interval '7 days' ORDER BY created_at,id LIMIT 500 FOR UPDATE SKIP LOCKED)
  DELETE FROM suno_song_work_requests r USING expired e WHERE r.id=e.id;
  GET DIAGNOSTICS removed=ROW_COUNT;
 END IF;
 RETURN result||jsonb_build_object('expired_song_controls_removed',removed);
END $$;
REVOKE ALL ON FUNCTION veo_storage_maintenance(),veo_storage_maintenance_before_suno() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION veo_storage_maintenance() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
