"""Naija Streets: turn the Blender room into a full Lagos flat.

Run inside Blender (Scripting > Python console):
    exec(open(r'C:\\Users\\DELL\\Downloads\\naija_room\\build_flat.py').read())

What it does
  * saves a backup copy of your file first (room_before_flat.blend, only the first time)
  * your room becomes the BEDROOM: sofa + coffee table move to the sitting room, the door opens into a hallway,
    a wardrobe (with a mirror door), split AC and curtains are added
  * builds a SITTING ROOM (TV wall, sofas, armchair, rug, chandelier, POP ceiling with LED, standing AC,
    dining table for 6, sideboard, shoe rack, front door), a KITCHEN (cabinets, granite tops, sink, gas cooker,
    hood, fridge, microwave, kettle, blender, pots, gas cylinder), a BATHROOM (toilet, vanity, mirror, shower,
    water heater, bucket and bowl, towel rail) and a HALLWAY
  * everything new goes into the "Flat" collection; objects it replaced go to "Flat_Hidden_Originals" (hidden)
  * running it again rebuilds the new parts cleanly (your own objects are never deleted)
  * exports room.glb for the game and saves a copy naija_flat.blend
Outside Blender (plain python) it draws a floor plan picture instead, for checking the layout.
"""
import math, os, sys, json, traceback
try:
    import bpy, bmesh
    from mathutils import Matrix, Vector, Euler
    HAVE = True
except ImportError:
    HAVE = False

OUT = r'C:\Users\DELL\Downloads\naija_room'
TEXDIR = os.path.join(OUT, 'tex')
LOG, REC = [], []
def log(*a): LOG.append(' '.join(str(x) for x in a))
rad = math.radians

# ------------------------------------------------------------------ materials
MATS = {}
def M(name, color=(.8, .8, .8), rough=.5, metal=0., emit=None, estr=0., tex=None, T=1.0, keep=False):
    """keep=True: an existing material in your file with this name is used as it is"""
    MATS[name] = dict(color=color, rough=rough, metal=metal, emit=emit, estr=estr, tex=tex, T=T, keep=keep)
    return name
# yours (used as they are; colours here only for the plan picture / if missing)
PLASTER = M('Wall Plaster', (.82, .78, .70), .85, keep=True)
WALNUT = M('Walnut', (.30, .17, .09), .45, keep=True)
OAK = M('Oak Floor', (.62, .45, .28), .4, keep=True)
BLACK = M('Black Metal', (.03, .03, .03), .35, .8, keep=True)
BRASS = M('Brass', (.8, .6, .25), .3, 1., keep=True)
FABRIC = M('Sofa Fabric', (.55, .42, .30), .9, keep=True)
RUG = M('Rug', (.35, .30, .42), .95, keep=True)
GLASS = M('Glass', (.9, .95, 1.), .05, keep=True)
WFRAME = M('Window Frame', (.92, .92, .9), .5, keep=True)
SHADE = M('Lamp Shade', (1., .9, .75), .6, emit=(1., .85, .6), estr=6., keep=True)
CERAMIC = M('Ceramic', (.85, .83, .8), .3, keep=True)
SCREEN = M('Screen', (.02, .02, .025), .15, keep=True)
LEAVES = M('Leaves', (.12, .35, .12), .6, keep=True)
ART1 = M('Art 1', (.7, .45, .2), .7, keep=True)
ART2 = M('Art 2', (.2, .4, .5), .7, keep=True)
CEIL = M('Ceiling', (.9, .9, .88), .9, keep=True)
# new
FTILE = M('Floor Tile', (.86, .82, .74), .22, tex='tile_floor.jpg', T=1.2)
BTILE = M('Bath Tile', (.88, .87, .85), .15, tex='tile_bath.jpg', T=.6)
BFLOOR = M('Bath Floor', (.3, .3, .31), .5, tex='tile_bathfloor.jpg', T=.6)
KTILE = M('Kitchen Tile', (.92, .92, .9), .12, tex='tile_kitchen.jpg', T=.6)
GRANITE = M('Granite', (.16, .15, .14), .25, tex='granite.jpg', T=1.0)
CABG = M('Cabinet Green', (.16, .26, .21), .5)
CABW = M('Cabinet White', (.85, .84, .80), .35)
STEEL = M('Steel', (.72, .72, .72), .3, 1.)
BGLASS = M('Black Glass', (.01, .01, .012), .08)
CHROME = M('Chrome', (.85, .85, .85), .08, 1.)
PORC = M('Porcelain White', (.93, .93, .91), .12)
MIRROR = M('Mirror', (.95, .95, .95), .02, 1.)
PLASTIC = M('Plastic White', (.9, .9, .88), .4)
CYL = M('Gas Cylinder', (.08, .42, .22), .35, .4)
BUCKET = M('Bucket Blue', (.04, .22, .7), .4)
BOWLR = M('Bowl Red', (.75, .08, .06), .4)
TOWEL = M('Towel', (.8, .55, .18), .95)
CURTAIN = M('Curtain', (.72, .64, .5), .95)
PILLOW1 = M('Pillow Mustard', (.78, .52, .1), .9)
PILLOW2 = M('Pillow Green', (.12, .32, .22), .9)
DCHAIR = M('Dining Chair', (.1, .24, .19), .85)
RUGS = M('Rug Sitting', (.48, .32, .24), .95)
LED = M('LED Strip', (1., .82, .6), .5, emit=(1., .8, .55), estr=4.)
POPM = M('POP Ceiling', (.93, .93, .91), .9)
FDOOR = M('Front Door', (.2, .11, .06), .45)
FDOORP = M('Front Door Panel', (.13, .07, .04), .5)
DFRAME = M('Door Frame', (.9, .89, .86), .5)
FROST = M('Frosted Glass', (.86, .9, .92), .5, emit=(.8, .85, .9), estr=.35)
TVPANEL = M('Panel Dark', (.06, .06, .065), .6)
TVSCREEN = M('TV Screen', (.02, .025, .035), .1, emit=(.05, .08, .14), estr=1.)
WARDF = M('Wardrobe Front', (.78, .74, .66), .55)
FRUIT = M('Fruit Orange', (.9, .45, .05), .5)
SHOE1 = M('Leather Brown', (.28, .14, .06), .5)
SHOE2 = M('Sneaker White', (.9, .9, .9), .6)
ACLED = M('AC Display', (.2, .6, 1.), .3, emit=(.2, .6, 1.), estr=3.)
LOCKER = M('Cooker Silver', (.75, .75, .74), .35, .8)

# ------------------------------------------------------------------ shapes (local coordinates)
def B(x0, x1, y0, y1, z0, z1, rot=None):
    return dict(k='box', x0=min(x0, x1), x1=max(x0, x1), y0=min(y0, y1), y1=max(y0, y1), z0=min(z0, z1), z1=max(z0, z1), rot=rot)
def C(x, y, z, h, r, axis='Z', r2=None, seg=20, sx=1., sy=1., open_top=False):
    """cylinder/cone centred at (x,y,z), length h along axis; r at the start (bottom), r2 at the end (top)"""
    return dict(k='cyl', c=(x, y, z), h=h, r=r, r2=r if r2 is None else r2, axis=axis, seg=seg, sx=sx, sy=sy, open_top=open_top)
def S(x, y, z, rx, ry, rz, seg=12):
    return dict(k='sph', c=(x, y, z), r=(rx, ry, rz), seg=seg)
def CURT(axis, a0, a1, b, z0, z1, amp=.035, folds=None):
    """a pleated curtain: hangs from z1 to z0 along axis ('x' or 'y') between a0 and a1, at wall-normal position b"""
    return dict(k='curt', axis=axis, a0=a0, a1=a1, b=b, z0=z0, z1=z1, amp=amp, folds=folds or max(3, int(abs(a1 - a0) / .1)))

def shape_aabb(s):
    k = s['k']
    if k == 'box':
        return (s['x0'], s['x1'], s['y0'], s['y1'], s['z0'], s['z1'])
    if k == 'cyl':
        x, y, z = s['c']; r = max(s['r'], s['r2']); h = s['h'] / 2
        if s['axis'] == 'Z': return (x - r * s['sx'], x + r * s['sx'], y - r * s['sy'], y + r * s['sy'], z - h, z + h)
        if s['axis'] == 'X': return (x - h, x + h, y - r, y + r, z - r, z + r)
        return (x - r, x + r, y - h, y + h, z - r, z + r)
    if k == 'sph':
        x, y, z = s['c']; a, b, c = s['r']; return (x - a, x + a, y - b, y + b, z - c, z + c)
    if k == 'curt':
        if s['axis'] == 'x': return (min(s['a0'], s['a1']), max(s['a0'], s['a1']), s['b'] - s['amp'], s['b'] + s['amp'], s['z0'], s['z1'])
        return (s['b'] - s['amp'], s['b'] + s['amp'], min(s['a0'], s['a1']), max(s['a0'], s['a1']), s['z0'], s['z1'])

def world_aabb(shapes, loc, rotz):
    xs, ys, zs = [], [], []; c, s_ = math.cos(rad(rotz)), math.sin(rad(rotz))
    for s in shapes:
        x0, x1, y0, y1, z0, z1 = shape_aabb(s)
        for x in (x0, x1):
            for y in (y0, y1):
                xs.append(loc[0] + x * c - y * s_); ys.append(loc[1] + x * s_ + y * c)
        zs += [loc[2] + z0, loc[2] + z1]
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))

# ------------------------------------------------------------------ Blender side
_matcache = {}
def setin(node, names, val):
    for n in (names if isinstance(names, (list, tuple)) else [names]):
        if n in node.inputs:
            try: node.inputs[n].default_value = val; return True
            except Exception: pass
    return False

def get_mat(name):
    if name in _matcache: return _matcache[name]
    spec = MATS.get(name, dict(color=(.7, .7, .7), rough=.5, metal=0., emit=None, estr=0., tex=None, T=1., keep=False))
    m = bpy.data.materials.get(name)
    if m and (spec['keep'] or not m.get('nf_gen')):
        _matcache[name] = m; return m
    if not m:
        m = bpy.data.materials.new(name); m['nf_gen'] = 1
    try: m.use_nodes = True
    except Exception: pass
    nt = m.node_tree; nodes = nt.nodes
    for n in list(nodes): nodes.remove(n)
    out = nodes.new('ShaderNodeOutputMaterial'); out.location = (400, 0)
    b = nodes.new('ShaderNodeBsdfPrincipled'); b.location = (100, 0)
    nt.links.new(b.outputs[0], out.inputs[0])
    col = spec['color']
    setin(b, 'Base Color', (col[0], col[1], col[2], 1.)); setin(b, 'Roughness', spec['rough']); setin(b, 'Metallic', spec['metal'])
    if spec['emit']:
        e = spec['emit']; setin(b, ['Emission Color', 'Emission'], (e[0], e[1], e[2], 1.)); setin(b, 'Emission Strength', spec['estr'])
    if spec['tex']:
        p = os.path.join(TEXDIR, spec['tex'])
        if os.path.exists(p):
            img = bpy.data.images.load(p, check_existing=True)
            t = nodes.new('ShaderNodeTexImage'); t.location = (-250, 100); t.image = img
            try: t.projection = 'BOX'; t.projection_blend = .2
            except Exception: pass
            g = nodes.new('ShaderNodeNewGeometry'); g.location = (-650, 100)
            mp = nodes.new('ShaderNodeMapping'); mp.location = (-450, 100)
            s = 1. / spec['T']
            try: mp.inputs['Scale'].default_value = (s, s, s)
            except Exception: pass
            nt.links.new(g.outputs['Position'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
            nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
        else:
            log('missing texture', p)
    try: m.diffuse_color = (col[0], col[1], col[2], 1.); m.roughness = spec['rough']; m.metallic = spec['metal']
    except Exception: pass
    _matcache[name] = m; return m

def bm_add(bm, s):
    k = s['k']
    if k == 'box':
        r = bmesh.ops.create_cube(bm, size=1.0); vs = r['verts']
        bmesh.ops.scale(bm, vec=(s['x1'] - s['x0'], s['y1'] - s['y0'], s['z1'] - s['z0']), verts=vs)
        if s.get('rot'): bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Euler([rad(a) for a in s['rot']]).to_matrix(), verts=vs)
        bmesh.ops.translate(bm, vec=((s['x0'] + s['x1']) / 2, (s['y0'] + s['y1']) / 2, (s['z0'] + s['z1']) / 2), verts=vs)
        return False
    if k == 'cyl':
        r = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=s['seg'], radius1=s['r'], radius2=s['r2'], depth=s['h']); vs = r['verts']
        if s['sx'] != 1 or s['sy'] != 1: bmesh.ops.scale(bm, vec=(s['sx'], s['sy'], 1), verts=vs)
        faces = list({f for v in vs for f in v.link_faces})
        for f in faces: f.smooth = True
        if s['open_top']:
            top = [f for f in faces if len(f.verts) > 4 and f.calc_center_median().z > s['h'] / 2 - 1e-4]
            if top: bmesh.ops.delete(bm, geom=top, context='FACES_ONLY')
        if s['axis'] == 'X': bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(rad(90), 3, 'Y'), verts=vs)
        elif s['axis'] == 'Y': bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(rad(-90), 3, 'X'), verts=vs)
        bmesh.ops.translate(bm, vec=s['c'], verts=vs)
        return True
    if k == 'sph':
        r = bmesh.ops.create_uvsphere(bm, u_segments=s['seg'], v_segments=max(4, s['seg'] // 2), radius=1.0); vs = r['verts']
        bmesh.ops.scale(bm, vec=s['r'], verts=vs)
        for f in {f for v in vs for f in v.link_faces}: f.smooth = True
        bmesh.ops.translate(bm, vec=s['c'], verts=vs)
        return True
    if k == 'curt':
        n = s['folds'] * 4; cols = []
        for i in range(n + 1):
            u = i / n; a = s['a0'] + (s['a1'] - s['a0']) * u; w = s['b'] + s['amp'] * math.sin(u * s['folds'] * 2 * math.pi)
            p0 = (a, w, s['z0']) if s['axis'] == 'x' else (w, a, s['z0']); p1 = (a, w, s['z1']) if s['axis'] == 'x' else (w, a, s['z1'])
            cols.append((bm.verts.new(p0), bm.verts.new(p1)))
        for i in range(n):
            f = bm.faces.new((cols[i][0], cols[i + 1][0], cols[i + 1][1], cols[i][1])); f.smooth = True
        return True

COLLS = {}
def coll(name):
    if name in COLLS: return COLLS[name]
    if not HAVE: COLLS[name] = name; return name
    root = bpy.data.collections.get('Flat')
    if not root:
        root = bpy.data.collections.new('Flat')
    if bpy.context.scene.collection.children.get('Flat') is None: bpy.context.scene.collection.children.link(root)
    c = bpy.data.collections.get(name)
    if not c: c = bpy.data.collections.new(name)
    if root.children.get(name) is None: root.children.link(c)
    COLLS[name] = c; return c

def obj(name, cname, mat, shapes, loc=(0, 0, 0), rotz=0., bevel=0.):
    if isinstance(shapes, dict): shapes = [shapes]
    aabb = world_aabb(shapes, loc, rotz)
    REC.append(dict(name=name, coll=cname, mat=mat, aabb=aabb, parts=[world_aabb([q], loc, rotz) for q in shapes]))
    if not HAVE: return None
    bm = bmesh.new(); smooth = False
    for s in shapes: smooth = bm_add(bm, s) or smooth
    bm.normal_update()
    me = bpy.data.meshes.new('NF_' + name); bm.to_mesh(me); bm.free()
    if smooth:
        try: me.set_sharp_from_angle(angle=rad(48))
        except Exception: pass
    me.materials.append(get_mat(mat))
    o = bpy.data.objects.new(name, me); coll(cname).objects.link(o)
    o.location = loc; o.rotation_euler = (0, 0, rad(rotz))
    if bevel:
        dims = [aabb[1] - aabb[0], aabb[3] - aabb[2], aabb[5] - aabb[4]]
        md = o.modifiers.new('Bevel', 'BEVEL'); md.width = bevel; md.segments = 2
        try: md.limit_method = 'ANGLE'; md.angle_limit = rad(35)
        except Exception: pass
    return o

def light(name, x, y, z, watts, color=(1., .85, .7)):
    if not HAVE: return
    ld = bpy.data.lights.new('NF_' + name, 'POINT'); ld.energy = watts; ld.color = color
    try: ld.shadow_soft_size = .15
    except Exception: pass
    o = bpy.data.objects.new(name, ld); coll('Flat_Lights').objects.link(o); o.location = (x, y, z)

# ------------------------------------------------------------------ building helpers
H, T = 3.0, .15
def wall(name, cn, axis, a0, a1, b0, b1, holes=(), mat=PLASTER):
    """axis 'x': runs along X from a0 to a1, thickness Y b0..b1. holes: (h0,h1,z0,z1) along the run"""
    segs, cur = [], a0
    for (h0, h1, z0, z1) in sorted(holes):
        if h0 > cur + 1e-6: segs.append((cur, h0, 0, H))
        if z0 > 1e-6: segs.append((h0, h1, 0, z0))
        if z1 < H - 1e-6: segs.append((h0, h1, z1, H))
        cur = h1
    if cur < a1 - 1e-6: segs.append((cur, a1, 0, H))
    for i, (s0, s1, z0, z1) in enumerate(segs):
        obj(f'Wall_{name}_{i}', cn, mat, B(s0, s1, b0, b1, z0, z1) if axis == 'x' else B(b0, b1, s0, s1, z0, z1))

def door_frame(name, cn, axis, h0, h1, ztop, b0, b1, mat=DFRAME):
    """lining inside the opening and casings on both faces"""
    sh = []
    def bx(a0, a1, c0, c1, z0, z1): sh.append(B(a0, a1, c0, c1, z0, z1) if axis == 'x' else B(c0, c1, a0, a1, z0, z1))
    bx(h0, h0 + .02, b0, b1, 0, ztop); bx(h1 - .02, h1, b0, b1, 0, ztop); bx(h0, h1, b0, b1, ztop - .02, ztop)
    for (c0, c1) in ((b0 - .015, b0), (b1, b1 + .015)):
        bx(h0 - .07, h0, c0, c1, 0, ztop + .07); bx(h1, h1 + .07, c0, c1, 0, ztop + .07); bx(h0 - .07, h1 + .07, c0, c1, ztop, ztop + .07)
    obj(f'Frame_{name}', cn, mat, sh, bevel=.004)

def window(name, cn, axis, h0, h1, z0, z1, b0, b1, inward, frosted=False, mull=True):
    mid = (b0 + b1) / 2
    def bx(a0, a1, c0, c1, zz0, zz1): return B(a0, a1, c0, c1, zz0, zz1) if axis == 'x' else B(c0, c1, a0, a1, zz0, zz1)
    if frosted: obj(f'Window_Frosted_{name}', cn, FROST, bx(h0, h1, mid - .01, mid + .01, z0, z1))
    else: obj(f'Window_Glass_{name}', cn, GLASS, bx(h0, h1, mid - .01, mid + .01, z0, z1))
    f = .05; sh = [bx(h0, h1, mid - .04, mid + .04, z0, z0 + f), bx(h0, h1, mid - .04, mid + .04, z1 - f, z1),
                   bx(h0, h0 + f, mid - .04, mid + .04, z0, z1), bx(h1 - f, h1, mid - .04, mid + .04, z0, z1)]
    if mull and h1 - h0 > .9: m = (h0 + h1) / 2; sh.append(bx(m - .025, m + .025, mid - .04, mid + .04, z0, z1))
    if z1 - z0 > 1.2: zm = z0 + (z1 - z0) * .62; sh.append(bx(h0, h1, mid - .035, mid + .035, zm - .02, zm + .02))
    bin_ = b1 if inward > 0 else b0
    sh.append(bx(h0 - .05, h1 + .05, bin_, bin_ + .06 * inward, z0 - .03, z0))   # sill
    obj(f'WinFrame_{name}', cn, WFRAME, sh, bevel=.004)

def door_leaf(name, cn, hinge, width, angle, mat=WALNUT, handle=BRASS, th=.04, h=2.06):
    """leaf built along +X from the hinge, then turned by angle (degrees) about the hinge"""
    obj(name, cn, mat, [B(0, width, -th / 2, th / 2, .01, h)], loc=(hinge[0], hinge[1], 0), rotz=angle, bevel=.004)
    hx = width - .07
    obj(f'{name}_Handle', cn, handle, [C(hx, -th / 2 - .03, 1.0, .06, .012, axis='Y', seg=12), B(hx - .12, hx, -th / 2 - .06, -th / 2 - .045, .99, 1.01),
                                        C(hx, th / 2 + .03, 1.0, .06, .012, axis='Y', seg=12), B(hx - .12, hx, th / 2 + .045, th / 2 + .06, .99, 1.01)],
        loc=(hinge[0], hinge[1], 0), rotz=angle)

def sofa(prefix, cn, loc, rotz, W, D=.92, n=3, frame=FABRIC, cush=FABRIC, pillows=(), legs=BLACK):
    """faces +Y in its own frame (back at -Y)"""
    hw, hd = W / 2, D / 2; arm = .17
    obj(f'{prefix}_Frame', cn, frame, [B(-hw + arm, hw - arm, -hd + .2, hd, .12, .4), B(-hw, hw, -hd, -hd + .2, .12, .82),
                                         B(-hw, -hw + arm, -hd, hd, .12, .62), B(hw - arm, hw, -hd, hd, .12, .62)], loc, rotz, bevel=.03)
    cw = (W - 2 * arm) / n; sh, bk = [], []
    for i in range(n):
        x0 = -hw + arm + i * cw + .008; x1 = x0 + cw - .016
        sh.append(B(x0, x1, -hd + .2, hd - .02, .4, .54)); bk.append(B(x0, x1, -hd + .18, -hd + .36, .5, .86, rot=(-8, 0, 0)))
    obj(f'{prefix}_Cushions', cn, cush, sh + bk, loc, rotz, bevel=.04)
    obj(f'{prefix}_Legs', cn, legs, [C(x, y, .06, .12, .022, seg=10) for x in (-hw + .08, hw - .08) for y in (-hd + .08, hd - .08)], loc, rotz)
    for i, pm in enumerate(pillows):
        side = -1 if i % 2 == 0 else 1; x = side * (hw - arm - .26)
        obj(f'{prefix}_Pillow{i}', cn, pm, [B(x - .2, x + .2, -hd + .34, -hd + .48, .52, .9, rot=(-14, 0, side * 10))], loc, rotz, bevel=.05)

def chair(prefix, cn, loc, rotz, seat=DCHAIR, legs=BLACK):
    """dining chair facing +Y"""
    obj(f'{prefix}_Seat', cn, seat, [B(-.22, .22, -.22, .22, .43, .51), B(-.21, .21, -.25, -.19, .5, .96, rot=(-7, 0, 0))], loc, rotz, bevel=.025)
    obj(f'{prefix}_Legs', cn, legs, [C(x, y, .215, .43, .014, seg=8) for x in (-.18, .18) for y in (-.18, .18)], loc, rotz)

def plant(prefix, cn, x, y, h=1.4, pot_r=.17, leaves=10, z=0., spread=1.):
    ph = pot_r * 2.3
    obj(f'{prefix}_Pot', cn, CERAMIC, [C(x, y, z + ph / 2, ph, pot_r * .8, r2=pot_r, seg=20)])
    obj(f'{prefix}_Stem', cn, WALNUT, [C(x, y, z + ph + (h - ph - .1) / 2, h - ph - .1, .012, seg=8)])
    sh = []
    for i in range(leaves):
        a = i * 2.4; zz = z + ph + .25 * spread + (h - ph - .25 * spread) * (i / max(1, leaves - 1)); rr = (.1 + .08 * (1 - i / leaves)) * spread
        sh.append(S(x + math.cos(a) * rr, y + math.sin(a) * rr, zz, .15 * spread, .09 * spread, .065 * spread, seg=10))
    obj(f'{prefix}_Leaves', cn, LEAVES, sh)

# ------------------------------------------------------------------ your objects: move, open, hide
def _flat(m): return [m[i][j] for i in range(4) for j in range(4)]
def _mat(f): return Matrix([f[0:4], f[4:8], f[8:12], f[12:16]])
def place(names, pivot, angle, target):
    """move your object as if it was turned by angle (deg) about pivot, pivot landing on target. Repeatable."""
    if not HAVE: return
    for n in names:
        o = bpy.data.objects.get(n)
        if not o: log('not found (move):', n); continue
        if 'nf_orig' not in o: o['nf_orig'] = _flat(o.matrix_world)
        o.matrix_world = Matrix.Translation(Vector(target)) @ Matrix.Rotation(rad(angle), 4, 'Z') @ Matrix.Translation(-Vector(pivot)) @ _mat(list(o['nf_orig']))

def hide_originals(names):
    if not HAVE: return
    hc = bpy.data.collections.get('Flat_Hidden_Originals')
    if not hc:
        hc = bpy.data.collections.new('Flat_Hidden_Originals')
    if bpy.context.scene.collection.children.get(hc.name) is None: bpy.context.scene.collection.children.link(hc)
    for n in names:
        o = bpy.data.objects.get(n)
        if not o: continue
        if hc not in o.users_collection: hc.objects.link(o)
        for c in list(o.users_collection):
            if c != hc: c.objects.unlink(o)
    lc = bpy.context.view_layer.layer_collection.children.get(hc.name)
    if lc: lc.exclude = True

def clean_previous():
    if not HAVE: return
    root = bpy.data.collections.get('Flat')
    if root:
        for c in [root] + list(root.children_recursive):
            for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)
    for me in list(bpy.data.meshes):
        if me.name.startswith('NF_') and me.users == 0: bpy.data.meshes.remove(me)
    for ld in list(bpy.data.lights):
        if ld.name.startswith('NF_') and ld.users == 0: bpy.data.lights.remove(ld)

# ================================================================== THE FLAT
# Blender coordinates, metres, Z up. Your room (now the bedroom) is x -3..3, y -2.5..2.5.
#   sitting/dining x -7.5..3,  y -7.5..-2.65      kitchen x -7.5..-5.15, y -2.5..2.5
#   hallway       x -5..-3.15, y -2.5..-0.575     bathroom x -5..-3.15,  y -0.425..2.5
def build():
    ST, BR, SR, DN, KT, BA, HL = 'Flat_Structure', 'Flat_Bedroom', 'Flat_Sitting', 'Flat_Dining', 'Flat_Kitchen', 'Flat_Bathroom', 'Flat_Hallway'
    # ---------- floors and ceilings
    obj('Floor_Sitting', ST, FTILE, B(-7.5, 3.0, -7.5, -2.5, -.1, 0))
    obj('Floor_Kitchen', ST, FTILE, B(-7.5, -5.0, -2.5, 2.5, -.1, 0))
    obj('Floor_Hall', ST, FTILE, B(-5.0, -3.0, -2.5, -.5, -.1, 0))
    obj('Floor_Bath', ST, BFLOOR, B(-5.0, -3.0, -.5, 2.5, -.1, 0))
    obj('Ceiling_A', ST, CEIL, B(-7.65, -3.0, -7.65, 2.65, H, H + .1))
    obj('Ceiling_B', ST, CEIL, B(-3.0, 3.15, -7.65, -2.5, H, H + .1))
    # ---------- walls (holes: doors and windows)
    FD = (-3.3, -2.3)   # front door
    wall('Ext_Front', ST, 'x', -7.65, 3.15, -7.65, -7.5, [(FD[0], FD[1], 0, 2.2), (-6.4, -5.0, .9, 2.4)])
    wall('Ext_Left', ST, 'y', -7.5, 2.5, -7.65, -7.5, [(0.0, 1.2, 1.05, 2.15)])
    wall('Ext_Back', ST, 'x', -7.65, -3.0, 2.5, 2.65, [(-4.5, -3.7, 1.85, 2.35)])
    wall('Ext_Right', ST, 'y', -7.65, -2.5, 3.0, 3.15, [(-6.3, -3.9, .9, 2.4)])
    wall('Bed_Front', ST, 'x', -3.15, 3.0, -2.65, -2.5)
    wall('Bed_Left', ST, 'y', -2.5, 2.5, -3.15, -3.0, [(-2.05, -1.15, 0, 2.1)])
    wall('Kit_Front', ST, 'x', -7.5, -5.0, -2.65, -2.5, [(-6.7, -5.8, 0, 2.1)])
    wall('Hall_Arch', ST, 'x', -5.0, -3.15, -2.65, -2.5, [(-5.0, -3.15, 0, 2.4)])
    wall('Kit_Right', ST, 'y', -2.5, 2.5, -5.15, -5.0)
    wall('Bath_Front', ST, 'x', -5.0, -3.15, -.575, -.425, [(-4.6, -3.8, 0, 2.1)])
    # bedroom skirting where the old one was replaced
    obj('Skirt_Bed_L', BR, WFRAME, [B(-3.0, -2.985, -2.5, -2.12, 0, .1), B(-3.0, -2.985, -1.08, 2.5, 0, .1), B(-3.0, 3.0, -2.5, -2.485, 0, .1)], bevel=.003)
    # sitting room skirting
    obj('Skirt_Sitting', SR, WFRAME, [B(-7.5, FD[0] - .07, -7.5, -7.485, 0, .1), B(FD[1] + .07, 3.0, -7.5, -7.485, 0, .1),
                                      B(-7.5, -7.485, -7.5, -2.65, 0, .1), B(2.985, 3.0, -7.5, -2.65, 0, .1),
                                      B(-7.5, -6.77, -2.665, -2.65, 0, .1), B(-5.73, -5.0, -2.665, -2.65, 0, .1), B(-3.08, 3.0, -2.665, -2.65, 0, .1)], bevel=.003)
    # ---------- door frames, doors
    door_frame('Front', SR, 'x', FD[0], FD[1], 2.2, -7.65, -7.5)
    door_frame('Bedroom', HL, 'y', -2.05, -1.15, 2.1, -3.15, -3.0)
    door_frame('Kitchen', KT, 'x', -6.7, -5.8, 2.1, -2.65, -2.5)
    door_frame('Bath', BA, 'x', -4.6, -3.8, 2.1, -.575, -.425)
    door_frame('Arch', HL, 'x', -5.0, -3.15, 2.4, -2.65, -2.5)
    # front door: closed, panels inside and out, brass lever (this is the way in and out of the house)
    obj('Front_Door', SR, FDOOR, B(FD[0] + .02, FD[1] - .02, -7.6, -7.55, .01, 2.18), bevel=.006)
    pan = []
    for (z0, z1) in ((.18, .78), (.9, 1.5), (1.62, 2.02)):
        for (y0, y1) in ((-7.55, -7.537), (-7.613, -7.6)):
            pan += [B(FD[0] + .14, (FD[0] + FD[1]) / 2 - .04, y0, y1, z0, z1), B((FD[0] + FD[1]) / 2 + .04, FD[1] - .14, y0, y1, z0, z1)]
    obj('Front_Door_Panels', SR, FDOORP, pan, bevel=.005)
    obj('Front_Door_Lever', SR, BRASS, [C(FD[1] - .1, -7.52, 1.0, .07, .016, axis='Y', seg=12), B(FD[1] - .25, FD[1] - .1, -7.5, -7.485, .99, 1.012),
                                         B(FD[1] - .13, FD[1] - .07, -7.552, -7.545, .9, 1.2), C(FD[1] - .1, -7.52, 1.12, .07, .012, axis='Y', seg=10)])
    obj('Doormat', SR, RUGS, B(FD[0] + .05, FD[1] - .05, -7.48, -6.95, 0, .012), bevel=.004)
    door_leaf('Door_Kitchen', KT, (-6.68, -2.5), .86, 90)
    door_leaf('Door_Bath', BA, (-4.58, -.425), .76, 90, mat=CABW, handle=CHROME)
    # ---------- BEDROOM (your room): the door opens, the wall gets a doorway, sofa + table go to the sitting room
    hide_originals(['Wall_Left', 'Skirt_Left'])
    place(['Door', 'Door_Handle'], (-2.95, -2.03, 0), -90, (-2.95, -2.03, 0))
    place(['Sofa_Base', 'Sofa_Back', 'Sofa_ArmL', 'Sofa_ArmR', 'Sofa_Cushion0', 'Sofa_Cushion1'], (0, 0, 0), 0, (1.11, -4.05, 0))
    place(['Art_Frame1', 'Art_Canvas1'], (0, 0, 0), 0, (0, .45, 0))   # clear of the doorway
    place(['CoffeeTable_Top', 'CoffeeTable_Leg0', 'CoffeeTable_Leg1', 'CoffeeTable_Leg2', 'CoffeeTable_Leg3', 'Mug'], (-1.1, -.8, 0), 90, (.95, -4.85, 0))
    # wardrobe on the front wall, facing the bed: three doors, the middle one a mirror
    WX0, WX1, WY0, WY1 = -1.6, .4, -2.5, -1.94
    obj('Wardrobe_Body', BR, WALNUT, [B(WX0, WX1, WY0, WY1, .06, 2.2)], bevel=.006)
    obj('Wardrobe_Plinth', BR, BLACK, [B(WX0 + .03, WX1 - .03, WY0, WY1 - .03, 0, .06)])
    dw = (WX1 - WX0) / 3; fr = []
    for i in range(3):
        a0 = WX0 + i * dw + .006; fr.append(B(a0, a0 + dw - .012, WY1, WY1 + .022, .08, 2.18))
    obj('Wardrobe_Doors', BR, WARDF, fr, bevel=.004)
    m0 = WX0 + dw
    obj('Wardrobe_Mirror', BR, MIRROR, [B(m0 + .07, m0 + dw - .07, WY1 + .022, WY1 + .028, .32, 1.98)])
    obj('Wardrobe_Handles', BR, BRASS, [B(WX0 + dw - .06, WX0 + dw - .045, WY1 + .03, WY1 + .05, .95, 1.4), B(WX0 + 2 * dw + .045, WX0 + 2 * dw + .06, WY1 + .03, WY1 + .05, .95, 1.4),
                                        B(m0 + .045, m0 + .06, WY1 + .03, WY1 + .05, .95, 1.4)], bevel=.004)
    # split AC above the bed side of the left wall
    obj('AC_Bed', BR, PLASTIC, [B(-3.0, -2.78, .4, 1.4, 2.3, 2.62)], bevel=.03)
    obj('AC_Bed_Vent', BR, BLACK, [B(-2.785, -2.775, .45, 1.35, 2.33, 2.37)])
    obj('AC_Bed_Display', BR, ACLED, [B(-2.782, -2.776, 1.2, 1.3, 2.5, 2.53)])
    # curtains on your window
    obj('Curtain_Rod_Bed', BR, BLACK, [C(2.9, 0, 2.55, 3.0, .012, axis='Y', seg=10), S(2.9, -1.5, 2.55, .025, .025, .025, 8), S(2.9, 1.5, 2.55, .025, .025, .025, 8)])
    obj('Curtain_Bed', BR, CURTAIN, [CURT('y', -1.47, -1.0, 2.87, .8, 2.53), CURT('y', 1.0, 1.47, 2.87, .8, 2.53)])
    light('Light_Bedroom_Wardrobe', -.6, -1.4, 2.6, 40)

    # ---------- SITTING ROOM: TV wall
    obj('TV_Panel', SR, TVPANEL, B(-.5, 2.5, -2.69, -2.65, 0, 2.8))
    obj('TV_Slats', SR, WALNUT, [B(-.45 + i * .2, -.39 + i * .2, -2.72, -2.69, 0, 2.8) for i in range(15)])
    obj('TV_Body', SR, BLACK, B(.275, 1.725, -2.78, -2.73, 1.0, 1.83), bevel=.004)
    obj('TV_Screen', SR, TVSCREEN, B(.29, 1.71, -2.786, -2.78, 1.015, 1.815))
    obj('TV_Console', SR, WALNUT, B(-.1, 2.1, -3.15, -2.73, .18, .6), bevel=.006)
    obj('TV_Console_Lines', SR, BLACK, [B(.63, .65, -3.155, -3.149, .2, .58), B(1.36, 1.38, -3.155, -3.149, .2, .58)] +
        [C(x, y, .09, .18, .02, seg=8) for x in (0, 2.0) for y in (-3.08, -2.8)])
    obj('Soundbar', SR, BLACK, B(.45, 1.55, -2.98, -2.88, .6, .67), bevel=.01)
    obj('Decoder', SR, BLACK, B(1.75, 2.0, -3.05, -2.82, .6, .65), bevel=.004)
    obj('Decoder_LED', SR, ACLED, B(1.95, 1.97, -3.052, -3.049, .62, .63))
    plant('Plant_TV', SR, .12, -2.95, h=.55, pot_r=.07, leaves=6, z=.6, spread=.55)
    # sofas, armchair, coffee table (yours, moved), rug, lamps
    sofa('Sofa3', SR, (1.05, -6.93, 0), 0, 2.5, pillows=(PILLOW1, PILLOW2))
    sofa('Armchair', SR, (2.45, -5.2, 0), 90, 1.0, n=1, pillows=(PILLOW2,))
    obj('Rug_Sitting', SR, RUGS, B(-.6, 2.5, -6.35, -3.45, 0, .015), bevel=.005)
    obj('SideTable', SR, WALNUT, [C(-.55, -6.9, .54, .03, .25, seg=24), C(-.55, -6.9, .27, .52, .03, seg=10), C(-.55, -6.9, .015, .03, .18, seg=20)])
    obj('SideLamp_Base', SR, BRASS, [C(-.55, -6.9, .66, .2, .05, r2=.025, seg=16)])
    obj('SideLamp_Shade', SR, SHADE, [C(-.55, -6.9, .86, .2, .14, r2=.1, seg=20)])
    obj('Standing_Lamp', SR, BLACK, [C(2.72, -7.15, .015, .03, .16, seg=20), C(2.72, -7.15, .78, 1.55, .014, seg=8)])
    obj('Standing_Lamp_Shade', SR, SHADE, [C(2.72, -7.15, 1.6, .3, .22, r2=.15, seg=20)])
    # standing AC in the corner by the TV
    obj('AC_Stand', SR, PLASTIC, B(2.55, 2.95, -3.3, -2.9, 0, 1.8), bevel=.03)
    obj('AC_Stand_Grille', SR, BLACK, [B(2.545, 2.552, -3.25, -2.95, 1.15 + i * .06, 1.18 + i * .06) for i in range(6)])
    obj('AC_Stand_Display', SR, ACLED, B(2.545, 2.551, -3.18, -3.02, .95, 1.0))
    # art over the sofa, clock and shoe rack by the door
    obj('Art_Sitting_Frames', SR, BLACK, [B(.2, 1.0, -7.5, -7.47, 1.35, 2.15), B(1.1, 1.9, -7.5, -7.47, 1.35, 2.15)], bevel=.004)
    obj('Art_Sitting_1', SR, ART1, B(.25, .95, -7.472, -7.465, 1.4, 2.1))
    obj('Art_Sitting_2', SR, ART2, B(1.15, 1.85, -7.472, -7.465, 1.4, 2.1))
    obj('Clock_Face', SR, PORC, C(-1.7, -7.47, 1.95, .03, .18, axis='Y', seg=32))
    obj('Clock_Rim', SR, BLACK, [C(-1.7, -7.485, 1.95, .02, .2, axis='Y', seg=32), B(-1.705, -1.695, -7.456, -7.452, 1.95, 2.08), B(-1.7, -1.6, -7.456, -7.452, 1.945, 1.955)])
    obj('ShoeRack', SR, WALNUT, [B(-2.1, -1.3, -7.48, -7.18, z, z + .025) for z in (0, .22, .45)] + [B(-2.1, -2.08, -7.48, -7.18, 0, .47), B(-1.32, -1.3, -7.48, -7.18, 0, .47)], bevel=.003)
    obj('Shoes_Brown', SR, SHOE1, [B(x, x + .1, -7.44, -7.2, .025, .1) for x in (-2.05, -1.93)] + [B(x, x + .1, -7.44, -7.2, .245, .32) for x in (-1.6, -1.48)], bevel=.02)
    obj('Shoes_White', SR, SHOE2, [B(x, x + .1, -7.44, -7.2, .025, .11) for x in (-1.65, -1.53)] + [B(x, x + .1, -7.44, -7.2, .245, .33) for x in (-2.04, -1.92)], bevel=.02)
    # window with curtains
    window('Sitting', SR, 'y', -6.3, -3.9, .9, 2.4, 3.0, 3.15, -1)
    obj('Curtain_Rod_Sitting', SR, BLACK, [C(2.9, -5.1, 2.55, 3.4, .012, axis='Y', seg=10)])
    obj('Curtain_Sitting', SR, CURTAIN, [CURT('y', -6.75, -6.25, 2.87, .08, 2.53), CURT('y', -3.95, -3.45, 2.87, .08, 2.53)])
    # POP ceiling: a dropped border with a warm LED cove, and a chandelier
    obj('POP_Border', SR, POPM, [B(-7.5, 3.0, -7.5, -7.05, 2.8, H), B(-7.5, 3.0, -3.1, -2.65, 2.8, H), B(-7.5, -7.05, -7.05, -3.1, 2.8, H), B(2.55, 3.0, -7.05, -3.1, 2.8, H),
                                 B(-3.75, -3.3, -7.05, -3.1, 2.8, H)])
    obj('POP_LED', SR, LED, [B(-7.05, 2.55, -7.06, -7.045, 2.79, 2.8), B(-7.05, 2.55, -3.105, -3.09, 2.79, 2.8), B(-7.06, -7.045, -7.05, -3.1, 2.79, 2.8), B(2.545, 2.56, -7.05, -3.1, 2.79, 2.8),
                             B(-3.76, -3.745, -7.05, -3.1, 2.79, 2.8), B(-3.305, -3.29, -7.05, -3.1, 2.79, 2.8)])
    obj('Ceiling_Lamp_Sitting', SR, SHADE, [C(.95, -4.85, 2.4, .26, .36, seg=32)])
    obj('Chandelier_Metal', SR, BRASS, [C(.95, -4.85, 2.78, .44, .008, seg=6), C(.95, -4.85, 2.535, .015, .37, seg=32), C(.95, -4.85, 2.265, .015, .37, seg=32), C(.95, -4.85, 2.98, .04, .08, seg=16)])
    light('Light_Sitting', .95, -4.85, 2.3, 220)
    light('Light_Sitting_Cove', -2.0, -5.0, 2.6, 120, (1., .8, .55))

    # ---------- DINING: table for six, pendant, sideboard, window, plant
    obj('Dining_Top', DN, WALNUT, B(-6.5, -4.6, -5.55, -4.55, .73, .77), bevel=.008)
    obj('Dining_Legs', DN, BLACK, [B(x - .03, x + .03, y - .03, y + .03, 0, .73) for x in (-6.38, -4.72) for y in (-5.45, -4.65)])
    for i, x in enumerate((-6.05, -5.05)):
        chair(f'DiningChair_F{i}', DN, (x, -5.85, 0), 0)
        chair(f'DiningChair_B{i}', DN, (x, -4.25, 0), 180)
    chair('DiningChair_L', DN, (-6.85, -5.05, 0), -90)
    chair('DiningChair_R', DN, (-4.25, -5.05, 0), 90)
    obj('Ceiling_Lamp_Dining', DN, SHADE, [S(-5.55, -5.05, 2.02, .07, .07, .07, 12)])
    obj('Dining_Pendant', DN, BLACK, [C(-5.55, -5.05, 2.6, .8, .006, seg=6), C(-5.55, -5.05, 2.11, .22, .3, r2=.07, seg=28, open_top=False)])
    light('Light_Dining', -5.55, -5.05, 1.95, 90)
    obj('Dining_Bowl', DN, CERAMIC, [C(-5.55, -5.05, .8, .06, .1, r2=.16, seg=24)])
    obj('Dining_Fruit', DN, FRUIT, [S(-5.55 + dx, -5.05 + dy, .86, .045, .045, .045, 10) for dx, dy in ((0, 0), (.06, .04), (-.05, .05), (.03, -.06))])
    obj('Sideboard', DN, WALNUT, B(-7.5, -7.05, -7.3, -6.1, .15, .85), bevel=.006)
    obj('Sideboard_Legs', DN, BLACK, [C(x, y, .075, .15, .02, seg=8) for x in (-7.42, -7.13) for y in (-7.22, -6.18)] + [B(-7.056, -7.05, -6.71, -6.69, .2, .8)])
    plant('Plant_Sideboard', DN, -7.27, -6.45, h=.6, pot_r=.08, leaves=7, z=.85, spread=.6)
    plant('Plant_Corner', DN, -7.08, -3.12, h=1.6, pot_r=.17, leaves=12, spread=.9)
    window('Dining', DN, 'x', -6.4, -5.0, .9, 2.4, -7.65, -7.5, 1)
    obj('Curtain_Rod_Dining', DN, BLACK, [C(-5.7, -7.42, 2.55, 2.4, .012, axis='X', seg=10)])
    obj('Curtain_Dining', DN, CURTAIN, [CURT('x', -6.85, -6.4, -7.42, .08, 2.53), CURT('x', -5.0, -4.55, -7.42, .08, 2.53)])

    # ---------- KITCHEN
    # base cabinets: left run along x=-7.5 and back run along y=2.5, cooker in the gap
    obj('Kitchen_Plinth', KT, BLACK, [B(-7.5, -6.98, -1.5, 2.5, 0, .1), B(-6.98, -6.36, 1.98, 2.5, 0, .1), B(-5.74, -5.15, 1.98, 2.5, 0, .1)])
    obj('Kitchen_Base', KT, CABG, [B(-7.5, -6.94, -1.5, 2.5, .1, .86), B(-6.94, -6.36, 1.92, 2.5, .1, .86), B(-5.74, -5.15, 1.92, 2.5, .1, .86)])
    fronts = []
    for (a0, a1) in ((-1.5, -.9), (-.9, -.3), (-.3, .3), (.3, .9), (.9, 1.5)):
        fronts.append(B(-6.94, -6.92, a0 + .004, a1 - .004, .104, .856))
    fronts += [B(-6.92 + .004 + 0, -6.36 - .004, 1.9, 1.92, .104, .856), B(-5.74 + .004, -5.15 - .004, 1.9, 1.92, .104, .856)]
    obj('Kitchen_Fronts', KT, CABG, fronts, bevel=.003)
    obj('Kitchen_Dishwasher', KT, STEEL, B(-6.94, -6.92, 1.504, 1.92, .104, .856), bevel=.003)
    hd = [B(-6.925, -6.905, a0 + .1, a1 - .1, .79, .81) for (a0, a1) in ((-1.5, -.9), (-.9, -.3), (-.3, .3), (.3, .9), (.9, 1.5), (1.5, 1.92))]
    hd += [B(-6.82, -6.46, 1.885, 1.905, .79, .81), B(-5.62, -5.27, 1.885, 1.905, .79, .81)]
    obj('Kitchen_Handles', KT, CHROME, hd, bevel=.004)
    # granite tops (with a hole for the sink)
    obj('Kitchen_Top', KT, GRANITE, [B(-7.5, -6.9, -1.52, .3, .86, .9), B(-7.5, -6.9, .9, 2.5, .86, .9), B(-7.5, -7.38, .3, .9, .86, .9), B(-6.98, -6.9, .3, .9, .86, .9),
                                      B(-6.9, -6.35, 1.88, 2.5, .86, .9), B(-5.75, -5.15, 1.88, 2.5, .86, .9)], bevel=.003)
    obj('Kitchen_Sink', KT, STEEL, [C(-7.18, .6, .78, .2, .2, seg=24, sx=1.0, sy=1.45, open_top=True)])
    obj('Kitchen_Tap', KT, CHROME, [C(-7.4, .6, .93, .06, .025, seg=12), C(-7.4, .6, 1.07, .28, .014, seg=10), C(-7.3, .6, 1.2, .2, .012, axis='X', seg=10), B(-7.43, -7.41, .64, .72, .95, .97)])
    # freestanding gas cooker with oven, burners, knobs; hood above
    CX0, CX1 = -6.35, -5.75
    obj('Cooker_Body', KT, LOCKER, B(CX0, CX1, 1.92, 2.48, .02, .86), bevel=.006)
    obj('Cooker_Top', KT, BGLASS, B(CX0, CX1, 1.92, 2.48, .86, .9))
    obj('Cooker_Back', KT, LOCKER, B(CX0, CX1, 2.45, 2.48, .9, 1.04), bevel=.004)
    obj('Cooker_Burners', KT, BLACK, [C(x, y, .91, .02, .05, seg=16) for x in (CX0 + .16, CX1 - .16) for y in (2.04, 2.29)] + [C(x, y, .925, .012, .03, seg=12) for x in (CX0 + .16, CX1 - .16) for y in (2.04, 2.29)])
    obj('Cooker_Oven', KT, BGLASS, B(CX0 + .03, CX1 - .03, 1.9, 1.92, .12, .62), bevel=.003)
    obj('Cooker_Knobs', KT, BLACK, [C(CX0 + .08 + i * .11, 1.9, .76, .04, .02, axis='Y', seg=12) for i in range(5)])
    obj('Cooker_Handle', KT, CHROME, [C((CX0 + CX1) / 2, 1.885, .66, .5, .01, axis='X', seg=10)])
    obj('Kitchen_Hood', KT, STEEL, [B(-6.38, -5.72, 2.0, 2.5, 1.65, 1.78), B(-6.18, -5.92, 2.22, 2.5, 1.78, H)], bevel=.004)
    obj('Kitchen_Hood_Light', KT, LED, B(-6.2, -5.9, 2.15, 2.25, 1.645, 1.65))
    # wall cabinets
    obj('Kitchen_Wall_Cabs', KT, CABW, [B(-7.5, -7.15, -1.5, -.12, 1.45, 2.25), B(-7.5, -7.15, 1.32, 2.5, 1.45, 2.25), B(-7.15, -6.42, 2.15, 2.5, 1.45, 2.25), B(-5.68, -5.15, 2.15, 2.5, 1.45, 2.25)], bevel=.004)
    obj('Kitchen_Wall_Lines', KT, BLACK, [B(-7.152, -7.148, a, a + .006, 1.47, 2.23) for a in (-.81, .8 + 1.11)] + [B(-6.785, -6.779, 2.148, 2.152, 1.47, 2.23), B(-5.418, -5.412, 2.148, 2.152, 1.47, 2.23)])
    obj('Kitchen_Wall_Handles', KT, CHROME, [B(-7.16, -7.145, a0, a1, 1.47, 1.49) for (a0, a1) in ((-1.4, -1.0), (-.6, -.22), (1.42, 1.8), (2.0, 2.4))] + [B(-7.05, -6.5, 2.14, 2.15, 1.47, 1.49), B(-5.6, -5.25, 2.14, 2.15, 1.47, 1.49)])
    # tiles behind the worktops
    obj('Kitchen_Splash', KT, KTILE, [B(-7.5, -7.49, -1.5, 0, .9, 1.45), B(-7.5, -7.49, 0, 1.2, .9, 1.05), B(-7.5, -7.49, 1.2, 2.49, .9, 1.45),
                                       B(-7.49, -5.15, 2.49, 2.5, .9, 1.45), B(-6.38, -5.72, 2.488, 2.49, 1.45, 1.65)])
    window('Kitchen', KT, 'y', 0.0, 1.2, 1.05, 2.15, -7.65, -7.5, 1)
    # fridge, microwave, small appliances, pots, gas cylinder, bin
    obj('Fridge', KT, STEEL, B(-5.86, -5.17, -2.3, -1.62, 0, 1.85), bevel=.02)
    obj('Fridge_Lines', KT, BLACK, [B(-5.866, -5.858, -2.28, -1.64, 1.24, 1.26)])
    obj('Fridge_Handles', KT, CHROME, [B(-5.9, -5.87, -1.73, -1.7, .75, 1.15), B(-5.9, -5.87, -1.73, -1.7, 1.32, 1.6), B(-5.875, -5.86, -1.73, -1.7, .75, .77), B(-5.875, -5.86, -1.73, -1.7, 1.13, 1.15)], bevel=.006)
    obj('Microwave', KT, BLACK, B(-5.68, -5.2, 2.1, 2.45, .9, 1.18), bevel=.008)
    obj('Microwave_Door', KT, BGLASS, B(-5.66, -5.36, 2.094, 2.1, .93, 1.15))
    obj('Microwave_Pad', KT, STEEL, B(-5.33, -5.23, 2.094, 2.1, .95, 1.14))
    obj('Kettle', KT, STEEL, [C(-7.2, -1.1, 1.0, .2, .085, r2=.07, seg=20), S(-7.2, -1.1, 1.1, .03, .03, .02, 8), B(-7.2, -7.18, -1.2, -1.18, .95, 1.07)])
    obj('Blender_Base', KT, BLACK, B(-7.33, -7.15, 1.56, 1.74, .9, 1.02), bevel=.01)
    obj('Blender_Jar', KT, GLASS, [C(-7.24, 1.65, 1.16, .28, .06, r2=.075, seg=16)])
    obj('Toaster', KT, STEEL, B(-7.38, -7.13, -.75, -.5, .9, 1.08), bevel=.02)
    obj('Toaster_Slots', KT, BLACK, [B(-7.32, -7.19, -.7, -.68, 1.075, 1.082), B(-7.32, -7.19, -.57, -.55, 1.075, 1.082)])
    obj('CuttingBoard', KT, OAK, B(-7.42, -7.06, -1.45, -1.25, .9, .92), bevel=.004)
    obj('Pot_Steel', KT, STEEL, [C(CX0 + .16, 2.04, 1.015, .16, .11, seg=24), C(CX0 + .16, 2.04, 1.1, .01, .115, seg=24)])
    obj('Pot_Jollof', KT, BLACK, [C(CX1 - .16, 2.29, 1.035, .2, .14, seg=24), C(CX1 - .16, 2.29, 1.14, .012, .145, seg=24), S(CX1 - .16, 2.29, 1.155, .02, .02, .015, 8)])
    obj('Gas_Cylinder', KT, CYL, [C(-5.35, 1.6, .3, .6, .15, seg=24), S(-5.35, 1.6, .6, .15, .15, .06, 16)])
    obj('Gas_Valve', KT, BRASS, [C(-5.35, 1.6, .69, .08, .03, seg=12), C(-5.55, 1.6, .7, .4, .008, axis='X', seg=8)])
    obj('Dish_Rack', KT, CHROME, [B(-7.4, -7.0, 1.0, 1.45, .9, .93)])
    obj('Dish_Plates', KT, PORC, [C(-7.2, y, 1.02, .015, .1, axis='Y', seg=20) for y in (1.08, 1.14, 1.2, 1.26)])
    obj('Fruit_Bowl', KT, CERAMIC, [C(-7.2, 2.2, .94, .08, .09, r2=.14, seg=20)])
    obj('Fruits', KT, FRUIT, [S(-7.2 + dx, 2.2 + dy, 1.0, .04, .04, .04, 10) for dx, dy in ((0, 0), (.05, .03), (-.04, .04))])
    obj('Kitchen_Bin', KT, STEEL, [C(-5.36, -.9, .25, .5, .14, seg=20)])
    obj('Ceiling_Lamp_Kitchen', KT, SHADE, [C(-6.3, .3, 2.975, .05, .25, seg=28)])
    light('Light_Kitchen', -6.3, .3, 2.7, 140)

    # ---------- BATHROOM
    obj('Bath_Wall_Tiles', BA, BTILE, [B(-5.0, -4.99, -.415, 2.49, 0, 2.2), B(-3.16, -3.15, -.415, 2.49, 0, 2.2),
                                       B(-4.99, -4.5, 2.49, 2.5, 0, 2.2), B(-4.5, -3.7, 2.49, 2.5, 0, 1.85), B(-3.7, -3.16, 2.49, 2.5, 0, 2.2),
                                       B(-4.99, -4.67, -.425, -.415, 0, 2.2), B(-4.67, -3.73, -.425, -.415, 2.17, 2.2), B(-3.73, -3.16, -.425, -.415, 0, 2.2)])
    obj('Shower_Tray', BA, PORC, B(-4.99, -3.16, 1.55, 2.49, 0, .05), bevel=.01)
    obj('Shower_Drain', BA, CHROME, C(-3.6, 2.2, .052, .004, .05, seg=16))
    obj('Shower_Screen', BA, GLASS, B(-4.99, -4.1, 1.545, 1.555, .05, 2.0))
    obj('Shower_Metal', BA, CHROME, [B(-4.99, -4.1, 1.54, 1.56, 1.98, 2.0), B(-4.12, -4.1, 1.54, 1.56, .05, 2.0), C(-4.75, 2.47, 1.42, 1.0, .012, seg=10),
                                      C(-4.75, 2.385, 1.95, .17, .011, axis='Y', seg=10), C(-4.75, 2.3, 1.935, .025, .1, seg=24), B(-4.82, -4.68, 2.45, 2.49, .98, 1.1)])
    obj('Water_Heater', BA, PLASTIC, [C(-3.38, 2.0, 2.22, .75, .2, seg=24)])
    obj('Water_Heater_Pipes', BA, CHROME, [C(x, 2.0, 1.6, .5, .01, seg=8) for x in (-3.3, -3.46)])
    obj('Water_Heater_Light', BA, ACLED, B(-3.59, -3.575, 1.97, 2.03, 2.2, 2.24))
    obj('Bucket', BA, BUCKET, [C(-3.45, 2.25, .215, .33, .12, r2=.15, seg=24, open_top=True)])
    obj('Bucket_Bowl', BA, BOWLR, [C(-3.45, 2.25, .36, .06, .07, r2=.1, seg=20, open_top=True)])
    # toilet against the left wall, facing the room
    obj('Toilet_Tank', BA, PORC, B(-4.99, -4.81, .58, 1.02, .42, .82), bevel=.02)
    obj('Toilet_Bowl', BA, PORC, [C(-4.6, .8, .19, .38, .14, r2=.17, seg=24, sx=1.3)])
    obj('Toilet_Seat', BA, PLASTIC, [C(-4.6, .8, .4, .04, .19, seg=24, sx=1.3)])
    obj('Toilet_Flush', BA, CHROME, C(-4.9, .8, .825, .01, .03, seg=12))
    obj('Toilet_Roll', BA, PORC, C(-4.93, .42, .7, .1, .055, axis='Y', seg=16))
    obj('Toilet_Roll_Holder', BA, CHROME, [C(-4.93, .42, .7, .14, .008, axis='Y', seg=8), B(-4.99, -4.93, .345, .355, .69, .71)])
    # vanity, basin, tap, mirror, mirror light
    obj('Vanity', BA, WALNUT, B(-3.65, -3.16, .45, 1.3, .12, .82), bevel=.006, loc=(0, -.3, 0))
    obj('Vanity_Line', BA, BLACK, B(-3.652, -3.648, .87, .88, .14, .8), loc=(0, -.3, 0))
    obj('Vanity_Top', BA, PORC, B(-3.67, -3.16, .43, 1.32, .82, .86), bevel=.006, loc=(0, -.3, 0))
    obj('Basin', BA, PORC, [C(-3.42, .875, .92, .12, .17, r2=.2, seg=28, sx=1., sy=1.25, open_top=True)], loc=(0, -.3, 0))
    obj('Basin_Tap', BA, CHROME, [C(-3.22, .875, .99, .26, .014, seg=10), C(-3.29, .875, 1.12, .14, .011, axis='X', seg=10), B(-3.24, -3.2, .9, .96, 1.0, 1.02)], loc=(0, -.3, 0))
    obj('Mirror_Bath', BA, MIRROR, B(-3.18, -3.16, .5, 1.25, 1.05, 1.85), bevel=.008, loc=(0, -.3, 0))
    obj('Mirror_Light', BA, LED, B(-3.2, -3.16, .6, 1.15, 1.9, 1.94), loc=(0, -.3, 0))
    # towel rail and towel, mat, window, light
    obj('Towel_Rail', BA, CHROME, [C(-4.93, 1.32, 1.17, .42, .01, axis='Y', seg=8), B(-4.99, -4.93, 1.11, 1.12, 1.16, 1.18), B(-4.99, -4.93, 1.52, 1.53, 1.16, 1.18)])
    obj('Towel', BA, TOWEL, [B(-4.955, -4.905, 1.14, 1.5, .78, 1.19)], bevel=.02)
    obj('Rug_Bath', BA, TOWEL, B(-4.4, -3.8, 1.0, 1.45, 0, .012), bevel=.004)
    window('Bath', BA, 'x', -4.5, -3.7, 1.85, 2.35, 2.5, 2.65, -1, frosted=True, mull=False)
    obj('Ceiling_Lamp_Bath', BA, SHADE, [C(-4.07, .7, 2.975, .05, .18, seg=24)])
    light('Light_Bath', -4.07, .7, 2.7, 80)

    # ---------- HALLWAY
    obj('Hall_Console', HL, WALNUT, [B(-5.0, -4.7, -2.1, -1.1, .75, .79)] + [B(-4.76, -4.72, y, y + .04, 0, .75) for y in (-2.06, -1.18)], bevel=.004)
    obj('Hall_Vase', HL, CERAMIC, [C(-4.85, -1.35, .9, .22, .05, r2=.07, seg=16)])
    obj('Hall_Leaves', HL, LEAVES, [S(-4.85 + dx, -1.35 + dy, 1.08 + dz, .07, .05, .05, 8) for dx, dy, dz in ((0, 0, 0), (.05, .03, .06), (-.04, .04, .1), (.02, -.05, .12))])
    obj('Art_Hall_Frame', HL, BLACK, B(-5.0, -4.97, -1.95, -1.25, 1.3, 1.9), bevel=.003)
    obj('Art_Hall_Canvas', HL, ART2, B(-4.972, -4.965, -1.9, -1.3, 1.35, 1.85))
    obj('Hall_Lamp', HL, SHADE, [C(-4.07, -1.55, 2.975, .05, .15, seg=24)])
    light('Light_Hall', -4.07, -1.55, 2.7, 50)

# ------------------------------------------------------------------ plan picture (outside Blender)
def plan_png(path):
    from PIL import Image, ImageDraw
    S_, X0, Y1 = 60, -8.2, 3.2
    W_, H_ = int((3.8 - X0) * S_), int((Y1 + 8.2) * S_)
    im = Image.new('RGB', (W_, H_), (250, 250, 250)); d = ImageDraw.Draw(im)
    cols = json.load(open(os.path.join(os.path.dirname(os.path.abspath(path)), 'matcolors.json'))) if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(path)), 'matcolors.json')) else {}
    def px(x, y): return ((x - X0) * S_, (Y1 - y) * S_)
    recs = [r for r in REC if not r['name'].startswith(('Ceiling', 'POP', 'Chandelier', 'Dining_Pendant', 'Kitchen_Wall', 'Kitchen_Hood', 'Curtain_Rod', 'Water_Heater', 'AC_Bed', 'Mirror_Light', 'Hall_Lamp'))]
    parts = [(r, a) for r in recs + EXIST for a in r.get('parts', [r['aabb']])]
    parts.sort(key=lambda q: (q[1][5] > .02, min(q[1][5], 1.0) if q[1][4] < 1.5 else 3))
    for r, aa in parts:
        if aa[4] > 1.6 and not r['name'].startswith(('Wall', 'Window', 'WinFrame')): continue
        x0, x1, y0, y1, z0, z1 = aa
        c = MATS.get(r['mat'], {}).get('color', (.6, .6, .6)); c = tuple(int(255 * min(1, max(0, v)) ** (1 / 2.2)) for v in c)
        a, b = px(x0, y1), px(x1, y0)
        d.rectangle([a, b], fill=c, outline=(40, 40, 40) if z1 > .3 else None)
    for name, x, y in (('BEDROOM', 0, 0), ('SITTING', 1, -5.5), ('DINING', -5.6, -6.6), ('KITCHEN', -6.2, -.5), ('BATH', -4.0, 1.1), ('HALL', -4.0, -1.8)):
        d.text(px(x, y), name, fill=(200, 0, 0))
    im.save(path); print('plan ->', path)

EXIST = []   # your objects, for the plan picture

def main():
    LOG.clear(); REC.clear(); _matcache.clear(); COLLS.clear()
    if HAVE:
        os.makedirs(OUT, exist_ok=True)
        bk = os.path.join(OUT, 'room_before_flat.blend')
        if not os.path.exists(bk):
            try: bpy.ops.wm.save_as_mainfile(filepath=bk, copy=True); log('backup saved', bk)
            except Exception as e: log('backup failed', e)
        clean_previous()
    build()
    if not HAVE: return
    # see-through ceilings in the viewport only (they still render and export)
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.name.startswith('Ceiling') and not o.name.startswith('Ceiling_Lamp'):
            o.display_type = 'WIRE'
    bpy.context.view_layer.update()
    # export for the game
    glb = os.path.join(OUT, 'room.glb')
    try:
        r = bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_apply=True, export_cameras=False, export_lights=False, use_visible=True, export_image_format='NONE')
        log('export', r, glb, os.path.getsize(glb))
    except Exception as e:
        log('export failed', repr(e))
    try: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'naija_flat.blend'), copy=True); log('saved copy naija_flat.blend')
    except Exception as e: log('save copy failed', e)
    # a nice view: from above the front-right corner
    try:
        for area in bpy.context.screen.areas:
            if area.type == 'VIEW_3D':
                r3 = area.spaces.active.region_3d; r3.view_perspective = 'PERSP'
                r3.view_location = (-2.3, -2.4, 0.5); r3.view_distance = 19
                r3.view_rotation = Euler((rad(52), 0, rad(-28))).to_quaternion()
    except Exception as e: log('view', e)
    log('objects made:', len(REC))

if __name__ == '__main__' and not HAVE:
    build(); plan_png(sys.argv[1] if len(sys.argv) > 1 else 'plan.png'); print(len(REC), 'objects')
elif HAVE:
    try:
        main()
    except Exception:
        LOG.append(traceback.format_exc())
    try:
        open(os.path.join(OUT, 'build_log.txt'), 'w').write('\n'.join(LOG))
    except Exception:
        pass
    print('\n'.join(LOG[-12:]))
