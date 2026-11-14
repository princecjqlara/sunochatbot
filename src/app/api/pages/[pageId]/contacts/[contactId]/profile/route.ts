import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { authorizeContactProfile } from '@/lib/contact-profile-access';
import { getContactProfile } from '@/lib/contact-profile-service';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest, { params }: { params: Promise<{ pageId: string; contactId: string }> }) {
    const scope = await authorizeContactProfile(request, params);
    if ('error' in scope) return scope.error;
    try {
        const profile = await getContactProfile(getSupabaseAdmin(), scope.pageId, scope.contactId, scope.actorId);
        return profile ? NextResponse.json(profile, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    } catch { return NextResponse.json({ error: 'Contact profile is temporarily unavailable' }, { status: 503 }); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ pageId: string; contactId: string }> }) {
    const scope = await authorizeContactProfile(request, params, true);
    if ('error' in scope) return scope.error;
    try {
        await request.json().catch(() => ({}));
        if (process.env.SUNO_CONTACT_PROFILE_MODE === 'remote') {
            const { error } = await getSupabaseAdmin().rpc('enqueue_contact_profile', {
                p_page_id: scope.pageId, p_contact_id: scope.contactId, p_reason: 'manual_refresh'
            });
            if (error) throw new Error('Could not queue the profile refresh');
            return NextResponse.json({ queued: true, mode: 'remote', message: 'Profile refresh queued. Saved corrections are retained.' }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
        }
        return NextResponse.json({ processed: 0, mode: 'local', message: 'Conversation analysis is performed from the local archive and published as profile data.' },
            { status: 202, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not refresh profile' }, { status: 503 }); }
}
