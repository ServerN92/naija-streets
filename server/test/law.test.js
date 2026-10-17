// The police online on their own: fake players, the real player fights, a fake clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createLaw, LAW } from '../src/law.js';
import { createPvp, PVP } from '../src/pvp.js';

function setup() {
  const db = openDb(':memory:'); let t = Date.UTC(2026, 9, 17, 12, 0, 0), pid = 1;
  const sent = [], online = new Map(), badges = new Map();
  const mk = (name, cash, x = 0, z = 0, r = 0) => {
    const id = db.addUser({ name, salt: Buffer.alloc(16), hash: Buffer.alloc(32), now: t, cash });
    const C = { user: { id, name }, cash, ws: { open: true }, p: { id: pid++, name, has: true, h: 0, v: '', x, y: 0, z, r, lv: 0, ver: 0 } }; online.set(id, C); return C;
  };
  const ctx = { online, send: (C, o) => sent.push([C.user.name, o]), err: (C, w, m) => sent.push([C.user.name, { t: 'err', w, m }]), ok: (C, w, m) => sent.push([C.user.name, { t: 'ok', w, m }]),
    give: (C, n) => { C.cash += n; }, spend: (C, n) => { if (C.cash < n) return false; C.cash -= n; return true; }, badge: uid => { const C = online.get(uid); badges.set(uid, C.law && C.law.duty ? 'p' : ''); } };
  const law = createLaw({ db, now: () => t, ctx });
  const pvp = createPvp({ now: () => t, rand: () => .5, ctx: { ...ctx, onKo: (A, D) => law.ko(A, D), onHit: (A, D) => law.hit(A, D), noRob: A => law.noRob(A) } });
  const last = (name, k) => [...sent].reverse().find(([n, o]) => n === name && (!k || o.t === k))?.[1];
  const beat = (A, D, k = 'heavy') => { for (let i = 0; i < 14 && !last(D.user.name, 'pko'); i++) { t += 400; pvp.hit(A, { i: D.p.id, k }); } };
  return { db, law, pvp, mk, sent, last, badges, beat, adv: ms => { t += ms; }, now: () => t };
}

test('a robber gets a star for a knock-out, a police officer on duty knocks him down and arrests him, and is paid', () => {
  const T = setup(), ola = T.mk('Ola', 30000, 0, 0, 0), bisi = T.mk('Bisi', 20000, 0, 1.2, Math.PI), cop = T.mk('Officer_K', 0, 0, -1.2, 0);
  for (const C of [ola, bisi, cop]) { T.law.hello(C); T.pvp.hello(C); }
  T.adv(PVP.fresh + 1000);
  // the cop joins and goes on duty
  T.law.handle(cop, { a: 'duty', on: true }); assert.match(T.last('Officer_K', 'err').m, /Join the force/);
  T.law.handle(cop, { a: 'join' }); T.law.handle(cop, { a: 'duty', on: true }); assert.equal(T.badges.get(cop.user.id), 'p'); assert.equal(T.last('Officer_K', 'lawme').m.rank, 'Constable');
  // Bisi knocks out Ola: one star, and everybody sees it
  T.beat(bisi, ola); assert.equal(T.law.stars(bisi), 1); assert.equal(bisi.p.ws, 1);
  T.law.tick(); const W = T.last('Officer_K', 'wanted').l; assert.deepEqual(W.map(w => [w[1], w[2]]), [['Bisi', 1]]);
  // the cop cannot arrest her standing; knocks her down (no pocket money taken) and arrests her
  T.law.handle(cop, { a: 'arrest', i: bisi.p.id }); assert.match(T.last('Officer_K', 'err').m, /Knock Bisi down/);
  cop.p.r = 0; bisi.p.z = 0; bisi.p.x = 0; cop.p.z = -1.1; const b0 = bisi.cash;
  T.beat(cop, bisi, 'kick'); assert.equal(T.last('Bisi', 'pko').took, 0); assert.equal(bisi.cash, b0);
  assert.ok(T.last('Officer_K', 'lawcuff')); assert.equal(T.law.stars(cop), 0, 'no stars for the police doing their job');
  T.law.handle(cop, { a: 'arrest', i: bisi.p.id });
  assert.equal(T.last('Bisi', 'arrested').by, 'Officer_K'); assert.equal(T.law.stars(bisi), 0); assert.equal(bisi.p.ws, 0);
  const ok = T.last('Officer_K', 'arrestok'); assert.equal(ok.reward, LAW.reward.srv); assert.equal(cop.cash, LAW.reward.srv);
  // arresting her again soon pays nothing
  T.law.handle(bisi, { a: 'stars', n: 2 }); T.law.handle(bisi, { a: 'surrender' }); T.law.handle(cop, { a: 'arrest', i: bisi.p.id }); assert.equal(T.last('Officer_K', 'arrestok').reward, 0);
});

test('stars wear off, street stars count, a bad cop is suspended and wanted, wanted people cannot join or go on duty', () => {
  const T = setup(), a = T.mk('Ade', 0, 0, 0, 0), b = T.mk('Bayo', 0, 0, 1.2, Math.PI);
  for (const C of [a, b]) { T.law.hello(C); T.pvp.hello(C); }
  T.adv(PVP.fresh + 1);
  T.law.handle(b, { a: 'stars', n: 3 }); assert.equal(T.law.stars(b), 3);
  T.law.handle(b, { a: 'join' }); assert.match(T.last('Bayo', 'err').m, /wanted/);
  T.law.handle(b, { a: 'stars', n: 0 });
  T.law.handle(a, { a: 'join' }); T.law.handle(a, { a: 'duty', on: true });
  T.beat(a, b); assert.match(T.last('Ade', 'note').m, /suspended/); assert.equal(T.law.stars(a), LAW.badCopStars); assert.equal(T.badges.get(a.user.id), '');
  T.law.handle(a, { a: 'stars', n: 0 }); T.adv(LAW.decay * 2 + 1000); assert.equal(T.law.stars(a), 0, 'the stars wore off');
  T.law.handle(a, { a: 'duty', on: true }); assert.match(T.last('Ade', 'err').m, /suspended/);
  // hitting a police officer on duty is a crime
  T.adv(LAW.ban + 1000); T.law.handle(a, { a: 'duty', on: true }); assert.equal(T.badges.get(a.user.id), 'p');
  T.adv(PVP.guard); T.pvp.hit(b, { i: a.p.id, k: 'jab' }); assert.equal(T.law.stars(b), 1);
});
