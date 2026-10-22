// Yahoo boys and the EFCC (the game's story of it: no real scam is taught, the "work" is a laptop with a progress bar).
//
// A man pays the Oga ₦200,000 at his mansion and learns for 7 real days: one lesson a day, at a desk in the Oga's room
// (the phone reports a lesson done; the server keeps the days). Miss two days in a row and the Oga drops you (the money is
// gone). Day 7: you graduate with ₦1,500,000 and work on your own: a cash-out every 2 days, bigger the longer you last
// (₦150k up), but every naira of it is dirty: the EFCC compare your things with your legit income. Caught, you lose it all.
// Bail: a friend pays ₦500,000 at the bank and you walk. The server keeps the money side so nobody can fake it.
export const YH = { fee: 200000, grad: 1500000, days: 7, gap: 2 * 864e5, cashMin: 150000, cashMax: 400000, bail: 500000, dropAfter: 2 };
export function createYahoo({ db, now = () => Date.now(), log = () => {}, ctx }) {
  const raw = db.raw;
  raw.exec('CREATE TABLE IF NOT EXISTS yahoo(uid INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL);');
  const S = { get: raw.prepare('SELECT data FROM yahoo WHERE uid=?'), put: raw.prepare('INSERT INTO yahoo(uid,data) VALUES(?,?) ON CONFLICT(uid) DO UPDATE SET data=excluded.data'), del: raw.prepare('DELETE FROM yahoo WHERE uid=?') };
  const blank = () => ({ st: '', days: [], t0: 0, grad: 0, last: 0, n: 0, dirty: 0, jail: 0, caught: 0 });
  const get = uid => { try { const r = S.get.get(uid); return { ...blank(), ...(r ? JSON.parse(r.data) : {}) }; } catch (e) { return blank(); } };
  const put = (uid, d) => S.put.run(uid, JSON.stringify(d));
  const day = t => Math.floor(t / 864e5);
  const male = C => !!(C.p && C.p.look && C.p.look.g === 'm');
  function me(C, d = get(C.user.id)) { ctx.send(C, { t: 'yhme', m: { st: d.st, days: d.days.length, need: YH.days, grad: d.grad, last: d.last, n: d.n, dirty: d.dirty, jail: d.jail, caught: d.caught, nextCash: d.last ? d.last + YH.gap : 0, fee: YH.fee, bail: YH.bail } }); }
  function drop(C, d, why) { d.st = 'dropped'; d.days = []; put(C.user.id, d); ctx.send(C, { t: 'yhdrop', m: why }); me(C, d); }
  function hello(C) { const d = get(C.user.id); if (d.st === 'learn') { const last = d.days[d.days.length - 1] || day(d.t0); if (day(now()) - last > YH.dropAfter) { drop(C, d, 'You no come for lessons. The Oga don drop you. Your ₦200,000 don go.'); return; } } me(C, d); }
  function handle(C, m) {
    const uid = C.user.id, d = get(uid), t = now(), err = s => ctx.err(C, 'yh', s);
    switch (m.a) {
      case 'me': return me(C, d);
      case 'start': {
        if (!male(C)) return err('The Oga: "This work na for men. Comot."');
        if (d.st === 'learn' || d.st === 'free') return err('You dey already.');
        if (d.jail > t) return err('You dey EFCC custody.');
        if (!ctx.spend(C, YH.fee, 'yahoo fee')) return err(`The Oga: "₦200,000 or nothing. Go find money."`);
        Object.assign(d, blank(), { st: 'learn', t0: t, caught: d.caught }); put(uid, d); log('yahoo start', C.user.name); me(C, d);
        return ctx.ok(C, 'yh', 'The Oga: "Welcome to the game. Seven days, one lesson a day, at that desk. Miss two days and you are out."');
      }
      case 'lesson': {
        if (d.st !== 'learn') return err('You are not learning here.');
        const dy = day(t); if (d.days.includes(dy)) return err('Today\'s lesson is done. Come back tomorrow.');
        const last = d.days[d.days.length - 1] || day(d.t0); if (dy - last > YH.dropAfter) { drop(C, d, 'You no come for lessons. The Oga don drop you. Your ₦200,000 don go.'); return; }
        d.days.push(dy);
        if (d.days.length >= YH.days) { d.st = 'free'; d.grad = t; d.last = t; d.dirty += YH.grad; put(uid, d); ctx.give(C, YH.grad, 'yahoo grad'); log('yahoo grad', C.user.name); me(C, d); return ctx.send(C, { t: 'yhgrad', n: YH.grad }); }
        put(uid, d); me(C, d); return ctx.ok(C, 'yh', `Lesson ${d.days.length} of ${YH.days} done. ${YH.days - d.days.length} more day${YH.days - d.days.length === 1 ? '' : 's'}.`);
      }
      case 'cash': {
        if (d.st !== 'free') return err('You never graduate.');
        if (t < d.last + YH.gap) return err(`Not yet. Next cash-out in ${Math.ceil((d.last + YH.gap - t) / 3600e3)} hours.`);
        const n = Math.min(YH.cashMax, YH.cashMin + d.n * 50000); d.n++; d.last = t; d.dirty += n; put(uid, d); ctx.give(C, n, 'yahoo cashout'); log('yahoo cash', C.user.name, n); me(C, d);
        return ctx.send(C, { t: 'yhcash', n });
      }
      case 'caught': {   // the phone says the EFCC got you (it runs the stop); the server wipes the money and marks the custody
        if (d.st !== 'free' && d.st !== 'learn') return;
        const had = C.cash; if (had > 0) ctx.spend(C, had, 'efcc seizure'); d.st = 'caught'; d.caught = t; d.jail = t + 10 * 60e3; d.days = []; put(uid, d); log('efcc caught', C.user.name, had); me(C, d);
        return ctx.send(C, { t: 'yhcaught', n: had });
      }
      case 'bail': {   // a friend pays the bail for a player in custody
        const T = ctx.byName(m.n); if (!T) return err('No such player.'); if (T.user.id === uid) return err('You cannot bail yourself.');
        const e = get(T.user.id); if (!(e.jail > t)) return err(`${T.user.name} is not in EFCC custody.`);
        if (!ctx.spend(C, YH.bail, 'efcc bail')) return err(`Bail is ₦${YH.bail.toLocaleString('en-NG')}. You don't have it.`);
        e.jail = 0; put(T.user.id, e); log('efcc bail', C.user.name, T.user.name); me(T, e); ctx.send(T, { t: 'yhbail', n: C.user.name });
        return ctx.ok(C, 'yh', `You paid ${T.user.name}'s bail. They are free.`);
      }
    }
  }
  return { hello, handle, get };
}
