/* ================= street football =================
   Two kinds of pitch, made in Blender (pitch.blend): the SANDLOT (laterite, chalk lines, the kiosk, zinc fence, painted wall)
   and THE CAGE (painted concrete, kick boards, chain-link fence, floodlights, the CAGE KINGS mural). Four of them on the map:
   two in school compounds, two on the street. When nobody plays, the area boys there kick a ball about.
   Walk to the sign and play a match: 5-a-side, you and four boys against an area team. You play as yourself:
     run, sprint, pass (or call for the ball), shoot (hold for power, aim with the stick), slide tackle.
   Your teammates and the other team play by themselves; the keepers come out and dive.
   The TV camera from the touchline (or behind you), a GOAL! with the net bulging, the scorer's celebration, a slow-motion
   replay from behind the goal, a full-time table with the prize. In the cage the ball comes back off the boards;
   on the sandlot it goes out (kick-ins, corners, goal kicks).
   Moves (shot, pass, keeper dives, knee slide, airplane...) are poses made here, fitted to any of our people (char2 poseClip).
   The game passes in `api`; everything football lives in this file. */

const TAU = Math.PI * 2, clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a), gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
const angD = (a, b) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

// the two pitches (set-local metres; u = along the pitch, v = across; goals at u = ±hx)
const KINDS = {
  cage: { n: 5, hx: 18, hz: 10, gw: 2.0, gh: 2.0, gd: 1.2, walls: true, roll: .55, box: 6, boxW: 5, shoot: 13, intro: [1.25, 9], repD: 4.5, cam: { d: 7.5, h: 7, fov: 44 }, len: 180, name: 'The Cage' },
  sand: { n: 5, hx: 25, hz: 15, gw: 2.5, gh: 2.1, gd: 1.3, walls: false, roll: 1.05, box: 6, boxW: 5.5, shoot: 17, intro: [1.25, 9], repD: 4.5, cam: { d: 9.5, h: 8, fov: 42 }, len: 240, name: 'Sandlot' },
  stadium: { n: 11, hx: 50, hz: 32, gw: 3.66, gh: 2.44, gd: 2.2, walls: false, roll: .6, box: 16.5, boxW: 20.2, shoot: 24, intro: [.75, 22], repD: 2.4, cam: { d: 12, h: 14, fov: 40 }, len: 300, name: 'Stadium' },
};
const BR = .11, G = 9.81;
const STAD_TEAMS = [['Eko United', '#c62828', '#ffffff'], ['Oyo Thunder', '#1565c0', '#ffffff'], ['Delta Royals', '#6a1b9a', '#f4c20d'], ['Arewa Stars', '#f9a825', '#111111'], ['Coal City Boys', '#212121', '#ffffff']];
const TEAMS = [['Area Boys FC', '#d32f2f', '#f5f5f5'], ['Mushin Stars', '#1e5bd8', '#ffffff'], ['Ojuelegba United', '#f4c20d', '#111111'], ['Idi-Araba Rangers', '#7b1fa2', '#ffffff'],
  ['Ilupeju Lions', '#ef6c00', '#111111'], ['Surulere Boys', '#f2f2f2', '#111111']];
const MY_KIT = ['#0f9d58', '#ffffff'];   // your side: green and white
const NAMES = ['Tobi', 'Chidi', 'Femi', 'Kunle', 'Emeka', 'Sadiq', 'Dayo', 'Ifeanyi', 'Bayo', 'Uche', 'Segun', 'Musa', 'Jide', 'Obinna', 'Wale', 'Tunde', 'Ayo', 'Kelechi', 'Lanre', 'Gbenga'];
const CASTS = ['p_emeka', 'p_dayo', 'p_chidi', 'p_segun'];   // four faces (and skin tones) make ten boys: fewer files to download
// 5-a-side: keeper, back, two wide, striker (u as a fraction of the half, v of the width) - you are the striker
const FORM = [{ r: 'gk', u: -.95, v: 0 }, { r: 'def', u: -.6, v: 0 }, { r: 'lw', u: -.2, v: -.55, att: 1 }, { r: 'rw', u: -.2, v: .55, att: 1 }, { r: 'fwd', u: .25, v: 0, att: 1 }];
// 11-a-side in the stadium: 4-3-3, you up front (9), the right winger (10) kicks off with you
const FORM11 = [{ r: 'gk', u: -.96, v: 0 }, { r: 'lb', u: -.62, v: -.62 }, { r: 'cb', u: -.7, v: -.22 }, { r: 'cb', u: -.7, v: .22 }, { r: 'rb', u: -.62, v: .62 },
  { r: 'cm', u: -.32, v: -.32 }, { r: 'cm', u: -.4, v: 0 }, { r: 'cm', u: -.32, v: .32, att: 1 }, { r: 'lw', u: .02, v: -.62, att: 1 }, { r: 'fwd', u: .18, v: 0, att: 1 }, { r: 'rw', u: .02, v: .62, att: 1 }];
const formOf = K => K.n === 11 ? FORM11 : FORM, meOf = K => K.n === 11 ? 9 : 4, mateOf = K => K.n === 11 ? 10 : 3;

// ---------------------------------------------------------------- the moves (where the bones point: +Z forward, +Y up, +X the body's left)
const UP = (f = 0, s = 0) => [s, 1, f];
const STAND = { Spine: UP(.04), Spine1: UP(.03), Spine2: UP(.02), Neck: UP(.05), Head: UP(.04), LeftUpLeg: [.03, -1, .02], RightUpLeg: [-.03, -1, .02], LeftLeg: [0, -1, -.03], RightLeg: [0, -1, -.03],
  LeftFoot: [.05, -.5, 1], RightFoot: [-.05, -.5, 1], LeftArm: [.28, -.96, .05], RightArm: [-.28, -.96, .05], LeftForeArm: [.12, -.9, .4], RightForeArm: [-.12, -.9, .4], LeftHand: [.05, -.8, .5], RightHand: [-.05, -.8, .5] };
const P = (o) => ({ ...STAND, ...o });
const mir = d => { const o = {}; for (const k in d) { const v = d[k], n = k.startsWith('Left') ? 'Right' + k.slice(4) : k.startsWith('Right') ? 'Left' + k.slice(5) : k; o[n] = [-v[0], v[1], v[2]]; } return o; };
const MOVES = {
  // a driven shot with the right foot: plant, the leg goes back, through the ball (t .3), follow through high
  shoot: { dur: .95, keys: [
    { t: 0, d: P({ Spine: UP(.18), Spine1: UP(.12), LeftUpLeg: [0, -1, .3], LeftLeg: [0, -1, .05], RightUpLeg: [0, -.95, -.3], RightLeg: [0, -.7, -.7], RightFoot: [0, -.2, 1], LeftArm: [.6, -.8, .1], RightArm: [-.35, -.9, .25] }) },
    { t: .16, d: P({ Spine: UP(.02, -.08), Spine1: UP(0, -.06), Spine2: UP(-.02), LeftUpLeg: [0, -1, .22], LeftLeg: [0, -1, .02], RightUpLeg: [-.05, -.85, -.55], RightLeg: [-.05, -.15, -1], RightFoot: [0, .55, -.85], LeftArm: [.92, -.35, .15], LeftForeArm: [.8, -.3, .5], RightArm: [-.45, -.6, .65], RightForeArm: [-.2, -.4, 1] }) },
    { t: .3, d: P({ Spine: UP(.16), Spine1: UP(.1), LeftUpLeg: [0, -1, .08], LeftLeg: [0, -1, -.02], RightUpLeg: [-.02, -.88, .5], RightLeg: [-.02, -.85, .55], RightFoot: [0, -.95, .35], LeftArm: [.95, -.25, -.1], LeftForeArm: [.9, -.2, .2], RightArm: [-.55, -.7, .45] }) },
    { t: .46, d: P({ Spine: UP(-.14), Spine1: UP(-.1), Neck: UP(.1), LeftUpLeg: [0, -1, .02], LeftLeg: [0, -1, -.05], LeftFoot: [.05, -.8, .6], RightUpLeg: [0, -.15, 1], RightLeg: [0, -.05, 1], RightFoot: [0, -.45, 1], LeftArm: [.75, -.45, -.45], RightArm: [-.6, -.5, .55], RightForeArm: [-.3, -.4, 1] }) },
    { t: .66, d: P({ Spine: UP(.08), RightUpLeg: [0, -.75, .65], RightLeg: [0, -.95, .25], LeftArm: [.5, -.85, 0], RightArm: [-.45, -.85, .2] }) },
    { t: .95, d: P({}) }], hips: [[0, 0, 1, 0], [.3, 0, .98, 0], [.46, 0, 1.03, 0], [.95, 0, 1, 0]] },
  // a side-foot pass
  pass: { dur: .6, keys: [
    { t: 0, d: P({ Spine: UP(.1), LeftUpLeg: [0, -1, .15], RightUpLeg: [-.05, -.98, -.2], RightLeg: [-.05, -.85, -.5] }) },
    { t: .14, d: P({ Spine: UP(.06), LeftUpLeg: [0, -1, .1], RightUpLeg: [-.12, -.95, -.32], RightLeg: [-.12, -.75, -.65], RightFoot: [-.95, -.3, .1], LeftArm: [.55, -.8, .1], RightArm: [-.4, -.85, .3] }) },
    { t: .24, d: P({ Spine: UP(.12), RightUpLeg: [.08, -.95, .3], RightLeg: [.08, -1, .18], RightFoot: [-.95, -.28, .2], LeftArm: [.5, -.85, -.1], RightArm: [-.45, -.8, .35] }) },
    { t: .36, d: P({ Spine: UP(.06), RightUpLeg: [.18, -.8, .55], RightLeg: [.15, -.95, .32], RightFoot: [-.9, -.3, .3] }) },
    { t: .6, d: P({}) }] },
  // a header: up, back, snap forward
  header: { dur: .8, keys: [
    { t: 0, d: P({ Spine: UP(.2), LeftUpLeg: [.05, -.85, .45], RightUpLeg: [-.05, -.85, .45], LeftLeg: [0, -1, -.4], RightLeg: [0, -1, -.4] }) },
    { t: .22, d: P({ Spine: UP(-.35), Spine1: UP(-.25), Neck: UP(-.3), Head: UP(-.4), LeftUpLeg: [.05, -1, -.1], RightUpLeg: [-.05, -1, -.1], LeftLeg: [0, -.6, -.8], RightLeg: [0, -.6, -.8], LeftArm: [.85, -.2, .2], RightArm: [-.85, -.2, .2] }) },
    { t: .36, d: P({ Spine: UP(.4), Spine1: UP(.35), Neck: UP(.5), Head: UP(.9), LeftUpLeg: [.05, -1, .2], RightUpLeg: [-.05, -1, .2], LeftArm: [.75, -.6, -.2], RightArm: [-.75, -.6, -.2] }) },
    { t: .8, d: P({}) }], hips: [[0, 0, .9, 0], [.22, 0, 1.45, 0], [.4, 0, 1.4, 0], [.62, 0, 1, 0], [.8, 0, 1, 0]] },
  // a slide tackle: down on the left hip, the right leg out at the ball
  slide: { dur: 1.1, keys: [
    { t: 0, d: P({ Spine: UP(.25), LeftUpLeg: [0, -.9, .45], RightUpLeg: [0, -.9, -.3], RightLeg: [0, -.5, -.85] }) },
    { t: .18, d: P({ Hips: UP(-.45, .2), Spine: UP(-.5, .25), Spine1: UP(-.45, .15), Neck: UP(.3), Head: UP(.6), RightUpLeg: [-.05, -.2, 1], RightLeg: [0, -.1, 1], RightFoot: [-.3, .2, 1], LeftUpLeg: [.25, -.4, .85], LeftLeg: [.2, -.1, -1], LeftArm: [.8, -.5, -.6], LeftForeArm: [.4, -1, -.2], RightArm: [-.8, .1, .3] }) },
    { t: .7, d: P({ Hips: UP(-.5, .2), Spine: UP(-.55, .25), Spine1: UP(-.45, .15), Neck: UP(.35), Head: UP(.6), RightUpLeg: [-.05, -.18, 1], RightLeg: [0, -.1, 1], RightFoot: [-.3, .3, 1], LeftUpLeg: [.25, -.4, .85], LeftLeg: [.2, -.1, -1], LeftArm: [.8, -.5, -.6], LeftForeArm: [.4, -1, -.2], RightArm: [-.8, .1, .3] }) },
    { t: 1.1, d: P({ Spine: UP(.2), LeftUpLeg: [.05, -.8, .6], LeftLeg: [0, -1, -.3], RightUpLeg: [0, -.85, .5], RightLeg: [0, -1, -.25] }) }], hips: [[0, 0, .95, 0], [.18, .08, .32, .2], [.7, .08, .3, .3], [1.1, 0, .85, 0]] },
  // the keeper waiting: low, knees bent, hands up (a little bounce)
  gk_ready: { loop: true, dur: .9, keys: [0, 1].map(k => ({ t: k * .45, d: P({ Hips: UP(.25), Spine: UP(.45), Spine1: UP(.28), Spine2: UP(.12), Neck: UP(-.2), Head: UP(-.3),
      LeftUpLeg: [.38, -.62, .68 + k * .02], RightUpLeg: [-.38, -.62, .68 + k * .02], LeftLeg: [.14, -1, -.42], RightLeg: [-.14, -1, -.42], LeftFoot: [.25, -.45, 1], RightFoot: [-.25, -.45, 1],
      LeftArm: [.6, -.45, .6 + k * .04], LeftForeArm: [.3, .2, 1], LeftHand: [.2, .55, .9], RightArm: [-.6, -.45, .6 + k * .04], RightForeArm: [-.3, .2, 1], RightHand: [-.2, .55, .9] }) })), hips: [[0, 0, .76, 0], [.45, 0, .74, 0], [.9, 0, .76, 0]] },
  // the keeper flies to his left (+X): push, stretched out in the air, down on his side
  dive_l: { dur: 1.35, keys: [
    { t: 0, d: P({ Spine: UP(.35), LeftUpLeg: [.35, -.8, .5], RightUpLeg: [-.35, -.8, .5], LeftLeg: [.12, -1, -.3], RightLeg: [-.12, -1, -.3], LeftArm: [.55, -.5, .55], RightArm: [-.55, -.5, .55] }) },
    { t: .14, d: P({ Hips: [.45, .9, .05], Spine: [.55, .85, .1], Spine1: [.6, .8, .1], Spine2: [.6, .8, .1], Neck: [.6, .8, .05], Head: [.6, .8, .05], LeftUpLeg: [.5, -.85, .2], LeftLeg: [.3, -1, -.2], RightUpLeg: [-.2, -.9, .3], RightLeg: [-.6, -.8, -.1],
      LeftArm: [.8, .6, .15], LeftForeArm: [.85, .55, .2], RightArm: [.5, .85, .15], RightForeArm: [.6, .8, .2] }) },
    { t: .38, d: { Hips: [1, .1, 0], Spine: [1, .12, 0], Spine1: [1, .12, 0], Spine2: [1, .12, 0], Neck: [1, .15, .05], Head: [1, .15, .1], LeftUpLeg: [-1, -.15, .05], RightUpLeg: [-1, .05, .1], LeftLeg: [-1, -.1, -.05], RightLeg: [-1, .05, -.1], LeftFoot: [-.3, -.3, 1], RightFoot: [-.3, -.2, 1],
      LeftArm: [1, .15, .15], LeftForeArm: [1, .2, .2], LeftHand: [1, .2, .3], RightArm: [1, .4, .15], RightForeArm: [1, .3, .2], RightHand: [1, .3, .3] } },
    { t: .62, d: { Hips: [1, .02, 0], Spine: [1, .02, 0], Spine1: [1, .02, 0], Spine2: [1, .04, 0], Neck: [1, .1, .05], Head: [1, .12, .15], LeftUpLeg: [-1, -.05, .1], RightUpLeg: [-1, .1, .15], LeftLeg: [-1, -.05, -.1], RightLeg: [-1, .05, -.2], LeftFoot: [-.3, -.3, 1], RightFoot: [-.3, -.2, 1],
      LeftArm: [1, -.05, .25], LeftForeArm: [.9, -.05, .45], LeftHand: [.6, 0, .8], RightArm: [1, .2, .25], RightForeArm: [.9, .1, .45], RightHand: [.6, .1, .8] } },
    { t: 1.35, d: { Hips: [1, .02, 0], Spine: [1, .02, 0], Spine1: [1, .02, 0], Spine2: [1, .04, 0], Neck: [1, .1, .05], Head: [1, .12, .15], LeftUpLeg: [-1, -.05, .2], RightUpLeg: [-1, .1, .3], LeftLeg: [-1, -.05, -.2], RightLeg: [-1, .05, -.3], LeftFoot: [-.3, -.3, 1], RightFoot: [-.3, -.2, 1],
      LeftArm: [.9, -.1, .4], LeftForeArm: [.5, -.1, .85], LeftHand: [.3, 0, 1], RightArm: [.9, .1, .4], RightForeArm: [.5, 0, .85], RightHand: [.3, .05, 1] } }],
    hips: [[0, 0, .8, 0], [.14, .12, .7, 0], [.38, .2, .95, 0], [.62, .2, .25, 0], [1.35, .2, .24, 0]] },
  // the scorer: on the knees, sliding, arms wide, head back
  knee_slide: { dur: 2.4, keys: [
    { t: 0, d: P({ Spine: UP(.25), LeftUpLeg: [0, -.85, .5], RightUpLeg: [0, -.9, -.35], RightLeg: [0, -.45, -.9], LeftArm: [.4, -.8, -.3], RightArm: [-.4, -.8, .4] }) },
    { t: .3, d: P({ Spine: UP(-.3), Spine1: UP(-.3), Spine2: UP(-.25), Neck: UP(-.3), Head: UP(-.45), LeftUpLeg: [.12, -1, .15], RightUpLeg: [-.12, -1, .15], LeftLeg: [.05, -.12, -1], RightLeg: [-.05, -.12, -1], LeftFoot: [0, .1, -1], RightFoot: [0, .1, -1],
      LeftArm: [.9, .35, -.1], LeftForeArm: [.8, .55, -.05], LeftHand: [.6, .8, 0], RightArm: [-.9, .35, -.1], RightForeArm: [-.8, .55, -.05], RightHand: [-.6, .8, 0] }) },
    { t: 1.2, d: P({ Spine: UP(-.4), Spine1: UP(-.38), Spine2: UP(-.3), Neck: UP(-.4), Head: UP(-.6), LeftUpLeg: [.12, -1, .1], RightUpLeg: [-.12, -1, .1], LeftLeg: [.05, -.12, -1], RightLeg: [-.05, -.12, -1], LeftFoot: [0, .1, -1], RightFoot: [0, .1, -1],
      LeftArm: [.75, .65, -.1], LeftForeArm: [.6, .8, -.05], LeftHand: [.4, 1, 0], RightArm: [-.75, .65, -.1], RightForeArm: [-.6, .8, -.05], RightHand: [-.4, 1, 0] }) },
    { t: 2.4, d: P({ Spine: UP(-.3), Spine1: UP(-.3), Spine2: UP(-.25), Neck: UP(-.2), Head: UP(-.3), LeftUpLeg: [.12, -1, .1], RightUpLeg: [-.12, -1, .1], LeftLeg: [.05, -.12, -1], RightLeg: [-.05, -.12, -1], LeftFoot: [0, .1, -1], RightFoot: [0, .1, -1],
      LeftArm: [.6, .2, .6], LeftForeArm: [-.3, .4, .9], LeftHand: [-.6, .3, .7], RightArm: [-.6, .2, .6], RightForeArm: [.3, .4, .9], RightHand: [.6, .3, .7] }) }],
    hips: [[0, 0, 1, 0], [.3, 0, .55, 0], [2.4, 0, .55, 0]] },
  // the airplane: arms out like wings, leaning into the turn, running
  plane: { loop: true, dur: .7, keys: [
    { t: 0, d: P({ Spine: [.35, 1, .2], Spine1: [.3, 1, .1], Spine2: [.2, 1, 0], Head: UP(.1), LeftArm: [1, -.25, -.05], LeftForeArm: [1, -.2, 0], LeftHand: [1, -.2, 0], RightArm: [-1, .3, -.05], RightForeArm: [-1, .35, 0], RightHand: [-1, .35, 0],
      LeftUpLeg: [0, -.85, .55], LeftLeg: [0, -1, -.1], RightUpLeg: [0, -.9, -.4], RightLeg: [0, -.4, -.9], RightFoot: [0, .1, -1] }) },
    { t: .35, d: P({ Spine: [-.35, 1, .2], Spine1: [-.3, 1, .1], Spine2: [-.2, 1, 0], Head: UP(.1), LeftArm: [1, .3, -.05], LeftForeArm: [1, .35, 0], LeftHand: [1, .35, 0], RightArm: [-1, -.25, -.05], RightForeArm: [-1, -.2, 0], RightHand: [-1, -.2, 0],
      RightUpLeg: [0, -.85, .55], RightLeg: [0, -1, -.1], LeftUpLeg: [0, -.9, -.4], LeftLeg: [0, -.4, -.9], LeftFoot: [0, .1, -1] }) }], hips: [[0, 0, .97, 0], [.17, 0, 1.03, 0], [.35, 0, .97, 0], [.52, 0, 1.03, 0], [.7, 0, .97, 0]] },
  // fists up, jumping (teammates, the bench)
  cheer: { loop: true, dur: .8, keys: [
    { t: 0, d: P({ LeftUpLeg: [.05, -.9, .35], RightUpLeg: [-.05, -.9, .35], LeftLeg: [0, -1, -.35], RightLeg: [0, -1, -.35], LeftArm: [.55, .8, 0], LeftForeArm: [.3, 1, .1], RightArm: [-.55, .8, 0], RightForeArm: [-.3, 1, .1] }) },
    { t: .4, d: P({ LeftArm: [.4, .9, 0], LeftForeArm: [.15, 1, .1], RightArm: [-.4, .9, 0], RightForeArm: [-.15, 1, .1], LeftFoot: [.05, -.9, .4], RightFoot: [-.05, -.9, .4] }) }], hips: [[0, 0, .9, 0], [.4, 0, 1.18, 0], [.8, 0, .9, 0]] },
  // hands on the head (a miss, a goal against)
  despair: { dur: 2.2, keys: [
    { t: 0, d: P({}) },
    { t: .35, d: P({ Spine: UP(-.12), Neck: UP(-.15), Head: UP(-.3), LeftArm: [.75, .62, .1], LeftForeArm: [-.55, .75, .2], LeftHand: [-.6, .3, .2], RightArm: [-.75, .62, .1], RightForeArm: [.55, .75, .2], RightHand: [.6, .3, .2] }) },
    { t: 1.6, d: P({ Spine: UP(.15), Neck: UP(.2), Head: UP(.5), LeftArm: [.75, .62, .1], LeftForeArm: [-.55, .75, .2], LeftHand: [-.6, .3, .2], RightArm: [-.75, .62, .1], RightForeArm: [.55, .75, .2], RightHand: [.6, .3, .2] }) },
    { t: 2.2, d: P({}) }] },
  // "pass it!" - the right arm up
  call: { dur: .8, keys: [{ t: 0, d: P({}) }, { t: .18, d: P({ RightArm: [-.2, 1, .15], RightForeArm: [-.1, 1, .2], RightHand: [0, 1, .2] }) }, { t: .55, d: P({ RightArm: [-.25, 1, .15], RightForeArm: [-.15, 1, .25], RightHand: [-.05, 1, .3] }) }, { t: .8, d: P({}) }] },
  // the keeper rolls the ball out
  gk_throw: { dur: .9, keys: [
    { t: 0, d: P({ Spine: UP(.1), RightArm: [-.3, -.9, -.3], RightForeArm: [-.2, -.9, -.3] }) },
    { t: .3, d: P({ Spine: UP(.5), Spine1: UP(.3), LeftUpLeg: [0, -.75, .65], LeftLeg: [0, -1, -.1], RightUpLeg: [0, -.9, -.3], RightLeg: [0, -.3, -.95], RightArm: [-.15, -.6, -.75], RightForeArm: [-.1, -.5, -.85] }) },
    { t: .5, d: P({ Spine: UP(.55), Spine1: UP(.35), LeftUpLeg: [0, -.7, .7], LeftLeg: [0, -1, -.15], RightUpLeg: [0, -.9, -.35], RightLeg: [0, -.3, -.95], RightArm: [-.1, -.6, .8], RightForeArm: [-.05, -.4, 1] }) },
    { t: .9, d: P({}) }], hips: [[0, 0, 1, 0], [.4, 0, .75, 0], [.9, 0, 1, 0]] },
};
MOVES.dive_r = { ...MOVES.dive_l, keys: MOVES.dive_l.keys.map(k => ({ t: k.t, d: mir(k.d) })), hips: MOVES.dive_l.hips.map(([t, x, y, z]) => [t, -x, y, z]) };

export function createFootball(api) {
  const { THREE, scene, camera } = api;
  const FB = { on: false, pitches: [], M: null, view: 'tv', clips: new WeakMap() };
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();

  // ---------------------------------------------------------------- the ball (a real football: white with black patches)
  const ballTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#f7f7f4'; g.fillRect(0, 0, 512, 256);
    const ico = []; const t = (1 + Math.sqrt(5)) / 2; for (const [a, b] of [[-1, t], [1, t], [-1, -t], [1, -t]]) { ico.push([a, b, 0], [0, a, b], [b, 0, a]); }
    g.fillStyle = '#111';
    for (const [x, y, z] of ico) { const l = Math.hypot(x, y, z), lon = Math.atan2(z / l, x / l), lat = Math.asin(y / l), px = (lon / TAU + .5) * 512, py = (.5 - lat / Math.PI) * 256, sx = 30 / Math.max(.35, Math.cos(lat));
      for (const dx of [-512, 0, 512]) { g.beginPath(); for (let k = 0; k < 5; k++) { const a = k * TAU / 5 - Math.PI / 2; g.lineTo(px + dx + Math.cos(a) * sx, py + Math.sin(a) * 30); } g.closePath(); g.fill(); } }
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; for (let k = 0; k < 14; k++) { g.beginPath(); g.moveTo(Math.random() * 512, Math.random() * 256); g.lineTo(Math.random() * 512, Math.random() * 256); g.stroke(); }
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx; })();
  const ballGeo = new THREE.SphereGeometry(BR, 18, 12), ballMat = new THREE.MeshStandardMaterial({ map: ballTex, roughness: .45 });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: .85, depthWrite: false, toneMapped: false }), ring = new THREE.Mesh(new THREE.RingGeometry(.42, .55, 32).rotateX(-Math.PI / 2), ringMat);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(.16, .3, 3).rotateX(Math.PI), ringMat); ring.renderOrder = 2; ring.visible = arrow.visible = false; scene.add(ring, arrow);
  const trailN = 14, trailPos = new Float32Array(trailN * 3), trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: .7, toneMapped: false })); trail.frustumCulled = false; trail.visible = false; scene.add(trail);
  const newBall = () => { const m = new THREE.Mesh(ballGeo, ballMat); m.castShadow = true; m.layers.enableAll(); scene.add(m); return m; };
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .35, depthWrite: false });
  const blob = new THREE.CircleGeometry(.16, 14).rotateX(-Math.PI / 2);

  // ---------------------------------------------------------------- sounds, made here (whistle, the kick, the crowd, the net)
  let AC = null, out = null;
  const bus = () => { AC = api.ac(); if (!AC || AC.state !== 'running') return null; if (!out || out.context !== AC) { out = AC.createGain(); out.gain.value = .6; out.connect(api.out() || AC.destination); } return out; };
  function noise(len) { const b = AC.createBuffer(1, Math.ceil(AC.sampleRate * len), AC.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  function sKick(pow = .6) { const o = bus(); if (!o) return; const t = AC.currentTime, g = AC.createGain(), s = AC.createOscillator(); s.frequency.setValueAtTime(140, t); s.frequency.exponentialRampToValueAtTime(55, t + .12);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.5 + pow * .6, t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + .16); s.connect(g); g.connect(o); s.start(t); s.stop(t + .2);
    const n = AC.createBufferSource(); n.buffer = noise(.08); const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; const g2 = AC.createGain(); g2.gain.setValueAtTime(.35 + pow * .4, t); g2.gain.exponentialRampToValueAtTime(.001, t + .07); n.connect(f); f.connect(g2); g2.connect(o); n.start(t); }
  function sWhistle(n = 1, long = false) { const o = bus(); if (!o) return; let t = AC.currentTime;
    for (let k = 0; k < n; k++) { const s = AC.createOscillator(), lfo = AC.createOscillator(), lg = AC.createGain(), g = AC.createGain(), d = long && k === n - 1 ? 1.1 : .32;
      s.frequency.value = 2900; lfo.frequency.value = 38; lg.gain.value = 160; lfo.connect(lg); lg.connect(s.frequency); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.22, t + .02); g.gain.setValueAtTime(.22, t + d - .05); g.gain.exponentialRampToValueAtTime(.0001, t + d);
      s.connect(g); g.connect(o); s.start(t); lfo.start(t); s.stop(t + d + .02); lfo.stop(t + d + .02); t += d + .12; } }
  function sCrowd(k = 1, dur = 3) { const o = bus(); if (!o) return; const t = AC.currentTime, n = AC.createBufferSource(); n.buffer = noise(dur + .5); const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = .6;
    const f2 = AC.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = 1800; f2.gain.value = 6; const g = AC.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.32 * k, t + .35); g.gain.setValueAtTime(.32 * k, t + dur * .55); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    n.connect(f); f.connect(f2); f2.connect(g); g.connect(o); n.start(t); n.stop(t + dur + .4); }
  let crowd = null;
  function crowdLoop(k) { if (crowd) { try { crowd.g.gain.setTargetAtTime(0, AC.currentTime, .4); const c = crowd; setTimeout(() => { try { c.s.stop(); } catch (e) { } }, 1500); } catch (e) { } crowd = null; }
    const o = k && bus(); if (!o) return; const s = AC.createBufferSource(); s.buffer = noise(4); s.loop = true; const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = .5;
    const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = .13; lg.gain.value = k * .35; const g = AC.createGain(); g.gain.value = k; lfo.connect(lg); lg.connect(g.gain);
    s.connect(f); f.connect(g); g.connect(o); s.start(); lfo.start(); crowd = { s, g }; }
  function sNet() { const o = bus(); if (!o) return; const t = AC.currentTime, n = AC.createBufferSource(); n.buffer = noise(.4); const f = AC.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500; const g = AC.createGain(); g.gain.setValueAtTime(.3, t); g.gain.exponentialRampToValueAtTime(.001, t + .35); n.connect(f); f.connect(g); g.connect(o); n.start(t); }
  function sPost() { const o = bus(); if (!o) return; const t = AC.currentTime; for (const fr of [1250, 1870, 2630]) { const s = AC.createOscillator(), g = AC.createGain(); s.frequency.value = fr; g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.0005, t + .8); s.connect(g); g.connect(o); s.start(t); s.stop(t + .85); } }
  function sBoard() { const o = bus(); if (!o) return; const t = AC.currentTime, n = AC.createBufferSource(); n.buffer = noise(.15); const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; const g = AC.createGain(); g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + .14); n.connect(f); f.connect(g); g.connect(o); n.start(t); }

  // ---------------------------------------------------------------- set-local <-> world
  const toW = (S, u, v) => { const c = Math.cos(S.ry), s = Math.sin(S.ry); return { x: S.x + u * c + v * s, z: S.z - u * s + v * c }; };
  const toL = (S, x, z) => { const c = Math.cos(S.ry), s = Math.sin(S.ry), dx = x - S.x, dz = z - S.z; return { u: dx * c - dz * s, v: dx * s + dz * c }; };
  const yawW = (S, a) => { const du = Math.cos(a), dv = Math.sin(a), c = Math.cos(S.ry), s = Math.sin(S.ry); return Math.atan2(du * c + dv * s, -du * s + dv * c); };   // a local heading -> object rotation.y

  // ---------------------------------------------------------------- a pitch on the map
  function addPitch(S, kind, name) {
    const K = KINDS[kind], PI = { S, kind, K, name, boys: null, nets: [], ready: false };
    FB.pitches.push(PI);
    return PI;
  }
  // when its set is in: our own nets (they bulge), the boys and their ball
  function pitchLoaded(PI) {
    const S = PI.S, K = PI.K; let netMap = null;
    for (const g of [S.far, S.near_]) if (g) g.traverse(o => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { const n = m.name || ''; if (/PT_Net/.test(n)) { netMap = netMap || m.map; m.visible = false; } if (/ChainNear|FencePostNear/.test(n)) (PI.nearFence || (PI.nearFence = [])).push(o);
        // the playing surface over any lawn or ground of the town (they are pulled forward a little)
        if (/PT_CageCourt|PT_SandGround|PT_Apron|ST_Pitch|ST_Apron/.test(n)) { const top = /Court|ST_Pitch/.test(n); m.polygonOffset = true; m.polygonOffsetFactor = top ? -5 : -3; m.polygonOffsetUnits = top ? -10 : -6; } } });
    for (const s of [-1, 1]) PI.nets.push(makeNet(S, K, s, netMap));
    if (PI.kind === 'stadium') stadiumDress(PI);
    PI.ready = true;
  }
  // ---------------------------------------------------------------- the stadium: the big screen, the name on the roof and over the gate
  function textPlane(t, w, h, bg, fg, font = 'Impact, Arial Black, sans-serif') { const c = document.createElement('canvas'); c.width = 2048; c.height = Math.max(64, Math.round(2048 * h / w)); const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; let fs = c.height * .78; g.font = `900 ${fs}px ${font}`; while (g.measureText(t).width > c.width * .94) { fs *= .94; g.font = `900 ${fs}px ${font}`; }
    g.fillText(t, c.width / 2, c.height * .54); const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tx, toneMapped: false })); }
  function stadiumDress(PI) { const S = PI.S, J = S.json || {};
    const roof = textPlane(PI.name.toUpperCase(), 64, 1.4, '#0d6b2b', '#ffffff'); roof.position.set(0, 21.08, -43.3); S.root.add(roof);
    const gate = textPlane(PI.name.toUpperCase(), 19.4, 2.3, '#0b0d10', '#ffd54a'); gate.position.set(0, 9.2, 60.83); S.root.add(gate);
    // the screen: a canvas the game draws on (the name, the score, GOAL!, the replay)
    let scr = null; for (const g of [S.far, S.near_]) if (g) g.traverse(o => { if (o.isMesh && /ST_Screen/.test([].concat(o.material)[0].name || '')) scr = o; });
    if (scr) { const c = document.createElement('canvas'); c.width = 1024; c.height = 460; const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.repeat.set(-1, 1); tx.offset.set(1, 0); scr.material = new THREE.MeshBasicMaterial({ map: tx, toneMapped: false }); PI.scr = { c, g: c.getContext('2d'), tx }; screen(PI, 'idle'); } }
  function screen(PI, mode) { const Z = PI && PI.scr; if (!Z) return; const g = Z.g, W = 1024, H = 460, M = FB.M && FB.M.PI === PI ? FB.M : null; Z.mode = mode;
    g.fillStyle = '#05070a'; g.fillRect(0, 0, W, H); g.textAlign = 'center'; g.textBaseline = 'middle';
    const big = (t, y, s, c) => { g.font = `900 ${s}px Impact, Arial Black, sans-serif`; g.fillStyle = c; g.fillText(t, W / 2, y); };
    if (mode === 'idle' || !M) { big('NAIJA STREETS', 130, 96, '#22d07a'); big(PI.name.toUpperCase(), 260, 64, '#ffffff'); big('MATCH TODAY · TICKETS AT THE GATE', 370, 40, '#ffd54a'); }
    else if (mode === 'goal') { big('GOAL!', 190, 220, '#ffd54a'); big(`${M.scorer.name.toUpperCase()}`, 360, 64, '#ffffff'); }
    else if (mode === 'replay') { big('● REPLAY', 230, 140, '#ff4040'); }
    else { g.fillStyle = MY_KIT[0]; g.fillRect(40, 60, 18, 200); g.fillStyle = M.opp[1]; g.fillRect(W - 58, 60, 18, 200);
      g.font = '900 92px Impact, Arial Black, sans-serif'; g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.fillText('YOU', 90, 160); g.textAlign = 'right'; g.fillText(abbr(M.opp[0]), W - 90, 160); g.textAlign = 'center';
      big(`${M.score[0]} - ${M.score[1]}`, 160, 130, '#ffd54a');
      const c = Math.ceil(M.clock); big(mode === 'ft' ? 'FULL TIME' : `${(c / 60) | 0}:${String(c % 60).padStart(2, '0')}`, 340, 80, mode === 'ft' ? '#ff6b6b' : '#7dffb0'); }
    Z.tx.needsUpdate = true; }
  // a goal net: back, top and the two sides, a grid of points that the ball pushes and that springs back
  function makeNet(S, K, s, map) {
    const nu = 14, nv = 8, geo = new THREE.BufferGeometry(), P0 = [], uv = [], idx = [];
    const panels = [];   // each panel: corner points (local u, v, y) a,b,c,d
    const gx = s * K.hx, bx = s * (K.hx + K.gd), ht = K.gh * .55;
    panels.push([[bx, -K.gw, 0], [bx, K.gw, 0], [bx, K.gw, ht], [bx, -K.gw, ht]]);   // back
    panels.push([[bx, -K.gw, ht], [bx, K.gw, ht], [gx, K.gw, K.gh], [gx, -K.gw, K.gh]]);   // roof
    panels.push([[gx, -K.gw, 0], [bx, -K.gw, 0], [bx, -K.gw, ht], [gx, -K.gw, K.gh]]);   // sides
    panels.push([[bx, K.gw, 0], [gx, K.gw, 0], [gx, K.gw, K.gh], [bx, K.gw, ht]]);
    for (const [a, b, c, d] of panels) { const base = P0.length / 3;
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const x = i / nu, y = j / nv, l = (p, q, r) => p[r] * (1 - x) * (1 - y) + q[r] * x * (1 - y);
        const pu = a[0] * (1 - x) * (1 - y) + b[0] * x * (1 - y) + c[0] * x * y + d[0] * (1 - x) * y, pv = a[1] * (1 - x) * (1 - y) + b[1] * x * (1 - y) + c[1] * x * y + d[1] * (1 - x) * y, py = a[2] * (1 - x) * (1 - y) + b[2] * x * (1 - y) + c[2] * x * y + d[2] * (1 - x) * y;
        P0.push(pu, py, pv); const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), H = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]); uv.push(x * L * 2, y * H * 2); }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const k = base + j * (nu + 1) + i; idx.push(k, k + 1, k + nu + 2, k, k + nu + 2, k + nu + 1); } }
    const pos = new Float32Array(P0); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: map || null, color: map ? 0xffffff : 0xeeeeee, alphaTest: .5, transparent: false, side: THREE.DoubleSide, roughness: .8, opacity: map ? 1 : .4 });
    if (map) { map.wrapS = map.wrapT = THREE.RepeatWrapping; map.needsUpdate = true; } else mat.transparent = true;
    const m = new THREE.Mesh(geo, mat); m.position.set(S.x, 0, S.z); m.rotation.y = S.ry; m.frustumCulled = false; scene.add(m);
    const rest = Float32Array.from(P0), vel = new Float32Array(P0.length);
    return { m, s, rest, vel, pos, hit: 0, edge: P0.map((_, i) => i).filter(i => i % 3 === 0).map(i => { const u = P0[i], y = P0[i + 1], v = P0[i + 2]; return (Math.abs(u - gx) < .01 || y < .01 || Math.abs(Math.abs(v) - K.gw) < .01 && Math.abs(u - gx) < .01) ? 1 : 0; }) };
  }
  // the ball hits the net at (u,v,y) with speed sp: points near it are pushed out, then spring back
  function netPush(net, u, v, y, sp, du, dv, dy) {
    const R = .9, k = Math.min(1.5, sp * .07); net.hit = 2.5;
    for (let i = 0; i < net.rest.length; i += 3) { const d = Math.hypot(net.rest[i] - u, net.rest[i + 1] - y, net.rest[i + 2] - v); if (d > R) continue; const f = (1 - d / R) ** 2 * k * 6;
      net.vel[i] += du * f; net.vel[i + 1] += dy * f; net.vel[i + 2] += dv * f; } }
  function netTick(net, dt) { if (net.hit <= 0) return; net.hit -= dt; const P = net.pos, R = net.rest, V = net.vel;
    for (let i = 0; i < P.length; i += 3) { if (net.edge[i / 3]) continue; for (let a = 0; a < 3; a++) { const x = P[i + a] - R[i + a]; V[i + a] += (-60 * x - 5 * V[i + a]) * dt; P[i + a] += V[i + a] * dt; } }
    net.m.geometry.attributes.position.needsUpdate = true; if (net.hit <= 0) { P.set(R); V.fill(0); net.m.geometry.attributes.position.needsUpdate = true; } }

  // ---------------------------------------------------------------- the boys' kickabout (no match on)
  function boysMake(PI) {
    const S = PI.S, K = PI.K, B = { list: [], ball: newBall(), u: 0, v: 0, y: BR, to: null, t: 0, vu: 0, vv: 0 };
    const kit = ['schoolboy', 'areaboy', 'schoolboy', 'areaboy', 'schoolboy', 'areaboy'];
    for (let i = 0; i < 6; i++) { const u = rnd(-K.hx * .5, K.hx * .5), v = rnd(-K.hz * .6, K.hz * .6), w = toW(S, u, v); const f = api.folk(kit[i], { x: w.x, y: 0, z: w.z, yaw: 0 }, ['walk']); if (!f) continue; f.u = u; f.v = v; f.home = { u, v }; f.kick = 0; B.list.push(f); }
    B.to = B.list[0] || null; return B;
  }
  function boysTick(PI, dt, near) {
    if (!PI.ready) return; if (!near) { if (PI.boys) { for (const f of PI.boys.list) f.root.visible = false; PI.boys.ball.visible = false; } return; }
    if (!PI.boys) PI.boys = boysMake(PI); const B = PI.boys, S = PI.S, K = PI.K, on = !(FB.M && FB.M.PI === PI);
    for (const f of B.list) f.root.visible = on; B.ball.visible = on; if (!on || !B.list.length) return;
    // the ball rolls to whoever it was passed to; he walks onto it and passes again
    if (B.to) { const du = B.to.u - B.u, dv = B.to.v - B.v, d = Math.hypot(du, dv); if (d < .55) { const k = B.list[(Math.random() * B.list.length) | 0]; if (k !== B.to) { B.to.kick = .5; api.folkDo(B.to, ['kick', 'walk']); B.to = k; } }
      else { const st = Math.min(d, 7 * dt); B.u += du / d * st; B.v += dv / d * st; } }
    for (const f of B.list) { const near = f === B.to, tu = near ? B.u : f.home.u + (B.u - f.home.u) * .3, tv = near ? B.v : f.home.v + (B.v - f.home.v) * .3, du = tu - f.u, dv = tv - f.v, d = Math.hypot(du, dv);
      if (f.kick > 0) { f.kick -= dt; if (f.kick <= 0) api.folkDo(f, ['walk']); }
      else if (d > .7) { const st = Math.min(d, (near ? 2.4 : 1.3) * dt); f.u = clamp(f.u + du / d * st, -K.hx, K.hx); f.v = clamp(f.v + dv / d * st, -K.hz, K.hz); f.root.rotation.y = yawW(S, Math.atan2(dv, du)); }
      const w = toW(S, f.u, f.v); f.root.position.set(w.x, 0, w.z); if (Math.hypot(w.x - camera.position.x, w.z - camera.position.z) < 90) f.mixer.update(dt); }
    const w = toW(S, B.u, B.v); B.ball.position.set(w.x, BR, w.z); B.ball.rotation.x += dt * 4; }

  // ---------------------------------------------------------------- a footballer: model, moves, where he is
  // anim: locomotion (idle / walk / run, by speed) under one-shot moves (shot, pass, dive...)
  function rig(m) {
    const A = { m, acts: {}, shot: null, shotW: 0, shotT: 0, hold: false, loco: { idle: 1, walk: 0, run: 0 }, gk: null };
    for (const n of ['idle', 'walk', 'run']) { const c = m.clips[n]; if (!c) continue; const a = m.mixer.clipAction(c); a.play(); a.setEffectiveWeight(n === 'idle' ? 1 : 0); A.acts[n] = a; }
    return A;
  }
  function moveClip(m, name) {
    let per = FB.clips.get(m.D); if (!per) FB.clips.set(m.D, per = {});
    if (per[name] !== undefined) return per[name];
    const M = MOVES[name]; if (!M) return per[name] = m.clips[name] || null;
    try {
      const k = api.C2.poseClip(m.D, 'fb_' + name, M.keys, { loop: !!M.loop, dur: M.dur });
      if (M.hips) { const hb = m.D.nodes.get('Hips'), rp = m.D.lp.get('Hips'), H = rp.y, sc = H / .95, T = [], V = [];
        for (const [t, x, yf, z] of M.hips) { T.push(t); V.push(rp.x + x * sc, H * yf, rp.z + z * sc); }
        k.tracks.push(new THREE.VectorKeyframeTrack(hb.name + '.position', Float32Array.from(T), Float32Array.from(V))); }
      k.duration = M.dur; return per[name] = k;
    } catch (e) { console.warn('football move', name, e); return per[name] = null; }
  }
  // play a move once (or loop it: hold), the legs' running fades under it
  function play(p, name, { ts = 1, hold = false, fade = .08 } = {}) {
    const A = p.A, m = A.m; let k = moveClip(m, name); if (!k) k = m.clips[name]; if (!k) return 0;
    if (A.shot && A.shot.getClip() !== k) A.shot.fadeOut(fade);
    const a = m.mixer.clipAction(k); a.reset(); a.setLoop(hold ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !hold; a.timeScale = ts; a.setEffectiveWeight(1); a.fadeIn(fade); a.play();
    A.shot = a; A.shotName = name; A.shotT = 0; A.hold = hold; A.shotDur = k.duration / ts; return A.shotDur; }
  function stopShot(p, fade = .2) { const A = p.A; if (A.shot) { A.shot.fadeOut(fade); A.shot = null; A.shotName = null; } }
  function animTick(p, dt) {
    const A = p.A; if (A.shot) { A.shotT += dt; if (!A.hold && A.shotT > A.shotDur + .05) stopShot(p, .22); }
    const sp = p.sp, busy = A.shot ? A.shot.getEffectiveWeight() : 0, tgt = { idle: sp < .25 ? 1 : sp < 1.6 ? 1 - (sp - .25) / 1.35 : 0, walk: sp < .25 ? 0 : sp < 1.6 ? (sp - .25) / 1.35 : sp < 3 ? 1 - (sp - 1.6) / 1.4 : 0, run: sp < 1.6 ? 0 : sp < 3 ? (sp - 1.6) / 1.4 : 1 };
    for (const n in A.acts) { A.loco[n] = lerp(A.loco[n], tgt[n], 1 - Math.exp(-dt * 12)); A.acts[n].setEffectiveWeight(A.loco[n] * (1 - busy)); }
    if (A.acts.run) A.acts.run.timeScale = clamp(sp / (p.m.rv || 4.7), .7, 1.55); if (A.acts.walk) A.acts.walk.timeScale = clamp(sp / (p.m.wv || 1.7), .6, 1.4);
    p.m.mixer.update(dt); }

  // ---------------------------------------------------------------- the match
  function canPlay() { return !FB.M; }
  // the menu at the sign
  function menu(PI) {
    if (FB.M) return; const K = PI.K;
    if (PI.kind === 'stadium') { const opp = STAD_TEAMS[(Math.random() * STAD_TEAMS.length) | 0];
      api.openMenu(`${PI.name.toUpperCase()}`, `11-a-side under the lights. ${opp[0]} dey come. ${Math.round(K.len / 60)} minutes. The crowd don full.`, [
        { name: 'League match', sub: `Win ${api.naira(10000)} and big respect · draw ${api.naira(3000)}`, price: 0, btn: 'PLAY', act: () => { api.closeMenu(); start(PI, opp, 0, { win: 10000, draw: 3000, cred: [150, 50, 25] }); } },
        { name: 'Cup final', sub: `Stake ${api.naira(20000)} · win ${api.naira(60000)} · draw, you keep your stake`, price: 20000, rank: 3, act: () => { api.closeMenu(); start(PI, opp, 20000, { win: 60000, draw: 20000, cred: [300, 80, 30] }); } },
        { name: 'How to play', sub: api.touch() ? 'Left: run. SHOOT: hold for power, let go. PASS: pass, or call for the ball. SPRINT: hold. TACKLE: win the ball. 🎥 changes the camera.' : 'WASD / arrows: run · SPACE: shoot (hold for power) · E: pass / call for it · SHIFT: sprint · Q: tackle · V: camera', price: 0, btn: 'OK', act: () => api.closeMenu() }]);
      return; }
    const opp = TEAMS[(FB.pitches.indexOf(PI) * 2 + (Math.random() * 2 | 0)) % TEAMS.length];
    api.openMenu(`${PI.name.toUpperCase()} · 5-A-SIDE`, `The boys dey wait. ${opp[0]} wan play una. ${Math.round(K.len / 60)} minutes, winner takes it.`, [
      { name: 'Friendly match', sub: `Win ${api.naira(3000)} and respect · draw ${api.naira(1000)}`, price: 0, btn: 'PLAY', act: () => { api.closeMenu(); start(PI, opp, 0, { win: 3000, draw: 1000, cred: [80, 30, 15] }); } },
      { name: 'Money match', sub: `Stake ${api.naira(5000)} · win ${api.naira(15000)} · draw, you keep your stake`, price: 5000, act: () => { api.closeMenu(); start(PI, opp, 5000, { win: 15000, draw: 5000, cred: [100, 35, 15] }); } },
      { name: 'How to play', sub: api.touch() ? 'Left: run. SHOOT: hold for power, let go. PASS: pass, or call for the ball. SPRINT: hold. TACKLE: win the ball. 🎥 changes the camera.' : 'WASD / arrows: run · SPACE: shoot (hold for power) · E: pass / call for it · SHIFT: sprint · Q: tackle · V: camera', price: 0, btn: 'OK', act: () => api.closeMenu() }]);
  }
  async function start(PI, opp, stake, prize) {
    if (FB.M) return; const K = PI.K, S = PI.S;
    api.toast('The boys dey come out… lace your boots.', 3);
    const meId = api.meId(), oppC = [...CASTS].sort(() => Math.random() - .5), myC = [...CASTS].sort(() => Math.random() - .5), names = [...NAMES].sort(() => Math.random() - .5);
    const N = K.n, MI = meOf(K), F0 = formOf(K); const jobs = []; for (let t = 0; t < 2; t++) for (let i = 0; i < N; i++) { const me = t === 0 && i === MI, id = me ? meId : (t ? oppC : myC)[i % CASTS.length];
      jobs.push(api.footballer(id, i === 0 ? (t ? ['#c6ff00', '#111111'] : ['#26282c', '#26282c']) : t ? [opp[1], opp[2]] : MY_KIT, { me, keeper: i === 0 })); }
    const models = await Promise.all(jobs); if (models.some(m => !m)) { api.toast('The boys no fit come now. Try again small.', 3); models.forEach(m => m && m.dispose()); if (stake) api.addCash(stake); return; }
    const M = FB.M = { PI, K, S, opp, stake, prize, t: 0, clock: K.len, score: [0, 0], scorers: [], phase: 'intro', pt: 0, P: [], ball: null, rec: [], recT: 0, kick: 0, lastTouch: null, cam: { u: 0, v: 0, z: 1, p: new THREE.Vector3(), l: new THREE.Vector3() }, shake: 0, slow: 1, fans: [], told: {} };
    for (let t = 0; t < 2; t++) for (let i = 0; i < N; i++) { const m = models[t * N + i], me = t === 0 && i === MI, F = F0[i];
      const p = { team: t, i, role: F.r, me, m, A: rig(m), u: 0, v: 0, vu: 0, vv: 0, face: t ? Math.PI : 0, sp: 0, st: 'idle', stT: 0, cool: 0, tackleCool: 0, stam: 1, name: me ? api.myName() : names[(t * N + i) % names.length] + ((t * N + i) >= names.length ? ' ' + 'ABCDEFG'[(t * N + i) % 7] + '.' : ''), skill: t ? rnd(.82, .95) : rnd(.8, .92), gk: F.r === 'gk', shotT: 0 };
      if (p.gk) play(p, 'gk_ready', { hold: true }); M.P.push(p); }
    M.me = M.P[MI]; M.F = F0;
    const bm = newBall(), sh = new THREE.Mesh(blob, shadowMat); scene.add(sh); M.B = { m: bm, sh, u: 0, v: 0, y: BR, vu: 0, vv: 0, vy: 0, own: null, spin: new THREE.Vector3(), free: 0, inGoal: 0, last: null, lastT: null, air: 0 };
    // fans: the boys from the kickabout and a few more at the side
    for (const [lx, lz, yaw] of ((S.json && S.json.marks && S.json.marks.fans) || [])) { const w = toW(S, lx, lz); const f = api.folk(Math.random() < .5 ? 'schoolboy' : 'areaboy', { x: w.x, y: 0, z: w.z, yaw: yawW(S, -Math.PI / 2) }, ['hail', 'idle_1']); if (f) M.fans.push(f); }
    crowdLoop(PI.kind === 'stadium' ? .14 : .05); screen(PI, 'match');
    api.enter(true); FB.on = true; ui(true); kickoff(0, true); M.phase = 'intro'; M.pt = 0; sCrowd(.5, 4);
  }
  function lineup(kicker) { const M = FB.M, K = M.K;
    for (const p of M.P) { const F = M.F[p.i], side = p.team ? -1 : 1; let u = F.u * K.hx * side, v = F.v * K.hz * (p.team ? -1 : 1);
      u = side > 0 ? Math.min(u, -1.2) : Math.max(u, 1.2); if (p.i === meOf(K) && p.team === kicker) { u = -side * .6; v = 0; } if (p.i === mateOf(K) && p.team === kicker) { u = -side * 1.8; v = side * 3; }
      p.u = u; p.v = v; p.vu = p.vv = 0; p.sp = 0; p.face = p.team ? Math.PI : 0; p.st = 'idle'; p.stT = 0; p.tackleCool = 0; p.down = 0; if (!p.gk) stopShot(p, .1); } }
  function kickoff(team, first) { const M = FB.M, B = M.B; lineup(team); B.u = B.v = B.vu = B.vv = B.vy = 0; B.y = BR; B.own = null; B.last = null; M.kickTeam = team; M.phase = 'kickoff'; M.pt = 0; M.restart = null;
    if (!first) { sWhistle(1); } }

  // ---------------------------------------------------------------- input (you)
  const IN = { shoot: false, pass: false, sprint: false, tackle: false, cam: false, charge: 0, wasShoot: false, wasPass: false, wasTackle: false };
  function key(k, down) { if (!FB.M) return false;
    if (k === ' ') IN.shoot = down; else if (k === 'e' || k === 'j') IN.pass = down; else if (k === 'shift') IN.sprint = down; else if (k === 'q' || k === 'l') IN.tackle = down; else if (k === 'v' && down) toggleCam();
    else if (k === 'escape' && down) quitAsk(); else return false; return true; }
  function toggleCam() { FB.view = FB.view === 'tv' ? 'pro' : 'tv'; api.toast(FB.view === 'tv' ? 'TV camera' : 'Behind you', 1.4); }
  // the stick, turned by the camera: screen up is away from the camera
  function stick() { const M = FB.M, [f, s] = api.input(); if (Math.hypot(f, s) < .12) return null;
    camera.getWorldDirection(_v); _v.y = 0; _v.normalize(); _w.set(-_v.z, 0, _v.x);   // right
    const wx = _v.x * f + _w.x * s, wz = _v.z * f + _w.z * s, c = Math.cos(M.S.ry), sn = Math.sin(M.S.ry); const du = wx * c - wz * sn, dv = wx * sn + wz * c, l = Math.hypot(du, dv) || 1;
    return { u: du / l, v: dv / l, k: Math.min(1, Math.hypot(f, s)) }; }

  // ---------------------------------------------------------------- the ball
  const goalSide = t => t ? -1 : 1;   // team 0 attacks +u
  function kickBall(p, du, dv, sp, vy, kind) { const M = FB.M, B = M.B; B.own = null; B.vu = du * sp; B.vv = dv * sp; B.vy = vy; B.last = p; B.lastT = p.team; B.free = .22; B.from = p; B.kind = kind; B.air = vy > .5 ? 1 : 0;
    p.cool = .35; sKick(clamp(sp / 28, .2, 1)); M.lastKick = { p, kind, t: M.t };
    if (kind === 'shot') { M.shotBy = p; M.shotT = M.t; } }
  function shoot(p, power, aim) { const M = FB.M, K = M.K, B = M.B, gs = goalSide(p.team), gx = gs * K.hx;
    let tv = aim != null ? aim : (-Math.sign(B.v || rnd(-1, 1)) * K.gw * rnd(.45, .8)), th = power > .8 ? rnd(.9, 2.2) : power > .5 ? rnd(.2, 1.4) : rnd(.1, .7);
    const pres = M.P.filter(o => o.team !== p.team && Math.hypot(o.u - p.u, o.v - p.v) < 2.2).length, err = .04 + Math.max(0, power - .82) * 1.1 + pres * .05 + (p.sp > 5.5 ? .05 : 0) + (1 - p.skill) * .12;
    const dist = Math.hypot(gx - B.u, tv - B.v), a = Math.atan2(tv - B.v, gx - B.u) + gauss() * err * .5, sp = 13 + power * 17;
    th += gauss() * err * 2.2; const t = dist / sp, vy = clamp((th - B.y + .5 * G * t * t) / t, 0, 9);
    kickBall(p, Math.cos(a), Math.sin(a), sp, vy, 'shot'); }
  function passTo(p, q, lead = true) { const M = FB.M, B = M.B; let tu = q.u, tv = q.v; const d0 = Math.hypot(tu - B.u, tv - B.v), sp = clamp(7 + d0 * .75, 8, 19);
    if (lead) { const t = d0 / sp; tu += q.vu * t * .9; tv += q.vv * t * .9; }
    const d = Math.hypot(tu - B.u, tv - B.v) || 1, a = Math.atan2(tv - B.v, tu - B.u) + gauss() * (1 - p.skill) * .08, lob = d > 16 && blocked(p, q) ? 1 : 0;
    kickBall(p, Math.cos(a), Math.sin(a), lob ? sp * .8 : sp, lob ? 5.5 : .2, 'pass'); M.passTo = q; M.passT = M.t; }
  function blocked(p, q) { const M = FB.M; for (const o of M.P) { if (o.team === p.team) continue; const ax = q.u - p.u, av = q.v - p.v, L = Math.hypot(ax, av) || 1, t = ((o.u - p.u) * ax + (o.v - p.v) * av) / L; if (t < 1 || t > L - 1) continue; const d = Math.abs((o.u - p.u) * av - (o.v - p.v) * ax) / L; if (d < 1.1) return true; } return false; }
  function ballStep(dt) {
    const M = FB.M, K = M.K, B = M.B; if (B.own) return;
    B.vy -= G * dt; B.u += B.vu * dt; B.v += B.vv * dt; B.y += B.vy * dt; if (B.free > 0) B.free -= dt;
    const drag = B.y > BR + .05 ? .08 : K.roll; const f = Math.exp(-drag * dt); B.vu *= f; B.vv *= f;
    if (B.y < BR) { B.y = BR; if (B.vy < -1.2) { B.vy = -B.vy * .52; if (B.vy > 1.5) sKick(.05); } else B.vy = 0; const sp = Math.hypot(B.vu, B.vv); if (sp < .25 && B.vy === 0) { B.vu *= .9; B.vv *= .9; } }
    // the goal frame: posts and bar
    for (const s of [-1, 1]) { const gx = s * K.hx;
      for (const pv of [-K.gw, K.gw]) { const du = B.u - gx, dv = B.v - pv, d = Math.hypot(du, dv); if (d < BR + .06 && B.y < K.gh + .05) { const nu = du / d, nv = dv / d, dot = B.vu * nu + B.vv * nv; if (dot < 0) { B.vu -= 1.6 * dot * nu; B.vv -= 1.6 * dot * nv; B.u = gx + nu * (BR + .065); B.v = pv + nv * (BR + .065); sPost(); M.post = M.t; if (M.shotBy) say('Off the post!', 1.4); } } }
      if (Math.abs(B.v) < K.gw && Math.abs(B.u - gx) < BR + .06 && Math.abs(B.y - K.gh) < BR + .06) { const dy = B.y - K.gh, du = B.u - gx, d = Math.hypot(dy, du) || 1; const ny = dy / d, nu = du / d, dot = B.vy * ny + B.vu * nu; if (dot < 0) { B.vy -= 1.6 * dot * ny; B.vu -= 1.6 * dot * nu; sPost(); M.post = M.t; if (M.shotBy) say('Off the bar!', 1.4); } } }
    // in the goal?
    const inMouth = Math.abs(B.v) < K.gw - BR * .5 && B.y < K.gh - BR * .3;
    if (Math.abs(B.u) > K.hx + BR && (B.inGoal || inMouth)) { const s = Math.sign(B.u); if (!B.inGoal) { B.inGoal = s; goal(s > 0 ? 0 : 1); }
      const net = M.PI.nets[s > 0 ? 1 : 0], back = K.hx + K.gd - BR - .05;
      if (Math.abs(B.u) > back) { netPush(net, B.u, B.v, B.y, Math.abs(B.vu) + Math.abs(B.vy), Math.sign(B.vu) * .6, B.vv * .05, B.vy * .05); B.u = s * back; B.vu = -B.vu * .12; B.vv *= .4; B.vy *= .4; sNet(); }
      if (Math.abs(B.v) > K.gw - BR) { netPush(net, B.u, B.v, B.y, Math.abs(B.vv), 0, Math.sign(B.vv) * .5, 0); B.v = Math.sign(B.v) * (K.gw - BR); B.vv = -B.vv * .15; }
      const roof = K.gh - (Math.abs(B.u) - K.hx) / K.gd * K.gh * .45 - BR; if (B.y > roof) { netPush(net, B.u, B.v, B.y, Math.abs(B.vy), 0, 0, .4); B.y = roof; B.vy = -Math.abs(B.vy) * .2; }
      return; }
    if (K.walls) {   // the cage: off the boards and the fence
      if (Math.abs(B.v) > K.hz - BR) { B.v = Math.sign(B.v) * (K.hz - BR); B.vv = -B.vv * .72; if (Math.abs(B.vv) > 2) sBoard(); }
      if (Math.abs(B.u) > K.hx - BR && !inMouth) { B.u = Math.sign(B.u) * (K.hx - BR); B.vu = -B.vu * .72; if (Math.abs(B.vu) > 2) sBoard(); }
      if (B.y > 5) { B.y = 5; B.vy = -Math.abs(B.vy) * .3; } }
    else if (M.phase === 'play') {   // the sandlot: out of play
      if (Math.abs(B.v) > K.hz + BR) outOfPlay('side'); else if (Math.abs(B.u) > K.hx + BR) outOfPlay('end'); } }
  function outOfPlay(kind) { const M = FB.M, K = M.K, B = M.B, last = B.lastT == null ? 0 : B.lastT, other = 1 - last; let u = clamp(B.u, -K.hx, K.hx), v = clamp(B.v, -K.hz, K.hz), team = other, what = 'Kick-in';
    if (kind === 'end') { const s = Math.sign(B.u), defend = s > 0 ? 1 : 0; if (last === defend) { what = 'Corner'; u = s * K.hx; v = Math.sign(B.v || 1) * K.hz; team = 1 - defend; } else { what = 'Goal kick'; u = s * (K.hx - 3); v = 0; team = defend; } }
    if (kind === 'end' && M.shotBy && M.t - M.shotT < 3) { say(['So close!', 'Just wide!', 'Ahhh! Over the bar!'][(Math.random() * 3) | 0], 1.4); sCrowd(.5, 1.8); }
    M.phase = 'restart'; M.pt = 0; M.restart = { u, v, team, what }; B.own = null; B.vu = B.vv = B.vy = 0; say(what, 1.4); sWhistle(1); }

  // ---------------------------------------------------------------- goal!
  function goal(team) { const M = FB.M; if (M.phase !== 'play') return; M.score[team]++; const last = M.B.last, by = last && last.team === team ? last : null; M.scorer = by || M.P.find(p => p.team === team && p.i === meOf(M.K));
    M.scorers.push({ team, name: by ? by.name : last ? last.name : M.scorer.name, min: Math.max(1, Math.ceil((M.K.len - M.clock) / M.K.len * 90)), me: !!(by && by.me), own: !by });
    M.phase = 'goal'; M.pt = 0; M.goalTeam = team; setTimeout(() => FB.M === M && screen(M.PI, 'goal'), 0); M.goalT = M.t; M.shake = .6; sCrowd(team === 0 ? 1.25 : .7, 5); sWhistle(1); goalFX(team);
    if (by && by.me) { api.cred(20, 'goal'); M.myGoals = (M.myGoals || 0) + 1; }
    // the scorer runs off and celebrates, his team jumps; the others hold their heads
    const sc = M.scorer; sc.cele = ['knee_slide', 'plane', 'knee_slide', 'cheer'][(Math.random() * 4) | 0]; sc.celeT = 0;
    for (const p of M.P) { p.vu = p.vv = 0; if (p === sc) continue; p.celeD = rnd(.2, 1.2); }
    scoreUI(); }
  function goalFX(team) { const el = $('fbBig'); el.className = 'fbbig goal'; el.innerHTML = [...'GOAL!'].map((c, i) => `<i style="animation-delay:${i * .06}s">${c}</i>`).join(''); el.hidden = false;
    const sub = $('fbSub'); const M = FB.M; const g = M.scorers[M.scorers.length - 1]; sub.textContent = `${g.name}${g.own ? ' (own goal)' : ''}  ·  ${M.score[0]} - ${M.score[1]}`; sub.hidden = false;
    confetti(team === 0 ? MY_KIT[0] : M.opp[1]); }
  function confetti(col) { const box = $('fbConf'); box.innerHTML = ''; box.hidden = false; const cols = [col, '#ffffff', '#ffd400', col];
    for (let i = 0; i < 90; i++) { const d = document.createElement('i'); d.style.left = rnd(0, 100) + '%'; d.style.background = cols[i % cols.length]; d.style.animationDelay = rnd(0, .8) + 's'; d.style.animationDuration = rnd(1.6, 3) + 's'; d.style.transform = `rotate(${rnd(0, 360)}deg)`; box.appendChild(d); }
    setTimeout(() => { box.hidden = true; box.innerHTML = ''; }, 4200); }

  // ---------------------------------------------------------------- the players: you, your four, their five
  function steer(p, tu, tv, spd, dt, acc = 9) { const du = tu - p.u, dv = tv - p.v, d = Math.hypot(du, dv); let wu = 0, wv = 0;
    if (d > .25) { const s = Math.min(spd, d * 2.2); wu = du / d * s; wv = dv / d * s; }
    move(p, wu, wv, dt, acc); }
  function move(p, wu, wv, dt, acc = 9) { const k = 1 - Math.exp(-acc * dt * .6); p.vu += (wu - p.vu) * k; p.vv += (wv - p.vv) * k; p.sp = Math.hypot(p.vu, p.vv);
    p.u += p.vu * dt; p.v += p.vv * dt; if (p.sp > .4) p.face += angD(p.face, Math.atan2(p.vv, p.vu)) * Math.min(1, dt * 10); }
  function faceTo(p, u, v, dt) { p.face += angD(p.face, Math.atan2(v - p.v, u - p.u)) * Math.min(1, dt * 8); }
  const spdOf = (p, sprint) => (sprint ? 6.7 : 4.4) * (p.me ? 1 : (.92 + p.skill * .08));
  function controlBall(p) { const M = FB.M, B = M.B; B.own = p; B.vu = B.vv = B.vy = 0; B.last = p; B.lastT = p.team; B.y = BR; B.inGoal = 0; p.touch = 0; M.passTo = null;
    if (p.team !== (M.poss == null ? -1 : M.poss)) { M.poss = p.team; } M.shotBy = null; }
  // who can touch the ball this frame
  function contact(dt) { const M = FB.M, B = M.B, K = M.K; if (B.own || B.free > 0 || M.phase !== 'play') return;
    let best = null, bd = 1e9; const bsp = Math.hypot(B.vu, B.vv);
    for (const p of M.P) { if (p.down > 0 || p.cool > 0) continue; const d = Math.hypot(p.u - B.u, p.v - B.v);
      if (p.gk && p.st === 'dive') continue;
      const reach = p.gk && inBox(p) ? 1.05 : .62, hy = p.gk && inBox(p) ? 2.3 : .75; if (d < reach && B.y < hy && d < bd) { best = p; bd = d; } }
    if (!best) return; const p = best;
    if (p.gk && inBox(p)) { // the keeper: catch it, or (hard shot) push it away
      const hard = bsp > 21 && Math.random() < .55; if (hard) { const a = Math.atan2(B.vv, B.vu) + Math.PI + rnd(-1.1, 1.1); B.vu = Math.cos(a) * bsp * .35; B.vv = Math.sin(a) * bsp * .35; B.vy = rnd(1, 3.5); B.free = .3; B.last = p; B.lastT = p.team; sKick(.4); if (M.shotBy) say('Saved!', 1.2); return; }
      controlBall(p); p.hold = 1.2; if (M.shotBy && M.shotBy.team !== p.team) { say('Saved!', 1.2); sCrowd(.45, 1.6); } return; }
    if (B.y > .75 && B.y < 2.2 && bd < .5) { // a header
      if (!p.me || IN.shoot) { play(p, 'header'); const gs = goalSide(p.team), a = Math.atan2(rnd(-K.gw, K.gw) - B.v, gs * K.hx - B.u); kickBall(p, Math.cos(a), Math.sin(a), 13, 1.5, p.me || Math.abs(gs * K.hx - p.u) < 12 ? 'shot' : 'pass'); return; } }
    if (bsp > 15 && Math.random() < .5) { B.vu *= -.25; B.vv *= -.25; B.free = .15; B.last = p; B.lastT = p.team; sKick(.2); return; }   // too hard to take: it comes off him
    controlBall(p); }
  const inBox = p => { const K = FB.M.K, gx = goalSide(1 - p.team) * K.hx; return Math.abs(p.u - gx) < K.box && Math.abs(p.v) < K.boxW; };
  // the ball at the feet of whoever has it (a touch ahead when running, further when sprinting)
  function dribble(p, dt) { const B = FB.M.B; p.touch = (p.touch || 0) + dt * (2 + p.sp * .9); const ahead = .45 + p.sp * .06 + (p.sp > 5.5 ? .25 : 0) + Math.max(0, Math.sin(p.touch * 2.2)) * .12 * Math.min(1, p.sp / 3);
    const tu = p.u + Math.cos(p.face) * ahead, tv = p.v + Math.sin(p.face) * ahead; const k = 1 - Math.exp(-dt * 16); B.u += (tu - B.u) * k; B.v += (tv - B.v) * k; B.y = BR;
    B.rollU = p.vu; B.rollV = p.vv; }

  function youTick(p, dt) { const M = FB.M, B = M.B, K = M.K; const s = stick(), hasBall = B.own === p;
    const sprint = IN.sprint && p.stam > .05 && !!s; p.stam = clamp(p.stam + (sprint ? -.22 : .14) * dt, 0, 1);
    if (p.down > 0) { p.down -= dt; move(p, 0, 0, dt, 4); return; }
    if (p.st === 'slide') { p.stT += dt; move(p, Math.cos(p.face) * (p.stT < .5 ? 8 : 2), Math.sin(p.face) * (p.stT < .5 ? 8 : 2), dt, 6); tackleHit(p); if (p.stT > .95) { p.st = 'idle'; } return; }
    const sp = spdOf(p, sprint) * (s ? s.k : 0) * (hasBall ? .93 : 1);
    if (s) move(p, s.u * sp, s.v * sp, dt, hasBall ? 7 : 10); else move(p, 0, 0, dt, 8);
    // SHOOT: hold to power, let go
    if (IN.shoot) { IN.charge = Math.min(1, IN.charge + dt * 1.15); }
    if (!IN.shoot && IN.wasShoot) { const pw = Math.max(.25, IN.charge); IN.charge = 0;
      if (hasBall && p.cool <= 0) { const gs = goalSide(0); let aim = null; if (s) { aim = clamp(B.v + s.v * K.gw * 3, -K.gw * .85, K.gw * .85); } play(p, 'shoot', { ts: 1.15 }); p.kickAt = { t: .26, fn: () => { if (FB.M.B.own === p) shoot(p, pw, aim); } }; }
      else if (B.own == null && Math.hypot(B.u - p.u, B.v - p.v) < 1.1 && B.y < 1.2) { play(p, 'shoot', { ts: 1.25 }); shoot(p, pw * .85, null); } }
    // PASS: to the teammate you point at (or the best one); without the ball: call for it
    if (IN.pass && !IN.wasPass) { if (hasBall && p.cool <= 0) { const q = bestMate(p, s); if (q) { play(p, 'pass', { ts: 1.2 }); p.kickAt = { t: .18, fn: () => { if (FB.M.B.own === p) passTo(p, q); } }; } }
      else if (!hasBall) { const own = B.own; if (own && own.team === 0) { play(p, 'call'); own.callT = M.t; say(`${own.name}! Pass am!`, 1.2); } } }
    // TACKLE: a standing tackle near the man, a slide when you run at him
    if (IN.tackle && !IN.wasTackle && !hasBall && p.tackleCool <= 0) { const c = B.own; if (sprint || (c && Math.hypot(c.u - p.u, c.v - p.v) > 1.4)) { p.st = 'slide'; p.stT = 0; play(p, 'slide'); p.tackleCool = 1.2; }
      else if (c && c.team !== 0 && Math.hypot(c.u - p.u, c.v - p.v) < 1.6) { p.tackleCool = .7; play(p, 'pass', { ts: 1.4 }); if (Math.random() < .62) loose(c, p); else { p.down = .25; } } }
    IN.wasShoot = IN.shoot; IN.wasPass = IN.pass; IN.wasTackle = IN.tackle; }
  function tackleHit(p) { const M = FB.M, B = M.B, c = B.own; const fu = p.u + Math.cos(p.face) * .7, fv = p.v + Math.sin(p.face) * .7;
    if (c && c.team !== p.team && Math.hypot(c.u - fu, c.v - fv) < 1.0 && !p.hitDone) { p.hitDone = true; if (Math.random() < (p.me ? .75 : .55)) { loose(c, p); c.down = .7; play(c, 'despair', { ts: 2.5 }); } }
    else if (!B.own && Math.hypot(B.u - fu, B.v - fv) < .8 && B.free <= 0) { B.vu = Math.cos(p.face) * 6 + rnd(-1, 1); B.vv = Math.sin(p.face) * 6 + rnd(-1, 1); B.free = .2; B.last = p; B.lastT = p.team; sKick(.3); }
    if (p.stT < .05) p.hitDone = false; }
  function loose(c, by) { const M = FB.M, B = M.B; B.own = null; const a = Math.atan2(c.v - by.v, c.u - by.u) + rnd(-.8, .8); B.vu = Math.cos(a) * rnd(3, 6); B.vv = Math.sin(a) * rnd(3, 6); B.vy = rnd(0, 1.5); B.free = .25; B.last = by; B.lastT = by.team; c.cool = .6; sKick(.25); }
  function bestMate(p, s) { const M = FB.M, gs = goalSide(p.team); let best = null, bs = -1e9;
    for (const q of M.P) { if (q === p || q.team !== p.team || q.gk) continue; const du = q.u - p.u, dv = q.v - p.v, d = Math.hypot(du, dv) || 1; if (d > 30) continue;
      let sc = -d * .08 + (q.u - p.u) * gs * .06 - (blocked(p, q) ? 1.5 : 0) + open(q) * .5; if (s) sc += ((du * s.u + dv * s.v) / d) * 3; if (q.me) sc += .6; if (sc > bs) { bs = sc; best = q; } }
    return best; }
  const open = q => { let d = 9; for (const o of FB.M.P) if (o.team !== q.team) d = Math.min(d, Math.hypot(o.u - q.u, o.v - q.v)); return Math.min(1, d / 5); };

  // the others: where to stand, who goes to the ball, what to do with it
  function aiTick(p, dt) { const M = FB.M, B = M.B, K = M.K, gs = goalSide(p.team), own = B.own;
    if (p.down > 0) { p.down -= dt; move(p, 0, 0, dt, 4); return; }
    if (p.st === 'slide') { p.stT += dt; move(p, Math.cos(p.face) * (p.stT < .5 ? 7.5 : 2), Math.sin(p.face) * (p.stT < .5 ? 7.5 : 2), dt, 6); tackleHit(p); if (p.stT > .95) p.st = 'idle'; return; }
    if (p.gk) return keeper(p, dt);
    if (own === p) return carry(p, dt);
    const attack = own ? own.team === p.team : M.poss === p.team, F = M.F[p.i];
    // the shape: shift with the ball, up when we have it, back when they do
    let hu = F.u * K.hx * gs + B.u * .45 + (attack ? .28 : -.08) * K.hx * gs, hv = F.v * K.hz * gs * .9 + B.v * .3;
    if (attack && F.att && own && own !== p) { hu += gs * (K.n === 11 ? 6 : 3); }   // run into space ahead
    hu = clamp(hu, -K.hx + 1, K.hx - 1); hv = clamp(hv, -K.hz + 1, K.hz - 1);
    // the ball: the nearest of each side goes for it (a pass on its way: the one it is for)
    const chase = chaser(p.team); let tu = hu, tv = hv, spd = 4.2;
    if (M.passTo === p && !own) { const t = Math.hypot(B.u - p.u, B.v - p.v) / Math.max(4, Math.hypot(B.vu, B.vv)); tu = B.u + B.vu * t * .6; tv = B.v + B.vv * t * .6; spd = 5.5; }
    else if (chase === p && (!own || own.team !== p.team)) { const t = own ? .25 : Math.min(1, Math.hypot(B.u - p.u, B.v - p.v) / 6); tu = B.u + (own ? own.vu : B.vu) * t; tv = B.v + (own ? own.vv : B.vv) * t; spd = 6.1 * (.9 + p.skill * .1);
      if (own && own.team !== p.team && Math.hypot(own.u - p.u, own.v - p.v) < 1.3 && p.tackleCool <= 0) { p.tackleCool = rnd(1.1, 1.9); const fromFront = Math.cos(own.face - Math.atan2(p.v - own.v, p.u - own.u)) > 0;
        if (Math.random() < .3 && Math.hypot(own.vu, own.vv) > 4) { p.st = 'slide'; p.stT = 0; p.face = Math.atan2(own.v - p.v, own.u - p.u); play(p, 'slide'); }
        else { play(p, 'pass', { ts: 1.4 }); if (Math.random() < (own.me ? .26 : .42) * (fromFront ? 1.2 : .8)) loose(own, p); else p.down = .2; } } }
    else if (!attack && second(p.team) === p) { const gx = gs * -K.hx; tu = lerp(B.u, gx, .35); tv = B.v * .6; spd = 5; }   // cover: between the ball and our goal
    else if (!attack) { const o = mark(p); if (o) { tu = lerp(o.u, -gs * K.hx, .2); tv = lerp(o.v, 0, .1); spd = 4.6; } }
    steer(p, tu, tv, spd, dt); if (p.sp < .3) faceTo(p, B.u, B.v, dt); }
  const chaser = team => { const M = FB.M, B = M.B; let best = null, bd = 1e9; for (const p of M.P) { if (p.team !== team || p.gk || p.down > 0) continue; if (p.me && team === 0) { /* you chase for yourself; your mates chase too */ } const d = Math.hypot(p.u - B.u, p.v - B.v); if (d < bd && !p.me) { bd = d; best = p; } } return best; };
  const second = team => { const M = FB.M, B = M.B, c = chaser(team); let best = null, bd = 1e9; for (const p of M.P) { if (p.team !== team || p.gk || p === c || p.me) continue; const d = Math.hypot(p.u - B.u, p.v - B.v); if (d < bd) { bd = d; best = p; } } return best; };
  function mark(p) { const M = FB.M; let best = null, bd = 1e9; for (const o of M.P) { if (o.team === p.team || o.gk) continue; const taken = M.P.some(q => q !== p && q.team === p.team && q.marking === o); const d = Math.hypot(o.u - p.u, o.v - p.v) + (taken ? 6 : 0); if (d < bd) { bd = d; best = o; } } p.marking = best; return best; }
  // with the ball: shoot when it's on, pass when they close you down (to you, often), else run at goal
  function carry(p, dt) { const M = FB.M, B = M.B, K = M.K, gs = goalSide(p.team), gx = gs * K.hx; p.think = (p.think || 0) - dt;
    if (p.hold > 0) { p.hold -= dt; move(p, 0, 0, dt); dribble(p, dt); return; }
    const dg = Math.hypot(gx - p.u, p.v), near = M.P.filter(o => o.team !== p.team && !o.gk).map(o => ({ o, d: Math.hypot(o.u - p.u, o.v - p.v) })).sort((a, b) => a.d - b.d)[0];
    const press = near && near.d < 2.3 && Math.cos(Math.atan2(near.o.v - p.v, near.o.u - p.u) - Math.atan2(-p.v, gx - p.u)) > 0;
    if (p.cool <= 0 && p.think <= 0) { p.think = .22;
      const me = M.me, callMe = p.team === 0 && !p.me && M.t - (p.callT || -9) < 1.6 && !blocked(p, me);
      if (callMe) { play(p, 'pass', { ts: 1.2 }); p.kickAt = { t: .18, fn: () => { if (FB.M.B.own === p) passTo(p, me); } }; return; }
      if (dg < K.shoot && Math.abs(p.v) < K.hz * .8 && (Math.random() < (dg < 8 ? .7 : .35)) && !shotBlocked(p)) { play(p, 'shoot', { ts: 1.15 }); p.kickAt = { t: .26, fn: () => { if (FB.M.B.own === p) shoot(p, rnd(.55, .95), rnd(-K.gw * .85, K.gw * .85)); } }; return; }
      if (press && Math.random() < .75) { const q = bestMate(p, null); if (q) { play(p, 'pass', { ts: 1.2 }); p.kickAt = { t: .18, fn: () => { if (FB.M.B.own === p) passTo(p, q); } }; return; } }
      if (p.team === 0 && open(me) > .7 && Math.random() < .25 && !blocked(p, me)) { play(p, 'pass', { ts: 1.2 }); p.kickAt = { t: .18, fn: () => { if (FB.M.B.own === p) passTo(p, me); } }; return; } }
    // run at goal, around the man in front
    let du = gx - p.u, dv = -p.v * .6; const l = Math.hypot(du, dv) || 1; du /= l; dv /= l;
    for (const o of M.P) { if (o.team === p.team) continue; const ou = o.u - p.u, ov = o.v - p.v, d = Math.hypot(ou, ov); if (d < 4 && d > .1 && (ou * du + ov * dv) > 0) { const side = (ou * dv - ov * du) > 0 ? 1 : -1; du += -dv * side * (4 - d) * .35; dv += du * side * (4 - d) * .35; } }
    const l2 = Math.hypot(du, dv) || 1; const sp = spdOf(p, dg > 9 && !press) * .9; move(p, du / l2 * sp, dv / l2 * sp, dt, 7); dribble(p, dt); }
  function shotBlocked(p) { const M = FB.M, K = M.K, gx = goalSide(p.team) * K.hx; let n = 0; for (const o of M.P) { if (o.team === p.team || o.gk) continue; const ax = gx - p.u, av = -p.v, L = Math.hypot(ax, av) || 1, t = ((o.u - p.u) * ax + (o.v - p.v) * av) / L; if (t < .5 || t > L) continue; if (Math.abs((o.u - p.u) * av - (o.v - p.v) * ax) / L < .8) n++; } return n > 0; }
  // the keeper: on the line between ball and goal, out to narrow the angle, dives at shots he can reach
  function keeper(p, dt) { const M = FB.M, B = M.B, K = M.K, gx = goalSide(1 - p.team) * K.hx, s = Math.sign(gx);
    if (B.own === p) { p.hold = (p.hold || 1.2) - dt; move(p, 0, 0, dt); faceTo(p, 0, 0, dt); B.u = p.u - s * .4; B.v = p.v; B.y = .9;
      if (p.hold <= 0 && p.cool <= 0) { const q = bestMate(p, null); if (q) { play(p, 'gk_throw'); const pp = p; p.kickAt = { t: .45, fn: () => { if (FB.M.B.own === pp) { passTo(pp, q); FB.M.B.y = .5; play(pp, 'gk_ready', { hold: true }); } } }; p.cool = .8; } } return; }
    if (p.st === 'dive') { p.stT += dt; const k = p.stT < .62 ? 1 : Math.max(0, 1 - (p.stT - .62) * 2); p.u += p.dvU * dt * k; p.v += p.dvV * dt * k;
      // a save: the ball comes within his reach while he flies
      if (!B.own && B.free <= 0 && p.stT > .12 && p.stT < .75) { const hu = p.u + p.dvU * .12, hv = p.v + p.dvV * .12, d = Math.hypot(B.u - hu, B.v - hv); if (d < 1.15 && B.y < 2.3 && !p.saved) { p.saved = true;
          if (p.willSave) { const sp = Math.hypot(B.vu, B.vv); if (sp > 19 || Math.random() < .5) { B.vu = -B.vu * .25 + rnd(-2, 2); B.vv = p.dvV * 2.5 + rnd(-3, 3); B.vy = rnd(1.5, 4); B.free = .35; B.last = p; B.lastT = p.team; sKick(.5); } else controlBall(p); say(['What a save!', 'Saved!', 'He don catch am!'][(Math.random() * 3) | 0], 1.6); sCrowd(.6, 2); } } }
      if (p.stT > 1.45) { p.st = 'idle'; play(p, 'gk_ready', { hold: true, fade: .35 }); } return; }
    // a shot on: dive if he must (he sees it a moment late)
    const sp = Math.hypot(B.vu, B.vv);
    if (!B.own && sp > 6 && Math.sign(B.vu) === s && M.shotBy && M.shotBy.team !== p.team) { const t = (gx - B.u) / B.vu; if (t > 0 && t < 1.4) { const cv = B.v + B.vv * t, cy = B.y + B.vy * t - .5 * G * t * t;
        p.react = (p.react || 0) + dt; if (p.react > .12 + (1 - p.skill) * .2 && Math.abs(cv) < K.gw + .4 && cy < K.gh + .3) { const lat = cv - p.v;
          if (Math.abs(lat) > .7 && p.st !== 'dive') { p.st = 'dive'; p.stT = 0; p.saved = false; const left = Math.sign(lat) === Math.sign(Math.sin(p.face + Math.PI / 2) || 1);
            const dir = Math.sign(lat); p.dvU = 0; p.dvV = clamp(lat, -2.6, 2.6) / .55; p.face = Math.atan2(0, -s) ; const toLeft = (dir > 0) === (s > 0);   // facing out of the goal: his left is +v when he faces -u
            play(p, toLeft ? 'dive_l' : 'dive_r', { fade: .05 }); p.willSave = Math.random() < clamp(.78 - Math.max(0, sp - 17) * .03 - Math.max(0, Math.abs(cv) - K.gw * .55) * .35 + (p.skill - .85), .12, .85); return; }
          if (Math.abs(lat) <= .7) steer(p, p.u, cv, 5, dt); } } } else p.react = 0;
    // position: on the line from the goal to the ball, a little off the line
    const bu = B.own ? B.own.u : B.u, bv = B.own ? B.own.v : B.v, dgu = bu - gx, dgv = bv, d = Math.hypot(dgu, dgv) || 1, out = clamp(d * .14, .6, 2.6);
    let tu = gx + dgu / d * out, tv = clamp(dgv / d * out * 1.6, -K.gw + .3, K.gw - .3);
    // the ball loose in his box: come and get it
    if (!B.own && Math.abs(B.u - gx) < K.box - 1 && Math.abs(B.v) < K.gw + 2.5 && sp < 7) { tu = B.u; tv = B.v; }
    steer(p, tu, tv, 5, dt); faceTo(p, bu, bv, dt); if (p.sp > 2.4 && p.A.shotName === 'gk_ready') stopShot(p, .15); else if (p.sp < 1.2 && !p.A.shot) play(p, 'gk_ready', { hold: true, fade: .2 }); }

  // ---------------------------------------------------------------- the match, frame by frame
  function update(dt) { const M = FB.M; if (!M) return; const K = M.K, B = M.B;
    M.pt += dt; const slow = M.phase === 'replay' ? .45 : 1;
    if (M.phase === 'replay') { if ((IN.shoot || IN.pass) && M.pt > .6) { IN.shoot = IN.pass = false; endReplay(); return; } replayTick(dt); return; }
    const sdt = dt * slow, n = Math.max(1, Math.ceil(sdt / (1 / 60))), h = sdt / n;
    for (let k = 0; k < n; k++) step(h);
    for (const p of M.P) { animTick(p, sdt); place(p); }
    for (const net of M.PI.nets) netTick(net, sdt);
    placeBall(sdt); marks(sdt); fansTick(sdt); record(sdt); hud(); api.setPlayer(toW(M.S, M.me.u, M.me.v), yawW(M.S, M.me.face)); }
  function step(dt) { const M = FB.M, K = M.K, B = M.B; M.t += dt;
    for (const p of M.P) { if (p.cool > 0) p.cool -= dt; if (p.tackleCool > 0) p.tackleCool -= dt; if (p.kickAt) { p.kickAt.t -= dt; if (p.kickAt.t <= 0) { const f = p.kickAt.fn; p.kickAt = null; f(); } } }
    if (M.phase === 'intro') { if (M.pt > 4.2) { M.phase = 'kickoff'; M.pt = 0; say('KICK OFF', 1.4, true); sWhistle(1); } idleAll(dt); return; }
    if (M.phase === 'kickoff') { idleAll(dt); if (M.pt > 1.1) { const k = M.P.find(p => p.team === M.kickTeam && p.i === meOf(M.K)), q = M.P.find(p => p.team === M.kickTeam && p.i === mateOf(M.K)); M.phase = 'play'; M.pt = 0; controlBall(k);
        if (!k.me) { k.kickAt = { t: .25, fn: () => passTo(k, q, false) }; play(k, 'pass'); } } return; }
    if (M.phase === 'restart') { const R = M.restart; idleAll(dt); B.u = R.u; B.v = R.v; B.y = BR;
      const t = M.P.filter(p => p.team === R.team && !p.gk).sort((a, b) => Math.hypot(a.u - R.u, a.v - R.v) - Math.hypot(b.u - R.u, b.v - R.v))[0]; if (R.what === 'Goal kick') { const gk = M.P.find(p => p.team === R.team && p.gk); steer(gk, R.u, R.v, 6, dt); if (M.pt > 1.2) { M.phase = 'play'; controlBall(gk); gk.hold = .5; } return; }
      steer(t, R.u - Math.sign(R.u || 1) * .3, R.v - Math.sign(R.v || 1) * .4, 6, dt); if (M.pt > 1.4) { M.phase = 'play'; M.pt = 0; controlBall(t); t.hold = t.me ? 0 : .35; } return; }
    if (M.phase === 'goal') { celebrate(dt); if (M.pt > 3.6) { M.phase = 'replay'; M.pt = 0; M.rp = { i: Math.max(0, M.rec.length - 1 - Math.round(4 * 30)), end: M.rec.length - 1, f: 0 }; $('fbBig').hidden = true; $('fbSub').hidden = true; $('fbRep').hidden = false; screen(M.PI, 'replay'); } return; }
    if (M.phase === 'ft') { idleAll(dt); return; }
    // play
    M.clock -= dt; if (M.clock <= 0) { M.clock = 0; fullTime(); return; }
    for (const p of M.P) { if (p.me) youTick(p, dt); else aiTick(p, dt); }
    if (B.own) { if (!B.own.gk) dribble(B.own, dt); }
    ballStep(dt); contact(dt); bump(dt); bounds(); }
  function idleAll(dt) { for (const p of FB.M.P) { if (p.st === 'dive') continue; move(p, 0, 0, dt, 6); faceTo(p, FB.M.B.u, FB.M.B.v, dt); } }
  function bump() { const M = FB.M, P = M.P; for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) { const a = P[i], b = P[j], du = b.u - a.u, dv = b.v - a.v, d = Math.hypot(du, dv); if (d < .62 && d > 1e-3) { const k = (.62 - d) / 2 / d; a.u -= du * k; a.v -= dv * k; b.u += du * k; b.v += dv * k; } } }
  function bounds() { const M = FB.M, K = M.K; for (const p of M.P) { const lim = K.walls ? 0 : 2.5; p.u = clamp(p.u, -K.hx - lim - (p.gk ? .5 : 0), K.hx + lim + (p.gk ? .5 : 0)); p.v = clamp(p.v, -K.hz - lim + (K.walls ? .4 : 0), K.hz + lim - (K.walls ? .4 : 0)); } }
  function celebrate(dt) { const M = FB.M, sc = M.scorer, gs = goalSide(sc.team);
    sc.celeT += dt; if (sc.celeT < .05) { if (sc.cele === 'knee_slide') { sc.slideV = 7; } play(sc, sc.cele, { hold: sc.cele === 'plane' || sc.cele === 'cheer' }); }
    if (sc.cele === 'knee_slide') { sc.slideV = Math.max(0, (sc.slideV || 0) - dt * 3.2); const a = Math.atan2(-sc.v * .3, -gs); sc.face += angD(sc.face, a) * Math.min(1, dt * 3); sc.u += Math.cos(sc.face) * sc.slideV * dt; sc.v += Math.sin(sc.face) * sc.slideV * dt; sc.sp = 0; }
    else if (sc.cele === 'plane') { sc.face += dt * 1.6; sc.u += Math.cos(sc.face) * 5 * dt; sc.v += Math.sin(sc.face) * 5 * dt; sc.sp = 0; }
    else { sc.sp = 0; }
    for (const p of M.P) { if (p === sc || p.st === 'dive') continue; p.celeD -= dt; if (p.celeD > 0) { move(p, 0, 0, dt); continue; }
      if (p.team === sc.team) { if (Math.hypot(sc.u - p.u, sc.v - p.v) > 2.2) steer(p, sc.u, sc.v, 6.2, dt); else { move(p, 0, 0, dt); if (p.A.shotName !== 'cheer') play(p, 'cheer', { hold: true }); faceTo(p, sc.u, sc.v, dt); } }
      else { move(p, 0, 0, dt); if (!p.gk && p.A.shotName !== 'despair' && Math.random() < .02) play(p, 'despair'); } } }
  function after() { const M = FB.M; for (const p of M.P) { if (p.gk) play(p, 'gk_ready', { hold: true }); else stopShot(p, .25); } kickoff(1 - M.goalTeam); M.B.inGoal = 0; }
  function fullTime() { const M = FB.M; M.phase = 'ft'; M.pt = 0; sWhistle(3, true); const [a, b] = M.score, win = a > b, draw = a === b;
    const Z = M.prize, prize = win ? Z.win : draw ? Z.draw : 0; if (prize) api.addCash(prize); api.cred(Z.cred[win ? 0 : draw ? 1 : 2], win ? 'won a match' : draw ? 'drew a match' : 'played a match'); screen(M.PI, 'ft');
    if (win) sCrowd(1, 5);
    for (const p of M.P) { if (p.st === 'dive') continue; play(p, (p.team === 0) === win ? 'cheer' : draw ? 'call' : 'despair', { hold: (p.team === 0) === win }); }
    const el = $('fbEnd'); el.innerHTML = `<h3>${win ? 'YOU WIN!' : draw ? 'DRAW' : 'YOU LOSE'}</h3><div class="fbfs"><span style="--c:${MY_KIT[0]}">YOUR BOYS</span><b>${a} - ${b}</b><span style="--c:${M.opp[1]}">${M.opp[0].toUpperCase()}</span></div>
      <ul>${M.scorers.map(s => `<li class="${s.team ? 'r' : ''}">⚽ ${s.name}${s.own ? ' (og)' : ''} ${s.min}'</li>`).join('') || '<li>No goals</li>'}</ul>
      <p>${prize ? 'You get ' + api.naira(prize) + (M.myGoals ? ` · you scored ${M.myGoals}` : '') : M.myGoals ? `You scored ${M.myGoals}. Next time!` : 'Next time, show them!'}</p>
      <div class="fbbtn"><button id="fbAgain">PLAY AGAIN</button><button id="fbLeave">LEAVE</button></div>`; el.hidden = false;
    $('fbAgain').onclick = () => { const PI = M.PI, opp = M.opp; stop(); menu(PI); }; $('fbLeave').onclick = () => stop(); }
  function quitAsk() { const M = FB.M; if (!M) return; if (M.phase === 'ft') { stop(); return; } if (confirmQuit()) stop(); }
  let quitT = 0; function confirmQuit() { const t = performance.now(); if (t - quitT < 2500) return true; quitT = t; api.toast('Press again to leave the match (you lose your stake).', 2.5); return false; }
  function stop() { const M = FB.M; if (!M) return; crowdLoop(0); setTimeout(() => screen(M.PI, 'idle'), 0); ring.visible = arrow.visible = trail.visible = false; for (const o of M.PI.nearFence || []) o.visible = true; for (const p of M.P) { p.m.dispose(); } scene.remove(M.B.m); scene.remove(M.B.sh); for (const f of M.fans) api.folkGone(f); FB.M = null; FB.on = false; ui(false); api.enter(false, M.PI.S.json && M.PI.S.json.marks && M.PI.S.json.marks.sign ? toW(M.PI.S, M.PI.S.json.marks.sign[0], M.PI.S.json.marks.sign[1]) : null);
    for (const net of M.PI.nets) { net.pos.set(net.rest); net.vel.fill(0); net.m.geometry.attributes.position.needsUpdate = true; } }

  // models follow the game state
  function place(p) { const M = FB.M, w = toW(M.S, p.u, p.v); p.m.root.position.set(w.x, 0, w.z); p.m.root.rotation.y = yawW(M.S, p.face); }
  function marks(dt) { const M = FB.M, me = M.me, w = toW(M.S, me.u, me.v), on = M.phase === 'play' || M.phase === 'kickoff' || M.phase === 'restart'; ring.visible = arrow.visible = on; if (!on) return;
    ring.position.set(w.x, .04, w.z); arrow.position.set(w.x, 2.25 + Math.sin(M.t * 5) * .06, w.z); arrow.rotation.y += dt * 2; ringMat.color.set(M.B.own === me ? 0x7dffb0 : 0xffd54a);
    // a hard shot leaves a streak behind the ball
    const B = M.B, sp = Math.hypot(B.vu, B.vv); if (!B.own && sp > 17 && M.phase === 'play') { trail.visible = true; trailPos.copyWithin(3, 0, (trailN - 1) * 3); trailPos[0] = B.m.position.x; trailPos[1] = B.m.position.y; trailPos[2] = B.m.position.z; trailGeo.attributes.position.needsUpdate = true; }
    else if (trail.visible) { trail.visible = false; for (let i = 0; i < trailN; i++) { trailPos[i * 3] = B.m.position.x; trailPos[i * 3 + 1] = B.m.position.y; trailPos[i * 3 + 2] = B.m.position.z; } } }
  function placeBall(dt) { const M = FB.M, B = M.B; let bu = B.u, bv = B.v, by = B.y; if (B.own && B.own.gk && B.own.st !== 'dive') { const g = B.own, s = goalSide(1 - g.team); bu = g.u - s * .35; bv = g.v; by = 1.0; }
    const w = toW(M.S, bu, bv); B.m.position.set(w.x, by, w.z); B.sh.position.set(w.x, .03, w.z); B.sh.scale.setScalar(clamp(1 - (by - BR) * .2, .4, 1));
    const vu = B.own ? (B.rollU || 0) : B.vu, vv = B.own ? (B.rollV || 0) : B.vv, sp = Math.hypot(vu, vv); if (sp > .05) { const c = Math.cos(M.S.ry), s = Math.sin(M.S.ry), wx = vu * c + vv * s, wz = -vu * s + vv * c; _v.set(wz, 0, -wx).normalize(); B.m.rotateOnWorldAxis(_v, sp * dt / BR); } }
  function fansTick(dt) { const M = FB.M; for (const f of M.fans) { if (M.phase === 'goal' && !f.cheer) { f.cheer = true; api.folkDo(f, ['jump', 'hail']); } if (M.phase !== 'goal' && f.cheer) { f.cheer = false; api.folkDo(f, ['hail', 'idle_1']); } f.mixer.update(dt); } }

  // ---------------------------------------------------------------- the replay: the last seconds again, slowly, from behind the goal
  function record(dt) { const M = FB.M; if (M.phase !== 'play' && M.phase !== 'goal') return; M.recT = (M.recT || 0) + dt; if (M.recT < 1 / 30) return; M.recT -= 1 / 30;
    M.rec.push({ b: [M.B.u, M.B.v, M.B.y, M.B.m.quaternion.clone()], p: M.P.map(p => { const a = p.A.shot; return [p.u, p.v, p.face, p.sp, a ? p.A.shotName : null, a ? a.time : 0, p.A.loco.idle, p.A.loco.walk, p.A.loco.run]; }) }); if (M.rec.length > 30 * 12) M.rec.splice(0, M.rec.length - 30 * 12); }
  function replayTick(dt) { const M = FB.M, R = M.rp; R.f += dt * 30 * .5; const i = Math.min(R.end, R.i + Math.floor(R.f)), fr = M.rec[i]; if (!fr) { endReplay(); return; }
    M.B.u = fr.b[0]; M.B.v = fr.b[1]; M.B.y = fr.b[2]; M.B.m.quaternion.copy(fr.b[3]);
    M.P.forEach((p, k) => { const [u, v, face, sp, sn, st, li, lw, lr] = fr.p[k]; p.u = u; p.v = v; p.face = face; p.sp = sp; const A = p.A;
      if (sn) { if (A.shotName !== sn || !A.shot) play(p, sn, { fade: 0 }); if (A.shot) { A.shot.time = st; A.shot.setEffectiveWeight(1); } } else if (A.shot) stopShot(p, 0);
      for (const [n, w] of [['idle', li], ['walk', lw], ['run', lr]]) if (A.acts[n]) { A.loco[n] = w; A.acts[n].setEffectiveWeight(A.shot ? 0 : w); }
      p.m.mixer.update(dt * .5); place(p); });
    placeBall(0); const K = M.K; if (Math.abs(M.B.u) > K.hx + K.gd * .6 && Math.abs(M.B.v) < K.gw && !R.net) { R.net = true; const s = Math.sign(M.B.u), net = M.PI.nets[s > 0 ? 1 : 0]; netPush(net, s * (K.hx + K.gd), M.B.v, M.B.y, 20, s * .6, 0, 0); sNet(); } for (const net of M.PI.nets) netTick(net, dt * .5);
    if (i >= R.end && R.f > (R.end - R.i) + 30) endReplay(); }
  function endReplay() { const M = FB.M; $('fbRep').hidden = true; M.rec.length = 0; for (const net of M.PI.nets) { net.pos.set(net.rest); net.vel.fill(0); net.m.geometry.attributes.position.needsUpdate = true; } after(); }

  // ---------------------------------------------------------------- the camera
  function cam(dt) { const M = FB.M; if (!M) return false; const K = M.K, B = M.B, C = M.cam, S = M.S;
    let pu, pv, py, lu, lv, ly; const fov = K.cam.fov * (innerWidth < innerHeight ? 1.35 : 1);
    if (M.phase === 'intro') { const a = -Math.PI * .1 + M.pt * .32, r = K.hx * K.intro[0]; pu = Math.cos(a) * r; pv = Math.sin(a) * r * (K.n === 11 ? .55 : 1.1) + K.hz * .6; py = K.intro[1] + M.pt * .8; lu = 0; lv = 0; ly = 0; }
    else if (M.phase === 'goal') { const sc = M.scorer, a = M.pt * .4 + Math.atan2(M.K.hz + 5 - sc.v, -sc.u * .2) - .6, r = 6.2 + M.pt * .25; pu = sc.u + Math.cos(a) * r; pv = sc.v + Math.sin(a) * r; py = 2.4 + M.pt * .15; lu = sc.u; lv = sc.v; ly = 1.05; }
    else if (M.phase === 'replay') { const s = Math.sign(B.u || 1), R = M.rp, k = R.end > R.i ? (R.i + R.f - R.i) / (R.end - R.i) : 1; if (k < .55) { pu = B.u - 2; pv = B.v + 7.5; py = 2.6; } else { pu = s * (K.hx + K.gd + K.repD); pv = B.v * .4 + 1.2; py = 2.5; } lu = B.u; lv = B.v; ly = Math.max(.4, B.y); }
    else if (M.phase === 'ft') { const a = M.pt * .2; pu = M.me.u + Math.cos(a) * 6; pv = M.me.v + Math.sin(a) * 6; py = 2.4; lu = M.me.u; lv = M.me.v; ly = 1.1; }
    else if (FB.view === 'pro') { const me = M.me, gs = 1; pu = me.u - gs * 7.5; pv = me.v * .85; py = 4.2; lu = me.u + gs * 5; lv = me.v * .9 + (B.v - me.v) * .25; ly = .8; }
    else { const tu = clamp((B.own ? B.own.u : B.u) * .9, -K.hx * .8, K.hx * .8), tv = clamp(B.v * .45, -K.hz * .5, K.hz * .5); C.u = lerp(C.u, tu, 1 - Math.exp(-dt * 2.4)); C.v = lerp(C.v, tv, 1 - Math.exp(-dt * 1.6));
      pu = C.u; pv = K.hz + K.cam.d; py = K.cam.h; lu = C.u; lv = C.v; ly = .2; }
    const P = toW(S, pu, pv), L = toW(S, lu, lv); const k = M.phase === 'play' || M.phase === 'kickoff' || M.phase === 'restart' ? 1 - Math.exp(-dt * 6) : M.phase === 'replay' ? 1 - Math.exp(-dt * 3) : 1 - Math.exp(-dt * 4);
    if (M.camCut !== M.phase) { M.camCut = M.phase; C.p.set(P.x, py, P.z); C.l.set(L.x, ly, L.z); }
    C.p.lerp(_v.set(P.x, py, P.z), k); C.l.lerp(_w.set(L.x, ly, L.z), k);
    camera.position.copy(C.p); if (M.shake > 0) { M.shake -= dt; const a = M.shake * .25; camera.position.x += rnd(-a, a); camera.position.y += rnd(-a, a); }
    camera.lookAt(C.l); if (Math.abs(camera.fov - fov) > .1) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const see = !(FB.view === 'tv' && (M.phase === 'play' || M.phase === 'kickoff' || M.phase === 'restart')); for (const o of M.PI.nearFence || []) o.visible = see;   // the TV camera looks through the near fence
    return true; }

  // ---------------------------------------------------------------- on screen: the score, the clock, power, buttons
  const $ = id => document.getElementById(id);
  function ui(on) { let r = $('fbUI');
    if (!r) { r = document.createElement('div'); r.id = 'fbUI'; r.innerHTML = `<div class="fbsb"><span class="t a"><i id="fbCa"></i><b id="fbNa">YOU</b></span><b id="fbSc">0 - 0</b><span class="t b"><b id="fbNb">AWAY</b><i id="fbCb"></i></span><em id="fbClk">3:00</em></div>
      <div id="fbStam" class="fbstam"><i></i></div><div id="fbPow" class="fbpow" hidden><i></i></div><div id="fbSay" class="fbsay" hidden></div><div id="fbBig" class="fbbig" hidden></div><div id="fbSub" class="fbsub" hidden></div>
      <div id="fbRep" class="fbrep" hidden><i></i>REPLAY</div><div id="fbConf" class="fbconf" hidden></div><div id="fbEnd" class="fbend" hidden></div>
      <div id="fbBtns" class="fbbtns"><button data-k="tackle" class="s">TACKLE</button><button data-k="pass">PASS</button><button data-k="shoot" class="big">SHOOT</button><button data-k="sprint" class="s">SPRINT</button><button data-k="cam" class="c">🎥</button></div>
      <div id="fbKeys" class="fbkeys">SPACE shoot (hold) · E pass / call · SHIFT sprint · Q tackle · V camera · ESC leave</div>`;
      document.body.appendChild(r);
      for (const b of r.querySelectorAll('#fbBtns button')) { const k = b.dataset.k; const set = v => { if (k === 'cam') { if (v) toggleCam(); return; } IN[k] = v; b.classList.toggle('on', v); };
        b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); b.setPointerCapture(e.pointerId); set(true); }); for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, e => { e.stopPropagation(); set(false); }); } }
    r.hidden = !on; document.body.classList.toggle('fbon', on); $('fbBtns').hidden = !api.touch(); $('fbKeys').hidden = api.touch(); if (!on) { $('fbEnd').hidden = true; $('fbRep').hidden = true; $('fbBig').hidden = true; $('fbSub').hidden = true; }
    for (const k in IN) IN[k] = typeof IN[k] === 'number' ? 0 : false;
    if (on) { const M = FB.M; $('fbNa').textContent = 'YOU'; $('fbNb').textContent = abbr(M.opp[0]); $('fbCa').style.background = MY_KIT[0]; $('fbCb').style.background = M.opp[1]; scoreUI(); } }
  const abbr = n => n.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase();
  function scoreUI() { const M = FB.M; $('fbSc').textContent = `${M.score[0]} - ${M.score[1]}`; }
  function hud() { const M = FB.M, c = Math.ceil(M.clock); if (M.PI.scr && M.phase === 'play' && (M.scrC !== c)) { M.scrC = c; screen(M.PI, 'match'); } $('fbClk').textContent = `${(c / 60) | 0}:${String(c % 60).padStart(2, '0')}`;
    const pw = $('fbPow'); pw.hidden = !(IN.shoot && IN.charge > .05); if (!pw.hidden) pw.firstChild.style.width = (IN.charge * 100) + '%', pw.classList.toggle('hot', IN.charge > .82);
    $('fbStam').firstChild.style.width = (M.me.stam * 100) + '%'; if (M.sayT > 0) { M.sayT -= 1 / 30; if (M.sayT <= 0) $('fbSay').hidden = true; }
    if (M.phase === 'ft' && M.pt > 6 && !M.leftT) { M.leftT = 1; } }
  function say(t, s = 1.5, big) { const M = FB.M; if (!M) return; const el = $('fbSay'); el.textContent = t; el.hidden = false; el.classList.toggle('big', !!big); M.sayT = s; }

  // the goal replay done -> kick off; the full-time table -> leave or again
  const _after = after;
  return {
    addPitch, pitchLoaded, menu, key, update, cam, stop, get on() { return FB.on; }, get match() { return FB.M; },
    // every frame (also when not playing): the boys at every pitch near you, the nets settle
    tick(dt, px, pz) { for (const PI of FB.pitches) { const d = Math.hypot(PI.S.x - px, PI.S.z - pz); if (PI.S.state === 2 && !PI.ready) pitchLoaded(PI); if (PI.kind !== 'stadium') boysTick(PI, dt, d < 120); } },
    pitches: FB.pitches, KINDS, _play: (p, n, o) => play(p, n, o), _clip: (m, n) => moveClip(m, n), _stop: (p) => stopShot(p, 0),
  };
}
