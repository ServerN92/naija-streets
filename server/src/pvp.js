// Players fighting players (online), decided on the server so nobody can fake a blow or a knock-out.
//
// Your phone says "my jab landed on player 7". The server checks it against what it knows: both of you on foot and in
// the open, close enough for that blow (with a little room for the line's delay), and you facing them; not too fast,
// and not on someone already down or under protection. Then it counts the damage (each player has 100 points; they
// come back slowly when nobody hits you for a while) and tells the one who was hit, who staggers and loses health on
// their own phone. At 100 they are knocked out: they go down for a few seconds, the winner takes 10% of their pocket
// money (₦2,000 at most, and only if they carry ₦1,000 or more), and they cannot be hit again for two minutes.
// Somebody who just signed in is protected for 45 seconds, until they throw a blow themselves.
export const PVP = {
  dmg: { jab: 9, cross: 11, kick: 15, heavy: 20, drop_kick: 26, gp: 10 },
  reach: { jab: 1.6, cross: 1.7, kick: 2.1, heavy: 2.2, drop_kick: 3.2, gp: 1.9 },
  slack: 1.5, cone: 1.35,          // metres of room for the line's delay; how far off your facing they can be (radians)
  full: 100, regen: 4, rest: 5e3,   // the points to a knock-out; points back a second, after this long without a blow
  ko: 5e3, guard: 120e3, fresh: 45e3, gap: 260,
  rob: .1, robMax: 2000, robMin: 1000,
};

// for testing on a developer's machine only (never set on the real server)
export function tunePvp(env) { if (env.PVP_FRESH_MS !== undefined && +env.PVP_FRESH_MS >= 0) PVP.fresh = +env.PVP_FRESH_MS; }

export function createPvp({ now = () => Date.now(), rand = Math.random, log = () => {}, ctx }) {
  const st = C => C.pv || (C.pv = { dmg: 0, last: 0, guard: 0, ko: 0, hitT: 0 });
  function points(T, t) {   // the damage a player carries now (it wears off while nobody hits them)
    const s = st(T), idle = t - s.last - PVP.rest;
    if (idle > 0 && s.dmg > 0) { s.dmg = Math.max(0, s.dmg - PVP.regen * idle / 1000); s.last = t - PVP.rest; }
    return s.dmg;
  }
  function byId(id) { for (const C of ctx.online.values()) if (C.p && C.p.id === id) return C; return null; }
  const no = (C, i, m) => ctx.send(C, { t: 'pvno', i, m });
  function hit(C, m) {
    const t = now(), A = C.p, k = typeof m.k === 'string' && m.k in PVP.dmg ? m.k : null; if (!A || !k || !Number.isInteger(m.i)) return;
    const S = st(C); if (t - S.hitT < PVP.gap || S.ko > t) return;
    const D = byId(m.i); if (!D || D === C || !D.user) return; const B = D.p, T = st(D);
    if (!A.has || A.h || A.v || !B.has || B.h || B.v) return;
    if (T.ko > t) return;
    if (T.guard > t) return no(C, B.id, T.fresh ? `${B.name} just came online. Leave am small.` : `${B.name} don fall already. Leave am.`);
    const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
    if (d > PVP.reach[k] + PVP.slack || Math.abs(A.y - B.y) > 1.6) return;
    if (d > .6) { let da = Math.atan2(dx, dz) - A.r; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) > PVP.cone) return; }
    S.hitT = t; S.guard = 0; S.fresh = false;   // you started it: no more protection for you
    const dmg = Math.round(PVP.dmg[k] * (.9 + rand() * .2));
    T.dmg = points(D, t) + dmg; T.last = t;
    ctx.send(D, { t: 'hurt', i: A.id, n: A.name, k, d: dmg, x: A.x, z: A.z, p: Math.min(100, Math.round(T.dmg)) });
    ctx.send(C, { t: 'hitok', i: B.id, k, d: dmg, p: Math.min(100, Math.round(T.dmg)) });
    if (T.dmg < PVP.full) return;
    // knocked out
    T.dmg = 0; T.ko = t + PVP.ko; T.guard = t + PVP.guard; T.fresh = false;
    let took = 0;
    if (D.cash >= PVP.robMin) { took = Math.min(PVP.robMax, Math.round(D.cash * PVP.rob / 50) * 50); if (took > 0 && ctx.spend(D, took, 'knocked out by ' + C.user.name)) ctx.give(C, took, 'knocked out ' + D.user.name); else took = 0; }
    ctx.send(D, { t: 'pko', i: A.id, n: A.name, took });
    ctx.send(C, { t: 'pkowin', i: B.id, n: B.name, took });
    log('ko', C.user.name, '->', D.user.name, took);
    if (ctx.onKo) ctx.onKo(C, D);
  }
  return {
    hit,
    hello(C) { const s = st(C); s.guard = now() + PVP.fresh; s.fresh = true; s.dmg = 0; s.ko = 0; },
    points: C => points(C, now()),
  };
}
