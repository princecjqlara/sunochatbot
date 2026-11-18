# Suno cron and background-work register

## Implementation update — November 15

The new deployment configuration now declares **16 schedules for 17 routes**. The original audit below remains as baseline evidence. `/follow-up-automations`, `/campaign-scheduled` and `/campaign-loop` have minute schedules; `/exports` runs every two minutes. `/sync` remains a manual/recovery endpoint; current identities and first-inquiry evidence have dedicated workers. These are source declarations, not installed live timers.

`SUNO_SCHEDULER_OWNER=vercel` makes the follow-up route own workflow steps only. The dedicated chatbot route owns recovery, legacy human-pause review, continuation and chatbot follow-ups; the campaign route owns scheduled/immediate campaigns. Existing fallback requests now propagate cron authorization. Item leases remain authoritative across retries. All seventeen routes are authenticated in preparation, workspace and recovery modes.

The profile route runs the explicit Suno full-profile queue alongside demographics. The selected export source is saved per job. Telegram song-work confirmations enter the existing workspace outbox; they do not start a second sender. Legacy Suno definitions remain available for recovery, but old queued obligations and external scheduler ownership require actual archive/cutover reconciliation. See [implementation status](suno-implementation-status.md).

Planning only, November 14, 2026. No scheduler, webhook, worker or dispatcher was invoked or reconfigured for this audit.

## Scope and interpretation

There are **17 app cron routes**. **12 have schedules in the copied `vercel.json`; five do not.** An absent Vercel schedule does not prove an endpoint is unused: external schedulers, nested requests and manual job entrypoints must be checked before a cutover. Local source configuration does not establish what is currently deployed.

All expressions in this register are UTC unless explicitly described as a Philippine business time. PHT is UTC+8. A frequent scheduler tick does not mean every business task runs at that frequency: database leases, next-due dates and feature settings decide actual work.

Every task must have a documented primary trigger, data owner, authorization check, Page/tenant scope, maximum batch/time budget, durable claim/checkpoint, retry behavior, health signal and intentional pause/recovery behavior. Compatibility remains unverified until those checks pass in the chosen Suno mode.

## App routes scheduled in the copied Vercel configuration

| Route | Existing UTC expression | Work owned/reached | Suno compatibility requirement |
| --- | --- | --- | --- |
| `/api/cron/workspace-events` | `* * * * *` | Recover queued contact identities and process persisted Messenger events | Serial processing per conversation; durable event claims shared with the workspace worker; webhook retry must not repeat customer replies |
| `/api/cron/editor-dispatch` | `* * * * *` | Automatic inquiry assignment/rotation | Song-brief field validation, approved worker/Page/group routes, Suno readiness/timing rules; must not wait behind optional profile/ads work |
| `/api/cron/contact-identities` | `* * * * *` | Automatic contact identity reconciliation | Preserve Page UUID + PSID identity, manual names and aliases; never merge solely on similar names |
| `/api/cron/inquiry-history` | `1-59/2 * * * *` | Bounded first-inquiry recovery | Historical inquiry dates remain evidence; an old contact must not become a fresh assignment or new sale |
| `/api/cron/contact-profiles` | `0-58/2 * * * *` | Legacy full-profile worker outside workspace; demographics/enrichment worker inside workspace | Explicit plan for continuing full profile facts/summaries and song fields; current workspace mode does not run the legacy full-profile worker |
| `/api/cron/messaging-auto-tag` | `* * * * *` | Legacy stage sync outside workspace; Veo outcome processing inside workspace | Preserve Suno stage/tag IDs, manual outcomes, paid/order stops and staff intervention; reconcile differing implementations |
| `/api/cron/chatbot` | `* * * * *` | Inbound recovery, handoff/continuation review and chatbot follow-ups | Explicit workspace chatbot opt-in plus per-Page permission; preserve Suno song brief, quotes and hold rules; no duplicated follow-up owner |
| `/api/cron/workspace` | `* * * * *` | Core maintenance, financial reconciliation, Telegram workforce sync, source checks, Jev, Page budgets, event processing, receipt review/forwarding and photo cleanup | Split success/health by subtask; apply confirmed Suno financial rules; preserve item leases and original seller; report failed dependencies instead of a blanket healthy status |
| `/api/cron/quotas` | `1-59/5 * * * *` | Spend-supported quota refresh | Use approved Suno units and spend coverage; no video-derived quota assumptions or missing-spend zeroes |
| `/api/cron/incentives` | `* * * * *` | Durable incentive-notice preparation | Confirm Suno incentive policy, currency and recipient scope; creating a notice must not create a payment or wage payout |
| `/api/cron/meta-ads-sync` | `2-59/5 * * * *` | Ad discovery, stored-credential refresh, spend/inventory refresh | Polls every five minutes, but shared database claims coordinate actual hourly refreshes; verify Suno ad access, token renewal, cursor/checkpoint and overlapping external calls |
| `/api/cron/database-health` | `* * * * *` | Storage/resource metrics and maintenance health | Missing/stale metrics remain unhealthy/unknown; monitor event/offer/financial backlogs; avoid creating overlapping cleanup owners |

Source: the matching `src/app/api/cron/*/route.ts` handlers and `vercel.json`. All 12 scheduled handlers must reject unauthorized calls and restrict work to Suno's runtime/tenant/Page scope.

## App routes without a declared Vercel schedule

| Route | Existing source behavior/reference | Planned disposition before launch |
| --- | --- | --- |
| `/api/cron/follow-up-automations` | Source comment references an external minute job; runs workflow steps, chatbot recovery/reviews/follow-ups, optional ads coordination and a nested campaign worker | Verify actual external configuration. Preserve workflow automation through one authenticated owner; separate duplicated chatbot tasks from `/chatbot` or prove shared item-claim safety |
| `/api/cron/campaign-scheduled` | Handles due campaigns, due recipient windows and resumable immediate campaigns; also called from the follow-up route | Assign a verified trigger or direct internal worker call. Fix/prove the nested service-authentication path in workspace mode; preserve recipient claims and in-flight delivery state |
| `/api/cron/campaign-loop` | Recurring/loop campaign processing and recipient scheduling | Preserve the feature with an authenticated scheduled owner or a tested replacement; never silently strand existing loops |
| `/api/cron/exports` | Processes durable export queue and removes expired export files/metadata | Give queued exports and expiry a verified owner, including exports requested while the user closes the page |
| `/api/cron/sync` | Legacy conversation/contact/name synchronization; workspace mode changes historical import access | Document what remains allowed: current contact/name repair, bounded historical reads and manual requests. Replace any blocked source with a compatible current-event path; do not drop history access |

No new frequency is approved by this document. Proposed frequencies should follow required latency, existing Suno behavior, database capacity and platform limits. Unknown external configuration remains an explicit release blocker for the affected feature.

## Confirmed mode and ownership traps

1. **Chatbot opt-in:** `/api/cron/chatbot` returns a workspace-mode skip when `VEO_WORKSPACE_ENABLED=true` and `VEO_CHATBOT_ENABLED` is not `true`. A Page's enabled flag alone does not keep this worker running.
2. **Profile worker substitution:** `/contact-profiles` selects `processVeoDemographics` in workspace mode. `processContactProfiles` itself returns `launch_events_only` in that mode. Full summaries, evidence, requested fields and retained profile snapshots need an explicit compatible refresh path.
3. **Export source changes:** workspace exports read launch-period event-inbox records. A complete-history export must not be promised if it contains only those events. Preserve access to retained older records through an explicit, labelled route/source plan.
4. **Cron-to-cron authorization:** the current follow-up worker calls `/campaign-scheduled` without an Authorization header; workspace middleware requires the cron bearer credential. Use a shared internal worker call or a securely authenticated nested request, then test it. Do not weaken the boundary to make the nested call succeed.
5. **Duplicated lanes:** workspace and workspace-events both process persisted events; chatbot and follow-up-automations both reach chatbot jobs; dedicated and external ads lanes reach the same refreshes. Outer route locks alone do not deduplicate overlapping item work. Verify the shared database claim and acknowledgment behavior.
6. **Pre-workspace authorization:** some legacy cron routes have no local credential check and depend on mode-specific middleware. Require a verified service boundary in every deployed mode, including preparation and recovery. Do not expose them temporarily during the switch.
7. **Song scheduler bypass:** workspace Jaucian dispatch takes a different path before the legacy song scheduler, while the Suno profile empties legacy `SUNO_GROUPS`. Registering a cron or webhook does not reconnect `SONG SENT` jobs to workspace assignments.
8. **Deployment-to-launch ingestion:** the Facebook webhook calls the event journal before normal legacy processing when the handoff secret is configured, even while workspace enablement is false. Missing journal schema/RPCs can therefore fail ingestion before launch. Test the exact additive-schema, compatible-deployment and watermark order.

## Tasks nested inside the workspace worker

These tasks need individual checkpoints and operational checks even though they share `/api/cron/workspace`:

- Expired receipt/photo removal and receipt-deletion outbox acknowledgment.
- Financial day finalization and later adjustment reconciliation, using Philippine work dates.
- Telegram directory/workforce synchronization and membership verification.
- Work/operations maintenance, stale-offer cleanup and intake maintenance.
- Jev interruption review; failures keep the relevant customer under the appropriate human hold.
- Facebook source refresh jobs and receipt eligibility checks.
- Page budget refreshes and planning dependencies.
- Persisted Messenger event processing.
- Team/supervisor review auto-approval only under the configured Suno policy.
- Approved receipt submission enqueueing, leased handoff to Jaucian and acknowledgment/reconciliation.

Slow optional enrichment must not consume the budget required for due messages, live event processing or offer deadlines. Each consumer needs a bounded batch, safe continuation cursor and visible last-success/backlog state. Recovery must not bypass current access, ownership, opt-out, financial approval or fresh source checks.

## Database-level scheduling

Read-only metadata inspection of the existing Suno database found one active database job:

| Existing job | UTC schedule | Scope | Plan |
| --- | --- | --- | --- |
| `tokko-database-maintenance` | `17 * * * *` | Existing Suno database maintenance | Preserve and inspect its function/dependencies before any replacement. Its inherited name is not evidence that it belongs to a different database. No job commands or credentials were printed. |

The source also declares the following jobs or replacements:

- `tokko-database-retention`: older hourly retention, superseded by the control-plane maintenance migration. Do not create both cleanup owners merely because both SQL files exist.
- `tokko-database-maintenance`: the combined control-plane owner, scheduled hourly at minute 17.
- `veo-storage-protection`: source database storage maintenance every five minutes. Reconcile its retention responsibilities with the existing Suno maintenance job before installation.

The table declarations/migration files are historical source, not a statement that these jobs are installed. Preserve financial/audit/history records under the intended retention policy. Test storage headroom, bounded deletes, expired media, profile/transcript retention and failed cleanup visibility before enabling new maintenance.

## Suno Jaucian scheduling

The copied bot uses a dedicated archive and must not reuse Veo's scheduler state or the CRM's generic archive table names.

| Mechanism | Source schedule | Role and compatibility condition |
| --- | --- | --- |
| `suno-jaucian-dispatch` | Every minute via archive `pg_cron` + `pg_net` | Primary authenticated `/api/cron/dispatch` tick; Suno deployment origin, allowlist and tenant must match |
| `suno-jaucian-dispatch-watchdog` | Every two minutes | Recover the owned primary job only; do not repair a Veo deployment or bypass operator pauses |
| Bot Vercel fallback | 25 entries: 24 hourly calls plus `15:59 UTC` closeout | Shared dispatcher/outbox ownership; hourly fallback cannot be treated as equivalent latency to the minute schedule |
| External cron provider | Alternative mechanism present in source | Verify whether needed/used. Do not install another primary owner without shared claims and an explicit failover plan |

The shared dispatcher owns sends, not individual calendar/profile/UI requests. Its planned subflows include approved intake/offer notices, readiness callbacks, tomorrow availability polls, reviewed receipt notices, report delivery, incentives, song reminders/completions and retries. Some are suppressed by current `new_clients_only`, availability and reviewed-deal feature switches; the approved Suno feature matrix must state which are enabled and which are intentionally held.

Tomorrow availability, Philippine midnight, daily earnings finalization, song deadlines, offer expiry and periodic delivery recovery are separate obligations. Specify PHT business dates and UTC storage timestamps explicitly. Do not accidentally use a midnight UTC closeout for a Philippine work day.

The [route register](suno-route-register.md) includes all 28 explicit Python bot paths. Six are explicitly blocked with 410 under workspace mode. For legacy freebie status/assignment, referrals/recruiter credit, Page-access surveys, concern/member/plan reports, report replacement and authorized Makata private reports, record whether to retain, supersede or hold for a reviewed business decision. Their presence in source does not establish current Veo activation, but their Suno-relevant behavior must not be lost unnoticed.

Keep the webhook as the single owner of the bot update stream. A separate media-bridge bot needs a separate token/webhook, or an explicitly designed single-webhook router; it must not overwrite Jaucian's webhook.

## Verification contract for every job

- Record the intended trigger and deployed trigger separately; inspect provider configuration without logging keys or URL credentials.
- Verify authentication in preparation, workspace and recovery modes, including internal calls.
- Verify Page/tenant/worker/group scope before processing and again before a consequential send or commit.
- Show last scheduled attempt, last successful business checkpoint, duration, queue depth/oldest age, retry count and blocked/reconciliation state.
- Distinguish a healthy empty queue, a deliberate feature pause, unavailable source data, a failed job and stale monitoring.
- Repeated ticks, concurrent routes, a worker restart and a timeout after an acknowledged send must not repeat delivery or financial postings.
- A failed optional ads/profile/health subtask must not silently prevent due live work. A failed authorization/source check must prevent the affected consequential action.
- For Jaucian scheduler changes, follow its existing maintenance instructions: project validation, scheduler recovery verification, scheduler status and read-only health. Verify publication via normal scheduled delivery; do not manually dispatch test posts.

The final release gate is **17/17 app routes with an explicit disposition**, all nested tasks assigned, the database jobs reconciled, and the bot dispatcher/failover verified. This document does not claim those deployment checks have passed.
