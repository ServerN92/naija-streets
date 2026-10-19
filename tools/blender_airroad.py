"""Naija Streets: the airport road, made in a background Blender (tools/blender_rooms/life_job.py, job 'road'), so the
Blender the user has open is never touched.

From the end of Agege Motor Road to the terminal: a dual carriageway that carries on Agege Motor Road's two carriageways,
a raised kerb painted black and white round a green grass median, a row of palm trees on it and double street lamps
between them, clean asphalt (wheel paths, a little dust at the kerbs), lane lines, SLOW and arrows painted on the road,
kerbs, drains and paved (interlocking) sidewalks, openings for the link road, the impound yard and the car park aisles,
and the drop-off road in front of the terminal. The palm is the Sketchfab palm already in the user's Naija Ground
(CT_L_palm), appended read-only from naija_ground.blend (that file is never saved).

Frame: the game's, around (AIRPORT.TX, AIRPORT.TZ): lx = x - TX (east), lz = z - TZ (toward the city). In Blender a
point is (lx, -lz, y), so the glTF export (Y up) gives back (lx, y, lz).

Out (Documents/naija_rooms/life/road/):
  set_airroad.glb            the road: own materials, WebP textures, Draco
  set_airroad.json           palms [lx, lz, yaw, scale], lamps [lx, lz], median boxes [cx, cz, hx, hz] (cars only), the frame
  ns_palm.glb, ns_palm_lod1.glb   the palm (trunk + leaves, textured), its foot at the origin
  look_*.png                 pictures (EEVEE), naija_airroad.blend
"""
import bpy, bmesh, os, json, math, random, time
import numpy as np
from mathutils import Vector

HOME = os.path.expanduser('~')
TEXSRC = os.path.join(HOME, 'Documents', 'naija_ground', 'tex')
NGB = os.path.join(HOME, 'Documents', 'naija_ground', 'naija_ground.blend')
OUT = os.path.join(HOME, 'Documents', 'naija_rooms', 'life', 'road'); TEX = os.path.join(OUT, 'tex')
LOG = [print]

# ------------------------------------------------------------------ the layout (metres in the game frame)
LZ_CITY = 420.0            # the map's edge, where Agege Motor Road's two carriageways end (st.z - TZ)
LZ_LINK = 390.0            # the link road from the street end comes in from the east here (HZ - TZ), 8 m wide
HAND_LX = 106.38           # ... from the street end at the map's edge 106 m east (AIRPORT.hand), then north into the city
LZ_TOLL = 189.0            # the toll plaza (TPZ - TZ): islands from 198 to 182.5, its walkway 213..171 (east)
LZ_DROP = 64.0             # the drop-off road in front of the terminal: lz 48..64, x -150..150
AISLES = ((79.2, 72.2), (96.6, 89.6))          # the car park aisles reach the road here (both sides)
IMP = (223.5, 214.0, 23.5)                     # the driveway to the impound yard's gate (east): lz from, to, x end
SW_OUT = 12.0                                  # sidewalks reach 12 m out (the car park starts there)
Y_ROAD, Y_PAINT, Y_KERB, Y_GRASS, Y_PAVE = .02, .034, .2, .17, .15


def ramp(z, z0, z1, a, b):
    """a north of z0, b south of z1, straight between (z0 > z1)"""
    if z >= z0: return a
    if z <= z1: return b
    return a + (b - a) * (z0 - z) / (z0 - z1)


def HW(z):
    """the median's half width: 3.5 m wide, narrowing into the toll's centre island (1.2 m) and opening out again"""
    if z > 205: return ramp(z, 245, 205, 1.75, .6)
    if z > 176: return .6
    return ramp(z, 176, 150, .6, 1.75)


def EDGE(z):
    """the carriageway's outer edge (7.5 m from the median), a little wider through the toll plaza"""
    if z > 216: return ramp(z, 231, 216, 9.25, 9.8)
    return ramp(z, 168, 153, 9.8, 9.25)


def DIV(z, s):
    """the lane line: into the toll lanes (inbound islands at 4.6, the exit lanes' island at -4.4)"""
    t = 4.6 if s > 0 else 4.4
    if z > 213: return ramp(z, 245, 213, 5.5, t)
    return ramp(z, 171, 150, t, 5.5)


# median pieces: (north end, south end, round nose north, round nose south); the toll ends are square, against the islands
PIECES = [(LZ_CITY, LZ_LINK + 6.0, True, True), (LZ_LINK - 6.0, 198.9, True, False), (182.6, AISLES[1][0], False, True),
          (AISLES[1][1], AISLES[0][0], True, True)]
# where the outer kerb and sidewalk stop: (from, to) going south
CUTS = {1: [(LZ_LINK + 4.0, LZ_LINK - 4.0), (IMP[0], 171.0), AISLES[1], AISLES[0]], -1: [AISLES[1], AISLES[0]]}


def zs(z0, z1, step=2.0, extra=()):
    """sample points from z0 south to z1 (inclusive), with the layout's break points"""
    out = {round(z0, 3), round(z1, 3)}
    k = math.floor(z0 / step) * step
    while k > z1:
        if k < z0: out.add(round(k, 3))
        k -= step
    for b in (245, 231, 216, 213, 205, 176, 171, 168, 153, 150) + tuple(extra):
        if z1 < b < z0: out.add(float(b))
    return sorted(out, reverse=True)


# ------------------------------------------------------------------ textures (made from the user's Poly Haven set)
def src_px(name):
    im = bpy.data.images.load(os.path.join(TEXSRC, name)); w, h = im.size
    a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a); bpy.data.images.remove(im)
    return a.reshape(h, w, 4)


def down(a, f):
    """shrink by f, as if the picture were 2048 px (a 4096 px one shrinks twice as much)"""
    f = max(1, f * a.shape[1] // 2048); h, w, c = a.shape
    return a.reshape(h // f, f, w // f, f, c).mean(axis=(1, 3))


def noise(n, sigma, seed):
    """n x n smooth noise that tiles, unit spread"""
    r = np.random.default_rng(seed).standard_normal((n, n)); f = np.fft.fftfreq(n)
    g = np.exp(-2 * (np.pi * sigma) ** 2 * (f[:, None] ** 2 + f[None, :] ** 2))
    o = np.real(np.fft.ifft2(np.fft.fft2(r) * g)); return (o - o.mean()) / (o.std() + 1e-9)


def blur(a, sigma):
    """blur a 2-D array that tiles"""
    h, w = a.shape; fy = np.fft.fftfreq(h); fx = np.fft.fftfreq(w)
    g = np.exp(-2 * (np.pi * sigma) ** 2 * (fy[:, None] ** 2 + fx[None, :] ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def save_img(rgb, name, nonc=False):
    h, w, _ = rgb.shape; a = np.ones((h, w, 4), np.float32); a[..., :3] = np.clip(rgb, 0, 1)
    im = bpy.data.images.new(name, w, h, alpha=False); im.pixels.foreach_set(a.ravel())
    im.filepath_raw = os.path.join(TEX, name + '.png'); im.file_format = 'PNG'; im.save()
    if nonc: im.colorspace_settings.name = 'Non-Color'
    return im


def textures():
    T = {}
    N = 1024
    # asphalt: fresh, fine and dark grey (asphalt_track's grain), tiles of 1.875 m, the picture covers 7.5 m x 7.5 m
    base = down(src_px('asphalt_track_diff.jpg'), 8)[..., :3]; base = np.tile(base, (4, 4, 1))
    lum = base.mean(-1); g = (lum - lum.mean()) / lum.std()
    low = noise(N, 60, 1); mid = noise(N, 9, 2)
    asph = np.array([.255, .258, .265])[None, None, :] * (1 + .17 * g[..., None]) * (1 + .045 * low[..., None] + .02 * mid[..., None])
    nor = np.tile(down(src_px('asphalt_track_nor.jpg'), 8)[..., :3], (4, 4, 1))
    T['asph'] = save_img(asph * (1 + .025 * noise(N, 25, 3)[..., None]), 'ar_asphalt')
    T['asph_n'] = save_img(down(nor, 2), 'ar_asphalt_n', True)
    # the carriageway: the same, with the wheel paths of two lanes, a faint oil line down each lane and dust at the edges
    um = (np.arange(N) + .5) / N * 7.5
    band = lambda c, s: np.exp(-((um - c) ** 2) / (2 * s * s))[None, :]
    wob = 1 + .35 * noise(N, 14, 4)
    wheel = sum(band(c, .24) for c in (1.05, 2.7, 4.8, 6.45)) * wob
    oil = sum(band(c, .17) for c in (1.875, 5.625)) * np.clip(noise(N, 3, 5) * .6 + .5, 0, 1)
    dust = np.clip((um - 6.95) / .55, 0, 1)[None, :] ** 1.5 * .5 + np.clip((.35 - um) / .35, 0, 1)[None, :] * .25
    lane = asph * (1 - .085 * wheel[..., None] - .06 * oil[..., None])
    dc = np.array([.44, .41, .36])[None, None, :]
    lane = lane * (1 - dust[..., None]) + dc * (1 + .15 * g[..., None]) * dust[..., None]
    T['lane'] = save_img(lane, 'ar_lane')
    # kerb, painted black and white in 1 m blocks: u along 2 m, v round the kerb (side face 0..0.44, top 0.44..1)
    conc = down(src_px('concrete_wall_007_diff.jpg'), 4)[:256, :512, :3]
    cl = conc.mean(-1); cg = (cl - cl.mean()) / cl.std()
    u = (np.arange(512) + .5) / 512; v = (np.arange(256) + .5) / 256
    white = (u[None, :] < .5)
    wear = np.clip((noise(512, 2.5, 6)[:256, :] - 1.9) * 2, 0, 1) * (1 - .6 * np.clip((v[:, None] - .44) * 4, 0, 1))
    paint = np.where(white[..., None], np.array([.9, .9, .87]) * (.9 + .08 * cg[..., None]), np.array([.07, .07, .075]) * (.9 + .25 * cg[..., None]))
    concc = np.array([.62, .61, .58])[None, None, :] * (1 + .12 * cg[..., None])
    kerb = paint * (1 - wear[..., None]) + concc * wear[..., None]
    grime = np.clip((.12 - v) / .12, 0, 1)[:, None, None] * .45
    kerb = kerb * (1 - grime) + np.array([.24, .22, .2]) * grime
    T['kerb'] = save_img(kerb, 'ar_kerb')
    # plain concrete (the outer kerbs, edging, plinths)
    conc2 = down(src_px('concrete_wall_007_diff.jpg'), 4)[..., :3]; c2 = conc2.mean(-1); c2g = (c2 - c2.mean()) / c2.std()
    T['conc'] = save_img(np.array([.68, .67, .64])[None, None, :] * (1 + .1 * c2g[..., None]), 'ar_concrete')
    # grass in the median: well kept, green (leafy_grass, recoloured)
    gr = down(src_px('leafy_grass_diff.jpg'), 2)[..., :3]; gl = gr.mean(-1); gk = gl / gl.mean()
    tgt = np.array([.25, .42, .13])
    grass = .72 * tgt * gk[..., None] ** .9 + .28 * gr * (tgt.mean() / gr.mean())
    grass *= (1 + .06 * noise(N, 40, 7))[..., None]
    T['grass'] = save_img(grass, 'ar_grass')
    T['grass_n'] = save_img(down(src_px('leafy_grass_nor.jpg'), 4)[..., :3], 'ar_grass_n', True)
    # sidewalk: interlocking paving stones, charcoal and terracotta (patterned_paving, recoloured)
    pv = down(src_px('patterned_paving_diff.jpg'), 2)[..., :3]; pl = pv.mean(-1)
    blue = blur(pv[..., 2] - pv[..., 0], 4) > 0
    m1 = pl[blue].mean(); m2 = pl[~blue].mean()
    k = np.where(blue, pl / m1, pl / m2); k = np.clip(k, .25, 1.6)
    pave = np.where(blue[..., None], np.array([.42, .43, .44]), np.array([.6, .35, .27])) * k[..., None]
    T['pave'] = save_img(pave, 'ar_paving')
    T['pave_n'] = save_img(down(src_px('patterned_paving_nor.jpg'), 4)[..., :3], 'ar_paving_n', True)
    # soil round the palms
    T['soil'] = save_img(down(src_px('gravel_diff.jpg'), 8)[..., :3] * .9, 'ar_soil')
    return T


def lin(c): return tuple(x ** 2.2 for x in c)


def material(name, img=None, nor=None, color=(1, 1, 1), rough=.85, metal=0.0, emit=None, nstr=.7):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if img:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    else:
        b.inputs['Base Color'].default_value = (*lin(color), 1)
    if nor:
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = nor; nor.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = nstr
        nt.links.new(n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if emit:
        b.inputs['Emission Color'].default_value = (*lin(emit), 1); b.inputs['Emission Strength'].default_value = 6.0
    return m


# ------------------------------------------------------------------ building: faces in the game frame -> one Blender mesh
class Acc:
    def __init__(s, name): s.name = name; s.faces = []; s.mats = []

    def face(s, pts, uvs, mat, up=None, smooth=False):
        P = [Vector((p[0], -p[1], p[2])) for p in pts]
        if up is not None:
            n = Vector((0, 0, 0))
            for i in range(len(P)):
                a, b = P[i], P[(i + 1) % len(P)]
                n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y)
            if n.dot(Vector((up[0], -up[1], up[2]))) < 0: P = P[::-1]; uvs = uvs[::-1]
        if mat not in s.mats: s.mats.append(mat)
        s.faces.append((P, list(uvs), s.mats.index(mat), smooth))

    def build(s, merge=False):
        me = bpy.data.meshes.new(s.name); bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
        for P, uvs, mi, sm in s.faces:
            try: f = bm.faces.new([bm.verts.new(p) for p in P])
            except ValueError: continue
            f.material_index = mi; f.smooth = sm
            for l, uv in zip(f.loops, uvs): l[uvl].uv = uv
        if merge: bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=.0005)
        bm.normal_update(); bm.to_mesh(me); bm.free()
        for m in s.mats: me.materials.append(m)
        ob = bpy.data.objects.new(s.name, me); bpy.context.scene.collection.objects.link(ob); return ob


UP = (0, 0, 1)


def strip(A, xa, xb, za, zb, y, mat, uvf, extra=()):
    """a flat surface between x = xa(z) and x = xb(z), from za south to zb"""
    Z = zs(za, zb, extra=extra)
    for z0, z1 in zip(Z, Z[1:]):
        pts = [(xa(z0), z0, y), (xb(z0), z0, y), (xb(z1), z1, y), (xa(z1), z1, y)]
        A.face(pts, [uvf(p[0], p[1]) for p in pts], mat, UP)


def kerb(A, pts, body, w, top, inner, mat, closed=False, uvlen=2.0, y0=Y_ROAD - .01, ends=True):
    """a kerb along a line of points [(x, z)]: the face toward the road on the line, the body on side `body` (+1 = left of
    the direction of travel... chosen by the caller), a top w wide at `top`, a small step down to `inner` behind it"""
    n = len(pts); P = pts + ([pts[0]] if closed else [])
    seg = [(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]) for i in range(len(P) - 1)]
    def nrm(d):
        L = math.hypot(*d) or 1; return (d[1] / L * body, -d[0] / L * body)
    N = []
    for i in range(len(P)):
        ds = []
        if i > 0: ds.append(seg[i - 1])
        elif closed: ds.append(seg[-1])
        if i < len(seg): ds.append(seg[i])
        elif closed: ds.append(seg[0])
        ns = [nrm(d) for d in ds]; nx = sum(q[0] for q in ns); nz = sum(q[1] for q in ns); L = math.hypot(nx, nz) or 1
        nx, nz = nx / L, nz / L; c = max(.5, nx * ns[0][0] + nz * ns[0][1]); N.append((nx / c, nz / c))
    s = 0.0; S = [0.0]
    for d in seg: s += math.hypot(*d); S.append(s)
    for i in range(len(P) - 1):
        (x0, z0), (x1, z1) = P[i], P[i + 1]; (a0, b0), (a1, b1) = N[i], N[i + 1]
        u0, u1 = S[i] / uvlen, S[i + 1] / uvlen
        q0 = (x0 + a0 * w, z0 + b0 * w); q1 = (x1 + a1 * w, z1 + b1 * w)
        mx, mz = (x0 + x1) / 2, (z0 + z1) / 2; fx, fz = -(a0 + a1) / 2, -(b0 + b1) / 2
        A.face([(x0, z0, y0), (x1, z1, y0), (x1, z1, top), (x0, z0, top)], [(u0, 0), (u1, 0), (u1, .44), (u0, .44)], mat, (fx, fz, 0))
        A.face([(x0, z0, top), (x1, z1, top), (q1[0], q1[1], top), (q0[0], q0[1], top)], [(u0, .44), (u1, .44), (u1, 1), (u0, 1)], mat, UP)
        if inner < top - .001:
            A.face([(q0[0], q0[1], top), (q1[0], q1[1], top), (q1[0], q1[1], inner), (q0[0], q0[1], inner)], [(u0, 1), (u1, 1), (u1, .95), (u0, .95)], mat, (-fx, -fz, 0))
    if ends and not closed:
        for i, sgn in ((0, 1), (len(P) - 1, -1)):
            (x, z), (a, b) = P[i], N[i]; d = seg[0] if i == 0 else seg[-1]; L = math.hypot(*d) or 1
            A.face([(x, z, y0), (x + a * w, z + b * w, y0), (x + a * w, z + b * w, top), (x, z, top)], [(0, 0), (.1, 0), (.1, .44), (0, .44)], mat, (-d[0] / L * sgn, -d[1] / L * sgn, 0))


def box(A, x0, x1, z0, z1, y0, y1, mat, uvs=1.0, top=True, bottom=False):
    xa, xb = sorted((x0, x1)); za, zb = sorted((z0, z1))
    uv = lambda a, b: (a / uvs, b / uvs)
    for (pa, pb, nn) in (((xa, za), (xb, za), (0, -1)), ((xb, za), (xb, zb), (1, 0)), ((xb, zb), (xa, zb), (0, 1)), ((xa, zb), (xa, za), (-1, 0))):
        L = math.hypot(pb[0] - pa[0], pb[1] - pa[1])
        A.face([(pa[0], pa[1], y0), (pb[0], pb[1], y0), (pb[0], pb[1], y1), (pa[0], pa[1], y1)], [uv(0, y0), uv(L, y0), uv(L, y1), uv(0, y1)], mat, (nn[0], nn[1], 0))
    if top: A.face([(xa, za, y1), (xb, za, y1), (xb, zb, y1), (xa, zb, y1)], [uv(xa, za), uv(xb, za), uv(xb, zb), uv(xa, zb)], mat, UP)
    if bottom: A.face([(xa, za, y0), (xb, za, y0), (xb, zb, y0), (xa, zb, y0)], [uv(xa, za)] * 4, mat, (0, 0, -1))


def cyl(A, cx, cz, y0, y1, r0, r1, mat, n=10, cap=True):
    for i in range(n):
        t0, t1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
        p = lambda t, r, y: (cx + r * math.cos(t), cz + r * math.sin(t), y)
        A.face([p(t0, r0, y0), p(t1, r0, y0), p(t1, r1, y1), p(t0, r1, y1)], [(i / n, 0), ((i + 1) / n, 0), ((i + 1) / n, 1), (i / n, 1)], mat,
               (math.cos((t0 + t1) / 2), math.sin((t0 + t1) / 2), 0), smooth=True)
    if cap: A.face([(cx + r1 * math.cos(2 * math.pi * i / n), cz + r1 * math.sin(2 * math.pi * i / n), y1) for i in range(n)], [(0, 0)] * n, mat, UP)


def tube(A, path, r, mat, n=8):
    """a round bar along a 3-D path [(x, z, y)]"""
    rings = []
    for i, p in enumerate(path):
        a = Vector(path[max(0, i - 1)]); b = Vector(path[min(len(path) - 1, i + 1)]); t = (b - a).normalized()
        side = t.cross(Vector((0, 0, 1))); side = side.normalized() if side.length > 1e-4 else Vector((1, 0, 0)); upv = side.cross(t)
        rings.append([Vector(p) + (side * math.cos(2 * math.pi * k / n) + upv * math.sin(2 * math.pi * k / n)) * r for k in range(n)])
    for i in range(len(rings) - 1):
        for k in range(n):
            a, b, c, d = rings[i][k], rings[i][(k + 1) % n], rings[i + 1][(k + 1) % n], rings[i + 1][k]
            ctr = (a + b + c + d) / 4 - (Vector(path[i]) + Vector(path[i + 1])) / 2
            A.face([tuple(a), tuple(b), tuple(c), tuple(d)], [(0, 0)] * 4, mat, tuple(ctr), smooth=True)


# ------------------------------------------------------------------ the road
def road(M):
    R = Acc('AR_Road'); L = Acc('AR_Lamps'); info = {'palms': [], 'lamps': [], 'median': []}
    lane_uv = lambda x, z: ((abs(x) - 1.75) / 7.5, z / 7.5)
    gen_uv = lambda x, z: (x / 7.5, z / 7.5)
    # 1. the carriageways, from the median line out to the kerbs, all the way from the city to the drop-off road
    for s in (1, -1):
        strip(R, lambda z: 0.0, lambda z, s=s: s * EDGE(z), LZ_CITY, LZ_DROP, Y_ROAD, M['lane'], lane_uv)
    # 2. asphalt where the kerbs open: the link road (east), the impound driveway, the car park aisles
    strip(R, lambda z: EDGE(z), lambda z: HAND_LX + 4, LZ_LINK + 4, LZ_LINK - 4, Y_ROAD, M['asph'], gen_uv)
    strip(R, lambda z: HAND_LX - 4, lambda z: HAND_LX + 4, LZ_CITY + 4, LZ_LINK + 4, Y_ROAD, M['asph'], gen_uv)
    strip(R, lambda z: EDGE(z), lambda z: IMP[2], IMP[0], IMP[1], Y_ROAD, M['asph'], gen_uv)
    for (a, b) in AISLES:
        for s in (1, -1): strip(R, lambda z, s=s: s * EDGE(z), lambda z, s=s: s * SW_OUT, a, b, Y_ROAD, M['asph'], gen_uv)
    # 3. the drop-off road in front of the terminal
    for x0, x1 in ((-150, -9.25), (-9.25, 9.25), (9.25, 150)):
        pts = [(x0, LZ_DROP, Y_ROAD), (x1, LZ_DROP, Y_ROAD), (x1, 48.0, Y_ROAD), (x0, 48.0, Y_ROAD)]
        R.face(pts, [gen_uv(p[0], p[1]) for p in pts], M['asph'], UP)
    # 4. outer kerbs and sidewalks (interlocking stones), stopped at the openings
    for s in (1, -1):
        cuts = sorted(CUTS[s], reverse=True); runs = []; z = LZ_CITY
        for (a, b) in cuts: runs.append((z, a)); z = b
        runs.append((z, LZ_DROP + .2))
        for (za, zb) in runs:
            if za - zb < .5: continue
            Z = zs(za, zb, 4.0)
            line = [(s * EDGE(q), q) for q in Z]
            kerb(R, line, -s, .2, .17, Y_PAVE, M['conc'], uvlen=2.0)   # the body away from the road
            strip(R, lambda q, s=s: s * (EDGE(q) + .2), lambda q, s=s: s * SW_OUT, za, zb, Y_PAVE, M['pave'], lambda x, z: (x / 2.4, z / 2.4))
            for q0, q1 in zip(Z, Z[1:]):   # the outer edge of the paving
                R.face([(s * SW_OUT, q0, 0), (s * SW_OUT, q1, 0), (s * SW_OUT, q1, Y_PAVE), (s * SW_OUT, q0, Y_PAVE)], [(q0 / 2, 0), (q1 / 2, 0), (q1 / 2, .08), (q0 / 2, .08)], M['conc'], (s, 0, 0))
            for q in (za, zb):              # the ends of the paving at the openings
                d = 1 if q == za else -1
                R.face([(s * (EDGE(q) + .2), q, Y_ROAD), (s * SW_OUT, q, Y_ROAD), (s * SW_OUT, q, Y_PAVE), (s * (EDGE(q) + .2), q, Y_PAVE)], [(0, 0), (1, 0), (1, .08), (0, .08)], M['conc'], (0, d, 0))
            # drains in the gutter every 24 m
            q = za - 6
            while q > zb + 2:
                gx = s * (EDGE(q) - .32)
                R.face([(gx - .22, q + .45, Y_ROAD + .006), (gx + .22, q + .45, Y_ROAD + .006), (gx + .22, q - .45, Y_ROAD + .006), (gx - .22, q - .45, Y_ROAD + .006)], [(0, 0)] * 4, M['grate'], UP)
                for k in range(6):
                    bz = q - .38 + k * .152
                    R.face([(gx - .17, bz, Y_ROAD + .009), (gx + .17, bz, Y_ROAD + .009), (gx + .17, bz - .05, Y_ROAD + .009), (gx - .17, bz - .05, Y_ROAD + .009)], [(0, 0)] * 4, M['slot'], UP)
                q -= 24
    # the kerb along the drop-off road (north side), both ways from the approach road
    for s in (1, -1):
        line = [(s * 9.25, LZ_DROP), (s * 150.0, LZ_DROP)]
        kerb(R, line, -s, .2, .17, .14, M['conc'])
    # 5. the median: painted kerb round green grass, palms and lamps
    rng = random.Random(7)
    lampz = []
    for (zn, zsouth, rn, rs) in PIECES:
        zt = zn - (HW(zn) if rn else 0); zb = zsouth + (HW(zsouth) if rs else 0)
        Z = zs(zt, zb, 2.0)
        east = [(HW(z), z) for z in Z]; west = [(-HW(z), z) for z in reversed(Z)]
        def cap(zc, hw, a0, a1, n=10):
            return [(hw * math.cos(a0 + (a1 - a0) * k / n), zc + hw * math.sin(a0 + (a1 - a0) * k / n)) for k in range(1, n)]
        loop = east + (cap(zb, HW(zb), 0, -math.pi) if rs else []) + west + (cap(zt, HW(zt), math.pi, 0) if rn else [])
        kerb(R, loop, 1, .22, Y_KERB, Y_GRASS, M['kerb'], closed=True, uvlen=2.0)
        # the grass inside the kerb
        gi = lambda z: max(.02, HW(z) - .22)
        guv = lambda x, z: (x / 2.5, z / 2.5)
        strip(R, lambda z: -gi(z), gi, zt, zb, Y_GRASS, M['grass'], guv)
        for (zc, sgn, on) in ((zt, 1, rn), (zb, -1, rs)):
            if not on: continue
            r = gi(zc); n = 12
            for k in range(n):
                a0, a1 = math.pi * k / n, math.pi * (k + 1) / n
                p = [(0, zc, Y_GRASS), (r * math.cos(a0), zc + sgn * r * math.sin(a0), Y_GRASS), (r * math.cos(a1), zc + sgn * r * math.sin(a1), Y_GRASS)]
                R.face(p, [guv(q[0], q[1]) for q in p], M['grass'], UP)
        # the yellow line along the median on both carriageways
        for s in (1, -1):
            Zl = zs(zt, zb, 3.0)
            for z0, z1 in zip(Zl, Zl[1:]):
                xa0, xa1 = s * (HW(z0) + .28), s * (HW(z1) + .28); xb0, xb1 = xa0 + s * .14, xa1 + s * .14
                R.face([(xa0, z0, Y_PAINT), (xb0, z0, Y_PAINT), (xb1, z1, Y_PAINT), (xa1, z1, Y_PAINT)], [(0, 0)] * 4, M['yellow'], UP)
        # boxes that keep cars off the median
        for z0, z1 in zip(Z, Z[1:]):
            info['median'].append([0.0, round((z0 + z1) / 2, 2), round(min(HW(z0), HW(z1)) - .05, 2), round((z0 - z1) / 2 + .05, 2)])
        # lamps every 30 m (at 10, 40, 70 ... m), three palms between each two, 7.5 m apart, where the median is wide enough
        here = []
        for m in range(int(zb // 30) - 1, int(zt // 30) + 2):
            z = 10.0 + 30 * m
            if zb + 2 <= z <= zt - 2.5 and HW(z) >= .55: lampz.append(z)
        for k in range(int(zb // 7.5) - 2, int(zt // 7.5) + 3):
            z = 10.0 + 7.5 * k
            if k % 4 == 0 or not (zb + 2 <= z <= zt - 2) or HW(z) < 1.3: continue
            here.append(z)
        if not here and zt - zb >= 5 and HW((zt + zb) / 2) >= 1.3: here.append(round((zt + zb) / 2, 2))
        for z in here:
            info['palms'].append([0.0, z, round(rng.uniform(0, 2 * math.pi), 3), round(rng.uniform(.95, 1.15), 3)])
            # a ring of soil at the palm's foot
            n = 14
            for j in range(n):
                a0, a1 = 2 * math.pi * j / n, 2 * math.pi * (j + 1) / n
                p = [(0, z, Y_GRASS + .006), (.6 * math.cos(a0), z + .6 * math.sin(a0), Y_GRASS + .006), (.6 * math.cos(a1), z + .6 * math.sin(a1), Y_GRASS + .006)]
                R.face(p, [(q[0] / 1.2, q[1] / 1.2) for q in p], M['soil'], UP)
    # 6. lane lines: white at the outer edges, dashed between the lanes; not through the toll plaza (it has its own)
    def wline(xf, za, zb, w, mat, dash=None):
        segs = []
        if dash:
            z = za
            while z > zb:
                segs.append((z, max(zb, z - dash[0]))); z -= dash[0] + dash[1]
        else: segs = [(za, zb)]
        for (a, b) in segs:
            Zl = zs(a, b, 4.0)
            for z0, z1 in zip(Zl, Zl[1:]):
                pts = [(xf(z0) - w / 2, z0, Y_PAINT), (xf(z0) + w / 2, z0, Y_PAINT), (xf(z1) + w / 2, z1, Y_PAINT), (xf(z1) - w / 2, z1, Y_PAINT)]
                R.face(pts, [(0, 0)] * 4, mat, UP)
    for s in (1, -1):
        cuts = sorted(CUTS[s] + [(213.5, 170.5)], reverse=True); z = LZ_CITY - .5
        for (a, b) in cuts:
            if a < z: wline(lambda q, s=s: s * (EDGE(q) - .3), z, a + .5, .14, M['white'])
            z = min(z, b - .5)
        wline(lambda q, s=s: s * (EDGE(q) - .3), z, LZ_DROP + .5, .14, M['white'])
        wline(lambda q, s=s: s * DIV(q, s), LZ_CITY - 1, 214.5, .13, M['white'], (3.0, 6.0))
        wline(lambda q, s=s: s * DIV(q, s), 169.5, LZ_DROP + 6, .13, M['white'], (3.0, 6.0))
    x = 14.0   # the link road's centre line
    while x < HAND_LX - 5:
        R.face([(x, LZ_LINK + .065, Y_PAINT), (x + 3, LZ_LINK + .065, Y_PAINT), (x + 3, LZ_LINK - .065, Y_PAINT), (x, LZ_LINK - .065, Y_PAINT)], [(0, 0)] * 4, M['white'], UP); x += 7.0
    wline(lambda q: HAND_LX, LZ_CITY + 2, LZ_LINK + 5, .13, M['white'], (3.0, 4.0))
    for zz in (53.33, 58.67):   # the drop-off road's lanes
        for x0, x1 in ((-148.0, -12.0), (12.0, 148.0)):
            x = x0
            while x < x1:
                xe = min(x1, x + 3.0); R.face([(x, zz + .065, Y_PAINT), (xe, zz + .065, Y_PAINT), (xe, zz - .065, Y_PAINT), (x, zz - .065, Y_PAINT)], [(0, 0)] * 4, M['white'], UP); x += 7.0
    # 7. words and arrows on the road
    def arrow(cx, cz, d):   # d = -1 pointing south (to the airport), +1 north
        sh = [(-.15, 0), (.15, 0), (.15, 3.0), (-.15, 3.0)]; hd = [(-.6, 3.0), (.6, 3.0), (0, 5.0)]
        for poly in (sh, hd):
            R.face([(cx + px, cz + d * pz, Y_PAINT) for (px, pz) in poly], [(0, 0)] * len(poly), M['white'], UP)
    for z in (330.0, 140.0):
        for s, d in ((1, -1), (-1, 1)):
            for x in ((HW(z) + DIV(z, s)) / 2, (DIV(z, s) + EDGE(z) - .3) / 2): arrow(s * x, z + (2.5 if d < 0 else -2.5), d)
    words = []
    for x in ((HW(236) + DIV(236, 1)) / 2, (DIV(236, 1) + EDGE(236) - .3) / 2):
        words.append(('SLOW', x, 238.0, 0.0))
    for x in ((HW(300) + DIV(300, 1)) / 2, (DIV(300, 1) + EDGE(300) - .3) / 2):
        words.append(('AIRPORT', x, 300.0, 0.0))
    for x in ((HW(260) + DIV(260, -1)) / 2, (DIV(260, -1) + EDGE(260) - .3) / 2):
        words.append(('CITY', -x, 260.0, math.pi))
    texts = []
    for (txt, x, z, rot) in words:
        cu = bpy.data.curves.new('t_' + txt, 'FONT'); cu.body = txt; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
        cu.size = .95 if len(txt) <= 4 else .62
        o = bpy.data.objects.new('AR_Word_' + txt, cu); bpy.context.scene.collection.objects.link(o)
        o.location = (x, -z, Y_PAINT + .001); o.rotation_euler = (0, 0, rot); o.scale = (1, 2.6, 1)
        texts.append(o)
    bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
    wm = bpy.data.meshes.new('AR_Words'); bm = bmesh.new()
    for o in texts:
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); me.transform(o.matrix_world); bm.from_mesh(me); bpy.data.meshes.remove(me)
        bpy.data.objects.remove(o);
    bm.to_mesh(wm); bm.free(); wm.materials.append(M['white'])
    wo = bpy.data.objects.new('AR_Words', wm); bpy.context.scene.collection.objects.link(wo)
    # 8. the lamps: tall grey poles on the median, an arm over each carriageway, LED heads that glow at night
    for z in lampz:
        info['lamps'].append([0.0, z])
        box(L, -.3, .3, z - .3, z + .3, Y_GRASS - .02, .5, M['conc'], uvs=1.0)
        cyl(L, 0, z, .5, 10.0, .14, .075, M['metal'], 12)
        cyl(L, 0, z, .5, .9, .2, .18, M['metal'], 12)                                   # the base collar
        for s in (1, -1):
            path = [(0, z, 9.15), (s * .5, z, 9.55), (s * 1.2, z, 9.85), (s * 2.0, z, 9.98), (s * 2.55, z, 10.0)]
            tube(L, path, .055, M['metal'], 8)
            hx0, hx1 = sorted((s * 2.35, s * 3.15))
            box(L, hx0, hx1, z - .17, z + .17, 9.9, 10.08, M['housing'], top=True)
            L.face([(hx0 + .06, z - .13, 9.895), (hx1 - .06, z - .13, 9.895), (hx1 - .06, z + .13, 9.895), (hx0 + .06, z + .13, 9.895)], [(0, 0)] * 4, M['glow'], (0, 0, -1))
    ro = R.build(); lo = L.build(merge=True)
    return [ro, lo, wo], info


# ------------------------------------------------------------------ the palm from the user's Naija Ground (read-only append)
def palm():
    names = ['CT_L_palm_Sketchfab_model', 'CT_L_palm_Palm_4_1.fbx', 'CT_L_palm_RootNode', 'CT_L_palm_Tree_1',
             'CT_L_palm_Tree_1_Palm_4_Leaf_0', 'CT_L_palm_Tree_1_Plam_4_Trunk_0']
    with bpy.data.libraries.load(NGB, link=False) as (src, dst):
        dst.objects = [n for n in names if n in src.objects]
    got = [o for o in dst.objects if o]
    for o in got: bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.update()
    leaf = next(o for o in got if 'Leaf' in o.name); trunk = next(o for o in got if 'Trunk' in o.name)
    li = next(n.image for n in leaf.active_material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    ti = next(n.image for n in trunk.active_material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    li.scale(1024, 1024); ti.scale(512, 512)
    mL = bpy.data.materials.new('AR_PalmLeaf'); mL.use_nodes = True; nt = mL.node_tree; b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = li; nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    rnd = nt.nodes.new('ShaderNodeMath'); rnd.operation = 'ROUND'; nt.links.new(t.outputs['Alpha'], rnd.inputs[0]); nt.links.new(rnd.outputs[0], b.inputs['Alpha'])
    b.inputs['Roughness'].default_value = .7
    try: mL.surface_render_method = 'DITHERED'
    except Exception: pass
    mT = bpy.data.materials.new('AR_PalmTrunk'); mT.use_nodes = True; nt = mT.node_tree; b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = ti; nt.links.new(t.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = .9
    def join(parts, name):
        for o in bpy.context.scene.objects: o.select_set(False)
        for p in parts: p.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        with bpy.context.temp_override(active_object=parts[0], object=parts[0], selected_objects=parts, selected_editable_objects=parts):
            bpy.ops.object.join()
        parts[0].name = name; parts[0].data.name = name; return parts[0]
    def part(o, m, ratio=None):
        me = o.data.copy(); me.transform(o.matrix_world); me.materials.clear(); me.materials.append(m)
        p = bpy.data.objects.new('_p', me); bpy.context.scene.collection.objects.link(p)
        if ratio:
            md = p.modifiers.new('d', 'DECIMATE'); md.ratio = ratio
            with bpy.context.temp_override(object=p, active_object=p, selected_objects=[p], selected_editable_objects=[p]):
                bpy.ops.object.modifier_apply(modifier='d')
        return p
    P = join([part(trunk, mT), part(leaf, mL)], 'ns_palm')
    lo = join([part(trunk, mT, .3), part(leaf, mL, .2)], 'ns_palm_lod1')
    for o in got: bpy.data.objects.remove(o)
    vs = P.data.vertices; zmin = min(v.co.z for v in vs)
    foot = [v.co for v in vs if v.co.z < zmin + .4 and v.co.z >= zmin]
    cx = sum(c.x for c in foot) / len(foot); cy = sum(c.y for c in foot) / len(foot)
    for o in (P, lo):
        o.data.transform(__import__('mathutils').Matrix.Translation((-cx, -cy, -zmin)))
        for pg in o.data.polygons: pg.use_smooth = True
    for o in (P, lo):
        cnt = {}
        for pg in o.data.polygons: cnt[pg.material_index] = cnt.get(pg.material_index, 0) + 1
        LOG[0](o.name, 'faces by material', {o.data.materials[k].name: v for k, v in cnt.items()})
    h = max(v.co.z for v in P.data.vertices)
    LOG[0]('palm', len(P.data.polygons), 'faces, lod1', len(lo.data.polygons), 'height', round(h, 2))
    return P, lo


# ------------------------------------------------------------------ export and pictures
def export(objs, path):
    for o in bpy.context.scene.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_draco_position_quantization=14,
        export_draco_normal_quantization=10, export_draco_texcoord_quantization=12,
        export_image_format='WEBP', export_image_quality=82, export_cameras=False, export_lights=False, export_animations=False,
        export_extras=False, export_materials='EXPORT')
    LOG[0]('exported', os.path.basename(path), os.path.getsize(path) // 1024, 'KB')


def looks(info, palm_ob):
    sc = bpy.context.scene
    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try: sc.render.engine = eng; break
        except Exception: pass
    try: sc.eevee.taa_render_samples = 32
    except Exception: pass
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    w = bpy.data.worlds.new('Sky'); sc.world = w; w.use_nodes = True; nt = w.node_tree
    env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(os.path.join(TEXSRC, 'kloofendal_48d_partly_cloudy_puresky.hdr'))
    nt.links.new(env.outputs['Color'], nt.nodes['Background'].inputs['Color']); nt.nodes['Background'].inputs['Strength'].default_value = 1.0
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sc.collection.objects.link(sun)
    sun.data.energy = 4.5; sun.data.angle = .02; sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    # the lawn around (only for the pictures)
    gimg = bpy.data.images.load(os.path.join(TEXSRC, 'sparse_grass_diff.jpg'))
    gm = material('_lawn', img=gimg, rough=1)
    me = bpy.data.meshes.new('_lawn'); bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    vs = [bm.verts.new(p) for p in ((-200, -460, -.01), (200, -460, -.01), (200, 0, -.01), (-200, 0, -.01))]; f = bm.faces.new(vs)
    for l in f.loops: l[uvl].uv = (l.vert.co.x / 4, l.vert.co.y / 4)
    bm.to_mesh(me); bm.free(); me.materials.append(gm); lawn = bpy.data.objects.new('_lawn', me); sc.collection.objects.link(lawn)
    copies = []
    for (x, z, yaw, s) in info['palms']:
        c = palm_ob.copy(); c.location = (x, -z, Y_GRASS); c.rotation_euler = (0, 0, yaw); c.scale = (s, s, s); sc.collection.objects.link(c); copies.append(c)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); sc.collection.objects.link(cam); sc.camera = cam
    views = {'drive': ((3.6, -345, 1.35), (3.2, -250, 1.2), 30), 'high': ((32, -330, 20), (0, -250, 0), 32),
             'median': ((6.5, -322, 2.0), (-.5, -306, 3.4), 24), 'toll': ((-10, -262, 7), (0, -205, 0), 30),
             'dropoff': ((26, -125, 15), (0, -78, 0), 28), 'city': ((-4, -432, 3.2), (0, -380, 1.5), 30)}
    out = []
    for k, (p, t, lens) in views.items():
        cam.location = p; d = Vector(t) - Vector(p); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = lens
        sc.render.filepath = os.path.join(OUT, f'look_{k}.png'); bpy.ops.render.render(write_still=True); out.append(sc.render.filepath)
    return out


def build_all(log=print):
    LOG[0] = log
    os.makedirs(TEX, exist_ok=True)
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    t0 = time.time(); T = textures(); log('textures', round(time.time() - t0, 1), 's')
    M = {'lane': material('AR_Lane', T['lane'], T['asph_n'], rough=.9, nstr=.6), 'asph': material('AR_Asphalt', T['asph'], T['asph_n'], rough=.9, nstr=.6),
         'kerb': material('AR_KerbPaint', T['kerb'], rough=.75), 'conc': material('AR_Concrete', T['conc'], rough=.9),
         'grass': material('AR_Grass', T['grass'], T['grass_n'], rough=.95, nstr=.5), 'pave': material('AR_Paving', T['pave'], T['pave_n'], rough=.85, nstr=.8),
         'soil': material('AR_Soil', T['soil'], rough=1.0), 'white': material('AR_PaintWhite', color=(.93, .93, .9), rough=.6),
         'yellow': material('AR_PaintYellow', color=(.95, .74, .12), rough=.6), 'grate': material('AR_Grate', color=(.16, .16, .16), rough=.6, metal=.5),
         'slot': material('AR_GrateSlot', color=(.04, .04, .04), rough=1.0), 'metal': material('AR_Metal', color=(.62, .64, .65), rough=.4, metal=.7),
         'housing': material('AR_LampHead', color=(.22, .23, .24), rough=.5, metal=.4), 'glow': material('AR_LampGlow', color=(1, .97, .9), rough=.3, emit=(1, .94, .8))}
    objs, info = road(M); log('road', [(o.name, len(o.data.polygons)) for o in objs], 'palms', len(info['palms']), 'lamps', len(info['lamps']))
    export(objs, os.path.join(OUT, 'set_airroad.glb'))
    info.update({'frame': {'lzCity': LZ_CITY, 'lzLink': LZ_LINK, 'lzToll': LZ_TOLL, 'lzDrop': LZ_DROP, 'agegeGap': 11.26, 'handLx': HAND_LX}})
    json.dump(info, open(os.path.join(OUT, 'set_airroad.json'), 'w'))
    P, lo = palm()
    export([P], os.path.join(OUT, 'ns_palm.glb')); export([lo], os.path.join(OUT, 'ns_palm_lod1.glb'))
    lo.hide_render = True; P.location = (60, 0, 0)
    looks(info, P); log('looks done')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'naija_airroad.blend'))
    return info
