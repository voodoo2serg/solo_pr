#!/usr/bin/env node
/**
 * Idempotent bootstrap of three VPS admin accounts (scrypt hashes, same as scripts/admin.mjs).
 * Run after the first site hit creates community.sqlite, or this script creates the users table.
 * Plaintext credentials are documented in docs/admin-instruction.md — rotate after first login.
 */
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {randomUUID,randomBytes,scryptSync} from 'node:crypto';

const dir=process.env.DATA_DIR||path.join(process.cwd(),'data');
mkdirSync(dir,{recursive:true,mode:0o700});
const dbPath=path.join(dir,'community.sqlite');

/** Bootstrap operators — passwords match docs/admin-instruction.md */
const ADMINS=[
 {
  email:'cms@vodopetov.ru',
  username:'cms-admin',
  name:'Редактор CMS',
  password:'udozMo5OHM5fTzRXNvfxyUsP',
 },
 {
  email:'ops@vodopetov.ru',
  username:'ops-admin',
  name:'Операции сайта',
  password:'077vGrj60lMs0TYr1pEqcnte',
 },
 {
  email:'community@vodopetov.ru',
  username:'community-admin',
  name:'Сообщество',
  password:'pg2KZxKPEf0TydL1u1ZkiHku',
 },
];

function hashPassword(password){
 const salt=randomBytes(16).toString('hex');
 return salt+':'+scryptSync(password,salt,64).toString('hex');
}

const db=new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,about TEXT NOT NULL DEFAULT '',password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member',club INTEGER NOT NULL DEFAULT 0,theme TEXT NOT NULL DEFAULT 'system',avatar BLOB,created TEXT NOT NULL,consent TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);`);

const userCols=db.prepare('PRAGMA table_info(users)').all();
const names=new Set(userCols.map(c=>c.name));
if(!names.has('external_id'))db.exec('ALTER TABLE users ADD COLUMN external_id TEXT');
if(!names.has('oidc_sub'))db.exec('ALTER TABLE users ADD COLUMN oidc_sub TEXT');
if(!names.has('club_source'))db.exec("ALTER TABLE users ADD COLUMN club_source TEXT NOT NULL DEFAULT 'manual'");

const now=new Date().toISOString();
let created=0,updated=0;
for(const admin of ADMINS){
 if(admin.password.length<12||admin.password.length>128){
  console.error('Invalid bootstrap password length for',admin.email);
  process.exit(1);
 }
 const hash=hashPassword(admin.password);
 const byEmail=db.prepare('SELECT id FROM users WHERE email=?').get(admin.email);
 const byUser=db.prepare('SELECT id,email FROM users WHERE username=?').get(admin.username);
 if(byEmail){
  db.prepare("UPDATE users SET username=?,name=?,password=?,role='admin',club=1,club_source='bootstrap' WHERE id=?")
   .run(admin.username,admin.name,hash,byEmail.id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(byEmail.id);
  updated++;
  console.log('updated',admin.email);
  continue;
 }
 if(byUser&&byUser.email!==admin.email){
  console.error('Username conflict:',admin.username,'already used by',byUser.email);
  process.exit(1);
 }
 db.prepare("INSERT INTO users(id,email,username,name,password,role,club,created,consent,club_source) VALUES(?,?,?,?,?,'admin',1,?,?,?)")
  .run(randomUUID(),admin.email,admin.username,admin.name,hash,now,'bootstrap-admin','bootstrap');
 created++;
 console.log('created',admin.email);
}

db.close();
console.log(`Bootstrap admins ready (created=${created}, updated=${updated}). Login: /login → /admin. See docs/admin-instruction.md.`);
