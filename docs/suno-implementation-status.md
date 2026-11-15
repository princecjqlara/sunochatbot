# Suno implementation status — November 15, 2026

Work is in `sunobot/suno-system`. The original Suno app and both Veo source checkouts were preserved. Hosted previews have passed their regression/build gates. The separate `suno-system` web project supports production publication in explicit setup mode; this is separate from operational activation. The existing CRM schema/customer data, Telegram webhook and group approvals remain unchanged.

## Implemented in the new checkout

- Tenant launch isolation: a Suno-specific replacement for the inherited launch RPC validates active ownership, rejects foreign Page bindings, scopes historical snapshots to the selected Pages and retains existing grants/campaigns/profile jobs. Two-tenant SQL regressions cover cross-workspace isolation and rollback. See `docs/suno-tenancy.md`. This source migration has not been applied to the live CRM.

- Full Veo source baseline: 125 API routes, 22 page routes, 56 principal components, both calendars, customer profiles, accounts/teams, assignments, production, receipt review, campaigns, media, reporting and operational workers. The route register still classifies every path; presence alone does not establish live acceptance.
- Suno song conversation engine, owner-selected knowledge, seven-field customer form, twenty-field saved profile, partial answers/corrections, form delivery tracking and customer-specific staff quotes. Existing Page settings were inspected read-only: twelve chatbot configurations use the twenty-field song profile and 26% completion threshold. One is disabled; its setting is preserved.
- Shared Suno field aliases for forms, profiles and SQL assignment checks. Six meaningful distinct answers out of twenty meet the current saved 26% gate. Full-form completion remains separate. Other saved/manual profile fields remain visible.
- Suno human takeover/review states, current Messenger label checks, scoped quotes in replies and follow-ups, and delivery reservations integrated into actual sends. A failed or uncertain acknowledgment cannot automatically resend the same reserved text. Explicit transient Graph rejections use bounded retries.
- Configured Suno assignment links on both CRM and Telegram sides, with foreign/Veo origin rejection. The historical SQL generators are adapted at the authenticated handoff response.
- Full contact-profile queue enabled through `SUNO_CONTACT_PROFILE_MODE=remote`: bounded leases, current Page access, saved source messages, source-grounded summaries, manual correction precedence, refresh action and visible pending/failure state. Existing local-archive mode remains available.
- Full Meta-history exports via explicit `SUNO_HISTORY_SOURCE=meta`; the chosen source is retained on each job. Event-inbox exports are labelled with their narrower coverage. Incomplete pagination fails the export; cleanup retains metadata when object removal fails.
- Profile display of saved staff quotes, human handover state and actual assignment threshold. Conversion models inherited from Veo are unavailable in Suno mode until validation is recorded.
- A typed Telegram song-work bridge for assigned **orders**: `/songs`, `SONG SENT <order UUID>`, `SONG REVISION <order UUID>`. The CRM verifies worker/group/Page/current ownership, uses stable update references and records fulfillment independently of payment/seller. Replies use the normal scheduled outbox and are reauthorized before delivery.
- Legacy Suno group definitions retained for recovery. This does not approve any group or enable a second assignment sender.
- All seventeen cron paths require authentication in their handlers as well as through middleware, in preparation, workspace and recovery modes. The copied deployment now declares sixteen schedules; legacy `/cron/sync` has an explicit manual/recovery disposition. Dedicated workflow scheduling delegates chatbot and campaign work to their own workers. Existing nested fallback calls carry bearer authorization.
- Deployment configuration runs the complete app regression gate before building. The Python service retains its deployment validation gate and includes the Suno song-work regression file.
- `SUNO_DEPLOYMENT_STAGE=setup` publishes an honest setup screen, keeps session bootstrap available and pauses API access, ingestion, login writes and scheduled work before database access. Scheduled requests retain authentication and return a recorded skip. This allows separate production hosting while the live cutover remains incomplete. Release tests isolate hosted application credentials/flags so their own fixtures exercise both setup and active behavior.
- A read-only snapshot of the actual CRM schema and an isolated incremental upgrade rehearsal. Full filename/checksum receipts avoid numeric version collisions; the generated baseline is never replayed. The rehearsal preserves all 443 existing table columns and synthetic retained identities, settings, quotes, holds, pending follow-ups and acknowledged deliveries. Settings restoration prevents upstream model/default changes from overwriting Suno choices.

## Live acceptance and remaining work

These items remain open; this is not a completed production deployment:

1. **Earnings policy:** the Suno rate/unit/role rules were requested and are still needed. Veo's copied 35%/40% salary, quota and incentive rules remain unapproved. Financial activation stays blocked; no new Suno rates were invented. The source financial adapter and role/calendar reconciliation must be completed after the actual rule is supplied.
2. **Dedicated Jaucian archive and hosting:** the separate Suno System organization and `wbafvhaqsloutheeomob` archive are provisioned in Singapore. All five tables/eight RPCs and permissions were verified; a live transaction checked queue/poll/history behavior and rolled back all test rows. The web production is `https://suno-system.vercel.app`; the separate Python project is `dannysunobot`, configured for setup mode and its own archive. Hosted bot acceptance is recorded separately. Tenant creation and public webhook connection remain pending. The provided bot identity was verified, but no webhook was registered or update stream consumed. Secrets stay in provider settings and ignored local settings.
3. **Destinations:** the two candidate Suno groups/topics still need verified membership, intended Page routes and explicit approval. The allowlist is empty. No test message or manual dispatch has been sent.
4. **Retained work handover:** the new order-based song bridge does not convert legacy eight-character song tokens, pre-order assignment obligations, old song jobs, freebie/referral/recruiter records or private Makata report state. Those require the real archive and explicit mapping/reconciliation. Their legacy sources remain in the copy; the six mode-blocked endpoints remain listed in the master plan.
5. **Cutover:** obtain a restorable live backup, establish one webhook/worker owner, reconcile pending campaigns/exports/follow-ups, test the deployment-to-launch watermark and verify account login recovery. The existing database maintenance job is preserved by omitting the baseline installer. New storage maintenance and existing maintenance responsibilities still need observation against the live deployment.
6. **Profile/calendar acceptance:** source and isolated SQL regressions cover privacy, unknown costs, retained finance and calendar calculations. Real Suno historical data, all roles, all thirteen Pages, every profile section, both calendars and mobile/interactive behavior still need end-to-end reconciliation. The in-app browser runtime was unavailable during preparation; no successful visual sign-in verification is claimed.
7. **Production verification:** the web production setup deployment and dedicated archive schema passed their checks. The Python deployment adds setup boundaries, truthful paused health and authenticated dispatch, with 1,405 local regression tests passing. It explicitly selects the Python WSGI framework. Verify its hosted build and read-only API checks. Scheduler recovery and normal scheduled delivery remain pending an approved pilot and compatible CRM handover. Do not invoke dispatch manually.
8. **Meta runtime ownership:** install and explicitly configure the enforced runtime policy, verify each intended Page token belongs to the selected Suno Meta app, and register only those Pages. A source allowlist alone does not populate `pages.automation_app_id`. The read-only setup check now reports the missing ownership RPC/configuration; preserve the fail-closed runtime guard.

The machine-readable feature coverage intentionally keeps `compatibility_verified=false` until these live checks have evidence. The historical planning documents are the approved baseline; this file records subsequent implementation and outstanding acceptance.

## Reproduce the checks

```powershell
node scripts/snapshot-suno-schema.mjs  # read-only live metadata; saved privately
node scripts/rehearse-suno-upgrade.mjs # disposable local database only
node scripts/prepare-suno-upgrade.mjs  # review SQL only, after exact rehearsal
npm run typecheck
npm run test:release
node --max-old-space-size=2048 node_modules/next/dist/bin/next build
py jaucian/validate_project.py
py verification/build_feature_register.py
```

`scripts/suno-release.mjs --preflight` now means the isolated incremental rehearsal. Applied cutover commands reject execution while the unfinished live requirements remain. The older upstream release helper is retained for provenance, never used to bypass the file/hash plan.
