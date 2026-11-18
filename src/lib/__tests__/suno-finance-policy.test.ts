import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../supabase',()=>({getSupabaseAdmin:()=>({rpc:mocks.rpc})}));
import {requireSunoFinancialPolicy,sunoFinancialWorkersReady} from '../suno-finance-policy';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('SUNO_RETAINED_RUNTIME_ENABLED','true');});
afterEach(()=>vi.unstubAllEnvs());
describe('Suno financial policy authorization',()=>{
 it('blocks new financial effects until the Owner chooses the rules',async()=>{
  mocks.rpc.mockResolvedValue({error:{code:'22023'}});
  await expect(requireSunoFinancialPolicy('actor')).rejects.toMatchObject({status:409});
  expect(mocks.rpc).toHaveBeenCalledWith('suno_require_earnings_policy',{p_actor:'actor'});
 });
 it('fails closed during outages and permits a confirmed policy',async()=>{
  mocks.rpc.mockResolvedValueOnce({error:{code:'SUPABASE_REQUEST_TIMEOUT'}}).mockResolvedValueOnce({error:null});
  await expect(requireSunoFinancialPolicy('actor')).rejects.toMatchObject({status:503});
  await expect(requireSunoFinancialPolicy('actor')).resolves.toBeUndefined();
 });
 it('pauses financial workers without treating unavailable status as confirmation',async()=>{
  mocks.rpc.mockResolvedValueOnce({data:false}).mockResolvedValueOnce({data:null,error:{code:'PGRST'}}).mockResolvedValueOnce({data:true});
  expect(await sunoFinancialWorkersReady()).toBe(false);
  await expect(sunoFinancialWorkersReady()).rejects.toThrow('unavailable');
  expect(await sunoFinancialWorkersReady()).toBe(true);
 });
 it('keeps the upstream workspace and its SQL fixtures independent of the retained runtime',async()=>{
  vi.stubEnv('SUNO_RETAINED_RUNTIME_ENABLED','false');
  await requireSunoFinancialPolicy('actor');
  expect(await sunoFinancialWorkersReady()).toBe(true);
  expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
