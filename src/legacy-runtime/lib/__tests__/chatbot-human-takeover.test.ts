import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ conversation: vi.fn(), messages: vi.fn(), labels: vi.fn(), assess: vi.fn(), schedule: vi.fn() }));
vi.mock('@/legacy-runtime/lib/facebook', () => ({ getConversationForPsid: mocks.conversation, getConversationMessages: mocks.messages,
    getMessengerContactLabels: mocks.labels }));
vi.mock('@/legacy-runtime/lib/chatbot', () => ({ assessChatbotPurchaseIntent: mocks.assess }));
vi.mock('@/legacy-runtime/lib/chatbot-follow-ups', () => ({
    scheduleChatbotFollowUps: mocks.schedule, normalizeQuickFollowUpDelays: () => [30, 90]
}));

import { getExplicitSongOrderIntent, getHumanTakeoverResumeAt, isChatbotHumanPaused,
    pauseChatbotForHumanTakeover, processDueHumanTakeovers } from '../chatbot-human-takeover';

const customerMessage = (message: string) => ({ id: 'inquiry', message, from: { id: 'customer', name: 'Customer' },
    created_time: '2026-10-17T06:00:00Z' });

describe('human takeover rules', () => {
    it.each([
        ['2026-10-17T05:00:00Z', '2026-10-17T15:59:00.000Z'],
        ['2026-10-17T15:58:59Z', '2026-10-17T15:59:00.000Z'],
        ['2026-10-17T15:59:00Z', '2026-10-18T15:59:00.000Z'],
        ['2026-10-17T17:00:00Z', '2026-10-18T15:59:00.000Z'],
        ['2026-12-31T15:59:30Z', '2027-01-01T15:59:00.000Z']
    ])('calculates 11:59 PM PH after takeover at %s', (at, expected) => {
        expect(getHumanTakeoverResumeAt(new Date(at))).toBe(expected);
    });
    it.each(['paused', 'checking', 'held'])('keeps %s handoffs silent', status => {
        expect(isChatbotHumanPaused({ human_pause_status: status })).toBe(true);
    });
    it('requires the reviewed release status rather than only elapsed time', () => {
        expect(isChatbotHumanPaused({ human_pause_status: 'paused', human_resume_at: '2020-01-01T00:00:00Z' })).toBe(true);
        expect(isChatbotHumanPaused({ human_pause_status: 'released' })).toBe(false);
    });
    it.each(['Payment sent', 'Nakabayad na po', 'Bayad na', 'Ready to order', 'Proceed na po', 'Gusto ko magpagawa ng kanta'])('keeps clear order intent with a human: %s', text => {
        expect(getExplicitSongOrderIntent([customerMessage(text)], 'page')).not.toBeNull();
    });
    it.each(['Magkano po?', 'Can I see samples?', 'Gusto ko female vocals', 'Ayoko magpagawa'])('does not invent clear intent: %s', text => {
        expect(getExplicitSongOrderIntent([customerMessage(text)], 'page')).toBeNull();
    });
    it('persists the human message and its price without relying on an in-memory timer', async () => {
        const rpc = vi.fn().mockResolvedValue({ error: null });
        await pauseChatbotForHumanTakeover({ from: vi.fn(), rpc }, { pageId: 'p', contactId: 'c',
            messageId: 'human.1', messageText: 'PHP 450 total', takenOverAt: '2026-10-17T05:00:00Z' });
        expect(rpc).toHaveBeenCalledWith('record_chatbot_human_takeover', {
            p_page_id: 'p', p_contact_id: 'c', p_message_id: 'human.1',
            p_taken_over_at: '2026-10-17T05:00:00.000Z', p_resume_at: '2026-10-17T15:59:00.000Z', p_price_quote: 'PHP 450 total'
        });
    });
});

function database() {
    const tables: Record<string, any[]> = {
        chatbot_contact_states: [{ page_id: 'p', contact_id: 'c', human_pause_status: 'paused',
            human_message_id: 'human.1', human_takeover_at: '2026-10-17T05:00:00.000Z',
            human_resume_at: '2026-10-17T15:59:00.000Z', status: 'active', collected_details: {},
            updated_at: '2026-10-17T05:00:00.000Z' }],
        contacts: [{ id: 'c', page_id: 'p', psid: 'customer', pipeline_stage: 'engaged',
            last_inbound_at: '2026-10-17T06:00:00.000Z' }],
        chatbot_configs: [{ page_id: 'p', enabled: true, follow_up_enabled: true,
            details_to_collect: ['Business', 'Genre'], details_completion_percent: 100,
            follow_up_quick_delays_minutes: [30, 90], follow_up_best_time_days: [] }],
        pages: [{ id: 'p', fb_page_id: 'page', access_token: 'test-token' }],
        chatbot_follow_up_jobs: []
    };
    const from = vi.fn((table: string) => {
        const filters: Array<(row: any) => boolean> = [];
        let changes: any = null, upsert: any = null, cap = Infinity;
        const run = async () => {
            const matching = tables[table].filter(row => filters.every(f => f(row))).slice(0, cap);
            if (changes) matching.forEach(row => Object.assign(row, changes));
            if (upsert) tables[table].push(structuredClone(upsert));
            return { data: structuredClone(matching), error: null };
        };
        const q: any = {
            select: () => q, order: () => q, limit: (n: number) => { cap = n; return q; },
            eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return q; },
            lt: (key: string, value: string) => { filters.push(row => row[key] < value); return q; },
            lte: (key: string, value: string) => { filters.push(row => row[key] <= value); return q; },
            update: (value: any) => { changes = value; return q; },
            upsert: (value: any) => { upsert = value; return q; },
            maybeSingle: async () => { const r = await run(); return { ...r, data: r.data[0] || null }; },
            then: (resolve: any, reject: any) => run().then(resolve, reject)
        };
        return q;
    });
    return { from, tables };
}

describe('11:59 PM human takeover review', () => {
    const now = new Date('2026-10-17T15:59:00.000Z');
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.labels.mockReset().mockResolvedValue([]);
        mocks.conversation.mockResolvedValue({ messages: { data: [customerMessage('How much is a song?')] } });
        mocks.assess.mockResolvedValue({ hold: false, reason: 'Only asked for information' });
        mocks.schedule.mockResolvedValue(0);
    });
    it('releases unclear leads at the PH deadline and preserves the real inbound messaging-window anchor', async () => {
        const db = database();
        const r = await processDueHumanTakeovers({ supabase: db, now });
        expect(r).toMatchObject({ released: 1, held: 0, scheduled: 1 });
        expect(db.tables.chatbot_contact_states[0].human_pause_status).toBe('released');
        expect(db.tables.chatbot_follow_up_jobs[0]).toMatchObject({
            anchor_inbound_at: '2026-10-17T06:00:00.000Z', schedule_type: 'response', due_at: now.toISOString()
        });
        expect((await processDueHumanTakeovers({ supabase: db, now })).checked).toBe(0);
    });
    it('does not resume before 11:59 PM PH', async () => {
        const db = database();
        expect((await processDueHumanTakeovers({ supabase: db, now: new Date('2026-10-17T15:58:59Z') })).checked).toBe(0);
        expect(mocks.assess).not.toHaveBeenCalled();
    });
    it('leaves remaining handoffs due when provider delays consume the worker budget', async () => {
        const db = database();
        db.tables.chatbot_contact_states.push({ ...db.tables.chatbot_contact_states[0], contact_id: 'next-contact' });
        let elapsed = 0;
        const clock = vi.spyOn(Date, 'now').mockImplementation(() => elapsed);
        mocks.assess.mockImplementation(async () => { elapsed = 60_001; return { hold: false, reason: 'Only information' }; });
        try {
            expect((await processDueHumanTakeovers({ supabase: db, now })).checked).toBe(1);
            expect(db.tables.chatbot_contact_states[1].human_pause_status).toBe('paused');
        } finally { clock.mockRestore(); }
    });
    it.each(['qualified', 'order_created', 'converted', 'opted_out', 'not_qualified'])('keeps %s contacts with the human', async stage => {
        const db = database(); db.tables.contacts[0].pipeline_stage = stage;
        expect((await processDueHumanTakeovers({ supabase: db, now })).held).toBe(1);
        expect(db.tables.chatbot_follow_up_jobs).toHaveLength(0);
        expect(mocks.assess).not.toHaveBeenCalled();
    });
    it.each(['Qualified', 'Contacted', 'Interested', 'Custom stage'])('keeps non-Intake Facebook stage %s with the human', async stage => {
        const db = database();
        mocks.conversation.mockResolvedValue({ messages: { data: [{ id: 'stage', from: { id: 'page' },
            message: `Lead stage set to ${stage}`, created_time: '2026-10-17T06:00:00Z' }] } });
        expect((await processDueHumanTakeovers({ supabase: db, now })).held).toBe(1);
        expect(mocks.assess).not.toHaveBeenCalled();
        expect(db.tables.chatbot_follow_up_jobs).toHaveLength(0);
    });
    it('finds a non-Intake stage beyond the first page before releasing a handoff', async () => {
        const db = database();
        mocks.conversation.mockResolvedValue({ id: 'thread', messages: { data: [customerMessage('How much?')], paging: { next: 'older' } } });
        mocks.messages.mockResolvedValue([{ id: 'stage', from: { id: 'page' },
            message: 'Lead stage set to Contacted', created_time: '2026-10-16T06:00:00Z' }]);
        expect((await processDueHumanTakeovers({ supabase: db, now })).held).toBe(1);
        expect(mocks.assess).not.toHaveBeenCalled();
    });
    it('does not release a handoff when the stage changes during the intent assessment', async () => {
        const db = database();
        mocks.assess.mockImplementation(async () => {
            mocks.conversation.mockResolvedValue({ messages: { data: [{ id: 'stage', from: { id: 'page' },
                message: 'Lead stage set to Interested', created_time: '2026-10-17T15:59:01Z' }] } });
            return { hold: false, reason: 'Only information' };
        });
        expect((await processDueHumanTakeovers({ supabase: db, now })).held).toBe(1);
        expect(db.tables.chatbot_follow_up_jobs).toHaveLength(0);
    });
    it('keeps explicit payment with the human even if the AI assessment would be unclear', async () => {
        const db = database(); mocks.conversation.mockResolvedValue({ messages: { data: [customerMessage('Payment sent')] } });
        expect((await processDueHumanTakeovers({ supabase: db, now })).held).toBe(1);
        expect(mocks.assess).not.toHaveBeenCalled();
    });
    it('never releases a human hold when current labels show Qualified without a history event', async () => {
        const db = database();
        mocks.labels.mockResolvedValue([{ id: 'q', page_label_name: 'Qualified' }]);
        expect((await processDueHumanTakeovers({ supabase: db, now })).held).toBe(1);
        expect(mocks.assess).not.toHaveBeenCalled();
        expect(db.tables.chatbot_follow_up_jobs).toHaveLength(0);
    });
    it('never releases a hold when the label audit is denied', async () => {
        const db = database();
        mocks.labels.mockRejectedValue(new Error('Label access denied'));
        expect((await processDueHumanTakeovers({ supabase: db, now })).failed).toBe(1);
        expect(db.tables.chatbot_contact_states[0].human_pause_status).toBe('held');
        expect(db.tables.chatbot_follow_up_jobs).toHaveLength(0);
    });
    it('keeps contextual clear intent with the human', async () => {
        const db = database(); mocks.assess.mockResolvedValue({ hold: true, reason: 'Customer accepted the team offer' });
        expect((await processDueHumanTakeovers({ supabase: db, now })).held).toBe(1);
    });
    it('does not reopen a new takeover that arrives while the previous one is being reviewed', async () => {
        const db = database();
        mocks.assess.mockImplementation(async () => {
            Object.assign(db.tables.chatbot_contact_states[0], { human_message_id: 'human.2', human_pause_status: 'paused',
                human_resume_at: '2026-10-18T15:59:00.000Z' });
            return { hold: false, reason: 'unclear' };
        });
        expect((await processDueHumanTakeovers({ supabase: db, now })).released).toBe(0);
        expect(db.tables.chatbot_contact_states[0].human_message_id).toBe('human.2');
        expect(db.tables.chatbot_follow_up_jobs).toHaveLength(0);
    });
    it('keeps the human in control when the conversation or intent review fails', async () => {
        const db = database(); mocks.assess.mockRejectedValue(new Error('Provider unavailable'));
        expect((await processDueHumanTakeovers({ supabase: db, now })).failed).toBe(1);
        expect(db.tables.chatbot_contact_states[0].human_pause_status).toBe('held');
        expect(db.tables.chatbot_follow_up_jobs).toHaveLength(0);
    });
    it('does not manufacture a fresh 24-hour window at midnight', async () => {
        const db = database(); db.tables.contacts[0].last_inbound_at = '2026-10-15T06:00:00.000Z';
        expect((await processDueHumanTakeovers({ supabase: db, now })).released).toBe(1);
        expect(db.tables.chatbot_follow_up_jobs).toHaveLength(0);
    });
    it('does not re-send a reminder already delivered earlier', async () => {
        const db = database(); db.tables.chatbot_follow_up_jobs = [0, 1].map(sequence_index => ({ page_id: 'p', contact_id: 'c', anchor_inbound_at: '2026-10-17T06:00:00.000Z', schedule_type: 'response', sequence_index, status: 'sent' }));
        expect((await processDueHumanTakeovers({ supabase: db, now })).scheduled).toBe(0);
        expect(db.tables.chatbot_follow_up_jobs).toHaveLength(2);
    });
});
