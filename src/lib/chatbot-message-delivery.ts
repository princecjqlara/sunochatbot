import type { FacebookMessage } from '@/types';

type Database = { from: (table: string) => any; rpc?: (name: string, args: Record<string, unknown>) => any };

export class DuplicateChatbotMessageError extends Error {
    constructor() { super('Duplicate chatbot message suppressed'); }
}

export function normalizeChatbotMessage(text: string): string {
    return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function similar(a: string, b: string): boolean {
    if (!a || !b) return false;
    if (a === b) return true;
    if (Math.min(a.length, b.length) < 35) return false;
    // A revised amount or quantity must not be mistaken for the same answer.
    if (JSON.stringify(a.match(/\d+/g)) !== JSON.stringify(b.match(/\d+/g))) return false;
    const terms = (text: string) => (text.match(/\b(?:one|two|three|four|five|isa|isang|dalawa|tatlo|male|female|english|tagalog|taglish)\b/g) || []).sort();
    if (JSON.stringify(terms(a)) !== JSON.stringify(terms(b))) return false;
    if (/\b(?:not|no|never|hindi|di|wag|huwag|don t|cannot|can t)\b/.test(a) !==
        /\b(?:not|no|never|hindi|di|wag|huwag|don t|cannot|can t)\b/.test(b)) return false;
    const left = new Set(a.split(' ')), right = new Set(b.split(' '));
    const overlap = [...left].filter(word => right.has(word)).length;
    return overlap / new Set([...left, ...right]).size >= 0.82;
}

export function hasRepeatedChatbotMessage(parts: string[], previous: string[]): boolean {
    const prior = previous.map(normalizeChatbotMessage).filter(Boolean);
    const questions = (messages: string[]) => messages.flatMap(text => text.match(/[^.!?\n]*\?/g) || [])
        .map(normalizeChatbotMessage).filter(Boolean);
    const priorQuestions = questions(previous);
    if (questions(parts).some(question => priorQuestions.some(previous => similar(question, previous)))) return true;
    // Compare the whole reply too: changing bubble boundaries is not new content.
    const candidates = [...parts, parts.join(' ')].map(normalizeChatbotMessage).filter(Boolean);
    for (let index = 0; index < prior.length; index++) {
        for (let count = 2; count <= 3 && index + count <= prior.length; count++) {
            const combined = prior.slice(index, index + count).join(' ');
            if (candidates.some(candidate => similar(candidate, combined))) return true;
        }
    }
    return candidates.some(candidate => prior.some(text => similar(candidate, text))) ||
        parts.some((part, index) => parts.slice(0, index).some(previousPart =>
            similar(normalizeChatbotMessage(part), normalizeChatbotMessage(previousPart))));
}

export function allowsRequestedChatbotRepeat(inbound: string): boolean {
    return /\b(?:repeat|resend|again|restate|remind|ulit|ulitin|pakiulit|pasend|pa-send|magkano|presyo|price|how much)\b/i.test(inbound) ||
        /^(?:thanks?(?: a lot)?|thank you(?: so much)?|salamat(?: po)?|maraming salamat(?: po)?|ty)[.!\s]*$/i.test(inbound.trim());
}

export async function loadChatbotDeliveryHistory(input: {
    supabase: Database; pageId: string; contactId: string; facebookPageId: string; historyStartAt?: string | null;
}): Promise<FacebookMessage[]> {
    let query = input.supabase.from('chatbot_message_deliveries')
        .select('id,message_id,message_text,sent_at').eq('page_id', input.pageId).eq('contact_id', input.contactId).eq('status', 'sent');
    query = input.historyStartAt ? query.eq('history_start_at', input.historyStartAt) : query.is('history_start_at', null);
    const { data, error } = await query.order('sent_at', { ascending: false }).limit(200);
    if (error) throw new Error('Could not read previous chatbot deliveries');
    return (data || []).map((row: any) => ({ id: row.message_id || row.id, message: row.message_text,
        created_time: row.sent_at, from: { id: input.facebookPageId, name: 'Page' } }));
}

export function mergeChatbotDeliveryHistory(history: FacebookMessage[], delivered: FacebookMessage[]): FacebookMessage[] {
    return [...new Map([...delivered, ...history].map(message => [message.id, message])).values()]
        .sort((a, b) => Date.parse(a.created_time || '') - Date.parse(b.created_time || ''));
}

export async function reserveChatbotMessage(input: {
    supabase: Database; pageId: string; contactId: string; message: string;
    sourceKey: string; historyStartAt?: string | null; allowRepeat?: boolean;
}): Promise<string | null> {
    if (!input.supabase.rpc) throw new Error('Chatbot delivery reservations are unavailable');
    const { data, error } = await input.supabase.rpc('reserve_chatbot_message', {
        p_page_id: input.pageId, p_contact_id: input.contactId, p_message_text: input.message,
        p_normalized_text: normalizeChatbotMessage(input.message), p_source_key: input.sourceKey,
        p_history_start_at: input.historyStartAt || null, p_allow_repeat: !!input.allowRepeat
    });
    if (error) throw new Error('Could not reserve chatbot message delivery');
    return data || null;
}

export async function finishChatbotMessage(input: { supabase: Database; deliveryId: string; messageId: string }): Promise<void> {
    if (!input.supabase.rpc) throw new Error('Chatbot delivery recording is unavailable');
    const { error } = await input.supabase.rpc('finish_chatbot_message', {
        p_delivery_id: input.deliveryId, p_message_id: input.messageId
    });
    if (error) throw new Error('Could not retain successful chatbot message delivery');
}
