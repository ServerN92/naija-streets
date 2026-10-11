"""Turn an OpenStreetMap export (.osm) into the game's world file: road graph, buildings, areas, places, railway.

    python3 tools/osm_world.py Mushin.osm assets/maps/mushin_world.json

Everything heavy is done here once, so phones only read a ready-made list:
  - roads become a graph of short straight pieces (junctions + bends), with width, name, surface, one-way and bridges
  - every building becomes a rotated rectangle (the smallest box around its real outline), facing its street;
    buildings that stand on a road (map misalignment) are trimmed or dropped
  - areas (markets, schools, parks, filling stations...), named places, traffic signals, bus stops, the railway
Coordinates: metres, x = east, z = south, origin = centre of the export.
"""
import sys, json, math, collections
import xml.etree.ElementTree as ET
import numpy as np

SRC, OUT = sys.argv[1], sys.argv[2]

# ---------------------------------------------------------------- read
nodes = {}; ways = []; rels = []; bounds = None; ntags = {}
for ev, el in ET.iterparse(SRC, events=('end',)):
    if el.tag == 'bounds': bounds = {k: float(v) for k, v in el.attrib.items()}
    elif el.tag == 'node':
        nodes[el.get('id')] = (float(el.get('lat')), float(el.get('lon')))
        t = {x.get('k'): x.get('v') for x in el.findall('tag')}
        if t: ntags[el.get('id')] = t
        el.clear()
    elif el.tag == 'way':
        ways.append(({x.get('k'): x.get('v') for x in el.findall('tag')}, [n.get('ref') for n in el.findall('nd')], el.get('id'))); el.clear()
    elif el.tag == 'relation':
        rels.append(({x.get('k'): x.get('v') for x in el.findall('tag')}, [(m.get('type'), m.get('ref'), m.get('role')) for m in el.findall('member')])); el.clear()
lat0 = (bounds['minlat'] + bounds['maxlat']) / 2; lon0 = (bounds['minlon'] + bounds['maxlon']) / 2
KX = 111320 * math.cos(math.radians(lat0)); KZ = 110540
def P(nid): la, lo = nodes[nid]; return ((lo - lon0) * KX, -(la - lat0) * KZ)
HALF = [round((bounds['maxlon'] - bounds['minlon']) * KX / 2), round((bounds['maxlat'] - bounds['minlat']) * KZ / 2)]
way_by_id = {w[2]: w for w in ways}

# ---------------------------------------------------------------- roads
CLS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service', 'track']
CLASS_OF = {'motorway': 0, 'motorway_link': 0, 'trunk': 1, 'trunk_link': 1, 'primary': 2, 'primary_link': 2, 'secondary': 3, 'secondary_link': 3,
            'tertiary': 4, 'tertiary_link': 4, 'unclassified': 5, 'residential': 6, 'living_street': 7, 'service': 8, 'track': 9}
WIDTH = {0: 22, 1: 18, 2: 14, 3: 11, 4: 9, 5: 6.5, 6: 6, 7: 5, 8: 4.5, 9: 4}
LINK_W = 7.5
FOOT = {'footway', 'path', 'steps', 'pedestrian', 'cycleway'}

roads = []   # (cls, width, name, flags, [node ids])   flags: 1 oneway, 2 unpaved, 4 bridge, 16 service
foot = []
for tags, nd, wid in ways:
    hw = tags.get('highway')
    if not hw or len(nd) < 2 or not all(n in nodes for n in nd): continue
    if hw in FOOT:
        foot.append((hw, tags.get('bridge') == 'yes' or tags.get('layer', '0') not in ('0', '-1'), tags.get('name'), nd)); continue
    if hw not in CLASS_OF or tags.get('area') == 'yes': continue
    c = CLASS_OF[hw]
    ow = tags.get('oneway') in ('yes', '1', 'true') or (hw in ('motorway', 'motorway_link') and tags.get('oneway') != 'no')
    if tags.get('oneway') == '-1': nd = nd[::-1]; ow = True
    w = LINK_W if hw.endswith('_link') else WIDTH[c]
    if ow and c <= 2 and not hw.endswith('_link'): w = w * .58          # dual carriageways are mapped as two one-way roads
    try:
        lanes = int(tags.get('lanes', '0'))
        if lanes: w = max(w * .7, min(w * 1.3, lanes * 3.4 + 1))
    except ValueError: pass
    surf = tags.get('surface', '')
    unp = surf in ('unpaved', 'dirt', 'ground', 'earth', 'sand', 'gravel', 'compacted', 'mud')
    if unp and c >= 5: w = min(w, 5.6)
    br = tags.get('bridge') == 'yes'
    f = (1 if ow else 0) | (2 if unp else 0) | (4 if br else 0) | (16 if c == 8 else 0)
    roads.append((c, w, tags.get('name') or tags.get('ref'), f, nd))

# keep only what lies inside the export box (OSM exports include whole roads that run on for kilometres)
BX, BZ = HALF[0] - 4, HALF[1] - 4
inside = lambda xy: abs(xy[0]) <= BX and abs(xy[1]) <= BZ
def cross_box(p, q):   # where the piece p->q leaves the box
    t = 1.0
    for i, B in ((0, BX), (1, BZ)):
        d = q[i] - p[i]
        if d > 0 and q[i] > B: t = min(t, (B - p[i]) / d)
        if d < 0 and q[i] < -B: t = min(t, (-B - p[i]) / d)
    return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
clipped = []
for k, (c, w, name, f, nd) in enumerate(roads):
    pts = [(n, P(n)) for n in nd]; cur = []
    for i in range(len(pts)):
        key, xy = pts[i]
        if inside(xy):
            if not cur and i > 0: cur.append((('b', k, i), cross_box(xy, pts[i - 1][1])))
            cur.append((key, xy))
        else:
            if cur:
                cur.append((('b', k, i), cross_box(cur[-1][1], xy))); clipped.append((c, w, name, f, cur)); cur = []
    if len(cur) > 1: clipped.append((c, w, name, f, cur))
roads = [r for r in clipped if len(r[4]) > 1]
# junctions: a node shared by two roads, or a road end
use = collections.Counter()
for r in roads:
    for n, xy in r[4]: use[n] += 1
    use[r[4][0][0]] += 5; use[r[4][-1][0]] += 5

def dp(pts, tol):  # Douglas-Peucker on a list of (x,z), keeps both ends
    if len(pts) < 3: return list(range(len(pts)))
    keep = [0, len(pts) - 1]; stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop(); ax, az = pts[a]; bx, bz = pts[b]; dx, dz = bx - ax, bz - az; L = math.hypot(dx, dz) or 1e-9
        best, bi = -1, -1
        for i in range(a + 1, b):
            d = abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L
            if d > best: best, bi = d, i
        if best > tol: keep.append(bi); stack += [(a, bi), (bi, b)]
    return sorted(keep)

gid = {}; G = []          # game nodes: [x, z]
def gnode(key, xy):
    if key not in gid: gid[key] = len(G); G.append([round(xy[0], 2), round(xy[1], 2)])
    return gid[key]
names = []; name_id = {}
def nm(s):
    if not s: return -1
    if s not in name_id: name_id[s] = len(names); names.append(s)
    return name_id[s]
E = []                     # [a, b, cls, width, name, flags, way]
for wi, (c, w, name, f, nd) in enumerate(roads):
    keys = [k for k, xy in nd]; xys = [xy for k, xy in nd]
    cut = [0] + [i for i in range(1, len(nd) - 1) if use[keys[i]] > 1] + [len(nd) - 1]
    for s, e in zip(cut, cut[1:]):
        chain = keys[s:e + 1]; pts = xys[s:e + 1]
        keep = dp(pts, .7 if c >= 5 else .5)
        # long straight pieces get extra points so cars and walkers have places to turn off later (and lamps line up)
        ids = []
        for k in keep:
            n = chain[k]
            ids.append(gnode(n if (k in (0, len(chain) - 1) or use[n] > 1) else ('s', n), pts[k]))
        for a, b in zip(ids, ids[1:]):
            if a == b: continue
            E.append([a, b, c, w, nm(name), f, wi])
# merge duplicate edges (two OSM ways over the same nodes)
seen = {}; E2 = []
for e in E:
    k = (min(e[0], e[1]), max(e[0], e[1]))
    if k in seen:
        o = E2[seen[k]]
        if e[2] < o[2]: o[2:] = e[2:]
        continue
    seen[k] = len(E2); E2.append(e)
E = E2
N = len(G); Gx = np.array(G)
adj = [[] for _ in range(N)]
for i, (a, b, c, w, n, f, wi) in enumerate(E): adj[a].append(i); adj[b].append(i)

# cars: the biggest set of roads you can drive around and come back (one-way respected); service lanes not used by traffic
out = [[] for _ in range(N)]
for i, (a, b, c, w, n, f, wi) in enumerate(E):
    if f & 16: continue
    out[a].append(b)
    if not f & 1: out[b].append(a)
def scc(n, out):   # Tarjan, iterative
    index = [0] * n; low = [0] * n; on = [False] * n; idx = [-1] * n; st = []; comp = [-1] * n; cnum = 0; counter = 1
    for v0 in range(n):
        if idx[v0] != -1: continue
        work = [(v0, 0)]
        while work:
            v, pi = work[-1]
            if pi == 0:
                idx[v] = counter; low[v] = counter; counter += 1; st.append(v); on[v] = True
            recurse = False
            for j in range(pi, len(out[v])):
                w = out[v][j]
                if idx[w] == -1:
                    work[-1] = (v, j + 1); work.append((w, 0)); recurse = True; break
                elif on[w]: low[v] = min(low[v], idx[w])
            if recurse: continue
            work.pop()
            if work: low[work[-1][0]] = min(low[work[-1][0]], low[v])
            if low[v] == idx[v]:
                while True:
                    w = st.pop(); on[w] = False; comp[w] = cnum
                    if w == v: break
                cnum += 1
    return comp
comp = scc(N, out)
big = collections.Counter(comp[i] for i in range(N) if out[i]).most_common(1)[0][0]
for e in E:
    if comp[e[0]] == big and comp[e[1]] == big and not e[5] & 16: e[5] |= 8
deg = [len(a) for a in adj]

# road pieces for nearby tests (buildings, stops)
segs = np.array([[G[a][0], G[a][1], G[b][0], G[b][1], w / 2, c] for a, b, c, w, n, f, wi in E])
CELL = 24
grid = collections.defaultdict(list)
for i, (x0, z0, x1, z1, hw, c) in enumerate(segs):
    for gx in range(int(math.floor(min(x0, x1) / CELL)) - 1, int(math.floor(max(x0, x1) / CELL)) + 2):
        for gz in range(int(math.floor(min(z0, z1) / CELL)) - 1, int(math.floor(max(z0, z1) / CELL)) + 2):
            grid[(gx, gz)].append(i)
def near_segs(x, z, r=1):
    gx, gz = int(math.floor(x / CELL)), int(math.floor(z / CELL)); s = set()
    for i in range(gx - r, gx + r + 1):
        for j in range(gz - r, gz + r + 1): s.update(grid.get((i, j), ()))
    return s
def seg_dist(px, pz, s):
    x0, z0, x1, z1 = segs[s][:4]; dx, dz = x1 - x0, z1 - z0; L2 = dx * dx + dz * dz or 1e-9
    t = max(0, min(1, ((px - x0) * dx + (pz - z0) * dz) / L2)); qx, qz = x0 + dx * t, z0 + dz * t
    return math.hypot(px - qx, pz - qz), t, qx, qz

# ---------------------------------------------------------------- buildings
def hull(pts):
    pts = sorted(set(pts))
    if len(pts) < 3: return pts
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]
def min_rect(poly):
    h = hull(poly)
    if len(h) < 3: return None
    H = np.array(h); best = None
    for i in range(len(h)):
        a, b = H[i], H[(i + 1) % len(h)]; d = b - a; L = np.hypot(*d)
        if L < 1e-6: continue
        u = d / L; v = np.array([-u[1], u[0]])
        pu = H @ u; pv = H @ v; w = pu.max() - pu.min(); dd = pv.max() - pv.min()
        if best is None or w * dd < best[0]:
            c = u * (pu.max() + pu.min()) / 2 + v * (pv.max() + pv.min()) / 2
            best = (w * dd, c[0], c[1], w, dd, math.atan2(u[1], u[0]))
    return best
def poly_area(p):
    a = 0
    for i in range(len(p)):
        x1, z1 = p[i]; x2, z2 = p[(i + 1) % len(p)]; a += x1 * z2 - x2 * z1
    return abs(a) / 2
def rect_corners(cx, cz, w, d, ang):
    u = (math.cos(ang), math.sin(ang)); v = (-u[1], u[0])
    return [(cx + u[0] * sw * w / 2 + v[0] * sd * d / 2, cz + u[1] * sw * w / 2 + v[1] * sd * d / 2) for sw, sd in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
def seg_rect_gap(s, cx, cz, w, d, ang):
    """how far the road piece's centre line is from the rectangle (negative = crosses it)"""
    x0, z0, x1, z1 = segs[s][:4]; ca, sa = math.cos(ang), math.sin(ang)
    def loc(x, z): dx, dz = x - cx, z - cz; return (dx * ca + dz * sa, -dx * sa + dz * ca)
    a = loc(x0, z0); b = loc(x1, z1); hx, hz = w / 2, d / 2
    # sample the segment densely (pieces are short) and take the box distance
    best = 1e9; n = max(2, int(math.hypot(b[0] - a[0], b[1] - a[1]) / .5))
    for k in range(n + 1):
        t = k / n; px, pz = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        ox, oz = max(abs(px) - hx, 0), max(abs(pz) - hz, 0)
        dist = math.hypot(ox, oz) if (ox > 0 or oz > 0) else -min(hx - abs(px), hz - abs(pz))
        best = min(best, dist)
    return best

def clip_poly(pts):   # Sutherland-Hodgman against the export box
    for axis, B, sgn in ((0, BX, 1), (0, BX, -1), (1, BZ, 1), (1, BZ, -1)):
        if not pts: break
        res = []; ins = lambda p: p[axis] * sgn <= B
        for i in range(len(pts)):
            a, b = pts[i - 1], pts[i]
            if ins(b):
                if not ins(a):
                    t = (B * sgn - a[axis]) / (b[axis] - a[axis]); res.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
                res.append(b)
            elif ins(a):
                t = (B * sgn - a[axis]) / (b[axis] - a[axis]); res.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
        pts = res
    return pts
areas = []
AREA_KEYS = ('landuse', 'leisure', 'amenity', 'natural', 'shop')
def area_kind(t):
    for k in AREA_KEYS:
        if t.get(k): return t[k]
    return None
for tags, nd, wid in ways:
    if 'building' in tags or 'highway' in tags: continue
    k = area_kind(tags)
    if not k or len(nd) < 4 or nd[0] != nd[-1] or not all(n in nodes for n in nd): continue
    pts = clip_poly([P(n) for n in nd[:-1]])
    if len(pts) < 3: continue
    areas.append({'k': k, 'n': tags.get('name'), 'p': [round(c, 1) for pt in pts for c in pt], 'a': round(poly_area(pts))})
def point_in(poly, x, z):
    ins = False; n = len(poly) // 2
    for i in range(n):
        x1, z1 = poly[2 * i], poly[2 * i + 1]; x2, z2 = poly[2 * ((i + 1) % n)], poly[2 * ((i + 1) % n) + 1]
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1 + 1e-12) + x1: ins = not ins
    return ins

blds = []
def add_building(tags, ring):
    pts = [P(n) for n in ring if n in nodes]
    if len(pts) > 1 and pts[0] == pts[-1]: pts = pts[:-1]
    if len(pts) < 3: return
    area = poly_area(pts)
    if area < 9: return
    if not all(inside(p) for p in pts): return
    r = min_rect(pts)
    if not r: return
    _, cx, cz, w, d, ang = r
    blds.append({'cx': cx, 'cz': cz, 'w': w, 'd': d, 'ang': ang, 'area': area, 'fill': area / max(1e-6, w * d), 'tags': tags})
for tags, nd, wid in ways:
    if 'building' in tags and len(nd) >= 4 and nd[0] == nd[-1]: add_building(tags, nd)
for tags, mem in rels:
    if 'building' not in tags: continue
    for typ, ref, role in mem:
        if typ == 'way' and role == 'outer' and ref in way_by_id:
            w = way_by_id[ref]
            if 'building' not in w[0]: add_building(tags, w[1])

# trim buildings that stand on the road; find the street each one faces
kept = []; dropped = 0; trimmed = 0
for b in blds:
    cx, cz, w, d, ang = b['cx'], b['cz'], b['w'], b['d'], b['ang']
    cand = near_segs(cx, cz, 2)
    ok = True
    for _ in range(6):
        worst = None
        for s in cand:
            if segs[s][5] == 9: continue
            gap = seg_rect_gap(s, cx, cz, w, d, ang) - segs[s][4] - .35
            if gap < 0 and (worst is None or gap < worst[0]): worst = (gap, s)
        if not worst: break
        # push the wall that faces the road back by the overlap (only if the house stays a sensible size)
        gap, s = worst; x0, z0, x1, z1 = segs[s][:4]; dist, t, qx, qz = seg_dist(cx, cz, s)
        nx, nz = (cx - qx) / (dist or 1), (cz - qz) / (dist or 1)
        ca, sa = math.cos(ang), math.sin(ang); lu = nx * ca + nz * sa; lv = -nx * sa + nz * ca
        cut = -gap + .05
        if abs(lu) >= abs(lv):
            if w - cut < 4.5: ok = False; break
            w -= cut; sh = cut / 2 * (1 if lu > 0 else -1); cx += ca * sh; cz += sa * sh
        else:
            if d - cut < 4.5: ok = False; break
            d -= cut; sh = cut / 2 * (1 if lv > 0 else -1); cx += -sa * sh; cz += ca * sh
        trimmed += 1
    if not ok: dropped += 1; continue
    # facing: the closest road piece; front = the box side looking at it
    best = None
    for s in cand:
        dist, t, qx, qz = seg_dist(cx, cz, s)
        dist -= segs[s][4]
        key = dist + (6 if segs[s][5] >= 8 else 0)
        if best is None or key < best[0]: best = (key, dist, s, qx, qz)
    face = 0; front = 99; fc = 9
    if best and best[1] < 30:
        _, dist, s, qx, qz = best; dx, dz = qx - cx, qz - cz; a = math.atan2(dz, dx)
        rel = (a - ang) % (2 * math.pi); face = int(round(rel / (math.pi / 2))) % 4   # 0:+u 1:+v 2:-u 3:-v
        front = dist; fc = int(segs[s][5])
    b.update(cx=cx, cz=cz, w=w, d=d, face=face, front=front, fc=fc)
    kept.append(b)
print('buildings', len(blds), 'kept', len(kept), 'dropped (on roads)', dropped, 'trims', trimmed)

# what each building is
def in_area(b, kinds):
    for a in areas:
        if a['k'] in kinds and point_in(a['p'], b['cx'], b['cz']): return a
    return None
KINDS = {'house': 0, 'shop': 1, 'block': 2, 'kiosk': 3, 'market': 4, 'school': 5, 'hospital': 6, 'industrial': 7, 'worship': 8, 'bank': 9, 'fuel': 10}
for b in kept:
    t = b['tags']; ar = b['area']; asp = max(b['w'], b['d']) / max(1, min(b['w'], b['d']))
    k = 'house'
    if t.get('amenity') == 'bank' or 'Bank' in (t.get('name') or ''): k = 'bank'
    elif t.get('amenity') == 'place_of_worship' or t.get('building') in ('mosque', 'church'): k = 'worship'
    elif in_area(b, ('marketplace', 'retail')) and ar < 600: k = 'market'
    elif in_area(b, ('school',)): k = 'school'
    elif in_area(b, ('hospital',)): k = 'hospital'
    elif in_area(b, ('industrial',)) or t.get('building') == 'industrial': k = 'industrial'
    elif in_area(b, ('fuel',)): k = 'fuel'
    elif ar < 24: k = 'kiosk'
    elif ar > 420 or asp > 2.7: k = 'block'
    elif b['front'] < 9 and b['fc'] <= 4: k = 'shop'
    b['kind'] = KINDS[k]

# ---------------------------------------------------------------- places
pois = {'signals': [], 'stops': [], 'station': [], 'clinic': [], 'place': [], 'worship': [], 'bank': [], 'xing': []}
def nearest_node(x, z, maxd=40, need_deg=0):
    d = np.hypot(Gx[:, 0] - x, Gx[:, 1] - z); order = np.argsort(d)
    for i in order[:40]:
        if d[i] > maxd: break
        if deg[i] >= need_deg: return int(i)
    return -1
for nid, t in ntags.items():
    if nid not in nodes: continue
    x, z = P(nid); name = t.get('name')
    if not inside((x, z)): continue
    if t.get('highway') == 'traffic_signals':
        j = nearest_node(x, z, 35, 3)
        if j >= 0 and j not in pois['signals']: pois['signals'].append(j)
    elif t.get('highway') == 'bus_stop' or t.get('public_transport') in ('platform', 'stop_position') and t.get('bus') != 'no' and t.get('railway') is None:
        pois['stops'].append([round(x, 1), round(z, 1), name or ''])
    elif t.get('railway') == 'station': pois['station'].append([round(x, 1), round(z, 1), name or 'Station'])
    elif t.get('railway') == 'level_crossing': pois['xing'].append([round(x, 1), round(z, 1)])
    elif t.get('amenity') in ('hospital', 'clinic', 'doctors') and name: pois['clinic'].append([round(x, 1), round(z, 1), name])
    elif t.get('amenity') == 'place_of_worship' and name: pois['worship'].append([round(x, 1), round(z, 1), name])
    elif t.get('amenity') == 'bank' and name: pois['bank'].append([round(x, 1), round(z, 1), name])
    elif t.get('place') and name: pois['place'].append([round(x, 1), round(z, 1), name])
for b in kept:
    t = b['tags']
    if t.get('name') and b['kind'] in (KINDS['bank'], KINDS['worship']):
        pois['bank' if b['kind'] == KINDS['bank'] else 'worship'].append([round(b['cx'], 1), round(b['cz'], 1), t['name']])

rail = []; water = []
for tags, nd, wid in ways:
    if not all(n in nodes for n in nd): continue
    pts = [P(n) for n in nd]
    if not any(inside(p) for p in pts): continue
    if tags.get('railway') == 'rail':
        rail.append({'n': tags.get('name') or '', 'p': [round(c, 1) for p in pts for c in p]})
    elif tags.get('waterway') in ('drain', 'stream', 'canal', 'ditch'):
        water.append({'k': tags['waterway'], 'p': [round(c, 1) for p in pts for c in p]})
footways = [{'k': k, 'br': 1 if br else 0, 'n': n or '', 'p': [round(c, 1) for nid in nd for c in P(nid)]} for k, br, n, nd in foot if all(inside(P(x)) for x in nd)]

# ---------------------------------------------------------------- write
B = []
for b in kept:
    B += [round(b['cx'], 2), round(b['cz'], 2), round(b['w'], 2), round(b['d'], 2), round(b['ang'], 4), b['kind'], b['face'], round(min(b['front'], 99), 1)]
data = {'name': OUT.split('/')[-1].split('_')[0], 'origin': [lat0, lon0], 'half': HALF, 'names': names,
        'cls': CLS, 'nodes': [c for n in G for c in n], 'edges': [c for e in E for c in (e[0], e[1], e[2], round(e[3], 2), e[4], e[5], e[6])],
        'kinds': list(KINDS), 'bld': B, 'areas': areas, 'pois': pois, 'rail': rail, 'water': water, 'foot': footways}
json.dump(data, open(OUT, 'w'), separators=(',', ':'))
kc = collections.Counter(b['kind'] for b in kept)
print('nodes', N, 'edges', len(E), 'drivable', sum(1 for e in E if e[5] & 8), 'junctions', sum(1 for x in deg if x >= 3))
print('kinds', {list(KINDS)[k]: v for k, v in sorted(kc.items())})
print('signals', len(pois['signals']), 'stops', len(pois['stops']), 'stations', pois['station'], 'places', [p[2] for p in pois['place']])
print('areas', collections.Counter(a['k'] for a in areas))
print('rail', len(rail), 'water', len(water), 'foot', len(footways), 'foot bridges', sum(f['br'] for f in footways))
import os; print(OUT, round(os.path.getsize(OUT) / 1024), 'KB')
