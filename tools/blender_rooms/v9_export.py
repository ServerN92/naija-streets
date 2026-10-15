import bpy, bmesh, os, math, traceback, time
def _sub(a,b): return (a[0]-b[0],a[1]-b[1],a[2]-b[2])
def _dot(a,b): return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
def _cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def _norm(a):
    l=math.sqrt(_dot(a,a)) or 1; return (a[0]/l,a[1]/l,a[2]/l)
def lightmap_uv(normals, fverts, adj, size=2048, pad_px=5, angle=35):
    """normals[f], fverts[f]=list of (x,y,z), adj[f]=neighbour faces -> uvs[f]=list of (u,v)"""
    n=len(normals); cosl=math.cos(math.radians(angle)); seen=[False]*n; charts=[]
    for s in range(n):
        if seen[s]: continue
        n0=normals[s]; seen[s]=True; st=[s]; ch=[]
        while st:
            f=st.pop(); ch.append(f)
            for g in adj[f]:
                if not seen[g] and _dot(normals[g],n0)>cosl: seen[g]=True; st.append(g)
        a=(1,0,0) if abs(n0[0])<.9 else (0,1,0); u=_norm(_cross(n0,a)); v=_cross(n0,u)
        pts={f:[(_dot(p,u),_dot(p,v)) for p in fverts[f]] for f in ch}
        xs=[q[0] for f in ch for q in pts[f]]; ys=[q[1] for f in ch for q in pts[f]]
        x0,y0=min(xs),min(ys); w,h=max(max(xs)-x0,1e-4),max(max(ys)-y0,1e-4)
        rot=h>w
        if rot: w,h=h,w
        charts.append([ch,pts,x0,y0,w,h,rot])
    A=sum(c[4]*c[5] for c in charts); W=math.sqrt(A)*1.1
    order=sorted(range(len(charts)),key=lambda i:-charts[i][5])
    for it in range(60):
        pad=pad_px/size*W; x=y=rowh=0; pos={}
        for i in order:
            w,h=charts[i][4]+pad,charts[i][5]+pad
            if x+w>W: x=0; y+=rowh; rowh=0
            pos[i]=(x+pad/2,y+pad/2); x+=w; rowh=max(rowh,h)
        if y+rowh<=W: break
        W*=1.04
    uvs=[None]*n
    for i,(ch,pts,x0,y0,w,h,rot) in enumerate(charts):
        px,py=pos[i]
        for f in ch:
            out=[]
            for (a,b) in pts[f]:
                a-=x0; b-=y0
                if rot: a,b=b,h-a
                out.append(((px+a)/W,(py+b)/W))
            uvs[f]=out
    return uvs, len(charts), A/(W*W), W

from mathutils import Vector
LOG = bpy.data.texts.get('EXPORT_LOG') or bpy.data.texts.new('EXPORT_LOG'); LOG.clear()
def log(*a):
    line = time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a) + '\n'; LOG.write(line)
    try: open(os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms', 'export_log.txt'), 'a').write(line)
    except Exception: pass
try:
    open(os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms', 'export_log.txt'), 'w').write('v9 start\n')
    OUT = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms'); os.makedirs(os.path.join(OUT, 'tex'), exist_ok=True)
    NAME = 'int_suite_family'; LM_SIZE = 2048; K = .5      # lights are halved while baking so the light picture never clips
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections): bpy.data.collections.remove(c)
    for me in list(bpy.data.meshes):
        if me.users == 0: bpy.data.meshes.remove(me)
    with bpy.data.libraries.load(os.path.join(OUT, 'family_suite_v2_src.blend'), link=False) as (src, dst): dst.collections = ['Suite']
    SRC = dst.collections[0]; sc = bpy.context.scene; sc.collection.children.link(SRC)
    with bpy.data.libraries.load(os.path.join(OUT, 'family_suite_v2_src.blend'), link=False) as (src, dst): dst.worlds = list(src.worlds)
    if dst.worlds: sc.world = dst.worlds[0]
    bpy.context.view_layer.update(); log('loaded', len(SRC.objects))
    TILE = 2.0
    for o in SRC.objects: o.hide_viewport = False; o.hide_render = False
    # ---- 1. pattern materials (wood, tiles, marble, fabric) baked into tiling pictures, like before
    def patterned(m):
        return m and m.use_nodes and any(n.type in ('TEX_BRICK', 'TEX_NOISE', 'TEX_WAVE') for n in m.node_tree.nodes) and not m.node_tree.nodes.get('BAKED')
    mats = {}
    for o in SRC.objects:
        if o.type == 'MESH':
            for s in o.material_slots:
                if patterned(s.material): mats[s.material.name] = s.material
    sc.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.get_devices()
        gpu = [d for d in prefs.devices if d.type != 'CPU']
        if gpu and prefs.compute_device_type != 'NONE':
            for d in prefs.devices: d.use = True
            sc.cycles.device = 'GPU'
        else: sc.cycles.device = 'CPU'
    except Exception as e: log('device', e)
    log('device', sc.cycles.device)
    sc.cycles.samples = 4
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_plane_add(size=TILE, location=(0, 0, 0)); plane = bpy.context.active_object
    baked = {}
    for mn, m in mats.items():
        size = 512 if any(k in mn.lower() for k in ('cushion', 'throw', 'curtain', 'towel')) else 1024
        img = bpy.data.images.new('tex_' + mn.replace(' ', '_'), size, size)
        nt = m.node_tree; tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img; nt.nodes.active = tn
        plane.data.materials.clear(); plane.data.materials.append(m)
        bpy.ops.object.select_all(action='DESELECT'); plane.select_set(True); bpy.context.view_layer.objects.active = plane
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=0, use_clear=True)
        img.filepath_raw = os.path.join(OUT, 'tex', img.name + '.jpg'); img.file_format = 'JPEG'; img.save(); nt.nodes.remove(tn)
        b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        nm = bpy.data.materials.new(mn + ' (game)'); nm.use_nodes = True; t2 = nm.node_tree; b2 = t2.nodes.get('Principled BSDF')
        it = t2.nodes.new('ShaderNodeTexImage'); it.image = img; t2.links.new(it.outputs['Color'], b2.inputs['Base Color'])
        b2.inputs['Roughness'].default_value = b.inputs['Roughness'].default_value; b2.inputs['Metallic'].default_value = b.inputs['Metallic'].default_value
        t2.nodes.new('ShaderNodeValue').name = 'BAKED'; baked[mn] = nm
    bpy.data.objects.remove(plane, do_unlink=True); log('patterns baked', len(baked))
    # ---- 2. one room mesh with modifiers applied; picture coordinates in metres
    GAME = bpy.data.collections.new('GameExport'); sc.collection.children.link(GAME)
    bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
    def tile_uv(me):
        bm = bmesh.new(); bm.from_mesh(me); uv = bm.loops.layers.uv.verify()
        for f in bm.faces:
            n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
            for l in f.loops:
                p = l.vert.co; a, c = [(1, 2), (0, 2), (0, 1)][ax]; l[uv].uv = (p[a] / TILE, p[c] / TILE)
        bm.to_mesh(me); bm.free()
    def copy(o, swap=True):
        ev = o.evaluated_get(dg); me = bpy.data.meshes.new_from_object(ev); me.transform(ev.matrix_world); tile_uv(me)
        if swap:
            for i, s in enumerate(me.materials):
                if s and s.name in baked: me.materials[i] = baked[s.name]
        n = bpy.data.objects.new(o.name + '_g', me); GAME.objects.link(n); return n
    room, view = [], []
    for o in SRC.objects:
        if o.type != 'MESH': continue
        (view if o.name.startswith('VIEW_') else room).append(copy(o))
    def join(objs, name):
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs: o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1: bpy.ops.object.join()
        o = bpy.context.active_object; o.name = name; o.data.name = name; return o
    R = join(room, 'ROOM'); V = join(view, 'VIEW_city')
    log('room tris', sum(len(p.vertices) - 2 for p in R.data.polygons))
    # ---- 3. light-map coordinates (a second UV map) and the light bake
    # cut big flat faces (floor, walls, ceiling) into small pieces so they take the light well
    bm = bmesh.new(); bm.from_mesh(R.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    for it in range(12):
        long = [e for e in bm.edges if e.calc_length() > 0.45]
        if not long: break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=False)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bm.to_mesh(R.data); bm.free(); R.data.update()
    log('after cutting: tris', len(R.data.polygons))
    while len(R.data.uv_layers) > 1: R.data.uv_layers.remove(R.data.uv_layers[-1])
    uvt = R.data.uv_layers[0]; lm = R.data.uv_layers.new(name='LM'); R.data.uv_layers.active = lm; uvt.active_render = True
    bm = bmesh.new(); bm.from_mesh(R.data); bm.faces.ensure_lookup_table(); L = bm.loops.layers.uv['LM']
    for f in bm.faces: f.index = f.index
    bm.faces.index_update()
    nr = [tuple(f.normal) for f in bm.faces]; fv = [[tuple(l.vert.co) for l in f.loops] for f in bm.faces]
    adj = [[g.index for ed in f.edges for g in ed.link_faces if g is not f] for f in bm.faces]
    uvs, ncharts, fill, Wm = lightmap_uv(nr, fv, adj, size=LM_SIZE, pad_px=5)
    for f in bm.faces:
        for l, q in zip(f.loops, uvs[f.index]): l[L].uv = q
    bm.to_mesh(R.data); bm.free(); log('charts', ncharts, 'fill', round(fill, 3), 'px per metre', round(LM_SIZE / Wm, 1))
    bm = bmesh.new(); bm.from_mesh(R.data); L = bm.loops.layers.uv['LM']; ua = 0; bad = 0; out = 0
    for f in bm.faces:
        p = [l[L].uv for l in f.loops]; a = 0
        for i in range(1, len(p) - 1): a += abs((p[i] - p[0]).cross(p[i + 1] - p[0])) / 2
        ua += a; bad += (a < 1e-10 and f.calc_area() > 1e-4); out += any(q.x < 0 or q.x > 1 or q.y < 0 or q.y > 1 for q in p)
    log('lightmap uv: faces', len(bm.faces), 'uv area used', round(ua, 3), 'flat faces', bad, 'outside', out); bm.free()
    if ua < .3: raise Exception('lightmap layout failed')
    for o in SRC.objects:   # halve every light so the baked picture keeps its highlights
        if o.type == 'LIGHT': o.data.energy *= K
    for m in bpy.data.materials:
        if m.use_nodes:
            for n in m.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED' and n.inputs['Emission Strength'].default_value > 0: n.inputs['Emission Strength'].default_value *= K
    if sc.world and sc.world.use_nodes and sc.world.node_tree.nodes.get('Background'): sc.world.node_tree.nodes['Background'].inputs[1].default_value *= K
    for o in SRC.objects:
        if o.type == 'LIGHT' and o.name.startswith('L_down'): o.data.energy *= 1.6
    for i, (x, y) in enumerate([(-3.0, -2.5), (3.5, -2.5), (-2.5, 3.0), (4.25, 3.0)]):
        ld = bpy.data.lights.new('L_bounce%d' % i, 'AREA'); ld.energy = 70 * K; ld.size = 1.5; ld.color = (1, .9, .78)
        lo = bpy.data.objects.new('L_bounce%d' % i, ld); lo.location = (x, y, 2.3); lo.rotation_euler = (math.pi, 0, 0); SRC.objects.link(lo)
    if sc.world and sc.world.use_nodes and sc.world.node_tree.nodes.get('Background'): sc.world.node_tree.nodes['Background'].inputs[1].default_value = .9 * K
    img = bpy.data.images.new(NAME + '_lm', LM_SIZE, LM_SIZE, float_buffer=False); img.colorspace_settings.name = 'sRGB'
    # bake the light on plain white surfaces: lamps and glowing things keep their own material
    WH = bpy.data.materials.new('LM_WHITE'); WH.use_nodes = True; wb = WH.node_tree.nodes.get('Principled BSDF')
    wb.inputs['Base Color'].default_value = (.8, .8, .8, 1); wb.inputs['Roughness'].default_value = 1.0
    for k in ('Specular IOR Level', 'Specular'):
        if k in wb.inputs: wb.inputs[k].default_value = 0.0
    def glows(m):
        if not m or not m.use_nodes: return False
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED' and n.inputs['Emission Strength'].default_value > 0 and max(n.inputs['Emission Color'].default_value[:3]) > 0: return True
            if n.type == 'EMISSION': return True
        return False
    keep = list(R.data.materials); nglow = 0
    for i, m in enumerate(keep):
        if glows(m): nglow += 1
        else: R.data.materials[i] = WH
    log('glowing materials kept', nglow, 'of', len(keep))
    targets = set(m for m in R.data.materials if m and m.use_nodes)
    for m in targets:
        tn = m.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = img; tn.name = 'LM_TARGET'; m.node_tree.nodes.active = tn
    sc.cycles.samples = 256
    try: sc.cycles.use_denoising = True
    except Exception: pass
    sc.render.bake.margin = 8
    bpy.ops.object.select_all(action='DESELECT'); R.select_set(True); bpy.context.view_layer.objects.active = R
    log('baking light...')
    t0 = time.time()
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT', 'COLOR'}, margin=8, use_clear=True)
    img.filepath_raw = os.path.join(OUT, NAME + '_lm.jpg'); img.file_format = 'JPEG'; img.save(); log('light baked in', int(time.time() - t0), 's')
    for m in targets:
        if m.node_tree.nodes.get('LM_TARGET'): m.node_tree.nodes.remove(m.node_tree.nodes['LM_TARGET'])
    for i, m in enumerate(keep): R.data.materials[i] = m
    R.data.uv_layers.active = uvt
    # ---- 4. marks and export
    def mark(name, x, y, z=0, **props):
        e = bpy.data.objects.new('MARK_' + name, None); e.location = (x, y, z); GAME.objects.link(e)
        for k, val in props.items(): e[k] = val
    mark('spawn', -4.0, -4.1, face='+y'); mark('exit', -4.0, -4.6, face='-y')
    mark('bed', -2.9, 3.0, face='-x'); mark('tv', -2.8, -2.4, face='-x'); mark('cook', 2.6, -3.9, face='-y'); mark('sofa', -1.9, -2.4, face='-x')
    bpy.ops.object.select_all(action='DESELECT')
    for o in GAME.objects: o.select_set(True)
    path = os.path.join(OUT, NAME + '.glb')
    args = dict(filepath=path, use_selection=True, export_format='GLB', export_yup=True, export_apply=True, export_extras=True, export_lights=False, export_image_format='JPEG')
    for drop in ([], ['export_image_format']):
        try: bpy.ops.export_scene.gltf(**{k: v for k, v in args.items() if k not in drop}); break
        except TypeError as e: log('retry', e)
    SRC.hide_viewport = True
    log('EXPORTED', os.path.getsize(path) // 1024, 'KB', 'lightmap', os.path.getsize(os.path.join(OUT, NAME + '_lm.jpg')) // 1024, 'KB')
except Exception:
    log(traceback.format_exc())

