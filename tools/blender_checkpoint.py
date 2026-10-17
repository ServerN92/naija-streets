# Naija Streets: a Lagos police roadblock ("checkpoint") for the busy roads of Mushin.
# cp_roadblock: at the kerb, into the outer lane: two blue oil drums with white bands and a red-and-white plank on
#   trestles across half the lane, a plank with nails on the road, orange cones; on the roadside the officers' corner:
#   a black-and-white umbrella over a bench and plastic chairs, a small table with a radio and a flask, old tyres, a few
#   sandbags, and a board on a stand (left plain: the game writes POLICE CHECKPOINT on it).
# Same kit as the buka and the park office (tools/blender_buka.py -> tools/blender_farm.py). Z up; the kerb is the line
# y = 0, the road is toward -Y. Exported as cp_roadblock.glb and cp_roadblock_lod1.glb into Documents/naija_rooms/checkpoint.
#
# It never builds inside a project you have open: from Blender's UI it starts a second Blender in the background
# (no window, factory settings) that builds and exports, and your file is not touched.
import bpy, math, os, time, traceback, json, subprocess
from mathutils import Vector

HERE = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms')
OUT = os.path.join(HERE, 'checkpoint'); os.makedirs(OUT, exist_ok=True)
LOGF = os.path.join(HERE, 'checkpoint_log.txt')
def log(*a):
    with open(LOGF, 'a') as f: f.write(time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a) + '\n')

if not globals().get('NO_RUN') and not bpy.app.background:   # in the UI: build in a background Blender instead
    open(LOGF, 'w').write('checkpoint: starting a background Blender\n')
    p = subprocess.Popen([bpy.app.binary_path, '--background', '--factory-startup', '--python', os.path.join(HERE, 'blender_checkpoint.py')],
                         stdout=open(os.path.join(HERE, 'checkpoint_bg.txt'), 'w'), stderr=subprocess.STDOUT, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    print('CHECKPOINT BACKGROUND STARTED', p.pid)
    RUN = LIB = False
else:
    RUN = not globals().get('NO_RUN'); LIB = True

if LIB:
    BK = {'NO_RUN': True, '__name__': 'buka_lib'}
    exec(compile(open(os.path.join(HERE, 'blender_buka.py'), encoding='utf-8').read(), 'blender_buka.py', 'exec'), BK)
    MB, T, C, K, lin, post, vnoise = BK['MB'], BK['T'], BK['C'], BK['K'], BK['lin'], BK['post'], BK['vnoise']
    plastic_chair, bench, cooler, bake_ao = BK['plastic_chair'], BK['bench'], BK['cooler'], BK['bake_ao']
else:
    def lin(h):
        h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c)

P = {k: lin(v) for k, v in dict(
    drum='#1f4fa8', drum_d='#163a7a', band='#f2f2ee', red='#c8241e', white='#f4f2ea', cone='#f06a10', cone_w='#f4f2ea', steel='#7c8286',
    plank='#8a6a44', nail='#b8bcc0', tyre='#1b1b1b', tyre_d='#2a2a2a', sand='#b8a27a', sand_d='#9a8660', umb_b='#1c1e22', umb_w='#ece9e0',
    radio='#202224', flask='#c8302a', board='#f6f4ee', board_f='#1c1e22', table='#d8d4cc', asphalt='#3a3a3c').items()}


def drum(B, x, y):
    d = B.detail; n = 14 if d else 7
    B.cyl(T(x, y, 0), .29, .29, .88, P['drum'], n=n, top=True, var=.05)
    for z in (.18, .44, .7):
        B.cyl(T(x, y, z), .295, .295, .07, P['band'] if z != .44 else P['red'], n=n, top=False, var=.03)
    if d: B.cyl(T(x, y, .88), .26, .26, .015, P['drum_d'], n=n, var=.04)


def trestle(B, x, y, h=.62):
    for s in (-1, 1):
        B.box(T(x + s * .12, y, 0, ry=s * .25), .04, .4, h, P['plank'], .12)
    B.box(T(x, y, h - .04), .32, .08, .06, P['plank'], .12)


def barrier(B, x0, x1, y, z):   # a long plank in red and white stripes
    n = 6 if B.detail else 2; L = (x1 - x0) / n
    for i in range(n): B.box(T(x0 + L * (i + .5), y, z), L, .06, .16, P['red'] if i % 2 == 0 else P['white'], .05)


def cone(B, x, y):
    d = B.detail; n = 10 if d else 5
    B.box(T(x, y, 0), .34, .34, .03, P['cone'], .05)
    B.cyl(T(x, y, .03), .14, .025, .62, P['cone'], n=n, top=False, var=.04)
    if d: B.cyl(T(x, y, .3), .085, .07, .1, P['cone_w'], n=n, top=False, var=.02)


def spikes(B, x0, x1, y):   # a plank with nails lying across the lane
    B.box(T((x0 + x1) / 2, y, 0), x1 - x0, .16, .05, P['plank'], .14, f=6)
    if B.detail:
        for i in range(int((x1 - x0) / .09)):
            B.box(T(x0 + .05 + i * .09, y + (.03 if i % 2 else -.03), .05), .012, .012, .05, P['nail'])


def tyre(B, x, y, z, r=.33, w=.2):
    n = 14 if B.detail else 7
    B.cyl(T(x, y, z), r, r, w, P['tyre'], n=n, top=False, var=.06, inner=P['tyre_d'])
    B.cyl(T(x, y, z + w), r, r * .6, .001, P['tyre_d'], n=n, top=False, var=.05)


def umbrella(B, x, y, H=2.3, R=1.5):
    d = B.detail; n = 12 if d else 6
    B.cyl(T(x, y, 0), .025, .025, H + .15, P['steel'], n=6 if d else 4, top=False)
    B.cyl(T(x, y, 0), .22, .2, .07, P['tyre'], n=8 if d else 4)
    for i in range(n):
        a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n; c = P['umb_b'] if i % 2 else P['umb_w']
        p0 = Vector((x, y, H + .35)); p1 = Vector((x + R * math.cos(a0), y + R * math.sin(a0), H - .05)); p2 = Vector((x + R * math.cos(a1), y + R * math.sin(a1), H - .05))
        B.cls = 0; B.poly([p0, p1, p2], [c] * 3); B.poly([p0, p2, p1], [tuple(v * .5 for v in c)] * 3)


def roadblock(detail=True, seed=111):
    B = MB('cp_roadblock' + ('' if detail else '_lod1'), detail, seed); d = detail
    # in the lane: the drums, the striped plank on trestles, the nails, the cones
    drum(B, -2.4, -1.5); drum(B, .9, -2.3)
    trestle(B, -1.7, -1.25); trestle(B, -.2, -1.25); barrier(B, -2.1, .2, -1.25, .6)
    spikes(B, -1.6, 1.4, -3.1)
    for x, y in ((2.2, -1.3), (2.9, -2.4), (-3.3, -2.6)): cone(B, x, y)
    # on the roadside: the officers' corner
    umbrella(B, .6, 1.5)
    bench(B, .2, 1.95, 1.6)
    plastic_chair(B, 1.6, 1.2, -.6, 'chair_r'); plastic_chair(B, -1.0, 1.0, .4, 'chair_b')
    B.box(T(1.0, 1.0, .0), .55, .45, .7, P['table'], .05)
    if d:
        B.box(T(.95, 1.0, .7), .08, .05, .2, P['radio'], .05); B.box(T(.95, 1.02, .9), .01, .01, .18, P['steel'])   # the radio and its aerial
        B.cyl(T(1.15, .92, .7), .045, .045, .26, P['flask'], n=8)
        cooler(B, -1.8, 1.7, 0, .5, .36, .42, 'cool_b')
        for i, (x, y) in enumerate(((-.9, .35), (-.45, .35), (0, .35))):   # a low row of sandbags
            B.box(T(x, y, 0), .44, .3, .2, P['sand'] if i % 2 else P['sand_d'], .15, f=6); B.box(T(x + .2, y, .2), .44, .3, .18, P['sand_d'] if i % 2 else P['sand'], .15, f=6)
    for k, z in enumerate((0, .2, .4)): tyre(B, 3.3, .9, z, .34 - k * .01)
    tyre(B, 3.9, 1.6, 0)
    # the board on its stand, facing the road
    for x in (-3.95, -3.05): post(B, x, .2, 1.8, .03, P['steel'])
    B.box(T(-3.5, .18, .9), 1.1, .05, .9, P['board_f'], .04)
    B.box(T(-3.5, .15, .94), 1.0, .02, .82, P['board'], .03)
    return B.finish()


SPOTS = {   # in the game's axes: x along the road, z toward the road (Blender -Y)
    'sign': {'x': -3.5, 'y': 1.35, 'z': .128, 'w': 1.0, 'h': .82},
    'cops': [[-.8, .7, 0], [1.9, 1.5, 0], [.4, -1.2, 0]],             # [x, z, turn]: in the lane by the plank, by the drum, under the umbrella
    'walls': [[-2.4, 1.5, .3, .3, .9], [.9, 2.3, .3, .3, .9], [-.95, 1.25, 1.2, .08, .7], [.2, -1.95, .85, .2, .5], [3.4, -1.1, .55, .55, .62], [-3.5, -.18, .55, .05, 1.8], [-1.8, -1.7, .3, .2, .45]],
}


def export_one(ob):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    path = os.path.join(OUT, ob.name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, use_active_scene=True, export_format='GLB', export_yup=True, export_apply=True, export_texcoords=True, export_normals=True, export_extras=True)
    return os.path.getsize(path) // 1024


if RUN:
    try:
        open(LOGF, 'a').write('checkpoint build %s background=%s\n' % (bpy.app.version_string, bpy.app.background))
        if bpy.data.filepath and not bpy.app.background: raise RuntimeError('not inside your own project')
        for o in list(bpy.context.scene.objects): bpy.data.objects.remove(o, do_unlink=True)
        out = {}
        for detail in (True, False):
            t0 = time.time(); ob = roadblock(detail)
            if detail: bake_ao(ob)
            kb = export_one(ob); out[ob.name] = (len(ob.data.polygons), kb); log(ob.name, len(ob.data.polygons), 'faces', kb, 'KB', round(time.time() - t0, 1), 's')
            ob.location.x = 12 * len(out)
        json.dump(SPOTS, open(os.path.join(OUT, 'cp_roadblock_spots.json'), 'w'), indent=1)
        try:   # a picture to check it by: a strip of road and the kerb under it
            sc = bpy.context.scene; ob = bpy.data.objects.get('cp_roadblock'); ob.location = (0, 0, 0)
            bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -2.5, -.005)); rd = bpy.context.active_object; rd.scale = (12, 5, 1)
            m = bpy.data.materials.new('road'); m.use_nodes = True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*P['asphalt'], 1); rd.data.materials.append(m)
            cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
            cam.location = (6.5, -9.5, 4.4); cam.rotation_euler = (math.radians(66), 0, math.radians(34))
            sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.5; sun.rotation_euler = (math.radians(50), 0, math.radians(35)); sc.collection.objects.link(sun)
            if sc.world is None: sc.world = bpy.data.worlds.new('w')
            sc.world.use_nodes = True; bg = sc.world.node_tree.nodes.get('Background')
            if bg: bg.inputs[0].default_value = (.55, .62, .7, 1); bg.inputs[1].default_value = .9
            for o in sc.objects:
                if o.name.startswith('cp_') and o.name != 'cp_roadblock': o.hide_render = True
            sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
            sc.render.resolution_x, sc.render.resolution_y = 1100, 720; sc.render.filepath = os.path.join(OUT, 'cp_roadblock_preview.png')
            bpy.ops.render.render(write_still=True)
        except Exception: log('preview failed', traceback.format_exc())
        log('ALL DONE', out); print('CHECKPOINT OK', out)
    except Exception:
        log('FAILED', traceback.format_exc()); print(traceback.format_exc())
