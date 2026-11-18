BEGIN;
-- Existing CRM records stay in place. Enrollment establishes the new access
-- scope and operational cutoff without rewriting the retained identity/history.
CREATE OR REPLACE FUNCTION public.suno_enroll_retained_workspace(p_owner uuid,p_pages uuid[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE workspace uuid;cutoff timestamptz;BEGIN
 PERFORM pg_advisory_xact_lock(76111802);
 IF p_owner IS NULL OR p_pages IS NULL OR cardinality(p_pages)=0 OR array_position(p_pages,NULL) IS NOT NULL
  OR cardinality(p_pages)<>(SELECT count(DISTINCT id) FROM unnest(p_pages) id) THEN
  RAISE EXCEPTION 'Choose distinct retained Pages' USING ERRCODE='22023';END IF;
 PERFORM 1 FROM users WHERE id=p_owner AND is_active FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'An active retained owner is required' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_pages) chosen WHERE NOT EXISTS(SELECT 1 FROM user_pages up WHERE up.user_id=p_owner AND up.page_id=chosen)) THEN
  RAISE EXCEPTION 'Every Page must already belong to the retained owner' USING ERRCODE='42501';END IF;
 SELECT id,launch_at INTO workspace,cutoff FROM veo_tenants WHERE owner_id=p_owner FOR UPDATE;
 IF EXISTS(SELECT 1 FROM veo_accounts WHERE user_id=p_owner AND (workspace IS NULL OR tenant_id<>workspace OR role<>'owner' OR parent_id IS NOT NULL OR NOT active)) THEN
  RAISE EXCEPTION 'Retained account is already enrolled elsewhere' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM pages WHERE id=ANY(p_pages) AND veo_tenant_id IS NOT NULL AND veo_tenant_id IS DISTINCT FROM workspace) THEN
  RAISE EXCEPTION 'A Page belongs to another workspace' USING ERRCODE='42501';END IF;
 IF workspace IS NULL THEN INSERT INTO veo_tenants(owner_id,name) VALUES(p_owner,'Suno') RETURNING id INTO workspace;END IF;
 INSERT INTO veo_accounts(user_id,tenant_id,role,parent_id,active) VALUES(p_owner,workspace,'owner',NULL,true) ON CONFLICT(user_id) DO NOTHING;
 ALTER TABLE public.pages DISABLE TRIGGER update_pages_updated_at;
 UPDATE pages SET veo_enabled=true,veo_tenant_id=workspace WHERE id=ANY(p_pages) AND (NOT veo_enabled OR veo_tenant_id IS DISTINCT FROM workspace);
 ALTER TABLE public.pages ENABLE TRIGGER update_pages_updated_at;
 UPDATE veo_tenants SET launch_at=coalesce(launch_at,clock_timestamp()) WHERE id=workspace;
 -- Actual staff/groups and opt-in Ready declarations establish dispatch scope.
 -- Historical contacts never become an automatically offered backlog.
 UPDATE veo_intake_auto_policy SET enabled=false WHERE tenant_id=workspace;
 INSERT INTO veo_audit(tenant_id,actor_id,action,after_value) VALUES(workspace,p_owner,'retained_workspace_enrollment',jsonb_build_object('page_count',cardinality(p_pages),'existing_identity_unchanged',true,'existing_records_retained_in_place',true,'automatic_intake_enabled',false));
 RETURN workspace;
END $$;
REVOKE ALL ON FUNCTION public.suno_enroll_retained_workspace(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.suno_enroll_retained_workspace(uuid,uuid[]) TO service_role;
COMMIT;
