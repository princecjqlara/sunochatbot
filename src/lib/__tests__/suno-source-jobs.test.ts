import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),scan:vi.fn(),stages:vi.fn()}));
vi.mock('../supabase',()=>({getSupabaseAdmin:()=>({rpc:m.rpc,from:m.from})}));
vi.mock('../veo-business-orders',()=>({fetchBusinessOrderNotices:m.scan}));
vi.mock('../messenger-stage-sync',()=>({syncMessengerStageHistory:m.stages}));
import {processVeoSourceJobs} from '../veo-source-jobs';
beforeEach(()=>{
 vi.clearAllMocks();m.rpc.mockImplementation(async(name:string)=>({data:name==='veo_claim_source_jobs'?[{page_id:'page',contact_id:'contact',tenant_id:'tenant',claim_token:'lease'}]:true}));
 m.from.mockImplementation((name:string)=>{const q:any={select:()=>q,eq:()=>q,single:async()=>({data:name==='pages'?{fb_page_id:'facebook-page',access_token:'test-token'}:name==='contacts'?{id:'contact',page_id:'page',psid:'customer'}:{owner_id:'owner',launch_at:'2026-01-01T00:00:00Z'}})};return q;});
 m.scan.mockResolvedValue({complete:true,next_cursor:null,orders:[{invoice_id:'123'}],messages:[],coverage:'Supported provider notices'});m.stages.mockResolvedValue({events:0});
});
afterEach(()=>vi.unstubAllEnvs());
it('collects genuine Suno source notices without running Veo financial reconciliation',async()=>{
 vi.stubEnv('SUNO_RETAINED_RUNTIME_ENABLED','true');expect(await processVeoSourceJobs()).toMatchObject({claimed:1,completed:1,retried:0});
 expect(m.rpc.mock.calls.some(([name])=>name==='veo_observe_business_orders')).toBe(true);expect(m.rpc.mock.calls.some(([name])=>name==='veo_reconcile_contact_order')).toBe(false);
 expect(m.rpc).toHaveBeenCalledWith('veo_finish_source_job',expect.objectContaining({p_scan:expect.objectContaining({complete:true,financial_reconciliation:'suno_sales_only'})}));
});
it('preserves reference reconciliation outside the retained Suno runtime',async()=>{
 vi.stubEnv('SUNO_RETAINED_RUNTIME_ENABLED','false');await processVeoSourceJobs();expect(m.rpc.mock.calls.some(([name])=>name==='veo_reconcile_contact_order')).toBe(true);
});
it('checkpoints provider failures as retryable without losing the lease or manufacturing observations',async()=>{
 vi.stubEnv('SUNO_RETAINED_RUNTIME_ENABLED','true');m.scan.mockRejectedValueOnce(Error('Provider unavailable'));
 expect(await processVeoSourceJobs()).toMatchObject({claimed:1,completed:1,retried:1});expect(m.rpc.mock.calls.some(([name])=>name==='veo_observe_business_orders')).toBe(false);
 expect(m.rpc).toHaveBeenCalledWith('veo_finish_source_job',expect.objectContaining({p_claim:'lease',p_scan:{complete:false,error:'Provider unavailable'}}));
});
