# Naija Streets - Family Suite, detail pass: soft cushions and pillows, a draped duvet, curtains with folds, real
# leaves, tapered chair legs, a ceiling with downlights, cornices, a ceiling fan, kitchen and bath props, a city
# outside the window, and proper house lighting. Runs on the saved suite (Documents/naija_rooms/family_suite.blend).
import bpy, bmesh, math, random, os, traceback
from mathutils import Vector
random.seed(11)
LOG = bpy.data.texts.get('V2_LOG') or bpy.data.texts.new('V2_LOG'); LOG.clear()
def log(*a): LOG.write(' '.join(str(x) for x in a) + '\n')
try:
    OUT = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms')
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections): bpy.data.collections.remove(c)
    with bpy.data.libraries.load(os.path.join(OUT, 'family_suite.blend'), link=False) as (src, dst): dst.collections = ['Suite']
    COL = dst.collections[0]; bpy.context.scene.collection.children.link(COL)
    bpy.context.view_layer.update()
    MAT = {m.name: m for m in bpy.data.materials}
    def mat(name): return MAT.get(name) or MAT.get(name.split('.')[0])
    def lin(h):
        h = h.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
        return tuple((v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4) for v in c) + (1,)
    def newmat(name, col, rough=.5, metal=0, emit=0, sheen=0):
        m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes.get('Principled BSDF')
        b.inputs['Base Color'].default_value = lin(col); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
        if emit: b.inputs['Emission Color'].default_value = lin(col); b.inputs['Emission Strength'].default_value = emit
        if sheen: b.inputs['Sheen Weight'].default_value = sheen
        MAT[name] = m; return m
    def kill(*names):
        for n in names:
            for o in [o for o in COL.objects if o.name == n or o.name.startswith(n + '.')]: bpy.data.objects.remove(o, do_unlink=True)
    def link(o):
        for c in o.users_collection: c.objects.unlink(o)
        COL.objects.link(o); return o
    def mesh_obj(name, verts, faces, m, smooth=True):
        me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
        o = bpy.data.objects.new(name, me); COL.objects.link(o); o.data.materials.append(m)
        if smooth:
            for p in me.polygons: p.use_smooth = True
        return o
    def cube(name, x, y, z, sx, sy, sz, m, bev=.01, seg=3, sub=0):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + sz / 2)); o = bpy.context.active_object; o.name = name; o.scale = (sx, sy, sz)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True); o.data.materials.append(m); link(o)
        if bev: md = o.modifiers.new('Bevel', 'BEVEL'); md.width = min(bev, sx / 2.1, sy / 2.1, sz / 2.1); md.segments = seg; md.limit_method = 'ANGLE'
        if sub: md = o.modifiers.new('Sub', 'SUBSURF'); md.levels = sub; md.render_levels = sub
        if bev or sub:
            for p in o.data.polygons: p.use_smooth = True
        return o
    def cone(name, x, y, z, r1, r2, h, m, n=24):
        bpy.ops.mesh.primitive_cone_add(vertices=n, radius1=r1, radius2=r2, depth=h, location=(x, y, z + h / 2)); o = bpy.context.active_object; o.name = name; o.data.materials.append(m); link(o)
        for p in o.data.polygons: p.use_smooth = True
        return o
    def sphere(name, x, y, z, r, m, sq=1.0):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=r, location=(x, y, z)); o = bpy.context.active_object; o.name = name; o.scale.z = sq
        o.data.materials.append(m); link(o)
        for p in o.data.polygons: p.use_smooth = True
        return o
    def pillow(name, x, y, z, sx, sy, sz, m, rot=0, tilt=0):
        o = cube(name, x, y, z, sx, sy, sz, m, bev=0, sub=2)
        bm = bmesh.new(); bm.from_mesh(o.data)   # pinch the edges a little, like a stuffed cushion
        for v in bm.verts:
            ex = abs(v.co.x) / (sx / 2); ey = abs(v.co.y) / (sy / 2); v.co.z *= 1 - .35 * max(ex, ey) ** 4
        bm.to_mesh(o.data); bm.free(); o.rotation_euler = (tilt, 0, rot); return o

    WOOD = mat('Walnut'); OAK = mat('Light oak'); BRASS = mat('Brass'); CHROME = mat('Chrome'); BLACK = mat('Matt black'); PORC = mat('Porcelain')
    SOFA = mat('Sofa linen'); TERRA = mat('Terracotta velvet'); ANK = mat('Ankara cushion'); TEAL = mat('Teal cushion'); DUVET = mat('White duvet'); THROW = mat('Bed throw')
    WALLM = mat('Wall paint warm white'); CEILM = mat('Ceiling'); CURT = mat('Curtain'); LEAF = newmat('Leaf green', '#2e6a2f', .45, sheen=.2); LEAF2 = newmat('Leaf light', '#4f8a3a', .45)
    GOLDL = newmat('Lamp glow warm', '#ffcf8a', .5, emit=6); DOWN = newmat('Downlight', '#fff3dc', .3, emit=18)
    ORANGE = newmat('Orange fruit', '#e8871e', .4); BANANA = newmat('Banana', '#e9c43a', .5); PLATE = newmat('Plate', '#f4f2ee', .2)
    BOTTLE = newmat('Bottle green', '#1f4d2b', .1); WINE = newmat('Wine', '#5a1220', .15); BOOK1 = newmat('Book red', '#8c2b2b', .7); BOOK2 = newmat('Book navy', '#24375a', .7)
    TOWEL = newmat('Towel white', '#f1efe9', .95, sheen=.5); SOAP = newmat('Soap', '#d9c7a3', .4)

    # ---------------------------------------------------------------- soft furniture: replace the boxy cushions
    for o in list(COL.objects):
        n = o.name
        if any(n.startswith(p) for p in ('sofa3_seat', 'sofa3_backc', 'sofa3_pillow', 'chairL_seat', 'chairL_backc', 'chairL_pillow', 'chairR_seat', 'chairR_backc', 'chairR_pillow', 'pillow', 'bed_duvet', 'bed_throw', 'curtain_', 'plant', 'dchair', 'b_towel', 'k_jar')):
            bpy.data.objects.remove(o, do_unlink=True)
    def seat_set(name, x, y, L, facing, mfab, cush):
        rot = {'-x': 0, '+x': math.pi, '-y': math.pi / 2, '+y': -math.pi / 2}[facing]
        n = max(1, round((L - .4) / .62)); parts = []
        for i in range(n):
            cy = -(L - .4) / 2 + (i + .5) * (L - .4) / n; w = (L - .4) / n - .02
            parts.append(pillow(f'{name}_seat{i}', -.06, cy, .42, .74, w, .17, mfab))
            parts.append(pillow(f'{name}_backc{i}', .25, cy, .5, .22, w - .02, .46, mfab, tilt=0))
            if i % 2 == 0 or n == 1: parts.append(pillow(f'{name}_throw{i}', .1, cy + (.08 if i else 0), .62, .14, .42, .42, cush, tilt=.25))
        for p in parts:
            v = Vector(p.location); p.location = (x + v.x * math.cos(rot) - v.y * math.sin(rot), y + v.x * math.sin(rot) + v.y * math.cos(rot), v.z); p.rotation_euler.z += rot
    seat_set('sofa3', -1.6, -2.4, 2.4, '-x', SOFA, ANK)
    seat_set('chairL', -3.3, -4.2, 1.0, '+y', TERRA, ANK)
    seat_set('chairR', -3.3, -0.6, 1.0, '-y', TERRA, TEAL)
    # dining chairs: upholstered seat, curved back, tapered legs
    for sx in (-1, 1):
        for side in (-1, 1):
            cx, cy = -.4 + sx * .4, -4.0 + side * .62
            pillow('dchair_seat', cx, cy, .43, .46, .46, .07, TERRA)
            b = cube('dchair_back', cx, cy + side * .21, .5, .44, .04, .46, WOOD, bev=.015)
            md = b.modifiers.new('Bend', 'SIMPLE_DEFORM'); md.deform_method = 'BEND'; md.angle = math.radians(25 * side); md.deform_axis = 'Z'
            for lx in (-1, 1):
                for ly in (-1, 1): cone('dchair_leg', cx + lx * .19, cy + ly * .19, 0, .018, .024, .43, WOOD, 10)
    # ---------------------------------------------------------------- the bed: pillows and a duvet that drapes over the sides
    bx, by, top = -4.2, 3.0, .6
    for s in (-1, 1):
        pillow(f'pillow{s}', -5.32, by + s * .46, top, .42, .72, .2, DUVET, tilt=.15)
        pillow(f'pillowc{s}', -5.02, by + s * .3, top + .05, .18, .46, .4, ANK if s < 0 else TEAL, tilt=-.35)
    def drape(name, cx, cy, hx, hy, ztop, over, m, foot_only=False, nx=48, ny=40):
        verts, faces = [], []
        X0, X1, Y0, Y1 = cx - hx - over, cx + hx + over, cy - hy - over, cy + hy + over
        for j in range(ny + 1):
            for i in range(nx + 1):
                x = X0 + (X1 - X0) * i / nx; y = Y0 + (Y1 - Y0) * j / ny
                dx = max(0, abs(x - cx) - hx); dy = max(0, abs(y - cy) - hy)
                if foot_only and x < cx: dx = 0
                d = max(dx, dy); z = ztop - min(d, over) * 1.0 - max(0, d - over * .7) * .6
                if d > 0: x += (1 if x > cx else -1) * (-min(d, over) * .55) if dx > 0 else 0; y += ((1 if y > cy else -1) * (-min(d, over) * .55)) if dy > 0 else 0
                z += .012 * math.sin(x * 9 + y * 3) * math.cos(y * 7) + .008 * math.sin(x * 23 + y * 17)
                verts.append((x, y, z))
        for j in range(ny):
            for i in range(nx): a = j * (nx + 1) + i; faces.append((a, a + 1, a + nx + 2, a + nx + 1))
        o = mesh_obj(name, verts, faces, m); md = o.modifiers.new('Thick', 'SOLIDIFY'); md.thickness = .03; md.offset = -1
        md = o.modifiers.new('Sub', 'SUBSURF'); md.levels = 1; md.render_levels = 1; return o
    drape('bed_duvet', bx + .3, by, .78, .98, top + .08, .32, DUVET)
    drape('bed_throw', bx + .78, by, .26, 1.0, top + .115, .3, THROW, nx=12, ny=40)
    # ---------------------------------------------------------------- curtains with deep folds
    def curtain(name, x0, x1, y, h, m):
        n = max(8, int((x1 - x0) / .03)); verts, faces = [], []
        for j in range(2):
            z = .03 + j * h
            for i in range(n + 1):
                t = i / n; x = x0 + (x1 - x0) * t; amp = .055 + (.02 if j == 0 else 0)
                verts.append((x, y + amp * math.sin(t * (x1 - x0) / .17 * math.pi * 2), z))
        for i in range(n): faces.append((i, i + 1, i + n + 2, i + n + 1))
        o = mesh_obj(name, verts, faces, m); md = o.modifiers.new('Thick', 'SOLIDIFY'); md.thickness = .012; return o
    curtain('curtain_L', -5.85, -5.1, 4.78, 2.62, CURT); curtain('curtain_R', -2.5, -1.75, 4.78, 2.62, CURT)
    cube('curtain_rail', -3.8, 4.8, 2.7, 4.3, .04, .04, BRASS, bev=.015); cube('b_towel_rail', 2.62, 3.4, 1.1, .05, .7, .02, CHROME, bev=.005)
    # ---------------------------------------------------------------- plants with real leaves
    def leaf(name, x, y, z, ang, tilt, L, W, m):
        n = 10; verts, faces = [], []
        for i in range(n + 1):
            t = i / n; w = W * math.sin(math.pi * min(1, t * 1.05)) ** .8 * .5; h = tilt * t * L - .45 * (t * L) ** 2
            for s in (-1, 1): verts.append((t * L, s * w, h + abs(s * w) * .25))
        for i in range(n): a = i * 2; faces.append((a, a + 2, a + 3, a + 1))
        o = mesh_obj(name, verts, faces, m); o.location = (x, y, z); o.rotation_euler = (0, 0, ang)
        md = o.modifiers.new('Thick', 'SOLIDIFY'); md.thickness = .004; return o
    def plant(name, x, y, h=1.3, big=True):
        cone(f'{name}_pot', x, y, 0, .17, .23, .44, mat('Clay pot'), 24); cone(f'{name}_soil', x, y, .43, .2, .2, .01, BLACK, 24)
        for k in range(14 if big else 9):
            a = k * 2.399; hgt = .45 + (h - .45) * (.35 + .65 * random.random())
            st = cone(f'{name}_stem{k}', x, y, .44, .008, .006, hgt - .44, LEAF, 6); st.rotation_euler = (math.cos(a) * .25, math.sin(a) * .25, 0)
            leaf(f'{name}_leaf{k}', x + math.cos(a) * (hgt - .44) * .24, y + math.sin(a) * (hgt - .44) * .24, hgt, a, random.uniform(.2, .8), random.uniform(.32, .5) if big else .28, random.uniform(.18, .26) if big else .1, LEAF if k % 3 else LEAF2)
    plant('plant1', -5.45, -4.45, 1.5); plant('plant2', .6, -.35, 1.15); plant('plant3', 2.1, 4.55, 1.3)
    # ---------------------------------------------------------------- ceiling: cornice, downlights, fan
    kill('CEILING'); ceil = cube('CEILING', 0, 0, 3.2, 12, 10, .06, mat('Ceiling'), bev=0)
    for (x, y, sx, sy) in ((0, -4.92, 12, .14), (0, 4.92, 12, .14), (-5.92, 0, .14, 10), (5.92, 0, .14, 10), (-1.75, 1.0, 8.5, .28), (4.25, 1.0, 3.5, .28), (2.5, 3.0, .28, 4)):
        cube('cornice', x, y, 3.08, sx, sy, .12, mat('Skirting'), bev=.02)
    for (x, y) in ((-4.5, -3.6), (-4.5, -1.2), (-2.2, -3.6), (-2.2, -1.2), (2.2, -3.6), (4.4, -3.6), (2.2, -1.6), (4.4, -1.6), (-4.0, 2.0), (-1.4, 2.0), (-4.0, 4.0), (-1.4, 4.0), (4.25, 2.0), (4.25, 4.0)):
        cone('downlight_rim', x, y, 3.155, .085, .085, .02, CHROME, 20); cone('downlight', x, y, 3.15, .07, .07, .012, DOWN, 20)
    cone('fan_rod', -3.3, -2.4, 2.75, .012, .012, .43, BRASS, 8); cone('fan_hub', -3.3, -2.4, 2.62, .11, .09, .14, BRASS, 24)
    for k in range(3):
        b = cube('fan_blade', -3.3, -2.4, 2.68, .7, .14, .012, WOOD, bev=.004); b.location = (-3.3 + math.cos(k * 2.094) * .45, -2.4 + math.sin(k * 2.094) * .45, 2.68); b.rotation_euler = (math.radians(8), 0, k * 2.094)
    # ---------------------------------------------------------------- small things that make it lived in
    sphere('fruit_bowl', -.4, -4.0, .80, .17, mat('Marble'), .45)
    for k in range(4): sphere('orange', -.45 + (k % 2) * .09, -4.03 + (k // 2) * .08, .86, .045, ORANGE)
    for k in range(2): cube('banana', -.32, -3.96 + k * .03, .85, .16, .03, .03, BANANA, bev=.012, sub=1)
    for k in range(4): cone('plate', 2.0 + k * .002, -4.75, .925 + k * .012, .12, .13, .01, PLATE, 24)
    for k, (m, h) in enumerate(((BOTTLE, .3), (WINE, .28), (BOTTLE, .32))):
        cone('bottle', 4.9 + k * .1, -4.8, .92, .035, .035, h * .7, m, 14); cone('bottle_neck', 4.9 + k * .1, -4.8, .92 + h * .7, .035, .012, h * .3, m, 14)
    cube('cutting_board', 3.4, -4.65, .92, .4, .28, .02, OAK, bev=.008)
    for k in range(6): cube('book', -5.7, -2.95 + k * .055, .5, .2, .045, .22 + (k % 3) * .03, BOOK1 if k % 2 else BOOK2, bev=.004)
    cone('candle', -3.5, -2.3, .42, .03, .03, .12, newmat('Candle', '#f3eadb', .6), 16)
    pillow('b_towel', 2.66, 3.4, .78, .06, .5, .34, TOWEL); pillow('b_towel2', 3.6, 4.9, .86, .3, .2, .06, TOWEL)
    cube('soap', 3.55, 4.7, .86, .08, .05, .03, SOAP, bev=.01)
    for k in range(3): cone('k_jar', 1.6 + k * .18, -4.8, .92, .06, .055, .18, newmat(f'jar{k}b', ('#e8b923', '#c0392b', '#2f6b34')[k], .25), 16)
    cube('doormat', -4.0, -4.4, 0, 1.0, .6, .015, mat('Rug'), bev=.005)
    cube('shoe_rack', -5.4, -4.7, 0, .7, .3, .45, WOOD, bev=.01)
    for k in range(3): cube('shoe', -5.6 + k * .2, -4.7, .45, .1, .26, .08, BLACK if k % 2 else mat('Terracotta velvet'), bev=.03)
    # ---------------------------------------------------------------- outside the window: Lagos at dusk
    kill('window_view')
    sky = newmat('Dusk sky', '#e9a66a', .9, emit=2.2); cityd = newmat('City block', '#2a2c33', .9); cityw = newmat('City lights', '#ffc874', .5, emit=8)
    cube('VIEW_sky', -3.8, 30, -2, 60, .1, 30, sky, bev=0)
    random.seed(5)
    for k in range(18):
        x = -16 + k * 2 + random.uniform(-.5, .5); y = random.uniform(8, 22); h = random.uniform(5, 26); w = random.uniform(1.5, 3.2)
        cube('VIEW_bld', x, y, -6, w, w, h, cityd, bev=0)
        for r in range(int(h / 3)):
            if random.random() < .55: cube('VIEW_win', x + random.uniform(-w / 3, w / 3), y - w / 2 - .02, -6 + 1 + r * 3, .5, .02, .7, cityw, bev=0)
    # ---------------------------------------------------------------- house lighting: warm downlights, lamps, the pendant, evening sun
    for o in [o for o in COL.objects if o.type == 'LIGHT']: bpy.data.objects.remove(o, do_unlink=True)
    def light(name, x, y, z, kind, power, col=(1, .82, .62), size=.2, spot=None):
        ld = bpy.data.lights.new(name, kind); ld.energy = power; ld.color = col
        if kind == 'AREA': ld.size = size
        elif kind == 'SPOT': ld.spot_size = math.radians(spot or 100); ld.spot_blend = .8; ld.shadow_soft_size = .05
        else: ld.shadow_soft_size = size
        o = bpy.data.objects.new(name, ld); o.location = (x, y, z); COL.objects.link(o); return o
    for o in [o for o in COL.objects if o.name.startswith('downlight') and not o.name.startswith('downlight_rim')]:
        light('L_down', o.location.x, o.location.y, 3.12, 'SPOT', 55)
    light('L_lamp1', -5.7, 1.5, .98, 'POINT', 22, size=.12); light('L_lamp2', -5.7, 4.5, .98, 'POINT', 22, size=.12)
    light('L_pendant', -.4, -4.0, 1.55, 'POINT', 45, size=.1)
    light('L_window', -3.8, 4.6, 1.7, 'AREA', 90, (1, .72, .5), 2.8).rotation_euler = (math.radians(-90), 0, 0)
    sun = bpy.data.lights.new('Sun', 'SUN'); sun.energy = 2.2; sun.color = (1, .75, .52); sun.angle = math.radians(3)
    so = bpy.data.objects.new('Sun', sun); so.rotation_euler = (math.radians(72), 0, math.radians(195)); COL.objects.link(so)
    sc = bpy.context.scene; w = sc.world or bpy.data.worlds.new('World'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    if bg: bg.inputs[0].default_value = (.55, .42, .32, 1); bg.inputs[1].default_value = .35
    try: sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception: pass
    try: sc.eevee.use_raytracing = True; sc.eevee.use_shadows = True
    except Exception: pass
    # a camera standing in the parlour, at eye height, like the game
    for o in [o for o in COL.objects if o.type == 'CAMERA']: bpy.data.objects.remove(o, do_unlink=True)
    cam = bpy.data.cameras.new('EyeCam'); cam.lens = 22; co = bpy.data.objects.new('EyeCam', cam); COL.objects.link(co)
    co.location = (.2, -4.3, 1.75); co.rotation_euler = (math.radians(84), 0, math.radians(59)); sc.camera = co
    bad = [o.name for o in COL.objects if o.type == 'MESH' and any(max(abs(c) for c in (o.matrix_world @ v.co)) > 30 for v in o.data.vertices) and not o.name.startswith('VIEW_')]
    log('far objects', bad)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'family_suite_v2.blend'))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'family_suite_v2_src.blend'), copy=True)
    log('V2 OK', len(COL.objects), 'objects')
except Exception:
    log(traceback.format_exc())


# ================= bake + export
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
    open(os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms', 'export_log.txt'), 'w').write('v7 start\n')
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
    for s in R.material_slots:
        m = s.material
        if not m or not m.use_nodes: continue
        tn = m.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = img; tn.name = 'LM_TARGET'; m.node_tree.nodes.active = tn
    sc.cycles.samples = 200
    try: sc.cycles.use_denoising = True
    except Exception: pass
    sc.render.bake.margin = 8
    bpy.ops.object.select_all(action='DESELECT'); R.select_set(True); bpy.context.view_layer.objects.active = R
    log('baking light...')
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=8, use_clear=True)
    img.filepath_raw = os.path.join(OUT, NAME + '_lm.jpg'); img.file_format = 'JPEG'; img.save(); log('light baked')
    for s in R.material_slots:
        m = s.material
        if m and m.use_nodes and m.node_tree.nodes.get('LM_TARGET'): m.node_tree.nodes.remove(m.node_tree.nodes['LM_TARGET'])
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

