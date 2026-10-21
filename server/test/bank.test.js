// The banks: account numbers, name enquiry, transfers (fees, limits, the same send twice), credit alerts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createBank, BANKS, validAcct, checkDigit, feeOf, RULES } from '../src/bank.js';

function setup(seed = 7) {
  const db = openDb(':memory:');
  let t = Date.UTC(2026, 9, 20, 12, 0, 0);
  let s = seed; const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const sent = [], online = new Map();
  const mk = (name, cash, on = true) => {
    const id = db.addUser({ name, salt: Buffer.alloc(16), hash: Buffer.alloc(32), now: t, cash });
    const C = { user: { id, name }, cash, ws: { open: true } }; if (on) online.set(id, C); return C;
  };
  const ctx = {
    online, send: (C, o) => sent.push([C.user.name, o]), err: (C, w, m) => sent.push([C.user.name, { t: 'err', w, m }]), ok: (C, w, m) => sent.push([C.user.name, { t: 'ok', w, m }]),
    spend: (C, n) => { if (C.cash < n) return false; C.cash -= n; db.setCash(C.user.id, C.cash, t); return true; },
    credit: (uid, n, why, note) => { const C = online.get(uid); if (C) { C.cash += n; if (note) sent.push([C.user.name, { t: 'note', m: note }]); } else { const u = db.userById(uid); db.setCash(uid, u.cash + n, t); } },
  };
  const last = (name, k) => [...sent].reverse().find(([n, o]) => n === name && (!k || o.t === k))?.[1];
  return { db, mk, sent, last, ctx, rand, now: () => t, adv: s2 => { t += s2 * 1000; }, bank: () => createBank({ db, now: () => t, rand, ctx }) };
}

test('check digit: the right number at the right bank, a typo or the wrong bank is caught', () => {
  const serial = '123456789', a = serial + checkDigit(BANKS.gidi.code, serial);
  assert.equal(validAcct('gidi', a), true);
  assert.equal(validAcct('gidi', a.slice(0, 9) + ((+a[9] + 1) % 10)), false);
  assert.equal(validAcct('gidi', '12345678'), false);
  assert.equal(feeOf(5000, false), 10); assert.equal(feeOf(5001, false), 25); assert.equal(feeOf(60000, false), 50); assert.equal(feeOf(60000, true), 0);
});

test('everybody gets an account: the ones already playing at start, new ones when they first sign in; numbers are unique', () => {
  const T = setup(); const old = [T.mk('Ada', 5000), T.mk('Tunde', 5000), T.mk('Bisi', 5000)];
  const B = T.bank(); const accts = old.map(C => B.account(C.user.id));
  for (const a of accts) { assert.match(a.acct, /^\d{10}$/); assert.ok(BANKS[a.bank]); assert.equal(validAcct(a.bank, a.acct), true); }
  assert.equal(new Set(accts.map(a => a.acct)).size, 3);
  const nw = T.mk('Kemi', 1000); B.hello(nw); const h = T.last('Kemi', 'bk');
  assert.equal(h.me.name, 'Kemi'); assert.match(h.me.acct, /^\d{10}$/); assert.equal(Object.keys(h.banks).length, 3); assert.deepEqual(h.hist, []);
  B.hello(nw); assert.equal(T.last('Kemi', 'bk').me.acct, h.me.acct);   // the same account every time
  // many players: all different numbers
  const all = new Set(accts.map(a => a.acct).concat(h.me.acct)); for (let i = 0; i < 300; i++) { const C = T.mk('P' + i, 0, false); all.add(B.account(C.user.id).acct); } assert.equal(all.size, 304);
});

test('name enquiry, then a transfer: the money moves, the fee, the credit alert, both histories', () => {
  const T = setup(), ada = T.mk('Ada', 100000), tunde = T.mk('Tunde', 2000); const B = T.bank();
  const A = B.account(ada.user.id), Tn = B.account(tunde.user.id);
  B.handle(ada, { a: 'name', acct: Tn.acct, bank: Tn.bank }); assert.equal(T.last('Ada', 'bkname').name, 'Tunde');
  const other = Object.keys(BANKS).find(k => k !== Tn.bank);
  B.handle(ada, { a: 'name', acct: Tn.acct, bank: other }); assert.equal(T.last('Ada', 'bkname').name, null);   // the wrong bank: not found
  B.handle(ada, { a: 'name', acct: '0000000000', bank: Tn.bank }); assert.equal(T.last('Ada', 'bkname').name, null);
  const fee = feeOf(25000, A.bank === Tn.bank);
  B.handle(ada, { a: 'send', acct: Tn.acct, bank: Tn.bank, n: 25000, note: 'for the buka', q: 'q-0001' });
  assert.equal(ada.cash, 100000 - 25000 - fee); assert.equal(tunde.cash, 2000 + 25000);
  const s = T.last('Ada', 'bksent'); assert.equal(s.tx.d, -25000); assert.equal(s.tx.fee, fee); assert.equal(s.tx.who, 'Tunde'); assert.equal(s.tx.note, 'for the buka');
  assert.match(T.last('Tunde', 'note').m, /Credit alert! ₦25,000 from Ada/);
  assert.equal(T.last('Tunde', 'bktx').tx.d, 25000); assert.equal(T.last('Tunde', 'bktx').tx.who, 'Ada');
  // the same send again (the line dropped and the phone sent it again): nothing moves twice
  B.handle(ada, { a: 'send', acct: Tn.acct, bank: Tn.bank, n: 25000, q: 'q-0001' }); assert.equal(ada.cash, 100000 - 25000 - fee); assert.equal(T.last('Ada', 'bksent').again, 1);
  B.hello(tunde); assert.equal(T.last('Tunde', 'bk').hist[0].d, 25000);
  B.hello(ada); assert.equal(T.last('Ada', 'bk').hist[0].d, -25000);
});

test('transfers that must fail: too little, too much, no money, your own account, offline friend still gets it', () => {
  const T = setup(), ada = T.mk('Ada', 3000), bayo = T.mk('Bayo', 0, false); const B = T.bank();
  const A = B.account(ada.user.id), By = B.account(bayo.user.id);
  B.handle(ada, { a: 'send', acct: By.acct, bank: By.bank, n: 50 }); assert.match(T.last('Ada', 'err').m, /between/);
  B.handle(ada, { a: 'send', acct: By.acct, bank: By.bank, n: RULES.most + 1 }); assert.match(T.last('Ada', 'err').m, /between/);
  B.handle(ada, { a: 'send', acct: By.acct, bank: By.bank, n: 3000 }); if (A.bank !== By.bank) assert.match(T.last('Ada', 'err').m, /Insufficient/);
  B.handle(ada, { a: 'send', acct: A.acct, bank: A.bank, n: 500 }); assert.match(T.last('Ada', 'err').m, /your own/);
  B.handle(ada, { a: 'send', acct: By.acct, bank: By.bank, n: 1000 }); assert.equal(ada.cash, 3000 - 1000 - feeOf(1000, A.bank === By.bank));
  assert.equal(T.db.userById(bayo.user.id).cash, 1000);   // Bayo was not online: it is in his account for when he comes
});

test('limits: 20 sends an hour, ₦1,000,000 a day', () => {
  const T = setup(), ada = T.mk('Ada', 5000000), tunde = T.mk('Tunde', 0); const B = T.bank(); B.account(ada.user.id); const Tn = B.account(tunde.user.id);
  for (let i = 0; i < 20; i++) B.handle(ada, { a: 'send', acct: Tn.acct, bank: Tn.bank, n: 1000 });
  B.handle(ada, { a: 'send', acct: Tn.acct, bank: Tn.bank, n: 1000 }); assert.match(T.last('Ada', 'err').m, /this hour/);
  T.adv(3700); for (let i = 0; i < 5; i++) B.handle(ada, { a: 'send', acct: Tn.acct, bank: Tn.bank, n: 200000 });
  assert.match(T.last('Ada', 'err').m, /daily limit/); assert.equal(tunde.cash, 20 * 1000 + 4 * 200000);
});

test('the union returns show on both histories and do not count against your own sends', () => {
  const T = setup(), boy = T.mk('Boy', 500000), oga = T.mk('Oga', 0); const B = T.bank(); B.account(boy.user.id); const O = B.account(oga.user.id);
  T.db.bankTx(T.now(), boy.user.id, oga.user.id, 2000, 'Street tickets ×20 (oga\'s half)', 'union:1');
  T.db.bankTx(T.now(), boy.user.id, oga.user.id, 2000, 'again', 'union:1');   // the same day again: one line
  B.hello(oga); const h = T.last('Oga', 'bk').hist; assert.equal(h.length, 1); assert.equal(h[0].d, 2000); assert.equal(h[0].who, 'Boy');
  B.hello(boy); assert.equal(T.last('Boy', 'bk').hist[0].d, -2000);
  for (let i = 0; i < 20; i++) B.handle(boy, { a: 'send', acct: O.acct, bank: O.bank, n: 100 });
  assert.equal(T.last('Boy', 'bksent').tx.d, -100); assert.equal(T.sent.filter(([n, o]) => n === 'Boy' && o.t === 'bksent').length, 20);
});
