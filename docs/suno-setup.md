# Suno setup and cutover

The [second audit](suno-double-check-2026-11-15.md) records the latest corrections and dependency findings. Use Node 22 and `npm ci` with the supplied lockfile. The new copy owns its installed dependencies; no shared Veo dependency directory belongs in a deployment.

Current implementation and incomplete live requirements are in [suno-implementation-status.md](suno-implementation-status.md). The incremental rehearsal now succeeds against captured Suno schema metadata and produces review SQL. The inherited version-only release installer is disabled for applied cutover; the example apply/launch commands below describe the eventual cutover boundary and currently reject execution. A financial-confirmation flag alone does not complete the missing earnings adapter, archive or deployment setup.

## Prepared configuration

- Suno Supabase project: `cxgynadprukyeuqbchbs`.
- Retained Suno owner: `1e56fd95-56af-4aca-b50f-89a48c083249` (Cj Lara).
- The requested head-admin credentials were configured on this retained identity on November 17 PHT. Its thirteen Page grants and Facebook identity are preserved. Workspace Owner membership and dashboard login remain pending the compatible tenant/database cutover; no password is stored in this repository.
- Page allowlist: the 13 Pages read from Suno's existing database on preparation. `src/config/veo-pages.json` contains their Facebook identities; no Veo Page is approved.
- Telegram service: `@dannysunobot`, bot ID `9210209211`. The token is server-only in the ignored Jaucian environment.
- App and bot have a newly generated shared handoff secret. It is different from Veo's secret.
- Local app origin: `http://localhost:3100`. Separate production origins are `https://suno-system.vercel.app` and `https://dannysunobot.vercel.app`.
- Workspace, legacy automatic sends, Telegram delivery destinations and scheduled jobs are not activated by copying these files.

## Decisions before launch

1. Confirm Suno's pay/earnings policy. The copied Veo ledger currently uses 35%/40%, personal Closed Deal and Done Deal targets, and verified receipt milestones. Suno's earlier receipt-written earnings and song delivery counts are different measures.
2. The separate app and bot production URLs are configured above. Keep the existing working Sunobot available until the replacement is verified.
3. The user explicitly approved Danny sending in **Trabawho?** (`-1002894511895`) and **Suno makata** (`-1004498344479`) on November 17 PHT. Danny's administrator and topic-management permissions were verified. Both IDs are recorded in `ALLOWED_CHAT_IDS` and `VEO_APPROVED_TELEGRAM_CHAT_IDS`; automation remains paused while the compatible handover is incomplete.
4. Confirm which Suno Pages feed each approved group and verify the current topic inventory. The profile preserves archived topic IDs, including Makata Active 132 and Songs 133. The old Veo DAILY REPORTS destination is not inherited.

## Database preparation

The workspace uses the existing Suno CRM project. Read the latest schema first; do not assume the older Suno schema has every prerequisite from the newer Veo application. Use `node scripts/suno-release.mjs --preflight` for the isolated, incremental rehearsal. The inherited `release-veo-workspace.mjs` now rejects every mode except read-only inspection; a financial-confirmation flag cannot bypass the disabled version-only installer.

The initial read-only preflight found that `contact_verified_payments` is absent. This comes from `202611020004_contact_profiles.sql`, before the workspace migrations. `node scripts/plan-suno-migrations.mjs` inventories the current schema and existing migration records without writing to the database, saving a full report under `verification/`. The source release helper also predates later workspace migrations; reconcile the complete inventory and duplicate migration versions before applying any upgrade. A successful source build does not resolve this schema gap.

An offline full-schema plan can be regenerated with `node scripts/provision-veobot-database.mjs --plan --target-project=cxgynadprukyeuqbchbs`. This writes review SQL and a manifest under the ignored `.vercel/database-migration/` directory and does not connect to the database. The complete schema passes the isolated PGlite installation regression. Review its business-setting updates against Suno's existing per-Page music instructions before any live preflight or application.

Jaucian must use its **own empty archive database project**. Configure its `SUPABASE_URL`, service key and DB URL there, and install `jaucian/supabase/schema.sql` plus its later migrations. Do not point it at the CRM or at Veo's existing archive: the archive's generic `messages`, `chats` and scheduler objects belong to that bot instance. Its startup guard rejects Suno's CRM project and known Veo CRM projects. A dedicated archive also gives the new bot its own scheduler, checkpoints and outbox.

Take a database backup before any applied migration or launch. Keep historical contacts, verified payments, Page connections and owner identity. Run the full migration/financial/access regression suites and verify the final Suno earnings rules in a disposable database before production.

## Deployment and connection

Before enabling any automated Page, configure the enforced Meta runtime policy and verify its token against the intended Suno Meta app. Register only verified Page ownership; source allowlist entries do not populate `pages.automation_app_id`. Run the read-only setup check and require a configured ownership scope containing every Page intended for the pilot. Do not turn off `VEO_ENFORCE_PAGE_RUNTIME_SCOPE` to bypass a missing policy. Preserve other apps' Page settings and queued work for the approved handover.

Both copied services preserve their existing Next.js and Python/Vercel runtime configuration. They are not static exports. Set production app secrets in the deployment platform; never upload `.env.local`, reuse the Veo project link or expose the service-role/handoff keys in browser variables.

Configure the app's `VEO_JAUCIAN_URL` with the new bot service URL, and the bot's `VEO_WORKSPACE_URL` with the new app URL. Use the same new `VEO_JAUCIAN_SECRET`, then set the saved Suno tenant/launch values in the bot. The compatibility names do not authorize any Veo destination.

The launch command is intentionally guarded:

```powershell
node scripts/suno-release.mjs --inspect
node scripts/suno-release.mjs --preflight
# Only after the preflight, backups, policy review and cutover approval:
node scripts/suno-release.mjs --apply
node scripts/suno-release.mjs --launch --acknowledge-archive
```

Launch changes existing operational access and archives old campaigns, exports and automation. It is not a reversible cosmetic rename. The wrapper requires `SUNO_FINANCIAL_POLICY_CONFIRMED=true` for apply/launch, and explicit archive acknowledgment for launch.

Register exactly one authenticated Telegram webhook for the new bot once its public deployment and archive exist. Do not use `getUpdates`, manual dispatcher calls or test posts to verify it. Validate Jaucian with `py validate_project.py`, verify scheduler recovery and `/api/health`, then inspect normal scheduled delivery. The new scheduler names and dispatch URL are isolated from Veo.

## Remaining verification

`node scripts/check-suno-setup.mjs --telegram --database` reports current bot identity/webhook state, CRM read access, missing workspace schema, and missing bot archive settings. It prints configuration status, never credentials. Passing source tests or a build does not mean a webhook, database migration or production cutover has happened.
