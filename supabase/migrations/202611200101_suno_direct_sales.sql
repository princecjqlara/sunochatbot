-- Suno: direct sales; no Closed/Done gates or quota-dependent earnings.
BEGIN;
ALTER TABLE public.suno_workspace_policies DROP CONSTRAINT IF EXISTS suno_workspace_policies_financial_policy_check;
ALTER TABLE public.suno_workspace_policies ADD CONSTRAINT suno_workspace_policies_financial_policy_check CHECK(financial_policy IN('veo_current','suno_direct_sales_v1'));

CREATE TABLE public.suno_sales(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES veo_tenants(id),
 page_id uuid NOT NULL REFERENCES pages(id),contact_id uuid NOT NULL REFERENCES contacts(id),
 payee_id uuid NOT NULL REFERENCES veo_accounts(user_id),description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 500),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.suno_sale_charges(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sale_id uuid NOT NULL REFERENCES suno_sales(id),
 kind text NOT NULL CHECK(kind IN('song','revision')),description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 500),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 9000000000000),
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX suno_sale_one_song_charge ON public.suno_sale_charges(sale_id) WHERE kind='song';
CREATE TABLE public.suno_sale_payments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sale_id uuid NOT NULL REFERENCES suno_sales(id),
 charge_id uuid REFERENCES suno_sale_charges(id),refund_of uuid REFERENCES suno_sale_payments(id),
 kind text NOT NULL CHECK(kind IN('song','revision','tip','refund')),basis text NOT NULL CHECK(basis IN('song','revision','tip')),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 9000000000000),
 commission_minor bigint NOT NULL,rate_percent integer NOT NULL CHECK(rate_percent=CASE WHEN basis='tip' THEN 50 ELSE 20 END),
 reference text NOT NULL CHECK(length(btrim(reference)) BETWEEN 3 AND 160),
 occurred_at timestamptz NOT NULL,verified_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 policy_version text NOT NULL DEFAULT 'suno_direct_sales_v1' CHECK(policy_version='suno_direct_sales_v1'),
 UNIQUE(sale_id,reference),CHECK((kind='refund')=(refund_of IS NOT NULL)),
 CHECK((basis='tip')=(charge_id IS NULL)),CHECK((kind='refund' AND commission_minor<=0) OR (kind<>'refund' AND commission_minor>=0))
);
CREATE TABLE public.suno_sale_requests(
 request_id uuid PRIMARY KEY,actor_id uuid NOT NULL REFERENCES users(id),action text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX suno_sales_scope ON public.suno_sales(tenant_id,page_id,payee_id,created_at DESC);
CREATE INDEX suno_sale_payments_date ON public.suno_sale_payments(occurred_at,sale_id);
CREATE INDEX suno_sale_payments_refund ON public.suno_sale_payments(refund_of) WHERE refund_of IS NOT NULL;
CREATE INDEX suno_sale_charges_sale ON public.suno_sale_charges(sale_id);
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['suno_sales','suno_sale_charges','suno_sale_payments','suno_sale_requests'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT,INSERT ON public.%I TO service_role',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.suno_workspace_policy_status(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE scope jsonb;policy suno_workspace_policies;BEGIN
 scope:=veo_scope(p_actor);IF scope IS NULL THEN RAISE EXCEPTION 'Workspace access required' USING ERRCODE='42501';END IF;
 SELECT * INTO policy FROM suno_workspace_policies WHERE tenant_id=(scope->>'tenant_id')::uuid;
 RETURN jsonb_build_object('confirmed',coalesce(policy.financial_policy='suno_direct_sales_v1' AND policy.confirmed_at IS NOT NULL,false),
 'role',scope->>'role','policy','suno_direct_sales_v1','song_rate',20,'tip_rate',50,'revision_rate',20,
 'earned_on','verified_payment','payee','assigned_makata','confirmed_at',policy.confirmed_at);
END $$;
CREATE OR REPLACE FUNCTION public.suno_confirm_earnings_policy(p_actor uuid,p_policy text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE scope jsonb;BEGIN
 scope:=veo_scope(p_actor);IF scope->>'role' IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501';END IF;
 IF p_policy IS DISTINCT FROM 'suno_direct_sales_v1' THEN RAISE EXCEPTION 'Use Suno direct-sales earnings rules' USING ERRCODE='22023';END IF;
 INSERT INTO suno_workspace_policies(tenant_id,financial_policy,confirmed_by,confirmed_at) VALUES((scope->>'tenant_id')::uuid,p_policy,p_actor,clock_timestamp())
 ON CONFLICT(tenant_id) DO UPDATE SET financial_policy=excluded.financial_policy,confirmed_by=excluded.confirmed_by,confirmed_at=CASE WHEN suno_workspace_policies.financial_policy=excluded.financial_policy THEN coalesce(suno_workspace_policies.confirmed_at,excluded.confirmed_at) ELSE excluded.confirmed_at END;
 INSERT INTO veo_audit(tenant_id,actor_id,action,after_value) VALUES((scope->>'tenant_id')::uuid,p_actor,'confirm_suno_sales_policy',jsonb_build_object('policy',p_policy,'song_rate',20,'tip_rate',50,'revision_rate',20));
 RETURN suno_workspace_policy_status(p_actor);
END $$;
-- This entrypoint belongs to the inherited Veo receipt/actions, not Suno Sales.
CREATE OR REPLACE FUNCTION public.suno_require_earnings_policy(p_actor uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF to_regclass('app_private.suno_retained_runtime_installation') IS NULL THEN RETURN;END IF;
 RAISE EXCEPTION 'Suno uses direct Sales with 20%% song, 50%% tip and 20%% revision earnings. Use Suno Sales.' USING ERRCODE='22023';
END $$;
-- Keep inherited quota/salary/incentive workers paused; Suno earnings are
-- transaction-based and never depend on those workers.
CREATE OR REPLACE FUNCTION public.suno_financial_workers_ready() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.veo_action(p_actor uuid,p_action text,p_data jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_action IN('order','payment','import_business_order','attribution','submission','incentive','tip','price','void_payment') THEN PERFORM suno_require_earnings_policy(p_actor);END IF;
 RETURN veo_action_before_suno_policy(p_actor,p_action,p_data);
END $$;

CREATE FUNCTION public.suno_sale_action(p_actor uuid,p_action text,p_data jsonb) RETURNS jsonb
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
   reference:=btrim(p_data->>'reference');at_time:=(p_data->>'occurred_at')::timestamptz;
   IF reference IS NULL OR length(reference) NOT BETWEEN 3 AND 160 OR at_time IS NULL OR at_time>clock_timestamp() OR at_time<(scope->>'launch_at')::timestamptz THEN RAISE EXCEPTION 'Enter a receipt reference and a payment time from workspace activation onward' USING ERRCODE='22023';END IF;
   IF p_action='refund' THEN
    SELECT * INTO original FROM suno_sale_payments WHERE id=(p_data->>'payment_id')::uuid AND sale_id=sale.id AND kind<>'refund';
    IF NOT FOUND THEN RAISE EXCEPTION 'Choose the original payment' USING ERRCODE='22023';END IF;
    SELECT coalesce(sum(amount_minor),0),coalesce(-sum(commission_minor),0) INTO prior,prior_commission FROM suno_sale_payments WHERE refund_of=original.id;
    IF prior+amount>original.amount_minor OR at_time<original.occurred_at THEN RAISE EXCEPTION 'Refund exceeds the remaining original payment or predates it' USING ERRCODE='22023';END IF;
    SELECT coalesce(sum(CASE WHEN p.kind='refund' THEN -p.amount_minor ELSE p.amount_minor END),0),coalesce(sum(p.commission_minor),0) INTO net,prior_commission
     FROM suno_sale_payments p WHERE p.sale_id=sale.id AND p.charge_id IS NOT DISTINCT FROM original.charge_id;
    earned:=round((net-amount)::numeric*original.rate_percent/100)-prior_commission;
    INSERT INTO suno_sale_payments(sale_id,charge_id,refund_of,kind,basis,amount_minor,commission_minor,rate_percent,reference,occurred_at,verified_by)
     VALUES(sale.id,original.charge_id,original.id,'refund',original.basis,amount,earned,original.rate_percent,reference,at_time,p_actor) RETURNING id INTO entity;
   ELSE
    payment_kind:=p_data->>'kind';IF payment_kind IS NULL OR payment_kind NOT IN('song','revision','tip') THEN RAISE EXCEPTION 'Choose song, tip or revision payment' USING ERRCODE='22023';END IF;
    cid:=(p_data->>'charge_id')::uuid;
    IF payment_kind='tip' THEN IF cid IS NOT NULL THEN RAISE EXCEPTION 'Tips cannot pay an invoice charge' USING ERRCODE='22023';END IF;
    ELSE
     SELECT * INTO charge FROM suno_sale_charges ch WHERE ch.id=cid AND ch.sale_id=sale.id AND ch.kind=payment_kind;
     IF NOT FOUND THEN RAISE EXCEPTION 'Choose a matching song or revision charge' USING ERRCODE='22023';END IF;
    END IF;
    SELECT coalesce(sum(CASE WHEN kind='refund' THEN -amount_minor ELSE amount_minor END),0),coalesce(sum(commission_minor),0) INTO net,prior_commission
     FROM suno_sale_payments WHERE sale_id=sale.id AND charge_id IS NOT DISTINCT FROM cid;
    IF payment_kind<>'tip' AND net+amount>charge.amount_minor THEN RAISE EXCEPTION 'Payment exceeds this charge balance; record tips separately' USING ERRCODE='22023';END IF;
    rate:=CASE WHEN payment_kind='tip' THEN 50 ELSE 20 END;earned:=round((net+amount)::numeric*rate/100)-prior_commission;
    INSERT INTO suno_sale_payments(sale_id,charge_id,kind,basis,amount_minor,commission_minor,rate_percent,reference,occurred_at,verified_by)
     VALUES(sale.id,cid,payment_kind,payment_kind,amount,earned,rate,reference,at_time,p_actor) RETURNING id INTO entity;
   END IF;
   result:=jsonb_build_object('sale_id',sale.id,'payment_id',entity,'commission_minor',earned,'currency',sale.currency);
  END IF;
 END IF;
 INSERT INTO suno_sale_requests VALUES(request,p_actor,p_action,p_data,result,clock_timestamp());
 INSERT INTO veo_audit(tenant_id,actor_id,action,entity_id,after_value) VALUES(sale.tenant_id,p_actor,'suno_'||p_action,sale.id,result);
 RETURN result;
END $$;

CREATE FUNCTION public.suno_sales_report(p_actor uuid,p_from date,p_to date,p_page uuid DEFAULT NULL,p_contact uuid DEFAULT NULL,p_offset integer DEFAULT 0) RETURNS jsonb
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
   sum(net_minor) FILTER(WHERE basis='revision') revision_minor,sum(net_minor) FILTER(WHERE basis='tip') tip_minor,
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

CREATE OR REPLACE FUNCTION public.veo_refresh_discipline(p_actor uuid,p_worker uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM veo_discipline_supervisor(p_actor,p_worker);
 RETURN jsonb_build_object('recorded',0,'suspended',0,'reason','suno_direct_sales_has_no_deal_quotas');
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
 RETURN jsonb_build_object('user_id',p_user,'work_date',p_day,'rate',20,'tip_rate',50,'revision_rate',20,'policy','suno_direct_sales_v1','earned_on','verified_payment','totals',totals,
 'target',0,'closed',0,'done',0,'provisional',false,'manager_immunity',false);
END $$;

REVOKE ALL ON FUNCTION public.suno_sale_action(uuid,text,jsonb),public.suno_sales_report(uuid,date,date,uuid,uuid,integer),public.suno_workspace_policy_status(uuid),public.suno_confirm_earnings_policy(uuid,text),public.suno_require_earnings_policy(uuid),public.suno_financial_workers_ready(),public.veo_action(uuid,text,jsonb),public.veo_salary(uuid,date),public.veo_refresh_discipline(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.suno_sale_action(uuid,text,jsonb),public.suno_sales_report(uuid,date,date,uuid,uuid,integer),public.suno_workspace_policy_status(uuid),public.suno_confirm_earnings_policy(uuid,text),public.suno_require_earnings_policy(uuid),public.suno_financial_workers_ready(),public.veo_action(uuid,text,jsonb),public.veo_salary(uuid,date),public.veo_refresh_discipline(uuid,uuid) TO service_role;
INSERT INTO app_private.schema_migrations(version,description) VALUES('202611200101','Suno direct sales: 20% song, 50% tips, 20% revision fees') ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst,'reload schema';
COMMIT;
