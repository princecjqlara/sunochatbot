import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseEnv} from 'node:util';
import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {Client} from 'pg';
import {assertProjectCredentials} from './lib/database-migration-safety.mjs';
import {transactionalMigrationSql} from './lib/transactional-migration-sql.mjs';
import {protectBackupKey,unprotectBackupKey} from './lib/private-backup-key.mjs';
const mode=process.argv[2];assert(['--preflight','--apply','--verify'].includes(mode),'Choose --preflight, --apply or --verify');
const env=fs.existsSync('.env.local')?parseEnv(fs.readFileSync('.env.local','utf8')):process.env,checked=assertProjectCredentials(env,'cxgynadprukyeuqbchbs');
const filename='202611240101_suno_operations_reports.sql',source=fs.readFileSync('supabase/migrations/'+filename,'utf8').replace(/\r\n?/g,'\n');
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex'),sha256=hash(source);
const db=new Client({connectionString:checked.connectionString,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,query_timeout:20000});
const report={mode,project:checked.project,migration:filename,sha256,passed:false,committed:false,started_at:new Date().toISOString(),synthetic_business_rows:0,manual_dispatches:0};
const functions=async()=>(await db.query("SELECT n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','app_private') AND p.prokind='f' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e') ORDER BY 1,2,3")).rows;
try{
 await db.connect();await db.query(mode==='--verify'?"BEGIN READ ONLY;SET LOCAL statement_timeout='15s'":"BEGIN;SET LOCAL statement_timeout='15s';SET LOCAL lock_timeout='3s';SET LOCAL idle_in_transaction_session_timeout='60s'");
 if(mode!=='--verify')await db.query('SELECT pg_advisory_xact_lock(821124101)');
 const installed=(await db.query('SELECT sha256 FROM app_private.suno_workspace_migration_files WHERE filename=$1',[filename])).rows[0];
 if(mode==='--verify')assert.equal(installed?.sha256,sha256,'Matching installed migration required');else assert(!installed,'Already installed; use --verify');
 const before=await functions(),fingerprint=hash(before);report.existing_function_fingerprint=fingerprint;
 if(mode==='--apply'){
  const proof=JSON.parse(fs.readFileSync('verification/suno-reports-preflight.json','utf8'));assert(proof.passed&&!proof.committed&&proof.sha256===sha256&&proof.existing_function_fingerprint===fingerprint,'Matching rollback preflight required');
  const dir=path.resolve('.private/backups/suno-reports-'+Date.now());fs.mkdirSync(dir,{recursive:true});
  const rollback=fs.readFileSync('scripts/lib/suno-reports-rollback.sql','utf8'),payload=Buffer.from(JSON.stringify({project:checked.project,at:report.started_at,functions:before,rollback}));
  const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(checked.project));const encrypted=Buffer.concat([cipher.update(payload),cipher.final()]),tag=cipher.getAuthTag();
  fs.writeFileSync(path.join(dir,'metadata.aes'),encrypted);fs.writeFileSync(path.join(dir,'key.dpapi'),protectBackupKey(key));fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({project:checked.project,sha256:hash(payload),iv:iv.toString('hex'),tag:tag.toString('hex')}));
  const restored=createDecipheriv('aes-256-gcm',unprotectBackupKey(fs.readFileSync(path.join(dir,'key.dpapi'))),iv);restored.setAAD(Buffer.from(checked.project));restored.setAuthTag(tag);assert.deepEqual(Buffer.concat([restored.update(encrypted),restored.final()]),payload);key.fill(0);
  report.backup={encrypted:true,integrity_and_decryption_verified:true,directory:dir};
 }
 if(mode!=='--verify'){
  await db.query(transactionalMigrationSql(source));const after=await functions();for(const old of before)assert.deepEqual(after.find(f=>f.schema===old.schema&&f.name===old.name&&f.arguments===old.arguments),old,'Unrelated function changed: '+old.name);
  report.existing_functions_preserved=true;
 }
 const owner=(await db.query("SELECT a.user_id FROM veo_accounts a JOIN users u ON u.id=a.user_id AND u.is_active WHERE a.role='owner' AND a.active ORDER BY a.user_id LIMIT 1")).rows[0];assert(owner,'Retained Owner required');
 const actual=(await db.query("SELECT suno_operations_report($1,greatest((now() AT TIME ZONE 'Asia/Manila')::date-29,(t.launch_at AT TIME ZONE 'Asia/Manila')::date),(now() AT TIME ZONE 'Asia/Manila')::date) value FROM veo_accounts a JOIN veo_tenants t ON t.id=a.tenant_id WHERE a.user_id=$1",[owner.user_id])).rows[0].value;
 assert.equal(actual.version,1);assert(Array.isArray(actual.staff)&&Array.isArray(actual.pages)&&Array.isArray(actual.money)&&Array.isArray(actual.spend));assert.equal(actual.policy.song_rate,20);assert.equal(actual.policy.tip_rate,50);assert.equal(actual.policy.revision_rate,20);
 report.owner_report={verified:true,pages:actual.pages.length,staff:actual.staff.length,recorded_sales:actual.period.new_sales,capacity_plans:actual.plans.length,quota_affects_earnings:false};
 for(const role of ['anon','authenticated'])for(const fn of ['suno_operations_plan(uuid,jsonb)','suno_operations_report(uuid,date,date,uuid,date)'])assert.equal((await db.query("SELECT has_function_privilege($1,$2,'EXECUTE') value",[role,fn])).rows[0].value,false);
 for(const role of ['anon','authenticated'])for(const table of ['suno_work_plans','suno_page_budgets'])assert.equal((await db.query("SELECT has_table_privilege($1,$2,'SELECT') value",[role,table])).rows[0].value,false);report.private_access_verified=true;
 const writes=(await db.query('SELECT relname FROM pg_stat_xact_user_tables WHERE n_tup_ins+n_tup_upd+n_tup_del>0')).rows;assert(writes.every(t=>t.relname==='schema_migrations'),'Unexpected existing data writes');report.existing_business_writes=0;
 if(mode!=='--verify')await db.query('INSERT INTO app_private.suno_workspace_migration_files(filename,sha256,project_ref) VALUES($1,$2,$3)',[filename,sha256,checked.project]);
 if(mode==='--preflight'){
  await db.query(fs.readFileSync('scripts/lib/suno-reports-rollback.sql','utf8'));assert.equal((await db.query("SELECT to_regclass('public.suno_work_plans') value")).rows[0].value,null);report.rollback_rehearsed=true;
 }
 if(mode==='--apply'){await db.query('COMMIT');report.committed=true;}else await db.query('ROLLBACK');report.passed=true;
}catch(error){await db.query('ROLLBACK').catch(()=>{});report.failure={code:error.code||null,message:String(error.message).slice(0,220)};process.exitCode=1;}
finally{await db.end();report.finished_at=new Date().toISOString();fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/suno-reports-'+mode.slice(2)+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
