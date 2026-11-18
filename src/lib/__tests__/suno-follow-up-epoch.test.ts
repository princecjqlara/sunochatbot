import {expect,it,vi} from 'vitest';
import {scheduleChatbotFollowUps} from '@/lib/chatbot-follow-ups';
it('carries the Suno reset epoch into scheduled follow-ups and does not apply a video form gate',async()=>{
    const writes:any[]=[];
    const state={status:'active',human_pause_status:'released',automation_epoch:7,collected_details:{Genre:'Jazz'}};
    const chain:any={select:()=>chain,eq:()=>chain,update:()=>chain,lt:()=>chain,in:async()=>({error:null}),maybeSingle:async()=>({data:state,error:null}),upsert:async(rows:any)=>{writes.push(...rows);return {error:null};}};
    const config:any={page_id:'page',instructions:'SONG_BRIEF_FORM: hiraya-seven-fields',commercial_video_intake_enabled:true,details_to_collect:['Lyrics language','Vocal preference'],follow_up_enabled:true,
        follow_up_quick_delays_minutes:[10],follow_up_best_time_days:[],policy_revision:3};
    await scheduleChatbotFollowUps({supabase:{from:()=>chain},pageId:'page',contact:{id:'contact',page_id:'page',psid:'person'},config,anchorInboundAt:'2026-11-14T00:00:00Z',now:new Date('2026-11-14T00:00:00Z')});
    expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({automation_epoch:7,policy_revision:3,purpose:'scheduled'});
    state.human_pause_status='paused';writes.length=0;
    expect(await scheduleChatbotFollowUps({supabase:{from:()=>chain},pageId:'page',contact:{id:'contact',page_id:'page',psid:'person'},config,anchorInboundAt:'2026-11-14T00:00:00Z'})).toBe(0);
});
