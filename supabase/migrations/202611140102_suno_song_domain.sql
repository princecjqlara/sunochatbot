-- Generated from src/lib/suno-business.ts. Do not replay old migrations on the live CRM.
BEGIN;
ALTER TABLE chatbot_configs ADD COLUMN IF NOT EXISTS business_domain text CHECK(business_domain IN ('song','commercial_video'));
CREATE OR REPLACE FUNCTION suno_detail_key(p_key text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT canonical FROM (VALUES ('businessname','Business name'),
('business','Business name'),
('companyname','Business name'),
('specialtyproducts','Main products or services'),
('mainproductsorservices','Main products or services'),
('specialty','Main products or services'),
('products','Main products or services'),
('productsservices','Main products or services'),
('productorservice','Main products or services'),
('tagline','Tagline or slogan'),
('taglineorslogan','Tagline or slogan'),
('slogan','Tagline or slogan'),
('englishortagaloglyrics','Lyrics language'),
('lyricslanguage','Lyrics language'),
('language','Lyrics language'),
('maleorfemalesinger','Vocal preference'),
('vocalpreference','Vocal preference'),
('singer','Vocal preference'),
('vocal','Vocal preference'),
('voice','Vocal preference'),
('genre','Preferred mood/style'),
('preferredmoodstyle','Preferred mood/style'),
('musicgenre','Preferred mood/style'),
('musicstyle','Preferred mood/style'),
('mood','Preferred mood/style'),
('additionalrequests','Additional requests'),
('additionalinstructions','Additional requests'),
('requests','Additional requests'),
('customername','Customer name'),
('businesstype','Business type'),
('songduration','Song duration'),
('songconceptorcampaignidea','Song concept or campaign idea'),
('existinglyricsorscript','Existing lyrics or script'),
('songpurpose','Song purpose'),
('targetaudience','Target audience'),
('mainmessage','Main message'),
('businessstrengths','Business strengths'),
('signatureproductservice','Signature product/service'),
('locationorbranch','Location or branch'),
('agreedpackage','Agreed package'),
('deadlineoroccasiondate','Deadline or occasion date')) a(alias,canonical)
WHERE alias=regexp_replace(lower(normalize(p_key,NFKC)),'[^a-z0-9]','','g') LIMIT 1
$$;
CREATE OR REPLACE FUNCTION suno_normalize_details(p_details jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 WITH raw AS (SELECT suno_detail_key(key) AS field,trim(value #>> '{}') AS value,key
 FROM jsonb_each(CASE WHEN jsonb_typeof(p_details)='object' THEN p_details ELSE '{}' END) WHERE jsonb_typeof(value)='string'),
 valid AS (SELECT DISTINCT ON (field) field,left(value,500) AS value FROM raw WHERE field IS NOT NULL AND length(value)>0
 AND value!~*'^(?:unknown|asked|not (?:provided|specified|stated|yet provided|yet specified)|n/?a|null|undefined|pending|tbd|to be (?:confirmed|determined)|not sure|unsure|hindi pa alam)[.!?\s]*$|^[-_.?\s]+$'
 AND regexp_replace(lower(normalize(value,NFKC)),'[^a-z0-9]','','g')<>regexp_replace(lower(normalize(key,NFKC)),'[^a-z0-9]','','g')
 AND regexp_replace(lower(normalize(value,NFKC)),'[^a-z0-9]','','g')<>regexp_replace(lower(normalize(field,NFKC)),'[^a-z0-9]','','g') AND value!~*'^sample[[:space:]]*:'
 AND (field<>'Lyrics language' OR value!~*'^english\s*(?:/|or)\s*tagalog(?:\s+lyrics)?$')
 AND (field<>'Vocal preference' OR value!~*'^male\s*(?:/|or)\s*female(?:\s+singer)?$')
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
