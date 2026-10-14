"""Build the house models from tools/blender_houses.py without opening Blender.

    python3 tools/glb_build.py                      # every model in BUILDS
    python3 tools/glb_build.py dup_modern zinc_house  # just these (function names)

blender_houses.py only uses a small part of Blender (bmesh faces with a colour per corner), so this file stands in
for that part, collects the faces and writes the same kind of .glb the Blender exporter makes: one mesh, one
material, flat-shaded, vertex colours (COLOR_0, linear), Y up, front toward +Z. Files go to assets/models/.
The script still runs in Blender too, where you can look at the houses and export them yourself.
"""
import sys, os, types, json, struct, math, importlib.util

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'models')


# ---- a stand-in for the bits of bmesh / bpy the house script uses
class _Face:
    def __init__(self, vs):
        self.verts = vs
        self.loops = [{} for _ in vs]


class _Seq(list):
    def new(self, x):
        if isinstance(x, list):
            f = _Face(x)
            self.append(f)
            return f
        self.append(x)
        return x


class _BM:
    def __init__(self):
        self.verts, self.faces = _Seq(), _Seq()
        self.loops = types.SimpleNamespace(layers=types.SimpleNamespace(color=types.SimpleNamespace(new=lambda n: n)))

    def to_mesh(self, me):
        me.faces = [([tuple(v) for v in f.verts], [l.get('Col', (1, 1, 1, 1)) for l in f.loops]) for f in self.faces]

    def free(self):
        pass


bmesh = types.ModuleType('bmesh')
bmesh.new = _BM
bmesh.ops = types.SimpleNamespace(remove_doubles=lambda bm, verts, dist: None)


class _Coll(list):
    def __init__(self, make):
        super().__init__()
        self.make = make

    def new(self, *a):
        o = self.make(*a)
        self.append(o)
        return o

    def get(self, name):
        return next((o for o in self if o.name == name), None)


def _mesh(name):
    return types.SimpleNamespace(name=name, materials=[], faces=[], color_attributes=types.SimpleNamespace())


bpy = types.ModuleType('bpy')
bpy.data = types.SimpleNamespace(meshes=_Coll(_mesh), objects=_Coll(lambda n, me: types.SimpleNamespace(name=n, data=me, location=(0, 0, 0))),
                                 materials=_Coll(lambda n: types.SimpleNamespace(name=n)))
bpy.context = types.SimpleNamespace(scene=types.SimpleNamespace(collection=types.SimpleNamespace(objects=types.SimpleNamespace(link=lambda o: None))))
sys.modules['bmesh'] = bmesh
sys.modules['bpy'] = bpy


def lin(c):
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4


def write_glb(name, faces):
    """Triangulate (fan), flat normals, convert Z-up to Y-up, weld identical corners, write a .glb."""
    verts, index, idx = [], {}, []
    for pts, cols in faces:
        P = [(x, z, -y) for (x, y, z) in pts]
        # face normal (Newell)
        nx = ny = nz = 0.0
        for i in range(len(P)):
            a, b = P[i], P[(i + 1) % len(P)]
            nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1])
        L = math.sqrt(nx * nx + ny * ny + nz * nz)
        if L < 1e-9:
            continue
        n = (nx / L, ny / L, nz / L)
        ids = []
        for p, c in zip(P, cols):
            col = tuple(int(round(lin(min(1, max(0, v))) * 255)) for v in c[:3]) + (255,)
            key = (round(p[0], 4), round(p[1], 4), round(p[2], 4), round(n[0], 3), round(n[1], 3), round(n[2], 3), col)
            k = index.get(key)
            if k is None:
                k = index[key] = len(verts)
                verts.append((p, n, col))
            ids.append(k)
        for i in range(1, len(ids) - 1):
            if ids[0] != ids[i] and ids[i] != ids[i + 1] and ids[0] != ids[i + 1]:
                idx += [ids[0], ids[i], ids[i + 1]]
    nv = len(verts)
    pos = b''.join(struct.pack('<3f', *v[0]) for v in verts)
    nor = b''.join(struct.pack('<3f', *v[1]) for v in verts)
    col = b''.join(struct.pack('<4B', *v[2]) for v in verts)
    big = nv > 65535
    ind = struct.pack(f'<{len(idx)}{"I" if big else "H"}', *idx)
    pad = lambda b: b + b'\0' * ((4 - len(b) % 4) % 4)
    chunks = [pad(pos), pad(nor), pad(col), pad(ind)]
    offs, o = [], 0
    for c in chunks:
        offs.append(o)
        o += len(c)
    binb = b''.join(chunks)
    mn = [min(v[0][i] for v in verts) for i in range(3)]
    mx = [max(v[0][i] for v in verts) for i in range(3)]
    gl = {
        'asset': {'version': '2.0', 'generator': 'naija-streets glb_build.py'},
        'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': name}],
        'materials': [{'name': 'NS_House', 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': .85}}],
        'meshes': [{'name': name, 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'COLOR_0': 2}, 'indices': 3, 'material': 0}]}],
        'buffers': [{'byteLength': len(binb)}],
        'bufferViews': [{'buffer': 0, 'byteOffset': offs[0], 'byteLength': len(pos), 'target': 34962},
                        {'buffer': 0, 'byteOffset': offs[1], 'byteLength': len(nor), 'target': 34962},
                        {'buffer': 0, 'byteOffset': offs[2], 'byteLength': len(col), 'target': 34962},
                        {'buffer': 0, 'byteOffset': offs[3], 'byteLength': len(ind), 'target': 34963}],
        'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': nv, 'type': 'VEC3', 'min': mn, 'max': mx},
                      {'bufferView': 1, 'componentType': 5126, 'count': nv, 'type': 'VEC3'},
                      {'bufferView': 2, 'componentType': 5121, 'normalized': True, 'count': nv, 'type': 'VEC4'},
                      {'bufferView': 3, 'componentType': 5125 if big else 5123, 'count': len(idx), 'type': 'SCALAR'}],
    }
    js = json.dumps(gl, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binb)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binb), 0x004E4942) + binb
    path = os.path.join(OUT, name + '.glb')
    open(path, 'wb').write(out)
    return path, nv, len(idx) // 3, len(out)


def main(names):
    spec = importlib.util.spec_from_file_location('blender_houses', os.path.join(ROOT, 'tools', 'blender_houses.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    m.make_material = lambda: types.SimpleNamespace(name='NS_House')
    builds = [f for f in m.BUILDS if not names or f.__name__ in names]
    for fn in builds:
        for detail in (True, False):
            ob = fn(detail)
            path, nv, nt, size = write_glb(ob.name, ob.data.faces)
            print(f'{ob.name:18s} {nv:6d} verts {nt:6d} tris {size // 1024:5d} KB')


if __name__ == '__main__':
    main(sys.argv[1:])
