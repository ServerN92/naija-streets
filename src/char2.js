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
const CHAIN = { Hips: 'Spine', Spine2: 'Neck', LeftHand: 'LeftHandMiddle1', RightHand: 'RightHandMiddle1', LeftFoot: 'LeftToeBase', RightFoot: 'RightToeBase' };
function childOf(I, n) { if (CHAIN[n] && I.nodes.has(CHAIN[n])) return CHAIN[n]; let c = null, k = 0; for (const m of I.order) if (I.parent.get(m) === n) { c = m; k++; } return k === 1 ? c : null; }

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

// one of the four outfits on: its clothes and shoes show, the skin under them is not drawn
export function setOutfit(root, i) {
  const s = String(i);
  root.traverse(o => { const n = o.name; let m;
    if ((m = /^o(\d)~/.exec(n))) o.visible = m[1] === s;
    else if ((m = /^shoe(\d*)~/.exec(n))) o.visible = m[1].includes(s);
    else if ((m = /^body~(\d*)$/.exec(n))) o.visible = !m[1].includes(s); });
}

// the character as it comes out of the file, ready for the street
export function prepChar(gltf, { maxAniso = 4, layer = 1, shadows = true } = {}) {
  const root = gltf.scene, meta = root.userData || {}, mats = [];
  root.traverse(o => { if (!o.isMesh) return; o.frustumCulled = false; o.castShadow = shadows; o.receiveShadow = true; if (layer != null) o.layers.set(layer);
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) { if (mats.includes(m)) continue; mats.push(m);
      for (const k of ['map', 'normalMap']) if (m[k]) m[k].anisotropy = maxAniso;
      if (m.alphaTest > 0) { m.transparent = false; m.depthWrite = true; }
      m.emissive = new THREE.Color(0xffffff); m.emissiveMap = m.map || null; m.emissiveIntensity = 0; } });   // the game lifts dark bodies at night with a little emissive
  return { root, meta, mats, info: skeletonInfo(root) };
}
