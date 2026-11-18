BEGIN;
CREATE OR REPLACE FUNCTION public.suno_capture_retained_events(p_events jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item jsonb;event jsonb;entry jsonb;page uuid;contact uuid;prior timestamptz;at timestamptz;kind text;sender text;key text;captured integer:=0;BEGIN
 IF jsonb_typeof(p_events)<>'array' OR jsonb_array_length(p_events)>1000 OR octet_length(p_events::text)>5000000 THEN RAISE EXCEPTION 'Invalid retained event batch';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_events) LOOP
  page:=NULL;contact:=NULL;prior:=NULL;
  SELECT id INTO page FROM pages WHERE fb_page_id=item->>'facebook_page_id' AND veo_enabled AND veo_tenant_id IS NOT NULL;
  IF page IS NULL THEN CONTINUE;END IF;
  at:=(item->>'occurred_at')::timestamptz;key:=item->>'event_key';
  IF at IS NULL OR at>clock_timestamp()+interval '1 minute' OR length(key)>200 THEN RAISE EXCEPTION 'Invalid retained event identity/time';END IF;
  INSERT INTO veo_event_inbox(event_key,page_id,occurred_at,payload,status)
   VALUES(key,page,at,item->'payload','done') ON CONFLICT(event_key) DO NOTHING;
  -- Calendar metadata is captured by the inbox trigger. No chatbot callback is
  -- queued here: the retained handler already processed this exact event.
  captured:=captured+1;
  entry:=item#>'{payload,entry,0}';kind:=item->>'kind';event:=entry->kind->0;
  sender:=event#>>'{sender,id}';
  IF sender IS NULL OR sender=entry->>'id' OR event#>>'{message,is_echo}'='true' THEN CONTINUE;END IF;
  SELECT id,first_interaction_at INTO contact,prior FROM contacts WHERE page_id=page AND psid=sender;
  IF contact IS NULL THEN CONTINUE;END IF;
  PERFORM record_contact_ad_event(page,contact,key,at,
   CASE WHEN event ? 'postback' THEN 'postback' WHEN event ? 'message' THEN 'message' ELSE 'referral' END,
   event ? 'message' OR event ? 'postback',event#>>'{message,mid}',coalesce(event->'referral',event#>'{postback,referral}','{}'::jsonb),prior);
 END LOOP;
 RETURN captured;
END $$;
REVOKE ALL ON FUNCTION public.suno_capture_retained_events(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.suno_capture_retained_events(jsonb) TO service_role;
COMMIT;
