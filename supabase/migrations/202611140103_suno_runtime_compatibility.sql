BEGIN;
ALTER TABLE conversation_export_jobs ADD COLUMN IF NOT EXISTS history_source text CHECK(history_source IN ('meta','event_inbox'));
-- Suno has not launched the copied workspace. Existing Suno exports are Meta exports.
UPDATE conversation_export_jobs SET history_source=CASE WHEN next_cursor LIKE 'veo-events:%' THEN 'event_inbox' ELSE 'meta' END WHERE history_source IS NULL;

-- Keep the retained Suno delivery epoch aligned with explicit modern resets.
CREATE FUNCTION suno_chatbot_reset_compatibility() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.messenger_history_reset_at IS DISTINCT FROM OLD.messenger_history_reset_at THEN
  NEW.history_start_at:=NEW.messenger_history_reset_at;
  NEW.form_sent_at:=NULL;
  NEW.human_pause_status:=NULL; NEW.human_takeover_at:=NULL; NEW.human_resume_at:=NULL;
  NEW.human_message_id:=NULL; NEW.human_hold_reason:=NULL;
  NEW.conversation_price_quote:=NULL; NEW.conversation_price_quoted_at:=NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER suno_chatbot_reset_compatibility BEFORE UPDATE OF messenger_history_reset_at ON chatbot_contact_states FOR EACH ROW EXECUTE FUNCTION suno_chatbot_reset_compatibility();
REVOKE ALL ON FUNCTION suno_chatbot_reset_compatibility() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
