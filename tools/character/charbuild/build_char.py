"""Build the game character files (one GLB per person): body, eyes, brows, lashes, hair, all four outfits with shoes,
on a mixamo-named skeleton (A-pose rest). The game retargets any Mixamo move onto it.
glTF axes: Y up, facing +Z. Bones are named like the game's Mixamo moves (mixamorigHips ...)."""
import sys, os, json, math, pickle, time, numpy as np
from scipy.spatial import cKDTree
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'cloth'))
import garments as G, outfits as O
from test_local import make_body
from posed_test import posed_body
from proxies import load_mhclo, load_obj, fit
import hair as HM, gametex as GT
from glbwrite import GLB

PEOPLE = {
    'Tunde': dict(male=True, skin='skin_male_african_middleage.png', normal='skin_male_african_middleage_NRM.png', tone=(.42, .29, .21), value=1.0,
                  brows='eyebrow001', lashes='eyelashes01', hair=dict(kind='full')),
    'Amaka': dict(male=False, skin='young_darkskinned_female_diffuse.png', tone=(1., .84, .7), value=1.75, brows='eyebrow010', lashes='eyelashes04',
                  hair=dict(kind='braids', length=.72, seed=3, cuffs=0, spacing=.016)),
    'Ada': dict(male=False, skin='young_darkskinned_female_diffuse.png', tone=(.55, .38, .28), value=1.0, brows='eyebrow010', lashes='eyelashes04',
                hair=dict(kind='braids', length=.42, seed=11, cuffs=9, spacing=.015)),
}
GFAB = {
    'jersey': dict(tex='jersey', uv=1, rough=.55, slots={1: 'jersey_sleeve', 2: 'jersey_sleeve'}),
    'jersey_sleeve': dict(color='#0e8a44', rough=.55),
    'joggers': dict(tex='joggers_stripes', uv=1, rough=.85),
    'senator': dict(color='#1b2b55', rough=.65, emb=('emb_senator.png', .4, '#c8952e', None)),
    'senator_trim': dict(color='#1b2b55', rough=.65),
    'buba': dict(color='#ece2cc', rough=.7), 'buba_trim': dict(color='#ece2cc', rough=.7),
    'agbada': dict(tex='damask_cream', tile=.32, rough=.6, emb=('emb_agbada.png', .55, '#a8741c', 'damask_cream.png')),
    'fila': dict(color='#5e0f28', rough=.9),
    'singlet': dict(color='#eeeeea', rough=.9), 'cargo': dict(color='#8a7a52', rough=.9), 'slides': dict(color='#15151a', rough=.5),
    'croptop': dict(color='#f5f1ea', rough=.75), 'denim': dict(tex='denim', tile=.12, normal='denim_h', rough=.85),
    'bodycon': dict(color='#c0102c', rough=.5), 'ankara1': dict(tex='ankara_a', tile=.34, rough=.6), 'ankara2': dict(tex='ankara_c', tile=.3, rough=.6),
    'lace': dict(tex='lace_green', tile=.16, normal='lace_green_h', rough=.55), 'gele': dict(tex='damask_gold', tile=.18, rough=.6, metal=.2),
    'sandals': dict(color='#c79a3a', rough=.35, metal=.7),
}
VARIANT = {'Ada': {'croptop': dict(color='#e8457a'), 'bodycon': dict(color='#0f7a5a'), 'ankara1': dict(tex='ankara_b'), 'ankara2': dict(tex='ankara_d'),
                   'lace': dict(tex='lace_white', normal='lace_white_h'), 'gele': dict(tex='damask_wine', metal=.08), 'sandals': dict(color='#111111', metal=0., rough=.5)}}
SHOES = {'street': 'shoes05', 'senator': 'shoes01', 'agbada': 'shoes04', 'jeans': 'shoes05'}
NAMES = {'street': 'Street casual', 'senator': 'Senator', 'agbada': 'Agbada', 'hustle': 'Hustler', 'jeans': 'Crop top & jeans', 'bodycon': 'Bodycon dress',
         'gown': 'Ankara gown', 'wrapper': 'Wrapper & gele'}

def lin_hex(h, a=1.):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c] + [a]

def gl(P): return np.stack([P[:, 0], P[:, 2], -P[:, 1]], 1).astype(np.float32)        # Blender -> glTF axes

class Build:
    def __init__(self, person):
        self.person = person; self.cfg = PEOPLE[person]
        self.b, self.d = make_body(person)
        self.g = GLB(); self.texcache = {}
        J = {k: (h, t) for k, (h, t, p) in self.d['J'].items()}
        self.bones = list(J.keys())
        self.jidx = {b: i for i, b in enumerate(self.bones)}
        self.J = J; self.parent = {k: p for k, (h, t, p) in self.d['J'].items()}

    # ---------------------------------------------------------- skeleton
    def skeleton(self):
        """joints at our body's joints, each turned like the matching bone of the game's Mixamo skeleton (moves.glb) once our
        A-pose bone is lined up with it, so props held in the hand and Mixamo moves behave as on the game's other people"""
        g = self.g; nodes = {}
        S0, SP = mixamo_rest()
        pos = {b: gl(self.J[b][0][None])[0].astype(float) for b in self.bones}
        short = {b: b.split(':')[-1] for b in self.bones}; inv = {v: k for k, v in short.items()}
        kids = {}
        for b in self.bones:
            if self.parent[b]: kids.setdefault(self.parent[b], []).append(b)
        CHAIN = {'Hips': 'Spine', 'Spine2': 'Neck', 'LeftHand': 'LeftHandMiddle1', 'RightHand': 'RightHandMiddle1', 'LeftFoot': 'LeftToeBase', 'RightFoot': 'RightToeBase'}
        R = {}
        for b in self.bones:
            n = short[b]
            if n not in S0: R[b] = np.eye(3); continue
            c = CHAIN.get(n) if CHAIN.get(n) in inv else (short[kids[b][0]] if len(kids.get(b, [])) == 1 else None)
            A = np.eye(3)
            if c and c in SP and inv.get(c) in pos:
                A = swing(pos[inv[c]] - pos[b], SP[c] - SP[n])
            R[b] = A.T @ S0[n]
        self.R = R
        root = g.node(name='Armature', children=[])
        for b in self.bones:
            p = self.parent[b]
            if p: Rl = R[p].T @ R[b]; t = R[p].T @ (pos[b] - pos[p])
            else: Rl = R[b]; t = pos[b]
            nodes[b] = g.node(name=b.replace(':', ''), translation=[float(x) for x in t], rotation=[float(x) for x in quat_xyzw(Rl)], children=[])
        for b in self.bones:
            p = self.parent[b]
            (g.js['nodes'][nodes[p]]['children'] if p else g.js['nodes'][root]['children']).append(nodes[b])
        for n in g.js['nodes']:
            if not n.get('children'): n.pop('children', None)
        ibm = np.zeros((len(self.bones), 4, 4), np.float32)
        for i, b in enumerate(self.bones):
            m = np.eye(4); m[:3, :3] = R[b]; m[:3, 3] = pos[b]
            ibm[i] = np.linalg.inv(m).T            # column-major
        acc = g.acc(ibm.reshape(-1, 16), 'MAT4')
        g.js['skins'].append(dict(inverseBindMatrices=acc, joints=[nodes[b] for b in self.bones], skeleton=root, name=self.person))
        self.root_node = root; self.char = g.node(name=self.person, children=[root])
        g.js['scenes'][0]['nodes'].append(self.char)

    # ---------------------------------------------------------- textures and materials
    def tex(self, key, maker, wrap='repeat'):
        if key not in self.texcache:
            data, mime = maker()
            self.texcache[key] = self.g.texture(self.g.image(data, mime, key), wrap)
        return self.texcache[key]

    def fabric_mats(self, fkey):
        """-> material index for the cloth, and (for embroidered cloth) the front-panel material"""
        spec = dict(GFAB[fkey]); spec.update(VARIANT.get(self.person, {}).get(fkey, {}))
        g = self.g; color = lin_hex(spec['color']) if spec.get('color') else [1, 1, 1, 1]
        tex = None; tc = spec.get('uv', 0); scale = None; nrm = None
        if spec.get('tex'):
            name = spec['tex']
            if name == 'joggers_stripes': tex = self.tex(name, GT.joggers_stripes, 'clamp')
            elif name == 'jersey': tex = self.tex(name, lambda: GT.fabric('jersey.png', 1024), 'repeat')
            else: tex = self.tex(name, lambda: GT.fabric(name + '.png', 1024 if name.startswith('ankara') else 512))
            if spec.get('tile'): scale = (1 / spec['tile'], 1 / spec['tile'])
        if spec.get('normal'):
            nm = spec['normal']; src = os.path.join(GT.CLOTH, nm + '.png')
            nrm = self.tex(nm + '_n', lambda: GT.height_normal(src, 512, 2.))
        m = g.material(f'{self.person}_{fkey}', color, tex, tc, scale, rough=spec.get('rough', .7), metal=spec.get('metal', 0.), normal=nrm, extras=dict(fabric=fkey))
        emb = None
        if spec.get('emb'):
            img, size, thread, dam = spec['emb']
            base = spec.get('color', '#e9e0cc')
            et = self.tex('emb_' + fkey, lambda: GT.emb_panel(img, base, thread, 1024, dam, int(1024 * spec.get('tile', .32) / size) if dam else None), 'clamp')
            emb = g.material(f'{self.person}_{fkey}_panel', [1, 1, 1, 1], et, 2, None, rough=spec.get('rough', .7), extras=dict(fabric=fkey, panel=1))
        return m, emb, spec

    # ---------------------------------------------------------- meshes
    def mesh_node(self, name, prims, extras=None):
        """prims: list of (P_bl (n,3), N_gl or None, tris (m,3), attrs dict name->array, weights (n,52) array, material)"""
        g = self.g; P = []
        for Pb, Ng, T, at, Wt, mat in prims:
            Pg = gl(Pb)
            if Ng is None: Ng = smooth_normals(Pg, T)
            a = dict(POSITION=g.acc(Pg, 'VEC3', 34962, minmax=True), NORMAL=g.acc(Ng.astype(np.float32), 'VEC3', 34962))
            for k, v in at.items(): a[k] = g.acc(v.astype(np.float32), {1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4'}[v.shape[1]], 34962)
            ji, jw = top4(Wt)
            a['JOINTS_0'] = g.acc(ji.astype(np.uint8), 'VEC4', 34962); a['WEIGHTS_0'] = g.acc(jw.astype(np.float32), 'VEC4', 34962)
            it = T.astype(np.uint16 if len(Pg) < 65536 else np.uint32).ravel()
            P.append(dict(attributes=a, indices=g.acc(it, 'SCALAR', 34963), material=mat))
        g.js['meshes'].append(dict(name=name, primitives=P))
        n = g.node(name=name, mesh=len(g.js['meshes']) - 1, skin=0, extras=extras)
        g.js['nodes'][self.char]['children'].append(n)
        return n

    def wmat(self, W, n):
        M = np.zeros((n, len(self.bones)), np.float32)
        for bn, w in W.items():
            if bn in self.jidx: M[:, self.jidx[bn]] = w
            elif 'mixamorig:' + bn.split(':')[-1] in self.jidx: M[:, self.jidx['mixamorig:' + bn.split(':')[-1]]] = w
        return M

def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])

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

def swing(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); v = np.cross(a, b); c = float(a @ b)
    if c < -.9999: return -np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K / (1 + c)

_MIX = None
def mixamo_rest(path='/home/claude/naija-streets/assets/people/moves.glb'):
    """world turns (3x3) and places of the game's Mixamo skeleton at rest, by short bone name (glTF axes)"""
    global _MIX
    if _MIX: return _MIX
    import struct
    d = open(path, 'rb').read(); n = struct.unpack_from('<I', d, 12)[0]; js = json.loads(d[20:20 + n]); nodes = js['nodes']
    par = {}
    for i, nd in enumerate(nodes):
        for c in nd.get('children', []): par[c] = i
    W, P = {}, {}
    def world(i):
        if i in W: return W[i], P[i]
        nd = nodes[i]; Rl = quat_mat(nd.get('rotation', [0, 0, 0, 1])); t = np.array(nd.get('translation', [0, 0, 0]), float)
        if i in par: Rp, Pp = world(par[i]); W[i] = Rp @ Rl; P[i] = Pp + Rp @ t
        else: W[i] = Rl; P[i] = t
        return W[i], P[i]
    S0, SP = {}, {}
    for i, nd in enumerate(nodes):
        nm = nd.get('name', '')
        if 'mixamorig' in nm:
            r, p = world(i); k = nm.split('mixamorig')[-1].lstrip(':'); S0[k] = r; SP[k] = p
    _MIX = (S0, SP); return _MIX

def smooth_normals(P, T):
    N = np.zeros_like(P, dtype=np.float64)
    n = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    for c in range(3): np.add.at(N, T[:, c], n)
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
    return N.astype(np.float32)

def top4(W):
    W = np.asarray(W, np.float32)
    idx = np.argsort(-W, 1)[:, :4]; w = np.take_along_axis(W, idx, 1)
    s = w.sum(1, keepdims=True); w = np.where(s > 1e-6, w / np.maximum(s, 1e-6), np.array([[1, 0, 0, 0]], np.float32))
    return idx, w

def tri(F):
    out = []
    for f in F:
        for k in range(1, len(f) - 1): out.append((f[0], f[k], f[k + 1]))
    return np.array(out, np.int64)

def split_corners(F, P, corner_attrs, vert_attrs):
    """faces with per-corner attributes -> welded where all attributes agree. returns new P, tris, attrs, source index"""
    key = {}; src = []; ca = {k: [] for k in corner_attrs}; T = []
    for fi, f in enumerate(F):
        ids = []
        for ci, v in enumerate(f):
            vals = tuple(np.round(corner_attrs[k][fi][ci], 5).tobytes() for k in corner_attrs)
            kk = (v,) + vals
            if kk not in key:
                key[kk] = len(src); src.append(v)
                for k in corner_attrs: ca[k].append(corner_attrs[k][fi][ci])
            ids.append(key[kk])
        for k in range(1, len(ids) - 1): T.append((ids[0], ids[k], ids[k + 1]))
    src = np.array(src)
    attrs = {k: np.array(v) for k, v in ca.items()}
    for k, v in vert_attrs.items(): attrs[k] = v[src]
    return P[src], np.array(T), attrs, src

# ====================================================================== coverage: body faces hidden under each outfit
def boundary_verts(F, n):
    cnt = {}
    for f in F:
        for a, b in zip(f, f[1:] + f[:1]): k = (min(a, b), max(a, b)); cnt[k] = cnt.get(k, 0) + 1
    m = np.zeros(n, bool)
    for (a, b), c in cnt.items():
        if c == 1: m[a] = m[b] = True
    return m

def covered_by(b, piece, near=.045, edge=.025, pad=.012):
    # a tube goes all the way round: skin under it (or just touching it) is not drawn, so legs can't show through a tight skirt
    V, N = b.V, b.N; P = piece['verts']
    if 'rings' in piece and piece.get('K'):
        R, K = piece['rings'], piece['K']; G3 = P.reshape(R, K, 3); zs = G3[:, 0, 2]
        out = np.zeros(len(V), bool)
        z_hi, z_lo = zs.max() - .015, zs.min() + .025
        m = (V[:, 2] < z_hi) & (V[:, 2] > z_lo)
        for i in np.nonzero(m)[0]:
            z = V[i, 2]; r = np.searchsorted(-zs, -z); r = min(max(r, 1), R - 1)
            t = (zs[r - 1] - z) / max(zs[r - 1] - zs[r], 1e-6); ring = G3[r - 1] * (1 - t) + G3[r] * t
            c = ring[:, :2].mean(0); d = V[i, :2] - c; ang = math.atan2(d[0], -d[1])
            rr = np.linalg.norm(ring[:, :2] - c, axis=1); ra = np.arctan2(ring[:, 0] - c[0], -(ring[:, 1] - c[1]))
            k = np.argmin(np.abs((ra - ang + math.pi) % (2 * math.pi) - math.pi))
            out[i] = np.linalg.norm(d) < rr[k] + pad
        return out
    tree = cKDTree(P); dist, idx = tree.query(V)
    outside = ((P[idx] - V) * N).sum(1) > -.002
    bnd = boundary_verts(piece['faces'], len(P)); bp = P[bnd]
    if len(bp): de, _ = cKDTree(bp).query(P[idx])
    else: de = np.full(len(V), 1.)
    return (dist < near) & outside & (de > edge)

# ====================================================================== the person
def build(person, out_dir):
    t0 = time.time(); B = Build(person); b, d, cfg, g = B.b, B.d, B.cfg, B.g
    B.skeleton()
    Jn = {k.split(':')[-1]: v for k, v in B.J.items()}; par = {k.split(':')[-1]: (p.split(':')[-1] if p else None) for k, p in B.parent.items()}
    M = G.pose_matrices(Jn, par, G.arms_down(Jn)); bp = posed_body(b, d, M)
    nb = len(B.bones)
    meta = dict(person=person, male=cfg['male'], outfits=[], height=float(b.V[:, 2].max()), hips=float(B.J['mixamorig:Hips'][0][2]))
    # ---- outfits (rest pose pieces) and the body faces they hide
    table = O.MEN if cfg['male'] else O.LADIES
    pieces_by = []
    for oi, (oname, fn) in enumerate(table.items()):
        ps = fn(b)
        if not cfg['male'] and oname in ('bodycon', 'gown', 'wrapper'): ps.append((G.slides(b, name='sandals'), 'sandals'))
        out = []
        for p, f in ps:
            if p['name'] == 'agbada':
                p = G.robe(bp, bp.leg['L'][2][2] + .17, name='agbada')
                p['emb'] = emb_uv(p['verts'], bp, GFAB['agbada']['emb'][1])
                p['verts'] = G.unapply(p['verts'], G.blend(p['verts'], p['weights'], M)); p['robe'] = True
            out.append((p, f))
        pieces_by.append((oname, out))
        meta['outfits'].append(dict(id=oname, name=NAMES[oname], shoes=SHOES.get(oname)))
    # shoes (MakeHuman proxies)
    shoes = {}
    for sn in sorted({s for s in SHOES.values() if s} & {SHOES.get(o) for o, _ in pieces_by}):
        mh = load_mhclo(f'{HERE}/src/clothes/{sn}/{sn}.mhclo'); P, W = fit(mh, d['Vall'], d['Wall'])
        Vo, VT, F, FT = load_obj(f'{HERE}/src/clothes/{sn}/{mh["obj"]}')
        shoes[sn] = dict(verts=P, faces=F, VT=VT, FT=FT, W=W)
    hide = np.zeros((len(b.V), len(pieces_by)), bool)
    for oi, (oname, ps) in enumerate(pieces_by):
        for p, f in ps:
            if p.get('robe') or p['name'] in ('fila', 'gele', 'collar'): continue
            hide[:, oi] |= covered_by(b, p)
        sn = SHOES.get(oname)
        if sn: hide[:, oi] |= covered_by(b, dict(verts=shoes[sn]['verts'], faces=shoes[sn]['faces']), near=.05, edge=.02)
    # ---- body: split at uv seams, grouped by which outfits hide each face
    skin_tex = B.tex('skin', lambda: GT.skin(f'{HERE}/src/{cfg["skin"]}', cfg['tone'], cfg['value']))
    nrm = B.tex('skin_n', lambda: GT.normal(f'{HERE}/src/{cfg["normal"]}')) if cfg.get('normal') else None
    skin_mat = g.material(f'{person}_skin', [1, 1, 1, 1], skin_tex, 0, None, rough=.58, normal=nrm, normal_scale=.6, double=False, extras=dict(skin=1))
    F = b.F; FT = d['FT']; VT = d['VT']
    Ng = smooth_normals(gl(b.V), tri(F))
    Wb = B.wmat({k: b.Wm[:, i] for i, k in enumerate(b.bones)}, len(b.V))
    groups = {}
    for fi, f in enumerate(F):
        key = ''.join(str(oi) for oi in range(hide.shape[1]) if hide[f, oi].all())
        groups.setdefault(key, []).append(fi)
    for key, fis in sorted(groups.items()):
        Fs = [F[i] for i in fis]; cor = [[(VT[t][0], 1 - VT[t][1]) for t in FT[i]] for i in fis]
        used = np.unique(np.concatenate([np.array(f) for f in Fs])); remap = -np.ones(len(b.V), int); remap[used] = np.arange(len(used))
        Fl = [[remap[v] for v in f] for f in Fs]
        P2, T2, at, src = split_corners(Fl, b.V[used], {'TEXCOORD_0': cor}, {'N': Ng[used], 'W': Wb[used]})
        B.mesh_node('body~' + key if key else 'body', [(P2, at.pop('N'), T2, {'TEXCOORD_0': at['TEXCOORD_0']}, at['W'], skin_mat)])
    # ---- eyes, brows, lashes
    mh = load_mhclo(f'{HERE}/src/eyes/high-poly/high-poly.mhclo'); P, W = fit(mh, d['Vall'], d['Wall'])
    Vo, VT_e, F_e, FT_e = load_obj(f'{HERE}/src/eyes/high-poly/{mh["obj"]}')
    keepf = [i for i, ft in enumerate(FT_e) if not (VT_e[ft][:, 0].mean() > .8 and VT_e[ft][:, 1].mean() < .2)]
    eye_tex = B.tex('eyes', lambda: GT.eyes(f'{HERE}/src/eyes/materials/brown_eye.png'))
    eye_mat = g.material(f'{person}_eyes', [1, 1, 1, 1], eye_tex, 0, None, rough=.25, double=True)
    Fe = [F_e[i] for i in keepf]; FTe = [FT_e[i] for i in keepf]
    cL = P[P[:, 0] > b.hip[0]].mean(0); cR = P[P[:, 0] <= b.hip[0]].mean(0)
    for k, f in enumerate(Fe):                       # every eye face points out of its eyeball
        a, bb, cc = P[f[0]], P[f[1]], P[f[2]]; ce = (a + bb + cc) / 3; c0 = cL if ce[0] > b.hip[0] else cR
        if np.cross(bb - a, cc - a) @ (ce - c0) < 0: Fe[k] = f[::-1]; FTe[k] = FTe[k][::-1]
    add_proxy(B, 'eyes', P, W, Fe, FTe, VT_e, eye_mat)
    for kind, nm, cut in (('brows', cfg['brows'], .3), ('lashes', cfg['lashes'], .35)):
        folder = 'eyebrows' if kind == 'brows' else 'eyelashes'
        mh = load_mhclo(f'{HERE}/src/{folder}/{nm}/{nm}.mhclo'); P, W = fit(mh, d['Vall'], d['Wall'])
        Vo, VT_s, F_s, FT_s = load_obj(f'{HERE}/src/{folder}/{nm}/{mh["obj"]}')
        tx = B.tex(kind, lambda: GT.strands(f'{HERE}/src/{folder}/{nm}/{nm}.png'))
        m = g.material(f'{person}_{kind}', lin_hex('#140f0c'), tx, 0, None, rough=.8, alpha='MASK', cutoff=cut)
        add_proxy(B, kind, P, W, F_s, FT_s, VT_s, m)
    eyev = fit(load_mhclo(f'{HERE}/src/eyes/high-poly/high-poly.mhclo'), d['Vall'], d['Wall'])[0]
    # ---- hair
    hc = cfg['hair']; head = B.jidx['mixamorig:Head']; sp2 = B.jidx['mixamorig:Spine2']
    if hc['kind'] == 'full':
        H = HM.head_frame(b, eyev)
        coils = B.tex('coils', GT.coils); coils_rgb = B.tex('coils_rgb', lambda: GT.enc(__import__('PIL.Image', fromlist=['Image']).open(__import__('io').BytesIO(GT.coils()[0])).convert('RGB'), 'png'))
        for i, (nm, p) in enumerate(HM.full_hair(H)):
            fuzz = nm != 'hair_base'
            m = g.material(f'{person}_{nm}', [1, 1, 1, 1], coils if fuzz else coils_rgb, 0, (1 / .03, 1 / .03), rough=.6, alpha='MASK', cutoff=(.22 + .2 * (i - 1)) if fuzz else .5)
            add_simple(B, nm, p, m, {head: 1.}, colors=p['cut'])
    else:
        Hp = HM.head_frame(bp, eyev)        # braids hang over the arms-down body
        ps, info = HM.braids(Hp, length=hc['length'], seed=hc['seed'], cuffs=hc['cuffs'], spacing=hc['spacing'])
        bt, bn = GT.braid()
        btex = B.tex('braid', lambda: bt); bnrm = B.tex('braid_n', lambda: bn)
        for nm, p in ps:
            if nm == 'braids':
                m = g.material(f'{person}_braids', [1, 1, 1, 1], btex, 0, None, rough=.45, normal=bnrm, normal_scale=.8)
                Wt = np.zeros((len(p['verts']), nb), np.float32); Wt[:, head] = p['whead']; Wt[:, sp2] = 1 - p['whead']
                add_raw(B, nm, p['verts'], p['faces'], p['uv'], Wt, m)
            elif nm == 'cuffs':
                m = g.material(f'{person}_cuffs', lin_hex('#f2c14e'), None, rough=.25, metal=1.)
                Wt = np.zeros((len(p['verts']), nb), np.float32); Wt[:, head] = p['whead']; Wt[:, sp2] = 1 - p['whead']
                add_raw(B, nm, p['verts'], p['faces'], p['uv'], Wt, m)
            else:
                coils_rgb = B.tex('coils_rgb', lambda: GT.enc(__import__('PIL.Image', fromlist=['Image']).open(__import__('io').BytesIO(GT.coils()[0])).convert('RGB'), 'png'))
                m = g.material(f'{person}_braid_base', [1, 1, 1, 1], coils_rgb, 0, (1 / .03, 1 / .03), rough=.6, alpha='MASK', cutoff=.5)
                add_simple(B, 'braid_base', p, m, {head: 1.}, colors=p['cut'])
        meta['braids'] = info
    # ---- the outfits
    for oi, (oname, ps) in enumerate(pieces_by):
        for p, fkey in ps:
            add_cloth(B, oi, p, fkey)
    for sn, s in shoes.items():
        tx = B.tex(sn, lambda: GT.shoe(f'{HERE}/src/clothes/{sn}/{sn}_diffuse.png'))
        m = g.material(f'{person}_{sn}', [1, 1, 1, 1], tx, 0, None, rough=.6)
        ois = ''.join(str(i) for i, (o, _) in enumerate(pieces_by) if SHOES.get(o) == sn)
        add_proxy(B, f'shoe{ois}~{sn}', s['verts'], s['W'], s['faces'], s['FT'], s['VT'], m)
    g.js['scenes'][0]['extras'] = meta
    path = os.path.join(out_dir, f'{person.lower()}.glb'); size = g.save(path)
    print(person, 'saved', path, round(size / 1e6, 2), 'MB', round(time.time() - t0, 1), 's', 'body groups', sorted(groups))
    return path

def emb_uv(P, b, size):
    c = b.neck; top = c[2] + .02
    u = (P[:, 0] - c[0]) / size + .5; v = 1 - (top - P[:, 2]) / size
    back = P[:, 1] > c[1] + .02
    return np.stack([np.where(back, -1., u), np.where(back, -1., v)], 1)

def add_proxy(B, name, P, W, F, FT, VT, mat):
    Wt = B.wmat(W, len(P))
    cor = [[(VT[t][0], 1 - VT[t][1]) for t in ft] for ft in FT]
    Ng = smooth_normals(gl(P), tri(F))
    P2, T2, at, src = split_corners(F, P, {'TEXCOORD_0': cor}, {'N': Ng, 'W': Wt})
    B.mesh_node(name, [(P2, at.pop('N'), T2, {'TEXCOORD_0': at['TEXCOORD_0']}, at['W'], mat)])

def add_raw(B, name, P, F, uv, Wt, mat, colors=None):
    T = tri(F); uvg = np.stack([uv[:, 0], 1 - uv[:, 1]], 1)
    at = {'TEXCOORD_0': uvg}
    if colors is not None: at['COLOR_0'] = np.stack([np.ones(len(P)), np.ones(len(P)), np.ones(len(P)), np.clip(colors, 0, 1)], 1)
    B.mesh_node(name, [(P, None, T, at, Wt, mat)])

def add_simple(B, name, p, mat, bones, colors=None):
    Wt = np.zeros((len(p['verts']), len(B.bones)), np.float32)
    for j, w in bones.items(): Wt[:, j] = w
    # wrap the round-the-head seam
    F = p['faces']; uv = p['uv']; per = p.get('uper', np.zeros(len(uv)))
    cor = []
    for f in F:
        a = uv[f].copy(); pp = per[f].max()
        if pp > 0 and np.ptp(a[:, 0]) > pp / 2: a[a[:, 0] < a[:, 0].mean(), 0] += pp
        a[:, 1] = 1 - a[:, 1]; cor.append(a)
    Ng = smooth_normals(gl(p['verts']), tri(F))
    va = {'N': Ng, 'W': Wt}
    if colors is not None: va['C'] = np.stack([np.ones(len(uv)), np.ones(len(uv)), np.ones(len(uv)), np.clip(colors, 0, 1)], 1)
    P2, T2, at, src = split_corners(F, p['verts'], {'TEXCOORD_0': cor}, va)
    attrs = {'TEXCOORD_0': at['TEXCOORD_0']}
    if 'C' in at: attrs['COLOR_0'] = at['C']
    B.mesh_node(name, [(P2, at['N'], T2, attrs, at['W'], mat)])

def add_cloth(B, oi, p, fkey):
    mat, panel, spec = B.fabric_mats(fkey)
    P = p['verts']; F = p['faces']; n = len(P)
    F = G_orient(P, F)
    u1, u2 = G.loop_uvs(p, F)
    part = p.get('part', np.zeros(n))
    duv = p['duv'].copy()
    if fkey == 'joggers':                     # the right leg's design uv is mirrored so both stripes sit outside
        rl = part == 4; duv[rl, 0] = 1 - duv[rl, 0]
        u2 = None
    eu = p.get('emb')
    if eu is None: eu = emb_uv(P, B.b, spec['emb'][1]) if spec.get('emb') else np.full((n, 2), -1.)
    # per corner
    c0, c1, c2, k = [], [], [], 0
    for f in F:
        m = len(f)
        a = u1[k:k + m].copy(); a[:, 1] = 1 - a[:, 1]; c0.append(a)
        if u2 is None:
            dd = duv[f].copy()
            if fkey == 'joggers': dd[part[f] == 0] = (.5, .5)
            if np.ptp(dd[:, 0]) > .5: dd[dd[:, 0] < .5, 0] += 1
        else: dd = u2[k:k + m].copy()
        dd[:, 1] = 1 - dd[:, 1]; c1.append(dd)
        e = eu[f].copy(); e[:, 1] = 1 - e[:, 1]; c2.append(e); k += m
    Wt = B.wmat(p['weights'], n)
    Ng = smooth_normals(gl(P), tri(F))
    # materials per face: sleeve slots, embroidered front panel
    slots = spec.get('slots', {})
    mats = {}
    def mat_of(fi, f):
        if panel is not None:
            e = eu[f]
            if (e[:, 0] > .01).all() and (e[:, 0] < .99).all() and (e[:, 1] > .01).all() and (e[:, 1] < .99).all(): return ('panel', panel)
        if slots:
            vals = [int(part[v]) for v in f]; pid = max(set(vals), key=vals.count)
            if pid in slots:
                k2 = slots[pid]
                if k2 not in mats: mats[k2] = B.fabric_mats(k2)[0]
                return (k2, mats[k2])
        return ('base', mat)
    groups = {}
    for fi, f in enumerate(F): groups.setdefault(mat_of(fi, f), []).append(fi)
    prims = []
    for (kname, m), fis in groups.items():
        Fs = [F[i] for i in fis]
        used = np.unique(np.concatenate([np.array(f) for f in Fs])); remap = -np.ones(n, int); remap[used] = np.arange(len(used))
        Fl = [[remap[v] for v in f] for f in Fs]
        P2, T2, at, src = split_corners(Fl, P[used], {'TEXCOORD_0': [c0[i] for i in fis], 'TEXCOORD_1': [c1[i] for i in fis], 'TEXCOORD_2': [c2[i] for i in fis]},
                                        {'N': Ng[used], 'W': Wt[used]})
        prims.append((P2, at.pop('N'), T2, {k: at[k] for k in ('TEXCOORD_0', 'TEXCOORD_1', 'TEXCOORD_2')}, at['W'], m))
    B.mesh_node(f'o{oi}~{p["name"]}', prims)

def G_orient(P, F):
    c = P.mean(0); s = 0.
    for f in F[::max(1, len(F) // 400)]:
        a, b_, cc = P[f[0]], P[f[1]], P[f[2]]
        nn = np.cross(b_ - a, cc - a); dd = (a + b_ + cc) / 3 - c; dd[2] *= .2; s += nn @ dd
    return F if s >= 0 else [list(reversed(f)) for f in F]

if __name__ == '__main__':
    out = os.path.join(HERE, 'out'); os.makedirs(out, exist_ok=True)
    for p in sys.argv[1:] or PEOPLE: build(p, out)
