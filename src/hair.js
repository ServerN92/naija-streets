/* Hairstyles: the barbers and the salons change your hair, and it stays with you.
   The styles were made in the user's Blender (naija_rooms/hair/hair_job.py): assets/models/hair/hair_<style>.glb is one style
   fitted to a reference head, moved so its anchor (the top of the head) is the origin; hair.json says how it sits on every
   person (k: a scale, a: the anchor in that person's own rest frame) and the caps made on each head (hair_<style>_<pid>.glb).
   A style goes on as a skinned mesh bound to the person's own skeleton: the Head bone, and below the neck the shoulders too
   for long hair. The person's own hair (and a man's cut, his "scalp") hide under it.
   Your hair is in the life record (hair: {pid: style}); wigs you own in wigs: [style]. */
export function createHair(A) {
  const THREE = A.THREE, H = { J: null, P: null, glbs: new Map(), busy: false };
  const CAT = { cut: 'Cuts', natural: 'Natural', braids: 'Braids and locs', euro: 'Other styles', wig: 'Wigs' };
    function load() {
    if (H.P) return H.P;
    H.P = A.json('assets/models/hair/hair.json').then(J => { H.J = J; H.by = {}; for (const s of J.styles) H.by[s.id] = s; return J; });
    H.P.catch(e => { console.warn('hair', e); H.P = null; }); return H.P;
  }
  const styles = () => (H.J ? H.J.styles : []), byId = id => H.by && H.by[id];
  const thumb = (s, px) => { const J = H.J; if (!J || !J.atlas || s.ti == null) return ''; const c = J.atlas.cols, r = J.atlas.rows, x = s.ti % c, y = Math.floor(s.ti / c);
    return `background:url(${A.assetUrl('hair/' + J.atlas.file)}) ${-x * px}px ${-y * px}px/${c * px}px ${r * px}px no-repeat`; };
  // the style's mesh for a person: the shared one, or the cap made on that head
  function glb(name) {
    if (H.glbs.has(name)) return H.glbs.get(name);
    const p = A.glb('hair/' + name).then(g => { let mesh = null; g.scene.traverse(o => { if (!mesh && o.isMesh) mesh = o; }); if (!mesh) throw new Error('no mesh in ' + name);
      mesh.updateMatrixWorld(true); const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld); const m = mesh.material;
      m.side = THREE.DoubleSide; if (m.map) { m.map.colorSpace = THREE.SRGBColorSpace; m.map.anisotropy = 4; } if (m.transparent || m.alphaTest > 0 || (m.map && (m.map.format === THREE.RGBAFormat))) { m.transparent = false; m.alphaTest = .34; m.depthWrite = true; }
      m.roughness = Math.max(.45, m.roughness || .5); m.metalness = 0; m.emissive = m.map ? new THREE.Color(0xffffff) : m.color.clone(); m.emissiveMap = m.map || null; m.emissiveIntensity = 0;
      return { geo, mat: m }; });
    p.catch(() => H.glbs.delete(name)); H.glbs.set(name, p); return p;
  }
  const fileFor = (s, pid) => (H.J.caps && H.J.caps[s.id] && H.J.caps[s.id][pid] ? `hair_${s.id}_${pid}` : s.fits && s.fits[pid] ? `hair_${s.id}` : null);
  // the person's own hair groups (and a man's cut) on or off
  function own(root, on, scalpOff) { const s = root.userData.outfitChar || '-';   // a woman's dark scalp cap stays under a style (it hides the skin between the strands); a man's cut goes
    root.traverse(o => { let m; if ((m = /^hair~([0-9a-z]*)~/.exec(o.name)) && !o.userData.hairx) { o.userData.hairOff = !on; o.visible = on && !m[1].includes(s); } else if (/^scalp/.test(o.name)) o.visible = on || !scalpOff; }); }
  function clear(root) { const gone = []; root.traverse(o => { if (o.userData.hairx) gone.push(o); }); for (const o of gone) o.parent.remove(o); }
  // put a style on a person's body (root: the cloned person; pid: who they are). style null: their own hair back
  async function apply(root, pid, style) {
    if (!root) return false; await load().catch(() => null); if (!H.J) return false;
    clear(root);
    if (!style || style === 'own') { own(root, true); root.userData.hair = null; return true; }
    root.userData.hair = style;
    const s = byId(style), per = H.J.people[pid];
    const cap = !!(s && H.J.caps && H.J.caps[s.id]);   // a man's own cut (his 'scalp') stays under a style as its base; it goes under a new cut or a clean shave
    own(root, false, !!(s && s.none) || (!!root.userData.male && cap));
    if (s && s.none) return true;   // (a clean shave: nothing on)
    if (!s || !per) { own(root, true); root.userData.hair = null; return false; }
    const file = fileFor(s, pid); if (!file) { own(root, true); root.userData.hair = null; return false; }
    let d; try { d = await glb(file); } catch (e) { console.warn('hair', file, e); own(root, true); root.userData.hair = null; return false; }
    if (root.userData.hair !== style) return false;   // changed again while it loaded
    let body = null, hairList = ''; root.traverse(o => { if (!body && o.isSkinnedMesh && o.skeleton) body = o; const m = /^hair~([0-9a-z]*)~/.exec(o.name); if (m) hairList = m[1]; });
    if (!body) return false;
    const fit = H.J.caps && H.J.caps[s.id] && H.J.caps[s.id][pid] ? { k: 1, a: [0, 0, 0] } : s.fits[pid];
    const geo = d.geo.clone(), P = geo.attributes.position, n = P.count, k = fit.k, ax = fit.a[0], ay = fit.a[2], az = -fit.a[1];   // Blender x,y,z -> game x,z,-y
    const bones = body.skeleton.bones, hi = bones.findIndex(b => /Head$/.test(b.name)), si = bones.findIndex(b => /Spine2$/.test(b.name)), neck = per.neck;
    const JI = new Uint16Array(n * 4), JW = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const x = P.getX(i) * k + ax, y = P.getY(i) * k + ay, z = P.getZ(i) * k + az; P.setXYZ(i, x, y, z);
      const w = s.long && si >= 0 ? Math.min(1, Math.max(0, (y - (neck - .1)) / .14)) : 1;
      JI[i * 4] = hi; JI[i * 4 + 1] = si >= 0 ? si : hi; JW[i * 4] = w; JW[i * 4 + 1] = 1 - w; }
    P.needsUpdate = true; geo.applyMatrix4(body.matrix.clone().invert());   // into the body's own (quantized) space: the skin's bind matrices were made for that space (gltfpack), not for metres
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(JI, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(JW, 4)); geo.computeBoundingSphere();
    const mesh = new THREE.SkinnedMesh(geo, d.mat); mesh.name = `hair~${hairList}~x`; mesh.userData.hairx = 1; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true; mesh.layers.mask = body.layers.mask;
    body.parent.add(mesh); mesh.bind(body.skeleton, new THREE.Matrix4());   // the hair is in the person's own rest frame (metres), the frame the skin's bind matrices expect; the body itself is quantized and carries its own bind
    mesh.visible = !(hairList && root.userData.outfitChar && hairList.includes(root.userData.outfitChar));
    return true;
  }
  // ---- buying: the menu rows for a place (who: 'f' or 'm'; kinds: the categories it does; mult: the place's price factor)
  const price = (s, sex, mult) => { const i = Math.max(0, s.sex.indexOf(sex)); return Math.round(s.price[Math.min(i, s.price.length - 1)] * mult / 100) * 100; };
  function list(sex, kinds, mult = 1) {
    const out = []; if (!H.J) return out;
    for (const s of styles()) if (s.sex.includes(sex) && kinds.includes(s.cat)) out.push({ id: s.id, name: s.name, cat: s.cat, price: price(s, sex, mult), wig: s.cat === 'wig', s });
    return out;
  }
  const myStyle = pid => (A.life().hair || {})[pid] || null;
  const ownsWig = id => (A.life().wigs || []).includes(id);
  // a menu at a chair: pick a style, pay, sit while it is done, then it is on you
  function menu(title, note, sex, kinds, mult, opt = {}) {
    load().then(() => {
      const pid = A.myId(), cur = myStyle(pid), rows = list(sex, kinds, mult), cash = A.cash();
      const R = rows.map(r => { const on = cur === r.id, have = r.wig && ownsWig(r.id), p = have ? 0 : r.price;
        return { name: r.name, sub: on ? 'On you now' : have ? 'Your wig · put it on' : CAT[r.cat] || r.cat, price: on ? 0 : p, btn: on ? 'Wearing' : have ? 'Wear' : A.naira(p), off: on || (!have && cash < p), rank: 0, css: r.s ? thumb(r.s, 56) : '',
          act: () => { A.closeMenu(); start(r, on ? 0 : p, sex, opt); } }; });   // (the menu takes the money before act)
      R.push({ name: 'My own hair back', sub: 'As you came', btn: cur ? 'Free' : 'On you', off: !cur, act: () => { A.closeMenu(); start({ id: null, name: 'your own hair', cat: 'own' }, 0, sex, opt); } });
      A.openMenu(title, note, R);
    }).catch(() => A.toast('The salon no ready. Try again small time.'));
  }
  function start(r, p, sex, opt) {
    if (H.busy) return;
    H.busy = true; const pid = A.myId(), wig = r.wig; if (wig && p && !ownsWig(r.id)) { (A.life().wigs = A.life().wigs || []).push(r.id); }
    const dur = r.cat === 'wig' || r.cat === 'own' ? 6 : r.cat === 'braids' ? 14 : r.cat === 'cut' ? 9 : 10;
    const done = () => { H.busy = false; setMine(pid, r.id); A.toast(r.id ? (wig ? `${r.name} on. ${sex === 'f' ? 'Fine girl!' : 'Fresh!'}` : `${r.name} done. ${sex === 'f' ? 'You fine pass!' : 'You look clean!'}`) : 'Your own hair, back as it was.', 3.5); if (opt.done) opt.done(r); };
    A.sit({ dur, label: wig ? `Fitting the wig… ` : r.cat === 'cut' ? 'The barber dey work… ' : 'The stylist dey work… ', sound: r.cat === 'cut' ? 'clipper' : 'scissors', at: opt.at, yaw: opt.yaw,
      mid: () => { setMine(pid, r.id, true); }, done });
  }
  function setMine(pid, id, quiet) { const L = A.life(); L.hair = L.hair || {}; if (id) L.hair[pid] = id; else delete L.hair[pid]; A.save(true); A.onMine(pid, id, quiet); }
  const put = id => load().then(() => setMine(A.myId(), id));   // a cut paid for elsewhere (a player's barbing salon): straight on
  return { load, apply, list, menu, styles, byId, thumb, myStyle, mine: () => myStyle(A.myId()), put, cats: CAT, busy: () => H.busy };
}
