// Naija Streets: real sounds. Field recordings of Lagos and West Africa (bus stops with conductors, markets with
// hawkers, traffic, night crickets, church, call to prayer, generators) and real engines and horns for every kind of
// vehicle, all from free libraries with licences that allow a commercial game (assets/sounds/CREDITS.md).
//
// Four mixer buses under the master (each with its own volume in Settings): the city (ambience beds and places),
// vehicles (engines, horns, skids, crashes, sirens), voices (conductors, hawkers, people) and effects.
// Beds are stereo loops that cross-fade with where you are and the time of day; places, vehicles and voices are
// positioned in 3-D around the camera. Files load only when first needed, so the game starts as fast as before.
export const VOL_KEYS = ['amb', 'veh', 'voice', 'sfx'];

export function createSound({ AC, out, url, files }) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const R = Math.random, pick = a => a[(R() * a.length) | 0];
  const t = () => AC.currentTime;
  // ---------------------------------------------------------------- buses and volumes
  const vol = (() => { try { return { amb: 1, veh: 1, voice: 1, sfx: 1, ...JSON.parse(localStorage.getItem('naija-vol') || '{}') }; } catch (e) { return { amb: 1, veh: 1, voice: 1, sfx: 1 }; } })();
  const bus = {};
  const muffle = AC.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.connect(out);   // indoors: the street is behind walls
  for (const k of VOL_KEYS) { bus[k] = AC.createGain(); bus[k].gain.value = vol[k]; bus[k].connect(k === 'sfx' ? out : muffle); }
  function setVol(k, v) { vol[k] = clamp(+v || 0, 0, 1.5); bus[k].gain.setTargetAtTime(vol[k], t(), .05); try { localStorage.setItem('naija-vol', JSON.stringify(vol)); } catch (e) { } }
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
    if (!MINE) { MINE = loop(n, { b: 'veh' }); if (!MINE) return; }
    const f = files[n], k = clamp(Math.abs(speed) / (maxV || 14), 0, 1.25);
    MINE.s.playbackRate.setTargetAtTime((f.r0 || .85) + k * (f.r1 || .6) + (gas ? .05 : 0), t(), .12);
    MINE.g.gain.setTargetAtTime(MINE.k * (.55 + .35 * k + (gas ? .15 : 0)) * .8, t(), .12);
  }
  // tyres screeching while you brake hard or slide
  let SKID = null;
  function skid(k) {
    if (k > .05 && !SKID && files.skid) SKID = loop('skid', { b: 'veh', offset: 0 });
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
  function horn(type, x, z, gain = 1) { if (t() - hornT < .25 && x !== undefined) return; hornT = t(); const n = HORN[type] && files[HORN[type]] ? HORN[type] : 'horn_car'; return play(n, { x, z, y: 1, b: 'veh', gain, ref: 10, max: 400, rate: .96 + R() * .08 }); }
  function stopAll() { for (const n of Object.keys(BEDS)) { BEDS[n].stop(); delete BEDS[n]; } for (const [id, S] of SPOTS) { S.L.stop(); SPOTS.delete(id); } for (const [v, L] of VOICES) { L.stop(); VOICES.delete(v); } if (MINE) { MINE.stop(); MINE = null; } }
  return { AC, bus, vol, setVol, need, preload, play, loop, beds, spots, engines, myEngine, skid, siren, horn, listen, place, stopAll, has: n => !!files[n] || !!fam[n],
    muffle(on) { muffle.frequency.setTargetAtTime(on ? 700 : 20000, t(), .3); }, files,
    debug() { return { beds: Object.keys(BEDS).map(n => [n, +BEDS[n].g.gain.value.toFixed(3)]), spots: [...SPOTS.keys()], engines: [...VOICES.values()].map(L => L.name), mine: MINE && MINE.name, loaded: [...BUF.keys()], state: AC.state }; } };
}
