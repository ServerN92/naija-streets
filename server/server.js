// Naija Streets live server: puts players in the same city so they see each other walk, drive, ride and chat.
// The city itself (people, traffic, weather) still runs in each player's browser; this server only passes on
// where every player is and what they are doing, ten times a second.
//
//   npm install && npm start          (listens on PORT, default 2567)
//
// Rooms: players fill "mushin-1" up to ROOM_CAP, then "mushin-2" opens, and so on, so a busy night stays smooth on phones.
import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = +process.env.PORT || 2567;
const ROOM_CAP = +process.env.ROOM_CAP || 40;          // players per city copy
const TICK_MS = 100;                                    // 10 updates a second
const VIEW = 400;                                       // you get updates for players within this many metres
const PROTO = 1;
// pages allowed to connect (add your own domain here if the game moves)
const ORIGINS = (process.env.ORIGINS || 'https://servern92.github.io,http://localhost,http://127.0.0.1').split(',').map(s => s.trim()).filter(Boolean);

const rooms = new Map();   // name -> {name, players: Map(id -> P)}
let nextId = 1;

const num = (v, lo, hi, d = 0) => { v = +v; return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const word = (v, max) => typeof v === 'string' ? v.replace(/[^\w-]/g, '').slice(0, max) : '';
const clean = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';
const r2 = v => Math.round(v * 100) / 100;

function roomFor() {
  for (const r of rooms.values()) if (r.players.size < ROOM_CAP) return r;
  const name = 'mushin-' + (rooms.size + 1); const r = { name, players: new Map() }; rooms.set(name, r); return r; }

function send(p, msg) { if (p.ws.readyState === 1 && p.ws.bufferedAmount < 256e3) p.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); }
function toRoom(r, msg, except) { const s = JSON.stringify(msg); for (const p of r.players.values()) if (p !== except && p.ready) send(p, s); }
const info = p => ({ id: p.id, n: p.name, g: p.g, l: p.look, o: p.fit });

// ---- shared rides: one player drives, others sit in the free seats
function dropPassengers(r, d, why) {
  if (!d.pass) return;
  for (const [, pid] of d.pass) { const q = r.players.get(pid); if (q && q.ride && q.ride.d === d.id) { q.ride = null; send(q, { t: 'off', why }); } }
  d.pass = null; }
function leaveRide(r, p) {
  if (!p.ride) return; const d = r.players.get(p.ride.d);
  if (d && d.pass) { d.pass.delete(p.ride.i); if (!d.pass.size) d.pass = null; }
  p.ride = null; }
function askRide(r, p, did) {
  const d = r.players.get(did), no = why => send(p, { t: 'ride', ok: false, why });
  if (!d || !d.ready || d === p) return no('gone');
  if (!d.s || !d.s.car) return no('walking');
  if (p.ride) leaveRide(r, p);
  if (Math.hypot(d.s.x - p.s.x, d.s.z - p.s.z) > 9) return no('far');
  if (Math.abs(d.s.car.s) > 3) return no('moving');
  const seats = d.s.car.n; if (!d.pass) d.pass = new Map();
  let free = -1; for (let i = 1; i < seats; i++) if (!d.pass.has(i)) { free = i; break; }
  if (free < 0) return no('full');
  d.pass.set(free, p.id); p.ride = { d: d.id, i: free };
  send(p, { t: 'ride', ok: true, d: d.id, i: free });
  send(d, { t: 'chat', id: 0, n: '', x: `${p.name} don enter your ${d.s.car.k}` }); }

// ---- one player's state, checked: positions in the city, known moves only
function readState(p, m) {
  const s = { x: r2(num(m.x, -6000, 6000)), y: r2(num(m.y, -50, 300)), z: r2(num(m.z, -6000, 6000)), r: r2(num(m.r, -10, 10)), s: r2(num(m.s, -80, 80)),
    m: ['w', 'd', 'e', 'i'].includes(m.m) ? m.m : 'w', a: word(m.a, 24), c: m.c ? 1 : 0, car: null };
  if (m.car && typeof m.car === 'object' && s.m === 'd' && !p.ride) {
    s.car = { k: word(m.car.k, 12) || 'sedan', h: r2(num(m.car.h, -50, 50)), s: r2(num(m.car.s, -80, 80)), n: num(m.car.n, 1, 9, 1) | 0, col: /^#[0-9a-f]{6}$/i.test(m.car.col) ? m.car.col : '' }; }
  return s; }

function onMessage(p, raw) {
  let m; try { m = JSON.parse(raw); } catch { return; } if (!m || typeof m !== 'object') return;
  const r = p.room, now = Date.now();
  if (m.t === 'hi') {
    if (p.ready) return;
    if (m.v !== PROTO) { send(p, { t: 'old' }); p.ws.close(4000, 'update the game'); return; }
    p.name = clean(m.n, 16) || 'Guest'; p.g = m.g === 'f' ? 'f' : 'm'; p.look = word(m.l, 32); p.fit = num(m.o, 0, 3) | 0;
    p.s = readState(p, m.s || {}); p.ready = true;
    send(p, { t: 'w', id: p.id, room: r.name, players: [...r.players.values()].filter(q => q !== p && q.ready).map(info) });
    toRoom(r, { t: 'j', p: info(p) }, p); console.log(`+ ${p.name} (${p.id}) in ${r.name}: ${r.players.size}`); return; }
  if (!p.ready) return;
  if (m.t === 's') {   // state, up to 15 a second
    if (now - p.lastS < 60) return; p.lastS = now;
    const hadCar = p.s && p.s.car; p.s = readState(p, m);
    if (hadCar && !p.s.car) dropPassengers(r, p, 'out');
    if (p.ride) { const d = r.players.get(p.ride.d); if (!d || !d.s.car) { p.ride = null; send(p, { t: 'off', why: 'out' }); } }
    return; }
  if (m.t === 'c') {   // chat: one line every 1.2 s
    const x = clean(m.x, 140); if (!x || now - p.lastC < 1200) return; p.lastC = now;
    toRoom(r, { t: 'chat', id: p.id, n: p.name, x }); return; }
  if (m.t === 'look') { p.look = word(m.l, 32); p.fit = num(m.o, 0, 3) | 0; toRoom(r, { t: 'look', id: p.id, l: p.look, o: p.fit }, p); return; }
  if (m.t === 'ride') { askRide(r, p, num(m.d, 0, 1e9) | 0); return; }
  if (m.t === 'off') { leaveRide(r, p); return; }
}

function onClose(p) {
  const r = p.room; if (!r.players.has(p.id)) return; leaveRide(r, p); dropPassengers(r, p, 'gone'); r.players.delete(p.id);
  if (p.ready) { toRoom(r, { t: 'q', id: p.id }); console.log(`- ${p.name} (${p.id}) from ${r.name}: ${r.players.size}`); }
  if (!r.players.size && rooms.size > 1) rooms.delete(r.name); }

// ten times a second each player hears about the players near them
setInterval(() => {
  for (const r of rooms.values()) {
    const list = [...r.players.values()].filter(p => p.ready && p.s);
    for (const p of list) {
      const out = [];
      for (const q of list) { if (q === p) continue; const s = q.s, near = Math.abs(s.x - p.s.x) < VIEW && Math.abs(s.z - p.s.z) < VIEW;
        if (!near && !(p.ride && p.ride.d === q.id) && !(q.ride && q.ride.d === p.id)) continue;
        out.push([q.id, s.x, s.y, s.z, s.r, s.s, s.m, s.a, s.c, s.car, q.ride ? [q.ride.d, q.ride.i] : 0]); }
      send(p, { t: 'u', l: out }); } } }, TICK_MS);

// keep connections alive through phone networks; drop the ones that went quiet
setInterval(() => { for (const r of rooms.values()) for (const p of r.players.values()) { if (!p.alive) { p.ws.terminate(); continue; } p.alive = false; try { p.ws.ping(); } catch {} } }, 15000);

const server = http.createServer((req, res) => {
  const n = [...rooms.values()].reduce((a, r) => a + r.players.size, 0);
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify({ ok: true, players: n, rooms: [...rooms.values()].map(r => ({ name: r.name, players: r.players.size })) })); });
const wss = new WebSocketServer({ server, maxPayload: 4096,
  verifyClient: ({ origin }) => !origin || ORIGINS.some(o => origin === o || origin.startsWith(o + ':')) });
wss.on('connection', ws => {
  const room = roomFor(), p = { id: nextId++, ws, room, ready: false, alive: true, lastS: 0, lastC: 0, s: null, ride: null, pass: null };
  room.players.set(p.id, p);
  ws.on('pong', () => { p.alive = true; });
  ws.on('message', (d, bin) => { if (!bin) onMessage(p, d.toString()); });
  ws.on('close', () => onClose(p)); ws.on('error', () => {}); });
server.listen(PORT, () => console.log(`Naija Streets server on :${PORT}, ${ROOM_CAP} players a room`));
