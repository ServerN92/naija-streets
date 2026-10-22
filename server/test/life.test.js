// Everybody starts over (v6): every account's money becomes ₦1,000 (what they had is kept), and the life record is checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { lifeOk, jobRankOf, jobBadge } from '../src/life.js';

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

test('street cred: kept, cannot jump, a guest brings at most a little', async () => {
  const { credCap, CRED_GUEST, CRED_SLACK } = await import('../src/life.js');
  const d = lifeOk({ cr: 999999, cx: { play: 3, BAD: 1 }, cs: 4 }, 1000);
  assert.deepEqual(d.cx, { play: 3 }); assert.equal(d.cs, 4);
  assert.equal(credCap({ ...d }, null, 1000).cr, CRED_GUEST);
  const prev = { cr: 5000, st: 1000 };
  assert.equal(credCap(lifeOk({ cr: 999999 }, 1000), prev, 1000).cr, 5000 + CRED_SLACK);            // no time passed: only the slack
  assert.ok(credCap(lifeOk({ cr: 999999 }, 1000), prev, 1000 + 3600e3).cr <= 5000 + CRED_SLACK + 1500);   // an hour: at most 1500 more
  assert.equal(credCap(lifeOk({ cr: 10 }, 1000), prev, 2000).cr, 5000);                              // never goes down
});

test('life: where you left off, your hustle points and the oga badge are kept, cleaned', () => {
  const t = 1.8e12;
  const d = lifeOk({ job: 'okada', jp: { okada: 170.25, bad: 'x', 'NO': 3, water: -4, farmer: 5e9 }, pos: { x: 12.345, z: -99999, r: 9, t: t + 5e6, st: 7, car: 'y' }, kf: 30, seen: 1 }, t);
  assert.deepEqual(d.jp, { okada: 170.3, water: 0, farmer: 1e6 });
  assert.deepEqual(d.pos, { x: 12.3, z: -9000, r: 7, t: t + 60000, st: 5, car: 1 });
  assert.equal(d.kf, 9); assert.equal(d.seen, 1);
  assert.equal(lifeOk({ pos: { x: 'a', z: 1 } }, t).pos, null);
  assert.equal(jobRankOf({ okada: 170 }, 'okada'), 3); assert.equal(jobRankOf({}, 'okada'), 0);
  assert.equal(jobBadge(d), 'okada:3'); assert.equal(jobBadge({ job: 'police', jp: {} }), ''); assert.equal(jobBadge({ job: '' }), '');
});
