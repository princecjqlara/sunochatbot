BEGIN;
ALTER TABLE public.veo_tenants ALTER COLUMN name SET DEFAULT 'Suno';

-- Retain the existing workspace protocol, but never perform the old database-wide
-- grant deletion, campaign cancellation, Page unbinding or profile-job deletion.
-- Live activation still requires the Suno release/cutover checks.
CREATE OR REPLACE FUNCTION public.veo_launch(p_owner uuid,p_pages uuid[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 tenant uuid;
 cutoff timestamptz;
 existing_account veo_accounts;
 source_table text;
 source_filter text;
BEGIN
 PERFORM pg_advisory_xact_lock(76110510);
 IF p_owner IS NULL OR p_pages IS NULL OR cardinality(p_pages)<1
 OR array_position(p_pages,NULL) IS NOT NULL
 OR cardinality(p_pages)<>(SELECT count(DISTINCT p) FROM unnest(p_pages) p) THEN
  RAISE EXCEPTION 'Choose a nonempty, distinct list of Suno Pages' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM users WHERE id=p_owner AND is_active FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'An active existing owner is required' USING ERRCODE='42501'; END IF;
 SELECT id,launch_at INTO tenant,cutoff FROM veo_tenants WHERE owner_id=p_owner FOR UPDATE;
 SELECT * INTO existing_account FROM veo_accounts WHERE user_id=p_owner FOR UPDATE;
 IF existing_account.user_id IS NOT NULL AND (
  tenant IS NULL OR existing_account.tenant_id<>tenant OR existing_account.role<>'owner'
  OR existing_account.parent_id IS NOT NULL OR NOT existing_account.active) THEN
  RAISE EXCEPTION 'This account belongs to another workspace or is not an active owner' USING ERRCODE='42501';
 END IF;
 -- Serialize against reconnect/ownership changes, and reject inherited grants
 -- which happen to point at a different workspace's Page.
 PERFORM 1 FROM pages WHERE id=ANY(p_pages) ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM unnest(p_pages) chosen WHERE NOT EXISTS(
  SELECT 1 FROM pages p JOIN user_pages up ON up.page_id=p.id
  WHERE p.id=chosen AND up.user_id=p_owner)) THEN
  RAISE EXCEPTION 'The owner must already have access to every selected Page' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM pages WHERE id=ANY(p_pages) AND veo_tenant_id IS NOT NULL
  AND veo_tenant_id IS DISTINCT FROM tenant) THEN
  RAISE EXCEPTION 'A selected Page belongs to another workspace' USING ERRCODE='42501';
 END IF;
 IF cutoff IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM pages WHERE id=ANY(p_pages)
   AND (veo_tenant_id IS DISTINCT FROM tenant OR NOT veo_enabled)) THEN
   RAISE EXCEPTION 'Use Owner Page connections to add Pages after launch' USING ERRCODE='22023';
  END IF;
  RETURN tenant;
 END IF;
 IF tenant IS NULL THEN
  INSERT INTO veo_tenants(owner_id,name) VALUES(p_owner,'Suno') RETURNING id INTO tenant;
 END IF;
 -- Archive only selected Page records. Refuse an unknown relation shape rather
 -- than taking an unscoped snapshot of another workspace's customer data.
 FOREACH source_table IN ARRAY ARRAY['contacts','campaigns','contact_purchases','contact_verified_payments','chatbot_contact_states','page_activity_history'] LOOP
  IF to_regclass('public.'||source_table) IS NULL THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
   AND table_name=source_table AND column_name='page_id') THEN
   source_filter:='r.page_id=ANY($3)';
  ELSIF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
   AND table_name=source_table AND column_name='contact_id') THEN
   source_filter:='r.contact_id IN(SELECT id FROM public.contacts WHERE page_id=ANY($3))';
  ELSE
   RAISE EXCEPTION 'Review the Page ownership of archive relation % before launch',source_table;
  END IF;
  EXECUTE format('INSERT INTO public.veo_archive_records(tenant_id,source_table,record_key,record)
   SELECT $1,$2,coalesce(to_jsonb(r)->>''id'',md5(to_jsonb(r)::text)),to_jsonb(r)
   FROM public.%I r WHERE %s ON CONFLICT DO NOTHING',source_table,source_filter)
   USING tenant,source_table,p_pages;
 END LOOP;
 INSERT INTO veo_accounts(user_id,tenant_id,role,parent_id,active)
 VALUES(p_owner,tenant,'owner',NULL,true) ON CONFLICT(user_id) DO NOTHING;
 UPDATE users SET role='owner' WHERE id=p_owner;
 UPDATE pages SET veo_enabled=true,veo_tenant_id=tenant WHERE id=ANY(p_pages);
 UPDATE veo_tenants SET launch_at=clock_timestamp() WHERE id=tenant;
 INSERT INTO veo_audit(tenant_id,actor_id,action,after_value)
 VALUES(tenant,p_owner,'launch',jsonb_build_object('page_ids',p_pages,'archive','selected Pages only',
  'existing_grants_retained',true,'existing_campaigns_and_profile_jobs_retained',true));
 RETURN tenant;
END $$;

REVOKE ALL ON FUNCTION public.veo_launch(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.veo_launch(uuid,uuid[]) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
