# Naija Streets: a Lagos market kit, built in Blender.
# Stalls table by table: zinc-roof stalls, big umbrellas, tarpaulin canopies, wooden kiosks, plain tables with basins,
# and the big refuse heap (bola). Each piece is one mesh with colours per corner (light and shade baked in), exported
# for the game (mk_*.glb and a lighter mk_*_lod1.glb). A little market street is laid out to look at, and rendered.
import bpy, bmesh, math, random, os, time, traceback
from mathutils import Vector, Matrix

BASE = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms')
OUT = os.path.join(BASE, 'market'); os.makedirs(OUT, exist_ok=True)
LOGF = os.path.join(BASE, 'market_log.txt')
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
    """One model: faces with a colour at every corner."""
    def __init__(self, name, detail=True, seed=1):
        self.name = name; self.detail = detail; self.bm = bmesh.new(); self.col = self.bm.loops.layers.color.new('Col'); self.R = random.Random(seed)

    def poly(self, pts, cols, smooth=False):
        vs = [self.bm.verts.new(p) for p in pts]
        try: f = self.bm.faces.new(vs)
        except ValueError: return None
        for l, c in zip(f.loops, cols): l[self.col] = (c[0], c[1], c[2], 1.0)
        f.smooth = smooth; return f

    def shade(self, col, p, var=.12, f=3.0, s=0):
        k = 1 + var * (vnoise(p, f, s) * 2 - 1); return (col[0] * k, col[1] * k, col[2] * k)

    def face(self, pts, col, var=.1, smooth=False, f=3.0, s=0):
        return self.poly(pts, [self.shade(col, p, var, f, s) for p in pts], smooth)

    # ---- shapes, all placed by a matrix M (move, turn, tilt)
    def box(self, M, sx, sy, sz, col, var=.08, bottom=False, top=True, f=3.0):
        hx, hy = sx / 2, sy / 2
        P = [M @ Vector(v) for v in ((-hx, -hy, 0), (hx, -hy, 0), (hx, hy, 0), (-hx, hy, 0), (-hx, -hy, sz), (hx, -hy, sz), (hx, hy, sz), (-hx, hy, sz))]
        Q = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)] + ([(4, 5, 6, 7)] if top else []) + ([(3, 2, 1, 0)] if bottom else [])
        for q in Q: self.face([P[i] for i in q], col, var, f=f)

    def cyl(self, M, r0, r1, h, col, n=10, top=True, bottom=False, smooth=True, var=.06, inner=None):
        ring = lambda r, z: [M @ Vector((r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), z)) for i in range(n)]
        a, b = ring(r0, 0), ring(r1, h)
        for i in range(n):
            j = (i + 1) % n; self.face([a[i], a[j], b[j], b[i]], col, var, smooth)
            if inner: self.face([b[i], b[j], a[j], a[i]], inner, var, smooth)
        if top: self.face(b, col, var)
        if bottom: self.face(list(reversed(a)), col, var)

    def sphere(self, M, r, col, seg=8, rings=5, var=.1, smooth=True, f=6.0, s=0):
        pts = []
        for j in range(rings + 1):
            t = math.pi * j / rings; pts.append([M @ Vector((r * math.sin(t) * math.cos(2 * math.pi * i / seg), r * math.sin(t) * math.sin(2 * math.pi * i / seg), -r * math.cos(t))) for i in range(seg)])
        for j in range(rings):
            for i in range(seg):
                k = (i + 1) % seg
                if j == 0: self.face([pts[0][i], pts[1][k], pts[1][i]], col, var, smooth, f, s)
                elif j == rings - 1: self.face([pts[j][i], pts[j][k], pts[j + 1][i]], col, var, smooth, f, s)
                else: self.face([pts[j][i], pts[j][k], pts[j + 1][k], pts[j + 1][i]], col, var, smooth, f, s)

    def finish(self):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        me = bpy.data.meshes.new(self.name); self.bm.to_mesh(me); self.bm.free()
        ob = bpy.data.objects.new(self.name, me); bpy.context.scene.collection.objects.link(ob)
        mat = bpy.data.materials.get('MK_VCOL')
        if not mat:
            mat = bpy.data.materials.new('MK_VCOL'); mat.use_nodes = True; nt = mat.node_tree; b = nt.nodes.get('Principled BSDF')
            vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nt.links.new(vc.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = .8
        me.materials.append(mat); return ob


def T(x=0, y=0, z=0, rz=0, rx=0, ry=0, s=(1, 1, 1)):
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Diagonal((s[0], s[1], s[2], 1))


C = {k: lin(v) for k, v in dict(
    wood='#8a6440', wood_d='#5e4128', wood_l='#a88358', plank_old='#7d6a55', zinc='#a7adb0', zinc_d='#7f8588', rust='#8c4a26', rust_d='#5c2f18',
    tomato='#c8261e', tatashe='#b51a10', rodo='#e0451c', onion='#a8603e', onion_w='#d9b48a', yam='#7a5534', yam_in='#e8dcc0', plantain='#6e8f2e', plantain_y='#d9b52c',
    orange='#e8871e', garri='#efe6cf', beans='#8a5a3a', okra='#5f8d2e', ugwu='#2f5d24', fish='#4a3424', pepper_g='#3f7f2a',
    basin_w='#efefe8', basin_b='#2f5fb0', basin_r='#c0302a', basin_g='#2e8a4e', tray='#b9bec2', blue_tarp='#2c63b8', blue_tarp_d='#1f4a8c',
    umb_r='#d23c2c', umb_w='#f2efe6', umb_b='#2f7bbf', umb_y='#f2b705', umb_g='#1f8a5c', umb_o='#e46b1e',
    sack='#d8c9a0', sack2='#c2b48a', cloth1='#c0392b', cloth2='#f1c40f', cloth3='#16a085', cloth4='#8e44ad', cloth5='#2c3e50', cloth6='#e67e22',
    bag_k='#1a1a1c', bag_b='#2b4aa0', bag_w='#e6e6dc', bag_r='#a02020', bag_g='#2e7d3c', carton='#a07a50', paper='#ddd8c8', soil='#5a4632', rot='#6b5a40', bag_y='#d9c22e',
    bottle_g='#3a7d44', bottle_c='#cfd8d0', bottle_b='#6b3f1d', drum='#7a3b20', stool='#2f6fb0', stool_r='#c83a2a', paint_b='#3b6f9e', paint_g='#4c8a5a', cooler='#2a62c0',
    tin_r='#c43b2b', tin_y='#e8c02a', tin_w='#e9e4d8', box_b='#3a5fa8', box_o='#e07a2a', board='#f0e6c8').items()}


# ================================================================ pieces
def table(B, w=2.0, d=1.0, h=.82, x=0, y=0, rz=0, cloth=None):
    M = T(x, y, 0, rz); R = B.R
    n = 4
    for i in range(n):   # plank top, each plank its own shade
        py = -d / 2 + d * (i + .5) / n
        B.box(M @ T(0, py, h - .035), w, d / n - .012, .035, tuple(c * R.uniform(.82, 1.12) for c in C['wood']), .14, bottom=True, f=8)
    for sx in (-1, 1):
        for sy in (-1, 1): B.box(M @ T(sx * (w / 2 - .06), sy * (d / 2 - .06), 0), .06, .06, h - .035, C['wood_d'], .1)
    B.box(M @ T(0, 0, .22), w - .14, .04, .04, C['wood_d'], .1)   # a rail low down
    if cloth: B.box(M @ T(0, -d / 2 - .005, h - .32), w + .02, .01, .3, cloth, .08)   # cloth hanging in front


def heap(B, cx, cy, z, r, col, n=14, rr=(.035, .05), sq=1.0, cols=None, seed=0):
    """A pile of round things (tomatoes, pepper, onions, oranges) heaped up."""
    R = B.R
    for i in range(n):
        a = R.uniform(0, 6.283); d = r * math.sqrt(R.uniform(0, 1)); h = (1 - d / r) * r * .9
        rad = R.uniform(*rr); c = R.choice(cols) if cols else col
        B.sphere(T(cx + math.cos(a) * d, cy + math.sin(a) * d, z + rad * .8 + h * .7, s=(1, 1, sq)), rad, tuple(v * R.uniform(.85, 1.1) for v in c), seg=6 if B.detail else 4, rings=4 if B.detail else 3, var=.08)


def basin(B, x, y, z, r, col, goods=None, gcols=None, n=12):
    B.cyl(T(x, y, z), r * .72, r, r * .45, col, n=14, top=False, bottom=True, inner=tuple(c * .8 for c in col))
    B.cyl(T(x, y, z + r * .45 - .01), r, r * 1.04, .02, (col[0] * .9, col[1] * .9, col[2] * .95), n=14, top=False)
    if goods and B.detail: heap(B, x, y, z + r * .25, r * .85, goods, n=int(n * 1.6), rr=(r * .1, r * .14), cols=gcols)
    elif goods: B.sphere(T(x, y, z + r * .35, s=(1, 1, .45)), r * .9, goods, seg=6, rings=3)


def tray(B, x, y, z, r, goods, gcols=None):
    B.cyl(T(x, y, z), r, r * 1.02, .03, C['tray'], n=16, top=True)
    if B.detail: heap(B, x, y, z + .02, r * .8, goods, n=10, rr=(.03, .045), cols=gcols)


def stool(B, x, y, rz=0, col=None):
    col = col or C['stool']; M = T(x, y, 0, rz)
    B.cyl(M @ T(0, 0, .42), .17, .17, .03, col, n=12)
    for i in range(4):
        a = i * math.pi / 2 + .785; B.box(M @ T(math.cos(a) * .12, math.sin(a) * .12, 0, rx=0), .03, .03, .43, tuple(c * .8 for c in col), .05)


def sack(B, x, y, h=.55, col=None, rz=0, open_goods=None):
    col = col or C['sack']; B.sphere(T(x, y, h * .48, rz, s=(1, .8, h / .5)), .25, col, seg=8, rings=5, var=.12)
    if open_goods and B.detail: heap(B, x, y, h * .85, .16, open_goods, n=8, rr=(.03, .04))


def corrugated(B, x0, x1, y0, y1, zf, zb, seed=0, rusty=.5):
    """A zinc sheet roof: ridges run down the slope (along y), front edge y0 at height zf, back y1 at zb."""
    pitch = .076 if B.detail else (x1 - x0); amp = .018 if B.detail else 0
    n = max(1, int(round((x1 - x0) / pitch))); ny = 3 if B.detail else 1
    def col(p):
        r = vnoise(p, 2.2, seed) * .7 + vnoise(p, 9, seed + 3) * .3; t = max(0, min(1, (r - (1 - rusty) * .75) * 2.2))
        z = C['zinc']; ru = C['rust'] if vnoise(p, 5, seed + 7) > .4 else C['rust_d']
        return tuple(z[i] * (1 - t) + ru[i] * t for i in range(3))
    def P(i, j, dz=0):
        x = x0 + (x1 - x0) * i / (2 * n); yy = y0 + (y1 - y0) * j / ny; zz = zf + (zb - zf) * j / ny
        return Vector((x, yy, zz + (amp if i % 2 else 0) + dz))
    for j in range(ny):
        for i in range(2 * n):
            q = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)]
            B.poly(q, [col(p) for p in q])   # top (faces up)
            qb = [P(i, j, -.004), P(i + 1, j, -.004), P(i + 1, j + 1, -.004), P(i, j + 1, -.004)][::-1]
            B.poly(qb, [tuple(c * .55 for c in col(p)) for p in qb])   # underside, darker


def goods_set(B, kind, x, y, z, w):
    """What a stall sells, laid out along a table top of width w."""
    R = B.R
    if kind == 'tomato':
        for i, gx in enumerate((-w * .32, 0, w * .32)):
            basin(B, x + gx, y + .05, z, .27, R.choice([C['basin_w'], C['basin_b'], C['basin_r']]), C['tomato'] if i != 1 else C['rodo'], [C['tomato'], C['tatashe']] if i != 1 else [C['rodo'], C['tomato']])
        for gx in (-w * .32, w * .32): heap(B, x + gx, y - .3, z, .14, C['tomato'], n=7 if B.detail else 2, rr=(.04, .05))
    elif kind == 'pepper':
        for i, gx in enumerate((-w * .36, -w * .12, w * .12, w * .36)):
            tray(B, x + gx, y, z, .2, [C['rodo'], C['tatashe'], C['pepper_g'], C['okra']][i])
    elif kind == 'onion':
        heap(B, x - w * .2, y, z, .38, C['onion'], n=26 if B.detail else 3, rr=(.045, .06), cols=[C['onion'], C['onion_w']])
        basin(B, x + w * .28, y, z, .28, C['basin_g'], C['onion_w'], [C['onion_w'], C['onion']])
    elif kind == 'yam':
        for i in range(9 if B.detail else 3):
            a = R.uniform(-.25, .25); B.sphere(T(x + (-w / 2 + .25 + i * (w - .5) / 8) * (1 if B.detail else 2.5), y + R.uniform(-.2, .2), z + .07, a + 1.57, ry=R.uniform(-.15, .15), s=(2.6, 1, .9)), .08, C['yam'], seg=8, rings=4, var=.18)
        B.sphere(T(x + w * .35, y + .2, z + .05, s=(1.6, 1, .8)), .1, C['yam_in'], seg=6, rings=3)
    elif kind == 'plantain':
        for i in range(4):
            cx = x - w * .36 + i * w * .24; col = C['plantain'] if i % 2 else C['plantain_y']
            for k in range(5 if B.detail else 1):
                B.sphere(T(cx + (k - 2) * .045, y, z + .06, .2, rx=.3, s=(.35, 2.3, .4)), .07, col, seg=6, rings=3)
    elif kind == 'garri':
        basin(B, x - w * .3, y, z, .3, C['basin_w'], C['garri'], None, n=1)
        basin(B, x, y, z, .3, C['basin_b'], C['beans'], None, n=1)
        basin(B, x + w * .3, y, z, .3, C['basin_r'], C['garri'], None, n=1)
        if B.detail:
            for gx in (-w * .3, 0, w * .3): B.cyl(T(x + gx, y, z + .12), .25, .25, .02, C['garri'] if gx != 0 else C['beans'], n=12)
    elif kind == 'cloth':
        cols = [C['cloth1'], C['cloth2'], C['cloth3'], C['cloth4'], C['cloth5'], C['cloth6']]
        for i in range(6):
            for k in range(3 if B.detail else 1): B.box(T(x - w * .4 + i * w * .16, y, z + k * .06), w * .14, .5, .055, R.choice(cols), .2, f=20)
    elif kind == 'fruit':
        heap(B, x - w * .25, y, z, .35, C['orange'], n=24 if B.detail else 3, rr=(.04, .05))
        tray(B, x + w * .25, y, z, .25, C['orange'], [C['orange'], C['plantain']])


GOODS = ['tomato', 'pepper', 'onion', 'yam', 'plantain', 'garri', 'cloth', 'fruit']


def stall_zinc(detail=True, seed=11, goods='tomato'):
    B = MB('mk_stall_zinc' + ('' if detail else '_lod1'), detail, seed); R = B.R
    table(B, 2.0, 1.0); goods_set(B, goods, 0, 0, .82, 2.0)
    hf, hb = 2.35, 2.05
    for sx in (-1, 1):
        B.box(T(sx * 1.12, -.72, 0, rz=R.uniform(-.05, .05)), .08, .08, hf, C['wood_d'], .15)   # crooked wooden posts
        B.box(T(sx * 1.12, .72, 0, rz=R.uniform(-.05, .05)), .08, .08, hb, C['wood_d'], .15)
        B.box(T(sx * 1.12, 0, hf - .12, rx=math.atan2(hf - hb, 1.44)), .06, 1.5, .06, C['wood'], .12)   # rafters
    B.box(T(0, -.72, hf - .08), 2.3, .06, .06, C['wood'], .12); B.box(T(0, .72, hb - .08), 2.3, .06, .06, C['wood'], .12)
    corrugated(B, -1.35, 1.35, -.95, .95, hf + .01, hb - .06, seed, rusty=.55)
    stool(B, .4, .55, .3, R.choice([C['stool'], C['stool_r']]))
    if detail: sack(B, -.6, .2, .5, C['sack'], .3, C['onion'] if goods != 'onion' else C['tomato']); sack(B, -.25, .3, .45, C['sack2'])
    return B.finish()


def stall_umbrella(detail=True, seed=12, goods='onion', cols=('umb_r', 'umb_w')):
    B = MB('mk_stall_umbrella' + ('' if detail else '_lod1'), detail, seed); R = B.R
    table(B, 1.9, .95, cloth=C['cloth3'] if goods == 'cloth' else None); goods_set(B, goods, 0, 0, .82, 1.9)
    px, py = .0, .62; B.cyl(T(px, py, 0), .022, .022, 2.55, C['tray'], n=6, top=False)
    B.cyl(T(px, py, 0), .2, .18, .12, C['zinc_d'], n=10)   # the base it sits in (a tyre rim / bucket)
    n = 12 if detail else 8; r = 1.55; zt, zr = 2.62, 2.2; A = [2 * math.pi * i / n for i in range(n)]
    for i in range(n):
        a0, a1 = A[i], A[(i + 1) % n] if i + 1 < n else 2 * math.pi
        c = C[cols[i % 2]]
        p0 = Vector((px, py, zt)); p1 = Vector((px + r * math.cos(a0), py + r * math.sin(a0), zr)); p2 = Vector((px + r * math.cos(a1), py + r * math.sin(a1), zr))
        B.poly([p0, p1, p2], [c, c, c]); B.poly([p0, p2, p1], [tuple(v * .5 for v in c)] * 3)   # top and the shaded underside
        if detail:   # the scalloped flap round the edge
            q = [p1, p2, p2 + Vector((0, 0, -.12)), p1 + Vector((0, 0, -.12))]; B.poly(q[::-1], [c] * 4); B.poly(q, [tuple(v * .6 for v in c)] * 4)
        if detail: B.box(T(px + (r - .05) * math.cos(a0), py + (r - .05) * math.sin(a0), zr - .02, a0 + 1.57, ry=0), .02, .2, .02, C['tray'], .05)
    stool(B, -.5, .5, -.4, R.choice([C['stool'], C['stool_r']]))
    if detail: B.box(T(.65, .45, 0, .2), .5, .32, .36, C['cooler'], .1); B.box(T(.65, .45, .36, .2), .52, .34, .05, lin('#f0f0f0'), .05)   # a cooler
    return B.finish()


def stall_tarp(detail=True, seed=13, goods='cloth'):
    B = MB('mk_stall_tarp' + ('' if detail else '_lod1'), detail, seed); R = B.R
    table(B, 2.1, 1.0); goods_set(B, goods, 0, 0, .82, 2.1)
    corners = [(-1.3, -.95, 2.25), (1.3, -.95, 2.3), (-1.3, .95, 2.05), (1.3, .95, 2.1)]
    for (x, y, h) in corners: B.cyl(T(x, y, 0), .03, .025, h, C['wood_l'], n=6, top=True)   # bamboo sticks
    nx, ny = (8, 6) if detail else (2, 2)
    def P(i, j, dz=0):
        u, v = i / nx, j / ny; (x0, y0, a), (x1, _, b), (_, y1, c), (_, _, d) = corners
        x = x0 + (x1 - x0) * u; y = y0 + (y1 - y0) * v; z = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
        z -= .22 * math.sin(math.pi * u) * math.sin(math.pi * v) + .03 * math.sin(u * 17 + v * 9)   # it sags in the middle
        return Vector((x, y, z + dz))
    for j in range(ny):
        for i in range(nx):
            q = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)]
            B.poly(q, [B.shade(C['blue_tarp'], p, .12, 2) for p in q]); B.poly([P(i, j + 1, -.005), P(i + 1, j + 1, -.005), P(i + 1, j, -.005), P(i, j, -.005)], [C['blue_tarp_d']] * 4)
    stool(B, .3, .6, .5, R.choice([C['stool'], C['stool_r']]))
    if detail:
        for k in range(3): B.box(T(-.9 + k * .35, .55, 0, R.uniform(-.3, .3)), .3, .3, .25 + k * .05, C['carton'], .12)
    return B.finish()


def stall_wood(detail=True, seed=14, goods='provisions'):
    """A wooden kiosk: plank walls, a counter in front, shelves of provisions, zinc on top."""
    B = MB('mk_stall_wood' + ('' if detail else '_lod1'), detail, seed); R = B.R
    W, D, H = 2.3, 1.6, 2.15; paint = R.choice([C['paint_b'], C['paint_g'], C['plank_old']])
    B.box(T(0, 0, 0), W, D, .12, C['wood_d'], .1)   # the raised floor
    def plank_wall(x0, x1, y, z0, z1, axis='x'):
        n = max(1, int((z1 - z0) / .16)) if detail else 1
        for i in range(n):
            za = z0 + (z1 - z0) * i / n; c = paint if R.random() > .3 else C['plank_old']; c = tuple(v * R.uniform(.8, 1.1) for v in c)
            if axis == 'x': B.box(T((x0 + x1) / 2, y, za), x1 - x0, .03, (z1 - z0) / n - .008, c, .18, f=10)
            else: B.box(T(y, (x0 + x1) / 2, za), .03, x1 - x0, (z1 - z0) / n - .008, c, .18, f=10)
    plank_wall(-W / 2, W / 2, D / 2, .12, H)                        # back
    plank_wall(-D / 2, D / 2, -W / 2, .12, H, 'y'); plank_wall(-D / 2, D / 2, W / 2, .12, H, 'y')   # sides
    plank_wall(-W / 2, W / 2, -D / 2, .12, 1.0)                     # the counter front
    B.box(T(0, -D / 2 - .05, 1.0), W + .1, .3, .05, C['wood_l'], .1)   # counter top
    for sx in (-1, 1): B.box(T(sx * (W / 2 - .03), -D / 2, 1.0), .07, .07, H - 1.0 + .05, C['wood_d'], .1)
    corrugated(B, -W / 2 - .25, W / 2 + .25, -D / 2 - .45, D / 2 + .2, H + .12, H - .05, seed, rusty=.7)
    for k, z in enumerate((1.15, 1.55)):   # shelves of tins, boxes and bottles
        B.box(T(0, D / 2 - .2, z), W - .1, .3, .03, C['wood_l'], .08)
        if detail:
            x = -W / 2 + .15
            while x < W / 2 - .15:
                t = R.random()
                if t < .45: B.cyl(T(x, D / 2 - .2, z + .03), .045, .045, .12, R.choice([C['tin_r'], C['tin_y'], C['tin_w']]), n=8); x += .11
                elif t < .8: bw = R.uniform(.12, .2); B.box(T(x + bw / 2, D / 2 - .2, z + .03), bw, .15, R.uniform(.12, .2), R.choice([C['box_b'], C['box_o'], C['tin_w']]), .1); x += bw + .03
                else: B.cyl(T(x, D / 2 - .2, z + .03), .035, .03, .22, R.choice([C['bottle_g'], C['bottle_b']]), n=6); x += .09
    if detail:   # goods on the counter and a board with the name
        for i in range(4): B.cyl(T(-.8 + i * .5, -D / 2 - .05, 1.05), .05, .05, .14, R.choice([C['tin_r'], C['tin_y']]), n=8)
        B.box(T(0, -D / 2 - .1, H - .05), 1.6, .03, .32, C['board'], .06)
        B.box(T(0, -D / 2 - .115, H + .02), 1.3, .01, .14, lin('#b8261e'), .05)
    stool(B, .5, -D / 2 - .7, .2, C['stool_r'])
    return B.finish()


def stall_table(detail=True, seed=15, goods='pepper'):
    B = MB('mk_stall_table' + ('' if detail else '_lod1'), detail, seed); R = B.R
    table(B, 1.8, .9); goods_set(B, goods, 0, 0, .82, 1.8)
    stool(B, .2, .6, .1, R.choice([C['stool'], C['stool_r']]))
    if detail:
        basin(B, -.6, .55, 0, .3, C['basin_b'], C['tomato'], [C['tomato'], C['tatashe']])
        sack(B, .7, .5, .5, C['sack2'], .5)
    return B.finish()


def bola(detail=True, seed=21):
    """The big refuse heap: a mound of rot and sand, nylon bags of every colour, cartons, bottles, peels, a rusty drum."""
    B = MB('mk_bola' + ('' if detail else '_lod1'), detail, seed); R = B.R
    rx, ry, h = 2.8, 2.1, 1.1
    # the mound itself
    nr, ns = (10, 18) if detail else (4, 8)
    rings = []
    for j in range(nr + 1):
        t = j / nr; rr = (1 - t ** 1.6); zz = h * (1 - (1 - t) ** 2) * .85
        rings.append([Vector((rx * rr * math.cos(2 * math.pi * i / ns) * (1 + .18 * vnoise((i, j, 0), .9, seed)), ry * rr * math.sin(2 * math.pi * i / ns) * (1 + .18 * vnoise((i, j, 1), .9, seed)), zz + .12 * vnoise((i, j, 2), 1.3, seed) * (1 - t * .5))) for i in range(ns)])
    for j in range(nr):
        for i in range(ns):
            k = (i + 1) % ns; q = [rings[j][i], rings[j][k], rings[j + 1][k], rings[j + 1][i]]
            B.poly(q, [B.shade(C['soil'] if vnoise(p, 1.5, seed) > .45 else C['rot'], p, .25, 4) for p in q], smooth=True)
    def on_mound(x, y):
        d = math.sqrt((x / rx) ** 2 + (y / ry) ** 2); return max(0, h * .85 * (1 - d ** 2))
    items = 330 if detail else 40
    for i in range(items):
        a = R.uniform(0, 6.283); d = math.sqrt(R.uniform(0, 1.05)); x, y = math.cos(a) * rx * d, math.sin(a) * ry * d; z = on_mound(x, y)
        t = R.random()
        if t < .6:   # nylon bags, tied, every colour (mostly black)
            c = R.choice([C['bag_k'], C['bag_k'], C['bag_k'], C['bag_b'], C['bag_b'], C['bag_w'], C['bag_w'], C['bag_r'], C['bag_g'], C['bag_y']]); s = R.uniform(.16, .3)
            B.sphere(T(x, y, z + s * .35, R.uniform(0, 6), s=(R.uniform(.9, 1.4), R.uniform(.8, 1.2), R.uniform(.6, .9))), s, c, seg=7 if detail else 5, rings=4 if detail else 3, var=.25, f=9)
        elif t < .7:   # cartons, squashed and tipped
            B.box(T(x, y, z - .05, R.uniform(0, 6), rx=R.uniform(-.5, .5), ry=R.uniform(-.5, .5)), R.uniform(.25, .5), R.uniform(.2, .4), R.uniform(.08, .3), C['carton'], .2)
        elif t < .82 and detail:   # plastic and glass bottles
            B.cyl(T(x, y, z + .03, R.uniform(0, 6), rx=1.57 + R.uniform(-.3, .3)), .035, .03, .25, R.choice([C['bottle_g'], C['bottle_c'], C['bottle_b'], C['bag_b']]), n=6)
        elif t < .92 and detail:   # paper and pure-water sachets
            B.box(T(x, y, z, R.uniform(0, 6), rx=R.uniform(-.4, .4)), R.uniform(.15, .35), R.uniform(.1, .3), .01, R.choice([C['paper'], C['bag_w'], lin('#9fd2e8')]), .1)
        elif detail:   # peels and rotten fruit
            B.sphere(T(x, y, z + .03, s=(1, 1, .5)), R.uniform(.04, .07), R.choice([C['orange'], C['plantain_y'], C['plantain'], C['rot']]), seg=5, rings=3)
    # a rusty oil-drum bin at the side, full to the top
    dx, dy = rx * .95, -ry * .55
    B.cyl(T(dx, dy, 0), .3, .3, .88, C['drum'], n=14, top=False, inner=C['rust_d'], var=.3)
    for zz in (.25, .6): B.cyl(T(dx, dy, zz), .31, .31, .03, C['rust_d'], n=14, top=False)
    for i in range(6 if detail else 2): B.sphere(T(dx + R.uniform(-.15, .15), dy + R.uniform(-.15, .15), .9 + R.uniform(0, .1), s=(1, 1, .7)), .14, R.choice([C['bag_k'], C['bag_b'], C['bag_w']]), seg=6, rings=3, var=.2)
    if detail:   # litter blown round the heap
        for i in range(80):
            a = R.uniform(0, 6.283); d = R.uniform(1.0, 1.6); x, y = math.cos(a) * rx * d, math.sin(a) * ry * d
            B.box(T(x, y, .005, R.uniform(0, 6)), R.uniform(.08, .25), R.uniform(.06, .2), .01, R.choice([C['paper'], C['bag_w'], C['bag_k'], C['bag_b'], lin('#9fd2e8'), C['carton']]), .1)
    return B.finish()


# ================================================================ light and shade into the colours, export
def bake_ao(ob):
    sc = bpy.context.scene; me = ob.data
    try:
        sc.render.engine = 'CYCLES'; sc.cycles.samples = 64; sc.cycles.device = 'CPU'
        if sc.world: sc.world.light_settings.distance = 1.2
        ao = me.color_attributes.new('AO', 'FLOAT_COLOR', 'CORNER'); me.color_attributes.active_color = ao
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        col = me.color_attributes['Col']; n = len(col.data)
        import numpy as np
        a = np.empty(n * 4, np.float32); ao.data.foreach_get('color', a); c = np.empty(n * 4, np.float32); col.data.foreach_get('color', c)
        a = a.reshape(-1, 4)[:, 0]; c = c.reshape(-1, 4); f = .38 + .62 * np.clip(a, 0, 1); c[:, :3] *= f[:, None]; col.data.foreach_set('color', c.ravel())
        me.color_attributes.remove(me.color_attributes['AO']); me.color_attributes.active_color = me.color_attributes['Col']
        try: me.color_attributes.render_color_index = 0
        except Exception: pass
        return True
    except Exception as e:
        log('ao skipped', ob.name, e)
        if 'AO' in me.color_attributes: me.color_attributes.remove(me.color_attributes['AO'])
        return False


def export(ob):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    path = os.path.join(OUT, ob.name + '.glb')
    args = dict(filepath=path, use_selection=True, export_format='GLB', export_yup=True, export_apply=True, export_texcoords=False, export_normals=True, export_extras=True)
    bpy.ops.export_scene.gltf(**args)
    return os.path.getsize(path) // 1024


try:
    open(LOGF, 'w').write('market start\n')
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections): bpy.data.collections.remove(c)
    for blk in (bpy.data.meshes, bpy.data.lights, bpy.data.cameras):
        for d in list(blk):
            if d.users == 0: blk.remove(d)
    sc = bpy.context.scene
    w = sc.world or bpy.data.worlds.new('World'); sc.world = w; w.use_nodes = True
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0)); ground = bpy.context.active_object; ground.name = 'GROUND'
    gm = bpy.data.materials.new('Laterite'); gm.use_nodes = True; gb = gm.node_tree.nodes.get('Principled BSDF'); gb.inputs['Base Color'].default_value = lin('#8f5a3c') + (1,); gb.inputs['Roughness'].default_value = .95
    ground.data.materials.append(gm)
    BUILD = [stall_zinc, stall_umbrella, stall_tarp, stall_wood, stall_table, bola]
    made = {}
    for fn in BUILD:
        for det in (True, False):
            ob = fn(det); t0 = time.time(); ok = bake_ao(ob); kb = export(ob)
            log(ob.name, len(ob.data.polygons), 'faces', 'ao' if ok else 'no-ao', kb, 'KB', round(time.time() - t0, 1), 's')
            if det: made[ob.name] = ob; ob.hide_render = True
            else: bpy.data.objects.remove(ob, do_unlink=True)
    # ---- a little market street to look at: two rows facing each other, the heap at the end
    lay = []
    kinds = ['mk_stall_zinc', 'mk_stall_umbrella', 'mk_stall_tarp', 'mk_stall_wood', 'mk_stall_table', 'mk_stall_zinc', 'mk_stall_umbrella']
    for row, (yy, rz) in enumerate(((-2.6, math.pi), (2.6, 0))):
        for i in range(6):
            k = kinds[(i * 3 + row * 2) % len(kinds)]; lay.append((k, -9 + i * 3.4, yy, rz))
    for k, x, y, rz in lay:
        o = made[k].copy(); o.location = (x, y, 0); o.rotation_euler = (0, 0, rz); o.hide_render = False; sc.collection.objects.link(o)
    b = made['mk_bola']; b.location = (12.5, -1.5, 0); b.rotation_euler = (0, 0, .4); b.hide_render = False
    for k in list(made):
        if k != 'mk_bola': made[k].location = (0, 40, 0); made[k].hide_viewport = True   # the originals out of the way
    sun = bpy.data.lights.new('Sun', 'SUN'); sun.energy = 4.5; sun.angle = math.radians(2); sun.color = (1, .93, .82)
    so = bpy.data.objects.new('Sun', sun); so.rotation_euler = (math.radians(38), math.radians(12), math.radians(140)); sc.collection.objects.link(so)
    bg = w.node_tree.nodes.get('Background')
    if bg: bg.inputs[0].default_value = (.55, .7, .95, 1); bg.inputs[1].default_value = 1.2
    cam = bpy.data.cameras.new('MarketCam'); cam.lens = 24; co = bpy.data.objects.new('MarketCam', cam); sc.collection.objects.link(co)
    co.location = (-13.5, -.4, 1.7); co.rotation_euler = (math.radians(86), 0, math.radians(-88)); sc.camera = co
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 96; sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1280, 720, 100
    try: sc.view_settings.view_transform = 'AgX'
    except Exception: pass
    sc.render.filepath = os.path.join(OUT, 'market_preview.png'); sc.render.image_settings.file_format = 'PNG'
    t0 = time.time(); bpy.ops.render.render(write_still=True); log('preview rendered', int(time.time() - t0), 's')
    co2 = co.copy(); co2.data = cam.copy(); sc.collection.objects.link(co2); co2.location = (14, -11, 6.5); co2.rotation_euler = (math.radians(68), 0, math.radians(52)); sc.camera = co2
    sc.render.filepath = os.path.join(OUT, 'market_preview2.png'); bpy.ops.render.render(write_still=True); log('preview 2 rendered')
    sc.camera = co
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'lagos_market.blend'))
    log('ALL DONE')
except Exception:
    log('FAILED', traceback.format_exc())
