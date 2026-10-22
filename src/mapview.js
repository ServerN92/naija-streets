// Full-screen city map: pan, zoom, places by category, a GPS route, and your own pin (hold on the map, or right-click, to drop it).
// The game hands in a pre-drawn city image and callbacks; this file is only the map screen.

export const KINDS = {
  home:    { label: 'Home',     color: '#F2B705', glyph: 'H' },
  police:  { label: 'Police',   color: '#4c7dff', glyph: 'P' },
  food:    { label: 'Food',     color: '#ff7a33', glyph: 'F' },
  shop:    { label: 'Shops',    color: '#22b07a', glyph: 'M' },
  guns:    { label: 'Guns',     color: '#e0453a', glyph: 'G' },
  service: { label: 'Services', color: '#b46cff', glyph: 'S' },
  office:  { label: 'Offices',  color: '#5fc6d8', glyph: 'O' },
  hotel:   { label: 'Hotels',   color: '#e9c46a', glyph: 'H' },
  club:    { label: 'Clubs',    color: '#ff4fd8', glyph: '♪' },
  cars:    { label: 'Cars',     color: '#3ddc84', glyph: 'C' },
  sport:   { label: 'Sport',    color: '#7ed957', glyph: '⚽' },
  place:   { label: 'Places',   color: '#f7efdf', glyph: '★' },
  pin:     { label: 'Your pin', color: '#ff3b30', glyph: '•' },
};
export const GPS_RED = '#ff3b30';   // the GPS line and the pins: red, easy to see on the yellow-brown streets
export const GPS_GREEN = '#22c55e';   // the way to your work (your hustle's task, a delivery, your passengers, the farm buyer)
export const isWork = p => !!(p && (p.work || p.job));
const FILTERS = [['all', 'All'], ['guns', 'Guns'], ['food', 'Food'], ['shop', 'Shops'], ['service', 'Services'], ['office', 'Offices'], ['police', 'Police'], ['hotel', 'Hotels'], ['club', 'Clubs'], ['cars', 'Cars'], ['sport', 'Sport'], ['place', 'Places']];

export class MapView {
  constructor(o) {
    Object.assign(this, o); // {root, canvas, image, bounds:{x0,z0,x1,z1,ppm}, places, streets, getPlayer, routeTo, onRoute, fmtDist, detail?, nameAt?, onCab?, onPin?, touch?}
    this.g = this.canvas.getContext('2d');
    this.open_ = false; this.filter = 'all'; this.sel = null; this.route = null; this.dest = null;
    this.view = { cx: 0, cz: 0, s: 1.2 }; this.pin = null; this.hold = null;
    try { const q = JSON.parse(localStorage.getItem('ns-pin') || 'null'); if (q && isFinite(q.x) && isFinite(q.z)) this.pin = this.makePin(q.x, q.z); } catch (e) {}
    this.ptrs = new Map(); this.moved = 0;
    const $ = id => document.getElementById(id);
    this.card = $('bmCard'); this.cName = $('bmName'); this.cSub = $('bmSub'); this.cIc = $('bmIc'); this.cGo = $('bmGo'); this.cCab = $('bmCab'); this.cDel = $('bmDel');
    if (this.cCab) this.cCab.onclick = () => { if (this.sel && this.onCab) this.onCab(this.sel); };
    if (this.cDel) this.cDel.onclick = () => this.removePin();
    const chips = $('bmChips');
    for (const [k, l] of FILTERS) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.f = k; b.setAttribute('aria-pressed', k === 'all' ? 'true' : 'false');
      b.innerHTML = (k !== 'all' ? `<i style="background:${KINDS[k].color}"></i>` : '') + l;
      b.onclick = () => { this.filter = k; chips.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); this.draw(); };
      chips.appendChild(b);
    }
    $('bmClose').onclick = () => this.close();
    $('bmIn').onclick = () => this.zoom(1.4);
    $('bmOut').onclick = () => this.zoom(1 / 1.4);
    $('bmMe').onclick = () => { const p = this.getPlayer(); this.view.cx = p.x; this.view.cz = p.z; this.draw(); };
    this.cGo.onclick = () => {
      if (!this.sel) return;
      if (this.dest && this.dest.place === this.sel) this.clearRoute(); else this.setDest(this.sel.x, this.sel.z, this.sel);
      this.showCard(); this.draw();
    };
    const cv = this.canvas;
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.moved = 0; this.pinch = null; this.held = false;
      clearTimeout(this.hold); if (this.ptrs.size === 1 && e.button === 0) { const sx = e.clientX, sy = e.clientY; this.hold = setTimeout(() => { if (this.moved < 8 && this.ptrs.size === 1) { this.held = true; this.dropPin(sx, sy); } }, 480); } });   // hold still: drop a pin
    cv.addEventListener('contextmenu', e => { e.preventDefault(); this.dropPin(e.clientX, e.clientY); });   // right-click: drop a pin
    cv.addEventListener('pointermove', e => {
      const p = this.ptrs.get(e.pointerId); if (!p) return;
      if (this.ptrs.size === 2) {
        const [a, b] = [...this.ptrs.values()]; const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY; const [a2, b2] = [...this.ptrs.values()]; const d1 = Math.hypot(a2.x - b2.x, a2.y - b2.y);
        if (d0 > 10) this.zoom(d1 / d0, (a2.x + b2.x) / 2, (a2.y + b2.y) / 2); this.moved += 99; return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; this.moved += Math.abs(dx) + Math.abs(dy);
      this.view.cx -= dx / this.view.s; this.view.cz -= dy / this.view.s; this.draw();
    });
    const up = e => { clearTimeout(this.hold); const p = this.ptrs.get(e.pointerId); this.ptrs.delete(e.pointerId); if (p && this.moved < 8 && this.ptrs.size === 0 && !this.held && e.button !== 2) this.tap(e.clientX, e.clientY); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { clearTimeout(this.hold); this.ptrs.delete(e.pointerId); });
    cv.addEventListener('wheel', e => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });
    addEventListener('resize', () => { if (this.open_) this.resize(); });
  }
  get isOpen() { return this.open_; }
  open() { this.open_ = true; this.root.hidden = false; const p = this.getPlayer(); this.view.cx = p.x; this.view.cz = p.z; this.resize(); this.showCard(); }
  close() { this.open_ = false; this.root.hidden = true; }
  toggle() { this.open_ ? this.close() : this.open(); }
  resize() { const d = Math.min(devicePixelRatio || 1, 2); this.dpr = d; this.canvas.width = Math.round(innerWidth * d); this.canvas.height = Math.round(innerHeight * d); this.draw(); }
  zoom(k, sx = innerWidth / 2, sy = innerHeight / 2) {
    const v = this.view, wx = v.cx + (sx - innerWidth / 2) / v.s, wz = v.cz + (sy - innerHeight / 2) / v.s;
    v.s = Math.min(9, Math.max(.25, v.s * k)); v.cx = wx - (sx - innerWidth / 2) / v.s; v.cz = wz - (sy - innerHeight / 2) / v.s; this.draw();
  }
  toScreen(x, z) { const v = this.view; return [(x - v.cx) * v.s + innerWidth / 2, (z - v.cz) * v.s + innerHeight / 2]; }
  visiblePlaces() { const major = p => (p.kind === 'home' || p.kind === 'police' || p.kind === 'guns' || p.kind === 'place' || p.kind === 'office' || p.kind === 'hotel' || p.kind === 'club' || p.kind === 'cars' || p.kind === 'sport') && !p.minor;
    return this.places.filter(p => this.filter === 'all' ? (major(p) || this.view.s >= 1.7) : (p.kind === this.filter || (this.filter === 'police' && p.kind === 'home'))); }
  tap(sx, sy) {
    let best = null, bd = 26;
    if (this.pin) { const [x, y] = this.toScreen(this.pin.x, this.pin.z); if (Math.hypot(x - sx, y - 18 - sy) < 30) { this.sel = this.pin; this.showCard(); this.draw(); return; } }   // your pin first
    for (const p of this.visiblePlaces()) { const [x, y] = this.toScreen(p.x, p.z); const d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = p; } }
    this.sel = best; this.showCard(); this.draw();
  }
  toWorld(sx, sy) { const v = this.view; return [v.cx + (sx - innerWidth / 2) / v.s, v.cz + (sy - innerHeight / 2) / v.s]; }
  makePin(x, z) { const B = this.bounds; x = Math.min(B.x1 - 2, Math.max(B.x0 + 2, x)); z = Math.min(B.z1 - 2, Math.max(B.z0 + 2, z));
    let near = ''; try { near = this.nameAt ? this.nameAt(x, z) || '' : ''; } catch (e) {}
    return { name: 'Your pin', sub: near ? 'Near ' + near : 'Pinned spot', kind: 'pin', pin: true, x, z }; }
  // drop (or move) your pin; if the GPS was on the old pin it follows the new one
  dropPin(sx, sy) { const [x, z] = this.toWorld(sx, sy), was = this.pin, onIt = this.dest && was && this.dest.place === was;
    this.pin = this.makePin(x, z); try { localStorage.setItem('ns-pin', JSON.stringify({ x: this.pin.x, z: this.pin.z })); } catch (e) {}
    if (navigator.vibrate) try { navigator.vibrate(25); } catch (e) {}
    if (onIt) this.setDest(this.pin.x, this.pin.z, this.pin);
    this.sel = this.pin; this.showCard(); this.draw(); if (this.onPin) this.onPin(this.pin); }
  removePin() { if (!this.pin) return; if (this.dest && this.dest.place === this.pin) this.clearRoute(); if (this.sel === this.pin) this.sel = null; this.pin = null;
    try { localStorage.removeItem('ns-pin'); } catch (e) {} this.showCard(); this.draw(); if (this.onPin) this.onPin(null); }
  setDest(x, z, place = null) { this.dest = { x, z, place }; this.recompute(); if (this.onRoute) this.onRoute(this.dest); }
  clearRoute() { this.dest = null; this.route = null; if (this.onRoute) this.onRoute(null); }
  recompute() { if (!this.dest) { this.route = null; return; } const p = this.getPlayer(); this.route = this.routeTo(p.x, p.z, this.dest.x, this.dest.z); }
  showCard() {
    const p = this.sel; if (!p) { this.card.hidden = true; return; }
    const k = KINDS[p.kind] || KINDS.place, me = this.getPlayer();
    this.card.hidden = false; this.cIc.style.background = k.color; this.cIc.textContent = k.glyph;
    this.cName.textContent = p.name; this.cSub.textContent = (p.sub ? (p.pin ? p.sub : p.sub.charAt(0) + p.sub.slice(1).toLowerCase()) + ' · ' : '') + this.fmtDist(Math.hypot(p.x - me.x, p.z - me.z));
    const on = this.dest && this.dest.place === p; this.cGo.textContent = on ? 'CLEAR GPS' : 'SET GPS'; this.cGo.classList.toggle('off', on);
    if (this.cCab) this.cCab.hidden = !this.onCab || Math.hypot(p.x - me.x, p.z - me.z) < 60;   // a cab there (not when you are already there)
    if (this.cDel) this.cDel.hidden = !p.pin;
  }
  draw() {
    if (!this.open_) return;
    const g = this.g, d = this.dpr, W = innerWidth, H = innerHeight, v = this.view, B = this.bounds;
    g.setTransform(d, 0, 0, d, 0, 0); g.fillStyle = '#0b1820'; g.fillRect(0, 0, W, H);
    g.save(); g.translate(W / 2, H / 2); g.scale(v.s, v.s); g.translate(-v.cx, -v.cz);
    g.imageSmoothingEnabled = v.s < 2.5; g.drawImage(this.image, B.x0, B.z0, B.x1 - B.x0, B.z1 - B.z0);
    // zoomed in: draw the streets and buildings in view sharply over the picture
    if (this.detail && W / v.s < 900) { const hw = W / 2 / v.s, hh = H / 2 / v.s; this.detail(g, v.cx - hw, v.cz - hh, v.cx + hw, v.cz + hh); }
    if (this.route && this.route.length > 1) {
      g.lineJoin = 'round'; g.lineCap = 'round';
      const wk = isWork(this.dest && this.dest.place);
      g.strokeStyle = wk ? 'rgba(0,40,10,.7)' : 'rgba(40,0,0,.7)'; g.lineWidth = 10 / v.s + 4; g.beginPath(); this.route.forEach(([x, z], i) => i ? g.lineTo(x, z) : g.moveTo(x, z)); g.stroke();
      g.strokeStyle = wk ? GPS_GREEN : GPS_RED; g.lineWidth = 6 / v.s + 2.5; g.stroke();
    }
    g.restore();
    // street names (round joins: no spikes on letters like M and A)
    g.lineJoin = 'round'; g.miterLimit = 2;
    if (v.s > .8) {
      g.font = `600 ${Math.round(12 + Math.min(4, v.s * 1.2))}px "Barlow Semi Condensed", "Arial Narrow", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const st of this.streets) {
        const [x, y] = this.toScreen(st.x, st.z); if (x < -80 || y < -20 || x > W + 80 || y > H + 20) continue;
        g.save(); g.translate(x, y); if (st.vertical) g.rotate(-Math.PI / 2); else if (st.ang) g.rotate(st.ang);
        g.lineWidth = 4; g.strokeStyle = 'rgba(11,24,32,.85)'; g.strokeText(st.name, 0, 0); g.fillStyle = '#d8dde4'; g.fillText(st.name, 0, 0); g.restore();
      }
    }
    // places
    const rad = Math.max(9, Math.min(15, 7 + v.s * 3));
    g.font = `400 ${Math.round(rad * 1.05)}px Bungee, Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const shown = this.visiblePlaces(), drawn = [];
    for (const p of shown) {
      const [x, y] = this.toScreen(p.x, p.z); if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      if (p.kind !== 'home' && p.kind !== 'police' && p.kind !== 'guns' && p.kind !== 'hotel' && p.kind !== 'club' && p.kind !== 'cars' && p.kind !== 'sport' && drawn.some(q => Math.abs(q[0] - x) < rad * 1.6 && Math.abs(q[1] - y) < rad * 1.6)) continue; // declutter
      drawn.push([x, y]); const k = KINDS[p.kind] || KINDS.place, sel = p === this.sel;
      g.beginPath(); g.arc(x, y, rad + (sel ? 4 : 0), 0, 7); g.fillStyle = sel ? '#ffffff' : 'rgba(11,24,32,.9)'; g.fill();
      g.beginPath(); g.arc(x, y, rad - 1.5, 0, 7); g.fillStyle = k.color; g.fill();
      g.fillStyle = '#0E1014'; g.fillText(k.glyph, x, y + 1);
      if (v.s > 2.2 || sel || p.kind === 'home' || p.kind === 'police' || p.kind === 'guns' || p.kind === 'hotel' || p.kind === 'club' || p.kind === 'cars' || p.kind === 'sport' || (p.kind === 'place' && !p.minor)) {
        g.font = `700 13px "Barlow Semi Condensed", "Arial Narrow", sans-serif`; g.lineWidth = 4; g.strokeStyle = 'rgba(11,24,32,.9)'; g.strokeText(p.name, x, y + rad + 11); g.fillStyle = '#f7efdf'; g.fillText(p.name, x, y + rad + 11);
        g.font = `400 ${Math.round(rad * 1.05)}px Bungee, Impact, sans-serif`;
      }
    }
    if (this.card.hidden) { g.font = '600 14px "Barlow Semi Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(247,239,223,.8)';
      const hint = (this.touch && this.touch() ? 'Hold your finger on the map' : 'Right-click the map') + ' to drop a pin';
      g.fillText(this.filter === 'all' && v.s < 1.7 ? 'Zoom in to see shops, food and services  ·  ' + hint : hint, W / 2, H - 28); }
    const drop = (x, y, big) => { const r = big ? 13 : 11; g.fillStyle = GPS_RED; g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.arc(x, y - r * 2, r, Math.PI * .75, Math.PI * .25); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y - r * 2, r * .38, 0, 7); g.fill(); };
    if (this.dest && !(this.pin && this.dest.place === this.pin)) { const [x, y] = this.toScreen(this.dest.x, this.dest.z); drop(x, y, false); }
    if (this.pin) { const [x, y] = this.toScreen(this.pin.x, this.pin.z); if (this.sel === this.pin) { g.fillStyle = 'rgba(255,59,48,.25)'; g.beginPath(); g.ellipse(x, y, 16, 7, 0, 0, 7); g.fill(); } drop(x, y, true); }
    // you
    const me = this.getPlayer(), [px, py] = this.toScreen(me.x, me.z);
    g.save(); g.translate(px, py); g.rotate(me.dir); g.fillStyle = '#f7efdf'; g.strokeStyle = '#0E1014'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -14); g.lineTo(10, 10); g.lineTo(0, 5); g.lineTo(-10, 10); g.closePath(); g.stroke(); g.fill(); g.restore();
  }
}
