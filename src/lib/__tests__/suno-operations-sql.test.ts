import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),worker=id(2),outsider=id(3),tenant=id(10),page=id(20),page2=id(21),foreignPage=id(22),sale=id(40),contact=id(30);
let db:PGlite;
const row=async(sql:string,args:any[]=[])=> (await db.query<any>(sql,args)).rows[0];
const report=async(actor=owner,p:string|null=null,from='2026-11-23',to='2026-11-24',day='2026-11-24')=>(await row('SELECT suno_operations_report($1,$2,$3,$4,$5) r',[actor,from,to,p,day])).r;
const plan=async(actor=owner,data:any={})=>(await row('SELECT suno_operations_plan($1,$2) r',[actor,JSON.stringify({action:'capacity',worker_id:worker,page_id:page,work_date:new Date(Date.now()+8*3600000).toISOString().slice(0,10),capacity:4,quota:3,availability:'available',expected_version:0,reason:'Agreed daily allocation',...data})])).r;
beforeAll(async()=>{
 db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA app_private;
 CREATE TABLE app_private.schema_migrations(version text PRIMARY KEY,description text);
 CREATE TABLE users(id uuid PRIMARY KEY,name text,is_active boolean DEFAULT true);
 CREATE TABLE veo_tenants(id uuid PRIMARY KEY);CREATE TABLE veo_accounts(user_id uuid PRIMARY KEY,tenant_id uuid,role text,parent_id uuid,active boolean DEFAULT true);
 CREATE TABLE pages(id uuid PRIMARY KEY,name text);CREATE TABLE contacts(id uuid PRIMARY KEY,page_id uuid,name text,first_interaction_at timestamptz);
 CREATE TABLE ad_contact_sources(contact_id uuid,page_id uuid,first_inquiry_at timestamptz,attribution_status text,origin_ad_id text);
 CREATE TABLE user_pages(user_id uuid,page_id uuid);CREATE TABLE test_scopes(user_id uuid PRIMARY KEY,scope jsonb);
 CREATE TABLE veo_audit(tenant_id uuid,actor_id uuid,action text,entity_id uuid,after_value jsonb);
 CREATE TABLE suno_sales(id uuid PRIMARY KEY,tenant_id uuid,page_id uuid,contact_id uuid,payee_id uuid,description text,currency text,created_at timestamptz);
 CREATE TABLE suno_sale_charges(id uuid PRIMARY KEY,sale_id uuid,amount_minor bigint);
 CREATE TABLE suno_sale_payments(id uuid PRIMARY KEY,sale_id uuid,charge_id uuid,kind text,basis text,amount_minor bigint,commission_minor bigint,occurred_at timestamptz);
 CREATE TABLE suno_sale_work(sale_id uuid PRIMARY KEY,assignee_id uuid,status text,updated_at timestamptz);
 CREATE TABLE suno_sale_work_events(id bigint,sale_id uuid,before_value jsonb,after_value jsonb,created_at timestamptz);
 CREATE FUNCTION veo_scope(actor uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT scope FROM test_scopes s JOIN veo_accounts a ON a.user_id=s.user_id AND a.active WHERE s.user_id=actor $$;
 CREATE FUNCTION veo_can_page(actor uuid,page uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM user_pages u JOIN veo_accounts a ON a.user_id=u.user_id AND a.active WHERE u.user_id=actor AND u.page_id=page) $$;
 CREATE FUNCTION suno_workspace_policy_status(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"song_rate":20,"tip_rate":50,"revision_rate":20}'::jsonb $$;
 CREATE FUNCTION veo_calendar_spend(uuid[],date,date) RETURNS jsonb LANGUAGE sql AS $$ SELECT '[]'::jsonb $$;
 INSERT INTO veo_tenants VALUES('${tenant}');INSERT INTO users VALUES('${owner}','Owner',true),('${worker}','Makata',true),('${outsider}','Other branch',true);
 INSERT INTO veo_accounts VALUES('${owner}','${tenant}','owner',NULL,true),('${worker}','${tenant}','member','${owner}',true),('${outsider}','${tenant}','manager',NULL,true);
 INSERT INTO pages VALUES('${page}','Page one'),('${page2}','Page two'),('${foreignPage}','Private Page');
 INSERT INTO user_pages VALUES('${owner}','${page}'),('${owner}','${page2}'),('${worker}','${page}'),('${worker}','${page2}'),('${outsider}','${page}');
 INSERT INTO contacts VALUES('${contact}','${page}','Client','2026-11-22T16:00:00Z'),('${id(31)}','${page}',NULL,NULL);
 INSERT INTO ad_contact_sources VALUES('${contact}','${page}','2026-11-22T16:00:00Z','verified_inline','123');
 INSERT INTO suno_sales VALUES('${sale}','${tenant}','${page}','${contact}','${worker}','A song','PHP','2026-11-22T16:00:00Z'),
 ('${id(41)}','${tenant}','${page2}','${contact}','${worker}','USD song','USD','2026-11-23T16:00:00Z'),
 ('${id(42)}','${tenant}','${page}','${contact}','${outsider}','Other branch song','PHP','2026-11-23T16:00:00Z');
 INSERT INTO suno_sale_charges VALUES('${id(50)}','${sale}',10000),('${id(51)}','${id(41)}',10000);
 INSERT INTO suno_sale_payments VALUES('${id(60)}','${sale}','${id(50)}','song','song',10000,2000,'2026-11-22T15:59:59Z'),
 ('${id(61)}','${sale}','${id(50)}','refund','song',2000,-400,'2026-11-22T16:00:00Z'),
 ('${id(62)}','${sale}',NULL,'tip','tip',1000,500,'2026-11-23T16:00:00Z'),
 ('${id(63)}','${id(41)}','${id(51)}','song','song',3000,600,'2026-11-24T15:59:59Z'),
 ('${id(64)}','${id(42)}',NULL,'tip','tip',99999,49999,'2026-11-23T16:00:00Z');
 INSERT INTO suno_sale_work VALUES('${sale}','${worker}','revision',now()),('${id(41)}','${worker}','working',now()),('${id(42)}','${outsider}','working',now());
 INSERT INTO suno_sale_work_events VALUES(1,'${sale}','{"status":"working"}','{"status":"sent","assignee_id":"${worker}"}','2026-11-23T15:59:59Z'),
 (2,'${sale}','{"status":"sent"}','{"status":"revision","assignee_id":"${worker}"}','2026-11-23T16:00:00Z'),
 (3,'${sale}','{"status":"revision"}','{"status":"sent","assignee_id":"${worker}"}','2026-11-24T00:00:00Z');`);
 for(const [actor,role,workers]of [[owner,'owner',[owner,worker]],[worker,'member',[worker]],[outsider,'manager',[outsider]]] as const)await db.query('INSERT INTO test_scopes VALUES($1,$2)',[actor,JSON.stringify({user_id:actor,tenant_id:tenant,role,page_ids:[page,page2],worker_ids:workers,launch_at:'2026-11-01T00:00:00Z'})]);
 await db.exec(readFileSync('supabase/migrations/202611240101_suno_operations_reports.sql','utf8'));
},60000);
afterAll(async()=>{await db?.close();});
it('separates PHT inquiry, creation, payment, refund and first-sent dates without counting a revised song twice',async()=>{
 const r=await report();expect(r.daily).toHaveLength(2);expect(r.daily[0]).toMatchObject({work_date:'2026-11-23',new_sales:1,songs_sent:1});expect(r.daily[1]).toMatchObject({work_date:'2026-11-24',new_sales:1,songs_sent:0});
 expect(r.money.find((m:any)=>m.currency==='PHP')).toMatchObject({net_received_minor:-1000,commission_minor:100,outstanding_minor:2000,tip_minor:1000,refunds_minor:2000});
 expect(r.money.find((m:any)=>m.currency==='USD')).toMatchObject({net_received_minor:3000,commission_minor:600,outstanding_minor:7000});
 expect(r.period).toMatchObject({new_sales:2,paying_clients:1,paid_sales:1,songs_sent:1});expect(r.readiness).toMatchObject({inquiries:1,verified_ad_inquiries:1,contacts_without_inquiry_date:1});
 expect(r.backlog).toMatchObject({working:1,revisions:1});expect(r.capacity.capacity).toBeNull();
});
it('enforces current branch, Page, launch and login scope inside the database',async()=>{
 expect((await report(outsider)).money[0].net_received_minor).toBe(99999);
 await expect(report(worker,foreignPage)).rejects.toThrow(/Page access/);await expect(report(owner,null,'2026-10-01')).rejects.toThrow(/93 Philippine/);
 await db.query('UPDATE users SET is_active=false WHERE id=$1',[worker]);await expect(report(worker)).rejects.toThrow(/Workspace access/);await db.query('UPDATE users SET is_active=true WHERE id=$1',[worker]);
 expect((await report(worker)).readiness).toBeNull();
});
it('counts one worker across multiple Page allocations, retains unknown plans and rejects stale edits',async()=>{
 const p=await plan();expect(p.version).toBe(1);await plan(owner,{page_id:page2,capacity:2,quota:1});
 const day=p.work_date,r=await report(owner,null,'2026-11-23','2026-11-24',day);expect(r.capacity).toMatchObject({workers:1,capacity:6,quota:4});
 await expect(plan()).rejects.toThrow(/Plan changed/);await plan(owner,{expected_version:1,capacity:4,quota:3,availability:'unknown'});
 expect((await report(owner,null,'2026-11-23','2026-11-24',day)).capacity).toMatchObject({workers:1,capacity:2,quota:1});
 await expect(plan(worker)).rejects.toThrow(/Supervisor/);await expect(plan(owner,{worker_id:outsider})).rejects.toThrow(/branch/);
 await expect(plan(owner,{work_date:'2020-01-01'})).rejects.toThrow(/today or tomorrow/);
 const audit=await row("SELECT count(*)::int n FROM veo_audit WHERE action='suno_capacity_plan'");expect(audit.n).toBe(3);
});
it('saves explicit zero budgets without changing payments, work history or commission',async()=>{
 const before=await report();const saved=await plan(owner,{action:'budget',currency:'PHP',planned_minor:0});expect(saved.planned_minor).toBe(0);
 await expect(plan(owner,{action:'budget',currency:'PHP',planned_minor:100})).rejects.toThrow(/Budget changed/);
 await expect(plan(outsider,{action:'budget',currency:'PHP',planned_minor:100})).rejects.toThrow(/Owner or Team Leader/);
 expect((await report()).money).toEqual(before.money);expect((await row('SELECT count(*)::int n FROM suno_sale_work_events')).n).toBe(3);
 for(const role of ['anon','authenticated'])for(const fn of ['suno_operations_plan(uuid,jsonb)','suno_operations_report(uuid,date,date,uuid,date)'])expect((await row('SELECT has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,fn])).allowed).toBe(false);
});
