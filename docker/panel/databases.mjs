import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite, parseEnv } from './core.mjs';
export const engines = ['mariadb', 'postgres'];
export function identifier(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,47}$/.test(value)) throw new Error('Use nome iniciado por letra minúscula, com até 48 caracteres: letras, números e sublinhado.');
  return value;
}
export function accountHost(value = '%') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.%:-]{1,253}$/.test(value)) throw new Error('Host de acesso inválido.');
  return value;
}
export const sqlLiteral = value => "'" + String(value).replace(/'/g, "''") + "'";
export const mariaIdentifier = name => '`' + identifier(name) + '`';
export const pgIdentifier = name => '"' + identifier(name) + '"';
export function protectAccount(engine, user, admin = 'infra_admin') {
  identifier(user);
  if (['root', 'postgres', 'mysql', 'mariadb_sys', admin].includes(user) || user.startsWith('pg_')) throw new Error('Conta administrativa ou de sistema protegida. Use as instruções de manutenção para essas contas.');
}
export function protectDatabase(name) {
  identifier(name);
  if (['mysql', 'information_schema', 'performance_schema', 'sys', 'postgres', 'template0', 'template1'].includes(name)) throw new Error('Banco de sistema protegido.');
}
export function passwordValue(value) {
  const password = value || randomBytes(24).toString('base64url');
  if (typeof password !== 'string' || password.length < 16 || password.length > 128 || /[\x00-\x1f\\]/.test(password)) throw new Error('Use uma senha entre 16 e 128 caracteres, sem controles ou barra invertida.');
  return password;
}
export function encryptPassword(secret, key) {
  if (!/^[a-f0-9]{64}$/i.test(key || '')) throw new Error('Configure PANEL_VAULT_KEY no .env com 64 caracteres hexadecimais.');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const content = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), content: content.toString('hex') };
}
export function decryptPassword(record, key) {
  if (!/^[a-f0-9]{64}$/i.test(key || '')) throw new Error('Chave do cofre ausente/inválida.');
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(record.iv, 'hex'));
  cipher.setAuthTag(Buffer.from(record.tag, 'hex'));
  return Buffer.concat([cipher.update(Buffer.from(record.content, 'hex')), cipher.final()]).toString('utf8');
}
export function createVault(root, readEnv) {
  const filename = path.join(root, '.panel-state/db-credentials.json');
  const read = async () => { try { return JSON.parse(await fs.readFile(filename, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; return {}; } };
  const keyFor = (engine, user, host) => `${engine}:${user}:${host}`;
  return {
    async has(engine, user, host) { return Object.hasOwn(await read(), keyFor(engine, user, host)); },
    async save(engine, user, host, password) {
      const records = await read(), key = parseEnv(await readEnv()).PANEL_VAULT_KEY;
      records[keyFor(engine, user, host)] = { ...encryptPassword(password, key), changedAt: new Date().toISOString() };
      await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
      await atomicWrite(filename, JSON.stringify(records));
    },
    async reveal(engine, user, host) {
      const record = (await read())[keyFor(engine, user, host)];
      if (!record) throw new Error('Senha desconhecida pelo painel. Defina uma nova para registrá-la no cofre.');
      return { password: decryptPassword(record, parseEnv(await readEnv()).PANEL_VAULT_KEY), changedAt: record.changedAt };
    },
  };
}
export const mariaInventorySQL = `SELECT JSON_OBJECT('kind','database','name',s.SCHEMA_NAME,'bytes',COALESCE(SUM(t.DATA_LENGTH+t.INDEX_LENGTH),0),'tables',COUNT(t.TABLE_NAME)) FROM information_schema.SCHEMATA s LEFT JOIN information_schema.TABLES t ON t.TABLE_SCHEMA=s.SCHEMA_NAME WHERE s.SCHEMA_NAME NOT IN ('mysql','information_schema','performance_schema','sys') GROUP BY s.SCHEMA_NAME;
SELECT JSON_OBJECT('kind','user','name',User,'host',Host,'locked',COALESCE(JSON_VALUE(Priv,'$.account_locked'),0),'admin',IF(User IN ('root','mysql','mariadb.sys') OR COALESCE(JSON_VALUE(Priv,'$.access'),0)>0,1,0)) FROM mysql.global_priv WHERE User<>'';
SELECT JSON_OBJECT('kind','grant','grantee',GRANTEE,'database',TABLE_SCHEMA,'privileges',GROUP_CONCAT(PRIVILEGE_TYPE ORDER BY PRIVILEGE_TYPE)) FROM information_schema.SCHEMA_PRIVILEGES GROUP BY GRANTEE,TABLE_SCHEMA;`;
export const pgInventorySQL = `SELECT json_build_object('kind','database','name',d.datname,'bytes',pg_database_size(d.oid),'owner',pg_get_userbyid(d.datdba),'connections',(SELECT count(*) FROM pg_stat_activity a WHERE a.datid=d.oid)) FROM pg_database d WHERE NOT d.datistemplate;
SELECT json_build_object('kind','user','name',rolname,'host','network','locked',NOT rolcanlogin,'admin',rolsuper) FROM pg_roles WHERE rolname NOT LIKE 'pg_%';
SELECT json_build_object('kind','grant','user',r.rolname,'database',d.datname,'privileges','CONNECT (efetivo)') FROM pg_roles r CROSS JOIN pg_database d WHERE NOT d.datistemplate AND r.rolname NOT LIKE 'pg_%' AND NOT r.rolsuper AND has_database_privilege(r.oid,d.oid,'CONNECT');`;
export function createDatabaseSQL(engine, database) {
  protectDatabase(database);
  return engine === 'mariadb' ? `CREATE DATABASE ${mariaIdentifier(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;` : `CREATE DATABASE ${pgIdentifier(database)};\nREVOKE ALL ON DATABASE ${pgIdentifier(database)} FROM PUBLIC;`;
}
export function createUserSQL(engine, user, host, password) {
  return engine === 'mariadb' ? `SET SESSION sql_mode='NO_BACKSLASH_ESCAPES'; CREATE USER ${sqlLiteral(user)}@${sqlLiteral(host)} IDENTIFIED BY ${sqlLiteral(password)};` : `SET standard_conforming_strings=on; CREATE ROLE ${pgIdentifier(user)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ${sqlLiteral(password)};`;
}
export function changePasswordSQL(engine, user, host, password) {
  return engine === 'mariadb' ? `SET SESSION sql_mode='NO_BACKSLASH_ESCAPES'; ALTER USER ${sqlLiteral(user)}@${sqlLiteral(host)} IDENTIFIED BY ${sqlLiteral(password)};` : `SET standard_conforming_strings=on; ALTER ROLE ${pgIdentifier(user)} PASSWORD ${sqlLiteral(password)};`;
}
export function lockSQL(engine, user, host, locked) {
  return engine === 'mariadb' ? `ALTER USER ${sqlLiteral(user)}@${sqlLiteral(host)} ACCOUNT ${locked ? 'LOCK' : 'UNLOCK'};` : `ALTER ROLE ${pgIdentifier(user)} ${locked ? 'NOLOGIN' : 'LOGIN'};`;
}
export function accessSQL(engine, user, host, database, permission, revoke = false) {
  protectDatabase(database);
  if (!['readonly', 'readwrite'].includes(permission)) throw new Error('Permissão inválida.');
  if (engine === 'mariadb') return revoke ? `REVOKE ALL PRIVILEGES ON ${mariaIdentifier(database)}.* FROM ${sqlLiteral(user)}@${sqlLiteral(host)};` : `GRANT ${permission === 'readonly' ? 'SELECT, SHOW VIEW' : 'SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, CREATE VIEW, SHOW VIEW, TRIGGER, EXECUTE'} ON ${mariaIdentifier(database)}.* TO ${sqlLiteral(user)}@${sqlLiteral(host)};`;
  const db = pgIdentifier(database), role = pgIdentifier(user);
  const connect = `\\connect ${db}\n`;
  if (revoke) return `REVOKE ALL PRIVILEGES ON DATABASE ${db} FROM ${role};\n${connect}REVOKE ALL ON SCHEMA public FROM ${role}; REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}; REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${role}; ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ${role}; ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${role};`;
  return `GRANT CONNECT ON DATABASE ${db} TO ${role};\n${connect}GRANT ${permission === 'readonly' ? 'USAGE' : 'USAGE, CREATE'} ON SCHEMA public TO ${role}; GRANT ${permission === 'readonly' ? 'SELECT' : 'SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER'} ON ALL TABLES IN SCHEMA public TO ${role}; GRANT ${permission === 'readonly' ? 'SELECT' : 'USAGE, SELECT, UPDATE'} ON ALL SEQUENCES IN SCHEMA public TO ${role}; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ${permission === 'readonly' ? 'SELECT' : 'SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER'} ON TABLES TO ${role}; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ${permission === 'readonly' ? 'SELECT' : 'USAGE, SELECT, UPDATE'} ON SEQUENCES TO ${role};`;
}
