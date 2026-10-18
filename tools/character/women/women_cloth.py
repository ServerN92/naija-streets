"""Clothes for the nine women, built from each woman's own body (garments.py), so they fit every shape.
Nine outfits: Ankara gown, iro & buba with gele, bodycon mini, crop top & jeans, crop tee & joggers, office suit,
fitness wear, club (sequin) mini, night wear (satin slip).
Run in naija_women.blend after women_lib.py, head_swap.py, headwear.py (uses log, new_mat, inp, W, gele2, head_F)."""
import bpy, os, sys, math, importlib, traceback, time
import numpy as np
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree
if W not in sys.path: sys.path.insert(0, W)
import garments as G
importlib.reload(G)
from garments import tube, neckline, cut_above, cut_below, cut_sleeve, cut_leg, cut_tank, smoothstep
gshell = G.shell   # (women_lib has its own shell())
TEXC = os.path.join(W, 'tex_cloth')
HEADFEET = ('head', 'handL', 'handR', 'footL', 'footR')
ARMS = ('armL', 'armR', 'handL', 'handR')
LOWER_EX = ARMS + ('footL', 'footR', 'head')

# ------------------------------------------------------------------ reading her body (rest pose, no subdivision, nothing hidden by clothes)
def body_arrays(rig, body):
    keep = []
    for md in body.modifiers:
        if md.type == 'SUBSURF' or (md.type == 'MASK' and md.name.startswith('Delete.')):
            keep.append((md, md.show_viewport)); md.show_viewport = False
        if md.type == 'ARMATURE': md.use_deform_preserve_volume = False
    pp = rig.data.pose_position; rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); ev = body.evaluated_get(dg); me = ev.to_mesh()
    mw = body.matrix_world
    V = np.array([tuple(mw @ v.co) for v in me.vertices])
    F = [list(p.vertices) for p in me.polygons]
    names = [g.name for g in body.vertex_groups]
    Wt = {n: np.zeros(len(V)) for n in names if n.startswith('mixamorig:')}
    for v in me.vertices:
        for g in v.groups:
            n = names[g.group]
            if n in Wt: Wt[n][v.index] = g.weight
    ev.to_mesh_clear()
    for md, s in keep: md.show_viewport = s
    rig.data.pose_position = pp
    J, par = {}, {}
    for b in rig.data.bones:
        J[b.name] = (np.array(rig.matrix_world @ b.head_local), np.array(rig.matrix_world @ b.tail_local))
        par[b.name.split(':')[-1]] = b.parent.name.split(':')[-1] if b.parent else None
    return V, F, Wt, J, par

def make_nearest(V):
    trees = {}
    def build(ids):
        kd = KDTree(len(ids))
        for j, i in enumerate(ids): kd.insert(Vector(V[i]), j)
        kd.balance(); return kd
    allids = np.arange(len(V)); full = build(allids)
    def nearest(P, k=1, mask=None):
        if mask is None: kd, ids = full, allids
        else:
            key = hash(mask.tobytes())
            if key not in trees: ii = np.nonzero(mask)[0]; trees[key] = (build(ii), ii)
            kd, ids = trees[key]
        if k == 1: return ids[np.array([kd.find(Vector(p))[1] for p in P], int)]
        out = np.zeros((len(P), k), int)
        for n, p in enumerate(P):
            r = kd.find_n(Vector(p), k); js = [x[1] for x in r]
            js += [js[-1]] * (k - len(js)); out[n] = js
        return ids[out]
    return nearest

_BODY = {}
def body_of(name):
    if name in _BODY: return _BODY[name]
    rig = bpy.data.objects['NW_' + name.replace(' ', '_')]; body = bpy.data.objects[name + '.body']
    V, F, Wt, J, par = body_arrays(rig, body)
    b = G.Body(V, F, Wt, J, make_nearest(V)); b.par = par
    m = (b.part == 'torso') & (V[:, 2] > b.spine1[2]) & (V[:, 2] < b.neck[2] - .05) & (np.abs(V[:, 0] - b.neck[0]) > .03)
    P = V[m]; b.bust = P[np.argmin(P[:, 1])]                       # the most forward point of the chest (front is -Y)
    b.knee = b.leg['L'][1][2]; b.ankle = b.leg['L'][2][2]
    m = (b.part == 'torso') & (np.abs(V[:, 0] - b.hip[0]) < .03)
    b.crotch_z = V[m, 2].min()                                      # (curvy thighs touch below it, so not the lowest point in the middle)
    _BODY[name] = (rig, body, b)
    return _BODY[name]

# ------------------------------------------------------------------ extra cuts
def ease_map(b, torso, arm=None, leg=None, ankle=None):
    e = np.full(b.n, float(torso))
    if arm is not None: e[np.isin(b.part, list(ARMS))] = arm
    if leg is not None:
        m = np.isin(b.part, ['legL', 'legR', 'footL', 'footR']); e[m] = leg
        if ankle is not None: e[m] = leg + (ankle - leg) * smoothstep(1.55, 1.9, b.tl[m])
    return e

def top_line(b, front, back, v=0., vw=.5, sharp=2.):
    """keep below a line round the chest (absolute heights at the front and back centre; v = a dip at the front centre)."""
    c = b.neck; V = b.V
    th = np.arctan2(V[:, 0] - c[0], -(V[:, 1] - c[1]))
    w = ((1 + np.cos(th)) / 2) ** sharp
    z = back + (front - back) * w - v * np.clip(1 - np.abs(th) / vw, 0, 1)
    return z - V[:, 2]

def straps(b, w=.014, zlow=None, xoff=None):
    """two straps over the shoulders (a strip of constant distance from the middle), kept above zlow."""
    cx = b.neck[0]
    if xoff is None: xoff = .55 * abs(b.arm['L'][0][0] - cx)
    s = w / 2 - np.abs(np.abs(b.V[:, 0] - cx) - xoff)
    if zlow is not None: s = np.minimum(s, b.V[:, 2] - zlow)
    s[b.part != 'torso'] = -1.
    return s

def union(*a): return np.max(np.stack(a), 0)

# ------------------------------------------------------------------ torn cloth (the rags)
def ragged(b, z, amp=.018, seed=1):
    """a torn hem: keep above z, the edge torn in uneven tongues"""
    r = np.random.RandomState(seed); th = b.theta
    n = sum(r.uniform(.4, 1.) * np.sin(k * th + r.uniform(0, 6.3)) / k ** .6 for k in (5, 9, 13, 21))
    return b.V[:, 2] - (z + amp * n)

def holes(b, count=7, rmin=.012, rmax=.03, parts=('torso',), zlo=None, zhi=None, seed=3):
    """round tears in the cloth (blobs where the field is < 0)"""
    r = np.random.RandomState(seed); V = b.V
    cand = np.nonzero(np.isin(b.part, list(parts)) & (V[:, 2] > (zlo if zlo is not None else -9)) & (V[:, 2] < (zhi if zhi is not None else 9)))[0]
    s = np.full(b.n, 9.)
    for c in r.choice(cand, count, replace=False):
        rad = r.uniform(rmin, rmax); d = np.linalg.norm((V - V[c]) * [1, 1, .8], axis=1)
        s = np.minimum(s, d - rad)
    return s

# ------------------------------------------------------------------ head wear on the new head (the men's file uses these too)
def head_piece(person, line_fn, off_fn, name, shift=None):
    """the new head's surface above line_fn(angle) (m above eye level), lifted off it by off_fn(h, a, p)"""
    F = head_F(person); V, N, polys, ez, c = F['V'], F['N'], F['polys'], F['eyez'], F['ctr']
    H, A = [], []
    for p in V:
        d = p - c; a = math.degrees(math.atan2(d.x, -d.y)); A.append(a)
        H.append(-1. if (d.length > .17 or p.z < ez - .1) else p.z - ez - line_fn(abs(a)))
    verts, nrm, hh, aa, idx, ek, faces = [], [], [], [], {}, {}, []
    def keep(i):
        if i not in idx: idx[i] = len(verts); verts.append(V[i]); nrm.append(N[i]); hh.append(H[i]); aa.append(A[i])
        return idx[i]
    def cut(i, j):
        k = (min(i, j), max(i, j))
        if k not in ek:
            t = H[i] / (H[i] - H[j]); ek[k] = len(verts); verts.append(V[i].lerp(V[j], t)); nrm.append(N[i].lerp(N[j], t).normalized()); hh.append(0.); aa.append(A[i])
        return ek[k]
    for poly in polys:
        hs = [H[i] for i in poly]
        if max(hs) <= 0: continue
        if min(hs) > 0: faces.append([keep(i) for i in poly]); continue
        out = []
        for k in range(len(poly)):
            i, j = poly[k], poly[(k + 1) % len(poly)]
            if H[i] > 0: out.append(keep(i))
            if (H[i] > 0) != (H[j] > 0): out.append(cut(i, j) if H[i] > 0 else cut(j, i))
        if len(set(out)) >= 3: faces.append(out)
    P = np.array([tuple(p + n * off_fn(h, a, p)) for p, n, h, a in zip(verts, nrm, hh, aa)])
    if shift is not None: P = P + np.array([shift(h, a, p) for p, h, a in zip(verts, hh, aa)])
    rig = F['rig']; hb = 'mixamorig:Head'
    uv = np.c_[P[:, 0], P[:, 1]]
    return dict(name=name, verts=P, faces=faces, uv=uv, duv=uv.copy(), part=np.full(len(P), 6.), uper=np.zeros(len(P)), weights={hb: np.ones(len(P))})

def beret(person, name='beret', K=48):
    """a police beret: a band round the head over the brows, and a flat round crown bigger than the head, pulled down
    over his right ear (his right is -X) where it hangs past the head"""
    from mathutils.bvhtree import BVHTree
    F = head_F(person); c = F['ctr']; ez = F['eyez']
    bvh = BVHTree.FromPolygons(F['V'], F['polys'])
    top = max(p.z for p in F['V'])
    def rad(z, a):
        o = Vector((c.x, c.y, z)); d = Vector((math.sin(a), -math.cos(a), 0.)); hit = bvh.ray_cast(o + d * .2, -d, .2)
        return (hit[0] - o).length if hit[0] is not None else .08
    ang = np.linspace(-math.pi, math.pi, K, endpoint=False)
    zb = np.array([ez + .036 - .04 * smoothstep(1., 2.9, abs(a)) for a in ang])         # the band: low over the brows, lower round the back
    rows = []
    for dz, out in ((0., .004), (.012, .0045), (.022, .006)):
        rows.append([(rad(z + dz, a) + out, z + dz) for a, z in zip(ang, zb)])
    r0 = np.array([r for r, z in rows[-1]]); z0 = np.array([z for r, z in rows[-1]])
    right = np.maximum(0., -np.sin(ang)); left = np.maximum(0., np.sin(ang))            # (his right is -X)
    over = .007 + .038 * right ** 1.5 + .006 * np.maximum(0., -np.cos(ang))
    zr = z0 + .03 + .012 * left - .03 * right ** 1.5                                      # the rim: close over his left, flopped down over his right ear
    zt = top + .012
    # crown: from the band out to the rim (a soft roll), then in to a flat top
    for t in (.3, .6, .85, 1.):
        r = r0 + over * math.sin(t * math.pi / 2); z = z0 + (zr - z0) * (t ** .8)
        rows.append(list(zip(r, z)))
    for t in (.25, .55, .8):
        r = (r0 + over) * (1 - t) ** .9; z = zr + (zt - zr) * math.sin(t * math.pi / 2) - .01 * right * (1 - t)
        rows.append(list(zip(r, z)))
    P = []
    for row in rows:
        for (r, z), a in zip(row, ang): P.append((c.x + math.sin(a) * r, c.y - math.cos(a) * r, z))
    P.append((c.x - .01, c.y + .005, zt)); P = np.array(P)
    R = len(rows); faces = [[i * K + k, (i + 1) * K + k, (i + 1) * K + (k + 1) % K, i * K + (k + 1) % K] for i in range(R - 1) for k in range(K)]
    n = R * K; faces += [[(R - 1) * K + k, n, (R - 1) * K + (k + 1) % K] for k in range(K)]
    uv = np.c_[P[:, 0], P[:, 1]]
    return dict(name=name, verts=P, faces=faces, uv=uv, duv=uv.copy(), part=np.full(len(P), 6.), uper=np.zeros(len(P)), weights={'mixamorig:Head': np.ones(len(P))})

# ------------------------------------------------------------------ shoes
def sole(b, side, z0=-.003, z1=.007, grow=.006, name='sole'):
    m = b.part == f'foot{side}'; Vf = b.V[m]
    s = Vf[Vf[:, 2] < .025]
    h = G.hull2d(s[:, :2]); c = h.mean(0)
    K = 40; ang = np.linspace(0, 2 * math.pi, K, endpoint=False) - math.pi
    r = G.polar(h, c, ang) + grow
    xy = np.stack([c[0] + np.sin(ang) * r, c[1] - np.cos(ang) * r], 1)
    P = np.concatenate([np.c_[xy, np.full(K, z0)], np.c_[xy, np.full(K, z1)], [[c[0], c[1], z0], [c[0], c[1], z1]]])
    F = [[k, (k + 1) % K, K + (k + 1) % K, K + k] for k in range(K)]
    F += [[2 * K, (k + 1) % K, k] for k in range(K)] + [[2 * K + 1, K + k, K + (k + 1) % K] for k in range(K)]
    uv = np.c_[P[:, 0], P[:, 1]]
    return dict(name=name, verts=P, faces=F, uv=uv, duv=uv.copy(), part=np.full(len(P), 8.), uper=np.zeros(len(P)),
                weights=G.idw_weights(b, P, [f'foot{side}'], k=4))

def pumps(b, name='pumps'):
    """closed court shoes: the foot's own shape, low over the instep, higher at the heel, on a thin sole."""
    V = b.V; s = np.full(b.n, -1.)
    for side in 'LR':
        m = b.part == f'foot{side}'; P = V[m]
        y0, y1 = P[:, 1].min(), P[:, 1].max(); u = (P[:, 1] - y0) / (y1 - y0)
        zc = np.interp(u, [0, .3, .42, .62, .82, 1], [.2, .2, .04, .036, .052, .06])
        s[np.nonzero(m)[0]] = zc - P[:, 2]
    up = gshell(b, [s], .0032, min_ease=.0026, exclude=('torso', 'neck', 'head', 'armL', 'armR', 'handL', 'handR', 'legL', 'legR'), relax=8, name=name, convex=0)
    return up

def soles(b, name='soles'):
    out = sole(b, 'L', name=name); out = G.merge(out, sole(b, 'R', name=name), name=name)
    return out

def court(b): return [(pumps(b), 'pumps'), (soles(b), 'sole')]

def soft(b, piece, iters=6, mn=.003):
    """smooth a hanging piece (the slices of the body make it a little lumpy), never closer to her than mn"""
    piece['verts'] = G.relax_grid(b, piece['verts'], piece['rings'], piece['K'], fixed_rows=(), mn=np.full(len(piece['verts']), mn), iters=iters)
    return piece

def sandals(b, name='sandals'):
    return G.slides(b, name=name)

# ------------------------------------------------------------------ the nine outfits (each: a list of (piece, fabric role))
XOFF = .075                     # straps sit on top of the shoulder, half way from the neck to the arm

def armholes(b, inner, rz=.125, dz=.0):
    """tank armholes whose inner edge is `inner` metres from the middle (so the straps stay whole)."""
    return cut_tank(b, rx=max(.03, abs(b.arm['L'][0][0] - b.neck[0]) - inner), rz=rz, dz=dz)

def skirt(b, z_top, hem, ease=.0045, flare=None, folds=None, hips=.4, smooth=8, name='skirt'):
    e = lambda z: ease + .0025 * smoothstep(z_top - .05, z_top - .02, z)     # a little looser where it goes over the top (and its thickness)
    t = tube(b, z_top, hem, ['torso', 'legL', 'legR'], ease=e, min_ease=ease * .8, step=.015, name=name, flare=flare, folds=folds,
             weights_mix=('Hips', lambda z: hips * smoothstep(hem, b.hip[2], z)))
    return soft(b, t, smooth, ease * .8) if smooth else t

def o_gown(b):
    waist = b.spine[2]
    top = gshell(b, [neckline(b, .085, .03), cut_above(b, waist - .03), cut_sleeve(b, .32)], ease_map(b, .005, .008), min_ease=.004, exclude=HEADFEET, name='gown_top')
    knee, ank = b.knee, b.ankle
    sk = tube(b, waist, ank - .03, ['torso', 'legL', 'legR'], ease=lambda z: .006 if z > knee else .006 + .02 * smoothstep(knee, ank, z), min_ease=.005,
              flare=lambda z: 1.0 + .55 * smoothstep(knee + .05, ank - .03, z) ** 1.4,
              folds=(12, lambda z: .028 * smoothstep(knee + .05, ank, z), .3), weights_mix=('Hips', lambda z: .3 + .4 * smoothstep(knee, ank, z)), name='gown_skirt', step=.016)
    return [(top, 'gown'), (sk, 'gown'), (sandals(b), 'sandals')]

def o_iro(b):
    ub = (b.spine1[2] + b.spine2[2]) / 2
    buba = gshell(b, [neckline(b, .055, .012), cut_above(b, ub - .01), cut_sleeve(b, .95)], ease_map(b, .014, .02), min_ease=.009, exclude=HEADFEET, name='buba')
    tail = tube(b, ub + .01, b.hip[2] - .09, ['torso', 'legL', 'legR'], ease=.02, min_ease=.012, weights_mix=('Spine', .4), name='buba_tail',
                folds=(7, lambda z: .004 * smoothstep(ub, b.hip[2] - .1, z), 1.1))
    wrap = tube(b, b.spine[2] + .01, b.ankle - .005, ['torso', 'legL', 'legR'], ease=.012, min_ease=.008,
                flare=lambda z: 1.0 + .06 * smoothstep(b.crotch_z, b.ankle, z), folds=(6, lambda z: .007 * smoothstep(b.crotch_z, b.ankle, z), 2.),
                weights_mix=('Hips', lambda z: .3 + .3 * smoothstep(b.crotch_z, b.ankle, z)), name='iro')
    return [(buba, 'buba'), (tail, 'buba'), (wrap, 'iro'), (sandals(b), 'sandals')]

def o_bodycon(b):          # square neck, wide straps, mini
    bz, waist = b.bust[2], b.spine[2]
    top = gshell(b, [union(top_line(b, bz + .075, b.neck[2] - .1, sharp=3), straps(b, .032, zlow=bz, xoff=XOFF)), armholes(b, XOFF + .02),
                     cut_sleeve(b, -.3), cut_above(b, waist - .03)], ease_map(b, .0035), min_ease=.003, exclude=HEADFEET, name='bodycon_top')
    return [(top, 'bodycon'), (skirt(b, waist, b.crotch_z - .16, name='bodycon_skirt'), 'bodycon')] + court(b)

def o_jeans(b):
    crop = gshell(b, [neckline(b, .06, .012), cut_above(b, (b.spine[2] + b.spine1[2]) / 2 + .03), cut_sleeve(b, .3)], ease_map(b, .0045, .006), min_ease=.0035,
                  exclude=HEADFEET, name='croptop')
    top = b.spine[2] + .005
    jeans = gshell(b, [cut_below(b, top), cut_leg(b, 1.93)], ease_map(b, .0055, leg=.006, ankle=.0045), min_ease=.004, exclude=LOWER_EX, name='jeans')
    wb = gshell(b, [cut_below(b, top + .002), cut_above(b, top - .035)], .0082, min_ease=.0075, exclude=LOWER_EX + ('neck',), relax=6, name='waistband')
    return [(crop, 'crop'), (jeans, 'denim'), (wb, 'denim_band'), (pockets(b), 'denim_band')]

def pockets(b):
    """two patch pockets on the back of the jeans (pointed at the bottom)"""
    V = b.V; cx = b.hip[0]; dx = np.abs(V[:, 0] - cx); zt = b.hip[2] + .005; zb = b.hip[2] - .115
    s = np.min(np.stack([dx - .028, .118 - dx, V[:, 2] - (zb + .03 * np.abs(dx - .073) / .045), zt - V[:, 2], V[:, 1] - (b.hip[1] + .02)]), 0)
    return gshell(b, [s], .0085, min_ease=.0078, exclude=LOWER_EX + ('neck',), relax=6, name='pockets')

def o_joggers(b):
    tee = gshell(b, [neckline(b, .05, .01), cut_above(b, b.hip[2] - .04), cut_sleeve(b, .45)], ease_map(b, .014, .015), min_ease=.01,
                 exclude=HEADFEET, name='tee')
    jog = gshell(b, [cut_below(b, b.spine[2] + .02), cut_leg(b, 1.9)], ease_map(b, .007, leg=.02, ankle=.006), min_ease=.005, exclude=LOWER_EX, name='joggers')
    return [(tee, 'tee'), (jog, 'jog')]

def button(b, z, out, r=.0095, name='button'):
    """a round button on the front centre at height z, `out` metres off the body"""
    V = b.V; cx = b.neck[0]
    m = (b.part == 'torso') & (np.abs(V[:, 0] - cx) < .012) & (np.abs(V[:, 2] - z) < .012)
    i = np.nonzero(m)[0][np.argmin(V[m, 1])]; c = V[i] + b.N[i] * out
    K = 16; ang = np.linspace(0, 2 * math.pi, K, endpoint=False)
    n = b.N[i] / np.linalg.norm(b.N[i]); u = np.cross(n, [0, 0, 1.]); u /= np.linalg.norm(u); w = np.cross(n, u)
    ring = lambda rr, d: [c + n * d + (u * math.cos(a) + w * math.sin(a)) * rr for a in ang]
    P = np.array(ring(r, 0) + ring(r * .9, .003) + [c + n * .0035])
    F = [[k, (k + 1) % K, K + (k + 1) % K, K + k] for k in range(K)] + [[K + k, K + (k + 1) % K, 2 * K] for k in range(K)]
    uv = np.zeros((len(P), 2))
    return dict(name=name, verts=P, faces=F, uv=uv, duv=uv.copy(), part=np.full(len(P), 9.), uper=np.zeros(len(P)), weights=G.idw_weights(b, P, ['torso'], k=4))

def o_office(b):
    blouse = gshell(b, [neckline(b, .035, 0., v_depth=.05, v_width=.6), cut_above(b, b.spine[2] - .04), cut_sleeve(b, .4)], ease_map(b, .0055, .007), min_ease=.0045,
                    exclude=HEADFEET, name='blouse')
    vbot = b.spine1[2] + .01; vd = (b.neck[2] - .02) - vbot
    nl = neckline(b, .02, -.012, v_depth=vd, v_width=.85)
    blazer = gshell(b, [nl, cut_above(b, b.hip[2] - .05), cut_sleeve(b, 1.9)], ease_map(b, .014, .013), min_ease=.01, exclude=HEADFEET, name='blazer')
    front = b.V[:, 1] < b.neck[1] - .02
    band = np.where(front, .065, .03)                                        # wide lapels at the front, a collar at the back
    lapel = gshell(b, [nl, band - nl, b.V[:, 2] - (vbot + .015), cut_sleeve(b, -.2)], .0175, min_ease=.016, exclude=HEADFEET + ARMS, relax=6, name='lapels')
    sk = skirt(b, b.spine[2] + .01, b.knee - .02, ease=.006, hips=.45, name='pencil')
    return [(blouse, 'blouse'), (blazer, 'blazer'), (lapel, 'lapel'), (button(b, vbot - .025, .0175), 'button'), (sk, 'blazer')] + court(b)

def o_fitness(b):
    bz = b.bust[2]
    bra = gshell(b, [neckline(b, b.neck[2] - (bz + .065), .085, sharp=2.5), armholes(b, XOFF + .012, rz=.12), cut_sleeve(b, -.3), cut_above(b, bz - .075)],
                 ease_map(b, .003), min_ease=.0025, exclude=HEADFEET, name='sports_bra')
    leg = gshell(b, [cut_below(b, b.spine[2] + .03), cut_leg(b, 1.9)], ease_map(b, .0025, leg=.0025), min_ease=.002, exclude=LOWER_EX, name='leggings')
    return [(bra, 'bra'), (leg, 'leggings')]

def o_club(b):             # strapless sequin mini
    bz, waist = b.bust[2], b.spine[2]
    top = gshell(b, [top_line(b, bz + .05, bz + .015, v=.022, vw=.3), cut_above(b, waist - .03)], ease_map(b, .004), min_ease=.0032,
                 exclude=HEADFEET + ARMS, name='club_top')
    return [(top, 'sequin'), (skirt(b, waist, b.crotch_z - .13, ease=.005, name='club_skirt'), 'sequin')] + court(b)

def o_night(b):            # satin slip with thin straps
    bz, waist = b.bust[2], b.spine[2]
    bod = gshell(b, [union(top_line(b, bz + .055, bz + .005, v=.035, vw=.55), straps(b, .016, zlow=bz - .03, xoff=XOFF)), cut_above(b, waist - .03)],
                 ease_map(b, .005), min_ease=.004, exclude=HEADFEET + ARMS, name='slip_top')
    hem = b.crotch_z - .17
    sk = skirt(b, waist, hem, ease=.0065, flare=lambda z: 1. + .1 * smoothstep(b.hip[2] - .05, hem, z), hips=.45, smooth=4,
               folds=(9, lambda z: .004 * smoothstep(b.hip[2], hem, z), .6), name='slip_skirt')
    return [(bod, 'satin'), (sk, 'satin'), (sandals(b), 'slides')]

def o_police(b):           # the police: a fitted black shirt open at the throat, a tight black skirt above the knee, belt, beret, court shoes
    bz, waist = b.bust[2], b.spine[2]
    nl = neckline(b, .06, .008, v_depth=.07, v_width=.32)
    sh = gshell(b, [nl, cut_above(b, waist - .03), cut_sleeve(b, .3)], ease_map(b, .0042, .006), min_ease=.0034, exclude=HEADFEET, name='pshirt')
    front = b.V[:, 1] < b.neck[1] - .02
    col = gshell(b, [nl + .01, np.where(front, .026, .03) - nl, cut_sleeve(b, -.2)], .0075, min_ease=.0066, exclude=HEADFEET + ARMS, relax=6, name='pcollar')
    sk = skirt(b, waist + .01, b.knee + .075, ease=.0038, hips=.45, name='pskirt')
    belt = gshell(b, [cut_below(b, waist + .012), cut_above(b, waist - .02)], .0082, min_ease=.0075, exclude=LOWER_EX + ('neck',), relax=6, name='pbelt')
    return [(sh, 'police'), (col, 'police'), (sk, 'police'), (belt, 'pbelt'), (button(b, waist - .004, .0084, r=.012, name='buckle'), 'buckle'),
            (pumps(b), 'ppumps'), (soles(b), 'sole')]

def o_rags(b):             # rags: a torn, dirty top and a torn skirt, worn slippers
    bz = b.bust[2]
    top = gshell(b, [union(top_line(b, bz + .075, b.neck[2] - .1, sharp=3), straps(b, .03, zlow=bz, xoff=XOFF)), armholes(b, XOFF + .02), cut_sleeve(b, -.3),
                     ragged(b, b.spine[2] - .02, .025, seed=6), holes(b, 4, .008, .015, ('torso',), b.spine[2] + .01, bz - .04, seed=7)],
                 ease_map(b, .006), min_ease=.005, exclude=HEADFEET, name='rag_top')
    sk = skirt(b, b.spine[2] + .01, b.knee - .03, ease=.009, hips=.4, smooth=4, name='rag_skirt')
    R, K = sk['rings'], sk['K']; G3 = sk['verts'].reshape(R, K, 3); r = np.random.RandomState(9); ang = np.linspace(0, 2 * math.pi, K, endpoint=False)
    tear = sum(r.uniform(.4, 1.) * np.sin(k * ang + r.uniform(0, 6.3)) / k ** .5 for k in (4, 7, 11, 17))
    for j, w in ((R - 1, 1.), (R - 2, .45)): G3[j, :, 2] += .022 * tear * w        # a torn hem
    sk['verts'] = G3.reshape(-1, 3)
    return [(top, 'rag_top'), (sk, 'rag_skirt'), (sandals(b), 'rag_slides')]

# name: (recipe, MakeHuman shoes or None, head wear)
OUTFITS = {
    'gown': (o_gown, None, None), 'iro_buba': (o_iro, None, 'gele'), 'bodycon': (o_bodycon, None, None), 'jeans': (o_jeans, 'shoes05', None),
    'joggers': (o_joggers, 'shoes06', None), 'office': (o_office, None, None), 'fitness': (o_fitness, 'shoes05', None), 'club': (o_club, None, None),
    'night': (o_night, None, None), 'police': (o_police, None, 'beret'), 'rags': (o_rags, None, None),
}
NAMES = {'gown': 'Ankara gown', 'iro_buba': 'Iro & buba', 'bodycon': 'Bodycon mini', 'jeans': 'Crop top & jeans', 'joggers': 'Joggers',
         'office': 'Office suit', 'fitness': 'Fitness', 'club': 'Club', 'night': 'Night wear', 'police': 'Police', 'rags': 'Rags'}

# ------------------------------------------------------------------ fabrics
def hexc(h, a=1.):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x ** 2.2 for x in c) + (a,)

ROLE = {   # how each kind of cloth looks; the colour / print comes from her palette
    'gown': dict(kind='print', tile=.34, rough=.55, weave='plain'),
    'iro': dict(kind='print', tile=.3, rough=.55, weave='plain'),
    'buba': dict(kind='lace', tile=.16, rough=.5, sheen=.3),
    'bodycon': dict(rough=.5, weave='rib'), 'crop': dict(rough=.6, weave='rib'), 'tee': dict(rough=.75, weave='knit'),
    'denim': dict(img='denim.png', bump_img='denim_h.png', tile=.12, rough=.8, tint='#9aa6c2'),
    'denim_band': dict(img='denim.png', bump_img='denim_h.png', tile=.12, rough=.8, tint='#8a96b4'),
    'jog': dict(rough=.85, weave='fleece'), 'blouse': dict(rough=.3, weave=None, sheen=.5, spec=.45),
    'blazer': dict(rough=.72, weave='twill'), 'lapel': dict(rough=.42, weave=None, sheen=.4, spec=.3),
    'button': dict(color='#c9a24a', rough=.3, metal=.9, weave=None), 'bra': dict(rough=.42, weave='knit', spec=.3), 'leggings': dict(rough=.42, weave='knit', spec=.3),
    'sequin': dict(kind='sequin', tile=.15, metal=.85, spec=.5), 'satin': dict(rough=.4, weave=None, sheen=1., spec=.3),
    'pumps': dict(rough=.16, weave=None, spec=.6, coat=1.), 'sandals': dict(color='#c79a3a', rough=.32, metal=.75, weave=None),
    'slides': dict(rough=.95, weave='velvet', sheen=1.),
    'police': dict(color='#121419', rough=.62, weave='twill'), 'pbelt': dict(color='#0b0b0c', rough=.3, weave=None, spec=.45, coat=.5),
    'buckle': dict(color='#c8c8c8', rough=.25, metal=1., weave=None), 'beret': dict(color='#0d0e10', rough=.95, weave='fleece'),
    'ppumps': dict(color='#0c0c0d', rough=.16, weave=None, spec=.6, coat=1.),
    'rag_top': dict(img='rag_white.png', tile=.35, rough=.95, weave='plain'), 'rag_skirt': dict(img='rag_khaki.png', tile=.35, rough=.95, weave='twill'),
    'rag_slides': dict(color='#4a4038', rough=.95, weave=None),
}
PAL = {
    'Amaka':       dict(gown='ankara_e', iro='ankara_c', buba='lace_gold', bodycon='#b3122e', crop='#f4f0e8', tee='#141414', jog='#8c8f96', jog_s='#ffffff', blouse='#f3efe6', blazer='#1d2d5c',
                        bra='#e8457a', leggings='#151517', leg_s='#e8457a', sequin='sequin_gold', satin='#1b1b1e', pumps='#121212', slides='#f2c4cf', gele=((.55, .38, .06), (.95, .8, .35))),
    'Ada':         dict(gown='ankara_g', iro='ankara_b', buba='lace_white', bodycon='#0f7a5a', crop='#e8457a', tee='#f2f2f2', jog='#1c1c1f', jog_s='#e8457a', blouse='#ffffff', blazer='#2b2b2e',
                        bra='#f2b705', leggings='#2b2b2e', leg_s='#f2b705', sequin='sequin_gold', satin='#7a1830', pumps='#111111', slides='#ffffff', gele=((.5, .03, .25), (.95, .7, .2))),
    'Chioma':      dict(gown='ankara_a', iro='ankara_f', buba='lace_peach', bodycon='#111111', crop='#ffffff', tee='#2a5bd7', jog='#e7e1d6', jog_s='#2a5bd7', blouse='#f6e6e9', blazer='#b7a07a',
                        bra='#26a69a', leggings='#111111', leg_s='#26a69a', sequin='sequin_silver', satin='#1d2a6b', pumps='#c0102c', slides='#f2c4cf', gele=((.02, .3, .14), (.95, .75, .25))),
    'Bisi':        dict(gown='ankara_h', iro='ankara_d', buba='lace_wine', bodycon='#5b1a6e', crop='#111111', tee='#f2b705', jog='#3a3a40', jog_s='#f2b705', blouse='#ffffff', blazer='#7a1830',
                        bra='#ffffff', leggings='#5b1a6e', leg_s='#ffffff', sequin='sequin_red', satin='#111111', pumps='#111111', slides='#111111', gele=((.4, .02, .06), (.95, .72, .25))),
    'Kemi':        dict(gown='ankara_c', iro='ankara_g', buba='lace_white', bodycon='#f2b705', crop='#26a69a', tee='#ffffff', jog='#26a69a', jog_s='#ffffff', blouse='#e9f0f7', blazer='#e9e3d6',
                        bra='#f25c54', leggings='#1d2a6b', leg_s='#f25c54', sequin='sequin_silver', satin='#26a69a', pumps='#f2f2f2', slides='#26a69a', gele=((.75, .1, .4), (1., .85, .4))),
    'Funmi':       dict(gown='ankara_b', iro='ankara_e', buba='lace_green', bodycon='#ffffff', crop='#7a1830', tee='#7a1830', jog='#111111', jog_s='#ffffff', blouse='#ffffff', blazer='#1b1b1e',
                        bra='#111111', leggings='#111111', leg_s='#ffffff', sequin='sequin_gold', satin='#0f7a5a', pumps='#7a1830', slides='#e9cdb0', gele=((.02, .3, .14), (.95, .8, .35))),
    'Mama Nkechi': dict(gown='ankara_d', iro='ankara_a', buba='lace_white', bodycon='#1d2a6b', crop='#ffffff', tee='#0b5d3b', jog='#3a3a40', jog_s='#ffffff', blouse='#ffffff', blazer='#3a2a1e',
                        bra='#1d2a6b', leggings='#1d2a6b', leg_s='#ffffff', sequin='sequin_gold', satin='#5b1a6e', pumps='#3a2a1e', slides='#5b1a6e', gele=None),
    'Iya Basira':  dict(gown='ankara_f', iro='ankara_h', buba='lace_peach', bodycon='#0b5d3b', crop='#ffffff', tee='#d6a94a', jog='#2b2b2e', jog_s='#d6a94a', blouse='#ffffff', blazer='#0b5d3b',
                        bra='#0b5d3b', leggings='#111111', leg_s='#d6a94a', sequin='sequin_red', satin='#0b5d3b', pumps='#5a3a1e', slides='#d6a94a', gele=((.75, .32, .05), (.05, .35, .15))),
    'Sgt Halima':  dict(gown='ankara_f', iro='ankara_c', buba='lace_green', bodycon='#c0102c', crop='#1d2a6b', tee='#3a3a40', jog='#1d2a6b', jog_s='#ffffff', blouse='#e9f0f7', blazer='#1d2a6b',
                        bra='#c0102c', leggings='#111111', leg_s='#c0102c', sequin='sequin_silver', satin='#e8457a', pumps='#111111', slides='#f2c4cf', gele=((.02, .2, .5), (.95, .75, .25))),
}

def spec_for(name, role):
    s = dict(ROLE[role]); p = PAL[name]; k = s.pop('kind', None)
    if k == 'print': s['img'] = p[role] + '.png'
    elif k == 'lace': s['img'] = p['buba'] + '.png'; s['bump_img'] = p['buba'] + '_h.png'
    elif k == 'sequin': q = p['sequin']; s.update(img=q + '.png', bump_img=q + '_h.png', rough_img=q + '_rough.png')
    elif role == 'lapel': s['color'] = p['blazer']
    elif 'img' not in s and 'color' not in s: s['color'] = p[role]
    if role == 'jog': s['stripes'] = p['jog_s']
    if role == 'leggings': s['stripes'] = p['leg_s']
    return s

FOOT = ('pumps', 'sole', 'sandals', 'slides', 'ppumps', 'rag_slides')
_LOADED = set()
def img(name):
    p = os.path.join(TEXC, name)
    if not os.path.exists(p): log('missing texture', name); return None
    im = bpy.data.images.load(p, check_existing=True)
    if name not in _LOADED: im.reload(); _LOADED.add(name)
    return im

def cloth_mat(person, role):
    spec = spec_for(person, role)
    m, nt, b = new_mat(f'NW_Fab_{person}_{role}')
    def node(t, loc):
        n = nt.nodes.new(t); n.location = loc; return n
    def uvnode(mapname, scale=1., loc=(-1300, 0)):
        u = node('ShaderNodeUVMap', loc); u.uv_map = mapname
        if scale == 1.: return u.outputs['UV']
        mp = node('ShaderNodeMapping', (loc[0] + 200, loc[1])); mp.inputs['Scale'].default_value = (scale, scale, 1)
        nt.links.new(u.outputs['UV'], mp.inputs['Vector']); return mp.outputs['Vector']
    def mth(op, a, bb=None, loc=(0, 0)):
        n = node('ShaderNodeMath', loc); n.operation = op
        for k, v in enumerate((a, bb)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[k].default_value = v
            else: nt.links.new(v, n.inputs[k])
        return n.outputs[0]
    col_out = None; height = None; tile = spec.get('tile', .3)
    if spec.get('img'):
        t = node('ShaderNodeTexImage', (-800, 300)); t.image = img(spec['img']); t.interpolation = 'Cubic'
        nt.links.new(uvnode('UVMap', 1 / tile, (-1200, 300)), t.inputs['Vector']); col_out = t.outputs['Color']
    else: b.inputs['Base Color'].default_value = hexc(spec.get('color', '#808080'))
    if spec.get('rough_img'):
        t = node('ShaderNodeTexImage', (-800, 0)); t.image = img(spec['rough_img']); t.image.colorspace_settings.name = 'Non-Color'
        nt.links.new(uvnode('UVMap', 1 / tile, (-1200, 0)), t.inputs['Vector']); nt.links.new(t.outputs['Color'], b.inputs['Roughness'])
    else: b.inputs['Roughness'].default_value = spec.get('rough', .7)
    if spec.get('bump_img'):
        t = node('ShaderNodeTexImage', (-800, -300)); t.image = img(spec['bump_img']); t.image.colorspace_settings.name = 'Non-Color'
        nt.links.new(uvnode('UVMap', 1 / tile, (-1200, -300)), t.inputs['Vector']); height = t.outputs['Color']
    weave = spec.get('weave', 'plain')
    if weave and height is None:
        uvm = uvnode('UVMap', 1., (-1200, -500))
        if weave in ('knit', 'rib'):
            w = node('ShaderNodeTexWave', (-800, -500)); w.wave_type = 'BANDS'; w.bands_direction = 'X'
            w.inputs['Scale'].default_value = 260 if weave == 'knit' else 160; w.inputs['Distortion'].default_value = 1.5
            nt.links.new(uvm, w.inputs['Vector']); height = w.outputs['Fac']
        elif weave == 'twill':
            w = node('ShaderNodeTexWave', (-800, -500)); w.wave_type = 'BANDS'; w.bands_direction = 'DIAGONAL'; w.inputs['Scale'].default_value = 300
            nt.links.new(uvm, w.inputs['Vector']); height = w.outputs['Fac']
        else:
            w = node('ShaderNodeTexNoise', (-800, -500)); w.inputs['Scale'].default_value = 900 if weave != 'velvet' else 300; w.inputs['Detail'].default_value = 4
            nt.links.new(uvm, w.inputs['Vector']); height = w.outputs['Fac']
    if spec.get('stripes'):   # two stripes down the outer side of each leg
        at = node('ShaderNodeAttribute', (-1100, 600)); at.attribute_name = 'side'
        du = uvnode('Design', 1., (-1300, 700)); sep = node('ShaderNodeSeparateXYZ', (-1100, 750)); nt.links.new(du, sep.inputs[0])
        centre = mth('MULTIPLY_ADD', at.outputs['Fac'], -.25, loc=(-900, 650)); centre.node.inputs[2].default_value = .5
        dist = mth('ABSOLUTE', mth('SUBTRACT', sep.outputs['X'], centre, (-750, 700)), None, (-600, 700))
        s1 = mth('LESS_THAN', mth('ABSOLUTE', mth('SUBTRACT', dist, .016, (-450, 700)), None, (-300, 700)), .005, (-150, 700))
        s1 = mth('MULTIPLY', s1, mth('ABSOLUTE', at.outputs['Fac'], None, (-300, 550)), (0, 650))
        mx = node('ShaderNodeMix', (200, 400)); mx.data_type = 'RGBA'
        nt.links.new(s1, next(i for i in mx.inputs if i.name == 'Factor' and i.type == 'VALUE'))
        next(i for i in mx.inputs if i.name == 'A' and i.type == 'RGBA').default_value = hexc(spec['color'])
        next(i for i in mx.inputs if i.name == 'B' and i.type == 'RGBA').default_value = hexc(spec['stripes'])
        col_out = next(o for o in mx.outputs if o.type == 'RGBA')
    if col_out is not None and spec.get('tint'):
        mx = node('ShaderNodeMix', (0, 300)); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
        next(i for i in mx.inputs if i.name == 'Factor' and i.type == 'VALUE').default_value = 1.
        nt.links.new(col_out, next(i for i in mx.inputs if i.name == 'A' and i.type == 'RGBA'))
        next(i for i in mx.inputs if i.name == 'B' and i.type == 'RGBA').default_value = hexc(spec['tint'])
        col_out = next(o for o in mx.outputs if o.type == 'RGBA')
    if col_out is not None: nt.links.new(col_out, b.inputs['Base Color'])
    if height is not None:
        bp = node('ShaderNodeBump', (300, -400)); bp.inputs['Strength'].default_value = .5 if 'sequin' in spec.get('img', '') else .25; bp.inputs['Distance'].default_value = .0006
        nt.links.new(height, bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    for k, v in (('Specular IOR Level', spec.get('spec', .14)), ('Sheen Weight', spec.get('sheen', 0.)), ('Sheen Roughness', .45), ('Metallic', spec.get('metal', 0.)),
                 ('Coat Weight', spec.get('coat', 0.)), ('Coat Roughness', .08)):
        i = inp(b, k)
        if i: i.default_value = v
    i = inp(b, 'Sheen Tint')
    if i and spec.get('color'): i.default_value = hexc(spec['color'])
    return m

def sole_mat():
    m, nt, b = new_mat('NW_Fab_sole'); b.inputs['Base Color'].default_value = hexc('#1a1716'); b.inputs['Roughness'].default_value = .6
    return m

# ------------------------------------------------------------------ making the objects
def orient(P, F):
    c = P.mean(0); s = 0.
    for f in F[::max(1, len(F) // 400)]:
        a, b_, cc = P[f[0]], P[f[1]], P[f[2]]
        n = np.cross(b_ - a, cc - a); d = (a + b_ + cc) / 3 - c; d[2] *= .2
        s += n @ d
    return F if s >= 0 else [list(reversed(f)) for f in F]

def build_piece(person, outfit, piece, role, rig, coll):
    P = piece['verts']; F = orient(P, piece['faces'])
    me = bpy.data.meshes.new(f'{person}.{outfit}.{piece["name"]}')
    me.from_pydata([tuple(p) for p in P], [], F); me.update()
    lp = np.array([l.vertex_index for l in me.loops])
    if len(lp) == sum(len(f) for f in F): u1, u2 = G.loop_uvs(piece, F)
    else: u1, u2 = piece['uv'][lp], piece['duv'][lp]
    for nm, arr in (('UVMap', u1), ('Design', u2)):
        uvl = me.uv_layers.new(name=nm); uvl.data.foreach_set('uv', np.asarray(arr, np.float32).ravel())
    side = np.where(np.isin(piece['part'], [1, 3]), 1., np.where(np.isin(piece['part'], [2, 4]), -1., 0.))
    for nm, arr in (('side', side), ('part', piece['part'].astype(float))):
        at = me.attributes.new(nm, 'FLOAT', 'POINT'); at.data.foreach_set('value', np.asarray(arr, np.float32))
    for poly in me.polygons: poly.use_smooth = True
    o = bpy.data.objects.new(me.name, me); coll.objects.link(o)
    o['nw'] = person; o['nw_cloth'] = outfit
    me.materials.append(sole_mat() if role == 'sole' else cloth_mat(person, role))
    for bn, w in piece['weights'].items():
        vg = o.vertex_groups.new(name=bn); nz = np.nonzero(w > 1e-4)[0]
        for i in nz: vg.add([int(i)], float(w[i]), 'REPLACE')
    sol = o.modifiers.new('Thickness', 'SOLIDIFY'); sol.thickness = .0016 if role not in ('pumps', 'slides', 'sandals', 'ppumps', 'rag_slides') else .002; sol.offset = 1.; sol.use_even_offset = role not in FOOT
    arm = o.modifiers.new('Armature', 'ARMATURE'); arm.object = rig; arm.use_deform_preserve_volume = False
    sub = o.modifiers.new('Smooth', 'SUBSURF'); sub.levels = 0; sub.render_levels = 1
    o.parent = rig; o.matrix_parent_inverse = rig.matrix_world.inverted()
    return o

def add_shoes(person, rig, body, sn):
    o = next((c for c in rig.children if c.get('nw_shoe') == sn), None)
    if o:
        if not o.get('nw_nosocks'): no_socks(o, body, sn)
        return o
    from bl_ext.blender_org.mpfb.services import HumanService, AssetService
    path = AssetService.find_asset_absolute_path(f'{sn}/{sn}.mhclo', 'clothes')
    o = HumanService.add_mhclo_asset(path, body, asset_type='Clothes', subdiv_levels=1, material_type='MAKESKIN')
    o['nw'] = person; o['nw_shoe'] = sn
    for md in o.modifiers:
        if md.type == 'ARMATURE': md.use_deform_preserve_volume = False
    no_socks(o, body, sn)
    return o

def all_positions(obj):
    """world positions of every vertex (no masks, no subdivision), in the rest pose"""
    rig = obj.parent; keep = []
    for md in obj.modifiers:
        if md.type in ('SUBSURF', 'MASK'): keep.append((md, md.show_viewport)); md.show_viewport = False
    pp = rig.data.pose_position if rig else None
    if rig: rig.data.pose_position = 'REST'
    bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); ev = obj.evaluated_get(dg); me = ev.to_mesh()
    P = np.array([tuple(obj.matrix_world @ v.co) for v in me.vertices]); ev.to_mesh_clear()
    for md, sv in keep: md.show_viewport = sv
    if rig: rig.data.pose_position = pp
    return P

def no_socks(o, body, sn):
    """MakeHuman's trainers come with tall socks: take the socks off, and give her back the skin they hid."""
    import bmesh
    P = all_positions(o)
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table(); seen = set(); kill = []; top = 0.
    for v in bm.verts:
        if v.index in seen: continue
        st = [v]; comp = []; seen.add(v.index)
        while st:
            x = st.pop(); comp.append(x)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen: seen.add(y.index); st.append(y)
        zmax = P[[c.index for c in comp], 2].max()
        if zmax > .15: kill += comp
        else: top = max(top, zmax)
    if kill:
        bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(o.data); o.data.update()
    bm.free()
    md = body.modifiers.get('Delete.' + sn); vg = body.vertex_groups.get(md.vertex_group) if md else None
    if vg and kill:
        BP = all_positions(body); out = [i for i in range(len(BP)) if BP[i, 2] > top - .02]
        vg.remove(out)
    o['nw_nosocks'] = 1
    log('socks off', o.name, len(kill), 'verts; shoe top', round(top, 3))

def outfit_gele(person, outfit):
    nm = f'{person}.{outfit}.gele'
    if PAL[person]['gele'] is None: return None      # her own gele is her everyday head tie
    mine = [o for o in bpy.data.objects if o.get('nw_headwear') == person]   # gele2 would remove her everyday head wear: hide the tag
    for o in mine: o['nw_headwear'] = '-'
    old = bpy.data.objects.get(person + '.gele')
    if old: old.name = person + '.gele_keep'
    try:
        base, acc = PAL[person]['gele']
        o = gele2(person, base=base, accent=acc); o.name = nm; o['nw_cloth'] = outfit; o['nw'] = person
        del o['nw_headwear']
    finally:
        for q in mine: q['nw_headwear'] = person
        if old: old.name = person + '.gele'
    return o

def clear_outfit(person, outfit=None):
    for o in list(bpy.data.objects):
        if o.get('nw') == person and o.get('nw_cloth') and (outfit is None or o['nw_cloth'] == outfit):
            me = o.data; bpy.data.objects.remove(o, do_unlink=True)
            if me and me.users == 0: bpy.data.meshes.remove(me)

def dress(person, keys):
    t = time.time()
    rig, body, b = body_of(person)
    coll = body.users_collection[0]; made = []
    for key in keys:
        clear_outfit(person, key)
        fn, shoes, head = OUTFITS[key]
        try:
            for piece, role in fn(b): made.append(build_piece(person, key, piece, role, rig, coll))
            if shoes:
                s = add_shoes(person, rig, body, shoes)
                L = set(filter(None, s.get('nw_outfits', '').split(','))); L.add(key); s['nw_outfits'] = ','.join(sorted(L))
            if head == 'gele': outfit_gele(person, key)
            elif head == 'beret':
                o = build_piece(person, key, beret(person), 'beret', rig, coll); o.modifiers['Thickness'].thickness = .004; made.append(o)
            log('dressed', person, key, round(time.time() - t, 1), 's')
        except Exception: log('outfit failed', person, key, traceback.format_exc())
    return made

# ------------------------------------------------------------------ posing and showing
def pose_arms_down(person, deg=36., elbow=10.):
    rig, body, b = body_of(person)
    Jn = {k: v for k, v in b.J.items()}
    R = G.arms_down(Jn, deg, elbow)
    rw = rig.matrix_world.to_3x3().normalized()
    for pb in rig.pose.bones:
        k = pb.name.split(':')[-1]
        if k not in R: continue
        B = rw @ pb.bone.matrix_local.to_3x3().normalized()
        Rm = Matrix([list(r) for r in R[k]])
        pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (B.inverted() @ Rm @ B).to_quaternion()

def show(person, key):
    """put her in one outfit (None: the grey preview suit)."""
    rig = bpy.data.objects['NW_' + person.replace(' ', '_')]; body = bpy.data.objects[person + '.body']
    head = OUTFITS[key][2] if key else None
    for o in bpy.data.objects:
        if o.get('nw') != person: continue
        vis = None
        if o.get('nw_cloth'): vis = o['nw_cloth'] == key
        elif o.get('nw_shoe'): vis = bool(key) and key in o.get('nw_outfits', '').split(',')
        elif 'sportsuit' in o.name: vis = key is None
        elif o.get('nw_hair') or o.get('nw_headwear') or (o.type == 'MESH' and o.name.startswith('HAIR_')):
            vis = not ((head == 'gele' and PAL[person]['gele'] is not None) or head == 'beret')
        if vis is not None: o.hide_render = o.hide_viewport = not vis
    for o in bpy.data.objects:   # hair objects kept by name (the downloaded ones)
        if o.name.startswith('HAIR_') and o.get('nw') == person:
            o.hide_render = o.hide_viewport = (head == 'gele' and PAL[person]['gele'] is not None) or head == 'beret'
    for md in body.modifiers:
        if md.type == 'MASK' and md.name.startswith('Delete.'):
            sn = md.name[len('Delete.'):]
            if 'sportsuit' in sn: on = key is None
            else:
                sh = next((s for s in rig.children if s.get('nw_shoe') == sn), None)
                on = bool(sh) and bool(key) and key in sh.get('nw_outfits', '').split(',')
            md.show_render = md.show_viewport = on

# ------------------------------------------------------------------ pictures
def full_shot(person, fn, yaw=-20., d=3.4, lens=55, res=(760, 1140), solo=True, z=.86, up=.2):
    sc = bpy.context.scene; rig = bpy.data.objects['NW_' + person.replace(' ', '_')]
    cam = bpy.data.objects.get('NW_FCam') or bpy.data.objects.new('NW_FCam', bpy.data.cameras.new('NW_FCam'))
    if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
    cam['nw_studio'] = 1; cam.data.lens = lens
    a = math.radians(yaw); tgt = Vector((rig.location.x, rig.location.y, z))
    cam.location = tgt + Vector((math.sin(a) * d, -math.cos(a) * d, up))
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    moved = []
    for nm in ('NW_Key', 'NW_Fill', 'NW_Rim'):
        L = bpy.data.objects.get(nm)
        if L: moved.append((L, L.location.copy())); L.location.x += rig.location.x
    hid = []
    if solo:
        for o in bpy.data.objects:
            if o.get('nw') and o.get('nw') != person and not o.hide_render: o.hide_render = True; hid.append(o)
    old = (sc.render.resolution_x, sc.render.resolution_y); sc.render.resolution_x, sc.render.resolution_y = res
    prev = sc.camera; sc.camera = cam
    try: shot(fn)
    finally:
        sc.camera = prev; sc.render.resolution_x, sc.render.resolution_y = old
        for o in hid: o.hide_render = False
        for L, loc in moved: L.location = loc
