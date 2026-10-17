# Naija Streets: the POS stand (agent banking), built in Blender for the online businesses.
# A Lagos roadside POS point: a big green and white umbrella over a small wooden kiosk with a glass front (SIM packs and
# recharge cards inside), the POS machine and its paper roll on the counter, a padlocked steel cash box, the agent's
# plastic chair, a bench for the people waiting, a small solar panel on a pole with its battery, a plastic stool,
# and a banner frame by the road (left plain: the game writes the owner's POS name and services on it).
# Same kit as the buka and the salon. Z up, front -Y. Exported as ps_pos.glb and ps_pos_lod1.glb into
# Documents/naija_rooms/pos, in a scene of its own ("NS POS").
import bpy, math, os, time, traceback, json
from mathutils import Vector

HERE = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms')
BK = {'NO_RUN': True, '__name__': 'buka_lib'}
exec(compile(open(os.path.join(HERE, 'blender_buka.py'), encoding='utf-8').read(), 'blender_buka.py', 'exec'), BK)
MB, T, C, K, lin, post, vnoise = BK['MB'], BK['T'], BK['C'], BK['K'], BK['lin'], BK['post'], BK['vnoise']
plastic_chair, bench, bake_ao = BK['plastic_chair'], BK['bench'], BK['bake_ao']

OUT = os.path.join(HERE, 'pos'); os.makedirs(OUT, exist_ok=True)
LOGF = os.path.join(HERE, 'pos_log.txt')
def log(*a):
    with open(LOGF, 'a') as f: f.write(time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a) + '\n')

P = {k: lin(v) for k, v in dict(
    umb_g='#13a05a', umb_w='#f4f2ea', umb_d='#0c6a3c', pole='#d8d6d0', kiosk='#b88a52', kiosk_d='#8a6438', paint_g='#1d8a4e', paint_y='#e9b414',
    glass='#8fb6c2', glass_f='#e8e6de', pos='#1a1c1e', pos_s='#4ac0e8', paper='#f6f6f2', box='#6e7478', box_d='#4a5054', lock='#d8b030',
    sim1='#e9b414', sim2='#e23a2a', sim3='#2a6ad8', sim4='#13a05a', card='#f0e6c8', solar='#1c2a4a', solar_f='#c8ccd0', batt='#2a2a2c',
    banner='#f6f2e8', banner_f='#13a05a', black='#18181a', mat='#c8b48a').items()}
UR, UH = 1.75, 2.35          # umbrella radius and height


def umbrella(B, x, y):
    d = B.detail; n = 16 if d else 8
    B.cyl(T(x, y, 0), .05, .04, UH + .1, P['pole'], n=8 if d else 4)
    B.cyl(T(x, y, 0), .28, .22, .08, P['black'], n=10 if d else 5)                  # the weighted base
    for i in range(n):   # the canopy: panels of green and white, a little dip between the ribs
        a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n; col = P['umb_g'] if i % 2 == 0 else P['umb_w']
        top = Vector((x, y, UH + .38))
        e0 = Vector((x + math.cos(a0) * UR, y + math.sin(a0) * UR, UH - .02)); e1 = Vector((x + math.cos(a1) * UR, y + math.sin(a1) * UR, UH - .02))
        m = Vector((x + math.cos((a0 + a1) / 2) * UR * .98, y + math.sin((a0 + a1) / 2) * UR * .98, UH + .03))
        B.cls = 0
        for q in ((top, e0, m), (top, m, e1)):
            B.face(list(q), col, .05); B.face(list(q)[::-1], tuple(c * .6 for c in col), .05)
        if d:   # the hanging edge
            B.face([e0, e1, e1 + Vector((0, 0, -.16)), e0 + Vector((0, 0, -.16))], P['umb_d'] if i % 2 == 0 else P['umb_w'], .05)
            B.face([e0 + Vector((0, 0, -.16)), e1 + Vector((0, 0, -.16)), e1, e0], P['umb_d'] if i % 2 == 0 else P['umb_w'], .05)


def kiosk(B, x, y):
    d = B.detail
    W, D, H = 1.4, .62, .92
    B.box(T(x, y, 0), W, D, .06, P['kiosk_d'], .1)                                   # foot
    B.box(T(x, y + .02, .06), W - .04, D - .06, H - .1, P['kiosk'], .14, f=6)        # body (planks)
    if d:
        for i in range(7): B.box(T(x - W / 2 + .1 + i * (W - .2) / 6, y - D / 2 + .02, .08), .015, .01, H - .14, P['kiosk_d'], .1)
    B.box(T(x, y, H - .04), W + .06, D + .06, .04, P['paint_g'], .06)               # the top
    # the glass case on top: SIM packs and recharge cards
    gx0, gx1, gy0, gy1, gz0, gz1 = x - .62, x + .1, y - .22, y + .2, H, H + .32
    for (a, b) in ((gx0, gy0), (gx1, gy0), (gx0, gy1), (gx1, gy1)): B.box(T(a, b, gz0), .025, .025, gz1 - gz0, P['glass_f'])
    B.box(T((gx0 + gx1) / 2, (gy0 + gy1) / 2, gz1), gx1 - gx0 + .03, gy1 - gy0 + .03, .02, P['glass_f'])
    B.face([Vector((gx0, gy0, gz0)), Vector((gx1, gy0, gz0)), Vector((gx1, gy0, gz1)), Vector((gx0, gy0, gz1))], P['glass'], .03)
    if d:
        for i in range(8):
            c = (P['sim1'], P['sim2'], P['sim3'], P['sim4'])[i % 4]
            B.box(T(gx0 + .06 + (i % 4) * .17, (gy0 + gy1) / 2 + (i // 4) * .12 - .06, gz0 + .01), .12, .07, .015, c, .05)
        for i in range(3): B.box(T(gx0 + .1 + i * .2, gy1 - .04, gz0 + .01, rx=-.6), .14, .01, .18, P['card'], .05)
    # the POS machine and its paper, a notebook, the calculator
    B.box(T(x + .38, y - .05, H, rz=.25), .1, .2, .05, P['pos'], .05)
    B.box(T(x + .38, y - .05, H + .05, rz=.25, rx=-.35), .08, .09, .01, P['pos_s'], .03)
    if d:
        B.box(T(x + .4, y + .07, H + .055, rz=.25), .06, .03, .025, P['paper'], .02)
        B.box(T(x + .2, y + .15, H, rz=-.2), .2, .26, .02, P['paint_y'], .05)
        B.box(T(x + .58, y + .12, H), .08, .12, .02, P['black'], .03)
    return H


def cash_box(B, x, y):
    B.box(T(x, y, 0), .46, .34, .3, P['box'], .08, f=8)
    B.box(T(x, y, .3), .48, .36, .03, P['box_d'], .05)
    if B.detail: B.box(T(x, y - .18, .2), .06, .02, .07, P['lock'], .03)


def solar(B, x, y):
    post(B, x, y, 2.0, .035, P['pole'])
    B.box(T(x, y, 2.0, rx=.55), .7, .5, .03, P['solar'], .04)
    if B.detail:
        B.box(T(x, y, 1.995, rx=.55), .74, .54, .01, P['solar_f'], .03)
        for i in range(3): B.box(T(x - .24 + i * .24, y, 2.032, rx=.55), .005, .5, .003, P['solar_f'])
        B.box(T(x + .1, y + .05, 0), .28, .18, .22, P['batt'], .05)
        for i in range(4): B.box(T(x - .05 + i * .0, y - .2 * i * 0, .2), .01, .01, .01, P['black'])


def pos(detail=True, seed=81):
    B = MB('ps_pos' if detail else 'ps_pos_lod1', detail, seed); R = B.R; d = detail
    # a worn mat of laterite and an old rug under the stand
    B.cls = 0
    B.box(T(0, .35, 0), 3.4, 2.6, .03, C['conc_d'], .15, f=1.2)
    if d: B.box(T(0, .45, .03), 1.6, 1.1, .006, P['mat'], .2, f=4)
    umbrella(B, -.1, .45)
    H = kiosk(B, 0, .5)
    cash_box(B, .35, 1.0)
    plastic_chair(B, -.15, 1.25, math.pi, 'chair_g')
    bench(B, 1.55, -.55, 1.3)
    if d:
        plastic_chair(B, -1.55, -.4, .5, 'chair_b')
        B.cyl(T(-1.0, 1.1, 0), .17, .13, .4, P['paint_y'], n=10)                    # a stool (upturned bucket)
    solar(B, 1.35, 1.25)
    # the banner by the road: two poles and a framed board (the game paints it)
    for x in (-1.15, 1.15): post(B, x, -1.45, 1.95, .03, P['pole'])
    B.box(T(0, -1.45, 1.05), 2.36, .04, .88, P['banner_f'], .04)
    B.box(T(0, -1.48, 1.09), 2.24, .02, .8, P['banner'], .03)
    return B.finish()


SPOTS = {
    'sign': {'x': 0, 'y': 1.49, 'z': 1.495, 'w': 2.2, 'h': .78},
    'serve': {'x': 0, 'z': .35},
    'agent': {'x': -.15, 'z': -1.15},
    'wait': [[1.3, .55, 0], [1.85, .55, 0], [-1.5, .45, .5]],
}


def export_one(ob):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    path = os.path.join(OUT, ob.name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, use_active_scene=True, export_format='GLB', export_yup=True, export_apply=True, export_texcoords=True, export_normals=True, export_extras=True)
    return os.path.getsize(path) // 1024


if not globals().get('NO_RUN'):
    try:
        open(LOGF, 'w').write('pos start %s\n' % (bpy.app.version_string,))
        win = bpy.context.window; was = win.scene if win else None; own_file = bool(bpy.data.filepath) and not globals().get('KEEP')
        sc = bpy.data.scenes.get('NS POS') or bpy.data.scenes.new('NS POS')
        if win: win.scene = sc
        for o in list(sc.collection.objects): bpy.data.objects.remove(o, do_unlink=True)
        for m in list(bpy.data.meshes):
            if m.users == 0: bpy.data.meshes.remove(m)
        out = {}
        for detail in (True, False):
            t0 = time.time(); ob = pos(detail)
            if detail: bake_ao(ob)
            kb = export_one(ob); out[ob.name] = (len(ob.data.polygons), kb)
            log(ob.name, len(ob.data.polygons), 'faces', kb, 'KB', round(time.time() - t0, 1), 's')
            if not detail: ob.location.x = 6
        json.dump(SPOTS, open(os.path.join(OUT, 'ps_pos_spots.json'), 'w'), indent=1)
        log('ALL DONE', out); print('POS OK', out)
    except Exception:
        log('FAILED', traceback.format_exc()); print(traceback.format_exc())

    finally:
        if globals().get('NO_RUN') is None and 'own_file' in dir() and own_file:   # your own project was open: leave it as it was
            try:
                if win and was: win.scene = was
                sc2 = bpy.data.scenes.get('NS POS')
                if sc2:
                    for o in list(sc2.collection.all_objects):
                        me = o.data if o.type == 'MESH' else None; bpy.data.objects.remove(o, do_unlink=True)
                        if me and me.users == 0: bpy.data.meshes.remove(me)
                    bpy.data.scenes.remove(sc2)
                m = bpy.data.materials.get('FM_VCOL')
                if m and m.users == 0: bpy.data.materials.remove(m)
            except Exception: pass
