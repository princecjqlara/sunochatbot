import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseEnv} from 'node:util';
import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {Client} from 'pg';
import {assertProjectCredentials,sqlIdentifier} from './lib/database-migration-safety.mjs';
import {migrationConnectionOptions} from './lib/migration-retry.mjs';
import {transactionalMigrationSql} from './lib/transactional-migration-sql.mjs';
import {protectBackupKey,unprotectBackupKey} from './lib/private-backup-key.mjs';

const mode=process.argv[2];assert(['--preflight','--apply','--verify'].includes(mode),'Choose --preflight, --apply or --verify');
const env=fs.existsSync('.env.local')?parseEnv(fs.readFileSync('.env.local','utf8')):process.env;
const checked=assertProjectCredentials(env,'cxgynadprukyeuqbchbs');
const filename='202611280101_suno_sales_extras.sql';
const source=fs.readFileSync('supabase/migrations/'+filename,'utf8').replace(/\r\n?/g,'\n');
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const sha256=hash(source),modified=new Set(['suno_sale_action','suno_sales_report','suno_workspace_policy_status','suno_confirm_earnings_policy','veo_salary','suno_operations_report']);
const db=new Client({...await migrationConnectionOptions(checked.connectionString),connectionTimeoutMillis:10000,query_timeout:20000});
db.on('error',()=>{});
const report={mode,project:checked.project,migration:filename,sha256,started_at:new Date().toISOString(),passed:false,committed:false,synthetic_business_rows:0,manual_dispatches:0,customer_messages_sent:0};
const functions=async()=>(await db.query("SELECT n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','app_private') AND p.prokind='f' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e') ORDER BY 1,2,3")).rows;
const constraints=async()=>(await db.query("SELECT conname name,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='public.suno_sale_payments'::regclass ORDER BY conname")).rows;
const columns=async()=>(await db.query("SELECT column_name,is_nullable,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='suno_sale_payments' ORDER BY ordinal_position")).rows;
const protectedState=async()=>(await db.query(`SELECT
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(p)-'description' ORDER BY id)::text,'')) FROM suno_sale_payments p) payments,
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY id)::text,'')) FROM suno_sales s) sales,
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY id)::text,'')) FROM suno_sale_charges c) charges,
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY page_id)::text,'')) FROM chatbot_configs c) chatbot_configs,
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY page_id,contact_id)::text,'')) FROM chatbot_contact_states s) chatbot_states,
 (SELECT count(*)::int FROM contacts) contacts,(SELECT count(*)::int FROM veo_submissions) submissions`)).rows[0];
function rollbackSql(before,oldConstraints){
 const changed=oldConstraints.filter(c=>['suno_sale_payments_kind_check','suno_sale_payments_basis_check'].includes(c.name)||/rate_percent|charge_id IS NULL/.test(c.definition));
 assert.equal(changed.length,4,'Exactly the four original payment constraints must be restorable');
 const names=['suno_sale_payments_kind_check','suno_sale_payments_basis_check','suno_sale_payments_rate_percent_check','suno_sale_payments_charge_check','suno_sale_payments_description_check','suno_sale_payments_extra_description_check'];
 return `-- Run inside a transaction before recording new optional-reference or extra payments.
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM public.suno_sale_payments WHERE basis='extra' OR reference IS NULL OR description IS NOT NULL) THEN
  RAISE EXCEPTION 'Preserve real extra payments and optional references; roll back the app while retaining the additive schema';
 END IF;
END $$;
${names.map(name=>'ALTER TABLE public.suno_sale_payments DROP CONSTRAINT IF EXISTS '+sqlIdentifier(name)+';').join('\n')}
${changed.map(c=>'ALTER TABLE public.suno_sale_payments ADD CONSTRAINT '+sqlIdentifier(c.name)+' '+c.definition+';').join('\n')}
ALTER TABLE public.suno_sale_payments ALTER COLUMN reference SET NOT NULL;
ALTER TABLE public.suno_sale_payments DROP COLUMN description;
${before.filter(f=>modified.has(f.name)).map(f=>f.definition+';').join('\n')}
DELETE FROM app_private.schema_migrations WHERE version='202611280101';
DELETE FROM app_private.suno_workspace_migration_files WHERE filename='${filename}';
NOTIFY pgrst,'reload schema';
`;
}
function privateBackup(payload){
 const dir=path.resolve('.private/backups/suno-sales-extras-'+Date.now());fs.mkdirSync(dir,{recursive:true});
 const bytes=Buffer.from(JSON.stringify(payload)),key=randomBytes(32),iv=randomBytes(12);
 try{
  const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(checked.project));
  const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]),tag=cipher.getAuthTag();
  fs.writeFileSync(path.join(dir,'records.aes'),encrypted,{flag:'wx'});
  fs.writeFileSync(path.join(dir,'key.dpapi'),protectBackupKey(key),{flag:'wx'});
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({project:checked.project,sha256:hash(bytes),iv:iv.toString('hex'),tag:tag.toString('hex'),migration:filename}));
  const decipher=createDecipheriv('aes-256-gcm',unprotectBackupKey(fs.readFileSync(path.join(dir,'key.dpapi'))),iv);
  decipher.setAAD(Buffer.from(checked.project));decipher.setAuthTag(tag);
  const restored=Buffer.concat([decipher.update(fs.readFileSync(path.join(dir,'records.aes'))),decipher.final()]);
  assert.deepEqual(restored,bytes);assert.equal(JSON.parse(restored).rollback,payload.rollback);
  return {encrypted:true,integrity_and_decryption_verified:true,directory:dir};
 }finally{key.fill(0);}
}
try{
 await db.connect();
 await db.query(mode==='--verify'?"BEGIN READ ONLY;SET LOCAL statement_timeout='15s'":"BEGIN ISOLATION LEVEL REPEATABLE READ;SET LOCAL statement_timeout='15s';SET LOCAL lock_timeout='3s';SET LOCAL idle_in_transaction_session_timeout='90s'");
 if(mode!=='--verify')await db.query('SELECT pg_advisory_xact_lock(821128101)');
 const installed=(await db.query('SELECT sha256 FROM app_private.suno_workspace_migration_files WHERE filename=$1',[filename])).rows[0];
 if(mode==='--verify')assert.equal(installed?.sha256,sha256,'Matching installed migration required');else assert(!installed,'Already installed; use --verify');
 const before=await functions(),oldConstraints=await constraints(),oldColumns=await columns();
 const fingerprint=hash(before),schemaFingerprint=hash({constraints:oldConstraints,columns:oldColumns});
 report.existing_function_fingerprint=fingerprint;report.existing_schema_fingerprint=schemaFingerprint;
 let state,rollback;
 if(mode!=='--verify'){
  assert.equal(before.filter(f=>modified.has(f.name)).length,modified.size,'All six existing Suno functions are required');
  assert(!oldColumns.some(c=>c.column_name==='description'),'Unexpected existing payment description column');
  assert.equal(oldColumns.find(c=>c.column_name==='reference')?.is_nullable,'NO');
  state=await protectedState();rollback=rollbackSql(before,oldConstraints);
  if(mode==='--apply'){
   const proof=JSON.parse(fs.readFileSync('verification/suno-sales-extras-preflight.json','utf8'));
   assert(proof.passed&&!proof.committed&&proof.rollback_rehearsed&&proof.sha256===sha256&&proof.existing_function_fingerprint===fingerprint&&proof.existing_schema_fingerprint===schemaFingerprint,'Matching reviewed rollback preflight required');
   const records=(await db.query('SELECT to_jsonb(p) value FROM public.suno_sale_payments p ORDER BY id')).rows.map(r=>r.value);
   report.backup=privateBackup({project:checked.project,at:report.started_at,functions:before.filter(f=>modified.has(f.name)),constraints:oldConstraints,columns:oldColumns,payments:records,rollback});
  }
  await db.query(transactionalMigrationSql(source));
  const after=await functions();for(const f of before)if(!modified.has(f.name))assert.deepEqual(after.find(a=>a.schema===f.schema&&a.name===f.name&&a.arguments===f.arguments),f,'Unrelated function changed: '+f.name);
  assert.deepEqual(await protectedState(),state,'Existing payments, earnings, customers, chatbot settings or states changed');
  report.existing_business_records_preserved=true;
 }
 const currentColumns=await columns();assert(currentColumns.some(c=>c.column_name==='description'));assert.equal(currentColumns.find(c=>c.column_name==='reference')?.is_nullable,'YES');
 const owner=(await db.query("SELECT a.user_id FROM veo_accounts a JOIN users u ON u.id=a.user_id AND u.is_active WHERE a.role='owner' AND a.active ORDER BY a.user_id LIMIT 1")).rows[0];assert(owner,'Retained Owner required');
 const actual=(await db.query("SELECT suno_sales_report($1,(now() AT TIME ZONE 'Asia/Manila')::date-29,(now() AT TIME ZONE 'Asia/Manila')::date) value",[owner.user_id])).rows[0].value;
 assert(actual.policy.confirmed);assert.deepEqual([actual.policy.song_rate,actual.policy.tip_rate,actual.policy.extra_rate,actual.policy.revision_rate],[20,50,50,20]);
 assert(actual.totals.every(t=>Object.hasOwn(t,'extra_minor')));
 const operations=(await db.query("SELECT suno_operations_report($1,greatest((now() AT TIME ZONE 'Asia/Manila')::date-29,(t.launch_at AT TIME ZONE 'Asia/Manila')::date),(now() AT TIME ZONE 'Asia/Manila')::date) value FROM veo_accounts a JOIN veo_tenants t ON t.id=a.tenant_id WHERE a.user_id=$1",[owner.user_id])).rows[0].value;
 assert.equal(operations.version,1);assert(operations.money.every(t=>Object.hasOwn(t,'extra_minor')));
 report.real_owner_reports_verified=true;report.policy={song:20,tip:50,extra:50,revision:20};
 for(const role of ['anon','authenticated'])for(const fn of ['suno_sale_action(uuid,text,jsonb)','suno_sales_report(uuid,date,date,uuid,uuid,integer)','suno_operations_report(uuid,date,date,uuid,date)'])assert.equal((await db.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[role,fn])).rows[0].allowed,false);
 report.private_access_verified=true;
 if(mode!=='--verify'){
  const writes=(await db.query('SELECT relname FROM pg_stat_xact_user_tables WHERE n_tup_ins+n_tup_upd+n_tup_del>0')).rows;
  assert(writes.every(r=>r.relname==='schema_migrations'),'Unexpected business writes');
  await db.query('INSERT INTO app_private.suno_workspace_migration_files(filename,sha256,project_ref) VALUES($1,$2,$3)',[filename,sha256,checked.project]);
 }
 if(mode==='--preflight'){
  await db.query(rollback);assert.deepEqual(await functions(),before);assert.deepEqual(await constraints(),oldConstraints);assert.deepEqual(await columns(),oldColumns);assert.deepEqual(await protectedState(),state);
  report.rollback_rehearsed=true;
 }
 if(mode==='--apply'){await db.query('COMMIT');report.committed=true;}else await db.query('ROLLBACK');
 report.passed=true;
}catch(error){await db.query('ROLLBACK').catch(()=>{});report.failure={code:error.code||null,message:String(error.message).slice(0,250)};process.exitCode=1;}
finally{await db.end().catch(()=>{});report.finished_at=new Date().toISOString();fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/suno-sales-extras-'+mode.slice(2)+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
