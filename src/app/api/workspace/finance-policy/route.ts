import {NextRequest,NextResponse} from 'next/server';
import {getSessionFromRequest} from '@/lib/get-session';
import {getSupabaseAdmin} from '@/lib/supabase';
export const dynamic='force-dynamic';
async function actor(request:NextRequest){const session=await getSessionFromRequest(request);return session?.user.id;}
export async function GET(request:NextRequest){
 const id=await actor(request);if(!id)return NextResponse.json({error:'Sign in required'},{status:401});
 const result=await getSupabaseAdmin().rpc('suno_workspace_policy_status',{p_actor:id});
 return result.error?NextResponse.json({error:'Earnings settings could not be loaded. Retry shortly.'},{status:503}):NextResponse.json(result.data,{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:NextRequest){
 if(request.headers.get('origin')!==request.nextUrl.origin)return NextResponse.json({error:'Same-origin request required'},{status:403});
 const id=await actor(request);if(!id)return NextResponse.json({error:'Sign in required'},{status:401});
 const body=await request.json().catch(()=>null);if(body?.policy!=='suno_direct_sales_v1')return NextResponse.json({error:'Choose the displayed Suno earnings policy'},{status:400});
 const result=await getSupabaseAdmin().rpc('suno_confirm_earnings_policy',{p_actor:id,p_policy:body.policy});
 return result.error?NextResponse.json({error:result.error.code==='42501'?'Owner access required':'Earnings settings could not be saved'},{status:result.error.code==='42501'?403:503}):NextResponse.json(result.data,{headers:{'Cache-Control':'no-store'}});
}
