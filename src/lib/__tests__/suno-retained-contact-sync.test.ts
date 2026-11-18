import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({token:vi.fn(),fetch:vi.fn()}));
vi.mock('next-auth/jwt',()=>({getToken:mocks.token}));
import {middleware} from '@/middleware';
const page='00000000-0000-4000-8000-000000000001';
beforeEach(()=>{
 vi.stubEnv('SUNO_RETAINED_RUNTIME_ENABLED','true');vi.stubEnv('VEO_WORKSPACE_ENABLED','true');
 vi.stubEnv('SUNO_DEPLOYMENT_STAGE','active');vi.stubEnv('VEO_DATABASE_RECOVERY_MODE','false');
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://example.test');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','fixture');
 vi.stubGlobal('fetch',mocks.fetch);mocks.token.mockResolvedValue({id:'owner'});
 mocks.fetch.mockReset();
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
const request=()=>new NextRequest('https://suno.test/api/pages/'+page+'/sync',{method:'POST',headers:{origin:'https://suno.test','content-type':'application/json'},body:'{}'});
it('retains manual Suno contact sync after verifying the current workspace and Page grant',async()=>{
 mocks.fetch.mockResolvedValueOnce(Response.json({role:'owner',launch_at:'2026-11-18',page_ids:[page]})).mockResolvedValueOnce(Response.json(true));
 const result=await middleware(request());
 expect(result.headers.get('x-middleware-next')).toBe('1');
 expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual({p_actor:'owner',p_refs:[{kind:'page',id:page}]});
});
it('blocks a revoked Page instead of allowing the retained route to bypass workspace authorization',async()=>{
 mocks.fetch.mockResolvedValueOnce(Response.json({role:'owner',launch_at:'2026-11-18',page_ids:[]})).mockResolvedValueOnce(Response.json(false));
 expect((await middleware(request())).status).toBe(403);
});
