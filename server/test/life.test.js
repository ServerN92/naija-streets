// Everybody starts over (v6): every account's money becomes ₦1,000 (what they had is kept), and the life record is checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { lifeOk } from '../src/life.js';

test('the start-over: money to ₦1,000 for everybody, the old amount kept, a ledger line', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ns-life-')), 'a.db');
  let db = openDb(f);
  const a = db.addUser({ name: 'Rich', salt: Buffer.from('s'), hash: Buffer.from('h'), now: 1, cash: 900000 });
  const b = db.addUser({ name: 'Poor', salt: Buffer.from('s'), hash: Buffer.from('h'), now: 1, cash: 20 });
  db.raw.exec('DROP TABLE life; DROP TABLE before6; DROP TABLE before7; DROP TABLE bank; DROP TABLE bank_tx; PRAGMA user_version=5;'); db.close();   // as the database was before this version
  db = openDb(f);
  assert.equal(db.userById(a).cash, 1000); assert.equal(db.userById(b).cash, 1000);
  assert.equal(db.raw.prepare('SELECT cash FROM before6 WHERE uid=?').get(a).cash, 900000);
  const L = db.raw.prepare("SELECT d, bal FROM ledger WHERE uid=? AND k='start over'").get(a); assert.equal(L.d, -899000); assert.equal(L.bal, 1000);
  assert.equal(db.lifeGet(a), null);
  db.lifePut(a, lifeOk({ home: 'room', rent: 10 })); assert.equal(db.lifeGet(a).home, 'room');
  db.close();
});

test('the start-over takes back the businesses (v7): back on sale, kept in before7, the owner told once', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ns-life-')), 'b.db');
  let db = openDb(f);
  const a = db.addUser({ name: 'Owner', salt: Buffer.from('s'), hash: Buffer.from('h'), now: 1, cash: 1000 });
  db.bizPut({ id: 'buka1', kind: 'buka', owner: a, name: "Owner's Buka", d: { x: 1 }, till: 5000, bought: 7 });
  db.bizPut({ id: 'pos1', kind: 'pos', owner: a, name: 'Owner POS', d: { y: 2 }, till: 300, bought: 8 });
  db.bizPut({ id: 'cut1', kind: 'barber', owner: null, name: null, d: {}, till: 0, bought: null });
  db.raw.exec('DROP TABLE before7; DROP TABLE bank; DROP TABLE bank_tx; PRAGMA user_version=6;'); db.close();   // as the database was before this version
  db = openDb(f);
  for (const r of db.bizAll()) { assert.equal(r.owner, null); assert.equal(r.till, 0); }
  const k = db.raw.prepare('SELECT id, kind, owner, till FROM before7 ORDER BY id').all().map(r => ({ ...r }));
  assert.deepEqual(k, [{ id: 'buka1', kind: 'buka', owner: a, till: 5000 }, { id: 'pos1', kind: 'pos', owner: a, till: 300 }]);
  assert.deepEqual(db.lostBiz(a).sort(), ['buka', 'pos']); assert.deepEqual(db.lostBiz(a), []);   // told once
  db.close();
});

test('a life record is cleaned: unknown homes, bad clothes, numbers out of range', () => {
  assert.equal(lifeOk(null), null); assert.equal(lifeOk([1]), null); assert.equal(lifeOk('x'), null);
  const L = lifeOk({ home: 'palace', rent: -5, rented: 2.7, flat: 'yes', own: ['senator', 'senator', '<b>', 'x'], ease: -1, t: 1e15 }, 1000);
  assert.equal(L.home, 'tent'); assert.equal(L.rent, 0); assert.equal(L.rented, 2); assert.equal(L.flat, false);
  assert.deepEqual(L.own, ['rags', 'senator']); assert.equal(L.ease, 0); assert.ok(L.t <= 1000 + 864e5);
});

test('estate houses in the life record: good ids kept, bad ones dropped, home only where you own', () => {
  const L = lifeOk({ est: ['A07', 'A07', 'B27', 'E01', 'A28', 'A00', 5], estAll: ['C', 'Z', 'CC'], estHome: 'C14' });
  assert.deepEqual(L.est, ['A07', 'B27']); assert.deepEqual(L.estAll, ['C']); assert.equal(L.estHome, 'C14');
  assert.equal(lifeOk({ est: ['A07'], estHome: 'B01' }).estHome, '');
  assert.equal(lifeOk({ est: ['A07'], estHome: 'A07' }).estHome, 'A07');
  const N = lifeOk({}); assert.deepEqual(N.est, []); assert.deepEqual(N.estAll, []); assert.equal(N.estHome, '');
});
