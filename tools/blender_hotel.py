"""Eko Grand Hotel interiors: lobby, an upper-floor corridor and five room types (standard, deluxe, executive suite,
family suite, presidential suite) ... run in Blender (Scripting > Open > Run) or headless:
python3 tools/glb_build.py -m blender_hotel"""
import sys, os
_here = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.join(os.path.expanduser('~'), 'naija-streets', 'tools')
sys.path.insert(0, _here)
from blender_houses import *          # Builder, hexc, helpers, colour constants, bpy, bmesh, math, os
import blender_houses as H

MAROON = '#6b1f2a'                   # the hotel's brand colour (the crown of the tower outside)
GOLD = '#c9a25a'; GOLD_D = '#9c7a3c'; CHROME = '#c8ccd0'; BLACK = '#1d1c1b'; BULB = '#fff4dc'; LED = '#ffe7b8'
WHITE_P = '#f4f1ea'                  # sanitary porcelain
SHEET = '#f3f0ea'


# ================================================================ small helpers
def hsh(*a):
    """Deterministic 0..1 from a few numbers (tile shading, plant leaves...)."""
    h = 2166136261
    for v in a:
        h = ((h ^ (int(round(v * 997)) & 0xffffffff)) * 16777619) & 0xffffffff
        h ^= h >> 13
    return (h % 100003) / 100003


def vary(c, k, *seed):
    return shade(c, 1 + k * (hsh(*seed) * 2 - 1))


def hq(B, x0, x1, y0, y1, z, c, sh=None):
    """A flat horizontal rectangle."""
    B.face([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], c, sh)


def disc(B, cx, cy, z, r, c, n=16, r0=0.0):
    """A flat disc (or ring when r0 > 0)."""
    for i in range(n):
        a, b = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
        if r0 > 0:
            B.face([(cx + r0 * math.cos(a), cy + r0 * math.sin(a), z), (cx + r * math.cos(a), cy + r * math.sin(a), z),
                    (cx + r * math.cos(b), cy + r * math.sin(b), z), (cx + r0 * math.cos(b), cy + r0 * math.sin(b), z)], c)
    if r0 <= 0:
        B.face([(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), z) for i in range(n)], c)


def frustum(B, cx, cy, z0, z1, r0, r1, c, n=12, cap0=False, cap1=True):
    rings = [[(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), z) for i in range(n)] for r, z in ((r0, z0), (r1, z1))]
    loft(B, rings, c, cap0, cap1)


def cyl(B, cx, cy, z0, z1, r, c, n=12, bottom=False):
    cylinder(B, cx, cy, z0, z1, r, c, n)
    if bottom:
        disc(B, cx, cy, z0, r, c, n)


def rects_minus(u0, u1, z0, z1, holes):
    """The rectangle [u0,u1]x[z0,z1] cut into pieces that avoid the holes (u0,u1,z0,z1)."""
    hs = [h for h in holes if h[0] < u1 and h[1] > u0 and h[2] < z1 and h[3] > z0]
    if not hs:
        return [(u0, u1, z0, z1)]
    us = sorted({u0, u1} | {min(u1, max(u0, h[0])) for h in hs} | {min(u1, max(u0, h[1])) for h in hs})
    out = []
    for a, b in zip(us, us[1:]):
        if b - a < 1e-4:
            continue
        m = (a + b) / 2
        cuts = sorted((max(z0, h[2]), min(z1, h[3])) for h in hs if h[0] < m < h[1])
        z = z0
        for c0, c1 in cuts:
            if c0 > z + 1e-4:
                out.append((a, b, z, c0))
            z = max(z, c1)
        if z1 > z + 1e-4:
            out.append((a, b, z, z1))
    return out


class T:
    """A local frame for a piece of furniture: front toward local -y, turned to face '-y', '+y', '-x' or '+x'."""

    def __init__(self, B, cx, cy, face='-y', z=0.0):
        self.B, self.cx, self.cy, self.f, self.z = B, cx, cy, face, z

    def p(self, x, y):
        f = self.f
        X, Y = (x, y) if f == '-y' else (-x, -y) if f == '+y' else (-y, x) if f == '+x' else (y, -x)
        return self.cx + X, self.cy + Y

    def box(self, x0, x1, y0, y1, z0, z1, c, **k):
        a, b = self.p(x0, y0), self.p(x1, y1)
        self.B.box(a[0], b[0], a[1], b[1], self.z + z0, self.z + z1, c, **k)

    def face(self, pts, c, sh=None):
        self.B.face([self.p(x, y) + (self.z + z,) for x, y, z in pts], c, sh)

    def cyl(self, x, y, z0, z1, r, c, n=10, bottom=False):
        cx, cy = self.p(x, y)
        cyl(self.B, cx, cy, self.z + z0, self.z + z1, r, c, n, bottom)

    def frustum(self, x, y, z0, z1, r0, r1, c, n=12, cap0=False, cap1=True):
        cx, cy = self.p(x, y)
        frustum(self.B, cx, cy, self.z + z0, self.z + z1, r0, r1, c, n, cap0, cap1)

    def disc(self, x, y, z, r, c, n=16):
        cx, cy = self.p(x, y)
        disc(self.B, cx, cy, self.z + z, r, c, n)

    def at(self, x, y, face=None):
        """A sub-frame at local (x, y); face is given in local terms."""
        cx, cy = self.p(x, y)
        turn = {'-y': 0, '+x': 1, '+y': 2, '-x': 3}
        names = ['-y', '+x', '+y', '-x']
        f = names[(turn[self.f] + turn[face or '-y']) % 4]
        return T(self.B, cx, cy, f, self.z)


class IW:
    """A wall of a room seen from inside. side 'F': the wall at y=pos with the room toward +y; 'B': room toward -y;
    'L': wall at x=pos, room toward +x; 'R': room toward -x. u is the global coordinate along the wall (x or y),
    o the distance into the room (the wall body is o in [-t, 0])."""

    def __init__(self, B, side, pos, t=.2):
        self.B, self.s, self.pos, self.t = B, side, pos, t
        self.facing = {'F': '+y', 'B': '-y', 'L': '+x', 'R': '-x'}[side]

    def xy(self, u, o):
        s, p = self.s, self.pos
        return (u, p + o) if s == 'F' else (u, p - o) if s == 'B' else (p + o, u) if s == 'L' else (p - o, u)

    def box(self, u0, u1, z0, z1, o0, o1, c, **k):
        a, b = self.xy(u0, o0), self.xy(u1, o1)
        self.B.box(a[0], b[0], a[1], b[1], z0, z1, c, **k)

    def face(self, u0, u1, z0, z1, o, c, sh=None):
        P = [self.xy(u0, o) + (z0,), self.xy(u1, o) + (z0,), self.xy(u1, o) + (z1,), self.xy(u0, o) + (z1,)]
        self.B.face(P, c, sh)

    def slab(self, u0, u1, z0, z1, o0, o1, c, holes=(), **k):
        for a, b, p, q in rects_minus(u0, u1, z0, z1, holes):
            self.box(a, b, p, q, o0, o1, c, **k)

    def wall(self, u0, u1, h, c, holes=()):
        self.slab(u0, u1, 0, h, -self.t, 0, c, holes)

    def paint(self, u0, u1, z0, z1, c, holes=(), grime=False):
        """Paint as faces on the wall surface (o=.004), split around holes; darker near the floor if grime."""
        for a, b, p, q in rects_minus(u0, u1, z0, z1, holes):
            sh = None
            if grime:
                g = lambda z: .9 + .1 * min(1, z / 1.2)
                sh = [g(p), g(p), g(q), g(q)]
            self.face(a, b, p, q, .004, c, sh)

    def clad(self, u0, u1, z0, z1, pw, ph, c, holes=(), o=.012, k=.05, gap=.006, stagger=True, box=False):
        """Stone or tile panels in a grid with thin shadow gaps (the wall body shows through)."""
        j, z = 0, z0
        while z < z1 - 1e-3:
            zt = min(z1, z + ph)
            sh = (pw / 2) if (stagger and j % 2) else 0
            u = u0 - sh
            i = 0
            while u < u1 - 1e-3:
                a, b = max(u0, u), min(u1, u + pw)
                for (p, q, r, t) in rects_minus(a + gap, b - gap, z + gap, zt - gap, holes):
                    if box:
                        self.box(p, q, r, t, 0, o, vary(c, k, i, j, u0 + z0))
                    else:
                        self.face(p, q, r, t, o, vary(c, k, i, j, u0 + z0))
                u += pw; i += 1
            z += ph; j += 1

    def skirting(self, u0, u1, c, holes=(), h=.12, d=.018):
        self.slab(u0, u1, 0, h, 0, d, c, [(a, b, 0, 9) for a, b, *_ in holes])

    def cornice(self, u0, u1, h, c, d=.08, hh=.14):
        self.box(u0, u1, h - hh, h, 0, d * .5, c)
        self.box(u0, u1, h - hh * .55, h, d * .5, d, c)

    def rail(self, u0, u1, z, c, holes=(), d=.03, hh=.05):
        self.slab(u0, u1, z - hh / 2, z + hh / 2, 0, d, c, [(a, b, 0, 9) for a, b, *_ in holes])

    def frame(self, u, w, h, c, z0=0.0, fw=.08, d=.03):
        """Architrave around an opening (or a closed door) of width w, height h."""
        a, b = u - w / 2, u + w / 2
        self.box(a - fw, a, z0, z0 + h, 0, d, c)
        self.box(b, b + fw, z0, z0 + h, 0, d, c)
        self.box(a - fw, b + fw, z0 + h, z0 + h + fw, 0, d, c)

    def door(self, u, w, h, c, frame_c, handle=GOLD, panels=True, plate=None, hinge=+1):
        """A closed door on the wall surface (its leaf is not in an opening, so nothing to walk through)."""
        a, b = u - w / 2, u + w / 2
        self.box(a, b, 0, h, 0, .035, c)
        self.frame(u, w, h, frame_c, 0, .09, .05)
        if panels:
            dk = shade(c, .82)
            for (p, q) in ((.18, h * .42), (h * .48, h - .18)):
                for (l, r) in ((a + .12, b - .12),):
                    self.box(l, r, p, p + .025, .035, .05, dk); self.box(l, r, q - .025, q, .035, .05, dk)
                    self.box(l, l + .025, p, q, .035, .05, dk); self.box(r - .025, r, p, q, .035, .05, dk)
        hx = b - .1 if hinge > 0 else a + .1
        self.box(hx - .03, hx + .03, .95, 1.15, .035, .05, handle)          # escutcheon
        self.box(hx - (.13 if hinge > 0 else -.01), hx + (.01 if hinge > 0 else .13), 1.04, 1.07, .05, .1, handle)   # lever
        if plate:
            pz, pw_, ph_ = plate
            self.box(u - pw_ / 2, u + pw_ / 2, pz - ph_ / 2, pz + ph_ / 2, .035, .045, GOLD)

    def picture(self, u, zc, w, h, frame_c, art, seed=0, o=0.0):
        """A framed picture: art is a list of colours for an abstract composition."""
        a, b, z0, z1 = u - w / 2, u + w / 2, zc - h / 2, zc + h / 2
        self.box(a, b, z0, z1, o, o + .03, frame_c)
        m = min(w, h) * .09
        self.box(a + .04, b - .04, z0 + .04, z1 - .04, o + .03, o + .033, '#f1ece2')        # mount
        A, Bb, Z0, Z1 = a + m, b - m, z0 + m, z1 - m
        self.box(A, Bb, Z0, Z1, o + .033, o + .036, art[0])
        for i in range(5):                                                                    # a few blocks of colour
            r = [hsh(seed, i, k) for k in range(4)]
            p, q = A + (Bb - A) * r[0] * .7, Z0 + (Z1 - Z0) * r[1] * .7
            self.box(p, min(Bb, p + (Bb - A) * (.15 + .4 * r[2])), q, min(Z1, q + (Z1 - Z0) * (.15 + .45 * r[3])), o + .036, o + .039 + .001 * i, art[1 + i % (len(art) - 1)])

    def switch(self, u, z=1.2, c='#f4f2ee'):
        self.box(u - .045, u + .045, z - .045, z + .045, 0, .012, c)
        self.box(u - .012, u + .012, z - .02, z + .02, .012, .02, shade(c, .85))

    def socket(self, u, z=.32, c='#f4f2ee'):
        self.box(u - .045, u + .045, z - .045, z + .045, 0, .012, c)
        self.box(u - .025, u + .025, z - .02, z + .02, .012, .016, shade(c, .7))

    def sconce(self, u, z, c=GOLD, shade_c='#fbeed2'):
        self.box(u - .06, u + .06, z - .12, z + .12, 0, .02, c)
        self.box(u - .015, u + .015, z - .02, z + .02, .02, .12, c)
        self.box(u - .1, u + .1, z - .02, z + .2, .08, .2, shade_c)
        self.box(u - .07, u + .07, z + .2, z + .21, .1, .18, BULB)

    def window(self, u, z0, w, h, frame='#2f2b28', night=False, seed=0, mull=2, transom=True, o=0.0):
        """A big window: the view outside (Lagos sky and towers) behind slim frames, with a sill."""
        a, b = u - w / 2, u + w / 2
        vista(self, a, b, z0, z0 + h, o + (.035 if o <= 0 else 0), night, seed)
        self.box(a - .07, b + .07, z0 - .06, z0, o, o + .07, frame)
        self.box(a - .07, b + .07, z0 + h, z0 + h + .07, o, o + .07, frame)
        self.box(a - .07, a, z0, z0 + h, o, o + .07, frame)
        self.box(b, b + .07, z0, z0 + h, o, o + .07, frame)
        for i in range(1, mull):
            x = a + w * i / mull
            self.box(x - .03, x + .03, z0, z0 + h, o, o + .06, frame)
        if transom and h > 1.8:
            self.box(a, b, z0 + h - .5, z0 + h - .45, o, o + .06, frame)
        if z0 > .3:
            self.box(a - .12, b + .12, z0 - .08, z0 - .03, o, o + .2, '#ece6dc')

    def curtains(self, u0, u1, ztop, c, sheer='#efe9de', drawn=(.35, .35), rod=GOLD, o=.12, floor=.02):
        """Curtains: heavy pleated drapes drawn to each side, a sheer behind, a rod with finials."""
        self.box(u0 - .1, u1 + .1, ztop + .02, ztop + .06, o + .02, o + .06, rod)
        for uu in (u0 - .14, u1 + .14):
            self.box(uu - .035, uu + .035, ztop, ztop + .08, o, o + .08, rod)
        for (p0, p1) in ((u0, u0 + (u1 - u0) * (drawn[0] + .12)), (u1 - (u1 - u0) * (drawn[1] + .12), u1)):
            self.box(p0, p1, floor, ztop, o - .07, o - .065, sheer)                                # sheers drawn back
        for side, frac in ((0, drawn[0]), (1, drawn[1])):
            W = (u1 - u0) * frac
            a = u0 if side == 0 else u1 - W
            n = max(3, int(W / .12))
            for i in range(n):
                p = a + W * i / n
                d = .03 if i % 2 else .09
                self.box(p, p + W / n, floor, ztop, o - .05, o - .05 + d, vary(c, .06, i, side, u0))


def vista(w, a, b, z0, z1, o, night, seed):
    """What you see through a window: a hazy Lagos sky over towers, or the city at night with lit windows."""
    if night:
        w.face(a, b, z0, z1, o - .03, '#0d1a33', [1.0, 1.0, .6, .6])
    else:
        w.face(a, b, z0, z1, o - .03, '#9cbcd6', [1.0, 1.0, .8, .8])
    u = a
    i = 0
    hz = z0 + (z1 - z0) * .18
    while u < b - .02:
        bw = .25 + .5 * hsh(seed, i, 1)
        top = hz + (z1 - z0) * (.05 + .55 * hsh(seed, i, 2) ** 1.6)
        c = (vary('#24314a', .25, seed, i) if night else vary('#6f8193', .15, seed, i))
        e = min(b, u + bw)
        w.face(u, e, z0, top, o - .025 + .001 * (i % 3), c)
        if night:
            for j in range(int((top - z0) / .09)):
                for k in range(int((e - u) / .07)):
                    if hsh(seed, i, j, k) < .22:
                        x = u + .02 + k * .07
                        zz = z0 + .04 + j * .09
                        w.face(x, x + .03, zz, zz + .04, o - .02, '#ffd56a' if hsh(i, j, k) < .7 else '#fff1c8')
        u = e + .02 + .15 * hsh(seed, i, 3)
        i += 1
    if not night:
        w.face(a, b, z0, hz, o - .022, '#5f7268')                     # lagoon / far ground in haze


# ================================================================ floors, ceilings, rooms
def tile_floor(B, x0, x1, y0, y1, size, cols, grout='#9a9184', z=0.0, k=.035, veins=None, sy=None, off=0.0):
    """Tiles with thin grout lines; cols is a list (checker / pattern by index)."""
    sy = sy or size
    hq(B, x0, x1, y0, y1, z, grout)
    g = .004
    j, y = 0, y0
    while y < y1 - 1e-3:
        i, x = 0, x0 - (off if j % 2 else 0)
        while x < x1 - 1e-3:
            a, b, c_, d = max(x0, x) + g, min(x1, x + size) - g, y + g, min(y1, y + sy) - g
            if b > a and d > c_:
                col = cols[(i + j) % len(cols)]
                hq(B, a, b, c_, d, z + .004, vary(col, k, i, j, x0))
                if veins and hsh(i, j, 7) < .35:
                    t0, t1 = hsh(i, j, 8), hsh(i, j, 9)
                    p0 = (a + (b - a) * t0, c_)
                    p1 = (b, c_ + (d - c_) * t1)
                    vw = .05
                    B.face([(p0[0], p0[1], z + .007), (p0[0] + vw, p0[1], z + .007), (p1[0], p1[1] + vw, z + .007), (p1[0], p1[1], z + .007)], shade(col, .97))
                    vw = .01
                    B.face([(p0[0] + .02, p0[1], z + .008), (p0[0] + .02 + vw, p0[1], z + .008), (p1[0], p1[1] + .02 + vw, z + .008), (p1[0], p1[1] + .02, z + .008)], shade(col, .93))
            x += size; i += 1
        y += sy; j += 1


def plank_floor(B, x0, x1, y0, y1, c, w=.19, along='x', z=0.0, k=.08):
    hq(B, x0, x1, y0, y1, z, shade(c, .7))
    if along == 'x':
        j, y = 0, y0
        while y < y1 - 1e-3:
            x = x0 - 1.4 * hsh(j, 1)
            i = 0
            while x < x1:
                L = 1.2 + .8 * hsh(i, j)
                a, b = max(x0, x) + .003, min(x1, x + L) - .003
                if b > a:
                    hq(B, a, b, y + .003, min(y1, y + w) - .003, z + .004, vary(c, k, i, j))
                x += L; i += 1
            y += w; j += 1
    else:
        j, x = 0, x0
        while x < x1 - 1e-3:
            y = y0 - 1.4 * hsh(j, 2)
            i = 0
            while y < y1:
                L = 1.2 + .8 * hsh(i, j, 3)
                a, b = max(y0, y) + .003, min(y1, y + L) - .003
                if b > a:
                    hq(B, x + .003, min(x1, x + w) - .003, a, b, z + .004, vary(c, k, i, j))
                y += L; i += 1
            x += w; j += 1


def carpet(B, x0, x1, y0, y1, c, pat=None, z=0.0, step=.6, seed=0):
    """Wall-to-wall carpet with a soft woven pattern of small motifs."""
    hq(B, x0, x1, y0, y1, z + .003, c)
    if pat:
        j, y = 0, y0 + step / 2
        while y < y1 - step / 4:
            i, x = 0, x0 + step / 2 + (step / 2 if j % 2 else 0)
            while x < x1 - step / 4:
                s = step * .14
                B.face([(x - s, y, z + .006), (x, y - s, z + .006), (x + s, y, z + .006), (x, y + s, z + .006)], pat)
                x += step; i += 1
            y += step; j += 1


def rug(B, x0, x1, y0, y1, c, border, inner=None, z=0.0, h=.015, fringe='#efe6d2', pattern=None, seed=0):
    B.box(x0, x1, y0, y1, z, z + h, border)
    m = min(x1 - x0, y1 - y0) * .08
    B.box(x0 + m, x1 - m, y0 + m, y1 - m, z + h, z + h + .002, c)
    if inner:
        m2 = m * 1.8
        for (a, b, c_, d) in [(x0 + m2, x1 - m2, y0 + m2, y0 + m2 + .04), (x0 + m2, x1 - m2, y1 - m2 - .04, y1 - m2),
                              (x0 + m2, x0 + m2 + .04, y0 + m2, y1 - m2), (x1 - m2 - .04, x1 - m2, y0 + m2, y1 - m2)]:
            hq(B, a, b, c_, d, z + h + .004, inner)
    if pattern:                                                        # a few diamonds in the field
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        for (dx, dy, s) in ((0, 0, .22), (-.3, 0, .09), (.3, 0, .09), (0, -.3, .09), (0, .3, .09)):
            px, py = cx + dx * (x1 - x0), cy + dy * (y1 - y0)
            ss = s * min(x1 - x0, y1 - y0)
            B.face([(px - ss, py, z + h + .005), (px, py - ss * .7, z + h + .005), (px + ss, py, z + h + .005), (px, py + ss * .7, z + h + .005)], pattern)
    if fringe:
        if x1 - x0 > y1 - y0:
            for xx in (x0, x1):
                hq(B, xx - .05 if xx == x0 else xx, xx if xx == x0 else xx + .05, y0 + .02, y1 - .02, z + .004, fringe)
        else:
            for yy in (y0, y1):
                hq(B, x0 + .02, x1 - .02, yy - .05 if yy == y0 else yy, yy if yy == y0 else yy + .05, z + .004, fringe)


def ceiling(B, x0, x1, y0, y1, h, c, holes=()):
    for a, b, p, q in rects_minus(x0, x1, y0, y1, holes):
        hq(B, a, b, p, q, h, c)


def downlight(B, x, y, h, r=.07, trim='#e9e6df'):
    disc(B, x, y, h - .004, r + .025, trim, 8)
    disc(B, x, y, h - .008, r, BULB, 8)


def room_shell(B, x0, x1, y0, y1, h, wallc, ceilc, holes=None, t=.2, skirt=None, cornice=None, which='FBLR', ceil_holes=()):
    """Walls (bodies outside the rectangle), ceiling, skirting and cornice. Returns the four IW walls."""
    holes = holes or {}
    if ceilc:
        ceiling(B, x0, x1, y0, y1, h, ceilc, ceil_holes)
    W = {'F': IW(B, 'F', y0, t), 'B': IW(B, 'B', y1, t), 'L': IW(B, 'L', x0, t), 'R': IW(B, 'R', x1, t)}
    span = {'F': (x0 - t, x1 + t), 'B': (x0 - t, x1 + t), 'L': (y0, y1), 'R': (y0, y1)}
    for s in which:
        w = W[s]
        u0, u1 = span[s]
        w.wall(u0, u1, h, wallc, holes.get(s, ()))
        a, b = (x0, x1) if s in 'FB' else (y0, y1)
        if skirt:
            w.skirting(a, b, skirt, holes.get(s, ()))
        if cornice:
            w.cornice(a, b, h, cornice)
    return W


def partition(B, axis, pos, a, b, h, c, holes=(), t=.14, skirt=None, cornice=None, c2=None):
    """An inner wall centred on x=pos (axis 'x') or y=pos (axis 'y') from a to b. Returns (wall facing -, wall facing +)."""
    if axis == 'x':
        wm, wp = IW(B, 'R', pos - t / 2, t), IW(B, 'L', pos + t / 2, t)
    else:
        wm, wp = IW(B, 'B', pos - t / 2, t), IW(B, 'F', pos + t / 2, t)
    wm.wall(a, b, h, c, holes)
    if c2:
        wp.paint(a, b, 0, h, c2, holes)
    for w in (wm, wp):
        if skirt:
            w.skirting(a, b, skirt, holes)
        if cornice:
            w.cornice(a, b, h, cornice)
    for hl in holes:                                                   # lintel underside of the opening
        u0, u1, z0, z1 = hl
        if z1 < h - .01:
            if axis == 'x':
                hq(B, pos - t / 2, pos + t / 2, u0, u1, z1, c)
            else:
                hq(B, u0, u1, pos - t / 2, pos + t / 2, z1, c)
    return wm, wp


def opening_trim(wm, wp, u, w, h, c, fw=.07):
    for x in (wm, wp):
        x.frame(u, w, h, c, 0, fw, .025)


# ================================================================ furniture (local frames, front toward -y)
def sofa(t, w, c, cush, d=.92, back=.86, arm=.2, legs=BLACK, pillows=(), seats=None):
    n = seats or max(1, round((w - 2 * arm) / .62))
    for x in (-w / 2 + .06, w / 2 - .06):
        for y in (-d / 2 + .06, d / 2 - .06):
            t.box(x - .03, x + .03, y - .03, y + .03, 0, .1, legs)
    t.box(-w / 2, w / 2, -d / 2, d / 2, .1, .3, c)
    t.box(-w / 2 + arm, w / 2 - arm, d / 2 - .2, d / 2, .3, back, c)
    for s in (-1, 1):
        t.box(s * w / 2 - (arm if s > 0 else 0), s * w / 2 + (arm if s < 0 else 0), -d / 2, d / 2, .1, .62, shade(c, .97))
        t.box(s * w / 2 - (arm if s > 0 else 0) - .01, s * w / 2 + (arm if s < 0 else 0) + .01, -d / 2 - .01, d / 2 + .01, .6, .64, shade(c, 1.03))
    iw = (w - 2 * arm) / n
    for i in range(n):
        a = -w / 2 + arm + i * iw
        t.box(a + .01, a + iw - .01, -d / 2 + .02, d / 2 - .2, .3, .45, vary(cush, .03, i))
        t.box(a + .02, a + iw - .02, d / 2 - .36, d / 2 - .2, .45, back - .04, vary(cush, .03, i, 1))
    for k, pc in enumerate(pillows):                                   # throw pillows (Ankara prints)
        x = -w / 2 + arm + .25 if k == 0 else w / 2 - arm - .25 if k == 1 else -w / 2 + arm + iw * (k - .5)
        pillow(t, x, d / 2 - .42, .45, pc)


def pillow(t, x, y, z, pc, s=.42):
    """A square cushion in an Ankara-style print: ground colour, two contrast bands and a centre diamond."""
    c0, c1 = pc if isinstance(pc, tuple) else (pc, shade(pc, .7))
    hgt = s * .9
    t.box(x - s / 2, x + s / 2, y - .07, y + .07, z, z + hgt, c0)
    for zz in (z + hgt * .14, z + hgt * .8):
        t.box(x - s / 2 - .001, x + s / 2 + .001, y - .072, y - .06, zz, zz + hgt * .07, c1)
    zc = z + hgt * .5
    d = s * .2
    t.face([(x - d, y - .073, zc), (x, y - .073, zc - d), (x + d, y - .073, zc), (x, y - .073, zc + d)], c1)
    t.face([(x - d * .45, y - .075, zc), (x, y - .075, zc - d * .45), (x + d * .45, y - .075, zc), (x, y - .075, zc + d * .45)], c0)


def armchair(t, c, cush, w=.85, d=.85, pillow_c=None, legs=BLACK):
    sofa(t, w, c, cush, d, .88, .17, legs, seats=1)
    if pillow_c:
        pillow(t, 0, d / 2 - .42, .45, pillow_c, .36)


def coffee_table(t, w, d, top, frame=GOLD, h=.42, glass=False):
    for x in (-w / 2 + .04, w / 2 - .04):
        for y in (-d / 2 + .04, d / 2 - .04):
            t.box(x - .02, x + .02, y - .02, y + .02, 0, h - .03, frame)
    t.box(-w / 2 + .04, w / 2 - .04, -d / 2 + .04, d / 2 - .04, .1, .12, frame)
    t.box(-w / 2, w / 2, -d / 2, d / 2, h - .03, h, top)


def round_table(t, r, top, base, h=.75, n=16):
    t.cyl(0, 0, h - .04, h, r, top, n)
    t.cyl(0, 0, .03, h - .04, .05, base, 8)
    t.cyl(0, 0, 0, .03, r * .45, base, n)


def chair(t, c, seat, h=.46, back=.95, w=.46, legs=None):
    legs = legs or c
    for x in (-w / 2 + .03, w / 2 - .03):
        for y in (-w / 2 + .03, w / 2 - .03):
            t.box(x - .02, x + .02, y - .02, y + .02, 0, h - .04, legs)
    t.box(-w / 2, w / 2, -w / 2, w / 2, h - .06, h, seat)
    t.box(-w / 2, w / 2, w / 2 - .05, w / 2, h, back, c)
    t.box(-w / 2 + .04, w / 2 - .04, w / 2 - .07, w / 2 - .05, h + .12, back - .06, seat)


def dining(t, w, d, top, legs, chair_c, seat_c, n_side=1, ends=False, h=.76):
    t.box(-w / 2, w / 2, -d / 2, d / 2, h - .04, h, top)
    t.box(-w / 2 + .05, w / 2 - .05, -d / 2 + .05, d / 2 - .05, h - .12, h - .04, shade(top, .85))
    for x in (-w / 2 + .08, w / 2 - .08):
        for y in (-d / 2 + .08, d / 2 - .08):
            t.box(x - .035, x + .035, y - .035, y + .035, 0, h - .12, legs)
    for i in range(n_side):
        x = -w / 2 + w * (i + .5) / n_side
        chair(t.at(x, -d / 2 - .22, '+y'), chair_c, seat_c)
        chair(t.at(x, d / 2 + .22, '-y'), chair_c, seat_c)
        t.box(x - .2, x + .2, -d / 2 + .06, -d / 2 + .34, h, h + .005, '#f4f1ea')          # place mats
        t.box(x - .2, x + .2, d / 2 - .34, d / 2 - .06, h, h + .005, '#f4f1ea')
        t.cyl(x, -d / 2 + .2, h + .005, h + .02, .11, '#ffffff', 10)
        t.cyl(x, d / 2 - .2, h + .005, h + .02, .11, '#ffffff', 10)
    if ends:
        chair(t.at(-w / 2 - .22, 0, '+x'), chair_c, seat_c)
        chair(t.at(w / 2 + .22, 0, '-x'), chair_c, seat_c)


def bed(t, w, l, frame, sheet, duvet, pillow_c, head, hb_h=1.25, throw=None, tufted=False, hb_w=None, euro=None, z0=0.0):
    """A made bed; head (headboard) at local +y, foot toward -y."""
    hb_w = hb_w or w + .3
    t.box(-w / 2, w / 2, -l / 2, l / 2, z0 + .08, z0 + .32, frame)
    t.box(-w / 2 + .05, w / 2 - .05, -l / 2 + .05, l / 2 - .05, z0, z0 + .08, BLACK)
    t.box(-w / 2 + .02, w / 2 - .02, -l / 2 + .02, l / 2, z0 + .32, z0 + .56, sheet)                     # mattress
    t.box(-w / 2 - .04, w / 2 + .04, -l / 2 - .04, l / 2 - .62, z0 + .28, z0 + .6, duvet)                 # duvet, folded back
    t.box(-w / 2 - .04, w / 2 + .04, l / 2 - .78, l / 2 - .62, z0 + .3, z0 + .63, shade(duvet, 1.04))
    if throw:
        t.box(-w / 2 - .06, w / 2 + .06, -l / 2 + .15, -l / 2 + .7, z0 + .26, z0 + .62, throw)
        t.box(-w / 2 - .06, w / 2 + .06, -l / 2 + .15, -l / 2 + .2, z0 + .26, z0 + .625, shade(throw, .75))
    np = 2 if w > 1.3 else 1
    for i in range(np):
        x = -w / 2 + w * (i + .5) / np
        pw = w / np - .1
        t.box(x - pw / 2, x + pw / 2, l / 2 - .58, l / 2 - .1, z0 + .56, z0 + .72, pillow_c)
        t.box(x - pw / 2 + .03, x + pw / 2 - .03, l / 2 - .28, l / 2 - .06, z0 + .6, z0 + .95, shade(pillow_c, .98))
        if euro:
            pillow(t, x, l / 2 - .5, z0 + .62, euro, .38)
    t.box(-hb_w / 2, hb_w / 2, l / 2, l / 2 + .1, z0, z0 + hb_h, head)
    if tufted:
        dk = shade(head, .72)
        for j in range(int((hb_h - .5) / .18)):
            for i in range(int(hb_w / .18)):
                x = -hb_w / 2 + .09 + i * .18 + (.09 if j % 2 else 0)
                if x < hb_w / 2 - .05:
                    t.box(x - .015, x + .015, l / 2 - .006, l / 2, z0 + .6 + j * .18, z0 + .63 + j * .18, dk)
    else:
        for i in range(int(hb_w / .3)):                                                                 # channel stitching
            x = -hb_w / 2 + .15 + i * .3
            t.box(x - .01, x + .01, l / 2 - .006, l / 2, z0 + .45, z0 + hb_h - .08, shade(head, .8))
    t.box(-hb_w / 2 - .02, hb_w / 2 + .02, l / 2 - .02, l / 2 + .12, z0 + hb_h, z0 + hb_h + .04, frame)


def nightstand(t, c, lamp_c='#f6ead2', base=GOLD, w=.5, d=.42, h=.55, lamp=True):
    t.box(-w / 2, w / 2, -d / 2, d / 2, .05, h, c)
    for x in (-w / 2 + .03, w / 2 - .03):
        t.box(x - .015, x + .015, -d / 2 + .02, -d / 2 + .05, 0, .05, BLACK)
    t.box(-w / 2 + .03, w / 2 - .03, -d / 2 - .005, -d / 2, h - .2, h - .19, shade(c, .7))
    t.box(-.06, .06, -d / 2 - .02, -d / 2, h - .12, h - .1, base)
    if lamp:
        t.cyl(0, .02, h, h + .03, .08, base, 8)
        t.cyl(0, .02, h + .03, h + .32, .02, base, 6)
        t.frustum(0, .02, h + .28, h + .5, .17, .12, lamp_c, 10, True, True)
        t.disc(0, .02, h + .279, .15, BULB, 10)


def wardrobe(t, w, c, h=2.3, d=.6, handle=GOLD, doors=None):
    t.box(-w / 2, w / 2, -d / 2, d / 2, 0, h, c)
    t.box(-w / 2, w / 2, -d / 2 + .04, d / 2, 0, .08, shade(c, .6))
    n = doors or max(2, round(w / .5))
    for i in range(n):
        a = -w / 2 + w * i / n
        t.box(a + .006, a + w / n - .006, -d / 2 - .02, -d / 2, .1, h - .04, vary(c, .03, i))
        hx = a + w / n - .06 if i % 2 == 0 else a + .06
        t.box(hx - .012, hx + .012, -d / 2 - .05, -d / 2 - .02, 1.0, 1.35, handle)


def desk(t, w, top, legs, d=.6, h=.76, chair_c=None, seat_c=None, lamp=True):
    t.box(-w / 2, w / 2, -d / 2, d / 2, h - .04, h, top)
    t.box(-w / 2, -w / 2 + .04, -d / 2 + .03, d / 2 - .03, 0, h - .04, legs)
    t.box(w / 2 - .45, w / 2, -d / 2 + .03, d / 2 - .03, 0, h - .04, top)                     # drawer pedestal
    for z in (.25, .5):
        t.box(w / 2 - .43, w / 2 - .02, -d / 2 + .025, -d / 2 + .03, z - .005, z, shade(top, .6))
        t.box(w / 2 - .26, w / 2 - .18, -d / 2, -d / 2 + .03, z + .1, z + .12, GOLD)
    t.box(-w / 2 + .1, -w / 2 + .5, -d / 2 + .15, d / 2 - .15, h, h + .02, '#2a2a2c')        # leather blotter
    if lamp:
        t.cyl(w / 2 - .2, d / 2 - .15, h, h + .02, .07, GOLD, 8)
        t.box(w / 2 - .21, w / 2 - .19, d / 2 - .16, d / 2 - .14, h + .02, h + .42, GOLD)
        t.box(w / 2 - .3, w / 2 - .1, d / 2 - .3, d / 2 - .12, h + .38, h + .46, '#2e5a52')
        t.box(w / 2 - .29, w / 2 - .11, d / 2 - .29, d / 2 - .13, h + .375, h + .38, BULB)
    if chair_c:
        office_chair(t.at(0, -d / 2 - .1, '+y'), chair_c, seat_c or chair_c)


def office_chair(t, c, seat):
    t.cyl(0, 0, 0, .04, .28, BLACK, 5)
    t.cyl(0, 0, .04, .42, .03, CHROME, 6)
    t.box(-.25, .25, -.24, .22, .42, .52, seat)
    t.box(-.24, .24, .2, .28, .5, 1.05, c)
    for s in (-1, 1):
        t.box(s * .27 - .03, s * .27 + .03, -.15, .15, .62, .66, BLACK)
        t.box(s * .27 - .015, s * .27 + .015, .0, .03, .5, .62, BLACK)


def tv_console(t, w, c, h=.5, d=.42, top=None):
    t.box(-w / 2, w / 2, -d / 2, d / 2, .08, h, c)
    if top:
        t.box(-w / 2 - .01, w / 2 + .01, -d / 2 - .01, d / 2 + .01, h - .03, h, top)
    n = max(2, round(w / .5))
    for i in range(n):
        a = -w / 2 + w * i / n
        t.box(a + .008, a + w / n - .008, -d / 2 - .015, -d / 2, .12, h - .05, vary(c, .05, i, 3))
        t.box(a + w / n / 2 - .06, a + w / n / 2 + .06, -d / 2 - .03, -d / 2 - .015, h - .12, h - .1, GOLD)
    for x in (-w / 2 + .05, w / 2 - .05):
        t.box(x - .02, x + .02, -d / 2 + .05, -d / 2 + .09, 0, .08, BLACK)


def tv(w_, u, zc, size=1.25, o=0.0):
    """A flat TV on a wall: thin black bezel, dark screen with a faint sheen."""
    a, b = u - size / 2, u + size / 2
    hh = size * .5625
    w_.box(a, b, zc - hh / 2, zc + hh / 2, o, o + .05, '#121212')
    w_.face(a + .02, b - .02, zc - hh / 2 + .02, zc + hh / 2 - .02, o + .052, '#1b2430', [1, .9, 1.25, 1.35])
    w_.box(u - .03, u + .03, zc - hh / 2 - .015, zc - hh / 2 + .005, o + .05, o + .055, '#59e07a')


def split_ac(w_, u, z=2.45, wd=.95):
    w_.box(u - wd / 2, u + wd / 2, z - .3, z, 0, .22, '#f3f3f0')
    w_.box(u - wd / 2 + .03, u + wd / 2 - .03, z - .3, z - .26, .2, .23, '#d8d9d6')
    for i in range(4):
        w_.box(u - wd / 2 + .06, u + wd / 2 - .06, z - .28 + i * .008, z - .275 + i * .008, .225, .23, '#b9bbb8')
    w_.box(u + wd / 2 - .15, u + wd / 2 - .1, z - .12, z - .1, .22, .225, '#3fd7ff')
    w_.box(u + wd / 2 - .12, u + wd / 2 - .1, 0.3, z - .3, .0, .03, '#eeeeea')                          # pipe trunking down


def plant(B, x, y, h, pot='#3b3633', r=.28, kind='palm', seed=0, z=0.0):
    """A potted plant: a pot, soil, and leaves fanned out around the stem."""
    frustum(B, x, y, z, z + r * 1.6, r * .75, r, pot, 10, False, False)
    B.box(x - r, x + r, y - r, y + r, z + r * 1.6, z + r * 1.6 + .001, pot) if False else None
    disc(B, x, y, z + r * 1.5, r * .95, '#3a2a1e', 10)
    ring = [(x + r * math.cos(2 * math.pi * i / 10), y + r * math.sin(2 * math.pi * i / 10), z + r * 1.6) for i in range(10)]
    ring2 = [(x + (r + .03) * math.cos(2 * math.pi * i / 10), y + (r + .03) * math.sin(2 * math.pi * i / 10), z + r * 1.6) for i in range(10)]
    for i in range(10):
        B.face([ring[i], ring2[i], ring2[(i + 1) % 10], ring[(i + 1) % 10]], shade(pot, 1.15))
    zb = z + r * 1.5
    greens = ['#3f6b35', '#4c7a3a', '#2f5a2c', '#5b8a43', '#386433']
    if kind == 'palm':                                                    # long arching fronds from a few stems
        n = 11
        for i in range(n):
            a = 2 * math.pi * (i + hsh(seed, i) * .5) / n
            L = h * (.32 + .22 * hsh(seed, i, 1))
            up = h * (.5 + .4 * hsh(seed, i, 2))
            ca, sa = math.cos(a), math.sin(a)
            base = (x + ca * .03, y + sa * .03, zb)
            mid = (x + ca * L * .45, y + sa * L * .45, zb + up)
            tip = (x + ca * L, y + sa * L, zb + up * .72)
            B.face([base, (base[0] + ca * .01 - sa * .02, base[1] + sa * .01 + ca * .02, base[2]), mid, (base[0] + ca * .01 + sa * .02, base[1] + sa * .01 - ca * .02, base[2])], '#5a6e34')
            wdt = L * .22
            for s in (-1, 1):
                p1 = (mid[0] - sa * wdt * s, mid[1] + ca * wdt * s, mid[2] - .06)
                B.face([(base[0], base[1], base[2] + up * .2), mid, tip], greens[i % 5])
                B.face([(base[0], base[1], base[2] + up * .2), p1, tip, mid], shade(greens[(i + 2) % 5], .95 + .1 * s))
    else:                                                                 # broad-leaf bush (rubber plant / ficus)
        cyl(B, x, y, zb, zb + h * .6, .025, '#5b4630', 5)
        for j in range(26):
            a = 2 * math.pi * hsh(seed, j, 4)
            zz = zb + h * (.25 + .75 * hsh(seed, j, 5))
            rr = .08 + h * .28 * hsh(seed, j, 6)
            cx, cy = x + rr * math.cos(a), y + rr * math.sin(a)
            L = .18 + .1 * hsh(seed, j, 7)
            ca, sa = math.cos(a), math.sin(a)
            B.face([(cx, cy, zz), (cx + ca * L * .5 - sa * L * .25, cy + sa * L * .5 + ca * L * .25, zz + .04),
                    (cx + ca * L, cy + sa * L, zz - .02), (cx + ca * L * .5 + sa * L * .25, cy + sa * L * .5 - ca * L * .25, zz + .02)], greens[j % 5])


def blossom(B, x, y, z, s, c):
    """A small round flower head (octahedron), lighter on top."""
    P = [(x + s, y, z), (x, y + s, z), (x - s, y, z), (x, y - s, z)]
    top, bot = (x, y, z + s * .8), (x, y, z - s * .8)
    for i in range(4):
        B.face([P[i], P[(i + 1) % 4], top], shade(c, 1.08))
        B.face([P[(i + 1) % 4], P[i], bot], shade(c, .8))


def flowers(B, x, y, z, r=.25, vase=GOLD, cols=('#c8102e', '#f3e7d3', '#e8a33c', '#d65b8f', '#ffffff'), seed=0, h=.6):
    """A vase with a domed bouquet: leaves fanned out underneath, round flower heads on top."""
    frustum(B, x, y, z, z + h * .45, r * .35, r * .5, vase, 12, True, False)
    frustum(B, x, y, z + h * .45, z + h * .55, r * .5, r * .38, vase, 12, False, False)
    zt = z + h * .55
    for j in range(10):                                                   # leaves
        a = 2 * math.pi * (j + hsh(seed, j, 5) * .4) / 10
        ca, sa = math.cos(a), math.sin(a)
        L = r * (1.1 + .3 * hsh(seed, j, 6))
        B.face([(x, y, zt + r * .1), (x + ca * L * .5 - sa * L * .2, y + sa * L * .5 + ca * L * .2, zt + r * .35),
                (x + ca * L, y + sa * L, zt + r * .05), (x + ca * L * .5 + sa * L * .2, y + sa * L * .5 - ca * L * .2, zt + r * .2)],
               ['#3f6b35', '#2f5a2c', '#4c7a3a'][j % 3])
    n = int(30 * max(1, (r / .3) ** 1.5))
    for j in range(n):
        a = 2 * math.pi * hsh(seed, j)
        e = math.pi / 2 * (.12 + .88 * hsh(seed, j, 1) ** .7)
        rr = r * (.75 + .2 * hsh(seed, j, 2))
        cx, cy, cz = x + rr * math.cos(a) * math.cos(e), y + rr * math.sin(a) * math.cos(e), zt + r * .2 + rr * math.sin(e) * 1.05
        blossom(B, cx, cy, cz, (.035 + .025 * hsh(seed, j, 3)) * max(1, r / .3) ** .5, cols[j % len(cols)])


def luggage_rack(t, c='#6b4a2e', strap=MAROON):
    for x in (-.32, .32):
        t.box(x - .02, x + .02, -.22, -.18, 0, .5, c)
        t.box(x - .02, x + .02, .18, .22, 0, .5, c)
        t.box(x - .02, x + .02, -.22, .22, .45, .5, c)
    for y in (-.12, 0, .12):
        t.box(-.36, .36, y - .025, y + .025, .5, .51, strap)


def suitcase(t, c, w=.45, d=.26, h=.68):
    t.box(-w / 2, w / 2, -d / 2, d / 2, .04, .04 + h, c)
    for x in (-w / 2 + .05, w / 2 - .05):
        t.cyl(x, d / 2 - .04, 0, .04, .03, BLACK, 6)
        t.box(x - .01, x + .01, d / 2 - .02, d / 2, .04, .04 + h, shade(c, .8))
    t.box(-.12, .12, -.02, .02, .04 + h, .04 + h + .2, '#3a3a3a')
    t.box(-.1, .1, -.015, .015, .04 + h + .18, .04 + h + .21, '#3a3a3a')


def minibar(t, c='#3b2a1f'):
    t.box(-.3, .3, -.28, .28, 0, .9, c)
    t.box(-.27, .27, -.3, -.28, .05, .85, '#1d1d1d')
    t.box(.2, .23, -.32, -.3, .3, .65, CHROME)
    t.box(-.3, .3, -.3, .28, .9, .93, shade(c, 1.2))
    for i, col in enumerate(('#2e7d32', '#c62828', '#f9a825', '#f2f2f2')):                    # bottles / kettle on top
        t.cyl(-.2 + i * .1, .05, .93, 1.12 if i < 2 else 1.05, .03, col, 6)


def mirror(w_, u, zc, wd, ht, frame=GOLD, glass='#c6d2d6', o=0.0):
    w_.box(u - wd / 2 - .05, u + wd / 2 + .05, zc - ht / 2 - .05, zc + ht / 2 + .05, o, o + .03, frame)
    w_.face(u - wd / 2, u + wd / 2, zc - ht / 2, zc + ht / 2, o + .032, glass, [.92, .95, 1.1, 1.05])
    for i in range(3):                                                                         # reflection streaks
        p = u - wd / 2 + wd * (.2 + .25 * i)
        w_.face(p, p + wd * .05, zc - ht / 2 + ht * .1, zc + ht / 2 - ht * .1, o + .034, shade(glass, 1.08))


def chandelier(B, x, y, ztop, drop=1.4, r=1.0, tiers=2, metal=GOLD, crystal='#f6f2e6', n=12):
    """A crystal chandelier: rod, rings of arms with candle bulbs and hanging crystal drops."""
    cyl(B, x, y, ztop - .08, ztop, .18, metal, 10, bottom=True)
    cyl(B, x, y, ztop - drop + .2, ztop - .08, .025, metal, 6)
    zc = ztop - drop
    frustum(B, x, y, zc - .25, zc + .2, .05, .18, metal, 10, True, True)
    for k in range(tiers):
        rr = r * (1 - .38 * k)
        zz = zc + .35 * k
        nn = max(6, n - 4 * k)
        pts = [(x + rr * math.cos(2 * math.pi * i / nn), y + rr * math.sin(2 * math.pi * i / nn)) for i in range(nn)]
        for i in range(nn):
            (ax, ay), (bx, by) = pts[i], pts[(i + 1) % nn]
            B.face([(ax, ay, zz), (bx, by, zz), (bx, by, zz + .04), (ax, ay, zz + .04)], metal)
            B.face([(x, y, zz - .02), (ax, ay, zz), (ax, ay, zz + .03)], metal)          # arm
            B.box(ax - .03, ax + .03, ay - .03, ay + .03, zz + .04, zz + .07, metal)
            B.box(ax - .016, ax + .016, ay - .016, ay + .016, zz + .07, zz + .18, '#fffaf0')
            B.box(ax - .025, ax + .025, ay - .025, ay + .025, zz + .18, zz + .24, BULB)
            mx, my = (ax + bx) / 2, (ay + by) / 2
            L = .22 + .14 * (i % 2)
            B.face([(mx, my, zz), (mx, my, zz - L), (mx + .01, my + .01, zz - L), (mx + .01, my + .01, zz)], '#e8e2d2')
            B.box(mx - .022, mx + .022, my - .022, my + .022, zz - L - .07, zz - L, crystal, bottom=True)
    for k in range(5):                                                   # the crystal body round the stem
        r0 = r * (.14 + .1 * math.sin(math.pi * k / 4))
        frustum(B, x, y, zc - .45 + k * .18, zc - .27 + k * .18, r0, r0 * .85, shade(crystal, 1 - .04 * (k % 2)), 10, k == 0, False)
    # cascading crystal strands under the centre
    for i in range(10):
        a = 2 * math.pi * i / 10
        px, py = x + .3 * r * math.cos(a), y + .3 * r * math.sin(a)
        B.face([(px, py, zc - .05), (px, py, zc - .6), (px + .01, py, zc - .6), (px + .01, py, zc - .05)], '#e8e2d2')
        B.box(px - .025, px + .025, py - .025, py + .025, zc - .68, zc - .6, crystal, bottom=True)


def pendant(B, x, y, ztop, drop, r=.25, c=GOLD, glow=BULB):
    cyl(B, x, y, ztop - drop + .2, ztop, .008, BLACK, 4)
    frustum(B, x, y, ztop - drop, ztop - drop + .22, r, .05, c, 12, False, True)
    disc(B, x, y, ztop - drop + .01, r * .9, glow, 12)


def ceiling_fan(B, x, y, h, c='#e9e5dc'):
    cyl(B, x, y, h - .3, h, .025, c, 6)
    cyl(B, x, y, h - .45, h - .3, .12, c, 10, bottom=True)
    for i in range(3):
        a = 2 * math.pi * i / 3
        ca, sa = math.cos(a), math.sin(a)
        B.face([(x + ca * .12 - sa * .07, y + sa * .12 + ca * .07, h - .4), (x + ca * .75 - sa * .08, y + sa * .75 + ca * .08, h - .42),
                (x + ca * .75 + sa * .08, y + sa * .75 - ca * .08, h - .42), (x + ca * .12 + sa * .07, y + sa * .12 - ca * .07, h - .4)], '#6b4a2e')


# ---- bathroom
def toilet(t, c=WHITE_P):
    t.box(-.12, .12, -.1, .25, 0, .3, c)                                   # pedestal
    t.frustum(0, -.05, .28, .4, .17, .2, c, 12, False, False)             # bowl
    t.frustum(0, -.05, .4, .42, .2, .2, '#ebe7df', 12, False, True)       # seat + lid closed
    t.box(-.2, .2, .2, .38, .38, .8, c)                                    # cistern
    t.box(-.21, .21, .19, .39, .8, .83, shade(c, .97))
    t.box(-.03, .03, .26, .3, .83, .84, CHROME)


def vanity(t, w, cab, top, sinks=1, d=.55, h=.86, basin=WHITE_P, tap=CHROME):
    t.box(-w / 2, w / 2, -d / 2 + .02, d / 2, .15, h - .04, cab)
    t.box(-w / 2 + .03, w / 2 - .03, -d / 2 + .05, d / 2, 0, .15, shade(cab, .5))
    n = max(2, round(w / .5))
    for i in range(n):
        a = -w / 2 + w * i / n
        t.box(a + .006, a + w / n - .006, -d / 2, -d / 2 + .02, .18, h - .08, vary(cab, .04, i, 9))
        t.box(a + w / n / 2 - .07, a + w / n / 2 + .07, -d / 2 - .02, -d / 2, h - .16, h - .14, GOLD)
    t.box(-w / 2 - .02, w / 2 + .02, -d / 2 - .02, d / 2, h - .04, h, top)
    for i in range(sinks):
        x = -w / 2 + w * (i + .5) / sinks
        t.frustum(x, -.02, h, h + .14, .14, .2, basin, 12, True, False)        # vessel basin
        t.disc(x, -.02, h + .03, .17, shade(basin, .9), 12)
        t.box(x - .015, x + .015, d / 2 - .12, d / 2 - .08, h, h + .28, tap)
        t.box(x - .015, x + .015, d / 2 - .26, d / 2 - .08, h + .25, h + .28, tap)
        t.box(x + .06, x + .1, d / 2 - .12, d / 2 - .08, h, h + .06, tap)
    # amenities tray + folded towels
    t.box(w / 2 - .32, w / 2 - .06, -.15, .1, h, h + .01, '#2b2b2b')
    for k, col in enumerate(('#f2ece0', '#c9a25a', '#7a4b8c')):
        t.cyl(w / 2 - .27 + k * .08, 0, h + .01, h + .12, .025, col, 6)


def towel_rail(w_, u0, u1, z, cols=('#ffffff', '#efe9dd')):
    w_.box(u0, u1, z - .015, z + .015, .08, .11, CHROME)
    for u in (u0, u1):
        w_.box(u - .015, u + .015, z - .02, z + .02, 0, .11, CHROME)
    n = max(1, int((u1 - u0) / .5))
    for i in range(n):
        a = u0 + .04 + (u1 - u0 - .08) * i / n
        b = a + (u1 - u0 - .08) / n - .03
        c = cols[i % len(cols)]
        w_.box(a, b, z - .55, z + .02, .05, .08, c)
        w_.box(a, b, z - .35, z + .02, .11, .14, shade(c, .96))
        w_.box(a, b, z - .56, z - .5, .05, .085, shade(c, .9))


def shower(B, x0, x1, y0, y1, wall_tile, tray='#e9e6e0', glass_side=None, screen=CHROME, rain=False, wall_ws=None):
    """A walk-in shower: low tray, a glass screen on one side drawn as a chrome frame with a frosted band,
    a mixer and a shower head on the wall named by wall_ws (an IW)."""
    B.box(x0, x1, y0, y1, 0, .05, tray)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    B.box(cx - .08, cx + .08, cy - .08, cy + .08, .05, .052, '#9a9a9a')
    if glass_side:                                                       # (axis, pos, a, b) see frame_glass
        frame_glass(B, *glass_side, h=2.0, c=screen)
    if wall_ws:
        w_, u = wall_ws
        w_.box(u - .06, u + .06, 1.0, 1.15, 0, .05, CHROME)
        w_.box(u - .015, u + .015, 1.15, 2.1, .03, .06, CHROME)
        w_.box(u - .015, u + .015, 2.08, 2.12, .03, .32, CHROME)
        if rain:
            w_.box(u - .17, u + .17, 2.06, 2.1, .2, .54, CHROME, bottom=True)
            w_.box(u - .14, u + .14, 2.055, 2.06, .23, .51, '#8e9599', bottom=True)
        else:
            w_.box(u - .09, u + .09, 2.02, 2.08, .24, .38, CHROME, bottom=True)
        w_.box(u + .25, u + .55, 1.25, 1.55, 0, .04, '#d8d2c6')                      # niche with bottles
        for k, col in enumerate(('#2b2b2b', '#c9a25a', '#f2ece0')):
            w_.box(u + .29 + k * .09, u + .35 + k * .09, 1.27, 1.45, .04, .1, col)


def frame_glass(B, axis, pos, a, b, h=2.0, c=CHROME, frost='#e6eef0'):
    """A glass screen drawn by its frame and a frosted band (glass itself is left open; no transparency)."""
    if axis == 'x':                         # screen runs along x at y=pos
        B.box(a, b, pos - .015, pos + .015, 0, .04, c)
        B.box(a, b, pos - .015, pos + .015, h - .03, h, c, bottom=True)
        B.box(a, a + .03, pos - .015, pos + .015, 0, h, c)
        B.box(b - .03, b, pos - .015, pos + .015, 0, h, c)
        B.box(a, b, pos - .004, pos + .004, 1.0, 1.5, frost)
        B.face([(a + .03, pos, .04), (b - .03, pos, .04), (b - .03, pos, h - .03), (a + .03, pos, h - .03)], '#dfeaee') if False else None
    else:                                   # along y at x=pos
        B.box(pos - .015, pos + .015, a, b, 0, .04, c)
        B.box(pos - .015, pos + .015, a, b, h - .03, h, c, bottom=True)
        B.box(pos - .015, pos + .015, a, a + .03, 0, h, c)
        B.box(pos - .015, pos + .015, b - .03, b, 0, h, c)
        B.box(pos - .004, pos + .004, a, b, 1.0, 1.5, frost)


def bathtub(t, w=1.7, d=.78, c=WHITE_P, h=.58, tap=CHROME, apron=None):
    """A built-in bath: apron, rim walls round an open top, water inside, a mixer at one end."""
    apron = apron or c
    t.box(-w / 2 + .1, w / 2 - .1, -d / 2 + .08, d / 2 - .08, 0, h - .32, apron)
    for (a, b, c_, e, col) in ((-w / 2, w / 2, -d / 2, -d / 2 + .08, apron), (-w / 2, w / 2, d / 2 - .08, d / 2, apron),
                               (-w / 2, -w / 2 + .1, -d / 2, d / 2, apron), (w / 2 - .1, w / 2, -d / 2, d / 2, apron)):
        t.box(a, b, c_, e, 0, h - .03, col)
    for (a, b, c_, e) in ((-w / 2, w / 2, -d / 2, -d / 2 + .08), (-w / 2, w / 2, d / 2 - .08, d / 2), (-w / 2, -w / 2 + .1, -d / 2, d / 2), (w / 2 - .1, w / 2, -d / 2, d / 2)):
        t.box(a - .005, b + .005, c_ - .005, e + .005, h - .03, h, c)
    t.box(-w / 2 + .1, w / 2 - .1, -d / 2 + .08, d / 2 - .08, h - .32, h - .14, '#9ec3cc')      # water
    t.box(-w / 2 + .02, -w / 2 + .05, -.03, .03, h, h + .25, tap)
    t.box(-w / 2 + .02, -w / 2 + .22, -.03, .03, h + .22, h + .25, tap)


def bath_mat(B, x0, x1, y0, y1, c='#f2eee6'):
    B.box(x0, x1, y0, y1, 0, .012, c)


def wall_tiles(w_, u0, u1, z0, z1, pw, ph, c, holes=(), k=.04, stagger=False):
    w_.clad(u0, u1, z0, z1, pw, ph, c, holes, o=.008, k=k, gap=.003, stagger=stagger)


# ---- kitchen
def base_units(t, w, carc, front, top, h=.9, d=.6, handle=CHROME, sink_at=None, hob_at=None):
    t.box(-w / 2, w / 2, -d / 2 + .05, d / 2, 0, .1, shade(carc, .4))
    t.box(-w / 2, w / 2, -d / 2 + .02, d / 2, .1, h - .04, carc)
    n = max(1, round(w / .6))
    for i in range(n):
        a = -w / 2 + w * i / n
        t.box(a + .005, a + w / n - .005, -d / 2, -d / 2 + .02, .12, h - .06, vary(front, .03, i, 11))
        t.box(a + .06, a + w / n - .06, -d / 2 - .025, -d / 2, h - .14, h - .12, handle)
    t.box(-w / 2 - .02, w / 2, -d / 2 - .03, d / 2, h - .04, h, top)
    if sink_at is not None:
        x = sink_at
        t.box(x - .3, x + .3, -d / 2 + .08, d / 2 - .1, h, h + .005, '#b8bcbf')
        t.box(x - .26, x - .01, -d / 2 + .12, d / 2 - .14, h + .005, h + .006, '#7e8488')
        t.box(x + .01, x + .26, -d / 2 + .12, d / 2 - .14, h + .005, h + .006, '#7e8488')
        t.box(x - .015, x + .015, d / 2 - .08, d / 2 - .05, h, h + .35, CHROME)
        t.box(x - .015, x + .015, d / 2 - .3, d / 2 - .05, h + .33, h + .36, CHROME)
    if hob_at is not None:
        x = hob_at
        t.box(x - .3, x + .3, -d / 2 + .05, d / 2 - .05, h, h + .008, '#151515')
        for dx in (-.14, .14):
            for dy in (-.12, .12):
                t.disc(x + dx, dy, h + .009, .075 if dx < 0 else .09, '#3a3a3a', 10)
                t.disc(x + dx, dy, h + .01, .03, '#555555', 8)
        t.box(x - .3, x + .3, -d / 2 - .01, -d / 2, .15, h - .2, '#1b1b1b')            # oven door
        t.box(x - .22, x + .22, -d / 2 - .012, -d / 2 - .01, .25, h - .32, '#3d3330')
        t.box(x - .25, x + .25, -d / 2 - .04, -d / 2 - .01, h - .24, h - .22, CHROME)
        for k in range(4):
            t.cyl(x - .2 + k * .13, -d / 2 - .01, h - .12, h - .1, .02, CHROME, 6) if False else t.box(x - .21 + k * .13, x - .19 + k * .13, -d / 2 - .03, -d / 2, h - .13, h - .09, CHROME)


def wall_units(t, w, front, z0=1.45, h=.75, d=.35, handle=CHROME, glass=None):
    t.box(-w / 2, w / 2, -d / 2 + .02, d / 2, z0, z0 + h, shade(front, .9), bottom=True)
    n = max(1, round(w / .6))
    for i in range(n):
        a = -w / 2 + w * i / n
        c = glass if (glass and i % 3 == 1) else vary(front, .03, i, 12)
        t.box(a + .005, a + w / n - .005, -d / 2, -d / 2 + .02, z0 + .01, z0 + h - .01, c, bottom=True)
        t.box(a + .06, a + w / n - .06, -d / 2 - .025, -d / 2, z0 + .04, z0 + .06, handle)
    t.box(-w / 2 + .02, w / 2 - .02, -d / 2 + .05, d / 2 - .02, z0 - .006, z0 - .004, LED, bottom=True)   # under-cabinet light


def hood(t, w=.6, z0=1.5, c='#b8bcbf', top=3.0):
    t.box(-w / 2, w / 2, -.25, .25, z0, z0 + .08, c, bottom=True)
    t.box(-w / 2 + .03, w / 2 - .03, -.22, .22, z0 - .002, z0, '#6a6e72', bottom=True)
    t.frustum(0, .05, z0 + .08, z0 + .3, .25, .13, c, 4, False, False)
    t.box(-.13, .13, -.08, .18, z0 + .3, top, c)


def fridge(t, c='#c9ccce', w=.7, d=.68, h=1.85):
    t.box(-w / 2, w / 2, -d / 2 + .04, d / 2, 0, h, c)
    t.box(-w / 2 + .005, w / 2 - .005, -d / 2, -d / 2 + .04, .05, h * .62, shade(c, .97))
    t.box(-w / 2 + .005, w / 2 - .005, -d / 2, -d / 2 + .04, h * .63, h - .01, shade(c, .97))
    for (z0, z1) in ((h * .35, h * .58), (h * .67, h * .8)):
        t.box(-w / 2 + .05, -w / 2 + .08, -d / 2 - .05, -d / 2, z0, z1, CHROME)
    t.box(.08, .26, -d / 2 - .003, -d / 2, h * .66, h * .75, '#2a3e4a')


def microwave(t, c='#2a2a2a'):
    t.box(-.25, .25, -.18, .18, 0, .3, c)
    t.box(-.23, .1, -.185, -.18, .03, .27, '#111111')
    t.box(.13, .23, -.185, -.18, .16, .24, '#39e26c')


def kettle(t, c=CHROME):
    t.cyl(0, 0, 0, .02, .09, BLACK, 8)
    t.frustum(0, 0, .02, .22, .09, .07, c, 8)
    t.box(.07, .09, -.015, .015, .06, .2, BLACK)


def fruit_bowl(B, x, y, z):
    frustum(B, x, y, z, z + .08, .08, .16, '#e9e3d6', 10, True, False)
    for i, col in enumerate(('#e8b23a', '#d64a2c', '#7aa640', '#e8b23a', '#f0d24a')):
        a = 2 * math.pi * i / 5
        B.box(x + .07 * math.cos(a) - .04, x + .07 * math.cos(a) + .04, y + .07 * math.sin(a) - .04, y + .07 * math.sin(a) + .04, z + .06, z + .13, col)


# ---- lifts and signs
def lift_doors(w_, u, metal=GOLD, frame='#2a2523', h=2.4, wd=1.2, indicator=True):
    a, b = u - wd / 2, u + wd / 2
    w_.box(a - .18, b + .18, 0, h + .18, 0, .06, frame)                                # surround
    w_.face(a, u - .004, 0, h, .062, metal, [.92, .92, 1.08, 1.08])
    w_.face(u + .004, b, 0, h, .062, shade(metal, 1.03), [.92, .92, 1.08, 1.08])
    w_.box(u - .004, u + .004, 0, h, .055, .062, '#1c1a18')
    for p in (a + .1, u + .1):                                                         # etched pattern lines
        for z in (.4, 1.2, 2.0):
            w_.face(p, p + wd / 2 - .2, z, z + .01, .064, shade(metal, .78))
    w_.box(a - .2, b + .2, 0, .02, -.05, .25, '#bfc3c4')                               # sill plate
    if indicator:
        w_.box(u - .3, u + .3, h + .28, h + .5, 0, .04, '#121212')
        w_.box(u - .08, u + .08, h + .31, h + .47, .04, .045, '#ff6a2b')
        for s in (-1, 1):
            w_.face(u + s * .2 - .04, u + s * .2 + .04, h + .32, h + .46, .045, '#e9e9e9')


def call_panel(w_, u, z=1.15, metal=GOLD):
    w_.box(u - .1, u + .1, z - .2, z + .2, 0, .025, metal)
    for zz, col in ((z + .07, '#ffffff'), (z - .07, '#ffcf6a')):
        w_.box(u - .035, u + .035, zz - .035, zz + .035, .025, .04, col)


def stanchion(B, x, y, metal=GOLD):
    cyl(B, x, y, 0, .04, .17, metal, 10)
    cyl(B, x, y, .04, .95, .03, metal, 8)
    frustum(B, x, y, .95, 1.02, .05, .03, metal, 8)


def board(w_, u, zc, wd, ht, c='#1e1b19', frame=GOLD, o=0.0):
    """A blank backing board for a sign the game writes."""
    w_.box(u - wd / 2 - .04, u + wd / 2 + .04, zc - ht / 2 - .04, zc + ht / 2 + .04, o, o + .03, frame)
    w_.box(u - wd / 2, u + wd / 2, zc - ht / 2, zc + ht / 2, o + .03, o + .04, c)


def sign_mark(B, w_, name, u, zc, wd, ht, text, o=.06):
    x, y = w_.xy(u, o)
    B.mark(name, x, y, zc, text=text, w=wd, h=ht, face=w_.facing)


def light(B, n, x, y, z, color='#ffd9a0', power=30, rng=12):
    B.mark('light_%d' % n, x, y, z, color=color, power=power, range=rng)


# ================================================================ 1. lobby
def int_hotel_lobby(detail=True):
    B = Builder(detail)
    X0, X1, Y0, Y1, Hh = -13.0, 13.0, -9.0, 9.0, 5.5
    M1, M2 = '#ece4d6', '#dccfba'                       # two warm off-white marbles
    WALLC, PANEL = '#5b4a3e', '#e3d6c0'                 # shadow gaps, travertine panels
    WOOD = '#4a2f20'; WOOD2 = '#6b4630'

    # --- floor: big tiles, inlay border, medallion
    bw = 1.0                                             # border band from the walls
    tile_floor(B, X0 + bw, X1 - bw, Y0 + bw, Y1 - bw, 1.2, [M1, M2], '#b8ad9c', veins='#d3c7b3')
    for (a, b, c_, d) in [(X0, X1, Y0, Y0 + bw), (X0, X1, Y1 - bw, Y1), (X0, X0 + bw, Y0 + bw, Y1 - bw), (X1 - bw, X1, Y0 + bw, Y1 - bw)]:
        hq(B, a, b, c_, d, .004, '#d8ccb6')
    for m, col, wd in ((bw - .05, GOLD, .04), (bw - .3, '#3b2c24', .22), (bw - .36, GOLD, .03)):        # inlay bands
        x0, x1, y0, y1 = X0 + m, X1 - m, Y0 + m, Y1 - m
        for (a, b, c_, d) in [(x0, x1, y0, y0 + wd), (x0, x1, y1 - wd, y1), (x0, x0 + wd, y0, y1), (x1 - wd, x1, y0, y1)]:
            hq(B, a, b, c_, d, .008, col)
    # medallion: rings and a compass star
    R = 2.6
    for (r1, r0, col, z) in ((R, R - .12, '#3b2c24', .009), (R - .12, R - .16, GOLD, .010), (R - .16, R - .7, '#efe7da', .009),
                             (R - .7, R - .76, GOLD, .010), (R - .76, 0, '#d2c3a8', .009)):
        disc(B, 0, 0, z, r1, col, 32, r0)
    for i in range(16):                                                   # ring of small diamonds between the bands
        a = 2 * math.pi * (i + .5) / 16
        rr = R - .43
        cx, cy = rr * math.cos(a), rr * math.sin(a)
        ca, sa = math.cos(a), math.sin(a)
        B.face([(cx - ca * .2, cy - sa * .2, .012), (cx - sa * .08, cy + ca * .08, .012), (cx + ca * .2, cy + sa * .2, .012), (cx + sa * .08, cy - ca * .08, .012)], '#7a5a3e')
    for i in range(8):                                                    # 8-point star
        a = 2 * math.pi * i / 8
        L = (R - .8) if i % 2 == 0 else (R - .8) * .62
        ca, sa = math.cos(a), math.sin(a)
        w = .32 if i % 2 == 0 else .24
        col = ('#3b2c24', '#efe7da') if i % 2 == 0 else ('#9c7a3c', '#c9a25a')
        tip = (ca * L, sa * L, .013)
        for s, cc in ((1, col[0]), (-1, col[1])):
            B.face([(0, 0, .013 + (.001 if i % 2 == 0 else 0)), (ca * w * .9 - s * sa * w, sa * w * .9 + s * ca * w, .013 + (.001 if i % 2 == 0 else 0)), (tip[0], tip[1], .013 + (.001 if i % 2 == 0 else 0))], cc)
    disc(B, 0, 0, .016, .28, GOLD, 16)

    # --- walls
    door_w = 4.0
    holes = {'F': [(-door_w / 2 - 2.4, door_w / 2 + 2.4, 0, 4.2)],    # glazed entrance (doors + side lights)
             'R': [(-6.6, -4.4, 0, 3.0)],                                 # lounge bar doorway
             'B': []}
    W = room_shell(B, X0, X1, Y0, Y1, Hh, WALLC, None, holes, t=.3)
    wF, wB, wL, wR = W['F'], W['B'], W['L'], W['R']
    # travertine cladding with a dark marble dado and brass reveal
    for s, w_ in W.items():
        a, b = (X0, X1) if s in 'FB' else (Y0, Y1)
        hl = holes.get(s, [])
        ext = []
        if s == 'B':
            ext = [(-3.4, 3.4, 0, 3.4)]                                   # lift wall feature panel
        if s == 'L':
            ext = [(-4.4, 5.4, 0, 4.6)]                                   # reception back wall feature
        if s == 'R':
            ext = [(-2.6, 9, 0, Hh)]                                      # stair side: own panelling
        w_.clad(a, b, 1.13, Hh - .3, 1.8, 1.02, PANEL, hl + ext, o=.015, k=.035, stagger=False)
        w_.slab(a, b, 0, 1.1, 0, .03, '#4a3a30', [(p, q, 0, 9) for p, q, *_ in hl + ext])          # dark emperador dado
        w_.slab(a, b, 1.08, 1.13, 0, .045, GOLD, [(p, q, 0, 9) for p, q, *_ in hl + ext])
        w_.slab(a, b, 0, .14, 0, .05, '#2e241e', [(p, q, 0, 9) for p, q, *_ in hl + ext])
        w_.cornice(a, b, Hh, '#efe8dc', .16, .3)

    # --- entrance glazing (front wall), sliding doors parked open at the sides
    gc, fc = '#a9c3cf', '#2b2522'
    for (a, b) in ((-door_w / 2 - 2.4, -door_w / 2 - .02), (door_w / 2 + .02, door_w / 2 + 2.4)):
        vista(wF, a, b, 0, 4.2, -.1, False, 3 if a < 0 else 4)
        for u in (a, b, (a + b) / 2):
            wF.box(u - .04, u + .04, 0, 4.2, -.12, .02, fc)
        wF.box(a, b, 2.9, 2.96, -.12, .02, fc)
        wF.box(a, b, 0, .08, -.12, .03, fc)
    vista(wF, -door_w / 2, door_w / 2, 2.9, 4.2, -.1, False, 5)                       # transom over the doors
    wF.box(-door_w / 2, door_w / 2, 2.84, 2.96, -.14, .04, fc)                         # door head with the track
    wF.box(-door_w / 2, door_w / 2, 4.14, 4.2, -.12, .02, fc)
    for s in (-1, 1):                                                                  # open sliding leaves in front of the side lights
        a = s * door_w / 2
        b = s * (door_w / 2 + 1.95)
        wF.box(min(a, b), max(a, b), .02, 2.84, .06, .1, fc)
        wF.box(min(a, b) + .06, max(a, b) - .06, .1, 2.76, .075, .085, '#c4d6dd')
        h_ = a + s * .1
        wF.box(h_ - .02, h_ + .02, .6, 2.2, .1, .16, CHROME)
    # outside the doors: the porte-cochere (floor, canopy, columns) and the street beyond
    hq(B, -7, 7, Y0 - 6, Y0 - .3, 0, '#9a948a')
    for i in range(14):
        hq(B, -7 + i, -6.98 + i + .96, Y0 - 6, Y0 - .3, .002, vary('#a7a196', .05, i))
    B.box(-7, 7, Y0 - 6, Y0 - .3, 4.0, 4.3, '#efe8dc', bottom=True)
    for i in range(7):
        downlight(B, -6 + i * 2, Y0 - 3, 4.0)
    for x in (-5.5, 5.5):
        cyl(B, x, Y0 - 5, 0, 4.0, .3, '#d4c6ae', 12)
    bk = IW(B, 'F', Y0 - 6)
    vista(bk, -7, 7, 0, 7, .03, False, 9)
    bk.box(-7, 7, 0, .9, .04, .3, '#4a4a46')
    for x in (-7, 7):
        B.box(x - .2, x, Y0 - 6, Y0, 0, 4.3, '#d8cdb9') if x < 0 else B.box(x, x + .2, Y0 - 6, Y0, 0, 4.3, '#d8cdb9')                                        # low wall / road kerb
    for x in (-2.5, 2.5):                                                           # a waiting taxi (yellow Lagos cab)
        pass
    B.box(-1.2, 2.6, Y0 - 5.3, Y0 - 3.6, .3, .95, '#e6b422')
    B.box(-.6, 1.9, Y0 - 5.2, Y0 - 3.7, .95, 1.4, '#e6b422')
    B.box(-.55, 1.85, Y0 - 5.22, Y0 - 3.68, 1.0, 1.36, '#2a3540')
    for (wx, wy) in ((-.6, Y0 - 3.58), (1.9, Y0 - 3.58)):
        cylinder_y(B, wx, wy - .02, wy + .02, .3, .3, BLACK, 10)
    B.box(-1.2, 2.6, Y0 - 3.62, Y0 - 3.6, .5, .55, '#222222')
    hq(B, -door_w / 2 - .2, door_w / 2 + .2, Y0 - .3, Y0 + 1.6, .011, '#3a3330')        # entrance mat
    hq(B, -door_w / 2, door_w / 2, Y0 - .3, Y0 + 1.5, .013, MAROON)
    for i in range(12):
        x = -door_w / 2 + .2 + i * (door_w - .4) / 11
        hq(B, x - .03, x + .03, Y0 - .2, Y0 + 1.4, .014, shade(MAROON, .8))

    # --- reception (left wall): back wall feature, desk
    rx = X0                                                                          # wall at x=-13
    wL.box(-4.4, 5.4, 0, 4.6, 0, .05, '#2b1d15')                                      # dark frame
    for i in range(int(9.6 / .14)):                                                  # vertical wood slats
        u = -4.3 + i * .14
        if 3.2 > u + .07 or True:
            wL.box(u, u + .09, .15, 4.5, .05, .1, vary(WOOD2, .07, i))
    # pigeonhole key cabinet (centre back)
    cu, cw = 0.5, 3.2
    wL.box(cu - cw / 2, cu + cw / 2, 1.05, 2.45, .1, .42, WOOD)
    for j in range(5):
        for i in range(12):
            a = cu - cw / 2 + .08 + i * (cw - .16) / 12
            z = 1.1 + j * .27
            wL.box(a + .01, a + (cw - .16) / 12 - .01, z, z + .24, .38, .425, '#24170f')
            if hsh(i, j, 5) < .55:                                                # keys / folded mail
                wL.box(a + .08, a + .1, z + .05, z + .17, .39, .42, GOLD)
                wL.box(a + .06, a + .12, z + .02, z + .06, .39, .42, MAROON)
    wL.box(cu - cw / 2 - .05, cu + cw / 2 + .05, 2.45, 2.52, .1, .45, GOLD)
    wL.box(cu - cw / 2 - .05, cu + cw / 2 + .05, 1.0, 1.05, .1, .45, GOLD)
    board(wL, cu, 3.35, 3.6, .7, '#1b1512', GOLD, .1)                                   # RECEPTION sign backing
    sign_mark(B, wL, 'sign_reception', cu, 3.35, 3.6, .7, 'RECEPTION', .16)
    for u in (cu - 2.6, cu + 2.6):                                                    # clocks: Lagos / London / New York
        wL.box(u - .22, u + .22, 3.15, 3.59, .1, .14, GOLD)
        wL.box(u - .19, u + .19, 3.18, 3.56, .14, .145, '#f6f1e6')
        wL.box(u - .006, u + .006, 3.37, 3.52, .145, .15, BLACK)
        wL.box(u, u + .1, 3.365, 3.375, .145, .15, BLACK)
    # back counter (behind the receptionist) with printer and a plant
    wL.box(-3.8, 4.8, 0, .9, .1, .62, WOOD)
    wL.box(-3.85, 4.85, .9, .94, .1, .66, '#e9e1d3')
    t_ = T(B, rx + .4, -2.8, '+x', .94)
    t_.box(-.22, .22, -.18, .18, 0, .28, '#e8e8e6'); t_.box(-.18, .18, -.2, -.18, .2, .24, '#2a2a2a')
    flowers(B, rx + .4, 4.2, .94, .2, '#efe7da', seed=4, h=.5)
    # front desk: long, dark wood, marble top, lit strip, raised guest ledge
    dx, dy0, dy1 = -9.2, -3.2, 4.2
    B.box(dx - .4, dx + .35, dy0, dy1, 0, 1.08, WOOD)                                  # body
    B.box(dx + .35, dx + .4, dy0, dy1, 0, .1, '#1a120c')                              # toe kick
    for i in range(int((dy1 - dy0) / .6)):                                            # vertical fluted front panels
        y = dy0 + .05 + i * .6
        B.box(dx + .35, dx + .39, y, y + .5, .14, .88, vary(WOOD2, .05, i, 2))
    B.box(dx + .35, dx + .41, dy0, dy1, .9, .94, LED)                                 # lit strip
    B.box(dx + .33, dx + .38, dy0, dy1, .14, .16, GOLD)
    B.box(dx - .45, dx + .5, dy0 - .05, dy1 + .05, 1.08, 1.14, '#f2ece2')             # marble top (guest ledge)
    for y in (dy0 - .05, dy1 + .05):                                                  # veins on the slab edge
        pass
    B.box(dx - 1.0, dx - .4, dy0, dy1, .7, .76, '#e9e1d3')                            # lower work counter behind
    B.box(dx - 1.0, dx - .45, dy0, dy0 + .05, 0, .7, WOOD)
    B.box(dx - 1.0, dx - .45, dy1 - .05, dy1, 0, .7, WOOD)
    for i, y in enumerate((-1.6, 1.0, 3.0)):                                          # monitors, keyboards, phone
        B.box(dx - .62, dx - .58, y - .28, y + .28, .9, 1.25, '#151515')
        B.box(dx - .6, dx - .57, y - .26, y + .26, .92, 1.23, '#2c4a6a')
        B.box(dx - .66, dx - .6, y - .04, y + .04, .76, .9, '#202020')
        B.box(dx - .85, dx - .7, y - .22, y + .22, .76, .78, '#2a2a2a')
    B.box(dx - .1, dx + .2, -.5, -.2, 1.14, 1.18, '#121212')                          # bell
    cyl(B, dx + .05, .5, 1.14, 1.16, .07, GOLD, 10); frustum(B, dx + .05, .5, 1.16, 1.22, .07, .01, GOLD, 10)
    flowers(B, dx + .05, 3.6, 1.14, .16, '#1a1a1a', ('#f3e7d3', '#ffffff', '#c8102e'), seed=6, h=.4)
    for y in (-2.5, 2.2):                                                             # bar stools for staff
        cyl(B, dx - .75, y, 0, .04, .2, BLACK, 8); cyl(B, dx - .75, y, .04, .6, .025, CHROME, 6); cyl(B, dx - .75, y, .6, .66, .2, '#3a2a20', 10)
    B.mark('receptionist', dx - 1.35, .2, 0, face='+x')
    B.mark('desk', dx + 1.1, .2, 0, face='-x')

    # --- lifts in the back wall
    wB.box(-3.4, 3.4, 0, 3.4, 0, .04, '#3d2f27')
    wB.clad(-3.4, 3.4, 0, 3.4, .85, 1.7, '#efe7da', [(-2.8, -.2, 0, 2.62), (.2, 2.8, 0, 2.62)], o=.05, k=.03, stagger=False)
    wB.box(-3.45, 3.45, 3.4, 3.48, 0, .09, GOLD)
    for u in (-1.5, 1.5):
        lift_doors(wB, u)
    call_panel(wB, 0, 1.15)
    B.mark('lift', 0, Y1 - 1.3, 0, face='+y')
    # sofas-height benches beside the lifts? keep tall vases instead
    for u in (-4.2, 4.2):
        frustum(B, u, Y1 - .45, 0, .9, .18, .28, '#2e2a27', 10, False, True)
        for j in range(9):
            a = 2 * math.pi * j / 9
            B.box(u + .12 * math.cos(a) - .01, u + .12 * math.cos(a) + .01, Y1 - .45 + .12 * math.sin(a) - .01, Y1 - .45 + .12 * math.sin(a) + .01, .9, 2.0 + .3 * hsh(j, u), '#7a5c3e')
            B.box(u + .25 * math.cos(a) - .05, u + .25 * math.cos(a) + .05, Y1 - .45 + .25 * math.sin(a) - .05, Y1 - .45 + .25 * math.sin(a) + .05, 1.9 + .3 * hsh(j, u), 2.0 + .3 * hsh(j, u), '#e8dcc4')

    # --- room price board on the back wall (near reception)
    board(wB, -7.6, 2.3, 2.4, 1.6, '#1f1a17', GOLD, .02)
    sign_mark(B, wB, 'sign_prices', -7.6, 2.3, 2.4, 1.6, 'ROOMS & SUITES', .08)
    for u in (-9.3, -5.9):
        wB.sconce(u, 2.6)

    # --- lounge bar doorway (right wall)
    wR.frame(-5.5, 2.2, 3.0, GOLD, 0, .12, .06)
    wR.box(-6.7, -4.3, 3.12, 3.7, 0, .05, '#1b1512')
    sign_mark(B, wR, 'sign_bar', -5.5, 3.41, 2.2, .5, 'LOUNGE BAR', .08)
    for y_ in (-6.6, -4.4):
        pass
    # the bar beyond: dim warm room seen through the doorway
    bx0 = X1 + .3
    B.box(bx0, bx0 + 4, -8, -3, -.001, 0, '#3a2a20')
    for y_ in (-8, -3):
        B.box(bx0, bx0 + 4, y_ - .1, y_ + .1, 0, 3.2, '#3b2a22')
    B.box(bx0 + 3.9, bx0 + 4.1, -8, -3, 0, 3.2, '#2e211b')
    B.box(bx0, bx0 + 4, -8, -3, 3.2, 3.25, '#2a1e18', bottom=True)
    B.box(bx0 + 3.3, bx0 + 3.9, -7.2, -3.8, 0, 1.1, '#5a3a26')                      # bar counter
    B.box(bx0 + 3.25, bx0 + 3.9, -7.25, -3.75, 1.1, 1.15, '#1a1a1a')
    for i in range(10):                                                               # back-bar bottles lit amber
        y_ = -7.1 + i * .33
        B.box(bx0 + 3.88, bx0 + 3.95, y_, y_ + .08, 1.45, 1.75, ['#c97b2a', '#5e8c3a', '#e6d7a8', '#8a2b1f'][i % 4])
    B.box(bx0 + 3.86, bx0 + 3.9, -7.6, -3.4, 1.4, 1.42, LED)
    for y_ in (-6.6, -5.4, -4.2):
        pendant(B, bx0 + 2.9, y_, 3.2, 1.1, .16, '#c48a3a')
    # --- decorative staircase along the right wall
    sx0, sx1 = X1 - 1.9, X1 - .02
    ys, run, rise, n = -2.4, .29, 5.5 / 32, 32
    STONE, RUNNER = '#efe7da', MAROON
    wR.slab(-2.6, Y1, 0, Hh, 0, .03, '#e3d6c0')                                       # plain wall behind the stair
    for i in range(n):
        y_ = ys + i * run
        z1 = (i + 1) * rise
        B.box(sx0, sx1, y_, y_ + run, z1 - rise, z1, STONE)
        B.box(sx0 - .02, sx1, y_ - .02, y_ + .03, z1 - .03, z1, shade(STONE, 1.03))
        B.box(sx0 + .45, sx1 - .45, y_ - .025, y_ + run, z1, z1 + .008, RUNNER)            # carpet runner
        B.box(sx0 + .45, sx1 - .45, y_ - .03, y_ - .02, z1 - rise + .01, z1 + .008, RUNNER)
        B.box(sx0 + .42, sx0 + .45, y_ + run - .03, y_ + run - .01, z1, z1 + .02, GOLD)   # stair rods
        B.box(sx1 - .45, sx1 - .42, y_ + run - .03, y_ + run - .01, z1, z1 + .02, GOLD)
    ytop = ys + n * run
    B.box(sx0, sx1, ytop, Y1, Hh - .25, Hh, STONE)                                      # top landing
    # stringer on the open side, balusters and a handrail
    for i in range(n):
        y_ = ys + i * run
        z1 = (i + 1) * rise
        B.face([(sx0 - .06, y_, z1 - rise - .35 if i else 0), (sx0 - .06, y_ + run, z1 - .35), (sx0 - .06, y_ + run, z1 + .02), (sx0 - .06, y_, z1 - rise + .02)], '#e6dccb')
        if i % 1 == 0:
            B.box(sx0 + .04, sx0 + .065, y_ + run / 2 - .0125, y_ + run / 2 + .0125, z1, z1 + .92, GOLD)
    B.face([(sx0 - .06, ys, 0), (sx0 - .06, ys, .2)], '#e6dccb') if False else None
    for i in range(n):
        y_ = ys + i * run
        za, zb = i * rise + 1.0, (i + 1) * rise + 1.0
        B.box(sx0 + .02, sx0 + .09, y_, y_ + run, min(za, zb) + .9 - .9, min(za, zb) + .07 - 0, '#3b2416') if False else None
        B.face([(sx0 + .02, y_, za - .03), (sx0 + .02, y_ + run, zb - .03), (sx0 + .02, y_ + run, zb + .04), (sx0 + .02, y_, za + .04)], '#3b2416')
        B.face([(sx0 + .09, y_, za - .03), (sx0 + .09, y_ + run, zb - .03), (sx0 + .09, y_ + run, zb + .04), (sx0 + .09, y_, za + .04)], '#3b2416')
        B.face([(sx0 + .02, y_, za + .04), (sx0 + .02, y_ + run, zb + .04), (sx0 + .09, y_ + run, zb + .04), (sx0 + .09, y_, za + .04)], '#4a2e1c')
    cyl(B, sx0 + .055, ys - .1, 0, 1.1, .06, GOLD, 8)                                 # newel post
    frustum(B, sx0 + .055, ys - .1, 1.1, 1.22, .08, .03, GOLD, 8)
    # wall-side handrail
    for i in range(0, n, 4):
        y_ = ys + i * run + .1
        wR.box(y_ - .02, y_ + .02, i * rise + .95, i * rise + 1.0, 0, .08, GOLD)
    for i in range(n):
        y_ = ys + i * run
        za, zb = i * rise + 1.0, (i + 1) * rise + 1.0
        B.face([(sx1 - .07, y_, za), (sx1 - .07, y_ + run, zb), (sx1 - .07, y_ + run, zb + .05), (sx1 - .07, y_, za + .05)], GOLD)
    # rope across the foot of the stairs
    for y_ in (ys - .5,):
        stanchion(B, sx0 + .05, y_)
        stanchion(B, sx1 - .1, y_)
        for k in range(8):
            a, b = k / 8, (k + 1) / 8
            za = .86 - .18 * math.sin(math.pi * a); zb = .86 - .18 * math.sin(math.pi * b)
            xa, xb = sx0 + .05 + (sx1 - .15 - sx0) * a, sx0 + .05 + (sx1 - .15 - sx0) * b
            B.box(min(xa, xb), max(xa, xb), y_ - .025, y_ + .025, min(za, zb) - .025, max(za, zb) + .025, MAROON)
    # opening in the ceiling over the top of the stair, with the upper floor beyond
    sv = (sx0 - .1, X1, ys + 20 * run, Y1)
    ceil_holes = [sv]
    B.box(sv[0], sv[1], sv[2] - .2, sv[2], Hh, Hh + 3.2, '#efe8dc')
    B.box(sv[0] - .2, sv[0], sv[2], Y1, Hh, Hh + 3.2, '#efe8dc')
    B.box(sv[0], X1, Y1, Y1 + .2, Hh, Hh + 3.2, '#e3d6c0')
    B.box(sv[0], X1, sv[2], Y1, Hh + 3.2, Hh + 3.25, '#f1eadf', bottom=True)
    B.box(sv[0], X1, ytop, Y1, Hh - .01, Hh, '#6a5546')
    wR.box(sv[2], Y1, Hh, Hh + 3.2, -.3, 0, '#e3d6c0')
    cyl(B, (sv[0] + X1) / 2, (sv[2] + Y1) / 2, Hh + 2.9, Hh + 3.2, .25, BULB, 10, bottom=True)
    # balustrade around the void edge (upper floor)
    B.box(sv[0] - .05, sv[0] + .05, sv[2], ytop, Hh, Hh + 1.0, '#e6dccb')
    B.box(sv[0] - .07, sv[0] + .07, sv[2], ytop, Hh + 1.0, Hh + 1.06, '#3b2416')

    # --- columns (marble clad, brass base and capital)
    for (cx, cy) in ((-5.5, -4.5), (-5.5, 4.5), (5.0, -4.5), (5.0, 4.5)):
        s = .45
        B.box(cx - s - .05, cx + s + .05, cy - s - .05, cy + s + .05, 0, .2, '#3b2c24')
        B.box(cx - s - .06, cx + s + .06, cy - s - .06, cy + s + .06, .2, .24, GOLD)
        for k, (a, b, c_, d) in enumerate([(cx - s, cx + s, cy - s, cy - s + .01), (cx - s, cx + s, cy + s - .01, cy + s), (cx - s, cx - s + .01, cy - s, cy + s), (cx + s - .01, cx + s, cy - s, cy + s)]):
            pass
        B.box(cx - s, cx + s, cy - s, cy + s, .24, Hh, '#efe8dc')
        for j in range(4):                                                          # big book-matched slabs
            z0 = .24 + j * (Hh - .9) / 4
            for (a, b, c_, d, col) in [(cx - s - .012, cx + s + .012, cy - s - .012, cy + s + .012, vary('#efe5d4', .04, cx, cy, j))]:
                B.box(a, b, c_, d, z0 + .004, z0 + (Hh - .9) / 4 - .004, col)
            for (vx, vy) in ((cx - s - .014, None), (cx + s + .014, None)):
                B.face([(vx, cy - s + .1, z0 + .2), (vx, cy - s + .14, z0 + .2), (vx, cy + s - .1, z0 + 1.0), (vx, cy + s - .14, z0 + 1.0)], '#c9bba5')
            for vy in (cy - s - .014, cy + s + .014):
                B.face([(cx - s + .1, vy, z0 + .3), (cx - s + .14, vy, z0 + .3), (cx + s - .1, vy, z0 + .9), (cx + s - .14, vy, z0 + .9)], '#c9bba5')
        B.box(cx - s - .06, cx + s + .06, cy - s - .06, cy + s + .06, Hh - .66, Hh - .6, GOLD)
        B.box(cx - s - .14, cx + s + .14, cy - s - .14, cy + s + .14, Hh - .6, Hh - .3, '#efe8dc', bottom=True)
        for s_ in (-1, 1):                                                          # uplight sconces on two faces
            B.box(cx - .12, cx + .12, cy + s_ * (s + .012), cy + s_ * (s + .1), 2.4, 2.75, GOLD)
            B.box(cx - .1, cx + .1, cy + s_ * (s + .02), cy + s_ * (s + .09), 2.75, 2.76, BULB)

    # --- ceiling: coffered with a raised tray over the chandelier, cove light, downlights
    tray = (-5.0, 5.0, -4.0, 4.0)
    ceiling(B, X0, X1, Y0, Y1, Hh, '#f4efe6', [tray] + ceil_holes)
    TH = Hh + .6
    hq(B, *tray, TH, '#f6f1e8')
    for (a, b, c_, d) in [(tray[0], tray[1], tray[2], tray[2] + .01), (tray[0], tray[1], tray[3] - .01, tray[3]),
                          (tray[0], tray[0] + .01, tray[2], tray[3]), (tray[1] - .01, tray[1], tray[2], tray[3])]:
        B.box(a, b, c_, d, Hh, TH, '#efe8dc')
    for (a, b, c_, d) in [(tray[0] - .3, tray[1] + .3, tray[2] - .3, tray[2]), (tray[0] - .3, tray[1] + .3, tray[3], tray[3] + .3),
                          (tray[0] - .3, tray[0], tray[2], tray[3]), (tray[1], tray[1] + .3, tray[2], tray[3])]:
        B.box(a, b, c_, d, Hh - .18, Hh, '#efe8dc', bottom=True)                    # lip hiding the cove light
    for (a, b, c_, d) in [(tray[0], tray[1], tray[2] + .02, tray[2] + .1), (tray[0], tray[1], tray[3] - .1, tray[3] - .02),
                          (tray[0] + .02, tray[0] + .1, tray[2], tray[3]), (tray[1] - .1, tray[1] - .02, tray[2], tray[3])]:
        hq(B, a, b, c_, d, Hh + .02, LED)
    for (a, b, c_, d) in [(tray[0] + .6, tray[1] - .6, tray[2] + .6, tray[2] + .7), (tray[0] + .6, tray[1] - .6, tray[3] - .7, tray[3] - .6),
                          (tray[0] + .6, tray[0] + .7, tray[2] + .6, tray[3] - .6), (tray[1] - .7, tray[1] - .6, tray[2] + .6, tray[3] - .6)]:
        B.box(a, b, c_, d, TH - .06, TH, GOLD, bottom=True)                          # gilded moulding
    for x in (-10, -7.5, 7.5, 10):
        for y in (-6.5, -3, 0.5, 4, 7):
            if not (x > 10.5 and y > 2):
                downlight(B, x, y, Hh)
    for x in (-3, 0, 3):
        for y in (-6.6, 6.6):
            downlight(B, x, y, Hh)
    # beams dividing the side bays
    for x in (-6.0, 6.0):
        B.box(x - .2, x + .2, Y0, Y1, Hh - .35, Hh, '#efe8dc', bottom=True)
    chandelier(B, 0, 0, TH, 2.4, 1.3, 3, GOLD, n=16)

    # --- round table with flowers on the medallion
    round_table(T(B, 0, 0), .85, '#2a1d15', GOLD, .78, 24)
    disc(B, 0, 0, .785, .8, '#3b2a1e', 24)
    flowers(B, 0, 0, .785, .62, '#e9e1d3', ('#c8102e', '#f3e7d3', '#f4a6b8', '#ffffff', '#e8a33c'), seed=1, h=1.3)

    # --- lounge (right front)
    lx, ly = 7.2, -2.2
    rug(B, lx - 2.6, lx + 2.0, ly - 2.4, ly + 2.4, '#b9a68a', '#5a3e2e', '#8a6a4a', pattern='#7a5a3e', fringe=None)
    SOFA, CUSH = '#e6dccb', '#efe6d6'
    ank = [('#1c5f8a', '#e8a33c'), ('#c8102e', '#f1e3c8'), ('#2e7d4f', '#f2c14e')]
    sofa(T(B, lx + 1.2, ly, '-x'), 2.6, SOFA, CUSH, pillows=ank[:2] + [ank[2]])
    sofa(T(B, lx - .4, ly - 1.7, '+y'), 2.2, SOFA, CUSH, pillows=ank[1:])
    armchair(T(B, lx - 1.6, ly + 1.4, '+x'), '#5a3e2e', '#7a5440', pillow_c=ank[0])
    armchair(T(B, lx - .2, ly + 1.65, '-y'), '#5a3e2e', '#7a5440', pillow_c=ank[2])
    coffee_table(T(B, lx - .3, ly), 1.3, .8, '#efe7da', GOLD)
    flowers(B, lx - .3, ly, .42, .15, '#1a1a1a', ('#ffffff', '#f3e7d3'), seed=8, h=.3)
    B.box(lx - .7, lx - .4, ly + .1, ly + .32, .42, .47, '#1c5f8a')                    # magazines
    B.box(lx - .68, lx - .42, ly + .12, ly + .3, .47, .48, '#e8a33c')
    for (px, py) in ((lx + 1.4, ly + 1.6), (lx + 1.4, ly - 1.75)):                     # side tables + lamps
        round_table(T(B, px, py), .25, '#efe7da', GOLD, .55)
        nightstand(T(B, px, py), '#efe7da', lamp=True, w=.01, d=.01, h=.55) if False else None
        cyl(B, px, py, .55, .6, .08, GOLD, 8); cyl(B, px, py, .6, .95, .02, GOLD, 6)
        frustum(B, px, py, .9, 1.15, .2, .14, '#f3e6cc', 10, True, True)
        disc(B, px, py, .899, .18, BULB, 10)
    # second, smaller seating group left front by the entrance
    lx2, ly2 = -4.8, -6.6
    rug(B, lx2 - 1.9, lx2 + 1.9, ly2 - 1.2, ly2 + 1.4, '#c7b79c', '#6b4a35', fringe=None)
    for k, xx in enumerate((lx2 - 1.0, lx2 + 1.0)):
        armchair(T(B, xx, ly2 + .55, '-y'), '#2e4a3e', '#3e5d4e', pillow_c=ank[k])
    coffee_table(T(B, lx2, ly2 - .5), .9, .6, '#efe7da', GOLD)
    plant(B, lx2 + 2.2, ly2 + .7, 1.6, '#2e2a27', .26, 'bush', seed=11)

    # --- big potted plants
    for k, (px, py) in enumerate(((X1 - 1.5, Y0 + 1.4), (-X1 + 1.5 + 4.2, Y0 + 1.3), (-6.5, Y1 - 1.0), (6.3, Y1 - 1.0), (3.4, -6.9), (-3.4, -6.9) if False else (10.5, -1.3))):
        plant(B, px, py, 2.0 if k % 2 == 0 else 1.7, '#2e2a27', .32, 'palm' if k % 2 == 0 else 'bush', seed=k)

    # --- luggage trolley near the desk
    tx, ty = -6.6, -6.4
    B.box(tx - .5, tx + .5, ty - .3, ty + .3, .2, .24, '#7a1e2a')                     # carpeted deck
    B.box(tx - .52, tx + .52, ty - .32, ty + .32, .17, .2, GOLD)
    for (wx, wy) in ((tx - .42, ty - .25), (tx + .42, ty - .25), (tx - .42, ty + .25), (tx + .42, ty + .25)):
        cyl(B, wx, wy, 0, .1, .06, BLACK, 8)
        B.box(wx - .02, wx + .02, wy - .02, wy + .02, .1, .17, GOLD)
    for s in (-1, 1):                                                                # the brass birdcage frame
        B.box(tx + s * .5 - .02, tx + s * .5 + .02, ty - .02, ty + .02, .24, 1.9, GOLD)
    for k in range(9):
        a0, a1 = math.pi * k / 9, math.pi * (k + 1) / 9
        B.box(tx - .5 * math.cos(a0) - .02 if False else min(tx - .5 * math.cos(a0), tx - .5 * math.cos(a1)), max(tx - .5 * math.cos(a0), tx - .5 * math.cos(a1)) + .001,
              ty - .02, ty + .02, 1.9 + .25 * min(math.sin(a0), math.sin(a1)), 1.9 + .25 * max(math.sin(a0), math.sin(a1)) + .04, GOLD)
    B.box(tx - .5, tx + .5, ty - .015, ty + .015, 1.2, 1.23, GOLD)                    # hanger rail
    suitcase(T(B, tx - .22, ty - .05, '-y', .24), '#1d3b5a', .4, .26, .6)
    suitcase(T(B, tx + .2, ty, '-y', .24), '#5a2a2a', .36, .24, .5)
    B.box(tx - .05, tx + .4, ty - .25, ty + .25, .78, .98, '#2a2a2a')               # duffel on top
    B.box(tx - .4, tx - .37, ty - .2, ty + .2, .9, 1.7, '#2b3a4a')                  # suit bag
    # --- details on walls: art, sconces, CCTV dome, fire alarm, AC grilles
    for u in (-3.2 + 0, 3.2):
        pass
    wR.picture(-0.0 - 9 + 9.0 - 9.0 + 9.0 - 0, 0, .01, .01, GOLD, ['#fff', '#fff']) if False else None
    for (w_, u) in ((wF, -9.5), (wF, 9.5)):
        w_.picture(u, 2.6, 2.4, 1.6, GOLD, ['#c8b48e', '#1c5f8a', '#c8102e', '#e8a33c', '#2e7d4f', '#3b2c24'], seed=int(u))
        w_.sconce(u - 1.7, 2.4); w_.sconce(u + 1.7, 2.4)
    wL.picture(-7.2, 2.6, 2.2, 1.5, GOLD, ['#d9c7a5', '#7a3b2a', '#e8a33c', '#1b4d3e', '#3b2c24'], seed=21)
    wL.sconce(-5.5, 2.5); wL.sconce(-8.9, 2.5)
    wL.picture(7.3, 2.6, 2.2, 1.5, GOLD, ['#cbb998', '#1c5f8a', '#c8102e', '#f2c14e', '#2e2a27'], seed=22)
    wR.picture(-8.0, 2.6, 1.4, 1.8, GOLD, ['#e2d2b2', '#2e7d4f', '#c8102e', '#e8a33c'], seed=23)
    for (x, y) in ((-11, -7), (11, 7.5), (0, -6)):
        cyl(B, x, y, Hh - .12, Hh, .08, '#f2f2f2', 8, bottom=True)
    for x in (-10.5, 10.5):
        hq(B, x - .6, x + .6, -8.2, -7.9, Hh - .005, '#d6d0c4')                       # AC linear grilles
        for i in range(10):
            hq(B, x - .58 + i * .12, x - .54 + i * .12, -8.18, -7.92, Hh - .007, '#9a958c')
    wR.switch(-7.3, 1.25); wL.switch(-6.0, 1.25)
    wR.socket(-1.0); wL.socket(-6.3); wF.socket(-6.0); wF.socket(6.0)

    # --- marks
    B.mark('spawn', 0, Y0 + 1.6, 0, face='+y')
    B.mark('exit', 0, Y0 + .7, 0, face='-y')
    B.mark('bar_door', X1 - .7, -5.5, 0, face='+x')
    light(B, 1, 0, 0, 3.6, '#ffe2b0', 60, 20)
    light(B, 2, -9.0, .5, 4.2, '#ffdcae', 35, 14)
    light(B, 3, 7.0, -2.2, 4.2, '#ffd9a0', 30, 12)
    light(B, 4, 0, 6.8, 4.0, '#ffe6c0', 25, 12)
    light(B, 5, 0, -6.4, 4.2, '#fff0d8', 30, 14)
    return B.finish('int_hotel_lobby')


# ================================================================ 2. upper floor corridor
def int_hotel_corridor(detail=True):
    B = Builder(detail)
    H_ = 3.3
    LX0, LX1, LY0, LY1 = -3.5, 3.5, -20.0, -15.0          # lift lobby
    CX0, CX1, CY1 = -1.6, 1.6, 17.0                       # corridor
    WOOD = '#5a3826'; FRAME = '#3a2418'; PAPER = '#d9cbb2'; STRIPE = '#cfbfa3'; WAINS = '#efe7d8'
    CARPET, BORDER, MOTIF = '#5a1b25', '#33171a', '#b8924e'

    # floors: marble in the lift lobby, carpet runner in the corridor
    tile_floor(B, LX0, LX1, LY0, LY1, .8, ['#ece4d6', '#dccfba'], '#b8ad9c', veins='#d3c7b3')
    disc(B, 0, -17.5, .009, 1.1, '#3b2c24', 24, 1.0); disc(B, 0, -17.5, .01, 1.0, GOLD, 24, .96)
    hq(B, CX0, CX1, LY1, CY1, .0, BORDER)
    hq(B, CX0 + .25, CX1 - .25, LY1 + .05, CY1 - .05, .004, CARPET)
    for x in (CX0 + .3, CX1 - .34):
        hq(B, x, x + .04, LY1 + .1, CY1 - .1, .006, MOTIF)
    y = LY1 + .8
    k = 0
    while y < CY1 - .5:                                        # repeating medallion motifs along the runner
        hq(B, -.04, .04, y - .45, y + .45, .006, shade(MOTIF, .85))
        B.face([(-.55, y, .007), (0, y - .45, .007), (.55, y, .007), (0, y + .45, .007)], shade(CARPET, 1.18))
        B.face([(-.3, y, .008), (0, y - .25, .008), (.3, y, .008), (0, y + .25, .008)], MOTIF)
        B.face([(-.12, y, .009), (0, y - .1, .009), (.12, y, .009), (0, y + .1, .009)], CARPET)
        for s_ in (-1, 1):
            B.face([(s_ * .85, y + .6, .007), (s_ * .95, y + .5, .007), (s_ * .85, y + .4, .007), (s_ * .75, y + .5, .007)], MOTIF)
        y += 1.4; k += 1

    # lift lobby walls
    wF = IW(B, 'F', LY0, .25); wL = IW(B, 'L', LX0, .25); wR = IW(B, 'R', LX1, .25)
    wB1 = IW(B, 'B', LY1, .25)
    wF.wall(LX0 - .25, LX1 + .25, H_, '#5b4a3e')
    wL.wall(LY0, LY1, H_, '#5b4a3e'); wR.wall(LY0, LY1, H_, '#5b4a3e')
    wB1.wall(LX0 - .25, CX0, H_, '#5b4a3e'); wB1.wall(CX1, LX1 + .25, H_, '#5b4a3e')
    for w_, a, b in ((wF, LX0, LX1), (wL, LY0, LY1), (wR, LY0, LY1), (wB1, LX0, CX0), (wB1, CX1, LX1)):
        w_.clad(a, b, .14, H_ - .2, 1.2, .79, '#e3d6c0', o=.012, k=.03, stagger=False)
        w_.box(a, b, 0, .14, 0, .03, '#2e241e')
        w_.cornice(a, b, H_, '#efe8dc', .1, .2)
    for u in (-1.6, 1.6):
        lift_doors(wF, u, h=2.3, wd=1.1)
    wB1.frame(0, CX1 - CX0, 2.75, '#f6f1e8', 0, .14, .05)
    wB1.slab(CX0, CX1, 2.75, H_, -.25, 0, '#5b4a3e')
    wB1.box(CX0, CX1, 2.75, 2.89, 0, .05, '#f6f1e8')
    hq(B, CX0, CX1, LY1 - .25, LY1, 2.75, '#f4efe6')
    call_panel(wF, 0, 1.15)
    wF.picture(0, 2.65, .7, .45, GOLD, ['#d9c7a5', '#7a3b2a', '#e8a33c', '#1b4d3e'], seed=31) if False else None
    # mirror over a console with flowers (right wall)
    mirror(wR, -17.5, 1.95, 1.2, 1.3, GOLD)
    t = T(B, LX1 - .25, -17.5, '-x')
    t.box(-.7, .7, -.2, .2, .78, .82, '#2a1d15')
    for x in (-.65, .65):
        t.box(x - .03, x + .03, -.17, .17, 0, .78, GOLD)
    t.box(-.65, .65, -.15, .15, .1, .13, GOLD)
    flowers(B, LX1 - .25, -17.5, .82, .24, '#efe7da', ('#f3e7d3', '#ffffff', '#c8102e', '#f4a6b8'), seed=12, h=.55)
    wR.sconce(-18.7, 1.9); wR.sconce(-16.3, 1.9)
    # floor directory board (left wall)
    board(wL, -17.5, 1.65, 1.4, 1.0, '#1f1a17', GOLD, .0)
    sign_mark(B, wL, 'sign_floor', -17.5, 1.65, 1.4, 1.0, 'FLOOR', .05)
    plant(B, LX0 + .5, LY0 + .5, 1.5, '#2e2a27', .24, 'bush', seed=3)
    plant(B, LX0 + .5, LY1 - .5, 1.6, '#2e2a27', .24, 'palm', seed=4)
    ceiling(B, LX0, LX1, LY0, LY1, H_, '#f4efe6', [(-2, 2, -19, -16)])
    hq(B, -2, 2, -19, -16, H_ + .25, '#f6f1e8')
    for (a, b, c_, d) in [(-2, 2, -19, -18.98), (-2, 2, -16.02, -16), (-2, -1.98, -19, -16), (1.98, 2, -19, -16)]:
        B.box(a, b, c_, d, H_, H_ + .25, '#efe8dc')
    for (a, b, c_, d) in [(-1.95, 1.95, -18.95, -18.88), (-1.95, 1.95, -16.12, -16.05), (-1.95, -1.88, -18.95, -16.05), (1.88, 1.95, -18.95, -16.05)]:
        hq(B, a, b, c_, d, H_ + .02, LED)
    pendant(B, 0, -17.5, H_ + .25, .9, .35, GOLD)
    for x in (-2.8, 2.8):
        for y_ in (-19, -16):
            downlight(B, x, y_, H_)

    # corridor walls: wainscot panels, chair rail, striped paper above, cornice
    cL, cR = IW(B, 'L', CX0, .25), IW(B, 'R', CX1, .25)
    doors_y = [-10.0, -3.0, 4.0, 11.0]
    nook = (6.4, 8.6)
    holesR = [(nook[0], nook[1], 0, 2.6)]
    cL.wall(LY1, CY1, H_, PAPER)
    cR.wall(LY1, CY1, H_, PAPER, holesR)
    wE = IW(B, 'B', CY1, .25)
    wE.wall(CX0 - .25, CX1 + .25, H_, PAPER)
    for w_, a, b, hl in ((cL, LY1, CY1, []), (cR, LY1, CY1, holesR), (wE, CX0, CX1, [])):
        dh = [(y_ - .62, y_ + .62, 0, 2.4) for y_ in doors_y] if w_ is not wE else []
        u = a + .05
        i = 0
        while u < b - .05:                                     # wallpaper stripes
            for (p_, q_, r_, t_) in rects_minus(u, min(b, u + .12), 1.0, H_ - .2, hl + dh):
                w_.face(p_, q_, r_, t_, .004, STRIPE)
            u += .36; i += 1
        w_.slab(a, b, 0, 1.0, 0, .02, WAINS, hl + dh)
        w_.rail(a, b, 1.0, '#f6f1e8', hl + dh, .04, .06)
        w_.slab(a, b, 0, .14, 0, .03, '#5a3826', [(p_, q_, 0, 9) for p_, q_, *_ in hl + dh])
        w_.cornice(a, b, H_, '#f6f1e8', .1, .18)
        # wainscot panel mouldings between the doors
        segs = rects_minus(a + .1, b - .1, .2, .85, hl + dh)
        for (p_, q_, r_, t_) in segs:
            n = max(1, round((q_ - p_) / 1.1))
            for j in range(n):
                pa, pb = p_ + (q_ - p_) * j / n + .06, p_ + (q_ - p_) * (j + 1) / n - .06
                if pb - pa < .2:
                    continue
                for (e0, e1, f0, f1) in ((pa, pb, .2, .23), (pa, pb, .82, .85), (pa, pa + .03, .2, .85), (pb - .03, pb, .2, .85)):
                    w_.box(e0, e1, f0, f1, .02, .035, '#f8f4ec')
    # the room doors
    n = 0
    for y_ in doors_y:
        for w_, side in ((cL, 'L'), (cR, 'R')):
            n += 1
            w_.door(y_, 1.0, 2.25, WOOD, FRAME, GOLD, plate=(1.55, .45, .22), hinge=1 if side == 'L' else -1)
            w_.box(y_ - .02, y_ + .02, 1.68, 1.72, .035, .045, '#111111')                  # peephole
            kx = y_ + (.68 if side == 'L' else -.68)
            w_.box(kx - .05, kx + .05, 1.0, 1.2, 0, .025, '#1d1d1d')                       # key-card reader
            w_.box(kx - .02, kx + .02, 1.16, 1.18, .025, .028, '#3cff6a')
            w_.box(kx - .05, kx + .05, 1.45, 1.55, 0, .02, '#f2efe8')                       # DND / service light
            w_.box(kx - .015, kx + .015, 1.49, 1.51, .02, .024, '#ff3b2f' if n % 3 == 0 else '#cfcfcf')
            x, yy = w_.xy(y_, .75)
            B.mark('door_%d' % n, x, yy, 0, face='-x' if side == 'L' else '+x')
            px, py = w_.xy(y_, .05)
            B.mark('plate_%d' % n, px, py, 1.55, face=w_.facing, w=.45, h=.22)
            hq(B, *(sorted([w_.xy(y_ - .55, 0)[0], w_.xy(y_ + .55, .3)[0]]) + sorted([w_.xy(y_ - .55, 0)[1], w_.xy(y_ + .55, .3)[1]])), .01, '#3a2a20')   # threshold mat
    # sconces between the doors, sockets, switches
    for y_ in (-13.0, -6.5, .5, 7.5 + 7, 14.5):
        for w_ in (cL, cR):
            if w_ is cR and nook[0] - .3 < y_ < nook[1] + .3:
                continue
            w_.sconce(y_, 1.95)
    for y_ in (-6.5, 7.5):
        cL.sconce(y_, 1.95)
    cR.sconce(.5 + 0, 1.95) if False else None
    for y_ in (-12.0, -1.0, 9.0):
        cL.socket(y_); cR.socket(y_ - .6)
    # fire extinguisher + fire alarm (left wall, opposite the nook)
    cL.box(7.15, 7.85, 1.65, 2.0, 0, .02, '#c62828')
    cL.box(7.2, 7.8, 1.7, 1.95, .02, .025, '#f2f2f2')
    cL.box(7.42, 7.58, .16, .2, .02, .2, '#3a3a3a')
    cyl(B, *cL.xy(7.5, .12), .2, .78, .085, '#c62828', 10)
    cyl(B, *cL.xy(7.5, .12), .78, .86, .03, '#2a2a2a', 6)
    cL.box(7.46, 7.54, .86, .9, .06, .2, '#2a2a2a')
    cL.box(7.0, 7.12, 1.25, 1.4, 0, .04, '#d32f2f')
    cL.box(7.03, 7.09, 1.29, 1.36, .04, .045, '#f2f2f2')
    # far end: window with curtains, console table, plant, exit sign
    wE.window(0, .5, 2.0, 2.3, '#3a2a20', False, 41, 2)
    wE.curtains(-1.25, 1.25, 2.95, '#7a2531', drawn=(.3, .3))
    wE.box(-.5, .5, 2.98, 3.18, 0, .04, '#f2f2f2')
    wE.box(-.45, .45, 3.0, 3.16, .04, .045, '#19b35a')
    for x in (-1.1, 1.1):
        plant(B, x, CY1 - .45, 1.5, '#2e2a27', .22, 'palm', seed=int(x * 10))
    # ceiling: central bulkhead with downlights
    ceiling(B, CX0, CX1, LY1, CY1, H_, '#f4efe6')
    B.box(-.7, .7, LY1, CY1, H_ - .12, H_, '#f6f1e8', bottom=True)
    for y_ in range(-14, 17, 2):
        downlight(B, 0, y_ + .5, H_ - .12, .06)
    for y_ in (-12, -2, 8):
        cyl(B, 0, y_ + 1.2, H_ - .14, H_ - .12, .06, '#f2f2f2', 8, bottom=True)
        B.box(-.02, .02, y_ + 1.18, y_ + 1.22, H_ - .155, H_ - .14, '#ff3b2f', bottom=True)
    # ice / vending nook
    nx0, nx1 = CX1, CX1 + 1.5
    tile_floor(B, nx0, nx1, nook[0], nook[1], .5, ['#d9d4cb', '#cfc9bf'], '#9a948a')
    B.box(nx0 + .2, nx1 + .2, nook[0] - .2, nook[0], 0, 2.6, '#e8e1d4')
    B.box(nx0 + .2, nx1 + .2, nook[1], nook[1] + .2, 0, 2.6, '#e8e1d4')
    B.box(nx1, nx1 + .2, nook[0], nook[1], 0, 2.6, '#e8e1d4')
    hq(B, nx0, nx1, nook[0], nook[1], 2.6, '#f4efe6')
    hq(B, CX1 - .02, CX1 + .25, nook[0], nook[1], 2.6, '#f4efe6')
    cR.frame((nook[0] + nook[1]) / 2, nook[1] - nook[0], 2.6, '#f6f1e8', 0, .08, .03)
    downlight(B, nx0 + .75, (nook[0] + nook[1]) / 2, 2.6)
    vm = T(B, nx1 - .45, nook[0] + .55, '-x')                     # vending machine
    vm.box(-.45, .45, -.4, .4, 0, 1.85, '#1d1d1f')
    vm.box(-.42, .15, -.42, -.4, .45, 1.78, '#dff4ff')
    for j in range(5):
        for i in range(5):
            vm.box(-.4 + i * .11, -.33 + i * .11, -.43, -.42, .55 + j * .24, .7 + j * .24, ['#c62828', '#1565c0', '#f9a825', '#2e7d32', '#ef6c00'][(i + j) % 5])
    vm.box(.2, .4, -.42, -.4, 1.2, 1.5, '#16263a'); vm.box(.24, .36, -.425, -.42, 1.4, 1.46, '#5cf27a')
    vm.box(-.4, .1, -.43, -.4, .12, .32, '#0f0f0f')
    vm.box(-.45, .45, -.42, -.4, 1.78, 1.85, '#c62828')
    im = T(B, nx1 - .4, nook[1] - .5, '-x')                       # ice machine
    im.box(-.38, .38, -.33, .33, 0, 1.2, '#c8ccd0')
    im.box(-.3, .3, -.35, -.33, .55, 1.0, '#9ea4a8')
    im.box(-.12, .12, -.4, -.33, .4, .45, '#5d6266')
    im.box(-.38, .38, -.33, .33, 1.2, 1.24, '#e0e3e5')
    IW(B, 'R', nx1).box(nook[1] - .9, nook[1] - .1, 1.45, 1.75, 0, .02, '#1565c0')
    IW(B, 'R', nx1).box(nook[1] - .85, nook[1] - .15, 1.5, 1.7, .02, .025, '#e3f2fd')

    B.mark('spawn', 0, -18.3, 0, face='+y')
    B.mark('lift', 0, LY0 + .8, 0, face='-y')
    light(B, 1, 0, -17.5, 2.9, '#ffe2b0', 25, 9)
    for i, y_ in enumerate((-11.0, -4.5, 2.0, 8.5, 14.5)):
        light(B, i + 2, 0, y_, 2.9, '#ffd9a0', 18, 9)
    return B.finish('int_hotel_corridor')


# ================================================================ rooms: shared pieces
def entry_door(B, wF, u, c, frame_c, plan=True):
    """The room's own door (closed, on the inside of the -Y wall) with a fire plan, chain and the key-card slot."""
    wF.door(u, 1.0, 2.25, c, frame_c, GOLD, hinge=-1)
    if plan:
        wF.box(u - .17, u + .17, 1.45, 1.8, .035, .04, '#f4f2ec')
        wF.box(u - .14, u + .14, 1.48, 1.62, .04, .042, '#c62828' if False else '#d8d2c6')
        wF.box(u - .14, u + .14, 1.66, 1.7, .04, .042, '#2e7d32')
    wF.box(u + .62, u + .72, 1.15, 1.3, 0, .03, '#2a2a2a')                         # key-card holder
    wF.box(u + .64, u + .7, 1.27, 1.29, .03, .032, '#3cff6a')
    wF.switch(u + .67, 1.0)


def bath_walls(walls, z1=2.4, c='#e7dfd2', band=None, pw=.6, ph=.3, h=3.2, paint='#f1ece4'):
    """Tiled bathroom walls: walls is a list of (IW, u0, u1, holes)."""
    for w_, a, b, hl in walls:
        w_.clad(a, b, .0, z1, pw, ph, c, hl, o=.008, k=.06, gap=.005, stagger=False)
        if band:
            w_.slab(a, b, 1.05, 1.15, .008, .014, band, hl)
        w_.paint(a, b, z1, h, paint, hl)


def window_wall(w_, u, z0, wd, ht, frame, curtain, sheer='#efe9de', night=False, seed=0, mull=2, rod=GOLD, ztop=None):
    w_.window(u, z0, wd, ht, frame, night, seed, mull)
    w_.curtains(u - wd / 2 - .25, u + wd / 2 + .25, ztop or (z0 + ht + .2), curtain, sheer, (.28, .28), rod)


def room_marks(B, door_u, y0, extra=()):
    B.mark('exit', door_u, y0 + .55, 0, face='-y')
    B.mark('spawn', door_u, y0 + .95, 0, face='+y')


# ================================================================ 3a. standard room (beige / teal)
def int_room_standard(detail=True):
    B = Builder(detail)
    X0, X1, Y0, Y1, Hh = -2.5, 2.5, -3.5, 3.5, 3.2
    WALL_, TEAL, TEAL_D, BEIGE = '#e9dec9', '#2f6e6c', '#1f4f4e', '#d8c7a6'
    WOOD = '#8a6242'; DOORC = '#6b4a31'
    bx1, by1 = -.3, -.9                                       # bathroom: x in [X0, bx1], y in [Y0, by1]
    door_u = 1.1
    # floors
    carpet(B, bx1, X1, by1, Y1, '#b9ab95', '#a89a84', step=.45)
    plank_floor(B, bx1, X1, Y0, by1, '#9a7350', .19, 'y')
    tile_floor(B, X0, bx1, Y0, by1, .6, ['#d9d2c5', '#d2cabd'], '#a39b8e')
    carpet(B, X0, bx1, by1, by1 + .01, '#b9ab95') if False else None
    hq(B, X0, bx1 - .0, by1 - .0, Y1, .0, '#b9ab95')
    carpet(B, X0, bx1, by1, Y1, '#b9ab95', '#a89a84', step=.45)
    W = room_shell(B, X0, X1, Y0, Y1, Hh, WALL_, '#f4f0e8', t=.2, skirt='#f6f2ea', cornice='#f6f2ea')
    wF, wB, wL, wR = W['F'], W['B'], W['L'], W['R']
    hole = (-3.15, -1.95, 0, 2.2)
    pa, pb = partition(B, 'x', bx1, Y0, by1, Hh, WALL_, [hole], skirt='#f6f2ea')       # pa faces the bathroom
    qa, qb = partition(B, 'y', by1, X0, bx1 + .07, Hh, WALL_, [], skirt='#f6f2ea')     # qb faces the bedroom
    opening_trim(pa, pb, -2.55, 1.2, 2.2, '#f6f2ea')
    # bathroom
    bath_walls([(wF, X0, bx1, []), (wL, Y0, by1, []), (pa, Y0, by1, [hole]), (qa, X0, bx1, [])], 2.4, '#e6ddcf', TEAL, h=Hh)
    hq(B, X0, bx1, Y0, by1, 2.6, '#f4f0e8')                                             # lowered bath ceiling
    vanity(T(B, -1.25, Y0 + .3, '+y'), 1.0, '#7a5a40', '#e9e4da')
    mirror(wF, -1.25, 1.65, .9, .8, '#c9a25a')
    wF.box(-1.65, -.85, 2.12, 2.16, 0, .12, LED, bottom=True)
    toilet(T(B, X0 + .3, -2.55, '+x'))
    wL.box(-3.0, -2.86, .95, 1.05, .008, .06, CHROME)                                     # paper holder
    shower(B, X0, bx1, by1 - 1.0, by1, '#e6ddcf', glass_side=('x', by1 - 1.0, -1.35, bx1), rain=False, wall_ws=(wL, by1 - .5))
    towel_rail(pa, -1.85 + 1.0, -1.6 + 1.0, 1.55) if False else None
    towel_rail(qa, -2.3, -1.6, 1.5) if False else None
    towel_rail(wF, -2.4, -1.85, 1.6)
    bath_mat(B, -1.6, -.9, -2.85, -2.45)
    downlight(B, -1.4, -2.3, 2.6)
    downlight(B, -1.4, -1.4, 2.6)
    # entry passage
    entry_door(B, wF, door_u, DOORC, '#f6f2ea')
    wardrobe(T(B, X1 - .3, -2.15, '-x'), 1.5, '#8a6242', 2.3, .6)
    luggage_rack(T(B, X1 - .3, -.55, '-x'))
    suitcase(T(B, X1 - .3, -.55, '-x', .51), '#2b4d63', .62, .3, .22) if False else None
    T(B, X1 - .3, -.55, '-x', .51).box(-.3, .3, -.2, .2, 0, .22, '#2b4d63')
    pb.picture(-1.42, 1.6, .5, .7, '#3a2a20', ['#e8dcc4', TEAL, '#c9a25a', '#8a4a2a'], seed=51)
    downlight(B, door_u, -2.6, Hh); downlight(B, door_u, -1.5, Hh)
    pb.switch(-3.1, 1.1) if False else None
    # bedroom: teal accent wall behind the bed with upholstered panels
    by = 1.45
    wL.box(by - 1.6, by + 1.6, 0, 2.6, 0, .03, TEAL_D)
    for i in range(4):
        a = by - 1.6 + i * .8
        wL.box(a + .02, a + .78, .9, 2.55, .03, .07, vary(TEAL, .04, i))
    wL.box(by - 1.6, by + 1.6, 2.6, 2.64, 0, .08, GOLD)
    bed(T(B, X0 + 1.15, by, '+x'), 1.6, 2.05, '#5a4030', SHEET, '#f7f5f0', '#ffffff', '#c4b294', 1.15, throw=TEAL, euro=(TEAL, '#e8dcc4'))
    for y_ in (by - 1.12, by + 1.12):
        nightstand(T(B, X0 + .25, y_, '+x'), WOOD, '#f6ead2', GOLD, .5, .42, .55)
    wL.sconce(by - 1.12, 1.55) if False else None
    rug(B, -.8, 1.3, by - 1.1, by + 1.1, '#cbbd9f', TEAL, '#e9dcc0', fringe=None, pattern='#7a9a92')
    # TV wall
    tv_console(T(B, X1 - .22, by, '-x'), 1.5, WOOD, .55, .42)
    tv(wR, by, 1.5, 1.2)
    cyl(B, X1 - .3, by + .55, .55, .57, .1, '#2a2a2a', 8)                                   # kettle tray
    kettle(T(B, X1 - .3, by + .5, '-x', .57))
    for k in range(2):
        cyl(B, X1 - .25, by + .25 - k * .1, .57, .66, .04, '#ffffff', 8)
    # desk by the window
    desk(T(B, X1 - .3, 2.95, '-x'), 1.0, WOOD, WOOD, .6, .76, '#3a4a4a', TEAL)
    # window + curtains
    window_wall(wB, -.2, .55, 2.6, 2.2, '#3a3430', TEAL, seed=7)
    split_ac(wR, -1.0 + 3.3, 2.7, .9) if False else None
    split_ac(qb, -1.4, 2.75, .9)
    downlight(B, 0, 1.2, Hh); downlight(B, 1.4, 2.8, Hh); downlight(B, -1.0, 2.8, Hh)
    pendant(B, 0, 1.45, Hh, .6, .3, TEAL) if False else None
    wR.picture(-.9 + 0, 1.75, .01, .01, GOLD, ['#fff', '#fff']) if False else None
    wB.picture(1.95, 1.7, .01, .01, GOLD, ['#fff', '#fff']) if False else None
    wR.socket(.4); wR.socket(2.3); wL.socket(by - 1.45); wL.socket(by + 1.45); qb.switch(-.6, 1.1) if False else None
    for y_ in (by - 1.12, by + 1.12):
        wL.switch(y_, .75)
    plant(B, 1.9, .25, .9, '#e9e3d6', .16, 'bush', seed=55)
    room_marks(B, door_u, Y0)
    B.mark('bed', -1.0, by - .95, 0, face='+y')
    B.mark('tv', .4, by, 0, face='+x')
    light(B, 1, 0, 1.4, 2.8, '#ffe0b0', 22, 8)
    light(B, 2, door_u, -2.2, 2.8, '#ffe6c0', 12, 6)
    light(B, 3, -1.4, -2.2, 2.4, '#fff2dc', 12, 6)
    light(B, 4, X0 + .3, by - 1.1, 1.1, '#ffcf8a', 8, 4)
    return B.finish('int_room_standard')


# ================================================================ 3b. deluxe room (cream / navy / gold)
def int_room_deluxe(detail=True):
    B = Builder(detail)
    X0, X1, Y0, Y1, Hh = -3.5, 3.5, -4.25, 4.25, 3.3
    CREAM, NAVY, NAVY_D, WOOD, DOORC = '#efe6d4', '#22324f', '#17223a', '#5e4330', '#4a3222'
    bx1, by1 = -.4, -.6
    door_u = 1.0
    hole = (-3.9, -2.7, 0, 2.2)
    carpet(B, bx1, X1, by1, Y1, '#cfc4b2', '#bdb19c', step=.5)
    hq(B, X0, bx1, by1, Y1, .0, '#cfc4b2'); carpet(B, X0, bx1, by1, Y1, '#cfc4b2', '#bdb19c', step=.5)
    tile_floor(B, bx1, X1, Y0, by1, .6, ['#e9e3d8', '#ddd5c7'], '#b5ad9f', veins='#cfc5b4')
    tile_floor(B, X0, bx1, Y0, by1, .8, ['#5d636b', '#565c64'], '#3a3e44', veins='#7c838c')
    W = room_shell(B, X0, X1, Y0, Y1, Hh, CREAM, '#f6f1e8', t=.2, skirt='#f8f4ec', cornice='#f8f4ec')
    wF, wB, wL, wR = W['F'], W['B'], W['L'], W['R']
    pa, pb = partition(B, 'x', bx1, Y0, by1, Hh, CREAM, [hole], skirt='#f8f4ec')
    qa, qb = partition(B, 'y', by1, X0, bx1 + .07, Hh, CREAM, [], skirt='#f8f4ec')
    opening_trim(pa, pb, -3.3, 1.2, 2.2, '#f8f4ec')
    # wall panelling (picture-frame mouldings) in the bedroom
    for w_, a, b, hl in ((wR, by1 + .3, Y1 - .3, [(.3, 2.5, 0, 2.3)]), (qb, X0 + .2, bx1 - .1, [])):
        for (p_, q_, r_, t_) in rects_minus(a, b, .3, 2.5, hl):
            n = max(1, round((q_ - p_) / 1.2))
            for j in range(n):
                pa_, pb_ = p_ + (q_ - p_) * j / n + .08, p_ + (q_ - p_) * (j + 1) / n - .08
                for (e0, e1, f0, f1) in ((pa_, pb_, .3, .33), (pa_, pb_, 2.47, 2.5), (pa_, pa_ + .03, .3, 2.5), (pb_ - .03, pb_, .3, 2.5)):
                    w_.box(e0, e1, f0, f1, .0, .02, '#fbf8f2')
    # bathroom: marble walls, bathtub, double vanity, toilet
    bath_walls([(wF, X0, bx1, []), (wL, Y0, by1, []), (pa, Y0, by1, [hole]), (qa, X0, bx1, [])], 2.5, '#efebe4', GOLD, 1.2, .6, Hh, '#f4f0ea')
    hq(B, X0, bx1, Y0, by1, 2.7, '#f6f1e8')
    bathtub(T(B, -2.4, by1 - .45, '-y'), 1.75, .8, WHITE_P, .58, CHROME, '#e9e4dc')
    qa.box(-3.3, -1.5, 1.85, 1.89, 0, .1, GOLD)
    towel_rail(qa, -1.35, -.6, 1.5)
    vanity(T(B, X0 + .3, -2.15, '+x'), 1.5, NAVY, '#f2eee8', sinks=2)
    for y_ in (-2.55, -1.75):
        mirror(wL, y_, 1.7, .6, .85, GOLD)
        wL.sconce(y_ - .42, 1.75, GOLD, '#fff6e2') if False else None
    wL.box(-2.2, -2.1, 1.3, 2.2, 0, .05, GOLD); wL.box(-2.19, -2.11, 1.32, 2.18, .05, .06, BULB)
    toilet(T(B, -1.3, Y0 + .35, '+y'))
    wF.box(-.95, -.85, .9, 1.0, .008, .07, CHROME)
    bath_mat(B, -2.9, -2.1, -1.9, -1.5, '#f2eee6')
    hq(B, -3.3, -1.5, -1.12, -1.1, 2.69, LED) if False else None
    downlight(B, -2.0, -2.8, 2.7); downlight(B, -2.0, -1.4, 2.7); downlight(B, -1.0, -3.6, 2.7)
    # entry: door, wardrobe, minibar, full-length mirror, luggage rack
    entry_door(B, wF, door_u, DOORC, '#f8f4ec')
    wardrobe(T(B, X1 - .3, -3.1, '-x'), 1.6, WOOD, 2.4, .6)
    t = T(B, X1 - .3, -1.6, '-x')
    t.box(-.45, .45, -.3, .3, 0, .9, WOOD)
    t.box(-.42, .42, -.31, -.3, .05, .85, shade(WOOD, .85))
    minibar(T(B, X1 - .3, -1.6, '-x', 0)) if False else None
    t.box(-.4, .4, -.25, .25, .9, .93, '#f2eee8')
    kettle(t.at(-.25, 0)); t.at(-.25, 0).box(0, 0, 0, 0, 0, 0, '#000') if False else None
    for k, col in enumerate(('#2e7d32', '#c62828', '#f9a825')):
        t.cyl(.05 + k * .1, .05, .93, 1.15, .03, col, 6)
    tt = T(B, X1 - .3, -1.6, '-x', .93)
    kettle(tt.at(-.25, 0))
    mirror(pb, -1.5, 1.2, .7, 1.9, GOLD)
    downlight(B, door_u, -3.4, Hh); downlight(B, door_u, -2.0, Hh)
    # bedroom
    by = 1.7
    wL.box(by - 1.7, by + 1.7, 0, 2.9, 0, .04, NAVY_D)
    wL.box(by - 1.75, by + 1.75, 2.9, 2.95, 0, .1, GOLD)
    bed(T(B, X0 + 1.2, by, '+x'), 1.95, 2.1, NAVY_D, SHEET, '#fbf9f4', '#ffffff', NAVY, 1.75, throw=NAVY, tufted=True, hb_w=2.5,
        euro=(GOLD, NAVY))
    for y_ in (by - 1.45, by + 1.45):
        nightstand(T(B, X0 + .28, y_, '+x'), '#f1ebe0', '#f7ecd6', GOLD, .55, .45, .58)
    wL.picture(by, 3.1 - .02, .01, .01, GOLD, ['#fff', '#fff']) if False else None
    for y_ in (by - 1.45, by + 1.45):
        pendant(B, X0 + .3, y_, Hh, 1.45, .14, GOLD)
    t = T(B, X0 + 2.45, by, '+x')                                          # bench at the foot of the bed
    t.box(-.75, .75, -.2, .2, .3, .45, NAVY)
    for x in (-.7, .7):
        t.box(x - .025, x + .025, -.17, .17, 0, .3, GOLD)
    rug(B, -1.6, 1.6, by - 1.6, by + 1.6, '#e7dcc5', NAVY, GOLD, fringe=None, pattern='#c9b48a')
    tv_console(T(B, X1 - .23, by, '-x'), 1.8, '#f1ebe0', .55, .45, '#e9e3d8')
    tv(wR, by, 1.55, 1.4)
    flowers(B, X1 - .25, by + .7, .55, .14, '#1d2a44', ('#ffffff', '#f3e7d3', GOLD), seed=17, h=.35)
    # armchairs and a little round table by the window
    round_table(T(B, 2.4, 3.3), .35, '#f2eee8', GOLD, .6)
    armchair(T(B, 1.5, 3.25, '+x'), NAVY, '#2c3e60', w=.8, d=.8, pillow_c=(GOLD, NAVY), legs=GOLD)
    armchair(T(B, 2.5, 2.35, '+y'), '#e7dcc5', '#efe6d4', w=.8, d=.8, pillow_c=(NAVY, GOLD), legs=GOLD)
    fruit_bowl(B, 2.4, 3.3, .6)
    plant(B, X1 - .4, Y1 - .5, 1.6, '#2e2a27', .25, 'palm', seed=8)
    window_wall(wB, 0, .35, 5.2, 2.55, '#2c2622', NAVY, seed=11, mull=4, ztop=3.05)
    wB.box(-3.2, 3.2, 3.05, 3.3, .0, .25, '#f8f4ec')                          # curtain pelmet
    for (u, z, w_, h_) in ((-.2, 1.85, .01, .01),):
        pass
    split_ac(qb, -2.0, 2.85, .95)
    wR.picture(-0.3 + 0, 1.75, .01, .01, GOLD, ['#fff', '#fff']) if False else None
    qb.picture(-2.0, 1.55, 1.3, .9, GOLD, ['#e8dcc4', NAVY, GOLD, '#8a4a2a', '#2e5a52'], seed=61)
    # ceiling: tray with cove light and a drum light
    ceiling(B, -1.5, 2.5, by - 1.5, by + 1.5, Hh + .2, '#f8f4ec')
    for (a, b, c_, d) in [(-1.5, 2.5, by - 1.5, by - 1.49), (-1.5, 2.5, by + 1.49, by + 1.5), (-1.5, -1.49, by - 1.5, by + 1.5), (2.49, 2.5, by - 1.5, by + 1.5)]:
        B.box(a, b, c_, d, Hh, Hh + .2, '#f6f1e8')
    for (a, b, c_, d) in [(-1.45, 2.45, by - 1.45, by - 1.38), (-1.45, 2.45, by + 1.38, by + 1.45), (-1.45, -1.38, by - 1.45, by + 1.45), (2.38, 2.45, by - 1.45, by + 1.45)]:
        hq(B, a, b, c_, d, Hh + .02, LED)
    cyl(B, .5, by, Hh + .2 - .35, Hh + .2, .4, '#f3e6cc', 14, bottom=False)
    disc(B, .5, by, Hh + .2 - .35, .38, BULB, 14)
    B.box(.5 - .4, .5 + .4, by - .01, by + .01, Hh - .16, Hh - .14, GOLD, bottom=True) if False else None
    for (x, y) in ((-2.6, -.1), (2.6, -.1), (-2.6, 3.8), (2.6, 3.8)):
        downlight(B, x, y, Hh)
    ceiling(B, X0, X1, Y0, Y1, Hh, '#f6f1e8', []) if False else None
    for y_ in (by - 1.6, by + 1.6):
        wL.socket(y_ - .1); wL.switch(y_ - .1, .75)
    wR.socket(by - 1.1); wR.socket(3.5)
    room_marks(B, door_u, Y0)
    B.mark('bed', -1.0, by - 1.3, 0, face='+y')
    B.mark('tv', 1.8, by, 0, face='+x')
    light(B, 1, .5, by, 2.8, '#ffe0b0', 25, 9)
    light(B, 2, door_u, -2.6, 2.9, '#ffe6c0', 12, 6)
    light(B, 3, -2.0, -2.4, 2.5, '#fff2dc', 14, 6)
    light(B, 4, X0 + .3, by - 1.45, 1.6, '#ffcf8a', 8, 4)
    light(B, 5, 2.3, 3.3, 2.4, '#ffd9a0', 10, 5)
    return B.finish('int_room_deluxe')


def panel_mouldings(w_, a, b, z0, z1, c, holes=(), pw=1.2, d=.02):
    for (p_, q_, r_, t_) in rects_minus(a, b, z0, z1, holes):
        n = max(1, round((q_ - p_) / pw))
        for j in range(n):
            pa_, pb_ = p_ + (q_ - p_) * j / n + .08, p_ + (q_ - p_) * (j + 1) / n - .08
            if pb_ - pa_ < .25:
                continue
            for (e0, e1, f0, f1) in ((pa_, pb_, r_, r_ + .03), (pa_, pb_, t_ - .03, t_), (pa_, pa_ + .03, r_, t_), (pb_ - .03, pb_, r_, t_)):
                w_.box(e0, e1, f0, f1, 0, d, c)


def sideboard(t, w, c, top, h=.8, d=.45, legs=GOLD):
    for x in (-w / 2 + .05, w / 2 - .05):
        t.box(x - .02, x + .02, -d / 2 + .04, d / 2 - .04, 0, .15, legs)
    t.box(-w / 2, w / 2, -d / 2, d / 2, .15, h, c)
    t.box(-w / 2 - .01, w / 2 + .01, -d / 2 - .01, d / 2 + .01, h, h + .03, top)
    n = max(2, round(w / .45))
    for i in range(n):
        a = -w / 2 + w * i / n
        t.box(a + .01, a + w / n - .01, -d / 2 - .012, -d / 2, .19, h - .04, vary(c, .05, i, 21))
        t.box(a + w / n / 2 - .01, a + w / n / 2 + .01, -d / 2 - .03, -d / 2, h * .5, h * .5 + .12, legs)


def table_lamp(B, x, y, z, base=GOLD, sh='#f3e6cc', h=.55):
    cyl(B, x, y, z, z + .04, .09, base, 8)
    frustum(B, x, y, z + .04, z + h * .55, .07, .04, base, 8)
    cyl(B, x, y, z + h * .55, z + h * .65, .012, base, 6)
    frustum(B, x, y, z + h * .6, z + h, .2, .14, sh, 10, True, True)
    disc(B, x, y, z + h * .6 - .001, .18, BULB, 10)


# ================================================================ 3c. executive suite (grey / emerald)
def int_suite_exec(detail=True):
    B = Builder(detail)
    X0, X1, Y0, Y1, Hh = -5.0, 5.0, -4.5, 4.5, 3.3
    GREY, GREY_D, EMER, EMER_D, WOOD = '#dcdcd8', '#7b7f85', '#1f5c4a', '#15443a', '#4a3a2e'
    PX = -.5                                                     # partition: bedroom + bath on the left, parlour on the right
    PY = -.3
    door_u = 3.2
    bed_hole = (1.2, 3.2, 0, 2.5)
    bath_hole = (-2.4, -1.2, 0, 2.2)
    # floors
    plank_floor(B, PX, X1, Y0, Y1, '#a88a68', .2, 'y')
    carpet(B, X0, PX, PY, Y1, '#8f9196', '#83858a', step=.45)
    tile_floor(B, X0, PX, Y0, PY, .9, ['#cfcfcc', '#c6c6c3'], '#9a9a97', veins='#b5b5b2')
    W = room_shell(B, X0, X1, Y0, Y1, Hh, GREY, '#f2f2ef', t=.2, skirt='#f6f6f3', cornice='#f6f6f3')
    wF, wB, wL, wR = W['F'], W['B'], W['L'], W['R']
    pa, pb = partition(B, 'x', PX, Y0, Y1, Hh, GREY, [bed_hole], skirt='#f6f6f3', cornice='#f6f6f3')   # pa: bed/bath side, pb: parlour
    qa, qb = partition(B, 'y', PY, X0, PX - .07, Hh, GREY, [bath_hole], skirt='#f6f6f3')            # qa: bath side, qb: bedroom
    opening_trim(pa, pb, 2.2, 2.0, 2.5, '#2b2b2b', .09)
    opening_trim(qa, qb, -1.8, 1.2, 2.2, '#f6f6f3')
    hq(B, PX - .07, PX + .07, bed_hole[0], bed_hole[1], .012, '#3a3a3a')                       # threshold
    # parlour: emerald TV wall with fluted panels
    ty = .8
    wR.box(ty - 1.7, ty + 1.7, 0, 3.0, 0, .04, EMER_D)
    for i in range(int(3.4 / .12)):
        u = ty - 1.7 + i * .12
        wR.box(u + .01, u + .1, .1, 2.95, .04, .07, vary(EMER, .04, i))
    wR.box(ty - 1.75, ty + 1.75, 3.0, 3.04, 0, .1, GOLD)
    tv(wR, ty, 1.6, 1.65, .07)
    t = T(B, X1 - .3, ty, '-x')
    t.box(-1.3, 1.3, -.2, .2, .35, .55, '#2b2b2b', bottom=True)                              # floating console
    t.box(-1.3, 1.3, -.21, -.2, .52, .53, LED)
    for k, x in enumerate((-.9, .9)):
        t.box(x - .12, x + .12, -.1, .1, .55, .75 + .1 * k, ['#d8cfc0', '#1f5c4a'][k])
    sofa(T(B, 1.0, ty, '+x'), 2.5, GREY_D, '#8a8e94', pillows=[(EMER, '#e8dcc4'), ('#c9a25a', EMER), (EMER, GOLD)])
    coffee_table(T(B, 2.55, ty, '+x'), 1.2, .7, '#2b2b2b', GOLD, .4)
    flowers(B, 2.55, ty + .2, .4, .12, '#e9e3d6', ('#ffffff', '#f3e7d3', '#c9a25a'), seed=33, h=.3)
    B.box(2.4, 2.7, ty - .3, ty - .05, .4, .44, '#e8dcc4')
    for (yy, f) in ((ty - 1.45, '+y'), (ty + 1.45, '-y')):
        armchair(T(B, 2.55, yy, f), EMER, '#2a6e5a', w=.82, d=.82, pillow_c=('#e8dcc4', EMER), legs=GOLD)
    rug(B, .3, 3.5, ty - 2.0, ty + 2.0, '#b8b8b4', '#3a3c40', EMER, fringe=None, pattern='#9a9c9e')
    for (yy) in (ty - 1.6, ty + 1.6):                                                    # side tables + lamps
        round_table(T(B, .5, yy), .22, '#2b2b2b', GOLD, .55)
        table_lamp(B, .5, yy, .55, GOLD, '#efe8da', .5)
    # dining for two by the window
    dining(T(B, 3.6, 3.55), .9, .8, '#3a2e26', GOLD, EMER, '#2a6e5a', n_side=1) if False else None
    dt = T(B, 3.7, 3.4, '+x')
    dt.box(-.45, .45, -.4, .4, .72, .76, '#3a2e26'); dt.cyl(0, 0, 0, .72, .05, GOLD, 8); dt.cyl(0, 0, 0, .03, .3, GOLD, 10)
    for f, (x, y) in (('+x', (2.9, 3.4)), ('-x', (4.5, 3.4))):
        chair(T(B, x, y, f), EMER, '#2a6e5a', .47, .95, .46, GOLD)
    for x in (3.55, 3.85):
        cyl(B, x, 3.4, .76, .78, .11, '#ffffff', 10)
    cyl(B, 3.7, 3.25, .76, .98, .025, '#2e7d32', 6); cyl(B, 3.7, 3.25, .98, 1.03, .012, GOLD, 6)
    pendant(B, 3.7, 3.4, Hh, 1.15, .28, GOLD)
    window_wall(wB, 2.4, .5, 3.6, 2.2, '#2b2b2b', EMER_D, seed=21, mull=3)
    # entry zone: sideboard with lamp + art on the partition, plant, coat stand
    sideboard(T(B, PX + .3, -2.8, '+x'), 1.6, '#3a2e26', '#2b2b2b')
    table_lamp(B, PX + .3, -3.3, .83, GOLD, '#efe8da', .55)
    pb.picture(-2.8, 1.85, 1.3, .9, GOLD, ['#e2dccf', EMER, '#c9a25a', '#3a3c40', '#8a4a2a'], seed=71)
    plant(B, X1 - .45, Y0 + .5, 1.7, '#2b2b2b', .26, 'palm', seed=9)
    entry_door(B, wF, door_u, '#3a2e26', '#f6f6f3')
    split_ac(wF, .8, 2.8, .95)
    # parlour ceiling: tray + modern pendant cluster
    ceiling(B, .6, 4.2, ty - 1.4, ty + 1.4, Hh + .2, '#f6f6f3')
    for (a, b, c_, d) in [(.6, 4.2, ty - 1.4, ty - 1.39), (.6, 4.2, ty + 1.39, ty + 1.4), (.6, .61, ty - 1.4, ty + 1.4), (4.19, 4.2, ty - 1.4, ty + 1.4)]:
        B.box(a, b, c_, d, Hh, Hh + .2, '#f2f2ef')
    for (a, b, c_, d) in [(.65, 4.15, ty - 1.35, ty - 1.28), (.65, 4.15, ty + 1.28, ty + 1.35), (.65, .72, ty - 1.35, ty + 1.35), (4.08, 4.15, ty - 1.35, ty + 1.35)]:
        hq(B, a, b, c_, d, Hh + .02, LED)
    for k in range(7):
        a = 2 * math.pi * k / 7
        pendant(B, 2.4 + .45 * math.cos(a), ty + .45 * math.sin(a), Hh + .2, 1.0 + .35 * hsh(k, 4), .12, GOLD)
    pendant(B, 2.4, ty, Hh + .2, 1.2, .14, GOLD)
    for (x, y) in ((door_u, -3.6), (door_u, -2.2), (1.2, -3.6), (4.3, -1.4)):
        downlight(B, x, y, Hh)
    # bedroom
    by = 2.1
    wL.box(by - 1.8, by + 1.8, 0, 2.8, 0, .04, '#c9cac6')
    panel_mouldings(wL, by - 1.8, by + 1.8, .3, 2.6, '#e9e9e6', [], .9)
    bed(T(B, X0 + 1.15, by, '+x'), 1.95, 2.1, '#3a3c40', SHEET, '#f6f6f3', '#ffffff', GREY_D, 1.55, throw=EMER, tufted=False, hb_w=2.4, euro=(EMER, GOLD))
    for y_ in (by - 1.42, by + 1.42):
        nightstand(T(B, X0 + .28, y_, '+x'), '#2b2b2b', '#efe8da', GOLD, .52, .44, .56)
    t = T(B, X0 + 2.45, by, '+x')
    t.box(-.75, .75, -.2, .2, .3, .45, EMER)
    for x in (-.7, .7):
        t.box(x - .025, x + .025, -.17, .17, 0, .3, GOLD)
    rug(B, -3.3, -1.0, by - 1.5, by + 1.5, '#aeb0b2', EMER_D, fringe=None)
    wardrobe(T(B, -3.9, PY + .38, '+y'), 1.8, '#3a3c40', 2.4, .6)
    armchair(T(B, -1.2, 3.8, '-x'), EMER, '#2a6e5a', w=.8, d=.8, pillow_c=('#e8dcc4', EMER), legs=GOLD)
    table_lamp(B, -1.2, 3.0, .0, GOLD, '#efe8da', 1.55) if False else None
    window_wall(wB, -3.0, .55, 2.6, 2.2, '#2b2b2b', EMER_D, seed=22, mull=2)
    split_ac(pa, 3.4 if False else 0.4, 2.8, .9) if False else split_ac(qb, -3.9, 2.85, .9) if False else None
    pa.picture(.4, 1.6, .9, .7, GOLD, ['#e2dccf', EMER, '#c9a25a', '#3a3c40'], seed=72)
    downlight(B, -2.8, by, Hh); downlight(B, -1.4, .6, Hh); downlight(B, -1.4, 3.8, Hh)
    # bathroom: grey stone, shower in the corner, tub, double vanity, toilet
    bath_walls([(wF, X0, PX, []), (wL, Y0, PY, []), (pa, Y0, PY, []), (qa, X0, PX, [bath_hole])], 2.5, '#d8d8d4', EMER, .6, 1.2, Hh, '#efefec')
    hq(B, X0, PX, Y0, PY, 2.7, '#f2f2ef')
    shower(B, X0, -3.6, Y0, -3.1, '#d8d8d4', glass_side=('x', -3.1, X0, -3.6), rain=True, wall_ws=(wL, -3.8))
    frame_glass(B, 'y', -3.6, Y0, -3.95, 2.0)
    vanity(T(B, -2.3, Y0 + .3, '+y'), 1.6, '#2b2b2b', '#e9e9e6', sinks=2)
    mirror(wF, -2.3, 1.7, 1.5, .85, GOLD)
    toilet(T(B, PX - .3, -3.6, '-x'))
    bathtub(T(B, X0 + .42, -1.9, '+x'), 1.7, .8, WHITE_P, .58, CHROME, '#5d6268')
    towel_rail(pa, -2.6, -1.8, 1.5, ('#ffffff', '#2a6e5a'))
    bath_mat(B, -4.2, -3.6, -2.4, -1.4)
    downlight(B, -2.3, -3.6, 2.7); downlight(B, -2.8, -1.6, 2.7); downlight(B, -4.3, -3.8, 2.7)
    room_marks(B, door_u, Y0)
    B.mark('bed', -2.2, by - 1.35, 0, face='+y')
    B.mark('tv', 1.9, ty, 0, face='+x')
    light(B, 1, 2.4, ty, 2.6, '#ffe0b0', 25, 10)
    light(B, 2, 3.7, 3.4, 2.1, '#ffd9a0', 10, 5)
    light(B, 3, -2.8, by, 2.8, '#ffe0b0', 20, 8)
    light(B, 4, -2.6, -2.4, 2.5, '#fff2dc', 16, 7)
    light(B, 5, door_u, -2.8, 2.9, '#ffe6c0', 12, 6)
    light(B, 6, X0 + .3, by - 1.42, 1.1, '#ffcf8a', 8, 4)
    return B.finish('int_suite_exec')


# ================================================================ 3d. family suite (warm wood / terracotta)
def int_suite_family(detail=True):
    B = Builder(detail)
    X0, X1, Y0, Y1, Hh = -6.0, 6.0, -5.0, 5.0, 3.3
    WALL_, TERRA, TERRA_D, WOOD, WOOD_L, CREAM = '#efe4d2', '#b5573a', '#8e3f2a', '#6e4a2e', '#a77b52', '#f4ece0'
    PX, PY = -1.8, -1.6
    door_u = 0.2
    bed_hole = (.0, 1.4, 0, 2.3)
    bath_hole = (-4.4, -3.2, 0, 2.2)
    # floors: warm wood in the living space, carpet in the bedroom, terracotta tiles in the kitchen and bath
    plank_floor(B, PX, X1, Y0, Y1, '#9b6e47', .19, 'x')
    tile_floor(B, 1.0, X1, Y0, -2.6, .5, ['#b8714f', '#ad6849'], '#8a5a44', z=.002, k=.05)
    carpet(B, X0, PX, PY, Y1, '#cdb9a0', '#bda88e', step=.45)
    tile_floor(B, X0, PX, Y0, PY, .6, ['#e2d4bf', '#d8c9b3'], '#a8977f', veins='#cdbca3')
    W = room_shell(B, X0, X1, Y0, Y1, Hh, WALL_, '#f6f0e6', t=.2, skirt='#7a5234', cornice='#f7f1e7')
    wF, wB, wL, wR = W['F'], W['B'], W['L'], W['R']
    pa, pb = partition(B, 'x', PX, Y0, Y1, Hh, WALL_, [bed_hole, bath_hole], skirt='#7a5234', cornice='#f7f1e7')
    qa, qb = partition(B, 'y', PY, X0, PX - .07, Hh, WALL_, [], skirt='#7a5234')
    opening_trim(pa, pb, .7, 1.4, 2.3, WOOD)
    opening_trim(pa, pb, -3.8, 1.2, 2.2, WOOD)
    # ---- kitchen (front right): L-shaped units, hob + hood, sink, fridge, microwave
    KW = '#c4673f'                                                       # terracotta lacquer fronts
    fridge(T(B, 1.5, Y0 + .36, '+y'))
    base_units(T(B, 3.4, Y0 + .3, '+y'), 2.6, '#3a2a1e', KW, '#e8dfd0', sink_at=-.3)
    base_units(T(B, X1 - .3, -3.55, '-x'), 2.3, '#3a2a1e', KW, '#e8dfd0', hob_at=.2)
    B.box(X1 - .6, X1, Y0, Y0 + .6, 0, .9, '#3a2a1e'); B.box(X1 - .62, X1, Y0, Y0 + .62, .86, .9, '#e8dfd0')
    wall_units(T(B, 3.4, Y0 + .18, '+y'), 2.6, KW, 1.5, .75, .35, CHROME, glass='#d9cbb5')
    wall_units(T(B, X1 - .18, -2.9, '-x'), 1.0, KW, 1.5, .75, .35)
    wall_units(T(B, X1 - .18, -4.6, '-x'), .8, KW, 1.5, .75, .35)
    hood(T(B, X1 - .3, -3.35, '-x'), .6, 1.55, '#b8bcbf', Hh)
    for (w_, a, b) in ((wF, 2.0, X1), (wR, Y0, -2.3)):                        # zellige-style backsplash
        wall_tiles(w_, a, b, .9, 1.5, .15, .15, '#e6d6bd', k=.08)
    microwave(T(B, X1 - .3, -2.6, '-x', .9))
    kettle(T(B, 2.6, Y0 + .3, '+y', .9))
    fruit_bowl(B, 4.4, Y0 + .3, .9)
    for k in range(3):                                                      # canisters
        cyl(B, 4.9 + k * .16, Y0 + .18, .9, 1.1 + .03 * k, .055, ['#f2ece0', TERRA, '#f2ece0'][k], 8)
    T(B, 3.1, Y0 + .3, '+y', .9).box(-.18, .18, -.12, .05, 0, .02, '#7a5234')       # chopping board
    for x in (2.6, 3.6, 4.6):
        pendant(B, x, -3.9, Hh, 1.05, .16, TERRA) if False else None
    for (x, y) in ((3.0, -3.6), (4.6, -3.6)):
        downlight(B, x, y, Hh)
    # ---- dining table for four
    dt = T(B, 2.9, -1.0, '-y')
    dining(dt, 1.5, .9, WOOD, WOOD, WOOD, TERRA, n_side=2)
    flowers(B, 2.9, -1.0, .76, .13, '#e8dcc4', ('#e8a33c', '#ffffff', '#c8102e'), seed=44, h=.32)
    for dx in (-.35, 0, .35):
        pendant(B, 2.9 + dx, -1.0, Hh, 1.3, .17, '#c9a25a' if dx else TERRA)
    # ---- parlour (back right): sofa set facing the TV on the right wall
    ty = 2.5
    wR.box(ty - 1.8, ty + 1.8, 0, 2.9, 0, .04, WOOD)
    for i in range(int(3.6 / .2)):
        u = ty - 1.8 + i * .2
        wR.box(u + .01, u + .18, .05, 2.85, .04, .06, vary(WOOD_L, .08, i, 3))
    tv(wR, ty, 1.55, 1.5, .06)
    tv_console(T(B, X1 - .27, ty, '-x'), 2.2, WOOD, .5, .44, '#3a2a1e')
    sofa(T(B, 1.4, ty, '+x'), 2.6, TERRA, '#c77755', pillows=[('#1c5f8a', '#e8a33c'), ('#f2c14e', '#2e7d4f'), ('#efe4d2', TERRA)])
    sofa(T(B, 3.2, ty + 1.75, '-y'), 1.8, '#d9c6a8', '#e6d6bd', pillows=[(TERRA, '#f2c14e'), ('#2e7d4f', '#f2e3c8')], seeds=None) if False else None
    sofa(T(B, 3.2, ty + 1.75, '-y'), 1.8, '#d9c6a8', '#e6d6bd', pillows=[(TERRA, '#f2c14e'), ('#2e7d4f', '#f2e3c8')])
    armchair(T(B, 3.2, ty - 1.6, '+y'), '#d9c6a8', '#e6d6bd', pillow_c=(TERRA, '#f2e3c8'), legs=WOOD)
    coffee_table(T(B, 3.0, ty, '+x'), 1.2, .7, WOOD_L, WOOD, .42)
    fruit_bowl(B, 3.0, ty, .42)
    rug(B, 1.0, 4.6, ty - 2.0, ty + 2.2, '#d9b38c', TERRA_D, '#efe4d2', pattern='#9b4a30')
    plant(B, X1 - .5, Y1 - .5, 1.8, TERRA, .28, 'palm', seed=15)
    plant(B, PX + .45, Y1 - .45, 1.5, TERRA, .24, 'bush', seed=16)
    window_wall(wB, 2.4, .5, 4.4, 2.2, '#3a2a1e', TERRA, seed=31, mull=4)
    ceiling_fan(B, 3.0, ty, Hh)
    for (x, y) in ((door_u, -4.0), (door_u, -2.6), (-.6, -.6), (-.6, 3.5)):
        downlight(B, x, y, Hh)
    entry_door(B, wF, door_u, WOOD, '#f7f1e7')
    t = T(B, -1.3, -4.6, '+y') if False else None
    pb.picture(-1.0, 1.65, 1.6, 1.0, WOOD, ['#e8d5b5', TERRA, '#1c5f8a', '#e8a33c', '#2e7d4f', '#3b2c24'], seed=81)
    pb.picture(3.2, 1.65, .8, 1.0, WOOD, ['#efe4d2', TERRA, '#2e7d4f', '#e8a33c'], seed=82)
    sideboard(T(B, PX + .27, -1.0, '+x'), 1.3, WOOD, '#3a2a1e', .8, .42, WOOD)
    table_lamp(B, PX + .27, -1.4, .83, '#3a2a1e', '#f3e6cc', .5)
    split_ac(wB, -.6, 2.85, .95)
    # ---- bedroom (left back): king bed + a single bed
    by = 2.9
    wL.box(by - 1.75, by + 1.75, 0, 1.4, 0, .05, WOOD)
    wL.box(by - 1.75, by + 1.75, 1.4, 1.44, 0, .08, '#3a2a1e')
    bed(T(B, X0 + 1.15, by, '+x'), 1.9, 2.1, WOOD, SHEET, '#f7f1e7', '#ffffff', TERRA, 1.3, throw=TERRA, euro=('#f2c14e', TERRA))
    for y_ in (by - 1.4, by + 1.4):
        nightstand(T(B, X0 + .27, y_, '+x'), WOOD, '#f3e6cc', '#3a2a1e', .5, .42, .55)
    bed(T(B, -2.9, PY + 1.05, '+y'), .95, 1.95, WOOD, SHEET, '#f7f1e7', '#ffffff', '#c77755', 1.0, throw='#2e7d4f')
    T(B, -3.75, PY + .3, '+y').box(-.2, .2, -.2, .2, 0, .5, WOOD)          # its little nightstand
    table_lamp(B, -3.75, PY + .3, .5, '#3a2a1e', '#f3e6cc', .4)
    B.box(-2.95, -2.3, PY + .5, PY + .75, .62, .78, '#c9a25a') if False else None
    wardrobe(T(B, X0 + .3, -.5, '+x'), 1.6, WOOD, 2.3, .6) if False else None
    wardrobe(T(B, -4.5, Y1 - .3, '-y'), 1.8, WOOD, 2.3, .6) if False else None
    window_wall(wB, -4.0, .6, 2.0, 2.1, '#3a2a1e', TERRA, seed=32, mull=2)
    wardrobe(T(B, X0 + .3, .25, '+x'), 1.3, WOOD_L, 2.3, .6) if False else None
    rug(B, -3.6, -2.0, by - 1.3, by + 1.3, '#d9b38c', TERRA_D, fringe='#efe4d2')
    wardrobe(T(B, PX - .37, 3.6, '-x'), 1.6, WOOD_L, 2.3, .6)
    toybox = T(B, -3.4, Y1 - .35, '-y')
    toybox.box(-.4, .4, -.22, .22, 0, .45, '#2e7d4f'); toybox.box(-.42, .42, -.24, .24, .45, .5, '#f2c14e')
    T(B, -3.4, Y1 - .35, '-y', .5).box(-.15, .05, -.1, .1, 0, .22, '#c62828')   # a toy on top
    T(B, -3.4, Y1 - .35, '-y', .5).box(.1, .3, -.08, .08, 0, .12, '#1565c0')
    ceiling_fan(B, -3.9, 1.7, Hh)
    downlight(B, -2.4, -.8, Hh); downlight(B, -2.4, 4.3, Hh)
    qb.picture(-4.3, 1.75, .9, .7, WOOD, ['#efe4d2', TERRA, '#2e7d4f', '#e8a33c'], seed=83)
    # ---- bathroom (left front)
    bath_walls([(wF, X0, PX, []), (wL, Y0, PY, []), (pa, Y0, PY, [bath_hole]), (qa, X0, PX, [])], 2.4, '#efe6d8', TERRA, .3, .6, Hh, '#f6efe4')
    hq(B, X0, PX, Y0, PY, 2.65, '#f6f0e6')
    bathtub(T(B, -4.95, Y0 + .42, '+y'), 1.7, .8, WHITE_P, .58, CHROME, TERRA)
    shower(B, X0, -4.7, PY - 1.3, PY, '#efe6d8', glass_side=('y', -4.7, PY - 1.3, PY - .5), wall_ws=(wL, PY - .65))
    frame_glass(B, 'x', PY - 1.3, X0, -4.7, 2.0) if False else None
    vanity(T(B, -3.4, PY - .3, '-y'), 1.3, WOOD, '#f2ece2', sinks=1)
    mirror(qa, -3.4, 1.7, 1.1, .85, WOOD)
    toilet(T(B, -2.7, Y0 + .32, '+y'))
    towel_rail(wF, -4.0, -3.3, 1.55) if False else towel_rail(wL, -3.4, -2.7, 1.55)
    bath_mat(B, -4.6, -3.8, -4.2, -3.8)
    downlight(B, -3.9, -3.3, 2.65); downlight(B, -2.7, -4.3, 2.65)
    room_marks(B, door_u, Y0)
    B.mark('bed', -3.4, by - 1.25, 0, face='+y')
    B.mark('bed_single', -2.9, PY + 2.4, 0, face='-y')
    B.mark('tv', 2.4, ty, 0, face='+x')
    light(B, 1, 3.0, ty, 2.8, '#ffe0b0', 25, 10)
    light(B, 2, 2.9, -1.0, 2.2, '#ffd9a0', 14, 7)
    light(B, 3, 3.6, -3.6, 2.8, '#fff0d8', 16, 7)
    light(B, 4, -3.9, 1.7, 2.8, '#ffe0b0', 20, 8)
    light(B, 5, -3.9, -3.3, 2.5, '#fff2dc', 14, 6)
    light(B, 6, door_u, -3.2, 2.9, '#ffe6c0', 12, 6)
    return B.finish('int_suite_family')


def grand_piano(t, c='#0e0e0f'):
    """A grand piano, keyboard toward local -y, lid raised on its stick."""
    P = [(-.75, -.95), (.75, -.95), (.75, -.2), (.6, .2), (.35, .45), (.15, .75), (-.05, .95), (-.4, 1.02), (-.75, .95)]
    for z0, z1, col in ((.62, .95, c),):
        for i in range(len(P)):
            a, b = P[i], P[(i + 1) % len(P)]
            t.face([(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)], col)
        t.face([(x, y, z0) for x, y in P], col)
        t.face([(x * .96, y * .96, z1 - .02) for x, y in P], '#3a2a1a')               # soundboard / strings inside
    for i in range(len(P)):                                                            # gold strings hint
        pass
    for k in range(9):
        x = -.6 + k * .14
        t.box(x, x + .005, -.7, .6 - abs(x) * .5, .935, .94, GOLD)
    ang = math.radians(32)
    L = [(-.75 + (x + .75) * math.cos(ang), y, .95 + (x + .75) * math.sin(ang)) for x, y in P]
    t.face(L, c)
    t.box(.3, .33, .1, .13, .95, .95 + 1.05 * math.sin(ang) * .95, '#1a1a1a')             # lid stick
    t.box(-.72, .72, -1.12, -.92, .7, .76, c)                                               # key bed
    t.box(-.7, .7, -1.13, -.95, .76, .78, '#f6f3ea')                                        # white keys
    for k in range(36):
        if k % 7 in (2, 6):
            continue
        x = -.68 + k * .038
        t.box(x, x + .02, -1.02, -.95, .78, .8, '#111111')
    t.box(-.72, .72, -.95, -.88, .76, .9, c)
    t.box(-.4, .4, -.9, -.86, .9, 1.2, c)                                                    # music desk
    for (x, y) in ((-.6, -.85), (.6, -.85), (-.2, .8)):
        t.cyl(x, y, 0, .62, .045, c, 8)
        t.cyl(x, y, 0, .04, .05, GOLD, 8)
    t.box(-.12, .12, -.6, -.5, .05, .62, c)                                                 # pedal lyre
    for x in (-.06, 0, .06):
        t.box(x - .015, x + .015, -.66, -.58, .05, .07, GOLD)
    b = t.at(0, -1.55)
    b.box(-.42, .42, -.18, .18, .42, .5, c)
    b.box(-.4, .4, -.16, .16, .5, .52, '#2b2b2b')
    for x in (-.38, .38):
        for y in (-.14, .14):
            b.box(x - .02, x + .02, y - .02, y + .02, 0, .42, c)


def bar_stool(B, x, y, seat='#111111', metal=GOLD):
    cyl(B, x, y, 0, .03, .2, metal, 10)
    cyl(B, x, y, .03, .72, .03, metal, 6)
    disc(B, x, y, .3, .17, metal, 10, .15)
    cyl(B, x, y, .72, .8, .21, seat, 12)


# ================================================================ 3e. presidential suite (black / ivory / gold)
def int_suite_presidential(detail=True):
    B = Builder(detail)
    X0, X1, Y0, Y1, Hh = -8.0, 8.0, -6.0, 6.0, 3.6
    IVORY, IVORY2, BLK, BLK2 = '#f3ede1', '#e9e1d2', '#151414', '#2a2827'
    PX, WY, BY = 2.5, .6, -2.0                       # partition: parlour | right zone; bedroom / wardrobe / bathroom splits
    door_u = 0.5
    bed_hole = (1.0, 2.6, 0, 2.7)
    wr_hole, bt_hole = (3.3, 4.7, 0, 2.5), (3.3, 4.7, 0, 2.5)
    # ---- floors
    tile_floor(B, X0, PX, Y0, Y1, 1.0, [IVORY, '#ece4d4'], '#b9ae9c', veins='#d6cab6')
    for (a, b, c_, d) in [(X0 + .6, PX - .6, Y0 + .6, Y0 + .66), (X0 + .6, PX - .6, Y1 - .66, Y1 - .6), (X0 + .6, X0 + .66, Y0 + .6, Y1 - .6), (PX - .66, PX - .6, Y0 + .6, Y1 - .6)]:
        hq(B, a, b, c_, d, .009, BLK)
    plank_floor(B, PX, X1, WY, Y1, '#3b2a20', .2, 'x')
    plank_floor(B, PX, X1, BY, WY, '#4a3628', .2, 'y')
    tile_floor(B, PX, X1, Y0, BY, 1.0, [BLK2, '#232120'], '#0c0c0c', veins=GOLD_D)
    # ---- shell
    W = room_shell(B, X0, X1, Y0, Y1, Hh, IVORY, '#f8f4ec', t=.25, skirt=BLK, cornice='#f8f4ec')
    wF, wB, wL, wR = W['F'], W['B'], W['L'], W['R']
    pa, pb = partition(B, 'x', PX, Y0, Y1, Hh, IVORY, [bed_hole], t=.16, skirt=BLK, cornice='#f8f4ec')  # pa: parlour side
    ra, rb = partition(B, 'y', WY, PX + .08, X1, Hh, IVORY, [wr_hole], t=.14, skirt=BLK)                  # rb: bedroom side
    sa, sb = partition(B, 'y', BY, PX + .08, X1, Hh, IVORY, [bt_hole], t=.14, skirt=BLK)                  # sa: bath side
    opening_trim(pa, pb, 1.8, 1.6, 2.7, GOLD, .08)
    for (wa, wb_) in ((ra, rb), (sa, sb)):
        opening_trim(wa, wb_, 4.0, 1.4, 2.5, GOLD, .06)
    # gold picture-frame mouldings on the parlour walls
    panel_mouldings(wL, Y0 + .3, Y1 - .3, .4, 3.0, GOLD, [(-5.6, -3.2, 0, 3.6), (.9, 4.5, 0, 3.6)], 1.3, .012)
    panel_mouldings(wF, X0 + 3.0, PX - .2, .4, 3.0, GOLD, [(door_u - .7, door_u + .7, 0, 3.6)], 1.3, .012)
    panel_mouldings(rb, PX + .3, X1 - .3, .4, 3.0, GOLD, [wr_hole], 1.3, .012)
    # ---- floor-to-ceiling windows: Lagos at night
    for (a, b, n) in ((X0 + .3, PX - .3, 6), (PX + .4, X1 - .3, 3)):
        u = (a + b) / 2
        wB.window(u, .02, b - a, Hh - .12, BLK, True, int(a * 7), n, transom=False)
        wB.curtains(a - .2, b + .2, Hh - .08, '#ece4d2', '#f3eee4', (.12, .12), GOLD, o=.14)
    # ---- entry foyer
    entry_door(B, wF, door_u, BLK2, GOLD)
    round_table(T(B, -1.3, -4.6), .55, BLK, GOLD, .78, 20) if False else None
    sideboard(T(B, -1.6, Y0 + .27, '+y'), 1.8, BLK, IVORY, .82, .45, GOLD)
    flowers(B, -1.6, Y0 + .27, .85, .26, IVORY, ('#ffffff', '#f3e7d3', GOLD, '#c8102e'), seed=91, h=.6)
    mirror(wF, -1.6, 2.15, 1.3, 1.3, GOLD)
    plant(B, PX - .55, Y0 + .6, 2.0, BLK, .3, 'palm', seed=17)
    # ---- kitchen corner (front left)
    fridge(T(B, -4.65, Y0 + .36, '+y'), '#2b2b2b')
    base_units(T(B, -6.2, Y0 + .3, '+y'), 2.4, BLK, BLK2, IVORY, handle=GOLD, sink_at=.2)
    base_units(T(B, X0 + .3, -4.3, '+x'), 2.2, BLK, BLK2, IVORY, handle=GOLD, hob_at=-.1)
    B.box(X0, X0 + .6, Y0, Y0 + .6, 0, .86, BLK); B.box(X0, X0 + .62, Y0, Y0 + .62, .86, .9, IVORY)
    wall_units(T(B, -6.2, Y0 + .18, '+y'), 2.4, BLK2, 1.55, .8, .35, GOLD, glass='#d9cbb5')
    hood(T(B, X0 + .3, -4.4, '+x'), .6, 1.6, BLK2, Hh)
    for (w_, a, b) in ((wF, X0, -5.0), (wL, Y0, -3.2)):
        wall_tiles(w_, a, b, .9, 1.55, .6, .3, IVORY2, k=.03)
        w_.slab(a, b, 1.2, 1.22, .008, .012, GOLD)
    microwave(T(B, X0 + .3, -3.6, '+x', .9), BLK)
    kettle(T(B, -6.9, Y0 + .3, '+y', .9), GOLD)
    fruit_bowl(B, -5.5, Y0 + .3, .9)
    # ---- dining for six
    dining(T(B, -5.0, -1.0), 2.4, 1.05, BLK, GOLD, BLK2, IVORY, n_side=2, ends=True)
    for x in (-5.6, -4.4):
        cyl(B, x, -1.0, .76, .79, .06, GOLD, 8); cyl(B, x, -1.0, .79, 1.05, .012, IVORY, 6)
    flowers(B, -5.0, -1.0, .76, .16, GOLD, ('#ffffff', '#f3e7d3'), seed=92, h=.35)
    chandelier(B, -5.0, -1.0, Hh, 1.25, .8, 2, GOLD, n=10)
    # ---- bar counter with stools (left wall)
    wL.box(1.0, 4.4, .9, 2.8, 0, .04, '#2a1e12')
    wL.box(1.05, 4.35, .95, 2.75, .04, .045, '#ffb25c')                                 # backlit amber panel
    for z in (1.35, 1.9, 2.45):
        wL.box(1.0, 4.4, z - .03, z, 0, .3, GOLD)
        for k in range(14):
            u = 1.15 + k * .23
            col = ['#c97b2a', '#5e8c3a', '#e6d7a8', '#8a2b1f', '#2a2a2a', '#f2f2f2'][(k + int(z * 3)) % 6]
            wL.box(u, u + .07, z, z + .26 + .04 * (k % 2), .08, .16, col)
    wL.box(1.0, 4.4, 0, .9, 0, .5, BLK)
    wL.box(1.0, 4.4, .9, .94, 0, .52, IVORY)
    bx = X0 + 1.55
    B.box(bx - .3, bx + .3, 1.2, 4.2, 0, 1.05, BLK)
    for k in range(10):
        y_ = 1.25 + k * .3
        B.box(bx + .3, bx + .32, y_, y_ + .24, .1, .95, GOLD_D)
    B.box(bx + .3, bx + .33, 1.2, 4.2, .98, 1.0, LED)
    B.box(bx - .4, bx + .45, 1.15, 4.25, 1.05, 1.1, IVORY)
    for y_ in (1.7, 2.7, 3.7):
        bar_stool(B, bx + .85, y_)
        cyl(B, bx, y_, 1.1, 1.12, .04, '#f2f2f2', 6); frustum(B, bx, y_, 1.12, 1.22, .01, .045, '#e8e2d2', 8)
    for y_ in (1.8, 2.7, 3.6):
        pendant(B, bx, y_, Hh, 1.2, .12, GOLD)
    # ---- grand piano by the window
    grand_piano(T(B, -3.6, 4.0, '-y'))
    # ---- lounge: L-sofa, armchairs, TV wall
    ly = -1.1
    pa.box(ly - 2.0, ly + 1.6, 0, 3.0, 0, .05, BLK)                                       # black marble TV wall
    for k in range(3):
        pa.face(ly - 2.0, ly + 1.6, .1 + k * .95, .12 + k * .95, .052, GOLD)
    tv(pa, ly - .2, 1.6, 2.0, .06)
    t = T(B, PX - .33, ly - .2, '-x')
    t.box(-1.4, 1.4, -.2, .2, .3, .5, BLK2, bottom=True); t.box(-1.4, 1.4, -.21, -.2, .47, .48, LED)
    for x in (-1.0, 1.0):
        cyl(B, *t.p(x, 0), .5, .8, .08, GOLD, 8)
    SOFA, CUSH = '#ebe3d4', '#f3ede1'
    sofa(T(B, -1.6, ly - .5, '+x'), 3.2, SOFA, CUSH, pillows=[(BLK, GOLD), (GOLD, BLK), ('#1c5f8a', '#e8a33c'), (BLK, IVORY)])
    sofa(T(B, -.3, ly + 1.55, '-y'), 2.2, SOFA, CUSH, pillows=[(GOLD, BLK), ('#c8102e', '#f2e3c8')], arm=.2)
    B.box(-2.06, -1.14, ly + 1.1, ly + 2.0, .1, .45, SOFA)                                 # corner seat joining the L
    B.box(-2.06, -1.86, ly + 1.1, ly + 2.0, .3, .86, SOFA)
    B.box(-2.06, -1.14, ly + 1.8, ly + 2.0, .3, .86, SOFA)
    for x in (-.7, .5):
        armchair(T(B, x, ly - 2.0, '+y'), BLK2, '#3a3735', w=.85, d=.85, pillow_c=(GOLD, BLK), legs=GOLD)
    coffee_table(T(B, -.2, ly, '+x'), 1.4, .9, BLK, GOLD, .4)
    B.box(-.4, -.1, ly - .2, ly + .1, .4, .46, '#c9a25a') if False else None
    flowers(B, -.2, ly + .2, .4, .14, BLK, ('#ffffff', '#f3e7d3', GOLD), seed=93, h=.3)
    B.box(-.5, -.2, ly - .35, ly - .1, .4, .45, IVORY)
    rug(B, -2.5, 1.5, ly - 2.7, ly + 2.4, '#d8cdb8', BLK, GOLD, fringe=None, pattern='#b59a62')
    chandelier(B, -.2, ly, Hh, 1.3, 1.1, 3, GOLD, n=14)
    for (x, y_) in ((-3.0, ly - 2.4), (-3.0, ly + 2.4)):
        plant(B, x, y_, 1.8, BLK, .28, 'bush', seed=int(y_ * 5))
    pa.picture(3.8, 1.8, .01, .01, GOLD, ['#fff', '#fff']) if False else None
    wF.picture(-4.0, 1.9, .01, .01, GOLD, ['#fff', '#fff']) if False else None
    wL.picture(-1.2, 1.85, 1.8, 1.2, GOLD, ['#e8dcc4', BLK, GOLD, '#c8102e', '#1c5f8a'], seed=94)
    pa.picture(4.3, 1.8, 1.0, 1.3, GOLD, ['#efe7da', BLK, GOLD, '#8a4a2a'], seed=95)
    split_ac(wF, 3.4 - 5.0 - 2.4, 3.15, 1.0) if False else None
    # ceiling: coffers with gold trim over the lounge
    for (cx, cy, hw, hd) in ((-.2, ly, 2.4, 2.6), (-5.0, -1.0, 1.8, 1.2)):
        for (a, b, c_, d) in [(cx - hw, cx + hw, cy - hd - .25, cy - hd), (cx - hw, cx + hw, cy + hd, cy + hd + .25), (cx - hw - .25, cx - hw, cy - hd - .25, cy + hd + .25), (cx + hw, cx + hw + .25, cy - hd - .25, cy + hd + .25)]:
            B.box(a, b, c_, d, Hh - .2, Hh, '#f8f4ec', bottom=True)
            B.box(a, b, c_, d, Hh - .22, Hh - .2, GOLD, bottom=True)
    for (x, y_) in ((door_u, -5.0), (door_u, -3.6), (-6.4, -4.6), (-3.0, -4.6), (-6.5, 2.7), (-3.6, 4.0), (1.6, 3.6), (1.6, -4.6)):
        downlight(B, x, y_, Hh)
    # ---- master bedroom: king bed on a low platform
    by = 3.6
    PZ = .18
    B.box(4.9, X1, by - 1.75, by + 1.75, 0, PZ, BLK2)
    B.box(4.88, 4.9, by - 1.75, by + 1.75, .02, .06, LED)
    wR.box(by - 1.9, by + 1.9, 0, Hh - .1, 0, .06, BLK)
    for i in range(int(3.8 / .2)):
        u = by - 1.9 + i * .2
        wR.box(u + .185, u + .2, .2, Hh - .2, .06, .07, GOLD)
    bed(T(B, X1 - 1.2, by, '-x', PZ), 2.0, 2.2, BLK, SHEET, '#fbf9f4', '#ffffff', '#ebe3d4', 1.7, throw=GOLD, tufted=True, hb_w=2.6, euro=(BLK, GOLD))
    for y_ in (by - 1.48, by + 1.48):
        nightstand(T(B, X1 - .3, y_, '-x', PZ), BLK, '#f3e6cc', GOLD, .55, .45, .55)
        pendant(B, X1 - .3, y_, Hh, 1.65, .13, GOLD)
    rug(B, 3.2, 4.85, by - 1.6, by + 1.6, '#d8cdb8', BLK, GOLD, fringe=None)
    t = T(B, PX + .3, 4.2, '+x')
    t.box(-1.0, 1.0, -.22, .22, .08, .5, BLK); t.box(-1.0, 1.0, -.23, -.22, .45, .46, LED)
    tv(pb, 4.2, 1.5, 1.6, .02)
    armchair(T(B, 3.6, 5.2, '+y'), IVORY, '#f8f2e6', w=.85, d=.85, pillow_c=(GOLD, BLK), legs=GOLD) if False else None
    armchair(T(B, 6.0 - 2.4 + 0, Y1 - .8, '-y'), BLK2, '#3a3735', w=.85, d=.85, pillow_c=(GOLD, BLK), legs=GOLD)
    round_table(T(B, 4.6, Y1 - .7), .25, IVORY, GOLD, .55)
    table_lamp(B, 4.6, Y1 - .7, .55, GOLD, '#f3e6cc', .5)
    ceiling(B, 4.4, 7.4, by - 1.6, by + 1.6, Hh + .25, '#f8f4ec')
    for (a, b, c_, d) in [(4.4, 7.4, by - 1.6, by - 1.59), (4.4, 7.4, by + 1.59, by + 1.6), (4.4, 4.41, by - 1.6, by + 1.6), (7.39, 7.4, by - 1.6, by + 1.6)]:
        B.box(a, b, c_, d, Hh, Hh + .25, '#f3ede1')
    for (a, b, c_, d) in [(4.45, 7.35, by - 1.55, by - 1.48), (4.45, 7.35, by + 1.48, by + 1.55), (4.45, 4.52, by - 1.55, by + 1.55), (7.28, 7.35, by - 1.55, by + 1.55)]:
        hq(B, a, b, c_, d, Hh + .02, LED)
    chandelier(B, 5.9, by, Hh + .25, .9, .6, 2, GOLD, n=8)
    split_ac(rb, 6.5, 3.2, 1.0)
    for (x, y_) in ((3.2, 1.2), (3.2, 5.4)):
        downlight(B, x, y_, Hh)
    # ---- walk-in wardrobe
    for (y0_, y1_) in ((BY + .1, WY - .1),):
        T_ = T(B, X1 - .3, (y0_ + y1_) / 2, '-x')
        T_.box(-1.25, 1.25, -.3, .3, 0, .1, BLK)
        T_.box(-1.25, 1.25, -.3, .3, 2.4, 2.45, BLK, bottom=True)
        for x in (-1.25, 0, 1.25):
            T_.box(x - .02, x + .02, -.3, .3, 0, 2.45, BLK2)
        T_.box(-1.23, 1.23, -.02, .02, 1.9, 1.93, GOLD, bottom=True)
        for k in range(18):                                                              # clothes on hangers
            x = -1.15 + k * .13
            col = ['#f2efe8', '#1d2a44', '#7a1e2a', '#2b2b2b', '#c9a25a', '#5d6b78', '#e8dcc4'][k % 7]
            T_.box(x, x + .05, -.25, .25, 1.0 + .25 * hsh(k, 3), 1.88, col, bottom=True)
        T_.box(-1.23, 1.23, -.28, .28, .35, .37, BLK2)
        for k in range(7):                                                               # shoes
            x = -1.1 + k * .33
            T_.box(x, x + .12, -.15, .1, .37, .45, ['#2b2b2b', '#7a1e2a', '#c9a25a'][k % 3])
    for x in (5.6, 6.4):
        pass
    T_ = T(B, 5.8, BY + .35, '+y')                                                      # dressing drawers along the bath wall
    T_.box(-1.5, 1.5, -.25, .25, 0, .9, BLK)
    for i in range(6):
        for j in range(3):
            x = -1.45 + i * .5
            T_.box(x, x + .48, -.26, -.25, .05 + j * .28, .3 + j * .28, BLK2)
            T_.box(x + .2, x + .28, -.29, -.26, .17 + j * .28, .19 + j * .28, GOLD)
    T_.box(-1.52, 1.52, -.27, .27, .9, .93, IVORY)
    mirror(pb, -.7, 1.3, .8, 2.0, GOLD)
    cyl(B, 4.4, -.7, 0, .42, .35, '#c9a25a', 12) if False else None
    cyl(B, 4.4, -.7, .05, .42, .32, BLK2, 12); cyl(B, 4.4, -.7, 0, .05, .3, GOLD, 12)
    downlight(B, 3.6, -.7, Hh); downlight(B, 6.0, -.7, Hh)
    # ---- luxury bathroom
    bath_walls([(wF, PX, X1, []), (wR, Y0, BY, [(-4.6, -2.4, 1.0, 3.2)]), (pb, Y0, BY, []), (sa, PX, X1, [bt_hole])], 3.2, IVORY2, GOLD, 1.2, .8, Hh, '#f8f4ec')
    wR.window(-3.5, 1.0, 2.2, 2.2, BLK, True, 77, 2)
    hq(B, PX, X1, Y0, BY, 3.2, '#f8f4ec')
    PZ2 = .2
    B.box(5.5, X1, -4.6, BY, 0, PZ2, BLK2)                                               # step up to the jacuzzi
    B.box(5.48, 5.5, -4.6, BY, .02, .06, LED)
    jt = T(B, 6.75, -3.3, '-x', PZ2)
    jt.box(-1.0, 1.0, -.85, .85, 0, .3, IVORY)
    for (a, b, c_, e) in ((-1.1, 1.1, -.95, -.85), (-1.1, 1.1, .85, .95), (-1.1, -1.0, -.95, .95), (1.0, 1.1, -.95, .95)):
        jt.box(a, b, c_, e, 0, .55, IVORY)
        jt.box(a - .01, b + .01, c_ - .01, e + .01, .55, .6, IVORY2)
    jt.box(-1.0, 1.0, -.85, .85, .3, .45, '#58c3cf')
    for k in range(8):                                                                   # bubbles
        jt.disc(-.7 + .2 * k, .3 * math.sin(k * 1.7), .452, .05 + .03 * hsh(k, 6), '#d9f3f5', 6)
    for k in range(6):
        jt.box(-.9 + k * .36, -.86 + k * .36, -.86, -.85, .38, .42, CHROME)
    jt.box(-.15, .15, .85, .95, .6, .62, GOLD)
    jt.box(-.03, .03, .88, .92, .62, .82, GOLD); jt.box(-.03, .03, .7, .92, .8, .83, GOLD)
    for k in range(3):
        cyl(B, 7.7, -2.35 - k * .12, PZ2 + .6, PZ2 + .68, .03, '#fff1c8', 8); disc(B, 7.7, -2.35 - k * .12, PZ2 + .681, .012, '#ffb347', 6)
    shower(B, 6.3, X1, Y0, -4.75, IVORY2, glass_side=('y', 6.3, -5.5, -4.75), rain=True, wall_ws=(wF, 7.15))
    frame_glass(B, 'x', -4.75, 6.3, X1, 2.2)
    vanity(T(B, PX + .38, -4.0, '+x'), 2.2, BLK, IVORY, sinks=2)
    for y_ in (-4.55, -3.45):
        mirror(pb, y_, 1.75, .75, 1.0, GOLD)
    pb.box(-4.07, -3.93, 1.2, 2.3, 0, .04, GOLD); pb.box(-4.05, -3.95, 1.22, 2.28, .04, .05, BULB)
    toilet(T(B, 4.9, Y0 + .33, '+y'))
    toilet(T(B, 4.3, Y0 + .3, '+y'), '#f4f1ea') if False else None
    towel_rail(sa, 5.0, 5.4, 1.5) if False else towel_rail(wF, 3.0, 4.0, 1.6)
    bath_mat(B, 3.0, 3.8, -4.4, -3.6)
    plant(B, 5.8, BY - .4, 1.3, BLK, .2, 'bush', seed=19)
    chandelier(B, 4.5, -4.0, 3.2, .7, .45, 1, GOLD, n=8)
    downlight(B, 6.9, -5.3, 3.2); downlight(B, 6.8, -3.3, 3.2)
    # ---- marks
    room_marks(B, door_u, Y0)
    B.mark('bed', 6.3, by - 1.45, PZ, face='+y')
    B.mark('tv', .9, ly - .2, 0, face='+x')
    B.mark('tv_bedroom', 4.2, 4.2, 0, face='-x')
    B.mark('piano', -3.6, 2.2, 0, face='+y')
    B.mark('bar', bx + 1.2, 2.7, 0, face='-x')
    light(B, 1, -.2, ly, 2.3, '#ffe2b0', 35, 12)
    light(B, 2, -5.0, -1.0, 2.3, '#ffdcae', 22, 9)
    light(B, 3, -5.5, 2.8, 2.9, '#ffc98a', 18, 9)
    light(B, 4, 5.6, by, 2.8, '#ffe0b0', 22, 9)
    light(B, 5, 4.8, -4.0, 2.6, '#fff0d8', 20, 8)
    light(B, 6, 1.0, -4.6, 3.0, '#ffe6c0', 16, 9)
    return B.finish('int_suite_presidential')


BUILDS = ()
INTERIORS = (int_hotel_lobby, int_hotel_corridor, int_room_standard, int_room_deluxe, int_suite_exec, int_suite_family, int_suite_presidential)


def main():
    os.makedirs(H.OUT, exist_ok=True)
    made = []
    for i, fn in enumerate(INTERIORS):
        ob = fn(True)
        H.export(ob, os.path.join(H.OUT, ob.name + '.glb'))
        ob.location = ((i % 4) * 30 - 45, 60 + (i // 4) * 30, 0)
        made.append(ob.name)
    print('Hotel interiors exported to', H.OUT, made)
    return made


if __name__ == '__main__' and 'bpy' in sys.modules and hasattr(sys.modules['bpy'], 'ops'):
    main()
