import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ conversation: vi.fn(), messages: vi.fn(), labels: vi.fn() }));
vi.mock('@/legacy-runtime/lib/facebook', () => ({
    getConversationForPsid: mocks.conversation, getConversationMessages: mocks.messages,
    getMessengerContactLabels: mocks.labels,
    FacebookGraphApiError: class FacebookGraphApiError extends Error {
        status: number; code?: number; subcode?: number; labelPagesRead?: number;
        constructor(message: string, options: {status: number; code?: number; subcode?: number}) {
            super(message); this.status = options.status; this.code = options.code; this.subcode = options.subcode;
        }
    }
}));
import { FacebookGraphApiError } from '@/legacy-runtime/lib/facebook';
import { getLiveChatbotLeadStage } from '@/legacy-runtime/lib/chatbot-lead-stage';

const input = { facebookPageId: 'page', psid: 'customer', accessToken: 'token' };
const message = (stage: string, from = 'page') => ({
    id: 'stage-event', message: `Lead stage set to ${stage}.`, from: { id: from },
    created_time: '2026-10-16T10:00:00Z'
});

describe('live Lead Center send guard', () => {
    afterEach(() => { vi.unstubAllEnvs(); });
    beforeEach(() => {
        vi.resetAllMocks(); vi.stubEnv('CHATBOT_LABEL_ACCESS_POLICY', 'strict');
        mocks.labels.mockResolvedValue([]);
    });

    it('blocks the real failure: current Qualified label with no stage message in history', async () => {
        mocks.labels.mockResolvedValue([{ id: 'label-qualified', page_label_name: 'Qualified' }]);
        mocks.conversation.mockResolvedValue({ messages: { data: [] } });
        expect(await getLiveChatbotLeadStage(input)).toBe('qualified');
        expect(mocks.labels).toHaveBeenCalledWith('customer', 'token', { timeoutMs: 5000 });
        expect(mocks.conversation).not.toHaveBeenCalled();
    });
    it('does not let a history reset bypass a current Qualified label', async () => {
        mocks.labels.mockResolvedValue([{ id: 'label-qualified', page_label_name: 'Qualified' }]);
        expect(await getLiveChatbotLeadStage({ ...input, historyStartAt: '2026-10-17T11:00:00Z' })).toBe('qualified');
    });
    it('reads current labels even when the caller provides cached conversation messages', async () => {
        mocks.labels.mockResolvedValue([{ id: 'label-qualified', page_label_name: 'Qualified' }]);
        expect(await getLiveChatbotLeadStage({ ...input, conversation: { id: 'thread', messages: { data: [] } } as any })).toBe('qualified');
    });
    it('does not interpret a label permission failure as Intake', async () => {
        mocks.labels.mockRejectedValue(new Error('Unsupported get request'));
        await expect(getLiveChatbotLeadStage(input)).rejects.toThrow('Unsupported get request');
        expect(mocks.conversation).not.toHaveBeenCalled();
    });
    function inaccessibleLabels(pagesRead = 0, code = 100, subcode = 33, status = 400) {
        const error = new FacebookGraphApiError('Unsupported get request', { status, code, subcode });
        error.labelPagesRead = pagesRead;
        return error;
    }
    const inbound = { id: 'inbound', from: { id: 'customer' }, created_time: '2026-10-17T10:00:00Z' };

    it('keeps strict verification as the default for the confirmed Graph failure', async () => {
        mocks.labels.mockRejectedValue(inaccessibleLabels());
        await expect(getLiveChatbotLeadStage(input)).rejects.toThrow('Unsupported get request');
    });
    it('allows operator-selected history fallback for an unreadable profile with verified customer history', async () => {
        vi.stubEnv('CHATBOT_LABEL_ACCESS_POLICY', 'history_fallback');
        mocks.labels.mockRejectedValue(inaccessibleLabels());
        mocks.conversation.mockResolvedValue({ id: 'thread', messages: { data: [inbound] } });
        expect(await getLiveChatbotLeadStage(input)).toBeNull();
    });
    it('keeps known non-Intake stages blocked during history fallback', async () => {
        vi.stubEnv('CHATBOT_LABEL_ACCESS_POLICY', 'history_fallback');
        mocks.labels.mockRejectedValue(inaccessibleLabels());
        mocks.conversation.mockResolvedValue({ id: 'thread', messages: { data: [inbound, message('Qualified')] } });
        expect(await getLiveChatbotLeadStage(input)).toBe('qualified');
    });
    it('does not allow a partial label read, reauthentication error or server error through fallback', async () => {
        vi.stubEnv('CHATBOT_LABEL_ACCESS_POLICY', 'history_fallback');
        for (const error of [inaccessibleLabels(1), inaccessibleLabels(0, 190), inaccessibleLabels(0, 100, 33, 500), new Error('timeout')]) {
            mocks.labels.mockRejectedValue(error);
            await expect(getLiveChatbotLeadStage(input)).rejects.toThrow();
        }
        expect(mocks.conversation).not.toHaveBeenCalled();
    });
    it.each([null, { id: 'thread', messages: { data: [] } },
        { id: 'thread', messages: { data: [{...inbound, from: {id: 'different-customer'}}] } },
    ])('rejects missing or unrelated customer history during fallback', async conversation => {
        vi.stubEnv('CHATBOT_LABEL_ACCESS_POLICY', 'history_fallback');
        mocks.labels.mockRejectedValue(inaccessibleLabels());
        mocks.conversation.mockResolvedValue(conversation);
        await expect(getLiveChatbotLeadStage(input)).rejects.toThrow('Could not verify contact history');
    });
    it('requires complete conversation pagination during fallback', async () => {
        vi.stubEnv('CHATBOT_LABEL_ACCESS_POLICY', 'history_fallback');
        mocks.labels.mockRejectedValue(inaccessibleLabels());
        mocks.conversation.mockResolvedValue({ id: 'thread', messages: { data: [inbound], paging: { next: 'older' } } });
        mocks.messages.mockRejectedValue(new Error('History incomplete'));
        await expect(getLiveChatbotLeadStage(input)).rejects.toThrow('History incomplete');
    });
    it('allows a verified Intake label and attribution labels', async () => {
        mocks.labels.mockResolvedValue([{ id: 'intake', page_label_name: 'Intake' },
            { id: 'ad', page_label_name: 'ad_id.123' }, { id: 'source', page_label_name: 'Ad response' }]);
        mocks.conversation.mockResolvedValue({ messages: { data: [] } });
        expect(await getLiveChatbotLeadStage(input)).toBeNull();
    });

    it.each([
        ['Qualified', 'qualified'], ['Converted', 'converted'],
        ['Not Qualified', 'not_qualified'], ['Disqualified', 'not_qualified'],
        ['Order Created', 'order_created'], ['Contacted', 'manual'], ['Interested', 'manual'],
        ['In Progress', 'manual'], ['Custom lead stage', 'manual']
    ])('stops for %s without waiting for the background sync', async (stage, expected) => {
        mocks.conversation.mockResolvedValue({ messages: { data: [message(stage)] } });
        expect(await getLiveChatbotLeadStage(input)).toBe(expected);
    });

    it('does not treat customer prose as a stage change', async () => {
        mocks.conversation.mockResolvedValue({ messages: { data: [message('Converted', 'customer')] } });
        expect(await getLiveChatbotLeadStage(input)).toBeNull();
    });
    it('allows Intake without treating older qualified stages as current', async () => {
        const initialPage = { data: [{ ...message('Intake'), created_time: '2026-10-17T10:00:00Z' }], paging: { next: 'older' } };
        mocks.conversation.mockResolvedValue({ id: 'thread', messages: initialPage });
        mocks.messages.mockResolvedValue([...initialPage.data, message('Qualified')]);
        expect(await getLiveChatbotLeadStage(input)).toBeNull();
    });
    it('rejects an invalid reset cutoff instead of hiding all stage events', async () => {
        await expect(getLiveChatbotLeadStage({ ...input, historyStartAt: 'invalid' })).rejects.toThrow('invalid conversation reset time');
    });

    it('keeps explicit trial resets authoritative', async () => {
        mocks.conversation.mockResolvedValue({ messages: { data: [message('Converted')] } });
        expect(await getLiveChatbotLeadStage({ ...input, historyStartAt: '2026-10-16T11:00:00Z' })).toBeNull();
    });

    it('finds a closed stage beyond the embedded message page', async () => {
        const initialPage = { data: [], paging: { next: 'next-page' } };
        mocks.conversation.mockResolvedValue({ id: 'thread', messages: initialPage });
        mocks.messages.mockResolvedValue([message('Not Qualified')]);
        expect(await getLiveChatbotLeadStage(input)).toBe('not_qualified');
        expect(mocks.messages).toHaveBeenCalledWith('thread', 'token', 2000,
            { initialPage, throwOnError: true, requireComplete: true, timeoutMs: 5000 });
    });

    it('propagates incomplete audits so callers cannot send', async () => {
        mocks.conversation.mockResolvedValue({ id: 'thread', messages: { data: [], paging: { next: 'next-page' } } });
        mocks.messages.mockRejectedValue(new Error('Audit unavailable'));
        await expect(getLiveChatbotLeadStage(input)).rejects.toThrow('Audit unavailable');
    });
});
