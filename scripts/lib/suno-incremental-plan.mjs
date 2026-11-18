import {digest,schemaMigrationPlan} from './database-migration-safety.mjs';
/** Use file receipts, never a shared numeric prefix, to identify existing SQL. */
export function sunoIncrementalPlan(snapshot) {
 if(snapshot.project!=='cxgynadprukyeuqbchbs'||snapshot.contains_customer_rows!==false)throw Error('Verified Suno schema metadata required');
 const receipts=new Map();
 for(const row of [...(snapshot.filenames||[]),...(snapshot.workspace_files||[])])receipts.set(row.filename,[...(receipts.get(row.filename)||[]),row]);
 const skipped=[],pending=[];
 for(const item of schemaMigrationPlan()) {
  if(item.name==='001_initial_schema.sql') {skipped.push({name:item.name,reason:'Existing Suno baseline; never replay a generated installer over retained data'});continue;}
  const receipt=receipts.get(item.name);
  if(receipt) {
   if(receipt.some(row=>![item.sha256,...item.compatibleSha256].includes(row.sha256)))throw Error('Existing migration differs: '+item.name);
   skipped.push({name:item.name,reason:'Matching full filename and checksum'});continue;
  }
  pending.push(item);
 }
 return {schema_sha256:digest(JSON.stringify(snapshot)),skipped,pending};
}
