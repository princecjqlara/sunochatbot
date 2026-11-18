import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { restoreSunoSchema } from './lib/suno-schema-rehearsal.mjs';
import { sunoIncrementalPlan } from './lib/suno-incremental-plan.mjs';
import { saveSunoSettings, restoreSunoSettings } from './lib/suno-retained-settings.mjs';
import { initializeWorkspaceRuntime, workspaceSql, restoreRetainedRuntime, retainedDataFingerprint, assertRetainedData, runtimeManifest, saveRetainedTableKeys, restoreRetainedValues, runtimeUpgradeFingerprint } from './lib/suno-runtime-preservation.mjs';
import { restorePrivateSunoBackup } from './lib/restore-private-suno-backup.mjs';
const snapshot = JSON.parse(fs.readFileSync('.private/suno-schema.json', 'utf8'));
const plan = sunoIncrementalPlan(snapshot);
const backupDirectory = process.argv.find(arg=>arg.startsWith('--backup='))?.slice('--backup='.length);
const db = await PGlite.create({ extensions: { 'uuid-ossp': uuid_ossp, pg_trgm, vector } });
const report = { passed: false, production_writes: 0, schema_sha256: plan.schema_sha256, pending: plan.pending.map(({name,sha256})=>({name,sha256})), applied: [], runtime: runtimeManifest(snapshot) };
report.upgrade_fingerprint=runtimeUpgradeFingerprint(snapshot,plan);
let stage = 'restore', migration;
try {
    await db.exec('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS vector;');
    await restoreSunoSchema(db, snapshot);
    if (backupDirectory) {
        stage = 'restore_encrypted_data';
        report.real_data_restore = await restorePrivateSunoBackup(db,snapshot,backupDirectory);
    } else await db.exec(`INSERT INTO users(id,email,name) VALUES('00000000-0000-4000-8000-000000000001','preserved@example.test','Retained owner');
        INSERT INTO pages(id,fb_page_id,name,access_token) VALUES('00000000-0000-4000-8000-000000000002','100','Suno Page','fixture');
        INSERT INTO user_pages(user_id,page_id) VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
        INSERT INTO contacts(id,page_id,psid,name) VALUES('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','200','Retained customer');
        INSERT INTO chatbot_configs(page_id,enabled,instructions,details_completion_percent) VALUES('00000000-0000-4000-8000-000000000002',true,'SONG_BRIEF_FORM: hiraya-seven-fields',26);
        INSERT INTO chatbot_contact_states(page_id,contact_id,collected_details,conversation_price_quote,conversation_price_quoted_at,form_sent_at,human_pause_status) VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','{"Song duration":"60 seconds"}','Staff quote: PHP 499 for one song',now(),now(),'held');
        INSERT INTO chatbot_follow_up_jobs(page_id,contact_id,anchor_inbound_at,schedule_type,sequence_index,due_at,message_text,status) VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003',now(),'response',0,now()+interval '1 hour','Preserved pending follow-up','pending');
        INSERT INTO chatbot_message_deliveries(page_id,contact_id,source_key,message_text,normalized_text,message_hash,status,message_id,sent_at) VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','retained-send','Already sent','already sent',md5('already sent'),'sent','prior-message',now());`);
    const before = await retainedDataFingerprint(db, snapshot);
    const originalTags = (await db.query('SELECT to_jsonb(t) AS data FROM tags t')).rows.map(r=>r.data);
    stage = 'migrate';
    await db.exec('BEGIN');
    await saveRetainedTableKeys(db, snapshot);
    await saveSunoSettings(db);
    await initializeWorkspaceRuntime(db, snapshot);
    for (const item of plan.pending) {
        migration = item.name;
        await db.exec(workspaceSql(item.sql, snapshot).replace(/CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;/g, '-- offline scheduler stub'));
        report.applied.push(item.name);
    }
    stage = 'restore_runtime';
    await restoreSunoSettings(db, snapshot.columns);
    report.retained_value_restoration = await restoreRetainedValues(db,snapshot);
    await restoreRetainedRuntime(db, snapshot);
    stage = 'verify_data';
    const after = await retainedDataFingerprint(db, snapshot, {originalKeysOnly:true});
    report.source_table_fingerprints = {before,after};
    const actualTags = (await db.query('SELECT to_jsonb(t) AS data FROM tags t')).rows.map(r=>r.data);
    report.fixture_tag_changes = originalTags.map(old=>({id:old.id,changed_columns:Object.keys(old).filter(k=>JSON.stringify(old[k])!==JSON.stringify(actualTags.find(t=>t.id===old.id)?.[k]))})).filter(row=>row.changed_columns.length);
    report.retained_data = assertRetainedData(before, after);
    for (const fn of snapshot.functions) {
        const actual = (await db.query('SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname=$2 AND pg_get_function_identity_arguments(p.oid)=$3', [fn.schema, fn.name, fn.arguments])).rows[0]?.definition;
        if (actual !== fn.definition) throw Error('Original function definition changed: ' + fn.schema + '.' + fn.name);
    }
    report.functions_preserved = snapshot.functions.length;
    for (const col of snapshot.columns) {
        const actual = (await db.query('SELECT format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2 AND a.attname=$3 AND a.attnum>0 AND NOT a.attisdropped', [col.schema,col.table_name,col.name])).rows[0];
        if (!actual || actual.type !== col.type || col.not_null && !actual.not_null) throw Error('Retained column changed: ' + col.table_name + '.' + col.name);
    }
    report.columns_preserved = snapshot.columns.length;
    const originalTriggerNames = new Set(snapshot.triggers.map(t=>t.table_name+'.'+t.name));
    report.additional_legacy_triggers = (await db.query("SELECT c.relname AS table_name,t.tgname AS name,p.proname AS function_name,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname")).rows.filter(t=>snapshot.tables.some(old=>old.schema==='public'&&old.name===t.table_name)&&!originalTriggerNames.has(t.table_name+'.'+t.name));
    const reference = JSON.parse(fs.readFileSync('../outputs/veo-suno-audit-2026-11-17/veo-live-database.json','utf8'));
    const installed = new Set((await db.query("SELECT table_name||'.'||column_name AS name FROM information_schema.columns WHERE table_schema='public'")).rows.map(r=>r.name));
    report.missing_reference_fields = reference.columns.filter(c=>!installed.has(c.table_name+'.'+c.column_name)).map(c=>c.table_name+'.'+c.column_name);
    if (report.missing_reference_fields.length) throw Error('Veo schema fields remain missing: ' + report.missing_reference_fields.slice(0,8).join(', '));
    report.anon_definer_functions = (await db.query("SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','app_private') AND p.prosecdef AND has_function_privilege('anon',p.oid,'execute') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')")).rows;
    if (report.anon_definer_functions.length) throw Error('Anonymous worker RPC access remains');
    stage = 'retained_bot_control_checks';
    await db.exec('SAVEPOINT retained_bot_controls');
    const probe = (await db.query('SELECT page_id,contact_id,human_pause_status,human_hold_reason,human_resume_at,conversation_price_quote,collected_details FROM chatbot_contact_states ORDER BY contact_id LIMIT 1')).rows[0];
    if (!probe) throw Error('A retained state is required to verify bot controls');
    await db.query('UPDATE contacts SET chatbot_enabled=false WHERE id=$1 AND page_id=$2',[probe.contact_id,probe.page_id]);
    let held=(await db.query('SELECT * FROM chatbot_contact_states WHERE contact_id=$1 AND page_id=$2',[probe.contact_id,probe.page_id])).rows[0];
    if (held.human_pause_status!=='held'||held.human_hold_reason!=='suno_workspace_disabled') throw Error('Workspace off control did not reach the retained hold contract');
    if(JSON.stringify(held.collected_details)!==JSON.stringify(probe.collected_details)||held.conversation_price_quote!==probe.conversation_price_quote)throw Error('Off control changed answers or the retained quote');
    await db.query('UPDATE chatbot_contact_states SET human_pause_status=$1,human_hold_reason=NULL WHERE contact_id=$2 AND page_id=$3',['paused',probe.contact_id,probe.page_id]);
    held=(await db.query('SELECT human_pause_status,human_hold_reason FROM chatbot_contact_states WHERE contact_id=$1 AND page_id=$2',[probe.contact_id,probe.page_id])).rows[0];
    if(held.human_pause_status!=='held'||held.human_hold_reason!=='suno_workspace_disabled')throw Error('A later human-state update bypassed the explicit off control');
    await db.query('UPDATE contacts SET chatbot_enabled=true WHERE id=$1 AND page_id=$2',[probe.contact_id,probe.page_id]);
    const resumed=(await db.query('SELECT human_pause_status,human_hold_reason,suno_workspace_hold_snapshot FROM chatbot_contact_states WHERE contact_id=$1 AND page_id=$2',[probe.contact_id,probe.page_id])).rows[0];
    if(resumed.human_pause_status!=='paused'||resumed.suno_workspace_hold_snapshot!==null)throw Error('Re-enabling did not restore the latest retained human control');
    await db.exec('ROLLBACK TO SAVEPOINT retained_bot_controls;RELEASE SAVEPOINT retained_bot_controls');
    assertRetainedData(before,await retainedDataFingerprint(db,snapshot,{originalKeysOnly:true}));
    report.retained_bot_controls={off_reaches_original_hold:true,later_manual_changes_do_not_bypass_off:true,re_enable_restores_prior_control:true,answers_and_quotes_preserved:true,savepoint_rolled_back:true};
    stage='workspace_enrollment_checks';
    await db.exec('SAVEPOINT workspace_enrollment_checks');
    const owner=(await db.query('SELECT u.id,array_agg(up.page_id ORDER BY up.page_id) AS pages FROM users u JOIN user_pages up ON up.user_id=u.id WHERE u.is_active GROUP BY u.id ORDER BY u.id LIMIT 1')).rows[0];
    const tenant=(await db.query('SELECT suno_enroll_retained_workspace($1,$2::uuid[]) AS id',[owner.id,owner.pages])).rows[0].id;
    const access=(await db.query('SELECT veo_access_context($1) AS scope',[owner.id])).rows[0].scope;
    if(access?.role!=='owner'||access.tenant_id!==tenant||access.page_ids.length!==owner.pages.length)throw Error('Retained owner did not receive complete workspace Page scope');
    const contacts=(await db.query('SELECT count(*)::text AS n FROM contacts WHERE page_id=ANY($1::uuid[])',[owner.pages])).rows[0].n;
    assertRetainedData(before,await retainedDataFingerprint(db,snapshot,{originalKeysOnly:true}));
    report.workspace_enrollment={retained_owner_scope:true,page_count:owner.pages.length,retained_contact_count:Number(contacts),legacy_rows_and_identity_unchanged:true};
    const pendingPolicy=(await db.query('SELECT suno_workspace_policy_status($1) AS policy',[owner.id])).rows[0].policy;
    if(pendingPolicy.confirmed!==false)throw Error('A financial policy was adopted without Owner confirmation');
    await db.exec('SAVEPOINT unconfirmed_finance');
    let blocked=false;
    try{await db.query('SELECT suno_require_earnings_policy($1)',[owner.id]);}catch{blocked=true;await db.exec('ROLLBACK TO SAVEPOINT unconfirmed_finance');}
    await db.exec('RELEASE SAVEPOINT unconfirmed_finance');
    if(!blocked)throw Error('Unconfirmed earnings policy did not block financial effects');
    const confirmed=(await db.query('SELECT suno_confirm_earnings_policy($1,$2) AS policy',[owner.id,'veo_current'])).rows[0].policy;
    if(confirmed.confirmed!==true)throw Error('Owner policy confirmation did not save');
    await db.query('SELECT suno_require_earnings_policy($1)',[owner.id]);
    report.financial_policy_guard={unconfirmed_blocked:true,owner_confirmation_verified_offline:true,production_policy_adopted:false};
    const customer=(await db.query('SELECT c.id,c.page_id,c.psid,p.fb_page_id FROM contacts c JOIN pages p ON p.id=c.page_id WHERE c.page_id=ANY($1::uuid[]) ORDER BY c.id LIMIT 1',[owner.pages])).rows[0];
    const event={facebook_page_id:customer.fb_page_id,event_key:'suno:offline:observation-check',occurred_at:new Date().toISOString(),kind:'messaging',payload:{object:'page',entry:[{id:customer.fb_page_id,messaging:[{timestamp:Date.now(),sender:{id:customer.psid},recipient:{id:customer.fb_page_id},message:{mid:'suno-offline-observation-check',text:'Offline observation fixture'}}]}]}};
    await db.query('SELECT suno_capture_retained_events($1::jsonb)',[JSON.stringify([event,event])]);
    const observed=(await db.query("SELECT count(*)::int AS n,bool_and(status='done') AS done FROM veo_event_inbox WHERE event_key=$1",[event.event_key])).rows[0];
    if(observed.n!==1||!observed.done)throw Error('Retained observations were duplicated or queued a second reply');
    assertRetainedData(before,await retainedDataFingerprint(db,snapshot,{originalKeysOnly:true}));
    report.retained_observation={retry_deduplication:true,no_second_reply_queued:true,legacy_data_unchanged:true};
    await db.exec('ROLLBACK TO SAVEPOINT workspace_enrollment_checks;RELEASE SAVEPOINT workspace_enrollment_checks');
    report.passed = true;
    if (backupDirectory) {
        const filename = backupDirectory + '/manifest.json';
        const manifest = JSON.parse(fs.readFileSync(filename,'utf8'));
        manifest.restore_verified = true;
        manifest.restore_verified_at = new Date().toISOString();
        manifest.upgrade_rehearsal_passed = true;
        fs.writeFileSync(filename,JSON.stringify(manifest,null,2)+'\n');
    }
    await db.exec('ROLLBACK');
} catch (error) {
    report.failure = { stage, migration, code: error.code || null, message: String(error.message).slice(0,400) };
    process.exitCode = 1;
} finally {
    await db.close();
    fs.mkdirSync('verification', { recursive: true });
    fs.writeFileSync('verification/'+(backupDirectory?'real-data-runtime-upgrade-rehearsal.json':'runtime-upgrade-rehearsal.json'), JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({passed:report.passed,applied:report.applied.length,functions_preserved:report.functions_preserved,columns_preserved:report.columns_preserved,failure:report.failure||null}));
}
