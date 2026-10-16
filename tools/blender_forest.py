"""Naija Streets: the bandits' forest in Under Bridge, their truck, and the third cult's base. Built in Blender.

  ub_btruck      - the bandits' pickup truck: dusty olive, bull bar, benches in the open back (a vehicle in the game:
                   four wheels touching the ground, front toward -Y)
  fr_tree_a      - a tall forest tree (16 m) with buttress roots and a broad crown
  fr_tree_b      - a tall umbrella tree (13 m), thin trunk, flat wide crown
  fr_bush_a/b    - thick bushes
  fr_rock_a/b    - rocks
  fr_tent        - a tarpaulin tent on poles, ground sheet, ropes
  fr_fire        - the cooking fire: ring of stones, logs, a tripod and a black pot (flames in the game)
  fr_log         - a log to sit on
  fr_post        - the post they tie people to, rope coiled round it
  ub_base_yellow - the third cult's base (Yellow Hornets), like the red and blue ones
Each as one mesh, one material, a colour per face corner, Z up, front toward -Y (= +Z in the game); plus a lighter _lod1.

Run inside Blender (Scripting > New > paste > Run Script): the pieces appear in a collection "NS Forest" and the .glb files
go to Documents/naija_ikeja/models. Or headless: python3 tools/glb_build.py -m blender_forest
"""
import bpy, bmesh, math, os

OUT = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_ikeja', 'models')


def hexc(h, k=1.0):
    h = h.lstrip('#')
    return tuple(min(1.0, int(h[i:i + 2], 16) / 255 * k) for i in (0, 2, 4)) + (1.0,)


def _sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def _dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def newell(pts):
    n = [0.0, 0.0, 0.0]
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1])
    return n


def hf(*a):
    s = 0.0
    for i, t in enumerate(a):
        s += (t + 1.37) * (12.9898 + 7.233 * i)
    x = math.sin(s) * 43758.5453
    return x - math.floor(x)


class Builder:
    """Collects faces into one bmesh with a colour per face corner; faces are turned to face `out` (or away from a part's middle)."""

    def __init__(self, detail=True):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.color.new('Col')
        self.detail = detail
        self.coll = None

    def face(self, pts, c, out=None, shade=None):
        pts = [tuple(p) for p in pts]
        if out is not None and _dot(newell(pts), out) < 0:
            pts = pts[::-1]
            if shade: shade = shade[::-1]
        vs = [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(vs)
        for i, l in enumerate(f.loops):
            l[self.col] = hexc(c, shade[i] if shade else 1.0)
        return f

    def solid(self, faces, c, centre=None, grime=None):
        if centre is None:
            ps = [p for f in faces for p in f]
            centre = tuple(sum(p[i] for p in ps) / len(ps) for i in range(3))
        for f in faces:
            m = tuple(sum(p[i] for p in f) / len(f) for i in range(3))
            self.face(f, c, _sub(m, centre), [grime(p[2]) for p in f] if grime else None)

    def box(self, x0, x1, y0, y1, z0, z1, c, grime=None, bottom=True):
        x0, x1 = min(x0, x1), max(x0, x1); y0, y1 = min(y0, y1), max(y0, y1); z0, z1 = min(z0, z1), max(z0, z1)
        P = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        Q = [(4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)] + ([(0, 1, 2, 3)] if bottom else [])
        self.solid([[P[i] for i in q] for q in Q], c, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), grime)

    def prism(self, base, z0, z1, c, grime=None, top=True, bottom=False):
        """an upright prism on the polygon base [(x, y)...] (convex)"""
        a = [(x, y, z0) for x, y in base]; b = [(x, y, z1) for x, y in base]; n = len(base)
        faces = [[a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]] for i in range(n)]
        if top: faces.append(b)
        if bottom: faces.append(a)
        cx = sum(p[0] for p in base) / n; cy = sum(p[1] for p in base) / n
        self.solid(faces, c, (cx, cy, (z0 + z1) / 2), grime)

    def cyl(self, cx, cy, z0, z1, r, n, c, top=True):
        self.prism([(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)], z0, z1, c, top=top)

    def finish(self, name):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me); self.bm.free()
        try:
            me.color_attributes.active_color_index = 0
            me.color_attributes.render_color_index = 0
        except Exception:
            pass
        ob = bpy.data.objects.new(name, me)
        (self.coll or bpy.context.scene.collection).objects.link(ob)
        mat = bpy.data.materials.get('NS_House') or make_material()
        me.materials.append(mat)
        return ob


def make_material():
    m = bpy.data.materials.new('NS_House')
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    b = nt.nodes.get('Principled BSDF')
    ca = nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = 'Col'
    nt.links.new(ca.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = .85
    return m


CONC = '#a6a299'; CONC2 = '#8e8a82'; POSTERS = ['#d63b2f', '#f2c12e', '#2e6fd6', '#f4f1e8', '#1f9a52', '#e86a1e', '#7a3fa0']
ZINC = '#9aa0a4'; ZINC2 = '#7f868b'; RUST = '#8a4b2a'; WOOD = '#8a5d3b'; WOOD2 = '#6f4a2e'; TARP = '#2f6fb3'
GRIME = lambda z: .78 + .22 * min(1.0, z / 2.2)




BLOCK = '#9b978f'; BLOCK2 = '#8a867e'; PAINT = '#ece8de'
LEAF = ['#2f5d23', '#3a6b2a', '#284f1e', '#447a30', '#35622a']; BARK = '#5b4636'; BARK2 = '#4a3a2c'


def tri_blob(B, cx, cy, cz, rx, ry, rz, cols, seed=0, sub=1, shade=None):
    """an uneven ball (icosahedron, split once), squashed to rx, ry, rz, each face a slightly different colour"""
    t = (1 + 5 ** .5) / 2
    V = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    V = [tuple(c / math.sqrt(sum(q * q for q in v)) for c in v) for v in V]
    F = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
         (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    for _ in range(sub):
        mid = {}
        def m(a, b):
            k = (min(a, b), max(a, b))
            if k not in mid:
                p = tuple((V[a][i] + V[b][i]) / 2 for i in range(3)); l = math.sqrt(sum(q * q for q in p)); V.append(tuple(q / l for q in p)); mid[k] = len(V) - 1
            return mid[k]
        F2 = []
        for a, b, c in F:
            ab, bc, ca = m(a, b), m(b, c), m(c, a); F2 += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        F = F2
    P = []
    for i, v in enumerate(V):
        k = .82 + .36 * hf(i, seed, 3.1)
        P.append((cx + v[0] * rx * k, cy + v[1] * ry * k, cz + v[2] * rz * k))
    for j, (a, b, c) in enumerate(F):
        f = [P[a], P[b], P[c]]; mz = sum(p[2] for p in f) / 3
        col = cols[int(hf(j, seed) * len(cols)) % len(cols)]
        s = shade(mz) if shade else 1.0
        B.face(f, col, (sum(p[0] for p in f) / 3 - cx, sum(p[1] for p in f) / 3 - cy, mz - cz), [s, s, s])


def taper(B, x, y, z0, z1, r0, r1, n, c, top=True):
    """a round trunk or pole, wider at the foot"""
    lo = [(x + r0 * math.cos(2 * math.pi * i / n), y + r0 * math.sin(2 * math.pi * i / n), z0) for i in range(n)]
    hi = [(x + r1 * math.cos(2 * math.pi * i / n), y + r1 * math.sin(2 * math.pi * i / n), z1) for i in range(n)]
    for i in range(n):
        j = (i + 1) % n; f = [lo[i], lo[j], hi[j], hi[i]]
        B.face(f, c, (f[0][0] + f[1][0] - 2 * x, f[0][1] + f[1][1] - 2 * y, 0), [.8, .8, 1, 1])
    if top: B.face(hi, c, (0, 0, 1))


def stick(B, a, b, r, c, n=5):
    """a pole from point a to point b"""
    d = [b[i] - a[i] for i in range(3)]; L = math.sqrt(sum(q * q for q in d)) or 1; d = [q / L for q in d]
    up = (0, 0, 1) if abs(d[2]) < .9 else (1, 0, 0)
    u = (d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]); ul = math.sqrt(sum(q * q for q in u)); u = [q / ul for q in u]
    w = (d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0])
    ring = lambda p: [tuple(p[k] + r * (math.cos(2 * math.pi * i / n) * u[k] + math.sin(2 * math.pi * i / n) * w[k]) for k in range(3)) for i in range(n)]
    A, Bb = ring(a), ring(b)
    for i in range(n):
        j = (i + 1) % n; f = [A[i], A[j], Bb[j], Bb[i]]; m = [sum(p[k] for p in f) / 4 for k in range(3)]; cm = [(a[k] + b[k]) / 2 for k in range(3)]
        B.face(f, c, (m[0] - cm[0], m[1] - cm[1], m[2] - cm[2]))


def wheel(B, cx, cy, cz, r, w, detail):
    """a tyre and its rim, axle along X"""
    n = 14 if detail else 8
    ring = lambda x, rr: [(x, cy + rr * math.cos(2 * math.pi * (i + .5) / n), cz + rr * math.sin(2 * math.pi * (i + .5) / n)) for i in range(n)]
    o0, o1 = ring(cx - w / 2, r), ring(cx + w / 2, r)
    for i in range(n):
        j = (i + 1) % n; f = [o0[i], o0[j], o1[j], o1[i]]
        B.face(f, '#1b1b1b', (0, f[0][1] + f[1][1] - 2 * cy, f[0][2] + f[1][2] - 2 * cz))
    for x, sgn in ((cx - w / 2, -1), (cx + w / 2, 1)):
        rim = ring(x + sgn * .005, r * .62); tyre = ring(x, r)
        for i in range(n):
            j = (i + 1) % n; B.face([tyre[i], tyre[j], rim[j], rim[i]], '#202020', (sgn, 0, 0))
        B.face(rim, '#8d8a84', (sgn, 0, 0))


# ================================================================ the bandits' truck
def btruck(detail):
    B = Builder(detail)
    OL, OL2, RU, DK = '#56603f', '#4a5336', '#7a4a2a', '#202020'
    G = lambda z: .8 + .2 * min(1.0, z / 1.8)
    # chassis and the open back (bed floor at 1.0 m), benches along the sides
    B.box(-.62, .62, -2.35, 2.35, .48, .72, DK)
    B.box(-.95, .95, -.25, 2.6, .9, 1.02, '#5d5a52', G)                     # bed floor
    for x in (-.95, .95):
        B.box(x - .05, x + .05, -.25, 2.6, 1.0, 1.48, OL, G)                # sides
    B.box(-.95, .95, 2.55, 2.62, .95, 1.42, OL2, G)                         # tailgate
    for x in (-.72, .72):
        B.box(x - .16, x + .16, .1, 2.45, 1.02, 1.36, '#6b4a2e')            # benches
    # the cab: lower body, slanted windscreen, roof, windows
    B.box(-.93, .93, -1.62, -.25, .72, 1.32, OL, G)
    cab = [(-.93, -1.45, 1.32), (.93, -1.45, 1.32), (.93, -1.05, 1.98), (-.93, -1.05, 1.98), (-.93, -.28, 1.32), (.93, -.28, 1.32), (.93, -.3, 1.98), (-.93, -.3, 1.98)]
    Q = [(0, 1, 2, 3), (4, 5, 6, 7), (3, 2, 6, 7), (0, 3, 7, 4), (1, 2, 6, 5)]
    cols = ['#1d2a30', '#2a2f2c', OL, '#1d2a30', '#1d2a30']
    for q, c in zip(Q, cols):
        f = [cab[i] for i in q]; m = [sum(p[k] for p in f) / 4 for k in range(3)]
        B.face(f, c, (m[0], m[1] + .87, m[2] - 1.6))
    B.box(-.95, .95, -1.08, -.27, 1.98, 2.04, OL2)                          # roof
    for x in (-.94, .94):                                                    # door pillars over the side windows
        B.box(x - .012, x + .012, -.7, -.62, 1.32, 1.98, OL2)
    # bonnet, grille, lights, bull bar, bumpers
    B.box(-.92, .92, -2.62, -1.6, .72, 1.24, OL, G)
    B.box(-.8, .8, -2.66, -2.62, .8, 1.12, DK)
    for x in (-.68, .68):
        B.box(x - .14, x + .14, -2.68, -2.62, 1.0, 1.12, '#f4efc8')
    B.box(-.98, .98, -2.82, -2.62, .62, .78, '#2c2c2c')                     # front bumper
    for x in (-.55, .55):
        B.box(x - .05, x + .05, -2.95, -2.85, .62, 1.3, '#3a3a3a')          # bull bar uprights
    B.box(-.6, .6, -2.95, -2.85, 1.22, 1.3, '#3a3a3a')
    B.box(-.98, .98, 2.6, 2.75, .62, .78, '#2c2c2c')                        # rear bumper
    for x in (-.8, .8):
        B.box(x - .1, x + .1, 2.62, 2.64, 1.2, 1.32, '#b22a1e')             # tail lights
    # wheel arches (kept clear of the tyres), mirrors
    for y in (-1.75, 1.55):
        for x in (-.97, .97):
            B.box(x - .06, x + .06, y - .6, y + .6, .9, 1.0, OL2)
    for x in (-1.08, 1.08):
        B.box(x - .06, x + .06, -1.4, -1.32, 1.4, 1.58, DK)
    if detail:                                                               # rust, a spare tyre and jerrycans in the back
        for i in range(6):
            x = .955 if i % 2 else -.955; y = -.1 + hf(i, 7) * 2.5; z = 1.06 + hf(i, 3) * .3
            B.box(x - .006, x + .006, y, y + .3 + hf(i, 9) * .3, z, z + .14, RU)
        wheel(B, 0, 2.15, 1.25, .38, .26, False)
        for i, x in enumerate((-.35, -.05)):
            B.box(x - .12, x + .12, 1.75, 1.95, 1.02, 1.45, '#2f6b2a' if i else '#b8862a')
    # four wheels touching the ground
    for y in (-1.75, 1.55):
        for x in (-.82, .82):
            wheel(B, x, y, .4, .4, .27, detail)
    return B.finish('ub_btruck' + ('' if detail else '_lod1'))


# ================================================================ the forest
def tree_a(detail):
    B = Builder(detail)
    n = 8 if detail else 5
    taper(B, 0, 0, 0, 15.5, .55, .22, n, BARK)
    if detail:                                                               # buttress roots
        for i in range(5):
            a = 2 * math.pi * i / 5 + .3; ca, sa = math.cos(a), math.sin(a)
            p = [(ca * .3, sa * .3, 0), (ca * 1.5, sa * 1.5, 0), (ca * .45, sa * .45, 2.2)]
            B.face(p, BARK2, (-sa, ca, 0)); B.face(p, BARK2, (sa, -ca, 0))
        for i in range(4):                                                   # boughs
            a = 2 * math.pi * i / 4 + .6
            stick(B, (0, 0, 12.5 + i * .6), (math.cos(a) * 3.2, math.sin(a) * 3.2, 15.2 + hf(i, 2) * 1.2), .14, BARK)
    blobs = [(0, 0, 16.4, 4.2, 4.0, 2.4), (2.6, .8, 15.6, 2.8, 2.6, 1.8), (-2.4, -1.0, 15.4, 2.9, 2.6, 1.8), (.6, -2.6, 15.8, 2.6, 2.4, 1.7), (-1, 2.5, 15.9, 2.6, 2.4, 1.7)]
    for k, (x, y, z, rx, ry, rz) in enumerate(blobs if detail else blobs[:2]):
        tri_blob(B, x, y, z, rx, ry, rz, LEAF, seed=k, sub=1 if detail else 0, shade=lambda zz: .78 + .22 * min(1, max(0, (zz - 13) / 5)))
    return B.finish('fr_tree_a' + ('' if detail else '_lod1'))


def tree_b(detail):
    B = Builder(detail)
    n = 7 if detail else 5
    taper(B, 0, 0, 0, 10.5, .32, .16, n, '#6a5a48')
    if detail:
        for i in range(5):
            a = 2 * math.pi * i / 5
            stick(B, (0, 0, 9.5), (math.cos(a) * 3.8, math.sin(a) * 3.8, 11.8), .1, '#6a5a48')
    for k, (x, y, rx, ry) in enumerate([(0, 0, 5.2, 4.8), (2.8, 1.0, 2.6, 2.4), (-2.6, -1.2, 2.8, 2.4)] if detail else [(0, 0, 5.4, 5.0)]):
        tri_blob(B, x, y, 12.4, rx, ry, 1.2, ['#4f7d2c', '#5a8a33', '#466f27', '#6a9a3a'], seed=10 + k, sub=1 if detail else 0, shade=lambda zz: .8 + .2 * min(1, max(0, (zz - 11.5) / 2)))
    return B.finish('fr_tree_b' + ('' if detail else '_lod1'))


def bush_a(detail):
    B = Builder(detail)
    parts = [(0, 0, .8, 1.3, 1.2, .9), (.9, .4, .6, .9, .8, .7), (-.8, -.3, .6, .9, .9, .7), (.2, -.9, .5, .8, .7, .6)]
    for k, p in enumerate(parts if detail else parts[:2]):
        tri_blob(B, *p, cols=['#3d6b2b', '#4b7a33', '#335c24', '#56853a'], seed=20 + k, sub=1 if detail else 0, shade=lambda zz: .72 + .28 * min(1, zz / 1.4))
    return B.finish('fr_bush_a' + ('' if detail else '_lod1'))


def bush_b(detail):
    B = Builder(detail)
    parts = [(0, 0, 1.1, 1.1, 1.1, 1.2), (.7, .5, .7, .8, .8, .8), (-.6, .4, .6, .7, .7, .7)]
    for k, p in enumerate(parts if detail else parts[:1]):
        tri_blob(B, *p, cols=['#4a6e26', '#5c7f2e', '#3f6021', '#6d8f35'], seed=30 + k, sub=1 if detail else 0, shade=lambda zz: .72 + .28 * min(1, zz / 1.8))
    if detail:
        for i in range(5):                                                   # a few dry stalks
            a = 2 * math.pi * i / 5
            stick(B, (math.cos(a) * .4, math.sin(a) * .4, 0), (math.cos(a) * 1.1, math.sin(a) * 1.1, 2.0 + hf(i, 5) * .6), .025, '#a08a52', 4)
    return B.finish('fr_bush_b' + ('' if detail else '_lod1'))


def rock_a(detail):
    B = Builder(detail)
    tri_blob(B, 0, 0, .35, 1.1, .9, .7, ['#8a847a', '#7b756b', '#958f84', '#6f695f'], seed=40, sub=1 if detail else 0)
    if detail:
        tri_blob(B, .9, .5, .2, .5, .45, .35, ['#7b756b', '#8a847a'], seed=41, sub=0)
    return B.finish('fr_rock_a' + ('' if detail else '_lod1'))


def rock_b(detail):
    B = Builder(detail)
    tri_blob(B, 0, 0, .6, .9, 1.0, 1.0, ['#7d6f5e', '#8a7b68', '#6d604f', '#968670'], seed=50, sub=1 if detail else 0)
    return B.finish('fr_rock_b' + ('' if detail else '_lod1'))


def tent(detail):
    B = Builder(detail)
    L, W, H = 1.6, 1.15, 1.75
    TARP = '#2f6fb3'; TARP2 = '#2a62a0'
    B.box(-W - .1, W + .1, -L - .2, L + .2, 0, .02, '#5a6e3a')               # ground sheet
    for s in (-1, 1):                                                         # the two roof sides
        f = [(0, -L, H), (0, L, H), (s * W, L, .05), (s * W, -L, .05)]
        B.face(f, TARP if s < 0 else TARP2, (s, 0, .6)); B.face(f, '#244f80', (-s, 0, -.6))
    B.face([(-W, L, .05), (W, L, .05), (0, L, H)], TARP2, (0, 1, 0))        # the closed back
    B.face([(-W, L, .05), (W, L, .05), (0, L, H)], '#244f80', (0, -1, 0))
    for y in (-L - .05, L + .05):
        stick(B, (0, y, 0), (0, y, H + .15), .04, '#6b4a2e', 4)
    stick(B, (0, -L - .05, H + .1), (0, L + .05, H + .1), .03, '#6b4a2e', 4)
    if detail:
        for s in (-1, 1):
            stick(B, (0, -L - .05, H + .1), (s * .6, -L - 1.3, 0), .012, '#d8d0b0', 3)
            stick(B, (0, L + .05, H + .1), (s * .6, L + 1.3, 0), .012, '#d8d0b0', 3)
        B.box(-.5, .3, .3, 1.4, .02, .2, '#8a2a2a')                           # a blanket roll inside
    return B.finish('fr_tent' + ('' if detail else '_lod1'))


def fire(detail):
    B = Builder(detail)
    n = 9 if detail else 6
    for i in range(n):                                                        # the ring of stones
        a = 2 * math.pi * i / n
        tri_blob(B, math.cos(a) * .55, math.sin(a) * .55, .1, .14, .12, .11, ['#6f6a62', '#5c574f', '#7d776d'], seed=60 + i, sub=0)
    for i in range(3 if detail else 2):                                       # logs across the fire
        a = 2 * math.pi * i / 3
        stick(B, (math.cos(a) * .5, math.sin(a) * .5, .06), (-math.cos(a) * .15, -math.sin(a) * .15, .16), .06, '#3a2a1e', 5)
    B.cyl(0, 0, 0, .03, .3, 8, '#1a1512')                                     # ash and embers
    top = (0, 0, 1.25)
    for i in range(3):                                                        # the tripod and the pot
        a = 2 * math.pi * i / 3 + .5
        stick(B, (math.cos(a) * .75, math.sin(a) * .75, 0), top, .03, '#5b4636', 4)
    stick(B, top, (0, 0, .78), .008, '#3a3a3a', 3)
    B.cyl(0, 0, .42, .76, .26, 10 if detail else 6, '#1e1e1e')
    B.cyl(0, 0, .74, .76, .22, 10 if detail else 6, '#5a3a1a')               # the soup in the pot
    return B.finish('fr_fire' + ('' if detail else '_lod1'))


def log(detail):
    B = Builder(detail)
    stick(B, (-1.0, 0, .2), (1.0, 0, .22), .2, '#5b4636', 7 if detail else 5)
    return B.finish('fr_log' + ('' if detail else '_lod1'))


def post(detail):
    B = Builder(detail)
    taper(B, 0, 0, 0, 1.9, .11, .09, 7 if detail else 5, '#5b4636')
    if detail:
        for i, z in enumerate((.35, .45, .55, 1.0, 1.08)):
            B.cyl(0, 0, z, z + .04, .125, 8, '#c9b98a')                      # rope round the post
        B.box(-.6, .6, .2, 1.2, 0, .02, '#7a6a4a')                            # a worn mat
    return B.finish('fr_post' + ('' if detail else '_lod1'))


def base_yellow(detail): return _base(detail, '#d4a514', 'ub_base_yellow')


BUILDS = (btruck, tree_a, tree_b, bush_a, bush_b, rock_a, rock_b, tent, fire, log, post, base_yellow)


# ================================================================ the third cult base
def _base(detail, band, name):
    B = Builder(detail)
    # the back wall: blocks, painted, the cult's band across it and a round emblem
    B.box(-4.0, 4.0, 2.3, 2.6, 0, 2.5, PAINT, GRIME)
    B.box(-4.05, 4.05, 2.25, 2.65, 2.5, 2.62, '#c9c4b8')
    for x in (-4.0, 4.0):                                      # short side walls
        B.box(x - .15, x + .15, -.5, 2.6, 0, 1.4, PAINT, GRIME)
    B.box(-4.0, 4.0, 2.27, 2.3, 1.05, 1.75, band)
    ring = [(0 + 1.0 * math.cos(2 * math.pi * i / 20), 2.265, 1.4 + 1.0 * math.sin(2 * math.pi * i / 20)) for i in range(20)]
    B.face(ring, '#141414', (0, -1, 0))
    ring2 = [(0 + .82 * math.cos(2 * math.pi * i / 20), 2.26, 1.4 + .82 * math.sin(2 * math.pi * i / 20)) for i in range(20)]
    B.face(ring2, band, (0, -1, 0))
    for s in (-1, 1):                                          # two crossed bars in the emblem
        B.face([(-.62, 2.255, 1.4 - s * .55), (-.48, 2.255, 1.4 - s * .69), (.62, 2.255, 1.4 + s * .55), (.48, 2.255, 1.4 + s * .69)], '#141414', (0, -1, 0))
    # tarp shade on four poles, in the cult colour
    for x in (-3.4, 3.4):
        for y in (-2.2, 2.0):
            B.box(x - .05, x + .05, y - .05, y + .05, 0, 2.7, '#5a5a5a')
    B.solid([[(-3.7, -2.5, 2.55), (3.7, -2.5, 2.55), (3.7, 2.2, 2.75), (-3.7, 2.2, 2.75)],
             [(-3.7, -2.5, 2.58), (3.7, -2.5, 2.58), (3.7, 2.2, 2.78), (-3.7, 2.2, 2.78)]], band, (0, 0, 1.5))
    # benches, an old sofa, a speaker, crates
    for x0, x1, y in ((-3.3, -1.1, .2), (1.1, 3.3, .2)):
        B.box(x0, x1, y - .2, y + .2, .42, .48, WOOD)
        for x in (x0 + .2, x1 - .2):
            B.box(x - .12, x + .12, y - .15, y + .15, 0, .42, BLOCK)
    B.box(-1.0, 1.0, 1.35, 2.15, 0, .45, '#6b2a2a')            # the sofa
    B.box(-1.0, 1.0, 1.85, 2.2, .45, 1.0, '#5e2424')
    for x in (-1.0, .82):
        B.box(x, x + .18, 1.35, 2.2, .45, .7, '#5e2424')
    if detail:
        B.box(2.5, 3.1, 1.6, 2.15, 0, 1.1, '#1a1a1a')           # speaker box
        B.face([(2.8 + .2 * math.cos(2 * math.pi * i / 10), 1.595, .75 + .2 * math.sin(2 * math.pi * i / 10)) for i in range(10)], '#3a3a3a', (0, -1, 0))
        for i, (x, y) in enumerate(((-3.2, 1.7), (-2.6, 1.8), (-3.0, 1.2))):   # beer crates
            B.box(x - .25, x + .25, y - .18, y + .18, i * .0, .32, '#1f6b3a' if i % 2 else '#c48a1a')
        B.box(-.3, .3, -.9, -.5, 0, .5, '#8a5d3b')               # a little table
    return B.finish(name + ('' if detail else '_lod1'))


def export(ob, path):
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
    coll = bpy.data.collections.get('NS Forest') or bpy.data.collections.new('NS Forest')
    if coll.name not in sc.collection.children:
        sc.collection.children.link(coll)
    for ob in [o for o in bpy.data.objects if o.name.startswith(('fr_', 'ub_btruck', 'ub_base_yellow'))]:
        bpy.data.objects.remove(ob, do_unlink=True)
    made = []
    for i, fn in enumerate(BUILDS):
        for detail in (True, False):
            ob = fn(detail)
            if ob.name not in coll.objects:
                for c in list(ob.users_collection):
                    c.objects.unlink(ob)
                coll.objects.link(ob)
            export(ob, os.path.join(OUT, ob.name + '.glb'))
            ob.location = ((i % 6) * 18 - 45, 300 + (i // 6) * 22 if detail else 360 + (i // 6) * 22, 0)
            if not detail:
                ob.hide_set(True)
            made.append(ob.name)
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            sp = area.spaces.active
            sp.shading.type = 'SOLID'
            sp.shading.color_type = 'VERTEX'
            sp.clip_end = 2000
            r3 = sp.region_3d
            r3.view_location = (0, 312, 4)
            r3.view_distance = 85
            from mathutils import Euler
            r3.view_rotation = Euler((math.radians(65), 0, math.radians(-15)), 'XYZ').to_quaternion()
    print('Forest kit exported to', OUT, made)
    return made


if __name__ == '__main__':
    main()
