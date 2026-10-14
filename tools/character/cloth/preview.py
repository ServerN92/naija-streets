"""Quick shaded previews of meshes (painter's algorithm, matplotlib), for checking clothes offline."""
import numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection

def tris(F):
    out = []
    for f in F:
        for k in range(1, len(f) - 1): out.append((f[0], f[k], f[k + 1]))
    return np.array(out)

def view(ax, meshes, yaw=0., elev=8., target=None, scale=1.0, light=(-.5, -1, .8)):
    """meshes: list of (V, F, color or per-face colours). yaw in degrees (0 = from the front, -Y)."""
    allv = np.concatenate([m[0] for m in meshes])
    c = np.array(target) if target is not None else (allv.min(0) + allv.max(0)) / 2
    a, e = np.radians(yaw), np.radians(elev)
    # camera basis: looking along d
    d = np.array([np.sin(a) * np.cos(e), np.cos(a) * np.cos(e), -np.sin(e)])  # from front: camera at -Y looking +Y
    right = np.cross(d, [0, 0, 1]); right /= np.linalg.norm(right); up = np.cross(right, d)
    L = np.array(light, float); L /= np.linalg.norm(L)
    polys, cols, depth = [], [], []
    for m in meshes:
        V, F, col = m[0], m[1], m[2]
        T = tris(F) if not isinstance(F, np.ndarray) or F.shape[1] != 3 else F
        P = V[T]                                      # (n,3,3)
        n = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]); ln = np.linalg.norm(n, axis=1) + 1e-12; n /= ln[:, None]
        facing = (n @ -d)
        twosided = len(m) > 3 and m[3]
        if twosided: n = n * np.sign(facing)[:, None]
        else:
            keep = facing > 0; P, n, T = P[keep], n[keep], T[keep]
            if not isinstance(col, tuple) and np.ndim(col) == 2: col = col[keep]
        sh = .28 + .72 * np.clip(n @ L, 0, 1) + .12 * np.clip(n @ -d, 0, 1)
        base = np.broadcast_to(np.array(col, float)[..., :3], (len(P), 3)) if np.ndim(col) == 1 or isinstance(col, tuple) else np.array(col)[:, :3]
        cc = np.clip(base * sh[:, None], 0, 1)
        Q = P - c
        x = Q @ right; y = Q @ up; z = Q @ d
        polys.append(np.stack([x, y], -1)); cols.append(cc); depth.append(z.mean(1))
    polys = np.concatenate(polys); cols = np.concatenate(cols); depth = np.concatenate(depth)
    o = np.argsort(-depth)
    pc = PolyCollection(polys[o], facecolors=cols[o], edgecolors='none', antialiased=False)
    ax.add_collection(pc); ax.set_aspect('equal'); ax.axis('off')
    r = scale
    ax.set_xlim(-r / 2, r / 2); ax.set_ylim(-r / 2, r / 2)

def sheet(path, panels, cols=4, size=4, bg=(.42, .44, .47)):
    rows = (len(panels) + cols - 1) // cols
    fig = plt.figure(figsize=(cols * size, rows * size), facecolor=bg)
    for i, (meshes, kw) in enumerate(panels):
        ax = fig.add_subplot(rows, cols, i + 1); ax.set_facecolor(bg)
        view(ax, meshes, **kw)
        if kw.get('title'): pass
    plt.subplots_adjust(0, 0, 1, 1, 0, 0)
    fig.savefig(path, dpi=100, facecolor=bg); plt.close(fig)
