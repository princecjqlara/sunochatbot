import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({session:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/get-session',()=>({getSessionFromRequest:mocks.session}));
vi.mock('@/lib/supabase',()=>({getSupabaseAdmin:()=>({rpc:mocks.rpc})}));
vi.mock('@/lib/veo-report-read',()=>({readVeoRpc:(_db:any,name:string,args:any)=>mocks.rpc(name,args)}));
import {GET,POST} from './route';
const id='00000000-0000-4000-8000-000000000001',base='https://suno.example/api/workspace/song-work';
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({user:{id}});mocks.rpc.mockResolvedValue({data:{items:[],total:0},error:null});});
it('requires sign-in and same-origin work updates',async()=>{
 mocks.session.mockResolvedValue(null);expect((await GET(new NextRequest(base))).status).toBe(401);
 expect((await POST(new NextRequest(base,{method:'POST',headers:{origin:'https://foreign.example'}}))).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();
});
it('passes only signed identity and valid report filters',async()=>{
 expect((await GET(new NextRequest(base+'?status=paid'))).status).toBe(400);
 const r=await GET(new NextRequest(base+'?sale_id='+id+'&status=revision&actor=another'));expect(r.status).toBe(200);
 expect(mocks.rpc).toHaveBeenCalledWith('suno_song_work_report',{p_actor:id,p_page:null,p_sale:id,p_status:'revision',p_offset:0});expect(r.headers.get('cache-control')).toContain('no-store');
});
it('binds work source to the web server and ignores client financial fields',async()=>{
 const r=await POST(new NextRequest(base,{method:'POST',headers:{origin:'https://suno.example','Content-Type':'application/json'},body:JSON.stringify({request_id:id,sale_id:id,status:'sent',expected_version:1,reason:' Sent to client ',amount:500,rate:100,source:'telegram'})}));
 expect(r.status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith('suno_song_work_action',{p_actor:id,p_source:'web',p_data:{request_id:id,sale_id:id,status:'sent',expected_version:1,reason:'Sent to client'}});
});
it('rejects updates without an exact work version and reason',async()=>{
 const r=await POST(new NextRequest(base,{method:'POST',headers:{origin:'https://suno.example','Content-Type':'application/json'},body:JSON.stringify({request_id:id,sale_id:id,status:'sent',reason:'No version'})}));expect(r.status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([['42501',403],['40001',409],['23505',409],['22023',400],['PGRST202',503]])('returns safe work error %s',async(code,status)=>{
 mocks.rpc.mockResolvedValue({error:{code,message:code==='PGRST202'?'Private schema diagnostic':'Work changed or access denied'}});
 const r=await GET(new NextRequest(base));expect(r.status).toBe(status);if(status===503)expect(JSON.stringify(await r.json())).not.toContain('Private schema');
});
