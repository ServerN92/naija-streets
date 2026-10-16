// Businesses that players own, run on the server so nobody can fake a sale. The first: the buka.
//
// A buka stands at one of eight spots in Mushin. Buy it, put your name on the board, cook pots of food (ingredients
// cost 40% of the usual plate price), set your prices, and customers come and eat: more at breakfast, lunch and
// evening, fewer at night, more when your food is cheaper and your menu longer, more with more benches. It sells
// while you are standing in it, or all the time while you pay Iya Basira the cook. The money goes into the till;
// collect it at the buka (or by phone, 5% transfer fee). Real players eat there too, and their money is yours.
import { gameHour } from './clock.js';
import { cleanChat } from './auth.js';

export const BUKA = {
  price: 100000,
  dishes: {
    jollof: { n: 'Jollof rice & chicken', p: 1500 },
    amala: { n: 'Amala & ewedu', p: 1200 },
    eba: { n: 'Eba & egusi', p: 1000 },
    iyan: { n: 'Pounded yam & efo riro', p: 1800 },
  },
  cost: .4,                       // ingredients for one plate, as a share of its usual price
  phoneFee: .1, takeFee: .05,     // cooking ordered by phone; money sent to you by phone
  cap: [60, 120, 200], capUp: [0, 40000, 90000],      // plates the pots hold
  seat: [1, 1.4, 1.8], seatUp: [0, 25000, 60000],     // benches: more people at once
  cook: { 6: 8000, 24: 28000 },   // Iya Basira the cook, for 6 or 24 real hours
  rate: .5,                       // customers a real minute at an ordinary spot (before time of day, prices and benches)
  maxOwn: 2,                      // businesses one player can own
  priceMin: .5, priceMax: 2.5,
};
// the eight spots (their places in the city are in the game, src/business.js); busier streets bring more people
export const SITES = { buka_1: 1.25, buka_2: 1.1, buka_3: 1, buka_4: 1.15, buka_5: .95, buka_6: 1, buka_7: 1.2, buka_8: .9 };

const DK = Object.keys(BUKA.dishes);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round50 = n => Math.round(n / 50) * 50;
function tod(h) { if (h >= 21 || h < 5.5) return .2; if (h < 9) return .9; if (h < 11) return .7; if (h < 15) return 1.5; if (h < 17) return .8; return 1.25; }
function poisson(l, R) { if (l <= 0) return 0; if (l > 20) return Math.round(l); const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= R(); } while (p > L && k < 60); return k - 1; }
const dayKey = t => new Date(t + 3600e3).toISOString().slice(0, 10);   // the day in Lagos (UTC+1)

function fresh(id) {
  const pr = {}, st = {}; for (const k of DK) { pr[k] = BUKA.dishes[k].p; st[k] = 0; }
  return { id, kind: 'buka', owner: null, oname: '', name: '', till: 0, bought: null, here: 0, dirty: false, pub: '',
    d: { pr, st, cook: 0, up: { cap: 0, seat: 0 }, day: { k: '', sold: 0, earned: 0 }, tot: { sold: 0, earned: 0 }, last: [] } };
}

export function createBiz({ db, now = () => Date.now(), rand = Math.random, log = () => {}, ctx }) {
  const B = new Map();
  for (const id of Object.keys(SITES)) B.set(id, fresh(id));
  for (const r of db.bizAll()) {
    const b = B.get(r.id); if (!b) continue;
    let d = null; try { d = JSON.parse(r.data); } catch (e) { d = null; }
    if (d) { for (const k of DK) { if (!(k in d.pr)) d.pr[k] = BUKA.dishes[k].p; if (!(k in d.st)) d.st[k] = 0; } b.d = { ...b.d, ...d }; }
    Object.assign(b, { owner: r.owner || null, oname: r.oname || '', name: r.name || '', till: r.till | 0, bought: r.bought || null });
    if (!b.owner) Object.assign(b, fresh(r.id));   // its owner's account is gone: for sale again
  }

  const stock = b => DK.reduce((s, k) => s + (b.d.st[k] | 0), 0);
  const isOpen = (b, t = now()) => !!b.owner && (b.d.cook > t || b.here > t) && stock(b) > 0;
  const appeal = (b, k) => clamp(Math.pow(BUKA.dishes[k].p / b.d.pr[k], 1.6), .1, 2.2);
  const owned = uid => [...B.values()].filter(b => b.owner === uid);
  function pub(b) {
    const m = {}; for (const k of DK) m[k] = [b.d.pr[k], (b.d.st[k] | 0) > 0 ? 1 : 0];
    return b.owner ? { id: b.id, o: b.oname, n: b.name, open: isOpen(b) ? 1 : 0, m, cook: b.d.cook > now() ? 1 : 0 } : { id: b.id, o: '', n: '', sale: BUKA.price };
  }
  function mine(b) {   // everything, for the owner
    const t = now(); rollDay(b, t);
    return { id: b.id, n: b.name, till: b.till, open: isOpen(b, t), pr: b.d.pr, st: b.d.st, cap: BUKA.cap[b.d.up.cap], up: b.d.up, cook: Math.max(0, b.d.cook - t),
      here: b.here > t, today: b.d.day, tot: b.d.tot, last: b.d.last.slice(-6) };
  }
  function rollDay(b, t) { const k = dayKey(t); if (b.d.day.k !== k) b.d.day = { k, sold: 0, earned: 0 }; }
  const touch = b => { b.dirty = true; b.push = true; };

  // ---- customers, every few seconds
  function sell(b, k, p, who, t) {
    b.d.st[k]--; b.till += p; rollDay(b, t); b.d.day.sold++; b.d.day.earned += p; b.d.tot.sold++; b.d.tot.earned += p;
    b.d.last.push([t, k, p, who || '']); if (b.d.last.length > 12) b.d.last.splice(0, b.d.last.length - 12); touch(b);
  }
  function tick(dt) {
    const t = now(), h = gameHour(t);
    for (const b of B.values()) {
      if (!isOpen(b, t)) continue;
      const ks = DK.filter(k => b.d.st[k] > 0); if (!ks.length) continue;
      const a = ks.map(k => appeal(b, k)), mean = a.reduce((s, x) => s + x, 0) / a.length;
      const F = (.55 + .15 * ks.length) * mean;
      let n = Math.min(20, poisson(BUKA.rate * SITES[b.id] * tod(h) * BUKA.seat[b.d.up.seat] * F * dt / 60, rand));
      while (n-- > 0) {
        const ks2 = DK.filter(k => b.d.st[k] > 0); if (!ks2.length) break;
        const w = ks2.map(k => appeal(b, k)), sum = w.reduce((s, x) => s + x, 0); let r = rand() * sum, i = 0;
        while (i < w.length - 1 && r > w[i]) { r -= w[i]; i++; }
        sell(b, ks2[i], b.d.pr[ks2[i]], '', t);
      }
    }
  }
  function flush() {
    const dirty = [...B.values()].filter(b => b.dirty);
    if (dirty.length) db.tx(() => { for (const b of dirty) { db.bizPut(b); b.dirty = false; } });
  }
  function pushAll() {   // owners see their till move; everyone sees boards and menus change
    const changed = [];
    for (const b of B.values()) {
      if (b.push) { b.push = false; const C = b.owner && ctx.online.get(b.owner); if (C) ctx.send(C, { t: 'bzd', b: mine(b) }); }
      const p = pub(b), s = JSON.stringify(p); if (s !== b.pub) { b.pub = s; changed.push(p); }
    }
    if (changed.length) { const o = JSON.stringify({ t: 'bz', s: changed }); for (const C of ctx.online.values()) if (C.ws.open) C.ws.send(o); }
  }

  // ---- what players ask for: {t:'bz', a, id, ...}
  const A = {
    buy(C, b) {
      if (b.owner) return ctx.err(C, 'bz', 'Somebody owns this buka already.');
      if (owned(C.user.id).length >= BUKA.maxOwn) return ctx.err(C, 'bz', `You can own ${BUKA.maxOwn} businesses for now.`);
      if (!ctx.spend(C, BUKA.price, 'buy ' + b.id)) return ctx.err(C, 'bz', 'You don’t have enough money for this buka.');
      Object.assign(b, fresh(b.id), { owner: C.user.id, oname: C.user.name, name: `${C.user.name}'s Buka`, bought: now() }); b.pub = '';
      touch(b); flush(); log('buka', b.id, 'bought by', C.user.name);
      ctx.ok(C, 'bz', 'The buka is yours! Cook some food and open for customers.');
    },
    name(C, b, m) {
      let n = cleanChat(m.n).replace(/[^A-Za-z0-9 '&.\-]/g, '').replace(/\s+/g, ' ').trim();
      if (n.length < 3 || n.length > 22 || /\*/.test(cleanChat(m.n))) return ctx.err(C, 'bz', 'Name: 3 to 22 letters, no bad words.');
      b.name = n; touch(b); ctx.ok(C, 'bz', 'New name on your board.');
    },
    price(C, b, m) {
      if (!DK.includes(m.k) || !Number.isFinite(m.p)) return;
      const base = BUKA.dishes[m.k].p; b.d.pr[m.k] = round50(clamp(m.p, base * BUKA.priceMin, base * BUKA.priceMax)); touch(b);
    },
    cook(C, b, m) {
      if (!DK.includes(m.k) || !Number.isInteger(m.n) || m.n < 1) return;
      const room = BUKA.cap[b.d.up.cap] - stock(b); const n = Math.min(m.n, room);
      if (n <= 0) return ctx.err(C, 'bz', 'Your pots are full. Sell some food first (or get bigger pots).');
      const cost = Math.round(n * BUKA.dishes[m.k].p * BUKA.cost * (m.far ? 1 + BUKA.phoneFee : 1));
      if (!ctx.spend(C, cost, 'cook ' + b.id)) return ctx.err(C, 'bz', 'Not enough money for the ingredients.');
      b.d.st[m.k] += n; touch(b); ctx.ok(C, 'bz', `${n} plates of ${BUKA.dishes[m.k].n} ready.`);
    },
    hire(C, b, m) {
      const h = m.h === 24 ? 24 : 6, cost = BUKA.cook[h], t = now();
      if (b.d.cook - t > 42 * 3600e3) return ctx.err(C, 'bz', 'Iya Basira is booked for long enough already.');
      if (!ctx.spend(C, cost, 'cook pay ' + b.id)) return ctx.err(C, 'bz', 'Not enough money to pay the cook.');
      b.d.cook = Math.max(b.d.cook, t) + h * 3600e3; touch(b); ctx.ok(C, 'bz', `Iya Basira will sell for you for ${h} hours, even when you are away.`);
    },
    up(C, b, m) {
      const w = m.w === 'seat' ? 'seat' : 'cap', L = b.d.up[w], prices = w === 'seat' ? BUKA.seatUp : BUKA.capUp;
      if (L + 1 >= prices.length) return ctx.err(C, 'bz', 'That is as big as it gets.');
      if (!ctx.spend(C, prices[L + 1], 'upgrade ' + w + ' ' + b.id)) return ctx.err(C, 'bz', 'Not enough money for that.');
      b.d.up[w] = L + 1; touch(b); ctx.ok(C, 'bz', w === 'seat' ? 'More benches: more people can eat at once.' : 'Bigger pots: you can cook more at once.');
    },
    take(C, b, m) {
      if (b.till <= 0) return ctx.err(C, 'bz', 'The till is empty.');
      const fee = m.far ? Math.round(b.till * BUKA.takeFee) : 0, n = b.till - fee;
      b.till = 0; touch(b); ctx.give(C, n, 'till ' + b.id); flush();
      ctx.ok(C, 'bz', fee ? `₦${n.toLocaleString('en-NG')} sent to you (₦${fee.toLocaleString('en-NG')} transfer fee).` : `You collect ₦${n.toLocaleString('en-NG')} from the till.`);
    },
    here(C, b) { const was = isOpen(b); b.here = now() + 40e3; if (isOpen(b) !== was) touch(b); },
    sell(C, b) {
      const back = Math.round(BUKA.price * .5 + (BUKA.capUp.slice(0, b.d.up.cap + 1).reduce((s, x) => s + x, 0) + BUKA.seatUp.slice(0, b.d.up.seat + 1).reduce((s, x) => s + x, 0)) * .5) + b.till;
      ctx.give(C, back, 'sell ' + b.id); Object.assign(b, fresh(b.id)); b.dirty = true; b.pub = ''; flush();
      ctx.ok(C, 'bz', `You sold the buka for ₦${back.toLocaleString('en-NG')} (with what was in the till).`);
    },
    mine(C, b) { ctx.send(C, { t: 'bzd', b: mine(b) }); },
  };
  function eat(C, b, m) {
    if (!DK.includes(m.k)) return;
    if (!b.owner) return ctx.err(C, 'bz', 'This buka is closed. It is for sale.');
    if (!isOpen(b)) return ctx.err(C, 'bz', 'The buka is closed right now.');
    if ((b.d.st[m.k] | 0) <= 0) return ctx.err(C, 'bz', 'That food don finish. Try another one.');
    const t = now(), p = b.d.pr[m.k];
    if (b.owner === C.user.id) { b.d.st[m.k]--; touch(b); }   // your own food: you just take a plate
    else { if (!ctx.spend(C, p, 'eat ' + b.id)) return ctx.err(C, 'bz', 'You don’t have enough money.'); sell(b, m.k, p, C.user.name, t); }
    ctx.send(C, { t: 'bzate', id: b.id, k: m.k });
  }
  function handle(C, m) {
    const b = B.get(m.id); if (!b) return;
    if (m.a === 'eat') return eat(C, b, m);
    if (m.a === 'buy') return A.buy(C, b);
    if (!A[m.a]) return;
    if (b.owner !== C.user.id) return ctx.err(C, 'bz', 'This is not your buka.');
    A[m.a](C, b, m);
  }
  function hello(C) {   // just signed in: all the boards, and your own business in full
    ctx.send(C, { t: 'bz', s: [...B.values()].map(pub), all: 1, rules: { price: BUKA.price, dishes: BUKA.dishes, cost: BUKA.cost, phoneFee: BUKA.phoneFee, takeFee: BUKA.takeFee, cap: BUKA.cap, capUp: BUKA.capUp, seat: BUKA.seat, seatUp: BUKA.seatUp, cook: BUKA.cook, priceMin: BUKA.priceMin, priceMax: BUKA.priceMax } });
    for (const b of owned(C.user.id)) ctx.send(C, { t: 'bzd', b: mine(b) });
  }
  return { handle, hello, tick, flush, pushAll, get: id => B.get(id), isOpen };
}
