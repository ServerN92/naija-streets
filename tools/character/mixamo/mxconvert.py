"""Mixamo characters (FBX with skin) -> game files: one skinned GLB per character, in metres, every material kept,
with its diffuse, normal and roughness (from gloss) pictures. Textures are added here in Python (the browser only
does the geometry and skin), so big 4K files don't run the page out of memory.

  python3 mxconvert.py OUT_DIR [id ...]
"""
import sys, os, io, json, base64, struct
from pathlib import Path
from PIL import Image
import numpy as np
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fbxtex import materials
from fbxstrip import strip
STRIP = Path(os.path.dirname(os.path.abspath(__file__))) / 'stripped'; STRIP.mkdir(exist_ok=True)

UP = Path('/mnt/user-data/uploads')
THREE = Path('/tmp/claude-0/-home-claude-naija-streets/aed368e3-68f2-530f-b05a-29430b01870d/scratchpad/play/three')
CDN = 'https://cdn.jsdelivr.net/npm/three@0.165.0/'
PEOPLE = {   # id: (file, name, woman)
    'mx_dayo': ('Idle__1_.fbx', 'Dayo', 0), 'mx_emeka': ('Idle__6_.fbx', 'Emeka', 0), 'mx_tobi': ('Idle__7_.fbx', 'Tobi', 0),
    'mx_femi': ('Idle.fbx', 'Femi', 0), 'mx_mike': ('Idle__8_.fbx', 'Mike', 0), 'mx_chris': ('Idle__3_.fbx', 'Chris', 0),
    'mx_lin': ('Idle__2_.fbx', 'Lin', 1),
}
HTML = """<!doctype html><html><body><script type="importmap">{"imports":{"three":"%sbuild/three.module.js","three/addons/":"%sexamples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
THREE.TextureLoader.prototype.load=function(url){ const t=new THREE.Texture(); t.userData.url=url; return t; };   // pictures are added later, in Python
const b64=ab=>{ const u8=new Uint8Array(ab); let s=''; for(let k=0;k<u8.length;k+=32768) s+=String.fromCharCode.apply(null,u8.subarray(k,k+32768)); return btoa(s); };
window.character=async(file)=>{ const o=new FBXLoader().parse(await (await fetch('http://conv.local/'+file)).arrayBuffer(),''); o.animations=[];
  const used=new Map(), info=[];
  o.traverse(m=>{ if(!m.isMesh) return; const ms=Array.isArray(m.material)?m.material:[m.material];
    const nm=ms.map(x=>{ if(!used.has(x.name)) used.set(x.name,new THREE.MeshStandardMaterial({name:x.name,color:0xffffff,roughness:.6,metalness:0})); return used.get(x.name); });
    m.material=nm.length===1?nm[0]:nm; info.push([m.name,ms.map(x=>x.name),m.geometry.attributes.position.count]); });
  o.updateMatrixWorld(true); const bb=new THREE.Box3().setFromObject(o,true), h=bb.max.y-bb.min.y, unit=h>20?.01:1;
  const root=new THREE.Group(); root.name='npc'; o.scale.multiplyScalar(unit); root.add(o); root.updateMatrixWorld(true);
  const glb=await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:false});
  return {b64:b64(glb),height:+(h*unit).toFixed(3),minY:+(bb.min.y*unit).toFixed(3),meshes:info}; };
window.ready=true;
</script></body></html>""" % (CDN, CDN)

def glb_read(b):
    n = struct.unpack_from('<I', b, 12)[0]; js = json.loads(b[20:20 + n]); bl = struct.unpack_from('<I', b, 20 + n)[0]
    return js, bytearray(b[28 + n:28 + n + bl])
def glb_write(js, bin_):
    while len(bin_) % 4: bin_.append(0)
    j = json.dumps(js, separators=(',', ':')).encode()
    while len(j) % 4: j += b' '
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(j) + 8 + len(bin_)) + struct.pack('<I', len(j)) + b'JSON' + j + struct.pack('<I', len(bin_)) + b'BIN\x00' + bytes(bin_)
    return out

def add_image(js, bin_, data, mime):
    while len(bin_) % 4: bin_.append(0)
    off = len(bin_); bin_ += data
    js.setdefault('bufferViews', []).append(dict(buffer=0, byteOffset=off, byteLength=len(data))); bv = len(js['bufferViews']) - 1
    js.setdefault('images', []).append(dict(bufferView=bv, mimeType=mime)); im = len(js['images']) - 1
    js.setdefault('samplers', [dict(magFilter=9729, minFilter=9987, wrapS=10497, wrapT=10497)])
    js.setdefault('textures', []).append(dict(source=im, sampler=0)); return len(js['textures']) - 1

def enc(im, kind, q=88):
    b = io.BytesIO()
    if kind == 'png': im.save(b, 'PNG', optimize=True); return b.getvalue(), 'image/png'
    im.convert('RGB').save(b, 'JPEG', quality=q); return b.getvalue(), 'image/jpeg'

def finish(raw, matmap, pics, size=1024):
    js, bin_ = glb_read(raw); cache = {}
    def tex(key, fn):
        if (key, fn) in cache: return cache[(key, fn)]
        im = Image.open(io.BytesIO(pics[fn])); im.load(); im = im.transpose(Image.FLIP_TOP_BOTTOM)   # three.js uv (flipY) -> glTF uv
        if key == 'base':
            alpha = im.mode in ('RGBA', 'LA') and np.asarray(im.convert('RGBA'))[..., 3].min() < 250
            im = im.convert('RGBA' if alpha else 'RGB').resize((size, size), Image.LANCZOS); t = add_image(js, bin_, *enc(im, 'png' if alpha else 'jpg')); r = (t, alpha)
        elif key == 'normal':
            im = im.convert('RGB').resize((size, size), Image.LANCZOS); r = (add_image(js, bin_, *enc(im, 'jpg', 90)), False)
        else:   # gloss -> roughness in green
            g = np.asarray(im.convert('L').resize((size // 2, size // 2), Image.LANCZOS), np.float32) / 255.
            rough = np.clip(1 - g * .85, .25, 1.)
            a = np.zeros(g.shape + (3,), np.uint8); a[..., 0] = 255; a[..., 1] = (rough * 255).astype(np.uint8)
            r = (add_image(js, bin_, *enc(Image.fromarray(a), 'jpg', 90)), False)
        cache[(key, fn)] = r; return r
    for m in js.get('materials', []):
        mm = matmap.get(m.get('name', ''), {}); pb = m.setdefault('pbrMetallicRoughness', {}); pb['metallicFactor'] = 0.
        hairy = any(k in m['name'].lower() for k in ('hair', 'eyelash', 'lash', 'brow'))
        if 'DiffuseColor' in mm and mm['DiffuseColor'] in pics:
            t, alpha = tex('base', mm['DiffuseColor']); pb['baseColorTexture'] = dict(index=t)
            if hairy or 'TransparentColor' in mm: m['alphaMode'] = 'MASK'; m['alphaCutoff'] = .35; m['doubleSided'] = True
        if 'NormalMap' in mm and mm['NormalMap'] in pics: m['normalTexture'] = dict(index=tex('normal', mm['NormalMap'])[0], scale=1.)
        if 'ShininessExponent' in mm and mm['ShininessExponent'] in pics and not hairy: pb['metallicRoughnessTexture'] = dict(index=tex('rough', mm['ShininessExponent'])[0]); pb['roughnessFactor'] = 1.
        else: pb['roughnessFactor'] = .75 if hairy else .6
    js['buffers'][0]['byteLength'] = len(bin_) + (-len(bin_) % 4)
    return glb_write(js, bin_)

if __name__ == '__main__':
    OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
    only = sys.argv[2:] or list(PEOPLE)
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=6000'])
        pg = b.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        def route(rt):
            u = rt.request.url
            if u == 'http://conv.local/': return rt.fulfill(body=HTML, headers={'Content-Type': 'text/html'})
            if u.startswith('http://conv.local/'): return rt.fulfill(body=(STRIP / u.rsplit('/', 1)[1]).read_bytes(), headers={'Content-Type': 'application/octet-stream'})
            if u.startswith(CDN): return rt.fulfill(body=(THREE / u[len(CDN):]).read_bytes(), headers={'Content-Type': 'application/javascript'})
            return rt.abort()
        pg.route('**/*', route); pg.goto('http://conv.local/'); pg.wait_for_function('window.ready===true', timeout=60000)
        meta = {}
        for cid in only:
            f, name, fem = PEOPLE[cid]
            if not (STRIP / f).exists(): strip(str(UP / f), str(STRIP / f))
            r = pg.evaluate(f'window.character({json.dumps(f)})')
            raw = base64.b64decode(r.pop('b64')); (OUT / f'raw_{cid}.glb').write_bytes(raw); mm, pics = materials(str(UP / f))
            out = finish(raw, mm, pics); (OUT / f'{cid}.glb').write_bytes(out)
            meta[cid] = dict(r, name=name, f=fem, file=f); print(cid, name, r['height'], len(out) // 1024, 'KB', [m[:2] for m in r['meshes']], flush=True)
            pg.reload(); pg.wait_for_function('window.ready===true', timeout=60000)
        old = json.load(open(OUT / 'meta.json')) if (OUT / 'meta.json').exists() else {}; old.update(meta); json.dump(old, open(OUT / 'meta.json', 'w'), indent=1)
        print('errors', errs[:5]); b.close()
