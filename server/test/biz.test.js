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

test('the barbing salon: supplies, fuel when NEPA takes light, cuts sell in the evening, a player gets a cut', async () => {
  const { BARBER, nepa } = await import('../src/biz.js');
  const T = setup(11), o = T.mk('Barber_O', 300000), p = T.mk('Client', 5000);
  T.biz.handle(o, { a: 'buy', id: 'barber_2' }); assert.equal(o.cash, 300000 - BARBER.price);
  const b = T.biz.get('barber_2'); assert.equal(b.name, 'Barber_O Cuts');
  T.biz.handle(o, { a: 'hire', id: 'barber_2', h: 24 });
  assert.equal(T.biz.isOpen(b), false, 'no supplies: closed');
  T.biz.handle(o, { a: 'supplies', id: 'barber_2' }); assert.equal(b.d.sup, 30);
  // find a time with no light: without fuel it is closed, with fuel it is open
  while (nepa('barber_2', T.now())) T.adv(20 * 60);
  assert.equal(T.biz.isOpen(b), false, 'no light, no fuel: closed');
  T.biz.handle(o, { a: 'fuel', id: 'barber_2' }); assert.equal(b.d.fuel, 5); assert.equal(T.biz.isOpen(b), true);
  const f0 = b.d.fuel, s0 = b.d.sup;
  for (let i = 0; i < 90; i++) { T.adv(10); if (nepa('barber_2', T.now())) break; T.biz.tick(10); }
  const cuts = s0 - b.d.sup; assert.ok(cuts > 0, 'some cuts'); assert.ok(Math.abs((f0 - b.d.fuel) - cuts * BARBER.fuel.perCut) < .01, 'fuel used per cut');
  assert.equal(b.till, b.d.day.earned);
  // a real player gets a fade
  T.biz.handle(p, { a: 'use', id: 'barber_2', k: 'fade' }); assert.equal(T.last('Client', 'bzcut').k, 'fade'); assert.equal(p.cash, 2500);
  // the AC: more people, twice the fuel without light
  T.biz.handle(o, { a: 'up', id: 'barber_2', w: 'ac' }); assert.equal(b.d.up.ac, 1);
  T.biz.handle(o, { a: 'up', id: 'barber_2', w: 'ac' }); assert.match(T.last('Barber_O', 'err').m, /AC already/);
  T.biz.handle(p, { a: 'supplies', id: 'barber_2' }); assert.match(T.last('Client', 'err').m, /not your salon/);
  // two businesses of different kinds are fine; a third is not
  T.biz.handle(o, { a: 'buy', id: 'buka_8' }); assert.equal(T.biz.get('buka_8').owner, o.user.id);
  T.biz.handle(o, { a: 'buy', id: 'barber_3' }); assert.match(T.last('Barber_O', 'err').m, /own 2/);
  // everyone sees the salon's board and whether it has light
  T.biz.pushAll(); const bz = [...T.sent].reverse().find(([n, x]) => n === 'Client' && x.t === 'bz' && x.s.some(y => y.id === 'barber_2'))[1];
  const pb = bz.s.find(x => x.id === 'barber_2') || {}; assert.equal(pb.n, 'Barber_O Cuts'); assert.ok('light' in pb);
});

test('the POS stand: cash in the box, customers withdraw and transfer, the network jams, players send money', async () => {
  const { POS, network } = await import('../src/biz.js');
  const T = setup(5), o = T.mk('Agent_O', 400000), a = T.mk('Sender', 60000), r = T.mk('Getter', 0);
  const credited = []; T.ctx.findUser = n => { const u = T.db.user(n); return u ? { id: u.id, name: u.name } : null; };
  T.ctx.credit = (uid, n, why, note) => { credited.push([uid, n, note]); const C = [...T.ctx.online.values()].find(c => c.user.id === uid); if (C) C.cash += n; };
  T.biz.handle(o, { a: 'buy', id: 'pos_3' }); assert.equal(o.cash, 400000 - POS.price);
  const b = T.biz.get('pos_3'); assert.equal(b.name, 'Agent_O POS');
  T.biz.handle(o, { a: 'hire', id: 'pos_3', h: 24 });
  assert.equal(T.biz.isOpen(b), false, 'no cash: closed');
  T.biz.handle(o, { a: 'float', id: 'pos_3', n: 100000 }); assert.equal(b.d.float, 100000);
  T.biz.handle(o, { a: 'float', id: 'pos_3', n: 12345 }); assert.equal(b.d.float, 100000, 'only the set amounts');
  while (!network('pos_3', T.now(), false)) T.adv(12 * 60);
  const total0 = b.d.float + b.d.wallet;
  for (let i = 0; i < 90; i++) { T.adv(10); T.biz.tick(10); }
  assert.ok(b.d.day.sold > 0, 'customers came'); assert.equal(b.d.float + b.d.wallet, total0, 'cash and e-money only move between box and wallet');
  assert.ok(b.till > 0); assert.equal(b.till, b.d.day.earned);
  // the bank run: e-money comes back as cash for the box
  const w0 = b.d.wallet, f0 = b.d.float; T.biz.handle(o, { a: 'bank', id: 'pos_3' });
  if (w0 > POS.bankFee) { assert.equal(b.d.wallet, 0); assert.equal(b.d.float, f0 + w0 - POS.bankFee); }
  // sending: needs e-money in the machine
  T.biz.handle(a, { a: 'send', id: 'pos_3', to: 'getter', n: 5000 }); assert.match(T.last('Sender', 'err').m, /run out of money/);
  T.biz.handle(o, { a: 'unfloat', id: 'pos_3' }); assert.equal(b.d.float, 0);
  T.biz.handle(o, { a: 'fund', id: 'pos_3', n: 50000 }); assert.equal(b.d.wallet, 50000);
  T.biz.handle(a, { a: 'send', id: 'pos_3', to: 'nobody_here', n: 5000 }); assert.match(T.last('Sender', 'err').m, /No player/);
  T.biz.handle(a, { a: 'send', id: 'pos_3', to: 'sender', n: 5000 }); assert.match(T.last('Sender', 'err').m, /yourself/);
  const till0 = b.till; T.biz.handle(a, { a: 'send', id: 'pos_3', to: 'GETTER', n: 20000 });
  assert.equal(T.last('Sender', 'bzsent').n, 20000); assert.equal(a.cash, 60000 - 20000 - 200); assert.equal(r.cash, 20000);
  assert.equal(b.till, till0 + 200); assert.equal(b.d.wallet, 30000); assert.equal(b.d.float, 20000);
  assert.match(credited[0][2], /Sender sent you ₦20,000/);
  // selling back: the cash and the e-money come back in full
  const c0 = o.cash, back = POS.price / 2 + b.d.float + b.d.wallet + b.till;
  T.biz.handle(o, { a: 'sell', id: 'pos_3' }); assert.equal(o.cash, c0 + back);
});

test('the produce market: a farmer sells tomatoes to a buka; the buka cooks cheaper with them; unsold produce goes back', async () => {
  const { PRODUCE } = await import('../src/biz.js');
  const T = setup(9), f = T.mk('Farmer_F', 0), o = T.mk('Buka_O', 300000);
  const paid = []; T.ctx.credit = (uid, n, why, note) => { paid.push([uid, n, note]); const C = [...T.ctx.online.values()].find(c => c.user.id === uid); if (C) C.cash += n; };
  T.biz.market(f, { a: 'list', crop: 'tomato', n: 10, p: 777 }); assert.equal(T.last('Farmer_F', 'mkerr').m, 'That sale is not right.');
  T.biz.market(f, { a: 'list', crop: 'tomato', n: 10, p: 1000 }); T.biz.market(f, { a: 'list', crop: 'yam', n: 6, p: 1500 });
  assert.equal(T.biz.listings().length, 2); assert.equal(T.last('Farmer_F', 'mkmine').l.length, 2);
  T.biz.pushAll(); const mk = T.last('Buka_O', 'mk'); assert.equal(mk.l.length, 2);
  const tom = mk.l.find(l => l.c === 'tomato');
  T.biz.handle(o, { a: 'buy', id: 'buka_2' });
  T.biz.handle(o, { a: 'produce', id: 'buka_2', lid: tom.id, n: 4 });
  const b = T.biz.get('buka_2'); assert.equal(b.d.pantry.tomato, 4); assert.equal(f.cash, 4000); assert.match(paid[0][2], /Buka_O bought 4 tomatoes/);
  assert.equal(T.biz.listings().find(l => l.id === tom.id).qty, 6);
  const c0 = o.cash; T.biz.handle(o, { a: 'cook', id: 'buka_2', k: 'jollof', n: 10, farm: 1 });
  assert.equal(o.cash, c0 - 10 * 1500 * .15); assert.equal(b.d.pantry.tomato, 2); assert.equal(b.d.st.jollof, 10);
  T.biz.handle(o, { a: 'cook', id: 'buka_2', k: 'amala', n: 10, farm: 1 }); assert.match(T.last('Buka_O', 'err').m, /need 2 yams/);
  // the farmer takes the yams down: they go back to the farm store
  const yam = T.biz.listings().find(l => l.crop === 'yam'); T.biz.market(f, { a: 'cancel', lid: yam.id }); assert.deepEqual(T.last('Farmer_F', 'mkback').items, [['yam', 6]]);
  // two days later the rest of the tomatoes go back by themselves
  T.adv(49 * 3600); T.biz.pushAll(); assert.deepEqual(T.last('Farmer_F', 'mkback').items, [['tomato', 6]]); assert.equal(T.biz.listings().length, 0);
  // five sales at most at once
  for (let i = 0; i < 6; i++) T.biz.market(f, { a: 'list', crop: 'cassava', n: 1, p: PRODUCE.cassava.prices[0] });
  assert.match(T.last('Farmer_F', 'mkerr').m, /5 sales up/);
});
