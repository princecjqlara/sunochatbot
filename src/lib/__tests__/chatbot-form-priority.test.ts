import { describe, expect, it } from 'vitest';
import { collectChatbotFormAnswers, getPrioritizedChatbotForm, SONG_BRIEF_FIELDS } from '../chatbot-form-priority';

const instructions = 'PRIORITIZE_FILL_UP_FORM: true\nALLOW_BRIEF_FORM: true\nSONG_BRIEF_FORM: hiraya-seven-fields';
const config = { instructions, details_to_collect: SONG_BRIEF_FIELDS.map(([, key]) => key),
    details_completion_percent: 100, fallback_reply: 'A teammate will reply soon.' };
const base = { config, pageId: 'page', inboundMessage: 'Hello', collectedDetails: {},
    replyMessages: ['What business do you have?'] };
const priorForm = { id: 'old-form', message: '1. Business Name:\n2. Specialty/Products:',
    from: { id: 'page', name: 'Studio' }, created_time: '2026-10-17T08:00:00Z' };

describe('priority fill-up form', () => {
    it.each(['Hello', 'Interested po', 'Gusto ko magpagawa ng kanta'])('starts an eligible inquiry with the complete form: %s', inboundMessage => {
        const messages = getPrioritizedChatbotForm({ ...base, inboundMessage })!;
        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatch(/^Pa-sagutan po para sa kanta\n1\. Business Name:/);
        expect(messages[0]).toContain('7. Additional requests:');
        expect(messages[0]).not.toContain('What business');
        expect(messages[0]).toMatch(/\n\nAno po ang business name na ilalagay natin\?$/);
        expect(messages[0].match(/\?/g)).toHaveLength(1);
        expect(messages[0].length).toBeLessThanOrEqual(700);
    });
    it('retains a direct price answer before the form without a package confirmation question', () => {
        const messages = getPrioritizedChatbotForm({ ...base, inboundMessage: 'Magkano po?',
            replyMessages: ['PHP399 ang isang kanta. Okay po ba ang presyo?'] })!;
        expect(messages[0]).toMatch(/^PHP399 ang isang kanta\.\n\nPa-sagutan/);
        expect(messages[0]).not.toContain('Okay po ba');
    });
    it('omits actual known answers, preserves original field numbering and invents no values', () => {
        const messages = getPrioritizedChatbotForm({ ...base,
            collectedDetails: { 'Business name': 'Sunrise Bakery', 'Lyrics language': 'Tagalog' } })!;
        expect(messages[0]).not.toContain('1. Business Name:');
        expect(messages[0]).not.toContain('4. English or Tagalog lyrics:');
        expect(messages[0]).toContain('2. Specialty/Products:');
        expect(messages[0]).toContain('5. Male or Female singer:');
        expect(messages[0]).not.toContain('Sunrise Bakery');
    });
    it('does not resend a form for every incoming message', () => {
        expect(getPrioritizedChatbotForm({ ...base, history: [priorForm], inboundMessage: 'Sunrise Bakery' })).toBeNull();
    });
    it('resends only missing fields when the customer explicitly asks for the form again', () => {
        const messages = getPrioritizedChatbotForm({ ...base, history: [priorForm], inboundMessage: 'Paki resend form',
            collectedDetails: { 'Business name': 'Sunrise Bakery' } })!;
        expect(messages[0]).not.toContain('1. Business Name:');
        expect(messages[0]).toContain('2. Specialty/Products:');
    });
    it.each(['Stop messaging me', 'Not interested', 'Maybe later', 'Thank you', 'Salamat po',
        'Where is my order?', 'Order status?', 'Refund po', 'Bayad na po ako', 'Isa-isa muna', 'One question at a time'])('does not force the form on %s', inboundMessage => {
        expect(getPrioritizedChatbotForm({ ...base, inboundMessage })).toBeNull();
    });
    it('honors a standing one-by-one preference on later messages', () => {
        expect(getPrioritizedChatbotForm({ ...base, inboundMessage: 'Sunrise Bakery', history: [{ ...priorForm,
            from: { id: 'customer', name: 'Customer' }, message: 'Isa-isa muna please' }] })).toBeNull();
    });
    it.each(['qualified', 'manual', 'details_collected', 'opt_out'])('does not override a %s stop', stopReason => {
        expect(getPrioritizedChatbotForm({ ...base, stopReason })).toBeNull();
    });
    it('does not restart collection after the configured target is complete', () => {
        const collectedDetails = Object.fromEntries(config.details_to_collect.slice(0, 4).map(key => [key, 'provided']));
        expect(getPrioritizedChatbotForm({ ...base, config: { ...config, details_completion_percent: 50 }, collectedDetails })).toBeNull();
    });
    it('does not force the optional Additional requests field on an otherwise complete brief', () => {
        const collectedDetails = Object.fromEntries(config.details_to_collect.slice(0, 6).map(key => [key, 'provided']));
        expect(getPrioritizedChatbotForm({ ...base, collectedDetails })).toBeNull();
    });
    it('requires the explicit owner priority setting', () => {
        expect(getPrioritizedChatbotForm({ ...base, config: { ...config,
            instructions: 'ALLOW_BRIEF_FORM: true\nSONG_BRIEF_FORM: hiraya-seven-fields' } })).toBeNull();
    });
    it('provides the form during a provider fallback without promising a staff action', () => {
        const messages = getPrioritizedChatbotForm({ ...base, inboundMessage: 'How much?', replyMessages: [config.fallback_reply] })!;
        expect(messages[0]).toMatch(/^Pa-sagutan/);
        expect(messages[0]).not.toContain('teammate');
    });
    it('uses each page\'s configured fields without requiring the song template', () => {
        const messages = getPrioritizedChatbotForm({ ...base, config: { ...config,
            instructions: 'PRIORITIZE_FILL_UP_FORM: true\nALLOW_BRIEF_FORM: true',
            details_to_collect: ['Service', 'Preferred date', 'Location'] },
            collectedDetails: { Service: 'Haircut' } })!;
        expect(messages[0]).toContain('2. Preferred date:\n3. Location:');
        expect(messages[0]).toMatch(/What should we put for Preferred date\?$/);
        expect(messages[0]).not.toContain('Business Name:');
    });
    it('preserves the seven-field template when other collection goals exist', () => {
        const messages = getPrioritizedChatbotForm({ ...base, config: { ...config,
            details_to_collect: ['Customer name', ...config.details_to_collect, 'Agreed package', 'Deadline'] } })!;
        expect(messages[0]).not.toMatch(/Customer name:|Agreed package:|Deadline:/);
        expect(messages[0]).toContain('1. Business Name:');
        expect(messages[0]).toContain('7. Additional requests:');
    });
    it('recognizes durable delivery even when the form has left fetched history', () => {
        expect(getPrioritizedChatbotForm({ ...base, history: [], formSentAt: '2026-10-17T08:00:00Z' })).toBeNull();
    });
    it('removes an accidental resend after durable delivery and asks a missing field', () => {
        const result = getPrioritizedChatbotForm({ ...base, history: [], formSentAt: '2026-10-17T08:00:00Z',
            collectedDetails: { 'Business name': 'Sunrise Bakery' },
            replyMessages: ['Pa-sagutan po para sa kanta\n2. Specialty/Products:\n4. English or Tagalog lyrics:'] })!;
        expect(result).toEqual(['Anong produkto o serbisyo ang gusto ninyong itampok?']);
    });
    it('allows an explicit resend after durable delivery, retaining only unknown fields', () => {
        const result = getPrioritizedChatbotForm({ ...base, formSentAt: '2026-10-17T08:00:00Z',
            inboundMessage: 'Paki send form ulit', collectedDetails: { 'Business name': 'Sunrise Bakery' } })!;
        expect(result[0]).not.toContain('1. Business Name:');
        expect(result[0]).toContain('2. Specialty/Products:');
    });
    it('does not count placeholders and options as actual answers', () => {
        const result = getPrioritizedChatbotForm({ ...base, collectedDetails: {
            'Business name': '___', 'Lyrics language': 'English or Tagalog lyrics',
            'Vocal preference': 'Male or Female singer', 'Preferred mood/style': 'sample: Pop'
        } })!;
        expect(result[0]).toContain('1. Business Name:');
        expect(result[0]).toContain('4. English or Tagalog lyrics:');
        expect(result[0]).toContain('5. Male or Female singer:');
        expect(result[0]).toContain('6. Genre:');
    });
    it('uses normal replies when the page has no collection fields', () => {
        expect(getPrioritizedChatbotForm({ ...base, config: { ...config, details_to_collect: [] } })).toBeNull();
    });
    it('retains a scoped quote with deposit and balance before form and question', () => {
        const result = getPrioritizedChatbotForm({ ...base, inboundMessage: 'Magkano ulit?',
            replyMessages: ['PHP450 for two songs. PHP150 deposit, PHP300 balance. Okay po ba?'] })!;
        expect(result[0]).toMatch(/^PHP450 for two songs\. PHP150 deposit, PHP300 balance\.\n\nPa-sagutan/);
        expect(result[0].match(/\?/g)).toHaveLength(1);
        expect(result[0]).not.toContain('Okay po ba');
    });
    it('reads labeled customer answers from history, preserves saved corrections, and applies the latest edit', () => {
        const result = collectChatbotFormAnswers({ config, pageId: 'page',
            history: [
                { ...priorForm, message: '1. Business Name: Page invented name' },
                { ...priorForm, from: { id: 'customer', name: 'Customer' }, message: '1. Business Name: Old Name\n2. Specialty/Products: Cakes' }
            ], collectedDetails: { 'Business name': 'Saved Name', 'Lyrics language': 'Tagalog' },
            inboundMessage: '1. Business Name: Unknown Bakery\n4. English or Tagalog lyrics: English\n5. Male or Female singer: Male or Female\n6. Genre: ___\nAgreed package: PHP10' });
        expect(result).toEqual({ 'Business name': 'Unknown Bakery', 'Main products or services': 'Cakes', 'Lyrics language': 'English' });
    });
    it('keeps the complete form in its own bubble while the answer and question can split', () => {
        const result = getPrioritizedChatbotForm({ ...base,
            config: { ...config, split_messages: true, max_message_parts: 3 },
            inboundMessage: 'Magkano?', replyMessages: ['PHP450 for two songs.'] })!;
        expect(result).toHaveLength(3);
        expect(result[0]).toBe('PHP450 for two songs.');
        expect(result[1]).toMatch(/^Pa-sagutan po para sa kanta\n1\. Business Name:/);
        expect(result[1]).toContain('7. Additional requests:');
        expect(result[2]).toBe('Ano po ang business name na ilalagay natin?');
    });
});
