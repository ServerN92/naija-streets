// A player's life in the game: where they sleep (a tent under the bridge, a rented room, their own flat), how much rent
// is left, the clothes they own. The game sends the whole record when it changes; the server checks its shape and keeps it.
const HOMES = new Set(['tent', 'room', 'flat']);
const OUTFIT = /^[a-z_]{2,12}$/;
const DAY_MS = 864e5;

export function lifeOk(d, now = Date.now()) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
  const own = Array.isArray(d.own) ? [...new Set(d.own.filter(k => typeof k === 'string' && OUTFIT.test(k)))].slice(0, 40) : [];
  if (!own.includes('rags')) own.unshift('rags');
  return {
    v: num(d.v, 1, 99) | 0,
    home: HOMES.has(d.home) ? d.home : 'tent',
    rent: Math.round(num(d.rent, 0, 60 * 24 * 3600)),     // seconds of play the paid rent still covers
    rented: num(d.rented, 0, 1e6) | 0,                    // rent paid so far (how many times)
    flat: d.flat === true,
    own,
    ease: Math.round(num(d.ease, 0, 1) * 1000) / 1000,
    t: Math.round(num(d.t, 0, now + DAY_MS)),
  };
}
