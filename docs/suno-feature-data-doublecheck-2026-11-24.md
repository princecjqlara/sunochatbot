# Suno feature and data double-check

The deeper audit found three defects after the initial reporting release: the top-level Calendar & analytics screen still opened Sales, 90 contacts and their matching attribution rows had inquiry dates in 1970 from Unix seconds being treated as milliseconds, and optional collection was paused because storage maintenance had no successful checkpoint. Opening a route successfully did not prove that its intended report was connected.

## Corrections

- The authenticated inquiry calendar now reads the existing `/api/ad-calendar` cohort report, with month/Page filters, daily totals, 25-client drilldown pages and originating-ad comparisons. It labels Converted and Order Created as conversation stages. Verified direct song payments, tips, refunds and earnings remain in the separate Sales & work calendar. Suno's cohort API excludes inherited salary allowances and profit estimates.
- Migration `202611240102_suno_inquiry_timestamp_integrity.sql` repairs only seconds/milliseconds errors independently supported by each contact's creation time. It corrects 90 contact dates and 90 corresponding attribution dates, retains message/ad identities and journals each correction privately. Unsupported dates and intentionally older historical dates are preserved. New guards normalize that same supported unit error before storage. Existing chatbot source, configuration, holds, tags, financial records and queue state are preserved.
- The already scheduled database-health worker supplies bounded storage maintenance when the native SQL schedule has not produced a checkpoint, preserving the five-minute maintenance cadence. It does not depend on Veo salary/quota maintenance or on optional growth already being allowed. Resource pressure and failed checkpoints remain visible as failures. No new sender or schedule is installed, and no worker is manually dispatched for verification.
- The Suno workspace worker now reports source-collection, intake and maintenance retry states instead of returning an unconditional successful result when inherited financial processing is disabled.

Date repair uses `scripts/configure-suno-inquiry-integrity.mjs --preflight`, `--apply` and `--verify`. Apply requires unchanged evidence and a matching rollback preflight, and creates an encrypted backup of all affected records plus existing function definitions. Decryption/integrity and rollback are verified. The rollback refuses to overwrite a later intentional date change. Normal `updated_at` auditing reflects a repair or rollback; original values are retained in the private backup.

## Live feature checks

The initial audit checked all 32 Owner menu destinations and 27 authenticated API paths, then repeated the API paths without authentication. Navigation contains 32 unique Owner, 26 Team Leader, 23 Manager and 20 Member destinations. The report, Sales, song work, contacts, account directory, source status, staff warnings, storage health, advertising, Telegram configuration and contact-profile reads responded successfully. These checks exported counts, status codes and schema metadata, not customer messages or business records.

The retired Veo financial calendar API and historical-finance import endpoint intentionally return HTTP 410 in Suno. They are compatibility restrictions, not working Suno financial tools. A generic deprecation response from the latter contains no customer data. The repaired inquiry screen uses the active cohort API rather than these retired paths. Staff write flows are covered by isolated tests; live staffing is not fabricated to exercise them.

## Actual data and remaining setup

At the initial snapshot, Suno held 28,090 contacts, 13 saved Pages, 12 chatbot configurations, 2,310 chatbot states and 12,216 recorded message deliveries. Follow-up jobs included sent, pending, failed, cancelled and manual-ready states; the aggregate queue size is not a delivery-success claim. There were no invalid public indexes, unvalidated public constraints, anonymously executable application definer functions or anonymously readable public tables with RLS disabled.

The following were actual missing records, independently of whether the screens exist:

| Area | Initial data state / implication |
| --- | --- |
| Staffing | One active Owner, zero teams or other staff accounts. Real staff enrollment and Page assignments are required for staff operations. |
| Sales and earnings | Zero Suno sales, charges, payments or song-work records; zero retained verified-payment and purchase rows. Contact stages or chat receipt claims must not create verified revenue. |
| Capacity and budgets | No saved staff capacity, quotas or Page budgets. Targets need real, explicit allocations. |
| Ads | No connected ad-account credential rows, daily spend or spend-coverage records. There were 172 attribution rows and 103 referral events; source presence does not prove a verified originating ad or complete history. |
| Profiles | No stored profile snapshots, conversation metrics, demographic/detail rows or conversion-cache records. Historical profile collection is incomplete. It cannot be filled with guesses or a blanket claim of zero activity. |
| Contact coverage | 1,739 contacts lacked a usable saved name; 522 lacked an inquiry timestamp. The 90 proven unit errors are repaired separately; missing names/dates are not inferred. |
| Telegram | Two configured groups, but no verified worker mappings, memberships, staff-group links or team/Page routes. Group configuration alone does not establish a functioning staff assignment route. |
| Source processing | 207 source jobs were pending with no recorded success while optional work was paused. Recovery must be confirmed from normal scheduled execution. No dispatcher is invoked manually. |

These are snapshot counts and can grow during normal use. Raw customer records, credentials and backups remain outside committed artifacts. Ad-account connection, staff identity verification and historical payment verification need real account/source evidence; they are not silently provisioned by this audit.

## Current Veo comparison

The reference remote was refreshed and remains at `0819ec374fe6fd7574fcf331b2bf7e8fa2a55184`. A fresh read-only schema comparison found all 1,502 public reference columns among Suno's 1,618 public columns, with no missing columns or data-type differences. This includes table/view interface fields and is not a claim of complete feature parity.

Six reference RPC names remain absent: `veo_business_insights` (adapted through Suno's own operational report), the two manual client-assignment RPCs, and the three maintenance-phase claim/finish/status RPCs. The latter capabilities are not claimed as installed by this audit. Veo's uncommitted work was preserved. Suno's direct-sales policy and retained chatbot remain the application boundary.

## Validation scope

The changes add isolated SQL tests for evidence-bounded repair, preservation of customer controls and attribution, unsupported dates, future writes, private grants and timezone independence. Component/API tests verify the actual authenticated inquiry screen, its pagination and financial distinctions. Scheduler tests verify fallback retention and honest retry reporting without enabling inherited financial workers. The full hosted release regression and production build remain mandatory before promotion. Live verification uses normal read APIs; scheduled recovery is observed through read-only status checks.
