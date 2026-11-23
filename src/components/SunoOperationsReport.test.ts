import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {afterEach,it,expect,vi} from 'vitest';
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams()}));
vi.mock('next/link',()=>({default:(props:any)=>React.createElement('a',{href:props.href},props.children)}));
import SunoOperationsReport from './SunoOperationsReport';
const fixture={version:1,scope:{role:'owner'},from:'2026-11-20',to:'2026-11-24',launch_date:'2026-11-01',work_date:'2026-11-24',as_of:'2026-11-24T00:00:00Z',coverage:{source:'Recorded Suno direct sales',delivery:'Staff declaration',earnings:'20% songs, 50% tips, 20% revisions'},money:[],daily:[],staff:[],pages:[],plans:[],budgets:[],spend:[],capacity:{workers:0,capacity:null,quota:null,unplanned_workers:1,day_sent:0},period:{new_sales:0,paying_clients:0,paid_sales:0,songs_sent:0},backlog:{working:0,revisions:0,oldest:[]}};
afterEach(()=>vi.unstubAllGlobals());
it.each([['capacity','Set song capacity & quota'],['budget','Plan a Page budget'],['performance','Staff workload & verified earnings'],['rankings','Ranked staff results'],['calendar','Daily sales & work'],['insights','Current production backlog']])('renders the actual %s report instead of a sales entry screen',async(view,heading)=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>fixture})));
 let root:TestRenderer.ReactTestRenderer;await act(async()=>{root=TestRenderer.create(React.createElement(SunoOperationsReport,{view}));});
 const text=JSON.stringify(root!.toJSON());expect(text).toContain(heading);expect(root!.root.findAllByType('form').some(f=>f.props.id==='create-order')).toBe(false);expect(text).not.toMatch(/Closed Deal|Done Deal|35%|40%/);if(view==='capacity')expect(text).toContain('Not set');act(()=>root!.unmount());
});
it('clears a previous successful report immediately when filters change and offers retry on failure',async()=>{
 let resolve:any;const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({...fixture,period:{...fixture.period,new_sales:123456}})}).mockImplementationOnce(()=>new Promise(r=>resolve=r));vi.stubGlobal('fetch',fetch);
 let root:TestRenderer.ReactTestRenderer;await act(async()=>{root=TestRenderer.create(React.createElement(SunoOperationsReport,{view:'insights'}));});expect(JSON.stringify(root!.toJSON())).toContain('123,456');
 await act(async()=>{root!.root.findAllByProps({type:'date'})[0].props.onChange({target:{value:'2026-11-21'}});});expect(JSON.stringify(root!.toJSON())).not.toContain('123,456');
 await act(async()=>{resolve({ok:false,json:async()=>({error:'Temporarily unavailable'})});});expect(JSON.stringify(root!.toJSON())).toContain('Temporarily unavailable');act(()=>root!.unmount());
});
