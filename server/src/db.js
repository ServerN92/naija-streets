// The players' accounts, kept in one SQLite file (on the Fly volume at /data). Node's own sqlite: nothing to install.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = [
  // v1: accounts, sign-ins, password reset codes, and a money log
  `CREATE TABLE users(
     id INTEGER PRIMARY KEY, name TEXT NOT NULL, lname TEXT NOT NULL UNIQUE,
     salt BLOB NOT NULL, hash BLOB NOT NULL, email TEXT,
     created INTEGER NOT NULL, seen INTEGER NOT NULL,
     cash INTEGER NOT NULL DEFAULT 0, look TEXT, banned INTEGER NOT NULL DEFAULT 0, data TEXT);
   CREATE TABLE sessions(th BLOB PRIMARY KEY, uid INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created INTEGER NOT NULL, seen INTEGER NOT NULL);
   CREATE INDEX sessions_uid ON sessions(uid);
   CREATE TABLE resets(uid INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     ch BLOB NOT NULL, exp INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE ledger(id INTEGER PRIMARY KEY, uid INTEGER NOT NULL, t INTEGER NOT NULL,
     d INTEGER NOT NULL, held INTEGER NOT NULL DEFAULT 0, bal INTEGER NOT NULL, k TEXT);
   CREATE INDEX ledger_uid ON ledger(uid, t);`,
  // v2: businesses players own (a buka, later the barber, the POS stand, the farm)
  `CREATE TABLE biz(id TEXT PRIMARY KEY, kind TEXT NOT NULL, owner INTEGER REFERENCES users(id) ON DELETE SET NULL,
     name TEXT, data TEXT NOT NULL, till INTEGER NOT NULL DEFAULT 0, bought INTEGER, saved INTEGER);
   CREATE INDEX biz_owner ON biz(owner);`,
  // v3: the produce market (farmers sell to bukas) and produce waiting to go back to a farmer's store
  `CREATE TABLE market(id INTEGER PRIMARY KEY, seller INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, sname TEXT NOT NULL,
     crop TEXT NOT NULL, qty INTEGER NOT NULL, price INTEGER NOT NULL, t INTEGER NOT NULL);
   CREATE TABLE mkback(id INTEGER PRIMARY KEY, uid INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, crop TEXT NOT NULL, qty INTEGER NOT NULL);`,
  // v4: the motor park union: the park (its chairman, ticket, crew) and its members (respect, tickets)
  `CREATE TABLE park(id TEXT PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE park_m(uid INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, park TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(uid, park));`,
  // v5: the police: who is in the force, their arrests and rank, suspensions
  `CREATE TABLE law(uid INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL);`,
  // v6: everybody starts over, from under the bridge: ₦1,000 in the pocket (what each one had is kept in before6), and a
  // life record (where you sleep, rent, the clothes you own) that the game fills in
  `CREATE TABLE life(uid INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL);
   CREATE TABLE before6(uid INTEGER PRIMARY KEY, cash INTEGER NOT NULL, t INTEGER NOT NULL);
   INSERT INTO before6(uid, cash, t) SELECT id, cash, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM users;
   INSERT INTO ledger(uid, t, d, held, bal, k) SELECT id, CAST(strftime('%s','now') AS INTEGER) * 1000, 1000 - cash, 0, 1000, 'start over' FROM users;
   UPDATE users SET cash = 1000;`,
  // v7: the start over takes back the businesses too: every buka, salon and POS stand goes back on sale (what each was,
  // with its till, is kept in before7; its owner is told once, next time they sign in)
  `CREATE TABLE before7(id TEXT PRIMARY KEY, kind TEXT NOT NULL, owner INTEGER NOT NULL, name TEXT, data TEXT NOT NULL,
     till INTEGER NOT NULL, bought INTEGER, t INTEGER NOT NULL, told INTEGER NOT NULL DEFAULT 0);
   INSERT INTO before7(id, kind, owner, name, data, till, bought, t)
     SELECT id, kind, owner, name, data, till, bought, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM biz WHERE owner IS NOT NULL;
   UPDATE biz SET owner = NULL, name = NULL, till = 0, bought = NULL;`,
  // v8: the banks: each player's account (which bank, a 10-digit number) and the transfers between players
  `CREATE TABLE bank(uid INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, bank TEXT NOT NULL, acct TEXT NOT NULL UNIQUE, t INTEGER NOT NULL);
   CREATE TABLE bank_tx(id INTEGER PRIMARY KEY, t INTEGER NOT NULL, src INTEGER NOT NULL, dst INTEGER NOT NULL, n INTEGER NOT NULL,
     fee INTEGER NOT NULL DEFAULT 0, note TEXT, q TEXT);
   CREATE INDEX bank_tx_src ON bank_tx(src, t);
   CREATE INDEX bank_tx_dst ON bank_tx(dst, t);
   CREATE UNIQUE INDEX bank_tx_q ON bank_tx(src, q);`,
];

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
  let v = db.prepare('PRAGMA user_version').get().user_version;
  while (v < SCHEMA.length) {
    db.exec('BEGIN'); db.exec(SCHEMA[v]); v++; db.exec(`PRAGMA user_version=${v}`); db.exec('COMMIT');
  }
  const q = s => db.prepare(s);
  const S = {
    byName: q('SELECT * FROM users WHERE lname=?'),
    byId: q('SELECT * FROM users WHERE id=?'),
    addUser: q('INSERT INTO users(name,lname,salt,hash,email,created,seen,cash,look) VALUES(?,?,?,?,?,?,?,?,?)'),
    setPass: q('UPDATE users SET salt=?, hash=? WHERE id=?'),
    setEmail: q('UPDATE users SET email=? WHERE id=?'),
    setLook: q('UPDATE users SET look=? WHERE id=?'),
    setCash: q('UPDATE users SET cash=?, seen=? WHERE id=?'),
    seen: q('UPDATE users SET seen=? WHERE id=?'),
    count: q('SELECT COUNT(*) n FROM users'),
    addSess: q('INSERT INTO sessions(th,uid,created,seen) VALUES(?,?,?,?)'),
    sess: q('SELECT s.seen AS sseen, u.* FROM sessions s JOIN users u ON u.id=s.uid WHERE s.th=?'),
    touchSess: q('UPDATE sessions SET seen=? WHERE th=?'),
    dropSess: q('DELETE FROM sessions WHERE th=?'),
    dropAllSess: q('DELETE FROM sessions WHERE uid=?'),
    oldSess: q('DELETE FROM sessions WHERE seen<?'),
    userSess: q('SELECT th FROM sessions WHERE uid=? ORDER BY seen DESC'),
    setReset: q('INSERT INTO resets(uid,ch,exp,tries) VALUES(?,?,?,0) ON CONFLICT(uid) DO UPDATE SET ch=excluded.ch, exp=excluded.exp, tries=0'),
    reset: q('SELECT * FROM resets WHERE uid=?'),
    tryReset: q('UPDATE resets SET tries=tries+1 WHERE uid=?'),
    dropReset: q('DELETE FROM resets WHERE uid=?'),
    log: q('INSERT INTO ledger(uid,t,d,held,bal,k) VALUES(?,?,?,?,?,?)'),
    bizAll: q('SELECT b.*, u.name AS oname FROM biz b LEFT JOIN users u ON u.id=b.owner'),
    mkAll: q('SELECT * FROM market ORDER BY id'),
    mkAdd: q('INSERT INTO market(seller,sname,crop,qty,price,t) VALUES(?,?,?,?,?,?)'),
    mkQty: q('UPDATE market SET qty=? WHERE id=?'),
    mkDel: q('DELETE FROM market WHERE id=?'),
    backAdd: q('INSERT INTO mkback(uid,crop,qty) VALUES(?,?,?)'),
    backOf: q('SELECT * FROM mkback WHERE uid=?'),
    backDel: q('DELETE FROM mkback WHERE uid=?'),
    lawGet: q('SELECT * FROM law WHERE uid=?'),
    lawPut: q('INSERT INTO law(uid,data) VALUES(?,?) ON CONFLICT(uid) DO UPDATE SET data=excluded.data'),
    lostOf: q('SELECT kind FROM before7 WHERE owner=? AND told=0'),
    lostTold: q('UPDATE before7 SET told=1 WHERE owner=?'),
    lifeGet: q('SELECT data FROM life WHERE uid=?'),
    lifePut: q('INSERT INTO life(uid,data) VALUES(?,?) ON CONFLICT(uid) DO UPDATE SET data=excluded.data'),
    parkGet: q('SELECT * FROM park WHERE id=?'),
    parkPut: q('INSERT INTO park(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data'),
    pmAll: q('SELECT m.uid, m.data, u.name FROM park_m m JOIN users u ON u.id=m.uid WHERE m.park=?'),
    pmPut: q('INSERT INTO park_m(uid,park,data) VALUES(?,?,?) ON CONFLICT(uid,park) DO UPDATE SET data=excluded.data'),
    bankTx: q('INSERT INTO bank_tx(t,src,dst,n,fee,note,q) VALUES(?,?,?,?,0,?,?) ON CONFLICT(src,q) DO NOTHING'),
    bizPut: q('INSERT INTO biz(id,kind,owner,name,data,till,bought,saved) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, owner=excluded.owner, name=excluded.name, data=excluded.data, till=excluded.till, bought=excluded.bought, saved=excluded.saved'),
  };
  return {
    raw: db,
    user: name => S.byName.get(String(name).toLowerCase()) || null,
    userById: id => S.byId.get(id) || null,
    addUser(u) {
      const r = S.addUser.run(u.name, u.name.toLowerCase(), u.salt, u.hash, u.email || null, u.now, u.now, u.cash | 0, u.look || null);
      return Number(r.lastInsertRowid);
    },
    setPass: (id, salt, hash) => S.setPass.run(salt, hash, id),
    setEmail: (id, e) => S.setEmail.run(e || null, id),
    setLook: (id, look) => S.setLook.run(look, id),
    setCash: (id, cash, now) => S.setCash.run(cash, now, id),
    seen: (id, now) => S.seen.run(now, id),
    users: () => S.count.get().n,
    addSession: (th, uid, now) => {
      S.addSess.run(th, uid, now, now);
      const all = S.userSess.all(uid);   // up to 5 phones at once; the oldest sign-in goes
      for (const s of all.slice(5)) S.dropSess.run(s.th);
    },
    session: th => S.sess.get(th) || null,
    touchSession: (th, now) => S.touchSess.run(now, th),
    dropSession: th => S.dropSess.run(th),
    dropSessions: uid => S.dropAllSess.run(uid),
    pruneSessions: before => S.oldSess.run(before),
    setReset: (uid, ch, exp) => S.setReset.run(uid, ch, exp),
    reset: uid => S.reset.get(uid) || null,
    tryReset: uid => S.tryReset.run(uid),
    dropReset: uid => S.dropReset.run(uid),
    log: (uid, t, d, held, bal, k) => S.log.run(uid, t, d, held, bal, k || null),
    bizAll: () => S.bizAll.all(),
    bizPut: b => S.bizPut.run(b.id, b.kind, b.owner || null, b.name || null, JSON.stringify(b.d), b.till | 0, b.bought || null, Date.now()),
    mkAll: () => S.mkAll.all(),
    mkAdd: (seller, sname, crop, qty, price, t) => Number(S.mkAdd.run(seller, sname, crop, qty, price, t).lastInsertRowid),
    mkQty: (id, qty) => S.mkQty.run(qty, id),
    mkDel: id => S.mkDel.run(id),
    backAdd: (uid, crop, qty) => S.backAdd.run(uid, crop, qty),
    backTake: uid => { const r = S.backOf.all(uid); if (r.length) S.backDel.run(uid); return r; },
    lawGet: uid => S.lawGet.get(uid) || null,
    lawPut: (uid, data) => S.lawPut.run(uid, data),
    lostBiz: uid => { const r = S.lostOf.all(uid); if (r.length) S.lostTold.run(uid); return r.map(x => x.kind); },   // once
    lifeGet: uid => { const r = S.lifeGet.get(uid); if (!r) return null; try { return JSON.parse(r.data); } catch (e) { return null; } },
    lifePut: (uid, d) => S.lifePut.run(uid, JSON.stringify(d)),
    parkGet: id => S.parkGet.get(id) || null,
    parkPut: (id, data) => S.parkPut.run(id, data),
    pmAll: park => S.pmAll.all(park),
    pmPut: (uid, park, data) => S.pmPut.run(uid, park, data),
    bankTx: (t, src, dst, n, note, q) => S.bankTx.run(t, src, dst, n, note || null, q || null),   // a line on both bank histories (money the server moved itself)
    tx(fn) { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } },
    // a clean copy of the whole database (safe while the game runs); yesterday's copies past `keep` are removed
    backup(dir, keep = 7) {
      if (file === ':memory:') return null;
      fs.mkdirSync(dir, { recursive: true });
      const name = 'naija-' + new Date().toISOString().slice(0, 10) + '.db', out = path.join(dir, name);
      try { fs.unlinkSync(out); } catch (e) { /* none yet today */ }
      db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
      const old = fs.readdirSync(dir).filter(f => /^naija-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -keep);
      for (const f of old) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* ignore */ } }
      return out;
    },
    // the player asked to go: the account and everything that is only theirs; businesses go back on sale
    deleteUser(uid) {
      db.exec('BEGIN');
      try {
        for (const t of ['ledger', 'before6', 'mkback', 'park_m', 'law', 'life', 'bank', 'sessions', 'resets']) db.prepare(`DELETE FROM ${t} WHERE uid=?`).run(uid);
        db.prepare('DELETE FROM market WHERE seller=?').run(uid);
        db.prepare('DELETE FROM before7 WHERE owner=?').run(uid);
        db.prepare('UPDATE biz SET owner=NULL, name=NULL, till=0, bought=NULL WHERE owner=?').run(uid);
        db.prepare('DELETE FROM users WHERE id=?').run(uid);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    close: () => db.close(),
  };
}
