-- Preserve the existing Suno quote, human pause, form and delivery contracts.
-- These source migrations use distinct Suno versions to avoid the Veo branch collisions.
BEGIN;
ALTER TABLE public.chatbot_contact_states ADD COLUMN IF NOT EXISTS history_start_at timestamptz;

-- Existing Suno contract: 202610170001_chatbot_human_takeover_and_prices.sql

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


-- Existing Suno contract: 202610170002_chatbot_form_delivery.sql

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


-- Existing Suno contract: 202610180001_chatbot_message_deliveries.sql

CREATE TABLE IF NOT EXISTS public.chatbot_message_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    history_start_at TIMESTAMPTZ,
    source_key TEXT NOT NULL,
    message_text TEXT NOT NULL,
    normalized_text TEXT NOT NULL,
    message_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','sent')),
    message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS chatbot_message_delivery_unique
    ON public.chatbot_message_deliveries(page_id,contact_id,COALESCE(history_start_at,'-infinity'::timestamptz),message_hash);
CREATE INDEX IF NOT EXISTS chatbot_message_delivery_history
    ON public.chatbot_message_deliveries(page_id,contact_id,sent_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS chatbot_message_delivery_source
    ON public.chatbot_message_deliveries(page_id,contact_id,COALESCE(history_start_at,'-infinity'::timestamptz),source_key);
ALTER TABLE public.chatbot_message_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chatbot_message_deliveries FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.chatbot_message_deliveries TO service_role,postgres;

CREATE OR REPLACE FUNCTION public.reserve_chatbot_message(
    p_page_id UUID,p_contact_id UUID,p_message_text TEXT,p_normalized_text TEXT,p_source_key TEXT,
    p_history_start_at TIMESTAMPTZ DEFAULT NULL,p_allow_repeat BOOLEAN DEFAULT FALSE
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE delivery_id UUID;
BEGIN
    IF NULLIF(btrim(p_normalized_text),'') IS NULL OR NULLIF(btrim(p_source_key),'') IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.contacts WHERE id=p_contact_id AND page_id=p_page_id) THEN
        RAISE EXCEPTION 'Invalid chatbot delivery';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_page_id::text||':'||p_contact_id::text,0));
    IF NOT EXISTS (SELECT 1 FROM public.chatbot_contact_states WHERE page_id=p_page_id AND contact_id=p_contact_id
        AND history_start_at IS NOT DISTINCT FROM p_history_start_at) THEN RETURN NULL; END IF;
    IF NOT p_allow_repeat AND EXISTS (
        SELECT 1 FROM public.chatbot_message_deliveries WHERE page_id=p_page_id AND contact_id=p_contact_id
          AND history_start_at IS NOT DISTINCT FROM p_history_start_at AND normalized_text=p_normalized_text
    ) THEN RETURN NULL; END IF;
    INSERT INTO public.chatbot_message_deliveries(page_id,contact_id,history_start_at,source_key,message_text,normalized_text,message_hash)
    VALUES(p_page_id,p_contact_id,p_history_start_at,p_source_key,p_message_text,p_normalized_text,
        md5(p_normalized_text||CASE WHEN p_allow_repeat THEN '|'||p_source_key ELSE '' END))
    ON CONFLICT DO NOTHING RETURNING id INTO delivery_id;
    RETURN delivery_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_chatbot_message(p_delivery_id UUID,p_message_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
    IF NULLIF(btrim(p_message_id),'') IS NULL THEN RAISE EXCEPTION 'Message ID is required'; END IF;
    UPDATE public.chatbot_message_deliveries SET status='sent',message_id=p_message_id,sent_at=COALESCE(sent_at,now())
    WHERE id=p_delivery_id AND (message_id IS NULL OR message_id=p_message_id);
    IF NOT FOUND THEN RAISE EXCEPTION 'Chatbot delivery is missing or already has another message'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_chatbot_message(UUID,UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ,BOOLEAN) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_chatbot_message(UUID,UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ,BOOLEAN) TO service_role,postgres;
REVOKE ALL ON FUNCTION public.finish_chatbot_message(UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_chatbot_message(UUID,TEXT) TO service_role,postgres;
NOTIFY pgrst,'reload schema';


COMMIT;
