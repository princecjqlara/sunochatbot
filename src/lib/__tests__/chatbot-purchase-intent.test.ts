import { afterEach, describe, expect, it, vi } from 'vitest';
import { assessChatbotPurchaseIntent } from '../chatbot';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('human takeover intent review', () => {
    const input = {
        pageId: 'page', collectedDetails: {},
        history: [
            { id: 'offer', from: { id: 'page', name: 'Team' }, message: 'Proceed with the song?', created_time: '2026-10-17T04:00:00Z' },
            { id: 'yes', from: { id: 'customer', name: 'Customer' }, message: 'Yes po', created_time: '2026-10-17T04:01:00Z' }
        ]
    };
    const respond = (content: string) => {
        vi.stubEnv('OPENROUTER_API_KEY', 'test-only');
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200,
            json: async () => ({ choices: [{ message: { content } }] }) });
        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
    };
    it.each(['proceeded', 'clear_intent', 'unclear'])('only releases an explicitly unclear assessment: %s', async intent => {
        const fetchMock = respond(JSON.stringify({ intent, reason: 'Thread evidence' }));
        await expect(assessChatbotPurchaseIntent(input)).resolves.toEqual({ hold: intent !== 'unclear', reason: 'Thread evidence' });
        const request = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(request.messages[0].content).toContain('contextual affirmative');
        expect(JSON.parse(request.messages[1].content).thread).toEqual([
            { speaker: 'team', text: 'Proceed with the song?' }, { speaker: 'customer', text: 'Yes po' }
        ]);
    });
    it('accepts fenced provider JSON without losing the hold decision', async () => {
        respond(String.fromCharCode(96).repeat(3) + 'json\n{"intent":"clear_intent","reason":"Accepted offer"}\n' + String.fromCharCode(96).repeat(3));
        await expect(assessChatbotPurchaseIntent(input)).resolves.toMatchObject({ hold: true });
    });
    it.each(['not JSON', '{"intent":"maybe"}'])('rejects uncertain or malformed decisions so the worker keeps a human hold: %s', async content => {
        respond(content);
        await expect(assessChatbotPurchaseIntent(input)).rejects.toThrow();
    });
});
