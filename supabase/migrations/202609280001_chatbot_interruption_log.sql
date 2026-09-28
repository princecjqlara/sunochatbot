-- Audit manual VeoBot messages sent while the chatbot is still collecting details.

BEGIN;

CREATE TABLE IF NOT EXISTS public.chatbot_interruption_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL UNIQUE,
    actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    actor_name TEXT,
    source TEXT NOT NULL DEFAULT 'veobot',
    collected_detail_count INTEGER NOT NULL DEFAULT 0,
    required_detail_count INTEGER NOT NULL DEFAULT 0,
    missing_detail_count INTEGER NOT NULL DEFAULT 0,
    interrupted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chatbot_interruption_events_source_check
        CHECK (source IN ('veobot', 'business_suite')),
    CONSTRAINT chatbot_interruption_events_counts_check
        CHECK (
            collected_detail_count >= 0
            AND required_detail_count >= 0
            AND missing_detail_count >= 0
        )
);

CREATE INDEX IF NOT EXISTS idx_chatbot_interruption_events_page_time
    ON public.chatbot_interruption_events(page_id, interrupted_at DESC);

ALTER TABLE public.chatbot_interruption_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chatbot_interruption_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.chatbot_interruption_events TO postgres, service_role;

INSERT INTO app_private.schema_migrations (version, description)
VALUES ('20260928_001', 'Audit staff messages that interrupt chatbot detail collection')
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description;

NOTIFY pgrst, 'reload schema';

COMMIT;
