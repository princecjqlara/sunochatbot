BEGIN;
CREATE TABLE public.suno_workspace_policies(
 tenant_id uuid PRIMARY KEY REFERENCES veo_tenants(id),financial_policy text CHECK(financial_policy='veo_current'),
 confirmed_by uuid REFERENCES users(id),confirmed_at timestamptz
);
ALTER TABLE public.suno_workspace_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.suno_workspace_policies FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.suno_workspace_policies TO service_role;
CREATE FUNCTION public.suno_workspace_policy_status(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE scope jsonb;policy suno_workspace_policies;BEGIN
 scope:=veo_scope(p_actor);IF scope IS NULL THEN RAISE EXCEPTION 'Workspace access required' USING ERRCODE='42501';END IF;
 SELECT * INTO policy FROM suno_workspace_policies WHERE tenant_id=(scope->>'tenant_id')::uuid;
 RETURN jsonb_build_object('confirmed',coalesce(policy.financial_policy='veo_current' AND policy.confirmed_at IS NOT NULL,false),'role',scope->>'role','policy','veo_current','manager_rate',40,'member_default_rate',35,'member_qualified_rate',40,'confirmed_at',policy.confirmed_at);
END $$;
CREATE FUNCTION public.suno_confirm_earnings_policy(p_actor uuid,p_policy text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE scope jsonb;BEGIN
 scope:=veo_scope(p_actor);IF scope->>'role' IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501';END IF;
 IF p_policy IS DISTINCT FROM 'veo_current' THEN RAISE EXCEPTION 'Choose a supported earnings policy' USING ERRCODE='22023';END IF;
 INSERT INTO suno_workspace_policies(tenant_id,financial_policy,confirmed_by,confirmed_at) VALUES((scope->>'tenant_id')::uuid,p_policy,p_actor,clock_timestamp())
 ON CONFLICT(tenant_id) DO UPDATE SET financial_policy=excluded.financial_policy,confirmed_by=excluded.confirmed_by,confirmed_at=coalesce(suno_workspace_policies.confirmed_at,excluded.confirmed_at);
 INSERT INTO veo_audit(tenant_id,actor_id,action,after_value) VALUES((scope->>'tenant_id')::uuid,p_actor,'confirm_earnings_policy',jsonb_build_object('policy',p_policy,'manager_rate',40,'member_default_rate',35,'member_qualified_rate',40));
 RETURN suno_workspace_policy_status(p_actor);
END $$;
CREATE FUNCTION public.suno_require_earnings_policy(p_actor uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF to_regclass('app_private.suno_retained_runtime_installation') IS NULL THEN RETURN;END IF;
 IF coalesce((suno_workspace_policy_status(p_actor)->>'confirmed')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'The Owner must confirm Suno earnings rules before recording new financial activity' USING ERRCODE='22023';END IF;
END $$;
CREATE FUNCTION public.suno_financial_workers_ready() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT NOT EXISTS(SELECT 1 FROM veo_tenants t WHERE t.launch_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM suno_workspace_policies p WHERE p.tenant_id=t.id AND p.financial_policy='veo_current' AND p.confirmed_at IS NOT NULL))
$$;
ALTER FUNCTION public.veo_action(uuid,text,jsonb) RENAME TO veo_action_before_suno_policy;
CREATE FUNCTION public.veo_action(p_actor uuid,p_action text,p_data jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_action IN('order','payment','attribution','submission','incentive','tip','price','void_payment') THEN PERFORM suno_require_earnings_policy(p_actor);END IF;
 RETURN veo_action_before_suno_policy(p_actor,p_action,p_data);
END $$;
REVOKE ALL ON FUNCTION public.suno_workspace_policy_status(uuid),public.suno_confirm_earnings_policy(uuid,text),public.suno_require_earnings_policy(uuid),public.suno_financial_workers_ready(),public.veo_action(uuid,text,jsonb),public.veo_action_before_suno_policy(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.suno_workspace_policy_status(uuid),public.suno_confirm_earnings_policy(uuid,text),public.suno_require_earnings_policy(uuid),public.suno_financial_workers_ready(),public.veo_action(uuid,text,jsonb),public.veo_action_before_suno_policy(uuid,text,jsonb) TO service_role;
COMMIT;
