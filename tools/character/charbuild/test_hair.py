import sys, time, numpy as np
sys.path.insert(0, '../cloth')
from test_local import make_body
from preview import sheet
from proxies import load_mhclo, fit
import hair as Hm
def eyes_of(d):
    mh = load_mhclo('src/eyes/high-poly/high-poly.mhclo'); P, W = fit(mh, d['Vall'], d['Wall']); return P
for who, kind in (('Tunde', 'full'), ('Amaka', 'braids')):
    b, d = make_body(who); H = Hm.head_frame(b, eyes_of(d)); t = time.time()
    if kind == 'full': pieces = Hm.full_hair(H); info = {}
    else: pieces, info = Hm.braids(H, length=.72, seed=3, spacing=.016)
    print(who, [(n, len(p['verts'])) for n, p in pieces], info, round(time.time() - t, 1), 's')
    meshes = [(b.V, b.F, (.5, .35, .25))] + [(p['verts'], p['faces'], (.05, .04, .03), True) for n, p in pieces]
    sheet(f'hair_{who}.png', [(meshes, dict(yaw=y, target=(0, 0, H['eyez'] - .1 if kind != 'full' else H['eyez']), scale=.9 if kind != 'full' else .45)) for y in (0, 60, 180)], cols=3, size=3.5)
