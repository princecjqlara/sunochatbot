-- Let a trial reset exclude older Messenger context without deleting messages.
BEGIN;

ALTER TABLE public.chatbot_contact_states
    ADD COLUMN IF NOT EXISTS history_start_at TIMESTAMPTZ;

COMMENT ON COLUMN public.chatbot_contact_states.history_start_at IS
    'When set by a fresh trial reset, only Messenger messages at or after this time may be used as bot context.';

INSERT INTO app_private.schema_migrations (version, description)
VALUES ('20261007_001', 'Optional fresh conversation history for chatbot trial resets')
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description;

NOTIFY pgrst, 'reload schema';
COMMIT;
