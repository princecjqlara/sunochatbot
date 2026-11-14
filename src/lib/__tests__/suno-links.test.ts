import { describe, expect, it } from 'vitest';
import { sunoIntakeLinks, sunoWorkspaceOrigin } from '@/lib/suno-links';
describe('Suno assignment destinations', () => {
    it('maps SQL-generated legacy links to the configured Suno deployment', () => {
        expect(sunoIntakeLinks({ reply_markup: { inline_keyboard: [[{url: 'https://veochatbot.vercel.app/dashboard/contacts/abc?pageId=def'}]] } }, 'https://suno.example'))
            .toEqual({reply_markup:{inline_keyboard:[[{url:'https://suno.example/dashboard/contacts/abc?pageId=def'}]]}});
    });
    it('rejects foreign destinations and an inherited or non-origin deployment', () => {
        for (const value of ['https://veochatbot.vercel.app', 'http://suno.example', 'https://u:p@suno.example', 'https://suno.example/x', 'https://suno.example?q=1']) expect(() => sunoWorkspaceOrigin(value)).toThrow();
        for (const url of ['https://foreign.example/dashboard/workspace', 'https://veochatbot.vercel.app/api/auth']) expect(() => sunoIntakeLinks({url}, 'https://suno.example')).toThrow();
    });
});
