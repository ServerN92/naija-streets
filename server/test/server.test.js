// End to end: start the real server on a spare port with a fresh database, then talk to it like the game does.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

let proc, port, dir; const codes = {};
const PROTO = 1;

function freePort() { return new Promise(r => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); }); }
before(async () => {
  port = await freePort(); dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-'));
  proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/main.js'], { cwd: path.join(import.meta.dirname, '..'), env: { ...process.env, PORT: String(port), DB_PATH: path.join(dir, 't.db'), REG_PER_HOUR: '100', MAIL_DEV_LOG: '1', PARK_TEST: '1', PVP_FRESH_MS: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => { proc.stdout.on('data', d => { const t = String(d); for (const m of t.matchAll(/MAILCODE (\S+) (\d{6})/g)) codes[m[1]] = m[2]; if (/listening/.test(t)) res(); }); proc.on('exit', c => rej(new Error('server exited ' + c))); });
});
after(() => { proc.kill('SIGTERM'); });

function client() {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`), got = [], waits = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); got.push(m); for (const w of waits.slice()) if (w.f(m)) { waits.splice(waits.indexOf(w), 1); w.r(m); } };
  const c = {
    ws, got,
    open: new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }),
    send: o => ws.send(JSON.stringify(o)),
    next(f, ms = 3000) {
      const what = String(f).slice(0, 80);
      if (typeof f === 'string') { const t = f; f = m => m.t === t; }
      const have = got.find(f); if (have) { got.splice(got.indexOf(have), 1); return Promise.resolve(have); }
      return new Promise((r, j) => { const w = { f: m => { if (f(m)) { got.splice(got.indexOf(m), 1); return true; } return false; }, r }; waits.push(w); setTimeout(() => j(new Error('no message in time: ' + what + ' got ' + JSON.stringify(got).slice(0, 300))), ms); });
    },
    close: () => ws.close(),
  };
  return c;
}
async function account(name, pass = 'secret77', extra = {}) {
  const c = client(); await c.open; c.send({ t: 'hi', v: PROTO }); await c.next('guest');
  c.send({ t: 'reg', u: name, p: pass, ...extra }); const me = await c.next(m => m.t === 'me' || m.t === 'err');
  if (me.t === 'me' && me.cash && !extra.life) { c.send({ t: '$', d: -me.cash, s: 0 }); await c.next('$'); }   // the tests count from nothing (a new life starts with ₦1,000)
  return [c, me];
}

test('health', async () => {
  const r = await fetch(`http://127.0.0.1:${port}/health`); assert.equal(await r.text(), 'ok');
});

test('make an account, bad names and passwords refused, sign in again with the token and with the password', async () => {
  const c = client(); await c.open; c.send({ t: 'hi', v: PROTO }); await c.next('guest');
  for (const [u, p] of [['ab', 'secret77'], ['has space', 'secret77'], ['admin', 'secret77'], ['Tunde_1', '123'], ['Tunde_1', 'password'], ['Tunde_1', 'tunde_1']]) {
    c.send({ t: 'reg', u, p }); const e = await c.next('err'); assert.equal(e.w, 'reg', u + ' ' + p);
  }
  c.send({ t: 'reg', u: 'Tunde_1', p: 'mushin2026', e: 'Tunde@Example.com', cash: 999999, look: { c: 'p_dayo', f: 2, g: 'm' }, life: { home: 'room', rent: 3600, rented: 1, own: ['rags', 'polo'] } });
  const me = await c.next('me');
  assert.equal(me.name, 'Tunde_1'); assert.equal(me.cash, 50000, 'guest money is capped'); assert.equal(me.life.home, 'room'); assert.deepEqual(me.life.own, ['rags', 'polo']); assert.equal(me.email, 'tu***@example.com'); assert.ok(me.tok.length > 30);
  c.close();
  // the same name in other letters is taken
  const [d, e] = await account('tunde_1'); assert.equal(e.t, 'err'); assert.match(e.m, /taken/); d.close();
  // back with the token
  const t = client(); await t.open; t.send({ t: 'hi', v: PROTO, tok: me.tok }); const me2 = await t.next('me'); assert.equal(me2.name, 'Tunde_1'); assert.equal(me2.cash, 50000); assert.deepEqual(me2.look, { c: 'p_dayo', f: 2, g: 'm', k: -1 });
  // signing in again elsewhere kicks the first one
  const w = client(); await w.open; w.send({ t: 'login', u: 'TUNDE_1', p: 'wrong-one' }); assert.equal((await w.next('err')).m, 'Wrong username or password.');
  w.send({ t: 'login', u: 'TUNDE_1', p: 'mushin2026' }); const wm = await w.next('me'); assert.equal(wm.name, 'Tunde_1');
  assert.equal((await t.next('kick')).t, 'kick');
  // sign out: that phone's token stops working (the other phone's still works)
  w.send({ t: 'out' }); await w.next('out');
  const z = client(); await z.open; z.send({ t: 'hi', v: PROTO, tok: wm.tok }); await z.next('guest');
  z.send({ t: 'hi', v: PROTO, tok: me.tok }); await z.next('me');
  for (const x of [t, w, z]) x.close();
});

test('old game version is told to reload', async () => {
  const c = client(); await c.open; c.send({ t: 'hi', v: 0 }); assert.equal((await c.next('old')).t, 'old'); c.close();
});

test('two players near each other see each other move, far ones do not; chat near and to all', async () => {
  const [a] = await account('Amaka'), [b] = await account('Bayo'), [f] = await account('Farfar');
  a.send({ t: 'look', c: 'p_amaka', f: 1, g: 'f', k: 5 });
  a.send({ t: 'p', x: 10, y: 0, z: 10, r: 1.5, a: 'w', s: 1.6, v: '', q: 0 });
  b.send({ t: 'p', x: 30, y: 0, z: 20, r: 0, a: 'i', s: 0, v: '', q: 0 });
  f.send({ t: 'p', x: 2000, y: 0, z: 2000, r: 0, a: 'i', s: 0, v: '', q: 0 });
  const w = await b.next(m => m.t === 'w' && m.j && m.j.some(j => j.n === 'Amaka'));
  const ja = w.j.find(j => j.n === 'Amaka'); assert.equal(ja.c, 'p_amaka'); assert.equal(ja.g, 'f'); assert.equal(ja.k, 5);   // her skin tone too
  const st = w.p.find(p => p[0] === ja.i); assert.deepEqual(st.slice(1, 8), [10, 0, 10, 1.5, 'w', 1.6, '']);
  // she drives off in a car
  a.send({ t: 'p', x: 12.345, y: 0.2, z: 11, r: 2, a: 'd', s: 8, v: 'sedan', vc: '#c0102c', q: 1 });
  const w2 = await b.next(m => m.t === 'w' && m.p && m.p.some(p => p[0] === ja.i && p[7] === 'sedan'));
  assert.equal(w2.p.find(p => p[0] === ja.i)[8], '#c0102c');
  // nobody far sees them
  await new Promise(r => setTimeout(r, 300));
  assert.ok(!f.got.some(m => m.t === 'w' && m.j), 'far player saw someone');
  // near chat reaches Bayo, not Farfar; all-Lagos chat reaches everyone; links are cut
  a.send({ t: 'say', m: 'How far, Bayo! see www.scam.com', ch: 'n' });
  const s = await b.next('say'); assert.equal(s.n, 'Amaka'); assert.equal(s.m, 'How far, Bayo! see ***');
  a.send({ t: 'say', m: 'Who dey Mushin?', ch: 'a' });
  assert.equal((await f.next(m => m.t === 'say' && m.ch === 'a')).m, 'Who dey Mushin?');
  assert.ok(!f.got.some(m => m.t === 'say' && m.ch === 'n'));
  // she goes inside a house: hidden, and Bayo is told she left
  a.send({ t: 'p', h: 1 });
  const l = await b.next(m => m.t === 'w' && m.l && m.l.includes(ja.i)); assert.ok(l);
  for (const x of [a, b, f]) x.close();
});

test('money: spending works, earning is capped by time, the server number is the real one', async () => {
  const [c, me] = await account('Cash_Man'); assert.equal(me.cash, 1000, 'a new life starts with ₦1,000'); assert.equal(me.life, null);
  c.send({ t: '$', d: -1000, s: 0 }); assert.equal((await c.next('$')).n, 0);
  c.send({ t: '$', d: 5000, s: 1 }); assert.deepEqual(await c.next('$'), { t: '$', n: 5000, s: 1 });
  c.send({ t: '$', d: -7000, s: 2 }); assert.equal((await c.next('$')).n, 0, 'never below zero');
  c.send({ t: '$', d: 4000000, s: 3 }); const big = await c.next('$'); assert.ok(big.n <= 250100 && big.n >= 245000, 'held at the cap: ' + big.n);
  c.send({ t: '$', d: 1000, s: 4, e: 'page1' }); const n4 = (await c.next('$')).n;
  c.send({ t: '$', d: 1000, s: 4, e: 'page1' }); assert.equal((await c.next('$')).n, n4, 'the same message twice counts once');
  c.send({ t: '$', d: 1.5, s: 5 }); c.send({ t: '$', d: 'lots', s: 6 });
  await new Promise(r => setTimeout(r, 200)); assert.ok(!c.got.some(m => m.t === '$'), 'bad amounts are ignored');
  c.close();
  // it is saved: sign in with the password
  const d = client(); await d.open; d.send({ t: 'login', u: 'cash_man', p: 'secret77' }); const me2 = await d.next('me');
  assert.equal(me2.cash, n4); d.close();
});

test('money: a big spend (an estate house, a whole estate) counts; a big gain does not', async () => {
  const [c] = await account('Big_Spender');
  c.send({ t: '$', d: 200000, s: 1 }); const n1 = (await c.next('$')).n; assert.ok(n1 > 0);
  c.send({ t: '$', d: -30000000, s: 2 }); assert.equal((await c.next('$')).n, 0, 'a ₦30M house takes all of it');
  c.send({ t: '$', d: -2500000000, s: 3 }); assert.equal((await c.next('$')).n, 0, 'a whole estate is not refused');
  c.send({ t: '$', d: 6000000, s: 4 }); c.send({ t: '$', d: -2e10, s: 5 });
  await new Promise(r => setTimeout(r, 200)); assert.ok(!c.got.some(m => m.t === '$'), 'out of range is ignored');
  c.close();
});

test('chat flood is slowed down; broken messages are ignored', async () => {
  const [c] = await account('Talker'); c.send({ t: 'p', x: 0, y: 0, z: 0, r: 0, a: 'i', s: 0, v: '', q: 0 });
  c.ws.send('not json'); c.ws.send('{"t":5}'); c.send({ t: 'p', x: 'a' }); c.send({ t: 'p', x: 1e9, y: 0, z: 0, r: 0, s: 0 });
  for (let i = 0; i < 8; i++) c.send({ t: 'say', m: 'spam ' + i, ch: 'n' });
  const e = await c.next('err'); assert.equal(e.w, 'say');
  const said = c.got.filter(m => m.t === 'say').length; assert.ok(said <= 4, 'said ' + said);
  c.close();
});

test('login guessing is stopped', async () => {
  const [a] = await account('Guessme'); a.close();
  const c = client(); await c.open; let stopped = false;
  for (let i = 0; i < 10 && !stopped; i++) { c.send({ t: 'login', u: 'guessme', p: 'nope' + i }); const e = await c.next('err'); if (/Too many/.test(e.m)) stopped = true; }
  assert.ok(stopped); c.close();
});

test('password change signs other phones out; reset says email is off when not set up', async () => {
  const [a, me] = await account('Changer', 'firstpass');
  a.send({ t: 'pw', old: 'bad', p: 'secondpass' }); assert.equal((await a.next('err')).w, 'pw');
  a.send({ t: 'pw', old: 'firstpass', p: 'secondpass' }); const tk = await a.next('tok'); assert.ok(tk.tok);
  const old = client(); await old.open; old.send({ t: 'hi', v: PROTO, tok: me.tok }); await old.next('guest');
  const nw = client(); await nw.open; nw.send({ t: 'hi', v: PROTO, tok: tk.tok }); assert.equal((await nw.next('me')).name, 'Changer');
  assert.equal((await a.next('kick')).t, 'kick');   // the new phone took over
  nw.send({ t: 'email', e: 'not-an-email' }); assert.equal((await nw.next('err')).w, 'email');
  nw.send({ t: 'email', e: 'changer@mail.ng' }); assert.equal((await nw.next('email')).email, 'ch*****@mail.ng');
  for (const x of [a, old, nw]) x.close();
});

test('a big message closes the line', async () => {
  const c = client(); await c.open; const closed = new Promise(r => { c.ws.onclose = e => r(e.code); });
  c.ws.send(JSON.stringify({ t: 'say', m: 'x'.repeat(10000) })); assert.equal(await closed, 1009);
});

test('forgot password: a code by email sets a new one; wrong codes run out', async () => {
  const [a] = await account('Forgetful', 'longlost1', { e: 'f@mail.ng' }); a.close();
  const [b] = await account('NoMail', 'longlost1'); b.close();
  const c = client(); await c.open;
  c.send({ t: 'forgot', u: 'nomail' }); await c.next('ok');
  c.send({ t: 'forgot', u: 'forgetful' }); await c.next('ok');
  await new Promise(r => setTimeout(r, 200)); assert.ok(codes.Forgetful && !codes.NoMail);
  c.send({ t: 'reset', u: 'forgetful', code: '000000', p: 'newpass22' }); assert.equal((await c.next('err')).w, 'reset');
  c.send({ t: 'reset', u: 'forgetful', code: codes.Forgetful, p: 'newpass22' }); assert.equal((await c.next('me')).name, 'Forgetful');
  c.send({ t: 'reset', u: 'forgetful', code: codes.Forgetful, p: 'again3333' }); assert.equal((await c.next('err')).w, 'reset', 'a code works once');
  c.close();
  const d = client(); await d.open; d.send({ t: 'login', u: 'forgetful', p: 'newpass22' }); assert.equal((await d.next('me')).name, 'Forgetful'); d.close();
});

test('a buka over the line: the boards come at sign-in, buying takes the money, the owner sees the till', async () => {
  const [o, me] = await account('Iya_Buka');
  const bz = await o.next(m => m.t === 'bz' && m.all); assert.equal(bz.s.length, 20); assert.equal(bz.rules.price, 100000);
  o.send({ t: 'bz', a: 'buy', id: 'buka_5' }); assert.match((await o.next('err')).m, /enough money/);
  o.send({ t: '$', d: 200000, s: 1, e: 'pg' }); await o.next('$');
  o.send({ t: 'bz', a: 'buy', id: 'buka_5' }); assert.equal((await o.next('$')).n, 100000); await o.next('ok');
  o.send({ t: 'bz', a: 'cook', id: 'buka_5', k: 'jollof', n: 20 }); assert.equal((await o.next('$')).n, 100000 - 12000);
  const d = await o.next(m => m.t === 'bzd' && m.b.st.jollof === 20, 8000); assert.equal(d.b.n, "Iya_Buka's Buka");
  const [e] = await account('Hungry_Man');
  const pub = await e.next(m => m.t === 'bz' && m.all); assert.equal(pub.s.find(x => x.id === 'buka_5').o, 'Iya_Buka');
  e.send({ t: 'bz', a: 'eat', id: 'buka_5', k: 'jollof' }); assert.match((await e.next('err')).m, /closed/);
  o.send({ t: 'bz', a: 'here', id: 'buka_5' }); await new Promise(r => setTimeout(r, 100));
  e.send({ t: '$', d: 3000, s: 1, e: 'pg2' }); await e.next('$');
  e.send({ t: 'bz', a: 'eat', id: 'buka_5', k: 'jollof' }); assert.equal((await e.next('bzate')).k, 'jollof');
  const till = await o.next(m => m.t === 'bzd' && m.b.till === 1500, 8000); assert.equal(till.b.today.sold, 1);
  e.send({ t: 'bz', a: 'cook', id: 'buka_5', k: 'jollof', n: 5 }); assert.match((await e.next('err')).m, /not your/);
  o.close(); e.close();
});

test('the motor park over the line: the board at sign-in, join in the yard, a danfo loads, collect the ticket, the badge shows', async () => {
  const [o] = await account('Agbero_One');
  const pk = await o.next('pk'); assert.equal(pk.p.ch, 'Chairman Kasali'); assert.equal(pk.rules.join, 5000); assert.ok(pk.p.next > 0);
  assert.equal((await o.next('pkme')).m.on, false);
  o.send({ t: 'pk', a: 'join' }); assert.match((await o.next(m => m.t === 'err' && m.w === 'pk')).m, /union office/);
  o.send({ t: '$', d: 20000, s: 1, e: 'pk1' }); await o.next('$');
  o.send({ t: 'p', x: 1010, y: 0, z: -513, r: 0, a: 'i', s: 0, v: '', q: 0 }); await new Promise(r => setTimeout(r, 200));
  o.send({ t: 'pk', a: 'join' }); assert.equal((await o.next('$')).n, 15000); assert.equal((await o.next('pkme')).m.on, true);
  const [w] = await account('Watcher');
  w.send({ t: 'p', x: 1012, y: 0, z: -512, r: 0, a: 'i', s: 0, v: '', q: 0 });
  const j = await w.next(m => m.t === 'w' && m.j && m.j.some(x => x.n === 'Agbero_One')); assert.equal(j.j.find(x => x.n === 'Agbero_One').b, 'a');
  const d = await o.next(m => m.t === 'pkd' && m.l.some(x => !x[4]), 9000), L = d.l.find(x => !x[4]);
  const bays = [[986.51, -511.04], [993.64, -513.87], [1000.76, -516.7], [1007.89, -519.53], [1015.02, -522.36], [1022.14, -525.19], [1029.27, -528.02]];
  o.send({ t: 'p', x: bays[L[1]][0] + 1, y: 0, z: bays[L[1]][1], r: 0, a: 'i', s: 0, v: '', q: 0 }); await new Promise(r => setTimeout(r, 200));
  o.send({ t: 'pk', a: 'ticket', id: L[0] }); const tk = await o.next('pkt'); assert.equal(tk.got, 150);
  assert.equal((await o.next('$')).n, 15150);
  const seen = await w.next(m => m.t === 'pkd' && m.l.some(x => x[0] === L[0] && x[4] === 'Agbero_One'), 4000); assert.ok(seen);
  o.close(); w.close();
});

test('players fight over the line: a blow in reach lands and the other is told; far ones do not; a knock-out takes from the pocket', async () => {
  const [a] = await account('Fighter_A'), [b, bme] = await account('Fighter_B');
  b.send({ t: '$', d: 10000, s: 1, e: 'pv1' }); await b.next('$');
  a.send({ t: 'p', x: 50, y: 0, z: 50, r: 0, a: 'i', s: 0, v: '', q: 0 }); b.send({ t: 'p', x: 50, y: 0, z: 51.2, r: Math.PI, a: 'i', s: 0, v: '', q: 0 });
  await new Promise(r => setTimeout(r, 250));
  a.send({ t: 'hit', i: bme.id, k: 'jab' }); const h = await b.next('hurt'); assert.equal(h.n, 'Fighter_A'); assert.ok(h.d >= 8 && h.d <= 10);
  assert.equal((await a.next('hitok')).i, bme.id);
  b.send({ t: 'p', x: 50, y: 0, z: 60, r: Math.PI, a: 'i', s: 0, v: '', q: 0 }); await new Promise(r => setTimeout(r, 250));
  a.send({ t: 'hit', i: bme.id, k: 'kick' }); await new Promise(r => setTimeout(r, 300)); assert.ok(!b.got.some(m => m.t === 'hurt'), 'too far');
  b.send({ t: 'p', x: 50, y: 0, z: 51.2, r: Math.PI, a: 'i', s: 0, v: '', q: 0 }); await new Promise(r => setTimeout(r, 250));
  for (let i = 0; i < 12 && !b.got.some(m => m.t === 'pko'); i++) { a.send({ t: 'hit', i: bme.id, k: 'heavy' }); await new Promise(r => setTimeout(r, 300)); }
  const ko = await b.next('pko'); assert.equal(ko.took, 1000); assert.equal((await a.next('pkowin')).took, 1000);
  a.close(); b.close();
});

test('the police over the line: join, go on duty, the wanted list comes with the stars a player carries', async () => {
  const [c, cme] = await account('Officer_Ojo'), [r, rme] = await account('Robber_Tee');
  assert.equal((await c.next('lawme')).m.cop, false);
  c.send({ t: 'law', a: 'join' }); await c.next(m => m.t === 'lawme' && m.m.cop);
  c.send({ t: 'law', a: 'duty', on: true }); await c.next(m => m.t === 'lawme' && m.m.duty);
  r.send({ t: 'p', x: 100, y: 0, z: 100, r: 0, a: 'i', s: 0, v: '', q: 0 }); c.send({ t: 'p', x: 105, y: 0, z: 100, r: 0, a: 'i', s: 0, v: '', q: 0 });
  r.send({ t: 'law', a: 'stars', n: 2 });
  const w = await c.next(m => m.t === 'wanted' && m.l.some(x => x[1] === 'Robber_Tee'), 5000); assert.equal(w.l.find(x => x[1] === 'Robber_Tee')[2], 2);
  const j = await c.next(m => m.t === 'w' && m.j && m.j.some(x => x.n === 'Robber_Tee' && x.w === 2), 5000); assert.ok(j);
  c.send({ t: 'law', a: 'arrest', i: rme.id }); assert.match((await c.next(m => m.t === 'err' && m.w === 'law')).m, /Knock/);
  r.send({ t: 'law', a: 'surrender' }); await r.next('lawhands');
  c.send({ t: 'p', x: 101.5, y: 0, z: 100, r: 0, a: 'i', s: 0, v: '', q: 0 }); await new Promise(res => setTimeout(res, 250));
  c.send({ t: 'law', a: 'arrest', i: rme.id }); assert.equal((await r.next('arrested')).by, 'Officer_Ojo');
  assert.equal((await c.next('arrestok')).reward, 3000);
  // wanted again: this time he settles the officer (the money moves on the server)
  r.send({ t: '$', d: 5000, s: 1 }); const r0 = (await r.next('$')).n;
  r.send({ t: 'law', a: 'stars', n: 1 }); await c.next(m => m.t === 'wanted' && m.l.some(x => x[1] === 'Robber_Tee'), 5000);
  r.send({ t: 'law', a: 'settle', i: cme.id, n: 2000 }); const rr = await r.next(m => (m.t === 'err' || m.t === 'ok') && m.w === 'law'); assert.match(rr.m, /You offered/, rr.m); const ask = await c.next('settleask'); assert.equal(ask.amt, 2000);
  c.send({ t: 'law', a: 'settleok', i: ask.i }); const st = await r.next('settled'); assert.equal(st.amt, 2000);
  await r.next(m => m.t === '$' && m.n === r0 - 2000, 5000);   // he paid
  void cme; c.close(); r.close();
});

test('a life over the line: kept with the account, checked for sense, back at the next sign-in', async () => {
  const [c, me] = await account('Life_Man'); assert.equal(me.life, null);
  c.send({ t: 'life', d: { home: 'flat', flat: true, rent: 7200, rented: 3, own: ['rags', 'suit', 'BAD ONE', 7], ease: 5, t: 1 } });
  c.send({ t: 'life', d: 'nonsense' });
  await new Promise(r => setTimeout(r, 200)); c.close();
  const d = client(); await d.open; d.send({ t: 'login', u: 'life_man', p: 'secret77' }); const me2 = await d.next('me');
  assert.equal(me2.life.home, 'flat'); assert.equal(me2.life.flat, true); assert.equal(me2.life.rented, 3); assert.deepEqual(me2.life.own, ['rags', 'suit']); assert.equal(me2.life.ease, 1);
  d.close();
});

test('the bank over the line: an account at sign-in, whose account, a transfer arrives with a credit alert', async () => {
  const [a] = await account('Bank_Ada'); const [b] = await account('Bank_Tunde');
  a.send({ t: 'bk', a: 'me' }); const A = (await a.next('bk')).me; b.send({ t: 'bk', a: 'me' }); const B = (await b.next('bk')).me;
  assert.match(A.acct, /^\d{10}$/); assert.notEqual(A.acct, B.acct); assert.equal(B.name, 'Bank_Tunde');
  a.send({ t: '$', d: 20000, s: 1 }); await a.next(m => m.t === '$' && m.n === 20000);
  a.send({ t: 'bk', a: 'name', acct: B.acct, bank: B.bank }); assert.equal((await a.next('bkname')).name, 'Bank_Tunde');
  a.send({ t: 'bk', a: 'send', acct: B.acct, bank: B.bank, n: 5000, note: 'chop money', q: 'test-0001' });
  const s = await a.next('bksent'); const fee = A.bank === B.bank ? 0 : 10; assert.equal(s.tx.d, -5000); assert.equal(s.tx.fee, fee);
  assert.equal((await a.next(m => m.t === '$' && m.n === 15000 - fee)).n, 15000 - fee);
  assert.equal((await b.next(m => m.t === '$' && m.n === 5000)).n, 5000);
  assert.match((await b.next('note')).m, /Credit alert! ₦5,000 from Bank_Ada/); assert.equal((await b.next('bktx')).tx.note, 'chop money');
  a.close(); b.close();
});

test('the oga takes a part of the work money of his hustle near him, nothing from far away or other money', async () => {
  const [o] = await account('ogaman'), [b] = await account('okadaboy'), [f] = await account('faraway');
  o.send({ t: 'life', d: { job: 'okada', jp: { okada: 170 }, t: Date.now() } }); b.send({ t: 'life', d: { job: 'okada', jp: { okada: 3 }, t: Date.now() } }); f.send({ t: 'life', d: { job: 'okada', jp: { okada: 1 }, t: Date.now() } });
  o.send({ t: 'p', x: 100, y: 0, z: 100, r: 0, a: 'i', s: 0, v: '', q: 0 }); b.send({ t: 'p', x: 300, y: 0, z: 100, r: 0, a: 'i', s: 0, v: '', q: 0 }); f.send({ t: 'p', x: 1500, y: 0, z: 100, r: 0, a: 'i', s: 0, v: '', q: 0 });
  await new Promise(r => setTimeout(r, 300));
  b.send({ t: '$', d: 1000, s: 1, j: 'okada' });
  const cut = await b.next('oga'); assert.deepEqual([cut.n, cut.c], ['ogaman', 100]);
  assert.equal((await b.next(m => m.t === '$' && m.s === 1)).n, 900);
  const got = await o.next('ogaget'); assert.deepEqual([got.n, got.c], ['okadaboy', 100]);
  b.send({ t: '$', d: 1000, s: 2 }); assert.equal((await b.next(m => m.t === '$' && m.s === 2)).n, 1900, 'money that is not from the work: no cut');
  f.send({ t: '$', d: 1000, s: 1, j: 'okada' }); assert.equal((await f.next(m => m.t === '$' && m.s === 1)).n, 1000, 'too far from the oga: no cut');
  o.send({ t: '$', d: 1000, s: 5, j: 'okada' }); assert.equal(o.got.some(m => m.t === 'oga'), false, 'the oga pays nobody');
  o.close(); b.close(); f.close();
});

test('a player who smells: everybody near sees it (sm in the player list), and it clears after a bath', async () => {
  const [a] = await account('stinker'), [b] = await account('nose');
  a.send({ t: 'p', x: 50, y: 0, z: 50, r: 0, a: 'i', s: 0, v: '', q: 0 }); b.send({ t: 'p', x: 55, y: 0, z: 50, r: 0, a: 'i', s: 0, v: '', q: 0 });
  a.send({ t: 'life', d: { dirt: 1, t: Date.now() } });
  const w = await b.next(m => m.t === 'w' && m.j && m.j.some(j => j.n === 'stinker' && j.sm === 1), 5000); assert.ok(w);
  await new Promise(r => setTimeout(r, 2100)); a.send({ t: 'life', d: { dirt: 0, t: Date.now() } });
  const w2 = await b.next(m => m.t === 'w' && m.j && m.j.some(j => j.n === 'stinker' && j.sm === 0), 5000); assert.ok(w2);
  a.close(); b.close();
});

test('romance between players: 18+ only, opt-in, ask/accept, kiss seen by people near, no/block, end', async () => {
  const [a] = await account('lover_a', 'secret77', {}), [b] = await account('lover_b'), [k] = await account('kid_c'), [w] = await account('kiss_watch');
  a.send({ t: 'rom', a: 'age', dob: '1998-05-01' }); assert.equal((await a.next(m => m.t === 'romme' && m.m.known)).m.adult, true);
  b.send({ t: 'rom', a: 'age', dob: '1999-11-20' }); await b.next(m => m.t === 'romme' && m.m.known);
  const kidYear = new Date().getUTCFullYear() - 15; k.send({ t: 'rom', a: 'age', dob: `${kidYear}-01-01` }); assert.equal((await k.next(m => m.t === 'romme' && m.m.known)).m.adult, false);
  a.send({ t: 'rom', a: 'age', dob: '1980-01-01' }); assert.match((await a.next(m => m.t === 'err' && m.w === 'rom')).m, /set already/);
  k.send({ t: 'rom', a: 'on', on: true }); assert.match((await k.next(m => m.t === 'err' && m.w === 'rom')).m, /18\+/);
  for (const [c, x] of [[a, 100], [b, 102], [k, 104], [w, 110]]) c.send({ t: 'p', x, y: 0, z: 100, r: 0, a: 'i', s: 0, v: '', q: 0 });
  await new Promise(r => setTimeout(r, 300));
  const pid = async (c, name) => { for (let i = 0; i < 20; i++) { const j = c.got.flatMap(m => m.t === 'w' && m.j ? m.j : []).find(j => j.n === name); if (j) return j.i; await new Promise(r => setTimeout(r, 150)); } return null; };
  const bId = await pid(a, 'lover_b'), kId = await pid(a, 'kid_c'), aId = await pid(b, 'lover_a');
  a.send({ t: 'rom', a: 'ask', i: bId }); assert.match((await a.next(m => m.t === 'err' && m.w === 'rom')).m, /Turn on romance/);
  a.send({ t: 'rom', a: 'on', on: true }); b.send({ t: 'rom', a: 'on', on: true }); await a.next(m => m.t === 'romme' && m.m.on); await b.next(m => m.t === 'romme' && m.m.on);
  a.send({ t: 'rom', a: 'ask', i: kId }); assert.match((await a.next(m => m.t === 'err' && m.w === 'rom')).m, /can't take requests/);
  a.send({ t: 'rom', a: 'ask', i: bId }); const ask = await b.next('romask'); assert.deepEqual([ask.k, ask.n], ['rel', 'lover_a']);
  b.send({ t: 'rom', a: 'yes', i: ask.i }); assert.equal((await a.next('romok')).n, 'lover_b'); await b.next('romok');
  a.send({ t: 'rom', a: 'kiss', i: bId }); const kq = await b.next(m => m.t === 'romask' && m.k === 'kiss');
  b.send({ t: 'rom', a: 'yes', i: kq.i }); 
  const fx = await w.next('kissfx'); assert.deepEqual(fx.n, ['lover_a', 'lover_b']);
  const tag = await w.next(m => m.t === 'w' && m.j && m.j.some(j => j.n === 'lover_a' && j.pt === 'lover_b'), 4000); assert.ok(tag);
  b.send({ t: 'rom', a: 'end' }); assert.equal((await a.next('romend')).n, 'lover_b');
  for (const c of [a, b, k, w]) c.close();
});
