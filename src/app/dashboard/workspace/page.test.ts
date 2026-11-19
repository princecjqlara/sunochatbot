import {createElement} from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({params:new URLSearchParams(),replace:vi.fn(),fetch:vi.fn(),imports:[] as Promise<any>[]}));
vi.mock('next/dynamic',()=>({default:(loader:()=>Promise<any>)=>{let Component:any;const pending=loader().then(mod=>{Component=mod.default;});m.imports.push(pending);return(props:any)=>{if(!Component)throw pending;return createElement(Component,props);};}}));
vi.mock('next/navigation',()=>({useSearchParams:()=>m.params,useRouter:()=>({replace:m.replace})}));
vi.mock('next/link',()=>({default:({href,children,...props}:any)=>createElement('a',{href,...props},children)}));
import Page from './page';
let view:ReactTestRenderer;
const scope=(role='member')=>({user_id:'worker',role,launch_at:'2026-11-05T00:00:00Z'});
const context=(role='member')=>({scope:scope(role),accounts:[{id:'worker',name:'Makata',role:'member',active:true,page_ids:['page-2']}],orders:[],teams:[],tomorrow:[],salary:[],submissions:[],sync:[]});
const sales=(role='member')=>({scope:scope(role),policy:{confirmed:true,song_rate:20,tip_rate:50,revision_rate:20},sales:[],totals:[],daily:[],staff:[],sale_count:0});
beforeEach(async()=>{await Promise.all(m.imports);vi.clearAllMocks();vi.useFakeTimers();vi.stubGlobal('fetch',m.fetch);});
afterEach(async()=>{if(view)await act(async()=>view.unmount());vi.useRealTimers();vi.unstubAllGlobals();});
async function render(role='member',params=''){
 m.params=new URLSearchParams(params);
 m.fetch.mockImplementation(async(url:string)=>{const q=new URL(url,'https://suno.example');
  if(q.pathname==='/api/pages')return Response.json({pages:[{id:'page-2',name:'Suno Page'}]});
  if(q.pathname==='/api/workspace/sales')return Response.json(sales(role));
  if(q.pathname==='/api/workspace/song-work')return Response.json({scope:scope(role),items:[],total:0});
  if(q.pathname==='/api/workspace/contacts'){const search=q.searchParams.get('search')||'';return Response.json({items:!search||'searchable client'.includes(search)?[{id:'client',page_id:'page-2',page_name:'Suno Page',name:'Searchable Client',psid:'123',pipeline_stage:'new'}]:[],total:1});}
  if(q.pathname==='/api/workspace/new-clients')return Response.json(q.searchParams.has('context')?{scope:scope(role)}:{items:[],roster:[],readiness:{ready:false},total:0});
  if(q.pathname==='/api/workspace/telegram-groups')return Response.json({scope:scope(role),groups:[],teams:[],accounts:[],memberships:[],can_manage:role!=='member'});
  if(q.pathname==='/api/workspace/jaucian')return Response.json({workspace:{teams:[],accounts:[]},jaucian:{groups:[],checked_at:'2026-11-09T00:00:00Z',veo_connection:{ok:true}}});
  return Response.json(context(role));
 });
 await act(async()=>{view=create(createElement(Page));});await act(async()=>{await vi.advanceTimersByTimeAsync(300);});
}
it('searches saved contacts before an order exists and selects the client for a direct sale',async()=>{
 await render();expect(JSON.stringify(view.toJSON())).toContain('Searchable Client');
 const input=view.root.findAllByType('input').find(i=>i.props.placeholder==='Name, client ID or saved details')!;
 await act(async()=>input.props.onChange({target:{value:'searchable'}}));await act(async()=>{await vi.advanceTimersByTimeAsync(300);});
 expect(m.fetch.mock.calls.some(([url])=>url.startsWith('/api/workspace/contacts?')&&url.includes('search=searchable')&&!url.includes('page_id='))).toBe(true);
 await act(async()=>view.root.findAllByType('a').find(a=>a.props.href==='#create-order')!.props.onClick());
 expect(JSON.stringify(view.toJSON())).toContain('Searchable Client');expect(view.root.findAllByType('button').find(b=>b.children.includes('Save song sale'))!.props.disabled).toBe(false);
});
it.each(['clients','deals','closed','done','receipts'])('opens the Suno Sales flow for legacy %s links without milestone controls',async alias=>{
 await render('member','view='+alias);const text=JSON.stringify(view.toJSON());expect(text).toContain('New song sale');expect(text).toContain('Add a revision fee');expect(text).not.toMatch(/Closed Deal|Done Deal|35%|40%/);
 expect(m.fetch.mock.calls.some(([u])=>u.startsWith('/api/workspace/sales?'))).toBe(true);expect(m.fetch.mock.calls.some(([u])=>/\/api\/workspace\/(receipts|deal-reviews)/.test(u))).toBe(false);
});
it('gives the Owner direct sales and staff earnings without quota or receipt-review report requests',async()=>{
 await render('owner');const text=JSON.stringify(view.toJSON());expect(text).toContain('Suno dashboard');expect(text).toContain('Staff earnings');expect(text).not.toMatch(/Closed Deal|Done Deal|quota|35%|40%/i);
 expect(m.fetch.mock.calls.some(([u])=>/\/api\/workspace\/(operations|calendar|budget)/.test(u))).toBe(false);
});
it('loads Suno earnings without fetching client-search or inherited salary endpoints',async()=>{
 await render('member','view=salary');expect(JSON.stringify(view.toJSON())).toContain('Staff earnings');
 expect(m.fetch.mock.calls.some(([u])=>u.startsWith('/api/workspace/contacts?'))).toBe(false);expect(m.fetch.mock.calls.some(([u])=>u.startsWith('/api/workspace/operations'))).toBe(false);
});
it('routes Song work to current song assignments without financial or legacy receipt reads',async()=>{
 await render('member','view=songs');expect(JSON.stringify(view.toJSON())).toContain('Song work & revisions');expect(m.fetch.mock.calls.some(([u])=>u.startsWith('/api/workspace/song-work?'))).toBe(true);
 expect(m.fetch.mock.calls.some(([u])=>u.startsWith('/api/workspace/sales?')||u.startsWith('/api/workspace/receipts'))).toBe(false);
});
it('debounces client search without repeating the sales totals request',async()=>{
 await render();const before=m.fetch.mock.calls.filter(([u])=>u.startsWith('/api/workspace/sales?')).length;
 const input=view.root.findAllByType('input').find(i=>i.props.placeholder==='Name, client ID or saved details')!;
 for(const value of ['s','se','searchable'])await act(async()=>input.props.onChange({target:{value}}));
 await act(async()=>{await vi.advanceTimersByTimeAsync(249);});expect(m.fetch.mock.calls.filter(([u])=>u.includes('search=searchable'))).toHaveLength(0);
 await act(async()=>{await vi.advanceTimersByTimeAsync(1);});expect(m.fetch.mock.calls.filter(([u])=>u.includes('search=searchable'))).toHaveLength(1);
 expect(m.fetch.mock.calls.filter(([u])=>u.startsWith('/api/workspace/sales?'))).toHaveLength(before);
});
it('ignores an old client-search response after the search changes',async()=>{
 await render();const normal=m.fetch.getMockImplementation()!;let finish!:(r:Response)=>void;
 m.fetch.mockImplementation((u:string)=>u.includes('search=old')?new Promise<Response>(resolve=>{finish=resolve;}):normal(u));
 const input=view.root.findAllByType('input').find(i=>i.props.placeholder==='Name, client ID or saved details')!;
 await act(async()=>input.props.onChange({target:{value:'old'}}));await act(async()=>{await vi.advanceTimersByTimeAsync(300);});
 await act(async()=>input.props.onChange({target:{value:'searchable'}}));await act(async()=>{await vi.advanceTimersByTimeAsync(300);});
 await act(async()=>finish(Response.json({items:[{id:'old',name:'Stale client'}],total:1})));expect(JSON.stringify(view.toJSON())).not.toContain('Stale client');expect(JSON.stringify(view.toJSON())).toContain('Searchable Client');
});
it('opens song assignments using lightweight scope without sales or client-history reads',async()=>{
 await render('owner','view=new_clients&contact_id=client');expect(JSON.stringify(view.toJSON())).toContain('New clients');
 expect(m.fetch.mock.calls.some(([u])=>u==='/api/workspace/new-clients?context=1')).toBe(true);expect(m.fetch.mock.calls.some(([u])=>u.startsWith('/api/workspace?')||u.startsWith('/api/workspace/sales?'))).toBe(false);
});
it('keeps Telegram setup independent of financial report and client-history reads',async()=>{
 await render('owner','view=telegram&contact_id=client');expect(JSON.stringify(view.toJSON())).toContain('Fetch teams and Pages from Jaucian');
 expect(m.fetch.mock.calls.some(([u])=>u==='/api/workspace/telegram-groups')).toBe(true);expect(m.fetch.mock.calls.some(([u])=>u.startsWith('/api/workspace?')||u.startsWith('/api/workspace/sales?'))).toBe(false);
});
