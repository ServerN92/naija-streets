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
    if len(h) == 3:
        h = ''.join(ch * 2 for ch in h)
    return tuple(min(1.0, int(h[i:i + 2], 16) / 255 * k) for i in (0, 2, 4)) + (1.0,)


WALL = '#f1ece2'; PLINTH = '#77716a'; TRIM = '#fbfaf6'; GLASS = '#33434b'; LOUVRE = '#7d929b'; BARS = '#262626'
DOOR = '#5b3a22'; DOOR2 = '#2d4a63'; SLAB = '#8d877e'; STEP = '#a39d93'; COLUMN = '#f6f2ea'; SOFFIT = '#f7f5f0'
FASCIA = '#fdfdfb'; TILE = '#b9b0a2'; BRASS = '#c9a25a'; GUTTER = '#e2e2e2'


class Builder:
    """Collects boxes and faces into one bmesh with a colour per face corner."""

    def __init__(self, detail=True, simple=False):
        self.simple = simple                      # big buildings: windows drawn with fewer pieces
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.color.new('Col')
        self.detail = detail
        self.marks = {}                           # named spots for the game (doors, desks, beds...), Blender coordinates

    def mark(self, name, x, y, z=0.0, **extra):
        """Remember a spot the game needs (where a door is, where the receptionist stands). Saved in the .glb."""
        self.marks[name] = dict(x=x, y=y, z=z, **extra)

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
        if self.marks:
            import json
            try:
                ob['marks'] = json.dumps(self.marks)    # exported as glTF extras (Blender: Include > Custom Properties)
            except TypeError:
                ob.marks = self.marks
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
        if B.simple or not d:                                                         # light version: frame, pane, sill, a few bars
            self.box(a - .07, b + .07, zs - .05, top + .07, 0, .05, TRIM)
            self.box(a, b, zs, top, .05, .062, LOUVRE if kind == 'louvre' and d else GLASS)
            if d:
                self.box(a - .12, b + .12, zs - .11, zs - .05, 0, .12, TRIM)
                if bars:
                    n = max(2, int(w / .26))
                    for i in range(1, n):
                        x = a + w * i / n
                        self.box(x - .012, x + .012, zs, top, .075, .095, BARS)
                    self.box(a, b, zs + h / 2 - .015, zs + h / 2 + .015, .07, .1, BARS)
            return
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


def gable_roof(B, x0, x1, y0, y1, ze, over, pitch, c, wallc=WALL, ribs=True, fascia=FASCIA, gutter=True):
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
    B.box(X0 - .03, X1 + .03, Y0 - .03, Y0, ze - .22, ze + .03, fascia); B.box(X0 - .03, X1 + .03, Y1, Y1 + .03, ze - .22, ze + .03, fascia)
    for x in (X0, X1):                                         # barge boards
        L = math.hypot(hy, hy * t)
        for sgn in (-1, 1):
            p0 = (x, cy + sgn * hy, ze); p1 = (x, cy, H)
            B.face([(x - .03, p0[1], p0[2] - .2), (x - .03, p1[1], p1[2] - .2), (x - .03, p1[1], p1[2] + .04), (x - .03, p0[1], p0[2] + .04)][::(1 if (sgn < 0) == (x == X0) else -1)], fascia)
    if gutter:
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



# ---------------------------------------------------------------- more pieces for the duplexes and the small houses
def shade(c, k):
    return '#' + ''.join(f'{int(min(255, v * 255 * k)):02x}' for v in hexc(c)[:3])


def flat_roof(B, x0, x1, y0, y1, z, parapet=.9, wallc=WALL, cap=TRIM, roofc='#8f8a84'):
    """A flat concrete roof hidden behind a parapet with a white coping."""
    B.box(x0, x1, y0, y1, z - .25, z, roofc)
    t = .2
    for (a, b, c_, d) in [(x0, x1, y0, y0 + t), (x0, x1, y1 - t, y1), (x0, x0 + t, y0, y1), (x1 - t, x1, y0, y1)]:
        B.box(a, b, c_, d, z, z + parapet, wallc)
    B.box(x0 - .05, x1 + .05, y0 - .05, y0 + t + .02, z + parapet, z + parapet + .08, cap)
    B.box(x0 - .05, x1 + .05, y1 - t - .02, y1 + .05, z + parapet, z + parapet + .08, cap)
    B.box(x0 - .05, x0 + t + .02, y0, y1, z + parapet, z + parapet + .08, cap)
    B.box(x1 - t - .02, x1 + .05, y0, y1, z + parapet, z + parapet + .08, cap)


def glass_wall(w, u, z0, width, h, frame='#2b2e31', panes=3, glass='#2c3b44'):
    """Floor-to-ceiling glazing with slim dark frames."""
    a, b = u - width / 2, u + width / 2
    if not w.B.detail or w.B.simple:
        w.box(a - .06, b + .06, z0 - .03, z0 + h + .06, 0, .05, frame)
        w.box(a, b, z0, z0 + h, .05, .062, glass)
        if w.B.detail:
            for i in range(1, panes):
                x = a + width * i / panes
                w.box(x - .025, x + .025, z0, z0 + h, .062, .08, frame)
        return
    w.box(a, b, z0, z0 + h, 0, .015, glass)
    for (p, q, r, t) in [(a - .06, a, z0, z0 + h), (b, b + .06, z0, z0 + h), (a - .06, b + .06, z0 + h, z0 + h + .06), (a - .06, b + .06, z0 - .03, z0)]:
        w.box(p, q, r, t, 0, .07, frame)
    for i in range(1, panes):
        x = a + width * i / panes
        w.box(x - .025, x + .025, z0, z0 + h, 0, .06, frame)
    if w.B.detail and h > 1.6:
        w.box(a, b, z0 + h * .62, z0 + h * .62 + .04, 0, .05, frame)


def glass_rail(B, x0, x1, y0, y1, z, h=1.05, sides='F'):
    """Glass balustrade with a steel top rail along the chosen edges of a balcony."""
    g, m = '#5d7782', '#c9cdd0'
    edges = {'F': (x0, x1, y0, y0 + .04), 'B': (x0, x1, y1 - .04, y1), 'L': (x0, x0 + .04, y0, y1), 'R': (x1 - .04, x1, y0, y1)}
    for s_ in sides:
        a, b, c_, d = edges[s_]
        B.box(a, b, c_, d, z, z + h - .05, g)
        B.box(a - .01, b + .01, c_ - .01, d + .01, z + h - .05, z + h, m)


def mono_roof(B, x0, x1, y0, y1, z_front, z_back, c, over=.5):
    """A single sloping roof (front low, back high or the other way), with fascia and soffit."""
    X0, X1, Y0, Y1 = x0 - over, x1 + over, y0 - over, y1 + over
    k = (z_back - z_front) / (y1 - y0)
    zf, zb = z_front - over * k, z_back + over * k
    th = .25
    B.face([(X0, Y0, zf + th), (X1, Y0, zf + th), (X1, Y1, zb + th), (X0, Y1, zb + th)], c)
    B.face([(X0, Y1, zb), (X1, Y1, zb), (X1, Y0, zf), (X0, Y0, zf)], SOFFIT)
    B.face([(X0, Y0, zf), (X1, Y0, zf), (X1, Y0, zf + th), (X0, Y0, zf + th)], FASCIA)
    B.face([(X1, Y1, zb), (X0, Y1, zb), (X0, Y1, zb + th), (X1, Y1, zb + th)], FASCIA)
    B.face([(X0, Y1, zb), (X0, Y0, zf), (X0, Y0, zf + th), (X0, Y1, zb + th)], FASCIA)
    B.face([(X1, Y0, zf), (X1, Y1, zb), (X1, Y1, zb + th), (X1, Y0, zf + th)], FASCIA)
    lo = min(z_front, z_back)
    for x, flip in ((x0, True), (x1, False)):                  # end walls up to the slope
        p = [(x, y0, lo), (x, y1, lo)]
        if z_back - lo > 1e-3:
            p.append((x, y1, z_back))
        if z_front - lo > 1e-3:
            p.append((x, y0, z_front))
        if len(p) >= 3:
            B.face(p if not flip else p[::-1], WALL)


def cladding(w, u0, u1, z0, z1, c='#8b5a35', step=.12):
    """Vertical timber battens on a wall."""
    w.box(u0, u1, z0, z1, 0, .02, shade(c, .7))
    if not w.B.detail:
        w.box(u0, u1, z0, z1, .02, .04, c)
        return
    u = u0 + .02
    i = 0
    while u < u1 - .04:
        w.box(u, u + step * .7, z0, z1, .02, .05, shade(c, .9 + .2 * ((i * 7) % 3) / 2))
        u += step
        i += 1


def stone(w, u0, u1, z0, z1, c='#a39684'):
    """Stone cladding: courses of slabs in mixed shades."""
    w.box(u0, u1, z0, z1, 0, .03, shade(c, .75))
    if not w.B.detail:
        return
    z, row = z0, 0
    while z < z1 - .05:
        h = min(.28, z1 - z)
        u = u0 - (.25 if row % 2 else 0)
        n = 0
        while u < u1:
            a, b = max(u0, u), min(u1, u + .55)
            if b - a > .05:
                w.box(a + .015, b - .015, z + .015, z + h - .015, .03, .05, shade(c, .85 + .3 * ((n * 5 + row * 3) % 4) / 3))
            u += .55
            n += 1
        z += h
        row += 1


def garage(w, u, z0, width=3.0, h=2.4, c='#d9d6d0'):
    a, b = u - width / 2, u + width / 2
    w.box(a, b, z0, z0 + h, 0, .03, c)
    for (p, q, r, t) in [(a - .1, a, z0, z0 + h), (b, b + .1, z0, z0 + h), (a - .1, b + .1, z0 + h, z0 + h + .1)]:
        w.box(p, q, r, t, 0, .08, TRIM)
    if w.B.detail:
        z = z0 + .25
        while z < z0 + h - .1:
            w.box(a + .05, b - .05, z, z + .03, .03, .045, shade(c, .8))
            z += .3


def arch_window(w, u, zs, width, h, glass=GLASS, frame=TRIM):
    """A tall window with a round top (front walls only)."""
    w.window(u, zs, width, h - width / 2, kind='slide', bars=False)
    r = width / 2
    zc = zs + h - width / 2 + .07
    n = 10
    yf = w.y0 - .013
    pts = [(u + r * math.cos(math.pi * i / n), yf, zc + r * math.sin(math.pi * i / n)) for i in range(n + 1)]
    w.B.face(pts, glass)
    pts2 = [(u + (r + .1) * math.cos(math.pi * i / n), w.y0 - .06, zc + (r + .1) * math.sin(math.pi * i / n)) for i in range(n + 1)]
    for i in range(n):
        a1, a2 = pts[i], pts[i + 1]
        b1, b2 = pts2[i], pts2[i + 1]
        w.B.face([(a2[0], w.y0 - .06, a2[2]), (a1[0], w.y0 - .06, a1[2]), b1, b2], frame)


def shutters(w, u, zs, width, h, c='#3f6b4a'):
    """Louvred wooden shutters folded open beside a window."""
    for sgn in (-1, 1):
        a = u + sgn * (width / 2 + .12) - (width / 2 if sgn > 0 else 0) * 0
        x0 = u + sgn * (width / 2 + .1)
        x1 = x0 + sgn * width / 2
        w.box(min(x0, x1), max(x0, x1), zs, zs + h, 0, .04, c)
        if w.B.detail:
            z = zs + .08
            while z < zs + h - .06:
                w.box(min(x0, x1) + .04, max(x0, x1) - .04, z, z + .025, .04, .055, shade(c, .8))
                z += .09


def corrugated_walls(B, x0, x1, y0, y1, z0, z1, cols, step=.16):
    """Walls of corrugated zinc sheets: a sheet colour per strip of ~0.9 m, ribs every 16 cm."""
    B.box(x0, x1, y0, y1, z0, z1, cols[0])
    sides = [('F', x0, x1), ('B', x0, x1), ('L', y0, y1), ('R', y0, y1)]
    for s_, a, b in sides:
        u, k = a, 0
        while u < b - .02:
            sheet = cols[(k * 7 + len(s_) + int(a * 3)) % len(cols)]
            u2 = min(b, u + .9)
            r = u
            while r < u2 - .03 and B.detail:
                if s_ == 'F':
                    B.box(r, r + .05, y0 - .03, y0, z0 + .02, z1 - .02, sheet)
                elif s_ == 'B':
                    B.box(r, r + .05, y1, y1 + .03, z0 + .02, z1 - .02, sheet)
                elif s_ == 'L':
                    B.box(x0 - .03, x0, r, r + .05, z0 + .02, z1 - .02, sheet)
                else:
                    B.box(x1, x1 + .03, r, r + .05, z0 + .02, z1 - .02, sheet)
                r += step
            if not B.detail:
                if s_ == 'F':
                    B.box(u, u2, y0 - .02, y0, z0, z1, sheet)
                elif s_ == 'B':
                    B.box(u, u2, y1, y1 + .02, z0, z1, sheet)
                elif s_ == 'L':
                    B.box(x0 - .02, x0, u, u2, z0, z1, sheet)
                else:
                    B.box(x1, x1 + .02, u, u2, z0, z1, sheet)
            u, k = u2, k + 1


def plank_walls(B, x0, x1, y0, y1, z0, z1, cols, board=.2):
    """Walls of horizontal timber boards, each board slightly overlapping the one below."""
    B.box(x0, x1, y0, y1, z0, z1, shade(cols[0], .7))
    z, k = z0, 0
    while z < z1 - .02:
        c = cols[(k * 3) % len(cols)]
        z2 = min(z1, z + board)
        o = .03 if B.detail else .02
        B.box(x0 - o, x1 + o, y0 - o, y0, z, z2, c); B.box(x0 - o, x1 + o, y1, y1 + o, z, z2, c)
        B.box(x0 - o, x0, y0, y1, z, z2, c); B.box(x1, x1 + o, y0, y1, z, z2, c)
        z, k = z2, k + 1
    for (x, y) in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):   # corner posts
        B.box(x - .07, x + .07, y - .07, y + .07, z0, z1, shade(cols[0], .6))


def wood_window(w, u, zs, width, h, c='#6b4a2e'):
    """A window opening with a dark gap, a timber frame and shutters."""
    a, b = u - width / 2, u + width / 2
    w.box(a, b, zs, zs + h, 0, .04, '#1d1b19')
    for (p, q, r, t) in [(a - .07, a, zs, zs + h), (b, b + .07, zs, zs + h), (a - .07, b + .07, zs + h, zs + h + .07), (a - .1, b + .1, zs - .07, zs)]:
        w.box(p, q, r, t, 0, .08, c)
    if w.B.detail:
        w.box(a + .02, u - .01, zs + .02, zs + h - .02, .05, .08, shade(c, 1.15))
        for z in (zs + .2, zs + h - .2):
            w.box(a, b, z - .015, z + .015, .085, .1, '#2a2a2a')


# ---------------------------------------------------------------- five luxury duplexes
WHITE = '#efede8'; CHAR = '#34383b'; WOOD = '#8b5a35'; BRONZE = '#6e5233'


def dup_modern(detail):
    """Lekki modern: flat roofs, the upper floor cantilevered over the entrance, timber and charcoal accents."""
    B = Builder(detail)
    F = .45
    slab(B, -7.4, 7.4, -7.6, 7.2, F)
    g = walls(B, -7, 7, -6, 7, F, 3.7, WHITE, .35)
    u = walls(B, -7.4, 4.4, -7.2, 6.5, 3.95, 7.0, WHITE, 0)
    B.box(-7.5, 4.5, -7.3, 6.6, 3.7, 3.95, CHAR)                       # floor slab edge
    B.box(-7.5, 4.5, -7.3, -6.0, 3.45, 3.7, SOFFIT)                     # cantilever soffit
    glass_wall(g['F'], -3.4, F + .1, 4.2, 2.8, panes=3)
    g['F'].door(.6, F, 1.3, 2.9, '#6d4528')
    garage(g['F'], 4.3, F, 3.6, 2.5)
    cladding(g['F'], -.4, -.05 + 0, F, 3.7, WOOD)
    glass_wall(u['F'], -4.6, 4.3, 3.8, 2.3, panes=2)
    cladding(u['F'], -2.5, .6, 3.95, 7.0, WOOD)
    glass_wall(u['F'], 2.4, 4.3, 2.6, 2.3, panes=2)
    for s_ in 'LR':
        for x in (-3.5, 0.0, 3.5):
            g[s_].window(x, F + .9, 1.6, 1.5, kind='slide', bars=False)
    for x in (-4.5, -1.5, 1.5):
        u['L'].window(x, 4.8, 1.5, 1.5, kind='slide', bars=False)
        u['B'].window(x + 1, 4.8, 1.5, 1.5, kind='slide', bars=False)
    for x in (-4, 0, 4):
        g['B'].window(x, F + .9, 1.6, 1.5, kind='slide', bars=False)
    for (a, b, c_, d) in [(-7.6, 4.6, 6.95, 7.3), (-7.6, -7.25, 3.7, 7.3), (4.25, 4.6, 3.7, 7.3)]:   # charcoal frame around the upper front
        B.box(a, b, -7.45, -7.2, c_, d, CHAR)
    B.box(-7.6, -7.25, -7.45, 6.6, 6.95, 7.3, CHAR)
    flat_roof(B, -7.4, 4.4, -7.2, 6.5, 7.0, .8, WHITE)
    B.box(4.4, 7, -6, 7, 3.45, 3.7, '#9a948c')                        # terrace over the garage
    glass_rail(B, 4.4, 7.0, -6.0, 7.0, 3.7, sides='FR')
    B.box(-.2, 1.6, -7.6, -6.0, 3.0, 3.2, CHAR)                        # door canopy
    steps(B, -.6, 1.8, -7.6, F, 2)
    return B.finish('ns_dup1' + ('' if detail else '_lod1'))


def dup_colonial(detail):
    """Classic Nigerian mansion: double-height portico on four columns, pediment, balcony behind the columns, hip roof."""
    B = Builder(detail)
    F = .6
    slab(B, -7.6, 7.6, -8.6, 7.2, F)
    g = walls(B, -7.2, 7.2, -5.8, 6.8, F, 3.9, '#efe6d2', .45)
    B.box(-7.3, 7.3, -5.9, 6.9, 3.9, 4.15, TRIM)
    u = walls(B, -7.2, 7.2, -5.8, 6.8, 4.15, 7.3, '#efe6d2', 0)
    g['F'].door(0, F, 1.8, 2.9, '#5b3a22')
    for x in (-5.4, -3.2, 3.2, 5.4):
        arch_window(g['F'], x, F + .7, 1.2, 2.4)
        arch_window(u['F'], x, 4.5, 1.1, 2.2)
    u['F'].door(0, 4.15, 1.6, 2.6, '#5b3a22')
    for s_ in 'LR':
        for x in (-4, -1, 2, 5):
            g[s_].window(x, F + 1.0, 1.2, 1.6, bars=False)
            u[s_].window(x, 4.6, 1.2, 1.6, bars=False)
    for x in (-4, 0, 4):
        g['B'].window(x, F + 1, 1.2, 1.5, bars=False)
        u['B'].window(x, 4.6, 1.2, 1.5, bars=False)
    # portico
    px0, px1, py0 = -3.4, 3.4, -8.3
    B.box(px0, px1, py0, -5.8, 4.0, 4.2, TRIM, bottom=True)            # balcony slab
    for x in (px0 + .4, -1.15, 1.15, px1 - .4):
        column(B, x, py0 + .4, F, 7.3, .45)
    B.box(px0 - .1, px1 + .1, py0, -5.8, 7.3, 7.7, TRIM)               # entablature
    t = math.tan(math.radians(22)); hh = (px1 - px0) / 2 + .2
    B.face([(px0 - .2, py0 - .05, 7.7), (px1 + .2, py0 - .05, 7.7), (0, py0 - .05, 7.7 + hh * t)], '#f3ecdc')   # pediment
    B.face([(px0 - .3, py0 - .15, 7.7), (0, py0 - .15, 7.75 + hh * t), (0, -5.8, 7.75 + hh * t), (px0 - .3, -5.8, 7.7)], '#5a3a2a')
    B.face([(0, py0 - .15, 7.75 + hh * t), (px1 + .3, py0 - .15, 7.7), (px1 + .3, -5.8, 7.7), (0, -5.8, 7.75 + hh * t)], '#5a3a2a')
    rail = 4.2 + 1.0
    B.box(px0 + .2, px1 - .2, py0 + .1, py0 + .25, rail - .08, rail, TRIM)
    if detail:
        x = px0 + .35
        while x < px1 - .3:
            B.box(x - .05, x + .05, py0 + .13, py0 + .22, 4.2, rail - .08, COLUMN)
            x += .24
    steps(B, -2.6, 2.6, -8.6, F, 3)
    hip_roof(B, -7.2, 7.2, -5.8, 6.8, 7.3, .7, 26, '#4e3427')
    return B.finish('ns_dup2' + ('' if detail else '_lod1'))


def dup_mono(detail):
    """Contemporary: two volumes with single-slope roofs, stone base, a corner of glass."""
    B = Builder(detail)
    F = .45
    slab(B, -7.6, 7.6, -7.4, 7.2, F)
    a = walls(B, -7.2, .6, -6.4, 6.8, F, 6.9, '#e7e4de', 0)               # tall wing
    b = walls(B, .6, 7.2, -5.4, 6.8, F, 3.8, '#d9d4cc', 0)                # low wing
    stone(a['F'], -7.2, .6, F, 1.4)
    stone(b['F'], .6, 7.2, F, 3.8, '#9d8f7d')
    glass_wall(a['F'], -4.6, 1.5, 3.6, 2.0, panes=3)
    glass_wall(a['F'], -3.4, 4.1, 5.6, 2.4, panes=4)
    a['F'].door(-.6, F, 1.2, 2.6, '#6d4528')
    glass_wall(b['F'], 3.9, F + .2, 4.4, 2.6, panes=4)
    for s_, w_ in (('L', a), ('R', b)):
        for x in (-4, 0, 4):
            w_[s_].window(x, F + 1, 1.6, 1.4, kind='slide', bars=False)
    for x in (-4, 0, 4):
        a['L'].window(x, 4.4, 1.6, 1.4, kind='slide', bars=False)
    for x in (-5, -2):
        a['B'].window(x, F + 1, 1.6, 1.4, kind='slide', bars=False)
        a['B'].window(x, 4.4, 1.6, 1.4, kind='slide', bars=False)
    mono_roof(B, -7.2, .6, -6.4, 6.8, 7.4, 6.4, '#4f5458', .6)
    mono_roof(B, .6, 7.2, -5.4, 6.8, 3.9, 4.6, '#4f5458', .6)
    B.box(.4, 7.4, -7.0, -5.4, 3.6, 3.8, CHAR)                            # canopy over the patio
    for x in (1.0, 6.8):
        B.box(x - .08, x + .08, -6.9, -6.75, F, 3.6, CHAR)
    steps(B, -1.5, .3, -7.4, F, 2)
    return B.finish('ns_dup3' + ('' if detail else '_lod1'))


def dup_med(detail):
    """Mediterranean: terracotta hip roof, an arched loggia downstairs, a balustraded balcony, green shutters."""
    B = Builder(detail)
    F = .5
    SAND = '#ead7b2'
    slab(B, -7.4, 7.4, -7.8, 7.2, F)
    g = walls(B, -7, 7, -5.6, 6.8, F, 3.7, SAND, .4)
    B.box(-7.1, 7.1, -5.7, 6.9, 3.7, 3.95, '#f2e6cc')
    u = walls(B, -7, 7, -5.6, 6.8, 3.95, 6.9, SAND, 0)
    g['F'].door(0, F, 1.6, 2.6, '#5b3a22')
    for x in (-4.6, 4.6):
        g['F'].window(x, F + 1, 1.4, 1.5, bars=False)
    for x in (-4.6, -1.6, 1.6, 4.6):
        u['F'].window(x, 4.5, 1.2, 1.6, kind='slide', bars=False)
        shutters(u['F'], x, 4.5, 1.2, 1.6)
    for s_ in 'LR':
        for x in (-3.5, 0, 3.5):
            g[s_].window(x, F + 1, 1.2, 1.5, bars=False)
            u[s_].window(x, 4.5, 1.2, 1.5, kind='slide', bars=False)
            shutters(u[s_], x, 4.5, 1.2, 1.5)
    # loggia: three arches on columns in front of the door
    lx0, lx1, ly0 = -3.3, 3.3, -7.5
    B.box(lx0, lx1, ly0, -5.6, 3.5, 3.95, '#f2e6cc', bottom=True)
    for x in (lx0 + .3, -1.1, 1.1, lx1 - .3):
        column(B, x, ly0 + .3, F, 3.5, .36)
    if detail:
        for cx in (-2.2, 0, 2.2):                                           # arches between the columns
            r, n = .9, 8
            for i in range(n):
                t0, t1 = math.pi * i / n, math.pi * (i + 1) / n
                p0 = (cx + r * math.cos(t0), ly0 + .1, 2.6 + r * math.sin(t0)); p1 = (cx + r * math.cos(t1), ly0 + .1, 2.6 + r * math.sin(t1))
                B.face([(p1[0], ly0 + .1, 3.5), (p0[0], ly0 + .1, 3.5), p0, p1][::-1], '#f2e6cc')
    rail = 3.95 + 1.0
    B.box(lx0, lx1, ly0, ly0 + .15, rail - .08, rail, '#f2e6cc')
    if detail:
        x = lx0 + .2
        while x < lx1 - .15:
            B.box(x - .06, x + .06, ly0 + .02, ly0 + .13, 3.95, rail - .08, '#f6eedc')
            x += .26
    steps(B, -2, 2, -7.8, F, 2)
    hip_roof(B, -7, 7, -5.6, 6.8, 6.9, .7, 25, '#b0552f')
    return B.finish('ns_dup4' + ('' if detail else '_lod1'))


def dup_pent(detail):
    """Three levels: two full floors and a set-back penthouse with a roof terrace, glass rails and a pergola."""
    B = Builder(detail)
    F = .45
    slab(B, -7.4, 7.4, -7.4, 7.2, F)
    g = walls(B, -7, 7, -6.2, 6.8, F, 3.6, WHITE, .35)
    B.box(-7.3, 7.3, -6.9, 7.1, 3.6, 3.85, CHAR)
    u = walls(B, -7, 7, -6.2, 6.8, 3.85, 6.9, WHITE, 0)
    B.box(-7.3, 7.3, -6.9, 7.1, 6.9, 7.15, CHAR)
    p = walls(B, -4.6, 3.6, -1.8, 6.4, 7.15, 9.9, '#e5e1d9', 0)
    glass_wall(g['F'], -3.3, F + .1, 5.0, 2.8, panes=4)
    g['F'].door(1.0, F, 1.3, 2.8, BRONZE)
    glass_wall(g['F'], 4.3, F + .1, 3.4, 2.8, panes=2)
    glass_wall(u['F'], -3.5, 4.0, 5.2, 2.6, panes=4)
    glass_wall(u['F'], 3.5, 4.0, 4.2, 2.6, panes=3)
    glass_wall(p['F'], -.5, 7.3, 6.8, 2.4, panes=5, frame=BRONZE)
    B.box(-7.0, 7.0, -6.9, -6.2, 3.6, 3.85, CHAR)
    glass_rail(B, -7.0, 7.0, -6.9, -6.2, 3.85, sides='F')                 # first-floor balcony
    glass_rail(B, -7.0, 7.0, -6.2, 6.8, 7.15, sides='FLR')                 # roof terrace
    for s_ in 'LR':
        for x in (-3.5, 0, 3.5):
            g[s_].window(x, F + .9, 1.6, 1.5, kind='slide', bars=False)
            u[s_].window(x, 4.4, 1.6, 1.5, kind='slide', bars=False)
    for x in (-4, 0, 4):
        g['B'].window(x, F + .9, 1.6, 1.5, kind='slide', bars=False)
        u['B'].window(x, 4.4, 1.6, 1.5, kind='slide', bars=False)
    flat_roof(B, -4.6, 3.6, -1.8, 6.4, 9.9, .5, '#e5e1d9')
    if detail:                                                             # pergola over the terrace
        for x in (-6.6, 6.6):
            B.box(x - .08, x + .08, -5.6, -5.44, 7.15, 9.6, BRONZE)
        B.box(-6.8, 6.8, -5.7, -5.5, 9.5, 9.7, BRONZE)
        x = -6.6
        while x <= 6.7:
            B.box(x - .04, x + .04, -5.7, -1.8, 9.6, 9.75, BRONZE)
            x += .5
    steps(B, -.2, 2.2, -7.4, F, 2)
    return B.finish('ns_dup5' + ('' if detail else '_lod1'))


# ---------------------------------------------------------------- three Nigerian bungalows
def face_me(detail):
    """'Face-me-I-face-you': a long rooming house, a row of doors and small windows under one long roof."""
    B = Builder(detail)
    W, D, F, E = 18.0, 9.0, .35, 3.1
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    slab(B, x0 - .1, x1 + .1, y0 - 1.6, y1 + .1, F)
    w = walls(B, x0, x1, y0, y1, F, E, '#d9dcc4', .55)
    n = 6
    for i in range(n):
        u = x0 + W * (i + .5) / n
        w['F'].door(u - .7, F, .85, 2.1, ['#7a4b2a', '#2f5d75', '#6b2f2a'][i % 3])
        w['F'].window(u + .7, F + 1.0, .8, 1.0)
        w['B'].window(-(u), F + 1.0, .8, 1.0)
    for s_ in 'LR':
        w[s_].window(0, F + 1.0, .9, 1.0)
    for i in range(n + 1):                                                  # verandah posts
        x = x0 + .1 + (W - .2) * i / n
        B.box(x - .08, x + .08, y0 - 1.45, y0 - 1.3, F, E - .05, '#a8a39a')
    gable_roof(B, x0, x1, y0 - 1.5, y1, E, .4, 14, '#9aa1a4', '#d9dcc4')
    if detail:                                                              # bench and a water drum
        B.box(-3, -1.2, y0 - 1.0, y0 - .7, F + .4, F + .46, '#7a5a3a')
        for x in (-2.9, -1.3):
            B.box(x - .04, x + .04, y0 - .95, y0 - .75, F, F + .4, '#5a4028')
        B.box(5.2, 5.8, y0 - 1.0, y0 - .4, F, F + .9, '#2f5fa8')
    return B.finish('ns_faceme' + ('' if detail else '_lod1'))


ZINC = ['#8d8f8c', '#7b6250', '#9a9a95', '#86593b', '#a3a59f', '#6f6a62']


def zinc_house(detail):
    """A zinc 'batcher': walls and roof of rusty corrugated sheets, a wooden door, a shuttered opening."""
    B = Builder(detail)
    W, D, E = 6.4, 5.2, 2.6
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    B.box(x0 - .3, x1 + .3, y0 - .9, y1 + .3, 0, .15, '#7d776e', bottom=True)
    corrugated_walls(B, x0, x1, y0, y1, .15, E, ZINC)
    for (x, y) in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
        B.box(x - .06, x + .06, y - .06, y + .06, .15, E, '#5a4632')
    f = Wall(B, 'F', x0, x1, y0, y1)
    f.box(-1.6, -.75, .15, 2.1, .03, .07, '#6a4a2c')                          # door
    for (p, q) in ((-1.7, -1.6), (-.75, -.65)):
        f.box(p, q, .15, 2.15, .03, .09, '#4a3420')
    wood_window(f, 1.2, 1.0, .9, .8)
    wood_window(Wall(B, 'R', x0, x1, y0, y1), 0, 1.0, .8, .7)
    gable_roof(B, x0, x1, y0, y1, E, .35, 16, '#7b6250', '#86593b', fascia='#5a4632', gutter=False)
    if detail:                                                              # patch sheets and stones holding the roof
        B.box(-2.6, -1.0, y0 - .4, y0 + 1.2, E + .2, E + .26, '#9a9a95')
        for (x, y) in ((-2, -1.5), (1.4, -.8), (-.4, 1.2), (2.2, 1.6)):
            B.box(x - .12, x + .12, y - .1, y + .1, E + .25 + (abs(y) * .1), E + .45 + (abs(y) * .1), '#6d6a64')
    B.box(-1.8, -.5, y0 - .9, y0 - .3, 0, .3, '#8a847a')                      # step
    return B.finish('ns_zinc' + ('' if detail else '_lod1'))


PLANKS = ['#8a6a4a', '#7a5c3e', '#94775a', '#6f5539', '#87705a']


def wood_house(detail):
    """A plank house on short block piers: timber boards, a verandah on posts, zinc roof, shutters."""
    B = Builder(detail)
    W, D, F, E = 7.6, 6.2, .5, 3.0
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    for x in (x0 + .2, 0, x1 - .2):                                         # block piers
        for y in (y0 - 1.4, y0 + .2, 0, y1 - .2):
            B.box(x - .2, x + .2, y - .2, y + .2, 0, F, '#8e8a83')
    B.box(x0 - .1, x1 + .1, y0 - 1.6, y1 + .1, F - .12, F, '#6e5236', bottom=True)   # floor deck
    plank_walls(B, x0, x1, y0, y1, F, E, PLANKS)
    f = Wall(B, 'F', x0, x1, y0, y1)
    f.box(-.5, .45, F, F + 2.05, .03, .07, '#5a3d24')
    for (p, q) in ((-.6, -.5), (.45, .55)):
        f.box(p, q, F, F + 2.12, .03, .1, '#3f2b19')
    for u in (-2.4, 2.3):
        wood_window(f, u, F + 1.0, 1.0, .9)
    for s_ in 'LRB':
        wood_window(Wall(B, s_, x0, x1, y0, y1), 0, F + 1.0, 1.0, .9)
    for x in (x0 + .1, -1.0, 1.0, x1 - .1):                                 # verandah posts and rail
        B.box(x - .07, x + .07, y0 - 1.55, y0 - 1.41, F, E, '#5a4028')
    if detail:
        for (a, b) in ((x0 + .1, -1.0), (1.0, x1 - .1)):
            B.box(a, b, y0 - 1.56, y0 - 1.48, F + .9, F + .98, '#6a4a2e')
            B.box(a, b, y0 - 1.56, y0 - 1.48, F + .45, F + .52, '#6a4a2e')
    gable_roof(B, x0, x1, y0 - 1.6, y1, E, .4, 18, '#8a7a6a', '#7a5c3e', fascia='#5a4028', gutter=False)
    steps(B, -.7, .7, y0 - 1.6, F, 2, .3)
    return B.finish('ns_wood' + ('' if detail else '_lod1'))


def export(ob, path):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    loc = ob.location.copy(); ob.location = (0, 0, 0)
    args = dict(filepath=path, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                export_texcoords=False, export_normals=True, export_materials='EXPORT', export_vertex_color='ACTIVE', export_extras=True)
    for drop in ([], ['export_extras'], ['export_extras', 'export_vertex_color'], ['export_extras', 'export_vertex_color', 'export_texcoords']):
        a = {k: v for k, v in args.items() if k not in drop}
        try:
            bpy.ops.export_scene.gltf(**a)
            break
        except TypeError:
            continue
    ob.location = loc



# ================================================================ public and commercial buildings
def cylinder(B, cx, cy, z0, z1, r, c, n=16, top=True):
    pts = [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    for i in range(n):
        (ax, ay), (bx, by) = pts[i], pts[(i + 1) % n]
        B.face([(ax, ay, z0), (bx, by, z0), (bx, by, z1), (ax, ay, z1)], c)
    if top:
        B.face([(x, y, z1) for x, y in pts], c)


def dome(B, cx, cy, z, r, c, n=16, rings=6, stretch=1.0):
    for j in range(rings):
        a0, a1 = math.pi / 2 * j / rings, math.pi / 2 * (j + 1) / rings
        r0, r1 = r * math.cos(a0), r * math.cos(a1)
        z0, z1 = z + r * math.sin(a0) * stretch, z + r * math.sin(a1) * stretch
        for i in range(n):
            t0, t1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            p = [(cx + r0 * math.cos(t0), cy + r0 * math.sin(t0), z0), (cx + r0 * math.cos(t1), cy + r0 * math.sin(t1), z0),
                 (cx + r1 * math.cos(t1), cy + r1 * math.sin(t1), z1), (cx + r1 * math.cos(t0), cy + r1 * math.sin(t0), z1)]
            if r1 < 1e-4:
                p = p[:3]
            B.face(p, shade(c, .85 + .15 * j / rings))


def ribbon(w, u0, u1, zs, h, step=1.6, glass=GLASS, frame=TRIM, sill=True):
    """A run of identical windows along a wall."""
    u = u0 + step / 2
    while u < u1 - step / 2 + .01:
        w.window(u, zs, step * .62, h, kind='slide', bars=False) if sill else glass_wall(w, u, zs, step * .8, h, panes=2)
        u += step


def breeze(w, u0, u1, z0, z1, c='#e6e0d4'):
    """A panel of breeze blocks (the patterned concrete blocks of Lagos stairwells)."""
    w.box(u0, u1, z0, z1, 0, .02, '#3a3a38')
    if not w.B.detail:
        w.box(u0, u1, z0, z1, .02, .05, c)
        return
    z = z0                                                                            # a grid of block edges
    while z < z1 + .01:
        w.box(u0, u1, z - .04, min(z1, z + .04), .02, .07, c)
        z += .45
    u = u0
    while u < u1 + .01:
        w.box(u - .04, min(u1, u + .04), z0, z1, .02, .07, c)
        u += .45


def corridor(B, x0, x1, y_wall, depth, z_floor, z_ceil, posts, rail='#d9d2c4', post_c=COLUMN, low_wall=True):
    """An open corridor along a front wall: floor slab, posts and a balustrade wall (school and flat blocks)."""
    y0 = y_wall - depth
    B.box(x0, x1, y0, y_wall, z_floor - .2, z_floor, TRIM, bottom=True)
    for i in range(posts + 1):
        x = x0 + .15 + (x1 - x0 - .3) * i / posts
        B.box(x - .15, x + .15, y0, y0 + .3, z_floor, z_ceil, post_c)
    if low_wall:
        B.box(x0, x1, y0, y0 + .15, z_floor, z_floor + 1.0, rail)
        B.box(x0 - .03, x1 + .03, y0 - .03, y0 + .18, z_floor + 1.0, z_floor + 1.08, TRIM)


def school_block(detail, floors=2):
    """A Nigerian school classroom block: long, open corridors with half walls, a row of classrooms, a zinc hip roof."""
    B = Builder(detail, simple=True)
    W, D, F, FH = 30.0, 9.0, .45, 3.4
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    slab(B, x0 - .3, x1 + .3, y0 - 2.4, y1 + .2, F)
    top = F + FH * floors
    w = walls(B, x0, x1, y0, y1, F, top, '#f0e6c8', .9)
    B.box(x0 - .03, x1 + .03, y0 - .03, y1 + .03, F + .9, F + 1.05, '#2f5d9b')      # the blue school band
    n = 5
    for f in range(floors):
        z = F + FH * f
        for i in range(n):
            u = x0 + W * (i + .5) / n
            w['F'].door(u - 1.8, z, 1.0, 2.2, '#2f5d9b')
            for du in (-.2, 1.2, 2.4):
                w['F'].window(u + du, z + 1.0, .9, 1.3)
            for du in (-2.0, -.4, 1.2):
                w['B'].window(-(u + du), z + 1.0, .9, 1.3)
        if f > 0:
            corridor(B, x0, x1, y0, 2.2, z, z + FH, 8, '#f0e6c8')
            B.box(x0 - .03, x1 + .03, y0 - 2.23, y0 - 2.0, z + .4, z + .55, '#2f5d9b')
        else:
            for i in range(9):
                x = x0 + .15 + (W - .3) * i / 8
                B.box(x - .15, x + .15, y0 - 2.2, y0 - 1.9, F, F + FH, COLUMN)
    if floors > 1:                                                                # stair at the end
        B.box(x1, x1 + 2.6, y0 - 2.2, y0 + 2.0, 0, F + FH * floors - .3, '#e9dfc2')
        breeze(Wall(B, 'R', x1, x1 + 2.6, y0 - 2.2, y0 + 2.0), -1.6, 1.8, F + 1.2, F + FH * floors - 1.0)
    for s_ in 'LR':
        for f in range(floors):
            w[s_].window(0, F + FH * f + 1.0, 1.0, 1.3)
    hip_roof(B, x0, x1, y0 - 2.2, y1, top, .6, 18, '#8a8f8f')
    return B.finish('ns_school%d' % floors + ('' if detail else '_lod1'))


def school2(detail):
    return school_block(detail, 2)


def school1(detail):
    return school_block(detail, 1)


def school_gate(detail):
    """A school gate: two pillars with caps, a steel double gate and an arch beam that carries the name board."""
    B = Builder(detail)
    for x in (-3.4, 3.4):
        B.box(x - .45, x + .45, -.45, .45, 0, 3.4, '#ede3c6')
        B.box(x - .55, x + .55, -.55, .55, 3.4, 3.6, '#2f5d9b')
        B.box(x - .35, x + .35, -.35, .35, 3.6, 3.9, '#ede3c6')
    B.box(-3.0, 3.0, -.3, .3, 3.9, 4.6, '#2f5d9b')                                 # beam / board
    B.box(-2.8, 2.8, -.33, -.3, 4.0, 4.5, '#f4f1e6')
    if detail:
        for side in (-1, 1):                                                          # the two gate leaves
            a, b = (-2.95, -.05) if side < 0 else (.05, 2.95)
            B.box(a, b, -.05, .05, .1, .2, '#1f3b66'); B.box(a, b, -.05, .05, 1.9, 2.0, '#1f3b66'); B.box(a, b, -.05, .05, 1.0, 1.08, '#1f3b66')
            x = a + .1
            while x < b:
                B.box(x - .02, x + .02, -.04, .04, .1, 2.15, '#1f3b66')
                x += .15
    else:
        B.box(-2.95, 2.95, -.05, .05, .1, 2.0, '#1f3b66')
    return B.finish('ns_schoolgate' + ('' if detail else '_lod1'))


def hospital_big(detail):
    """A big teaching-hospital block: five floors of wards, a stair tower, a drive-in canopy for ambulances."""
    B = Builder(detail, simple=True)
    W, D, F, FH, N = 42.0, 16.0, .5, 3.6, 5
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    slab(B, x0 - .3, x1 + .3, y0 - 7.5, y1 + .3, F)
    top = F + FH * N
    w = walls(B, x0, x1, y0, y1, F, top, '#f3f2ee', .6)
    for f in range(N):
        z = F + FH * f
        B.box(x0 - .05, x1 + .05, y0 - .05, y1 + .05, z + FH - .35, z + FH, '#3f8a62')     # green floor bands
        if f == 0:
            glass_wall(w['F'], 0, F, 10, 3.0, panes=6)
            ribbon(w['F'], x0 + .5, -6, z + 1.0, 1.4); ribbon(w['F'], 6, x1 - .5, z + 1.0, 1.4)
        else:
            ribbon(w['F'], x0 + .5, x1 - .5, z + .9, 1.6, 2.4)
        ribbon(w['B'], -x1 + .5, -x0 - .5, z + .9, 1.6, 2.4)
        for s_ in 'LR':
            ribbon(w[s_], y0 + .6, y1 - .6, z + .9, 1.6, 2.6)
    B.box(x1 - 6, x1 - 1, y0 - 1.2, y0, F, top + 2.0, '#e5e8e6')                   # stair tower
    glass_wall(Wall(B, 'F', x1 - 6, x1 - 1, y0 - 1.2, y0), x1 - 3.5, F + 1, 3.4, top - 2, panes=2)
    flat_roof(B, x0, x1, y0, y1, top, 1.0, '#f3f2ee', '#3f8a62')
    B.box(-7, 7, y0 - 7.2, y0, F + 4.2, F + 4.6, '#f7f7f5')                         # ambulance canopy
    for x in (-6.6, 6.6):
        B.box(x - .2, x + .2, y0 - 7.0, y0 - 6.6, F, F + 4.2, '#d8dad8')
    B.box(-7, 7, y0 - 7.25, y0 - 7.15, F + 3.8, F + 4.6, '#3f8a62')
    # a red cross board high on the front
    B.box(-2.6, 2.6, y0 - .25, y0 - .05, top + .2, top + 3.2, '#ffffff')
    B.box(-.35, .35, y0 - .32, y0 - .25, top + .7, top + 2.7, '#d22b2b'); B.box(-1.0, 1.0, y0 - .32, y0 - .25, top + 1.35, top + 2.05, '#d22b2b')
    return B.finish('ns_hospital' + ('' if detail else '_lod1'))


def clinic(detail):
    """A two-storey clinic or ward block with a green band and a covered entrance."""
    B = Builder(detail, simple=True)
    W, D, F, FH = 20.0, 11.0, .5, 3.5
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    slab(B, x0 - .3, x1 + .3, y0 - 3.2, y1 + .3, F)
    w = walls(B, x0, x1, y0, y1, F, F + FH * 2, '#f2f1ec', .6)
    for f in range(2):
        z = F + FH * f
        B.box(x0 - .05, x1 + .05, y0 - .05, y1 + .05, z + FH - .3, z + FH, '#3f8a62')
        ribbon(w['F'], x0 + .4, -2.2 if f == 0 else x1 - .4, z + .95, 1.5, 2.2)
        if f == 0:
            ribbon(w['F'], 2.2, x1 - .4, z + .95, 1.5, 2.2)
        ribbon(w['B'], -x1 + .4, -x0 - .4, z + .95, 1.5, 2.2)
        for s_ in 'LR':
            ribbon(w[s_], y0 + .5, y1 - .5, z + .95, 1.5, 2.4)
    glass_wall(w['F'], 0, F, 3.6, 2.6, panes=2)
    B.box(-3, 3, y0 - 3, y0, F + 3.0, F + 3.3, '#f7f7f5')
    for x in (-2.7, 2.7):
        B.box(x - .12, x + .12, y0 - 2.9, y0 - 2.66, F, F + 3.0, '#d8dad8')
    hip_roof(B, x0, x1, y0, y1, F + FH * 2, .6, 16, '#6c7a74')
    return B.finish('ns_clinic' + ('' if detail else '_lod1'))


def university(detail):
    """A university faculty building: three floors over a colonnade, sun-breakers on the windows, an entrance tower."""
    B = Builder(detail, simple=True)
    W, D, F, FH = 46.0, 15.0, .6, 3.8
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    slab(B, x0 - .3, x1 + .3, y0 - 4.5, y1 + .3, F)
    top = F + FH * 3
    w = walls(B, x0, x1, y0, y1, F, top, '#e9e2d3', .5)
    glass_wall(w['F'], 0, F, 14, 3.2, panes=7, frame='#3a3330')
    for f in range(3):
        z = F + FH * f
        if f:
            ribbon(w['F'], x0 + .5, x1 - .5, z + .9, 1.7, 2.3)
            if detail:                                                                 # vertical sun-breakers
                u = x0 + .4
                while u < x1:
                    w.get('F').box(u - .06, u + .06, z, z + FH, .0, .55, '#d8cfbd')
                    u += 2.3
        else:
            ribbon(w['F'], x0 + .5, -8, z + .9, 1.7, 2.3); ribbon(w['F'], 8, x1 - .5, z + .9, 1.7, 2.3)
        ribbon(w['B'], -x1 + .5, -x0 - .5, z + .9, 1.6, 2.3)
        for s_ in 'LR':
            ribbon(w[s_], y0 + .5, y1 - .5, z + .9, 1.6, 2.4)
    for i in range(13):                                                                # colonnade
        x = x0 + 1 + (W - 2) * i / 12
        column(B, x, y0 - 3.8, F, F + FH, .5)
    B.box(x0, x1, y0 - 4.3, y0, F + FH - .1, F + FH + .3, '#e1d8c6', bottom=True)
    B.box(-5, 5, y0 - 1.0, y0, F, top + 4.0, '#c9b99c')                            # entrance tower
    glass_wall(Wall(B, 'F', -5, 5, y0 - 1.0, y0), 0, F + FH + .6, 6, top - FH, panes=4, frame='#3a3330')
    B.box(-4.5, 4.5, y0 - 1.15, y0 - 1.0, top + 1.2, top + 3.4, '#1f3b66')            # name board (label in the game)
    flat_roof(B, x0, x1, y0, y1, top, .9, '#e9e2d3')
    flat_roof(B, -5, 5, y0 - 1.0, y0 + 2.0, top + 4.0, .4, '#c9b99c')
    return B.finish('ns_uni' + ('' if detail else '_lod1'))


def hotel(detail):
    """A hotel: glass lobby podium with a drive-in canopy, nine floors of rooms with balconies, a lit crown."""
    B = Builder(detail, simple=True)
    W, D, F, FH, N = 26.0, 17.0, .4, 3.3, 9
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    slab(B, x0 - 3, x1 + 3, y0 - 8, y1 + 3, F)
    pw = walls(B, x0 - 2.5, x1 + 2.5, y0 - 1.5, y1 + 2.5, F, F + 5.0, '#d8cdb9', .0)   # podium
    glass_wall(pw['F'], 0, F, W, 4.4, panes=12, frame='#2b2522', glass='#3a4a52')
    flat_roof(B, x0 - 2.5, x1 + 2.5, y0 - 1.5, y1 + 2.5, F + 5.0, .4, '#d8cdb9')
    tz = F + 5.0
    tw = walls(B, x0, x1, y0, y1, tz, tz + FH * N, '#efe8dc', 0)
    for f in range(N):
        z = tz + FH * f
        n = 8
        for i in range(n):
            u = x0 + W * (i + .5) / n
            glass_wall(tw['F'], u, z + .2, 2.2, 2.6, panes=2, frame='#4a3f36')
            tw['B'].window(-u, z + .9, 1.4, 1.6, kind='slide', bars=False)
            if detail:                                                                  # balconies
                B.box(u - 1.45, u + 1.45, y0 - 1.3, y0, z - .05, z + .12, '#f4efe6')
                glass_rail(B, u - 1.45, u + 1.45, y0 - 1.3, y0, z + .12, 1.0, 'FLR')
        for s_ in 'LR':
            ribbon(tw[s_], y0 + .6, y1 - .6, z + .8, 1.6, 2.6)
        B.box(x0 - .05, x1 + .05, y0 - .05, y1 + .05, z + FH - .15, z + FH, '#d8cdb9')
    top = tz + FH * N
    flat_roof(B, x0, x1, y0, y1, top, 1.2, '#efe8dc')
    B.box(x0 + 2, x1 - 2, y0 + 1, y1 - 1, top, top + 3.0, '#6b1f2a')                  # crown (sign in the game)
    B.box(-8, 8, y0 - 8, y0 - 1.5, F + 4.0, F + 4.5, '#efe8dc')                       # porte-cochère
    for x in (-7.5, 7.5):
        cylinder(B, x, y0 - 7.4, F, F + 4.0, .3, '#d4c6ae', 12)
    B.box(-8, 8, y0 - 8.1, y0 - 7.95, F + 3.9, F + 4.6, '#6b1f2a')
    return B.finish('ns_hotel' + ('' if detail else '_lod1'))


def flats(detail, floors=3, roof='flat'):
    """A Lagos block of flats: two flats per floor, balconies on the front, a breeze-block stair in the middle."""
    B = Builder(detail, simple=True)
    W, D, F, FH = 18.0, 12.0, .45, 3.1
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    slab(B, x0 - .3, x1 + .3, y0 - 1.8, y1 + .3, F)
    top = F + FH * floors
    w = walls(B, x0, x1, y0, y1, F, top, '#efe7d6', .7)
    st = Wall(B, 'F', -1.6, 1.6, y0 - 1.2, y0)
    B.box(-1.6, 1.6, y0 - 1.2, y0, F, top + .5, '#e3d9c3')                            # stair core
    breeze(st, -1.3, 1.3, F + .6, top - .3)
    for f in range(floors):
        z = F + FH * f
        for side in (-1, 1):
            c = side * 5.0
            glass_wall(w['F'], c - 1.4 * side, z + .2, 1.6, 2.3, panes=2) if f else w['F'].door(c - 1.4 * side, z, 1.0, 2.2, '#5b3a22')
            w['F'].window(c + 1.4 * side, z + 1.0, 1.4, 1.3)
            if f:                                                                       # balcony
                B.box(c - 3, c + 3, y0 - 1.4, y0, z - .15, z + .05, TRIM, bottom=True)
                B.box(c - 3, c + 3, y0 - 1.4, y0 - 1.28, z + .05, z + 1.0, '#efe7d6')
                B.box(c - 3.03, c + 3.03, y0 - 1.43, y0 - 1.25, z + 1.0, z + 1.08, TRIM)
                for e in (c - 3, c + 3 - .12):
                    B.box(e, e + .12, y0 - 1.4, y0, z + .05, z + 1.0, '#efe7d6')
            w['B'].window(-c - 1.5, z + 1.0, 1.4, 1.3); w['B'].window(-c + 1.5, z + 1.0, 1.0, 1.0)
        for s_ in 'LR':
            for u in (-3.5, 0, 3.5):
                w[s_].window(u, z + 1.0, 1.2, 1.3)
    if roof == 'flat':
        flat_roof(B, x0, x1, y0, y1, top, .9, '#efe7d6')
        B.box(4, 6, 2, 4, top, top + 1.6, '#2f5fa8')                                    # water tank
    else:
        hip_roof(B, x0, x1, y0 - 1.4, y1, top, .5, 20, '#7a3a2a')
    return B.finish('ns_flats%d' % floors + ('' if detail else '_lod1'))


def flats3(detail):
    return flats(detail, 3, 'flat')


def flats4(detail):
    return flats(detail, 4, 'hip')


def shops(detail, floors=1):
    """A row of shops: roll-up shutters (some open), awnings over the doors, blank sign boards, flats above on the two-floor one."""
    B = Builder(detail)
    W, D, F = 20.0, 8.0, .3
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    slab(B, x0 - .2, x1 + .2, y0 - 2.0, y1 + .2, F)
    top = F + 3.6 + (3.1 if floors > 1 else 0)
    w = walls(B, x0, x1, y0, y1, F, top, '#e5ddcd', .4)
    n = 5
    signs = ['#d9342b', '#1f6fb5', '#f2b705', '#16a06b', '#7b3fa0', '#e8590c']
    for i in range(n):
        u = x0 + W * (i + .5) / n
        open_ = (i * 3) % 5 < 3
        w['F'].box(u - 1.6, u + 1.6, F, F + 2.7, 0, .02, '#1f1c19' if open_ else '#9aa0a3')
        if detail and not open_:
            z = F + .1
            while z < F + 2.6:
                w['F'].box(u - 1.6, u + 1.6, z, z + .04, .02, .035, '#7d8285')
                z += .14
        if detail and open_:                                                           # goods on show in the doorway
            for k in range(3):
                w['F'].box(u - 1.4 + k * 1.0, u - .7 + k * 1.0, F, F + rr_(i, k), .02, .5, signs[(i + k) % len(signs)])
        w['F'].box(u - 1.7, u + 1.7, F + 2.7, F + 2.85, 0, .06, TRIM)
        w['F'].box(u - 1.75, u + 1.75, F + 2.95, F + 3.55, 0, .1, signs[i % len(signs)])       # sign board
        w['F'].box(u - 1.75, u + 1.75, F + 2.6, F + 2.7, .1, 1.4, '#3f6f8f' if i % 2 else '#8a3a2a')   # awning
    if floors > 1:
        z = F + 3.6
        B.box(x0 - .05, x1 + .05, y0 - 1.0, y0, z - .1, z + .1, TRIM, bottom=True)
        for i in range(4):
            u = x0 + W * (i + .5) / 4
            w['F'].window(u, z + 1.0, 1.4, 1.3)
        flat_roof(B, x0, x1, y0, y1, top, .8, '#e5ddcd')
    else:
        B.box(x0, x1, y0 - .1, y0, top, top + 1.0, '#e5ddcd')                            # tall front parapet
        B.box(x0 - .05, x1 + .05, y0 - .15, y0 + .05, top + 1.0, top + 1.08, TRIM)
        gable_roof(B, x0, x1, y0, y1, top, .3, 10, '#8e9292', '#e5ddcd')
    for s_ in 'LRB':
        w[s_].window(0, F + 1.2, 1.0, 1.0)
    return B.finish('ns_shops%d' % floors + ('' if detail else '_lod1'))


def rr_(i, k):
    return .9 + ((i * 7 + k * 3) % 5) * .25


def shops1(detail):
    return shops(detail, 1)


def shops2(detail):
    return shops(detail, 2)


def warehouse(detail):
    """A warehouse or factory shed: block base, corrugated sheet walls and roof, big rolling doors."""
    B = Builder(detail, simple=True)
    W, D, E = 28.0, 18.0, 7.0
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    B.box(x0 - .5, x1 + .5, y0 - 3, y1 + .5, 0, .2, '#8b867d', bottom=True)
    B.box(x0, x1, y0, y1, .2, 1.6, '#bdb6aa')
    corrugated_walls(B, x0, x1, y0, y1, 1.6, E, ['#b9bdbf', '#aeb3b5', '#c3c6c7'], .25)
    f = Wall(B, 'F', x0, x1, y0, y1)
    for u in (-7, 7):
        f.box(u - 2.8, u + 2.8, .2, 5.2, .03, .08, '#6f7779')
        if detail:
            z = .4
            while z < 5.1:
                f.box(u - 2.8, u + 2.8, z, z + .04, .08, .1, '#5d6466')
                z += .2
        f.box(u - 3.0, u + 3.0, 5.2, 5.5, .0, .12, '#e3b23c')
    f.door(0, .2, 1.0, 2.2, '#6f7779')
    for s_ in 'LR':
        ribbon(Wall(B, s_, x0, x1, y0, y1), y0 + 1, y1 - 1, 5.3, .9, 2.4)
    gable_roof(B, x0, x1, y0, y1, E, .5, 10, '#a7acae', '#b9bdbf', fascia='#8f9597', gutter=True)
    return B.finish('ns_warehouse' + ('' if detail else '_lod1'))


def church(detail):
    """A church: a long nave with tall arched windows, a bell tower with a cross over the entrance."""
    B = Builder(detail)
    W, D, F, E = 14.0, 26.0, .6, 7.0
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    slab(B, x0 - .4, x1 + .4, y0 - 5.0, y1 + .4, F)
    w = walls(B, x0, x1, y0, y1, F, E, '#f3eee2', .6)
    for s_ in 'LR':
        u = y0 + 2.5
        while u < y1 - 1.5:
            w[s_].window(u, F + 1.6, 1.3, 3.6, kind='slide', bars=False)
            u += 3.5
    T = Wall(B, 'F', -2.6, 2.6, y0 - 4.6, y0)
    B.box(-2.6, 2.6, y0 - 4.6, y0, F, 17.0, '#f3eee2')                                # tower
    T.door(0, F, 2.0, 3.4, '#5b3a22')
    arch_window(T, 0, 6.5, 1.4, 3.0)
    arch_window(T, 0, 11.5, 1.2, 2.4)
    hip_roof(B, -2.6, 2.6, y0 - 4.6, y0, 17.0, .3, 55, '#4d5a63', ribs=False)
    B.box(-.12, .12, y0 - 2.42, y0 - 2.18, 17 + 3.4, 17 + 6.0, '#c9a25a'); B.box(-.8, .8, y0 - 2.42, y0 - 2.18, 17 + 4.8, 17 + 5.1, '#c9a25a')
    for x in (-5.8, 5.8):
        arch_window(w['F'], x, F + 1.5, 1.3, 3.4)
    gable_roof(B, x0, x1, y0, y1, E, .6, 38, '#4d5a63', '#f3eee2')
    return B.finish('ns_church' + ('' if detail else '_lod1'))


def mosque(detail):
    """A mosque: a square prayer hall with arched openings, a green dome and a tall minaret."""
    B = Builder(detail)
    W, D, F, E = 18.0, 18.0, .6, 6.0
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    slab(B, x0 - 3, x1 + .4, y0 - 3, y1 + .4, F)
    w = walls(B, x0, x1, y0, y1, F, E, '#f4f0e6', .6)
    for s_ in 'FBLR':
        for u in (-5.5, -1.8, 1.8, 5.5):
            if s_ == 'F' and abs(u) < 2:
                continue
            w[s_].window(u, F + 1.2, 1.2, 2.6, kind='slide', bars=False)
    w['F'].door(0, F, 2.2, 3.2, '#2f6b4f')
    flat_roof(B, x0, x1, y0, y1, E, .7, '#f4f0e6', '#2f6b4f')
    cylinder(B, 0, 0, E, E + 2.0, 5.2, '#f4f0e6', 24)
    dome(B, 0, 0, E + 2.0, 5.2, '#2f8a5a', 24, 7, 1.15)
    cylinder(B, 0, 0, E + 2.0 + 5.2 * 1.15, E + 2.0 + 5.2 * 1.15 + 1.2, .08, '#c9a25a', 6)
    mx, my = x1 + 1.8, y0 - 1.8                                                       # minaret
    cylinder(B, mx, my, 0, 22, 1.1, '#f4f0e6', 12)
    cylinder(B, mx, my, 16, 16.6, 1.7, '#2f6b4f', 12)
    cylinder(B, mx, my, 22, 22.3, 1.3, '#f4f0e6', 12)
    dome(B, mx, my, 22.3, 1.2, '#2f8a5a', 12, 4, 1.6)
    return B.finish('ns_mosque' + ('' if detail else '_lod1'))


def bank(detail):
    """A bank: a polished stone and glass front, tall columns, the logo band above the door."""
    B = Builder(detail, simple=True)
    W, D, F, FH = 18.0, 14.0, .6, 3.8
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    slab(B, x0 - .4, x1 + .4, y0 - 2.6, y1 + .4, F)
    top = F + FH * 3
    w = walls(B, x0, x1, y0, y1, F, top, '#d8d2c8', 0)
    stone(w['F'], x0, x1, F, F + FH, '#b7ad9d')
    glass_wall(w['F'], 0, F + .1, 8, 3.3, panes=4, frame='#202224', glass='#2a3a44')
    for f in (1, 2):
        glass_wall(w['F'], 0, F + FH * f + .3, W - 2, 3.0, panes=8, frame='#202224', glass='#2a3a44')
    for s_ in 'LR':
        for f in range(3):
            ribbon(w[s_], y0 + .6, y1 - .6, F + FH * f + .9, 1.8, 2.6)
    for x in (-6.5, -3.5, 3.5, 6.5):
        column(B, x, y0 - 2.0, F, F + FH * 2, .5)
    B.box(x0, x1, y0 - 2.4, y0, F + FH * 2, F + FH * 2 + .6, '#e9e4dc', bottom=True)
    B.box(-6, 6, y0 - 2.45, y0 - 2.4, F + FH * 2 + .05, F + FH * 2 + .55, '#7a1e2b')   # logo band
    flat_roof(B, x0, x1, y0, y1, top, 1.0, '#d8d2c8')
    return B.finish('ns_bank' + ('' if detail else '_lod1'))



# ================================================================ the airport
def loft(B, rings, c, cap0=True, cap1=True, shades=None):
    """Join a list of rings (each a list of points, same count) into a tube; optional flat caps at both ends."""
    n = len(rings[0])
    for j in range(len(rings) - 1):
        a, b = rings[j], rings[j + 1]
        for i in range(n):
            col = c if not shades else shades(j, i)
            B.face([a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]], col)
    if cap0:
        B.face(rings[0][::-1], c)
    if cap1:
        B.face(rings[-1], c)


def airliner(detail, length=38.0, span=34.0, wide=False, livery=('#16a06b', '#f2b705')):
    """A twin-engine airliner (fictional 'Naija Air' livery): fuselage, swept wings, engines, tailplanes, fin, windows, wheels.
    Nose toward -Y (the front, like the houses)."""
    B = Builder(detail, simple=True)
    R = (3.0 if wide else 2.0)
    n = 14 if detail else 8
    zc = R + 1.6                                       # fuselage axis height above the ground
    WHITE_ = '#f2f2f0'
    def ring(y, r, dz=0.0, sq=1.0):
        return [(r * math.cos(2 * math.pi * i / n), y, zc + dz + r * sq * math.sin(2 * math.pi * i / n)) for i in range(n)]
    y0, y1 = -length / 2, length / 2
    prof = [(y0, .05, -.3), (y0 + .6, .55, -.2), (y0 + 1.6, .85, -.1), (y0 + 3.2, 1.0, 0), (y1 - 9, 1.0, 0), (y1 - 4, .7, .35), (y1 - 1.2, .35, .7), (y1, .12, .8)]
    rings = [ring(y, R * k, R * dz) for (y, k, dz) in prof]
    def sh(j, i):
        z = math.sin(2 * math.pi * i / n)
        return '#cfd2d4' if z < -.55 else WHITE_
    loft(B, rings, WHITE_, True, True, sh)
    # cheat line and windows along both sides
    for sgn in (-1, 1):
        x = sgn * (R + .01)
        B.box(x - .02 * sgn, x + .02 * sgn, y0 + 3, y1 - 6, zc - .55, zc - .3, livery[0])
        if detail:
            y = y0 + 4.5
            while y < y1 - 8:
                B.box(min(x, x + .03 * sgn), max(x, x + .03 * sgn), y, y + .28, zc + .15, zc + .5, '#2a3138')
                y += .9
        B.box(min(x, x + .03 * sgn), max(x, x + .03 * sgn), y0 + 2.8, y0 + 3.7, zc - .9, zc + .9, '#c9cdd0')   # front door
    B.box(-.9, .9, y0 + .6, y0 + 1.5, zc + .25, zc + .75, '#1d252c')                                         # cockpit glass
    # wings: swept, root at mid-fuselage, low on the body
    wy, wz, root, tip = -1.0, zc - R * .55, 7.0 if not wide else 10.0, 1.8 if not wide else 2.6
    sweep = span * .22
    for sgn in (-1, 1):
        a = (sgn * R * .8, wy - root / 2, wz); b = (sgn * R * .8, wy + root / 2, wz)
        c_ = (sgn * span / 2, wy + root / 2 + sweep * .6, wz + 1.2); d = (sgn * span / 2, wy + root / 2 + sweep * .6 - tip, wz + 1.2)
        top = [a, b, c_, d] if sgn > 0 else [b, a, d, c_]
        B.face(top, WHITE_); B.face([(p[0], p[1], p[2] - .3) for p in top][::-1], '#bfc3c6')
        B.face([a, d, (d[0], d[1], d[2] - .3), (a[0], a[1], a[2] - .3)][::sgn], '#d9dcde')
        B.box(c_[0] - .1 * sgn if sgn > 0 else c_[0], c_[0] if sgn > 0 else c_[0] + .1, d[1], c_[1], wz + 1.2, wz + 2.6, livery[1])   # winglet
        # engine
        ex, ey, ez = sgn * (span * .17 + R * .5), wy - root * .35, wz - 1.1
        er = 1.0 if not wide else 1.6
        el = 4.2 if not wide else 6.0
        cylinder_y(B, ex, ey - el / 2, ey + el / 2, ez, er, '#dfe1e2', 12 if detail else 8)
        B.box(ex - .15, ex + .15, ey - .5, ey + 1.2, ez + er - .1, wz, '#cfd2d4')                            # pylon
        B.face([(ex + er * .8 * math.cos(2 * math.pi * i / 10), ey - el / 2 - .01, ez + er * .8 * math.sin(2 * math.pi * i / 10)) for i in range(10)][::-1], '#222222')
    # tailplanes and fin
    ty = y1 - 3.5
    for sgn in (-1, 1):
        a = (sgn * .5, ty - 2.5, zc + R * .55); b = (sgn * .5, ty + 2.0, zc + R * .55)
        c_ = (sgn * span * .2, ty + 3.2, zc + R * .55 + .5); d = (sgn * span * .2, ty + 1.8, zc + R * .55 + .5)
        top = [a, b, c_, d] if sgn > 0 else [b, a, d, c_]
        B.face(top, WHITE_); B.face(top[::-1], '#c9cdd0')
    fb, ft = (0, ty - 3.5, zc + R * .8), (0, ty + 2.5, zc + R * .8)
    fin = [fb, ft, (0, ty + 5.0, zc + R + 6.5 + (2 if wide else 0)), (0, ty + 2.6, zc + R + 6.5 + (2 if wide else 0))]
    for sgn in (-1, 1):
        B.face([(p[0] + sgn * .12, p[1], p[2]) for p in fin][::sgn], livery[0])
    B.box(-.13, .13, ty + 1.0, ty + 4.0, zc + R + 3.0, zc + R + 4.2, livery[1])                                # tail stripe
    # landing gear
    for (gx, gy) in ((0, y0 + 4), (-R * .9, wy + 1), (R * .9, wy + 1)):
        B.box(gx - .1, gx + .1, gy - .1, gy + .1, .6, zc - R + .3, '#555')
        cylinder_x(B, gx - .35, gx + .35, gy, .55, .55, '#1c1c1c', 10)
    return B.finish(('ns_jet_wide' if wide else 'ns_jet') + ('' if detail else '_lod1'))


def cylinder_y(B, x, y0, y1, z, r, c, n=12):
    rings = [[(x + r * math.cos(2 * math.pi * i / n), y, z + r * math.sin(2 * math.pi * i / n)) for i in range(n)] for y in (y0, y1)]
    loft(B, rings, c, False, True)


def cylinder_x(B, x0, x1, y, z, r, c, n=10):
    rings = [[(x, y + r * math.cos(2 * math.pi * i / n), z + r * math.sin(2 * math.pi * i / n)) for i in range(n)] for x in (x0, x1)]
    loft(B, rings, c, True, True)


def jet(detail):
    return airliner(detail, 38, 34, False)


def jet_wide(detail):
    return airliner(detail, 63, 60, True, ('#1f6fb5', '#16a06b'))


def terminal(detail):
    """The passenger terminal: a long glass hall under a floating roof, departures road on columns in front,
    a concrete base with arrivals doors below, a name band. Landside (front) toward -Y, airside behind."""
    B = Builder(detail, simple=True)
    W, D = 240.0, 46.0
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    B.box(x0, x1, y0, y1, 0, 6.0, '#d9d4ca', bottom=True)                                    # arrivals level
    a = Wall(B, 'F', x0, x1, y0, y1)
    u = x0 + 8
    while u < x1 - 6:
        glass_wall(a, u, .2, 9, 4.6, panes=3, frame='#40464b', glass='#334450')
        u += 14
    B.box(x0 + 4, x1 - 4, y0 + 2, y1 - 2, 6.0, 20.0, '#cfd6da')                              # departures hall
    g = Wall(B, 'F', x0 + 4, x1 - 4, y0 + 2, y1 - 2)
    glass_wall(g, 0, 6.3, W - 12, 13.2, panes=40, frame='#3c4247', glass='#3e5866')
    gb = Wall(B, 'B', x0 + 4, x1 - 4, y0 + 2, y1 - 2)
    glass_wall(gb, 0, 6.3, W - 12, 13.2, panes=40, frame='#3c4247', glass='#3e5866')
    # the floating roof: a thin slab with a deep overhang over the departures road, tree columns underneath
    B.box(x0 - 6, x1 + 6, y0 - 22, y1 + 6, 21.0, 22.2, '#e9ebec', bottom=True)
    B.box(x0 - 6.2, x1 + 6.2, y0 - 22.2, y0 - 21.6, 20.6, 22.4, '#9aa3a8')
    for x in range(int(x0) + 10, int(x1) - 5, 20):
        cylinder(B, x, y0 - 18, 7.0, 21.0, .5, '#bfc6ca', 10)
        for dx in (-2.4, 2.4):
            B.face([(x - .3, y0 - 18, 15.5), (x + .3, y0 - 18, 15.5), (x + dx + .2, y0 - 18, 21.0), (x + dx - .2, y0 - 18, 21.0)], '#bfc6ca')
    # departures road: a deck on piers in front of the glass
    B.box(x0, x1, y0 - 20, y0 - 2, 6.0, 7.0, '#b9b4ab', bottom=True)
    B.box(x0, x1, y0 - 20.4, y0 - 20, 7.0, 8.1, '#d9d4ca')
    for x in range(int(x0) + 6, int(x1), 18):
        B.box(x - .6, x + .6, y0 - 12, y0 - 10.8, 0, 6.0, '#b9b4ab')
    # name band (the name is a label in the game) and the airside piers for the jet bridges
    B.box(-60, 60, y0 - 22.4, y0 - 22.2, 18.6, 20.4, '#16a06b')
    for x in range(-100, 101, 40):
        B.box(x - 4, x + 4, y1 - 2, y1 + 8, 0, 6.5, '#d9d4ca')
        B.box(x - 4.2, x + 4.2, y1 - 2.2, y1 + 8.2, 6.5, 7.0, '#9aa3a8')
    B.box(-12, 12, y0 + 6, y1 - 6, 22.2, 25, '#c9cfd2')                                       # plant room on the roof
    return B.finish('ns_terminal' + ('' if detail else '_lod1'))


def control_tower(detail):
    """Control tower: a tall concrete shaft, a flared top with a ring of slanted glass, a mast with a beacon."""
    B = Builder(detail, simple=True)
    B.box(-9, 9, -7, 7, 0, 8, '#d9d4ca', bottom=True)                                       # base building
    ribbon(Wall(B, 'F', -9, 9, -7, 7), -8, 8, 2.5, 2.0, 3.0)
    cylinder(B, 0, 0, 8, 46, 3.2, '#e2e0db', 16)
    for z in range(12, 44, 6):
        B.box(-.5, .5, -3.25, -3.1, z, z + 2.2, '#34454f')                                    # stair windows
    rings = []
    for (z, r) in ((46, 3.2), (48, 6.5), (49, 6.8)):
        rings.append([(r * math.cos(2 * math.pi * i / 16), r * math.sin(2 * math.pi * i / 16), z) for i in range(16)])
    loft(B, rings, '#e2e0db', False, False)
    g0 = [(6.8 * math.cos(2 * math.pi * i / 16), 6.8 * math.sin(2 * math.pi * i / 16), 49) for i in range(16)]
    g1 = [(7.6 * math.cos(2 * math.pi * i / 16), 7.6 * math.sin(2 * math.pi * i / 16), 53) for i in range(16)]
    loft(B, [g0, g1], '#2c4250', False, False)
    cylinder(B, 0, 0, 53, 54.2, 7.8, '#d0cfca', 16)
    cylinder(B, 0, 0, 54.2, 62, .25, '#b0b0b0', 6)
    cylinder(B, 0, 0, 62, 62.6, .5, '#d22b2b', 8)
    return B.finish('ns_tower' + ('' if detail else '_lod1'))


def jet_bridge(detail):
    """An airbridge: a boxy telescopic tunnel on a wheeled leg, a rotunda at the terminal end. Terminal end at +Y."""
    B = Builder(detail, simple=True)
    L = 22.0
    cylinder(B, 0, L / 2, 0, 6.6, 2.0, '#cfd3d5', 12)
    B.box(-1.6, 1.6, -L / 2, L / 2 - 1.5, 4.6, 7.4, '#d9dcde', bottom=True)
    if detail:
        for y in range(int(-L / 2) + 1, int(L / 2) - 2, 2):
            B.box(-1.62, 1.62, y, y + .08, 4.6, 7.4, '#aeb3b6')
        ribbon(Wall(B, 'R', -1.6, 1.6, -L / 2, L / 2 - 1.5), -L / 2 + 1, L / 2 - 2, 5.5, 1.0, 2.2)
    B.box(-2.0, 2.0, -L / 2 - 2.0, -L / 2, 4.4, 7.6, '#8f979b')                                # cab
    B.box(-.35, .35, -L / 2 + 3, -L / 2 + 3.7, 0, 4.6, '#7d8285')                                # leg
    for x in (-1.2, 1.2):
        cylinder_x(B, x - .25, x + .25, -L / 2 + 3.35, .5, .5, '#1c1c1c', 10)
    return B.finish('ns_jetbridge' + ('' if detail else '_lod1'))


def hangar(detail):
    """A maintenance hangar: a curved steel roof, huge sliding doors on the front."""
    B = Builder(detail, simple=True)
    W, D, H = 70.0, 60.0, 14.0
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    B.box(x0, x1, y0, y1, 0, H, '#c4c8ca', bottom=True)
    n = 12
    arch = lambda y: [(x0 + W * i / n, y, H + 6 * math.sin(math.pi * i / n)) for i in range(n + 1)]
    for j in range(n):
        p0, p1 = arch(y0)[j], arch(y0)[j + 1]
        B.face([(p0[0], y0, p0[2]), (p1[0], y0, p1[2]), (p1[0], y1, p1[2]), (p0[0], y1, p0[2])][::-1], '#9da4a8' if j % 2 else '#a7aeb2')
    for y, flip in ((y0, False), (y1, True)):
        pts = [(x1, y, H), (x0, y, H)] + [(p[0], y, p[2]) for p in arch(y)[1:-1]][::-1] if False else [(x0, y, H)] + [(p[0], y, p[2]) for p in arch(y)[1:-1]] + [(x1, y, H)]
        B.face(pts if flip else pts[::-1], '#c4c8ca')
    f = Wall(B, 'F', x0, x1, y0, y1)
    for i in range(6):
        u = x0 + 3 + i * (W - 6) / 6
        f.box(u + .2, u + (W - 6) / 6 - .2, 0, H - 1.2, .02, .1, '#8b9397' if i % 2 else '#959da1')
    f.box(-20, 20, H - 1.0, H - .2, .02, .2, '#1f6fb5')
    return B.finish('ns_hangar' + ('' if detail else '_lod1'))


BUILDS = (bungalow, wide_house, storey, dup_modern, dup_colonial, dup_mono, dup_med, dup_pent, face_me, zinc_house, wood_house,
          school2, school1, school_gate, hospital_big, clinic, university, hotel, flats3, flats4, shops1, shops2, warehouse,
          church, mosque, bank, jet, jet_wide, terminal, control_tower, jet_bridge, hangar)


def main():
    os.makedirs(OUT, exist_ok=True)
    for ob in [o for o in bpy.data.objects if o.name.startswith('ns_')]:
        bpy.data.objects.remove(ob, do_unlink=True)
    made = []
    for i, fn in enumerate(BUILDS):
        for detail in (True, False):
            ob = fn(detail)
            export(ob, os.path.join(OUT, ob.name + '.glb'))
            ob.location = ((i % 6) * 22 - 55, (i // 6) * 26 if detail else 80, 0)
            if not detail:
                ob.hide_set(True)
            made.append(ob.name)
    print('Naija houses exported to', OUT, made)
    return made


if __name__ == '__main__':
    main()
