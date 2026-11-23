import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {parseEnv} from 'node:util';
import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';import {Client} from 'pg';
import {assertProjectCredentials} from './lib/database-migration-safety.mjs';import {transactionalMigrationSql} from './lib/transactional-migration-sql.mjs';
import {protectBackupKey,unprotectBackupKey} from './lib/private-backup-key.mjs';
const mode=process.argv[2];assert(['--preflight','--apply','--verify'].includes(mode),'Choose --preflight, --apply or --verify');
const env=fs.existsSync('.env.local')?parseEnv(fs.readFileSync('.env.local','utf8')):process.env,checked=assertProjectCredentials(env,'cxgynadprukyeuqbchbs');
const filename='202611240102_suno_inquiry_timestamp_integrity.sql',source=fs.readFileSync('supabase/migrations/'+filename,'utf8').replace(/\r\n?/g,'\n');
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex'),sha256=hash(source);
const rollback=fs.readFileSync('scripts/lib/suno-inquiry-integrity-rollback.sql','utf8');
const db=new Client({connectionString:checked.connectionString,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,query_timeout:20000});
db.on('error',()=>{});
const report={mode,project:checked.project,migration:filename,sha256,started_at:new Date().toISOString(),passed:false,committed:false,manual_dispatches:0,financial_records_created:0,customer_messages_sent:0};
const functions=async()=>(await db.query("SELECT n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','app_private') AND p.prokind='f' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e') ORDER BY 1,2,3")).rows;
const candidates=async()=>({contacts:(await db.query("SELECT to_jsonb(c) value FROM contacts c WHERE first_interaction_at<'2000-01-01' ORDER BY id")).rows.map(r=>r.value),sources:(await db.query("SELECT to_jsonb(s) value FROM ad_contact_sources s WHERE first_inquiry_at<'2000-01-01' ORDER BY contact_id")).rows.map(r=>r.value)});
const identity=data=>({contacts:data.contacts.map(c=>[c.id,c.page_id,c.first_interaction_at,c.created_at]),sources:data.sources.map(s=>[s.contact_id,s.page_id,s.first_inquiry_at])});
const protectedState=async()=>(await db.query("SELECT (SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY page_id)::text,'')) FROM chatbot_configs c) configs,(SELECT md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY page_id,contact_id)::text,'')) FROM chatbot_contact_states s) bot_states,(SELECT count(*)::int FROM suno_sale_payments) payments,(SELECT count(*)::int FROM suno_sales) sales,(SELECT count(*)::int FROM contact_tags) tags")).rows[0];
try{
 await db.connect();await db.query(mode==='--verify'?"BEGIN READ ONLY;SET LOCAL statement_timeout='15s'":"BEGIN ISOLATION LEVEL REPEATABLE READ;SET LOCAL statement_timeout='15s';SET LOCAL lock_timeout='3s';SET LOCAL idle_in_transaction_session_timeout='90s'");
 if(mode!=='--verify')await db.query('SELECT pg_advisory_xact_lock(821124102)');
 const installed=(await db.query('SELECT sha256 FROM app_private.suno_workspace_migration_files WHERE filename=$1',[filename])).rows[0];
 if(mode==='--verify')assert.equal(installed?.sha256,sha256,'Matching installed inquiry repair required');else assert(!installed,'Already installed; use --verify');
 const before=await functions(),data=await candidates(),fingerprint=hash(before),candidateFingerprint=hash(identity(data)),protectedBefore=await protectedState();
 report.existing_function_fingerprint=fingerprint;report.candidate_fingerprint=candidateFingerprint;report.candidates={contacts:data.contacts.length,sources:data.sources.length};
 if(mode==='--apply'){
  const proof=JSON.parse(fs.readFileSync('verification/suno-inquiry-integrity-preflight.json','utf8'));assert(proof.passed&&!proof.committed&&proof.sha256===sha256&&proof.existing_function_fingerprint===fingerprint&&proof.candidate_fingerprint===candidateFingerprint,'Matching rollback preflight and unchanged date evidence required');
  const payload=Buffer.from(JSON.stringify({project:checked.project,at:report.started_at,functions:before,records:data,rollback})),dir=path.resolve('.private/backups/suno-inquiry-integrity-'+Date.now());fs.mkdirSync(dir,{recursive:true});
  const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(checked.project));const encrypted=Buffer.concat([cipher.update(payload),cipher.final()]),tag=cipher.getAuthTag();
  fs.writeFileSync(path.join(dir,'records.aes'),encrypted);fs.writeFileSync(path.join(dir,'key.dpapi'),protectBackupKey(key));fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({project:checked.project,sha256:hash(payload),iv:iv.toString('hex'),tag:tag.toString('hex')}));
  const restore=createDecipheriv('aes-256-gcm',unprotectBackupKey(fs.readFileSync(path.join(dir,'key.dpapi'))),iv);restore.setAAD(Buffer.from(checked.project));restore.setAuthTag(tag);assert.deepEqual(Buffer.concat([restore.update(encrypted),restore.final()]),payload);key.fill(0);report.backup={encrypted:true,integrity_and_decryption_verified:true,directory:dir};
 }
 if(mode!=='--verify'){
  await db.query(transactionalMigrationSql(source));const after=await functions();for(const f of before)assert.deepEqual(after.find(a=>a.schema===f.schema&&a.name===f.name&&a.arguments===f.arguments),f,'Existing function changed: '+f.name);
  const omit=(row,...keys)=>Object.fromEntries(Object.entries(row).filter(([key])=>!keys.includes(key)));
  const afterContacts=data.contacts.length?(await db.query('SELECT to_jsonb(c) value FROM contacts c WHERE id=ANY($1::uuid[]) ORDER BY id',[data.contacts.map(c=>c.id)])).rows.map(r=>r.value):[];
  const afterSources=data.sources.length?(await db.query('SELECT to_jsonb(s) value FROM ad_contact_sources s WHERE contact_id=ANY($1::uuid[]) ORDER BY contact_id',[data.sources.map(s=>s.contact_id)])).rows.map(r=>r.value):[];
  assert.deepEqual(afterContacts.map(r=>omit(r,'first_interaction_at','updated_at')),data.contacts.map(r=>omit(r,'first_interaction_at','updated_at')),'Unrelated contact fields changed');
  assert.deepEqual(afterSources.map(r=>omit(r,'first_inquiry_at')),data.sources.map(r=>omit(r,'first_inquiry_at')),'Attribution or source evidence changed');
  assert.deepEqual(await protectedState(),protectedBefore,'Chatbot settings, holds, states, tags or financial records changed');report.existing_functions_and_customer_controls_preserved=true;
 }
 report.repairs=(await db.query('SELECT relation_name,count(*)::int records FROM app_private.suno_inquiry_date_repairs GROUP BY relation_name ORDER BY relation_name')).rows;
 for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_table_privilege($1,'app_private.suno_inquiry_date_repairs','SELECT') allowed",[role])).rows[0].allowed,false);report.private_journal_verified=true;
 const remaining=await candidates();report.unresolved_dates={contacts:remaining.contacts.length,sources:remaining.sources.length};
 if(mode!=='--verify'){
  const writes=(await db.query('SELECT relname FROM pg_stat_xact_user_tables WHERE n_tup_ins+n_tup_upd+n_tup_del>0')).rows;assert(writes.every(r=>['contacts','ad_contact_sources','suno_inquiry_date_repairs','schema_migrations'].includes(r.relname)),'Unexpected queue or business writes');
  await db.query('INSERT INTO app_private.suno_workspace_migration_files(filename,sha256,project_ref) VALUES($1,$2,$3)',[filename,sha256,checked.project]);
 }
 if(mode==='--preflight'){await db.query(rollback);assert.equal(hash(identity(await candidates())),candidateFingerprint,'Rollback did not restore original dates');assert.deepEqual(await protectedState(),protectedBefore);assert.deepEqual(await functions(),before);report.rollback_rehearsed=true;}
 if(mode==='--apply'){await db.query('COMMIT');report.committed=true;}else await db.query('ROLLBACK');report.passed=true;
}catch(e){await db.query('ROLLBACK').catch(()=>{});report.failure={code:e.code||null,message:String(e.message).slice(0,220)};process.exitCode=1;}
finally{await db.end();report.finished_at=new Date().toISOString();fs.writeFileSync('verification/suno-inquiry-integrity-'+mode.slice(2)+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
