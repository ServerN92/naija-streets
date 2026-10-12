"""Minimal FBX binary reader for big static meshes (Meshy/Tripo exports): writes OBJ + MTL + the embedded textures.
python3 fbxbin.py IN.fbx OUTDIR [name]"""
import sys, struct, zlib, os
import numpy as np

def read_fbx(path):
    d = open(path, 'rb').read()
    assert d[:20] == b'Kaydara FBX Binary  ', 'not a binary FBX'
    ver = struct.unpack_from('<I', d, 23)[0]
    big = ver >= 7500
    def prop(o):
        t = chr(d[o]); o += 1
        if t == 'Y': return struct.unpack_from('<h', d, o)[0], o + 2
        if t == 'C': return d[o], o + 1
        if t == 'I': return struct.unpack_from('<i', d, o)[0], o + 4
        if t == 'F': return struct.unpack_from('<f', d, o)[0], o + 4
        if t == 'D': return struct.unpack_from('<d', d, o)[0], o + 8
        if t == 'L': return struct.unpack_from('<q', d, o)[0], o + 8
        if t in 'fdlib':
            n, enc, cl = struct.unpack_from('<III', d, o); o += 12; raw = d[o:o + cl]; o += cl
            if enc: raw = zlib.decompress(raw)
            dt = {'f': '<f4', 'd': '<f8', 'l': '<i8', 'i': '<i4', 'b': 'u1'}[t]
            return np.frombuffer(raw, dtype=dt, count=n), o
        if t in 'SR':
            n = struct.unpack_from('<I', d, o)[0]; o += 4; v = d[o:o + n]; o += n
            return (v.decode('utf8', 'replace') if t == 'S' else v), o
        raise ValueError('prop type ' + t)
    def node(o):
        if big: end, np_, pl = struct.unpack_from('<QQQ', d, o); o += 24
        else: end, np_, pl = struct.unpack_from('<III', d, o); o += 12
        if end == 0: return None, o
        nl = d[o]; o += 1; name = d[o:o + nl].decode(); o += nl
        props = []
        for _ in range(np_):
            v, o = prop(o); props.append(v)
        kids = []
        while o < end:
            k, o2 = node(o)
            if k is None: o = o2; break
            kids.append(k); o = o2
        return {'name': name, 'props': props, 'kids': kids}, end
    o = 27; top = []
    while o < len(d) - 200:
        n, o2 = node(o)
        if n is None: break
        top.append(n); o = o2
    return top, ver

def kid(n, name):
    for k in n['kids']:
        if k['name'] == name: return k
    return None

def main():
    src, out = sys.argv[1], sys.argv[2]; name = sys.argv[3] if len(sys.argv) > 3 else 'model'
    os.makedirs(out, exist_ok=True)
    top, ver = read_fbx(src)
    objs = next(n for n in top if n['name'] == 'Objects')
    gs = next((n for n in top if n['name'] == 'GlobalSettings'), None)
    unit = 1.0; up = 1
    if gs:
        p70 = kid(gs, 'Properties70')
        for p in (p70['kids'] if p70 else []):
            if p['props'][0] == 'UnitScaleFactor': unit = p['props'][-1]
            if p['props'][0] == 'UpAxis': up = p['props'][-1]
    print('fbx version', ver, 'unit', unit, 'up', up)
    geos = [n for n in objs['kids'] if n['name'] == 'Geometry' and len(n['props']) > 2 and n['props'][2] == 'Mesh']
    vids = [n for n in objs['kids'] if n['name'] == 'Video']
    texnames = []
    for v in vids:
        c = kid(v, 'Content'); fn = kid(v, 'RelativeFilename') or kid(v, 'Filename')
        fname = os.path.basename(fn['props'][0].replace('\\', '/')) if fn else 'tex.bin'
        if c and c['props'] and isinstance(c['props'][0], (bytes, bytearray)) and len(c['props'][0]) > 100:
            open(os.path.join(out, fname), 'wb').write(c['props'][0]); texnames.append(fname)
    print('textures', texnames)
    V_all, UV_all, F = [], [], []; vo = 0; uo = 0
    for g in geos:
        V = kid(g, 'Vertices')['props'][0].reshape(-1, 3).astype(np.float64)
        PVI = kid(g, 'PolygonVertexIndex')['props'][0].astype(np.int64)
        le = kid(g, 'LayerElementUV'); uv = uvi = None; mode = None
        if le:
            uv = kid(le, 'UV')['props'][0].reshape(-1, 2); ui = kid(le, 'UVIndex'); uvi = ui['props'][0].astype(np.int64) if ui else None
            mode = kid(le, 'MappingInformationType')['props'][0]
        # polygons: ends where index < 0
        ends = np.where(PVI < 0)[0]; idx = np.where(PVI < 0, ~PVI, PVI)
        starts = np.concatenate([[0], ends[:-1] + 1])
        if uv is not None and mode == 'ByPolygonVertex': pvuv = uvi if uvi is not None else np.arange(len(PVI))
        elif uv is not None: pvuv = idx   # ByVertice / ByControlPoint
        else: pvuv = None
        tris = []
        for s, e in zip(starts, ends):
            for k in range(s + 1, e):
                tris.append((s, k, k + 1))
        tris = np.array(tris, dtype=np.int64)
        fv = idx[tris] + vo; fu = (pvuv[tris] + uo) if pvuv is not None else None
        F.append((fv, fu)); V_all.append(V); UV_all.append(uv if uv is not None else np.zeros((0, 2)))
        vo += len(V); uo += len(UV_all[-1])
        print('geometry', g['props'][1], 'verts', len(V), 'polys', len(ends), 'tris', len(tris), 'uv', None if uv is None else len(uv), mode)
    V = np.concatenate(V_all)
    for m in [n for n in objs['kids'] if n['name'] == 'Model']:
        p70 = kid(m, 'Properties70')
        for p in (p70['kids'] if p70 else []):
            if p['props'][0] in ('Lcl Translation', 'Lcl Rotation', 'Lcl Scaling', 'PreRotation', 'GeometricRotation', 'GeometricScaling'): print('model', m['props'][1], p['props'][0], [round(x, 3) for x in p['props'][-3:]])
    for m in [n for n in objs['kids'] if n['name'] == 'Model']:
        p70 = kid(m, 'Properties70')
        for p in (p70['kids'] if p70 else []):
            if p['props'][0] == 'Lcl Rotation':
                rx, ry, rz = [np.radians(x) for x in p['props'][-3:]]
                Rx = np.array([[1,0,0],[0,np.cos(rx),-np.sin(rx)],[0,np.sin(rx),np.cos(rx)]]); Ry = np.array([[np.cos(ry),0,np.sin(ry)],[0,1,0],[-np.sin(ry),0,np.cos(ry)]]); Rz = np.array([[np.cos(rz),-np.sin(rz),0],[np.sin(rz),np.cos(rz),0],[0,0,1]])
                V = V @ (Rz @ Ry @ Rx).T
    UV = np.concatenate(UV_all)
    if up == 2: V = V[:, [0, 2, 1]] * np.array([1, 1, -1])
    lo, hi = V.min(0), V.max(0); print('size m', (hi - lo).round(3))
    with open(os.path.join(out, name + '.mtl'), 'w') as f:
        f.write('newmtl m\nKd 1 1 1\n' + (f'map_Kd {texnames[0]}\n' if texnames else ''))
    with open(os.path.join(out, name + '.obj'), 'w') as f:
        f.write(f'mtllib {name}.mtl\no {name}\n')
        np.savetxt(f, V, fmt='v %.5f %.5f %.5f')
        if len(UV): np.savetxt(f, UV, fmt='vt %.5f %.5f')
        f.write('usemtl m\n')
        for fv, fu in F:
            if fu is not None and len(UV):
                a = np.concatenate([fv + 1, fu + 1], axis=1)[:, [0, 3, 1, 4, 2, 5]]
                np.savetxt(f, a, fmt='f %d/%d %d/%d %d/%d')
            else: np.savetxt(f, fv + 1, fmt='f %d %d %d')
    print('wrote', os.path.join(out, name + '.obj'))
main()
