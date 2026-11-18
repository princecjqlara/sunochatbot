import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    oxc: { jsx: { runtime: 'automatic' } },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    },
    test: {
        maxWorkers: 1,
        environment: 'node',
        testTimeout: 30000,
        include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs']
    }
});
