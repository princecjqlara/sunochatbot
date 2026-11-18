import fs from 'node:fs';
import path from 'node:path';
import { createDecipheriv,createHash } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { unprotectBackupKey } from './private-backup-key.mjs';
import { sqlIdentifier as q } from './database-migration-safety.mjs';

export async function restorePrivateSunoBackup(db,snapshot,directory) {
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
 if(!manifest.complete||manifest.project!==snapshot.project||!manifest.encrypted)throw Error('A complete verified-source encrypted backup is required');
 const key=unprotectBackupKey(fs.readFileSync(path.join(directory,'key.dpapi')));
 const restored=[];
 try {
  await db.exec("SET timezone='UTC'");
  for(const table of snapshot.tables)await db.exec('ALTER TABLE '+q(table.schema)+'.'+q(table.name)+' DISABLE TRIGGER ALL');
  for(const table of manifest.tables) {
   const name=table.schema+'.'+table.name;
   const columns=snapshot.columns.filter(c=>c.schema===table.schema&&c.table_name===table.name&&!c.generated);
   const names=columns.map(c=>q(c.name)).join(',');
   const insert='INSERT INTO '+q(table.schema)+'.'+q(table.name)+' ('+names+')'+(columns.some(c=>c.identity==='a')?' OVERRIDING SYSTEM VALUE':'')+' SELECT '+names+' FROM jsonb_populate_recordset(NULL::'+q(table.schema)+'.'+q(table.name)+',$1::jsonb)';
   const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(table.iv,'hex'));
   decipher.setAAD(Buffer.from(snapshot.project+'|'+name));decipher.setAuthTag(Buffer.from(table.tag,'hex'));
   const output=createGunzip();const stream=pipeline(fs.createReadStream(path.join(directory,table.file)),decipher,output);stream.catch(()=>{});
   const reader=createInterface({input:output,crlfDelay:Infinity}),hash=createHash('sha256');let batch=[],rows=0;
   for await(const line of reader) {hash.update(line+'\n');batch.push(line);rows++;if(batch.length===500){await db.query(insert,['['+batch.join(',')+']']);batch=[];}}
   if(batch.length)await db.query(insert,['['+batch.join(',')+']']);await stream;
   if(rows!==table.rows||hash.digest('hex')!==table.sha256)throw Error('Backup row/hash verification failed: '+name);
   restored.push({name,rows,hash_verified:true});
  }
  for(const table of snapshot.tables)await db.exec('ALTER TABLE '+q(table.schema)+'.'+q(table.name)+' ENABLE TRIGGER ALL');
  // Recreate foreign keys so PostgreSQL validates every restored source row.
  for(const constraint of snapshot.constraints.filter(c=>c.type==='f')) {
   const table=q(constraint.schema)+'.'+q(constraint.table_name);
   await db.exec('ALTER TABLE '+table+' DROP CONSTRAINT '+q(constraint.name));
   await db.exec('ALTER TABLE '+table+' ADD CONSTRAINT '+q(constraint.name)+' '+constraint.definition);
  }
  for(const sequence of manifest.sequences)await db.query('SELECT setval($1::regclass,$2::bigint,$3::boolean)',[sequence.schema+'.'+sequence.name,sequence.last_value,sequence.is_called]);
  return {backup_id:manifest.id,tables:restored,rows:restored.reduce((n,t)=>n+t.rows,0),foreign_keys_validated:true,encrypted_hashes_verified:true};
 }finally{key.fill(0);}
}
