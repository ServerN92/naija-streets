"""Naija Streets: the skateboard, built in Blender and exported for the game.

A real street board (8.1" x 32"): a 7-ply maple deck with a kicked nose and tail and a little concave, black grip on
top, a green-white-green Naija graphic underneath, two trucks (baseplate, bushings, hanger, axle) and four 54 mm
wheels with green cores. One mesh, one material, a colour per face corner (no pictures to download).
In Blender: Z up, the nose toward -Y (= +Z in the game), the board's middle at the origin, wheels on the ground.

Run inside Blender (Scripting > New > paste > Run Script): it makes a collection "NS Skateboard" with the board (and
the lighter skateboard_lod1 beside it) and writes both .glb files to Documents/naija_skateboard in your home folder.
Copy them to assets/models/ and run tools/manifest.py.
Or headless, without Blender:  python3 tools/glb_build.py -m blender_skateboard
"""
import bpy, bmesh, math, os

OUT = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_skateboard')

# ---- sizes (metres)
HALF = .41          # half the deck's length along its surface (end to end ~0.81 m)
W2 = .1035          # half the deck's width (8.15")
T = .012            # deck thickness
KICK = .235         # where the nose and tail start to kick up (from the middle)
NOSE, TAIL = math.radians(21), math.radians(19)
RAMP = .05          # how long the bend into a kick is
CONC = .0042        # concave: how much higher the rails are than the middle
WHEEL_R, WHEEL_W = .027, .032
AXLE_Z = WHEEL_R
DECK_Z = .083       # underside of the deck (wheel radius + truck height)
TRUCK_Y = .18       # truck centres (wheelbase 0.36 m)
WHEEL_X = .100      # wheel centres from the middle

GRIP = '#29292b'; GRIP2 = '#323234'; WOOD = '#cfa268'; WOOD2 = '#b4854d'; GREEN = '#0a8a43'; WHITE = '#f3f2ec'
METAL = '#b9bdc2'; METAL2 = '#9ea3a9'; BOLT = '#3b3b3d'; BUSH = '#d6402b'; URE = '#f0e9d4'; URE2 = '#e2d9c0'; CORE = '#0a8a43'


def hexc(h, k=1.0):
    h = h.lstrip('#')
    return tuple(min(1.0, int(h[i:i + 2], 16) / 255 * k) for i in (0, 2, 4)) + (1.0,)


def _sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def _add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def _mul(a, k): return (a[0] * k, a[1] * k, a[2] * k)
def _dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def newell(pts):
    n = [0.0, 0.0, 0.0]
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1])
    return n


class Builder:
    """Collects faces into one bmesh with a colour per face corner. Every face is turned to face `out`."""

    def __init__(self, detail=True):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.color.new('Col')
        self.detail = detail

    def face(self, pts, c, out=None, k=1.0):
        pts = [tuple(p) for p in pts]
        if out is not None and _dot(newell(pts), out) < 0:
            pts = pts[::-1]
        vs = [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(vs)
        for l in f.loops:
            l[self.col] = hexc(c, k)
        return f

    def solid(self, faces, c, centre=None, k=1.0):
        """Faces of a convex part, each turned away from its middle."""
        if centre is None:
            ps = [p for f in faces for p in f]
            centre = tuple(sum(p[i] for p in ps) / len(ps) for i in range(3))
        for f in faces:
            m = tuple(sum(p[i] for p in f) / len(f) for i in range(3))
            self.face(f, c, _sub(m, centre), k)

    def finish(self, name):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-6)
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me); self.bm.free()
        try:
            me.color_attributes.active_color_index = 0
            me.color_attributes.render_color_index = 0
        except Exception:
            pass
        ob = bpy.data.objects.new(name, me)
        (getattr(self, 'coll', None) or bpy.context.scene.collection).objects.link(ob)
        mat = bpy.data.materials.get('NS_Board') or make_material()
        me.materials.append(mat)
        return ob


def make_material():
    m = bpy.data.materials.new('NS_Board')
    try:
        m.use_nodes = True     # (always on in newer Blender)
    except Exception:
        pass
    nt = m.node_tree
    b = nt.nodes.get('Principled BSDF')
    ca = nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = 'Col'
    nt.links.new(ca.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = .7
    return m


# ================================================================ the deck
def centreline(u):
    """Point on the underside's centre line and the deck's up direction, at distance u along the deck
    (u > 0 toward the nose, which is -Y)."""
    s, side = abs(u), (1 if u >= 0 else -1)
    th_max = NOSE if side > 0 else TAIL
    y = z = 0.0
    th = 0.0
    if s > KICK:   # walk along the bend
        n = max(4, int((s - KICK) / .002))
        h = (s - KICK) / n
        y = KICK
        for i in range(n):
            t = (i + .5) * h / RAMP
            th = th_max * (t * t * (3 - 2 * t) if t < 1 else 1)
            y += math.cos(th) * h
            z += math.sin(th) * h
    else:
        y = s
    p = (0.0, -side * y, DECK_Z + z)
    up = (0.0, side * math.sin(th), math.cos(th))
    return p, up, th


def half_width(u):
    s = abs(u)
    if s <= HALF - W2:
        return W2
    t = (s - (HALF - W2)) / W2
    return W2 * math.sqrt(max(0.0, 1 - t * t))


def deck(B):
    d = B.detail
    us = []
    # stations: few in the flat middle, close together in the bends and the round ends
    mid = [-.20, -.16, -.10, -.04, .04, .10, .16, .20] if d else [-.16, 0.0, .16]
    for sgn in (1, -1):
        s = KICK
        while s < HALF - W2:
            us.append(sgn * s); s += .016 if d else .03
        n = 9 if d else 5
        for i in range(n):
            a = (i / n) * math.pi / 2 * .93
            us.append(sgn * (HALF - W2 + W2 * math.sin(a)))
        us.append(sgn * (HALF - W2 + W2 * math.sin(math.pi / 2 * .975)))
    us = sorted(set(round(u, 5) for u in us + mid + [-KICK, KICK]))
    xs = [-.93, -.34, 0.0, .34, .93] if d else [-.93, -.34, .34, .93]   # across the width (fractions of it)

    def section(u):
        p, up, th = centreline(u)
        w = half_width(u)
        kick = min(1.0, max(0.0, (abs(u) - KICK) / RAMP))
        cc = CONC * (1 - .6 * kick)
        bot = [_add(p, _add((v * w, 0, 0), _mul(up, cc * v * v))) for v in xs]
        top = [_add(b, _mul(up, T)) for b in bot]
        rails = [_add(p, _add((sg * w, 0, 0), _mul(up, cc + T * .5))) for sg in (-1, 1)]
        return dict(p=p, up=up, top=top, bot=bot, rails=rails, w=w)

    S = [section(u) for u in us]
    for j in range(len(S) - 1):
        a, b = S[j], S[j + 1]
        up = _mul(_add(a['up'], b['up']), .5)
        dn = _mul(up, -1)
        mid_u = (us[j] + us[j + 1]) / 2
        for i in range(len(xs) - 1):
            B.face([a['top'][i], a['top'][i + 1], b['top'][i + 1], b['top'][i]], GRIP if (i + j) % 3 else GRIP2, up)
            v = (xs[i] + xs[i + 1]) / 2
            stripe = WHITE if abs(v) < .34 else GREEN
            end = abs(mid_u) > HALF - .05
            B.face([a['bot'][i], a['bot'][i + 1], b['bot'][i + 1], b['bot'][i]], GREEN if end else stripe, dn)
        lim = HALF - W2   # the round ends are circles about these points
        c0 = centreline(max(-lim, min(lim, mid_u)))[0]
        for side, ti, ri in ((-1, 0, 0), (1, -1, 1)):
            f1 = [a['top'][ti], b['top'][ti], b['rails'][ri], a['rails'][ri]]
            f2 = [a['rails'][ri], b['rails'][ri], b['bot'][ti], a['bot'][ti]]
            for f, c in ((f1, WOOD), (f2, WOOD2)):
                m = tuple(sum(p[q] for p in f) / 4 for q in range(3))
                o = _sub(m, c0)
                B.face(f, c, (o[0], o[1], 0))
    # the two ends: close the rounded tips
    for e, s in ((S[0], -1), (S[-1], 1)):
        p, up = e['p'], e['up']
        out = (0, -s * up[2], s * up[1])   # along the deck, outward
        ring = [e['rails'][0]] + e['top'] + [e['rails'][1]] + e['bot'][::-1]
        B.face(ring, WOOD, out)
    return S


def bolt_heads(B, y):
    for x in (-.021, .021):
        for dy in (-.026, .026):
            z = DECK_Z + T + CONC * (x / W2) ** 2 + .0002
            h, s = .0012, .0042
            c = (x, y + dy, z)
            box(B, c[0] - s, c[0] + s, c[1] - s, c[1] + s, z, z + h, BOLT)


def box(B, x0, x1, y0, y1, z0, z1, c, k=1.0):
    P = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    Q = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    B.solid([[P[i] for i in q] for q in Q], c, k=k)


def prism_x(B, x0, x1, pts, c, k=1.0):
    """A straight bar along X with the cross-section pts [(y, z)...] (convex)."""
    a = [(x0, y, z) for y, z in pts]
    b = [(x1, y, z) for y, z in pts]
    faces = [a, b] + [[a[i], a[(i + 1) % len(pts)], b[(i + 1) % len(pts)], b[i]] for i in range(len(pts))]
    B.solid(faces, c, k=k)


def ring_pts(cy, cz, r, n, a0=0.0):
    return [(cy + r * math.cos(a0 + 2 * math.pi * i / n), cz + r * math.sin(a0 + 2 * math.pi * i / n)) for i in range(n)]


def cyl_z(B, cx, cy, z0, z1, r, n, c):
    a = [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), z0) for i in range(n)]
    b = [(p[0], p[1], z1) for p in a]
    B.solid([a, b] + [[a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]] for i in range(n)], c)


# ================================================================ trucks and wheels
def truck(B, y, toward):
    """One truck at y; `toward` = +1 if the board's middle is toward +y from it."""
    d = B.detail
    zt = DECK_Z
    # baseplate (bolted under the deck) and its riser pad
    box(B, -.029, .029, y - .034, y + .034, zt - .0085, zt - .0005, METAL2)
    box(B, -.032, .032, y - .037, y + .037, zt - .0005, zt, BOLT)
    # kingpin housing with the bushing, a little toward the middle of the board
    cy = y + toward * .008
    cyl_z(B, 0, cy, zt - .021, zt - .0085, .0135, 10 if d else 6, BUSH)
    if d:
        cyl_z(B, 0, cy, zt - .025, zt - .021, .0105, 8, METAL2)   # the kingpin nut and washer
    # hanger: the middle block and the two arms out to the wheels
    box(B, -.024, .024, y - .017, y + .017, AXLE_Z + .006, zt - .021, METAL)
    sec = [(y - .011, AXLE_Z - .007), (y + .011, AXLE_Z - .007), (y + .016, AXLE_Z + .008), (y + .007, AXLE_Z + .017),
           (y - .007, AXLE_Z + .017), (y - .016, AXLE_Z + .008)]
    prism_x(B, -.079, .079, sec, METAL)
    # axle
    n = 6 if d else 4
    prism_x(B, -WHEEL_X - WHEEL_W / 2 - .004, WHEEL_X + WHEEL_W / 2 + .004, ring_pts(y, AXLE_Z, .0038, n), METAL2)
    if d:
        for sx in (-1, 1):   # axle nuts
            x0 = sx * (WHEEL_X + WHEEL_W / 2)
            prism_x(B, min(x0, x0 + sx * .0055), max(x0, x0 + sx * .0055), ring_pts(y, AXLE_Z, .0062, 6, math.pi / 6), BOLT)
    for sx in (-1, 1):
        wheel(B, sx * WHEEL_X, y, sx)


def wheel(B, cx, y, sx):
    d = B.detail
    n = 14 if d else 8
    r_lip = WHEEL_R * .8
    xin, xout = cx - sx * WHEEL_W / 2, cx + sx * WHEEL_W / 2
    prof = [(xin, r_lip), (xin + sx * .004, WHEEL_R), (xout - sx * .005, WHEEL_R), (xout, WHEEL_R * .82)] if d else [(xin, r_lip), (xin + sx * .003, WHEEL_R), (xout - sx * .003, WHEEL_R), (xout, WHEEL_R * .82)]
    rings = [[(x, y + r * math.cos(2 * math.pi * i / n), AXLE_Z + r * math.sin(2 * math.pi * i / n)) for i in range(n)] for x, r in prof]
    ctr = (cx, y, AXLE_Z)
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(n):
            j = (i + 1) % n
            f = [a[i], a[j], b[j], b[i]]
            m = tuple(sum(p[q] for p in f) / 4 for q in range(3))
            B.face(f, URE if k == 1 else URE2, _sub(m, ctr))
    # inner face, and the outer face with its green core
    B.face(rings[0], URE2, (-sx, 0, 0))
    rc = WHEEL_R * .45
    core = [(xout + sx * .0003, y + rc * math.cos(2 * math.pi * i / n), AXLE_Z + rc * math.sin(2 * math.pi * i / n)) for i in range(n)]
    outer = rings[-1]
    for i in range(n):
        j = (i + 1) % n
        B.face([outer[i], outer[j], core[j], core[i]], URE2, (sx, 0, 0))
    B.face(core, CORE, (sx, 0, 0))


# ================================================================ the board
def skateboard(detail, coll=None):
    B = Builder(detail)
    B.coll = coll
    deck(B)
    for y, toward in ((-TRUCK_Y, 1), (TRUCK_Y, -1)):
        truck(B, y, toward)
        if detail:
            bolt_heads(B, y)
    return B.finish('skateboard' + ('' if detail else '_lod1'))


BUILDS = (skateboard,)


def export(ob, path):
    """Only this object goes in the file."""
    vl = bpy.context.view_layer
    for o in vl.objects:
        o.select_set(False)
    ob.select_set(True)
    vl.objects.active = ob
    loc = ob.location.copy(); ob.location = (0, 0, 0)
    args = dict(filepath=path, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                export_texcoords=False, export_normals=True, export_materials='EXPORT', export_vertex_color='ACTIVE')
    for drop in ([], ['export_vertex_color'], ['export_vertex_color', 'export_texcoords']):
        a = {k: v for k, v in args.items() if k not in drop}
        try:
            bpy.ops.export_scene.gltf(**a)
            break
        except TypeError:
            continue
    ob.location = loc


def main():
    os.makedirs(OUT, exist_ok=True)
    sc = bpy.context.scene
    coll = bpy.data.collections.get('NS Skateboard') or bpy.data.collections.new('NS Skateboard')
    if coll.name not in sc.collection.children:
        sc.collection.children.link(coll)
    for ob in [o for o in bpy.data.objects if o.name.startswith('skateboard')]:
        bpy.data.objects.remove(ob, do_unlink=True)
    cube = bpy.data.objects.get('Cube')   # the start-up cube would hide the board
    if cube and cube.type == 'MESH' and len(cube.data.vertices) == 8 and cube.name in bpy.context.view_layer.objects:
        cube.hide_set(True)
    made = []
    for detail in (True, False):
        ob = skateboard(detail, coll)
        export(ob, os.path.join(OUT, ob.name + '.glb'))
        ob.location = (0, 0, 0) if detail else (.5, 0, 0)
        made.append(ob.name)
    # show it: frame the board, colours on
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            sp = area.spaces.active
            sp.shading.type = 'SOLID'
            sp.shading.color_type = 'VERTEX'
            r3 = sp.region_3d
            r3.view_location = (.2, 0, .06)
            r3.view_distance = 1.5
            from mathutils import Euler
            r3.view_rotation = Euler((math.radians(62), 0, math.radians(-38)), 'XYZ').to_quaternion()
    print('Naija skateboard exported to', OUT, made)
    return made


if __name__ == '__main__':
    main()
