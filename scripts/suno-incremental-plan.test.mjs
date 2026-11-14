import {expect,it} from 'vitest';
import {schemaMigrationPlan} from './lib/database-migration-safety.mjs';
import {sunoIncrementalPlan} from './lib/suno-incremental-plan.mjs';
const files=schemaMigrationPlan().filter(item=>item.name!=='001_initial_schema.sql');
const snapshot=()=>({project:'cxgynadprukyeuqbchbs',contains_customer_rows:false,filenames:[],workspace_files:[]});
it('recognizes its own completed workspace upgrade rather than replaying files',()=>{
 const source=snapshot();source.workspace_files=files.map(({name,sha256})=>({filename:name,sha256}));
 expect(sunoIncrementalPlan(source).pending).toEqual([]);
});
it('uses full filenames and hashes when two branches share a version prefix',()=>{
 const sameVersion=files.filter(item=>item.name.startsWith('202611030001_'));
 expect(sameVersion).toHaveLength(2);
 const source=snapshot();source.workspace_files=[{filename:sameVersion[0].name,sha256:sameVersion[0].sha256}];
 const plan=sunoIncrementalPlan(source);
 expect(plan.pending.some(item=>item.name===sameVersion[0].name)).toBe(false);
 expect(plan.pending.some(item=>item.name===sameVersion[1].name)).toBe(true);
});
it('rejects changed SQL even when another ledger has a matching entry',()=>{
 const source=snapshot(),item=files[0];source.filenames=[{filename:item.name,sha256:item.sha256}];source.workspace_files=[{filename:item.name,sha256:'0'.repeat(64)}];
 expect(()=>sunoIncrementalPlan(source)).toThrow('differs');
});
