"""Naija Streets: the kidnapper's carry, made in Blender.

Builds the game's Mixamo skeleton as a Blender armature (rest pose exactly as in assets/people/moves.glb), lays the
game's own walk and idle on it, then poses on top of them, frame by frame, with two-bone IK done here in Blender:

  carry_walk  - walking with a person over the right shoulder: leaning into the weight, the right arm wrapped round
                their legs in front of the shoulder, the head turned away from the load
  carry_idle  - standing with the person on the shoulder, shifting the weight
  carried     - the person on the shoulder: hanging down the carrier's back, arms dangling, legs down his front
                (the game puts their hips on the carrier's shoulder and plays this on top)
  tied        - sitting on the ground against a post, knees up, hands tied behind the back, breathing and struggling

Exported as one .glb (the armature, a tiny bound mesh so the skeleton goes out, and the four actions) to
Documents/naija_ikeja/models/moves4.glb. The game fits the moves onto every body (src/char2.js retargetClip).

Run inside Blender (Scripting > New > paste > Run Script) with carry_src.json (the skeleton and the walk and idle
from moves.glb, written by the game's test tools) next to this file in Documents/naija_ikeja/tools.
"""
import bpy, json, math, os
from mathutils import Matrix, Vector, Quaternion

HERE = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_ikeja', 'tools')
OUT = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_ikeja', 'models', 'moves4.glb')
FPS = 30
C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))            # glTF (Y up, front +Z) -> Blender (Z up, front -Y)
F, U, R = Vector((0, -1, 0)), Vector((0, 0, 1)), Vector((-1, 0, 0))   # the body's forward, up, right in Blender
Q = lambda a: Quaternion((a[3], a[0], a[1], a[2]))       # glTF [x, y, z, w]


def build(src):
    """the armature, rest pose exactly the Mixamo one (each bone's axes = the glTF bone's axes, turned to Z up)"""
    for ob in [o for o in bpy.data.objects if o.name.startswith('NS_Carry')]:
        bpy.data.objects.remove(ob, do_unlink=True)
    for a in [a for a in bpy.data.actions if a.name in ('carry_walk', 'carry_idle', 'carried', 'tied') or a.name.startswith('ns_base')]:
        bpy.data.actions.remove(a)
    sc = bpy.context.scene; sc.render.fps = FPS
    coll = bpy.data.collections.get('NS Carry') or bpy.data.collections.new('NS Carry')
    if coll.name not in sc.collection.children:
        sc.collection.children.link(coll)
    arm = bpy.data.armatures.new('NS_Carry_Rig'); ob = bpy.data.objects.new('NS_Carry_Rig', arm); coll.objects.link(ob)
    arm.display_type = 'STICK'
    vl = bpy.context.view_layer
    for o in vl.objects: o.select_set(False)
    ob.select_set(True); vl.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    B = {b['name']: b for b in src['bones']}
    kids = {}
    for b in src['bones']:
        if b['parent']: kids.setdefault(b['parent'], []).append(b)
    for b in src['bones']:
        e = arm.edit_bones.new(b['name'])
        W = Q(b['wq']).to_matrix(); Rb = C @ W
        head = C @ Vector(b['wp']) * .01
        ln = max([k['lp'][1] for k in kids.get(b['name'], [])] + [0]) * .01
        if ln < .02: ln = .05
        e.head = head; e.tail = head + Rb.col[1] * ln; e.align_roll(Rb.col[2])
    for b in src['bones']:
        if b['parent']: arm.edit_bones[b['name']].parent = arm.edit_bones[b['parent']]
    bpy.ops.object.mode_set(mode='OBJECT')
    # a tiny mesh bound to the hips, so the exporter writes the skeleton out
    me = bpy.data.meshes.new('NS_Carry_Tag'); me.from_pydata([(0, 0, .9), (.02, 0, .9), (0, .02, .9)], [], [(0, 1, 2)])
    tag = bpy.data.objects.new('NS_Carry_Tag', me); coll.objects.link(tag); tag.parent = ob
    vg = tag.vertex_groups.new(name=src['bones'][0]['name']); vg.add([0, 1, 2], 1.0, 'REPLACE')
    md = tag.modifiers.new('Armature', 'ARMATURE'); md.object = ob
    for pb in ob.pose.bones: pb.rotation_mode = 'QUATERNION'
    return ob


def sample(track, t, n):
    ts, vs = track['times'], track['values']
    if len(ts) == 1 or t <= ts[0]: return vs[:n]
    if t >= ts[-1]: return vs[-n:]
    i = 0
    while ts[i + 1] < t: i += 1
    k = (t - ts[i]) / (ts[i + 1] - ts[i])
    a, b = vs[i * n:(i + 1) * n], vs[(i + 1) * n:(i + 2) * n]
    if n == 4:
        qa, qb = Q(a), Q(b); q = qa.slerp(qb, k); return [q.x, q.y, q.z, q.w]
    return [a[j] + (b[j] - a[j]) * k for j in range(n)]


def put_base(ob, src, clip, t, blend=None):
    """the game's move at time t on the rig (blend: (other time, weight) to loop a cut idle smoothly)"""
    c = src['clips'][clip]['tracks']; B = {b['name']: b for b in src['bones']}
    hips = src['bones'][0]
    for pb in ob.pose.bones:
        b = B[pb.name]; L = Q(b['lq'])
        tr = c.get(pb.name + '.quaternion')
        q = Q(sample(tr, t, 4)) if tr else L
        if blend and tr: q = q.slerp(Q(sample(tr, blend[0], 4)), blend[1])
        pb.rotation_quaternion = L.inverted() @ q
        pb.location = (0, 0, 0)
    tp = c.get(hips['name'] + '.position')
    if tp:
        v = sample(tp, t, 3); H = hips['lp'][1]
        d = Vector((0, v[1] * H - hips['lp'][1], 0))
        pb = ob.pose.bones[hips['name']]; pb.location = Q(hips['wq']).inverted() @ d * .01
    bpy.context.view_layer.update()


def P(ob, n): return ob.pose.bones['mixamorig' + n]


def turn(pb, frm, to):
    """turn a bone about its head so the point frm moves toward the point to (armature space)"""
    h = pb.head.copy(); a, b = frm - h, to - h
    if a.length < 1e-6 or b.length < 1e-6: return
    rot = a.rotation_difference(b).to_matrix().to_4x4()
    pb.matrix = Matrix.Translation(h) @ rot @ Matrix.Translation(-h) @ pb.matrix
    bpy.context.view_layer.update()


def spin(pb, axis, ang):
    """turn a bone about its head round an axis in armature space"""
    h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(ang, 4, axis) @ Matrix.Translation(-h) @ pb.matrix
    bpy.context.view_layer.update()


def ik2(up, lo, end, T, pole):
    """two-bone IK: put the end bone's head on T, the middle joint bending toward pole"""
    A, Bp, Cp = up.head.copy(), lo.head.copy(), end.head.copy()
    la, lb = (Bp - A).length, (Cp - Bp).length
    d = max(min((T - A).length, la + lb - 1e-3), abs(la - lb) + 1e-3); dv = (T - A).normalized()
    ca = max(-1, min(1, (la * la + d * d - lb * lb) / (2 * la * d))); sa = math.sqrt(1 - ca * ca)
    pd = pole - A; pd = pd - dv * pd.dot(dv)
    if pd.length < 1e-6: pd = Vector((0, 0, -1))
    pd.normalize(); E = A + dv * (ca * la) + pd * (sa * la)
    turn(up, Bp, E); turn(lo, end.head.copy(), T)


def keep(ob, store, f):
    for pb in ob.pose.bones:
        store.setdefault(pb.name, []).append((f, pb.rotation_quaternion.copy(), pb.location.copy()))


def write(ob, name, store):
    act = bpy.data.actions.new(name); act.use_fake_user = True
    ob.animation_data_create(); ob.animation_data.action = act
    for bn, keys in store.items():
        pb = ob.pose.bones[bn]
        for f, q, l in keys:
            pb.rotation_quaternion = q; pb.keyframe_insert('rotation_quaternion', frame=f, group=bn)
            if bn.endswith('Hips'):
                pb.location = l; pb.keyframe_insert('location', frame=f, group=bn)
    return act


# ---------------------------------------------------------------- the moves
def carry(ob, src, clip, frames, dur, name):
    st = {}
    for f in range(frames + 1):
        t = f / frames * dur
        if clip == 'idle_1':
            w = max(0, (t - (dur - .4)) / .4); put_base(ob, src, clip, t, (t - dur + .0, w) if w > 0 else None)
        else:
            put_base(ob, src, clip, t)
        spin(P(ob, 'Spine'), 'X', .11); spin(P(ob, 'Spine1'), 'X', .05)               # lean into the weight
        spin(P(ob, 'Spine'), 'Y', -.06)                                               # and a little to the right
        sh = P(ob, 'RightArm').head.copy()
        sway = math.sin(t / dur * 2 * math.pi) * .015
        ik2(P(ob, 'RightArm'), P(ob, 'RightForeArm'), P(ob, 'RightHand'),
            sh + F * (.24 + sway) + U * -.1 + R * .02, sh + R * .3 + U * -.45 + F * .15)
        hd = P(ob, 'RightHand'); turn(hd, P(ob, 'RightHandMiddle1').head.copy(), hd.head + F * .02 + U * .06 + R * -.08)   # the hand over their legs
        spin(P(ob, 'Head'), 'Z', .16)                                                 # face turned from the load
        keep(ob, st, f)
    return write(ob, name, st)


def carried(ob, src, frames=30):
    st = {}
    X = Vector((-1, 0, 0)); Yh = (U * -.8 + F * -.6).normalized(); Zh = (F - Yh * F.dot(Yh)).normalized(); X = Yh.cross(Zh)
    for f in range(frames + 1):
        t = f / frames; s = math.sin(t * 2 * math.pi)
        put_base(ob, src, 'idle_1', 0)
        hp = P(ob, 'Hips'); h = hp.head.copy()
        M = Matrix((X, Yh, Zh)).transposed().to_4x4(); M.translation = h + U * .55
        hp.matrix = M @ Matrix.Translation((0, 0, 0)); bpy.context.view_layer.update()
        for n in ('Spine', 'Spine1', 'Spine2'): spin(P(ob, n), 'X', .08)             # the back curls over his shoulder
        spin(P(ob, 'Head'), 'X', .25)
        for side, k in (('Left', 1), ('Right', -1)):
            a = P(ob, side + 'Arm').head.copy()
            ik2(P(ob, side + 'Arm'), P(ob, side + 'ForeArm'), P(ob, side + 'Hand'),
                a + U * -.56 + F * (.05 * s * k) + Vector((0, .04, 0)), a + Vector((0, .35, -.2)))      # arms hanging, swinging
            ul, lg, ft = P(ob, side + 'UpLeg'), P(ob, side + 'Leg'), P(ob, side + 'Foot')
            L1, L2 = (U * -.8 + F * .6).normalized(), (U * -1 + F * .12).normalized()
            turn(ul, lg.head.copy(), ul.head + L1 * (lg.head - ul.head).length)
            turn(lg, ft.head.copy(), lg.head + (L2 + F * (.06 * s)).normalized() * (ft.head - lg.head).length)   # legs swinging a little
            tb = P(ob, side + 'ToeBase'); turn(ft, tb.head.copy(), ft.head + (U * -1 + F * -.3).normalized() * (tb.head - ft.head).length)
        keep(ob, st, f)
    return write(ob, 'carried', st)


def tied(ob, src, frames=60):
    st = {}
    for f in range(frames + 1):
        t = f / frames; s, s2 = math.sin(t * 2 * math.pi), math.sin(t * 4 * math.pi)
        put_base(ob, src, 'idle_1', 0)
        hp = P(ob, 'Hips'); pl = hp.location.copy()
        drop = hp.head.z - .16; hp.location = pl + (hp.bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, -drop))); bpy.context.view_layer.update()
        spin(hp, 'X', -.22)                                                            # sitting back against the post
        for n in ('Spine1', 'Spine2'): spin(P(ob, n), 'X', .12 + .02 * s)              # slumped, breathing
        spin(P(ob, 'Spine2'), 'Z', .06 * s2)                                           # twisting against the rope
        spin(P(ob, 'Head'), 'X', .22 + .04 * s)
        for side, k in (('Left', 1), ('Right', -1)):
            ul, lg, ft, tb = P(ob, side + 'UpLeg'), P(ob, side + 'Leg'), P(ob, side + 'Foot'), P(ob, side + 'ToeBase')
            hip = ul.head.copy(); foot = Vector((hip.x + k * .1, hip.y, 0)) + F * .55 + U * .09
            ik2(ul, lg, ft, foot, hip + F * .5 + U * .7)
            turn(ft, tb.head.copy(), ft.head + (F * 1 + U * -.25).normalized() * (tb.head - ft.head).length)
            a = P(ob, side + 'Arm').head.copy(); back = Vector((k * .07, 0, 0)) + Vector((0, hp.head.y, hp.head.z)) + Vector((0, .26, .12))
            ik2(P(ob, side + 'Arm'), P(ob, side + 'ForeArm'), P(ob, side + 'Hand'), back + Vector((0, 0, .02 * s2 * k)), a + Vector((k * .35, .35, -.1)))
        keep(ob, st, f)
    return write(ob, 'tied', st)


def export(ob):
    vl = bpy.context.view_layer
    for o in vl.objects: o.select_set(False)
    ob.select_set(True)
    for c in ob.children: c.select_set(True)
    vl.objects.active = ob; ob.animation_data.action = None
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    args = dict(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_animations=True, export_animation_mode='ACTIONS',
                export_force_sampling=True, export_optimize_animation_size=False, export_def_bones=False, export_skins=True, export_materials='NONE',
                export_texcoords=False, export_normals=False)
    for drop in ([], ['export_optimize_animation_size'], ['export_optimize_animation_size', 'export_def_bones'], ['export_optimize_animation_size', 'export_def_bones', 'export_animation_mode']):
        try:
            bpy.ops.export_scene.gltf(**{k: v for k, v in args.items() if k not in drop}); break
        except TypeError:
            continue


def main():
    src = json.load(open(os.path.join(HERE, 'carry_src.json')))
    ob = build(src)
    vl = bpy.context.view_layer; vl.objects.active = ob; bpy.ops.object.mode_set(mode='POSE')
    carry(ob, src, 'walk', 30, src['clips']['walk']['duration'], 'carry_walk')
    carry(ob, src, 'idle_1', 60, 2.0, 'carry_idle')
    carried(ob, src)
    tied(ob, src)
    bpy.ops.object.mode_set(mode='OBJECT')
    export(ob)
    ob.animation_data.action = bpy.data.actions['carry_walk']
    sc = bpy.context.scene; sc.frame_start, sc.frame_end = 0, 30; sc.frame_set(0)
    ob.location = (0, 420, 0)
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            r3 = area.spaces.active.region_3d; r3.view_location = (0, 420, 1); r3.view_distance = 5
            r3.view_rotation = __import__('mathutils').Euler((math.radians(80), 0, math.radians(-35)), 'XYZ').to_quaternion()
    print('carry moves exported to', OUT)


if __name__ == '__main__':
    main()
