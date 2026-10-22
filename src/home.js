/* ================= NAIJA HOME: furniture for your house, and arranging it yourself =================
   The catalogue was made in the user's Blender (lib/catalogue.py): assets/models/furniture.json (names, sizes, prices),
   fur_<id>.glb (one piece each, standing on the floor, its front looking down +z) and fur_thumbs.webp (the pictures).
   - NAIJA HOME on your phone: dearer than the showroom, and the delivery is extra. A van drops a big box at your door in a
     few minutes. Carry it in, open it, and put the piece where you want.
   - The NAIJA HOME showroom: the showroom price, no delivery charge; the box is waiting inside your house a little later.
   - Arranging (design mode): the camera goes up, the walls between it and the room drop, you drag furniture on the floor,
     turn it, pack it away into your store room, and bring things back out. Nothing goes through walls or other furniture.
   - Kept in your life record: deco (placed: [id, floor, x, z, turn] per house), store (unboxed, not placed), boxes
     ([id, house, ready at (ms), 'door' | 'in']).
   The houses: the estate mansions (their insides: assets/models/int_est_<type>_<floor>.glb, int_est.json, from
   lib/int_export.py: empty, kitchen and bathrooms fitted; stairs go up and down floors). */
export function createHome(A) {
  const { THREE } = A;
  const H = { cat: [], by: {}, cats: [], atlas: null, catP: null, int: null, intP: null, mdl: new Map(), boxP: null, cur: null, out: [], seen: new Set(), t: 0, dirty: 0 };
  const DELIVER_MS = 3 * 60e3, SHOP_MS = 5 * 60e3, MAX_ITEMS = 150, MAX_ALL = 300;
  const appPrice = it => Math.round(it.price * 1.2 / 500) * 500, delFee = it => Math.round((15000 + it.price * .08) / 500) * 500, appTotal = it => appPrice(it) + delFee(it);
  const CAT_NAME = { living: 'Living room', dining: 'Dining', bedroom: 'Bedroom', kitchen: 'Kitchen', luxury: 'Luxury' };
  const L = () => { const l = A.life(); if (!l.deco || typeof l.deco !== 'object') l.deco = {}; if (!l.store || typeof l.store !== 'object') l.store = {}; if (!Array.isArray(l.boxes)) l.boxes = []; return l; };
  const r2 = v => Math.round(v * 100) / 100;

  // ---------------------------------------------------------------- the catalogue and the models
  function loadCat() {
    if (H.catP) return H.catP;
    H.catP = A.json('assets/models/furniture.json').then(J => { H.cat = J.items; H.atlas = J.atlas || null; for (const it of J.items) H.by[it.id] = it; H.cats = [...new Set(J.items.map(i => i.cat))]; return J; });
    H.catP.catch(e => { console.warn('furniture', e); H.catP = null; }); return H.catP;
  }
  function loadInt() { if (H.intP) return H.intP; H.intP = A.json('assets/models/int_est.json').then(J => (H.int = J)); H.intP.catch(() => { H.intP = null; }); return H.intP; }
  function model(id) {
    if (H.mdl.has(id)) return H.mdl.get(id);
    const p = A.glb('fur_' + id).then(g => { const root = g.scene; root.traverse(o => { if (!o.isMesh) return; o.castShadow = o.receiveShadow = true; for (const m of [].concat(o.material)) { if (m.map) m.map.colorSpace = THREE.SRGBColorSpace; if (m.transparent || m.opacity < 1) { m.depthWrite = false; m.side = THREE.DoubleSide; } } }); return root; });
    p.catch(e => { console.warn('furniture model', id, e); H.mdl.delete(id); }); H.mdl.set(id, p); return p;
  }
  const boxModel = () => model('box');
  const thumbCss = (it, px) => { const a = H.atlas; if (!a || it.ti == null) return ''; const c = a.cols, r = a.rows || Math.ceil(H.cat.length / c), x = it.ti % c, y = Math.floor(it.ti / c);
    return `background:url(${A.assetUrl(a.file)}) ${-x * px}px ${-y * px}px/${c * px}px ${r * px}px no-repeat`; };

  // ---------------------------------------------------------------- buying
  function order(id, house, via) {
    if (!H.cat.length) { loadCat(); return { ok: false, msg: 'The store is still opening. Try again small time.' }; }
    const it = H.by[id], hs = A.houses().find(h => h.id === house); if (!it) return { ok: false, msg: 'We no get that one again.' }; if (!hs) return { ok: false, msg: 'That house is not yours.' };
    if (L().boxes.length >= 60) return { ok: false, msg: 'You get 60 boxes wey you never open. Open some first.' };
    const cost = via === 'app' ? appTotal(it) : it.price;
    if (!A.pay(cost)) return { ok: false, msg: `You need ${A.naira(cost)} for this.` };
    L().boxes.push([id, house, Date.now() + (via === 'app' ? DELIVER_MS : SHOP_MS), via === 'app' ? 'door' : 'in']); A.save(true); boxesChanged();
    const msg = via === 'app' ? `Order placed! The ${it.name.toLowerCase()} go reach your door in about 3 minutes.` : `Paid! Your ${it.name.toLowerCase()} go dey wait inside ${hs.short} soon.`;
    A.toast(msg, 4.5); return { ok: true, msg };
  }
  const ready = b => b[2] <= Date.now();
  function boxesChanged() { H.dirty = 1; }

  // boxes at the door (outside): a model and an E spot each, until you carry them in
  function outsideBoxes() {
    for (const o of H.out) { A.scene.remove(o.mesh); A.delDoor(o.door); } H.out.length = 0;
    const by = {}; L().boxes.forEach((b, i) => { if (b[3] === 'door' && ready(b)) (by[b[1]] = by[b[1]] || []).push(i); });
    for (const [house, list] of Object.entries(by)) {
      const at = A.doorOut(house); if (!at) continue;
      list.forEach((bi, k) => { const sx = Math.cos(at.ry), sz = -Math.sin(at.ry), fx = Math.sin(at.ry), fz = Math.cos(at.ry), off = 1.8 + (k % 4) * 1.3, row = Math.floor(k / 4) * 1.3,   // beside the path to the door, not on it
        x = at.x + sx * off + fx * (.6 + row), z = at.z + sz * off + fz * (.6 + row), b = L().boxes[bi], it = H.by[b[0]];
        const rec = { mesh: new THREE.Group(), door: { x, z, r: 1.5, label: `Carry the box inside (${it ? it.name : 'furniture'})`, act: () => carryIn(b) } };
        rec.mesh.position.set(x, 0, z); rec.mesh.rotation.y = at.ry + (k % 2 ? .3 : -.2); A.scene.add(rec.mesh); A.addDoor(rec.door); H.out.push(rec);
        boxModel().then(m => { rec.mesh.add(m.clone(true)); }).catch(() => {}); });
    }
  }
  function carryIn(b) { if (!L().boxes.includes(b)) return; A.fade(() => { b[3] = 'in'; A.save(true); boxesChanged(); });
    A.toast('You carry the heavy box inside. Open am inside your house.', 3.5); }

  // ---------------------------------------------------------------- inside your house
  const roomsOf = (info, fl) => (info ? info.rooms.filter(r => r[0] === fl && r[2] !== 'stair' && r[2] !== 'void') : []);
  function inside(ctx, x, z) {
    if (ctx.kind === 'flat') { const b = ctx.R.bounds; return x > b.x0 + .05 && x < b.x1 - .05 && z > b.z0 + .05 && z < b.z1 - .05; }
    for (const r of ctx.rooms) if (x > r[3] + .02 && x < r[5] - .02 && z > r[4] + .02 && z < r[6] - .02) return true; return false;
  }
  const cellOf = (G, base, x, z) => { const i = Math.floor((x - G.x0) / G.CS), j = Math.floor((z - G.z0) / G.CS); return i < 1 || j < 1 || i >= G.gw - 1 || j >= G.gd - 1 ? 1 : base[j * G.gw + i]; };
  function stamp(G, I) { const it = I.it, c = Math.cos(I.r), s = Math.sin(I.r), hw = it.w / 2 - .06, hd = it.d / 2 - .06, ex = Math.abs(c * hw) + Math.abs(s * hd), ez = Math.abs(s * hw) + Math.abs(c * hd);
    const i0 = Math.max(0, Math.floor((I.x - ex - G.x0) / G.CS)), i1 = Math.min(G.gw - 1, Math.floor((I.x + ex - G.x0) / G.CS)), j0 = Math.max(0, Math.floor((I.z - ez - G.z0) / G.CS)), j1 = Math.min(G.gd - 1, Math.floor((I.z + ez - G.z0) / G.CS));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dx = G.x0 + (i + .5) * G.CS - I.x, dz = G.z0 + (j + .5) * G.CS - I.z, lx = dx * c - dz * s, lz = dx * s + dz * c; if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) G.grid[j * G.gw + i] = 1; } }
  function restamp(ctx, skip = null) { const G = ctx.R.grid; if (!G || !ctx.base) return; G.grid.set(ctx.base); for (const I of ctx.items) if (I !== skip && I.it.kind !== 'rug') stamp(G, I); }
  const inRect = (I, x, z, pad = 0) => { const c = Math.cos(I.r), s = Math.sin(I.r), dx = x - I.x, dz = z - I.z; return Math.abs(dx * c - dz * s) < I.it.w / 2 - .04 + pad && Math.abs(dx * s + dz * c) < I.it.d / 2 - .04 + pad; };
  function canPlace(ctx, I, x, z, r) {
    const it = I.it, c = Math.cos(r), s = Math.sin(r), hw = it.w / 2 - .05, hd = it.d / 2 - .05, nu = Math.max(1, Math.ceil(hw * 2 / .2)), nv = Math.max(1, Math.ceil(hd * 2 / .2)), G = ctx.R.grid;
    for (let a = 0; a <= nu; a++) for (let b = 0; b <= nv; b++) { const lu = -hw + 2 * hw * a / nu, lv = -hd + 2 * hd * b / nv, px = x + lu * c + lv * s, pz = z - lu * s + lv * c;
      if (!inside(ctx, px, pz)) return false;
      if (it.kind === 'rug') continue;
      if (G && cellOf(G, ctx.base, px, pz)) return false;
      for (const O of ctx.items) if (O !== I && O.it.kind !== 'rug' && inRect(O, px, pz)) return false; }
    return true;
  }
  async function spawn(ctx, rec) {
    const it = H.by[rec[0]]; if (!it) return null; let tpl; try { tpl = await model(it.id); } catch (e) { return null; } if (H.cur !== ctx) return null;
    const o = tpl.clone(true); o.position.set(rec[2], it.kind === 'rug' ? .004 : 0, rec[3]); o.rotation.y = rec[4]; ctx.R.homeG.add(o);
    const I = { id: it.id, it, o, x: rec[2], z: rec[3], r: rec[4], fl: rec[1] }; o.traverse(m => { m.userData.home = I; }); ctx.items.push(I); restamp(ctx, DM.drag && DM.drag.I); return I;
  }
  function saveLayout(ctx) {
    const l = L(), keep = (l.deco[ctx.house] || []).filter(r => r[1] !== ctx.fl);
    l.deco[ctx.house] = keep.concat(ctx.items.map(I => [I.id, ctx.fl, r2(I.x), r2(I.z), Math.round(I.r * 1000) / 1000])).slice(0, MAX_ITEMS); A.save(true);
  }
  function addSpot(ctx, at, label, act, r = 1.4) { if (!at) return null; const s = { x: at.x, z: at.z, r, label, act, home: true }; ctx.R.spots = ctx.R.spots || []; ctx.R.spots.push(s); return s; }
  function prep(R, ctx) {
    if (!R.homeInit) { R.homeInit = true; R.homeG = new THREE.Group(); R.scene.add(R.homeG); if (ctx.kind === 'est') { R.scene.background = new THREE.Color(0xc9dcea); R.camDist = 3.0; } }
    if (R.grid && !R.homeBase) R.homeBase = R.grid.grid.slice();
    for (const o of [...R.homeG.children]) R.homeG.remove(o);
    R.spots = (R.spots || []).filter(s => !s.home);
    Object.assign(ctx, { R, items: [], boxes: [], base: R.homeBase || null, rooms: roomsOf(ctx.info, ctx.fl) });
    if (R.grid && ctx.base) R.grid.grid.set(ctx.base);
    H.cur = ctx; const M = R.marks || {};
    if (ctx.kind === 'est') {
      R.label = `${ctx.name} · ${ctx.fl === 0 ? 'downstairs' : ctx.fl === 1 ? 'upstairs' : 'top floor'}`;
      if (ctx.fl === 0 && M.door) addSpot(ctx, M.door, 'Go outside', () => leave(), 1.5);
      if (M.up) addSpot(ctx, M.up, 'Go upstairs', () => enterEst(ctx.p, ctx.fl + 1, 'down'), 1.3);
      if (M.down) addSpot(ctx, M.down, 'Go downstairs', () => enterEst(ctx.p, ctx.fl - 1, 'up'), 1.3);
    }
    for (const rec of (L().deco[ctx.house] || [])) if (rec[1] === ctx.fl) spawn(ctx, rec);
    if (ctx.fl === 0) insideBoxes(ctx);
    H.ui.arr.hidden = false;
  }
  // boxes waiting inside: in front of the door, one beside the other
  function insideBoxes(ctx) {
    for (const b of ctx.boxes) { ctx.R.homeG.remove(b.mesh); const i = ctx.R.spots.indexOf(b.spot); if (i >= 0) ctx.R.spots.splice(i, 1); } ctx.boxes = [];
    const list = L().boxes.filter(b => b[1] === ctx.house && b[3] === 'in' && ready(b)); if (!list.length) return;
    const M = ctx.R.marks || {}, d = M.door || ctx.R.marks && ctx.R.marks.spawn || { x: 0, z: 0, yaw: 0 }, fx = Math.sin(d.yaw || 0), fz = Math.cos(d.yaw || 0);
    list.forEach((b, k) => { const it = H.by[b[0]], off = (k - (list.length - 1) / 2) * 1.35; let x = d.x + fx * 2.1 + fz * off, z = d.z + fz * 2.1 - fx * off;
      if (ctx.R.nearFree) { const q = ctx.R.nearFree(x, z); x = q.x; z = q.z; }
      const mesh = new THREE.Group(); mesh.position.set(x, 0, z); mesh.rotation.y = (d.yaw || 0) + (k % 2 ? .25 : -.15); ctx.R.homeG.add(mesh); boxModel().then(m => mesh.add(m.clone(true))).catch(() => {});
      const B = { b, mesh, x, z }; B.spot = addSpot(ctx, { x, z }, `Open the box (${it ? it.name : 'furniture'})`, () => openBox(ctx, B), 1.5); ctx.boxes.push(B); });
  }
  function openBox(ctx, B) {
    const l = L(), i = l.boxes.indexOf(B.b); if (i < 0) return; l.boxes.splice(i, 1);
    const id = B.b[0]; (l.store[ctx.house] = l.store[ctx.house] || []).push(id); A.save(true);
    ctx.R.homeG.remove(B.mesh); const si = ctx.R.spots.indexOf(B.spot); if (si >= 0) ctx.R.spots.splice(si, 1); ctx.boxes.splice(ctx.boxes.indexOf(B), 1);
    A.toast('You open the box. Now put am where you want!', 3); dmStart({ place: id, at: { x: B.x, z: B.z } });
  }
  async function enterEst(p, fl = 0, at = null) {
    if (A.busy()) return; await Promise.all([loadCat(), loadInt()]).catch(() => {}); const info = H.int && H.int[p.st];
    if (!info) { A.toast('Your house no open now. Try again small time.'); return; }
    const R = await A.intGet(`int_est_${p.st}_${fl}`, fl ? null : 'Opening your house…'); if (!R) return;
    if (DM.on) dmEnd(); const hs = A.houses().find(h => h.id === p.id);
    const ctx = { kind: 'est', house: p.id, p, st: p.st, fl, info, name: hs ? hs.short : 'Your house' };
    R.onEnter = () => { R.onEnter = null; prep(R, ctx); };   // (goRoom calls it once the room is yours, under the fade)
    A.goRoom(R, at || 'door', fl === 0 && !at ? (L().boxes.some(b => b[1] === p.id && b[3] === 'in' && ready(b)) ? 'Welcome home! Your furniture box dey wait for you.' : 'Welcome home!') : null);
  }
  function enterFlat(R) { Promise.all([loadCat()]).then(() => { if (A.room() !== R) return; if (!R.grid) return; prep(R, { kind: 'flat', house: 'flat', fl: 0, info: null, name: 'Your flat' }); }).catch(() => {}); }
  function leave() { const ctx = H.cur; if (!ctx) return; if (DM.on) dmEnd(); const o = ctx.kind === 'est' ? A.estOut(ctx.p) : null; H.cur = null; H.ui.arr.hidden = true; if (o) A.leaveRoom(o); }

  // ---------------------------------------------------------------- design mode
  const DM = { on: false, sel: null, drag: null, pan: null, f: { x: 0, z: 0 }, yaw: 0, pitch: .98, dist: 9, pts: new Map(), pinch: null, keep: null, mark: null };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitV = new THREE.Vector3();
  function floorAt(e) { const r = A.canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, A.camera); return ray.ray.intersectPlane(plane, hitV) ? { x: hitV.x, z: hitV.z } : null; }
  function pickAt(e) { const ctx = H.cur; if (!ctx) return null; const r = A.canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, A.camera);
    const hits = ray.intersectObjects(ctx.R.homeG.children, true); for (const h of hits) { const I = h.object.userData.home; if (I && ctx.items.includes(I)) return I; } return null; }
  function markFor(I) { if (!DM.mark) { DM.mark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2fbf71, transparent: true, opacity: .35, depthWrite: false })); DM.mark.renderOrder = 3; }
    const m = DM.mark; if (!I) { if (m.parent) m.parent.remove(m); return; } if (m.parent !== H.cur.R.homeG) H.cur.R.homeG.add(m);
    m.scale.set(I.it.w + .12, 1, I.it.d + .12); m.position.set(I.o.position.x, .02, I.o.position.z); m.rotation.y = I.o.rotation.y; m.material.color.set(I.bad ? 0xe03131 : 0x2fbf71); }
  function select(I) { DM.sel = I; markFor(I); ui(); }
  function nearValid(ctx, I, x, z, r) { if (canPlace(ctx, I, x, z, r)) return { x, z }; for (let d = .25; d < 8; d += .25) for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (canPlace(ctx, I, px, pz, r)) return { x: px, z: pz }; } return null; }
  async function placeNew(id, at) {
    const ctx = H.cur; if (!ctx) return; const it = H.by[id]; if (!it) return; if (ctx.items.length >= MAX_ITEMS) { A.toast('The house don full! Pack something away first.'); return; }
    const st = L().store[ctx.house] || [], i = st.indexOf(id); if (i < 0) return;
    if (Object.values(L().deco).reduce((a, x) => a + x.length, 0) >= MAX_ALL) { A.toast(`You don put ${MAX_ALL} pieces for all your houses. Pack something away first.`, 3.5); return; }
    const probe = { it, x: 0, z: 0, r: DM.yaw + Math.PI }, r = Math.round(probe.r / (Math.PI / 4)) * (Math.PI / 4); const q = nearValid(ctx, probe, at.x, at.z, r);
    if (!q) { A.toast('No space for am here. Clear small space or try another room.', 3); return; }
    st.splice(i, 1); const I = await spawn(ctx, [id, ctx.fl, r2(q.x), r2(q.z), r]); if (!I) { st.push(id); return; } saveLayout(ctx); select(I); DM.f = { x: q.x, z: q.z };
  }
  function packSel() { const ctx = H.cur, I = DM.sel; if (!ctx || !I) return; ctx.items.splice(ctx.items.indexOf(I), 1); ctx.R.homeG.remove(I.o); (L().store[ctx.house] = L().store[ctx.house] || []).push(I.id); select(null); restamp(ctx); saveLayout(ctx); A.toast(`${I.it.name} packed into your store.`, 2.4); }
  function turnSel(d = 1) { const ctx = H.cur, I = DM.sel; if (!ctx || !I) return; const nr = I.r + d * Math.PI / 4; restamp(ctx, I); const q = nearValid(ctx, I, I.x, I.z, nr);
    if (!q || Math.hypot(q.x - I.x, q.z - I.z) > 1.2) { A.toast('E no fit turn there. Move am small first.', 2.2); restamp(ctx); return; }
    Object.assign(I, { x: q.x, z: q.z, r: nr }); I.o.position.set(q.x, I.o.position.y, q.z); I.o.rotation.y = nr; restamp(ctx); markFor(I); saveLayout(ctx); }
  function dmStart(opt = {}) {
    const ctx = H.cur; if (!ctx || DM.on) return; DM.on = true; ctx.R.sims = true; const P = A.player; DM.keep = { x: P.x, z: P.z, yaw: P.yaw };
    DM.f = opt.at ? { ...opt.at } : { x: P.x, z: P.z }; DM.yaw = A.camState.yaw; DM.dist = ctx.kind === 'flat' ? 6.5 : 9; DM.pitch = ctx.kind === 'flat' ? 1.1 : .98;
    const rig = A.rigRoot(); if (rig) rig.visible = false; H.ui.dm.hidden = false; H.ui.arr.hidden = true; document.body.classList.add('homedm'); if (ctx.kind === 'flat') hideHigh(ctx, true);
    select(null); if (opt.place) placeNew(opt.place, DM.f); else ui();
  }
  function dmEnd() {
    const ctx = H.cur; if (!DM.on) return; DM.on = false; DM.drag = DM.pan = DM.pinch = null; DM.pts.clear(); select(null);
    if (ctx) { ctx.R.sims = false; for (const w of ctx.R.walls || []) { w.k = 1; w.o.scale.y = 1; w.o.visible = true; } if (ctx.kind === 'flat') hideHigh(ctx, false); restamp(ctx); saveLayout(ctx);
      const P = A.player, k = DM.keep || { x: P.x, z: P.z, yaw: P.yaw }, q = ctx.R.nearFree ? ctx.R.nearFree(k.x, k.z) : k; Object.assign(P, { x: q.x, z: q.z, yaw: k.yaw, speed: 0 }); A.camState.yaw = k.yaw; }
    const rig = A.rigRoot(); if (rig) rig.visible = true; H.ui.dm.hidden = true; H.ui.arr.hidden = !ctx; document.body.classList.remove('homedm');
  }
  // the flat has a ceiling and lamps: hidden while you arrange (you look in from above)
  function hideHigh(ctx, on) { if (on) { ctx.hid = []; ctx.R.scene.traverse(o => { if (!o.isMesh || ctx.R.homeG === o.parent || o.userData.home) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); if (bb.min.y > 2.2 && o.visible) { o.visible = false; ctx.hid.push(o); } }); }
    else { for (const o of ctx.hid || []) o.visible = true; ctx.hid = null; } }
  function cam() {
    if (!DM.on || !H.cur) return false; const R = H.cur.R, b = R.bounds || { x0: -20, x1: 20, z0: -20, z1: 20 };
    DM.f.x = Math.max(b.x0, Math.min(b.x1, DM.f.x)); DM.f.z = Math.max(b.z0, Math.min(b.z1, DM.f.z));
    const t = new THREE.Vector3(DM.f.x, .3, DM.f.z), cp = Math.cos(DM.pitch);
    A.camera.position.set(t.x + Math.sin(DM.yaw) * cp * DM.dist, t.y + Math.sin(DM.pitch) * DM.dist, t.z + Math.cos(DM.yaw) * cp * DM.dist); A.camera.lookAt(t);
    if (A.camera.fov !== 50) { A.camera.fov = 50; A.camera.updateProjectionMatrix(); }
    A.player.x = DM.f.x; A.player.z = DM.f.z;   // the walls between the camera and this spot drop
    return true;
  }
  function onDown(e) {
    if (!DM.on) return; e.preventDefault(); try { H.ui.pad.setPointerCapture(e.pointerId); } catch (_) {}
    DM.pts.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button });
    if (DM.pts.size === 2) { DM.drag = DM.pan = null; const [a, c] = [...DM.pts.values()]; DM.pinch = { d: Math.hypot(a.x - c.x, a.y - c.y), ang: Math.atan2(c.y - a.y, c.x - a.x), dist: DM.dist, yaw: DM.yaw }; return; }
    const I = pickAt(e), f = floorAt(e);
    if (I && f && e.button !== 2) { select(I); restamp(H.cur, I); DM.drag = { I, ox: f.x - I.x, oz: f.z - I.z, x: I.x, z: I.z, moved: false }; return; }
    DM.pan = { x: e.clientX, y: e.clientY, f: { ...DM.f }, yaw: DM.yaw, rot: e.button === 2 || e.shiftKey, moved: false };
  }
  function onMove(e) {
    if (!DM.on) return; const p = DM.pts.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY;
    if (DM.pinch && DM.pts.size >= 2) { const [a, c] = [...DM.pts.values()], d = Math.hypot(a.x - c.x, a.y - c.y), ang = Math.atan2(c.y - a.y, c.x - a.x);
      DM.dist = Math.max(4, Math.min(16, DM.pinch.dist * DM.pinch.d / Math.max(20, d))); DM.yaw = DM.pinch.yaw - (ang - DM.pinch.ang); return; }
    const D = DM.drag;
    if (D) { const f = floorAt(e); if (!f) return; const nx = Math.round((f.x - D.ox) * 20) / 20, nz = Math.round((f.z - D.oz) * 20) / 20; D.moved = true;
      D.I.o.position.set(nx, D.I.o.position.y, nz); D.I.bad = !canPlace(H.cur, D.I, nx, nz, D.I.r); D.nx = nx; D.nz = nz; markFor(D.I); return; }
    const P = DM.pan; if (!P) return; const dx = e.clientX - P.x, dy = e.clientY - P.y; if (Math.abs(dx) + Math.abs(dy) > 4) P.moved = true;
    if (P.rot) { DM.yaw = P.yaw - dx * .008; return; }
    const k = DM.dist / Math.max(300, innerHeight) * 1.7, sy = Math.sin(DM.yaw), cy = Math.cos(DM.yaw);
    DM.f.x = P.f.x - (dx * cy + dy * sy) * k; DM.f.z = P.f.z - (-dx * sy + dy * cy) * k;
  }
  function onUp(e) {
    if (!DM.on) return; DM.pts.delete(e.pointerId); if (DM.pts.size < 2) DM.pinch = null;
    const D = DM.drag; if (D) { DM.drag = null; const ctx = H.cur, I = D.I;
      if (D.moved && !I.bad && D.nx != null) { I.x = D.nx; I.z = D.nz; saveLayout(ctx); } else if (D.moved) { I.o.position.set(I.x, I.o.position.y, I.z); A.toast('E no fit stay there. Find free floor.', 2); }
      I.bad = false; restamp(ctx); markFor(I); return; }
    if (DM.pan && !DM.pan.moved && !pickAt(e)) select(null); DM.pan = null;
  }
  function onWheel(e) { if (!DM.on) return; e.preventDefault(); DM.dist = Math.max(4, Math.min(16, DM.dist * (e.deltaY > 0 ? 1.1 : .91))); }

  // ---------------------------------------------------------------- the buttons
  const CSS = `#homeArr{position:fixed;right:max(14px,env(safe-area-inset-right));top:calc(50% - 100px);z-index:9;background:#F2B705;color:#0E1014;border:0;border-radius:14px;padding:10px 14px;font:800 15px "Barlow Semi Condensed",system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.35)}
#homeDM{position:fixed;inset:0;z-index:9;touch-action:none}
body.homedm #touch,body.homedm #mmWrap,body.homedm #prompt,body.homedm #lookhint,body.homedm #xhair,body.homedm #speedo{display:none!important}#homeDM .pad{position:absolute;inset:0;touch-action:none}
#homeDM .dock{position:absolute;left:50%;transform:translateX(-50%);bottom:max(14px,env(safe-area-inset-bottom));display:flex;flex-direction:column;align-items:center;gap:8px;max-width:96vw}
#homeDM .bar{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-width:96vw}
#homeDM .bar button{background:rgba(14,16,20,.88);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:10px 14px;font:700 15px "Barlow Semi Condensed",system-ui,sans-serif;min-width:64px}
#homeDM .bar button.ok{background:#2fbf71;color:#08130c;border:0}#homeDM .bar button:disabled{opacity:.4}
#homeDM .hint{position:absolute;top:max(12px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);background:rgba(14,16,20,.75);color:#fff;border-radius:10px;padding:6px 12px;font:600 13px system-ui,sans-serif;white-space:nowrap;max-width:94vw;overflow:hidden;text-overflow:ellipsis}
#homeDM .store{display:flex;gap:8px;overflow-x:auto;max-width:94vw;padding:6px;background:rgba(14,16,20,.82);border-radius:14px}
#homeDM .store b{display:block;color:#b4532a;font-size:11px}#homeDM .store button{flex:0 0 auto;width:84px;background:#fff;border:0;border-radius:10px;padding:4px;font:600 11px system-ui,sans-serif;color:#111}#homeDM .store i{display:block;width:76px;height:76px;margin:0 auto 2px}`;
  { const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); }
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  H.ui = {};
  H.ui.arr = el('button', null, '🛋 Arrange'); H.ui.arr.id = 'homeArr'; H.ui.arr.type = 'button'; H.ui.arr.hidden = true; H.ui.arr.addEventListener('click', e => { e.stopPropagation(); dmStart(); }); H.ui.arr.addEventListener('pointerdown', e => e.stopPropagation());
  H.ui.dm = el('div'); H.ui.dm.id = 'homeDM'; H.ui.dm.hidden = true; H.ui.pad = el('div', 'pad'); H.ui.hint = el('div', 'hint'); H.ui.store = el('div', 'store'); H.ui.bar = el('div', 'bar');
  H.ui.dock = el('div', 'dock'); H.ui.dock.append(H.ui.store, H.ui.bar); H.ui.dm.append(H.ui.pad, H.ui.hint, H.ui.dock); document.body.append(H.ui.arr, H.ui.dm);
  H.ui.pad.addEventListener('pointerdown', onDown); H.ui.pad.addEventListener('pointermove', onMove); for (const ev of ['pointerup', 'pointercancel']) H.ui.pad.addEventListener(ev, onUp);
  H.ui.pad.addEventListener('wheel', onWheel, { passive: false }); H.ui.pad.addEventListener('contextmenu', e => e.preventDefault());
  for (const ev of ['pointerdown', 'pointerup', 'click', 'touchstart']) for (const n of [H.ui.bar, H.ui.store]) n.addEventListener(ev, e => e.stopPropagation(), { passive: ev !== 'touchstart' });
  let storeOpen = false;
  function ui() {
    if (!H.cur) return; const sel = DM.sel, st = L().store[H.cur.house] || [];
    H.ui.hint.textContent = sel ? `${sel.it.name}: drag to move it` : (A.touch() ? 'Drag the floor to look around · two fingers to turn and zoom · tap a piece to pick it' : 'Drag the floor to look around · right-drag to turn · wheel to zoom · click a piece to pick it');
    H.ui.bar.textContent = '';
    const b = (t, fn, cls, off) => { const x = el('button', cls || null, t); x.type = 'button'; x.disabled = !!off; x.addEventListener('click', e => { e.stopPropagation(); fn(); }); H.ui.bar.append(x); return x; };
    if (storeOpen === 'store' && !st.length) storeOpen = false;
    b('⟲ Turn', () => turnSel(1), null, !sel); b('📦 Pack away', packSel, null, !sel); b(`🧺 Your store (${st.length})`, () => { storeOpen = storeOpen === 'store' ? false : 'store'; ui(); }, null, !st.length);
    b('🛒 Buy more', () => { storeOpen = storeOpen === 'shop' ? false : 'shop'; ui(); }); b('✓ Done', dmEnd, 'ok');
    H.ui.store.textContent = ''; H.ui.store.hidden = !storeOpen;
    if (storeOpen === 'store') { const seen = {}; for (const id of st) seen[id] = (seen[id] || 0) + 1;
      for (const [id, n] of Object.entries(seen)) { const it = H.by[id]; if (!it) continue; const x = el('button'), im = el('i'); im.style.cssText = thumbCss(it, 76); x.append(im, el('span', null, it.name + (n > 1 ? ` ×${n}` : ''))); x.type = 'button';
        x.addEventListener('click', e => { e.stopPropagation(); storeOpen = false; placeNew(id, { ...DM.f }); }); H.ui.store.append(x); } }
    if (storeOpen === 'shop') for (const it of H.cat) { const x = el('button'), im = el('i'); im.style.cssText = thumbCss(it, 76); x.append(im, el('span', null, it.name), el('b', null, A.naira(appTotal(it)))); x.type = 'button';
      x.addEventListener('click', e => { e.stopPropagation(); const ctx = H.cur; if (!ctx) return;
        A.openMenu(it.name, `${A.naira(appPrice(it))} + ${A.naira(delFee(it))} delivery. The box go reach your door in about 3 minutes. (At the showroom in Ikeja GRA: ${A.naira(it.price)}, no delivery fee.)`,
          [{ name: 'Deliver to this house', sub: ctx.name, btn: `Order · ${A.naira(appTotal(it))}`, off: A.cash() < appTotal(it), act: () => { const r = order(it.id, ctx.house, 'app'); if (r.ok) A.closeMenu(); } }]); });
      H.ui.store.append(x); }
  }

  // ---------------------------------------------------------------- every frame (light work)
  function tick(dt) {
    const ctx = H.cur; if (ctx && (A.room() !== ctx.R || A.mode() !== 'interior')) { if (DM.on) dmEnd(); H.cur = null; H.ui.arr.hidden = true; }
    if ((H.t -= dt) > 0 && !H.dirty) return; H.t = 1;
    if (!H.catP && (H.warm = (H.warm || 0) + 1) > 12) loadCat();   // the catalogue (7 KB) comes early: names for the delivery news
    const now = Date.now(), l = L();
    for (const b of l.boxes) { const key = b[0] + '|' + b[1] + '|' + b[2]; if (b[2] <= now && !H.seen.has(key)) { H.seen.add(key); if (H.seenInit) { const it = H.by[b[0]], hs = A.houses().find(h => h.id === b[1]);
          A.toast(b[3] === 'door' ? `📦 Delivery! Your ${it ? it.name.toLowerCase() : 'furniture'} don land for the door of ${hs ? hs.short : 'your house'}.` : `📦 Your ${it ? it.name.toLowerCase() : 'furniture'} from the showroom dey inside ${hs ? hs.short : 'your house'}.`, 5); } H.dirty = 1; } }
    H.seenInit = true;
    if (H.dirty) { H.dirty = 0; loadCat().then(() => { outsideBoxes(); if (H.cur && H.cur.fl === 0) insideBoxes(H.cur); }).catch(() => {}); }
  }
  function lifeChanged() { H.seen.clear(); H.seenInit = false; H.dirty = 1; }

  // ---------------------------------------------------------------- the NAIJA HOME showroom (Ikeja GRA): every piece on show at its MARK_slot_<id>,
  // a price tag over it, and E in front of it to buy (cheaper than the app, no delivery fee; it waits inside the house you pick)
  function tagTex(it) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
    g.fillStyle = 'rgba(18,16,15,.86)'; g.beginPath(); g.roundRect ? g.roundRect(2, 2, 252, 60, 12) : g.rect(2, 2, 252, 60); g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f3ece2'; let f = 19; g.font = `600 ${f}px system-ui,sans-serif`;
    while (g.measureText(it.name).width > 232 && f > 12) { f--; g.font = `600 ${f}px system-ui,sans-serif`; } g.fillText(it.name, 128, 20);
    g.fillStyle = '#ffcf6b'; g.font = '800 25px system-ui,sans-serif'; g.fillText(A.naira(it.price), 128, 45);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  function showroom(R) {
    if (R.nhP) return R.nhP;
    R.nhTags = [];
    R.nhP = loadCat().then(() => {
      const G = R.grid;
      for (const [k, m] of Object.entries(R.marks)) {
        if (!k.startsWith('slot_')) continue; const id = k.slice(5), it = H.by[id]; if (!it) continue;
        const I = { it, x: m.x, z: m.z, r: m.yaw || 0 };
        if (G && it.kind !== 'rug') stamp(G, I);
        model(id).then(tpl => { const o = tpl.clone(true); o.position.set(I.x, it.kind === 'rug' ? .004 : 0, I.z); o.rotation.y = I.r; R.scene.add(o); }).catch(() => {});
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(it), depthWrite: false, transparent: true })); sp.scale.set(1.25, .31, 1);
        sp.position.set(I.x, (it.kind === 'rug' ? .35 : Math.min(it.h, 2.3)) + .42, I.z); sp.renderOrder = 2; R.scene.add(sp); R.nhTags.push(sp);
        const ext = (it.kind === 'rug' ? .3 : it.d / 2) + .55, p = R.nearFree(I.x + Math.sin(I.r) * ext, I.z + Math.cos(I.r) * ext);
        R.spots.push({ x: p.x, z: p.z, r: 1.15, label: `Buy ${it.name} · ${A.naira(it.price)}`, act: () => shopBuy(id) });
      }
    });
    const tick0 = R.tick, cp = new THREE.Vector3();   // tags fade out when the camera is right on them
    R.tick = dt => { if (tick0) tick0(dt); cp.copy(A.camera.position); for (const sp of R.nhTags) { const d = sp.position.distanceTo(cp), o = Math.min(1, Math.max(0, (d - 1.8) / 1.4)); sp.material.opacity = o; sp.visible = o > .02; } };
    R.nhP.catch(e => { console.warn('showroom', e); R.nhP = null; }); return R.nhP;
  }
  function shopBuy(id) {
    const it = H.by[id], hs = A.houses(); if (!it) return;
    if (!hs.length) { A.toast('You need your own house first: the flat in Mushin, or a house in one of the estates.', 4); return; }
    A.openMenu(it.name, `Showroom price ${A.naira(it.price)}, no delivery fee (in the app: ${A.naira(appTotal(it))}). It go dey inside the house you pick, waiting for you to arrange, in about 5 minutes.`,
      hs.map(h => ({ name: h.name, sub: 'Put it inside this house', btn: `Buy · ${A.naira(it.price)}`, off: A.cash() < it.price,
        act: () => { const r = order(id, h.id, 'shop'); if (r.ok) A.closeMenu(); } })));
  }

  // ---------------------------------------------------------------- the phone app (src/phone.js draws it)
  function app() {
    if (!H.cat.length) { loadCat(); return null; }
    const houses = A.houses(), l = L(), now = Date.now();
    const boxes = l.boxes.map(b => { const it = H.by[b[0]], hs = houses.find(h => h.id === b[1]); return { name: it ? it.name : b[0], house: hs ? hs.short : b[1], mins: Math.max(0, Math.ceil((b[2] - now) / 60000)), where: b[3], ready: b[2] <= now }; });
    return { cats: H.cats.map(k => ({ k, name: CAT_NAME[k] || k })), items: H.cat.map(it => ({ id: it.id, name: it.name, cat: it.cat, shop: it.price, app: appPrice(it), fee: delFee(it), total: appTotal(it), css: px => thumbCss(it, px), w: it.w, d: it.d })),
      houses: houses.map(h => ({ id: h.id, name: h.name, short: h.short })), boxes };
  }
  return { tick, cam, order, enterEst, enterFlat, leave, app, lifeChanged, loadCat, showroom, shopBuy, dmStart, dmEnd, active: () => DM.on, busyDM: () => DM.on,
    shopItems: () => H.cat, byId: id => H.by[id], thumbCss, appPrice, delFee, appTotal,
    test: w => { const ctx = H.cur; if (w && w.place && ctx) placeNew(w.place, w.at || { ...DM.f }); if (w && w.drag && ctx) { const I = ctx.items[w.drag.i | 0]; if (I && canPlace(ctx, I, w.drag.x, w.drag.z, I.r)) { restamp(ctx, I); Object.assign(I, { x: w.drag.x, z: w.drag.z }); I.o.position.set(I.x, I.o.position.y, I.z); restamp(ctx); saveLayout(ctx); } }
      return { cur: ctx && { house: ctx.house, fl: ctx.fl, items: ctx.items.map(I => [I.id, r2(I.x), r2(I.z), r2(I.r)]), boxes: ctx.boxes.length, spots: (ctx.R.spots || []).filter(s => s.home).map(s => s.label) }, dm: DM.on, sel: DM.sel && DM.sel.id, f: DM.f, out: H.out.length, outAt: H.out[0] ? { x: r2(H.out[0].mesh.position.x), z: r2(H.out[0].mesh.position.z) } : null, cat: H.cat.length,
        life: { deco: L().deco, store: L().store, boxes: L().boxes.map(b => [b[0], b[1], Math.round((b[2] - Date.now()) / 1000), b[3]]) } }; } };
}
