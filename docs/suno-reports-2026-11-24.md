# Suno capacity, quotas and reporting

The direct-sales adapter had removed capacity, budget and ranking navigation and routed those URLs to Sales. These areas now have separate operational reports backed by real Suno sales and song-work records. Suno earnings remain 20% of verified song payments, 50% of tips and 20% of paid revision fees, with matching refund reversals.

| Area | Behavior |
| --- | --- |
| Dashboard / Business Insights | New sales, distinct paying clients and paid sales, first reported-sent songs, cash by currency, current outstanding balances, current work backlog, Page comparison, inquiry/ad attribution coverage and collected ad spend. |
| Capacity & quotas | Explicit staff/Page/date allocations, supervisor-planned availability, combined capacity and song quotas, distinct staff headcounts, unplanned workers, individual progress and observed output over the last 14 completed PHT dates. Missing plans remain unknown. |
| Sales & work calendar | Every selected PHT date, including zero-activity dates, with separate sale-creation, payment and first reported-sent counts. |
| Staff performance | Current workload and revision counts, first-sent output in the period, and verified receipts/earnings attributed to the recorded financial payee. Staff filters retain current branch scope. |
| Staff rankings | Song output or verified earnings in one selected currency; equal results share a position. |
| Page ad budget | Versioned Page/date/currency budget plans alongside Page workload, available capacity and recorded ad-spend coverage. Saving a plan does not change a Meta campaign. |
| Inquiry calendar / Ads performance | Restored navigation to existing inquiry-cohort and advertising reports, with links from Business Insights. These source-specific reports remain distinct from the Suno payment ledger. |

`GET /api/workspace/reports` reads `suno_operations_report`. It accepts up to 93 PHT dates since workspace launch, an optional assigned Page and a planning date through tomorrow. Concurrent identical reads are coalesced only after checking current access; no financial report cache or recurring report worker is added. Database reads have a bounded timeout. Partial and failed responses produce a retry state rather than a successful empty report, and changing filters immediately removes the old result.

`POST /api/workspace/reports` saves plans through `suno_operations_plan`. Supervisors can allocate staff from their current branch with access to the chosen Page; Page budgets require Owner or Team Leader access. Writes require same-origin requests, an explanation and the expected plan version. Only today and tomorrow can be edited. Concurrent stale saves return a conflict. Changes are audited. Unknown/unavailable allocations do not become available capacity; staff spread across multiple Pages are counted once in the headcount, while their explicit allocations are summed. Operational targets never change earnings, attendance, Ready/Busy declarations or staff discipline. No quotas or budget amounts are seeded.

First-sent output counts each sale once, on its earliest transition to Reported sent, attributed to the assignee in that event. Reopening and resending a revision cannot create another completed song. Workload follows the current work assignee while financial attribution follows the sale's original payee. A reported-sent event does not establish client receipt. Payments and refunds use their own dates; tips cannot settle song/revision balances. Money stays separated by currency. Current balances and backlog are independent of the selected activity period. No undocumented song deadline or historical delivery is inferred.

Inquiry counts use supported first-inquiry timestamps, separately from payment dates. Combining period inquiries and payments does not create a cohort conversion rate. Ad spend uses the existing `veo_calendar_spend` coverage reconciler, preserving checked zero, partial, misaligned and missing data. Budget plans and actual spend remain distinct. Complete-at-last-collection does not imply current freshness. Historical collection remains incomplete and is labelled in the reports.

## Current Veo source review

The reference remote was fetched on November 24 PHT. `origin/main` and the local committed reference both resolve to `0819ec374fe6fd7574fcf331b2bf7e8fa2a55184` (November 23), sixteen commits after the previous `36f9bc8` integration reference. Existing uncommitted Veo transport, retry and workspace changes were preserved and not copied.

Veo's new Business Insights concept was adapted to Suno's direct sales and song-work events rather than importing Veo's Closed/Done financial facts. The committed newer bulk-storage guard, bounded serial automatic contact sync and first-inquiry recovery guard were also transferred. Bulk imports stop at the existing 350 MB warning threshold to reserve headroom for live work; receipt intake keeps its separate existing critical-storage rule. No scheduler or external sender was changed.

Other newer reference changes reviewed include manual client-assignment controls, receipt-assignment preflight, assigned-Page sync/suspension enforcement, interactive read isolation, maintenance cadence and index consolidation. They are not claimed as installed by this reporting migration. The original Suno chatbot remains protected by its source manifest. This release is not a claim of universal Veo feature parity.

## Migration and verification

`202611240101_suno_operations_reports.sql` adds two private RLS tables and two service-only RPCs. It neither changes existing functions nor writes existing business records. Use `node scripts/configure-suno-reports.mjs --preflight`, then `--apply`, then `--verify`. Apply requires the matching successful rollback preflight and creates an encrypted private function/rollback backup with verified decryption. The rollback refuses to discard any real saved plan.

The isolated SQL tests cover PHT boundaries, prior-period payments refunded in-period, currency separation, current work versus financial branches, duplicate resend events, active access, Page denial, stale plan edits, explicit zero budgets and private grants. API and component tests cover date limits, same-origin writes, signed identity, error states, distinct report routing and stale responses. Full release regression and production build are required before promotion. Browser connection was unavailable during this task; pixel-level visual verification is not claimed.
