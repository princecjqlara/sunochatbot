import {NextRequest,NextResponse} from 'next/server';
import {getSessionFromRequest} from '@/lib/get-session';
import {getSupabaseAdmin} from '@/lib/supabase';
import {readVeoRpc} from '@/lib/veo-report-read';
import {uuid} from '@/lib/veo-workspace';
import {sunoSongWorkAction} from '@/lib/suno-song-work';
export const dynamic='force-dynamic';
const reply=(data:any,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const failed=(error:any)=>reply({error:['42501','22023','23505','40001'].includes(error?.code)?error.message:'Song work is temporarily unavailable. Refresh before retrying.'},error?.code==='42501'?403:['23505','40001'].includes(error?.code)?409:error?.code==='22023'?400:503);
export async function GET(request:NextRequest){
 const session=await getSessionFromRequest(request);if(!session?.user.id)return reply({error:'Sign in required'},401);
 const q=request.nextUrl.searchParams,page=q.get('page_id'),sale=q.get('sale_id'),status=q.get('status')||'all',offset=Number(q.get('offset')||0);
 if(page&&!uuid(page)||sale&&!uuid(sale)||!['all','working','revision','sent'].includes(status)||!Number.isSafeInteger(offset)||offset<0||offset>10000000)return reply({error:'Choose valid song work filters'},400);
 try{const result=await readVeoRpc(getSupabaseAdmin(),'suno_song_work_report',{p_actor:session.user.id,p_page:page||null,p_sale:sale||null,p_status:status,p_offset:offset});return result.error?failed(result.error):reply(result.data);}catch{return failed(null);}
}
export async function POST(request:NextRequest){
 if(request.headers.get('origin')!==request.nextUrl.origin)return reply({error:'Same-origin request required'},403);
 const session=await getSessionFromRequest(request);if(!session?.user.id)return reply({error:'Sign in required'},401);
 let data;try{data=sunoSongWorkAction(await request.json());}catch(error:any){return reply({error:error.message||'Invalid work request'},400);}
 try{const result=await getSupabaseAdmin().rpc('suno_song_work_action',{p_actor:session.user.id,p_data:data,p_source:'web'});return result.error?failed(result.error):reply(result.data);}catch{return failed(null);}
}
