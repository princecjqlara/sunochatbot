'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {usePathname,useSearchParams} from 'next/navigation';

export default function SunoEarningsPolicyGate({children}:{children:ReactNode}){
 const path=usePathname(),params=useSearchParams();
 const financial=path==='/dashboard/workspace'&&['salary','earnings','calendar','budget','deals','receipts','sales'].includes(params.get('view')||'');
 const [policy,setPolicy]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!financial)return;const controller=new AbortController();setError('');
  fetch('/api/workspace/finance-policy',{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error('Earnings settings are unavailable. Please retry.');const p=await r.json();if(!controller.signal.aborted)setPolicy(p);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();
 },[financial,retry]);
 if(!financial)return children;
 if(policy?.confirmed)return children;
 return <section className="wireframe-card mx-auto max-w-2xl space-y-5"><div><h1 className="text-2xl font-bold">Confirm earnings rules</h1><p className="mt-3 text-sm leading-6 text-slate-600">Choose the rules for new Suno financial records. Existing chatbot settings and customer history are preserved.</p></div>
 {error?<p role="alert" className="text-sm text-red-700">{error} <button className="underline" onClick={()=>setRetry(v=>v+1)}>Retry</button></p>:!policy?<p role="status">Loading earnings settings…</p>:<><div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-7"><p>Assigned Makata: <strong>20%</strong> of verified song payments.</p><p>Tips and additional services: <strong>50%</strong> staff share. Revision fees: <strong>20%</strong> staff share.</p><p>Earned as each payment is verified, including deposits. Refunds reverse the corresponding earnings. All roles use the same rates.</p></div>{policy.role==='owner'?<button className="btn-wireframe-dark" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const r=await fetch('/api/workspace/finance-policy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({policy:'suno_direct_sales_v1'})});if(!r.ok)throw Error('The earnings rules could not be confirmed. Please retry.');setPolicy(await r.json());}catch(e:any){setError(e.message);}finally{setBusy(false);}}}>{busy?'Saving…':'Use Suno sales earnings rules'}</button>:<p className="text-sm text-slate-600">Ask the Owner to confirm the earnings rules before recording new financial activity.</p>}<p className="text-xs leading-5 text-slate-500">Song prices, tips, additional services and revision fees are separate amounts. Earnings do not record a payroll payout.</p></>}
 </section>;
}
