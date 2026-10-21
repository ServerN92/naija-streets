// The motor park union (online), run on the server so nobody can fake a ticket or a takeover.
//
// Join the union at the office in Mushin Motor Park and you are an agbero: every danfo that loads in a bay pays a
// ticket, and the first agbero standing by it collects it. The agbero keeps half (more as their rank grows); the rest
// is the chairman's "return". Danfos nobody collects from are done by the street touts, who still bring the chairman
// a quarter. Every ticket earns respect: 40 makes you a senior agbero, 120 a head agbero.
//
// The chairman sets the ticket price (dearer tickets, fewer danfos) and keeps boys on a crew, paid by the day.
// Every 30 real minutes the park holds its meeting. A head agbero who declared for the seat before it (paying their
// own boys for the fight) fights the chairman's crew in the yard: both crews brawl, the players on each side join in,
// and every enemy boy a player knocks down counts. The side with boys left standing wins; a challenger who wins is
// the new chairman. When no player holds the seat, Chairman Kasali (the old chairman) does, with six boys.
import { DAY_MINUTES } from './clock.js';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gameDay = t => Math.floor(t / (DAY_MINUTES * 60000));   // a game day: 2 real hours (06:00 to 06:00)
const naira = n => '₦' + Math.round(n).toLocaleString('en-NG');
const dayKey = t => new Date(t + 3600e3).toISOString().slice(0, 10);   // the day in Lagos (UTC+1)
export const PARK = {
  join: 5000,                          // the union's registration
  price: 300, priceMin: 200, priceMax: 600, priceStep: 50,   // the ticket each danfo pays
  share: [.5, .6, .7],                 // the agbero's part by rank; the rest is the chairman's return
  npcCut: .25,                         // the chairman's part of a ticket the street touts collected
  ranks: [[0, 'Agbero'], [40, 'Senior agbero'], [120, 'Head agbero']],
  boyFight: 3000, boyDay: 6000, maxBoys: 12, minBoys: 2, npcBoys: 6,
  every: 30 * 60e3,                    // the park meeting
  fightMax: 180e3, declBefore: 60e3,
  load: [20e3, 34e3], window: 22e3,    // a danfo starts loading every 20 to 34 s; its ticket can be collected for 22 s
  reach: 8, sackDay: 5, idleDays: 3, kosPerFight: 6,
  rate: .02,                           // in the fight: each second a side loses a boy with this chance for every boy (or player) on the other side
  // on the road: agberos stop the danfos at the bus stops for the day's ticket (once a game day for each danfo). Half is the
  // boy's at once; the oga's half is kept aside and goes to the chairman's bank account at the end of the game day, with what
  // the chairman's paid crew brought in from the bus stops
  street: 200, streetShare: .5, streetMax: 40, streetGap: 6e3, crewStreet: 1000,
};
// for testing on a developer's machine only: a quick meeting and low ranks (never set on the real server)
export function tune(env) {
  if (+env.PARK_EVERY_MS > 0) PARK.every = +env.PARK_EVERY_MS;
  if (+env.PARK_FIGHT_MS > 0) PARK.fightMax = +env.PARK_FIGHT_MS;
  if (env.PARK_RANKS) { const r = String(env.PARK_RANKS).split(',').map(Number); if (r.length === 3 && r.every(Number.isFinite)) r.forEach((v, i) => { PARK.ranks[i][0] = v; }); }
  if (+env.PARK_WINDOW_MS > 0) PARK.window = +env.PARK_WINDOW_MS;
  if (+env.PARK_RATE > 0) PARK.rate = +env.PARK_RATE;
  if (+env.PARK_DECL_BEFORE_MS >= 0 && env.PARK_DECL_BEFORE_MS !== undefined) PARK.declBefore = +env.PARK_DECL_BEFORE_MS;
}
// where things are: the yard, the bays (the same order as in the game, src/game.js)
export const SITE = {
  id: 'mushin', name: 'Mushin Motor Park', npc: 'Chairman Kasali', x: 1010.47, z: -513.03, r: 38,
  bays: [[986.51, -511.04], [993.64, -513.87], [1000.76, -516.7], [1007.89, -519.53], [1015.02, -522.36], [1022.14, -525.19], [1029.27, -528.02]],
};
const ROUTES = ['Oshodi', 'Yaba', 'Ojota', 'Ikeja', 'Ojuelegba', 'Costain', 'Oyingbo'];
export const rankOf = rp => rp >= PARK.ranks[2][0] ? 2 : rp >= PARK.ranks[1][0] ? 1 : 0;
const freshPark = () => ({ chair: null, cname: '', price: PARK.price, crew: 0, crewUntil: 0, since: 0, decl: null, day: { k: '', tk: 0, ret: 0, npc: 0 }, sacks: { k: '', n: 0 }, last: null, wins: 0, owe: 0, street: { d: -1, by: {} }, lastStreet: null });
const freshMember = name => ({ on: 1, name, rp: 0, tk: 0, earned: 0, day: { k: '', tk: 0, earned: 0 }, side: 'c', ban: 0, joined: 0, kos: 0 });

export function createPark({ db, now = () => Date.now(), rand = Math.random, log = () => {}, ctx }) {
  const S = SITE;
  let P = freshPark();
  const row = db.parkGet(S.id); if (row) { try { P = { ...P, ...JSON.parse(row.data) }; } catch (e) { /* a fresh park */ } }
  if (P.chair && !db.userById(P.chair)) Object.assign(P, { chair: null, cname: '', crew: 0, crewUntil: 0 });
  const M = new Map();   // account -> member
  for (const r of db.pmAll(S.id)) { try { M.set(r.uid, { ...freshMember(r.name), ...JSON.parse(r.data), name: r.name }); } catch (e) { /* skip */ } }
  let dirty = false, pubS = '', nextLoad = now() + 5e3, nid = 1, F = null;
  const loads = new Map();   // the danfos loading now: id -> {id, bay, route, until, price, by}
  const mDirty = new Set();
  const touchM = uid => { mDirty.add(uid); };

  const meetAt = (t = now()) => Math.ceil((t + 1) / PARK.every) * PARK.every;
  const chairName = () => P.chair ? P.cname : S.npc;
  const crewNow = (t = now()) => P.chair ? (P.crewUntil > t ? P.crew : 0) : PARK.npcBoys;
  const member = uid => { const m = M.get(uid); return m && m.on ? m : null; };
  const inPark = (C, extra = 0) => !!(C.p && C.p.has && Math.hypot(C.p.x - S.x, C.p.z - S.z) <= S.r + extra);
  function rollDay(o, t) { const k = dayKey(t); if (o.day.k !== k) o.day = { k, tk: 0, earned: 0, ret: 0, npc: 0 }; }
  const badge = uid => P.chair === uid ? 'c' : member(uid) ? 'a' : '';
  const setBadge = uid => { if (ctx.badge) ctx.badge(uid, badge(uid)); };
  const err = (C, m) => ctx.err(C, 'pk', m), ok = (C, m) => ctx.ok(C, 'pk', m);
  function payOwed() {   // the chairman's return, paid once a minute (and before the seat changes hands)
    if (P.chair && P.owe > 0) ctx.credit(P.chair, P.owe, 'park return ' + S.id);
    if (P.owe) { P.owe = 0; dirty = true; }
  }

  // ---- what everybody sees: the board, the chairman, the next meeting, the fight
  function pub() {
    const t = now(), top = [...M.entries()].filter(([, m]) => m.on).sort((a, b) => b[1].rp - a[1].rp).slice(0, 5).map(([, m]) => [m.name, m.rp, rankOf(m.rp)]);
    return { id: S.id, ch: chairName(), npc: P.chair ? 0 : 1, price: P.price, crew: crewNow(t), next: meetAt(t) - t, nextAt: meetAt(t),
      decl: P.decl ? { n: P.decl.name, b: P.decl.n, at: P.decl.at } : null, fight: F ? { A: F.A, B: F.B } : null, top, last: P.last, members: [...M.values()].filter(m => m.on).length };
  }
  function pushPub(force) {
    const p = pub(), s = JSON.stringify({ ...p, next: 0 });
    if (!force && s === pubS) return; pubS = s;
    for (const C of ctx.online.values()) if (C.ws.open) ctx.send(C, { t: 'pk', p: { ...p, next: p.nextAt - now() } });
  }
  function me(C) {   // your own part: rank, respect, today; the chairman's crew and money too
    const t = now(), m = M.get(C.user.id), chair = P.chair === C.user.id;
    if (m) rollDay(m, t);
    const st = m && m.st && m.st.d === gameDay(t) ? m.st : null;
    const o = { on: !!(m && m.on), rp: m ? m.rp : 0, rank: m ? rankOf(m.rp) : 0, tk: m ? m.tk : 0, earned: m ? m.earned : 0, today: m ? m.day : null, side: m ? m.side : 'c', ban: m && m.ban > t ? m.ban - t : 0,
      chair, declared: !!(P.decl && P.decl.uid === C.user.id), st: { n: st ? st.n : 0, max: PARK.streetMax, got: st ? st.got : 0, held: st ? st.held : 0 } };
    if (chair) { const S0 = streetNow(t), by = Object.values(S0.by); o.street = { n: by.reduce((a, b) => a + b.n, 0), held: by.reduce((a, b) => a + b.held, 0), boys: by.length, crew: crewNow(t) * PARK.crewStreet, last: P.lastStreet }; }
    if (chair) { rollDay(P, t); Object.assign(o, { crew: crewNow(t), crewLeft: Math.max(0, P.crewUntil - t), day: P.day, sacks: P.sacks.k === dayKey(t) ? P.sacks.n : 0,
      list: [...M.entries()].filter(([u, x]) => x.on && u !== C.user.id).sort((a, b) => (b[1].day.k === P.day.k ? b[1].day.tk : 0) - (a[1].day.k === P.day.k ? a[1].day.tk : 0) || b[1].rp - a[1].rp).slice(0, 12)
        .map(([u, x]) => [u, x.name, x.rp, x.day.k === P.day.k ? x.day.tk : 0, x.ban > t ? 1 : 0]) }); }
    ctx.send(C, { t: 'pkme', m: o });
  }
  const meById = uid => { const C = ctx.online.get(uid); if (C && C.user) me(C); };

  // ---- the danfos loading in the bays
  const loadList = () => { const t = now(); return [...loads.values()].map(L => [L.id, L.bay, L.route, Math.max(0, L.until - t), L.by || '', L.price]); };
  let loadS = '';
  function pushLoads(force) {
    const l = loadList(), s = JSON.stringify(l.map(x => [x[0], x[4]]));
    if (!force && s === loadS) return; loadS = s;
    for (const C of ctx.online.values()) if (C.ws.open && C.pkNear) ctx.send(C, { t: 'pkd', l });
  }
  function startLoad(t) {
    const used = new Set([...loads.values()].map(L => L.bay)), free = S.bays.map((_, i) => i).filter(i => !used.has(i));
    if (!free.length) return;
    const bay = free[Math.floor(rand() * free.length)], id = nid++;
    loads.set(id, { id, bay, route: ROUTES[Math.floor(rand() * ROUTES.length)], until: t + PARK.window, price: P.price, by: null });
  }
  function endLoad(L, t) {   // it leaves: if no agbero collected, the street touts did, and the chairman gets a quarter
    loads.delete(L.id);
    if (L.by) return;
    rollDay(P, t); P.day.npc++;
    if (P.chair) { const ret = Math.round(L.price * PARK.npcCut / 10) * 10; P.day.ret += ret; P.owe += ret; }
    dirty = true;
  }
  function ticket(C, m) {
    const t = now(), uid = C.user.id, L = loads.get(m.id), x = M.get(uid);
    if (!x || !x.on) return err(C, 'Join the park union first. The office is in the yard.');
    if (x.ban > t) return err(C, 'The chairman don sack you from this park. Come back tomorrow.');
    if (!L || L.until <= t) return err(C, 'That danfo don go.');
    if (L.by) return err(C, `${L.by} don collect that one already. Be fast!`);
    if (x.lastTk && t - x.lastTk < 4e3) return;
    const [bx, bz] = S.bays[L.bay];
    if (!C.p || !C.p.has || C.p.v || Math.hypot(C.p.x - bx, C.p.z - bz) > PARK.reach) return err(C, 'Go and stand by the danfo first.');
    x.lastTk = t; L.by = C.user.name;
    const got = Math.round(L.price * PARK.share[rankOf(x.rp)] / 10) * 10, ret = L.price - got, r0 = rankOf(x.rp);
    ctx.give(C, got, 'ticket ' + S.id);
    rollDay(x, t); x.rp++; x.tk++; x.earned += got; x.day.tk++; x.day.earned += got; touchM(uid);
    rollDay(P, t); P.day.tk++;
    if (P.chair) { P.day.ret += ret; if (P.chair === uid) ctx.give(C, ret, 'park return ' + S.id); else P.owe += ret; }
    dirty = true;
    ctx.send(C, { t: 'pkt', id: L.id, got, ret, route: L.route, chair: chairName() });
    if (rankOf(x.rp) > r0) ok(C, `Respect! You are a ${PARK.ranks[rankOf(x.rp)][1].toLowerCase()} now: you keep ${Math.round(PARK.share[rankOf(x.rp)] * 100)}% of every ticket.${rankOf(x.rp) === 2 ? ' You can declare for chairman at the office.' : ''}`);
    me(C); pushLoads(true); if (P.chair && P.chair !== uid) meById(P.chair);
  }

  // ---- on the road: a danfo's ticket for the day at a bus stop (the game says which danfo: its plate number)
  function streetNow(t) { if (!P.street || P.street.d !== gameDay(t)) { if (P.street && P.street.d >= 0) settleStreet(t); P.street = { d: gameDay(t), by: {} }; dirty = true; } return P.street; }
  function street(C, m) {
    const t = now(), uid = C.user.id, x = M.get(uid), plate = String(m.plate || '').toUpperCase().slice(0, 12);
    if (!x || !x.on) return err(C, 'Only union agberos collect tickets. Join at the office in Mushin Motor Park.');
    if (x.ban > t) return err(C, 'The chairman don sack you for now. You no fit collect.');
    if (!C.p || !C.p.has || C.p.v) return err(C, 'Come down first. You collect on your feet.');
    if (inPark(C, 10)) return err(C, 'Inside the park, collect from the danfos loading in the bays.');
    if (!/^[A-Z]{3}-\d{3}[A-Z]{2}$/.test(plate)) return;
    if (x.lastSt && t - x.lastSt < PARK.streetGap) return;
    const d = gameDay(t); if (!x.st || x.st.d !== d) x.st = { d, n: 0, got: 0, held: 0, plates: [] };
    if (x.st.n >= PARK.streetMax) return err(C, `You don collect ${PARK.streetMax} tickets today. Rest small, a new day go come.`);
    if (x.st.plates.includes(plate)) return err(C, 'This danfo don pay today already.');
    x.lastSt = t; x.st.n++; x.st.plates.push(plate);
    const price = PARK.street, self = P.chair === uid, got = self ? price : Math.round(price * PARK.streetShare), held = price - got;
    ctx.give(C, got, 'street ticket ' + plate);
    x.st.got += got; x.st.held += held; x.rp++; x.tk++; x.earned += got; touchM(uid);
    if (held) { const S0 = streetNow(t), b = S0.by[uid] || (S0.by[uid] = { name: C.user.name, n: 0, held: 0 }); b.n++; b.held += held; }
    dirty = true;
    ctx.send(C, { t: 'pkst', plate, got, held, chair: chairName(), n: x.st.n, max: PARK.streetMax });
    me(C); if (P.chair && P.chair !== uid) meById(P.chair);
  }
  // the end of the game day: every boy's kept half goes to the chairman's account (one transfer from each boy, on their bank
  // history), with what the chairman's paid crew brought in; with Chairman Kasali in the seat, the old man takes it
  function settleStreet(t) {
    const S0 = P.street, by = Object.entries(S0.by || {}).filter(([, b]) => b.held > 0), total = by.reduce((a, [, b]) => a + b.held, 0), n = by.reduce((a, [, b]) => a + b.n, 0);
    const crew = P.chair ? crewNow(t) * PARK.crewStreet : 0, chair = chairName();
    if (P.chair && (total || crew)) {
      for (const [u, b] of by) if (ctx.bankTx) ctx.bankTx(+u, P.chair, b.held, `Street tickets ×${b.n} (oga's half)`, 'union:' + S0.d);
      ctx.credit(P.chair, total + crew, 'street returns ' + S0.d, `🏦 Credit alert! ${naira(total + crew)} street returns for the day: ${by.length} boy${by.length === 1 ? '' : 's'}, ${n} danfo${n === 1 ? '' : 's'}${crew ? ` (with ${naira(crew)} from your crew)` : ''}.`);
      rollDay(P, t); P.day.ret += total + crew;
    }
    for (const [u, b] of by) { ctx.note && ctx.note(+u, `End of the day: ${naira(b.held)} (the oga's half of your ${b.n} street ticket${b.n === 1 ? '' : 's'}) don go to ${chair}${P.chair ? "'s account" : ''}.`); if (ctx.bankRefresh) ctx.bankRefresh(+u); }
    if (P.chair && ctx.bankRefresh) ctx.bankRefresh(P.chair);
    P.lastStreet = { d: S0.d, total, crew, boys: by.length, n, chair }; dirty = true;
    if (total || crew) log('street returns', chair, total, crew, by.length);
  }

  // ---- the meeting: the fight for the seat
  function sideOf(uid) {
    if (!F) return null;
    if (uid === F.buid) return 'b'; if (F.auid && uid === F.auid) return 'a';
    const x = member(uid); if (!x || x.ban > now()) return null; return x.side === 'x' ? 'b' : 'a';
  }
  function startFight(t) {
    const D = P.decl; P.decl = null; dirty = true;
    if (!D) return;
    const cm = M.get(D.uid);
    if (!db.userById(D.uid) || !cm || !cm.on || P.chair === D.uid) return;
    const a = crewNow(t);
    F = { at: t, end: t + PARK.fightMax, a, b: D.n, a0: a, b0: D.n, A: chairName(), B: D.name, auid: P.chair, buid: D.uid, ko: new Map(), down: new Map(), ka: 0, kb: 0, here: { a: 0, b: 0 } };
    log('park fight', F.A, a, 'vs', F.B, D.n);
    for (const C of ctx.online.values()) if (C.ws.open && C.user) ctx.send(C, { t: 'note', m: `The park meeting at ${S.name}: ${D.name} and ${D.n} boys have come for ${F.A}'s seat! The fight don start in the yard.` });
    pushPub(true); pushFight();
  }
  function fightStep(t) {
    let pa = 0, pb = 0;
    for (const C of ctx.online.values()) {
      if (!C.user || !inPark(C) || C.p.v) continue; const s = sideOf(C.user.id); if (!s) continue;
      const dn = F.down.get(C.user.id); if (dn && dn > t) continue;
      if (s === 'a') pa++; else pb++;
    }
    F.here = { a: pa, b: pb };
    const powA = F.a * 1.15 + 2 * pa, powB = F.b + 2 * pb, K = PARK.rate;
    if (F.a > 0 && rand() < Math.min(.6, K * powB)) { F.a--; F.ka++; }
    if (F.b > 0 && rand() < Math.min(.6, K * powA)) { F.b--; F.kb++; }
    if (F.a <= 0 || F.b <= 0 || t >= F.end) endFight(t); else pushFight();
  }
  function pushFight(end) {
    const t = now(), f = F ? { A: F.A, B: F.B, a: F.a, b: F.b, a0: F.a0, b0: F.b0, ka: F.ka, kb: F.kb, left: Math.max(0, F.end - t), here: F.here } : null;
    const o = { t: 'pkf', f, end: end || null };
    for (const C of ctx.online.values()) if (C.ws.open && C.user && (C.pkNear || end)) ctx.send(C, o);
  }
  function endFight(t) {
    const f = F, win = f.a <= 0 && f.b > 0 ? 'b' : f.b <= 0 && f.a > 0 ? 'a' : f.b > f.a ? 'b' : 'a';
    const bonus = side => { for (const C of ctx.online.values()) { if (!C.user || !inPark(C)) continue; const u = C.user.id; if (u === f.auid || u === f.buid || sideOf(u) !== side) continue; const x = member(u); if (x) { x.rp += 5; touchM(u); } } };
    const cm = M.get(f.buid);
    let msg;
    if (win === 'b') {
      payOwed(); if (P.street && P.street.d >= 0) { settleStreet(t); P.street = { d: gameDay(t), by: {} }; } const old = P.chair;
      Object.assign(P, { chair: f.buid, cname: f.B, crew: Math.max(PARK.minBoys, f.b), crewUntil: t + 24 * 3600e3, since: t, wins: 0 });
      if (cm) { cm.rp += 25; cm.side = 'c'; touchM(f.buid); }
      if (old) { const o = M.get(old); if (o) { o.rp = Math.max(0, o.rp - 30); touchM(old); } ctx.note(old, `${f.B} don take your seat at ${S.name}. You are not the chairman again.`); setBadge(old); }
      for (const [u, x] of M) if (x.side === 'x') { x.side = 'c'; touchM(u); }
      msg = `${f.B} is the new chairman of ${S.name}! ${f.B}'s boys beat ${f.A}'s crew.`;
    } else {
      if (cm) { cm.rp = Math.max(0, cm.rp - 10); touchM(f.buid); }
      if (P.chair) { const o = M.get(P.chair); if (o) { o.rp += 20; touchM(P.chair); } P.wins = (P.wins | 0) + 1; }
      for (const [u, x] of M) if (x.side === 'x') { x.side = 'c'; touchM(u); }
      msg = `${f.A} held ${S.name}! ${f.B}'s boys ran.`;
    }
    bonus(win);
    P.last = { A: f.A, B: f.B, win: win === 'b' ? f.B : f.A, at: t }; dirty = true;
    F = null; log('park fight end', msg);
    setBadge(f.buid); if (f.auid) setBadge(f.auid);
    flush();
    for (const C of ctx.online.values()) if (C.ws.open && C.user) ctx.send(C, { t: 'note', m: msg });
    pushFight({ win, chair: chairName(), msg }); pushPub(true);
    for (const C of ctx.online.values()) if (C.user && M.has(C.user.id)) me(C);
  }
  function ko(C) {   // a player knocked down one of the other side's boys
    if (!F || !inPark(C, 6)) return; const t = now(), uid = C.user.id, s = sideOf(uid); if (!s) return;
    const n = F.ko.get(uid) || { n: 0, t: 0 }; if (n.n >= PARK.kosPerFight || t - n.t < 2500) return;
    if (s === 'a' && F.b > 0) { F.b--; F.kb++; } else if (s === 'b' && F.a > 0) { F.a--; F.ka++; } else return;
    n.n++; n.t = t; F.ko.set(uid, n);
    const x = member(uid); if (x) { x.rp += 3; x.kos = (x.kos | 0) + 1; touchM(uid); }
    if (F.a <= 0 || F.b <= 0) endFight(t); else pushFight();
  }

  // a player knocked out a player of the other side in the yard during the fight: the one down is out of it for a while
  function pvpKo(A, D) {
    if (!F || !A.user || !D.user || !inPark(A, 6) || !inPark(D, 6)) return;
    const sa = sideOf(A.user.id), sd = sideOf(D.user.id); if (!sa || !sd || sa === sd) return;
    F.down.set(D.user.id, now() + 25e3);
    const x = member(A.user.id); if (x) { x.rp += 5; touchM(A.user.id); }
  }
  // ---- what players ask for: {t:'pk', a, ...}
  function handle(C, m) {
    const t = now(), uid = C.user.id, x = M.get(uid), chair = P.chair === uid;
    switch (m.a) {
      case 'info': me(C); return;
      case 'ticket': return ticket(C, m);
      case 'street': return street(C, m);
      case 'ko': return ko(C);
      case 'down': if (F && sideOf(uid)) F.down.set(uid, t + 25e3); return;
    }
    if (!inPark(C, 25)) return err(C, `Come to the union office at ${S.name} for that.`);
    switch (m.a) {
      case 'join': {
        if (x && x.on) return err(C, 'You are in the union already.');
        if (!ctx.spend(C, PARK.join, 'park union ' + S.id)) return err(C, `The union registration is ₦${PARK.join.toLocaleString('en-NG')}.`);
        const n = x || freshMember(C.user.name); Object.assign(n, { on: 1, name: C.user.name, joined: t, side: 'c' }); M.set(uid, n); touchM(uid); flush();
        ok(C, 'Welcome to the union! Wear your vest with pride. When a danfo loads, run to it and collect the ticket.');
        setBadge(uid); break;
      }
      case 'leave': {
        if (!x || !x.on) return; if (chair) return err(C, 'A chairman cannot just leave. Step down first.');
        if (P.decl && P.decl.uid === uid) return err(C, 'You declared for the meeting. You cannot leave now.');
        x.on = 0; touchM(uid); flush(); ok(C, 'You left the union. Your respect stays on the book if you come back.'); setBadge(uid); break;
      }
      case 'side': { if (!x || !x.on || chair) return; x.side = m.s === 'x' ? 'x' : 'c'; touchM(uid); ok(C, x.side === 'x' ? `At the meeting you will fight with ${P.decl ? P.decl.name : 'the challenger'}.` : `At the meeting you will fight for ${chairName()}.`); break; }
      case 'declare': {
        if (!x || !x.on) return err(C, 'Join the union first.');
        if (chair) return err(C, 'You are the chairman already.');
        if (x.ban > t) return err(C, 'You are sacked from this park for now.');
        if (rankOf(x.rp) < 2) return err(C, `Only a head agbero (${PARK.ranks[2][0]} respect) can declare. You have ${x.rp}.`);
        if (P.decl) return err(C, P.decl.uid === uid ? 'You have declared already.' : `${P.decl.name} has declared for the next meeting already.`);
        if (F) return err(C, 'Wait for this fight to finish.');
        const n = Number.isInteger(m.n) ? clamp(m.n, PARK.minBoys, PARK.maxBoys) : 0; if (!n) return;
        if (!ctx.spend(C, n * PARK.boyFight, 'park boys ' + S.id)) return err(C, 'Not enough money to pay that many boys.');
        let at = meetAt(t); if (at - t < PARK.declBefore) at += PARK.every;
        P.decl = { uid, name: C.user.name, n, at }; x.side = 'x'; touchM(uid); dirty = true; flush();
        ok(C, `You declared! ${n} boys will fight with you at the meeting in ${Math.ceil((at - t) / 60e3)} minutes. Be in the yard.`);
        if (P.chair) ctx.note(P.chair, `${C.user.name} has declared for your seat at ${S.name}! The fight is at the meeting in ${Math.ceil((at - t) / 60e3)} minutes. Pay your boys.`);
        break;
      }
      case 'price': {
        if (!chair || !Number.isFinite(m.p)) return;
        P.price = clamp(Math.round(m.p / PARK.priceStep) * PARK.priceStep, PARK.priceMin, PARK.priceMax); dirty = true;
        ok(C, `Ticket is ₦${P.price.toLocaleString('en-NG')} now.${P.price > PARK.price ? ' Drivers will grumble, and fewer will load.' : ''}`); break;
      }
      case 'boys': {
        if (!chair) return; const n = Number.isInteger(m.n) ? clamp(m.n, PARK.minBoys, PARK.maxBoys) : 0; if (!n) return;
        if (!ctx.spend(C, n * PARK.boyDay, 'park crew ' + S.id)) return err(C, 'Not enough money to pay the boys.');
        P.crew = n; P.crewUntil = t + 24 * 3600e3; dirty = true; flush(); ok(C, `${n} boys are on your crew for 24 hours. They will defend the park.`); break;
      }
      case 'sack': {
        if (!chair) return; const v = M.get(m.uid); if (!v || !v.on || m.uid === uid) return;
        if (P.decl && P.decl.uid === m.uid) return err(C, 'You cannot sack someone who declared. Face them at the meeting.');
        const k = dayKey(t); if (P.sacks.k !== k) P.sacks = { k, n: 0 }; if (P.sacks.n >= PARK.sackDay) return err(C, `You can sack ${PARK.sackDay} people a day.`);
        P.sacks.n++; v.ban = t + 24 * 3600e3; touchM(m.uid); dirty = true; ok(C, `${v.name} is sacked from the park for a day.`);
        ctx.note(m.uid, `Chairman ${C.user.name} sacked you from ${S.name} for a day.`); meById(m.uid); break;
      }
      case 'resign': {
        if (!chair) return; payOwed(); if (P.street && P.street.d >= 0) { settleStreet(t); P.street = { d: gameDay(t), by: {} }; } Object.assign(P, { chair: null, cname: '', crew: 0, crewUntil: 0 }); dirty = true; flush();
        ok(C, `You stepped down. ${S.npc} is back in the chair.`); setBadge(uid);
        for (const D of ctx.online.values()) if (D.ws.open && D.user && D !== C) ctx.send(D, { t: 'note', m: `${C.user.name} stepped down as chairman of ${S.name}.` });
        break;
      }
      default: return;
    }
    me(C); pushPub();
  }

  // ---- every second: danfos load and leave, the meeting comes, the fight goes on
  let slowT = 0;
  function tick() {
    const t = now();
    for (const L of [...loads.values()]) if (L.until <= t) endLoad(L, t);
    if (!P.street || P.street.d !== gameDay(t)) { streetNow(t); flush(); }   // a new game day: yesterday's street returns go to the oga
    if (t >= nextLoad) { startLoad(t); const [a, b] = PARK.load; nextLoad = t + (a + rand() * (b - a)) * Math.pow(P.price / PARK.price, .7); }
    for (const C of ctx.online.values()) {   // who is near enough to see the bays
      if (!C.user || !C.ws.open) continue; const near = !!(C.p && C.p.has && Math.hypot(C.p.x - S.x, C.p.z - S.z) < 400);
      if (near && !C.pkNear) { C.pkNear = true; ctx.send(C, { t: 'pkd', l: loadList() }); if (F) ctx.send(C, { t: 'pkf', f: { A: F.A, B: F.B, a: F.a, b: F.b, a0: F.a0, b0: F.b0, ka: F.ka, kb: F.kb, left: F.end - t, here: F.here } }); }
      else if (!near) C.pkNear = false;
    }
    pushLoads();
    if (F) fightStep(t);
    else if (P.decl && t >= P.decl.at) startFight(t);
    if (++slowT >= 60) { slowT = 0;   // the return goes to the chairman; a chairman who has not come for days: the elders give the seat back
      payOwed();
      if (P.chair) { const u = db.userById(P.chair); if (!u || u.banned || u.seen < t - PARK.idleDays * 864e5) { const was = P.cname, uid = P.chair; Object.assign(P, { chair: null, cname: '', crew: 0, crewUntil: 0 }); dirty = true; log('park idle chair', was); setBadge(uid); } }
      pushPub(); }
  }
  function flush() {
    if (!dirty && !mDirty.size) return;
    db.tx(() => { if (dirty) db.parkPut(S.id, JSON.stringify(P)); for (const u of mDirty) { const x = M.get(u); if (x) { const { lastTk, lastSt, ...rest } = x; db.pmPut(u, S.id, JSON.stringify(rest)); } } });
    dirty = false; mDirty.clear();
  }
  function hello(C) {
    ctx.send(C, { t: 'pk', p: pub(), rules: { join: PARK.join, price: PARK.price, priceMin: PARK.priceMin, priceMax: PARK.priceMax, priceStep: PARK.priceStep, share: PARK.share, npcCut: PARK.npcCut, ranks: PARK.ranks, boyFight: PARK.boyFight, boyDay: PARK.boyDay, maxBoys: PARK.maxBoys, minBoys: PARK.minBoys, npcBoys: PARK.npcBoys, every: PARK.every, reach: PARK.reach, npc: S.npc, name: S.name, street: PARK.street, streetShare: PARK.streetShare, streetMax: PARK.streetMax, crewStreet: PARK.crewStreet } });
    C.pkNear = false; me(C);
  }
  // the account's name for a player who signs in (a fresh member gets their badge from here)
  return { handle, tick, flush, hello, badge, pub, pvpKo, get fight() { return F; }, get state() { return P; }, member: uid => M.get(uid), loads: () => [...loads.values()], meetAt,
    _test: { settle: () => streetNow(now()), startLoad: t => startLoad(t ?? now()), setRp: (uid, rp) => { const x = M.get(uid); if (x) { x.rp = rp; touchM(uid); } } } };
}
