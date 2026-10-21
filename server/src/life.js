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
    ntc: Math.round(num(d.ntc, 0, 2 * 2 * 3600)),         // the landlord's notice still running (seconds of play)
    job: typeof d.job === 'string' && /^[a-z_]{2,16}$/.test(d.job) ? d.job : '',   // the hustle you picked
    tk: num(d.tk, 0, 20) | 0, tkn: num(d.tkn, 0, 1e5) | 0,                       // how far along its tasks
    hk: num(d.hk, 0, 40) | 0,                              // pure water sachets in your bag
    est,                                                  // houses bought in the estates
    estAll,                                               // whole estates bought
    estHome,                                              // the estate house you live in ('' = none)
    t: Math.round(num(d.t, 0, now + DAY_MS)),
    // street cred (the rank): points, the day being counted (yyyymmdd), active seconds counted that day, what each deed paid that day, the streak
    cr: Math.floor(num(d.cr, 0, 1e7)), cd: num(d.cd, 0, 99991231) | 0, ca: Math.round(num(d.ca, 0, 86400)),
    cx: cxOk(d.cx), cs: num(d.cs, 0, 3650) | 0, cl: num(d.cl, 0, 99991231) | 0,
  };
}
function cxOk(x) {
  const o = {}; if (!x || typeof x !== 'object' || Array.isArray(x)) return o;
  for (const [k, v] of Object.entries(x).slice(0, 24)) if (/^[a-z]{2,10}$/.test(k) && typeof v === 'number' && Number.isFinite(v)) o[k] = Math.min(1e5, Math.max(0, v));
  return o;
}
// street cred cannot jump: at most what an hour of very busy play earns per hour since the last save (plus a little), never more than
// the client claims; a guest bringing a life to a new account keeps at most the Hustler rank's worth
export const CRED_RATE = 1500 / 3600, CRED_SLACK = 400, CRED_GUEST = 1999;
export function credCap(d, prev, now) {
  if (!d) return d;
  if (!prev) { d.cr = Math.min(d.cr, CRED_GUEST); d.st = now; return d; }
  const was = Math.floor(+prev.cr || 0), dt = Math.max(0, Math.min(12 * 3600, (now - (+prev.st || now)) / 1000));
  d.cr = Math.max(was, Math.min(d.cr, was + CRED_SLACK + dt * CRED_RATE)); d.st = now; return d;
}
