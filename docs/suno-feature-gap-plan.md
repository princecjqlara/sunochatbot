# Suno feature comparison and implementation plan

Checked November 14, 2026. This is an audit and plan; no application behavior, production data, webhook, group permission or scheduled delivery was changed.

The expanded [Suno compatibility master plan](suno-compatibility-master-plan.md) now supplies the complete feature register, contact/profile/calendar data contracts, and cron/background-work register. Use that plan for implementation sequencing; this document retains the earlier gap evidence.

## Finding

The new Suno copy contains every application source path and migration file from the inspected Veo checkout. Its missing capabilities are mainly unconfigured services, an older Suno database, and business workflows that still need to be adapted for music.

There is also a significant merge gap: the existing Suno application has song-specific intake and customer-specific pricing behavior that was not carried into the first Veo-based copy. Those behaviors need to be preserved before replacing the existing Suno application.

| Local checkout | API routes | Application pages | Migration files |
| --- | ---: | ---: | ---: |
| Existing Suno: `tokko-chatbot` | 62 | 16 | 34 |
| New Suno copy: `suno-system` | 125 | 22 | 172 |
| Current Veo source | 125 | 22 | 172 |

These counts describe code presence, not working deployments. File-name absence alone does not prove a feature is absent: newer Veo modules may implement equivalent behavior differently. This audit did not verify which features are enabled in Veo production.

The compared Veo commits are `f89cad734262cfef40054c66493ba98a6d63df23` for the app and `2476c82f5ba36459fe6cd67d255dd7019246a0ed` for Jaucian. They match the previous copy's provenance. No newer upstream feature files were found missing from the copy.

## Veo capabilities the existing Suno app lacks

All of the following have code in the new copy. They are not yet operational for Suno.

| Capability | What Veo's code supplies | What Suno still needs | Priority |
| --- | --- | --- | --- |
| Accounts and teams | Owner, team leader, manager and member hierarchy; branch/Page permissions; supervisor changes; offboarding | Workspace tables, retained owner enrollment, real teams and Page grants | Required |
| New-client assignment | Fresh inquiry pool, Ready/Busy, manual and automatic offers, acceptance deadlines, rotation, handovers | Suno assignment eligibility/timing, worker identities, group/Page routes and one authoritative assignment owner | Required |
| Jaucian integration | Verified Telegram linking, groups/topics, membership checks, tomorrow availability and durable delivery | Dedicated bot archive, production service URL, authenticated webhook, approved groups, verified membership and scheduler | Required |
| Receipt and payment controls | Receipt evidence, supervisor review/direct submission, linked Closed/Done milestones, payment balances, refunds and audited corrections | Payment/workspace schema and Suno-specific receipt/evidence rules | Required |
| Earnings and incentives | Daily commission ledger, quota qualification, salary/calendar views and incentive notices | Confirmed Suno earnings, deposits, tips, revisions, refunds and payout-period rules | Required before financial use |
| Capacity and quotas | Personal/team planning, workload context, Page allocation and quota controls | Define whether Suno measures paid orders, receipt posts or delivered songs; preserve separate units and unknown data | Required for accurate reports |
| Staff visibility | Employee profiles, performance, rankings, alerts and availability evidence | Actual Suno accounts/history and approved alert rules; no video-derived productivity assumptions | After core data |
| Client intelligence | Rich profiles, verified financial history, first-inquiry history, source evidence and identity reconciliation | Missing schema, scoped current event collection and checked Suno history coverage | Core profiles first |
| Calendar and ads | Work/earnings calendar, Page ad budgets, spend, conversion metrics, demographics and creative analysis | Verified Suno ad-account access, currency/date mappings and usable Suno revenue data | After financial definitions |
| AI interruption review | Jev wait/stop/follow-up/resume decisions with ownership and stop guards | Chosen model, Suno examples and parity with Suno's existing human takeover behavior | After handoff tests |
| Operations and recovery | Collection/storage health, durable jobs, stale-delivery detection and recovery | Separate deployment identity, scheduled workers, monitoring and end-to-end recovery verification | Required |

Existing Suno already contains Facebook Page management, contacts/tags, campaigns, follow-ups, chatbot knowledge/media and exports. These are retained capabilities, not entirely new features to invent.

## Suno behavior that needs a deliberate merge

### Confirmed intake and pricing gaps

1. **Seven-field song brief.** Existing Suno has a dedicated Hiraya form with business name, products/services, tagline, lyrics language, vocal preference, genre and additional requests. It recognizes explicit filled answers, handles partial answers, respects requests for one question at a time and avoids unnecessary form resends. The copy does not contain `chatbot-form-priority.ts` or its `SONG_BRIEF_FIELDS` behavior. Its sales-assistant defaults still ask about cinematic/animated style and the goal of a video. Changing the form heading to a song brief did not port this behavior.
2. **Customer-specific staff quotes.** Existing Suno retains a verified staff quote for the particular customer and scope, including song quantities, deposits, balances and conditions. It prevents an older bot/RAG price from replacing that quote. The copy lacks `chatbot-conversation-pricing.ts`, `resolveConversationPriceQuote` and the corresponding stored quote integration. Its newer package-pricing engine is not evidence of equivalent song-quote behavior.

Evidence: existing `tokko-chatbot/src/lib/chatbot-form-priority.ts`, `chatbot-conversation-pricing.ts`, and their call sites in the Facebook webhook, chatbot and follow-up worker. Compare the copy's `src/lib/chatbot-sales-assistant.ts`.

### Confirmed server-side adaptation gaps

1. **Assignment eligibility still recognizes video fields.** The SQL `veo_intake_progress` counts a set of video-brief fields and requires three valid details. Suno's lyrics language, vocal preference, tagline and product/genre labels are not mapped into that set. Porting the visible song form alone is insufficient: the server's eligibility counter and automatic/manual assignment guards need the same Suno field definitions.
2. **Telegram links still target and validate the Veo hostname.** SQL-generated client/workspace buttons contain `https://veochatbot.vercel.app`, and `jaucian/veo_intake.py` only accepts dashboard URLs under that hostname. Replacing the generated button URL with a Suno URL without updating the validator would block delivery. Both URL generation and validation must use the configured Suno origin; tests should reject Veo/unrelated destinations in the Suno instance. Some report/profile defaults also retain the Veo hostname.

Evidence: `supabase/migrations/202611080010_veo_three_detail_assignment.sql`, `202611080008_veo_automatic_editor_dispatch.sql`, `202611080006_veo_telegram_intake.sql`, `jaucian/veo_intake.py`, and `jaucian/veo_shift_reports.py`.

### Preserved behavior requiring parity tests

Eight existing Suno helper modules are absent by filename from the copy:

- `chatbot-form-priority.ts`
- `chatbot-conversation-pricing.ts`
- `chatbot-human-takeover.ts`
- `chatbot-inbound.ts`
- `chatbot-lead-stage.ts`
- `chatbot-message-delivery.ts`
- `contact-best-time.ts`
- `facebook-send-retry.ts`

For the last six, absence of the old file is not enough to declare the behavior lost. The Veo copy has newer delivery guards, reply claims, history checks and Jev interruption handling. The merge must compare behavior for:

- Immediate pause after staff intervention and review at the existing Suno boundary, with paid/proceeding customers remaining under human control.
- Lead-stage changes immediately before a send.
- Delivery fingerprints across reply/follow-up jobs, recovery from partial sends, and explicit customer-requested repeats.
- Recording inbound activity before calculating personalized follow-up hours.
- Retrying explicit transient Facebook rejections while holding ambiguous send outcomes for review.
- Suno's handling of purchase intent, knowledge policies, refusal and order-status requests.

The existing Suno regression suites for these behaviors should be brought into the comparison. They should not be discarded merely because Veo has newer modules.

### Song production and audio

- Jaucian already includes legacy Suno song reminders and `SONG SENT`/`DONE` confirmation handling. Those functions use `SUNO_GROUPS`. The new Suno workspace profile currently empties that legacy dictionary, and workspace mode routes dispatch through `veo_workspace` before reaching the older song scheduler. The song workflow therefore needs explicit integration with the workspace's accepted assignment/order records; it will not become active just by registering the new bot's webhook.
- Receipt-based earnings and completed-song counts are different measures. Both need separate records and reports.
- The chatbot knowledge-media upload allowlist currently supports images and videos. Its direct Messenger media layer also supports audio, so audio is not universally absent. A native searchable music-sample/audio library still needs a scoped design if that is part of Suno's intended sales flow.
- Song versions, revision requests and delivery status should be defined before building a dedicated production board. That board would be a Suno adaptation, not a missing Veo screen.

## Current activation blockers

The read-only setup checks were rerun for this audit:

- Suno's 13 Pages remain readable and the retained owner setting matches the existing Suno identity.
- Workspace mode is disabled in the app.
- The Suno database has no `contact_verified_payments`, `veo_tenants` or `veo_accounts` tables.
- The bot token still resolves to `@dannysunobot`; no webhook is registered.
- The new bot has no configured archive database or approved delivery groups.
- Group privacy is enabled; ordinary group messages require appropriate bot permissions or a deliberate privacy-setting change.
- Suno's financial-policy confirmation is unset. The copied commission rule is still Veo's 35%/40% rule.
- Production service origins, tenant launch state, team mappings and scheduled recovery are not configured for this copy.

See `verification/migration-plan.json` and `scripts/check-suno-setup.mjs` for the inventory/check implementation. These checks did not consume Telegram updates or send messages.

## Database reconciliation required before an upgrade

The inventory finds 144 migration filenames not recorded by the inspected Suno ledgers. This is not a claim that 144 business features are missing, nor permission to apply all files unchanged.

Three Suno branch migrations reuse version numbers assigned to different Veo migrations:

| Version | Existing Suno migration | Veo migration in the copy |
| --- | --- | --- |
| `202610170001` | Human takeover and conversation prices | Commercial-video nightly handoff |
| `202610170002` | Form delivery tracking | Explicit chatbot reset |
| `202610180001` | Message delivery reservations | Reply inbound timestamp |

Veo also has duplicate filenames per version at `202611030001` and `202611100001`. Use filename, contents and actual installed-object evidence when reconciling the branches; a version-only skip is insufficient.

Six migration files present in the existing Suno branch are absent by name from the Veo-based copy, including the three above and earlier permission/trial-history changes. Check equivalent constraints/functions before deciding whether to port or supersede them.

The generated 172-file review SQL is a template inventory, not a finished Suno upgrade. It includes business-setting changes and a workspace launch that can archive operational records and change access. Rehearse an incremental Suno upgrade against a disposable restoration of the current schema/data; preserve Page instructions, custom quotes, contact states, memberships and historical financial records. Do not replay a full baseline directly into the running CRM.

## Implementation order

### 1. Confirm Suno rules and capture existing behavior

Deliver a short behavior specification covering the seven-field brief, packages/custom quotes, staff takeover, assignment eligibility, song completion and earnings.

Recommended starting assumption for review: preserve existing Suno customer and earnings behavior while adopting Veo's management/verification infrastructure. Do not assume the Veo 35%/40% policy applies to Suno.

Acceptance: the expected behavior and unresolved decisions are explicit; existing Suno examples/regression tests are available for comparison.

### 2. Merge the Suno workflow into the copied application

Port/adapt song-brief and staff-quote behavior; reconcile delivery, lead-stage, best-time and human-handoff behavior with newer Veo guards. Replace video-only default fields, prompts and package assumptions. Update the server's assignment-eligibility field mapping to the same Suno brief. Define how song production status joins workspace assignments.

Acceptance: a Suno inquiry uses the intended song brief; saved answers survive corrections; valid Suno answers satisfy the intended server-side assignment threshold; the latest authorized staff quote survives bot replies/follow-ups; staff ownership, opt-outs and paid/proceeding customers remain protected; repeated webhooks and partial sends do not produce repeated messages.

### 3. Prepare and rehearse the database upgrade

Reconcile both branches' migration files/functions and resolve version collisions. Prepare a minimal incremental upgrade and a backup/rollback/runbook for operational configuration. Rehearse on a disposable copy before touching production. Preserve current Suno Page/runtime ownership.

Acceptance: existing identities, contacts, Page connections/instructions, quotes and history remain intact; new tables/functions have correct permissions; a second migration run is safe; known missing objects and both sets of migrations are accounted for.

### 4. Connect teams, assignments and Suno Jaucian

Set up the dedicated bot archive/deployment, then verified human account links, approved Suno group/topic destinations and Page routes. Replace hardcoded Veo deep links and their URL validators with the configured Suno origin. Choose one owner of assignment state. Integrate song reminders/completions with those assignments. Configure the one authenticated bot webhook and the normal durable scheduler when activation is authorized.

Acceptance: an eligible fresh client appears once, is offered only to an authorized Ready worker, remains with the current worker during a pending handover, and reaches the proper group/topic. Suno client links open the Suno app and pass its delivery checks; foreign origins are rejected. Restart/retry preserves delivery checkpoints. Old client history is not released as a new inquiry backlog. Song completion records do not create a second payment.

### 5. Enable accurate earnings, capacity and reporting

Implement the confirmed Suno earnings and receipt/evidence rules. Keep receipt count, paid orders, delivered songs, revenue and earnings separate. Then connect capacity/quotas, daily/team reports, employee performance, calendar, budgets and ads metrics to those definitions. Leave unsupported history/spend as unknown. Validate alert rules before enabling staff warnings.

Acceptance: partial/full payments, tips, revisions, refunds and seller changes reconcile to the intended Suno rules; sample daily reports agree with approved source records; dashboards do not call receipt posts completed songs or missing ad spend zero.

### 6. Complete release checks and run a controlled pilot

Restore a Suno deployment test gate: the existing Suno app uses `npm test && npm run build`, while the copied Veo app currently builds without that automatic test step. Triage the 18 failures reproduced in the original Veo checkout and finish a clean sequential regression run. Perform interactive sign-in/role/Page testing, actual Suno workflow checks and scheduler recovery verification. Browser QA remains pending from the preparation turn.

Pilot the complete core flow in one explicitly approved Suno group/Page scope, with clear observation and rollback criteria, before extending to all 13 Pages. Verify actual Telegram delivery through normal scheduled processing, not a manually invoked dispatcher.

Acceptance: the chosen pilot passes the intake → assignment → human handling → verified receipt → song delivery → reporting flow, with working monitoring and no duplicate/cross-group/cross-Page delivery. Expand only after those checks pass.

## Decisions needed before implementation

1. **Earnings:** retain Suno's current recorded earnings policy or adopt a newly specified commission policy? Define tips, revisions, deposits and refunds with it.
2. **Assignment:** offer at first inquiry, after a brief threshold or after full details? Define Ready expiry and offer wait/acceptance timing rather than inheriting Veo values automatically.
3. **Song completion:** what counts as delivered, who confirms it, and how should revisions/replacements affect deadlines and output counts?
4. **Destinations and cutover:** which Suno teams/groups/topics participate first, which report recipient is intended, and will the new app replace the current deployment or run as a separate pilot?

An audio-sample library or direct Suno music-generation API integration should be scoped separately if requested. Neither should be inferred solely from duplicating Veo's management system.

## Evidence and limits

- File inventory: `verification/feature-file-inventory.json`.
- Navigation/feature coverage: `src/lib/veo-navigation.ts`, workspace API routes and components.
- Song brief/custom quotes: existing `tokko-chatbot/src/lib/chatbot-form-priority.ts`, `chatbot-conversation-pricing.ts`, and their webhook/follow-up integrations.
- Video defaults: `src/lib/chatbot-sales-assistant.ts` and chatbot settings UI.
- Song dispatch gap: `jaucian/daily_automation.py`, `jaucian/app.py`, `jaucian/trabawho_songs.py` and `jaucian/suno_profile.py`.
- Media distinction: `src/lib/chatbot-media.ts` versus `src/lib/messenger-media.ts`.
- Earnings default: `src/lib/veo-jaucian.ts` and workspace SQL.
- Database blockers: refreshed read-only migration inventory and setup checks.
- Prior verification: `docs/suno-verification.md` records the passing build, 1,389 bot tests, 50 targeted workspace checks, inherited failures and browser limitations. This audit did not rerun the full test suite.

Only planning/evidence files were written during this audit. The implementation sequence above has not started.
