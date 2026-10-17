/* ================= Businesses you own (online) =================
   The buka: eight of them stand by busy roads near the markets of Mushin. One that nobody owns has FOR SALE on its
   board; buy it (₦100,000, signed in) and your buka's name goes up on the board for every player to see. At the
   counter you cook pots of food, set your prices, hire Iya Basira to sell while you are away, make it bigger, and
   collect the till. Customers come by themselves (the server counts them, more at lunch, fewer at night, more when
   your food is cheaper); real players eat at your buka too, and their money is yours. Anybody can eat at an open
   buka: a plate fills you up (+40 health).
   Everything that matters (who owns what, the stock, the money) lives on the server (server/src/biz.js); this file
   draws the bukas, the boards, the cook and the customers, and runs the menus. The game passes in `api`. */

// where the eight bukas stand: clear ground by a big road, front to the road (five near home in Mushin, then Idi-Oro,
// Mushin Market, Ladipo and Computer Village). Found by a search over the map in the test browser.
export const SITES = {
  buka_1: { x: 265.98, z: -17.85, ry: -2.7309, near: 'Mushin' },
  buka_2: { x: -143.05, z: 206.92, ry: 1.4444, near: 'Mushin' },
  buka_3: { x: 82.11, z: -415.92, ry: 2.5985, near: 'Mushin' },
  buka_4: { x: -274.61, z: -379.09, ry: 0.441, near: 'Mushin' },
  buka_5: { x: 738.22, z: 11.62, ry: -1.9326, near: 'Idi-Oro Market' },
  buka_6: { x: 1043.05, z: 537.73, ry: 0.814, near: 'Mushin Market' },
  buka_7: { x: -1058.91, z: -1566.99, ry: -2.0166, near: 'Ladipo Market' },
  buka_8: { x: -4058.97, z: 935.85, ry: -3.0059, near: 'Computer Village' },
};
// the model's own spots (tools/blender_buka.py SPOTS), in the model's axes: x right, y up, z toward the road
const SPOT = { sign: { y: 2.56, z: 3.405, w: 3.44, h: .62 }, serve: { x: 0, z: .55 }, cook: { x: -.2, z: -1.15 },
  eat: [[-.9, 1.05, Math.PI], [.4, 1.05, Math.PI], [-.5, 2.45, 0], [.8, 2.45, 0], [1.85, 1.75, -Math.PI / 2]] };
const DISHES = ['jollof', 'amala', 'eba', 'iyan'];
const STEPS = [.7, .85, 1, 1.2, 1.5, 2];   // price choices, as shares of the usual price
const SERVE_R = 1.9, HERE_R = 14, EATERS = ['mama', 'baba', 'areaboy', 'hawker', 'lady_black', 'schoolboy', 'girl'];

export function createBusiness(api) {
  const { THREE, scene } = api;
  const naira = api.naira;
  const B = {};   // id -> {id, x, z, ry, pub, mine, sign, cv, tex, spots, cookSp}
  let RULES = null, ready = false, meshes = null;
  const W = (s, lx, lz) => { const c = Math.cos(s.ry), sn = Math.sin(s.ry); return { x: s.x + lx * c + lz * sn, z: s.z - lx * sn + lz * c }; };

  // ---- the eight bukas, their boards and their walls
  async function build() {
    let m = null; try { m = await api.glb('bk_buka'); } catch (e) { console.warn('buka model', e); return; }
    const levels = m.geo1 ? [{ geo: m.geo, mat: m.mat, dist: api.Q.lod0 * 1.1, shadow: true }, { geo: m.geo1, mat: m.mat1, dist: api.Q.draw * .9, shadow: false }] : [{ geo: m.geo, mat: m.mat, dist: api.Q.draw * .9, shadow: true }];
    const items = [];
    for (const [id, s] of Object.entries(SITES)) {
      if (!s.x && !s.z) continue;
      const y = api.groundY(s.x, s.z); s.y = y; items.push({ x: s.x, y, z: s.z, ry: s.ry, sc: 1 });
      const b = B[id] = { id, ...s, pub: null, spots: [], cookSp: null };
      // walls: the shed and its counter, the table, the benches, the canopy posts
      const box = (lx, lz, hx, hz, h) => { const w = W(s, lx, lz); api.addOB(w.x, w.z, hx, hz, -s.ry, h, y); };
      box(0, -1.53, 2.27, 1.53, 2.7); box(0, 1.75, 1.42, .4, .8); box(0, 1.08, 1.3, .16, .47); box(0, 2.42, 1.3, .16, .47);
      box(-2.1, 3.3, .08, .08, 2.3); box(2.1, 3.3, .08, .08, 2.3);
      // the board: the owner's name, painted in the game
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 184;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(SPOT.sign.w, SPOT.sign.h), new THREE.MeshStandardMaterial({ map: tex, roughness: .8, metalness: 0, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 }));
      const sp = W(s, 0, SPOT.sign.z); sign.position.set(sp.x, y + SPOT.sign.y, sp.z); sign.rotation.y = s.ry; sign.layers.set(1); scene.add(sign);
      Object.assign(b, { cv, tex, sign });
      paint(b);
      api.mapPlace({ name: 'Buka', sub: 'Food · a business you can buy (online)', kind: 'place', x: s.x, z: s.z, id });
    }
    if (items.length) new api.CullSet(levels, items, { shadowDist: api.Q.shR, name: 'buka' });
    meshes = m; ready = true;
  }

  // ---- the board
  function paint(b) {
    const g = b.cv.getContext('2d'), P = b.pub, Wc = b.cv.width, Hc = b.cv.height;
    const sale = !P || !P.o, name = sale ? 'BUKA FOR SALE' : (P.n || `${P.o}'s Buka`).toUpperCase();
    g.fillStyle = sale ? '#f4ecd8' : '#f7f0de'; g.fillRect(0, 0, Wc, Hc);
    g.strokeStyle = sale ? '#c0281e' : '#1d8a4e'; g.lineWidth = 14; g.strokeRect(7, 7, Wc - 14, Hc - 14);
    const F = 'Bungee, Impact, "Arial Black", sans-serif';
    let fs = 92; g.font = `${fs}px ${F}`; while (g.measureText(name).width > Wc - 90 && fs > 40) { fs -= 4; g.font = `${fs}px ${F}`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillText(name, Wc / 2 + 4, 72 + 4);
    g.fillStyle = sale ? '#c0281e' : '#1a3a8a'; g.fillText(name, Wc / 2, 72);
    g.font = `600 34px "Barlow Semi Condensed", Arial, sans-serif`; g.fillStyle = '#2a2622';
    const sub = sale ? `${naira(RULES ? RULES.price : 100000)} · sign in online and buy it` : 'RICE · AMALA · EBA · POUNDED YAM · COLD DRINKS';
    g.fillText(sub, Wc / 2, 146);
    if (!sale) { const open = !!P.open; g.fillStyle = open ? '#1d8a4e' : '#8a8a86'; rr(g, Wc - 210, 118, 170, 50, 12); g.fill(); g.fillStyle = '#fff'; g.font = `30px ${F}`; g.fillText(open ? 'OPEN' : 'CLOSED', Wc - 125, 145); }
    b.tex.needsUpdate = true;
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // ---- the people: Iya Basira behind the counter, customers at the table
  function people(b) {
    const P = b.pub, open = !!(P && P.open), near = Math.hypot(api.player().x - b.x, api.player().z - b.z) < 70;
    const wantCook = near && open, wantEat = near && open ? Math.min(SPOT.eat.length, 2 + (b.id.charCodeAt(5) % 3)) : 0;
    if (wantCook && !b.cookSp) { const w = W(b, SPOT.cook.x, SPOT.cook.z); b.cookSp = api.spot('mama', w.x, w.z, b.ry, ['idle_1', 'talk', 'idle_1']); }
    else if (!wantCook && b.cookSp) { api.unspot(b.cookSp); b.cookSp = null; }
    while (b.spots.length < wantEat) { const [lx, lz, r] = SPOT.eat[b.spots.length], w = W(b, lx, lz); b.spots.push(api.spot(EATERS[(b.spots.length * 3 + b.id.length) % EATERS.length], w.x, w.z, b.ry + r, ['talk', 'idle_1', 'text', 'idle_1'])); }
    while (b.spots.length > wantEat) api.unspot(b.spots.pop());
  }

  // ---- messages from the server
  function on(m) {
    if (m.t === 'bz') {
      if (m.rules) RULES = m.rules;
      for (const p of m.s) { const b = B[p.id]; if (!b) continue; b.pub = p; paint(b); people(b); }
      if (api.menuOpen() && CUR) refresh();
    } else if (m.t === 'bzd') { const b = B[m.b.id]; if (b) { b.mine = m.b; if (api.menuOpen() && CUR === b) refresh(); } }
    else if (m.t === 'bzate') { const D = RULES && RULES.dishes[m.k]; api.heal(40); api.toast(`You chop ${D ? D.n.toLowerCase() : 'food'}. Body don set! +40 health`, 3); }
    else if ((m.t === 'err' || m.t === 'ok') && m.w === 'bz') { api.toast(m.m, 3); if (api.menuOpen() && CUR) setTimeout(refresh, 50); }
  }
  function signedOut() { for (const b of Object.values(B)) { b.mine = null; } }

  // ---- at the counter
  function at() {
    if (!ready || api.mode() !== 'walk') return null; const p = api.player();
    for (const b of Object.values(B)) { const w = W(b, SPOT.serve.x, SPOT.serve.z); if (Math.hypot(p.x - w.x, p.z - w.z) < SERVE_R) return b; }
    return null;
  }
  let CUR = null, VIEW = 'main';
  const mineB = b => !!(b && b.pub && b.pub.o && api.myName() && b.pub.o.toLowerCase() === api.myName().toLowerCase());
  function prompt() {
    const b = at(); if (!b) return null; const P = b.pub;
    if (!api.signedIn()) return P && P.o ? `${P.n || 'Buka'} · sign in online to eat here` : 'Buka for sale · sign in online to buy it';
    if (!P || !P.o) return `Buy this buka · ${naira(RULES ? RULES.price : 100000)}`;
    if (mineB(b)) return `Your buka · ${P.n}`;
    return P.open ? `Eat at ${P.n}` : `${P.n} · closed now`;
  }
  function action() {
    const b = at(); if (!b) return false;
    if (!api.signedIn()) { api.openSignIn(); return true; }
    CUR = b; VIEW = 'main'; if (mineB(b)) api.send({ t: 'bz', a: 'mine', id: b.id }); open(); return true;
  }
  const send = (a, o = {}) => api.send({ t: 'bz', a, id: CUR.id, ...o });
  function open() { const t = title(); api.openMenu(t[0], t[1], rows); }
  function refresh() { if (!CUR) return; const t = title(); api.openMenu(t[0], t[1], rows); }
  function title() {
    const b = CUR, P = b.pub || {};
    if (!P.o) return ['BUKA FOR SALE', 'Own it: cook, set your prices, and customers pay you, even players'];
    if (!mineB(b)) return [(P.n || 'BUKA').toUpperCase(), P.open ? `${P.o}'s buka · open` : `${P.o}'s buka · closed now`];
    const M = b.mine; if (!M) return [(P.n || 'YOUR BUKA').toUpperCase(), 'Loading…'];
    const plates = DISHES.reduce((s, k) => s + (M.st[k] | 0), 0), cookH = M.cook > 0 ? Math.ceil(M.cook / 36e5) : 0;
    return [(M.n || 'YOUR BUKA').toUpperCase(), `${M.open ? 'Open' : 'Closed'} · ${plates}/${M.cap} plates in the pots · ${cookH ? `Iya Basira here ${cookH} h more` : 'no cook: open while you stand here'} · today ${M.today.sold} sold, ${naira(M.today.earned)}`];
  }
  function rows() {
    const b = CUR, P = b.pub || {}, R = RULES; if (!R) return [{ name: 'Connecting…', btn: '…', off: true, act() {} }];
    const cash = api.cash();
    if (!P.o) return [{ name: 'Buy this buka', sub: `You can own ${2} businesses. Sell it back any time for half.`, btn: naira(R.price), off: cash < R.price, act() { send('buy'); } }];
    if (!mineB(b)) return DISHES.map(k => { const [p, has] = (P.m && P.m[k]) || [R.dishes[k].p, 0]; return { name: R.dishes[k].n, sub: has ? 'Hot · +40 health' : 'Finished for now', btn: naira(p), off: !P.open || !has || cash < p, act() { send('eat', { k }); } }; });
    const M = b.mine; if (!M) return [{ name: 'Loading your buka…', btn: '…', off: true, act() {} }];
    if (VIEW === 'cook') return [back(), ...DISHES.map(k => { const room = M.cap - DISHES.reduce((s, q) => s + (M.st[q] | 0), 0), n = Math.min(10, room), cost = Math.round(n * R.dishes[k].p * R.cost);
      return { name: `Cook ${n || 10} plates of ${R.dishes[k].n}`, sub: `${M.st[k] | 0} in the pot now`, btn: n ? naira(cost) : 'Full', off: !n || cash < cost, act() { send('cook', { k, n }); } }; })];
    if (VIEW === 'price') return [back(), ...DISHES.map(k => { const base = R.dishes[k].p, cur = M.pr[k]; const i = STEPS.findIndex(s => Math.round(base * s / 50) * 50 >= cur); const nx = STEPS[(i + 1) % STEPS.length];
      return { name: R.dishes[k].n, sub: `usual ${naira(base)} · cheaper sells faster`, btn: `${naira(cur)} ▸`, act() { send('price', { k, p: Math.round(base * nx / 50) * 50 }); } }; })];
    if (VIEW === 'grow') return [back(),
      { name: 'Iya Basira the cook · 6 hours', sub: 'She sells for you while you are away', btn: naira(R.cook[6]), off: cash < R.cook[6], act() { send('hire', { h: 6 }); } },
      { name: 'Iya Basira the cook · 24 hours', sub: 'A whole day, cheaper', btn: naira(R.cook[24]), off: cash < R.cook[24], act() { send('hire', { h: 24 }); } },
      ...(M.up.cap + 1 < R.capUp.length ? [{ name: `Bigger pots · ${R.cap[M.up.cap + 1]} plates`, sub: 'Cook more at once, sell longer', btn: naira(R.capUp[M.up.cap + 1]), off: cash < R.capUp[M.up.cap + 1], act() { send('up', { w: 'cap' }); } }] : []),
      ...(M.up.seat + 1 < R.seatUp.length ? [{ name: 'More benches', sub: 'More customers at once', btn: naira(R.seatUp[M.up.seat + 1]), off: cash < R.seatUp[M.up.seat + 1], act() { send('up', { w: 'seat' }); } }] : []),
      { name: 'New name on the board', sub: M.n, btn: 'RENAME', act() { askText('Your buka’s name', M.n, 22, n => { if (n) send('name', { n }); }); } },
      { name: 'Sell the buka back', sub: 'Half of what you paid, and the till', btn: 'SELL', act() { VIEW = 'sell'; refresh(); } }];
    if (VIEW === 'sell') return [back(), { name: 'Yes, sell my buka', sub: 'Somebody else can buy it after', btn: 'SELL NOW', act() { VIEW = 'main'; CUR = CUR; send('sell'); } }];
    return [
      { name: `Collect the till · ${naira(M.till)}`, sub: 'The money your customers paid', btn: 'COLLECT', off: M.till <= 0, act() { send('take'); } },
      { name: 'Cook food', sub: `${DISHES.map(k => `${R.dishes[k].n.split(' ')[0]} ${M.st[k] | 0}`).join(' · ')}`, btn: 'COOK ▸', act() { VIEW = 'cook'; refresh(); } },
      { name: 'Set your prices', sub: DISHES.map(k => naira(M.pr[k])).join(' · '), btn: 'PRICES ▸', act() { VIEW = 'price'; refresh(); } },
      { name: 'Cook, pots, benches, name', sub: `Pots ${M.cap} plates · benches ${['few', 'more', 'plenty'][M.up.seat]}`, btn: 'MORE ▸', act() { VIEW = 'grow'; refresh(); } },
      { name: 'Eat a plate yourself', sub: 'Free: it is your food', btn: 'EAT', off: !DISHES.some(k => (M.st[k] | 0) > 0), act() { const k = DISHES.find(q => (M.st[q] | 0) > 0); if (k) send('eat', { k }); } },
    ];
  }
  const back = () => ({ name: '‹ Back', sub: '', btn: 'BACK', act() { VIEW = 'main'; refresh(); } });

  // ---- every frame: your presence at your own buka keeps it open, people come and go
  let hereT = 0, pplT = 0;
  function update(dt) {
    if (!ready) return;
    if (api.signedIn() && (hereT -= dt) <= 0) { hereT = 15; const p = api.player(); for (const b of Object.values(B)) if (mineB(b) && Math.hypot(p.x - b.x, p.z - b.z) < HERE_R && api.mode() === 'walk') api.send({ t: 'bz', a: 'here', id: b.id }); }
    if ((pplT -= dt) <= 0) { pplT = 2; for (const b of Object.values(B)) people(b); }
    if ((glowT -= dt) <= 0) { glowT = 1; glow(); }
    if (CUR && !api.menuOpen()) CUR = null;
  }
  let glowT = 0;
  function glow() { const k = api.glow(); for (const b of Object.values(B)) if (b.sign) b.sign.material.emissiveIntensity = b.pub && b.pub.open ? .08 + k * .55 : k * .08; }

  // a little box to type a name in (no browser pop-ups)
  function askText(label, val, max, cb) {
    const wrap = document.createElement('div'); wrap.className = 'opanel'; wrap.style.zIndex = 60;
    const box = document.createElement('form'); box.className = 'obox'; box.style.display = 'flex'; box.style.flexDirection = 'column'; box.style.gap = '10px';
    const h = document.createElement('h2'); h.textContent = label.toUpperCase();
    const inp = document.createElement('input'); inp.maxLength = max; inp.value = val || ''; inp.autocomplete = 'off'; inp.spellcheck = false;
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

  build();
  return { on, prompt, action, near: () => !!at(), update, signedOut, sites: () => B, debug: () => Object.values(B).map(b => ({ id: b.id, x: b.x, z: b.z, pub: b.pub, mine: !!b.mine })) };
}
