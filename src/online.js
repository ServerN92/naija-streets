/* ================= Naija Streets online =================
   Sign in with a username and password (an email only if you want a way back in when you forget the password), and
   the other players near you in Lagos are really there: their own person in their own clothes, walking, running,
   jumping, crouching, lying flat, fighting, or riding past on their okada or in their motor, with their name over
   their head. Talk to the people near you (60 m) or to all Lagos. While you are signed in your money is kept on the
   server, so it is the same on every phone and nobody can just type in more.
   The server is server/ (Fly.io). The game passes in `api` (its own functions); this file runs the line to the
   server, the sign-in panel, the chat, and draws the other players. Not signed in: nothing changes, nothing is sent. */

const PROTO = 1;
const KEY = 'naija-online', GUEST_CASH = 'naija-cash-guest';
const SEND_MS = 100, DELAY = .2;           // our position ten times a second; the others drawn 0.2 s behind, smoothly
const TAG_FAR = 80, CHAT_MAX = 40;
const TS = matchMedia && matchMedia('(pointer:coarse)').matches ? 1.2 : 1;   // names a little bigger on phones
const ONCE = new Set(['j', 'jr', 'pu', 'ki', 'hit', 'cl', 'sl']);
const CLIP = { i: 'idle', w: 'walk', w2: 'walk2', r: 'run', j: 'jump3', jr: 'jump_run', c: 'cr_idle', cw: 'cr_walk', sl: 'cr_slide', p: 'prone_idle', pc: 'prone_fwd', f: 'fight_idle', pu: 'punch', ki: 'kick', k: 'lie', ph: 'text', hit: 'hit_head', cl: 'vault' };
const FALLBACK = { jump3: 'jump', jump_run: 'jump', cr_idle: 'idle', cr_walk: 'walk', cr_slide: 'run', prone_idle: 'lie', prone_fwd: 'lie', vault: 'jump', fight_idle: 'idle', text: 'idle', hit_head: 'idle', punch: 'idle', kick: 'idle', lie: 'idle', walk2: 'walk', run: 'walk' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = s => document.querySelector(s);

// where the server is: the real one, or (only when the game itself runs on this computer) a test server
function serverUrl() {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const q = new URLSearchParams(location.search).get('server');
  if (local && q && /^wss?:\/\//.test(q)) return q;
  if (local) return `ws://${location.hostname}:8080/ws`;
  return 'wss://game.naijastreet.app/ws';
}

export function createOnline(api) {
  const { THREE, scene, camera } = api;
  const URL_ = serverUrl();
  const S = { ws: null, st: 'off', want: false, tries: 0, timer: null, me: null, n: 0, kicked: false, old: false,
    srv: 0, cseq: 0, cpend: [], ep: Math.random().toString(36).slice(2, 10), lastSend: 0, last: null, look: '', panel: false, tab: 'in', busy: false };
  const RS = new Map();   // the other players, by their number on the server
  let saved = null; try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
  const save = o => { saved = o; try { if (o) localStorage.setItem(KEY, JSON.stringify(o)); else localStorage.removeItem(KEY); } catch (e) { /* private mode */ } };

  // ---- the line to the server
  function connect() {
    if (S.ws || S.old) return;
    clearTimeout(S.timer); S.st = 'connecting'; ui();
    let ws; try { ws = new WebSocket(URL_); } catch (e) { S.st = 'off'; retry(); return; }
    S.ws = ws;
    ws.onopen = () => { S.tries = 0; send({ t: 'hi', v: PROTO, tok: saved && saved.tok || undefined }); };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } try { on(m); } catch (err) { console.warn('online', err); } };
    ws.onclose = () => {
      if (S.ws !== ws) return; S.ws = null; const wasIn = !!S.me; S.me = null; S.st = 'off'; S.busy = false; dropAll();
      if (wasIn && !S.kicked) api.toast('Online: line lost. Reconnecting…', 2.5);
      ui(); retry();
    };
    ws.onerror = () => {};
  }
  function retry() {
    if (S.old || S.kicked) return;
    if (!(saved && saved.tok) && !S.panel) return;   // a guest with the panel closed: no need for the line
    const wait = [1.5, 3, 6, 12, 25, 45, 60][Math.min(S.tries++, 6)];
    clearTimeout(S.timer); S.timer = setTimeout(connect, wait * 1000);
  }
  const send = o => { if (S.ws && S.ws.readyState === 1) { S.ws.send(JSON.stringify(o)); return true; } return false; };

  function on(m) {
    switch (m.t) {
      case 'guest': S.st = 'guest'; if (m.n != null) S.n = m.n; if (m.m && saved) { save(null); api.toast(m.m, 3); } ui(); break;
      case 'me': signedIn(m); break;
      case 'err': if (m.w === 'bk') { api.bank && api.bank(m); break; } if (m.w === 'bz') { api.biz && api.biz(m); break; } if (m.w === 'pk') { api.park && api.park(m); break; } if (m.w === 'law') { api.law && api.law(m); break; } S.busy = false; showErr(m.w, m.m); break;
      case 'ok': if (m.w === 'bz') { api.biz && api.biz(m); break; } if (m.w === 'pk') { api.park && api.park(m); break; } if (m.w === 'law') { api.law && api.law(m); break; } S.busy = false; showOk(m.w, m.m); break;
      case 'bz': case 'bzd': case 'bzlost': case 'bzate': case 'bzcut': case 'bzsent': case 'mk': case 'mkmine': case 'mkback': case 'mkerr': api.biz && api.biz(m); break;
      case 'bk': case 'bkname': case 'bksent': case 'bktx': api.bank && api.bank(m); break;
      case 'pk': case 'pkme': case 'pkd': case 'pkt': case 'pkf': api.park && api.park(m); break;
      case 'hurt': case 'hitok': case 'pko': case 'pkowin': case 'pvno': api.pvp && api.pvp(m); break;
      case 'lawme': case 'wanted': case 'lawcuff': case 'lawhands': case 'arrested': case 'arrestok': case 'settleask': case 'settled': api.law && api.law(m); break;
      case 'note': api.toast(m.m, 4); break;
      case 'tok': if (saved) save({ ...saved, tok: m.tok }); break;
      case 'email': if (S.me) S.me.email = m.email; ui(); break;
      case 'n': S.n = m.n; ui(); break;
      case 'w': world(m); break;
      case 'say': heard(m); break;
      case '$': money(m); break;
      case 'kick': S.kicked = true; S.me = null; dropAll(); api.bizOut && api.bizOut(); api.bank && api.bank({ t: 'bkout' }); api.toast(m.m || 'You signed in somewhere else.', 4); ui(); break;
      case 'out': if (m.gone) api.toast('Your account has been deleted.', 4); S.me = null; save(null); dropAll(); api.bizOut && api.bizOut(); api.bank && api.bank({ t: 'bkout' }); restoreGuest(); api.lifeOut && api.lifeOut(); S.st = 'guest'; ui(); api.toast('Signed out. You are playing on this phone only.', 3); break;
      case 'old': S.old = true; api.toast(m.m, 6); try { S.ws && S.ws.close(); } catch (e) { /* gone */ } ui(); break;
    }
  }
  function signedIn(m) {
    const fresh = !saved || saved.name !== m.name;
    if (!S.me && !(saved && saved.tok)) keepGuest();     // what you had as a guest waits for when you sign out
    S.me = { id: m.id, name: m.name, email: m.email || '' }; S.st = 'in'; S.busy = false; S.kicked = false; if (m.n) S.n = m.n;
    save({ tok: m.tok, name: m.name });
    S.srv = m.cash | 0;
    for (const p of S.cpend) send({ t: '$', d: p.d, s: p.s, e: S.ep });   // money made while the line was down
    showCash();
    S.look = ''; S.last = null; lookTick();
    if (api.lifeIn) api.lifeIn(m.life || null, m.uid);   // where you sleep, your rent, your clothes: the account's own
    if (S.panel && fresh) closePanel();
    if (fresh) api.toast(`Welcome, ${m.name}! You are online · ${m.n || 1} in Lagos now.`, 3.5);
    ui();
  }
  function keepGuest() { try { if (localStorage.getItem(GUEST_CASH) === null) localStorage.setItem(GUEST_CASH, String(api.getCash())); } catch (e) { /* ignore */ } }
  function restoreGuest() { let g = null; try { g = localStorage.getItem(GUEST_CASH); localStorage.removeItem(GUEST_CASH); } catch (e) { /* ignore */ } S.cpend = []; if (g !== null && isFinite(+g)) api.setCash(+g); }

  // ---- money: the server's number, plus what is on its way to it
  function cash(d) {
    if (!S.me && !(saved && saved.tok)) return;   // a guest: the phone keeps the money as before
    d = Math.round(d); if (!d) return;
    const s = ++S.cseq; S.cpend.push({ s, d }); if (S.cpend.length > 200) S.cpend.shift();
    if (S.me) send({ t: '$', d, s, e: S.ep });
  }
  function money(m) { S.srv = m.n; S.cpend = S.cpend.filter(p => p.s > m.s); showCash(); }
  function showCash() { let n = S.srv; for (const p of S.cpend) n = Math.max(0, n + p.d); if (n !== api.getCash()) api.setCash(n); }

  // ---- what we send: where we are and what we are doing, only when it changed (or every 2 s)
  function lookTick() {
    if (!S.me) return; const L = api.look(); if (!L) return; const k = JSON.stringify(L);
    if (k !== S.look) { S.look = k; send({ t: 'look', ...L }); }
  }
  function sendTick(now) {
    if (!S.me || !S.ws || S.ws.readyState !== 1 || now - S.lastSend < SEND_MS) return;
    const st = api.me(); if (!st) return;
    const L = S.last;
    if (st.h) { if (!L || !L.h) { send({ t: 'p', h: 1 }); S.last = { h: 1, t: now }; S.lastSend = now; } return; }
    const o = { t: 'p', x: Math.round(st.x * 100) / 100, y: Math.round(st.y * 100) / 100, z: Math.round(st.z * 100) / 100, r: Math.round(st.r * 1000) / 1000, a: st.a, s: Math.round(Math.abs(st.s) * 10) / 10 * Math.sign(st.s || 0), v: st.v || '', vc: st.vc || '', q: st.q | 0 };
    if (L && !L.h && now - L.t < 2000 && Math.abs(L.x - o.x) < .03 && Math.abs(L.z - o.z) < .03 && Math.abs(L.y - o.y) < .05 && Math.abs(L.r - o.r) < .03 && L.a === o.a && Math.abs(L.s - o.s) < .25 && L.v === o.v && L.q === o.q) return;
    send(o); o.t = now; S.last = o; S.lastSend = now;
  }

  // ---- the other players
  function world(m) {
    const now = performance.now() / 1000;
    if (m.j) for (const j of m.j) joined(j);
    if (m.p) for (const p of m.p) { const R = RS.get(p[0]); if (R) heardPos(R, p, now); }
    if (m.l) for (const id of m.l) gone(id);
  }
  function joined(j) {
    let R = RS.get(j.i);
    if (!R) { R = { id: j.i, n: j.n, c: j.c, f: j.f | 0, k: Number.isInteger(j.k) ? j.k : -1, g: j.g, b: j.b || '', w: j.w | 0, rk: j.rk | 0, buf: [], root: null, cast: null, mixer: null, acts: {}, cur: null, cn: '', q: -1, d: 1e9, oy: 0, acc: 0, car: null, ck: '', seat: false, tag: null, bub: null, bubT: 0, slot: RS.size }; RS.set(j.i, R); R.tag = tagSprite(j.n, R.w, R.b, R.rk); scene.add(R.tag); }
    else { const k = Number.isInteger(j.k) ? j.k : -1, changed = R.c !== j.c || R.f !== (j.f | 0) || R.k !== k, retag = R.w !== (j.w | 0) || R.b !== (j.b || '') || R.rk !== (j.rk | 0); R.rk = j.rk | 0; R.n = j.n; R.c = j.c; R.f = j.f | 0; R.k = k; R.g = j.g; R.b = j.b || ''; R.w = j.w | 0; if (changed) dropBody(R);
      if (retag && R.tag) { const vis = R.tag.visible, pos = R.tag.position.clone(); scene.remove(R.tag); R.tag.material.map.dispose(); R.tag.material.dispose(); R.tag = tagSprite(R.n, R.w, R.b, R.rk); R.tag.position.copy(pos); R.tag.visible = vis; scene.add(R.tag); } }
    if (!R.root) makeBody(R);
  }
  function heardPos(R, p, now) {
    const s = { t: now, x: p[1], y: p[2], z: p[3], r: p[4], a: p[5], s: p[6], v: p[7], vc: p[8], q: p[9] };
    const b = R.buf, L = b[b.length - 1];
    if (L && (Math.hypot(s.x - L.x, s.z - L.z) > 40 || L.v !== s.v)) b.length = 0;          // a jump across town, or in/out of a motor: no sliding
    else if (L && now - L.t > .35) b.push({ ...L, t: now - SEND_MS / 1000 });                // standing still a while, then off again
    b.push(s); if (b.length > 10) b.splice(0, b.length - 10);
  }
  function gone(id) { const R = RS.get(id); if (!R) return; RS.delete(id); dropBody(R); dropCar(R); for (const sp of [R.tag, R.bub, R.glow]) if (sp) { scene.remove(sp); sp.material.map.dispose(); sp.material.dispose(); } }
  function dropAll() { for (const id of [...RS.keys()]) gone(id); }

  async function makeBody(R) {
    if (R.loading) return; R.loading = true;
    const id = R.c || (R.g === 'f' ? 'p_amaka' : 'p_dayo');
    let C = null, X = null;
    try { C = await api.loadCast(id); if (C) X = await api.moves(C); } catch (e) { C = null; }
    R.loading = false;
    if (!C || !X || RS.get(R.id) !== R || R.root) return;
    const inner = api.clone(C.tpl); api.setOutfit(inner, R.f >= 0 ? R.f : 0); if (api.tone) api.tone(inner, id, R.k);   // their skin tone
    const root = new THREE.Group(); root.rotation.order = 'YXZ'; root.add(inner); root.visible = false; scene.add(root);
    let hips = null; inner.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } if (!hips && o.isBone && /Hips$/.test(o.name)) hips = o; });
    Object.assign(R, { cast: C, X, root, inner, hips, mixer: new THREE.AnimationMixer(inner), acts: {}, cur: null, cn: '', q: -1 });
  }
  function dropBody(R) {
    if (!R.root) return; if (R.root.parent) R.root.parent.remove(R.root);
    R.mixer.stopAllAction(); R.mixer.uncacheRoot(R.inner); R.inner.traverse(o => { if (o.isSkinnedMesh) o.skeleton.dispose(); });
    R.root = null; R.inner = null; R.mixer = null; R.cast = null; R.seat = false;
  }
  function play(R, name, ts, again) {
    const X = R.X; let n = name;
    for (let k = 0; k < 3 && !X.clips[n]; k++) n = FALLBACK[n] || 'idle';
    const k = X.clips[n]; if (!k) return;
    let a = R.acts[n]; if (!a) { a = R.acts[n] = R.mixer.clipAction(k); }
    if (R.cn === n && !again) { a.timeScale = ts; return; }
    const once = ONCE.has(R.code);
    a.reset(); a.setEffectiveWeight(1); a.timeScale = ts;
    if (once || n === 'lie' || n === 'car') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } else { a.setLoop(THREE.LoopRepeat, Infinity); if (!R.cur) a.time = Math.random() * k.duration; }
    if (n === 'lie') a.time = 0;
    a.play();
    if (R.cur && R.cur !== a) a.crossFadeFrom(R.cur, n === 'car' || R.cn === 'car' ? .05 : .2, false); else if (!R.cur) R.mixer.update(0);
    R.cur = a; R.cn = n;
  }
  function pose(R, s, dt) {
    const C = R.cast, a = s.a, sp = Math.abs(s.s);
    R.code = a;
    let name = CLIP[a] || 'idle', ts = 1;
    if (a === 'w') ts = clamp(Math.max(sp, .5) / (C.wv || 1.4), .6, 1.6);
    else if (a === 'w2') ts = clamp(Math.max(sp, .4) / (C.w2v || .9), .6, 1.3);
    else if (a === 'r') ts = clamp(Math.max(sp, 2.5) / (C.rv || 4.5), .7, 1.5);
    else if (a === 'cw') ts = clamp(sp / 1.64, .5, 1.6);
    else if (a === 'pc') ts = clamp(sp / .24, .6, 2);
    else if (a === 'sl') ts = 1.15;
    else if (a === 'pu' || a === 'ki') ts = 1.25;
    const again = ONCE.has(a) && s.q !== R.q; R.q = s.q;
    play(R, name, ts, again);
    const off = (R.X.off[R.cn] || 0); R.oy += (off - R.oy) * Math.min(1, dt * 6); R.inner.position.y = R.oy;
  }

  // motors and okadas: the same models as the street, with the player sitting on them
  function useCar(R, s) {
    const k = s.v + '|' + (s.vc || '');
    if (R.car && R.ck === k) return R.car;
    dropCar(R); const c = api.makeCar(s.v, s.vc || undefined); if (!c) return null;
    scene.add(c.g); R.car = c; R.ck = k; R.seat = false; return c;
  }
  function dropCar(R) {
    if (!R.car) return; if (R.root && R.root.parent === R.car.hi) { scene.add(R.root); R.root.position.set(0, 0, 0); R.root.rotation.set(0, 0, 0); R.mixer.stopAllAction(); R.cur = null; R.cn = ''; }
    scene.remove(R.car.g); R.car = null; R.ck = ''; R.seat = false;
  }
  function seat(R, type) {
    const c = R.car, st = (api.seats(type) || [])[0], k = R.X.clips.car;
    if (!st || !c.hi || !R.hips || !k) { R.root.visible = false; return; }
    R.mixer.stopAllAction(); const a = R.acts.car || (R.acts.car = R.mixer.clipAction(k));   // the end of getting in = sitting
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.setEffectiveWeight(1); a.play(); a.time = k.duration - .02; a.paused = true; R.mixer.update(0);
    R.cur = a; R.cn = 'car';
    c.hi.add(R.root); R.root.position.set(0, 0, 0); R.root.rotation.set(0, 0, 0); R.inner.position.y = 0; R.oy = 0;
    const RS_ = api.ride(type) || { x: 0, y: 0, z: 0, ry: 0 }; R.root.rotation.y = RS_.ry; R.root.updateMatrixWorld(true);
    const hp = R.hips.getWorldPosition(new THREE.Vector3()); c.hi.worldToLocal(hp);
    R.root.position.set(st.x + RS_.x - hp.x, st.y + RS_.y - hp.y, st.z + RS_.z - hp.z);
    R.seat = true; R.root.visible = true;
  }

  // name tags and chat bubbles: little pictures that always face you
  const FONT = '"Barlow Semi Condensed","Arial Narrow",Arial,sans-serif';
  function spriteOf(cv, h) {
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, fog: false, toneMapped: false }));
    sp.renderOrder = 999; sp.userData.w = cv.width / cv.height * h; sp.userData.h = h; sp.scale.set(sp.userData.w, h, 1); sp.visible = false; return sp;
  }
  // the name over a player: a dot (yellow; blue for the police on duty, green for a park chairman) and their stars when wanted
  // the rank medals (assets/ui/rank_N.png, made in Blender: tools of the 2go-style ranks), drawn after the name
  const MEDAL = [], MEDAL_GLOW = [null, null, ['#4fc3f7', .22, .1, 1.5], ['#26c6a0', .28, .12, 1.8], ['#c77dff', .34, .15, 2.0], ['#ff9f43', .42, .16, 2.2],
    ['#ff5d5d', .5, .2, 2.6], ['#ffd54a', .55, .2, 2.0, 1], ['#ffd54a', .65, .25, 2.4, 1], ['#7fe3ff', .78, .25, 3.0, 2]];
  for (let i = 0; i < 10; i++) { const im = new Image(); im.onload = () => { for (const R of RS.values()) if ((R.rk | 0) === i && R.tag && !R.tag.userData.medal) R.retagNow = true; }; im.src = `assets/ui/rank_${i}.png`; MEDAL.push(im); }
  function glowTex(rays) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    if (rays) { g.globalCompositeOperation = 'lighter'; g.translate(64, 64); for (let k = 0; k < (rays > 1 ? 12 : 8); k++) { g.rotate(Math.PI * 2 / (rays > 1 ? 12 : 8)); const lg = g.createLinearGradient(0, 0, 62, 0); lg.addColorStop(0, 'rgba(255,255,255,.8)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = lg; g.beginPath(); g.moveTo(0, -3); g.lineTo(62, 0); g.lineTo(0, 3); g.fill(); } }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const GLOWT = [glowTex(0), glowTex(1), glowTex(2)];
  function glowSprite(rk) {
    const P = MEDAL_GLOW[rk]; if (!P) return null;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOWT[P[4] || 0], color: new THREE.Color(P[0]), blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, fog: false, toneMapped: false }));
    sp.renderOrder = 998; sp.visible = false; sp.userData.P = P; sp.userData.ph = Math.random() * 6.3; return sp;
  }
  // the name over a player: a dot (yellow; blue for the police on duty, green for a park chairman), their stars when wanted, then their rank medal
  function tagSprite(name, stars = 0, badge = '', rk = 0) {
    const cv = document.createElement('canvas'), g = cv.getContext('2d'), fs = 40, st = stars > 0 ? ' ' + '★'.repeat(Math.min(5, stars)) : '', H = 92, MS = 92, med = MEDAL[rk | 0], hasM = !!(med && med.complete && med.naturalWidth);
    g.font = `700 ${fs}px ${FONT}`; const tw = Math.ceil(g.measureText(name).width), sw = st ? Math.ceil(g.measureText(st).width) : 0, pw = tw + sw + 36, w = pw + MS + 6; cv.width = w; cv.height = H;
    const y0 = (H - 60) / 2;
    g.font = `700 ${fs}px ${FONT}`; g.fillStyle = stars > 0 ? 'rgba(70,10,10,.8)' : 'rgba(12,14,18,.72)'; rr(g, 2, y0 + 4, pw - 4, 52, 16); g.fill();
    g.fillStyle = badge === 'p' ? '#4c7dff' : badge === 'c' ? '#1d9a56' : '#F2B705'; g.beginPath(); g.arc(17, y0 + 30, 6, 0, 6.3); g.fill();
    g.fillStyle = '#F7EFDF'; g.textBaseline = 'middle'; g.fillText(name, 29, y0 + 32);
    if (st) { g.fillStyle = '#ff4a3a'; g.fillText(st, 29 + tw, y0 + 32); }
    if (hasM) g.drawImage(med, pw + 6, 0, MS, MS);
    const sp = spriteOf(cv, .4 * TS * H / 60); sp.userData.medal = hasM; sp.userData.mx = (pw + 6 + MS / 2) / w; sp.userData.ms = MS / H; return sp;
  }
  function bubbleSprite(text) {
    const cv = document.createElement('canvas'), g = cv.getContext('2d'), fs = 36, pad = 18, maxW = 520;
    g.font = `600 ${fs}px ${FONT}`;
    const words = text.split(' '), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; if (lines.length === 3) break; }
    if (lines.length < 3 && cur) lines.push(cur); if (lines.length === 3 && words.join(' ').length > lines.join(' ').length) lines[2] = lines[2].replace(/.{0,3}$/, '…');
    const w = Math.min(maxW, Math.max(...lines.map(l => g.measureText(l).width))) + pad * 2, h = lines.length * 44 + pad * 2 - 4;
    cv.width = Math.ceil(w); cv.height = Math.ceil(h) + 16;
    g.font = `600 ${fs}px ${FONT}`; g.fillStyle = 'rgba(247,239,223,.95)'; rr(g, 2, 2, cv.width - 4, h - 4, 20); g.fill();
    g.beginPath(); g.moveTo(cv.width / 2 - 12, h - 3); g.lineTo(cv.width / 2, h + 13); g.lineTo(cv.width / 2 + 12, h - 3); g.fill();
    g.fillStyle = '#0E1014'; g.textBaseline = 'top'; lines.forEach((l, i) => g.fillText(l, pad, pad + i * 44 - 2));
    return spriteOf(cv, cv.height / 60 * .36 * TS);
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // ---- every frame
  const _v = new THREE.Vector3();
  let frameN = 0, lookT = 0;
  function at(R, now) {
    const b = R.buf; if (!b.length) return null; const t = now - DELAY;
    if (t <= b[0].t || b.length === 1) return b[0];
    for (let i = b.length - 1; i > 0; i--) {
      const A = b[i - 1], B = b[i];
      if (t >= A.t) {
        if (t >= B.t) { const k = Math.min(t - B.t, .25) / Math.max(.05, B.t - A.t); return { ...B, x: B.x + (B.x - A.x) * k, z: B.z + (B.z - A.z) * k, y: B.y + (B.y - A.y) * k }; }   // a little ahead while the next one is late
        const k = (t - A.t) / Math.max(1e-3, B.t - A.t); let dr = B.r - A.r; dr = ((dr + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        return { ...(k < .5 ? A : B), x: A.x + (B.x - A.x) * k, y: A.y + (B.y - A.y) * k, z: A.z + (B.z - A.z) * k, r: A.r + dr * k, s: A.s + (B.s - A.s) * k };
      }
    }
    return b[0];
  }
  function frame(dt) {
    const now = performance.now();
    if (S.me && api.started()) { sendTick(now); if ((lookT += dt) > 1) { lookT = 0; lookTick(); } }
    if (!RS.size) return;
    frameN++; const t = now / 1000, cam = camera.position, maxB = api.maxBodies(), inside = api.inside();
    const list = [...RS.values()]; for (const R of list) { const s = at(R, t); R.s = s; R.d = s ? Math.hypot(s.x - cam.x, s.z - cam.z) : 1e9; }
    list.sort((a, b) => a.d - b.d);
    list.forEach((R, i) => {
      const s = R.s, show = !!s && !inside && i < maxB && R.d < 170;
      if (!show) { if (R.root) R.root.visible = false; if (R.car) R.car.g.visible = false; R.tag.visible = false; if (R.glow) R.glow.visible = false; if (R.bub) R.bub.visible = false; return; }
      let topY = s.y + 2.05;
      if (s.v) {   // in a motor or on an okada
        const c = useCar(R, s);
        if (c) {
          c.g.visible = true; c.g.position.set(s.x, s.y, s.z); c.g.rotation.set(0, s.r, 0);
          const near = R.d < 60; if (c.hi && c.lo && c.lo.children.length) { c.hi.visible = near; c.lo.visible = !near; }
          if (near) for (const wh of c.wheels || []) { wh.spin.rotation.z -= s.s * dt / (wh.r || (c.def && c.def.r) || .35); }
          if (R.root && R.mixer) { if (!R.seat) seat(R, s.v); R.root.visible = R.seat && (!c.lo || !c.lo.children.length || near); }
          topY = s.y + Math.max(1.9, ((c.def && c.def.H) || 1.5) + .45);
        }
      } else {
        if (R.car) dropCar(R);
        if (R.root && R.mixer) {
          R.root.visible = true; R.root.position.set(s.x, s.y, s.z); R.root.rotation.set(0, s.r, 0);
          pose(R, s, dt);
          if (s.a === 'p' || s.a === 'pc' || s.a === 'k') topY = s.y + .8; else if (s.a === 'c' || s.a === 'cw' || s.a === 'sl') topY = s.y + 1.55;
        }
      }
      if (R.inner && api.wear && R.d < 80 && (R.wk !== R.b || R.wo !== R.inner || (R.wst && R.wst.hk === null))) { R.wk = R.b; R.wo = R.inner; api.wear(R); }   // the park union's vest and the chairman's cap
      if (R.mixer) { R.acc += dt; const k = R.d < 25 ? 1 : R.d < 60 ? 2 : 3; if ((frameN + R.slot) % k === 0) { R.mixer.update(R.acc); R.acc = 0; } }
      // the name, the same size on screen near or far
      const tagOn = R.d < TAG_FAR, sc = clamp(R.d / 11, 1, 5);
      if (R.retagNow && R.tag) { R.retagNow = false; const vis = R.tag.visible; scene.remove(R.tag); R.tag.material.map.dispose(); R.tag.material.dispose(); R.tag = tagSprite(R.n, R.w, R.b, R.rk); R.tag.visible = vis; scene.add(R.tag); }
      R.tag.visible = tagOn; if (tagOn) { R.tag.position.set(s.x, topY, s.z); R.tag.scale.set(R.tag.userData.w * sc, R.tag.userData.h * sc, 1); }
      // the medal glows: each rank its own colour and beat; the top three send out turning rays
      if (R.glowRk !== R.rk) { if (R.glow) { scene.remove(R.glow); R.glow.material.dispose(); } R.glow = glowSprite(R.rk | 0); R.glowRk = R.rk; if (R.glow) scene.add(R.glow); }
      if (R.glow) { const on = tagOn && R.tag.userData.medal; R.glow.visible = on;
        if (on) { const P = R.glow.userData.P, u = R.tag.userData, mh = u.h * sc * u.ms, gs = mh * (P[4] ? 2.1 : 1.6), tw2 = u.w * sc;
          R.glow.position.copy(R.tag.position); R.glow.scale.set(gs, gs, 1); R.glow.center.set(.5 - (u.mx - .5) * tw2 / gs, .5);
          R.glow.material.opacity = Math.max(0, P[1] + P[2] * Math.sin(t * P[3] + R.glow.userData.ph)); if (P[4]) R.glow.material.rotation = t * (P[4] > 1 ? .9 : .5); } }
      if (R.bub) {
        R.bubT -= dt; if (R.bubT <= 0 || R.d > 60) { R.bub.visible = false; if (R.bubT <= 0) { scene.remove(R.bub); R.bub.material.map.dispose(); R.bub.material.dispose(); R.bub = null; } }
        else { R.bub.visible = true; const bs = clamp(R.d / 11, 1, 3); R.bub.position.set(s.x, topY + (R.tag.userData.h * sc) * .5 + R.bub.userData.h * bs * .55, s.z); R.bub.scale.set(R.bub.userData.w * bs, R.bub.userData.h * bs, 1); R.bub.material.opacity = Math.min(1, R.bubT); }
      }
    });
  }

  // ---- chat
  const CH = { open: false, ch: 'n', lines: [], mute: new Set() };
  try { for (const n of JSON.parse(localStorage.getItem('naija-mute') || '[]')) CH.mute.add(n); } catch (e) { /* ignore */ }
  function heard(m) {
    if (CH.mute.has(m.n.toLowerCase())) return;
    const mine = S.me && m.i === S.me.id;
    CH.lines.push({ n: m.n, m: m.m, ch: m.ch, mine, t: performance.now() }); if (CH.lines.length > CHAT_MAX) CH.lines.shift();
    drawChat();
    const R = RS.get(m.i);
    if (R && m.ch === 'n') { if (R.bub) { scene.remove(R.bub); R.bub.material.map.dispose(); R.bub.material.dispose(); } R.bub = bubbleSprite(m.m); scene.add(R.bub); R.bubT = 7; }
  }
  const nameCol = n => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${h % 360},75%,68%)`; };
  function drawChat() {
    const box = $('#chatLog'); if (!box) return; const now = performance.now();
    const show = CH.open ? CH.lines.slice(-12) : CH.lines.filter(l => now - l.t < 20000).slice(-5);
    box.textContent = '';
    for (const l of show) {
      const d = document.createElement('div'); d.className = 'cl' + (l.ch === 'a' ? ' all' : '') + (l.mine ? ' mine' : '');
      const b = document.createElement('b'); b.textContent = l.n; b.style.color = nameCol(l.n);
      if (CH.open && !l.mine) { b.className = 'mutable'; b.title = 'Tap to mute'; b.addEventListener('click', () => muteAsk(l.n)); }
      const sp = document.createElement('span'); sp.textContent = l.m;
      if (l.ch === 'a') { const k = document.createElement('i'); k.textContent = 'ALL'; d.appendChild(k); }
      d.append(b, sp); box.appendChild(d);
    }
    box.hidden = !show.length;
  }
  function muteAsk(n) {
    const k = n.toLowerCase();
    if (CH.mute.has(k)) CH.mute.delete(k); else CH.mute.add(k);
    try { localStorage.setItem('naija-mute', JSON.stringify([...CH.mute])); } catch (e) { /* ignore */ }
    api.toast(CH.mute.has(k) ? `${n} is muted. You will not see what they say.` : `${n} is not muted any more.`, 2.5);
    if (CH.mute.has(k)) { CH.lines = CH.lines.filter(l => l.n.toLowerCase() !== k); drawChat(); }
  }
  function openChat() {
    if (!S.me) { openPanel(); return; }
    CH.open = true; $('#chatBar').hidden = false; drawChat(); api.typing(true);
    const inp = $('#chatIn'); setTimeout(() => inp.focus(), 30); chatSeg();
  }
  function closeChat() { CH.open = false; const b = $('#chatBar'); if (b) b.hidden = true; const inp = $('#chatIn'); if (inp) inp.blur(); drawChat(); api.typing(false); }
  function chatSeg() { for (const b of document.querySelectorAll('#chatSeg button')) b.setAttribute('aria-pressed', String(b.dataset.ch === CH.ch)); $('#chatIn').placeholder = CH.ch === 'a' ? 'Talk to all Lagos…' : 'Talk to people near you…'; }
  function sendChat() {
    const inp = $('#chatIn'), m = inp.value.trim(); if (!m) { closeChat(); return; }
    if (send({ t: 'say', m: m.slice(0, 120), ch: CH.ch })) inp.value = '';
    else api.toast('Not connected right now.', 2);
  }
  setInterval(() => { if (!CH.open && CH.lines.length) drawChat(); }, 2000);

  // ---- the sign-in panel
  function openPanel() { S.panel = true; $('#onlinePanel').hidden = false; if (!S.ws && !S.old) { S.tries = 0; S.kicked = false; connect(); } ui(); const u = $('#olUser'); if (!S.me && u && !u.value) setTimeout(() => u.focus(), 50); api.typing(true); }
  function closePanel() { S.panel = false; const p = $('#onlinePanel'); if (p) p.hidden = true; hideMsg(); api.typing(false); if (!S.me && !(saved && saved.tok) && S.ws) { try { S.ws.close(); } catch (e) { /* ignore */ } } }
  function hideMsg() { for (const id of ['#olErr', '#olMsg']) { const e = $(id); if (e) e.hidden = true; } }
  function showErr(w, m) { const e = $(w === 'email' || w === 'pw' ? '#olMsg' : '#olErr'); if (!e) { api.toast(m, 3); return; } e.textContent = m; e.className = 'oerr'; e.hidden = false; if (w === 'say') api.toast(m, 2); buttons(); }
  function showOk(w, m) {
    const e = $(w === 'email' || w === 'pw' ? '#olMsg' : '#olErr'); if (e) { e.textContent = m; e.className = 'ook'; e.hidden = false; }
    if (w === 'forgot') { $('#olResetF').hidden = false; $('#olCode').focus(); }
    if (w === 'pw') { $('#olOld').value = ''; $('#olNew').value = ''; }
    buttons();
  }
  function buttons() { for (const b of document.querySelectorAll('#onlinePanel button[type=submit]')) b.disabled = S.busy; }
  function setTab(k) {
    S.tab = k; for (const b of document.querySelectorAll('#olTabs button')) b.setAttribute('aria-pressed', String(b.dataset.k === k));
    $('#olMailF').hidden = k !== 'new'; $('#olGo').textContent = k === 'new' ? 'CREATE ACCOUNT' : 'SIGN IN';
    $('#olPass').autocomplete = k === 'new' ? 'new-password' : 'current-password'; $('#olForgotF').hidden = true; $('#olForgot').hidden = k === 'new';
    if (k === 'new') { const u = $('#olUser'); if (!u.value) { const p = api.profile(); if (p && p.name) u.value = p.name.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '').slice(0, 16); } }
    hideMsg();
  }
  function ui() {
    const st = S.me ? 'in' : S.st;
    // the title screen and the settings
    const sub = $('#onlSub'), set = $('#olSetSub');
    const line = S.old ? 'New version out: reload the page' : S.kicked ? 'Signed in on another phone · tap to play here' : S.me ? `Online as ${S.me.name} · ${S.n} in Lagos` : saved && saved.tok ? (st === 'connecting' ? 'Connecting…' : 'Can’t reach the server · trying again') : 'Sign in to see other players';
    if (sub) sub.textContent = line; if (set) set.textContent = line;
    const btn = $('#onlBtn'); if (btn) btn.classList.toggle('on', !!S.me);
    // the HUD
    const chip = $('#onlN'); if (chip) { chip.hidden = !S.me; chip.textContent = `${S.n} online`; }
    const cb = $('#chatBtn'); if (cb) cb.hidden = !S.me;
    if (!S.me && CH.open) closeChat();
    // the panel
    if (!$('#onlinePanel') || $('#onlinePanel').hidden) return;
    const stat = $('#olStat');
    stat.textContent = S.old ? 'A new version of the game is out. Reload the page.' : S.me ? `${S.n} player${S.n === 1 ? '' : 's'} in Lagos now` : st === 'connecting' ? 'Connecting to Lagos…' : st === 'guest' ? `${S.n} player${S.n === 1 ? '' : 's'} in Lagos now` : 'Can’t reach the game server right now. Check your data; it keeps trying.';
    $('#olGuest').hidden = !!S.me; $('#olIn').hidden = !S.me;
    if (S.me) { $('#olName').textContent = S.me.name; $('#olMailNow').textContent = S.me.email ? `Now: ${S.me.email}` : 'No email yet. Add one so you can get back in if you forget your password.'; }
    $('#olKick').hidden = !S.kicked;
    buttons();
  }
  function bind() {
    const P = $('#onlinePanel'); if (!P) return;
    $('#onlBtn') && $('#onlBtn').addEventListener('click', () => { if (S.kicked) { S.kicked = false; S.tries = 0; connect(); } openPanel(); });
    $('#olSetBtn') && $('#olSetBtn').addEventListener('click', openPanel);
    $('#olClose').addEventListener('click', closePanel);
    P.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closePanel(); });
    for (const b of document.querySelectorAll('#olTabs button')) b.addEventListener('click', () => setTab(b.dataset.k));
    $('#olForm').addEventListener('submit', e => {
      e.preventDefault(); if (S.busy) return; hideMsg();
      const u = $('#olUser').value.trim(), p = $('#olPass').value, em = $('#olMail').value.trim();
      if (u.length < 3) return showErr('login', 'Type your username (at least 3 letters).');
      if (p.length < 6) return showErr('login', 'Password: at least 6 characters.');
      if (S.st !== 'guest' || !S.ws) { connect(); return showErr('login', 'Not connected yet. Try again in a moment.'); }
      S.busy = true; buttons();
      if (S.tab === 'new') { const L = api.look(); send({ t: 'reg', u, p, e: em || undefined, cash: api.getCash(), look: L || undefined, life: api.getLife ? api.getLife() : undefined }); }
      else send({ t: 'login', u, p });
    });
    $('#olForgot').addEventListener('click', () => { const f = $('#olForgotF'); f.hidden = !f.hidden; $('#olResetF').hidden = true; if (!f.hidden) $('#olFUser').value = $('#olUser').value; hideMsg(); });
    $('#olForgotF').addEventListener('submit', e => { e.preventDefault(); if (S.busy) return; const u = $('#olFUser').value.trim(); if (u.length < 3) return showErr('forgot', 'Type your username.'); S.busy = true; buttons(); send({ t: 'forgot', u }); });
    $('#olResetF').addEventListener('submit', e => { e.preventDefault(); if (S.busy) return; S.busy = true; buttons(); send({ t: 'reset', u: $('#olFUser').value.trim(), code: $('#olCode').value.trim(), p: $('#olRPass').value }); });
    $('#olMailForm').addEventListener('submit', e => { e.preventDefault(); send({ t: 'email', e: $('#olMail2').value.trim() }); });
    $('#olPwForm').addEventListener('submit', e => { e.preventDefault(); if (S.busy) return; const p = $('#olNew').value; if (p.length < 6) return showErr('pw', 'New password: at least 6 characters.'); S.busy = true; buttons(); send({ t: 'pw', old: $('#olOld').value, p }); });
    $('#olDelForm').addEventListener('submit', e => { e.preventDefault(); if (S.busy) return; const p = $('#olDelPw').value; if (!p) return showErr('del', 'Type your password to delete the account.'); if (!confirm('Delete your Naija Streets account for good? There is no way back.')) return; S.busy = true; buttons(); send({ t: 'del', p }); $('#olDelPw').value = ''; });
    $('#olOut').addEventListener('click', () => { if (!send({ t: 'out' })) { save(null); S.me = null; dropAll(); restoreGuest(); ui(); } });
    $('#olKickGo').addEventListener('click', () => { S.kicked = false; S.tries = 0; if (S.ws) send({ t: 'hi', v: PROTO, tok: saved && saved.tok }); else connect(); });
    // chat
    $('#chatBtn').addEventListener('click', () => { if (CH.open) closeChat(); else openChat(); });
    $('#chatBar').addEventListener('submit', e => { e.preventDefault(); sendChat(); });
    $('#chatBar').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closeChat(); });
    $('#chatX').addEventListener('click', closeChat);
    for (const b of document.querySelectorAll('#chatSeg button')) b.addEventListener('click', () => { CH.ch = b.dataset.ch; chatSeg(); $('#chatIn').focus(); });
    addEventListener('keydown', e => { if (e.key === 'Enter' && S.me && api.started() && !CH.open && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) && $('#onlinePanel').hidden) { e.preventDefault(); openChat(); } });
    setTab('in');
  }

  bind();
  $('#onlRow') && ($('#onlRow').hidden = false);
  if (saved && saved.tok) connect();   // signed in last time: straight back online
  ui();

  return {
    frame, cash, openPanel, openChat, send,
    // the other players you could hit: on foot, in sight, not lying down (where they are drawn now)
    targets: () => { const out = []; if (!S.me) return out; for (const R of RS.values()) { const s = R.s; if (!s || s.v || s.a === 'k' || !R.root || !R.root.visible) continue; out.push({ id: R.id, n: R.n, x: s.x, y: s.y, z: s.z }); } return out; },
    hit: (id, k) => send({ t: 'hit', i: id, k }),
    // everybody near you: where they are, what they are doing ('k': lying down), their stars and badge
    nearby: () => { const out = []; for (const R of RS.values()) { const s = R.s; if (!s || !R.root || !R.root.visible) continue; out.push({ id: R.id, n: R.n, x: s.x, y: s.y, z: s.z, a: s.a, v: s.v, w: R.w | 0, b: R.b || '' }); } return out; },
    get signedIn() { return !!S.me; },
    get myName() { return S.me ? S.me.name : ''; },
    get count() { return RS.size; },
    debug: () => ({ st: S.st, me: S.me, n: S.n, last: S.last, ws: S.ws ? S.ws.readyState : -1, others: [...RS.values()].map(R => ({ id: R.id, n: R.n, c: R.c, body: !!R.root, vis: !!(R.root && R.root.visible), car: R.ck, clip: R.cn, d: Math.round(R.d), s: R.s && { x: R.s.x, z: R.s.z, a: R.s.a } })), cash: { srv: S.srv, pend: S.cpend.length }, chat: CH.lines.length }),
  };
}
