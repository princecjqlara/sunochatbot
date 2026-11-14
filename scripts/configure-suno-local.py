"""Initialize ignored Suno environments; accept the bot token on stdin only."""
from pathlib import Path
import json
import secrets
import sys

root = Path(__file__).resolve().parent.parent
app_file, bot_file = root / ".env.local", root / "jaucian/.env.local"
if app_file.exists() or bot_file.exists():
    raise SystemExit("Local environments already exist; refusing to overwrite credentials")
data = json.load(sys.stdin)
token = data.get("bot_token", "")
if not token.startswith("9210209211:") or any(c.isspace() for c in token):
    raise SystemExit("Expected the supplied Suno bot token")
source = root.parent / "tokko-chatbot/.env.local"
existing = {}
for line in source.read_text(encoding="utf-8-sig").splitlines():
    if line and not line.startswith("#") and "=" in line:
        key, value = line.split("=", 1)
        existing[key] = value
keys = ["FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET", "FACEBOOK_APP_SECRET",
        "FACEBOOK_WEBHOOK_VERIFY_TOKEN", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL", "DATABASE_POOLER_URL_5432", "DATABASE_POOLER_URL_6543",
        "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "OPENROUTER_EMBEDDING_MODEL", "CHATBOT_RAG_MATCH_THRESHOLD"]
handoff = secrets.token_urlsafe(48)
app = {key: existing[key] for key in keys if key in existing}
app.update(NEXTAUTH_URL="http://localhost:3100", PUBLIC_APP_URL="http://localhost:3100",
           NEXTAUTH_SECRET=secrets.token_urlsafe(48), CRON_SECRET=secrets.token_urlsafe(48),
           FACEBOOK_WEBHOOK_URL="http://localhost:3100/api/facebook/webhook", TELEGRAM_BOT_TOKEN="",
           TELEGRAM_MEDIA_ROUTES="{}", VEO_WORKSPACE_ENABLED="false", VEO_PAGE_SCOPE_ENFORCED="true",
           VEO_ENFORCE_PAGE_RUNTIME_SCOPE="true", VEO_DATABASE_PROJECT_REF="cxgynadprukyeuqbchbs",
           VEO_OWNER_USER_ID="1e56fd95-56af-4aca-b50f-89a48c083249", VEO_JAUCIAN_URL="",
           VEO_JAUCIAN_SECRET=handoff, VEO_APPROVED_TELEGRAM_CHAT_IDS="", SUNO_FINANCIAL_POLICY_CONFIRMED="false")
bot = {"SUNO_SYSTEM_ENABLED": "true", "TELEGRAM_BOT_TOKEN": token,
       "TELEGRAM_WEBHOOK_SECRET": secrets.token_urlsafe(48), "INSIGHTS_API_KEY": secrets.token_urlsafe(48),
       "SUPABASE_URL": "", "SUPABASE_SERVICE_ROLE_KEY": "", "SUPABASE_DB_URL": "", "ARCHIVE_TRANSPORT": "http",
       "ALLOWED_CHAT_IDS": "", "AUTOMATION_CHAT_IDS": "", "SUNO_REPORTS_CHAT_ID": "", "SUNO_JAUCIAN_URL": "",
       "VEO_WORKSPACE_ENABLED": "true", "VEO_NEW_CLIENTS_ONLY": "true", "VEO_APPROVED_DEALS_ENABLED": "false",
       "VEO_AVAILABILITY_ENABLED": "false", "VEO_WORKSPACE_URL": "", "VEO_WORKSPACE_TENANT_ID": "",
       "VEO_WORKSPACE_LAUNCH_AT": "", "VEO_JAUCIAN_SECRET": handoff, "VEO_NEW_CLIENTS_ENABLED": "false",
       "SUNO_ASSIGNMENTS_ENABLED": "false", "SUNO_MAKATA_ENABLED": "false", "NEW_CLIENT_READY_ENABLED": "false"}
for destination, values in [(app_file, app), (bot_file, bot)]:
    with destination.open("x", encoding="utf-8", newline="\n") as output:
        output.write("# Local Suno configuration. Do not commit or print this file.\n")
        output.write("\n".join(f"{key}={value}" for key, value in values.items()) + "\n")
print("Initialized separate ignored app and bot environments; secret values are not displayed.")
