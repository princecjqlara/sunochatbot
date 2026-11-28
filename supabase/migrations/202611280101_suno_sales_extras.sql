-- Optional receipt references and distinct additional services with a 50% staff share.
-- Additive: historical payments and their recorded commissions remain untouched.
BEGIN;
ALTER TABLE public.suno_sale_payments ALTER COLUMN reference DROP NOT NULL;
ALTER TABLE public.suno_sale_payments ADD COLUMN description text;
ALTER TABLE public.suno_sale_payments DROP CONSTRAINT suno_sale_payments_kind_check;
ALTER TABLE public.suno_sale_payments DROP CONSTRAINT suno_sale_payments_basis_check;
-- Discover original multi-column constraints without relying on generated names.
DO $$ DECLARE constraint_name text;BEGIN
 SELECT conname INTO STRICT constraint_name FROM pg_constraint
 WHERE conrelid='public.suno_sale_payments'::regclass AND contype='c'
 AND pg_get_constraintdef(oid) LIKE '%rate_percent%';
 EXECUTE format('ALTER TABLE public.suno_sale_payments DROP CONSTRAINT %I',constraint_name);
 SELECT conname INTO STRICT constraint_name FROM pg_constraint
 WHERE conrelid='public.suno_sale_payments'::regclass AND contype='c'
 AND pg_get_constraintdef(oid) LIKE '%charge_id IS NULL%';
 EXECUTE format('ALTER TABLE public.suno_sale_payments DROP CONSTRAINT %I',constraint_name);
END $$;
ALTER TABLE public.suno_sale_payments
 ADD CONSTRAINT suno_sale_payments_kind_check CHECK(kind IN('song','revision','tip','extra','refund')),
 ADD CONSTRAINT suno_sale_payments_basis_check CHECK(basis IN('song','revision','tip','extra')),
 ADD CONSTRAINT suno_sale_payments_rate_percent_check CHECK(rate_percent=CASE WHEN basis IN('tip','extra') THEN 50 ELSE 20 END),
 ADD CONSTRAINT suno_sale_payments_charge_check CHECK((basis IN('tip','extra'))=(charge_id IS NULL)),
 ADD CONSTRAINT suno_sale_payments_description_check CHECK(description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500),
 ADD CONSTRAINT suno_sale_payments_extra_description_check CHECK(basis<>'extra' OR description IS NOT NULL);

CREATE OR REPLACE FUNCTION public.suno_workspace_policy_status(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE scope jsonb;policy suno_workspace_policies;BEGIN
 scope:=veo_scope(p_actor);IF scope IS NULL THEN RAISE EXCEPTION 'Workspace access required' USING ERRCODE='42501';END IF;
 SELECT * INTO policy FROM suno_workspace_policies WHERE tenant_id=(scope->>'tenant_id')::uuid;
 RETURN jsonb_build_object('confirmed',coalesce(policy.financial_policy='suno_direct_sales_v1' AND policy.confirmed_at IS NOT NULL,false),
 'role',scope->>'role','policy','suno_direct_sales_v1','song_rate',20,'tip_rate',50,'extra_rate',50,'revision_rate',20,
 'earned_on','verified_payment','payee','assigned_makata','confirmed_at',policy.confirmed_at);
END $$;
CREATE OR REPLACE FUNCTION public.suno_confirm_earnings_policy(p_actor uuid,p_policy text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE scope jsonb;BEGIN
 scope:=veo_scope(p_actor);IF scope->>'role' IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501';END IF;
 IF p_policy IS DISTINCT FROM 'suno_direct_sales_v1' THEN RAISE EXCEPTION 'Use Suno direct-sales earnings rules' USING ERRCODE='22023';END IF;
 INSERT INTO suno_workspace_policies(tenant_id,financial_policy,confirmed_by,confirmed_at) VALUES((scope->>'tenant_id')::uuid,p_policy,p_actor,clock_timestamp())
 ON CONFLICT(tenant_id) DO UPDATE SET financial_policy=excluded.financial_policy,confirmed_by=excluded.confirmed_by,confirmed_at=CASE WHEN suno_workspace_policies.financial_policy=excluded.financial_policy THEN coalesce(suno_workspace_policies.confirmed_at,excluded.confirmed_at) ELSE excluded.confirmed_at END;
 INSERT INTO veo_audit(tenant_id,actor_id,action,after_value) VALUES((scope->>'tenant_id')::uuid,p_actor,'confirm_suno_sales_policy',jsonb_build_object('policy',p_policy,'song_rate',20,'tip_rate',50,'extra_rate',50,'revision_rate',20));
 RETURN suno_workspace_policy_status(p_actor);
END $$;
CREATE OR REPLACE FUNCTION public.suno_sale_action(p_actor uuid,p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE scope jsonb;old suno_sale_requests;sale suno_sales;charge suno_sale_charges;original suno_sale_payments;
 request uuid;sid uuid;cid uuid;payee uuid;page uuid;contact uuid;amount bigint;rate integer;earned bigint;net bigint;prior bigint;prior_commission bigint;
 payment_kind text;description text;reference text;at_time timestamptz;result jsonb;entity uuid;workers uuid[];
BEGIN
 scope:=veo_scope(p_actor);IF scope IS NULL OR scope->>'launch_at' IS NULL THEN RAISE EXCEPTION 'Workspace access required' USING ERRCODE='42501';END IF;
 IF coalesce((suno_workspace_policy_status(p_actor)->>'confirmed')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Confirm Suno earnings settings first' USING ERRCODE='22023';END IF;
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR p_action NOT IN('sale','revision_fee','payment','refund') THEN RAISE EXCEPTION 'Invalid sales action' USING ERRCODE='22023';END IF;
 request:=(p_data->>'request_id')::uuid;IF request IS NULL THEN RAISE EXCEPTION 'A request ID is required' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(request::text,821120));
 SELECT * INTO old FROM suno_sale_requests WHERE request_id=request;
 IF FOUND THEN
  IF old.actor_id<>p_actor OR old.action<>p_action OR old.payload<>p_data THEN RAISE EXCEPTION 'Request ID already used for different data' USING ERRCODE='23505';END IF;
  IF NOT EXISTS(SELECT 1 FROM suno_sales s WHERE s.id=(old.result->>'sale_id')::uuid AND s.tenant_id=(scope->>'tenant_id')::uuid AND veo_can_page(p_actor,s.page_id) AND s.payee_id IN(SELECT value::uuid FROM jsonb_array_elements_text(scope->'worker_ids'))) THEN RAISE EXCEPTION 'Sale access required' USING ERRCODE='42501';END IF;
  RETURN old.result;
 END IF;
 SELECT array_agg(value::uuid) INTO workers FROM jsonb_array_elements_text(scope->'worker_ids');
 IF p_action='sale' THEN
  page:=(p_data->>'page_id')::uuid;contact:=(p_data->>'contact_id')::uuid;payee:=(p_data->>'payee_id')::uuid;
  IF NOT coalesce(veo_can_page(p_actor,page),false) OR NOT coalesce(payee=ANY(workers),false) OR NOT coalesce(veo_can_page(payee,page),false)
   OR NOT EXISTS(SELECT 1 FROM contacts WHERE id=contact AND page_id=page)
   OR NOT EXISTS(SELECT 1 FROM veo_accounts WHERE user_id=payee AND tenant_id=(scope->>'tenant_id')::uuid AND active) THEN
   RAISE EXCEPTION 'Choose an authorized contact, Page and assigned Makata' USING ERRCODE='42501';END IF;
  amount:=(p_data->>'amount_minor')::bigint;description:=btrim(p_data->>'description');
  IF amount IS NULL OR amount NOT BETWEEN 1 AND 9000000000000 OR description IS NULL OR length(description) NOT BETWEEN 1 AND 500 OR coalesce(p_data->>'currency','')!~'^[A-Z]{3}$' THEN RAISE EXCEPTION 'Enter a song description, currency and price' USING ERRCODE='22023';END IF;
  INSERT INTO suno_sales(tenant_id,page_id,contact_id,payee_id,description,currency,created_by) VALUES((scope->>'tenant_id')::uuid,page,contact,payee,description,p_data->>'currency',p_actor) RETURNING * INTO sale;
  INSERT INTO suno_sale_charges(sale_id,kind,description,amount_minor,created_by) VALUES(sale.id,'song',description,amount,p_actor) RETURNING id INTO cid;
  result:=jsonb_build_object('sale_id',sale.id,'charge_id',cid);
 ELSE
  SELECT * INTO sale FROM suno_sales WHERE id=(p_data->>'sale_id')::uuid FOR UPDATE;
  IF NOT FOUND OR sale.tenant_id<>(scope->>'tenant_id')::uuid OR NOT coalesce(sale.payee_id=ANY(workers),false) OR NOT coalesce(veo_can_page(p_actor,sale.page_id),false) THEN RAISE EXCEPTION 'Sale access required' USING ERRCODE='42501';END IF;
  amount:=(p_data->>'amount_minor')::bigint;
  IF amount IS NULL OR amount NOT BETWEEN 1 AND 9000000000000 THEN RAISE EXCEPTION 'Enter a positive amount' USING ERRCODE='22023';END IF;
  IF p_action='revision_fee' THEN
   description:=btrim(p_data->>'description');IF description IS NULL OR length(description) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Describe the revision fee' USING ERRCODE='22023';END IF;
   INSERT INTO suno_sale_charges(sale_id,kind,description,amount_minor,created_by) VALUES(sale.id,'revision',description,amount,p_actor) RETURNING id INTO cid;
   result:=jsonb_build_object('sale_id',sale.id,'charge_id',cid);
  ELSE
   IF coalesce((p_data->>'confirmed')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Verify the receipt before recording a payment' USING ERRCODE='22023';END IF;
   reference:=nullif(btrim(p_data->>'reference'),'');at_time:=(p_data->>'occurred_at')::timestamptz;
   IF (reference IS NOT NULL AND length(reference) NOT BETWEEN 3 AND 160) OR at_time IS NULL OR at_time>clock_timestamp() OR at_time<(scope->>'launch_at')::timestamptz THEN RAISE EXCEPTION 'Enter a valid optional reference and a payment time from workspace activation onward' USING ERRCODE='22023';END IF;
   IF p_action='refund' THEN
    SELECT * INTO original FROM suno_sale_payments WHERE id=(p_data->>'payment_id')::uuid AND sale_id=sale.id AND kind<>'refund';
    IF NOT FOUND THEN RAISE EXCEPTION 'Choose the original payment' USING ERRCODE='22023';END IF;
    SELECT coalesce(sum(amount_minor),0),coalesce(-sum(commission_minor),0) INTO prior,prior_commission FROM suno_sale_payments WHERE refund_of=original.id;
    IF prior+amount>original.amount_minor OR at_time<original.occurred_at THEN RAISE EXCEPTION 'Refund exceeds the remaining original payment or predates it' USING ERRCODE='22023';END IF;
    SELECT coalesce(sum(CASE WHEN p.kind='refund' THEN -p.amount_minor ELSE p.amount_minor END),0),coalesce(sum(p.commission_minor),0) INTO net,prior_commission
     FROM suno_sale_payments p WHERE p.sale_id=sale.id AND p.charge_id IS NOT DISTINCT FROM original.charge_id AND p.basis=original.basis;
    earned:=round((net-amount)::numeric*original.rate_percent/100)-prior_commission;
    INSERT INTO suno_sale_payments(sale_id,charge_id,refund_of,kind,basis,amount_minor,commission_minor,rate_percent,reference,occurred_at,verified_by,description)
     VALUES(sale.id,original.charge_id,original.id,'refund',original.basis,amount,earned,original.rate_percent,reference,at_time,p_actor,original.description) RETURNING id INTO entity;
   ELSE
    payment_kind:=p_data->>'kind';IF payment_kind IS NULL OR payment_kind NOT IN('song','revision','tip','extra') THEN RAISE EXCEPTION 'Choose song, tip, additional service or revision payment' USING ERRCODE='22023';END IF;
    cid:=(p_data->>'charge_id')::uuid;
    IF payment_kind IN('tip','extra') THEN IF cid IS NOT NULL THEN RAISE EXCEPTION 'Tips and additional services cannot pay an invoice charge' USING ERRCODE='22023';END IF;
    ELSE
     SELECT * INTO charge FROM suno_sale_charges ch WHERE ch.id=cid AND ch.sale_id=sale.id AND ch.kind=payment_kind;
     IF NOT FOUND THEN RAISE EXCEPTION 'Choose a matching song or revision charge' USING ERRCODE='22023';END IF;
    END IF;
    description:=CASE WHEN payment_kind='extra' THEN btrim(p_data->>'description') END;
    IF payment_kind='extra' AND (description IS NULL OR length(description) NOT BETWEEN 1 AND 500) THEN RAISE EXCEPTION 'Describe the additional service' USING ERRCODE='22023';END IF;
    SELECT coalesce(sum(CASE WHEN kind='refund' THEN -amount_minor ELSE amount_minor END),0),coalesce(sum(commission_minor),0) INTO net,prior_commission
     FROM suno_sale_payments WHERE sale_id=sale.id AND charge_id IS NOT DISTINCT FROM cid AND basis=payment_kind;
    IF payment_kind NOT IN('tip','extra') AND net+amount>charge.amount_minor THEN RAISE EXCEPTION 'Payment exceeds this charge balance; record tips separately' USING ERRCODE='22023';END IF;
    rate:=CASE WHEN payment_kind IN('tip','extra') THEN 50 ELSE 20 END;earned:=round((net+amount)::numeric*rate/100)-prior_commission;
    INSERT INTO suno_sale_payments(sale_id,charge_id,kind,basis,amount_minor,commission_minor,rate_percent,reference,occurred_at,verified_by,description)
     VALUES(sale.id,cid,payment_kind,payment_kind,amount,earned,rate,reference,at_time,p_actor,description) RETURNING id INTO entity;
   END IF;
   result:=jsonb_build_object('sale_id',sale.id,'payment_id',entity,'commission_minor',earned,'currency',sale.currency);
  END IF;
 END IF;
 INSERT INTO suno_sale_requests VALUES(request,p_actor,p_action,p_data,result,clock_timestamp());
 INSERT INTO veo_audit(tenant_id,actor_id,action,entity_id,after_value) VALUES(sale.tenant_id,p_actor,'suno_'||p_action,sale.id,result);
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.suno_sales_report(p_actor uuid,p_from date,p_to date,p_page uuid DEFAULT NULL,p_contact uuid DEFAULT NULL,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE scope jsonb;result jsonb;BEGIN
 scope:=veo_scope(p_actor);IF scope IS NULL OR scope->>'launch_at' IS NULL THEN RAISE EXCEPTION 'Workspace access required' USING ERRCODE='42501';END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>365 OR p_offset IS NULL OR p_offset<0 OR p_offset>10000000 THEN RAISE EXCEPTION 'Invalid sales filters' USING ERRCODE='22023';END IF;
 IF p_page IS NOT NULL AND NOT coalesce(veo_can_page(p_actor,p_page),false) THEN RAISE EXCEPTION 'Page access required' USING ERRCODE='42501';END IF;
 IF p_contact IS NOT NULL AND NOT EXISTS(SELECT 1 FROM contacts c WHERE c.id=p_contact AND veo_can_page(p_actor,c.page_id)) THEN RAISE EXCEPTION 'Contact access required' USING ERRCODE='42501';END IF;
 WITH visible AS (
  SELECT s.*,c.name contact_name,u.name payee_name,p.name page_name FROM suno_sales s JOIN contacts c ON c.id=s.contact_id JOIN users u ON u.id=s.payee_id JOIN pages p ON p.id=s.page_id
  WHERE s.tenant_id=(scope->>'tenant_id')::uuid AND s.payee_id IN(SELECT value::uuid FROM jsonb_array_elements_text(scope->'worker_ids'))
  AND veo_can_page(p_actor,s.page_id) AND (p_page IS NULL OR s.page_id=p_page) AND (p_contact IS NULL OR s.contact_id=p_contact)
 ), entries AS (
  SELECT p.*,s.currency,s.payee_id,s.payee_name,s.contact_name,(p.occurred_at AT TIME ZONE 'Asia/Manila')::date work_date,CASE WHEN p.kind='refund' THEN -p.amount_minor ELSE p.amount_minor END net_minor
  FROM suno_sale_payments p JOIN visible s ON s.id=p.sale_id WHERE (p.occurred_at AT TIME ZONE 'Asia/Manila')::date BETWEEN p_from AND p_to
 ), totals AS (
  SELECT currency,count(DISTINCT sale_id) paid_sales,sum(net_minor) net_received_minor,sum(net_minor) FILTER(WHERE basis='song') song_minor,
   sum(net_minor) FILTER(WHERE basis='revision') revision_minor,sum(net_minor) FILTER(WHERE basis='tip') tip_minor,sum(net_minor) FILTER(WHERE basis='extra') extra_minor,
   sum(amount_minor) FILTER(WHERE kind='refund') refunds_minor,sum(commission_minor) commission_minor,sum(net_minor-commission_minor) company_share_minor
  FROM entries GROUP BY currency
 ), daily AS (
  SELECT work_date,currency,count(DISTINCT sale_id) paid_sales,sum(net_minor) net_received_minor,sum(commission_minor) commission_minor FROM entries GROUP BY work_date,currency
 ), staff AS (
  SELECT payee_id,payee_name,currency,count(DISTINCT sale_id) paid_sales,sum(net_minor) net_received_minor,sum(commission_minor) commission_minor FROM entries GROUP BY payee_id,payee_name,currency
 )
 SELECT jsonb_build_object('scope',scope,'policy',suno_workspace_policy_status(p_actor),'from',p_from,'to',p_to,'timezone','Asia/Manila',
  'totals',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM totals t),'[]'::jsonb),
  'daily',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY work_date,currency) FROM daily d),'[]'::jsonb),
  'staff',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY commission_minor DESC,payee_id,currency) FROM staff t),'[]'::jsonb),
  'sale_count',(SELECT count(*) FROM visible),'offset',p_offset,
  'sales',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY created_at DESC,id) FROM (
   SELECT s.*,
    (SELECT coalesce(jsonb_agg(to_jsonb(ch)||jsonb_build_object('paid_minor',coalesce((SELECT sum(CASE WHEN p.kind='refund' THEN -p.amount_minor ELSE p.amount_minor END) FROM suno_sale_payments p WHERE p.charge_id=ch.id),0)) ORDER BY created_at,id),'[]'::jsonb) FROM suno_sale_charges ch WHERE ch.sale_id=s.id) charges,
    (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY occurred_at DESC,id),'[]'::jsonb) FROM suno_sale_payments p WHERE p.sale_id=s.id) payments
   FROM visible s ORDER BY created_at DESC,id LIMIT 25 OFFSET p_offset) x),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.veo_salary(p_user uuid,p_day date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE totals jsonb;BEGIN
 IF NOT EXISTS(SELECT 1 FROM veo_accounts WHERE user_id=p_user) THEN RAISE EXCEPTION 'Staff account required' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO totals FROM (
  SELECT s.currency,sum(CASE WHEN p.kind='refund' THEN -p.amount_minor ELSE p.amount_minor END) gross_minor,
   sum(p.commission_minor) commission_minor,sum(p.commission_minor) base_commission_minor,0::bigint incentive_minor
  FROM suno_sale_payments p JOIN suno_sales s ON s.id=p.sale_id WHERE s.payee_id=p_user AND (p.occurred_at AT TIME ZONE 'Asia/Manila')::date=p_day GROUP BY s.currency
 ) t;
 RETURN jsonb_build_object('user_id',p_user,'work_date',p_day,'rate',20,'tip_rate',50,'extra_rate',50,'revision_rate',20,'policy','suno_direct_sales_v1','earned_on','verified_payment','totals',totals,
 'target',0,'closed',0,'done',0,'provisional',false,'manager_immunity',false);
END $$;
CREATE OR REPLACE FUNCTION public.suno_operations_report(p_actor uuid,p_from date,p_to date,p_page uuid DEFAULT NULL,p_day date DEFAULT NULL) RETURNS jsonb
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
   LEFT JOIN LATERAL(SELECT sum(CASE WHEN p.kind='refund' THEN -p.amount_minor ELSE p.amount_minor END) total FROM suno_sale_payments p WHERE p.sale_id=s.id AND p.charge_id IS NOT NULL) pay ON true
 ), plans AS MATERIALIZED(
  SELECT pl.*,u.name worker_name,p.name page_name FROM suno_work_plans pl JOIN workers u ON u.user_id=pl.worker_id JOIN visible_pages p ON p.id=pl.page_id
   WHERE pl.tenant_id=(scope->>'tenant_id')::uuid AND pl.work_date=day AND veo_can_page(pl.worker_id,pl.page_id)
 ), money AS(
  SELECT currencies.currency,coalesce(sum(e.net_minor),0) net_received_minor,coalesce(sum(e.amount_minor) FILTER(WHERE e.kind<>'refund'),0) received_minor,
   coalesce(sum(e.amount_minor) FILTER(WHERE e.kind='refund'),0) refunds_minor,coalesce(sum(e.commission_minor),0) commission_minor,
   coalesce(sum(e.net_minor-e.commission_minor),0) company_share_minor,coalesce(sum(e.net_minor) FILTER(WHERE e.basis='song'),0) song_minor,
   coalesce(sum(e.net_minor) FILTER(WHERE e.basis='revision'),0) revision_minor,coalesce(sum(e.net_minor) FILTER(WHERE e.basis='tip'),0) tip_minor,coalesce(sum(e.net_minor) FILTER(WHERE e.basis='extra'),0) extra_minor,
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
   'paying_clients',(SELECT count(DISTINCT contact_id) FROM entries WHERE kind<>'refund' AND basis IN('song','revision')),
   'paid_sales',(SELECT count(DISTINCT sale_id) FROM entries WHERE kind<>'refund' AND basis IN('song','revision')),
   'songs_sent',(SELECT count(*) FROM sent WHERE work_date BETWEEN p_from AND p_to)),
  'backlog',jsonb_build_object('working',(SELECT count(*) FROM work WHERE status='working'),'revisions',(SELECT count(*) FROM work WHERE status='revision'),
   'oldest_open_at',(SELECT min(created_at) FROM work WHERE status<>'sent'),
   'oldest',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY created_at,sale_id) FROM(SELECT sale_id,contact_id,page_id,description,assignee_id,status,created_at FROM work WHERE status<>'sent' ORDER BY created_at,sale_id LIMIT 5)x),'[]')),
  'budgets',CASE WHEN scope->>'role' IN('owner','team_leader') THEN coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY page_id,currency) FROM suno_page_budgets b JOIN visible_pages p ON p.id=b.page_id WHERE b.tenant_id=(scope->>'tenant_id')::uuid AND b.work_date=day),'[]') ELSE '[]'::jsonb END,
  'coverage',jsonb_build_object('source','Recorded Suno direct sales and song-work events since workspace launch','historical_backfill_complete',false,
   'delivery','Reported sent is a staff declaration, not confirmation of client receipt','earnings','20% songs, 50% tips and additional services, 20% revisions from verified payments; quotas never change these rates')) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.suno_sale_action(uuid,text,jsonb),public.suno_sales_report(uuid,date,date,uuid,uuid,integer),public.suno_workspace_policy_status(uuid),public.suno_confirm_earnings_policy(uuid,text),public.veo_salary(uuid,date),public.suno_operations_report(uuid,date,date,uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.suno_sale_action(uuid,text,jsonb),public.suno_sales_report(uuid,date,date,uuid,uuid,integer),public.suno_workspace_policy_status(uuid),public.suno_confirm_earnings_policy(uuid,text),public.veo_salary(uuid,date),public.suno_operations_report(uuid,date,date,uuid,date) TO service_role;
INSERT INTO app_private.schema_migrations(version,description) VALUES('202611280101','Suno optional receipt references and 50% additional service payments');
NOTIFY pgrst,'reload schema';
COMMIT;
