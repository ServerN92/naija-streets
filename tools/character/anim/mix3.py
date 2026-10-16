"""Making our own moves out of Mixamo ones (FBX, Y Bot): every bone's local turn per frame, put together on the frames
of one move, with the arms (shoulders, arms, hands; fingers come along) taken from another move, either as they are
relative to the chest ('local') or kept where they are in the world, relative to the hips ('world'), so they hang and
reach the same way whatever the other move's chest does. A walk's arms are lined up with its legs (left foot forward
when the right arm swings forward)."""
import os, numpy as np
from fbxanim import load
from retarget import euler_xyz, sample

def load_local(path):
    a = load(path); rest, par, anim = a['rest'], a['parent'], a['anim']
    n = max(len(c[0]) for b in anim.values() for c in b.values()); times = np.arange(n) / 30.
    order = []
    def visit(b):
        if b in order: return
        if par.get(b) in rest: visit(par[b])
        order.append(b)
    for b in rest: visit(b)
    L, T = {}, None
    for b in order:
        r = rest[b]; pre = euler_xyz(r.get('PreRotation', [0, 0, 0])); r0 = r.get('Lcl Rotation', [0, 0, 0]); ch = anim.get(b, {})
        E = np.stack([sample(ch.get('R' + k), times, r0[i]) for i, k in enumerate('XYZ')], 1); L[b] = np.array([pre @ euler_xyz(e) for e in E])
        if b.endswith('Hips'):
            t0 = np.array(r.get('Lcl Translation', [0, 0, 0]), float); T = np.stack([sample(ch.get('T' + k), times, t0[i]) for i, k in enumerate('XYZ')], 1)
    return dict(L=L, T=T, rest=rest, par=par, order=order, n=n)

def cut(M, a=0, b=None):
    b = b if b is not None else M['n']; return dict(M, L={k: v[a:b] for k, v in M['L'].items()}, T=M['T'][a:b].copy(), n=b - a)

def join(A, B):   # B played after A, carrying on from where A got to
    T = B['T'].copy(); T[:, [0, 2]] += A['T'][-1, [0, 2]] - T[0, [0, 2]] + (A['T'][-1, [0, 2]] - A['T'][-2, [0, 2]])
    return dict(A, L={k: np.concatenate([A['L'][k], B['L'][k]]) for k in A['L']}, T=np.concatenate([A['T'], T]), n=A['n'] + B['n'])

def world_rot(M):
    W = {}
    for b in M['order']:
        p = M['par'].get(b); W[b] = M['L'][b] if p not in W else np.einsum('nij,njk->nik', W[p], M['L'][b])
    return W

def world_pos(M):
    W, P, n = {}, {}, M['n']
    for b in M['order']:
        p = M['par'].get(b); t0 = np.array(M['rest'][b].get('Lcl Translation', [0, 0, 0]), float)
        if p not in W: W[b] = M['L'][b]; P[b] = M['T'] if b.endswith('Hips') else np.tile(t0, (n, 1))
        else: W[b] = np.einsum('nij,njk->nik', W[p], M['L'][b]); P[b] = P[p] + np.einsum('nij,j->ni', W[p], t0)
    return P

def left_foot_forward(M):   # the share of the cycle where the left foot is furthest in front of the hips
    P = world_pos(M); f = P['mixamorig:LeftFoot'][:, 2] - P['mixamorig:Hips'][:, 2]; return int(np.argmax(f)) / M['n']

ARM = ['Shoulder', 'Arm', 'ForeArm', 'Hand']
def is_arm(b): return any(k in b for k in ARM)

def arms_from(body, src, mode='cycle', space='world', phase=None, frame=0, parts=None):
    """body's move with the arms of src. mode: 'cycle' (src's arms looped over body's frames, lined up with its legs),
    'avg' (src's arms held still, their average), 'frame' (held still, as on that frame)."""
    n, ns = body['n'], src['n']
    if mode == 'cycle':
        if phase is None: phase = left_foot_forward(src) - left_foot_forward(body)
        idx = (((np.arange(n) / n + phase) % 1) * ns).astype(int) % ns
    else: idx = np.full(n, frame if frame >= 0 else ns + frame)
    M = dict(body, L=dict(body['L'])); parts = parts or ARM
    take = lambda b: any(k in b for k in parts) and 'Hand' not in b.replace('mixamorig:', '')[len('LeftHand'):] if False else any(k in b for k in parts)
    if space == 'local':
        for b in M['L']:
            if take(b) and b in src['L']:
                M['L'][b] = src['L'][b][idx] if mode != 'avg' else np.tile(avg_rot(src['L'][b]), (n, 1, 1))
        return M
    Ws = world_rot(src); W = dict(world_rot(body)); want = {}
    names = ['mixamorig:' + s + k for s in ['Left', 'Right'] for k in ARM] + ['mixamorig:' + k for k in ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head'] if any(k.startswith(q) for q in parts)]
    for b in names:
        if b in Ws and take(b): want[b] = Ws[b][idx] if mode != 'avg' else np.tile(avg_rot(Ws[b]), (n, 1, 1))
    for b in M['order']:
        p = M['par'].get(b)
        if b in want: M['L'][b] = np.einsum('nji,njk->nik', W[p], want[b]); W[b] = want[b]
        elif p in W: W[b] = np.einsum('nij,njk->nik', W[p], M['L'][b])
    return M

def avg_rot(R):
    u, s, vt = np.linalg.svd(R.mean(0)); m = u @ vt
    if np.linalg.det(m) < 0: u[:, -1] *= -1; m = u @ vt
    return m

def loop_fix(M, k=6):   # blend the last frames into the first so a loop has no jump
    n = M['n']; k = min(k, n // 3); L = dict(M['L'])
    from make_moves2 import quat_xyzw
    for b, R in L.items():
        R = R.copy()
        for j in range(k):
            w = (j + 1) / (k + 1); i = n - k + j
            R[i] = slerp_m(R[i], R[0], w)
        L[b] = R
    return dict(M, L=L)

def slerp_m(A, B, w):
    from scipy.spatial.transform import Rotation as Rr, Slerp
    r = Rr.from_matrix([A, B]); return Slerp([0, 1], r)([w]).as_matrix()[0]

def floor(M, kind):
    """where the floor is under a climbing move, per frame (cm): 'up' the highest the feet have stood so far (ends on top
    of the wall), 'down' the lowest so far (from the ledge to the ground), 'flat' always 0. The game raises you with it,
    scaled to the real height, and the move is played relative to it."""
    P = world_pos(M); toe = np.minimum(P['mixamorig:LeftToeBase'][:, 1], P['mixamorig:RightToeBase'][:, 1]) - 3
    if kind == 'flat': F = np.zeros(M['n'])
    elif kind == 'up': F = np.minimum(np.maximum.accumulate(np.maximum(toe, 0)), max(toe[-1], 0))
    else: F = np.maximum(np.minimum.accumulate(toe), 0)
    return dict(M, F=F)
