# Separate Suno production deployment

The web project is `suno-system` in the existing Vercel team. Its source is the audited Suno branch of `princecjqlara/sunochatbot`; publishing this project does not replace the existing `sunochatbot` project. Vercel runs the complete release regression gate before the Next.js production build.

## Publication and activation

The initial production environment uses `SUNO_DEPLOYMENT_STAGE=setup`. The home page explains that account migration and bot connection are unfinished. Auth session/provider/CSRF bootstrap remains available. Other application APIs, webhook ingestion and credential sign-in return `SUNO_SETUP_PENDING` before reaching the database. Every cron still requires its secret; authenticated schedules skip work with `reason=suno_setup_pending`.

The project uses its own auth and cron secrets and Suno-specific mode, Page scope, history, profile and forecast settings. Private CRM/provider credentials and the bot token are not uploaded with source. The bot token belongs only to its separate Python service. Publication in setup mode is not proof that every feature has passed acceptance with live Suno data.

Do not change the stage to active as a standalone step. First complete the compatible CRM upgrade and restorable backup, retained-owner account recovery, verified Meta app/Page ownership, Suno earnings adapter, dedicated bot archive/service, approved group/topic routes, legacy job handover and profile/calendar reconciliation. Keep the seventeen app workers, dedicated bot dispatcher and existing maintenance jobs under one approved ownership plan.

## Feature coverage and remaining adaptation

The maintained register covers 125 API routes, 22 pages, 56 principal components, both calendars, contact profiles/history, song intake, quotations, teams, assignments, receipt review, reporting, campaigns, exports and 17 cron routes. The seven-field customer form, twenty-field saved song profile and existing 26% assignment threshold are retained. File coverage is complete for the compared Veo source; functional compatibility remains subject to the acceptance checks in the master plan.

Open items include Suno's actual pay/unit rules, the dedicated archive, approved Telegram destinations, historical token/pre-order/freebie/referral/Makata reconciliation, Page runtime ownership and live role/profile/calendar checks. Six legacy bot paths remain explicitly mode-blocked until their approved replacements/data handover are complete. Do not describe these as completed by renaming or publishing the app.

The currently authenticated Supabase management session lists the Veo organization and cannot see the retained Suno CRM project. Select a verified Suno-owned archive target or connect the correct management account before creating or provisioning the archive. The existing Suno CRM remains the verified `cxgynadprukyeuqbchbs` project; the archive must be separate.

Deployment URLs and measured results are saved in the local `verification/` reports. Secrets remain in provider configuration or ignored local settings.
