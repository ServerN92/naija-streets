"""Turn Tripo/Meshy character FBX files into Mixamo-ready uploads (OBJ + MTL + JPG textures in one zip, Y up, facing +Z,
no old skeleton), using three.js in headless Chromium.

    python3 tools/mixamo_prep.py SRC_DIR OUT_DIR name[:recolor] [name ...]

SRC_DIR/<name>/ holds one .fbx and its .fbm texture folder. ":casual" repaints a revealing outfit as an opaque top and
jeans (texture only; face, hair, arms and shoes stay as they are). Writes OUT_DIR/<name>_for_mixamo.zip and a preview PNG.
"""
import sys, io, json, base64, zipfile
from pathlib import Path
from urllib.parse import unquote
import numpy as np
from PIL import Image, ImageFilter
from playwright.sync_api import sync_playwright

THREE = Path(__file__).resolve().parent.parent.parent / 'three'   # overridden below if missing
for cand in [Path('/tmp/claude-0/-home-claude-naija-streets/aed368e3-68f2-530f-b05a-29430b01870d/scratchpad/play/three')]:
    if cand.exists(): THREE = cand
CDN = 'https://cdn.jsdelivr.net/npm/three@0.165.0/'
SRC = Path(sys.argv[1]); OUT = Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
JOBS = [a.split(':') for a in sys.argv[3:]]
TEX = 2048   # texture size sent to Mixamo (and later to the game)

HTML = """<!doctype html><html><body style="margin:0"><canvas id=c width=520 height=680></canvas><script type="importmap">{"imports":{"three":"%sbuild/three.module.js","three/addons/":"%sexamples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {OBJExporter} from 'three/addons/exporters/OBJExporter.js';
const r=new THREE.WebGLRenderer({canvas:document.getElementById('c'),antialias:true,preserveDrawingBuffer:true}); r.outputColorSpace=THREE.SRGBColorSpace;
let model=null;
// load, drop the skeleton (keep the rest pose), stand it up (Y up, face +Z), feet on the ground, centred
window.load=async(path)=>{ const o=await new FBXLoader().loadAsync('http://m.local/'+path);
  const maps=[]; o.traverse(m=>{ if(m.isMesh) (Array.isArray(m.material)?m.material:[m.material]).forEach(x=>{ if(x.map) maps.push(x.map); }); });
  for(let i=0;i<300&&maps.some(t=>!t.image||!t.image.width);i++) await new Promise(r=>setTimeout(r,100));
  o.updateMatrixWorld(true); const root=new THREE.Group(); const mats=[]; let k=0;
  o.traverse(m=>{ if(!m.isMesh) return; const g=m.geometry.clone(); g.applyMatrix4(m.matrixWorld);
    for(const a of Object.keys(g.attributes)) if(!['position','normal','uv'].includes(a)) g.deleteAttribute(a);
    const src=Array.isArray(m.material)?m.material[0]:m.material; const name='m'+(k++);
    const mm=new THREE.MeshStandardMaterial({name,map:src.map||null,color:src.map?0xffffff:(src.color||new THREE.Color(0x888888)),roughness:.8}); if(mm.map) mm.map.colorSpace=THREE.SRGBColorSpace;
    let data=null; if(src.map&&src.map.image){ const im=src.map.image, n=Math.min(2048,im.width||2048); const cv=document.createElement('canvas'); cv.width=cv.height=n; cv.getContext('2d').drawImage(im,0,0,n,n); data=cv.toDataURL('image/png'); }
    mats.push({name,data,color:src.color?'#'+src.color.getHexString():'#888888'}); root.add(new THREE.Mesh(g,mm)); });
  let bb=new THREE.Box3().setFromObject(root), sz=bb.getSize(new THREE.Vector3());
  if(sz.z>sz.y*1.2) root.traverse(m=>{ if(m.isMesh){ m.geometry.rotateX(-Math.PI/2); } });   // Z up -> Y up, front -Y -> +Z
  bb=new THREE.Box3().setFromObject(root); const c=bb.getCenter(new THREE.Vector3());
  root.traverse(m=>{ if(m.isMesh){ m.geometry.translate(-c.x,-bb.min.y,-c.z); m.geometry.computeBoundingBox(); } });
  model=root; bb=new THREE.Box3().setFromObject(root); sz=bb.getSize(new THREE.Vector3());
  let tris=0; root.traverse(m=>{ if(m.isMesh) tris+=(m.geometry.index?m.geometry.index.count:m.geometry.attributes.position.count)/3; });
  return {mats,size:[sz.x,sz.y,sz.z],tris}; };
// every texel of the (single) texture -> where it sits on the body (x, height, z as 0..1 of the box), for repainting
window.posmap=(n)=>{ const bb=new THREE.Box3().setFromObject(model), sz=bb.getSize(new THREE.Vector3());
  const mat=new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{mn:{value:bb.min},sz:{value:sz}},
    vertexShader:'uniform vec3 mn; uniform vec3 sz; varying vec3 p; void main(){ p=(position-mn)/sz; gl_Position=vec4(uv*2.-1.,0.,1.); }',
    fragmentShader:'varying vec3 p; void main(){ gl_FragColor=vec4(p,1.); }'});
  const sc=new THREE.Scene(); model.traverse(m=>{ if(m.isMesh){ const q=new THREE.Mesh(m.geometry,mat); q.frustumCulled=false; sc.add(q); } });
  const rt=new THREE.WebGLRenderTarget(n,n,{type:THREE.FloatType}); r.setRenderTarget(rt); r.setClearColor(0x000000,0); r.clear(); r.render(sc,new THREE.Camera());
  const px=new Float32Array(n*n*4); r.readRenderTargetPixels(rt,0,0,n,n,px); r.setRenderTarget(null); rt.dispose();
  const u8=new Uint8Array(px.buffer); let s=''; for(let i=0;i<u8.length;i+=32768) s+=String.fromCharCode.apply(null,u8.subarray(i,i+32768)); return btoa(s); };
window.retexture=async(dataUrl)=>{ const t=await new THREE.TextureLoader().loadAsync(dataUrl); t.colorSpace=THREE.SRGBColorSpace; t.flipY=true; model.traverse(m=>{ if(m.isMesh){ m.material.map=t; m.material.needsUpdate=true; } }); };
window.obj=()=>new OBJExporter().parse(model);
window.preview=()=>{ const bb=new THREE.Box3().setFromObject(model), sz=bb.getSize(new THREE.Vector3()), c=bb.getCenter(new THREE.Vector3()); const out=[];
  for(const d of [[0,.1,1],[1,.1,0],[0,.1,-1]]){ const sc=new THREE.Scene(); sc.background=new THREE.Color(0x30343a); sc.add(new THREE.HemisphereLight(0xffffff,0x555555,2.6)); const dl=new THREE.DirectionalLight(0xffffff,2.2); dl.position.set(1,2,3); sc.add(dl); sc.add(model);
    const cam=new THREE.PerspectiveCamera(30,520/680,sz.y/100,sz.y*20); cam.position.copy(c).addScaledVector(new THREE.Vector3(...d).normalize(),sz.y*2.4); cam.lookAt(c); r.setSize(520,680,false); r.render(sc,cam); out.push(document.getElementById('c').toDataURL('image/png')); }
  return out; };
window.ready=true;
</script></body></html>""" % (CDN, CDN)

def casual(tex, pos, size):
    """Repaint a revealing outfit as a plain top and jeans. pos: HxWx4 (x, height, z, coverage) per texel; size: model box."""
    img = np.asarray(tex.convert('RGB')).astype(np.float32) / 255
    x, h, cov = pos[..., 0] * size[0], pos[..., 1], pos[..., 3] > 0
    H = size[1]; band = cov & (h > 0.55) & (h < 0.65)
    cx = float(np.median(x[band])) if band.any() else size[0] / 2               # the torso's own centre (arms make the box lopsided)
    neckband = cov & (h > 0.79) & (h < 0.81) & (np.abs(x - cx) < 0.07 * H)
    if neckband.sum() > 200: cx = float(np.median(x[neckband]))                  # the neck sits between the shoulders
    dx = np.abs(x - cx) / H                                                      # sideways distance as a fraction of height
    # below the armpits everything is body (the arms are raised); above them, a line from the armpit (sideways 0.125 of height,
    # 0.69 up) to the neck base (0.045, 0.80) separates the shoulders from the arms; a high neckline closes the top
    lim = np.where(dx <= 0.045, 0.81, 0.69 + (0.80 - 0.69) * np.clip((0.125 - dx) / (0.125 - 0.045), 0, 1))
    neck = np.zeros_like(cov); body = h < lim
    r, g, bl = img[..., 0], img[..., 1], img[..., 2]
    cloth = (g >= r * 0.92) | ((r < 0.22) & (g < 0.22))                          # the old outfit's dark green lace (skin is warm brown)
    top = cov & (h > 0.505) & (neck | body | (cloth & (h < 0.83)))
    # leave the hair alone: braids hanging behind the shoulders, and the dark hair at the nape
    zf, mx = pos[..., 2], img.max(-1)
    top &= ~((h > 0.70) & ((zf < 0.22) | ((h > 0.76) & (mx < 0.10) & (zf < 0.45))))
    top &= ~((h > 0.72) & (dx > 0.085) & (r > g * 1.2) & (r > 0.2))           # bare skin of the raised arms stays skin
    jeans = cov & (h >= 0.075) & (h <= 0.515)                                    # hips to ankles
    # fill the hairline gaps between triangles in texture space with the neighbouring cloth
    cls = np.zeros(h.shape, np.uint8); cls[top] = 1; cls[jeans] = 2
    for _ in range(3):
        grown = np.asarray(Image.fromarray(cls).filter(ImageFilter.MaxFilter(3)))
        cls = np.where(~cov & (cls == 0), grown, cls)
    top, jeans = cls == 1, cls == 2
    lum = img @ np.array([0.299, 0.587, 0.114], np.float32)
    soft = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(14))).astype(np.float32) / 255   # broad folds only
    out = img.copy()
    rng = np.random.default_rng(7)
    for mask, base, grain in [(top, (0.80, 0.58, 0.22), 0.01), (jeans, (0.17, 0.23, 0.37), 0.035)]:
        if not mask.any(): continue
        m = float(soft[mask].mean()) or 0.3
        shade = np.clip(0.95 + 0.25 * (soft - m) / max(m, 0.05), 0.82, 1.08)
        noise = 1 + grain * rng.standard_normal(lum.shape).astype(np.float32)
        col = np.stack([np.full_like(lum, c) for c in base], -1) * (shade * noise)[..., None]
        out[mask] = np.clip(col[mask], 0, 1)
    return Image.fromarray((out * 255).astype(np.uint8)), int(top.sum()), int(jeans.sum())

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
    for job in JOBS:
        name, mode = job[0], (job[1] if len(job) > 1 else '')
        fbx = next((SRC / name).glob('*.fbx'))
        info = pg.evaluate(f'window.load({json.dumps(name + "/" + fbx.name)})'); print(name, 'tris', info['tris'], 'size', [round(v, 1) for v in info['size']], 'materials', len(info['mats']), flush=True)
        textures = {mt['name']: Image.open(io.BytesIO(base64.b64decode(mt['data'].split(',')[1]))).convert('RGB') for mt in info['mats'] if mt.get('data')}
        if mode == 'casual':
            (mname, tex), = textures.items()
            raw = base64.b64decode(pg.evaluate(f'window.posmap({TEX})'))
            pos = np.frombuffer(raw, np.float32).reshape(TEX, TEX, 4)[::-1]   # GL rows start at the bottom
            new, nt, nj = casual(tex.resize((TEX, TEX), Image.LANCZOS), pos, info['size']); textures[mname] = new
            print('  repainted texels: top', nt, 'jeans', nj, flush=True)
            buf = io.BytesIO(); new.save(buf, 'PNG'); pg.evaluate("u=>window.retexture(u)", 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode())
        obj = pg.evaluate('window.obj()')
        mtl = []
        for mt in info['mats']:
            mtl += [f"newmtl {mt['name']}", 'Ka 1 1 1', 'Kd 1 1 1', 'Ks 0 0 0', 'd 1', 'illum 1']
            if mt['name'] in textures: mtl.append(f"map_Kd {name}_{mt['name']}.jpg")
            mtl.append('')
        zp = OUT / f'{name}_for_mixamo.zip'
        with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
            z.writestr(f'{name}.obj', f'mtllib {name}.mtl\n' + obj); z.writestr(f'{name}.mtl', '\n'.join(mtl))
            for mn, im in textures.items():
                s = TEX if max(im.size) > TEX else max(im.size); buf = io.BytesIO(); im.resize((s, s), Image.LANCZOS).save(buf, 'JPEG', quality=90); z.writestr(f'{name}_{mn}.jpg', buf.getvalue())
        shots = pg.evaluate('window.preview()')
        sheet = Image.new('RGB', (520 * 3, 680))
        for i, s in enumerate(shots): sheet.paste(Image.open(io.BytesIO(base64.b64decode(s.split(',')[1]))), (520 * i, 0))
        sheet.save(OUT / f'{name}_preview.png'); print('  wrote', zp.name, round(zp.stat().st_size / 1e6, 1), 'MB', flush=True)
    print('errors', errs[:3]); b.close()
