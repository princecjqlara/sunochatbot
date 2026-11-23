import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({session:vi.fn(),scope:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/get-session',()=>({getSessionFromRequest:m.session}));
vi.mock('@/lib/supabase',()=>({getSupabaseAdmin:()=>({rpc:m.rpc})}));
vi.mock('@/lib/veo-workspace',async original=>({...await original<any>(),workspaceScope:m.scope}));
vi.mock('@/lib/veo-report-read',()=>({readVeoRpc:(_db:any,name:string,args:any)=>m.rpc(name,args)}));
import {GET,POST} from './route';
const id='00000000-0000-4000-8000-000000000001',page='00000000-0000-4000-8000-000000000020',base='https://suno.example/api/workspace/reports';
const data={version:1,staff:[],pages:[],money:[],coverage:{},capacity:{},period:{},backlog:{}};
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-24T08:00:00Z'));vi.clearAllMocks();m.session.mockResolvedValue({user:{id}});m.scope.mockResolvedValue({tenant_id:id,role:'owner',page_ids:[page],worker_ids:[id],launch_at:'2026-11-01T00:00:00Z'});m.rpc.mockResolvedValue({data,error:null});});
afterEach(()=>vi.useRealTimers());
it('requires session, live workspace and valid dates before querying reports',async()=>{
 m.session.mockResolvedValueOnce(null);expect((await GET(new NextRequest(base))).status).toBe(401);
 m.scope.mockResolvedValueOnce(null);expect((await GET(new NextRequest(base))).status).toBe(403);
 for(const q of ['from=2026-02-30','from=2026-10-01','to=2026-11-25','date=2026-11-26','page_id='+id])expect((await GET(new NextRequest(base+'?'+q))).status).toBeGreaterThanOrEqual(400);
 expect(m.rpc).not.toHaveBeenCalled();
});
it('uses signed scope, bounded dates and no-store responses',async()=>{
 const r=await GET(new NextRequest(base+'?from=2026-11-20&to=2026-11-24&page_id='+page+'&actor=foreign'));
 expect(r.status).toBe(200);expect(m.rpc).toHaveBeenCalledWith('suno_operations_report',{p_actor:id,p_from:'2026-11-20',p_to:'2026-11-24',p_page:page,p_day:'2026-11-24'});expect(r.headers.get('cache-control')).toContain('no-store');
});
it('rejects incomplete or unavailable reports without presenting empty success',async()=>{
 m.rpc.mockResolvedValueOnce({data:{version:1,staff:[]}});expect((await GET(new NextRequest(base))).status).toBe(503);
 m.rpc.mockResolvedValueOnce({error:{code:'PGRST202',message:'private database detail'}});const r=await GET(new NextRequest(base));expect(r.status).toBe(503);expect(JSON.stringify(await r.json())).not.toContain('private database detail');
});
it('guards planning writes and excludes client-supplied financial rules',async()=>{
 expect((await POST(new NextRequest(base,{method:'POST',headers:{origin:'https://foreign.example'}}))).status).toBe(403);
 const body={action:'capacity',page_id:page,worker_id:id,work_date:'2026-11-24',capacity:5,quota:4,availability:'available',reason:'Agreed staffing',expected_version:0,commission:99};
 const req=()=>new NextRequest(base,{method:'POST',headers:{origin:'https://suno.example','Content-Type':'application/json'},body:JSON.stringify(body)});
 expect((await POST(req())).status).toBe(200);expect(m.rpc.mock.calls.at(-1)?.[1].p_data).not.toHaveProperty('commission');
 m.scope.mockResolvedValueOnce({role:'member',launch_at:'2026-11-01'});expect((await POST(req())).status).toBe(403);
 body.quota=6;expect((await POST(req())).status).toBe(400);
});
it('returns a conflict for stale planning versions and supports explicit zero budgets',async()=>{
 const req=()=>new NextRequest(base,{method:'POST',headers:{origin:'https://suno.example','Content-Type':'application/json'},body:JSON.stringify({action:'budget',page_id:page,work_date:'2026-11-24',currency:'PHP',amount:'0',reason:'No ads planned',expected_version:0})});
 m.rpc.mockResolvedValueOnce({error:{code:'40001',message:'Budget changed. Refresh before saving.'}});expect((await POST(req())).status).toBe(409);
 expect(m.rpc.mock.calls.at(-1)?.[1].p_data.planned_minor).toBe(0);
});
