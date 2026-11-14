BEGIN;
-- Song delivery declarations are work evidence, never payment verification.
CREATE TABLE suno_song_work_requests (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES veo_tenants(id),actor_id uuid NOT NULL REFERENCES veo_accounts(user_id),
 chat_id bigint NOT NULL,action text NOT NULL,order_id uuid REFERENCES veo_orders(id),created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes'
);
ALTER TABLE suno_song_work_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON suno_song_work_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON suno_song_work_requests TO service_role;
CREATE FUNCTION suno_telegram_song_work(p_tenant uuid,p_telegram bigint,p_chat bigint,p_action text,p_data jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE scope jsonb;actor uuid;ids uuid[];req suno_song_work_requests;o veo_orders;request_id uuid;lines text;item record;markup jsonb;
BEGIN
 scope:=veo_telegram_intake_context(p_tenant,p_telegram,p_chat);actor:=(scope->>'actor_id')::uuid;
 SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(scope->'page_ids');
 request_id:=(p_data->>'request_id')::uuid;
 IF request_id IS NULL OR p_action NOT IN('list','sent','revision','render') THEN RAISE EXCEPTION 'Invalid song work request';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('suno-song:'||request_id::text,0));
 SELECT * INTO req FROM suno_song_work_requests WHERE id=request_id;
 IF req.id IS NOT NULL AND (req.tenant_id,req.actor_id,req.chat_id) IS DISTINCT FROM(p_tenant,actor,p_chat) THEN RAISE EXCEPTION 'Song request identity changed' USING ERRCODE='42501';END IF;
 IF p_action='render' THEN
  IF req.id IS NULL OR req.expires_at<=now() THEN RAISE EXCEPTION 'Song controls expired' USING ERRCODE='42501';END IF;
 ELSE
  IF req.id IS NULL THEN
   IF p_action IN('sent','revision') THEN
    SELECT x.* INTO o FROM veo_orders x LEFT JOIN veo_order_work w ON w.order_id=x.id
    WHERE x.id=(p_data->>'order_id')::uuid AND x.tenant_id=p_tenant AND x.page_id=ANY(ids) AND coalesce(w.assignee_id,x.seller_id)=actor
    AND NOT EXISTS(SELECT 1 FROM veo_client_claims c WHERE c.contact_id=x.contact_id AND c.user_id IS DISTINCT FROM actor) FOR UPDATE OF x;
    IF o.id IS NULL THEN RAISE EXCEPTION 'Song is outside your current assignment or Page access' USING ERRCODE='42501';END IF;
    PERFORM veo_work_action(actor,'fulfillment',jsonb_build_object('order_id',o.id,'status',CASE WHEN p_action='sent' THEN 'delivered' ELSE 'working' END,
      'reason',CASE WHEN p_action='sent' THEN 'Owner reported SONG SENT in Telegram; client receipt and payment are independently recorded' ELSE 'Owner reported a song revision in Telegram' END));
   END IF;
   INSERT INTO suno_song_work_requests(id,tenant_id,actor_id,chat_id,action,order_id) VALUES(request_id,p_tenant,actor,p_chat,p_action,o.id) RETURNING * INTO req;
  ELSIF req.action<>p_action OR req.order_id IS DISTINCT FROM NULLIF(p_data->>'order_id','')::uuid THEN RAISE EXCEPTION 'Song request content changed';END IF;
  RETURN jsonb_build_object('request_id',request_id,'chat_id',p_chat,'telegram_user_id',p_telegram);
 END IF;
 IF req.order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM veo_orders x LEFT JOIN veo_order_work w ON w.order_id=x.id
   WHERE x.id=req.order_id AND x.page_id=ANY(ids) AND coalesce(w.assignee_id,x.seller_id)=actor
   AND NOT EXISTS(SELECT 1 FROM veo_client_claims c WHERE c.contact_id=x.contact_id AND c.user_id IS DISTINCT FROM actor)) THEN RAISE EXCEPTION 'Song assignment changed' USING ERRCODE='42501';END IF;
 lines:='Suno song work'||E'\n'||CASE req.action WHEN 'sent' THEN 'Song delivery declaration saved. Payment and earnings are unchanged.' WHEN 'revision' THEN 'Song reopened for revision. Payment and original seller are unchanged.' ELSE 'Your current songs:' END;
 FOR item IN SELECT x.id,x.contact_id,x.page_id,c.name,coalesce(w.status,'working') AS status,w.reason FROM veo_orders x JOIN contacts c ON c.id=x.contact_id
 LEFT JOIN veo_order_work w ON w.order_id=x.id WHERE x.tenant_id=p_tenant AND x.page_id=ANY(ids) AND coalesce(w.assignee_id,x.seller_id)=actor
 AND (req.order_id IS NOT NULL AND x.id=req.order_id OR req.order_id IS NULL AND coalesce(w.status,'working')<>'delivered') ORDER BY x.created_at DESC LIMIT 10 LOOP
  lines:=lines||E'\n'||left(coalesce(item.name,'Customer'),60)||': '||item.status||E'\nOrder: '||item.id::text;
 END LOOP;
 lines:=lines||E'\nUse SONG SENT <order UUID> after client delivery, or SONG REVISION <order UUID> to reopen work. These are self-reported work declarations.';
 RETURN jsonb_build_object('request_id',request_id,'chat_id',p_chat,'telegram_user_id',p_telegram,'thread_id',scope->'thread_id','text',lines);
END $$;
REVOKE ALL ON FUNCTION suno_telegram_song_work(uuid,bigint,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION suno_telegram_song_work(uuid,bigint,bigint,text,jsonb) TO service_role;
ALTER TABLE veo_tenants ALTER COLUMN name SET DEFAULT 'Suno';
NOTIFY pgrst,'reload schema';
COMMIT;
