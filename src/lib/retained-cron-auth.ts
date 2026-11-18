import { NextResponse } from 'next/server';
export function retainedCronUnauthorized(request: Request, missingStatus = 503) {
    if (!process.env.CRON_SECRET) return NextResponse.json({error:'Scheduler authentication is not configured'},{status:missingStatus});
    return request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
        ? NextResponse.json({error:'Unauthorized'},{status:401}) : null;
}
