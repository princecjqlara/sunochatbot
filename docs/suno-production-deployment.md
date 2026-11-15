# Separate Suno production deployment

The web project is `suno-system` in the existing Vercel team. Its source is the audited Suno branch of `princecjqlara/sunochatbot`; publishing this project does not replace the existing `sunochatbot` project. Vercel runs the complete release regression gate before the Next.js production build.

## Publication and activation

The initial production environment uses `SUNO_DEPLOYMENT_STAGE=setup`. The home page explains that account migration and bot connection are unfinished. Auth session/provider/CSRF bootstrap remains available. Other application APIs, webhook ingestion and credential sign-in return `SUNO_SETUP_PENDING` before reaching the database. Every cron still requires its secret; authenticated schedules skip work with `reason=suno_setup_pending`.

The project uses its own auth and cron secrets and Suno-specific mode, Page scope, history, profile and forecast settings. Private CRM/provider credentials and the bot token are not uploaded with source. The bot token belongs only to its separate Python service. Publication in setup mode is not proof that every feature has passed acceptance with live Suno data.

Do not change the stage to active as a standalone step. First complete the compatible CRM upgrade and restorable backup, retained-owner account recovery, verified Meta app/Page ownership, Suno earnings adapter, dedicated bot archive/service, approved group/topic routes, legacy job handover and profile/calendar reconciliation. Keep the seventeen app workers, dedicated bot dispatcher and existing maintenance jobs under one approved ownership plan.

## Feature coverage and remaining adaptation

The maintained register covers 125 API routes, 22 pages, 56 principal components, both calendars, contact profiles/history, song intake, quotations, teams, assignments, receipt review, reporting, campaigns, exports and 17 cron routes. The seven-field customer form, twenty-field saved song profile and existing 26% assignment threshold are retained. File coverage is complete for the compared Veo source; functional compatibility remains subject to the acceptance checks in the master plan.

Open items include Suno's actual pay/unit rules, approved Telegram destinations, historical token/pre-order/freebie/referral/Makata reconciliation, Page runtime ownership and live role/profile/calendar checks. Six legacy bot paths remain explicitly mode-blocked until their approved replacements/data handover are complete. Do not describe these as completed by renaming or publishing the app.

## Dedicated bot infrastructure

A separate **Suno System** Supabase organization (`reugnuqfscoibbcgayfg`) now contains the dedicated **suno-jaucian-archive** project (`wbafvhaqsloutheeomob`) in Singapore. The retained Suno CRM remains `cxgynadprukyeuqbchbs`; no CRM schema or rows were changed. The archive was created without selecting paid options. Its five tables have row-level security, all eight current archive RPCs are installed, anonymous table/RPC access is denied, and service-role poll withdrawal is explicitly permitted. A live transaction checked ingestion/discovery, edits, history, queue deduplication and claims, finalization and poll answers, then rolled back every synthetic record. It did not invoke delivery.

The separate Python project is **dannysunobot**, with intended origin `https://dannysunobot.vercel.app`. Only that service receives the supplied bot token and dedicated archive server credentials. Its build retains `uv run --frozen python validate_project.py`, including the deployment-boundary regressions. It runs in Singapore alongside the archive. The web app remains `https://suno-system.vercel.app`.

The Python service also uses `SUNO_DEPLOYMENT_STAGE=setup`. An absent or invalid stage keeps Suno paused; activation requires the explicit value `active`. Authenticated archive status/groups/messages remain readable. Webhook ingestion, CRM handoffs, worker dispatch and scheduling writes stop before side effects. Its public health returns HTTP 503 with `suno_setup_pending`; that is an intentional report of incomplete operational readiness. Status exposes the paused stage. Bot deployment is not Telegram webhook registration.

The copied bot dispatcher previously accepted unauthenticated requests. It now requires `CRON_SECRET` or `INSIGHTS_API_KEY` in the handler, and both the database and external schedulers attach authentication. Vercel supplies the dedicated cron secret for its scheduled calls. No database dispatch/watchdog jobs were installed, no group was approved, and no Telegram message was sent. After verified routing and compatible CRM handover, configure the single bot scheduler with `remote_windows.ps1 configure-scheduler --verify-recovery`, inspect `scheduler-status` and `/api/health`, then observe normal scheduled delivery. Do not manually dispatch.

Deployment URLs and measured results are saved in the local `verification/` reports. Secrets remain in provider configuration or ignored local settings.
