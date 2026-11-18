import { expect, it } from 'vitest';
import { releaseTestEnvironment } from './lib/release-test-environment.mjs';

it('isolates hosted feature switches and provider credentials from regression fixtures', () => {
    const hosted = { NODE_ENV: 'production', SUNO_DEPLOYMENT_STAGE: 'setup', VEO_WORKSPACE_ENABLED: 'true',
        SUPABASE_SERVICE_ROLE_KEY: 'provider-credential', NEXTAUTH_SECRET: 'session-credential',
        FACEBOOK_APP_SECRET: 'meta-credential', OPENROUTER_API_KEY: 'model-credential',
        VERCEL_OIDC_TOKEN: 'platform-credential', CRON_SECRET: 'worker-credential',
        Path: 'windows-path', SYSTEMROOT: 'windows-root', TEMP: 'test-temp', CI: '1' };
    const isolated = releaseTestEnvironment(hosted);
    expect(isolated).toEqual({ NODE_ENV: 'test', Path: 'windows-path', SYSTEMROOT: 'windows-root', TEMP: 'test-temp', CI: '1' });
    expect(hosted.NODE_ENV).toBe('production');
    expect(hosted.SUNO_DEPLOYMENT_STAGE).toBe('setup');
});
