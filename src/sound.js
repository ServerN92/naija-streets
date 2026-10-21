// Naija Streets: real sounds. Field recordings of Lagos and West Africa (bus stops with conductors, markets with
// hawkers, traffic, night crickets, church, call to prayer, generators) and real engines and horns for every kind of
// vehicle, all from free libraries with licences that allow a commercial game (assets/sounds/CREDITS.md).
//
// Four mixer buses under the master (each with its own volume in Settings): the city (ambience beds and places),
// vehicles (engines, horns, skids, crashes, sirens), voices (conductors, hawkers, people) and effects.
// Beds are stereo loops that cross-fade with where you are and the time of day; places, vehicles and voices are
// positioned in 3-D around the camera. Files load only when first needed, so the game starts as fast as before.
export const VOL_KEYS = ['amb', 'veh', 'voice', 'sfx', 'music'];

export function createSound({ AC, out, url, files, els = [] }) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const R = Math.random, pick = a => a[(R() * a.length) | 0];
  const t = () => AC.currentTime;
  // ---------------------------------------------------------------- buses and volumes
  const vol = (() => { const d = { amb: 1, veh: 1, voice: 1, sfx: 1, music: .8 }; try { return { ...d, ...JSON.parse(localStorage.getItem('naija-vol') || '{}') }; } catch (e) { return d; } })();
  const bus = {};
  const muffle = AC.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.connect(out);   // indoors: the street is behind walls
  for (const k of VOL_KEYS) { bus[k] = AC.createGain(); bus[k].gain.value = vol[k]; bus[k].connect(k === 'sfx' || k === 'music' ? out : muffle); }
  // your own vehicle (engine, tyres, horn): never behind the walls or the windows
  bus.own = AC.createGain(); bus.own.gain.value = vol.veh; bus.own.connect(out);
  // music from out there (a street speaker, the club through its walls): heard less from inside a car
  const musOutF = AC.createBiquadFilter(); musOutF.type = 'lowpass'; musOutF.frequency.value = 20000; musOutF.connect(bus.music);
  const musOut = AC.createGain(); musOut.connect(musOutF);
  // in a closed car, windows up: the street goes quiet and dull, no honking; your engine and the radio stay
  const CAB = { amb: .07, voice: .06, veh: .22 };   // what is left of each, windows up
  let cab = 0, mufOn = false;
  const level = k => vol[k] * (CAB[k] !== undefined ? 1 - (1 - CAB[k]) * cab : 1);
  function mix(tc = .05) {
    for (const k of VOL_KEYS) bus[k].gain.setTargetAtTime(level(k), t(), tc);
    bus.own.gain.setTargetAtTime(vol.veh * (1 - .3 * cab), t(), tc);
    musOut.gain.setTargetAtTime(1 - .85 * cab, t(), tc); musOutF.frequency.setTargetAtTime(cab > .01 ? 20000 * Math.pow(500 / 20000, cab) : 20000, t(), tc);
    const f = Math.min(mufOn ? 700 : 20000, cab > .01 ? 20000 * Math.pow(380 / 20000, cab) : 20000); muffle.frequency.setTargetAtTime(f, t(), .3);
  }
  function cabin(k) { k = clamp(+k || 0, 0, 1); if (Math.abs(k - cab) < .01) return; cab = k; mix(.35); }
  function setVol(k, v) { vol[k] = clamp(+v || 0, 0, 1.5); mix(); try { localStorage.setItem('naija-vol', JSON.stringify(vol)); } catch (e) { } }
  // ---------------------------------------------------------------- loading (each file once, when first asked for)
  const BUF = new Map(), LOADING = new Map();
  function need(name) {
    if (!name || !files[name]) return null;
    const b = BUF.get(name); if (b) return b;
    if (!LOADING.has(name)) LOADING.set(name, fetch(url(name)).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(a => new Promise((res, rej) => AC.decodeAudioData(a, res, rej))).then(b => { BUF.set(name, b); return b; })
      .catch(e => { console.warn('sound', name, e); setTimeout(() => LOADING.delete(name), 30000); return null; }));
    return null;
  }
  const preload = names => names.forEach(need);
  // a variant of a family: 'bark_cond' -> bark_cond_1 .. bark_cond_n
  const fam = {}; for (const n of Object.keys(files)) { const m = /^(.*)_\d+$/.exec(n); if (m) (fam[m[1]] = fam[m[1]] || []).push(n); }
  const variant = n => fam[n] ? pick(fam[n]) : n;
  // ---------------------------------------------------------------- 3-D
  function panner(x, z, y = 1.2, ref = 6, max = 400, roll = 1) {
    const p = AC.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.maxDistance = max; p.rolloffFactor = roll;
    place(p, x, z, y); return p;
  }
  function place(p, x, z, y = 1.2) { if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z); }
  function listen(x, y, z, fx, fz) {
    const L = AC.listener;
    if (L.positionX) { L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z; L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else { L.setPosition(x, y, z); L.setOrientation(fx, 0, fz, 0, 1, 0); }
  }
  // ---------------------------------------------------------------- one-shots
  let shots = 0;
  function play(name, { x, z, y, b = 'sfx', gain = 1, rate = 1, ref = 6, max = 400, delay = 0, roll = 1 } = {}) {
    name = variant(name); const buf = need(name); if (!buf || shots > 24) return null;
    const s = AC.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = AC.createGain(); g.gain.value = gain * (files[name].gain || 1);
    let last = g; if (x !== undefined) { const p = panner(x, z, y, ref, max, roll); g.connect(p); last = p; }
    s.connect(g); last.connect(bus[b]); shots++; s.onended = () => { shots--; try { last.disconnect(); } catch (e) { } };
    s.start(t() + delay); return s;
  }
  // ---------------------------------------------------------------- loops (beds, places, engines)
  // an MP3 starts and ends with a little silence (the encoder's padding): loop only the sound between, so it never gaps
  const REG = new Map();
  function region(buf) {
    let r = REG.get(buf); if (r) return r;
    const d = buf.getChannelData(0), n = d.length, lim = Math.min(n >> 2, 8192), thr = 2e-4;
    let a = 0; while (a < lim && Math.abs(d[a]) < thr) a++;
    let e = 0; while (e < lim && Math.abs(d[n - 1 - e]) < thr) e++;
    r = { s: a / buf.sampleRate, e: (n - e) / buf.sampleRate }; REG.set(buf, r); return r;
  }
  function loop(name, { x, z, y, b = 'amb', ref = 8, max = 500, roll = 1, rate = 1, offset } = {}) {
    const buf = need(name); if (!buf) return null;
    const s = AC.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    const rg = region(buf); s.loopStart = rg.s; s.loopEnd = rg.e;
    const g = AC.createGain(); g.gain.value = 0; s.connect(g);
    let p = null; if (x !== undefined) { p = panner(x, z, y, ref, max, roll); g.connect(p); p.connect(bus[b]); } else g.connect(bus[b]);
    s.start(t(), rg.s + (offset ?? R() * (rg.e - rg.s)));
    return { name, s, g, p, k: files[name].gain || 1, idle: 0, stop() { try { this.g.gain.setTargetAtTime(0, t(), .3); const s = this.s, g = this.g, pp = this.p; setTimeout(() => { try { s.stop(); g.disconnect(); if (pp) pp.disconnect(); } catch (e) { } }, 1500); } catch (e) { } } };
  }
  // ---------------------------------------------------------------- the beds: where you are and the time of day
  const BEDS = {};   // key -> loop
  function beds(want, dt) {   // want: { file: level 0..1 }
    for (const n of Object.keys(want)) if (want[n] > .01 && !BEDS[n] && files[n]) { const L = loop(n); if (L) BEDS[n] = L; }
    for (const n of Object.keys(BEDS)) {
      const L = BEDS[n], w = want[n] || 0;
      L.g.gain.setTargetAtTime(w * L.k, t(), 1.4);
      L.idle = w > .01 ? 0 : L.idle + dt; if (L.idle > 20) { L.stop(); delete BEDS[n]; }
    }
  }
  // ---------------------------------------------------------------- places that make their own sound (a mosque, a church, generators)
  const SPOTS = new Map();   // id -> { L, x, z }
  function spots(list, dt) {   // list: [{ id, file, x, z, level, ref, b }]
    const seen = new Set();
    for (const s of list) {
      seen.add(s.id); let S = SPOTS.get(s.id);
      if (!S) { const L = loop(s.file, { x: s.x, z: s.z, y: s.y ?? 2, b: s.b || 'amb', ref: s.ref || 8, max: s.max || 500, roll: s.roll ?? 1, offset: s.offset }); if (!L) continue; S = { L, idle: 0 }; SPOTS.set(s.id, S); }
      S.idle = 0; S.L.g.gain.setTargetAtTime(s.level * S.L.k, t(), s.fade || .8); if (S.L.p) place(S.L.p, s.x, s.z, s.y ?? 2);
    }
    for (const [id, S] of SPOTS) if (!seen.has(id)) { S.L.g.gain.setTargetAtTime(0, t(), .8); if ((S.idle += dt) > 4) { S.L.stop(); SPOTS.delete(id); } }
  }
  // ---------------------------------------------------------------- vehicles: the nearest few have their engines running in 3-D
  const ENG = { okada: 'eng_okada', bike2: 'eng_okada', sbike: 'eng_okada', keke: 'eng_keke', danfo: 'eng_danfo', bus: 'eng_danfo', tanker: 'eng_truck', tipper: 'eng_truck',
    police: 'eng_car', sedan: 'eng_car', suv: 'eng_car', car2: 'eng_car', benz: 'eng_car', amb: 'eng_car' };
  const HORN = { okada: 'horn_okada', bike2: 'horn_okada', sbike: 'horn_okada', keke: 'horn_okada', danfo: 'horn_bus', bus: 'horn_bus', tanker: 'horn_truck', tipper: 'horn_truck' };
  const engOf = ty => { const n = ENG[ty] || 'eng_car'; return files[n] ? n : files.eng_car ? 'eng_car' : null; };
  const VOICES = new Map();   // vehicle -> loop
  function engines(list, dt, max = 5) {   // list: [{ v, x, z, type, speed, maxV, d }] sorted near first
    const keep = new Set();
    for (const e of list) {
      if (keep.size >= max) break; const n = engOf(e.type); if (!n) continue;
      let L = VOICES.get(e.v); if (L && L.name !== n) { L.stop(); VOICES.delete(e.v); L = null; }
      if (!L) { L = loop(n, { x: e.x, z: e.z, y: .8, b: 'veh', ref: 5, max: 200, roll: 1.4 }); if (!L) continue; VOICES.set(e.v, L); }
      keep.add(e.v); const k = clamp(e.speed / (e.maxV || 12), 0, 1.2), f = files[n];
      L.s.playbackRate.setTargetAtTime((f.r0 || .85) + k * (f.r1 || .6), t(), .2); L.g.gain.setTargetAtTime(L.k * (.35 + .65 * k), t(), .2); place(L.p, e.x, e.z, .8);
    }
    for (const [v, L] of VOICES) if (!keep.has(v)) { L.stop(); VOICES.delete(v); }
  }
  // your own vehicle: in front of you, not in 3-D; it revs with the speed, louder on the gas
  let MINE = null;
  function myEngine(type, speed, maxV, gas, on) {
    const n = on ? engOf(type) : null;
    if (MINE && MINE.name !== n) { MINE.stop(); MINE = null; }
    if (!n) return;
    if (!MINE) { MINE = loop(n, { b: 'own' }); if (!MINE) return; }
    const f = files[n], k = clamp(Math.abs(speed) / (maxV || 14), 0, 1.25);
    MINE.s.playbackRate.setTargetAtTime((f.r0 || .85) + k * (f.r1 || .6) + (gas ? .05 : 0), t(), .12);
    MINE.g.gain.setTargetAtTime(MINE.k * (.55 + .35 * k + (gas ? .15 : 0)) * .8, t(), .12);
  }
  // tyres screeching while you brake hard or slide
  let SKID = null;
  function skid(k) {
    if (k > .05 && !SKID && files.skid) SKID = loop('skid', { b: 'own', offset: 0 });
    if (SKID) { SKID.g.gain.setTargetAtTime(SKID.k * clamp(k, 0, 1) * .8, t(), .05); if (k <= .05) { SKID.idle += 1; if (SKID.idle > 40) { SKID.stop(); SKID = null; } } else SKID.idle = 0; }
  }
  // the police siren, where the police are
  let SIREN = null;
  function siren(on, x, z) {
    if (on && !SIREN && files.siren) SIREN = loop('siren', { x, z, y: 1.6, b: 'veh', ref: 12, max: 600 });
    if (!SIREN) return;
    SIREN.g.gain.setTargetAtTime(on ? SIREN.k : 0, t(), .25); if (on) place(SIREN.p, x, z, 1.6);
    if (!on) { SIREN.idle += 1; if (SIREN.idle > 120) { SIREN.stop(); SIREN = null; } } else SIREN.idle = 0;
  }
  let hornT = 0;
  function horn(type, x, z, gain = 1) { if (t() - hornT < .25 && x !== undefined) return; hornT = t(); const n = HORN[type] && files[HORN[type]] ? HORN[type] : 'horn_car';
    if (x === undefined) return play(n, { b: 'own', gain: gain * (1 - .45 * cab), rate: .98 });   // yours: in front of you, softer from inside
    return play(n, { x, z, y: 1, b: 'veh', gain, ref: 10, max: 400, rate: .96 + R() * .08 }); }
  function stopAll() { for (const n of Object.keys(BEDS)) { BEDS[n].stop(); delete BEDS[n]; } for (const [id, S] of SPOTS) { S.L.stop(); SPOTS.delete(id); } for (const [v, L] of VOICES) { L.stop(); VOICES.delete(v); } if (MINE) { MINE.stop(); MINE = null; } }
  // ---------------------------------------------------------------- music: songs stream from <audio> elements (a song is too long to
  // hold decoded), each on its own channel: 0 the radio (your car, the danfo you ride, your room), 1 the club, 2-3 street speakers.
  // The elements are unlocked on the first tap (phones only let a page play sound a tap started), then reused.
  const SONGS = Object.keys(files).filter(n => files[n].m);
  const CH = [];
  function channel(i) {
    if (CH[i]) return CH[i];
    const el = els[i] || new Audio(); el.preload = 'none';
    const src = AC.createMediaElementSource(el), f = AC.createBiquadFilter(), g = AC.createGain(), p = AC.createPanner();
    f.type = 'lowpass'; f.frequency.value = 20000; g.gain.value = 0;
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 6; p.maxDistance = 400; p.rolloffFactor = 1.3;
    src.connect(f); f.connect(g);
    const C = { i, el, f, g, p, song: null, pos: false, want: 0, onEnd: null };
    const route = pos => { if (C.pos === pos && C.routed) return; try { g.disconnect(); } catch (e) { } try { p.disconnect(); } catch (e) { } if (pos) { g.connect(p); p.connect(musOut); } else g.connect(bus.music); C.pos = pos; C.routed = true; };
    C.route = route; route(false);
    el.addEventListener('ended', () => { C.song = null; if (C.onEnd) C.onEnd(C); });
    el.addEventListener('error', () => { const s = C.song; C.song = null; if (C.onEnd && s) setTimeout(() => C.onEnd && C.onEnd(C), 3000); });
    return CH[i] = C;
  }
  function unlock(n = 4) { for (let i = 0; i < n; i++) { const C = channel(i); try { C.el.muted = true; const pr = C.el.play(); if (pr) pr.catch(() => { }).then(() => { C.el.pause(); C.el.muted = false; }); else { C.el.pause(); C.el.muted = false; } } catch (e) { C.el.muted = false; } } }
  // play a song on a channel (from a point: x, z; through walls or a cheap speaker: lp), from `at` seconds
  function song(i, name, { x, z, y = 1.2, lp = 20000, gain = 1, at = 0, ref = 6, onEnd } = {}) {
    const C = channel(i); if (!files[name]) return C;
    C.onEnd = onEnd || null;
    if (C.song !== name) { C.song = name; C.el.src = url(name); C.el.currentTime = 0; try { C.el.load(); } catch (e) { }
      const go = () => { try { if (at) C.el.currentTime = at; } catch (e) { } const pr = C.el.play(); if (pr) pr.catch(e => console.warn('song', name, e && e.name)); };
      if (C.el.readyState >= 1) go(); else C.el.addEventListener('loadedmetadata', go, { once: true }); }
    else if (C.el.paused) { const pr = C.el.play(); if (pr) pr.catch(() => { }); }
    C.route(x !== undefined); if (x !== undefined) { place(C.p, x, z, y); C.p.refDistance = ref; }
    C.f.frequency.setTargetAtTime(lp, t(), .2); C.g.gain.setTargetAtTime(gain * (files[name].gain || 1), t(), .4); C.want = gain;
    return C;
  }
  function songSet(i, { x, z, y = 1.2, lp, gain } = {}) { const C = CH[i]; if (!C || !C.song) return; if (x !== undefined && C.pos) place(C.p, x, z, y); if (lp) C.f.frequency.setTargetAtTime(lp, t(), .2); if (gain !== undefined) C.g.gain.setTargetAtTime(gain * (files[C.song].gain || 1), t(), .3); }
  function songStop(i, fade = .5) { const C = CH[i]; if (!C || !C.song) return; C.g.gain.setTargetAtTime(0, t(), fade / 3); const el = C.el, me = C.song; C.song = null; C.onEnd = null; setTimeout(() => { if (!C.song || C.song === me) { try { el.pause(); } catch (e) { } } }, fade * 1000 + 200); }
  const songsOf = genres => SONGS.filter(n => !genres || genres.includes(files[n].m.genre));
  const songInfo = n => files[n] && files[n].m;
  return { AC, bus, vol, setVol, need, preload, play, loop, beds, spots, engines, myEngine, skid, siren, horn, listen, place, stopAll, has: n => !!files[n] || !!fam[n],
    unlock, song, songSet, songStop, songsOf, songInfo, SONGS, channelOf: i => CH[i],
    muffle(on) { on = !!on; if (on !== mufOn) { mufOn = on; mix(.3); } }, cabin, get cab() { return cab; }, files,
    debug() { return { beds: Object.keys(BEDS).map(n => [n, +BEDS[n].g.gain.value.toFixed(3)]), spots: [...SPOTS.keys()], engines: [...VOICES.values()].map(L => L.name), mine: MINE && MINE.name, cab, buses: Object.fromEntries(Object.keys(bus).map(k => [k, +bus[k].gain.value.toFixed(3)])), muffle: Math.round(muffle.frequency.value), loaded: [...BUF.keys()], state: AC.state }; } };
}
