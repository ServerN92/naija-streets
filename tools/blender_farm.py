# Naija Streets: the Farm Settlement kit, built in Blender.
# A Nigerian farm: zinc-roof store, mud farmhouse, chicken coop, cow pen, overhead water tank, farm office,
# the settlement gate, fences, crop beds (dry and watered), maize / cassava / yam / tomato / pepper at three
# stages each, oil palm, plantain, elephant grass, scarecrow, farm tools, the old farm pickup, and the animals:
# a White Fulani cow and a local hen, rigged, with Idle / Walk / Graze (cow) and Idle / Walk / Peck (hen).
# Every piece is one mesh with a colour per face corner (light and shade baked in), Z up, front toward -Y,
# exported as fm_*.glb (+ a lighter fm_*_lod1.glb for the static pieces). A little farm is laid out and rendered.
import bpy, bmesh, math, random, os, time, traceback
from mathutils import Vector, Matrix

BASE = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms')
OUT = os.path.join(BASE, 'farm'); os.makedirs(OUT, exist_ok=True)
LOGF = os.path.join(BASE, 'farm_log.txt')
ONLY = globals().get('ONLY')          # set ONLY = ['fm_cow'] before running to rebuild just some pieces
PREVIEW = globals().get('PREVIEW', True)
def log(*a):
    with open(LOGF, 'a') as f: f.write(time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a) + '\n')


def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c)


def _h(i, j, k, s):
    n = math.sin(i * 127.1 + j * 311.7 + k * 74.7 + s * 19.19) * 43758.5453
    return n - math.floor(n)
def vnoise(p, f=1.0, s=0):
    x, y, z = p[0] * f, p[1] * f, p[2] * f; i, j, k = math.floor(x), math.floor(y), math.floor(z); fx, fy, fz = x - i, y - j, z - k
    fx, fy, fz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz); v = 0
    for a in (0, 1):
        for b in (0, 1):
            for c in (0, 1):
                w = (fx if a else 1 - fx) * (fy if b else 1 - fy) * (fz if c else 1 - fz); v += w * _h(i + a, j + b, k + c, s)
    return v


class MB:
    """One model: faces with a colour at every corner. With bones: every new corner belongs to the current bone."""
    def __init__(self, name, detail=True, seed=1, bones=None):
        self.name = name; self.detail = detail; self.bm = bmesh.new(); self.col = self.bm.loops.layers.color.new('Col'); self.R = random.Random(seed)
        self.bones = bones; self.bone = 0
        if bones: self.dl = self.bm.verts.layers.deform.verify()

    def poly(self, pts, cols, smooth=False):
        vs = [self.bm.verts.new(p) for p in pts]
        if self.bones:
            for v in vs: v[self.dl][self.bone] = 1.0
        try: f = self.bm.faces.new(vs)
        except ValueError: return None
        for l, c in zip(f.loops, cols): l[self.col] = (c[0], c[1], c[2], 1.0)
        f.smooth = smooth; return f

    def shade(self, col, p, var=.12, f=3.0, s=0):
        k = 1 + var * (vnoise(p, f, s) * 2 - 1); return (col[0] * k, col[1] * k, col[2] * k)

    def face(self, pts, col, var=.1, smooth=False, f=3.0, s=0):
        return self.poly(pts, [self.shade(col, p, var, f, s) for p in pts], smooth)

    def box(self, M, sx, sy, sz, col, var=.08, bottom=False, top=True, f=3.0, smooth=False):
        hx, hy = sx / 2, sy / 2
        P = [M @ Vector(v) for v in ((-hx, -hy, 0), (hx, -hy, 0), (hx, hy, 0), (-hx, hy, 0), (-hx, -hy, sz), (hx, -hy, sz), (hx, hy, sz), (-hx, hy, sz))]
        Q = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)] + ([(4, 5, 6, 7)] if top else []) + ([(3, 2, 1, 0)] if bottom else [])
        for q in Q: self.face([P[i] for i in q], col, var, smooth, f=f)

    def cyl(self, M, r0, r1, h, col, n=10, top=True, bottom=False, smooth=True, var=.06, inner=None, col1=None):
        ring = lambda r, z: [M @ Vector((r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), z)) for i in range(n)]
        a, b = ring(r0, 0), ring(r1, h); c1 = col1 or col
        for i in range(n):
            j = (i + 1) % n; self.poly([a[i], a[j], b[j], b[i]], [self.shade(col, a[i], var), self.shade(col, a[j], var), self.shade(c1, b[j], var), self.shade(c1, b[i], var)], smooth)
            if inner: self.face([b[i], b[j], a[j], a[i]], inner, var, smooth)
        if top: self.face(b, c1, var)
        if bottom: self.face(list(reversed(a)), col, var)

    def sphere(self, M, r, col, seg=8, rings=5, var=.1, smooth=True, f=6.0, s=0, colf=None):
        pts = []
        for j in range(rings + 1):
            t = math.pi * j / rings; pts.append([M @ Vector((r * math.sin(t) * math.cos(2 * math.pi * i / seg), r * math.sin(t) * math.sin(2 * math.pi * i / seg), -r * math.cos(t))) for i in range(seg)])
        cf = colf or (lambda p, lp: col); Mi = M.inverted() if colf else M
        for j in range(rings):
            for i in range(seg):
                k = (i + 1) % seg
                if j == 0: q = [pts[0][i], pts[1][k], pts[1][i]]
                elif j == rings - 1: q = [pts[j][i], pts[j][k], pts[j + 1][i]]
                else: q = [pts[j][i], pts[j][k], pts[j + 1][k], pts[j + 1][i]]
                self.poly(q, [self.shade(cf(p, (Mi @ p) if colf else p), p, var, f, s) for p in q], smooth)

    def tube(self, pts, radii, col, n=6, smooth=True, var=.08, cols=None, cap=True):
        """A bent tube through points (stems, horns, tails, vines)."""
        rings = []
        for i, p in enumerate(pts):
            d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            a = Vector((0, 0, 1)) if abs(d.z) < .9 else Vector((1, 0, 0)); u = d.cross(a).normalized(); v = d.cross(u)
            r = radii[i]; rings.append([p + (u * math.cos(2 * math.pi * k / n) + v * math.sin(2 * math.pi * k / n)) * r for k in range(n)])
        for i in range(len(pts) - 1):
            c0 = cols[i] if cols else col; c1 = cols[i + 1] if cols else col
            for k in range(n):
                k2 = (k + 1) % n; self.poly([rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]], [self.shade(c0, rings[i][k], var), self.shade(c0, rings[i][k2], var), self.shade(c1, rings[i + 1][k2], var), self.shade(c1, rings[i + 1][k], var)], smooth)
        if cap: self.face(list(reversed(rings[0])), cols[0] if cols else col, var)
        if cap: self.face(rings[-1], cols[-1] if cols else col, var)

    def loft(self, secs, n=16, colf=None, col=None, var=.03, cap=True):
        """A smooth body through sections (centre Vector, axis-u Vector, axis-v Vector, half-width, up-height, down-height)."""
        rings = []
        for (c, u, v, hw, hu, hd) in secs:
            ring = []
            for k in range(n):
                a = 2 * math.pi * k / n; ca, sa = math.cos(a), math.sin(a)
                ring.append(c + u * (hw * ca) + v * ((hu if sa > 0 else hd) * sa))
            rings.append(ring)
        cf = colf or (lambda p: col)
        for i in range(len(rings) - 1):
            for k in range(n):
                k2 = (k + 1) % n; q = [rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]]
                self.poly(q, [self.shade(cf(p), p, var) for p in q], True)
        if cap:
            for ring, rev in ((rings[0], True), (rings[-1], False)):
                c = sum(ring, Vector()) / len(ring)
                for k in range(n):
                    k2 = (k + 1) % n; tri = [c, ring[k], ring[k2]] if not rev else [c, ring[k2], ring[k]]
                    self.poly(tri, [self.shade(cf(p), p, var) for p in tri], True)

    def leaf(self, base, yaw, pitch, L, W, col, droop=.5, seg=3, tip=None, twist=0.0, both=True, shape='lance'):
        """A leaf (or frond) leaving `base`, pointing `yaw` round, `pitch` up, bending down `droop` along its length."""
        pts = []; p = Vector(base); a = pitch
        dirh = Vector((math.cos(yaw), math.sin(yaw), 0)); side = Vector((-math.sin(yaw), math.cos(yaw), 0))
        for i in range(seg + 1):
            t = i / seg
            w = W * (math.sin(math.pi * min(1, t * 1.15 + .05)) if shape == 'lance' else (1 - t * .85) if shape == 'blade' else (.35 + .65 * math.sin(math.pi * t * .9 + .2)))
            s2 = side * math.cos(twist * t) + Vector((0, 0, 1)) * math.sin(twist * t)
            pts.append((p.copy(), s2 * w / 2))
            step = L / seg; p = p + (dirh * math.cos(a) + Vector((0, 0, 1)) * math.sin(a)) * step; a -= droop / seg * 2
        c2 = tip or col
        for i in range(seg):
            (p0, s0), (p1, s1) = pts[i], pts[i + 1]; t0, t1 = i / seg, (i + 1) / seg
            ca = tuple(col[k] * (1 - t0) + c2[k] * t0 for k in range(3)); cb = tuple(col[k] * (1 - t1) + c2[k] * t1 for k in range(3))
            q = [p0 - s0, p0 + s0, p1 + s1, p1 - s1]
            self.poly(q, [self.shade(ca, q[0], .1), self.shade(ca, q[1], .1), self.shade(cb, q[2], .1), self.shade(cb, q[3], .1)])
            if both: self.poly(q[::-1], [tuple(v * .7 for v in self.shade(cb, q[3], .1)), tuple(v * .7 for v in self.shade(cb, q[2], .1)), tuple(v * .7 for v in self.shade(ca, q[1], .1)), tuple(v * .7 for v in self.shade(ca, q[0], .1))])
        return pts[-1][0]

    def finish(self, doubles=True):
        if doubles and not self.bones: bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        if self.bones:   # smooth skin: join the corners of each part, never across parts (each part follows its own bone)
            for gi in range(len(self.bones)): bmesh.ops.remove_doubles(self.bm, verts=[v for v in self.bm.verts if gi in v[self.dl]], dist=1e-4)
        me = bpy.data.meshes.new(self.name); self.bm.to_mesh(me); self.bm.free()
        ob = bpy.data.objects.new(self.name, me); bpy.context.scene.collection.objects.link(ob)
        if self.bones:
            for b in self.bones: ob.vertex_groups.new(name=b)
        mat = bpy.data.materials.get('FM_VCOL')
        if not mat:
            mat = bpy.data.materials.new('FM_VCOL'); mat.use_nodes = True; nt = mat.node_tree; b = nt.nodes.get('Principled BSDF')
            vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nt.links.new(vc.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = .85
            mat.use_backface_culling = False
        me.materials.append(mat)
        return ob


def T(x=0, y=0, z=0, rz=0, rx=0, ry=0, s=(1, 1, 1)):
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Diagonal((s[0], s[1], s[2], 1))


C = {k: lin(v) for k, v in dict(
    wood='#8a6440', wood_d='#5e4128', wood_l='#a88358', wood_g='#7c7468', plank='#7d6a55', zinc='#a7adb0', zinc_d='#7f8588', rust='#8c4a26', rust_d='#5c2f18',
    conc='#a9a49a', conc_d='#857f75', block='#b8b2a6', mud='#b8763f', mud_l='#c98a52', mud_d='#7a4a2a', plaster='#d9b07a',
    soil='#8e6040', soil_l='#a87652', soil_d='#6a4428', soil_w='#4f3220', soil_wd='#3d2618', laterite='#9a5a36',
    leaf='#3f7a2c', leaf_d='#2c5a20', leaf_l='#6c9e3a', leaf_y='#a8a83a', leaf_b='#5b8f3a', leaf_dry='#b39a52', stalk='#7d9a3e', stalk_d='#5f7a30',
    tassel='#d8c27a', husk='#9ab35a', silk='#7a4a2a', cass_stem='#8a4a3a', cass_leaf='#2f5f2a', yam_leaf='#3d7a2e', yam='#6e4a2c', stake='#7a5a3a',
    tomato='#d0281c', tomato_o='#e8701e', tomato_g='#7aa83a', flower='#f2d23a', pep_r='#c81e14', pep_g='#3f8a2a', pep_y='#e8a81e',
    palm_tr='#5a4a3a', palm_fr='#3d6b24', palm_fr2='#4f7f2c', palm_nut='#b8321a', palm_nut_d='#3a1a12',
    pl_stem='#7a8a42', pl_leaf='#4a8a30', pl_leaf_d='#9a8a4a', pl_fruit='#7aa03a', pl_bud='#6a2a4a',
    grass='#7a9a3a', grass_d='#5a7a2a', grass_y='#b0a050', hay='#d2b46a', hay_d='#a88a48',
    cow='#ebe4d6', cow_d='#c9bfae', cow_g='#9a9284', muzzle='#3a3230', nose='#5a4a46', horn='#e2d4b0', horn_t='#3a2e24', hoof='#2a2420', switch='#2a2622', eye='#1a1412',
    hen='#9a4a1e', hen_l='#c0682c', hen_d='#5a2a14', hen_neck='#d8903a', hen_tail='#1e2a22', comb='#cc221a', beak='#e2b440', hen_leg='#d8a838',
    sack='#ece6d4', sack2='#d8c9a0', sack_band='#2e8a4e', basket='#b08a4a', basket_d='#86663a', egg='#efe2c8', churn='#c8ccd0',
    tank='#1e1e20', steel='#6a6e72', tap='#9aa0a4', jerry='#e8c22a', drum_b='#2a5fb0',
    cloth1='#c0392b', cloth2='#f1c40f', cloth3='#16a085', cloth4='#8e44ad', cloth5='#2c3e50', cloth6='#e67e22',
    truck='#e6e0d0', truck_d='#c8c0ac', truck_b='#3c6ea8', glass='#1d2a30', tyre='#1b1b1b', rim='#8d8a84', chrome='#c8c8c4', board='#efe6cc', red='#b22a1e', green='#2e8a4e',
    umb_g='#1f8a5c', umb_w='#f2efe6', chair='#2f6fb0').items()}


# ================================================================ small pieces
def corrugated(B, x0, x1, y0, y1, zf, zb, seed=0, rusty=.4):
    """A zinc sheet: ridges run down the slope (along y), edge y0 at height zf, edge y1 at zb."""
    pitch = .09 if B.detail else (x1 - x0); amp = .018 if B.detail else 0
    n = max(1, int(round((x1 - x0) / pitch))); ny = 3 if B.detail else 1
    def col(p):
        r = vnoise(p, 2.2, seed) * .7 + vnoise(p, 9, seed + 3) * .3; t = max(0, min(1, (r - (1 - rusty) * .75) * 2.2))
        z = C['zinc']; ru = C['rust'] if vnoise(p, 5, seed + 7) > .4 else C['rust_d']
        return tuple(z[i] * (1 - t) + ru[i] * t for i in range(3))
    def P(i, j, dz=0):
        x = x0 + (x1 - x0) * i / (2 * n); yy = y0 + (y1 - y0) * j / ny; zz = zf + (zb - zf) * j / ny
        return Vector((x, yy, zz + (amp if i % 2 else 0) + dz))
    up = 1 if (y1 - y0) * (zb - zf) <= 0 or True else 1
    for j in range(ny):
        for i in range(2 * n):
            q = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)]
            if y1 < y0: q = q[::-1]
            B.poly(q, [col(p) for p in q])
            qb = [P(i, j, -.006), P(i + 1, j, -.006), P(i + 1, j + 1, -.006), P(i, j + 1, -.006)]
            if y1 >= y0: qb = qb[::-1]
            B.poly(qb, [tuple(c * .5 for c in col(p)) for p in qb])


def gable_roof(B, x0, x1, ridge_z, eave_z, half, over=.35, seed=0, rusty=.4):
    """Zinc gable roof along x: ridge at y=0, eaves at y=±(half+over)."""
    corrugated(B, x0, x1, -half - over, 0, eave_z - over * (ridge_z - eave_z) / half, ridge_z, seed, rusty)
    corrugated(B, x0, x1, half + over, 0, eave_z - over * (ridge_z - eave_z) / half, ridge_z, seed + 5, rusty)
    B.box(T((x0 + x1) / 2, 0, ridge_z - .02), x1 - x0, .22, .05, C['zinc_d'], .1)   # ridge cap


def planks(B, x0, x1, y, z0, z1, col=None, axis='x', vertical=True, w=.2, th=.04, rnd=.12):
    """A wall of planks between x0..x1 (along x at y) or along y (at x=y) when axis='y'."""
    R = B.R; L = x1 - x0; col = col or C['plank']
    if not B.detail:
        c = col; (B.box(T((x0 + x1) / 2, y, z0), L, th, z1 - z0, c, .15) if axis == 'x' else B.box(T(y, (x0 + x1) / 2, z0), th, L, z1 - z0, c, .15)); return
    if vertical:
        n = max(1, int(L / w))
        for i in range(n):
            a = x0 + L * i / n; c = tuple(v * R.uniform(1 - rnd, 1 + rnd * .7) for v in col)
            if axis == 'x': B.box(T(a + L / n / 2, y, z0), L / n - .01, th, z1 - z0 - R.uniform(0, .04), c, .16, f=7)
            else: B.box(T(y, a + L / n / 2, z0), th, L / n - .01, z1 - z0 - R.uniform(0, .04), c, .16, f=7)
    else:
        n = max(1, int((z1 - z0) / w))
        for i in range(n):
            za = z0 + (z1 - z0) * i / n; c = tuple(v * R.uniform(1 - rnd, 1 + rnd * .7) for v in col)
            if axis == 'x': B.box(T((x0 + x1) / 2, y, za), L, th, (z1 - z0) / n - .01, c, .16, f=7)
            else: B.box(T(y, (x0 + x1) / 2, za), th, L, (z1 - z0) / n - .01, c, .16, f=7)


def post(B, x, y, h, r=.07, col=None, lean=0.0):
    B.cyl(T(x, y, 0, rx=lean), r * 1.1, r * .9, h, col or C['wood_d'], n=6 if B.detail else 4, var=.15)


def sack(B, x, y, h=.62, col=None, rz=0, lie=False):
    col = col or C['sack']
    if lie: B.sphere(T(x, y, .2, rz, s=(1.6, .9, .7)), .3, col, seg=8 if B.detail else 5, rings=5 if B.detail else 3, var=.1)
    else: B.sphere(T(x, y, h * .48, rz, s=(1, .8, h / .5)), .26, col, seg=8 if B.detail else 5, rings=5 if B.detail else 3, var=.1)
    if B.detail and col == C['sack'] and not lie: B.cyl(T(x, y, h * .45, rz, s=(1, .8, 1)), .262, .262, .07, C['sack_band'], n=8, top=False)


def basket(B, x, y, z, r, goods, gcol, n=10):
    B.cyl(T(x, y, z), r * .75, r, r * .7, C['basket'], n=10 if B.detail else 6, top=False, bottom=True, inner=C['basket_d'], var=.2)
    R = B.R
    for i in range(n if B.detail else 1):
        a = R.uniform(0, 6.28); d = R.uniform(0, r * .6) if B.detail else 0
        B.sphere(T(x + math.cos(a) * d, y + math.sin(a) * d, z + r * .6 + R.uniform(0, .05), s=(1, 1, .9)), goods if B.detail else r * .8, gcol, seg=6 if B.detail else 5, rings=4 if B.detail else 2)


def wheel(B, cx, cy, cz, r, w, detail):
    """a tyre and its rim, axle along X"""
    n = 14 if detail else 8
    ring = lambda x, rr: [Vector((x, cy + rr * math.cos(2 * math.pi * (i + .5) / n), cz + rr * math.sin(2 * math.pi * (i + .5) / n))) for i in range(n)]
    o0, o1 = ring(cx - w / 2, r), ring(cx + w / 2, r)
    for i in range(n):
        j = (i + 1) % n; B.face([o0[i], o0[j], o1[j], o1[i]], C['tyre'], .05)
    for x, sgn in ((cx - w / 2, -1), (cx + w / 2, 1)):
        rim = ring(x + sgn * .005, r * .62); tyre = ring(x, r)
        for i in range(n):
            j = (i + 1) % n; q = [tyre[i], tyre[j], rim[j], rim[i]]; B.face(q if sgn > 0 else q[::-1], C['tyre'], .05)
        B.face(rim if sgn > 0 else rim[::-1], C['rim'], .05)


# ================================================================ buildings
def barn(detail=True, seed=31):
    """The store: plank walls on a concrete base, zinc gable roof, big doors open, sacks and baskets inside."""
    B = MB('fm_barn' + ('' if detail else '_lod1'), detail, seed); R = B.R
    W, D, H = 8.0, 6.0, 2.9
    B.box(T(0, 0, 0), W + .3, D + .3, .25, C['conc'], .1)                         # floor slab
    B.box(T(0, -D / 2 - .6, 0), 3.0, 1.0, .12, C['conc_d'], .1)                  # ramp at the door
    for sx in (-1, 1):
        for sy in (-1, 1): B.box(T(sx * (W / 2 - .07), sy * (D / 2 - .07), .25), .16, .16, H - .25, C['wood_d'], .1)
    B.box(T(0, D / 2 - .05, .25), W, .1, .4, C['conc'], .08); planks(B, -W / 2, W / 2, D / 2 - .05, .65, H, C['plank'])        # back
    for sx in (-1, 1):
        B.box(T(sx * (W / 2 - .05), 0, .25), .1, D, .4, C['conc'], .08); planks(B, -D / 2, D / 2, sx * (W / 2 - .05), .65, H, C['plank'], axis='y')
        # gable triangles
        n = 10 if detail else 1
        for i in range(n):
            y0 = -D / 2 + D * i / n; y1 = -D / 2 + D * (i + 1) / n; z0 = H + 1.5 * (1 - abs(y0) / (D / 2)); z1 = H + 1.5 * (1 - abs(y1) / (D / 2))
            c = tuple(v * R.uniform(.85, 1.1) for v in C['plank']); x = sx * (W / 2 - .05)
            q = [Vector((x, y0, H)), Vector((x, y1, H)), Vector((x, y1, z1)), Vector((x, y0, z0))]
            B.poly(q if sx > 0 else q[::-1], [B.shade(c, p, .12) for p in q]); B.poly(q[::-1] if sx > 0 else q, [tuple(v * .45 for v in c)] * 4)
    # front wall with the door opening (2.8 wide, 2.5 high)
    B.box(T(0, -D / 2 + .05, .25), W, .1, .4, C['conc'], .08)
    for sx in (-1, 1): planks(B, sx * 1.4, sx * W / 2, -D / 2 + .05, .65, H, C['plank'] if sx < 0 else tuple(v * .95 for v in C['plank']))
    planks(B, -1.4, 1.4, -D / 2 + .05, 2.75, H, C['plank'])
    B.box(T(0, -D / 2 - .02, 2.65), 3.0, .12, .12, C['wood_d'], .1)                  # lintel
    for sx in (-1, 1):
        B.box(T(sx * 1.45, -D / 2 - .02, .25), .12, .12, 2.5, C['wood_d'], .1)        # door frame
        # the door leaves swung open against the wall
        Mx = T(sx * 2.85, -D / 2 - .1, .3)
        for i in range(6 if detail else 1):
            B.box(Mx @ T(sx * (-1.3 + (i + .5) * 2.6 / (6 if detail else 1)) * .5 * 0 + (-.65 + (i + .5) * 1.3 / (6 if detail else 1)) * 1, 0, 0), 1.3 / (6 if detail else 1) - .01, .05, 2.35, tuple(v * R.uniform(.9, 1.05) for v in C['green']), .15)
        B.box(Mx @ T(0, -.03, .5), 1.3, .03, .1, C['wood_d'], .1); B.box(Mx @ T(0, -.03, 1.8), 1.3, .03, .1, C['wood_d'], .1)
    # dark inside floor, sacks, baskets and a scale
    B.box(T(0, 0, .25), W - .3, D - .3, .01, C['soil_d'], .2)
    if detail:
        for i in range(9): sack(B, -3.3 + (i % 5) * .55, 2.2 - (i // 5) * .6, .62, C['sack'] if i % 3 else C['sack2'], R.uniform(-.4, .4))
        for i in range(4): sack(B, -3.0 + i * .6, 2.3, .62, C['sack2'], R.uniform(-.4, .4));
        for i, (gx, gc) in enumerate(((2.2, C['tomato']), (2.9, C['pep_r']), (3.3, C['yam']))): basket(B, gx, 2.2, .25, .32, .05, gc, 12)
        B.box(T(1.0, 1.6, .25), .6, .5, .9, C['steel'], .1)                             # a weighing scale
        B.box(T(1.0, 1.6, 1.15), .7, .55, .05, C['chrome'], .05)
        for i in range(3): B.box(T(-1.2 + i * .45, 2.4, .25 + 0), .4, .4, .3 + (i % 2) * .3, C['wood_l'], .15)   # crates
    # a window high on each side
    for sx in (-1, 1): B.box(T(sx * (W / 2), .8, 1.7), .14, 1.0, .7, C['glass'], .05)
    gable_roof(B, -W / 2 - .45, W / 2 + .45, H + 1.55, H, D / 2, .45, seed, .45)
    return B.finish()


def house(detail=True, seed=32):
    """The farmhouse: mud walls plastered ochre, zinc roof, a veranda on posts, a bench and pots."""
    B = MB('fm_house' + ('' if detail else '_lod1'), detail, seed); R = B.R
    W, D, H = 7.0, 5.0, 2.8
    B.box(T(0, 0, 0), W + .2, D + .2, .2, C['conc_d'], .1)
    B.box(T(0, -D / 2 - 1.0, 0), W + .2, 2.0, .15, C['conc'], .12)                   # veranda floor
    def wall(x0, x1, y, axis='x', holes=()):
        L = x1 - x0; segs = []
        cuts = sorted(holes); a = x0
        for (h0, h1, zb, zt) in cuts:
            segs.append((a, h0, .2, H)); segs.append((h0, h1, .2, zb)); segs.append((h0, h1, zt, H)); a = h1
        segs.append((a, x1, .2, H))
        for (s0, s1, z0, z1) in segs:
            if s1 - s0 < .01 or z1 - z0 < .01: continue
            for (zz0, zz1, c) in ((z0, min(z1, .6), C['mud_d']), (max(z0, .6), z1, C['mud_l'])):
                if zz1 - zz0 < .01: continue
                if axis == 'x': B.box(T((s0 + s1) / 2, y, zz0), s1 - s0, .22, zz1 - zz0, c, .14, f=2)
                else: B.box(T(y, (s0 + s1) / 2, zz0), .22, s1 - s0, zz1 - zz0, c, .14, f=2)
    wall(-W / 2, W / 2, -D / 2 + .11, 'x', [(-.5, .5, .2, 2.1), (-2.6, -1.6, 1.0, 1.9), (1.6, 2.6, 1.0, 1.9)])
    wall(-W / 2, W / 2, D / 2 - .11, 'x', [(-.6, .4, 1.0, 1.9)])
    wall(-D / 2, D / 2, -W / 2 + .11, 'y', [(-.4, .6, 1.0, 1.8)]); wall(-D / 2, D / 2, W / 2 - .11, 'y')
    B.box(T(0, -D / 2 + .1, .2), 1.0, .06, 1.9, C['wood_d'], .1)                     # door
    for x in (-2.1, 2.1):                                                               # louvre windows
        for k in range(6 if detail else 1): B.box(T(x, -D / 2 + .05, 1.0 + k * .15, rx=.5), .95, .02, .12, C['wood'], .1)
    B.box(T(0, 0, .2), W - .4, D - .4, .01, C['soil_d'], .1)
    # roof: zinc gable along x, and the veranda lean-to
    gable_roof(B, -W / 2 - .4, W / 2 + .4, H + 1.3, H, D / 2, .4, seed, .55)
    corrugated(B, -W / 2 - .3, W / 2 + .3, -D / 2 - 2.05, -D / 2 - .3, H - .45, H - .05, seed + 9, .5)
    for x in (-W / 2 + .1, -1.2, 1.2, W / 2 - .1):
        post(B, x, -D / 2 - 1.9, H - .45, .07, C['wood_d'])
    B.box(T(0, -D / 2 - 1.9, H - .55), W + .4, .12, .1, C['wood_d'], .1)
    if detail:
        B.box(T(-2.0, -D / 2 - .6, .15), 2.0, .4, .06, C['wood'], .1)                     # bench
        for x in (-2.8, -1.2): B.box(T(x, -D / 2 - .6, .15), .08, .35, .4, C['wood_d'], .1)
        for i, x in enumerate((2.2, 2.7)): B.sphere(T(x, -D / 2 - .5, .45, s=(1, 1, 1.1)), .3, C['mud'] if i else C['laterite'], seg=10, rings=6)   # clay pots
        B.cyl(T(W / 2 + .45, 1.2, 0), .3, .3, .9, C['drum_b'], n=12, top=True)            # water drum
        B.box(T(1.4, -D / 2 - .9, .15), .45, .45, .45, C['chair'], .1)                   # plastic chair
        B.box(T(1.4, -D / 2 - .7, .6), .45, .06, .45, C['chair'], .1)
    return B.finish()


def coop(detail=True, seed=33):
    """Chicken coop: a raised plank hut with zinc roof and a ramp, and the wire run in front (4 x 3 m)."""
    B = MB('fm_coop' + ('' if detail else '_lod1'), detail, seed); R = B.R
    hx, hy, z0, H = 1.2, .9, .55, 1.4
    for sx in (-1, 1):
        for sy in (-1, 1): post(B, sx * (hx - .08), 1.6 + sy * (hy - .08), z0 + H + .2, .06)
    B.box(T(0, 1.6, z0), hx * 2, hy * 2, .06, C['wood'], .1)
    planks(B, -hx, hx, 1.6 + hy, z0, z0 + H + .25, C['wood_g'])
    for sx in (-1, 1): planks(B, 1.6 - hy, 1.6 + hy, sx * hx, z0, z0 + H + (.12 if sx else 0), C['wood_g'], axis='y')
    planks(B, -hx, -.25, 1.6 - hy, z0, z0 + H, C['wood_g']); planks(B, .25, hx, 1.6 - hy, z0, z0 + H, C['wood_g']); planks(B, -.25, .25, 1.6 - hy, z0 + .6, z0 + H, C['wood_g'])
    B.box(T(0, 1.6 - hy + .02, z0), .5, .02, .6, lin('#1a120c'), .05)                  # the hole they go in by
    B.box(T(0, 1.6 - hy - .55, .0, rx=-.62), .4, 1.2, .04, C['wood'], .1)             # ramp
    corrugated(B, -hx - .2, hx + .2, 1.6 - hy - .3, 1.6 + hy + .2, z0 + H + .1, z0 + H + .4, seed, .5)
    # the run: posts, a top rail, chicken wire as a fine grid
    X0, X1, Y0, Y1, h = -2.0, 2.0, -1.6, 1.6 - hy, 1.3
    cornerp = [(X0, Y0), (X1, Y0), (X1, Y1), (X0, Y1)]
    for (x, y) in cornerp: post(B, x, y, h + .1, .05)
    for (x, y) in ((0, Y0), (X0, (Y0 + Y1) / 2), (X1, (Y0 + Y1) / 2)): post(B, x, y, h + .1, .045)
    wire = C['steel']
    def mesh_side(a, b):
        ax, ay = a; bx, by = b; L = math.hypot(bx - ax, by - ay); n = int(L / .12) if detail else 3; m = int(h / .12) if detail else 2
        dx, dy = (bx - ax) / L, (by - ay) / L
        for i in range(n + 1):
            x, y = ax + dx * L * i / n, ay + dy * L * i / n; B.box(T(x, y, 0, math.atan2(dy, dx)), .008, .008, h, wire, .05)
        for k in range(m + 1):
            B.box(T((ax + bx) / 2, (ay + by) / 2, h * k / m, math.atan2(dy, dx)), L, .008, .008, wire, .05)
    mesh_side((X0, Y0), (-.6, Y0)); mesh_side((.6, Y0), (X1, Y0)); mesh_side((X0, Y0), (X0, Y1)); mesh_side((X1, Y0), (X1, Y1))
    B.box(T(0, Y0, h), 1.2, .05, .06, C['wood_d'], .1)
    if detail:
        B.cyl(T(-1.2, -.6, 0), .25, .28, .08, C['steel'], n=10, top=True)                 # feeder and water dish
        B.cyl(T(1.0, -.9, 0), .22, .22, .06, C['drum_b'], n=10, top=True)
        for i in range(30):   # feed and feathers on the ground
            B.box(T(R.uniform(X0, X1), R.uniform(Y0, Y1), .005, R.uniform(0, 6)), .04, .015, .005, C['hay'] if i % 3 else C['egg'], .1)
    return B.finish()


def pen(detail=True, seed=34):
    """Cow pen: 10 x 7 m post-and-rail fence, a gap at the front with the gate open, trough, water, hay."""
    B = MB('fm_pen' + ('' if detail else '_lod1'), detail, seed); R = B.R
    W, D = 10.0, 7.0
    pts = []
    for x in (-W / 2, -W / 4, 0, W / 4, W / 2): pts.append((x, -D / 2)); pts.append((x, D / 2))
    for y in (-D / 6, D / 6): pts.append((-W / 2, y)); pts.append((W / 2, y))
    for (x, y) in pts: post(B, x, y, 1.45, .08, lean=R.uniform(-.04, .04))
    def rails(a, b):
        ax, ay = a; bx, by = b; L = math.hypot(bx - ax, by - ay); ang = math.atan2(by - ay, bx - ax)
        for z in (.45, .85, 1.25):
            B.box(T((ax + bx) / 2, (ay + by) / 2, z + R.uniform(-.03, .03), ang, ry=R.uniform(-.02, .02)), L + .2, .07, .09, tuple(v * R.uniform(.85, 1.1) for v in C['wood']), .14)
    rails((-W / 2, -D / 2), (-1.1, -D / 2)); rails((1.1, -D / 2), (W / 2, -D / 2)); rails((-W / 2, D / 2), (W / 2, D / 2))
    rails((-W / 2, -D / 2), (-W / 2, D / 2)); rails((W / 2, -D / 2), (W / 2, D / 2))
    post(B, -1.1, -D / 2, 1.5, .09); post(B, 1.1, -D / 2, 1.5, .09)
    G = T(-1.1, -D / 2, 0, -1.9)                                                      # the gate, swung open
    for z in (.4, .8, 1.2): B.box(G @ T(1.05, 0, z), 2.1, .06, .1, C['wood_l'], .1)
    B.box(G @ T(1.05, 0, .4, ry=.5), 2.3, .05, .08, C['wood_l'], .1)
    # trampled earth inside, trough at the back, water, hay
    n = 6 if detail else 1
    for i in range(n):
        for j in range(n):
            x0, x1 = -W / 2 + W * i / n, -W / 2 + W * (i + 1) / n; y0, y1 = -D / 2 + D * j / n, -D / 2 + D * (j + 1) / n
            q = [Vector((x0, y0, .015)), Vector((x1, y0, .015)), Vector((x1, y1, .015)), Vector((x0, y1, .015))]
            B.poly(q, [B.shade(C['soil_d'] if vnoise(p, .7, seed) > .45 else C['laterite'], p, .2, 1.5) for p in q])
    B.box(T(0, D / 2 - .55, 0), 3.2, .6, .55, C['wood_d'], .1, f=4)                    # trough
    B.box(T(0, D / 2 - .55, .45), 3.0, .45, .06, C['hay'], .25, f=6)
    B.cyl(T(3.3, D / 2 - .9, 0), .55, .6, .35, C['tyre'], n=12, top=False, inner=C['tyre'])   # a tyre trough of water
    B.cyl(T(3.3, D / 2 - .9, .25), .5, .5, .01, lin('#3a5a6a'), n=12)
    if detail:
        for i in range(5): B.sphere(T(-3.5 + i * .35, D / 2 - .7 + R.uniform(-.2, .2), .25, R.uniform(0, 3), s=(1.3, 1, .7)), .35, C['hay'] if i % 2 else C['hay_d'], seg=8, rings=4, var=.2)
        for i in range(10):   # dung
            B.sphere(T(R.uniform(-W / 2 + .5, W / 2 - .5), R.uniform(-D / 2 + .5, D / 2 - 1.2), .02, s=(1, 1, .3)), R.uniform(.08, .14), lin('#3a2a1a'), seg=6, rings=3)
    return B.finish()


def tank(detail=True, seed=35):
    """Overhead water tank: a black plastic tank on a steel stand, a pipe down to a tap, jerrycans."""
    B = MB('fm_tank' + ('' if detail else '_lod1'), detail, seed)
    for sx in (-1, 1):
        for sy in (-1, 1): B.box(T(sx * .85, sy * .85, 0), .1, .1, 2.6, C['steel'], .1)
    for z in (.9, 1.8):
        for sx in (-1, 1): B.box(T(sx * .85, 0, z), .06, 1.7, .06, C['steel'], .1); B.box(T(0, sx * .85, z), 1.7, .06, .06, C['steel'], .1)
    B.box(T(0, 0, 2.55), 2.0, 2.0, .1, C['steel'], .1)
    B.cyl(T(0, 0, 2.65), .85, .82, 1.35, C['tank'], n=20 if detail else 8, var=.05)
    if detail:
        for z in (2.9, 3.25, 3.6): B.cyl(T(0, 0, z), .87, .87, .05, lin('#2a2a2c'), n=20, top=False)
    B.cyl(T(0, 0, 4.0), .3, .3, .12, C['tank'], n=10)
    B.tube([Vector((.8, 0, 2.7)), Vector((.95, 0, 2.6)), Vector((.95, 0, .9)), Vector((.95, -.3, .85))], [.04] * 4, C['steel'], n=6)
    B.box(T(.95, -.35, .78), .08, .12, .1, C['tap'], .05)
    B.box(T(.95, -.5, 0), .7, .6, .25, C['conc'], .1)
    if detail:
        for i, x in enumerate((-.2, .35)): B.box(T(x - .8, -1.0, 0, .3 * i), .3, .2, .42, C['jerry'], .1); B.box(T(x - .8, -1.0, .42, .3 * i), .06, .06, .06, lin('#c0281e'), .05)
    return B.finish()


def office(detail=True, seed=36):
    """Farm office: a block kiosk with zinc roof and a counter, a table under a big umbrella, seed sacks."""
    B = MB('fm_office' + ('' if detail else '_lod1'), detail, seed); R = B.R
    W, D, H = 3.4, 2.6, 2.6
    B.box(T(0, 0, 0), W + .2, D + .2, .15, C['conc'], .1)
    B.box(T(0, D / 2 - .1, .15), W, .2, H, C['block'], .08, f=2)
    for sx in (-1, 1): B.box(T(sx * (W / 2 - .1), 0, .15), .2, D, H, C['block'], .08, f=2)
    B.box(T(0, -D / 2 + .1, .15), W, .2, 1.0, C['block'], .08, f=2)
    B.box(T(0, -D / 2 + .1, 2.3), W, .2, .45, C['block'], .08, f=2)
    B.box(T(0, -D / 2, 1.15), W + .1, .5, .06, C['wood'], .1)                        # counter
    B.box(T(0, -D / 2 + .1, .15), W - .2, .02, .7, lin('#2e7a3e'), .1)               # green band
    corrugated(B, -W / 2 - .4, W / 2 + .4, -D / 2 - .6, D / 2 + .3, H + .25, H + .05, seed, .35)
    B.box(T(0, 0, .15), W - .4, D - .4, .01, C['soil_d'], .1)
    if detail:
        for i in range(4): sack(B, -1.0 + i * .5, .6, .6, C['sack'], R.uniform(-.3, .3))
        for i in range(3): B.box(T(-.8 + i * .5, .1, 1.21), .25, .18, .3, [C['tomato'], C['flower'], C['green']][i], .1)   # seed packets
    # umbrella, table and chairs in front
    px, py = 2.6, -2.2
    B.cyl(T(px, py, 0), .025, .025, 2.4, C['steel'], n=6, top=False)
    n = 10 if detail else 6; r = 1.4
    for i in range(n):
        a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n; c = C['umb_g'] if i % 2 else C['umb_w']
        p0 = Vector((px, py, 2.5)); p1 = Vector((px + r * math.cos(a0), py + r * math.sin(a0), 2.05)); p2 = Vector((px + r * math.cos(a1), py + r * math.sin(a1), 2.05))
        B.poly([p0, p1, p2], [c] * 3); B.poly([p0, p2, p1], [tuple(v * .5 for v in c)] * 3)
    B.box(T(px, py, .7), 1.1, .7, .05, C['wood_l'], .1)
    for sx in (-1, 1):
        for sy in (-1, 1): B.box(T(px + sx * .5, py + sy * .3, 0), .05, .05, .7, C['wood_d'], .1)
    for k, (cx, cy) in enumerate(((px - .2, py + .7), (px + .7, py - .6))):
        B.box(T(cx, cy, 0), .45, .45, .45, C['chair'], .1); B.box(T(cx, cy + .2, .45), .45, .05, .45, C['chair'], .1)
    return B.finish()


def gate(detail=True, seed=37):
    """The settlement gate: two tall posts, a cross beam and a blank board (the game writes the name)."""
    B = MB('fm_gate' + ('' if detail else '_lod1'), detail, seed)
    for sx in (-1, 1):
        B.box(T(sx * 2.4, 0, 0), .3, .3, 4.2, C['wood_d'], .12)
        B.box(T(sx * 2.4, 0, 0), .5, .5, .3, C['conc'], .1)
    B.box(T(0, 0, 3.9), 5.4, .25, .25, C['wood_d'], .1)
    B.box(T(0, -.14, 2.85), 3.8, .06, 1.0, C['board'], .04)                          # board face at y=-0.17, centre z=3.35
    B.box(T(0, -.16, 2.8), 3.95, .04, .06, C['green'], .05); B.box(T(0, -.16, 3.85), 3.95, .04, .06, C['green'], .05)
    for sx in (-1, 1): B.box(T(sx * 1.6, 0, 3.0), .08, .08, .9, C['wood_d'], .1)
    return B.finish()


def fence(detail=True, seed=38):
    """A 4 m length of farm fence: a rough post at x=-2 and two rails to x=+2."""
    B = MB('fm_fence' + ('' if detail else '_lod1'), detail, seed); R = B.R
    post(B, -2, 0, 1.2, .07, lean=R.uniform(-.05, .05)); post(B, 0, 0, 1.0, .05)
    for z in (.45, .95): B.box(T(0, 0, z + R.uniform(-.04, .04), ry=R.uniform(-.03, .03)), 4.15, .06, .08, tuple(v * R.uniform(.85, 1.1) for v in C['wood']), .15)
    return B.finish()


# ================================================================ the crop beds and the crops
BED_W, BED_D = 4.0, 3.0
RIDGES = (-1.1, -.37, .37, 1.1)
RIDGE_TOP = .24


def bed(detail=True, wet=False, seed=40):
    """A crop bed 4 x 3 m: four soft raised ridges along x on loose tilled earth, rounded at the ends. Wet: dark, just watered."""
    B = MB('fm_bed' + ('_wet' if wet else '') + ('' if detail else '_lod1'), detail, seed + (7 if wet else 0)); R = B.R
    top, mid, low = (lin('#6e4c34'), lin('#5a3e2a'), lin('#47311f')) if wet else (lin('#93694a'), lin('#7c573b'), lin('#634530'))
    q = [Vector((-BED_W / 2 - .2, -BED_D / 2 - .2, .015)), Vector((BED_W / 2 + .2, -BED_D / 2 - .2, .015)), Vector((BED_W / 2 + .2, BED_D / 2 + .2, .015)), Vector((-BED_W / 2 - .2, BED_D / 2 + .2, .015))]
    nb = 6 if detail else 1   # the furrow floor, broken up so the colour can vary
    for i in range(nb):
        for j in range(nb):
            x0, x1 = q[0].x + (q[1].x - q[0].x) * i / nb, q[0].x + (q[1].x - q[0].x) * (i + 1) / nb; y0, y1 = q[0].y + (q[3].y - q[0].y) * j / nb, q[0].y + (q[3].y - q[0].y) * (j + 1) / nb
            P = [Vector((x0, y0, .015)), Vector((x1, y0, .015)), Vector((x1, y1, .015)), Vector((x0, y1, .015))]
            B.poly(P, [B.shade(low, p, .25, 2.5, seed) for p in P])
    nx, ny = (22, 8) if detail else (5, 2)
    hw = .4
    for ri, y0 in enumerate(RIDGES):
        hk = R.uniform(.85, 1.1)
        def H(x, v):   # v in -1..1 across the ridge
            end = min(1, (BED_W / 2 - abs(x)) / .35)   # rounded ends
            n = .03 * (vnoise((x, y0 + v, ri), 2.6, seed) - .5) + .015 * (vnoise((x, v, ri), 9, seed + 1) - .5)
            return .016 + max(0, RIDGE_TOP * hk * (.5 + .5 * math.cos(math.pi * v)) * (math.sin(end * math.pi / 2) ** .7) + n * (1 - abs(v)))
        for i in range(nx):
            xa, xb = -BED_W / 2 + BED_W * i / nx, -BED_W / 2 + BED_W * (i + 1) / nx
            for k in range(ny):
                va, vb = -1 + 2 * k / ny, -1 + 2 * (k + 1) / ny
                P = [Vector((xa, y0 + va * hw, H(xa, va))), Vector((xb, y0 + va * hw, H(xb, va))), Vector((xb, y0 + vb * hw, H(xb, vb))), Vector((xa, y0 + vb * hw, H(xa, vb)))]
                cols = []
                for pp, vv in zip(P, (va, va, vb, vb)):
                    t = (1 - abs(vv)); c = tuple(mid[m] * (1 - t) + top[m] * t for m in range(3)); cols.append(B.shade(c, pp, .22, 5, seed))
                B.poly(P, cols, smooth=True)
    if detail:   # clods, stones and a few weeds
        for i in range(70):
            y0 = R.choice(RIDGES); B.sphere(T(R.uniform(-1.8, 1.8), y0 + R.uniform(-.3, .3), .05 + R.uniform(0, .14), R.uniform(0, 6), s=(1, .8, .55)), R.uniform(.025, .055), top if i % 4 else lin('#8a8070'), seg=5, rings=3, var=.25)
        for i in range(10 if not wet else 6):
            x, y = R.uniform(-1.9, 1.9), R.choice((-.74, 0, .74)) + R.uniform(-.1, .1)
            for k in range(3): B.leaf((x, y, .02), R.uniform(0, 6.28), .9, .12, .03, C['leaf_l'], droop=.6, seg=2, shape='blade', both=False)
    return B.finish()


def plants_at(detail, per=6):
    pts = []
    for y0 in RIDGES:
        n = per if detail else max(2, per // 2)
        for i in range(n): pts.append((-BED_W / 2 + BED_W * (i + .5) / n, y0))
    return pts


def maize(stage, detail=True, seed=50):
    B = MB('fm_maize_%d' % stage + ('' if detail else '_lod1'), detail, seed + stage); R = B.R
    H = [0, .35, 1.05, 2.15][stage]; nl = [0, 3, 6, 9][stage] if detail else [0, 2, 4, 5][stage]
    for (x, y) in plants_at(detail, 6):
        x += R.uniform(-.08, .08); y += R.uniform(-.06, .06); h = H * R.uniform(.85, 1.1); z0 = RIDGE_TOP
        if stage > 1: B.cyl(T(x, y, z0), .03 if stage == 3 else .022, .012, h, C['stalk'], n=5 if detail else 3, top=False, col1=C['stalk_d'] if stage == 3 else C['stalk'])
        for k in range(nl):
            zz = z0 + h * (.12 + .8 * k / max(1, nl)); yaw = R.uniform(0, 6.28) if stage == 1 else (k * 2.4 + R.uniform(-.3, .3))
            L = (.25 if stage == 1 else .6 if stage == 2 else .95) * R.uniform(.8, 1.1) * (1.15 - .5 * k / max(1, nl))
            B.leaf((x, y, zz), yaw, R.uniform(.5, .9), L, .09 if stage > 1 else .05, C['leaf'], droop=1.3 if stage > 1 else .6, seg=3 if detail else 2, tip=C['leaf_y'] if stage == 3 else C['leaf_l'], both=detail)
        if stage == 3:
            for k in range(5 if detail else 2): B.leaf((x, y, z0 + h), R.uniform(0, 6.28), 1.2, .32, .02, C['tassel'], droop=1.0, seg=2, both=False)   # tassel
            for c in range(R.choice((1, 2)) if detail else 1):
                a = R.uniform(0, 6.28); cz = z0 + h * (.45 + .1 * c)
                B.sphere(T(x + math.cos(a) * .08, y + math.sin(a) * .08, cz, a, ry=.35, s=(.38, .38, 1)), .16, C['husk'], seg=6 if detail else 4, rings=4 if detail else 2, var=.12)
                if detail: B.leaf((x + math.cos(a) * .12, y + math.sin(a) * .12, cz + .14), a, 1.0, .1, .03, C['silk'], droop=.8, seg=2, both=False)
    return B.finish()


def cassava(stage, detail=True, seed=60):
    B = MB('fm_cassava_%d' % stage + ('' if detail else '_lod1'), detail, seed + stage); R = B.R
    H = [0, .4, 1.0, 1.8][stage]
    def palmate(c, size, n=7):
        for k in range(n if detail else 4):
            yaw = 2 * math.pi * k / (n if detail else 4) + R.uniform(-.2, .2)
            B.leaf(c, yaw, R.uniform(-.1, .4), size * R.uniform(.8, 1.1), size * .28, C['cass_leaf'], droop=.6, seg=2, tip=C['leaf_b'], both=detail)
    for (x, y) in plants_at(detail, 5):
        x += R.uniform(-.08, .08); y += R.uniform(-.05, .05); z0 = RIDGE_TOP
        if stage == 1:
            B.cyl(T(x, y, z0, rx=R.uniform(-.2, .2)), .025, .022, .32, C['cass_stem'], n=5, top=True)
            palmate(Vector((x, y, z0 + .32)), .12, 5); continue
        h = H * R.uniform(.85, 1.1); top = Vector((x + R.uniform(-.1, .1), y + R.uniform(-.1, .1), z0 + h))
        B.tube([Vector((x, y, z0)), Vector((x, y, z0 + h * .5)), top], [.035, .028, .015], C['cass_stem'], n=5 if detail else 3)
        nb = (2 if stage == 2 else 3) if detail else 1
        for b in range(nb):
            a = R.uniform(0, 6.28); bz = z0 + h * (.55 + .12 * b); tip = Vector((x + math.cos(a) * h * .35, y + math.sin(a) * h * .35, bz + h * .3))
            if detail: B.tube([Vector((x, y, bz)), tip], [.018, .01], C['cass_stem'], n=4, cap=False)
            palmate(tip, .28 if stage == 2 else .36)
        palmate(top, .3 if stage == 2 else .4)
    return B.finish()


def yam(stage, detail=True, seed=70):
    B = MB('fm_yam_%d' % stage + ('' if detail else '_lod1'), detail, seed + stage); R = B.R
    def heart(c, yaw, size, col):
        B.leaf(c, yaw, R.uniform(-.4, .3), size, size * .8, col, droop=.4, seg=2, shape='heart', both=detail)
    for (x, y) in plants_at(detail, 4):
        x += R.uniform(-.06, .06); z0 = RIDGE_TOP; sh = 2.1 if stage == 3 else 1.6
        B.cyl(T(x, y + .12, z0 - .1, rx=R.uniform(-.08, .08), ry=R.uniform(-.08, .08)), .025, .018, sh, C['stake'], n=5 if detail else 3, top=True)   # the stake
        if stage == 3 and detail: B.sphere(T(x - .1, y - .05, z0 + .02, .5, s=(1.8, 1, .8)), .1, C['yam'], seg=7, rings=4, var=.2)   # the tuber showing
        top = [0, .3, 1.1, 1.9][stage]; n = [0, 3, 10, 24][stage] if detail else [0, 2, 4, 8][stage]
        pts = [Vector((x + math.cos(i * 1.6) * .06, y + .12 + math.sin(i * 1.6) * .06, z0 + top * i / 6)) for i in range(7)]
        if detail and stage > 1: B.tube(pts, [.008] * 7, C['stalk_d'], n=3, cap=False)
        for k in range(n):
            t = (k + 1) / n; c = Vector((x + R.uniform(-.12, .12), y + .1 + R.uniform(-.12, .12), z0 + top * t))
            col = C['yam_leaf'] if not (stage == 3 and R.random() < .25) else C['leaf_y']
            heart(c, R.uniform(0, 6.28), (.1 if stage == 1 else .16 if stage == 2 else .2) * R.uniform(.8, 1.2), col)
    return B.finish()


def tomato(stage, detail=True, seed=80):
    B = MB('fm_tomato_%d' % stage + ('' if detail else '_lod1'), detail, seed + stage); R = B.R
    for (x, y) in plants_at(detail, 6):
        x += R.uniform(-.06, .06); y += R.uniform(-.04, .04); z0 = RIDGE_TOP
        h = [0, .18, .55, .8][stage] * R.uniform(.85, 1.1)
        if stage > 1: B.cyl(T(x + .08, y, z0 - .05), .012, .012, h + .25, C['stake'], n=4, top=True)
        nb = [0, 3, 7, 10][stage] if detail else [0, 2, 3, 4][stage]
        for k in range(nb):
            a = R.uniform(0, 6.28); zz = z0 + h * R.uniform(.2, 1.0)
            B.leaf((x, y, zz), a, R.uniform(-.1, .5), (.12 if stage == 1 else .22) * R.uniform(.8, 1.1), .1 if stage > 1 else .06, C['leaf_b'], droop=.7, seg=2, tip=C['leaf_d'], both=detail)
        if stage > 1 and detail: B.cyl(T(x, y, z0), .012, .008, h, C['stalk_d'], n=4, top=False)
        if stage == 2 and detail:
            for k in range(3): B.sphere(T(x + R.uniform(-.12, .12), y + R.uniform(-.12, .12), z0 + h * R.uniform(.5, 1)), .02, C['flower'], seg=5, rings=3)
        if stage == 3:
            for k in range(7 if detail else 2):
                c = R.choice([C['tomato'], C['tomato'], C['tomato'], C['tomato_o'], C['tomato_g']])
                B.sphere(T(x + R.uniform(-.16, .16), y + R.uniform(-.14, .14), z0 + h * R.uniform(.25, .85), s=(1, 1, .85)), R.uniform(.04, .055) if detail else .08, c, seg=7 if detail else 5, rings=4 if detail else 3, var=.08)
    return B.finish()


def pepper(stage, detail=True, seed=90):
    B = MB('fm_pepper_%d' % stage + ('' if detail else '_lod1'), detail, seed + stage); R = B.R
    for (x, y) in plants_at(detail, 6):
        x += R.uniform(-.06, .06); y += R.uniform(-.04, .04); z0 = RIDGE_TOP
        h = [0, .16, .45, .62][stage] * R.uniform(.85, 1.1)
        nb = [0, 3, 8, 12][stage] if detail else [0, 2, 3, 4][stage]
        if stage > 1 and detail: B.cyl(T(x, y, z0), .014, .01, h, C['stalk_d'], n=4, top=False)
        for k in range(nb):
            a = R.uniform(0, 6.28); zz = z0 + h * R.uniform(.25, 1.0)
            B.leaf((x, y, zz), a, R.uniform(0, .5), (.1 if stage == 1 else .16) * R.uniform(.8, 1.1), .07, C['leaf'], droop=.5, seg=2, tip=C['leaf_l'], both=detail)
        if stage == 3:
            for k in range(9 if detail else 2):
                c = R.choice([C['pep_r'], C['pep_r'], C['pep_r'], C['pep_g'], C['pep_y']]); a = R.uniform(0, 6.28)
                px, py, pz = x + R.uniform(-.13, .13), y + R.uniform(-.12, .12), z0 + h * R.uniform(.3, .9)
                if detail and k % 2: B.sphere(T(px, py, pz, s=(1, 1, .7)), .035, c, seg=6, rings=3)                    # ata rodo (round)
                else: B.sphere(T(px, py, pz, a, ry=.4, s=(.45, .45, 1.2)), .045 if detail else .07, c, seg=6 if detail else 4, rings=3)   # tatashe (long)
    return B.finish()


# ================================================================ trees and bush
def palm(detail=True, seed=101):
    B = MB('fm_palm' + ('' if detail else '_lod1'), detail, seed); R = B.R
    H = 7.5; lean = R.uniform(.03, .08)
    pts = [Vector((math.sin(lean * 3) * H * (i / 8) ** 1.6 * .3, 0, H * i / 8)) for i in range(9)]
    B.tube(pts, [.32, .3, .29, .28, .28, .27, .27, .27, .28], C['palm_tr'], n=10 if detail else 6, var=.18, cap=False)
    if detail:   # the old frond bases sticking out of the trunk
        for i in range(90):
            t = R.uniform(.15, .95); p = pts[int(t * 8)]; a = R.uniform(0, 6.28)
            B.box(T(p.x + math.cos(a) * .27, p.y + math.sin(a) * .27, p.z + R.uniform(-.3, .3), a, ry=-.9), .32, .1, .05, C['palm_tr'] if i % 3 else lin('#6a5a42'), .2)
    top = pts[-1]
    nf = 18 if detail else 8
    for i in range(nf):
        yaw = 2 * math.pi * i / nf + R.uniform(-.15, .15); up = R.uniform(-.2, .9); L = R.uniform(3.6, 4.6)
        # rachis with leaflets: drawn as a long blade split into pinnae
        p = Vector(top); a = up; dirh = Vector((math.cos(yaw), math.sin(yaw), 0)); side = Vector((-math.sin(yaw), math.cos(yaw), 0)); seg = 9 if detail else 3
        for s in range(seg):
            q0 = p.copy(); p = p + (dirh * math.cos(a) + Vector((0, 0, 1)) * math.sin(a)) * (L / seg); a -= 1.4 / seg
            t = (s + .5) / seg; w = .55 * math.sin(math.pi * min(1, t * 1.1 + .05))
            col = C['palm_fr'] if i % 2 else C['palm_fr2']
            if detail:
                for sg in (-1, 1):   # pinnae, angled down a bit
                    B.poly([q0, p, p + side * sg * w - Vector((0, 0, .12)), q0 + side * sg * w * .9 - Vector((0, 0, .12))], [B.shade(col, q0, .15)] * 4)
                    B.poly([q0 + side * sg * w * .9 - Vector((0, 0, .12)), p + side * sg * w - Vector((0, 0, .12)), p, q0], [tuple(v * .7 for v in col)] * 4)
            else:
                B.poly([q0 - side * w, q0 + side * w, p + side * w, p - side * w], [col] * 4); B.poly([p - side * w, p + side * w, q0 + side * w, q0 - side * w], [col] * 4)
    for k in range(3 if detail else 1):   # fruit bunches under the crown
        a = R.uniform(0, 6.28); c = top + Vector((math.cos(a) * .4, math.sin(a) * .4, -.35))
        for j in range(22 if detail else 1): B.sphere(T(c.x + R.uniform(-.18, .18), c.y + R.uniform(-.18, .18), c.z + R.uniform(-.2, .15)), .06 if detail else .3, C['palm_nut'] if j % 3 else C['palm_nut_d'], seg=5 if detail else 5, rings=3)
    return B.finish()


def plantain(detail=True, seed=102):
    B = MB('fm_plantain' + ('' if detail else '_lod1'), detail, seed); R = B.R
    H = 2.6
    B.cyl(T(0, 0, 0), .16, .11, H, C['pl_stem'], n=9 if detail else 5, top=False)
    nl = 8 if detail else 5
    for i in range(nl):
        yaw = 2 * math.pi * i / nl + R.uniform(-.2, .2); torn = detail and R.random() < .6
        col = C['pl_leaf'] if R.random() > .2 else C['pl_leaf_d']
        if torn:
            for k in range(4): B.leaf((0, 0, H - .1), yaw + (k - 1.5) * .06, R.uniform(.4, .9), R.uniform(1.8, 2.3), .2, col, droop=1.2, seg=4, shape='blade', both=True)
        else: B.leaf((0, 0, H - .1), yaw, R.uniform(.4, .9), R.uniform(1.9, 2.4), .62, col, droop=1.1, seg=4 if detail else 2, both=True)
    # the bunch hanging, and the purple bud
    B.tube([Vector((0, 0, H - .1)), Vector((.25, 0, H + .1)), Vector((.45, 0, H - .3)), Vector((.5, 0, H - 1.1))], [.03] * 4, C['pl_stem'], n=5 if detail else 3)
    for k in range(5 if detail else 2):
        for j in range(8 if detail else 1):
            a = 2 * math.pi * j / 8; B.sphere(T(.5 + math.cos(a) * .12, math.sin(a) * .12, H - .35 - k * .14, a, ry=-1.0, s=(.3, .3, 1.3)), .1 if detail else .25, C['pl_fruit'], seg=5, rings=3)
    B.sphere(T(.5, 0, H - 1.25, s=(.7, .7, 1.2)), .1, C['pl_bud'], seg=6, rings=4)
    return B.finish()


def grass(detail=True, seed=103):
    B = MB('fm_grass' + ('' if detail else '_lod1'), detail, seed); R = B.R
    for i in range(46 if detail else 12):
        a = R.uniform(0, 6.28); d = R.uniform(0, .45)
        B.leaf((math.cos(a) * d, math.sin(a) * d, 0), a + R.uniform(-.5, .5), R.uniform(1.0, 1.45), R.uniform(.8, 1.7), .05 if detail else .1, C['grass'] if i % 3 else C['grass_d'], droop=.9, seg=3 if detail else 2, tip=C['grass_y'], shape='blade', both=detail)
    return B.finish()


# ================================================================ props
def scarecrow(detail=True, seed=104):
    B = MB('fm_scarecrow' + ('' if detail else '_lod1'), detail, seed)
    post(B, 0, 0, 2.1, .05); B.box(T(0, 0, 1.55), 1.4, .06, .06, C['wood_d'], .1)
    B.box(T(0, 0, .95), .55, .32, .65, C['cloth1'], .25, f=8)                          # an old ankara shirt
    for sx in (-1, 1): B.box(T(sx * .52, 0, 1.45), .55, .22, .2, C['cloth2'], .25, f=8)
    B.box(T(0, 0, .4), .45, .25, .55, C['cloth5'], .2)
    B.sphere(T(0, 0, 1.85), .2, C['sack2'], seg=8, rings=5)
    B.cyl(T(0, 0, 1.98), .38, .2, .08, C['hay'], n=10); B.cyl(T(0, 0, 2.05), .18, .14, .18, C['hay'], n=10)
    return B.finish()


def tools(detail=True, seed=105):
    """Wheelbarrow, sacks, a hoe and a cutlass against a crate, baskets of harvest, an egg tray, a milk can."""
    B = MB('fm_tools' + ('' if detail else '_lod1'), detail, seed); R = B.R
    # wheelbarrow
    M = T(0, 0, 0)
    tray = [Vector(v) for v in ((-.4, -.55, .35), (.4, -.55, .35), (.45, .5, .55), (-.45, .5, .55), (-.3, -.45, .7), (.3, -.45, .7), (.32, .4, .75), (-.32, .4, .75))]
    for q in ((0, 1, 2, 3), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        B.face([tray[i] for i in q], C['green'], .1); B.face([tray[i] for i in q][::-1], lin('#1e5a32'), .1)
    for sx in (-1, 1): B.box(T(sx * .28, .4, .4, ry=0, rx=-.15), .04, 1.4, .04, C['steel'], .1)
    wheel(B, 0, -.75, .2, .2, .08, detail)
    for sx in (-1, 1): B.box(T(sx * .25, .45, 0), .04, .04, .4, C['steel'], .1)
    B.sphere(T(0, 0, .65, s=(1.3, 1.6, .6)), .3, C['soil_d'], seg=8, rings=4)
    # sacks and baskets
    sack(B, 1.1, .3, .62, C['sack'], .4); sack(B, 1.55, .5, .6, C['sack2'], -.3); sack(B, 1.3, .9, .3, C['sack'], 1.2, lie=True)
    basket(B, -1.0, -.2, 0, .3, .05, C['tomato'], 14); basket(B, -1.0, .5, 0, .28, .05, C['pep_r'], 14)
    # hoe and cutlass leaning
    B.cyl(T(1.9, .0, 0, rx=-.35), .02, .02, 1.2, C['wood'], n=5); B.box(T(1.9, -.43, 1.05, rx=1.2), .2, .03, .16, C['steel'], .1)
    B.box(T(2.1, .1, .5, rx=-.3), .05, .03, .55, C['steel'], .1); B.box(T(2.1, .25, .05, rx=-.3), .04, .04, .2, C['wood_d'], .1)
    # egg tray and milk can
    B.box(T(-1.8, .2, 0), .32, .32, .04, C['sack2'], .1)
    if detail:
        for i in range(5):
            for j in range(5): B.sphere(T(-1.93 + i * .065, .07 + j * .065, .07, s=(1, 1, 1.25)), .026, C['egg'], seg=6, rings=4)
    B.cyl(T(-1.8, .9, 0), .17, .17, .45, C['churn'], n=12 if detail else 6); B.cyl(T(-1.8, .9, .45), .17, .09, .12, C['churn'], n=12 if detail else 6); B.cyl(T(-1.8, .9, .57), .1, .1, .06, C['chrome'], n=10)
    return B.finish()


def produce(detail=True, seed=106):
    """A stack of harvest for the store and the pickup's back: sacks, baskets, crates of tomato, plantain."""
    B = MB('fm_produce' + ('' if detail else '_lod1'), detail, seed); R = B.R
    for i in range(4): sack(B, -.6 + (i % 2) * .6, -.35 + (i // 2) * .7, .62, C['sack'] if i % 2 else C['sack2'], R.uniform(-.3, .3))
    for i, (x, c) in enumerate(((.7, C['tomato']), (.7, C['pep_r']))):
        B.box(T(x, -.35 + i * .7, 0), .5, .5, .3, C['wood_l'], .15);
        if detail:
            for k in range(9): B.sphere(T(x - .15 + (k % 3) * .15, -.35 + i * .7 - .15 + (k // 3) * .15, .33), .06, c, seg=6, rings=3)
    return B.finish()


def truck(detail=True, seed=107):
    """The old farm pickup: faded cream body, wooden boards raised round the open back, sacks and baskets in it.
    A vehicle in the game: four wheels touching the ground, front toward -Y."""
    B = MB('fm_truck' + ('' if detail else '_lod1'), detail, seed); R = B.R
    BO, BD = C['truck'], C['truck_d']
    bx = lambda x0, x1, y0, y1, z0, z1, c, var=.08: B.box(T((x0 + x1) / 2, (y0 + y1) / 2, z0), x1 - x0, y1 - y0, z1 - z0, c, var, bottom=True)
    bx(-.6, .6, -2.2, 2.2, .45, .66, C['tyre'])                                         # chassis
    bx(-.9, .9, -.15, 2.35, .82, .92, C['steel'])                                       # bed floor
    for x in (-.9, .9): bx(x - .04, x + .04, -.15, 2.35, .92, 1.32, BO)                # steel sides
    bx(-.9, .9, 2.31, 2.37, .9, 1.3, BD)                                                # tailgate
    if detail:   # wooden boards raised on stakes round the back
        for x in (-.92, .92):
            for y in (0, .8, 1.6, 2.3): bx(x - .03, x + .03, y - .03, y + .03, 1.3, 1.95, C['wood_d'])
            for z in (1.5, 1.8): bx(x - .02, x + .02, -.1, 2.35, z, z + .12, C['wood'])
        for z in (1.5, 1.8): bx(-.92, .92, 2.33, 2.37, z, z + .12, C['wood'])
    # cab with its rounded old roof
    bx(-.9, .9, -1.45, -.15, .66, 1.28, BO)
    cab = [(-.88, -1.3, 1.28), (.88, -1.3, 1.28), (.82, -.95, 1.86), (-.82, -.95, 1.86), (-.88, -.18, 1.28), (.88, -.18, 1.28), (.82, -.22, 1.86), (-.82, -.22, 1.86)]
    for q, c in zip([(0, 1, 2, 3), (5, 4, 7, 6), (3, 2, 6, 7), (0, 3, 7, 4), (1, 5, 6, 2)], [C['glass'], C['glass'], BO, C['glass'], C['glass']]):
        B.face([Vector(cab[i]) for i in q], c, .06)
    bx(-.84, .84, -.98, -.2, 1.86, 1.93, BO)                                             # roof
    for x in (-.89, .89): bx(x - .012, x + .012, -.68, -.6, 1.28, 1.86, BD)
    bx(-.88, .88, -2.35, -1.45, .62, 1.12, BO)                                           # bonnet
    bx(-.7, .7, -2.38, -2.34, .7, 1.02, C['chrome'])                                     # grille
    for x in (-.62, .62): B.cyl(T(x, -2.36, .92, rx=1.5708), .11, .11, .04, C['board'], n=10)   # round headlamps
    bx(-.95, .95, -2.55, -2.35, .55, .7, C['chrome'])                                    # bumpers
    bx(-.95, .95, 2.37, 2.5, .55, .7, C['chrome'])
    for x in (-.78, .78): bx(x - .08, x + .08, 2.37, 2.39, 1.0, 1.15, C['red'])
    for y in (-1.45, 1.35):                                                              # arches
        for x in (-.95, .95): bx(x - .05, x + .05, y - .55, y + .55, .84, .92, BD)
    for x in (-1.02, 1.02): bx(x - .05, x + .05, -1.25, -1.18, 1.3, 1.45, C['tyre'])     # mirrors
    if detail:   # a blue stripe, rust spots, the load
        for x in (-.905, .905): bx(x - .005, x + .005, -2.3, 2.3, .98, 1.04, C['truck_b'])
        for i in range(8):
            x = .91 if i % 2 else -.91; y = R.uniform(-2.0, 2.0); z = R.uniform(.7, 1.1); bx(x - .006, x + .006, y, y + R.uniform(.1, .3), z, z + .08, C['rust'])
        for i in range(6): sack(B, -.45 + (i % 2) * .9, .3 + (i // 2) * .7, .62, C['sack'] if i % 2 else C['sack2'], R.uniform(-.3, .3)) if False else B.sphere(T(-.45 + (i % 2) * .9, .3 + (i // 2) * .7, 1.2, R.uniform(-.3, .3), s=(1, .8, 1.15)), .27, C['sack'] if i % 2 else C['sack2'], seg=8, rings=5, var=.1)
        basket(B, 0, 2.0, .92, .3, .05, C['tomato'], 12)
        for k in range(3): B.sphere(T(-.2 + k * .2, 1.1, 1.55, .3, s=(.4, 1.8, .5)), .12, C['pl_fruit'], seg=5, rings=3)
    for y in (-1.45, 1.35):
        for x in (-.8, .8): wheel(B, x, y, .37, .37, .24, detail)
    return B.finish()


# ================================================================ the animals (rigged, animated)
def make_arm(name, bones):
    """bones: list of (name, parent, head, tail)."""
    ad = bpy.data.armatures.new(name + '_rig'); ob = bpy.data.objects.new(name + '_rig', ad); bpy.context.scene.collection.objects.link(ob)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    for (bn, par, hd, tl) in bones:
        eb = ad.edit_bones.new(bn); eb.head = hd; eb.tail = tl; eb.roll = 0
        if par: eb.parent = ad.edit_bones[par]; eb.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in ob.pose.bones: pb.rotation_mode = 'XYZ'
    return ob


def bind(mesh, arm):
    mesh.parent = arm; md = mesh.modifiers.new('Armature', 'ARMATURE'); md.object = arm


def actions(arm, defs, fps=24):
    """defs: {name: (frames, fn(t) -> {bone: (rx, ry, rz, (lx, ly, lz) or None)})}; each action keyed on every bone, pushed to its own NLA track."""
    ad = arm.animation_data or arm.animation_data_create()
    names = [pb.name for pb in arm.pose.bones]
    for name, (frames, fn) in defs.items():
        act = bpy.data.actions.new(arm.name.replace('_rig', '') + '_' + name); act.use_fake_user = True; ad.action = act
        for f in range(frames + 1):
            pose = fn(f / frames)
            for bn in names:
                pb = arm.pose.bones[bn]; r = pose.get(bn, (0, 0, 0, None))
                pb.rotation_euler = (r[0], r[1], r[2]); pb.keyframe_insert('rotation_euler', frame=f + 1)
                pb.location = r[3] if r[3] is not None else (0, 0, 0); pb.keyframe_insert('location', frame=f + 1)
        tr = ad.nla_tracks.new(); tr.name = name; st = tr.strips.new(name, 1, act)
        try:
            if hasattr(st, 'action_slot') and act.slots: st.action_slot = act.slots[0]
        except Exception as e: log('slot', e)
        ad.action = None
    for pb in arm.pose.bones: pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0)
    bpy.context.scene.render.fps = fps


COW_BONES = [('root', None, (0, 0, .9), (0, -.3, .9)),
             ('body', 'root', (0, .55, 1.05), (0, -.55, 1.05)),
             ('neck', 'body', (0, -.7, 1.18), (0, -1.05, 1.32)),
             ('head', 'neck', (0, -1.05, 1.32), (0, -1.45, 1.05)),
             ('tail', 'body', (0, .92, 1.2), (0, 1.0, .55)),
             ('fl_u', 'body', (-.22, -.6, .9), (-.22, -.6, .48)), ('fl_l', 'fl_u', (-.22, -.6, .48), (-.22, -.6, 0)),
             ('fr_u', 'body', (.22, -.6, .9), (.22, -.6, .48)), ('fr_l', 'fr_u', (.22, -.6, .48), (.22, -.6, 0)),
             ('bl_u', 'body', (-.22, .62, .95), (-.22, .62, .5)), ('bl_l', 'bl_u', (-.22, .62, .5), (-.22, .62, 0)),
             ('br_u', 'body', (.22, .62, .95), (.22, .62, .5)), ('br_l', 'br_u', (.22, .62, .5), (.22, .62, 0))]


def cow_mesh():
    """The White Fulani: white with grey shading, a hump, a dewlap, long lyre horns with dark tips, dark muzzle."""
    names = [b[0] for b in COW_BONES]; B = MB('fm_cow', True, 201, bones=names); R = B.R
    bi = lambda n: names.index(n)
    def cowcol(p, lp):
        g = .5 + .5 * vnoise(p, 1.2, 5); k = max(0, min(1, (p.z - 1.15) * 2.2)) * .6 + max(0, -p.y - .6) * .25
        return tuple(C['cow'][i] * (1 - k * .5) + C['cow_g'][i] * k * .5 for i in range(3))
    # body: one smooth barrel from chest to rump, the hump over the shoulders
    B.bone = bi('body')
    X, Z = Vector((1, 0, 0)), Vector((0, 0, 1))
    SEC = [(-1.0, 1.02, .1, .1, .12), (-.94, 1.02, .22, .24, .27), (-.82, 1.03, .31, .36, .4), (-.62, 1.06, .35, .5, .44), (-.38, 1.03, .37, .41, .47),
           (-.05, 1.0, .39, .37, .48), (.3, 1.02, .38, .35, .42), (.6, 1.07, .36, .34, .33), (.82, 1.1, .3, .3, .25), (.95, 1.12, .2, .2, .16), (1.0, 1.13, .08, .08, .07)]
    B.loft([(Vector((0, y, cz)), X, Z, hw, hu, hd) for (y, cz, hw, hu, hd) in SEC], n=20, colf=lambda p: cowcol(p, p))
    B.loft([(Vector((0, -.86 + t * .18, .62 - t * .02)), X, Z, .05 + .03 * t, .25, .05) for t in (0, .5, 1)], n=8, col=C['cow'], cap=True)   # the dewlap under the chest
    # neck
    B.bone = bi('neck')
    NS = [(Vector((0, -.66, 1.2)), .25, .3, .3), (Vector((0, -.86, 1.27)), .22, .25, .27), (Vector((0, -1.04, 1.33)), .17, .19, .2)]
    B.loft([(c, X, Z, hw, hu, hd) for (c, hw, hu, hd) in NS], n=14, colf=lambda p: cowcol(p, p), cap=False)
    B.loft([(Vector((0, -.8 - t * .25, .98 + t * .18)), X, Z, .05, .18 - t * .06, .08) for t in (0, .5, 1)], n=8, col=C['cow'])   # throat fold
    # head: broad forehead tapering to a wide dark muzzle, ears out to the sides, eyes, the lyre horns
    B.bone = bi('head')
    d = Vector((0, -.62, -.62)).normalized(); up = Vector((0, -.62, .62)).normalized()
    hc = lambda t: Vector((0, -1.06, 1.37)) + d * t
    HS = [(0, .12, .1, .1, C['cow']), (.08, .15, .13, .13, C['cow']), (.2, .13, .12, .12, C['cow']), (.32, .1, .095, .1, C['cow_g']), (.4, .1, .08, .09, C['muzzle']), (.46, .095, .07, .075, C['muzzle']), (.49, .07, .05, .05, C['nose'])]
    cols = {i: hs[4] for i, hs in enumerate(HS)}
    def headcol(p):
        t = (p - Vector((0, -1.06, 1.37))).dot(d)
        for i in range(len(HS) - 1):
            if t <= HS[i + 1][0]:
                f = (t - HS[i][0]) / max(1e-4, HS[i + 1][0] - HS[i][0]); a, b2 = HS[i][4], HS[i + 1][4]
                return tuple(a[m] * (1 - f) + b2[m] * f for m in range(3))
        return HS[-1][4]
    B.loft([(hc(t), X, up, hw, hu, hd) for (t, hw, hu, hd, c) in HS], n=14, colf=headcol)
    for sx in (-1, 1):
        B.sphere(T(sx * .125, -1.17, 1.3), .026, C['eye'], seg=6, rings=4)
        e0 = Vector((sx * .12, -1.08, 1.4))
        B.loft([(e0 + Vector((sx * t, 0, -.02 * t)), Vector((0, 1, 0)), Vector((0, 0, 1)), .055 * (1 - t * 2.2) + .02, .02, .02) for t in (0, .12, .24, .3)], n=8, col=C['cow_d'])   # ears
        hp = [Vector((sx * .09, -1.03, 1.45)), Vector((sx * .22, -.99, 1.55)), Vector((sx * .32, -.98, 1.74)), Vector((sx * .31, -1.01, 1.96)), Vector((sx * .23, -1.07, 2.08))]
        B.tube(hp, [.05, .045, .036, .026, .01], C['horn'], n=7, cols=[C['horn'], C['horn'], C['horn'], lin('#8a7a62'), C['horn_t']])
    # tail with its black switch
    B.bone = bi('tail')
    B.tube([Vector((0, .98, 1.18)), Vector((0, 1.02, .95)), Vector((0, 1.0, .7)), Vector((0, .99, .55))], [.04, .03, .025, .02], C['cow'], n=6)
    B.sphere(T(0, .99, .45, s=(.6, .6, 1.6)), .07, C['switch'], seg=6, rings=4)
    # legs: upper and lower, hooves
    for side, sx in (('l', -1), ('r', 1)):
        for fb, y, top in (('f', -.6, .9), ('b', .62, .95)):
            B.bone = bi(fb + side + '_u')
            B.tube([Vector((sx * .22, y, top + .1)), Vector((sx * .22, y + (.04 if fb == 'b' else 0), (top + .48) / 2)), Vector((sx * .22, y, .48))], [.13 if fb == 'b' else .11, .09, .065], C['cow'], n=8)
            B.bone = bi(fb + side + '_l')
            B.tube([Vector((sx * .22, y, .5)), Vector((sx * .22, y + (-.03 if fb == 'b' else .02), .25)), Vector((sx * .22, y, .08))], [.06, .045, .045], C['cow_d'], n=8)
            B.cyl(T(sx * .22, y - .01, 0), .055, .05, .09, C['hoof'], n=8)
    ob = B.finish(doubles=False)
    return ob


def cow_actions(arm):
    S, PI = math.sin, math.pi
    def walk(t):
        w = 2 * PI * t; P = {}
        for bn, ph in (('bl', 0), ('fl', .25), ('br', .5), ('fr', .75)):
            a = S(w + ph * 2 * PI); lift = max(0, math.cos(w + ph * 2 * PI))   # the leg swings forward while it is lifted
            up = .38 * a; P[bn + '_u'] = (up, 0, 0, None)
            knee = (-.55 if bn[0] == 'f' else .45) * lift; P[bn + '_l'] = (knee, 0, 0, None)
        P['root'] = (0, 0, 0, (0, .012 * S(4 * w), 0))
        P['body'] = (.015 * S(2 * w), .03 * S(w), 0, None)
        P['neck'] = (.06 * S(2 * w + .5), 0, .03 * S(w), None); P['head'] = (.05 * S(2 * w + 1), 0, 0, None)
        P['tail'] = (0, .2 * S(w), .1 * S(w + 1), None); return P
    def idle(t):
        w = 2 * PI * t; P = {}
        P['body'] = (.01 * S(w), 0, 0, None)
        P['neck'] = (.05 * S(w), 0, .18 * S(w * 1) * (1 if t < .5 else .4), None); P['head'] = (.05 * S(2 * w), .08 * S(w), 0, None)
        P['tail'] = (0, .55 * S(3 * w) * (1 if (t * 3) % 1 < .6 else .2), .2 * S(3 * w + .7), None); return P
    def graze(t):
        w = 2 * PI * t; P = {}
        P['neck'] = (.95 + .03 * S(4 * w), 0, .12 * S(w), None); P['head'] = (.35 + .1 * S(8 * w), 0, .05 * S(4 * w), None)
        P['body'] = (.02, 0, 0, None); P['fl_u'] = (.08, 0, 0, None); P['fr_u'] = (-.05, 0, 0, None)
        P['tail'] = (0, .4 * S(2 * w), .15 * S(2 * w + .5), None); return P
    actions(arm, {'Walk': (24, walk), 'Idle': (72, idle), 'Graze': (48, graze)})


HEN_BONES = [('root', None, (0, 0, .14), (0, -.1, .14)),
             ('body', 'root', (0, .08, .22), (0, -.08, .22)),
             ('head', 'body', (0, -.1, .28), (0, -.16, .42)),
             ('tail', 'body', (0, .12, .26), (0, .2, .39)),
             ('wing_l', 'body', (-.09, -.04, .27), (-.11, .12, .24)), ('wing_r', 'body', (.09, -.04, .27), (.11, .12, .24)),
             ('leg_l', 'root', (-.045, 0, .13), (-.045, 0, 0)), ('leg_r', 'root', (.045, 0, .13), (.045, 0, 0))]


def hen_mesh():
    names = [b[0] for b in HEN_BONES]; B = MB('fm_hen', True, 202, bones=names)
    bi = lambda n: names.index(n)
    def hencol(p, lp):
        g = vnoise(p, 22, 3); return C['hen'] if g > .4 else C['hen_l'] if g > .2 else C['hen_d']
    B.bone = bi('body')
    B.sphere(T(0, .02, .23, ry=0, rx=-.25, s=(.11, .17, .12)), 1.0, C['hen'], seg=12, rings=8, var=.15, colf=hencol, f=20)
    B.sphere(T(0, -.09, .28, s=(.075, .08, .09)), 1.0, C['hen_neck'], seg=10, rings=6, var=.15)               # breast and neck feathers
    B.bone = bi('head')
    B.sphere(T(0, -.14, .39, s=(.05, .06, .055)), 1.0, C['hen_neck'], seg=10, rings=6, var=.12)
    B.tube([Vector((0, -.11, .32)), Vector((0, -.13, .37))], [.045, .042], C['hen_neck'], n=8)
    for k in range(4): B.sphere(T(0, -.125 + k * .02, .44 + .01 * (k % 2), s=(.25, .7, 1)), .025, C['comb'], seg=6, rings=4)   # comb
    B.sphere(T(0, -.19, .35, s=(.5, .6, 1.2)), .02, C['comb'], seg=6, rings=4)                                  # wattle
    B.tube([Vector((0, -.185, .385)), Vector((0, -.225, .375))], [.014, .002], C['beak'], n=6)
    for sx in (-1, 1): B.sphere(T(sx * .04, -.165, .40), .009, C['eye'], seg=5, rings=3)
    B.bone = bi('tail')
    for k in range(5): B.leaf((0, .12, .27), math.pi / 2 + (k - 2) * .18, 1.0 + k * .05, .16, .06, C['hen_tail'], droop=1.2, seg=2, tip=C['hen_d'])
    for side, sx in (('l', -1), ('r', 1)):
        B.bone = bi('wing_' + side)
        B.sphere(T(sx * .1, .02, .24, rx=-.2, s=(.025, .12, .07)), 1.0, C['hen_d'], seg=8, rings=5, var=.15, colf=hencol, f=20)
        B.bone = bi('leg_' + side)
        B.tube([Vector((sx * .045, 0, .15)), Vector((sx * .045, .005, .08)), Vector((sx * .045, 0, .02))], [.018, .011, .009], C['hen_leg'], n=5)
        for a in (-.5, 0, .5): B.tube([Vector((sx * .045, 0, .012)), Vector((sx * .045 + math.sin(a) * .045, -math.cos(a) * .045, .005))], [.006, .004], C['hen_leg'], n=4)
        B.tube([Vector((sx * .045, 0, .012)), Vector((sx * .045, .03, .008))], [.005, .003], C['hen_leg'], n=4)
    return B.finish(doubles=False)


def hen_actions(arm):
    S, PI = math.sin, math.pi
    def walk(t):
        w = 2 * PI * t; P = {}
        P['leg_l'] = (.55 * S(w), 0, 0, None); P['leg_r'] = (-.55 * S(w), 0, 0, None)
        P['root'] = (0, 0, 0, (0, .012 * abs(S(w)), 0)); P['body'] = (0, .06 * S(w), 0, None)
        P['head'] = (0, 0, 0, (0, .025 * S(2 * w + 1.2), 0)); P['tail'] = (.1 * S(2 * w), 0, 0, None)
        P['wing_l'] = (0, 0, .05 * S(2 * w), None); P['wing_r'] = (0, 0, -.05 * S(2 * w), None); return P
    def idle(t):
        w = 2 * PI * t; P = {}
        jerk = lambda k: 1 if (t * 4 + k) % 1 < .5 else -1
        P['head'] = (.1 * jerk(0), 0, .35 * jerk(.3), None); P['body'] = (.02 * S(w), 0, 0, None); P['tail'] = (.05 * S(2 * w), 0, 0, None); return P
    def peck(t):
        w = 2 * PI * t; P = {}
        dip = max(0, S(3 * w)) ** 2
        P['body'] = (.3 * (0.5 + .5 * S(w * .5)), 0, 0, None); P['head'] = (1.0 * dip + .2, 0, 0, (0, .03 * dip, -.04 * dip))
        P['tail'] = (.25, 0, 0, None); return P
    actions(arm, {'Walk': (12, walk), 'Idle': (48, idle), 'Peck': (36, peck)})


# ================================================================ light and shade into the colours, export
def bake_ao(ob):
    sc = bpy.context.scene; me = ob.data
    try:
        sc.render.engine = 'CYCLES'; sc.cycles.samples = 48; sc.cycles.device = 'CPU'
        if sc.world: sc.world.light_settings.distance = 1.0
        ao = me.color_attributes.new('AO', 'FLOAT_COLOR', 'CORNER'); me.color_attributes.active_color = ao
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        col = me.color_attributes['Col']; n = len(col.data)
        import numpy as np
        a = np.empty(n * 4, np.float32); ao.data.foreach_get('color', a); c = np.empty(n * 4, np.float32); col.data.foreach_get('color', c)
        a = a.reshape(-1, 4)[:, 0]; c = c.reshape(-1, 4); f = .42 + .58 * np.clip(a, 0, 1); c[:, :3] *= f[:, None]; col.data.foreach_set('color', c.ravel())
        me.color_attributes.remove(me.color_attributes['AO']); me.color_attributes.active_color = me.color_attributes['Col']
        try: me.color_attributes.render_color_index = 0
        except Exception: pass
        return True
    except Exception as e:
        log('ao skipped', ob.name, e)
        if 'AO' in me.color_attributes: me.color_attributes.remove(me.color_attributes['AO'])
        return False


def export(obs, name, anim=False):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    path = os.path.join(OUT, name + '.glb')
    args = dict(filepath=path, use_selection=True, export_format='GLB', export_yup=True, export_apply=not anim, export_texcoords=False, export_normals=True, export_extras=True)
    if anim:
        args.update(export_animations=True, export_skins=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_def_bones=False)
    for drop in ([], ['export_animation_mode'], ['export_animation_mode', 'export_def_bones'], ['export_texcoords']):
        try: bpy.ops.export_scene.gltf(**{k: v for k, v in args.items() if k not in drop}); break
        except TypeError as e: log('export retry', name, e)
    return os.path.getsize(path) // 1024


def want(n): return not ONLY or any(n.startswith(o) for o in ONLY)


try:
    open(LOGF, 'w').write('farm start %s\n' % (bpy.app.version_string,))
    # everything happens in a scene of its own ("NS Farm"); other scenes in this file are left alone
    win = bpy.context.window; old_scene = win.scene if win else None
    sc = bpy.data.scenes.get('NS Farm') or bpy.data.scenes.new('NS Farm')
    if win: win.scene = sc
    for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)
    for blk in (bpy.data.meshes, bpy.data.lights, bpy.data.cameras, bpy.data.armatures, bpy.data.actions, bpy.data.materials):
        for d in list(blk):
            if d.name.startswith(('fm_', 'FM', 'FarmCam', 'AnimCam', 'Farm')) and (d.users == 0 or blk is bpy.data.actions): blk.remove(d)
    w = bpy.data.worlds.get('FM World') or bpy.data.worlds.new('FM World'); sc.world = w; w.use_nodes = True
    STATIC = [('fm_barn', barn), ('fm_house', house), ('fm_coop', coop), ('fm_pen', pen), ('fm_tank', tank), ('fm_office', office), ('fm_gate', gate), ('fm_fence', fence),
              ('fm_bed', lambda d: bed(d, False)), ('fm_bed_wet', lambda d: bed(d, True))]
    for crop, fn in (('maize', maize), ('cassava', cassava), ('yam', yam), ('tomato', tomato), ('pepper', pepper)):
        for s in (1, 2, 3): STATIC.append(('fm_%s_%d' % (crop, s), (lambda f, st: (lambda d: f(st, d)))(fn, s)))
    STATIC += [('fm_palm', palm), ('fm_plantain', plantain), ('fm_grass', grass), ('fm_scarecrow', scarecrow), ('fm_tools', tools), ('fm_produce', produce), ('fm_truck', truck)]
    made = {}
    for name, fn in STATIC:
        if not want(name): continue
        for det in (True, False):
            t0 = time.time()
            try:
                ob = fn(det); ok = bake_ao(ob); kb = export([ob], name + ('' if det else '_lod1'))
                log(ob.name, len(ob.data.polygons), 'faces', 'ao' if ok else 'no-ao', kb, 'KB', round(time.time() - t0, 1), 's')
                if det: made[name] = ob; ob.hide_render = True
                else: bpy.data.objects.remove(ob, do_unlink=True)
            except Exception: log('FAILED piece', name, det, traceback.format_exc())
    # ---- the animals
    for name, mk, bones, acts in (('fm_cow', cow_mesh, COW_BONES, cow_actions), ('fm_hen', hen_mesh, HEN_BONES, hen_actions)):
        if not want(name): continue
        t0 = time.time()
        try:
            me = mk(); bake_ao(me); arm = make_arm(name, bones); bind(me, arm); acts(arm)
            kb = export([arm, me], name, anim=True); made[name] = arm
            log(name, len(me.data.polygons), 'faces', len(arm.data.bones), 'bones', [t.name for t in arm.animation_data.nla_tracks], kb, 'KB', round(time.time() - t0, 1), 's')
        except Exception: log('FAILED animal', name, traceback.format_exc())
    # ---- a little farm to look at
    if PREVIEW and not ONLY:
        def put(k, x, y, rz=0):
            if k not in made: return None
            o = made[k].copy(); o.location = (x, y, 0); o.rotation_euler = (0, 0, rz); o.hide_render = False; sc.collection.objects.link(o); return o
        put('fm_house', -9, 9); put('fm_barn', 3, 10); put('fm_tank', -3.5, 7); put('fm_coop', 13, 2, -1.5708); put('fm_pen', -10, -4)
        crops = ['fm_maize_3', 'fm_cassava_3', 'fm_yam_3', 'fm_tomato_3', 'fm_pepper_3', 'fm_maize_2', 'fm_tomato_1', 'fm_yam_2']
        for i, k in enumerate(crops):
            x, y = -1 + (i % 4) * 4.8, -2.5 - (i // 4) * 3.8
            put('fm_bed_wet' if i % 3 == 0 else 'fm_bed', x, y); put(k, x, y)
        for i, (x, y) in enumerate(((-16, 12), (17, 12), (-17, -12), (20, -6), (8, 16))): put('fm_palm' if i % 2 == 0 else 'fm_plantain', x, y, i)
        for i in range(10): put('fm_grass', -18 + i * 4, 17 + (i % 3))
        put('fm_scarecrow', 9, -7); put('fm_tools', 7, 5.5); put('fm_truck', 10, 8, -1.2); put('fm_gate', 0, -14); put('fm_office', -6, -12)
        for i in range(6): put('fm_fence', -14 + i * 4.2, -14) if i not in (3,) else None
        for k, x, y in (('fm_cow', -10, -4),):
            if k in made:
                a = made[k]; a.location = (x, y, 0); a.rotation_euler = (0, 0, .8)
        if 'fm_hen' in made: made['fm_hen'].location = (13, 0, 0)
        bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -.01)); ground = bpy.context.active_object; ground.name = 'fm_GROUND'
        gm = bpy.data.materials.new('FM Laterite'); gm.use_nodes = True; gb = gm.node_tree.nodes.get('Principled BSDF'); gb.inputs['Base Color'].default_value = lin('#8f6a3c') + (1,); gb.inputs['Roughness'].default_value = .95
        ground.data.materials.append(gm)
        sun = bpy.data.lights.new('Farm Sun', 'SUN'); sun.energy = 4.2; sun.angle = math.radians(2); sun.color = (1, .93, .82)
        so = bpy.data.objects.new('Farm Sun', sun); so.rotation_euler = (math.radians(42), math.radians(10), math.radians(150)); sc.collection.objects.link(so)
        bg = w.node_tree.nodes.get('Background')
        if bg: bg.inputs[0].default_value = (.55, .7, .95, 1); bg.inputs[1].default_value = 1.1
        cam = bpy.data.cameras.new('FarmCam'); cam.lens = 22; co = bpy.data.objects.new('FarmCam', cam); sc.collection.objects.link(co)
        co.location = (4, -24, 7.5); co.rotation_euler = (math.radians(74), 0, math.radians(0)); sc.camera = co
        sc.render.engine = 'CYCLES'; sc.cycles.samples = 64; sc.cycles.use_denoising = True
        sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1280, 720, 100
        try: sc.view_settings.view_transform = 'AgX'
        except Exception: pass
        sc.render.filepath = os.path.join(OUT, 'farm_preview.png'); sc.render.image_settings.file_format = 'PNG'
        t0 = time.time(); bpy.ops.render.render(write_still=True); log('preview rendered', int(time.time() - t0), 's')
        cam2 = bpy.data.cameras.new('AnimCam'); cam2.lens = 50; c2 = bpy.data.objects.new('AnimCam', cam2); sc.collection.objects.link(c2)
        c2.location = (-6.5, -9.5, 2.4); c2.rotation_euler = (math.radians(80), 0, math.radians(-25)); sc.camera = c2
        sc.render.filepath = os.path.join(OUT, 'farm_preview2.png'); bpy.ops.render.render(write_still=True); log('preview 2 rendered')
        sc.camera = co
    try: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'naija_farm.blend'), copy=True)   # a copy: the open file keeps its own name
    except Exception as e: log('save copy', e)
    if win and old_scene and old_scene != sc and globals().get('BACK', True): win.scene = old_scene   # hand the window back to the scene that was open
    log('ALL DONE')
except Exception:
    log('FAILED', traceback.format_exc())
