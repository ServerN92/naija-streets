# Naija Streets: put the retargeted Mixamo moves on the characters in Blender (run through make_humans.py / diag.py),
# and render a short preview of everyone walking and running.
import json
from mathutils import Matrix, Quaternion, Vector
ANIMS = os.path.join(NC, 'anims')

def bone_frames(rig):
    rw = rig.matrix_world.to_3x3().normalized()
    return {pb.name.split(':')[-1]: (pb, (rw @ pb.bone.matrix_local.to_3x3()).normalized()) for pb in rig.pose.bones}

def key_move(rig, mv, frames_out, start=1, name=None):
    """keyframe one move onto the rig: frames_out = how many frames to write (the move loops)"""
    BF = bone_frames(rig); n = mv['frames']
    for f in range(frames_out):
        src = f % n
        for k, qs in mv['bones'].items():
            if k not in BF: continue
            pb, B = BF[k]
            R = Quaternion(qs[src]).to_matrix()
            q = (B.inverted() @ R @ B).to_quaternion()
            if f and pb.rotation_quaternion.dot(q) < 0: q.negate()
            pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=start + f, group=pb.name)
        pb, B = BF['Hips']
        pb.location = B.inverted() @ Vector(mv['hips'][src])
        pb.keyframe_insert('location', frame=start + f, group=pb.name)

def clear_pose(rig):
    if rig.animation_data: rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)

def show_outfits(sel):
    """sel {person: outfit index}"""
    for o in bpy.data.objects:
        if 'nc_outfit' in o:
            p = o.get('nc_person'); o.hide_render = o.hide_viewport = (o['nc_outfit'] != sel.get(p, -1))
    for name, i in sel.items():
        rig = bpy.data.objects.get(name); body = bpy.data.objects.get(name + '.body')
        for o in bpy.data.objects:
            if 'nc_outfits' in o and o.parent == rig:
                o.hide_render = o.hide_viewport = str(i) not in o['nc_outfits'].split(',')
        if body:
            for md in body.modifiers:
                if md.type == 'MASK' and md.name.startswith('Delete.'):
                    sh = next((s for s in bpy.data.objects if s.name.endswith('.' + md.name[7:]) and s.parent == rig), None)
                    md.show_render = md.show_viewport = bool(sh) and str(i) in sh.get('nc_outfits', '').split(',')

def preview(sel, segments, path_dir, res=(960, 540)):
    """segments: list of (move, frames). Everyone does the same moves one after the other."""
    sc = bpy.context.scene
    total = sum(n for _, n in segments)
    for name in sel:
        rig = bpy.data.objects.get(name); data = json.load(open(os.path.join(ANIMS, f'moves_{name}.json')))
        clear_pose(rig)
        start = 1
        for mk, n in segments:
            key_move(rig, data['moves'][mk], n, start); start += n
        act = rig.animation_data.action; act.name = f'{name}_preview'
        log('keyed', name, 'frames', total)
    show_outfits(sel)
    cam = studio(bpy.data.collections.get('NaijaChar'))
    look(cam, (0, 0, .95), (2.5, -4.9, 1.35), 45)
    sc.frame_start = 1; sc.frame_end = total
    sc.render.resolution_x, sc.render.resolution_y = res; sc.render.resolution_percentage = 100
    try: sc.eevee.taa_render_samples = 16
    except Exception: pass
    sc.render.fps = 30
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 88
    os.makedirs(path_dir, exist_ok=True)
    sc.render.filepath = os.path.join(path_dir, 'f_')
    t0 = time.time()
    bpy.ops.render.render(animation=True)
    log('rendered', total, 'frames in', round(time.time() - t0), 's')
