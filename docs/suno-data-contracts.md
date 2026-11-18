# Suno data and contact-profile compatibility contracts

Planning only, November 14, 2026. The existing Suno application/data is the compatibility baseline. Veo contributes management features; it does not redefine a Suno customer's brief, quote, ownership, payment or delivered song.

## Inspected baseline

Read-only catalog inspection of Suno found 30 public tables, 411 information-schema column records, 28 distinct public function names, and 21 trigger/event records. These are metadata counts, not customer-row counts or a complete migration proof. The inventory includes no customer message bodies, payment records or credentials.

The new copy contains the Veo source migrations, but names alone do not prove compatibility. Some historical source tables are later replaced/dropped, some relation names may be views, and both branches contain reused migration versions. Reconcile final object definitions and existing data, not just counts. The inspection specifically found `public.chatbot_message_deliveries` in Suno while the Veo migration declarations do not introduce it; retain or explicitly supersede its guarantees and records.

Evidence snapshots: `verification/current-suno-schema-inventory.json`, `verification/source-table-inventory.json`, `verification/migration-plan.json` and `verification/feature-file-inventory.json`.

The [field preservation register](suno-current-data-field-register.md) catalogues all 411 column records, existing function names and trigger events. This includes `contact_interactions` outside the public base-table list, so its view/compatibility behavior must be inspected rather than declaring its data absent. Existing quote/pause/form columns are present on Suno contact state and must survive the merge.

## Identity and isolation invariants

- Keep existing Suno user UUIDs, Page UUIDs/Facebook Page IDs, contact UUIDs and Page-scoped PSIDs. Do not rebuild identities from display names, phone numbers or Telegram usernames.
- Keep stable references for tags, campaigns, export jobs, knowledge/media, custom quotes, conversation state and existing deliveries. New workspace/tenant/team/order/payment/song IDs must have explicit mappings.
- Verify both the configured API project and every database connection target. Suno must not read/write the Veo database through a fallback route.
- Keep Suno's Meta app/runtime ownership and each Page's current credentials/subscription state. An application's new login method does not authorize replacing its Facebook app identity.
- Telegram numeric IDs are verified separately from app identities. Group membership/admin status is not an automatic application role grant.
- Source migrations may retain internal `veo_*` object names for protocol compatibility inside Suno's separate database. Renaming every identifier is not a migration strategy.

## Data-domain contracts

| Domain | Preserve/map | Writer and refresh owner | Acceptance evidence |
| --- | --- | --- | --- |
| Tenant ownership and launch | Owner/tenant IDs, Page ownership, immutable launch cutoff and tenant-scoped archives | Server-only tenant launch and Owner-authorized Page connections | Two-tenant launch retains foreign ownership/history, existing grants/campaigns/profile jobs; foreign legacy grants cannot authorize Page takeover; retries preserve the cutoff |
| Users, accounts and Page access | Retained owner/staff IDs, existing logins, Page grants, team/supervisor mappings | Auth/account service; deliberate enrollment and scoped grant changes | Existing identities can sign in through the intended path; no unauthorized branch/Page access or accidental lockout |
| Page and business configuration | Names/IDs, instructions, fallback/model choices, enabled state, required fields, detail thresholds, collection scope, welcome/templates and app ownership | Owner-authorized settings APIs | Every existing Page configuration is compared before/after; all 13 Pages are accounted for individually |
| Contact identity and controls | Name/profile aliases, Page+PSID key, contact notes/metadata, contact bot permission, manual stop, stage/tag state | Current-event identity collector plus audited manual edits | No cross-Page merge, no overwrite of manual corrections, no opt-out/hold loss |
| Song brief | Business, products/services, tagline, lyrics language, singer/vocal preference, genre, additional requests, corrections and unknowns | Verified customer answers and audited staff correction | Saved seven-field briefs render and satisfy the same server-side eligibility rules; blank examples are not answers |
| Quotes and packages | Per-customer approved staff quote, time, scope, quantities, deposit/balance conditions and Page package catalog | Staff-authorized quote capture; package settings separately | Latest authorized scoped quote wins over older RAG/bot offers; one customer's quote does not affect another |
| Conversation and profile evidence | Original message IDs/times/senders, source cutoffs, retained transcripts/snapshots, citations and source coverage | Signed webhook/event inbox; explicit bounded profile/history jobs | Complete/partial/unavailable history is labelled; refresh failure retains the last usable profile; no fabricated source citations |
| Contact details/intelligence | Manual fields, saved confirmed answers, requested fields, grounded extracted facts, demographics, summaries, needs/problems/objections/promises | Contact profile service and a mode-compatible enrichment worker | Manual > saved > grounded extraction priorities are retained; corrected Suno fields remain visible and are not converted into video defaults |
| Contact timing and projections | Stated best time separately from activity estimate; prediction model/version/cutoff and history | Customer preference/manual correction; activity aggregation; explicitly validated model | Timezone/confidence shown; no video-trained conversion estimate presented as validated Suno accuracy |
| Source/ad attribution | Referral/evidence keys, ad/Page/account IDs, attribution status, source timestamps and coverage | Source verifier, ad catalog and current evidence jobs | Unknown/ambiguous origin stays unknown; ad spend isn't invented or inferred from a sales pitch |
| Sales and payments | Historical orders/receipt references, new verified payments, partial/full settlement, tips, refunds, currency and seller attribution | Authorized financial actions, immutable verified evidence and adjustment/reconciliation queues | Customer chat or Telegram text alone does not create a verified payment; multiple payments do not create duplicate orders/songs |
| Song work | Assigned owner, brief/order association, promised date, versions/revisions, completion/confirmation and handover history | One authoritative work/assignment service; song completion integration | Paid, assigned and delivered are distinct; revision policy is explicit; accepted handovers preserve history |
| Earnings/capacity | Current Suno earnings basis, recorded amounts, payout period/status, attendance, target basis and measured output units | Confirmed Suno policy, financial ledger and dated planning | Earnings are not assumed paid out; receipt posts/orders/song deliveries remain separate units; no implicit 35%/40% adoption |
| Campaigns/follow-ups | Audience/tag IDs, recipient state, queued/sent/failed IDs, loops, schedules, custom instructions, best-time data and claims | Campaign/workflow worker with a verified trigger | Active work is preserved or explicitly transitioned; retries respect current ownership/stage and do not repeat acknowledged messages |
| Media/knowledge/Drive | Existing storage paths/bucket privacy, metadata, document/chunk links, embeddings, Drive references and signed access | Owner upload/indexing APIs; bounded indexing/cleanup | Existing samples remain retrievable; embedding dimensions/model changes require an explicit compatible reindex; direct audio and knowledge-library audio support are treated separately |
| Exports/history/archive | Existing export jobs/files/expiry, Page history, historical customer records, retained evidence and launch cutoff | Scoped export/history services plus scheduled queue/cleanup owners | Historical and launch-period coverage is stated correctly; user can access permitted retained history without duplicating a new sale/assignment |
| Technical state | Migration receipts, job leases, outbox/send acknowledgments, automation epochs, health/retention metadata | Named maintenance/scheduler owners | No replay after rollout/restart; no arbitrary reset of dedupe state or wholesale cleanup of retained evidence |

The contract is about behavior and data ownership. It does not require keeping an obsolete helper file if a newer implementation passes the same relevant tests.

## Contact profile: required sections

The detailed contact page and the workspace contact drawer must expose consistent authorized records. Plan and verify each section independently:

1. Contact identity and permitted Page, profile refresh/name provenance and available contact details.
2. Current chatbot state, contact-level permission, staff ownership/human hold, pipeline stage and tags.
3. Seven-field song brief with saved answers, corrections, pending values and custom requested fields.
4. Latest customer-specific staff quote and its exact package/payment conditions.
5. Conversation timeline/messages and first-known inquiry, with sender, date and coverage.
6. Grounded summary, customer purpose/preferences, problems, objections, suggestions, promises and useful next-step context.
7. Manual corrections versus customer-confirmed/saved versus extracted information, with evidence where applicable.
8. Source/ad/referral evidence, attribution confidence/status and the matching creative when verified.
9. Orders and partial/full verified payments, refunds, balances, repeat-purchase history, lifetime value, average order/payment metrics and recorded milestone durations, by currency.
10. Existing campaign/follow-up attribution and relevant before-payment/before-order metrics, with coverage limitations.
11. Stated best contact time separately from inferred activity windows/confidence.
12. Demographics/projections only where supported, including model version/cutoff and unknown/unvalidated results.
13. Song assignment, work status/deadline, revisions and delivery/confirmation history through the approved Suno work model.
14. Refresh/enrichment job state, last usable result, stale/partial status, retry controls and source failure; failures must not blank out the current profile.

Newly available Veo profile/finance APIs depend on tables absent from the existing Suno schema. The plan must provision them and preserve the existing contact record before the UI is treated as complete.

## Calendar: preserve both feature families

### Marketing / inquiry-cohort calendar

Preserve monthly/day views, Page/ad filters, Page-level summaries and contact drilldowns. Keep first-inquiry cohorts, pipeline outcomes, confirmed outcomes, orders/payments and observed ad spend distinct. Support unknown attribution and incomplete source coverage. The calendar must not equate Converted tags or chat payment statements with verified revenue.

### Work / earnings calendar

Preserve month/day and authorized Page/team/worker scope, current-day planning, historical/new-period boundaries, orders created versus completed, cash/payment dates, spend, employee details, messages/coverage, and salary/adjustment information. Adapt work/output labels to Suno songs and the confirmed earnings policy. Explain booked sale, collected money, earnings and payout as separate quantities.

### Shared calendar acceptance

- Use Philippine dates for business grouping and explicit UTC timestamps for storage/events; test midnight, month-end, a prior-month inquiry paid this month, and a later refund/adjustment.
- Keep currencies separate unless an approved explicit conversion is present.
- Reconcile contact drilldowns to day/month totals; deduplicate overlapping Page/worker aggregations and partial/full payments under the intended metric.
- Backed-out/voided/corrected receipts and financial adjustments affect the proper metric/date without rewriting immutable finalized records silently.
- Authorize before using cached values. Cache keys must include current tenant/user/role/branch/Page scope and date; access revocation must prevent stale cached disclosure.
- Load every requested slice or return an explicit retryable/partial state. A failed Page slice must not become a misleading zero or a successful incomplete all-Page financial total.
- Keep retained historical context available and labelled; enforce the new-period cutoff for operational financial/assignment effects rather than erasing the contact's history.
- Calendar queries must not send messages, create work offers or cause duplicate financial finalization. Any planning-preparation RPC needs a bounded, audited purpose and single maintenance ownership.

## Migration and reconciliation plan

1. Capture a baseline of schema definitions, Page settings, IDs, grants, named job configuration and domain totals appropriate to each source. Back up through the intended operational process before any production migration.
2. Reconcile filename/hash/object definitions for both migration branches, including the three cross-branch version collisions and Veo's two duplicate-version groups. Preserve Suno-specific quote, form and delivery objects.
3. Define per-object add/alter/retain/supersede actions and per-domain data mappings. Do not use a full baseline replay or a blanket prefix replacement as the upgrade.
4. Rehearse against a disposable restoration with representative Suno data and protected credentials. Re-run migrations to verify safe resume/idempotency.
5. Compare IDs, relationships, settings and accepted financial/history totals before/after. Validate constraints, indexes, private bucket access and server-only RPC permissions.
6. Test new and old records through the contacts page, profile drawer, both calendars, campaigns/exports and all intended workers. Test both allowed and forbidden users/Pages.
7. Plan the event handover watermark, old/new worker ownership, paused pending jobs, backup/restore limitations and a reversal procedure. Restoring a database after real external sends requires acknowledgment-aware reconciliation, not blind replay.

All costs/earnings/output formulas and ambiguous completion/assignment policies remain business decisions to resolve before enabling their effects. Planning can continue without changing the current running system.
