BEGIN;
-- Release the reviewed human pause and reserve its next follow-up in one
-- transaction. A concurrent delivery can never be reset by a stale review.
CREATE FUNCTION suno_finish_takeover_review(p_page uuid,p_contact uuid,p_human_message text,p_epoch integer,p_policy integer,p_anchor timestamptz)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c contacts;s chatbot_contact_states;cfg chatbot_configs;slots integer;chosen integer;queued uuid;BEGIN
 SELECT * INTO c FROM contacts WHERE id=p_contact AND page_id=p_page FOR UPDATE;
 SELECT * INTO s FROM chatbot_contact_states WHERE contact_id=p_contact AND page_id=p_page FOR UPDATE;
 SELECT * INTO cfg FROM chatbot_configs WHERE page_id=p_page FOR SHARE;
 IF c.id IS NULL OR s.id IS NULL OR cfg.page_id IS NULL OR s.human_pause_status IS DISTINCT FROM 'checking'
  OR s.human_message_id IS DISTINCT FROM p_human_message OR coalesce(s.automation_epoch,0) IS DISTINCT FROM p_epoch
  OR cfg.policy_revision IS DISTINCT FROM p_policy OR c.last_inbound_at IS DISTINCT FROM p_anchor
  OR s.status<>'active' OR c.chatbot_enabled IS FALSE OR NOT cfg.enabled
  OR (cfg.trial_mode_enabled AND cfg.trial_contact_id IS DISTINCT FROM p_contact)
  OR c.pipeline_stage IN('qualified','converted','order_created','not_qualified','opted_out')
  OR c.pipeline_stage_source IN('manual','messenger') OR chatbot_contact_sales_stop(p_page,p_contact) IS NOT NULL
  OR NOT app_private.veobot_page_automation_allowed(p_page)
 THEN RETURN jsonb_build_object('released',false,'scheduled',false);END IF;
 UPDATE chatbot_contact_states SET human_pause_status='released',human_hold_reason=NULL,updated_at=now() WHERE id=s.id;
 IF NOT cfg.follow_up_enabled OR p_anchor IS NULL OR p_anchor>now() OR p_anchor<=now()-interval '23 hours 59 minutes'
  OR s.window_expires_at<=now() THEN RETURN jsonb_build_object('released',true,'scheduled',false);END IF;
 slots:=least(10,coalesce(jsonb_array_length(to_jsonb(cfg.follow_up_quick_delays_minutes)),0));
 IF slots=0 OR EXISTS(SELECT 1 FROM chatbot_follow_up_jobs j WHERE j.page_id=p_page AND j.contact_id=p_contact AND j.anchor_inbound_at=p_anchor
    AND j.automation_epoch=p_epoch AND (j.status IN('processing','failed') OR j.message_id IS NOT NULL AND j.status<>'sent'))
  OR EXISTS(SELECT 1 FROM chatbot_follow_up_jobs j JOIN chatbot_message_deliveries d ON d.page_id=j.page_id AND d.contact_id=j.contact_id
    AND d.source_key LIKE 'follow-up:'||j.id::text||':%' WHERE j.page_id=p_page AND j.contact_id=p_contact AND j.anchor_inbound_at=p_anchor
    AND j.automation_epoch=p_epoch AND (d.status='reserved' OR j.status<>'sent'))
 THEN RETURN jsonb_build_object('released',true,'scheduled',false);END IF;
 SELECT n INTO chosen FROM generate_series(0,slots-1) n WHERE NOT EXISTS(SELECT 1 FROM chatbot_follow_up_jobs j
  WHERE j.page_id=p_page AND j.contact_id=p_contact AND j.anchor_inbound_at=p_anchor AND j.automation_epoch=p_epoch
  AND j.schedule_type='response' AND j.purpose='scheduled' AND j.sequence_index=n AND(j.status='sent' OR j.message_id IS NOT NULL)) ORDER BY n LIMIT 1;
 IF chosen IS NULL THEN RETURN jsonb_build_object('released',true,'scheduled',false);END IF;
 INSERT INTO chatbot_follow_up_jobs AS j(page_id,contact_id,anchor_inbound_at,schedule_type,sequence_index,automation_epoch,policy_revision,purpose,due_at,status,message_text)
 VALUES(p_page,p_contact,p_anchor,'response',chosen,p_epoch,p_policy,'scheduled',now(),'pending','AI-generated after human takeover review')
 ON CONFLICT(contact_id,anchor_inbound_at,schedule_type,sequence_index,automation_epoch,purpose) DO UPDATE
 SET due_at=least(j.due_at,EXCLUDED.due_at),status='pending',cancelled_at=NULL,error_message=NULL,updated_at=now()
 WHERE j.status IN('pending','cancelled') AND j.message_id IS NULL AND j.claimed_at IS NULL RETURNING id INTO queued;
 RETURN jsonb_build_object('released',true,'scheduled',queued IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION suno_finish_takeover_review(uuid,uuid,text,integer,integer,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION suno_finish_takeover_review(uuid,uuid,text,integer,integer,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
