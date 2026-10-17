"""Naija Streets clothes: garments built from each character's own body, so they fit any shape (thick, slim, tall).

Two kinds of pieces:
  * shell  - follows the body (tops, trousers, bodices): a cut-out of the body surface pushed out by an 'ease',
             relaxed so it bridges hollows like real cloth (under the bust, the small of the back), never inside the skin.
  * tube   - hangs (skirts, wrappers, gown skirts, the lower part of long tops, the agbada): rings round the body's
             outline at each height, with flare and soft folds.
Plus small pieces made from the head (cap, gele) and feet (slippers).

Pure numpy: works inside Blender and outside it. Needs a 'nearest' function: nearest(points, k=1, mask=None) -> indices.
Every piece comes back as a dict: verts, faces, uv (meters, per vertex), duv (design uv), weights {bone: array}, attrs.
"""
import numpy as np, math

PARTS = {'Hips': 'torso', 'Spine': 'torso', 'Spine1': 'torso', 'Spine2': 'torso', 'LeftShoulder': 'torso', 'RightShoulder': 'torso',
         'Neck': 'neck', 'Head': 'head', 'LeftArm': 'armL', 'LeftForeArm': 'armL', 'RightArm': 'armR', 'RightForeArm': 'armR',
         'LeftUpLeg': 'legL', 'LeftLeg': 'legL', 'RightUpLeg': 'legR', 'RightLeg': 'legR',
         'LeftFoot': 'footL', 'LeftToeBase': 'footL', 'RightFoot': 'footR', 'RightToeBase': 'footR'}
def part_of(bone):
    b = bone.split(':')[-1]
    if b in PARTS: return PARTS[b]
    if b.startswith('LeftHand'): return 'handL'
    if b.startswith('RightHand'): return 'handR'
    if b.startswith('Head'): return 'head'
    return 'torso'

def vnormals(V, F):
    N = np.zeros_like(V)
    for k in range(1, max(len(f) for f in F) - 1):
        tri = np.array([(f[0], f[k], f[k + 1]) for f in F if len(f) > k + 1])
        n = np.cross(V[tri[:, 1]] - V[tri[:, 0]], V[tri[:, 2]] - V[tri[:, 0]])
        for c in range(3): np.add.at(N, tri[:, c], n)
    return N / (np.linalg.norm(N, axis=1)[:, None] + 1e-12)

def edges_of(F):
    e = set()
    for f in F:
        for a, b in zip(f, f[1:] + f[:1]): e.add((min(a, b), max(a, b)))
    return np.array(sorted(e))

def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

class Body:
    def __init__(self, V, F, W, J, nearest):
        """V (n,3) metres Z-up facing -Y; F list of vertex lists; W {bone: (n,)}; J {bone: (head, tail)}; nearest(P, k, mask)."""
        self.V = np.asarray(V, float); self.F = [list(f) for f in F]; self.n = len(V)
        self.N = vnormals(self.V, self.F); self.E = edges_of(self.F)
        self.bones = list(W.keys()); self.Wm = np.stack([np.asarray(W[b], float) for b in self.bones], 1)
        dom = np.argmax(self.Wm, 1); has = self.Wm.max(1) > 0
        bp = np.array([part_of(b) for b in self.bones])
        self.part = np.where(has, bp[dom], 'torso')
        self.J = {b.split(':')[-1]: (np.asarray(h, float), np.asarray(t, float)) for b, (h, t) in J.items()}
        self.nearest = nearest
        j = lambda b: self.J[b][0]
        self.hip, self.spine, self.spine1, self.spine2, self.neck, self.head = j('Hips'), j('Spine'), j('Spine1'), j('Spine2'), j('Neck'), j('Head')
        self.arm = {s: [j(f'{n}Arm'), j(f'{n}ForeArm'), j(f'{n}Hand'), self.J[f'{n}Hand'][1]] for s, n in (('L', 'Left'), ('R', 'Right'))}
        self.leg = {s: [j(f'{n}UpLeg'), j(f'{n}Leg'), j(f'{n}Foot'), j(f'{n}ToeBase')] for s, n in (('L', 'Left'), ('R', 'Right'))}
        self.ta = np.full(self.n, -9.); self.tl = np.full(self.n, -9.); self.phi = np.zeros(self.n)
        for s in 'LR':
            m = np.isin(self.part, [f'arm{s}', f'hand{s}'])
            t, ph = self.chain(self.V[m], self.arm[s][:3]); self.ta[m] = t; self.phi[m] = ph
            m = np.isin(self.part, [f'leg{s}', f'foot{s}'])
            t, ph = self.chain(self.V[m], self.leg[s][:3]); self.tl[m] = t; self.phi[m] = ph
        # angle round the torso (0 = front centre, + = character's left)
        ax = (self.hip + self.neck) / 2
        self.theta = np.arctan2(self.V[:, 0] - ax[0], -(self.V[:, 1] - ax[1]))
        self.arm_len = {s: np.linalg.norm(self.arm[s][1] - self.arm[s][0]) for s in 'LR'}
        self.leg_len = {s: np.linalg.norm(self.leg[s][1] - self.leg[s][0]) for s in 'LR'}
        crotch = self.V[(np.abs(self.V[:, 0] - self.hip[0]) < .02) & (self.part != 'armL') & (self.part != 'armR')]
        self.crotch_z = crotch[crotch[:, 2] < self.hip[2]][:, 2].min() if len(crotch) else self.hip[2] - .1
        self.waist_z = self.spine[2] + .01

    def chain(self, P, pts):
        """position along a bone chain (0 at the first joint, 1 at the next ...) and the angle round it (0 = front)."""
        bt = np.full(len(P), -9.); bd = np.full(len(P), 1e9); bph = np.zeros(len(P))
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]; ab = b - a; L2 = ab @ ab
            t = np.clip(((P - a) @ ab) / L2, -.6 if i == 0 else 0, 1.6 if i == len(pts) - 2 else 1)
            q = a + t[:, None] * ab; d = np.linalg.norm(P - q, axis=1)
            better = d < bd; bt[better] = i + t[better]; bd[better] = d[better]
            u = ab / math.sqrt(L2); f = np.array([0, -1., 0]); f = f - u * (f @ u); f /= np.linalg.norm(f); s = np.cross(u, f)
            r = P - q; bph[better] = np.arctan2((r @ s)[better], (r @ f)[better])
        return bt, bph

# ------------------------------------------------------------------ cuts (fields: >= 0 keeps the vertex)
def neckline(body, front=.03, back=-.01, v_depth=0., v_width=.5, sharp=1.5):
    """keep below a neckline round the base of the neck. front/back: how far below the neck joint it sits (m).
    v_depth: an extra V at the front, v_width its half-width in radians."""
    c = body.neck; V = body.V
    th = np.arctan2(V[:, 0] - c[0], -(V[:, 1] - c[1]))
    w = ((1 + np.cos(th)) / 2) ** sharp
    wb = ((1 - np.cos(th)) / 2) ** sharp
    zl = c[2] - (front * w + back * wb) - v_depth * np.clip(1 - np.abs(th) / v_width, 0, 1)
    return zl - V[:, 2]

def cut_above(body, z): return body.V[:, 2] - z
def cut_below(body, z): return z - body.V[:, 2]
def cut_sleeve(body, t):
    s = np.full(body.n, 9.)
    for side in 'LR':
        m = np.isin(body.part, [f'arm{side}', f'hand{side}']); s[m] = (t - body.ta[m]) * body.arm_len[side]
    return s
def cut_leg(body, t):
    s = np.full(body.n, 9.)
    for side in 'LR':
        m = np.isin(body.part, [f'leg{side}', f'foot{side}']); s[m] = (t - body.tl[m]) * body.leg_len[side]
    return s
def cut_tank(body, rx=.105, rz=.13, dz=.02):
    """tank-top armholes: an oval seen from the front, cut straight through front and back."""
    s = np.full(body.n, 9.)
    for side in 'LR':
        c = body.arm[side][0]
        e = np.sqrt(((body.V[:, 0] - c[0]) / rx) ** 2 + ((body.V[:, 2] - c[2] - dz) / rz) ** 2)
        s = np.minimum(s, (e - 1) * rx)
    return s

def cut_armhole(body, r, drop=0.):
    s = np.full(body.n, 9.)
    for side in 'LR':
        c = body.arm[side][0] - np.array([0, 0, drop]); s = np.minimum(s, np.linalg.norm(body.V - c, axis=1) - r)
    return s

# ------------------------------------------------------------------ shell garments
def shell(body, cuts, ease, min_ease=None, exclude=(), relax=12, lam=.5, name='shell', convex=1.0):
    """cuts: list of arrays (>=0 keeps); ease: float or array per body vertex (m); exclude: parts never covered."""
    V, N = body.V, body.N
    s = np.min(np.stack(cuts), 0)
    bad = np.isin(body.part, list(exclude))
    inside = (s >= 0) & ~bad
    faces = [f for f in body.F if inside[f].any() and not bad[f].any()]
    used = np.unique(np.concatenate([np.array(f) for f in faces]))
    outer = np.zeros(body.n, bool); outer[used] = ~inside[used]
    # snap the outer ring onto the cut, so hems are clean lines
    acc = np.zeros((body.n, 3)); accn = np.zeros((body.n, 3)); cnt = np.zeros(body.n); accw = np.zeros((body.n, body.Wm.shape[1]))
    def add(a, b):                          # a inside, b outer
        t = s[a] / (s[a] - s[b] + 1e-12); t = min(max(t, 0.), 1.)
        acc[b] += V[a] + t * (V[b] - V[a]); accn[b] += N[a] + t * (N[b] - N[a]); accw[b] += body.Wm[a] + t * (body.Wm[b] - body.Wm[a]); cnt[b] += 1
    for f in faces:
        for a, b in zip(f, f[1:] + f[:1]):
            if inside[a] and outer[b]: add(a, b)
            elif inside[b] and outer[a]: add(b, a)
    for f in faces:
        for b in f:
            if outer[b] and cnt[b] == 0:
                for a in f:
                    if inside[a]: add(a, b)
    P0 = V.copy(); N0 = N.copy(); W0 = body.Wm.copy()
    m = cnt > 0
    P0[m] = acc[m] / cnt[m, None]; N0[m] = accn[m] / cnt[m, None]; N0[m] /= np.linalg.norm(N0[m], axis=1)[:, None]; W0[m] = accw[m] / cnt[m, None]
    # compact
    remap = -np.ones(body.n, int); remap[used] = np.arange(len(used))
    F = [[remap[v] for v in f] for f in faces]
    ease_v = np.broadcast_to(np.asarray(ease, float), (body.n,))[used] if np.ndim(ease) else np.full(len(used), float(ease))
    mn = ease_v * .6 if min_ease is None else (np.broadcast_to(np.asarray(min_ease, float), (body.n,))[used] if np.ndim(min_ease) else np.full(len(used), float(min_ease)))
    P = P0[used] + N0[used] * ease_v[:, None]
    bnd = outer[used]
    E = edges_of(F)
    deg = np.zeros(len(P)); np.add.at(deg, E[:, 0], 1); np.add.at(deg, E[:, 1], 1)
    sp = body.part[used]
    for it in range(relax):
        S = np.zeros_like(P); np.add.at(S, E[:, 0], P[E[:, 1]]); np.add.at(S, E[:, 1], P[E[:, 0]])
        L = S / np.maximum(deg, 1)[:, None] - P
        P[~bnd] += lam * L[~bnd]
        if convex and it in (relax // 3, 2 * relax // 3): P = convexify(body, P, sp, convex, ~bnd)
        P = push_out(body, P, mn)
    return finish(body, P, F, W0[used], src_parts=body.part[used], src=used, name=name, theta=body.theta[used], ta=body.ta[used], tl=body.tl[used], phi=body.phi[used])

def convexify(body, P, sp, amt, movable, dz=.012):
    """cloth spans hollows: in each thin horizontal slice, pull points out towards the slice's convex outline
    (the torso and hips as one, each leg below the crotch on its own; arms are left alone)."""
    P = P.copy()
    arms = np.isin(sp, ['armL', 'armR', 'handL', 'handR'])
    legs = np.isin(sp, ['legL', 'legR', 'footL', 'footR'])
    groups = [~arms & ((P[:, 2] >= body.crotch_z + .015) | ~legs)]
    for side in 'LR': groups.append(np.isin(sp, [f'leg{side}', f'foot{side}']) & (P[:, 2] < body.crotch_z + .015))
    z0, z1 = P[:, 2].min(), P[:, 2].max()
    for g in groups:
        for zc in np.arange(z0, z1 + dz, dz):
            m = g & (np.abs(P[:, 2] - zc) <= dz / 2)
            if m.sum() < 6: continue
            xy = P[m, :2]; h = hull2d(xy)
            if len(h) < 3: continue
            c = h.mean(0); d = xy - c; r = np.linalg.norm(d, axis=1) + 1e-9
            th = np.arctan2(d[:, 0], -d[:, 1]); rh = polar(h, c, th)
            gap = np.maximum(rh - r, 0)
            k = np.where(movable[m], amt, 0.) * smoothstep(.05, .03, gap)     # bridge hollows, not the gap between the legs
            nr = r + k * gap
            P[np.nonzero(m)[0], :2] = c + d * (nr / r)[:, None]
    return P

def push_out(body, P, mn):
    idx = body.nearest(P)
    d = ((P - body.V[idx]) * body.N[idx]).sum(1)
    m = d < mn
    P = P.copy(); P[m] += body.N[idx[m]] * (mn[m] - d[m])[:, None] if np.ndim(mn) else body.N[idx[m]] * (mn - d[m])[:, None]
    return P

def finish(body, P, F, Wv, src_parts, src, name, theta, ta, tl, phi):
    """uv in metres (u round the part, v up the part) + a design uv per part, and the weights."""
    n = len(P); uv = np.zeros((n, 2)); duv = np.zeros((n, 2)); part_id = np.zeros(n)
    torso = ~np.isin(src_parts, ['armL', 'armR', 'handL', 'handR', 'legL', 'legR', 'footL', 'footR'])
    R = .17
    uv[torso, 0] = theta[torso] * R; uv[torso, 1] = P[torso, 2]
    duv[torso, 0] = .5 + theta[torso] / (2 * math.pi)
    for k, side in enumerate('LR'):
        m = np.isin(src_parts, [f'arm{side}', f'hand{side}'])
        uv[m, 0] = phi[m] * .05; uv[m, 1] = -ta[m] * body.arm_len[side]; duv[m, 0] = .5 + phi[m] / (2 * math.pi); part_id[m] = 1 + k
        m = np.isin(src_parts, [f'leg{side}', f'foot{side}'])
        uv[m, 0] = phi[m] * .085; uv[m, 1] = -tl[m] * body.leg_len[side]; duv[m, 0] = .5 + phi[m] / (2 * math.pi); part_id[m] = 3 + k
    z0, z1 = P[torso, 2].min() if torso.any() else 0, P[torso, 2].max() if torso.any() else 1
    duv[torso, 1] = (P[torso, 2] - z0) / max(z1 - z0, 1e-6)
    for k, side in enumerate('LR'):
        m = part_id == 1 + k
        if m.any(): duv[m, 1] = 1 - np.clip(ta[m] / 2, 0, 1)
        m = part_id == 3 + k
        if m.any(): duv[m, 1] = 1 - np.clip(tl[m] / 2, 0, 1)
    W = {b: Wv[:, i] for i, b in enumerate(body.bones) if Wv[:, i].max() > 1e-4}
    uper = np.where(part_id == 0, 2 * math.pi * R, np.where(part_id <= 2, 2 * math.pi * .05, 2 * math.pi * .085))
    return dict(name=name, verts=P, faces=F, uv=uv, duv=duv, part=part_id, weights=W, uper=uper)

# ------------------------------------------------------------------ tube garments
def hull2d(pts):
    pts = sorted(set(map(tuple, np.round(pts, 5))))
    if len(pts) < 3: return np.array(pts)
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return np.array(lo[:-1] + up[:-1])

def polar(hull, c, ang):
    """radius of a convex polygon from centre c along each angle (0 = -Y front, + towards +X)."""
    d = np.stack([np.sin(ang), -np.cos(ang)], 1)
    A = hull - c; B = np.roll(hull, -1, 0) - c
    r = np.full(len(ang), 0.)
    for a, b in zip(A, B):
        e = b - a
        den = d[:, 0] * e[1] - d[:, 1] * e[0]
        with np.errstate(divide='ignore', invalid='ignore'):
            t = (a[0] * e[1] - a[1] * e[0]) / den          # distance along the ray
            u = (a[0] * d[:, 1] - a[1] * d[:, 0]) / den      # position along the edge
        ok = (np.abs(den) > 1e-12) & (t > 0) & (u >= -1e-6) & (u <= 1 + 1e-6)
        r = np.where(ok, np.maximum(r, t), r)
    return r

def tube(body, z_top, z_bot, parts, ease=.01, flare=None, folds=None, K=72, step=.018, slab=.014, min_ease=.004,
         hang=None, weights_mix=None, name='tube', centre=None, keep_width_below=None):
    """flare(z) -> scale >= 1; folds = (count, amp(z) in m, phase); hang: rows hang straight below this z (no narrowing)."""
    V = body.V
    allow = np.isin(body.part, list(parts))
    zs = np.arange(z_top, z_bot - 1e-6, -step)
    if zs[-1] > z_bot + 1e-4: zs = np.append(zs, z_bot)
    ang = np.linspace(0, 2 * math.pi, K, endpoint=False) - math.pi
    hulls, cs = [], []
    for z in zs:
        m = allow & (np.abs(V[:, 2] - z) < slab)
        if m.sum() < 3: hulls.append(hulls[-1] if hulls else None); cs.append(cs[-1] if cs else np.array(body.hip[:2])); continue
        h = hull2d(V[m][:, :2]); hulls.append(h); cs.append(h.mean(0) if centre is None else np.array(centre, float))
    C = np.array(cs)
    for _ in range(6): C[1:-1] = (C[:-2] + 2 * C[1:-1] + C[2:]) / 4     # smooth the centre line
    Rh = np.array([polar(h, c, ang) if h is not None else np.full(K, .1) for h, c in zip(hulls, C)])
    if keep_width_below is not None:     # below this height the cloth keeps the width it had (hangs from the arms / hips)
        k0 = np.argmin(np.abs(zs - keep_width_below))
        for i in range(k0 + 1, len(zs)): Rh[i] = np.maximum(Rh[i], Rh[i - 1] * .985)
    e = np.array([ease(z) if callable(ease) else ease for z in zs])
    R = Rh + e[:, None]
    for _ in range(3):                    # smooth up/down and round
        R[1:-1] = (R[:-2] + 2 * R[1:-1] + R[2:]) / 4
        R = (np.roll(R, 1, 1) + 2 * R + np.roll(R, -1, 1)) / 4
        R = np.maximum(R, Rh + min_ease)
    if flare: R = R * np.array([flare(z) for z in zs])[:, None]
    if folds:
        cnt, amp, ph = folds
        a = np.array([amp(z) for z in zs])
        R = R + a[:, None] * np.sin(cnt * ang + ph)[None, :] * (1 + .35 * np.sin(2.3 * ang + 1.7 * ph))[None, :]
    P = np.zeros((len(zs), K, 3))
    P[:, :, 0] = C[:, 0:1] + np.sin(ang)[None] * R; P[:, :, 1] = C[:, 1:2] - np.cos(ang)[None] * R; P[:, :, 2] = zs[:, None]
    P = P.reshape(-1, 3)
    F = []
    for i in range(len(zs) - 1):
        for k in range(K):
            a = i * K + k; b = i * K + (k + 1) % K
            F.append([a, a + K, b + K, b])
    # uv: metres round and up; design uv normalised
    rbar = R.mean(1)
    uv = np.stack([np.tile(ang, len(zs)) * np.repeat(rbar, K), P[:, 2]], 1)
    duv = np.stack([.5 + np.tile(ang, len(zs)) / (2 * math.pi), np.repeat((zs - z_bot) / max(z_top - z_bot, 1e-6), K)], 1)
    # weights: the nearest allowed body vertices, softened towards the hips so the cloth does not split between the legs
    idx = body.nearest(P, k=6, mask=allow)
    d = np.linalg.norm(body.V[idx] - P[:, None], axis=2) + 1e-4; w = 1 / d ** 2; w /= w.sum(1, keepdims=True)
    Wv = (body.Wm[idx] * w[:, :, None]).sum(1)
    if weights_mix:
        bone, amt = weights_mix
        bi = body.bones.index(next(b for b in body.bones if b.split(':')[-1] == bone))
        a = amt(P[:, 2]) if callable(amt) else np.full(len(P), amt)
        Wv = Wv * (1 - a[:, None]); Wv[:, bi] += a
    W = {b: Wv[:, i] for i, b in enumerate(body.bones) if Wv[:, i].max() > 1e-4}
    return dict(name=name, verts=P, faces=F, uv=uv, duv=duv, part=np.full(len(P), 5.), weights=W, rings=len(zs), K=K, uper=np.repeat(2 * math.pi * rbar, K))

# ------------------------------------------------------------------ joining helpers
def ring(body, z, parts, ease, K, slab=.012, centre=None):
    m = np.isin(body.part, list(parts)) & (np.abs(body.V[:, 2] - z) < slab)
    h = hull2d(body.V[m][:, :2]); c = h.mean(0) if centre is None else np.array(centre, float)
    ang = np.linspace(0, 2 * math.pi, K, endpoint=False) - math.pi
    return c, polar(h, c, ang) + ease, ang

def merge(a, b, name=None):
    """join two pieces; if b's first ring of a.K points equals a's last ring, they are stitched (shared verts)."""
    n = len(a['verts'])
    out = dict(name=name or a['name'], verts=np.concatenate([a['verts'], b['verts']]), faces=a['faces'] + [[v + n for v in f] for f in b['faces']],
               uv=np.concatenate([a['uv'], b['uv']]), duv=np.concatenate([a['duv'], b['duv']]), part=np.concatenate([a['part'], b['part']]),
               uper=np.concatenate([a.get('uper', np.zeros(n)), b.get('uper', np.zeros(len(b['verts'])))]))
    W = {}
    for k in set(a['weights']) | set(b['weights']):
        W[k] = np.concatenate([a['weights'].get(k, np.zeros(n)), b['weights'].get(k, np.zeros(len(b['verts'])))])
    out['weights'] = W
    return out

def idw_weights(body, P, parts, k=6, mix=None):
    allow = np.isin(body.part, list(parts))
    idx = body.nearest(P, k=k, mask=allow)
    d = np.linalg.norm(body.V[idx] - P[:, None], axis=2) + 1e-4; w = 1 / d ** 2; w /= w.sum(1, keepdims=True)
    Wv = (body.Wm[idx] * w[:, :, None]).sum(1)
    if mix:
        bone, amt = mix
        bi = next(i for i, b in enumerate(body.bones) if b.split(':')[-1] == bone)
        Wv = Wv * (1 - amt); Wv[:, bi] += amt
    return {b: Wv[:, i] for i, b in enumerate(body.bones) if Wv[:, i].max() > 1e-4}

def grid_piece(body, P, rows, K, name, parts, mix=None, closed=True):
    F = []
    for i in range(rows - 1):
        for k in range(K if closed else K - 1):
            a = i * K + k; b = i * K + (k + 1) % K
            F.append([a, a + K, b + K, b])
    ang = np.tile(np.linspace(-math.pi, math.pi, K, endpoint=not closed), rows)
    rbar = np.repeat([np.linalg.norm(P[i * K:(i + 1) * K, :2] - P[i * K:(i + 1) * K, :2].mean(0), axis=1).mean() for i in range(rows)], K)
    uv = np.stack([ang * rbar, P[:, 2]], 1)
    zr = P[:, 2]; duv = np.stack([.5 + ang / (2 * math.pi), (zr - zr.min()) / max(np.ptp(zr), 1e-6)], 1)
    return dict(name=name, verts=P, faces=F, uv=uv, duv=duv, part=np.full(len(P), 6.), weights=idw_weights(body, P, parts, mix=mix), rings=rows, K=K, uper=2 * math.pi * rbar)

def relax_grid(body, P, rows, K, fixed_rows, mn, iters=6, lam=.5, closed=True):
    G = P.reshape(rows, K, 3).copy()
    for _ in range(iters):
        nb = (np.roll(G, 1, 1) + np.roll(G, -1, 1)) if closed else None
        up = np.concatenate([G[:1], G[:-1]]); dn = np.concatenate([G[1:], G[-1:]])
        L = (nb + up + dn) / 4 - G
        mov = np.ones(rows, bool); mov[list(fixed_rows)] = False
        G[mov] += lam * L[mov]
        G = push_out(body, G.reshape(-1, 3), mn).reshape(rows, K, 3)
    return G.reshape(-1, 3)

# ------------------------------------------------------------------ agbada / robes: a cape over the shoulders into a wide hanging tube
def robe(body, hem_z, ease=.035, min_ease=.025, K=72, neck_drop=.05, cap_rows=7, folds=(9, .022), name='robe'):
    sh = body.arm['L'][0][2]; wrist = body.arm['L'][2][2]
    parts = ['torso', 'legL', 'legR', 'armL', 'armR']
    t = tube(body, sh - .03, hem_z, parts, ease=ease, min_ease=min_ease, K=K, keep_width_below=wrist + .04,
             flare=lambda z: 1.0 + .03 * smoothstep(wrist, hem_z, z), folds=(folds[0], lambda z: folds[1] * smoothstep(sh - .1, wrist - .25, z), .7),
             weights_mix=('Spine2', .35), name=name, step=.02)
    top = t['verts'][:K]
    # neck opening (lower at the front)
    c, r, ang = ring(body, body.neck[2] - .005, ['neck', 'torso'], .03, K, slab=.01)
    zn = body.neck[2] - .005 - neck_drop * ((1 + np.cos(ang)) / 2) ** 2
    inner = np.stack([c[0] + np.sin(ang) * r, c[1] - np.cos(ang) * r, zn], 1)
    rows = []
    for j in range(cap_rows):
        u = j / (cap_rows - 1)
        row = inner + (top - inner) * u
        row[:, 2] += .05 * math.sin(math.pi * u)       # rises over the shoulder
        rows.append(row)
    P = np.concatenate(rows)
    P = push_out(body, P, np.full(len(P), min_ease))
    P = relax_grid(body, P, cap_rows, K, fixed_rows=(0, cap_rows - 1), mn=np.full(len(P), min_ease), iters=10)
    capm = grid_piece(body, P[:-K], cap_rows - 1, K, name, ['torso', 'neck', 'armL', 'armR'], mix=('Spine2', .3))
    # stitch: the cap's last row joins the tube's first ring
    out = merge(capm, t, name=name)
    # below the waist the robe hangs from the hips (it must not split between the legs when you walk)
    hb = next(bn for bn in out['weights'] if bn.split(':')[-1] == 'Hips') if any(bn.split(':')[-1] == 'Hips' for bn in out['weights']) else 'mixamorig:Hips'
    k = .75 * smoothstep(body.hip[2] + .05, body.hip[2] - .45, out['verts'][:, 2])
    for bn in list(out['weights']): out['weights'][bn] = out['weights'][bn] * (1 - k)
    out['weights'][hb] = out['weights'].get(hb, np.zeros(len(k))) + k
    n0 = len(capm['verts']); r0 = (cap_rows - 2) * K
    for k in range(K):
        a = r0 + k; b = r0 + (k + 1) % K
        out['faces'].append([a, n0 + k, n0 + (k + 1) % K, b])
    return out

# ------------------------------------------------------------------ head pieces
def head_info(body):
    h0, h1 = body.J['Head']
    eyez = h0[2] + .45 * (h1[2] - h0[2])
    return eyez, h1[2]

def head_ring(body, z, extra, K):
    m = (body.part == 'head') & (np.abs(body.V[:, 2] - z) < .008)
    if m.sum() < 5: m = (body.part == 'head') & (np.abs(body.V[:, 2] - z) < .02)
    h = hull2d(body.V[m][:, :2]); c = h.mean(0)
    ang = np.linspace(0, 2 * math.pi, K, endpoint=False) - math.pi
    return c, polar(h, c, ang) + extra, ang

def fila(body, hair=(.03, .014), K=56, lean=1., name='fila'):
    """a soft Yoruba cap: a band low on the forehead, the crown slouched to one side."""
    eyez, top = head_info(body)
    rows, H = 9, (top + hair[0]) - (eyez + .05) + .045
    P = []
    for j in range(rows):
        t = j / (rows - 1)
        c, r, ang = head_ring(body, min(eyez + .05 + t * H, top - .01), hair[1] + .006, K)
        band_z = eyez + .052 - .028 * ((1 - np.cos(ang)) / 2)           # lower at the back
        z = band_z + t * H
        rr = r * (1 + .06 * t) if t < .75 else r * (1 + .06 * t) * (1 - 1.6 * (t - .75) ** 1.5)
        off = lean * .05 * t ** 2.2
        P.append(np.stack([c[0] + np.sin(ang) * rr + off, c[1] - np.cos(ang) * rr, z - .02 * t ** 3 * (1 + np.sin(ang) * lean)], 1))
    P = np.concatenate(P)
    piece = grid_piece(body, P, rows, K, name, ['head'], mix=('Head', 1.))
    # close the crown
    n = len(P); ctr = P[-K:].mean(0); ctr[2] = P[-K:, 2].max() - .004
    piece['verts'] = np.concatenate([P, ctr[None]]); piece['uv'] = np.concatenate([piece['uv'], [[0, ctr[2]]]]); piece['duv'] = np.concatenate([piece['duv'], [[.5, 1]]])
    piece['part'] = np.append(piece['part'], 6.); piece['uper'] = np.append(piece['uper'], 0.)
    for k in range(K): piece['faces'].append([n - K + k, n - K + (k + 1) % K, n])
    piece['weights'] = {b: np.append(w, w[-1]) for b, w in piece['weights'].items()}
    return piece

def gele(body, clear=.032, K=64, height=.1, fan_h=.15, pleats=13, name='gele'):
    """a Nigerian head-tie: a wrapped band round the head, a crown, and the tall pleated fan at the back."""
    eyez, top = head_info(body)
    pieces = []
    # wrapped band + crown (closed dome)
    rows = 10; P = []
    for j in range(rows):
        t = j / (rows - 1)
        c, r, ang = head_ring(body, min(eyez + .04 + t * (top - eyez), top - .012), clear, K)
        band_z = eyez + .045 - .055 * ((1 - np.cos(ang)) / 2) ** 1.3
        z = band_z + t * (top + clear - band_z + .02)
        rr = r * (1 - .9 * max(0, t - .7) ** 1.6 / .3 ** 1.6 * .55)
        wrap = .006 * np.sin(np.linspace(0, 6 * math.pi, K) + 9 * t) * (t < .7)
        P.append(np.stack([c[0] + np.sin(ang) * (rr + wrap), c[1] - np.cos(ang) * (rr + wrap), z], 1))
    P = np.concatenate(P)
    band = grid_piece(body, P, rows, K, name, ['head'], mix=('Head', 1.))
    n = len(P); ctr = P[-K:].mean(0); ctr[2] += .006
    band['verts'] = np.concatenate([P, ctr[None]]); band['uv'] = np.concatenate([band['uv'], [[0, ctr[2]]]]); band['duv'] = np.concatenate([band['duv'], [[.5, 1]]])
    band['part'] = np.append(band['part'], 6.); band['uper'] = np.append(band['uper'], 0.)
    for k in range(K): band['faces'].append([n - K + k, n - K + (k + 1) % K, n])
    band['weights'] = {b: np.append(w, w[-1]) for b, w in band['weights'].items()}
    # the fan: rises from the top-back of the head, opening outwards, with pleats
    c, r, ang = head_ring(body, top - .03, clear, 128)
    S, R = 57, 9
    s = np.linspace(-1, 1, S)                       # across the fan (side to side round the back)
    a0 = math.pi - s * math.radians(125)            # angle round the head: 180 = back
    base_r = np.interp(np.mod(a0 + math.pi, 2 * math.pi) - math.pi, ang, r)
    F = []; Q = []
    for j in range(R):
        t = j / (R - 1)
        prof = np.clip(1 - s ** 2, 0, 1)            # tall in the middle, melting into the band at the sides
        rr = base_r * (1 + .95 * t ** 1.1 * (.35 + .65 * prof)) + .01
        z = top - .035 + t * fan_h * (.15 + .85 * prof ** .7)
        back = -.05 * t * prof                       # leans back
        pl = .026 * t ** .7 * np.sin(pleats * math.pi * (s + 1) / 2) * (1 - .2 * s ** 2)
        x = c[0] + np.sin(a0) * (rr + pl); y = c[1] - np.cos(a0) * (rr + pl) - back
        Q.append(np.stack([x, y, z], 1))
    Q = np.concatenate(Q)
    for j in range(R - 1):
        for i in range(S - 1):
            a = j * S + i; F.append([a, a + 1, a + 1 + S, a + S])
    uv = np.stack([np.tile(s, R) * .25, np.repeat(np.linspace(0, fan_h, R), S)], 1)
    duv = np.stack([np.tile((s + 1) / 2, R), np.repeat(np.linspace(0, 1, R), S)], 1)
    fan = dict(name=name + '_fan', verts=Q, faces=F, uv=uv, duv=duv, part=np.full(len(Q), 7.), uper=np.zeros(len(Q)), weights={next(b for b in body.bones if b.endswith('Head')): np.ones(len(Q))})
    return merge(band, fan, name=name)

# ------------------------------------------------------------------ feet: rubber slides
def slides(body, name='slides'):
    out = None
    for side in 'LR':
        m = body.part == f'foot{side}'
        Vf = body.V[m]
        sole = Vf[Vf[:, 2] < .025]
        h = hull2d(sole[:, :2]); c = h.mean(0)
        K = 40; ang = np.linspace(0, 2 * math.pi, K, endpoint=False) - math.pi
        r = polar(h, c, ang) + .007
        ringxy = np.stack([c[0] + np.sin(ang) * r, c[1] - np.cos(ang) * r], 1)
        P = np.concatenate([np.c_[ringxy, np.full(K, -.002)], np.c_[ringxy, np.full(K, .013)]])
        P = np.concatenate([P, [[c[0], c[1], -.002], [c[0], c[1], .013]]])
        F = [[k, (k + 1) % K, K + (k + 1) % K, K + k] for k in range(K)]
        F += [[2 * K, (k + 1) % K, k] for k in range(K)] + [[2 * K + 1, K + k, K + (k + 1) % K] for k in range(K)]
        # the strap over the instep
        ymid = c[1] - .01
        sec = Vf[(np.abs(Vf[:, 1] - ymid) < .025) & (Vf[:, 2] > .0)]
        hx = hull2d(sec[:, [0, 2]]); cx = hx.mean(0)
        M = 24; aa = np.linspace(-math.pi / 2 - 1.25, -math.pi / 2 + 1.25, M)  # over the top
        # polar in the x-z plane round the instep section
        d = np.stack([np.cos(aa), -np.sin(aa)], 1)
        rr = polar(hx, cx, np.arctan2(d[:, 0], -d[:, 1])) + .005
        n0 = len(P); rowsS = []
        for dy in (-.03, .03):
            rowsS.append(np.stack([cx[0] + d[:, 0] * rr, np.full(M, ymid + dy), cx[1] + d[:, 1] * rr], 1))
        S = np.concatenate(rowsS); S[:, 2] = np.maximum(S[:, 2], .01)
        P = np.concatenate([P, S])
        F += [[n0 + i, n0 + i + 1, n0 + M + i + 1, n0 + M + i] for i in range(M - 1)]
        uv = np.c_[P[:, 0], P[:, 1]]; duv = uv.copy()
        piece = dict(name=name, verts=P, faces=F, uv=uv, duv=duv, part=np.full(len(P), 8.), uper=np.zeros(len(P)),
                     weights=idw_weights(body, P, [f'foot{side}'], k=4))
        out = piece if out is None else merge(out, piece, name=name)
    return out

# ------------------------------------------------------------------ posing (linear blend skinning), to build hanging cloth in a natural stance
def rot(axis, deg):
    a = np.asarray(axis, float); a /= np.linalg.norm(a); t = math.radians(deg)
    K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + math.sin(t) * K + (1 - math.cos(t)) * K @ K

def pose_matrices(J, parents, R):
    """J {bone: (head, tail)} rest joints; parents {bone: parent}; R {bone: 3x3 world rotation about its head} -> {bone: 4x4}"""
    M = {}
    def get(b):
        if b in M: return M[b]
        h = J[b][0]; L = np.eye(4)
        if b in R:
            T1 = np.eye(4); T1[:3, 3] = h; T2 = np.eye(4); T2[:3, 3] = -h; Rm = np.eye(4); Rm[:3, :3] = R[b]; L = T1 @ Rm @ T2
        p = parents.get(b)
        M[b] = (get(p) if p else np.eye(4)) @ L
        return M[b]
    for b in J: get(b)
    return M

def arms_down(J, deg=36., elbow=10.):
    """rotations that bring the A-pose arms down by the sides (a relaxed stance)."""
    R = {}
    for side, sgn in (('Left', 1), ('Right', -1)):
        R[f'{side}Arm'] = rot((0, sgn, 0), deg)          # +x arm swings down towards -z
        s, e = J[f'{side}Arm'][0], J[f'{side}ForeArm'][0]
        if (R[f'{side}Arm'] @ (e - s))[0] * sgn > (e - s)[0] * sgn: R[f'{side}Arm'] = rot((0, -sgn, 0), deg)
        e, w = J[f'{side}ForeArm'][0], J[f'{side}Hand'][0]
        R[f'{side}ForeArm'] = rot((1, 0, 0), elbow)
        if (R[f'{side}ForeArm'] @ (w - e))[1] > (w - e)[1]: R[f'{side}ForeArm'] = rot((1, 0, 0), -elbow)   # the hand comes forward
    return R

def blend(P, Wd, M):
    """skin points P with weights {bone: (n,)} by matrices M (bones named without the 'mixamorig:' prefix)."""
    A = np.zeros((len(P), 4, 4)); tot = np.zeros(len(P))
    for b, w in Wd.items():
        k = b.split(':')[-1]
        if k in M: A += w[:, None, None] * M[k][None]; tot += w
    A /= np.maximum(tot, 1e-9)[:, None, None]
    A[tot < 1e-9] = np.eye(4)
    return A

def apply(P, A): return np.einsum('nij,nj->ni', A[:, :3, :3], P) + A[:, :3, 3]
def unapply(P, A): return np.einsum('nij,nj->ni', np.linalg.inv(A[:, :3, :3]), P - A[:, :3, 3])


def loop_uvs(piece, F):
    """per-face-corner uvs with the wrap-round seam fixed (a face across the back seam gets one turn added)."""
    uv, duv, per = piece['uv'], piece['duv'], piece.get('uper', np.zeros(len(piece['verts'])))
    L1, L2 = [], []
    for f in F:
        a = uv[f].copy(); d = duv[f].copy()
        p = per[f].max()
        if p > 0 and np.ptp(a[:, 0]) > p / 2: a[a[:, 0] < a[:, 0].mean(), 0] += p
        if np.ptp(d[:, 0]) > .5: d[d[:, 0] < .5, 0] += 1.
        L1.append(a); L2.append(d)
    return np.concatenate(L1), np.concatenate(L2)
