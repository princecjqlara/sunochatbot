import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getPinnedChatbotKnowledge } from '@/lib/chatbot-knowledge';

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); });

const documentId = '0bdb5107-c98d-4f69-8e5b-6675a597bf9c';
const instructions = `KNOWLEDGE_POLICY_DOCUMENT_ID: ${documentId}`;

function databaseResult(data: unknown, error: unknown = null) {
    const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({ data, error }))
    };
    const from = vi.fn(() => chain);
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as any);
    return { chain, from };
}

describe('owner-selected chatbot knowledge policy', () => {
    it('does not fetch arbitrary documents when no valid owner selection exists', async () => {
        for (const value of ['Normal salon instructions', 'KNOWLEDGE_POLICY_DOCUMENT_ID: invalid']) {
            expect(await getPinnedChatbotKnowledge({ pageId: 'page-1', instructions: value })).toBeUndefined();
        }
        expect(getSupabaseAdmin).not.toHaveBeenCalled();
    });

    it('loads the full ready document within the configured knowledge Page', async () => {
        const content = 'Full approved price ladder and objection-handling strategy.';
        const { chain, from } = databaseResult({ id: documentId, title: 'Current policy', content, status: 'ready', media_asset_id: null });
        expect(await getPinnedChatbotKnowledge({ pageId: 'page-1', instructions })).toEqual({ title: 'Current policy', content });
        expect(from).toHaveBeenCalledWith('chatbot_knowledge_documents');
        expect(chain.eq.mock.calls).toEqual([['id', documentId], ['page_id', 'page-1'], ['status', 'ready']]);
    });

    it.each([
        null,
        { status: 'processing', content: 'Not ready' },
        { status: 'ready', content: 'An image caption', media_asset_id: 'media-1' },
        { status: 'ready', content: 'x'.repeat(16_001) }
    ])('rejects unavailable or invalid policy content rather than silently quoting stale facts', async data => {
        databaseResult(data);
        await expect(getPinnedChatbotKnowledge({ pageId: 'page-1', instructions })).rejects.toThrow('owner-selected knowledge policy');
    });

    it('reports a failed lookup', async () => {
        databaseResult(null, { message: 'Lookup failed' });
        await expect(getPinnedChatbotKnowledge({ pageId: 'page-1', instructions })).rejects.toThrow('Lookup failed');
    });
});
