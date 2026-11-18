import fs from 'node:fs';
import path from 'node:path';
import {createDecipheriv,createHash} from 'node:crypto';
import {createGunzip} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {createInterface} from 'node:readline';
import {unprotectBackupKey} from './lib/private-backup-key.mjs';
const pointer=JSON.parse(fs.readFileSync('.private/latest-suno-backup.json','utf8'));
const manifest=JSON.parse(fs.readFileSync(pointer.manifest,'utf8'));
if(!manifest.complete||!manifest.encrypted||manifest.project!=='cxgynadprukyeuqbchbs')throw Error('Complete encrypted Suno backup required');
const key=unprotectBackupKey(fs.readFileSync(path.join(pointer.directory,'key.dpapi')));
let rows=0;
try{
 for(const table of manifest.tables){
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(table.iv,'hex'));
  decipher.setAAD(Buffer.from(manifest.project+'|'+table.schema+'.'+table.name));decipher.setAuthTag(Buffer.from(table.tag,'hex'));
  const output=createGunzip();
  const done=pipeline(fs.createReadStream(path.join(pointer.directory,table.file)),decipher,output);done.catch(()=>{});
  const lines=createInterface({input:output,crlfDelay:Infinity}),hash=createHash('sha256');let count=0;
  for await(const line of lines){JSON.parse(line);hash.update(line+'\n');count++;}
  await done;
  if(count!==table.rows||hash.digest('hex')!==table.sha256)throw Error('Backup verification failed for '+table.schema+'.'+table.name);
  rows+=count;
 }
 manifest.integrity_verified=true;manifest.integrity_verified_at=new Date().toISOString();
 fs.writeFileSync(pointer.manifest,JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({backup_id:manifest.id,encrypted_integrity_verified:true,tables:manifest.tables.length,rows,production_writes:0}));
}finally{key.fill(0);}
