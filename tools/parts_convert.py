"""Turn a Tripo FBX made of many parts (each with its own colour picture or plain colour) into one GLB with one
texture atlas: every part keeps its own picture in a tile of the atlas.  Otherwise like tools/static_convert.py,
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
  const mats=[]; o.traverse(m=>{ if(m.isMesh) (Array.isArray(m.material)?m.material:[m.material]).forEach(x=>{ if(!mats.includes(x)) mats.push(x); }); });
  for(let i=0;i<400&&mats.some(x=>x.map&&(!x.map.image||!x.map.image.width));i++) await new Promise(r=>setTimeout(r,100));
  // one tile per material: its colour picture, or its plain colour; tiles sized by how much of the model they cover
  o.updateMatrixWorld(true); const parts=[];
  o.traverse(m=>{ if(!m.isMesh) return; let g=m.geometry.clone(); g.applyMatrix4(m.matrixWorld); if(g.index) g=g.toNonIndexed();
    const list=Array.isArray(m.material)?m.material:[m.material], groups=g.groups.length?g.groups:[{start:0,count:g.attributes.position.count,materialIndex:0}];
    for(const gr of groups){ const sub=new THREE.BufferGeometry(); for(const a of ['position','normal','uv']){ const A=g.attributes[a]; if(!A) continue; sub.setAttribute(a,new THREE.BufferAttribute(A.array.slice(gr.start*A.itemSize,(gr.start+gr.count)*A.itemSize),A.itemSize)); }
      if(!sub.attributes.uv) sub.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(gr.count*2).fill(.5),2));
      const mat=list[gr.materialIndex]||list[0]; let area=0; const P=sub.attributes.position; for(let i=0;i<P.count;i+=3){ const a=new THREE.Vector3().fromBufferAttribute(P,i), b=new THREE.Vector3().fromBufferAttribute(P,i+1), c=new THREE.Vector3().fromBufferAttribute(P,i+2); area+=b.sub(a).cross(c.sub(a)).length()/2; }
      parts.push({geo:sub,mat,area}); } });
  const byMat=new Map(); for(const p of parts){ const k=p.mat; byMat.set(k,(byMat.get(k)||0)+p.area); }
  const tiles=[...byMat.entries()].sort((a,b)=>b[1]-a[1]);
  const A=maxTex, n=Math.ceil(Math.sqrt(tiles.length)), ts=Math.floor(A/n), cv=document.createElement('canvas'); cv.width=cv.height=A; const cx=cv.getContext('2d'); cx.fillStyle='#808080'; cx.fillRect(0,0,A,A);
  const where=new Map(); tiles.forEach(([mat],i)=>{ const col=i%%n, row=Math.floor(i/n), x=col*ts, y=row*ts; where.set(mat,{col,row});
    const im=mat.map&&mat.map.image; if(im&&im.width){ cx.drawImage(im,x,y,ts,ts); if(mat.color&&mat.color.getHex()!==0xffffff){ cx.globalCompositeOperation='multiply'; cx.fillStyle='#'+mat.color.getHexString(); cx.fillRect(x,y,ts,ts); cx.globalCompositeOperation='source-over'; } }
    else { cx.fillStyle='#'+(mat.color?mat.color.getHexString():'888888'); cx.fillRect(x,y,ts,ts); } });
  const pad=1.5/ts;
  for(const p of parts){ const w=where.get(p.mat), uv=p.geo.attributes.uv; for(let i=0;i<uv.count;i++){ let u=uv.getX(i), v=uv.getY(i); u=Math.min(1-pad,Math.max(pad,u-Math.floor(u)===0&&u>=1?1:u-Math.floor(u))); v=Math.min(1-pad,Math.max(pad,v-Math.floor(v)===0&&v>=1?1:v-Math.floor(v)));
      uv.setXY(i,(w.col+u)*ts/A,1-((w.row+1)*ts/A)+v*ts/A); } }
  let g=mergeGeometries(parts.map(p=>p.geo)); g=mergeVertices(g);
  g.computeBoundingBox(); if(zup) g.rotateX(-Math.PI/2);
  g.computeBoundingBox(); const bb=g.boundingBox, c=bb.getCenter(new THREE.Vector3()); g.translate(-c.x,-bb.min.y,-c.z);
  g.computeBoundingBox(); let s=g.boundingBox.getSize(new THREE.Vector3()); if(height>0){ const k=height/s.y; g.scale(k,k,k); } g.computeBoundingBox(); s=g.boundingBox.getSize(new THREE.Vector3());
  if(!g.attributes.normal) g.computeVertexNormals();
  const tex=new THREE.CanvasTexture(cv); tex.colorSpace=THREE.SRGBColorSpace; tex.flipY=true;
  const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({map:tex,roughness:.85,metalness:0})); mesh.name='model';
  const glb=await new GLTFExporter().parseAsync(mesh,{binary:true,maxTextureSize:maxTex});
  return {b64:b64(glb),size:[s.x,s.y,s.z].map(v=>+v.toFixed(2)),tris:(g.index?g.index.count:g.attributes.position.count)/3,tiles:tiles.length}; };
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
        r = pg.evaluate(f'window.convert({json.dumps(name + "/" + fbx.name)},{h},2048,{"false" if "--yup" in sys.argv else "true"})')
        (OUT / f'{name}.glb').write_bytes(base64.b64decode(r.pop('b64'))); print(name, r, flush=True)
    print('errors', errs[:3]); b.close()
