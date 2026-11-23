import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let db:PGlite;
const row=async(sql:string,args:any[]=[])=> (await db.query<any>(sql,args)).rows[0];
const actual='2026-11-18T12:34:56.000Z',bad=new Date(Date.parse(actual)/1000).toISOString();
beforeAll(async()=>{
 db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA app_private;
 CREATE TABLE app_private.schema_migrations(version text PRIMARY KEY,description text);
 CREATE TABLE contacts(id uuid PRIMARY KEY,page_id uuid,created_at timestamptz,first_interaction_at timestamptz,name text,chatbot_enabled boolean,pipeline_stage text);
 CREATE TABLE ad_contact_sources(contact_id uuid PRIMARY KEY,page_id uuid,first_inquiry_at timestamptz,first_message_id text,origin_ad_id text);
 INSERT INTO contacts VALUES('${id(1)}','${id(20)}','${actual}','${bad}','Client',false,'qualified'),
 ('${id(2)}','${id(20)}','2026-11-20','${bad}','Unresolved',true,'new'),
 ('${id(3)}','${id(20)}','2026-11-20','2026-10-01','Supported older history',true,'new');
 INSERT INTO ad_contact_sources VALUES('${id(1)}','${id(20)}','${bad}','provider-message','123');`);
 await db.exec(readFileSync('supabase/migrations/202611240102_suno_inquiry_timestamp_integrity.sql','utf8'));
},60000);
afterAll(async()=>{await db?.close();});
it('repairs independently supported inquiry dates and dependent cohort sources while preserving staff controls and attribution',async()=>{
 const c=await row('SELECT * FROM contacts WHERE id=$1',[id(1)]);expect(c.first_interaction_at.toISOString()).toBe(actual);expect(c).toMatchObject({name:'Client',chatbot_enabled:false,pipeline_stage:'qualified'});
 const s=await row('SELECT * FROM ad_contact_sources WHERE contact_id=$1',[id(1)]);expect(s.first_inquiry_at.toISOString()).toBe(actual);expect(s).toMatchObject({first_message_id:'provider-message',origin_ad_id:'123'});
 expect((await row('SELECT count(*)::int n FROM app_private.suno_inquiry_date_repairs')).n).toBe(2);
});
it('keeps unsupported dates and intentional historical dates rather than substituting creation time',async()=>{
 expect((await row('SELECT first_interaction_at FROM contacts WHERE id=$1',[id(2)])).first_interaction_at.toISOString()).toBe(bad);
 expect((await row('SELECT first_interaction_at FROM contacts WHERE id=$1',[id(3)])).first_interaction_at.toISOString()).toBe('2026-10-01T00:00:00.000Z');
 expect((await row("SELECT app_private.suno_supported_inquiry_time($1,$2,'2026-11-01') value",[bad,actual])).value.toISOString()).toBe(bad);
});
it('normalizes new provider-second timestamps before storage and journals each correction once',async()=>{
 await db.query('INSERT INTO contacts VALUES($1,$2,$3,$4,$5,true,$6)',[id(4),id(20),actual,bad,'New client','new']);
 expect((await row('SELECT first_interaction_at FROM contacts WHERE id=$1',[id(4)])).first_interaction_at.toISOString()).toBe(actual);
 await db.query('UPDATE contacts SET first_interaction_at=$1 WHERE id=$2',[bad,id(4)]);
 expect((await row('SELECT count(*)::int n FROM app_private.suno_inquiry_date_repairs WHERE record_id=$1',[id(4)])).n).toBe(1);
 await db.query('INSERT INTO ad_contact_sources VALUES($1,$2,$3,$4,NULL)',[id(4),id(20),bad,'another-message']);
 expect((await row('SELECT first_inquiry_at FROM ad_contact_sources WHERE contact_id=$1',[id(4)])).first_inquiry_at.toISOString()).toBe(actual);
});
it('retains private journal access and keeps the unit correction independent of session timezone',async()=>{
 for(const role of ['anon','authenticated'])expect((await row("SELECT has_table_privilege($1,'app_private.suno_inquiry_date_repairs','SELECT') allowed",[role])).allowed).toBe(false);
 await db.exec("SET TIME ZONE 'Asia/Manila'");expect((await row('SELECT app_private.suno_supported_inquiry_time($1,$2,$3) value',[bad,actual,'2026-11-24'])).value.toISOString()).toBe(actual);
});
