// Schema metadata only. Never reads customer records or changes the live database.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import {createRequire} from 'node:module';
import {assertProjectCredentials} from './lib/database-migration-safety.mjs';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const project='cxgynadprukyeuqbchbs';
const destination=process.argv.find(arg=>arg.startsWith('--output='))?.slice('--output='.length)||'.private/suno-schema.json';
const privateRoot=path.resolve('.private')+path.sep;
if(!path.resolve(destination).startsWith(privateRoot))throw Error('Schema snapshots must stay in the private workspace directory');
assertProjectCredentials(process.env,project);
const db = new pg.Client({connectionString:process.env.DATABASE_POOLER_URL_5432||process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000,query_timeout:20000});
db.on('error',()=>{});
try {
 await db.connect(); await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const read=async sql=>(await db.query(sql)).rows;
 const snapshot={project,read_only:true,contains_customer_rows:false,captured_at:new Date().toISOString(),
  tables:await read("SELECT n.nspname AS schema,c.relname AS name,c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','app_private') AND c.relkind='r' ORDER BY 1,2"),
  columns:await read("SELECT n.nspname AS schema,c.relname AS table_name,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,a.attidentity AS identity,a.attgenerated AS generated,pg_get_expr(d.adbin,d.adrelid) AS default_sql FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname IN ('public','app_private') AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY n.nspname,c.relname,a.attnum"),
  sequences:await read("SELECT schemaname AS schema,sequencename AS name FROM pg_sequences WHERE schemaname IN ('public','app_private')"),
  enums:await read("SELECT n.nspname AS schema,t.typname AS name,array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname IN ('public','app_private') GROUP BY 1,2"),
  constraints:await read("SELECT n.nspname AS schema,c.relname AS table_name,p.conname AS name,p.contype AS type,pg_get_constraintdef(p.oid) AS definition FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','app_private') ORDER BY (p.contype='f'),1,2,3"),
  indexes:await read("SELECT n.nspname AS schema,c.relname AS name,pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','app_private') AND NOT EXISTS(SELECT 1 FROM pg_constraint p WHERE p.conindid=i.indexrelid)"),
  functions:await read("SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','app_private') AND p.prokind IN ('f','p') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e') ORDER BY 1,2"),
  views:await read("SELECT schemaname AS schema,viewname AS name,definition FROM pg_views WHERE schemaname IN ('public','app_private')"),
  triggers:await read("SELECT n.nspname AS schema,c.relname AS table_name,t.tgname AS name,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','app_private') AND NOT t.tgisinternal"),
  policies:await read("SELECT * FROM pg_policies WHERE schemaname IN ('public','app_private')"),
  versions:await read('SELECT * FROM app_private.schema_migrations'),
  filenames:await read('SELECT * FROM app_private.sunobot_migration_files'),
  workspace_files:(await read("SELECT to_regclass('app_private.suno_workspace_migration_files') IS NOT NULL AS present"))[0].present
    ?await read('SELECT filename,sha256 FROM app_private.suno_workspace_migration_files ORDER BY filename'):[]};
 await db.query('ROLLBACK');
 fs.mkdirSync(path.dirname(destination),{recursive:true}); fs.writeFileSync(destination,JSON.stringify(snapshot,null,2)+'\n');
 console.log(JSON.stringify({saved:destination,read_only:true,customer_rows:0,tables:snapshot.tables.length,columns:snapshot.columns.length,functions:snapshot.functions.length,views:snapshot.views.length}));
} catch(error) { console.error('Suno schema snapshot failed ('+(error.code||'metadata_unavailable')+'). No changes applied.');process.exitCode=1; }
finally {await db.end().catch(()=>{});}
