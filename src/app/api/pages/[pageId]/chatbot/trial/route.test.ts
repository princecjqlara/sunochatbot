import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    getSessionFromRequest: vi.fn(),
    userHasPageAccess: vi.fn(),
    getSupabaseAdmin: vi.fn()
}));

vi.mock('@/lib/get-session', () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock('@/lib/page-access', () => ({ userHasPageAccess: mocks.userHasPageAccess }));
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));

import { POST } from './route';

function contactBuilder() {
    const builder: Record<string, any> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.maybeSingle = vi.fn().mockResolvedValue({
        data: { id: 'contact_1', name: 'CJ Lara', psid: 'psid_1' },
        error: null
    });
    return builder;
}

function configBuilder() {
    const builder: Record<string, any> = {};
    builder.upsert = vi.fn(() => builder);
    builder.select = vi.fn(() => builder);
    builder.single = vi.fn().mockResolvedValue({
        data: {
            page_id: 'page_1',
            enabled: true,
            trial_mode_enabled: true,
            trial_contact_id: 'contact_1'
        },
        error: null
    });
    return builder;
}

describe('live Messenger chatbot trial controls', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getSessionFromRequest.mockResolvedValue({ user: { id: 'user_1' } });
        mocks.userHasPageAccess.mockResolvedValue(true);
    });

    it('enables the bot while restricting it to one verified Page contact', async () => {
        const contacts = contactBuilder();
        const configs = configBuilder();
        mocks.getSupabaseAdmin.mockReturnValue({
            from: vi.fn((table: string) => table === 'contacts' ? contacts : configs)
        });

        const response = await POST(new Request('http://localhost/api/pages/page_1/chatbot/trial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'configure', enabled: true, contact_id: 'contact_1' })
        }) as NextRequest, { params: Promise.resolve({ pageId: 'page_1' }) });

        expect(response.status).toBe(200);
        expect(configs.upsert).toHaveBeenCalledWith(expect.objectContaining({
            page_id: 'page_1',
            enabled: true,
            trial_mode_enabled: true,
            trial_contact_id: 'contact_1'
        }), { onConflict: 'page_id' });
        expect(await response.json()).toEqual(expect.objectContaining({
            success: true,
            config: expect.objectContaining({ trial_contact_id: 'contact_1' })
        }));
    });

    it('rejects users without Page access before reading contacts', async () => {
        mocks.userHasPageAccess.mockResolvedValue(false);

        const response = await POST(new Request('http://localhost/api/pages/page_1/chatbot/trial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'configure', enabled: true, contact_id: 'contact_1' })
        }) as NextRequest, { params: Promise.resolve({ pageId: 'page_1' }) });

        expect(response.status).toBe(403);
        expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
    });

    it.each([true, false, undefined])('resets only the selected contact with ignore history = %s', async (ignore) => {
        const contacts = contactBuilder();
        const pipeline: Record<string, any> = { error: null };
        pipeline.eq = vi.fn(() => pipeline);
        contacts.update = vi.fn(() => pipeline);
        const states = { upsert: vi.fn().mockResolvedValue({ error: null }) };
        const jobs: Record<string, any> = {};
        jobs.update = vi.fn(() => jobs);
        jobs.eq = vi.fn(() => jobs);
        jobs.in = vi.fn().mockResolvedValue({ error: null });
        const from = vi.fn((table: string) => table === 'contacts' ? contacts : table === 'chatbot_contact_states' ? states : jobs);
        mocks.getSupabaseAdmin.mockReturnValue({ from });
        const response = await POST(new Request('http://localhost/api/pages/page_1/chatbot/trial', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reset', contact_id: 'contact_1', ignore_past_conversation: ignore })
        }) as NextRequest, { params: Promise.resolve({ pageId: 'page_1' }) });
        expect(response.status).toBe(200);
        const payload = states.upsert.mock.calls[0][0];
        expect(payload).toMatchObject({ page_id: 'page_1', contact_id: 'contact_1', status: 'active',
            collected_details: {}, stop_reason: null, last_inbound_at: null, last_bot_reply_at: null });
        expect(payload.history_start_at).toBe(ignore === true ? payload.started_at : null);
        expect(Date.parse(payload.window_expires_at)).toBeGreaterThan(Date.parse(payload.started_at));
        expect(pipeline.eq).toHaveBeenCalledWith('page_id', 'page_1');
        expect(pipeline.eq).toHaveBeenCalledWith('id', 'contact_1');
        expect(jobs.eq).toHaveBeenCalledWith('page_id', 'page_1');
        expect(jobs.eq).toHaveBeenCalledWith('contact_id', 'contact_1');
        expect(jobs.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
        expect(from).not.toHaveBeenCalledWith('chatbot_configs');
        expect(await response.json()).toMatchObject({ ignore_past_conversation: ignore === true });
    });
});
