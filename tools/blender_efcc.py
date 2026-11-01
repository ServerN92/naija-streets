"""Naija Streets: the EFCC Lagos office and its detention (the EFCC's own cells), built like blender_venues.py.

  ns_efcc / ns_efcc_lod1   ECONOMIC AND FINANCIAL CRIMES COMMISSION, Lagos zonal office: a three-storey cream block with a
                           dark glass centre, black and gold bands, big EFCC letters on the roof, a canopy entrance,
                           a detention wing with high barred windows on the right, a black steel gate with a boom and a
                           guard hut, flagpole, parking for the black vans
  int_efcc                 inside: reception counter, interview room (one table, two chairs, lamp), an exhibits table
                           (seized cash, laptops, phones), a corridor to two cells facing each other
The text on the signs is drawn by the game (marks sign_*). Marks like the police station's (cell_a, cell_a_in, inmate_*).
Run in Blender:  python tools/glb_build.py -m blender_efcc   or, with the light bake, efcc_build.py on the PC.
"""
import sys, os
_here = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.join(os.path.expanduser('~'), 'naija-streets', 'tools')
sys.path.insert(0, _here)
from blender_venues import *          # Builder, helpers, bars_x, tally, nigeria_flag, room_shell ...
import blender_houses as H

CREAM, CHARC, GOLD, EGLASS = '#ece6d8', '#24262a', '#c9a24a', '#1d2a33'


def efcc(detail):
    B = Builder(detail, simple=True)
    W, D, F, FH, NF = 26.0, 14.0, .5, 3.5, 3
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    top_ = F + FH * NF
    B.box(-17, 17, -19.0, y1 + 1.2, 0, .06, '#a29d93')                              # paved compound
    if detail:
        for k in range(10):                                                         # parking bay lines
            x = -15.5 + k * 2.8
            B.box(x, x + .1, -15.2, -11.0, .061, .064, '#f2f0e8') if k < 5 else None
    slab(B, x0 - .3, x1 + .3, y0 - .3, y1 + .3, F)
    w = walls(B, x0, x1, y0, y1, F, top_, CREAM, .0)
    for s_, (a, b) in (('F', (x0, x1)), ('B', (-x1, -x0)), ('L', (-y1, -y0)), ('R', (y0, y1))):
        w[s_].box(a - .01, b + .01, F, F + 1.2, 0, .015, CHARC)                       # charcoal base
        w[s_].box(a - .01, b + .01, F + 1.2, F + 1.28, 0, .025, GOLD)                 # gold line
        for f in range(1, NF):
            w[s_].box(a - .03, b + .03, F + FH * f - .12, F + FH * f + .2, 0, .06, CHARC)   # floor bands
        w[s_].box(a - .03, b + .03, top_ - .45, top_, 0, .07, CHARC)
        w[s_].box(a - .03, b + .03, top_ - .52, top_ - .45, 0, .075, GOLD)
    # the dark glass centre, full height, with fins
    gw = 9.0
    for f in range(NF):
        z = F + FH * f + (.2 if f else 1.3)
        glass_wall(w['F'], 0, z, gw, FH - (.45 if f else 1.5), '#16181b', 6, EGLASS)
    if detail:
        for k in range(7):
            u = -gw / 2 + gw * k / 6
            w['F'].box(u - .05, u + .05, F + 1.2, top_ - .5, .05, .45, '#2b2e33')       # vertical fins
    # ribbon windows on the wings, all floors
    for f in range(NF):
        zs = F + FH * f + 1.0
        for u in (-11.0, -8.6, 8.6, 11.0):
            w['F'].window(u, zs, 1.8, 1.5, 'slide', f == 0)
        for u in (-10.5, -7.0, -3.5, 0.0, 3.5, 7.0, 10.5):
            w['B'].window(u, zs, 1.6, 1.4, 'slide', f == 0)
        for u in (-4.5, -1.5, 1.5, 4.5):
            w['L'].window(u, zs, 1.5, 1.4, 'slide', f == 0)
    # canopy entrance with steps and glass doors
    py0 = y0 - 3.4
    B.box(-5.5, 5.5, py0, y0, 0, F, '#8f8a82')
    B.box(-5.55, 5.55, py0 - .03, y0, F - .05, F, '#c2bcb0')
    steps(B, -3.5, 3.5, py0, F, 3, .34)
    B.box(-6.2, 6.2, py0 - .3, y0, F + 3.4, F + 3.75, CHARC, bottom=True)            # canopy slab
    B.box(-6.25, 6.25, py0 - .35, py0 - .25, F + 3.3, F + 3.85, GOLD)                # gold edge
    for x in (-5.6, 5.6):
        B.box(x - .25, x + .25, py0 + .1, py0 + .6, F, F + 3.4, CHARC)
    w['F'].box(-1.6, 1.6, F, F + 2.7, 0, .03, '#2c3b44')                             # glass double door
    for u in (-1.6, 0, 1.6):
        w['F'].box(u - .05, u + .05, F, F + 2.75, .03, .07, '#16181b')
    w['F'].box(-1.65, 1.65, F + 2.7, F + 2.8, .03, .07, '#16181b')
    # signs: the name over the canopy, EFCC big on the roof (text drawn by the game)
    B.box(-5.8, 5.8, py0 - .4, py0 - .32, F + 3.85, F + 4.75, '#14161a')
    B.mark('sign_name', 0, py0 - .43, F + 4.3, text='ECONOMIC AND FINANCIAL CRIMES COMMISSION', w=11.2, h=.8, face='-y')
    flat_roof(B, x0, x1, y0, y1, top_, .9, CREAM, CHARC)
    B.box(-5.0, 5.0, y0 - .02, y0 + .25, top_ + .9, top_ + 3.2, '#14161a')           # the roof sign frame
    for x in (-4.0, 0.0, 4.0):
        B.box(x - .06, x + .06, y0 + .2, y0 + 1.2, top_, top_ + 3.0, '#3a3d42')
    B.mark('sign_efcc', 0, y0 - .05, top_ + 2.05, text='EFCC', w=9.6, h=2.1, face='-y')
    # the detention wing: a lower block on the right, high barred slits, its own steel door
    dx0, dx1, dy0, dy1 = x1, x1 + 7.0, -3.0, y1
    B.box(dx0, dx1, dy0, dy1, 0, F + 4.2, '#d9d2c2', grime=True)
    B.box(dx0 - .01, dx1 + .02, dy0 - .02, dy1 + .02, 0, 1.2, CHARC)
    B.box(dx0 - .02, dx1 + .05, dy0 - .05, dy1 + .05, F + 4.2, F + 4.55, CHARC)
    for k in range(4):
        u = dx0 + 1.0 + k * 1.6
        B.box(u, u + .9, dy0 - .03, dy0, F + 3.0, F + 3.45, '#1c1c1c')
        if detail:
            for j in range(5):
                B.box(u + .1 + j * .18, u + .13 + j * .18, dy0 - .07, dy0 - .03, F + 3.0, F + 3.45, BARS)
    for k in range(5):
        v = dy0 + 1.2 + k * 1.9
        B.box(dx1, dx1 + .03, v, v + .9, F + 3.0, F + 3.45, '#1c1c1c')
    B.box(dx0 + 4.8, dx0 + 6.2, dy0 - .06, dy0, .05, 2.3, '#3a3d42')                  # steel door
    B.box(dx0 + 4.75, dx0 + 6.25, dy0 - .08, dy0, 2.3, 2.38, '#2a2c2e')
    B.box(dx0 + 1.0, dx0 + 4.2, dy0 - .07, dy0 - .02, 1.6, 2.4, '#14161a')
    B.mark('sign_det', dx0 + 2.6, dy0 - .09, 2.0, text='DETENTION', w=3.0, h=.7, face='-y')
    # razor wire on the detention roof
    if detail:
        for k in range(28):
            x = dx0 + .2 + k * .24
            B.box(x, x + .14, dy0 + .1, dy0 + .16, F + 4.55, F + 4.85 + .08 * (k % 2), '#8c8f92')
    # perimeter: black steel railings on a charcoal wall, a sliding gate and a boom, guard hut
    fy, gate = -18.6, 4.0
    for (a, b) in ((-16.5, -gate), (gate, 16.5)):
        B.box(a, b, fy - .15, fy + .15, 0, .9, CHARC, grime=True)
        B.box(a, b, fy - .17, fy + .17, .9, .97, GOLD)
        if detail:
            x = a
            while x < b:
                B.box(x - .02, x + .02, fy - .02, fy + .02, .97, 2.3, '#16181b')
                x += .18
        B.box(a, b, fy - .04, fy + .04, 2.2, 2.28, '#16181b')
        x = a
        while x <= b + .01:
            B.box(x - .22, x + .22, fy - .22, fy + .22, 0, 2.5, CHARC)
            B.box(x - .26, x + .26, fy - .26, fy + .26, 2.5, 2.6, GOLD)
            x += (b - a) / max(1, round((b - a) / 3.5))
    for s_ in (-1, 1):
        xr = s_ * 16.5
        B.box(xr - .15, xr + .15, fy, y1 + 1.0, 0, 2.3, CHARC, grime=True)
        gx = s_ * gate
        B.box(gx - .4, gx + .4, fy - .4, fy + .4, 0, 2.9, CHARC)
        B.box(gx - .46, gx + .46, fy - .46, fy + .46, 2.9, 3.05, GOLD)
    B.box(-gate - 4.0, -gate - .45, fy + .3, fy + .38, .05, 2.2, '#16181b')         # the gate slid open
    B.box(gate + .5, gate + .65, fy - .9, fy - .75, 0, 1.1, '#f2f2ee')               # boom post and arm (up)
    B.box(gate + .53, gate + .62, fy - .87, fy - .78, 1.1, 4.6, '#d42a26')
    hx, hy = gate + 1.6, fy + 1.4                                                     # guard hut
    B.box(hx, hx + 2.2, hy, hy + 2.0, 0, 2.6, CREAM, grime=True)
    B.box(hx - .15, hx + 2.35, hy - .15, hy + 2.15, 2.6, 2.8, CHARC)
    B.box(hx + .4, hx + 1.8, hy - .02, hy, 1.1, 2.0, EGLASS)
    B.mark('guard', hx + 1.1, hy - .7, 0, face='-y')
    # flagpole with the Nigerian flag
    fpx, fpy = -9.0, -15.5
    B.box(fpx - .7, fpx + .7, fpy - .7, fpy + .7, 0, .3, CHARC)
    cylinder(B, fpx, fpy, .3, 9.5, .06, '#d8dadc', 8)
    ball(B, fpx, fpy, 9.55, .09, GOLD, 8, 3)
    nigeria_flag(B, fpx + .06, fpy, 9.4)
    # shade over the van bays
    sx0, sx1, sy0, sy1 = -15.8, -8.0, -15.4, -10.6
    for x in (sx0, sx1):
        for y in (sy0, sy1):
            B.box(x - .07, x + .07, y - .07, y + .07, 0, 3.0, '#2b2e33')
    B.face([(sx0 - .3, sy0 - .4, 3.05), (sx1 + .3, sy0 - .4, 3.05), (sx1 + .3, sy1 + .3, 2.75), (sx0 - .3, sy1 + .3, 2.75)], '#26292d')
    B.face([(sx0 - .3, sy1 + .3, 2.73), (sx1 + .3, sy1 + .3, 2.73), (sx1 + .3, sy0 - .4, 3.03), (sx0 - .3, sy0 - .4, 3.03)], '#8a8f94')
    B.mark('park_1', -14.0, -13.0, 0, face='+y')
    B.mark('park_2', -10.0, -13.0, 0, face='+y')
    B.mark('door', 0, y0 - 1.0, F, face='+y')
    B.mark('det_door', dx0 + 5.5, dy0 - 1.0, 0, face='+y')
    return B.finish('ns_efcc' + ('' if detail else '_lod1'))


# ================================================================ inside: reception, interview room, exhibits, the cells
def int_efcc(detail=True):
    B = Builder(True)
    x0, x1, y0, y1, HH = -10.0, 10.0, -8.0, 8.0, 3.4
    WALLC, DADO = '#e7e3da', '#202226'

    def floor(i, j):
        x, y = x0 + (i + .5) * .5, y0 + (j + .5) * .5
        if y > 1.2:
            if x < 0:
                return vary('#c9c4ba', i, j, a=.04)                                   # interview room
            return vary('#8e8b85', i, j, a=.06)                                       # cells: bare concrete
        return vary('#d8d3c8' if (i + j) % 2 else '#cdc7ba', i, j, a=.03)             # polished tiles
    room_shell(B, x0, x1, y0, y1, HH, WALLC, floor, '#f1f0ec', t=.2, front_gap=(-.9, .9, 2.4), tile=.5)
    wall_x(B, 1.0, 1.2, x0, x1, HH, WALLC, gaps=[(4.0, 6.0, 2.4), (-3.2, -2.2, 2.2)])
    B.box(-.2, 0, 1.2, y1, 0, HH, '#c4c0b8', grime=True)
    for (a, b) in ((0, 4.0), (6.0, x1)):
        B.box(a, b, 3.2, 3.4, 0, HH, '#b9b6ae', grime=True)
    # black dado and a gold line round the reception
    for (a, b) in ((x0, -.9), (.9, x1)):
        B.box(a, b, y0, y0 + .012, 0, 1.1, DADO); B.box(a, b, y0, y0 + .016, 1.1, 1.15, GOLD)
    for (a, b) in ((x0, -3.2), (-2.2, 4.0), (6.0, x1)):
        B.box(a, b, 1.0 - .012, 1.0, 0, 1.1, DADO); B.box(a, b, 1.0 - .016, 1.0, 1.1, 1.15, GOLD)
    for xw, sgn in ((x0, 1), (x1, -1)):
        lo, hi = sorted((xw, xw + sgn * .012)); B.box(lo, hi, y0, 1.0, 0, 1.1, DADO)
        lo, hi = sorted((xw, xw + sgn * .016)); B.box(lo, hi, y0, 1.0, 1.1, 1.15, GOLD)
    door_frame(B, 'y', y0, -.9, .9, 2.4, 1, '#16181b', .08)
    # visitors: a row of steel chairs, a water dispenser, posters
    for k in range(5):
        chair(B, -9.4, -6.8 + k * .6, '+x', '#3a3d42', leg='#8c8f92')
    B.box(9.4, 9.8, -7.6, -7.2, 0, 1.0, '#e9ecef'); B.box(9.45, 9.75, -7.55, -7.25, 1.0, 1.4, '#5aa0d8')
    B.box(x1 - .03, x1, -6.6, -4.6, 1.2, 2.4, '#16181b')                               # "say no to corruption" board
    B.box(x1 - .04, x1 - .03, -6.5, -4.7, 1.3, 2.3, '#f4f2ea')
    B.mark('sign_poster', x1 - .05, -5.6, 1.8, text='SAY NO TO CORRUPTION', w=1.8, h=.9, face='-x')
    # the reception counter (black with a gold top edge), a flap at the right
    cy0, cy1 = -3.9, -3.3
    for (a, b) in ((-6.0, 5.6), (7.0, x1)):
        B.box(a, b, cy0, cy1, 0, 1.05, '#1e2024')
        B.box(a, b, cy0 - .06, cy1, 1.05, 1.1, '#d9d4c7')
        B.box(a, b, cy0 - .02, cy0, .9, .95, GOLD)
    B.box(5.6, 5.66, cy0, cy1, 1.1, 2.35, '#1e2024')
    B.box(-1.8, -1.2, -3.8, -3.5, 1.1, 1.14, '#f2efe4')                                  # visitor book, pen, a monitor
    B.box(1.0, 1.5, -3.55, -3.45, 1.1, 1.45, '#141414'); B.box(1.03, 1.47, -3.56, -3.55, 1.13, 1.42, '#2a3d55')
    B.mark('officer', -1.6, -2.7, 0, face='-y')
    B.mark('counter', -1.6, -4.6, 0, face='+y')
    # the exhibits table: seized money in bundles, laptops, phones, a gold chain
    table(B, -9.0, -6.6, -2.4, -1.2, .8, '#d9d4c7', '#2a2c2e')
    for k in range(12):
        bx, by = -8.9 + (k % 6) * .27, -2.3 + (k // 6) * .3
        B.box(bx, bx + .22, by, by + .12, .8, .86 + .06 * (k % 3), ['#2f7a4a', '#7a5a9a', '#3a6a9a'][k % 3])     # naira bundles
    for k in range(3):
        bx = -7.6 + k * .45
        B.box(bx, bx + .38, -1.7, -1.42, .8, .82, '#2a2c2e'); B.box(bx, bx + .38, -1.44, -1.42, .82, 1.06, '#1a1c1e')  # laptops (open)
    for k in range(6):
        B.box(-8.9 + k * .12, -8.83 + k * .12, -1.55, -1.42, .8, .81, '#101010')                   # phones
    B.box(-9.0, -6.6, -2.42, -2.4, .62, .78, '#f2c200')                                  # EXHIBIT tape
    B.mark('sign_exhibit', -7.8, -2.45, .7, text='EXHIBITS', w=1.4, h=.16, face='-y')
    # behind the counter: desks with flat screens, cabinets
    def desk(xc, yc):
        table(B, xc - .8, xc + .8, yc - .4, yc + .4, .76, '#d9d4c7', '#2a2c2e')
        office_chair(B, xc, yc + .75, '-y')
        B.box(xc - .3, xc + .3, yc + .05, yc + .1, .76, 1.15, '#141414'); B.box(xc - .28, xc + .28, yc + .04, yc + .05, .8, 1.12, '#2a3d55')
        B.box(xc - .25, xc + .25, yc - .3, yc - .12, .76, .78, '#2a2c2e')
        for k in range(int(2 + 3 * hh(xc, yc))):
            B.box(xc + .4, xc + .72, yc - .3, yc + .02, .76 + k * .04, .8 + k * .04, ['#c8a46a', '#e6e2d6', '#b5874a'][k % 3])
    desk(-4.0, -1.5); desk(-.5, -1.5); desk(3.0, -1.5); desk(8.0, -1.4)
    for k in range(4):
        cx_ = 9.5 - k * .55
        B.box(cx_ - .25, cx_ + .25, .45, 1.0, 0, 1.35, '#3a3d42')
        for d in range(3):
            B.box(cx_ - .2, cx_ + .2, .44, .45, .2 + d * .42, .5 + d * .42, '#4a4e54')
    # back wall: the commission's sign, a clock, the flag colours
    B.box(-1.4, 1.8, .97, 1.0, 2.4, 3.05, '#16181b'); B.box(-1.45, 1.85, .975, 1.0, 2.36, 2.4, GOLD)
    B.mark('sign_counter', .2, .96, 2.72, text='EFCC · LAGOS', w=3.0, h=.55, face='-y')
    B.box(2.3, 2.5, .985, 1.0, 1.4, 2.6, '#118a4a'); B.box(2.5, 2.7, .985, 1.0, 1.4, 2.6, '#f5f5f2'); B.box(2.7, 2.9, .985, 1.0, 1.4, 2.6, '#118a4a')
    disc_pts = [(-5.0 + .22 * math.cos(2 * math.pi * i / 12), .97, 2.3 + .22 * math.sin(2 * math.pi * i / 12)) for i in range(12)]
    B.face(disc_pts, '#f8f8f4')
    # the interview room (left, behind the wall): one table, two chairs, a desk lamp, a mirror window
    door_frame(B, 'y', 1.0, -3.2, -2.2, 2.2, -1, '#16181b', .07)
    table(B, -6.6, -5.0, 4.0, 5.0, .76, '#3a3d42', '#2a2c2e')
    chair(B, -5.8, 3.4, '+y', '#2a2c2e'); chair(B, -5.8, 5.6, '-y', '#2a2c2e')
    cylinder(B, -5.2, 4.3, .76, .78, .08, '#1a1a1a', 8); rod(B, (-5.2, 4.3, .78), (-5.35, 4.45, 1.1), .01, '#1a1a1a')
    B.box(-5.5, -5.25, 4.4, 4.6, 1.05, 1.15, '#2a2a2a')
    B.box(-8.0, -2.0, y1 - .02, y1, 1.0, 2.2, '#3a4652')                               # the one-way mirror
    B.box(-6.8, -6.3, 4.2, 4.6, .76, .77, '#f2efe4')                                     # statement form
    B.mark('interview', -5.8, 3.4, 0, face='+y')
    # corridor to the cells and the cells (as the police station's, but EFCC: black bars, a CCTV camera)
    door_frame(B, 'y', 1.0, 4.0, 6.0, 2.4, -1, '#16181b', .07)
    bars_x(B, 4.0, 3.4, y1, HH, door=(4.5, 5.5), c='#1c1e21')
    bars_x(B, 6.0, 3.4, y1, HH, door=(4.5, 5.5), c='#1c1e21')
    for name, (cx0, cx1, sgn) in {'a': (0.0, 4.0, 1), 'b': (6.0, 10.0, -1)}.items():
        wall = cx0 if sgn > 0 else cx1
        bx0, bx1 = sorted((wall, wall + sgn * .5))
        B.box(bx0, bx1, 4.0, 7.2, 0, .45, '#9a968e'); B.box(bx0, bx1, 4.0, 7.2, .45, .48, '#a8a49c')
        mx0, mx1 = (1.0, 3.0) if sgn > 0 else (7.0, 9.0)
        B.box(mx0, mx1, 6.95, 7.85, 0, .12, '#5a6070'); B.box(mx0 + .05, mx1 - .05, 7.0, 7.8, .12, .14, '#687080')
        p = wall + sgn * .005
        B.box(min(p, p + sgn * .004), max(p, p + sgn * .004), 3.4, y1, 0, 1.0, '#8f8b82')
        tally(B, 'x', wall + sgn * .006, 4.3, 1.6, 4)
        for k in range(6):
            a = 4.0 + 3.6 * hh(k, sgn); z = 1.2 + 1.3 * hh(k, sgn, 2)
            stroke(B, 'x', wall + sgn * .007, a, z, .3 + .5 * hh(k, 3), 3.1 * hh(k, 4), '#2b2a28', .03)
        wx = (cx0 + cx1) / 2
        B.box(wx - .4, wx + .4, y1 - .02, y1, 2.5, 3.0, '#e8eef0')
        for k in range(5):
            B.box(wx - .4 + k * .2 - .015, wx - .4 + k * .2 + .015, y1 - .05, y1 - .02, 2.5, 3.0, '#1c1e21')
        B.box(wx - .15, wx + .15, 5.55, 5.85, HH - .08, HH, '#1c1e21'); B.box(wx - .06, wx + .06, 5.64, 5.76, HH - .2, HH - .08, '#fff1c4')
        b0, b1 = (.55, 3.85) if sgn > 0 else (6.15, 9.45)
        B.mark(f'cell_{name}', (cx0 + cx1) / 2, 5.7, 0, x0=b0, x1=b1, y0=3.6, y1=7.8)
        fb = '+x' if sgn > 0 else '-x'
        B.mark(f'inmate_{name}1', wall + sgn * .3, 4.6, .45, face=fb, pose='sit')
        B.mark(f'inmate_{name}2', (mx0 + mx1) / 2, 7.4, .12, face=fb, pose='lie')
        B.mark(f'inmate_{name}3', cx0 + 2.9 if sgn > 0 else cx0 + 1.1, 4.1, 0, face=fb, pose='stand')
    B.mark('cell_a_in', 2.9, 5.7, 0, face='+x')
    B.box(4.8, 5.2, y1 - .25, y1 - .05, HH - .35, HH - .2, '#e9ecef'); B.box(4.92, 5.08, y1 - .35, y1 - .25, HH - .32, HH - .24, '#1a1a1a')   # CCTV
    B.box(4.4, 5.6, y1 - .03, y1, 1.9, 2.4, '#16181b')
    B.mark('sign_cells', 5.0, y1 - .04, 2.15, text='DETENTION', w=1.1, h=.4, face='-y')
    # ceiling lights, AC
    for (lx, ly) in ((-5.0, -5.5), (2.5, -5.5), (-6.0, -1.5), (-1.0, -1.5), (5.0, -1.5), (5.0, 2.2), (-5.0, 4.5)):
        fluor(B, lx, ly, HH)
    fluor(B, 5.0, 5.8, HH, 'y')
    split_ac(B, 'y', 1.0, -8.0, 2.6, -1)
    plant(B, -9.4, .5, 1.1, '#16181b')
    B.mark('spawn', 0, y0 + 1.3, 0, face='+y')
    B.mark('exit', 0, y0 + .6, 0, face='-y')
    L_ = [(-5.0, -5.5, 3.25, '#f2f6ff', 24, 10), (2.5, -5.5, 3.25, '#f2f6ff', 24, 10), (-3.5, -1.5, 3.25, '#f2f6ff', 24, 10),
          (5.0, -1.0, 3.25, '#f2f6ff', 20, 9), (2.0, 5.7, 3.1, '#ffe2b0', 10, 7), (8.0, 5.7, 3.1, '#ffe2b0', 10, 7), (-5.5, 4.5, 3.1, '#fff4d8', 14, 7)]
    for i, (lx, ly, lz, c, pw, rg) in enumerate(L_):
        B.mark(f'light_{i + 1}', lx, ly, lz, color=c, power=pw, range=rg)
    return B.finish('int_efcc')


BUILDS = (efcc,)
INTERIORS = (int_efcc,)


def main():
    os.makedirs(H.OUT, exist_ok=True)
    for fn in BUILDS:
        for detail in (True, False):
            ob = fn(detail); H.export(ob, os.path.join(H.OUT, ob.name + '.glb'))
    for fn in INTERIORS:
        ob = fn(True); H.export(ob, os.path.join(H.OUT, ob.name + '.glb'))


if __name__ == '__main__':
    main()
