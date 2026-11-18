import {sqlIdentifier as q} from './database-migration-safety.mjs';
const name = item => q(item.schema)+'.'+q(item.name);
export async function restoreSunoSchema(db, snapshot) {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA extensions; CREATE SCHEMA app_private; CREATE SCHEMA cron;
 CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,jobname text); CREATE TABLE cron.job_run_details(end_time timestamptz);
 CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS 'INSERT INTO cron.job(jobname) VALUES($1) RETURNING jobid';
 CREATE FUNCTION cron.unschedule(bigint) RETURNS boolean LANGUAGE sql AS 'DELETE FROM cron.job WHERE jobid=$1 RETURNING true';
 SET check_function_bodies=off;`);
 for (const type of snapshot.enums) await db.exec('CREATE TYPE '+name(type)+' AS ENUM ('+type.labels.map(value=>"'"+value.replaceAll("'","''")+"'").join(',')+')');
 for (const sequence of snapshot.sequences) await db.exec('CREATE SEQUENCE IF NOT EXISTS '+name(sequence));
 for (const table of snapshot.tables) {
  const fields=snapshot.columns.filter(c=>c.schema===table.schema&&c.table_name===table.name).map(c=>
   q(c.name)+' '+c.type+(c.identity?' GENERATED '+(c.identity==='a'?'ALWAYS':'BY DEFAULT')+' AS IDENTITY':c.generated?' GENERATED ALWAYS AS ('+c.default_sql+') STORED':c.default_sql?' DEFAULT '+c.default_sql:'')+(c.not_null?' NOT NULL':''));
  await db.exec('CREATE TABLE '+name(table)+' ('+fields.join(',')+')');
 }
 for (const fn of snapshot.functions) await db.exec(fn.definition);
 for (const c of snapshot.constraints) await db.exec('ALTER TABLE '+q(c.schema)+'.'+q(c.table_name)+' ADD CONSTRAINT '+q(c.name)+' '+c.definition);
 for (const index of snapshot.indexes) await db.exec(index.definition);
 for (const view of snapshot.views) await db.exec('CREATE VIEW '+name(view)+' AS '+view.definition);
 for (const trigger of snapshot.triggers) await db.exec(trigger.definition);
 for (const table of snapshot.tables) if (table.rls) await db.exec('ALTER TABLE '+name(table)+' ENABLE ROW LEVEL SECURITY');
 // Policy role/function semantics are checked by the real migration tests;
 // this offline restore preserves the actual source expressions too.
 for (const policy of snapshot.policies) await db.exec('CREATE POLICY '+q(policy.policyname)+' ON '+q(policy.schemaname)+'.'+q(policy.tablename)+' AS '+policy.permissive+' FOR '+policy.cmd+' TO '+policy.roles.map(role=>q(role)).join(',')+(policy.qual?' USING ('+policy.qual+')':'')+(policy.with_check?' WITH CHECK ('+policy.with_check+')':''));
 await db.exec('SET check_function_bodies=on');
}
