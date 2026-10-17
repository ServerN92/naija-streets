"""A new head for each woman: the pretty sculpted head ("Female Head Base Mesh" by snailpot_maysachan, Sketchfab, CC BY),
made light for the game, sized and placed on her neck, its neck blended into her body, skinned to her head and neck bones.
Her MakeHuman head is hidden (mask), so the body, rig, clothes and hair fitting stay as they are.
Run after women_lib.py and face_transfer.py (donor_mesh, donor_eyes)."""
import bpy, bmesh, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

SRC = 'NW_HeadSrc'

def head_src(faces=9000):
    """The donor joined, cleaned and cut down to a game-friendly size (kept once in the file)."""
    o = bpy.data.objects.get(SRC)
    if o: return o
    D = donor_mesh(); me = D.data.copy(); o = bpy.data.objects.new(SRC, me); bpy.context.scene.collection.objects.link(o)
    o.matrix_world = D.matrix_world.copy(); o.hide_render = True; o.hide_set(True)
    m = o.modifiers.new('Dec', 'DECIMATE'); m.ratio = faces / max(1, len(me.polygons))
    dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); nm = bpy.data.meshes.new_from_object(e, depsgraph=dg)
    o.modifiers.clear(); o.data = nm
    for p in nm.polygons: p.use_smooth = True
    log('head source', len(nm.vertices), 'verts', len(nm.polygons), 'faces')
    return o

def _skull(P, ez, ey):
    """Skull width and centre at the forehead (1.5–4 cm above the eyes, not the ears)."""
    band = [p for p in P if ez + .015 < p.z < ez + .04]
    cx = (max(p.x for p in band) + min(p.x for p in band)) / 2; cy = (max(p.y for p in band) + min(p.y for p in band)) / 2
    return max(p.x for p in band) - min(p.x for p in band), cx, cy, max(p.z for p in P)

def swap(name, seam_up=.035, blend=.03, size=1.0):
    rig = bpy.data.objects['NW_' + name.replace(' ', '_')]; body = bpy.data.objects[name + '.body']
    for o in list(bpy.data.objects):
        if o.get('nw_head') == name: bpy.data.objects.remove(o, do_unlink=True)
    V = _rest_positions(body)
    oL, oR = our_eyes(name); dL, dR = donor_eyes(); om = (oL + oR) / 2; dm = (dL + dR) / 2
    head_v = [v for v in V if v.z > om.z - .02 and (v - om).length < .2]
    ow, ocx, ocy, otop = _skull(head_v, om.z, om.y)
    S = head_src(); SP = [S.matrix_world @ v.co for v in S.data.vertices]
    dw, dcx, dcy, dtop = _skull(SP, dm.z, dm.y)
    s = ow / dw * size
    # place: skull centre over skull centre, eyes at her eye height
    T = lambda p: Vector((ocx + (p.x - dcx) * s, ocy + (p.y - dcy) * s, om.z + (p.z - dm.z) * s))
    me = S.data.copy(); h = bpy.data.objects.new(name + '.head', me); body.users_collection[0].objects.link(h)
    h['nw'] = name; h['nw_head'] = name
    for v, p in zip(me.vertices, SP): v.co = T(p)
    # her neck: the sculpt is cut across its own neck, her body across the base of her neck, and a short tube is
    # lofted between the two (each ring found by rays out from the neck's axis), smooth into both surfaces
    neck = rig.matrix_world @ rig.pose.bones['mixamorig:Neck'].head; hb = rig.matrix_world @ rig.pose.bones['mixamorig:Head'].head
    dbot = min(v.co.z for v in me.vertices)
    z1 = dbot + .022; z2 = neck.z + .018; seam = z2
    bvh_b = BVHTree.FromPolygons(V, [tuple(p.vertices) for p in body.data.polygons])
    bvh_d = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
    c0 = Vector(((hb.x + neck.x) / 2, (hb.y + neck.y) / 2))
    U, NZ = 40, 12
    def rad(bvh, z, th):
        o = Vector((c0.x, c0.y, z)); d = Vector((math.cos(th), math.sin(th), 0.))
        hit = bvh.ray_cast(o, d, .2)
        return (hit[0] - o).length if hit[0] is not None else None
    rows = []
    for j in range(NZ + 1):
        t = j / NZ; z = (z2 - .011) + (z1 - z2 + .022) * t; tt = max(0., min(1., (z - z2) / (z1 - z2))); sm = tt * tt * (3 - 2 * tt); row = []
        for i in range(U):
            th = 2 * math.pi * i / U
            rb, rb2 = rad(bvh_b, z2, th), rad(bvh_b, z2 + .006, th)
            rd, rd2 = rad(bvh_d, z1, th), rad(bvh_d, z1 - .006, th)
            if None in (rb, rb2, rd, rd2): row.append(None); continue
            eb = rb + (rb2 - rb) / .006 * (z - z2); ed = rd + (rd - rd2) / .006 * (z - z1)   # each surface carried on
            r = (eb * (1 - sm) + ed * sm) + .0006   # a hair outside both, where they overlap
            row.append(Vector((c0.x + math.cos(th) * r, c0.y + math.sin(th) * r, z)))
        rows.append(row)
    tv, tf = [], []
    idx = {}
    for j, row in enumerate(rows):
        for i, p in enumerate(row):
            if p is not None: idx[(j, i)] = len(tv); tv.append(p)
    for j in range(NZ):
        for i in range(U):
            q = [(j, i), (j, (i + 1) % U), (j + 1, (i + 1) % U), (j + 1, i)]
            if all(k in idx for k in q): tf.append(tuple(idx[k] for k in q))
    # the sculpt below the top ring and her body above the bottom ring go
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, z1 - .002), plane_no=(0, 0, 1), clear_inner=True)
    bm.to_mesh(me); bm.free()
    g = body.vertex_groups.get('NW_OldHead') or body.vertex_groups.new(name='NW_OldHead')
    g.remove(list(range(len(body.data.vertices))))
    axis = Vector((hb.x, hb.y))
    up = [i for i, v in enumerate(V) if (v.z > z2 + .002 and (Vector((v.x, v.y)) - axis).length < .085) or (v.z > z2 + .045 and (Vector((v.x, v.y)) - axis).length < .16)]
    g.add(up, 1., 'REPLACE')
    mk = body.modifiers.get('NW_HideOldHead') or body.modifiers.new('NW_HideOldHead', 'MASK')
    mk.vertex_group = 'NW_OldHead'; mk.invert_vertex_group = True
    nmesh = bpy.data.meshes.new(name + '.neck'); nmesh.from_pydata([tuple(p) for p in tv], [], tf); nmesh.update()
    for p in nmesh.polygons: p.use_smooth = True
    nk = bpy.data.objects.new(name + '.neck', nmesh); body.users_collection[0].objects.link(nk); nk['nw'] = name; nk['nw_head'] = name
    # (the tube's faces must face out)
    bm = bmesh.new(); bm.from_mesh(nmesh); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(nmesh); bm.free()
    # make-up masks (lipstick, blush) from the sculpt's own face, in its own measurements (mm from between the eyes)
    inv = lambda q: Vector(((q.x - ocx) / s + dcx - dm.x, (q.y - ocy) / s + dcy - dm.y, (q.z - om.z) / s)) * 1000.
    lips, blush = [], []
    for v in me.vertices:
        r = inv(v.co)
        e = (r.x / 21.5) ** 2 + ((r.z + 73.5) / (12.5 if r.z > -73.5 else 11.)) ** 2
        lips.append(0. if r.y > -32 else max(0., min(1., (1. - e) / .22)))
        c = ((abs(r.x) - 38) / 15) ** 2 + ((r.z + 30) / 13) ** 2
        blush.append(0. if r.y > -10 else max(0., min(1., 1. - c)) ** 1.5)
    for key, vals in (('mk_lips', lips), ('mk_blush', blush)):
        a = me.attributes.get(key) or me.attributes.new(key, 'FLOAT', 'POINT'); a.data.foreach_set('value', vals)
    # skin: the head bone above the jaw, the neck bone at the join
    # below the jaw it takes the weights of her own neck under it (so it bends with her body); above, the head bone
    kd = KDTree(len(V))
    for i, p in enumerate(V): kd.insert(p, i)
    kd.balance()
    names = {g.index: g.name for g in body.vertex_groups if g.name.startswith('mixamorig:')}
    def wts(i):
        return {names[g.group]: g.weight for g in body.data.vertices[i].groups if g.group in names and g.weight > .001}
    groups = {}
    def grp(nm):
        if nm not in groups: groups[nm] = h.vertex_groups.get(nm) or h.vertex_groups.new(name=nm)
        return groups[nm]
    for v in me.vertices:
        t = max(0., min(1., (v.co.z - (hb.z - .02)) / .05))
        if t > 0: grp('mixamorig:Head').add([v.index], t, 'REPLACE')
        if t < 1:
            _, j, _ = kd.find(v.co); w = wts(j); tot = sum(w.values()) or 1.
            for nm, x in w.items(): grp(nm).add([v.index], (1 - t) * x / tot, 'ADD')
    for v in nk.data.vertices:
        _, j, _ = kd.find(v.co); w = wts(j); tot = sum(w.values()) or 1.
        for nm, x in w.items():
            gg = nk.vertex_groups.get(nm) or nk.vertex_groups.new(name=nm); gg.add([v.index], x / tot, 'REPLACE')
    nk.parent = rig; nk.matrix_parent_inverse = rig.matrix_world.inverted(); an = nk.modifiers.new('Armature', 'ARMATURE'); an.object = rig
    sn = nk.modifiers.new('Smooth', 'SUBSURF'); sn.levels = 1; sn.render_levels = 1
    h.parent = rig; h.matrix_parent_inverse = rig.matrix_world.inverted()
    am = h.modifiers.new('Armature', 'ARMATURE'); am.object = rig
    sub = h.modifiers.new('Smooth', 'SUBSURF'); sub.levels = 1; sub.render_levels = 1
    for p in me.polygons: p.use_smooth = True
    h.data.materials.clear(); h.data.materials.append(head_skin(name, body, WOMEN.get(name, {}).get('lips', (.14, .025, .03))))
    nk.data.materials.clear(); nk.data.materials.append(h.data.materials[0])
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = h; h.select_set(True)
    try:
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=.004)
    finally:
        bpy.ops.object.mode_set(mode='OBJECT')
    # her eyes, brows and lash lines from the sculpt
    parts = []
    for src, kind in (('PM3D_Sphere3D1_3', 'eyes'), ('extract2_copy1', 'brows'), ('Extract1', 'liner')):
        so = next((o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith(src)), None)
        if not so: continue
        pm = so.data.copy(); po = bpy.data.objects.new(name + '.' + kind, pm); body.users_collection[0].objects.link(po)
        for v in pm.vertices: v.co = T(so.matrix_world @ v.co)
        po['nw'] = name; po['nw_head'] = name
        gg = po.vertex_groups.new(name='mixamorig:Head'); gg.add(list(range(len(pm.vertices))), 1., 'REPLACE')
        po.parent = rig; po.matrix_parent_inverse = rig.matrix_world.inverted(); a2 = po.modifiers.new('Armature', 'ARMATURE'); a2.object = rig
        for p in pm.polygons: p.use_smooth = True
        parts.append((po, kind))
    # hide the MakeHuman eyes, brows, lashes, teeth and tongue
    for o in rig.children_recursive:
        if any(k in o.name for k in ('high-poly', 'eyebrow', 'eyelash', 'teeth', 'tongue')): o.hide_render = True; o.hide_set(True)
    log('head swap', name, 'scale', round(s, 3), 'seam z', round(seam, 3), 'head verts', len(me.vertices))
    return h, parts


def head_skin(name, body, lips=(.14, .025, .03)):
    """Her skin colour on the new head: the same tone as her body (taken from her body's material), a soft noise for life."""
    bm = body.data.materials[0]; col = None
    for n in bm.node_tree.nodes:
        if n.type == 'MIX' and n.blend_type == 'MULTIPLY':
            a = next((i for i in n.inputs if i.name == 'A' and i.type == 'RGBA'), None)
            if a is not None and not a.is_linked: col = tuple(a.default_value)[:3]; break
    col = col or (.15, .077, .044)
    m, nt, b = new_mat('NW_HeadSkin_' + name); L = nt.links
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 90.; nz.inputs['Detail'].default_value = 8.
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = .93; mr.inputs['To Max'].default_value = 1.07; L.new(nz.outputs['Fac'], mr.inputs['Value'])
    cc = nt.nodes.new('ShaderNodeCombineColor'); [L.new(mr.outputs['Result'], cc.inputs[i]) for i in range(3)]
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
    next(i for i in mx.inputs if i.name == 'Factor' and i.type == 'VALUE').default_value = 1.
    next(i for i in mx.inputs if i.name == 'A' and i.type == 'RGBA').default_value = (*col, 1)
    L.new(cc.outputs[0], next(i for i in mx.inputs if i.name == 'B' and i.type == 'RGBA'))
    out = next(o for o in mx.outputs if o.type == 'RGBA')
    def attr(k):
        a = nt.nodes.new('ShaderNodeAttribute'); a.attribute_name = k; a.attribute_type = 'GEOMETRY'; return a.outputs['Fac']
    def mixc(f, A, Bc, mode='MIX', k=1.):
        n = nt.nodes.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = mode
        mm = nt.nodes.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; mm.inputs[1].default_value = k; L.new(f, mm.inputs[0])
        L.new(mm.outputs[0], next(i for i in n.inputs if i.name == 'Factor' and i.type == 'VALUE'))
        L.new(A, next(i for i in n.inputs if i.name == 'A' and i.type == 'RGBA')); next(i for i in n.inputs if i.name == 'B' and i.type == 'RGBA').default_value = Bc
        return next(o for o in n.outputs if o.type == 'RGBA')
    out = mixc(attr('mk_blush'), out, (.8, .25, .2, 1), 'MULTIPLY', .25)
    lf = attr('mk_lips'); out = mixc(lf, out, (*lips, 1), 'MIX', .85)
    rr = nt.nodes.new('ShaderNodeMath'); rr.operation = 'MULTIPLY_ADD'; rr.inputs[1].default_value = -.22; rr.inputs[2].default_value = .5; L.new(lf, rr.inputs[0])
    L.new(out, b.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .06; bump.inputs['Distance'].default_value = .0003
    nz2 = nt.nodes.new('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = 900.; L.new(nz2.outputs['Fac'], bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Normal'])
    L.new(rr.outputs[0], b.inputs['Roughness'])
    for k, v in (('Subsurface Weight', .15), ('Subsurface Scale', .005), ('Specular IOR Level', .38)):
        i = inp(b, k)
        if i: i.default_value = v
    i = inp(b, 'Subsurface Radius')
    if i: i.default_value = (1.0, .35, .18)
    return m

def eye_mats(name, iris=(.035, .016, .008)):
    """Real eyes on the sculpt's plain eyeballs: an angle from the front of each ball gives pupil, iris, ring and white."""
    o = bpy.data.objects[name + '.eyes']; me = o.data
    P = [v.co.copy() for v in me.vertices]; cx = sum(p.x for p in P) / len(P)
    groups = [[i for i, p in enumerate(P) if p.x < cx], [i for i, p in enumerate(P) if p.x >= cx]]
    ang = [0.] * len(P)
    for g in groups:
        c = sum((P[i] for i in g), Vector()) / len(g)
        for i in g:
            d = (P[i] - c).normalized(); ang[i] = math.acos(max(-1., min(1., -d.y)))
    a = me.attributes.get('eye_a') or me.attributes.new('eye_a', 'FLOAT', 'POINT'); a.data.foreach_set('value', ang)
    m, nt, b = new_mat('NW_Eye_' + name); L = nt.links
    at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'eye_a'
    cr = nt.nodes.new('ShaderNodeValToRGB'); L.new(at.outputs['Fac'], cr.inputs['Fac'])
    E = cr.color_ramp; E.interpolation = 'EASE'
    E.elements[0].position = 0.; E.elements[0].color = (.004, .003, .003, 1)
    E.elements[1].position = .2; E.elements[1].color = (.004, .003, .003, 1)
    for pos, col in ((.24, (*[c * 1.6 for c in iris], 1)), (.4, (*iris, 1)), (.47, (.008, .005, .004, 1)), (.53, (.62, .58, .54, 1)), (1.5, (.66, .62, .58, 1))):
        el = E.elements.new(pos); el.color = col
    L.new(cr.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = .08
    for k, v in (('Coat Weight', .6), ('Coat Roughness', .02), ('Specular IOR Level', .5)):
        i = inp(b, k)
        if i: i.default_value = v
    me.materials.clear(); me.materials.append(m)
    for nm, col, r in (('brows', (.025, .017, .012), .85), ('liner', (.008, .006, .005), .5)):
        po = bpy.data.objects.get(name + '.' + nm)
        if not po: continue
        mm, _, bb = new_mat('NW_' + nm + '_' + name); bb.inputs['Base Color'].default_value = (*col, 1); bb.inputs['Roughness'].default_value = r
        po.data.materials.clear(); po.data.materials.append(mm)


def head_scalp(name, front=.06):
    """A dark cap over the new head's scalp (under braids, at a parting), like scalp_cap for the old heads."""
    h = bpy.data.objects[name + '.head']; rig = h.parent
    old = bpy.data.objects.get(name + '.scalp')
    if old: bpy.data.objects.remove(old, do_unlink=True)
    mods = [m for m in h.modifiers if m.type == 'SUBSURF']
    for m in mods: m.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get(); dg.update(); e = h.evaluated_get(dg); me = e.to_mesh(); mw = h.matrix_world; nm3 = mw.to_3x3().inverted().transposed()
    Vv = [mw @ v.co for v in me.vertices]; Nn = [(nm3 @ v.normal).normalized() for v in me.vertices]; polys = [tuple(p.vertices) for p in me.polygons]; e.to_mesh_clear()
    for m in mods: m.show_viewport = True
    eyes = bpy.data.objects[name + '.eyes']; ez = sum((eyes.matrix_world @ v.co).z for v in eyes.data.vertices) / len(eyes.data.vertices)
    hv = [p for p in Vv if p.z > ez - .01]; ctr = Vector(((min(p.x for p in hv) + max(p.x for p in hv)) / 2, (min(p.y for p in hv) + max(p.y for p in hv)) / 2, ez + .025))
    F = dict(V=Vv, N=Nn, polys=polys, eyez=ez, ctr=ctr, rig=rig)
    sc = scalp(F, front)
    m, nt, b = new_mat('NW_Scalp'); b.inputs['Base Color'].default_value = (.02, .015, .012, 1); b.inputs['Roughness'].default_value = .85
    o = shell(name + '.scalp', F, sc, lambda hh, a, p: 0., h.users_collection[0], m, offset=.0008)
    o['nw_head'] = name
    return o
