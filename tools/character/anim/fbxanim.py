"""Pull bone animation out of a Mixamo FBX: per bone, per channel (T/R/S x,y,z) key times and values; plus rest transforms."""
import numpy as np
from fbxread import read
TICK = 46186158000

def load(path):
    ver, root = read(path)
    objs = root.find('Objects'); conns = root.find('Connections')
    byid = {c.props[0]: c for c in objs.children}
    models = {c.props[0]: c.props[1].split('\x00')[0] for c in objs.children if c.name == 'Model'}
    rest = {}
    for c in objs.children:
        if c.name != 'Model': continue
        p70 = c.find('Properties70'); d = {}
        for pp in (p70.children if p70 else []):
            if pp.props[0] in ('Lcl Translation', 'Lcl Rotation', 'Lcl Scaling', 'PreRotation', 'PostRotation', 'RotationOrder'):
                d[pp.props[0]] = pp.props[4:]
        rest[models[c.props[0]]] = d
    parent = {}
    cn_target = {}; curve_of = {}
    for c in conns.children:
        kind, a, b = c.props[0], c.props[1], c.props[2]
        if kind == 'OO' and a in models and b in models: parent[models[a]] = models[b]
        if kind == 'OP' and a in byid and byid[a].name == 'AnimationCurveNode' and b in models:
            cn_target[a] = (models[b], c.props[3])
        if kind == 'OP' and a in byid and byid[a].name == 'AnimationCurve' and b in byid and byid[b].name == 'AnimationCurveNode':
            curve_of.setdefault(b, {})[c.props[3]] = a
    anim = {}
    for cn, (bone, prop) in cn_target.items():
        ch = {'Lcl Translation': 'T', 'Lcl Rotation': 'R', 'Lcl Scaling': 'S'}.get(prop)
        if not ch: continue
        for axis, cid in curve_of.get(cn, {}).items():
            cv = byid[cid]
            t = np.array(cv.find('KeyTime').props[0], float) / TICK
            v = np.array(cv.find('KeyValueFloat').props[0], float)
            anim.setdefault(bone, {})[ch + axis[-1]] = (t, v)
    gs = root.find('GlobalSettings'); settings = {}
    for pp in gs.find('Properties70').children: settings[pp.props[0]] = pp.props[4:]
    return dict(rest=rest, parent=parent, anim=anim, settings=settings)

if __name__ == '__main__':
    import sys
    for f in sys.argv[1:]:
        a = load(f)
        h = a['anim'].get('mixamorig:Hips', {})
        t = h['Tx'][0] if 'Tx' in h else [0]
        rng = {k: (round(v[1].min(), 1), round(v[1].max(), 1)) for k, v in h.items() if k[0] == 'T'}
        print(f.split('/')[-1], 'dur %.2fs keys %d' % (t[-1] - t[0], len(t)), 'hipsT', rng, 'unit', a['settings'].get('UnitScaleFactor'), 'fps', a['settings'].get('CustomFrameRate'), a['settings'].get('TimeMode'))
