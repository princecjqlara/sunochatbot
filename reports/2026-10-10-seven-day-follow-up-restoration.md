# First-day and seven-day follow-up restoration

The previous change limited the entire sequence to three unanswered reminders, while later-day scheduling was empty. This reduced follow-ups too far. Production now has separate budgets for the first 24 hours and days 2–7.

- First 24 hours: four automatic reminders, 30 minutes, 3 hours, 8 hours and 23 hours after the latest customer message.
- Days 2–7: one daily draft at the best Philippine contact hour, available for staff review and sending in **7-Day Contacts**. These are not automatic outbound messages.
- Separate limits: four first-day reminders and six later-day drafts. First-day reminders cannot consume the later-day budget.
- Each customer reply cancels the previous sequence. Requests to defer, opt-outs, stopped states, closed pipeline stages and collection targets remain authoritative.
- No replay of missed reminders. New staff drafts replace older unsent drafts for the same conversation anchor. Draft generation stops before the guarded seven-day boundary.

Later-day timing now uses rolling 24-hour windows: day 2 cannot fall inside the first 24 hours. Generation uses the full sequence number across both phases; only the last scheduled reminder is treated as final. Overlong messages receive a substantially shorter retry target, and retries after repeated questions must offer a statement without another question. Validation failures now include their reason in logs.

All 12 existing Page configurations were updated; the disabled Page remains disabled. Future queue entries were restored for 110 eligible conversations: 84 first-day jobs and 657 later-day staff-draft jobs. Twenty-seven other conversations were excluded. No messages were manually sent during the rollout.

The app currently has RESPONSE and HUMAN_AGENT sending workflows, without a verified opted-in automated marketing route beyond 24 hours. Later-day drafts therefore use the existing staff review workflow. Meta's [Send API documentation](https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api) requires a recent customer message or agreement to receive messages outside the standard 24-hour window.

Validation: 514 tests passed across 72 files during production deployment; the production build and type checks passed. Ten sequential AI previews passed the one-bubble/120-character checks and retained the chosen single-song scope. Production returned HTTP 200. Live queue verification found zero incorrect first-day timings, invalid later-day windows, automatic later-day jobs, terminal-contact jobs, superseded conversation anchors or overdue jobs.

Deployment: https://sunochatbot-hinrgrr06-bigclicklara-2607s-projects.vercel.app, aliased to https://sunochatbot.vercel.app. Verification timestamp: 2026-10-09 16:37 UTC / 2026-10-10 00:37 Manila. Configuration, contact and queue snapshots were saved before the transactional rollout in the ignored local audit directory.
