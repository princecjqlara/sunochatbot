BEGIN;
-- The retained chatbot already honors its human-hold fields. New per-contact
-- workspace controls use that contract without replacing its reply engine.
ALTER TABLE public.chatbot_contact_states ADD COLUMN IF NOT EXISTS suno_workspace_hold_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.suno_preserve_disabled_contact_hold() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM contacts c WHERE c.id=NEW.contact_id AND c.page_id=NEW.page_id AND c.chatbot_enabled=false) THEN
  IF NEW.human_hold_reason IS DISTINCT FROM 'suno_workspace_disabled' THEN
   NEW.suno_workspace_hold_snapshot:=jsonb_build_object('human_pause_status',NEW.human_pause_status,'human_takeover_at',NEW.human_takeover_at,'human_resume_at',NEW.human_resume_at,'human_message_id',NEW.human_message_id,'human_hold_reason',NEW.human_hold_reason);
  END IF;
  NEW.human_pause_status:='held';NEW.human_resume_at:=NULL;NEW.human_hold_reason:='suno_workspace_disabled';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS suno_preserve_disabled_contact_hold ON public.chatbot_contact_states;
CREATE TRIGGER suno_preserve_disabled_contact_hold BEFORE INSERT OR UPDATE ON public.chatbot_contact_states FOR EACH ROW EXECUTE FUNCTION public.suno_preserve_disabled_contact_hold();

CREATE OR REPLACE FUNCTION public.suno_apply_contact_permission_to_retained_bot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior jsonb;BEGIN
 IF NEW.chatbot_enabled IS NOT DISTINCT FROM OLD.chatbot_enabled THEN RETURN NEW;END IF;
 IF NOT NEW.chatbot_enabled THEN
  INSERT INTO chatbot_contact_states(page_id,contact_id) VALUES(NEW.page_id,NEW.id)
  ON CONFLICT(page_id,contact_id) DO UPDATE SET updated_at=chatbot_contact_states.updated_at;
 ELSE
  SELECT suno_workspace_hold_snapshot INTO prior FROM chatbot_contact_states WHERE page_id=NEW.page_id AND contact_id=NEW.id AND human_hold_reason='suno_workspace_disabled' FOR UPDATE;
  IF FOUND THEN
   UPDATE chatbot_contact_states SET human_pause_status=prior->>'human_pause_status',human_takeover_at=(prior->>'human_takeover_at')::timestamptz,
    human_resume_at=(prior->>'human_resume_at')::timestamptz,human_message_id=prior->>'human_message_id',human_hold_reason=prior->>'human_hold_reason',suno_workspace_hold_snapshot=NULL
   WHERE page_id=NEW.page_id AND contact_id=NEW.id;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS suno_apply_contact_permission_to_retained_bot ON public.contacts;
CREATE TRIGGER suno_apply_contact_permission_to_retained_bot AFTER UPDATE OF chatbot_enabled ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.suno_apply_contact_permission_to_retained_bot();
REVOKE ALL ON FUNCTION public.suno_preserve_disabled_contact_hold(),public.suno_apply_contact_permission_to_retained_bot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.suno_preserve_disabled_contact_hold(),public.suno_apply_contact_permission_to_retained_bot() TO service_role;
COMMIT;
