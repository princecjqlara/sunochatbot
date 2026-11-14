import { createHash } from 'node:crypto';

type InboundEvent = {
    timestamp?: unknown;
    message?: {
        mid?: unknown;
        text?: unknown;
        is_echo?: unknown;
        sticker_id?: unknown;
        attachments?: Array<{ type?: unknown; payload?: { url?: unknown } }>;
    };
    postback?: { mid?: unknown; title?: unknown; payload?: unknown };
};

/** Normalize customer actions without turning receipts, reads or echoes into inquiries. */
export function getChatbotInboundInquiry(
    event: InboundEvent,
    context: { facebookPageId: string; senderId: string; entryTimestamp?: unknown }
): { id: string; text: string } | null {
    if (event.message?.is_echo || (!event.message && !event.postback)) return null;
    const kind = event.message ? 'message' : 'postback';
    const value = (item: unknown) => typeof item === 'string' ? item.trim() : '';
    let text = value(event.message?.text);
    if (event.postback && !event.message) {
        text = value(event.postback.title) || value(event.postback.payload);
        if (!text || /^GET_STARTED$/i.test(text)) text = 'I would like to make an inquiry.';
    } else {
        const unavailableTypes = [...new Set((event.message?.attachments || [])
            .filter(a => a.type !== 'image' || !value(a.payload?.url))
            .map(a => value(a.type) || 'file'))];
        if (unavailableTypes.length) {
            text = [text, '[Customer sent ' + unavailableTypes.join(', ') + ' attachment(s). Their contents are unavailable. Do not infer their contents; ask the customer to describe what they need help with.]'].filter(Boolean).join('\n');
        } else if (!text && event.message?.sticker_id) {
            text = 'Customer sent a sticker.';
        }
    }
    const hasImages = event.message?.attachments?.some(a => a.type === 'image' && value(a.payload?.url));
    if (!text && !hasImages) return null;
    let id = value(event.message?.mid) || value(event.postback?.mid);
    if (!id) {
        // Postbacks often have no mid. The original timestamp makes redelivery
        // idempotent while allowing the same button to be clicked again later.
        const rawTimestamp = event.timestamp ?? context.entryTimestamp;
        const numericTime = typeof rawTimestamp === 'number' || typeof rawTimestamp === 'string'
            ? Number(rawTimestamp) : NaN;
        const timestamp = Number.isFinite(numericTime) ? numericTime : Date.parse(value(rawTimestamp));
        if (!Number.isFinite(timestamp)) return null;
        const digest = createHash('sha256').update(JSON.stringify({ text, message: event.message, postback: event.postback })).digest('hex');
        id = kind + ':' + context.facebookPageId + ':' + context.senderId + ':' + timestamp + ':' + digest;
    }
    return { id, text };
}
