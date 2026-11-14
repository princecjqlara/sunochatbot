import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {uuid_ossp} from '@electric-sql/pglite/contrib/uuid_ossp';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {vector} from '@electric-sql/pglite-pgvector';
import {restoreSunoSchema} from './lib/suno-schema-rehearsal.mjs';
import {sunoIncrementalPlan} from './lib/suno-incremental-plan.mjs';
import {saveSunoSettings,restoreSunoSettings} from './lib/suno-retained-settings.mjs';
const snapshot=JSON.parse(fs.readFileSync('.private/suno-schema.json','utf8'));
const plan=sunoIncrementalPlan(snapshot);
const db=await PGlite.create({extensions:{'uuid-ossp':uuid_ossp,pg_trgm,vector}});
let stage='restore',name=null;
const report={read_only_production:true,customer_rows:0,schema_sha256:plan.schema_sha256,skipped:plan.skipped,pending:plan.pending.map(({name,sha256})=>({name,sha256})),applied_offline:[],passed:false};
try {
 await db.exec('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS vector;');
 await restoreSunoSchema(db,snapshot);
 stage='synthetic_fixture';
 await db.exec(`INSERT INTO users(id,email,name) VALUES('00000000-0000-4000-8000-000000000001','suno@example.test','Retained Suno owner');
 INSERT INTO pages(id,fb_page_id,name,access_token) VALUES('00000000-0000-4000-8000-000000000002','100','Suno preserved Page','fixture');
 INSERT INTO user_pages(user_id,page_id) VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
 INSERT INTO contacts(id,page_id,psid,name) VALUES('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','200','Retained customer');
 INSERT INTO chatbot_configs(page_id,enabled,instructions,details_completion_percent) VALUES('00000000-0000-4000-8000-000000000002',true,'SONG_BRIEF_FORM: hiraya-seven-fields',26);
 INSERT INTO chatbot_contact_states(page_id,contact_id,collected_details,conversation_price_quote,conversation_price_quoted_at,form_sent_at,human_pause_status)
 VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','{"Song duration":"60 seconds"}','Staff quote: PHP 499 for one song',now(),now(),'held');
 INSERT INTO chatbot_follow_up_jobs(page_id,contact_id,anchor_inbound_at,schedule_type,sequence_index,due_at,message_text,status)
 VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003',now(),'response',0,now()+interval '1 hour','Existing pending follow-up','pending');
 INSERT INTO chatbot_message_deliveries(page_id,contact_id,source_key,message_text,normalized_text,message_hash,status,message_id,sent_at)
 VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','retained-send','Already sent','already sent',md5('already sent'),'sent','prior-message',now());`);
 const tables=['users','pages','user_pages','contacts','chatbot_configs','chatbot_contact_states','chatbot_follow_up_jobs','chatbot_message_deliveries'];
 const key=(table,row)=>table==='chatbot_configs'?row.page_id:table==='user_pages'?row.user_id+':'+row.page_id:row.id||row.page_id+':'+row.contact_id;
 const before={};for(const table of tables)before[table]=new Map((await db.query('SELECT row_to_json(t) AS data FROM '+table+' t')).rows.map(row=>[key(table,row.data),row.data]));
 stage='migrate';
 await db.exec('BEGIN');
 await saveSunoSettings(db);
 for(const item of plan.pending){name=item.name;await db.exec(item.sql.replace(/CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;/g,'-- isolated scheduler stub'));report.applied_offline.push(item.name);}
 await restoreSunoSettings(db,snapshot.columns);
 stage='reconcile';name=null;
 const changes=[];
 for(const table of tables){const after=(await db.query('SELECT row_to_json(t) AS data FROM '+table+' t')).rows;
  if(before[table].size!==after.length)throw Error('Retained row count changed: '+table);
  for(const {data} of after){const old=before[table].get(key(table,data));if(!old)throw Error('Retained identity changed: '+table);
   for(const name of Object.keys(old))if(JSON.stringify(old[name])!==JSON.stringify(data[name]))changes.push(table+'.'+name);}
 }
 report.retained_field_changes=changes;
 if(changes.length)throw Error('Retained fields changed: '+changes.join(', '));
 for(const column of snapshot.columns){const result=await db.query('SELECT format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2 AND a.attname=$3 AND a.attnum>0 AND NOT a.attisdropped',[column.schema,column.table_name,column.name]);
  if(!result.rows.length||result.rows[0].type!==column.type||column.not_null&&!result.rows[0].not_null)throw Error('Retained column definition changed: '+column.schema+'.'+column.table_name+'.'+column.name);}
 await db.exec('ROLLBACK');report.passed=true;report.reconciled_tables=tables;report.retained_columns=snapshot.columns.length;report.retained_types_verified=true;
}catch(error){report.failure={stage,migration:name,code:error.code||'reconciliation_failed',message:String(error.message).slice(0,220)};process.exitCode=1;}
finally{await db.close();fs.writeFileSync('verification/incremental-rehearsal.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,applied_offline:report.applied_offline.length,failure:report.failure||null}));}
