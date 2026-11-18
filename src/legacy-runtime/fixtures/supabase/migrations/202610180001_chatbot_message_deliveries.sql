BEGIN;

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
