# Naija Streets: build every walk-in room in this Blender, light it with its lamps, bake the light and export for the game.
# Rooms come from tools/blender_hotel.py and tools/blender_venues.py (copied next to this file, in tools/).
# Output: Documents/naija_rooms/out/<room>.glb and <room>_lm.jpg      Log: Documents/naija_rooms/rooms_log.txt
import bpy, bmesh, os, sys, math, time, json, traceback, importlib
BASE = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms')
OUTD = os.path.join(BASE, 'out'); os.makedirs(OUTD, exist_ok=True)
LOGF = os.path.join(BASE, 'rooms_log.txt')
ONLY = globals().get('ONLY') or None            # set ONLY = ['int_club'] before running to do just some rooms
SAMPLES = globals().get('SAMPLES') or 384


def log(*a):
    line = time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a) + '\n'
    with open(LOGF, 'a') as f: f.write(line)


# ---------------------------------------------------------------- light-map layout (each flat patch gets its own spot)
def _dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def _cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def _norm(a):
    l = math.sqrt(_dot(a, a)) or 1; return (a[0] / l, a[1] / l, a[2] / l)
def lightmap_uv(normals, fverts, adj, size=2048, pad_px=4, angle=35):
    n = len(normals); cosl = math.cos(math.radians(angle)); seen = [False] * n; charts = []
    for s in range(n):
        if seen[s]: continue
        n0 = normals[s]; seen[s] = True; st = [s]; ch = []
        while st:
            f = st.pop(); ch.append(f)
            for g in adj[f]:
                if not seen[g] and _dot(normals[g], n0) > cosl: seen[g] = True; st.append(g)
        a = (1, 0, 0) if abs(n0[0]) < .9 else (0, 1, 0); u = _norm(_cross(n0, a)); v = _cross(n0, u)
        pts = {f: [(_dot(p, u), _dot(p, v)) for p in fverts[f]] for f in ch}
        xs = [q[0] for f in ch for q in pts[f]]; ys = [q[1] for f in ch for q in pts[f]]
        x0, y0 = min(xs), min(ys); w, h = max(max(xs) - x0, 1e-4), max(max(ys) - y0, 1e-4)
        rot = h > w
        if rot: w, h = h, w
        charts.append([ch, pts, x0, y0, w, h, rot])
    A = sum(c[4] * c[5] for c in charts); W = math.sqrt(A) * 1.1
    order = sorted(range(len(charts)), key=lambda i: -charts[i][5])
    for it in range(80):
        pad = pad_px / size * W; x = y = rowh = 0; pos = {}
        for i in order:
            w, h = charts[i][4] + pad, charts[i][5] + pad
            if x + w > W: x = 0; y += rowh; rowh = 0
            pos[i] = (x + pad / 2, y + pad / 2); x += w; rowh = max(rowh, h)
        if y + rowh <= W: break
        W *= 1.04
    uvs = [None] * n
    for i, (ch, pts, x0, y0, w, h, rot) in enumerate(charts):
        px, py = pos[i]
        for f in ch:
            out = []
            for (a, b) in pts[f]:
                a -= x0; b -= y0
                if rot: a, b = b, h - a
                out.append(((px + a) / W, (py + b) / W))
            uvs[f] = out
    return uvs, len(charts), A / (W * W), W


def lin(c): return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
def hexlin(h):
    h = h.lstrip('#'); return tuple(lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


def clear_scene():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections): bpy.data.collections.remove(c)
    for blk in (bpy.data.meshes, bpy.data.lights, bpy.data.images):
        for d in list(blk):
            if d.users == 0: blk.remove(d)


def build_room(name, fn):
    t0 = time.time(); sc = bpy.context.scene
    clear_scene()
    ob = fn(True); ob.name = 'ROOM'; ob.data.name = 'ROOM'; ob.location = (0, 0, 0)
    marks = ob.get('marks'); marks = json.loads(marks) if isinstance(marks, str) else dict(marks or {})
    if 'marks' in ob: del ob['marks']
    me = ob.data
    # colours were written as sRGB numbers: store them linear, like the game expects
    ca = me.color_attributes.get('Col') or me.color_attributes[0]
    import numpy as np
    buf = np.empty(len(ca.data) * 4, np.float32); ca.data.foreach_get('color', buf); c = buf.reshape(-1, 4)
    rgb = c[:, :3]; c[:, :3] = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4); ca.data.foreach_set('color', buf)
    log(name, 'built', len(me.polygons), 'faces', len(marks), 'marks')
    # ---- light-map coordinates: UVMap and LM the same (the game reads the second one)
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table(); bm.faces.index_update()
    nr = [tuple(f.normal) for f in bm.faces]; fv = [[tuple(l.vert.co) for l in f.loops] for f in bm.faces]
    adj = [[g.index for ed in f.edges for g in ed.link_faces if g is not f] for f in bm.faces]
    area = sum(f.calc_area() for f in bm.faces)
    size = int(min(2048, max(1024, math.ceil(math.sqrt(area * 400 / .45) / 256) * 256)))
    uvs, ncharts, fill, Wm = lightmap_uv(nr, fv, adj, size=size, pad_px=4)
    L0 = bm.loops.layers.uv.new('UVMap'); L1 = bm.loops.layers.uv.new('LM')
    for f in bm.faces:
        for l, q in zip(f.loops, uvs[f.index]): l[L0].uv = q; l[L1].uv = q
    bm.to_mesh(me); bm.free(); me.uv_layers.active = me.uv_layers['LM']
    log(name, 'light-map', size, 'px, charts', ncharts, 'fill', round(fill, 2), 'px/m', round(size / Wm, 1), 'area m2', int(area))
    # ---- the room's own lamps (from its light marks), a little night air
    nl = 0
    for k, m in marks.items():
        if not k.startswith('light_'): continue
        ld = bpy.data.lights.new('L_' + k, 'POINT'); ld.energy = float(m.get('power', 30)) * 4; ld.shadow_soft_size = .12
        try: ld.color = hexlin(m.get('color', '#ffd9a0'))
        except Exception: pass
        lo = bpy.data.objects.new('L_' + k, ld); lo.location = (m['x'], m['y'], m['z'] - .15); sc.collection.objects.link(lo); nl += 1
    if nl == 0:   # no lamps marked: a few ceiling lights over the room
        bb = [ob.matrix_world @ v.co for v in me.vertices]; x0 = min(p.x for p in bb); x1 = max(p.x for p in bb); y0 = min(p.y for p in bb); y1 = max(p.y for p in bb); z1 = max(p.z for p in bb)
        for i in range(3):
            for j in range(3):
                ld = bpy.data.lights.new('L_auto', 'POINT'); ld.energy = 150; lo = bpy.data.objects.new('L_auto', ld)
                lo.location = (x0 + (x1 - x0) * (i + .5) / 3, y0 + (y1 - y0) * (j + .5) / 3, min(z1 - .4, 3.0)); sc.collection.objects.link(lo); nl += 1
    w = sc.world or bpy.data.worlds.new('World'); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes.get('Background')
    if bg: bg.inputs[0].default_value = (.5, .45, .4, 1); bg.inputs[1].default_value = .15
    # ---- bake the light on white
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = SAMPLES
    try: sc.cycles.use_denoising = True; sc.cycles.sample_clamp_indirect = 3.0
    except Exception: pass
    WH = bpy.data.materials.get('LM_WHITE')
    if not WH:
        WH = bpy.data.materials.new('LM_WHITE'); WH.use_nodes = True; wb = WH.node_tree.nodes.get('Principled BSDF')
        wb.inputs['Base Color'].default_value = (.8, .8, .8, 1); wb.inputs['Roughness'].default_value = 1.0
        for kk in ('Specular IOR Level', 'Specular'):
            if kk in wb.inputs: wb.inputs[kk].default_value = 0.0
    keep = list(me.materials)
    for i in range(len(keep)): me.materials[i] = WH
    img = bpy.data.images.new(name + '_lmf', size, size, float_buffer=True); img.colorspace_settings.name = 'Linear Rec.709' if 'Linear Rec.709' in [c.name for c in type(img.colorspace_settings).bl_rna.properties['name'].enum_items] else img.colorspace_settings.name
    tn = WH.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = img; tn.name = 'LM_TARGET'; WH.node_tree.nodes.active = tn
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    t1 = time.time()
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT', 'COLOR'}, margin=6, use_clear=True)
    log(name, 'light baked in', int(time.time() - t1), 's with', nl, 'lamps')
    WH.node_tree.nodes.remove(tn)
    for i, m in enumerate(keep): me.materials[i] = m
    # ---- same brightness as the suite, smooth the grain, save as a picture
    px = np.empty(size * size * 4, np.float32); img.pixels.foreach_get(px); a = px.reshape(size, size, 4); rgb = a[:, :, :3].copy()
    cov = rgb.max(2) > 1e-6
    med = float(np.median(rgb[cov].max(1))) if cov.any() else 1.0
    EXPO = {'int_club': 2.4, 'int_police': 1.35}
    k = min(20.0, max(.05, .115 * EXPO.get(name, 1.0) / max(med, 1e-6))); rgb *= k
    # tiny patches the bake missed: give every empty pixel the light of its nearest neighbours (no black slivers)
    m = cov.copy()
    for it in range(48):
        if m.all(): break
        acc = np.zeros_like(rgb); cnt = np.zeros(m.shape, np.float32); mr = rgb * m[..., None]
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx or dy: acc += np.roll(np.roll(mr, dy, 0), dx, 1); cnt += np.roll(np.roll(m, dy, 0), dx, 1)
        new = (~m) & (cnt > 0); rgb[new] = acc[new] / cnt[new][:, None]; m |= new
    rgb[~m] = .115
    kern = np.exp(-.5 * (np.arange(-3, 4) / 1.3) ** 2); kern /= kern.sum()
    for ax in (0, 1):
        pad = [(0, 0)] * 3; pad[ax] = (3, 3); p = np.pad(rgb, pad, mode='edge'); o2 = np.zeros_like(rgb)
        for i, kv in enumerate(kern): o2 += kv * (p[i:i + size] if ax == 0 else p[:, i:i + size])
        rgb = o2
    rgb = np.clip(rgb, 0, 1); srgb = np.where(rgb <= .0031308, rgb * 12.92, 1.055 * rgb ** (1 / 2.4) - .055)
    outp = np.ones((size, size, 4), np.float32); outp[:, :, :3] = srgb
    oi = bpy.data.images.new(name + '_lm', size, size); oi.pixels.foreach_set(outp.ravel())
    oi.filepath_raw = os.path.join(OUTD, name + '_lm.jpg'); oi.file_format = 'JPEG'; sc.render.image_settings.quality = 92; oi.save()
    log(name, 'exposure x', round(k, 2))
    # ---- spots for the game as MARK_ empties, then export
    for o in [o for o in sc.objects if o.type == 'LIGHT']: o.hide_render = True
    em = []
    for kname, m in marks.items():
        e = bpy.data.objects.new('MARK_' + kname, None); e.location = (m['x'], m['y'], m.get('z', 0)); sc.collection.objects.link(e)
        for kk, vv in m.items():
            if kk in ('x', 'y', 'z'): continue
            if isinstance(vv, (int, float, str)): e[kk] = vv
        em.append(e)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    for e in em: e.select_set(True)
    path = os.path.join(OUTD, name + '.glb')
    args = dict(filepath=path, use_selection=True, export_format='GLB', export_yup=True, export_apply=True, export_extras=True, export_lights=False)
    bpy.ops.export_scene.gltf(**args)
    log(name, 'EXPORTED', os.path.getsize(path) // 1024, 'KB, light', os.path.getsize(oi.filepath_raw) // 1024, 'KB, total', int(time.time() - t0), 's')


try:
    open(LOGF, 'w').write('rooms start\n')
    T = os.path.join(BASE, 'tools')
    if T not in sys.path: sys.path.insert(0, T)
    import blender_houses, blender_hotel, blender_venues
    for mod in (blender_houses, blender_hotel, blender_venues): importlib.reload(mod)
    HT, V = blender_hotel, blender_venues
    ROOMS = [('int_hotel_lobby', HT.int_hotel_lobby), ('int_hotel_corridor', HT.int_hotel_corridor), ('int_room_standard', HT.int_room_standard),
             ('int_room_deluxe', HT.int_room_deluxe), ('int_suite_exec', HT.int_suite_exec), ('int_suite_presidential', HT.int_suite_presidential),
             ('int_club', V.int_club), ('int_police', V.int_police), ('int_showroom', V.int_showroom)]
    for name, fn in ROOMS:
        if ONLY and name not in ONLY: continue
        try: build_room(name, fn)
        except Exception: log(name, 'FAILED', traceback.format_exc())
    log('ALL DONE')
except Exception:
    log('FAILED', traceback.format_exc())
