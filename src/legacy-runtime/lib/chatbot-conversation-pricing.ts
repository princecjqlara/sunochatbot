import type { FacebookMessage } from '@/legacy-runtime/types';

export type ConversationPriceQuote = { text: string; quotedAt: string; messageId?: string };
type SupabaseLike = { from: (table: string) => any; rpc?: (name: string, args: Record<string, unknown>) => any };

export function hasConversationPrice(text: string): boolean {
    if (/(?:PHP|₱|\bP(?:hp)?\.?)\s*\d[\d,.]*|\b\d[\d,.]*\s*(?:pesos?|php)\b/i.test(text)) return true;
    // Common staff updates omit currency. Require a price or scope cue to
    // distinguish an amount from song counts, addresses and phone numbers.
    return /\b(?:price|presyo|total|rate|cost)\s*(?:is|po|na|:|=|-)?\s*\b[1-9]\d{1,5}(?:[.,]\d{1,2})?\b/i.test(text) ||
        /\b[1-9]\d{1,5}(?:[.,]\d{1,2})?\b\s*(?:na\s*lang|nalang|total|each|per\s+(?:song|kanta)|\/\s*(?:song|kanta)|for\s+(?:(?:one|two|\d+)\s*)?(?:songs?|kanta))/i.test(text) ||
        /\b(?:songs?|kanta)\s*(?:for|=)\s*\b[1-9]\d{1,5}(?:[.,]\d{1,2})?\b/i.test(text);
}

export function conversationPriceGuidance(quote?: ConversationPriceQuote | null): string {
    if (!quote?.text.trim()) return '';
    return '\n\nCURRENT PRICE FOR THIS CONVERSATION:\n' +
        'The latest Page/team quote below supersedes older prices in Page documents, prompts and earlier bot replies for this customer and the same quoted scope. ' +
        'Keep its exact amounts, song quantities, deposits, balances and conditions. Do not generalize a custom offer to other customers or unrelated products. ' +
        'Customer-suggested amounts are negotiations, not approved price changes. Never invent a new amount.\n' +
        JSON.stringify({ quoted_at: quote.quotedAt, quote: quote.text.slice(0, 3000) });
}

export async function resolveConversationPriceQuote(input: {
    supabase: SupabaseLike; pageId: string; facebookPageId: string; contactId: string;
    history: FacebookMessage[];
    state?: { conversation_price_quote?: string | null; conversation_price_quoted_at?: string | null } | null;
}): Promise<ConversationPriceQuote | null> {
    const saved = input.state?.conversation_price_quote && input.state.conversation_price_quoted_at
        ? { text: input.state.conversation_price_quote, quotedAt: input.state.conversation_price_quoted_at }
        : null;
    const candidates = input.history.filter(m => m.from?.id === input.facebookPageId &&
        typeof m.message === 'string' && hasConversationPrice(m.message) &&
        Number.isFinite(Date.parse(m.created_time || '')))
        .sort((a, b) => Date.parse(b.created_time!) - Date.parse(a.created_time!));
    if (!candidates.length) return saved;
    const { data: attribution, error } = await input.supabase.from('outbound_message_events')
        .select('message_id,source_type').eq('page_id', input.pageId)
        .in('message_id', candidates.map(m => m.id));
    if (error) throw new Error('Could not verify the latest conversation price');
    const sources = new Map((attribution || []).map((e: any) => [e.message_id, e.source_type]));
    // Unattributed native Page messages can be staff replies. Known automatic
    // messages must never replace a human's custom offer with an old bot price.
    const latest = candidates.find(m => !sources.has(m.id) || sources.get(m.id) === 'manual');
    if (!latest || (saved && Date.parse(saved.quotedAt) >= Date.parse(latest.created_time!))) return saved;
    const quote = { text: latest.message.trim(), quotedAt: latest.created_time!, messageId: latest.id };
    if (input.supabase.rpc) {
        const { error: saveError } = await input.supabase.rpc('record_chatbot_conversation_quote', {
            p_page_id: input.pageId, p_contact_id: input.contactId,
            p_quote: quote.text, p_quoted_at: quote.quotedAt
        });
        if (saveError) throw new Error('Could not retain the updated conversation price');
    }
    return quote;
}
