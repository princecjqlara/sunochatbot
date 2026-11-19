# Suno application boundary

This checkout is the maintained Suno app: repository `princecjqlara/sunochatbot`, production branch `codex/suno-complete-workspace`, Vercel project `sunochatbot` (`prj_fEYB4LrOg8ieH4N3mfQnDjU7cyeM`), https://sunochatbot.vercel.app. Its database is `cxgynadprukyeuqbchbs`. TOKKOdev and the setup-only `suno-system` project are separate applications.

- Preserve `src/legacy-runtime` and verify it with `node scripts/verify-retained-chatbot.mjs`. Do not replace the Suno chatbot with the Veo engine.
- Suno uses direct Sales. Staff shares are 20% of verified song payments, 50% of tips and 20% of revision fees. Do not expose Veo Closed/Done targets, 35%/40% salary, or quota-based incentives as Suno policy.
- Keep existing customers, identities, settings, holds, queues, provider acknowledgments and Telegram ownership. No invented business records or manual worker dispatch for verification.
- SQL changes require a reviewed rollback preflight and a private restorable backup. Apply only the new migration, never the historical baseline.
- Keep credentials, raw customer data and backups in ignored `.private`/`.vercel` files. Run the full release regression gate and production build before promotion.
- Python service instructions are in `jaucian/AGENTS.md`.
