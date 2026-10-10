"""Make a low-detail version (LOD) of a Tripo model.
1. weld positions and simplify the shape with gltfpack (shape only, so UV seams don't block it)
2. re-bake the original colour texture onto the new mesh (per-triangle atlas)
3. compress with gltfpack (meshopt geometry + KTX2 texture)
usage: python3 lod.py SRC.glb OUT.glb TARGET_TRIS TEX_SIZE GLTFPACK_PATH"""
import sys, os, io, json, struct, subprocess, tempfile, numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from optimize import read_glb, acc, image, node_matrix, write_glb
from bake import morton
from scipy.spatial import cKDTree

def write_pos_glb(path, P, T):
    P = P.astype(np.float32); idx = T.astype(np.uint32).ravel()
    pb = P.tobytes(); ib = idx.tobytes()
    j = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
         'meshes': [{'primitives': [{'attributes': {'POSITION': 0}, 'indices': 1}]}],
         'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': len(P), 'type': 'VEC3', 'min': P.min(0).tolist(), 'max': P.max(0).tolist()},
                       {'bufferView': 1, 'componentType': 5125, 'count': len(idx), 'type': 'SCALAR'}],
         'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(pb), 'target': 34962}, {'buffer': 0, 'byteOffset': len(pb), 'byteLength': len(ib), 'target': 34963}],
         'buffers': [{'byteLength': len(pb) + len(ib)}]}
    js = json.dumps(j).encode(); js += b' ' * ((-len(js)) % 4); binb = pb + ib; binb += b'\0' * ((-len(binb)) % 4)
    open(path, 'wb').write(struct.pack('<4sII', b'glTF', 2, 28 + len(js) + len(binb)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(binb), b'BIN\0') + binb)

def lod(src, dst, target, tex, gp, crease=38):
    j, b = read_glb(src); p = j['meshes'][0]['primitives'][0]
    P0 = acc(j, b, p['attributes']['POSITION']).astype(np.float64); UV0 = acc(j, b, p['attributes']['TEXCOORD_0']).astype(np.float64)
    I0 = acc(j, b, p['indices']).reshape(-1, 3).astype(np.int64)
    M = node_matrix(j); P0 = (np.c_[P0, np.ones(len(P0))] @ M.T)[:, :3]
    img = np.asarray(image(j, b, j['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']).convert('RGB')); ih, iw = img.shape[:2]
    # weld by position
    q = np.round(P0 / (np.ptp(P0, 0).max() * 1e-5)).astype(np.int64)
    _, first, inv = np.unique(q, axis=0, return_index=True, return_inverse=True); inv = inv.ravel()
    PW = P0[first]; TW = inv[I0]; ok = (TW[:, 0] != TW[:, 1]) & (TW[:, 1] != TW[:, 2]) & (TW[:, 0] != TW[:, 2]); TW = TW[ok]
    with tempfile.TemporaryDirectory() as td:
        a = os.path.join(td, 'a.glb'); o = os.path.join(td, 'o.glb')
        write_pos_glb(a, PW, TW)
        subprocess.run([gp, '-i', a, '-o', o, '-si', str(target / len(TW)), '-se', '1', '-noq'], check=True, capture_output=True)
        j2, b2 = read_glb(o); p2 = j2['meshes'][0]['primitives'][0]
        NP = acc(j2, b2, p2['attributes']['POSITION']).astype(np.float64); T = acc(j2, b2, p2['indices']).reshape(-1, 3).astype(np.int64)
        M2 = np.eye(4)
        for n in j2['nodes']:
            if 'mesh' in n:
                if 'matrix' in n: M2 = np.array(n['matrix']).reshape(4, 4).T
                else:
                    S = np.diag(list(n.get('scale', [1, 1, 1])) + [1]); Tm = np.eye(4); Tm[:3, 3] = n.get('translation', [0, 0, 0]); M2 = Tm @ S
        NP = (np.c_[NP, np.ones(len(NP))] @ M2.T)[:, :3]
    nt = len(T); order = np.argsort(morton(NP[T].mean(1))); T = T[order]
    C = int(np.ceil(np.sqrt(nt / 2))); s = tex / C
    k = np.arange(nt) // 2; half = np.arange(nt) % 2; cx = (k % C) * s; cy = (k // C) * s; pad = .9
    L0 = np.where(half[:, None] == 0, np.c_[cx + pad, cy + pad], np.c_[cx + s - pad, cy + s - pad])
    L1 = np.where(half[:, None] == 0, np.c_[cx + s - 2 * pad, cy + pad], np.c_[cx + 2 * pad, cy + s - pad])
    L2 = np.where(half[:, None] == 0, np.c_[cx + pad, cy + s - 2 * pad], np.c_[cx + s - pad, cy + 2 * pad])
    ys, xs = np.mgrid[0:tex, 0:tex]; px = xs + .5; py = ys + .5
    ci = np.minimum((px // s).astype(int), C - 1); cj = np.minimum((py // s).astype(int), C - 1); kk = cj * C + ci
    u = (px - ci * s) / s; v = (py - cj * s) / s; hh = (u + v > 1).astype(int); tri = kk * 2 + hh; valid = tri < nt; tri = np.where(valid, tri, 0)
    A_, B_, C_ = L0[tri], L1[tri], L2[tri]
    den = (B_[..., 1] - C_[..., 1]) * (A_[..., 0] - C_[..., 0]) + (C_[..., 0] - B_[..., 0]) * (A_[..., 1] - C_[..., 1])
    w0 = ((B_[..., 1] - C_[..., 1]) * (px - C_[..., 0]) + (C_[..., 0] - B_[..., 0]) * (py - C_[..., 1])) / den
    w1 = ((C_[..., 1] - A_[..., 1]) * (px - C_[..., 0]) + (A_[..., 0] - C_[..., 0]) * (py - C_[..., 1])) / den; w2 = 1 - w0 - w1
    V = NP[T[tri]]; pos = w0[..., None] * V[..., 0, :] + w1[..., None] * V[..., 1, :] + w2[..., None] * V[..., 2, :]
    tree = cKDTree(P0); _, nn = tree.query(pos[valid], k=4, workers=-1)
    uvs = UV0[nn]; tx = np.clip((uvs[..., 0] % 1) * iw, 0, iw - 1).astype(int); ty = np.clip((uvs[..., 1] % 1) * ih, 0, ih - 1).astype(int)
    col = np.median(img[ty, tx].astype(np.float32), axis=1)
    out = np.zeros((tex, tex, 3), np.uint8); out[valid] = np.clip(col, 0, 255).astype(np.uint8)
    Pc = NP[T].reshape(-1, 3); UVc = np.stack([L0, L1, L2], 1).reshape(-1, 2) / tex
    fn = np.cross(NP[T[:, 1]] - NP[T[:, 0]], NP[T[:, 2]] - NP[T[:, 0]]); fnu = fn / (np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12)
    vn = np.zeros_like(NP)
    for qq in range(3): np.add.at(vn, T[:, qq], fn)
    vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12
    Nc = vn[T].copy(); cosT = np.cos(np.radians(crease))
    for qq in range(3):
        bad = (Nc[:, qq] * fnu).sum(1) < cosT; Nc[bad, qq] = fnu[bad]
    Nc = Nc.reshape(-1, 3); Ti = np.arange(len(Pc)).reshape(-1, 3)
    bio = io.BytesIO(); Image.fromarray(out).save(bio, 'PNG')
    with tempfile.TemporaryDirectory() as td:
        mid = os.path.join(td, 'm.glb'); write_glb(mid, Pc, Nc, UVc, Ti, bio.getvalue(), .88, 0.)
        # write_glb tags the image as jpeg; fix the mime type for PNG
        jj, bb = read_glb(mid); jj['images'][0]['mimeType'] = 'image/png'
        js = json.dumps(jj, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
        open(mid, 'wb').write(struct.pack('<4sII', b'glTF', 2, 28 + len(js) + len(bb)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(bb), b'BIN\0') + bb)
        subprocess.run([gp, '-i', mid, '-o', dst, '-c', '-tc', '-tq', '9'], check=True, capture_output=True)
    print(f'{os.path.basename(src)} -> {os.path.basename(dst)}: {len(I0)} -> {nt} tris, tex {tex}, {os.path.getsize(dst)//1024}KB')

if __name__ == '__main__':
    lod(sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5])
