"""Retarget the Mixamo moves to Tunde, Amaka and Ada and write them as JSON for Blender (one file per person)."""
import json, numpy as np, sys
sys.path.insert(0, '../cloth')
import garments as G
from preview_anim import setup, mats
from retarget import source_pose, retarget

MOVES = {'Tunde': {'idle': 'Idle', 'walk': 'Swagger Walk', 'walk2': 'Walking', 'run': 'Running', 'jump': 'Jump'},
         'Amaka': {'idle': 'Idle', 'walk': 'Female Walking', 'walk2': 'Walking', 'run': 'Running', 'jump': 'Female Jump '},
         'Ada': {'idle': 'Idle', 'walk': 'Female Walking', 'walk2': 'Walking', 'run': 'Running', 'jump': 'Female Jump '}}
IN_PLACE = {'walk', 'walk2', 'run'}

def quat(R):
    """3x3 -> (w, x, y, z)"""
    m = R; t = np.trace(m)
    if t > 0:
        s = np.sqrt(t + 1) * 2; return [s / 4, (m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s]
    i = int(np.argmax([m[0, 0], m[1, 1], m[2, 2]]))
    if i == 0: s = np.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2; return [(m[2, 1] - m[1, 2]) / s, s / 4, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s]
    if i == 1: s = np.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2; return [(m[0, 2] - m[2, 0]) / s, (m[0, 1] + m[1, 0]) / s, s / 4, (m[1, 2] + m[2, 1]) / s]
    s = np.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2; return [(m[1, 0] - m[0, 1]) / s, (m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, s / 4]

def foot_floor(b, J, par, rt):
    """how far the feet sink below (or float above) the floor during the move -> a constant hips lift"""
    feet = np.isin(b.part, ['footL', 'footR'])
    Wb = {k: b.Wm[feet, i] for i, k in enumerate(b.bones)}
    Vf = b.V[feet]; lows = []
    for fi in range(0, rt['frames'], max(1, rt['frames'] // 24)):
        M = mats(J, par, {k: v[fi] for k, v in rt['R'].items()}, rt['hips'][fi])
        lows.append(G.apply(Vf, G.blend(Vf, Wb, M))[:, 2].min())
    lows = np.sort(lows)
    return float(-np.mean(lows[:max(1, len(lows) // 6)]))    # the planted foot sits on the floor

def export(who):
    b, d, J, par = setup(who)
    out = {'person': who, 'moves': {}}
    for key, fn in MOVES[who].items():
        src = source_pose(f'in/{fn}.fbx'); rt = retarget(src, J, par, in_place=key in IN_PLACE)
        lift = foot_floor(b, J, par, rt) if key != 'jump' else foot_floor(b, J, par, dict(rt, frames=min(rt['frames'], 8)))
        rt['hips'][:, 2] += lift
        out['moves'][key] = dict(src=fn.strip(), fps=rt['fps'], frames=rt['frames'], speed=round(rt['speed'], 3), lift=round(lift, 4),
                                 bones={k: np.round([quat(r) for r in v], 5).tolist() for k, v in rt['R'].items()},
                                 hips=np.round(rt['hips'], 5).tolist())
        print(who, key, fn, 'frames', rt['frames'], 'speed', round(rt['speed'], 2), 'lift', round(lift, 3))
    json.dump(out, open(f'moves_{who}.json', 'w'), separators=(',', ':'))

if __name__ == '__main__':
    for w in sys.argv[1:] or ['Tunde', 'Amaka', 'Ada']: export(w)
