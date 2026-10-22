// Romance between real players, for grown-ups only.
//
// Your date of birth is asked when you make an account (and once, for accounts made before); only the day you turn 18
// is kept, it is set once and can't be changed by the player. Romance is OFF until you turn it on, and only players who
// are 18+ and have it on can be asked or ask. Then: ask a player standing near you to be your partner (they accept, say
// no or block you); partners standing together can ask for a kiss (the other accepts or says no). Everybody near sees the
// hearts. A "no" keeps you from asking that player again for half an hour; a block for good. Either partner can end it.
export const LOVE = { near: 12, kissNear: 3.2, askCd: 20e3, kissCd: 15e3, noCd: 30 * 60e3, pend: 60e3, fxR: 60, blockMax: 200 };
// the moment somebody born on dob (YYYY-MM-DD) turns 18 (Lagos time), or null if it is not a real date of birth
export function adultAtFrom(dob, t = Date.now()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || '')); if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3], born = Date.UTC(y, mo - 1, d) - 3600e3;
  const back = new Date(born + 3600e3); if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;   // 2001-02-30 and the like
  if (born > t || y < 1900) return null;
  return Date.UTC(y + 18, mo - 1, d) - 3600e3;
}
export function createLove({ db, now = () => Date.now(), log = () => {}, ctx }) {
  const raw = db.raw;
  raw.exec('CREATE TABLE IF NOT EXISTS rom(uid INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL);');
  const S = { get: raw.prepare('SELECT data FROM rom WHERE uid=?'), put: raw.prepare('INSERT INTO rom(uid,data) VALUES(?,?) ON CONFLICT(uid) DO UPDATE SET data=excluded.data') };
  const blank = () => ({ adultAt: 0, on: 0, partner: 0, pname: '', since: 0, block: [] });
  function get(uid) { let d = null; try { const r = S.get.get(uid); d = r ? JSON.parse(r.data) : null; } catch (e) { d = null; } d = { ...blank(), ...(d || {}) };
    if (d.partner && !db.userById(d.partner)) { d.partner = 0; d.pname = ''; }   // the partner's account is gone
    return d; }
  const put = (uid, d) => S.put.run(uid, JSON.stringify(d));
  const adult = d => !!d.adultAt && now() >= d.adultAt;
  const byPid = pid => { for (const D of ctx.online.values()) if (D.p && D.user && D.p.id === pid) return D; return null; };
  const dist = (A, B) => (A.p && B.p && A.p.has && B.p.has) ? Math.hypot(A.p.x - B.p.x, A.p.z - B.p.z) : 1e9;
  const noUntil = new Map();   // "asker:target" -> until (after a no)
  function tag(C, d) { if (!C || !C.p) return; const pt = d.partner ? d.pname : ''; if ((C.p.pt || '') !== pt) { C.p.pt = pt; C.p.lv++; C.p.ver++; } }
  function me(C, d = get(C.user.id)) { ctx.send(C, { t: 'romme', m: { known: !!d.adultAt, adult: adult(d), on: !!d.on, partner: d.partner ? d.pname : '' } }); tag(C, d); }
  function hello(C) { me(C); }
  function setDob(uid, dob) { const d = get(uid); if (d.adultAt) return false; const a = adultAtFrom(dob, now()); if (!a) return false; d.adultAt = a; put(uid, d); return true; }
  function handle(C, m) {
    const uid = C.user.id, d = get(uid), t = now(), err = s => ctx.err(C, 'rom', s);
    switch (m.a) {
      case 'me': return me(C, d);
      case 'age': {
        if (d.adultAt) return err('Your date of birth is set already.');
        const a = adultAtFrom(m.dob, t); if (!a) return err('Check the date of birth.');
        d.adultAt = a; put(uid, d); me(C, d); return ctx.ok(C, 'rom', t >= a ? 'Thank you. Romance with players is there for you (turn it on in the Love app).' : 'Romance with players is for 18+ only.');
      }
      case 'on': { if (!adult(d)) return err('Romance with players is for 18+ only.'); d.on = m.on ? 1 : 0; put(uid, d); return me(C, d); }
      case 'ask': case 'kiss': {
        const kiss = m.a === 'kiss', D = byPid(m.i | 0);
        if (!adult(d) || !d.on) return err('Turn on romance in the Love app first (18+).');
        if (!D || D === C) return err('That player is not here.');
        const e = get(D.user.id);
        if (kiss) { if (d.partner !== D.user.id) return err('You can only kiss your partner.'); if (dist(C, D) > LOVE.kissNear) return err('Stand close to your partner first.');
          if (t - (C.romKiss || 0) < LOVE.kissCd) return err('Wait small.'); C.romKiss = t; }
        else { if (d.partner) return err('You have a partner already.'); if (dist(C, D) > LOVE.near) return err('Go closer to that player.');
          if (t - (C.romAsk || 0) < LOVE.askCd) return err('Wait small before you ask again.');
          if (!adult(e) || !e.on || e.partner || (e.block || []).includes(uid) || (noUntil.get(uid + ':' + D.user.id) || 0) > t) return err(`${D.user.name} can't take requests now.`);
          C.romAsk = t; }
        if (kiss && (!adult(e) || !e.on || e.partner !== uid)) return err(`${D.user.name} can't take requests now.`);
        D.romPend = { from: uid, pid: C.p.id, k: kiss ? 'kiss' : 'rel', t };
        ctx.send(D, { t: 'romask', k: kiss ? 'kiss' : 'rel', i: C.p.id, n: C.user.name });
        return ctx.ok(C, 'rom', kiss ? `You lean in… waiting for ${D.user.name}.` : `You asked ${D.user.name}. Wait for the answer.`);
      }
      case 'yes': case 'no': case 'block': {
        const P = C.romPend; if (!P || P.pid !== (m.i | 0) || t - P.t > LOVE.pend) return err('That request is over.');
        C.romPend = null; const A = byPid(P.pid);
        if (m.a === 'block') { d.block = [...new Set([...(d.block || []), P.from])].slice(-LOVE.blockMax); put(uid, d); }
        if (m.a !== 'yes') { if (P.k === 'rel') noUntil.set(P.from + ':' + uid, t + LOVE.noCd); if (A) ctx.send(A, { t: 'romno', k: P.k, n: C.user.name }); return ctx.ok(C, 'rom', m.a === 'block' ? 'Blocked. They can\'t ask you again.' : 'You said no.'); }
        if (!A) return err('They are gone.');
        const a = get(P.from);
        if (P.k === 'rel') {
          if (!adult(d) || !d.on || d.partner || !adult(a) || !a.on || a.partner) return err('That can\'t happen now.');
          d.partner = P.from; d.pname = A.user.name; d.since = t; a.partner = uid; a.pname = C.user.name; a.since = t; put(uid, d); put(P.from, a);
          ctx.send(A, { t: 'romok', n: C.user.name }); ctx.send(C, { t: 'romok', n: A.user.name }); me(A, a); me(C, d); log('couple', A.user.name, C.user.name); return;
        }
        if (d.partner !== P.from || dist(A, C) > LOVE.kissNear + 1.5) return err('Too far now.');
        const fx = JSON.stringify({ t: 'kissfx', a: A.p.id, b: C.p.id, n: [A.user.name, C.user.name] });
        for (const D of ctx.online.values()) if (D.p && D.p.has && Math.hypot(D.p.x - C.p.x, D.p.z - C.p.z) <= LOVE.fxR) D.ws.send(fx);
        return;
      }
      case 'end': {
        if (!d.partner) return err('You have no partner.');
        const other = d.partner, o = get(other), n = d.pname; d.partner = 0; d.pname = ''; put(uid, d);
        if (o.partner === uid) { o.partner = 0; o.pname = ''; put(other, o); }
        const O = ctx.online.get(other); if (O) { ctx.send(O, { t: 'romend', n: C.user.name }); me(O, o); }
        me(C, d); return ctx.ok(C, 'rom', `You and ${n} are not together any more.`);
      }
    }
  }
  return { hello, handle, setDob, get };
}
