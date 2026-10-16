"""Naija Streets: Ikeja Under Bridge kit, built in Blender and exported for the game.

  ub_pier        - a flyover pier: one concrete column with a hammerhead cap (the deck sits on it 6 m up), posters and grime
  ub_toll        - the police toll gate on the road from Mushin: canopy over four lanes on three islands, toll booths,
                   a blank sign band (the game writes on it), speed bumps, barrier posts
  ub_barrier     - one barrier arm (red and white), pivot at its post end, pointing along +X (the game lifts it)
  ub_police      - the Under Bridge police post: blue and white, barred windows, a zinc veranda, flagpole with the flag
  ub_sandbags    - a short sandbag wall
  ub_shack_zinc  - a rusty zinc shack with tyres holding the roof down
  ub_shack_wood  - a plank kiosk with a counter and a blue tarpaulin roof
  ub_container   - a shipping-container shop, open in front (the game tints each one)
  ub_drum        - a burnt oil drum (fires at night)
Each as one mesh, one material, a colour per face corner, Z up, front toward -Y (= +Z in the game); plus a lighter _lod1.

Run inside Blender (Scripting > New > paste > Run Script): the pieces appear in a collection "NS Under Bridge" and the
.glb files go to Documents/naija_ikeja/models. Or headless: python3 tools/glb_build.py -m blender_underbridge
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


# ================================================================ the flyover pier
def pier(detail):
    B = Builder(detail)
    n = 8 if detail else 4
    r0, r1 = 1.0, .85
    # column: wider at the foot, a ring of octagon faces
    ring = lambda r, z, a0=math.pi / n: [(r * math.cos(a0 + 2 * math.pi * i / n), r * math.sin(a0 + 2 * math.pi * i / n), z) for i in range(n)]
    lo, hi = ring(r0, 0), ring(r1, 4.9)
    for i in range(n):
        j = (i + 1) % n
        f = [lo[i], lo[j], hi[j], hi[i]]
        m = tuple(sum(p[q] for p in f) / 4 for q in range(3))
        B.face(f, CONC, (m[0], m[1], 0), [GRIME(p[2]) for p in f])
    # hammerhead cap: narrow at the column, wide where the deck sits (6 m up)
    cap = [(-1.6, -.85, 4.9), (1.6, -.85, 4.9), (1.6, .85, 4.9), (-1.6, .85, 4.9), (-4.4, -.85, 5.75), (4.4, -.85, 5.75), (4.4, .85, 5.75), (-4.4, .85, 5.75),
           (-4.4, -.85, 6.0), (4.4, -.85, 6.0), (4.4, .85, 6.0), (-4.4, .85, 6.0)]
    Q = [(0, 1, 2, 3), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 9, 8), (5, 6, 10, 9), (6, 7, 11, 10), (7, 4, 8, 11), (8, 9, 10, 11)]
    B.solid([[cap[i] for i in q] for q in Q], CONC2, (0, 0, 5.4))
    if detail:
        for x in (-3.2, -1.1, 1.1, 3.2):   # bearings under the deck girders
            B.box(x - .35, x + .35, -.4, .4, 6.0, 6.08, '#3b3b3d')
        # posters and painted adverts, old and new, round the column
        k = 0
        for side in range(4):
            a = math.pi / 4 + side * math.pi / 2
            for row in range(2):
                if hf(side, row, 3) < .35: continue
                c = POSTERS[int(hf(side, row) * len(POSTERS))]
                z0 = 1.0 + row * 1.0 + hf(row, side, 7) * .3; w, h = .55 + hf(side, row, 9) * .25, .7
                rr = r0 - (r0 - r1) * (z0 / 4.9) + .012
                ca, sa = math.cos(a), math.sin(a); tx, ty = -sa, ca
                pts = [(ca * rr + tx * u, sa * rr + ty * u, z) for u, z in ((-w / 2, z0), (w / 2, z0), (w / 2, z0 + h), (-w / 2, z0 + h))]
                B.face(pts, c, (ca, sa, 0)); k += 1
        # a dark water stain from the deck drain
        B.face([(.6, -.86, 2.0), (.9, -.86, 2.0), (1.1, -.86, 5.9), (.45, -.86, 5.9)], '#5f5b55', (0, -1, 0))
    return B.finish('ub_pier' + ('' if detail else '_lod1'))


# ================================================================ the police toll gate
def toll(detail):
    B = Builder(detail)
    W = 10.5        # half the canopy width (four lanes of 3.4 m, three islands)
    # islands: middle one and two on the sides, kerbed, yellow and black ends
    for x0, x1 in ((-.95, .95), (-8.85, -7.05), (7.05, 8.85)):
        B.box(x0, x1, -7.5, 7.5, 0, .22, '#c9c4b8')
        for y in (-7.5, 7.5):
            for i in range(4 if detail else 1):
                u0 = x0 + (x1 - x0) * i / (4 if detail else 1); u1 = x0 + (x1 - x0) * (i + 1) / (4 if detail else 1)
                B.box(u0, u1, y - .25, y + .25, .22, .45, '#f2c12e' if i % 2 == 0 else '#1b1b1b')
    # canopy columns on the islands, roof slab with a sign band all round
    for x in (0, -7.95, 7.95):
        for y in (-3.2, 3.2):
            B.box(x - .3, x + .3, y - .3, y + .3, .22, 5.3, '#e9e6df', GRIME)
    B.box(-W, W, -4.6, 4.6, 5.3, 5.55, '#f4f2ec')
    B.box(-W - .05, W + .05, -4.65, 4.65, 5.55, 6.55, '#155e3b')            # the sign band (text goes on it in the game)
    B.box(-W - .08, W + .08, -4.68, 4.68, 6.55, 6.7, '#f4f2ec')
    if detail:
        for x in (-6.2, -1.7, 1.7, 6.2):                                       # lights under the canopy
            for y in (-2.5, 0, 2.5):
                B.box(x - .5, x + .5, y - .12, y + .12, 5.25, 5.3, '#fffbe6')
    # toll booths: glass cabins on the islands, one facing each way
    def booth(x, y):
        B.box(x - .7, x + .7, y - 1.1, y + 1.1, .22, 1.2, '#dcd8cf', GRIME)
        B.box(x - .72, x + .72, y - 1.12, y + 1.12, 1.2, 2.25, '#3c5a68')    # glass
        if detail:
            for yy in (y - 1.12, y + 1.12):
                B.box(x - .72, x + .72, yy - .02, yy + .02, 1.2, 2.25, '#e9e6df')
            B.box(x - .74, x + .74, y - .3, y + .3, 1.2, 2.25, '#e9e6df')
        B.box(x - .85, x + .85, y - 1.25, y + 1.25, 2.25, 2.45, '#155e3b')
    booth(0, -4.4); booth(0, 4.4); booth(-7.95, 4.4); booth(7.95, -4.4)
    # barrier posts (the arms are their own model) at the lane exits
    for x, y in ((-.95 - .2, -6.2), (.95 + .2, 6.2), (-7.05 + .2, 6.2), (7.05 - .2, -6.2)):
        B.box(x - .2, x + .2, y - .2, y + .2, .22, 1.25, '#d63b2f')
        B.box(x - .22, x + .22, y - .22, y + .22, 1.25, 1.35, '#1b1b1b')
    # speed bumps before the gate on both sides
    if detail:
        for y in (-12.5, 12.5):
            for i in range(10):
                x0 = -7.0 + i * 1.4
                if -1 < x0 + .7 < 1: continue
                B.box(x0, x0 + .7, y - .3, y + .3, 0, .07, '#f2c12e' if i % 2 == 0 else '#1b1b1b')
    return B.finish('ub_toll' + ('' if detail else '_lod1'))


def barrier(detail):
    B = Builder(detail)
    n = 6 if detail else 2
    L = 3.3
    for i in range(n):
        x0 = .15 + L * i / n; x1 = .15 + L * (i + 1) / n
        B.box(x0, x1, -.06, .06, -.07, .07, '#d63b2f' if i % 2 == 0 else '#f4f2ec')
    B.box(-.15, .25, -.12, .12, -.12, .12, '#1b1b1b')     # the hinge
    return B.finish('ub_barrier' + ('' if detail else '_lod1'))


# ================================================================ the police post
def police(detail):
    B = Builder(detail)
    x0, x1, y0, y1, H = -5.0, 5.0, -3.5, 3.5, 3.3
    B.box(x0 - .3, x1 + .3, y0 - 2.6, y1 + .3, 0, .3, '#9d988e')                      # floor slab and the front step
    B.box(x0, x1, y0, y1, .3, 1.0, '#1f3f86', GRIME)                                     # dark blue lower band
    B.box(x0, x1, y0, y1, 1.0, H, '#8fc3e8', GRIME)                                      # sky blue walls
    B.box(x0 - .25, x1 + .25, y0 - .25, y1 + .25, H, H + .25, '#f4f2ec')                 # roof slab edge
    B.box(x0 - .25, x1 + .25, y0 - .25, y0 - .05, H + .25, H + .95, '#f4f2ec')           # parapet with the sign (front)
    B.box(x0 - .25, x1 + .25, y1 + .05, y1 + .25, H + .25, H + .7, '#f4f2ec')
    for x in (x0 - .25, x1 + .05):
        B.box(x, x + .2, y0 - .25, y1 + .25, H + .25, H + .7, '#f4f2ec')
    B.box(-3.3, 3.3, y0 - .3, y0 - .26, H + .3, H + .9, '#1f3f86')                       # sign board (text in the game)
    # door and barred windows on the front
    B.box(-.6, .6, y0 - .04, y0, .3, 2.4, '#1f3f86')
    for x in (-3.4, 2.0):
        B.box(x, x + 1.4, y0 - .04, y0, 1.2, 2.3, '#253238')
        if detail:
            for i in range(6):
                bx = x + .1 + i * .24
                B.box(bx, bx + .05, y0 - .1, y0 - .04, 1.2, 2.3, '#2a2a2a')
    for y in (-1.5, 1.2):                                                                 # side windows
        for x in (x0 - .04, x1):
            B.box(x, x + .04, y, y + 1.2, 1.2, 2.3, '#253238')
    # zinc veranda on wooden posts
    for x in (-4.6, -1.2, 1.2, 4.6):
        B.box(x - .08, x + .08, y0 - 2.4, y0 - 2.24, .3, 2.7, WOOD)
    B.box(-5.0, 5.0, y0 - 2.6, y0, 2.7, 2.78, ZINC)
    if detail:
        for i in range(12):
            x = -5.0 + i * 10 / 12
            B.box(x, x + .4, y0 - 2.62, y0, 2.78, 2.82, ZINC2)
        B.box(-4.2, -3.6, y0 - 2.0, y0 - 1.4, .3, .75, WOOD2)                            # a bench
        B.box(-4.4, -2.0, y0 - 2.0, y0 - 1.6, .75, .8, WOOD)
    # flagpole with the flag: green, white, green
    B.box(4.2, 4.3, y0 - 3.4, y0 - 3.3, 0, 6.0, '#d9d9d9')
    for i, c in enumerate(('#1f9a52', '#f4f2ec', '#1f9a52')):
        B.box(4.3 + i * .45, 4.3 + (i + 1) * .45, y0 - 3.37, y0 - 3.33, 5.0, 5.9, c)
    # water tank on the roof
    B.cyl(3.0, 1.6, H + .25, H + 1.5, .6, 10 if detail else 6, '#1b1b1b')
    return B.finish('ub_police' + ('' if detail else '_lod1'))


def sandbags(detail):
    B = Builder(detail)
    rows, n = 3, 6
    for r in range(rows):
        for i in range(n - (r % 2)):
            x = -1.5 + (i + (.5 if r % 2 else 0)) * .5
            c = '#b9a57a' if hf(i, r) > .4 else '#a8946a'
            if detail:
                B.prism([(x - .22, -.18), (x + .22, -.18), (x + .25, 0), (x + .22, .18), (x - .22, .18), (x - .25, 0)], r * .28, r * .28 + .27, c)
            else:
                B.box(x - .24, x + .24, -.18, .18, r * .28, r * .28 + .27, c)
    return B.finish('ub_sandbags' + ('' if detail else '_lod1'))


# ================================================================ under the bridge: shacks, kiosks, drums
def shack_zinc(detail):
    B = Builder(detail)
    w, d, h = 1.6, 1.4, 2.25
    n = 10 if detail else 1
    for side, (ax, ay, L) in enumerate(((1, 0, d), (0, 1, w), (-1, 0, d), (0, -1, w))):
        for i in range(n):
            u0 = -L + 2 * L * i / n; u1 = -L + 2 * L * (i + 1) / n
            c = (RUST if hf(i, side) > .82 else ZINC if i % 2 == 0 else ZINC2) if detail else ZINC
            if ay == 0: pts = [(ax * w, u0, 0), (ax * w, u1, 0), (ax * w, u1, h), (ax * w, u0, h)]
            else: pts = [(u0, ay * d, 0), (u1, ay * d, 0), (u1, ay * d, h), (u0, ay * d, h)]
            if side == 3 and detail and -.45 < (u0 + u1) / 2 < .45: c = '#2a2420'      # the door opening
            B.face(pts, c, (ax, ay, 0), [GRIME(p[2]) for p in pts])
    # sloping zinc roof with an overhang, tyres holding it down
    B.solid([[(-w - .2, -d - .35, h + .15), (w + .2, -d - .35, h + .15), (w + .2, d + .25, h - .1), (-w - .2, d + .25, h - .1)],
             [(-w - .2, -d - .35, h + .19), (w + .2, -d - .35, h + .19), (w + .2, d + .25, h - .06), (-w - .2, d + .25, h - .06)]], '#7d7466', (0, 0, h - 1))
    if detail:
        for x, y in ((-.7, -.4), (.8, .3)):
            B.cyl(x, y, h + .1, h + .32, .32, 8, '#1e1e1e')
    return B.finish('ub_shack_zinc' + ('' if detail else '_lod1'))


def shack_wood(detail):
    B = Builder(detail)
    w, d, h = 1.4, 1.2, 2.2
    n = 9 if detail else 1
    for side, (ax, ay, L) in enumerate(((1, 0, d), (0, 1, w), (-1, 0, d), (0, -1, w))):
        for i in range(n):
            u0 = -L + 2 * L * i / n; u1 = -L + 2 * L * (i + 1) / n
            c = (WOOD if i % 2 == 0 else WOOD2) if detail else WOOD
            if ay == 0: pts = [(ax * w, u0, 0), (ax * w, u1, 0), (ax * w, u1, h), (ax * w, u0, h)]
            else: pts = [(u0, ay * d, 0), (u1, ay * d, 0), (u1, ay * d, h), (u0, ay * d, h)]
            B.face(pts, c, (ax, ay, 0), [GRIME(p[2]) for p in pts])
    # the selling window and its counter on the front
    B.box(-1.0, 1.0, -d - .04, -d, 1.0, 1.8, '#1f1a16')
    B.box(-1.15, 1.15, -d - .45, -d, .95, 1.02, '#a37a52')
    # blue tarpaulin roof, sagging a little, tied over the front
    B.solid([[(-w - .3, -d - .7, h + .05), (w + .3, -d - .7, h + .05), (w + .3, d + .3, h + .25), (-w - .3, d + .3, h + .25)],
             [(-w - .3, -d - .7, h + .08), (w + .3, -d - .7, h + .08), (w + .3, d + .3, h + .28), (-w - .3, d + .3, h + .28)]], TARP, (0, 0, h - 1))
    if detail:
        for x in (-w - .25, w + .25):
            B.box(x - .04, x + .04, -d - .68, -d - .6, 0, h + .05, WOOD2)
        for i, c in enumerate(('#f2c12e', '#d63b2f', '#2e6fd6')):                       # goods on the counter
            B.box(-.8 + i * .55, -.45 + i * .55, -d - .4, -d - .1, 1.02, 1.25, c)
    return B.finish('ub_shack_wood' + ('' if detail else '_lod1'))


def container(detail):
    B = Builder(detail)
    L, w, h = 3.0, 1.2, 2.6           # half length, half width, height
    n = 16 if detail else 1
    for side, (ax, ay, S) in enumerate(((1, 0, w), (0, 1, L), (-1, 0, w))):
        for i in range(n):
            u0 = -S + 2 * S * i / n; u1 = -S + 2 * S * (i + 1) / n
            c = '#e8e6e0' if i % 2 == 0 else '#cfccc4'
            if ay == 0: pts = [(ax * L, u0, 0), (ax * L, u1, 0), (ax * L, u1, h), (ax * L, u0, h)]
            else: pts = [(u0, ay * w, 0), (u1, ay * w, 0), (u1, ay * w, h), (u0, ay * w, h)]
            B.face(pts, c, (ax, ay, 0), [GRIME(p[2]) for p in pts])
    B.box(-L, L, -w, w, h, h + .06, '#cfccc4')                                           # roof
    B.box(-L, L, -w + .05, w, 0, .12, '#7a756c')                                         # floor
    # open front: the shop inside, a counter and an awning
    B.face([(-L + .05, w - .05, .12), (L - .05, w - .05, .12), (L - .05, w - .05, h - .05), (-L + .05, w - .05, h - .05)], '#2a2622', (0, -1, 0))
    B.box(-L + .1, L - .1, -w - .05, -w + .4, .12, 1.0, '#8a5d3b')
    B.solid([[(-L, -w, h - .1), (L, -w, h - .1), (L, -w - 1.3, h - .5), (-L, -w - 1.3, h - .5)],
             [(-L, -w, h - .06), (L, -w, h - .06), (L, -w - 1.3, h - .46), (-L, -w - 1.3, h - .46)]], '#e8e6e0', (0, -w + .5, h - 1))
    if detail:
        for i in range(8):                                                               # things on the shelves inside
            x = -L + .4 + i * .7
            B.box(x, x + .45, w - .45, w - .1, 1.1 + (i % 3) * .45, 1.4 + (i % 3) * .45, POSTERS[i % len(POSTERS)])
    return B.finish('ub_container' + ('' if detail else '_lod1'))


def drum(detail):
    B = Builder(detail)
    n = 12 if detail else 6
    B.cyl(0, 0, 0, .88, .3, n, '#6e3b22', top=False)
    B.cyl(0, 0, .82, .86, .26, n, '#141210')            # burnt inside, glowing coals in the game
    if detail:
        for z in (.28, .58):
            B.cyl(0, 0, z, z + .04, .31, n, '#4e2a18', top=False)
    return B.finish('ub_drum' + ('' if detail else '_lod1'))


BUILDS = (pier, toll, barrier, police, sandbags, shack_zinc, shack_wood, container, drum)


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
    coll = bpy.data.collections.get('NS Under Bridge') or bpy.data.collections.new('NS Under Bridge')
    if coll.name not in sc.collection.children:
        sc.collection.children.link(coll)
    for ob in [o for o in bpy.data.objects if o.name.startswith('ub_')]:
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
            ob.location = ((i % 5) * 26 - 52, (i // 5) * 26, 0) if detail else ((i % 5) * 26 - 52, 80 + (i // 5) * 26, 0)
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
            r3.view_location = (0, 12, 3)
            r3.view_distance = 95
            from mathutils import Euler
            r3.view_rotation = Euler((math.radians(60), 0, math.radians(-25)), 'XYZ').to_quaternion()
    print('Under Bridge kit exported to', OUT, made)
    return made


if __name__ == '__main__':
    main()
