import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseEnv} from 'node:util';
import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {Client} from 'pg';
import {assertProjectCredentials} from './lib/database-migration-safety.mjs';
import {transactionalMigrationSql} from './lib/transactional-migration-sql.mjs';
import {protectBackupKey,unprotectBackupKey} from './lib/private-backup-key.mjs';
const mode=process.argv[2];assert(['--preflight','--apply'].includes(mode),'Choose --preflight or --apply');
const env=fs.existsSync('.env.local')?parseEnv(fs.readFileSync('.env.local','utf8')):process.env;
const checked=assertProjectCredentials(env,'cxgynadprukyeuqbchbs');
const filename='202611200101_suno_direct_sales.sql',source=fs.readFileSync('supabase/migrations/'+filename,'utf8').replace(/\r\n?/g,'\n');
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex'),sha256=hash(source);
const modified=new Set(['suno_workspace_policy_status','suno_confirm_earnings_policy','suno_require_earnings_policy','suno_financial_workers_ready','veo_action','veo_salary','veo_refresh_discipline']);
const db=new Client({connectionString:checked.connectionString,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,query_timeout:20000});
const report={mode,project:checked.project,migration:filename,sha256,started_at:new Date().toISOString(),passed:false,committed:false,manual_dispatches:0,synthetic_business_rows:0};
const functions=async()=> (await db.query("SELECT n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','app_private') AND p.prokind='f' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e') ORDER BY 1,2,3")).rows;
try{
 await db.connect();await db.query("BEGIN;SET LOCAL statement_timeout='15s';SET LOCAL lock_timeout='3s';SET LOCAL idle_in_transaction_session_timeout='60s'");await db.query('SELECT pg_advisory_xact_lock(821120101)');
 const installed=(await db.query('SELECT sha256 FROM app_private.suno_workspace_migration_files WHERE filename=$1',[filename])).rows[0];assert(!installed,'Migration is already installed; verify instead of replaying');
 const before=await functions(),fingerprint=hash(before);report.existing_function_fingerprint=fingerprint;
 const policies=(await db.query('SELECT * FROM public.suno_workspace_policies')).rows;
 if(mode==='--apply'){
  const proof=JSON.parse(fs.readFileSync('verification/suno-sales-preflight.json','utf8'));assert(proof.passed&&!proof.committed&&proof.sha256===sha256&&proof.existing_function_fingerprint===fingerprint,'Matching rollback preflight required');
  const payload=Buffer.from(JSON.stringify({project:checked.project,at:report.started_at,functions:before,policies}));
  const dir=path.resolve('.private/backups/suno-sales-'+Date.now());fs.mkdirSync(dir,{recursive:true});const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(checked.project));const data=Buffer.concat([cipher.update(payload),cipher.final()]),tag=cipher.getAuthTag();
  fs.writeFileSync(path.join(dir,'metadata.aes'),data);fs.writeFileSync(path.join(dir,'key.dpapi'),protectBackupKey(key));
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({project:checked.project,sha256:hash(payload),iv:iv.toString('hex'),tag:tag.toString('hex')}));
  const restored=createDecipheriv('aes-256-gcm',unprotectBackupKey(fs.readFileSync(path.join(dir,'key.dpapi'))),iv);restored.setAAD(Buffer.from(checked.project));restored.setAuthTag(tag);assert.deepEqual(Buffer.concat([restored.update(fs.readFileSync(path.join(dir,'metadata.aes'))),restored.final()]),payload);key.fill(0);report.backup={encrypted:true,restore_verified:true,directory:dir};
 }
 await db.query(transactionalMigrationSql(source));
 const after=await functions();for(const old of before)if(!modified.has(old.name))assert.deepEqual(after.find(f=>f.schema===old.schema&&f.name===old.name&&f.arguments===old.arguments),old,'Unrelated function changed: '+old.name);
 report.unrelated_functions_preserved=true;
 const owners=(await db.query("SELECT a.user_id FROM public.veo_accounts a JOIN users u ON u.id=a.user_id AND u.is_active WHERE a.role='owner' AND a.active")).rows;assert.equal(owners.length,1,'Verify the intended retained Suno Owner');
 const policy=(await db.query("SELECT public.suno_confirm_earnings_policy($1,'suno_direct_sales_v1') value",[owners[0].user_id])).rows[0].value;assert(policy.confirmed&&policy.song_rate===20&&policy.tip_rate===50&&policy.revision_rate===20);report.policy={song:20,tip:50,revision:20,earned_on:policy.earned_on,payee:policy.payee};
 const actual=(await db.query("SELECT public.suno_sales_report($1,(now() AT TIME ZONE 'Asia/Manila')::date,(now() AT TIME ZONE 'Asia/Manila')::date) value",[owners[0].user_id])).rows[0].value;assert.equal(actual.policy.confirmed,true);assert.equal(actual.sale_count,0);report.real_owner_report_verified=true;
 const salary=(await db.query("SELECT public.veo_salary($1,(now() AT TIME ZONE 'Asia/Manila')::date) value",[owners[0].user_id])).rows[0].value;assert.equal(salary.rate,20);assert.equal(salary.policy,'suno_direct_sales_v1');assert.equal((await db.query('SELECT public.suno_financial_workers_ready() value')).rows[0].value,false);
 for(const role of ['anon','authenticated'])for(const fn of ['suno_sale_action(uuid,text,jsonb)','suno_sales_report(uuid,date,date,uuid,uuid,integer)','suno_confirm_earnings_policy(uuid,text)'])assert.equal((await db.query("SELECT has_function_privilege($1,$2,'EXECUTE') value",[role,fn])).rows[0].value,false);
 for(const role of ['anon','authenticated'])for(const table of ['suno_sales','suno_sale_charges','suno_sale_payments','suno_sale_requests'])assert.equal((await db.query("SELECT has_table_privilege($1,$2,'SELECT') value",[role,table])).rows[0].value,false);report.private_access_verified=true;
 await db.query('SAVEPOINT deny');try{await db.query("SELECT public.suno_sales_report('00000000-0000-4000-8000-000000000000',current_date,current_date)");assert.fail('Unassigned actor allowed');}catch(error){assert.equal(error.code,'42501');}await db.query('ROLLBACK TO SAVEPOINT deny');
 const writes=(await db.query('SELECT schemaname,relname,n_tup_ins+n_tup_upd+n_tup_del writes FROM pg_stat_xact_user_tables WHERE n_tup_ins+n_tup_upd+n_tup_del>0')).rows;
 assert(writes.every(t=>['schema_migrations','suno_workspace_policies','veo_audit'].includes(t.relname)),'Unexpected existing business data writes');report.existing_customer_and_queue_writes=0;
 await db.query('INSERT INTO app_private.suno_workspace_migration_files(filename,sha256,project_ref) VALUES($1,$2,$3)',[filename,sha256,checked.project]);
 if(mode==='--apply'){await db.query('COMMIT');report.committed=true;}else await db.query('ROLLBACK');report.passed=true;
}catch(error){await db.query('ROLLBACK').catch(()=>{});report.failure={code:error.code||null,message:String(error.message).slice(0,250)};process.exitCode=1;}
finally{await db.end();report.finished_at=new Date().toISOString();fs.writeFileSync('verification/suno-sales-'+(mode==='--apply'?'apply':'preflight')+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
