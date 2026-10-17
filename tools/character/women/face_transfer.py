"""Give one of the women a new face: the shape of a well-sculpted head ("Female Head Base Mesh" by snailpot_maysachan,
Sketchfab, CC Attribution) copied onto her MakeHuman face as a shape key, so her own topology, UVs, rig and eyes stay.
Run after women_lib.py (uses _rest_positions, log)."""
import bpy, bmesh, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

DONOR = 'NW_FaceDonor'

def donor_mesh():
    d = bpy.data.objects.get(DONOR)
    if d: return d
    parts = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('PolySphere_PolySphere_0')]
    bm = bmesh.new()
    for o in parts:
        me = o.data.copy(); me.transform(o.matrix_world); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=.0002)
    me = bpy.data.meshes.new(DONOR); bm.to_mesh(me); bm.free()
    d = bpy.data.objects.new(DONOR, me); bpy.context.scene.collection.objects.link(d); d.hide_render = True
    log('donor', len(me.vertices), 'verts')
    return d

def _two_centres(pts, cx):
    L = [p for p in pts if p.x < cx]; R = [p for p in pts if p.x >= cx]
    c = lambda q: sum(q, Vector()) / len(q)
    return c(L), c(R)

def donor_eyes():
    e = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('PM3D_Sphere3D1_3'))
    P = [e.matrix_world @ v.co for v in e.data.vertices]; cx = sum(p.x for p in P) / len(P)
    return _two_centres(P, cx)

def our_eyes(name):
    e = bpy.data.objects[name + '.high-poly']; dg = bpy.context.evaluated_depsgraph_get(); ev = e.evaluated_get(dg); me = ev.to_mesh()
    P = [e.matrix_world @ v.co for v in me.vertices]; ev.to_mesh_clear(); cx = sum(p.x for p in P) / len(P)
    return _two_centres(P, cx)

def smooth01(x, a, b):
    t = max(0., min(1., (x - a) / (b - a))); return t * t * (3 - 2 * t)

def transfer(name, strength=1., near=.016, iters=40, smooth=12, scale_bias=1.0, key='NW_Face', drop=0.):
    body = bpy.data.objects[name + '.body']; rig = body.parent or body
    kb = body.data.shape_keys.key_blocks if body.data.shape_keys else None
    if kb and key in kb: kb[key].value = 0.
    V = _rest_positions(body); n = len(V)
    oL, oR = our_eyes(name); dL, dR = donor_eyes()
    s = (oR - oL).length / (dR - dL).length * scale_bias
    om, dm = (oL + oR) / 2, (dL + dR) / 2
    D = donor_mesh(); dme = D.data
    pts = [om + (D.matrix_world @ v.co - dm) * s + Vector((0, 0, -drop)) for v in dme.vertices]
    bvh = BVHTree.FromPolygons(pts, [tuple(p.vertices) for p in dme.polygons])
    # where the new face applies: the front of the head, from the hairline to under the chin, not the ears or the neck
    mask = [0.] * n
    for i, v in enumerate(V):
        r = v - om
        m = (1 - smooth01(abs(r.x), .052, .078)) * (1 - smooth01(r.y, .015, .055)) * (1 - smooth01(r.z, .045, .08)) * smooth01(r.z, -.145, -.105)
        mask[i] = m
    # the pull toward the donor's surface, where it is close; filled in and smoothed across the mesh
    me = body.data; adj = [[] for _ in range(n)]
    for e in me.edges: a, b = e.vertices; adj[a].append(b); adj[b].append(a)
    disp = [None] * n
    for i in range(n):
        if mask[i] <= 0: continue
        loc, nrm, idx, dist = bvh.find_nearest(V[i])
        if loc is not None and dist < near: disp[i] = loc - V[i]
    known = [d is not None for d in disp]
    D_ = [d.copy() if d is not None else Vector() for d in disp]
    for _ in range(iters):   # fill the holes (eye sockets, mouth) from their neighbours
        nd = list(D_)
        for i in range(n):
            if known[i] or mask[i] <= 0 or not adj[i]: continue
            nd[i] = sum((D_[j] for j in adj[i]), Vector()) / len(adj[i])
        D_ = nd
    for _ in range(smooth):   # soften it so nothing creases
        nd = list(D_)
        for i in range(n):
            if mask[i] <= 0 or not adj[i]: continue
            nd[i] = D_[i] * .5 + sum((D_[j] for j in adj[i]), Vector()) / len(adj[i]) * .5
        D_ = nd
    inv = body.matrix_world.inverted().to_3x3()
    if not body.data.shape_keys: body.shape_key_add(name='Basis')
    kb = body.data.shape_keys.key_blocks
    k = kb.get(key) or body.shape_key_add(name=key, from_mix=False)
    basis = kb[0]
    co = [0.] * (3 * n); basis.data.foreach_get('co', co)
    for i in range(n):
        d = inv @ (D_[i] * mask[i] * strength)
        co[3 * i] += d.x; co[3 * i + 1] += d.y; co[3 * i + 2] += d.z
    k.data.foreach_set('co', co); k.value = 1.; k.relative_key = basis
    body.data.update()
    log('face transfer', name, 'scale', round(s, 3), 'pulled', sum(known), 'masked', sum(1 for m in mask if m > 0))
    return k

def refit(name):
    from bl_ext.blender_org.mpfb.services import HumanService
    HumanService.refit(bpy.data.objects[name + '.body'])

# ---- a better fit: match the donor to her face by landmarks (eyes, cheek width, eye-to-chin), not by the eyes alone
def landmarks(P, eL, eR):
    cx = (eL.x + eR.x) / 2; ez = (eL.z + eR.z) / 2; ey = (eL.y + eR.y) / 2
    prof = [p for p in P if abs(p.x - cx) < .004 and p.y < ey + .03]
    nose = min((p for p in prof if ez - .08 < p.z < ez - .005), key=lambda p: p.y)
    bins = {}
    for p in prof:
        if nose.z - .16 < p.z < nose.z:
            k = int((nose.z - p.z) / .002); bins[k] = min(bins.get(k, 9.), p.y)
    ks = sorted(bins); chin_z = nose.z - .1
    for a, b in zip(ks, ks[1:]):
        if b * .002 > .035 and bins[b] - bins[a] > .012: chin_z = nose.z - a * .002; break
    band = [p for p in P if abs(p.z - (ez - .03)) < .006 and p.y < ey + .015]
    cheek = max(p.x for p in band) - min(p.x for p in band)
    return dict(cx=cx, ez=ez, ey=ey, nose=nose, chin_z=chin_z, cheek=cheek)

def transfer2(name, strength=1., near=.02, iters=40, smooth=10, key='NW_Face', eye_bias=1.):
    body = bpy.data.objects[name + '.body']
    kb = body.data.shape_keys.key_blocks
    if key in kb and kb[key].value != 0.: kb[key].value = 0.; refit(name)
    V = _rest_positions(body); n = len(V)
    oL, oR = our_eyes(name); dL, dR = donor_eyes()
    D = donor_mesh(); DP = [D.matrix_world @ v.co for v in D.data.vertices]
    Lo = landmarks(V, oL, oR); Ld = landmarks(DP, dL, dR)
    sx = Lo['cheek'] / Ld['cheek']; sz = (Lo['ez'] - Lo['chin_z']) / (Ld['ez'] - Ld['chin_z']); sy = (sx + sz) / 2
    om = (oL + oR) / 2; dm = (dL + dR) / 2
    T = lambda p: om + Vector(((p.x - dm.x) * sx * eye_bias, (p.y - dm.y) * sy, (p.z - dm.z) * sz))
    pts = [T(p) for p in DP]
    bvh = BVHTree.FromPolygons(pts, [tuple(p.vertices) for p in D.data.polygons])
    log('landmarks ours', {k: (round(v, 3) if isinstance(v, float) else tuple(round(c, 3) for c in v)) for k, v in Lo.items()})
    log('landmarks donor', {k: (round(v, 3) if isinstance(v, float) else tuple(round(c, 3) for c in v)) for k, v in Ld.items()}, 'scales', round(sx, 3), round(sy, 3), round(sz, 3))
    mask = [0.] * n
    for i, v in enumerate(V):
        r = v - om
        mask[i] = (1 - smooth01(abs(r.x), .055, .08)) * (1 - smooth01(r.y, .015, .055)) * (1 - smooth01(r.z, .045, .08)) * smooth01(r.z, (Lo['chin_z'] - om.z) - .03, (Lo['chin_z'] - om.z) + .005)
    me = body.data; adj = [[] for _ in range(n)]
    for e in me.edges: a, b = e.vertices; adj[a].append(b); adj[b].append(a)
    disp = [None] * n
    for i in range(n):
        if mask[i] <= 0: continue
        loc, nrm, idx, dist = bvh.find_nearest(V[i])
        if loc is not None and dist < near: disp[i] = loc - V[i]
    known = [d is not None for d in disp]; D_ = [d.copy() if d is not None else Vector() for d in disp]
    for _ in range(iters):
        nd = list(D_)
        for i in range(n):
            if known[i] or mask[i] <= 0 or not adj[i]: continue
            nd[i] = sum((D_[j] for j in adj[i]), Vector()) / len(adj[i])
        D_ = nd
    for _ in range(smooth):
        nd = list(D_)
        for i in range(n):
            if mask[i] <= 0 or not adj[i]: continue
            nd[i] = D_[i] * .5 + sum((D_[j] for j in adj[i]), Vector()) / len(adj[i]) * .5
        D_ = nd
    inv = body.matrix_world.inverted().to_3x3()
    k = kb.get(key) or body.shape_key_add(name=key, from_mix=False); basis = kb[0]
    co = [0.] * (3 * n); basis.data.foreach_get('co', co)
    for i in range(n):
        d = inv @ (D_[i] * mask[i] * strength); co[3 * i] += d.x; co[3 * i + 1] += d.y; co[3 * i + 2] += d.z
    k.data.foreach_set('co', co); k.value = 1.; k.relative_key = basis; body.data.update()
    refit(name)
    log('face transfer2', name, 'pulled', sum(known))
    return k
