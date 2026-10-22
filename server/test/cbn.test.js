// The Central Bank on its own: fake players, a fake clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createCbn, CBN } from '../src/cbn.js';
import { cleanChat } from '../src/auth.js';

function setup() {
  const db = openDb(':memory:'); let t = Date.UTC(2026, 9, 22, 9, 0, 0);
  const sent = [], online = new Map(), stars = new Map();
  const mk = name => { const id = db.addUser({ name, salt: Buffer.alloc(16), hash: Buffer.alloc(32), now: t, cash: 0 }); const C = { user: { id, name }, cash: 0, ws: { open: true } }; online.set(id, C); return C; };
  const ctx = { online, send: (C, o) => sent.push([C.user.name, o]), err: (C, w, m) => sent.push([C.user.name, { t: 'err', w, m }]), ok: (C, w, m) => sent.push([C.user.name, { t: 'ok', w, m }]),
    give: (C, n) => { C.cash += n; }, clean: cleanChat, stars: uid => stars.get(uid) || 0 };
  const cbn = createCbn({ db, now: () => t, ctx });
  const last = (name, k) => [...sent].reverse().find(([n, o]) => n === name && (!k || o.t === k))?.[1];
  const meOf = name => last(name, 'cbnme').m;
  const LETTER = 'I want to serve Nigeria at the Central Bank. I am honest, I come to work on time, I understand money and the naira, and I will work hard with the team to keep our economy strong for everybody in Lagos.';
  const shift = C => { cbn.handle(C, { a: 'start' }); t += CBN.shiftMs + 1000; cbn.handle(C, { a: 'end' }); t += 864e5; };
  return { db, cbn, mk, last, meOf, LETTER, shift, stars, adv: ms => { t += ms; } };
}

test('with no Governor the Board reads the letters: a short one is rejected, a real one accepted; shifts pay and promote', () => {
  const T = setup(), ada = T.mk('Ada'), bayo = T.mk('Bayo');
  T.cbn.hello(ada); T.cbn.hello(bayo);
  T.cbn.handle(ada, { a: 'apply', letter: 'pls' }); assert.match(T.last('Ada', 'err').m, /at least/);
  T.cbn.handle(ada, { a: 'apply', letter: T.LETTER }); assert.match(T.last('Ada', 'ok').m, /Board/);
  T.cbn.handle(ada, { a: 'apply', letter: T.LETTER }); assert.match(T.last('Ada', 'err').m, /Wait for the answer/);
  T.cbn.handle(bayo, { a: 'apply', letter: 'Give me job now now now now now now now now now now now now now now now now now now now now now now.' });
  T.cbn.tick(); assert.equal(T.meOf('Ada').on, 0, 'the Board takes its time');
  T.adv(CBN.boardWait + 1000); T.cbn.tick();
  assert.equal(T.meOf('Ada').on, 1); assert.equal(T.meOf('Ada').title, 'Clerk'); assert.match(T.last('Ada', 'note').m, /ACCEPTED/);
  assert.equal(T.meOf('Bayo').on, 0); assert.match(T.last('Bayo', 'note').m, /not accepted/);
  T.cbn.handle(bayo, { a: 'apply', letter: T.LETTER }); assert.match(T.last('Bayo', 'err').m, /again in/);
  // a shift cut short pays nothing; a full one pays the Clerk's salary, once a day
  T.cbn.handle(ada, { a: 'start' }); T.adv(30e3); T.cbn.handle(ada, { a: 'end' }); assert.match(T.last('Ada', 'err').m, /before the shift was done/); assert.equal(ada.cash, 0);
  T.cbn.handle(ada, { a: 'start' }); T.adv(CBN.shiftMs + 1000); T.cbn.handle(ada, { a: 'end' }); assert.equal(ada.cash, 100000);
  T.cbn.handle(ada, { a: 'start' }); assert.match(T.last('Ada', 'err').m, /tomorrow/);
  T.adv(864e5); for (let i = 1; i < 5; i++) T.shift(ada);
  assert.equal(T.meOf('Ada').title, 'Officer'); assert.equal(T.meOf('Ada').shifts, 5);
});

test('the climb to Governor: Director needs approval; the Governor then reads the letters and writes a message', () => {
  const T = setup(), ada = T.mk('Ada'), chi = T.mk('Chi');
  T.cbn.hello(ada); T.cbn.handle(ada, { a: 'apply', letter: T.LETTER }); T.adv(CBN.boardWait + 1000); T.cbn.tick();
  for (let i = 0; i < 50; i++) T.shift(ada);
  assert.equal(T.meOf('Ada').title, 'Assistant Director', 'Director waits for approval');
  T.adv(CBN.boardWait + 1000); T.cbn.tick(); assert.equal(T.meOf('Ada').title, 'Director');
  for (let i = 50; i < 70; i++) T.shift(ada); T.adv(CBN.boardWait + 1000); T.cbn.tick(); assert.equal(T.meOf('Ada').title, 'Deputy Governor');
  for (let i = 70; i < 100; i++) T.shift(ada); T.adv(CBN.boardWait + 1000); T.cbn.tick();
  assert.equal(T.meOf('Ada').title, 'Governor'); assert.equal(T.meOf('Ada').isGov, true);
  const c0 = ada.cash; T.shift(ada); assert.equal(ada.cash - c0, 1000000, 'the best-paid job in the game');
  // now Chi's letter waits for the Governor, not the Board
  T.cbn.hello(chi); T.cbn.handle(chi, { a: 'apply', letter: T.LETTER }); assert.match(T.last('Chi', 'ok').m, /Governor/);
  T.adv(CBN.boardWait * 3); T.cbn.tick(); assert.equal(T.meOf('Chi').on, 0);
  T.cbn.hello(ada); const Q = T.meOf('Ada').queue; assert.equal(Q.length, 1); assert.equal(Q[0].n, 'Chi');
  T.cbn.handle(chi, { a: 'decide', id: Q[0].id, yes: true }); assert.match(T.last('Chi', 'err').m, /Only the Governor/);
  T.cbn.handle(ada, { a: 'decide', id: Q[0].id, yes: false, msg: 'Try again with more detail about your skills.' });
  assert.match(T.last('Chi', 'note').m, /not accepted by Governor Ada.*more detail/);
  assert.equal(T.meOf('Chi').apps[0].msg, 'Try again with more detail about your skills.');
});

test('wanted players cannot apply', () => {
  const T = setup(), w = T.mk('Wale'); T.stars.set(w.user.id, 2); T.cbn.hello(w);
  T.cbn.handle(w, { a: 'apply', letter: T.LETTER }); assert.match(T.last('Wale', 'err').m, /police/);
});
