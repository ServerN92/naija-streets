// The motor park union on its own: a fake clock and fake players standing in the yard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createPark, PARK, SITE } from '../src/park.js';

function setup(seed = 7, db = openDb(':memory:'), t0 = Date.UTC(2026, 9, 17, 10, 1, 0)) {
  let t = t0;
  let s = seed; const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const sent = [], online = new Map(), badges = new Map();
  const mk = (name, cash, at = 'yard') => {
    const id = db.user(name)?.id || db.addUser({ name, salt: Buffer.alloc(16), hash: Buffer.alloc(32), now: t, cash });
    const C = { user: { id, name }, cash, ws: { open: true, send: x => sent.push([name, JSON.parse(x)]) }, p: { has: true, v: '', x: SITE.x, z: SITE.z } };
    if (at === 'away') { C.p.x += 900; }
    online.set(id, C); return C;
  };
  const ctx = {
    online, send: (C, o) => sent.push([C.user.name, o]), err: (C, w, m) => sent.push([C.user.name, { t: 'err', w, m }]), ok: (C, w, m) => sent.push([C.user.name, { t: 'ok', w, m }]),
    spend: (C, n) => { if (C.cash < n) return false; C.cash -= n; return true; }, give: (C, n) => { C.cash += n; },
    credit: (uid, n) => { const C = [...online.values()].find(c => c.user.id === uid); if (C) C.cash += n; else { const u = db.userById(uid); db.setCash(uid, u.cash + n, t); } },
    note: (uid, m) => { const C = [...online.values()].find(c => c.user.id === uid); if (C) sent.push([C.user.name, { t: 'note', m }]); },
    badge: (uid, b) => badges.set(uid, b),
  };
  const now = () => t;
  const park = createPark({ db, now, rand, ctx });
  const last = (name, k) => [...sent].reverse().find(([n, o]) => n === name && (!k || o.t === k))?.[1];
  const tick = (sec = 1) => { for (let i = 0; i < sec; i++) { t += 1000; park.tick(); } };
  const atBay = (C, i) => { C.p.x = SITE.bays[i][0] + 1.5; C.p.z = SITE.bays[i][1] - 1; };
  return { db, park, mk, sent, last, tick, now, atBay, badges, adv: ms => { t += ms; } };
}

test('join the union, run to the loading danfo, collect the ticket, the street touts get the ones you miss', () => {
  const T = setup(), ada = T.mk('Ada', 20000), kola = T.mk('Kola', 20000);
  T.park.handle(ada, { a: 'ticket', id: 1 }); assert.match(T.last('Ada', 'err').m, /Join the park union/);
  T.park.handle(ada, { a: 'join' }); assert.equal(ada.cash, 20000 - PARK.join); assert.equal(T.badges.get(ada.user.id), 'a');
  T.park.handle(ada, { a: 'join' }); assert.match(T.last('Ada', 'err').m, /already/);
  T.tick(6); const L = T.park.loads(); assert.ok(L.length >= 1, 'a danfo loads');
  const d = L[0];
  T.park.handle(ada, { a: 'ticket', id: d.id }); assert.match(T.last('Ada', 'err').m, /stand by the danfo/);
  T.atBay(ada, d.bay); const c0 = ada.cash;
  T.park.handle(ada, { a: 'ticket', id: d.id });
  assert.equal(ada.cash - c0, PARK.price * PARK.share[0]); assert.equal(T.park.member(ada.user.id).rp, 1);
  assert.equal(T.last('Ada', 'pkt').got, 150);
  T.park.handle(kola, { a: 'join' }); T.atBay(kola, d.bay); T.park.handle(kola, { a: 'ticket', id: d.id }); assert.match(T.last('Kola', 'err').m, /Ada don collect/);
  // in a car: no ticket
  T.tick(25); const d2 = T.park.loads().find(x => !x.by); assert.ok(d2); T.atBay(kola, d2.bay); kola.p.v = 'danfo';
  T.park.handle(kola, { a: 'ticket', id: d2.id }); assert.match(T.last('Kola', 'err').m, /stand by/); kola.p.v = '';
  // nobody: the danfo leaves, the touts collect (no player chairman: nothing to pay)
  T.tick(30); assert.ok(T.park.state.day.npc >= 1);
});

test('a head agbero declares, the meeting comes, the boys fight Chairman Kasali, a new chairman', () => {
  const T = setup(3), tunde = T.mk('Tunde', 200000), ada = T.mk('Ada', 20000);
  T.park.handle(tunde, { a: 'join' }); T.park.handle(ada, { a: 'join' });
  T.park.handle(tunde, { a: 'declare', n: 12 }); assert.match(T.last('Tunde', 'err').m, /head agbero/);
  T.park._test.setRp(tunde.user.id, 130);
  const away = T.mk('Far', 1000, 'away'); T.park.handle(away, { a: 'join' }); assert.match(T.last('Far', 'err').m, /Come to the union office/);
  const c0 = tunde.cash; T.park.handle(tunde, { a: 'declare', n: 12 }); assert.equal(c0 - tunde.cash, 12 * PARK.boyFight);
  T.park.handle(ada, { a: 'declare', n: 4 }); assert.match(T.last('Ada', 'err').m, /head agbero/);
  const at = T.park.state.decl.at; assert.ok(at > T.now());
  T.adv(at - T.now() - 500); T.tick(1); assert.ok(T.park.fight, 'the fight starts at the meeting');
  assert.equal(T.park.fight.a, PARK.npcBoys); assert.equal(T.park.fight.b, 12);
  assert.match(T.last('Ada', 'note').m, /come for Chairman Kasali/);
  // Tunde knocks down two of Kasali's boys himself (too fast: only one counts)
  const b0 = T.park.fight.a; T.park.handle(tunde, { a: 'ko' }); T.park.handle(tunde, { a: 'ko' }); assert.equal(T.park.fight.a, b0 - 1);
  for (let i = 0; i < 200 && T.park.fight; i++) T.tick(1);
  assert.equal(T.park.fight, null);
  assert.equal(T.park.state.chair, tunde.user.id, 'twelve boys beat six');
  assert.equal(T.badges.get(tunde.user.id), 'c');
  assert.match(T.last('Ada', 'note').m, /Tunde is the new chairman/);
  assert.ok(T.park.member(tunde.user.id).rp >= 130 + 25);
  // the chairman's return: Ada collects, Tunde gets the rest (paid once a minute)
  T.tick(8); const d = T.park.loads().find(x => !x.by) || (T.tick(30), T.park.loads().find(x => !x.by)); assert.ok(d);
  T.atBay(ada, d.bay); const a0 = ada.cash, t0 = tunde.cash; T.park.handle(ada, { a: 'ticket', id: d.id });
  assert.equal(ada.cash - a0, d.price * .5);
  T.tick(61); assert.ok(tunde.cash - t0 >= d.price * .5, 'the return came to the chairman');
  // the chairman sets the price and pays his boys
  T.park.handle(tunde, { a: 'price', p: 470 }); assert.equal(T.park.state.price, 450);
  T.park.handle(tunde, { a: 'price', p: 5000 }); assert.equal(T.park.state.price, PARK.priceMax);
  const c1 = tunde.cash; T.park.handle(tunde, { a: 'boys', n: 8 }); assert.equal(c1 - tunde.cash, 8 * PARK.boyDay); assert.equal(T.park.state.crew, 8);
  T.park.handle(ada, { a: 'price', p: 200 }); assert.equal(T.park.state.price, PARK.priceMax, 'only the chairman');
  // sack
  T.park.handle(tunde, { a: 'sack', uid: ada.user.id }); T.tick(10);
  const d3 = T.park.loads().find(x => !x.by) || (T.tick(30), T.park.loads().find(x => !x.by)); T.atBay(ada, d3.bay); T.park.handle(ada, { a: 'ticket', id: d3.id }); assert.match(T.last('Ada', 'err').m, /sack/);
});

test('the chairman holds the park when the challenger brings too few boys; it all survives a restart', () => {
  const db = openDb(':memory:');
  let T = setup(11, db), tunde = T.mk('Tunde', 500000), kola = T.mk('Kola', 100000), ada = T.mk('Ada', 50000);
  for (const C of [tunde, kola, ada]) T.park.handle(C, { a: 'join' });
  T.park._test.setRp(tunde.user.id, 150); T.park._test.setRp(kola.user.id, 125);
  T.park.handle(tunde, { a: 'declare', n: 12 }); T.adv(T.park.state.decl.at - T.now()); T.tick(1);
  for (let i = 0; i < 200 && T.park.fight; i++) T.tick(1);
  assert.equal(T.park.state.chair, tunde.user.id);
  T.park.handle(tunde, { a: 'boys', n: 12 });
  T.park.handle(kola, { a: 'declare', n: 2 }); assert.equal(T.badges.get(kola.user.id), 'a');
  T.park.handle(ada, { a: 'side', s: 'x' }); assert.equal(T.park.member(ada.user.id).side, 'x');
  T.park.handle(tunde, { a: 'sack', uid: kola.user.id }); assert.match(T.last('Tunde', 'err').m, /declared/);
  assert.match(T.last('Tunde', 'note').m, /Kola has declared/);
  T.park.flush();
  // the server restarts before the meeting
  const at = T.park.state.decl.at, t1 = T.now();
  T = setup(5, db, t1); tunde = T.mk('Tunde', 0); kola = T.mk('Kola', 0); ada = T.mk('Ada', 0);
  assert.equal(T.park.state.chair, tunde.user.id); assert.equal(T.park.state.decl.name, 'Kola'); assert.equal(T.park.member(tunde.user.id).rp >= 175, true);
  assert.equal(T.park.badge(tunde.user.id), 'c'); assert.equal(T.park.badge(ada.user.id), 'a');
  T.adv(at - T.now()); T.tick(1); assert.ok(T.park.fight); assert.equal(T.park.fight.a, 12); assert.equal(T.park.fight.b, 2);
  for (let i = 0; i < 200 && T.park.fight; i++) T.tick(1);
  assert.equal(T.park.state.chair, tunde.user.id, 'two boys cannot take twelve');
  assert.match(T.last('Ada', 'note').m, /Tunde held/);
  assert.equal(T.park.member(ada.user.id).side, 'c');
  assert.equal(T.park.state.last.win, 'Tunde');
  // steps down: Kasali is back
  T.park.handle(tunde, { a: 'resign' }); assert.equal(T.park.state.chair, null); assert.equal(T.park.pub().ch, 'Chairman Kasali');
});

test('street tickets: half to the boy at once, the oga half kept and paid to the chairman at the end of the game day; once a danfo, 40 a day', () => {
  const T = setup(), chief = T.mk('Chief', 200000), ada = T.mk('Ada', 20000, 'away'), bayo = T.mk('Bayo', 20000, 'away');
  const txs = []; T.park._ctxBank = null;
  // make Chief the chairman (as if he won the seat)
  Object.assign(T.park.state, { chair: chief.user.id, cname: 'Chief', crew: 4, crewUntil: T.now() + 24 * 3600e3 });
  for (const C of [ada, bayo]) { C.p.x = SITE.x; C.p.z = SITE.z; T.park.handle(C, { a: 'join' }); C.p.x += 900; }
  T.park.handle(ada, { a: 'street', plate: 'KJA-123AB' }); const st = T.last('Ada', 'pkst');
  assert.equal(st.got, PARK.street * PARK.streetShare); assert.equal(st.held, PARK.street - st.got); assert.equal(st.chair, 'Chief');
  T.adv(PARK.streetGap + 10); T.park.handle(ada, { a: 'street', plate: 'KJA-123AB' }); assert.match(T.last('Ada', 'err').m, /pay today already/);
  T.adv(PARK.streetGap + 10); T.park.handle(ada, { a: 'street', plate: 'kja-124ab' }); assert.equal(T.last('Ada', 'pkst').n, 2);
  T.park.handle(ada, { a: 'street', plate: 'KJA-125AB' }); assert.equal(T.last('Ada', 'pkst').n, 2, 'too fast: ignored');
  T.adv(PARK.streetGap + 10); T.park.handle(bayo, { a: 'street', plate: 'KJA-123AB' }); assert.equal(T.last('Bayo', 'pkst').n, 1, 'another boy, another stop: the same plate pays him');
  // in the park or in a motor: no
  ada.p.v = 'sedan'; T.adv(PARK.streetGap + 10); T.park.handle(ada, { a: 'street', plate: 'KJA-200AB' }); assert.match(T.last('Ada', 'err').m, /Come down/); ada.p.v = '';
  ada.p.x = SITE.x; T.park.handle(ada, { a: 'street', plate: 'KJA-200AB' }); assert.match(T.last('Ada', 'err').m, /Inside the park/); ada.p.x += 900;
  assert.equal(ada.cash, 20000 - PARK.join + 2 * st.got); assert.equal(bayo.cash, 20000 - PARK.join + st.got);
  // the chairman sees it waiting
  T.park.handle(chief, { a: 'info' }); const m = T.last('Chief', 'pkme').m; assert.equal(m.street.n, 3); assert.equal(m.street.held, 3 * st.held); assert.equal(m.street.crew, 4 * PARK.crewStreet);
  // the game day ends: the oga's half (and the crew's) goes to the chairman
  const c0 = chief.cash; T.adv(2 * 3600e3); T.tick(1);
  assert.equal(chief.cash, c0 + 3 * st.held + 4 * PARK.crewStreet);
  assert.match(T.last('Ada', 'note').m, /don go to Chief's account/);
  assert.equal(T.park.state.lastStreet.n, 3);
  T.tick(5); assert.equal(chief.cash, c0 + 3 * st.held + 4 * PARK.crewStreet, 'paid once');
  // 40 a day at most
  for (let i = 0; i < 45; i++) { T.adv(PARK.streetGap + 10); T.park.handle(ada, { a: 'street', plate: `LND-${String(100 + i)}XY` }); }
  assert.equal(T.last('Ada', 'pkst').n, PARK.streetMax); assert.match(T.last('Ada', 'err').m, /40 tickets today/);
});

test('street tickets with Chairman Kasali in the seat: the boy keeps half, the old man takes the rest', () => {
  const T = setup(), ada = T.mk('Ada', 20000);
  T.park.handle(ada, { a: 'join' }); ada.p.x += 900;
  T.park.handle(ada, { a: 'street', plate: 'APP-777QQ' }); const st = T.last('Ada', 'pkst'); assert.equal(st.chair, SITE.npc); assert.equal(st.got, 100);
  T.adv(2 * 3600e3); T.tick(1); assert.match(T.last('Ada', 'note').m, /Chairman Kasali/);
});
