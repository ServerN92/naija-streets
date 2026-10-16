"""Make Blender's vertex-colour .glb files lighter for phones, without changing how they look:
colours become 8-bit (from 32-bit floats), normals 8-bit (KHR_mesh_quantization), indices 16-bit when they fit.
Skinned models (bones, animations) keep everything else as it is.

    python3 tools/glb_compact.py in.glb [more.glb ...] -o outdir
"""
import json, struct, sys, os
import numpy as np


def read_glb(path):
    b = open(path, 'rb').read(); off = 12; ch = []
    while off < len(b):
        cl, ct = struct.unpack('<I4s', b[off:off + 8]); ch.append(b[off + 8:off + 8 + cl]); off += 8 + cl
    return json.loads(ch[0]), ch[1] if len(ch) > 1 else b''


NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
DT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8, 5120: np.int8, 5122: np.int16}


def get(j, bin_, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]; n = NC[a['type']]; dt = DT[a['componentType']]
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride')
    isz = np.dtype(dt).itemsize
    if stride and stride != n * isz:
        raw = np.frombuffer(bin_, dtype=np.uint8, count=stride * a['count'], offset=start).reshape(a['count'], stride)
        return raw[:, :n * isz].copy().view(dt).reshape(a['count'], n)
    arr = np.frombuffer(bin_, dtype=dt, count=a['count'] * n, offset=start)
    return arr.reshape(-1, n) if n > 1 else arr.copy()


def compact(path, out):
    j, bin_ = read_glb(path)
    data = bytearray(); views = []; accs = []; remap = {}

    def add(arr, comp, typ, target=None, norm=False, minmax=False):
        while len(data) % 4: data.append(0)
        off = len(data); b = arr.tobytes(); data.extend(b)
        bv = {'buffer': 0, 'byteOffset': off, 'byteLength': len(b)}
        if target: bv['target'] = target
        if typ in ('VEC3',) and arr.dtype.itemsize == 1: bv['byteStride'] = 4   # 8-bit VEC3 rows padded to 4 bytes
        views.append(bv)
        a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': int(arr.shape[0]), 'type': typ}
        if norm: a['normalized'] = True
        if minmax:
            v = arr.reshape(arr.shape[0], -1).astype(np.float64); a['min'] = v.min(0).tolist(); a['max'] = v.max(0).tolist()
        accs.append(a); return len(accs) - 1

    def copy_acc(i):
        if i in remap: return remap[i]
        a = j['accessors'][i]; arr = get(j, bin_, i)
        k = add(np.ascontiguousarray(arr), a['componentType'], a['type'], None, a.get('normalized', False), 'min' in a)
        if 'min' in a: accs[k]['min'] = a['min']; accs[k]['max'] = a['max']
        remap[i] = k; return k

    used_quant = False
    for m in j.get('meshes', []):
        for p in m['primitives']:
            at = p['attributes']; na = {}
            for name, i in at.items():
                if name == 'COLOR_0':
                    c = get(j, bin_, i).astype(np.float32)
                    if c.ndim == 1: c = c.reshape(-1, 1)
                    if j['accessors'][i]['componentType'] != 5126: na[name] = copy_acc(i); continue
                    c = np.clip(c[:, :3], 0, 1)
                    q = np.full((c.shape[0], 4), 255, np.uint8); q[:, :3] = np.round(c * 255)
                    na[name] = add(q, 5121, 'VEC3', 34962, True)   # 8-bit colour, rows padded to 4 bytes
                elif name == 'NORMAL' and j['accessors'][i]['componentType'] == 5126:
                    nrm = get(j, bin_, i).astype(np.float32); nrm /= np.maximum(1e-8, np.linalg.norm(nrm, axis=1, keepdims=True))
                    q = np.zeros((nrm.shape[0], 4), np.int8); q[:, :3] = np.round(nrm * 127)
                    na[name] = add(q, 5120, 'VEC3', 34962, True); used_quant = True
                else: na[name] = copy_acc(i)
            p['attributes'] = na
            if 'indices' in p:
                idx = get(j, bin_, p['indices']).astype(np.uint32)
                p['indices'] = add(idx.astype(np.uint16) if idx.max() < 65535 else idx, 5123 if idx.max() < 65535 else 5125, 'SCALAR', 34963)
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = copy_acc(s['inverseBindMatrices'])
    for an in j.get('animations', []):
        for sm in an['samplers']: sm['input'] = copy_acc(sm['input']); sm['output'] = copy_acc(sm['output'])
    j['accessors'] = accs; j['bufferViews'] = views
    while len(data) % 4: data.append(0)
    j['buffers'] = [{'byteLength': len(data)}]
    if used_quant:
        for k in ('extensionsUsed', 'extensionsRequired'):
            L = j.setdefault(k, [])
            if 'KHR_mesh_quantization' not in L: L.append('KHR_mesh_quantization')
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    glb = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(data)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(data), b'BIN\x00') + bytes(data)
    open(out, 'wb').write(glb)
    return os.path.getsize(path), len(glb)


if __name__ == '__main__':
    args = sys.argv[1:]; od = args[args.index('-o') + 1] if '-o' in args else '.'
    files = [a for i, a in enumerate(args) if a != '-o' and (i == 0 or args[i - 1] != '-o')]
    tot0 = tot1 = 0
    for f in files:
        a, b = compact(f, os.path.join(od, os.path.basename(f))); tot0 += a; tot1 += b
    print('compact: %d files, %d KB -> %d KB' % (len(files), tot0 // 1024, tot1 // 1024))
