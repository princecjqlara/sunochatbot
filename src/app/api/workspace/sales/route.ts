import {NextRequest,NextResponse} from 'next/server';
import {getSessionFromRequest} from '@/lib/get-session';
import {getSupabaseAdmin} from '@/lib/supabase';
import {readVeoRpc} from '@/lib/veo-report-read';
import {uuid} from '@/lib/veo-workspace';
import {sunoSalesAction,sunoSalesDate} from '@/lib/suno-sales';
export const dynamic='force-dynamic';
const reply=(data:any,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const failed=(error:any)=>reply({error:['42501','22023','23505'].includes(error?.code)?error.message:'Sales are temporarily unavailable. Refresh before retrying.'},error?.code==='42501'?403:error?.code==='23505'?409:error?.code==='22023'?400:503);
export async function GET(request:NextRequest){
 const session=await getSessionFromRequest(request);if(!session?.user.id)return reply({error:'Sign in required'},401);
 const q=request.nextUrl.searchParams,from=q.get('from'),to=q.get('to'),page=q.get('page_id'),contact=q.get('contact_id'),offset=Number(q.get('offset')||0);
 if(!sunoSalesDate(from)||!sunoSalesDate(to)||to<from||Date.parse(to)-Date.parse(from)>365*86400000||page&&!uuid(page)||contact&&!uuid(contact)||!Number.isSafeInteger(offset)||offset<0||offset>10000000)return reply({error:'Choose valid sales dates, Page and contact filters'},400);
 try{const result=await readVeoRpc(getSupabaseAdmin(),'suno_sales_report',{p_actor:session.user.id,p_from:from,p_to:to,p_page:page||null,p_contact:contact||null,p_offset:offset});return result.error?failed(result.error):reply(result.data);}catch{return failed(null);}
}
export async function POST(request:NextRequest){
 if(request.headers.get('origin')!==request.nextUrl.origin)return reply({error:'Same-origin request required'},403);
 const session=await getSessionFromRequest(request);if(!session?.user.id)return reply({error:'Sign in required'},401);
 let parsed;try{parsed=sunoSalesAction(await request.json());}catch(error:any){return reply({error:error.message||'Invalid sales request'},400);}
 try{const result=await getSupabaseAdmin().rpc('suno_sale_action',{p_actor:session.user.id,p_action:parsed.action,p_data:parsed.data});return result.error?failed(result.error):reply(result.data);}catch{return failed(null);}
}
