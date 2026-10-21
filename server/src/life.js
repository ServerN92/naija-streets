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
    est,                                                  // houses bought in the estates
    estAll,                                               // whole estates bought
    estHome,                                              // the estate house you live in ('' = none)
    t: Math.round(num(d.t, 0, now + DAY_MS)),
  };
}
