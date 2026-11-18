import { NextRequest } from 'next/server';
import * as retained from '@/legacy-runtime/app/api/chatbot-media/[assetId]/route';

// Existing Sunochatbot implementation; only Next.js route-context adaptation.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest, context: { params: Promise<{ assetId: string }> }) {
    return (retained.GET as any)(request, { ...context, params: await context.params });
}
