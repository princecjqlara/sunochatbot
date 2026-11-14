"""Suno destinations for the duplicated workspace protocol.

The allowlist stays empty until this bot's membership is verified. Keeping the
upstream protocol does not approve or inherit any Veo group or report recipient.
"""
from __future__ import annotations

import os
import urllib.parse

SUNO_CRM_PROJECT = "cxgynadprukyeuqbchbs"
BLOCKED_ARCHIVE_PROJECTS = {SUNO_CRM_PROJECT, "vhtbmdizugnxkgocmruq", "mjuluaqrvbnycisnarzi", "pnhzpeyzpwsmwcuafgpw"}


def enabled() -> bool:
    return os.environ.get("SUNO_SYSTEM_ENABLED", "").strip().lower() == "true"


def workspace_groups() -> dict[int, dict]:
    return {
        -1002894511895: {"name": "Suno Trabawho", "general": 1, "announcements": 16,
                        "active": 7581, "contact_thread": 7673, "done": 4, "close": 4,
                        "receipts": 4, "songs": 7692, "crm_pages": {}, "pages": {}},
        -1004498344479: {"name": "Suno Makata", "general": 1, "announcements": 4,
                        "contact_thread": 13, "done": 8, "close": 8,
                        "receipts": 8, "crm_pages": {}, "pages": {}},
    }


def validate_archive(url: str) -> None:
    if not enabled():
        return
    parsed = urllib.parse.urlsplit(url)
    project = (parsed.hostname or "").removesuffix(".supabase.co")
    if parsed.scheme != "https" or parsed.username or parsed.password or not parsed.hostname or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise RuntimeError("A secure dedicated Suno bot archive URL is required")
    if project in BLOCKED_ARCHIVE_PROJECTS:
        raise RuntimeError("Suno Jaucian requires its own archive project; CRM and Veo projects are not bot archives")


def dispatch_url() -> str:
    value = os.environ.get("SUNO_JAUCIAN_URL", "").rstrip("/")
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
        raise RuntimeError("Set SUNO_JAUCIAN_URL to this Suno bot deployment's HTTPS origin")
    if parsed.hostname == "jaucianassitant.vercel.app":
        raise RuntimeError("The Suno scheduler cannot target the Veo bot deployment")
    return value + "/api/cron/dispatch"


def workspace_origin() -> str:
    value = os.environ.get("VEO_WORKSPACE_URL", "" if enabled() else "https://veochatbot.vercel.app").rstrip("/")
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
        raise ValueError("Configure this Suno workspace's HTTPS origin")
    if enabled() and parsed.hostname.lower() == "veochatbot.vercel.app":
        raise ValueError("Suno cannot link workers to the Veo workspace")
    return value


def valid_workspace_link(value: str) -> bool:
    origin = urllib.parse.urlsplit(workspace_origin())
    link = urllib.parse.urlsplit(value)
    return (link.scheme, link.netloc.lower()) == (origin.scheme, origin.netloc.lower()) and not link.username and not link.password and link.path.startswith("/dashboard/") and not link.fragment
