import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { sqlIdentifier as q } from './database-migration-safety.mjs';

// Workspace upgrades get separate implementations of pre-existing RPCs/views.
// The running chatbot keeps the original names, bodies, triggers and defaults.
export function runtimeAliases(snapshot) {
    const names = [...new Set([...snapshot.functions.map(f => f.name), ...snapshot.views.map(v => v.name)])];
    return Object.fromEntries(names.map(name => [name, 'suno_workspace_' + name]));
}

export function workspaceSql(sql, snapshot) {
    const aliases = runtimeAliases(snapshot);
    const pattern = new RegExp('(?<![a-zA-Z0-9_])(' + Object.keys(aliases).sort((a,b)=>b.length-a.length).join('|') + ')(?![a-zA-Z0-9_])', 'g');
    return sql.replace(pattern, name => aliases[name]);
}

export async function initializeWorkspaceRuntime(db, snapshot) {
    await db.exec("CREATE TABLE IF NOT EXISTS app_private.suno_retained_runtime_installation(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),source_project text NOT NULL,installed_at timestamptz NOT NULL DEFAULT now()); REVOKE ALL ON app_private.suno_retained_runtime_installation FROM PUBLIC,anon,authenticated");
    await db.query('INSERT INTO app_private.suno_retained_runtime_installation(singleton,source_project) VALUES(true,$1) ON CONFLICT(singleton) DO NOTHING',[snapshot.project]);
    for (const fn of snapshot.functions) await db.exec(workspaceSql(fn.definition, snapshot));
    for (const view of snapshot.views) await db.exec('CREATE VIEW ' + q(view.schema) + '.' + q(runtimeAliases(snapshot)[view.name]) + ' AS ' + workspaceSql(view.definition, snapshot));
}

export async function restoreRetainedRuntime(db, snapshot) {
    // Restore the real legacy functions even if a later migration adds a helper
    // through dynamic SQL. These names remain the live chatbot's RPC contract.
    for (const fn of snapshot.functions) await db.exec(fn.definition);
    for (const trigger of snapshot.triggers) {
        await db.exec('DROP TRIGGER IF EXISTS ' + q(trigger.name) + ' ON ' + q(trigger.schema) + '.' + q(trigger.table_name));
        await db.exec(trigger.definition);
    }
    const protectedTables = {
        chatbot_configs: ['chatbot_commercial_policy','chatbot_continuation_activation','chatbot_recovery_enrollment'],
        chatbot_contact_states: ['chatbot_ownership','chatbot_cancel_jobs_after_pause','suno_chatbot_reset_compatibility'],
        contacts: ['chatbot_stop_after_contact_control']
    };
    for (const [table,names] of Object.entries(protectedTables)) {
        for (const name of names) {
            if (snapshot.triggers.some(t=>t.table_name===table&&t.name===name)) throw Error('Refusing to disable a retained trigger: '+name);
            await db.exec('ALTER TABLE public.'+q(table)+' DISABLE TRIGGER '+q(name));
        }
    }
    for (const column of snapshot.columns.filter(c => !c.generated && !c.identity)) {
        await db.exec('ALTER TABLE ' + q(column.schema) + '.' + q(column.table_name) + ' ALTER COLUMN ' + q(column.name) + (column.default_sql ? ' SET DEFAULT ' + column.default_sql : ' DROP DEFAULT'));
    }
    // Source workers, exports and queues are private server capabilities.
    const functions = (await db.query("SELECT p.oid::regprocedure::text AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','app_private') AND p.prokind='f' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')")).rows;
    for (const fn of functions) await db.exec('REVOKE ALL ON FUNCTION ' + fn.signature + ' FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION ' + fn.signature + ' TO service_role');
    for (const table of snapshot.tables.filter(t=>t.schema==='public')) await db.exec('ALTER TABLE public.' + q(table.name) + ' ENABLE ROW LEVEL SECURITY');
    await db.exec('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role');
}

export async function saveRetainedTableKeys(db, snapshot) {
    for (const table of snapshot.tables.filter(t => t.schema === 'public')) {
        const key = snapshot.constraints.find(c=>c.schema===table.schema && c.table_name===table.name && c.type==='p');
        if (!key) throw Error('A retained table has no primary key: ' + table.name);
        const columns = key.definition.match(/^PRIMARY KEY \((.+)\)/)?.[1].split(',').map(name=>name.trim().replaceAll('"',''));
        if (!columns?.length) throw Error('Cannot preserve primary key: ' + table.name);
        await db.exec('CREATE TEMP TABLE ' + q('suno_retained_keys_' + table.name) + ' AS SELECT * FROM public.' + q(table.name));
    }
}

export async function restoreRetainedValues(db,snapshot) {
    const restored=[];
    for(const table of snapshot.tables.filter(t=>t.schema==='public')) {
        const key=snapshot.constraints.find(c=>c.schema===table.schema&&c.table_name===table.name&&c.type==='p');
        const keys=key.definition.match(/^PRIMARY KEY \((.+)\)/)[1].split(',').map(name=>name.trim().replaceAll('"',''));
        const columns=snapshot.columns.filter(c=>c.schema===table.schema&&c.table_name===table.name&&!c.generated&&!c.identity&&!keys.includes(c.name));
        if(!columns.length)continue;
        const target=q(table.schema)+'.'+q(table.name),saved='pg_temp.'+q('suno_retained_keys_'+table.name);
        const join=keys.map(k=>'live.'+q(k)+'=saved.'+q(k)).join(' AND ');
        const different=columns.map(c=>'live.'+q(c.name)+' IS DISTINCT FROM saved.'+q(c.name)).join(' OR ');
        const changed=Number((await db.query('SELECT count(*)::text AS n FROM '+target+' live JOIN '+saved+' saved ON '+join+' WHERE '+different)).rows[0].n);
        if(!changed)continue;
        const states=(await db.query("SELECT t.tgname,t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2 AND NOT t.tgisinternal",[table.schema,table.name])).rows;
        await db.exec('ALTER TABLE '+target+' DISABLE TRIGGER USER');
        await db.exec('UPDATE '+target+' live SET '+columns.map(c=>q(c.name)+'=saved.'+q(c.name)).join(',')+' FROM '+saved+' saved WHERE '+join+' AND ('+different+')');
        for(const trigger of states)await db.exec('ALTER TABLE '+target+' '+({O:'ENABLE TRIGGER',D:'DISABLE TRIGGER',R:'ENABLE REPLICA TRIGGER',A:'ENABLE ALWAYS TRIGGER'}[trigger.tgenabled])+' '+q(trigger.tgname));
        restored.push({table:table.name,rows:changed});
    }
    return restored;
}

export async function retainedDataFingerprint(db, snapshot, { originalKeysOnly = false } = {}) {
    const result = {};
    for (const table of snapshot.tables.filter(t => t.schema === 'public')) {
        const columns = snapshot.columns.filter(c => c.schema === table.schema && c.table_name === table.name).map(c => q(c.name));
        const key = snapshot.constraints.find(c=>c.schema===table.schema && c.table_name===table.name && c.type==='p');
        const keys = key?.definition.match(/^PRIMARY KEY \((.+)\)/)?.[1].split(',').map(name=>name.trim().replaceAll('"','')) || [];
        const where = originalKeysOnly ? ' WHERE EXISTS(SELECT 1 FROM pg_temp.' + q('suno_retained_keys_' + table.name) + ' retained WHERE ' + keys.map(k=>'retained.'+q(k)+'=source.'+q(k)).join(' AND ') + ')' : '';
        const sql = 'SELECT count(*)::text AS rows, md5(coalesce(string_agg(row_hash,\'\' ORDER BY row_hash),\'\')) AS fingerprint FROM (SELECT md5(to_jsonb(t)::text) AS row_hash FROM (SELECT ' + columns.map(c=>'source.'+c).join(',') + ' FROM ' + q(table.schema) + '.' + q(table.name) + ' source' + where + ') t) hashes';
        result[table.name] = (await db.query(sql)).rows[0];
    }
    return result;
}

export function assertRetainedData(before, after) {
    const changed = Object.keys(before).filter(name => JSON.stringify(before[name]) !== JSON.stringify(after[name]));
    if (changed.length) throw Error('Retained source data changed: ' + changed.join(', '));
    return { tables: Object.keys(before).length, rows: Object.values(before).reduce((n,r)=>n+Number(r.rows),0), changed: [] };
}

export function runtimeManifest(snapshot) {
    return { source_project: snapshot.project, aliases: runtimeAliases(snapshot),
        original_functions: snapshot.functions.map(fn => ({ schema: fn.schema, name: fn.name, arguments: fn.arguments, sha256: createHash('sha256').update(fn.definition).digest('hex') })),
        preserved_triggers: snapshot.triggers.map(t => t.schema + '.' + t.table_name + '.' + t.name),
        existing_columns: snapshot.columns.length };
}

export function runtimeUpgradeFingerprint(snapshot,plan) {
    const hash=createHash('sha256').update(JSON.stringify(snapshot));
    for(const item of plan.pending)hash.update(item.name).update(item.sha256).update(workspaceSql(item.sql,snapshot));
    for(const file of ['suno-runtime-preservation.mjs','transactional-migration-sql.mjs','suno-incremental-plan.mjs','database-migration-safety.mjs','suno-retained-settings.mjs'])hash.update(fs.readFileSync(new URL(file,import.meta.url)));
    return hash.digest('hex');
}
