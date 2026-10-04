-- Reduce the stock first-day chatbot cadence from five sends to four.
-- Custom Page schedules are intentionally left unchanged.

BEGIN;

UPDATE public.chatbot_follow_up_jobs AS job
SET
    status = 'cancelled',
    cancelled_at = NOW(),
    claimed_at = NULL,
    error_message = 'Removed from the reduced default first-day cadence',
    updated_at = NOW()
WHERE job.schedule_type = 'response'
  AND job.status IN ('pending', 'processing')
  AND ABS(EXTRACT(EPOCH FROM (job.due_at - job.anchor_inbound_at)) - 600) < 2
  AND EXISTS (
      SELECT 1
      FROM public.chatbot_configs AS config
      WHERE config.page_id = job.page_id
        AND config.follow_up_quick_delays_minutes = '[10, 60, 240, 720, 1380]'::jsonb
  );

UPDATE public.chatbot_configs
SET
    follow_up_quick_delays_minutes = '[60, 240, 720, 1380]'::jsonb,
    updated_at = NOW()
WHERE follow_up_quick_delays_minutes = '[10, 60, 240, 720, 1380]'::jsonb;

ALTER TABLE public.chatbot_configs
    ALTER COLUMN follow_up_quick_delays_minutes
    SET DEFAULT '[60, 240, 720, 1380]'::jsonb;

INSERT INTO app_private.schema_migrations (version, description)
VALUES ('20261004_001', 'Reduce default first-day chatbot follow-ups from five sends to four')
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description;

NOTIFY pgrst, 'reload schema';

COMMIT;
