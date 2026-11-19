import {PGlite} from '@electric-sql/pglite';
import {afterAll,beforeAll,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),worker=id(2),replacement=id(3),outside=id(4),tenant=id(10),page=id(20),contact=id(30),sale=id(40);
let db:PGlite,seq=100;
const row=async(sql:string,args:any[]=[])=> (await db.query<any>(sql,args)).rows[0];
const update=async(actor:string,data:any)=> (await row('SELECT suno_song_work_action($1,$2) r',[actor,JSON.stringify({request_id:id(seq++),sale_id:sale,expected_version:1,status:'sent',reason:'Song sent to customer',...data})])).r;
const report=async(actor=owner,saleId:string|null=null)=> (await row("SELECT suno_song_work_report($1,NULL,$2,'all',0) r",[actor,saleId])).r;
const telegram=async(actor:number,action:string,data:any)=> (await row('SELECT suno_telegram_song_work($1,$2,-100123,$3,$4) r',[tenant,actor,action,JSON.stringify(data)])).r;
beforeAll(async()=>{
 db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA app_private;
 CREATE TABLE app_private.schema_migrations(version text PRIMARY KEY,description text);
 CREATE TABLE users(id uuid PRIMARY KEY,name text,is_active boolean DEFAULT true);CREATE TABLE veo_tenants(id uuid PRIMARY KEY);
 CREATE TABLE veo_accounts(user_id uuid PRIMARY KEY REFERENCES users(id),tenant_id uuid REFERENCES veo_tenants(id),active boolean DEFAULT true);
 CREATE TABLE pages(id uuid PRIMARY KEY,name text);CREATE TABLE contacts(id uuid PRIMARY KEY,page_id uuid,name text);
 CREATE TABLE user_pages(user_id uuid,page_id uuid);CREATE TABLE test_scopes(user_id uuid PRIMARY KEY,scope jsonb);
 CREATE TABLE suno_sales(id uuid PRIMARY KEY,tenant_id uuid REFERENCES veo_tenants(id),page_id uuid REFERENCES pages(id),contact_id uuid REFERENCES contacts(id),payee_id uuid REFERENCES veo_accounts(user_id),created_by uuid REFERENCES users(id),description text);
 CREATE TABLE suno_sale_payments(id uuid PRIMARY KEY,sale_id uuid,amount_minor bigint,commission_minor bigint);
 CREATE TABLE veo_orders(id uuid PRIMARY KEY,tenant_id uuid,page_id uuid);
 CREATE TABLE veo_audit(tenant_id uuid,actor_id uuid,action text,entity_id uuid,after_value jsonb);
 CREATE TABLE suno_song_work_requests(id uuid PRIMARY KEY,action text);
 CREATE FUNCTION veo_scope(actor uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT scope FROM test_scopes s JOIN veo_accounts a ON a.user_id=s.user_id AND a.active WHERE s.user_id=actor $$;
 CREATE FUNCTION veo_can_page(actor uuid,page uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM user_pages u JOIN veo_accounts a ON a.user_id=u.user_id AND a.active WHERE u.user_id=actor AND u.page_id=page) $$;
 CREATE FUNCTION veo_telegram_intake_context(p_tenant uuid,p_telegram bigint,p_chat bigint) RETURNS jsonb LANGUAGE plpgsql AS $$DECLARE actor uuid;BEGIN
  actor:=CASE p_telegram WHEN 42 THEN '${worker}'::uuid WHEN 43 THEN '${replacement}'::uuid ELSE NULL END;
  IF p_tenant<>'${tenant}' OR p_chat<>-100123 OR actor IS NULL OR NOT veo_can_page(actor,'${page}') THEN RAISE EXCEPTION 'Telegram access required' USING ERRCODE='42501';END IF;
  RETURN jsonb_build_object('actor_id',actor,'page_ids',jsonb_build_array('${page}'),'thread_id',133);END $$;
 CREATE FUNCTION suno_telegram_song_work(p_tenant uuid,p_telegram bigint,p_chat bigint,p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$BEGIN
  IF p_action='list' THEN INSERT INTO suno_song_work_requests VALUES((p_data->>'request_id')::uuid,'list') ON CONFLICT DO NOTHING;END IF;
  RETURN jsonb_build_object('request_id',p_data->>'request_id','chat_id',p_chat,'telegram_user_id',p_telegram,'text','Retained song controls');END $$;
 INSERT INTO veo_tenants VALUES('${tenant}');INSERT INTO users VALUES('${owner}','Owner',true),('${worker}','Makata',true),('${replacement}','Other Makata',true),('${outside}','Other branch',true);
 INSERT INTO veo_accounts VALUES('${owner}','${tenant}',true),('${worker}','${tenant}',true),('${replacement}','${tenant}',true),('${outside}','${tenant}',true);
 INSERT INTO pages VALUES('${page}','Suno');INSERT INTO contacts VALUES('${contact}','${page}','Client');
 INSERT INTO user_pages VALUES('${owner}','${page}'),('${worker}','${page}'),('${replacement}','${page}'),('${outside}','${page}');
 INSERT INTO suno_sales VALUES('${sale}','${tenant}','${page}','${contact}','${worker}','${owner}','Suno song');
 INSERT INTO suno_sale_payments VALUES('${id(50)}','${sale}',50000,10000);`);
 for(const [actor,role,workers]of [[owner,'owner',[owner,worker,replacement]],[worker,'member',[worker]],[replacement,'member',[replacement]],[outside,'manager',[outside]]] as const)await db.query('INSERT INTO test_scopes VALUES($1,$2)',[actor,JSON.stringify({user_id:actor,tenant_id:tenant,role,worker_ids:workers,launch_at:'2026-01-01'})]);
 await db.exec(readFileSync('supabase/migrations/202611200102_suno_sales_song_work.sql','utf8'));
},60000);
afterAll(async()=>{await db?.close();});
it('creates only working metadata for existing sales without inventing paid or delivered state',async()=>{
 expect((await report()).items[0]).toMatchObject({sale_id:sale,assignee_id:worker,payee_id:worker,status:'working',version:1,history:[]});
 expect((await row('SELECT count(*)::int n FROM suno_sale_payments')).n).toBe(1);
});
it('updates work independently from money with idempotency and stale-version protection',async()=>{
 const request=id(seq++),data={request_id:request};const first=await update(worker,data);expect(first).toMatchObject({status:'sent',version:2,payments_changed:false,earnings_changed:false});
 expect(await update(worker,data)).toEqual(first);
 await expect(update(worker,{request_id:request,status:'revision'})).rejects.toThrow(/different song data/);
 await expect(update(worker,{})).rejects.toThrow(/Refresh/);
 expect((await row('SELECT commission_minor FROM suno_sale_payments')).commission_minor).toBe(10000);
 expect((await report(worker)).items[0].history).toHaveLength(1);
});
it('restricts work reassignment to supervisors and preserves the original financial recipient',async()=>{
 await expect(update(worker,{expected_version:2,assignee_id:replacement})).rejects.toThrow(/supervisor/);
 await expect(update(outside,{expected_version:2})).rejects.toThrow(/assignment access/);
 await update(owner,{expected_version:2,assignee_id:replacement,status:'revision',reason:'Handover for revision'});
 expect((await report(worker)).total).toBe(0);expect((await report(replacement)).items[0]).toMatchObject({assignee_id:replacement,payee_id:worker,status:'revision',version:3});
 await expect(report(worker,sale)).rejects.toThrow(/assignment access/);
 expect((await row('SELECT payee_id FROM suno_sales')).payee_id).toBe(worker);
 await update(owner,{expected_version:3,assignee_id:worker,status:'working',reason:'Return to original Makata'});
});
it('accepts the existing Telegram SONG SENT protocol for direct sale IDs and rechecks assignment at rendering',async()=>{
 const request=id(seq++);const sent=await telegram(42,'sent',{request_id:request,order_id:sale});expect(sent.request_id).toBe(request);
 expect((await telegram(42,'sent',{request_id:request,order_id:sale}))).toEqual(sent);
 const rendered=await telegram(42,'render',{request_id:request});expect(rendered.text).toContain('Song reported sent');expect(rendered.text).toContain('Payments and earnings are unchanged');expect(rendered.thread_id).toBe(133);
 expect((await report()).items[0].history[0].source).toBe('telegram');
 await expect(telegram(43,'sent',{request_id:id(seq++),order_id:sale})).rejects.toThrow(/current assignment/);
 const version=(await report()).items[0].version;await update(owner,{expected_version:version,assignee_id:replacement});
 await expect(telegram(42,'render',{request_id:request})).rejects.toThrow(/assignment changed/);
});
it('lists new songs through the existing /songs menu and retains the older song protocol',async()=>{
 const request=id(seq++);await telegram(43,'revision',{request_id:id(seq++),order_id:sale});
 await telegram(43,'list',{request_id:request});const rendered=await telegram(43,'render',{request_id:request});expect(rendered.text).toContain('Suno Sales song work');expect(rendered.text).toContain(sale);expect(rendered.text).toContain('SONG SENT <sale UUID>');
 expect((await telegram(43,'sent',{request_id:id(seq++),order_id:id(800)})).text).toBe('Retained song controls');
});
it('creates work metadata automatically on a new sale without touching prior payments',async()=>{
 await db.query('INSERT INTO suno_sales VALUES($1,$2,$3,$4,$5,$6,$7)',[id(41),tenant,page,contact,worker,owner,'Second song']);
 expect((await report(worker)).items.find((i:any)=>i.sale_id===id(41))).toMatchObject({status:'working',version:1});
 expect((await row('SELECT sum(commission_minor)::int total FROM suno_sale_payments')).total).toBe(10000);
});
it('rechecks Page grants and keeps new tables, helper and RPCs private',async()=>{
 await db.query('DELETE FROM user_pages WHERE user_id=$1',[replacement]);await expect(report(replacement,sale)).rejects.toThrow(/assignment access/);
 for(const role of ['anon','authenticated'])for(const fn of ['suno_song_work_action(uuid,jsonb,text)','suno_song_work_report(uuid,uuid,uuid,text,integer)','suno_telegram_song_work(uuid,bigint,bigint,text,jsonb)'])expect((await row("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[role,fn])).allowed).toBe(false);
 expect((await row("SELECT has_function_privilege('service_role','suno_telegram_song_work_before_direct_sales(uuid,bigint,bigint,text,jsonb)','EXECUTE') allowed")).allowed).toBe(false);
 for(const table of ['suno_sale_work','suno_sale_work_events'])expect((await row("SELECT has_table_privilege('anon',$1,'SELECT') allowed",[table])).allowed).toBe(false);
});
