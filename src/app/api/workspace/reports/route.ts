import {NextRequest,NextResponse} from 'next/server';
import {getSessionFromRequest} from '@/lib/get-session';
import {getSupabaseAdmin} from '@/lib/supabase';
import {workspaceScope,philippineDate,uuid} from '@/lib/veo-workspace';
import {readVeoRpc} from '@/lib/veo-report-read';
import {sunoSalesDate} from '@/lib/suno-sales';
import {sunoOperationsPlan} from '@/lib/suno-operations';
export const dynamic='force-dynamic';
export const maxDuration=30;
const pending=new Map<string,Promise<any>>();
const reply=(body:any,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store',...(status===503?{'Retry-After':'30'}:{})}});
const failed=(error:any)=>reply({error:['42501','22023','40001'].includes(error?.code)?error.message:'Reports are temporarily unavailable. Refresh to retry.'},error?.code==='42501'?403:error?.code==='40001'?409:error?.code==='22023'?400:503);
export async function GET(request:NextRequest){
 try{
  const session=await getSessionFromRequest(request);if(!session?.user?.id)return reply({error:'Sign in required'},401);
  const scope=await workspaceScope(session.user.id,request);if(!scope?.launch_at)return reply({error:'Workspace access required'},403);
  const q=request.nextUrl.searchParams,today=philippineDate(),launch=philippineDate(new Date(scope.launch_at));
  const recent=philippineDate(new Date(Date.now()-29*86400000)),from=q.get('from')||(launch>recent?launch:recent),to=q.get('to')||today;
  const page=q.get('page_id')||null,day=q.get('date')||today;
  if(!sunoSalesDate(from)||!sunoSalesDate(to)||!sunoSalesDate(day)||from<launch||to>today||to<from||Date.parse(to)-Date.parse(from)>92*86400000||day<launch||day>philippineDate(new Date(Date.now()+86400000)))return reply({error:'Choose up to 93 Philippine dates since launch, and a planning date through tomorrow'},400);
  if(page&&(!uuid(page)||!scope.page_ids.includes(page)))return reply({error:'Page access denied'},403);
  // Coalesce only concurrent reads after rechecking current access. No report cache.
  const key=JSON.stringify([session.user.id,scope.tenant_id,scope.role,[...scope.page_ids].sort(),[...scope.worker_ids].sort(),from,to,page,day]);
  let read=pending.get(key);
  if(!read){if(pending.size>=2)return reply({error:'Reports are busy. Try again shortly.'},503);
   read=readVeoRpc(getSupabaseAdmin(),'suno_operations_report',{p_actor:session.user.id,p_from:from,p_to:to,p_page:page,p_day:day},12000).finally(()=>pending.delete(key));pending.set(key,read);}
  const result=await read;if(result.error)return failed(result.error);
  if(result.data?.version!==1||!Array.isArray(result.data.staff)||!Array.isArray(result.data.pages)||!Array.isArray(result.data.money)||!result.data.coverage||!result.data.capacity||!result.data.period||!result.data.backlog)return failed(null);
  return reply(result.data);
 }catch(error:any){return error?.status===403?reply({error:'Workspace access denied'},403):failed(error);}
}
export async function POST(request:NextRequest){
 if(request.headers.get('origin')!==request.nextUrl.origin)return reply({error:'Same-origin request required'},403);
 try{
  const session=await getSessionFromRequest(request);if(!session?.user?.id)return reply({error:'Sign in required'},401);
  const scope=await workspaceScope(session.user.id,request);if(!scope?.launch_at||!['owner','team_leader','manager'].includes(scope.role))return reply({error:'Supervisor access required'},403);
  let data;try{data=sunoOperationsPlan(await request.json());}catch(error:any){return reply({error:error.message||'Invalid plan'},400);}
  if(data.action==='budget'&&!['owner','team_leader'].includes(scope.role))return reply({error:'Owner or Team Leader access required'},403);
  const result=await getSupabaseAdmin().rpc('suno_operations_plan',{p_actor:session.user.id,p_data:data});return result.error?failed(result.error):reply({saved:result.data});
 }catch(error:any){return failed(error);}
}
