import { describe, expect, it } from 'vitest';
import { getChatbotInboundInquiry } from '../chatbot-inbound';
const context = { facebookPageId: 'page', senderId: 'customer' };

describe('customer inquiry normalization', () => {
    it('preserves a text inquiry and its provider message id', () => {
        expect(getChatbotInboundInquiry({ message: { mid: 'mid.1', text: ' How much? ' } }, context))
            .toEqual({ id: 'mid.1', text: 'How much?' });
    });
    it('accepts button clicks with stable deduplication across redelivery', () => {
        const event = { timestamp: 123456789, postback: { title: 'How much?', payload: 'PRICE' } };
        const first = getChatbotInboundInquiry(event, context);
        expect(first?.text).toBe('How much?');
        expect(first?.id).toBe(getChatbotInboundInquiry(event, context)?.id);
        expect(first?.id).not.toBe(getChatbotInboundInquiry({ ...event, timestamp: 123456790 }, context)?.id);
        expect(first?.id).not.toBe(getChatbotInboundInquiry(event, { ...context, senderId: 'other' })?.id);
    });
    it('uses a provider postback mid when available', () => {
        expect(getChatbotInboundInquiry({ postback: { mid: 'mid.button', title: 'Talk to sales' } }, context)?.id).toBe('mid.button');
    });
    it('uses the original entry time when a postback has no event time', () => {
        expect(getChatbotInboundInquiry({ postback: { payload: 'GET_STARTED' } }, { ...context, entryTimestamp: 123 })?.text)
            .toBe('I would like to make an inquiry.');
    });
    it.each(['audio', 'video', 'file'])('handles %s without inventing its contents', type => {
        const result = getChatbotInboundInquiry({ message: { mid: 'mid.media', attachments: [{ type }] } }, context);
        expect(result?.text).toContain(type);
        expect(result?.text).toContain('Do not infer their contents');
    });
    it('keeps a media caption and separates the unavailable-content notice', () => {
        const result = getChatbotInboundInquiry({ message: { mid: 'mid.media', text: 'Can you help?', attachments: [{ type: 'video' }] } }, context);
        expect(result?.text).toContain('Can you help?\n[Customer sent');
    });
    it('leaves an accessible image available for image analysis', () => {
        expect(getChatbotInboundInquiry({ message: { mid: 'mid.image', attachments: [{ type: 'image', payload: { url: 'https://example.test/photo.jpg' } }] } }, context))
            .toEqual({ id: 'mid.image', text: '' });
    });
    it('acknowledges an inaccessible image instead of discarding it', () => {
        expect(getChatbotInboundInquiry({ message: { mid: 'mid.image', attachments: [{ type: 'image' }] } }, context)?.text).toContain('image');
    });
    it('recognizes a sticker-only greeting', () => {
        expect(getChatbotInboundInquiry({ message: { mid: 'mid.sticker', sticker_id: '123' } }, context)?.text).toContain('sticker');
    });
    it.each([{}, { timestamp: 123 }, { message: { mid: 'empty', text: ' ' } },
        { message: { mid: 'echo', text: 'hello', is_echo: true } },
        { postback: { title: 'No original timestamp or id' } }])('ignores non-inquiries or events without a stable identity', event => {
        expect(getChatbotInboundInquiry(event, context)).toBeNull();
    });
});
