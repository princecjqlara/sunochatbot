import { beforeEach,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),maybeSingle:vi.fn(),scope:vi.fn(),from:vi.fn()}));
vi.mock('../supabase',()=>({getSupabaseAdmin:()=>({from:m.from,rpc:m.rpc})}));
vi.mock('../veo-workspace',()=>({passwordMatches:vi.fn(),workspaceEnabled:()=>true,workspaceScope:m.scope}));
import {authOptions} from '../auth';
beforeEach(()=>{vi.clearAllMocks();const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:m.maybeSingle};m.from.mockReturnValue(query);m.scope.mockResolvedValue({role:'owner',launch_at:'2026-11-18'});});
it('retains Facebook sign-in for an existing workspace identity without creating users or exposing provider tokens',async()=>{
 m.maybeSingle.mockResolvedValue({data:{id:'retained-owner'}});
 const user:any={id:'provider-id',email:'owner@example.test',name:'Owner'};
 const account:any={provider:'facebook',providerAccountId:'verified-facebook-id',access_token:'provider-token'};
 expect(await (authOptions.callbacks!.signIn as any)({account,user})).toBe(true);
 expect(m.scope).toHaveBeenCalledWith('retained-owner');
 const token=await (authOptions.callbacks!.jwt as any)({token:{facebookId:'old',accessToken:'old'},account,user});
 expect(token.id).toBe('retained-owner');expect(token.facebookId).toBeUndefined();expect(token.accessToken).toBeUndefined();
 expect(m.from.mock.calls.every(([name])=>name==='users')).toBe(true);
});
it('rejects uninvited or inactive Facebook identities and unverified JWT callbacks',async()=>{
 m.maybeSingle.mockResolvedValue({data:null});
 const user:any={id:'provider-id',email:'new@example.test'};const account:any={provider:'facebook',providerAccountId:'provider-id'};
 expect(await (authOptions.callbacks!.signIn as any)({account,user})).toBe(false);expect(m.scope).not.toHaveBeenCalled();
 m.maybeSingle.mockResolvedValue({data:{id:'inactive'}});m.scope.mockResolvedValue(null);
 expect(await (authOptions.callbacks!.signIn as any)({account,user})).toBe(false);
 expect(await (authOptions.callbacks!.jwt as any)({token:{},account,user})).toEqual({});
});
