import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {parseEnv} from 'node:util';
import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';import {Client} from 'pg';
import {assertProjectCredentials} from './lib/database-migration-safety.mjs';import {transactionalMigrationSql} from './lib/transactional-migration-sql.mjs';
import {protectBackupKey,unprotectBackupKey} from './lib/private-backup-key.mjs';
const mode=process.argv[2];assert(['--preflight','--apply'].includes(mode),'Choose --preflight or --apply');
const env=fs.existsSync('.env.local')?parseEnv(fs.readFileSync('.env.local','utf8')):process.env,checked=assertProjectCredentials(env,'cxgynadprukyeuqbchbs');
const filename='202611200102_suno_sales_song_work.sql',source=fs.readFileSync('supabase/migrations/'+filename,'utf8').replace(/\r\n?/g,'\n');
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex'),sha256=hash(source);
const db=new Client({connectionString:checked.connectionString,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,query_timeout:20000});
const report={mode,project:checked.project,migration:filename,sha256,started_at:new Date().toISOString(),passed:false,committed:false,manual_dispatches:0,synthetic_business_rows:0};
const functions=async()=> (await db.query("SELECT n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition,p.prosrc source,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','app_private') AND p.prokind='f' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e') ORDER BY 1,2,3")).rows;
try{
 await db.connect();await db.query("BEGIN;SET LOCAL statement_timeout='15s';SET LOCAL lock_timeout='3s';SET LOCAL idle_in_transaction_session_timeout='60s'");await db.query('SELECT pg_advisory_xact_lock(821120102)');
 assert((await db.query("SELECT 1 FROM app_private.suno_workspace_migration_files WHERE filename='202611200101_suno_direct_sales.sql'")).rowCount,'Install direct Suno Sales first');
 assert(!(await db.query('SELECT 1 FROM app_private.suno_workspace_migration_files WHERE filename=$1',[filename])).rowCount,'Migration already installed; verify instead of replaying');
 const before=await functions(),fingerprint=hash(before);report.existing_function_fingerprint=fingerprint;
 const triggers=(await db.query("SELECT t.tgname,pg_get_triggerdef(t.oid) definition FROM pg_trigger t WHERE NOT t.tgisinternal ORDER BY t.tgrelid,t.tgname")).rows;
 const original=before.find(f=>f.schema==='public'&&f.name==='suno_telegram_song_work');assert(original,'Retained Telegram song protocol required');
 if(mode==='--apply'){
  const proof=JSON.parse(fs.readFileSync('verification/suno-song-work-preflight.json','utf8'));assert(proof.passed&&!proof.committed&&proof.sha256===sha256&&proof.existing_function_fingerprint===fingerprint,'Matching rollback preflight required');
  const payload=Buffer.from(JSON.stringify({project:checked.project,at:report.started_at,functions:before,triggers})),dir=path.resolve('.private/backups/suno-song-work-'+Date.now());fs.mkdirSync(dir,{recursive:true});
  const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(checked.project));const data=Buffer.concat([cipher.update(payload),cipher.final()]),tag=cipher.getAuthTag();
  fs.writeFileSync(path.join(dir,'metadata.aes'),data);fs.writeFileSync(path.join(dir,'key.dpapi'),protectBackupKey(key));fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({project:checked.project,sha256:hash(payload),iv:iv.toString('hex'),tag:tag.toString('hex')}));
  const restored=createDecipheriv('aes-256-gcm',unprotectBackupKey(fs.readFileSync(path.join(dir,'key.dpapi'))),iv);restored.setAAD(Buffer.from(checked.project));restored.setAuthTag(tag);assert.deepEqual(Buffer.concat([restored.update(fs.readFileSync(path.join(dir,'metadata.aes'))),restored.final()]),payload);key.fill(0);report.backup={encrypted:true,restore_verified:true,directory:dir};
 }
 await db.query(transactionalMigrationSql(source));
 const after=await functions();for(const old of before)if(old.name!=='suno_telegram_song_work')assert.deepEqual(after.find(f=>f.schema===old.schema&&f.name===old.name&&f.arguments===old.arguments),old,'Unrelated function changed: '+old.name);
 assert.equal(after.find(f=>f.name==='suno_telegram_song_work_before_direct_sales').source,original.source);report.retained_song_protocol_preserved=true;report.unrelated_functions_preserved=true;
 const afterTriggers=(await db.query("SELECT t.tgname,pg_get_triggerdef(t.oid) definition FROM pg_trigger t WHERE NOT t.tgisinternal ORDER BY t.tgrelid,t.tgname")).rows;
 for(const old of triggers)assert(afterTriggers.some(t=>t.tgname===old.tgname&&t.definition===old.definition),'Existing trigger changed');report.existing_triggers_preserved=true;
 const owner=(await db.query("SELECT a.user_id FROM veo_accounts a JOIN users u ON u.id=a.user_id AND u.is_active WHERE a.role='owner' AND a.active ORDER BY a.user_id LIMIT 1")).rows[0];assert(owner,'Active retained Suno Owner required');
 const actual=(await db.query('SELECT suno_song_work_report($1) value',[owner.user_id])).rows[0].value;assert.equal(actual.scope.user_id,owner.user_id);assert(Array.isArray(actual.items));report.real_owner_report_verified=true;
 const counts=(await db.query('SELECT (SELECT count(*)::int FROM suno_sales) sales,(SELECT count(*)::int FROM suno_sale_work) work,(SELECT count(*)::int FROM suno_sale_work_events) events')).rows[0];assert.equal(counts.sales,counts.work);assert.equal(counts.events,0);report.initial_work_metadata=counts.work;
 for(const role of ['anon','authenticated'])for(const fn of ['suno_song_work_action(uuid,jsonb,text)','suno_song_work_report(uuid,uuid,uuid,text,integer)','suno_telegram_song_work(uuid,bigint,bigint,text,jsonb)'])assert.equal((await db.query("SELECT has_function_privilege($1,$2,'EXECUTE') value",[role,fn])).rows[0].value,false);
 for(const role of ['anon','authenticated'])for(const table of ['suno_sale_work','suno_sale_work_events'])assert.equal((await db.query("SELECT has_table_privilege($1,$2,'SELECT') value",[role,table])).rows[0].value,false);
 assert.equal((await db.query("SELECT has_function_privilege('service_role','suno_telegram_song_work_before_direct_sales(uuid,bigint,bigint,text,jsonb)','EXECUTE') value")).rows[0].value,false);report.private_access_verified=true;
 await db.query('SAVEPOINT deny');try{await db.query("SELECT suno_song_work_report('00000000-0000-4000-8000-000000000000')");assert.fail('Unassigned actor allowed');}catch(error){assert.equal(error.code,'42501');}await db.query('ROLLBACK TO SAVEPOINT deny');
 const writes=(await db.query('SELECT relname,n_tup_ins+n_tup_upd+n_tup_del writes FROM pg_stat_xact_user_tables WHERE n_tup_ins+n_tup_upd+n_tup_del>0')).rows;
 assert(writes.every(t=>['schema_migrations','suno_sale_work'].includes(t.relname)),'Unexpected customer, financial or queue writes');report.existing_customer_financial_and_queue_writes=0;
 await db.query('INSERT INTO app_private.suno_workspace_migration_files(filename,sha256,project_ref) VALUES($1,$2,$3)',[filename,sha256,checked.project]);
 if(mode==='--apply'){await db.query('COMMIT');report.committed=true;}else await db.query('ROLLBACK');report.passed=true;
}catch(error){await db.query('ROLLBACK').catch(()=>{});report.failure={code:error.code||null,message:String(error.message).slice(0,250)};process.exitCode=1;}
finally{await db.end();report.finished_at=new Date().toISOString();fs.writeFileSync('verification/suno-song-work-'+(mode==='--apply'?'apply':'preflight')+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
