import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, createCipheriv, createHash } from 'node:crypto';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import pg from 'pg';
import { assertProjectCredentials, sqlIdentifier as q } from './lib/database-migration-safety.mjs';
import { protectBackupKey } from './lib/private-backup-key.mjs';
const schemaFile=process.argv.find(arg=>arg.startsWith('--schema='))?.slice('--schema='.length)||'.private/suno-schema.json';
const snapshot=JSON.parse(fs.readFileSync(schemaFile,'utf8'));
const checked=assertProjectCredentials(process.env,'cxgynadprukyeuqbchbs');
const id=randomUUID(), directory=path.resolve('.private/backups/'+id);
fs.mkdirSync(directory,{recursive:true});
const key=randomBytes(32);
fs.writeFileSync(path.join(directory,'key.dpapi'),protectBackupKey(key),{flag:'wx'});
fs.copyFileSync(schemaFile,path.join(directory,'schema.json'));
const report={id,project:snapshot.project,started_at:new Date().toISOString(),read_only:true,encrypted:true,key_protection:'Windows CurrentUser DPAPI',complete:false,restore_verified:false,production_writes:0,tables:[],sequences:[]};
const flush=()=>fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(report,null,2)+'\n');
const db=new pg.Client({connectionString:checked.connectionString,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000,query_timeout:90000});
db.on('error',()=>{});
try {
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await db.query("SET LOCAL timezone='UTC';SET LOCAL statement_timeout='60s';SET LOCAL idle_in_transaction_session_timeout='180s'");
 report.snapshot=(await db.query('SELECT transaction_timestamp() AS at,txid_current_snapshot()::text AS identity')).rows[0];
 for(const table of snapshot.tables) {
  const name=table.schema+'.'+table.name,filename=name+'.jsonl.gz.aes',iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(snapshot.project+'|'+name));
  const gzip=createGzip({level:6}),file=fs.createWriteStream(path.join(directory,filename),{flags:'wx'});
  const done=pipeline(gzip,cipher,file);done.catch(()=>{});
  const hash=createHash('sha256');let rows=0,bytes=0;
  await db.query('DECLARE backup_rows NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS row FROM '+q(table.schema)+'.'+q(table.name)+' t');
  for(;;) {
   const batch=await db.query('FETCH FORWARD 1000 FROM backup_rows');if(!batch.rows.length)break;
   for(const record of batch.rows) {const line=record.row+'\n';hash.update(line);bytes+=Buffer.byteLength(line);if(!gzip.write(line))await once(gzip,'drain');rows++;}
  }
  await db.query('CLOSE backup_rows');gzip.end();await done;
  report.tables.push({schema:table.schema,name:table.name,file:filename,rows,bytes,sha256:hash.digest('hex'),iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex')});flush();
 }
 for(const sequence of snapshot.sequences) {
  const state=(await db.query('SELECT last_value::text,is_called FROM '+q(sequence.schema)+'.'+q(sequence.name))).rows[0];
  report.sequences.push({...sequence,...state});
 }
 await db.query('ROLLBACK');report.complete=true;report.completed_at=new Date().toISOString();flush();
 fs.writeFileSync('.private/latest-suno-backup.json',JSON.stringify({directory,manifest:path.join(directory,'manifest.json')},null,2)+'\n');
 console.log(JSON.stringify({complete:true,encrypted:true,tables:report.tables.length,rows:report.tables.reduce((n,t)=>n+t.rows,0),backup_id:id,production_writes:0}));
}catch(error){await db.query('ROLLBACK').catch(()=>{});report.error=error.code||'backup_failed';flush();console.error('Suno backup failed: '+report.error);process.exitCode=1;}
finally{key.fill(0);await db.end().catch(()=>{});}
