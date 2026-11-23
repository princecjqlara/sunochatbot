import React from 'react';import TestRenderer,{act} from 'react-test-renderer';import {afterEach,it,expect,vi} from 'vitest';
import {buildAdCalendar} from '@/lib/ad-calendar';
vi.mock('next/link',()=>({default:(p:any)=>React.createElement('a',{href:p.href},p.children)}));
const m=vi.hoisted(()=>({role:'owner'}));
vi.mock('next-auth/react',()=>({useSession:()=>({status:'authenticated',data:{user:{role:m.role}}})}));
import SunoInquiryCalendar from './SunoInquiryCalendar';
import CalendarPage from '@/app/dashboard/ad-calendar/page';
afterEach(()=>{vi.unstubAllGlobals();m.role='owner';});
function report(){const month=new Date(Date.now()+8*3600000).toISOString().slice(0,7);return {...buildAdCalendar({month,groups:[],spend:[],inventory:[]}),pages:[]};}
it('opens the actual inquiry report for an authenticated Owner and never fetches Sales or Veo salary APIs',async()=>{
 const fetch=vi.fn(async(url:string)=>({ok:true,json:async()=>url.includes('view=contacts')?{contacts:[],total:0}:report()}));vi.stubGlobal('fetch',fetch);
 let view:TestRenderer.ReactTestRenderer;await act(async()=>{view=TestRenderer.create(React.createElement(CalendarPage));});
 const rendered=JSON.stringify(view!.toJSON());expect(rendered).toContain('Inquiry calendar & analytics');expect(rendered).not.toMatch(/35%|40%|Save song sale/);
 expect(fetch.mock.calls.every(([url])=>url.startsWith('/api/ad-calendar?'))).toBe(true);act(()=>view!.unmount());
});
it('keeps cohort stages separate from verified payments and paginates at the real 25-client API limit',async()=>{
 const fetch=vi.fn(async(url:string)=>({ok:true,json:async()=>url.includes('view=contacts')?{contacts:[{id:'client',page_id:'page',name:'Saved client',stage:'qualified'}],total:26}:report()}));vi.stubGlobal('fetch',fetch);
 let view:TestRenderer.ReactTestRenderer;await act(async()=>{view=TestRenderer.create(React.createElement(SunoInquiryCalendar));});
 expect(JSON.stringify(view!.toJSON())).toContain('They do not verify payments');expect(JSON.stringify(view!.toJSON())).toContain('qualified');
 await act(async()=>view!.root.findAllByType('button').find(b=>b.children.includes('Next clients'))!.props.onClick());
 expect(fetch.mock.calls.some(([url])=>url.includes('offset=25'))).toBe(true);act(()=>view!.unmount());
});
it('does not mount the report for a member',async()=>{
 m.role='member';const fetch=vi.fn();vi.stubGlobal('fetch',fetch);let view:TestRenderer.ReactTestRenderer;await act(async()=>{view=TestRenderer.create(React.createElement(CalendarPage));});expect(fetch).not.toHaveBeenCalled();act(()=>view!.unmount());
});
