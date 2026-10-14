"""MakeHuman proxies (eyes, eyebrows, eyelashes, shoes): each proxy vertex is tied to 3 body vertices (+ an offset scaled
by the body's size), so the asset fits any body. Same rule MakeHuman/MPFB use."""
import numpy as np

def load_obj(path):
    V, VT, F, FT = [], [], [], []
    for l in open(path, encoding='utf-8', errors='ignore'):
        if l.startswith('v '): V.append([float(x) for x in l.split()[1:4]])
        elif l.startswith('vt '): VT.append([float(x) for x in l.split()[1:3]])
        elif l.startswith('f '):
            ps = [p.split('/') for p in l.split()[1:]]
            F.append([int(p[0]) - 1 for p in ps]); FT.append([int(p[1]) - 1 if len(p) > 1 and p[1] else -1 for p in ps])
    return np.array(V), np.array(VT), F, FT

def load_mhclo(path):
    refs, scales, delete, offs, mode = [], {}, [], [0, 0, 0], None
    obj = None
    for l in open(path, encoding='utf-8', errors='ignore'):
        s = l.split()
        if not s or s[0].startswith('#'): continue
        k = s[0]
        if k == 'obj_file': obj = s[1]
        elif k in ('x_scale', 'y_scale', 'z_scale'): scales['xyz'.index(k[0])] = (int(s[1]), int(s[2]), float(s[3]))
        elif k == 'verts': mode = 'v'
        elif k == 'delete_verts': mode = 'd'
        elif mode == 'v':
            try: nums = [float(x) for x in s]
            except ValueError: continue          # a header line inside the block (material, weights file)
            if len(nums) == 1: refs.append(((int(nums[0]), 0, 0), (1., 0, 0), (0, 0, 0)))
            elif len(nums) >= 9: refs.append(((int(nums[0]), int(nums[1]), int(nums[2])), tuple(nums[3:6]), tuple(nums[6:9])))
            else: mode = None
        elif mode == 'd':
            for x in s:
                try:
                    if '-' in x[1:]:
                        a, b = x.split('-', 1); delete += list(range(int(a), int(b) + 1))
                    else: delete.append(int(x))
                except ValueError: pass
    return dict(obj=obj, refs=refs, scales=scales, delete=delete)

def to_obj(Vbl): return np.stack([Vbl[:, 0], Vbl[:, 2], -Vbl[:, 1]], 1) / .1
def to_bl(Vo): return np.stack([Vo[:, 0], -Vo[:, 2], Vo[:, 1]], 1) * .1

def fit(mh, Vall_bl, Wall):
    """place the proxy on the body: returns proxy vertex positions (Blender axes, m) and its weights {bone: (n,)}"""
    Vo = to_obj(Vall_bl)
    sc = np.ones(3)
    for ax, (a, b, den) in mh['scales'].items():
        sc[ax] = abs(Vo[a, ax] - Vo[b, ax]) / den
    I = np.array([r[0] for r in mh['refs']]); Wt = np.array([r[1] for r in mh['refs']]); O = np.array([r[2] for r in mh['refs']])
    P = (Vo[I] * Wt[:, :, None]).sum(1) + O * sc
    W = {}
    for bn, w in Wall.items():
        v = (w[I] * Wt).sum(1)
        if v.max() > 1e-4: W[bn] = v
    return to_bl(P), W
