import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
createRequire(import.meta.url)('@next/env').loadEnvConfig(root);
const args = process.argv.slice(2);
const modes = args.filter(a => ['--inspect', '--preflight', '--apply', '--launch'].includes(a));
if (modes.length !== 1) throw new Error('Choose one of --inspect, --preflight, --apply or --launch');
const expected = 'cxgynadprukyeuqbchbs';
if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').hostname !== `${expected}.supabase.co`)
    throw new Error('Release is restricted to the verified Suno project');
if (modes[0] === '--inspect' || modes[0] === '--preflight') {
    // The inherited helper is version-only and predates the current schema.
    // Use the current read-only inventory and isolated incremental rehearsal.
    const script=modes[0] === '--inspect'?'scripts/plan-suno-migrations.mjs':'scripts/rehearse-suno-upgrade.mjs';
    const result=spawnSync(process.execPath,[path.join(root,script)],{cwd:root,env:process.env,stdio:'inherit'});
    process.exit(result.status ?? 1);
}
if (['--apply', '--launch'].includes(modes[0]) && process.env.SUNO_FINANCIAL_POLICY_CONFIRMED !== 'true')
    throw new Error('Confirm and implement Suno earnings rules before applying or launching the copied financial workspace');
if (modes[0] === '--launch' && !args.includes('--acknowledge-archive'))
    throw new Error('Launch archives existing operational workflows; pass --acknowledge-archive only for an approved cutover');
// Never fall through to the incomplete upstream installer. Live execution also
// needs the real backup, earnings adapter, archive and single-scheduler handover.
throw new Error('Live cutover is not ready: finish Suno earnings policy, dedicated bot archive, deployment URLs and historical-job handover. Review verification/suno-incremental-review.sql; the upstream version-only installer is disabled.');
