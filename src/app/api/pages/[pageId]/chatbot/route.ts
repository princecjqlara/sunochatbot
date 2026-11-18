import { NextRequest } from 'next/server';
import * as retained from '@/legacy-runtime/app/api/pages/[pageId]/chatbot/route';

// Existing Sunochatbot implementation; only Next.js route-context adaptation.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest, context: { params: Promise<{ pageId: string }> }) {
    return (retained.GET as any)(request, { ...context, params: await context.params });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ pageId: string }> }) {
    return (retained.PUT as any)(request, { ...context, params: await context.params });
}

export async function POST(request: NextRequest, context: { params: Promise<{ pageId: string }> }) {
    return (retained.POST as any)(request, { ...context, params: await context.params });
}
