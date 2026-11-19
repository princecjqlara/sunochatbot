import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({session:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/get-session',()=>({getSessionFromRequest:mocks.session}));
vi.mock('@/lib/supabase',()=>({getSupabaseAdmin:()=>({rpc:mocks.rpc})}));
vi.mock('@/lib/veo-report-read',()=>({readVeoRpc:(_db:any,name:string,args:any)=>mocks.rpc(name,args)}));
import {GET,POST} from './route';
const id='00000000-0000-4000-8000-000000000001',base='https://suno.example/api/workspace/sales';
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({user:{id}});mocks.rpc.mockResolvedValue({data:{sales:[],totals:[]},error:null});});
it('requires sign-in and same-origin financial writes',async()=>{
 mocks.session.mockResolvedValue(null);expect((await GET(new NextRequest(base))).status).toBe(401);
 expect((await POST(new NextRequest(base,{method:'POST',headers:{origin:'https://foreign.example'}}))).status).toBe(403);
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it('validates date ranges and forwards only the signed actor and permitted filters',async()=>{
 expect((await GET(new NextRequest(base+'?from=2026-02-30&to=2026-03-01'))).status).toBe(400);
 const r=await GET(new NextRequest(base+'?from=2026-11-01&to=2026-11-20&page_id='+id+'&actor=other'));
 expect(r.status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith('suno_sales_report',{p_actor:id,p_from:'2026-11-01',p_to:'2026-11-20',p_page:id,p_contact:null,p_offset:0});expect(r.headers.get('cache-control')).toContain('no-store');
});
it('normalizes money and excludes user-supplied commission policy',async()=>{
 const r=await POST(new NextRequest(base,{method:'POST',headers:{origin:'https://suno.example','Content-Type':'application/json'},body:JSON.stringify({action:'payment',request_id:id,sale_id:id,kind:'tip',amount:'100',reference:'BANK-123',occurred_at:'2026-11-19T00:00:00Z',confirmed:true,rate_percent:100})}));
 expect(r.status).toBe(200);const args=mocks.rpc.mock.calls[0][1];expect(args.p_actor).toBe(id);expect(args.p_data).toMatchObject({kind:'tip',amount_minor:10000,charge_id:null});expect(args.p_data).not.toHaveProperty('rate_percent');
});
it.each([['42501',403],['23505',409],['22023',400],['PGRST202',503]])('reports %s without exposing unrelated database details',async(code,status)=>{
 mocks.rpc.mockResolvedValue({error:{code,message:code==='PGRST202'?'private diagnostic':'Access or validation error'}});
 const r=await GET(new NextRequest(base+'?from=2026-11-01&to=2026-11-20'));expect(r.status).toBe(status);if(status===503)expect(JSON.stringify(await r.json())).not.toContain('private diagnostic');
});
