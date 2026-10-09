# Contact best-time follow-ups

The live audit checked 657 pending days 2–7 staff-draft jobs across 110 contacts. Every job matched its contact's saved best Philippine hour and the configured day within the rolling seven-day sequence. None of these contacts lacked a saved best hour. Seventy-five contacts had inferred timing, 27 medium confidence and eight high confidence; limited-history timing is an estimate.

The webhook previously created the follow-up sequence before recording the latest inbound activity and refreshing the contact's best hour. It now records and reads customer activity first, saves the ranked reply hours, and passes the refreshed primary hour to the scheduler. The most frequent customer hour wins; equal-frequency ties favor the latest inbound hour. If no valid best hour is available, the scheduler uses the customer's inbound Philippine hour instead of a fixed noon fallback. Staff draft due dates explicitly display Philippine time.

First-day reminders and the daily days 2–7 cadence remain as configured. Later-day messages continue to require staff review and sending in 7-Day Contacts; a scheduled draft does not guarantee staff sends at that instant. Existing reply, deferral, terminal-state and collection-target safeguards remain in force.

Focused validation passed 58 tests, including webhook coverage that proves a stale contact hour is replaced before scheduling all six later-day jobs. Type checking passed. Production deployment passed all 519 tests across 73 files and the production build. After deployment, all 657 later-day jobs still matched the saved best hours, the queue had no overdue or terminal-contact jobs, and production returned HTTP 200. The live queue audit is saved in the ignored local audit directory as `best-time-audit.json`.

Deployed to https://sunochatbot-6ddlq4l7l-bigclicklara-2607s-projects.vercel.app, aliased to https://sunochatbot.vercel.app. Verification: 2026-10-09 16:48 UTC / 2026-10-10 00:48 Manila.
