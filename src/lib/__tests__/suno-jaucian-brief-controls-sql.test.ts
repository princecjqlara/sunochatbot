import { afterAll, beforeAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
let db: PGlite;
beforeAll(async () => {
    db = new PGlite();
    await db.exec(`CREATE ROLE anon;
      CREATE FUNCTION veo_telegram_intake_before_command_controls(p_tenant uuid,p_telegram bigint,p_chat bigint,p_action text,p_data jsonb)
      RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE c jsonb:=jsonb_build_object('intake',p_data); BEGIN
        RETURN jsonb_build_object('text','Collecting client details ('||coalesce(c->'intake'->>'detail_count','0')||'/3).');
      END $$;
      REVOKE ALL ON FUNCTION veo_telegram_intake_before_command_controls(uuid,bigint,bigint,text,jsonb) FROM PUBLIC,anon;`);
    await db.exec(readFileSync('supabase/migrations/202611160105_suno_jaucian_brief_controls.sql', 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });
const render = async (details: object) => (await db.query<{ value: { text: string } }>(
    "SELECT veo_telegram_intake_before_command_controls(NULL,42,-123,'render',$1) AS value", [JSON.stringify(details)]
)).rows[0].value.text;
it('uses the saved Suno assignment requirement rather than the inherited three-answer count', async () => {
    expect(await render({ detail_count: 4, required: 6 })).toBe('Collecting client details (4/6).');
    expect(await render({ detail_count: 7, required: 10 })).toBe('Collecting client details (7/10).');
});
it('leaves a missing requirement unknown', async () => {
    expect(await render({ detail_count: 1 })).toBe('Collecting client details (1/?).');
});
it('retains the function access restrictions while replacing its presentation', async () => {
    expect((await db.query<{ allowed: boolean }>("SELECT has_function_privilege('anon','veo_telegram_intake_before_command_controls(uuid,bigint,bigint,text,jsonb)','EXECUTE') AS allowed")).rows[0].allowed).toBe(false);
});
