/* ================= The police online: the force, wanted players, arrests =================
   Every player who is wanted carries their stars on their name for everybody to see (the street police's stars on
   your phone count too). Join the force at the front desk of Mushin police station (signed in, with no stars) and go
   on duty: you wear the black uniform and beret, and you see every wanted player in Lagos: on a list, and as red stars
   on your minimap. Knock a wanted player down (or reach one who surrenders) and arrest them (E): they go to the cell,
   their stars are gone, and the force pays you. Arrests raise your rank, Constable to CSP. Beat down somebody who is
   not wanted and you are suspended for a day, and wanted yourself.
   A wanted player near an officer on duty can surrender instead of fighting (E).
   Everything that matters is on the server (server/src/law.js); this file draws the desk, the lists and the prompts.
   The game passes in `api`. */
const DESK_R = 2.4, ARREST_R = 2.6, SURRENDER_R = 7;

export function createPolice(api) {
  const naira = api.naira;
  const ST = { me: null, wanted: [], cuff: null, sent: -1, sentT: 0, desk: null, deskSp: null };

  // ---- the front desk: an officer by the station door
  function desk() {
    if (ST.desk) return ST.desk; const F = api.station(); if (!F || (!F.x && !F.z)) return null;
    const sx = -Math.cos(F.ry), sz = Math.sin(F.ry);   // along the front of the building
    ST.desk = { x: F.x + sx * 3.2, z: F.z + sz * 3.2, ry: F.ry };
    ST.deskSp = api.spot('police_m', ST.desk.x, ST.desk.z, F.ry, ['idle_1', 'talk', 'idle_1']);
    api.mapPlace({ name: 'Police front desk', sub: 'Mushin police station · join the police, go on duty (online)', kind: 'place', x: ST.desk.x, z: ST.desk.z, id: 'police_desk' });
    return ST.desk;
  }
  const atDesk = () => { const D = desk(); if (!D || api.mode() !== 'walk') return false; const p = api.player(); return Math.hypot(p.x - D.x, p.z - D.z) < DESK_R; };
  const duty = () => !!(ST.me && ST.me.duty);
  const myStars = () => (ST.me ? ST.me.stars | 0 : 0);

  // ---- the people near you: someone to arrest (on duty), an officer to surrender to (wanted)
  function arrestable() {
    if (!duty() || api.mode() !== 'walk') return null; const p = api.player(); let best = null, bd = ARREST_R;
    for (const r of api.nearby()) { if (r.w < 1 || r.v) continue; const d = Math.hypot(r.x - p.x, r.z - p.z); if (d < bd) { bd = d; best = r; } }
    return best;
  }
  function officer() {
    if (duty() || myStars() < 1 || api.mode() !== 'walk') return null; const p = api.player(); let best = null, bd = SURRENDER_R;
    for (const r of api.nearby()) { if (r.b !== 'p' || r.v) continue; const d = Math.hypot(r.x - p.x, r.z - p.z); if (d < bd) { bd = d; best = r; } }
    return best;
  }
  const stars = n => '★'.repeat(Math.max(0, Math.min(5, n)));
  function prompt() {
    if (atDesk()) return !api.signedIn() ? 'Police front desk · sign in online to join the police' : ST.me && ST.me.cop ? `Police front desk · ${ST.me.rank} ${api.myName()} · ${duty() ? 'on duty' : 'off duty'}` : 'Police front desk · join the police';
    const a = arrestable(); if (a) return a.a === 'k' ? `Arrest ${a.n} ${stars(a.w)}` : `${a.n} ${stars(a.w)} is wanted · knock am down, then arrest`;
    const o = officer(); if (o) return `Surrender to ${o.n} (police)`;
    return null;
  }
  function action() {
    if (atDesk()) { if (!api.signedIn()) { api.openSignIn(); return true; } MENU = true; api.send({ t: 'law', a: 'info' }); refresh(true); return true; }
    const a = arrestable(); if (a) { api.send({ t: 'law', a: 'arrest', i: a.id }); return true; }
    const o = officer(); if (o) { api.send({ t: 'law', a: 'surrender' }); return true; }
    return false;
  }

  // ---- the desk menu
  let MENU = false, VIEW = 'main';
  function refresh(force) {
    if (!force && !(MENU && api.menuOpen())) return;
    const M = ST.me; api.openMenu('NIGERIA POLICE · MUSHIN', !M ? 'Connecting…' : M.cop ? `${M.rank} ${api.myName()} · ${M.arrests} arrests · today ${naira(M.today)} · all time ${naira(M.earned)}${M.ban ? ` · suspended ${Math.ceil(M.ban / 36e5)} h more` : ''}` : 'Catch the wanted players of Lagos', rows);
  }
  function rows() {
    const M = ST.me; if (!M) return [{ name: 'Connecting…', btn: '…', off: true, act() {} }];
    if (VIEW === 'quit') return [{ name: '‹ Back', sub: '', btn: 'BACK', act() { VIEW = 'main'; refresh(); } }, { name: 'Yes, leave the police', sub: 'Your arrests stay on the book if you come back', btn: 'LEAVE', act() { VIEW = 'main'; api.send({ t: 'law', a: 'quit' }); } }];
    if (!M.cop) return [{ name: 'Join the police', sub: M.stars ? 'You are wanted. Lose your stars first.' : 'Wear the uniform, see every wanted player, knock them down and arrest them. The force pays for every arrest.', btn: 'JOIN', off: M.stars > 0, act() { api.send({ t: 'law', a: 'join' }); } }];
    return [
      M.duty ? { name: 'Go off duty', sub: 'Take off the uniform', btn: 'OFF DUTY', act() { api.send({ t: 'law', a: 'duty', on: false }); } }
        : { name: 'Go on duty', sub: M.ban ? `Suspended for ${Math.ceil(M.ban / 36e5)} more hours` : M.stars ? 'You are wanted. You cannot go on duty.' : 'The uniform goes on, and the wanted list comes up', btn: 'ON DUTY', off: !!M.ban || M.stars > 0, act() { api.send({ t: 'law', a: 'duty', on: true }); } },
      { name: `${M.rank} · ${M.arrests} arrests`, sub: 'Corporal at 3, Sergeant at 10, Inspector at 25, ASP at 60, CSP at 120', btn: '★', off: true, act() {} },
      { name: 'How to arrest', sub: 'Knock a wanted player down, then stand by them and press E. If they surrender, you can cuff them at once. Do not beat people who are not wanted.', btn: '?', off: true, act() {} },
      { name: 'Leave the police', sub: '', btn: 'LEAVE', act() { VIEW = 'quit'; refresh(); } }];
  }

  // ---- the wanted list (officers on duty), at the side of the screen
  const box = document.createElement('div'); box.id = 'wantedBox';
  box.style.cssText = 'position:fixed;right:12px;top:118px;z-index:30;background:rgba(14,16,20,.82);color:#fff;font:600 13px/1.35 "Barlow Semi Condensed",Arial,sans-serif;padding:6px 10px;border-radius:12px;pointer-events:none;min-width:150px;max-width:46vw';
  box.hidden = true; document.body.appendChild(box);
  const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  function drawBox() {
    if (!duty()) { box.hidden = true; return; }
    const p = api.player(), yaw = api.camYaw(), L = ST.wanted.map(w => ({ n: w[1], s: w[2], x: w[3], z: w[4], car: w[5], inside: w[6], d: Math.hypot(w[3] - p.x, w[4] - p.z) })).sort((a, b) => a.d - b.d).slice(0, 5);
    box.hidden = false;
    if (!L.length) { box.innerHTML = '<b style="color:#7fa6ff">ON DUTY</b><br><span style="color:#aaa">Nobody is wanted now</span>'; return; }
    box.innerHTML = '<b style="color:#7fa6ff">WANTED</b>' + L.map(w => { const a = Math.atan2(w.x - p.x, w.z - p.z) - yaw, k = ((Math.round(-a / (Math.PI / 4)) % 8) + 8) % 8;
      return `<br><span style="color:#ff4a3a">${stars(w.s)}</span> ${w.n.replace(/[<>&]/g, '')} · ${w.d < 1000 ? Math.round(w.d) + ' m' : (w.d / 1000).toFixed(1) + ' km'} ${w.inside ? '(inside)' : ARROWS[k]}${w.car ? ' 🚗' : ''}`; }).join('');
  }

  // ---- messages from the server
  function on(m) {
    if (m.t === 'lawme') { const was = duty(); ST.me = m.m; if (was !== duty() && !duty()) ST.wanted = []; if (api.menuOpen() && MENU) refresh(); }
    else if (m.t === 'wanted') ST.wanted = m.l || [];
    else if (m.t === 'lawcuff') { ST.cuff = { i: m.i, n: m.n, t: performance.now() }; api.toast(`${m.n} is down! Arrest am now: stand by am and press E.`, 3); }
    else if (m.t === 'lawhands') { api.handsUp(); api.toast('You put your hands up. The officer can cuff you now.', 2.6); }
    else if (m.t === 'arrested') { api.toast(`${m.by} arrested you. You are going to the cell.`, 3.4); api.arrested(); }
    else if (m.t === 'arrestok') api.toast(`You arrested ${m.n} ${stars(m.s)}!${m.reward ? ` The force pays you ${naira(m.reward)}.` : ' (No pay: you arrested them just now.)'}${m.up ? ` You are a ${m.rank} now!` : ''}`, 3.6);
    else if ((m.t === 'err' || m.t === 'ok') && m.w === 'law') { api.toast(m.m, 3); if (MENU) setTimeout(() => refresh(), 60); }
  }
  function signedOut() { ST.me = null; ST.wanted = []; box.hidden = true; }

  // ---- every frame: tell the server your street stars, keep the list fresh
  let t1 = 0;
  function update(dt) {
    if ((t1 -= dt) > 0) return; t1 = .5;
    desk();
    if (api.signedIn()) { const n = api.stars(), now = performance.now(); if (n !== ST.sent && now - ST.sentT > 900) { ST.sent = n; ST.sentT = now; api.send({ t: 'law', a: 'stars', n }); } }
    else ST.sent = -1;
    drawBox();
    if (MENU && !api.menuOpen()) { MENU = false; VIEW = 'main'; }
  }
  // the minimap: the wanted players, for the police on duty
  const marks = () => duty() ? ST.wanted.filter(w => !w[6]).map(w => ({ x: w[3], z: w[4] })) : [];
  return { on, prompt, action, near: () => atDesk() || !!arrestable() || !!officer(), update, signedOut, duty, marks, debug: () => ({ me: ST.me, wanted: ST.wanted, desk: ST.desk, cuff: ST.cuff }) };
}
