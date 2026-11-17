import { describe, expect, it, vi } from 'vitest';
import { claimChatbotReply } from '../chatbot-replies';

const input = { inboundMessageId: 'mid.1', pageId: 'page_1', contactId: 'contact_1' };
function mockDatabase(previous: Record<string, unknown> | null, reclaimCount = 1) {
    const read: any = { eq: vi.fn(() => read), maybeSingle: vi.fn().mockResolvedValue({ data: previous, error: null }) };
    const update: any = { eq: vi.fn(() => update), is: vi.fn(() => update),
        select: vi.fn().mockResolvedValue({ data: Array.from({ length: reclaimCount }, () => ({ inbound_message_id: 'mid.1' })), error: null }) };
    const table = { insert: vi.fn().mockResolvedValue({ error: { code: '23505' } }),
        select: vi.fn(() => read), update: vi.fn(() => update) };
    return { from: vi.fn(() => table), table, update };
}
const rejected = { status: 'failed', error_message: '(#2) Service temporarily unavailable',
    outbound_message_id: null, updated_at: '2026-10-17T03:00:00Z' };

describe('claimChatbotReply', () => {
    it('claims a new inbound message without reading old events', async () => {
        const db = mockDatabase(null);
        db.table.insert.mockResolvedValueOnce({ error: null });
        expect(await claimChatbotReply(db, input)).toBe(true);
        expect(db.table.select).not.toHaveBeenCalled();
    });
    it('atomically reclaims a rejected temporary failure', async () => {
        const db = mockDatabase(rejected);
        expect(await claimChatbotReply(db, input)).toBe(true);
        expect(db.update.eq).toHaveBeenCalledWith('status', 'failed');
        expect(db.update.eq).toHaveBeenCalledWith('updated_at', rejected.updated_at);
        expect(db.update.is).toHaveBeenCalledWith('outbound_message_id', null);
    });
    it('reclaims a recorded failure that happened before any send was attempted', async () => {
        const db = mockDatabase({ ...rejected, error_message: 'Retryable before delivery: Temporary database failure' });
        expect(await claimChatbotReply(db, input)).toBe(true);
    });

    it('does not claim a retry after another worker wins', async () => {
        expect(await claimChatbotReply(mockDatabase(rejected, 0), input)).toBe(false);
    });
    it.each([
        { ...rejected, status: 'sent' },
        { ...rejected, status: 'processing' },
        { ...rejected, outbound_message_id: 'already-delivered' },
        { ...rejected, error_message: 'Facebook send timed out after 10 seconds' },
        { ...rejected, error_message: '(#10) Outside allowed window' },
        { ...rejected, error_message: 'Repetitive reply suppressed; collected answers retained' }
    ])('does not replay delivered, ambiguous or intentional failures: $status / $error_message', async previous => {
        const db = mockDatabase(previous);
        expect(await claimChatbotReply(db, input)).toBe(false);
        expect(db.table.update).not.toHaveBeenCalled();
    });
});
