import { expect,it } from 'vitest';
import { sunoWorkspaceEndpoint } from '../suno-runtime-endpoint';

it('uses upgraded workspace implementations without changing legacy RPC contracts',()=>{
    const url='https://example.supabase.co/rest/v1/rpc/claim_campaign_recipients';
    expect(sunoWorkspaceEndpoint(url,false)).toBe(url);
    expect(sunoWorkspaceEndpoint(url,true)).toBe('https://example.supabase.co/rest/v1/rpc/suno_workspace_claim_campaign_recipients');
    const newer='https://example.supabase.co/rest/v1/rpc/veo_access_context';
    expect(sunoWorkspaceEndpoint(newer,true)).toBe(newer);
});

it('preserves query scope, method, headers and body when selecting the workspace view or RPC',async()=>{
    const view=new URL('https://example.supabase.co/rest/v1/contact_interactions?contact_id=eq.current&limit=10');
    expect(String(sunoWorkspaceEndpoint(view,true))).toBe('https://example.supabase.co/rest/v1/suno_workspace_contact_interactions?contact_id=eq.current&limit=10');
    const request=new Request('https://example.supabase.co/rest/v1/rpc/get_contact_pipeline_counts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_page_id:'current-page'})});
    const mapped=sunoWorkspaceEndpoint(request,true) as Request;
    expect(mapped.method).toBe('POST');expect(mapped.headers.get('Content-Type')).toBe('application/json');
    expect(await mapped.json()).toEqual({p_page_id:'current-page'});
});
