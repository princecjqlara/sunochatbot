import { retainedCronUnauthorized } from '@/lib/retained-cron-auth';
import { NextRequest } from 'next/server';
import * as retained from '@/legacy-runtime/app/api/cron/sync/route';

// Existing Sunochatbot implementation; only Next.js route-context adaptation.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
    const denied = retainedCronUnauthorized(request); if (denied) return denied;
    return (retained.GET as any)(request);
}
