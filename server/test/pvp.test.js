// Players fighting players on their own: a fake clock and fake players standing in the street.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPvp, PVP } from '../src/pvp.js';

function setup() {
  let t = Date.UTC(2026, 9, 17, 12, 0, 0), id = 1;
  const sent = [], online = new Map(), kos = [];
  const mk = (name, cash, x = 0, z = 0, r = 0) => {
    const C = { user: { id: id, name }, cash, p: { id: id, name, has: true, h: 0, v: '', x, y: 0, z, r } }; online.set(id++, C); return C;
  };
  const ctx = { online, send: (C, o) => sent.push([C.user.name, o]), spend: (C, n) => { if (C.cash < n) return false; C.cash -= n; return true; }, give: (C, n) => { C.cash += n; }, onKo: (A, D) => kos.push([A.user.name, D.user.name]) };
  const pvp = createPvp({ now: () => t, rand: () => .5, ctx });
  const last = (name, k) => [...sent].reverse().find(([n, o]) => n === name && (!k || o.t === k))?.[1];
  return { pvp, mk, sent, last, kos, adv: ms => { t += ms; } };
}

test('blows land only close and in front, the one hit is told, a knock-out takes 10% of the pocket, then protection', () => {
  const T = setup(), kola = T.mk('Kola', 500, 0, 0, 0), ada = T.mk('Ada', 20000, 0, 1.2);   // Ada right in front of Kola (he faces +z)
  T.pvp.hello(kola); T.pvp.hello(ada);
  T.pvp.hit(kola, { i: ada.p.id, k: 'jab' }); assert.match(T.last('Kola', 'pvno').m, /just came online/);
  T.adv(PVP.fresh + 1000);
  T.pvp.hit(kola, { i: ada.p.id, k: 'jab' }); assert.equal(T.last('Ada', 'hurt').d, 9); assert.equal(T.last('Kola', 'hitok').p, 9);
  T.pvp.hit(kola, { i: ada.p.id, k: 'jab' }); assert.equal(T.sent.filter(([, o]) => o.t === 'hurt').length, 1, 'too fast');
  // too far, behind him, in a car
  T.adv(500); ada.p.z = 5; T.pvp.hit(kola, { i: ada.p.id, k: 'jab' }); ada.p.z = -1.2; T.adv(500); T.pvp.hit(kola, { i: ada.p.id, k: 'jab' });
  ada.p.z = 1.2; ada.p.v = 'danfo'; T.adv(500); T.pvp.hit(kola, { i: ada.p.id, k: 'jab' }); ada.p.v = '';
  assert.equal(T.sent.filter(([, o]) => o.t === 'hurt').length, 1);
  // a drop kick reaches further
  ada.p.z = 4.2; T.adv(500); T.pvp.hit(kola, { i: ada.p.id, k: 'drop_kick' }); assert.equal(T.last('Ada', 'hurt').k, 'drop_kick');
  ada.p.z = 1.2;
  for (let i = 0; i < 12 && !T.last('Ada', 'pko'); i++) { T.adv(400); T.pvp.hit(kola, { i: ada.p.id, k: 'kick' }); }
  const ko = T.last('Ada', 'pko'); assert.ok(ko); assert.equal(ko.took, 2000); assert.equal(ada.cash, 18000); assert.equal(kola.cash, 2500);
  assert.equal(T.last('Kola', 'pkowin').n, 'Ada'); assert.deepEqual(T.kos, [['Kola', 'Ada']]);
  T.adv(PVP.ko + 500); T.pvp.hit(kola, { i: ada.p.id, k: 'jab' }); assert.match(T.last('Kola', 'pvno').m, /don fall already/);
  // Ada fights back: Kola had thrown blows, so he has no protection; she takes 10% of his ₦2,500
  T.pvp.hit(ada, { i: kola.p.id, k: 'heavy' }); assert.ok(!T.last('Kola', 'hurt'), 'she faces away from him');
  ada.p.r = Math.PI;
  for (let i = 0; i < 14 && !T.last('Kola', 'pko'); i++) { T.adv(400); T.pvp.hit(ada, { i: kola.p.id, k: 'heavy' }); }
  assert.equal(T.last('Kola', 'pko').took, Math.min(2000, Math.round(2500 * .1 / 50) * 50));
});

test('damage wears off when nobody hits you for a while', () => {
  const T = setup(), a = T.mk('Ayo', 0, 0, 0, 0), b = T.mk('Bisi', 0, 0, 1);
  T.adv(PVP.fresh + 1);
  for (let i = 0; i < 4; i++) { T.adv(400); T.pvp.hit(a, { i: b.p.id, k: 'heavy' }); }
  const p0 = T.last('Bisi', 'hurt').p; assert.ok(p0 >= 75);
  T.adv(PVP.rest + 20000); assert.ok(T.pvp.points(b) <= p0 - 70, 'it wore off');
  T.adv(400); T.pvp.hit(a, { i: b.p.id, k: 'jab' }); assert.ok(!T.last('Bisi', 'pko'));
});
