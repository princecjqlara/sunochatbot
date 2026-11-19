-- Link direct Suno sales to song work without financial or chatbot effects.
BEGIN;
CREATE TABLE public.suno_sale_work(
 sale_id uuid PRIMARY KEY REFERENCES suno_sales(id),assignee_id uuid NOT NULL REFERENCES veo_accounts(user_id),
 status text NOT NULL DEFAULT 'working' CHECK(status IN('working','revision','sent')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),reason text NOT NULL DEFAULT 'Song work opened from sale',
 updated_by uuid NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.suno_sale_work_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,sale_id uuid NOT NULL REFERENCES suno_sales(id),
 actor_id uuid NOT NULL REFERENCES users(id),source text NOT NULL CHECK(source IN('web','telegram')),
 before_value jsonb NOT NULL,after_value jsonb NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE app_private.suno_sale_work_requests(
 request_id uuid PRIMARY KEY,actor_id uuid NOT NULL REFERENCES users(id),payload jsonb NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE app_private.suno_song_direct_requests(
 request_id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES veo_tenants(id),actor_id uuid NOT NULL REFERENCES users(id),
 chat_id bigint NOT NULL,action text NOT NULL CHECK(action IN('sent','revision')),sale_id uuid NOT NULL REFERENCES suno_sales(id),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '15 minutes',created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX suno_sale_work_assignee ON suno_sale_work(assignee_id,status,updated_at DESC);
CREATE INDEX suno_sale_work_history ON suno_sale_work_events(sale_id,created_at DESC,id DESC);
ALTER TABLE suno_sale_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE suno_sale_work_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON suno_sale_work,suno_sale_work_events,app_private.suno_sale_work_requests,app_private.suno_song_direct_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON suno_sale_work,suno_sale_work_events TO service_role;
CREATE FUNCTION app_private.suno_open_sale_work() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO suno_sale_work(sale_id,assignee_id,updated_by) VALUES(NEW.id,NEW.payee_id,NEW.created_by);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.suno_open_sale_work() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER suno_open_sale_work AFTER INSERT ON suno_sales FOR EACH ROW EXECUTE FUNCTION app_private.suno_open_sale_work();
-- Existing direct-sales records receive work metadata, never a paid/sent claim.
INSERT INTO suno_sale_work(sale_id,assignee_id,updated_by)
SELECT id,payee_id,created_by FROM suno_sales ON CONFLICT DO NOTHING;

CREATE FUNCTION public.suno_song_work_action(p_actor uuid,p_data jsonb,p_source text DEFAULT 'web') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE scope jsonb;sale suno_sales;work suno_sale_work;previous jsonb;old app_private.suno_sale_work_requests;
 request uuid;new_status text;new_assignee uuid;work_reason text;expected integer;result jsonb;workers uuid[];
BEGIN
 scope:=veo_scope(p_actor);IF scope IS NULL OR scope->>'launch_at' IS NULL THEN RAISE EXCEPTION 'Workspace access required' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR p_source IS NULL OR p_source NOT IN('web','telegram') THEN RAISE EXCEPTION 'Invalid song work action' USING ERRCODE='22023';END IF;
 request:=(p_data->>'request_id')::uuid;IF request IS NULL THEN RAISE EXCEPTION 'A request ID is required' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(request::text,821120102));
 SELECT array_agg(value::uuid) INTO workers FROM jsonb_array_elements_text(scope->'worker_ids');
 SELECT s.* INTO sale FROM suno_sales s WHERE s.id=(p_data->>'sale_id')::uuid;
 SELECT w.* INTO work FROM suno_sale_work w WHERE w.sale_id=sale.id FOR UPDATE;
 IF sale.id IS NULL OR work.sale_id IS NULL OR sale.tenant_id<>(scope->>'tenant_id')::uuid OR NOT coalesce(veo_can_page(p_actor,sale.page_id),false)
  OR NOT coalesce(work.assignee_id=ANY(workers),false) THEN RAISE EXCEPTION 'Current song assignment access required' USING ERRCODE='42501';END IF;
 SELECT * INTO old FROM app_private.suno_sale_work_requests WHERE request_id=request;
 IF FOUND THEN
  IF old.actor_id<>p_actor OR old.payload<>(p_data||jsonb_build_object('source',p_source)) THEN RAISE EXCEPTION 'Request ID already used for different song data' USING ERRCODE='23505';END IF;
  RETURN old.result;
 END IF;
 expected:=(p_data->>'expected_version')::integer;
 IF expected IS NULL OR expected<>work.version THEN RAISE EXCEPTION 'Song work changed. Refresh before saving.' USING ERRCODE='40001';END IF;
 work_reason:=btrim(p_data->>'reason');IF work_reason IS NULL OR length(work_reason) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Enter a work update reason of 3 to 500 characters' USING ERRCODE='22023';END IF;
 new_status:=coalesce(p_data->>'status',work.status);new_assignee:=coalesce((p_data->>'assignee_id')::uuid,work.assignee_id);
 IF new_status NOT IN('working','revision','sent') THEN RAISE EXCEPTION 'Choose working, revision or reported sent' USING ERRCODE='22023';END IF;
 IF new_assignee<>work.assignee_id AND (scope->>'role'='member' OR NOT coalesce(new_assignee=ANY(workers),false) OR NOT coalesce(veo_can_page(new_assignee,sale.page_id),false)
  OR NOT EXISTS(SELECT 1 FROM veo_accounts a JOIN users u ON u.id=a.user_id AND u.is_active WHERE a.user_id=new_assignee AND a.tenant_id=sale.tenant_id AND a.active)) THEN
  RAISE EXCEPTION 'A supervisor can assign a currently authorized Makata in their branch' USING ERRCODE='42501';END IF;
 previous:=to_jsonb(work);
 IF new_status IS DISTINCT FROM work.status OR new_assignee IS DISTINCT FROM work.assignee_id THEN
  UPDATE suno_sale_work SET status=new_status,assignee_id=new_assignee,version=version+1,reason=work_reason,updated_by=p_actor,updated_at=clock_timestamp() WHERE sale_id=sale.id RETURNING * INTO work;
  INSERT INTO suno_sale_work_events(sale_id,actor_id,source,before_value,after_value,reason) VALUES(sale.id,p_actor,p_source,previous,to_jsonb(work),work_reason);
  INSERT INTO veo_audit(tenant_id,actor_id,action,entity_id,after_value) VALUES(sale.tenant_id,p_actor,'suno_song_work',sale.id,to_jsonb(work));
 END IF;
 result:=jsonb_build_object('sale_id',sale.id,'status',work.status,'assignee_id',work.assignee_id,'version',work.version,'payments_changed',false,'earnings_changed',false);
 INSERT INTO app_private.suno_sale_work_requests(request_id,actor_id,payload,result) VALUES(request,p_actor,p_data||jsonb_build_object('source',p_source),result);
 RETURN result;
END $$;

CREATE FUNCTION public.suno_song_work_report(p_actor uuid,p_page uuid DEFAULT NULL,p_sale uuid DEFAULT NULL,p_status text DEFAULT 'all',p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE scope jsonb;result jsonb;BEGIN
 scope:=veo_scope(p_actor);IF scope IS NULL OR scope->>'launch_at' IS NULL THEN RAISE EXCEPTION 'Workspace access required' USING ERRCODE='42501';END IF;
 IF p_status IS NULL OR p_status NOT IN('all','working','revision','sent') OR p_offset IS NULL OR p_offset<0 OR p_offset>10000000 THEN RAISE EXCEPTION 'Invalid song work filters' USING ERRCODE='22023';END IF;
 IF p_page IS NOT NULL AND NOT coalesce(veo_can_page(p_actor,p_page),false) THEN RAISE EXCEPTION 'Page access required' USING ERRCODE='42501';END IF;
 IF p_sale IS NOT NULL AND NOT EXISTS(SELECT 1 FROM suno_sale_work w JOIN suno_sales s ON s.id=w.sale_id WHERE s.id=p_sale AND s.tenant_id=(scope->>'tenant_id')::uuid
  AND veo_can_page(p_actor,s.page_id) AND w.assignee_id IN(SELECT value::uuid FROM jsonb_array_elements_text(scope->'worker_ids'))) THEN RAISE EXCEPTION 'Song assignment access required' USING ERRCODE='42501';END IF;
 WITH visible AS (
  SELECT s.id sale_id,s.page_id,s.contact_id,s.description,s.payee_id,w.assignee_id,w.status,w.version,w.reason,w.updated_at,
   c.name contact_name,p.name page_name,u.name assignee_name,earner.name payee_name
  FROM suno_sale_work w JOIN suno_sales s ON s.id=w.sale_id JOIN contacts c ON c.id=s.contact_id JOIN pages p ON p.id=s.page_id
  JOIN users u ON u.id=w.assignee_id JOIN users earner ON earner.id=s.payee_id
  WHERE s.tenant_id=(scope->>'tenant_id')::uuid AND veo_can_page(p_actor,s.page_id)
   AND w.assignee_id IN(SELECT value::uuid FROM jsonb_array_elements_text(scope->'worker_ids'))
   AND (p_page IS NULL OR s.page_id=p_page) AND (p_sale IS NULL OR s.id=p_sale) AND (p_status='all' OR w.status=p_status)
 )
 SELECT jsonb_build_object('scope',scope,'total',(SELECT count(*) FROM visible),'offset',p_offset,'items',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY updated_at DESC,sale_id) FROM(
  SELECT v.*,(SELECT coalesce(jsonb_agg(to_jsonb(history) ORDER BY created_at DESC,id DESC),'[]'::jsonb) FROM(
   SELECT e.id,e.actor_id,e.source,e.reason,e.created_at,e.before_value->>'status' old_status,e.after_value->>'status' status,
    e.before_value->>'assignee_id' old_assignee_id,e.after_value->>'assignee_id' assignee_id FROM suno_sale_work_events e WHERE e.sale_id=v.sale_id ORDER BY e.created_at DESC,e.id DESC LIMIT 10) history) history
  FROM visible v ORDER BY updated_at DESC,sale_id LIMIT 25 OFFSET p_offset) x),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;

ALTER FUNCTION public.suno_telegram_song_work(uuid,bigint,bigint,text,jsonb) RENAME TO suno_telegram_song_work_before_direct_sales;
CREATE FUNCTION public.suno_telegram_song_work(p_tenant uuid,p_telegram bigint,p_chat bigint,p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE context jsonb;actor uuid;pages uuid[];request uuid;req app_private.suno_song_direct_requests;
 sale suno_sales;work suno_sale_work;lines text;item record;original jsonb;change jsonb;wanted text;extra text;
BEGIN
 context:=veo_telegram_intake_context(p_tenant,p_telegram,p_chat);actor:=(context->>'actor_id')::uuid;
 IF actor IS NULL THEN RAISE EXCEPTION 'Verified Telegram identity required' USING ERRCODE='42501';END IF;
 SELECT array_agg(value::uuid) INTO pages FROM jsonb_array_elements_text(context->'page_ids');
 request:=(p_data->>'request_id')::uuid;
 IF request IS NULL OR p_action IS NULL OR p_action NOT IN('list','sent','revision','render') THEN RAISE EXCEPTION 'Invalid song work request' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('suno-song:'||request::text,0));
 SELECT * INTO req FROM app_private.suno_song_direct_requests WHERE request_id=request;
 IF req.request_id IS NOT NULL AND (req.tenant_id,req.actor_id,req.chat_id) IS DISTINCT FROM(p_tenant,actor,p_chat) THEN RAISE EXCEPTION 'Song request identity changed' USING ERRCODE='42501';END IF;
 IF p_action IN('sent','revision') THEN
  SELECT * INTO sale FROM suno_sales WHERE id=(p_data->>'order_id')::uuid;
  IF sale.id IS NULL AND req.request_id IS NULL THEN RETURN suno_telegram_song_work_before_direct_sales(p_tenant,p_telegram,p_chat,p_action,p_data);END IF;
  SELECT * INTO work FROM suno_sale_work WHERE sale_id=sale.id FOR UPDATE;
  IF sale.tenant_id IS DISTINCT FROM p_tenant OR NOT coalesce(sale.page_id=ANY(pages),false) OR work.assignee_id IS DISTINCT FROM actor OR NOT coalesce(veo_can_page(actor,sale.page_id),false) THEN RAISE EXCEPTION 'Song is outside your current assignment or Page access' USING ERRCODE='42501';END IF;
  IF req.request_id IS NOT NULL THEN
   IF req.action<>p_action OR req.sale_id<>sale.id THEN RAISE EXCEPTION 'Song request content changed' USING ERRCODE='23505';END IF;
  ELSE
   IF EXISTS(SELECT 1 FROM suno_song_work_requests WHERE id=request) THEN RAISE EXCEPTION 'Song request reference already used' USING ERRCODE='23505';END IF;
   wanted:=CASE p_action WHEN 'sent' THEN 'sent' ELSE 'revision' END;
   change:=suno_song_work_action(actor,jsonb_build_object('request_id',request,'sale_id',sale.id,'expected_version',work.version,'status',wanted,
    'reason',CASE p_action WHEN 'sent' THEN 'Makata reported SONG SENT in Telegram' ELSE 'Makata reported SONG REVISION in Telegram' END),'telegram');
   INSERT INTO app_private.suno_song_direct_requests(request_id,tenant_id,actor_id,chat_id,action,sale_id) VALUES(request,p_tenant,actor,p_chat,p_action,sale.id);
  END IF;
  RETURN jsonb_build_object('request_id',request,'chat_id',p_chat,'telegram_user_id',p_telegram);
 END IF;
 IF req.request_id IS NOT NULL THEN
  IF p_action<>'render' OR req.expires_at<=now() THEN RAISE EXCEPTION 'Song controls expired' USING ERRCODE='42501';END IF;
  SELECT s.* INTO sale FROM suno_sales s JOIN suno_sale_work w ON w.sale_id=s.id WHERE s.id=req.sale_id AND w.assignee_id=actor;
  IF sale.id IS NULL OR NOT coalesce(sale.page_id=ANY(pages),false) OR NOT coalesce(veo_can_page(actor,sale.page_id),false) THEN RAISE EXCEPTION 'Song assignment changed' USING ERRCODE='42501';END IF;
  SELECT * INTO work FROM suno_sale_work WHERE sale_id=sale.id;
  lines:='Suno song work'||E'\n'||CASE req.action WHEN 'sent' THEN 'Song reported sent. This does not confirm client receipt.' ELSE 'Song reopened for revision. A paid revision fee is recorded separately.' END||E'\nPayments and earnings are unchanged.'||E'\nSale: '||sale.id::text||E'\nCurrent work status: '||work.status;
  RETURN jsonb_build_object('request_id',request,'chat_id',p_chat,'telegram_user_id',p_telegram,'thread_id',context->'thread_id','text',lines);
 END IF;
 original:=suno_telegram_song_work_before_direct_sales(p_tenant,p_telegram,p_chat,p_action,p_data);
 IF p_action='render' AND EXISTS(SELECT 1 FROM suno_song_work_requests WHERE id=request AND action='list') THEN
  extra:='';
  FOR item IN SELECT s.id,c.name,w.status FROM suno_sales s JOIN suno_sale_work w ON w.sale_id=s.id JOIN contacts c ON c.id=s.contact_id
   WHERE s.tenant_id=p_tenant AND s.page_id=ANY(pages) AND veo_can_page(actor,s.page_id) AND w.assignee_id=actor AND w.status<>'sent' ORDER BY w.updated_at DESC,s.id LIMIT 5 LOOP
   extra:=extra||E'\n'||left(coalesce(item.name,'Customer'),40)||': '||item.status||E'\nSale: '||item.id::text;
  END LOOP;
  IF extra<>'' THEN
   lines:='Suno Sales song work'||extra||E'\nUse SONG SENT <sale UUID> or SONG REVISION <sale UUID>. Work declarations do not change payments or earnings.';
   IF EXISTS(SELECT 1 FROM veo_orders WHERE tenant_id=p_tenant AND page_id=ANY(pages)) THEN lines:=lines||E'\nRetained order controls:'||E'\n'||left(original->>'text',700);END IF;
   original:=original||jsonb_build_object('text',lines);
  END IF;
 END IF;
 RETURN original;
END $$;

REVOKE ALL ON FUNCTION public.suno_song_work_action(uuid,jsonb,text),public.suno_song_work_report(uuid,uuid,uuid,text,integer),public.suno_telegram_song_work(uuid,bigint,bigint,text,jsonb),public.suno_telegram_song_work_before_direct_sales(uuid,bigint,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.suno_song_work_action(uuid,jsonb,text),public.suno_song_work_report(uuid,uuid,uuid,text,integer),public.suno_telegram_song_work(uuid,bigint,bigint,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.suno_telegram_song_work_before_direct_sales(uuid,bigint,bigint,text,jsonb) FROM service_role;
INSERT INTO app_private.schema_migrations(version,description) VALUES('202611200102','Direct Suno sale song work and retained Telegram protocol bridge') ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst,'reload schema';
COMMIT;
