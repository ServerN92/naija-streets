// Naija Streets characters, made in Blender from MakeHuman bodies (tools/character): Tunde, Amaka and Ada.
// One file per person: body, eyes, hair and four outfits on a mixamo-named skeleton whose rest pose is an A-pose.
// Any Mixamo move (the game's moves.glb, the new moves2.glb, the hero's clips) is fitted onto it here: every bone is turned
// so it points where the Mixamo bone points (our A-pose first lined up with Mixamo's T-pose), keeping its twist.
import * as THREE from 'three';

export const bname = n => n.replace(/^.*mixamorig\d*:?/, '');
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

// rest pose of a skeleton: world turn and place of every mixamo bone, its parent and the turn of what holds the hips
export function skeletonInfo(root) {
  root.updateMatrixWorld(true);
  const nodes = new Map(); root.traverse(o => { if (/mixamorig/.test(o.name)) { const n = bname(o.name); if (!nodes.has(n)) nodes.set(n, o); } });
  const I = { nodes, order: [], parent: new Map(), wq: new Map(), wp: new Map(), lq: new Map(), lp: new Map(), base: new Map() };
  root.traverse(o => { const n = bname(o.name); if (nodes.get(n) !== o) return;
    I.order.push(n); const p = o.parent, pn = p ? bname(p.name) : null; I.parent.set(n, pn && nodes.get(pn) === p ? pn : null);
    const q = new THREE.Quaternion(), pos = new THREE.Vector3(); o.matrixWorld.decompose(pos, q, _s); I.wq.set(n, q); I.wp.set(n, pos);
    I.lq.set(n, o.quaternion.clone()); I.lp.set(n, o.position.clone());
    if (!I.parent.get(n)) { const bq = new THREE.Quaternion(); if (p) p.matrixWorld.decompose(_v, bq, _s); I.base.set(n, bq); } });
  return I;
}
// the bone each bone points at (by Mixamo names, so extra bones such as hair or heel bones don't confuse it)
const NEXT = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'HeadTop_End', Shoulder: 'Arm', Arm: 'ForeArm', ForeArm: 'Hand', Hand: 'HandMiddle1',
  UpLeg: 'Leg', Leg: 'Foot', Foot: 'ToeBase', ToeBase: 'Toe_End' };
function childOf(I, n) {
  const m = /^(Left|Right)(.*)$/.exec(n), side = m ? m[1] : '', base = m ? m[2] : n;
  let c = NEXT[base] ? side + NEXT[base] : null; if (!c) { const d = /^(.*?)(\d)$/.exec(n); if (d) c = d[1] + (+d[2] + 1); }   // fingers: Index1 -> Index2
  if (c && I.nodes.has(c)) return c;
  let only = null, k = 0; for (const x of I.order) if (I.parent.get(x) === n) { only = x; k++; } return k === 1 ? only : null; }

// turns that line our rest bones up with the source's rest bones (by bone direction)
function alignments(S, D) {
  const A = new Map();
  for (const n of D.order) { const a = new THREE.Quaternion();
    if (S.nodes.has(n)) { const c = childOf(D, n);
      if (c && S.nodes.has(c)) { const dd = D.wp.get(c).clone().sub(D.wp.get(n)), ds = S.wp.get(c).clone().sub(S.wp.get(n));
        if (dd.lengthSq() > 1e-10 && ds.lengthSq() > 1e-10) a.setFromUnitVectors(dd.normalize(), ds.normalize()); } }
    A.set(n, a); }
  return A;
}

// a clip made on skeleton S, rebuilt for skeleton D.  opts: {norm:true} hips positions stored as a fraction of hip height
// (moves.glb, moves2.glb), {travel:true} keep the body's travel, {hipsH: S hip height} for raw clips
export function retargetClip(clip, S, D, opts = {}) {
  const A = D.align || (D.align = new WeakMap()); let al = A.get(S); if (!al) { al = alignments(S, D); A.set(S, al); }
  const tr = new Map(); let times = null, hipsPos = null;
  for (const t of clip.tracks) { const [node, prop] = t.name.split('.'); const n = bname(node);
    if (prop === 'quaternion') { tr.set(n, t); if (!times || t.times.length > times.length) times = t.times; }
    else if (prop === 'position' && n === 'Hips') hipsPos = t; }
  if (!times) return null;
  const nT = times.length, out = new Map(), srcW = new Map(), dstW = new Map(), val = new THREE.Quaternion();
  for (const n of D.order) out.set(n, new Float32Array(nT * 4));
  const interp = new Map(); for (const [n, t] of tr) interp.set(n, t.times.length === nT ? null : t.createInterpolant());
  const sInv = new Map(); for (const n of S.order) sInv.set(n, S.wq.get(n).clone().invert());
  for (let i = 0; i < nT; i++) {
    srcW.clear(); dstW.clear();
    for (const n of S.order) { const t = tr.get(n); if (t) { const ip = interp.get(n); if (ip) { const r = ip.evaluate(times[i]); val.set(r[0], r[1], r[2], r[3]); } else val.fromArray(t.values, i * 4); } else val.copy(S.lq.get(n));
      const p = S.parent.get(n); const w = new THREE.Quaternion().multiplyQuaternions(p ? srcW.get(p) : S.base.get(n), val); srcW.set(n, w); }
    for (const n of D.order) {
      let w;
      if (srcW.has(n)) { w = new THREE.Quaternion().multiplyQuaternions(srcW.get(n), sInv.get(n)).multiply(al.get(n)).multiply(D.wq.get(n)); }
      else { const p = D.parent.get(n); w = new THREE.Quaternion().multiplyQuaternions(p ? dstW.get(p) : D.base.get(n), D.lq.get(n)); }
      dstW.set(n, w);
      const p = D.parent.get(n); _q.copy(p ? dstW.get(p) : D.base.get(n)).invert().multiply(w);
      const o = out.get(n); if (i) { _q2.fromArray(o, (i - 1) * 4); if (_q.dot(_q2) < 0) _q.set(-_q.x, -_q.y, -_q.z, -_q.w); } _q.toArray(o, i * 4); } }
  const tracks = [];
  for (const n of D.order) tracks.push(new THREE.QuaternionKeyframeTrack(D.nodes.get(n).name + '.quaternion', Float32Array.from(times), out.get(n)));
  if (hipsPos) { const rp = D.lp.get('Hips'), H = rp.y, v = hipsPos.values, nv = new Float32Array(v.length), sH = opts.norm ? 1 : (opts.hipsH || S.lp.get('Hips').y || 1);
    for (let i = 0; i < v.length; i += 3) { nv[i] = opts.travel ? rp.x + v[i] / sH * H : rp.x; nv[i + 1] = v[i + 1] / sH * H; nv[i + 2] = opts.travel ? rp.z + v[i + 2] / sH * H : rp.z; }
    tracks.push(new THREE.VectorKeyframeTrack(D.nodes.get('Hips').name + '.position', Float32Array.from(hipsPos.times), nv)); }
  const k = new THREE.AnimationClip(clip.name, clip.duration, tracks); return k;
}

// how far a move sinks or lifts the feet: put them back on the floor
export function footOffset(root, D, clip) {
  const mixer = new THREE.AnimationMixer(root), a = mixer.clipAction(clip).play(), feet = ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot'].map(n => D.nodes.get(n)).filter(Boolean);
  if (!feet.length) return 0;
  root.updateMatrixWorld(true); const rest = feet.map(b => b.getWorldPosition(_v).y), lows = [];
  for (let i = 0; i < 8; i++) { mixer.setTime(clip.duration * (i + .5) / 8); root.updateMatrixWorld(true); let lo = 1e9; feet.forEach((b, j) => { lo = Math.min(lo, b.getWorldPosition(_v).y - rest[j]); }); lows.push(lo); }
  a.stop(); mixer.stopAllAction(); mixer.uncacheRoot(root);
  for (const n of D.order) { const b = D.nodes.get(n); b.quaternion.copy(D.lq.get(n)); b.position.copy(D.lp.get(n)); } root.updateMatrixWorld(true);
  lows.sort((x, y) => x - y); return Math.max(-.25, Math.min(.25, -(lows[2] + lows[3]) / 2));
}

// one of the outfits on: its clothes and shoes show, the skin under them is not drawn. The women (tools/character/women)
// have one body mesh that keeps a cut of itself per outfit (bodyFits); hair~<outfits> is hidden under those outfits (a gele).
// (outfit i is one character in a part's name, 0-9 then a-z: the men have eleven)
export const outfitChar = i => (i >= 0 && i < 36 ? i.toString(36) : '-');
export function setOutfit(root, i) {
  const s = outfitChar(+i);
  root.traverse(o => { const n = o.name; let m;
    if ((m = /^o([0-9a-z])~/.exec(n))) o.visible = m[1] === s;
    else if ((m = /^shoe([0-9a-z]*)~/.exec(n))) o.visible = m[1].includes(s);
    else if ((m = /^body~([0-9a-z]*)$/.exec(n))) o.visible = !m[1].includes(s);
    else if ((m = /^hair~([0-9a-z]*)~/.exec(n))) o.visible = !m[1].includes(s);
    if (o.isMesh && o.geometry && o.geometry.userData.fits) { const F = o.geometry.userData.fits; o.geometry = F[String(i)] || F.all; } });
}
// how many outfits a person's file has
export const outfitCount = meta => (meta && meta.outfits && meta.outfits.length) || 4;

// our people's body: per vertex, the outfits that cover it (bits in the second colour set, red = 0-7, green = 8-15). One
// geometry per outfit shares the body's points and keeps only the triangles that outfit leaves showing.
function bodyFits(mesh, n) {
  const g = mesh.geometry, A = g.attributes.color_1, I = g.index; if (!A || !I) return false;
  const v = k => { const x = A.getX(k), y = A.getY(k); return A.normalized || x <= 1 ? Math.round(x * 255) | (Math.round(y * 255) << 8) : x | (y << 8); };
  const h = new Uint16Array(A.count); for (let k = 0; k < A.count; k++) h[k] = v(k);
  g.deleteAttribute('color_1');
  if (!g.boundingSphere) g.computeBoundingSphere();
  const fits = { all: g }, ix = I.array;
  for (let o = 0; o < n; o++) { const bit = 1 << o, keep = [];
    for (let t = 0; t < ix.length; t += 3) { const a = ix[t], b = ix[t + 1], c = ix[t + 2]; if (!(h[a] & h[b] & h[c] & bit)) keep.push(a, b, c); }
    const f = new THREE.BufferGeometry(); for (const k in g.attributes) f.setAttribute(k, g.attributes[k]);
    f.setIndex(g.attributes.position.count < 65536 ? keep : new THREE.BufferAttribute(Uint32Array.from(keep), 1)); f.boundingSphere = g.boundingSphere; f.boundingBox = g.boundingBox; fits[o] = f; }
  for (const k in fits) fits[k].userData.fits = fits;
  return true;
}

// the character as it comes out of the file, ready for the street
export function prepChar(gltf, { maxAniso = 4, layer = 1, shadows = true } = {}) {
  const root = gltf.scene, meta = root.userData || {}, mats = [];
  root.traverse(o => { if (/mixamorig\d+:?/.test(o.name)) o.name = o.name.replace(/mixamorig\d+:?/, 'mixamorig'); });   // some Mixamo files say mixamorig9Hips: one name for every move
  root.traverse(o => { if (o.isMesh && o.geometry && o.geometry.attributes.color_1) bodyFits(o, outfitCount(meta)); });
  root.traverse(o => { if (!o.isMesh) return; o.frustumCulled = false; o.castShadow = shadows; o.receiveShadow = true; if (layer != null) o.layers.set(layer);
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) { if (mats.includes(m)) continue; mats.push(m);
      for (const k of ['map', 'normalMap']) if (m[k]) m[k].anisotropy = maxAniso;
      if (m.alphaTest > 0) { m.transparent = false; m.depthWrite = true; }
      m.emissive = m.map ? new THREE.Color(0xffffff) : m.color.clone(); m.emissiveMap = m.map || null; m.emissiveIntensity = 0; } });   // the game lifts dark bodies at night with a little emissive (plain cloth in its own colour)
  return { root, meta, mats, info: skeletonInfo(root) };
}

// body shape for a woman: 0 slim (as she comes) .. 1 thick. Bust forward, hips wider, a fuller bottom and thighs. Works on the
// rest pose (T-pose) and moves the clothes with the body, so they stay on top. The geometry is shared by every copy of her.
const _sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function shapeBody(root, D, k = 1) {
  const J = n => D.wp.get(n), H = J('Hips'), S1 = J('Spine1'), S2 = J('Spine2'), N = J('Neck'), UL = J('LeftUpLeg'), LL = J('LeftLeg'), SH = J('LeftShoulder');
  if (!H || !S2 || !UL || !LL || !N) return false;
  const height = N.y - LL.y, s = height / .95;   // proportions of this body (about 1 for a 1.7 m woman)
  const yB = S2.y - .02 * s, yG = H.y - .045 * s, yHip = H.y - .1 * s, legX = Math.abs(UL.x - H.x), shoulder = SH ? Math.abs(SH.x - H.x) + .05 : .2;
  const zB = (S1 ? (S1.z + S2.z) / 2 : S2.z), zH = H.z;
  const v = new THREE.Vector3(), inv = new THREE.Matrix4();
  root.updateMatrixWorld(true);
  root.traverse(o => { if (!o.isMesh || !o.geometry) return; const g = o.geometry, P = g.attributes.position; if (!P) return;
    if (!g.userData.base) { const b = new Float32Array(P.count * 3); for (let i = 0; i < P.count; i++) { b[i * 3] = P.getX(i); b[i * 3 + 1] = P.getY(i); b[i * 3 + 2] = P.getZ(i); } g.userData.base = b;
      if (!(P.array instanceof Float32Array) || P.isInterleavedBufferAttribute) g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(b), 3)); }   // packed integer positions can't grow past their box
    const B = g.userData.base, Q = g.attributes.position;
    inv.copy(o.matrixWorld).invert(); const m = o.matrixWorld;
    for (let i = 0; i < P.count; i++) {
      v.set(B[i * 3], B[i * 3 + 1], B[i * 3 + 2]).applyMatrix4(m); const x = v.x - H.x, ax = Math.abs(x), y = v.y, z = v.z;
      let dx = 0, dz = 0;
      if (k > 0 && ax < shoulder) {
        // bust: two rounded mounds in front of the chest
        const wb = Math.exp(-(((y - yB) / (.075 * s)) ** 2)) * Math.exp(-(((ax - .09 * s) / (.075 * s)) ** 2)) * _sm(zB + .02 * s, zB + .09 * s, z);
        dz += .06 * s * k * wb; dx += Math.sign(x) * .01 * s * k * wb;
        // bottom: two mounds behind the hips
        const wg = Math.exp(-(((y - yG) / (.1 * s)) ** 2)) * Math.exp(-(((ax - .075 * s) / (.085 * s)) ** 2)) * _sm(zH - .0, zH - .08 * s, z);
        dz -= .075 * s * k * wg;
        // hips and thighs: wider at the sides, fuller all round down to the knee
        const wh = Math.exp(-(((y - yHip) / (.11 * s)) ** 2)) * _sm(.07 * s, .15 * s, ax);
        dx += Math.sign(x) * .05 * s * k * wh;
        if (y < H.y && y > LL.y) { const t = (H.y - y) / (H.y - LL.y), lx = Math.sign(x) * legX, wl = (1 - t) * (1 - t) * _sm(.0, .03, ax) * .14 * k;
          dx += (x - lx) * wl; dz += (z - zH) * wl; }
      }
      v.x += dx; v.z += dz; v.applyMatrix4(inv); Q.setXYZ(i, v.x, v.y, v.z); }
    Q.needsUpdate = true; g.computeBoundingSphere(); });
  return true;
}

// a pose made from where the bones point, in the body's own space (+Z forward, +Y up, +X the body's left), so it fits
// any Mixamo skeleton whatever its rest pose (T or A). keys: [{t, d:{Bone:[x,y,z], ...}}]; bones without a direction keep
// the turn of their parent. Several keys make a looping move (the first key is repeated at the end).
export function poseClip(D, name, keys, { loop = true, dur = null } = {}) {
  const ks = loop && keys.length > 1 ? [...keys, { ...keys[0], t: dur || (keys[keys.length - 1].t + (keys[1].t - keys[0].t)) }] : keys;
  const out = new Map(); for (const n of D.order) out.set(n, []);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), S = new THREE.Quaternion();
  for (const k of ks) {
    const acc = new Map(), W = new Map();
    for (const n of D.order) {
      const p = D.parent.get(n), Ap = p ? acc.get(p) : new THREE.Quaternion(); let A = Ap.clone(); const tg = k.d[n];
      if (tg) { const c = childOf(D, n); if (c) { a.copy(D.wp.get(c)).sub(D.wp.get(n)).normalize().applyQuaternion(Ap); b.set(tg[0], tg[1], tg[2]).normalize(); S.setFromUnitVectors(a, b); A = S.clone().multiply(Ap); } }
      acc.set(n, A); const w = A.clone().multiply(D.wq.get(n)); W.set(n, w);
      const l = (p ? W.get(p) : D.base.get(n)).clone().invert().multiply(w); const arr = out.get(n);
      if (arr.length >= 4) { const q0 = new THREE.Quaternion(arr[arr.length - 4], arr[arr.length - 3], arr[arr.length - 2], arr[arr.length - 1]); if (q0.dot(l) < 0) l.set(-l.x, -l.y, -l.z, -l.w); }
      arr.push(l.x, l.y, l.z, l.w); } }
  const times = Float32Array.from(ks.map(k => k.t)), tracks = [];
  for (const n of D.order) tracks.push(new THREE.QuaternionKeyframeTrack(D.nodes.get(n).name + '.quaternion', times, Float32Array.from(out.get(n))));
  return new THREE.AnimationClip(name, ks[ks.length - 1].t || 1, tracks);
}
// mirror a pose spec: left <-> right (x flips)
export function mirrorDirs(d) { const o = {}; for (const k in d) { const v = d[k]; const n = k.startsWith('Left') ? 'Right' + k.slice(4) : k.startsWith('Right') ? 'Left' + k.slice(5) : k; o[n] = [-v[0], v[1], v[2]]; } return o; }

// the house moves, until real ones arrive: where each bone points (+Z forward, +Y up, +X the body's left)
const LEGS_SIT = { LeftUpLeg: [.14, -.06, 1], RightUpLeg: [-.14, -.06, 1], LeftLeg: [.02, -1, .12], RightLeg: [-.02, -1, .12], LeftFoot: [.05, -.45, 1], RightFoot: [-.05, -.45, 1] };
const ARMS_LAP = { LeftArm: [.22, -.92, .3], LeftForeArm: [.02, -.42, 1], LeftHand: [0, -.35, 1], RightArm: [-.22, -.92, .3], RightForeArm: [-.02, -.42, 1], RightHand: [0, -.35, 1] };
const UP = (f = 0, s = 0) => [s, 1, f];
export const POSES = {
  sit: [{ t: 0, d: { ...LEGS_SIT, ...ARMS_LAP, Spine: UP(-.18), Spine1: UP(-.12), Spine2: UP(-.08), Neck: UP(.12), Head: UP(.06) } },
        { t: 2, d: { ...LEGS_SIT, ...ARMS_LAP, Spine: UP(-.2), Spine1: UP(-.14), Spine2: UP(-.06), Neck: UP(.14), Head: UP(.1) } }],
  sofa: [{ t: 0, d: { ...LEGS_SIT, LeftForeArm: [.06, -.72, .7], RightForeArm: [-.06, -.72, .7], LeftArm: [.26, -.96, -.02], RightArm: [-.26, -.96, -.02], LeftHand: [.05, -.8, .6], RightHand: [-.05, -.8, .6],
          Spine: UP(-.42), Spine1: UP(-.22), Spine2: UP(-.1), Neck: UP(.3), Head: UP(.28) } },
        { t: 2.2, d: { ...LEGS_SIT, LeftForeArm: [.06, -.7, .72], RightForeArm: [-.06, -.72, .7], LeftArm: [.26, -.96, -.02], RightArm: [-.26, -.96, -.02], LeftHand: [.05, -.8, .6], RightHand: [-.05, -.8, .6],
          Spine: UP(-.45), Spine1: UP(-.24), Spine2: UP(-.08), Neck: UP(.32), Head: UP(.3, .04) } }],
  eat: [{ t: 0, d: { ...LEGS_SIT, Spine: UP(.08), Spine1: UP(.1), Spine2: UP(.1), Neck: UP(.25), Head: UP(.3), LeftArm: [.18, -.75, .62], LeftForeArm: [-.3, -.25, 1], LeftHand: [-.3, -.3, 1],
          RightArm: [-.16, -.72, .66], RightForeArm: [.2, -.35, 1], RightHand: [.1, -.5, 1] } },
        { t: .9, d: { ...LEGS_SIT, Spine: UP(.1), Spine1: UP(.12), Spine2: UP(.1), Neck: UP(.2), Head: UP(.15), LeftArm: [.18, -.75, .62], LeftForeArm: [-.3, -.25, 1], LeftHand: [-.3, -.3, 1],
          RightArm: [-.12, -.62, .78], RightForeArm: [.45, .85, .3], RightHand: [.4, .5, -.2] } },
        { t: 1.5, d: { ...LEGS_SIT, Spine: UP(.1), Spine1: UP(.12), Spine2: UP(.1), Neck: UP(.2), Head: UP(.15), LeftArm: [.18, -.75, .62], LeftForeArm: [-.3, -.25, 1], LeftHand: [-.3, -.3, 1],
          RightArm: [-.12, -.62, .78], RightForeArm: [.45, .85, .3], RightHand: [.4, .5, -.2] } },
        { t: 2.4, d: { ...LEGS_SIT, Spine: UP(.08), Spine1: UP(.1), Spine2: UP(.1), Neck: UP(.25), Head: UP(.3), LeftArm: [.18, -.75, .62], LeftForeArm: [-.3, -.25, 1], LeftHand: [-.3, -.3, 1],
          RightArm: [-.16, -.72, .66], RightForeArm: [.2, -.35, 1], RightHand: [.1, -.5, 1] } }],
  cook: [0, 1, 2, 3].map(i => { const a = i * Math.PI / 2; return { t: i * .3, d: { Spine: UP(.12), Spine1: UP(.1), Spine2: UP(.06), Neck: UP(.3), Head: UP(.35),
          LeftArm: [.3, -.78, .55], LeftForeArm: [-.35, -.35, .85], LeftHand: [-.2, -.4, 1],
          RightArm: [-.24, -.74, .62], RightForeArm: [-.05 + .18 * Math.cos(a), -.7 + .12 * Math.sin(a), .7], RightHand: [0, -.85, .5] } }; }),
  sweep: [0, 1].map(i => { const s = i ? 1 : -1; return { t: i * .55, d: { Spine: UP(.3, .05 * s), Spine1: UP(.22), Spine2: UP(.12), Neck: UP(.2), Head: UP(.4),
          LeftArm: [.05 + .2 * s, -.8, .45], LeftForeArm: [-.3 + .35 * s, -.55, .75], LeftHand: [.2 * s, -.7, .6],
          RightArm: [-.15 + .2 * s, -.85, .3], RightForeArm: [-.15 + .35 * s, -.75, .55], RightHand: [.2 * s, -.8, .4] } }; }),
  bath: [{ t: 0, d: { Head: UP(-.25), Neck: UP(-.1), LeftArm: [.55, .35, .45], LeftForeArm: [-.45, .7, .1], LeftHand: [-.6, .5, -.3], RightArm: [-.45, -.6, .55], RightForeArm: [.55, .35, .75], RightHand: [.6, .2, .3] } },
         { t: .8, d: { Head: UP(-.25, .05), Neck: UP(-.1), LeftArm: [.45, -.6, .55], LeftForeArm: [-.55, .35, .75], LeftHand: [-.6, .2, .3], RightArm: [-.55, .35, .45], RightForeArm: [.45, .7, .1], RightHand: [.6, .5, -.3] } }],
};
