"""Read the manager's named report topics from archived Telegram topic events."""
from __future__ import annotations

import urllib.parse
import os
import datetime as dt

from cloud_store import request
from daily_automation import DAILY_REPORTS_CHAT_ID

# Verified from live topic-created events in DAILY REPORTS, 2026-10-21 UTC.
TEAM_THREADS = {
    -1003962888977: 191, -1004461399292: 193, -1003647732254: 195,
    -1004423057797: 197, -1004364797420: 199, -1004435878080: 201,
    -1004498344479: 203, -1002894511895: 205,
}


def enabled() -> bool:
    return os.environ.get("ORGANIZED_REPORTS_ENABLED", "false").strip().lower() == "true"


def delivery_allowed(action: dict) -> bool:
    """Retire old combined public formats; private Makata reports keep running."""
    if not enabled() or int(action["chat_id"]) != DAILY_REPORTS_CHAT_ID:
        return True
    key = action.get("dedupe_key") or ""
    if key.startswith("organized-daily:"):
        from organized_reports import VERSION
        if int((action.get("payload") or {}).get("organized_report_version", 1)) != VERSION:
            action["repeat_interval_minutes"] = None
            return False
        p = action.get("payload") or {}
        if p.get("capacity_member_ids") and not p.get("nightly_report_policy"):
            from member_presence import records, confirmed
            cached = records(int(p["report_source_chat_id"]))
            if any(cached.get(int(uid), {}).get("is_bot") is True or
                   not confirmed(cached.get(int(uid), {}), dt.datetime.now(dt.timezone.utc))
                   for uid in p["capacity_member_ids"]):
                return False
    legacy = key.startswith(("daily-member-capacity:", "daily-suno-capacity:", "tomorrow-veo-capacity:",
        "daily-concerns:", "concerns-started:", "daily-report:", "historical-report:",
        "trabawho-daily-report:", "makata-daily-report:", "team-planning-formula:"))
    if legacy:
        action["repeat_interval_minutes"] = None
    return not legacy


def defer_burst(action: dict, now: dt.datetime) -> bool | None:
    """Keep a large manager-report batch below Telegram's group burst limit."""
    if not enabled() or int(action["chat_id"]) != DAILY_REPORTS_CHAT_ID:
        return None
    recent = request("scheduled_actions?" + urllib.parse.urlencode({
        "select": "id", "chat_id": f"eq.{DAILY_REPORTS_CHAT_ID}",
        "sent_at": f"gte.{(now - dt.timedelta(seconds=60)).isoformat()}",
        "telegram_message_id": "gt.0", "limit": 12,
    })) or []
    if len(recent) < 12:
        return None
    from cloud_store import _update_claim
    return _update_claim(action, {"status": "pending", "updated_at": now.isoformat(),
        "scheduled_for": (now + dt.timedelta(seconds=90)).isoformat(),
        "attempts": int((action.get("payload") or {}).get("_delivery_failures", 0))})


def topics() -> list[dict]:
    rows = request("scheduled_actions?" + urllib.parse.urlencode({
        "select": "payload,updated_at", "chat_id": f"eq.{DAILY_REPORTS_CHAT_ID}",
        "dedupe_key": f"like.concerns-topic:{DAILY_REPORTS_CHAT_ID}:*", "limit": 1000,
    })) or []
    return sorted(({"thread_id": int(row["payload"]["thread_id"]),
                    "name": row["payload"]["name"], "updated_at": row.get("updated_at")}
                   for row in rows), key=lambda topic: topic["thread_id"])


def suno_topics(allowed: set[int]) -> list[dict]:
    """Read configured team routes and observed names, without touching Telegram."""
    from suno_profile import topic_routes, workspace_groups
    groups = {chat: config for chat, config in workspace_groups().items() if chat in allowed}
    if not groups:
        return []
    rows = request("scheduled_actions?" + urllib.parse.urlencode({
        "select": "chat_id,payload,updated_at", "chat_id": "in.(" + ",".join(map(str, sorted(groups))) + ")",
        "dedupe_key": "like.concerns-topic:*", "order": "updated_at.desc", "limit": 1000,
    })) or []
    names = {}
    for row in rows:
        payload = row.get("payload") or {}
        thread, name = payload.get("thread_id"), payload.get("name")
        chat = row.get("chat_id")
        if chat in groups and isinstance(thread, int) and not isinstance(thread, bool) and thread > 0 and isinstance(name, str) and name.strip():
            names.setdefault((chat, thread), (name[:128], row.get("updated_at")))
    inventory = []
    for chat, config in groups.items():
        routes = topic_routes(config)
        for thread in sorted(set(routes.values())):
            name, observed = names.get((chat, thread), (None, None))
            inventory.append({"chat_id": chat, "group": config["name"], "thread_id": thread,
                "roles": [role for role, value in routes.items() if value == thread],
                "name": name, "name_observed_at": observed, "configured": True,
                "url": f"https://t.me/c/{str(abs(chat))[3:]}/{thread}"})
    return inventory
