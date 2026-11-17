# Suno System

Suno's copy of the current Veo workspace and its Jaucian Telegram service. The workspace includes clients, Facebook Pages, accounts and teams, assignments, receipt review, calendars, budgets, capacity, reporting and the Messenger chatbot. Telegram belongs to **[@dannysunobot](https://t.me/dannysunobot)**.

This checkout is separate from the existing Sunobot and Veo applications. It contains source and regression tests, not their databases, Telegram archives, deployment identities or production logs.

## Run locally

```powershell
cd "C:\Users\Cj Lara\Downloads\sunobot\suno-system"
npm ci
npm run dev
```

Open <http://localhost:3100>. Local credentials are in the ignored `.env.local`; the Telegram token is only in `jaucian/.env.local`. Never register the workspace's media bridge with this token: Jaucian must own its update stream.

To review the Veo-style interface during setup, use **Preview workspace UI** on the setup page, or open `/ui-preview`. It is available in development and on deployments with `SUNO_DEPLOYMENT_STAGE=setup`; it returns 404 on active production deployments. The preview shares the dashboard shell and team components with the authenticated workspace, uses clearly labelled fictional records, and keeps navigation inside the preview. Client search and team filtering work locally. Other sections show their layout and setup status. The preview does not unlock sign-in or call workspace APIs and asks search engines not to index it.

With the setup deployment running, `node scripts/verify-workspace-preview.mjs --base=http://127.0.0.1:3100` checks the served preview and anonymous API/worker restrictions. Use `--expect-hidden` when checking an active production deployment instead. Both modes make only anonymous GET requests.

These checks do **not** verify live feature or data parity. The current Owner preview has three sample views and 27 placeholder destinations. The original Veo page/API files exist in the authenticated workspace, but its database and tenant integration remain incomplete. See the [November 17 UI/data audit](docs/suno-ui-data-parity-audit-2026-11-17.md) for the verified gaps. Reproduce the source comparison with `py verification/audit_suno_veo_ui.py --veo-root "<original Veo app checkout>"`.

```powershell
npm run typecheck
npm test
npm run build
py jaucian/validate_project.py
node scripts/check-suno-setup.mjs
node scripts/check-suno-setup.mjs --telegram --database
```

The last command makes read-only checks. It never registers a webhook, consumes updates or sends a message.

## Activation

The [Suno compatibility master plan](docs/suno-compatibility-master-plan.md) is the reviewed baseline. [Implementation status](docs/suno-implementation-status.md) records the song compatibility merge, full profiles, exports, cron ownership, Telegram song-work bridge, upgrade rehearsal and remaining live requirements. Both calendars and every classified route remain in scope.

See [Suno setup](docs/suno-setup.md). The workspace is deliberately not launched against the existing Suno database. Launch archives old operational workflows and changes account/Page access; it needs an intentional production cutover. Existing Suno records must be inspected and backed up first.

The copied 35%/40% commission and Closed Deal/Done Deal quota rules are **Veo defaults**, not confirmed Suno pay rules. Configure and verify Suno's actual earnings rules before enabling financial reports.

The maintained upstream `veo_*` table/RPC names, migration versions, API routes and environment flags are retained for compatibility between the two copied services. They operate on Suno's separate database and use Suno's owner/Page allowlist. The original Suno project is `cxgynadprukyeuqbchbs`; both Veo database projects are rejected by the Suno connection guard.

Source commits and the copy inventory are recorded in [duplication-provenance.json](docs/duplication-provenance.json). Older Veo documents retained under `docs/` describe the source system; their deployment/test claims do not establish a Suno deployment.

See [verification notes](docs/suno-verification.md) for the current checks and live acceptance gaps, and the [second audit](docs/suno-double-check-2026-11-15.md) for the additional corrections.
