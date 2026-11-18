BEGIN;
-- New upstream controls were introduced after Suno's song-domain migration.
-- Keep the saved per-Page brief threshold in their collection status too.
DO $$ DECLARE definition text;needle text;BEGIN
 definition:=pg_get_functiondef('veo_telegram_intake_before_command_controls(uuid,bigint,bigint,text,jsonb)'::regprocedure);
 needle:=$old$coalesce(c->'intake'->>'detail_count','0')||'/3).'$old$;
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'Telegram brief status integration changed';END IF;
 EXECUTE replace(definition,needle,$new$coalesce(c->'intake'->>'detail_count','0')||'/'||coalesce(c->'intake'->>'required','?')||').' $new$);
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
