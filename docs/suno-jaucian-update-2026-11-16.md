# Jaucian update adapted for Suno

The initial November 16 sync used these source commits:

| Source | Previously copied | Updated source |
| --- | --- | --- |
| Jaucian / Senior Manager | `2476c82f5ba36459fe6cd67d255dd7019246a0ed` | `fc78db9ea8a5817c01eec47c161141658a605d99` |
| Paired Veo web app | `f89cad734262cfef40054c66493ba98a6d63df23` | `b0840df6b051a3c9108f9c230b59e409ec23e138` |

The three newer bot commits fix client controls and delivery checkpoints, allow the complete assignment-health deadline, and retire expired failed menus. Four matching web commits repair the API/database controls, recover reads after outages, pause optional work during resource pressure and avoid unused dashboard queries.

## Carried over

- `/ready`, `/busy`, `/offers` and `/myclients` keep their current database authorization. Only current recipient-bound offer acceptance/decline buttons remain on the new menus. Removing an offer from a worker's list does not delete the customer.
- Notification completion requires an explicit positive application acknowledgment. A rejected or missing acknowledgment retries the saved checkpoint, preserving the Telegram message ID and original delivery time without another send.
- The normal dispatcher may inspect at most five exhausted failed menu replies older than thirty minutes. Only confirmed expiry/lost scope cancels the exact saved row revision. Offers, notices, acknowledged/uncertain sends and current menus remain intact; an upstream outage stops probing.
- Read-only health checks probe the pending-offer service when intake is enabled, allowing fifteen seconds for the application's twelve-second deadline and transport. An empty outbox does not establish healthy assignments.
- Workforce polling accepts either supported relationship-field order while retaining the same worker/group/date bounds. Workforce synchronization runs before unrelated cleanup or salary maintenance.
- Availability recovery ignores delayed failures from a previous request generation. Explicitly bounded report reads can retry; mutations retain their single-attempt transport behavior. Optional enrichment/planning pauses under resource pressure while critical sync, expiry and delivery work continue.
- Dashboard summary loading avoids unused order/sync lists, loads expensive reports sequentially and gives temporary failures a bounded retry path.

## Suno compatibility

The merge retains Suno's typed song-work bridge, tenant launch isolation, song intake rules, profile/history behavior, dedicated archive, setup guards and cron authentication.

Explicit command mentions must target `@dannysunobot` in Suno mode; commands addressed to other bots are ignored. Account-linking guidance uses the Suno profile. Bridge credentials cannot be posted to the inherited Veo origin.

New handover guidance is translated to the configured Suno HTTPS workspace, including the URL embedded in its text. Customer-supplied text is not rewritten. The new upstream three-answer collection label is patched in a separate Suno migration to display the saved Page requirement. The current twenty-field/26% policy therefore remains six meaningful answers; no new three-field gate is introduced.

The copied upstream SQL files retain their own identities. `202611160105_suno_jaucian_brief_controls.sql` records the Suno adjustment separately. All five added SQL files are included in the full filename/checksum upgrade plan and isolated schema rehearsal. Upstream one-off release/production-verification scripts and incident reports were reviewed as provenance; Suno continues using its own incremental upgrade and deployment workflow.

## Verification and live state

The Python deployment retains its full validation gate, including `test_suno_jaucian_update.py`. The app tests cover the paired API/SQL changes, controlled read retries, Suno links, dynamic brief status and tenant isolation. The isolated upgrade rehearses all pending files against retained schema metadata and rolls back fixture-only tenant launch checks. Deployment and targeted test receipts are stored under the ignored local `verification/` directory.

This update does not migrate the live CRM, create or launch a tenant, approve groups, register a Telegram webhook or enable intake. Both services stay in setup mode; the existing Suno earnings, routing and historical handover requirements remain open. No dispatcher or Telegram delivery is invoked manually.

## Latest recheck: paired app `39ffb87`

The next source check and fetch found Jaucian unchanged at `fc78db9ea8a5817c01eec47c161141658a605d99`. The paired app advanced from `b0840df6b051a3c9108f9c230b59e409ec23e138` to `39ffb879251c432ee010ebd4a5a31bdbcf463575`, with five additional committed updates. The following changes are adapted to Suno:

- Salary filters use a dedicated snapshot report instead of rebuilding quotas or locking shared planning rows. Employee/date/currency totals remain separate, and staff filters remain restricted to the current user or permitted branch. Missing current-day snapshots produce a retryable state. These changes do not approve Veo's commission rules for Suno; the financial adapter must cover both finance and snapshot-report entry points before activation.
- Suno retains the complete employee profile through an explicit button in the salary view. Ordinary salary loading does not issue a full-profile request. Once opened, the profile remains mounted during refresh; changing the selected employee requires opening that employee's profile separately.
- Verified completed-project evidence clears obsolete production-overdue warnings; upfront payment alone does not establish completed work. Warning views add employee/type/severity filters, compact rows and protection against responses for a previously selected employee.
- Sign-in uses one bounded, service-only account lookup, retains rate limiting and server-side password comparison, and rechecks workspace permissions in the session. A retry action can recover a temporary permission-service outage. Suno branding and credentials-only authentication are retained.
- Contact-stage recovery audits one known contact per Page in a bounded rotation, verifies the selected conversation's identity and saves its cursor only under the current lease. Stage evidence is limited to the operational launch period. Manual/shared tag displays refresh without treating a tag as verified payment.
- `scripts/repair-suno-data-api-schema-cache.mjs` is scoped by this checkout's Suno project/credential guards. It exposes explicit preflight/apply modes; an optional reconnect refreshes only identified PostgREST connections in that database. It is not invoked by deployment, and no live role settings or connections were changed during this sync.

All 28 changed upstream files were reviewed, including the maintenance tool under its Suno name. Four additional SQL migrations bring the isolated incremental rehearsal to 160 pending files. The original 443 table columns and retained fixture settings/jobs/deliveries remain preserved. Focused verification covers 93 tests in thirteen files plus type checking; the complete hosted release gate remains mandatory.
