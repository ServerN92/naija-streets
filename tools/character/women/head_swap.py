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

def swap(name, seam_up=.035, blend=.03, size=1.0, shape=None):
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
    if shape: reshape(me, SP, dm, s, shape)
    # her neck: the sculpt is cut across its own neck, her body across the base of her neck, and a short tube is
    # lofted between the two (each ring found by rays out from the neck's axis), smooth into both surfaces
    neck = rig.matrix_world @ rig.pose.bones['mixamorig:Neck'].head; hb = rig.matrix_world @ rig.pose.bones['mixamorig:Head'].head
    dbot = min(v.co.z for v in me.vertices)
    z1 = dbot + .024; z2 = neck.z + .018; seam = z2
    bvh_b = BVHTree.FromPolygons(V, [tuple(p.vertices) for p in body.data.polygons])
    bvh_d = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
    c0 = Vector(((hb.x + neck.x) / 2, (hb.y + neck.y) / 2))
    def rad(bvh, z, th):
        o = Vector((c0.x, c0.y, z)); d = Vector((math.cos(th), math.sin(th), 0.))
        hit = bvh.ray_cast(o, d, .2)
        return (hit[0] - o).length if hit[0] is not None else None
    # cut the sculpt across its neck on a slanted plane (low under the chin, higher at the nape, because its neck is short
    # in front), then grow its own open edge down her neck as one piece (welded, no seam): each new ring eases from the
    # sculpt's neck to her body's neck, and the last ring tucks just under her body's skin line
    zf, zbk = dbot + .012, dbot + .03
    ys = [v.co.y for v in me.vertices if v.co.z < dbot + .04]; yf, yb = min(ys), max(ys)
    kz = (zbk - zf) / max(.02, yb - yf)
    pn = Vector((0., -kz, 1.)).normalized(); pc = Vector((c0.x, yf, zf))
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=pc, plane_no=pn, clear_inner=True)
    bm.verts.ensure_lookup_table(); bm.edges.ensure_lookup_table()
    onp = lambda v: abs((v.co - pc).dot(pn)) < .002
    bedges = [e for e in bm.edges if e.is_boundary and onp(e.verts[0]) and onp(e.verts[1])]
    nbr = {}
    for e in bedges:
        a_, b_ = e.verts; nbr.setdefault(a_, []).append(b_); nbr.setdefault(b_, []).append(a_)
    loops, seen = [], set()
    for v0 in nbr:
        if v0 in seen: continue
        loop = [v0]; seen.add(v0); prev = None; cur = v0
        while True:
            nx = [w for w in nbr[cur] if w is not prev and w not in seen]
            if not nx: break
            prev, cur = cur, nx[0]; loop.append(cur); seen.add(cur)
        loops.append(loop)
    ring = max(loops, key=len)
    if len(loops) > 1: log('neck cut: extra small openings', [len(l) for l in loops if l is not ring])
    zbot = z2 - .015; NZ = 10
    z1k = [v.co.z for v in ring]
    def surf_r(th, z, za):
        tt = max(0., min(1., (za - z) / max(.01, za - z2))); sm = tt * tt * (3 - 2 * tt)
        rd, rd2 = rad(bvh_d, za, th), rad(bvh_d, za + .006, th)
        ed = (rd + (rd - rd2) / .006 * (za - z)) if (rd and rd2) else None
        rb, rb2 = rad(bvh_b, z2, th), rad(bvh_b, z2 + .006, th)
        eb = (rb + (rb2 - rb) / .006 * (z - z2)) if (rb and rb2) else ed
        if ed is None: ed = eb
        off = -.001 if z < z2 + .008 else -.001 * max(0., 1 - (z - z2 - .008) / .02)
        return None if ed is None else ed * (1 - sm) + eb * sm + off
    prev_ring = ring; rows = [ring]
    for j in range(1, NZ + 1):
        new_ring = []
        for k, v in enumerate(ring):
            za = z1k[k]; z = za + (zbot - za) * j / NZ
            th = math.atan2(v.co.y - c0.y, v.co.x - c0.x)
            r = surf_r(th, z, za) or (Vector((v.co.x, v.co.y)) - c0).length
            new_ring.append(bm.verts.new((c0.x + math.cos(th) * r, c0.y + math.sin(th) * r, z)))
        for k in range(len(ring)):
            a0, a1 = prev_ring[k], prev_ring[(k + 1) % len(ring)]; b0, b1 = new_ring[k], new_ring[(k + 1) % len(ring)]
            try: bm.faces.new((a0, a1, b1, b0))
            except ValueError: pass
        prev_ring = new_ring; rows.append(new_ring)
    # even out the new rings (the cut leaves its points unevenly spaced, which shows as streaks)
    for it in range(6):
        for j in range(1, len(rows)):
            R_ = rows[j]; n_ = len(R_)
            th = [math.atan2(v.co.y - c0.y, v.co.x - c0.x) for v in R_]
            new_th = []
            for k in range(n_):
                a0, a1, a2 = th[k - 1], th[k], th[(k + 1) % n_]
                d0 = math.atan2(math.sin(a0 - a1), math.cos(a0 - a1)); d2 = math.atan2(math.sin(a2 - a1), math.cos(a2 - a1))
                new_th.append(a1 + (d0 + d2) * .25 * min(1., j / 3))
            for k, v in enumerate(R_):
                r = surf_r(new_th[k], v.co.z, z1k[k])
                if r: v.co.x = c0.x + math.cos(new_th[k]) * r; v.co.y = c0.y + math.sin(new_th[k]) * r
    for j in range(1, len(rows)):
        R_ = rows[j]; n_ = len(R_)
        th = [math.atan2(v.co.y - c0.y, v.co.x - c0.x) for v in R_]; rr = [(Vector((v.co.x, v.co.y)) - c0).length for v in R_]
        for _ in range(2 + j):
            rr = [(rr[k - 1] + 2 * rr[k] + rr[(k + 1) % n_]) / 4 for k in range(n_)]
        w = min(1., j / 3)
        for k, v in enumerate(R_):
            r0 = (Vector((v.co.x, v.co.y)) - c0).length; r = r0 + (rr[k] - r0) * w
            v.co.x = c0.x + math.cos(th[k]) * r; v.co.y = c0.y + math.sin(th[k]) * r
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    # hide her old head and the top of her neck (her neck below the base stays, under the new neck's last ring)
    g = body.vertex_groups.get('NW_OldHead') or body.vertex_groups.new(name='NW_OldHead')
    g.remove(list(range(len(body.data.vertices))))
    axis = Vector((hb.x, hb.y))
    hg = body.vertex_groups.get('mixamorig:Head'); hw = {}
    if hg:
        for vv in body.data.vertices:
            for gg_ in vv.groups:
                if gg_.group == hg.index: hw[vv.index] = gg_.weight
    up = [i for i, v in enumerate(V) if (hw.get(i, 0.) > .35 and v.z > z2 + .006) or (v.z > z2 + .007 and (Vector((v.x, v.y)) - axis).length < .085)]   # (her whole old head: chin and jaw too)
    g.add(up, 1., 'REPLACE')
    mk = body.modifiers.get('NW_HideOldHead') or body.modifiers.new('NW_HideOldHead', 'MASK')
    mk.vertex_group = 'NW_OldHead'; mk.invert_vertex_group = True
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
    h.parent = rig; h.matrix_parent_inverse = rig.matrix_world.inverted()
    am = h.modifiers.new('Armature', 'ARMATURE'); am.object = rig
    sub = h.modifiers.new('Smooth', 'SUBSURF'); sub.levels = 1; sub.render_levels = 1
    for p in me.polygons: p.use_smooth = True
    h.data.materials.clear(); h.data.materials.append(head_skin(name, body, WOMEN.get(name, {}).get('lips', (.14, .025, .03))))
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


def _ss(x, a, b):
    t = max(0., min(1., (x - a) / (b - a))); return t * t * (3 - 2 * t)

def reshape(me, SP, dm, s, sh):
    """Small changes so the women don't all share one face, worked in the sculpt's own millimetres (from between the eyes):
    face_len (x), jaw (x), cheeks (+mm out), nose (x width), lips (x fullness)."""
    k_len, k_jaw, d_ch, k_nose, k_lips = sh.get('face_len', 1.), sh.get('jaw', 1.), sh.get('cheeks', 0.), sh.get('nose', 1.), sh.get('lips', 1.)
    for v, p in zip(me.vertices, SP):
        r = (p - dm) * 1000.; x, y, z = r.x, r.y, r.z; dx = dy = dz = 0.
        neck_fade = 1 - _ss(z, -110, -128) if z < -110 else 1.
        if k_len != 1 and z < 0:
            dz += z * (k_len - 1) * _ss(-y, -10, 30) * neck_fade
        if k_jaw != 1:
            dx += x * (k_jaw - 1) * _ss(-z, 55, 82) * neck_fade
        if d_ch:
            g = math.exp(-(((abs(x) - 45) / 22) ** 2 + ((z + 48) / 28) ** 2)) * _ss(-y, -5, 15)
            dx += math.copysign(d_ch * g, x); dy -= d_ch * .4 * g
        if k_nose != 1:
            g = math.exp(-((x / 18) ** 2 + ((z + 46) / 18) ** 2)) * _ss(-y, 30, 45)
            dx += x * (k_nose - 1) * g
        if k_lips != 1:
            e = (x / 22) ** 2 + ((z + 73.5) / 13) ** 2
            g = max(0., 1 - e) ** 1.5 * _ss(-y, 28, 38)
            dy += (y + 40) * (k_lips - 1) * g; dz += (z + 73.5) * (k_lips - 1) * g * .6
        v.co.x += dx * s / 1000.; v.co.y += dy * s / 1000.; v.co.z += dz * s / 1000.

def head_F(name):
    """head_frame() for her new head: its points and normals (without the smoothing), eye height and centre."""
    h = bpy.data.objects[name + '.head']; rig = h.parent
    mods = [m for m in h.modifiers if m.type == 'SUBSURF']
    for m in mods: m.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get(); dg.update(); e = h.evaluated_get(dg); me = e.to_mesh(); mw = h.matrix_world; nm3 = mw.to_3x3().inverted().transposed()
    Vv = [mw @ v.co for v in me.vertices]; Nn = [(nm3 @ v.normal).normalized() for v in me.vertices]; polys = [tuple(p.vertices) for p in me.polygons]; e.to_mesh_clear()
    for m in mods: m.show_viewport = True
    eyes = bpy.data.objects[name + '.eyes']; ez = sum((eyes.matrix_world @ v.co).z for v in eyes.data.vertices) / len(eyes.data.vertices)
    hv = [p for p in Vv if p.z > ez - .01]; ctr = Vector(((min(p.x for p in hv) + max(p.x for p in hv)) / 2, (min(p.y for p in hv) + max(p.y for p in hv)) / 2, ez + .025))
    return dict(V=Vv, N=Nn, polys=polys, eyez=ez, ctr=ctr, rig=rig, neckz=ez - .12)
