// The buka on its own: a fake clock and fake players, so a whole Lagos lunch time passes in a moment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createBiz, BUKA } from '../src/biz.js';
import { gameHour } from '../src/clock.js';

function setup(seed = 1) {
  const db = openDb(':memory:');
  let t = Date.UTC(2026, 9, 16, 12, 0, 0); while (Math.abs(gameHour(t) - 13) > .2) t += 30e3;   // lunch time in Lagos
  let s = seed; const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const sent = [], online = new Map();
  const mk = (name, cash) => {
    const id = db.addUser({ name, salt: Buffer.alloc(16), hash: Buffer.alloc(32), now: t, cash });
    const C = { user: { id, name }, cash, ws: { open: true, send: x => sent.push([name, JSON.parse(x)]) } }; online.set(id, C); return C;
  };
  const ctx = {
    online, send: (C, o) => sent.push([C.user.name, o]), err: (C, w, m) => sent.push([C.user.name, { t: 'err', w, m }]), ok: (C, w, m) => sent.push([C.user.name, { t: 'ok', w, m }]),
    spend: (C, n) => { if (C.cash < n) return false; C.cash -= n; return true; }, give: (C, n) => { C.cash += n; },
  };
  const now = () => t;
  const biz = createBiz({ db, now, rand, ctx });
  const last = (name, k) => [...sent].reverse().find(([n, o]) => n === name && (!k || o.t === k))?.[1];
  return { db, biz, mk, sent, last, adv: s2 => { t += s2 * 1000; }, now, ctx };
}

test('buy a buka, cook, sell to customers while the cook works, collect the till', () => {
  const T = setup(), ada = T.mk('Ada', 200000), tunde = T.mk('Tunde', 500);
  T.biz.handle(tunde, { a: 'buy', id: 'buka_1' }); assert.equal(T.last('Tunde', 'err').m.includes('enough money'), true);
  T.biz.handle(ada, { a: 'buy', id: 'buka_1' }); assert.equal(ada.cash, 200000 - BUKA.price);
  T.biz.handle(tunde, { a: 'buy', id: 'buka_1' }); assert.match(T.last('Tunde', 'err').m, /owns this buka/);
  T.biz.handle(tunde, { a: 'cook', id: 'buka_1', k: 'jollof', n: 10 }); assert.match(T.last('Tunde', 'err').m, /not your buka/);
  // closed: no food, no cook
  assert.equal(T.biz.isOpen(T.biz.get('buka_1')), false);
  T.biz.handle(ada, { a: 'cook', id: 'buka_1', k: 'jollof', n: 40 });
  assert.equal(ada.cash, 100000 - 40 * 1500 * BUKA.cost);
  T.biz.handle(ada, { a: 'cook', id: 'buka_1', k: 'eba', n: 500 });   // only 20 more fit in the pots (60)
  assert.equal(T.biz.get('buka_1').d.st.eba, 20);
  T.biz.handle(ada, { a: 'cook', id: 'buka_1', k: 'amala', n: 1 }); assert.match(T.last('Ada', 'err').m, /pots are full/);
  // nobody serving: nothing sells
  T.biz.tick(600); assert.equal(T.biz.get('buka_1').till, 0);
  T.biz.handle(ada, { a: 'hire', id: 'buka_1', h: 6 }); assert.equal(T.biz.isOpen(T.biz.get('buka_1')), true);
  let sold = 0; for (let i = 0; i < 60; i++) { T.adv(10); T.biz.tick(10); }   // ten minutes of lunch
  const b = T.biz.get('buka_1'); sold = b.d.day.sold;
  assert.ok(sold >= 3 && sold <= 25, 'sold ' + sold); assert.equal(b.till, b.d.day.earned); assert.equal(60 - (b.d.st.jollof + b.d.st.eba), sold);
  // Tunde eats there: his money goes into her till
  T.ctx.spend(tunde, 0); tunde.cash = 3000; const till0 = b.till;
  T.biz.handle(tunde, { a: 'eat', id: 'buka_1', k: 'jollof' }); assert.equal(T.last('Tunde', 'bzate').k, 'jollof');
  assert.equal(tunde.cash, 1500); assert.equal(b.till, till0 + 1500);
  T.biz.handle(tunde, { a: 'eat', id: 'buka_1', k: 'amala' }); assert.match(T.last('Tunde', 'err').m, /finish/);
  // collect by phone: 5% fee
  const cash0 = ada.cash, till = b.till; T.biz.handle(ada, { a: 'take', id: 'buka_1', far: 1 });
  assert.equal(ada.cash, cash0 + till - Math.round(till * .05)); assert.equal(b.till, 0);
  // everyone sees the board
  T.biz.pushAll(); const bz = [...T.sent].reverse().find(([n, o]) => n === 'Tunde' && o.t === 'bz')[1];
  assert.equal(bz.s.find(x => x.id === 'buka_1').n, "Ada's Buka");
});

test('cheaper food sells faster; prices stay in range; names are clean', () => {
  const run = price => {
    const T = setup(7), o = T.mk('Owner', 1e6); T.biz.handle(o, { a: 'buy', id: 'buka_3' });
    T.biz.handle(o, { a: 'cook', id: 'buka_3', k: 'jollof', n: 60 }); T.biz.handle(o, { a: 'price', id: 'buka_3', k: 'jollof', p: price }); T.biz.handle(o, { a: 'hire', id: 'buka_3', h: 24 });
    for (let i = 0; i < 180; i++) { T.adv(10); T.biz.tick(10); }
    return [T.biz.get('buka_3').d.day.sold, T.biz.get('buka_3').d.pr.jollof, T, o];
  };
  const [cheap, p1] = run(900), [dear, p2, T, o] = run(3500);
  assert.ok(cheap > dear, `cheap ${cheap} vs dear ${dear}`); assert.equal(p1, 900); assert.equal(p2, 3500);
  T.biz.handle(o, { a: 'price', id: 'buka_3', k: 'jollof', p: 1e7 }); assert.equal(T.biz.get('buka_3').d.pr.jollof, 1500 * BUKA.priceMax);
  T.biz.handle(o, { a: 'name', id: 'buka_3', n: 'Mama Put shit' }); assert.equal(T.last('Owner', 'err').w, 'bz');
  T.biz.handle(o, { a: 'name', id: 'buka_3', n: "Iya Ada's Kitchen" }); assert.equal(T.biz.get('buka_3').name, "Iya Ada's Kitchen");
});

test('the till and the buka are saved and come back after a restart', () => {
  const T = setup(3), o = T.mk('Saver', 1e6); T.biz.handle(o, { a: 'buy', id: 'buka_2' });
  T.biz.handle(o, { a: 'cook', id: 'buka_2', k: 'iyan', n: 30 }); T.biz.handle(o, { a: 'up', id: 'buka_2', w: 'seat' }); T.biz.handle(o, { a: 'hire', id: 'buka_2', h: 24 });
  for (let i = 0; i < 60; i++) { T.adv(10); T.biz.tick(10); } T.biz.flush();
  const before = T.biz.get('buka_2');
  const again = createBiz({ db: T.db, now: T.now, rand: Math.random, ctx: T.ctx }).get('buka_2');
  assert.equal(again.owner, o.user.id); assert.equal(again.oname, 'Saver'); assert.equal(again.till, before.till); assert.equal(again.d.up.seat, 1); assert.deepEqual(again.d.st, before.d.st);
  // sell it back: half the price and half the upgrades, plus the till
  const c0 = o.cash, till = before.till; T.biz.handle(o, { a: 'sell', id: 'buka_2' });
  assert.equal(o.cash, c0 + BUKA.price / 2 + BUKA.seatUp[1] / 2 + till); assert.equal(T.biz.get('buka_2').owner, null);
  // two at most
  T.biz.handle(o, { a: 'buy', id: 'buka_4' }); T.biz.handle(o, { a: 'buy', id: 'buka_5' }); T.biz.handle(o, { a: 'buy', id: 'buka_6' });
  assert.match(T.last('Saver', 'err').m, /own 2/);
});
