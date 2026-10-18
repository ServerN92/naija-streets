# Naija Streets: build the "new life" pieces (tools/blender_life.py) in a background Blender, so the Blender the user
# has open is never touched:   blender -b --factory-startup --python life_job.py -- <job> [names...]
#   job 'pieces' : the outside pieces -> life/<name>.json (for the game's packer) and life/look_<name>.png
#   job 'room'   : int_faceme through rooms_all.py's build_room (light baked) -> out/int_faceme.glb + _lm.jpg, look png
# Log: Documents/naija_rooms/life/job_log.txt
import bpy, sys, os, math, time, traceback, importlib
BASE = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms'); T = os.path.join(BASE, 'tools'); LIFE = os.path.join(BASE, 'life')
os.makedirs(LIFE, exist_ok=True)
LOG = os.path.join(LIFE, 'job_log.txt')
def log(*a):
    with open(LOG, 'a') as f: f.write(time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a) + '\n')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
job, names = (argv[0] if argv else 'pieces'), argv[1:]
if T not in sys.path: sys.path.insert(0, T)


def look(objs, path, views=((1, -1.3, .8),), size=(900, 700), ortho=None, target=None):
    """A quick picture of some objects (vertex colours, soft light) from a direction."""
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'VERTEX'; sh.show_shadows = True; sh.show_cavity = True
    try: sh.cavity_type = 'BOTH'
    except Exception: pass
    sc.display.shadow_focus = .6
    sc.render.resolution_x, sc.render.resolution_y = size; sc.render.film_transparent = False
    sc.world = sc.world or bpy.data.worlds.new('W'); sc.world.color = (.55, .6, .65)
    import mathutils
    pts = [o.matrix_world @ mathutils.Vector(c) for o in objs for c in o.bound_box]
    lo = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    ctr = target or (lo + hi) / 2; rad = (hi - lo).length / 2
    cam = bpy.data.objects.get('LookCam')
    if not cam:
        cam = bpy.data.objects.new('LookCam', bpy.data.cameras.new('LookCam')); sc.collection.objects.link(cam)
    sc.camera = cam; cam.data.lens = 35
    out = []
    for i, d in enumerate(views):
        d = mathutils.Vector(d).normalized()
        if ortho: cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
        else: cam.data.type = 'PERSP'
        cam.location = ctr + d * rad * 2.4
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        p = path.replace('.png', f'_{i}.png') if len(views) > 1 else path
        sc.render.filepath = p; bpy.ops.render.render(write_still=True); out.append(p)
    return out


try:
    log('job', job, names)
    import blender_houses, blender_sports, blender_venues, blender_life
    for m in (blender_houses, blender_sports, blender_venues, blender_life): importlib.reload(m)
    L = blender_life
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    if job == 'pieces':
        made = L.build_all(names or None)
        log('built', made)
        for fn in L.OUTSIDE:
            if names and fn.__name__ not in names: continue
            for sfx in ('', '_lod1'):
                ob = next((o for o in bpy.data.objects if o.name == {'toilet': 'ns_toilet', 'toilet_door': 'ns_toilet_door', 'mytent': 'ns_mytent', 'boutique': 'ns_boutique'}[fn.__name__] + sfx), None)
                if not ob: continue
                for o in bpy.data.objects: o.hide_render = (o is not ob) and o.name != 'LookCam'
                look([ob], os.path.join(LIFE, f'look_{ob.name}.png'), views=((.8, -1.2, .65), (-1.0, 1.1, .8)) if not sfx else ((.8, -1.2, .65),))
        for o in bpy.data.objects: o.hide_render = False
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(LIFE, 'naija_life.blend'))
        log('pieces done')
    elif job == 'room':
        src = open(os.path.join(BASE, 'rooms_all3.py'), encoding='utf8').read()
        src = src[:src.index("try:\n    open(LOGF")]
        g = {'__name__': 'rooms_all_lib', 'ONLY': None, 'SAMPLES': int(names[0]) if names else 256}
        exec(compile(src, 'rooms_all.py', 'exec'), g)
        g['build_room']('int_faceme', L.int_faceme)
        ob = bpy.data.objects.get('ROOM')
        # a look from above with the ceiling cut away (hide faces above 2.6 m in a copy)
        import bmesh
        cp = ob.copy(); cp.data = ob.data.copy(); bpy.context.scene.collection.objects.link(cp); ob.hide_render = True
        bm = bmesh.new(); bm.from_mesh(cp.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().z > 2.6 or (f.normal.z < -.9 and f.calc_center_median().z > 2.0)], context='FACES')
        bm.to_mesh(cp.data); bm.free()
        look([cp], os.path.join(LIFE, 'look_int_faceme.png'), views=((.35, -.55, 1.0), (-.4, .5, .9)))
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(LIFE, 'naija_life_room.blend'))
        log('room done')
except Exception:
    log('FAILED', traceback.format_exc())
log('end')
