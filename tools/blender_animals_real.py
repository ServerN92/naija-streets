# Naija Streets: realistic farm animals, rigged and animated in Blender.
# Takes the photo-real scanned models (Sketchfab, CC-BY: credit in README) that were imported into the open
# Blender file, and turns each into a game animal like the hand-made ones in tools/blender_farm.py:
#   brown zebu cow (Bororo / Red Fulani look)  -> fm_cow.glb
#   Holstein (black and white)                  -> fm_cow2.glb
#   hen                                         -> fm_hen.glb
# Steps for each: copy the mesh, turn it to face -Y with its feet on the ground, lighten it for phones (decimate,
# smaller texture), measure where its legs, belly, neck, head and tail are, build the same skeleton as the
# hand-made animal there (same bone names, so the same moves work), weight every vertex to its nearest bones
# (legs only take vertices on their own side), then add Idle / Walk / Graze (cow) or Idle / Walk / Peck (hen)
# from tools/blender_farm.py and export a GLB with the texture as JPEG.
# Run inside Blender with SRC = {'zebu': 'SRC_zebu', ...} naming the imported models' root objects.
import bpy, math, os, time, traceback
from mathutils import Vector, Matrix

HERE = globals().get('HERE') or os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms')
LIBG = {'__name__': 'farm_lib', 'LIB': True}
exec(compile(open(os.path.join(HERE, 'blender_farm.py'), encoding='utf-8').read(), 'blender_farm.py', 'exec'), LIBG)
OUT, log, make_arm, cow_actions, hen_actions = LIBG['OUT'], LIBG['log'], LIBG['make_arm'], LIBG['cow_actions'], LIBG['hen_actions']
SRC = globals().get('SRC') or {'zebu': 'SRC_zebu', 'holstein': 'SRC_holstein', 'hen': 'SRC_brownhen'}
JOBS = {'zebu': ('fm_cow', 'cow', 9000, 1024), 'holstein': ('fm_cow2', 'cow', 9000, 1024), 'hen': ('fm_hen', 'hen', 4000, 512)}


def desc(o):
    out = [o]
    for c in o.children: out += desc(c)
    return out


def prep(key, sc):
    """A clean copy of the scanned mesh: facing -Y, centred, feet at z=0, lighter, its own small texture."""
    name, kind, faces, tex = JOBS[key]
    root = bpy.data.objects[SRC[key]]; src = [o for o in desc(root) if o.type == 'MESH'][0]
    me = src.data.copy(); me.name = name + '_mesh'; me.transform(src.matrix_world)
    me.transform(Matrix.Rotation(-math.pi / 2, 4, 'Z'))          # the scans face +X; the game's animals face -Y
    vs = [v.co for v in me.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))); mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    me.transform(Matrix.Translation((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z)))
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    if len(me.polygons) > faces:
        d = ob.modifiers.new('dec', 'DECIMATE'); d.ratio = faces / len(me.polygons); d.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=d.name)
    for p in ob.data.polygons: p.use_smooth = True
    # its own material with a smaller copy of the texture
    m0 = ob.data.materials[0]; m = m0.copy(); m.name = name + '_mat'; ob.data.materials[0] = m
    for n in m.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            im = n.image.copy(); im.name = name + '_tex'; im.scale(tex, tex); im.pack(); n.image = im
    b = m.node_tree.nodes.get('Principled BSDF')
    if b: b.inputs['Roughness'].default_value = .85; b.inputs['Metallic'].default_value = 0
    return ob, kind


def measure_cow(ob):
    vs = [v.co.copy() for v in ob.data.vertices]
    H = max(v.z for v in vs); y0 = min(v.y for v in vs); y1 = max(v.y for v in vs); L = y1 - y0
    low = [v for v in vs if v.z < .14 * H and abs(v.x) > .08]   # the hooves (not the tail tuft, which can hang down between them)
    ym = (min(v.y for v in low) + max(v.y for v in low)) / 2
    def cen(f):
        q = [v for v in low if f(v)] or [Vector((0, 0, 0))]; return Vector((sum(v.x for v in q) / len(q), sum(v.y for v in q) / len(q), 0))
    FL, FR = cen(lambda v: v.y < ym and v.x < 0), cen(lambda v: v.y < ym and v.x >= 0)
    BL, BR = cen(lambda v: v.y >= ym and v.x < 0), cen(lambda v: v.y >= ym and v.x >= 0)
    mid = [v for v in vs if abs(v.x) < .1 and abs(v.y - (FL.y + BL.y) / 2) < .12 * L]
    belly = min(v.z for v in mid) if mid else .5 * H
    back = max(v.z for v in mid) if mid else .9 * H
    sp = (belly + back) / 2                                                       # the spine runs through the middle of the barrel
    head = [v for v in vs if v.y < y0 + .12 * L]; hc = sum(head, Vector()) / len(head)
    tailr = [v for v in vs if v.y > y1 - .05 * L and abs(v.x) < .12]; tz0 = max(v.z for v in tailr); tz1 = min(v.z for v in tailr)
    fy, by = (FL.y + FR.y) / 2, (BL.y + BR.y) / 2
    up = lambda c, z0, z1: (Vector((c.x, c.y, z0)), Vector((c.x, c.y, z1)))
    kneeF, kneeB, top = .3 * H, .33 * H, .55 * H   # shoulder/hip, knee and hock heights (the udder hangs too low to measure the belly by)
    B = [('root', None, (0, 0, sp), (0, -.3, sp)),
         ('body', 'root', (0, by + .05, sp + .05 * H), (0, fy - .05, sp + .05 * H)),
         ('neck', 'body', (0, fy + .02 * L, sp + .08 * H), (0, hc.y + .1 * L, hc.z + .04 * H)),   # pivots at the shoulder, so the mouth reaches the grass
         ('head', 'neck', (0, hc.y + .1 * L, hc.z + .04 * H), (0, y0 + .01, hc.z - .06 * H)),
         ('tail', 'body', (0, y1 - .05 * L, tz0 - .02), (0, y1 - .02 * L, tz1))]
    for n, c, kz in (('fl', FL, kneeF), ('fr', FR, kneeF), ('bl', BL, kneeB), ('br', BR, kneeB)):
        a, b = up(c, top, kz); B.append((n + '_u', 'body', tuple(a), tuple(b)))
        a, b = up(c, kz, 0.0); B.append((n + '_l', n + '_u', tuple(a), tuple(b)))
    return B


def measure_hen(ob):
    vs = [v.co.copy() for v in ob.data.vertices]
    H = max(v.z for v in vs); W = max(v.x for v in vs) - min(v.x for v in vs); y0 = min(v.y for v in vs); y1 = max(v.y for v in vs); L = y1 - y0
    low = [v for v in vs if v.z < .2 * H]
    def cen(f):
        q = [v for v in low if f(v)] or [Vector((0, 0, 0))]; return Vector((sum(v.x for v in q) / len(q), sum(v.y for v in q) / len(q), 0))
    lL, lR = cen(lambda v: v.x < 0), cen(lambda v: v.x >= 0)
    body = [v for v in vs if .3 * H < v.z < .7 * H]; bz0 = min(v.z for v in body); bc = sum(body, Vector()) / len(body)
    head = [v for v in vs if v.z > .8 * H]; hc = sum(head, Vector()) / len(head)
    tail = [v for v in vs if v.y > y1 - .22 * L and v.z > .55 * H] or [Vector((0, y1, .7 * H))]; tc = sum(tail, Vector()) / len(tail); tz = max(v.z for v in tail)
    hip = bz0 + .03
    return [('root', None, (0, bc.y, hip), (0, bc.y - .1, hip)),
            ('body', 'root', (0, bc.y + .08, bc.z), (0, bc.y - .08, bc.z)),
            ('head', 'body', (0, hc.y + .06, .62 * H), (0, hc.y, H * .98)),
            ('tail', 'body', (0, tc.y - .08, .6 * H), (0, y1 - .01, tz)),
            ('wing_l', 'body', (-.32 * W, bc.y - .04, .62 * H), (-.38 * W, tc.y - .02, .55 * H)),
            ('wing_r', 'body', (.32 * W, bc.y - .04, .62 * H), (.38 * W, tc.y - .02, .55 * H)),
            ('leg_l', 'root', (lL.x, lL.y, hip), (lL.x, lL.y, 0)), ('leg_r', 'root', (lR.x, lR.y, hip), (lR.x, lR.y, 0))]


def segd(p, a, b):
    ab = b - a; t = max(0, min(1, (p - a).dot(ab) / max(ab.length_squared, 1e-9))); return (p - (a + ab * t)).length


def weigh(ob, bones, kind):
    """Each vertex to its nearest bones (inverse distance^4, best three). Legs and wings only take vertices on their own
    side (and, for a cow, their own end); the leg bones take nothing above the belly line."""
    for (n, *_r) in bones: ob.vertex_groups.new(name=n)
    seg = {n: (Vector(h), Vector(t)) for (n, _p, h, t) in bones}
    legtop = max(seg[n][0].z for n in seg if n.endswith('_u') or n.startswith('leg'))
    ys = [seg[n][0].y for n in seg if n.endswith('_u')]
    ymid = (min(ys) + max(ys)) / 2 if ys else 0
    for v in ob.data.vertices:
        p = v.co; cand = []
        for n, (a, b) in seg.items():
            if n == 'root' and kind == 'cow': continue
            side = n.endswith('_l') and n.startswith('wing') or n[:2] in ('fl', 'bl') or n == 'leg_l'
            rside = n.endswith('_r') and n.startswith('wing') or n[:2] in ('fr', 'br') or n == 'leg_r'
            if side and p.x > .02: continue
            if rside and p.x < -.02: continue
            if kind == 'cow' and n[:1] == 'f' and n[1:2] in ('l', 'r') and p.y > ymid + .1: continue
            if kind == 'cow' and n[:1] == 'b' and n[1:2] in ('l', 'r') and p.y < ymid - .1: continue
            if (n.endswith('_u') or n.endswith('_l') and not n.startswith('wing') or n.startswith('leg')) and p.z > legtop + .06: continue
            if kind == 'cow' and (n.endswith('_u') or n.endswith('_l')) and n[:1] in 'fb' and n[1:2] in ('l', 'r'):
                if n.endswith('_u') and abs(p.x) < abs(a.x) - .08 and p.z > b.z + .05: continue      # belly, udder, sheath and dewlap stay with the body
                if abs(p.y - a.y) > .26: continue                                 # and so does the barrel between the legs
                if abs(p.x) < .06: continue                                       # the tail hangs on the middle line, between the hind legs
            d = segd(p, a, b); cand.append((1 / (d + .015) ** 4, n))
        cand.sort(reverse=True); cand = cand[:3]; tot = sum(w for w, _ in cand) or 1
        for w, n in cand: ob.vertex_groups[n].add([v.index], w / tot, 'REPLACE')


S_, PI_ = math.sin, math.pi
def real_cow_actions(arm):
    """The hand-made cow's Walk and Idle, and a deeper Graze: the neck swings down from the shoulder till the
    mouth is in the grass, the head nods as it tears, the jaw chews, the tail swats flies."""
    cow_actions(arm)   # Walk, Idle, Graze; Graze is replaced below
    ad = arm.animation_data
    for t in list(ad.nla_tracks):
        if t.name == 'Graze': ad.nla_tracks.remove(t)
    def graze(t):
        w = 2 * PI_ * t; P = {}
        tear = max(0, S_(4 * w)) ** 3
        P['neck'] = (GRAZE_NECK + .04 * S_(2 * w), 0, .1 * S_(w), None); P['head'] = (GRAZE_HEAD + .12 * tear, 0, .05 * S_(4 * w), None)
        P['body'] = (.03, 0, 0, None)
        P['tail'] = (0, .45 * S_(2 * w) * (1 if (t * 2) % 1 < .5 else .3), .15 * S_(2 * w + .5), None); return P
    LIBG['actions'](arm, {'Graze': (48, graze)})
def real_hen_actions(arm):
    """The hand-made hen's Walk and Idle, and a real Peck: she tips forward and drives her beak into the ground, twice."""
    hen_actions(arm)
    ad = arm.animation_data
    for t in list(ad.nla_tracks):
        if t.name == 'Peck': ad.nla_tracks.remove(t)
    def peck(t):
        w = 2 * PI_ * t; P = {}
        dip = max(0, S_(3 * w)) ** 2
        P['root'] = (PECK_BODY * (.6 + .4 * dip), 0, 0, None); P['head'] = (PECK_HEAD * dip + .25, 0, 0, None)
        P['tail'] = (.2, 0, 0, None); P['leg_l'] = (-PECK_BODY * (.6 + .4 * dip), 0, 0, None); P['leg_r'] = (-PECK_BODY * (.6 + .4 * dip), 0, 0, None); return P
    LIBG['actions'](arm, {'Peck': (36, peck)})
GRAZE_NECK = globals().get('GRAZE_NECK', 1.25); GRAZE_HEAD = globals().get('GRAZE_HEAD', .3)
PECK_BODY = globals().get('PECK_BODY', -.45); PECK_HEAD = globals().get('PECK_HEAD', 1.2)


def export(arm, ob, name):
    for s2 in bpy.data.scenes:   # nothing else selected anywhere (another scene's selection can leak into the file)
        for vl in s2.view_layers:
            for o in s2.objects:
                try: o.select_set(False, view_layer=vl)
                except Exception: pass
    bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); ob.select_set(True); bpy.context.view_layer.objects.active = arm
    path = os.path.join(OUT, name + '.glb')
    args = dict(filepath=path, use_selection=True, export_format='GLB', export_yup=True, export_apply=False, export_texcoords=True, export_normals=True,
                export_animations=True, export_skins=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_def_bones=False,
                export_image_format='JPEG', export_jpeg_quality=82)
    for drop in ([], ['export_jpeg_quality'], ['export_jpeg_quality', 'export_def_bones']):
        try: bpy.ops.export_scene.gltf(**{k: v for k, v in args.items() if k not in drop}); break
        except TypeError as e: log('export retry', name, e)
    return os.path.getsize(path) // 1024


try:
    open(os.path.join(HERE, 'animals_log.txt'), 'w').write('animals start\n')
    def alog(*a):
        with open(os.path.join(HERE, 'animals_log.txt'), 'a') as f: f.write(time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a) + '\n')
    win = bpy.context.window; old = win.scene if win else None
    sc = bpy.data.scenes.get('NS Animals') or bpy.data.scenes.new('NS Animals')
    if win: win.scene = sc
    for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        if a.name.startswith(('fm_cow', 'fm_hen')): bpy.data.actions.remove(a)
    for i, key in enumerate(globals().get('ONLY') or list(JOBS)):
        t0 = time.time()
        ob, kind = prep(key, sc)
        bones = measure_cow(ob) if kind == 'cow' else measure_hen(ob)
        arm = make_arm(JOBS[key][0], bones); weigh(ob, bones, kind)
        ob.parent = arm; md = ob.modifiers.new('Armature', 'ARMATURE'); md.object = arm
        (real_cow_actions if kind == 'cow' else real_hen_actions)(arm)
        kb = export(arm, ob, JOBS[key][0])
        arm.location = (i * 3.5, 0, 0)
        alog(key, JOBS[key][0], len(ob.data.polygons), 'faces', len(arm.data.bones), 'bones', [t.name for t in arm.animation_data.nla_tracks], kb, 'KB', round(time.time() - t0, 1), 's')
        alog('  bones', [(n, tuple(round(x, 2) for x in h), tuple(round(x, 2) for x in t)) for (n, _p, h, t) in bones])
    alog('ALL DONE')
except Exception:
    with open(os.path.join(HERE, 'animals_log.txt'), 'a') as f: f.write('FAILED ' + traceback.format_exc())
