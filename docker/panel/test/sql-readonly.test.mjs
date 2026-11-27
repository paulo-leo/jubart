import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReadOnlySQL} from '../sql-readonly.mjs';

test('MCP somente leitura: SELECT, CTE, metadados e plano de consulta',()=>{
 for(const engine of ['mariadb','postgres'])for(const sql of [
  'SELECT 1;',"SELECT 'DELETE; UPDATE CREATE' AS label",'SELECT COUNT(*), SUM(amount) FROM orders WHERE id IN (1,2)',
  'WITH q AS (SELECT id FROM orders) SELECT * FROM q','EXPLAIN SELECT * FROM orders',
  'SELECT lower(name), coalesce(email, name) FROM users ORDER BY id DESC',
  'SELECT ROW_NUMBER() OVER (ORDER BY id), CAST(id AS VARCHAR(50)) FROM users',
  '/* ordinary comment */ SELECT 1 -- safe\n',
 ])assert.equal(validateReadOnlySQL(sql,engine).readOnly,true,engine+': '+sql);
 for(const sql of ['SHOW DATABASES','SHOW TABLES','SHOW FULL COLUMNS FROM users','SHOW CREATE TABLE users','DESCRIBE users'])assert.equal(validateReadOnlySQL(sql,'mariadb').readOnly,true);
 for(const sql of ['SHOW transaction_read_only','SELECT pg_catalog.count(*) FROM pg_catalog.pg_class',"SELECT $$DELETE; CREATE$$ AS label",'SELECT 1 /* nested /* SELECT */ safe */'])assert.equal(validateReadOnlySQL(sql,'postgres').readOnly,true);
 assert.equal(validateReadOnlySQL('SELECT 1; SELECT 2;','postgres',{batch:true}).statementCount,2);
});

test('MCP somente leitura: bloqueia escritas e formas ocultas antes de qualquer execução',()=>{
 for(const engine of ['mariadb','postgres'])for(const sql of [
  'INSERT INTO users VALUES (1)','UPDATE users SET name=1','DELETE FROM users','CREATE TABLE x (id INT)','DROP TABLE users',
  'WITH changed AS (DELETE FROM users RETURNING *) SELECT * FROM changed','EXPLAIN DELETE FROM users','EXPLAIN ANALYZE SELECT 1',
  "SELECT * INTO copied_users FROM users","SELECT 'text' INTO OUTFILE '/tmp/output'",'SELECT * FROM users FOR UPDATE',
  'SELECT * FROM users FOR SHARE','SELECT * FROM users LOCK IN SHARE MODE','CALL routine()', 'SET transaction_read_only=off',
  "SELECT set_config('transaction_read_only','off',false)","SELECT nextval('sequence')","SELECT pg_notify('channel','message')",
  'SELECT pg_advisory_lock(1)','SELECT custom_writer()','SELECT app.lower(name) FROM users','SELECT "lower"(name) FROM users',
  'SELECT 1 /*! UNION SELECT custom_writer() */','SELECT 1 /*M! UNION SELECT custom_writer() */',
  'SELECT 1; DELETE FROM users;','SELECT 1; COMMIT; SELECT 2;', 'SELECT 1; START TRANSACTION READ WRITE;',
  'SELECT 1; CREATE TEMP TABLE tmp AS SELECT 1;',"SELECT 'unterminated",'SELECT (1','SELECT 1 /* unclosed',
  "SELECT 'a\\\' ; DELETE FROM users; --'",'SELECT 1\0', 'SELECT "custom_writer" /* comment */ ()',
 ])assert.throws(()=>validateReadOnlySQL(sql,engine,{batch:true}),error=>error.code==='SQL_READ_ONLY',engine+': '+sql);
 assert.throws(()=>validateReadOnlySQL('SELECT 1; SELECT 2','postgres'),/somente consultas/);
 for(const sql of ['SELECT @value := 1',"SELECT load_file('/etc/passwd')",'SELECT get_lock(1,1)','SELECT `lower`(name) FROM users','SELECT 1 /* nested /* */ UNION SELECT custom_writer() */'])assert.throws(()=>validateReadOnlySQL(sql,'mariadb'),/somente consultas/);
 assert.throws(()=>validateReadOnlySQL('SELECT '+Array(22).fill('1; SELECT').join(' ')+' 1','postgres',{batch:true}),/somente consultas/);
});
