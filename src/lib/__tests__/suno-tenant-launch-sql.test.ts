import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;
beforeAll(async () => {
    db = new PGlite();
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE users(id uuid PRIMARY KEY,email text UNIQUE,name text,password_hash text,role text,is_active boolean DEFAULT true,facebook_id text);
      CREATE TABLE pages(id uuid PRIMARY KEY,fb_page_id text,name text);
      CREATE TABLE contacts(id uuid PRIMARY KEY,page_id uuid,name text,pipeline_stage text,psid text,profile_pic text,last_interaction_at timestamptz);
      CREATE TABLE user_pages(user_id uuid,page_id uuid,UNIQUE(user_id,page_id));
      CREATE TABLE campaigns(id uuid PRIMARY KEY,page_id uuid,created_at timestamptz,created_by uuid,status text);
      CREATE TABLE tags(id uuid PRIMARY KEY,page_id uuid);
      CREATE TABLE conversation_export_jobs(id uuid PRIMARY KEY,page_id uuid,created_at timestamptz);
      CREATE TABLE chatbot_media_assets(id uuid PRIMARY KEY,page_id uuid);
      CREATE TABLE workflow_automations(id uuid PRIMARY KEY,page_id uuid);
      CREATE TABLE contact_purchases(id uuid PRIMARY KEY,contact_id uuid,amount_minor bigint);
      CREATE TABLE contact_profile_jobs(id uuid PRIMARY KEY,page_id uuid,contact_id uuid,status text);
      CREATE TABLE chatbot_contact_states(page_id uuid,contact_id uuid,collected_details jsonb);`);
    await db.exec(readFileSync('supabase/migrations/202611050010_veo_workspace.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/202611150104_suno_tenant_launch.sql', 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
    await db.exec('TRUNCATE users,pages,contacts,user_pages,campaigns,contact_purchases,contact_profile_jobs,chatbot_contact_states,veo_tenants,veo_accounts,veo_archive_records,veo_audit CASCADE');
    for (const n of [1, 2, 3]) {
        await db.query('INSERT INTO users(id,email,name) VALUES($1,$2,$3)', [id(n), `owner${n}@example.test`, `Owner ${n}`]);
        await db.query('INSERT INTO pages(id,fb_page_id,name) VALUES($1,$2,$3)', [id(n + 10), String(n), `Page ${n}`]);
        await db.query('INSERT INTO user_pages VALUES($1,$2)', [id(n), id(n + 10)]);
        await db.query('INSERT INTO contacts(id,page_id,name) VALUES($1,$2,$3)', [id(n + 20), id(n + 10), `Customer ${n}`]);
        await db.query("INSERT INTO campaigns VALUES($1,$2,now(),$3,'scheduled')", [id(n + 30), id(n + 10), id(n)]);
        await db.query("INSERT INTO contact_profile_jobs VALUES($1,$2,$3,'pending')", [id(n + 40), id(n + 10), id(n + 20)]);
        await db.query('INSERT INTO contact_purchases VALUES($1,$2,49900)', [id(n + 50), id(n + 20)]);
    }
});
const launch = async (owner: string, pages: Array<string | null> | null) =>
    (await db.query<{ tenant: string }>('SELECT veo_launch($1,$2) AS tenant', [owner, pages])).rows[0].tenant;
const rows = async (table: string) => (await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;

it('launches a second tenant without unbinding Pages, revoking grants, cancelling work or exposing the first tenant archive', async () => {
    const first = await launch(id(1), [id(11)]);
    const untouched = ['users', 'pages', 'user_pages', 'contacts', 'campaigns', 'contact_profile_jobs', 'contact_purchases'];
    const before = Object.fromEntries(await Promise.all(untouched.map(async table => [table, await rows(table)])));
    const tenantBefore = (await db.query('SELECT * FROM veo_tenants WHERE id=$1', [first])).rows;
    const firstArchive = (await db.query('SELECT * FROM veo_archive_records WHERE tenant_id=$1 ORDER BY source_table,record_key', [first])).rows;
    const second = await launch(id(2), [id(12)]);
    expect(second).not.toBe(first);
    expect((await db.query('SELECT * FROM veo_tenants WHERE id=$1', [first])).rows).toEqual(tenantBefore);
    expect((await db.query('SELECT * FROM veo_archive_records WHERE tenant_id=$1 ORDER BY source_table,record_key', [first])).rows).toEqual(firstArchive);
    for (const table of untouched.filter(t => !['users', 'pages'].includes(t))) expect(await rows(table)).toEqual(before[table]);
    expect((await db.query('SELECT * FROM pages WHERE id=$1', [id(11)])).rows[0]).toMatchObject({ veo_tenant_id: first, veo_enabled: true });
    expect((await db.query('SELECT * FROM pages WHERE id=$1', [id(13)])).rows[0]).toMatchObject({ veo_tenant_id: null, veo_enabled: false });
    const archive = (await db.query<any>('SELECT source_table,record FROM veo_archive_records WHERE tenant_id=$1', [second])).rows;
    expect(archive).toHaveLength(3);
    expect(archive.find(r => r.source_table === 'contacts').record.id).toBe(id(22));
    expect(archive.find(r => r.source_table === 'campaigns').record.id).toBe(id(32));
    expect(archive.find(r => r.source_table === 'contact_purchases').record.contact_id).toBe(id(22));
    expect(JSON.stringify(archive)).not.toContain('Customer 1');
    expect(JSON.stringify(archive)).not.toContain('Customer 3');
});
it('rejects a foreign Page even when an old user_pages grant names the new owner', async () => {
    await launch(id(1), [id(11)]);
    await db.query('INSERT INTO user_pages VALUES($1,$2)', [id(2), id(11)]);
    const before = await rows('veo_tenants');
    await expect(launch(id(2), [id(11), id(12)])).rejects.toThrow('another workspace');
    expect(await rows('veo_tenants')).toEqual(before);
});
it('retries the same launch without changing its cutoff, archive, grants or audit', async () => {
    const tenant = await launch(id(1), [id(11)]);
    const before = await Promise.all(['veo_tenants', 'veo_archive_records', 'veo_audit', 'user_pages'].map(rows));
    expect(await launch(id(1), [id(11)])).toBe(tenant);
    expect(await Promise.all(['veo_tenants', 'veo_archive_records', 'veo_audit', 'user_pages'].map(rows))).toEqual(before);
});
it('rejects empty, null, duplicate, nonexistent and ungranted Page inputs before creating a tenant', async () => {
    for (const pages of [null, [], [null], [id(11), id(11)], [id(99)], [id(12)]]) {
        await expect(launch(id(1), pages)).rejects.toThrow();
        expect(await rows('veo_tenants')).toEqual([]);
    }
});
it('rejects inactive owners and existing members trying to create another tenant', async () => {
    const tenant = await launch(id(1), [id(11)]);
    await db.query("INSERT INTO veo_accounts VALUES($1,$2,'member',$3,true)", [id(2), tenant, id(1)]);
    await expect(launch(id(2), [id(12)])).rejects.toThrow('another workspace');
    await db.query('UPDATE users SET is_active=false WHERE id=$1', [id(3)]);
    await expect(launch(id(3), [id(13)])).rejects.toThrow('active existing owner');
});
it('keeps adding new Pages on the existing Owner connection path', async () => {
    const tenant = await launch(id(1), [id(11)]);
    await db.query('INSERT INTO user_pages VALUES($1,$2)', [id(1), id(13)]);
    await expect(launch(id(1), [id(13)])).rejects.toThrow('Owner Page connections');
    expect((await db.query('SELECT veo_tenant_id FROM pages WHERE id=$1', [id(13)])).rows[0]).toEqual({ veo_tenant_id: null });
    expect((await db.query('SELECT tenant_id FROM veo_accounts WHERE user_id=$1', [id(1)])).rows[0]).toEqual({ tenant_id: tenant });
});
it('denies public SQL/API roles access to tenant launch', async () => {
    for (const role of ['anon', 'authenticated']) {
        expect((await db.query<any>("SELECT has_function_privilege($1,'veo_launch(uuid,uuid[])','EXECUTE') AS allowed", [role])).rows[0].allowed).toBe(false);
    }
});
it('uses a prepared owner tenant without creating a duplicate or changing unrelated identities', async () => {
    await db.query('INSERT INTO veo_tenants(id,owner_id) VALUES($1,$2)', [id(70), id(1)]);
    await db.query("INSERT INTO veo_accounts VALUES($1,$2,'owner',NULL,true)", [id(1), id(70)]);
    const otherUsers = (await db.query('SELECT * FROM users WHERE id<>$1 ORDER BY id', [id(1)])).rows;
    expect(await launch(id(1), [id(11)])).toBe(id(70));
    expect((await db.query('SELECT name FROM veo_tenants')).rows).toEqual([{ name: 'Suno' }]);
    expect((await db.query('SELECT * FROM users WHERE id<>$1 ORDER BY id', [id(1)])).rows).toEqual(otherUsers);
});
it('rolls back tenant creation and partial archive work when an archive relation has no reviewed Page ownership', async () => {
    await db.exec('BEGIN; ALTER TABLE contact_purchases DROP COLUMN contact_id; SAVEPOINT attempted_launch');
    try {
        await expect(launch(id(1), [id(11)])).rejects.toThrow('Review the Page ownership');
        await db.exec('ROLLBACK TO SAVEPOINT attempted_launch');
        expect(await rows('veo_tenants')).toEqual([]);
        expect(await rows('veo_archive_records')).toEqual([]);
        expect((await db.query<{ role: string | null }>('SELECT role FROM users WHERE id=$1', [id(1)])).rows[0].role).toBeNull();
        expect((await db.query<{ veo_tenant_id: string | null }>('SELECT veo_tenant_id FROM pages WHERE id=$1', [id(11)])).rows[0].veo_tenant_id).toBeNull();
    } finally { await db.exec('ROLLBACK'); }
});
