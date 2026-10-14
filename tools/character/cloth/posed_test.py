import pickle, numpy as np, sys
from scipy.spatial import cKDTree
from garments import Body, pose_matrices, arms_down, blend, apply, unapply, robe
import garments as G
import outfits
from test_local import make_body, COL, SKIN
from preview import sheet

def posed_body(b, d, M):
    A = blend(b.V, {k: b.Wm[:, i] for i, k in enumerate(b.bones)}, M)
    Vp = apply(b.V, A)
    tree = cKDTree(Vp); sub = {}
    def nearest(P, k=1, mask=None):
        if mask is None: return tree.query(P, k=k)[1]
        key = hash(mask.tobytes())
        if key not in sub: ids = np.nonzero(mask)[0]; sub[key] = (cKDTree(Vp[ids]), ids)
        t, ids = sub[key]; return ids[t.query(P, k=k)[1]]
    Jp = {bn: (M[bn.split(':')[-1]][:3, :3] @ h + M[bn.split(':')[-1]][:3, 3], M[bn.split(':')[-1]][:3, :3] @ t + M[bn.split(':')[-1]][:3, 3]) for bn, (h, t, p) in d['J'].items()}
    return Body(Vp, d['F'], d['W'], Jp, nearest)

def run(who, names):
    b, d = make_body(who)
    J = {k.split(':')[-1]: (h, t) for k, (h, t, p) in d['J'].items()}
    par = {k.split(':')[-1]: (p.split(':')[-1] if p else None) for k, (h, t, p) in d['J'].items()}
    M = pose_matrices(J, par, arms_down(J))
    bp = posed_body(b, d, M)
    table = outfits.MEN if who == 'Tunde' else outfits.LADIES
    panels = []
    for on in names:
        pieces = table[on](b)
        meshes = [(bp.V, bp.F, SKIN[who])]
        for p, f in pieces:
            if p['name'] == 'agbada':          # build it on the posed body instead
                p = robe(bp, bp.leg['L'][2][2] + .17, name='agbada')
                rest = unapply(p['verts'], blend(p['verts'], p['weights'], M))
                P = apply(rest, blend(rest, p['weights'], M))
                print('robe round trip error', np.abs(P - p['verts']).max())
            else:
                P = apply(p['verts'], blend(p['verts'], p['weights'], M))
            meshes.append((P, p['faces'], COL[f], True))
        for yaw in (0, 40, 180): panels.append((meshes, dict(yaw=yaw, target=(0, 0, .9), scale=2.0)))
    sheet(f'posed_{who}.png', panels, cols=6, size=3.2)

if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2:])
