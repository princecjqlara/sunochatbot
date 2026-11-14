import {NextResponse} from 'next/server';
/** Worker handlers authenticate even when invoked without middleware. */
export function cronAuthorizationError(request:Pick<Request,'headers'>|undefined) {
    const secret=process.env.CRON_SECRET;
    if(!secret)return NextResponse.json({error:'Scheduler is not configured'},{status:503});
    if(request?.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401});
    return null;
}
