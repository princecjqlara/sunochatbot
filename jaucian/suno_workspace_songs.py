"""Work declarations use the CRM assignment; only the scheduled outbox replies."""
from __future__ import annotations
import datetime as dt
import json
import os
import re
import urllib.request
import urllib.error
import uuid
from cloud_store import enqueue_scheduled_action
from suno_profile import enabled, workspace_origin


def song_action(action: dict) -> bool:
    payload = action.get('payload') or {}
    return enabled() and bool(payload.get('suno_song_request_id') and payload.get('veo_tenant_id'))


def call(action: str, user: int, chat: int, data: dict) -> dict:
    from veo_intake import open_request
    tenant = os.environ['VEO_WORKSPACE_TENANT_ID']
    uuid.UUID(tenant)
    raw = json.dumps({'resource':'song_work','tenant_id':tenant,'telegram_user_id':user,'chat_id':chat,'action':action,'data':data}).encode()
    request = urllib.request.Request(workspace_origin()+'/api/workspace/handoff', data=raw,
        headers={'Authorization':'Bearer '+os.environ['VEO_JAUCIAN_SECRET'],'Content-Type':'application/json'},method='POST')
    try:
        with open_request(request) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        if error.code in {400,403,409}:
            from veo_intake import IntakeScopeChanged
            raise IntakeScopeChanged('Song assignment changed or controls expired') from error
        raise
    if result.get('ok') is not True or result.get('tenant_id') != tenant or result.get('chat_id') != chat or result.get('telegram_user_id') != user:
        raise ValueError('Song work identity changed')
    if result['request_id'] != data['request_id']:
        raise ValueError('Song work request changed')
    return result


def handle(update: dict, allowed: set[int], now: dt.datetime) -> bool:
    if not enabled() or os.environ.get('VEO_WORKSPACE_ENABLED','').lower() != 'true':
        return False
    message = update.get('message') or {}
    text = str(message.get('text') or '').strip()
    match = re.fullmatch(r'SONG (SENT|REVISION) ([a-fA-F0-9-]{36})',text,re.I)
    action = 'list' if text.split('@',1)[0].lower() == '/songs' else match.group(1).lower() if match else None
    if action is None:
        return False
    user, chat = message.get('from') or {}, (message.get('chat') or {}).get('id')
    if chat not in allowed or user.get('is_bot') is not False or not isinstance(user.get('id'),int) or isinstance(user['id'],bool) or user['id']<=0 or message.get('forward_origin') or message.get('forward_from') or message.get('forward_date'):
        return False
    if not isinstance(message.get('date'),int) or abs(now.timestamp()-message['date'])>600:
        return False
    if not isinstance(update.get('update_id'),int) or isinstance(update['update_id'],bool) or update['update_id']<0:
        raise ValueError('A Telegram update reference is required')
    from veo_directory import verify_identity
    verify_identity(chat,user['id'])
    tenant = os.environ['VEO_WORKSPACE_TENANT_ID']
    request_id = str(uuid.uuid5(uuid.NAMESPACE_URL,f'suno-song:{tenant}:{chat}:{update["update_id"]}'))
    data = {'request_id':request_id}
    if match:
        data['order_id']=str(uuid.UUID(match.group(2)))
    result = call(action,user['id'],chat,data)
    enqueue_scheduled_action(chat_id=chat,action_type='message',scheduled_for=now,
        dedupe_key=f'suno-song:{tenant}:{request_id}',payload={'suno_song_request_id':result['request_id'],
            'veo_tenant_id':tenant,'suno_song_user_id':user['id'],'text':'Suno work confirmation; current access checked at delivery'})
    return True


def send(action: dict) -> dict:
    from veo_directory import verify_identity, teams
    from telegram_sender import telegram_call
    p,chat=action['payload'],int(action['chat_id'])
    if not song_action(action) or p['veo_tenant_id'] != os.environ.get('VEO_WORKSPACE_TENANT_ID') or chat not in teams():
        from veo_intake import IntakeScopeChanged
        raise IntakeScopeChanged('Song destination changed')
    user=int(p['suno_song_user_id'])
    verify_identity(chat,user)
    current=call('render',user,chat,{'request_id':p['suno_song_request_id']})
    if len(str(current.get('text') or '').encode('utf-16-le'))//2>3500:
        raise ValueError('Song work reply is too long')
    payload={'chat_id':chat,'text':current['text']}
    if current.get('thread_id'):
        payload['message_thread_id']=int(current['thread_id'])
    return telegram_call('sendMessage',payload)
