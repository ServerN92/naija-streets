"""Game files for the nine women, from what women_export.py wrote out of Blender (export/<Name>/parts.npz + parts.json + pictures).
One GLB per woman (assets/people/p_<id>.glb before gltfpack): her body, face, eyes, brows, liner, scalp cap, hair, all nine
outfits and shoes, on a Mixamo-named skeleton whose bones are turned like the game's Mixamo moves (as charbuild/build_char.py).
  * the body is one mesh; its second colour set (COLOR_1: red = bits 0-7, green = bits 8-15, blue = 16-23) says, per vertex, under which outfits it is covered (bit i = outfit i), so the
    game draws only the skin each outfit leaves showing (src/char2.js setOutfit)
  * outfit parts are named o<i>~<piece>, shoes shoe<outfits>~<name>, hair hair~<outfits it is hidden under (gele)>
  * the scene's extras: person, outfits [{id, name, shoes, sw}], height, hips
python3 women_glb.py <export dir> <tex_cloth dir> <out dir> [Name ...]"""
import sys, os, io, json, math, struct, numpy as np
from PIL import Image
from scipy.spatial import cKDTree
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'charbuild')); sys.path.insert(0, os.path.join(HERE, '..', 'cloth'))
from glbwrite import GLB
import gametex as GT
import garments as G

MOVES = os.path.join(HERE, '..', '..', '..', 'assets', 'people', 'moves.glb')
TUBES = {'gown_skirt', 'buba_tail', 'iro', 'bodycon_skirt', 'club_skirt', 'slip_skirt', 'pencil', 'senator_tail', 'kaftan_tail', 'pskirt', 'rag_skirt'}
NO_HIDE = {'gele', 'button', 'lapels', 'pockets', 'tie', 'placket', 'buckle', 'pouch', 'beret', 'kufi'}
B36 = '0123456789abcdefghijklmnopqrstuvwxyz'   # outfit i in a part's name (the men have eleven outfits)

def gl(P): return np.stack([P[:, 0], P[:, 2], -P[:, 1]], 1).astype(np.float32)        # Blender -> glTF axes
def lin_hex(h, a=1.):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c] + [a]

# ------------------------------------------------------------------ the skeleton (as build_char.py)
def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
def quat_xyzw(m):
    t = np.trace(m)
    if t > 0: s = np.sqrt(t + 1) * 2; q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4]
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
def mixamo_rest(path=MOVES):
    global _MIX
    if _MIX: return _MIX
    d = open(path, 'rb').read(); n = struct.unpack_from('<I', d, 12)[0]; js = json.loads(d[20:20 + n]); nodes = js['nodes']; par = {}
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
        if 'mixamorig' in nm: r, p = world(i); k = nm.split('mixamorig')[-1].lstrip(':'); S0[k] = r; SP[k] = p
    _MIX = (S0, SP); return _MIX

def skeleton(g, bones, person):
    S0, SP = mixamo_rest()
    names = [b['name'] for b in bones]; parent = {b['name']: b['parent'] for b in bones}
    pos = {b['name']: gl(np.array([b['head']]))[0].astype(float) for b in bones}
    short = {b: b.split(':')[-1] for b in names}; inv = {v: k for k, v in short.items()}
    kids = {}
    for b in names:
        if parent[b]: kids.setdefault(parent[b], []).append(b)
    CHAIN = {'Hips': 'Spine', 'Spine2': 'Neck', 'LeftHand': 'LeftHandMiddle1', 'RightHand': 'RightHandMiddle1', 'LeftFoot': 'LeftToeBase', 'RightFoot': 'RightToeBase'}
    R = {}
    for b in names:
        n = short[b]
        if n not in S0: R[b] = np.eye(3); continue
        c = CHAIN.get(n) if CHAIN.get(n) in inv else (short[kids[b][0]] if len(kids.get(b, [])) == 1 else None)
        A = swing(pos[inv[c]] - pos[b], SP[c] - SP[n]) if c and c in SP and inv.get(c) in pos else np.eye(3)
        R[b] = A.T @ S0[n]
    root = g.node(name='Armature', children=[]); nodes = {}
    for b in names:
        p = parent[b]
        if p: Rl = R[p].T @ R[b]; t = R[p].T @ (pos[b] - pos[p])
        else: Rl = R[b]; t = pos[b]
        nodes[b] = g.node(name=b.replace(':', ''), translation=[float(x) for x in t], rotation=[float(x) for x in quat_xyzw(Rl)], children=[])
    for b in names:
        p = parent[b]; (g.js['nodes'][nodes[p]]['children'] if p else g.js['nodes'][root]['children']).append(nodes[b])
    for n in g.js['nodes']:
        if not n.get('children'): n.pop('children', None)
    ibm = np.zeros((len(names), 4, 4), np.float32)
    for i, b in enumerate(names):
        m = np.eye(4); m[:3, :3] = R[b]; m[:3, 3] = pos[b]; ibm[i] = np.linalg.inv(m).T
    g.js['skins'].append(dict(inverseBindMatrices=g.acc(ibm.reshape(-1, 16), 'MAT4'), joints=[nodes[b] for b in names], skeleton=root, name=person))
    char = g.node(name=person, children=[root]); g.js['scenes'][0]['nodes'].append(char)
    return char

# ------------------------------------------------------------------ parts
class Part:
    def __init__(self, z, key):
        g = lambda a: z[f'{key}_{a}'] if f'{key}_{a}' in z.files else None
        self.V, self.L, self.LS, self.LT, self.MI, self.N = g('V'), g('L'), g('LS'), g('LT'), g('MI'), g('N')
        self.JI, self.JW = g('JI'), g('JW')
        self.uv = {k[len(key) + 4:]: z[k] for k in z.files if k.startswith(key + '_UV_')}
        self.attr = {k[len(key) + 3:]: z[k] for k in z.files if k.startswith(key + '_A_')}
    def faces(self): return [self.L[s:s + t].tolist() for s, t in zip(self.LS, self.LT)]

def weld(part, corner_uvs, extra_v=None, polys=None):
    """corners -> glTF vertices (welded where vertex, normal and uvs agree) and triangles, for the polygons asked for"""
    polys = np.arange(len(part.LS)) if polys is None else polys
    cs = np.concatenate([np.arange(part.LS[p], part.LS[p] + part.LT[p]) for p in polys])
    v = part.L[cs]
    cols = [v[:, None].astype(np.float64), np.round(part.N[cs], 4)] + [np.round(u[cs], 5) for u in corner_uvs]
    key = np.concatenate(cols, 1)
    uk, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.ravel(); src_c = cs[first]
    T = []; k = 0
    for p in polys:
        t = part.LT[p]; ids = inv[k:k + t]; k += t
        for j in range(1, t - 1): T.append((ids[0], ids[j], ids[j + 1]))
    vs = part.L[src_c]
    out = dict(P=part.V[vs], N=part.N[src_c], UV=[u[src_c] for u in corner_uvs], JI=part.JI[vs], JW=part.JW[vs], src=vs)
    if extra_v is not None: out['X'] = extra_v[vs]
    return out, np.array(T, np.int64)

class Z(dict):
    files = property(lambda self: list(self.keys()))

class Woman:
    def __init__(self, folder, texc):
        self.folder, self.texc = folder, texc
        self.meta = json.load(open(os.path.join(folder, 'parts.json'))); z = np.load(os.path.join(folder, 'parts.npz')); self.z = Z({k: z[k] for k in z.files})
        self.g = GLB(); self.tx = {}
        self.char = skeleton(self.g, self.meta['bones'], self.meta['person'])

    # ---- pictures
    def texture(self, key, maker, wrap='repeat'):
        if key not in self.tx: data, mime = maker(); self.tx[key] = self.g.texture(self.g.image(data, mime, key), wrap)
        return self.tx[key]
    def pic(self, path, size, kind='jpg', q=86):
        im = Image.open(path); im = im.convert('RGBA' if kind == 'png' else 'RGB').resize((size, size), Image.LANCZOS)
        return GT.enc(im, kind, q)

    def material(self, m, name):
        g = self.g; k = m['kind']
        if k == 'bake':
            t = self.texture(m['img'], lambda: self.pic(os.path.join(self.folder, m['img']), 1024 if m['img'] in ('skin.png', 'face.png') else 512, 'jpg', 88))
            return g.material(name, [1, 1, 1, 1], t, 0, None, rough=m.get('rough', .55), double=m['img'] not in ('skin.png', 'face.png'), extras=dict(skin=1) if m['img'] == 'skin.png' else None)
        if k == 'flat': return g.material(name, list(m['color']) + [1], None, rough=float(m['rough']))
        if k == 'image':
            src = os.path.join(self.folder, m['img'])
            if not os.path.exists(src):   # (everyone's trainers use the same picture)
                src = next((q for q in (os.path.join(os.path.dirname(self.folder), d, m['img']) for d in sorted(os.listdir(os.path.dirname(self.folder)))) if os.path.exists(q)), src)
            t = self.texture(m['img'], lambda: self.pic(src, 512, 'jpg', 85))
            return g.material(name, [1, 1, 1, 1], t, 0, None, rough=m.get('rough', .6))
        if k == 'eye':
            e = self.meta.get('eye') or {}
            t = self.texture('iris', lambda: iris_pic(m['iris'], k=e.get('k', 1.), white=e.get('white')), 'clamp')
            return g.material(name, [1, 1, 1, 1], t, 0, None, rough=.15, double=True)
        if k == 'hair':
            t = self.texture(m['img'], lambda: hair_pic(os.path.join(self.folder, m['img']), m))
            nrm = self.texture(m['normal'], lambda: self.pic(os.path.join(self.folder, m['normal']), 512, 'jpg', 90)) if m.get('normal') else None
            return g.material(name, [1, 1, 1, 1], t, 0, None, rough=float(m.get('rough', .55)), normal=nrm, normal_scale=.8, alpha='MASK' if m.get('alpha') else None, cutoff=.32, double=True)
        if k == 'cloth': return self.cloth(m, name)
        raise ValueError(k)

    def cloth(self, m, name):
        g = self.g; s = m['spec']; role = m.get('role')
        color = lin_hex(s['color']) if s.get('color') else [1, 1, 1, 1]
        rough, metal = float(s.get('rough', .7)), float(s.get('metal', 0.))
        if s.get('stripes'):
            t = self.texture(f'stripes_{s["color"]}_{s["stripes"]}', lambda: GT.joggers_stripes(512, 16, s['color'], s['stripes']))
            return g.material(name, [1, 1, 1, 1], t, 1, None, rough=rough, extras=dict(fabric=role))
        if s.get('img'):
            tile = float(s.get('tile', .3)); big = s['img'].startswith('ankara')
            t = self.texture(s['img'] + s.get('tint', ''), lambda: fabric_pic(os.path.join(self.texc, s['img']), 512, s.get('tint')))
            nrm = None
            if s.get('bump_img'): nrm = self.texture(s['bump_img'] + '_n', lambda: GT.height_normal(os.path.join(self.texc, s['bump_img']), 512, 2.))
            return g.material(name, [1, 1, 1, 1], t, 0, (1 / tile, 1 / tile), rough=rough, metal=metal, normal=nrm, normal_scale=.6, extras=dict(fabric=role))
        return g.material(name, color, None, rough=rough, metal=metal, extras=dict(fabric=role))

    # ---- meshes
    def mesh(self, name, prims, extras=None):
        g = self.g; out = []
        for d, T, mat, attrs in prims:
            a = dict(POSITION=g.acc(gl(d['P']), 'VEC3', 34962, minmax=True), NORMAL=g.acc(gl(d['N']), 'VEC3', 34962))
            for k, v in attrs.items(): a[k] = g.acc(np.asarray(v, np.float32), {1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4'}[1 if v.ndim == 1 else v.shape[1]], 34962)
            a['JOINTS_0'] = g.acc(d['JI'].astype(np.uint8), 'VEC4', 34962); a['WEIGHTS_0'] = g.acc(d['JW'].astype(np.float32), 'VEC4', 34962)
            it = T.astype(np.uint16 if len(d['P']) < 65536 else np.uint32).ravel()
            out.append(dict(attributes=a, indices=g.acc(it, 'SCALAR', 34963), material=mat))
        g.js['meshes'].append(dict(name=name, primitives=out))
        n = g.node(name=name, mesh=len(g.js['meshes']) - 1, skin=0, extras=extras)
        g.js['nodes'][self.char]['children'].append(n); return n

    def add(self, p, name, uvmaps=('UVMap',), extra=None, uv_fn=None, mats=None):
        part = Part(self.z, p['key'])
        mats = mats if mats is not None else [self.material(m, f'{self.meta["id"]}_{name}_{i}') for i, m in enumerate(p['mats'])]
        prims = []
        for mi in sorted(set(part.MI.tolist())):
            polys = np.nonzero(part.MI == mi)[0]
            if uv_fn: uvs = uv_fn(part)
            else: uvs = [part.uv[u] if u in part.uv else np.zeros((len(part.L), 2), np.float32) for u in uvmaps]
            d, T = weld(part, uvs, extra_v=extra, polys=polys)
            attrs = {}
            for i, u in enumerate(d['UV']): attrs[f'TEXCOORD_{i}'] = np.stack([u[:, 0], 1 - u[:, 1]], 1)
            if extra is not None:   # which outfits cover each vertex, as bytes in a second colour set (gltfpack keeps it; the game reads it back)
                h = d['X'].astype(np.int64); attrs['COLOR_1'] = np.stack([(h & 255) / 255., (h >> 8 & 255) / 255., (h >> 16 & 255) / 255., np.ones(len(h))], 1).astype(np.float32)   # blue: outfits 16-23
            prims.append((d, T, mats[min(mi, len(mats) - 1)], attrs))
        return self.mesh(name, prims)

def fabric_pic(path, size, tint=None):
    im = Image.open(path).convert('RGB').resize((size, size), Image.LANCZOS)
    if tint:
        a = GT.lin(GT.arr(im)) * np.array(lin_hex(tint)[:3])[None, None]; im = GT.img(GT.srgb(a))
    return GT.enc(im, 'jpg', 86)

def hair_pic(path, m, size=1024):
    im = Image.open(path).convert('RGBA'); im = im.resize((min(size, im.width), min(size, im.height)), Image.LANCZOS)
    a = np.asarray(im, np.float32) / 255.; rgb = GT.lin(a[..., :3])
    if m.get('tint') is not None:
        bw = rgb @ np.array([.2126, .7152, .0722]); tint = np.array(m['tint'][:3])
        if m.get('range'): r0, r1 = m['range']; f = np.clip(r0 + bw * (r1 - r0), min(r0, r1), max(r0, r1)); rgb = tint[None, None] * f[..., None]
        else: rgb = bw[..., None] * tint[None, None]
    out = np.concatenate([GT.srgb(rgb), a[..., 3:4] if m.get('alpha') else np.ones_like(a[..., 3:4])], 2)
    return GT.enc(Image.fromarray((np.clip(out, 0, 1) * 255 + .5).astype(np.uint8), 'RGBA'), 'png')

def iris_pic(iris, size=256, k=1., white=None):
    """the eye seen from the front: the Blender colour ramp over the angle from the front of the eyeball"""
    wh = tuple(white or (.62, .58, .54))
    stops = [(0., (.004, .003, .003)), (.2 * k, (.004, .003, .003)), (.24 * k, tuple(c * 1.6 for c in iris)), (.4 * k, tuple(iris)), (.47 * k, (.008, .005, .004)), (.53 * k, wh), (1.6, tuple(c * 1.06 for c in wh))]
    yy, xx = np.mgrid[0:size, 0:size]; r = np.hypot(xx + .5 - size / 2, yy + .5 - size / 2) / (size / 2); ang = r * (math.pi / 2)
    out = np.zeros((size, size, 3))
    for (a0, c0), (a1, c1) in zip(stops, stops[1:]):
        m = (ang >= a0) & (ang < a1); t = (ang[m] - a0) / (a1 - a0); t = t * t * (3 - 2 * t)
        out[m] = np.array(c0) * (1 - t[:, None]) + np.array(c1) * t[:, None]
    out[ang >= stops[-1][0]] = stops[-1][1]
    return GT.enc(GT.img(GT.srgb(out)), 'png')

def eye_uv(part):
    """each corner's place on the iris picture, from its eyeball's front"""
    P = part.V; cx = P[:, 0].mean(); uv = np.zeros((len(P), 2), np.float32); a = part.attr['eye_a']
    for m in (P[:, 0] < cx, P[:, 0] >= cx):
        c = P[m].mean(0); d = P[m] - c; d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
        s = np.hypot(d[:, 0], d[:, 2]) + 1e-9; r = np.minimum(a[m] / (math.pi / 2), 1.) * .5
        uv[m, 0] = .5 + r * d[:, 0] / s; uv[m, 1] = .5 + r * d[:, 2] / s
    return uv[part.L]

def stripes_uv(part):
    """legs' design uv for the side stripes (as build_char.py): the right leg mirrored so both stripes sit outside, the waist plain"""
    du = part.uv['Design'].copy(); pc = part.attr['part'][part.L]
    du[pc == 4, 0] = 1 - du[pc == 4, 0]; du[pc == 0] = (.5, .5)
    return [part.uv['UVMap'], du]

# ------------------------------------------------------------------ the skin each outfit hides (as build_char.covered_by)
def boundary(F, n):
    cnt = {}
    for f in F:
        for a, b in zip(f, f[1:] + f[:1]): k = (min(a, b), max(a, b)); cnt[k] = cnt.get(k, 0) + 1
    m = np.zeros(n, bool)
    for (a, b), c in cnt.items():
        if c == 1: m[a] = m[b] = True
    return m

def covered(V, N, P, F, tube=None, near=.045, edge=.025, pad=.012):
    if tube:
        R, K = tube; G3 = P.reshape(R, K, 3); zs = G3[:, 0, 2]; out = np.zeros(len(V), bool)
        z_hi, z_lo = zs.max() - .015, zs.min() + .025
        for i in np.nonzero((V[:, 2] < z_hi) & (V[:, 2] > z_lo))[0]:
            z = V[i, 2]; r = np.searchsorted(-zs, -z); r = min(max(r, 1), R - 1)
            t = (zs[r - 1] - z) / max(zs[r - 1] - zs[r], 1e-6); ring = G3[r - 1] * (1 - t) + G3[r] * t
            c = ring[:, :2].mean(0); d = V[i, :2] - c; ang = math.atan2(d[0], -d[1])
            rr = np.linalg.norm(ring[:, :2] - c, axis=1); ra = np.arctan2(ring[:, 0] - c[0], -(ring[:, 1] - c[1]))
            k = np.argmin(np.abs((ra - ang + math.pi) % (2 * math.pi) - math.pi)); out[i] = np.linalg.norm(d) < rr[k] + pad
        return out
    dist, idx = cKDTree(P).query(V)
    outside = ((P[idx] - V) * N).sum(1) > -.002
    bp = P[boundary(F, len(P))]
    de = cKDTree(bp).query(P[idx])[0] if len(bp) else np.full(len(V), 1.)
    return (dist < near) & outside & (de > edge)

def build(folder, texc, out_dir):
    Wm = Woman(folder, texc); meta = Wm.meta; parts = meta['parts']; nout = len(meta['outfits'])
    body = next(p for p in parts if p['kind'] == 'body'); B = Part(Wm.z, body['key']); BF = B.faces()
    BN = G.vnormals(B.V.astype(float), BF)
    hide = np.zeros(len(B.V), np.int64)
    for p in parts:
        k = p['kind']; ois = [p['outfit']] if k == 'cloth' else p.get('outfits', []) if k == 'shoe' else []
        if not ois or p.get('piece') in NO_HIDE: continue
        Q = Part(Wm.z, p['key']); tube = None
        if p.get('piece') in TUBES and len(Q.V) % 72 == 0: tube = (len(Q.V) // 72, 72)
        c = covered(B.V, BN, Q.V, Q.faces(), tube, **(dict(near=.05, edge=.02) if k == 'shoe' else {}))
        for oi in ois: hide[c] |= 1 << oi
    # where the head's neck meets the body (the men's head is zipped onto the body's own edge): one normal for both, no seam
    hp = next((p for p in parts if p['kind'] == 'head'), None)
    if hp:
        H = Part(Wm.z, hp['key']); bc, hc = B.V[B.L], H.V[H.L]; tr = cKDTree(hc); d, j = tr.query(bc)
        m = d < 1e-5
        if m.sum():
            Nb = B.N[m]; Nh = H.N[j[m]]; avg = Nb + Nh; avg /= np.linalg.norm(avg, axis=1, keepdims=True) + 1e-12
            B.N[m] = avg; H.N[j[m]] = avg
            Wm.z[f"{body['key']}_N"] = B.N; Wm.z[f"{hp['key']}_N"] = H.N
            print('  neck seam: one normal for', int(m.sum()), 'corners')
    # the parts
    Wm.add(body, 'body', extra=hide.astype(np.float64))
    for p in parts:
        k = p['kind']
        if k == 'body': continue
        if k in ('head', 'brows', 'liner', 'scalp'): Wm.add(p, k)
        elif k == 'eyes': Wm.add(p, 'eyes', uv_fn=lambda q: [eye_uv(q)])
        elif k == 'hair': Wm.add(p, 'hair~' + ''.join(B36[OUT_IDX[meta['id']][o]] for o in p.get('hide', [])) + '~' + p['name'].split('.')[-1].replace(' ', '_'))
        elif k == 'cloth':
            striped = any(m.get('spec', {}).get('stripes') for m in p['mats'])
            Wm.add(p, f'o{B36[p["outfit"]]}~{p["piece"]}', uvmaps=('UVMap', 'Design'), uv_fn=stripes_uv if striped else None)
        elif k == 'shoe': Wm.add(p, f'shoe{"".join(B36[i] for i in p["outfits"])}~{p["shoe"]}')
    hips = next(b for b in meta['bones'] if b['name'].endswith('Hips'))['head'][2]
    Wm.g.js['scenes'][0]['extras'] = dict(person=meta['person'], id=meta['id'], male=bool(meta.get('male')), outfits=meta['outfits'], height=float(B.V[:, 2].max()), hips=float(hips),
                                         skin='#' + ''.join('%02x' % int(GT.srgb(np.array(c)) * 255) for c in meta['skin']))
    path = os.path.join(out_dir, meta['id'] + '.glb'); size = Wm.g.save(path)
    covered_n = [int(((hide >> i) & 1).sum()) for i in range(nout)]
    print(meta['person'], '->', path, round(size / 1e6, 2), 'MB; skin hidden per outfit', covered_n)
    return path

OUT_IDX = {}
if __name__ == '__main__':
    exp, texc, out = sys.argv[1:4]; names = sys.argv[4:] or sorted(os.listdir(exp)); os.makedirs(out, exist_ok=True)
    for n in names:
        m = json.load(open(os.path.join(exp, n, 'parts.json'))); OUT_IDX[m['id']] = {o['id']: i for i, o in enumerate(m['outfits'])}
        build(os.path.join(exp, n), texc, out)
