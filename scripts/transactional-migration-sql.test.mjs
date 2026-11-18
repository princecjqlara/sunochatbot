import {expect,it} from 'vitest';
import {transactionalMigrationSql} from './lib/transactional-migration-sql.mjs';
it('removes transaction boundaries on shared lines while preserving function bodies and quoted data',()=>{
 const sql="BEGIN;CREATE TABLE example(value text);INSERT INTO example VALUES('COMMIT; it''s data');DO $block$ BEGIN RAISE NOTICE 'BEGIN; COMMIT;'; END $block$;COMMIT;";
 const result=transactionalMigrationSql(sql);
 expect(result).toContain("VALUES('COMMIT; it''s data')");expect(result).toContain("DO $block$ BEGIN RAISE NOTICE 'BEGIN; COMMIT;'; END $block$;");
 expect(result.match(/Outer transaction/g)).toHaveLength(2);
});
it('handles escaped strings, quoted identifiers, line comments and nested block comments',()=>{
 const sql=String.raw`-- BEGIN; is a comment
 BEGIN; /* outer /* COMMIT; */ nested */ CREATE TABLE "COMMIT;" (value text); INSERT INTO "COMMIT;" VALUES(E'quote\'; not a statement'); COMMIT;`;
 expect(transactionalMigrationSql(sql)).toContain('CREATE TABLE "COMMIT;"');
 expect(transactionalMigrationSql(sql).match(/Outer transaction/g)).toHaveLength(2);
});
it('refuses rollback commands and unterminated bodies instead of allowing partial installation',()=>{
 expect(()=>transactionalMigrationSql('BEGIN;ALTER TABLE a ADD COLUMN b text;ROLLBACK;')).toThrow('Unsupported');
 expect(()=>transactionalMigrationSql('DO $body$ BEGIN NULL;')).toThrow('Unterminated');
});
