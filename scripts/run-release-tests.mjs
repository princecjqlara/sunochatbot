import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { releaseTestEnvironment } from './lib/release-test-environment.mjs';

// Deployment builders set NODE_ENV=production. React's production build omits
// act(), so the test subprocess must select React's test-capable build before
// Vitest or React loads. The subsequent Next build keeps its production env.
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const result = spawnSync(process.execPath, [cli, 'run', ...process.argv.slice(2)], {
    cwd: root,
    env: releaseTestEnvironment(process.env),
    stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
