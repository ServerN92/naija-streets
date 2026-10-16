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
    close: () => db.close(),
  };
}
