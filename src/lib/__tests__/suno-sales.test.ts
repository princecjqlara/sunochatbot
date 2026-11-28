import {expect,it} from 'vitest';
import {sunoSalesAction,sunoSalesDate} from '../suno-sales';
import {dashboardNavigation} from '../suno-navigation';
const id='00000000-0000-4000-8000-000000000001';
it('normalizes separate song, revision and tip payments without accepting client-supplied rates',()=>{
 const parsed=sunoSalesAction({action:'payment',request_id:id,sale_id:id,kind:'tip',amount:'100.25',reference:' BANK-123 ',occurred_at:'2026-11-20T01:00:00+08:00',confirmed:true,rate_percent:99,payee_id:id});
 expect(parsed.data).toMatchObject({amount_minor:10025,charge_id:null,kind:'tip',reference:'BANK-123',occurred_at:'2026-11-19T17:00:00.000Z'});expect(parsed.data).not.toHaveProperty('rate_percent');expect(parsed.data).not.toHaveProperty('payee_id');
});
it('rejects unmatched charges, unverified receipts and invalid money and dates',()=>{
 for(const body of [{kind:'song'},{kind:'tip',charge_id:id},{kind:'tip',confirmed:false},{kind:'tip',amount:'1.001'},{kind:'tip',amount:'-1'}])expect(()=>sunoSalesAction({action:'payment',request_id:id,sale_id:id,amount:'1',confirmed:true,reference:'BANK-123',occurred_at:'2026-11-20T01:00:00+08:00',...body})).toThrow();
 expect(sunoSalesDate('2026-02-30')).toBe(false);expect(sunoSalesDate('2026-02-28')).toBe(true);
});
it('keeps the payment amount separate from an optional reference number',()=>{
 const body={action:'payment',request_id:id,sale_id:id,kind:'tip',amount:'150.25',confirmed:true,occurred_at:'2026-11-20T01:00:00+08:00'};
 for(const reference of [undefined,null,'','   '])expect(sunoSalesAction({...body,reference}).data).toMatchObject({amount_minor:15025,reference:null});
 expect(sunoSalesAction({...body,reference:'1234567890123'}).data).toMatchObject({amount_minor:15025,reference:'1234567890123'});
 for(const reference of [123,'x','a'.repeat(161)])expect(()=>sunoSalesAction({...body,reference})).toThrow(/reference/);
});
it('requires a description for an additional service and ignores supplied commission rates',()=>{
 const body={action:'payment',request_id:id,sale_id:id,kind:'extra',amount:'250',confirmed:true,occurred_at:'2026-11-20T01:00:00+08:00',description:' Video edit ',rate_percent:100};
 expect(sunoSalesAction(body).data).toMatchObject({amount_minor:25000,kind:'extra',charge_id:null,description:'Video edit',reference:null});
 expect(sunoSalesAction(body).data).not.toHaveProperty('rate_percent');
 for(const description of [undefined,'','   ','a'.repeat(501)])expect(()=>sunoSalesAction({...body,description})).toThrow(/Describe/);
 expect(()=>sunoSalesAction({...body,charge_id:id})).toThrow(/matching/);
});
it.each(['owner','team_leader','manager','member'])('provides direct Suno Sales and operational capacity without Veo pay gates for %s',role=>{
 const items=dashboardNavigation(role).flatMap(g=>g.items);expect(items.some(i=>i.label==='Sales & payments')).toBe(true);expect(items.some(i=>i.label==='Earnings')).toBe(true);
 expect(items.some(i=>i.label==='Capacity & quotas')).toBe(true);
 expect(items.filter(i=>i.href==='/dashboard/insights')).toHaveLength(['owner','team_leader'].includes(role)?1:0);
 expect(items.map(i=>i.label).join(' ')).not.toMatch(/Closed|Done|Deals|35%|40%/i);
});
