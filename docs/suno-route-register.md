# Suno route and component coverage register

Planning inventory. A mapped path is not a verified working feature. All entries still need their master-plan acceptance checks.

Coverage: 125 API routes, 22 page routes, 56 non-test top-level UI components, 17 cron routes; zero unclassified paths in these sets.

## Feature IDs

| ID | Area |
| --- | --- |
| F01 | Sign-in, personal profile and access boundary |
| F02 | Tenant isolation, accounts, teams, supervisors and offboarding |
| F03 | Facebook Pages, OAuth and connection ownership |
| F04 | Dashboard and workspace context |
| F05 | Contacts, search, filters and bulk contact operations |
| F06 | Contact profile identity and editable details |
| F07 | Contact conversation history, summaries and evidence |
| F08 | Contact orders, verified payments and financial metrics |
| F09 | Contact/ad attribution and Facebook source verification |
| F10 | Contact demographics, intelligence and projections |
| F11 | Marketing calendar and inquiry cohorts |
| F12 | Work calendar and earnings calendar |
| F13 | Ad accounts, spend, performance and synchronization |
| F14 | Page budgets and Page-level planning |
| F15 | Creative inventory and creative performance |
| F16 | Suno song brief and saved form answers |
| F17 | Chatbot settings, generation, trials and analytics |
| F18 | Knowledge, media, Drive and sample delivery |
| F19 | Packages, pricing, free offers and customer-specific staff quotes |
| F20 | Human handoff, bot permissions and guarded sending |
| F21 | Follow-ups, best contact time and workflow automation |
| F22 | Pipeline, contact tags and outcome synchronization |
| F23 | Ready/Busy, assignments, offers and handovers |
| F24 | Song production, work deadlines and completion |
| F25 | Receipt evidence, review, order milestones and corrections |
| F26 | Earnings, statements, referral/recruiter tracking and incentives |
| F27 | Attendance, availability, Page access surveys, capacity and quotas |
| F28 | Staff profiles, performance, rankings, concerns and alerts |
| F29 | Jaucian, Telegram identities, groups and topics |
| F30 | Campaigns, loops and tracked bulk messaging |
| F31 | Templates and welcome messages |
| F32 | Exports, history and archived access |
| F33 | Event ingestion, identity collection and sync |
| F34 | Shared navigation, accessibility and loading behavior |
| F35 | Operations, worker health and diagnostics |
| F36 | Schema, retention, storage lifecycle and recovery |

## API routes

| Route | Methods | Primary feature | Source |
| --- | --- | --- | --- |
| `/api/ad-calendar/confirmation` | GET | F11 | `src/app/api/ad-calendar/confirmation/route.ts` |
| `/api/ad-calendar` | GET | F11 | `src/app/api/ad-calendar/route.ts` |
| `/api/ad-calendar/sync` | POST | F11 | `src/app/api/ad-calendar/sync/route.ts` |
| `/api/ad-quality/connection` | GET | F13 | `src/app/api/ad-quality/connection/route.ts` |
| `/api/ad-quality/contacts` | GET | F13 | `src/app/api/ad-quality/contacts/route.ts` |
| `/api/ad-quality/performance` | GET | F13 | `src/app/api/ad-quality/performance/route.ts` |
| `/api/ad-quality/refresh-evidence` | POST | F13 | `src/app/api/ad-quality/refresh-evidence/route.ts` |
| `/api/ad-quality/resolve` | POST | F13 | `src/app/api/ad-quality/resolve/route.ts` |
| `/api/ad-quality` | GET | F13 | `src/app/api/ad-quality/route.ts` |
| `/api/ad-quality/spend` | POST | F13 | `src/app/api/ad-quality/spend/route.ts` |
| `/api/ad-quality/sync` | POST | F13 | `src/app/api/ad-quality/sync/route.ts` |
| `/api/auth/[...nextauth]` | GET | F01 | `src/app/api/auth/[...nextauth]/route.ts` |
| `/api/campaigns/[campaignId]/cancel` | POST | F30 | `src/app/api/campaigns/[campaignId]/cancel/route.ts` |
| `/api/campaigns/[campaignId]/recipients` | GET | F30 | `src/app/api/campaigns/[campaignId]/recipients/route.ts` |
| `/api/campaigns/[campaignId]/send` | POST | F30 | `src/app/api/campaigns/[campaignId]/send/route.ts` |
| `/api/campaigns` | DELETE, GET, POST, PUT | F30 | `src/app/api/campaigns/route.ts` |
| `/api/chatbot-media/[assetId]` | GET | F18 | `src/app/api/chatbot-media/[assetId]/route.ts` |
| `/api/check-oauth-config` | GET | F35 | `src/app/api/check-oauth-config/route.ts` |
| `/api/cron/campaign-loop` | GET | F30 | `src/app/api/cron/campaign-loop/route.ts` |
| `/api/cron/campaign-scheduled` | GET | F30 | `src/app/api/cron/campaign-scheduled/route.ts` |
| `/api/cron/chatbot` | GET | F21 | `src/app/api/cron/chatbot/route.ts` |
| `/api/cron/contact-identities` | GET | F33 | `src/app/api/cron/contact-identities/route.ts` |
| `/api/cron/contact-profiles` | GET | F07 | `src/app/api/cron/contact-profiles/route.ts` |
| `/api/cron/database-health` | GET | F35 | `src/app/api/cron/database-health/route.ts` |
| `/api/cron/editor-dispatch` | GET | F23 | `src/app/api/cron/editor-dispatch/route.ts` |
| `/api/cron/exports` | GET | F32 | `src/app/api/cron/exports/route.ts` |
| `/api/cron/follow-up-automations` | GET | F21 | `src/app/api/cron/follow-up-automations/route.ts` |
| `/api/cron/incentives` | GET | F26 | `src/app/api/cron/incentives/route.ts` |
| `/api/cron/inquiry-history` | GET | F33 | `src/app/api/cron/inquiry-history/route.ts` |
| `/api/cron/messaging-auto-tag` | GET | F22 | `src/app/api/cron/messaging-auto-tag/route.ts` |
| `/api/cron/meta-ads-sync` | GET | F13 | `src/app/api/cron/meta-ads-sync/route.ts` |
| `/api/cron/quotas` | GET | F27 | `src/app/api/cron/quotas/route.ts` |
| `/api/cron/sync` | GET | F33 | `src/app/api/cron/sync/route.ts` |
| `/api/cron/workspace` | GET | F35 | `src/app/api/cron/workspace/route.ts` |
| `/api/cron/workspace-events` | GET | F33 | `src/app/api/cron/workspace-events/route.ts` |
| `/api/exports/[exportId]/download` | GET | F32 | `src/app/api/exports/[exportId]/download/route.ts` |
| `/api/exports/[exportId]/process` | POST | F32 | `src/app/api/exports/[exportId]/process/route.ts` |
| `/api/exports/[exportId]/retry` | POST | F32 | `src/app/api/exports/[exportId]/retry/route.ts` |
| `/api/exports` | GET | F32 | `src/app/api/exports/route.ts` |
| `/api/facebook/authorize` | POST | F03 | `src/app/api/facebook/authorize/route.ts` |
| `/api/facebook/connect` | POST | F03 | `src/app/api/facebook/connect/route.ts` |
| `/api/facebook/messages/send` | POST | F20 | `src/app/api/facebook/messages/send/route.ts` |
| `/api/facebook/pages` | GET | F03 | `src/app/api/facebook/pages/route.ts` |
| `/api/facebook/partner-webhook` | GET, POST | F33 | `src/app/api/facebook/partner-webhook/route.ts` |
| `/api/facebook/templates` | GET, POST | F31 | `src/app/api/facebook/templates/route.ts` |
| `/api/facebook/templates/send` | POST | F31 | `src/app/api/facebook/templates/send/route.ts` |
| `/api/facebook/templates/status` | GET | F31 | `src/app/api/facebook/templates/status/route.ts` |
| `/api/facebook/templates/submit-all` | POST | F31 | `src/app/api/facebook/templates/submit-all/route.ts` |
| `/api/facebook/webhook` | GET, POST | F33 | `src/app/api/facebook/webhook/route.ts` |
| `/api/media/photo-header` | POST | F18 | `src/app/api/media/photo-header/route.ts` |
| `/api/pages/[pageId]/automations/[automationId]/reset` | POST | F21 | `src/app/api/pages/[pageId]/automations/[automationId]/reset/route.ts` |
| `/api/pages/[pageId]/automations/[automationId]` | DELETE, PATCH | F21 | `src/app/api/pages/[pageId]/automations/[automationId]/route.ts` |
| `/api/pages/[pageId]/automations` | GET, POST | F21 | `src/app/api/pages/[pageId]/automations/route.ts` |
| `/api/pages/[pageId]/chatbot/analytics` | GET | F17 | `src/app/api/pages/[pageId]/chatbot/analytics/route.ts` |
| `/api/pages/[pageId]/chatbot/folders` | DELETE, GET, POST | F18 | `src/app/api/pages/[pageId]/chatbot/folders/route.ts` |
| `/api/pages/[pageId]/chatbot/follow-ups` | GET | F21 | `src/app/api/pages/[pageId]/chatbot/follow-ups/route.ts` |
| `/api/pages/[pageId]/chatbot/interruptions` | GET | F20 | `src/app/api/pages/[pageId]/chatbot/interruptions/route.ts` |
| `/api/pages/[pageId]/chatbot/knowledge` | DELETE, GET, POST | F18 | `src/app/api/pages/[pageId]/chatbot/knowledge/route.ts` |
| `/api/pages/[pageId]/chatbot/media` | DELETE, GET, PATCH, POST | F18 | `src/app/api/pages/[pageId]/chatbot/media/route.ts` |
| `/api/pages/[pageId]/chatbot/pricing` | GET, PATCH, POST | F19 | `src/app/api/pages/[pageId]/chatbot/pricing/route.ts` |
| `/api/pages/[pageId]/chatbot` | GET, POST, PUT | F17 | `src/app/api/pages/[pageId]/chatbot/route.ts` |
| `/api/pages/[pageId]/chatbot/trial` | GET, POST | F17 | `src/app/api/pages/[pageId]/chatbot/trial/route.ts` |
| `/api/pages/[pageId]/contacts/[contactId]/bot` | PATCH | F20 | `src/app/api/pages/[pageId]/contacts/[contactId]/bot/route.ts` |
| `/api/pages/[pageId]/contacts/[contactId]/profile/finance` | POST | F08 | `src/app/api/pages/[pageId]/contacts/[contactId]/profile/finance/route.ts` |
| `/api/pages/[pageId]/contacts/[contactId]/profile/messages` | GET | F07 | `src/app/api/pages/[pageId]/contacts/[contactId]/profile/messages/route.ts` |
| `/api/pages/[pageId]/contacts/[contactId]/profile` | GET, POST | F06 | `src/app/api/pages/[pageId]/contacts/[contactId]/profile/route.ts` |
| `/api/pages/[pageId]/contacts/[contactId]/profile/sources` | GET | F09 | `src/app/api/pages/[pageId]/contacts/[contactId]/profile/sources/route.ts` |
| `/api/pages/[pageId]/contacts/[contactId]/projection` | GET, POST | F10 | `src/app/api/pages/[pageId]/contacts/[contactId]/projection/route.ts` |
| `/api/pages/[pageId]/contacts/best-time` | GET, POST | F21 | `src/app/api/pages/[pageId]/contacts/best-time/route.ts` |
| `/api/pages/[pageId]/contacts/bulk` | DELETE | F05 | `src/app/api/pages/[pageId]/contacts/bulk/route.ts` |
| `/api/pages/[pageId]/contacts/bulk-add-tags` | POST | F22 | `src/app/api/pages/[pageId]/contacts/bulk-add-tags/route.ts` |
| `/api/pages/[pageId]/contacts/bulk-remove-tags` | POST | F22 | `src/app/api/pages/[pageId]/contacts/bulk-remove-tags/route.ts` |
| `/api/pages/[pageId]/contacts` | GET | F05 | `src/app/api/pages/[pageId]/contacts/route.ts` |
| `/api/pages/[pageId]/contacts/tracked-bulk-message` | GET, POST | F30 | `src/app/api/pages/[pageId]/contacts/tracked-bulk-message/route.ts` |
| `/api/pages/[pageId]/conversations/export` | GET, POST | F32 | `src/app/api/pages/[pageId]/conversations/export/route.ts` |
| `/api/pages/[pageId]/exports` | POST | F32 | `src/app/api/pages/[pageId]/exports/route.ts` |
| `/api/pages/[pageId]/history` | GET | F32 | `src/app/api/pages/[pageId]/history/route.ts` |
| `/api/pages/[pageId]/human-agent-media` | POST | F20 | `src/app/api/pages/[pageId]/human-agent-media/route.ts` |
| `/api/pages/[pageId]/human-agent-send` | POST | F20 | `src/app/api/pages/[pageId]/human-agent-send/route.ts` |
| `/api/pages/[pageId]/pipeline` | GET, PATCH | F22 | `src/app/api/pages/[pageId]/pipeline/route.ts` |
| `/api/pages/[pageId]/sync` | POST | F33 | `src/app/api/pages/[pageId]/sync/route.ts` |
| `/api/pages/[pageId]/team` | GET | F02 | `src/app/api/pages/[pageId]/team/route.ts` |
| `/api/pages/[pageId]/webhook` | POST | F03 | `src/app/api/pages/[pageId]/webhook/route.ts` |
| `/api/pages/[pageId]/welcome` | GET, PUT | F31 | `src/app/api/pages/[pageId]/welcome/route.ts` |
| `/api/pages` | GET | F03 | `src/app/api/pages/route.ts` |
| `/api/sales-form` | GET, POST | F16 | `src/app/api/sales-form/route.ts` |
| `/api/settings/messaging-auto-tag` | GET, PUT | F22 | `src/app/api/settings/messaging-auto-tag/route.ts` |
| `/api/tags/bulk` | DELETE | F22 | `src/app/api/tags/bulk/route.ts` |
| `/api/tags` | DELETE, GET, POST, PUT | F22 | `src/app/api/tags/route.ts` |
| `/api/telegram/webhook` | POST | F29 | `src/app/api/telegram/webhook/route.ts` |
| `/api/test-db` | GET | F35 | `src/app/api/test-db/route.ts` |
| `/api/test-facebook-oauth` | GET | F35 | `src/app/api/test-facebook-oauth/route.ts` |
| `/api/test-logging` | GET | F35 | `src/app/api/test-logging/route.ts` |
| `/api/test-sync` | GET | F35 | `src/app/api/test-sync/route.ts` |
| `/api/workspace/account-access` | GET | F02 | `src/app/api/workspace/account-access/route.ts` |
| `/api/workspace/ads` | GET, POST | F13 | `src/app/api/workspace/ads/route.ts` |
| `/api/workspace/archive` | GET | F32 | `src/app/api/workspace/archive/route.ts` |
| `/api/workspace/autotag` | GET | F22 | `src/app/api/workspace/autotag/route.ts` |
| `/api/workspace/budget` | GET, POST | F14 | `src/app/api/workspace/budget/route.ts` |
| `/api/workspace/business-orders` | Review export binding | F25 | `src/app/api/workspace/business-orders/route.ts` |
| `/api/workspace/calendar` | GET | F12 | `src/app/api/workspace/calendar/route.ts` |
| `/api/workspace/contacts` | GET | F05 | `src/app/api/workspace/contacts/route.ts` |
| `/api/workspace/contacts/sync` | POST | F33 | `src/app/api/workspace/contacts/sync/route.ts` |
| `/api/workspace/context` | GET | F04 | `src/app/api/workspace/context/route.ts` |
| `/api/workspace/creatives` | GET | F15 | `src/app/api/workspace/creatives/route.ts` |
| `/api/workspace/deal-reviews` | GET, POST | F25 | `src/app/api/workspace/deal-reviews/route.ts` |
| `/api/workspace/deal-reviews/upload` | POST | F25 | `src/app/api/workspace/deal-reviews/upload/route.ts` |
| `/api/workspace/demographics` | Review export binding | F10 | `src/app/api/workspace/demographics/route.ts` |
| `/api/workspace/employee-profile` | GET | F28 | `src/app/api/workspace/employee-profile/route.ts` |
| `/api/workspace/handoff` | GET, POST | F29 | `src/app/api/workspace/handoff/route.ts` |
| `/api/workspace/incentives` | GET, POST | F26 | `src/app/api/workspace/incentives/route.ts` |
| `/api/workspace/jaucian` | GET | F29 | `src/app/api/workspace/jaucian/route.ts` |
| `/api/workspace/new-clients` | GET, POST | F23 | `src/app/api/workspace/new-clients/route.ts` |
| `/api/workspace/operations` | GET | F24 | `src/app/api/workspace/operations/route.ts` |
| `/api/workspace/pages` | GET | F03 | `src/app/api/workspace/pages/route.ts` |
| `/api/workspace/profile` | POST | F01 | `src/app/api/workspace/profile/route.ts` |
| `/api/workspace/profile/telegram-link` | GET, POST | F29 | `src/app/api/workspace/profile/telegram-link/route.ts` |
| `/api/workspace/profile-details` | Review export binding | F06 | `src/app/api/workspace/profile-details/route.ts` |
| `/api/workspace/quota-policy` | GET, POST | F27 | `src/app/api/workspace/quota-policy/route.ts` |
| `/api/workspace/receipts` | GET, POST | F25 | `src/app/api/workspace/receipts/route.ts` |
| `/api/workspace` | GET, POST | F04 | `src/app/api/workspace/route.ts` |
| `/api/workspace/source` | GET, POST | F09 | `src/app/api/workspace/source/route.ts` |
| `/api/workspace/storage-health` | GET | F35 | `src/app/api/workspace/storage-health/route.ts` |
| `/api/workspace/telegram-groups` | GET, POST | F29 | `src/app/api/workspace/telegram-groups/route.ts` |
| `/api/workspace/warnings` | GET | F28 | `src/app/api/workspace/warnings/route.ts` |

## Pages

| Page | Primary feature |
| --- | --- |
| `/dashboard/7-day-contacts` | F05 |
| `/dashboard/ad-calendar` | F11 |
| `/dashboard/ad-quality` | F13 |
| `/dashboard/automations` | F21 |
| `/dashboard/campaigns` | F30 |
| `/dashboard/chatbot` | F17 |
| `/dashboard/connect` | F03 |
| `/dashboard/contacts/[contactId]` | F06 |
| `/dashboard/contacts` | F05 |
| `/dashboard/exports` | F32 |
| `/dashboard/history` | F32 |
| `/dashboard` | F04 |
| `/dashboard/pipeline` | F22 |
| `/dashboard/pricing` | F19 |
| `/dashboard/settings` | F35 |
| `/dashboard/tags` | F22 |
| `/dashboard/templates` | F31 |
| `/dashboard/welcome` | F31 |
| `/dashboard/workspace` | F04 |
| `/` | F01 |
| `/sales-form` | F16 |
| `/vintage` | F01 |

## UI components

| Component | Primary feature |
| --- | --- |
| `AdCreativePreview.tsx` | F15 |
| `ChatbotSalesSettings.tsx` | F16 |
| `ContactBotProjection.tsx` | F10 |
| `ContactSources.tsx` | F09 |
| `ConversionPerformance.tsx` | F13 |
| `FacebookConnectButton.tsx` | F03 |
| `LeadQualityBadge.tsx` | F10 |
| `Modal.tsx` | F34 |
| `Pagination.tsx` | F34 |
| `Providers.tsx` | F34 |
| `Toast.tsx` | F34 |
| `VeoAccountAccess.tsx` | F02 |
| `VeoAccountLoginSetup.tsx` | F01 |
| `VeoAdPerformanceChart.tsx` | F13 |
| `VeoAdsConnection.tsx` | F13 |
| `VeoAutoTagStatus.tsx` | F22 |
| `VeoBusinessOrderPicker.tsx` | F25 |
| `VeoCapacitySummary.tsx` | F27 |
| `VeoClientDrawer.tsx` | F06 |
| `VeoContactAutoFill.tsx` | F06 |
| `VeoContactDemographics.tsx` | F10 |
| `VeoContactDetails.tsx` | F08 |
| `VeoContactIdentitySync.tsx` | F33 |
| `VeoContactTags.tsx` | F22 |
| `VeoCreativePerformance.tsx` | F15 |
| `VeoDashboardBreadcrumb.tsx` | F34 |
| `VeoDashboardNavigation.tsx` | F34 |
| `VeoDealEvidenceInbox.tsx` | F25 |
| `VeoDealIncentive.tsx` | F26 |
| `VeoDeferredSection.tsx` | F34 |
| `VeoEmployeeProfile.tsx` | F28 |
| `VeoJaucianIntegration.tsx` | F29 |
| `VeoMemberSupervisors.tsx` | F02 |
| `VeoNewClients.tsx` | F23 |
| `VeoOperationsPanel.tsx` | F24 |
| `VeoPageBudget.tsx` | F14 |
| `VeoPageConnections.tsx` | F03 |
| `VeoPageState.tsx` | F34 |
| `VeoQuotaPolicy.tsx` | F27 |
| `VeoReceiptInbox.tsx` | F25 |
| `VeoReceiptSaleDetails.tsx` | F25 |
| `VeoSalaryStatement.tsx` | F26 |
| `VeoSignIn.tsx` | F01 |
| `VeoStaffOffboarding.tsx` | F02 |
| `VeoStaffPerformance.tsx` | F28 |
| `VeoStaffWarnings.tsx` | F28 |
| `VeoStorageHealth.tsx` | F35 |
| `VeoSupervisorGroups.tsx` | F02 |
| `VeoTeamsDashboard.tsx` | F04 |
| `VeoTelegramGroups.tsx` | F29 |
| `VeoTelegramLink.tsx` | F29 |
| `VeoTelegramProfile.tsx` | F01 |
| `VeoTelegramReminder.tsx` | F29 |
| `VeoWorkCalendar.tsx` | F12 |
| `VeoWorkforceReadiness.tsx` | F27 |
| `VeoWorkspaceContacts.tsx` | F05 |

## Python bot routes

These are explicit app-router paths. Delegated resource/action branches and mode-specific behavior still require functional tests.

| Bot route | Methods | Feature | Current workspace mode |
| --- | --- | --- | --- |
| `/api/clients` | GET | F23 | Handler/mode verification required |
| `/api/cron/dispatch` | GET | F29 | Handler/mode verification required |
| `/api/freebies/status` | GET | F19 | Handler/mode verification required |
| `/api/groups` | GET | F29 | Handler/mode verification required |
| `/api/health` | GET | F35 | Handler/mode verification required |
| `/api/messages` | GET | F07 | Handler/mode verification required |
| `/api/new-clients/status` | GET | F23 | Handler/mode verification required |
| `/api/new-clients/suno-supply` | GET | F23 | Blocked with 410; replacement required |
| `/api/referrals/audit` | GET | F26 | Handler/mode verification required |
| `/api/referrals/status` | GET | F26 | Handler/mode verification required |
| `/api/reports/concerns` | GET | F28 | Handler/mode verification required |
| `/api/reports/daily-summary` | GET | F26 | Handler/mode verification required |
| `/api/reports/members` | GET | F28 | Blocked with 410; replacement required |
| `/api/reports/plan` | GET | F27 | Blocked with 410; replacement required |
| `/api/reports/replace` | POST | F28 | Blocked with 410; replacement required |
| `/api/reports/surveys` | POST | F27 | Handler/mode verification required |
| `/api/reports/topics` | GET | F29 | Handler/mode verification required |
| `/api/reports/warnings` | GET | F28 | Handler/mode verification required |
| `/api/reports/workload` | GET, POST | F27 | Handler/mode verification required |
| `/api/scheduler` | GET, POST | F35 | Handler/mode verification required |
| `/api/schedules` | GET, POST, DELETE | F35 | Handler/mode verification required |
| `/api/status` | GET | F35 | Handler/mode verification required |
| `/api/suno/makata` | GET, POST | F29 | Blocked with 410; replacement required |
| `/api/veo/handoff` | POST | F25 | Handler/mode verification required |
| `/api/veo/workspace` | Delegated handler | F29 | Handler/mode verification required |
| `/api/webhook` | POST | F29 | Handler/mode verification required |
| `/api/workers/activity` | GET | F28 | Handler/mode verification required |
| `/api/workers/capacity` | GET | F27 | Blocked with 410; replacement required |

## Crosscutting review

The master plan separately covers shared libraries, indirect RPCs/tables, workspace subviews/actions, Python Telegram routes, SQL jobs/triggers, feature flags, historical data and external schedules. Diagnostic endpoints and the vintage page are classified for explicit retention/restriction decisions; this register does not make them business features or approve exposing them.

Regenerate after any upstream changes. An unknown API/page/component name fails this generator rather than disappearing into an unnamed catch-all category.
