import pickle, numpy as np, time, sys
from scipy.spatial import cKDTree
from garments import Body
import outfits
from preview import sheet

def make_body(name):
    d = pickle.load(open(name + '.pkl', 'rb'))
    V = d['V']; tree = cKDTree(V); sub = {}
    def nearest(P, k=1, mask=None):
        if mask is None:
            return tree.query(P, k=k)[1]
        key = mask.tobytes().__hash__()
        if key not in sub:
            ids = np.nonzero(mask)[0]; sub[key] = (cKDTree(V[ids]), ids)
        t, ids = sub[key]; return ids[t.query(P, k=k)[1]]
    J = {b: (h, t) for b, (h, t, p) in d['J'].items()}
    return Body(V, d['F'], d['W'], J, nearest), d

COL = {'jersey': (.1, .55, .25), 'joggers': (.08, .08, .09), 'senator': (.12, .16, .35), 'senator_trim': (.7, .6, .3), 'buba': (.85, .8, .7), 'buba_trim': (.8, .65, .3),
       'agbada': (.9, .86, .76), 'singlet': (.92, .92, .9), 'cargo': (.55, .5, .35), 'croptop': (.95, .9, .92), 'denim': (.2, .3, .55), 'bodycon': (.75, .08, .12),
       'ankara1': (.85, .45, .1), 'ankara2': (.15, .45, .55), 'lace': (.9, .75, .6), 'fila': (.5, .1, .15), 'gele': (.85, .6, .2), 'slides': (.1, .1, .3)}
SKIN = {'Tunde': (.33, .2, .14), 'Amaka': (.72, .52, .4), 'Ada': (.4, .25, .17)}

if __name__ == '__main__':
    who = sys.argv[1] if len(sys.argv) > 1 else 'Tunde'
    which = sys.argv[2:] or None
    b, d = make_body(who)
    table = outfits.MEN if who == 'Tunde' else outfits.LADIES
    panels = []
    for oname, fn in table.items():
        if which and oname not in which: continue
        t0 = time.time(); pieces = fn(b); print(oname, [(p['name'], len(p['verts'])) for p, f in pieces], round(time.time() - t0, 2), 's')
        meshes = [(b.V, b.F, SKIN[who])] + [(p['verts'], p['faces'], COL[f], True) for p, f in pieces]
        for yaw in (0, 40, 180):
            panels.append((meshes, dict(yaw=yaw, target=(0, 0, .9), scale=2.0)))
    sheet(f'out_{who}.png', panels, cols=6, size=3.2)
