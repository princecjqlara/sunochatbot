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
it.each(['owner','team_leader','manager','member'])('provides direct Suno Sales without inherited deal or quota menus for %s',role=>{
 const items=dashboardNavigation(role).flatMap(g=>g.items);expect(items.some(i=>i.label==='Sales & payments')).toBe(true);expect(items.some(i=>i.label==='Earnings')).toBe(true);
 expect(items.map(i=>i.label).join(' ')).not.toMatch(/Closed|Done|Deals|quotas|35%|40%/i);
});
