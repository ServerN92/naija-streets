"""The new Mixamo moves (FBX, Y Bot) -> one GLB in the same form as the game's assets/people/moves.glb:
a skeleton of nodes named mixamorigXxx (FBX rest pose, Y up, centimetres) and one clip per move with every bone's
rotation per frame; the hips position is stored as a fraction of the hips' rest height (like moves.glb)."""
import sys, os, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'charbuild'))
from glbwrite import GLB
from fbxanim import load
from retarget import euler_xyz, sample

def quat_xyzw(m):
    t = np.trace(m)
    if t > 0:
        s = np.sqrt(t + 1) * 2; q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4]
    else:
        i = int(np.argmax([m[0, 0], m[1, 1], m[2, 2]]))
        if i == 0: s = np.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2; q = [s / 4, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
        elif i == 1: s = np.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2; q = [(m[0, 1] + m[1, 0]) / s, s / 4, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
        else: s = np.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2; q = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, s / 4, (m[1, 0] - m[0, 1]) / s]
    q = np.array(q); return q / np.linalg.norm(q)

MOVES = [('v2_idle', 'Idle'), ('v2_walk', 'Walking'), ('v2_swagger', 'Swagger Walk'), ('v2_fwalk', 'Female Walking'), ('v2_run', 'Running'),
         ('v2_jump', 'Jump'), ('v2_fjump', 'Female Jump '),
         ('v2_sit_in', 'Stand_To_Sit'), ('v2_sit', 'Sitting'), ('v2_sit_out', 'Sit_To_Stand')]
# sitting down, sitting and getting up share one place for the body: the seated hips sit where Stand_To_Sit ends
# (so the three moves chain on one fixed spot: you stand there, sit down behind you, and stand up there again)
SEAT_FROM = 'Stand_To_Sit'; SEAT_SHIFT = {'Sitting': 'first', 'Sit_To_Stand': 'first'}

def main(indir, out):
    g = GLB(); first = load(os.path.join(indir, 'Idle.fbx'))
    rest, par = first['rest'], first['parent']
    names = list(rest.keys()); idx = {}
    for b in names:
        r = rest[b]; L = euler_xyz(r.get('PreRotation', [0, 0, 0])) @ euler_xyz(r.get('Lcl Rotation', [0, 0, 0]))
        idx[b] = g.node(name=b.replace(':', ''), translation=[float(x) for x in r.get('Lcl Translation', [0, 0, 0])], rotation=[float(x) for x in quat_xyzw(L)], children=[])
    root = g.node(name='moves2', children=[])
    for b in names:
        p = par.get(b)
        (g.js['nodes'][idx[p]]['children'] if p in idx else g.js['nodes'][root]['children']).append(idx[b])
    for n in g.js['nodes']:
        if not n.get('children'): n.pop('children', None)
    g.js['scenes'][0]['nodes'].append(root)
    H = rest['mixamorig:Hips']['Lcl Translation'][1]
    def hips_track(fn):
        a = load(os.path.join(indir, fn + '.fbx')); n = max(len(c[0]) for bb in a['anim'].values() for c in bb.values()); times = np.arange(n) / 30.
        r = a['rest'].get('mixamorig:Hips', rest['mixamorig:Hips']); t0 = np.array(r.get('Lcl Translation', [0, 0, 0]), float); cv = a['anim']['mixamorig:Hips']
        return np.stack([sample(cv.get('T' + k), times, t0[i]) for i, k in enumerate('XYZ')], 1)
    seat = hips_track(SEAT_FROM)[-1] if os.path.exists(os.path.join(indir, SEAT_FROM + '.fbx')) else None
    anims = []
    for clip, fn in MOVES:
        a = load(os.path.join(indir, fn + '.fbx'))
        n = max(len(c[0]) for bb in a['anim'].values() for c in bb.values()); times = np.arange(n) / 30.
        tin = g.acc(times.astype(np.float32)[:, None], 'SCALAR', minmax=True)
        ch, sm = [], []
        for b in names:
            if b not in a['anim']: continue
            r = a['rest'].get(b, rest[b]); pre = euler_xyz(r.get('PreRotation', [0, 0, 0])); r0 = r.get('Lcl Rotation', [0, 0, 0]); cv = a['anim'][b]
            E = np.stack([sample(cv.get('R' + k), times, r0[i]) for i, k in enumerate('XYZ')], 1)
            Q = np.array([quat_xyzw(pre @ euler_xyz(e)) for e in E])
            for i in range(1, len(Q)):
                if Q[i] @ Q[i - 1] < 0: Q[i] = -Q[i]
            sm.append(dict(input=tin, output=g.acc(Q.astype(np.float32), 'VEC4'), interpolation='LINEAR')); ch.append(dict(sampler=len(sm) - 1, target=dict(node=idx[b], path='rotation')))
            if b.endswith('Hips'):
                t0 = np.array(r.get('Lcl Translation', [0, 0, 0]), float)
                T = np.stack([sample(cv.get('T' + k), times, t0[i]) for i, k in enumerate('XYZ')], 1)
                if seat is not None and fn in SEAT_SHIFT: T[:, [0, 2]] += seat[[0, 2]] - T[0, [0, 2]]   # line up with where sitting down ended
                T = T / H
                sm.append(dict(input=tin, output=g.acc(T.astype(np.float32), 'VEC3'), interpolation='LINEAR')); ch.append(dict(sampler=len(sm) - 1, target=dict(node=idx[b], path='translation')))
        anims.append(dict(name=clip, channels=ch, samplers=sm))
        print(clip, fn, n, 'frames', len(ch), 'channels')
    g.js['animations'] = anims
    print('saved', out, g.save(out), 'bytes')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
