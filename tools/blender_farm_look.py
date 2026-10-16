# Side views of the cow and hen moves, frame by frame (imports the exported .glb files).
import bpy, os, math, time, traceback
from mathutils import Vector
BASE = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms'); OUT = os.path.join(BASE, 'farm'); LOGF = os.path.join(BASE, 'farm_log.txt')
def log(*a):
    with open(LOGF, 'a') as f: f.write(time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a) + '\n')
try:
    win = bpy.context.window; old = win.scene
    sc = bpy.data.scenes.get('NS Farm Moves') or bpy.data.scenes.new('NS Farm Moves'); win.scene = sc
    for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)
    def imp(name, x, y, rz=0):
        before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, name + '.glb'))
        new = [o for o in bpy.data.objects if o not in before]
        for o in new:
            if o.parent is None: o.location = (x, y, 0); o.rotation_euler.z += rz
        return next(o for o in new if o.type == 'ARMATURE')
    def use(arm, key):   # play this armature's own track called `key` (names are the glTF animation names)
        ad = arm.animation_data; ad.action = None
        for t in ad.nla_tracks: t.mute = (t.name != key); t.is_solo = False
        log('tracks', arm.name, [t.name for t in ad.nla_tracks])
    cows = [imp('fm_cow', 0, y, 0) for y in (0, 3, 6)]
    use(cows[0], 'Walk'); use(cows[1], 'Graze'); use(cows[2], 'Idle')
    hens = [imp('fm_hen', 0, y, 0) for y in (-2.0, -1.4)]
    use(hens[0], 'Walk'); use(hens[1], 'Peck')
    sun = bpy.data.lights.new('Moves Sun', 'SUN'); sun.energy = 4.0; so = bpy.data.objects.new('Moves Sun', sun); so.rotation_euler = (math.radians(50), 0, math.radians(60)); sc.collection.objects.link(so)
    w = bpy.data.worlds.get('Moves World') or bpy.data.worlds.new('Moves World'); w.use_nodes = True; sc.world = w
    bg = w.node_tree.nodes.get('Background'); bg.inputs[0].default_value = (.6, .72, .9, 1); bg.inputs[1].default_value = 1.0
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0)); g = bpy.context.active_object
    gm = bpy.data.materials.new('moves_ground'); gm.use_nodes = True; gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.35, .22, .12, 1); g.data.materials.append(gm)
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.use_denoising = True; sc.render.resolution_x, sc.render.resolution_y = 800, 450
    try: sc.view_settings.view_transform = 'AgX'
    except Exception: pass
    cam = bpy.data.cameras.new('MovesCam'); cam.lens = 30; co = bpy.data.objects.new('MovesCam', cam); sc.collection.objects.link(co); sc.camera = co
    def aim(loc, look):
        co.location = loc; d = Vector(look) - Vector(loc); co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    aim((9.5, 1.5, 2.2), (0, 2.6, .9))
    for f in (1, 7, 13, 19):
        sc.frame_set(f); sc.render.filepath = os.path.join(OUT, 'moves_cow_%02d.png' % f); bpy.ops.render.render(write_still=True)
    aim((3.2, -2.6, 1.7), (0, .4, 1.1)); cam.lens = 30
    sc.frame_set(10); sc.render.filepath = os.path.join(OUT, 'moves_cow_front.png'); bpy.ops.render.render(write_still=True)
    aim((1.6, -1.7, .45), (0, -1.7, .2)); cam.lens = 35
    for f in (1, 4, 7, 10):
        sc.frame_set(f); sc.render.filepath = os.path.join(OUT, 'moves_hen_%02d.png' % f); bpy.ops.render.render(write_still=True)
    win.scene = old
    log('MOVES DONE')
except Exception:
    log('MOVES FAILED', traceback.format_exc())
