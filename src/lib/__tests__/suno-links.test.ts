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
    it('rewrites the new handover guidance to Suno while retaining its command instructions', () => {
        const prefix = 'Use the VEO workspace to manage handovers and reassignments: ';
        expect(sunoIntakeLinks({ text: prefix + 'https://veochatbot.vercel.app/dashboard/workspace?view=new_clients\n\nUse /ready.' }, 'https://suno.example').text)
            .toBe('Use the Suno workspace to manage handovers and reassignments: https://suno.example/dashboard/workspace?view=new_clients\n\nUse /ready.');
        expect(() => sunoIntakeLinks({ text: prefix + 'https://foreign.example/dashboard/workspace' }, 'https://suno.example')).toThrow();
        expect(sunoIntakeLinks({ text: 'Customer mentioned https://veochatbot.vercel.app' }, 'https://suno.example').text)
            .toBe('Customer mentioned https://veochatbot.vercel.app');
    });
});
