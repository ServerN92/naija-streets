"""Naija Streets venues: a nightclub, a police division and a car stand (outside, with _lod1) and their insides
(club floor, police charge room + cells, car showroom). Names are invented.

  ns_club / int_club          CLUB GBEDU, a dark clad nightclub with neon outlines, canopy, red carpet; inside: LED dance
                              floor, DJ stage, long bar, VIP booths
  ns_police / int_police      Nigeria Police, Mushin Division: navy/white two-storey block, flagpole, perimeter wall;
                              inside: charge room counter, desks, corridor to two cells facing each other
  ns_carstand / int_showroom  OLUWASEUN MOTORS: glass showroom with an open display lot (empty - the game parks cars)

Run in Blender (Scripting > Open > Run) or headless: python3 tools/glb_build.py -m blender_venues
"""
import sys, os
_here = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.join(os.path.expanduser('~'), 'naija-streets', 'tools')
sys.path.insert(0, _here)
from blender_houses import *          # Builder, hexc, helpers, colour constants, bpy, bmesh, math, os
import blender_houses as H


# ================================================================ small helpers
def hh(*a):
    """Deterministic hash of some numbers -> 0..1 (for colour variation without random)."""
    h = 2166136261
    for v in a:
        h ^= int(round(v * 1000)) & 0xffffffff
        h = (h * 16777619) & 0xffffffff
        h ^= h >> 13
    return (h % 10007) / 10007


def vary(c, *k, a=.08):
    return shade(c, 1 - a + 2 * a * hh(*k))


def top(B, x0, x1, y0, y1, z, c):
    """A flat horizontal face (floor tiles, rugs, carpets): cheap, one quad."""
    B.face([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], c)


def under(B, x0, x1, y0, y1, z, c):
    B.face([(x0, y1, z), (x1, y1, z), (x1, y0, z), (x0, y0, z)], c)


def vquad(B, side, a0, a1, z0, z1, p, c):
    """A vertical quad: side 'y' -> plane y=p spanning x a0..a1; side 'x' -> plane x=p spanning y a0..a1."""
    if side == 'y':
        B.face([(a0, p, z0), (a1, p, z0), (a1, p, z1), (a0, p, z1)], c)
    else:
        B.face([(p, a0, z0), (p, a1, z0), (p, a1, z1), (p, a0, z1)], c)


def stroke(B, side, p, a, z, L, ang, c, w=.035):
    """A thin slanted stroke on a wall plane (graffiti, cracks, scuffs)."""
    ca, sa = math.cos(ang), math.sin(ang)
    da, dz = ca * L / 2, sa * L / 2
    na, nz = -sa * w / 2, ca * w / 2
    pts = [(a - da - na, z - dz - nz), (a + da - na, z + dz - nz), (a + da + na, z + dz + nz), (a - da + na, z - dz + nz)]
    if side == 'y':
        B.face([(u, p, v) for u, v in pts], c)
    else:
        B.face([(p, u, v) for u, v in pts], c)


def rod(B, p0, p1, r, c):
    """A thin square rod between two points (any direction)."""
    (x0, y0, z0), (x1, y1, z1) = p0, p1
    dx, dy, dz = x1 - x0, y1 - y0, z1 - z0
    L = math.sqrt(dx * dx + dy * dy + dz * dz) or 1
    d = (dx / L, dy / L, dz / L)
    a = (0, 0, 1) if abs(d[2]) < .9 else (1, 0, 0)
    u = (d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0])
    ul = math.sqrt(sum(t * t for t in u)); u = tuple(t / ul * r for t in u)
    v = (d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0])
    vl = math.sqrt(sum(t * t for t in v)) or 1; v = tuple(t / vl * r for t in v)
    cs = [(u[0] + v[0], u[1] + v[1], u[2] + v[2]), (-u[0] + v[0], -u[1] + v[1], -u[2] + v[2]),
          (-u[0] - v[0], -u[1] - v[1], -u[2] - v[2]), (u[0] - v[0], u[1] - v[1], u[2] - v[2])]
    for i in range(4):
        a_, b_ = cs[i], cs[(i + 1) % 4]
        B.face([(x0 + a_[0], y0 + a_[1], z0 + a_[2]), (x0 + b_[0], y0 + b_[1], z0 + b_[2]),
                (x1 + b_[0], y1 + b_[1], z1 + b_[2]), (x1 + a_[0], y1 + a_[1], z1 + a_[2])], c)


def disc(B, cx, cy, z, r, c, n=12):
    B.face([(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), z) for i in range(n)], c)


def ball(B, cx, cy, cz, r, c, n=10, rings=5, c2=None):
    """A sphere (two domes); c2 gives a checker of facets (mirror ball)."""
    for j in range(rings * 2):
        a0, a1 = -math.pi / 2 + math.pi * j / (rings * 2), -math.pi / 2 + math.pi * (j + 1) / (rings * 2)
        for i in range(n):
            t0, t1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            P = lambda a, t: (cx + r * math.cos(a) * math.cos(t), cy + r * math.cos(a) * math.sin(t), cz + r * math.sin(a))
            pts = [P(a0, t0), P(a0, t1), P(a1, t1), P(a1, t0)]
            if j == 0:
                pts = [pts[0], pts[2], pts[3]]
            elif j == rings * 2 - 1:
                pts = pts[:3]
            col = c if not c2 else (c if (i + j) % 2 else c2)
            if c2:
                col = shade(col, .8 + .4 * hh(i, j))
            B.face(pts, col)


def neon(B, x0, x1, y0, y1, z0, z1, c):
    """A glowing strip: a bright core with a darker housing behind it isn't needed - bright colours read as light."""
    B.box(x0, x1, y0, y1, z0, z1, c)


# ---- generic furniture
def chair(B, x, y, face, c='#2b2b2e', seat=.46, leg='#1c1c1c', back=True):
    """A simple chair facing `face`."""
    s = .22
    B.box(x - s, x + s, y - s, y + s, seat - .06, seat, c)
    for dx in (-s + .03, s - .03):
        for dy in (-s + .03, s - .03):
            B.box(x + dx - .02, x + dx + .02, y + dy - .02, y + dy + .02, 0, seat - .06, leg)
    if back:
        d = {'-y': (0, 1), '+y': (0, -1), '-x': (1, 0), '+x': (-1, 0)}[face]
        if d[0]:
            bx = x + d[0] * s
            B.box(bx - .03, bx + .03, y - s, y + s, seat, seat + .45, c)
        else:
            by = y + d[1] * s
            B.box(x - s, x + s, by - .03, by + .03, seat, seat + .45, c)


def office_chair(B, x, y, face, c='#24272b'):
    cylinder(B, x, y, 0, .04, .28, '#1a1a1a', 5)
    cylinder(B, x, y, .04, .42, .03, '#555a5e', 6, False)
    B.box(x - .24, x + .24, y - .24, y + .24, .42, .5, c)
    d = {'-y': (0, 1), '+y': (0, -1), '-x': (1, 0), '+x': (-1, 0)}[face]
    if d[0]:
        B.box(x + d[0] * .22 - .04, x + d[0] * .22 + .04, y - .22, y + .22, .55, 1.05, c)
    else:
        B.box(x - .22, x + .22, y + d[1] * .22 - .04, y + d[1] * .22 + .04, .55, 1.05, c)


def table(B, x0, x1, y0, y1, h, c, leg='#3a2a1c', t=.04, legs=True):
    B.box(x0, x1, y0, y1, h - t, h, c)
    if legs:
        for x in (x0 + .05, x1 - .09):
            for y in (y0 + .05, y1 - .09):
                B.box(x, x + .04, y, y + .04, 0, h - t, leg)


def plant(B, x, y, h=1.3, pot='#8a5a3c', r=.22):
    cylinder(B, x, y, 0, .45, r, pot, 8)
    top(B, x - r * .8, x + r * .8, y - r * .8, y + r * .8, .44, '#3b2a1e')
    greens = ['#2f6b2f', '#3f7d33', '#2a5c2a', '#4c8a3a']
    for i in range(7):
        a = 2 * math.pi * i / 7 + hh(x, y, i)
        L = h * (.5 + .35 * hh(i, x))
        ex, ey = x + math.cos(a) * L * .45, y + math.sin(a) * L * .45
        ez = .45 + L * .9
        px, py = -math.sin(a) * .09, math.cos(a) * .09
        B.face([(x, y, .45), (ex + px, ey + py, ez), (ex + math.cos(a) * .25, ey + math.sin(a) * .25, ez - .15), (ex - px, ey - py, ez)], greens[i % 4])


def ceiling_fan(B, x, y, zc, c='#e9e6df'):
    B.box(x - .02, x + .02, y - .02, y + .02, zc - .45, zc, '#bdb8ae')
    cylinder(B, x, y, zc - .62, zc - .45, .13, c, 8)
    for i in range(3):
        a = 2 * math.pi * i / 3 + .3
        ca, sa = math.cos(a), math.sin(a)
        px, py = -sa * .07, ca * .07
        z = zc - .55
        B.face([(x + ca * .12 + px, y + sa * .12 + py, z), (x + ca * .75 + px * 1.3, y + sa * .75 + py * 1.3, z - .02),
                (x + ca * .75 - px * 1.3, y + sa * .75 - py * 1.3, z - .02), (x + ca * .12 - px, y + sa * .12 - py, z)], '#6d4a2e')


def fluor(B, x, y, z, along='x', L=1.25):
    """A fluorescent tube fitting on the ceiling (glowing tube)."""
    if along == 'x':
        B.box(x - L / 2 - .05, x + L / 2 + .05, y - .07, y + .07, z - .06, z, '#e8e6e1')
        B.box(x - L / 2, x + L / 2, y - .03, y + .03, z - .1, z - .06, '#fbfdff')
    else:
        B.box(x - .07, x + .07, y - L / 2 - .05, y + L / 2 + .05, z - .06, z, '#e8e6e1')
        B.box(x - .03, x + .03, y - L / 2, y + L / 2, z - .1, z - .06, '#fbfdff')


def split_ac(B, side, p, a, z, sgn=1):
    """A wall split AC unit: side 'y' = on wall plane y=p (sgn = direction into room), 'x' likewise."""
    d0, d1 = p, p + sgn * .22
    if side == 'y':
        B.box(a - .45, a + .45, min(d0, d1), max(d0, d1), z, z + .3, '#f4f4f2')
        B.box(a - .4, a + .4, min(d0, d1 + sgn * .005), max(d0, d1 + sgn * .005), z + .03, z + .07, '#cfd2d4')
        B.box(a + .3, a + .36, min(d0, d1 + sgn * .006), max(d0, d1 + sgn * .006), z + .2, z + .23, '#3fd06a')
    else:
        B.box(min(d0, d1), max(d0, d1), a - .45, a + .45, z, z + .3, '#f4f4f2')
        B.box(min(d0, d1 + sgn * .005), max(d0, d1 + sgn * .005), a - .4, a + .4, z + .03, z + .07, '#cfd2d4')
        B.box(min(d0, d1 + sgn * .006), max(d0, d1 + sgn * .006), a + .3, a + .36, z + .2, z + .23, '#3fd06a')


def picture(B, side, p, a, z, w, h, c, sgn=1, frame='#3a2a1c'):
    """A framed picture/board on a wall plane, sgn = direction into the room."""
    o = lambda k: (p + sgn * k)
    if side == 'y':
        B.box(a - w / 2, a + w / 2, min(o(0), o(.03)), max(o(0), o(.03)), z - h / 2, z + h / 2, frame)
        B.box(a - w / 2 + .04, a + w / 2 - .04, min(o(.03), o(.035)), max(o(.03), o(.035)), z - h / 2 + .04, z + h / 2 - .04, c)
    else:
        B.box(min(o(0), o(.03)), max(o(0), o(.03)), a - w / 2, a + w / 2, z - h / 2, z + h / 2, frame)
        B.box(min(o(.03), o(.035)), max(o(.03), o(.035)), a - w / 2 + .04, a + w / 2 - .04, z - h / 2 + .04, z + h / 2 - .04, c)


def wall_x(B, y0, y1, x0, x1, h, c, gaps=(), lintel=None, grime=True):
    """A wall running along x (thickness y0..y1) with door gaps [(a, b, top)]: lintels above each gap."""
    xs = x0
    for (a, b, t) in sorted(gaps):
        B.box(xs, a, y0, y1, 0, h, c, grime=grime)
        B.box(a, b, y0, y1, t, h, lintel or c)
        xs = b
    B.box(xs, x1, y0, y1, 0, h, c, grime=grime)


def wall_y(B, x0, x1, y0, y1, h, c, gaps=(), lintel=None, grime=True):
    ys = y0
    for (a, b, t) in sorted(gaps):
        B.box(x0, x1, ys, a, 0, h, c, grime=grime)
        B.box(x0, x1, a, b, t, h, lintel or c)
        ys = b
    B.box(x0, x1, ys, y1, 0, h, c, grime=grime)


def skirting_x(B, y, x0, x1, sgn, c, h=.1, gaps=()):
    xs = x0
    for (a, b) in sorted(gaps) + [(x1, x1)]:
        if a - xs > .02:
            B.box(xs, a, min(y, y + sgn * .02), max(y, y + sgn * .02), 0, h, c)
        xs = b


def skirting_y(B, x, y0, y1, sgn, c, h=.1, gaps=()):
    ys = y0
    for (a, b) in sorted(gaps) + [(y1, y1)]:
        if a - ys > .02:
            B.box(min(x, x + sgn * .02), max(x, x + sgn * .02), ys, a, 0, h, c)
        ys = b


def door_frame(B, side, p, a, b, top_, sgn, c=TRIM, t=.08):
    """Architrave around an opening on a wall plane (both faces handled by caller)."""
    if side == 'y':
        lo, hi = min(p, p + sgn * .03), max(p, p + sgn * .03)
        B.box(a - t, a, lo, hi, 0, top_, c); B.box(b, b + t, lo, hi, 0, top_, c); B.box(a - t, b + t, lo, hi, top_, top_ + t, c)
    else:
        lo, hi = min(p, p + sgn * .03), max(p, p + sgn * .03)
        B.box(lo, hi, a - t, a, 0, top_, c); B.box(lo, hi, b, b + t, 0, top_, c); B.box(lo, hi, a - t, b + t, top_, top_ + t, c)


def ext_ac(B, side, p, a, z, sgn=-1):
    """Outdoor AC condenser on a wall bracket: side 'x' -> wall plane x=p, sgn = outward direction."""
    d0, d1 = p, p + sgn * .32
    lo, hi = min(d0, d1), max(d0, d1)
    if side == 'x':
        B.box(lo, hi, a - .4, a + .4, z, z + .55, '#e7e6e1')
        fx = hi + .003 if sgn > 0 else lo - .003
        B.face([(fx, a - .05 + .17 * math.cos(2 * math.pi * i / 10), z + .28 + .17 * math.sin(2 * math.pi * i / 10)) for i in range(10)][::sgn], '#3a3c3e')
        B.box(lo - .02, hi + .02, a - .38, a - .33, z - .1, z, '#55585b'); B.box(lo - .02, hi + .02, a + .33, a + .38, z - .1, z, '#55585b')
    else:
        B.box(a - .4, a + .4, lo, hi, z, z + .55, '#e7e6e1')
        fy = hi + .003 if sgn > 0 else lo - .003
        B.face([(a - .05 + .17 * math.cos(2 * math.pi * i / 10), fy, z + .28 + .17 * math.sin(2 * math.pi * i / 10)) for i in range(10)][::-sgn], '#3a3c3e')
        B.box(a - .38, a - .33, lo - .02, hi + .02, z - .1, z, '#55585b'); B.box(a + .33, a + .38, lo - .02, hi + .02, z - .1, z, '#55585b')


def gp_tank(B, x, y, z, r=.7, h=1.3):
    """The black plastic water tank on a steel stand found on every Lagos roof."""
    for dx in (-r * .7, r * .7):
        for dy in (-r * .7, r * .7):
            B.box(x + dx - .04, x + dx + .04, y + dy - .04, y + dy + .04, z, z + .6, '#5d5f5f')
    B.box(x - r, x + r, y - r, y + r, z + .6, z + .66, '#5d5f5f')
    cylinder(B, x, y, z + .66, z + .66 + h, r, '#1d1e1f', 10)
    dome(B, x, y, z + .66 + h, r, '#232425', 10, 2, .3)


# ================================================================ CLUB GBEDU (outside)
MAG, CYAN, GOLD, PURP = '#ff2bd0', '#2cf2ff', '#ffc42e', '#9b4dff'
CLAD = ['#1d1f22', '#26282c', '#212327', '#2c2e33']
CHROME = '#d6dade'


def clad_panels(B, w, u0, u1, z0, z1, pw=1.375, ph=1.0, skip=(), key=0):
    """Dark cladding panels in a grid on a wall (Wall object), with dark seams between; skip rectangles."""
    w.box(u0, u1, z0, z1, 0, .02, '#121315')
    if not B.detail:
        w.box(u0, u1, z0, z1, .02, .045, CLAD[1])
        return
    nu = max(1, round((u1 - u0) / pw)); nz = max(1, round((z1 - z0) / ph))
    du, dz = (u1 - u0) / nu, (z1 - z0) / nz
    for i in range(nu):
        for j in range(nz):
            a, b, c_, d = u0 + i * du + .015, u0 + (i + 1) * du - .015, z0 + j * dz + .015, z0 + (j + 1) * dz - .015
            if any(a < s1 and b > s0 and c_ < t1 and d > t0 for (s0, s1, t0, t1) in skip):
                # clip the panel around the skipped rectangle: keep only whole panels outside it
                continue
            col = CLAD[int(hh(i, j, key) * 4)]
            w.box(a, b, c_, d, .02, .045, col)


def club(detail):
    """CLUB GBEDU: a two-storey-tall nightclub, dark clad, neon outlines, lit canopy, red carpet, VIP balcony."""
    B = Builder(detail, simple=True)
    W, D, HT = 22.0, 16.0, 9.0
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    G = .12
    # forecourt: grey pavers with a kerb at the street edge
    B.box(x0 - 1.5, x1 + 2.6, y0 - 4.2, y1 + .6, 0, G, '#8e8a84', bottom=False)
    if detail:
        for i in range(int((W + 4.1) / .9)):
            x = x0 - 1.5 + i * .9
            B.box(x, x + .02, y0 - 4.2, y0, G, G + .004, '#77736d')
        for j in range(4):
            y = y0 - 4.2 + j * 1.05
            B.box(x0 - 1.5, x1 + 2.6, y, y + .02, G, G + .004, '#77736d')
    B.box(x0 - 1.5, x1 + 2.6, y0 - 4.35, y0 - 4.2, 0, G + .03, '#b9b5ad')            # kerb
    # the block
    B.box(x0, x1, y0, y1, G, HT, '#1f2124', grime=True)
    B.box(x0 - .03, x1 + .03, y0 - .03, y1 + .03, G, G + .45, '#141416')              # plinth
    F, Bk, L, R = Wall(B, 'F', x0, x1, y0, y1), Wall(B, 'B', x0, x1, y0, y1), Wall(B, 'L', x0, x1, y0, y1), Wall(B, 'R', x0, x1, y0, y1)
    # --- front facade: openings first so the panels skip them
    door_r = (-1.7, 1.7, G, 3.25)
    sign_r = (-4.4, 4.4, 3.75, 5.75)
    rib_r = (-10.2, -5.0, 5.4, 7.8)
    post_r = ((-9.3, -7.9, .9, 3.1), (7.9, 9.3, .9, 3.1))
    bal_r = (4.9, 10.3, 5.05, 7.75)
    clad_panels(B, F, x0, x1, G + .45, HT - .6, skip=(door_r, sign_r, rib_r, bal_r) + post_r, key=1)
    # entrance: a gold metal portal, tinted double glass doors with chrome push bars
    F.box(-2.0, 2.0, G, 3.55, 0, .12, '#7a6230')
    F.box(-1.7, 1.7, G, 3.25, .12, .13, '#0f1316')
    for u in (-1.7, -.03, 1.67):
        F.box(u, u + .06, G, 3.25, .12, .16, '#3b3e42')
    F.box(-1.7, 1.7, 2.6, 2.66, .12, .16, '#3b3e42')
    if detail:
        for u in (-.5, .5):
            F.box(u - .03, u + .03, G + .9, G + 1.9, .16, .22, CHROME)
        F.box(-1.6, -.1, G + .02, G + .25, .12, .17, '#3b3e42'); F.box(.1, 1.6, G + .02, G + .25, .12, .17, '#3b3e42')
    # canopy: black slab, lit underside, neon edges, two chrome posts
    cy0, cy1, cz = y0 - 3.4, y0, 3.35
    B.box(-4.0, 4.0, cy0, cy1, cz, cz + .32, '#141518', bottom=True)
    B.box(-3.7, 3.7, cy0 + .25, cy1 - .2, cz - .02, cz, '#fff3d6')                     # glowing soffit panel
    neon(B, -4.02, 4.02, cy0 - .04, cy0, cz + .06, cz + .12, MAG)
    neon(B, -4.02, 4.02, cy0 - .04, cy0, cz + .2, cz + .25, CYAN)
    for sx in (-4.04, 4.0):
        neon(B, sx, sx + .04, cy0, cy1, cz + .13, cz + .19, GOLD)
    for x in (-3.75, 3.75):
        cylinder(B, x, cy0 + .3, G, cz, .07, CHROME, 10)
        cylinder(B, x, cy0 + .3, G, G + .08, .14, '#505458', 10)
    # red carpet and chrome rope posts with red ropes
    B.box(-1.05, 1.05, cy0 - .6, y0, G, G + .02, '#a3121c')
    B.box(-1.08, 1.08, cy0 - .6, y0, G, G + .012, '#c9a14a')
    if detail:
        ys = [y0 - .9, y0 - 2.1, y0 - 3.3]
        for sx in (-1.45, 1.45):
            for y in ys:
                cylinder(B, sx, y, G, G + .04, .16, CHROME, 10)
                cylinder(B, sx, y, G, G + .98, .035, CHROME, 8, False)
                ball(B, sx, y, G + 1.02, .06, '#f0d48a', 8, 3)
            for ya, yb in zip(ys, ys[1:]):
                ym = (ya + yb) / 2
                rod(B, (sx, ya, G + .9), (sx, ym, G + .62), .03, '#b0101c')
                rod(B, (sx, ym, G + .62), (sx, yb, G + .9), .03, '#b0101c')
    # sign board over the canopy (the name is drawn by the game), gold neon border
    F.box(-4.2, 4.2, 3.85, 5.65, 0, .18, '#0c0c0e')
    F.box(-4.0, 4.0, 3.95, 5.55, .18, .2, '#16161a')
    for (a, b, c_, d) in [(-4.2, 4.2, 3.85, 3.92), (-4.2, 4.2, 5.58, 5.65), (-4.2, -4.13, 3.85, 5.65), (4.13, 4.2, 3.85, 5.65)]:
        F.box(a, b, c_, d, .18, .23, GOLD)
    B.mark('sign_name', 0, y0 - .22, 4.75, text='CLUB GBEDU', w=8.0, h=1.6, face='-y')
    # upper left: tinted glass ribbon with slim black mullions, neon sill
    F.box(-10.2, -5.0, 5.4, 7.8, 0, .05, '#101418')
    F.box(-10.2, -5.0, 5.45, 7.75, .05, .06, '#1a2630')
    for i in range(6):
        u = -10.2 + i * 5.2 / 5
        F.box(u - .04, u + .04, 5.4, 7.8, .05, .12, '#2a2c30')
    F.box(-10.25, -4.95, 7.75, 7.82, .05, .14, '#2a2c30')
    neon(B, -10.25, -4.95, y0 - .2, y0, 5.28, 5.38, CYAN)
    # VIP balcony: slab, glass rail with chrome top, sliding tinted doors, neon under the edge
    by0 = y0 - 1.7
    B.box(4.9, 10.3, by0, y0, 4.85, 5.05, '#1a1b1e', bottom=True)
    neon(B, 4.88, 10.32, by0 - .04, by0, 4.88, 4.94, MAG)
    for (a, b, c_, d) in [(4.9, 10.3, by0, by0 + .03), (4.9, 4.93, by0, y0), (10.27, 10.3, by0, y0)]:
        B.box(a, b, c_, d, 5.05, 6.0, '#1d2a33')                                      # tinted glass rail
        B.box(a - .02, b + .02, c_ - .02, d + .02, 6.0, 6.06, CHROME)
    F.box(5.1, 10.1, 5.05, 7.6, 0, .05, '#101418')
    F.box(5.15, 10.05, 5.1, 7.55, .05, .06, '#1b2833')
    for u in (5.1, 7.55, 10.05):
        F.box(u - .05, u + .05, 5.05, 7.6, .05, .12, '#2a2c30')
    F.box(5.05, 10.15, 7.55, 7.65, .05, .12, '#2a2c30')
    if detail:                                                                    # two lounge chairs on the balcony
        for x in (6.2, 8.9):
            B.box(x - .35, x + .35, by0 + .5, by0 + 1.1, 5.05, 5.45, '#7a1220')
            B.box(x - .35, x + .35, by0 + 1.0, by0 + 1.15, 5.45, 5.85, '#7a1220')
    # backlit event posters (lightboxes) either side of the entrance
    for k, u in enumerate((-8.6, 8.6)):
        F.box(u - .7, u + .7, .9, 3.1, 0, .14, '#2f3136')
        cols = (('#ff4fb8', '#7b2cff', '#ffd34a', '#1a1030'), ('#2ce8ff', '#ff3d6e', '#ffe08a', '#10172e'))[k]
        F.box(u - .6, u + .6, 1.0, 3.0, .14, .15, cols[3])
        F.box(u - .6, u + .6, 2.2, 3.0, .15, .155, cols[1])
        F.box(u - .6, u + .6, 1.0, 1.35, .15, .155, cols[0])
        if detail:
            F.box(u - .45, u + .45, 2.45, 2.85, .155, .16, cols[2])
            F.box(u - .35, u + .35, 1.5, 2.1, .155, .16, cols[0])
            F.box(u - .5, u + .5, 1.12, 1.24, .155, .16, '#ffffff')
    # neon outline of the facade: magenta under the parapet coping, gold up the corners, cyan at mid height
    neon(B, x0 - .06, x1 + .06, y0 - .12, y0, HT - .76, HT - .64, MAG)
    for s_ in (x0 - .1, x1 + .04):
        neon(B, s_, s_ + .08, y0 - .12, y0 - .02, G + .5, HT - .64, GOLD)
        neon(B, s_, s_ + .08, y0 - .06, y1, HT - .76, HT - .64, MAG)
    neon(B, x0 - .02, -4.4, y0 - .12, y0, 3.53, 3.62, CYAN)
    neon(B, 4.4, x1 + .02, y0 - .12, y0, 3.53, 3.62, CYAN)
    if detail:                                                                    # vertical light fins either side of the entrance
        for u in (-6.6, -5.6, 5.6, 6.6):
            F.box(u - .05, u + .05, G + .5, 3.4, 0, .16, '#2f3136')
            neon(B, u - .035, u + .035, y0 - .19, y0 - .16, G + .6, 3.3, PURP if abs(u) < 6 else MAG)
    # parapet coping (gunmetal) and roof
    B.box(x0 - .08, x1 + .08, y0 - .08, y1 + .08, HT - .64, HT - .56, '#3e4246')
    B.box(x0, x1, y0, y1, HT - .56, HT, '#1f2124')
    B.box(x0 - .06, x1 + .06, y0 - .06, y1 + .06, HT, HT + .07, '#3e4246')
    top(B, x0 + .25, x1 - .25, y0 + .25, y1 - .25, HT - .2, '#55524d')
    # roof kit: water tanks, AC condensers, a small plant room
    rz = HT - .2
    gp_tank(B, -7.5, 4.5, rz)
    gp_tank(B, -5.7, 4.5, rz)
    B.box(2, 6, 3, 6.5, rz, rz + 2.4, '#2a2c30', grime=True)
    B.box(1.9, 6.1, 2.9, 6.6, rz + 2.4, rz + 2.55, '#3e4246')
    if detail:
        Wall(B, 'F', 2, 6, 3, 6.5).door(4, rz, .9, 2.0, '#3a3d40')
        for i in range(3):
            x = -2 + i * 1.1
            B.box(x - .4, x + .4, -2.0, -1.6, rz, rz + .1, '#55585b')
            B.box(x - .4, x + .4, -2.0, -1.6, rz + .1, rz + .7, '#e2e1dc')
            B.face([(x - .05 + .17 * math.cos(2 * math.pi * k / 10), -2.003, rz + .4 + .17 * math.sin(2 * math.pi * k / 10)) for k in range(10)][::-1], '#3a3c3e')
        rod(B, (8, 0, rz), (8, 0, rz + 3.0), .04, '#8a8d90')                       # a small antenna mast
        cylinder(B, 8.25, 0, rz + 2.2, rz + 2.3, .4, '#d8d8d4', 10)
    # --- sides: cladding seams, AC condensers with pipes, a fire exit
    for s_, w_ in (('L', L), ('R', R)):
        clad_panels(B, w_, y0 + .02, y1 - .02, G + .45, HT - .64, pw=2.0, ph=1.43, key=2 if s_ == 'L' else 3, skip=((-3, -1.2, G, 2.6),) if s_ == 'L' else ())
    L.door(-2.1, G, 1.2, 2.3, '#3d4146')                                             # fire exit (left side, u=-y)
    if detail:
        L.box(-2.5, -1.7, 2.45, 2.65, 0, .25, '#1a1a1c')
        L.box(-2.2, -2.0, 2.48, 2.6, .25, .26, '#3fe07a')                              # green exit light
    for (u, z) in ((-3.5, 1.4), (-1.5, 1.4), (1.0, 1.4), (-2.5, 5.2), (0.0, 5.2), (3.5, 5.2)):
        ext_ac(B, 'x', x1, u, z, 1)
        if detail:
            B.box(x1, x1 + .05, u + .25, u + .3, z + .55, HT - 1.2, '#cfcfcb')          # pipe up the wall
    for (u, z) in ((2.0, 1.4), (4.5, 1.4), (-4.0, 5.2)):
        ext_ac(B, 'x', x0, -u, z, -1)
    # generator housing on the right, with an exhaust up the wall
    gx0, gx1, gy0, gy1 = x1 + .5, x1 + 2.4, 2.0, 6.5
    B.box(gx0, gx1, gy0, gy1, G, G + 1.9, '#5b6a58', grime=True)
    B.box(gx0 - .05, gx1 + .05, gy0 - .05, gy1 + .05, G + 1.9, G + 2.0, '#4b5848')
    if detail:
        for k in range(6):
            y = gy0 + .5 + k * .6
            B.box(gx1, gx1 + .02, y, y + .4, G + .6, G + 1.5, '#3e4a3d')
        cylinder(B, gx0 + .4, gy1 - .5, G + 2.0, HT - .5, .07, '#3a3a3a', 8)
    B.box(gx0 + .2, gx1 - .2, gy0 + .2, gy1 - .2, 0, G + .15, '#77736d')
    # back: panels, a service door, bins
    clad_panels(B, Bk, x0 + .02, x1 - .02, G + .45, HT - .64, pw=2.2, ph=1.43, key=4, skip=((2.4, 4.6, G, 2.7),))
    Bk.door(3.5, G, 1.5, 2.4, '#3d4146')
    if detail:
        for x in (-6, -4.8):
            B.box(x - .5, x + .5, y1 + .2, y1 + 1.0, G, G + 1.1, '#2f5d3a')
            B.box(x - .52, x + .52, y1 + .18, y1 + 1.02, G + 1.1, G + 1.16, '#244a2e')
    # security booth at the front left corner of the forecourt
    sx0, sx1, sy0, sy1 = x0 + .3, x0 + 2.1, y0 - 3.7, y0 - 2.0
    B.box(sx0, sx1, sy0, sy1, G, G + 1.0, '#2a2c30', grime=True)
    for x in (sx0, sx1 - .08):
        for y in (sy0, sy1 - .08):
            B.box(x, x + .08, y, y + .08, G + 1.0, G + 2.25, '#2a2c30')
    B.box(sx0 + .04, sx1 - .04, sy0 + .04, sy1 - .04, G + 1.0, G + 2.25, '#14202a')     # tinted glass all round
    B.box(sx0 - .25, sx1 + .25, sy0 - .3, sy1 + .2, G + 2.25, G + 2.4, '#1a1b1e')
    neon(B, sx0 - .26, sx1 + .26, sy0 - .32, sy0 - .3, G + 2.28, G + 2.34, CYAN)
    if detail:
        B.box(sx1 - .02, sx1, sy0 + .3, sy1 - .3, G + .95, G + 1.0, '#555')
        B.box(sx0 + .3, sx1 - .3, sy0 + .3, sy1 - .3, G + 2.4, G + 2.42, '#fff3d6')   # roof light
    # bollards along the kerb
    if detail:
        for x in (-8.5, -6.5, -4.6, 4.6, 6.5, 8.5):
            cylinder(B, x, y0 - 3.95, G, G + .8, .07, CHROME, 8)
            cylinder(B, x, y0 - 3.95, G + .62, G + .7, .075, MAG if x < 0 else CYAN, 8, False)
    # spots for the game
    B.mark('door', 0, y0 - .9, 0, face='+y')
    B.mark('bouncer_1', -2.3, y0 - .9, 0, face='-y')
    B.mark('bouncer_2', 2.3, y0 - .9, 0, face='-y')
    return B.finish('ns_club' + ('' if detail else '_lod1'))


# ================================================================ CLUB GBEDU (inside)
LEDS = [MAG, CYAN, PURP, GOLD, '#ff3b3b', '#3d5cff', '#22ff9c', '#ff8a1f']


def room_shell(B, x0, x1, y0, y1, h, wall, floor_c, ceil, t=.25, front_gap=None, back_gaps=(), skirt=None, tile=1.0, ceil_cols=None):
    """Walls (outside the room rectangle), a tiled floor and a ceiling. front_gap = (a, b, top) door in the -Y wall."""
    wall_x(B, y0 - t, y0, x0 - t, x1 + t, h, wall, gaps=[front_gap] if front_gap else [])
    wall_x(B, y1, y1 + t, x0 - t, x1 + t, h, wall, gaps=list(back_gaps))
    wall_y(B, x0 - t, x0, y0, y1, h, wall)
    wall_y(B, x1, x1 + t, y0, y1, h, wall)
    nx, ny = max(1, round((x1 - x0) / tile)), max(1, round((y1 - y0) / tile))
    dx, dy = (x1 - x0) / nx, (y1 - y0) / ny
    for i in range(nx):
        for j in range(ny):
            col = vary(floor_c, i, j, a=.07) if isinstance(floor_c, str) else floor_c(i, j)
            if col:
                top(B, x0 + i * dx, x0 + (i + 1) * dx, y0 + j * dy, y0 + (j + 1) * dy, 0, col)
    under(B, x0 - t, x1 + t, y0 - t, y1 + t, h, ceil)
    if skirt:
        g = [(front_gap[0], front_gap[1])] if front_gap else []
        skirting_x(B, y0, x0, x1, 1, skirt, gaps=g)
        skirting_x(B, y1, x0, x1, -1, skirt, gaps=[(a, b) for a, b, _ in back_gaps])
        skirting_y(B, x0, y0, y1, 1, skirt); skirting_y(B, x1, y0, y1, -1, skirt)


def bottle(B, x, y, z, c, k):
    h = .22 + .1 * hh(k, 3)
    B.box(x - .035, x + .035, y - .035, y + .035, z, z + h, c)
    B.box(x - .013, x + .013, y - .013, y + .013, z + h, z + h + .09, shade(c, .7))


def int_club(detail=True):
    """Inside CLUB GBEDU: LED dance floor, DJ stage with LED wall, long bar with back bar and fridges, VIP booths."""
    B = Builder(True)
    x0, x1, y0, y1, HH = -12.0, 12.0, -9.0, 9.0, 5.0
    WALLC = '#1a1a20'
    room_shell(B, x0, x1, y0, y1, HH, WALLC, '#1d1c21', '#0c0c0f', front_gap=(-1.2, 1.2, 2.7), skirt='#0a0a0c', tile=1.0)
    # neon strips running round the walls, a floor glow line
    for (y, sgn) in ((y0, 1), (y1, -1)):
        neon(B, x0, x1, min(y, y + sgn * .04), max(y, y + sgn * .04), 3.2, 3.27, MAG if sgn > 0 else PURP)
    neon(B, x0, x0 + .04, y0, y1, 3.2, 3.27, GOLD)
    neon(B, x1 - .04, x1, y0, y1, 3.2, 3.27, CYAN)
    # entrance: door frame, open door leaves against the wall, a ticket/cloak booth
    door_frame(B, 'y', y0, -1.2, 1.2, 2.7, 1, '#7a6230', .1)
    B.box(-2.25, -1.3, y0, y0 + .05, 0, 2.6, '#121417'); B.box(1.3, 2.25, y0, y0 + .05, 0, 2.6, '#121417')
    neon(B, -1.3, 1.3, y0, y0 + .06, 2.8, 2.86, CYAN)
    B.box(3.0, 6.0, y0, y0 + 1.6, 0, 1.1, '#26222a')                       # cashier counter
    B.box(2.95, 6.05, y0 - .02, y0 + 1.65, 1.1, 1.15, '#7a6230')
    neon(B, 3.0, 6.0, y0 + 1.6, y0 + 1.63, .1, .14, GOLD)
    B.box(3.6, 4.2, y0 + .4, y0 + .8, 1.15, 1.2, '#202020'); B.box(3.65, 4.15, y0 + .78, y0 + .82, 1.15, 1.5, '#5fb8ff')  # POS screen
    # dance floor: raised black frame with glowing LED tiles in a wave pattern
    dx0, dx1, dy0, dy1 = -4.0, 4.0, -3.5, 2.5
    B.box(dx0 - .15, dx1 + .15, dy0 - .15, dy1 + .15, 0, .12, '#101012')
    for i in range(8):
        for j in range(6):
            cx, cy = dx0 + i + .5, dy0 + j + .5
            r = math.hypot(cx, cy + .5)
            k = int(r * 1.3 + hh(i, j) * 1.2) % len(LEDS)
            c = LEDS[k] if (i + j) % 3 else shade(LEDS[(k + 3) % len(LEDS)], .55)
            B.box(dx0 + i + .04, dx0 + i + .96, dy0 + j + .04, dy0 + j + .96, .12, .14, c)
    # DJ stage with LED wall
    B.box(-6.5, 6.5, 4.2, y1, 0, .28, '#141416')
    neon(B, -6.5, 6.5, 4.17, 4.2, .2, .25, CYAN)
    B.box(-1.0, 1.0, 3.6, 4.2, 0, .14, '#18181b')                                 # a low step up
    B.box(-5.2, 5.2, y1 - .25, y1, .9, 3.7, '#060608')
    nx, nz = 40, 11
    for i in range(nx):
        for j in range(nz):
            u, v = -5.0 + 10.0 * (i + .5) / nx, 1.0 + 2.6 * (j + .5) / nz
            r = math.hypot(u, (v - 2.3) * 1.6)
            t = math.sin(r * 1.4) * .5 + .5
            c = [MAG, PURP, '#3d5cff', CYAN, '#ffffff', GOLD][int(t * 5.99)] if (i + j) % 2 == 0 or t > .4 else shade(PURP, .6)
            vquad(B, 'y', -5.0 + 10.0 * i / nx + .01, -5.0 + 10.0 * (i + 1) / nx - .01, 1.0 + 2.6 * j / nz + .01, 1.0 + 2.6 * (j + 1) / nz - .01, y1 - .26, c)
    B.box(-3.4, 3.4, y1 - .2, y1, 3.8, 4.7, '#0c0c0e')                             # header board for the sign
    for (a, b, c_, d) in [(-3.4, 3.4, 3.8, 3.85), (-3.4, 3.4, 4.65, 4.7)]:
        B.box(a, b, y1 - .23, y1 - .2, c_, d, GOLD)
    B.mark('sign_name', 0, y1 - .25, 4.25, text='CLUB GBEDU', w=6.0, h=.8, face='-y')
    # DJ booth: front panel with LED lines, decks, mixer, laptop on a stand
    B.box(-2.2, 2.2, 5.4, 6.2, .28, 1.35, '#111114')
    for k in range(4):
        neon(B, -2.15, 2.15, 5.37, 5.4, .45 + k * .22, .5 + k * .22, [MAG, PURP, CYAN, PURP][k])
    B.box(-2.3, 2.3, 5.3, 6.3, 1.35, 1.4, '#2a2a2e')
    for x in (-1.3, 1.3):
        B.box(x - .4, x + .4, 5.55, 6.1, 1.4, 1.46, '#1d1d20')
        disc(B, x, 5.82, 1.465, .2, '#3a3a3e', 12)
        disc(B, x, 5.82, 1.47, .06, '#d0d0d0', 8)
        B.box(x + .25, x + .35, 5.6, 5.7, 1.46, 1.48, '#ff3b3b')
    B.box(-.4, .4, 5.55, 6.1, 1.4, 1.5, '#1a1a1d')
    for k in range(6):
        B.box(-.32 + k * .12, -.28 + k * .12, 5.65, 5.95, 1.5, 1.52, '#9a9aa0')
    B.box(-.18, .18, 6.0, 6.25, 1.5, 1.7, '#5a5a5e')                            # laptop stand
    B.box(-.2, .2, 6.0, 6.25, 1.7, 1.72, '#c8c8cc')
    B.face([(-.2, 6.25, 1.72), (.2, 6.25, 1.72), (.2, 6.33, 1.97), (-.2, 6.33, 1.97)], '#c8c8cc')
    B.face([(-.18, 6.245, 1.73), (.18, 6.245, 1.73), (.18, 6.325, 1.96), (-.18, 6.325, 1.96)], '#7fd4ff')
    B.mark('dj', 0, 6.8, .28, face='-y')
    # speaker stacks either side of the stage, subs on the floor
    for sx in (-4.6, 4.6):
        for k in range(3):
            z0 = .28 + k * .85
            B.box(sx - .55, sx + .55, 5.0, 5.8, z0, z0 + .83, '#101012')
            disc(B, sx, 4.995, z0 + .42, .3 if k == 0 else .22, '#2c2c30', 12)
            disc(B, sx, 4.99, z0 + .42, .1, '#55555a', 8)
            if k:
                disc(B, sx, 4.995, z0 + .72, .07, '#3a3a3e', 8)
        B.face([(sx - .55, 5.0, 2.84), (sx + .55, 5.0, 2.84), (sx + .55, 5.0, 2.86), (sx - .55, 5.0, 2.86)], CYAN)
    # lighting truss over the dance floor with coloured heads, mirror ball
    tz = 4.35
    for (a, b, c_, d) in [(dx0 - .5, dx1 + .5, dy0 - .5, dy0 - .3), (dx0 - .5, dx1 + .5, dy1 + .3, dy1 + .5),
                          (dx0 - .5, dx0 - .3, dy0 - .5, dy1 + .5), (dx1 + .3, dx1 + .5, dy0 - .5, dy1 + .5)]:
        B.box(a, b, c_, d, tz, tz + .04, '#8e9196'); B.box(a, b, c_, d, tz + .3, tz + .34, '#8e9196')
    for x in (dx0 - .4, dx1 + .4):
        for y in (dy0 - .4, dy1 + .4):
            B.box(x - .02, x + .02, y - .02, y + .02, tz + .34, HH, '#5a5d61')
    k = 0
    x = dx0 - .5
    while x < dx1 + .5:
        for y in (dy0 - .4, dy1 + .4):
            rod(B, (x, y, tz + .04), (x + .3, y, tz + .3), .012, '#8e9196')
        x += .6
    heads = [(-3, dy0 - .4), (-1, dy0 - .4), (1, dy0 - .4), (3, dy0 - .4), (-3, dy1 + .4), (0, dy1 + .4), (3, dy1 + .4), (dx0 - .4, -.5), (dx1 + .4, -.5)]
    for i, (hx, hy) in enumerate(heads):
        B.box(hx - .15, hx + .15, hy - .15, hy + .15, tz - .35, tz, '#1b1b1e')
        B.box(hx - .1, hx + .1, hy - .1, hy + .1, tz - .38, tz - .35, LEDS[i % 6])
    B.box(-.01, .01, -.51, -.49, 4.45, HH, '#888')
    ball(B, 0, -.5, 4.1, .35, '#e6e9ee', 12, 5, '#9aa2ad')
    # long bar along the left wall: counter with glowing lip, stools, back bar shelves with bottles, fridges, mirror
    cx0, cx1, by0, by1 = -9.0, -8.3, -6.0, 5.0
    B.box(cx0, cx1, by0, by1, 0, 1.08, '#2a2025')
    B.box(cx0 - .1, cx1 + .12, by0 - .1, by1 + .1, 1.08, 1.14, '#d9d2c6')        # stone top
    neon(B, cx1, cx1 + .03, by0, by1, .95, 1.0, GOLD)
    neon(B, cx1, cx1 + .03, by0, by1, .08, .12, MAG)
    y = by0 + .3
    while y < by1 - .2:
        B.box(cx1, cx1 + .02, y, y + .55, .2, .85, '#3a2a30')                    # front panels
        y += .7
    for y in (-3.5, -1.0, 1.5, 4.0):                                            # beer taps
        B.box(-8.85, -8.75, y - .02, y + .02, 1.14, 1.5, CHROME)
        B.box(-8.9, -8.7, y - .2, y + .2, 1.45, 1.5, CHROME)
    # glasses and an ice bucket on the counter
    for k_, y in enumerate((-5.2, -2.6, .4, 2.9)):
        cylinder(B, -8.6, y, 1.14, 1.26, .04, '#cfe7f0', 6)
        cylinder(B, -8.65, y + .3, 1.14, 1.3, .1, CHROME, 8)
    stools = [y for y in (-5.3, -4.3, -3.3, -2.3, -1.3, 1.3, 2.3, 3.3, 4.3)]
    for y in stools:
        cylinder(B, -7.75, y, 0, .03, .22, CHROME, 8)
        B.box(-7.77, -7.73, y - .02, y + .02, .03, .72, CHROME)
        cylinder(B, -7.75, y, .72, .8, .2, '#7a1230', 8)
    B.mark('bar', -7.75, 0, 0, face='-x')
    B.mark('bartender', -10.3, 0, 0, face='+x')
    # back bar
    bx0, bx1 = x0, x0 + .55
    B.box(bx0, bx1, by0, by1, 0, .95, '#2a2025')
    B.box(bx0, bx1 + .03, by0, by1, .95, 1.0, '#d9d2c6')
    sections = [(by0, -3.2, 'shelf'), (-3.2, -1.0, 'fridge'), (-1.0, 2.0, 'shelf'), (2.0, 4.2, 'fridge'), (4.2, by1, 'shelf')]
    bcols = ['#3f7d3a', '#8a4b1c', '#c9a14a', '#d8d8d0', '#5a1a2a', '#2f5d9a', '#b8642a', '#1f3a20', '#e0b85a', '#7a2a5a']
    for (a, b, kind) in sections:
        if kind == 'shelf':
            B.box(x0, x0 + .02, a, b, 1.1, 3.0, '#8fa0ad')                       # mirror
            for k in range(4):
                z = 1.25 + k * .48
                B.box(x0, x0 + .32, a, b, z - .025, z, '#c9e6f0')                 # glass shelf
                B.box(x0, x0 + .3, a, b, z - .04, z - .025, GOLD)                 # strip light
                y = a + .12
                n = 0
                while y < b - .08:
                    bottle(B, x0 + .16, y, z, bcols[int(hh(y, k) * len(bcols))], y * 7 + k)
                    y += .15 + .05 * hh(y, k, 1)
                    n += 1
            B.box(x0, x0 + .35, a, a + .05, 1.0, 3.2, '#2a2025'); B.box(x0, x0 + .35, b - .05, b, 1.0, 3.2, '#2a2025')
        else:
            B.box(x0, x0 + .7, a + .05, b - .05, 0, 2.1, '#1d1d20')               # glass-door fridges
            m = (a + b) / 2
            for (p, q) in ((a + .1, m - .03), (m + .03, b - .1)):
                B.box(x0 + .7, x0 + .72, p, q, .15, 1.95, '#bfe9ff')
                for zr in range(5):
                    z = .35 + zr * .33
                    yy = p + .08
                    while yy < q - .06:
                        B.box(x0 + .72, x0 + .73, yy, yy + .06, z, z + .13, ['#e02a2a', '#e8c23a', '#2a6ae0', '#38b04a', '#ff8a1f'][(zr + int(yy * 9)) % 5])
                        yy += .1
                B.box(x0 + .73, x0 + .76, q - .1, q - .07, .8, 1.4, CHROME)
            B.box(x0, x0 + .7, a + .05, b - .05, 2.1, 2.3, '#e02a2a')               # lit header
    B.box(x0, x0 + .6, by0, by1, 3.2, 3.6, '#2a2025')                              # canopy over the back bar
    neon(B, x0 + .58, x0 + .62, by0, by1, 3.2, 3.25, GOLD)
    for y in (-4.5, -1.5, 1.5, 4.0):                                              # pendant lamps over the counter
        B.box(-8.66, -8.64, y - .01, y + .01, 3.0, HH, '#333')
        cylinder(B, -8.65, y, 2.85, 3.0, .14, '#c9a14a', 8)
        B.box(-8.73, -8.57, y - .08, y + .08, 2.82, 2.85, '#fff1c4')
    # VIP: raised platform with chrome rail, three U-sofa booths with tables, LED back panels
    vx0 = 8.0
    B.box(vx0, x1, -7.0, 7.4, 0, .25, '#2a2228')
    neon(B, vx0 - .03, vx0, -7.0, 7.4, .15, .2, MAG)
    for (a, b) in ((-7.0, -2.7), (-1.5, 1.7), (2.9, 7.4)):
        for y in (a + .1, b - .1):
            cylinder(B, vx0 + .1, y, .25, 1.25, .03, CHROME, 6, False)
        B.box(vx0 + .07, vx0 + .13, a + .1, b - .1, 1.2, 1.26, CHROME)
        B.box(vx0 + .085, vx0 + .115, a + .1, b - .1, .5, .9, '#30323a')
    seats = []
    for bi, yc in enumerate((-5.0, -.4, 5.2)):
        hw = 1.7
        sofa = ['#4a1830', '#2a1a4a', '#4a1830'][bi]
        B.box(11.35, x1, yc - hw, yc + hw, .25, 1.5, sofa)                       # back
        B.box(10.6, 11.35, yc - hw, yc + hw, .25, .7, sofa)                      # seat (back run)
        for s_ in (-1, 1):
            ya, yb = sorted((yc + s_ * hw, yc + s_ * (hw - .7)))
            B.box(9.3, 10.6, ya, yb, .25, .7, sofa)                              # side seats
            yA, yB = sorted((yc + s_ * hw, yc + s_ * (hw + .12)))
            B.box(9.3, x1, yA, yB, .25, 1.5, shade(sofa, .8))                    # side backs
        B.box(10.55, 11.36, yc - hw, yc + hw, .7, .73, GOLD)                     # piping
        for k in range(3):                                                        # Ankara cushions
            y = yc - 1.0 + k * 1.0
            col = ['#e8a317', '#1f7a6a', '#c43c2a'][(k + bi) % 3]
            B.box(11.15, 11.35, y - .22, y + .22, .7, 1.12, col)
            B.box(11.14, 11.15, y - .12, y + .12, .8, 1.02, ['#1f3a8a', '#f2e2b0', '#2a2a2a'][(k + bi) % 3])
        cylinder(B, 9.95, yc, .25, .9, .06, CHROME, 6, False)
        cylinder(B, 9.95, yc, .9, .95, .55, '#151517', 12)
        B.box(9.8, 9.9, yc - .15, yc - .05, .95, 1.25, '#1f5a2a'); B.box(9.83, 9.87, yc - .12, yc - .08, 1.25, 1.35, GOLD)  # champagne
        cylinder(B, 10.1, yc + .15, .95, 1.15, .1, CHROME, 8)
        B.box(x1 - .04, x1, yc - hw, yc + hw, 1.6, 3.0, '#120c18')
        neon(B, x1 - .06, x1 - .04, yc - hw, yc + hw, 1.58, 1.63, PURP)
        neon(B, x1 - .06, x1 - .04, yc - hw, yc + hw, 2.97, 3.02, PURP)
        seats += [(10.95, yc - .7), (10.95, yc + .7)]
    for i, (sx, sy) in enumerate(seats):
        B.mark(f'seat_{i + 1}', sx, sy, .7, face='-x')
    # standing tables around the floor
    for (tx, ty) in ((-5.6, -5.0), (-5.6, 1.0), (5.6, -5.0), (5.6, 1.0), (-5.6, -2.0), (5.6, -2.0)):
        cylinder(B, tx, ty, 0, .03, .25, '#222', 8)
        cylinder(B, tx, ty, .03, 1.08, .04, CHROME, 6, False)
        cylinder(B, tx, ty, 1.08, 1.12, .32, '#151517', 10)
        cylinder(B, tx + .1, ty, 1.12, 1.3, .035, '#3a7a3a', 6)
    # wall art: neon wings on the entrance wall, acoustic panels on the side walls
    for s_ in (-1, 1):
        for k in range(4):
            a0, a1 = s_ * (2.0 + k * .45), s_ * (4.0 + k * .5)
            stroke(B, 'y', y0 + .03, (a0 + a1) / 2, 3.9 - k * .3, abs(a1 - a0), (.25 + k * .1) * s_, [MAG, PURP, CYAN, GOLD][k], .05)
    for y in (-7.5, -6.0, 6.0, 7.5):
        B.box(x1 - .06, x1, y - .6, y + .6, 3.5, 4.7, '#24202a')
    # ceiling: black ducts and a few spot cans
    B.box(-11, 11, -1.4, -.6, 4.6, 4.95, '#141416')
    for (sx, sy) in ((-6, -6), (6, -6), (-6, 4), (6, 4), (0, -7), (-10, 6)):
        cylinder(B, sx, sy, 4.85, HH, .1, '#222', 8)
        disc(B, sx, sy, 4.849, .07, '#fff1c4', 8)
    # toilets door (closed) on the right wall near the front, with sign plate
    B.box(x1 - .05, x1, -8.4, -7.4, 0, 2.2, '#2a2230')
    door_frame(B, 'x', x1, -8.4, -7.4, 2.2, -1, '#7a6230', .06)
    B.box(x1 - .07, x1 - .05, -7.6, -7.5, 1.0, 1.08, CHROME)
    B.box(x1 - .07, x1 - .05, -8.1, -7.7, 2.3, 2.5, '#2cf2ff')
    # marks
    B.mark('spawn', 0, y0 + 1.6, 0, face='+y')
    B.mark('exit', 0, y0 + .7, 0, face='-y')
    for i, (dx, dy) in enumerate([(-3, -2.5), (-1, -2.5), (1, -2.5), (3, -2.5), (-3, .5), (-1, .5), (1, .5), (3, .5)]):
        B.mark(f'dance_{i + 1}', dx, dy, .14, face='+y' if i < 4 else '-y')
    L_ = [(-2.5, -.5, 4.0, MAG, 40, 12), (2.5, -.5, 4.0, CYAN, 40, 12), (0, 6.5, 4.3, PURP, 35, 12), (-10.0, -.5, 3.4, GOLD, 30, 12),
          (10.0, -.4, 3.4, '#ff4fb8', 25, 10), (0, -7.0, 3.6, '#ffd9a0', 18, 9)]
    for i, (lx, ly, lz, c, pw, rg) in enumerate(L_):
        B.mark(f'light_{i + 1}', lx, ly, lz, color=c, power=pw, range=rg)
    return B.finish('int_club')


# ================================================================ NIGERIA POLICE, MUSHIN DIVISION (outside)
NAVY, SKY, PWHITE = '#1d2c5e', '#cfe0ee', '#eef1f2'


def old_car(B, x, y, body='#22305f', top_c='#e9ecee', lightbar=True):
    """An old saloon patrol car, nose toward -y (simple boxes: body, cabin, wheels, lights)."""
    L, W = 4.5, 1.75
    ya, yb = y - L / 2, y + L / 2
    for (wy) in (ya + .8, yb - .85):
        for s_ in (-1, 1):
            cylinder_x(B, x + s_ * (W / 2 - .12), x + s_ * (W / 2 + .02), wy, .32, .32, '#1b1b1b', 10)
            cylinder_x(B, x + s_ * (W / 2 + .02), x + s_ * (W / 2 + .03), wy, .32, .17, '#9a9a96', 8)
    B.box(x - W / 2, x + W / 2, ya, yb, .3, .82, body)
    B.box(x - W / 2 + .03, x + W / 2 - .03, ya + .05, yb - .05, .82, .86, shade(body, .9))
    B.box(x - W / 2 - .01, x + W / 2 + .01, ya + .6, yb - .5, .58, .72, top_c)     # white door band
    # cabin: glass with white roof
    cy0, cy1 = ya + 1.55, yb - 1.0
    B.face([(x - W / 2 + .08, cy0, .86), (x + W / 2 - .08, cy0, .86), (x + W / 2 - .15, cy0 + .5, 1.32), (x - W / 2 + .15, cy0 + .5, 1.32)], '#2a3640')
    B.face([(x + W / 2 - .08, cy1, .86), (x - W / 2 + .08, cy1, .86), (x - W / 2 + .15, cy1 - .4, 1.32), (x + W / 2 - .15, cy1 - .4, 1.32)], '#2a3640')
    for s_ in (-1, 1):
        xs = x + s_ * (W / 2 - .08)
        xt = x + s_ * (W / 2 - .15)
        pts = [(xs, cy0, .86), (xs, cy1, .86), (xt, cy1 - .4, 1.32), (xt, cy0 + .5, 1.32)]
        B.face(pts if s_ > 0 else pts[::-1], '#2a3640')
        B.face([(xt + s_ * .005, (cy0 + cy1) / 2 - .03, .9), (xt + s_ * .005, (cy0 + cy1) / 2 + .03, .9), (xt + s_ * .005, (cy0 + cy1) / 2 + .03, 1.3), (xt + s_ * .005, (cy0 + cy1) / 2 - .03, 1.3)][::s_], top_c)
    B.box(x - W / 2 + .15, x + W / 2 - .15, cy0 + .5, cy1 - .4, 1.32, 1.36, top_c)
    if lightbar:
        B.box(x - .6, x - .02, cy0 + 1.0, cy0 + 1.25, 1.36, 1.48, '#d82020')
        B.box(x + .02, x + .6, cy0 + 1.0, cy0 + 1.25, 1.36, 1.48, '#2050e0')
    for s_ in (-1, 1):                                                               # lights and bumpers
        B.box(x + s_ * .62 - .16, x + s_ * .62 + .16, ya - .01, ya, .62, .74, '#f4f1dc')
        B.box(x + s_ * .66 - .12, x + s_ * .66 + .12, yb, yb + .01, .62, .72, '#b01818')
    B.box(x - W / 2, x + W / 2, ya - .08, ya, .3, .45, '#3a3a3a')
    B.box(x - W / 2, x + W / 2, yb, yb + .08, .3, .45, '#3a3a3a')
    B.box(x - .35, x + .35, ya - .02, ya, .5, .6, '#2a2a2a')                       # grille


def sandbag_row(B, x0, x1, y, z, along='x', n=None, c='#a8956a', key=0):
    L = .55
    n = n or max(1, int((x1 - x0) / L))
    step = (x1 - x0) / n
    for i in range(n):
        a = x0 + i * step
        col = vary(c, i, z, key, a=.1)
        if along == 'x':
            B.box(a + .02, a + step - .02, y - .17, y + .17, z, z + .15, col)
            B.box(a + .06, a + step - .06, y - .14, y + .14, z + .15, z + .18, col)
        else:
            B.box(y - .17, y + .17, a + .02, a + step - .02, z, z + .15, col)
            B.box(y - .14, y + .14, a + .06, a + step - .06, z + .15, z + .18, col)


def nigeria_flag(B, px, y, ztop, L=1.8, Hf=.9):
    """A Nigerian flag (green-white-green vertical bands) flying from a pole at px, toward +x, with a gentle wave."""
    n = 9
    for i in range(n):
        u0, u1 = L * i / n, L * (i + 1) / n
        w0, w1 = .08 * math.sin(u0 * 3.2), .08 * math.sin(u1 * 3.2)
        c = '#118a4a' if (u0 + u1) / 2 < L / 3 or (u0 + u1) / 2 > 2 * L / 3 else '#f5f5f2'
        B.face([(px + u0, y + w0, ztop - Hf - u0 * .06), (px + u1, y + w1, ztop - Hf - u1 * .06), (px + u1, y + w1, ztop - u1 * .02), (px + u0, y + w0, ztop - u0 * .02)], c)


def police(detail):
    """A Nigeria Police division building: navy lower band, sky-blue/white above, a portico with steps and a counter
    window, barred windows, flagpole, a short front wall with an open gate, a parking shade with an old patrol car."""
    B = Builder(detail, simple=True)
    W, D, F, FH = 24.0, 14.0, .45, 3.4
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    # compound: worn concrete apron from the gate to the building
    B.box(-16, 16, -17.2, y1 + 1.0, 0, .06, '#9a958b')
    if detail:
        for k in range(14):                                                         # cracks and oil stains
            cx_, cy_ = -14 + 28 * hh(k, 1), -16 + 8 * hh(k, 2)
            B.face([(cx_, cy_, .062), (cx_ + 1.4 * hh(k, 3) + .3, cy_ + .05, .062), (cx_ + 1.4 * hh(k, 3) + .3, cy_ + .08, .062), (cx_, cy_ + .03, .062)], '#6f6b63')
        for (ox, oy) in ((10.5, -12.5), (11.4, -11.0)):
            disc(B, ox, oy, .063, .5, '#6a665f', 8)
    slab(B, x0 - .3, x1 + .3, y0 - .3, y1 + .3, F)
    top_ = F + FH * 2
    w = walls(B, x0, x1, y0, y1, F, top_, SKY, .0)
    # paint: navy dado on the ground floor, navy floor band, white upper storey, navy band under the eaves
    for s_, (u0, u1) in (('F', (x0, x1)), ('B', (x0, x1)), ('L', (y0, y1)), ('R', (y0, y1))):
        if s_ in 'FB':
            a, b = (x0, x1) if s_ == 'F' else (-x1, -x0)
        else:
            a, b = (-y1, -y0) if s_ == 'L' else (y0, y1)
        w[s_].box(a - .01, b + .01, F, F + 1.9, 0, .012, NAVY)
        w[s_].box(a - .01, b + .01, F + 1.9, F + 2.0, 0, .02, PWHITE)                # white trim line
        w[s_].box(a - .01, b + .01, F + FH, top_, 0, .01, PWHITE)
        w[s_].box(a - .03, b + .03, F + FH - .1, F + FH + .3, 0, .06, NAVY)          # floor band
        w[s_].box(a - .03, b + .03, top_ - .35, top_, 0, .05, NAVY)
    B.box(x0 - .04, x1 + .04, y0 - .04, y1 + .04, F - .02, F + .15, '#3a3f4a')        # dark skirting
    # windows with burglar bars
    for f in range(2):
        zs = F + FH * f + .95
        for u in (-10.0, -7.0, 7.0, 10.0) if f == 0 else (-10.0, -7.0, -3.5, 0.0, 3.5, 7.0, 10.0):
            w['F'].window(u, zs, 1.5, 1.4, 'louvre', True)
        for u in (-9.5, -5.5, -1.5, 2.5, 6.5, 10.0):
            w['B'].window(u, zs, 1.3, 1.3, 'louvre', True)
        for u in (-4.0, 0.0, 4.0):
            w['L'].window(u, zs, 1.3, 1.3, 'louvre', True)
            w['R'].window(u, zs, 1.3, 1.3, 'louvre', True)
    # portico: slab on four columns, steps, double doors, counter window
    py0 = y0 - 3.2
    B.box(-5.2, 5.2, py0, y0, 0, F, '#8d877e')
    B.box(-5.25, 5.25, py0 - .03, y0, F - .05, F, '#b5aea2')
    steps(B, -3.0, 3.0, py0, F, 3, .34)
    B.box(-5.4, 5.4, py0 - .2, y0, F + 3.25, F + 3.55, PWHITE, bottom=True)          # portico roof
    B.box(-5.45, 5.45, py0 - .25, py0 - .15, F + 3.15, F + 3.65, NAVY)              # fascia
    for x in (-4.9, -1.9, 1.9, 4.9):
        B.box(x - .2, x + .2, py0 - .05, py0 + .35, F, F + 3.25, PWHITE)
        B.box(x - .21, x + .21, py0 - .06, py0 + .36, F, F + 1.0, NAVY)
    w['F'].door(0, F, 2.0, 2.5, '#6b4a2e')
    w['F'].box(-.02, .02, F, F + 2.5, .03, .05, '#3a2a1c')
    w['F'].box(2.3, 3.7, F + .95, F + 2.0, 0, .02, '#2c3a44')                       # counter window with bars and a ledge
    for (p, q, r, t) in [(2.22, 2.3, F + .9, F + 2.05), (3.7, 3.78, F + .9, F + 2.05), (2.22, 3.78, F + 2.0, F + 2.08)]:
        w['F'].box(p, q, r, t, 0, .06, PWHITE)
    w['F'].box(2.15, 3.85, F + .9, F + .98, 0, .32, '#b5aea2')
    if detail:
        for k in range(1, 8):
            u = 2.3 + 1.4 * k / 8
            w['F'].box(u - .01, u + .01, F + .98, F + 2.0, .06, .08, BARS)
        w['F'].box(-4.6, -2.8, F + 1.0, F + 2.1, 0, .04, '#6b4a2e')                  # notice board
        for k in range(5):
            w['F'].box(-4.5 + k * .33, -4.25 + k * .33, F + 1.35 + .2 * hh(k, 4), F + 1.75 + .2 * hh(k, 4), .04, .05, ['#f2f0e6', '#f6e7a8', '#e9eef2'][k % 3])
        B.box(-4.4, -4.0, y0 - .03, y0, F + 2.6, F + 2.8, '#f5f3ee')               # bulkhead light
        B.box(-.2, .2, py0 + .3, py0 + .6, F + 3.2, F + 3.25, '#fff4d0')
    # sign board on the portico roof edge (the text is drawn by the game)
    sz0 = F + 3.65
    B.box(-4.7, 4.7, py0 - .22, py0 - .12, sz0, sz0 + 1.55, '#f4f5f6')
    for (a, b, c_, d) in [(-4.7, 4.7, sz0, sz0 + .07), (-4.7, 4.7, sz0 + 1.48, sz0 + 1.55), (-4.7, -4.63, sz0, sz0 + 1.55), (4.63, 4.7, sz0, sz0 + 1.55)]:
        B.box(a, b, py0 - .25, py0 - .12, c_, d, NAVY)
    for x in (-3.5, 3.5):
        B.box(x - .05, x + .05, py0 - .1, py0 + .1, F + 3.55, sz0 + 1.4, '#555a60')
    B.mark('sign_name', 0, py0 - .27, sz0 + .78, text='NIGERIA POLICE — MUSHIN DIVISION', w=9.0, h=1.4, face='-y')
    # roof: blue-grey long-span hip roof
    hip_roof(B, x0, x1, y0, y1, top_, .7, 16, '#6c7c8c', ribs=detail)
    # back: AC units; side: a water tank stand
    for u in (-6.0, 1.0, 8.0):
        ext_ac(B, 'y', y1, u, F + FH + .9, 1)
    if detail:
        gp_tank(B, x1 + 1.6, 4.0, 0, .75, 1.4)
        B.box(x1 + 1.0, x1 + 2.2, 3.4, 4.6, 0, .05, '#8d877e')
    # front wall with an open gate, short returns, pillars with caps
    fy = -17.0
    gate = 3.4
    for (a, b) in ((-15.5, -gate), (gate, 15.5)):
        B.box(a, b, fy - .1, fy + .1, 0, 1.0, NAVY, grime=True)
        B.box(a, b, fy - .1, fy + .1, 1.0, 1.8, PWHITE)
        B.box(a - .02, b + .02, fy - .14, fy + .14, 1.8, 1.88, '#c9ccd0')
        x = a
        while x <= b + .01:
            B.box(x - .2, x + .2, fy - .2, fy + .2, 0, 2.0, PWHITE)
            B.box(x - .21, x + .21, fy - .21, fy + .21, 0, 1.0, NAVY)
            B.box(x - .25, x + .25, fy - .25, fy + .25, 2.0, 2.1, '#c9ccd0')
            x += (b - a) / max(1, round((b - a) / 3.0))
    for s_ in (-1, 1):
        xr = s_ * 15.5
        B.box(xr - .1, xr + .1, fy, fy + 4.0, 0, 1.0, NAVY, grime=True)
        B.box(xr - .1, xr + .1, fy, fy + 4.0, 1.0, 1.8, PWHITE)
        B.box(xr - .14, xr + .14, fy, fy + 4.0, 1.8, 1.88, '#c9ccd0')
        gx = s_ * gate
        B.box(gx - .35, gx + .35, fy - .35, fy + .35, 0, 2.6, PWHITE)                # gate pillars
        B.box(gx - .36, gx + .36, fy - .36, fy + .36, 0, 1.2, NAVY)
        B.box(gx - .42, gx + .42, fy - .42, fy + .42, 2.6, 2.75, '#c9ccd0')
        B.box(gx - .12, gx + .12, fy - .12, fy + .12, 2.75, 3.0, '#f5f3ee')          # pillar lamps
        # gate leaves swung open inward against the wall
        lx0, lx1 = sorted((gx + s_ * .45, gx + s_ * 3.2))
        B.box(lx0, lx1, fy + .25, fy + .3, .05, 2.0, NAVY)
        if detail:
            for k in range(1, 9):
                xx = lx0 + (lx1 - lx0) * k / 9
                B.box(xx - .02, xx + .02, fy + .22, fy + .33, .05, 2.1, '#2b3a70')
            B.box(lx0, lx1, fy + .22, fy + .33, 1.0, 1.06, '#2b3a70')
    # flagpole with the Nigerian flag, on a stepped plinth
    fpx, fpy = -8.0, -13.0
    B.box(fpx - .7, fpx + .7, fpy - .7, fpy + .7, 0, .25, PWHITE)
    B.box(fpx - .45, fpx + .45, fpy - .45, fpy + .45, .25, .55, NAVY)
    cylinder(B, fpx, fpy, .55, 9.0, .06, '#d8dadc', 8)
    ball(B, fpx, fpy, 9.06, .09, '#d8b04a', 8, 3)
    nigeria_flag(B, fpx + .06, fpy, 8.9)
    if detail:
        rod(B, (fpx + .07, fpy, 1.2), (fpx + .07, fpy, 8.9), .006, '#eeeeee')
    # sandbag post beside the gate, sandbags at the portico
    if detail:
        for lvl in range(3):
            z = .06 + lvl * .18
            sandbag_row(B, 4.6, 7.4, -15.9, z, 'x', key=1)
            sandbag_row(B, -15.9, -14.2, 4.6, z, 'y', key=2)
            sandbag_row(B, -15.9, -14.2, 7.4, z, 'y', key=3)
        for lvl in range(2):
            sandbag_row(B, -5.0, -3.3, py0 - .5, .06 + lvl * .18, 'x', key=4)
    else:
        B.box(4.6, 7.4, -16.1, -15.7, 0, .6, '#a8956a')
    # parking shade with an old patrol car
    sx0, sx1, sy0, sy1 = 8.0, 14.0, -15.6, -9.6
    for x in (sx0, sx1):
        for y in (sy0, sy1):
            B.box(x - .06, x + .06, y - .06, y + .06, 0, 2.9 if y == sy0 else 2.6, '#4d555c')
    B.face([(sx0 - .3, sy0 - .4, 2.95), (sx1 + .3, sy0 - .4, 2.95), (sx1 + .3, sy1 + .3, 2.62), (sx0 - .3, sy1 + .3, 2.62)], '#3c5a86')
    B.face([(sx0 - .3, sy1 + .3, 2.6), (sx1 + .3, sy1 + .3, 2.6), (sx1 + .3, sy0 - .4, 2.93), (sx0 - .3, sy0 - .4, 2.93)], '#8a8f94')
    for y in (sy0, sy1):
        B.box(sx0 - .3, sx1 + .3, y - .05, y + .05, 2.5 if y == sy1 else 2.8, 2.6 if y == sy1 else 2.9, '#4d555c')
    if detail:
        x = sx0 - .3
        while x < sx1 + .3:
            B.face([(x, sy0 - .4, 2.96), (x + .05, sy0 - .4, 2.96), (x + .05, sy1 + .3, 2.63), (x, sy1 + .3, 2.63)], '#2f4a70')
            x += .25
        old_car(B, 11.0, -12.6)
    else:
        B.box(10.1, 11.9, -14.85, -10.35, .3, 1.3, '#22305f')
    # spots for the game
    B.mark('door', 0, y0 - 1.0, F, face='+y')
    B.mark('guard', 1.5, y0 - 1.1, F, face='-y')
    return B.finish('ns_police' + ('' if detail else '_lod1'))


# ================================================================ police: charge room and cells (inside)
def bars_x(B, x, y0, y1, h, door=None, c='#3c3f42'):
    """A full-height barred front in the plane x (bars every 12 cm), optional barred door (ya, yb) with a lock box."""
    B.box(x - .06, x + .06, y0, y1, 0, .08, c)
    B.box(x - .06, x + .06, y0, y1, h - .12, h, c)
    for z in (1.05, 2.15):
        B.box(x - .04, x + .04, y0, y1, z, z + .05, c)
    y = y0 + .06
    while y < y1 - .03:
        B.box(x - .016, x + .016, y - .016, y + .016, .08, h - .12, c)
        y += .12
    if door:
        ya, yb = door
        for yy in (ya, yb):
            B.box(x - .05, x + .05, yy - .04, yy + .04, .02, h - .1, '#2c2f31')
        B.box(x - .05, x + .05, ya, yb, 2.2, 2.26, '#2c2f31')
        B.box(x - .1, x + .1, yb - .25, yb - .05, 1.0, 1.25, '#2a2c2e')               # lock box
        B.box(x - .13, x + .13, yb - .18, yb - .12, 1.1, 1.14, '#8c8f92')
        for z in (.4, 1.9):
            B.box(x - .06, x + .06, ya - .08, ya + .02, z, z + .12, '#1d1f20')           # hinges


def tally(B, side, p, a, z, groups, c='#2b2a28'):
    for g in range(groups):
        for k in range(4):
            stroke(B, side, p, a + g * .3 + k * .05, z, .22, math.pi / 2 + .05 * (hh(g, k) - .5), c, .02)
        stroke(B, side, p, a + g * .3 + .075, z, .28, .6, c, .02)


def int_police(detail=True):
    """Inside the Mushin Division: charge room with a counter and flap, desks behind, a corridor to two cells facing
    each other across a 2 m passage (barred fronts, so you see one cell from the other)."""
    B = Builder(True)
    x0, x1, y0, y1, HH = -10.0, 10.0, -8.0, 8.0, 3.4
    WALLC, DADO = '#d4e0e6', '#26386e'

    def floor(i, j):
        x, y = x0 + (i + .5) * .5, y0 + (j + .5) * .5
        if y > 1.2:
            if x < 0:
                return None
            return vary('#8e8b85', i, j, a=.06)
        return vary('#bdb3a0' if (i + j) % 2 else '#a89c86', i, j, a=.05)
    room_shell(B, x0, x1, y0, y1, HH, WALLC, floor, '#ecebe6', t=.2, front_gap=(-.9, .9, 2.4), tile=.5)
    # partition walls: back of the charge room (corridor gap, DPO door), DPO wall, cell walls
    wall_x(B, 1.0, 1.2, x0, x1, HH, WALLC, gaps=[(4.0, 6.0, 2.4)])
    B.box(-.2, 0, 1.2, y1, 0, HH, '#b9b6ae', grime=True)
    for (a, b) in ((0, 4.0), (6.0, x1)):
        B.box(a, b, 3.2, 3.4, 0, HH, '#b9b6ae', grime=True)
    # paint: navy dado round the charge room, white line above
    for (seg, sgn) in (((x0, -.9), 1), ((.9, x1), 1)):
        B.box(seg[0], seg[1], y0, y0 + .012, 0, 1.1, DADO); B.box(seg[0], seg[1], y0, y0 + .016, 1.1, 1.15, '#f4f4f0')
    for (a, b) in ((x0, 4.0), (6.0, x1)):
        B.box(a, b, 1.0 - .012, 1.0, 0, 1.1, DADO); B.box(a, b, 1.0 - .016, 1.0, 1.1, 1.15, '#f4f4f0')
    for xw, sgn in ((x0, 1), (x1, -1)):
        lo, hi = sorted((xw, xw + sgn * .012))
        B.box(lo, hi, y0, 1.0, 0, 1.1, DADO)
        lo, hi = sorted((xw, xw + sgn * .016))
        B.box(lo, hi, y0, 1.0, 1.1, 1.15, '#f4f4f0')
    skirting_x(B, y0, x0, x1, 1, '#1c2a55', gaps=[(-.9, .9)])
    # entrance: frame and an open steel door leaf against the wall
    door_frame(B, 'y', y0, -.9, .9, 2.4, 1, '#f4f4f0', .08)
    B.box(.95, 2.7, y0, y0 + .05, .02, 2.35, '#2b3a70')
    # --- visitor side: benches, notice board, wanted board, complaint box, fan
    for (bx, by, along) in ((-9.6, -6.0, 'y'), (-9.6, -2.0 - 2.2, 'y'), (-6.5, -7.6, 'x'), (9.6, -6.0, 'y')):
        Lb = 2.0
        if along == 'y':
            B.box(bx - .2, bx + .2, by - Lb / 2, by + Lb / 2, .42, .47, '#7a5434')
            B.box(bx - .21 if bx < 0 else bx + .17, bx - .17 if bx < 0 else bx + .21, by - Lb / 2, by + Lb / 2, .62, .9, '#7a5434')
            for yy in (by - Lb / 2 + .1, by + Lb / 2 - .15):
                B.box(bx - .18, bx + .18, yy, yy + .05, 0, .42, '#4e3520')
        else:
            B.box(bx - Lb / 2, bx + Lb / 2, by - .2, by + .2, .42, .47, '#7a5434')
            B.box(bx - Lb / 2, bx + Lb / 2, by - .21, by - .17, .62, .9, '#7a5434')
            for xx in (bx - Lb / 2 + .1, bx + Lb / 2 - .15):
                B.box(xx, xx + .05, by - .18, by + .18, 0, .42, '#4e3520')
    # notice board (left wall) and wanted board (right wall)
    B.box(x0, x0 + .03, -7.0, -4.8, 1.3, 2.4, '#7a5434'); B.box(x0 + .03, x0 + .04, -6.9, -4.9, 1.38, 2.32, '#b08a5a')
    for k in range(7):
        yy = -6.8 + k * .27
        zz = 1.5 + .45 * hh(k, 9)
        B.box(x0 + .04, x0 + .05, yy, yy + .22, zz, zz + .3, ['#f4f2ea', '#f3e6a0', '#e8eef2', '#f4f2ea'][k % 4])
    B.box(x1 - .03, x1, -7.2, -4.6, 1.3, 2.5, '#f2f2ee'); B.box(x1 - .05, x1 - .03, -7.2, -4.6, 2.3, 2.5, '#c42020')
    for k in range(6):
        yy, zz = -6.95 + (k % 3) * .8, 1.45 + (k // 3) * .45
        B.box(x1 - .06, x1 - .05, yy, yy + .6, zz, zz + .38, '#d9d4c7')
        B.face([(x1 - .065, yy + .3 + .09 * math.cos(2 * math.pi * i / 8), zz + .24 + .09 * math.sin(2 * math.pi * i / 8)) for i in range(8)][::-1], '#3a3330')
        B.face([(x1 - .065, yy + .14, zz + .03), (x1 - .065, yy + .14, zz + .13), (x1 - .065, yy + .46, zz + .13), (x1 - .065, yy + .46, zz + .03)][::-1], '#3a3330')
    B.box(x1 - .25, x1, -3.0, -2.6, 1.0, 1.4, '#2b3a70'); B.box(x1 - .26, x1 - .25, -2.95, -2.65, 1.3, 1.33, '#111')  # complaint box
    # --- the counter with a lift flap (raised), items on top
    cy0, cy1 = -3.9, -3.3
    for (a, b) in ((x0, 5.6), (7.0, x1)):
        B.box(a, b, cy0, cy1, 0, 1.05, '#6b4a2e')
        B.box(a, b, cy0 - .06, cy1, 1.05, 1.1, '#8a6240')
        u = a + .02
        while u < b - .1:
            B.box(u, u + .2, cy0 - .01, cy0, .1, 1.0, vary('#5e4128', u, a=.1))
            u += .25
        B.box(a, b, cy0 - .015, cy0, 0, .1, '#3a2a1c')
    B.box(5.6, 5.66, cy0, cy1, 1.1, 2.35, '#8a6240')                                   # flap folded up on its hinge
    B.box(5.55, 5.6, cy0 + .05, cy1 - .05, 1.06, 1.12, '#555')
    # crime diary, pen, statement forms, a desk bell, phone
    B.box(-2.2, -1.2, -3.85, -3.4, 1.1, 1.14, '#f2efe4'); B.box(-1.72, -1.68, -3.85, -3.4, 1.1, 1.15, '#7a1a1a')
    B.box(-1.0, -.9, -3.7, -3.66, 1.1, 1.12, '#1a1aa0')
    for k in range(8):
        B.box(.4, .65, -3.8, -3.45, 1.1 + k * .012, 1.11 + k * .012, '#f8f6ee' if k % 2 else '#e8e4d8')
    cylinder(B, 1.3, -3.6, 1.1, 1.17, .06, '#c9a25a', 8)
    B.box(2.6, 2.9, -3.75, -3.5, 1.1, 1.18, '#1d1d1d'); B.box(2.55, 2.95, -3.72, -3.62, 1.18, 1.22, '#1d1d1d')
    B.mark('officer', -1.6, -2.7, 0, face='-y')
    B.mark('counter', -1.6, -4.6, 0, face='+y')
    # --- behind the counter: desks with old computers, typewriter, case files, chairs, cabinets
    def desk(xc, yc, what):
        table(B, xc - .8, xc + .8, yc - .4, yc + .4, .76, '#7a5434', '#4e3520')
        B.box(xc - .78, xc - .3, yc - .38, yc + .38, .1, .72, '#6b4a2e')               # drawer pedestal
        office_chair(B, xc, yc + .75, '-y') if what != 'none' else None
        if what == 'pc':
            B.box(xc - .25, xc + .25, yc - .05, yc + .35, .76, 1.14, '#d8d0bc')          # CRT monitor
            B.box(xc - .2, xc + .2, yc - .06, yc - .05, .82, 1.1, '#2c3a3a')
            B.box(xc - .3, xc + .3, yc - .35, yc - .15, .76, .79, '#d8d0bc')             # keyboard
            B.box(xc + .9, xc + 1.1, yc - .3, yc + .3, 0, .45, '#d8d0bc')                 # system unit on the floor
        elif what == 'type':
            B.box(xc - .25, xc + .25, yc - .25, yc + .15, .76, .88, '#3a3d3a')           # typewriter
            B.box(xc - .3, xc + .3, yc + .05, yc + .12, .88, .92, '#2a2c2a')
            B.box(xc - .12, xc + .12, yc + .08, yc + .1, .9, 1.08, '#f8f6ee')
        for k in range(int(3 + 4 * hh(xc, yc))):                                       # case files
            B.box(xc + .3, xc + .72, yc - .3, yc + .02, .76 + k * .04, .8 + k * .04, ['#c8a46a', '#b5874a', '#d9c08a', '#8f6a3a'][k % 4])
    desk(-6.5, -1.6, 'pc')
    desk(-3.0, -.9, 'type')
    desk(1.2, -1.6, 'pc')
    desk(8.0, -1.4, 'files')
    for k in range(4):                                                                  # steel filing cabinets on the back wall
        cx_ = -9.5 + k * .55
        B.box(cx_ - .25, cx_ + .25, .45, 1.0, 0, 1.35, '#7d8a86')
        for d in range(3):
            B.box(cx_ - .2, cx_ + .2, .44, .45, .2 + d * .42, .5 + d * .42, '#8e9b97')
            B.box(cx_ - .06, cx_ + .06, .43, .44, .42 + d * .42, .45 + d * .42, '#c9ccc8')
    for k in range(6):                                                                  # files stacked on top
        B.box(-9.7 + k * .3, -9.45 + k * .3, .5, .9, 1.35, 1.35 + .1 + .25 * hh(k, 2), ['#c8a46a', '#b5874a', '#d9c08a'][k % 3])
    # back wall: Nigerian flag colours, sign board, wall clock, DPO door, president-style portrait frames
    B.box(-4.0, -3.4, .985, 1.0, 1.2, 2.9, '#118a4a'); B.box(-3.4, -2.8, .985, 1.0, 1.2, 2.9, '#f5f5f2'); B.box(-2.8, -2.2, .985, 1.0, 1.2, 2.9, '#118a4a')
    B.box(-1.0, 1.4, .97, 1.0, 2.5, 3.0, '#f4f4f0')
    B.box(-1.05, 1.45, .975, 1.0, 2.46, 2.5, DADO)
    B.mark('sign_counter', .2, .96, 2.75, text='CHARGE ROOM', w=2.3, h=.45, face='-y')
    disc_pts = [(2.6 + .22 * math.cos(2 * math.pi * i / 12), .97, 2.25 + .22 * math.sin(2 * math.pi * i / 12)) for i in range(12)]
    B.face(disc_pts, '#f8f8f4')
    B.face([(2.6 + .25 * math.cos(2 * math.pi * i / 12), .98, 2.25 + .25 * math.sin(2 * math.pi * i / 12)) for i in range(12)], '#202020')
    rod(B, (2.6, .965, 2.25), (2.6, .965, 2.42), .008, '#111'); rod(B, (2.6, .965, 2.25), (2.72, .965, 2.2), .008, '#111')
    picture(B, 'y', 1.0, 3.6, 2.1, .5, .65, '#5a6a7a', -1, '#c9a25a')
    picture(B, 'y', 1.0, -5.0, 2.1, .5, .65, '#6a5a4a', -1, '#c9a25a')
    B.box(-6.8, -5.8, .95, 1.0, 0, 2.1, '#5e4128')                                     # DPO office door (closed)
    door_frame(B, 'y', 1.0, -6.8, -5.8, 2.1, -1, '#f4f4f0', .07)
    B.box(-5.95, -5.88, .92, .95, 1.0, 1.06, '#c9a25a')
    B.box(-6.55, -6.05, .94, .95, 1.75, 1.9, '#f2f2ee')                                # name plate
    # corridor opening frame and a barred gate open against the wall
    door_frame(B, 'y', 1.0, 4.0, 6.0, 2.4, -1, '#f4f4f0', .07)
    for k in range(10):
        B.box(6.1 + k * .17, 6.12 + k * .17, .9, .93, .05, 2.3, '#3c3f42')
    B.box(6.1, 7.8, .9, .93, .05, .1, '#3c3f42'); B.box(6.1, 7.8, .9, .93, 2.25, 2.3, '#3c3f42'); B.box(6.1, 7.8, .9, .93, 1.15, 1.2, '#3c3f42')
    # --- lobby to the cells: guard desk, key board, a plastic chair
    table(B, 7.6, 9.6, 1.5, 2.3, .76, '#7a5434', '#4e3520')
    chair(B, 8.6, 2.75, '-y', '#2a6ac0')
    B.box(9.9, 10.0, 1.6, 2.4, 1.4, 1.9, '#7a5434')
    for k in range(5):
        B.box(9.88, 9.9, 1.7 + k * .14, 1.74 + k * .14, 1.55, 1.7, '#c9a25a')
    B.box(.0, .03, 1.5, 2.9, 1.0, 2.2, '#f2f2ee')                                     # rules poster
    for k in range(6):
        B.box(.03, .035, 1.6, 2.8 - .5 * hh(k), 1.9 - k * .14, 1.94 - k * .14, '#555')
    # --- the cells: barred fronts facing each other, bench, mattress, bucket, graffiti, high window, caged bulb
    bars_x(B, 4.0, 3.4, y1, HH, door=(4.5, 5.5))
    bars_x(B, 6.0, 3.4, y1, HH, door=(4.5, 5.5))
    cells = {'a': (0.0, 4.0, 1), 'b': (6.0, 10.0, -1)}
    for name, (cx0, cx1, sgn) in cells.items():
        wall = cx0 if sgn > 0 else cx1                                                    # the back wall of the cell
        bx0, bx1 = sorted((wall, wall + sgn * .5))
        B.box(bx0, bx1, 4.0, 7.2, 0, .45, '#9a968e')                                     # concrete bench
        B.box(bx0, bx1, 4.0, 7.2, .45, .48, '#a8a49c')
        mx0, mx1 = (1.0, 3.0) if sgn > 0 else (7.0, 9.0)
        B.box(mx0, mx1, 6.95, 7.85, 0, .12, '#6f7a5a')                                   # thin foam mattress
        B.box(mx0 + .05, mx1 - .05, 7.0, 7.8, .12, .14, '#7f8a66')
        bxc = 3.5 if sgn > 0 else 6.5
        cylinder(B, bxc, 7.6, 0, .35, .17, '#3a5a8a', 8)                                  # bucket
        disc(B, bxc, 7.6, .345, .15, '#1c2a40', 8)
        # grime: darker lower wall, graffiti and tally marks on the back and end walls
        p = wall + sgn * .005
        B.box(min(p, p + sgn * .004), max(p, p + sgn * .004), 3.4, y1, 0, 1.0, '#8f8b82')
        tally(B, 'x', wall + sgn * .006, 4.3, 1.6, 3)
        for k in range(9):
            a = 4.0 + 3.6 * hh(k, sgn)
            z = 1.2 + 1.3 * hh(k, sgn, 2)
            stroke(B, 'x', wall + sgn * .007, a, z, .3 + .5 * hh(k, 3), 3.1 * hh(k, 4), ['#2b2a28', '#3a2a22', '#1e2a3a'][k % 3], .03)
        for k in range(5):
            a = cx0 + .5 + 3.0 * hh(k, sgn, 5)
            stroke(B, 'y', y1 - .006, a, 1.4 + 1.0 * hh(k, 6), .3 + .4 * hh(k, 7), 3.1 * hh(k, 8), '#2b2a28', .03)
            stroke(B, 'y', 3.406, a, 1.3 + 1.0 * hh(k, 9), .25 + .4 * hh(k, 10), 3.1 * hh(k, 11), '#2b2a28', .03)
        wx = (cx0 + cx1) / 2
        B.box(wx - .4, wx + .4, y1 - .02, y1, 2.5, 3.0, '#e8eef0')                        # high barred window (daylight)
        for k in range(5):
            B.box(wx - .4 + k * .2 - .015, wx - .4 + k * .2 + .015, y1 - .05, y1 - .02, 2.5, 3.0, '#3c3f42')
        B.box(wx - .15, wx + .15, 5.55, 5.85, HH - .08, HH, '#3c3f42')                    # caged bulb
        B.box(wx - .06, wx + .06, 5.64, 5.76, HH - .2, HH - .08, '#fff1c4')
        cx_m = (cx0 + cx1) / 2
        b0, b1 = (.55, 3.85) if sgn > 0 else (6.15, 9.45)
        B.mark(f'cell_{name}', cx_m, 5.7, 0, x0=b0, x1=b1, y0=3.6, y1=7.8)
        fb = '+x' if sgn > 0 else '-x'
        bench_x = wall + sgn * .3
        B.mark(f'inmate_{name}1', bench_x, 4.6, .45, face=fb, pose='sit')
        B.mark(f'inmate_{name}2', (mx0 + mx1) / 2, 7.4, .12, face=fb, pose='lie')
        B.mark(f'inmate_{name}3', cx0 + 2.9 if sgn > 0 else cx0 + 1.1, 4.1, 0, face=fb, pose='stand')
    B.mark('cell_a_in', 2.9, 5.7, 0, face='+x')
    # corridor end: a fire bucket and a sign
    B.box(4.6, 5.4, y1 - .03, y1, 2.0, 2.4, '#f2f2ee')
    cylinder(B, 5.0, 7.75, 0, .35, .17, '#c42020', 8)
    # ceiling: fans and fluorescent tubes, split AC, cables
    for (fx, fy) in ((-5.5, -5.5), (-4.5, -1.0), (2.5, -1.0)):
        ceiling_fan(B, fx, fy, HH)
    for (lx, ly) in ((-5.0, -5.5), (2.5, -5.5), (-6.0, -1.5), (-1.0, -1.5), (5.0, -1.5), (5.0, 2.2)):
        fluor(B, lx, ly, HH)
    fluor(B, 5.0, 5.8, HH, 'y')
    split_ac(B, 'y', 1.0, -8.0, 2.6, -1)
    rod(B, (-9.99, -7.9, 2.9), (-9.99, .9, 2.9), .01, '#f0f0f0')
    plant(B, -9.4, .5, 1.1, '#2b3a70')
    # spots
    B.mark('spawn', 0, y0 + 1.3, 0, face='+y')
    B.mark('exit', 0, y0 + .6, 0, face='-y')
    L_ = [(-5.0, -5.5, 3.25, '#eef4ff', 22, 10), (2.5, -5.5, 3.25, '#eef4ff', 22, 10), (-3.5, -1.5, 3.25, '#eef4ff', 24, 10),
          (5.0, -1.0, 3.25, '#eef4ff', 20, 9), (2.0, 5.7, 3.1, '#ffd9a0', 10, 7), (8.0, 5.7, 3.1, '#ffd9a0', 10, 7)]
    for i, (lx, ly, lz, c, pw, rg) in enumerate(L_):
        B.mark(f'light_{i + 1}', lx, ly, lz, color=c, power=pw, range=rg)
    return B.finish('int_police')


# ================================================================ OLUWASEUN MOTORS car stand (outside)
BRAND = '#a11a24'
FLAGS = ['#d8262f', '#f2c21b', '#1f5fc9', '#1e9a4a', '#f4f4f0']


def bunting(B, p0, p1, sag, n, key=0):
    """A string of little triangular flags between two points, sagging in the middle."""
    (ax, ay, az), (bx, by, bz) = p0, p1
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append((ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t - sag * 4 * t * (1 - t)))
    for i in range(n):
        rod(B, pts[i], pts[i + 1], .006, '#e8e8e8')
        (x0_, y0_, z0_), (x1_, y1_, z1_) = pts[i], pts[i + 1]
        mx, my, mz = (x0_ + x1_) / 2, (y0_ + y1_) / 2, (z0_ + z1_) / 2
        B.face([(x0_ + (x1_ - x0_) * .15, y0_ + (y1_ - y0_) * .15, z0_ - .01), (x0_ + (x1_ - x0_) * .85, y0_ + (y1_ - y0_) * .85, z1_ - .01), (mx, my, mz - .24)],
               FLAGS[(i + key) % 5])


def feather_flag(B, x, y, c1, c2, h=3.6):
    cylinder(B, x, y, 0, h, .025, '#c9cdd0', 6, False)
    B.box(x - .25, x + .25, y - .25, y + .25, 0, .08, '#333')
    pts = [(x, y, h * .35), (x + .7, y, h * .38), (x + .78, y, h * .7), (x + .55, y, h * .95), (x, y, h)]
    B.face(pts, c1)
    B.face([(x + .02, y - .003, h * .45), (x + .62, y - .003, h * .48), (x + .62, y - .003, h * .56), (x + .02, y - .003, h * .53)], c2)


def tent_canopy(B, x0, x1, y0, y1, z, rise, c1, c2, detail, val=None):
    """A steel frame shade with a shallow gable fabric roof (ridge along x) in stripes, valance along the edges."""
    ym = (y0 + y1) / 2
    for x in (x0, (x0 + x1) / 2, x1):
        for y in (y0, y1):
            B.box(x - .05, x + .05, y - .05, y + .05, 0, z, '#9aa1a6')
            B.box(x - .15, x + .15, y - .15, y + .15, 0, .04, '#6a6f73')
    n = 12 if detail else 4
    for i in range(n):
        a, b = x0 + (x1 - x0) * i / n, x0 + (x1 - x0) * (i + 1) / n
        col = c1 if i % 2 == 0 else c2
        B.face([(a, y0 - .2, z), (b, y0 - .2, z), (b, ym, z + rise), (a, ym, z + rise)], col)
        B.face([(b, y1 + .2, z), (a, y1 + .2, z), (a, ym, z + rise), (b, ym, z + rise)], col)
    for (ya, yb) in ((y0 - .22, y0 - .2), (y1 + .2, y1 + .22)):
        B.box(x0 - .02, x1 + .02, ya, yb, z - .3, z, val or c1)
    B.box(x0, x1, y0 - .04, y0 + .04, z - .08, z, '#9aa1a6'); B.box(x0, x1, y1 - .04, y1 + .04, z - .08, z, '#9aa1a6')
    B.box(x0, x1, ym - .03, ym + .03, z + rise - .06, z + rise, '#9aa1a6')


def lot_light(B, x, y, h=6.5, aim=(0, 1)):
    cylinder(B, x, y, 0, .5, .18, '#8a8f93', 8)
    cylinder(B, x, y, .5, h, .07, '#a9aeb2', 8, False)
    B.box(x - .5, x + .5, y - .04, y + .04, h - .05, h + .03, '#a9aeb2')
    for dx in (-.4, .4):
        hx, hy = x + dx, y + aim[1] * .15
        B.box(hx - .2, hx + .2, hy - .12, hy + .12, h - .3, h, '#3a3d40')
        fy = hy + aim[1] * .125
        B.face([(hx - .17, fy, h - .27), (hx + .17, fy, h - .27), (hx + .17, fy, h - .03), (hx - .17, fy, h - .03)][::aim[1]], '#fffbe8')


def carstand(detail):
    """OLUWASEUN MOTORS: a glass-front showroom at the back, an open concrete display lot in front with bay lines,
    two striped shade canopies, bunting, feather flags, lot lights, a little office cabin and painted tyres."""
    B = Builder(detail, simple=True)
    LX, LY0, LY1, LZ = 12.0, -14.0, 2.0, .15
    # the lot: concrete slab with saw-cut joints, a kerb and a ramp at the front
    B.box(-LX, LX, LY0, LY1, 0, LZ, '#b3aea4')
    if detail:
        for i in range(1, 6):
            x = -LX + i * 4.0
            B.box(x - .01, x + .01, LY0, LY1, LZ, LZ + .003, '#8f8a81')
        for j in range(1, 4):
            y = LY0 + j * 4.0
            B.box(-LX, LX, y - .01, y + .01, LZ, LZ + .003, '#8f8a81')
        for k in range(10):                                                      # oil stains
            disc(B, -10 + 20 * hh(k, 1), -13 + 14 * hh(k, 2), LZ + .002, .25 + .35 * hh(k, 3), '#8e897f', 8)
    B.box(-LX - .1, LX + .1, LY0 - .15, LY0, 0, LZ + .03, '#d9d5cc')            # kerb
    B.face([(-6, LY0 - 1.2, 0), (6, LY0 - 1.2, 0), (6, LY0 - .15, LZ), (-6, LY0 - .15, LZ)], '#a8a39a')  # drive ramp
    # bay lines and the eight car spots (two rows of four, noses toward the street)
    xs, ys = (-8.1, -2.7, 2.7, 8.1), (-10.0, -3.5)
    k = 0
    for y in ys:
        for x in xs:
            for dx in (-1.35, 1.35):
                B.box(x + dx - .05, x + dx + .05, y - 2.5, y + 2.5, LZ, LZ + .004, '#f2f0e8')
            k += 1
            B.mark(f'lot_{k}', x, y, LZ, face='-y')
    # price board A-frame and painted tyres along the front edge
    if detail:
        x = -11.5
        i = 0
        while x < 11.6:
            if abs(x) > 6.2:
                cylinder_x(B, x - .1, x + .1, LY0 + .3, LZ + .05, .32, '#f4f4f0' if i % 2 else BRAND, 10)
                i += 1
            x += .75
    # shade canopies over the two halves of the lot
    tent_canopy(B, -11.6, -.3, -13.1, -.8, 3.4, .45, '#2d5a94', '#28507f', detail, '#f2f2ee')
    tent_canopy(B, .3, 11.6, -13.1, -.8, 3.4, .45, '#ecebe4', '#dedcd3', detail, BRAND)
    # flag poles with bunting criss-crossing above the canopies, feather flags along the front
    poles = [(-LX + .2, LY0 + .2), (LX - .2, LY0 + .2), (-LX + .2, LY1 - .3), (LX - .2, LY1 - .3), (0, LY0 + .2)]
    for (px, py) in poles:
        cylinder(B, px, py, 0, 6.0, .05, '#c9cdd0', 8)
        ball(B, px, py, 6.05, .08, '#d8b04a', 6, 2)
    if detail:
        bunting(B, (-LX + .2, LY0 + .2, 5.9), (LX - .2, LY1 - .3, 5.9), 1.0, 56, 0)
        bunting(B, (LX - .2, LY0 + .2, 5.9), (-LX + .2, LY1 - .3, 5.9), 1.0, 56, 2)
        bunting(B, (-LX + .2, LY0 + .2, 5.6), (0, LY0 + .2, 5.6), .5, 28, 1)
        bunting(B, (0, LY0 + .2, 5.6), (LX - .2, LY0 + .2, 5.6), .5, 28, 3)
        for i, x in enumerate((-10.6, -7.4, 7.4, 10.6)):
            feather_flag(B, x, LY0 - .4, [BRAND, '#1f4fa8', '#f2c21b', BRAND][i], '#f4f4f0')
    # lot lights on tall poles
    for (lx, ly) in ((-LX + .5, LY0 + .6), (LX - .5, LY0 + .6), (-LX + .4, -5.5), (LX - .4, -5.5)):
        lot_light(B, lx, ly, 6.5, (0, 1))
    # office cabin (a converted container) at the back right corner of the lot
    ox0, ox1, oy0, oy1 = 9.6, 12.0, -.7, 1.9
    B.box(ox0, ox1, oy0, oy1, LZ, LZ + .2, '#5a5a58')
    B.box(ox0, ox1, oy0, oy1, LZ + .2, LZ + 2.7, '#e9e7e0', grime=True)
    B.box(ox0 - .1, ox1 + .1, oy0 - .1, oy1 + .1, LZ + 2.7, LZ + 2.85, '#8a8d90')
    ow = Wall(B, 'L', ox0, ox1, oy0, oy1)
    ow.door(-1.2, LZ + .2, .85, 2.05, '#3a5a8a')
    of = Wall(B, 'F', ox0, ox1, oy0, oy1)
    of.window(10.8, LZ + 1.1, 1.2, 1.0, 'slide', detail)
    if detail:
        u = ox0 + .1
        while u < ox1 - .05:
            of.box(u, u + .05, LZ + .25, LZ + .9, 0, .03, '#d4d2ca')
            u += .2
        ext_ac(B, 'x', ox1, .5, LZ + 1.6, 1)
        chair(B, ox0 - .7, .2, '+x', '#f2f2ee', .44, '#f2f2ee')
    # showroom: rendered box, brand-red stripe, glass front with an entrance, canopy, parapet, sign board
    SX, SY0, SY1, SH = 10.0, LY1, 14.0, 5.5
    B.box(-SX, SX, SY0, SY1, 0, SH, '#dcdcd7', grime=True)
    B.box(-SX - .03, SX + .03, SY0 - .03, SY1 + .03, 0, .4, '#5a5c5e')
    sf = Wall(B, 'F', -SX, SX, SY0, SY1)
    sf.box(-SX, SX, LZ, SH - .9, 0, .02, '#1f272d')
    sf.box(-SX, SX, LZ + .02, SH - .92, .02, .03, '#2e4250')                         # tall glass
    for i in range(9):
        u = -SX + .05 + i * (2 * SX - .1) / 8
        sf.box(u - .05, u + .05, LZ, SH - .9, .03, .12, '#d0d3d6')
    sf.box(-SX, SX, SH - .95, SH - .85, .03, .12, '#d0d3d6')
    sf.box(-SX, SX, LZ + 2.9, LZ + 2.96, .03, .1, '#d0d3d6')
    sf.box(-1.25, 1.25, LZ, LZ + 2.6, .03, .05, '#24323c')                          # sliding doors
    sf.box(-.03, .03, LZ, LZ + 2.6, .05, .1, '#d0d3d6')
    if detail:
        for u in (-.25, .25):
            sf.box(u - .02, u + .02, LZ + .9, LZ + 1.6, .1, .14, '#e8eaec')
        for i in range(8):                                                       # glimpses of the lit interior: downlights
            u = -SX + 1.25 + i * 2.5
            sf.box(u - .3, u + .3, SH - 1.4, SH - 1.35, .031, .032, '#fff6dc')
    sf.box(-2.6, 2.6, LZ + 3.0, LZ + 3.15, 0, 1.6, '#e9eaec')                        # entrance canopy
    sf.box(-2.6, 2.6, LZ + 3.0, LZ + 3.15, 1.6, 1.65, BRAND)
    sf.box(-SX - .05, SX + .05, SH - .85, SH, 0, .15, BRAND)                          # brand band at the top
    for s_ in 'LRB':
        w_ = Wall(B, s_, -SX, SX, SY0, SY1)
        n_ = 2 * SX if s_ == 'B' else SY1 - SY0
        lo = -SX if s_ == 'B' else (SY0 if s_ == 'R' else -SY1)
        w_.box(lo, lo + n_, SH - .85, SH, 0, .05, BRAND)
        if s_ != 'B':
            for i in range(3):
                w_.window(lo + 2.5 + i * 3.5, 2.2, 2.2, 1.6, 'slide', False)
    Wall(B, 'B', -SX, SX, SY0, SY1).door(6.0, 0, 2.8, 3.0, '#8a8d90')                 # service roller door
    B.box(-SX, SX, SY0, SY1, SH, SH + .05, '#9a958c')
    for (a, b, c_, d) in [(-SX, SX, SY0, SY0 + .2), (-SX, SX, SY1 - .2, SY1), (-SX, -SX + .2, SY0, SY1), (SX - .2, SX, SY0, SY1)]:
        B.box(a, b, c_, d, SH, SH + .6, '#dcdcd7')
    B.box(-SX - .05, SX + .05, SY0 - .05, SY0 + .25, SH + .6, SH + .68, '#f4f4f0')
    # big sign board on the roof edge
    bz0 = SH + .5
    for x in (-5.0, 0, 5.0):
        B.box(x - .06, x + .06, SY0 + .25, SY0 + .37, SH, bz0 + 1.6, '#55595d')
    B.box(-6.2, 6.2, SY0 + .05, SY0 + .25, bz0, bz0 + 2.0, '#f6f6f2')
    for (a, b, c_, d) in [(-6.2, 6.2, bz0, bz0 + .1), (-6.2, 6.2, bz0 + 1.9, bz0 + 2.0), (-6.2, -6.1, bz0, bz0 + 2.0), (6.1, 6.2, bz0, bz0 + 2.0)]:
        B.box(a, b, SY0 + .02, SY0 + .05, c_, d, BRAND)
    if detail:
        for x in (-4.0, 0, 4.0):                                                  # gooseneck lamps over the board
            rod(B, (x, SY0 + .1, bz0 + 2.0), (x, SY0 - .5, bz0 + 2.3), .02, '#333')
            B.box(x - .15, x + .15, SY0 - .65, SY0 - .4, bz0 + 2.2, bz0 + 2.32, '#333')
            B.box(x - .12, x + .12, SY0 - .62, SY0 - .43, bz0 + 2.195, bz0 + 2.2, '#fff6dc')
        gp_tank(B, -7.0, 11.5, SH, .7, 1.3)
        for x in (-2, 0, 2):
            B.box(x - .4, x + .4, 11.0, 11.4, SH, SH + .6, '#e2e1dc')
    B.mark('sign_name', 0, SY0 + .02, bz0 + 1.0, text='OLUWASEUN MOTORS — TOKUNBO & BRAND NEW', w=12.0, h=1.8, face='-y')
    B.mark('door', 0, SY0 - 1.0, LZ, face='+y')
    B.mark('salesman', .0, -6.75, LZ, face='-y')
    return B.finish('ns_carstand' + ('' if detail else '_lod1'))


# ================================================================ OLUWASEUN MOTORS showroom (inside)
def int_showroom(detail=True):
    """Inside the showroom: polished tiles, glass front, four round display platforms, sales desks, a lounge."""
    B = Builder(True)
    x0, x1, y0, y1, HH = -11.0, 11.0, -7.0, 7.0, 5.0
    room_shell(B, x0, x1, y0, y1, HH, '#ecebe7', '#d3d5d6', '#f4f4f2', t=.25, skirt='#7d7f80', tile=.6,
               front_gap=(-1.3, 1.3, 3.0))
    # glass front: replace the solid front wall's inner look with glass panels and mullions
    for (a, b) in ((x0, -1.3), (1.3, x1)):
        B.box(a, b, y0 - .02, y0 + .005, .05, 3.0, '#bcd3dc')
    B.box(x0, x1, y0 - .26, y0 + .006, 0, .05, '#7d7f80')
    for i in range(9):
        u = x0 + i * (x1 - x0) / 8
        B.box(u - .05, u + .05, y0, y0 + .08, 0, 3.0, '#c9ccd0')
    B.box(x0, x1, y0, y0 + .08, 2.95, 3.05, '#c9ccd0')
    for s_ in (-1, 1):                                                         # open sliding doors parked beside the opening
        a, b = sorted((s_ * 1.3, s_ * 2.55))
        B.box(a, b, y0 + .1, y0 + .14, .02, 2.95, '#a9c6d2')
        B.box(a, b, y0 + .09, y0 + .15, 2.9, 2.95, '#c9ccd0')
    # wall above the glass: the outside sky, i.e. the front wall's upper part, keep painted
    # floor sheen: a few lighter tiles in the middle walkway
    # display platforms: low round turntables with a light ring
    plats = [(-7.6, -2.9), (-7.6, 3.4), (-1.7, -2.4), (-1.7, 3.6)]
    for i, (px, py) in enumerate(plats):
        cylinder(B, px, py, 0, .03, 2.95, '#f4f4f6', 24)
        cylinder(B, px, py, .03, .18, 2.85, '#e4e5e7', 24)
        cylinder(B, px, py, .18, .2, 2.75, '#a9abae', 24)
        disc(B, px, py, .201, 2.7, '#cfd1d4', 24)
        B.mark(f'car_{i + 1}', px, py, .2, face='-y')
    # halo lights over the platforms, hung on wires
    for (px, py) in plats:
        n = 24
        for i in range(n):
            a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            r0, r1 = 2.0, 2.15
            p = [(px + r0 * math.cos(a0), py + r0 * math.sin(a0)), (px + r0 * math.cos(a1), py + r0 * math.sin(a1)),
                 (px + r1 * math.cos(a1), py + r1 * math.sin(a1)), (px + r1 * math.cos(a0), py + r1 * math.sin(a0))]
            B.face([(x, y, 4.2) for x, y in p][::-1], '#fffbea')
            B.face([(x, y, 4.26) for x, y in p], '#c9ccd0')
            B.face([(p[0][0], p[0][1], 4.2), (p[1][0], p[1][1], 4.2), (p[1][0], p[1][1], 4.26), (p[0][0], p[0][1], 4.26)], '#c9ccd0')
            B.face([(p[3][0], p[3][1], 4.2), (p[2][0], p[2][1], 4.2), (p[2][0], p[2][1], 4.26), (p[3][0], p[3][1], 4.26)], '#c9ccd0')
        for k in range(3):
            a0 = 2 * math.pi * k / 3
            B.box(px + 2.07 * math.cos(a0) - .006, px + 2.07 * math.cos(a0) + .006, py + 2.07 * math.sin(a0) - .006, py + 2.07 * math.sin(a0) + .006, 4.26, HH, '#888')
    # wheel display on the back wall (left part): a charcoal panel with alloy rims on brackets
    B.box(-10.5, 1.5, y1 - .05, y1, 0, 4.4, '#3a3d42')
    B.box(-10.5, 1.5, y1 - .07, y1 - .05, 3.9, 4.0, BRAND)
    for k in range(6):
        wx = -9.5 + k * 1.95
        wz = 1.3 if k % 2 else 2.6
        B.box(wx - .05, wx + .05, y1 - .3, y1 - .05, wz - .05, wz, '#9a9da1')
        cylinder_y(B, wx, y1 - .32, y1 - .08, wz + .35, .35, '#1b1b1b', 16)
        disc_pts = [(wx + .24 * math.cos(2 * math.pi * i / 12), y1 - .325, wz + .35 + .24 * math.sin(2 * math.pi * i / 12)) for i in range(12)]
        B.face(disc_pts[::-1], '#c9ccd0')
        for sp in range(5):
            a0 = 2 * math.pi * sp / 5 + .3
            stroke(B, 'y', y1 - .33, wx + .12 * math.cos(a0), wz + .35 + .12 * math.sin(a0), .22, a0, '#6f7378', .05)
        B.box(wx - .04, wx + .04, y1 - .335, y1 - .33, wz + .31, wz + .39, '#a11a24')
    # left wall: timber slat feature between the posters
    for k in range(14):
        yy = -6.4 + k * .14
        B.box(x0, x0 + .05, yy, yy + .08, 0, 4.4, vary('#8b5a35', k, a=.1))
    # reception counter by the entrance
    B.box(2.8, 5.2, -5.7, -5.0, 0, 1.05, '#f7f7f5')
    B.box(2.75, 5.25, -5.75, -4.95, 1.05, 1.1, '#2b2d30')
    B.box(2.8, 5.2, -5.71, -5.7, .15, .9, BRAND)
    B.box(3.6, 3.95, -5.3, -5.1, 1.1, 1.38, '#2a2c2f'); B.box(3.62, 3.93, -5.31, -5.3, 1.14, 1.36, '#8fd0ff')
    chair(B, 4.0, -4.5, '-y', '#1d1f22')
    # brand wall at the back right with a backing for the sign
    B.box(2.5, 10.5, y1 - .06, y1, 0, 4.4, BRAND)
    for k in range(9):
        B.box(2.5 + k, 2.52 + k, y1 - .08, y1 - .06, 0, 4.4, '#7d121a')
    B.box(3.9, 9.5, y1 - .12, y1 - .06, 3.0, 4.0, '#f6f6f2')
    B.box(3.9, 9.5, y1 - .14, y1 - .12, 2.93, 3.0, '#d8b04a')
    B.mark('sign_name', 6.7, y1 - .15, 3.5, text='OLUWASEUN MOTORS', w=5.4, h=.8, face='-y')
    # sales desks with chairs, laptop, brochures
    for k, dx in enumerate((4.9, 8.4)):
        B.box(dx - 1.0, dx + 1.0, 4.0, 4.8, 0, .72, '#2b2d30')
        B.box(dx - 1.05, dx + 1.05, 3.95, 4.85, .72, .76, '#f7f7f5')
        B.box(dx - 1.0, dx + 1.0, 3.94, 3.95, .1, .66, BRAND)
        office_chair(B, dx, 5.45, '-y', '#1d1f22')
        for cx_ in (dx - .45, dx + .45):
            chair(B, cx_, 3.3, '+y', '#3a3c3f', .46, '#c9ccd0')
        if k == 0:
            B.box(dx - .25, dx + .25, 4.3, 4.6, .76, .78, '#3a3c3f')                 # laptop
            B.face([(dx - .25, 4.6, .78), (dx + .25, 4.6, .78), (dx + .25, 4.68, 1.08), (dx - .25, 4.68, 1.08)], '#3a3c3f')
            B.face([(dx - .23, 4.595, .8), (dx + .23, 4.595, .8), (dx + .23, 4.675, 1.06), (dx - .23, 4.675, 1.06)], '#8fd0ff')
        else:
            B.box(dx - .2, dx + .2, 4.4, 4.7, .76, 1.1, '#2a2c2f'); B.box(dx - .18, dx + .18, 4.39, 4.4, .8, 1.08, '#8fd0ff')
        for j in range(3):
            B.box(dx + .45, dx + .75, 4.1 + j * .02, 4.4 + j * .02, .76 + j * .01, .77 + j * .01, ['#a11a24', '#f2f2ee', '#1d1f22'][j])
        B.box(dx - .9, dx - .6, 4.2, 4.5, .76, .9, '#d8b04a')                       # car key bowl
    B.mark('desk', 4.9, 2.7, 0, face='+y')
    B.mark('salesman', 2.6, -2.2, 0, face='-y')
    # customer lounge: rug, L sofa, glass coffee table, TV, water dispenser
    top(B, 5.0, 10.4, -6.2, -1.6, .005, '#6f6a62')
    B.box(9.7, 10.95, -6.3, -1.4, 0, .45, '#3a3c40'); B.box(10.6, 10.95, -6.3, -1.4, .45, .95, '#3a3c40')
    B.box(5.6, 10.95, -6.95, -6.3, 0, .45, '#3a3c40'); B.box(5.6, 10.95, -6.95, -6.6, .45, .95, '#3a3c40')
    for k in range(4):
        B.box(9.75, 10.55, -6.2 + k * 1.2, -5.15 + k * 1.2, .45, .55, '#4a4c50')
    for k in range(3):                                                          # Ankara cushions
        B.box(10.45, 10.6, -5.6 + k * 1.4, -5.15 + k * 1.4, .55, .9, ['#e8a317', '#1f7a6a', '#c43c2a'][k])
    B.box(7.0, 8.6, -5.0, -3.6, .38, .42, '#a9c6d2')
    for (cx_, cy_) in ((7.1, -4.9), (8.5, -4.9), (7.1, -3.7), (8.5, -3.7)):
        B.box(cx_ - .02, cx_ + .02, cy_ - .02, cy_ + .02, 0, .38, '#c9ccd0')
    B.box(7.4, 7.9, -4.6, -4.2, .42, .44, BRAND)
    B.box(x1 - .08, x1, -4.8, -2.2, 1.4, 2.9, '#111214')                           # TV with a car advert
    B.box(x1 - .09, x1 - .08, -4.7, -2.3, 1.48, 2.82, '#1d6fb8')
    B.box(x1 - .095, x1 - .09, -4.3, -2.7, 1.7, 2.2, '#e8eef2')
    B.box(10.4, 10.8, -.9, -.5, 0, 1.0, '#e9e9e6'); B.box(10.45, 10.75, -.85, -.55, 1.0, 1.25, '#7fc4e8')
    B.box(10.38, 10.42, -.75, -.65, .8, .86, '#2050e0')
    for (px, py) in ((x0 + .5, y0 + .6), (x1 - .5, .4), (x0 + .5, y1 - .5), (2.0, y1 - .5), (-4.6, y0 + .6)):
        plant(B, px, py, 1.6, '#f2f2ee', .26)
    # left wall: printed car posters (light boxes), a door to the back office
    for k, yy in enumerate((-3.5, .5)):
        B.box(x0, x0 + .06, yy - 1.4, yy + 1.4, 1.4, 3.4, '#1d1f22')
        B.box(x0 + .06, x0 + .07, yy - 1.3, yy + 1.3, 1.5, 3.3, ['#3a7fc8', '#c8483a'][k])
        B.box(x0 + .07, x0 + .075, yy - 1.1, yy + 1.1, 1.9, 2.5, '#e8eaec')
        B.box(x0 + .07, x0 + .075, yy - 1.1, yy + .2, 1.6, 1.75, '#f2c21b')
    B.box(x0, x0 + .05, 4.4, 5.6, 0, 2.3, '#8a8d90')
    door_frame(B, 'x', x0, 4.4, 5.6, 2.3, 1, '#c9ccd0', .06)
    B.box(x0 + .05, x0 + .09, 5.4, 5.5, 1.0, 1.06, '#e8eaec')
    # ceiling: downlight grid, two linear lights, cassette ACs
    for i in range(6):
        for j in range(4):
            x, y = -9.0 + i * 3.6, -5.2 + j * 3.4
            disc(B, x, y, HH - .005, .12, '#fffbea', 10)
            disc(B, x, y, HH - .003, .16, '#c9ccd0', 10)
    for x in (-7.6, -1.7):
        B.box(x - .04, x + .04, -6, 6.2, HH - .08, HH, '#fffbea')
    for (cx_, cy_) in ((-4.6, .4), (5.5, .4)):
        B.box(cx_ - .45, cx_ + .45, cy_ - .45, cy_ + .45, HH - .08, HH, '#f4f4f2')
        B.box(cx_ - .3, cx_ + .3, cy_ - .3, cy_ + .3, HH - .09, HH - .08, '#c9ccd0')
    B.mark('spawn', 0, y0 + 1.2, 0, face='+y')
    B.mark('exit', 0, y0 + .55, 0, face='-y')
    L_ = [(-7.6, .2, 4.7, '#fff4e0', 35, 14), (-1.7, .2, 4.7, '#fff4e0', 35, 14), (6.6, 4.0, 4.6, '#fff4e0', 25, 10),
          (7.6, -4.0, 4.6, '#ffd9a0', 22, 10), (0, -5.5, 4.6, '#fff4e0', 18, 9)]
    for i, (lx, ly, lz, c, pw, rg) in enumerate(L_):
        B.mark(f'light_{i + 1}', lx, ly, lz, color=c, power=pw, range=rg)
    return B.finish('int_showroom')


BUILDS = (club, police, carstand)
INTERIORS = (int_club, int_police, int_showroom)


def main():
    os.makedirs(H.OUT, exist_ok=True)
    made = []
    for i, fn in enumerate(BUILDS):
        for detail in (True, False):
            ob = fn(detail)
            H.export(ob, os.path.join(H.OUT, ob.name + '.glb'))
            ob.location = (i * 40, 0 if detail else 60, 0)
            made.append(ob.name)
    for i, fn in enumerate(INTERIORS):
        ob = fn(True)
        H.export(ob, os.path.join(H.OUT, ob.name + '.glb'))
        ob.location = (i * 40, -60, 0)
        made.append(ob.name)
    print('Naija venues exported to', H.OUT, made)
    return made


if __name__ == '__main__':
    main()
