// Lagos online: who is signed in, where everyone is, what they say, and their money.
// The server decides the money and the accounts. Positions come from each phone (checked for sense) and go out
// ten times a second, only to the people near enough to see them, and only when something changed.
import { createBiz } from './biz.js';
import { createPark } from './park.js';
import { createPvp } from './pvp.js';
import { createLaw } from './law.js';
import { createBank } from './bank.js';
import { createCbn } from './cbn.js';
import { createLove, LOVE } from './love.js';
import { createYahoo } from './yahoo.js';
import { createPolitics, POL } from './politics.js';
import { lifeOk, credCap, rankOf, jobBadge } from './life.js';
import { hashPass, checkPass, newToken, tokenHash, codeHash, newCode, checkName, checkPassText, checkEmail, cleanChat, Bucket, Limits } from './auth.js';

export const PROTO = 1;
const TICK = 100;                 // ms between world updates
const SEE = 160, CELL = 160;      // you see people this far away (m); grid cell size
const MAX_SEEN = 30;              // the nearest 30 at most
const NEAR_CHAT = 60;             // "near" chat reaches this far (m)
const START_MAX = 50000;          // money you can bring from playing as a guest, when you make an account
const START_CASH = 5000;          // what a new life starts with (under the bridge)
const EARN_CAP = 250000, EARN_RATE = 150;   // money from the game itself: ₦250k at once, then ₦150 a second (₦540k an hour)
const SESSION_DAYS = 90;
const LOOK_IDS = /^p_[a-z]{2,10}$/;
const r2 = n => Math.round(n * 100) / 100, r3 = n => Math.round(n * 1000) / 1000;
const num = (v, lim) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;

export function createWorld({ db, mail, now = () => Date.now(), log = () => {}, regPerHour = 20 }) {
  const conns = new Set();
  const online = new Map();       // account id -> connection
  const L = {
    ipReg: new Limits(regPerHour, regPerHour / 3600),   // new accounts an hour from one address (many phones share one address in Nigeria)
    ipLogin: new Limits(60, 60 / 600),       // 60 tries / 10 min from one address
    nameLogin: new Limits(8, 8 / 900),       // 8 tries / 15 min at one username
    ipForgot: new Limits(10, 10 / 3600),
    ipHi: new Limits(60, 3),
  };
  let nextId = 1, lastCount = -1;

  // money the server itself moves (a business bought, the till collected): saved at once, the phone told at once
  function spend(C, n, why) {
    if (!C.user || !(n > 0) || C.cash < n) return false;
    C.cash -= n; const t = now(); db.setCash(C.user.id, C.cash, t); db.log(C.user.id, t, -n, 0, C.cash, why);
    send(C, { t: '$', n: C.cash, s: C.cseq }); return true;
  }
  function give(C, n, why) {
    if (!C.user || !(n > 0)) return;
    C.cash += n; const t = now(); db.setCash(C.user.id, C.cash, t); db.log(C.user.id, t, n, 0, C.cash, why);
    send(C, { t: '$', n: C.cash, s: C.cseq });
  }
  // money that arrives for a player (sent through a POS): straight to them if they are online, else into their account
  function credit(uid, n, why, note) {
    const C = online.get(uid);
    if (C && C.user) { give(C, n, why); if (note) send(C, { t: 'note', m: note }); return; }
    const u = db.userById(uid); if (!u) return; const t = now(); db.setCash(uid, (u.cash | 0) + n, t); db.log(uid, t, n, 0, (u.cash | 0) + n, why);
  }
  const findUser = name => { const u = db.user(String(name || '')); return u && !u.banned ? { id: u.id, name: u.name } : null; };
  const note = (uid, m) => { const C = online.get(uid); if (C && C.user) send(C, { t: 'note', m }); };
  const biz = createBiz({ db, now, log, ctx: { online, send: (C, o) => send(C, o), err: (C, w, m) => err(C, w, m), ok: (C, w, m) => ok(C, w, m), spend, give, credit, findUser } });
  // the park union: a badge on your name (agbero, chairman) that the people near you see
  // (on duty, the police uniform: 'p'; else the union's vest: 'a', or the chairman's: 'c')
  const badgeOf = uid => { const C = online.get(uid); return C && law.onDuty(C) ? 'p' : park.badge(uid); };
  const badge = uid => { const C = online.get(uid); if (!C || !C.p) return; const b = badgeOf(uid); if (C.p.bd !== b) { C.p.bd = b; C.p.lv++; C.p.ver++; } };
  const park = createPark({ db, now, log, ctx: { online, send: (C, o) => send(C, o), err: (C, w, m) => err(C, w, m), ok: (C, w, m) => ok(C, w, m), spend, give, credit, note, badge,
    bankTx: (src, dst, n, why, q) => db.bankTx(now(), src, dst, n, why, q), bankRefresh: uid => { const C = online.get(uid); if (C && C.user) bank.hello(C); } } });
  // players fighting players: the server decides the blows and the knock-outs
  // the police: stars, the force, arrests
  const law = createLaw({ db, now, log, ctx: { online, send: (C, o) => send(C, o), err: (C, w, m) => err(C, w, m), ok: (C, w, m) => ok(C, w, m), give, spend, badge } });
  // the banks: an account number for everyone, transfers between players
  const bank = createBank({ db, now, log, ctx: { online, send: (C, o) => send(C, o), err: (C, w, m) => err(C, w, m), ok: (C, w, m) => ok(C, w, m), spend, credit, clean: cleanChat } });
  // the Central Bank: applications, the Governor, shifts and ranks
  const cbn = createCbn({ db, now, log, ctx: { online, send: (C, o) => send(C, o), err: (C, w, m) => err(C, w, m), ok: (C, w, m) => ok(C, w, m), give, clean: cleanChat,
    stars: uid => { const C = online.get(uid); return C && C.user ? law.stars(C) : 0; } } });
  const love = createLove({ db, now, log, ctx: { online, send: (C, o) => send(C, o), err: (C, w, m) => err(C, w, m), ok: (C, w, m) => ok(C, w, m) } });
  const yahoo = createYahoo({ db, now, log, ctx: { online, send: (C, o) => send(C, o), err: (C, w, m) => err(C, w, m), ok: (C, w, m) => ok(C, w, m), spend, give, byName: n => { for (const D of online.values()) if (D.user && D.user.name.toLowerCase() === String(n || '').toLowerCase()) return D; return null; } } });
  const politics = createPolitics({ db, now, log, ctx: { online, send: (C, o) => send(C, o), err: (C, w, m) => err(C, w, m), ok: (C, w, m) => ok(C, w, m), spend, credit, broadcast: o => { const s = JSON.stringify(o); for (const D of online.values()) if (D.ws.open) D.ws.send(s); } } });
  const pvp = createPvp({ now, log, ctx: { online, send: (C, o) => send(C, o), spend, give, onKo: (A, D) => { park.pvpKo(A, D); law.ko(A, D); }, onHit: (A, D) => law.hit(A, D), noRob: A => law.noRob(A) } });

  const send = (C, o) => { if (C.ws.open) C.ws.send(JSON.stringify(o)); };
  const err = (C, w, m) => send(C, { t: 'err', w, m });
  const ok = (C, w, m) => send(C, { t: 'ok', w, m });

  function maskEmail(e) { if (!e) return ''; const [a, b] = e.split('@'); return (a.length <= 2 ? a[0] + '*' : a.slice(0, 2) + '*'.repeat(Math.min(6, a.length - 2))) + '@' + b; }
  function parseLook(s) { try { const o = typeof s === 'string' ? JSON.parse(s) : s; if (!o || typeof o !== 'object') return null; return lookOk(o); } catch (e) { return null; } }
  function lookOk(o) {
    if (!o || typeof o !== 'object') return null;
    const c = LOOK_IDS.test(o.c) ? o.c : null, f = Number.isInteger(o.f) && o.f >= -1 && o.f < 16 ? o.f : 0, g = o.g === 'f' ? 'f' : 'm';
    const k = Number.isInteger(o.k) && o.k >= 0 && o.k < 7 ? o.k : -1;   // skin tone (-1: the person's own)
    return c ? { c, f, g, k } : null;
  }

  // ---- signing in
  async function signIn(C, u, tok) {
    if (!C.ws.open) return;   // the line went while the password was checked
    const t = now();
    if (!tok) { tok = newToken(); db.addSession(tokenHash(tok), u.id, t); }
    const old = online.get(u.id);
    if (old && old !== C) { send(old, { t: 'kick', m: 'You signed in on another phone or tab.' }); leaveWorld(old); old.ws.close(4001, 'signed in elsewhere'); }
    if (C.user && C.user.id !== u.id) leaveWorld(C);
    C.user = { id: u.id, name: u.name, email: u.email || '' };
    const fresh = db.userById(u.id) || u;   // read again: the phone that was just signed out has saved its money by now
    C.cash = fresh.cash | 0; C.dsum = 0; C.held = 0; C.dirty = false; C.earn = new Bucket(EARN_CAP, EARN_RATE); C.cseq = 0;
    C.tok = tok; C.th = tokenHash(tok);
    online.set(u.id, C);
    const look = parseLook(u.look);
    C.p = { id: nextId++, name: u.name, look, lv: 0, x: 0, y: 0, z: 0, r: 0, a: 'i', s: 0, v: '', vc: '', q: 0, h: 1, ver: 0, has: false, bd: park.badge(u.id), rk: 0 };
    C.seen = new Map();
    db.seen(u.id, t);
    const life = db.lifeGet(u.id);
    if (life) { C.p.rk = rankOf(life.cr); C.p.jb = jobBadge(life); C.p.sm = life.dirt >= 1 ? 1 : 0; }
    send(C, { t: 'me', tok, id: C.p.id, uid: u.id, name: u.name, cash: C.cash, email: maskEmail(u.email), look, life, n: online.size });
    biz.hello(C); park.hello(C); pvp.hello(C); law.hello(C); bank.hello(C); cbn.hello(C); love.hello(C); yahoo.hello(C); politics.hello(C);
    log('in', u.name, online.size);
  }
  function leaveWorld(C) {
    if (!C.user) return;
    flushCash(C);
    if (online.get(C.user.id) === C) online.delete(C.user.id);
    C.user = null; C.p = null; C.seen = null;
  }

  async function register(C, m) {
    if (!L.ipReg.take(C.ip)) return err(C, 'reg', 'Too many new accounts from here. Try again later.');
    const [name, e1] = checkName(m.u); if (e1) return err(C, 'reg', e1);
    const e2 = checkPassText(m.p, name); if (e2) return err(C, 'reg', e2);
    const [email, e3] = checkEmail(m.e); if (e3) return err(C, 'reg', e3);
    if (db.user(name)) return err(C, 'reg', 'That username is taken. Try another one.');
    const { salt, hash } = await hashPass(m.p);
    if (db.user(name)) return err(C, 'reg', 'That username is taken. Try another one.');
    const life = credCap(lifeOk(m.life, now()), null, now());   // the life you lived as a guest comes with you (and the money, up to a limit)
    const cash = life ? Math.max(0, Math.min(START_MAX, Math.floor(+m.cash || 0))) : START_CASH;
    const look = lookOk(m.look);
    const id = db.addUser({ name, salt, hash, email, now: now(), cash, look: look ? JSON.stringify(look) : null });
    db.log(id, now(), cash, 0, cash, 'start');
    if (life) db.lifePut(id, life);
    if (m.dob) love.setDob(id, m.dob);   // only the day they turn 18 is kept
    log('new account', name);
    await signIn(C, db.userById(id));
  }
  async function login(C, m) {
    const key = String(m.u || '').toLowerCase().slice(0, 32);
    if (!L.ipLogin.take(C.ip) || !L.nameLogin.take(key)) return err(C, 'login', 'Too many tries. Wait a few minutes and try again.');
    const u = db.user(key);
    const good = u ? await checkPass(String(m.p || '').slice(0, 200), u.salt, u.hash) : (await hashPass('x'), false);   // same time either way
    if (!good) return err(C, 'login', 'Wrong username or password.');
    if (u.banned) return err(C, 'login', 'This account is blocked.');
    await signIn(C, u);
  }
  async function hello(C, m) {
    if (!L.ipHi.take(C.ip)) return;
    if (m.v !== PROTO) return send(C, { t: 'old', m: 'A new version of the game is out. Reload the page.' });
    if (typeof m.tok === 'string' && m.tok.length > 20 && m.tok.length < 100) {
      const th = tokenHash(m.tok), s = db.session(th), t = now();
      if (s && !s.banned && s.sseen > t - SESSION_DAYS * 864e5) { db.touchSession(th, t); return signIn(C, s, m.tok); }
      if (s) db.dropSession(th);
      return send(C, { t: 'guest', m: 'Please sign in again.' });
    }
    send(C, { t: 'guest', n: online.size });
  }
  async function forgot(C, m) {
    if (!L.ipForgot.take(C.ip)) return err(C, 'forgot', 'Too many tries. Try again in an hour.');
    if (!mail.on) return err(C, 'forgot', 'Password reset by email is not switched on yet. Ask in the game’s group for help.');
    const u = db.user(String(m.u || '').slice(0, 32));
    if (u && u.email && !u.banned) {
      const code = newCode(); db.setReset(u.id, codeHash(code), now() + 15 * 60e3);
      mail.send(u.email, u.name, code).catch(e => log('mail failed', e.message));
    }
    ok(C, 'forgot', 'If that account has an email, a 6-digit code is on its way. It works for 15 minutes.');
  }
  async function reset(C, m) {
    if (!L.ipLogin.take(C.ip)) return err(C, 'reset', 'Too many tries. Wait a few minutes and try again.');
    const u = db.user(String(m.u || '').slice(0, 32)); const r = u && db.reset(u.id);
    if (!u || !r || r.exp < now() || r.tries >= 5) return err(C, 'reset', 'That code is wrong or too old. Ask for a new one.');
    db.tryReset(u.id);
    if (!Buffer.from(r.ch).equals(codeHash(String(m.code || '').trim()))) return err(C, 'reset', 'That code is wrong or too old. Ask for a new one.');
    const e2 = checkPassText(m.p, u.name); if (e2) return err(C, 'reset', e2);
    const { salt, hash } = await hashPass(m.p);
    db.setPass(u.id, salt, hash); db.dropSessions(u.id); db.dropReset(u.id);
    await signIn(C, db.userById(u.id));
    ok(C, 'reset', 'New password saved.');
  }
  async function changePass(C, m) {
    const u = db.userById(C.user.id);
    if (!L.nameLogin.take(u.name.toLowerCase())) return err(C, 'pw', 'Too many tries. Wait a few minutes.');
    if (!await checkPass(String(m.old || '').slice(0, 200), u.salt, u.hash)) return err(C, 'pw', 'Your old password is not right.');
    const e2 = checkPassText(m.p, u.name); if (e2) return err(C, 'pw', e2);
    const { salt, hash } = await hashPass(m.p);
    db.setPass(u.id, salt, hash); db.dropSessions(u.id);
    const tok = newToken(); db.addSession(tokenHash(tok), u.id, now()); C.tok = tok; C.th = tokenHash(tok);
    send(C, { t: 'tok', tok }); ok(C, 'pw', 'New password saved. Other phones are signed out.');
  }

  async function deleteAccount(C, m) {
    const u = db.userById(C.user.id); if (!u) return;
    if (!L.nameLogin.take(u.name.toLowerCase())) return err(C, 'del', 'Too many tries. Wait a few minutes.');
    if (!await checkPass(String(m.p || '').slice(0, 200), u.salt, u.hash)) return err(C, 'del', 'Your password is not right.');
    flushCash(C); if (biz.flush) biz.flush(); if (park.flush) park.flush();
    leaveWorld(C); C.tok = C.th = null;
    db.deleteUser(u.id); log('account deleted', u.name);
    send(C, { t: 'out', gone: 1 });
  }

  // ---- in the world
  function move(C, m) {
    const P = C.p;
    if (m.h) { if (!P.h) { P.h = 1; P.ver++; } return; }
    if (!num(m.x, 20000) || !num(m.z, 20000) || !num(m.y, 2000) || !num(m.r, 1e4) || !num(m.s, 500)) return;
    const a = typeof m.a === 'string' && /^[a-z0-9_]{1,8}$/.test(m.a) ? m.a : 'i';
    const v = typeof m.v === 'string' && /^[a-z0-9_]{0,12}$/.test(m.v) ? m.v : '';
    const vc = typeof m.vc === 'string' && /^#[0-9a-f]{3,8}$/i.test(m.vc) ? m.vc : '';
    const q = Number.isInteger(m.q) ? m.q & 0xffff : 0;
    const x = r2(m.x), y = r2(m.y), z = r2(m.z), r = r3(m.r), sp = Math.round(m.s * 10) / 10;
    if (P.has && !P.h && P.x === x && P.y === y && P.z === z && P.r === r && P.s === sp && P.a === a && P.v === v && P.vc === vc && P.q === q) return;   // nothing new: nothing to send on
    P.x = x; P.y = y; P.z = z; P.r = r; P.s = sp; P.a = a; P.v = v; P.vc = vc; P.q = q; P.h = 0; P.has = true; P.ver++;
  }
  function say(C, m) {
    const P = C.p, all = m.ch === 'a';
    C.chat = C.chat || new Bucket(4, .4); C.chatAll = C.chatAll || new Bucket(2, .1);
    if (!(all ? C.chatAll : C.chat).take()) return err(C, 'say', all ? 'Wait a little before you talk to all Lagos again.' : 'Slow down small.');
    const text = cleanChat(m.m); if (!text) return;
    const out = JSON.stringify({ t: 'say', i: P.id, n: P.name, m: text, ch: all ? 'a' : 'n' });
    for (const D of online.values()) {
      if (!D.p) continue;
      if (all || D === C || (P.has && D.p.has && Math.hypot(D.p.x - P.x, D.p.z - P.z) <= NEAR_CHAT)) D.ws.send(out);
    }
  }
  // the oga of the area: a player of your hustle who is an oga (rank 4 and up) within 600 m takes a part of what your
  // work pays (10%, 5% from the third rank; an oga pays nobody). Only work money counts (the game marks it: m.j).
  const OGA_R = 600, OGA_CUT = [.1, .1, .05];
  function ogaCut(C, n, job) {
    const [j, r] = String((C.p && C.p.jb) || '').split(':'), rk = +r || 0;
    if (!j || j !== job || rk >= 3 || !(n >= 100) || !C.p.has) return 0;
    let best = null;
    for (const D of online.values()) {
      if (D === C || !D.p || !D.p.has || !D.user) continue;
      const [dj, dr] = String(D.p.jb || '').split(':'), drk = +dr || 0; if (dj !== j || drk < 3) continue;
      const d = Math.hypot(D.p.x - C.p.x, D.p.z - C.p.z); if (d > OGA_R) continue;
      if (!best || drk > best.r || (drk === best.r && d < best.d)) best = { D, r: drk, d };
    }
    if (!best) return 0;
    const cut = Math.min(C.cash, Math.round(n * OGA_CUT[rk] / 10) * 10); if (!(cut > 0)) return 0;
    C.cash -= cut; give(best.D, cut, 'oga:' + C.user.name);
    send(C, { t: 'oga', n: best.D.user.name, c: cut }); send(best.D, { t: 'ogaget', n: C.user.name, c: cut });
    return cut;
  }
  const lastPay = new Map();   // account -> the last money message taken {e: that page's id, s: its number}, so a resend after a lost line is not counted twice
  function cash(C, m) {
    if (!Number.isInteger(m.d) || m.d > 5e6 || m.d < -1e10 || !m.d) return;   // spending may be big (a house in an estate, a whole estate)
    const seq = Number.isInteger(m.s) ? m.s : 0, ep = typeof m.e === 'string' ? m.e.slice(0, 16) : '';
    const L0 = lastPay.get(C.user.id);
    if (ep && L0 && L0.e === ep && seq <= L0.s) return send(C, { t: '$', n: C.cash, s: L0.s });
    if (ep) lastPay.set(C.user.id, { e: ep, s: seq });
    if (m.d < 0) C.cash = Math.max(0, C.cash + m.d);
    else { const g = C.earn.takeUpTo(m.d, now()); C.held += m.d - g; C.cash += g; if (g < m.d) log('held', C.user.name, m.d - g); if (typeof m.j === 'string' && g > 0) { ogaCut(C, g, m.j.slice(0, 16)); bank.loanCut(C, g); politics.tax(C, g, m.j.slice(0, 16)); } }
    C.dsum += m.d; C.dirty = true; C.cseq = seq;
    send(C, { t: '$', n: C.cash, s: seq });
  }
  function setLife(C, m) {
    C.lifeLim = C.lifeLim || new Bucket(6, .5); if (!C.lifeLim.take()) return;
    const d = credCap(lifeOk(m.d, now()), db.lifeGet(C.user.id), now()); if (d) db.lifePut(C.user.id, d);
    if (d && C.p) { const r = rankOf(d.cr), jb = jobBadge(d), sm = d.dirt >= 1 ? 1 : 0; if (C.p.rk !== r || (C.p.jb || '') !== jb || (C.p.sm | 0) !== sm) { C.p.rk = r; C.p.jb = jb; C.p.sm = sm; C.p.lv++; C.p.ver++; } }   // sm: they smell (everybody near sees the flies)
  }
  function setLook(C, m) {
    const look = lookOk(m); if (!look) return;
    C.p.look = look; C.p.lv++; C.p.ver++;
    db.setLook(C.user.id, JSON.stringify(look));
  }
  function setEmail(C, m) {
    const [email, e] = checkEmail(m.e); if (e) return err(C, 'email', e);
    db.setEmail(C.user.id, email); C.user.email = email;
    send(C, { t: 'email', email: maskEmail(email) });
    ok(C, 'email', email ? 'Email saved. Only used to reset your password.' : 'Email removed.');
  }
  function logout(C) {
    if (C.th) db.dropSession(C.th);
    leaveWorld(C); C.tok = C.th = null;
    send(C, { t: 'out' });
  }

  function flushCash(C) {
    if (!C.user || !C.dirty) return;
    const t = now(); db.setCash(C.user.id, C.cash, t); db.log(C.user.id, t, C.dsum, C.held, C.cash, 'play');
    C.dsum = 0; C.held = 0; C.dirty = false;
  }

  // ---- the line from each phone
  const PRE = { hi: hello, reg: register, login, forgot, reset };
  function bz(C, m) {
    C.bzLim = C.bzLim || new Bucket(12, 3); if (!C.bzLim.take()) return;
    if (typeof m.id !== 'string' || typeof m.a !== 'string') return;
    biz.handle(C, m);
  }
  function mk(C, m) { C.bzLim = C.bzLim || new Bucket(12, 3); if (!C.bzLim.take()) return; if (typeof m.a === 'string') biz.market(C, m); }
  function pk(C, m) { C.pkLim = C.pkLim || new Bucket(10, 2); if (!C.pkLim.take()) return; if (typeof m.a === 'string') park.handle(C, m); }
  function hit(C, m) { C.hitLim = C.hitLim || new Bucket(8, 4); if (!C.hitLim.take()) return; pvp.hit(C, m); }
  function lawMsg(C, m) { C.lawLim = C.lawLim || new Bucket(10, 2); if (!C.lawLim.take()) return; if (typeof m.a === 'string') law.handle(C, m); }
  function pol(C, m) { C.polLim = C.polLim || new Bucket(30, 2); if (!C.polLim.take()) return; if (typeof m.a === 'string') politics.handle(C, m); }
  function yh(C, m) { C.yhLim = C.yhLim || new Bucket(6, .5); if (!C.yhLim.take()) return; if (typeof m.a === 'string') yahoo.handle(C, m); }
  function rom(C, m) { C.romLim = C.romLim || new Bucket(8, 1); if (!C.romLim.take()) return; if (typeof m.a === 'string') love.handle(C, m); }
  function cb(C, m) { C.cbLim = C.cbLim || new Bucket(8, 1); if (!C.cbLim.take()) return; if (typeof m.a === 'string') cbn.handle(C, m); }
  function bk(C, m) { C.bkLim = C.bkLim || new Bucket(10, 2); if (!C.bkLim.take()) return; if (typeof m.a === 'string') bank.handle(C, m); }
  const IN = { p: move, say, $: cash, life: setLife, look: setLook, email: setEmail, pw: changePass, del: deleteAccount, out: logout, bz, mk, pk, hit, law: lawMsg, bk, cbn: cb, rom, yh, pol };
  const SLOW = new Set(['hi', 'reg', 'login', 'forgot', 'reset', 'pw', 'del']);   // these wait on password hashing: one at a time
  function join(ws, ip) {
    const C = { ws, ip, user: null, p: null, seen: null, msgs: new Bucket(60, 30), bad: 0, t0: now(), busy: false };
    conns.add(C);
    ws.on('message', async text => {
      if (!C.msgs.take()) { if (++C.bad > 200) ws.close(1008, 'too many messages'); return; }
      let m; try { m = JSON.parse(text); } catch (e) { return; }
      if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
      const fn = PRE[m.t] || (C.user && IN[m.t]); if (!fn) return;
      try {
        if (SLOW.has(m.t)) { if (C.busy) return; C.busy = true; try { await fn(C, m); } finally { C.busy = false; } }
        else fn(C, m);
      } catch (e) { log('error', m.t, e && e.stack || e); err(C, m.t, 'Something went wrong. Try again.'); }
    });
    ws.on('close', () => { leaveWorld(C); conns.delete(C); });
    return C;
  }

  // ---- ten times a second: what each player can see
  function tick() {
    const grid = new Map(), key = (i, j) => i * 65536 + j;
    for (const C of online.values()) {
      const P = C.p; if (!P || P.h || !P.has) continue;
      const k = key(Math.floor(P.x / CELL), Math.floor(P.z / CELL)); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(P);
    }
    for (const C of online.values()) {
      const V = C.p; if (!V || !C.ws.open) continue;
      if (C.ws.backlog > 64 * 1024) continue;          // a slow line: skip a beat
      let near = [];
      if (V.has && !V.h) {
        const ci = Math.floor(V.x / CELL), cj = Math.floor(V.z / CELL);
        for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
          const a = grid.get(key(i, j)); if (!a) continue;
          for (const Q of a) { if (Q === V) continue; const d = Math.hypot(Q.x - V.x, Q.z - V.z); if (d <= SEE) near.push([d, Q]); }
        }
        if (near.length > MAX_SEEN) { near.sort((a, b) => a[0] - b[0]); near.length = MAX_SEEN; }
      }
      const S = C.seen, ids = new Set(), j = [], p = [], l = [];
      for (const [, Q] of near) {
        ids.add(Q.id); let s = S.get(Q.id);
        if (!s || s.lv !== Q.lv) { j.push({ i: Q.id, n: Q.name, c: Q.look && Q.look.c, f: Q.look ? Q.look.f : 0, g: Q.look ? Q.look.g : 'm', k: Q.look && Number.isInteger(Q.look.k) ? Q.look.k : -1, b: Q.bd || '', w: Q.ws || 0, rk: Q.rk || 0, jb: Q.jb || '', sm: Q.sm | 0, pt: Q.pt || '', po: Q.po || '' }); if (!s) S.set(Q.id, s = { v: -1, lv: Q.lv }); s.lv = Q.lv; }
        if (s.v !== Q.ver) { p.push([Q.id, Q.x, Q.y, Q.z, Q.r, Q.a, Q.s, Q.v, Q.vc, Q.q]); s.v = Q.ver; }
      }
      for (const id of S.keys()) if (!ids.has(id)) { l.push(id); S.delete(id); }
      if (j.length || p.length || l.length) { const o = { t: 'w' }; if (j.length) o.j = j; if (p.length) o.p = p; if (l.length) o.l = l; send(C, o); }
    }
  }
  function slow() {   // every 5 s: the count of players, money to disk, dead lines
    const t = now();
    if (online.size !== lastCount) { lastCount = online.size; const o = JSON.stringify({ t: 'n', n: lastCount }); for (const C of conns) if (C.ws.open) C.ws.send(o); }
    for (const C of online.values()) flushCash(C);
    for (const C of conns) if (!C.user && t - C.t0 > 10 * 60e3) C.ws.close(1000, 'idle');
  }
  function pings() { for (const C of conns) { if (!C.ws.alive) { C.ws.close(1001, 'no answer'); continue; } C.ws.ping(); } }
  function prune() { for (const k in L) L[k].prune(); db.pruneSessions(now() - SESSION_DAYS * 864e5); }

  let timers = [];
  return {
    join,
    start() {
      let bt = now();
      timers = [setInterval(tick, TICK), setInterval(slow, 5000), setInterval(pings, 25000), setInterval(prune, 10 * 60e3),
        setInterval(() => { const t = now(); biz.tick((t - bt) / 1000); bt = t; }, 5000), setInterval(() => biz.flush(), 15000), setInterval(() => biz.pushAll(), 2000),
        setInterval(() => park.tick(), 1000), setInterval(() => park.flush(), 15000), setInterval(() => law.tick(), 2000), setInterval(() => cbn.tick(), 60e3), setInterval(() => love.tick(), LOVE.bondEvery), setInterval(() => politics.tick(), POL.tick)];
    },
    stop() { timers.forEach(clearInterval); timers = []; biz.flush(); park.flush(); for (const C of conns) { flushCash(C); C.ws.close(1012, 'server restarting'); } },
    biz, park, pvp, law, cbn, love, yahoo, politics,
    tick, slow,
    get online() { return online.size; },
    isOnline: uid => online.has(uid),
    kick(uid, why) { const C = online.get(uid); if (!C) return false; send(C, { t: 'kick', m: why || 'Signed out by the server.' }); leaveWorld(C); C.tok = C.th = null; C.ws.close(4002, 'blocked'); return true; },
    get conns() { return conns.size; },
  };
}
