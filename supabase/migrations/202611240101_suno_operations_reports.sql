-- Suno planning and reports use direct sales and song-work events. No pay gates.
BEGIN;
CREATE TABLE public.suno_work_plans(
 tenant_id uuid NOT NULL REFERENCES veo_tenants(id),worker_id uuid NOT NULL REFERENCES veo_accounts(user_id),
 page_id uuid NOT NULL REFERENCES pages(id),work_date date NOT NULL,
 capacity integer NOT NULL CHECK(capacity BETWEEN 0 AND 1000),quota integer NOT NULL CHECK(quota BETWEEN 0 AND capacity),
 availability text NOT NULL CHECK(availability IN('available','unavailable','unknown')),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),version integer NOT NULL DEFAULT 1,
 updated_by uuid NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(worker_id,page_id,work_date),CHECK(availability<>'unavailable' OR (capacity=0 AND quota=0))
);
CREATE TABLE public.suno_page_budgets(
 tenant_id uuid NOT NULL REFERENCES veo_tenants(id),page_id uuid NOT NULL REFERENCES pages(id),work_date date NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),planned_minor bigint NOT NULL CHECK(planned_minor BETWEEN 0 AND 9000000000000),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),version integer NOT NULL DEFAULT 1,
 updated_by uuid NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(page_id,work_date,currency)
);
ALTER TABLE suno_work_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE suno_page_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON suno_work_plans,suno_page_budgets FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON suno_work_plans,suno_page_budgets TO service_role;

CREATE FUNCTION public.suno_operations_plan(p_actor uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE scope jsonb;page uuid;worker uuid;day date;previous jsonb;result jsonb;expected integer;BEGIN
 scope:=veo_scope(p_actor);
 IF scope->>'launch_at' IS NULL OR coalesce(scope->>'role','') NOT IN('owner','team_leader','manager') THEN RAISE EXCEPTION 'Supervisor access required' USING ERRCODE='42501';END IF;
 page:=(p_data->>'page_id')::uuid;day:=(p_data->>'work_date')::date;expected:=(p_data->>'expected_version')::integer;
 IF NOT coalesce(veo_can_page(p_actor,page),false) THEN RAISE EXCEPTION 'Page access denied' USING ERRCODE='42501';END IF;
 IF day IS NULL OR day<(now() AT TIME ZONE 'Asia/Manila')::date OR day>(now() AT TIME ZONE 'Asia/Manila')::date+1
  OR expected IS NULL OR expected<0 OR length(btrim(coalesce(p_data->>'reason',''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Choose today or tomorrow and explain the plan' USING ERRCODE='22023';END IF;
 -- Serialize creation as well as updates; stale tabs cannot overwrite a plan.
 PERFORM pg_advisory_xact_lock(hashtextextended('suno_plan:'||page::text||':'||day::text,0));
 IF p_data->>'action'='capacity' THEN
  worker:=(p_data->>'worker_id')::uuid;
  IF NOT coalesce(worker IN(SELECT value::uuid FROM jsonb_array_elements_text(scope->'worker_ids')),false)
   OR NOT coalesce(veo_can_page(worker,page),false) OR NOT EXISTS(SELECT 1 FROM veo_accounts a JOIN users u ON u.id=a.user_id AND u.is_active WHERE a.user_id=worker AND a.active AND a.tenant_id=(scope->>'tenant_id')::uuid)
   THEN RAISE EXCEPTION 'Employee branch and Page access required' USING ERRCODE='42501';END IF;
  IF NOT coalesce((p_data->>'capacity')::integer BETWEEN 0 AND 1000,false) OR NOT coalesce((p_data->>'quota')::integer BETWEEN 0 AND (p_data->>'capacity')::integer,false)
   OR coalesce(p_data->>'availability','') NOT IN('available','unavailable','unknown') THEN RAISE EXCEPTION 'Enter a valid capacity, quota and availability' USING ERRCODE='22023';END IF;
  SELECT to_jsonb(p) INTO previous FROM suno_work_plans p WHERE p.worker_id=worker AND p.page_id=page AND p.work_date=day FOR UPDATE;
  IF coalesce((previous->>'version')::integer,0)<>expected THEN RAISE EXCEPTION 'Plan changed. Refresh before saving.' USING ERRCODE='40001';END IF;
  INSERT INTO suno_work_plans(tenant_id,worker_id,page_id,work_date,capacity,quota,availability,reason,updated_by)
   VALUES((scope->>'tenant_id')::uuid,worker,page,day,(p_data->>'capacity')::integer,(p_data->>'quota')::integer,p_data->>'availability',btrim(p_data->>'reason'),p_actor)
   ON CONFLICT(worker_id,page_id,work_date) DO UPDATE SET capacity=excluded.capacity,quota=excluded.quota,availability=excluded.availability,reason=excluded.reason,updated_by=p_actor,updated_at=clock_timestamp(),version=suno_work_plans.version+1
   RETURNING to_jsonb(suno_work_plans) INTO result;
 ELSIF p_data->>'action'='budget' THEN
  IF scope->>'role' NOT IN('owner','team_leader') THEN RAISE EXCEPTION 'Owner or Team Leader access required' USING ERRCODE='42501';END IF;
  IF NOT coalesce(p_data->>'currency' ~ '^[A-Z]{3}$',false) OR NOT coalesce((p_data->>'planned_minor')::bigint BETWEEN 0 AND 9000000000000,false) THEN RAISE EXCEPTION 'Enter a valid budget and currency' USING ERRCODE='22023';END IF;
  SELECT to_jsonb(p) INTO previous FROM suno_page_budgets p WHERE p.page_id=page AND p.work_date=day AND p.currency=p_data->>'currency' FOR UPDATE;
  IF coalesce((previous->>'version')::integer,0)<>expected THEN RAISE EXCEPTION 'Budget changed. Refresh before saving.' USING ERRCODE='40001';END IF;
  INSERT INTO suno_page_budgets(tenant_id,page_id,work_date,currency,planned_minor,reason,updated_by)
   VALUES((scope->>'tenant_id')::uuid,page,day,p_data->>'currency',(p_data->>'planned_minor')::bigint,btrim(p_data->>'reason'),p_actor)
   ON CONFLICT(page_id,work_date,currency) DO UPDATE SET planned_minor=excluded.planned_minor,reason=excluded.reason,updated_by=p_actor,updated_at=clock_timestamp(),version=suno_page_budgets.version+1
   RETURNING to_jsonb(suno_page_budgets) INTO result;
 ELSE RAISE EXCEPTION 'Choose a planning action' USING ERRCODE='22023';END IF;
 INSERT INTO veo_audit(tenant_id,actor_id,action,entity_id,after_value) VALUES((scope->>'tenant_id')::uuid,p_actor,'suno_'||(p_data->>'action')||'_plan',page,jsonb_build_object('before',previous,'after',result));
 RETURN result;
END $$;

CREATE FUNCTION public.suno_operations_report(p_actor uuid,p_from date,p_to date,p_page uuid DEFAULT NULL,p_day date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp SET jit=off SET statement_timeout='10s' AS $$
DECLARE scope jsonb;result jsonb;day date:=coalesce(p_day,(now() AT TIME ZONE 'Asia/Manila')::date);BEGIN
 scope:=veo_scope(p_actor);
 IF scope->>'launch_at' IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND is_active) THEN RAISE EXCEPTION 'Workspace access required' USING ERRCODE='42501';END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>92 OR p_to>(now() AT TIME ZONE 'Asia/Manila')::date
  OR p_from<((scope->>'launch_at')::timestamptz AT TIME ZONE 'Asia/Manila')::date
  OR day<((scope->>'launch_at')::timestamptz AT TIME ZONE 'Asia/Manila')::date OR day>(now() AT TIME ZONE 'Asia/Manila')::date+1 THEN RAISE EXCEPTION 'Choose up to 93 Philippine dates since launch and a planning date through tomorrow' USING ERRCODE='22023';END IF;
 IF p_page IS NOT NULL AND NOT coalesce(veo_can_page(p_actor,p_page),false) THEN RAISE EXCEPTION 'Page access denied' USING ERRCODE='42501';END IF;
 WITH visible_pages AS MATERIALIZED(
  SELECT p.id,p.name FROM pages p WHERE veo_can_page(p_actor,p.id) AND (p_page IS NULL OR p.id=p_page)
 ), inquiry_contacts AS MATERIALIZED(
  SELECT c.id,coalesce(s.first_inquiry_at,c.first_interaction_at) first_inquiry_at,
   s.attribution_status='verified_inline' AND nullif(s.origin_ad_id,'') IS NOT NULL origin_verified
   FROM contacts c JOIN visible_pages p ON p.id=c.page_id LEFT JOIN ad_contact_sources s ON s.contact_id=c.id AND s.page_id=c.page_id
   WHERE scope->>'role' IN('owner','team_leader')
 ), workers AS MATERIALIZED(
  SELECT a.user_id,u.name,a.role,a.parent_id FROM veo_accounts a JOIN users u ON u.id=a.user_id AND u.is_active
   WHERE a.tenant_id=(scope->>'tenant_id')::uuid AND a.active AND a.user_id IN(SELECT value::uuid FROM jsonb_array_elements_text(scope->'worker_ids'))
 ), sales AS MATERIALIZED(
  SELECT s.* FROM suno_sales s JOIN visible_pages p ON p.id=s.page_id JOIN workers w ON w.user_id=s.payee_id WHERE s.tenant_id=(scope->>'tenant_id')::uuid
 ), work AS MATERIALIZED(
  SELECT w.*,s.page_id,s.contact_id,s.description,s.created_at FROM suno_sale_work w JOIN suno_sales s ON s.id=w.sale_id
   JOIN visible_pages p ON p.id=s.page_id JOIN workers a ON a.user_id=w.assignee_id WHERE s.tenant_id=(scope->>'tenant_id')::uuid
 ), first_sent AS MATERIALIZED(
  SELECT DISTINCT ON(e.sale_id) e.sale_id,s.page_id,(e.after_value->>'assignee_id')::uuid worker_id,e.created_at
   FROM suno_sale_work_events e JOIN suno_sales s ON s.id=e.sale_id JOIN visible_pages p ON p.id=s.page_id
   WHERE s.tenant_id=(scope->>'tenant_id')::uuid AND e.after_value->>'status'='sent' AND e.before_value->>'status' IS DISTINCT FROM 'sent'
   ORDER BY e.sale_id,e.created_at,e.id
 ), sent AS MATERIALIZED(
  SELECT f.*,(f.created_at AT TIME ZONE 'Asia/Manila')::date work_date FROM first_sent f JOIN workers w ON w.user_id=f.worker_id
 ), history_days AS MATERIALIZED(
  SELECT d::date work_date,(SELECT count(*) FROM sent s WHERE s.work_date=d::date) songs_sent
   FROM generate_series(greatest(((scope->>'launch_at')::timestamptz AT TIME ZONE 'Asia/Manila')::date,(now() AT TIME ZONE 'Asia/Manila')::date-14)::timestamp,
    ((now() AT TIME ZONE 'Asia/Manila')::date-1)::timestamp,interval '1 day') d
 ), entries AS MATERIALIZED(
  SELECT p.*,s.currency,s.page_id,s.payee_id,s.contact_id,(p.occurred_at AT TIME ZONE 'Asia/Manila')::date work_date,
   CASE WHEN p.kind='refund' THEN -p.amount_minor ELSE p.amount_minor END net_minor FROM suno_sale_payments p JOIN sales s ON s.id=p.sale_id
   WHERE p.occurred_at>=p_from::timestamp AT TIME ZONE 'Asia/Manila' AND p.occurred_at<(p_to+1)::timestamp AT TIME ZONE 'Asia/Manila'
 ), balances AS MATERIALIZED(
  SELECT s.id,s.currency,s.page_id,s.payee_id,greatest(0,coalesce(ch.total,0)-coalesce(pay.total,0)) balance_minor FROM sales s
   LEFT JOIN LATERAL(SELECT sum(amount_minor) total FROM suno_sale_charges c WHERE c.sale_id=s.id) ch ON true
   LEFT JOIN LATERAL(SELECT sum(CASE WHEN p.kind='refund' THEN -p.amount_minor ELSE p.amount_minor END) total FROM suno_sale_payments p WHERE p.sale_id=s.id AND p.basis<>'tip') pay ON true
 ), plans AS MATERIALIZED(
  SELECT pl.*,u.name worker_name,p.name page_name FROM suno_work_plans pl JOIN workers u ON u.user_id=pl.worker_id JOIN visible_pages p ON p.id=pl.page_id
   WHERE pl.tenant_id=(scope->>'tenant_id')::uuid AND pl.work_date=day AND veo_can_page(pl.worker_id,pl.page_id)
 ), money AS(
  SELECT currencies.currency,coalesce(sum(e.net_minor),0) net_received_minor,coalesce(sum(e.amount_minor) FILTER(WHERE e.kind<>'refund'),0) received_minor,
   coalesce(sum(e.amount_minor) FILTER(WHERE e.kind='refund'),0) refunds_minor,coalesce(sum(e.commission_minor),0) commission_minor,
   coalesce(sum(e.net_minor-e.commission_minor),0) company_share_minor,coalesce(sum(e.net_minor) FILTER(WHERE e.basis='song'),0) song_minor,
   coalesce(sum(e.net_minor) FILTER(WHERE e.basis='revision'),0) revision_minor,coalesce(sum(e.net_minor) FILTER(WHERE e.basis='tip'),0) tip_minor,
   (SELECT coalesce(sum(b.balance_minor),0) FROM balances b WHERE b.currency=currencies.currency) outstanding_minor,
   (SELECT count(*) FROM balances b WHERE b.currency=currencies.currency AND b.balance_minor>0) outstanding_sales
  FROM(SELECT DISTINCT currency FROM sales) currencies LEFT JOIN entries e ON e.currency=currencies.currency GROUP BY currencies.currency
 ), daily AS(
  SELECT d::date work_date,(SELECT count(*) FROM sales s WHERE (s.created_at AT TIME ZONE 'Asia/Manila')::date=d::date) new_sales,
   (SELECT count(*) FROM sent x WHERE x.work_date=d::date) songs_sent,
   coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY currency) FROM(SELECT e.currency,sum(e.net_minor) net_received_minor,sum(e.commission_minor) commission_minor FROM entries e WHERE e.work_date=d::date GROUP BY e.currency)m),'[]') money
  FROM generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d
 ), staff AS(
  SELECT a.*,
   (SELECT count(*) FROM work w WHERE w.assignee_id=a.user_id AND w.status='working') working,
   (SELECT count(*) FROM work w WHERE w.assignee_id=a.user_id AND w.status='revision') revisions,
   (SELECT count(*) FROM sent x WHERE x.worker_id=a.user_id AND x.work_date BETWEEN p_from AND p_to) songs_sent,
   (SELECT count(*) FROM sent x WHERE x.worker_id=a.user_id AND x.work_date=day) day_sent,
   (SELECT round(avg(n),2) FROM(SELECT (SELECT count(*) FROM sent x WHERE x.worker_id=a.user_id AND x.work_date=d.work_date) n FROM history_days d) h) average_sent_per_day,
   (SELECT CASE WHEN count(*)=3 THEN round(avg(n),2) END FROM(SELECT (SELECT count(*) FROM sent x WHERE x.worker_id=a.user_id AND x.work_date=d.work_date) n FROM history_days d ORDER BY n DESC LIMIT 3) h WHERE n>0) best_three_average,
   (SELECT sum(pl.capacity) FROM plans pl WHERE pl.worker_id=a.user_id AND pl.availability='available') capacity,
   (SELECT sum(pl.quota) FROM plans pl WHERE pl.worker_id=a.user_id AND pl.availability='available') quota,
   (SELECT count(*) FROM plans pl WHERE pl.worker_id=a.user_id) saved_plans,
   coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY currency) FROM(SELECT e.currency,sum(e.net_minor) net_received_minor,sum(e.commission_minor) commission_minor,count(DISTINCT e.sale_id) paid_sales FROM entries e WHERE e.payee_id=a.user_id GROUP BY e.currency)m),'[]') money,
   coalesce((SELECT jsonb_agg(p.id) FROM visible_pages p WHERE veo_can_page(a.user_id,p.id)),'[]') page_ids
  FROM workers a
 ), page_results AS(
  SELECT p.*,(SELECT count(*) FROM sales s WHERE s.page_id=p.id AND (s.created_at AT TIME ZONE 'Asia/Manila')::date BETWEEN p_from AND p_to) new_sales,
   (SELECT count(*) FROM sent x WHERE x.page_id=p.id AND x.work_date BETWEEN p_from AND p_to) songs_sent,
   (SELECT count(*) FROM work w WHERE w.page_id=p.id AND w.status<>'sent') open_work,
   (SELECT sum(pl.capacity) FROM plans pl WHERE pl.page_id=p.id AND pl.availability='available') capacity,
   (SELECT sum(pl.quota) FROM plans pl WHERE pl.page_id=p.id AND pl.availability='available') quota,
   coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY currency) FROM(SELECT e.currency,sum(e.net_minor) net_received_minor,sum(e.commission_minor) commission_minor FROM entries e WHERE e.page_id=p.id GROUP BY e.currency)m),'[]') money
  FROM visible_pages p
 )
 SELECT jsonb_build_object('version',1,'scope',scope,'from',p_from,'to',p_to,'work_date',day,'timezone','Asia/Manila','as_of',now(),
  'launch_date',((scope->>'launch_at')::timestamptz AT TIME ZONE 'Asia/Manila')::date,'provisional',p_to=(now() AT TIME ZONE 'Asia/Manila')::date,
  'policy',suno_workspace_policy_status(p_actor),
  'readiness',CASE WHEN scope->>'role' IN('owner','team_leader') THEN jsonb_build_object('page_contacts',(SELECT count(*) FROM inquiry_contacts),
   'contacts_without_inquiry_date',(SELECT count(*) FROM inquiry_contacts WHERE first_inquiry_at IS NULL),
   'inquiries',(SELECT count(*) FROM inquiry_contacts WHERE (first_inquiry_at AT TIME ZONE 'Asia/Manila')::date BETWEEN p_from AND p_to),
   'verified_ad_inquiries',(SELECT count(*) FROM inquiry_contacts WHERE origin_verified AND (first_inquiry_at AT TIME ZONE 'Asia/Manila')::date BETWEEN p_from AND p_to)) ELSE NULL END,
  'spend',CASE WHEN scope->>'role' IN('owner','team_leader') THEN veo_calendar_spend(coalesce((SELECT array_agg(id) FROM visible_pages),'{}'::uuid[]),p_from,p_to) ELSE '[]'::jsonb END,
  'money',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY currency) FROM money m),'[]'),
  'daily',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY work_date) FROM daily d),'[]'),
  'staff',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY name,user_id) FROM staff s),'[]'),
  'pages',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY name,id) FROM page_results p),'[]'),
  'plans',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY worker_name,page_name) FROM plans p),'[]'),
  'capacity',jsonb_build_object('workers',(SELECT count(DISTINCT worker_id) FROM plans WHERE availability='available'),
   'capacity',(SELECT sum(capacity) FROM plans WHERE availability='available'),'quota',(SELECT sum(quota) FROM plans WHERE availability='available'),
   'unplanned_workers',(SELECT count(*) FROM workers a WHERE EXISTS(SELECT 1 FROM visible_pages p WHERE veo_can_page(a.user_id,p.id)) AND NOT EXISTS(SELECT 1 FROM plans pl WHERE pl.worker_id=a.user_id)),
   'day_sent',(SELECT count(*) FROM sent WHERE work_date=day),
   'history',jsonb_build_object('completed_days',(SELECT count(*) FROM history_days),'average_sent_per_day',(SELECT round(avg(songs_sent),2) FROM history_days),
    'best_three_average',(SELECT CASE WHEN count(*)=3 THEN round(avg(songs_sent),2) END FROM(SELECT songs_sent FROM history_days WHERE songs_sent>0 ORDER BY songs_sent DESC LIMIT 3) h))),
  'period',jsonb_build_object('new_sales',(SELECT count(*) FROM sales WHERE (created_at AT TIME ZONE 'Asia/Manila')::date BETWEEN p_from AND p_to),
   'paying_clients',(SELECT count(DISTINCT contact_id) FROM entries WHERE kind<>'refund' AND basis<>'tip'),
   'paid_sales',(SELECT count(DISTINCT sale_id) FROM entries WHERE kind<>'refund' AND basis<>'tip'),
   'songs_sent',(SELECT count(*) FROM sent WHERE work_date BETWEEN p_from AND p_to)),
  'backlog',jsonb_build_object('working',(SELECT count(*) FROM work WHERE status='working'),'revisions',(SELECT count(*) FROM work WHERE status='revision'),
   'oldest_open_at',(SELECT min(created_at) FROM work WHERE status<>'sent'),
   'oldest',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY created_at,sale_id) FROM(SELECT sale_id,contact_id,page_id,description,assignee_id,status,created_at FROM work WHERE status<>'sent' ORDER BY created_at,sale_id LIMIT 5)x),'[]')),
  'budgets',CASE WHEN scope->>'role' IN('owner','team_leader') THEN coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY page_id,currency) FROM suno_page_budgets b JOIN visible_pages p ON p.id=b.page_id WHERE b.tenant_id=(scope->>'tenant_id')::uuid AND b.work_date=day),'[]') ELSE '[]'::jsonb END,
  'coverage',jsonb_build_object('source','Recorded Suno direct sales and song-work events since workspace launch','historical_backfill_complete',false,
   'delivery','Reported sent is a staff declaration, not confirmation of client receipt','earnings','20% songs, 50% tips, 20% revisions from verified payments; quotas never change these rates')) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION suno_operations_plan(uuid,jsonb),suno_operations_report(uuid,date,date,uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION suno_operations_plan(uuid,jsonb),suno_operations_report(uuid,date,date,uuid,date) TO service_role;
INSERT INTO app_private.schema_migrations(version,description) VALUES('202611240101','Suno capacity, quotas, budgets and direct-sales operational reports');
NOTIFY pgrst,'reload schema';
COMMIT;
