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
