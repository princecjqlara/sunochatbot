import { describe, expect, it, vi } from 'vitest';
import {
    CHATBOT_CONVERSATION_WINDOW_MS,
    classifyChatbotStopIntent,
    filterChatbotConversationHistory,
    getRequiredChatbotDetailCount,
    hasReachedChatbotDetailTarget,
    getChatbotStateStopReason,
    getMissingChatbotDetails,
    isChatbotContactAllowed,
    normalizeDetailsToCollect,
    saveChatbotContactState,
    type ChatbotContactState
} from '@/lib/chatbot-control';

describe('chatbot conversation controls', () => {
    it('requires six canonical answers at 26 percent and ignores unrelated or empty fields', () => {
        const config = { details_to_collect: Array.from({ length: 20 }, (_, i) => `Field ${i}`), details_completion_percent: 26 };
        const answers = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`Field ${i}`, 'answered']));
        expect(hasReachedChatbotDetailTarget(config, { ...answers, Unknown: 'not required', 'Field 5': ' ' })).toBe(false);
        expect(hasReachedChatbotDetailTarget(config, { ...answers, 'field 5': 'answered' })).toBe(true);
        expect(hasReachedChatbotDetailTarget({ details_to_collect: [] }, answers)).toBe(false);
    });
    it('uses only post-reset messages, including the boundary, and retains ordering', () => {
        const cutoff = '2026-10-07T02:00:00.000Z';
        const history = [
            { id: 'newest', created_time: '2026-10-07T02:01:00Z' },
            { id: 'boundary', created_time: cutoff },
            { id: 'old', created_time: '2026-10-07T01:59:59Z' },
            { id: 'unknown-time' },
            { id: 'bad-time', created_time: 'invalid' }
        ];
        expect(filterChatbotConversationHistory(history, cutoff).map(message => message.id)).toEqual(['newest', 'boundary']);
        expect(filterChatbotConversationHistory(history, null)).toBe(history);
        expect(filterChatbotConversationHistory(history, 'invalid')).toEqual([]);
    });

    it('preserves the history cutoff when saving subsequent details and stop state', async () => {
        const cutoff = '2026-10-07T02:00:00.000Z';
        const upsert = vi.fn().mockResolvedValue({ error: null });
        await saveChatbotContactState({ from: () => ({ upsert }) }, {
            pageId: 'page-1', contactId: 'contact-1',
            existingState: { page_id: 'page-1', contact_id: 'contact-1', status: 'active', started_at: cutoff,
                window_expires_at: '2026-10-14T02:00:00Z', collected_details: {}, missing_details: [],
                stop_reason: null, stopped_at: null, last_inbound_at: null, last_bot_reply_at: null, history_start_at: cutoff },
            collectedDetails: { 'Business name': 'New Bakery' }, stopReason: 'qualified',
            now: new Date('2026-10-07T03:00:00Z')
        });
        expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ history_start_at: cutoff,
            collected_details: { 'Business name': 'New Bakery' }, stop_reason: 'qualified' }), { onConflict: 'page_id,contact_id' });
    });

    it('limits live trial mode to the selected contact', () => {
        expect(isChatbotContactAllowed(undefined, 'contact_1')).toBe(true);
        expect(isChatbotContactAllowed({ trial_mode_enabled: false, trial_contact_id: null }, 'contact_1')).toBe(true);
        expect(isChatbotContactAllowed({ trial_mode_enabled: true, trial_contact_id: 'contact_1' }, 'contact_1')).toBe(true);
        expect(isChatbotContactAllowed({ trial_mode_enabled: true, trial_contact_id: 'contact_1' }, 'contact_2')).toBe(false);
        expect(isChatbotContactAllowed({ trial_mode_enabled: true, trial_contact_id: null }, 'contact_1')).toBe(false);
    });

    it('rounds percentage detail targets up to a whole required field', () => {
        expect(getRequiredChatbotDetailCount(5, 40)).toBe(2);
        expect(getRequiredChatbotDetailCount(3, 40)).toBe(2);
        expect(getRequiredChatbotDetailCount(5, 100)).toBe(5);
        expect(getRequiredChatbotDetailCount(0, 40)).toBe(0);
    });

    it('normalizes unique detail names and reports only missing values', () => {
        const requested = normalizeDetailsToCollect([' Full name ', 'Mobile number', 'full name', '']);
        expect(requested).toEqual(['Full name', 'Mobile number']);
        expect(getMissingChatbotDetails(requested, { 'Full name': 'CJ Lara' }))
            .toEqual(['Mobile number']);
    });

    it('detects explicit opt-outs before softer sales refusals', () => {
        expect(classifyChatbotStopIntent('Please stop messaging me', {
            stopOnOptOut: true,
            stopOnRefusal: true
        })).toBe('opt_out');
        expect(classifyChatbotStopIntent('No thanks, not interested', {
            stopOnOptOut: true,
            stopOnRefusal: true
        })).toBe('refusal');
        expect(classifyChatbotStopIntent('No thanks, not interested', {
            stopOnOptOut: true,
            stopOnRefusal: false
        })).toBeNull();
    });

    it.each([
        'Non-stop upbeat pop ang gusto kong genre.',
        'Stop using male vocals, change to female.',
        "Don't stop messaging me, I still want the song.",
        'Please pass the lyrics to your producer.'
    ])('does not mistake song edits or continued interest for an opt-out: %s', text => {
        expect(classifyChatbotStopIntent(text, { stopOnOptOut: true, stopOnRefusal: true })).toBeNull();
    });

    it.each(['STOP', 'Stop po!', 'Please stop messaging me.', 'Stop sending messages please.'])('still respects an explicit opt-out: %s', text => {
        expect(classifyChatbotStopIntent(text, { stopOnOptOut: true, stopOnRefusal: true })).toBe('opt_out');
    });

    it.each([
        'Ayoko ng male vocals, gusto ko female.',
        'Pass muna sa two songs package, isang kanta lang gusto ko.',
        "I don't want that style, prefer upbeat instead."
    ])('keeps an option change active: %s', text => {
        expect(classifyChatbotStopIntent(text, { stopOnOptOut: true, stopOnRefusal: true })).toBeNull();
    });

    it('keeps explicit opt-outs and purchase refusals durable even when a style is mentioned', () => {
        expect(classifyChatbotStopIntent('Stop messaging, ayoko ng male vocals, prefer female.', { stopOnOptOut: true, stopOnRefusal: true })).toBe('opt_out');
        expect(classifyChatbotStopIntent('Not interested in this package, prefer not buying.', { stopOnOptOut: true, stopOnRefusal: true })).toBe('refusal');
        expect(classifyChatbotStopIntent('Ayoko ng male vocals, prefer female. No thanks, cancel.', { stopOnOptOut: true, stopOnRefusal: true })).toBe('refusal');
    });

    it.each([
        'Wag na po isingit yung oras at petsa yun na kasi ang pangaraw araw na gagamitin',
        'Huwag na po isama ang pangalan ko sa lyrics.',
        'Wag na banggitin ang address.'
    ])('keeps song content omissions active: %s', text => {
        expect(classifyChatbotStopIntent(text, { stopOnOptOut: true, stopOnRefusal: true })).toBeNull();
    });

    it('preserves cancellations and opt-outs alongside content omission requests', () => {
        expect(classifyChatbotStopIntent('Wag na po isama ang pangalan ko. Di ko na itutuloy.', { stopOnOptOut: true, stopOnRefusal: true })).toBe('refusal');
        expect(classifyChatbotStopIntent('Wag na po isingit ang date, not interested anymore.', { stopOnOptOut: true, stopOnRefusal: true })).toBe('refusal');
        expect(classifyChatbotStopIntent('Wag na isama ang pangalan. No thanks.', { stopOnOptOut: true, stopOnRefusal: true })).toBe('refusal');
        expect(classifyChatbotStopIntent('Wag na isama ang pangalan ko. Stop messaging me.', { stopOnOptOut: true, stopOnRefusal: true })).toBe('opt_out');
        expect(classifyChatbotStopIntent('Wag na po', { stopOnOptOut: true, stopOnRefusal: true })).toBe('refusal');
        expect(classifyChatbotStopIntent('Wag nlng po di q na po itutuloy.', { stopOnOptOut: true, stopOnRefusal: true })).toBe('refusal');
    });

    it('stops an active bot state when its fixed seven-day lifecycle expires', () => {
        const startedAt = new Date('2026-09-01T00:00:00Z');
        const state: ChatbotContactState = {
            page_id: 'page-1',
            contact_id: 'contact-1',
            status: 'active',
            started_at: startedAt.toISOString(),
            window_expires_at: new Date(startedAt.getTime() + CHATBOT_CONVERSATION_WINDOW_MS).toISOString(),
            collected_details: {},
            missing_details: [],
            stop_reason: null,
            stopped_at: null,
            last_inbound_at: null,
            last_bot_reply_at: null
        };

        expect(getChatbotStateStopReason(state, new Date('2026-09-07T23:59:00Z'))).toBeNull();
        expect(getChatbotStateStopReason(state, new Date('2026-09-08T00:00:00Z'))).toBe('window_expired');
    });
});
