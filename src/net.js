// Naija Streets online: the connection to the live server (server/server.js).
// It sends where you are ten times a second and hands the game what the other players near you are doing.
// The game draws them (see "other players" in game.js); this file only talks to the server.
export const PROTO = 1;
const LIVE = 'wss://naija-streets.fly.dev';   // the Fly.io server (server/fly.toml)

export function serverURL() {
  const q = new URLSearchParams(location.search), s = q.get('server');
  if (q.get('solo') === '1') return null;   // ?solo=1 plays alone
  if (s && /^wss?:\/\/[\w.:-]+\/?$/.test(s)) return s;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return `ws://${location.hostname}:2567`;
  return LIVE; }

// on: {welcome(id,room,players), join(p), quit(id), update(list,t), chat(id,name,text), look(id,l,o), ride(ok,d,i,why), off(why), status(s)}
export function createNet(url, hello, on) {
  let ws = null, id = 0, tries = 0, timer = 0, last = '', lastSent = 0, closed = false, status = 'off';
  const set = s => { if (s !== status) { status = s; on.status && on.status(s); } };
  const send = m => { if (ws && ws.readyState === 1 && id) { ws.send(JSON.stringify(m)); return true; } return false; };
  function open() {
    if (closed || !url) return; set('connecting');
    try { ws = new WebSocket(url); } catch (e) { return retry(); }
    ws.onopen = () => { tries = 0; ws.send(JSON.stringify({ t: 'hi', v: PROTO, ...hello() })); };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'u') on.update(m.l, performance.now());
      else if (m.t === 'w') { id = m.id; set('on'); on.welcome(m.id, m.room, m.players); }
      else if (m.t === 'j') on.join(m.p);
      else if (m.t === 'q') on.quit(m.id);
      else if (m.t === 'chat') on.chat(m.id, m.n, m.x);
      else if (m.t === 'look') on.look(m.id, m.l, m.o);
      else if (m.t === 'ride') on.ride(m.ok, m.d, m.i, m.why);
      else if (m.t === 'off') on.off(m.why);
      else if (m.t === 'old') { closed = true; set('old'); } };
    ws.onclose = () => { const was = id; id = 0; ws = null; if (was) on.quit(-1); retry(); };
    ws.onerror = () => {}; }
  function retry() { if (closed) return; set('offline'); clearTimeout(timer); tries++; timer = setTimeout(open, Math.min(30000, 1500 * 2 ** Math.min(tries, 5)) * (0.7 + Math.random() * 0.6)); }
  // back from the background on a phone: reconnect straight away
  addEventListener('online', () => { if (!ws && !closed) { clearTimeout(timer); open(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !ws && !closed) { clearTimeout(timer); open(); } });
  open();
  return {
    get id() { return id; }, get status() { return status; },
    // your state, at most ten times a second; the same state again only once a second
    state(s) { const now = performance.now(); if (now - lastSent < 95) return; const k = JSON.stringify(s); if (k === last && now - lastSent < 1000) return; if (send({ t: 's', ...s })) { last = k; lastSent = now; } },
    chat: x => send({ t: 'c', x }), ride: d => send({ t: 'ride', d }), off: () => send({ t: 'off' }), look: (l, o) => send({ t: 'look', l, o }),
    close() { closed = true; clearTimeout(timer); if (ws) ws.close(); } };
}

// other players' positions arrive ten times a second; they are drawn a little in the past so the movement is smooth
export const DELAY = 160;   // ms
export function sample(buf, t) {
  while (buf.length > 2 && buf[1].t <= t) buf.shift();
  const a = buf[0], b = buf[1]; if (!b || t <= a.t) return a; if (t >= b.t) return b;
  const k = (t - a.t) / (b.t - a.t), lerp = (x, y) => x + (y - x) * k, ang = (x, y) => { let d = (y - x) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return x + d * k; };
  return { ...b, x: lerp(a.x, b.x), y: lerp(a.y, b.y), z: lerp(a.z, b.z), r: ang(a.r, b.r), s: lerp(a.s, b.s),
    car: a.car && b.car && a.car.k === b.car.k ? { ...b.car, h: ang(a.car.h, b.car.h), s: lerp(a.car.s, b.car.s) } : b.car }; }
