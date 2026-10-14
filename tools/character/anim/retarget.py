"""Mixamo moves (FBX, Y Bot skeleton) onto our MakeHuman characters (MPFB 'mixamo' rig, A-pose rest).

For every frame, each bone of our character is turned so it points the way the Mixamo bone points, keeping the Mixamo
bone's twist: target world turn = (source turn now * source turn at rest^-1) * A, where A first lines our rest bone up
with the Mixamo rest bone (that takes our A-pose arms up into the Mixamo T-pose). The hips move scaled to our leg length;
walks and runs are made 'in place' (the game moves the character) and their real ground speed is kept, so feet don't slide.

Output per move: fps, frames, for each bone a world-axis rotation about its own joint relative to its parent
(the same form as garments.pose_matrices / dress.pose_rig use), and the hips offset in metres."""
import numpy as np, math
from fbxanim import load

C = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float)      # FBX (Y up, Z forward) -> Blender (Z up, -Y forward)

def euler_xyz(deg):
    x, y, z = np.radians(deg)
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]); Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]); Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx

def sample(curve, times, default):
    if curve is None: return np.full(len(times), default)
    t, v = curve
    if len(t) == 1: return np.full(len(times), v[0])
    return np.interp(times, t - t[0], v)

def source_pose(fbx, fps=30.):
    """world rotations (Blender axes) and joint positions (m) of every Mixamo bone, at rest and per frame."""
    a = load(fbx); rest, par, anim = a['rest'], a['parent'], a['anim']
    names = list(rest.keys())
    n = max(len(c[0]) for b in anim.values() for c in b.values())
    times = np.arange(n) / fps
    order = []
    def visit(b):
        if b in order: return
        if par.get(b) in rest: visit(par[b])
        order.append(b)
    for b in names: visit(b)
    def frames(animated):
        Wr, Wp = {}, {}
        for b in order:
            r = rest[b]; pre = euler_xyz(r.get('PreRotation', [0, 0, 0]))
            t0 = np.array(r.get('Lcl Translation', [0, 0, 0]), float); r0 = r.get('Lcl Rotation', [0, 0, 0])
            ch = anim.get(b, {}) if animated else {}
            T = np.stack([sample(ch.get('T' + k), times, t0[i]) for i, k in enumerate('XYZ')], 1) if animated else t0[None]
            E = np.stack([sample(ch.get('R' + k), times, r0[i]) for i, k in enumerate('XYZ')], 1) if animated else np.array(r0, float)[None]
            L = np.array([pre @ euler_xyz(e) for e in E])
            p = par.get(b)
            if p in Wr:
                Wr[b] = np.einsum('nij,njk->nik', Wr[p], L); Wp[b] = Wp[p] + np.einsum('nij,nj->ni', Wr[p], T)
            else:
                Wr[b] = L; Wp[b] = T
        # to Blender axes and metres
        return ({b: np.einsum('ij,njk,kl->nil', C, R, C.T) for b, R in Wr.items()}, {b: (P @ C.T) * .01 for b, P in Wp.items()})
    rest_r, rest_p = frames(False)
    anim_r, anim_p = frames(True)
    return dict(times=times, par=par, rest_r={b: v[0] for b, v in rest_r.items()}, rest_p={b: v[0] for b, v in rest_p.items()}, r=anim_r, p=anim_p)

def swing(a, b):
    """smallest rotation taking direction a onto direction b"""
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); v = np.cross(a, b); c = float(a @ b)
    if c < -.9999:
        ax = np.cross(a, [1, 0, 0]);
        if np.linalg.norm(ax) < 1e-6: ax = np.cross(a, [0, 1, 0])
        ax /= np.linalg.norm(ax); K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]]); return np.eye(3) + 2 * K @ K
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K / (1 + c)

def retarget(src, J, parents, in_place=True, scale_root=True):
    """J {bone: (head, tail)} our rest joints (Blender world, m); parents {bone: parent}. Bones named without 'mixamorig:'."""
    S = {k.split(':')[-1]: v for k, v in src['r'].items()}; S0 = {k.split(':')[-1]: v for k, v in src['rest_r'].items()}
    P0 = {k.split(':')[-1]: v for k, v in src['rest_p'].items()}; P = {k.split(':')[-1]: v for k, v in src['p'].items()}
    spar = {k.split(':')[-1]: (v.split(':')[-1] if v else None) for k, v in src['par'].items()}
    bones = [b for b in J if b in S]
    kids = {}
    for b in bones:
        if parents.get(b): kids.setdefault(parents[b], []).append(b)
    A = {}
    for b in bones:
        h, t = J[b]
        # the child that sits on this bone's tail gives both rigs' bone direction
        c = next((k for k in kids.get(b, []) if np.linalg.norm(J[k][0] - t) < 2e-3), None)
        if c is None:
            sc = [k for k, p in spar.items() if p == b and k in P0]
            if not sc: A[b] = np.eye(3); continue
            ds = P0[sc[0]] - P0[b]
        else: ds = P0[c] - P0[b]
        A[b] = swing(t - h, ds)
    n = len(src['times'])
    D = {b: np.einsum('nij,jk,kl->nil', S[b], S0[b].T, A[b]) for b in bones}
    R = {}
    for b in bones:
        p = parents.get(b)
        R[b] = np.einsum('nji,njk->nik', D[p], D[b]) if p in D else D[b]
    # hips: scaled to our leg length; walks lose their forward travel (the game moves you) but keep their sway and bob
    k = J['Hips'][0][2] / P0['Hips'][2] if scale_root else 1.
    hp = (P['Hips'] - P0['Hips']) * k
    T = src['times'][-1] - src['times'][0]
    travel = hp[-1] - hp[0]
    speed = float(np.hypot(travel[0], travel[1]) / T) if T > 0 else 0.
    if in_place:
        f = (src['times'] - src['times'][0]) / max(T, 1e-6)
        hp[:, 0] -= hp[0, 0] + travel[0] * f; hp[:, 1] -= hp[0, 1] + travel[1] * f
    return dict(R=R, hips=hp, fps=1 / (src['times'][1] - src['times'][0]) if n > 1 else 30., frames=n, speed=speed, bones=bones, scale=k)
