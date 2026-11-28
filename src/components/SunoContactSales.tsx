'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
export default function SunoContactSales({contactId}:{contactId:string}){
 const [report,setReport]=useState<any>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{const c=new AbortController();setReport(null);setError('');const to=new Date(Date.now()+8*3600000).toISOString().slice(0,10),from=new Date(Date.now()+8*3600000-365*86400000).toISOString().slice(0,10);
 fetch('/api/workspace/sales?'+new URLSearchParams({contact_id:contactId,from,to}),{signal:c.signal}).then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.error||'Song sales are unavailable');return b;}).then(b=>{if(!c.signal.aborted)setReport(b);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[contactId,retry]);
 const money=(n:any,c:string)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:c}).format(Number(n||0)/100);
 return <section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="font-semibold">Suno song sales, tips and revision fees</h2><p className="text-sm text-slate-600">Verified payments in the past year. Staff earn 20% of song payments, 50% of tips and 20% of revision payments. Refunds reverse earnings.</p><Link className="text-sm underline" href={'/dashboard/workspace?view=sales&contact_id='+encodeURIComponent(contactId)}>Open this client’s Sales & payments</Link>
 {error?<p role="alert">{error} <button className="underline" onClick={()=>setRetry(v=>v+1)}>Retry</button></p>:!report?<p role="status">Loading verified song payments…</p>:<>{report.totals.map((t:any)=><div className="rounded border p-3 text-sm" key={t.currency}><p>Songs {money(t.song_minor,t.currency)} · revisions {money(t.revision_minor,t.currency)} · tips {money(t.tip_minor,t.currency)} · additional services {money(t.extra_minor,t.currency)}</p><p>Net received {money(t.net_received_minor,t.currency)} · staff earnings {money(t.commission_minor,t.currency)}</p></div>)}{!report.totals.length&&<p className="text-sm text-slate-500">No verified Suno payments in this period.</p>}<p className="text-xs text-slate-500">Financial access follows your staff branch and Page permissions. Open Sales for the full charge and receipt history.</p></>}
 </section>;
}
