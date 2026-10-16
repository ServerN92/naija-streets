"""The crouch, slide and jump moves (Mixamo FBX, Y Bot, no skin, 30 fps, see mix3.py for how moves are put together)
-> assets/people/moves3.glb, in the same form as moves2.glb (a skeleton of mixamorigXxx nodes, one clip per move, hips
position as a fraction of the hips' rest height). Run: python3 make_moves3.py <fbx dir> <out.glb>"""
import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'charbuild'))
from glbwrite import GLB
from make_moves2 import quat_xyzw
import mix3

UPPER = ['Spine', 'Neck', 'Head'] + mix3.ARM
def moves(F):
    """name in the game -> the move. F(name) loads a Mixamo file.
    Crouching is CODM's: down on one knee when still, a low creep when moving (Mixamo's game crouch, 'Idle Crouching'
    and 'Walk Crouching Forward'). Those hold a rifle, so with a gun out they are used as they are; with empty hands the
    kneel takes the resting arms of 'Crouching Idle' (hands by the knees) and the creep takes the chest and loose,
    swinging arms of the sneaking 'Crouched Walking', both kept where they are in the world."""
    ri, rw = F('Idle Crouching'), F('Walk Crouching Forward')
    return {
        'v3_cr_idle': mix3.arms_from(ri, F('Crouching Idle'), 'cycle', 'world', phase=0),
        'v3_cr_walk': mix3.arms_from(rw, F('Crouched Walking'), 'cycle', 'world', parts=UPPER),
        'v3_cr_idle_gun': ri, 'v3_cr_walk_gun': rw,
        'v3_slide': F('Running Slide'),
        'v3_jump': F('Standing Jump'),
        'v3_jump_run': mix3.join(mix3.cut(F('Standing Jump Running'), 12), mix3.cut(F('Standing Jump Running Landing'), 1, 30)),
        # lying down (prone), crawling and getting up again, from the kneel
        'v3_prone_in': mix3.cut(F('Crouch To Prone'), 12, 46), 'v3_prone_idle': F('Prone Idle'),
        'v3_prone_fwd': mix3.loop_fix(F('Prone Forward')), 'v3_prone_out': F('Prone To Crouch'),
        # climbing: vault a fence, climb a wall, drop down off a wall; each carries its floor (see mix3.floor)
        'v3_vault': mix3.floor(F('Jump Over Obstacle'), 'flat'), 'v3_wall': mix3.floor(F('Sprint To Wall Climb'), 'up'),
        'v3_drop': mix3.floor(F('Jumping Down'), 'down'),
        # women: Mixamo's female idle, walk, run and jumps, and the catwalk for a slow stroll
        'v3f_idle': F('F Idle'), 'v3f_walk': F('F Walk'), 'v3f_run': F('F Run'), 'v3f_catwalk': F('F Catwalk Walk'),
        'v3f_jump': F('F Standing Jump'), 'v3f_jump_run': mix3.cut(F('F Running Jump'), 0, 25),
    }

def write(MV, out, skel):
    g = GLB(); rest, par = skel['rest'], skel['par']
    names = list(rest.keys()); idx = {}
    from retarget import euler_xyz
    for b in names:
        r = rest[b]; L = euler_xyz(r.get('PreRotation', [0, 0, 0])) @ euler_xyz(r.get('Lcl Rotation', [0, 0, 0]))
        idx[b] = g.node(name=b.replace(':', ''), translation=[float(x) for x in r.get('Lcl Translation', [0, 0, 0])], rotation=[float(x) for x in quat_xyzw(L)], children=[])
    root = g.node(name='moves3', children=[])
    for b in names:
        p = par.get(b); (g.js['nodes'][idx[p]]['children'] if p in idx else g.js['nodes'][root]['children']).append(idx[b])
    for n in g.js['nodes']:
        if not n.get('children'): n.pop('children', None)
    fl = g.node(name='floor'); g.js['nodes'][root]['children'].append(fl)   # a climb's floor: (0, height, forward) per frame
    g.js['scenes'][0]['nodes'].append(root)
    H = rest['mixamorig:Hips']['Lcl Translation'][1]; anims = []
    for clip, M in MV.items():
        n = M['n']; tin = g.acc((np.arange(n) / 30.).astype(np.float32)[:, None], 'SCALAR', minmax=True); ch, sm = [], []
        for bn in names:
            if bn not in M['L']: continue
            Q = np.array([quat_xyzw(m) for m in M['L'][bn]])
            for i in range(1, len(Q)):
                if Q[i] @ Q[i - 1] < 0: Q[i] = -Q[i]
            sm.append(dict(input=tin, output=g.acc(Q.astype(np.float32), 'VEC4'), interpolation='LINEAR')); ch.append(dict(sampler=len(sm) - 1, target=dict(node=idx[bn], path='rotation')))
            if bn.endswith('Hips'):
                sm.append(dict(input=tin, output=g.acc((M['T'] / H).astype(np.float32), 'VEC3'), interpolation='LINEAR')); ch.append(dict(sampler=len(sm) - 1, target=dict(node=idx[bn], path='translation')))
        if 'F' in M:
            FL = np.stack([np.zeros(n), M['F'], M['T'][:, 2] - M['T'][0, 2]], 1) / H
            sm.append(dict(input=tin, output=g.acc(FL.astype(np.float32), 'VEC3'), interpolation='LINEAR')); ch.append(dict(sampler=len(sm) - 1, target=dict(node=fl, path='translation')))
        anims.append(dict(name=clip, channels=ch, samplers=sm)); print(clip, n, 'frames %.2f s' % (n / 30), ('floor top %.2f m' % (M['F'].max() / 100)) if 'F' in M else '')
    g.js['animations'] = anims; print('saved', out, g.save(out), 'bytes')

def main(indir, out, build=moves):
    cache = {}
    def F(name):
        if name not in cache: cache[name] = mix3.load_local(os.path.join(indir, name + '.fbx'))
        return cache[name]
    MV = build(F); write(MV, out, F('Running Slide'))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
