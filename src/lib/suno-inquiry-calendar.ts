/** The inquiry report describes cohort evidence. Suno transaction earnings live
 * in Sales, so inherited marketing allowance/profit estimates are excluded. */
export function sunoInquiryCalendar(data:any){
 const fields=['inquiries','converted','converted_later','orders','payers','payers_later','legacy_dates','conversations_with_archived_history','conversations_with_stale_archive','spend'];
 const row=(value:any)=>Object.fromEntries(fields.filter(key=>value&&Object.prototype.hasOwnProperty.call(value,key)).map(key=>[key,value[key]]));
 return {range:data.range,selected_day:data.selected_day,generated_at:data.generated_at,outcome_as_of:data.outcome_as_of,
  coverage:data.coverage,pages:data.pages||[],inventory:data.inventory||[],financial_policy:'suno_direct_sales_v1',
  financial_report_href:'/dashboard/workspace?view=calendar',summary:row(data.summary),overall:row(data.overall),unattributed:row(data.unattributed),
  days:data.days.map((d:any)=>({...row(d),day:d.day,future:d.future,partial:d.partial,overall:row(d.overall),unattributed_inquiries:d.unattributed_inquiries})),
  ads:data.ads.map((a:any)=>({...row(a),ad:a.ad})),day_ads:data.day_ads.map((a:any)=>({...row(a),ad:a.ad}))};
}
