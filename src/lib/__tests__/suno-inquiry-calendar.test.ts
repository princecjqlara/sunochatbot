import {expect,it} from 'vitest';
import {buildAdCalendar} from '../ad-calendar';
import {sunoInquiryCalendar} from '../suno-inquiry-calendar';
it('retains actual cohort counts and spend while excluding inherited allowance and profit policy from Suno',()=>{
 const raw=buildAdCalendar({month:'2026-11',now:Date.parse('2026-11-24T00:00:00Z'),groups:[{page_id:'page',ad_id:null,day:'2026-11-01',inquiries:3,converted:2,orders:1,payers:0}],spend:[],inventory:[]});
 const r=sunoInquiryCalendar(raw);expect(r.overall).toMatchObject({inquiries:3,converted:2,orders:1,payers:0});expect(r.financial_policy).toBe('suno_direct_sales_v1');
 expect(r).not.toHaveProperty('salary_rate');for(const row of [r.summary,r.overall,...r.days,...r.days.map((d:any)=>d.overall)]){expect(row).not.toHaveProperty('profit');expect(row).not.toHaveProperty('finance');}
 expect(r.financial_report_href).toBe('/dashboard/workspace?view=calendar');
});
