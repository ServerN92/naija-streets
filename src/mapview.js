// Full-screen city map: pan, zoom, places by category, and a GPS route.
// The game hands in a pre-drawn city image and callbacks; this file is only the map screen.

export const KINDS = {
  home:    { label: 'Home',     color: '#F2B705', glyph: 'H' },
  police:  { label: 'Police',   color: '#4c7dff', glyph: 'P' },
  food:    { label: 'Food',     color: '#ff7a33', glyph: 'F' },
  shop:    { label: 'Shops',    color: '#22b07a', glyph: 'M' },
  service: { label: 'Services', color: '#b46cff', glyph: 'S' },
  office:  { label: 'Offices',  color: '#5fc6d8', glyph: 'O' },
  place:   { label: 'Places',   color: '#f7efdf', glyph: '★' },
};
const FILTERS = [['all', 'All'], ['food', 'Food'], ['shop', 'Shops'], ['service', 'Services'], ['office', 'Offices'], ['police', 'Police'], ['place', 'Places']];

export class MapView {
  constructor(o) {
    Object.assign(this, o); // {root, canvas, image, bounds:{x0,z0,x1,z1,ppm}, places, streets, getPlayer, routeTo, onRoute, fmtDist}
    this.g = this.canvas.getContext('2d');
    this.open_ = false; this.filter = 'all'; this.sel = null; this.route = null; this.dest = null;
    this.view = { cx: 0, cz: 0, s: 1.2 };
    this.ptrs = new Map(); this.moved = 0;
    const $ = id => document.getElementById(id);
    this.card = $('bmCard'); this.cName = $('bmName'); this.cSub = $('bmSub'); this.cIc = $('bmIc'); this.cGo = $('bmGo');
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
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.moved = 0; this.pinch = null; });
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
    const up = e => { const p = this.ptrs.get(e.pointerId); this.ptrs.delete(e.pointerId); if (p && this.moved < 8 && this.ptrs.size === 0) this.tap(e.clientX, e.clientY); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => this.ptrs.delete(e.pointerId));
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
  visiblePlaces() { const major = k => k === 'home' || k === 'police' || k === 'place' || k === 'office';
    return this.places.filter(p => this.filter === 'all' ? (major(p.kind) || this.view.s >= 1.7) : (p.kind === this.filter || (this.filter === 'police' && p.kind === 'home'))); }
  tap(sx, sy) {
    let best = null, bd = 26;
    for (const p of this.visiblePlaces()) { const [x, y] = this.toScreen(p.x, p.z); const d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = p; } }
    this.sel = best; this.showCard(); this.draw();
  }
  setDest(x, z, place = null) { this.dest = { x, z, place }; this.recompute(); if (this.onRoute) this.onRoute(this.dest); }
  clearRoute() { this.dest = null; this.route = null; if (this.onRoute) this.onRoute(null); }
  recompute() { if (!this.dest) { this.route = null; return; } const p = this.getPlayer(); this.route = this.routeTo(p.x, p.z, this.dest.x, this.dest.z); }
  showCard() {
    const p = this.sel; if (!p) { this.card.hidden = true; return; }
    const k = KINDS[p.kind] || KINDS.place, me = this.getPlayer();
    this.card.hidden = false; this.cIc.style.background = k.color; this.cIc.textContent = k.glyph;
    this.cName.textContent = p.name; this.cSub.textContent = (p.sub ? p.sub.charAt(0) + p.sub.slice(1).toLowerCase() + ' · ' : '') + this.fmtDist(Math.hypot(p.x - me.x, p.z - me.z));
    const on = this.dest && this.dest.place === p; this.cGo.textContent = on ? 'CLEAR GPS' : 'SET GPS'; this.cGo.classList.toggle('off', on);
  }
  draw() {
    if (!this.open_) return;
    const g = this.g, d = this.dpr, W = innerWidth, H = innerHeight, v = this.view, B = this.bounds;
    g.setTransform(d, 0, 0, d, 0, 0); g.fillStyle = '#0b1820'; g.fillRect(0, 0, W, H);
    g.save(); g.translate(W / 2, H / 2); g.scale(v.s, v.s); g.translate(-v.cx, -v.cz);
    g.imageSmoothingEnabled = v.s < 2.5; g.drawImage(this.image, B.x0, B.z0, B.x1 - B.x0, B.z1 - B.z0);
    if (this.route && this.route.length > 1) {
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 10 / v.s + 3; g.beginPath(); this.route.forEach(([x, z], i) => i ? g.lineTo(x, z) : g.moveTo(x, z)); g.stroke();
      g.strokeStyle = '#F2B705'; g.lineWidth = 6 / v.s + 2; g.stroke();
    }
    g.restore();
    // street names (round joins: no spikes on letters like M and A)
    g.lineJoin = 'round'; g.miterLimit = 2;
    if (v.s > .8) {
      g.font = `600 ${Math.round(12 + Math.min(4, v.s * 1.2))}px "Barlow Semi Condensed", "Arial Narrow", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const st of this.streets) {
        const [x, y] = this.toScreen(st.x, st.z); if (x < -80 || y < -20 || x > W + 80 || y > H + 20) continue;
        g.save(); g.translate(x, y); if (st.vertical) g.rotate(-Math.PI / 2);
        g.lineWidth = 4; g.strokeStyle = 'rgba(11,24,32,.85)'; g.strokeText(st.name, 0, 0); g.fillStyle = '#d8dde4'; g.fillText(st.name, 0, 0); g.restore();
      }
    }
    // places
    const rad = Math.max(9, Math.min(15, 7 + v.s * 3));
    g.font = `400 ${Math.round(rad * 1.05)}px Bungee, Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const shown = this.visiblePlaces(), drawn = [];
    for (const p of shown) {
      const [x, y] = this.toScreen(p.x, p.z); if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      if (p.kind !== 'home' && p.kind !== 'police' && drawn.some(q => Math.abs(q[0] - x) < rad * 1.6 && Math.abs(q[1] - y) < rad * 1.6)) continue; // declutter
      drawn.push([x, y]); const k = KINDS[p.kind] || KINDS.place, sel = p === this.sel;
      g.beginPath(); g.arc(x, y, rad + (sel ? 4 : 0), 0, 7); g.fillStyle = sel ? '#ffffff' : 'rgba(11,24,32,.9)'; g.fill();
      g.beginPath(); g.arc(x, y, rad - 1.5, 0, 7); g.fillStyle = k.color; g.fill();
      g.fillStyle = '#0E1014'; g.fillText(k.glyph, x, y + 1);
      if (v.s > 2.2 || sel || p.kind === 'home' || p.kind === 'police' || p.kind === 'place') {
        g.font = `700 13px "Barlow Semi Condensed", "Arial Narrow", sans-serif`; g.lineWidth = 4; g.strokeStyle = 'rgba(11,24,32,.9)'; g.strokeText(p.name, x, y + rad + 11); g.fillStyle = '#f7efdf'; g.fillText(p.name, x, y + rad + 11);
        g.font = `400 ${Math.round(rad * 1.05)}px Bungee, Impact, sans-serif`;
      }
    }
    if (this.filter === 'all' && v.s < 1.7) { g.font = '600 14px "Barlow Semi Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(247,239,223,.75)'; g.fillText('Zoom in to see shops, food and services', W / 2, H - 28); }
    if (this.dest) { const [x, y] = this.toScreen(this.dest.x, this.dest.z); g.fillStyle = '#F2B705'; g.strokeStyle = '#0E1014'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.arc(x, y - 22, 11, Math.PI * .75, Math.PI * .25); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#0E1014'; g.beginPath(); g.arc(x, y - 22, 4, 0, 7); g.fill(); }
    // you
    const me = this.getPlayer(), [px, py] = this.toScreen(me.x, me.z);
    g.save(); g.translate(px, py); g.rotate(me.dir); g.fillStyle = '#f7efdf'; g.strokeStyle = '#0E1014'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -14); g.lineTo(10, 10); g.lineTo(0, 5); g.lineTo(-10, 10); g.closePath(); g.stroke(); g.fill(); g.restore();
  }
}
