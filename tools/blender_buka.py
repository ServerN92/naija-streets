# Naija Streets: the buka (mama put), built in Blender for the online businesses.
# A Lagos roadside buka: plank and zinc shed on a concrete slab, open front with a counter under an oilcloth, the big
# aluminium pots and the glass food warmer, coolers, a blue water drum, firewood and a gas bottle, a menu board on the
# back wall, and a zinc canopy over the eating space in front with a long table, two benches and plastic chairs.
# The painted board at the front of the canopy is left plain: the game writes the owner's buka name on it.
# Same kit as the farm (tools/blender_farm.py, loaded with LIB = True): one mesh with a colour per face corner, light
# and shade baked in, each face marked wood / zinc / plaster / concrete for the game's photo detail. Z up, front -Y.
# Exported as bk_buka.glb and bk_buka_lod1.glb into Documents/naija_rooms/buka, in a scene of its own ("NS Buka").
import bpy, math, os, time, traceback
from mathutils import Vector

FARM_LIB = globals().get('FARM_LIB') or os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms', 'blender_farm_lib.py')
G = {'LIB': True, '__name__': 'farm_lib'}
exec(compile(open(FARM_LIB, encoding='utf-8').read(), FARM_LIB, 'exec'), G)
MB, T, C, lin, corrugated, planks, post, vnoise = G['MB'], G['T'], G['C'], G['lin'], G['corrugated'], G['planks'], G['post'], G['vnoise']
bake_ao = G['bake_ao']

BASE = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms')
OUT = os.path.join(BASE, 'buka'); os.makedirs(OUT, exist_ok=True)
LOGF = os.path.join(BASE, 'buka_log.txt')
def log(*a):
    with open(LOGF, 'a') as f: f.write(time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a) + '\n')

K = {k: lin(v) for k, v in dict(
    oil1='#c8242a', oil2='#f3efe6', oilb='#1f4fa0', paint_b='#2a62b8', paint_y='#e9b414', paint_g='#1d8a4e', paint_r='#b8261e',
    alu='#c9ccd0', alu_d='#8e9296', lid='#a9adb1', soot='#2b2724', glass='#2a3a40', glass_l='#7fa0aa', frame='#d8d4c8',
    cool_r='#c3201e', cool_b='#1e5fb4', cool_w='#ecebe6', drum='#1f5fb8', gas='#2e8a4e', gas_d='#1e5a32', fire='#6a4a2c',
    chair_r='#c42a22', chair_b='#2860b4', chair_g='#2a8a4a', board='#151a1a', chalk='#e6e2d6', poster1='#e9b414', poster2='#2a9a5a', poster3='#d8402a',
    bowl='#e8e2d4', bowl2='#2f7fc4', plate='#f1efe8', stew='#a8321c', rice='#e9c27a', mat='#d8c08a', bulb='#fff4c8', wire='#1b1b1b').items()}
W, D, H0, H1 = 4.4, 3.0, 2.62, 2.42   # shed width, depth, back and front height of the roof
CY = -3.3                             # the canopy reaches out to here (the eating space)


def zinc_wall(B, x, y0, y1, z0, z1, seed=0, rusty=.45):
    """A wall of zinc sheets standing along y at x (ridges run up and down)."""
    n = max(2, int((y1 - y0) / .09)) if B.detail else 1; amp = .016 if B.detail else 0; B.cls = 2
    ny = 3 if B.detail else 1
    def col(p):
        r = vnoise(p, 2.4, seed) * .7 + vnoise(p, 8, seed + 2) * .3; t = max(0, min(1, (r - (1 - rusty) * .75) * 2.2))
        z = C['zinc']; ru = C['rust'] if vnoise(p, 5, seed + 7) > .45 else C['rust_d']
        return tuple(z[i] * (1 - t) + ru[i] * t for i in range(3))
    for j in range(ny):
        za, zb = z0 + (z1 - z0) * j / ny, z0 + (z1 - z0) * (j + 1) / ny
        for i in range(n):
            ya, yb = y0 + (y1 - y0) * i / n, y0 + (y1 - y0) * (i + 1) / n
            xa, xb = x + (amp if i % 2 else 0), x + (0 if i % 2 else amp)
            q = [Vector((xa, ya, za)), Vector((xb, yb, za)), Vector((xb, yb, zb)), Vector((xa, ya, zb))]
            B.poly(q, [col(p) for p in q]); B.poly(q[::-1], [tuple(c * .55 for c in col(p)) for p in q[::-1]])


def oilcloth(B, x0, x1, y0, y1, z, cols=('oil1', 'oil2'), cell=.12):
    """A checked plastic table cover."""
    if not B.detail: B.cls = 0; B.face([Vector((x0, y0, z)), Vector((x1, y0, z)), Vector((x1, y1, z)), Vector((x0, y1, z))], K[cols[0]], .05); return
    nx, ny = max(1, int((x1 - x0) / cell)), max(1, int((y1 - y0) / cell)); B.cls = 0
    for i in range(nx):
        for j in range(ny):
            a, b = x0 + (x1 - x0) * i / nx, x0 + (x1 - x0) * (i + 1) / nx; c, d = y0 + (y1 - y0) * j / ny, y0 + (y1 - y0) * (j + 1) / ny
            B.face([Vector((a, c, z)), Vector((b, c, z)), Vector((b, d, z)), Vector((a, d, z))], K[cols[(i + j) % 2]], .04)


def pot(B, x, y, z, r, h, full=None):
    """A big aluminium pot with its lid half on (and the food showing)."""
    n = 14 if B.detail else 6
    B.cyl(T(x, y, z), r * .96, r, h, K['alu'], n=n, top=False, bottom=True, inner=K['alu_d'], var=.05)
    B.cyl(T(x, y, z + h - .02), r * 1.02, r * 1.02, .025, K['alu_d'], n=n, top=False, var=.03)   # the rim
    if full: B.cyl(T(x, y, z + h * .7), r * .94, r * .94, .01, K[full], n=n, var=.12)
    if B.detail:
        B.cyl(T(x + r * .35, y, z + h + .01, ry=.25), r * .9, r * .9, .02, K['lid'], n=n, var=.04)
        B.box(T(x + r * .35, y, z + h + .03), .12, .03, .03, K['soot'])
        for s in (-1, 1): B.box(T(x + s * (r + .03), y, z + h * .8), .06, .12, .03, K['alu_d'])


def cooler(B, x, y, z, w, d, h, col):
    B.box(T(x, y, z), w, d, h * .82, K[col], .06); B.box(T(x, y, z + h * .82), w * 1.03, d * 1.03, h * .18, K['cool_w'], .05)
    if B.detail: B.box(T(x, y - d / 2 - .01, z + h * .55), w * .3, .02, .05, K['cool_w'])


def plastic_chair(B, x, y, rz, col):
    c = K[col]; M = lambda dx, dy, dz, **k: T(x + math.cos(rz) * dx - math.sin(rz) * dy, y + math.sin(rz) * dx + math.cos(rz) * dy, dz, rz, **k)
    B.box(M(0, 0, .42), .44, .42, .04, c, .05)                                    # seat
    B.box(M(0, .2, .44, rx=-.12), .42, .04, .42, c, .05)                          # back
    if B.detail:
        for sx in (-1, 1):
            for sy in (-1, 1): B.box(M(sx * .19, sy * .18, 0, rx=sy * .08), .04, .04, .43, c, .05)
        B.box(M(0, .2, .72, rx=-.12), .44, .05, .08, c, .05)


def bench(B, x, y, L):
    B.box(T(x, y, .42), L, .3, .05, C['wood_l'], .14, f=7)
    for s in (-1, 1): B.box(T(x + s * (L / 2 - .2), y, 0), .06, .26, .42, C['wood_d'], .12)


def table(B, x, y, L, Wd):
    B.box(T(x, y, .72), L, Wd, .05, C['wood'], .12, f=7)
    for sx in (-1, 1):
        for sy in (-1, 1): B.box(T(x + sx * (L / 2 - .12), y + sy * (Wd / 2 - .08), 0), .06, .06, .72, C['wood_d'], .1)
    oilcloth(B, x - L / 2, x + L / 2, y - Wd / 2, y + Wd / 2, .775, ('oil2', 'oilb'))


def buka(detail=True, seed=61):
    B = MB('bk_buka' if detail else 'bk_buka_lod1', detail, seed); R = B.R
    hw = W / 2
    # the slab and the step
    B.box(T(0, (CY - .15 + D + .2) / 2, 0), W + .4, D + .2 - CY + .15, .12, C['conc'], .1, f=1.5)
    if detail: B.box(T(0, CY - .3, 0), 2.2, .3, .06, C['conc_d'], .1)
    # the shed: planks at the back and the left, zinc on the right
    planks(B, -hw, hw, D, .12, H0, C['plank'], 'x', True, w=.22)
    planks(B, .02, D, -hw, .12, H0 - .1, C['plank'], 'y', True, w=.24)
    zinc_wall(B, hw, .02, D, .12, H0 - .05, seed + 1)
    for x in (-hw, hw):
        for y in (.02, D): post(B, x, y, H0 if y > 1 else H1, .06)
    # the roof: zinc, from the back of the shed out over the eating space
    corrugated(B, -hw - .25, hw + .25, D + .25, CY - .25, H0 + .06, H1 - .22, seed + 3, .5)
    for x in (-hw + .05, 0, hw - .05):
        B.box(T(x, (D + CY) / 2, H1 - .02 + (H0 - H1) * .5, rx=math.atan2(H0 - H1, D - CY)), .07, D - CY + .3, .07, C['wood_d'], .12)
    for x in (-hw + .1, hw - .1): post(B, x, CY, H1 - .2, .065)
    B.box(T(0, CY, H1 - .32), W, .09, .1, C['wood_d'], .1)                       # the front beam
    # the board over the front (plain: the game paints the name), with a yellow frame
    B.box(T(0, CY - .05, H1 - .24), 3.7, .05, .76, K['paint_y'], .05)
    B.box(T(0, CY - .08, H1 - .2), 3.5, .02, .68, K['cool_w'], .03)
    # the counter: planks painted blue, oilcloth on top
    B.box(T(0, .35, .12), W - .3, .62, .92, K['paint_b'], .12, f=5)
    if detail:
        for i in range(9): B.box(T(-hw + .2 + i * (W - .4) / 8, .03, .14), .02, .02, .88, tuple(v * .7 for v in K['paint_b']), .1)
        B.box(T(0, .02, .7), W - .3, .03, .12, K['paint_y'], .08)               # a yellow stripe
    oilcloth(B, -hw + .15, hw - .15, .04, .66, 1.045)
    # on the counter: the glass food warmer, two pots, the coolers, plates
    gx = -.75
    B.box(T(gx, .36, 1.05), 1.3, .5, .06, K['frame'])
    for (dx, dy) in ((-.62, 0), (.62, 0)): B.box(T(gx + dx, .36 + dy, 1.11), .04, .48, .46, K['frame'])
    B.box(T(gx, .36, 1.56), 1.3, .5, .04, K['frame'])
    B.face([Vector((gx - .6, .11, 1.11)), Vector((gx + .6, .11, 1.11)), Vector((gx + .6, .2, 1.56)), Vector((gx - .6, .2, 1.56))], K['glass_l'], .05)
    if detail:
        for i, f in enumerate(('stew', 'rice', 'stew', 'rice')): B.cyl(T(gx - .45 + i * .3, .38, 1.11), .12, .13, .1, K['alu'], n=10, top=True, bottom=False, inner=K['alu_d'])
        for i, f in enumerate(('stew', 'rice', 'stew', 'rice')): B.cyl(T(gx - .45 + i * .3, .38, 1.205), .11, .11, .008, K[f], n=10)
    pot(B, .45, .4, 1.05, .25, .36, 'stew')
    cooler(B, 1.35, .4, 1.05, .62, .44, .46, 'cool_r')
    cooler(B, 1.35, .4, 1.51, .5, .36, .32, 'cool_b')
    if detail:
        for i in range(5): B.cyl(T(-1.75, .45, 1.05 + i * .025), .14, .16, .02, K['plate'], n=10)
        for i in range(3): B.cyl(T(-1.75 + .02 * i, .2, 1.05 + i * .06), .1, .13, .06, K['bowl2'], n=10, top=False, bottom=True, inner=K['bowl2'])
    # behind: the big pots on the fire, firewood, the gas bottle, the water drum, a stool with a basin
    B.box(T(-1.2, 1.9, .12), 1.6, .7, .38, C['block'], .15)                      # the fire bench (blocks)
    if detail:
        for i in range(3): B.cyl(T(-1.65 + i * .45, 1.9, .5), .07, .07, .05, K['soot'], n=6)
    pot(B, -1.6, 1.9, .5, .3, .48, 'stew'); pot(B, -.85, 1.9, .5, .34, .55, 'rice')
    for i in range(7 if detail else 2):
        B.cyl(T(.15 + R.uniform(-.05, .05), 2.4 + i * .08, .12 + (i % 3) * .07, ry=math.pi / 2, rz=R.uniform(-.1, .1)), .045, .04, .8, K['fire'], n=6 if detail else 4, var=.2)
    B.cyl(T(1.1, 2.3, .12), .15, .15, .55, K['gas'], n=12 if detail else 6, top=True); B.cyl(T(1.1, 2.3, .67), .05, .05, .08, K['gas_d'], n=6)
    B.cyl(T(1.65, 2.4, .12), .32, .32, .88, K['drum'], n=14 if detail else 6, top=True, var=.06)
    if detail:
        for z in (.35, .7): B.cyl(T(1.65, 2.4, .12 + z), .325, .325, .03, tuple(v * .8 for v in K['drum']), n=14, top=False)
    B.box(T(.4, 1.6, .12), .36, .36, .38, C['wood'], .12); B.cyl(T(.4, 1.6, .5), .2, .25, .12, K['bowl2'], n=10, top=False, bottom=True, inner=K['bowl'])
    # the back wall: the menu board, posters, a shelf of tins
    B.box(T(-.9, D - .06, 1.35), 1.1, .03, .75, K['board'], .03)
    if detail:
        for i in range(5): B.box(T(-.95 + R.uniform(-.05, .05), D - .08, 1.5 + .12 - i * .13), R.uniform(.55, .8), .01, .03, K['chalk'], .02)
        for i, c in enumerate(('poster1', 'poster2', 'poster3')): B.box(T(.4 + i * .5, D - .06, 1.45 + (i % 2) * .15), .4, .02, .55, K[c], .08)
        B.box(T(1.2, D - .2, 1.15), 1.2, .3, .04, C['wood'], .1)
        for i in range(6): B.cyl(T(.7 + i * .2, D - .2, 1.19), .06, .06, .14, K[('paint_r', 'paint_y', 'paint_g')[i % 3]], n=8)
        # a hanging bulb under the roof
        B.box(T(0, .9, 1.95), .01, .01, .5, K['wire']); B.sphere(T(0, .9, 1.9), .06, K['bulb'], seg=8, rings=5)
        B.box(T(0, -1.7, 1.75), .01, .01, .55, K['wire']); B.sphere(T(0, -1.7, 1.7), .06, K['bulb'], seg=8, rings=5)
    # the eating space: one long table, two benches, plastic chairs
    table(B, 0, -1.75, 2.8, .78)
    bench(B, 0, -1.08, 2.6); bench(B, 0, -2.42, 2.6)
    plastic_chair(B, 1.85, -1.75, math.pi / 2, 'chair_r'); plastic_chair(B, -1.85, -1.75, -math.pi / 2, 'chair_b')
    if detail:
        plastic_chair(B, 1.9, -2.85, .3, 'chair_g')
        for (x, y) in ((-.8, -1.6), (.3, -1.85), (1.0, -1.65)):
            B.cyl(T(x, y, .78), .13, .15, .02, K['plate'], n=10); B.cyl(T(x, y, .8), .09, .1, .03, K[('stew', 'rice')[int(x * 10) % 2]], n=8)
        B.cyl(T(-1.2, -1.9, .78), .04, .035, .22, K['cool_w'], n=8)                 # a bottle of water
        B.cyl(T(2.0, CY + .4, .12), .2, .17, .55, K['soot'], n=10, top=False, bottom=True, inner=K['soot'])   # the dustbin
    return B.finish()


# where the game puts things (in the game's own axes: x right, y up, z toward the street)
SPOTS = {
    'sign': {'x': 0, 'y': H1 - .2 + .34, 'z': -(CY - .095), 'w': 3.44, 'h': .62},
    'serve': {'x': 0, 'z': .45},          # stand here (in front of the counter) to buy, cook or collect
    'cook': {'x': -.2, 'z': -1.15},       # Iya Basira behind the counter
    'seats': [[x, .47, -y, ry] for (x, y, ry) in ((-.9, -1.08, math.pi), (.1, -1.08, math.pi), (.9, -1.08, math.pi), (-.6, -2.42, 0), (.5, -2.42, 0))],
}


if not globals().get('NO_RUN'):
    try:
        open(LOGF, 'w').write('buka start %s\n' % (bpy.app.version_string,))
        win = bpy.context.window; old_scene = win.scene if win else None
        sc = bpy.data.scenes.get('NS Buka') or bpy.data.scenes.new('NS Buka')
        if win: win.scene = sc
        for o in list(sc.collection.objects): bpy.data.objects.remove(o, do_unlink=True)
        G['OUT'] = OUT
        out = {}
        for detail in (True, False):
            t0 = time.time(); ob = buka(detail)
            if detail: bake_ao(ob)
            kb = G['export']([ob], ob.name)
            out[ob.name] = (len(ob.data.polygons), kb); log(ob.name, len(ob.data.polygons), 'faces', kb, 'KB', round(time.time() - t0, 1), 's')
            if not detail: ob.location.x = 6
        import json; json.dump(SPOTS, open(os.path.join(OUT, 'bk_buka_spots.json'), 'w'), indent=1)
        log('ALL DONE', out)
        print('BUKA OK', out)
    except Exception:
        log('FAILED', traceback.format_exc()); print(traceback.format_exc())
