import {PGlite} from '@electric-sql/pglite';
import {afterAll,beforeAll,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),member=id(2),other=id(3),foreign=id(4),tenant=id(10),page=id(20),contact=id(30);
let db:PGlite,counter=100,sale:any,revision:any,songPayment:any,tipPayment:any;
const at=()=>new Date(Date.now()-60000).toISOString();
const query=async(sql:string,args:any[]=[])=> (await db.query<any>(sql,args)).rows[0];
const action=async(actor:string,kind:string,data:any)=> (await query('SELECT suno_sale_action($1,$2,$3) r',[actor,kind,JSON.stringify({request_id:id(counter++),...data})])).r;
const report=async(actor=owner,pageId:string|null=null,contactId:string|null=null)=> (await query("SELECT suno_sales_report($1,current_date-2,current_date+1,$2,$3,0) r",[actor,pageId,contactId])).r;
const pay=(data:any)=>action(owner,'payment',{sale_id:sale.sale_id,kind:'song',charge_id:sale.charge_id,amount_minor:10000,confirmed:true,reference:'RECEIPT-'+counter,occurred_at:at(),...data});
beforeAll(async()=>{
 db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE SCHEMA app_private;CREATE TABLE app_private.schema_migrations(version text PRIMARY KEY,description text);CREATE TABLE app_private.suno_retained_runtime_installation(id int);
 CREATE TABLE users(id uuid PRIMARY KEY,name text);CREATE TABLE veo_tenants(id uuid PRIMARY KEY);
 CREATE TABLE veo_accounts(user_id uuid PRIMARY KEY REFERENCES users(id),tenant_id uuid REFERENCES veo_tenants(id),role text,active boolean DEFAULT true);
 CREATE TABLE pages(id uuid PRIMARY KEY,name text);CREATE TABLE contacts(id uuid PRIMARY KEY,page_id uuid REFERENCES pages(id),name text);
 CREATE TABLE user_pages(user_id uuid,page_id uuid);CREATE TABLE test_scopes(user_id uuid PRIMARY KEY,scope jsonb);
 CREATE TABLE veo_audit(id bigint GENERATED ALWAYS AS IDENTITY,tenant_id uuid,actor_id uuid,action text,entity_id uuid,after_value jsonb);
 CREATE TABLE suno_workspace_policies(tenant_id uuid PRIMARY KEY REFERENCES veo_tenants(id),financial_policy text CHECK(financial_policy='veo_current'),confirmed_by uuid REFERENCES users(id),confirmed_at timestamptz);
 CREATE FUNCTION veo_scope(p_actor uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT s.scope FROM test_scopes s JOIN veo_accounts a ON a.user_id=s.user_id AND a.active WHERE s.user_id=p_actor $$;
 CREATE FUNCTION veo_can_page(p_actor uuid,p_page uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM user_pages u JOIN veo_accounts a ON a.user_id=u.user_id AND a.active WHERE u.user_id=p_actor AND u.page_id=p_page) $$;
 CREATE FUNCTION veo_action_before_suno_policy(uuid,text,jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
 INSERT INTO veo_tenants VALUES('${tenant}'),('${id(11)}');
 INSERT INTO users VALUES('${owner}','Owner'),('${member}','Makata'),('${other}','Other branch'),('${foreign}','Foreign');
 INSERT INTO veo_accounts VALUES('${owner}','${tenant}','owner',true),('${member}','${tenant}','member',true),('${other}','${tenant}','member',true),('${foreign}','${id(11)}','owner',true);
 INSERT INTO pages VALUES('${page}','Suno'),('${id(21)}','Foreign');INSERT INTO contacts VALUES('${contact}','${page}','Client'),('${id(31)}','${id(21)}','Other client');
 INSERT INTO user_pages VALUES('${owner}','${page}'),('${member}','${page}'),('${other}','${page}'),('${foreign}','${id(21)}');`);
 for(const [actor,t,p,role,workers]of [[owner,tenant,page,'owner',[owner,member]],[member,tenant,page,'member',[member]],[other,tenant,page,'member',[other]],[foreign,id(11),id(21),'owner',[foreign]]] as const)await db.query('INSERT INTO test_scopes VALUES($1,$2)',[actor,JSON.stringify({user_id:actor,tenant_id:t,page_ids:[p],role,worker_ids:workers,launch_at:new Date(Date.now()-86400000).toISOString()})]);
 await db.exec(readFileSync('supabase/migrations/202611200101_suno_direct_sales.sql','utf8'));
 const extras=readFileSync('supabase/migrations/202611280101_suno_sales_extras.sql','utf8');
 // Rehearse the additive migration and verify that transaction rollback restores the schema.
 const definition=await query("SELECT pg_get_functiondef('suno_sale_action(uuid,text,jsonb)'::regprocedure) sql");
 await db.exec('BEGIN');
 await db.exec(extras.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,''));
 expect((await query("SELECT is_nullable FROM information_schema.columns WHERE table_name='suno_sale_payments' AND column_name='reference'")).is_nullable).toBe('YES');
 await db.exec('ROLLBACK');
 expect(await query("SELECT pg_get_functiondef('suno_sale_action(uuid,text,jsonb)'::regprocedure) sql")).toEqual(definition);
 expect((await query("SELECT is_nullable FROM information_schema.columns WHERE table_name='suno_sale_payments' AND column_name='reference'")).is_nullable).toBe('NO');
 expect((await query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='suno_sale_payments' AND column_name='description'")).n).toBe(0);
 await db.exec(extras);
},60000);
afterAll(async()=>{await db?.close();});
it('requires Owner confirmation of the actual Suno policy and rejects Veo policy',async()=>{
 expect((await report()).policy).toMatchObject({confirmed:false,song_rate:20,tip_rate:50,revision_rate:20});
 await expect(action(owner,'sale',{page_id:page,contact_id:contact,payee_id:member,description:'Song',currency:'PHP',amount_minor:10000})).rejects.toThrow(/Confirm Suno/);
 await expect(db.query("SELECT suno_confirm_earnings_policy($1,'suno_direct_sales_v1')",[member])).rejects.toThrow(/Owner/);
 await expect(db.query("SELECT suno_confirm_earnings_policy($1,'veo_current')",[owner])).rejects.toThrow(/Suno/);
 expect((await query("SELECT suno_confirm_earnings_policy($1,'suno_direct_sales_v1') r",[owner])).r.confirmed).toBe(true);
});
it('records a direct song sale with no stage, Closed/Done target or payment inference',async()=>{
 sale=await action(owner,'sale',{page_id:page,contact_id:contact,payee_id:member,description:'Custom song',currency:'PHP',amount_minor:10000});
 const r=await report();expect(r.sales[0].charges[0]).toMatchObject({kind:'song',amount_minor:10000,paid_minor:0});expect(r.totals).toEqual([]);
});
it('pays 20% on deposits and balances with idempotent receipt writes',async()=>{
 const request=id(counter++),data={request_id:request,sale_id:sale.sale_id,kind:'song',charge_id:sale.charge_id,amount_minor:4000,confirmed:true,reference:'SONG-DEPOSIT',occurred_at:at()};
 songPayment=await action(owner,'payment',data);expect(songPayment.commission_minor).toBe(800);
 expect(await action(owner,'payment',data)).toEqual(songPayment);
 await expect(action(owner,'payment',{...data,amount_minor:5000})).rejects.toThrow(/different data/);
 expect((await pay({amount_minor:6000})).commission_minor).toBe(1200);
 await expect(pay({amount_minor:1})).rejects.toThrow(/exceeds/);
 expect((await report()).totals[0]).toMatchObject({song_minor:10000,commission_minor:2000});
});
it('keeps 50% tips separate from the song balance',async()=>{
 tipPayment=await pay({kind:'tip',charge_id:null,amount_minor:2000});expect(tipPayment.commission_minor).toBe(1000);
 expect((await report()).sales[0].charges[0].paid_minor).toBe(10000);
 await expect(pay({kind:'tip',charge_id:sale.charge_id,amount_minor:100})).rejects.toThrow(/Tips/);
});
it('adds an unpaid revision fee and earns 20% only when that fee is paid',async()=>{
 revision=await action(owner,'revision_fee',{sale_id:sale.sale_id,description:'Extra revision',amount_minor:5000});
 expect((await report()).totals[0].commission_minor).toBe(3000);
 expect((await pay({kind:'revision',charge_id:revision.charge_id,amount_minor:5000})).commission_minor).toBe(1000);
 expect((await report()).totals[0]).toMatchObject({net_received_minor:17000,commission_minor:4000,company_share_minor:13000,revision_minor:5000,tip_minor:2000});
 await expect(pay({kind:'song',charge_id:revision.charge_id,amount_minor:1})).rejects.toThrow(/matching/);
});
it('requires staff-attested receipt evidence and rejects future or pre-launch times',async()=>{
 await expect(pay({kind:'tip',charge_id:null,amount_minor:100,confirmed:false})).rejects.toThrow(/Verify/);
 await expect(pay({kind:'tip',charge_id:null,amount_minor:100,reference:'x'})).rejects.toThrow(/reference/);
 await expect(pay({kind:'tip',charge_id:null,amount_minor:100,occurred_at:new Date(Date.now()+86400000).toISOString()})).rejects.toThrow(/payment time/);
 await expect(pay({kind:'tip',charge_id:null,amount_minor:100,occurred_at:'2020-01-01T00:00:00Z'})).rejects.toThrow(/activation/);
});
it('reverses 50% tip earnings on refunds and prevents over-refunds and duplicate references',async()=>{
 const refund={sale_id:sale.sale_id,payment_id:tipPayment.payment_id,amount_minor:1000,confirmed:true,reference:'TIP-REFUND-1',occurred_at:new Date().toISOString()};
 expect((await action(owner,'refund',refund)).commission_minor).toBe(-500);
 await expect(action(owner,'refund',{...refund,reference:'TIP-REFUND-2',amount_minor:1001})).rejects.toThrow(/exceeds/);
 await expect(pay({kind:'tip',charge_id:null,amount_minor:100,reference:'TIP-REFUND-1'})).rejects.toThrow(/unique/);
 expect((await report()).totals[0]).toMatchObject({net_received_minor:16000,commission_minor:3500,company_share_minor:12500,refunds_minor:1000});
});
it('conserves minor units through split payments, partial refunds and repayment',async()=>{
 const tiny=await action(owner,'sale',{page_id:page,contact_id:contact,payee_id:member,description:'Minor-unit example',currency:'USD',amount_minor:3});
 const first=await pay({sale_id:tiny.sale_id,charge_id:tiny.charge_id,amount_minor:2});expect(first.commission_minor).toBe(0);
 expect((await pay({sale_id:tiny.sale_id,charge_id:tiny.charge_id,amount_minor:1})).commission_minor).toBe(1);
 expect((await action(owner,'refund',{sale_id:tiny.sale_id,payment_id:first.payment_id,amount_minor:2,confirmed:true,reference:'TINY-REFUND',occurred_at:new Date().toISOString()})).commission_minor).toBe(-1);
 expect((await pay({sale_id:tiny.sale_id,charge_id:tiny.charge_id,amount_minor:2})).commission_minor).toBe(1);
 expect((await report()).totals.find((t:any)=>t.currency==='USD')).toMatchObject({net_received_minor:3,commission_minor:1,company_share_minor:2});
});
it('scopes sales, contacts, payees and retry responses to live branch and Page access',async()=>{
 expect((await report(member)).sale_count).toBe(2);expect((await report(other)).sale_count).toBe(0);expect((await report(foreign)).sale_count).toBe(0);
 await expect(report(member,id(21))).rejects.toThrow(/Page access/);await expect(report(member,null,id(31))).rejects.toThrow(/Contact access/);
 await expect(action(other,'revision_fee',{sale_id:sale.sale_id,description:'Foreign sale',amount_minor:100})).rejects.toThrow(/Sale access/);
 await expect(action(owner,'sale',{page_id:page,contact_id:id(31),payee_id:member,description:'Foreign contact',currency:'PHP',amount_minor:100})).rejects.toThrow(/authorized/);
 await expect(action(owner,'sale',{page_id:page,contact_id:contact,payee_id:other,description:'Foreign staff branch',currency:'PHP',amount_minor:100})).rejects.toThrow(/authorized/);
});
it('blocks inherited Veo financial actions and workers even after Suno policy confirmation',async()=>{
 expect((await query('SELECT suno_financial_workers_ready() ready')).ready).toBe(false);
 for(const kind of ['payment','import_business_order','submission','incentive','tip'])await expect(db.query('SELECT veo_action($1,$2,$3)',[owner,kind,'{}'])).rejects.toThrow(/Suno uses direct Sales/);
});
it('reverses the 20% revision share and uses Suno rates through the compatibility salary RPC',async()=>{
 const payment=(await report()).sales.find((s:any)=>s.id===sale.sale_id).payments.find((p:any)=>p.basis==='revision');
 expect((await action(owner,'refund',{sale_id:sale.sale_id,payment_id:payment.id,amount_minor:1000,confirmed:true,reference:'REVISION-REFUND',occurred_at:new Date().toISOString()})).commission_minor).toBe(-200);
 const salary=(await query("SELECT veo_salary($1,(now() AT TIME ZONE 'Asia/Manila')::date) r",[member])).r;
 expect(salary).toMatchObject({rate:20,tip_rate:50,revision_rate:20,policy:'suno_direct_sales_v1',target:0});
 expect(salary.totals.find((t:any)=>t.currency==='PHP').commission_minor).toBe(3300);
});
it('keeps table data and write/report RPCs private to the service role',async()=>{
 for(const role of ['anon','authenticated'])for(const table of ['suno_sales','suno_sale_charges','suno_sale_payments','suno_sale_requests'])expect((await query('SELECT has_table_privilege($1,$2,\'SELECT\') allowed',[role,table])).allowed).toBe(false);
 for(const role of ['anon','authenticated'])for(const fn of ['suno_sale_action(uuid,text,jsonb)','suno_sales_report(uuid,date,date,uuid,uuid,integer)','suno_confirm_earnings_policy(uuid,text)'])expect((await query('SELECT has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,fn])).allowed).toBe(false);
});
it('records amounts without a reference and preserves request idempotency',async()=>{
 const data={request_id:id(counter++),kind:'tip',charge_id:null,amount_minor:200,reference:null,occurred_at:at()};
 const first=await pay(data);expect(first.commission_minor).toBe(100);
 expect(await pay(data)).toEqual(first);
 const second=await pay({...data,request_id:id(counter++)});expect(second.payment_id).not.toBe(first.payment_id);
 const r=await query('SELECT reference,amount_minor FROM suno_sale_payments WHERE id=$1',[first.payment_id]);expect(r).toEqual({reference:null,amount_minor:200});
});
it('records 50% additional services without changing charge balances and reverses their earnings on refunds',async()=>{
 const before=await report(),beforeSale=before.sales.find((s:any)=>s.id===sale.sale_id);
 const data={request_id:id(counter++),kind:'extra',charge_id:null,amount_minor:25000,description:'Video edit',reference:null,occurred_at:at()};
 const extra=await pay(data);expect(extra.commission_minor).toBe(12500);expect(await pay(data)).toEqual(extra);
 let r=await report();let saved=r.sales.find((s:any)=>s.id===sale.sale_id);
 expect(saved.charges).toEqual(beforeSale.charges);expect(saved.payments.find((p:any)=>p.id===extra.payment_id)).toMatchObject({kind:'extra',basis:'extra',description:'Video edit',rate_percent:50,amount_minor:25000,reference:null});
 expect(r.totals.find((t:any)=>t.currency==='PHP').extra_minor).toBe(25000);
 const refund={sale_id:sale.sale_id,payment_id:extra.payment_id,amount_minor:10000,confirmed:true,reference:null,occurred_at:new Date().toISOString()};
 expect((await action(owner,'refund',refund)).commission_minor).toBe(-5000);
 r=await report();saved=r.sales.find((s:any)=>s.id===sale.sale_id);
 expect(saved.charges).toEqual(beforeSale.charges);expect(r.totals.find((t:any)=>t.currency==='PHP').extra_minor).toBe(15000);
 expect(saved.payments.find((p:any)=>p.refund_of===extra.payment_id)).toMatchObject({basis:'extra',description:'Video edit',rate_percent:50});
 await expect(action(owner,'refund',{...refund,amount_minor:15001})).rejects.toThrow(/exceeds/);
 await expect(pay({...data,request_id:id(counter++),description:''})).rejects.toThrow(/Describe/);
 await expect(pay({...data,request_id:id(counter++),charge_id:sale.charge_id})).rejects.toThrow(/cannot pay/);
});
it('rounds tips and additional services in separate streams',async()=>{
 const tiny=await action(owner,'sale',{page_id:page,contact_id:contact,payee_id:member,description:'Separate streams',currency:'PHP',amount_minor:100});
 const payment={sale_id:tiny.sale_id,charge_id:null,amount_minor:1,reference:null};
 expect((await pay({...payment,kind:'tip'})).commission_minor).toBe(1);
 const extra=await pay({...payment,kind:'extra',description:'Artwork'});expect(extra.commission_minor).toBe(1);
 expect((await action(owner,'refund',{sale_id:tiny.sale_id,payment_id:extra.payment_id,amount_minor:1,confirmed:true,reference:null,occurred_at:new Date().toISOString()})).commission_minor).toBe(-1);
 expect((await report()).sales.find((s:any)=>s.id===tiny.sale_id).charges[0].paid_minor).toBe(0);
});
