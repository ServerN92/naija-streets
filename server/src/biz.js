// Businesses that players own, run on the server so nobody can fake a sale: the buka and the barbing salon.
//
// The buka (eight spots): buy it, put your name on the board, cook pots of food (ingredients cost 40% of the usual
// plate price), set your prices, and customers come and eat: more at breakfast, lunch and evening, fewer at night,
// more when your food is cheaper and your menu longer, more with more benches. Iya Basira the cook sells for you.
//
// The barbing salon (six spots): set your prices for the cuts, keep supplies in (blades, clipper oil, powder,
// aftershave: one pack does 30 cuts) and fuel in the generator, because when NEPA takes the light the clippers run on
// the generator (the light comes and goes, a little differently in each part of town). People come for a cut most
// in the evening, after work. A second chair and an AC bring more people (the AC burns more fuel when there is no
// light). Barber Sunday cuts for you while you are away.
//
// Both: they sell while you stand in them, or while your worker is paid. The money goes into the till; collect it
// there (or by phone, 5% fee). Real players eat or get a cut there too, and their money is yours.
import { gameHour } from './clock.js';
import { cleanChat } from './auth.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round50 = n => Math.round(n / 50) * 50;
function poisson(l, R) { if (l <= 0) return 0; if (l > 20) return Math.round(l); const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= R(); } while (p > L && k < 60); return k - 1; }
const dayKey = t => new Date(t + 3600e3).toISOString().slice(0, 10);   // the day in Lagos (UTC+1)
const sum = a => a.reduce((s, x) => s + x, 0);
export const MAX_OWN = 2;          // businesses one player can own
const PRICE_MIN = .5, PRICE_MAX = 2.5, PHONE_FEE = .1, TAKE_FEE = .05;

export const BUKA = {
  price: 100000,
  dishes: {
    jollof: { n: 'Jollof rice & chicken', p: 1500 },
    amala: { n: 'Amala & ewedu', p: 1200 },
    eba: { n: 'Eba & egusi', p: 1000 },
    iyan: { n: 'Pounded yam & efo riro', p: 1800 },
  },
  cost: .4,                       // ingredients for one plate, as a share of its usual price
  phoneFee: PHONE_FEE, takeFee: TAKE_FEE,
  cap: [60, 120, 200], capUp: [0, 40000, 90000],      // plates the pots hold
  seat: [1, 1.4, 1.8], seatUp: [0, 25000, 60000],     // benches: more people at once
  cook: { 6: 8000, 24: 28000 },   // Iya Basira the cook, for 6 or 24 real hours
  rate: .5,                       // customers a real minute at an ordinary spot (before time of day, prices and benches)
  maxOwn: MAX_OWN, priceMin: PRICE_MIN, priceMax: PRICE_MAX,
};
// the produce market: farmers sell crops to bukas; a buka cooks cheaper with them (2 for 10 plates, 15% instead of 40%)
export const PRODUCE = {
  tomato: { n: 'Tomatoes', unit: 'basket', prices: [600, 1000, 1500] },
  cassava: { n: 'Cassava', unit: 'bag', prices: [600, 800, 1100] },
  yam: { n: 'Yams', unit: 'tuber', prices: [1100, 1500, 2000] },
};
export const DISH_CROP = { jollof: 'tomato', amala: 'yam', eba: 'cassava', iyan: 'yam' };
const FARM_COST = .15, PER_TEN = 2, MK_MAX = 5, MK_DAY = 200, MK_AGE = 48 * 3600e3;
export const BARBER = {
  price: 80000,
  cuts: {
    lowcut: { n: 'Low cut', p: 1500 },
    botako: { n: 'Botako (skin cut)', p: 1000 },
    fade: { n: 'Fade with a design', p: 2500 },
    beard: { n: 'Beard trim & line-up', p: 800 },
    wash: { n: 'Wash, cut & style', p: 3000 },
  },
  pack: { n: 30, cost: 6000, cap: 120 },               // supplies: cuts per pack, its price, most you can keep
  fuel: { litres: 5, cost: 5500, tank: 20, perCut: .12 },   // generator fuel: a 5-litre jerrycan, the tank, litres a cut
  chair: [1, 1.8], chairUp: [0, 45000],                // a second barber chair
  ac: [1, 1.15], acUp: [0, 60000],                     // an AC (people like it cool; twice the fuel without light)
  worker: { 6: 9000, 24: 32000 },  // Barber Sunday, for 6 or 24 real hours
  rate: .32,
  phoneFee: PHONE_FEE, takeFee: TAKE_FEE, maxOwn: MAX_OWN, priceMin: PRICE_MIN, priceMax: PRICE_MAX,
};
export const POS = {
  price: 60000,
  svc: {
    withdraw: { n: 'Cash withdrawal', p: 200 },
    transfer: { n: 'Bank transfer', p: 100 },
    airtime: { n: 'Airtime & data', p: 50 },
    bills: { n: 'Pay bills (light, TV)', p: 150 },
  },
  amt: { withdraw: [2000, 20000], transfer: [2000, 30000], airtime: [200, 2000], bills: [2000, 15000] },   // money each customer moves
  boxCap: 500000,                  // most cash the box holds
  worker: { 6: 7000, 24: 25000 },  // Mama Nkechi, the attendant
  pos2: [1, 1.6], pos2Up: [0, 50000],   // a second POS machine
  sim: [0, 1], simUp: [0, 25000],       // a second network: the network hardly jams
  send: { pct: .01, min: 100, max: 2000, most: 200000 },   // players sending money to each other here: the agent's fee
  bankFee: 100, walletFee: 50,
  rate: .45,
  phoneFee: PHONE_FEE, takeFee: TAKE_FEE, maxOwn: MAX_OWN, priceMin: PRICE_MIN, priceMax: PRICE_MAX,
};
// the network: is it working at this POS right now? (it can jam for a while; a second SIM nearly always finds one that works)
export function network(id, t, dual) {
  const slot = Math.floor(t / (12 * 60e3)), area = id.charCodeAt(id.length - 1) * 7;
  const r = k => { const n = Math.sin(slot * 91.7 + area * 17.3 + k * 53.1) * 43758.5453; return n - Math.floor(n); };
  return r(1) > .2 || (dual && r(2) > .2);
}
// where they stand is in the game (src/business.js); busier streets bring more people
export const SITES = {
  buka_1: ['buka', 1], buka_2: ['buka', 1.05], buka_3: ['buka', 1.1], buka_4: ['buka', 1], buka_5: ['buka', 1.2], buka_6: ['buka', 1.25], buka_7: ['buka', 1.15], buka_8: ['buka', 1.3],
  barber_1: ['barber', 1], barber_2: ['barber', 1.05], barber_3: ['barber', 1.1], barber_4: ['barber', 1.15], barber_5: ['barber', 1.2], barber_6: ['barber', 1.25],
  pos_1: ['pos', 1], pos_2: ['pos', 1.05], pos_3: ['pos', 1.1], pos_4: ['pos', 1.15], pos_5: ['pos', 1.2], pos_6: ['pos', 1.3],
};

// NEPA: does this part of town have light right now? (every 20 real minutes it may change; about half the time on)
export function nepa(id, t) {
  const slot = Math.floor(t / (20 * 60e3)), area = id.charCodeAt(id.length - 1);
  const n = Math.sin(slot * 127.1 + area * 311.7) * 43758.5453; return n - Math.floor(n) < .48;
}

// ---- each kind of business: its own stock, menu and customers
const KIND = {
  buka: {
    R: BUKA, items: BUKA.dishes, helper: BUKA.cook,
    fresh() { const pr = {}, st = {}; for (const k in BUKA.dishes) { pr[k] = BUKA.dishes[k].p; st[k] = 0; } return { pr, st, cook: 0, up: { cap: 0, seat: 0 }, pantry: { tomato: 0, cassava: 0, yam: 0 } }; },
    fix(d) { for (const k in BUKA.dishes) { if (!(k in d.pr)) d.pr[k] = BUKA.dishes[k].p; if (!(k in d.st)) d.st[k] = 0; } d.up = { cap: 0, seat: 0, ...(d.up || {}) }; d.pantry = { tomato: 0, cassava: 0, yam: 0, ...(d.pantry || {}) }; },
    ready: b => sum(Object.values(b.d.st)) > 0,
    has: (b, k) => (b.d.st[k] | 0) > 0,
    tod(h) { if (h >= 21 || h < 5.5) return .2; if (h < 9) return .9; if (h < 11) return .7; if (h < 15) return 1.5; if (h < 17) return .8; return 1.25; },
    boost: b => BUKA.seat[b.d.up.seat],
    served(b, k) { b.d.st[k]--; },
    spent: d => sum(BUKA.capUp.slice(0, d.up.cap + 1)) + sum(BUKA.seatUp.slice(0, d.up.seat + 1)),
    mine: b => ({ st: b.d.st, cap: BUKA.cap[b.d.up.cap], pantry: b.d.pantry }),
    pubExtra: () => ({}),
    rules: () => ({ price: BUKA.price, dishes: BUKA.dishes, items: BUKA.dishes, cost: BUKA.cost, farmCost: FARM_COST, perTen: PER_TEN, dishCrop: DISH_CROP, produce: PRODUCE, phoneFee: PHONE_FEE, takeFee: TAKE_FEE, cap: BUKA.cap, capUp: BUKA.capUp, seat: BUKA.seat, seatUp: BUKA.seatUp, cook: BUKA.cook, helper: BUKA.cook, priceMin: PRICE_MIN, priceMax: PRICE_MAX }),
    act: {
      cook(C, b, m, X) {
        if (!(m.k in BUKA.dishes) || !Number.isInteger(m.n) || m.n < 1) return;
        const room = BUKA.cap[b.d.up.cap] - sum(Object.values(b.d.st)); const n = Math.min(m.n, room);
        if (n <= 0) return X.err(C, 'Your pots are full. Sell some food first (or get bigger pots).');
        const crop = DISH_CROP[m.k], need = Math.ceil(n * PER_TEN / 10);
        if (m.farm && (b.d.pantry[crop] | 0) < need) return X.err(C, `You need ${need} ${PRODUCE[crop].n.toLowerCase()} from a farmer for that.`);
        const cost = Math.round(n * BUKA.dishes[m.k].p * (m.farm ? FARM_COST : BUKA.cost) * (m.far ? 1 + PHONE_FEE : 1));
        if (!X.spend(C, cost, 'cook ' + b.id)) return X.err(C, 'Not enough money for the ingredients.');
        if (m.farm) b.d.pantry[crop] -= need;
        b.d.st[m.k] += n; X.touch(b); X.ok(C, `${n} plates of ${BUKA.dishes[m.k].n} ready${m.farm ? ', with fresh farm ' + PRODUCE[crop].n.toLowerCase() : ''}.`);
      },
      up(C, b, m, X) {
        const w = m.w === 'seat' ? 'seat' : 'cap', L = b.d.up[w], prices = w === 'seat' ? BUKA.seatUp : BUKA.capUp;
        if (L + 1 >= prices.length) return X.err(C, 'That is as big as it gets.');
        if (!X.spend(C, prices[L + 1], 'upgrade ' + w + ' ' + b.id)) return X.err(C, 'Not enough money for that.');
        b.d.up[w] = L + 1; X.touch(b); X.ok(C, w === 'seat' ? 'More benches: more people can eat at once.' : 'Bigger pots: you can cook more at once.');
      },
    },
    useMsg: 'bzate', useWord: 'eat',
  },
  barber: {
    R: BARBER, items: BARBER.cuts, helper: BARBER.worker,
    fresh() { const pr = {}; for (const k in BARBER.cuts) pr[k] = BARBER.cuts[k].p; return { pr, sup: 0, fuel: 0, cook: 0, up: { chair: 0, ac: 0 } }; },
    fix(d) { for (const k in BARBER.cuts) if (!(k in d.pr)) d.pr[k] = BARBER.cuts[k].p; d.sup = d.sup | 0; d.fuel = +d.fuel || 0; d.up = { chair: 0, ac: 0, ...(d.up || {}) }; },
    power: (b, t) => nepa(b.id, t) || b.d.fuel >= BARBER.fuel.perCut * (b.d.up.ac ? 2 : 1),
    ready(b, t) { return b.d.sup > 0 && this.power(b, t); },
    has: () => true,
    tod(h) { if (h >= 21 || h < 6) return .2; if (h < 10) return .6; if (h < 16) return 1; return 1.45; },
    boost: b => BARBER.chair[b.d.up.chair] * BARBER.ac[b.d.up.ac],
    served(b, k, t) { b.d.sup--; if (!nepa(b.id, t)) b.d.fuel = Math.max(0, +(b.d.fuel - BARBER.fuel.perCut * (b.d.up.ac ? 2 : 1)).toFixed(2)); },
    spent: d => sum(BARBER.chairUp.slice(0, d.up.chair + 1)) + sum(BARBER.acUp.slice(0, d.up.ac + 1)),
    mine: (b, t) => ({ sup: b.d.sup, fuel: b.d.fuel, light: nepa(b.id, t), supCap: BARBER.pack.cap, tank: BARBER.fuel.tank }),
    pubExtra: (b, t) => ({ light: nepa(b.id, t) ? 1 : 0 }),
    rules: () => ({ price: BARBER.price, items: BARBER.cuts, pack: BARBER.pack, fuel: BARBER.fuel, chair: BARBER.chair, chairUp: BARBER.chairUp, ac: BARBER.ac, acUp: BARBER.acUp, helper: BARBER.worker, phoneFee: PHONE_FEE, takeFee: TAKE_FEE, priceMin: PRICE_MIN, priceMax: PRICE_MAX }),
    act: {
      supplies(C, b, m, X) {
        const room = BARBER.pack.cap - b.d.sup; if (room < BARBER.pack.n) return X.err(C, 'Your shelf is full of supplies already.');
        const cost = Math.round(BARBER.pack.cost * (m.far ? 1 + PHONE_FEE : 1));
        if (!X.spend(C, cost, 'supplies ' + b.id)) return X.err(C, 'Not enough money for supplies.');
        b.d.sup += BARBER.pack.n; X.touch(b); X.ok(C, `Supplies for ${BARBER.pack.n} cuts on the shelf.`);
      },
      fuel(C, b, m, X) {
        const room = BARBER.fuel.tank - b.d.fuel; if (room < .5) return X.err(C, 'The generator tank is full.');
        const L = Math.min(BARBER.fuel.litres, room), cost = Math.round(BARBER.fuel.cost * L / BARBER.fuel.litres * (m.far ? 1 + PHONE_FEE : 1));
        if (!X.spend(C, cost, 'fuel ' + b.id)) return X.err(C, 'Not enough money for fuel.');
        b.d.fuel = +(b.d.fuel + L).toFixed(2); X.touch(b); X.ok(C, `${L % 1 ? L.toFixed(1) : L} litres in the generator.`);
      },
      up(C, b, m, X) {
        const w = m.w === 'ac' ? 'ac' : 'chair', L = b.d.up[w], prices = w === 'ac' ? BARBER.acUp : BARBER.chairUp;
        if (L + 1 >= prices.length) return X.err(C, w === 'ac' ? 'You have an AC already.' : 'You have two chairs already.');
        if (!X.spend(C, prices[L + 1], 'upgrade ' + w + ' ' + b.id)) return X.err(C, 'Not enough money for that.');
        b.d.up[w] = L + 1; X.touch(b); X.ok(C, w === 'ac' ? 'The AC is in. Customers like it cool.' : 'A second chair: two people at once.');
      },
    },
    useMsg: 'bzcut', useWord: 'cut',
  },
  pos: {
    R: POS, items: POS.svc, helper: POS.worker,
    fresh() { const pr = {}; for (const k in POS.svc) pr[k] = POS.svc[k].p; return { pr, float: 0, wallet: 0, cook: 0, up: { pos2: 0, sim: 0 }, lost: 0 }; },
    fix(d) { for (const k in POS.svc) if (!(k in d.pr)) d.pr[k] = POS.svc[k].p; d.float = d.float | 0; d.wallet = d.wallet | 0; d.lost = d.lost | 0; d.up = { pos2: 0, sim: 0, ...(d.up || {}) }; },
    ready: (b, t) => network(b.id, t, !!b.d.up.sim) && (b.d.float >= POS.amt.withdraw[0] || b.d.wallet >= POS.amt.airtime[0]),
    has: (b, k) => k === 'withdraw' ? b.d.float >= POS.amt.withdraw[0] : b.d.wallet >= POS.amt[k][0],
    tod(h) { if (h >= 21 || h < 6.5) return .15; if (h < 9) return .9; if (h < 18) return 1.3; return .9; },
    boost: b => POS.pos2[b.d.up.pos2],
    served(b, k) {   // the customer's money: cash goes into the box and the agent sends e-money, or the other way
      const [lo, hi] = POS.amt[k], want = Math.round((lo + Math.random() * (hi - lo)) / 100) * 100;
      if (k === 'withdraw') { const n = Math.min(want, b.d.float); b.d.float -= n; b.d.wallet += n; }
      else { const n = Math.min(want, b.d.wallet, POS.boxCap - b.d.float); b.d.wallet -= n; b.d.float += n; }
    },
    spent: d => sum(POS.pos2Up.slice(0, d.up.pos2 + 1)) + sum(POS.simUp.slice(0, d.up.sim + 1)) + (d.float | 0) * 2 + (d.wallet | 0) * 2,   // (the cash and the e-money come back in full)
    mine: (b, t) => ({ float: b.d.float, wallet: b.d.wallet, boxCap: POS.boxCap, net: network(b.id, t, !!b.d.up.sim) }),
    pubExtra: (b, t) => ({ net: network(b.id, t, !!b.d.up.sim) ? 1 : 0, room: b.d.wallet }),
    rules: () => ({ price: POS.price, items: POS.svc, amt: POS.amt, boxCap: POS.boxCap, helper: POS.worker, pos2: POS.pos2, pos2Up: POS.pos2Up, simUp: POS.simUp, send: POS.send, bankFee: POS.bankFee, walletFee: POS.walletFee, phoneFee: PHONE_FEE, takeFee: TAKE_FEE, priceMin: PRICE_MIN, priceMax: PRICE_MAX }),
    act: {
      float(C, b, m, X) {   // put cash from your pocket into the box
        const n = [20000, 50000, 100000].includes(m.n) ? m.n : 0; if (!n) return;
        if (b.d.float + n > POS.boxCap) return X.err(C, 'The box cannot hold more cash than that.');
        if (!X.spend(C, n, 'pos float ' + b.id)) return X.err(C, 'You don’t have that much cash on you.');
        b.d.float += n; X.touch(b); X.ok(C, `₦${n.toLocaleString('en-NG')} in the cash box.`);
      },
      unfloat(C, b, m, X) {   // take the cash from the box
        if (b.d.float <= 0) return X.err(C, 'The cash box is empty.');
        const n = b.d.float; b.d.float = 0; X.touch(b); X.give(C, n, 'pos unfloat ' + b.id); X.ok(C, `You take ₦${n.toLocaleString('en-NG')} from the box.`);
      },
      fund(C, b, m, X) {   // send money from your own account into the POS wallet (for transfers and sends)
        const n = [20000, 50000, 100000].includes(m.n) ? m.n : 0; if (!n) return;
        if (!X.spend(C, n + POS.walletFee, 'pos fund ' + b.id)) return X.err(C, 'You don\u2019t have that much money.');
        b.d.wallet += n; X.touch(b); X.ok(C, `₦${n.toLocaleString('en-NG')} in the POS wallet (₦${POS.walletFee} charge).`);
      },
      bank(C, b, m, X) {   // go to the bank: the e-money comes out as cash for the box
        const n = Math.min(b.d.wallet, POS.boxCap - b.d.float) - POS.bankFee;
        if (n <= 0) return X.err(C, b.d.wallet <= POS.bankFee ? 'No money in the POS wallet to bring as cash.' : 'The cash box is full.');
        b.d.wallet -= n + POS.bankFee; b.d.float += n; X.touch(b); X.ok(C, `The bank gave you ₦${n.toLocaleString('en-NG')} cash for the box (₦${POS.bankFee} charge).`);
      },
      wallet(C, b, m, X) {   // send the POS wallet's money to yourself
        const n = b.d.wallet - POS.walletFee; if (n <= 0) return X.err(C, 'No money in the POS wallet.');
        b.d.wallet = 0; X.touch(b); X.give(C, n, 'pos wallet ' + b.id); X.ok(C, `₦${n.toLocaleString('en-NG')} from the POS wallet is in your pocket (₦${POS.walletFee} charge).`);
      },
      up(C, b, m, X) {
        const w = m.w === 'sim' ? 'sim' : 'pos2', L = b.d.up[w], prices = w === 'sim' ? POS.simUp : POS.pos2Up;
        if (L + 1 >= prices.length) return X.err(C, w === 'sim' ? 'You have two networks already.' : 'You have two POS machines already.');
        if (!X.spend(C, prices[L + 1], 'upgrade ' + w + ' ' + b.id)) return X.err(C, 'Not enough money for that.');
        b.d.up[w] = L + 1; X.touch(b); X.ok(C, w === 'sim' ? 'A second network: when one jams, the other works.' : 'A second POS machine: two customers at once.');
      },
    },
    useMsg: 'bzpos', useWord: 'pos',
  },
};

function fresh(id) {
  const kind = SITES[id][0];
  return { id, kind, owner: null, oname: '', name: '', till: 0, bought: null, here: 0, dirty: false, pub: '',
    d: { ...KIND[kind].fresh(), day: { k: '', sold: 0, earned: 0 }, tot: { sold: 0, earned: 0 }, last: [] } };
}
const defName = (kind, who) => kind === 'barber' ? `${who} Cuts` : kind === 'pos' ? `${who} POS` : `${who}'s Buka`;
const WORD = { buka: 'buka', barber: 'salon', pos: 'POS stand' };

export function createBiz({ db, now = () => Date.now(), rand = Math.random, log = () => {}, ctx }) {
  const B = new Map();
  for (const id of Object.keys(SITES)) B.set(id, fresh(id));
  for (const r of db.bizAll()) {
    const b = B.get(r.id); if (!b) continue;
    let d = null; try { d = JSON.parse(r.data); } catch (e) { d = null; }
    if (d) { b.d = { ...b.d, ...d }; KIND[b.kind].fix(b.d); }
    Object.assign(b, { owner: r.owner || null, oname: r.oname || '', name: r.name || '', till: r.till | 0, bought: r.bought || null });
    if (!b.owner) Object.assign(b, fresh(r.id));   // its owner's account is gone: for sale again
  }

  const K = b => KIND[b.kind];
  const isOpen = (b, t = now()) => !!b.owner && (b.d.cook > t || b.here > t) && K(b).ready(b, t);
  const appeal = (b, k) => clamp(Math.pow(K(b).items[k].p / b.d.pr[k], 1.6), .1, 2.2);
  const owned = uid => [...B.values()].filter(b => b.owner === uid);
  function pub(b) {
    const t = now(), k = K(b);
    if (!b.owner) return { id: b.id, kind: b.kind, o: '', n: '', sale: k.R.price };
    const m = {}; for (const i in k.items) m[i] = [b.d.pr[i], k.has(b, i) ? 1 : 0];
    return { id: b.id, kind: b.kind, o: b.oname, n: b.name, open: isOpen(b, t) ? 1 : 0, m, cook: b.d.cook > t ? 1 : 0, ...k.pubExtra(b, t) };
  }
  function mine(b) {   // everything, for the owner
    const t = now(); rollDay(b, t);
    return { id: b.id, kind: b.kind, n: b.name, till: b.till, open: isOpen(b, t), pr: b.d.pr, up: b.d.up, cook: Math.max(0, b.d.cook - t),
      here: b.here > t, today: b.d.day, tot: b.d.tot, last: b.d.last.slice(-6), ...K(b).mine(b, t) };
  }
  function rollDay(b, t) { const k = dayKey(t); if (b.d.day.k !== k) b.d.day = { k, sold: 0, earned: 0 }; }
  const touch = b => { b.dirty = true; b.push = true; };

  // ---- customers, every few seconds
  function sell(b, k, p, who, t) {
    K(b).served(b, k, t); b.till += p; rollDay(b, t); b.d.day.sold++; b.d.day.earned += p; b.d.tot.sold++; b.d.tot.earned += p;
    b.d.last.push([t, k, p, who || '']); if (b.d.last.length > 12) b.d.last.splice(0, b.d.last.length - 12); touch(b);
  }
  function tick(dt) {
    const t = now(), h = gameHour(t);
    for (const b of B.values()) {
      if (!isOpen(b, t)) continue;
      const k = K(b), ks = Object.keys(k.items).filter(i => k.has(b, i)); if (!ks.length) continue;
      const a = ks.map(i => appeal(b, i)), mean = sum(a) / a.length;
      const F = (b.kind === 'buka' ? .55 + .15 * ks.length : 1) * mean;
      let n = Math.min(20, poisson(k.R.rate * SITES[b.id][1] * k.tod(h) * k.boost(b) * F * dt / 60, rand));
      while (n-- > 0) {
        if (!isOpen(b, t)) break;
        const ks2 = Object.keys(k.items).filter(i => k.has(b, i)); if (!ks2.length) break;
        const w = ks2.map(i => appeal(b, i)); let r = rand() * sum(w), i = 0;
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

  // ---- the produce market: farmers put crops up for sale, buka owners buy them for their pantry
  const MK = new Map(); for (const r of db.mkAll()) MK.set(r.id, { ...r });
  const mkDay = new Map();   // seller -> {k: the day, n: units put up today}
  let mkDirty = true, mkPub = '';
  const mkOf = uid => [...MK.values()].filter(l => l.seller === uid);
  function mkList() {   // the cheapest dozen of each crop
    const out = [];
    for (const c in PRODUCE) out.push(...[...MK.values()].filter(l => l.crop === c).sort((a, b) => a.price - b.price || a.t - b.t).slice(0, 12));
    return out.map(l => ({ id: l.id, s: l.sname, c: l.crop, q: l.qty, p: l.price }));
  }
  const mkMine = C => ctx.send(C, { t: 'mkmine', l: mkOf(C.user.id).map(l => ({ id: l.id, c: l.crop, q: l.qty, p: l.price, t: l.t })) });
  function giveBack(uid, crop, qty) {   // produce going back to a farmer's store (now if they are online, else when they come)
    const C = ctx.online.get(uid);
    if (C && C.user) ctx.send(C, { t: 'mkback', items: [[crop, qty]] }); else db.backAdd(uid, crop, qty);
  }
  function market(C, m) {
    const uid = C.user.id;
    if (m.a === 'list') {
      const P = PRODUCE[m.crop]; if (!P || !Number.isInteger(m.n) || m.n < 1 || m.n > 40 || !P.prices.includes(m.p)) return ctx.send(C, { t: 'mkerr', crop: m.crop, n: m.n | 0, m: 'That sale is not right.' });
      if (mkOf(uid).length >= MK_MAX) return ctx.send(C, { t: 'mkerr', crop: m.crop, n: m.n, m: `You have ${MK_MAX} sales up already. Wait for them to sell, or take one down.` });
      const t = now(), k = dayKey(t), d = mkDay.get(uid) || { k, n: 0 }; if (d.k !== k) { d.k = k; d.n = 0; }
      if (d.n + m.n > MK_DAY) return ctx.send(C, { t: 'mkerr', crop: m.crop, n: m.n, m: `You can sell ${MK_DAY} units a day on the market.` });
      d.n += m.n; mkDay.set(uid, d);
      const id = db.mkAdd(uid, C.user.name, m.crop, m.n, m.p, t); MK.set(id, { id, seller: uid, sname: C.user.name, crop: m.crop, qty: m.n, price: m.p, t });
      mkDirty = true; ctx.ok(C, 'bz', `${m.n} ${P.n.toLowerCase()} on the market at ₦${m.p.toLocaleString('en-NG')} each. Buka owners can buy them now.`); mkMine(C);
    } else if (m.a === 'cancel') {
      const L = MK.get(m.lid); if (!L || L.seller !== uid) return;
      MK.delete(L.id); db.mkDel(L.id); mkDirty = true; ctx.send(C, { t: 'mkback', items: [[L.crop, L.qty]] }); mkMine(C);
    } else if (m.a === 'mine') mkMine(C);
  }
  function buyProduce(C, b, m) {   // a buka owner buys from a farmer's sale, into the buka's pantry
    const L = MK.get(m.lid); if (!L) return ctx.err(C, 'bz', 'That sale is gone. Somebody bought it, or the farmer took it down.');
    const n = Math.min(Number.isInteger(m.n) && m.n > 0 ? m.n : L.qty, L.qty), P = PRODUCE[L.crop];
    if ((b.d.pantry[L.crop] | 0) + n > 100) return ctx.err(C, 'bz', 'Your pantry is full of that already.');
    const cost = n * L.price, own = L.seller === C.user.id;
    if (!own && !ctx.spend(C, cost, 'produce ' + L.crop + ' from ' + L.sname)) return ctx.err(C, 'bz', 'Not enough money for that.');
    if (!own) ctx.credit(L.seller, cost, `produce to ${C.user.name}`, `${C.user.name} bought ${n} ${P.n.toLowerCase()} from your farm for ₦${cost.toLocaleString('en-NG')}.`);
    L.qty -= n; if (L.qty <= 0) { MK.delete(L.id); db.mkDel(L.id); } else db.mkQty(L.id, L.qty);
    b.d.pantry[L.crop] = (b.d.pantry[L.crop] | 0) + n; touch(b); mkDirty = true; flush();
    const S2 = ctx.online.get(L.seller); if (S2 && S2.user) mkMine(S2);
    ctx.ok(C, 'bz', `${n} ${P.n.toLowerCase()} from ${L.sname}'s farm are in your pantry. Cook with them: it costs much less.`);
  }
  function mkTick() {
    const t = now();
    for (const L of [...MK.values()]) if (t - L.t > MK_AGE) { MK.delete(L.id); db.mkDel(L.id); giveBack(L.seller, L.crop, L.qty); mkDirty = true; }
    if (mkDirty) { mkDirty = false; const l = mkList(), s2 = JSON.stringify(l); if (s2 !== mkPub) { mkPub = s2; const o = JSON.stringify({ t: 'mk', l }); for (const C of ctx.online.values()) if (C.ws.open) C.ws.send(o); } }
  }

  // ---- what players ask for: {t:'bz', a, id, ...}
  const X = { spend: (...a) => ctx.spend(...a), give: (...a) => ctx.give(...a), touch, err: null, ok: null };
  const A = {
    buy(C, b) {
      if (b.owner) return ctx.err(C, 'bz', `Somebody owns this ${WORD[b.kind]} already.`);
      if (owned(C.user.id).length >= MAX_OWN) return ctx.err(C, 'bz', `You can own ${MAX_OWN} businesses for now.`);
      if (!ctx.spend(C, K(b).R.price, 'buy ' + b.id)) return ctx.err(C, 'bz', `You don’t have enough money for this ${WORD[b.kind]}.`);
      Object.assign(b, fresh(b.id), { owner: C.user.id, oname: C.user.name, name: defName(b.kind, C.user.name), bought: now() }); b.pub = '';
      touch(b); flush(); log('biz', b.id, 'bought by', C.user.name);
      ctx.ok(C, 'bz', b.kind === 'barber' ? 'The salon is yours! Buy supplies and fuel, and open for customers.' : b.kind === 'pos' ? 'The POS stand is yours! Put cash in the box and open for customers.' : 'The buka is yours! Cook some food and open for customers.');
    },
    name(C, b, m) {
      const n = cleanChat(m.n).replace(/[^A-Za-z0-9 '&.\-]/g, '').replace(/\s+/g, ' ').trim();
      if (n.length < 3 || n.length > 22 || /\*/.test(cleanChat(m.n))) return ctx.err(C, 'bz', 'Name: 3 to 22 letters, no bad words.');
      b.name = n; touch(b); ctx.ok(C, 'bz', 'New name on your board.');
    },
    price(C, b, m) {
      const it = K(b).items; if (!(m.k in it) || !Number.isFinite(m.p)) return;
      const base = it[m.k].p; b.d.pr[m.k] = round50(clamp(m.p, base * PRICE_MIN, base * PRICE_MAX)); touch(b);
    },
    hire(C, b, m) {
      const h = m.h === 24 ? 24 : 6, cost = K(b).helper[h], t = now(), who = b.kind === 'barber' ? 'Barber Sunday' : b.kind === 'pos' ? 'Mama Nkechi' : 'Iya Basira';
      if (b.d.cook - t > 42 * 3600e3) return ctx.err(C, 'bz', `${who} is booked for long enough already.`);
      if (!ctx.spend(C, cost, 'helper ' + b.id)) return ctx.err(C, 'bz', `Not enough money to pay ${who}.`);
      b.d.cook = Math.max(b.d.cook, t) + h * 3600e3; touch(b); ctx.ok(C, 'bz', `${who} will work for you for ${h} hours, even when you are away.`);
    },
    take(C, b, m) {
      if (b.till <= 0) return ctx.err(C, 'bz', 'The till is empty.');
      const fee = m.far ? Math.round(b.till * TAKE_FEE) : 0, n = b.till - fee;
      b.till = 0; touch(b); ctx.give(C, n, 'till ' + b.id); flush();
      ctx.ok(C, 'bz', fee ? `₦${n.toLocaleString('en-NG')} sent to you (₦${fee.toLocaleString('en-NG')} transfer fee).` : `You collect ₦${n.toLocaleString('en-NG')} from the till.`);
    },
    here(C, b) { const was = isOpen(b); b.here = now() + 40e3; if (isOpen(b) !== was) touch(b); },
    sell(C, b) {
      const back = Math.round(K(b).R.price * .5 + K(b).spent(b.d) * .5) + b.till;
      ctx.give(C, back, 'sell ' + b.id); Object.assign(b, fresh(b.id)); b.dirty = true; b.pub = ''; flush();
      ctx.ok(C, 'bz', `You sold it for ₦${back.toLocaleString('en-NG')} (with what was in the till).`);
    },
    mine(C, b) { ctx.send(C, { t: 'bzd', b: mine(b) }); },
  };
  function use(C, b, m) {   // a player eats at the buka, or gets a cut at the salon
    const k = K(b); if (!(m.k in k.items)) return;
    const what = WORD[b.kind]; if (b.kind === 'pos') return;
    if (!b.owner) return ctx.err(C, 'bz', `This ${what} is closed. It is for sale.`);
    if (!isOpen(b)) return ctx.err(C, 'bz', `The ${what} is closed right now.`);
    if (!k.has(b, m.k)) return ctx.err(C, 'bz', 'That food don finish. Try another one.');
    const t = now(), p = b.d.pr[m.k];
    if (b.owner === C.user.id) { k.served(b, m.k, t); touch(b); }   // your own: no money changes hands
    else { if (!ctx.spend(C, p, k.useWord + ' ' + b.id)) return ctx.err(C, 'bz', 'You don’t have enough money.'); sell(b, m.k, p, C.user.name, t); }
    ctx.send(C, { t: k.useMsg, id: b.id, k: m.k });
  }
  // a player sends money to another player through a POS: the agent sends it from the POS wallet and keeps a fee
  const sends = new Map();   // account -> [times] (10 sends an hour at most)
  function sendMoney(C, b, m) {
    if (b.kind !== 'pos') return;
    const S = POS.send, n = Number.isInteger(m.n) ? m.n : 0, to = String(m.to || '').slice(0, 32);
    if (n < 100 || n > S.most) return ctx.err(C, 'bz', `Send between ₦100 and ₦${S.most.toLocaleString('en-NG')}.`);
    if (!b.owner || !isOpen(b)) return ctx.err(C, 'bz', b.owner && !network(b.id, now(), !!b.d.up.sim) ? 'Network don jam. Try again small time, or another POS.' : 'This POS is closed right now.');
    const R = ctx.findUser(to); if (!R) return ctx.err(C, 'bz', 'No player with that username.');
    if (R.id === C.user.id) return ctx.err(C, 'bz', 'You cannot send money to yourself.');
    const fee = b.owner === C.user.id ? 0 : clamp(Math.round(n * S.pct), S.min, S.max);
    if (b.d.wallet < n) return ctx.err(C, 'bz', 'This POS don run out of money in the machine. Try another one.');
    const t = now(), h = (sends.get(C.user.id) || []).filter(x => x > t - 3600e3); if (h.length >= 10) return ctx.err(C, 'bz', 'You have sent a lot this hour. Try again later.');
    if (!ctx.spend(C, n + fee, 'send to ' + R.name + ' at ' + b.id)) return ctx.err(C, 'bz', 'You don\u2019t have that much money.');
    h.push(t); sends.set(C.user.id, h);
    b.d.wallet -= n; b.d.float = Math.min(POS.boxCap, b.d.float + n);
    if (fee) { b.till += fee; rollDay(b, t); b.d.day.sold++; b.d.day.earned += fee; b.d.tot.sold++; b.d.tot.earned += fee; b.d.last.push([t, 'send', fee, C.user.name]); }
    touch(b);
    ctx.credit(R.id, n, `from ${C.user.name} at ${b.id}`, `${C.user.name} sent you ₦${n.toLocaleString('en-NG')} through ${b.name}.`);
    flush(); log('send', C.user.name, '->', R.name, n, 'fee', fee, b.id);
    ctx.send(C, { t: 'bzsent', id: b.id, to: R.name, n, fee });
  }
  function handle(C, m) {   // (and everybody sees the result at once)
    handle1(C, m); pushAll(); mkTick();
  }
  function handle1(C, m) {
    const b = B.get(m.id); if (!b) return;
    if (m.a === 'use' || m.a === 'eat') return use(C, b, m);
    if (m.a === 'send') return sendMoney(C, b, m);
    if (m.a === 'produce') { if (b.kind !== 'buka') return; if (b.owner !== C.user.id) return ctx.err(C, 'bz', 'This is not your buka.'); return buyProduce(C, b, m); }
    if (m.a === 'buy') return A.buy(C, b);
    const own = A[m.a] || K(b).act[m.a]; if (!own) return;
    if (b.owner !== C.user.id) return ctx.err(C, 'bz', `This is not your ${WORD[b.kind]}.`);
    if (A[m.a]) return A[m.a](C, b, m);
    X.err = (C2, msg) => ctx.err(C2, 'bz', msg); X.ok = (C2, msg) => ctx.ok(C2, 'bz', msg);
    K(b).act[m.a](C, b, m, X);
  }
  function hello(C) {   // just signed in: all the boards, and your own businesses in full
    const kinds = {}; for (const k in KIND) kinds[k] = KIND[k].rules();
    ctx.send(C, { t: 'bz', s: [...B.values()].map(pub), all: 1, rules: kinds.buka, kinds });
    for (const b of owned(C.user.id)) ctx.send(C, { t: 'bzd', b: mine(b) });
    const lost = db.lostBiz ? db.lostBiz(C.user.id) : []; if (lost.length) ctx.send(C, { t: 'bzlost', k: lost });   // taken back in the start over
    ctx.send(C, { t: 'mk', l: mkList() });
    const back = db.backTake(C.user.id); if (back.length) ctx.send(C, { t: 'mkback', items: back.map(r => [r.crop, r.qty]) });
    if (mkOf(C.user.id).length) mkMine(C);
  }
  return { handle, hello, tick, flush, pushAll: () => { pushAll(); mkTick(); }, market: (C, m) => { market(C, m); mkTick(); }, get: id => B.get(id), isOpen, listings: () => [...MK.values()] };
}
