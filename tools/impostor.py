"""Tree pictures for the game: render a detailed tree GLB from 8 sides into one strip (an "impostor" atlas), so the game
can draw every tree as a single picture that always faces you and shows the side you are looking at.

    python3 tools/impostor.py SRC.glb OUT.glb GLTFPACK_PATH [frames=8] [frame_px=256]

OUT.glb holds one quad (width x height in metres, standing on y=0) with the strip as its colour texture (KTX2, alpha).
"""
import sys, json, base64, io, os, struct, subprocess, tempfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
from playwright.sync_api import sync_playwright

THREE = Path('/tmp/claude-0/-home-claude-naija-streets/aed368e3-68f2-530f-b05a-29430b01870d/scratchpad/play/three')
CDN = 'https://cdn.jsdelivr.net/npm/three@0.165.0/'
SRC, OUT, GP = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
N = int(sys.argv[4]) if len(sys.argv) > 4 else 8; FP = int(sys.argv[5]) if len(sys.argv) > 5 else 256

HTML = """<!doctype html><html><body style="margin:0"><canvas id=c></canvas><script type="importmap">{"imports":{"three":"%sbuild/three.module.js","three/addons/":"%sexamples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three'; import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const cv=document.getElementById('c'); const r=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true,preserveDrawingBuffer:true}); r.outputColorSpace=THREE.SRGBColorSpace;
window.render=async(n,fw)=>{ const g=await new GLTFLoader().loadAsync('http://i.local/src.glb'); const o=g.scene; o.updateMatrixWorld(true);
  let rad=0, top=0; o.traverse(m=>{ if(!m.isMesh) return; m.material.side=THREE.DoubleSide; const p=m.geometry.attributes.position, v=new THREE.Vector3(); for(let i=0;i<p.count;i++){ v.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld); rad=Math.max(rad,Math.hypot(v.x,v.z)); top=Math.max(top,v.y); } });
  const W=2*rad*1.02, H=top*1.02, fh=Math.min(2,Math.max(1,Math.round(H/W)))*fw; r.setPixelRatio(1); r.setSize(fw,fh,false); r.setClearColor(0x000000,0);
  const sc=new THREE.Scene(); sc.add(o); sc.add(new THREE.HemisphereLight(0xfffbf0,0x4a5a3a,2.3)); const dl=new THREE.DirectionalLight(0xffffff,1.1); sc.add(dl);
  const cam=new THREE.OrthographicCamera(-W/2,W/2,H,0,.1,rad*8); const out=[];
  for(let k=0;k<n;k++){ const a=k/n*Math.PI*2, cx=Math.sin(a), cz=Math.cos(a); cam.position.set(cx*rad*3,0,cz*rad*3); cam.up.set(0,1,0); cam.lookAt(0,0,0); cam.updateProjectionMatrix();
    dl.position.set(Math.sin(a+.6)*10,14,Math.cos(a+.6)*10); r.render(sc,cam); out.push(cv.toDataURL('image/png')); }
  return {frames:out,W,H,fh}; };
window.ready=true;
</script></body></html>""" % (CDN, CDN)

def glb_quad(path, W, H, png):
    # a W x H quad standing on y=0, uv (0,0) top-left as glTF expects; texture = the strip
    P = np.array([[-W/2, 0, 0], [W/2, 0, 0], [W/2, H, 0], [-W/2, H, 0]], np.float32); UV = np.array([[0, 1], [1, 1], [1, 0], [0, 0]], np.float32)
    Nn = np.array([[0, 0, 1]] * 4, np.float32); I = np.array([0, 1, 2, 0, 2, 3], np.uint16)
    parts = [P.tobytes(), Nn.tobytes(), UV.tobytes(), I.tobytes() + b'\0\0', png + b'\0' * ((-len(png)) % 4)]
    off = 0; views = []
    for i, pb in enumerate(parts): views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(pb) if i < 4 else len(png)}); off += len(pb)
    views[3]['byteLength'] = 12
    j = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': 'tree'}],
         'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'TEXCOORD_0': 2}, 'indices': 3, 'material': 0}]}],
         'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': .9}, 'alphaMode': 'MASK', 'alphaCutoff': .5, 'doubleSided': True}],
         'textures': [{'source': 0, 'sampler': 0}], 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
         'images': [{'bufferView': 4, 'mimeType': 'image/png'}],
         'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 4, 'type': 'VEC3', 'min': P.min(0).tolist(), 'max': P.max(0).tolist()},
                       {'bufferView': 1, 'componentType': 5126, 'count': 4, 'type': 'VEC3'}, {'bufferView': 2, 'componentType': 5126, 'count': 4, 'type': 'VEC2'},
                       {'bufferView': 3, 'componentType': 5123, 'count': 6, 'type': 'SCALAR'}],
         'bufferViews': views, 'buffers': [{'byteLength': off}]}
    js = json.dumps(j).encode(); js += b' ' * ((-len(js)) % 4); binb = b''.join(parts)
    open(path, 'wb').write(struct.pack('<4sII', b'glTF', 2, 28 + len(js) + len(binb)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(binb), b'BIN\0') + binb)

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader']); pg = b.new_page()
    def route(rt):
        u = rt.request.url
        if u == 'http://i.local/': return rt.fulfill(body=HTML, headers={'Content-Type': 'text/html'})
        if u == 'http://i.local/src.glb': return rt.fulfill(body=SRC.read_bytes())
        if u.startswith(CDN): return rt.fulfill(body=(THREE / u[len(CDN):]).read_bytes(), headers={'Content-Type': 'application/javascript'})
        return rt.abort()
    pg.route('**/*', route); pg.goto('http://i.local/'); pg.wait_for_function('window.ready===true', timeout=60000)
    r = pg.evaluate(f'window.render({N},{FP})'); b.close()
frames = [Image.open(io.BytesIO(base64.b64decode(f.split(',')[1]))).convert('RGBA') for f in r['frames']]
fw, fh = frames[0].size; strip = Image.new('RGBA', (fw * N, fh))
for i, f in enumerate(frames): strip.paste(f, (i * fw, 0))
# let leaf colours bleed into the empty pixels so far-away (blurred) trees keep green edges instead of dark halos
a = np.asarray(strip).astype(np.float32) / 255; al = a[..., 3:4]
pre = Image.fromarray((np.concatenate([a[..., :3] * al, al], -1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))
pb = np.asarray(pre).astype(np.float32) / 255; fill = pb[..., :3] / np.maximum(pb[..., 3:4], 1e-3)
rgb = np.where(al > .02, a[..., :3], np.clip(fill, 0, 1)); out = np.concatenate([rgb, al], -1)
img = Image.fromarray((out * 255).astype(np.uint8)); buf = io.BytesIO(); img.save(buf, 'PNG'); img.save(str(OUT.with_suffix('.png')))
with tempfile.TemporaryDirectory() as td:
    raw = os.path.join(td, 'q.glb'); glb_quad(raw, r['W'], r['H'], buf.getvalue())
    subprocess.run([GP, '-i', raw, '-o', str(OUT), '-tc', '-noq'], check=True, capture_output=True)
print(OUT.name, 'frames', N, 'size %.2f x %.2f m' % (r['W'], r['H']), 'strip', img.size, round(OUT.stat().st_size / 1024), 'KB')
