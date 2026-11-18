"""Telegram controls for the authoritative Tokko assignment queue.

No separate Telegram client owner is stored. Commands and bound buttons call
Tokko; only the existing scheduled outbox publishes group messages.
"""
from __future__ import annotations
import datetime as dt
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
from cloud_store import enqueue_scheduled_action, request
from daily_automation import GROUPS
from suno_profile import valid_workspace_link, enabled as suno_system_enabled, workspace_origin


class IntakeScopeChanged(ValueError):
    scope_changed = True


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("Tokko assignment redirects are not allowed")


def open_request(req, *, timeout: float = 20):
    return urllib.request.build_opener(NoRedirect()).open(req, timeout=timeout)


def enabled() -> bool:
    return os.environ.get("VEO_WORKSPACE_ENABLED", "").lower() == "true" and os.environ.get("VEO_TELEGRAM_INTAKE_ENABLED", "").lower() == "true"


def call(action: str, *, user: int = 0, chat: int = 0, data: dict | None = None, timeout: float = 20) -> dict:
    tenant, base, secret = (os.environ.get(k, "") for k in ("VEO_WORKSPACE_TENANT_ID", "VEO_WORKSPACE_URL", "VEO_JAUCIAN_SECRET"))
    if suno_system_enabled():
        base = workspace_origin()
    uuid.UUID(tenant)
    parsed = urllib.parse.urlsplit(base)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or not secret:
        raise RuntimeError("Secure Tokko assignment connection is not configured")
    raw = json.dumps({"resource": "intake", "tenant_id": tenant, "action": action, "telegram_user_id": user, "chat_id": chat, "data": data or {}}).encode()
    req = urllib.request.Request(base.rstrip("/") + "/api/workspace/handoff", data=raw,
        headers={"Authorization": "Bearer " + secret, "Content-Type": "application/json"}, method="POST")
    try:
        with open_request(req, timeout=timeout) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        if error.code in {400, 403, 409}:
            try:
                message = json.loads(error.read(4096)).get("error", "Refresh the assignment menu in Tokko")
            except (ValueError, TypeError):
                message = "Refresh the assignment menu in Tokko"
            raise IntakeScopeChanged(str(message)[:200]) from error
        raise RuntimeError("Tokko assignments are temporarily unavailable") from error
    except (OSError, ValueError, TypeError) as error:
        raise RuntimeError("Tokko assignments are temporarily unavailable") from error
    if result.get("ok") is not True or result.get("tenant_id") != tenant:
        raise RuntimeError("Tokko assignment tenant did not match")
    return result


def handle(update: dict, allowed: set[int], now: dt.datetime) -> str | None:
    if not enabled():
        return None
    callback = update.get("callback_query") or {}
    message = callback.get("message") or update.get("message") or {}
    user = callback.get("from") or message.get("from") or {}
    chat = (message.get("chat") or {}).get("id")
    if chat not in allowed.intersection(GROUPS) or not isinstance(user.get("id"), int) or isinstance(user["id"], bool) or user["id"] <= 0 or user.get("is_bot") is not False:
        return None
    from automation_controls import new_clients_enabled
    if not new_clients_enabled(chat):
        return None
    action, data = None, {}
    if callback:
        value = str(callback.get("data") or "")
        if re.fullmatch(r"vi:[a-f0-9-]{36}", value):
            uuid.UUID(value[3:]);action, data = "callback", {"token_id": value[3:]}
        elif value in {"cw:ready", "cw:busy"}:
            action = value.split(":")[1]
        elif value.startswith("cw:"):
            return "Use /clients for current Tokko assignment buttons. This older button cannot change a client."
        else:
            return None
    else:
        if message.get("forward_origin") or message.get("forward_from") or message.get("forward_date"):
            return None
        if not isinstance(message.get("date"), int) or abs(now.timestamp() - message["date"]) > 600:
            return None
        text = str(message.get("text") or "").strip().lower()
        matched = re.fullmatch(r"/(ready|busy|clients|offers|myclients|reassign|handover)(?:\s*@([a-z0-9_]+))?", text)
        if matched and matched[2] and suno_system_enabled() and matched[2] != "dannysunobot":
            return None
        command = "/" + matched[1] if matched else text
        action = {"/ready": "ready", "ready": "ready", "/busy": "busy", "busy": "busy", "/clients": "pool", "/offers": "offers", "/myclients": "assigned", "/reassign": "reassign", "/handover": "reassign"}.get(command)
        if action is None:
            return None
    update_id = update.get("update_id")
    if not isinstance(update_id, int) or isinstance(update_id, bool) or update_id < 0:
        raise ValueError("A Telegram update ID is required")
    tenant = os.environ["VEO_WORKSPACE_TENANT_ID"]
    request_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"veo-intake:{tenant}:{chat}:{update_id}"))
    data["request_id"] = request_id
    from veo_directory import verify_identity
    try:
        verify_identity(chat, user["id"])
        result = call(action, user=user["id"], chat=chat, data=data)
    except (IntakeScopeChanged, ValueError) as error:
        if not callback:
            enqueue_scheduled_action(chat_id=chat, action_type="message", scheduled_for=now,
                dedupe_key=f"veo-intake-help:{tenant}:{request_id}", payload={"veo_intake_help": True, "veo_tenant_id": tenant,
                    "veo_intake_user_id": user["id"], "expires_at": (now + dt.timedelta(minutes=15)).isoformat(),
                    "text": "Let us get you set up. Link Telegram in your " + ("Suno" if suno_system_enabled() else "VEO") + " profile, then ask your team leader or manager to connect your group and Pages. A manager is optional if you already have a team leader. When that is ready, use /clients to see available clients."})
        return str(error)[:200]
    if int(result.get("chat_id") or 0) != chat or int(result.get("telegram_user_id") or 0) != user["id"]:
        raise RuntimeError("Assignment response identity did not match")
    try:
        uuid.UUID(result["request_id"])
    except (KeyError, ValueError, TypeError) as error:
        raise RuntimeError("Assignment response reference did not match") from error
    enqueue_scheduled_action(chat_id=chat, action_type="message", scheduled_for=now,
        dedupe_key=f"veo-intake-reply:{tenant}:{result['request_id']}", payload={"veo_intake_request_id": result["request_id"],
            "veo_intake_user_id": user["id"], "veo_tenant_id": tenant, "text": "Tokko assignment controls; current access checked at delivery"})
    fallback = "Saved in " + ("Suno" if suno_system_enabled() else "Tokko") + ". Your refreshed controls will appear here shortly."
    return str(result.get("feedback") or fallback)[:200]


def queue(now: dt.datetime, allowed: set[int]) -> int:
    if not enabled():
        return 0
    from automation_controls import new_clients_enabled
    tenant = os.environ["VEO_WORKSPACE_TENANT_ID"]
    retire_expired_replies(now, allowed)
    pending = call("pending")
    offers = [o for o in pending.get("offers", []) if int(o["chat_id"]) in allowed.intersection(GROUPS) and new_clients_enabled(int(o["chat_id"]))]
    notices = [n for n in pending.get("notices", []) if int(n["chat_id"]) in allowed.intersection(GROUPS) and new_clients_enabled(int(n["chat_id"]))]
    if not offers and not notices:
        return 0
    keys = [f"veo-intake-offer:{tenant}:{o['offer_id']}:{o['chat_id']}" for o in offers]
    keys += [f"veo-intake-notice:{tenant}:{n['notice_id']}:{n['chat_id']}" for n in notices]
    existing = request("scheduled_actions?" + urllib.parse.urlencode({"select": "dedupe_key", "dedupe_key": "in.(" + ",".join(keys) + ")", "limit": 100})) or []
    known, queued = {r["dedupe_key"] for r in existing}, 0
    for offer, key in zip(offers, keys):
        if key in known:
            continue
        uuid.UUID(offer["offer_id"])
        queued += int(enqueue_scheduled_action(chat_id=int(offer["chat_id"]), action_type="message", scheduled_for=now, dedupe_key=key,
            payload={"veo_intake_offer_id": offer["offer_id"], "veo_intake_user_id": int(offer["telegram_user_id"]), "veo_tenant_id": tenant,
                     "text": "Tokko client offer; current access and expiry checked at delivery"}))
        if queued >= 10:
            return queued
    for notice in notices:
        key = f"veo-intake-notice:{tenant}:{notice['notice_id']}:{notice['chat_id']}"
        if key in known:
            continue
        uuid.UUID(notice["notice_id"])
        queued += int(enqueue_scheduled_action(chat_id=int(notice["chat_id"]), action_type="message", scheduled_for=now, dedupe_key=key,
            payload={"veo_intake_notice_id": notice["notice_id"], "veo_tenant_id": tenant, "text": "New VEO inquiry; current group and Page scope checked at delivery"}))
        if queued >= 10:
            return queued
    return queued


def retire_expired_replies(now: dt.datetime, allowed: set[int]) -> int:
    """Retire exhausted menu replies only after VEO confirms lost scope/expiry.

    Actual offers, sent messages and uncertain sends are never repaired here.
    The normal dispatcher owns this bounded cleanup; no Telegram call is made.
    """
    chats = allowed.intersection(GROUPS)
    if not chats:
        return 0
    tenant = os.environ["VEO_WORKSPACE_TENANT_ID"]
    rows = request("scheduled_actions?" + urllib.parse.urlencode({
        "select": "id,chat_id,payload,updated_at", "status": "eq.failed", "attempts": "gte.5",
        "chat_id": "in.(" + ",".join(map(str, sorted(chats))) + ")",
        "dedupe_key": f"like.veo-intake-reply:{tenant}:*",
        "scheduled_for": "lt." + (now - dt.timedelta(minutes=30)).isoformat(),
        "order": "scheduled_for.asc,id.asc", "limit": 5,
    })) or []
    retired = 0
    for row in rows:
        payload = row.get("payload") or {}
        if (payload.get("veo_tenant_id") != tenant or not payload.get("veo_intake_request_id")
                or not payload.get("veo_intake_user_id") or not row.get("updated_at")
                or any(payload.get(key) for key in ("_veo_message_id", "_veo_sending", "veo_delivery_unknown",
                    "veo_intake_offer_id", "veo_intake_notice_id", "veo_submission_id", "veo_availability_date"))):
            continue
        try:
            call("render", user=int(payload["veo_intake_user_id"]), chat=int(row["chat_id"]),
                 data={"request_id": payload["veo_intake_request_id"]}, timeout=5)
        except IntakeScopeChanged:
            changed = request("scheduled_actions?" + urllib.parse.urlencode({
                "id": "eq." + str(row["id"]), "status": "eq.failed", "updated_at": "eq." + row["updated_at"], "select": "id",
            }), {"status": "cancelled", "last_error": "Client menu expired or its access changed; use /clients for fresh controls",
                 "repeat_interval_minutes": None}, method="PATCH", prefer="return=representation")
            retired += len(changed or [])
        except RuntimeError:
            # Preserve failed state during an outage and avoid repeated probes.
            break
    return retired


def acknowledge_delivery(action: dict, message_id: int) -> None:
    payload = action["payload"]
    if payload.get("veo_intake_notice_id"):
        result = call("ack_notice", chat=int(action["chat_id"]), data={"notice_id": payload["veo_intake_notice_id"], "message_id": message_id})
    elif payload.get("veo_intake_offer_id"):
        result = call("ack_offer", chat=int(action["chat_id"]), data={"offer_id": payload["veo_intake_offer_id"], "message_id": message_id, **({"sent_at": payload["_veo_sent_at"]} if payload.get("_veo_sent_at") else {})})
    else:
        return
    if result.get("acknowledged") is not True:
        raise RuntimeError("Tokko did not confirm the client notification checkpoint")


def check_health() -> None:
    if not enabled():
        return
    # These RPCs are read-only. An empty local outbox does not establish that
    # the authoritative service can still return new offers.
    # VEO bounds this request at 12 seconds. Allow its full deadline plus
    # transport time, including a cold start, before reporting it unavailable.
    current = call("pending", timeout=15)
    if not isinstance(current.get("offers"), list) or not isinstance(current.get("notices"), list):
        raise RuntimeError("Tokko client notification state is unavailable")


def validate_reply(current: dict, *, announcement: bool = False) -> None:
    if len(str(current.get("text") or "").encode("utf-16-le")) // 2 > 3500:
        raise ValueError("Assignment reply is too long")
    for row in (current.get("reply_markup") or {}).get("inline_keyboard", []):
        for item in row:
            callback = item.get("callback_data")
            if callback is not None and not re.fullmatch(r"vi:[a-f0-9-]{36}", callback) and not (announcement and callback in {"cw:ready", "cw:busy"}):
                raise ValueError("Unbound assignment button")
            if "url" in item and not valid_workspace_link(item["url"]):
                raise ValueError("Invalid Tokko link")


def send(action: dict) -> dict:
    if not enabled():
        raise IntakeScopeChanged("Telegram assignment controls are disabled")
    from veo_directory import verify_identity, teams
    from telegram_sender import telegram_call
    from automation_controls import new_clients_enabled
    payload, chat = action["payload"], int(action["chat_id"])
    if payload.get("veo_tenant_id") != os.environ.get("VEO_WORKSPACE_TENANT_ID") or chat not in teams() or not new_clients_enabled(chat):
        raise IntakeScopeChanged("Assignment destination changed")
    if payload.get("veo_intake_notice_id"):
        current = call("render_notice", chat=chat, data={"notice_id": payload["veo_intake_notice_id"]})
        if int(current.get("chat_id") or 0) != chat:
            raise IntakeScopeChanged("Fresh inquiry group changed")
        validate_reply(current, announcement=True)
        return telegram_call("sendMessage", {"chat_id": chat, "message_thread_id": current.get("thread_id") or GROUPS[chat].get("contact_thread") or GROUPS[chat].get("announcements"), "text": current["text"], "reply_markup": current.get("reply_markup") or {}})
    user = int(payload["veo_intake_user_id"])
    try:
        verify_identity(chat, user)
    except ValueError as error:
        raise IntakeScopeChanged("Worker no longer belongs to this group") from error
    if payload.get("veo_intake_help"):
        if dt.datetime.fromisoformat(payload["expires_at"].replace("Z", "+00:00")) <= dt.datetime.now(dt.timezone.utc):
            raise IntakeScopeChanged("Setup help expired")
        return telegram_call("sendMessage", {"chat_id": chat, "message_thread_id": GROUPS[chat].get("contact_thread") or GROUPS[chat].get("announcements"), "text": payload["text"]})
    kind = "render_offer" if payload.get("veo_intake_offer_id") else "render"
    data = {"offer_id": payload["veo_intake_offer_id"]} if kind == "render_offer" else {"request_id": payload["veo_intake_request_id"]}
    current = call(kind, user=user, chat=chat, data=data)
    if int(current.get("chat_id") or 0) != chat or int(current.get("telegram_user_id") or 0) != user:
        raise IntakeScopeChanged("Assignment identity or destination changed")
    markup = current.get("reply_markup") or {}
    if len(str(current.get("text") or "").encode("utf-16-le")) // 2 > 3500:
        raise ValueError("Assignment reply is too long")
    for row in markup.get("inline_keyboard", []):
        for item in row:
            if "callback_data" in item and not re.fullmatch(r"vi:[a-f0-9-]{36}", item["callback_data"]):
                raise ValueError("Unbound assignment button")
            if "url" in item and not valid_workspace_link(item["url"]):
                raise ValueError("Invalid Tokko link")
    outgoing = {"chat_id": chat, "text": current["text"], "reply_markup": markup}
    thread = current.get("thread_id") or GROUPS[chat].get("contact_thread") or GROUPS[chat].get("announcements")
    if thread:
        outgoing["message_thread_id"] = int(thread)
    return telegram_call("sendMessage", outgoing)
