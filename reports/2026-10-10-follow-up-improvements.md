# More useful chatbot follow-ups

This records the initial three-reminder rollout. Its schedule was subsequently replaced by the [first-day and seven-day restoration](2026-10-10-seven-day-follow-up-restoration.md) and [contact best-time fix](2026-10-10-contact-best-time-follow-ups.md). The current schedule is four first-day reminders plus six later-day staff-review drafts.

The live October 9 review found repeated questions about business name, tagline and song choices in scheduled reminders. Some customers received another sales reminder after saying they were not ready. The revised sequence helps customers picture a use for their song, addresses a real hesitation with verified facts, and finishes with an invitation to return when ready.

Each reminder is one message of at most 120 characters. The maximum remains three unanswered reminders, scheduled 30 minutes, six hours and 22 hours after the latest customer message. The final reminder asks no further question. Pending jobs are moved to future slots; overdue slots are cancelled instead of sent together.

Explicit deferrals such as “hindi na po muna,” “balikan ko kayo,” and “I'll get back to you” cancel pending reminders without closing the lead. A new customer message can resume the normal conversation. The check runs when scheduling, before generation and when a queued job is processed. Song preferences and requests to omit something from lyrics remain eligible.

The value-first profile gives each reminder a different purpose. Validation rejects reworded questions about a previously unanswered detail, and retries with the specific validation problem. It also rejects a question on the final reminder and a reversal of the approved song-before-payment policy. Invalid output after the retry is suppressed.

Synthetic previews use the actual configured provider and owner knowledge without sending customer messages. Cases cover a pricing-only inquiry, an unanswered bakery form, and a customer who chose one song at PHP399. Regression tests cover deferrals, renewed interest, stale queued reminders, repeated questions, the final reminder and payment wording. Deployment runs the full test suite and production build.

The original audit also found a separate limit on detail depth: the 26% target counts six of 20 fields, including the known Messenger profile name. Stopped contacts do not save further answers through the chatbot. That target was preserved in this follow-up change. Better conversion has not yet been measured; previews verify wording and behavior.

Private database snapshots, queue backups and conversation exports are saved locally in ignored files.

Production verification: all 509 tests across 72 files passed, the TypeScript check and production build passed, and `sunochatbot.vercel.app` points to ready deployment `dpl_CBQyKc2n4cbvr1K7fbgXmwbyh1Q2`. The policy and timing were verified on all 12 configured Pages. The rollout rescheduled 74 queued jobs, cancelled seven obsolete slots and three reminders for two customers who had deferred. Final checks found no wrongly timed pending jobs, pending paused reminders or jobs more than ten minutes overdue. Nine actual-model synthetic previews passed the one-bubble, 120-character and final-reminder checks. Production returned HTTP 200.
