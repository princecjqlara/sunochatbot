import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
createRequire(import.meta.url)('@next/env').loadEnvConfig(root, false, { info() {}, error() {} });
const parseEnv = file => Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^"(.*)"$/, '$1')]; }));
const botFile = path.join(root, 'jaucian/.env.local');
const bot = fs.existsSync(botFile) ? parseEnv(botFile) : {};
const pages = JSON.parse(fs.readFileSync(path.join(root, 'src/config/veo-pages.json'), 'utf8'));
const result = {
    workspace: { project_matches: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://missing.invalid').hostname === 'cxgynadprukyeuqbchbs.supabase.co',
        owner_matches: process.env.VEO_OWNER_USER_ID === '1e56fd95-56af-4aca-b50f-89a48c083249', approved_pages: pages.length,
        enabled: process.env.VEO_WORKSPACE_ENABLED === 'true', financial_policy_confirmed: process.env.SUNO_FINANCIAL_POLICY_CONFIRMED === 'true' },
    bot: { expected_username: 'dannysunobot', token_configured: Boolean(bot.TELEGRAM_BOT_TOKEN),
        separate_archive_configured: Boolean(bot.SUPABASE_URL && bot.SUPABASE_SERVICE_ROLE_KEY),
        approved_group_count: (bot.ALLOWED_CHAT_IDS || '').split(',').filter(x => x.trim()).length,
        handoff_secret_matches: Boolean(bot.VEO_JAUCIAN_SECRET && bot.VEO_JAUCIAN_SECRET === process.env.VEO_JAUCIAN_SECRET) },
};
if (process.argv.includes('--telegram')) {
    for (const method of ['getMe', 'getWebhookInfo']) {
        try {
            const response = await fetch(`https://api.telegram.org/bot${bot.TELEGRAM_BOT_TOKEN}/${method}`, { signal: AbortSignal.timeout(15000) });
            const body = await response.json();
            if (!response.ok || !body.ok) { result.bot[method] = { ok: false, http_status: response.status }; continue; }
            result.bot[method] = method === 'getMe'
                ? { ok: body.result.id === 9210209211 && body.result.username === 'dannysunobot', id: body.result.id, username: body.result.username,
                    can_join_groups: body.result.can_join_groups, can_read_all_group_messages: body.result.can_read_all_group_messages }
                : { configured: Boolean(body.result.url), pending_updates: body.result.pending_update_count, has_delivery_error: Boolean(body.result.last_error_message) };
        } catch { result.bot[method] = { ok: false, error: 'Read-only Telegram check unavailable' }; }
    }
}
if (process.argv.includes('--database')) {
    for (const [table, select] of [['pages', 'id'], ['veo_tenants', 'id,launch_at']]) {
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?select=${select}&limit=100`, {
                headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
                signal: AbortSignal.timeout(15000),
            });
            const rows = await response.json();
            result.workspace[table] = response.ok ? { readable: true, rows: rows.length, ...(table === 'veo_tenants' ? { launched: rows.some(row => Boolean(row.launch_at)) } : {}) }
                : { readable: false, http_status: response.status, code: rows.code || null };
        } catch { result.workspace[table] = { readable: false, error: 'Read-only database check unavailable' }; }
    }
    try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_automation_page_scope`, {
            method: 'POST', body: '{}',
            headers: { 'Content-Type': 'application/json', apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
            signal: AbortSignal.timeout(15000),
        });
        const scope = await response.json();
        result.workspace.runtime_ownership = {
            readable: response.ok,
            configured: response.ok && Array.isArray(scope),
            owned_page_count: response.ok && Array.isArray(scope) ? scope.length : 0,
            ...(response.ok ? {} : { http_status: response.status, code: scope?.code || null }),
        };
    } catch {
        result.workspace.runtime_ownership = { readable: false, configured: false, error: 'Read-only ownership check unavailable' };
    }
}
console.log(JSON.stringify(result, null, 2));
