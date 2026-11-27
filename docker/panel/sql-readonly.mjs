// Conservative MCP query policy. This is paired with a READ ONLY transaction in
// the database driver; it is not a general SQL parser or a privilege boundary
// for the panel's separate administrative SQL console.
const denied=new Set(('INSERT UPDATE DELETE CREATE ALTER DROP TRUNCATE REPLACE MERGE GRANT REVOKE CALL DO EXEC EXECUTE COPY LOAD RENAME SET RESET VACUUM ANALYZE ANALYSE REFRESH COMMENT REINDEX INTO OUTFILE DUMPFILE LOCK UNLOCK SHARE PROCEDURE HANDLER INSTALL UNINSTALL KILL FLUSH OPTIMIZE REPAIR CHECKPOINT DISCARD LISTEN UNLISTEN NOTIFY PREPARE DEALLOCATE COMMIT ROLLBACK SAVEPOINT RELEASE BEGIN START USE').split(' '));
const functions=new Set(('ABS AVG COUNT SUM MIN MAX ROUND FLOOR CEIL CEILING MOD POWER SQRT SIGN EXP LN LOG LOG10 LENGTH CHAR_LENGTH CHARACTER_LENGTH OCTET_LENGTH BIT_LENGTH LOWER UPPER TRIM LTRIM RTRIM SUBSTR SUBSTRING LEFT RIGHT REPLACE CONCAT CONCAT_WS COALESCE NULLIF IF IFNULL GREATEST LEAST CAST CONVERT DATE TIME TIMESTAMP DATE_FORMAT EXTRACT TO_CHAR TO_DATE TO_TIMESTAMP NOW CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP LOCALTIME LOCALTIMESTAMP DATE_TRUNC DATE_PART AGE STRFTIME YEAR MONTH DAY HOUR MINUTE SECOND DATEDIFF TIMESTAMPDIFF TIMESTAMPADD ADDDATE SUBDATE DATE_ADD DATE_SUB STR_TO_DATE STRCMP LOCATE POSITION INSTR REVERSE REPEAT SPACE LPAD RPAD REGEXP_REPLACE REGEXP_SUBSTR REGEXP_MATCH REGEXP_MATCHES REGEXP_LIKE REPLACE SPLIT_PART STRING_AGG GROUP_CONCAT ARRAY_AGG JSON_AGG JSONB_AGG JSON_OBJECT JSON_ARRAY JSON_BUILD_OBJECT JSONB_BUILD_OBJECT JSON_EXTRACT JSON_UNQUOTE JSON_TYPE JSON_LENGTH JSON_VALID JSONB_TYPEOF JSON_TYPEOF JSON_ARRAY_LENGTH JSONB_ARRAY_LENGTH JSON_OBJECT_AGG JSONB_OBJECT_AGG ROW_NUMBER RANK DENSE_RANK NTILE LAG LEAD FIRST_VALUE LAST_VALUE NTH_VALUE PERCENT_RANK CUME_DIST BOOL_AND BOOL_OR EVERY STDDEV STDDEV_POP STDDEV_SAMP VARIANCE VAR_POP VAR_SAMP VERSION DATABASE SCHEMA USER CURRENT_USER SESSION_USER SYSTEM_USER CONNECTION_ID CURRENT_DATABASE CURRENT_SCHEMA CURRENT_SCHEMAS CURRENT_SETTING PG_BACKEND_PID PG_TYPEOF PG_SIZE_PRETTY PG_DATABASE_SIZE PG_RELATION_SIZE PG_TOTAL_RELATION_SIZE PG_TABLE_SIZE PG_INDEXES_SIZE PG_ENCODING_TO_CHAR PG_GET_USERBYID PG_GET_VIEWDEF PG_GET_INDEXDEF PG_GET_CONSTRAINTDEF TO_REGCLASS ENCODE DECODE MD5 SHA1 SHA2 HEX UNHEX ASCII CHR CHAR FORMAT FORMAT_TYPE NUMERIC DECIMAL VARCHAR CHAR VARYING BIT INTERVAL INT INTEGER BIGINT SMALLINT REAL DOUBLE FLOAT').split(' '));
const grouping=new Set(('SELECT WITH AS IN EXISTS NOT OVER FILTER DISTINCT ALL ANY SOME VALUES ROWS RANGE GROUPS EXPLAIN').split(' '));
const reject=()=>{throw Object.assign(new Error('SQL via MCP permite somente consultas: SELECT, SHOW, DESCRIBE e EXPLAIN de SELECT. Alterações, bloqueios, comandos de sessão e funções não autorizadas são proibidos.'),{status:400,code:'SQL_READ_ONLY'});};

function tokenize(sql,engine){
 const groups=[[]];let balance=0;
 const push=(word,kind='symbol')=>groups.at(-1).push({word,kind});
 for(let i=0;i<sql.length;){const c=sql[i],rest=sql.slice(i);
  if(/\s/.test(c)){i++;continue;}
  if(rest.startsWith('--')&&(engine==='postgres'||!sql[i+2]||/\s/.test(sql[i+2]))||c==='#'&&engine==='mariadb'){const end=sql.indexOf('\n',i);i=end<0?sql.length:end+1;continue;}
  if(rest.startsWith('/*')){if(/^\/\*(?:!|M!|\+)/i.test(rest))reject();let depth=1;i+=2;while(i<sql.length&&depth){if(sql.startsWith('/*',i)){if(engine==='mariadb')reject();depth++;i+=2;}else if(sql.startsWith('*/',i)){depth--;i+=2;}else i++;}if(depth)reject();continue;}
  const dollar=engine==='postgres'&&rest.match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);if(dollar){const end=sql.indexOf(dollar[0],i+dollar[0].length);if(end<0)reject();push('literal','literal');i=end+dollar[0].length;continue;}
  if(/["'`]/.test(c)){if(c==='`'&&engine==='postgres')reject();const quote=c;let closed=false;i++;while(i<sql.length){if(sql[i]==='\\')reject();if(sql[i++]===quote){if(sql[i]===quote)i++;else{closed=true;break;}}}if(!closed)reject();push('quoted',quote==="'"?'literal':'identifier');continue;}
  if(c===';'){if(balance)reject();if(groups.at(-1).length)groups.push([]);i++;continue;}
  if(c==='(')balance++;if(c===')'&&--balance<0)reject();
  if(c==='@'&&engine==='mariadb'||rest.startsWith(':=')||rest.match(/^U&["']/i))reject();
  const word=rest.match(/^[A-Za-z_][A-Za-z0-9_$]*/);if(word){push(word[0].toUpperCase(),'word');i+=word[0].length;continue;}
  const number=rest.match(/^\d+(?:\.\d+)?(?:e[+-]?\d+)?/i);if(number){push('number','literal');i+=number[0].length;continue;}
  if(c.charCodeAt(0)>127||c==='\\'||c==='$')reject();push(c);i++;
 }
 if(balance)reject();return groups.filter(group=>group.length);
}

export function validateReadOnlySQL(sql,engine,{batch=false}={}){
 if(!['mariadb','postgres'].includes(engine)||typeof sql!=='string'||!sql.trim()||Buffer.byteLength(sql)>65536||sql.includes('\0'))reject();
 const statements=tokenize(sql,engine);if(!statements.length||statements.length>20||!batch&&statements.length!==1)reject();
 for(const tokens of statements){const first=tokens[0]?.word;if(!['SELECT','WITH','SHOW','DESCRIBE','DESC','EXPLAIN'].includes(first))reject();
  if(first==='EXPLAIN'&&!tokens.some(token=>token.kind==='word'&&['SELECT','WITH'].includes(token.word)))reject();
  if(['DESCRIBE','DESC'].includes(first)&&engine!=='mariadb')reject();
  for(let i=0;i<tokens.length;i++){const token=tokens[i],word=token.word;
   if(token.kind==='word'&&denied.has(word)&&!(word==='CREATE'&&first==='SHOW'&&i===1&&['TABLE','VIEW'].includes(tokens[i+1]?.word))&&!(word==='REPLACE'&&tokens[i+1]?.word==='('))reject();
   if(tokens[i+1]?.word!=='('||!['word','identifier'].includes(token.kind))continue;
   if(token.kind==='identifier')reject();
   if(tokens[i-1]?.word==='.'){if(engine!=='postgres'||tokens[i-2]?.word!=='PG_CATALOG'||tokens[i-3]?.word==='.')reject();}
   if(!functions.has(word)&&!grouping.has(word))reject();
  }
 }
 return {readOnly:true,statementCount:statements.length};
}
