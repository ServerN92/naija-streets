"""Naija Streets: a new life from under the bridge. Made in the user's Blender (Documents/naija_rooms/life).

  ns_toilet       PUBLIC TOILET: a small painted block by the flyover camp, zinc roof, water tank, a blue drum, the
                  attendant's table and chair. The doorway stays open in the model; the door is its own piece:
  ns_toilet_door  the door leaf (hinge on its left edge), swung open by the game when somebody goes in or comes out
  ns_mytent       your tent under the bridge: an old orange tarpaulin ridge tent with patches, a foam mattress and a
                  Ghana-must-go bag inside, a chair, bucket, kettle and lantern outside
  ns_boutique     a bend-down boutique: big umbrella, a table of folded clothes, a rail of shirts and dresses, shoes on
                  a mat, a mirror and the seller's stool
  int_faceme      inside your rented room in a face-me-I-face-you house: foam mattress on the floor, clothes on nails,
                  a kerosene stove, standing fan, louvre window with burglar bars, the back door to the compound toilet
Each outside piece also has a lighter _lod1. Front is -Y (the game turns it to face the street).

In Blender: exec this file, then build_all() puts every piece in the scene and writes life/<name>.json (faces with a
colour per corner, and the marks) for the game's packer; int_faceme goes through rooms_all.py (light baked in).
"""
import sys, os, json, math
_here = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms', 'tools')
if _here not in sys.path: sys.path.insert(0, _here)
from blender_houses import *          # Builder, hexc, shade, cylinder, cylinder_x/y, loft, bpy, bmesh, math, os
import blender_houses as H
from blender_sports import (flat, poly, disc, seg, beam, path, fbox, panel, prism, frustum, circ, tarp, corrugated, bucket,
                            jerrycan, shirt, trousers, var, hf, TARP_BLUE)
from blender_sports import chair as mono_chair
import blender_venues as V

LIFE = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms', 'life')


# ================================================================ small helpers
def wedge_x(B, x0, x1, y0, y1, z0, zf, zb, c):
    """A side-wall top that follows a mono-pitch roof: from height z0 up to zf at y0 and zb at y1, thickness x0..x1."""
    for x, flip in ((x0, True), (x1, False)):
        pts = [(x, y0, z0), (x, y1, z0), (x, y1, zb), (x, y0, zf)]
        B.face(pts[::-1] if flip else pts, c)
    B.face([(x0, y0, zf), (x1, y0, zf), (x1, y1, zb), (x0, y1, zb)], c)


def two_tone(B, x0, x1, y0, y1, z0, z1, split, lo, hi):
    """A painted block wall: a darker colour below the line, a light one above, dirt near the ground."""
    if split > z0: B.box(x0, x1, y0, y1, z0, min(split, z1), lo, grime=True)
    if z1 > split: B.box(x0, x1, y0, y1, max(z0, split), z1, hi)


def hang_y(B, kind, x, y, z, w, h, c):
    """A shirt / trousers / dress hanging flat in an x-z plane at depth y (faces seen from -y)."""
    if kind == 's': shirt(B, x, z, w, h, c, y)
    elif kind == 't': trousers(B, x, z, w, h, c, y)
    else:   # a dress / gown: narrow top, wide skirt
        B.face([(x - w * .3, y, z - h * .35), (x + w * .3, y, z - h * .35), (x + w * .25, y, z - .03), (x - w * .25, y, z - .03)], c)
        B.face([(x - w * .55, y, z - h), (x + w * .55, y, z - h), (x + w * .3, y, z - h * .35), (x - w * .3, y, z - h * .35)], shade(c, .94))


def hang_x(B, kind, x, y, z, w, h, c, sgn=1):
    """The same in a y-z plane at x (on a side wall); sgn: +1 seen from +x."""
    tmp = Builder(True)
    hang_y(tmp, kind, 0, 0, z, w, h, c)
    for f in tmp.bm.faces:
        pts = [(x, y + sgn * v.co.x, v.co.z) for v in f.verts]
        cols = [l[tmp.col] for l in f.loops]
        vs = [B.bm.verts.new(p) for p in (pts if sgn > 0 else pts[::-1])]
        nf = B.bm.faces.new(vs)
        for l, cc in zip(nf.loops, cols if sgn > 0 else cols[::-1]): l[B.col] = cc
    tmp.bm.free()


def hanger(B, x, y, z, c='#2b2b2b'):
    beam(B, (x, y, z), (x, y, z + .06), .012, c)
    beam(B, (x - .17, y, z - .05), (x, y, z), .012, c); beam(B, (x + .17, y, z - .05), (x, y, z), .012, c)


def ghana_bag(B, cx, cy, z, a, b, h, rot=0.0, detail=True):
    """The checked Ghana-must-go bag (red, blue and white plaid)."""
    co, si = math.cos(rot), math.sin(rot)
    U, Vv, W = (co, si, 0), (-si, co, 0), (0, 0, 1)
    fbox(B, (cx, cy, z + h), U, Vv, W, a, b, h, '#b8423a')
    if detail:
        for k in range(4):   # blue bands round it and white stripes
            t = -a + (2 * a) * (k + .5) / 4
            fbox(B, (cx + co * t, cy + si * t, z + h), U, Vv, W, .018, b + .004, h + .004, '#2b4f8a')
        for k in range(3):
            zz = z + 2 * h * (k + 1) / 4
            fbox(B, (cx, cy, zz), U, Vv, W, a + .004, b + .004, .008, '#efe9dc')
        beam(B, (cx - co * a * .5, cy - si * a * .5, z + 2 * h + .01), (cx + co * a * .5, cy + si * a * .5, z + 2 * h + .01), .025, '#2a2a2a')


def kettle(B, x, y, c='#2e8b57', s=1.0):
    """A plastic buta (ablution kettle)."""
    frustum(B, circ(x, y, .09 * s, 8), 0, circ(x, y, .07 * s, 8), .2 * s, c)
    beam(B, (x + .06 * s, y, .06 * s), (x + .2 * s, y, .2 * s), .025 * s, c)
    beam(B, (x - .06 * s, y, .17 * s), (x - .11 * s, y, .1 * s), .02 * s, shade(c, .85))


def slippers(B, x, y, c):
    for t in (-.06, .06):
        B.box(x + t - .045, x + t + .045, y - .13, y + .13, 0, .025, c)
        B.box(x + t - .04, x + t + .04, y - .06, y - .03, .025, .045, shade(c, .8))


def louvres(B, side, p, a, z0, w, h, sgn, n=6, frame='#d8d3c8', glass='#56707a'):
    """A louvre window seen from the room side: frame, slanted glass blades, burglar-proof bars."""
    if side == 'x':
        lo, hi = sorted((p, p + sgn * .04))
        B.box(lo, hi, a - w / 2 - .05, a + w / 2 + .05, z0 - .05, z0, frame); B.box(lo, hi, a - w / 2 - .05, a + w / 2 + .05, z0 + h, z0 + h + .05, frame)
        B.box(lo, hi, a - w / 2 - .05, a - w / 2, z0, z0 + h, frame); B.box(lo, hi, a + w / 2, a + w / 2 + .05, z0, z0 + h, frame)
        for i in range(n):
            zb = z0 + h * (i + .5) / n
            B.face([(p + sgn * .01, a - w / 2, zb - h / n * .45), (p + sgn * .01, a + w / 2, zb - h / n * .45), (p + sgn * .035, a + w / 2, zb + h / n * .4), (p + sgn * .035, a - w / 2, zb + h / n * .4)][::sgn], glass)
        for k in range(5):
            yy = a - w / 2 + w * (k + .5) / 5
            B.box(min(p + sgn * .05, p + sgn * .07), max(p + sgn * .05, p + sgn * .07), yy - .008, yy + .008, z0, z0 + h, '#262626')
        for zz in (z0 + h * .33, z0 + h * .66):
            B.box(min(p + sgn * .05, p + sgn * .07), max(p + sgn * .05, p + sgn * .07), a - w / 2, a + w / 2, zz - .008, zz + .008, '#262626')


def umbrella(B, x, y, r, z, rise, cols, n=12, detail=True):
    beam(B, (x, y, 0), (x, y, z + rise + .08), .045, '#d8d8d4')
    apex = (x, y, z + rise)
    for i in range(n):
        a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
        p0 = (x + r * math.cos(a0), y + r * math.sin(a0), z); p1 = (x + r * math.cos(a1), y + r * math.sin(a1), z)
        B.face([p0, p1, apex], cols[i % len(cols)])
        B.face([apex, p1, p0], shade(cols[i % len(cols)], .7))                 # the underside, in its shade
        if detail:   # a short skirt round the edge
            B.face([p0, p1, (p1[0], p1[1], z - .12), (p0[0], p0[1], z - .12)][::-1], shade(cols[(i + 1) % len(cols)], .95))
    frustum(B, circ(x, y, .3, 8), 0, circ(x, y, .22, 8), .12, '#3a3a3a')       # weighted base


def standing_fan(B, x, y, detail=True):
    disc(B, x, y, .2, .01, '#e9e6df', 10); frustum(B, circ(x, y, .2, 10), 0, circ(x, y, .16, 10), .05, '#e9e6df')
    beam(B, (x, y, .05), (x, y, 1.15), .035, '#d8d4cb')
    fbox(B, (x, y + .06, 1.2), (1, 0, 0), (0, 1, 0), (0, 0, 1), .07, .1, .07, '#e9e6df')
    cy = y - .08; rr = .22
    ring = [(x + rr * math.cos(2 * math.pi * i / 14), cy, 1.22 + rr * math.sin(2 * math.pi * i / 14)) for i in range(15)]
    path(B, ring, .015, '#cfcac0')
    if detail:
        for i in range(8):
            a = 2 * math.pi * i / 8
            beam(B, (x, cy - .04, 1.22), (x + rr * math.cos(a), cy, 1.22 + rr * math.sin(a)), .008, '#cfcac0')
    for i in range(3):
        a = 2 * math.pi * i / 3 + .4
        B.face([(x, cy + .02, 1.22), (x + .19 * math.cos(a - .35), cy + .02, 1.22 + .19 * math.sin(a - .35)), (x + .19 * math.cos(a + .35), cy + .02, 1.22 + .19 * math.sin(a + .35))], '#7fb6d9')
    cylinder_y(B, x, cy - .02, cy + .04, 1.22, .045, '#e9e6df', 8)


def turn(B, ang):
    """Turn a whole piece (and its marks) about the vertical axis."""
    c, s_ = math.cos(ang), math.sin(ang)
    for v in B.bm.verts: v.co.x, v.co.y = v.co.x * c - v.co.y * s_, v.co.x * s_ + v.co.y * c
    DIRS = {'+x': (1, 0), '-x': (-1, 0), '+y': (0, 1), '-y': (0, -1)}
    for m in B.marks.values():
        m['x'], m['y'] = m['x'] * c - m['y'] * s_, m['x'] * s_ + m['y'] * c
        if m.get('face') in DIRS:
            dx, dy = DIRS[m['face']]; nx, ny = round(dx * c - dy * s_), round(dx * s_ + dy * c)
            m['face'] = next(k for k, d in DIRS.items() if d == (nx, ny))


def finish(B, name, detail):
    ob = B.finish(name + ('' if detail else '_lod1'))
    m = B.marks
    if m:
        try: ob['marks'] = json.dumps(m)
        except Exception: pass
    return ob


# ================================================================ the public toilet
BLUE = '#2f6ea8'; CREAM = '#ece6d6'; CONC = '#9a948a'


def toilet(detail):
    """PUBLIC TOILET: one cubicle, pay the attendant at the table, wait your turn if the door is shut."""
    B = Builder(detail, simple=True)
    x0, x1, y0, y1, t = -1.4, 1.4, -1.1, 1.1, .16
    zf, zb, s = 2.6, 2.3, 1.1                                                  # eave front, back; paint line
    zs = .12
    B.box(-1.85, 1.85, -2.05, 1.35, 0, zs, CONC)                                # slab
    if detail:
        for i in range(5):   # cracks and wet patches on the slab
            xx = -1.6 + 3.2 * hf(i, 1); yy = -1.9 + 2.9 * hf(i, 2)
            flat(B, xx, xx + .25 + .3 * hf(i, 3), yy, yy + .12 + .2 * hf(i, 4), zs + .002, '#7f7a71' if i % 2 else '#8a857c')
    dw, dh = .44, 2.05                                                           # half door width, door height
    # front wall with the doorway
    zt = zf - .04
    for (a, b) in ((x0, -dw), (dw, x1)):
        two_tone(B, a, b, y0, y0 + t, zs, zt, s, BLUE, CREAM)
    two_tone(B, -dw, dw, y0, y0 + t, dh, zt, s, BLUE, CREAM)
    for (a, b) in ((x0 - .005, -dw), (dw, x1 + .005)):
        B.box(a, b, y0 - .012, y0 + t, s - .03, s + .03, '#f4f2ec')            # white line on the paint join
    # back and sides (their tops follow the roof)
    two_tone(B, x0, x1, y1 - t, y1, zs, zb - .02, s, BLUE, CREAM)
    ry0, ry1 = y0 - .4, y1 + .25                                                # the roof sheet's front and back edges
    roof = lambda y: zf + .02 + (zb - zf) * (y - ry0) / (ry1 - ry0) - .03         # just under the sheet
    for (a, b) in ((x0, x0 + t), (x1 - t, x1)):
        two_tone(B, a, b, y0 + t, y1 - t, zs, zb, s, BLUE, CREAM)
        wedge_x(B, a, b, y0, y1, zb - .02, roof(y0), roof(y1), CREAM)
    B.box(x0 - .005, x0 + t, y0, y1, s - .03, s + .03, '#f4f2ec'); B.box(x1 - t, x1 + .005, y0, y1, s - .03, s + .03, '#f4f2ec')
    # door frame and step
    fr = '#e3ded2'
    B.box(-dw - .07, -dw, y0 - .03, y0 + t + .01, zs, dh + .07, fr); B.box(dw, dw + .07, y0 - .03, y0 + t + .01, zs, dh + .07, fr)
    B.box(-dw - .07, dw + .07, y0 - .03, y0 + t + .01, dh, dh + .07, fr)
    B.box(-.6, .6, y0 - .32, y0, zs, zs + .1, '#a39d93')
    # inside: tiles, a squat pan, a tap and a bucket (seen when the door opens)
    flat(B, x0 + t, x1 - t, y0 + t, y1 - t, zs + .005, '#8f8a80')
    if detail:
        for i in range(5):
            for j in range(4):
                if (i + j) % 2: flat(B, x0 + t + i * .5, x0 + t + i * .5 + .5, y0 + t + j * .48, y0 + t + j * .48 + .48, zs + .007, '#9c978d')
    for (a, b) in ((x0 + t, x0 + t + .005), (x1 - t - .005, x1 - t)):
        B.box(a, b, y0 + t, y1 - t, zs, 1.3, '#d9dcd6')                          # white tiles up to 1.3 m inside
    B.box(x0 + t, x1 - t, y1 - t - .005, y1 - t, zs, 1.3, '#d9dcd6')
    B.box(-.22, .22, .2, .75, zs, zs + .06, '#efefea'); flat(B, -.13, .13, .3, .62, zs + .062, '#c9ccc6')     # squat pan
    B.box(-.1, .1, y1 - t - .14, y1 - t, .85, 1.25, '#efefea')                   # cistern
    beam(B, (0, y1 - t - .07, .85), (0, .7, zs + .07), .03, '#d8d8d4')
    bucket(B, .75, .6, .15, .27, '#2f8b57', detail, True)
    kettle(B, .9, .15, '#d23a2a')
    if detail:
        cylinder(B, -.85, y1 - t - .05, 1.0, 1.05, .04, '#9aa0a3', 6)          # tap
        B.box(-1.1, -.8, y1 - t - .02, y1 - t, 1.5, 1.9, '#d4d7d2')            # a little shelf / soap
        B.box(-1.05, -.9, y1 - t - .08, y1 - t - .02, 1.5, 1.56, '#f2c21b')
    # a bulb inside and a vent high on the right side
    cylinder(B, 0, 0, zf - .35, zf - .25, .05, '#fff1c8', 8)
    if detail:
        for k in range(4):
            zz = 1.75 + k * .1
            B.box(x1 - .005, x1 + .03, -.35, .35, zz, zz + .05, '#b9bcbd')
        B.box(x1 - .005, x1 + .035, -.4, .4, 1.7, 1.72, fr); B.box(x1 - .005, x1 + .035, -.4, .4, 2.15, 2.17, fr)
    # zinc roof, sloping to the back, and a fascia board
    corrugated(B, x0 - .25, x1 + .25, ry0, ry1, zf + .02, zb + .02, '#9a9a95', .15 if detail else .6, '#86593b', 3)
    B.box(x0 - .25, x1 + .25, ry0 - .03, ry0 + .01, zf - .16, zf + .005, '#e3ded2')
    under = [(x0 - .25, ry0, zf - .005), (x1 + .25, ry0, zf - .005), (x1 + .25, ry1, zb - .005), (x0 - .25, ry1, zb - .005)]
    B.face(under[::-1], '#6e6a63')                                               # the roof's underside (seen from below)
    # the sign over the door and the price on the wall (words drawn by the game)
    B.box(-1.15, 1.15, y0 - .06, y0, 2.12, 2.52, '#1d3f73')
    B.mark('sign_name', 0, y0 - .065, 2.32, text='PUBLIC TOILET', w=2.2, h=.36, face='-y')
    B.box(-1.32, -.62, y0 - .03, y0, 1.25, 1.8, '#f4f2ec')
    B.mark('sign_price', -.97, y0 - .035, 1.525, text='TOILET  ₦50\nBATH  ₦100', w=.66, h=.5, face='-y')
    # water: a black tank on a stand by the right wall, a pipe into the roof
    tx, ty = x1 + .55, .35
    for (dx, dy) in ((-.35, -.35), (.35, -.35), (-.35, .35), (.35, .35)):
        beam(B, (tx + dx, ty + dy, zs), (tx + dx * .9, ty + dy * .9, 1.25), .05, '#5a5f62')
    B.box(tx - .4, tx + .4, ty - .4, ty + .4, 1.25, 1.3, '#5a5f62')
    cylinder(B, tx, ty, 1.3, 2.15, .38, '#1e2021', 14 if detail else 8)
    if detail:
        for zz in (1.5, 1.75, 2.0): cylinder(B, tx, ty, zz, zz + .03, .385, '#2a2c2e', 14)
        cylinder(B, tx, ty, 2.15, 2.22, .14, '#2a2c2e', 8)
    beam(B, (tx - .3, ty, 1.4), (x1 + .02, ty, 1.4), .04, '#d8d8d4')
    # by the door: the blue drum, a kettle, slippers
    cylinder(B, 1.0, -1.65, zs, zs + .88, .29, '#2f5fa8', 12 if detail else 8)
    if detail:
        for zz in (.4, .7): cylinder(B, 1.0, -1.65, zs + zz, zs + zz + .03, .295, '#244c88', 12)
        disc(B, 1.0, -1.65, .26, zs + .885, '#244c88', 12)
        frustum(B, circ(1.0, -1.65, .1, 8), zs + .885, circ(1.0, -1.65, .1, 8), zs + .93, '#d23a2a')
        kettle(B, .55, -1.75, '#2e8b57')
        slippers(B, -.55, -1.85, '#2b6fb3')
    # the attendant: a white plastic table with the coin bowl and tissue, a chair
    tx0, tx1, ty0, ty1 = -1.75, -1.1, -1.95, -1.5
    for (x, y) in ((tx0 + .04, ty0 + .04), (tx1 - .04, ty0 + .04), (tx0 + .04, ty1 - .04), (tx1 - .04, ty1 - .04)):
        beam(B, (x, y, zs), (x, y, .74), .035, '#e9e9e4')
    B.box(tx0, tx1, ty0, ty1, .72, .76, '#f1f1ec')
    disc(B, -1.55, -1.72, .1, .765, '#c4c7c8', 10); disc(B, -1.55, -1.72, .08, .78, '#c9a25a', 8)          # coins
    for k in range(3 if detail else 1):
        cylinder(B, -1.27, -1.62 - k * .1, .76, .86, .045, '#fafaf6', 8)                                       # tissue rolls
    mono_chair(B, -1.42, -1.2, 0, '#e9e9e4' if detail else '#e0e0da')
    B.mark('seat', -1.42, -1.2, zs, face='-y')
    B.mark('door', 0, y0 - .55, zs, face='+y')                                   # stand here to go in (facing the door)
    B.mark('wait', .95, y0 - 1.35, zs, face='-x')                                # the next one waits here
    B.mark('inside', 0, .2, zs)
    B.mark('hinge', -dw, y0 + .02, zs)                                           # the door leaf hangs here (ns_toilet_door)
    return finish(B, 'ns_toilet', detail)


def toilet_door(detail):
    """The toilet's door leaf: blue painted planks, a latch, a hasp; hinge at x = 0, opens outward (toward -y)."""
    B = Builder(detail, simple=True)
    w, h, zs = .86, 1.93, .02
    B.box(0, w, -.02, .02, zs, zs + h, '#24578f')
    if detail:
        for k in range(1, 5):   # plank joints
            x = w * k / 5
            B.box(x - .004, x + .004, -.024, .024, zs, zs + h, '#1b4572')
        for zz in (.35, 1.0, 1.65):   # battens on the inside
            B.box(.04, w - .04, .02, .045, zs + zz - .05, zs + zz + .05, '#1f4c7d')
        B.box(.04, .1, -.03, -.02, zs + .25, zs + .4, '#3a3a3a'); B.box(.04, .1, -.03, -.02, zs + 1.55, zs + 1.7, '#3a3a3a')   # hinges
    B.box(w - .16, w - .06, -.05, -.02, zs + .95, zs + 1.0, '#c9c9c4')        # latch
    B.box(.18, w - .18, -.024, -.02, zs + 1.45, zs + 1.75, '#f2f2ec')         # a painted board (WC)
    return finish(B, 'ns_toilet_door', detail)


# ================================================================ your tent
ORANGE = '#d9782b'


def mytent(detail):
    """An old ridge tent of orange tarpaulin over poles, patched with blue tarp and a sack; flap rolled up."""
    B = Builder(detail, simple=True)
    L, Wd, Hh = 1.15, .98, 1.42                                                   # half length (x), half width (y), ridge
    flat(B, -L - .15, L + .15, -Wd - .1, Wd + .1, .008, '#56534c')               # ground sheet
    # inside: a foam mattress, a wrapper over it, pillow and the bag
    B.box(-L + .25, L - .1, -.5, .6, .01, .14, '#d9bd6a')
    flat(B, -L + .25, .55, -.45, .6, .142, '#2e6b8a')
    if detail:
        for k in range(5): flat(B, -L + .25 + .3 * k, -L + .25 + .3 * k + .13, -.45, .6, .144, '#e2a32a' if k % 2 else '#c0392b')
    fbox(B, (.78, .05, .2), (1, 0, 0), (0, 1, 0), (0, 0, 1), .14, .3, .06, '#e6e2d6')
    ghana_bag(B, -.62, .45, .01, .22, .16, .15, .1, detail)
    # the two roof sides, sagging a little, and the closed back
    nu = 4 if detail else 2
    tarp(B, (-L, 0, Hh), (L, 0, Hh), (L + .05, -Wd, .02), (-L - .05, -Wd, .02), ORANGE, nu, .035, 11)
    tarp(B, (L, 0, Hh), (-L, 0, Hh), (-L - .05, Wd, .02), (L + .05, Wd, .02), shade(ORANGE, .9), nu, .035, 12)
    B.face([(L + .02, 0, Hh), (L + .05, -Wd, .02), (L + .05, Wd, .02)][::-1], shade(ORANGE, .82))            # back end (+x)
    B.face([(L + .02, 0, Hh), (L + .05, -Wd, .02), (L + .05, Wd, .02)], shade(ORANGE, .7))
    # front end (-x): the door; one flap tied up, the other hanging
    fx = -L - .03
    B.face([(fx, 0, Hh), (fx, -Wd * .2, Hh * .8), (fx, -Wd, .02), (fx, -Wd * .55, .02)], shade(ORANGE, .85))   # hanging flap
    B.face([(fx, 0, Hh), (fx, -Wd * .55, .02), (fx, -Wd, .02), (fx, -Wd * .2, Hh * .8)], shade(ORANGE, .7))
    B.face([(fx + .02, 0, Hh), (fx + .02, Wd * .75, .3), (fx + .02, Wd, .02), (fx + .02, Wd * .6, .55)], shade(ORANGE, .8))   # rolled side
    if detail:
        beam(B, (fx - .04, Wd * .12, Hh * .86), (fx - .04, Wd * .82, .3), .09, shade(ORANGE, .78))             # the rolled-up flap
        beam(B, (fx - .09, Wd * .45, Hh * .62), (fx - .09, Wd * .55, Hh * .2), .015, '#d9c9a0')
    # patches: a blue tarp square, a sack, tape
    def patch_on(side, u0, u1, v0, v1, c):
        yS = -1 if side < 0 else 1
        P = lambda u, v: (u, yS * Wd * v, Hh * (1 - v) + .02 * v)
        q = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)]
        q = [(p[0], p[1] + yS * .025, p[2] + .01) for p in q]
        B.face(q if side < 0 else q[::-1], c)
    patch_on(-1, -.3, .35, .35, .7, TARP_BLUE)
    patch_on(1, .1, .7, .25, .55, '#c9b07a')
    if detail:
        patch_on(-1, .6, .9, .12, .3, '#8a8f8a'); patch_on(-1, -.9, -.6, .6, .85, '#c9b07a')
        patch_on(1, -.7, -.35, .5, .8, TARP_BLUE)
    # poles, ridge rope to pegs, stones on the skirt
    for x in (-L - .03, L + .03):
        beam(B, (x, 0, 0), (x, 0, Hh + .12), .04, '#6a4e33')
    for (p, q) in (((L + .03, 0, Hh + .1), (L + .55, 0, 0)),):
        beam(B, p, q, .012, '#d9c9a0'); B.box(q[0] - .02, q[0] + .02, -.02, .02, 0, .1, '#a0a4a6')
    if detail:
        for k in range(8):
            x = -L + 2 * L * (k + .5) / 8
            for yS in (-1, 1):
                B.box(x - .07, x + .06, yS * (Wd + .02) - .06, yS * (Wd + .02) + .06, 0, .08 + .03 * hf(k, yS), var('#7c776e', k, yS))
    # outside the door: cardboard, a mat, the plastic chair, bucket, kettle, slippers, a lantern on a stick
    for i, (x, y, w, d, c) in enumerate(((-L - 1.15, -.55, .9, .55, '#b38e5d'), (-L - 1.0, .05, .8, .5, '#a8845a'))):
        B.box(x, x + w, y, y + d, 0, .01 + .004 * i, c)
    flat(B, -L - .95, -L - .2, -.35, .3, .02, '#b9a46a')
    if detail:
        for k in range(5): flat(B, -L - .95 + .15 * k, -L - .95 + .15 * k + .07, -.35, .3, .022, '#8a2f2a' if k % 2 else '#2e5f8a')
    mono_chair(B, -L - .55, -1.3, -1.2, '#e8e8e2' if detail else '#e0e0da')
    bucket(B, -L - .3, .8, .16, .28, '#c8352b', detail, True)
    kettle(B, -L - .55, .75, '#2e8b57')
    if detail:
        slippers(B, -L - .3, -.15, '#d23a2a')
        beam(B, (-L - 1.4, .75, 0), (-L - 1.4, .75, 1.5), .035, '#6a4e33')
        beam(B, (-L - 1.4, .75, 1.5), (-L - 1.25, .75, 1.5), .02, '#6a4e33')
        frustum(B, circ(-L - 1.25, .75, .06, 8), 1.2, circ(-L - 1.25, .75, .05, 8), 1.4, '#ffd27a')              # the lantern's glass
        disc(B, -L - 1.25, .75, .07, 1.2, '#3a3a3a', 8); disc(B, -L - 1.25, .75, .06, 1.405, '#3a3a3a', 8)
        beam(B, (-L - 1.25, .75, 1.405), (-L - 1.25, .75, 1.48), .012, '#3a3a3a')
    B.mark('door', -L - .7, 0, 0, face='+x')                                     # stand here, facing the tent's door
    B.mark('sit', -L - .55, -1.3, 0, face='-x')
    B.mark('lamp', -L - 1.25, .75, 1.3)
    turn(B, math.pi / 2)                                                         # built with its door at -x: turn it to the front (-y)
    return finish(B, 'ns_mytent', detail)


# ================================================================ the clothes stall
def boutique(detail):
    """Bend-down boutique: second-hand and new clothes under a big umbrella."""
    B = Builder(detail, simple=True)
    flat(B, -1.7, 1.7, -1.3, 1.2, .006, '#6e6a62')                               # swept ground
    umbrella(B, 0, .1, 1.6, 2.4, .45, ['#d23a2a', '#f2f2ec', '#2e8b57', '#f2c21b'], 12 if detail else 8, detail)
    # the table of folded clothes
    tx0, tx1, ty0, ty1, th = -.95, .95, -.6, .1, .74
    for x in (tx0 + .05, tx1 - .09):
        for y in (ty0 + .05, ty1 - .09):
            B.box(x, x + .05, y, y + .05, 0, th - .04, '#5f4630')
    B.box(tx0, tx1, ty0, ty1, th - .04, th, '#8a6a4a')
    piles = ['#c0392b', '#2b4f8a', '#f2f2ec', '#2e8b57', '#e2a32a', '#6a3591', '#1d1d20', '#d97aa0', '#3b5a86']
    for i in range(6 if detail else 3):
        cx = tx0 + .2 + (tx1 - tx0 - .4) * (i + .5) / (6 if detail else 3); cy = ty0 + .2 + .25 * (i % 2)
        for k in range(4 if detail else 2):
            c = piles[(i * 3 + k) % len(piles)]
            B.box(cx - .13, cx + .13, cy - .1, cy + .1, th + k * .045, th + (k + 1) * .045 - .004, c)
    if detail:   # a basket of bend-down select, a heap
        frustum(B, circ(.6, -.35, .18, 10), th, circ(.6, -.35, .24, 10), th + .2, '#b38e5d', top=False)
        for k in range(5): B.box(.5 + .04 * k, .62 + .04 * k, -.42, -.3, th + .14 + .02 * k, th + .19 + .02 * k, piles[k])
    # the rail behind with hangers
    ry, rz = .75, 1.72
    for x in (-1.3, 1.3):
        beam(B, (x, ry, 0), (x, ry, rz + .05), .04, '#8e9497')
        beam(B, (x, ry - .2, 0), (x, ry + .2, 0), .04, '#8e9497')
    beam(B, (-1.3, ry, rz), (1.3, ry, rz), .03, '#8e9497')
    items = [('s', '#f2f2ec', .5, .7), ('d', '#c0392b', .7, 1.15), ('s', '#2b4f8a', .5, .72), ('t', '#3b5a86', .42, .95), ('d', '#e2a32a', .66, 1.1),
             ('s', '#1d1d20', .5, .7), ('d', '#2e8b57', .66, 1.12), ('s', '#d97aa0', .48, .68), ('t', '#a99068', .42, .92)]
    if not detail: items = items[::2]
    for k, (kind, c, w, h) in enumerate(items):
        x = -1.1 + 2.2 * (k + .5) / len(items)
        hanger(B, x, ry - .01, rz - .06)
        hang_y(B, kind, x, ry - .015 - .004 * (k % 2), rz - .1, w * .85, h, c)
    # shoes and slippers on a mat in front
    flat(B, -1.25, -.15, -1.15, -.75, .012, '#2f3a4a')
    if detail:
        for k in range(4):
            x = -1.15 + .27 * k
            c = ['#1d1d20', '#7a4b2a', '#f2f2ec', '#c0392b'][k]
            for t in (-.05, .05): B.box(x + t - .04, x + t + .04, -1.05, -.83, .012, .07, c)
    # a standing mirror and the seller's stool, the board
    beam(B, (1.35, -.3, 0), (1.35, -.3, 1.6), .03, '#5f4630')
    B.box(1.33, 1.37, -.55, -.05, .6, 1.6, '#5f4630'); B.box(1.32, 1.33, -.52, -.08, .63, 1.57, '#b9d2dc')
    for (dx, dy) in ((-.12, -.12), (.12, -.12), (-.12, .12), (.12, .12)):
        beam(B, (.0 + dx, .45 + dy, 0), (.0 + dx * .7, .45 + dy * .7, .42), .03, '#5f4630')
    disc(B, 0, .45, .17, .43, '#8a6a4a', 10)
    # A-frame board by the road with the name (drawn by the game)
    bx, by = -1.45, -1.05
    beam(B, (bx - .3, by - .15, 0), (bx - .3, by, 1.1), .03, '#5f4630'); beam(B, (bx + .3, by - .15, 0), (bx + .3, by, 1.1), .03, '#5f4630')
    beam(B, (bx - .3, by + .2, 0), (bx - .3, by, 1.1), .03, '#5f4630'); beam(B, (bx + .3, by + .2, 0), (bx + .3, by, 1.1), .03, '#5f4630')
    B.box(bx - .36, bx + .36, by - .1, by - .07, .45, 1.08, '#f2f2ec')
    B.mark('sign_name', bx, by - .105, .765, text='BEND-DOWN\nBOUTIQUE', w=.68, h=.6, face='-y')
    B.mark('seller', 0, .45, 0, face='-y')
    B.mark('buy', 0, -1.05, 0, face='+y')
    return finish(B, 'ns_boutique', detail)


# ================================================================ inside your rented room
def int_faceme(detail=True):
    """One room in a face-me-I-face-you house: what N3,000 a day gets you."""
    B = Builder(True)
    x0, x1, y0, y1, h = -1.9, 1.9, -2.1, 2.1, 2.85
    WALLC, LOW, CEIL = '#d3dcbd', '#a6b491', '#ece8df'
    V.room_shell(B, x0, x1, y0, y1, h, WALLC, '#8a857b', CEIL, t=.2, skirt='#6f6a62', tile=.6)
    # a darker band of paint up to 1 m (the hands and the mop reach there), grime, a crack
    for (side, p, a0, a1, sgn) in (('y', y0, x0, x1, 1), ('y', y1, x0, x1, -1), ('x', x0, y0, y1, 1), ('x', x1, y0, y1, -1)):
        lo, hi = sorted((p, p + sgn * .006))
        if side == 'y': B.box(a0, a1, lo, hi, .1, 1.0, LOW)
        else: B.box(lo, hi, a0, a1, .1, 1.0, LOW)
    for k in range(7):
        a = -1.6 + 3.2 * hf(k, 7)
        V.stroke(B, 'y', y1 - .008, a, 1.6 + .6 * hf(k, 8), .25 + .3 * hf(k, 9), 1.2 + .8 * hf(k, 1), shade(WALLC, .82), .02)
    V.stroke(B, 'x', x1 - .008, -1.3, 2.2, .7, -.9, '#8d977e', .012)
    # the door you came in by (front wall, left) and the back door to the compound (back wall, right)
    dx0, dx1 = x0 + .45, x0 + 1.3
    B.box(dx0, dx1, y0, y0 + .04, 0, 2.05, '#6b4a2e')
    V.door_frame(B, 'y', y0 + .04, dx0, dx1, 2.05, 1, '#d8d2c4', .06)
    for zz in (.5, 1.0, 1.5): B.box(dx0 + .08, dx1 - .08, y0 + .04, y0 + .055, zz, zz + .32, '#5d3f26')
    B.box(dx1 - .12, dx1 - .06, y0 + .04, y0 + .08, 1.0, 1.06, '#c9a25a')
    bx0, bx1 = x1 - 1.05, x1 - .35
    B.box(bx0, bx1, y1 - .04, y1, 0, 2.0, '#4f6a7a')
    V.door_frame(B, 'y', y1 - .04, bx0, bx1, 2.0, -1, '#d8d2c4', .06)
    for zz in (.3, .9, 1.5): B.box(bx0 + .05, bx1 - .05, y1 - .055, y1 - .04, zz, zz + .04, '#3f5866')
    B.box(bx0 + .06, bx0 + .12, y1 - .08, y1 - .04, .95, 1.01, '#9aa0a3')
    # the louvre window on the right wall, a flowered curtain pulled to one side
    louvres(B, 'x', x1, 0, 1.0, 1.0, 1.0, -1)
    for k in range(5):
        yy = .2 + k * .1
        c = ['#c0392b', '#f2c21b', '#c0392b', '#2e8b57', '#c0392b'][k]
        B.box(x1 - .09, x1 - .07, yy, yy + .1, .85, 2.1, c)
    beam(B, (x1 - .08, -.65, 2.13), (x1 - .08, .7, 2.13), .02, '#8e9497')
    # the floor: a worn linoleum over the cement
    for i in range(7):
        for j in range(8):
            if hf(i, j, 3) < .12: continue   # worn through
            c = '#7a4b3a' if (i + j) % 2 else '#a8724f'
            flat(B, -1.4 + i * .4, -1.4 + i * .4 + .4, -1.75 + j * .45, -1.75 + j * .45 + .45, .004, var(c, i, j, amt=.06))
    # the foam mattress on the floor (back left), a wrapper over it, a pillow, the bag
    mx0, mx1, my0, my1 = x0 + .08, x0 + 1.55, y1 - 1.6, y1 - .08
    B.box(mx0, mx1, my0, my1, 0, .18, '#d9bd6a')
    flat(B, mx0, mx1 - .25, my0, my1, .182, '#2e6b8a')
    for k in range(4): flat(B, mx0 + .3 * k + .05, mx0 + .3 * k + .17, my0, my1, .184, '#e2a32a' if k % 2 else '#c0392b')
    fbox(B, ((mx0 + mx1) / 2, my1 - .27, .23), (1, 0, 0), (0, 1, 0), (0, 0, 1), .45, .14, .05, '#e6e2d6')
    ghana_bag(B, mx1 - .3, my0 + .2, .18, .25, .16, .15, .2, True)
    # clothes on nails along the left wall, a mirror on the front wall
    for k, (kind, c, w, hh_) in enumerate((('s', '#f2f2ec', .45, .65), ('t', '#3b5a86', .38, .9), ('s', '#2e8b57', .45, .62), ('s', '#1d1d20', .45, .65))):
        y = y0 + .55 + k * .4
        B.box(x0 + .005, x0 + .05, y - .01, y + .01, 1.86, 1.88, '#3a3a3a')
        hang_x(B, kind, x0 + .03 + .004 * k, y, 1.84, w * .8, hh_, c, 1)
    V.picture(B, 'y', y0, .5, 1.55, .38, .55, '#b9d2dc', 1, '#7a5a3a')
    # posters on the back wall: a football team, a calendar
    V.picture(B, 'y', y1, -1.1, 1.75, .75, .5, '#2f9a4a', -1, '#d8d2c4')
    B.box(-1.4, -.8, y1 - .045, y1 - .035, 1.85, 1.92, '#f2f2ec')
    V.picture(B, 'y', y1, -.05, 1.7, .4, .55, '#f2f2ec', -1, '#c0392b')
    for r_ in range(4):
        for c_ in range(5): B.box(-.21 + c_ * .07, -.18 + c_ * .07, y1 - .041, y1 - .036, 1.48 + r_ * .07, 1.51 + r_ * .07, '#9a9a95')
    # cooking corner (front right): a plastic table, the kerosene stove, a pot, plates, a gallon of oil
    tx0, tx1, ty0, ty1 = x1 - .64, x1 - .02, y0 + .08, y0 + .75
    for (x, y) in ((tx0 + .04, ty0 + .04), (tx1 - .04, ty0 + .04), (tx0 + .04, ty1 - .04), (tx1 - .04, ty1 - .04)):
        beam(B, (x, y, 0), (x, y, .7), .035, '#e9e9e4')
    B.box(tx0, tx1, ty0, ty1, .68, .72, '#f1f1ec')
    sx, sy = tx0 + .3, ty0 + .32
    cylinder(B, sx, sy, .72, .9, .14, '#2a5d9a', 10)
    for i in range(3):
        a = 2 * math.pi * i / 3
        B.box(sx + .11 * math.cos(a) - .012, sx + .11 * math.cos(a) + .012, sy + .11 * math.sin(a) - .012, sy + .11 * math.sin(a) + .012, .9, .97, '#333')
    cylinder(B, sx, sy, .97, 1.12, .13, '#b9bcbd', 10)
    for k in range(3): disc(B, tx1 - .14, ty1 - .14, .09, .725 + .012 * k, '#f2f2ec' if k % 2 else '#2f6fb0', 10)
    jerrycan(B, x1 - .25, ty1 + .22, .3, True, '#e5b417')
    # bucket and cup by the back door, a broom, slippers, a stool with a small radio, the standing fan
    bucket(B, bx0 - .35, y1 - .35, .18, .32, '#2f6fb0', True, True)
    cylinder(B, bx0 - .1, y1 - .28, 0, .12, .05, '#d23a2a', 8)
    beam(B, (x0 + .1, y0 + .1, 0), (x0 + .2, y0 + .18, 1.1), .03, '#b38e5d')
    for k in range(6): beam(B, (x0 + .1 + .02 * k - .05, y0 + .1, .02), (x0 + .1, y0 + .11, .35), .012, '#c9b07a')
    slippers(B, -.75, y0 + .55, '#d23a2a')
    rx, ry_ = .35, my0 + .25
    for (ddx, ddy) in ((-.14, -.14), (.14, -.14), (-.14, .14), (.14, .14)):
        beam(B, (rx + ddx, ry_ + ddy, 0), (rx + ddx * .8, ry_ + ddy * .8, .42), .03, '#e9e9e4')
    disc(B, rx, ry_, .2, .43, '#e9e9e4', 10)
    B.box(rx - .13, rx + .15, ry_ - .08, ry_ + .08, .43, .6, '#2a2a2a'); B.box(rx - .1, rx + .12, ry_ - .085, ry_ - .08, .47, .56, '#5a5a5a')
    standing_fan(B, x1 - .32, .95, True)
    # the bulb on its wire
    beam(B, (0, 0, h), (0, 0, h - .3), .01, '#1a1a1a')
    cylinder(B, 0, 0, h - .36, h - .3, .03, '#d8d8d4', 6)
    cylinder(B, 0, 0, h - .46, h - .36, .05, '#fff4d0', 8)
    B.mark('light_1', 0, 0, h - .4, color='#ffd9a0', power=30, range=8)
    dc = (dx0 + dx1) / 2
    B.mark('spawn', dc + .2, y0 + .9, 0, face='+y')
    B.mark('exit', dc, y0 + .42, 0, face='-y')
    B.mark('bed', (mx0 + mx1) / 2, my0 - .35, 0, face='+y')
    B.mark('ward', x0 + .5, -.95, 0, face='-x')
    B.mark('stove', tx0 - .35, sy, 0, face='+x')
    B.mark('yard', (bx0 + bx1) / 2, y1 - .42, 0, face='+y')
    B.mark('radio', rx, ry_ - .45, 0, face='+y')
    return B.finish('int_faceme')


# ================================================================ in Blender: build, look, write for the game
OUTSIDE = (toilet, toilet_door, mytent, boutique)


def faces_of(ob):
    """Every face as (corner points, corner colours as written), and the marks: what the game's packer needs."""
    me = ob.data
    ca = me.color_attributes.get('Col') or me.color_attributes[0]
    byte = ca.data_type == 'BYTE_COLOR'
    out = []
    for p in me.polygons:
        pts = [tuple(round(c, 5) for c in me.vertices[me.loops[li].vertex_index].co) for li in p.loop_indices]
        cols = [tuple(round(c, 4) for c in (ca.data[li].color_srgb if byte else ca.data[li].color)[:3]) for li in p.loop_indices]
        out.append([pts, cols])
    mk = ob.get('marks')
    return out, (json.loads(mk) if isinstance(mk, str) else dict(mk or {}))


def build_all(only=None):
    os.makedirs(LIFE, exist_ok=True)
    made = []
    for i, fn in enumerate(OUTSIDE):
        for detail in (True, False):
            name = fn.__name__
            if only and name not in only: continue
            ob = fn(detail)
            ob.location = (i * 6, 0 if detail else 6, 0)
            faces, marks = faces_of(ob)
            json.dump({'name': ob.name, 'faces': faces, 'marks': marks}, open(os.path.join(LIFE, ob.name + '.json'), 'w'))
            made.append((ob.name, len(faces)))
    return made
