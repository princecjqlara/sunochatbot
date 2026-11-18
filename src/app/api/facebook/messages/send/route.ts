import { NextRequest } from 'next/server';
import * as retained from '@/legacy-runtime/app/api/facebook/messages/send/route';

// Existing Sunochatbot implementation; only Next.js route-context adaptation.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
    return (retained.POST as any)(request);
}
