# Suno Jaucian

The duplicated manager service for `@dannysunobot`. It shares the upstream workspace protocol with the Suno web application; `veo_*` wire keys and `/api/veo/workspace` are retained compatibility names.

Use the ignored `.env.local` for this bot's token and newly generated webhook/API/handoff secrets. Set a **dedicated archive project's** database credentials before activation. No Veo archive, Telegram message history, scheduler state or allowed destination was copied.

```powershell
py validate_project.py
py run_local.py
```

The local service listens on `127.0.0.1:3101`. It loads its local environment and exposes the same WSGI API as production. Starting it does not poll Telegram, set a webhook or start a dispatcher. Authenticated maintenance and cron endpoints remain available for intentional service operation.

Suno's existing Trabawho/Makata destinations are candidates in `suno_profile.py`. Their IDs do not approve them for this new bot: `ALLOWED_CHAT_IDS` and `AUTOMATION_CHAT_IDS` are initially empty. Map real groups/topics and verify this bot's membership before enabling them. The Veo DAILY REPORTS recipient is not inherited.

See [the app's setup guide](../docs/suno-setup.md) for database preparation, earnings-policy review and production connection. `UPSTREAM-README.md` describes the original service and is reference material, not a record of this bot's deployment.
