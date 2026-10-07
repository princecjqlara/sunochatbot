# Hiraya Studios follow-up settings

Saved to production: 2026-10-07T16:17:28.310Z.

Follow-ups now allow six unanswered reminders instead of three. The cadence is 10 minutes, 30 minutes, 1 hour, 3 hours, 8 hours, and 23 hours after the latest eligible customer reply.

The AI instructions now request confident, assertive wording, fresh personalized creative suggestions, direct next-step questions, and a progression toward a continue-or-pause decision. Existing approved pricing and accepted order details remain part of the instructions.

The chatbot is enabled with follow-ups enabled and remains scoped to its selected live trial contact. No existing or historical job was revived. The cadence takes effect when the next eligible reply schedules a new sequence. Opt-out, refusal, and terminal-stage checks still apply.

Validation: the existing scheduler produced six RESPONSE jobs with the new configuration, accepted reminder 6 and rejected reminder 7. Two fictional conversation previews produced nonempty personalized messages under 160 characters. Saved configuration values were read back and verified; unrelated settings, including a concurrently edited message-format setting, were preserved.

The JSON record stores the changed fields before and after for rollback. This was a configuration update; no application deployment or database migration was needed.
