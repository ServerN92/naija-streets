# Naija Streets: the stand on the start page. You pick your person and they stand on it, turning slowly.
# A danfo plinth: a round block painted danfo yellow with the bus's two black bands, a black-and-white kerb ring on
# top (the paint of a Lagos kerb) around a worn concrete top, on a thin asphalt slab. About 1.3 m across, 0.28 m high.
# Z up here; the glTF export turns it Y up. The person stands at the top (0.268 m).
#
# It never builds inside a project you have open: run from Blender's UI with your own .blend open, it starts a second
# Blender in the background (no window, factory settings) that builds and exports, and your file is not touched.
import bpy, bmesh, math, os, time, traceback, subprocess, random

HERE = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms')
OUT = os.path.join(HERE, 'stage'); os.makedirs(OUT, exist_ok=True)
LOGF = os.path.join(HERE, 'stage_log.txt')
def log(*a):
    with open(LOGF, 'a') as f: f.write(time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a) + '\n')

if not bpy.app.background:   # in the UI: build in a background Blender instead
    open(LOGF, 'w').write('stage: starting a background Blender\n')
    p = subprocess.Popen([bpy.app.binary_path, '--background', '--factory-startup', '--python', os.path.join(HERE, 'blender_stage.py')],
                         stdout=open(os.path.join(HERE, 'stage_bg.txt'), 'w'), stderr=subprocess.STDOUT, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    print('STAGE BACKGROUND STARTED', p.pid)
else:
    def lin(h):
        h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c)
    def mat(name, hexc, rough=.7, metal=0.0):
        m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*lin(hexc), 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
        return m
    def ring_band(bm, r_out, z0, z1, seg, mi, r_in=None, a0=0.0, a1=2 * math.pi, caps=True):
        """A band of a cylinder (or a ring sector when r_in is given) from z0 to z1, faces given material index mi."""
        n = max(2, seg); out = []
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / n; c, s = math.cos(a), math.sin(a)
            vb = bm.verts.new((r_out * c, r_out * s, z0)); vt = bm.verts.new((r_out * c, r_out * s, z1))
            ib = it = None
            if r_in is not None: ib = bm.verts.new((r_in * c, r_in * s, z0)); it = bm.verts.new((r_in * c, r_in * s, z1))
            out.append((vb, vt, ib, it))
        faces = []
        for i in range(n):
            (b0, t0, ib0, it0), (b1, t1, ib1, it1) = out[i], out[i + 1]
            faces.append(bm.faces.new((b0, b1, t1, t0)))                          # outside
            if r_in is not None:
                faces.append(bm.faces.new((it0, it1, ib1, ib0)))                  # inside
                faces.append(bm.faces.new((t0, t1, it1, it0)))                    # top
        if r_in is not None and (a1 - a0) < 2 * math.pi - 1e-6:                  # the ends of a sector
            (b0, t0, ib0, it0), (b1, t1, ib1, it1) = out[0], out[-1]
            faces.append(bm.faces.new((ib0, b0, t0, it0))); faces.append(bm.faces.new((b1, ib1, it1, t1)))
        if r_in is None and caps:
            faces.append(bm.faces.new([v[1] for v in out[:-1]]))                 # top cap
        for f in faces: f.material_index = mi
        return faces
    def disc(bm, r, z, seg, mi, jitter=None):
        vs = [bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)]
        f = bm.faces.new(vs); f.material_index = mi; return f
    try:
        open(LOGF, 'a').write('stage build %s background=%s\n' % (bpy.app.version_string, bpy.app.background))
        for o in list(bpy.context.scene.objects): bpy.data.objects.remove(o, do_unlink=True)
        M = [mat('st_asphalt', '#2b2c2f', .92), mat('st_yellow', '#f2b705', .45), mat('st_black', '#17171a', .55), mat('st_white', '#efece4', .6), mat('st_concrete', '#8f8b84', .95)]
        ASP, YEL, BLK, WHT, CON = range(5)
        SEG = 72
        bm = bmesh.new()
        # the asphalt slab
        ring_band(bm, .70, 0.0, .035, SEG, ASP)
        # the plinth: danfo yellow with two black bands
        R = .585
        for z0, z1, m in ((.035, .095, YEL), (.095, .118, BLK), (.118, .168, YEL), (.168, .191, BLK), (.191, .232, YEL)):
            ring_band(bm, R, z0, z1, SEG, m, caps=False)
        # a little lip under the kerb ring
        disc(bm, R, .232, SEG, YEL)
        # the kerb ring: 24 pieces, black and white
        N = 24
        for i in range(N):
            a0 = 2 * math.pi * i / N + .006; a1 = 2 * math.pi * (i + 1) / N - .006
            ring_band(bm, R - .006, .232, .262, 4, BLK if i % 2 else WHT, r_in=.47, a0=a0, a1=a1)
        # the concrete top, a touch lower than the kerb
        ring_band(bm, .47, .232, .252, SEG, CON)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new('stage'); bm.to_mesh(me); bm.free()
        for m in M: me.materials.append(m)
        ob = bpy.data.objects.new('stage', me); bpy.context.scene.collection.objects.link(ob)
        bpy.context.view_layer.objects.active = ob; ob.select_set(True)
        bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = .006; bv.segments = 2; bv.limit_method = 'ANGLE'; bv.angle_limit = math.radians(50)
        bpy.ops.object.modifier_apply(modifier='bevel')
        for p in me.polygons: p.use_smooth = False
        # smooth shading on the round sides only (the side faces are vertical)
        for p in me.polygons: p.use_smooth = abs(p.normal.z) < .2
        path = os.path.join(OUT, 'stage.glb')
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
        log('exported', path, len(me.polygons), 'faces', round(os.path.getsize(path) / 1024, 1), 'KB')
        # a picture to check it by
        try:
            sc = bpy.context.scene; cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
            cam.location = (1.55, -1.75, 1.05); cam.rotation_euler = (math.radians(68), 0, math.radians(41))
            sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.2; sun.rotation_euler = (math.radians(45), 0, math.radians(30)); sc.collection.objects.link(sun)
            if sc.world is None: sc.world = bpy.data.worlds.new('w')
            sc.world.use_nodes = True; bg = sc.world.node_tree.nodes.get('Background')
            if bg: bg.inputs[0].default_value = (.12, .11, .16, 1); bg.inputs[1].default_value = 1.0
            sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
            sc.render.resolution_x, sc.render.resolution_y = 900, 600; sc.render.filepath = os.path.join(OUT, 'stage_preview.png')
            bpy.ops.render.render(write_still=True)
        except Exception: log('preview failed', traceback.format_exc())
        log('ALL DONE'); print('STAGE OK')
    except Exception:
        log('FAILED', traceback.format_exc()); print(traceback.format_exc())
