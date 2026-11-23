import {uuid} from './veo-workspace';
import {sunoSalesDate} from './suno-sales';
import {parseMoneyMinor} from './money-minor';
export function sunoOperationsPlan(body:any){
 if(!body||!['capacity','budget'].includes(body.action)||!uuid(body.page_id)||!sunoSalesDate(body.work_date)||!Number.isSafeInteger(body.expected_version)||body.expected_version<0||typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.trim().length>500)throw Error('Choose a Page, date and reason; refresh the current plan before saving');
 const data:any={action:body.action,page_id:body.page_id,work_date:body.work_date,expected_version:body.expected_version,reason:body.reason.trim()};
 if(body.action==='capacity'){
  if(!uuid(body.worker_id)||!Number.isInteger(body.capacity)||body.capacity<0||body.capacity>1000||!Number.isInteger(body.quota)||body.quota<0||body.quota>body.capacity||!['available','unavailable','unknown'].includes(body.availability)||body.availability==='unavailable'&&(body.capacity!==0||body.quota!==0))throw Error('Enter a staff member, availability, capacity and a quota within capacity');
  Object.assign(data,{worker_id:body.worker_id,capacity:body.capacity,quota:body.quota,availability:body.availability});
 }else{
  const planned_minor=body.amount==='0'||body.amount==='0.00'?0:parseMoneyMinor(body.amount);
  if(!/^[A-Z]{3}$/.test(body.currency)||!Number.isSafeInteger(planned_minor)||planned_minor<0||planned_minor>9000000000000)throw Error('Enter a budget and a three-letter currency');
  Object.assign(data,{currency:body.currency,planned_minor});
 }
 return data;
}
