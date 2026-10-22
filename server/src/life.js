// A player's life in the game: where they sleep (a tent under the bridge, a rented room, their own flat), how much rent
// is left, the clothes they own, the estate houses they bought. The game sends the whole record when it changes; the server checks its shape and keeps it.
const HOMES = new Set(['tent', 'room', 'flat']);
const OUTFIT = /^[a-z_]{2,12}$/;
const DAY_MS = 864e5;
const ESTATES = /^[A-D]$/;                       // the four gated estates
const HOUSE = /^[A-D](0[1-9]|1\d|2[0-7])$/;       // a house in one: A01..D27

export function lifeOk(d, now = Date.now()) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
  const own = Array.isArray(d.own) ? [...new Set(d.own.filter(k => typeof k === 'string' && OUTFIT.test(k)))].slice(0, 40) : [];
  if (!own.includes('rags')) own.unshift('rags');
  const est = Array.isArray(d.est) ? [...new Set(d.est.filter(k => typeof k === 'string' && HOUSE.test(k)))].slice(0, 108) : [];
  const estAll = Array.isArray(d.estAll) ? [...new Set(d.estAll.filter(k => typeof k === 'string' && ESTATES.test(k)))] : [];
  const estHome = typeof d.estHome === 'string' && (est.includes(d.estHome) || (HOUSE.test(d.estHome) && estAll.includes(d.estHome[0]))) ? d.estHome : '';
  return {
    v: num(d.v, 1, 99) | 0,
    home: HOMES.has(d.home) ? d.home : 'tent',
    rent: Math.round(num(d.rent, 0, 60 * 24 * 3600)),     // seconds of play the paid rent still covers
    rented: num(d.rented, 0, 1e6) | 0,                    // rent paid so far (how many times)
    flat: d.flat === true,
    own,
    ease: Math.round(num(d.ease, 0, 1) * 1000) / 1000,
    eat: Math.round(num(d.eat, 0, 1) * 1000) / 1000,       // the care bars: hunger and tiredness (0 fine .. 1 full)
    sleep: Math.round(num(d.sleep, 0, 1) * 1000) / 1000,
    dirt: Math.round(num(d.dirt, 0, 1) * 1000) / 1000,     // the bath bar: how dirty you are (full: you smell)
    ntc: Math.round(num(d.ntc, 0, 2 * 2 * 3600)),         // the landlord's notice still running (seconds of play)
    job: typeof d.job === 'string' && /^[a-z_]{2,16}$/.test(d.job) ? d.job : '',   // the hustle you picked
    tk: num(d.tk, 0, 20) | 0, tkn: num(d.tkn, 0, 1e5) | 0,                       // how far along its tasks
    hk: num(d.hk, 0, 40) | 0,                              // pure water sachets in your bag
    est,                                                  // houses bought in the estates
    estAll,                                               // whole estates bought
    estHome,                                              // the estate house you live in ('' = none)
    ...homeOk(d, now),                                    // your furniture: placed per house, kept in your store, boxes on the way
    t: Math.round(num(d.t, 0, now + DAY_MS)),
    // street cred (the rank): points, the day being counted (yyyymmdd), active seconds counted that day, what each deed paid that day, the streak
    cr: Math.floor(num(d.cr, 0, 1e7)), cd: num(d.cd, 0, 99991231) | 0, ca: Math.round(num(d.ca, 0, 86400)),
    cx: cxOk(d.cx), cs: num(d.cs, 0, 3650) | 0, cl: num(d.cl, 0, 99991231) | 0,
    pos: posOk(d.pos, now),                               // where you were when you left (you carry on there if you come back soon)
    jp: jpOk(d.jp),                                       // points in each hustle: your rank in the job
    kf: num(d.kf, 0, 9),                                  // how well the police know your face (it fades day by day)
    kfd: num(d.kfd, 0, 99991231) | 0, ogd: num(d.ogd, 0, 99991231) | 0, seen: d.seen ? 1 : 0,
    ffd: num(d.ffd, 0, 1e8) | 0, tips: num(d.tips, 0, 99) | 0,
    dy: num(d.dy, 0, 1e8) | 0, dd: num(d.dd, 0, 1e8) | 0, miss: num(d.miss, 0, 9) | 0, pen: num(d.pen, 0, 1e8) | 0,   // work days skipped in a row, the day of the pay cut   // the day of today's work target, the day it was done   // the day you last took free food (church/mosque), Mama's tips sent
    rel: relOk(d.rel, now), relNo: relNoOk(d.relNo), relHype: num(d.relHype, 0, 1e8) | 0,
    yh: yhOk(d.yh),   // the yahoo story on the phone (the money side lives in yahoo.js): the heat, legit money, the desk   // your babe (or guy) in the game: who, how much love, a money request; who you broke up with today
  };
}
function yhOk(y) { if (!y || typeof y !== 'object') return null; const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo); return { st: ['learn', 'free', 'dropped', 'caught'].includes(y.st) ? y.st : '', days: (Array.isArray(y.days) ? y.days : []).map(v => v | 0).filter(v => v > 0).slice(0, 8), t0: num(y.t0, 0, 2e13), grad: num(y.grad, 0, 2e13), last: num(y.last, 0, 2e13), n: num(y.n, 0, 9999) | 0, dirty: num(y.dirty, 0, 1e12), jail: num(y.jail, 0, 2e13), caught: num(y.caught, 0, 2e13), heat: num(y.heat, 0, 100), legit: num(y.legit, 0, 1e12), desk: y.desk ? 1 : 0, hd: num(y.hd, 0, 1e8) | 0 }; }
const FUR = /^[a-z0-9_]{2,24}$/, HOUSEID = k => k === 'flat' || HOUSE.test(k);
function homeOk(d, now) {
  const fin = v => typeof v === 'number' && Number.isFinite(v), c = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const deco = {}, store = {};
  if (d.deco && typeof d.deco === 'object' && !Array.isArray(d.deco)) for (const [k, L] of Object.entries(d.deco).slice(0, 120)) {
    if (!HOUSEID(k) || !Array.isArray(L)) continue;
    deco[k] = L.filter(r => Array.isArray(r) && typeof r[0] === 'string' && FUR.test(r[0]) && fin(r[2]) && fin(r[3]) && fin(r[4])).slice(0, 150)
      .map(r => [r[0], c(r[1] | 0, 0, 3), Math.round(c(r[2], -60, 60) * 100) / 100, Math.round(c(r[3], -60, 60) * 100) / 100, Math.round(c(r[4], -7, 7) * 1000) / 1000]);
  }
  if (d.store && typeof d.store === 'object' && !Array.isArray(d.store)) for (const [k, L] of Object.entries(d.store).slice(0, 120)) {
    if (HOUSEID(k) && Array.isArray(L)) store[k] = L.filter(x => typeof x === 'string' && FUR.test(x)).slice(0, 200);
  }
  const boxes = Array.isArray(d.boxes) ? d.boxes.filter(b => Array.isArray(b) && typeof b[0] === 'string' && FUR.test(b[0]) && typeof b[1] === 'string' && HOUSEID(b[1]) && fin(b[2]) && (b[3] === 'door' || b[3] === 'in'))
    .slice(0, 60).map(b => [b[0], b[1], Math.round(c(b[2], 0, now + DAY_MS)), b[3]]) : [];
  let n = 0; for (const k of Object.keys(deco)) { deco[k] = deco[k].slice(0, Math.max(0, 300 - n)); n += deco[k].length; if (!deco[k].length) delete deco[k]; }   // 300 pieces in all your houses
  return { deco, store, boxes };
}
function relOk(r, now) {
  if (!r || typeof r !== 'object' || Array.isArray(r) || typeof r.id !== 'string' || !/^[a-z]{2,12}$/.test(r.id)) return null;
  const c = (v, lo, hi) => Math.min(hi, Math.max(lo, +v || 0));
  const ask = r.ask && typeof r.ask === 'object' && Number.isFinite(+r.ask.n) ? { n: Math.round(c(r.ask.n, 0, 50000)), until: Math.round(c(r.ask.until, 0, now + 36e5)) } : null;
  return { id: r.id, love: Math.round(c(r.love, 0, 100) * 10) / 10, since: c(r.since, 0, 1e8) | 0, dates: c(r.dates, 0, 1e5) | 0, last: Math.round(c(r.last, 0, now + 6e4)), ask };
}
function relNoOk(o) { const out = {}; if (o && typeof o === 'object' && !Array.isArray(o)) for (const [k, v] of Object.entries(o).slice(0, 12)) if (/^[a-z]{2,12}$/.test(k) && Number.isFinite(+v)) out[k] = (+v) | 0; return out; }
function posOk(p, now) {
  if (!p || typeof p !== 'object' || Array.isArray(p) || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
  const c = (v, lo, hi) => Math.min(hi, Math.max(lo, +v || 0));
  return { x: Math.round(c(p.x, -9000, 9000) * 10) / 10, z: Math.round(c(p.z, -9000, 9000) * 10) / 10, r: Math.round(c(p.r, -7, 7) * 100) / 100, t: Math.round(c(p.t, 0, now + 60000)), st: c(p.st, 0, 5) | 0, car: p.car ? 1 : 0 };
}
function jpOk(j) {
  const o = {}; if (!j || typeof j !== 'object' || Array.isArray(j)) return o;
  for (const [k, v] of Object.entries(j).slice(0, 12)) if (/^[a-z_]{2,16}$/.test(k) && typeof v === 'number' && Number.isFinite(v)) o[k] = Math.min(1e6, Math.max(0, Math.round(v * 10) / 10));
  return o;
}
// your rank in your hustle (the game has the same list: src/game.js JOB_PTS); the police have their own ranks (law.js)
export const JOB_PTS = [0, 15, 60, 160, 400];
export const jobRankOf = (jp, job) => { const p = (jp && +jp[job]) || 0; let i = 0; while (i < JOB_PTS.length - 1 && p >= JOB_PTS[i + 1]) i++; return i; };
export const jobBadge = d => d && d.job && d.job !== 'police' ? `${d.job}:${jobRankOf(d.jp, d.job)}` : '';
function cxOk(x) {
  const o = {}; if (!x || typeof x !== 'object' || Array.isArray(x)) return o;
  for (const [k, v] of Object.entries(x).slice(0, 24)) if (/^[a-z]{2,10}$/.test(k) && typeof v === 'number' && Number.isFinite(v)) o[k] = Math.min(1e5, Math.max(0, v));
  return o;
}
// street cred cannot jump: at most what an hour of very busy play earns per hour since the last save (plus a little), never more than
// the client claims; a guest bringing a life to a new account keeps at most the Hustler rank's worth
// the rank thresholds (street cred) — the game has the same list (src/game.js RANKS)
export const RANK_CR = [0, 120, 600, 2000, 5000, 11000, 22000, 40000, 70000, 120000];
export const rankOf = cr => { let i = 0; while (i < RANK_CR.length - 1 && (+cr || 0) >= RANK_CR[i + 1]) i++; return i; };
export const CRED_RATE = 1500 / 3600, CRED_SLACK = 400, CRED_GUEST = 1999;
export function credCap(d, prev, now) {
  if (!d) return d;
  if (!prev) { d.cr = Math.min(d.cr, CRED_GUEST); d.st = now; return d; }
  const was = Math.floor(+prev.cr || 0), dt = Math.max(0, Math.min(12 * 3600, (now - (+prev.st || now)) / 1000));
  d.cr = Math.max(was, Math.min(d.cr, was + CRED_SLACK + dt * CRED_RATE)); d.st = now; return d;
}
