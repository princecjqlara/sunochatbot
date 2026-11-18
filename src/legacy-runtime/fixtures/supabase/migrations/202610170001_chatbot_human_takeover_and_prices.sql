BEGIN;

ALTER TABLE public.chatbot_contact_states
    ADD COLUMN IF NOT EXISTS human_pause_status TEXT,
    ADD COLUMN IF NOT EXISTS human_takeover_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS human_resume_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS human_message_id TEXT,
    ADD COLUMN IF NOT EXISTS human_hold_reason TEXT,
    ADD COLUMN IF NOT EXISTS conversation_price_quote TEXT,
    ADD COLUMN IF NOT EXISTS conversation_price_quoted_at TIMESTAMPTZ;

ALTER TABLE public.chatbot_contact_states
    DROP CONSTRAINT IF EXISTS chatbot_human_pause_status_check;
ALTER TABLE public.chatbot_contact_states
    ADD CONSTRAINT chatbot_human_pause_status_check
    CHECK (human_pause_status IS NULL OR human_pause_status IN ('paused', 'checking', 'held', 'released'));

CREATE INDEX IF NOT EXISTS idx_chatbot_human_resume_due
    ON public.chatbot_contact_states(human_resume_at)
    WHERE human_pause_status = 'paused';

CREATE OR REPLACE FUNCTION public.record_chatbot_human_takeover(
    p_page_id UUID, p_contact_id UUID, p_message_id TEXT,
    p_taken_over_at TIMESTAMPTZ, p_resume_at TIMESTAMPTZ, p_price_quote TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = p_contact_id AND page_id = p_page_id)
       OR NULLIF(btrim(p_message_id), '') IS NULL THEN
        RAISE EXCEPTION 'Invalid human takeover contact or message';
    END IF;
    INSERT INTO public.chatbot_contact_states AS s (
        page_id, contact_id, human_pause_status, human_takeover_at, human_resume_at,
        human_message_id, human_hold_reason, conversation_price_quote, conversation_price_quoted_at
    ) VALUES (
        p_page_id, p_contact_id, 'paused', p_taken_over_at, p_resume_at, p_message_id, NULL,
        NULLIF(p_price_quote, ''), CASE WHEN NULLIF(p_price_quote, '') IS NOT NULL THEN p_taken_over_at END
    )
    ON CONFLICT (page_id, contact_id) DO UPDATE SET
        human_pause_status = 'paused',
        human_takeover_at = EXCLUDED.human_takeover_at,
        human_resume_at = EXCLUDED.human_resume_at,
        human_message_id = EXCLUDED.human_message_id,
        human_hold_reason = NULL,
        conversation_price_quote = CASE
            WHEN EXCLUDED.conversation_price_quote IS NOT NULL AND
                 (s.conversation_price_quoted_at IS NULL OR EXCLUDED.human_takeover_at > s.conversation_price_quoted_at)
            THEN EXCLUDED.conversation_price_quote ELSE s.conversation_price_quote END,
        conversation_price_quoted_at = CASE
            WHEN EXCLUDED.conversation_price_quote IS NOT NULL AND
                 (s.conversation_price_quoted_at IS NULL OR EXCLUDED.human_takeover_at > s.conversation_price_quoted_at)
            THEN EXCLUDED.human_takeover_at ELSE s.conversation_price_quoted_at END,
        updated_at = now()
    WHERE s.human_takeover_at IS NULL OR (
        EXCLUDED.human_takeover_at > s.human_takeover_at AND
        EXCLUDED.human_message_id IS DISTINCT FROM s.human_message_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_chatbot_conversation_quote(
    p_page_id UUID, p_contact_id UUID, p_quote TEXT, p_quoted_at TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = p_contact_id AND page_id = p_page_id)
       OR NULLIF(btrim(p_quote), '') IS NULL THEN
        RAISE EXCEPTION 'Invalid conversation quote';
    END IF;
    INSERT INTO public.chatbot_contact_states AS s (
        page_id, contact_id, conversation_price_quote, conversation_price_quoted_at
    ) VALUES (p_page_id, p_contact_id, p_quote, p_quoted_at)
    ON CONFLICT (page_id, contact_id) DO UPDATE SET
        conversation_price_quote = EXCLUDED.conversation_price_quote,
        conversation_price_quoted_at = EXCLUDED.conversation_price_quoted_at,
        updated_at = now()
    WHERE s.conversation_price_quoted_at IS NULL OR EXCLUDED.conversation_price_quoted_at > s.conversation_price_quoted_at;
END;
$$;

REVOKE ALL ON FUNCTION public.record_chatbot_human_takeover(UUID,UUID,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_chatbot_human_takeover(UUID,UUID,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT) TO service_role, postgres;
REVOKE ALL ON FUNCTION public.record_chatbot_conversation_quote(UUID,UUID,TEXT,TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_chatbot_conversation_quote(UUID,UUID,TEXT,TIMESTAMPTZ) TO service_role, postgres;

NOTIFY pgrst, 'reload schema';
COMMIT;
