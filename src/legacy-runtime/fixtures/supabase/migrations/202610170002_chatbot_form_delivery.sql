BEGIN;

ALTER TABLE public.chatbot_contact_states ADD COLUMN IF NOT EXISTS form_sent_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.reset_chatbot_form_delivery()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW.history_start_at IS DISTINCT FROM OLD.history_start_at THEN
        NEW.form_sent_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chatbot_reset_form_delivery ON public.chatbot_contact_states;
CREATE TRIGGER chatbot_reset_form_delivery
BEFORE UPDATE OF history_start_at ON public.chatbot_contact_states
FOR EACH ROW EXECUTE FUNCTION public.reset_chatbot_form_delivery();

CREATE OR REPLACE FUNCTION public.record_chatbot_form_sent(
    p_page_id UUID, p_contact_id UUID, p_sent_at TIMESTAMPTZ,
    p_history_start_at TIMESTAMPTZ DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF p_sent_at IS NULL THEN RAISE EXCEPTION 'Form delivery time is required'; END IF;
    UPDATE public.chatbot_contact_states
    SET form_sent_at = p_sent_at
    WHERE page_id = p_page_id AND contact_id = p_contact_id
      AND form_sent_at IS NULL
      AND history_start_at IS NOT DISTINCT FROM p_history_start_at;
END;
$$;

REVOKE ALL ON FUNCTION public.record_chatbot_form_sent(UUID,UUID,TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_chatbot_form_sent(UUID,UUID,TIMESTAMPTZ,TIMESTAMPTZ) TO service_role, postgres;
NOTIFY pgrst, 'reload schema';
COMMIT;
