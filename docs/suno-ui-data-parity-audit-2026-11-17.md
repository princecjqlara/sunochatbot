# Suno UI, feature and data parity audit — November 17, 2026

The deployed `/ui-preview` is a sample-data demonstration. It is not a completed Veo workspace backed by Suno records. The previous release's passing tests, build and HTTP checks did not establish full feature or data parity.

This audit compared Suno commit `d67da304d60a43b4590ff09e9cb7883e262cb6f5` with committed Veo source `817b9b06e5a57bbf94f459fa0d85227cfe9a84d0`, then checked the deployed preview and Suno's existing database. It made no production writes or changes to chatbot behavior, settings, webhooks or jobs. Database checks used a read-only transaction and exported aggregate counts and schema metadata, not customer contents.

## What matches and what does not

| Area | Evidence | Result |
| --- | --- | --- |
| Shared theme | `src/app/globals.css` matches committed Veo after newline normalization | Preserved |
| Canonical role navigation | `src/lib/veo-navigation.ts` matches committed Veo | Preserved; Owner has 30 destinations |
| Dashboard shell styles | Every literal CSS class string in Veo's dashboard layout exists in Suno's layout/shared shell | Retained in source; pixel-level browser verification unavailable |
| Application page files | All 22 original Veo pages are present; Suno adds `/ui-preview` | Source coverage only |
| API route files | All 125 original Veo API paths are present | Source coverage only |
| UI component files | All 56 original Veo top-level components are present; Suno adds two preview/shell components | Source coverage only |
| Public preview bodies | One shared Teams component and two uses of a custom sample client table | Three sample views, not three complete live Veo screens |
| Remaining public preview menu items | Generic setup placeholder | 27 of 30 Owner destinations |
| Real Suno records in the preview | No live data reads are implemented | Not connected |

The authenticated application contains the fuller screens. The public preview does not render them. In particular, its custom Contacts table is not the complete Veo Contacts screen or contact-profile workflow.

The comparison also found 63 runtime source differences. These include deliberate Suno song/domain adapters and cannot be treated as either missing features or proven equivalent behavior solely from filenames. Browser discovery returned no available browser; source/HTTP checks do not prove visual equivalence.

## Live Suno data and missing integration

At the November 17 read-only check, the existing Suno CRM contained:

| Existing relation | Exact row count |
| --- | ---: |
| Pages | 13 |
| Contacts | 27,936 |
| Existing user identities | 1 |
| User/Page grants | 13 |
| Saved chatbot configurations | 12 |
| Chatbot contact states | 2,162 |
| Follow-up job records, across statuses | 58,596 |

These counts confirm that records are present; they do not certify completeness of historical data, valid Page tokens, or reconciled financial history. No absent relation was reported as a successful zero-row dataset.

The new workspace is disabled and production remains in `SUNO_DEPLOYMENT_STAGE=setup`. The following required tables are absent: `veo_tenants`, `veo_accounts`, `veo_teams`, `veo_orders`, `veo_payments`, `veo_salary_days`, `veo_contact_details`, `veo_event_inbox`, and `contact_verified_payments`. The older `contact_purchases` relation is also absent.

The required `veo_scope`, `veo_dashboard_summary`, `veo_team_capacity`, `get_automation_page_scope`, and `get_contact_finance_records` functions are absent. The deployed `/api/workspace` and `/api/pages` return the setup restriction (503), rather than real workspace results.

## Feature gaps by destination

| Feature area | Actual gap |
| --- | --- |
| Contacts, customer profiles, tags, history and exports | Preview uses invented sample clients. Real retained contacts exist, but authenticated workspace access, source coverage and profile/history adapters still need live integration and reconciliation. |
| Accounts, teams, permissions, capacity and staff reports | Workspace tenant/accounts/teams are missing. The one retained user and Page grants have not become a working workspace hierarchy. |
| New clients, assignments and song work | The real intake/assignment screens are not rendered by the preview; tenant, worker/group/Page mapping and historical work handover remain incomplete. |
| Receipts, orders, verified payments and salary | New workspace ledger tables/functions are absent. Legacy payment/work records need explicit mapping; earnings rules remain unconfirmed. |
| Both calendars, ad budgets, ads and creative reports | Preview destinations are placeholders. Actual screens need scoped source access, historical coverage and reconciled money/work/date definitions. |
| Telegram groups and delivery | Approved group IDs and separate archive configuration exist, but tenant enrollment and historical/group/work routing remain incomplete. This audit did not invoke bot delivery or change its webhook. |
| Campaigns, follow-ups, pricing, templates, welcome and chatbot settings | Their preview destinations are placeholders. Existing chatbot configurations and job records remain in the older CRM; they must be preserved during any connection/handover. |

## Upstream change requiring a policy decision

Committed Veo has one newer migration not in Suno: `202611170001_veo_manager_salary_immunity.sql`. It changes managers to fixed 40% commission with quota/attendance immunity and updates associated screen explanations. This is a financial and personnel policy change, not a missing theme file. Suno's policy is still unconfirmed; this audit did not import or apply it. Seven uncommitted Veo paths were excluded from the committed-source comparison and left untouched.

## Concrete preparation completed

The fresh schema snapshot has 36 tables, 443 columns and 32 application functions. An isolated rehearsal applied all 162 currently planned incremental migrations to a disposable copy of that schema. It preserved all 443 original columns and synthetic retained identities, Page grants, chatbot settings, collected details, staff quotes, human holds, follow-up jobs and acknowledged deliveries. Tenant-launch fixture checks also passed and were rolled back.

The review-only SQL was regenerated at `verification/suno-incremental-review.sql`; its previous checked-in version listed 160 files and omitted the two latest bounded-database/quota changes. The current rehearsal receipt is `verification/incremental-rehearsal.json`. Neither artifact was executed against production. A passing fixture rehearsal is not proof of live historical mapping or unchanged end-to-end chatbot behavior after a future cutover.

## Work still required for a real workspace

1. Complete an additive integration against the existing Suno CRM, with a restorable backup and a reviewed execution order that preserves the running chatbot and its queued work.
2. Enroll the retained owner and real staff/teams/Page access; keep real data behind authentication rather than placing it in the anonymous preview.
3. Connect the actual Veo screens to authorized Suno data. Reconcile retained contacts, profiles, orders/payments, history, assignments and work obligations instead of substituting samples or empty totals.
4. Implement confirmed Suno earnings rules before enabling financial reports; do not infer them from Veo defaults or the newer manager-immunity change.
5. Reconcile both calendars, Page/ad ownership and historical coverage against real records. Verify interactive desktop/mobile screens and all relevant roles when a browser is available.

The existing release wrapper still rejects applied cutover/launch while these requirements are incomplete. Disabling the setup restriction alone would expose missing dependencies rather than finish the integration.

## Reproduce the checks

```powershell
py verification/audit_suno_veo_ui.py --veo-root "C:/Users/Cj Lara/Downloads/VEO SYSTEM/veobot/tokko-chatbot"
node scripts/check-suno-setup.mjs --database
node scripts/snapshot-suno-schema.mjs
node scripts/rehearse-suno-upgrade.mjs
node scripts/prepare-suno-upgrade.mjs
node scripts/verify-workspace-preview.mjs --base=https://suno-system.vercel.app
```

The source comparison writes `verification/ui-feature-parity-audit.json`. Preview HTTP verification now explicitly reports `live_feature_parity_verified: false`, even when its sample-page and access-control assertions pass.
