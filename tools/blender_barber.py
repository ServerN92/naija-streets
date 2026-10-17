# Naija Streets: the barbing salon, built in Blender for the online businesses.
# A Lagos barber shop in a painted shipping container on blocks: a big front window with burglar bars and an open glass
# door, inside the red barber chair facing the long mirror, the shelf of clippers, bottles, powder and towels, the
# hairstyle poster, a small TV, a fan and the tube light; outside a zinc awning, a wooden bench for the people waiting,
# the chalk price board, the small yellow generator ("I pass my neighbour") with its jerrycan and the extension wire.
# The board on the roof is left plain: the game writes the owner's salon name on it.
# Same kit as the buka (tools/blender_buka.py and the farm's tools/blender_farm.py). Z up, front -Y.
# Exported as bb_barber.glb and bb_barber_lod1.glb into Documents/naija_rooms/barber, in a scene of its own ("NS Barber").
import bpy, math, os, time, traceback, json
from mathutils import Vector

HERE = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms')
BK = {'NO_RUN': True, '__name__': 'buka_lib'}
exec(compile(open(os.path.join(HERE, 'blender_buka.py'), encoding='utf-8').read(), 'blender_buka.py', 'exec'), BK)
MB, T, C, K, lin, corrugated, planks, post, vnoise = BK['MB'], BK['T'], BK['C'], BK['K'], BK['lin'], BK['corrugated'], BK['planks'], BK['post'], BK['vnoise']
plastic_chair, bench, cooler, bake_ao = BK['plastic_chair'], BK['bench'], BK['cooler'], BK['bake_ao']

OUT = os.path.join(HERE, 'barber'); os.makedirs(OUT, exist_ok=True)
LOGF = os.path.join(HERE, 'barber_log.txt')
def log(*a):
    with open(LOGF, 'a') as f: f.write(time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a) + '\n')

P = {k: lin(v) for k, v in dict(
    box_b='#1f63b5', box_b2='#2a78cc', box_r='#b82a20', box_y='#e2a81a', box_rust='#7a3a1e', inner='#e8e0cc', inner2='#d8cfb8', tile1='#e9e6de', tile2='#2b2b2e',
    mirror='#a9c3cc', mirror_f='#d8d4c8', seat='#b0161a', seat_d='#6a0c10', chrome='#cfd2d4', black='#18181a', towel='#f4f2ec', towel_b='#5aa0d8',
    gen_y='#e8b416', gen_d='#2a2a2c', jerry='#e8c22a', jerry_g='#2e8a4e', cable='#141414', chalk='#1a2420', chalk_t='#ece8dc', glass='#7fa6b4', bar='#202022',
    poster='#f2efe6', face1='#5a3a28', face2='#3e2618', face3='#7a5038', hair='#141010', tv='#0e0e10', tube='#fffbe8', fan='#e8e6e0', fan_b='#3a8ad0',
    bottle1='#2a8a4a', bottle2='#d8a020', bottle3='#c02a2a', powder='#f4f4f2', tyre='#1b1b1b').items()}
L, WD, H, B0 = 6.06, 2.44, 2.59, .15            # container length, width, height; it stands on blocks this high
hx = L / 2
WIN = (-2.5, .8, .95 + B0, 2.1 + B0)            # front window: x0, x1, z0, z1
DOOR = (1.4, 2.4, B0, 2.15 + B0)                # door opening: x0, x1, z0, z1
AW = -1.3                                       # the awning reaches out to here


def ribs(B, x0, x1, y, z0, z1, col, rust=.35, seed=0, out=-1):
    """Container wall along x at y: vertical ribs (a trapezoid every .28 m), painted, rust near the bottom.
    out = -1: the outside faces -y; +1: faces +y."""
    step = .28 if B.detail else (x1 - x0); dep = .035 if B.detail else 0
    n = max(1, int(round((x1 - x0) / step))); B.cls = 0
    def cl(p):
        r = vnoise(p, 3.0, seed) * .6 + vnoise(p, 11, seed + 3) * .4; low = max(0, 1 - (p.z - z0) / .7)
        t = max(0, min(1, (r - .55) * 2.2 * rust + low * rust * .8))
        return tuple(col[i] * (1 - t) + P['box_rust'][i] * t for i in range(3))
    xs = []
    for i in range(n):
        a = x0 + (x1 - x0) * i / n; b = x0 + (x1 - x0) * (i + 1) / n; w = b - a
        xs += [(a, 0), (a + w * .2, dep), (a + w * .5, dep), (a + w * .7, 0)]
    xs.append((x1, 0))
    for (xa, da), (xb, db) in zip(xs, xs[1:]):
        q = [Vector((xa, y + out * da, z0)), Vector((xb, y + out * db, z0)), Vector((xb, y + out * db, z1)), Vector((xa, y + out * da, z1))]
        if out > 0: q = q[::-1]
        B.poly(q, [cl(p) for p in q])


def ribs_y(B, y0, y1, x, z0, z1, col, rust=.35, seed=0, out=1):
    """The same along y at x (the ends of the container); out = +1 faces +x."""
    step = .28 if B.detail else (y1 - y0); dep = .035 if B.detail else 0
    n = max(1, int(round((y1 - y0) / step))); B.cls = 0
    def cl(p):
        r = vnoise(p, 3.0, seed) * .6 + vnoise(p, 11, seed + 3) * .4; low = max(0, 1 - (p.z - z0) / .7)
        t = max(0, min(1, (r - .55) * 2.2 * rust + low * rust * .8))
        return tuple(col[i] * (1 - t) + P['box_rust'][i] * t for i in range(3))
    ys = []
    for i in range(n):
        a = y0 + (y1 - y0) * i / n; b = y0 + (y1 - y0) * (i + 1) / n; w = b - a
        ys += [(a, 0), (a + w * .2, dep), (a + w * .5, dep), (a + w * .7, 0)]
    ys.append((y1, 0))
    for (ya, da), (yb, db) in zip(ys, ys[1:]):
        q = [Vector((x + out * da, ya, z0)), Vector((x + out * db, yb, z0)), Vector((x + out * db, yb, z1)), Vector((x + out * da, ya, z1))]
        if out < 0: q = q[::-1]
        B.poly(q, [cl(p) for p in q])


def quad(B, a, b, c, d, col, var=.05):
    B.face([Vector(a), Vector(b), Vector(c), Vector(d)], col, var)


def barber_chair(B, x, y, rz=0):
    d = B.detail
    B.cyl(T(x, y, B0), .26, .2, .05, P['chrome'], n=12 if d else 6)                 # foot plate
    B.cyl(T(x, y, B0 + .05), .06, .06, .38, P['chrome'], n=8 if d else 4)          # the pump
    M = lambda dx, dy, dz, **k: T(x + math.cos(rz) * dx - math.sin(rz) * dy, y + math.sin(rz) * dx + math.cos(rz) * dy, B0 + dz, rz, **k)
    B.box(M(0, 0, .43), .56, .52, .12, P['seat'], .06)                             # seat
    B.box(M(0, .24, .55, rx=-.15), .54, .1, .62, P['seat'], .06)                   # back
    B.box(M(0, .3, 1.17), .26, .1, .14, P['seat_d'], .06)                          # head rest
    for s in (-1, 1): B.box(M(s * .3, -.02, .58), .07, .46, .07, P['chrome'], .04)  # arms
    if d: B.box(M(0, -.42, .12, rx=.5), .42, .06, .3, P['chrome'], .04)            # foot rest


def generator(B, x, y):
    d = B.detail
    B.box(T(x, y, .1), .62, .46, .04, P['gen_y'], .06)
    for sx in (-1, 1):
        for sy in (-1, 1): B.box(T(x + sx * .29, y + sy * .21, .1), .03, .03, .44, P['gen_y'], .06)
    B.box(T(x, y, .52), .64, .48, .03, P['gen_y'], .06)
    B.box(T(x - .05, y, .14), .4, .32, .3, P['gen_d'], .1)                          # engine
    B.cyl(T(x + .1, y, .44), .12, .12, .1, P['box_r'], n=10 if d else 5)           # fuel tank cap area
    B.box(T(x + .1, y, .44), .38, .34, .08, P['box_r'], .06)                       # fuel tank
    if d:
        B.cyl(T(x - .3, y - .1, .3, ry=math.pi / 2), .04, .04, .2, P['gen_d'], n=6)   # exhaust
        B.box(T(x + .2, y - .25, .25), .12, .03, .1, P['black'], .05)              # the switch panel
        B.cyl(T(x + .55, y + .1, .1), .13, .13, .32, P['jerry'], n=4, top=True)     # jerrycan (square-ish)
        B.box(T(x + .55, y + .1, .42), .05, .05, .06, P['jerry_g'])


def barber(detail=True, seed=71):
    B = MB('bb_barber' if detail else 'bb_barber_lod1', detail, seed); R = B.R; d = detail
    # the slab, the blocks under the container
    B.box(T(.45, (AW - .35 + WD + .15) / 2, 0), L + 1.6, WD + .5 - AW, .1, C['conc'], .1, f=1.5)
    for bx in (-hx + .2, 0, hx - .2):
        for by in (.2, WD - .2): B.box(T(bx, by, .1), .4, .3, B0 - .1 + .001, C['block'], .12)
    col = P['box_b']
    # the box: the front wall with its window and door, the back, the two ends, the roof and the floor
    z0, z1 = B0, B0 + H
    for (a, b, za, zb) in ((-hx, WIN[0], z0, z1), (WIN[0], WIN[1], z0, WIN[2]), (WIN[0], WIN[1], WIN[3], z1), (WIN[1], DOOR[0], z0, z1), (DOOR[0], DOOR[1], DOOR[3], z1), (DOOR[1], hx, z0, z1)):
        ribs(B, a, b, 0, za, zb, col, .4, seed, -1)
    ribs(B, -hx, hx, WD, z0, z1, col, .4, seed + 1, 1)
    ribs_y(B, 0, WD, -hx, z0, z1, col, .4, seed + 2, -1); ribs_y(B, 0, WD, hx, z0, z1, col, .4, seed + 3, 1)
    B.box(T(0, WD / 2, z1), L + .04, WD + .04, .05, P['box_b2'], .08)                 # roof
    for (xa, ya) in ((-hx, 0), (hx, 0), (-hx, WD), (hx, WD)): B.box(T(xa, ya, z0), .1, .1, H + .04, P['box_b2'], .06)   # corner posts
    # inside: lining, floor tiles, the ceiling
    quad(B, (-hx + .04, WD - .04, z0), (hx - .04, WD - .04, z0), (hx - .04, WD - .04, z1 - .02), (-hx + .04, WD - .04, z1 - .02), P['inner'])
    quad(B, (-hx + .04, .04, z0), (-hx + .04, WD - .04, z0), (-hx + .04, WD - .04, z1 - .02), (-hx + .04, .04, z1 - .02), P['inner2'])
    quad(B, (hx - .04, WD - .04, z0), (hx - .04, .04, z0), (hx - .04, .04, z1 - .02), (hx - .04, WD - .04, z1 - .02), P['inner2'])
    quad(B, (-hx, 0, z1 - .03), (hx, 0, z1 - .03), (hx, WD, z1 - .03), (-hx, WD, z1 - .03), P['inner2'])
    nt = 12 if d else 1
    for i in range(nt):
        for j in range(5 if d else 1):
            a, b = -hx + L * i / nt, -hx + L * (i + 1) / nt; c, e = WD * j / (5 if d else 1), WD * (j + 1) / (5 if d else 1)
            B.cls = 0; quad(B, (a, c, z0 + .005), (b, c, z0 + .005), (b, e, z0 + .005), (a, e, z0 + .005), P['tile1'] if (i + j) % 2 == 0 or not d else P['tile2'], .04)
    # the window: glass, frame, burglar bars
    wx0, wx1, wz0, wz1 = WIN
    # (no glass: the window is open behind its bars, so you see the barber at work)
    for (a, b, za, zb) in ((wx0 - .04, wx1 + .04, wz0 - .05, wz0), (wx0 - .04, wx1 + .04, wz1, wz1 + .05)): B.box(T((a + b) / 2, -.01, za), b - a, .06, zb - za, P['mirror_f'], .04)
    if d:
        for i in range(int((wx1 - wx0) / .14) + 1): B.box(T(wx0 + i * .14, -.05, wz0), .02, .02, wz1 - wz0, P['bar'], .03)
        for z in (wz0 + .4, wz1 - .3): B.box(T((wx0 + wx1) / 2, -.05, z), wx1 - wx0, .02, .02, P['bar'], .03)
    # the door: frame and the glass door standing open, inward
    dx0, dx1, dz0, dz1 = DOOR
    B.box(T(dx0 - .03, 0, dz0), .06, .1, dz1 - dz0, P['mirror_f']); B.box(T(dx1 + .03, 0, dz0), .06, .1, dz1 - dz0, P['mirror_f']); B.box(T((dx0 + dx1) / 2, 0, dz1), dx1 - dx0 + .12, .1, .06, P['mirror_f'])
    ang = 1.25; ex, ey = dx1, .05
    pts = [Vector((ex, ey, dz0 + .02)), Vector((ex - math.cos(ang) * (dx1 - dx0), ey + math.sin(ang) * (dx1 - dx0), dz0 + .02))]
    quad(B, (pts[0].x, pts[0].y, dz0 + .02), (pts[1].x, pts[1].y, dz0 + .02), (pts[1].x, pts[1].y, dz1 - .03), (pts[0].x, pts[0].y, dz1 - .03), P['glass'], .03)
    B.box(T(pts[1].x, pts[1].y, dz0), .05, .05, dz1 - dz0 - .03, P['mirror_f'])
    # inside: the mirror and the shelf under it, the chair, a waiting chair, a TV, a poster, the fan, the tube light
    quad(B, (-2.4, WD - .06, B0 + 1.0), (.4, WD - .06, B0 + 1.0), (.4, WD - .06, B0 + 1.95), (-2.4, WD - .06, B0 + 1.95), P['mirror'], .03)
    B.box(T(-1.0, WD - .05, B0 + .97), 2.9, .03, .05, P['mirror_f']); B.box(T(-1.0, WD - .05, B0 + 1.95), 2.9, .03, .05, P['mirror_f'])
    B.box(T(-1.0, WD - .22, B0), 2.9, .34, .86, P['inner2'], .08); B.box(T(-1.0, WD - .22, B0 + .86), 2.95, .38, .04, P['black'], .05)
    if d:
        for i in range(9):
            x = -2.3 + i * .32; k = i % 4
            if k == 0: B.box(T(x, WD - .25, B0 + .9), .07, .16, .05, P['black'], .05)                                  # clipper
            elif k == 1: B.cyl(T(x, WD - .2, B0 + .9), .035, .035, .2, (P['bottle1'], P['bottle2'], P['bottle3'])[i % 3], n=8)   # bottle
            elif k == 2: B.cyl(T(x, WD - .22, B0 + .9), .05, .05, .1, P['powder'], n=8)                                 # powder
            else: B.box(T(x, WD - .22, B0 + .9), .2, .18, .07, P['towel'] if i % 2 else P['towel_b'], .05)            # towels
    barber_chair(B, -1.0, 1.35, math.pi)
    plastic_chair(B, 2.4, 1.6, math.pi, 'chair_r') if d else None
    B.box(T(hx - .12, 1.2, B0 + 1.6), .08, .7, .42, P['tv'], .03)
    B.box(T(-hx + .06, 1.2, B0 + 1.15), .02, .9, 1.0, P['poster'], .03)
    if d:
        for i in range(3):
            for j in range(3):
                cy, cz = 1.2 - .3 + i * .3, B0 + 1.15 + .2 + j * .3
                B.sphere(T(-hx + .08, cy, cz, s=(.3, 1, 1.15)), .09, (P['face1'], P['face2'], P['face3'])[(i + j) % 3], seg=8, rings=4)
                B.sphere(T(-hx + .085, cy, cz + .07, s=(.3, 1, .45)), .085, P['hair'], seg=8, rings=4)
        B.box(T(-.5, 1.1, z1 - .1), 1.2, .08, .05, P['tube'], .02)
        B.cyl(T(2.0, WD - .3, B0), .15, .15, .03, P['fan'], n=10); B.cyl(T(2.0, WD - .3, B0 + .03), .02, .02, 1.1, P['fan'], n=6)
        B.cyl(T(2.0, WD - .38, B0 + 1.15, rx=math.pi / 2), .18, .18, .1, P['fan_b'], n=12, top=True, bottom=True)
    # outside: the awning, the board on the roof, the bench, the price board, the generator and its wire, tyres
    corrugated(B, -hx - .15, hx + .15, .02, AW - .1, z1 - .12, z1 - .38, seed + 4, .45)
    for x in (-hx + .1, hx - .1): post(B, x, AW, z1 - .38, .05)
    B.box(T(0, -.06, z1 + .02), L - .9, .05, .72, P['box_y'], .05)                 # the board (the game paints it)
    B.box(T(0, -.09, z1 + .06), L - 1.1, .02, .64, P['towel'], .03)
    for x in (-2.3, 2.3): B.box(T(x, .1, z1), .06, .1, .7, P['black'])
    bench(B, -1.65, -.75, 1.7)
    B.box(T(.85, -1.65, .1, rx=.22), .62, .04, .9, P['chalk'], .05); B.box(T(.85, -1.95, .1, rx=-.22), .62, .04, .9, P['chalk'], .05)
    if d:
        for i in range(4): B.box(T(.85 + R.uniform(-.05, .05), -1.66 + i * .0, .45 + i * .12), R.uniform(.3, .45), .01, .03, P['chalk_t'], .02)
    generator(B, hx + .65, .4)
    if d:
        for i in range(6): B.box(T(hx + .25 - i * .25, -.15 - (i % 2) * .05, .1), .26, .02, .02, P['cable'])
        for k in range(2): B.cyl(T(-hx - .45, .6 + k * .05, .1 + k * .22), .32, .32, .2, P['tyre'], n=12, top=False, bottom=False, inner=P['tyre'])
        plastic_chair(B, -2.9, -.6, .4, 'chair_b')
    return B.finish()


# where the game puts things (game axes: x right, y up, z toward the street)
SPOTS = {
    'sign': {'x': 0, 'y': B0 + H + .02 + .36, 'z': .1, 'w': L - 1.2, 'h': .6},
    'serve': {'x': 1.9, 'z': .95},          # in front of the door
    'barber': {'x': -.95, 'z': -.75},       # behind the chair
    'chair': {'x': -1.0, 'z': -1.35},
    'wait': [[-2.2, .75, 0], [-1.3, .75, 0]],
    'size': [L + 1.6, WD + .5 - AW],
}


def export_one(ob):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    path = os.path.join(OUT, ob.name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, use_active_scene=True, export_format='GLB', export_yup=True, export_apply=True, export_texcoords=True, export_normals=True, export_extras=True)
    return os.path.getsize(path) // 1024


if not globals().get('NO_RUN'):
    try:
        open(LOGF, 'w').write('barber start %s\n' % (bpy.app.version_string,))
        win = bpy.context.window
        sc = bpy.data.scenes.get('NS Barber') or bpy.data.scenes.new('NS Barber')
        if win: win.scene = sc
        for o in list(sc.collection.objects): bpy.data.objects.remove(o, do_unlink=True)
        for m in list(bpy.data.meshes):
            if m.users == 0: bpy.data.meshes.remove(m)
        out = {}
        for detail in (True, False):
            t0 = time.time(); ob = barber(detail)
            if detail: bake_ao(ob)
            kb = export_one(ob); out[ob.name] = (len(ob.data.polygons), kb)
            log(ob.name, len(ob.data.polygons), 'faces', kb, 'KB', round(time.time() - t0, 1), 's')
            if not detail: ob.location.x = 9
        json.dump(SPOTS, open(os.path.join(OUT, 'bb_barber_spots.json'), 'w'), indent=1)
        log('ALL DONE', out); print('BARBER OK', out)
    except Exception:
        log('FAILED', traceback.format_exc()); print(traceback.format_exc())
