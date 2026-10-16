/* ================= the Farm Settlement =================
   North-east Mushin, down by the lagoon: farmland, palms, other people's fields, and YOUR farm.
   Any player can farm: talk to the farm officer at the settlement gate and collect the free starter farm
   (two crop beds, a cow, three hens, a store, a farmhouse). Farm Frenzy style, walking about in 3D:
     plant (maize, cassava, yam, tomato, pepper) -> water -> it grows (water again half way) -> harvest into the store;
     fill the trough and the cow gives milk; fill the feeder and the hens lay eggs; collect them into the store;
     sell: call Baba Sule's pickup (it really drives to the market and back; he keeps 15%), carry it to the market
     buyer yourself (full price), or sell to the middleman at the gate (60%).
   More land (up to 8 beds), more cows and hens, a bigger store, and a farmhand who works while you are away.
   Crops grow in real time (also while you are away), as long as they are watered; rain waters them for you.
   Saved on this phone ('naija-farm'). Made to grow: a garri mill, palm oil, goats, fish ponds, night thieves later.
   The game passes in `api` (its own functions); this file builds and runs the farm. Models: tools/blender_farm.py. */

const CROPS = {
  tomato: { n: 'Tomato', seed: 300, stage: 90, yield: 6, price: 250, unit: 'basket', em: '🍅' },
  pepper: { n: 'Pepper', seed: 300, stage: 120, yield: 6, price: 320, unit: 'basket', em: '🌶️' },
  maize: { n: 'Maize', seed: 400, stage: 150, yield: 8, price: 260, unit: 'bunch', em: '🌽' },
  cassava: { n: 'Cassava', seed: 500, stage: 240, yield: 6, price: 520, unit: 'bag', em: '🥔' },
  yam: { n: 'Yam', seed: 800, stage: 330, yield: 5, price: 950, unit: 'tuber', em: '🍠' },
};
const GOODS = { ...CROPS, milk: { n: 'Milk', price: 650, unit: 'jug', em: '🥛' }, egg: { n: 'Eggs', price: 110, unit: 'egg', em: '🥚' } };
const BED_PRICE = [0, 0, 3000, 5000, 8000, 12000, 18000, 25000];   // the first two beds come free
const STORE_UP = [[60, 10000], [100, 25000]];
const COW_PRICE = 35000, HEN_PRICE = 3000, MAX_COWS = 3, MAX_HENS = 12;
const MILK_S = 240, EGG_S = 150, FEED_COW = 600, FEED_HEN = 300, HAND_PAY = 2000, TRUCK_CAP = 40, CARRY_CAP = 12, DRIVER_CUT = .15, GATE_RATE = .6;
const DRIVER = 'Baba Sule';
const KEY = 'naija-farm';

export function createFarm(api) {
  const THREE = api.THREE, scene = api.scene, F = api.zone, YC = F.yard;
  const now = () => Date.now();
  const S = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })();
  S.v = 1; S.got = !!S.got; S.beds = S.beds || []; S.open = S.open || 2; S.store = S.store || {}; S.cap = S.cap || 30;
  S.cows = S.cows || [{ milk: 0, at: now() }]; S.hens = S.hens || [{ at: now() }, { at: now() + 50000 }, { at: now() + 100000 }];
  S.trough = S.trough ?? 3; S.feeder = S.feeder ?? 6; S.eggs = S.eggs || 0; S.carry = S.carry || null; S.hand = S.hand || 0; S.trip = S.trip || null; S.earned = S.earned || 0;
  while (S.beds.length < 8) S.beds.push({ crop: null });
  let saveT = 0; const save = () => { saveT = 1; };
  const flush = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };

  const naira = api.naira;
  const stored = () => Object.values(S.store).reduce((a, b) => a + b, 0);
  const day = () => api.day();
  const hash = (a, b) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };
  const price = k => Math.round(GOODS[k].price * (.8 + .45 * hash(day(), Object.keys(GOODS).indexOf(k) + 1)) / 10) * 10;
  const valueOf = load => Object.entries(load).reduce((a, [k, n]) => a + price(k) * n, 0);
  const fmtT = s => { s = Math.max(0, Math.ceil(s)); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`; };
  const list = load => Object.entries(load).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${GOODS[k].n.toLowerCase()}`).join(', ');

  // ---------------------------------------------------------------- where everything is
  const K = api.kerbPoint(YC.x, YC.z);                                   // the road the farm faces
  const ry = Math.atan2(K.x - YC.x, K.z - YC.z);                        // the yard's front looks at the road
  const Fx = Math.sin(ry), Fz = Math.cos(ry), Rx = Math.cos(ry), Rz = -Math.sin(ry);
  const W = (u, v) => ({ x: YC.x + Rx * u + Fx * v, z: YC.z + Rz * u + Fz * v });   // yard local (u right, v toward the road) -> world
  const L = (x, z) => { const dx = x - YC.x, dz = z - YC.z; return { u: dx * Rx + dz * Rz, v: dx * Fx + dz * Fz }; };
  const YARD = { u: 22, v: 16 };
  const BEDS = []; for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) BEDS.push({ u: -6.9 + c * 4.6, v: 1.2 - r * 4.8 });
  const BARN = { u: -13, v: -10 }, HOUSE = { u: 13, v: -10 }, TANK = { u: 4, v: -12.5 }, PEN = { u: -15, v: 5 }, COOP = { u: 16, v: 4.5 }, TOOLS = { u: -6.5, v: -12.5 }, CROW = { u: 0, v: -1.2 };
  const GATE_V = YARD.v;
  // the settlement gate where the driveway leaves the road, and the farm office beside it
  const kd = Math.hypot(K.x - YC.x, K.z - YC.z);
  const hwR = api.roadHalf(K.x, K.z), SG = W(0, kd - hwR - 2.2), OFFICE = W(-10, kd - hwR - 11.5), OFFICE_RY = ry;
  const MARKET = api.market();

  // ---------------------------------------------------------------- models
  const M = {}; let ready = false, loading = false, built = false;
  const STATIC = ['barn', 'house', 'coop', 'pen', 'tank', 'office', 'gate', 'fence', 'bed', 'bed_wet', 'palm', 'plantain', 'grass', 'scarecrow', 'tools', 'produce',
    ...Object.keys(CROPS).flatMap(c => [1, 2, 3].map(s => c + '_' + s))];
  async function load() {
    if (loading) return; loading = true;
    try {
      const jobs = STATIC.map(n => api.glb('fm_' + n).then(m => { M[n] = m; }).catch(e => console.warn('farm model', n, e)));
      jobs.push(api.skinned('fm_cow').then(g => { M.cow = g; }).catch(e => console.warn('cow', e)));
      jobs.push(api.skinned('fm_hen').then(g => { M.hen = g; }).catch(e => console.warn('hen', e)));
      jobs.push(api.registerTruck().catch(e => console.warn('truck', e)));
      await Promise.all(jobs); ready = true; build();
    } catch (e) { console.warn('farm', e); }
  }

  // ---------------------------------------------------------------- building it
  const dyn = [];   // meshes that change (beds, crops), with their own near/far detail
  function mesh(name, x, z, rot = 0, y = 0, parent = scene) {
    const m = M[name]; if (!m) return null; const o = new THREE.Mesh(m.geo, m.mat); o.position.set(x, y, z); o.rotation.y = rot; o.castShadow = true; o.receiveShadow = true;
    o.userData.lod = name; o.layers.set(1); parent.add(o); dyn.push(o); return o;
  }
  function setGeo(o, name) { if (!o) return; const m = M[name]; if (!m) { o.visible = false; return; } o.userData.lod = name; o.visible = true; o.geometry = (o.userData.far && m.geo1) ? m.geo1 : m.geo; o.material = (o.userData.far && m.mat1) ? m.mat1 : m.mat; }
  function sets(name, items, near = .55, far = .9) {   // many copies of one model: drawn as one batch, nearer ones in full detail
    const m = M[name]; if (!m || !items.length) return;
    const levels = m.geo1 ? [{ geo: m.geo, mat: m.mat, dist: api.Q.lod0 * near, shadow: true }, { geo: m.geo1, mat: m.mat1, dist: api.Q.draw * far, shadow: false }] : [{ geo: m.geo, mat: m.mat, dist: api.Q.draw * far, shadow: true }];
    new api.CullSet(levels, items.map(i => ({ x: i.x, y: 0, z: i.z, ry: i.ry || 0, sc: i.sc || 1 })), { shadowDist: api.Q.shR, name: 'farm_' + name });
  }
  function label(text, sub, w, h, x, y, z, rot, both = true, bg = '#f4ead0', fg = '#173d22') {
    const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * h / w); const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = Math.round(c.height * (sub ? .46 : .6)); g.font = `900 ${fs}px Impact, 'Arial Black', sans-serif`; while (g.measureText(text).width > c.width * .92 && fs > 10) { fs -= 4; g.font = `900 ${fs}px Impact, 'Arial Black', sans-serif`; }
    g.fillText(text, c.width / 2, c.height * (sub ? .4 : .5));
    if (sub) { g.font = `700 ${Math.round(c.height * .2)}px Arial, sans-serif`; g.fillStyle = '#8a2a1a'; g.fillText(sub, c.width / 2, c.height * .8); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: t, side: both ? THREE.DoubleSide : THREE.FrontSide, toneMapped: false });
    const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); o.position.set(x, y, z); o.rotation.y = rot; o.layers.set(1); scene.add(o); return o;
  }
  const yardRot = ry;   // models face +Z; turned by ry they face the road
  const beds = [];      // per bed: {base, crop, lock}
  let cows = [], hens = [], penC, coopC, sign;

  function build() {
    if (built || !ready) return; built = true;
    const put = (n, p, rot = yardRot) => { const w = W(p.u, p.v); return mesh(n, w.x, w.z, rot); };
    // the yard: buildings, pen, coop, tank, tools, scarecrow
    for (const [n, p] of [['barn', BARN], ['house', HOUSE], ['tank', TANK], ['pen', PEN], ['coop', COOP], ['tools', TOOLS], ['scarecrow', CROW]]) put(n, p);
    const ob = (p, hu, hv, h, dv = 0) => { const w = W(p.u, p.v + dv); api.addOB(w.x, w.z, hu, hv, -yardRot, h); };
    ob(BARN, 4.1, 3.1, 4.5); ob(HOUSE, 3.6, 2.6, 4); ob(TANK, 1.0, 1.0, 4.2); ob(COOP, 1.25, .95, 2.4, -1.6); ob(TOOLS, 1.2, .8, 1);
    // the pen and the coop run: thin walls, a way in at the front
    const wall = (p, u0, v0, u1, v1) => { const a = W(p.u + u0, p.v + v0), b = W(p.u + u1, p.v + v1), cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, len = Math.hypot(b.x - a.x, b.z - a.z); api.addOB(cx, cz, len / 2, .12, Math.atan2(b.z - a.z, b.x - a.x), 1.4); };
    wall(PEN, -5, 3.5, -1.1, 3.5); wall(PEN, 1.1, 3.5, 5, 3.5); wall(PEN, -5, -3.5, 5, -3.5); wall(PEN, -5, -3.5, -5, 3.5); wall(PEN, 5, -3.5, 5, 3.5);
    wall(COOP, -2, 1.6, -.6, 1.6); wall(COOP, .6, 1.6, 2, 1.6); wall(COOP, -2, 1.6, -2, -.7); wall(COOP, 2, 1.6, 2, -.7);
    // the yard fence with the gate in front
    const fen = []; const fpush = (u, v, rot) => { const w = W(u, v); fen.push({ x: w.x, z: w.z, ry: rot }); };
    for (let u = -YARD.u + 2; u <= YARD.u - 2 + .01; u += 4) { if (Math.abs(u) > 3.5) fpush(u, GATE_V, yardRot); fpush(u, -YARD.v, yardRot); }
    for (let v = -YARD.v + 2; v <= YARD.v - 2 + .01; v += 4) { fpush(-YARD.u, v, yardRot + Math.PI / 2); fpush(YARD.u, v, yardRot + Math.PI / 2); }
    sets('fence', fen, .6, .7);
    for (const f of fen) api.addOB(f.x, f.z, 2.05, .1, -f.ry, 1.2);
    put('gate', { u: 0, v: GATE_V + .3 });
    { const w = W(0, GATE_V + .3 + .18); sign = label(farmName(), 'OYA FARM', 3.6, .82, w.x, 3.35, w.z, yardRot); }
    // the driveway: a laterite strip from the yard gate to the road
    { const a = W(0, GATE_V - 1), b = { x: K.x, z: K.z }, len = Math.hypot(b.x - a.x, b.z - a.z) + 2, g = new THREE.PlaneGeometry(4.2, len); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, api.dirtMat); m.position.set((a.x + b.x) / 2, .028, (a.z + b.z) / 2); m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); m.receiveShadow = true; scene.add(m);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const u0 = uv.getX(i), v0 = uv.getY(i); uv.setXY(i, v0 * len / 9, u0); } }   // like the dirt roads: along the length, grassy at the sides
    // the beds
    BEDS.forEach((p, i) => { const w = W(p.u, p.v), b = { i, base: mesh('bed', w.x, w.z, yardRot, 0), crop: mesh('maize_1', w.x, w.z, yardRot, 0), lock: null };
      if (b.crop) b.crop.visible = false; beds.push(b); });
    // the settlement gate, the office, the officer
    mesh('gate', SG.x, SG.z, ry); label('OYA FARM SETTLEMENT', 'MUSHIN · FARMERS WELCOME', 3.6, .82, SG.x + Fx * .18, 3.35, SG.z + Fz * .18, ry);
    mesh('office', OFFICE.x, OFFICE.z, OFFICE_RY); api.addOB(OFFICE.x, OFFICE.z, 1.8, 1.4, -OFFICE_RY, 3);
    { const o = W(-10, kd - hwR - 11.5 + 2.3); api.spot('baba', o.x, o.z, ry, ['talk', 'idle_baba', 'phone']); }
    // the market buyer in town
    if (MARKET) { mesh('produce', MARKET.x, MARKET.z, MARKET.ry || 0); label('FARM PRODUCE BUYER', 'WE BUY FROM FARMERS', 2.4, .55, MARKET.x, 2.2, MARKET.z, (MARKET.ry || 0), true, '#ffe9a8', '#5a2a0a');
      api.spot('mama', MARKET.x + Math.sin((MARKET.ry || 0) + 1.6) * 1.4, MARKET.z + Math.cos((MARKET.ry || 0) + 1.6) * 1.4, MARKET.ry || 0, ['talk', 'argue', 'idle_2']); }
    scenery();
    animals(); refresh();
  }
  const farmName = () => { const n = (api.playerName() || '').trim(); return n ? (n.toUpperCase() + "'S FARM").slice(0, 22) : 'YOUR FARM'; };

  // ---- other people's farms all over the settlement: fields, palms, plantain, elephant grass, a few homesteads
  function scenery() {
    const R = (i => () => { i = (i * 16807) % 2147483647; return i / 2147483647; })(7919);
    const items = {}; const add = (k, x, z, rot = 0, sc = 1) => (items[k] || (items[k] = [])).push({ x, z, ry: rot, sc });
    const yardR = Math.hypot(YARD.u, YARD.v) + 6;
    const clear = (x, z, pad) => { if (!api.inZone(x, z, -8)) return false; if (Math.hypot(x - YC.x, z - YC.z) < yardR + pad) return false;
      const l = L(x, z); if (l.v > 0 && Math.abs(l.u) < 10 + pad && l.v < kd + 6) return false;   // the driveway, gate and office
      return api.roadClear(x, z, pad); };
    const crops = Object.keys(CROPS);
    const homes = [];
    for (let gx = F.cx - F.rx; gx < F.cx + F.rx; gx += 13) for (let gz = F.cz - F.rz; gz < F.cz + F.rz; gz += 11) {
      const x = gx + (R() - .5) * 4, z = gz + (R() - .5) * 4, t = R();
      if (t < .5) { if (!clear(x, z, 6)) continue;   // a field of four beds, one crop
        const a = api.roadAngle(x, z), c = crops[Math.floor(R() * crops.length)], st = R() < .15 ? 1 : R() < .35 ? 2 : 3;
        for (const [du, dv] of [[-2.3, -1.9], [2.3, -1.9], [-2.3, 1.9], [2.3, 1.9]]) { const px = x + Math.cos(a) * du + Math.sin(a) * dv, pz = z - Math.sin(a) * du + Math.cos(a) * dv; add('bed', px, pz, a); add(c + '_' + st, px, pz, a); }
        if (R() < .25) add('scarecrow', x, z, a + R() * 6); }
      else if (t < .62) { if (clear(x, z, 3)) { add('palm', x, z, R() * 6, .85 + R() * .35); if (R() < .5 && clear(x + 3, z + 2, 3)) add('palm', x + 3, z + 2, R() * 6, .8 + R() * .3); } }
      else if (t < .74) { if (clear(x, z, 3)) for (let k = 0; k < 3; k++) add('plantain', x + (R() - .5) * 4, z + (R() - .5) * 4, R() * 6, .9 + R() * .3); }
      else if (t < .9) { if (clear(x, z, 2)) for (let k = 0; k < 4; k++) add('grass', x + (R() - .5) * 6, z + (R() - .5) * 6, R() * 6, .8 + R() * .5); }
      else if (t < .95 && homes.length < 6) { if (clear(x, z, 12)) homes.push({ x, z }); }
    }
    for (const h of homes) { const a = api.roadAngle(h.x, h.z); add('house', h.x, h.z, a); api.addOB(h.x, h.z, 3.6, 2.6, -a, 4);
      const bx = h.x + Math.cos(a) * 9, bz = h.z - Math.sin(a) * 9; add('barn', bx, bz, a); api.addOB(bx, bz, 4.1, 3.1, -a, 4.5);
      add('tank', h.x - Math.cos(a) * 6, h.z + Math.sin(a) * 6, a); add('plantain', h.x - Math.sin(a) * 6, h.z - Math.cos(a) * 6, 0); }
    // farmers working out there
    let n = 0; for (const h of homes) { if (n++ > 3) break; api.spot(n % 2 ? 'mama' : 'baba', h.x - Math.sin(.3) * 5, h.z - Math.cos(.3) * 5, R() * 6, ['idle_2', 'talk', 'phone']); }
    // round the yard: palms, plantain, grass
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, d = yardR + 2 + R() * 5, x = YC.x + Math.cos(a) * d, z = YC.z + Math.sin(a) * d; if (api.roadClear(x, z, 2)) add(i % 3 ? 'palm' : 'plantain', x, z, R() * 6, .9 + R() * .3); }
    for (const [k, list] of Object.entries(items)) sets(k, list, k === 'bed' || k.includes('_') ? .5 : .6, k === 'grass' ? .5 : k.includes('_') ? .7 : .95);
    api.mapPlace({ name: 'Farm Settlement', sub: 'Farms · get your free farm here', kind: 'place', x: SG.x, z: SG.z });
  }

  // ---- the animals: skinned, each with its own moves
  function makeAnimal(g, sc = 1) {
    const root = api.clone(g.scene); root.scale.setScalar(sc); root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.layers.set(1); if (o.material) o.material.side = THREE.DoubleSide; } });
    scene.add(root); const mix = new THREE.AnimationMixer(root), acts = {};
    for (const c of g.animations) acts[c.name] = mix.clipAction(c);
    return { root, mix, acts, cur: null, x: 0, z: 0, h: 0, tx: 0, tz: 0, t: 0, mode: 'idle' };
  }
  function play(a, name, fade = .35) { if (a.cur === name || !a.acts[name]) return; const n = a.acts[name]; n.reset().setEffectiveWeight(1).fadeIn(fade).play(); if (a.cur && a.acts[a.cur]) a.acts[a.cur].fadeOut(fade); a.cur = name; }
  function animals() {
    for (const a of cows) scene.remove(a.root); for (const a of hens) scene.remove(a.root); cows = []; hens = [];
    if (!S.got) return;
    if (M.cow) S.cows.forEach((c, i) => { const a = makeAnimal(M.cow); const p = W(PEN.u - 2 + i * 2.2, PEN.v + .5 - i); Object.assign(a, { x: p.x, z: p.z, h: yardRot + i, kind: 'cow', t: Math.random() * 3 }); cows.push(a); play(a, 'Graze'); });
    if (M.hen) S.hens.forEach((c, i) => { const a = makeAnimal(M.hen, 1.15); const p = W(COOP.u - 1.2 + (i % 4) * .8, COOP.v + .6 + Math.floor(i / 4) * .3); Object.assign(a, { x: p.x, z: p.z, h: Math.random() * 6, kind: 'hen', t: Math.random() * 2 }); hens.push(a); play(a, 'Idle'); });
  }
  function wander(a, dt, box, spd, near) {
    a.t -= dt;
    if (a.t <= 0) {
      if (a.mode === 'walk' || Math.random() < .45) { a.mode = a.kind === 'cow' ? (Math.random() < .6 ? 'graze' : 'idle') : (Math.random() < .55 ? 'peck' : 'idle'); a.t = a.kind === 'cow' ? 4 + Math.random() * 8 : 1.5 + Math.random() * 3; }
      else { const p = W(box.u + (Math.random() * 2 - 1) * box.hu, box.v + (Math.random() * 2 - 1) * box.hv); a.tx = p.x; a.tz = p.z; a.mode = 'walk'; a.t = 12; }
    }
    if (a.mode === 'walk') { const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
      if (d < .15) { a.t = 0; } else { const want = Math.atan2(dx, dz); let dh = want - a.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); a.h += Math.sign(dh) * Math.min(Math.abs(dh), dt * (a.kind === 'cow' ? 1.2 : 5));
        if (Math.abs(dh) < .6) { const s = Math.min(d, spd * dt); a.x += Math.sin(a.h) * s; a.z += Math.cos(a.h) * s; } }
      play(a, 'Walk'); }
    else play(a, a.mode === 'graze' ? 'Graze' : a.mode === 'peck' ? 'Peck' : 'Idle');
    a.root.position.set(a.x, 0, a.z); a.root.rotation.y = a.h;
    if (near) a.mix.update(dt);
  }

  // ---------------------------------------------------------------- the state of things
  function bedState(i) { const b = S.beds[i]; if (i >= S.open) return 'locked'; if (!b.crop) return 'empty'; if (b.stage >= 3) return 'ready'; return b.wet ? 'growing' : 'dry'; }
  function tickBeds() {
    const t = now(), rain = api.rain() > .3;
    S.beds.forEach((b, i) => { if (!b.crop || b.stage >= 3 || i >= S.open) return;
      if (!b.wet && rain) { b.wet = true; b.until = t + CROPS[b.crop].stage * 1000; save(); }
      if (b.wet && t >= b.until) { b.stage++; b.wet = false; save(); if (b.stage >= 3) { notify(`${CROPS[b.crop].em} Your ${CROPS[b.crop].n.toLowerCase()} don ready! Harvest am.`); } } });
  }
  function tickAnimals() {
    const t = now();
    for (const c of S.cows) { if (c.milk) continue; if (S.trough <= 0) { c.at = t; continue; } if (t - c.at >= MILK_S * 1000) { c.milk = 1; c.at = t; S.trough--; save(); } }
    for (const h of S.hens) { if (S.eggs >= S.hens.length * 2) { h.at = t; continue; } if (S.feeder <= 0) { h.at = t; continue; } if (t - h.at >= EGG_S * 1000) { S.eggs++; h.at = t; S.feeder--; save(); } }
  }
  const milkReady = () => S.cows.reduce((a, c) => a + (c.milk || 0), 0);
  function room(n) { return S.cap - stored() >= n; }
  function put(k, n) { S.store[k] = (S.store[k] || 0) + n; save(); }

  // ---- what you can do
  function plant(i, k) { const C = CROPS[k]; if (api.cash() < C.seed) { api.toast(`You need ${naira(C.seed)} for ${C.n.toLowerCase()} seeds.`); return false; }
    api.addCash(-C.seed); Object.assign(S.beds[i], { crop: k, stage: 1, wet: false, until: 0, t0: now() }); save(); refresh();
    api.toast(`${C.em} You planted ${C.n.toLowerCase()}. Now water am!`, 2.4); api.guide('farm_water'); return true; }
  function water(i) { const b = S.beds[i]; if (!b.crop || b.wet || b.stage >= 3) return; b.wet = true; b.until = now() + CROPS[b.crop].stage * 1000; save(); refresh(); api.splash && api.splash(); api.toast(`💧 Watered. ${CROPS[b.crop].n} go grow small small (${fmtT(CROPS[b.crop].stage)}).`, 2.2); }
  function harvest(i) { const b = S.beds[i], C = CROPS[b.crop]; if (!room(C.yield)) { api.toast(`Your store is full (${stored()}/${S.cap}). Sell something first.`, 2.6); return; }
    put(b.crop, C.yield); api.toast(`${C.em} You harvested ${C.yield} ${C.n.toLowerCase()}! It's in your store.`, 2.6); Object.assign(b, { crop: null, stage: 0, wet: false }); save(); refresh(); api.gist('harvest', { what: C.n.toLowerCase() }); }
  function buyBed(i) { const p = BED_PRICE[i]; if (api.cash() < p) { api.toast(`This land costs ${naira(p)}. Make more money first.`); return; } api.addCash(-p); S.open = i + 1; save(); refresh(); api.toast('🚜 The land is yours! Plant something.', 2.4); }
  function milk() { const n = milkReady(); if (!n) return; if (!room(n)) { api.toast('Your store is full. Sell something first.'); return; } for (const c of S.cows) c.milk = 0; put('milk', n); api.toast(`🥛 You milked ${n} jug${n > 1 ? 's' : ''} of fresh milk.`, 2.2); refresh(); }
  function eggs() { const n = S.eggs; if (!n) return; if (!room(n)) { api.toast('Your store is full. Sell something first.'); return; } S.eggs = 0; put('egg', n); api.toast(`🥚 You collected ${n} egg${n > 1 ? 's' : ''}.`, 2.2); refresh(); }
  function feedCow(useMaize) { if (S.trough >= 6) { api.toast('The trough is full.'); return; }
    if (useMaize) { if ((S.store.maize || 0) < 2) { api.toast('You need 2 maize in your store.'); return; } S.store.maize -= 2; } else { if (api.cash() < FEED_COW) { api.toast(`Cow feed costs ${naira(FEED_COW)}.`); return; } api.addCash(-FEED_COW); }
    S.trough = Math.min(6, S.trough + 3); save(); api.toast('🐄 The trough is full of feed. Your cow go give milk.', 2.2); }
  function feedHens(useMaize) { if (S.feeder >= 12) { api.toast('The feeder is full.'); return; }
    if (useMaize) { if ((S.store.maize || 0) < 1) { api.toast('You need 1 maize in your store.'); return; } S.store.maize -= 1; } else { if (api.cash() < FEED_HEN) { api.toast(`Chicken feed costs ${naira(FEED_HEN)}.`); return; } api.addCash(-FEED_HEN); }
    S.feeder = Math.min(12, S.feeder + 4); save(); api.toast('🐔 The feeder is full. Your hens go lay.', 2.2); }
  function buyCow() { if (S.cows.length >= MAX_COWS) return; if (api.cash() < COW_PRICE) { api.toast(`A cow costs ${naira(COW_PRICE)}.`); return; } api.addCash(-COW_PRICE); S.cows.push({ milk: 0, at: now() }); save(); animals(); api.toast('🐄 Your new cow don land!', 2.2); }
  function buyHen() { if (S.hens.length >= MAX_HENS) return; if (api.cash() < HEN_PRICE) { api.toast(`A hen costs ${naira(HEN_PRICE)}.`); return; } api.addCash(-HEN_PRICE); S.hens.push({ at: now() }); save(); animals(); api.toast('🐔 New hen for your coop!', 2.2); }
  function bigger() { const up = STORE_UP.find(([c]) => c > S.cap); if (!up) return; if (api.cash() < up[1]) { api.toast(`That costs ${naira(up[1])}.`); return; } api.addCash(-up[1]); S.cap = up[0]; save(); api.toast(`Your store now holds ${S.cap}.`, 2.2); }
  function claim() { if (S.got) return; S.got = true; Object.assign(S, { open: 2, trough: 3, feeder: 6, cows: [{ milk: 0, at: now() }], hens: [{ at: now() }, { at: now() + 50000 }, { at: now() + 100000 }] }); save(); flush(); animals(); refresh();
    api.toast('🚜 Welcome, farmer! The farm behind this gate is yours: land, a cow and three hens.', 4); api.gist('farm', { place: 'Farm Settlement' }); api.guide('farm_yard'); }
  function sellGate() { const load = { ...S.store }, v = Math.round(valueOf(load) * GATE_RATE); if (!v) { api.toast('Your store is empty.'); return; } S.store = {}; save(); api.addCash(v); S.earned += v; api.toast(`The middleman paid ${naira(v)} for ${list(load)}. (Cheap, but quick.)`, 3.2); }
  function takeCarry() { if (S.carry) { api.toast('You are already carrying goods. Sell them at the market first.'); return; } if (!stored()) { api.toast('Your store is empty.'); return; }
    const load = {}; let n = 0; for (const k of Object.keys(S.store)) { const t = Math.min(S.store[k], CARRY_CAP - n); if (t > 0) { load[k] = t; S.store[k] -= t; n += t; } }
    S.carry = load; save(); if (MARKET) api.gps(MARKET.x, MARKET.z, { name: 'Farm produce buyer', sub: MARKET.name || 'Market' });
    api.toast(`🧺 You carry ${list(load)}. Take am to the produce buyer at ${MARKET ? MARKET.name || 'the market' : 'the market'} (GPS on).`, 3.4); hud(); }
  function sellCarry() { const load = S.carry; if (!load) return; const v = valueOf(load); S.carry = null; save(); api.addCash(v); S.earned += v; hud(); api.clearGps && api.clearGps();
    api.toast(`🧺 The buyer paid you ${naira(v)} for ${list(load)}. Full price!`, 3); api.gist('market', { place: MARKET && MARKET.name || 'the market' }); }
  function hireHand() { if (handOn()) { api.toast('Your farmhand is already working.'); return; } if (api.cash() < HAND_PAY) { api.toast(`A farmhand costs ${naira(HAND_PAY)} a day.`); return; }
    api.addCash(-HAND_PAY); S.hand = now() + api.dayMs(); save(); handSpot(); api.toast('👨🏾‍🌾 Musa the farmhand starts work: he waters, harvests, milks and collects eggs till tomorrow.', 3.4); }
  const handOn = () => S.hand > now();
  let handSp = null; function handSpot() { if (handSp || !built) return; if (!handOn()) return; const p = W(0, 5.5); handSp = api.spot('areaboy', p.x, p.z, yardRot + Math.PI, ['idle_1', 'phone', 'talk']); }
  let handT = 0;
  function tickHand(dt) { if (!handOn()) { if (handSp) { api.unspot(handSp); handSp = null; } return; } handSpot(); if ((handT -= dt) > 0) return; handT = 8;
    for (let i = 0; i < S.open; i++) { const st = bedState(i); if (st === 'dry') { water(i); return; } if (st === 'ready' && room(CROPS[S.beds[i].crop].yield)) { harvest(i); return; } }
    if (milkReady() && room(milkReady())) { milk(); return; } if (S.eggs && room(S.eggs)) { eggs(); return; }
    if (S.trough <= 1) { if ((S.store.maize || 0) >= 2) feedCow(true); else if (api.cash() > FEED_COW * 3) feedCow(false); }
    if (S.feeder <= 2) { if ((S.store.maize || 0) >= 1) feedHens(true); else if (api.cash() > FEED_HEN * 3) feedHens(false); } }

  // ---- Baba Sule's pickup: drives to the farm, loads, drives to the market, sells, comes back with your money
  let truck = null;
  function callTruck() {
    if (S.trip) { api.toast(`${DRIVER} is already on a trip.`); return; } if (!stored()) { api.toast('Your store is empty. Harvest something first.'); return; }
    if (!api.truckReady()) { api.toast(`${DRIVER} no fit come now. Try again small time.`); return; }
    const v = api.newTruck(K); if (!v) { api.toast(`${DRIVER} no fit find road to your farm now. Try again.`); return; }
    truck = v; S.trip = { phase: 'coming', t: now(), load: null }; save();
    api.toast(`📞 ${DRIVER}: "I dey come with my pickup. Make sure your goods dey ready!"`, 3); api.sms(`${DRIVER} (pickup)`, `I dey come to your farm now now. I go carry your goods go market, sell am, bring your money. I take ${Math.round(DRIVER_CUT * 100)}% for transport.`);
  }
  function tickTruck(dt) {
    const T = S.trip; if (!T) return;
    const el = (now() - T.t) / 1000, v = truck;
    if (!v || !api.truckAlive(v)) {   // after a reload, or the pickup is gone: the trip finishes on time without it
      if (T.phase === 'coming' || T.phase === 'loading') { if (el > 20) { T.load = T.load || loadTruck(); T.phase = 'away'; T.t = now(); save(); } return; }
      if (el > 90) finishTrip(); return; }
    if (api.stolen(v)) { api.toast(`${DRIVER}: "Ole! Thief! Bring my pickup back!" The trip is off.`, 3); if (T.load) for (const [k, n] of Object.entries(T.load)) put(k, n); S.trip = null; save(); truck = null; return; }
    const arrived = api.truckAt(v);
    if (T.phase === 'coming') { if (arrived || (el > 150 && api.far(v))) { if (!arrived) api.truckTo(v, K, true); T.phase = 'loading'; T.t = now(); api.truckWait(v, 9); api.toast(`🚚 ${DRIVER} don reach your gate. He dey load your goods.`, 2.6); } }
    else if (T.phase === 'loading') { if (el > 8) { T.load = loadTruck(); if (!T.load) { api.toast(`${DRIVER}: "Your store empty o! I dey go."`); api.releaseTruck(v); S.trip = null; truck = null; save(); return; }
        T.phase = 'going'; T.t = now(); save(); api.truckGo(v, MARKET); api.toast(`🚚 ${DRIVER} loaded ${list(T.load)}. He dey go ${MARKET && MARKET.name || 'market'}.`, 3); } }
    else if (T.phase === 'going') { if (arrived || (el > 200 && api.far(v))) { if (!arrived) api.truckTo(v, MARKET, true); T.phase = 'selling'; T.t = now(); api.truckWait(v, 22); } }
    else if (T.phase === 'selling') { if (el > 20) { T.phase = 'returning'; T.t = now(); save(); api.truckGo(v, K); api.sms(`${DRIVER} (pickup)`, `I don sell everything for ${MARKET && MARKET.name || 'market'}: ${naira(valueOf(T.load))}. I dey come back with your money.`); } }
    else if (T.phase === 'returning') { if (arrived || (el > 200 && api.far(v))) finishTrip(); }
    else if (T.phase === 'away') { if (el > 90) finishTrip(); }
  }
  function loadTruck() { if (!stored()) return null; const load = {}; let n = 0; for (const k of Object.keys(S.store)) { const t = Math.min(S.store[k], TRUCK_CAP - n); if (t > 0) { load[k] = t; S.store[k] -= t; n += t; } } save(); return load; }
  function finishTrip() { const T = S.trip; if (!T) return; const gross = valueOf(T.load || {}), cut = Math.round(Math.min(gross * .5, Math.max(300, gross * DRIVER_CUT)) / 10) * 10, net = Math.max(0, gross - cut);
    S.trip = null; save(); if (truck) { api.releaseTruck(truck); truck = null; } if (net) { api.addCash(net); S.earned += net; }
    api.sms(`${DRIVER} (pickup)`, `I don come back. Market price ${naira(gross)}, my transport ${naira(cut)}. Your ${naira(net)} don enter. Call me anytime!`);
    api.toast(`🚚 ${DRIVER} brought your money: ${naira(net)} (he took ${naira(cut)}).`, 3.4); }

  // ---------------------------------------------------------------- the beds and animals on screen
  function refresh() {
    if (!built) return;
    beds.forEach((b, i) => { const st = bedState(i), s = S.beds[i];
      if (b.base) { b.base.visible = i < S.open || true; setGeo(b.base, st === 'growing' ? 'bed_wet' : 'bed'); b.base.scale.y = i < S.open ? 1 : .35; }
      if (b.crop) { if (s.crop && i < S.open && s.stage >= 1) setGeo(b.crop, s.crop + '_' + Math.min(3, s.stage)); else b.crop.visible = false; }
      if (i >= S.open && S.got && !b.lock) { const w = W(BEDS[i].u, BEDS[i].v); const q = W(BEDS[i].u, BEDS[i].v + 1.7); b.lock = label('FOR SALE', naira(BED_PRICE[i]), .9, .34, q.x, .55, q.z, yardRot, true, '#fff3c4', '#7a1a10'); }
      if (b.lock && (i < S.open || !S.got)) { scene.remove(b.lock); b.lock = null; } });
    if (sign) sign.visible = S.got;
  }
  let hudEl = null;
  function hud() { if (!hudEl) { hudEl = document.createElement('div'); hudEl.className = 'farmhud'; hudEl.hidden = true; const st = document.createElement('style');
      st.textContent = '.farmhud{position:absolute;left:50%;top:calc(118px + var(--st));transform:translateX(-50%);background:rgba(12,14,18,.78);color:#F7EFDF;border:1px solid rgba(242,183,5,.6);border-radius:999px;padding:6px 14px;font:700 15px var(--fb,system-ui);pointer-events:none;white-space:nowrap}';
      document.head.append(st); (document.querySelector('.hud') || document.body).append(hudEl); }
    hudEl.hidden = !S.carry; if (S.carry) hudEl.textContent = `🧺 ${list(S.carry)} · sell to the farm produce buyer`; }

  // ---------------------------------------------------------------- what is near you, and E
  let here = null;
  const near = (p, x, z, r) => Math.hypot(p.x - x, p.z - z) < r;
  function findHere() {
    const p = api.player(); here = null; if (!built) return;
    if (MARKET && S.carry && near(p, MARKET.x, MARKET.z, 6)) { here = { t: `Sell your farm produce (${naira(valueOf(S.carry))})`, act: sellCarry }; return; }
    if (Math.hypot(p.x - YC.x, p.z - YC.z) > kd + 30) return;
    if (near(p, OFFICE.x, OFFICE.z, 5.5) || near(p, SG.x, SG.z, 3.2)) { here = { t: S.got ? 'Farm office: workers, pickup, prices' : 'Talk to the farm officer (free farm!)', act: officeMenu }; return; }
    const l = L(p.x, p.z); if (Math.abs(l.u) > YARD.u + 1 || Math.abs(l.v) > YARD.v + 1) return;
    if (!S.got) { if (Math.abs(l.v - GATE_V) < 4 && Math.abs(l.u) < 4) here = { t: 'Talk to the farm officer at the settlement gate first', act: () => api.gps(OFFICE.x, OFFICE.z, { name: 'Farm office' }) }; return; }
    // beds
    for (let i = 0; i < 8; i++) { const b = BEDS[i], du = Math.abs(l.u - b.u), dv = Math.abs(l.v - b.v); if (du > 2.6 || dv > 2.1) continue;
      const st = bedState(i), s = S.beds[i], C = s.crop && CROPS[s.crop];
      if (st === 'locked') here = { t: i === S.open ? `Buy this land · ${naira(BED_PRICE[i])}` : 'Buy the land next to it first', act: () => i === S.open && buyBed(i) };
      else if (st === 'empty') here = { t: 'Plant a crop here', act: () => seedMenu(i) };
      else if (st === 'dry') here = { t: `Water the ${C.n.toLowerCase()}`, act: () => water(i) };
      else if (st === 'growing') here = { t: `${C.em} ${C.n} growing · ${fmtT((s.until - now()) / 1000)}${s.stage === 1 ? ' (then water again)' : ''}`, act: () => api.toast(handOn() ? 'Musa the farmhand go water am when e need.' : 'Wait small. When it needs water again, come water am.') };
      else here = { t: `Harvest ${C.n.toLowerCase()} (${C.yield})`, act: () => harvest(i) };
      return; }
    const nearPen = Math.abs(l.u - PEN.u) < 5.6 && Math.abs(l.v - PEN.v) < 4.2, nearCoop = Math.abs(l.u - COOP.u) < 2.8 && Math.abs(l.v - COOP.v) < 3.2;
    if (nearPen) { const m = milkReady(); here = { t: m ? `Milk the cow (${m})` : `Cow pen · trough ${S.trough}/6${S.trough ? ` · milk in ${fmtT(MILK_S - (now() - Math.max(...S.cows.map(c => c.at))) / 1000)}` : ' · EMPTY'}`, act: () => m ? milk() : penMenu() }; return; }
    if (nearCoop) { here = { t: S.eggs ? `Collect eggs (${S.eggs})` : `Chicken coop · feeder ${S.feeder}/12${S.feeder ? '' : ' · EMPTY'}`, act: () => S.eggs ? eggs() : coopMenu() }; return; }
    if (Math.abs(l.u - BARN.u) < 4.6 && l.v > BARN.v + 2 && l.v < BARN.v + 6.5) { here = { t: `Your store (${stored()}/${S.cap})`, act: storeMenu }; return; }
  }

  // ---------------------------------------------------------------- the panels
  function seedMenu(i) { api.openMenu('PLANT A CROP', 'Seeds from the farm office. Water after planting and once more half way.', () => Object.entries(CROPS).map(([k, C]) => ({
    name: `${C.em} ${C.n}`, sub: `Ready in ~${fmtT(C.stage * 2)} · ${C.yield} ${C.unit}s · today ${naira(price(k))} each`, price: C.seed, act: () => { api.closeMenu(); plant(i, k); } }))); }
  function storeRows() {
    const rows = [];
    for (const [k, n] of Object.entries(S.store)) if (n > 0) rows.push({ name: `${GOODS[k].em} ${GOODS[k].n}: ${n}`, sub: `Market price today ${naira(price(k))} each · ${naira(price(k) * n)}`, btn: '·', off: true, act: () => { } });
    if (!rows.length) rows.push({ name: 'Your store is empty', sub: 'Harvest crops, milk the cow, collect eggs.', btn: '·', off: true, act: () => { } });
    const v = valueOf(S.store);
    rows.push({ name: `🚚 Send it with ${DRIVER}'s pickup`, sub: S.trip ? `He is on a trip now (${S.trip.phase})` : `Up to ${TRUCK_CAP} items to ${MARKET && MARKET.name || 'the market'}. He keeps 15% (about ${naira(Math.round(Math.min(v * .5, Math.max(300, v * DRIVER_CUT)) / 10) * 10)})`, btn: 'CALL HIM', off: !!S.trip || !stored(), act: () => { api.closeMenu(); callTruck(); } });
    rows.push({ name: '🧺 Carry it to market yourself', sub: `Up to ${CARRY_CAP} items, full price at the produce buyer`, btn: 'CARRY', off: !!S.carry || !stored(), act: () => { api.closeMenu(); takeCarry(); } });
    rows.push({ name: '🤝 Sell to the middleman here', sub: `Quick money, only 60%: ${naira(Math.round(v * GATE_RATE))}`, btn: 'SELL', off: !stored(), act: () => { sellGate(); } });
    const up = STORE_UP.find(([c]) => c > S.cap); if (up) rows.push({ name: '🏚️ Make the store bigger', sub: `Holds ${up[0]} instead of ${S.cap}`, price: up[1], act: () => bigger() });
    return rows;
  }
  function storeMenu() { api.openMenu(`YOUR STORE · ${stored()}/${S.cap}`, 'Everything you harvest, milk and collect', storeRows); }
  function penMenu() { api.openMenu('COW PEN', `${S.cows.length} cow${S.cows.length > 1 ? 's' : ''} · trough ${S.trough}/6`, () => [
    { name: `🥛 Milk the cow${S.cows.length > 1 ? 's' : ''}`, sub: milkReady() ? `${milkReady()} jug ready` : 'Not ready yet', btn: 'MILK', off: !milkReady(), act: () => milk() },
    { name: '🌽 Fill the trough with your maize', sub: `Uses 2 maize from your store (you have ${S.store.maize || 0})`, btn: 'FILL', off: (S.store.maize || 0) < 2 || S.trough >= 6, act: () => feedCow(true) },
    { name: '🌾 Buy a bag of cow feed', sub: 'Fills the trough for 3 milkings', price: FEED_COW, off: S.trough >= 6, act: () => feedCow(false) },
    { name: '🐄 Buy another cow', sub: S.cows.length >= MAX_COWS ? 'The pen is full' : 'More milk', price: COW_PRICE, off: S.cows.length >= MAX_COWS, act: () => buyCow() }]); }
  function coopMenu() { api.openMenu('CHICKEN COOP', `${S.hens.length} hens · feeder ${S.feeder}/12`, () => [
    { name: '🥚 Collect the eggs', sub: S.eggs ? `${S.eggs} eggs` : 'No eggs yet', btn: 'COLLECT', off: !S.eggs, act: () => eggs() },
    { name: '🌽 Fill the feeder with your maize', sub: `Uses 1 maize (you have ${S.store.maize || 0})`, btn: 'FILL', off: (S.store.maize || 0) < 1 || S.feeder >= 12, act: () => feedHens(true) },
    { name: '🌾 Buy chicken feed', sub: 'Fills the feeder for 4 eggs', price: FEED_HEN, off: S.feeder >= 12, act: () => feedHens(false) },
    { name: '🐔 Buy another hen', sub: S.hens.length >= MAX_HENS ? 'The coop is full' : 'More eggs', price: HEN_PRICE, off: S.hens.length >= MAX_HENS, act: () => buyHen() }]); }
  function officeMenu() {
    if (!S.got) { api.openMenu('FARM OFFICE', 'Officer: "Welcome to Oya Farm Settlement! Every Lagos person fit farm."', [
      { name: '🚜 Collect your free farm', sub: 'Land for 2 crop beds, 1 cow, 3 hens, a store and a farmhouse', btn: 'COLLECT', act: () => { api.closeMenu(); claim(); } },
      { name: 'How it works', sub: 'Plant, water, harvest. Feed the cow and hens. Sell at the market.', btn: '·', off: true, act: () => { } }]); return; }
    api.openMenu('FARM OFFICE', 'Officer: "How the farm dey go?"', () => [
      { name: '👨🏾‍🌾 Hire Musa the farmhand', sub: handOn() ? `Working till ${new Date(S.hand).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}` : 'Waters, harvests, milks, collects eggs, feeds the animals (one game day)', price: handOn() ? 0 : HAND_PAY, btn: handOn() ? 'HIRED' : undefined, off: handOn(), act: () => hireHand() },
      { name: `🚚 Call ${DRIVER}'s pickup`, sub: S.trip ? `On a trip (${S.trip.phase})` : `Takes ${TRUCK_CAP} items from your store to market, keeps 15%`, btn: 'CALL', off: !!S.trip || !stored(), act: () => { api.closeMenu(); callTruck(); } },
      ...Object.keys(GOODS).map(k => ({ name: `${GOODS[k].em} ${GOODS[k].n}`, sub: `Market price today, per ${GOODS[k].unit}`, btn: naira(price(k)), off: true, act: () => { } }))]); }

  // ---------------------------------------------------------------- the phone app (Oya Farm)
  function app() {
    if (!S.got) return { title: 'Oya Farm', sections: [{ rows: [{ name: 'Get your free farm', sub: 'Go to the Farm Settlement (north-east Mushin, by the lagoon) and talk to the farm officer.', btn: 'SHOW WAY', act: () => api.gps(OFFICE.x, OFFICE.z, { name: 'Farm Settlement' }) }] }] };
    const bedRows = S.beds.slice(0, S.open).map((s, i) => { const st = bedState(i), C = s.crop && CROPS[s.crop];
      return { name: `Bed ${i + 1}: ${C ? C.em + ' ' + C.n : 'empty'}`, sub: st === 'empty' ? 'Plant something' : st === 'dry' ? 'Needs water!' : st === 'growing' ? `Growing · ${fmtT((s.until - now()) / 1000)}` : 'Ready to harvest!', warn: st === 'dry' || st === 'ready' }; });
    const m = milkReady();
    return { title: 'Oya Farm', sections: [
      { h: 'Your farm', rows: [...bedRows, { name: `🐄 ${S.cows.length} cow${S.cows.length > 1 ? 's' : ''}`, sub: m ? `${m} milk ready` : S.trough ? `Trough ${S.trough}/6` : 'Trough empty! Feed the cow', warn: !!m || !S.trough },
        { name: `🐔 ${S.hens.length} hens`, sub: S.eggs ? `${S.eggs} eggs waiting` : S.feeder ? `Feeder ${S.feeder}/12` : 'Feeder empty!', warn: !!S.eggs || !S.feeder },
        { name: `🏚️ Store ${stored()}/${S.cap}`, sub: stored() ? `${list(S.store)} · worth ${naira(valueOf(S.store))}` : 'Empty' },
        { name: '👨🏾‍🌾 Farmhand', sub: handOn() ? 'Musa is working' : 'Not hired (hire at the farm office)' }] },
      { h: 'Sell', rows: [
        { name: `🚚 ${DRIVER}'s pickup`, sub: S.trip ? `On the way (${S.trip.phase})` : 'Takes your goods to market, keeps 15%', btn: S.trip ? 'BUSY' : 'CALL', off: !!S.trip || !stored(), act: callTruck },
        { name: '🧺 You carry', sub: S.carry ? list(S.carry) : 'Pick up at your store', btn: S.carry ? 'SHOW BUYER' : 'SHOW STORE', act: () => S.carry ? api.gps(MARKET.x, MARKET.z, { name: 'Farm produce buyer' }) : api.gps(W(BARN.u, BARN.v + 4).x, W(BARN.u, BARN.v + 4).z, { name: 'Your farm store' }) }] },
      { h: 'Prices today', rows: Object.keys(GOODS).map(k => ({ name: `${GOODS[k].em} ${GOODS[k].n}`, sub: `per ${GOODS[k].unit}`, btn: naira(price(k)), off: true })) },
      { rows: [{ name: 'Show the way to your farm', btn: 'GPS', act: () => api.gps(W(0, GATE_V).x, W(0, GATE_V).z, { name: 'Your farm' }) }] }] };
  }
  const notify = t => { if (!S.got) return; const p = api.player(); if (Math.hypot(p.x - YC.x, p.z - YC.z) < 60) api.toast(t, 2.6); };

  // ---------------------------------------------------------------- every frame
  let t1 = 0, lodT = 0;
  function update(dt) {
    if (!api.started()) return;
    const p = api.player(), dFarm = Math.hypot(p.x - YC.x, p.z - YC.z);
    if (!loading && (dFarm < 700 || S.carry || S.trip)) load();
    if ((t1 -= dt) <= 0) { t1 = .5; tickBeds(); tickAnimals(); tickHand(.5); if (built) refreshSoft(); }
    tickTruck(dt);
    if (saveT > 0 && (saveT -= dt) <= 0) flush();
    if (!built) return;
    findHere();
    if ((lodT -= dt) <= 0) { lodT = .5; const far = dFarm > api.Q.lod0 * .6; for (const o of dyn) { if (o.userData.far !== far) { o.userData.far = far; if (o.visible && o.userData.lod) setGeo(o, o.userData.lod); } } }
    const vis = dFarm < 260;
    for (const a of cows) { a.root.visible = vis; if (vis) wander(a, dt, { u: PEN.u, v: PEN.v - .2, hu: 3.6, hv: 2.1 }, .8, dFarm < 90); }
    for (const a of hens) { a.root.visible = vis && dFarm < 160; if (a.root.visible) wander(a, dt, { u: COOP.u, v: COOP.v + .55, hu: 1.6, hv: .8 }, .45, dFarm < 60); }
  }
  let sig = '';
  function refreshSoft() { const s = S.beds.map((b, i) => bedState(i) + (b.crop || '') + b.stage).join() + S.open + S.got; if (s !== sig) { sig = s; refresh(); } hud(); }

  function test(c) {
    const parts = (c || '').split(':');
    if (c === 'state') return JSON.stringify({ got: S.got, open: S.open, beds: S.beds.slice(0, S.open).map((b, i) => bedState(i) + ':' + (b.crop || '')), store: S.store, cap: S.cap, trough: S.trough, feeder: S.feeder, eggs: S.eggs, milk: milkReady(), trip: S.trip && S.trip.phase, carry: S.carry, built, ready, here: here && here.t });
    if (c === 'go') { const o = W(-10, kd - hwR - 11.5 + 3.6); api.teleport(o.x, o.z, ry + Math.PI); return 1; }
    if (c === 'yard') { const o = W(0, 3.4); api.teleport(o.x, o.z, ry + Math.PI); return 1; }
    if (c === 'claim') { claim(); return 1; }
    if (parts[0] === 'open') { S.open = Math.min(8, +parts[1]); save(); refresh(); return 1; }
    if (c === 'animals') return JSON.stringify({ cows: cows.map(a => { const l = L(a.x, a.z); return [+l.u.toFixed(1), +l.v.toFixed(1), a.mode, a.cur, a.root.visible]; }), hens: hens.map(a => { const l = L(a.x, a.z); return [+l.u.toFixed(1), +l.v.toFixed(1), a.mode, a.cur]; }) });
    if (c === 'ripe') { for (const b of S.beds) if (b.crop) { b.stage = 3; b.wet = false; } refresh(); return 1; }
    if (parts[0] === 'plant') { plant(+parts[1], parts[2]); return 1; }
    if (parts[0] === 'water') { water(+parts[1]); return 1; }
    if (c === 'grow') { for (const b of S.beds) if (b.crop && b.wet) b.until = now(); for (const cw of S.cows) cw.at -= MILK_S * 1000; for (const h of S.hens) h.at -= EGG_S * 1000; tickBeds(); tickAnimals(); return 1; }
    if (parts[0] === 'harvest') { harvest(+parts[1]); return 1; }
    if (c === 'truck') { callTruck(); return 1; }
    if (parts[0] === 'phase' && S.trip) { S.trip.phase = parts[1]; S.trip.t = now() - (+parts[2] || 0) * 1000; return 1; }
    if (c === 'truckpos') return truck ? JSON.stringify({ x: Math.round(truck.x), z: Math.round(truck.z), sp: +truck.speed.toFixed(1), ai: !!truck.ai, goal: truck.ai && truck.ai.goal && { x: Math.round(truck.ai.goal.x), z: Math.round(truck.ai.goal.z) } }) : 'none';
    if (c === 'carry') { takeCarry(); return 1; }
    if (c === 'market') { if (MARKET) api.teleport(MARKET.x + 2, MARKET.z + 2, 0); return 1; }
    if (c === 'reset') { localStorage.removeItem(KEY); return 1; }
    if (parts[0] === 'at') { const o = W(+parts[1], +parts[2]); api.teleport(o.x, o.z, ry + Math.PI); return 1; }
    if (c === 'yardpos') return JSON.stringify({ yc: YC, k: K, ry, gate: SG, office: OFFICE, market: MARKET });
    return 0;
  }
  return {
    update, test, app,
    prompt: () => here ? here.t : null, action: () => { if (!here) return false; here.act(); return true; },
    near: () => !!here, claimed: () => S.got, inYard: () => { const p = api.player(), l = L(p.x, p.z); return S.got && Math.abs(l.u) < YARD.u && Math.abs(l.v) < YARD.v; },
    nearSettlement: () => { const p = api.player(); return Math.hypot(p.x - SG.x, p.z - SG.z) < 40; },
    pos: () => ({ x: SG.x, z: SG.z }), truck: () => truck,
  };
}
