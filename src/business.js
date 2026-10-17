/* ================= Businesses you own (online): the buka and the barbing salon =================
   Eight bukas and six barbing salons stand by busy roads in Mushin and at the big markets. One that nobody owns has
   FOR SALE on its board; buy it (signed in) and your name goes up on the board for every player to see.
   The buka: cook pots of food, set your prices, hire Iya Basira to sell while you are away, bigger pots, more benches.
   The salon: buy supplies (30 cuts a pack), keep fuel in the generator for when NEPA takes the light, set your prices
   for each cut, hire Barber Sunday, a second chair, an AC. Customers come by themselves (the server counts them: food
   at lunch, cuts in the evening, fewer at night, more when you are cheaper); real players eat or get a cut too, and
   their money is yours. Collect the till at the counter.
   Everything that matters (who owns what, the stock, the money) lives on the server (server/src/biz.js); this file
   draws the places, the boards, the workers and the customers, and runs the menus. The game passes in `api`. */

// where they stand: clear ground by a big road, front to the road. Found by a search over the map in the test browser.
export const SITES = {
  buka_1: { x: 265.98, z: -17.85, ry: -2.7309, near: 'Mushin' },
  buka_2: { x: -143.05, z: 206.92, ry: 1.4444, near: 'Mushin' },
  buka_3: { x: 82.11, z: -415.92, ry: 2.5985, near: 'Mushin' },
  buka_4: { x: -274.61, z: -379.09, ry: 0.441, near: 'Mushin' },
  buka_5: { x: 738.22, z: 11.62, ry: -1.9326, near: 'Idi-Oro Market' },
  buka_6: { x: 1043.05, z: 537.73, ry: 0.814, near: 'Mushin Market' },
  buka_7: { x: -1058.91, z: -1566.99, ry: -2.0166, near: 'Ladipo Market' },
  buka_8: { x: -4058.97, z: 935.85, ry: -3.0059, near: 'Computer Village' },
  barber_1: { x: 304.73, z: -150.51, ry: 1.8796, near: 'Mushin' },
  barber_2: { x: -180.69, z: 345.03, ry: 0.8915, near: 'Mushin' },
  barber_3: { x: -140.06, z: -425.01, ry: -2.6967, near: 'Mushin' },
  barber_4: { x: 796.67, z: 122.87, ry: -0.1059, near: 'Idi-Oro Market' },
  barber_5: { x: 1141, z: 433.78, ry: -2.3168, near: 'Mushin Market' },
  barber_6: { x: -3963.78, z: 899.85, ry: 1.7712, near: 'Computer Village' },
  pos_1: { x: -95.83, z: 116.51, ry: -2.0246, near: 'Mushin' },
  pos_2: { x: 354.07, z: -61.82, ry: -1.2273, near: 'Mushin' },
  pos_3: { x: -45.52, z: -517.66, ry: -0.5829, near: 'Mushin' },
  pos_4: { x: 860.8, z: 22.13, ry: -0.5133, near: 'Idi-Oro Market' },
  pos_5: { x: 1209.72, z: 580.06, ry: 0.6289, near: 'Mushin Market' },
  pos_6: { x: -4143.5, z: 998.67, ry: -1.1392, near: 'Computer Village' },
};
const kindOf = id => id.split('_')[0];
const STEPS = [.7, .85, 1, 1.2, 1.5, 2];   // price choices, as shares of the usual price
const SERVE_R = 1.9, HERE_R = 14, FOLK = ['mama', 'baba', 'areaboy', 'hawker', 'lady_black', 'schoolboy', 'girl'];
// each kind: its model (from Blender), its spots in the model's axes (x right, y up, z toward the road), its walls
const KINDS = {
  buka: { glb: 'bk_buka', word: 'buka', Word: 'Buka', worker: 'Iya Basira', workerCast: 'mama',
    sign: { y: 2.56, z: 3.405, w: 3.44, h: .62 }, serve: { x: 0, z: .55 }, staff: { x: -.2, z: -1.15 },
    wait: [[-.9, 1.05, Math.PI], [.4, 1.05, Math.PI], [-.5, 2.45, 0], [.8, 2.45, 0], [1.85, 1.75, -Math.PI / 2]],
    walls: [[0, -1.53, 2.27, 1.53, 2.7], [0, 1.75, 1.42, .4, .8], [0, 1.08, 1.3, .16, .47], [0, 2.42, 1.3, .16, .47], [-2.1, 3.3, .08, .08, 2.3], [2.1, 3.3, .08, .08, 2.3]],
    board: ['#f7f0de', '#1d8a4e', '#1a3a8a'], tagline: 'RICE · AMALA · EBA · POUNDED YAM · COLD DRINKS', map: 'Food · a business you can buy (online)' },
  barber: { glb: 'bb_barber', word: 'salon', Word: 'Salon', worker: 'Barber Sunday', workerCast: 'areaboy',
    sign: { y: 3.12, z: .105, w: 4.86, h: .6 }, serve: { x: 1.9, z: .95 }, staff: { x: -.95, z: -.75 },
    wait: [[-2.2, .75, 0], [-1.3, .75, 0], [-2.9, .6, .4]],
    walls: [[0, -1.22, 3.08, 1.24, 2.8], [3.68, -.4, .34, .26, .6], [-1.65, .75, .85, .16, .47], [.85, 1.8, .33, .2, .9], [-2.93, 1.3, .06, .06, 2.4], [2.93, 1.3, .06, .06, 2.4]],
    board: ['#fbf7ee', '#c0281e', '#16224a'], tagline: 'UNISEX BARBING SALON · LOW CUT · FADE', map: 'Barbing salon · a business you can buy (online)' },
  pos: { glb: 'ps_pos', word: 'POS stand', Word: 'POS', worker: 'Mama Nkechi', workerCast: 'lady_black',
    sign: { y: 1.49, z: 1.5, w: 2.2, h: .78 }, serve: { x: 0, z: .35 }, staff: { x: -.15, z: -1.15 },
    wait: [[1.3, .55, 0], [1.85, .55, 0], [-1.5, .45, .5]],
    walls: [[0, -.5, .72, .34, .95], [1.55, .55, .65, .16, .47], [-1.15, 1.45, .04, .04, 2], [1.15, 1.45, .04, .04, 2], [1.35, -1.25, .05, .05, 2]],
    board: ['#f6f2e8', '#13a05a', '#0c5a34'], tagline: 'WITHDRAWAL · TRANSFER · AIRTIME · BILLS', map: 'POS · send money to players · a business you can buy (online)' },
};

export function createBusiness(api) {
  const { THREE, scene } = api;
  const naira = api.naira;
  const B = {};   // id -> {id, kind, x, z, ry, pub, mine, sign, cv, tex, spots, staffSp}
  let RK = {}, ready = false;
  const MKT = { l: [], mine: [], lvl: 1 };   // the produce market: the cheapest sales, your own sales, your price level
  try { MKT.lvl = Math.max(0, Math.min(2, +(localStorage.getItem('naija-mkprice') ?? 1))); } catch (e) { /* ignore */ }
  const EM = { tomato: '🍅', cassava: '🥔', yam: '🍠' };
  const W = (s, lx, lz) => { const c = Math.cos(s.ry), sn = Math.sin(s.ry); return { x: s.x + lx * c + lz * sn, z: s.z - lx * sn + lz * c }; };

  // ---- the places, their boards and their walls
  async function build(kind) {
    const KD = KINDS[kind];
    let m = null; try { m = await api.glb(KD.glb); } catch (e) { console.warn(kind + ' model', e); return; }
    const levels = m.geo1 ? [{ geo: m.geo, mat: m.mat, dist: api.Q.lod0 * 1.1, shadow: true }, { geo: m.geo1, mat: m.mat1, dist: api.Q.draw * .9, shadow: false }] : [{ geo: m.geo, mat: m.mat, dist: api.Q.draw * .9, shadow: true }];
    const items = [];
    for (const [id, s] of Object.entries(SITES)) {
      if (kindOf(id) !== kind) continue;
      const y = api.groundY(s.x, s.z); s.y = y; items.push({ x: s.x, y, z: s.z, ry: s.ry, sc: 1 });
      const b = B[id] = { id, kind, ...s, pub: null, spots: [], staffSp: null };
      for (const [lx, lz, hx, hz, h] of KD.walls) { const w = W(s, lx, lz); api.addOB(w.x, w.z, hx, hz, -s.ry, h, y); }
      // the board: the owner's name, painted in the game
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = Math.round(1024 * KD.sign.h / KD.sign.w * (kind === 'barber' ? 1.4 : 1));
      if (kind === 'buka') cv.height = 184; if (kind === 'pos') cv.height = 362;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(KD.sign.w, KD.sign.h), new THREE.MeshStandardMaterial({ map: tex, roughness: .8, metalness: 0, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 }));
      const sp = W(s, 0, KD.sign.z); sign.position.set(sp.x, y + KD.sign.y, sp.z); sign.rotation.y = s.ry; sign.layers.set(1); scene.add(sign);
      Object.assign(b, { cv, tex, sign });
      paint(b);
      api.mapPlace({ name: kind === 'barber' ? 'Barbing salon' : kind === 'pos' ? 'POS' : 'Buka', sub: KD.map, kind: 'place', x: s.x, z: s.z, id });
    }
    if (items.length) new api.CullSet(levels, items, { shadowDist: api.Q.shR, name: kind });
    ready = true;
  }

  // ---- the board
  function paint(b) {
    const KD = KINDS[b.kind], g = b.cv.getContext('2d'), P = b.pub, Wc = b.cv.width, Hc = b.cv.height, R = RK[b.kind];
    const sale = !P || !P.o, name = sale ? `${KD.word.toUpperCase()} FOR SALE` : (P.n || P.o).toUpperCase();
    g.fillStyle = sale ? '#f4ecd8' : KD.board[0]; g.fillRect(0, 0, Wc, Hc);
    g.strokeStyle = sale ? '#c0281e' : KD.board[1]; g.lineWidth = 14; g.strokeRect(7, 7, Wc - 14, Hc - 14);
    const F = 'Bungee, Impact, "Arial Black", sans-serif', top = Hc * .4, low = Hc * .79;
    let fs = Math.round(Hc * .5); g.font = `${fs}px ${F}`; while (g.measureText(name).width > Wc - 90 && fs > 36) { fs -= 4; g.font = `${fs}px ${F}`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillText(name, Wc / 2 + 4, top + 4);
    g.fillStyle = sale ? '#c0281e' : KD.board[2]; g.fillText(name, Wc / 2, top);
    const sub = sale ? `${naira(R ? R.price : 100000)} · sign in online and buy it` : KD.tagline, room = sale ? Wc - 80 : Wc - 2 * 235;
    let f2 = Math.round(Hc * .18); g.font = `600 ${f2}px "Barlow Semi Condensed", Arial, sans-serif`; while (g.measureText(sub).width > room && f2 > 16) { f2 -= 1; g.font = `600 ${f2}px "Barlow Semi Condensed", Arial, sans-serif`; }
    g.fillStyle = '#2a2622'; g.fillText(sub, Wc / 2, low);
    if (!sale) {
      const open = !!P.open; g.fillStyle = open ? '#1d8a4e' : '#8a8a86'; rr(g, Wc - 210, Hc - 66, 170, 50, 12); g.fill(); g.fillStyle = '#fff'; g.font = `30px ${F}`; g.fillText(open ? 'OPEN' : 'CLOSED', Wc - 125, Hc - 39);
      if (b.kind === 'pos') { g.fillStyle = P.net ? '#13a05a' : '#c0281e'; g.beginPath(); g.arc(80, Hc - 41, 18, 0, 6.3); g.fill(); g.fillStyle = '#2a2622'; g.font = `600 24px Arial, sans-serif`; g.textAlign = 'left'; g.fillText(P.net ? 'NETWORK OK' : 'NETWORK JAM', 106, Hc - 40); g.textAlign = 'center'; }
      if (b.kind === 'barber') { g.fillStyle = P.light ? '#e9b414' : '#5a5a58'; g.beginPath(); g.arc(80, Hc - 41, 18, 0, 6.3); g.fill(); g.fillStyle = '#2a2622'; g.font = `600 22px Arial, sans-serif`; g.textAlign = 'left'; g.fillText(P.light ? 'LIGHT' : 'GEN', 106, Hc - 40); g.textAlign = 'center'; }   // light (NEPA) or not
    }
    b.tex.needsUpdate = true;
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // ---- the people: the worker inside, customers waiting
  function people(b) {
    const KD = KINDS[b.kind], P = b.pub, open = !!(P && P.open), near = Math.hypot(api.player().x - b.x, api.player().z - b.z) < 70;
    const wantStaff = near && open, wantWait = near && open ? Math.min(KD.wait.length, 1 + (b.id.charCodeAt(b.id.length - 1) % 3)) : 0;
    if (wantStaff && !b.staffSp) { const w = W(b, KD.staff.x, KD.staff.z); b.staffSp = api.spot(KD.workerCast, w.x, w.z, b.ry + (b.kind === 'barber' ? Math.PI : 0), ['idle_1', 'talk', 'idle_1']); }
    else if (!wantStaff && b.staffSp) { api.unspot(b.staffSp); b.staffSp = null; }
    while (b.spots.length < wantWait) { const [lx, lz, r] = KD.wait[b.spots.length], w = W(b, lx, lz); b.spots.push(api.spot(FOLK[(b.spots.length * 3 + b.id.length) % FOLK.length], w.x, w.z, b.ry + r, ['talk', 'idle_1', 'text', 'idle_1'])); }
    while (b.spots.length > wantWait) api.unspot(b.spots.pop());
  }

  // ---- messages from the server
  function on(m) {
    if (m.t === 'bz') {
      if (m.kinds) RK = m.kinds; else if (m.rules) RK.buka = m.rules;
      for (const p of m.s) { const b = B[p.id]; if (!b) continue; b.pub = p; paint(b); people(b); }
      if (api.menuOpen() && CUR) refresh();
    } else if (m.t === 'bzd') { const b = B[m.b.id]; if (b) { b.mine = m.b; if (api.menuOpen() && CUR === b) refresh(); } }
    else if (m.t === 'bzate') { const D = RK.buka && RK.buka.items[m.k]; api.heal(40); api.toast(`You chop ${D ? D.n.toLowerCase() : 'food'}. Body don set! +40 health`, 3); }
    else if (m.t === 'mk') { MKT.l = m.l || []; if (api.menuOpen() && CUR) refresh(); }
    else if (m.t === 'mkmine') MKT.mine = m.l || [];
    else if (m.t === 'mkback') { const got = []; for (const [k, n] of m.items || []) { api.farmPut(k, n); got.push(`${n} ${k}`); } if (got.length) api.toast(`Back in your farm store from the market: ${got.join(', ')}.`, 3.5); }
    else if (m.t === 'mkerr') { if (m.n > 0 && m.crop) api.farmPut(m.crop, m.n); api.toast(m.m, 3); }
    else if (m.t === 'bzsent') api.toast(`Sent ${naira(m.n)} to ${m.to}${m.fee ? ` (fee ${naira(m.fee)})` : ''}.`, 3.5);
    else if (m.t === 'bzcut') { const D = RK.barber && RK.barber.items[m.k]; api.heal(10); api.toast(`Fresh ${D ? D.n.toLowerCase() : 'cut'}! You look clean. +10 health`, 3); }
    else if ((m.t === 'err' || m.t === 'ok') && m.w === 'bz') { api.toast(m.m, 3); if (api.menuOpen() && CUR) setTimeout(refresh, 50); }
  }
  function signedOut() { for (const b of Object.values(B)) { b.mine = null; } }

  // ---- at the counter (or the salon door)
  function at() {
    if (!ready || api.mode() !== 'walk') return null; const p = api.player();
    for (const b of Object.values(B)) { const S = KINDS[b.kind].serve, w = W(b, S.x, S.z); if (Math.hypot(p.x - w.x, p.z - w.z) < SERVE_R) return b; }
    return null;
  }
  let CUR = null, VIEW = 'main';
  const mineB = b => !!(b && b.pub && b.pub.o && api.myName() && b.pub.o.toLowerCase() === api.myName().toLowerCase());
  function prompt() {
    const b = at(); if (!b) return null; const P = b.pub, KD = KINDS[b.kind], R = RK[b.kind];
    if (!api.signedIn()) return P && P.o ? `${P.n || KD.Word} · sign in online to ${b.kind === 'barber' ? 'get a cut' : b.kind === 'pos' ? 'send money' : 'eat here'}` : `${KD.Word} for sale · sign in online to buy it`;
    if (!P || !P.o) return `Buy this ${KD.word} · ${naira(R ? R.price : 0)}`;
    if (mineB(b)) return `Your ${KD.word} · ${P.n}`;
    return P.open ? (b.kind === 'barber' ? `Get a cut at ${P.n}` : b.kind === 'pos' ? `Send money at ${P.n}` : `Eat at ${P.n}`) : `${P.n} · ${b.kind === 'pos' && P.o && !P.net ? 'network don jam' : 'closed now'}`;
  }
  function action() {
    const b = at(); if (!b) return false;
    if (!api.signedIn()) { api.openSignIn(); return true; }
    CUR = b; VIEW = 'main'; if (mineB(b)) api.send({ t: 'bz', a: 'mine', id: b.id }); refresh(); return true;
  }
  const send = (a, o = {}) => api.send({ t: 'bz', a, id: CUR.id, ...o });
  function refresh() { if (!CUR) return; const t = title(); api.openMenu(t[0], t[1], rows); }
  function title() {
    const b = CUR, P = b.pub || {}, KD = KINDS[b.kind];
    if (!P.o && b.kind === 'pos') return ['POS STAND FOR SALE', 'Own it: keep cash in the box, people withdraw and transfer, and every one pays you a fee (players too)'];
    if (!P.o) return [`${KD.word.toUpperCase()} FOR SALE`, b.kind === 'barber' ? 'Own it: set your prices, keep the clippers running, and customers pay you, even players' : 'Own it: cook, set your prices, and customers pay you, even players'];
    if (!mineB(b)) return [(P.n || KD.Word).toUpperCase(), `${P.o}'s ${KD.word} · ${P.open ? 'open' : 'closed now'}${b.kind === 'barber' ? (P.light ? ' · NEPA light dey' : ' · no light: generator') : ''}${b.kind === 'pos' ? (P.net ? ' · network OK' : ' · network don jam') : ''}`];
    const M = b.mine; if (!M) return [(P.n || `YOUR ${KD.word}`).toUpperCase(), 'Loading…'];
    const hrs = M.cook > 0 ? Math.ceil(M.cook / 36e5) : 0, who = hrs ? `${KD.worker} here ${hrs} h more` : `no ${b.kind === 'barber' ? 'barber' : b.kind === 'pos' ? 'attendant' : 'cook'}: open while you stand here`;
    const stock = b.kind === 'pos' ? `cash in the box ${naira(M.float)} · POS wallet ${naira(M.wallet)} · ${M.net ? 'network OK' : 'network don jam'}` : b.kind === 'barber' ? `supplies ${M.sup}/${M.supCap} cuts · fuel ${(+M.fuel).toFixed(1)}/${M.tank} L · ${M.light ? 'NEPA light dey' : 'no light'}` : `${Object.values(M.st).reduce((s, x) => s + (x | 0), 0)}/${M.cap} plates in the pots`;
    return [(M.n || `YOUR ${KD.word}`).toUpperCase(), `${M.open ? 'Open' : 'Closed'} · ${stock} · ${who} · today ${M.today.sold} sold, ${naira(M.today.earned)}`];
  }
  function rows() {
    const b = CUR, P = b.pub || {}, R = RK[b.kind], KD = KINDS[b.kind]; if (!R) return [{ name: 'Connecting…', btn: '…', off: true, act() {} }];
    const cash = api.cash(), items = R.items, keys = Object.keys(items);
    if (!P.o) return [{ name: `Buy this ${KD.word}`, sub: 'You can own 2 businesses. Sell it back any time for half.', btn: naira(R.price), off: cash < R.price, act() { send('buy'); } }];
    if (!mineB(b) && b.kind === 'pos') return [
      { name: 'Send money to a player', sub: `By username · fee ${R.send.pct * 100}% (${naira(R.send.min)} to ${naira(R.send.max)}) · arrives at once`, btn: 'SEND ▸', off: !P.open, act() { askSend(); } },
      ...keys.map(k => ({ name: items[k].n, sub: 'For the people of the area', btn: `fee ${naira((P.m && P.m[k] && P.m[k][0]) || items[k].p)}`, off: true, act() {} }))];
    if (!mineB(b)) return keys.map(k => { const [p, has] = (P.m && P.m[k]) || [items[k].p, 0];
      return { name: items[k].n, sub: b.kind === 'barber' ? (P.open ? 'Fresh cut · +10 health' : 'Closed now') : (has ? 'Hot · +40 health' : 'Finished for now'), btn: naira(p), off: !P.open || !has || cash < p, act() { send('use', { k }); } }; });
    const M = b.mine; if (!M) return [{ name: `Loading your ${KD.word}…`, btn: '…', off: true, act() {} }];
    if (VIEW === 'cook') {
      const room = M.cap - Object.values(M.st).reduce((s, q) => s + (q | 0), 0), n = Math.min(10, room), pan = M.pantry || {};
      const farmRows = R.dishCrop ? keys.filter(k => (pan[R.dishCrop[k]] | 0) >= Math.ceil(n * R.perTen / 10) && n > 0).map(k => { const c = R.dishCrop[k], cost = Math.round(n * items[k].p * R.farmCost);
        return { name: `${EM[c] || ''} Cook ${n} plates of ${items[k].n} with farm ${R.produce[c].n.toLowerCase()}`, sub: `Uses ${Math.ceil(n * R.perTen / 10)} of your ${pan[c]} · much cheaper`, btn: naira(cost), off: cash < cost, act() { send('cook', { k, n, farm: 1 }); } }; }) : [];
      return [back(), ...farmRows, ...keys.map(k => { const cost = Math.round(n * items[k].p * R.cost);
        return { name: `Cook ${n || 10} plates of ${items[k].n}`, sub: `${M.st[k] | 0} in the pot now · market ingredients`, btn: n ? naira(cost) : 'Full', off: !n || cash < cost, act() { send('cook', { k, n }); } }; }),
        { name: 'Buy produce from farmers', sub: `Pantry: ${Object.entries(pan).map(([c, q]) => `${c} ${q}`).join(' · ') || 'empty'}`, btn: 'FARMERS ▸', act() { VIEW = 'farm'; refresh(); } }];
    }
    if (VIEW === 'farm') {
      const L = MKT.l.filter(l => R.produce && R.produce[l.c]);
      if (!L.length) return [back(), { name: 'No farmer is selling right now', sub: 'Farmers sell from the Oya Farm app on their phone. Check again later.', btn: '…', off: true, act() {} }];
      return [back(), ...L.slice(0, 9).map(l => ({ name: `${EM[l.c] || ''} ${l.q} ${R.produce[l.c].n.toLowerCase()} · ${l.s}'s farm`, sub: `${naira(l.p)} each · for ${Object.keys(R.dishCrop).filter(k => R.dishCrop[k] === l.c).map(k => items[k].n.split(' ')[0]).join(', ')}`, btn: naira(l.p * l.q), off: cash < l.p * l.q, act() { send('produce', { lid: l.id, n: l.q }); } }))];
    }
    if (VIEW === 'price') return [back(), ...keys.map(k => { const base = items[k].p, cur = M.pr[k]; const i = STEPS.findIndex(s => Math.round(base * s / 50) * 50 >= cur); const nx = STEPS[(i + 1) % STEPS.length];
      return { name: items[k].n, sub: `usual ${naira(base)} · cheaper sells faster`, btn: `${naira(cur)} ▸`, act() { send('price', { k, p: Math.round(base * nx / 50) * 50 }); } }; })];
    if (VIEW === 'box') return [back(), ...[20000, 50000, 100000].map(n => ({ name: `Put ${naira(n)} in the cash box`, sub: `From your pocket · ${naira(M.float)} in the box now (holds ${naira(M.boxCap)})`, btn: naira(n), off: cash < n || M.float + n > M.boxCap, act() { send('float', { n }); } })),
      { name: 'Take all the cash out', sub: 'Back into your pocket (the POS cannot pay withdrawals without it)', btn: 'TAKE', off: M.float <= 0, act() { send('unfloat'); } }];
    if (VIEW === 'wallet') return [back(), ...[20000, 50000].map(n => ({ name: `Fund the wallet with ${naira(n)}`, sub: `From your pocket · for transfers and sends · ${naira(R.walletFee)} charge`, btn: naira(n + R.walletFee), off: cash < n + R.walletFee, act() { send('fund', { n }); } })),
      { name: 'Bank run: bring it as cash', sub: `The POS wallet's ${naira(M.wallet)} comes back as cash for the box · ${naira(R.bankFee)} charge`, btn: 'BANK', off: M.wallet <= R.bankFee, act() { send('bank'); } },
      { name: 'Send it to yourself', sub: `The POS wallet's money into your pocket · ${naira(R.walletFee)} charge`, btn: 'SEND', off: M.wallet <= R.walletFee, act() { send('wallet'); } }];
    if (VIEW === 'sell') return [back(), { name: `Yes, sell my ${KD.word}`, sub: 'Somebody else can buy it after', btn: 'SELL NOW', act() { VIEW = 'main'; send('sell'); } }];
    const common = [
      { name: `${KD.worker} · 6 hours`, sub: b.kind === 'barber' ? 'He cuts for you while you are away' : 'She sells for you while you are away', btn: naira(R.helper[6]), off: cash < R.helper[6], act() { send('hire', { h: 6 }); } },
      { name: `${KD.worker} · 24 hours`, sub: 'A whole day, cheaper', btn: naira(R.helper[24]), off: cash < R.helper[24], act() { send('hire', { h: 24 }); } },
    ];
    const tail = [
      { name: 'New name on the board', sub: M.n, btn: 'RENAME', act() { askText(`Your ${KD.word}’s name`, M.n, 22, n => { if (n) send('name', { n }); }); } },
      { name: `Sell the ${KD.word} back`, sub: 'Half of what you paid, and the till', btn: 'SELL', act() { VIEW = 'sell'; refresh(); } }];
    if (VIEW === 'grow') {
      if (b.kind === 'pos') return [back(), ...common,
        ...(M.up.pos2 + 1 < R.pos2Up.length ? [{ name: 'A second POS machine', sub: 'Two customers at once', btn: naira(R.pos2Up[1]), off: cash < R.pos2Up[1], act() { send('up', { w: 'pos2' }); } }] : []),
        ...(M.up.sim + 1 < R.simUp.length ? [{ name: 'A second network SIM', sub: 'When one network jams, the other works', btn: naira(R.simUp[1]), off: cash < R.simUp[1], act() { send('up', { w: 'sim' }); } }] : []), ...tail];
      if (b.kind === 'barber') return [back(), ...common,
        ...(M.up.chair + 1 < R.chairUp.length ? [{ name: 'A second barber chair', sub: 'Two customers at once', btn: naira(R.chairUp[1]), off: cash < R.chairUp[1], act() { send('up', { w: 'chair' }); } }] : []),
        ...(M.up.ac + 1 < R.acUp.length ? [{ name: 'An AC', sub: 'People like it cool (twice the fuel without light)', btn: naira(R.acUp[1]), off: cash < R.acUp[1], act() { send('up', { w: 'ac' }); } }] : []), ...tail];
      return [back(), ...common,
        ...(M.up.cap + 1 < R.capUp.length ? [{ name: `Bigger pots · ${R.cap[M.up.cap + 1]} plates`, sub: 'Cook more at once, sell longer', btn: naira(R.capUp[M.up.cap + 1]), off: cash < R.capUp[M.up.cap + 1], act() { send('up', { w: 'cap' }); } }] : []),
        ...(M.up.seat + 1 < R.seatUp.length ? [{ name: 'More benches', sub: 'More customers at once', btn: naira(R.seatUp[M.up.seat + 1]), off: cash < R.seatUp[M.up.seat + 1], act() { send('up', { w: 'seat' }); } }] : []), ...tail];
    }
    const till = { name: `Collect the till · ${naira(M.till)}`, sub: 'The money your customers paid', btn: 'COLLECT', off: M.till <= 0, act() { send('take'); } };
    const prices = { name: 'Set your prices', sub: keys.map(k => naira(M.pr[k])).join(' · '), btn: 'PRICES ▸', act() { VIEW = 'price'; refresh(); } };
    if (b.kind === 'pos') return [till,
      { name: `Cash in the box · ${naira(M.float)}`, sub: 'Withdrawals are paid from it', btn: 'BOX ▸', act() { VIEW = 'box'; refresh(); } },
      { name: `POS wallet · ${naira(M.wallet)}`, sub: 'The e-money from withdrawals (transfers and sends use it)', btn: 'WALLET ▸', act() { VIEW = 'wallet'; refresh(); } },
      { ...prices, name: 'Set your fees' },
      { name: 'Mama Nkechi, machines, network, name', sub: `${M.up.pos2 ? 'Two machines' : 'One machine'}${M.up.sim ? ' · two networks' : ''}`, btn: 'MORE ▸', act() { VIEW = 'grow'; refresh(); } },
      { name: 'Send money to a player', sub: 'No fee at your own POS', btn: 'SEND ▸', act() { askSend(); } }];
    if (b.kind === 'barber') {
      const fuelL = Math.min(R.fuel.litres, R.fuel.tank - M.fuel), fuelCost = Math.round(R.fuel.cost * fuelL / R.fuel.litres);
      return [till,
        { name: `Supplies for ${R.pack.n} cuts`, sub: `Blades, clipper oil, powder, aftershave · ${M.sup} cuts left`, btn: naira(R.pack.cost), off: cash < R.pack.cost || M.supCap - M.sup < R.pack.n, act() { send('supplies'); } },
        { name: `Fuel for the generator · ${fuelL > .4 ? fuelL.toFixed(1) : 0} L`, sub: `${(+M.fuel).toFixed(1)} L in the tank · ${M.light ? 'NEPA light dey now' : 'no light now: the gen is working'}`, btn: fuelL > .4 ? naira(fuelCost) : 'Full', off: fuelL <= .4 || cash < fuelCost, act() { send('fuel'); } },
        prices,
        { name: 'Barber Sunday, chairs, AC, name', sub: `${M.up.chair ? 'Two chairs' : 'One chair'}${M.up.ac ? ' · AC' : ''}`, btn: 'MORE ▸', act() { VIEW = 'grow'; refresh(); } }];
    }
    return [till,
      { name: 'Cook food', sub: `${keys.map(k => `${items[k].n.split(' ')[0]} ${M.st[k] | 0}`).join(' · ')}`, btn: 'COOK ▸', act() { VIEW = 'cook'; refresh(); } },
      prices,
      { name: 'Cook, pots, benches, name', sub: `Pots ${M.cap} plates · benches ${['few', 'more', 'plenty'][M.up.seat]}`, btn: 'MORE ▸', act() { VIEW = 'grow'; refresh(); } },
      { name: 'Eat a plate yourself', sub: 'Free: it is your food', btn: 'EAT', off: !keys.some(k => (M.st[k] | 0) > 0), act() { const k = keys.find(q => (M.st[q] | 0) > 0); if (k) send('use', { k }); } }];
  }
  const back = () => ({ name: '‹ Back', sub: '', btn: 'BACK', act() { VIEW = 'main'; refresh(); } });

  // ---- the Oya Farm phone app: sell your crops to buka owners (online)
  function farmApp(d) {
    if (!d || !d.sections || !api.farmHas()) return;
    const R = RK.buka, rows = [];
    if (!api.signedIn() || !R || !R.produce) { rows.push({ name: '🌐 Sell to buka owners (online)', sub: 'Sign in online: buka owners pay much more than the market for tomatoes, cassava and yams.' }); d.sections.push({ h: 'Online market', rows }); return; }
    const st = api.farmStore(), P = R.produce, lvlName = ['Cheap', 'Fair', 'Dear'][MKT.lvl];
    rows.push({ name: `Your price: ${lvlName}`, sub: Object.keys(P).map(c => `${c} ${naira(P[c].prices[MKT.lvl])}`).join(' · '), btn: 'CHANGE', act() { MKT.lvl = (MKT.lvl + 1) % 3; try { localStorage.setItem('naija-mkprice', String(MKT.lvl)); } catch (e) { /* ignore */ } } });
    for (const c of Object.keys(P)) {
      const have = st[c] | 0, n = Math.min(10, have), p = P[c].prices[MKT.lvl];
      rows.push({ name: `${EM[c]} ${P[c].n} · ${have} in your store`, sub: n ? `Sell ${n} to buka owners at ${naira(p)} each` : 'Harvest some first', btn: n ? `SELL ${n}` : 'SELL', off: !n || MKT.mine.length >= 5,
        act() { if (!api.farmTake(c, n)) return; if (!api.send({ t: 'mk', a: 'list', crop: c, n, p })) { api.farmPut(c, n); api.toast('Not connected right now. Try again small time.', 2.5); } } });
    }
    for (const l of MKT.mine) rows.push({ name: `On the market: ${l.q} ${P[l.c] ? P[l.c].n.toLowerCase() : l.c}`, sub: `${naira(l.p)} each · waiting for a buka owner`, btn: 'TAKE DOWN', act() { api.send({ t: 'mk', a: 'cancel', lid: l.id }); } });
    d.sections.push({ h: 'Online market (buka owners buy)', rows });
  }

  // ---- every frame: your presence at your own place keeps it open, people come and go, the boards light up at night
  let hereT = 0, pplT = 0, glowT = 0;
  function update(dt) {
    if (!ready) return;
    if (api.signedIn() && (hereT -= dt) <= 0) { hereT = 15; const p = api.player(); for (const b of Object.values(B)) if (mineB(b) && Math.hypot(p.x - b.x, p.z - b.z) < HERE_R && api.mode() === 'walk') api.send({ t: 'bz', a: 'here', id: b.id }); }
    if ((pplT -= dt) <= 0) { pplT = 2; for (const b of Object.values(B)) people(b); }
    if ((glowT -= dt) <= 0) { glowT = 1; const k = api.glow(); for (const b of Object.values(B)) if (b.sign) b.sign.material.emissiveIntensity = b.pub && b.pub.open ? .08 + k * .55 : k * .08; }
    if (CUR && !api.menuOpen()) CUR = null;
  }

  // sending money: who and how much
  function askSend() {
    const b = CUR; if (!b) return;
    askText('Send to which player? (username)', '', 16, to => { if (!to) return;
      askText(`How much for ${to}? (₦)`, '5000', 7, v => { const n = Math.round(+String(v || '').replace(/[^0-9]/g, '')); if (!n) return; CUR = b; send('send', { to, n }); }, 'numeric'); });
  }
  // a little box to type a name in (no browser pop-ups)
  function askText(label, val, max, cb, mode) {
    const wrap = document.createElement('div'); wrap.className = 'opanel'; wrap.style.zIndex = 60;
    const box = document.createElement('form'); box.className = 'obox'; box.style.display = 'flex'; box.style.flexDirection = 'column'; box.style.gap = '10px';
    const h = document.createElement('h2'); h.textContent = label.toUpperCase();
    const inp = document.createElement('input'); inp.maxLength = max; inp.value = val || ''; inp.autocomplete = 'off'; inp.spellcheck = false; if (mode) inp.inputMode = mode;
    const row = document.createElement('div'); row.style.display = 'flex'; row.style.gap = '8px';
    const ok = document.createElement('button'); ok.type = 'submit'; ok.className = 'ogo'; ok.textContent = 'SAVE'; ok.style.flex = '1';
    const no = document.createElement('button'); no.type = 'button'; no.className = 'ogo ghost'; no.textContent = 'CANCEL'; no.style.flex = '1'; no.style.marginTop = '0';
    row.append(ok, no); box.append(h, inp, row); wrap.append(box); document.body.append(wrap);
    const done = v => { wrap.remove(); api.typing(false); cb(v); };
    box.addEventListener('submit', e => { e.preventDefault(); done(inp.value.trim()); });
    no.addEventListener('click', () => done(null));
    box.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') done(null); });
    api.typing(true); setTimeout(() => { inp.focus(); inp.select(); }, 30);
  }

  build('buka'); build('barber'); build('pos');
  return { on, prompt, action, near: () => !!at(), update, signedOut, farmApp, sites: () => B, debug: () => Object.values(B).map(b => ({ id: b.id, kind: b.kind, x: b.x, z: b.z, pub: b.pub, mine: !!b.mine })) };
}
