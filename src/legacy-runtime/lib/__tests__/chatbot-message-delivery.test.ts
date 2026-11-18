import { describe, expect, it, vi } from 'vitest';
import { allowsRequestedChatbotRepeat, finishChatbotMessage, hasRepeatedChatbotMessage, loadChatbotDeliveryHistory,
    mergeChatbotDeliveryHistory, normalizeChatbotMessage, reserveChatbotMessage } from '../chatbot-message-delivery';

describe('chatbot duplicate delivery protection', () => {
    it('normalizes emoji, punctuation, casing, and repeated whitespace', () => {
        expect(normalizeChatbotMessage(' HELLO, Sunrise! ❤️\nBakery ')).toBe('hello sunrise bakery');
        expect(hasRepeatedChatbotMessage(['Hello SUNRISE bakery! ✨'], ['Hello, Sunrise Bakery.'])).toBe(true);
    });
    it('detects duplicate content when message bubbles are regrouped', () => {
        expect(hasRepeatedChatbotMessage(['A bright jingle for your bakery.', 'Should it mention cakes?'],
            ['A bright jingle for your bakery. Should it mention cakes?'])).toBe(true);
        expect(hasRepeatedChatbotMessage(['A bright jingle for your bakery. Should it mention cakes?'],
            ['A bright jingle for your bakery.', 'Should it mention cakes?'])).toBe(true);
    });
    it('detects near-identical reminders but preserves an updated price or quantity', () => {
        expect(hasRepeatedChatbotMessage(['We can give your Sunrise Bakery jingle a bright upbeat opening.'],
            ['We can give your Sunrise Bakery jingle a bright upbeat introduction.'])).toBe(true);
        expect(hasRepeatedChatbotMessage(['The total for two songs is PHP450 with PHP150 deposit.'],
            ['The total for two songs is PHP500 with PHP150 deposit.'])).toBe(false);
        expect(hasRepeatedChatbotMessage(['We can focus the song on your wedding anniversary.'], ['The shop is based in Manila.'])).toBe(false);
        expect(hasRepeatedChatbotMessage(['We can make your Sunrise Bakery song with a female singer.'],
            ['We can make your Sunrise Bakery song with a male singer.'])).toBe(false);
    });
    it('detects an identical bubble twice within the same reply', () => {
        expect(hasRepeatedChatbotMessage(['May tagline po ba kayo?', 'May tagline po ba kayo?'], [])).toBe(true);
    });
    it('does not hide a repeated question behind a fresh introduction', () => {
        expect(hasRepeatedChatbotMessage(['A playful chorus can fit the bakery. May tagline po ba kayo?'],
            ['We can start with your shop name. May tagline po ba kayo?'])).toBe(true);
    });
    it('allows a requested resend or acknowledgment, never an automatic reminder exemption', () => {
        expect(allowsRequestedChatbotRepeat('Paki send form ulit')).toBe(true);
        expect(allowsRequestedChatbotRepeat('Magkano ulit?')).toBe(true);
        expect(allowsRequestedChatbotRepeat('Salamat po')).toBe(true);
        expect(allowsRequestedChatbotRepeat('Hello')).toBe(false);
    });
    it('uses a durable reservation before sending and respects duplicate rejection', async () => {
        const supabase = { from: vi.fn(), rpc: vi.fn().mockResolvedValue({ data: null, error: null }) };
        await expect(reserveChatbotMessage({ supabase, pageId: 'p', contactId: 'c', sourceKey: 'job:1', message: 'Hello! ❤️' })).resolves.toBeNull();
        expect(supabase.rpc).toHaveBeenCalledWith('reserve_chatbot_message', expect.objectContaining({
            p_page_id: 'p', p_contact_id: 'c', p_normalized_text: 'hello', p_source_key: 'job:1', p_allow_repeat: false, p_history_start_at: null
        }));
    });
    it('does not send when the delivery store is unavailable', async () => {
        const supabase = { from: vi.fn(), rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'offline' } }) };
        await expect(reserveChatbotMessage({ supabase, pageId: 'p', contactId: 'c', sourceKey: 'job:1', message: 'Hello' })).rejects.toThrow('Could not reserve');
        await expect(finishChatbotMessage({ supabase, deliveryId: 'd', messageId: 'mid' })).rejects.toThrow('Could not retain');
    });
    it('loads sent message memory within the current reset boundary and deduplicates fetched messages', async () => {
        const query: any = { select: vi.fn(() => query), eq: vi.fn(() => query), is: vi.fn(() => query), order: vi.fn(() => query),
            limit: vi.fn().mockResolvedValue({ data: [{ id: 'd', message_id: 'mid', message_text: 'A sent reminder.', sent_at: '2026-10-18T01:00:00Z' }], error: null }) };
        const delivered = await loadChatbotDeliveryHistory({ supabase: { from: () => query }, pageId: 'p', contactId: 'c', facebookPageId: 'fb', historyStartAt: '2026-10-18T00:00:00Z' });
        expect(query.eq).toHaveBeenCalledWith('history_start_at', '2026-10-18T00:00:00Z');
        expect(mergeChatbotDeliveryHistory(delivered, delivered)).toHaveLength(1);
        expect(delivered[0].from?.id).toBe('fb');
    });
});
