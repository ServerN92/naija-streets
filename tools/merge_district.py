"""Join a second district to the city: Ikeja Under Bridge, west of Mushin, behind a police toll gate.

    python3 tools/osm_world.py ikeja.osm /tmp/ikeja_world.json          # the real streets (OpenStreetMap)
    python3 tools/merge_district.py assets/maps/mushin_world.json /tmp/ikeja_world.json assets/maps/lagos_world.json

What it does:
  - fills the Ikeja streets with buildings where OpenStreetMap has none (rows of houses and shops along every street,
    a second row behind; small shacks and kiosks packed in near the flyover and the rail line: Under Bridge)
  - moves Ikeja west of Mushin (its east edge GAP metres past Mushin's west edge) and joins the two by one road:
    Isolo Road (Mushin) to Kudirat Abiola Way (Ikeja). The toll gate and the police post stand on that road.
  - writes one world file with both, plus:
      land:      extra rectangles you can stand on (Ikeja and the toll road), beside Mushin's own square
      districts: [{id, name, box:[x0,z0,x1,z1], gate:{x,z,fx,fz,hw}, core:{x,z,r}, police:{x,z,ry}}]
Coordinates: metres, x = east, z = south (Mushin's centre is the origin, as before).
"""
import sys, json, math, random

SRC_A, SRC_B, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
A = json.load(open(SRC_A)); B = json.load(open(SRC_B))
rng = random.Random(1807)
GAP = 140.0
KIND = {k: i for i, k in enumerate(B['kinds'])}

# ---------------------------------------------------------------- Ikeja: where things are (its own coordinates)
NB = B['nodes']; EB = B['edges']
nodeB = lambda i: (NB[2 * i], NB[2 * i + 1])
edgesB = [EB[k:k + 7] for k in range(0, len(EB), 7)]
hxB, hzB = B['half']
lat0, lon0 = B['origin']
KX = 111320 * math.cos(math.radians(lat0)); KZ = 110540
geo = lambda lat, lon: ((lon - lon0) * KX, -(lat - lat0) * KZ)
CORE = geo(6.5946, 3.3372)          # under the Ikeja flyover, where Agege Motor Road meets it by the rail line
CORE_R = 420.0
VILLAGE = geo(6.5965, 3.3425)       # Computer Village (Otigba)

# ---------------------------------------------------------------- infill: houses, shops and shacks along the streets
def obb(cx, cz, w, d, ang):
    return (cx, cz, w / 2, d / 2, math.cos(ang), math.sin(ang))
def sat(o1, o2):
    """two boxes overlap? (separating axis test)"""
    ax = [(o1[4], o1[5]), (-o1[5], o1[4]), (o2[4], o2[5]), (-o2[5], o2[4])]
    dx, dz = o2[0] - o1[0], o2[1] - o1[1]
    for ux, uz in ax:
        r1 = o1[2] * abs(o1[4] * ux + o1[5] * uz) + o1[3] * abs(-o1[5] * ux + o1[4] * uz)
        r2 = o2[2] * abs(o2[4] * ux + o2[5] * uz) + o2[3] * abs(-o2[5] * ux + o2[4] * uz)
        if abs(dx * ux + dz * uz) > r1 + r2: return False
    return True
CELL = 30
grid = {}
def gkeys(cx, cz, r):
    for i in range(int(math.floor((cx - r) / CELL)), int(math.floor((cx + r) / CELL)) + 1):
        for j in range(int(math.floor((cz - r) / CELL)), int(math.floor((cz + r) / CELL)) + 1):
            yield (i, j)
def add_obs(o):
    r = math.hypot(o[2], o[3])
    for k in gkeys(o[0], o[1], r): grid.setdefault(k, []).append(o)
def hits(o):
    r = math.hypot(o[2], o[3]); seen = set()
    for k in gkeys(o[0], o[1], r):
        for q in grid.get(k, ()):
            if id(q) in seen: continue
            seen.add(id(q))
            if sat(o, q): return True
    return False
# roads (with a little room each side), rail lines, the existing buildings
for a, b, c, w, n, f, wi in edgesB:
    (x0, z0), (x1, z1) = nodeB(a), nodeB(b); L = math.hypot(x1 - x0, z1 - z0)
    if L < .1: continue
    add_obs(obb((x0 + x1) / 2, (z0 + z1) / 2, L + w, w + 2.4, math.atan2(z1 - z0, x1 - x0)))
for r in B['rail']:
    p = r['p']
    for i in range(0, len(p) - 3, 2):
        x0, z0, x1, z1 = p[i:i + 4]; L = math.hypot(x1 - x0, z1 - z0)
        if L > .1: add_obs(obb((x0 + x1) / 2, (z0 + z1) / 2, L + 4, 14, math.atan2(z1 - z0, x1 - x0)))
for f in B.get('foot', []):
    p = f['p']
    for i in range(0, len(p) - 3, 2):
        x0, z0, x1, z1 = p[i:i + 4]; L = math.hypot(x1 - x0, z1 - z0)
        if L > .1: add_obs(obb((x0 + x1) / 2, (z0 + z1) / 2, L + 1, 3, math.atan2(z1 - z0, x1 - x0)))
BLD = B['bld']
for i in range(0, len(BLD), 8):
    cx, cz, w, d, ang = BLD[i:i + 5]; add_obs(obb(cx, cz, w + 1.2, d + 1.2, ang))
# open ground stays open
OPEN = {'pitch', 'swimming_pool', 'parking', 'grass', 'wood', 'scrub', 'fuel', 'construction', 'park', 'playground', 'cemetery', 'bus_station', 'fire_station'}
def point_in(p, x, z):
    ins = False; n = len(p) // 2
    for i in range(n):
        x1, z1 = p[2 * i], p[2 * i + 1]; x2, z2 = p[2 * ((i + 1) % n)], p[2 * ((i + 1) % n) + 1]
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1 + 1e-12) + x1: ins = not ins
    return ins
open_areas = [a for a in B['areas'] if a['k'] in OPEN]
def in_open(x, z): return any(point_in(a['p'], x, z) for a in open_areas)

added = []
def place(cx, cz, w, d, ang, kind, face, front):
    if abs(cx) > hxB - 6 - max(w, d) / 2 or abs(cz) > hzB - 6 - max(w, d) / 2: return False
    o = obb(cx, cz, w, d, ang)
    if hits(o) or in_open(cx, cz): return False
    add_obs(obb(cx, cz, w + .8, d + .8, ang))
    added.append([round(cx, 2), round(cz, 2), round(w, 2), round(d, 2), round(ang, 4), KIND[kind], face, round(min(front, 99), 1)])
    return True
for a, b, c, w, n, f, wi in edgesB:
    if c < 2 or c > 8 or f & 4: continue
    (x0, z0), (x1, z1) = nodeB(a), nodeB(b); L = math.hypot(x1 - x0, z1 - z0)
    if L < 8: continue
    fx, fz = (x1 - x0) / L, (z1 - z0) / L; ang = math.atan2(fz, fx); hw = w / 2
    for side in (1, -1):
        nx, nz = -fz * side, fx * side     # out from the road on this side
        s = rng.uniform(1, 5)
        while s < L - 2:
            mx, mz = x0 + fx * s, z0 + fz * s
            dcore = math.hypot(mx - CORE[0], mz - CORE[1]); core = dcore < CORE_R
            dvill = math.hypot(mx - VILLAGE[0], mz - VILLAGE[1])
            if core and rng.random() < .55:          # under the bridge: shacks and kiosks packed tight
                bw, bd, set_, kind = rng.uniform(3, 5.5), rng.uniform(3, 5), rng.uniform(.6, 1.6), 'kiosk'
            elif c <= 4 or dvill < 380:             # main roads and Computer Village: shops and blocks
                bw, bd = rng.uniform(7, 15), rng.uniform(8, 15); set_ = rng.uniform(1, 3)
                kind = 'shop' if bw * bd < 160 and rng.random() < .75 else 'block' if bw * bd > 150 else 'house'
            else:                                   # side streets: houses (face-me-I-face-you, bungalows)
                bw, bd = rng.uniform(8, 14), rng.uniform(9, 15); set_ = rng.uniform(1.5, 4.5); kind = 'house'
            off = hw + set_ + bd / 2
            cx, cz = mx + nx * off, mz + nz * off
            face = 3 if side > 0 else 1                # the box side looking at the road (0:+u 1:+v 2:-u 3:-v)
            ok = place(cx, cz, bw, bd, ang, kind, face, set_ + bd / 2)
            if ok and rng.random() < (.75 if core else .55):   # a second row behind
                bw2, bd2 = (rng.uniform(3, 5), rng.uniform(3, 5)) if core else (rng.uniform(8, 13), rng.uniform(8, 13))
                off2 = off + bd / 2 + rng.uniform(1.2, 3) + bd2 / 2
                place(mx + nx * off2, mz + nz * off2, bw2, bd2, ang, 'kiosk' if core else 'house', face, off2 - hw)
            s += bw + (rng.uniform(.3, 1.2) if core else rng.uniform(1, 3.5))
print('Ikeja: OSM buildings', len(BLD) // 8, 'filled in', len(added))
B['bld'] = BLD + [v for b in added for v in b]

# ---------------------------------------------------------------- the join: Isolo Road (Mushin west edge) to Kudirat Abiola Way (Ikeja east edge)
NA = A['nodes']; EA = A['edges']; edgesA = [EA[k:k + 7] for k in range(0, len(EA), 7)]
hxA, hzA = A['half']
def deg(edges, nn):
    dg = [0] * nn
    for e in edges: dg[e[0]] += 1; dg[e[1]] += 1
    return dg
dA = deg(edgesA, len(NA) // 2); dB = deg(edgesB, len(NB) // 2)
nameA = lambda e: A['names'][e[4]] if e[4] >= 0 else ''
nameB = lambda e: B['names'][e[4]] if e[4] >= 0 else ''
mEnd = None
for e in edgesA:
    if nameA(e) != 'Isolo Road' or not e[5] & 8: continue
    for nd in (e[0], e[1]):
        if dA[nd] == 1 and NA[2 * nd] < -hxA + 8: mEnd = (nd, e)
assert mEnd, 'Isolo Road end not found'
mx, mz = NA[2 * mEnd[0]], NA[2 * mEnd[0] + 1]
kud = []   # (node, edge, into Ikeja?)
for e in edgesB:
    if nameB(e) != 'Kudirat Abiola Way': continue
    for nd in (e[0], e[1]):
        if dB[nd] == 1 and NB[2 * nd] > hxB - 8: kud.append((nd, e, nd == e[0]))   # the lane starts at the edge: traffic goes in
assert len(kud) == 2 and kud[0][2] != kud[1][2], kud
kz = sum(NB[2 * k[0] + 1] for k in kud) / 2
DX = -hxA - GAP - hxB; DZ = mz - kz
print('Ikeja moved by', round(DX), round(DZ))

# ---------------------------------------------------------------- merge
nA = len(NA) // 2
wayA = max(e[6] for e in edgesA) + 1
names = list(A['names']); nmap = {}
for i, s in enumerate(B['names']):
    if s not in names: names.append(s)
    nmap[i] = names.index(s)
nodes = list(NA) + [round(v + (DX if i % 2 == 0 else DZ), 2) for i, v in enumerate(NB)]
edges = [list(e) for e in edgesA] + [[e[0] + nA, e[1] + nA, e[2], e[3], nmap.get(e[4], -1) if e[4] >= 0 else -1, e[5], e[6] + wayA] for e in edgesB]
# the toll road: Mushin end -> M1 (Mushin side of the gate) -> G (the gate) -> K (Ikeja side) -> the two lanes
x_e = -hxA - GAP                               # Ikeja's east edge
gx = (mx + x_e) / 2
def addn(x, z):
    nodes.extend([round(x, 2), round(z, 2)]); return len(nodes) // 2 - 1
M1 = addn(mx - 25, mz); G = addn(gx, mz); K = addn(x_e + 22, mz)
nm_toll = len(names); names.append('Under Bridge Toll Road')
way = max(e[6] for e in edges) + 1
DRIVE = 8
edges.append([mEnd[0], M1, 2, 14, nm_toll, DRIVE, way])
edges.append([M1, G, 2, 14, nm_toll, DRIVE, way])
edges.append([G, K, 2, 14, nm_toll, DRIVE, way])
for nd, e, into in kud:
    gnd = nd + nA
    if into: edges.append([K, gnd, 2, 9, nm_toll, DRIVE | 1, way])
    else: edges.append([gnd, K, 2, 9, nm_toll, DRIVE | 1, way])
# Ikeja's drivable streets were worked out on their own; joined both ways through the gate they stay one network

def off_pts(p): return [round(v + (DX if i % 2 == 0 else DZ), 1) for i, v in enumerate(p)]
bld = list(A['bld'])
BB = B['bld']
for i in range(0, len(BB), 8):
    r = BB[i:i + 8]; bld += [round(r[0] + DX, 2), round(r[1] + DZ, 2)] + r[2:]
areas = A['areas'] + [dict(a, p=off_pts(a['p'])) for a in B['areas']]
pois = {}
for k in set(A['pois']) | set(B['pois']):
    la, lb = A['pois'].get(k, []), B['pois'].get(k, [])
    if k == 'signals': pois[k] = la + [j + nA for j in lb]
    elif k == 'xing': pois[k] = la + [[round(x + DX, 1), round(z + DZ, 1)] for x, z in lb]
    else: pois[k] = la + [[round(p[0] + DX, 1), round(p[1] + DZ, 1)] + p[2:] for p in lb]
cx, cz = CORE[0] + DX, CORE[1] + DZ
pois.setdefault('place', []).append([round(cx, 1), round(cz, 1), 'Under Bridge'])
pois['place'].append([round(VILLAGE[0] + DX, 1), round(VILLAGE[1] + DZ, 1), 'Computer Village'])
rail = A['rail'] + [dict(r, p=off_pts(r['p'])) for r in B['rail']]
water = A.get('water', []) + [dict(w, p=off_pts(w['p'])) for w in B.get('water', [])]
foot = A.get('foot', []) + [dict(f, p=off_pts(f['p'])) for f in B.get('foot', [])]

box = [round(-hxB + DX, 1), round(-hzB + DZ, 1), round(hxB + DX, 1), round(hzB + DZ, 1)]

# ---------------------------------------------------------------- flyovers: the long bridges become real decks you drive up onto
# each one-way carriageway marked as a bridge, in the direction of travel: its edges (merged world) and its centre line
nd = lambda i: (nodes[2 * i], nodes[2 * i + 1])
bre = [i for i, e in enumerate(edges) if e[5] & 4 and e[5] & 1 and box[0] <= nd(e[0])[0] <= box[2] and box[1] <= nd(e[0])[1] <= box[3]]
out_e = {}; in_n = set()
for i in bre: out_e.setdefault(edges[i][0], []).append(i); in_n.add(edges[i][1])
used = set(); fly = []
for i in bre:
    if i in used or edges[i][0] in in_n: continue          # start where no bridge piece leads in
    chain = [i]; used.add(i); cur = edges[i][1]
    while cur in out_e:
        nxt = [j for j in out_e[cur] if j not in used]
        if not nxt: break
        (px, pz), (qx, qz) = nd(edges[chain[-1]][0]), nd(edges[chain[-1]][1]); hx, hz = qx - px, qz - pz
        def turn(j):
            (ax, az), (bx, bz) = nd(edges[j][0]), nd(edges[j][1]); dx, dz = bx - ax, bz - az
            return -(hx * dx + hz * dz) / ((math.hypot(hx, hz) * math.hypot(dx, dz)) or 1)
        j = min(nxt, key=turn); chain.append(j); used.add(j); cur = edges[j][1]
    pts = [nd(edges[chain[0]][0])] + [nd(edges[j][1]) for j in chain]
    L = sum(math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]) for k in range(len(pts) - 1))
    if L >= 240:
        fly.append({'e': chain, 'p': [round(c, 2) for q in pts for c in q], 'w': round(max(edges[j][3] for j in chain), 2), 'L': round(L, 1),
                    'n': names[edges[chain[0]][4]] if edges[chain[0]][4] >= 0 else ''})
print('flyovers', [(f['n'], f['L'], len(f['e'])) for f in fly])
data = dict(A)
data.update(names=names, nodes=nodes, edges=[c for e in edges for c in e], bld=bld, areas=areas, pois=pois, rail=rail, water=water, foot=foot,
            land=[{'x0': box[0], 'z0': box[1], 'x1': box[2], 'z1': box[3]},
                  {'x0': round(x_e - 4, 1), 'z0': round(mz - 60, 1), 'x1': round(-hxA + 6, 1), 'z1': round(mz + 60, 1)}],
            districts=[{'id': 'ikeja', 'name': 'Ikeja Under Bridge', 'box': box,
                        'gate': {'x': round(gx, 1), 'z': round(mz, 1), 'fx': -1, 'fz': 0, 'hw': 7, 'mushin': [round(mx, 1), round(mz, 1)], 'ikeja': [round(x_e, 1), round(mz, 1)]},
                        'police': {'x': round(gx - 4, 1), 'z': round(mz - 34, 1), 'ry': 0},
                        'core': {'x': round(cx, 1), 'z': round(cz, 1), 'r': CORE_R},
                        'village': {'x': round(VILLAGE[0] + DX, 1), 'z': round(VILLAGE[1] + DZ, 1)},
                        'fly': fly,
                        'osm': {'origin': B['origin'], 'half': B['half']}}])
data['name'] = 'lagos'
json.dump(data, open(OUT, 'w'), separators=(',', ':'))
print('world', OUT, 'nodes', len(nodes) // 2, 'edges', len(edges), 'buildings', len(bld) // 8, 'size', len(json.dumps(data, separators=(',', ':'))) // 1024, 'KB')
print('gate at', round(gx), round(mz), 'core at', round(cx), round(cz), 'box', box)
