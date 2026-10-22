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
   Grazing (v2): the cow pen is 12 tiles of grass. A hungry cow walks to the grass and eats it (the grass goes down
   as it eats, till the ground is bare); you water a bare tile and the grass grows back (rain waters them all).
   The hens eat the grain you throw in their run. Every second good meal a cow leaves a jar of milk and a hen an egg
   on the ground: walk over them to pick them into your store. An animal that has not eaten for 2 minutes gets thin
   and runs about looking for food; at 2:20 it dies (one at a time). Hunger only runs while you are at the farm.
   Your own farm lorry waits in the yard: pack the store onto it, drive it to the produce buyer, sell the load.
   Nine more farms all over the map (Mushin and Ikeja) are run by other farmers: cows and hens about, and the farmer
   at the gate sells you milk and eggs once a day, cheap, to sell on at the market.
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
// grazing and hunger (seconds)
const HUNGRY = 40, THIN = 120, DEAD = 140, GROW = 30, MEAL_COW = 6, MEAL_HEN = 3, BITE = .34, MILK_EVERY = 2, EGG_EVERY = 2;
const GRAIN_COST = 200, GRAIN_MAX = 6, PILE = 2, LORRY_CAP = 40, SIM_R = 140, PICK_R = 1.4;

export function createFarm(api) {
  const THREE = api.THREE, scene = api.scene, F = api.zone, YC = F.yard;
  const now = () => Date.now();
  const S = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })();
  const V0 = S.v || 1; S.got = !!S.got; S.beds = S.beds || []; S.open = S.open || 2; S.store = S.store || {}; S.cap = S.cap || 30;
  S.cows = S.cows || [{ milk: 0, at: now() }]; S.hens = S.hens || [{ at: now() }, { at: now() + 50000 }, { at: now() + 100000 }];
  S.trough = S.trough ?? 3; S.feeder = S.feeder ?? 6; S.eggs = S.eggs || 0; S.carry = S.carry || null; S.hand = S.hand || 0; S.trip = S.trip || null; S.earned = S.earned || 0;
  while (S.beds.length < 8) S.beds.push({ crop: null });
  // v2: grass tiles in the pen ({a: how much grass 0..1, w: when it was watered}), grain piles and produce lying in the yard, the lorry's load
  S.turf = S.turf || []; while (S.turf.length < 12) S.turf.push({ a: 1, w: 0 });
  S.grain = S.grain || []; S.drops = S.drops || []; S.lorry = S.lorry || { load: {} };
  S.cows.forEach(c => { c.hu = c.hu ?? 0; c.meals = c.meals || 0; }); S.hens.forEach((h, i) => { h.hu = h.hu ?? i * 12; h.meals = h.meals || 0; });
  S.v = 2;
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
  // the pen's grass: 4 x 3 tiles of 2.3 x 1.75 m (pen model x -> u, model y -> -v); the hens' run in front of the coop
  const TILES = []; for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) TILES.push({ u: PEN.u - 3.45 + i * 2.3, v: PEN.v + 2.125 - j * 1.75 });
  const RUN = { u: COOP.u, v: COOP.v + .55, hu: 1.5, hv: .7 };
  const LORRY_AT = { u: 10.5, v: 10.5 };
  // the settlement gate where the driveway leaves the road, and the farm office beside it
  const kd = Math.hypot(K.x - YC.x, K.z - YC.z);
  const hwR = api.roadHalf(K.x, K.z), SG = W(0, kd - hwR - 2.2), OFFICE = W(-10, kd - hwR - 11.5), OFFICE_RY = ry;
  const MARKET = api.market();

  // ---------------------------------------------------------------- models
  const M = {}; let ready = false, loading = false, built = false, loadLeft = () => -1;
  const STATIC = ['barn', 'house', 'coop', 'pen', 'tank', 'office', 'gate', 'fence', 'bed', 'bed_wet', 'palm', 'plantain', 'grass', 'scarecrow', 'tools', 'produce',
    'turf', 'turf_low', 'turf_bare', 'turf_wet', 'milk', 'egg', 'grain', 'crate',
    ...Object.keys(CROPS).flatMap(c => [1, 2, 3].map(s => c + '_' + s))];
  async function load() {
    if (loading) return; loading = true;
    try {
      const jobs = STATIC.map(n => api.glb('fm_' + n).then(m => { M[n] = m; }).catch(e => console.warn('farm model', n, e)));
      jobs.push(api.skinned('fm_cow').then(g => { M.cow = g; }).catch(e => console.warn('cow', e)));
      jobs.push(api.skinned('fm_cow2').then(g => { M.cow2 = g; }).catch(e => console.warn('cow2', e)));
      jobs.push(api.skinned('fm_hen').then(g => { M.hen = g; }).catch(e => console.warn('hen', e)));
      jobs.push(api.registerTruck().catch(e => console.warn('truck', e)));
      jobs.push(api.registerLorry().catch(e => console.warn('lorry', e)));
      let left = jobs.length; jobs.forEach(j => j.then(() => { left--; })); loadLeft = () => left;
      await Promise.all(jobs); ready = true; build(); buildNpcs();
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
  const turfs = [], tileBy = [];   // the grass tile meshes, and which cow is eating each

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
    // the pen's grass tiles
    TILES.forEach(p => { const w = W(p.u, p.v); turfs.push(mesh('turf', w.x, w.z, yardRot, .006)); });
    if (V0 < 2 && S.got && !S.grain.length) throwGrain(true);
    animals(); refresh(); turfShow(); spawnLorry();
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

  // ---- nine more farms across the map, run by other farmers (api.npcFarms from src/game.js). Each: a fenced yard facing its road,
  // barn, farmhouse, tank, a cow pen of grass with two cows, a coop with hens, and the farmer at the gate who sells you
  // milk and eggs cheap (once a day) for your store: carry them to the market buyer and sell them for more.
  const NL = { YU: 13, YV: 10.5, PEN: { u: -7, v: 2.5 }, COOP: { u: 8.5, v: 3 }, BARN: { u: -7, v: -6.5 }, HOUSE: { u: 8, v: -6.5 }, TANK: { u: 1.5, v: -8.2 }, FARMER: { u: 2.5, v: 8.2 } };
  const NPCS = (api.npcFarms || []).map((f, i) => {
    const ry2 = Math.atan2(f.kx - f.x, f.kz - f.z), fx = Math.sin(ry2), fz = Math.cos(ry2), rx = Math.cos(ry2), rz = -Math.sin(ry2);
    const Wn = (u, v) => ({ x: f.x + rx * u + fx * v, z: f.z + rz * u + fz * v }), Ln = (x, z) => { const dx = x - f.x, dz = z - f.z; return { u: dx * rx + dz * rz, v: dx * fx + dz * fz }; };
    const n = { i, ...f, ry: ry2, W: Wn, L: Ln, kd: Math.hypot(f.kx - f.x, f.kz - f.z), cows: [], hens: [], on: false };
    n.penBox = { u: NL.PEN.u, v: NL.PEN.v - .2, hu: 3.6, hv: 2.1, W: Wn }; n.run = { u: NL.COOP.u, v: NL.COOP.v + .55, hu: 1.5, hv: .7, W: Wn };
    n.farmer = Wn(NL.FARMER.u, NL.FARMER.v);
    api.mapPlace({ name: f.n + ' Farm', sub: 'Farm · buy fresh milk and eggs', kind: 'place', x: n.farmer.x, z: n.farmer.z });
    return n; });
  const npcNear = p => { let best = null, bd = 1e9; for (const n of NPCS) { const d = Math.hypot(p.x - n.x, p.z - n.z); if (d < bd) { bd = d; best = n; } } return [best, bd]; };
  let npcBuilt = false;
  function buildNpcs() {
    if (npcBuilt || !ready || !NPCS.length) return; npcBuilt = true;
    const items = {}; const add = (k, n, u, v, rot = 0, sc = 1) => { const w = n.W(u, v); (items[k] || (items[k] = [])).push({ x: w.x, z: w.z, ry: n.ry + rot, sc }); };
    for (const n of NPCS) {
      const ob = (p, hu, hv, h, dv = 0) => { const w = n.W(p.u, p.v + dv); api.addOB(w.x, w.z, hu, hv, -n.ry, h); };
      const wall = (p, u0, v0, u1, v1) => { const a = n.W(p.u + u0, p.v + v0), b = n.W(p.u + u1, p.v + v1); api.addOB((a.x + b.x) / 2, (a.z + b.z) / 2, Math.hypot(b.x - a.x, b.z - a.z) / 2, .12, Math.atan2(b.z - a.z, b.x - a.x), 1.4); };
      for (const [k, p] of [['barn', NL.BARN], ['house', NL.HOUSE], ['tank', NL.TANK], ['pen', NL.PEN], ['coop', NL.COOP]]) add(k, n, p.u, p.v);
      ob(NL.BARN, 4.1, 3.1, 4.5); ob(NL.HOUSE, 3.6, 2.6, 4); ob(NL.TANK, 1.0, 1.0, 4.2); ob(NL.COOP, 1.25, .95, 2.4, -1.6);
      const P = NL.PEN; wall(P, -5, 3.5, -1.1, 3.5); wall(P, 1.1, 3.5, 5, 3.5); wall(P, -5, -3.5, 5, -3.5); wall(P, -5, -3.5, -5, 3.5); wall(P, 5, -3.5, 5, 3.5);
      const C0 = NL.COOP; wall(C0, -2, 1.6, -.6, 1.6); wall(C0, .6, 1.6, 2, 1.6); wall(C0, -2, 1.6, -2, -.7); wall(C0, 2, 1.6, 2, -.7);
      // the pen's grass: mostly thick, a patch or two grazed down (this farmer waters it)
      for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) { const h = hash(n.i * 7 + i, j * 3 + 1); add(h < .7 ? 'turf' : h < .9 ? 'turf_low' : 'turf_wet', n, P.u - 3.45 + i * 2.3, P.v + 2.125 - j * 1.75); }
      // the yard fence, gate in front, the farm's sign
      for (let u = -NL.YU + 2; u <= NL.YU - 2 + .01; u += 4) { if (Math.abs(u) > 3.5) add('fence', n, u, NL.YV); add('fence', n, u, -NL.YV); }
      for (let v = -NL.YV + 2; v <= NL.YV - 2 + .01; v += 4) { add('fence', n, -NL.YU, v, Math.PI / 2); add('fence', n, NL.YU, v, Math.PI / 2); }
      add('gate', n, 0, NL.YV + .3);
      { const w = n.W(0, NL.YV + .3 + .18); label((n.n + ' FARM').toUpperCase().slice(0, 24), 'FRESH MILK · EGGS', 3.6, .82, w.x, 3.35, w.z, n.ry); }
      // round about: palms, plantain, a couple of crop beds, a scarecrow, tools
      add('tools', n, -1.5, -8.6); add('scarecrow', n, -.5, -1.5, hash(n.i, 9) * 6);
      for (const [k, u, v] of [['palm', -15.5, -9], ['palm', 15.8, 7], ['plantain', 15.5, -8], ['plantain', -15.5, 6], ['palm', -16, 11]]) add(k, n, u, v, hash(n.i, u) * 6, .9 + hash(u, n.i) * .3);
      const crop = Object.keys(CROPS)[n.i % 5];
      for (const [u, v] of [[.6, 2.2], [4.2, 2.2]]) { add('bed', n, u, v); add(crop + '_3', n, u, v); }
      // the driveway to the road
      { const a = n.W(0, NL.YV - 1), hw = api.roadHalf(n.kx, n.kz), b = { x: n.kx - Math.sin(n.ry) * hw, z: n.kz - Math.cos(n.ry) * hw }, len = Math.hypot(b.x - a.x, b.z - a.z) + 2, g = new THREE.PlaneGeometry(4.2, len); g.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(g, api.dirtMat); m.position.set((a.x + b.x) / 2, .028, (a.z + b.z) / 2); m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); m.receiveShadow = true; scene.add(m);
        const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const u0 = uv.getX(i), v0 = uv.getY(i); uv.setXY(i, v0 * len / 9, u0); } }
      // the farmer, at the gate
      api.spot(n.cast, n.farmer.x, n.farmer.z, n.ry, n.cast === 'mama' ? ['talk', 'idle_2', 'phone'] : ['talk', 'idle_baba', 'phone']);
    }
    for (const [k, list] of Object.entries(items)) sets(k, list, k === 'turf' || k.startsWith('turf') ? .45 : .6, k === 'fence' || k.startsWith('turf') ? .6 : .9);
  }
  // the NPC farms' animals: only at the farm you are near (they come and go as you move about)
  function npcAnimals(n, on) {
    if (on === n.on) return; n.on = on;
    for (const a of [...n.cows, ...n.hens]) drop(a); n.cows = []; n.hens = []; if (!on) return;
    if (M.cow) for (let i = 0; i < 2; i++) { const a = makeAnimal(i % 2 && M.cow2 ? M.cow2 : M.cow); const p = n.W(NL.PEN.u - 2 + i * 3, NL.PEN.v + .3 - i); Object.assign(a, { x: p.x, z: p.z, h: n.ry + i * 2, kind: 'cow', t: Math.random() * 4 }); n.cows.push(a); play(a, 'Graze'); }
    if (M.hen) for (let i = 0; i < 4; i++) { const a = makeAnimal(M.hen, .95 + (i % 3) * .04, HEN_TINT[(i + n.i) % HEN_TINT.length]); const p = n.W(NL.COOP.u - 1.2 + i * .8, NL.COOP.v + .6); Object.assign(a, { x: p.x, z: p.z, h: Math.random() * 6, kind: 'hen', t: Math.random() * 2 }); n.hens.push(a); play(a, 'Idle'); }
  }
  function tickNpcs(dt, p) {
    for (const n of NPCS) {
      const d = Math.hypot(p.x - n.x, p.z - n.z); npcAnimals(n, d < 150 || (n.on && d < 210)); if (!n.on) continue;
      const anim = d < 90;
      for (const a of n.cows) { wander(a, dt, n.penBox, .8); a.root.position.set(a.x, 0, a.z); a.root.rotation.y = a.h; if (anim) a.mix.update(dt); }
      for (const a of n.hens) { a.root.visible = d < 160; wander(a, dt, n.run, .45); a.root.position.set(a.x, 0, a.z); a.root.rotation.y = a.h; if (anim && d < 60) a.mix.update(dt); }
    }
  }
  // buying from them: 2 jugs of milk and 6 eggs a day from each farm, a quarter below the market price
  const NPC_BUY = { milk: 2, egg: 6 }, NPC_RATE = .75;
  const npcCost = () => Math.round(valueOf(NPC_BUY) * NPC_RATE / 10) * 10;
  function npcBuy(n) {
    S.npc = S.npc || {};
    if (!S.got) { api.toast(`${n.n}: "Get your own farm first, my pikin. Go see the farm officer for Farm Settlement — then come buy from me."`, 4); api.gps(OFFICE.x, OFFICE.z, { name: 'Farm office' }); return; }
    if (S.npc[n.i] === day()) { api.toast(`${n.n}: "I don sell you today's milk and eggs. Come back tomorrow!"`, 3); return; }
    const k = npcCost(), q = NPC_BUY.milk + NPC_BUY.egg;
    if (!room(q)) { api.toast(`Your store is full (${stored()}/${S.cap}). Sell something first.`, 2.6); return; }
    if (api.cash() < k) { api.toast(`You need ${naira(k)}.`); return; }
    api.addCash(-k); S.npc[n.i] = day(); put('milk', NPC_BUY.milk); put('egg', NPC_BUY.egg); flush();
    api.toast(`🥛🥚 You bought ${list(NPC_BUY)} from ${n.n} for ${naira(k)}. They're in your store — sell them at the market for more.`, 3.6);
  }
  function npcHere(p) {
    for (const n of NPCS) { if (!near(p, n.farmer.x, n.farmer.z, 3.4)) continue;
      const sold = S.npc && S.npc[n.i] === day();
      return { t: sold ? `${n.n}: sold out today · come back tomorrow` : `Buy ${list(NPC_BUY)} from ${n.n} (${naira(npcCost())})`, act: () => npcBuy(n) }; }
    return null;
  }

  // ---- the animals: skinned, each with its own moves; each one is tied to its saved state (a.s)
  function makeAnimal(g, sc = 1, tint = null) {
    const root = api.clone(g.scene); root.scale.setScalar(sc); root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.layers.set(1);
      if (o.material) { if (tint) { o.material = o.material.clone(); o.material.color.setRGB(tint[0], tint[1], tint[2]); } o.material.side = THREE.DoubleSide; } } });
    scene.add(root); const mix = new THREE.AnimationMixer(root), acts = {};
    for (const c of g.animations) acts[c.name] = mix.clipAction(c);
    const bub = new THREE.Sprite(BUB.hungry); bub.scale.setScalar(.62); bub.visible = false; bub.layers.set(1); scene.add(bub);
    return { root, mix, acts, cur: null, x: 0, z: 0, h: 0, tx: 0, tz: 0, t: 0, mode: 'idle', sc, thin: 0, bub, dead: 0 };
  }
  const HEN_TINT = [null, [.82, .55, .34], [.58, .4, .3], [.95, .8, .62]];
  // the little bubble over a hungry animal: green leaf (hungry), red (starving, it will die)
  const BUB = (() => { const mk = (em, ring) => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.arc(64, 58, 50, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(52, 100); g.lineTo(64, 124); g.lineTo(76, 100); g.fill();
      g.lineWidth = 8; g.strokeStyle = ring; g.beginPath(); g.arc(64, 58, 46, 0, Math.PI * 2); g.stroke();
      g.font = '60px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(em, 64, 62);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.SpriteMaterial({ map: t, depthTest: true, fog: false }); };
    return { hungry: mk('🌿', '#5aa832'), grain: mk('🌽', '#e0a020'), thin: mk('😫', '#d02a1a') }; })();
  function play(a, name, fade = .35) { if (a.cur === name || !a.acts[name]) return; const n = a.acts[name]; n.reset().setEffectiveWeight(1).fadeIn(fade).play(); if (a.cur && a.acts[a.cur]) a.acts[a.cur].fadeOut(fade); a.cur = name; }
  function drop(a) { scene.remove(a.root); scene.remove(a.bub); }
  function animals() {
    for (const a of cows) drop(a); for (const a of hens) drop(a); cows = []; hens = [];
    if (!S.got) return;
    if (M.cow) S.cows.forEach((c, i) => { const a = makeAnimal(i % 2 && M.cow2 ? M.cow2 : M.cow); /* a brown zebu, then a Holstein, then a zebu */ const p = W(PEN.u - 2 + i * 2.2, PEN.v + .5 - i); Object.assign(a, { s: c, x: p.x, z: p.z, h: yardRot + i, kind: 'cow', t: Math.random() * 3 }); cows.push(a); play(a, 'Graze'); });
    if (M.hen) S.hens.forEach((c, i) => { const a = makeAnimal(M.hen, .95 + (i % 3) * .04, HEN_TINT[i % HEN_TINT.length]); /* local hens: light, brown, dark */ const p = W(COOP.u - 1.2 + (i % 4) * .8, COOP.v + .6 + Math.floor(i / 4) * .3); Object.assign(a, { s: c, x: p.x, z: p.z, h: Math.random() * 6, kind: 'hen', t: Math.random() * 2 }); hens.push(a); play(a, 'Idle'); });
  }
  // walk (or run) toward a.tx, a.tz; true once there
  function step(a, dt, spd, turn) {
    const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz); if (d < .18) return true;
    const want = Math.atan2(dx, dz); let dh = want - a.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); a.h += Math.sign(dh) * Math.min(Math.abs(dh), dt * turn);
    if (Math.abs(dh) < .7) { const s = Math.min(d, spd * dt); a.x += Math.sin(a.h) * s; a.z += Math.cos(a.h) * s; } return false;
  }
  function roamTo(a, box) { const p = (box.W || W)(box.u + (Math.random() * 2 - 1) * box.hu, box.v + (Math.random() * 2 - 1) * box.hv); a.tx = p.x; a.tz = p.z; }
  function wander(a, dt, box, spd) {   // a fed animal: strolls, grazes a little, pecks, stands about
    a.t -= dt;
    if (a.t <= 0) {
      if (a.mode === 'walk' || Math.random() < .45) { a.mode = a.kind === 'cow' ? (Math.random() < .6 ? 'graze' : 'idle') : (Math.random() < .55 ? 'peck' : 'idle'); a.t = a.kind === 'cow' ? 4 + Math.random() * 8 : 1.5 + Math.random() * 3; }
      else { roamTo(a, box); a.mode = 'walk'; a.t = 12; }
    }
    if (a.mode === 'walk') { if (step(a, dt, spd, a.kind === 'cow' ? 1.2 : 5)) a.t = 0; play(a, 'Walk'); }
    else play(a, a.mode === 'graze' ? 'Graze' : a.mode === 'peck' ? 'Peck' : 'Idle');
  }
  const PENBOX = { u: PEN.u, v: PEN.v - .2, hu: 3.6, hv: 2.1 };
  let lastDie = { cow: -99, hen: -99 }, clock = 0;
  // one animal, every frame: hunger, looking for food, eating, getting thin, running about, dying
  function animalTick(a, dt, sim, near) {
    const cow = a.kind === 'cow', c = a.s;
    if (a.dead) {   // falls on its side, lies there, sinks away
      a.dead += dt; a.root.rotation.z = Math.min(1, a.dead / .9) * Math.PI / 2 * a.side; a.root.position.y = a.dead > 3 ? -(a.dead - 3) * (cow ? .7 : .25) : 0;
      if (a.dead > 5) { drop(a); const L0 = cow ? cows : hens, i = L0.indexOf(a); if (i >= 0) L0.splice(i, 1); }
      return;
    }
    if (sim) c.hu += dt;
    if (sim && c.hu >= DEAD) { if (clock - lastDie[a.kind] > 4) { die(a); return; } c.hu = DEAD; }
    const hungry = c.hu >= HUNGRY, thin = c.hu >= THIN;
    a.thin += ((thin ? 1 : 0) - a.thin) * Math.min(1, dt * .6);
    const run = thin ? (cow ? 2.6 : 1.7) : (cow ? 1.0 : .7);
    if (a.acts.Walk) a.acts.Walk.timeScale = thin ? 2.1 : 1;
    if (a.mode === 'eat') {   // eating: the grass (or grain) goes down while it eats
      a.et -= dt;
      const left = cow ? eatTurf(a.food, BITE * dt / MEAL_COW) : eatGrain(a.food, dt / MEAL_HEN);
      play(a, cow ? 'Graze' : 'Peck');
      if (a.et <= 0 || left <= .01) { c.hu = 0; c.meals++; save(); if (cow) tileBy[a.food] = null;
        if (c.meals % (cow ? MILK_EVERY : EGG_EVERY) === 0) layDrop(cow ? 'milk' : 'egg', a);
        a.food = null; a.mode = 'idle'; a.t = 1.5 + Math.random() * 3; }
    } else if (hungry) {
      if (a.mode !== 'seek' || a.food == null || !foodLeft(a)) { const f = cow ? pickTile(a) : pickGrain(a); if (a.food != null && cow && tileBy[a.food] === a) tileBy[a.food] = null;
        a.food = f; if (f != null) { const p = cow ? TILES[f] : S.grain[f]; const w = W(p.u + (Math.random() - .5) * (cow ? 1 : .2), p.v + (Math.random() - .5) * (cow ? .7 : .2)); a.tx = w.x; a.tz = w.z; a.mode = 'seek'; if (cow) tileBy[f] = a; }
        else if (a.mode !== 'search') { a.mode = 'search'; a.rt = 0; } }
      if (a.mode === 'seek') { if (step(a, dt, run, cow ? (thin ? 3 : 1.5) : 6)) { a.mode = 'eat'; a.et = cow ? MEAL_COW : MEAL_HEN; } else play(a, 'Walk'); }
      else {   // nothing to eat: wander looking, and when starving, run about
        a.rt -= dt; if (a.rt <= 0 || step(a, 0, 0, 0)) { roamTo(a, cow ? PENBOX : RUN); a.rt = thin ? 1.5 + Math.random() : 3 + Math.random() * 3; }
        if (step(a, dt, run, cow ? (thin ? 3 : 1.2) : 6)) a.rt = 0; play(a, 'Walk'); }
    } else wander(a, dt, cow ? PENBOX : RUN, cow ? .8 : .45);
    a.root.position.set(a.x, 0, a.z); a.root.rotation.y = a.h;
    a.root.scale.set(a.sc * (1 - .24 * a.thin), a.sc, a.sc * (1 - .06 * a.thin));
    a.bub.visible = hungry && a.root.visible; if (a.bub.visible) { a.bub.material = thin ? BUB.thin : cow ? BUB.hungry : BUB.grain; a.bub.position.set(a.x, (cow ? 1.95 : .68) + Math.sin(clock * 3) * .05, a.z); }
    if (near) a.mix.update(dt);
  }
  function die(a) {
    const L0 = a.kind === 'cow' ? S.cows : S.hens, i = L0.indexOf(a.s); if (i >= 0) L0.splice(i, 1); save(); flush();
    if (a.kind === 'cow' && a.food != null && tileBy[a.food] === a) tileBy[a.food] = null;
    lastDie[a.kind] = clock; a.dead = .001; a.side = Math.random() < .5 ? 1 : -1; a.bub.visible = false; play(a, 'Idle', .2);
    api.toast(a.kind === 'cow' ? '💀 One of your cows don die of hunger. Water the grass so they fit chop!' : '💀 One of your hens don die of hunger. Throw grain for them!', 3.4);
  }

  // ---- the grass tiles, the grain piles, the produce on the ground
  function turfAmt(i) { const t = S.turf[i]; if (!t.w) return t.a; const a = Math.max(0, Math.min(1, t.a + (now() - t.w) / 1000 / GROW)); if (a >= 1) { t.a = 1; t.w = 0; save(); } return a; }
  function eatTurf(i, x) { const t = S.turf[i], cur = turfAmt(i), take = Math.min(cur, x); t.a = (t.w ? t.a : cur) - take; if (!t.w) t.a = Math.max(0, t.a); return cur - take; }
  const needsWater = i => !S.turf[i].w && turfAmt(i) < .95;
  function waterTurf(i, quiet) { if (!needsWater(i)) return false; const t = S.turf[i]; t.a = turfAmt(i); t.w = now(); save(); turfShow(); if (!quiet) { const w = W(TILES[i].u, TILES[i].v); pop(w.x, 1.3, w.z, '💧', 'GRASS WATERED', GCOL.water); burstAt('water', w.x, w.z, .2); api.toast('💧 You watered the grass. E go grow back small small.', 2); } return true; }
  function pickTile(a) { let best = null, bd = 1e9; TILES.forEach((p, i) => { if (turfAmt(i) < .15 || (tileBy[i] && tileBy[i] !== a)) return; const w = W(p.u, p.v), d = Math.hypot(w.x - a.x, w.z - a.z); if (d < bd) { bd = d; best = i; } }); return best; }
  function pickGrain(a) { let best = null, bd = 1e9; S.grain.forEach((p, i) => { if (p.n <= 0) return; const w = W(p.u, p.v), d = Math.hypot(w.x - a.x, w.z - a.z); if (d < bd) { bd = d; best = i; } }); return best; }
  const foodLeft = a => a.kind === 'cow' ? turfAmt(a.food) >= .15 : !!(S.grain[a.food] && S.grain[a.food].n > 0);
  function eatGrain(i, x) { const p = S.grain[i]; if (!p) return 0; p.n = Math.max(0, p.n - x); if (p.n <= .01) { S.grain.splice(i, 1); for (const h of hens) if (h.food != null && h.food > i) h.food--; else if (h.food === i && h.mode !== 'eat') h.food = null; save(); grainShow(); return 0; } grainShow(); return p.n; }
  function throwGrain(free) {
    if (S.grain.length >= GRAIN_MAX) { api.toast('Plenty grain dey ground already. Let them chop am first.'); return false; }
    if (!free) { if ((S.store.maize || 0) >= 1) { S.store.maize--; } else { if (api.cash() < GRAIN_COST) { api.toast(`A bowl of grain costs ${naira(GRAIN_COST)}.`); return false; } api.addCash(-GRAIN_COST); } }
    for (let k = 0; k < 3 && S.grain.length < GRAIN_MAX; k++) S.grain.push({ u: RUN.u + (Math.random() * 2 - 1) * RUN.hu * .85, v: RUN.v + (Math.random() * 2 - 1) * RUN.hv * .8, n: PILE });
    save(); grainShow(); if (!free) { const w = W(RUN.u, RUN.v); pop(w.x, 1.4, w.z, '🌽', 'GRAIN DOWN', GCOL.feed); api.toast('🌽 You threw grain for the hens. Watch them run come!', 2.2); } return true;
  }
  function layDrop(k, a) { const l = L(a.x - Math.sin(a.h) * (k === 'milk' ? 1.3 : .2), a.z - Math.cos(a.h) * (k === 'milk' ? 1.3 : .2)), B = k === 'milk' ? PENBOX : RUN;   // kept inside the pen / the run
    const u = Math.max(B.u - B.hu, Math.min(B.u + B.hu, l.u)), v = Math.max(B.v - B.hv, Math.min(B.v + B.hv, l.v)); S.drops.push({ k, u, v, t: now() }); save(); dropShow();
    notify(k === 'milk' ? '🥛 Your cow don give milk! Go pick the jar.' : '🥚 A hen don lay egg! Go pick am.'); }
  // the meshes for them
  const grainObjs = [], dropObjs = [];
  function turfShow() { if (!built) return; turfs.forEach((o, i) => { if (!o) return; const a = turfAmt(i), wet = !!S.turf[i].w;
    const n = a > .45 ? 'turf' : a > .08 ? 'turf_low' : wet ? 'turf_wet' : 'turf_bare'; if (o.userData.lod !== n || !o.visible) setGeo(o, n); o.scale.y = n === 'turf' ? .35 + .65 * a : 1; }); }
  function pool(objs, name, n) { while (objs.length < n) { const m = M[name]; if (!m) return; const o = new THREE.Mesh(m.geo, m.mat); o.castShadow = true; o.receiveShadow = true; o.layers.set(1); scene.add(o); objs.push(o); } for (let i = 0; i < objs.length; i++) objs[i].visible = i < n; }
  function grainShow() { if (!built) return; pool(grainObjs, 'grain', S.grain.length); S.grain.forEach((p, i) => { const o = grainObjs[i]; if (!o) return; const w = W(p.u, p.v); o.position.set(w.x, .015, w.z); o.rotation.y = i * 1.7; const k = .45 + .55 * Math.min(1, p.n / PILE); o.scale.set(k, 1, k); }); }
  function dropShow() { if (!built) return;
    while (dropObjs.length < S.drops.length) { const o = new THREE.Group(); o.layers.set(1); scene.add(o); dropObjs.push(o); }
    dropObjs.forEach((o, i) => { const d = S.drops[i]; o.visible = !!d; if (!d) return; if (o.userData.k !== d.k) { o.clear(); const m = M[d.k]; if (m) { const me = new THREE.Mesh(m.geo, m.mat); me.castShadow = true; me.layers.set(1); me.scale.setScalar(d.k === 'egg' ? 2.2 : 1.35); o.add(me); } o.userData.k = d.k; }
      const w = W(d.u, d.v); o.position.set(w.x, 0, w.z); }); }
  function tickDrops(dt) {   // they bob so you see them; walk over one and it goes into your store
    dropObjs.forEach((o, i) => { if (!o.visible) return; o.children[0] && (o.children[0].position.y = .05 + Math.abs(Math.sin(clock * 2.4 + i)) * .12); o.rotation.y += dt * 1.2; });
    if (!api.walking()) return; const p = api.player();
    for (let i = S.drops.length - 1; i >= 0; i--) { const d = S.drops[i], w = W(d.u, d.v); if (Math.hypot(p.x - w.x, p.z - w.z) > PICK_R) continue;
      if (!room(1)) { if (clock - fullT > 4) { fullT = clock; api.toast(`Your store is full (${stored()}/${S.cap}). Load your lorry or sell first.`, 2.6); } continue; }
      S.drops.splice(i, 1); put(d.k, 1); dropShow(); api.toast(d.k === 'milk' ? `🥛 +1 jar of milk · store ${stored()}/${S.cap}` : `🥚 +1 egg · store ${stored()}/${S.cap}`, 1.4); }
  }
  let fullT = -9;

  // ---------------------------------------------------------------- the state of things
  function bedState(i) { const b = S.beds[i]; if (i >= S.open) return 'locked'; if (!b.crop) return 'empty'; if (b.stage >= 3) return 'ready'; return b.wet ? 'growing' : 'dry'; }
  function tickBeds() {
    const t = now(), rain = api.rain() > .3;
    S.beds.forEach((b, i) => { if (!b.crop || b.stage >= 3 || i >= S.open) return;
      if (!b.wet && rain) { b.wet = true; b.until = t + CROPS[b.crop].stage * 1000; save(); }
      if (b.wet && t >= b.until) { b.stage++; b.wet = false; save(); if (b.stage >= 3) { notify(`${CROPS[b.crop].em} Your ${CROPS[b.crop].n.toLowerCase()} don ready! Harvest am.`); } } });
  }
  function room(n) { return S.cap - stored() >= n; }
  function put(k, n) { S.store[k] = (S.store[k] || 0) + n; save(); }

  // ---- what you can do
  function plant(i, k) { const C = CROPS[k]; if (api.cash() < C.seed) { api.toast(`You need ${naira(C.seed)} for ${C.n.toLowerCase()} seeds.`); return false; }
    api.addCash(-C.seed); Object.assign(S.beds[i], { crop: k, stage: 1, wet: false, until: 0, t0: now() }); save(); refresh();
    api.toast(`${C.em} You planted ${C.n.toLowerCase()}. Now water am!`, 2.4); api.guide('farm_water'); if (built && nearYard()) { const w = bedAt(i); pop(w.x, 1.8, w.z, C.em, 'PLANTED', GCOL.plant); burstAt('plant', w.x, w.z, .2); } return true; }
  function water(i) { const b = S.beds[i]; if (!b.crop || b.wet || b.stage >= 3) return; b.wet = true; b.until = now() + CROPS[b.crop].stage * 1000; save(); refresh(); if (built && nearYard()) { const w = bedAt(i); pop(w.x, 1.8, w.z, '💧', 'WATERED', GCOL.water); burstAt('water', w.x, w.z, .3); } api.toast(`💧 Watered. ${CROPS[b.crop].n} go grow small small (${fmtT(CROPS[b.crop].stage)}).`, 2.2); }
  function harvest(i) { const b = S.beds[i], C = CROPS[b.crop]; if (!room(C.yield)) { api.toast(`Your store is full (${stored()}/${S.cap}). Sell something first.`, 2.6); return; }
    put(b.crop, C.yield); if (built && nearYard()) { const w = bedAt(i); pop(w.x, 1.9, w.z, C.em, `+${C.yield} ${C.n.toUpperCase()}`, GCOL.ready); burstAt('harvest', w.x, w.z, .5); } api.toast(`${C.em} You harvested ${C.yield} ${C.n.toLowerCase()}! It's in your store.`, 2.6); Object.assign(b, { crop: null, stage: 0, wet: false }); save(); refresh(); api.gist('harvest', { what: C.n.toLowerCase() }); if (api.ev) api.ev('farm_harvest'); }
  function buyBed(i) { const p = BED_PRICE[i]; if (api.cash() < p) { api.toast(`This land costs ${naira(p)}. Make more money first.`); return; } api.addCash(-p); S.open = i + 1; save(); refresh(); rise = { i, t: 0 }; if (built && nearYard()) { const w = bedAt(i); burstAt('buy', w.x, w.z); pop(w.x, 1.8, w.z, '🚜', 'NEW LAND', GCOL.buy); } api.toast('🚜 The land is yours! Plant something.', 2.4); }
  function buyCow() { if (S.cows.length >= MAX_COWS) return; if (api.cash() < COW_PRICE) { api.toast(`A cow costs ${naira(COW_PRICE)}.`); return; } api.addCash(-COW_PRICE); S.cows.push({ hu: 0, meals: 0 }); save(); animals(); arrive('cow'); api.toast('🐄 Your new cow don land! She dey walk into the pen.', 2.4); }
  function buyHen() { if (S.hens.length >= MAX_HENS) return; if (api.cash() < HEN_PRICE) { api.toast(`A hen costs ${naira(HEN_PRICE)}.`); return; } api.addCash(-HEN_PRICE); S.hens.push({ hu: 0, meals: 0 }); save(); animals(); arrive('hen'); api.toast('🐔 New hen for your coop!', 2.2); }
  function bigger() { const up = STORE_UP.find(([c]) => c > S.cap); if (!up) return; if (api.cash() < up[1]) { api.toast(`That costs ${naira(up[1])}.`); return; } api.addCash(-up[1]); S.cap = up[0]; save(); if (built && nearYard()) { const w = W(BARN.u, BARN.v + 4); burstAt('buy', w.x, w.z, 1); pop(w.x, 3.2, w.z, '🏚️', `STORE ${S.cap}`, GCOL.buy); } api.toast(`Your store now holds ${S.cap}.`, 2.2); }
  function claim() { if (S.got) return; S.got = true; Object.assign(S, { open: 2, cows: [{ hu: 0, meals: 0 }], hens: [{ hu: 0, meals: 0 }, { hu: 12, meals: 0 }, { hu: 24, meals: 0 }], grain: [], drops: [], lorry: { load: {} } });
    S.turf.forEach(t => { t.a = 1; t.w = 0; }); throwGrain(true); save(); flush(); animals(); refresh(); turfShow(); spawnLorry();
    api.toast('🚜 Welcome, farmer! The farm behind this gate is yours: land, a cow, three hens and your own lorry. Follow the yellow arrow: it always stands over your next job.', 5); api.gist('farm', { place: 'Farm Settlement' }); api.guide('farm_yard'); }
  function sellGate() { const load = { ...S.store }, v = Math.round(valueOf(load) * GATE_RATE); if (!v) { api.toast('Your store is empty.'); return; } S.store = {}; save(); api.addCash(v); S.earned += v; if (api.ev) api.ev('farm_sell'); api.toast(`The middleman paid ${naira(v)} for ${list(load)}. (Cheap, but quick.)`, 3.2); }
  function takeCarry() { if (S.carry) { api.toast('You are already carrying goods. Sell them at the market first.'); return; } if (!stored()) { api.toast('Your store is empty.'); return; }
    const load = {}; let n = 0; for (const k of Object.keys(S.store)) { const t = Math.min(S.store[k], CARRY_CAP - n); if (t > 0) { load[k] = t; S.store[k] -= t; n += t; } }
    S.carry = load; save(); if (MARKET) api.gps(MARKET.x, MARKET.z, { name: 'Farm produce buyer', sub: MARKET.name || 'Market' });
    api.toast(`🧺 You carry ${list(load)}. Take am to the produce buyer at ${MARKET ? MARKET.name || 'the market' : 'the market'} (GPS on).`, 3.4); hud(); }
  function sellCarry() { const load = S.carry; if (!load) return; const v = valueOf(load); S.carry = null; save(); api.addCash(v); S.earned += v; if (api.ev) api.ev('farm_sell'); hud(); api.clearGps && api.clearGps();
    api.toast(`🧺 The buyer paid you ${naira(v)} for ${list(load)}. Full price!`, 3); api.gist('market', { place: MARKET && MARKET.name || 'the market' }); }
  function hireHand() { if (handOn()) { api.toast('Your farmhand is already working.'); return; } if (api.cash() < HAND_PAY) { api.toast(`A farmhand costs ${naira(HAND_PAY)} a day.`); return; }
    api.addCash(-HAND_PAY); S.hand = now() + api.dayMs(); save(); handSpot(); if (built && nearYard()) { const w = W(0, 5.5); pop(w.x, 2.3, w.z, '👨🏾‍🌾', 'MUSA HIRED', GCOL.buy); } api.toast('👨🏾‍🌾 Musa the farmhand starts work: he waters, harvests, milks and collects eggs till tomorrow.', 3.4); }
  const handOn = () => S.hand > now();
  let handSp = null; function handSpot() { if (handSp || !built) return; if (!handOn()) return; const p = W(0, 5.5); handSp = api.spot('areaboy', p.x, p.z, yardRot + Math.PI, ['idle_1', 'phone', 'talk']); }
  let handT = 0;
  function tickHand(dt) { if (!handOn()) { if (handSp) { api.unspot(handSp); handSp = null; } return; } handSpot(); if ((handT -= dt) > 0) return; handT = 8;
    for (let i = 0; i < S.open; i++) { const st = bedState(i); if (st === 'dry') { water(i); return; } if (st === 'ready' && room(CROPS[S.beds[i].crop].yield)) { harvest(i); return; } }
    { let best = -1, ba = 2; S.turf.forEach((t, i) => { const a = turfAmt(i); if (needsWater(i) && a < ba) { ba = a; best = i; } }); if (best >= 0 && ba < .6) { waterTurf(best, true); return; } }
    if (S.drops.length && room(S.drops.length)) { for (const d of S.drops) put(d.k, 1); S.drops = []; save(); dropShow(); return; }
    if (S.grain.length < 2 && hens.some(h => h.s.hu > HUNGRY * .5) && ((S.store.maize || 0) >= 1 || api.cash() > GRAIN_COST * 5)) throwGrain(false); }

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
    S.trip = null; save(); if (truck) { api.releaseTruck(truck); truck = null; } if (net) { api.addCash(net); S.earned += net; if (api.ev) api.ev('farm_sell'); }
    api.sms(`${DRIVER} (pickup)`, `I don come back. Market price ${naira(gross)}, my transport ${naira(cut)}. Your ${naira(net)} don enter. Call me anytime!`);
    api.toast(`🚚 ${DRIVER} brought your money: ${naira(net)} (he took ${naira(cut)}).`, 3.4); }

  // ---- your own farm lorry: waits in the yard; pack the store onto it, drive it to the produce buyer, sell the load
  let lorry = null; const crates = [];
  const loaded = () => Object.values(S.lorry.load).reduce((a, b) => a + b, 0);
  function spawnLorry() { if (!built || !S.got || (lorry && api.lorryAlive(lorry))) return; const w = W(LORRY_AT.u, LORRY_AT.v); lorry = api.myLorry(w.x, w.z, yardRot); }
  function lorryFwd() { return { x: Math.cos(lorry.h), z: -Math.sin(lorry.h) }; }       // a car's nose: its local +x
  function lorryRear() { const f = lorryFwd(); return { x: lorry.x - f.x * 3.4, z: lorry.z - f.z * 3.4 }; }
  const lorryNear = (P, r) => lorry && api.lorryAlive(lorry) && Math.hypot(lorry.x - P.x, lorry.z - P.z) < r;
  function packLorry() {
    if (!stored()) { api.toast('Your store is empty. Pick the milk and eggs, harvest your crops.'); return; }
    const room2 = LORRY_CAP - loaded(); if (room2 <= 0) { api.toast(`Your lorry is full (${LORRY_CAP}). Drive am go market!`); return; }
    const moved = {}; let n = 0; for (const k of Object.keys(S.store)) { const t = Math.min(S.store[k], room2 - n); if (t > 0) { moved[k] = t; S.store[k] -= t; S.lorry.load[k] = (S.lorry.load[k] || 0) + t; n += t; } }
    save(); flush(); cratesShow(); if (lorry) { const r = lorryRear(); pop(r.x, 2.4, r.z, '📦', `+${n} ON LORRY`, GCOL.buy); }
    if (MARKET) api.gps(MARKET.x, MARKET.z, { name: 'Farm produce buyer', sub: MARKET.name || 'Market' });
    api.toast(`📦 You packed ${list(moved)} into your lorry (${loaded()}/${LORRY_CAP}). Drive to the produce buyer at ${MARKET && MARKET.name || 'the market'} (GPS on).`, 3.6); api.guide && api.guide('farm_lorry'); }
  function sellLorry() { const load = S.lorry.load, v = valueOf(load); if (!v) return; const what = list(load); S.lorry.load = {}; save(); flush(); cratesShow(); api.addCash(v); S.earned += v; if (api.ev) api.ev('farm_sell'); api.clearGps && api.clearGps();
    api.toast(`🚚 The buyer bought your whole lorry load: ${what}. ${naira(v)} for you, full price!`, 3.6); api.gist('market', { place: MARKET && MARKET.name || 'the market' }); }
  function cratesShow() { const n = Math.min(24, Math.ceil(loaded() / 2)); pool(crates, 'crate', n); }
  function tickCrates() {   // the crates ride on the lorry's back: 3 across, 4 along, 2 high
    if (!lorry || !crates.length) return; const alive = api.lorryAlive(lorry); const f = lorryFwd(), sx = Math.sin(lorry.h), sz = Math.cos(lorry.h);
    crates.forEach((o, i) => { if (!o.visible) return; if (!alive) { o.visible = false; return; }
      const layer = Math.floor(i / 12), k = i % 12, lx = -.4 - Math.floor(k / 3) * .66, lz = ((k % 3) - 1) * .66;
      o.position.set(lorry.x + f.x * lx + sx * lz, (lorry.y || 0) + 1.04 + layer * .36, lorry.z + f.z * lx + sz * lz); o.rotation.y = lorry.h - Math.PI / 2; }); }

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
      st.textContent = '.farmhud{margin-top:5px;width:max-content;max-width:min(380px,48vw);white-space:pre-line;background:rgba(10,12,16,.5);color:#F7EFDF;border:1px solid rgba(242,183,5,.45);border-radius:10px;padding:4px 10px;font:600 12.5px/1.25 "Barlow Semi Condensed",system-ui,sans-serif;pointer-events:none}.farmhud[hidden]{display:none}';
      document.head.append(st); (document.querySelector('.hud .tl') || document.querySelector('.hud') || document.body).append(hudEl); }   // (on the left with your task: never over the road)
    let t = '';
    if (WORK) { const k = Math.round(Math.min(1, WORK.t / WORK.d) * 10); t = `${WORK_TXT[WORK.kind]}…  ${'▰'.repeat(k)}${'▱'.repeat(10 - k)}`; }
    else if (S.carry) t = `🧺 ${list(S.carry)} · sell to the farm produce buyer`;
    else if (lorry && api.driving(lorry) && loaded()) t = `🚚 ${loaded()} in your lorry · drive to the produce buyer`;
    else if (S.got && inYardNow()) { const hc = S.cows.filter(c => c.hu >= HUNGRY).length, hh = S.hens.filter(c => c.hu >= HUNGRY).length, st = [...S.cows, ...S.hens].some(c => c.hu >= THIN);
      if (hc || hh || S.drops.length) t = `${st ? '⚠️ ' : ''}🌿 grass ${grassLeft()}/12${hc ? ` · 🐄 ${hc} hungry` : ''}${hh ? ` · 🐔 ${hh} hungry` : ''}${S.drops.length ? ` · ${S.drops.length} to pick` : ''}`;
      if (NEXT) t = '👉 ' + NEXT.t + (t ? '\n' + t : ''); }
    else if (!S.got && NEXT && api.walking()) t = '👉 ' + NEXT.t;
    hudEl.hidden = !t; if (t) hudEl.textContent = t; }
  const inYardNow = () => { const p = api.player(), l = L(p.x, p.z); return Math.abs(l.u) < YARD.u + 2 && Math.abs(l.v) < YARD.v + 2; };

  // ---------------------------------------------------------------- what is near you, and E
  let here = null;
  const near = (p, x, z, r) => Math.hypot(p.x - x, p.z - z) < r;
  function findHere() {
    const p = api.player(); here = null; if (!built) return;
    if (!api.walking() || WORK) return;
    if (MARKET && loaded() && near(p, MARKET.x, MARKET.z, 8) && lorryNear(MARKET, 40)) { here = { t: `Sell your lorry load to the buyer (${naira(valueOf(S.lorry.load))})`, act: sellLorry }; return; }
    if (MARKET && S.carry && near(p, MARKET.x, MARKET.z, 6)) { here = { t: `Sell your farm produce (${naira(valueOf(S.carry))})`, act: sellCarry }; return; }
    if (S.got && lorry && api.lorryAlive(lorry) && Math.hypot(lorry.x - YC.x, lorry.z - YC.z) < kd + 25) { const r = lorryRear();
      if (near(p, r.x, r.z, 2.4)) { here = { t: stored() ? `Pack your produce onto the lorry (${Math.min(stored(), LORRY_CAP - loaded())}) · lorry ${loaded()}/${LORRY_CAP}` : `Your lorry · ${loaded() ? list(S.lorry.load) : 'empty'}`, act: () => stored() && loaded() < LORRY_CAP ? work('pack', r.x, r.z, packLorry) : stored() ? packLorry() : api.toast(loaded() ? 'Drive your lorry to the produce buyer and sell the load.' : 'Pick milk and eggs, harvest crops, then pack them onto the lorry here.', 2.6) }; return; } }
    { const h = npcHere(p); if (h) { here = h; return; } }
    if (cust && near(p, cust.x, cust.z, 3.4)) { const has = S.store[cust.k] || 0; here = { t: has >= cust.n ? `Sell ${cust.n} ${GOODS[cust.k].n.toLowerCase()} to ${cust.who} · ${naira(cust.pay)}` : `${cust.who} wants ${cust.n} ${GOODS[cust.k].n.toLowerCase()} · you have ${has}`, act: custSell }; return; }
    if (Math.hypot(p.x - YC.x, p.z - YC.z) > kd + 30) return;
    if (near(p, OFFICE.x, OFFICE.z, 5.5) || near(p, SG.x, SG.z, 3.2)) { here = { t: S.got ? 'Farm office: workers, pickup, prices' : 'Talk to the farm officer (free farm!)', act: officeMenu }; return; }
    const l = L(p.x, p.z); if (Math.abs(l.u) > YARD.u + 1 || Math.abs(l.v) > YARD.v + 1) return;
    if (!S.got) { if (Math.abs(l.v - GATE_V) < 4 && Math.abs(l.u) < 4) here = { t: 'Talk to the farm officer at the settlement gate first', act: () => api.gps(OFFICE.x, OFFICE.z, { name: 'Farm office' }) }; return; }
    // beds
    for (let i = 0; i < 8; i++) { const b = BEDS[i], du = Math.abs(l.u - b.u), dv = Math.abs(l.v - b.v); if (du > 2.6 || dv > 2.1) continue;
      const st = bedState(i), s = S.beds[i], C = s.crop && CROPS[s.crop];
      if (st === 'locked') here = { t: i === S.open ? `Buy this land · ${naira(BED_PRICE[i])}` : 'Buy the land next to it first', act: () => i === S.open && buyBed(i) };
      else if (st === 'empty') here = { t: 'Plant a crop here', act: () => seedMenu(i) };
      else if (st === 'dry') here = { t: `Water the ${C.n.toLowerCase()}`, act: () => { const w = bedAt(i); work('water', w.x, w.z, () => water(i), { bed: i }); } };
      else if (st === 'growing') here = { t: `${C.em} ${C.n} growing · ${fmtT((s.until - now()) / 1000)}${s.stage === 1 ? ' (then water again)' : ''}`, act: () => api.toast(handOn() ? 'Musa the farmhand go water am when e need.' : 'Wait small. When it needs water again, come water am.') };
      else here = { t: `Harvest ${C.n.toLowerCase()} (${C.yield})`, act: () => { if (!room(C.yield)) { api.toast(`Your store is full (${stored()}/${S.cap}). Pack it onto your lorry first.`, 2.6); return; } const w = bedAt(i); work('harvest', w.x, w.z, () => harvest(i), { bed: i, crop: s.crop }); } };
      return; }
    const nearPen = Math.abs(l.u - PEN.u) < 5.6 && Math.abs(l.v - PEN.v) < 4.2, nearCoop = Math.abs(l.u - COOP.u) < 2.8 && Math.abs(l.v - COOP.v) < 3.2;
    if (nearPen) {   // the grass tile you stand on (or next to) that needs water
      let bi = -1, bd = 1.9; TILES.forEach((t, i) => { if (!needsWater(i)) return; const d = Math.hypot(l.u - t.u, l.v - t.v); if (d < bd) { bd = d; bi = i; } });
      if (bi >= 0) { const a = turfAmt(bi); here = { t: a < .08 ? '💧 Water the bare ground (grass go grow back)' : `💧 Water the grass (${Math.round(a * 100)}%)`, act: () => { const w = W(TILES[bi].u, TILES[bi].v); work('grass', w.x, w.z, () => waterTurf(bi), { tile: bi }); } }; return; }
      here = { t: `Cow pen · grass ${grassLeft()}/12 · ${S.cows.length} cow${S.cows.length === 1 ? '' : 's'}`, act: penMenu }; return; }
    if (nearCoop) { here = S.grain.length < GRAIN_MAX ? { t: `🌽 Throw grain for the hens (${(S.store.maize || 0) >= 1 ? '1 maize' : naira(GRAIN_COST)})`, act: () => { if ((S.store.maize || 0) < 1 && api.cash() < GRAIN_COST) { api.toast(`A bowl of grain costs ${naira(GRAIN_COST)}.`); return; } const w = W(RUN.u, RUN.v); work('grain', w.x, w.z, () => throwGrain(false)); } } : { t: `Chicken coop · ${S.hens.length} hens`, act: coopMenu }; return; }
    if (Math.abs(l.u - BARN.u) < 4.6 && l.v > BARN.v + 2 && l.v < BARN.v + 6.5) { here = { t: `Your store (${stored()}/${S.cap})`, act: storeMenu }; return; }
  }

  // ---------------------------------------------------------------- showing the farmer what to do
  // a sign over every bed (🌱 plant · 💧 water · ⏳ growing, with a bar · 🧺 harvest), 💧 over grass that needs water,
  // a yellow arrow over the next job, and the work takes a moment: you bend down, the water pours, the soil flies, a bar fills
  const rrect = (g, x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
  function signSprite(w = 1.35, h = .5) { const c = document.createElement('canvas'); c.width = 256; c.height = 96; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, fog: false, transparent: true, depthWrite: false })); sp.scale.set(w, h, 1); sp.layers.set(1); sp.visible = false; sp.renderOrder = 3; scene.add(sp); sp.userData = { c, t, key: '', y: 0, bob: false }; return sp; }
  function drawSign(sp, em, txt, col, frac = null) { const key = em + txt + col + (frac == null ? '' : Math.round(frac * 40)); if (sp.userData.key === key) return; sp.userData.key = key;
    const { c, t } = sp.userData, g = c.getContext('2d'); g.clearRect(0, 0, 256, 96);
    g.fillStyle = 'rgba(12,14,18,.84)'; rrect(g, 6, 6, 244, 70, 20); g.fill(); g.lineWidth = 5; g.strokeStyle = col; rrect(g, 6, 6, 244, 70, 20); g.stroke();
    g.beginPath(); g.moveTo(114, 76); g.lineTo(128, 93); g.lineTo(142, 76); g.closePath(); g.fillStyle = col; g.fill();
    g.textBaseline = 'middle'; g.textAlign = 'center'; g.font = '40px serif'; g.fillStyle = '#fff'; g.fillText(em, 46, 42);
    g.textAlign = 'left'; g.font = 'bold 30px "Barlow Semi Condensed",system-ui,sans-serif'; g.fillText(txt, 80, frac == null ? 42 : 31, 162);
    if (frac != null) { g.fillStyle = 'rgba(255,255,255,.22)'; rrect(g, 80, 50, 152, 13, 6); g.fill(); g.fillStyle = col; rrect(g, 80, 50, Math.max(13, 152 * Math.min(1, frac)), 13, 6); g.fill(); }
    t.needsUpdate = true; }
  const GCOL = { plant: '#7bc043', water: '#3aa0ff', grow: '#f2b705', ready: '#ff8a1f', feed: '#e0a020', buy: '#f2b705', buyer: '#e85d9a' };
  const bedSigns = [], turfSigns = [], pops = []; let coopSign = null, workSign = null, custSign = null, arrow = null, NEXT = null, guideT = 0;
  const bedAt = i => W(BEDS[i].u, BEDS[i].v);
  function bedFrac(b) { const C = CROPS[b.crop]; if (!C) return 0; const run = b.wet ? 1 - Math.max(0, (b.until - now()) / (C.stage * 1000)) : 0; return Math.min(1, ((b.stage - 1) + run) / 2); }
  const DROP_MAT = (() => { const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.arc(48, 44, 36, 0, Math.PI * 2); g.fill(); g.lineWidth = 6; g.strokeStyle = GCOL.water; g.stroke();
    g.beginPath(); g.moveTo(38, 76); g.lineTo(48, 94); g.lineTo(58, 76); g.fillStyle = 'rgba(255,255,255,.92)'; g.fill();
    g.font = '44px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('💧', 48, 46);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.SpriteMaterial({ map: t, fog: false, transparent: true, depthWrite: false }); })();
  function signsTick(dFarm) {
    const show = built && S.got && dFarm < 75;
    for (let i = 0; i < 8; i++) { const sp = bedSigns[i] || (bedSigns[i] = signSprite()); const st = show ? bedState(i) : 'locked', b = S.beds[i], C = b.crop && CROPS[b.crop];
      sp.visible = st !== 'locked' && !(WORK && WORK.bed === i); if (!sp.visible) continue;
      if (st === 'empty') drawSign(sp, '🌱', 'PLANT', GCOL.plant);
      else if (st === 'dry') drawSign(sp, '💧', b.stage > 1 ? 'WATER AGAIN' : 'WATER', GCOL.water);
      else if (st === 'growing') { const r = (b.until - now()) / 1000, q = r > 60 ? 15 : 5; drawSign(sp, C.em, fmtT(Math.ceil(r / q) * q) + (b.stage === 1 ? ' · water again' : ' · ripe'), GCOL.grow, Math.round(bedFrac(b) * 20) / 20); }
      else drawSign(sp, '🧺', 'HARVEST', GCOL.ready);
      const w = bedAt(i); sp.userData.y = b.crop && b.stage >= 2 ? 2.25 : 1.45; sp.userData.bob = st !== 'growing'; sp.position.set(w.x, sp.userData.y, w.z); }
    for (let i = 0; i < TILES.length; i++) { const sp = turfSigns[i] || (turfSigns[i] = (() => { const s = new THREE.Sprite(DROP_MAT); s.scale.setScalar(.55); s.layers.set(1); s.renderOrder = 3; s.visible = false; s.userData = { y: .95, bob: true }; scene.add(s); return s; })());
      sp.visible = show && needsWater(i) && turfAmt(i) < .6 && !(WORK && WORK.tile === i); if (sp.visible) { const w = W(TILES[i].u, TILES[i].v); sp.position.set(w.x, .95, w.z); } }
    { const sp = coopSign || (coopSign = signSprite()); sp.visible = show && S.grain.length < 2 && hens.some(a => !a.dead && a.s.hu >= HUNGRY * .6) && !(WORK && WORK.kind === 'grain');
      if (sp.visible) { drawSign(sp, '🌽', 'FEED HENS', GCOL.feed); const w = W(COOP.u, COOP.v + 2.3); sp.userData.y = 2.5; sp.userData.bob = true; sp.position.set(w.x, 2.5, w.z); } }
    { const sp = custSign || (custSign = signSprite(1.6, .6)); sp.visible = !!cust && dFarm < 90; if (sp.visible) { drawSign(sp, '🛒', `BUYER · ${cust.n} ${GOODS[cust.k].em}`, GCOL.buyer); sp.userData.y = 2.45; sp.userData.bob = true; sp.position.set(cust.x, 2.45, cust.z); } }
  }
  function signsBob() { const k = Math.sin(clock * 3.2) * .07;
    for (const sp of [...bedSigns, ...turfSigns, coopSign, custSign]) if (sp && sp.visible && sp.userData.bob) sp.position.y = sp.userData.y + k; }

  // ---- the next job, and the yellow arrow over it
  function arrowMake() { const m = new THREE.MeshBasicMaterial({ color: 0xF2B705, fog: false }), g = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.34, .66, 18), m); cone.rotation.x = Math.PI; cone.position.y = .33; const stem = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .55, 12), m); stem.position.y = .9; g.add(cone, stem);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.6, .8, 32), new THREE.MeshBasicMaterial({ color: 0xF2B705, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false, fog: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = .05;
    const root = new THREE.Group(); root.add(g, ring); root.userData = { g, ring }; root.traverse(o => o.layers.set(1)); root.visible = false; scene.add(root); return root; }
  function nextStep() {
    const p = api.player(), nearest = (pts) => { let b = null, bd = 1e9; for (const q of pts) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; b = q; } } return b; };
    if (!S.got) { const o = W(-10, kd - hwR - 11.5 + 2.3); return Math.hypot(p.x - SG.x, p.z - SG.z) < 90 ? { t: 'Talk to the farm officer by the gate: your free farm is waiting', x: o.x, z: o.z, y: 2.4 } : null; }
    if (cust && (S.store[cust.k] || 0) >= cust.n) return { t: `A buyer is at your gate: sell ${cust.n} ${GOODS[cust.k].n.toLowerCase()} for ${naira(cust.pay)}`, x: cust.x, z: cust.z, y: 3 };
    if (S.drops.length) { const d = nearest(S.drops.map(d => ({ ...W(d.u, d.v), k: d.k }))); return { t: `Pick up the ${d.k === 'milk' ? 'jar of milk' : 'egg'}: just walk over it`, x: d.x, z: d.z, y: 1.3 }; }
    if (S.grain.length < 2 && hens.some(a => !a.dead && a.s.hu >= HUNGRY * .6)) { const w = W(COOP.u, COOP.v + 2.3); return { t: 'Your hens are hungry: stand by the coop and throw grain', x: w.x, z: w.z, y: 3.2 }; }
    { const hc = cows.some(a => !a.dead && a.s.hu >= HUNGRY * .6); if (hc || grassLeft() < 5) { const ts = TILES.map((q, i) => ({ ...W(q.u, q.v), i })).filter(q => needsWater(q.i) && turfAmt(q.i) < .6), q = nearest(ts);
      if (q) return { t: hc ? 'Your cow is hungry: water the bare grass in the pen' : 'Water the bare grass in the pen so the cow get food', x: q.x, z: q.z, y: 1.7 }; } }
    for (let i = 0; i < S.open; i++) if (bedState(i) === 'ready') { const w = bedAt(i); return room(CROPS[S.beds[i].crop].yield) ? { t: `Harvest your ${CROPS[S.beds[i].crop].n.toLowerCase()}`, ...w, y: 3 } : { t: 'Your store is full: pack it onto your lorry, then harvest', ...(lorry && api.lorryAlive(lorry) ? lorryRear() : W(BARN.u, BARN.v + 4)), y: 3 }; }
    for (let i = 0; i < S.open; i++) if (bedState(i) === 'dry') return { t: `Water the ${CROPS[S.beds[i].crop].n.toLowerCase()}`, ...bedAt(i), y: S.beds[i].stage >= 2 ? 3 : 2.3 };
    for (let i = 0; i < S.open; i++) if (bedState(i) === 'empty') return { t: 'Plant a crop on the empty bed', ...bedAt(i), y: 2.3 };
    if (stored() && lorry && api.lorryAlive(lorry) && loaded() < LORRY_CAP && lorryNear(YC, kd + 25)) return { t: `Pack your store (${stored()}) onto the back of your lorry`, ...lorryRear(), y: 2.6 };
    if (loaded()) return { t: `Drive your lorry (${loaded()}) to the produce buyer and sell`, ...(lorry && api.lorryAlive(lorry) ? { x: lorry.x, z: lorry.z, y: 4.6 } : {}) };
    if (S.open < 8 && api.cash() >= BED_PRICE[S.open] + 2000) return { t: `Buy more land (${naira(BED_PRICE[S.open])}): more crops, more money`, ...bedAt(S.open), y: 2.3 };
    let soon = 1e9; S.beds.forEach((b, i) => { if (i < S.open && bedState(i) === 'growing') soon = Math.min(soon, (b.until - now()) / 1000); });
    return { t: soon < 1e9 ? `All done for now. Next job in ${fmtT(soon)}` : 'All done for now' };
  }
  function arrowTick(dt, dFarm) {
    if ((guideT -= dt) <= 0) { guideT = .4; NEXT = built ? nextStep() : null; }
    const A = arrow || (arrow = arrowMake()), on = !!(NEXT && NEXT.x != null && dFarm < 80 && api.walking() && !WORK && (S.got || Math.hypot(api.player().x - SG.x, api.player().z - SG.z) < 90));
    A.visible = on; if (!on) return;
    A.position.set(NEXT.x, 0, NEXT.z); const { g, ring } = A.userData; g.position.y = (NEXT.y || 2.4) + Math.abs(Math.sin(clock * 3.4)) * .32; g.rotation.y += dt * 2.2;
    const k = (clock * .9) % 1; ring.scale.setScalar(.7 + k * .8); ring.material.opacity = .85 * (1 - k);
  }

  // ---- doing the work: a moment bent over it, bits flying, a bar filling
  let WORK = null;
  const WORK_T = { water: 1.4, plant: 1.7, harvest: 1.6, grass: 1.2, grain: 1.1, pack: 1.8 };
  const WORK_TXT = { water: '💧 Watering', plant: '🌱 Planting', harvest: '🧺 Harvesting', grass: '💧 Watering the grass', grain: '🌽 Throwing grain', pack: '📦 Packing the lorry' };
  const CROP_COL = { tomato: '#e53b2c', pepper: '#c0261b', maize: '#f2c94c', cassava: '#d9b48a', yam: '#8a5a3c' };
  function work(kind, x, z, fn, o = {}) { if (WORK) return; const p = api.player(); WORK = { kind, x, z, fn, t: 0, d: WORK_T[kind] || 1.3, px: p.x, pz: p.z, acc: 0, ...o };
    api.face && api.face(x, z); if (kind !== 'grain' && kind !== 'pack') api.kneel && api.kneel(true); api.sfx && api.sfx(kind); here = null; }
  function workTick(dt) { if (!WORK) return; const w = WORK, p = api.player();
    if (!api.walking() || Math.hypot(p.x - w.px, p.z - w.pz) > .9) { WORK = null; api.kneel && api.kneel(false); if (workSign) workSign.visible = false; return; }   // walked off: stopped
    w.t += dt; w.acc += dt; const ws = workSign || (workSign = signSprite(1.5, .56)); drawSign(ws, WORK_TXT[w.kind].split(' ')[0], WORK_TXT[w.kind].split(' ').slice(1).join(' ').toUpperCase() || 'WORKING', '#F2B705', w.t / w.d);
    ws.visible = true; ws.position.set(w.x, w.kind === 'pack' ? 2.6 : 1.7, w.z);
    while (w.acc > .03) { w.acc -= .03; spray(w.kind, w.x, w.z, w.crop); }
    if (w.t >= w.d) { WORK = null; ws.visible = false; api.kneel && api.kneel(false); w.fn(); } }
  // little bits: water drops, soil, leaves, grain, confetti (a pool of sprites, all one white dot tinted)
  let DOT = null; const PM = {}, BITS = [];
  const pm = col => PM[col] || (PM[col] = new THREE.SpriteMaterial({ map: DOT || (DOT = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 1, 16, 16, 15);
    gr.addColorStop(0, '#fff'); gr.addColorStop(.55, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })()), color: new THREE.Color(col), transparent: true, depthWrite: false, fog: false }));
  function bit(x, y, z, vx, vy, vz, col, life, size, grav = 9) { let p = BITS.find(q => !q.on); if (!p) { if (BITS.length >= 90) return; const s = new THREE.Sprite(pm(col)); s.layers.set(1); s.renderOrder = 2; scene.add(s); p = { s }; BITS.push(p); }
    p.s.material = pm(col); Object.assign(p, { on: true, x, y, z, vx, vy, vz, t: 0, life, size, grav }); p.s.visible = true; p.s.scale.setScalar(size); p.s.position.set(x, y, z); }
  function bitsTick(dt) { for (const p of BITS) { if (!p.on) continue; p.t += dt; if (p.t >= p.life) { p.on = false; p.s.visible = false; continue; }
    p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < .04) { p.y = .04; p.vy = 0; p.vx *= .4; p.vz *= .4; }
    const k = p.t / p.life; p.s.scale.setScalar(p.size * (1 - k * k)); p.s.position.set(p.x, p.y, p.z); } }
  const rnd = (a, b) => a + Math.random() * (b - a);
  function spray(kind, x, z, crop) { const p = api.player();
    if (kind === 'water' || kind === 'grass') { const r = kind === 'water' ? 1.5 : .9; for (let n = 0; n < 2; n++) bit(x + rnd(-r, r), rnd(1.1, 1.6), z + rnd(-r * .6, r * .6), rnd(-.2, .2), rnd(-1.5, -.5), rnd(-.2, .2), rnd(0, 1) < .7 ? '#6ec3ff' : '#d8f0ff', .75, rnd(.13, .2)); }   // a shower over the bed, all round you (in front of you, your body would hide it)
    else if (kind === 'plant') bit(x + rnd(-.7, .7), .1, z + rnd(-.5, .5), rnd(-.8, .8), rnd(1.6, 2.8), rnd(-.8, .8), rnd(0, 1) < .6 ? '#6b4a2e' : '#8a6440', .8, rnd(.14, .24));
    else if (kind === 'harvest') bit(x + rnd(-.7, .7), .4, z + rnd(-.5, .5), rnd(-.9, .9), rnd(2, 3.2), rnd(-.9, .9), rnd(0, 1) < .5 ? '#4caf3a' : CROP_COL[crop] || '#f2c94c', .8, rnd(.16, .26));
    else if (kind === 'grain') { const dx = x - p.x, dz = z - p.z, d = Math.max(.5, Math.hypot(dx, dz)); bit(p.x + rnd(-.1, .1), 1.15, p.z + rnd(-.1, .1), dx / d * rnd(1.8, 3) + rnd(-.5, .5), rnd(1.5, 2.6), dz / d * rnd(1.8, 3) + rnd(-.5, .5), rnd(0, 1) < .8 ? '#f2c94c' : '#e0a020', 1, rnd(.1, .15)); }
    else if (kind === 'pack') bit(x + rnd(-.6, .6), rnd(.3, 1), z + rnd(-.6, .6), rnd(-.4, .4), rnd(.6, 1.4), rnd(-.4, .4), '#c8a46a', .7, rnd(.2, .32), 1); }
  function burstAt(kind, x, z, y = .4) { const cols = kind === 'buy' ? ['#F2B705', '#7bc043', '#3aa0ff', '#ff5a36', '#ffffff'] : kind === 'water' ? ['#6ec3ff', '#d8f0ff'] : kind === 'plant' ? ['#6b4a2e', '#8a6440', '#7bc043'] : ['#4caf3a', '#f2c94c', '#ff8a1f'];
    for (let i = 0; i < 18; i++) { const a = Math.random() * Math.PI * 2, s = rnd(.8, 2.2); bit(x, y, z, Math.cos(a) * s, rnd(2.4, 4.4), Math.sin(a) * s, cols[i % cols.length], 1.2, rnd(.15, .26), 6); } }
  function pop(x, y, z, em, txt, col = GCOL.plant) { let sp = pops.find(s => !s.visible); if (!sp) { if (pops.length >= 4) sp = pops[0]; else { sp = signSprite(1.3, .48); pops.push(sp); } }
    drawSign(sp, em, txt, col); sp.visible = true; sp.material.opacity = 1; sp.userData.pt = 0; sp.userData.y0 = y; sp.position.set(x, y, z); }
  function popsTick(dt) { for (const sp of pops) { if (!sp.visible) continue; const u = sp.userData; u.pt += dt; sp.position.y = u.y0 + u.pt * .7; sp.material.opacity = 1 - Math.max(0, (u.pt - 1.1) / .6); if (u.pt > 1.7) sp.visible = false; } }
  const nearYard = () => { const p = api.player(); return Math.hypot(p.x - YC.x, p.z - YC.z) < 80; };
  // a new bed of land comes up out of the ground; a new animal walks in
  let rise = null;
  function riseTick(dt) { if (!rise) return; rise.t += dt; const b = beds[rise.i], k = Math.min(1, rise.t / 1.3); if (b && b.base) b.base.scale.y = .35 + .65 * (1 - Math.pow(1 - k, 3)); if (k < 1 && Math.random() < .5) { const w = bedAt(rise.i); bit(w.x + rnd(-1.6, 1.6), .1, w.z + rnd(-1, 1), rnd(-.5, .5), rnd(1, 2), rnd(-.5, .5), '#8a6440', .7, rnd(.16, .26)); } if (k >= 1) rise = null; }
  function arrive(kind) { const L0 = kind === 'cow' ? cows : hens, a = L0[L0.length - 1]; if (!a) return; const from = kind === 'cow' ? W(PEN.u, PEN.v + 6.5) : W(COOP.u, COOP.v + 3.2), to = kind === 'cow' ? W(PEN.u, PEN.v - .3) : W(RUN.u, RUN.v);
    Object.assign(a, { x: from.x, z: from.z, tx: to.x, tz: to.z, h: Math.atan2(to.x - from.x, to.z - from.z), mode: 'walk', t: 18 }); a.root.position.set(a.x, 0, a.z);
    if (nearYard()) { burstAt('buy', from.x, from.z, .6); pop(from.x, kind === 'cow' ? 2.4 : 1.4, from.z, kind === 'cow' ? '🐄' : '🐔', kind === 'cow' ? '+1 COW' : '+1 HEN', GCOL.buy); } }

  // ---- buyers: orders from the market on your phone, and people who come to your gate to buy
  const BUYERS = ['Mama Nkechi (Mile 12 market)', 'Alhaji Garba (Oyingbo market)', 'Iya Bisi (buka, Idi-Oro)', 'Chef Tunde (Eko hotel kitchen)', 'Madam Joy (supermarket, Ikeja)', 'Aunty Funke (caterer)', 'Mallam Sani (Mushin market)'];
  const GATE_FOLK = [['Mama Ronke', 'mama'], ['Baba Ade', 'baba'], ['Iya Kemi', 'mama'], ['Oga Chidi', 'baba']];
  S.orders = S.orders || []; S.pay = S.pay || []; S.ordT = S.ordT || 0;
  let cust = null, custT = 75;
  const canMake = () => { const ks = Object.keys(CROPS).filter(k => S.beds.some(b => b.crop === k) || (S.store[k] || 0) > 0); if (S.cows.length) ks.push('milk'); if (S.hens.length) ks.push('egg'); return ks.length ? ks : ['tomato', 'maize', 'egg']; };
  function newOrder() { const ks = canMake(), k = ks[Math.floor(Math.random() * ks.length)], n = k === 'egg' ? 6 + Math.floor(Math.random() * 10) : 3 + Math.floor(Math.random() * 7), who = BUYERS[Math.floor(Math.random() * BUYERS.length)];
    const o = { id: now(), who, k, n, pay: Math.round(price(k) * n * 1.3 / 50) * 50, until: now() + api.dayMs() * 1.5 }; S.orders.push(o); save();
    api.sms(who.split(' (')[0], `Good day farmer! I need ${n} ${GOODS[k].n.toLowerCase()} ${GOODS[k].em}. I go pay ${naira(o.pay)}, better than market price. Send am from your Oya Farm app when you get am.`); }
  function sendOrder(o) { if ((S.store[o.k] || 0) < o.n) { api.toast(`You need ${o.n} ${GOODS[o.k].n.toLowerCase()} in your store. You have ${S.store[o.k] || 0}.`, 2.6); return; }
    S.store[o.k] -= o.n; if (!S.store[o.k]) delete S.store[o.k]; S.orders = S.orders.filter(q => q !== o); S.pay.push({ at: now() + 40000, v: o.pay, who: o.who }); save(); flush();
    api.toast(`🛵 A dispatch rider is taking ${o.n} ${GOODS[o.k].n.toLowerCase()} to ${o.who.split(' (')[0]}. The money comes when it lands.`, 3.2); }
  function ordersTick() { if (!S.got) return; const t = now();
    for (const q of S.pay.slice()) if (t >= q.at) { S.pay = S.pay.filter(x => x !== q); api.addCash(q.v); S.earned += q.v; save(); if (api.ev) api.ev('farm_sell'); api.sms(q.who.split(' (')[0], `I don receive am, fine fine goods! I don send ${naira(q.v)}. Thank you, I go order again.`); api.toast(`💰 ${q.who.split(' (')[0]} paid ${naira(q.v)} for your order.`, 2.8); }
    for (const q of S.orders.slice()) if (t > q.until) { S.orders = S.orders.filter(x => x !== q); save(); api.sms(q.who.split(' (')[0], 'I don buy from another farmer. Next time o!'); }
    if (!S.ordT) { S.ordT = t - 5 * 60000; save(); }   // the first order comes a minute after you start
    if (S.orders.length < 3 && t - S.ordT > 6 * 60000) { S.ordT = t; if (Math.random() < .8) newOrder(); save(); } }
  function custTick(dt, dFarm) { if (!S.got || !built) return;
    if (cust) { cust.t -= dt; if (cust.t <= 0 || dFarm > 130) custGo(); return; }
    if (dFarm > 70 || (custT -= dt) > 0) return; custT = 160 + Math.random() * 160;
    const have = Object.keys(S.store).filter(k => S.store[k] >= 2); if (!have.length) { custT = 40; return; }
    const k = have[Math.floor(Math.random() * have.length)], n = Math.min(S.store[k], k === 'egg' ? 4 + Math.floor(Math.random() * 8) : 2 + Math.floor(Math.random() * 5)), [who, cast] = GATE_FOLK[Math.floor(Math.random() * GATE_FOLK.length)], p = W(2.6, GATE_V + 1.7);
    cust = { k, n, who, pay: Math.round(price(k) * n * 1.15 / 10) * 10, t: 150, x: p.x, z: p.z, sp: api.spot(cast, p.x, p.z, yardRot + Math.PI, ['talk', 'idle_1', 'idle_2']) };
    notify(`🛒 ${who} don come your gate to buy ${n} ${GOODS[k].n.toLowerCase()} ${GOODS[k].em}.`); }
  function custGo() { if (!cust) return; if (cust.sp) api.unspot(cust.sp); cust = null; }
  function custSell() { const c = cust; if (!c) return; if ((S.store[c.k] || 0) < c.n) { api.toast(`${c.who}: "You no get ${c.n} ${GOODS[c.k].n.toLowerCase()}? I go wait small."`, 2.6); return; }
    S.store[c.k] -= c.n; if (!S.store[c.k]) delete S.store[c.k]; save(); api.addCash(c.pay); S.earned += c.pay; if (api.ev) api.ev('farm_sell');
    pop(c.x, 2.3, c.z, '💰', '+' + naira(c.pay), GCOL.buy); burstAt('buy', c.x, c.z, 1.2); api.toast(`${c.who} bought ${c.n} ${GOODS[c.k].n.toLowerCase()} for ${naira(c.pay)}. "Thank you, I go come back!"`, 3); custGo(); }
  const HOWTO = [
    ['🌱 Plant', 'Stand by an empty bed (🌱 sign), press E, pick a seed.'],
    ['💧 Water', 'Blue 💧 sign: press E. Water again half way. Rain waters for you.'],
    ['🧺 Harvest', 'Orange 🧺 sign: press E. It goes into your store (the barn).'],
    ['🐄 Cow', 'She eats the grass in the pen. Water the bare patches (💧) so it grows back.'],
    ['🐔 Hens', 'They eat grain: press E at the coop to throw some.'],
    ['🥛 Milk & eggs', 'Fed animals drop them on the ground: walk over them to pick.'],
    ['🚚 Sell', 'Pack the store onto the back of your lorry (E), drive to the produce buyer (GPS), press E. Or call Baba Sule, or send buyers their orders from this app.'],
    ['👉 Lost?', 'Follow the yellow arrow: it always stands over your next job.']];

  // ---------------------------------------------------------------- the panels
  function seedMenu(i) { api.openMenu('PLANT A CROP', 'Seeds from the farm office. Water after planting and once more half way.', () => Object.entries(CROPS).map(([k, C]) => ({
    name: `${C.em} ${C.n}`, sub: `Ready in ~${fmtT(C.stage * 2)} · ${C.yield} ${C.unit}s · today ${naira(price(k))} each`, btn: naira(C.seed), act: () => { api.closeMenu(); if (api.cash() < C.seed) { api.toast(`You need ${naira(C.seed)} for ${C.n.toLowerCase()} seeds.`); return; } const w = bedAt(i); work('plant', w.x, w.z, () => plant(i, k), { bed: i }); } }))); }
  function storeRows() {
    const rows = [];
    for (const [k, n] of Object.entries(S.store)) if (n > 0) rows.push({ name: `${GOODS[k].em} ${GOODS[k].n}: ${n}`, sub: `Market price today ${naira(price(k))} each · ${naira(price(k) * n)}`, btn: '·', off: true, act: () => { } });
    if (!rows.length) rows.push({ name: 'Your store is empty', sub: 'Harvest crops, milk the cow, collect eggs.', btn: '·', off: true, act: () => { } });
    const v = valueOf(S.store);
    rows.push({ name: '📦 Pack it onto your lorry', sub: `Your lorry: ${loaded()}/${LORRY_CAP}. Then drive it to the produce buyer, full price`, btn: 'PACK', off: !stored() || loaded() >= LORRY_CAP || !lorryNear(YC, kd + 25), act: () => { api.closeMenu(); packLorry(); } });
    rows.push({ name: `🚚 Send it with ${DRIVER}'s pickup`, sub: S.trip ? `He is on a trip now (${S.trip.phase})` : `Up to ${TRUCK_CAP} items to ${MARKET && MARKET.name || 'the market'}. He keeps 15% (about ${naira(Math.round(Math.min(v * .5, Math.max(300, v * DRIVER_CUT)) / 10) * 10)})`, btn: 'CALL HIM', off: !!S.trip || !stored(), act: () => { api.closeMenu(); callTruck(); } });
    rows.push({ name: '🧺 Carry it to market yourself', sub: `Up to ${CARRY_CAP} items, full price at the produce buyer`, btn: 'CARRY', off: !!S.carry || !stored(), act: () => { api.closeMenu(); takeCarry(); } });
    rows.push({ name: '🤝 Sell to the middleman here', sub: `Quick money, only 60%: ${naira(Math.round(v * GATE_RATE))}`, btn: 'SELL', off: !stored(), act: () => { sellGate(); } });
    const up = STORE_UP.find(([c]) => c > S.cap); if (up) rows.push({ name: '🏚️ Make the store bigger', sub: `Holds ${up[0]} instead of ${S.cap}`, btn: naira(up[1]), act: () => bigger() });
    return rows;
  }
  function storeMenu() { api.openMenu(`YOUR STORE · ${stored()}/${S.cap}`, 'Everything you harvest, milk and collect', storeRows); }
  const grassLeft = () => S.turf.reduce((n, t, i) => n + (turfAmt(i) > .45 ? 1 : 0), 0);
  function penMenu() { api.openMenu('COW PEN', `${S.cows.length} cow${S.cows.length === 1 ? '' : 's'} · grass ${grassLeft()}/12`, () => [
    { name: '💧 Water all the grass', sub: 'Walk round the pen and water each bare patch (E). Rain waters it for you.', btn: '·', off: true, act: () => { } },
    ...S.cows.map((c, i) => ({ name: `🐄 Cow ${i + 1}`, sub: c.hu >= THIN ? `STARVING! Dies in ${fmtT(DEAD - c.hu)}` : c.hu >= HUNGRY ? 'Hungry, looking for grass' : 'Fed and happy', warn: c.hu >= HUNGRY, btn: '·', off: true, act: () => { } })),
    { name: '🐄 Buy another cow', sub: S.cows.length >= MAX_COWS ? 'The pen is full' : 'More milk (more grass eaten too)', btn: naira(COW_PRICE), off: S.cows.length >= MAX_COWS, act: () => buyCow() }]); }
  function coopMenu() { api.openMenu('CHICKEN COOP', `${S.hens.length} hens · ${S.grain.length} grain on the ground`, () => [
    { name: '🌽 Throw grain', sub: (S.store.maize || 0) >= 1 ? `Uses 1 maize from your store (you have ${S.store.maize})` : `A bowl of grain, ${naira(GRAIN_COST)}`, btn: 'THROW', off: S.grain.length >= GRAIN_MAX, act: () => throwGrain(false) },
    { name: '🐔 Buy another hen', sub: S.hens.length >= MAX_HENS ? 'The coop is full' : 'More eggs', btn: naira(HEN_PRICE), off: S.hens.length >= MAX_HENS, act: () => buyHen() }]); }
  function officeMenu() {
    if (!S.got) { api.openMenu('FARM OFFICE', 'Officer: "Welcome to Oya Farm Settlement! Every Lagos person fit farm."', [
      { name: '🚜 Collect your free farm', sub: 'Land for 2 crop beds, 1 cow, 3 hens, a store and a farmhouse', btn: 'COLLECT', act: () => { api.closeMenu(); claim(); } },
      { name: '📖 How farming works', sub: 'Plant, water, harvest. Feed the cow and hens. Sell at the market.', btn: 'READ', act: howMenu }]); return; }
    api.openMenu('FARM OFFICE', 'Officer: "How the farm dey go?"', () => [
      { name: '📖 How farming works', sub: 'Every job, step by step', btn: 'READ', act: howMenu },
      { name: '👨🏾‍🌾 Hire Musa the farmhand', sub: handOn() ? `Working till ${new Date(S.hand).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}` : 'Waters, harvests, milks, collects eggs, feeds the animals (one game day)', btn: handOn() ? 'HIRED' : naira(HAND_PAY), off: handOn(), act: () => hireHand() },
      { name: '🐔 Buy a hen', sub: S.hens.length >= MAX_HENS ? 'The coop is full' : `${S.hens.length} hens now`, btn: naira(HEN_PRICE), off: S.hens.length >= MAX_HENS, act: () => buyHen() },
      { name: '🐄 Buy a cow', sub: S.cows.length >= MAX_COWS ? 'The pen is full' : `${S.cows.length} now`, btn: naira(COW_PRICE), off: S.cows.length >= MAX_COWS, act: () => buyCow() },
      { name: `🚚 Call ${DRIVER}'s pickup`, sub: S.trip ? `On a trip (${S.trip.phase})` : `Takes ${TRUCK_CAP} items from your store to market, keeps 15%`, btn: 'CALL', off: !!S.trip || !stored(), act: () => { api.closeMenu(); callTruck(); } },
      ...Object.keys(GOODS).map(k => ({ name: `${GOODS[k].em} ${GOODS[k].n}`, sub: `Market price today, per ${GOODS[k].unit}`, btn: naira(price(k)), off: true, act: () => { } }))]); }

  function howMenu() { api.openMenu('HOW TO FARM', 'Follow the yellow arrow: it always stands over your next job', () => HOWTO.map(([n, sub]) => ({ name: n, sub, btn: '·', off: true, act: () => { } }))); }
  // ---------------------------------------------------------------- the phone app (Oya Farm)
  function app() {
    if (!S.got) return { title: 'Oya Farm', sections: [{ rows: [{ name: 'Get your free farm', sub: 'Go to the Farm Settlement (north-east Mushin, by the lagoon) and talk to the farm officer.', btn: 'SHOW WAY', act: () => api.gps(OFFICE.x, OFFICE.z, { name: 'Farm Settlement' }) }] }] };
    const bedRows = S.beds.slice(0, S.open).map((s, i) => { const st = bedState(i), C = s.crop && CROPS[s.crop];
      return { name: `Bed ${i + 1}: ${C ? C.em + ' ' + C.n : 'empty'}`, sub: st === 'empty' ? 'Plant something' : st === 'dry' ? 'Needs water!' : st === 'growing' ? `Growing · ${fmtT((s.until - now()) / 1000)}` : 'Ready to harvest!', warn: st === 'dry' || st === 'ready' }; });
    const hc = S.cows.filter(c => c.hu >= HUNGRY).length, hh = S.hens.filter(c => c.hu >= HUNGRY).length, starving = [...S.cows, ...S.hens].some(c => c.hu >= THIN);
    return { title: 'Oya Farm', sections: [
      { h: 'Your farm', rows: [...bedRows, { name: `🐄 ${S.cows.length} cow${S.cows.length === 1 ? '' : 's'} · grass ${grassLeft()}/12`, sub: hc ? `${hc} hungry${starving ? ' · STARVING!' : ''}` : 'Fed', warn: !!hc },
        { name: `🐔 ${S.hens.length} hens · grain ${S.grain.length}`, sub: hh ? `${hh} hungry, throw grain!` : 'Fed', warn: !!hh },
        { name: `🥛🥚 On the ground`, sub: S.drops.length ? `${S.drops.length} to pick up` : 'Nothing yet', warn: !!S.drops.length },
        { name: `🚚 Your lorry ${loaded()}/${LORRY_CAP}`, sub: loaded() ? `${list(S.lorry.load)} · drive it to the produce buyer` : 'Empty' },
        { name: `🏚️ Store ${stored()}/${S.cap}`, sub: stored() ? `${list(S.store)} · worth ${naira(valueOf(S.store))}` : 'Empty' },
        { name: '👨🏾‍🌾 Farmhand', sub: handOn() ? 'Musa is working' : 'Not hired (hire at the farm office)' }] },
      { h: 'Orders from buyers', rows: [...S.orders.map(o => { const has = S.store[o.k] || 0; return { name: `${GOODS[o.k].em} ${o.n} ${GOODS[o.k].n.toLowerCase()} · ${naira(o.pay)}`, sub: `${o.who} · you have ${has}/${o.n} · ${fmtT((o.until - now()) / 1000)} left`, warn: has >= o.n, btn: 'SEND', off: has < o.n, act: () => sendOrder(o) }; }),
        ...S.pay.map(q => ({ name: `🛵 On the way to ${q.who.split(' (')[0]}`, sub: `${naira(q.v)} comes when it lands`, btn: '·', off: true })),
        ...(S.orders.length || S.pay.length ? [] : [{ name: 'No orders yet', sub: 'Market buyers text you when they need tomato, eggs, milk… They pay better than the market.', btn: '·', off: true }])] },
      { h: 'Grow your farm', rows: [
        S.open < 8 ? { name: `🚜 More land (bed ${S.open + 1})`, sub: 'One more crop bed, ready to plant', btn: naira(BED_PRICE[S.open]), off: api.cash() < BED_PRICE[S.open], act: () => buyBed(S.open) } : { name: '🚜 All your land is open', sub: '8 crop beds', btn: '·', off: true },
        { name: `🐄 Buy a cow (${S.cows.length}/${MAX_COWS})`, sub: 'More milk. She walks into your pen', btn: naira(COW_PRICE), off: S.cows.length >= MAX_COWS || api.cash() < COW_PRICE, act: () => buyCow() },
        { name: `🐔 Buy a hen (${S.hens.length}/${MAX_HENS})`, sub: 'More eggs', btn: naira(HEN_PRICE), off: S.hens.length >= MAX_HENS || api.cash() < HEN_PRICE, act: () => buyHen() },
        ...(STORE_UP.find(([c]) => c > S.cap) ? [(([c, pr]) => ({ name: `🏚️ Bigger store (${c})`, sub: `Holds ${c} instead of ${S.cap}`, btn: naira(pr), off: api.cash() < pr, act: () => bigger() }))(STORE_UP.find(([c]) => c > S.cap))] : []),
        { name: '👨🏾‍🌾 Hire Musa the farmhand', sub: handOn() ? 'Working now' : 'Waters, harvests, picks and feeds for one game day', btn: handOn() ? 'HIRED' : naira(HAND_PAY), off: handOn() || api.cash() < HAND_PAY, act: () => hireHand() }] },
      { h: 'Sell', rows: [
        { name: `🚚 ${DRIVER}'s pickup`, sub: S.trip ? `On the way (${S.trip.phase})` : 'Takes your goods to market, keeps 15%', btn: S.trip ? 'BUSY' : 'CALL', off: !!S.trip || !stored(), act: callTruck },
        { name: '🧺 You carry', sub: S.carry ? list(S.carry) : 'Pick up at your store', btn: S.carry ? 'SHOW BUYER' : 'SHOW STORE', act: () => S.carry ? api.gps(MARKET.x, MARKET.z, { name: 'Farm produce buyer' }) : api.gps(W(BARN.u, BARN.v + 4).x, W(BARN.u, BARN.v + 4).z, { name: 'Your farm store' }) }] },
      { h: 'Prices today', rows: Object.keys(GOODS).map(k => ({ name: `${GOODS[k].em} ${GOODS[k].n}`, sub: `per ${GOODS[k].unit}`, btn: naira(price(k)), off: true })) },
      { h: 'How to farm', rows: HOWTO.map(([n, sub]) => ({ name: n, sub })) },
      { rows: [{ name: 'Show the way to your farm', btn: 'GPS', act: () => api.gps(W(0, GATE_V).x, W(0, GATE_V).z, { name: 'Your farm' }) }] },
      { h: 'Credits', rows: [{ name: 'Cows and hens: 3D scans from Sketchfab (CC BY 4.0)', sub: 'Zebu by rt699448 · Holstein and hen by Hdjusj', btn: '·', off: true }] }] };
  }
  const notify = t => { if (!S.got) return; const p = api.player(); if (Math.hypot(p.x - YC.x, p.z - YC.z) < 60) api.toast(t, 2.6); };

  // ---------------------------------------------------------------- every frame
  let t1 = 0, lodT = 0;
  function update(dt) {
    if (!api.started()) return;
    const p = api.player(), dFarm = Math.hypot(p.x - YC.x, p.z - YC.z);
    if (!loading && (dFarm < 700 || S.carry || S.trip || npcNear(p)[1] < 700)) load();
    if ((t1 -= dt) <= 0) { t1 = .5; tickBeds(); tickHand(.5); ordersTick(); if (built) { signsTick(dFarm); tickTurfRain(); turfShow(); refreshSoft(); if (!lorry || !api.lorryAlive(lorry)) { if (dFarm > 90 || !lorry) spawnLorry(); } } }
    tickTruck(dt);
    if (saveT > 0 && (saveT -= dt) <= 0) flush();
    if (!built) return;
    workTick(dt); if (WORK) hud(); findHere(); bitsTick(dt); popsTick(dt); riseTick(dt); arrowTick(dt, dFarm); signsBob(); custTick(dt, dFarm);
    if ((lodT -= dt) <= 0) { lodT = .5; const far = dFarm > api.Q.lod0 * .6; for (const o of dyn) { if (o.userData.far !== far) { o.userData.far = far; if (o.visible && o.userData.lod) setGeo(o, o.userData.lod); } } }
    clock += dt; const sim = S.got && dFarm < SIM_R, vis = dFarm < 260;   // hunger runs only while you are at the farm
    for (const a of cows.slice()) { a.root.visible = vis; if (vis || sim) animalTick(a, dt, sim, dFarm < 90); }
    for (const a of hens.slice()) { a.root.visible = vis && dFarm < 160; if (a.root.visible || sim) animalTick(a, dt, sim, dFarm < 60); }
    if (dFarm < 200) tickDrops(dt); tickCrates(); tickNpcs(dt, p);
  }
  let sig = '';
  function tickTurfRain() { if (api.rain() > .3) S.turf.forEach((t, i) => { if (needsWater(i)) waterTurf(i, true); }); }
  function refreshSoft() { const s = S.beds.map((b, i) => bedState(i) + (b.crop || '') + b.stage).join() + S.open + S.got; if (s !== sig) { sig = s; refresh(); } hud(); }

  function test(c) {
    const parts = (c || '').split(':');
    if (c === 'state') return JSON.stringify({ got: S.got, open: S.open, beds: S.beds.slice(0, S.open).map((b, i) => bedState(i) + ':' + (b.crop || '')), store: S.store, cap: S.cap, trip: S.trip && S.trip.phase, carry: S.carry, built, ready, loading, left: loadLeft(), missing: STATIC.filter(n => !M[n]).concat(['cow','hen'].filter(n => !M[n])), here: here && here.t,
      turf: S.turf.map((t, i) => +turfAmt(i).toFixed(2) + (t.w ? 'w' : '')), cows: S.cows.map(c => [Math.round(c.hu), c.meals]), hens: S.hens.map(c => [Math.round(c.hu), c.meals]), grain: S.grain.length, drops: S.drops.map(d => d.k), lorry: S.lorry.load, lorryAt: lorry && { x: Math.round(lorry.x), z: Math.round(lorry.z), alive: api.lorryAlive(lorry) } });
    if (c === 'go') { const o = W(-10, kd - hwR - 11.5 + 3.6); api.teleport(o.x, o.z, ry + Math.PI); return 1; }
    if (c === 'yard') { const o = W(0, 3.4); api.teleport(o.x, o.z, ry + Math.PI); return 1; }
    if (c === 'claim') { claim(); return 1; }
    if (parts[0] === 'open') { S.open = Math.min(8, +parts[1]); save(); refresh(); return 1; }
    if (c === 'ripe') { for (const b of S.beds) if (b.crop) { b.stage = 3; b.wet = false; } refresh(); return 1; }
    if (parts[0] === 'plant') { plant(+parts[1], parts[2]); return 1; }
    if (parts[0] === 'water') { water(+parts[1]); return 1; }
    if (c === 'grow') { for (const b of S.beds) if (b.crop && b.wet) b.until = now(); for (const t of S.turf) if (t.w) t.w -= GROW * 1000; tickBeds(); turfShow(); return 1; }
    if (parts[0] === 'hunger') { for (const x of parts[1] === 'hen' ? S.hens : S.cows) x.hu = +parts[2]; return 1; }   // hunger:cow:115
    if (parts[0] === 'grass') { S.turf.forEach((t, i) => { t.a = +parts[1]; t.w = 0; }); turfShow(); return 1; }       // grass:0 eats it all
    if (parts[0] === 'wateri') { return waterTurf(+parts[1], true) ? 1 : 0; }
    if (c === 'grain') { return throwGrain(true) ? 1 : 0; }
    if (c === 'addhen' || c === 'addcow') { (c === 'addhen' ? S.hens : S.cows).push({ hu: 0, meals: 0 }); save(); animals(); return 1; }
    if (c === 'nograin') { S.grain = []; grainShow(); return 1; }
    if (parts[0] === 'drop') { const a = (parts[1] === 'egg' ? hens : cows)[0]; if (a) layDrop(parts[1], a); return 1; }
    if (c === 'pick') { const d = S.drops[0]; if (!d) return 0; const o = W(d.u, d.v); api.teleport(o.x, o.z); return 1; }
    if (c === 'pack') { packLorry(); return 1; }
    if (c === 'sell') { sellLorry(); return 1; }
    if (c === 'lorryrear') { if (!lorry) return 0; const r = lorryRear(); api.teleport(r.x, r.z); return 1; }
    if (c === 'lorrymarket') { if (!lorry || !MARKET) return 0; lorry.x = MARKET.x + 12; lorry.z = MARKET.z + 12; api.teleport(MARKET.x + 2, MARKET.z + 2, 0); return 1; }
    if (c === 'pen') { const o = W(PEN.u, PEN.v + 5.5); api.teleport(o.x, o.z, ry + Math.PI); return 1; }
    if (c === 'animals') return JSON.stringify({ cows: cows.map(a => { const l = L(a.x, a.z); return [+l.u.toFixed(1), +l.v.toFixed(1), a.mode, a.cur, Math.round(a.s.hu), +a.thin.toFixed(2), !!a.dead]; }), hens: hens.map(a => { const l = L(a.x, a.z); return [+l.u.toFixed(1), +l.v.toFixed(1), a.mode, a.cur, Math.round(a.s.hu), !!a.dead]; }) });
    if (parts[0] === 'harvest') { harvest(+parts[1]); return 1; }
    if (c === 'truck') { callTruck(); return 1; }
    if (parts[0] === 'phase' && S.trip) { S.trip.phase = parts[1]; S.trip.t = now() - (+parts[2] || 0) * 1000; return 1; }
    if (c === 'truckpos') return truck ? JSON.stringify({ x: Math.round(truck.x), z: Math.round(truck.z), sp: +truck.speed.toFixed(1), ai: !!truck.ai, goal: truck.ai && truck.ai.goal && { x: Math.round(truck.ai.goal.x), z: Math.round(truck.ai.goal.z) } }) : 'none';
    if (c === 'carry') { takeCarry(); return 1; }
    if (c === 'market') { if (MARKET) api.teleport(MARKET.x + 2, MARKET.z + 2, 0); return 1; }
    if (parts[0] === 'npc') { const n = NPCS[+parts[1]]; if (!n) return 0; const o = n.W(NL.FARMER.u, NL.FARMER.v - 2); api.teleport(o.x, o.z, n.ry + Math.PI); return 1; }   // npc:3 walks you to farm 3's farmer
    if (c === 'npcs') return JSON.stringify({ built: npcBuilt, farms: NPCS.map(n => ({ n: n.n, x: Math.round(n.x), z: Math.round(n.z), kd: Math.round(n.kd), on: n.on, cows: n.cows.length, hens: n.hens.length })) });
    if (c === 'npcbuy') { const n = NPCS.find(n => near(api.player(), n.farmer.x, n.farmer.z, 4)); if (!n) return 0; npcBuy(n); return 1; }
    if (c === 'reset') { localStorage.removeItem(KEY); return 1; }
    if (c === 'next') return JSON.stringify(NEXT);
    if (c === 'parts') return JSON.stringify(BITS.filter(p => p.on).slice(0, 4).map(p => [+p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1), +p.s.scale.x.toFixed(2), p.s.visible, p.s.parent === scene, p.s.layers.mask]).concat([[BITS.length, BITS.filter(p => p.on).length]]));
    if (c === 'work') return JSON.stringify(WORK && { kind: WORK.kind, t: +WORK.t.toFixed(2), d: WORK.d });
    if (c === 'act') { if (!here) return 0; here.act(); return 1; }
    if (c === 'order') { newOrder(); return JSON.stringify(S.orders); }
    if (c === 'orders') return JSON.stringify({ orders: S.orders, pay: S.pay });
    if (c === 'cust') { custT = 0; return 1; }
    if (c === 'custinfo') return JSON.stringify(cust && { k: cust.k, n: cust.n, x: cust.x, z: cust.z });
    if (c === 'signs') return JSON.stringify({ beds: bedSigns.map(s => s.visible && s.userData.key), turf: turfSigns.filter(s => s.visible).length, coop: !!(coopSign && coopSign.visible), arrow: !!(arrow && arrow.visible), parts: BITS.filter(p => p.on).length });
    if (c === 'buybed') { buyBed(S.open); return 1; }
    if (c === 'buycow') { buyCow(); return 1; }
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
    // for the online produce market (src/business.js): what is in your store, take some out, put some back
    store: () => ({ ...S.store }), has: () => !!S.got,
    take: (k, n) => { if ((S.store[k] || 0) < n || n <= 0) return false; S.store[k] -= n; if (!S.store[k]) delete S.store[k]; save(); return true; },
    put: (k, n) => { if (n > 0) put(k, n); },
  };
}
