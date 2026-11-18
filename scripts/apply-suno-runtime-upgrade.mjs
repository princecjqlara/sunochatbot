// Apply only the exact, restored-data rehearsal to the retained Suno database.
import fs from 'node:fs';
import pg from 'pg';
import {assertProjectCredentials,sqlIdentifier as q} from './lib/database-migration-safety.mjs';
import {sunoIncrementalPlan} from './lib/suno-incremental-plan.mjs';
import {saveSunoSettings,restoreSunoSettings} from './lib/suno-retained-settings.mjs';
import {initializeWorkspaceRuntime,workspaceSql,restoreRetainedRuntime,retainedDataFingerprint,assertRetainedData,saveRetainedTableKeys,restoreRetainedValues,runtimeUpgradeFingerprint} from './lib/suno-runtime-preservation.mjs';

const snapshot=JSON.parse(fs.readFileSync('.private/suno-schema.json','utf8'));
const plan=sunoIncrementalPlan(snapshot),fingerprint=runtimeUpgradeFingerprint(snapshot,plan);
const proof=JSON.parse(fs.readFileSync('verification/real-data-runtime-upgrade-rehearsal.json','utf8'));
const backup=JSON.parse(fs.readFileSync('.private/latest-suno-backup.json','utf8'));
const manifest=JSON.parse(fs.readFileSync(backup.manifest,'utf8'));
if(!proof.passed||proof.upgrade_fingerprint!==fingerprint||proof.real_data_restore?.backup_id!==manifest.id||!manifest.complete||!manifest.restore_verified||!manifest.upgrade_rehearsal_passed)throw Error('A successful encrypted real-data restore and rehearsal of this exact upgrade are required');
if(!proof.workspace_enrollment?.legacy_rows_and_identity_unchanged||!proof.retained_observation?.no_second_reply_queued)throw Error('Enrollment and retained event proofs are required');
const checked=assertProjectCredentials(process.env,'cxgynadprukyeuqbchbs');
const client=new pg.Client({connectionString:checked.connectionString,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000,query_timeout:180000});
client.on('error',()=>{});
let pending=[];
const flush=async()=>{if(pending.length){const sql=pending.join('\n;\n');pending=[];await client.query(sql);}};
// Buffer independent DDL to avoid a network round trip per statement while locked.
const db={exec:async sql=>{pending.push(sql);},query:async(sql,args)=>{await flush();return client.query(sql,args);}};
const report={passed:false,project:snapshot.project,backup_id:manifest.id,upgrade_fingerprint:fingerprint,started_at:new Date().toISOString(),applied:[],committed:false};
let stage='connect';
try{
 await client.connect();
 await client.query('BEGIN');
 await client.query("SET LOCAL timezone='UTC';SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';SET LOCAL idle_in_transaction_session_timeout='240s'");
 await client.query('SELECT pg_advisory_xact_lock(76111801)');
 stage='lock_retained_tables';
 await client.query('LOCK TABLE '+snapshot.tables.filter(t=>t.schema==='public').map(t=>'public.'+q(t.name)).join(',')+' IN ACCESS EXCLUSIVE MODE');
 stage='validate_baseline';
 const installed=(await client.query("SELECT to_regclass('app_private.suno_retained_runtime_installation') IS NOT NULL AS present")).rows[0].present;
 if(installed)throw Error('This one-time upgrade is already installed; inspect its receipt before continuing');
 const functions=(await client.query("SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','app_private') AND p.prokind IN('f','p') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e') ORDER BY 1,2")).rows;
 if(JSON.stringify(functions)!==JSON.stringify(snapshot.functions))throw Error('Live functions differ from the rehearsed baseline');
 const receipts=(await client.query('SELECT filename,sha256 FROM app_private.sunobot_migration_files ORDER BY filename')).rows;
 const expected=snapshot.filenames.map(({filename,sha256})=>({filename,sha256})).sort((a,b)=>a.filename.localeCompare(b.filename));
 if(JSON.stringify(receipts)!==JSON.stringify(expected))throw Error('Live migration receipts differ from the rehearsed baseline');
 const cronBefore=(await client.query('SELECT jobid,jobname,schedule,md5(command) AS command_hash,active FROM cron.job ORDER BY jobid')).rows;
 const before=await retainedDataFingerprint(db,snapshot);
 await saveRetainedTableKeys(db,snapshot);await saveSunoSettings(db);await initializeWorkspaceRuntime(db,snapshot);
 stage='apply_additive_workspace_schema';
 for(const item of plan.pending){await db.exec(workspaceSql(item.sql,snapshot));report.applied.push(item.name);}
 await flush();
 stage='restore_retained_runtime_and_values';
 await restoreSunoSettings(db,snapshot.columns);
 report.retained_values_restored=await restoreRetainedValues(db,snapshot);
 await restoreRetainedRuntime(db,snapshot);await flush();
 report.retained_data=assertRetainedData(before,await retainedDataFingerprint(db,snapshot,{originalKeysOnly:true}));
 stage='enroll_retained_owner';
 const owner='1e56fd95-56af-4aca-b50f-89a48c083249';
 const pages=(await db.query('SELECT page_id FROM user_pages WHERE user_id=$1 ORDER BY page_id',[owner])).rows.map(r=>r.page_id);
 if(pages.length!==13)throw Error('Retained Page grants changed; review enrollment scope');
 const tenant=(await db.query('SELECT suno_enroll_retained_workspace($1,$2::uuid[]) AS id',[owner,pages])).rows[0].id;
 const scope=(await db.query('SELECT veo_access_context($1) AS scope',[owner])).rows[0].scope;
 if(scope?.role!=='owner'||scope.page_ids.length!==pages.length||scope.tenant_id!==tenant)throw Error('Owner scope is incomplete');
 report.enrollment={tenant_id:tenant,page_count:pages.length,identity_unchanged:true};
 report.retained_data=assertRetainedData(before,await retainedDataFingerprint(db,snapshot,{originalKeysOnly:true}));
 stage='verify_schema_and_capabilities';
 const currentFunctions=(await db.query("SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','app_private') AND p.prokind IN('f','p')")).rows;
 for(const fn of snapshot.functions)if(!currentFunctions.some(f=>f.schema===fn.schema&&f.name===fn.name&&f.arguments===fn.arguments&&f.definition===fn.definition))throw Error('A retained function changed');
 report.functions_preserved=snapshot.functions.length;
 const columns=(await db.query("SELECT n.nspname AS schema,c.relname AS table_name,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,pg_get_expr(d.adbin,d.adrelid) AS default_sql FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname IN('public','app_private') AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped")).rows;
 for(const old of snapshot.columns){const col=columns.find(c=>c.schema===old.schema&&c.table_name===old.table_name&&c.name===old.name);if(!col||col.type!==old.type||(old.not_null&&!col.not_null)||(!old.identity&&!old.generated&&col.default_sql!==old.default_sql))throw Error('A retained column contract changed');}
 report.columns_preserved=snapshot.columns.length;
 const reference=JSON.parse(fs.readFileSync('../outputs/veo-suno-audit-2026-11-17/veo-live-database.json','utf8'));
 const fields=new Set((await db.query("SELECT table_name||'.'||column_name AS name FROM information_schema.columns WHERE table_schema='public'")).rows.map(c=>c.name));
 report.missing_reference_fields=reference.columns.filter(c=>!fields.has(c.table_name+'.'+c.column_name)).map(c=>c.table_name+'.'+c.column_name);
 if(report.missing_reference_fields.length)throw Error('Reference fields remain missing');
 const exposed=(await db.query("SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','app_private') AND p.prosecdef AND has_function_privilege('anon',p.oid,'execute') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')")).rows[0].n;
 if(exposed)throw Error('Anonymous worker function access remains');
 const cronAfter=(await db.query('SELECT jobid,jobname,schedule,md5(command) AS command_hash,active FROM cron.job ORDER BY jobid')).rows;
 if(cronBefore.some(job=>!cronAfter.some(row=>JSON.stringify(row)===JSON.stringify(job))))throw Error('An existing database schedule changed');
 report.retained_schedules=cronBefore.length;
 await db.exec('CREATE TABLE app_private.suno_workspace_migration_files(filename text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now(),project_ref text NOT NULL);REVOKE ALL ON app_private.suno_workspace_migration_files FROM PUBLIC,anon,authenticated');
 for(const item of plan.pending)await db.query('INSERT INTO app_private.suno_workspace_migration_files(filename,sha256,project_ref) VALUES($1,$2,$3)',[item.name,item.sha256,snapshot.project]);
 await db.exec("NOTIFY pgrst,'reload schema'");await flush();
 stage='commit';await client.query('COMMIT');report.committed=true;report.passed=true;report.finished_at=new Date().toISOString();
}catch(error){pending=[];await client.query('ROLLBACK').catch(()=>{});report.failure={stage,code:error.code||null,message:String(error.message).slice(0,300)};process.exitCode=1;}
finally{await client.end().catch(()=>{});fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/live-runtime-upgrade.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,committed:report.committed,applied:report.applied.length,preserved:report.retained_data,failure:report.failure||null}));}
