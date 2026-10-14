"""A local copy of the MakeHuman (MPFB) bodies used in Blender, so clothes can be built and checked offline.
Same base mesh, the same macro and detail targets, the same mixamo rig joints and weights. Units: metres, Z up, facing -Y."""
import numpy as np, json, gzip, os, glob
D = os.path.join(os.path.dirname(__file__), '..', 'ext', 'mpfb2', 'src', 'mpfb', 'data') + os.sep
MACRO = json.load(open(D + 'targets/macrodetails/macro.json'))['macrotargets']
GROUPS = json.load(open(D + 'mesh_metadata/basemesh_vertex_groups.json'))
NBODY = 13380

def obj_to_blender(a):            # MakeHuman obj (Y up, decimetres) -> Blender (Z up, metres)
    a = np.asarray(a, float)
    return np.stack([a[..., 0], -a[..., 2], a[..., 1]], -1) * .1

def load_base():
    V, F, VT, FT = [], [], [], []
    for l in open(D + '3dobjs/base.obj'):
        if l.startswith('v '): V.append([float(x) for x in l.split()[1:4]])
        elif l.startswith('vt '): VT.append([float(x) for x in l.split()[1:3]])
        elif l.startswith('f '):
            ps = [p.split('/') for p in l.split()[1:]]
            F.append([int(p[0]) - 1 for p in ps]); FT.append([int(p[1]) - 1 if len(p) > 1 and p[1] else -1 for p in ps])
    return obj_to_blender(V), F, np.array(VT), FT

_paths = None
def target_path(name):
    global _paths
    if _paths is None: _paths = {os.path.basename(p)[:-len('.target.gz')].lower(): p for p in glob.glob(D + 'targets/**/*.target.gz', recursive=True)}
    return _paths.get(name.lower())

def load_target(path, n):
    d = np.zeros((n, 3))
    for l in gzip.open(path, 'rt'):
        s = l.split()
        if not s or s[0].startswith('#'): continue
        d[int(s[0])] = [float(x) for x in s[1:4]]
    return obj_to_blender(d)

def interp(name, value):
    out = []
    for p in MACRO[name]['parts']:
        if p['lowest'] < value < p['highest']:
            t = (value - p['lowest']) / (p['highest'] - p['lowest'])
            if p['low']: out.append((p['low'], round(1 - t, 4)))
            if p['high']: out.append((p['high'], round(t, 4)))
    return out

def macro_stack(m, cutoff=.01):
    c = {k: interp(k, m[k]) for k in ('gender', 'age', 'muscle', 'weight', 'proportions', 'height', 'cupsize', 'firmness')}
    t = []
    for race, rv in m['race'].items():
        if rv > 1e-4:
            for a, aw in c['age']:
                for g, gw in c['gender']:
                    if g != 'universal' and rv * gw * aw > cutoff: t.append((f'macrodetails/{race}-{g}-{a}', rv * gw * aw))
    for g, gw in c['gender']:
        for a, aw in c['age']:
            for mu, mw in c['muscle']:
                for we, ww in c['weight']:
                    w = gw * aw * mw * ww
                    if w > cutoff: t.append((f'macrodetails/universal-{g}-{a}-{mu}-{we}', w))
                    for h, hw in c['height']:
                        if w * hw > cutoff: t.append((f'macrodetails/height/{g}-{a}-{mu}-{we}-{h}', w * hw))
                    for pr, pw in c['proportions']:
                        if w * pw > cutoff and '-baby-' not in a: t.append((f'macrodetails/proportions/{g}-{a}-{mu}-{we}-{pr}', w * pw))
                    if g == 'female':
                        for cu, cw in c['cupsize']:
                            for fi, fw in c['firmness']:
                                w2 = aw * mw * ww * cw * fw
                                n = f'breast/{g}-{a}-{mu}-{we}-{cu}-{fi}'
                                if w2 > cutoff and 'averagecup-averagefirmness' not in n: t.append((n, w2))
    return t

def build(phen, targets):
    V, F, VT, FT = load_base(); n = len(V)
    for name, w in macro_stack(phen):
        p = D + 'targets/' + name + '.target.gz'
        if os.path.exists(p): V = V + load_target(p, n) * w
        else: print('missing macro target', name)
    for t in targets:
        p = target_path(t['target'])
        if p: V = V + load_target(p, n) * t['value']
        else: print('missing target', t['target'])
    # joints
    def grp(nm): return np.concatenate([np.arange(a, b + 1) for a, b in GROUPS[nm]])
    rig = json.load(open(D + 'rigs/standard/rig.mixamo.json'))['bones']
    J = {}
    for b, info in rig.items():
        ends = []
        for k in ('head', 'tail'):
            s = info[k]
            if s['strategy'] == 'CUBE': ends.append(V[grp(s['cube_name'])].mean(0))
            else: ends.append(V[s['vertex_indices']].mean(0))
        J[b] = (ends[0], ends[1], info.get('parent'))
    # feet on the ground
    z0 = V[:NBODY, 2].min(); V[:, 2] -= z0
    J = {b: (h - [0, 0, z0], t - [0, 0, z0], p) for b, (h, t, p) in J.items()}
    W = {}
    for b, lst in json.load(open(D + 'rigs/standard/weights.mixamo.json'))['weights'].items():
        a = np.zeros(n)
        for i, w in lst: a[i] = w
        W[b] = a
    bodyF = [f for f in F if max(f) < NBODY]
    bodyFT = [ft for f, ft in zip(F, FT) if max(f) < NBODY]
    return dict(V=V[:NBODY], F=bodyF, VT=VT, FT=bodyFT, J=J, W={b: w[:NBODY] for b, w in W.items()},
                Vall=V, Wall=W, z0=z0)

T = lambda name, v: {'target': name, 'value': v}
def both(name, v): return [T('l-' + name, v), T('r-' + name, v)]
THICK = [T('buttocks-volume-incr', 1.), T('hip-scale-horiz-incr', .5), T('hip-scale-depth-incr', .3), T('measure-hips-circ-incr', .55), T('measure-waist-circ-decr', .55),
         T('stomach-tone-incr', .6), T('measure-bust-circ-incr', .35), T('measure-thigh-circ-incr', .45), T('measure-shoulder-dist-decr', .1)] + both('upperleg-fat-incr', .45) + both('upperarm-fat-incr', .1)
PRETTY = [T('head-oval', .5), T('chin-width-decr', .25), T('chin-height-decr', .1), T('nose-scale-horiz-decr', .35), T('nose-flaring-decr', .35), T('nose-point-width-decr', .4),
          T('nose-width1-decr', .25), T('nose-width2-decr', .25), T('nose-volume-decr', .25), T('nose-scale-vert-decr', .1), T('mouth-scale-horiz-decr', .08),
          T('mouth-upperlip-volume-decr', .1), T('mouth-lowerlip-volume-decr', .05)] + both('eye-scale-incr', .25) + both('cheek-bones-incr', .4)
FEM = dict(gender=0.0, age=.48, muscle=.45, weight=.66, proportions=.9, height=.55, cupsize=.92, firmness=.85)
PEOPLE = {
    'Tunde': (dict(gender=1.0, age=.5, muscle=.68, weight=.56, proportions=.85, height=.52, cupsize=.5, firmness=.5, race=dict(african=1., asian=0., caucasian=0.)),
              [T('head-oval', .25), T('head-square', .2), T('chin-width-incr', .15), T('chin-prominent-incr', .15), T('neck-scale-horiz-incr', .25), T('torso-vshape-incr', .35),
               T('nose-scale-horiz-incr', .3), T('nose-flaring-incr', .35), T('nose-width2-incr', .2), T('mouth-upperlip-volume-incr', .35), T('mouth-lowerlip-volume-incr', .3), T('mouth-scale-horiz-incr', .12), T('eyebrows-trans-down', .2)] + both('eye-scale-incr', .12) + both('cheek-bones-incr', .3)),
    'Amaka': (dict(FEM, race=dict(african=.9, asian=0., caucasian=.1)), THICK + PRETTY),
    'Ada': (dict(FEM, height=.5, race=dict(african=1., asian=0., caucasian=0.)),
            THICK + PRETTY[:6] + [T('nose-flaring-decr', .15), T('mouth-upperlip-volume-incr', .15), T('mouth-lowerlip-volume-incr', .15)] + both('eye-scale-incr', .25) + both('cheek-bones-incr', .45)),
}

if __name__ == '__main__':
    import pickle, time
    for nm, (ph, tg) in PEOPLE.items():
        t0 = time.time(); b = build(ph, tg)
        eye = np.concatenate([np.arange(a, c + 1) for a, c in GROUPS['joint-l-eye']])
        print(nm, 'height', round(b['V'][:, 2].max(), 3), 'joints', len(b['J']), round(time.time() - t0, 1), 's')
        pickle.dump(b, open(f'{nm}.pkl', 'wb'))
