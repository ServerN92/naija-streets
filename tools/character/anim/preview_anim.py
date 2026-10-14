import sys, pickle, numpy as np
sys.path.insert(0, '../cloth')
import garments as G, outfits as O
from test_local import make_body, COL, SKIN
from preview import sheet
from retarget import source_pose, retarget

def mats(J, par, Rf, d):
    M = {}
    def get(b):
        if b in M: return M[b]
        h = J[b][0]; L = np.eye(4)
        if b in Rf:
            T1 = np.eye(4); T1[:3, 3] = h; T2 = np.eye(4); T2[:3, 3] = -h; Rm = np.eye(4); Rm[:3, :3] = Rf[b]; L = T1 @ Rm @ T2
        if b == 'Hips': Tt = np.eye(4); Tt[:3, 3] = d; L = Tt @ L
        p = par.get(b); M[b] = (get(p) if p else np.eye(4)) @ L; return M[b]
    for b in J: get(b)
    return M

def setup(who):
    b, d = make_body(who)
    J = {k.split(':')[-1]: (h, t) for k, (h, t, p) in d['J'].items()}
    par = {k.split(':')[-1]: (p.split(':')[-1] if p else None) for k, (h, t, p) in d['J'].items()}
    return b, d, J, par

if __name__ == '__main__':
    who, fbx, outfit = sys.argv[1], sys.argv[2], sys.argv[3]
    nshow = int(sys.argv[4]) if len(sys.argv) > 4 else 6
    YAW = float(sys.argv[5]) if len(sys.argv) > 5 else 90
    b, d, J, par = setup(who)
    src = source_pose(fbx); rt = retarget(src, J, par)
    print('frames', rt['frames'], 'fps', rt['fps'], 'speed m/s', round(rt['speed'], 2), 'root scale', round(rt['scale'], 3), 'bones', len(rt['bones']))
    table = O.LADIES if who != 'Tunde' else O.MEN
    pieces = [(p, f) for p, f in table[outfit](b) if p['name'] != 'agbada']
    Wb = {k: b.Wm[:, i] for i, k in enumerate(b.bones)}
    panels = []; low = []
    for fi in np.linspace(0, rt['frames'] - 1, nshow).astype(int):
        Rf = {k: v[fi] for k, v in rt['R'].items()}
        M = mats(J, par, Rf, rt['hips'][fi])
        Vp = G.apply(b.V, G.blend(b.V, Wb, M)); low.append(Vp[:, 2].min())
        meshes = [(Vp, b.F, SKIN[who])] + [(G.apply(p['verts'], G.blend(p['verts'], p['weights'], M)), p['faces'], COL[f], True) for p, f in pieces]
        panels.append((meshes, dict(yaw=YAW, target=(0, 0, .9), scale=2.1)))
    print('lowest point per frame', np.round(low, 3))
    sheet(f"anim_{who}_{fbx.split('/')[-1][:-4].replace(' ', '_')}_{int(YAW)}.png", panels, cols=nshow, size=2.6)
