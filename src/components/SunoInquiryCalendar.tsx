'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {calendarRange,shiftCalendarMonth} from '@/lib/ad-calendar';
import {requestDeadline} from '@/lib/request-deadline';
const field='block rounded border border-slate-300 bg-white p-2 text-sm';
const box='space-y-3 rounded-xl border bg-white p-5';
const n=(v:any)=>v==null?'Unavailable':new Intl.NumberFormat('en-PH').format(v);
const money=(v:any,c:any)=>v==null||!c?'Unavailable':new Intl.NumberFormat('en-PH',{style:'currency',currency:c}).format(v);
const phtToday=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
export default function SunoInquiryCalendar(){
 const [month,setMonth]=useState(()=>phtToday().slice(0,7)),[page,setPage]=useState(''),[day,setDay]=useState(phtToday),[version,setVersion]=useState(0);
 const [data,setData]=useState<any>(null),[pages,setPages]=useState<any[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [people,setPeople]=useState<any>(null),[peopleError,setPeopleError]=useState(''),[offset,setOffset]=useState(0);
 const key=JSON.stringify([month,page,version]),current=data?.request_key===key?data:null;
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');setPeople(null);
  const query=new URLSearchParams({month,...(page?{pageId:page}:{})});
  void requestDeadline(async signal=>{const r=await fetch('/api/ad-calendar?'+query,{signal,cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error||'Inquiry calendar unavailable');
   if(b.range?.month!==month||!Array.isArray(b.days)||!Array.isArray(b.ads)||!b.overall)throw Error('The calendar is incomplete. Refresh to retry.');return b;
  },30000,controller.signal).then(b=>{if(!controller.signal.aborted){setData({...b,request_key:key});setPages(previous=>page?[...new Map([...previous,...(b.pages||[])].map(p=>[p.id,p])).values()]:b.pages||[]);}})
   .catch(e=>{if(!controller.signal.aborted){setData(null);setError(e.message);}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[month,page,version]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{
  if(!current)return;const controller=new AbortController();setPeople(null);setPeopleError('');
  const q=new URLSearchParams({month,day,view:'contacts',status:'all',offset:String(offset),...(page?{pageId:page}:{})});
  void requestDeadline(async signal=>{const r=await fetch('/api/ad-calendar?'+q,{signal,cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error||'This cohort is unavailable');if(!Array.isArray(b.contacts))throw Error('Incomplete client list');return b;},20000,controller.signal)
   .then(b=>{if(!controller.signal.aborted)setPeople({...b,request_key:JSON.stringify([key,day,offset])});}).catch(e=>{if(!controller.signal.aborted)setPeopleError(e.message);});return()=>controller.abort();
 },[key,day,offset,current]);
 function changeMonth(value:string){try{calendarRange(value);}catch{return;}setMonth(value);setDay(value===phtToday().slice(0,7)?phtToday():value+'-01');setOffset(0);}
 const selected=current?.days.find((d:any)=>d.day===day),overall=current?.overall;
 const clients=people?.request_key===JSON.stringify([key,day,offset])?people:null;
 const summary=(row:any)=><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Recorded inquiries',row.inquiries],['Converted stages',row.converted],['Order Created stages',row.orders],['Clients with historical receipt evidence',row.payers]].map(([label,value])=><p key={label} className="rounded bg-slate-50 p-3 text-sm">{label}<strong className="block text-2xl">{n(value)}</strong></p>)}</div>;
 return <div className="dashboard-page space-y-5">
  <header><p className="text-xs uppercase tracking-widest text-slate-500">SUNO / Inquiry cohorts</p><h1 className="mt-2 text-3xl font-bold">Inquiry calendar & analytics</h1><p className="mt-2 text-sm text-slate-600">Track customers by their supported first inquiry date in Philippine time.</p></header>
  <nav aria-label="Calendar reports" className="flex flex-wrap gap-4 text-sm underline"><Link href="/dashboard/workspace?view=calendar">Sales & work calendar</Link><Link href="/dashboard/insights">Business Insights</Link><Link href="/dashboard/ad-quality">Advertising performance</Link></nav>
  <div className="flex flex-wrap items-end gap-3"><label>Inquiry month<input aria-label="Inquiry month" type="month" min="2000-01" max={phtToday().slice(0,7)} className={field} value={month} onChange={e=>changeMonth(e.target.value)} /></label><button className={field} onClick={()=>changeMonth(shiftCalendarMonth(month,-1))} disabled={month==='2000-01'}>Previous month</button><button className={field} onClick={()=>changeMonth(phtToday().slice(0,7))}>This month</button><label>Page<select className={field} value={page} onChange={e=>{setPage(e.target.value);setOffset(0);}}><option value="">All assigned Pages</option>{pages.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label><button disabled={loading} className={field} onClick={()=>setVersion(v=>v+1)}>Refresh calendar</button></div>
  {loading&&<p role="status">Loading inquiry cohorts…</p>}{error&&<p role="alert" className="rounded border border-amber-200 p-4">{error} <button className="underline" onClick={()=>setVersion(v=>v+1)}>Retry</button></p>}
  {current&&<>
   <section className={box}><h2 className="text-xl font-bold">All-source inquiries · {month}</h2>{summary(overall)}<p className="text-sm text-slate-600">Pipeline stages describe recorded sales conversations. They do not verify payments. Historical receipt evidence is separate from Suno’s current direct-sales ledger; use the Sales & work calendar for verified song payments, tips, refunds and earnings.</p><p className="text-sm">Collected ad spend: {money(overall.spend?.amount,overall.spend?.currency)} · {n(overall.spend?.covered_ad_days)} of {n(overall.spend?.expected_ad_days)} known-ad days covered.</p><p className="text-xs text-slate-500">Missing spend, ad origins and message histories remain incomplete. Today is provisional. Customers without a supported inquiry date are excluded from dated cohorts.</p></section>
   <section className={box}><h2 className="text-xl font-bold">First-inquiry dates</h2><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{current.days.map((d:any)=><button type="button" aria-label={'Inquiry cohort '+d.day} aria-pressed={day===d.day} disabled={d.future} key={d.day} className={'rounded border p-3 text-left text-sm disabled:opacity-30 '+(day===d.day?'border-indigo-600 bg-indigo-50':'bg-white')} onClick={()=>{setDay(d.day);setOffset(0);}}><strong className="block">{d.day.slice(-2)}</strong><span>{n((d.overall||d).inquiries)} inquiries</span>{d.partial&&<span className="block text-xs">Provisional</span>}</button>)}</div></section>
   <section className={box}><h2 className="text-xl font-bold">Selected cohort · {day}</h2>{selected&&summary(selected.overall||selected)}{peopleError&&<p role="alert">{peopleError} <button className="underline" onClick={()=>setVersion(v=>v+1)}>Retry clients</button></p>}{!clients&&!peopleError&&<p role="status">Loading saved clients…</p>}{clients&&<><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Client','Page','Recorded stage','Inquiry basis'].map(t=><th className="p-3" key={t}>{t}</th>)}</tr></thead><tbody>{clients.contacts.map((c:any)=><tr className="border-t" key={c.id}><td className="p-3"><Link className="underline" href={'/dashboard/contacts/'+c.id+'?pageId='+c.page_id}>{c.name||'Unnamed client'}</Link></td><td>{pages.find(p=>p.id===c.page_id)?.name||'Assigned Page'}</td><td>{(c.pipeline_stage||c.stage)?.replaceAll('_',' ')||'Unknown'}</td><td>{c.inquiry_basis?.replaceAll('_',' ')||'Unknown'}</td></tr>)}</tbody></table></div>{!clients.contacts.length&&<p>No recorded inquiries on this date.</p>}<div className="flex justify-between text-sm"><button disabled={!offset} className="underline disabled:opacity-40" onClick={()=>setOffset(v=>Math.max(0,v-25))}>Previous clients</button><span>{n(clients.total)} clients</span><button disabled={offset+25>=clients.total} className="underline disabled:opacity-40" onClick={()=>setOffset(v=>v+25)}>Next clients</button></div></>}</section>
   <section className={box}><h2 className="text-xl font-bold">Verified originating ads</h2><p className="text-sm text-slate-600">Customers without a verified originating ad stay in all-source totals. Their receipts are not assigned to an ad.</p>{current.ads.length?<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Creative','Inquiries','Converted stages','Collected spend'].map(t=><th className="p-3" key={t}>{t}</th>)}</tr></thead><tbody>{current.ads.map((a:any)=><tr className="border-t" key={a.ad.page_id+':'+a.ad.ad_id}><td className="p-3">{a.ad.ad_name||a.ad.ad_title||a.ad.ad_id}</td><td>{n(a.inquiries)}</td><td>{n(a.converted)}</td><td>{money(a.spend?.amount,a.spend?.currency)}</td></tr>)}</tbody></table></div>:<p>No verified originating ad inventory is recorded for this scope.</p>}</section>
  </>}
 </div>;
}
