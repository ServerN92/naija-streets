// Naija Streets skateboarders (you and the street skaters): a body moved by simple physics, not by fixed poses.
// Pushing: the back foot is planted on the road and stays where it landed while the board rolls past it; the board
// speeds up only while the foot is down. Carving: the body leans into the turn as much as the speed and the turn need
// (tan lean = v·ω / g). Ollie: a quick squat, the tail snaps down and the board pivots on the back wheels, the front foot
// drags it level, the legs tuck at the top and then soak up the landing like a spring. The arms swing like damped
// pendulums from what the body really does (pushes, carves, the pop and the landing).
// Every frame each bone is turned so it points where it should (the feet stay on the deck by two-bone IK), working in
// the board's own space: +X the nose, +Y up, +Z the side the rider faces (his toes).
import * as THREE from 'three';

const G = 9.81;
const NEXT = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'HeadTop_End', Shoulder: 'Arm', Arm: 'ForeArm', ForeArm: 'Hand', Hand: 'HandMiddle1',
  UpLeg: 'Leg', Leg: 'Foot', Foot: 'ToeBase', ToeBase: 'Toe_End' };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smoother = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

// ---- tiny vector / 3x3 helpers (arrays, rows)
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.sqrt(dot(a, a));
const norm = a => { const l = len(a); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0]; };
const lerpv = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mm = (A, B) => [0, 1, 2].map(i => [0, 1, 2].map(j => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j]));
const mv = (A, v) => [A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2], A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2], A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]];
const mtv = (A, v) => [A[0][0] * v[0] + A[1][0] * v[1] + A[2][0] * v[2], A[0][1] * v[0] + A[1][1] * v[1] + A[2][1] * v[2], A[0][2] * v[0] + A[1][2] * v[1] + A[2][2] * v[2]];
const Rx = a => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
const Ry = a => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
const Rz = a => { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
// a body part turned: facing yaw (0 = +Z, the rider's front; +pi/2 = the nose), bent forward by pitch, the whole leant by lean
const partR = (lean, yaw, pitch) => mm(Rx(lean), mm(Ry(yaw), Rx(pitch)));

// two-bone IK: where the knee goes (bending toward `pole`), and the ankle (pulled in if out of reach)
function ik2(hip, target, l1, l2, pole) {
  const d = sub(target, hip), dist = len(d), u = norm(d), dc = clamp(dist, Math.abs(l1 - l2) + 1e-3, (l1 + l2) * .9995);
  const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc), hh = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  let p = sub(pole, mul(u, dot(pole, u))); p = len(p) > 1e-6 ? norm(p) : norm(cross(u, [0, 1, 0]));
  return [add(hip, add(mul(u, a), mul(p, hh))), add(hip, mul(u, dc))];
}

// ================================================================ the body
// D: skeleton info of a body (char2.skeletonInfo) taken with its root at the origin, unturned, so its space is the
// board's space when the root sits in the board's group without a turn. The body faces +Z with its left to +X.
export function skBody(D) {
  const P = n => { const v = D.wp.get(n); return v ? [v.x, v.y, v.z] : null; };
  const need = ['Hips', 'Spine', 'Neck', 'Head', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'];
  for (const n of need) if (!D.nodes.has(n)) return null;
  const hips = P('Hips'), uL = P('LeftUpLeg'), uR = P('RightUpLeg');
  const l1 = (len(sub(P('LeftLeg'), uL)) + len(sub(P('RightLeg'), uR))) / 2, l2 = (len(sub(P('LeftFoot'), P('LeftLeg'))) + len(sub(P('RightFoot'), P('RightLeg')))) / 2;
  const k = (l1 + l2) / .89;   // this body's size against a 1.8 m man
  const sole = Math.min(0, P('LeftToeBase')[1] - .005, P('RightToeBase')[1] - .005);   // bodies stand on y = 0 (else: just under the toes)
  const ankH = Math.max(.06 * k, (P('LeftFoot')[1] + P('RightFoot')[1]) / 2 - sole);   // the ankle above the sole
  const ballF = Math.max(.09 * k, (P('LeftToeBase')[2] - P('LeftFoot')[2] + P('RightToeBase')[2] - P('RightFoot')[2]) / 2);
  const B = { D, k, l1, l2, leg: l1 + l2, ankH, ballF, hips, offL: sub(uL, hips), offR: sub(uR, hips), mid: mul(add(sub(uL, hips), sub(uR, hips)), .5), bones: [], acc: new Map(), W: new Map(),
    st: null };
  // every bone: its rest direction (to the bone it points at), its rest turn, and the axis used to set its twist
  const childOf = n => { const m = /^(Left|Right)(.*)$/.exec(n), side = m ? m[1] : '', base = m ? m[2] : n; let c = NEXT[base] ? side + NEXT[base] : null;
    if (!c) { const d = /^(.*?)(\d)$/.exec(n); if (d) c = d[1] + (+d[2] + 1); } if (c && D.nodes.has(c)) return c;
    let only = null, kk = 0; for (const x of D.order) if (D.parent.get(x) === n) { only = x; kk++; } return kk === 1 ? only : null; };
  for (const n of D.order) { const c = childOf(n), a0 = c ? norm(sub(P(c), P(n))) : null;
    B.bones.push({ n, node: D.nodes.get(n), parent: D.parent.get(n), a0, wq: D.wq.get(n), base: D.base.get(n) || null, ref: /Foot|Toe/.test(n) ? [0, 1, 0] : [0, 0, 1], lp: D.lp.get(n) });
    B.acc.set(n, new THREE.Quaternion()); B.W.set(n, new THREE.Quaternion()); }
  B.footDirL = norm(sub(P('LeftToeBase'), P('LeftFoot'))); B.footDirR = norm(sub(P('RightToeBase'), P('RightFoot')));
  skBodyReset(B);
  return B;
}
export function skBodyReset(B) {
  B.st = { sb: 1, ext: null, extV: 0, arms: { L: null, R: null }, pel: null, pelV: [0, 0, 0], acc: [0, 0, 0], spPrev: null, lean: 0, footB: null, footF: null, look: 0 };
}

// ================================================================ the ride: pushes, brakes, the ollie (shared by you and the street skaters)
// S: the skater's state; inp: {push, hard, brake, pop, cap, rough, vy0, grav, x, z, h (the board on the map), k (body size),
//   rest (optional: after pushing up to top speed, ride free until the speed is down to this share of it)}
// returns what happened: {popped, landed, kick (speed added this frame)}
export function skNew() { return { sp: 0, h: 0, vy: 0, air: false, crouch: 0, popT: 9, land: 0, landV: 0, push: null, brake: 0, trick: null, t: 0, pump: false, restT: 0 }; }
const PLANT = k => [.30 * k, 0, .27 * k];   // where the pushing foot (the ball of it) comes down, by the board's side
export function skMove(S, dt, inp) {
  const ev = { popped: false, landed: false }, k = inp.k || 1, cap = inp.cap || 8;
  S.t += dt; S.popT += dt;
  const toBoard = (wx, wz) => { const dx = wx - inp.x, dz = wz - inp.z, c = Math.cos(inp.h), s = Math.sin(inp.h); return [dx * c - dz * s, dx * s + dz * c]; };
  const toWorld = (bx, bz) => { const c = Math.cos(inp.h), s = Math.sin(inp.h); return [inp.x + bx * c + bz * s, inp.z - bx * s + bz * c]; };
  if (!S.air) {
    const Pu = S.push, want = inp.push && !inp.brake;
    // push up to top speed (until a push hardly adds any more), then rest on the board and roll; push again once the
    // speed has dropped to `rest` of the top it reached
    if (inp.rest) { S.restT = Math.max(0, S.restT - dt);
      if (!want) S.pump = false;
      else if (!S.pump && (S.restT <= 0 && S.sp < (S.top || cap) * inp.rest || S.sp < 1.2)) { S.pump = true; S.plantSp = null; }
      if (S.pump && S.sp >= cap - .6) { S.pump = false; S.top = Math.min(cap, S.sp); S.restT = 2.5; } }
    const go = inp.rest ? S.pump && want : want;
    if (S.crouch > 0 || inp.brake) { if (Pu && Pu.st !== 'home') S.push = { st: 'home', t: 0, dur: .14 }; }
    else if (!Pu && go && S.sp < cap - .3 && S.land <= 0) S.push = { st: 'swing', t: 0, dur: inp.hard ? .17 : .24, hard: inp.hard };
    const p = S.push;
    if (p) { p.t += dt;
      if (p.st === 'swing' && p.t >= p.dur && inp.rest && S.pump && S.plantSp != null && S.sp > 2.5 && S.sp - S.plantSp < .12) {   // the last push hardly added anything: that's the top, rest
        S.pump = false; S.top = Math.min(cap, S.sp); S.restT = 2.5; S.push = { st: 'home', t: 0, dur: .3 }; }
      else if (p.st === 'swing' && p.t >= p.dur) {   // the foot comes down: it stays on that spot of the road
        if (inp.rest) S.plantSp = S.sp;
        const pl = PLANT(k), [wx, wz] = toWorld(pl[0], pl[2]), dv = Math.max(0, cap - S.sp) * (inp.hard ? .34 : .28) / Math.sqrt(inp.rough || 1), tc = clamp(.62 * k / Math.max(S.sp, .8), .14, .38);
        Object.assign(p, { st: 'contact', t: 0, wx, wz, a: dv / tc, hard: inp.hard }); ev.plant = true; }
      if (p.st === 'contact') { const [bx] = toBoard(p.wx, p.wz); S.sp += p.a * dt; ev.kick = p.a * dt;
        if (bx < -.34 * k || p.t > .42) {   // the leg is stretched out behind: lift it, push again or step back on
          const again = go && S.sp < cap - .3; S.push = again ? { st: 'swing', t: 0, dur: (inp.hard ? .17 : .24) + .1, hard: inp.hard } : { st: 'home', t: 0, dur: .3 }; } }
      else if (p.st === 'home' && p.t >= p.dur) S.push = null; }
    if (inp.brake) { S.sp = Math.max(0, S.sp - 3.6 * dt); S.brake = Math.min(1, S.brake + dt * 5); } else S.brake = Math.max(0, S.brake - dt * 5);
    S.sp = Math.max(0, S.sp - (.14 + S.sp * .016) * (inp.rough || 1) * dt);   // it rolls on and on, slower on bad roads
    if (inp.pop && S.crouch <= 0 && S.land <= 0) S.crouch = inp.crouchT || .2;   // squat first...
    if (S.crouch > 0 && (S.crouch -= dt) <= 0) { S.crouch = 0; S.air = true; S.vy = inp.vy0 || 4.4; S.popT = 0; S.push = null; ev.popped = true; }   // ...then the pop
    if (S.land > 0) S.land -= dt;
  } else {
    S.vy -= (inp.grav || 11.5) * dt; S.h = Math.max(0, S.h + S.vy * dt);
    if (S.h <= 0 && S.vy < 0) { S.air = false; S.landV = S.vy; S.vy = 0; S.h = 0; S.land = .25; ev.landed = true; }
  }
  return ev;
}

// ================================================================ the pose
// env: {deck (top of the deck above the board's bottom), deckAt (optional: x -> top of the deck there, for the kicked
//       nose and tail), L (board length), W (board width), om (turn rate, + = left), lean (how far the board itself is
//       leant), x, z, h (the board on the map), trick: {roll, spin, q} or null, grab (0..1: knees up, chest down), vy0}
// returns {root: [x,y,z] (where the body's root goes in the board's space), board: {px,py,pz,pitch} (the deck's own move)}
const _m4 = new THREE.Matrix4(), _qa = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vr = new THREE.Vector3(), _vh = new THREE.Vector3(), _I = new THREE.Quaternion();
export function skPose(B, S, dt, env) {
  const st = B.st, k = B.k, L = env.L || .82, deck = env.deck || .12, sp = S.sp, om = env.om || 0;
  const dts = Math.max(dt, 1e-4);
  // ---- the deck: the tail snaps down (pivot on the back wheels), then the front foot drags it level
  const pivX = .225 * L; let al = 0;
  if (!S.air && S.crouch > 0 && S.crouch < .06) al = .42 * smoother(.06, 0, S.crouch);
  else if (S.air) { const t = S.popT; al = t < .22 ? .42 * (1 - smoother(0, .22, t)) : -.05 * smooth(.22, .32, t) * (1 - smooth(.42, .62, t)); }
  const Rb = Rz(al), tb = [-pivX + pivX * Math.cos(al), pivX * Math.sin(al), 0];
  const trick = env.trick;   // a flip or a shove-it: the feet come off and the legs pull up over the board
  const deckH = env.deckAt || (() => deck), slopeAt = x => env.deckAt ? Math.atan((deckH(x + .02) - deckH(x - .02)) / .04) : 0;
  const deckPt = (x, z, lift = 0) => add(tb, mv(Rb, [x, deckH(x) + lift, z]));
  const grab = env.grab || 0;

  // ---- stance: side-on riding (sb 1) or facing the nose to push (sb 0)
  const pushing = S.push && S.push.st !== 'home', braking = S.brake > .05;
  const sbT = pushing ? 0 : braking ? .35 : 1; st.sb += clamp(sbT - st.sb, -dts / .28, dts / .28); const sb = smoother(0, 1, st.sb);
  const carve = clamp(Math.abs(om) * Math.max(sp, 1) / 3, 0, 1);

  // ---- the turn: lean = atan(v·ω/g), the board leans about half of it
  const leanT = clamp(-Math.atan(sp * om / G), -.42, .42); st.lean += (leanT - st.lean) * Math.min(1, dts * 8);
  const leanX = (st.lean - (env.lean || 0)) * sb;   // what the body leans on top of the board's own lean

  // ---- the feet
  const crouchK = S.crouch > 0 ? smooth(.16, .04, S.crouch) : 0, flick = S.air ? smooth(0, .12, S.popT) * (1 - smooth(.3, .5, S.popT)) : 0;
  const xfRide = (.19 - .07 * crouchK + .2 * flick) * L, zf = -.068 * k;   // the ankles a little toward the heel side: the feet themselves lie across the middle
  // the back foot rides over the back bolts and slides onto the tail to pop
  const onTail = Math.max(crouchK, S.air ? 1 - smooth(.3, .6, S.popT) : 0), xb = lerp(-.30, -.37, onTail) * L;
  const xfF = lerp(.15 * L, xfRide, sb), zfF = lerp(0, zf, sb), yawF = lerp(Math.PI / 2 - .12, .25 - .2 * flick, sb);
  let liftF = .03 * flick * k, liftB = (S.air ? .025 * smooth(.08, .2, S.popT) * (1 - smooth(.3, .5, S.popT)) : 0) * k;
  if (trick) { const e = Math.sin(Math.PI * clamp(trick.q, 0, 1)); liftF += .16 * k * e; liftB += .16 * k * e; }
  const RfF = mm(trick ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : mm(Rb, Rz(slopeAt(xfF))), mm(Ry(yawF), Rx(-.2 * flick)));
  const ptF = trick ? [xfF, deck + liftF, zfF] : deckPt(xfF, zfF, liftF);
  const ankF = add(ptF, mv(RfF, [0, B.ankH, 0]));
  // the back foot: on the tail, swinging out to push, planted on the road, or dragging to brake
  const tailPt = trick ? [xb, deck + liftB, zf] : deckPt(xb, zf, liftB), RfTail = mm(trick ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : mm(Rb, Rz(slopeAt(xb))), Ry(.08));
  const ankTail = add(tailPt, mv(RfTail, [0, B.ankH, 0]));
  const ball = [0, -B.ankH, B.ballF];   // the ball of the foot from the ankle (foot's own space)
  const toBoard = (wx, wz) => { const dx = wx - env.x, dz = wz - env.z, c = Math.cos(env.h), s = Math.sin(env.h); return [dx * c - dz * s, dx * s + dz * c]; };
  let ankB, RfB, depth = 0, legBack = 0;
  const p = S.push, yawOf = R => Math.atan2(R[0][2], R[2][2]);
  if (p && p.st === 'contact') {   // planted: the foot stays on its spot of the road, the heel lifts as it trails behind
    const [bx, bz] = toBoard(p.wx, p.wz), prog = clamp((.30 * k - bx) / (.64 * k), 0, 1); RfB = mm(Ry(Math.PI / 2), Rx(.45 * smooth(.5, 1, prog)));
    ankB = sub([bx, 0, bz], mv(RfB, ball)); depth = smooth(0, .7, prog); legBack = clamp((.05 * k - bx) / (.35 * k), -1, 1);
  } else if (p) {   // in the air: from where it was to the next spot on the road (or back onto the tail)
    const u = smoother(0, 1, p.t / p.dur), from = p.from || (p.from = st.lastB || { a: ankTail, R: RfTail });
    if (p.st === 'swing') { const Rpl = Ry(Math.PI / 2), a1 = sub(PLANT(k), mv(Rpl, ball)); ankB = add(lerpv(from.a, a1, u), [0, .11 * k * Math.sin(Math.PI * u), 0]); RfB = Ry(lerp(yawOf(from.R), Math.PI / 2, u)); depth = 1 - smooth(0, .5, u); legBack = lerp(1, -.6, u); }
    else { ankB = add(lerpv(from.a, ankTail, u), [0, .1 * k * Math.sin(Math.PI * u), 0]); RfB = mm(Rb, mm(Rz(slopeAt(xb) * u), Ry(lerp(yawOf(from.R), .08, u)))); }
  } else if (braking && !S.air) {   // the back foot comes off and drags its heel on the road beside the tail
    const Rd = mm(Ry(.9), Rx(-.35)), a = add([-.12 * L, 0, .2 * k], mv(Rd, [0, B.ankH * .9, 0]));
    ankB = lerpv(ankTail, a, S.brake); RfB = S.brake > .5 ? Rd : RfTail;
  } else { ankB = ankTail; RfB = RfTail; }
  st.lastB = { a: ankB, R: RfB };

  // ---- the hips: how high (a spring: squat, pop, tuck, soak up the landing) and where
  const leg = B.leg, ride = B.ankH + .88 * leg - .06 * leg * carve;
  let extT = ride;
  if (S.crouch > 0) extT = B.ankH + .63 * leg;
  else if (S.air) { const v0 = env.vy0 || 4.4, r = clamp(S.vy / v0, -1, 1); extT = B.ankH + (r > 0 ? lerp(.62, .92, r * r) : lerp(.62, .86, Math.sqrt(-r))) * leg; if (trick) extT = Math.min(extT, B.ankH + .6 * leg); extT = lerp(extT, B.ankH + .22 * leg, grab); }
  if (st.ext == null) st.ext = ride;
  if (S.land > .24 && S.landV < 0) { st.extV = Math.min(st.extV, S.landV * .32); S.landV = 0; }   // touchdown: the legs give
  if (S.air && !st.popped) { st.extV += 2.2 * k; st.popped = true; } else if (!S.air) st.popped = false;   // the pop: the legs drive up
  { const w = S.crouch > 0 ? 22 : 15, z = .78, n = Math.max(1, Math.ceil(dts / .008)), h = dts / n; for (let i = 0; i < n; i++) { st.extV += (w * w * (extT - st.ext) - 2 * z * w * st.extV) * h; st.ext += st.extV * h; } }
  st.ext = clamp(st.ext, B.ankH + lerp(.5, .2, grab) * leg, B.ankH + .99 * leg);
  const hipRide = [(xfF + xb) / 2, deck + st.ext, -.02 * k], hipPush = [(.06 - .04 * depth) * k, deck + B.ankH + (.79 - .07 * depth) * leg, .075 * k];
  let hipT = lerpv(hipPush, hipRide, sb);
  // ---- turns of the hips, chest and head
  const crouchW = S.crouch > 0 ? 1 : S.land > 0 ? .7 * S.land / .25 : 0;
  const yawP = lerp(1.45, .12, sb), pitP = lerp(.26, .12, sb) + .18 * crouchW + .4 * grab, yawC = lerp(1.52, .40, sb) + .6 * st.lean * sb - .35 * grab, pitC = lerp(.36 + .12 * depth, .2, sb) + .3 * crouchW - (S.air ? .08 : 0) + .85 * grab;
  const yawH = lerp(1.57, 1.2, sb), pitH = lerp(.22, .12, sb) + .15 * crouchW;
  const Rp = partR(leanX, yawP, pitP), Rc = partR(leanX, yawC, pitC), Rh = partR(.35 * leanX, yawH, pitH);
  const pivot = [0, deck, 0];
  const lean = p0 => add(pivot, mv(Rx(leanX), sub(p0, pivot)));
  // keep both feet on: never stretch a leg past its length
  let hipJ, hipL, hipR;
  for (let it = 0; it < 6; it++) { hipJ = lean(hipT); hipL = add(hipJ, mv(Rp, sub(B.offL, B.mid))); hipR = add(hipJ, mv(Rp, sub(B.offR, B.mid)));
    const ex = Math.max(len(sub(hipL, ankF)), len(sub(hipR, ankB))) - .985 * leg; if (ex <= 0) break; hipT = [hipT[0], hipT[1] - ex * 1.1, hipT[2]]; }
  const fwdP = mv(Rp, [0, 0, 1]);
  const poleF = norm(add(mv(RfF, [0, 0, 1]), fwdP)), poleB = norm(add(mv(RfB, [0, 0, 1]), fwdP));
  const [kneeL, aL] = ik2(hipL, ankF, B.l1, B.l2, poleF), [kneeR, aR] = ik2(hipR, ankB, B.l1, B.l2, poleB);

  // ---- the arms: damped pendulums pushed by the body's real accelerations
  const hipsW = sub(hipJ, mv(Rp, B.mid));   // where the Hips bone goes
  const pw = [hipJ[0], hipJ[1] + S.h, hipJ[2]]; if (!st.pel || dt <= 0) { st.pel = pw; st.pelV = [0, 0, 0]; }
  const vel = mul(sub(pw, st.pel), 1 / dts); st.pel = pw;
  const aRaw = dt > 0 ? add(mul(sub(vel, st.pelV), 1 / dts), [st.spPrev == null ? 0 : (sp - st.spPrev) / dts, 0, -sp * om]) : [0, 0, 0]; st.pelV = vel; st.spPrev = sp;
  if (S.air) aRaw[1] = -(env.grav || 11.5);   // in the air the upper body just falls; the legs tucking under it don't shake the arms
  for (let i = 0; i < 3; i++) st.acc[i] += (clamp(aRaw[i], -25, 25) - st.acc[i]) * Math.min(1, dts * 20);
  const ac = mtv(Rc, st.acc).map(v => clamp(v, -30, 30));
  const airW = S.air ? smooth(0, .06, S.popT) : 0, landW = !S.air && S.land > 0 ? S.land / .25 : 0;
  const mix = (c, g, w) => c.map((v, i) => lerp(v, g[i], w));
  let tL = [lerp(.20, .26 + .2 * carve, sb), lerp(.12 - .5 * legBack, .12, sb), lerp(.55, .5, sb)], tR = [lerp(.20, .2 + .16 * carve, sb), lerp(.12 + .5 * legBack, .04, sb), lerp(.55, .55, sb)];
  tL = mix(tL, [.22, -.45, .3], crouchK); tR = mix(tR, [.22, -.45, .3], crouchK);
  tL = mix(tL, [.8, .3, .6], airW); tR = mix(tR, [.7, .22, .55], airW);
  tL = mix(tL, [.75, .2, .5], landW); tR = mix(tR, [.7, .15, .5], landW);
  if (braking) { tL = mix(tL, [.45, .45, .7], S.brake * .6); tR = mix(tR, [.4, .5, .7], S.brake * .6); }
  const Wn = 8, Zt = .6, Kp = .4, Lp = .55 * k;
  for (const [side, sg, tg] of [['L', 1, tL], ['R', -1, tR]]) {
    let s = st.arms[side]; if (!s) s = st.arms[side] = [tg[0], 0, tg[1], 0, tg[2], 0];
    const n = Math.max(1, Math.ceil(dts / .008)), h = dts / n;
    for (let i = 0; i < n; i++) {
      const fa = Wn * Wn * (tg[0] - s[0]) - 2 * Zt * Wn * s[1] - Kp * (sg * ac[0] * Math.cos(s[0]) + ac[1] * Math.sin(s[0])) / Lp;
      const ff = Wn * Wn * (tg[1] - s[2]) - 2 * Zt * Wn * s[3] - Kp * (ac[2] + ac[1] * Math.sin(s[2])) / Lp;
      const fe = 196 * (tg[2] - s[4]) - 19.6 * s[5];
      s[1] += fa * h; s[0] += s[1] * h; s[3] += ff * h; s[2] += s[3] * h; s[5] += fe * h; s[4] += s[5] * h; }
    s[0] = clamp(s[0], .02, 1.2); s[2] = clamp(s[2], -.9, 1.1); s[4] = clamp(s[4], .05, 2.2); }

  // ---- every bone points where it should
  const T = B.tgt || (B.tgt = {}); for (const n in T) T[n] = null;
  const up = R => mv(R, [0, 1, 0]), fw = R => mv(R, [0, 0, 1]);
  const pu = up(Rp), cu = up(Rc), hu = up(Rh), pf = fwdP, cf = fw(Rc), hf = fw(Rh);
  T.Hips = { R: Rp };
  T.Spine = { d: norm(lerpv(pu, cu, .35)), h: norm(lerpv(pf, cf, .35)) }; T.Spine1 = { d: norm(lerpv(pu, cu, .7)), h: norm(lerpv(pf, cf, .7)) }; T.Spine2 = { d: cu, h: cf };
  T.Neck = { d: norm(add(cu, hu)), h: norm(add(cf, hf)) }; T.Head = { d: hu, h: hf };
  T.LeftUpLeg = { d: norm(sub(kneeL, hipL)), h: poleF }; T.LeftLeg = { d: norm(sub(aL, kneeL)), h: poleF };
  T.RightUpLeg = { d: norm(sub(kneeR, hipR)), h: poleB }; T.RightLeg = { d: norm(sub(aR, kneeR)), h: poleB };
  T.LeftFoot = { d: mv(RfF, B.footDirL), h: mv(RfF, [0, 1, 0]) }; T.RightFoot = { d: mv(RfB, B.footDirR), h: mv(RfB, [0, 1, 0]) };
  const armHint = norm(mv(Rc, [0, .6, 1]));
  for (const [side, sg] of [['Left', 1], ['Right', -1]]) {
    const sa = st.arms[side[0]], a = sa[0], f = sa[2], e = sa[4], ul = norm([sg * Math.sin(a) * Math.cos(f), -Math.cos(a) * Math.cos(f), Math.sin(f)]), u = mv(Rc, ul);
    const he = mv(Rc, norm([sg * .15, .45, 1])); let perp = sub(he, mul(u, dot(he, u))); perp = len(perp) > 1e-4 ? norm(perp) : cu;
    const fd = add(mul(u, Math.cos(e)), mul(perp, Math.sin(e))), hd = norm(add(fd, mul(perp, .12)));
    T[side + 'Arm'] = { d: u, h: armHint }; T[side + 'ForeArm'] = { d: fd, h: armHint }; T[side + 'Hand'] = { d: hd, h: armHint }; }
  applyTargets(B, T);
  const hr = B.hips;   // the root goes where the Hips bone must be
  return { root: sub(hipsW, hr), board: { px: tb[0], py: tb[1], pz: tb[2], pitch: al } };
}

// turn every bone toward its target (direction d; twist so its reference axis faces h), parents first
function applyTargets(B, T) {
  for (const b of B.bones) {
    const A = B.acc.get(b.n), Ap = b.parent ? B.acc.get(b.parent) : _I; A.copy(Ap);
    const t = T[b.n];
    if (t && t.R) { const R = t.R; _m4.set(R[0][0], R[0][1], R[0][2], 0, R[1][0], R[1][1], R[1][2], 0, R[2][0], R[2][1], R[2][2], 0, 0, 0, 0, 1); A.setFromRotationMatrix(_m4); }
    else if (t && b.a0) {
      _va.set(b.a0[0], b.a0[1], b.a0[2]).applyQuaternion(Ap); _vb.set(t.d[0], t.d[1], t.d[2]).normalize();
      _qs.setFromUnitVectors(_va, _vb); A.premultiply(_qs);
      if (t.h) { _vr.set(b.ref[0], b.ref[1], b.ref[2]).applyQuaternion(A); _vh.set(t.h[0], t.h[1], t.h[2]);
        _vr.addScaledVector(_vb, -_vr.dot(_vb)); _vh.addScaledVector(_vb, -_vh.dot(_vb));
        if (_vr.lengthSq() > 1e-6 && _vh.lengthSq() > 1e-6) { _vr.normalize(); _vh.normalize(); const ang = Math.atan2(_va.crossVectors(_vr, _vh).dot(_vb), _vr.dot(_vh)); _qt.setFromAxisAngle(_vb, ang); A.premultiply(_qt); } } }
    const W = B.W.get(b.n); W.multiplyQuaternions(A, b.wq);
    _qa.copy(b.parent ? B.W.get(b.parent) : (b.base || _I)).invert().multiply(W); b.node.quaternion.copy(_qa);
    if (b.n === 'Hips' && b.lp) b.node.position.copy(b.lp);
  }
}
