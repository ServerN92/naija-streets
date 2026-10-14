"""Naija Streets: the three street houses, built clean in Blender and exported for the game.

Run inside Blender (Scripting tab -> New -> paste -> Run Script), or headless:
    blender --background --python tools/blender_houses.py

It builds, side by side in the scene:
  ns_bungalow  - a single-storey family house: raised floor, front verandah on four columns, hip roof in red aluminium
  ns_house     - a wide modern bungalow: gable porch on two columns, big sliding windows, blue-grey long-span roof
  ns_storey    - a two-storey house: balcony with a balustrade over the entrance, louvre windows, grey hip roof
and exports each as one mesh with one material and vertex colours (no pictures to download), front facing the street
(-Y in Blender = +Z in the game), plus a lighter _lod1 version without bars, louvres and roof ribs for far away.
The game tints each copy (HOUSE_TINT), so walls are kept near white.

Files go to OUT (default: Documents/naija_houses in your home folder); copy them to assets/models/ and run
tools/manifest.py.
"""
import bpy, bmesh, math, os

OUT = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_houses')


def hexc(h, k=1.0):
    h = h.lstrip('#')
    return tuple(min(1.0, int(h[i:i + 2], 16) / 255 * k) for i in (0, 2, 4)) + (1.0,)


WALL = '#f1ece2'; PLINTH = '#77716a'; TRIM = '#fbfaf6'; GLASS = '#33434b'; LOUVRE = '#7d929b'; BARS = '#262626'
DOOR = '#5b3a22'; DOOR2 = '#2d4a63'; SLAB = '#8d877e'; STEP = '#a39d93'; COLUMN = '#f6f2ea'; SOFFIT = '#f7f5f0'
FASCIA = '#fdfdfb'; TILE = '#b9b0a2'; BRASS = '#c9a25a'; GUTTER = '#e2e2e2'


class Builder:
    """Collects boxes and faces into one bmesh with a colour per face corner."""

    def __init__(self, detail=True):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.color.new('Col')
        self.detail = detail

    def face(self, pts, c, shade=None):
        vs = [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(vs)
        for i, l in enumerate(f.loops):
            k = shade[i] if shade else 1.0
            l[self.col] = hexc(c, k)
        return f

    def box(self, x0, x1, y0, y1, z0, z1, c, grime=False, bottom=False):
        x0, x1 = min(x0, x1), max(x0, x1); y0, y1 = min(y0, y1), max(y0, y1); z0, z1 = min(z0, z1), max(z0, z1)
        if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4:
            return
        g = (lambda z: .86 + .14 * min(1, (z - z0) / 1.6)) if grime else (lambda z: 1.0)   # walls a bit darker near the ground
        P = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        quads = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)]
        if bottom:
            quads.append((3, 2, 1, 0))
        for q in quads:
            self.face([P[i] for i in q], c, [g(P[i][2]) for i in q])

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
        bpy.context.scene.collection.objects.link(ob)
        mat = bpy.data.materials.get('NS_House') or make_material()
        me.materials.append(mat)
        return ob


def make_material():
    m = bpy.data.materials.new('NS_House')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get('Principled BSDF')
    ca = nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = 'Col'
    nt.links.new(ca.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = .85
    return m


class Wall:
    """One outside wall: u runs along it, 'off' is the distance out from its face."""

    def __init__(self, B, side, x0, x1, y0, y1):
        self.B, self.side = B, side
        self.x0, self.x1, self.y0, self.y1 = x0, x1, y0, y1

    def box(self, u0, u1, z0, z1, o0, o1, c):
        s = self.side
        if s == 'F':
            self.B.box(u0, u1, self.y0 - o1, self.y0 - o0, z0, z1, c)
        elif s == 'B':
            self.B.box(-u1, -u0, self.y1 + o0, self.y1 + o1, z0, z1, c)
        elif s == 'L':
            self.B.box(self.x0 - o1, self.x0 - o0, -u1, -u0, z0, z1, c)
        else:
            self.B.box(self.x1 + o0, self.x1 + o1, u0, u1, z0, z1, c)

    def window(self, u, zs, w, h, kind='louvre', bars=True):
        B, d = self.B, self.B.detail
        a, b, top = u - w / 2, u + w / 2, zs + h
        self.box(a, b, zs, top, 0, .012, GLASS)                                     # glass
        for (p, q, r, t) in [(a - .07, a, zs, top), (b, b + .07, zs, top), (a - .07, b + .07, top, top + .07), (a - .07, b + .07, zs - .05, zs)]:
            self.box(p, q, r, t, 0, .06, TRIM)                                       # frame
        self.box(a - .12, b + .12, zs - .11, zs - .05, 0, .12, TRIM)                 # sill
        self.box(a - .1, b + .1, top + .07, top + .2, 0, .03, TRIM)                  # head band
        if kind == 'slide':
            self.box(u - .025, u + .025, zs, top, 0, .05, TRIM)
        elif d:                                                                       # glass louvres in two columns
            self.box(u - .02, u + .02, zs, top, 0, .045, TRIM)
            z = zs + .06
            while z < top - .05:
                self.box(a + .02, b - .02, z, z + .03, .012, .03, LOUVRE)
                z += .11
        if bars and d:                                                                # burglar bars
            n = max(3, int(w / .13))
            for i in range(1, n):
                x = a + w * i / n
                self.box(x - .009, x + .009, zs - .02, top + .02, .075, .095, BARS)
            for z in (zs + .02, zs + h / 2, top - .02):
                self.box(a - .02, b + .02, z - .012, z + .012, .07, .1, BARS)

    def door(self, u, z0, w, h, c=DOOR):
        a, b, top = u - w / 2, u + w / 2, z0 + h
        self.box(a, b, z0, top, 0, .03, c)
        for (p, q, r, t) in [(a - .09, a, z0, top), (b, b + .09, z0, top), (a - .09, b + .09, top, top + .09)]:
            self.box(p, q, r, t, 0, .07, TRIM)
        if self.B.detail:
            for (r, t) in [(z0 + .15, z0 + h * .45), (z0 + h * .52, top - .15)]:     # raised panels
                self.box(a + .12, b - .12, r, t, .03, .05, c)
                self.box(a + .16, b - .16, r + .04, t - .04, .05, .055, '#' + ''.join(f'{int(v * 255 * .82):02x}' for v in hexc(c)[:3]))
            self.box(b - .16, b - .1, z0 + 1.0, z0 + 1.08, .05, .1, BRASS)            # handle


def walls(B, x0, x1, y0, y1, z0, z1, c=WALL, plinth=.5):
    B.box(x0, x1, y0, y1, z0, z1, c, grime=True)
    B.box(x0 - .02, x1 + .02, y0 - .02, y1 + .02, z0, z0 + plinth, PLINTH)          # dark plinth band
    return {s: Wall(B, s, x0, x1, y0, y1) for s in 'FBLR'}


def slab(B, x0, x1, y0, y1, h):
    B.box(x0, x1, y0, y1, 0, h, SLAB, bottom=True)
    B.box(x0 - .03, x1 + .03, y0 - .03, y1 + .03, h - .06, h, TILE)


def hip_roof(B, x0, x1, y0, y1, ze, over, pitch, c, ribs=True):
    """Hip roof over the rectangle, ridge along the long side, fascia boards, soffit underneath and ribbed sheets."""
    X0, X1, Y0, Y1 = x0 - over, x1 + over, y0 - over, y1 + over
    cx, cy = (X0 + X1) / 2, (Y0 + Y1) / 2
    hx, hy = (X1 - X0) / 2, (Y1 - Y0) / 2
    t = math.tan(math.radians(pitch))
    along_x = hx >= hy
    r = (hx - hy) if along_x else (hy - hx)
    H = ze + (hy if along_x else hx) * t
    if along_x:
        A, Bp = (cx - r, cy, H), (cx + r, cy, H)
        faces = [[(X0, Y0, ze), (X1, Y0, ze), Bp, A], [(X1, Y1, ze), (X0, Y1, ze), A, Bp], [(X1, Y0, ze), (X1, Y1, ze), Bp], [(X0, Y1, ze), (X0, Y0, ze), A]]
    else:
        A, Bp = (cx, cy - r, H), (cx, cy + r, H)
        faces = [[(X1, Y0, ze), (X1, Y1, ze), Bp, A], [(X0, Y1, ze), (X0, Y0, ze), A, Bp], [(X0, Y0, ze), (X1, Y0, ze), A], [(X1, Y1, ze), (X0, Y1, ze), Bp]]
    for f in faces:
        B.face(f, c)
    B.face([(X0, Y1, ze - .001), (X1, Y1, ze - .001), (X1, Y0, ze - .001), (X0, Y0, ze - .001)], SOFFIT)   # soffit, facing down
    fz = ze - .22                                                                                       # fascia boards
    B.box(X0 - .03, X1 + .03, Y0 - .03, Y0, fz, ze + .03, FASCIA); B.box(X0 - .03, X1 + .03, Y1, Y1 + .03, fz, ze + .03, FASCIA)
    B.box(X0 - .03, X0, Y0, Y1, fz, ze + .03, FASCIA); B.box(X1, X1 + .03, Y0, Y1, fz, ze + .03, FASCIA)
    B.box(X0 - .06, X1 + .06, Y0 - .13, Y0 - .03, fz - .02, fz + .08, GUTTER)                        # front gutter
    dark = '#' + ''.join(f'{int(v * 255 * .72):02x}' for v in hexc(c)[:3])
    if along_x:
        B.box(A[0] - .1, Bp[0] + .1, cy - .12, cy + .12, H - .04, H + .06, dark)                      # ridge cap
    else:
        B.box(cx - .12, cx + .12, A[1] - .1, Bp[1] + .1, H - .04, H + .06, dark)
    if not (ribs and B.detail):
        return
    # ribs of the long-span sheets, every 0.3 m, running from the eave up to the ridge or the hip
    lift = .025

    def rib(p, q):
        (x0_, y0_, z0_), (x1_, y1_, z1_) = p, q
        dx, dy = x1_ - x0_, y1_ - y0_
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L * .02, dx / L * .02
        B.face([(x0_ + nx, y0_ + ny, z0_ + .002), (x0_ - nx, y0_ - ny, z0_ + .002), (x1_ - nx, y1_ - ny, z1_ + .002), (x1_ + nx, y1_ + ny, z1_ + .002)], dark)
        B.face([(x0_ + nx * .3, y0_ + ny * .3, z0_ + lift), (x0_ - nx * .3, y0_ - ny * .3, z0_ + lift), (x1_ - nx * .3, y1_ - ny * .3, z1_ + lift), (x1_ + nx * .3, y1_ + ny * .3, z1_ + lift)], c)

    long_h, short_h = (hx, hy) if along_x else (hy, hx)
    v = -long_h + .15
    while v < long_h - .1:                                     # long sides
        s = min(short_h, long_h - abs(v))
        if along_x:
            rib((cx + v, Y0, ze), (cx + v, Y0 + s, ze + s * t)); rib((cx + v, Y1, ze), (cx + v, Y1 - s, ze + s * t))
        else:
            rib((X0, cy + v, ze), (X0 + s, cy + v, ze + s * t)); rib((X1, cy + v, ze), (X1 - s, cy + v, ze + s * t))
        v += .3
    v = -short_h + .15
    while v < short_h - .1:                                    # hip ends
        s = short_h - abs(v)
        if along_x:
            rib((X0, cy + v, ze), (X0 + s, cy + v, ze + s * t)); rib((X1, cy + v, ze), (X1 - s, cy + v, ze + s * t))
        else:
            rib((cx + v, Y0, ze), (cx + v, Y0 + s, ze + s * t)); rib((cx + v, Y1, ze), (cx + v, Y1 - s, ze + s * t))
        v += .3


def gable_roof(B, x0, x1, y0, y1, ze, over, pitch, c, wallc=WALL, ribs=True):
    """Gable roof, ridge along x; the triangles at the ends are wall."""
    X0, X1, Y0, Y1 = x0 - over, x1 + over, y0 - over, y1 + over
    cy = (Y0 + Y1) / 2; hy = (Y1 - Y0) / 2; t = math.tan(math.radians(pitch)); H = ze + hy * t
    B.face([(X0, Y0, ze), (X1, Y0, ze), (X1, cy, H), (X0, cy, H)], c)
    B.face([(X1, Y1, ze), (X0, Y1, ze), (X0, cy, H), (X1, cy, H)], c)
    B.face([(X0, Y1, ze - .001), (X1, Y1, ze - .001), (X1, Y0, ze - .001), (X0, Y0, ze - .001)], SOFFIT)
    wy0, wy1 = y0, y1; wh = (wy1 - wy0) / 2
    for x, flip in ((x0, True), (x1, False)):                  # gable triangles (wall)
        p = [(x, wy0, ze), (x, wy1, ze), (x, cy, ze + wh * t)]
        B.face(p if not flip else p[::-1], wallc)
    B.box(X0 - .03, X1 + .03, Y0 - .03, Y0, ze - .22, ze + .03, FASCIA); B.box(X0 - .03, X1 + .03, Y1, Y1 + .03, ze - .22, ze + .03, FASCIA)
    for x in (X0, X1):                                         # barge boards
        L = math.hypot(hy, hy * t)
        for sgn in (-1, 1):
            p0 = (x, cy + sgn * hy, ze); p1 = (x, cy, H)
            B.face([(x - .03, p0[1], p0[2] - .2), (x - .03, p1[1], p1[2] - .2), (x - .03, p1[1], p1[2] + .04), (x - .03, p0[1], p0[2] + .04)][::(1 if (sgn < 0) == (x == X0) else -1)], FASCIA)
    B.box(X0 - .06, X1 + .06, Y0 - .13, Y0 - .03, ze - .24, ze - .14, GUTTER)
    dark = '#' + ''.join(f'{int(v * 255 * .72):02x}' for v in hexc(c)[:3])
    B.box(X0, X1, cy - .14, cy + .14, H - .04, H + .07, dark)
    if ribs and B.detail:
        x = X0 + .15
        while x < X1 - .1:
            for y_e, sgn in ((Y0, 1), (Y1, -1)):
                B.face([(x - .02, y_e, ze + .002), (x + .02, y_e, ze + .002), (x + .02, cy, H + .002), (x - .02, cy, H + .002)][::sgn], dark)
                B.face([(x - .006, y_e, ze + .025), (x + .006, y_e, ze + .025), (x + .006, cy, H + .025), (x - .006, cy, H + .025)][::sgn], c)
            x += .3


def column(B, x, y, z0, z1, s=.32):
    B.box(x - s / 2 - .04, x + s / 2 + .04, y - s / 2 - .04, y + s / 2 + .04, z0, z0 + .3, TRIM)
    B.box(x - s / 2, x + s / 2, y - s / 2, y + s / 2, z0, z1, COLUMN)
    B.box(x - s / 2 - .05, x + s / 2 + .05, y - s / 2 - .05, y + s / 2 + .05, z1 - .2, z1, TRIM)


def steps(B, x0, x1, y_front, floor, n=3, depth=.32):
    for i in range(n):
        h = floor * (n - i) / n
        B.box(x0 - .1 * (n - i), x1 + .1 * (n - i), y_front - depth * (i + 1), y_front - depth * i, 0, h, STEP)


# ---------------------------------------------------------------- the three houses
def bungalow(detail):
    B = Builder(detail)
    W, D, F, E = 12.5, 11.5, .55, 3.55             # width, depth, floor height, eave height
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    vy = y0 + 2.3                                   # verandah depth
    slab(B, x0 - .2, x1 + .2, y0 - .1, y1 + .2, F)
    w = walls(B, x0, x1, vy, y1, F, E)
    f = w['F']
    f.door(0, F, 1.1, 2.25)
    for u in (-4.1, -2.0, 2.0, 4.1):
        f.window(u, F + 1.0, 1.35, 1.35)
    for u in (-3.6, -.9, 1.8):
        w['B'].window(u, F + 1.0, 1.2, 1.3)
    w['B'].door(4.2, F, .9, 2.1, DOOR2)
    for s in 'LR':
        for u in (-2.2, 1.3):
            w[s].window(u, F + 1.0, 1.35, 1.35)
    for x in (x0 + .35, -1.7, 1.7, x1 - .35):     # verandah: four columns, a beam and a low wall
        column(B, x, y0 + .3, F, E)
    B.box(x0 + .1, x1 - .1, y0 + .1, y0 + .5, E - .45, E - .05, TRIM)
    for a, b in ((x0 + .5, -1.9), (1.9, x1 - .5)):
        B.box(a, b, y0 + .18, y0 + .42, F, F + .85, WALL, grime=True)
        B.box(a - .03, b + .03, y0 + .15, y0 + .45, F + .85, F + .93, TRIM)
    steps(B, -1.4, 1.4, y0 - .1, F)
    hip_roof(B, x0, x1, y0, y1, E, .55, 24, '#8e3125')
    return B.finish('ns_bungalow' + ('' if detail else '_lod1'))


def wide_house(detail):
    B = Builder(detail)
    W, D, F, E = 16.0, 12.5, .5, 3.5
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    slab(B, x0 - .2, x1 + .2, y0 - 2.1, y1 + .2, F)
    w = walls(B, x0, x1, y0, y1, F, E)
    f = w['F']
    for u in (-6.2, -4.0, 4.0, 6.2):
        f.window(u, F + .95, 1.8, 1.45, kind='slide')
    f.door(0, F, 1.4, 2.35, DOOR2)
    f.window(-1.75, F + 1.3, .6, 1.1, kind='slide'); f.window(1.75, F + 1.3, .6, 1.1, kind='slide')
    for u in (-5.5, -1.8, 1.8, 5.5):
        w['B'].window(u, F + 1.0, 1.5, 1.3, kind='slide')
    for s in 'LR':
        for u in (-3.6, 0, 3.6):
            w[s].window(u, F + 1.0, 1.5, 1.35, kind='slide')
    # porch: gable roof forward on two columns
    px0, px1, py0 = -2.6, 2.6, y0 - 2.0
    for x in (px0 + .3, px1 - .3):
        column(B, x, py0 + .3, F, E)
    B.box(px0, px1, py0 + .05, py0 + .5, E - .45, E - .05, TRIM)
    t = math.tan(math.radians(30)); ov = .35; hh = (px1 - px0) / 2 + ov
    pc = '#365766'
    B.face([(px0 - ov, py0 - .3, E), (0, py0 - .3, E + hh * t), (0, y0 + .2, E + hh * t), (px0 - ov, y0 + .2, E)], pc)
    B.face([(0, py0 - .3, E + hh * t), (px1 + ov, py0 - .3, E), (px1 + ov, y0 + .2, E), (0, y0 + .2, E + hh * t)], pc)
    B.face([(px0, py0 - .02, E), (px1, py0 - .02, E), (0, py0 - .02, E + (hh - ov) * t)], WALL)
    B.face([(px0 - ov, y0 + .2, E - .001), (px1 + ov, y0 + .2, E - .001), (px1 + ov, py0 - .3, E - .001), (px0 - ov, py0 - .3, E - .001)], SOFFIT)
    for sgn in (-1, 1):
        B.face([(0, py0 - .33, E + hh * t + .04), (sgn * (hh), py0 - .33, E + .04), (sgn * (hh), py0 - .33, E - .18), (0, py0 - .33, E + hh * t - .18)][::(-sgn)], FASCIA)
    steps(B, -1.6, 1.6, py0 - .1, F, 2)
    gable_roof(B, x0, x1, y0, y1, E, .6, 20, '#3e5f6f')
    return B.finish('ns_house' + ('' if detail else '_lod1'))


def storey(detail):
    B = Builder(detail)
    W, D, F = 12.5, 13.5, .5
    G1, S1, E = 3.65, 3.95, 7.0                    # ground floor top, first floor slab top, eave
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    slab(B, x0 - .2, x1 + .2, y0 - .3, y1 + .2, F)
    g = walls(B, x0, x1, y0, y1, F, G1)
    B.box(x0 - .06, x1 + .06, y0 - .06, y1 + .06, G1, S1, TRIM)                     # floor band
    u = walls(B, x0, x1, y0, y1, S1, E, plinth=0)
    g['F'].door(0, F, 1.2, 2.3)
    for x in (-4.2, -2.1, 2.1, 4.2):
        g['F'].window(x, F + 1.0, 1.3, 1.35)
    for x in (-4.0, -1.3, 1.3, 4.0):
        u['F'].window(x, S1 + .95, 1.3, 1.4)
    u['F'].door(0, S1, 1.6, 2.3, DOOR2)
    for s in 'LR':
        for x in (-3.8, -.6, 2.8):
            g[s].window(x, F + 1.0, 1.3, 1.35)
            u[s].window(x, S1 + .95, 1.3, 1.4)
    for x in (-3.5, 0, 3.5):
        g['B'].window(x, F + 1.0, 1.2, 1.3)
        u['B'].window(x, S1 + .95, 1.2, 1.4)
    # balcony over the entrance: cantilevered slab, two columns below, balustrade
    bx0, bx1, by0 = -3.2, 3.2, y0 - 1.6
    B.box(bx0, bx1, by0, y0, G1, S1, TRIM, bottom=True)
    for x in (bx0 + .3, bx1 - .3):
        column(B, x, by0 + .3, F, G1, .3)
    rail_h = S1 + 1.0
    B.box(bx0, bx1, by0, by0 + .14, rail_h - .08, rail_h, TRIM)
    B.box(bx0, bx0 + .14, by0, y0, rail_h - .08, rail_h, TRIM); B.box(bx1 - .14, bx1, by0, y0, rail_h - .08, rail_h, TRIM)
    B.box(bx0, bx1, by0, by0 + .14, S1, S1 + .12, TRIM)
    if detail:
        x = bx0 + .2
        while x < bx1 - .1:                         # balusters
            B.box(x - .045, x + .045, by0 + .025, by0 + .115, S1 + .12, rail_h - .08, COLUMN)
            x += .22
        for y in (by0 + .45, by0 + .9, by0 + 1.35):
            for xx in (bx0, bx1 - .14):
                B.box(xx + .025, xx + .115, y - .045, y + .045, S1 + .12, rail_h - .08, COLUMN)
    else:
        B.box(bx0, bx1, by0 + .03, by0 + .1, S1, rail_h, COLUMN)
    steps(B, -1.3, 1.3, y0 - .3, F, 2)
    hip_roof(B, x0, x1, y0, y1, E, .6, 22, '#4b555c')
    return B.finish('ns_storey' + ('' if detail else '_lod1'))


def export(ob, path):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
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
    for ob in [o for o in bpy.data.objects if o.name.startswith('ns_')]:
        bpy.data.objects.remove(ob, do_unlink=True)
    made = []
    for i, fn in enumerate((bungalow, wide_house, storey)):
        for detail in (True, False):
            ob = fn(detail)
            export(ob, os.path.join(OUT, ob.name + '.glb'))
            ob.location = ((i - 1) * 20, 0 if detail else 30, 0)
            if not detail:
                ob.hide_set(True)
            made.append(ob.name)
    print('Naija houses exported to', OUT, made)
    return made


if __name__ == '__main__':
    main()
