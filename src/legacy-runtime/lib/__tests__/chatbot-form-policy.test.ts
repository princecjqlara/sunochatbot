import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildChatbotMessages, generateChatbotResponse, type ChatbotConfig } from '../chatbot';
import { SONG_BRIEF_FIELDS } from '../chatbot-form-priority';
const { formPrioritySettings } = require('../../fixtures/scripts/form-priority-policy.cjs');

describe('form-first page policy', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
    it('replaces conflicting form guidance without changing pricing or support instructions', () => {
        const row = { instructions: 'CURRENT APPROVED PRICES\nPHP399 for one song\n\nFORM-FIRST COLLECTION\nSplit the form. No extra creative or sales question after the form.\n\nTRUTHFUL VALUE AND SUPPORT\nAsk for the receipt.',
            follow_up_prompt: 'Keep the quote.\n\nFORM-FIRST COLLECTION\nSplit form.\n\nFACTUAL CHECK\nNo invented discounts.',
            bot_dos: '- Use the exact numbered seven-field owner form by default, across tiny bubbles.', bot_donts: 'Each bubble <=110 characters.' };
        const result = formPrioritySettings(row);
        expect(result.instructions).toContain('PHP399 for one song');
        expect(result.instructions).toContain('Ask for the receipt.');
        expect(result.instructions).not.toContain('Split the form');
        expect(result.follow_up_prompt).toContain('No invented discounts.');
        expect(result.instructions).toContain('then exactly ONE short question');
        expect(formPrioritySettings(result)).toEqual(result);
    });
    it('uses the durable form marker in final turn guidance for a generic page', () => {
        const messages = buildChatbotMessages({ pageId: 'page', inboundMessage: 'Haircut please',
            instructions: 'PRIORITIZE_FILL_UP_FORM: true\nALLOW_BRIEF_FORM: true\nSHORT_HUMAN_REPLIES: true',
            detailsToCollect: ['Service', 'Date'], collectedDetails: { Service: 'Haircut' },
            formSentAt: '2026-10-17T08:00:00Z', history: [] });
        expect(messages[0].content).toContain('The form was already delivered');
        expect(messages[0].content).toContain('Do not resend any form fields');
    });
    const config = { page_id: 'p', enabled: true, model: 'test-model', rag_enabled: false,
        instructions: 'PRIORITIZE_FILL_UP_FORM: true\nALLOW_BRIEF_FORM: true\nSONG_BRIEF_FORM: hiraya-seven-fields\nSHORT_HUMAN_REPLIES: true',
        details_to_collect: SONG_BRIEF_FIELDS.map(([, key]) => key), details_completion_percent: 100,
        fallback_reply: 'A teammate will reply soon.', follow_up_prompt: '', split_messages: false,
        max_message_parts: 1, stop_when_details_collected: false } as ChatbotConfig;
    it('saves multiple answers under canonical keys and excludes options before composing the form', async () => {
        vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: {
            content: JSON.stringify({ messages: ['What genre?'], collected_details: {
                'Business Name': 'Incorrect model value', 'English or Tagalog lyrics': 'Tagalog',
                'Male or Female singer': 'Male or Female', Genre: 'sample: Pop' } })
        } }] }) }));
        const result = await generateChatbotResponse({ config, pageId: 'page',
            inboundMessage: 'Business Name: Sunrise Bakery\nEnglish or Tagalog lyrics: Tagalog', history: [] });
        expect(result.collected_details).toEqual({ 'Business name': 'Sunrise Bakery', 'Lyrics language': 'Tagalog' });
        expect(result.reply).not.toContain('1. Business Name:');
        expect(result.reply).not.toContain('4. English or Tagalog lyrics:');
        expect(result.reply).toContain('5. Male or Female singer:');
        expect(result.reply).toMatch(/Anong produkto o serbisyo ang gusto ninyong itampok\?$/);
    });
    it('passes the latest team quote into generation and retains its scope before form and question', async () => {
        vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: {
            content: JSON.stringify({ messages: ['PHP450 for two songs, PHP150 deposit and PHP300 balance.'], collected_details: {} })
        } }] }) });
        vi.stubGlobal('fetch', fetchMock);
        const result = await generateChatbotResponse({ config, pageId: 'page', inboundMessage: 'Magkano ulit?',
            conversationPriceQuote: { text: 'PHP450 for two songs, PHP150 deposit and PHP300 balance.', quotedAt: '2026-10-17T08:00:00Z' } });
        const request = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(request.messages.filter((message: { role: string }) => message.role === 'system').at(-1).content)
            .toContain('PHP450 for two songs, PHP150 deposit and PHP300 balance.');
        expect(result.reply).toMatch(/^PHP450 for two songs, PHP150 deposit and PHP300 balance\.\n\nPa-sagutan/);
        expect(result.reply.match(/\?/g)).toHaveLength(1);
    });
});
