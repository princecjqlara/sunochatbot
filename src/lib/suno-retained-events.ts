import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from './supabase';
import { messengerTimestamp } from './messenger-timestamp';

export function retainedEventObservations(payload: any) {
    const events: {facebook_page_id:string;event_key:string;occurred_at:string;kind:string;payload:unknown}[]=[];
    if(payload?.object!=='page'||!Array.isArray(payload.entry)) return events;
    for(const entry of payload.entry) {
        if(typeof entry?.id!=='string')continue;
        for(const kind of ['messaging','standby','changes']) for(const event of Array.isArray(entry[kind])?entry[kind]:[]) {
            const at=messengerTimestamp(event?.timestamp??entry.time);
            if(at==null)continue;
            const identity=event?.message?.mid||createHash('sha256').update(JSON.stringify(event)).digest('hex');
            const rawKey=`${entry.id}:${kind}:${identity}`;
            const eventKey=rawKey.length<=200?rawKey:`${entry.id}:${kind}:${createHash('sha256').update(rawKey).digest('hex')}`;
            events.push({facebook_page_id:entry.id,event_key:eventKey,occurred_at:new Date(at).toISOString(),kind,payload:{object:'page',entry:[{id:entry.id,time:entry.time,[kind]:[event]}]}});
        }
    }
    return events;
}

/** Called only after the original signed webhook handler returns successfully. */
export async function captureRetainedEvents(payload: unknown) {
    const events=retainedEventObservations(payload);
    if(!events.length)return;
    for(let offset=0;offset<events.length;offset+=100) {
        const result=await getSupabaseAdmin().rpc('suno_capture_retained_events',{p_events:events.slice(offset,offset+100)});
        if(result.error)throw Error('Retained event observation must be retried');
    }
}
