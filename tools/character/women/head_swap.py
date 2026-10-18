"""A new head for each woman: the pretty sculpted head ("Female Head Base Mesh" by snailpot_maysachan, Sketchfab, CC BY),
made light for the game, sized and placed on her neck, its neck blended into her body, skinned to her head and neck bones.
Her MakeHuman head is hidden (mask), so the body, rig, clothes and hair fitting stay as they are.
Run after women_lib.py and face_transfer.py (donor_mesh, donor_eyes)."""
import bpy, bmesh, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

SRC = 'NW_HeadSrc'
# what the donor sculpt brings, in its own millimetres from between its eyes (the men's file sets its own: men_lib.py)
HEAD_PARTS = (('PM3D_Sphere3D1_3', 'eyes'), ('extract2_copy1', 'brows'), ('Extract1', 'liner'))
LIPS = dict(z=-73.5, ax=21.5, up=12.5, dn=11., y=-32)
BLUSH = dict(x=38, z=-30, rx=15, rz=13, y=-10)
def who(name): return (globals().get('PEOPLE') or WOMEN).get(name, {})

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

def _old_head(body, V, rig, z2, hz):
    """her old head's points (hidden by a mask): the head-weighted ones and everything over the neck's base"""
    hb = rig.matrix_world @ rig.pose.bones['mixamorig:Head'].head; axis = Vector((hb.x, hb.y))
    hg = body.vertex_groups.get('mixamorig:Head'); hw = {}
    if hg:
        for vv in body.data.vertices:
            for gg_ in vv.groups:
                if gg_.group == hg.index: hw[vv.index] = gg_.weight
    return [i for i, v in enumerate(V) if (hw.get(i, 0.) > .35 and v.z > z2 + hz - .001) or (v.z > z2 + hz and (Vector((v.x, v.y)) - axis).length < .085)]

def _neck_edge(body, V, up, c0, z2):
    """(the men) the open edge the mask leaves round the body's neck: its points in order round the neck"""
    from collections import defaultdict
    us = set(up); ef = defaultdict(lambda: [0, 0])
    for p in body.data.polygons:
        k = 0 if not any(v in us for v in p.vertices) else 1
        for e in p.edge_keys: ef[e][k] += 1
    near = lambda i: (Vector((V[i].x, V[i].y)) - c0).length < .12 and z2 - .07 < V[i].z < z2 + .03
    nbr = defaultdict(list)
    for (a_, b_), (k, r) in ef.items():
        if k == 1 and r >= 1 and near(a_) and near(b_): nbr[a_].append(b_); nbr[b_].append(a_)
    loops, seen = [], set()
    for v0 in nbr:
        if v0 in seen: continue
        loop = [v0]; seen.add(v0); prev = None; cur = v0
        while True:
            nx = [w for w in nbr[cur] if w != prev and w not in seen]
            if not nx: break
            prev, cur = cur, nx[0]; loop.append(cur); seen.add(cur)
        loops.append(loop)
    return max(loops, key=len) if loops else []

def _neck_loop(body, V, c0, zt):
    """(the men) one of the body mesh's own edge loops round the neck near height zt, and every point above it (the old
    head, to hide): cut along a real loop, the body's edge is clean, not a zigzag. None if there is no such loop."""
    bg = body.vertex_groups.get('body'); real = None
    if bg: real = {v.index for v in body.data.vertices if any(g.group == bg.index and g.weight > .5 for g in v.groups)}
    bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
    try:
        cand = [v for v in bm.verts if (real is None or v.index in real) and abs(V[v.index].z - zt) < .008 and abs(V[v.index].x - c0.x) < .012 and V[v.index].y < c0.y
                and (Vector((V[v.index].x, V[v.index].y)) - c0).length < .09 and len(v.link_edges) == 4]
        if not cand: return None
        v0 = min(cand, key=lambda v: V[v.index].y)
        def flat(e):
            a_, b_ = (V[x.index] for x in e.verts); d = b_ - a_
            return abs(d.z) / max(1e-6, d.length) + abs(d.y) / max(1e-6, d.length) * .5
        e = min(v0.link_edges, key=flat); loop = [v0.index]; v = e.other_vert(v0)
        for _ in range(400):
            if v is v0: break
            loop.append(v.index)
            if len(v.link_edges) != 4: return None
            fs = set(e.link_faces); nx = [e2 for e2 in v.link_edges if e2 is not e and not (set(e2.link_faces) & fs)]
            if len(nx) != 1: return None
            e = nx[0]; v = e.other_vert(v)
        else: return None
        P = [V[i] for i in loop]
        if len(loop) < 16 or max(p.z for p in P) - min(p.z for p in P) > .08: return None
        # everything above it: flood from the top of the head without crossing the loop
        ls = set(loop); top = max((v for v in bm.verts if (real is None or v.index in real) and (Vector((V[v.index].x, V[v.index].y)) - c0).length < .05), key=lambda v: V[v.index].z)
        seen = {top.index}; st = [top]
        while st:
            v = st.pop()
            for e2 in v.link_edges:
                w = e2.other_vert(v)
                if w.index in seen or w.index in ls: continue
                seen.add(w.index); st.append(w)
        if any(V[i].z < min(p.z for p in P) - .03 for i in seen): return None   # (it leaked into the body)
        return loop, sorted(seen)
    finally: bm.free()

def _turn(P, c0):
    """+1 if the points go anticlockwise round c0 (seen from above)"""
    t = 0.
    for k in range(len(P)):
        a0 = math.atan2(P[k - 1].y - c0.y, P[k - 1].x - c0.x); a1 = math.atan2(P[k].y - c0.y, P[k].x - c0.x)
        t += math.atan2(math.sin(a1 - a0), math.cos(a1 - a0))
    return 1 if t > 0 else -1

def _zip(bm, A, B, c0):
    """triangles between two closed rings A and B (BMVerts, both anticlockwise), by angle round c0"""
    if _turn([v.co for v in A], c0) < 0: A = A[::-1]
    if _turn([v.co for v in B], c0) < 0: B = B[::-1]
    ang = lambda v: math.atan2(v.co.y - c0.y, v.co.x - c0.x)
    a0 = ang(A[0]); kb = min(range(len(B)), key=lambda k: abs(math.atan2(math.sin(ang(B[k]) - a0), math.cos(ang(B[k]) - a0))))
    B = B[kb:] + B[:kb]
    def unwrap(L):
        out = []; prev = a0
        for v in L:
            t = ang(v); t = prev + math.atan2(math.sin(t - prev), math.cos(t - prev)); out.append(t); prev = t
        return out
    ta, tb = unwrap(A), unwrap(B); ta.append(ta[0] + 2 * math.pi); tb.append(tb[0] + 2 * math.pi)
    n, m = len(A), len(B); i = j = 0; nf = 0
    while i < n or j < m:
        if j >= m or (i < n and ta[i + 1] < tb[j + 1]): f = (A[i], A[(i + 1) % n], B[j % m]); i += 1
        else: f = (A[i % n], B[(j + 1) % m], B[j]); j += 1
        try: bm.faces.new(f); nf += 1
        except ValueError: pass
    return nf

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
    h['nw_T'] = [ocx, ocy, om.z, dcx, dcy, dm.x, dm.y, s]      # (back to the sculpt's millimetres: face paint)
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
    join = globals().get('NECK_JOIN'); edge = []
    if join:   # (the men) the new neck ends exactly on the body's own cut edge: no overlap, no gap
        # a loop of his under the sculpt's own neck, low enough at the back that the sculpt's cut (which rises to the back as his
        # loops do) stays under its jaw at the sides
        zf0 = dbot + .012; zjaw = om.z - .11 * s; nl = None; zbm = om.z - .062
        for step in range(8):
            nl = _neck_loop(body, V, c0, dbot + globals().get('NECK_LOOP', -.01) - .006 * step)
            if not nl: continue
            Lp = [V[i] for i in nl[0]]; pf_ = min(Lp, key=lambda p: p.y); pb_ = max(Lp, key=lambda p: p.y)
            zbm = min(zf0 + globals().get('NECK_SLOPE', .3) * (pb_.y - pf_.y), om.z - .062)   # (not too steep: its jaw stays whole at the sides)
            if pb_.z + .015 <= zbm and pf_.z < zf0 - .008: break
        if nl: edge, up_ = nl
        else:
            up_ = _old_head(body, V, rig, z2, globals().get('NECK_HIDE', -.01)); edge = _neck_edge(body, V, up_, c0, z2)
            log('neck join: no edge loop there, cutting by height')
        if len(edge) < 12: log('neck join: no clean edge, falling back', len(edge)); join = False
    zf, zbk = dbot + .012, dbot + .03
    if join:   # cut the sculpt parallel to the body's loop (which rises to the back), a little over it
        Lp = [V[i] for i in edge]; pf = min(Lp, key=lambda p: p.y); pb = max(Lp, key=lambda p: p.y)
        zf, zbk = zf0, min(pb.z + .03, zbm)   # (a long blend: the sculpt's neck is wider than his)
        if zbk > om.z - .06: log('neck join: the cut at the nape is high', round(zbk - om.z, 3))
    ys = [v.co.y for v in me.vertices if v.co.z < dbot + .04]; yf, yb = min(ys), max(ys)
    kz = (zbk - zf) / max(.02, yb - yf)
    pn = Vector((0., -kz, 1.)).normalized(); pc = Vector((c0.x, yf, zf))
    if join: kz = (pb.z - pf.z) / max(.02, pb.y - pf.y); pn = Vector((0., -kz, 1.)).normalized(); pc = Vector((c0.x, pf.y, zf))
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
    zbot = z2 - globals().get('NECK_BOT', .015); NZ = 10
    z1k = [v.co.z for v in ring]
    if join:
        EP = [V[i] for i in edge]
        if _turn(EP, c0) != _turn([v.co for v in ring], c0): edge = edge[::-1]; EP = EP[::-1]
        ea = [math.atan2(p.y - c0.y, p.x - c0.x) for p in EP]
        def edge_z(th):   # the edge's height at an angle (the nearest two of its points)
            d = sorted(range(len(EP)), key=lambda k: abs(math.atan2(math.sin(ea[k] - th), math.cos(ea[k] - th))))[:2]
            return max(EP[d[0]].z, EP[d[1]].z)
        zend = [min(z1k[k] - .006, edge_z(math.atan2(v.co.y - c0.y, v.co.x - c0.x)) + .004) for k, v in enumerate(ring)]
        log('neck join: body edge', len(edge), 'points, z', round(min(p.z for p in EP), 3), '-', round(max(p.z for p in EP), 3))
    def surf_r(th, z, za, zz=None):
        tt = max(0., min(1., (za - z) / max(.01, za - (z2 if zz is None else zz)))); sm = tt * tt * (3 - 2 * tt)
        rd, rd2 = rad(bvh_d, za, th), rad(bvh_d, za + .006, th)
        ed = (rd + (rd - rd2) / .006 * (za - z)) if (rd and rd2) else None
        if join: ed = rd   # (the men: a long blend, so no running on of the sculpt's slope)
        rb, rb2 = rad(bvh_b, z2, th), rad(bvh_b, z2 + .006, th)
        eb = (rb + (rb2 - rb) / .006 * (z - z2)) if (rb and rb2) else ed
        if join: eb = rad(bvh_b, z, th) or eb   # (the men: the body's own neck at that height)
        if ed is None: ed = eb
        if join: off = 0.
        else: off = -.001 if z < z2 + .008 else -.001 * max(0., 1 - (z - z2 - .008) / .02)
        return None if ed is None else ed * (1 - sm) + eb * sm + off
    if join:   # (the men) rings that line up with the body's edge (two points to each of its own), blending the sculpt's neck into his
        M = len(edge); ev = [bm.verts.new(V[i]) for i in edge]
        ea = [math.atan2(p.y - c0.y, p.x - c0.x) for p in EP]
        S = []
        for k in range(M):
            a0 = ea[k]; d = math.atan2(math.sin(ea[(k + 1) % M] - a0), math.cos(ea[(k + 1) % M] - a0))
            S.append((a0, EP[k].z)); S.append((a0 + d / 2, (EP[k].z + EP[(k + 1) % M].z) / 2))
        rth = [math.atan2(v.co.y - c0.y, v.co.x - c0.x) for v in ring]
        ZA, RA = [], []
        for th, ze in S:
            v = ring[min(range(len(ring)), key=lambda q: abs(math.atan2(math.sin(rth[q] - th), math.cos(rth[q] - th))))]
            ZA.append(v.co.z); RA.append(rad(bvh_d, v.co.z + .002, th) or (Vector((v.co.x, v.co.y)) - c0).length)
        n2 = len(S)
        us = set(up_); bvh_k = BVHTree.FromPolygons(V, [tuple(p.vertices) for p in body.data.polygons if not any(i in us for i in p.vertices)])   # (his body without the old head)
        for _ in range(4):
            RA = [(RA[k - 1] + 2 * RA[k] + RA[(k + 1) % n2]) / 4 for k in range(n2)]
        NJ = 8; prev = None
        for j in range(1, NJ):
            t = j / NJ; sm = t * t * (3 - 2 * t); R_ = []
            for (th, ze), za, ra in zip(S, ZA, RA):
                z = za + (ze - za) * t; zq = min(z, ze - .003); rb = rad(bvh_k, zq, th) or rad(bvh_k, zq - .006, th) or rad(bvh_k, zq - .012, th) or ra; r = ra * (1 - sm) + rb * sm
                R_.append(bm.verts.new((c0.x + math.cos(th) * r, c0.y + math.sin(th) * r, z)))
            if prev is None: _zip(bm, ring, R_, c0)
            else:
                for k in range(n2):
                    try: bm.faces.new((prev[k], prev[(k + 1) % n2], R_[(k + 1) % n2], R_[k]))
                    except ValueError: pass
            prev = R_
        for k in range(M):
            a, b_, c = prev[2 * k], prev[2 * k + 1], prev[(2 * k + 2) % n2]; e0, e1 = ev[k], ev[(k + 1) % M]
            for f in ((a, b_, e0), (b_, e1, e0), (b_, c, e1)):
                try: bm.faces.new(f)
                except ValueError: pass
        log('neck join:', NJ, 'rings of', n2, 'onto', M, 'body points')
    else:
        prev_ring = ring; rows = [ring]
        for j in range(1, NZ + 1):
            new_ring = []
            for k, v in enumerate(ring):
                za = z1k[k]; z = za + ((zend[k] if join else zbot) - za) * j / NZ
                th = math.atan2(v.co.y - c0.y, v.co.x - c0.x)
                r = surf_r(th, z, za, zend[k] if join else None) or (Vector((v.co.x, v.co.y)) - c0).length
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
                    r = surf_r(new_th[k], v.co.z, z1k[k], zend[k] if join else None)
                    if r: v.co.x = c0.x + math.cos(new_th[k]) * r; v.co.y = c0.y + math.sin(new_th[k]) * r
        for j in range(1, len(rows)):
            R_ = rows[j]; n_ = len(R_)
            th = [math.atan2(v.co.y - c0.y, v.co.x - c0.x) for v in R_]; rr = [(Vector((v.co.x, v.co.y)) - c0).length for v in R_]
            for _ in range(2 + j):
                rr = [(rr[k - 1] + 2 * rr[k] + rr[(k + 1) % n_]) / 4 for k in range(n_)]
            w = min(1., j / 3) * (max(0., 1. - j / (NZ - 2)) if join else 1.)   # (the men: none at the bottom, which must fit the body exactly)
            for k, v in enumerate(R_):
                r0 = (Vector((v.co.x, v.co.y)) - c0).length; r = r0 + (rr[k] - r0) * w
                v.co.x = c0.x + math.cos(th[k]) * r; v.co.y = c0.y + math.sin(th[k]) * r
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    # hide her old head and the top of her neck (her neck below the base stays, under the new neck's last ring)
    g = body.vertex_groups.get('NW_OldHead') or body.vertex_groups.new(name='NW_OldHead')
    g.remove(list(range(len(body.data.vertices))))
    up = up_ if join else _old_head(body, V, rig, z2, .007)   # (her whole old head: chin and jaw too)
    g.add(up, 1., 'REPLACE')
    mk = body.modifiers.get('NW_HideOldHead') or body.modifiers.new('NW_HideOldHead', 'MASK')
    mk.vertex_group = 'NW_OldHead'; mk.invert_vertex_group = True
    if join:   # (the men) cut before the body is smoothed, so its edge is the one the new neck was zipped to
        ix = list(body.modifiers).index(mk); sub = next((k for k, m in enumerate(body.modifiers) if m.type == 'SUBSURF'), None)
        if sub is not None and ix > sub: body.modifiers.move(ix, sub)
    # make-up masks (lipstick, blush) from the sculpt's own face, in its own measurements (mm from between the eyes)
    inv = lambda q: Vector(((q.x - ocx) / s + dcx - dm.x, (q.y - ocy) / s + dcy - dm.y, (q.z - om.z) / s)) * 1000.
    lips, blush = [], []
    for v in me.vertices:
        r = inv(v.co); Lp = LIPS
        e = (r.x / Lp['ax']) ** 2 + ((r.z - Lp['z']) / (Lp['up'] if r.z > Lp['z'] else Lp['dn'])) ** 2
        lips.append(0. if r.y > Lp['y'] else max(0., min(1., (1. - e) / .22)))
        if BLUSH:
            c = ((abs(r.x) - BLUSH['x']) / BLUSH['rx']) ** 2 + ((r.z - BLUSH['z']) / BLUSH['rz']) ** 2
            blush.append(0. if r.y > BLUSH['y'] else max(0., min(1., 1. - c)) ** 1.5)
        else: blush.append(0.)
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
    if globals().get('face_paint'): face_paint(name, h)          # (the men: brows, beard)
    h.data.materials.clear(); h.data.materials.append(head_skin(name, body, who(name).get('lips', (.14, .025, .03))))
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = h; h.select_set(True)
    try:
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=.004)
    finally:
        bpy.ops.object.mode_set(mode='OBJECT')
    # her eyes, brows and lash lines from the sculpt
    parts = []
    for src, kind in HEAD_PARTS:
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
    # brows and a beard painted on (the men; a woman's head has neither, so these do nothing there)
    out = mixc(attr('mk_brow'), out, (.012, .009, .008, 1), 'MIX', .9)
    out = mixc(attr('mk_liner'), out, (.006, .005, .004, 1), 'MIX', .85)
    bn = nt.nodes.new('ShaderNodeTexNoise'); bn.inputs['Scale'].default_value = 1400.; bn.inputs['Detail'].default_value = 2.
    br = nt.nodes.new('ShaderNodeMapRange'); br.inputs['From Min'].default_value = .35; br.inputs['From Max'].default_value = .6; L.new(bn.outputs['Fac'], br.inputs['Value'])
    bm2 = nt.nodes.new('ShaderNodeMath'); bm2.operation = 'MULTIPLY'; L.new(attr('mk_beard'), bm2.inputs[0]); L.new(br.outputs['Result'], bm2.inputs[1])
    out = mixc(bm2.outputs[0], out, (.01, .008, .007, 1), 'MIX', .92)
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

EYE = dict(k=1., white=(.62, .58, .54))   # k > 1: a bigger iris and pupil
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
    k = EYE['k']; wh = EYE['white']
    E.elements[1].position = .2 * k; E.elements[1].color = (.004, .003, .003, 1)
    for pos, col in ((.24 * k, (*[c * 1.6 for c in iris], 1)), (.4 * k, (*iris, 1)), (.47 * k, (.008, .005, .004, 1)), (.53 * k, (*wh, 1)), (1.5, (*[c * 1.06 for c in wh], 1))):
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
