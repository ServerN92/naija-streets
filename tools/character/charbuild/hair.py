"""Hair for the game characters (the same styles as in Blender, built in numpy):
  full_hair  - Tunde's short afro: a dark base shell over the scalp plus fuzz shells, cut into coils by an alpha texture
  braids     - Amaka/Ada: braids rooted on the scalp, hung under gravity round the head and body (vectorised Verlet)"""
import numpy as np, math, random
from scipy.spatial import cKDTree

def hairline_fn(front):
    KN = [(0, front), (35, front - .006), (65, front - .022), (95, .042), (125, .008), (155, -.04), (180, -.058)]
    def hl(a):
        a = abs(a)
        for (a0, v0), (a1, v1) in zip(KN, KN[1:]):
            if a <= a1: t = (a - a0) / (a1 - a0); return v0 + (v1 - v0) * (t * t * (3 - 2 * t))
        return KN[-1][1]
    return hl

def head_frame(body, eye_verts):
    V, N = body.V, body.N
    eyez = float(eye_verts[:, 2].mean())
    hb = body.J['Head'][0]
    m = (V[:, 2] > eyez - .01) & (np.linalg.norm(V - hb, axis=1) < .3)
    hv = V[m]
    ctr = np.array([(hv[:, 0].min() + hv[:, 0].max()) / 2, (hv[:, 1].min() + hv[:, 1].max()) / 2, eyez + .025])
    return dict(V=V, N=N, F=body.F, eyez=eyez, ctr=ctr, neckz=float(body.J['Neck'][0][2]))

def scalp(H, front=.072):
    hl = hairline_fn(front); out = {}
    for i, p in enumerate(H['V']):
        d = p - H['ctr']
        if np.linalg.norm(d) > .17 or p[2] < H['eyez'] - .1: continue
        a = math.degrees(math.atan2(d[0], -d[1])); h = p[2] - H['eyez'] - hl(a)
        if h > -.004: out[i] = (h, a)
    return out

def subdivide(P, F, attrs, fixed_boundary=True, smooth=2):
    """split every quad into four (edge middles + face centre), then relax a little (keeps the boundary)"""
    P = list(map(np.asarray, P)); A = {k: list(v) for k, v in attrs.items()}
    em = {}
    def mid(a, b):
        k = (min(a, b), max(a, b))
        if k not in em:
            em[k] = len(P); P.append((P[a] + P[b]) / 2)
            for kk in A: A[kk].append((A[kk][a] + A[kk][b]) / 2)
        return em[k]
    NF = []
    for f in F:
        c = len(P); P.append(np.mean([P[v] for v in f], 0))
        for kk in A: A[kk].append(np.mean([A[kk][v] for v in f], 0))
        n = len(f); ms = [mid(f[i], f[(i + 1) % n]) for i in range(n)]
        for i in range(n): NF.append([f[i], ms[i], c, ms[i - 1]])
    P = np.array(P)
    # boundary = edges used by one face
    cnt = {}
    for f in NF:
        for a, b in zip(f, f[1:] + f[:1]): k = (min(a, b), max(a, b)); cnt[k] = cnt.get(k, 0) + 1
    bnd = np.zeros(len(P), bool)
    for (a, b), c in cnt.items():
        if c == 1: bnd[a] = bnd[b] = True
    E = np.array(list(cnt.keys()))
    for _ in range(smooth):
        S = np.zeros_like(P); dg = np.zeros(len(P))
        np.add.at(S, E[:, 0], P[E[:, 1]]); np.add.at(S, E[:, 1], P[E[:, 0]]); np.add.at(dg, E[:, 0], 1); np.add.at(dg, E[:, 1], 1)
        L = S / np.maximum(dg, 1)[:, None] - P
        mv = ~bnd if fixed_boundary else np.ones(len(P), bool)
        P[mv] += .5 * L[mv]
    return P, NF, {k: np.array(v) for k, v in A.items()}

def shell(H, sc, thick, offset=.0012, subdiv=True):
    idx = {}; verts = []; cut = []
    for i, (h, a) in sc.items():
        p = H['V'][i]; n = H['N'][i]; t = thick(h, a, p)
        idx[i] = len(verts); verts.append(p + n * (offset + t)); cut.append(max(0., min(1., (h + .004) / .012)))
    faces = [[idx[v] for v in poly] for poly in H['F'] if all(v in idx for v in poly)]
    P, F, A = np.array(verts), faces, {'cut': np.array(cut)}
    if subdiv: P, F, A = subdivide(P, F, A)
    # uv: round the head (m) and up
    d = P - H['ctr']; ang = np.arctan2(d[:, 0], -d[:, 1])
    uv = np.stack([ang * .1, P[:, 2]], 1)
    return dict(verts=P, faces=F, uv=uv, cut=A['cut'], uper=np.full(len(P), 2 * math.pi * .1))

def full_hair(H, front=.07, top=.026, sides=.011, back=.014, layers=3):
    sc = scalp(H, front)
    def thick(h, a, p):
        a = abs(a); side = max(0., 1 - abs(a - 90) / 40)
        base = (top * (1 - side) + sides * side) if a < 135 else back
        crown = .55 + .45 * max(0., min(1., (p[2] - H['eyez'] - .05) / .06))
        return base * crown * max(0., min(1., (h + .002) / .02))
    pieces = [('hair_base', shell(H, sc, lambda h, a, p: thick(h, a, p) * .6))]
    for i in range(layers):
        k = .6 + .55 * (i + 1) / layers
        pieces.append((f'hair_fuzz{i}', shell(H, sc, lambda h, a, p, k=k: thick(h, a, p) * k)))
    return pieces

def braids(H, length=.68, spacing=.016, radius=.0042, front=.075, seed=3, cuffs=0, over_shoulder=.14, rings=22, sides=6):
    rnd = random.Random(seed)
    sc = scalp(H, front); V, Nn = H['V'], H['N']
    tree = cKDTree(V)
    cands = [i for i, (h, a) in sc.items() if h > .004]
    edge = [i for i in cands if sc[i][0] < .012]; inner = [i for i in cands if sc[i][0] >= .012]
    rnd.shuffle(edge); rnd.shuffle(inner); roots = []
    for pool, sp in ((edge, spacing * .78), (inner, spacing)):
        for i in pool:
            p = V[i]
            if all(np.linalg.norm(p - V[j]) > sp for j in roots): roots.append(i)
    eyez, neckz, ctr = H['eyez'], H['neckz'], H['ctr']
    N = 30; S = len(roots)
    P = np.zeros((S, N + 1, 3)); nrm = np.zeros((S, 3)); side = np.zeros(S); A = np.zeros(S); FWD = np.zeros(S, bool); SEG = np.zeros(S)
    for k, i in enumerate(roots):
        root = V[i]; n = Nn[i]; d = root - ctr
        sd = 1 if d[0] > .004 else -1 if d[0] < -.004 else rnd.choice((-1, 1))
        a = abs(math.degrees(math.atan2(d[0], -d[1])))
        fwd = 30 < a < 100 and rnd.random() < over_shoulder / .55
        L = length * rnd.uniform(.93, 1.05) * (.82 if a < 25 else 1.)
        seg = L / N
        P[k, 0] = root + n * .002; P[k, 1] = P[k, 0] + n * seg
        dv = np.array([sd * (1.2 if a < 60 else .5), 1.0, -.4]); dv /= np.linalg.norm(dv)
        for j in range(2, N + 1): P[k, j] = P[k, j - 1] + dv * seg
        nrm[k] = n; side[k] = sd; A[k] = a; FWD[k] = fwd; SEG[k] = seg
    Q = P.copy()
    margin = radius + .0025
    front_brd = A < 60
    for step in range(220):
        p = P[:, 2:]; v = (p - Q[:, 2:]) * .82; Q[:, 2:] = p
        f = np.zeros_like(p); f[..., 2] = -1
        above = p[..., 2] > neckz + .02
        fx = np.where(front_brd[:, None], side[:, None] * .7, side[:, None] * .35); fy = np.where(front_brd[:, None], .9, 1.0)
        f[..., 0] += np.where(above, fx, 0); f[..., 1] += np.where(above, fy, 0)
        low = ~above & FWD[:, None] & (p[..., 2] > neckz - .25)
        f[..., 0] += np.where(low, side[:, None] * .2, 0); f[..., 1] += np.where(low, -.9, 0)
        P[:, 2:] = p + v + f * .0007
        for it in range(4):
            P[:, 1] = P[:, 0] + nrm * SEG[:, None]
            for j in range(1, N):
                dv = P[:, j + 1] - P[:, j]; ln = np.linalg.norm(dv, axis=1, keepdims=True) + 1e-9
                corr = dv * ((ln - SEG[:, None]) / ln)
                if j == 1: P[:, j + 1] -= corr
                else: P[:, j] += corr * .5; P[:, j + 1] -= corr * .5
            q = P[:, 2:].reshape(-1, 3)
            dist, idx = tree.query(q)
            dn = ((q - V[idx]) * Nn[idx]).sum(1)
            push = dn < margin
            q[push] += Nn[idx[push]] * (margin - dn[push])[:, None]
            q = q.reshape(S, N - 1, 3)
            fxx = q[..., 0] - ctr[0]
            m = (q[..., 1] < ctr[1] - .025) & (np.abs(fxx) < .075) & (q[..., 2] > neckz - .04) & (q[..., 2] < eyez + .065)
            q[..., 0] = np.where(m, ctr[0] + side[:, None] * .075, q[..., 0])
            P[:, 2:] = q
    up = (P[:, N // 3:, 2] > P[:, :1, 2] + .02).any(1)
    out = ((np.hypot(P[..., 0] - ctr[0], P[..., 1] - ctr[1]) > .2) & (P[..., 2] > neckz + .03)).any(1)
    keep = ~(up | out)
    strands = P[keep]
    # tubes: resampled to fewer rings for the game
    verts, faces, uvs, wh = [], [], [], []
    for pts in strands:
        seglen = np.linalg.norm(np.diff(pts, axis=0), axis=1); s = np.concatenate([[0], np.cumsum(seglen)]); Lt = s[-1]
        ss = np.linspace(0, Lt, rings)
        pr = np.stack([np.interp(ss, s, pts[:, c]) for c in range(3)], 1)
        t0 = pr[1] - pr[0]; t0 /= np.linalg.norm(t0)
        nx = np.cross(t0, [0, 0, 1.]) if abs(t0[2]) < .9 else np.cross(t0, [1., 0, 0]); nx /= np.linalg.norm(nx)
        base = len(verts)
        for j, p in enumerate(pr):
            t = pr[min(j + 1, rings - 1)] - pr[max(j - 1, 0)]; t /= np.linalg.norm(t)
            nx = nx - t * (nx @ t); nx /= np.linalg.norm(nx); bx = np.cross(t, nx)
            u = ss[j] / Lt
            r = radius * (1.9 - .9 * min(1., u / .04)) if u < .04 else radius * (1. if u < .9 else max(.3, 1 - (u - .9) * 7))
            for m_ in range(sides + 1):          # a seam column, so the texture wraps cleanly
                th = m_ / sides * 2 * math.pi
                verts.append(p + (nx * math.cos(th) + bx * math.sin(th)) * r)
                uvs.append((m_ / sides, ss[j] / .011))
                wh.append(float(np.clip((p[2] - (neckz - .1)) / .14, 0, 1)))
        W = sides + 1
        for j in range(rings - 1):
            for m_ in range(sides):
                a0 = base + j * W + m_
                faces.append([a0, a0 + 1, a0 + 1 + W, a0 + W])
    out = [('braids', dict(verts=np.array(verts), faces=faces, uv=np.array(uvs), whead=np.array(wh)))]
    if cuffs:
        cv, cf, cw = [], [], []
        for k in rnd.sample(range(len(strands)), min(cuffs, len(strands))):
            pts = strands[k]
            for at in (.22, .55):
                j = int(at * N); p = pts[j]; t = pts[j + 1] - pts[j - 1]; t /= np.linalg.norm(t)
                nx = np.cross(t, [0, 0, 1.]); nx /= np.linalg.norm(nx); bx = np.cross(t, nx); b0 = len(cv)
                for e in (-1, 1):
                    for m_ in range(10):
                        th = m_ / 10 * 2 * math.pi; cv.append(p + t * e * .006 + (nx * math.cos(th) + bx * math.sin(th)) * radius * 1.55)
                        cw.append(float(np.clip((p[2] - (neckz - .1)) / .14, 0, 1)))
                for m_ in range(10): cf.append([b0 + m_, b0 + (m_ + 1) % 10, b0 + 10 + (m_ + 1) % 10, b0 + 10 + m_])
        out.append(('cuffs', dict(verts=np.array(cv), faces=cf, uv=np.zeros((len(cv), 2)), whead=np.array(cw))))
    base_shell = shell(H, sc, lambda h, a, p: .0015 * max(0., min(1., (h + .002) / .006)))
    out.append(('braid_base', base_shell))
    return out, dict(roots=S, kept=int(keep.sum()))
