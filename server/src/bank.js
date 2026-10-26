// The banks: every player has an account at one of three Lagos banks, with a 10-digit account number of their own
// (like a real NUBAN, with a check digit, so a wrong number or the wrong bank is caught). From the phone you send money
// to another player's account: put the number, pick their bank, see whose account it is, then send. They get a credit
// alert at once (or when they come back online). Same bank: free. Another bank: a small fee, like the real ones.
export const BANKS = {
  gidi: { name: 'Gidi Bank', code: '901', c: '#0f8a4a', c2: '#06512b' },
  zobo: { name: 'Zobo Bank', code: '902', c: '#9b1f4f', c2: '#560c2a' },
  agege: { name: 'Agege Trust Bank', code: '903', c: '#c77d0a', c2: '#6e4204' },
};
export const RULES = { least: 100, most: 200000, day: 1000000, perHour: 20 };
export const feeOf = (n, same) => same ? 0 : n <= 5000 ? 10 : n <= 50000 ? 25 : 50;
const W = [3, 7, 3, 3, 7, 3, 3, 7, 3, 3, 7, 3];
export function checkDigit(code, serial) { const s = code + serial; let t = 0; for (let i = 0; i < 12; i++) t += +s[i] * W[i]; return String((10 - t % 10) % 10); }
export const validAcct = (bank, acct) => !!BANKS[bank] && /^\d{10}$/.test(acct) && checkDigit(BANKS[bank].code, acct.slice(0, 9)) === acct[9];
const naira = n => '₦' + n.toLocaleString('en-NG');

export function createBank({ db, now, log = () => {}, rand = Math.random, ctx }) {
  const q = s => db.raw.prepare(s);
  const S = {
    get: q('SELECT b.*, u.name FROM bank b JOIN users u ON u.id=b.uid WHERE b.uid=?'),
    byAcct: q('SELECT b.*, u.name, u.banned FROM bank b JOIN users u ON u.id=b.uid WHERE b.acct=?'),
    add: q('INSERT INTO bank(uid, bank, acct, t) VALUES(?,?,?,?)'),
    none: q('SELECT id FROM users WHERE id NOT IN (SELECT uid FROM bank) ORDER BY id'),
    txAdd: q('INSERT INTO bank_tx(t, src, dst, n, fee, note, q) VALUES(?,?,?,?,?,?,?)'),
    txQ: q('SELECT * FROM bank_tx WHERE src=? AND q=?'),
    sent: q("SELECT COUNT(*) k, COALESCE(SUM(n),0) s FROM bank_tx WHERE src=? AND t>? AND (q IS NULL OR q NOT LIKE 'union:%')"),   // (the union's returns are not your sends)
    hist: q(`SELECT x.*, us.name sname, ud.name dname, bs.bank sbank, bd.bank dbank, bd.acct dacct FROM bank_tx x
             LEFT JOIN users us ON us.id=x.src LEFT JOIN users ud ON ud.id=x.dst LEFT JOIN bank bs ON bs.uid=x.src LEFT JOIN bank bd ON bd.uid=x.dst
             WHERE x.src=? OR x.dst=? ORDER BY x.id DESC LIMIT ?`),
  };
  // the loan: ₦100k, ₦250k or ₦500k at once, 20% interest, paid back from your work (15% of every job payment) or any time
  // from the app; after 7 days the bank's collectors take half of what you carry whenever money moves, until it is settled
  db.raw.exec('CREATE TABLE IF NOT EXISTS bank_loan(uid INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, n INTEGER NOT NULL, total INTEGER NOT NULL, took INTEGER NOT NULL, paid INTEGER NOT NULL DEFAULT 0);');
  const LN = { get: q('SELECT * FROM bank_loan WHERE uid=?'), put: q('INSERT INTO bank_loan(uid,n,total,took,paid) VALUES(?,?,?,?,?) ON CONFLICT(uid) DO UPDATE SET n=excluded.n,total=excluded.total,took=excluded.took,paid=excluded.paid'), del: q('DELETE FROM bank_loan WHERE uid=?') };
  const LOAN = { sizes: [100000, 250000, 500000], rate: .2, cut: .15, grace: 7 * 864e5, collect: .5 };
  const loanOf = uid => LN.get.get(uid) || null;
  const loanPub = l => l ? { left: l.n, total: l.total, took: l.took, paid: l.paid, due: l.took + LOAN.grace } : null;
  function loanTake(C, m) {
    const n = +m.n; if (!LOAN.sizes.includes(n)) return ctx.err(C, 'bk', 'The bank gives ₦100,000, ₦250,000 or ₦500,000.');
    if (loanOf(C.user.id)) return ctx.err(C, 'bk', 'You still owe the bank. Settle that one first.');
    const total = Math.round(n * (1 + LOAN.rate)); LN.put.run(C.user.id, total, total, now(), 0); C.cash += n; C.dsum += n; C.dirty = true; log('loan', C.user.name, n);
    ctx.send(C, { t: '$', n: C.cash, s: C.cseq || 0 }); ctx.send(C, { t: 'bkloan', k: 'take', n, loan: loanPub(loanOf(C.user.id)) }); hello(C);
  }
  function loanPay(C, n, k) {   // k: 'work' (the cut from your pay), 'pay' (you, from the app), 'collect' (the collectors)
    const l = loanOf(C.user.id); if (!l) return 0; n = Math.max(0, Math.min(Math.round(n), l.n, C.cash)); if (!n) return 0;
    C.cash -= n; C.dsum -= n; C.dirty = true; l.n -= n; l.paid += n; if (l.n <= 0) LN.del.run(C.user.id); else LN.put.run(C.user.id, l.n, l.total, l.took, l.paid);
    ctx.send(C, { t: 'bkloan', k, n, loan: loanPub(loanOf(C.user.id)) }); if (k !== 'work') ctx.send(C, { t: '$', n: C.cash, s: C.cseq || 0 }); return n;
  }
  function loanCut(C, g) { const l = loanOf(C.user.id); if (!l) return; if (now() - l.took > LOAN.grace && C.cash > 0) loanPay(C, C.cash * LOAN.collect, 'collect'); else loanPay(C, g * LOAN.cut, 'work'); }
  const keys = Object.keys(BANKS);
  function open(uid) {   // a new account, at a bank picked for you, with a number nobody else has
    const bank = keys[Math.floor(rand() * keys.length) % keys.length];
    for (let k = 0; k < 50; k++) {
      let serial = String(1 + Math.floor(rand() * 9)); while (serial.length < 9) serial += Math.floor(rand() * 10);
      const acct = serial + checkDigit(BANKS[bank].code, serial);
      if (S.byAcct.get(acct)) continue;
      S.add.run(uid, bank, acct, now()); return S.get.get(uid);
    }
    return null;
  }
  const account = uid => S.get.get(uid) || open(uid);
  for (const r of S.none.all()) open(r.id);   // everybody already playing gets one now

  const pub = b => ({ bank: b.bank, acct: b.acct, name: b.name });
  const banks = () => Object.fromEntries(keys.map(k => [k, { name: BANKS[k].name, c: BANKS[k].c, c2: BANKS[k].c2 }]));
  function row(x, uid) {   // one line of your history, the way your phone shows it
    const out = x.src === uid;
    return { id: x.id, t: x.t, d: out ? -x.n : x.n, fee: out ? x.fee : 0, who: (out ? x.dname : x.sname) || '?', bank: out ? x.dbank : x.sbank, acct: out ? x.dacct : '', note: x.note || '' };
  }
  const hist = (uid, n = 25) => S.hist.all(uid, uid, n).map(x => row(x, uid));
  function hello(C) {
    const me = account(C.user.id); if (!me) return;
    ctx.send(C, { t: 'bk', me: pub(me), banks: banks(), hist: hist(C.user.id), rules: { ...RULES, fees: [[5000, 10], [50000, 25], [Infinity, 50]], loan: LOAN.sizes, rate: LOAN.rate, cut: LOAN.cut, grace: LOAN.grace }, loan: loanPub(loanOf(C.user.id)) });
  }
  // whose account is this? (before you send; a few a minute at most, so nobody can go through all the numbers)
  function enquire(C, m) {
    const bank = String(m.bank || ''), acct = String(m.acct || '');
    C.bkEnq = C.bkEnq || { n: 0, t: now() }; if (now() - C.bkEnq.t > 600e3) C.bkEnq = { n: 0, t: now() };
    if (++C.bkEnq.n > 30) return ctx.err(C, 'bk', 'Too many checks. Wait small and try again.');
    if (!BANKS[bank]) return ctx.err(C, 'bk', 'Pick the bank.');
    if (!/^\d{10}$/.test(acct)) return ctx.err(C, 'bk', 'An account number has 10 digits.');
    const R = validAcct(bank, acct) ? S.byAcct.get(acct) : null;
    if (!R || R.bank !== bank || R.banned) return ctx.send(C, { t: 'bkname', acct, bank, name: null, m: `No account with that number at ${BANKS[bank].name}. Check the number and the bank.` });
    ctx.send(C, { t: 'bkname', acct, bank, name: R.name, me: R.uid === C.user.id });
  }
  function send(C, m) {
    const bank = String(m.bank || ''), acct = String(m.acct || ''), n = Number.isInteger(m.n) ? m.n : 0;
    const note = ctx.clean ? ctx.clean(String(m.note || '').slice(0, 40)).slice(0, 40) : String(m.note || '').slice(0, 40);
    const qk = typeof m.q === 'string' && /^[\w-]{4,24}$/.test(m.q) ? m.q : null;
    const me = account(C.user.id); if (!me) return ctx.err(C, 'bk', 'Your account is not ready. Try again.');
    if (qk) { const was = S.txQ.get(C.user.id, qk); if (was) { const x = S.hist.all(C.user.id, C.user.id, 50).find(y => y.id === was.id); return ctx.send(C, { t: 'bksent', q: qk, tx: x ? row(x, C.user.id) : null, again: 1 }); } }   // the same send again (the line dropped): done already
    if (n < RULES.least || n > RULES.most) return ctx.err(C, 'bk', `Send between ${naira(RULES.least)} and ${naira(RULES.most)} at a time.`);
    if (!BANKS[bank] || !/^\d{10}$/.test(acct)) return ctx.err(C, 'bk', 'Check the account number and the bank.');
    const R = validAcct(bank, acct) ? S.byAcct.get(acct) : null;
    if (!R || R.bank !== bank || R.banned) return ctx.err(C, 'bk', `No account with that number at ${BANKS[bank].name}.`);
    if (R.uid === C.user.id) return ctx.err(C, 'bk', 'That one is your own account.');
    const t = now(), h = S.sent.get(C.user.id, t - 3600e3), d = S.sent.get(C.user.id, t - 86400e3);
    if (h.k >= RULES.perHour) return ctx.err(C, 'bk', 'You have sent a lot this hour. Try again later.');
    if (d.s + n > RULES.day) return ctx.err(C, 'bk', `Your daily limit is ${naira(RULES.day)}. You can send ${naira(Math.max(0, RULES.day - d.s))} more today.`);
    const fee = feeOf(n, R.bank === me.bank);
    if (C.cash < n + fee) return ctx.err(C, 'bk', `Insufficient funds. You need ${naira(n + fee)}${fee ? ` (with the ${naira(fee)} fee)` : ''}.`);
    let id = 0;
    db.tx(() => {
      if (!ctx.spend(C, n + fee, `transfer to ${R.name} ${BANKS[R.bank].name} ${acct}${fee ? ` fee ${fee}` : ''}`)) throw new Error('no money');
      id = Number(S.txAdd.run(t, C.user.id, R.uid, n, fee, note || null, qk).lastInsertRowid);
      ctx.credit(R.uid, n, `transfer from ${C.user.name} ${BANKS[me.bank].name}`,
        `🏦 Credit alert! ${naira(n)} from ${C.user.name} (${BANKS[me.bank].name})${note ? ` · “${note}”` : ''}`);
    });
    const x = S.hist.all(C.user.id, C.user.id, 5).find(y => y.id === id);
    ctx.send(C, { t: 'bksent', q: qk, tx: x ? row(x, C.user.id) : null });
    const RC = ctx.online.get(R.uid); if (RC && RC.user) { const y = S.hist.all(R.uid, R.uid, 5).find(z => z.id === id); if (y) ctx.send(RC, { t: 'bktx', tx: row(y, R.uid) }); }
    log('bank', C.user.name, '->', R.name, n, 'fee', fee);
  }
  function handle(C, m) {
    if (m.a === 'name') return enquire(C, m);
    if (m.a === 'send') { const u = db.userById(C.user.id); if (u && u.frozen) return ctx.err(C, 'bk', 'Your bank account is frozen. Contact the bank.'); return send(C, m); }
    if (m.a === 'me') return hello(C);
    if (m.a === 'loan') return loanTake(C, m);
    if (m.a === 'repay') { const l = loanOf(C.user.id); if (!l) return ctx.err(C, 'bk', 'You owe nothing.'); const n = m.n === 'all' ? Math.min(l.n, C.cash) : +m.n; if (!(n >= 100)) return ctx.err(C, 'bk', 'At least ₦100.'); if (n > C.cash) return ctx.err(C, 'bk', 'You don\'t have that much on you.'); loanPay(C, n, 'pay'); return ctx.ok(C, 'bk', l.n - n <= 0 ? 'Loan settled. The bank thanks you!' : `Paid ${n.toLocaleString('en-NG')}. You still owe ₦${(l.n - n).toLocaleString('en-NG')}.`); }
  }
  return { hello, handle, account, hist, loanCut, loanOf };
}
