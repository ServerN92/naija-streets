"""Make a light game model from a huge scanned/AI mesh: simplify the shape, give it a new UV atlas (flat charts),
and bake the original texture onto it.  python3 rebake.py IN.obj TEX.jpg OUTDIR name target_tris [atlas_px]"""
import sys, os, json, struct, subprocess, time
import numpy as np
from scipy.spatial import cKDTree
from PIL import Image
GLTFPACK = os.environ.get('GLTFPACK', 'gltfpack')   # gltfpack built with texture compression (set GLTFPACK=/path/to/gltfpack)

def load_obj(p):
    V, T, FV, FT = [], [], [], []
    with open(p) as f:
        for line in f:
            if line.startswith('v '): V.append(line[2:])
            elif line.startswith('vt '): T.append(line[3:])
            elif line.startswith('f '):
                a = line[2:].split()
                FV.append([int(x.split('/')[0]) for x in a]); FT.append([int(x.split('/')[1]) if '/' in x else 0 for x in a])
    V = np.loadtxt(V, dtype=np.float64).reshape(-1, 3); T = np.loadtxt(T, dtype=np.float64).reshape(-1, 2) if T else np.zeros((0, 2))
    return V, T, np.array(FV, dtype=np.int64) - 1, np.array(FT, dtype=np.int64) - 1

def read_glb(p):
    d = open(p, 'rb').read(); jl = struct.unpack_from('<I', d, 12)[0]; J = json.loads(d[20:20 + jl]); off = 20 + jl; bl = struct.unpack_from('<I', d, off)[0]; B = d[off + 8:off + 8 + bl]
    prim = J['meshes'][0]['primitives'][0]
    def acc(i):
        a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]; n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]
        return np.frombuffer(B, dtype=dt, count=a['count'] * n, offset=bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(a['count'], n) if n > 1 else np.frombuffer(B, dtype=dt, count=a['count'], offset=bv.get('byteOffset', 0) + a.get('byteOffset', 0))
    P = acc(prim['attributes']['POSITION']).astype(np.float64); I = acc(prim['indices']).astype(np.int64).reshape(-1, 3)
    node = J['nodes'][0]
    if 'translation' in node or 'scale' in node: P = P * np.array(node.get('scale', [1, 1, 1])) + np.array(node.get('translation', [0, 0, 0]))
    return P, I

def simplify(V, F, target, tmp):
    with open(tmp + '.obj', 'w') as f:
        np.savetxt(f, V, fmt='v %.6f %.6f %.6f'); np.savetxt(f, F + 1, fmt='f %d %d %d')
    ratio = min(1.0, target / len(F))
    subprocess.run([GLTFPACK, '-i', tmp + '.obj', '-o', tmp + '.glb', '-si', f'{ratio:.5f}', '-sa', '-noq'], check=True, capture_output=True)
    return read_glb(tmp + '.glb')

def charts(P, F, cell, max_angle=55):
    n = len(F); A = P[F[:, 0]]; Bv = P[F[:, 1]]; C = P[F[:, 2]]; N = np.cross(Bv - A, C - A); area = np.linalg.norm(N, axis=1) * .5; Nn = N / np.maximum(1e-12, np.linalg.norm(N, axis=1))[:, None]
    edges = {}
    for fi in range(n):
        for k in range(3):
            a, b = F[fi, k], F[fi, (k + 1) % 3]; key = (a, b) if a < b else (b, a); edges.setdefault(key, []).append(fi)
    nb = [[] for _ in range(n)]
    for fs in edges.values():
        for x in fs:
            for y in fs:
                if x != y: nb[x].append(y)
    chart = -np.ones(n, dtype=np.int64); cos_lim = np.cos(np.radians(max_angle)); out = []
    order = np.argsort(-area)
    for seed in order:
        if chart[seed] >= 0: continue
        cid = len(out); Nc = Nn[seed].copy(); t1 = np.cross(Nc, [0, 1, 0] if abs(Nc[1]) < .9 else [1, 0, 0]); t1 /= np.linalg.norm(t1); t2 = np.cross(Nc, t1)
        occ = set(); faces = []
        def try_add(fi):
            q = P[F[fi]]; u = q @ t1; v = q @ t2; x0, x1 = int(np.floor(u.min() / cell)), int(np.ceil(u.max() / cell)); y0, y1 = int(np.floor(v.min() / cell)), int(np.ceil(v.max() / cell))
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1)); cx = (gx.ravel() + .5) * cell; cy = (gy.ravel() + .5) * cell
            d = (u[1] - u[0]) * (v[2] - v[0]) - (u[2] - u[0]) * (v[1] - v[0])
            if abs(d) < 1e-14: cells = []
            else:
                l1 = ((u[1] - cx) * (v[2] - cy) - (u[2] - cx) * (v[1] - cy)) / d; l2 = ((u[2] - cx) * (v[0] - cy) - (u[0] - cx) * (v[2] - cy)) / d; l3 = 1 - l1 - l2
                ins = (l1 > -1e-6) & (l2 > -1e-6) & (l3 > -1e-6); cells = list(zip(gx.ravel()[ins].tolist(), gy.ravel()[ins].tolist()))
            if d <= 0 and faces: return False   # flipped in this projection: would fold over
            if any(c in occ for c in cells): return False
            occ.update(cells); chart[fi] = cid; faces.append(fi); return True
        try_add(seed); stack = list(nb[seed])
        while stack:
            fi = stack.pop()
            if chart[fi] >= 0 or Nn[fi] @ Nc < cos_lim: continue
            if try_add(fi): stack.extend(nb[fi])
        out.append((faces, t1, t2))
    return out, chart

def pack(P, F, ch, A, pad):
    items = []
    for faces, t1, t2 in ch:
        vid = np.unique(F[faces]); q = P[vid]; u = q @ t1; v = q @ t2
        uv = np.stack([u, v], 1); c = uv.mean(0); M = np.cov((uv - c).T) if len(uv) > 2 else np.eye(2); w, E = np.linalg.eigh(M); uv = (uv - c) @ E[:, ::-1]
        uv -= uv.min(0); items.append((faces, vid, uv))
    def fit(s):
        x = y = shelf = 0; pos = []
        for faces, vid, uv in sorted(items, key=lambda it: -it[2][:, 1].max()):
            w = uv[:, 0].max() * s + 2 * pad; h = uv[:, 1].max() * s + 2 * pad
            if w > A: return None
            if x + w > A: x = 0; y += shelf; shelf = 0
            if y + h > A: return None
            pos.append((faces, vid, uv, x + pad, y + pad)); x += w; shelf = max(shelf, h)
        return pos
    lo, hi = 1.0, 1e6
    for _ in range(40):
        mid = (lo * hi) ** .5
        if fit(mid): lo = mid
        else: hi = mid
    pos = fit(lo)
    # one UV per (face corner): vertices are split per chart
    newV, newT, newF = [], [], np.zeros_like(F)
    for faces, vid, uv, ox, oy in pos:
        base = len(newV); m = {v: base + i for i, v in enumerate(vid)}
        for i, v in enumerate(vid): newV.append(v); newT.append(((uv[i, 0] * lo + ox) / A, (uv[i, 1] * lo + oy) / A))
        for fi in faces: newF[fi] = [m[v] for v in F[fi]]
    return np.array(newV), np.array(newT), newF, lo

def bake(Pl, Fl, Tl, Vh, Th, FVh, FTh, tex, A):
    img = np.asarray(Image.open(tex).convert('RGB'), dtype=np.float32); H, W, _ = img.shape
    cen = (Vh[FVh[:, 0]] + Vh[FVh[:, 1]] + Vh[FVh[:, 2]]) / 3; tree = cKDTree(cen)
    out = np.zeros((A, A, 3), np.float32); has = np.zeros((A, A), bool); pix = []; pts = []; fis = []
    for fi in range(len(Fl)):
        t = Tl[Fl[fi]] * A; p = Pl[Fl[fi]]
        x0, x1 = int(np.floor(t[:, 0].min())) - 1, int(np.ceil(t[:, 0].max())) + 1; y0, y1 = int(np.floor(t[:, 1].min())) - 1, int(np.ceil(t[:, 1].max())) + 1
        gx, gy = np.meshgrid(np.arange(max(0, x0), min(A, x1 + 1)), np.arange(max(0, y0), min(A, y1 + 1))); cx = gx.ravel() + .5; cy = gy.ravel() + .5
        d = (t[1, 0] - t[0, 0]) * (t[2, 1] - t[0, 1]) - (t[2, 0] - t[0, 0]) * (t[1, 1] - t[0, 1])
        if abs(d) < 1e-9: continue
        l1 = ((t[1, 0] - cx) * (t[2, 1] - cy) - (t[2, 0] - cx) * (t[1, 1] - cy)) / d; l2 = ((t[2, 0] - cx) * (t[0, 1] - cy) - (t[0, 0] - cx) * (t[2, 1] - cy)) / d; l3 = 1 - l1 - l2
        e = -.7 / max(1.0, np.sqrt(abs(d)))   # a little past the edges, so seams have colour
        ins = (l1 > e) & (l2 > e) & (l3 > e)
        if not ins.any(): continue
        L = np.stack([l1[ins], l2[ins], l3[ins]], 1); L = np.clip(L, 0, None); L /= L.sum(1, keepdims=True)
        pix.append(np.stack([gx.ravel()[ins], gy.ravel()[ins]], 1)); pts.append(L @ p); fis.append(np.full(len(L), fi))
    pix = np.concatenate(pix); pts = np.concatenate(pts); fis = np.concatenate(fis)
    _, ti = tree.query(pts, k=1, workers=-1)
    a = Vh[FVh[ti, 0]]; b = Vh[FVh[ti, 1]]; c = Vh[FVh[ti, 2]]; v0 = b - a; v1 = c - a; v2 = pts - a
    d00 = (v0 * v0).sum(1); d01 = (v0 * v1).sum(1); d11 = (v1 * v1).sum(1); d20 = (v2 * v0).sum(1); d21 = (v2 * v1).sum(1); den = np.maximum(1e-20, d00 * d11 - d01 * d01)
    bv = (d11 * d20 - d01 * d21) / den; bw = (d00 * d21 - d01 * d20) / den; bu = 1 - bv - bw
    L = np.clip(np.stack([bu, bv, bw], 1), 0, None); L /= np.maximum(1e-9, L.sum(1, keepdims=True))
    uv = L[:, :1] * Th[FTh[ti, 0]] + L[:, 1:2] * Th[FTh[ti, 1]] + L[:, 2:] * Th[FTh[ti, 2]]
    sx = (uv[:, 0] % 1) * (W - 1); sy = (1 - (uv[:, 1] % 1)) * (H - 1); x0 = np.floor(sx).astype(int); y0 = np.floor(sy).astype(int); fx = (sx - x0)[:, None]; fy = (sy - y0)[:, None]
    x1 = np.minimum(x0 + 1, W - 1); y1 = np.minimum(y0 + 1, H - 1)
    col = img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x1] * fx * (1 - fy) + img[y1, x0] * (1 - fx) * fy + img[y1, x1] * fx * fy
    if os.environ.get('DECAL'):   # repaint part of the surface (e.g. a chest badge) in model space
        fa = Pl[Fl[fis, 0]]; fn = np.cross(Pl[Fl[fis, 1]] - fa, Pl[Fl[fis, 2]] - fa); fn /= np.maximum(1e-12, np.linalg.norm(fn, axis=1))[:, None]
        g = {'np': np, 'Image': Image}; exec(open(os.environ['DECAL']).read(), g); col = g['decal'](pts, fn, col, Pl)
    out[A - 1 - pix[:, 1], pix[:, 0]] = col; has[A - 1 - pix[:, 1], pix[:, 0]] = True
    for _ in range(12):   # grow colours into the gaps between charts
        if has.all(): break
        acc = np.zeros_like(out); cnt = np.zeros((A, A), np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            sh = np.roll(np.roll(has, dy, 0), dx, 1); acc += np.roll(np.roll(out, dy, 0), dx, 1) * sh[..., None]; cnt += sh
        new = (~has) & (cnt > 0); out[new] = acc[new] / cnt[new][:, None]; has |= new
    out[~has] = out[has].mean(0)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))

def main():
    src, tex, outdir, name, target = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5]); A = int(sys.argv[6]) if len(sys.argv) > 6 else 1024
    os.makedirs(outdir, exist_ok=True); t0 = time.time()
    Vh, Th, FVh, FTh = load_obj(src); print('high', len(FVh), 'tris', round(time.time() - t0, 1), 's', flush=True)
    Pl, Fl = simplify(Vh, FVh, target, os.path.join(outdir, '_pos')); print('low', len(Fl), 'tris', len(Pl), 'verts', flush=True)
    diag = np.linalg.norm(Pl.max(0) - Pl.min(0)); ch, _ = charts(Pl, Fl, diag / 700); print('charts', len(ch), round(time.time() - t0, 1), 's', flush=True)
    NV, NT, NF, s = pack(Pl, Fl, ch, A, 3); print('packed', len(NV), 'verts, px per m', round(s), flush=True)
    im = bake(Pl[NV], NF, NT, Vh, Th, FVh, FTh, tex, A); im.save(os.path.join(outdir, name + '.png')); print('baked', round(time.time() - t0, 1), 's', flush=True)
    with open(os.path.join(outdir, name + '.mtl'), 'w') as f: f.write(f'newmtl m\nKd 1 1 1\nmap_Kd {name}.png\n')
    with open(os.path.join(outdir, name + '.obj'), 'w') as f:
        f.write(f'mtllib {name}.mtl\no {name}\n'); np.savetxt(f, Pl[NV], fmt='v %.6f %.6f %.6f'); np.savetxt(f, NT, fmt='vt %.6f %.6f'); f.write('usemtl m\n')
        a = np.repeat(NF + 1, 2, axis=1); np.savetxt(f, a, fmt='f %d/%d %d/%d %d/%d')
    print('done', round(time.time() - t0, 1), 's')
main()
