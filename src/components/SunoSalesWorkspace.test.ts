import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams()}));
import SunoSalesWorkspace from './SunoSalesWorkspace';
afterEach(()=>vi.unstubAllGlobals());
it('renders direct Suno rates and actual contact search results without Closed/Done controls',async()=>{
 const report={policy:{confirmed:true},totals:[],daily:[],staff:[],sales:[],sale_count:0};
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>url.startsWith('/api/pages')?{pages:[]}:url.includes('/context?')?{accounts:[]}:url.includes('/contacts?')?{items:[{id:'contact',page_id:'page',name:'A real saved client',page_name:'Suno'}],total:1}:report})));
 let root:TestRenderer.ReactTestRenderer;
 await act(async()=>{root=TestRenderer.create(React.createElement(SunoSalesWorkspace,{view:'sales'}));});
 await act(async()=>{await new Promise(r=>setTimeout(r,300));});
 const rendered=JSON.stringify(root!.toJSON());expect(rendered).toContain('20');expect(rendered).toContain('50');expect(rendered).toContain('A real saved client');expect(rendered).toContain('Add a revision fee');expect(rendered).not.toMatch(/Closed Deal|Done Deal|35%|40%/);
 act(()=>root!.unmount());
});
