"""Naija Streets: sleeping on the carton and the morning stretch, made in Blender.

Builds the game's Mixamo skeleton as a Blender armature (rest pose exactly as in assets/people/moves.glb, from
carry_src.json), lays the game's own idle on it and poses on top of it with two-bone IK:

  sleep    - flat on the back on the carton: head on a folded cloth, right hand on the belly, left hand under the head,
             right knee a little up, slow breathing (a 4.8 s loop)
  stretch  - just woken up, standing: both arms up over the head, leaning back with a yawn, a sway left and right,
             then the arms come down wide by the sides and the body settles back into the idle (4.4 s, starts and ends on the idle)

Lying down and getting up are the game's own Mixamo stand-up move (played backwards to lie down).
Exported as one .glb (armature, a tiny bound mesh, the two actions) to Documents/naija_rooms/moves/moves5.glb.
Run: blender -b --python blender_sleep.py   (with carry_src.json next to it)
"""
import bpy, json, math, os
from mathutils import Matrix, Vector, Quaternion

HERE = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms', 'moves')
OUT = os.path.join(HERE, 'moves5.glb')
FPS = 30
C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))            # glTF (Y up, front +Z) -> Blender (Z up, front -Y)
F, U, R = Vector((0, -1, 0)), Vector((0, 0, 1)), Vector((-1, 0, 0))   # the body's forward, up, right in Blender
Q = lambda a: Quaternion((a[3], a[0], a[1], a[2]))       # glTF [x, y, z, w]
CARTON = .016                                            # the carton's thickness under the body
PILLOW = .085                                            # the folded cloth under the head


def build(src):
    """the armature, rest pose exactly the Mixamo one (each bone's axes = the glTF bone's axes, turned to Z up)"""
    for ob in [o for o in bpy.data.objects if o.name.startswith('NS_Sleep')]:
        bpy.data.objects.remove(ob, do_unlink=True)
    for a in [a for a in bpy.data.actions if a.name in ('sleep', 'stretch') or a.name.startswith('ns_base')]:
        bpy.data.actions.remove(a)
    sc = bpy.context.scene; sc.render.fps = FPS
    coll = bpy.data.collections.get('NS Sleep') or bpy.data.collections.new('NS Sleep')
    if coll.name not in sc.collection.children:
        sc.collection.children.link(coll)
    arm = bpy.data.armatures.new('NS_Sleep_Rig'); ob = bpy.data.objects.new('NS_Sleep_Rig', arm); coll.objects.link(ob)
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
    me = bpy.data.meshes.new('NS_Sleep_Tag'); me.from_pydata([(0, 0, .9), (.02, 0, .9), (0, .02, .9)], [], [(0, 1, 2)])
    tag = bpy.data.objects.new('NS_Sleep_Tag', me); coll.objects.link(tag); tag.parent = ob
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



def ease(x):
    x = max(0., min(1., x)); return x * x * (3 - 2 * x)


def env(t, a, b, c, d):
    """0 before a, rises to 1 by b, holds to c, falls to 0 by d (smooth)"""
    if t <= a or t >= d: return 0.
    if t < b: return ease((t - a) / (b - a))
    if t <= c: return 1.
    return 1 - ease((t - c) / (d - c))


def locals_(ob): return {pb.name: pb.rotation_quaternion.copy() for pb in ob.pose.bones}


def sleep(ob, src, frames=144, dur=4.8):
    """lying on the back: the whole idle body laid down about the hips, then the head, arms and legs placed"""
    if ob.animation_data: ob.animation_data.action = None   # (else Blender lays the last move back on at the first update)
    st = {}
    for f in range(frames + 1):
        t = f / frames * dur; s = math.sin(t / dur * 2 * math.pi); s2 = math.sin(t / dur * 4 * math.pi + .7)
        put_base(ob, src, 'idle_1', 0)
        hp = P(ob, 'Hips')
        spin(hp, 'X', -math.pi / 2 + .03)                                            # laid down on the back, head toward the back (-F)
        M = hp.matrix.copy(); M.translation.z = CARTON + .115; hp.matrix = M; bpy.context.view_layer.update()   # the hips on the carton
        spin(hp, 'Y', .04)                                                           # not dead straight
        for n, a in (('Spine', .015), ('Spine1', -.02 - .022 * (s * .5 + .5)), ('Spine2', -.015 - .018 * (s * .5 + .5))):
            spin(P(ob, n), 'X', a)                                                    # breathing: the chest rises and falls
        # the head on the folded cloth: chin a little down toward the chest, turned a touch to the side
        spin(P(ob, 'Neck'), 'X', .2); spin(P(ob, 'Head'), 'X', .14); spin(P(ob, 'Head'), 'Y', -.18 + .015 * s2)
        # right hand resting on the belly (rising with the breath), left hand under the head, elbow out on the cloth
        sp = P(ob, 'Spine1').head.copy()
        ik2(P(ob, 'RightArm'), P(ob, 'RightForeArm'), P(ob, 'RightHand'), sp + Vector((-.06, .02, .1 + .008 * (s * .5 + .5))), P(ob, 'RightArm').head + Vector((-.32, .1, .12)))
        hd = P(ob, 'Head').head.copy()
        ik2(P(ob, 'LeftArm'), P(ob, 'LeftForeArm'), P(ob, 'LeftHand'), hd + Vector((.05, .07, -.06)), P(ob, 'LeftArm').head + Vector((.38, .05, .02)))
        # legs: the right knee a little up, foot flat; the left leg long, feet falling open
        rl = P(ob, 'RightUpLeg').head.copy()
        ik2(P(ob, 'RightUpLeg'), P(ob, 'RightLeg'), P(ob, 'RightFoot'), Vector((rl.x - .06, rl.y - .62, CARTON + .1)), rl + Vector((-.05, -.3, .6)))
        ll = P(ob, 'LeftUpLeg').head.copy()
        ik2(P(ob, 'LeftUpLeg'), P(ob, 'LeftLeg'), P(ob, 'LeftFoot'), Vector((ll.x + .1, ll.y - .82, CARTON + .09)), ll + Vector((.1, -.4, .3)))
        spin(P(ob, 'LeftFoot'), 'Y', .5); spin(P(ob, 'RightFoot'), 'Y', -.2)
        keep(ob, st, f)
    return write(ob, 'sleep', st)


def stretch(ob, src, frames=132, dur=4.4):
    """standing on the idle: arms up and back, a yawn, a sway, arms down wide; starts and ends on the idle pose"""
    if ob.animation_data: ob.animation_data.action = None   # (else Blender lays the last move back on at the first update)
    st = {}
    for f in range(frames + 1):
        t = f / frames * dur
        put_base(ob, src, 'idle_1', 0)                      # the idle's first pose: the game blends in and out of it
        base = locals_(ob)
        up = env(t, .15, 1.15, 2.55, 3.75)                    # arms up
        back = env(t, .35, 1.25, 2.1, 3.0)                    # leaning back with the yawn
        sway = math.sin(max(0, min(1, (t - 1.45) / 1.05)) * 2 * math.pi) * env(t, 1.35, 1.6, 2.35, 2.6)   # left, then right
        toes = env(t, .6, 1.2, 2.2, 2.9)
        hp = P(ob, 'Hips'); M = hp.matrix.copy(); M.translation.z += .025 * toes; hp.matrix = M; bpy.context.view_layer.update()   # up on the toes a little
        spin(P(ob, 'Spine'), 'X', -.07 * back); spin(P(ob, 'Spine1'), 'X', -.09 * back); spin(P(ob, 'Spine2'), 'X', -.07 * back)
        for n in ('Spine1', 'Spine2'): spin(P(ob, n), 'Y', .09 * sway)
        spin(P(ob, 'Neck'), 'X', -.18 * back); spin(P(ob, 'Head'), 'X', -.22 * back)           # the head back: a big yawn
        for side, k in (('Left', 1), ('Right', -1)):
            sh = P(ob, side + 'Arm').head.copy()
            over = sh + U * .58 + Vector((-k * .1, 0, 0)) + F * -.03                     # hands over the head, nearly meeting
            wide = sh + Vector((k * .62, 0, 0)) + U * -.08 + F * .05                     # arms out wide on the way down
            down = env(t, 2.45, 3.2, 9, 10)
            T = over.lerp(wide, down)
            pole = sh + Vector((k * .45, 0, 0)) + U * (.15 - .3 * down) + F * (-.25 + .2 * down)
            ik2(P(ob, side + 'Arm'), P(ob, side + 'ForeArm'), P(ob, side + 'Hand'), T, pole)
            hd = P(ob, side + 'Hand'); turn(hd, P(ob, side + 'HandMiddle1').head.copy(), hd.head + (T - P(ob, side + 'ForeArm').head).normalized() * .08)
            for n in (side + 'Shoulder', side + 'Arm', side + 'ForeArm', side + 'Hand'):
                pb = P(ob, n); pb.rotation_quaternion = base[pb.name].slerp(pb.rotation_quaternion.copy(), up)
        bpy.context.view_layer.update()
        keep(ob, st, f)
    return write(ob, 'stretch', st)


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
    sleep(ob, src)
    stretch(ob, src)
    bpy.ops.object.mode_set(mode='OBJECT')
    export(ob)
    print('sleep moves exported to', OUT)


if __name__ == '__main__':
    main()
