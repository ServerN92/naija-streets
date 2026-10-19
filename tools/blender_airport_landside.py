"""Naija Streets: the airport's landside, made in the user's Blender (run in a background Blender by
tools/blender_rooms/life_job.py, job 'airport'): what you meet on the road to Murtala Muhammed Airport.

  ns_airtoll      the toll plaza across the airport road (on the road's own asphalt): two inbound lanes with booths (pay N300),
                  two exit lanes, islands with chevrons and bollards, a green canopy with the toll board, a walkway for
                  people on foot (free) and the airport security post
  ns_airtoll_arm  one barrier arm (red and white), pivot at its origin; the game lifts it when you have paid
  ns_bansign      the roadside board before the plaza: NO OKADA, NO KEKE beyond this point
  ns_carpark      the car park on both sides of the approach road: marked bays in rows, aisles, planted islands, lamp
                  posts, P boards, the footpath and zebra crossings to the terminal doors, the forecourt pavement
  ns_impound      the impound yard where airport security keeps seized okadas and kekes: zinc fence, gate, the office

Front is -Y (toward the city); words on the boards are drawn by the game at the sign_ marks.
"""
import sys, os, json, math
_here = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms', 'tools')
if _here not in sys.path: sys.path.insert(0, _here)
from blender_houses import *          # Builder, hexc, shade, cylinder, cylinder_x/y, bpy, bmesh, math, os
from blender_sports import flat, poly, disc, beam, path, fbox, prism, frustum, circ, corrugated, var, hf
import blender_life as BL

ASPH = '#3b3d40'; LINE = '#ecebe6'; YEL = '#e8b923'; GREEN = '#16a06b'; CONC = '#a7a197'; KERB = '#c9c4ba'


def stripes_box(B, x0, x1, y0, y1, z0, z1, a, b, step=.4, along='x'):
    """A box painted in alternating bands (kerb noses, arms)."""
    L = (x1 - x0) if along == 'x' else (y1 - y0); n = max(1, int(round(L / step)))
    for i in range(n):
        if along == 'x': B.box(x0 + L * i / n, x0 + L * (i + 1) / n, y0, y1, z0, z1, a if i % 2 == 0 else b)
        else: B.box(x0, x1, y0 + L * i / n, y0 + L * (i + 1) / n, z0, z1, a if i % 2 == 0 else b)


def island(B, x0, x1, y0, y1, detail, nose=True):
    """A raised traffic island with a kerb, yellow-and-black nose at the front and bollards."""
    B.box(x0, x1, y0, y1, 0, .2, CONC)
    B.box(x0 - .04, x1 + .04, y0, y1, .2, .22, KERB)
    if nose:
        stripes_box(B, x0 - .05, x1 + .05, y0 - .9, y0, 0, .22, YEL, '#1d1d1f', .3)
        if detail:
            for k in range(2):
                bx = x0 + (x1 - x0) * (k + .5) / 2
                cylinder(B, bx, y0 - 1.3, 0, .9, .09, YEL, 8); cylinder(B, bx, y0 - 1.3, .62, .72, .095, '#1d1d1f', 8)


def booth(B, cx, y0, y1, detail, win_side=1):
    """A toll booth: white cabin with a green band, a window on the lane side, a little roof."""
    w = .55
    B.box(cx - w, cx + w, y0, y1, .2, 2.75, '#f2f2ee', grime=True)
    B.box(cx - w - .01, cx + w + .01, y0 - .01, y1 + .01, 1.0, 1.25, GREEN)
    wx = cx + win_side * (w + .005)
    B.box(min(wx, wx + win_side * .01), max(wx, wx + win_side * .01), y0 + .35, y1 - .5, 1.3, 2.3, '#2c4656')     # the window
    B.box(min(wx, wx + win_side * .25), max(wx, wx + win_side * .25), y0 + .5, y1 - .7, 1.15, 1.2, '#cfd2d4')      # cash tray
    B.box(cx - w - .12, cx + w + .12, y0 - .12, y1 + .12, 2.75, 2.9, '#e3e0d8')
    if detail:
        B.box(cx - .35, cx + .35, y1 + .005, y1 + .02, .25, 2.2, '#5a6a72')                                          # back door
        B.box(cx - .3, cx + .3, y0 - .02, y0 - .005, 2.35, 2.65, '#c0392b')                                           # a red lamp board at the front


def toll(detail):
    B = Builder(detail, simple=True)
    y0, y1 = -24.0, 18.0
    # (the asphalt under the plaza is the airport road's own, tools/blender_airroad.py: its median runs up to the centre island)
    lanes_in = ((.6, 4.0), (5.2, 8.6)); lanes_out = ((-8.6, -5.0), (-3.8, -.6))
    # lane lines leading in, the yellow centre line, stop lines at the barriers
    for xx in (-8.6, -5.0, -3.8, 4.0, 5.2, 8.6):
        for k in range(8):
            ya = y0 + 1 + k * 2.2
            flat(B, xx - .06, xx + .06, ya, ya + 1.2, .048, LINE)
    for (a, b) in lanes_in:
        flat(B, a, b, 1.15, 1.45, .048, LINE)
        for (yy) in (-16, -19):                                                                    # speed bumps
            stripes_box(B, a, b, yy - .25, yy + .25, .045, .1, YEL, '#1d1d1f', .5)
    # islands: kerbs at both edges, the median, between the inbound lanes, between the exit lanes
    for (x0, x1, booth_on) in ((-9.8, -8.6, False), (-5.0, -3.8, False), (-.6, .6, True), (4.0, 5.2, True), (8.6, 9.8, False)):
        island(B, x0, x1, -9.0, 6.5, detail)
        if booth_on: booth(B, (x0 + x1) / 2, -2.4, .6, detail, 1)
    # the barrier posts (the arms are their own piece), on the islands at the inbound lanes
    for (a, b) in lanes_in:
        px = a - .2
        B.box(px - .17, px + .17, 1.13, 1.47, .2, 1.05, YEL); B.box(px - .19, px + .19, 1.11, 1.49, .95, 1.0, '#1d1d1f')
    # canopy: columns on the islands, a deep green roof slab with fascia boards front and back
    for cx in (-9.2, -4.4, 0, 4.6, 9.2):
        for cy in (-3.0, 3.0):
            B.box(cx - .22, cx + .22, cy - .22, cy + .22, .2, 5.7, '#d8d6d0')
    B.box(-11.5, 11.5, -5.2, 4.8, 5.7, 6.3, '#e9e7e1')
    B.box(-11.6, 11.6, -5.4, -5.2, 5.3, 6.6, GREEN); B.box(-11.6, 11.6, 4.8, 5.0, 5.3, 6.6, GREEN)
    B.box(-11.6, -11.4, -5.4, 5.0, 5.3, 6.6, GREEN); B.box(11.4, 11.6, -5.4, 5.0, 5.3, 6.6, GREEN)
    B.face([(-11.5, 4.8, 5.69), (11.5, 4.8, 5.69), (11.5, -5.2, 5.69), (-11.5, -5.2, 5.69)], '#c9c7c1')     # underside
    for (a, b) in lanes_in + lanes_out:                                                                     # light panels over the lanes
        B.face([((a + b) / 2 - .9, 2.5, 5.68), ((a + b) / 2 + .9, 2.5, 5.68), ((a + b) / 2 + .9, -3.5, 5.68), ((a + b) / 2 - .9, -3.5, 5.68)], '#fffbe8')
    B.box(-6.0, 6.0, -5.45, -5.42, 5.45, 6.45, '#0f5c3d')
    B.mark('sign_toll', 0, -5.46, 5.95, text='AIRPORT TOLL  ·  ₦300', w=11.6, h=.9, face='-y')
    B.box(-6.0, 6.0, 5.02, 5.05, 5.45, 6.45, '#0f5c3d')
    B.mark('sign_back', 0, 5.06, 5.95, text='THANK YOU  ·  SAFE JOURNEY', w=11.6, h=.9, face='+y')
    for (a, b), txt in zip(lanes_in + lanes_out, ('PAY ₦300', 'PAY ₦300', 'EXIT', 'EXIT')):              # lane boards on the front edge
        cx = (a + b) / 2
        B.box(cx - .9, cx + .9, -5.47, -5.44, 4.6, 5.2, '#1d1d1f')
        B.mark('sign_lane_%d' % int(round(cx * 10)), cx, -5.48, 4.9, text=txt, w=1.7, h=.5, face='-y')
    # the walkway for people on foot, beside the plaza: free
    B.box(9.8, 12.2, y0, y1, 0, .16, '#b7b1a6')
    if detail:
        for k in range(int((y1 - y0) / .9)):
            flat(B, 9.8, 12.2, y0 + k * .9, y0 + k * .9 + .04, .162, '#9f998e')
    B.box(9.8, 12.2, -9.2, -9.0, .16, 1.05, '#d8d6d0'); B.box(11.9, 12.2, -9.2, -3, .16, 1.05, '#d8d6d0')   # a low rail
    B.box(10.4, 11.6, -9.6, -9.25, 1.6, 2.1, '#1f6fb0'); beam(B, (11.0, -9.4, .16), (11.0, -9.4, 1.6), .06, '#9a9a95')
    B.mark('sign_walk', 11.0, -9.62, 1.85, text='PEDESTRIANS · FREE', w=1.15, h=.45, face='-y')
    # the airport security post
    hx0, hx1, hy0, hy1 = 12.8, 15.6, -5.0, -1.4
    B.box(hx0, hx1, hy0, hy1, 0, .15, CONC)
    B.box(hx0 + .1, hx1 - .1, hy0 + .1, hy1 - .1, .15, 2.7, '#3d4f63', grime=True)
    B.box(hx0, hx1, hy0, hy1, 2.7, 2.85, '#e9e7e1')
    B.box(hx0 + .4, hx1 - .4, hy0 + .095, hy0 + .1, 1.2, 2.1, '#2c4656')                                      # front window
    B.box(hx0 + .095, hx0 + .1, hy0 + .6, hy0 + 1.6, .15, 2.2, '#2a3440')                                     # door (on the walkway side)
    B.box(hx0 + .2, hx1 - .2, hy0 - .06, hy0 + .02, 2.25, 2.65, '#f2f2ee')
    B.mark('sign_sec', (hx0 + hx1) / 2, hy0 - .065, 2.45, text='AIRPORT SECURITY', w=2.3, h=.36, face='-y')
    if detail:
        B.box(hx0 + .3, hx1 - .3, hy0 - .9, hy0 - .5, .45, .5, '#7a5a3a')                                       # bench
        for bx in (hx0 + .4, hx1 - .4): B.box(bx - .04, bx + .04, hy0 - .85, hy0 - .55, 0, .45, '#5a4028')
        beam(B, (hx1 + .3, hy0, 0), (hx1 + .3, hy0, 7), .12, '#8e9497')                                        # floodlight
        B.box(hx1 - .1, hx1 + .7, hy0 - .2, hy0 + .2, 6.9, 7.2, '#3a3d40'); B.box(hx1 - .05, hx1 + .65, hy0 - .21, hy0 - .2, 6.95, 7.15, '#fff6d8')
    # where things happen
    B.mark('pay_a', 2.3, -1.0, .05, face='+y'); B.mark('pay_b', 6.9, -1.0, .05, face='+y')
    B.mark('arm_a', .4, 1.3, 1.0); B.mark('arm_b', 5.0, 1.3, 1.0)
    B.mark('guard_1', 0, -10.6, .05, face='-y'); B.mark('guard_2', 11.0, -6.5, .16, face='-x')
    B.mark('walk_in', 11.0, -12, .16, face='+y')
    return BL.finish(B, 'ns_airtoll', detail)


def toll_arm(detail):
    """One barrier arm: a drum at the pivot (origin), the red-and-white bar along +X, a counterweight behind."""
    B = Builder(detail, simple=True)
    cylinder_y(B, 0, -.1, .1, 0, .12, '#2a2c2e', 10)
    stripes_box(B, .12, 3.55, -.045, .045, -.05, .05, '#d23a2a', '#f4f2ec', .45)
    B.box(-.55, -.12, -.07, .07, -.09, .09, '#2a2c2e')
    if detail: B.box(3.45, 3.55, -.055, .055, -.12, .05, '#d23a2a')
    return BL.finish(B, 'ns_airtoll_arm', detail)


def ban_sign(detail):
    """NO OKADA · NO KEKE: a big roadside board on two posts with a red border and a no-entry ring."""
    B = Builder(detail, simple=True)
    for x in (-1.5, 1.5): beam(B, (x, 0, 0), (x, 0, 3.9), .1, '#8e9497')
    B.box(-1.9, 1.9, -.06, .03, 2.0, 3.9, '#c0392b')
    B.box(-1.8, 1.8, -.07, -.06, 2.1, 3.8, '#f4f2ec')
    cx, cz = -1.2, 2.95
    for i in range(16):   # a red ring with a bar: no entry
        a0, a1 = 2 * math.pi * i / 16, 2 * math.pi * (i + 1) / 16
        r0, r1 = .4, .52
        B.face([(cx + r1 * math.cos(a0), -.075, cz + r1 * math.sin(a0)), (cx + r1 * math.cos(a1), -.075, cz + r1 * math.sin(a1)),
                (cx + r0 * math.cos(a1), -.075, cz + r0 * math.sin(a1)), (cx + r0 * math.cos(a0), -.075, cz + r0 * math.sin(a0))], '#d23a2a')
    beam(B, (cx - .33, -.076, cz + .33), (cx + .33, -.076, cz - .33), .1, '#d23a2a')
    # a little motorbike inside the ring: two wheels and a body
    for wx in (-.17, .17):
        for i in range(10):
            a0, a1 = 2 * math.pi * i / 10, 2 * math.pi * (i + 1) / 10
            B.face([(cx + wx + .1 * math.cos(a0), -.074, cz - .1 + .1 * math.sin(a0)), (cx + wx + .1 * math.cos(a1), -.074, cz - .1 + .1 * math.sin(a1)),
                    (cx + wx + .06 * math.cos(a1), -.074, cz - .1 + .06 * math.sin(a1)), (cx + wx + .06 * math.cos(a0), -.074, cz - .1 + .06 * math.sin(a0))], '#1d1d1f')
    B.face([(cx - .16, -.074, cz - .05), (cx + .12, -.074, cz - .05), (cx + .05, -.074, cz + .08), (cx - .1, -.074, cz + .06)], '#1d1d1f')
    B.mark('sign_ban', .35, -.08, 3.1, text='NO OKADA · NO KEKE\nBEYOND THIS POINT', w=2.7, h=1.0, face='-y')
    B.mark('sign_ban2', 0, -.08, 2.3, text='Airport security will seize it', w=3.4, h=.32, face='-y')
    return BL.finish(B, 'ns_bansign', detail)


# ---------------------------------------------------------------- the car park
BAY = 2.6


def tree(B, x, y, detail, s=1.0):
    beam(B, (x, y, 0), (x, y, 2.2 * s), .14 * s, '#5f4630')
    for k in range(3 if detail else 1):
        r = (1.3 - .25 * k) * s; z = (2.0 + .55 * k) * s
        frustum(B, circ(x, y, r, 8), z, circ(x, y, r * .55, 8), z + .9 * s, var('#3f7d33', x, y, k, amt=.12))


def lamp(B, x, y, detail):
    beam(B, (x, y, 0), (x, y, 7.5), .14, '#9a9a95')
    for s in (-1, 1):
        beam(B, (x, y, 7.4), (x + s * 1.2, y, 7.7), .07, '#9a9a95')
        B.box(x + s * 1.2 - .3, x + s * 1.2 + .3, y - .14, y + .14, 7.55, 7.75, '#3a3d40')
        B.face([(x + s * 1.2 - .28, y - .12, 7.545), (x + s * 1.2 + .28, y - .12, 7.545), (x + s * 1.2 + .28, y + .12, 7.545), (x + s * 1.2 - .28, y + .12, 7.545)][::-1], '#fff6d8')


def carpark(detail):
    """Both blocks of the car park (x from 12 to 92 m out from the road's centre), rows of bays facing two aisles each."""
    B = Builder(detail, simple=True)
    Y = lambda lz: 19.0 - lz                    # lz: metres from the terminal side of the car park
    ROWS = ((3, 8.2, '+y'), (15.2, 20.4, '-y'), (20.4, 25.6, '+y'), (32.6, 37.8, '-y'))
    AISLES = ((8.2, 15.2), (25.6, 32.6))
    for side in (-1, 1):
        x_in, x_out = 12.0 * side, 92.0 * side
        xa, xb = sorted((x_in, x_out))
        flat(B, xa, xb, Y(38.5), Y(3), .04, '#46484b')                                                 # the asphalt
        for (a, b) in AISLES:                                                                            # (the road's own asphalt reaches the aisles)
            if detail:
                for k in range(3):
                    ax = x_in + side * (14 + k * 24)
                    poly(B, [(ax - side * .8, Y((a + b) / 2) + .25), (ax + side * .2, Y((a + b) / 2)), (ax - side * .8, Y((a + b) / 2) - .25)], .043, LINE)   # arrows
        # the footpath on the terminal side, and kerbs
        B.box(xa, xb, Y(3), Y(0), 0, .14, '#b3ada2')
        B.box(xa, xb, Y(3) - .15, Y(3), 0, .16, KERB)
        B.box(xa, xb, Y(38.5), Y(38.2), 0, .16, KERB)
        # rows of bays
        n = int((abs(x_out - x_in) - 6.0) // BAY)
        for r, (a, b, face) in enumerate(ROWS):
            x0 = x_in + side * 3.0
            for k in range(n + 1):
                lx = x0 + side * k * BAY
                flat(B, lx - .06, lx + .06, Y(b), Y(a), .043, LINE)
            if r in (1,):   # the shared back line of the back-to-back rows, with lamp posts on it
                flat(B, min(x0, x0 + side * n * BAY), max(x0, x0 + side * n * BAY), Y(20.4) - .06, Y(20.4) + .06, .043, LINE)
                for k in range(0, n, 8): lamp(B, x0 + side * (k + .5) * BAY, Y(20.4), detail)
            if r in (0, 3):
                yl = Y(a) if r == 0 else Y(b)
                flat(B, min(x0, x0 + side * n * BAY), max(x0, x0 + side * n * BAY), yl - .06, yl + .06, .043, LINE)
            B.mark('row_%s%d' % ('w' if side < 0 else 'e', r), x0 + side * BAY / 2, Y((a + b) / 2), .04, n=n, dx=side * BAY, face=face)
            # planted islands at both ends of each row pair
            for ex in (x_in + side * 1.5, x0 + side * (n * BAY + 1.5)):
                ea, eb = sorted((ex - 1.4, ex + 1.4))
                B.box(ea, eb, Y(b), Y(a), 0, .18, KERB); flat(B, ea + .12, eb - .12, Y(b) + .12, Y(a) - .12, .185, '#5d8a3e')
                if detail and r in (0, 2): tree(B, ex, Y((a + b) / 2), detail, .8)
        # P boards at the aisle entrances, and the big board at the corner
        for (a, b) in AISLES:
            px = x_in - side * .6; py = Y(a) + .6
            beam(B, (px, py, 0), (px, py, 2.6), .07, '#9a9a95'); B.box(px - .45, px + .45, py - .04, py + .04, 2.0, 2.9, '#1f5fb8')
            B.mark('sign_p_%s%d' % ('w' if side < 0 else 'e', int(a)), px, py - .05, 2.45, text='P', w=.8, h=.8, face='-y')
        bx = x_in + side * 3; by = Y(39.5)
        for d in (-1.3, 1.3): beam(B, (bx + d, by, 0), (bx + d, by, 3.2), .1, '#9a9a95')
        B.box(bx - 1.8, bx + 1.8, by - .05, by + .05, 2.0, 3.3, '#1f5fb8')
        B.mark('sign_cp_%s' % ('w' if side < 0 else 'e'), bx, by - .06, 2.65, text='CAR PARK\nFREE · TOLL PAID', w=3.4, h=1.15, face='-y')
    # the forecourt pavement in front of the terminal, and zebra crossings over the drop-off road to the side doors
    B.box(-110, 110, 35.0, 39.5, 0, .14, '#c2bcb0')
    B.box(-110, 110, 34.85, 35.0, 0, .16, KERB)
    for gx in (-60.0, 60.0):
        for k in range(15):
            yy = 19.4 + k * 1.05
            flat(B, gx - 2.2, gx + 2.2, yy, yy + .5, .05, '#f4f2ec')
        B.mark('zebra_%s' % ('w' if gx < 0 else 'e'), gx, 27.0, .05)
        for s in (-1, 1):   # posts with the crossing sign at both kerbs
            for yy in (18.6, 35.4):
                bx = gx + s * 2.8
                beam(B, (bx, yy, 0), (bx, yy, 2.6), .07, '#1d1d1f'); B.box(bx - .3, bx + .3, yy - .03, yy + .03, 2.1, 2.7, '#1f5fb8')
    return BL.finish(B, 'ns_carpark', detail)


# ---------------------------------------------------------------- the impound yard
def impound(detail):
    """A yard behind a zinc fence: gravel, a wide gate, the office by the gate, slots for seized okadas and kekes."""
    B = Builder(detail, simple=True)
    x0, x1, y0, y1, H = -12.0, 12.0, -8.0, 8.0, 2.3
    flat(B, x0, x1, y0, y1, .02, '#7d766b')
    if detail:
        for k in range(30):
            xx = x0 + 23 * hf(k, 1); yy = y0 + 15 * hf(k, 2)
            flat(B, xx, xx + .4 + .6 * hf(k, 3), yy, yy + .3 + .5 * hf(k, 4), .021, '#6c665c' if k % 2 else '#8a8377')
    ZC = ['#8d8f8c', '#7b6250', '#9a9a95', '#86593b']
    def zinc_run(xa, ya, xb, yb, k0):
        L = math.hypot(xb - xa, yb - ya); n = max(1, int(L / 1.2))
        for i in range(n):
            ax, ay = xa + (xb - xa) * i / n, ya + (yb - ya) * i / n
            bx, by = xa + (xb - xa) * (i + 1) / n, ya + (yb - ya) * (i + 1) / n
            c = var(ZC[(i + k0) % len(ZC)], i, k0, amt=.1)
            B.face([(ax, ay, 0), (bx, by, 0), (bx, by, H), (ax, ay, H)], c)
            B.face([(bx, by, 0), (ax, ay, 0), (ax, ay, H), (bx, by, H)], shade(c, .8))
        for i in range(n + 1):
            px, py = xa + (xb - xa) * i / n, ya + (yb - ya) * i / n
            beam(B, (px, py, 0), (px, py, H + .25), .08, '#5a4f45')
        if detail:
            for zz in (H + .1, H + .25): beam(B, (xa, ya, zz), (xb, yb, zz), .015, '#9a9a95')            # barbed wire
    gw = 3.6
    zinc_run(x0, y0, -gw, y0, 0); zinc_run(gw, y0, x1, y0, 1)
    zinc_run(x1, y0, x1, y1, 2); zinc_run(x1, y1, x0, y1, 3); zinc_run(x0, y1, x0, y0, 4)
    # the steel gate, rolled open along the inside of the fence
    B.box(-gw - 3.8, -gw - .2, y0 + .15, y0 + .25, .05, 2.0, '#4a5a66')
    for k in range(9): B.box(-gw - 3.7 + k * .42, -gw - 3.62 + k * .42, y0 + .14, y0 + .26, .05, 2.0, '#3a4652')
    B.box(-gw - .1, -gw + .1, y0 - .1, y0 + .1, 0, 2.6, '#3a4652'); B.box(gw - .1, gw + .1, y0 - .1, y0 + .1, 0, 2.6, '#3a4652')
    B.box(-gw - .1, gw + .1, y0 - .08, y0 + .08, 2.6, 3.4, '#f4f2ec')
    B.box(-gw - .1, gw + .1, y0 - .1, y0 - .08, 2.6, 3.4, '#1d1d1f')
    B.mark('sign_yard', 0, y0 - .11, 3.0, text='AIRPORT IMPOUND YARD', w=7.0, h=.7, face='-y')
    # the office outside, beside the gate
    ox0, ox1, oy0, oy1 = 4.8, 10.0, y0 - 3.6, y0 - .3
    B.box(ox0, ox1, oy0, oy1, 0, .15, CONC)
    B.box(ox0 + .1, ox1 - .1, oy0 + .1, oy1 - .1, .15, 2.7, '#e8e2d2', grime=True)
    B.box(ox0, ox1, oy0, oy1, 2.7, 2.85, '#8d8f8c')
    B.box(ox0 + .6, ox0 + 2.6, oy0 + .095, oy0 + .1, 1.0, 2.0, '#2c4656')                 # the pay window
    B.box(ox0 + .55, ox0 + 2.65, oy0 - .2, oy0 + .1, .95, 1.0, '#cfd2d4')
    B.box(ox1 - 1.6, ox1 - .7, oy0 + .095, oy0 + .1, .15, 2.2, '#5a3f2a')                 # door
    B.box(ox0 + .5, ox0 + 2.7, oy0 - .05, oy0 + .02, 2.15, 2.6, '#c0392b')
    B.mark('sign_pay', ox0 + 1.6, oy0 - .06, 2.375, text='PAY HERE', w=2.1, h=.4, face='-y')
    if detail:
        B.box(ox1 - .2, ox1 + .4, oy0 + .3, oy0 + 1.1, .15, .55, '#c8352b')                 # a red fire bucket stand
    # slots for the seized vehicles (the game parks them here)
    k = 0
    for row, yy in enumerate((1.6, 5.4)):
        for i in range(5):
            xx = -9.0 + i * 4.4
            flat(B, xx - 1.0, xx + 1.0, yy - 1.5, yy + 1.5, .025, '#8a8377')
            k += 1; B.mark('slot_%d' % k, xx, yy, .02, face='-y')
    B.mark('office', ox0 + 1.6, oy0 - 1.1, 0, face='+y')
    B.mark('out', 0, y0 - 2.4, 0, face='-y')
    if detail:
        beam(B, (x1 - .5, y1 - .5, 0), (x1 - .5, y1 - .5, 7), .12, '#8e9497')
        B.box(x1 - 1.1, x1 - .3, y1 - .9, y1 - .3, 6.9, 7.2, '#3a3d40')
    return BL.finish(B, 'ns_impound', detail)


OUTSIDE = (toll, toll_arm, ban_sign, carpark, impound)


def build_all(only=None):
    out = os.path.join(BL.LIFE, 'airport'); os.makedirs(out, exist_ok=True)
    made = []
    for i, fn in enumerate(OUTSIDE):
        if only and fn.__name__ not in only: continue
        for detail in (True, False):
            ob = fn(detail)
            ob.location = (i * 120, 0 if detail else 120, 0)
            faces, marks = BL.faces_of(ob)
            json.dump({'name': ob.name, 'faces': faces, 'marks': marks}, open(os.path.join(out, ob.name + '.json'), 'w'))
            made.append((ob.name, len(faces)))
    return made
