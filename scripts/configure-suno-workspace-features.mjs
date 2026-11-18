// Enable workspace capabilities using independently verified retained Page grants.
import fs from 'node:fs';
import pg from 'pg';
import {assertProjectCredentials,sqlIdentifier as q} from './lib/database-migration-safety.mjs';
const snapshot=JSON.parse(fs.readFileSync('.private/suno-schema.json','utf8'));
const proof=JSON.parse(fs.readFileSync('.private/page-proof-input.json','utf8'));
const checked=assertProjectCredentials(process.env,'cxgynadprukyeuqbchbs');
if(!/^\d+$/.test(proof.app_id)||!Array.isArray(proof.verified_pages)||!proof.verified_pages.length)throw Error('Provider-verified Page ownership is required');
const db=new pg.Client({connectionString:checked.connectionString,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000,query_timeout:30000});db.on('error',()=>{});
const report={passed:false,legacy_credentials_changed:false,financial_policy_confirmed:false};
const pageColumns=snapshot.columns.filter(c=>c.schema==='public'&&c.table_name==='pages').map(c=>q(c.name));
const fingerprint=async()=> (await db.query('SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY id)::text) AS hash FROM (SELECT '+pageColumns.join(',')+' FROM pages) p')).rows[0].hash;
try{
 await db.connect();await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='20s'");
 await db.query('LOCK TABLE pages IN SHARE ROW EXCLUSIVE MODE');
 const owner='1e56fd95-56af-4aca-b50f-89a48c083249';
 const scope=(await db.query('SELECT veo_access_context($1) AS scope',[owner])).rows[0].scope;
 if(scope?.role!=='owner'||proof.verified_pages.some(id=>!scope.page_ids.includes(id)))throw Error('Owner Page scope differs from the verification');
 const marker=(await db.query('SELECT source_project FROM app_private.suno_retained_runtime_installation')).rows[0];
 if(marker?.source_project!==snapshot.project)throw Error('Retained runtime installation required');
 const before=await fingerprint();
 await db.query('INSERT INTO app_private.veobot_runtime_policy(singleton,app_id,enforced) VALUES(true,$1,true) ON CONFLICT(singleton) DO UPDATE SET app_id=excluded.app_id,enforced=true',[proof.app_id]);
 await db.query('ALTER TABLE pages DISABLE TRIGGER update_pages_updated_at');
 await db.query('UPDATE pages SET automation_app_id=$1 WHERE id=ANY($2::uuid[]) AND automation_app_id IS DISTINCT FROM $1',[proof.app_id,proof.verified_pages]);
 await db.query('ALTER TABLE pages ENABLE TRIGGER update_pages_updated_at');
 if(before!==await fingerprint())throw Error('An original Page field changed');
 await db.query('INSERT INTO veo_deal_review_settings(tenant_id,enabled,supervisor_submissions_enabled) VALUES($1,true,true) ON CONFLICT(tenant_id) DO UPDATE SET enabled=true,supervisor_submissions_enabled=true,updated_at=now()',[scope.tenant_id]);
 const actual=(await db.query('SELECT get_automation_page_scope() AS pages')).rows[0].pages;
 if(!Array.isArray(actual)||proof.verified_pages.some(id=>!actual.includes(id)))throw Error('Verified automation scope is incomplete');
 const updated=(await db.query('SELECT veo_access_context($1) AS scope',[owner])).rows[0].scope;
 if(!updated.reviewed_deals_enabled||!updated.supervisor_submissions_enabled)throw Error('Workspace feature settings were not enabled');
 const policy=(await db.query('SELECT suno_workspace_policy_status($1) AS policy',[owner])).rows[0].policy;
 if(policy.confirmed)throw Error('This configuration must not adopt financial rules');
 await db.query('INSERT INTO veo_audit(tenant_id,actor_id,action,after_value) VALUES($1,$2,$3,$4::jsonb)',[scope.tenant_id,owner,'retained_workspace_features',JSON.stringify({verified_page_count:actual.length,reviewed_deals_enabled:true,supervisor_submissions_enabled:true,financial_policy_confirmed:false})]);
 await db.query('COMMIT');Object.assign(report,{passed:true,verified_page_count:actual.length,reviewed_deals_enabled:true,supervisor_submissions_enabled:true,original_page_fields_unchanged:true});
}catch(error){await db.query('ROLLBACK').catch(()=>{});report.failure={code:error.code||null,message:String(error.message).slice(0,200)};process.exitCode=1;}
finally{await db.end().catch(()=>{});fs.writeFileSync('verification/workspace-feature-configuration.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
