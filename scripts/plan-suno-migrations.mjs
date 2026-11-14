// Inventory only: the database transaction is read-only and always rolled back.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
createRequire(import.meta.url)('@next/env').loadEnvConfig(root, false, { info() {}, error() {} });
const project = 'cxgynadprukyeuqbchbs';
if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').hostname !== `${project}.supabase.co`)
    throw new Error('Migration inventory is restricted to Suno');
const connectionString = process.env.DATABASE_POOLER_URL_5432 || process.env.DATABASE_URL;
const target = new URL(connectionString || '');
if (!target.hostname.includes(project) && !decodeURIComponent(target.username).endsWith(`.${project}`))
    throw new Error('Database connection does not identify the Suno project');
const db = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000, query_timeout: 15000 });
db.on('error', () => {});
try {
    await db.connect();
    await db.query('BEGIN READ ONLY');
    const names = ['users', 'pages', 'contacts', 'contact_verified_payments', 'veo_tenants', 'veo_accounts',
        'app_private.schema_migrations', 'app_private.sunobot_migration_files'];
    const objects = {};
    for (const name of names) objects[name] = Boolean((await db.query('SELECT to_regclass($1) AS name', [name])).rows[0].name);
    const versions = objects['app_private.schema_migrations']
        ? (await db.query('SELECT version FROM app_private.schema_migrations ORDER BY version')).rows.map(row => row.version) : [];
    const legacy = objects['app_private.sunobot_migration_files']
        ? (await db.query('SELECT filename FROM app_private.sunobot_migration_files ORDER BY filename')).rows.map(row => row.filename) : [];
    const files = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
    const groups = new Map();
    for (const name of files) { const version = name.split('_')[0]; groups.set(version, [...(groups.get(version) || []), name]); }
    const duplicates = [...groups.values()].filter(group => group.length > 1);
    const report = {
        checked_at: new Date().toISOString(), read_only: true, project,
        objects, recorded_version_count: versions.length, recorded_file_count: legacy.length,
        required_baseline: objects.contact_verified_payments ? 'present' : 'missing: contact_verified_payments (202611020004_contact_profiles.sql and its prerequisites)',
        workspace_prepared: objects.veo_tenants,
        unrecorded_files: files.filter(name => !legacy.includes(name) && !versions.includes(name.split('_')[0])),
        duplicate_version_files: duplicates,
        release_limit: 'The upstream release helper does not install all baseline/latest migrations. Reconcile this inventory and duplicate versions before an applied cutover.',
        activation_requires: ['verified baseline and full migration plan', 'database backup', 'confirmed Suno earnings policy', 'separate bot archive', 'verified Telegram destinations', 'production cutover approval'],
    };
    await db.query('ROLLBACK');
    const folder = path.join(root, 'verification'); fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'migration-plan.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ ...report, unrecorded_files: { count: report.unrecorded_files.length, details: 'verification/migration-plan.json' } }, null, 2));
} catch (error) {
    console.error(JSON.stringify({ ok: false, read_only: true, error: error.code || 'database_inventory_unavailable' }));
    process.exitCode = 1;
} finally { await db.end().catch(() => {}); }
