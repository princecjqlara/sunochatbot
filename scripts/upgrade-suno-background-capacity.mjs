// The upstream change replaces six function bodies and adds one private helper.
// Preflight executes the exact SQL and all preservation checks, then rolls back.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {assertProjectCredentials,schemaMigrationPlan} from './lib/database-migration-safety.mjs';
import {workspaceSql,retainedDataFingerprint,assertRetainedData} from './lib/suno-runtime-preservation.mjs';
const mode=process.argv[2];
if(!['preflight','apply','verify-contention'].includes(mode))throw Error('Choose preflight, apply or verify-contention');
const checked=assertProjectCredentials(process.env,'cxgynadprukyeuqbchbs');
const current=JSON.parse(fs.readFileSync('.private/suno-current-schema-20261119.json','utf8'));
const retained=JSON.parse(fs.readFileSync('.private/suno-schema.json','utf8'));
const pointer=JSON.parse(fs.readFileSync('.private/latest-suno-backup.json','utf8'));
const backup=JSON.parse(fs.readFileSync(pointer.manifest,'utf8'));
if(!backup.complete||!backup.integrity_verified||backup.project!==current.project)throw Error('A verified fresh encrypted backup is required');
const migration=schemaMigrationPlan().find(m=>m.name==='202611180001_veo_shared_background_capacity.sql');
if(!migration)throw Error('Missing reviewed upstream migration');
const sql=workspaceSql(migration.sql,retained);
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const modified=new Set(['veo_maintenance','veo_operations_maintenance','veo_automatic_intake_tick','veo_refresh_worker_quota','veo_auto_approve_pending_team_reviews','veo_refresh_all_discipline']);
const client=()=>{const c=new pg.Client({connectionString:checked.connectionString,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000,query_timeout:45000});c.on('error',()=>{});return c;};
const conn=client(),db={exec:sql=>conn.query(sql),query:(sql,args)=>conn.query(sql,args)};
const functions=async()=> (await db.query("SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition,p.prosrc AS source,p.proowner::regrole::text AS owner,p.proacl::text AS acl,p.proconfig AS settings,p.prosecdef AS security_definer,p.provolatile AS volatility FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','app_private') AND p.prokind IN('f','p') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e') ORDER BY 1,2,3")).rows;
const report={passed:false,mode,migration:migration.name,sha256:migration.sha256,sql_fingerprint:digest(sql),backup_id:backup.id,project:checked.project,started_at:new Date().toISOString(),committed:false};
try{
 await conn.connect();
 if(mode==='verify-contention'){
  const second=client();
  try{
   await second.connect();await conn.query('BEGIN');await second.query('BEGIN');
   await conn.query('SELECT public.veo_require_background_capacity()');
   let denied=false;const start=Date.now();
   try{await second.query('SELECT public.veo_require_background_capacity()');}catch(error){if(error.code!=='55P03')throw error;denied=true;}
   if(!denied)throw Error('A competing connection was incorrectly admitted');
   const delay=Date.now()-start;
   await second.query('ROLLBACK');await conn.query('ROLLBACK');
   await second.query('BEGIN');await second.query('SELECT public.veo_require_background_capacity()');await second.query('ROLLBACK');
   Object.assign(report,{passed:true,competing_connection_rejected:true,rejection_ms:delay,admission_resumes_after_rollback:true,business_records_written:0});
  }finally{await second.query('ROLLBACK').catch(()=>{});await second.end().catch(()=>{});}
 }else{
  await db.exec("BEGIN ISOLATION LEVEL REPEATABLE READ;SET LOCAL statement_timeout='30s';SET LOCAL lock_timeout='3s';SET LOCAL idle_in_transaction_session_timeout='180s'");
  await db.query('SELECT pg_advisory_xact_lock(76111901)');
  const receipt=(await db.query('SELECT sha256 FROM app_private.suno_workspace_migration_files WHERE filename=$1',[migration.name])).rows[0];
  if(receipt)throw Error('Migration already installed; verify it instead of replaying');
  const before=await functions();report.functions_fingerprint=digest(before);
  if(mode==='apply'){
   const proof=JSON.parse(fs.readFileSync('verification/background-capacity-preflight.json','utf8'));
   if(!proof.passed||proof.committed||proof.sha256!==migration.sha256||proof.sql_fingerprint!==report.sql_fingerprint||proof.backup_id!==backup.id||proof.functions_fingerprint!==report.functions_fingerprint)throw Error('A matching successful rollback preflight is required');
  }
  for(const old of retained.functions)if(!before.some(fn=>fn.schema===old.schema&&fn.name===old.name&&fn.arguments===old.arguments&&fn.definition===old.definition))throw Error('The retained chatbot baseline changed before upgrade');
  const valuesBefore=await retainedDataFingerprint(db,current);
  await db.exec(sql);
  const after=await functions();
  if(after.length!==before.length+1)throw Error('Unexpected function inventory change');
  const patched=[];
  for(const old of before){
   const fn=after.find(f=>f.schema===old.schema&&f.name===old.name&&f.arguments===old.arguments);
   if(!fn)throw Error('An existing function disappeared');
   if(old.schema!=='public'||!modified.has(old.name)){if(fn.definition!==old.definition)throw Error('An unrelated function changed: '+old.name);continue;}
   const metadata=f=>Object.fromEntries(Object.entries(f).filter(([k])=>!['definition','source'].includes(k)));
   if(JSON.stringify(metadata(fn))!==JSON.stringify(metadata(old)))throw Error('Function parameters, grants or settings changed: '+old.name);
   const at=old.source.indexOf('BEGIN');
   const expected=old.source.slice(0,at)+'BEGIN\n PERFORM public.veo_require_background_capacity();'+old.source.slice(at+5);
   if(at<0||fn.source!==expected)throw Error('Function business logic changed: '+old.name);
   patched.push(old.name);
  }
  if(patched.length!==6)throw Error('The six background functions were not patched exactly');
  const grants=(await db.query("SELECT has_function_privilege('anon','public.veo_require_background_capacity()','execute') AS anon,has_function_privilege('authenticated','public.veo_require_background_capacity()','execute') AS authenticated,has_function_privilege('service_role','public.veo_require_background_capacity()','execute') AS service")).rows[0];
  if(grants.anon||grants.authenticated||!grants.service)throw Error('New helper privileges are incorrect');
  report.business_data_preserved=assertRetainedData(valuesBefore,await retainedDataFingerprint(db,current));
  report.retained_chatbot_functions_preserved=retained.functions.length;
  report.patched_functions=patched;report.existing_function_properties_preserved=true;report.helper_service_only=true;
  await db.query('INSERT INTO app_private.suno_workspace_migration_files(filename,sha256,project_ref) VALUES($1,$2,$3)',[migration.name,migration.sha256,current.project]);
  if(mode==='apply'){await db.exec('COMMIT');report.committed=true;}else await db.exec('ROLLBACK');
  report.passed=true;
 }
}catch(error){await db.exec('ROLLBACK').catch(()=>{});report.failure={code:error.code||null,message:String(error.message).slice(0,250)};process.exitCode=1;}
finally{
 await conn.end().catch(()=>{});report.finished_at=new Date().toISOString();
 fs.writeFileSync('verification/background-capacity-'+mode+'.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({mode,passed:report.passed,committed:report.committed,data_preserved:report.business_data_preserved,failure:report.failure||null}));
}
