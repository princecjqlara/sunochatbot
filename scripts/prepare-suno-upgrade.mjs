import fs from 'node:fs';
import {sunoIncrementalPlan} from './lib/suno-incremental-plan.mjs';
import {sqlIdentifier as q} from './lib/database-migration-safety.mjs';
const snapshot=JSON.parse(fs.readFileSync('.private/suno-schema.json','utf8'));
const rehearsal=JSON.parse(fs.readFileSync('verification/incremental-rehearsal.json','utf8'));
const plan=sunoIncrementalPlan(snapshot);
if(!rehearsal.passed||rehearsal.schema_sha256!==plan.schema_sha256||JSON.stringify(rehearsal.pending)!==JSON.stringify(plan.pending.map(({name,sha256})=>({name,sha256}))))throw Error('A passing rehearsal of the exact pending files is required');
const columns=snapshot.columns.filter(c=>c.schema==='public'&&c.table_name==='chatbot_configs'&&!['id','page_id'].includes(c.name)).map(c=>c.name);
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const pages=JSON.parse(fs.readFileSync('src/config/veo-pages.json','utf8'));
if(pages.length!==13||pages.some(page=>!/^\d+$/.test(page.facebook_page_id)))throw Error('Suno Page scope is invalid');
const ids=pages.map(page=>quote(page.facebook_page_id)).join(',');
const sql=[`-- REVIEW ONLY. Existing Suno upgrade; ${plan.pending.length} file/hash identities.
-- Requires a restorable backup, completed Suno policy and maintenance cutover.
-- Omit the full baseline installer. This transaction retains saved chatbot settings.
BEGIN;
DO $suno_scope$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM users WHERE id='1e56fd95-56af-4aca-b50f-89a48c083249'::uuid)
 OR (SELECT count(*) FROM pages WHERE fb_page_id IN (${ids}))<>13 THEN
  RAISE EXCEPTION 'This review upgrade is bound to the retained Suno owner and thirteen Suno Pages';
 END IF;
END $suno_scope$;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtext('suno-workspace-upgrade'));
LOCK TABLE public.chatbot_configs IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE suno_retained_chatbot_settings ON COMMIT DROP AS SELECT * FROM public.chatbot_configs;
CREATE TABLE IF NOT EXISTS app_private.suno_workspace_migration_files(filename text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON app_private.suno_workspace_migration_files FROM PUBLIC,anon,authenticated;`];
for(const item of plan.pending)sql.push('-- FILE: '+item.name+' SHA256: '+item.sha256+'\n'+item.sql+'\nINSERT INTO app_private.suno_workspace_migration_files(filename,sha256) VALUES('+quote(item.name)+','+quote(item.sha256)+');');
sql.push('ALTER TABLE public.chatbot_configs DISABLE TRIGGER update_chatbot_configs_updated_at;\nUPDATE public.chatbot_configs live SET '+columns.map(name=>q(name)+'=saved.'+q(name)).join(',')+' FROM suno_retained_chatbot_settings saved WHERE live.page_id=saved.page_id;\nALTER TABLE public.chatbot_configs ENABLE TRIGGER update_chatbot_configs_updated_at;\nCOMMIT;\n');
fs.writeFileSync('verification/suno-incremental-review.sql',sql.join('\n\n'));
console.log(JSON.stringify({review:'verification/suno-incremental-review.sql',pending:plan.pending.length,applied_to_production:false}));
