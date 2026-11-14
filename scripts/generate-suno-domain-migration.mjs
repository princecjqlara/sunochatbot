import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const sandbox = {exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/suno-business.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, sandbox);
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const aliases = Object.entries(sandbox.exports.SUNO_DETAIL_ALIASES).map(([key,value]) => '('+quote(key)+','+quote(value)+')').join(',\n');
const sql = `-- Generated from src/lib/suno-business.ts. Do not replay old migrations on the live CRM.
BEGIN;
ALTER TABLE chatbot_configs ADD COLUMN IF NOT EXISTS business_domain text CHECK(business_domain IN ('song','commercial_video'));
CREATE OR REPLACE FUNCTION suno_detail_key(p_key text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT canonical FROM (VALUES ${aliases}) a(alias,canonical)
WHERE alias=regexp_replace(lower(normalize(p_key,NFKC)),'[^a-z0-9]','','g') LIMIT 1
$$;
CREATE OR REPLACE FUNCTION suno_normalize_details(p_details jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 WITH raw AS (SELECT suno_detail_key(key) AS field,trim(value #>> '{}') AS value,key
 FROM jsonb_each(CASE WHEN jsonb_typeof(p_details)='object' THEN p_details ELSE '{}' END) WHERE jsonb_typeof(value)='string'),
 valid AS (SELECT DISTINCT ON (field) field,left(value,500) AS value FROM raw WHERE field IS NOT NULL AND length(value)>0
 AND value!~*${quote(sandbox.exports.SUNO_EMPTY_ANSWER_PATTERN)}
 AND regexp_replace(lower(normalize(value,NFKC)),'[^a-z0-9]','','g')<>regexp_replace(lower(normalize(key,NFKC)),'[^a-z0-9]','','g')
 AND regexp_replace(lower(normalize(value,NFKC)),'[^a-z0-9]','','g')<>regexp_replace(lower(normalize(field,NFKC)),'[^a-z0-9]','','g') AND value!~*'^sample[[:space:]]*:'
 AND (field<>'Lyrics language' OR value!~*${quote(sandbox.exports.SUNO_LANGUAGE_PLACEHOLDER_PATTERN)})
 AND (field<>'Vocal preference' OR value!~*${quote(sandbox.exports.SUNO_VOCAL_PLACEHOLDER_PATTERN)})
 ORDER BY field,(key=field) DESC,key)
 SELECT coalesce(jsonb_object_agg(field,value),'{}') FROM valid
$$;
ALTER FUNCTION veo_intake_progress(uuid) RENAME TO veo_video_intake_progress;
CREATE FUNCTION veo_intake_progress(p_contact uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE config chatbot_configs; answers jsonb; fields text[]; n integer; required integer; percent integer;
BEGIN
 SELECT b.* INTO config FROM chatbot_configs b JOIN contacts c ON c.page_id=b.page_id WHERE c.id=p_contact;
 IF NOT FOUND OR NOT (coalesce(config.business_domain='song',false) OR coalesce(config.instructions,'')~*'SONG_BRIEF_FORM:' OR
   (SELECT count(DISTINCT suno_detail_key(f)) FROM jsonb_array_elements_text(to_jsonb(config.details_to_collect)) f WHERE suno_detail_key(f) IN ('Lyrics language','Vocal preference','Preferred mood/style'))>=2)
 THEN RETURN veo_video_intake_progress(p_contact); END IF;
 SELECT suno_normalize_details(coalesce(s.collected_details,'{}'))||suno_normalize_details(coalesce(d.fields,'{}')) INTO answers
 FROM contacts c LEFT JOIN chatbot_contact_states s ON s.contact_id=c.id AND s.page_id=c.page_id LEFT JOIN veo_contact_details d ON d.contact_id=c.id WHERE c.id=p_contact;
 SELECT array_agg(DISTINCT suno_detail_key(f)) FILTER(WHERE suno_detail_key(f) IS NOT NULL) INTO fields FROM jsonb_array_elements_text(to_jsonb(config.details_to_collect)) f;
 percent:=least(100,greatest(1,coalesce(config.details_completion_percent,100)));
 required:=greatest(1,ceil(coalesce(array_length(fields,1),0)*percent/100.0)::integer);
 SELECT count(*) INTO n FROM unnest(fields) f WHERE answers ? f;
 RETURN jsonb_build_object('business_domain','song','detail_count',n,'required',required,'total',coalesce(array_length(fields,1),0),'minimum_percent',percent,'eligible',n>=required,
   'fields',coalesce((SELECT jsonb_agg(f ORDER BY f) FROM unnest(fields) f WHERE answers ? f),'[]'));
END $$;
-- Update old fixed-three diagnostics to use the same per-Page gate.
DO $$ DECLARE def text; fn regprocedure; BEGIN
 SELECT oid::regprocedure INTO fn FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'veo_intake_action%' AND strpos(prosrc,'(%/3 saved)')>0 LIMIT 1;
 IF fn IS NULL THEN RAISE EXCEPTION 'Assignment gate implementation changed'; END IF;
 def:=pg_get_functiondef(fn);
 IF strpos(def,'(%/3 saved)')=0 THEN RAISE EXCEPTION 'Assignment gate implementation changed'; END IF;
 def:=replace(def,'Collect at least 3 valid client details before offering or accepting this fresh inquiry (%/3 saved)','Collect the configured valid song details before offering or accepting this inquiry (% saved)'); EXECUTE def;
 def:=pg_get_functiondef('veo_automatic_intake_tick(uuid,timestamptz)'::regprocedure);
 def:=replace(def,'''/3 saved''','''/''||(veo_intake_progress(d.contact_id)->>''required'')||'' saved'''); EXECUTE def;
 def:=pg_get_functiondef('veo_intake_notice(uuid,uuid,bigint)'::regprocedure);
 def:=replace(def,'''/3 saved. No editor offer until at least three valid answers are collected.''','''/''||(progress->>''required'')||'' saved. Offers open when the configured Suno brief threshold is met.'''); EXECUTE def;
END $$;
REVOKE ALL ON FUNCTION suno_detail_key(text),suno_normalize_details(jsonb),veo_intake_progress(uuid),veo_video_intake_progress(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION suno_detail_key(text),suno_normalize_details(jsonb),veo_intake_progress(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
`;
fs.writeFileSync('supabase/migrations/202611140102_suno_song_domain.sql',sql);
console.log('Generated Suno song domain migration from '+Object.keys(sandbox.exports.SUNO_DETAIL_ALIASES).length+' shared aliases.');
