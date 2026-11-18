import { NextRequest } from 'next/server';
import * as retained from '@/legacy-runtime/app/api/facebook/webhook/route';
import { captureRetainedEvents } from '@/lib/suno-retained-events';
import { NextResponse } from 'next/server';

// Existing Sunochatbot implementation; only Next.js route-context adaptation.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
    return (retained.GET as any)(request);
}

export async function POST(request: NextRequest) {
    const observation = process.env.SUNO_RETAINED_RUNTIME_ENABLED==='true' ? request.clone().json().catch(()=>null) : null;
    const response = await (retained.POST as any)(request);
    if(response.ok && observation) {
        try { await captureRetainedEvents(await observation); }
        catch { return NextResponse.json({error:'Event observation is pending; retry this event'},{status:503}); }
    }
    return response;
}
