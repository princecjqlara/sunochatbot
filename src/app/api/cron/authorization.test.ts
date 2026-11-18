import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ database: vi.fn(() => { throw new Error('Unauthorized database access'); }) }));
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: mocks.database }));

const handlers = [
    ['campaign-loop', () => import('./campaign-loop/route')],
    ['campaign-scheduled', () => import('./campaign-scheduled/route')],
    ['exports', () => import('./exports/route')],
    ['sync', () => import('./sync/route')],
    ['follow-up-automations', () => import('./follow-up-automations/route')],
] as const;

describe('cron authorization without middleware', () => {
    beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('CRON_SECRET', 'private-cron'); });
    afterEach(() => { vi.unstubAllEnvs(); });

    it.each(handlers)('%s denies a forged middleware bypass before accessing data', async (name, load) => {
        const { GET } = await load();
        for (const authorization of ['', 'Bearer wrong-secret']) {
            const request = new NextRequest(`http://localhost/api/cron/${name}`, {
                headers: { authorization, 'x-middleware-subrequest': 'middleware:middleware:middleware:middleware:middleware' },
            });
            expect((await GET(request)).status).toBe(401);
        }
        expect(mocks.database).not.toHaveBeenCalled();
    });

    it.each(handlers)('%s fails closed when its scheduler secret is missing', async (name, load) => {
        vi.stubEnv('CRON_SECRET', '');
        const { GET } = await load();
        expect((await GET(new NextRequest(`http://localhost/api/cron/${name}`))).status).toBe(503);
        expect(mocks.database).not.toHaveBeenCalled();
    });
});
