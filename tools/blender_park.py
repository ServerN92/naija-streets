# Naija Streets: the motor park union office and the chairman's cap, built in Blender for the online motor park.
# pk_office: the Park Union office in the yard of Mushin Motor Park. A block office painted union green and cream, a
#   zinc roof, a steel door, a window with burglar-proof bars; a zinc veranda on wooden posts with a long board on its
#   front edge (left plain: the game writes the union's name and the chairman on it); the secretary's ticket table
#   under the veranda (ticket books, the cash box, a megaphone) and a bench; the chairman's corner beside the office:
#   a big umbrella over a table, his plastic armchair, chairs for visitors, a cooler; a pole with two horn speakers,
#   a little union flag on the roof, and a fare board on two posts by the road (plain: the game paints the ticket).
# pk_fila: the chairman's cap, an aso-oke fila (navy with gold and white stripes), folded to one side; sits on the
#   head bone like the cult beret (band at 0.155 m above the head bone, front toward -Y).
# Same kit as the buka (tools/blender_buka.py -> tools/blender_farm.py). Z up, front -Y. Exported as pk_office.glb,
# pk_office_lod1.glb and pk_fila.glb into Documents/naija_rooms/park.
#
# It never builds inside a project you have open: run from Blender's UI with your own .blend open, it starts a second
# Blender in the background (no window, factory settings) that builds and exports, and your file is not touched.
import bpy, math, os, sys, time, traceback, json, subprocess
from mathutils import Vector

HERE = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms')
OUT = os.path.join(HERE, 'park'); os.makedirs(OUT, exist_ok=True)
LOGF = os.path.join(HERE, 'park_log.txt')
def log(*a):
    with open(LOGF, 'a') as f: f.write(time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a) + '\n')

if not globals().get('NO_RUN') and not bpy.app.background:   # in the UI: build in a background Blender instead
    open(LOGF, 'w').write('park: starting a background Blender\n')
    p = subprocess.Popen([bpy.app.binary_path, '--background', '--factory-startup', '--python', os.path.join(HERE, 'blender_park.py')],
                         stdout=open(os.path.join(HERE, 'park_bg.txt'), 'w'), stderr=subprocess.STDOUT, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    print('PARK BACKGROUND STARTED', p.pid)
    RUN = LIB = False
else:
    RUN = not globals().get('NO_RUN'); LIB = True

if LIB:   # the kit (nothing is built by loading it)
    BK = {'NO_RUN': True, '__name__': 'buka_lib'}
    exec(compile(open(os.path.join(HERE, 'blender_buka.py'), encoding='utf-8').read(), 'blender_buka.py', 'exec'), BK)
    MB, T, C, K, lin, post, vnoise = BK['MB'], BK['T'], BK['C'], BK['K'], BK['lin'], BK['post'], BK['vnoise']
    plastic_chair, bench, cooler, bake_ao, corrugated = BK['plastic_chair'], BK['bench'], BK['cooler'], BK['bake_ao'], BK['corrugated']
else:
    def lin(h):
        h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c)

P = {k: lin(v) for k, v in dict(
    green='#1d7a46', green_d='#145a33', cream='#efe6cf', cream_d='#d9ceb4', white='#f4f2ea', door='#2a4f8a', door_d='#1d3a66', bar='#1c1c1e',
    glass='#1e2a2e', curtain='#c8a040', yellow='#e9b414', umb_y='#e9b414', umb_g='#1d7a46', red='#c42a22', black='#18181a', steel='#8a9094',
    ticket='#f0e2b0', ticket2='#e8a0a0', book='#2a6ab0', box='#5a6066', mega='#e8e6e0', mega_r='#c42a22', horn='#d8d8d4', flag_w='#f4f2ea',
    poster='#e23a2a', poster2='#2a6ad8', tyre='#1b1b1b', crate='#2a6ab0', crate2='#e9b414', bucket='#2a8ad0', cal='#f6f2e8', fila='#1c2f5e', gold='#e0b030').items()}
H = 2.8            # the office walls
FX0, FX1, FY0, FY1 = -1.5, 2.7, -.9, 2.1   # the room: x from FX0 to FX1, front wall at FY0, back at FY1
VY = -2.72         # the veranda's front edge
BAND = 1.1         # the green paint up to here


def wall(B, x0, x1, y0, y1, z0, z1):
    """A block wall from z0 to z1: green below the band, cream above."""
    if z0 < BAND + .12 < z1:
        B.box(T((x0 + x1) / 2, (y0 + y1) / 2, z0), x1 - x0, y1 - y0, BAND + .12 - z0, P['green'], .06, f=2)
        B.box(T((x0 + x1) / 2, (y0 + y1) / 2, BAND + .12), x1 - x0, y1 - y0, z1 - BAND - .12, P['cream'], .07, f=2)
    else:
        B.box(T((x0 + x1) / 2, (y0 + y1) / 2, z0), x1 - x0, y1 - y0, z1 - z0, P['green'] if z1 <= BAND + .13 else P['cream'], .07, f=2)


def office(detail=True, seed=91):
    B = MB('pk_office' + ('' if detail else '_lod1'), detail, seed); R = B.R; d = detail
    B.cls = 4
    B.box(T(0, -.4, 0), 7.4, 5.2, .12, C['conc'], .12, f=1.4)                      # the slab
    z0, z1 = .12, .12 + H
    t = .2
    # the room
    wall(B, FX0, FX1, FY1 - t, FY1, z0, z1)                                           # back
    wall(B, FX0, FX0 + t, FY0, FY1, z0, z1); wall(B, FX1 - t, FX1, FY0, FY1, z0, z1)  # sides
    # the front: wall, window (x -1.2..0.2), wall, door (x 1.4..2.3), wall
    wx0, wx1, sill, head = -1.2, .2, .95, 2.05; dx0, dx1, dh = 1.4, 2.3, 2.15
    wall(B, FX0, wx0, FY0, FY0 + t, z0, z1)
    wall(B, wx0, wx1, FY0, FY0 + t, z0, z0 + sill); wall(B, wx0, wx1, FY0, FY0 + t, z0 + head, z1)
    wall(B, wx1, dx0, FY0, FY0 + t, z0, z1)
    wall(B, dx0, dx1, FY0, FY0 + t, z0 + dh, z1)
    wall(B, dx1, FX1, FY0, FY0 + t, z0, z1)
    B.box(T((FX0 + FX1) / 2, (FY0 + FY1) / 2, z0 + .005), FX1 - FX0 - .4, FY1 - FY0 - .4, .01, C['conc_d'], .1)   # the floor inside
    # the window: dark inside, a curtain, the frame and the bars
    B.face([Vector((wx0, FY0 + .14, z0 + sill)), Vector((wx1, FY0 + .14, z0 + sill)), Vector((wx1, FY0 + .14, z0 + head)), Vector((wx0, FY0 + .14, z0 + head))], P['glass'], .05)
    if d: B.face([Vector((wx0 + .05, FY0 + .12, z0 + sill + .5)), Vector((wx0 + .55, FY0 + .12, z0 + sill + .5)), Vector((wx0 + .55, FY0 + .12, z0 + head - .05)), Vector((wx0 + .05, FY0 + .12, z0 + head - .05))], P['curtain'], .12)
    for (a, b, c2, e) in ((wx0, wx1, sill - .04, sill), (wx0, wx1, head, head + .04)): B.box(T((a + b) / 2, FY0 - .01, z0 + c2), b - a + .08, .06, e - c2, P['white'], .04)
    nb = 11 if d else 4
    for i in range(nb + 1): B.box(T(wx0 + (wx1 - wx0) * i / nb, FY0 + .02, z0 + sill), .022, .022, head - sill, P['bar'], .05)
    for zz in ((sill + head) / 2, head - .06, sill + .06): B.box(T((wx0 + wx1) / 2, FY0 + .01, z0 + zz), wx1 - wx0, .025, .025, P['bar'], .05)
    # the steel door (closed), its frame and handle
    B.box(T((dx0 + dx1) / 2, FY0 + .1, z0), dx1 - dx0 - .04, .05, dh - .02, P['door'], .06)
    if d:
        for zz in (.4, 1.05, 1.7): B.box(T((dx0 + dx1) / 2, FY0 + .07, z0 + zz), dx1 - dx0 - .2, .01, .42, P['door_d'], .05)
        B.box(T(dx1 - .15, FY0 + .05, z0 + 1.0), .1, .04, .03, P['steel'])
    for x in (dx0, dx1 - .05): B.box(T(x + .025, FY0 - .005, z0), .05, .07, dh, P['white'], .04)
    # posters on the front wall: a union calendar and a notice
    if d:
        B.cls = 0
        B.face([Vector((.42, FY0 - .012, 1.45)), Vector((1.12, FY0 - .012, 1.45)), Vector((1.12, FY0 - .012, 2.15)), Vector((.42, FY0 - .012, 2.15))], P['cal'], .05)
        B.face([Vector((.47, FY0 - .014, 1.95)), Vector((1.07, FY0 - .014, 1.95)), Vector((1.07, FY0 - .014, 2.1)), Vector((.47, FY0 - .014, 2.1))], P['green'], .05)
        for i in range(4): B.face([Vector((.5 + i * .15, FY0 - .014, 1.52)), Vector((.6 + i * .15, FY0 - .014, 1.52)), Vector((.6 + i * .15, FY0 - .014, 1.85)), Vector((.5 + i * .15, FY0 - .014, 1.85))], (P['poster'], P['poster2'], P['yellow'], P['green'])[i], .1)
    # the roof of the room (falling to the back) and the veranda (falling to the road)
    corrugated(B, FX0 - .2, FX1 + .2, FY0, FY1 + .35, z1 + .32, z1 + .08, seed, .35)
    corrugated(B, FX0 - .2, FX1 + .2, FY0, VY, z1 + .3, 2.56, seed + 3, .45)
    for x in (FX0 - .05, FX1 + .05): post(B, x, VY + .08, 2.56, .07, C['wood_d'])
    B.box(T((FX0 + FX1) / 2, VY + .08, 2.42), FX1 - FX0 + .3, .12, .14, C['wood'], .12)     # the beam under the edge
    # the board on the veranda's front edge: green frame, white face (the game paints it)
    B.cls = 0
    B.box(T((FX0 + FX1) / 2, VY, 2.04), 4.36, .06, .56, P['green_d'], .05)
    B.box(T((FX0 + FX1) / 2, VY - .025, 2.07), 4.24, .02, .5, P['white'], .03)
    # under the veranda: the secretary's ticket table (in front of the window) and his chair, a bench by the door
    tx, ty = -.5, -1.75
    B.box(T(tx, ty, .84), 1.0, .6, .04, C['wood_l'], .12, f=7)
    for sx in (-1, 1):
        for sy in (-1, 1): B.box(T(tx + sx * .44, ty + sy * .24, .12), .05, .05, .72, C['wood_d'], .1)
    plastic_chair(B, tx, ty + .55, 0, 'chair_b')
    bench(B, .85, -1.12, 1.05)
    if d:
        for i in range(3): B.box(T(tx - .3 + i * .16, ty - .08, .88), .12, .2, .02 + i * .012, (P['ticket'], P['ticket2'], P['ticket'])[i], .05)   # ticket books
        B.box(T(tx + .25, ty + .05, .88), .26, .18, .12, P['box'], .06)              # the cash box
        B.cyl(T(tx + .05, ty - .15, .93, ry=math.pi / 2), .035, .09, .2, P['mega'], n=10, top=False, bottom=True)   # the megaphone
        B.box(T(tx + .05, ty - .16, .88), .05, .04, .07, P['mega_r'])
        B.cyl(T(2.45, -1.3, .12), .17, .19, .38, P['bucket'], n=10, top=False, bottom=True, inner=lin('#1e5a8a'))   # a bucket
        for i in range(2): B.box(T(2.45, -2.1 + i * .02, .12 + i * .3), .42, .32, .3, (P['crate'], P['crate2'])[i], .06)   # crates
    # the chairman's corner, left of the office: umbrella, table, his armchair, chairs for visitors, a cooler
    cx, cy = -2.65, -1.2
    B.cyl(T(cx, cy, .12), .03, .025, 2.45, C['steel'], n=6 if d else 4, top=False)
    n = 12 if d else 6; r = 1.55
    for i in range(n):
        a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n; c = P['umb_y'] if i % 2 else P['umb_g']
        p0 = Vector((cx, cy, 2.62)); p1 = Vector((cx + r * math.cos(a0), cy + r * math.sin(a0), 2.18)); p2 = Vector((cx + r * math.cos(a1), cy + r * math.sin(a1), 2.18))
        B.cls = 0; B.poly([p0, p1, p2], [c] * 3); B.poly([p0, p2, p1], [tuple(v * .5 for v in c)] * 3)
        if d: B.face([p1, p2, p2 + Vector((0, 0, -.14)), p1 + Vector((0, 0, -.14))], c, .05); B.face([p1 + Vector((0, 0, -.14)), p2 + Vector((0, 0, -.14)), p2, p1], tuple(v * .6 for v in c), .05)
    B.box(T(cx, cy, .84), .95, .95, .04, P['white'], .05)
    for sx in (-1, 1):
        for sy in (-1, 1): B.box(T(cx + sx * .4, cy + sy * .4, .12), .04, .04, .72, P['white'], .05)
    # his armchair: a big white plastic one with arms, facing the road
    ax, ay = cx, cy + .72
    B.box(T(ax, ay, .54), .6, .55, .06, P['white'], .05); B.box(T(ax, ay + .27, .56, rx=-.15), .6, .06, .62, P['white'], .05)
    for s in (-1, 1): B.box(T(ax + s * .29, ay, .6), .05, .5, .22, P['white'], .05)
    if d:
        for sx in (-1, 1):
            for sy in (-1, 1): B.box(T(ax + sx * .26, ay + sy * .22, .12), .05, .05, .42, P['white'], .05)
        B.box(T(ax, ay + .05, .6), .5, .42, .05, P['green'], .1)                      # a cushion
        plastic_chair(B, cx - .75, cy - .55, -2.3, 'chair_r'); plastic_chair(B, cx + .7, cy - .7, 2.4, 'chair_g')
        B.box(T(cx + .15, cy - .1, .88), .2, .14, .02, P['book'], .05)               # his notebook and phone
        B.box(T(cx - .2, cy + .05, .88), .08, .15, .015, P['black'])
        cooler(B, -1.95, .55, .12, .55, .4, .48, 'cool_r')
        B.cyl(T(-3.3, .6, .12), .3, .3, .2, P['tyre'], n=12, inner=P['tyre'])        # an old tyre
    # the horn speakers on a pole, the flag on the roof
    post(B, -3.4, 1.7, 3.4, .045, C['steel'])
    for s in (-1, 1):
        B.cyl(T(-3.4, 1.7, 3.2, rz=s * .6 - math.pi / 2, rx=math.pi / 2 - .25), .05, .2, .38, P['horn'], n=10 if d else 5, top=False, bottom=True, inner=lin('#3a3a3a'))
    post(B, FX1 - .3, FY1 - .2, H + .12 + 1.6, .02, C['steel'])
    B.cls = 0; fz = H + .12 + 1.6
    for k, col in enumerate((P['green'], P['flag_w'], P['green'])):
        a = Vector((FX1 - .3, FY1 - .2 - .0, fz - .02 - k * .14)); bb = Vector((FX1 - .3 + .62, FY1 - .2 + .05, fz - .04 - k * .14))
        q = [a, bb, bb + Vector((0, 0, -.14)), a + Vector((0, 0, -.14))]; B.poly(q, [col] * 4); B.poly(q[::-1], [col] * 4)
    # the fare board by the road on two posts (plain: the game paints the ticket price and the routes)
    bx, by = 3.3, -2.85
    for x in (bx - .62, bx + .62): post(B, x, by + .05, 2.05, .04, C['wood_d'])
    B.box(T(bx, by + .03, 1.05), 1.42, .05, .92, P['green_d'], .05)
    B.box(T(bx, by, 1.09), 1.32, .02, .84, P['white'], .03)
    return B.finish()


def fila(detail=True, seed=92):
    """The chairman's cap: a soft aso-oke fila, folded down to the right."""
    B = MB('pk_fila' + ('' if detail else '_lod1'), detail, seed); n = 48 if detail else 12
    def stripe(i):   # navy cloth with gold and white woven stripes
        return (P['fila'], P['fila'], P['fila'], P['gold'], P['fila'], P['fila'], P['fila'], P['white'])[i % 8] if detail else P['fila']
    rows = [(.142, .1, .11), (.158, .103, .113), (.195, .107, .117), (.232, .109, .119), (.258, .106, .116)]
    rings = []
    for (z, rx, ry) in rows:
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n; x, y = rx * math.cos(a), ry * math.sin(a)
            lean = max(0, x / rx) ** 1.5 * (z - .17) * .55             # the top folds over to the right
            ring.append(Vector((x + (z - .15) * .05, y, z - lean)))
        rings.append(ring)
    B.cls = 0
    for k in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n; col = stripe(i) if k > 0 else P['gold']
            q = [rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]]
            B.poly(q, [B.shade(col, p, .08) for p in q], True)
            B.poly(q[::-1], [tuple(v * .4 for v in P['fila'])] * 4, True)   # the inside
    top = rings[-1]; c = sum(top, Vector()) / n + Vector((.01, 0, .012))
    for i in range(n):
        j = (i + 1) % n
        B.poly([top[i], top[j], c], [B.shade(P['fila'], top[i], .08), B.shade(P['fila'], top[j], .08), B.shade(P['fila'], c, .08)], True)
    return B.finish(doubles=False)


SPOTS = {   # in the game's axes: x right, y up, z toward the road (Blender -Y)
    'sign': {'x': (FX0 + FX1) / 2, 'y': 2.32, 'z': -(VY - .036), 'w': 4.24, 'h': .5},
    'board': {'x': 3.3, 'y': 1.51, 'z': 2.85 + .012, 'w': 1.32, 'h': .84},
    'desk': {'x': -.5, 'z': 2.45},             # stand here, in front of the ticket table, to talk to the secretary
    'sec': {'x': -.5, 'z': 1.2, 'ry': 0},      # the union secretary on his chair behind the table, facing the road
    'chair': {'x': -2.65, 'z': .48, 'ry': 0},  # the chairman's armchair
    'walls': [[(FX0 + FX1) / 2, -(FY0 + FY1) / 2, (FX1 - FX0) / 2, (FY1 - FY0) / 2, 2.95], [-.5, 1.75, .5, .3, .86], [-2.65, 1.2, .48, .48, .86],
              [.85, 1.12, .55, .16, .47], [FX0 - .05, -VY - .08, .08, .08, 2.5], [FX1 + .05, -VY - .08, .08, .08, 2.5], [2.68, 2.8, .05, .05, 2], [3.92, 2.8, .05, .05, 2],
              [-1.95, -.55, .3, .22, .6], [-3.4, -1.7, .06, .06, 3.4], [2.45, 2.0, .25, .5, .6]],
}


def export_one(ob):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    path = os.path.join(OUT, ob.name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, use_active_scene=True, export_format='GLB', export_yup=True, export_apply=True, export_texcoords=True, export_normals=True, export_extras=True)
    return os.path.getsize(path) // 1024


if RUN:
    try:
        open(LOGF, 'a').write('park build %s background=%s\n' % (bpy.app.version_string, bpy.app.background))
        if bpy.data.filepath and not bpy.app.background: raise RuntimeError('not inside your own project')
        for o in list(bpy.context.scene.objects): bpy.data.objects.remove(o, do_unlink=True)   # (the factory cube, camera and light)
        out = {}
        for fn, detail in ((office, True), (office, False), (fila, True)):
            t0 = time.time(); ob = fn(detail)
            if fn is office and detail: bake_ao(ob)
            kb = export_one(ob); out[ob.name] = (len(ob.data.polygons), kb)
            log(ob.name, len(ob.data.polygons), 'faces', kb, 'KB', round(time.time() - t0, 1), 's')
            ob.location.x = 9 * len(out)
        json.dump(SPOTS, open(os.path.join(OUT, 'pk_office_spots.json'), 'w'), indent=1)
        # a picture to check it by
        try:
            sc = bpy.context.scene; cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
            ofc = bpy.data.objects.get('pk_office'); ofc.location = (0, 0, 0)
            cam.location = (7.5, -13.0, 6.2); cam.rotation_euler = (math.radians(66), 0, math.radians(30))
            sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.5; sun.rotation_euler = (math.radians(50), 0, math.radians(35)); sc.collection.objects.link(sun)
            if sc.world is None: sc.world = bpy.data.worlds.new('w')
            sc.world.use_nodes = True; bg = sc.world.node_tree.nodes.get('Background')
            if bg: bg.inputs[0].default_value = (.55, .62, .7, 1); bg.inputs[1].default_value = .9
            for o in sc.objects:
                if o.name.startswith('pk_') and o.name != 'pk_office': o.hide_render = True
            sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
            sc.render.resolution_x, sc.render.resolution_y = 1100, 720; sc.render.filepath = os.path.join(OUT, 'pk_office_preview.png')
            bpy.ops.render.render(write_still=True)
            fl = bpy.data.objects.get('pk_fila'); ofc.hide_render = True; fl.hide_render = False; fl.location = (0, 0, 0)
            cam.location = (.35, -.55, .42); cam.rotation_euler = (math.radians(70), 0, math.radians(32)); sc.render.resolution_x, sc.render.resolution_y = 600, 500
            sc.render.filepath = os.path.join(OUT, 'pk_fila_preview.png'); bpy.ops.render.render(write_still=True)
        except Exception: log('preview failed', traceback.format_exc())
        log('ALL DONE', out); print('PARK OK', out)
    except Exception:
        log('FAILED', traceback.format_exc()); print(traceback.format_exc())
