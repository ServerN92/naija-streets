// Lagos politics: the seats, the weekly election, the purse.
//
// 5% of every job payment goes into the Lagos purse. Seats: four councillors (Mushin, Agege, Oshodi, Ikeja), two LG
// chairmen (Mushin LG, Ikeja LG), one senator (Lagos West), one Governor. Every real week (Lagos time): Monday to Friday
// anybody with the rank can declare at a fee (into the purse); Saturday until 8 pm everybody online votes once per
// seat on the phone; at 8 pm the winners take the seats for the week. NPC candidates stand too (a few votes each), so
// an empty race still has a result, and a player with friends beats them. Holders are paid a salary from the purse every
// real day (only what the purse has). The title shows on the name tag.
export const POL = {
  seats: [
    { id: 'c_mushin', k: 'councillor', name: 'Councillor, Mushin Ward', title: 'Hon.', rank: 3, fee: 50000, pay: 100000, npc: ['Baba Ijebu', 'Iya Risi'] },
    { id: 'c_agege', k: 'councillor', name: 'Councillor, Agege Ward', title: 'Hon.', rank: 3, fee: 50000, pay: 100000, npc: ['Alhaji Rasaq', 'Mama Nkechi'] },
    { id: 'c_oshodi', k: 'councillor', name: 'Councillor, Oshodi Ward', title: 'Hon.', rank: 3, fee: 50000, pay: 100000, npc: ['Oga Kunle', 'Sister Bola'] },
    { id: 'c_ikeja', k: 'councillor', name: 'Councillor, Ikeja Ward', title: 'Hon.', rank: 3, fee: 50000, pay: 100000, npc: ['Barrister Femi', 'Madam Gold'] },
    { id: 'lg_mushin', k: 'chairman', name: 'Chairman, Mushin LG', title: 'Chairman', rank: 4, fee: 300000, pay: 300000, npc: ['Chief Adewale', 'Hon. Chidinma'] },
    { id: 'lg_ikeja', k: 'chairman', name: 'Chairman, Ikeja LG', title: 'Chairman', rank: 4, fee: 300000, pay: 300000, npc: ['Otunba Segun', 'Dr. Amaka'] },
    { id: 'sen', k: 'senator', name: 'Senator, Lagos West', title: 'Sen.', rank: 5, fee: 1000000, pay: 600000, npc: ['Senator Olu', 'Prof. Ngozi'] },
    { id: 'gov', k: 'governor', name: 'Governor of Lagos', title: 'His Excellency', rank: 6, fee: 2000000, pay: 1500000, npc: ['Chief Babatunde', 'Alhaja Folake'] },
  ],
  tax: .05, week: 7 * 864e5, tz: 3600e3, declareEnd: 5 / 7, voteEnd: 5 / 7 + 20 / 24 / 7, minAge: 864e5, npcVotes: [1, 2], tick: 30e3,
};
export function tunePol(env) { if (env.POL_WEEK_MS) POL.week = +env.POL_WEEK_MS; if (env.POL_MIN_AGE_MS) POL.minAge = +env.POL_MIN_AGE_MS; if (env.POL_TICK_MS) POL.tick = +env.POL_TICK_MS; if (env.POL_RANK) for (const s of POL.seats) s.rank = Math.min(s.rank, +env.POL_RANK); }
export function createPolitics({ db, now = () => Date.now(), log = () => {}, ctx }) {
  const raw = db.raw;
  raw.exec('CREATE TABLE IF NOT EXISTS pol(k TEXT PRIMARY KEY, v TEXT NOT NULL);');
  const S = { get: raw.prepare('SELECT v FROM pol WHERE k=?'), put: raw.prepare('INSERT INTO pol(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v') };
  const get = (k, d) => { try { const r = S.get.get(k); return r ? JSON.parse(r.v) : d; } catch (e) { return d; } };
  const put = (k, v) => S.put.run(k, JSON.stringify(v));
  const seatOf = id => POL.seats.find(s => s.id === id);
  // the week and its phase (Lagos time; the week turns on Monday 00:00)
  const weekOf = t => Math.floor((t + POL.tz - 4 * 864e5) / POL.week);   // (1970-01-05 was a Monday)
  const frac = t => ((t + POL.tz - 4 * 864e5) % POL.week) / POL.week;
  const phase = t => { const f = frac(t); return f < POL.declareEnd ? 'declare' : f < POL.voteEnd ? 'vote' : 'done'; };
  const weekRec = w => get('week:' + w, { cands: {}, votes: {}, result: null });
  const purse = () => get('purse', 0) | 0;
  const addPurse = n => { const v = Math.max(0, purse() + Math.round(n)); put('purse', v); return v; };
  const holders = () => get('holders', {});
  const titleOf = uid => { for (const [sid, h] of Object.entries(holders())) if (h && h.uid === uid) return seatOf(sid).title; return ''; };
  function tag(C) { if (!C.p || !C.user) return; const po = titleOf(C.user.id); if ((C.p.po || '') !== po) { C.p.po = po; C.p.lv++; C.p.ver++; } }
  function tax(C, g) { const n = Math.round(g * POL.tax); if (n <= 0) return 0; addPurse(n); return n; }   // (the client already shows the net pay; the tax is on top of the oga cut)
  function cands(w, sid) { const R = weekRec(w), L = R.cands[sid] || []; const s = seatOf(sid); return [...s.npc.map((n, i) => ({ uid: -(i + 1), name: n, npc: true })), ...L]; }
  function state(C) {
    const t = now(), w = weekOf(t), R = weekRec(w), H = holders(), ph = phase(t), uid = C.user.id, f = frac(t);
    const endAt = t + Math.round(((ph === 'declare' ? POL.declareEnd : ph === 'vote' ? POL.voteEnd : 1) - f) * POL.week);
    return { t: 'polme', m: { phase: ph, week: w, endAt, purse: purse(), rank: C.p ? C.p.rk | 0 : 0, title: titleOf(uid),
      seats: POL.seats.map(s => ({ id: s.id, k: s.k, name: s.name, title: s.title, rank: s.rank, fee: s.fee, pay: s.pay, holder: H[s.id] ? { name: H[s.id].name, npc: !!H[s.id].npc, me: H[s.id].uid === uid } : null,
        cands: cands(w, s.id).map(c => ({ name: c.name, npc: !!c.npc, me: c.uid === uid, votes: R.result && R.result[s.id] ? (R.result[s.id].tally[c.name] | 0) : undefined })),
        mine: (R.cands[s.id] || []).some(c => c.uid === uid), voted: R.votes[s.id] ? R.votes[s.id][uid] || '' : '',
        won: R.result && R.result[s.id] ? R.result[s.id].name : '' })) } };
  }
  const me = C => { ctx.send(C, state(C)); tag(C); };
  function hello(C) { me(C); }
  function handle(C, m) {
    const uid = C.user.id, t = now(), w = weekOf(t), ph = phase(t), err = s => ctx.err(C, 'pol', s);
    switch (m.a) {
      case 'me': return me(C);
      case 'declare': {
        const s = seatOf(m.seat); if (!s) return err('No such seat.'); if (ph !== 'declare') return err('Declarations are closed. Monday to Friday.');
        const R = weekRec(w); for (const L of Object.values(R.cands)) if (L.some(c => c.uid === uid)) return err('You already declared for a seat this week.');
        if ((C.p ? C.p.rk | 0 : 0) < s.rank) return err(`You need a higher rank for ${s.name}.`);
        if (!ctx.spend(C, s.fee, 'nomination ' + s.id)) return err(`The nomination fee is ₦${s.fee.toLocaleString('en-NG')}.`);
        addPurse(s.fee); (R.cands[s.id] = R.cands[s.id] || []).push({ uid, name: C.user.name, t }); put('week:' + w, R); log('declare', C.user.name, s.id);
        ctx.broadcast({ t: 'note', m: `🗳️ ${C.user.name} is running for ${s.name}! Vote on Saturday (Politics app).` }); me(C);
        return ctx.ok(C, 'pol', `You are on the ballot for ${s.name}. Campaign! Voting is Saturday.`);
      }
      case 'vote': {
        const s = seatOf(m.seat); if (!s) return err('No such seat.'); if (ph !== 'vote') return err('Voting is on Saturday, until 8 pm.');
        if (t - (C.user.created || 0) < POL.minAge) return err('New accounts cannot vote yet (one day old).');
        const R = weekRec(w); R.votes[s.id] = R.votes[s.id] || {}; if (R.votes[s.id][uid]) return err('You voted for this seat already.');
        const c = cands(w, s.id).find(c => c.name === String(m.c || '')); if (!c) return err('No such candidate.');
        R.votes[s.id][uid] = c.name; put('week:' + w, R); me(C); return ctx.ok(C, 'pol', `Your vote for ${c.name} (${s.name}) is counted.`);
      }
    }
  }
  // the count: Saturday 8 pm (or the first tick after it)
  function count(w) {
    const R = weekRec(w); if (R.result) return; const H = holders(), res = {}, rnd = s => { let x = 0; for (const ch of s) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x; };
    for (const s of POL.seats) {
      const tally = {}; for (const c of cands(w, s.id)) tally[c.name] = c.npc ? POL.npcVotes[0] + (rnd(c.name + w) % (POL.npcVotes[1] - POL.npcVotes[0] + 1)) : 0;
      for (const n of Object.values(R.votes[s.id] || {})) if (tally[n] != null) tally[n]++;
      const isNpc = n => s.npc.includes(n); let best = null; for (const [n, v] of Object.entries(tally)) if (!best || v > best.v || (v === best.v && isNpc(best.n) && !isNpc(n))) best = { n, v };   // (a tie goes to the player)
      const c = cands(w, s.id).find(c => c.name === best.n); res[s.id] = { name: best.n, votes: best.v, tally };
      H[s.id] = { uid: c.npc ? 0 : c.uid, name: c.name, npc: !!c.npc, since: now(), seat: s.id };
      if (!c.npc) { log('elected', c.name, s.id); ctx.broadcast({ t: 'note', m: `🏆 ${c.name} wins ${s.name} with ${best.v} votes! ${s.title} ${c.name}.` }); }
    }
    R.result = res; put('week:' + w, R); put('holders', H);
    for (const C of ctx.online.values()) if (C.user) me(C);
  }
  // salaries: once a real day (Lagos), from the purse
  function pay() {
    const d = Math.floor((now() + POL.tz) / 864e5); if (get('paid', 0) === d) return; put('paid', d);
    const H = holders(); for (const s of POL.seats) { const h = H[s.id]; if (!h || h.npc || !h.uid) continue; const n = Math.min(purse(), s.pay); if (n <= 0) continue; addPurse(-n); ctx.credit(h.uid, n, 'salary ' + s.id, `🏛️ Your salary as ${s.name}: ₦${n.toLocaleString('en-NG')} from the Lagos purse.`); log('salary', h.name, n); }
  }
  function tick() { const t = now(), w = weekOf(t); if (phase(t) === 'done') count(w); pay(); }
  return { hello, handle, tax, tick, count, purse, titleOf, state };
}
