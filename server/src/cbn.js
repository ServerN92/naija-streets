// The Central Bank of Nigeria online: the best-paid job in Lagos, and the hardest to get.
//
// You apply on the CBN app on your phone with a letter (why you want to work with us). The Governor (a player: the
// highest-ranked worker in the bank) reads the letters and accepts or rejects them, and can write you a message.
// While nobody holds the Governor's seat, the Board reads the letters itself (slowly, and strictly), so the bank can
// grow until somebody climbs all the way up. Rejected: try again after a day.
// Staff work one shift a day at their desk on the 12th floor (the game asks to start it, and the shift must really be
// worked: SHIFT_MS at least). Each shift pays by rank and counts toward the next rank. Director and Deputy Governor
// need the Governor's approval too (the Board's while the seat is empty). A Deputy Governor with enough shifts takes
// the Governor's seat when it is empty; a Governor who stays away too long loses it (back to Deputy Governor).
export const CBN = {
  //  name,               shifts to reach, pay per shift, needs approval
  ranks: [['Clerk', 0, 100000], ['Officer', 5, 150000], ['Senior Officer', 12, 250000], ['Manager', 22, 400000],
    ['Assistant Director', 35, 550000], ['Director', 50, 700000, 1], ['Deputy Governor', 70, 850000, 1], ['Governor', 100, 1000000, 1]],
  shiftMs: 2 * 60e3,           // a shift is at least this long at the desk
  shiftOpen: 30 * 60e3,        // and must be finished within this
  letter: [80, 1200],          // letter length (characters)
  msgMax: 400,                 // the Governor's message
  retry: 24 * 3600e3,          // after a rejection
  boardWait: 30 * 60e3,        // the Board decides letters and promotions this long after they come (no Governor)
  govAway: 7 * 864e5,          // a Governor not seen this long loses the seat
  listMax: 30,
};
const GOV = CBN.ranks.length - 1;
const dayKey = t => new Date(t + 3600e3).toISOString().slice(0, 10);   // Lagos day
export const rankOf = shifts => { let r = 0; CBN.ranks.forEach(([, k], i) => { if (shifts >= k && i < GOV) r = i; }); return r; };

export function createCbn({ db, now = () => Date.now(), log = () => {}, ctx }) {
  const raw = db.raw;
  raw.exec(`CREATE TABLE IF NOT EXISTS cbn(uid INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cbn_app(id INTEGER PRIMARY KEY, uid INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL,
      t INTEGER NOT NULL, letter TEXT, st TEXT NOT NULL DEFAULT 'wait', msg TEXT, by TEXT, rt INTEGER, rank INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS cbn_app_st ON cbn_app(st, t);
    CREATE INDEX IF NOT EXISTS cbn_app_uid ON cbn_app(uid, t);`);
  const q = s => raw.prepare(s);
  const S = {
    get: q('SELECT data FROM cbn WHERE uid=?'), put: q('INSERT INTO cbn(uid,data) VALUES(?,?) ON CONFLICT(uid) DO UPDATE SET data=excluded.data'),
    staff: q("SELECT c.uid, c.data, u.name, u.seen FROM cbn c JOIN users u ON u.id=c.uid WHERE json_extract(c.data,'$.on')=1"),
    addApp: q('INSERT INTO cbn_app(uid,kind,t,letter,rank) VALUES(?,?,?,?,?)'),
    waiting: q("SELECT a.*, u.name FROM cbn_app a JOIN users u ON u.id=a.uid WHERE a.st='wait' ORDER BY a.t LIMIT ?"),
    mine: q('SELECT * FROM cbn_app WHERE uid=? ORDER BY t DESC LIMIT 5'),
    app: q("SELECT a.*, u.name FROM cbn_app a JOIN users u ON u.id=a.uid WHERE a.id=?"),
    decide: q("UPDATE cbn_app SET st=?, msg=?, by=?, rt=? WHERE id=? AND st='wait'"),
    old: q("SELECT a.*, u.name FROM cbn_app a JOIN users u ON u.id=a.uid WHERE a.st='wait' AND a.t<?"),
  };
  const recOf = uid => { const r = S.get.get(uid); let d = null; try { d = r ? JSON.parse(r.data) : null; } catch (e) { d = null; } return { on: 0, shifts: 0, rank: 0, earned: 0, day: '', start: 0, joined: 0, ...(d || {}) }; };
  const save = (uid, d) => S.put.run(uid, JSON.stringify(d));
  const err = (C, m) => ctx.err(C, 'cbn', m), ok = (C, m) => ctx.ok(C, 'cbn', m);
  const title = r => CBN.ranks[r][0];
  const clean = s => {   // the chat cleaner works on short lines: a letter goes through it in pieces
    if (typeof s !== 'string') return ''; const out = []; let cur = '';
    for (const w of s.replace(/\s+/g, ' ').trim().slice(0, 4000).split(' ')) { if ((cur + ' ' + w).length > 110 && cur) { out.push(ctx.clean(cur)); cur = w; } else cur = cur ? cur + ' ' + w : w; }
    if (cur) out.push(ctx.clean(cur)); return out.join(' ').trim(); };

  function governor() {   // the seat, checked: a Governor away too long goes back to Deputy Governor
    const t = now(); let g = null;
    for (const r of S.staff.all()) { let d; try { d = JSON.parse(r.data); } catch (e) { continue; }
      if (d.rank !== GOV) continue;
      if (t - r.seen > CBN.govAway && !ctx.online.has(r.uid)) { d.rank = GOV - 1; save(r.uid, d); log('cbn governor away', r.name); continue; }
      if (!g) g = { uid: r.uid, name: r.name }; else { d.rank = GOV - 1; save(r.uid, d); } }
    return g;
  }
  function staffList() {
    const l = []; for (const r of S.staff.all()) { let d; try { d = JSON.parse(r.data); } catch (e) { continue; } l.push({ n: r.name, r: d.rank, s: d.shifts, on: ctx.online.has(r.uid) ? 1 : 0 }); }
    return l.sort((a, b) => b.r - a.r || b.s - a.s).slice(0, CBN.listMax);
  }
  function me(C) {
    const uid = C.user.id, d = C.cbn || (C.cbn = recOf(uid)), t = now(), g = governor();
    const apps = S.mine.all(uid).map(a => ({ id: a.id, k: a.kind, t: a.t, st: a.st, msg: a.msg || '', by: a.by || '', rt: a.rt || 0, r: a.rank }));
    const o = { on: d.on, rank: d.rank, title: title(d.rank), shifts: d.shifts, earned: d.earned, today: d.day === dayKey(t), working: d.start && t - d.start < CBN.shiftOpen ? d.start : 0,
      gov: g ? g.name : '', isGov: !!(g && g.uid === uid), ranks: CBN.ranks.map(([n, s, p, a]) => [n, s, p, a ? 1 : 0]), apps, staff: staffList(), shiftMs: CBN.shiftMs, letter: CBN.letter };
    if (o.isGov) o.queue = S.waiting.all(CBN.listMax).map(a => ({ id: a.id, n: a.name, k: a.kind, t: a.t, letter: a.letter || '', r: a.rank }));
    ctx.send(C, { t: 'cbnme', m: o });
  }
  function notify(uid, m) { const C = ctx.online.get(uid); if (C && C.user) { ctx.send(C, { t: 'note', m }); C.cbn = null; me(C); } }
  function govRefresh() { const g = governor(); if (g) { const G = ctx.online.get(g.uid); if (G && G.user) me(G); } }

  // the decision on a letter or a promotion (by the Governor, or the Board)
  function decide(a, yes, msg, by) {
    const t = now(); if (!S.decide.run(yes ? 'yes' : 'no', msg || '', by, t, a.id).changes) return false;
    const d = recOf(a.uid);
    if (a.kind === 'job') {
      if (yes) { Object.assign(d, { on: 1, shifts: d.shifts || 0, joined: t }); d.rank = Math.min(rankOf(d.shifts), 4); save(a.uid, d); }   // (back after resigning: never above Assistant Director without approval)
      notify(a.uid, yes ? `🏦 CBN: Your application is ACCEPTED${by === 'The Board' ? '' : ` by Governor ${by}`}! Welcome to the Central Bank, ${title(d.rank)}. Your desk is on the 12th floor.${msg ? ` Message: "${msg}"` : ''}`
        : `🏦 CBN: Your application was not accepted${by === 'The Board' ? ' by the Board' : ` by Governor ${by}`}.${msg ? ` Message: "${msg}"` : ''} You can apply again in 24 hours.`);
    } else if (a.kind === 'promo') {
      if (yes && d.on && d.rank === a.rank - 1) { d.rank = a.rank; save(a.uid, d); }
      notify(a.uid, yes ? `🏦 CBN: Promotion APPROVED! You are now ${title(a.rank)}.${msg ? ` Message: "${msg}"` : ''}` : `🏦 CBN: Your promotion to ${title(a.rank)} was not approved this time.${msg ? ` Message: "${msg}"` : ''} Keep working.`);
    }
    log('cbn', a.kind, a.name, yes ? 'yes' : 'no', 'by', by); return true;
  }
  // the Board, while the seat is empty: strict but fair, and slow
  function board() {
    if (governor()) return; const t = now();
    for (const a of S.old.all(t - CBN.boardWait)) {
      if (a.kind === 'job') {
        const L = (a.letter || '').trim(), words = L.split(/\s+/).filter(w => w.length > 2).length, wanted = ctx.stars ? ctx.stars(a.uid) : 0;
        const yes = !wanted && L.length >= 160 && words >= 25 && /\b(bank|nigeria|naira|work|serve|money|econom|honest|team)/i.test(L);
        decide(a, yes, yes ? 'The Board read your letter. Be honest, be on time.' : wanted ? 'The Board does not hire people the police are looking for.' : 'The Board wants a longer, more serious letter: tell us who you are and why the Central Bank.', 'The Board');
      } else decide(a, true, 'The Board approves. The bank needs leaders.', 'The Board');
    }
  }

  // ---- what players ask for: {t:'cbn', a, ...}
  function handle(C, m) {
    const t = now(), uid = C.user.id, d = C.cbn || (C.cbn = recOf(uid));
    switch (m.a) {
      case 'info': return me(C);
      case 'apply': {
        if (d.on) return err(C, 'You work at the CBN already.');
        const L = clean(m.letter); if (L.length < CBN.letter[0]) return err(C, `Write a real letter: at least ${CBN.letter[0]} characters.`);
        if (L.length > CBN.letter[1]) return err(C, `Keep the letter under ${CBN.letter[1]} characters.`);
        if (ctx.stars && ctx.stars(uid) > 0) return err(C, 'The CBN does not take applications from people the police are looking for.');
        const last = S.mine.all(uid).find(a => a.kind === 'job');
        if (last && last.st === 'wait') return err(C, 'Your letter is with the Governor already. Wait for the answer.');
        if (last && last.st === 'no' && t - (last.rt || last.t) < CBN.retry) return err(C, `You can apply again in ${Math.ceil((CBN.retry - (t - (last.rt || last.t))) / 36e5)} hours.`);
        S.addApp.run(uid, 'job', t, L, 0); log('cbn apply', C.user.name);
        ok(C, governor() ? 'Your letter is on the Governor\'s desk. You will get the answer on this app.' : 'There is no Governor now: the Board reads the letters. Expect the answer in about 30 minutes.');
        me(C); govRefresh(); return;
      }
      case 'start': {   // a shift starts at your desk
        if (!d.on) return err(C, 'Only CBN staff can work here. Apply on the CBN app.');
        if (d.day === dayKey(t)) return err(C, 'You have worked your shift today. Come back tomorrow.');
        d.start = t; save(uid, d); ctx.send(C, { t: 'cbnshift', ms: CBN.shiftMs }); return;
      }
      case 'end': {     // the shift is done: paid, counted, maybe promoted
        if (!d.on || !d.start) return err(C, 'You have no shift running.');
        const w = t - d.start; d.start = 0;
        if (w < CBN.shiftMs - 2000) { save(uid, d); return err(C, 'You left your desk before the shift was done. No pay today for that.'); }
        if (w > CBN.shiftOpen) { save(uid, d); return err(C, 'That shift is too old. Start a new one.'); }
        if (d.day === dayKey(t)) { save(uid, d); return; }
        const pay = CBN.ranks[d.rank][2]; d.day = dayKey(t); d.shifts++; d.earned += pay;
        let up = '', nr = d.rank + 1;
        if (nr <= GOV && d.shifts >= CBN.ranks[nr][1]) {
          if (!CBN.ranks[nr][3]) { d.rank = nr; up = title(nr); }
          else if (!S.mine.all(uid).some(a => a.kind === 'promo' && a.st === 'wait')) {
            if (nr === GOV && governor()) { /* the seat is taken: stay Deputy Governor */ }
            else { S.addApp.run(uid, 'promo', t, `${C.user.name} has worked ${d.shifts} shifts and asks to be made ${title(nr)}.`, nr); govRefresh(); }
          }
        }
        save(uid, d); ctx.give(C, pay, 'CBN salary');
        ctx.send(C, { t: 'cbnpaid', pay, shifts: d.shifts, title: title(d.rank), up });
        log('cbn shift', C.user.name, d.shifts, pay); return me(C);
      }
      case 'decide': {  // the Governor answers a letter or a promotion
        const g = governor(); if (!g || g.uid !== uid) return err(C, 'Only the Governor can do that.');
        const a = Number.isInteger(m.id) ? S.app.get(m.id) : null; if (!a || a.st !== 'wait') return err(C, 'That one is answered already.');
        if (a.uid === uid) return err(C, 'You cannot answer your own letter.');
        const msg = clean(m.msg).slice(0, CBN.msgMax);
        decide(a, !!m.yes, msg, C.user.name); ok(C, m.yes ? `You accepted ${a.name}.` : `You rejected ${a.name}.`); return me(C);
      }
      case 'resign': {
        if (!d.on) return; d.on = 0; d.start = 0; save(uid, d); ok(C, 'You resigned from the Central Bank. Your record stays.'); return me(C);
      }
    }
  }
  function hello(C) { C.cbn = null; me(C); }
  function tick() { board(); }
  return { handle, hello, tick, governor, recOf };
}
