import json, struct, numpy as np
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def read(path):
    d = open(path, 'rb').read(); assert d[:4] == b'glTF'
    n = struct.unpack_from('<I', d, 12)[0]; js = json.loads(d[20:20 + n]); off = 20 + n
    bin_ = None
    if off < len(d):
        bl = struct.unpack_from('<I', d, off)[0]; bin_ = d[off + 8: off + 8 + bl]
    def acc(i):
        a = js['accessors'][i]; bv = js['bufferViews'][a['bufferView']]
        dt = CT[a['componentType']]; nc = NC[a['type']]; st = bv.get('byteStride')
        o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        if st and st != np.dtype(dt).itemsize * nc:
            raw = np.frombuffer(bin_, np.uint8, a['count'] * st, o).reshape(a['count'], st)[:, :np.dtype(dt).itemsize * nc]
            arr = raw.copy().view(dt).reshape(a['count'], nc)
        else: arr = np.frombuffer(bin_, dt, a['count'] * nc, o).reshape(a['count'], nc)
        if a.get('normalized'):
            arr = arr.astype(float) / {np.int8: 127, np.uint8: 255, np.int16: 32767, np.uint16: 65535}[dt]
        return arr
    return js, acc
