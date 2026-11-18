# Sunochatbot

The Veo management workspace integrated into the existing [Sunochatbot](https://sunochatbot.vercel.app) application. This repository deploys to the **sunochatbot** Vercel project and the existing Suno CRM database.

The workspace provides accounts and teams, Page access, contacts and profiles, intake and editor queues, calendars and capacity, receipt and deal review, orders and payments, earnings and incentives, budgets and ad reports, Telegram integration, staff controls, audit history and storage management. See [release details and operational prerequisites](docs/sunochatbot-complete-workspace.md).

The original Suno chatbot is retained under `src/legacy-runtime`. Its settings screen, replies, knowledge, media, follow-ups and delivery logic are preserved. Workspace RPC upgrades use separate function names, and the replacement Veo reply engine remains disabled. `verification/retained-chatbot-source.json` records source provenance; the release gate verifies every retained file before running tests.

The database upgrade retains existing business records and installs all 1,502 fields in the audited current Veo reference. It does not import Veo business records or invent Suno staff, transactions or Telegram history. Existing Owner identity and all 13 saved Page grants are preserved. Twelve Page tokens passed provider ownership verification; one requires reauthorization.

New financial activity requires the Owner to confirm the displayed earnings rules. Danny is active for Trabawho? and Suno makata; client assignment still requires verified staff and group-to-Page configuration. These operational prerequisites are distinct from source and schema installation.

## Development

```powershell
npm ci
npm run dev
```

Provide local configuration through an ignored `.env.local`; `.env.example` documents the keys. Never commit credentials. The production site is `https://sunochatbot.vercel.app`; the earlier `suno-system` setup deployment is not the production destination.

## Verification

```powershell
npm run test:release
npm run typecheck
npm run build
```

The release gate includes the retained Suno tests and workspace SQL/API/UI regressions. Production source is exported from a committed Git revision and built on Vercel before manual promotion. Live database and configuration verification reports are in `verification`; private encrypted backup material and deployment credentials are excluded from Git.
