import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams()}));
vi.mock('next/link',()=>({default:(props:any)=>React.createElement('a',{href:props.href},props.children)}));
import SunoSongWork from './SunoSongWork';
afterEach(()=>vi.unstubAllGlobals());
it('renders current song assignments and revision work without claiming payment or confirmed delivery',async()=>{
 const report={scope:{role:'owner'},total:1,items:[{sale_id:'sale',page_id:'page',contact_id:'contact',contact_name:'Saved client',description:'Birthday song',page_name:'Suno',assignee_id:'worker',assignee_name:'Makata',payee_name:'Original Makata',status:'revision',version:2,updated_at:'2026-11-20T00:00:00Z',reason:'Customer requested changes',history:[]}]};
 const fetch=vi.fn(async(url:string)=>({ok:true,json:async()=>url.startsWith('/api/pages')?{pages:[]}:url.includes('/context?')?{accounts:[]}:report}));vi.stubGlobal('fetch',fetch);
 let root:TestRenderer.ReactTestRenderer;await act(async()=>{root=TestRenderer.create(React.createElement(SunoSongWork));});
 const rendered=JSON.stringify(root!.toJSON());expect(rendered).toContain('Saved client');expect(rendered).toContain('Revision requested');expect(rendered).toContain('Reported sent');expect(rendered).toContain('does not confirm client receipt');expect(rendered).toContain('does not create a fee');expect(rendered).not.toMatch(/Closed Deal|Done Deal|35%|40%/);
 expect(fetch.mock.calls.some(([url])=>url==='/api/workspace/context?view=sales&accounts=1')).toBe(true);act(()=>root!.unmount());
});
