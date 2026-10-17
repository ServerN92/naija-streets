// The police online: who is wanted, and players who join the force to catch them. Decided on the server.
//
// Stars: knocking out a player gives you a star (two if they were police on duty); hitting a police officer on duty,
// one. They go one by one when you keep quiet (a star every 2.5 minutes). Your phone also tells the server the stars
// the street police gave you (for street crimes), and your wanted level is the higher of the two. Everybody near you
// sees your stars on your name.
// The force: join at Mushin police station (with no stars on you), go on duty, and you wear the uniform. On duty you
// see every wanted player in Lagos and where they are. Knock a wanted player down (or catch one who surrenders) and
// arrest them: they go to the cell and lose their stars; you are paid by the force (more for the crimes the server
// saw itself), and arrests raise your rank. A police officer who knocks out somebody who is not wanted is sacked from
// duty for a day and gets the stars himself. Officers on duty do not take anybody's pocket money.
export const LAW = {
  koStars: 1, copKoStars: 2, copHitStars: 1, badCopStars: 2, max: 5, decay: 150e3,
  reward: { srv: 5000, local: 1500 }, rewardCap: 25000, dayCap: 80000, pairCool: 30 * 60e3,
  arrestR: 3.2, cuffWin: 12e3, surrender: 12e3, dutyMaxStars: 1, ban: 24 * 3600e3,
  ranks: [[0, 'Constable'], [3, 'Corporal'], [10, 'Sergeant'], [25, 'Inspector'], [60, 'ASP'], [120, 'CSP']],
};
const dayKey = t => new Date(t + 3600e3).toISOString().slice(0, 10);
export const rankName = n => { let r = LAW.ranks[0][1]; for (const [k, name] of LAW.ranks) if (n >= k) r = name; return r; };

export function createLaw({ db, now = () => Date.now(), log = () => {}, ctx }) {
  const st = C => C.law || (C.law = { duty: false, local: 0, srv: 0, last: 0, cuffT: 0, hands: 0, ws: 0, hitT: 0 });
  const recOf = uid => { const r = db.lawGet(uid); let d = null; try { d = r ? JSON.parse(r.data) : null; } catch (e) { d = null; } return { cop: 0, arrests: 0, earned: 0, day: { k: '', earned: 0 }, ban: 0, pairs: {}, ...(d || {}) }; };
  const save = (uid, d) => db.lawPut(uid, JSON.stringify(d));
  const keep = new Map();   // account -> the server's stars, so signing out and in again does not clear them
  const remember = C => { const s = st(C); if (C.user) { if (s.srv > 0) keep.set(C.user.id, { srv: s.srv, last: s.last }); else keep.delete(C.user.id); } };
  function srvNow(C, t = now()) {   // the server's own stars, after the quiet time has worn some off
    const s = st(C); if (s.srv > 0 && s.last) { const gone = Math.floor((t - s.last) / LAW.decay); if (gone > 0) { s.srv = Math.max(0, s.srv - gone); s.last += gone * LAW.decay; } }
    return s.srv;
  }
  const stars = (C, t) => Math.min(LAW.max, Math.max(st(C).local | 0, srvNow(C, t)));
  const onDuty = C => !!(C && C.law && C.law.duty);
  const err = (C, m) => ctx.err(C, 'law', m), ok = (C, m) => ctx.ok(C, 'law', m);
  function crime(C, n, why) {
    const s = st(C), t = now(); srvNow(C, t); s.srv = Math.min(LAW.max, s.srv + n); s.last = t; remember(C); refresh(C);
    if (s.duty && stars(C, t) > LAW.dutyMaxStars) { s.duty = false; ctx.badge(C.user.id); ok(C, 'Wanted officers cannot be on duty. You are off duty.'); me(C); }
    log('crime', C.user && C.user.name, why, stars(C, t));
  }
  function refresh(C) {   // the stars on your name, for everybody near you
    const w = stars(C); if (C.p && C.p.ws !== w) { C.p.ws = w; C.p.lv++; C.p.ver++; }
  }
  function me(C) {
    const d = C.lawRec || (C.lawRec = recOf(C.user.id)), t = now();
    ctx.send(C, { t: 'lawme', m: { cop: !!d.cop, duty: onDuty(C), rank: rankName(d.arrests), arrests: d.arrests, earned: d.earned, today: d.day.k === dayKey(t) ? d.day.earned : 0, ban: d.ban > t ? d.ban - t : 0, stars: stars(C, t), srv: srvNow(C, t) } });
  }

  // ---- what the server sees itself (from the player fights)
  function hit(A, D) {   // a blow landed
    if (onDuty(D) && !onDuty(A)) { const s = st(A), t = now(); if (t - s.hitT > 30e3) { s.hitT = t; crime(A, LAW.copHitStars, 'hit police'); } }
  }
  function ko(A, D) {    // a knock-out
    const t = now();
    if (onDuty(A)) {
      if (stars(D, t) >= 1) { st(D).cuffT = t + LAW.cuffWin + 5e3; ctx.send(A, { t: 'lawcuff', i: D.p.id, n: D.user.name }); return; }
      // an officer beat down somebody who was not wanted: sacked from duty for a day, and wanted himself
      const d = A.lawRec || (A.lawRec = recOf(A.user.id)); d.ban = t + LAW.ban; save(A.user.id, d);
      st(A).duty = false; ctx.badge(A.user.id); crime(A, LAW.badCopStars, 'bad cop');
      ctx.send(A, { t: 'note', m: `You beat down ${D.user.name}, who did nothing. You are suspended from duty for a day, and now you are wanted.` }); me(A);
      return;
    }
    crime(A, onDuty(D) ? LAW.copKoStars : LAW.koStars, onDuty(D) ? 'ko police' : 'ko player');
  }
  const noRob = A => onDuty(A);

  // ---- what players ask for: {t:'law', a, ...}
  function handle(C, m) {
    const t = now(), s = st(C), uid = C.user.id, d = C.lawRec || (C.lawRec = recOf(uid));
    switch (m.a) {
      case 'info': return me(C);
      case 'stars': { const n = Number.isInteger(m.n) ? Math.max(0, Math.min(LAW.max, m.n)) : 0; s.local = n; refresh(C); if (s.duty && stars(C, t) > LAW.dutyMaxStars) { s.duty = false; ctx.badge(uid); ok(C, 'Wanted officers cannot be on duty. You are off duty.'); me(C); } return; }
      case 'surrender': if (stars(C, t) >= 1) { s.hands = t + LAW.surrender; ctx.send(C, { t: 'lawhands' }); } return;
      case 'join': {
        if (d.cop) return err(C, 'You are in the force already.');
        if (stars(C, t) > 0) return err(C, 'The police do not take people who are wanted. Lose your stars first.');
        d.cop = 1; d.joined = t; save(uid, d); ok(C, `Welcome to the force, Constable ${C.user.name}! Go on duty to wear the uniform and see who is wanted.`); return me(C);
      }
      case 'quit': { if (!d.cop) return; d.cop = 0; save(uid, d); if (s.duty) { s.duty = false; ctx.badge(uid); } ok(C, 'You left the police. Your arrests stay on the book.'); return me(C); }
      case 'duty': {
        if (!d.cop) return err(C, 'Join the force at the police station first.');
        const on = !!m.on;
        if (on && d.ban > t) return err(C, `You are suspended from duty for ${Math.ceil((d.ban - t) / 36e5)} more hours.`);
        if (on && stars(C, t) > 0) return err(C, 'You are wanted. Wanted officers cannot go on duty.');
        if (s.duty !== on) { s.duty = on; ctx.badge(uid); }
        ok(C, on ? `On duty, ${rankName(d.arrests)} ${C.user.name}. The wanted list is on your screen.` : 'Off duty.'); pushWanted(); return me(C);
      }
      case 'arrest': return arrest(C, m);
    }
  }
  function byId(id) { for (const C of ctx.online.values()) if (C.p && C.p.id === id) return C; return null; }
  function arrest(A, m) {
    const t = now(); if (!onDuty(A)) return err(A, 'Only officers on duty can arrest people.');
    const D = Number.isInteger(m.i) ? byId(m.i) : null; if (!D || D === A || !D.user) return;
    const n = stars(D, t), sD = st(D);
    if (n < 1) return err(A, `${D.user.name} is not wanted.`);
    if (!(sD.cuffT > t || sD.hands > t)) return err(A, `Knock ${D.user.name} down first (or wait for a surrender).`);
    const P = A.p, Q = D.p; if (!P || !Q || !P.has || !Q.has || P.v || Q.v || Math.hypot(P.x - Q.x, P.z - Q.z) > LAW.arrestR) return err(A, 'Go closer.');
    // the reward: more for the crimes the server saw itself; not again for the same person within half an hour
    const d = A.lawRec || (A.lawRec = recOf(A.user.id)), k = dayKey(t); if (d.day.k !== k) d.day = { k, earned: 0 };
    const srv = srvNow(D, t), loc = Math.max(0, n - srv);
    let reward = Math.min(LAW.rewardCap, srv * LAW.reward.srv + loc * LAW.reward.local);
    const pairT = d.pairs[D.user.id] || 0; if (t - pairT < LAW.pairCool) reward = 0;
    reward = Math.max(0, Math.min(reward, LAW.dayCap - d.day.earned));
    const r0 = rankName(d.arrests);
    d.arrests++; d.earned += reward; d.day.earned += reward; d.pairs[D.user.id] = t;
    for (const [u, pt] of Object.entries(d.pairs)) if (t - pt > LAW.pairCool) delete d.pairs[u];
    save(A.user.id, d);
    if (reward > 0) ctx.give(A, reward, 'arrest ' + D.user.name);
    Object.assign(sD, { srv: 0, local: 0, last: 0, cuffT: 0, hands: 0 }); remember(D); refresh(D);
    ctx.send(D, { t: 'arrested', by: A.user.name, n });
    ctx.send(A, { t: 'arrestok', i: Q.id, n: D.user.name, s: n, reward, rank: rankName(d.arrests), up: rankName(d.arrests) !== r0 });
    log('arrest', A.user.name, '->', D.user.name, n, reward);
    me(A); pushWanted();
  }

  // ---- every 2 s: stars wear off, and the officers on duty get the wanted list
  let lastW = '';
  function pushWanted(force) {
    const t = now(), l = [];
    for (const C of ctx.online.values()) { if (!C.p || !C.p.has || !C.user) continue; const n = stars(C, t); if (n >= 1) l.push([C.p.id, C.user.name, n, Math.round(C.p.x), Math.round(C.p.z), C.p.v ? 1 : 0, C.p.h ? 1 : 0]); }
    const s = JSON.stringify(l); if (!force && s === lastW) return; lastW = s;
    for (const C of ctx.online.values()) if (onDuty(C) && C.ws.open) ctx.send(C, { t: 'wanted', l: l.filter(x => x[0] !== C.p.id) });
  }
  function tick() { for (const C of ctx.online.values()) if (C.user && C.p) refresh(C); pushWanted(); }
  function hello(C) { C.law = null; C.lawRec = recOf(C.user.id); const s = st(C), w = keep.get(C.user.id); if (w) { s.srv = w.srv; s.last = w.last; } refresh(C); me(C); }
  return { handle, hit, ko, noRob, onDuty, stars, tick, hello, crime };
}
