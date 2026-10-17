/* ================= The motor park union (online) =================
   Mushin Motor Park has a union office now (built in Blender, tools/blender_park.py): the union's board on its veranda
   with the chairman's name, the secretary at his ticket table, the chairman's corner under a big umbrella, and the fare
   board by the yard. Sign in online and join the union at the secretary's table (₦5,000): you wear the orange vest
   and you are an agbero. Every danfo that loads in a bay pays a ticket; the first agbero standing by it collects it
   (E) and keeps half, more as their respect grows (40: senior agbero, 120: head agbero). The rest is the chairman's
   return. The chairman (in the green vest and the aso-oke fila) sets the ticket price, pays his boys, sacks agberos.
   Every 30 minutes the park holds its meeting: a head agbero who declared (and paid boys for the fight) fights the
   chairman's crew in the yard. The two crews brawl (the chairman's boys in union vests, the challenger's in red caps),
   the players join in, and every enemy boy a player knocks down counts. Win it and the seat is yours.
   Everything that matters lives on the server (server/src/park.js); this file draws the office, the boards, the ticket
   markers and the vests, runs the menus, and tells the game where the fight is. The game passes in `api`. */

// the office, in its own axes (x right, y up, z toward its front): the same numbers as tools/blender_park.py SPOTS
export const OFFICE = {
  glb: 'pk_office',
  sign: { x: .6, y: 2.32, z: 2.756, w: 4.24, h: .5 },
  board: { x: 3.3, y: 1.51, z: 2.862, w: 1.32, h: .84 },
  desk: { x: -.5, z: 2.45 }, sec: { x: -.5, z: 1.2, ry: 0 }, chair: { x: -2.65, z: .48, ry: 0 },
  walls: [[.6, -.6, 2.1, 1.5, 2.95], [-.5, 1.75, .5, .3, .86], [-2.65, 1.2, .48, .48, .86], [.85, 1.12, .55, .16, .47], [-1.55, 2.64, .08, .08, 2.5], [2.75, 2.64, .08, .08, 2.5],
    [2.68, 2.8, .05, .05, 2], [3.92, 2.8, .05, .05, 2], [-1.95, -.55, .3, .22, .6], [-3.4, -1.7, .06, .06, 3.4], [2.45, 2.0, .25, .5, .6]],
};
const DESK_R = 2.3, TICKET_R = 6, RANKS = ['Agbero', 'Senior agbero', 'Head agbero'];

// ---- the union vest: a shell over the body's own torso, so it moves with every body exactly (orange for agberos,
// green for the chairman), with two silver bands. Made once per body shape and shared.
const VEST_COL = { o: [[1, .16, .004], [.62, .65, .68]], g: [[.014, .2, .062], [.75, .43, .03]], k: [[.012, .013, .018], [.7, .72, .76]] };   // (k: the police's black, with a white band)   // (linear: hi-vis orange #ff6c0d, union green #1d7a46; silver and gold bands)
const vestCache = new Map();
function vestGeo(THREE, sm, kind) {
  const key = sm.geometry.uuid + kind; if (vestCache.has(key)) return vestCache.get(key);
  let out = null;
  try {
    const G = sm.geometry, P = G.attributes.position, N = G.attributes.normal, SI = G.attributes.skinIndex, SW = G.attributes.skinWeight;
    const bones = sm.skeleton && sm.skeleton.bones, inv = sm.skeleton && sm.skeleton.boneInverses;
    if (P && N && SI && SW && bones && inv) {
      const find = re => bones.findIndex(b => re.test(b.name));
      const iH = find(/Hips$/), iN = find(/Neck$/) >= 0 ? find(/Neck$/) : find(/Neck/);
      if (iH >= 0 && iN >= 0) {
        const M = new THREE.Matrix4(), hip = new THREE.Vector3().setFromMatrixPosition(M.copy(inv[iH]).invert()), neck = new THREE.Vector3().setFromMatrixPosition(M.copy(inv[iN]).invert());
        const up = neck.clone().sub(hip), L = up.length(); up.normalize();
        const kindOf = bones.map(b => /Arm|Hand|Neck|Head|Leg|Foot|Toe/.test(b.name) ? 0 : /Spine|Chest/.test(b.name) ? 1 : /Shoulder|Clavicle/.test(b.name) ? 2 : /Hips|Pelvis/.test(b.name) ? 3 : 0);
        const BM = sm.bindMatrix, IB = new THREE.Matrix4().copy(BM).invert(), NM = new THREE.Matrix3().getNormalMatrix(BM);
        const n = P.count, okV = new Uint8Array(n), tV = new Float32Array(n), W = new THREE.Vector3(), Nn = new THREE.Vector3();
        for (let i = 0; i < n; i++) {
          let best = -1, bw = 0, arm = 0;
          for (let k = 0; k < 4; k++) { const b = SI.getComponent(i, k), w = SW.getComponent(i, k); if (w > bw) { bw = w; best = b; } if (w > 0 && kindOf[b] === 0) arm += w; }
          W.fromBufferAttribute(P, i).applyMatrix4(BM); const t = W.sub(hip).dot(up) / L; tV[i] = t;
          const kd = best >= 0 ? kindOf[best] : 0;
          okV[i] = arm < .3 && t > .06 && t < 1.04 && (kd === 1 || (kd === 2 && t < 1.0) || (kd === 3 && t > .14)) ? 1 : 0;
        }
        const idx = G.index ? G.index.array : null, tris = idx ? idx.length / 3 : n / 3, pick = [];
        for (let f = 0; f < tris; f++) { const a = idx ? idx[f * 3] : f * 3, b = idx ? idx[f * 3 + 1] : f * 3 + 1, c = idx ? idx[f * 3 + 2] : f * 3 + 2; if (okV[a] && okV[b] && okV[c]) pick.push(a, b, c); }
        if (pick.length > 300) {
          const m = pick.length, pos = new Float32Array(m * 3), nor = new Float32Array(m * 3), col = new Float32Array(m * 3), si = new Uint16Array(m * 4), sw = new Float32Array(m * 4);
          const [base, band] = VEST_COL[kind] || VEST_COL.o, off = .024 * L / .5;   // (in the body's own units: hips to neck is about half a metre)
          for (let j = 0; j < m; j++) {
            const i = pick[j]; W.fromBufferAttribute(P, i).applyMatrix4(BM); Nn.fromBufferAttribute(N, i).applyMatrix3(NM).normalize();
            W.addScaledVector(Nn, off).applyMatrix4(IB); pos.set([W.x, W.y, W.z], j * 3);
            Nn.fromBufferAttribute(N, i); nor.set([Nn.x, Nn.y, Nn.z], j * 3);
            const t = tV[i], c = (t > .36 && t < .44) || (t > .6 && t < .68) ? band : base, k = .92 + .08 * Math.sin(i * 12.9898);
            col.set([c[0] * k, c[1] * k, c[2] * k], j * 3);
            for (let q = 0; q < 4; q++) { si[j * 4 + q] = SI.getComponent(i, q); sw[j * 4 + q] = SW.getComponent(i, q); }
          }
          out = new THREE.BufferGeometry();
          out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
          out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); out.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
          out.computeBoundingSphere(); out.userData.r = 0;
          { let s = 0; for (const i of pick) { W.fromBufferAttribute(P, i).applyMatrix4(BM).sub(hip); s += W.addScaledVector(up, -W.dot(up)).length(); } out.userData.r = s / pick.length; }   // how far out from the spine (to pick the outer layer)
        }
      }
    }
  } catch (e) { console.warn('vest', e); out = null; }
  vestCache.set(key, out); return out;
}
const vestMat = {};
export function vestInfo(THREE, obj, kind = 'o') { const out = []; obj.traverse(o => { if (o.isSkinnedMesh) { const g = vestGeo(THREE, o, kind); out.push([o.name, o.visible, o.geometry.attributes.position.count, !!o.geometry.index, g ? g.attributes.position.count : 0, g ? +g.userData.r.toFixed(3) : 0, o.material && o.material.name]); } }); return out; }
// put the vest on a body (any object with skinned meshes): returns the meshes added (remove them to take it off)
export function wearVest(THREE, obj, kind) {
  if (!obj || !kind) return [];
  const cand = [];
  obj.traverse(o => { if (o.isSkinnedMesh && o.visible) { let v = true; for (let p = o.parent; p && p !== obj; p = p.parent) if (!p.visible) v = false; if (v) { const g = vestGeo(THREE, o, kind); if (g) cand.push([o, g]); } } });
  if (!cand.length) return [];
  const most = Math.max(...cand.map(([, g]) => g.attributes.position.count)), outer = cand.filter(([, g]) => g.attributes.position.count > most * .12).sort((a, b) => b[1].userData.r - a[1].userData.r)[0];
  const [sm, g] = outer;
  const mat = vestMat[kind] || (vestMat[kind] = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .62, metalness: 0, side: THREE.DoubleSide }));
  const m = new THREE.SkinnedMesh(g, mat); m.name = 'union_vest'; m.bindMode = sm.bindMode; m.bind(sm.skeleton, sm.bindMatrix);
  m.position.copy(sm.position); m.quaternion.copy(sm.quaternion); m.scale.copy(sm.scale); m.frustumCulled = false; m.castShadow = true;
  sm.parent.add(m); return [m];
}

export function createPark(api) {
  const { THREE, scene } = api, naira = api.naira, S = api.site();
  const none = { on() {}, prompt: () => null, action: () => false, near: () => false, update() {}, signedOut() {}, badge: () => '', side: () => null, fightHere: () => false, koed() {}, downed() {}, debug: () => null };
  if (!S) return none;
  const c = Math.cos(S.ang), s = Math.sin(S.ang);
  const W3 = (u, v) => ({ x: S.cx + c * u - s * v, z: S.cz + s * u + c * v });
  // the office: in the yard by the road, left of the gate, its front to the bays (a dirt road cuts the yard's right end)
  const o0 = W3(-16, -S.fs * (S.hd - 5)), O = { x: o0.x, z: o0.z, ry: Math.atan2(-s * S.fs, c * S.fs) };
  const L = (lx, lz) => { const cr = Math.cos(O.ry), sr = Math.sin(O.ry); return { x: O.x + lx * cr + lz * sr, z: O.z - lx * sr + lz * cr }; };
  const YARD = W3(-3, -S.fs * 3);   // where the crews fight: the open yard between the office, the gate and the bays
  const ST = { p: null, rules: null, me: null, loads: new Map(), fight: null, end: null, ready: false, shown: new Set() };
  let signCv, signTex, boardCv, boardTex, sec = null, kas = null;

  // ---- the office, its boards and walls
  (async () => {
    let m = null; try { m = await api.glb(OFFICE.glb); } catch (e) { console.warn('park office', e); return; }
    const y = api.groundY(O.x, O.z); O.y = y;
    const levels = m.geo1 ? [{ geo: m.geo, mat: m.mat, dist: api.Q.lod0 * 1.2, shadow: true }, { geo: m.geo1, mat: m.mat1, dist: api.Q.draw * .9, shadow: false }] : [{ geo: m.geo, mat: m.mat, dist: api.Q.draw * .9, shadow: true }];
    new api.CullSet(levels, [{ x: O.x, y, z: O.z, ry: O.ry, sc: 1 }], { shadowDist: api.Q.shR, name: 'pk_office' });
    for (const [lx, lz, hx, hz, h] of OFFICE.walls) { const w = L(lx, lz); api.addOB(w.x, w.z, hx, hz, -O.ry, h, y); }
    const plane = (sp, cv) => { const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const me = new THREE.Mesh(new THREE.PlaneGeometry(sp.w, sp.h), new THREE.MeshStandardMaterial({ map: tex, roughness: .8, metalness: 0, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 }));
      const p = L(sp.x, sp.z); me.position.set(p.x, y + sp.y, p.z); me.rotation.y = O.ry; me.layers.set(1); scene.add(me); return [tex, me]; };
    signCv = document.createElement('canvas'); signCv.width = 1024; signCv.height = 120; [signTex, ST.signM] = plane(OFFICE.sign, signCv);
    boardCv = document.createElement('canvas'); boardCv.width = 512; boardCv.height = 326; [boardTex, ST.boardM] = plane(OFFICE.board, boardCv);
    const ds = L(OFFICE.sec.x, OFFICE.sec.z); sec = api.spot('baba', ds.x, ds.z, O.ry + OFFICE.sec.ry, ['idle_baba', 'talk', 'idle_1', 'phone']);
    api.mapPlace({ name: 'Park Union office', sub: 'Mushin Motor Park · join the union, collect tickets, fight for chairman (online)', kind: 'place', x: O.x, z: O.z, id: 'park_office' });
    ST.ready = true; paint();
  })();
  function paint() {
    if (!signCv) return; const P = ST.p, ch = P ? P.ch : 'Chairman Kasali';
    { const g = signCv.getContext('2d'), Wc = signCv.width, Hc = signCv.height, F = 'Bungee, Impact, "Arial Black", sans-serif';
      g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, Wc, Hc); g.fillStyle = '#1d7a46'; g.fillRect(0, 0, Wc, 10); g.fillRect(0, Hc - 10, Wc, 10);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      let fs = 52; g.font = `${fs}px ${F}`; const t1 = 'MUSHIN MOTOR PARK UNION'; while (g.measureText(t1).width > Wc - 60 && fs > 30) { fs -= 2; g.font = `${fs}px ${F}`; }
      g.fillStyle = '#145a33'; g.fillText(t1, Wc / 2, Hc * .38);
      const t2 = (P && !P.npc ? `CHAIRMAN: ${ch}` : `CHAIRMAN: ${ch.replace(/^Chairman /, '')}`).toUpperCase(); let f2 = 30; g.font = `600 ${f2}px "Barlow Semi Condensed", Arial, sans-serif`;
      while (g.measureText(t2).width > Wc - 80 && f2 > 16) { f2--; g.font = `600 ${f2}px "Barlow Semi Condensed", Arial, sans-serif`; }
      g.fillStyle = '#b8261e'; g.fillText(t2, Wc / 2, Hc * .76); signTex.needsUpdate = true; }
    { const g = boardCv.getContext('2d'), Wc = boardCv.width, Hc = boardCv.height, F = 'Bungee, Impact, "Arial Black", sans-serif';
      g.fillStyle = '#f6f2e8'; g.fillRect(0, 0, Wc, Hc); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#1d7a46'; g.fillRect(0, 0, Wc, 74); g.fillStyle = '#fff'; g.font = `42px ${F}`; g.fillText('TICKET', Wc / 2, 40);
      g.fillStyle = '#b8261e'; g.font = `86px ${F}`; g.fillText(naira(P ? P.price : 300), Wc / 2, 136);
      g.fillStyle = '#2a2622'; g.font = `600 27px "Barlow Semi Condensed", Arial, sans-serif`;
      g.fillText('OSHODI · YABA · OJOTA · IKEJA', Wc / 2, 210); g.fillText('OJUELEGBA · COSTAIN · OYINGBO', Wc / 2, 246);
      g.fillStyle = '#145a33'; g.font = `600 24px "Barlow Semi Condensed", Arial, sans-serif`;
      const nx = P && P.nextAt ? `NEXT PARK MEETING ${api.clockAt(P.nextAt)}` : 'PARK MEETING EVERY 30 MIN'; g.fillText(nx, Wc / 2, 296); boardTex.needsUpdate = true; }
  }

  // ---- the ticket markers over the danfos loading in the bays
  const markers = new Map();   // load id -> {spr, cv, tex, by, t}
  function marker(L) {
    let M = markers.get(L.id);
    if (!M) { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, fog: false, transparent: true })); spr.scale.set(2.2, .82, 1); spr.layers.set(1); scene.add(spr);
      M = { spr, cv, tex, by: null, t: 0 }; markers.set(L.id, M); }
    if (M.by !== (L.by || '')) { M.by = L.by || ''; const g = M.cv.getContext('2d'); g.clearRect(0, 0, 256, 96);
      g.fillStyle = M.by ? 'rgba(29,122,70,.92)' : 'rgba(233,180,20,.95)'; rr(g, 6, 6, 244, 84, 18); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 4; g.stroke();
      g.fillStyle = M.by ? '#fff' : '#111'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '30px Bungee, Impact, sans-serif';
      g.fillText(M.by ? '✓ ' + M.by.slice(0, 12).toUpperCase() : `TICKET ${naira(L.price)}`, 128, 38); g.font = '600 24px Arial, sans-serif'; g.fillText(L.route.toUpperCase(), 128, 70); M.tex.needsUpdate = true; }
    const b = S.bays[L.bay]; M.spr.position.set(b.x, api.groundY(b.x, b.z) + 3.25 + Math.sin(performance.now() / 300) * .06, b.z); M.spr.visible = true;
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function dropMarker(id) { const M = markers.get(id); if (!M) return; scene.remove(M.spr); M.spr.material.map.dispose(); M.spr.material.dispose(); markers.delete(id); }

  // ---- messages from the server
  function on(m) {
    if (m.t === 'pk') { ST.p = m.p; ST.p.nextLocal = performance.now() + (m.p.next || 0); if (m.rules) ST.rules = m.rules; paint(); if (api.menuOpen() && MENU) refresh(); }
    else if (m.t === 'pkme') { ST.me = m.m; if (api.menuOpen() && MENU) refresh(); }
    else if (m.t === 'pkd') {
      const now = performance.now(), seen = new Set();
      for (const [id, bay, route, left, by, price] of m.l) {
        seen.add(id); let Lo = ST.loads.get(id);
        if (!Lo) { Lo = { id, bay, route, price, until: now + left, by }; ST.loads.set(id, Lo); if (left > 2000) api.load(bay, left / 1000); }
        Lo.by = by; Lo.until = now + left;
      }
      for (const id of [...ST.loads.keys()]) if (!seen.has(id)) { ST.loads.delete(id); dropMarker(id); }
    }
    else if (m.t === 'pkt') api.toast(`Driver: "${['Take your ticket, abeg make I go.', 'Oya take. Na ' + m.route + ' I dey go.', 'Agbero, no vex, take am.'][m.id % 3]}" +${naira(m.got)} for you · ${naira(m.ret)} to ${m.chair}.`, 3);
    else if (m.t === 'pkf') { ST.fight = m.f; if (m.end) { ST.end = m.end; ST.fight = null; api.crewEnd(m.end.win); } }
    else if ((m.t === 'err' || m.t === 'ok') && m.w === 'pk') { ST.said = m.m; api.toast(m.m, 3.2); if (api.menuOpen() && MENU) setTimeout(refresh, 60); }
  }
  function signedOut() { ST.me = null; }
  const member = () => !!(ST.me && ST.me.on), chair = () => !!(ST.me && ST.me.chair);
  // which side you fight on at the meeting: 'a' the chairman's, 'b' the challenger's
  function side() {
    const F = ST.fight || (ST.p && ST.p.decl), me = api.myName().toLowerCase(); if (!api.signedIn() || !F) return null;
    if (ST.me && ST.me.chair) return 'a'; if (ST.p && ST.p.decl && ST.p.decl.n.toLowerCase() === me) return 'b'; if (ST.fight && ST.fight.B.toLowerCase() === me) return 'b';
    if (!member() || ST.me.ban) return null; return ST.me.side === 'x' ? 'b' : 'a';
  }
  const badge = () => !api.signedIn() || !ST.me ? '' : ST.me.chair ? 'c' : ST.me.on ? 'a' : '';

  // ---- the ticket: stand by a loading danfo
  function loadNear() {
    if (api.mode() !== 'walk') return null; const p = api.player(); let best = null, bd = TICKET_R;
    for (const Lo of ST.loads.values()) { if (Lo.by || Lo.until < performance.now() + 300) continue; const b = S.bays[Lo.bay], d = Math.hypot(p.x - b.x, p.z - b.z); if (d < bd) { bd = d; best = Lo; } }
    return best;
  }
  const atDesk = () => { if (!ST.ready || api.mode() !== 'walk') return false; const p = api.player(), d = L(OFFICE.desk.x, OFFICE.desk.z); return Math.hypot(p.x - d.x, p.z - d.z) < DESK_R; };
  function prompt() {
    if (atDesk()) return !api.signedIn() ? 'Park Union office · sign in online to join the union' : member() ? `Park Union office · ${chair() ? 'you are the chairman' : RANKS[ST.me.rank]}` : `Join the park union · ${naira(ST.rules ? ST.rules.join : 5000)}`;
    const Lo = loadNear(); if (!Lo) return null;
    if (!api.signedIn() || !member()) return `${Lo.route} danfo loading · join the union at the office to collect tickets`;
    const share = ST.rules ? ST.rules.share[ST.me.rank] : .5;
    return `Collect the ticket · ${naira(Math.round(Lo.price * share / 10) * 10)} for you`;
  }
  function action() {
    if (atDesk()) { if (!api.signedIn()) { api.openSignIn(); return true; } MENU = true; VIEW = 'main'; api.send({ t: 'pk', a: 'info' }); refresh(true); return true; }
    const Lo = loadNear(); if (!Lo) return false;
    if (!api.signedIn()) { api.openSignIn(); return true; }
    if (!member()) { api.toast('Only union agberos collect tickets. Join at the office in the yard.', 3); return true; }
    api.send({ t: 'pk', a: 'ticket', id: Lo.id }); return true;
  }

  // ---- the office menu
  let MENU = false, VIEW = 'main';
  const send = (a, o = {}) => api.send({ t: 'pk', a, ...o });
  const mins = ms => Math.max(1, Math.ceil(ms / 60e3));
  function refresh(force) {
    if (!force && !(MENU && api.menuOpen())) return;   // (closed meanwhile: leave it closed)
    const P = ST.p, nx = P ? Math.max(0, (P.nextLocal || 0) - performance.now()) : 0;
    const note = !P ? 'Connecting…' : `Chairman ${P.npc ? P.ch.replace(/^Chairman /, '') : P.ch} · ticket ${naira(P.price)} · ${P.members} in the union · next meeting ${api.clockAt(P.nextAt)} (${mins(nx)} min)${P.decl ? ` · ${P.decl.n} declared with ${P.decl.b} boys` : ''}${ST.fight ? ' · THE FIGHT IS ON' : ''}`;
    api.openMenu('MUSHIN PARK UNION', note, rows);
  }
  const back = () => ({ name: '‹ Back', sub: '', btn: 'BACK', act() { VIEW = 'main'; refresh(); } });
  function rows() {
    const P = ST.p, R = ST.rules, M = ST.me, cash = api.cash();
    if (!P || !R || !M) return [{ name: 'Connecting…', btn: '…', off: true, act() {} }];
    const top = P.top && P.top.length ? { name: 'Top agberos', sub: P.top.map(([n, rp]) => `${n} ${rp}`).join(' · '), btn: '★', off: true, act() {} } : null;
    const last = P.last ? { name: 'Last fight for the seat', sub: `${P.last.B} came for ${P.last.A}: ${P.last.win} won`, btn: '⚑', off: true, act() {} } : null;
    if (!M.on) return [{ name: 'Join the union as an agbero', sub: `Wear the vest. Run to every danfo that loads and collect the ticket: you keep ${Math.round(R.share[0] * 100)}%, more as your respect grows`, btn: naira(R.join), off: cash < R.join, act() { send('join'); } }, top, last].filter(Boolean);
    if (VIEW === 'declare') return [back(), ...[4, 6, 8, 10, 12].map(n => ({ name: `Declare with ${n} boys`, sub: `They fight for you at the meeting (${api.clockAt(P.nextAt)}). ${P.npc ? `${P.ch} has ${R.npcBoys} boys.` : `${P.ch} has ${P.crew} boys paid now.`}`, btn: naira(n * R.boyFight), off: cash < n * R.boyFight, act() { VIEW = 'main'; send('declare', { n }); } }))];
    if (VIEW === 'boys') return [back(), ...[4, 6, 8, 10, 12].map(n => ({ name: `Pay ${n} boys for 24 hours`, sub: M.crew ? `Now: ${M.crew} boys, paid ${Math.ceil(M.crewLeft / 36e5)} h more (paying again starts a new day)` : 'No boys on your crew now: anybody who declares will take the park', btn: naira(n * R.boyDay), off: cash < n * R.boyDay, act() { VIEW = 'main'; send('boys', { n }); } }))];
    if (VIEW === 'sack') return [back(), ...(M.list || []).filter(x => !x[4]).slice(0, 10).map(([uid, n, rp, tk]) => ({ name: `${n} · respect ${rp}`, sub: `${tk} tickets today · sacked agberos cannot collect for a day`, btn: 'SACK', off: (M.sacks | 0) >= 5, act() { send('sack', { uid }); } })), ...(!(M.list || []).length ? [{ name: 'No agberos yet', sub: '', btn: '…', off: true, act() {} }] : [])];
    if (VIEW === 'resign') return [back(), { name: 'Yes, step down', sub: `${R.npc} comes back to the chair`, btn: 'STEP DOWN', act() { VIEW = 'main'; send('resign'); } }];
    if (VIEW === 'leave') return [back(), { name: 'Yes, leave the union', sub: 'Your respect stays on the book if you come back (and pay again)', btn: 'LEAVE', act() { VIEW = 'main'; send('leave'); } }];
    const out = [];
    if (M.chair) {
      const steps = []; for (let p = R.priceMin; p <= R.priceMax; p += R.priceStep) steps.push(p); const nxP = steps[(steps.indexOf(P.price) + 1) % steps.length] || R.price;
      out.push({ name: `Today: ${M.day ? M.day.tk : 0} tickets by agberos, ${M.day ? M.day.npc : 0} by the touts`, sub: `Your return today ${naira(M.day ? M.day.ret : 0)} (it comes to you every minute)`, btn: '₦', off: true, act() {} });
      out.push({ name: `Ticket price ${naira(P.price)}`, sub: 'Dearer tickets: more money each, but fewer danfos load', btn: `${naira(nxP)} ▸`, act() { send('price', { p: nxP }); } });
      out.push({ name: `Your boys: ${M.crew || 0}`, sub: M.crew ? `Paid ${Math.ceil(M.crewLeft / 36e5)} h more · they defend the park at the meeting` : 'Nobody defends your seat! Pay some boys', btn: 'BOYS ▸', act() { VIEW = 'boys'; refresh(); } });
      out.push({ name: 'Sack an agbero', sub: `${M.sacks | 0}/5 today`, btn: 'SACK ▸', act() { VIEW = 'sack'; refresh(); } });
      if (P.decl) out.push({ name: `${P.decl.n} declared for your seat`, sub: `${P.decl.b} boys · the fight is at ${api.clockAt(P.decl.at)}. Be in the yard and fight!`, btn: '⚔', off: true, act() {} });
      out.push({ name: 'Step down', sub: 'Give the chair back', btn: 'STEP DOWN', act() { VIEW = 'resign'; refresh(); } });
    } else {
      const nxt = M.rank < 2 ? R.ranks[M.rank + 1][0] : 0;
      out.push({ name: `${RANKS[M.rank]} · respect ${M.rp}`, sub: M.rank < 2 ? `${R.ranks[M.rank + 1][1]} at ${nxt}: keep ${Math.round(R.share[M.rank + 1] * 100)}% of each ticket${M.rank === 1 ? ' and fight for chairman' : ''}` : `You keep ${Math.round(R.share[2] * 100)}% of each ticket. You can declare for chairman`, btn: '★', off: true, act() {} });
      out.push({ name: `Today: ${M.today && M.today.k ? M.today.tk : 0} tickets · ${naira(M.today && M.today.k ? M.today.earned : 0)}`, sub: `All time ${M.tk} tickets, ${naira(M.earned)}${M.ban ? ` · SACKED for ${Math.ceil(M.ban / 36e5)} h more` : ''}`, btn: '₦', off: true, act() {} });
      if (M.declared) out.push({ name: 'You declared for the seat', sub: `The fight is at ${api.clockAt(P.decl ? P.decl.at : P.nextAt)}. Be in the yard: every boy you knock down counts`, btn: '⚔', off: true, act() {} });
      else if (P.decl) out.push({ name: M.side === 'x' ? `You will fight with ${P.decl.n}` : `You will fight for ${P.npc ? P.ch : 'Chairman ' + P.ch}`, sub: `${P.decl.n} declared with ${P.decl.b} boys · switch sides before the meeting`, btn: 'SWITCH', act() { send('side', { s: M.side === 'x' ? 'c' : 'x' }); } });
      else if (M.rank >= 2) out.push({ name: 'Declare for chairman', sub: `Pay your boys and fight ${P.ch}'s crew at the next meeting (${api.clockAt(P.nextAt)})`, btn: 'DECLARE ▸', off: !!ST.fight, act() { VIEW = 'declare'; refresh(); } });
      out.push({ name: 'Leave the union', sub: '', btn: 'LEAVE', act() { VIEW = 'leave'; refresh(); } });
    }
    if (top) out.push(top); if (last) out.push(last);
    return out;
  }

  // ---- the fight bar: who has how many boys standing (while you are near the park)
  const bar = document.createElement('div'); bar.id = 'parkFight';
  bar.style.cssText = 'position:fixed;left:50%;top:116px;transform:translateX(-50%);z-index:30;background:rgba(14,16,20,.82);color:#fff;font:600 14px/1.25 "Barlow Semi Condensed",Arial,sans-serif;padding:6px 12px;border-radius:12px;pointer-events:none;text-align:center;white-space:nowrap;max-width:94vw;overflow:hidden;text-overflow:ellipsis';
  bar.hidden = true; document.body.appendChild(bar);
  const dots = (n, n0, col) => `<span style="color:${col};letter-spacing:1px">${'●'.repeat(Math.min(n, 12))}</span><span style="color:#555;letter-spacing:1px">${'●'.repeat(Math.max(0, Math.min(n0, 12) - Math.min(n, 12)))}</span>`;

  // ---- every frame
  let t2 = 0, wasNear = false;
  function update(dt) {
    const p = api.player(), dPark = Math.hypot(p.x - S.cx, p.z - S.cz), now = performance.now();
    for (const Lo of ST.loads.values()) { if (Lo.until < now - 2500) { ST.loads.delete(Lo.id); dropMarker(Lo.id); continue; } if (dPark < 140) marker(Lo); else { const M = markers.get(Lo.id); if (M) M.spr.visible = false; } }
    if ((t2 -= dt) > 0) return; t2 = .5;
    const F = ST.fight, near = dPark < 160 && api.mode() !== 'interior';
    if (F && near) {
      bar.hidden = false; const m = Math.floor(F.left / 60e3), sec2 = Math.floor(F.left / 1000) % 60, my = side();
      bar.innerHTML = `${F.A.toUpperCase()} ${dots(F.a, F.a0, '#ff7a1a')} <b>VS</b> ${dots(F.b, F.b0, '#e23a2a')} ${F.B.toUpperCase()} · ${m}:${String(sec2).padStart(2, '0')}${my ? ` · you fight for ${my === 'a' ? F.A : F.B}` : ''}`;
      F.left = Math.max(0, F.left - 500);
      api.crewSync({ a: F.a, b: F.b, mine: side(), at: YARD, fromA: L(0, 3.6), fromB: { x: S.gate.x, z: S.gate.z } });
    } else bar.hidden = true;
    if (near !== wasNear) { wasNear = near; if (!near) bar.hidden = true; }
    // the old chairman at his table when no player holds the seat; the board lights at night
    const want = !!(ST.p && ST.p.npc) && ST.ready;
    if (want && !kas) { const w = L(OFFICE.chair.x, OFFICE.chair.z); kas = api.spot('baba', w.x, w.z, O.ry + OFFICE.chair.ry, ['idle_baba', 'phone', 'talk', 'idle_1'], { hat: 'fila', uvest: '' }); }
    else if (!want && kas) { api.unspot(kas); kas = null; }
    if (ST.signM) { const k = api.glow(); ST.signM.material.emissiveIntensity = .05 + k * .5; ST.boardM.material.emissiveIntensity = .05 + k * .5; }
    if (MENU && !api.menuOpen()) MENU = false;
    if (ST.p && ST.p.nextAt && (ST.paintAt || 0) !== ST.p.nextAt) { ST.paintAt = ST.p.nextAt; paint(); }
  }
  // the game tells us: you knocked down one of the other crew's boys / you went down
  const fightHere = () => { if (!ST.fight) return false; const p = api.player(); return Math.hypot(p.x - S.cx, p.z - S.cz) < S.hw + 12; };
  function koed() { if (ST.fight) send('ko'); }
  function downed() { if (ST.fight) send('down'); }
  return { on, prompt, action, near: () => atDesk() || !!loadNear(), update, signedOut, badge, side, fightHere, koed, downed,
    office: () => O, debug: () => ({ said: ST.said || '', p: ST.p, me: ST.me, loads: [...ST.loads.values()].map(l => ({ ...l, left: Math.round(l.until - performance.now()) })), near: (loadNear() || {}).id || null, mode: api.mode(), pl: api.player(), fight: ST.fight, end: ST.end, office: O, yard: YARD, ready: ST.ready }) };
}
