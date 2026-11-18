import {afterEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {middleware} from '@/middleware';
import fs from 'node:fs';
const routes=fs.readdirSync('src/app/api/cron').filter(name=>fs.existsSync('src/app/api/cron/'+name+'/route.ts'));
afterEach(()=>{vi.unstubAllEnvs();});
it.each(['preparation','workspace','recovery'])('protects all seventeen workers in %s mode',async mode=>{
    vi.stubEnv('VEO_WORKSPACE_ENABLED',mode==='workspace'?'true':'false');vi.stubEnv('VEO_DATABASE_RECOVERY_MODE',mode==='recovery'?'true':'false');vi.stubEnv('CRON_SECRET','test');
    expect(routes).toHaveLength(17);
    for(const route of routes){
        const url='https://suno.example/api/cron/'+route;
        expect((await middleware(new NextRequest(url))).status).toBe(401);
        expect((await middleware(new NextRequest(url,{headers:{authorization:'Bearer wrong'}}))).status).toBe(401);
        expect((await middleware(new NextRequest(url,{headers:{authorization:'Bearer test'}}))).status).toBe(200);
    }
});

it('skips every authenticated worker before it can reach data during deployment setup', async () => {
    vi.stubEnv('SUNO_DEPLOYMENT_STAGE', 'setup');
    vi.stubEnv('CRON_SECRET', 'test');
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    try {
        for (const route of routes) {
            const response = await middleware(new NextRequest('https://suno.example/api/cron/' + route, { headers: { authorization: 'Bearer test' } }));
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({ skipped: true, reason: 'suno_setup_pending' });
            expect((await middleware(new NextRequest('https://suno.example/api/cron/' + route))).status).toBe(401);
        }
        expect(fetch).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
});

it.each(['GET', 'POST', 'PATCH', 'DELETE'])('pauses %s workspace access and ingestion before database work', async method => {
    vi.stubEnv('SUNO_DEPLOYMENT_STAGE', 'setup');
    vi.stubEnv('VEO_WORKSPACE_ENABLED', 'true');
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    try {
        for (const path of ['/api/workspace', '/api/facebook/webhook', '/api/workspace/handoff']) {
            const response = await middleware(new NextRequest('https://suno.example' + path, { method }));
            expect(response.status).toBe(503);
            expect(await response.json()).toMatchObject({ code: 'SUNO_SETUP_PENDING' });
        }
        expect(fetch).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
});

it('keeps session bootstrap available and returns an honest setup reason for sign-in', async () => {
    vi.stubEnv('SUNO_DEPLOYMENT_STAGE', 'setup');
    for (const path of ['/api/auth/session', '/api/auth/providers', '/api/auth/csrf']) {
        expect((await middleware(new NextRequest('https://suno.example' + path))).headers.get('x-middleware-next')).toBe('1');
    }
    const response = await middleware(new NextRequest('https://suno.example/api/auth/callback/credentials', { method: 'POST' }));
    expect(response.status).toBe(503);
    expect((await response.json()).url).toBe('https://suno.example/?error=SunoSetupPending');
});
