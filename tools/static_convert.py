"""Turn a Tripo/Meshy FBX (one textured object: tree, building, interior) into a plain GLB for tools/lod.py,
using three.js in headless Chromium: Y up, standing on y=0, centred, scaled to a real size, one mesh + colour texture.

    python3 tools/static_convert.py SRC_DIR OUT_DIR name:height_m [name:height_m ...]

SRC_DIR/<name>/ holds the .fbx (and its .fbm folder). Writes OUT_DIR/<name>.glb. Use height 0 to keep the file's size.
Files are taken as Z-up (Tripo, Meshy); add --yup for files that already stand on Y.
"""
import sys, json, base64
from pathlib import Path
from urllib.parse import unquote
from playwright.sync_api import sync_playwright

THREE = Path('/tmp/claude-0/-home-claude-naija-streets/aed368e3-68f2-530f-b05a-29430b01870d/scratchpad/play/three')
CDN = 'https://cdn.jsdelivr.net/npm/three@0.165.0/'
SRC = Path(sys.argv[1]); OUT = Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
JOBS = [(a.split(':')[0], float(a.split(':')[1]) if ':' in a else 0) for a in sys.argv[3:] if not a.startswith('--')]

HTML = """<!doctype html><html><body><script type="importmap">{"imports":{"three":"%sbuild/three.module.js","three/addons/":"%sexamples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
const b64=ab=>{ const u8=new Uint8Array(ab); let s=''; for(let k=0;k<u8.length;k+=32768) s+=String.fromCharCode.apply(null,u8.subarray(k,k+32768)); return btoa(s); };
window.convert=async(path,height,maxTex,zup)=>{ const o=await new FBXLoader().loadAsync('http://m.local/'+path);
  const maps=[]; o.traverse(m=>{ if(m.isMesh) (Array.isArray(m.material)?m.material:[m.material]).forEach(x=>{ if(x.map) maps.push(x.map); }); });
  for(let i=0;i<400&&maps.some(t=>!t.image||!t.image.width);i++) await new Promise(r=>setTimeout(r,100));
  o.updateMatrixWorld(true); const geos=[]; let map=null;
  o.traverse(m=>{ if(!m.isMesh) return; const g=m.geometry.clone(); g.applyMatrix4(m.matrixWorld); for(const a of Object.keys(g.attributes)) if(!['position','normal','uv'].includes(a)) g.deleteAttribute(a); g.clearGroups(); geos.push(g);
    const src=Array.isArray(m.material)?m.material[0]:m.material; if(!map&&src.map) map=src.map; });
  let g=geos.length>1?mergeGeometries(geos):geos[0]; if(!g.index) g=mergeVertices(g);   // indexed, for the shrinking tools
  g.computeBoundingBox(); let s=g.boundingBox.getSize(new THREE.Vector3()); if(zup) g.rotateX(-Math.PI/2);   // Tripo/Meshy files stand on Z: make Y up
  g.computeBoundingBox(); const bb=g.boundingBox, c=bb.getCenter(new THREE.Vector3()); g.translate(-c.x,-bb.min.y,-c.z);
  g.computeBoundingBox(); s=g.boundingBox.getSize(new THREE.Vector3()); if(height>0){ const k=height/s.y; g.scale(k,k,k); } g.computeBoundingBox(); s=g.boundingBox.getSize(new THREE.Vector3());
  if(!g.attributes.normal) g.computeVertexNormals();
  let tex=null; if(map&&map.image){ const im=map.image, n=Math.min(maxTex,im.width); const cv=document.createElement('canvas'); cv.width=cv.height=n; cv.getContext('2d').drawImage(im,0,0,n,n); tex=new THREE.CanvasTexture(cv); tex.colorSpace=THREE.SRGBColorSpace; tex.flipY=map.flipY; }
  const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({map:tex,roughness:.85,metalness:0})); mesh.name='model';
  const glb=await new GLTFExporter().parseAsync(mesh,{binary:true,maxTextureSize:maxTex});
  return {b64:b64(glb),size:[s.x,s.y,s.z].map(v=>+v.toFixed(2)),tris:(g.index?g.index.count:g.attributes.position.count)/3}; };
window.ready=true;
</script></body></html>""" % (CDN, CDN)

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader']); pg = b.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    def route(rt):
        u = rt.request.url
        if u == 'http://m.local/': return rt.fulfill(body=HTML, headers={'Content-Type': 'text/html'})
        if u.startswith('http://m.local/'):
            rel = unquote(u[len('http://m.local/'):]); p = SRC / rel
            if p.exists(): return rt.fulfill(body=p.read_bytes(), headers={'Content-Type': 'application/octet-stream'})
            hits = list((SRC / rel.split('/')[0]).rglob(Path(rel).name))
            if hits: return rt.fulfill(body=hits[0].read_bytes(), headers={'Content-Type': 'image/png'})
            return rt.fulfill(status=404, body='')
        if u.startswith(CDN): return rt.fulfill(body=(THREE / u[len(CDN):]).read_bytes(), headers={'Content-Type': 'application/javascript'})
        return rt.abort()
    pg.route('**/*', route); pg.goto('http://m.local/'); pg.wait_for_function('window.ready===true', timeout=60000)
    for name, h in JOBS:
        fbx = next((SRC / name).glob('*.fbx'))
        r = pg.evaluate(f'window.convert({json.dumps(name + "/" + fbx.name)},{h},4096,{"false" if "--yup" in sys.argv else "true"})')
        (OUT / f'{name}.glb').write_bytes(base64.b64decode(r.pop('b64'))); print(name, r, flush=True)
    print('errors', errs[:3]); b.close()
