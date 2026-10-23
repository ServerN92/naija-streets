// Naija Streets game server: one small Node program (no npm packages), a WebSocket at /ws and an SQLite file.
//   PORT (8080), DB_PATH (/data/naija.db), ORIGINS (pages allowed to connect, comma separated),
//   TRUST_PROXY=1 behind Fly (the player's address comes from Fly-Client-IP), RESEND_API_KEY + MAIL_FROM for reset emails.
import http from 'node:http';
import path from 'node:path';
import { accept } from './ws.js';
import { openDb } from './db.js';
import { createWorld, PROTO } from './world.js';
import { createMail } from './mail.js';
import { tune } from './park.js';
import { tunePvp } from './pvp.js';
import { tuneLove } from './love.js';
import { YH } from './yahoo.js';
import { tunePol } from './politics.js';
import { createAdmin } from './admin.js';

const PORT = +process.env.PORT || 8080;
const DB_PATH = process.env.DB_PATH || './data/naija.db';
const ORIGINS = (process.env.ORIGINS || 'https://servern92.github.io').split(',').map(s => s.trim()).filter(Boolean);
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const MAX_CONNS = +process.env.MAX_CONNS || 2000, MAX_PER_IP = +process.env.MAX_PER_IP || 64;   // phone networks put many players behind one address

const log = (...a) => console.log(new Date().toISOString(), ...a);
const db = openDb(DB_PATH);
const mail = createMail({ key: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM, devLog: process.env.MAIL_DEV_LOG === '1' });
if (process.env.LOVE_TEST === '1') tuneLove(process.env);
if (process.env.YAHOO_BAIL) YH.bail = +process.env.YAHOO_BAIL;   // (tests)
if (process.env.POL_TEST === '1') tunePol(process.env);
if (process.env.PARK_TEST === '1') { tune(process.env); tunePvp(process.env); console.log('park test settings', process.env.PARK_EVERY_MS, process.env.PARK_RANKS); }
const world = createWorld({ db, mail, log, regPerHour: +process.env.REG_PER_HOUR || 20 });
const perIp = new Map();
const admin = createAdmin({ db, world, token: process.env.ADMIN_TOKEN, log });
if (!process.env.ADMIN_TOKEN) log('no ADMIN_TOKEN secret: /admin is off');

function ipOf(req) {
  if (TRUST_PROXY) { const f = req.headers['fly-client-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(); if (f) return f; }
  return req.socket.remoteAddress || '?';
}
function originOk(o) { return !o || ORIGINS.includes(o) || LOCAL.test(o) || ORIGINS.includes('*'); }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/admin') && admin.handle(req, res, url, ipOf(req))) return;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
  if (url.pathname === '/health') { res.writeHead(200, { ...cors, 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (url.pathname === '/stats') { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ online: world.online, proto: PROTO })); }
  if (url.pathname === '/') { res.writeHead(200, { ...cors, 'Content-Type': 'text/plain' }); return res.end('Naija Streets game server. Players connect at /ws.'); }
  res.writeHead(404, cors); res.end();
});
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/ws') { socket.end('HTTP/1.1 404 Not Found\r\n\r\n'); return; }
  if (!originOk(req.headers.origin)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
  const ip = ipOf(req), n = perIp.get(ip) || 0;
  if (world.conns >= MAX_CONNS || n >= MAX_PER_IP) { socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n'); return; }
  const ws = accept(req, socket, head, { maxMsg: 32768 });   // a life record with your furniture can pass 4 KB
  if (!ws) return;
  perIp.set(ip, n + 1);
  ws.on('close', () => { const k = (perIp.get(ip) || 1) - 1; if (k > 0) perIp.set(ip, k); else perIp.delete(ip); });
  world.join(ws, ip);
});
server.on('clientError', (e, socket) => { try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch (_) { /* gone */ } });

world.start();
// a clean copy of the database every day (kept a week) next to it, on top of Fly's own volume snapshots
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), 'backups');
function backup() { try { const f = db.backup(BACKUP_DIR); if (f) log('backup', f); } catch (e) { log('backup failed', e && e.message); } }
if (DB_PATH !== ':memory:') { setTimeout(backup, 60e3).unref(); setInterval(backup, 24 * 3600e3).unref(); }
server.listen(PORT, () => log(`listening on ${PORT}; db ${DB_PATH}; ${db.users()} accounts; email reset ${mail.on ? 'on' : 'off'}`));

let stopping = false;
function stop(sig) {
  if (stopping) return; stopping = true; log('stopping on', sig);
  world.stop(); server.close();
  setTimeout(() => { try { db.close(); } catch (e) { /* already closed */ } process.exit(0); }, 600);
}
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
