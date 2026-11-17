import type { ChatbotConfig } from './chatbot';
import type { FacebookMessage } from '@/types';
import { classifyChatbotStopIntent, hasReachedChatbotDetailTarget, isChatbotFollowUpPauseRequest,
    normalizeDetailsToCollect } from './chatbot-control';

export const SONG_BRIEF_FIELDS = [
    ['Business Name', 'Business name'], ['Specialty/Products', 'Main products or services'],
    ['Tagline', 'Tagline or slogan'], ['English or Tagalog lyrics', 'Lyrics language'],
    ['Male or Female singer', 'Vocal preference'], ['Genre', 'Preferred mood/style'],
    ['Additional requests', 'Additional requests']
] as const;

export function prioritizesChatbotForm(instructions: string): boolean {
    return /^PRIORITIZE_FILL_UP_FORM:\s*true\s*$/im.test(instructions) &&
        /^ALLOW_BRIEF_FORM:\s*true\s*$/im.test(instructions);
}

type FormConfig = Pick<ChatbotConfig, 'instructions' | 'details_to_collect' | 'details_completion_percent' | 'fallback_reply'> &
    Partial<Pick<ChatbotConfig, 'split_messages' | 'max_message_parts'>>;

export function chatbotFormFields(config: Pick<FormConfig, 'instructions' | 'details_to_collect'>): Array<{ label: string; key: string; number: number }> {
    const requested = normalizeDetailsToCollect(config.details_to_collect);
    const songForm = /^SONG_BRIEF_FORM:\s*hiraya-seven-fields\s*$/im.test(config.instructions);
    if (songForm) return SONG_BRIEF_FIELDS.flatMap(([label, canonical], index) => {
        const key = requested.find(key => key.toLowerCase() === canonical.toLowerCase());
        return key ? [{ key, label, number: index + 1 }] : [];
    });
    return requested.filter(key => key.toLowerCase() !== 'agreed package')
        .map((key, index) => ({ key, label: key, number: index + 1 }));
}

export function isChatbotFormMessage(text: string, config: Pick<FormConfig, 'instructions' | 'details_to_collect'>): boolean {
    const labels = chatbotFormFields(config).map(field => field.label.toLowerCase());
    return text.split('\n').some(line => {
        const match = /^\s*(?:\d+\.\s*)?([^:]+):\s*(.*)$/.exec(line);
        return !!match && labels.includes(match[1].trim().toLowerCase()) &&
            (!match[2].trim() || /^[_\s]+$/.test(match[2]));
    });
}

export function isBlankChatbotFormValue(value: string, key: string): boolean {
    return !value.trim() || /^[_\s.\-]+$/.test(value) ||
        /^(?:asked|pending|unknown|tbd|not (?:yet )?(?:provided|specified)|to be confirmed|waiting for (?:reply|answer))(?:$|\s*[:(])/i.test(value.trim()) ||
        /^sample\s*:/i.test(value.trim()) ||
        value.trim().toLowerCase() === key.toLowerCase() ||
        (key.toLowerCase() === 'lyrics language' && /^english\s*(?:\/|or)\s*tagalog(?:\s+lyrics)?$/i.test(value.trim())) ||
        (key.toLowerCase() === 'vocal preference' && /^male\s*(?:\/|or)\s*female(?:\s+singer)?$/i.test(value.trim())) ||
        SONG_BRIEF_FIELDS.some(([label, canonical]) => canonical.toLowerCase() === key.toLowerCase() && label.toLowerCase() === value.trim().toLowerCase());
}

function followUpQuestion(key: string, taglish: boolean): string {
    const questions: Record<string, string> = {
        'business name': 'Ano po ang business name na ilalagay natin?',
        'main products or services': 'Anong produkto o serbisyo ang gusto ninyong itampok?',
        'tagline or slogan': 'May tagline po ba kayo, o wala muna?',
        'lyrics language': 'English o Tagalog po ang gusto ninyong lyrics?',
        'vocal preference': 'Male o female po ang gusto ninyong singer?',
        'preferred mood/style': 'Anong genre po ang gusto ninyo para sa kanta?',
        'additional requests': 'May iba pa po kayong gustong idagdag?'
    };
    return taglish ? questions[key.toLowerCase()] || `Ano po ang ilalagay natin sa ${key}?` : `What should we put for ${key}?`;
}

/** Only explicit customer-filled labels are extracted here. Free text remains
 * the model's job; a copied blank form or a Page reply is never an answer. */
export function collectChatbotFormAnswers(input: {
    config: Pick<FormConfig, 'instructions' | 'details_to_collect'>; pageId: string;
    inboundMessage: string; history?: FacebookMessage[]; collectedDetails?: Record<string, string>;
}): Record<string, string> {
    if (!prioritizesChatbotForm(input.config.instructions)) return input.collectedDetails || {};
    const keys = new Map<string, string>([
        ...normalizeDetailsToCollect(input.config.details_to_collect).filter(key => key.toLowerCase() !== 'agreed package')
            .map(key => [key.toLowerCase(), key] as [string, string]),
        ...chatbotFormFields(input.config).map(field => [field.label.toLowerCase(), field.key] as [string, string])
    ]);
    const answers: Record<string, string> = {};
    const read = (text: string) => {
        for (const line of text.split('\n')) {
            const match = /^\s*(?:\d+[.)]\s*)?([^:\n]+):\s*(.+)$/.exec(line);
            const key = match && keys.get(match[1].trim().toLowerCase());
            if (key && match && !isBlankChatbotFormValue(match[2], key)) answers[key] = match[2].trim().slice(0, 500);
        }
    };
    (input.history || []).filter(message => message.from?.id && message.from.id !== input.pageId)
        .slice().sort((a, b) => Date.parse(a.created_time || '') - Date.parse(b.created_time || ''))
        .forEach(message => read(message.message || ''));
    // Saved facts may be newer than the fetched window. A new explicit answer
    // in this inbound message can correct them.
    Object.assign(answers, input.collectedDetails);
    read(input.inboundMessage);
    return answers;
}

/** A first inquiry gets the actual owner form even if a provider chooses an
 * individual question or fails. The delivery layer still checks lead stages.
 */
export function getPrioritizedChatbotForm(input: {
    config: FormConfig;
    inboundMessage: string; pageId: string; history?: FacebookMessage[];
    collectedDetails?: Record<string, string>; replyMessages?: string[];
    stopReason?: string | null;
    formSentAt?: string | null;
}): string[] | null {
    const { config, inboundMessage: inbound } = input;
    const verifiedDetails = Object.fromEntries(Object.entries(input.collectedDetails || {}).filter(([key, value]) =>
        typeof value === 'string' && !isBlankChatbotFormValue(value, key)));
    if (!prioritizesChatbotForm(config.instructions) || input.stopReason ||
        hasReachedChatbotDetailTarget(config, verifiedDetails) ||
        classifyChatbotStopIntent(inbound, { stopOnOptOut: true, stopOnRefusal: true }) ||
        isChatbotFollowUpPauseRequest(inbound)) return null;
    const explicitResend = /\bform\b/i.test(inbound) && /\b(?:send|resend|again|repeat|ulit|ulitin|pasend|pa-send|paki)\b/i.test(inbound);
    const customerHistory = (input.history || []).filter(message => message.from?.id !== input.pageId);
    const oneByOne = /\b(?:isa[- ]isa|one[- ]by[- ]one|one (?:question|field) at a time)\b/i;
    // A standing customer preference remains effective until they request the form.
    if (!explicitResend && (oneByOne.test(inbound) || customerHistory.some(m => oneByOne.test(m.message || '')))) return null;
    if (/^(?:thank you(?: so much)?|thanks(?: a lot)?|salamat(?: po)?|maraming salamat(?: po)?|ty)[.!\s]*$/i.test(inbound.trim())) return null;
    if (/\b(?:refund|complaint|reklamo|follow[- ]?up (?:my|our|the) order|order status|where (?:is|are) (?:my|our)|already (?:paid|ordered)|bayad na|nakabayad|delivery status|nasaan|asan|hindi (?:pa )?(?:dumating|na[- ]?receive))\b/i.test(inbound)) return null;

    const known = new Set(Object.keys(verifiedDetails).map(key => key.toLowerCase()));
    const missing = chatbotFormFields(config).filter(field => !known.has(field.key.toLowerCase()));
    const songForm = /^SONG_BRIEF_FORM:\s*hiraya-seven-fields\s*$/im.test(config.instructions);
    if (!missing.length || (songForm && missing.every(field => field.key.toLowerCase() === 'additional requests'))) return null;
    const taglish = songForm || /\b(?:po|opo|magkano|gusto|ako|kanta|salamat|sagot|ninyo|namin)\b/i.test(
        [inbound, ...customerHistory.map(m => m.message || '')].join(' '));
    const question = followUpQuestion(missing[0].key, taglish);
    const stripForm = (part: string) => part.split('\n').filter(line =>
        !isChatbotFormMessage(line, config) && !/^\s*\(sample:|^\s*(?:Pa-sagutan|Please fill (?:in|out))/i.test(line)).join('\n').trim();
    const priorForm = input.formSentAt || (input.history || []).some(m => m.from?.id === input.pageId && isChatbotFormMessage(m.message || '', config));
    if (!explicitResend && priorForm) {
        // Remove an accidental resend without replacing a valid contextual reply.
        if (!(input.replyMessages || []).some(part => isChatbotFormMessage(part, config))) return null;
        const remaining = (input.replyMessages || []).map(stripForm).filter(Boolean);
        return remaining.length ? remaining : [question];
    }
    const lines = missing.flatMap(field => [`${field.number}. ${field.label}:`,
        ...(songForm && field.number === 6 ? ['(sample: Pop)'] : [])]);
    const form = [songForm ? 'Pa-sagutan po para sa kanta' : taglish ? 'Pa-sagutan po ang detalye' : 'Please fill out these details', ...lines].join('\n');
    const directQuestion = /\?|\b(?:hm|magkano|mgkno|presyo|price|prices|pricing|how much|can you|do you|pwede|meron|ano|saan)\b/i.test(inbound);
    const answer = directQuestion ? (input.replyMessages || [])
        .filter(part => part.trim() !== config.fallback_reply.trim())
        .map(stripForm).flatMap(part => part.split('\n'))
        .map(line => line.replace(/[^.!?\n]*\?/g, '').trim()).filter(Boolean).join(' ').trim() : '';
    // Preserve all fields and one relevant question. Drop an oversized preamble
    // as a whole; never cut a price, payment condition or field in half.
    const body = `${form}\n\n${question}`;
    const limit = songForm ? 700 : 2000;
    const briefAnswer = answer && answer.length + body.length + 4 <= limit ? answer : '';
    if (config.split_messages && config.max_message_parts !== 1) {
        return config.max_message_parts === 2
            ? [briefAnswer ? `${briefAnswer}\n\n${form}` : form, question]
            : [...(briefAnswer ? [briefAnswer] : []), form, question];
    }
    return [briefAnswer ? `${briefAnswer}\n\n${body}` : body];
}
