"""Naija Streets: sports grounds, a Lagos flyover and the camp kit of the people who live under it.

  ns_stadium     - a Lagos city stadium (Teslim Balogun / Onikan size): grass pitch, 6-lane track, covered main stand,
                   open terrace, end stands, floodlights, scoreboard, perimeter wall with the main gate
  ns_pitch       - a community / university football field with worn patches, kerb, low wire fence, small bleacher
  ns_flyover     - a 120 m concrete flyover segment, closed on top (under construction), piers along the two edges
  ns_tent_dome, ns_tent_shack, ns_camp_kitchen, ns_camp_bed, ns_camp_line - camp pieces for under the flyover
Each with a lighter _lod1.

run in Blender (Scripting > Open > Run) or headless: python3 tools/glb_build.py -m blender_sports
"""
import sys, os
_here = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.join(os.path.expanduser('~'), 'naija-streets', 'tools')
sys.path.insert(0, _here)
from blender_houses import *          # Builder, hexc, helpers, colour constants, bpy, bmesh, math, os
import blender_houses as H


# ================================================================ small helpers
def hf(*a):
    """Deterministic 0..1 hash of some numbers."""
    s = 0.0
    for i, t in enumerate(a):
        s += (t + 1.37) * (12.9898 + 7.233 * i)
    x = math.sin(s) * 43758.5453
    return x - math.floor(x)


def var(c, *k, amt=.07):
    return shade(c, 1 - amt + 2 * amt * hf(*k))


def _sub(a, b): return tuple(p - q for p, q in zip(a, b))
def _add(*vs): return tuple(sum(t) for t in zip(*vs))
def _mul(v, k): return tuple(t * k for t in v)
def _crs(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def _nrm(v):
    L = math.sqrt(sum(t * t for t in v)) or 1.0
    return tuple(t / L for t in v)


def flat(B, x0, x1, y0, y1, z, c):
    """A flat rectangle (paint, lines, grass, mats)."""
    B.face([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], c)


def poly(B, pts, z, c):
    B.face([(x, y, z) for x, y in pts], c)


def disc(B, cx, cy, r, z, c, n=10, ry=None):
    poly(B, [(cx + r * math.cos(2 * math.pi * i / n), cy + (ry or r) * math.sin(2 * math.pi * i / n)) for i in range(n)], z, c)


def seg(B, p, q, w, z, c):
    """A flat strip of width w from p to q (plan)."""
    dx, dy = q[0] - p[0], q[1] - p[1]
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L * w / 2, dx / L * w / 2
    B.face([(p[0] + nx, p[1] + ny, z), (q[0] + nx, q[1] + ny, z), (q[0] - nx, q[1] - ny, z), (p[0] - nx, p[1] - ny, z)], c)


def arc(B, cx, cy, r, w, a0, a1, n, z, c):
    """A thin flat ring (or part of one): centre circle, penalty arcs, corner arcs."""
    for i in range(n):
        t0, t1 = a0 + (a1 - a0) * i / n, a0 + (a1 - a0) * (i + 1) / n
        r0, r1 = r - w / 2, r + w / 2
        B.face([(cx + r0 * math.cos(t0), cy + r0 * math.sin(t0), z), (cx + r1 * math.cos(t0), cy + r1 * math.sin(t0), z),
                (cx + r1 * math.cos(t1), cy + r1 * math.sin(t1), z), (cx + r0 * math.cos(t1), cy + r0 * math.sin(t1), z)], c)


def band(B, A, C, z, c, closed=True):
    """Flat quads between two loops of plan points with the same count; c may be a function of the index."""
    n = len(A)
    for i in range(n if closed else n - 1):
        j = (i + 1) % n
        B.face([(A[i][0], A[i][1], z), (A[j][0], A[j][1], z), (C[j][0], C[j][1], z), (C[i][0], C[i][1], z)], c(i) if callable(c) else c)


def rrect(hx, hy, r, n=6):
    """Plan loop of a rounded rectangle with half sizes hx, hy and corner radius r (counter-clockwise)."""
    pts = []
    for (sx, sy, a0) in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        cx, cy = sx * (hx - r), sy * (hy - r)
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def beam(B, p, q, s, c, s2=None, caps=False):
    """A square bar between two 3D points (lattice members, rails, ropes, poles)."""
    d = _nrm(_sub(q, p))
    ref = (0, 0, 1) if abs(d[2]) < .9 else (1, 0, 0)
    u = _nrm(_crs(d, ref)); w = _nrm(_crs(d, u))
    h, h2 = s / 2, (s2 or s) / 2
    off = [_add(_mul(u, a * h), _mul(w, b * h2)) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    P = [_add(p, o) for o in off]; Q = [_add(q, o) for o in off]
    for i in range(4):
        j = (i + 1) % 4
        B.face([P[i], P[j], Q[j], Q[i]], c)
    if caps:
        B.face(P[::-1], c); B.face(Q, c)


def path(B, pts, s, c):
    for a, b in zip(pts, pts[1:]):
        beam(B, a, b, s, c)


def fbox(B, C, U, V, W, a, b, h, c, front=None, back=True):
    """A box in any orientation: centre C, unit axes U, V, W, half sizes a, b, h. `front` colours the +W face."""
    def P(i, j, k):
        return tuple(C[t] + i * a * U[t] + j * b * V[t] + k * h * W[t] for t in range(3))
    B.face([P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)], front or c)
    if back:
        B.face([P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1), P(-1, -1, -1)], c)
    B.face([P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)], c)
    B.face([P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), P(-1, -1, -1)], c)
    B.face([P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1)], c)
    B.face([P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)], c)


def panel(B, C, U, V, a, b, c):
    """A flat rectangle in any orientation (cloth, posters, signs)."""
    B.face([_add(C, _mul(U, -a), _mul(V, -b)), _add(C, _mul(U, a), _mul(V, -b)), _add(C, _mul(U, a), _mul(V, b)), _add(C, _mul(U, -a), _mul(V, b))], c)


def prism(B, pts, z0, z1, c, top=True, grime=False, shades=None):
    """Extrude a convex plan polygon from z0 to z1."""
    n = len(pts)
    g = (lambda z: .82 + .18 * min(1, (z - z0) / 1.8)) if grime else (lambda z: 1.0)
    for i in range(n):
        (ax, ay), (bx, by) = pts[i], pts[(i + 1) % n]
        cc = shades(i) if shades else c
        B.face([(ax, ay, z0), (bx, by, z0), (bx, by, z1), (ax, ay, z1)], cc, [g(z0), g(z0), g(z1), g(z1)])
    if top:
        B.face([(x, y, z1) for x, y in pts], c)


def frustum(B, r0, z0, r1, z1, c, top=True, shades=None):
    """Join two plan polygons (same count) at two heights: tapering blocks, buckets, hammerheads."""
    n = len(r0)
    for i in range(n):
        j = (i + 1) % n
        B.face([(r0[i][0], r0[i][1], z0), (r0[j][0], r0[j][1], z0), (r1[j][0], r1[j][1], z1), (r1[i][0], r1[i][1], z1)], shades(i) if shades else c)
    if top:
        B.face([(x, y, z1) for x, y in r1], c)


def circ(cx, cy, r, n=10, ry=None, a0=0.0):
    return [(cx + r * math.cos(a0 + 2 * math.pi * i / n), cy + (ry or r) * math.sin(a0 + 2 * math.pi * i / n)) for i in range(n)]


def octo(cx, cy, hx, hy, ch):
    """Plan of a rectangle with chamfered corners."""
    return [(cx + hx, cy - hy + ch), (cx + hx, cy + hy - ch), (cx + hx - ch, cy + hy), (cx - hx + ch, cy + hy),
            (cx - hx, cy + hy - ch), (cx - hx, cy - hy + ch), (cx - hx + ch, cy - hy), (cx + hx - ch, cy - hy)]


# ================================================================ football bits shared by the stadium and the field
LINE = '#f0f0e8'
GRASS_A, GRASS_B = '#5c973c', '#4f8834'
STEEL = '#8e9497'


def pitch_lines(B, hx, hy, z, w=.12, c=LINE, k=1.0, n=40):
    """Markings of a pitch with half sizes hx, hy; k scales the boxes/circle for smaller fields."""
    flat(B, -hx - w / 2, hx + w / 2, -hy - w / 2, -hy + w / 2, z, c)
    flat(B, -hx - w / 2, hx + w / 2, hy - w / 2, hy + w / 2, z, c)
    flat(B, -hx - w / 2, -hx + w / 2, -hy + w / 2, hy - w / 2, z, c)
    flat(B, hx - w / 2, hx + w / 2, -hy + w / 2, hy - w / 2, z, c)
    flat(B, -w / 2, w / 2, -hy + w / 2, hy - w / 2, z, c)
    R = 9.15 * k
    arc(B, 0, 0, R, w, 0, 2 * math.pi, n, z, c)
    disc(B, 0, 0, .16, z + .002, c, 8)
    pa, pw, ga, gw, ps = 16.5 * k, 20.16 * k, 5.5 * k, 9.16 * k, 11 * k
    for s in (-1, 1):
        for (d, hw) in ((pa, pw), (ga, gw)):
            xi = s * (hx - d)
            for t in (-1, 1):
                flat(B, min(s * hx, xi), max(s * hx, xi), t * hw - w / 2, t * hw + w / 2, z, c)
            flat(B, xi - w / 2, xi + w / 2, -hw - w / 2, hw + w / 2, z, c)
        disc(B, s * (hx - ps), 0, .16, z + .002, c, 8)
        ha = math.acos((pa - ps) / R)
        mid = math.pi if s > 0 else 0.0
        arc(B, s * (hx - ps), 0, R, w, mid - ha, mid + ha, 12, z, c)
        for t in (-1, 1):
            m = math.atan2(-t, -s)
            arc(B, s * hx, t * hy, 1.0, w, m - math.pi / 4, m + math.pi / 4, 4, z, c)


def goal(B, x, s, detail, depth=1.9, c='#f7f7f4'):
    """Goal on the line at x, net going back in direction s (+1 or -1)."""
    hw, hh = 3.66, 2.44
    for t in (-1, 1):
        B.box(x - .06, x + .06, t * (hw + .12) - .06, t * (hw + .12) + .06, 0, hh + .12, c)
    B.box(x - .06, x + .06, -hw - .18, hw + .18, hh, hh + .12, c)
    fr = '#c9cbc8'
    xt, xb = x + s * 1.0, x + s * depth
    for t in (-1, 1):
        y = t * (hw + .12)
        beam(B, (x, y, hh + .06), (xt, y, hh + .06), .05, fr)
        beam(B, (xt, y, hh + .06), (xb, y, .03), .05, fr)
        beam(B, (x, y, .03), (xb, y, .03), .05, fr)
    beam(B, (xt, -hw - .12, hh + .06), (xt, hw + .12, hh + .06), .05, fr)
    beam(B, (xb, -hw - .12, .03), (xb, hw + .12, .03), .05, fr)
    if not detail:
        return
    net = '#e9ebe8'
    y = -hw
    while y <= hw + .01:
        beam(B, (x, y, hh + .06), (xt, y, hh + .06), .018, net)
        beam(B, (xt, y, hh + .06), (xb, y, .03), .018, net)
        y += .61
    for f in (.25, .5, .75):
        p = (xt + (xb - xt) * f, 0, hh * (1 - f) + .06)
        beam(B, (p[0], -hw - .12, p[2]), (p[0], hw + .12, p[2]), .018, net)
    for t in (-1, 1):
        for f in (.3, .6):
            beam(B, (x + s * 1.0 * f + s * .02, t * (hw + .12), hh + .06), (x + s * (depth * f + .02), t * (hw + .12), .03), .018, net)
        beam(B, (x, t * (hw + .12), 1.2), (x + s * (1.0 + (depth - 1.0) * (1 - 1.2 / hh)), t * (hw + .12), 1.2), .018, net)


# ================================================================ the stadium
TRACK = '#a5452f'; CONC = '#b3ac9f'; CREAM = '#e8dfc8'; NGREEN = '#2e7a46'; WHITE_SEAT = '#eceee8'


def tiers(B, along, u0, u1, vf, dirn, zb, depth, rise, n, conc, skip=None, caps=(True, True)):
    """Stepped concrete rows: each row runs along the `along` axis from u0 to u1; the first riser is at v=vf and
    rows climb in direction dirn. Returns [(v_front, v_back, tread_z)]."""
    P = (lambda u, v, z: (u, v, z)) if along == 'x' else (lambda u, v, z: (v, u, z))
    rows = []
    for k in range(n):
        va, vb = vf + dirn * depth * k, vf + dirn * depth * (k + 1)
        zp, zt = zb + rise * k, zb + rise * (k + 1)
        c = var(conc, k, u0, amt=.04)
        for (a, b) in (skip(k) if skip else [(u0, u1)]):
            B.face([P(a, va, zp), P(b, va, zp), P(b, va, zt), P(a, va, zt)], shade(c, .88))
            B.face([P(a, va, zt), P(b, va, zt), P(b, vb, zt), P(a, vb, zt)], c)
        for uu, on in ((u0, caps[0]), (u1, caps[1])):
            if on:
                B.face([P(uu, va, 0), P(uu, vb, 0), P(uu, vb, zt), P(uu, va, zt)], shade(conc, .84))
        rows.append((va, vb, zt))
    return rows


def mbox(B, along, u0, u1, v0, v1, z0, z1, c):
    if along == 'x':
        B.box(u0, u1, v0, v1, z0, z1, c)
    else:
        B.box(v0, v1, u0, u1, z0, z1, c)


def seats(B, along, a, b, row, dirn, c, backs=True, pan=(.1, .46)):
    va, vb, zt = row
    if not B.detail:
        mbox(B, along, a, b, va + dirn * pan[0], va + dirn * (pan[1] + .05), zt, zt + (.7 if backs else .45), c)
        return
    mbox(B, along, a, b, va + dirn * pan[0], va + dirn * pan[1], zt + .24, zt + .42, c)
    if backs:
        mbox(B, along, a, b, va + dirn * (pan[1] - .02), va + dirn * (pan[1] + .05), zt + .42, zt + .82, shade(c, .93))
    elif B.detail:
        mbox(B, along, a, b, va + dirn * (pan[1] - .02), va + dirn * (pan[1] + .04), zt + .38, zt + .58, shade(c, .92))


def aisle(B, along, u, rows, dirn, depth, rise, w=1.1, c='#cfc8ba'):
    """Half steps up an aisle between seat blocks, plus a handrail."""
    if not B.detail:
        return
    for (va, vb, zt) in rows:
        mbox(B, along, u - w / 2, u + w / 2, va - dirn * depth / 2, va, zt - rise, zt - rise / 2, c)
    if B.detail:
        P = (lambda u_, v, z: (u_, v, z)) if along == 'x' else (lambda u_, v, z: (v, u_, z))
        a, b = rows[0], rows[-1]
        beam(B, P(u, a[0] - dirn * depth / 2, a[2] - rise / 2 + .95), P(u, b[1] - dirn * .2, b[2] + .95), .05, '#d8dcdc')
        for (va, vb, zt) in rows[::2]:
            beam(B, P(u, va, zt - rise / 2), P(u, va, zt - rise / 2 + .95 + rise / 2), .05, '#d8dcdc')


def blocks(u0, u1, aisles, w=1.1):
    """Split u0..u1 into seat blocks between aisles."""
    out, a = [], u0 + .25
    for u in sorted(aisles):
        if u0 < u < u1:
            out.append((a, u - w / 2 - .05)); a = u + w / 2 + .05
    out.append((a, u1 - .25))
    return out


def flood_tower(B, cx, cy, Ht, detail, name):
    """Lattice floodlight mast with a tilted lamp bank aimed at the centre spot."""
    B.box(cx - 1.6, cx + 1.6, cy - 1.6, cy + 1.6, 0, .6, '#a39d92', grime=True)
    b0, b1 = 1.15, .5
    sg = ((-1, -1), (1, -1), (1, 1), (-1, 1))
    def leg(z, i):
        r = b0 + (b1 - b0) * z / Ht
        return (cx + sg[i][0] * r, cy + sg[i][1] * r, z)
    st = '#9aa0a2'
    for i in range(4):
        beam(B, leg(.6, i), leg(Ht, i), .24, st)
    nz = 8 if detail else 3
    for j in range(1, nz + 1):
        z, zp = .6 + (Ht - .6) * j / nz, .6 + (Ht - .6) * (j - 1) / nz
        for i in range(4):
            beam(B, leg(z, i), leg(z, (i + 1) % 4), .1, st)
            if detail:
                a, b = (i, (i + 1) % 4) if j % 2 else ((i + 1) % 4, i)
                beam(B, leg(zp, a), leg(z, b), .07, st)
    if detail:                                                                       # ladder up one leg
        beam(B, (cx + .1, cy, .6), (cx + .1, cy, Ht), .05, '#6d7375')
        beam(B, (cx - .25, cy, .6), (cx - .25, cy, Ht), .05, '#6d7375')
    B.box(cx - 1.5, cx + 1.5, cy - 1.5, cy + 1.5, Ht, Ht + .15, '#55595b')
    L = math.hypot(cx, cy)
    D = (-cx / L, -cy / L, 0)
    t = math.radians(28)
    U = (-D[1], D[0], 0)
    W = (D[0] * math.cos(t), D[1] * math.cos(t), -math.sin(t))
    V = (D[0] * math.sin(t), D[1] * math.sin(t), math.cos(t))
    C = (cx + D[0] * 1.3, cy + D[1] * 1.3, Ht + 3.0)
    fbox(B, C, U, V, W, 4.4, 2.7, .12, '#3b3f42')
    for t_ in (-1, 1):
        beam(B, (cx + U[0] * 1.3 * t_, cy + U[1] * 1.3 * t_, Ht + .15), _add(C, _mul(U, 1.3 * t_), _mul(V, -1.8)), .16, '#55595b')
    if detail:
        for i in range(6):
            for j in range(4):
                Ci = _add(C, _mul(U, -3.6 + 1.44 * i), _mul(V, -1.95 + 1.3 * j), _mul(W, .3))
                fbox(B, Ci, U, V, W, .58, .5, .18, '#2a2c2e', front='#fffef4', back=False)
    else:
        fbox(B, _add(C, _mul(W, .2)), U, V, W, 4.1, 2.45, .08, '#2a2c2e', front='#fffef4', back=False)
    P = _add(C, _mul(W, 1.0))
    B.mark(name, round(P[0], 2), round(P[1], 2), round(P[2], 2), color='#f4f6ff', power=60, range=120)


def stadium(detail):
    """A Lagos city stadium. Pitch 90 x 58 in the middle, 6-lane track round it, covered main stand on +y,
    open terrace and main gate on -y (the street side), low end stands, floodlights in the corners."""
    B = Builder(detail, simple=True)
    PX, PY = 45.0, 29.0
    TX, TY, TR, TW = 47.5, 31.5, 6.0, 7.2
    # ---- ground: concrete apron, infield grass, track, pitch
    flat(B, -59.7, 59.7, -44.5, 45.8, .005, '#9c968a')
    inner = rrect(TX, TY, TR)
    poly(B, inner, .012, '#4a7b30')
    nst = 18
    for i in range(nst):
        x0 = -PX + 2 * PX * i / nst
        flat(B, x0, x0 + 2 * PX / nst, -PY, PY, .02, GRASS_A if i % 2 else GRASS_B)
    if detail:                                                                       # worn goalmouths
        for s in (-1, 1):
            poly(B, [(s * (PX - .3) + s * a * 2.8 * math.cos(2 * math.pi * k / 9) - s * 1.6, b * 3.4 * math.sin(2 * math.pi * k / 9))
                     for k in range(9) for a, b in [(.8 + .3 * hf(k, s), 1)]], .026, '#78843f')
            poly(B, circ(s * (PX - 11), 0, 1.0, 8), .026, '#76823e')
    pitch_lines(B, PX, PY, .034, .12)
    loops = [rrect(TX + d, TY + d, TR + d) for d in (0, TW)]
    band(B, loops[0], loops[1], .02, lambda i: var(TRACK, i, amt=.035))
    for k in range(7):
        d = TW * k / 6
        a, b = rrect(TX + d - .025, TY + d - .025, TR + d - .025), rrect(TX + d + .025, TY + d + .025, TR + d + .025)
        band(B, a, b, .03, LINE)
    flat(B, 20.0, 20.06, TY, TY + TW, .031, LINE)                                    # finish line
    flat(B, 20.3, 20.36, TY, TY + TW, .031, '#2a2a2a')
    if detail:
        for k in range(6):                                                           # staggered starts on the bend
            a = math.radians(90 * (k + .5) / 6.5)
            r = TR + TW * (k + .5) / 6
            cx, cy = -(TX - TR), -(TY - TR)
            p = (cx - r * math.sin(a), cy - r * math.cos(a))
            seg(B, (p[0] - .55 * math.sin(a), p[1] - .55 * math.cos(a)), (p[0] + .55 * math.sin(a), p[1] + .55 * math.cos(a)), .06, .031, LINE)
    for s in (-1, 1):
        goal(B, s * PX, s, detail)
    # ---- perimeter advertising boards
    cols = ['#f2c21b', '#c8302a', '#1e6aa8', '#2f8b46', '#f0f0ea', '#e36d1c', '#5c2d82', '#11a0a8']
    k = 0
    def board(x0, x1, y0, y1, k, face_c):
        if not B.detail:
            B.face([(x0, (y0 + y1) / 2, 0), (x1, (y0 + y1) / 2, 0), (x1, (y0 + y1) / 2, .9), (x0, (y0 + y1) / 2, .9)] if y1 - y0 < x1 - x0 else [((x0 + x1) / 2, y0, 0), ((x0 + x1) / 2, y1, 0), ((x0 + x1) / 2, y1, .9), ((x0 + x1) / 2, y0, .9)], face_c)
            return
        B.box(x0, x1, y0, y1, 0, .9, '#55585b')
        if B.detail:
            if y1 - y0 < x1 - x0:
                yf = y0 - .005 if y0 < 0 else y1 + .005
                ys = (yf, y0) if y0 < 0 else (y1, yf)
                yf2 = -1 if y0 > 0 else 1
                yy = (y0 - .01, y0) if y0 > 0 else (y1, y1 + .01)
                B.box(x0 + .05, x1 - .05, yy[0], yy[1], .08, .85, face_c)
                B.box(x0 + .4 + .3 * hf(k), x1 - .4 - .5 * hf(k, 1), yy[0] - .004, yy[1] + .004, .3, .62, cols[(k * 3 + 2) % len(cols)])
            else:
                xx = (x0 - .01, x0) if x0 > 0 else (x1, x1 + .01)
                B.box(xx[0], xx[1], y0 + .05, y1 - .05, .08, .85, face_c)
                B.box(xx[0] - .004, xx[1] + .004, y0 + .4 + .3 * hf(k), y1 - .4 - .5 * hf(k, 1), .3, .62, cols[(k * 3 + 2) % len(cols)])
    x = -44.0
    while x < 43.9:
        for t in (-1, 1):
            if t > 0 and -10 < x + 2 and x < 10:
                continue
            k += 1
            board(x + .02, x + 3.98, t * 30.4 - .05, t * 30.4 + .05, k, cols[k % len(cols)])
        x += 4.0
    y = -20.0
    while y < 19.9:
        for t in (-1, 1):
            k += 1
            board(t * 47.1 - .05, t * 47.1 + .05, y + .02, y + 3.98, k, cols[k % len(cols)])
        y += 4.0
    # ---- dugouts in front of the main stand
    for s in (-1, 1):
        x0, x1 = s * 3.5, s * 9.0
        x0, x1 = min(x0, x1), max(x0, x1)
        B.box(x0, x1, 29.7, 31.35, 0, .1, '#9a958c')
        B.box(x0, x1, 31.2, 31.35, .1, 2.1, '#eeeeea')
        for xx in (x0, x1 - .1):
            B.box(xx, xx + .1, 29.9, 31.2, .1, 1.9, '#eeeeea')
        B.box(x0 + .2, x1 - .2, 30.6, 31.15, .1, .55, '#1f4e8a')
        if detail:
            B.box(x0 + .2, x1 - .2, 31.05, 31.15, .55, 1.05, '#1f4e8a')
            for i in range(int((x1 - x0) / .6)):
                xx = x0 + .35 + i * .6
                B.box(xx, xx + .04, 30.6, 31.16, .55, 1.06, '#163a68')
        prof = [(31.35, 2.15), (30.8, 2.1), (30.2, 1.9), (29.75, 1.55)]
        for a, b in zip(prof, prof[1:]):
            B.face([(x0, a[0], a[1]), (x1, a[0], a[1]), (x1, b[0], b[1]), (x0, b[0], b[1])], '#a6bccb')
    # ---- main stand (+y): podium, 8 rows, VIP box, press seats, cantilever roof
    MX = 42.0
    zb, dep, ris, nr = 2.2, .725, .46, 8
    B.box(-MX, MX, 39.0, 39.25, 0, zb + 1.0, CREAM, grime=True)                       # front wall with parapet
    B.box(-MX, MX, 38.98, 39.0, 0, 1.1, NGREEN)
    B.box(-MX - .05, MX + .05, 38.95, 39.3, zb + 1.0, zb + 1.08, '#f6f4ee')
    B.box(-2.0, 2.0, 38.96, 38.99, 0, 2.3, '#1b1f22')                                # players' tunnel
    B.box(-2.3, 2.3, 38.6, 39.0, 2.3, 2.5, NGREEN)
    if detail:
        for xd in (-14, -8, 8, 14, -30, 30):
            B.box(xd - .5, xd + .5, 38.96, 38.99, 0, 2.1, '#3d4a55')
    flat(B, -MX, MX, 39.25, 40.0, zb, var(CONC, 3))
    def skip_main(k):
        return [(-MX, -7.0), (7.0, MX)] if k >= 5 else [(-MX, MX)]
    rows = tiers(B, 'x', -MX, MX, 40.0, 1, zb, dep, ris, nr, CONC, skip_main)
    for xx in (-MX, MX):
        B.face([(xx, 39.0, 0), (xx, 40.0, 0), (xx, 40.0, zb), (xx, 39.0, zb)], shade(CONC, .84))
    ais = [-31.5, -21.0, -10.5, 10.5, 21.0, 31.5]
    for k, row in enumerate(rows):
        al = ais + ([0.0] if k < 5 else [])
        for bi, (a, b) in enumerate(blocks(-MX, MX, al)):
            if k >= 5 and -7.5 < (a + b) / 2 < 7.5:
                continue
            if k >= 5 and a < -7:
                b = min(b, -7.3)
            if k >= 5 and b > 7:
                a = max(a, 7.3)
            if k >= 6 and 7.0 < a < 19.0:                                             # press seats: desks instead
                continue
            centre = -10.5 < (a + b) / 2 < 10.5
            c = WHITE_SEAT if (centre or k == 3) else NGREEN
            if centre and k == 3:
                c = NGREEN
            seats(B, 'x', a, b, row, 1, var(c, k, bi, amt=.03))
    for u in ais:
        aisle(B, 'x', u, rows, 1, dep, ris)
    aisle(B, 'x', 0.0, rows[:5], 1, dep, ris)
    # press desks on rows 6-7 from x 7.6 to 20.4
    for k in (6, 7):
        va, vb, zt = rows[k]
        B.box(7.6, 20.4, va + .05, va + .4, zt, zt + .75, '#6b5640')
        B.box(7.6, 20.4, va + .45, va + .62, zt + .2, zt + .48, '#303438')
        if detail:
            for i in range(8):
                xx = 8.2 + i * 1.55
                B.box(xx, xx + .5, va + .25, va + .3, zt + .75, zt + 1.08, '#1d2125')
    # VIP box: x -7..7 over rows 5..7
    vz0, vz1, vy0 = rows[4][2], rows[4][2] + 3.1, rows[5][0]
    B.box(-7.0, 7.0, vy0, 45.8, vz0 - .2, vz0, '#cfc9bd')
    for xx in (-7.15, 7.0):
        B.box(xx, xx + .15, vy0 - .3, 45.8, vz0 - .2, vz1, CREAM)
    B.box(-7.15, 7.15, vy0 - .4, 45.8, vz1, vz1 + .35, NGREEN)
    B.box(-6.85, 6.85, vy0 + .02, vy0 + .06, vz0 + .55, vz1 - .05, '#2a3d48')         # glass
    B.box(-6.85, 6.85, vy0 - .05, vy0 + .1, vz0, vz0 + .55, CREAM)
    for i in range(8):
        xx = -6.85 + 13.7 * i / 7
        B.box(xx - .04, xx + .04, vy0 - .02, vy0 + .08, vz0 + .55, vz1, '#d9d9d6')
    if detail:
        B.box(-6.9, 6.9, vy0 - .06, vy0 + .1, vz0 + .55, vz0 + .6, '#d9d9d6')
        for i in range(10):                                                          # VIP armchairs in front of the glass
            xx = -6.3 + i * 1.4
            va, vb, zt = rows[4]
            B.box(xx - .32, xx + .32, va + .12, va + .55, zt + .0, zt + .44, '#8e1f2a')
            B.box(xx - .32, xx + .32, va + .5, va + .62, zt + .44, zt + .95, '#8e1f2a')
    # back wall (offices underneath, windows outside)
    BZ = 11.4 - .45
    B.box(-MX, MX, 45.8, 46.0, 0, BZ, CREAM, grime=True)
    B.box(-MX, MX, 46.0, 46.02, 0, 1.0, NGREEN)
    B.box(-MX, MX, 45.78, 45.8, BZ - 1.0, BZ, NGREEN)
    for (a, b) in ((-MX + .5, -7.4), (7.4, MX - .5)):
        B.box(a, b, 45.78, 45.8, rows[-1][2] + 1.5, rows[-1][2] + 2.6, '#7d929b')
        if detail:
            x = a + 1.5
            while x < b - .1:
                B.box(x - .05, x + .05, 45.76, 45.79, rows[-1][2] + 1.5, rows[-1][2] + 2.6, '#e8e4da')
                x += 1.5
    for xx in (-MX, MX):
        B.face([(xx, rows[-1][1], rows[-1][2]), (xx, 45.8, rows[-1][2]), (xx, 45.8, BZ), (xx, rows[-1][1], BZ)], shade(CONC, .84))
    if detail:
        x = -MX + 3
        i = 0
        while x < MX - 2:
            if abs(x) > 2:
                B.box(x - .7, x + .7, 46.0, 46.06, 1.3, 2.4, '#33434b')
                B.box(x - .8, x + .8, 46.0, 46.09, 1.2, 1.3, '#f4f2ec')
                B.box(x - .7, x + .7, 46.0, 46.03, 3.6, 4.6, '#33434b')
                B.box(x - 2.2, x + 2.2, 46.0, 46.03, 7.0, 8.2, '#7d929b')
            i += 1
            x += 6.0
        B.box(-1.6, 1.6, 46.0, 46.08, 0, 2.6, '#41321f')                          # back entrance
        B.box(-2.2, 2.2, 46.0, 46.3, 2.6, 2.8, NGREEN)
    # roof: columns behind the back wall, raking trusses, purlins, sheet
    yb, zbk, yf, zfr = 46.25, 11.4, 36.6, 10.2
    rz = lambda y: zfr + (zbk - zfr) * (y - yf) / (yb - yf)
    colx = [-MX + 84 * i / 7 for i in range(8)]
    for x in colx:
        B.box(x - .3, x + .3, 45.95, 46.3, 0, zbk - .1, '#d7d3cb')
        top = [(x, yb, zbk - .15), (x, yf + .1, zfr - .12)]
        bot = [(x, 46.3, zbk - 2.4), (x, yf + .1, zfr - .55)]
        beam(B, top[0], top[1], .25, '#e3e3df')
        beam(B, bot[0], bot[1], .22, '#e3e3df')
        if detail:
            for j in range(5):
                f0, f1 = j / 5, (j + 1) / 5
                p0 = _add(_mul(top[0], 1 - f0), _mul(top[1], f0)); q0 = _add(_mul(bot[0], 1 - f0), _mul(bot[1], f0))
                p1 = _add(_mul(top[0], 1 - f1), _mul(top[1], f1))
                beam(B, q0, p0, .1, '#e3e3df'); beam(B, q0, p1, .1, '#e3e3df')
    for j in range(6 if detail else 2):
        y = yf + .4 + (yb - yf - .8) * j / (5 if detail else 1)
        beam(B, (-MX - .9, y, rz(y) - .2), (MX + .9, y, rz(y) - .2), .16, '#c9cbc8')
    sheet = [(-MX - 1, yf, zfr), (MX + 1, yf, zfr), (MX + 1, yb, zbk), (-MX - 1, yb, zbk)]
    B.face(sheet, '#c7cac8')
    B.face([(p[0], p[1], p[2] - .08) for p in sheet][::-1], '#a9aeae')
    if detail:
        x = -MX - .5
        while x < MX + .9:
            B.face([(x, yf, zfr + .03), (x + .12, yf, zfr + .03), (x + .12, yb, zbk + .03), (x, yb, zbk + .03)], '#b3b7b5')
            x += 1.0
    B.box(-MX - 1.05, MX + 1.05, yf - .15, yf + .05, zfr - .55, zfr + .12, NGREEN)       # fascia
    B.box(-MX - 1.05, MX + 1.05, yb - .1, yb + .08, zbk - .35, zbk + .1, '#d7d3cb')
    for xx in (-MX - 1.0, MX + 1.0):
        B.face([(xx, yf, zfr - .55), (xx, yb, zbk - .35), (xx, yb, zbk), (xx, yf, zfr)], '#d7d3cb')
    # ---- terrace (-y), split by the main gate passage
    tzb, tdep, tris_, tn = .4, .72, .42, 6
    tcols = ['#b33a2e', '#d6a21f', '#2d5fa6', CONC, '#2e7a46', '#d6a21f', '#b33a2e', '#2d5fa6']
    for side in (-1, 1):
        u0, u1 = (-54.0, -3.5) if side < 0 else (3.5, 54.0)
        B.box(u0, u1, -39.35, -39.1, 0, 1.2, CREAM, grime=True)
        B.box(u0, u1, -39.12, -39.1, 0, .6, '#c9a227')
        B.box(u0 - .03, u1 + .03, -39.4, -39.05, 1.2, 1.27, '#f6f4ee')
        flat(B, u0, u1, -40.2, -39.35, tzb, var(CONC, 7))
        for xx in (u0, u1):
            B.face([(xx, -39.35, 0), (xx, -40.2, 0), (xx, -40.2, tzb), (xx, -39.35, tzb)], shade(CONC, .84))
        trows = tiers(B, 'x', u0, u1, -40.2, -1, tzb, tdep, tris_, tn, '#aaa396')
        tais = [u0 + 50.5 * i / 5 for i in range(1, 5)]
        for bi, (a, b) in enumerate(blocks(u0, u1, tais, 1.0)):
            c = tcols[(bi + (0 if side < 0 else 4)) % len(tcols)]
            for k, row in enumerate(trows):
                if c == CONC:
                    if detail:
                        mbox(B, 'x', a, b, row[0] - .1, row[0] - .4, row[2], row[2] + .38, '#8f887c')
                    continue
                seats(B, 'x', a, b, row, -1, var(c, k, bi, amt=.04), backs=False, pan=(.12, .44))
        for u in tais:
            aisle(B, 'x', u, trows, -1, tdep, tris_, 1.0)
        # rear rail
        if detail:
            beam(B, (u0, -44.4, trows[-1][2] + 1.0), (u1, -44.4, trows[-1][2] + 1.0), .06, '#d8dcdc')
    zt_last = tzb + tris_ * tn
    # ---- facade on the street (-y) with the main gate, side gates, ticket booth, flags
    FW = zt_last + 1.1
    fy0, fy1 = -44.82, -44.52
    for (a, b) in ((-59.95, -4.4), (4.4, 59.95)):
        B.box(a, b, fy0, fy1, 0, FW, CREAM, grime=True)
        B.box(a - .05, b + .05, fy0 - .06, fy1 + .04, FW, FW + .15, '#f6f4ee')
        B.box(a, b, fy0 - .02, fy0, 0, 1.0, NGREEN)
        x = a + 3.0
        while x < b - 1:
            B.box(x - .3, x + .3, fy0 - .18, fy0, 0, FW + .5, '#ded4bc')
            B.box(x - .36, x + .36, fy0 - .24, fy0 + .02, FW + .5, FW + .62, '#f6f4ee')
            x += 6.0
    for gx in (-26.0, 26.0, -46.0, 46.0):                                           # side gates (closed, blue steel)
        B.box(gx - 1.6, gx + 1.6, fy0 - .04, fy0 + .02, 0, 3.0, '#2c5f8a')
        B.box(gx - 1.8, gx + 1.8, fy0 - .12, fy0 + .02, 3.0, 3.3, NGREEN)
        if detail:
            for z in (.6, 1.4, 2.2):
                B.box(gx - 1.6, gx + 1.6, fy0 - .08, fy0 - .04, z, z + .08, '#24506f')
            B.box(gx - .02, gx + .02, fy0 - .08, fy0 - .04, 0, 3.0, '#1b3a52')
    for s in (-1, 1):                                                               # main gate pillars and lintel
        B.box(s * 3.5, s * 4.4, fy0 - .3, fy1 + .2, 0, 6.6, '#ded4bc', grime=True)
        B.box(s * 3.4, s * 4.5, fy0 - .4, fy1 + .3, 6.6, 6.85, '#f6f4ee')
        B.box(s * 3.5, s * 4.4, fy0 - .32, fy0 - .3, 0, 1.0, NGREEN)
    B.box(-3.5, 3.5, fy0 - .3, fy1 + .2, 4.6, 6.6, NGREEN)
    B.box(-3.7, 3.7, fy0 - .34, fy0 - .3, 4.85, 6.35, '#efe8d6')                     # sign_name board
    B.box(-3.5, 3.5, fy0 - .3, fy1 + .2, 4.45, 4.6, '#f6f4ee')
    flat(B, -3.5, 3.5, -44.9, -39.1, .01, '#a39d91')
    for s in (-1, 1):                                                               # gate leaves swung open
        xg = s * 3.25
        B.box(xg - .05, xg + .05, -44.4, -40.9, .05, .15, '#2e3b33')
        B.box(xg - .05, xg + .05, -44.4, -40.9, 2.85, 2.95, '#2e3b33')
        B.box(xg - .05, xg + .05, -44.4, -40.9, 1.45, 1.53, '#2e3b33')
        y = -44.4
        n_ = 12 if detail else 3
        for i in range(n_ + 1):
            yy = -44.4 + 3.5 * i / n_
            B.box(xg - .03, xg + .03, yy - .025, yy + .025, .05, 2.95, '#2e3b33')
    B.mark('gate', 0.0, -47.5, 0.0, face='+y')
    B.mark('sign_name', 0.0, fy0 - .36, 5.6, text='MUSHIN TOWNSHIP STADIUM', w=7.2, h=1.3, face='-y')
    # ticket booth
    bx0, bx1, by0, by1 = -11.0, -7.6, -45.35, -44.85
    B.box(bx0, bx1, by0, by1, 0, 2.6, '#d9d2c2', grime=True)
    B.box(bx0 - .2, bx1 + .2, by0 - .25, by1, 2.6, 2.8, '#2c5f8a')
    B.box(bx0 + .4, bx1 - .4, by0 - .03, by0, 1.0, 2.0, '#2a3a44')
    B.box(bx0 + .3, bx1 - .3, by0 - .35, by0, .95, 1.02, '#e8e4da')
    if detail:
        for i in range(7):
            xx = bx0 + .4 + (bx1 - bx0 - .8) * i / 6
            B.box(xx - .02, xx + .02, by0 - .05, by0 - .02, 1.0, 2.0, '#cfd2d2')
        B.box(bx0 + .5, bx1 - .5, by0 - .03, by0, 2.12, 2.48, '#f2c21b')
    for s in (-1, 1):                                                               # flag poles
        fx = s * 6.2
        cylinder(B, fx, -45.3, 0, 9.0, .06, '#d8dcdc', 8)
        if detail:
            for i, c in enumerate(('#118a45', '#f4f4f0', '#118a45')):
                B.box(fx + .07 + .5 * i, fx + .07 + .5 * (i + 1), -45.31, -45.29, 7.6, 8.6, c)
    # ---- end stands (x = +-55..60), low, five rows
    ecols = {-1: ['#2d5fa6', '#2e7a46'], 1: ['#b33a2e', '#d6a21f']}
    for s in (-1, 1):
        x0 = s * 55.0
        B.box(min(x0, x0 + s * .2), max(x0, x0 + s * .2), -26.0, 26.0, 0, 1.0, CREAM, grime=True)
        B.box(min(x0, x0 - s * .02), max(x0, x0 - s * .02), -26.0, 26.0, 0, .5, '#c9a227')
        erows = tiers(B, 'y', -26.0, 26.0, x0 + s * .2, s, .4, .9, .42, 5, '#aaa396')
        eais = [-13.0, 0.0, 13.0]
        for bi, (a, b) in enumerate(blocks(-26.0, 26.0, eais, 1.0)):
            for k, row in enumerate(erows):
                c = ecols[s][(bi + (k // 2)) % 2]
                seats(B, 'y', a, b, row, s, var(c, k, bi, amt=.04), backs=False, pan=(.12, .44))
        for u in eais:
            aisle(B, 'y', u, erows, s, .9, .42, 1.0)
    # ---- outer walls: ends and the +y corners
    EW = 4.2
    for s in (-1, 1):
        a, b = min(s * 59.68, s * 59.98), max(s * 59.68, s * 59.98)
        B.box(a, b, -44.82, 46.0, 0, EW, CREAM, grime=True)
        B.box(min(s * 59.64, s * 60.0), max(s * 59.64, s * 60.0), -44.82, 46.0, EW, EW + .12, '#f6f4ee')
        B.box(min(s * 59.98, s * 60.0), max(s * 59.98, s * 60.0), -44.82, 46.0, 0, 1.0, NGREEN)
        a, b = min(s * MX, s * 59.7), max(s * MX, s * 59.7)
        B.box(a, b, 45.8, 46.0, 0, EW, CREAM, grime=True)
        B.box(a, b, 46.0, 46.02, 0, 1.0, NGREEN)
        B.box(a, b, 45.75, 46.05, EW, EW + .12, '#f6f4ee')
    # ---- scoreboard behind the +x end stand
    for t in (-1, 1):
        B.box(59.6, 60.0, t * 5.0 - .2, t * 5.0 + .2, 0, 12.6, '#5d6366')
    B.box(59.25, 59.6, -7.2, 7.2, 6.8, 12.3, '#2b2e31')
    B.box(59.2, 59.25, -6.8, 6.8, 7.2, 11.9, '#121518')
    B.box(59.15, 59.6, -7.2, 7.2, 12.3, 12.55, NGREEN)
    if detail:
        B.box(58.6, 59.6, -7.2, 7.2, 6.65, 6.8, '#5d6366')
        beam(B, (58.6, -7.2, 7.75), (58.6, 7.2, 7.75), .04, '#c9cbc8')
        for t in (-1, 1):
            B.box(59.17, 59.2, t * 6.4 - .25, t * 6.4 + .25, 12.32, 12.5, '#ff4a2a')
    B.mark('sign_score', 59.14, 0.0, 9.55, text='NAIJA STREETS FC 2 - 1 EKO UNITED', w=13.4, h=4.5, face='-x')
    # ---- floodlights
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1))):
        flood_tower(B, sx * 57.0, sy * 41.2, 30.0, detail, f'light_{i + 1}')
    # ---- marks
    B.mark('pitch', 0.0, 0.0, 0.0, x0=-PX, x1=PX, y0=-PY, y1=PY)
    players = [(-38, 0), (-25, -12), (-25, 12), (-12, -20), (-8, 4), (8, -6), (14, 18), (24, -10), (27, 8), (39, 2)]
    for i, (x, y) in enumerate(players):
        B.mark(f'player_{i + 1}', float(x), float(y), 0.0, face='+x' if x < 0 else '-x')
    fans = []
    for k, x in ((1, -30.0), (2, -16.0), (3, 15.0), (6, 28.0)):
        va, vb, zt = rows[k]; fans.append((x, va + .3, zt, '-y'))
    for k, x in ((1, -40.0), (3, -18.0), (2, 16.0), (4, 38.0)):
        va, vb, zt = trows[k] if x > 0 else (-40.2 - tdep * k, 0, tzb + tris_ * (k + 1))
        fans.append((x, va - .3, zt, '+y'))
    for s, y in ((1, -8.0), (1, 18.0), (-1, 6.0), (-1, -20.0)):
        k = 2
        fans.append((s * (55.2 + .9 * k + .3), y, .4 + .42 * (k + 1), '-x' if s > 0 else '+x'))
    for i, (x, y, z, f) in enumerate(fans):
        B.mark(f'fan_{i + 1}', round(x, 2), round(y, 2), round(z, 2), face=f)
    return B.finish('ns_stadium' + ('' if detail else '_lod1'))


# ================================================================ the community field
def blob(cx, cy, rx, ry, n, seed):
    """An irregular convex-ish patch (worn grass)."""
    return [(cx + rx * (.75 + .25 * hf(seed, i)) * math.cos(2 * math.pi * i / n), cy + ry * (.75 + .25 * hf(i, seed)) * math.sin(2 * math.pi * i / n)) for i in range(n)]


def field(detail):
    """A community / university football field: worn grass pitch 64 x 40, goals, corner flags, a concrete kerb with a
    low wire fence round it (entrance gap on -y), a small covered bleacher on +y."""
    B = Builder(detail, simple=True)
    PX, PY = 32.0, 20.0
    KX, KY = 35.6, 23.6
    flat(B, -KX, KX, -KY, KY, .01, '#6f7f3e')                                       # rough grass round the pitch
    if detail:
        for i in range(10):                                                          # dusty bits outside the lines
            x = -KX + 3 + (2 * KX - 6) * hf(i, 3)
            y = (PY + 1.6) * (1 if i % 2 else -1)
            poly(B, blob(x, y, 1.8 + 1.5 * hf(i), .9, 8, i), .013, '#8f7a55')
    nst = 8
    for i in range(nst):
        x0 = -PX + 2 * PX * i / nst
        flat(B, x0, x0 + 2 * PX / nst, -PY, PY, .018, '#5f8f3a' if i % 2 else '#557f33')
    for s in (-1, 1):                                                                # worn goalmouths, spots, centre
        poly(B, blob(s * (PX - 3.2), 0, 3.6, 5.2, 12, s + 5), .024, '#8b6a45')
        poly(B, blob(s * (PX - 2.0), 0, 1.8, 2.6, 10, s + 9), .027, '#7c5c3b')
        poly(B, blob(s * (PX - 9), 0, 1.4, 1.2, 8, s + 13), .024, '#94744d')
        poly(B, blob(s * 14, s * 4, 3.0, 2.0, 9, s + 17), .022, '#7d7a45')
    poly(B, blob(0, 0, 4.2, 3.4, 12, 21), .024, '#8f6f48')
    poly(B, blob(0, 0, 1.6, 1.4, 8, 23), .027, '#7c5c3b')
    poly(B, blob(0, -PY + .3, 10, 1.0, 10, 25), .022, '#86704b')
    pitch_lines(B, PX, PY, .032, .1, '#e4e2d8', k=.8)
    for s in (-1, 1):
        goal(B, s * PX, s, detail, depth=1.6, c='#f2f2ee')
        for t in (-1, 1):                                                            # corner flags
            cylinder(B, s * PX, t * PY, 0, 1.55, .025, '#f0e6c8', 6)
            fx = s * PX
            B.face([(fx, t * PY, 1.55), (fx + s * -.0, t * PY + t * -.45, 1.5), (fx, t * PY + t * -.45, 1.22), (fx, t * PY, 1.25)], '#e8411f' if s * t > 0 else '#f2c418')
    # concrete kerb and wire fence, gap at the gate (x -2..2 on -y)
    kc = '#a59f92'
    runs = [((-KX, -KY), (-2.0, -KY)), ((2.0, -KY), (KX, -KY)), ((KX, -KY), (KX, KY)), ((KX, KY), (-KX, KY)), ((-KX, KY), (-KX, -KY))]
    for (p, q) in runs:
        x0, x1, y0, y1 = min(p[0], q[0]), max(p[0], q[0]), min(p[1], q[1]), max(p[1], q[1])
        if y0 == y1:
            B.box(x0 - .15, x1 + .15, y0 - .15, y0 + .15, 0, .3, kc, grime=True)
        else:
            B.box(x0 - .15, x0 + .15, y0, y1, 0, .3, kc, grime=True)
        L = math.hypot(q[0] - p[0], q[1] - p[1])
        n = max(1, int(round(L / 2.5)))
        pc, wc = '#7d8486', '#9aa1a3'
        for i in range(n + 1):
            f = i / n
            x, y = p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f
            lean = .04 * (hf(i, x, y) - .5) if detail else 0
            B.box(x - .03, x + .03, y - .03, y + .03, .3, 1.35 + lean, pc)
        hs = (.65, 1.0, 1.32) if detail else (1.32,)
        for h in hs:
            beam(B, (p[0], p[1], h), (q[0], q[1], h), .02 if h < 1.3 else .04, wc)
        if detail:                                                                   # chain-link as a grid of thin wires
            for i in range(int(L / .6)):
                f = (i + .5) * .6 / L
                x, y = p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f
                beam(B, (x, y, .32), (x, y, 1.32), .012, wc)
    for s in (-1, 1):                                                                # gate posts
        B.box(s * 2.0 - .12, s * 2.0 + .12, -KY - .12, -KY + .12, 0, 1.8, '#5d6366')
    flat(B, -2.0, 2.0, -KY - .4, -KY + .4, .015, '#9b8a6a')
    B.mark('gate', 0.0, -KY - 1.2, 0.0, face='+y')
    # bleacher on +y: three tiers under a mono-pitch zinc roof
    bx0, bx1 = -7.0, 7.0
    rows = tiers(B, 'x', bx0, bx1, 21.0, 1, .1, .72, .42, 3, '#a8a295')
    B.box(bx0, bx1, 20.85, 21.0, 0, .1, '#a8a295')
    for k, row in enumerate(rows):
        va, vb, zt = row
        n_ = 4 if detail else 1
        for i in range(n_):
            a = bx0 + .2 + (bx1 - bx0 - .4) * i / n_
            b = bx0 + .2 + (bx1 - bx0 - .4) * (i + 1) / n_ - (.06 if detail else 0)
            B.box(a, b, va + .1, va + .45, zt + .3, zt + .38, var('#8a6a48', k, i, amt=.1))
            if detail:
                for xx in (a + .2, b - .2):
                    B.box(xx - .03, xx + .03, va + .2, va + .35, zt, zt + .3, '#4a4f52')
    B.box(bx0 - .05, bx1 + .05, 23.16, 23.26, 0, 1.5, '#cfc8b6', grime=True)
    for xx in (bx0, 0.0, bx1):
        for y in (20.75, 23.35):
            B.box(xx - .06, xx + .06, y - .06, y + .06, 0, 3.0 if y < 22 else 2.65, '#5d6366')
        beam(B, (xx, 20.4, 3.03), (xx, 23.7, 2.68), .1, '#5d6366')
    zf, zk = 3.12, 2.76
    zz = lambda y: zf + (zk - zf) * (y - 20.3) / (23.8 - 20.3)
    if detail:
        x = bx0 - .4
        i = 0
        while x < bx1 + .3:
            c = ('#8d8f8c', '#7b6250', '#9a9a95', '#86593b')[int(hf(i, 2) * 4)]
            for j in range(4):
                w = .1 if j % 2 == 0 else .07
                xx = x + j * .18
                B.face([(xx, 20.3, zz(20.3) + (.03 if j % 2 else 0)), (xx + .18, 20.3, zz(20.3) + (.03 if j % 2 == 0 else 0)),
                        (xx + .18, 23.8, zz(23.8) + (.03 if j % 2 == 0 else 0)), (xx, 23.8, zz(23.8) + (.03 if j % 2 else 0))], shade(c, 1.0 if j % 2 else .9))
            x += .72
            i += 1
    else:
        B.face([(bx0 - .4, 20.3, zf), (bx1 + .4, 20.3, zf), (bx1 + .4, 23.8, zk), (bx0 - .4, 23.8, zk)], '#8a7a6a')
    # marks
    B.mark('pitch', 0.0, 0.0, 0.0, x0=-PX, x1=PX, y0=-PY, y1=PY)
    players = [(-28, 0), (-20, -9), (-19, 9), (-9, -14), (-6, 3), (6, -4), (10, 13), (17, -7), (20, 6), (28, 1)]
    for i, (x, y) in enumerate(players):
        B.mark(f'player_{i + 1}', float(x), float(y), 0.0, face='+x' if x < 0 else '-x')
    for i, (k, x) in enumerate(((0, -5.0), (0, -1.5), (1, 2.0), (1, 5.0), (2, -3.5), (2, 1.0))):
        va, vb, zt = rows[k]
        B.mark(f'fan_{i + 1}', x, round(va + .3, 2), round(zt + .1, 2), face='-y')
    return B.finish('ns_pitch' + ('' if detail else '_lod1'))


# ================================================================ the flyover
FCON = '#aaa69d'


def streaks(B, face, u0, u1, z0, z1, seed, n, out=.012):
    """Dark water / rust streaks running down a flat concrete face. face=(axis, coord, sign): the face lies in the plane
    axis=coord and looks toward sign; u runs along the other horizontal axis."""
    ax, co, sg = face
    cols = ['#77736a', '#6a675f', '#827661', '#5e6459', '#8b6f52', '#7d7a73']
    for i in range(n):
        h = hf(seed, i)
        u = u0 + (u1 - u0) * h
        w = .06 + .3 * hf(i, seed, 2)
        L = (z1 - z0) * (.25 + .7 * hf(seed, i, 3))
        c = cols[int(hf(i, seed, 4) * len(cols))]
        a, b = max(u0, u - w / 2), min(u1, u + w / 2)
        top = z1 - .02
        o = co + sg * out
        if ax == 'y':
            B.face([(a, o, top - L), (b, o, top - L * .8), (b, o, top), (a, o, top)], c)
        else:
            B.face([(o, a, top - L), (o, b, top - L * .8), (o, b, top), (o, a, top)], c)


def posters(B, face, u0, z0, seed, detail):
    """Bills pasted on a pier: party / church / music posters, a POST NO BILLS stencil, some graffiti."""
    ax, co, sg = face
    def rect(a, b, za, zb, c, o):
        oo = co + sg * o
        if ax == 'y':
            B.face([(a, oo, za), (b, oo, za), (b, oo, zb), (a, oo, zb)], c)
        else:
            B.face([(oo, a, za), (oo, b, za), (oo, b, zb), (oo, a, zb)], c)
    kind = int(hf(seed, 7) * 3)
    pal = ['#1f8a4c', '#f2c21b', '#7b2d8b', '#d23a2a', '#1e5aa8', '#f2f0e6', '#e86f1f', '#111111']
    if kind == 0:                                                                    # a cluster of posters
        for i in range(5 if detail else 2):
            a = u0 + .62 * (i % 3) + .1 * hf(seed, i)
            za = z0 + .9 * (i // 3) + .15 * hf(i, seed)
            c = pal[int(hf(seed, i, 9) * len(pal))]
            rect(a, a + .55, za, za + .8, c, .015 + .002 * i)
            if detail:
                rect(a + .06, a + .49, za + .5, za + .72, pal[int(hf(i, seed, 11) * len(pal))], .018 + .002 * i)
                rect(a + .06, a + .3, za + .08, za + .18, '#f2f0e6', .018 + .002 * i)
        if detail:
            rect(u0 + .3, u0 + .55, z0 - .3, z0 + .1, '#d8cfb8', .014)              # torn remains
    elif kind == 1:                                                                  # POST NO BILLS stencil
        rect(u0, u0 + 1.6, z0 + .6, z0 + 1.1, '#efede6', .014)
        if detail:
            for j in range(3):
                x = u0 + .12 + j * .5
                for q in range(3):
                    rect(x + q * .13, x + q * .13 + .09, z0 + .7, z0 + 1.0, '#1a1a1a', .017)
    else:                                                                            # bubble graffiti
        cs = ['#e43d8c', '#26b3c9', '#f5d117', '#6bd04a', '#f07a1e']
        rect(u0 - .05, u0 + 1.75, z0 + .15, z0 + 1.45, '#151515', .013)
        for i in range(4 if detail else 2):
            a = u0 + .42 * i
            rect(a, a + .38, z0 + .25 + .1 * hf(i, seed), z0 + 1.3 - .1 * hf(seed, i), cs[(i + int(seed)) % len(cs)], .016)
            if detail:
                rect(a + .1, a + .28, z0 + .55, z0 + .9, '#ffffff', .019)


def flyover(detail):
    """A 120 m segment of a Lagos concrete flyover (along x), 30 m wide. Deck top z 8.7, 7.6 m clear underneath;
    piers only in two rows 1.3 m in from the long edges so the middle stays free. Closed on top (under construction)."""
    B = Builder(detail, simple=True)
    L2, W2, ZT, ZB = 60.0, 15.0, 8.7, 7.6
    PYc = W2 - 1.3
    xs = [-50.0, -30.0, -10.0, 10.0, 30.0, 50.0]
    # ---- kerbed islands along the pier rows (the ground under the bridge)
    for s in (-1, 1):
        a, b = sorted((s * (PYc - 1.25), s * (PYc + 1.0)))
        B.box(-L2, L2, a, b, 0, .18, '#9a958b', grime=False)
        if detail:
            for i in range(24):
                x = -L2 + 5 * i
                B.box(x + .02, x + 4.98, a - .01, a + .12, 0, .2, '#e8e6df' if i % 2 else '#262626')
                B.box(x + .02, x + 4.98, b - .12, b + .01, 0, .2, '#e8e6df' if i % 2 else '#262626')
    # ---- piers with hammerheads
    for i, x in enumerate(xs):
        for s in (-1, 1):
            y = s * PYc
            B.box(x - 1.7, x + 1.7, y - 1.2, y + 1.2, .18, .4, '#959087')
            pc = var(FCON, i, s, amt=.05)
            pts = octo(x, y, 1.1, .7, .22)
            prism(B, pts, .4, 6.3, pc, top=False, grime=True)
            top = octo(x, y + s * .25, 1.35, 1.25, .1)
            frustum(B, pts, 6.3, top, 7.6, shade(pc, .97), top=False)
            # stains and bills on the flat faces
            if detail:
                inner, outer = ('y', y - s * .7, -s), ('y', y + s * .7, s)
                streaks(B, inner, x - .85, x + .85, .4, 6.3, i * 7 + s, 6)
                streaks(B, outer, x - .85, x + .85, .4, 6.3, i * 5 + s + 3, 7)
                streaks(B, ('x', x + 1.1, 1), y - .45, y + .45, .4, 6.3, i * 3 + s + 1, 3)
                streaks(B, ('x', x - 1.1, -1), y - .45, y + .45, .4, 6.3, i * 11 + s + 2, 3)
                B.box(x - 1.12, x + 1.12, y - .72, y + .72, .4, .75, '#6f7366')            # green-black splash line
            if (i + (s > 0)) % 2 == 0 or detail:
                posters(B, ('y', y - s * .7, -s), x - .85, 1.4, i * 13 + s * 5 + 31, detail)
    # ---- crossbeams (integral, flush with the girders) and I-girders
    for x in xs:
        B.box(x - .9, x + .9, -W2 + .05, W2 - .05, ZB, 8.45, shade(FCON, .96))
    spans = [(-L2, xs[0] - .9)] + [(a + .9, b - .9) for a, b in zip(xs, xs[1:])] + [(xs[-1] + .9, L2)]
    gys = [-13.5 + 3.0 * i for i in range(10)]
    for (a, b) in spans:
        for j, gy in enumerate(gys):
            gc = var('#a29e95', a, j, amt=.04)
            if detail:
                B.box(a, b, gy - .36, gy + .36, ZB, ZB + .16, gc)
                B.box(a, b, gy - .1, gy + .1, ZB + .16, 8.28, shade(gc, .95))
                B.box(a, b, gy - .45, gy + .45, 8.28, 8.45, gc)
            else:
                B.box(a, b, gy - .3, gy + .3, ZB, 8.45, gc)
    # ---- deck slab, edge fascia, asphalt, markings
    B.box(-L2, L2, -W2, W2, 8.45, ZT, '#b0aca3', bottom=True)
    for s in (-1, 1):
        a, b = sorted((s * (W2 - .05), s * (W2 + .08)))
        B.box(-L2, L2, a, b, 8.05, ZT + .05, '#b5b1a8')
        if detail:
            x = -L2 + .5
            k = 0
            while x < L2 - .5:                                                       # rain streaks down the fascia
                w = .3 + 1.4 * hf(k, s)
                Ls = .25 + .55 * hf(s, k)
                yy = s * (W2 + .085)
                B.face([(x, yy, ZT + .04), (x + w, yy, ZT + .04), (x + w, yy, ZT + .04 - Ls * .7), (x, yy, ZT + .04 - Ls)], '#827e75' if k % 3 else '#6f6b63')
                x += w + .4 + 2.5 * hf(k, s, 1)
                k += 1
    flat(B, -L2, L2, -W2 + .6, W2 - .6, ZT + .005, '#3f3f3d')
    if detail:
        for i in range(14):                                                          # patched asphalt
            x = -L2 + 4 + (2 * L2 - 8) * hf(i, 41)
            y = (W2 - 3) * (2 * hf(41, i) - 1)
            flat(B, x, x + 1.5 + 3 * hf(i, 1), y, y + 1 + 1.5 * hf(i, 2), ZT + .008, '#353534' if i % 2 else '#4a4946')
    for s in (-1, 1):
        flat(B, -L2, L2, s * (W2 - 1.0) - .07, s * (W2 - 1.0) + .07, ZT + .011, '#d8d6cc')
        for ly in (3.6, 7.1, 10.6):
            x = -L2 + 1
            while x < L2 - 3:
                flat(B, x, x + 3, s * ly - .07, s * ly + .07, ZT + .011, '#cfcdc2')
                x += 9.0
    for x in (-20.0, 20.0):                                                          # expansion joints
        flat(B, x - .1, x + .1, -W2 + .6, W2 - .6, ZT + .012, '#2a2a2a')
        if detail:
            flat(B, x - .14, x - .1, -W2 + .6, W2 - .6, ZT + .012, '#7a7d7f')
            flat(B, x + .1, x + .14, -W2 + .6, W2 - .6, ZT + .012, '#7a7d7f')
    # ---- New Jersey parapets on both edges and a median barrier
    def nj(y_out, s, x0, x1, c):
        prof = [(0, 0), (.55, 0), (.55, .08), (.3, .33), (.18, 1.05), (0, 1.05)]
        P = lambda x, p: (x, y_out - s * p[0], ZT + p[1])
        n = len(prof)
        for i in range(n):
            p, q = prof[i], prof[(i + 1) % n]
            if i == n - 1:
                continue
            g = lambda z: .84 + .16 * min(1, (z - ZT) / .8)
            B.face([P(x0, p), P(x1, p), P(x1, q), P(x0, q)], c, [g(P(0, p)[2]), g(P(0, p)[2]), g(P(0, q)[2]), g(P(0, q)[2])])
        B.face([P(x0, p) for p in prof], c)
        B.face([P(x1, p) for p in prof][::-1], c)
    for s in (-1, 1):
        x = -L2
        k = 0
        while x < L2 - .01:
            nj(s * W2, s, x + .01, min(L2, x + 6.0) - .01, var('#bdb9b0', k, s, amt=.04))
            x += 6.0
            k += 1
    for x0 in range(-60, 60, 6):                                                     # median: two half profiles back to back
        c = var('#bdb9b0', x0, 9, amt=.04)
        prof = [(-.28, 0), (.28, 0), (.28, .08), (.15, .33), (.09, .85), (-.09, .85), (-.15, .33), (-.28, .08)]
        B.face([(x0 + .01, p[0], ZT + p[1]) for p in prof], c)
        B.face([(x0 + 5.99, p[0], ZT + p[1]) for p in prof][::-1], c)
        for i in range(len(prof)):
            p, q = prof[i], prof[(i + 1) % len(prof)]
            if i == 0:
                continue
            B.face([(x0 + .01, p[0], ZT + p[1]), (x0 + 5.99, p[0], ZT + p[1]), (x0 + 5.99, q[0], ZT + q[1]), (x0 + .01, q[0], ZT + q[1])], c)
    # ---- lamp poles on the parapets
    for x in (-40.0, -20.0, 0.0, 20.0, 40.0):
        for s in (-1, 1):
            y = s * (W2 - .25)
            z0 = ZT + 1.05
            cylinder(B, x, y, z0 - .1, z0 + 9.0, .1 if detail else .12, '#8a9093', 8 if detail else 6)
            B.box(x - .2, x + .2, y - .2, y + .2, z0 - .05, z0 + .1, '#6f7578')
            hx, hy = x, y - s * 2.2
            beam(B, (x, y, z0 + 8.9), (hx, hy, z0 + 9.2), .09, '#8a9093')
            fbox(B, (hx, hy - s * .3, z0 + 9.15), (1, 0, 0), (0, 1, 0), (0, 0, -1), .22, .5, .09, '#6f7578', front='#fff3cc')
    # ---- drain pipes down some piers (with rust under the scuppers)
    for (x, s) in ((-30.0, -1), (10.0, 1), (50.0, -1), (-50.0, 1), (30.0, 1)):
        y = s * PYc
        px = x + .6
        yo = y + s * (.7 + .12)
        pipe = [(px, s * (W2 + .2), 8.3), (px, s * (W2 + .2), 6.6), (px, yo, 6.0), (px, yo, .5), (px, yo + s * .5, .35)]
        path(B, pipe, .2, '#55595b')
        if detail:
            for z in (1.5, 3.0, 4.5):
                B.box(px - .14, px + .14, yo - s * .12 - .02, yo + .04 * s, z, z + .07, '#3d4042')
            B.face([(px - .25, s * (W2 + .09), ZT), (px + .3, s * (W2 + .09), ZT), (px + .45, s * (W2 + .09), 8.0), (px - .35, s * (W2 + .09), 8.0)], '#8b5a35')
            B.face([(px - .3, y + s * .713, 5.8), (px + .35, y + s * .713, 5.8), (px + .25, y + s * .713, 1.0), (px - .2, y + s * .713, 1.6)], '#7f6247')
            disc(B, px, yo + s * .45, .32, .2, '#5b5a4e', 8)
    # ---- closed ends: water barriers, signs, construction stuff
    for s in (-1, 1):
        xb = s * 57.6
        y = -W2 + .6
        k = 0
        while y < W2 - .6 - .5:
            y1 = min(y + 1.18, W2 - .6)
            c = '#c8352b' if k % 2 == 0 else '#efefea'
            frustum(B, [(xb - .28, y), (xb + .28, y), (xb + .28, y1), (xb - .28, y1)], ZT,
                    [(xb - .12, y + .04), (xb + .12, y + .04), (xb + .12, y1 - .04), (xb - .12, y1 - .04)], ZT + .82, c)
            y = y1 + .02
            k += 1
        xs_ = s * 59.0
        for t in (-1, 1):
            B.box(xs_ - .05, xs_ + .05, t * 1.9 - .05, t * 1.9 + .05, ZT, ZT + 2.4, '#55595b')
        B.box(xs_ - .04, xs_ + .04, -2.1, 2.1, ZT + 1.15, ZT + 2.45, '#c8352b')
        B.box(xs_ + s * .04, xs_ + s * .06, -2.0, 2.0, ZT + 1.2, ZT + 2.4, '#f4f2ea')
        B.mark(f'sign_closed_{1 if s < 0 else 2}', round(xs_ + s * .08, 2), 0.0, ZT + 1.8, text='FLYOVER UNDER CONSTRUCTION', w=3.9, h=1.1, face='-x' if s < 0 else '+x')
        for t in (-1, 1):                                                            # cones
            for j in range(3):
                cx, cy = s * (55.5 - 1.6 * j), t * (4 + 3.0 * j)
                frustum(B, circ(cx, cy, .2, 8), ZT, circ(cx, cy, .04, 8), ZT + .7, '#ee6a1d')
                if detail:
                    frustum(B, circ(cx, cy, .13, 8), ZT + .35, circ(cx, cy, .1, 8), ZT + .48, '#f4f4f0', top=False)
                B.box(cx - .25, cx + .25, cy - .25, cy + .25, ZT, ZT + .05, '#2a2a2a')
    if detail:
        frustum(B, circ(30, 7, 2.2, 10, 1.6), ZT, circ(30.2, 7.1, .5, 10, .4), ZT + 1.1, '#c9b48a')         # sand heap
        for i in range(4):                                                           # stacked blocks
            for j in range(3):
                B.box(36 + .42 * j, 36.4 + .42 * j, -8 + i % 2 * .1, -7.8 + .45 + i % 2 * .1, ZT + .2 * i, ZT + .2 * (i + 1), var('#a8a49b', i, j, amt=.06))
        for i in range(10):                                                          # rebar bundle
            beam(B, (-38, -6 + .05 * i, ZT + .06 + .03 * (i % 3)), (-26, -6.1 + .05 * i, ZT + .06 + .03 * (i % 3)), .025, '#7a4a2e')
        B.box(-44, -40, 6, 8.5, ZT, ZT + .12, '#6e5a3e')                              # planks
        B.box(-43.9, -40.1, 6.1, 8.4, ZT + .12, ZT + .24, '#7f6a4b')
    # ---- marks: camp strips under the deck, just inside the pier rows
    zi = PYc - 1.25 - .1
    B.mark('under_l', 0.0, round(-(zi + 9.0) / 2, 2), 0.0, x0=-58.0, x1=58.0, y0=-round(zi, 2), y1=-9.0)
    B.mark('under_r', 0.0, round((zi + 9.0) / 2, 2), 0.0, x0=-58.0, x1=58.0, y0=9.0, y1=round(zi, 2))
    return B.finish('ns_flyover' + ('' if detail else '_lod1'))


# ================================================================ camp kit (people living under the flyover)
TARP_BLUE = '#5d86a6'


def ellipsoid_ring(a, b, h, phi, n, cx=0.0, cy=0.0, z0=0.0, sag=0.0):
    return [(cx + a * math.cos(phi) * math.cos(2 * math.pi * i / n), cy + b * math.cos(phi) * math.sin(2 * math.pi * i / n),
             z0 + h * math.sin(phi) - (sag * math.cos(phi) * (1 + math.cos(4 * 2 * math.pi * i / n)) / 2)) for i in range(n)]


def tent_dome(detail):
    """A small dome tent of faded blue tarpaulin with a darker fly, poles and guy ropes."""
    B = Builder(detail, simple=True)
    n = 16 if detail else 10
    a, b, h = 1.12, .92, 1.25
    flat(B, -1.2, 1.2, -1.0, 1.0, .01, '#6c7a6e')                                    # ground sheet
    nr = 5 if detail else 3
    rings = [ellipsoid_ring(a, b, h, math.pi / 2 * j / nr * .98, n) for j in range(nr + 1)]
    loft(B, rings[:3] if nr == 5 else rings[:2], TARP_BLUE, False, False, lambda j, i: var(TARP_BLUE, j, i, amt=.06))
    fly = [ellipsoid_ring(a * 1.05, b * 1.05, h * 1.04, math.pi / 2 * j / nr * .98, n, z0=.02, sag=.04) for j in range(nr + 1)]
    k0 = 2 if nr == 5 else 1
    loft(B, fly[k0:], '#2f4e72', False, True, lambda j, i: var('#2f4e72', j, i, amt=.07))
    # doorway on -y: dark opening and rolled-up flap
    dy = lambda z: -b * math.cos(math.asin(min(.99, z / h))) - .025
    zs = [.03, .35, .65, .9]
    ws = [.4, .38, .33, .24]
    for (za, wa), (zb_, wb) in zip(zip(zs, ws), zip(zs[1:], ws[1:])):
        B.face([(-wa, dy(za), za), (wa, dy(za), za), (wb, dy(zb_), zb_), (-wb, dy(zb_), zb_)], '#1c262e')
    if detail:
        cylinder_x(B, -.3, .3, dy(.95) - .05, .97, .06, '#4f7896', 8)
        for t in (-1, 1):
            beam(B, (t * .18, dy(.95) - .1, .99), (t * .18, dy(.85) - .07, .86), .015, '#c8b98a')
    # poles crossing over the top
    pc = '#3a3d40'
    for t in (-1, 1):
        pts = []
        for j in range(9):
            ang = math.pi * j / 8
            r = math.cos(ang)
            pts.append((t * r * a * .74 * 1.07, r * b * .74 * 1.07, .02 + h * 1.06 * math.sin(ang)))
        path(B, pts, .025, pc)
    # guy ropes and pegs
    for (x, y) in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        p0 = (x * a * .62, y * b * .62, h * .78)
        p1 = (x * 1.28, y * 1.08, .0)
        beam(B, p0, p1, .012, '#d9c9a0')
        B.box(p1[0] - .02, p1[0] + .02, p1[1] - .02, p1[1] + .02, 0, .12, '#a0a4a6')
    if detail:                                                                       # slippers and a kettle by the door
        for t, c in ((-.18, '#2b6fb3'), (.12, '#d23a2a')):
            B.box(t - .05, t + .05, -1.25, -1.0, 0, .03, c)
        cylinder(B, .55, -1.15, 0, .2, .1, '#4a8a5a', 8)
        beam(B, (.55, -1.15, .2), (.66, -1.15, .26), .02, '#4a8a5a')
    B.mark('person', -.55, -1.25, 0.0, pose='sit', face='-y')
    return B.finish('ns_tent_dome' + ('' if detail else '_lod1'))


def corrugated(B, x0, x1, y0, y1, z0, z1, c, step=.15, rust=None, seed=0):
    """A sloping corrugated sheet from (y0, z0) to (y1, z1), ribs running along y."""
    x = x0
    i = 0
    while x < x1 - .01:
        xb = min(x1, x + step)
        dz = .025 if i % 2 else 0
        cc = c
        if rust and hf(seed, int((x - x0) / .6)) > .55:
            cc = rust
        B.face([(x, y0, z0 + dz), (xb, y0, z0 + .025 - dz), (xb, y1, z1 + .025 - dz), (x, y1, z1 + dz)], shade(cc, .92 if i % 2 else 1.0))
        x = xb
        i += 1


def tarp(B, p0, p1, p2, p3, c, nu=3, sag=.06, seed=0):
    """A sheet hung on four corners, sagging a bit in the middle (u along p0->p1)."""
    def P(u, v):
        a = _add(_mul(p0, (1 - u) * (1 - v)), _mul(p1, u * (1 - v)), _mul(p2, u * v), _mul(p3, (1 - u) * v))
        s_ = sag * math.sin(math.pi * u) * math.sin(math.pi * v)
        return (a[0], a[1], a[2] - s_)
    for i in range(nu):
        for j in range(2):
            u0, u1, v0, v1 = i / nu, (i + 1) / nu, j / 2, (j + 1) / 2
            B.face([P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], var(c, seed, i, j, amt=.06))


def chair(B, x, y, rot, c='#e9e9e4'):
    """A plastic monobloc chair; rot=0 faces -y."""
    co, si = math.cos(rot), math.sin(rot)
    R = lambda u, v: (x + u * co - v * si, y + u * si + v * co)
    U, V = (co, si, 0), (-si, co, 0)
    for (u, v) in ((-.2, -.2), (.2, -.2), (-.2, .2), (.2, .2)):
        px, py = R(u, v)
        beam(B, (px, py, 0), (px, py, .42), .04, shade(c, .9))
    cx, cy = R(0, 0)
    fbox(B, (cx, cy, .44), U, V, (0, 0, 1), .23, .23, .025, c)
    bx, by = R(0, .23)
    fbox(B, (bx, by + 0, .66), U, (0, 0, 1), (V[0], V[1], 0), .22, .2, .02, c)
    for t in (-1, 1):
        ax, ay = R(t * .23, 0)
        beam(B, (ax, ay, .6), (ax + .0, ay, .6), .03, c)


def tent_shack(detail):
    """A shack of poles and planks under tarpaulins, a corrugated iron sheet on top, cardboard and a mat at the door."""
    B = Builder(detail, simple=True)
    x0, x1, y0, y1 = -1.35, 1.35, -.95, 1.1
    zf, zb = 1.95, 1.6
    wood = ['#7a5c3e', '#8a6a4a', '#6f5539', '#94775a']
    flat(B, x0, x1, y0, y1, .012, '#3d3530')                                         # trodden floor
    for (x, y, h) in ((x0, y0, zf), (x1, y0, zf), (x0, y1, zb), (x1, y1, zb), (0, y0, zf + .05)):
        B.box(x - .045, x + .045, y - .045, y + .045, 0, h, var('#6a4e33', x, y))
    for (a, b) in (((x0, y0), (x1, y0)), ((x0, y1), (x1, y1)), ((x0, y0), (x0, y1)), ((x1, y0), (x1, y1))):
        za = zf if a[1] < 0 else zb
        zb_ = zf if b[1] < 0 else zb
        beam(B, (a[0], a[1], za - .05), (b[0], b[1], zb_ - .05), .07, '#5f4630')
    # back wall of planks
    z = .05
    k = 0
    while z < zb - .1:
        B.box(x0, x1, y1 - .02, y1 + .02, z, min(zb - .05, z + .19), var(wood[k % 4], k, amt=.08))
        z += .21
        k += 1
    # side tarps, mixed colours
    tarp(B, (x0 - .03, y0, zf), (x0 - .03, y1, zb), (x0 - .06, y1, .05), (x0 - .1, y0 + .1, .05), '#e0782c', 3, .08, 1)
    tarp(B, (x1 + .03, y0 + .4, zf - .05), (x1 + .03, y1, zb), (x1 + .06, y1, .25), (x1 + .1, y0 + .45, .1), '#6f8f6a', 3, .07, 2)
    if detail:
        B.box(x1 + .02, x1 + .05, y0, y0 + .4, .1, 1.5, '#4f6a8a')                   # plank patch where the tarp is short
    # roof: blue tarp under a rusty corrugated sheet
    tarp(B, (x0 - .2, y0 - .25, zf + .06), (x1 + .2, y0 - .25, zf + .06), (x1 + .2, y1 + .15, zb + .06), (x0 - .2, y1 + .15, zb + .06), TARP_BLUE, 4, .05, 3)
    corrugated(B, x0 - .05, x1 - .3, y0 - .1, y1 + .1, zf + .12, zb + .12, '#8d8f8c', .16 if detail else .5, '#86593b', 4)
    if detail:
        for (x, y) in ((-.9, -.3), (.6, .5), (-.1, .2)):                                # stones and a tyre to hold it down
            zz = zf + .14 + (zb - zf) * (y - y0) / (y1 - y0)
            B.box(x - .1, x + .12, y - .09, y + .1, zz, zz + .12, var('#7c776e', x, y))
        tz = zf + .14 + (zb - zf) * (.35 - y0) / (y1 - y0)
        pts = circ(.95, .35, .32, 10)
        inner = circ(.95, .35, .18, 10)
        for i in range(10):
            j = (i + 1) % 10
            B.face([(pts[i][0], pts[i][1], tz + .1), (pts[j][0], pts[j][1], tz + .1), (inner[j][0], inner[j][1], tz + .1), (inner[i][0], inner[i][1], tz + .1)], '#1e1e1e')
            B.face([(pts[i][0], pts[i][1], tz), (pts[j][0], pts[j][1], tz), (pts[j][0], pts[j][1], tz + .1), (pts[i][0], pts[i][1], tz + .1)], '#262626')
    # front: an orange curtain tied to one side, ropes
    tarp(B, (x0 + .05, y0 - .03, zf - .05), (x0 + .55, y0 - .03, zf - .05), (x0 + .45, y0 - .05, .1), (x0 + .05, y0 - .03, .1), '#c45a2a', 2, .0, 5)
    if detail:
        beam(B, (x0 + .05, y0 - .06, 1.0), (x0 + .5, y0 - .06, 1.0), .02, '#d9c9a0')
        for (p, q) in (((x0, y0, zf), (x0 - .22, y0 - .3, 0)), ((x1, y0, zf), (x1 + .22, y0 - .3, 0)), ((x1, y1, zb), (x1 + .2, y1 + .12, 0))):
            beam(B, p, q, .014, '#d9c9a0')
        flat(B, -.9, .9, .1, .95, .02, '#c9b07a')
        for i in range(6):
            flat(B, -.9, .9, .1 + .14 * i, .1 + .14 * i + .05, .022, '#8e3a2e' if i % 2 else '#2f6b45')
        B.box(.55, 1.05, .55, .9, .02, .32, '#2b4f8a')
    # cardboard and a mat at the entrance
    for i, (x, y, w, d, c) in enumerate(((-.7, -1.5, .9, .5, '#b38e5d'), (.05, -1.4, .8, .45, '#a8845a'), (-.3, -1.15, 1.0, .35, '#c19a66'))):
        B.box(x, x + w, y, y + d, 0, .012 + .004 * i, c)
    flat(B, -.6, .5, -1.4, -1.0, .03, '#b9a46a')
    if detail:
        for i in range(5):
            flat(B, -.6 + .22 * i, -.6 + .22 * i + .1, -1.4, -1.0, .032, '#8a2f2a' if i % 2 else '#2e5f8a')
    chair(B, 1.0, -1.32, .4, '#e8e8e2' if detail else '#e0e0da')
    B.mark('person', 1.0, -1.32, 0.0, pose='sit', face='-y')
    return B.finish('ns_tent_shack' + ('' if detail else '_lod1'))


def bucket(B, cx, cy, r, h, c, detail, water=False):
    frustum(B, circ(cx, cy, r * .8, 10), 0, circ(cx, cy, r, 10), h, c, top=False)
    disc(B, cx, cy, r * .8, .005, shade(c, .8), 10)
    if water:
        disc(B, cx, cy, r * .95, h * .8, '#4f7d93', 10)
    if detail:
        path(B, [(cx - r, cy, h), (cx - r * .6, cy, h + r * .7), (cx + r * .6, cy, h + r * .7), (cx + r, cy, h)], .015, '#3a3a3a')


def jerrycan(B, x, y, rot, detail, c='#e5b417'):
    co, si = math.cos(rot), math.sin(rot)
    U, V, W = (co, si, 0), (-si, co, 0), (0, 0, 1)
    fbox(B, (x, y, .2), U, V, W, .09, .16, .2, c)
    if detail:
        fbox(B, (x, y, .42), U, V, W, .03, .07, .02, shade(c, .9))
        fbox(B, (x - .0 * si, y + .0, .405), U, V, W, .085, .06, .01, shade(c, .85))
        cylinder(B, x - .1 * si, y + .1 * co, .4, .45, .03, '#d23a2a', 6)
        fbox(B, (x, y, .2), U, V, W, .093, .02, .15, shade(c, .9))


def camp_kitchen(detail):
    """Cooking corner: a three-stone fire with a black pot, a kerosene stove, buckets, yellow jerrycans, a bench, plates."""
    B = Builder(detail, simple=True)
    poly(B, circ(-.55, -.2, .55, 10, .45), .01, '#2c2925')                           # ash
    for i in range(3):
        a = 2 * math.pi * i / 3 + .3
        cx, cy = -.55 + .26 * math.cos(a), -.2 + .26 * math.sin(a)
        frustum(B, circ(cx, cy, .1 + .02 * hf(i), 6, .09, a), 0, circ(cx, cy, .07, 6, .06, a + .3), .18, var('#8a8378', i, amt=.1))
    if detail:
        for i in range(5):                                                           # firewood and embers
            a = 2 * math.pi * i / 5 + .7
            beam(B, (-.55 + .12 * math.cos(a), -.2 + .12 * math.sin(a), .05), (-.55 + .75 * math.cos(a), -.2 + .7 * math.sin(a), .03), .05, var('#5a3e28', i))
        for i in range(5):
            B.box(-.62 + .05 * i, -.58 + .05 * i, -.24, -.18 + .02 * i, .01, .05, '#ff7a1a')
    frustum(B, circ(-.55, -.2, .16, 10), .14, circ(-.55, -.2, .24, 10), .32, '#1d1c1b')   # black pot
    disc(B, -.55, -.2, .22, .32, '#2a2826', 10)
    if detail:
        B.box(-.58, -.52, -.23, -.17, .32, .37, '#2a2826')
        for t in (-1, 1):
            B.box(-.55 + t * .25 - .02, -.55 + t * .25 + .02, -.23, -.17, .26, .3, '#1d1c1b')
    # kerosene stove with an aluminium pot
    cylinder(B, .35, .15, 0, .2, .15, '#2a5d9a', 10)
    if detail:
        cylinder(B, .35, .15, .2, .23, .09, '#333', 8)
        for i in range(3):
            a = 2 * math.pi * i / 3
            B.box(.35 + .12 * math.cos(a) - .015, .35 + .12 * math.cos(a) + .015, .15 + .12 * math.sin(a) - .015, .15 + .12 * math.sin(a) + .015, .2, .28, '#333')
    cylinder(B, .35, .15, .28, .45, .14, '#b9bcbd', 10)
    # buckets and jerrycans
    bucket(B, .9, -.55, .17, .3, '#c8352b', detail, True)
    bucket(B, .6, -.75, .15, .27, '#2f6fb0', detail)
    for i, (x, y, r) in enumerate(((1.05, .2, .2), (1.0, .55, -.1), (.62, .62, .5))):
        jerrycan(B, x, y, r, detail)
    # bench along the back with plates and a basin
    for x in (-.85, .15):
        B.box(x - .04, x + .04, .72, .82, 0, .4, '#5f4630')
    B.box(-1.05, .35, .65, .9, .4, .45, '#8a6a4a')
    for i in range(3 if detail else 1):
        disc(B, -.75 + .25 * i, .77, .1, .45 + .012 * (i % 2 + 1), ('#f2f2ec', '#d8e4ee', '#f2f2ec')[i], 10)
    if detail:
        for i in range(4):
            disc(B, -.12, .77, .1, .46 + .012 * i, '#f2f2ec' if i % 2 else '#2f6fb0', 10)
        frustum(B, circ(.2, -.85 + 1.1, .17, 10), 0, circ(.2, .25, .25, 10), .12, '#c4c7c8', top=False)
        disc(B, .2, .25, .2, .1, '#7a8f95', 10)
        cylinder(B, -.98, .78, .45, .58, .04, '#d23a2a', 8)
    B.mark('person', -.35, .78, 0.0, pose='sit', face='-y')
    return B.finish('ns_camp_kitchen' + ('' if detail else '_lod1'))


def camp_bed(detail):
    """Two worn foam mattresses on cardboard, a pillow, a bag, a mosquito-net frame."""
    B = Builder(detail, simple=True)
    for i, (x, y, w, d, c) in enumerate(((-1.15, -.95, 1.2, 1.0, '#b38e5d'), (0, -.9, 1.15, .95, '#a8845a'), (-1.1, .02, 1.25, .95, '#c19a66'), (.1, .05, 1.05, .92, '#b08a58'))):
        B.box(x, x + w, y, y + d, 0, .008 + .003 * i, c)
    foam = '#d9bd6a'
    for j, (y0, y1) in enumerate(((-.88, -.02), (.06, .9))):
        B.box(-.98, .92, y0, y1, .02, .15, var(foam, j, amt=.05))
        if detail:
            for k in range(4):
                x = -.9 + 1.6 * hf(j, k)
                yy = y0 + .1 + (y1 - y0 - .4) * hf(k, j)
                flat(B, x, x + .2 + .2 * hf(k), yy, yy + .15 + .2 * hf(j, k, 2), .152, '#a88a45' if k % 2 else '#c2a457')
    if detail:                                                                       # a faded cover on one, wrapper on the other
        flat(B, -.98, .4, .06, .9, .155, '#7d97b8')
        for k in range(6):
            flat(B, -.98 + .23 * k, -.98 + .23 * k + .08, .06, .9, .157, '#c9d4e2')
        tarp(B, (.0, -.88, .17), (.92, -.88, .17), (.92, -.3, .19), (.0, -.3, .19), '#b8402e', 2, -.02, 7)
    for j, y in enumerate((-.45, .48)):                                              # pillows
        fbox(B, (-.78, y, .21), (1, 0, 0), (0, 1, 0), (0, 0, 1), .14, .27, .06, '#e6e2d6' if j else '#d7cbb6')
    # Ghana-must-go bag at the foot
    fbox(B, (1.05, -.5, .2), (0, 1, 0), (-1, 0, 0), (0, 0, 1), .32, .16, .2, '#7a3a3a')
    if detail:
        for k in range(4):
            B.box(.885, 1.215, -.82 + .16 * k, -.78 + .16 * k, .0, .405, '#2b4f8a')
            B.box(.885, 1.215, -.825, -.175, .08 + .1 * k, .11 + .1 * k, '#e6e2d6')
        beam(B, (1.0, -.65, .4), (1.0, -.35, .4), .03, '#2b2b2b')
    # mosquito net frame and the net tied up
    pts = [(-1.08, -.95), (1.0, -.95), (1.0, .98), (-1.08, .98)]
    for (x, y) in pts:
        beam(B, (x, y, 0), (x, y, 1.55), .035, '#6a4e33')
    for i in range(4):
        a, b = pts[i], pts[(i + 1) % 4]
        beam(B, (a[0], a[1], 1.55), (b[0], b[1], 1.55), .03, '#6a4e33')
    net = '#d3dde3'
    tarp(B, (-1.07, .97, 1.53), (.99, .97, 1.53), (.99, .97, 1.0), (-1.07, .97, 1.0), net, 3, -.06, 9)
    frustum(B, circ(-1.0, -.88, .09, 8), 1.15, circ(-1.03, -.9, .04, 8), 1.53, net)
    if detail:
        frustum(B, circ(.93, -.88, .08, 8), 1.2, circ(.96, -.9, .04, 8), 1.53, net)
        beam(B, (-1.05, -.9, 1.25), (-.95, -.85, 1.25), .03, '#c8352b')
        B.box(-1.2, -1.02, .7, .92, 0, .25, '#2f6fb0')                               # a small basin with things
        cylinder(B, -.2, 1.05, 0, .22, .05, '#2e8b57', 8)                              # bottle
    B.mark('person', -.2, -.45, .15, pose='sit', face='-y')
    return B.finish('ns_camp_bed' + ('' if detail else '_lod1'))


def shirt(B, x, z, w, h, c, y=0.0):
    """A shirt hanging on the line (top at z), as convex pieces in the x-z plane."""
    B.face([(x - w / 2, y, z - h), (x + w / 2, y, z - h), (x + w / 2, y, z - .04), (x - w / 2, y, z - .04)], c)
    for t in (-1, 1):
        B.face([(x + t * w / 2, y, z - .04), (x + t * (w / 2 + .18), y, z - .2), (x + t * (w / 2 + .1), y, z - .32), (x + t * w / 2, y, z - .22)][::t], c)


def trousers(B, x, z, w, h, c, y=0.0):
    B.face([(x - w / 2, y, z - .25), (x + w / 2, y, z - .25), (x + w / 2, y, z), (x - w / 2, y, z)], c)
    for t in (-1, 1):
        B.face([(x + t * .02, y, z - .25), (x + t * w / 2, y, z - .25), (x + t * (w / 2 - .03), y, z - h), (x + t * .05, y, z - h)][::t], shade(c, .95))


def camp_line(detail):
    """Two poles with a sagging clothes line, colourful washing, pegs and a bucket."""
    B = Builder(detail, simple=True)
    xa, xb, H_ = -2.8, 2.8, 1.85
    for x, lean in ((xa, -.08), (xb, .08)):
        beam(B, (x, 0, 0), (x + lean, 0, H_ + .1), .07, '#6f5539')
        if detail:
            for i in range(4):
                a = 2 * math.pi * i / 4 + .4
                frustum(B, circ(x + .2 * math.cos(a), .2 * math.sin(a), .1, 6), 0, circ(x + .2 * math.cos(a), .2 * math.sin(a), .06, 6), .12, var('#8a8378', i, x))
            beam(B, (x + lean, 0, H_ + .1), (x + lean * 1.5, .0, H_ + .25), .04, '#6f5539')
    n = 10
    line = []
    for i in range(n + 1):
        f = i / n
        x = (xa - .08) + (xb + .08 - (xa - .08)) * f
        line.append((x, 0, H_ - .18 * math.sin(math.pi * f)))
    path(B, line, .012, '#d9c9a0')
    zl = lambda x: H_ - .18 * math.sin(math.pi * (x - xa + .08) / (xb - xa + .16))
    items = [('s', -2.2, '#d23a2a', .5, .62), ('t', -1.45, '#2b3f63', .4, .95), ('w', -.75, None, .7, 1.05), ('s', .1, '#f2c21b', .48, .6),
             ('s', .75, '#f2f2ec', .46, .64), ('w', 1.45, '#3a8fc9', .55, .7), ('t', 2.2, '#4a4f52', .38, .9)]
    for k, (kind, x, c, w, h) in enumerate(items):
        z = zl(x) - .01
        if kind == 's':
            shirt(B, x, z, w, h, c)
        elif kind == 't':
            trousers(B, x, z, w, h, c)
        else:
            if c is None:                                                            # an Ankara wrapper in bands
                nb = 6 if detail else 2
                cols = ['#c8352b', '#f2a81d', '#1f6b8a', '#2e8b57', '#7b2d8b', '#f2a81d']
                for b in range(nb):
                    B.face([(x - w / 2, 0, z - h * b / nb), (x + w / 2, 0, z - h * b / nb), (x + w / 2, 0, z - h * (b + 1) / nb), (x - w / 2, 0, z - h * (b + 1) / nb)], cols[b % len(cols)])
                if detail:
                    for b in range(5):
                        xx = x - w / 2 + .1 + .12 * b
                        B.face([(xx, -.005, z - .2), (xx + .06, -.005, z - .2), (xx + .06, -.005, z - .9), (xx, -.005, z - .9)], '#f4e9cf')
            else:
                B.face([(x - w / 2, 0, z), (x + w / 2, 0, z), (x + w / 2, 0, z - h), (x - w / 2, 0, z - h)], c)
                if detail:
                    B.face([(x - w / 2, -.004, z - h + .08), (x + w / 2, -.004, z - h + .08), (x + w / 2, -.004, z - h + .14), (x - w / 2, -.004, z - h + .14)], '#f2f2ec')
        if detail:
            for t in (-1, 1):
                B.box(x + t * w * .4 - .012, x + t * w * .4 + .012, -.012, .012, z - .05, z + .04, ('#e8411f', '#2b6fb3', '#f2c418')[(k + t) % 3])
    bucket(B, .4, -.35, .17, .3, '#2f8b57', detail, True)
    if detail:
        bucket(B, -.3, -.4, .15, .26, '#c8352b', detail)
        B.box(-1.1, -.6, -.5, -.2, 0, .04, '#c4c7c8')                                  # washing basin
    B.mark('person', -.5, -.75, 0.0, pose='stand', face='+y')
    return B.finish('ns_camp_line' + ('' if detail else '_lod1'))


BUILDS = (stadium, field, flyover, tent_dome, tent_shack, camp_kitchen, camp_bed, camp_line)


def main():
    os.makedirs(H.OUT, exist_ok=True)
    made = []
    for i, fn in enumerate(BUILDS):
        for detail in (True, False):
            ob = fn(detail)
            H.export(ob, os.path.join(H.OUT, ob.name + '.glb'))
            ob.location = (i * 140, 0 if detail else 120, 0)
            made.append(ob.name)
    print('exported to', H.OUT, made)
    return made


if __name__ == '__main__':
    main()
