"""Rig an unrigged character (a T-pose or A-pose OBJ with its texture) on the Mixamo skeleton, by borrowing a rigged
Mixamo character: its skeleton is fitted to the new body and each vertex takes the skin weights of the nearest matching
point of the borrowed body. The result is a game character like the others (assets/people/<id>.glb after packing).
  python3 tools/autorig.py SOURCE_MIXAMO.fbx TARGET_DIR/name.obj OUT.glb HEIGHT_M
TARGET_DIR holds name.obj, name.mtl and its texture (from a re-bake)."""
import sys, os, base64, json
from pathlib import Path
from playwright.sync_api import sync_playwright
THREE = Path(os.environ.get('THREE_DIR', 'three'))   # a local copy of the three@0.165.0 package (the browser here has no network)
CDN = 'https://cdn.jsdelivr.net/npm/three@0.165.0/'
SRC, TGT, OUT, H = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), float(sys.argv[4]); BIG = '--gentle' not in sys.argv; NOCUT = '--nocut' in sys.argv
HTML = """<!doctype html><html><body><script type="importmap">{"imports":{"three":"%sbuild/three.module.js","three/addons/":"%sexamples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {MTLLoader} from 'three/addons/loaders/MTLLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
const H=%f, V3=THREE.Vector3, process_env_big=%s, NOCUT=%s;
// ---- the borrowed (rigged) body, standing in its bind pose
const src=new FBXLoader().parse(await (await fetch('http://conv.local/src.fbx')).arrayBuffer(),''); src.updateMatrixWorld(true);
let sm=null; src.traverse(o=>{ if(o.isSkinnedMesh&&!sm) sm=o; }); const sk=sm.skeleton; sk.pose(); src.updateMatrixWorld(true);
// ---- the new body
const mtl=await new MTLLoader().setPath('http://conv.local/t/').loadAsync('t.mtl'); mtl.preload();
const tgt=new OBJLoader().setMaterials(mtl).parse(await (await fetch('http://conv.local/t/t.obj')).text());
let tm=null; tgt.traverse(o=>{ if(o.isMesh&&!tm) tm=o; }); const map=tm.material.map||(Array.isArray(tm.material)?tm.material[0].map:null);
for(let i=0;i<100&&map&&!(map.image&&map.image.width);i++) await new Promise(r=>setTimeout(r,100));
let tg=tm.geometry.clone(); tg.deleteAttribute('normal'); tg=mergeVertices(tg,1e-7); tg.computeVertexNormals();
// feet on the floor, centred, H metres tall
const norm=(P)=>{ let y0=1e9,y1=-1e9,x0=1e9,x1=-1e9,z0=1e9,z1=-1e9; for(const p of P){ y0=Math.min(y0,p.y); y1=Math.max(y1,p.y); x0=Math.min(x0,p.x); x1=Math.max(x1,p.x); z0=Math.min(z0,p.z); z1=Math.max(z1,p.z); } return {y0,y1,cx:(x0+x1)/2,cz:(z0+z1)/2,k:H/(y1-y0)}; };
const TP=[]; { const a=tg.attributes.position; for(let i=0;i<a.count;i++) TP.push(new V3().fromBufferAttribute(a,i)); }
{ const n=norm(TP); for(const p of TP){ p.set((p.x-n.cx)*n.k,(p.y-n.y0)*n.k,(p.z-n.cz)*n.k); } }
// the arms: angle of the line from the shoulder to the farthest point of the hand (0 = T-pose, about -45 = A-pose)
const armAngle=(P,sh)=>{ let best=null,bd=-1; for(const p of P){ if(p.y<.45*H||p.y>.95*H) continue; if(p.x>bd){ bd=p.x; best=p; } } return Math.atan2(best.y-sh.y,best.x-sh.x); };   // the hand: the point farthest out to the side
// ---- borrowed body: world positions of the skinned vertices and of the joints
const bones=sk.bones, byN=n=>bones.find(b=>new RegExp(n+'$').test(b.name));
const srcPts=()=>{ const g=sm.geometry, a=g.attributes.position, out=[], v=new V3(); for(let i=0;i<a.count;i++){ v.fromBufferAttribute(a,i); sm.applyBoneTransform(i,v); out.push(v.clone().applyMatrix4(sm.matrixWorld)); } return out; };
let SP=srcPts();
// pose the borrowed arms like the new body's arms
const sn=norm(SP), tShoulder=new V3(.11*H,.81*H,0);
const toN=p=>new V3((p.x-sn.cx)*sn.k,(p.y-sn.y0)*sn.k,(p.z-sn.cz)*sn.k);
const angT=armAngle(TP,tShoulder), angS=armAngle(SP.map(toN),tShoulder);
// the borrowed figure faces +z; its left arm is on +x
for(const [nm,s] of [['LeftArm',1],['RightArm',-1]]){ const b=byN(nm); if(!b) continue; const qw=b.getWorldQuaternion(new THREE.Quaternion()), qp=b.parent.getWorldQuaternion(new THREE.Quaternion());
  const r=new THREE.Quaternion().setFromAxisAngle(new V3(0,0,1),s*(angT-angS)); b.quaternion.copy(qp.invert().multiply(r.multiply(qw))); }
src.updateMatrixWorld(true); SP=srcPts().map(toN);
// stretch sideways so the hands meet (T-pose: arm span; A-pose: hand distance)
const spanX=P=>{ let x0=1e9,x1=-1e9; for(const p of P) if(p.y>.3*H){ x0=Math.min(x0,p.x); x1=Math.max(x1,p.x); } return x1-x0; };
const sx=spanX(TP)/spanX(SP); for(const p of SP) p.x*=sx;
const J=bones.map(b=>{ const p=toN(b.getWorldPosition(new V3())); p.x*=sx; return p; });
// normals of the borrowed body in this pose (flat per triangle: the FBX body is a triangle soup)
const SN=[]; for(let i=0;i<SP.length;i+=3){ const n=new V3().subVectors(SP[i+1],SP[i]).cross(new V3().subVectors(SP[i+2],SP[i])).normalize(); SN.push(n,n,n); }
// ---- weights: nearest borrowed point facing the same way
const cell=.05, grid=new Map(), key=(x,y,z)=>x+','+y+','+z; SP.forEach((p,i)=>{ const k=key(Math.floor(p.x/cell),Math.floor(p.y/cell),Math.floor(p.z/cell)); let L=grid.get(k); if(!L) grid.set(k,L=[]); L.push(i); });
const tn=tg.attributes.normal, SI=sm.geometry.attributes.skinIndex, SW=sm.geometry.attributes.skinWeight, nT=TP.length;
const W=new Float32Array(nT*bones.length);   // dense weights, then smoothed and cut to 4
const tnv=new V3();
for(let i=0;i<nT;i++){ const p=TP[i]; tnv.fromBufferAttribute(tn,i); let best=-1,bd=1e9,best2=-1,bd2=1e9;
  for(let r=1;r<=4&&best<0;r++){ const cx=Math.floor(p.x/cell),cy=Math.floor(p.y/cell),cz=Math.floor(p.z/cell);
    for(let dx=-r;dx<=r;dx++) for(let dy=-r;dy<=r;dy++) for(let dz=-r;dz<=r;dz++){ const L=grid.get(key(cx+dx,cy+dy,cz+dz)); if(!L) continue;
      for(const j of L){ const d=p.distanceToSquared(SP[j]); if(d<bd2){ bd2=d; best2=j; } if(d<bd&&SN[j].dot(tnv)>.15){ bd=d; best=j; } } }
    if(best<0&&r===4) best=best2; }
  if(best<0) continue; for(let k=0;k<4;k++){ const w=SW.getComponent(best,k); if(w>0) W[i*bones.length+SI.getComponent(best,k)]+=w; } }
// smooth over the new body's own surface (two passes), so seams between borrowed regions blend
const idx=tg.index.array, nb=Array.from({length:nT},()=>new Set()); for(let t=0;t<idx.length;t+=3){ const a=idx[t],b=idx[t+1],c=idx[t+2]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
for(let pass=0;pass<2;pass++){ const W2=W.slice(); for(let i=0;i<nT;i++){ const B=bones.length; for(const j of nb[i]) for(let k=0;k<B;k++) W2[i*B+k]+=W[j*B+k]*.5; } W.set(W2); }
const sI=new Uint16Array(nT*4), sW=new Float32Array(nT*4);
for(let i=0;i<nT;i++){ const B=bones.length, row=[]; for(let k=0;k<B;k++) if(W[i*B+k]>0) row.push([W[i*B+k],k]); row.sort((a,b)=>b[0]-a[0]); const top=row.slice(0,4), s=top.reduce((a,b)=>a+b[0],0)||1;
  top.forEach(([w,k],q)=>{ sI[i*4+q]=k; sW[i*4+q]=w/s; }); if(!top.length){ sI[i*4]=0; sW[i*4]=1; } }
// scanned bodies are often joined between the arm and the side of the chest: cut those bridging triangles so the
// arm can move without dragging a sheet of skin with it
let cut=0; { const armB=bones.map(b=>/(Arm|ForeArm|Hand)/.test(b.name)), side=bones.map(b=>/Left/.test(b.name)?1:/Right/.test(b.name)?-1:0);
  const arm=i=>{ let a=0; for(let q=0;q<4;q++) if(armB[sI[i*4+q]]) a+=sW[i*4+q]; return a; };
  const keep=[]; for(let t=0;t<idx.length;t+=3){ const v=[idx[t],idx[t+1],idx[t+2]], a=v.map(arm), mx=Math.max(...a), mn=Math.min(...a);
    let long=0; for(let k=0;k<3;k++) long=Math.max(long,TP[v[k]].distanceTo(TP[v[(k+1)%%3]]));
    if(mx>.7&&mn<.15) { cut++; continue; } keep.push(...v); }
  tg.setIndex(keep); }
// ---- the skeleton fitted to the new body: joint positions from above, joint orientations from the borrowed pose
const NB=bones.map(b=>{ const n=new THREE.Bone(); n.name=b.name; return n; });
const wq=bones.map(b=>b.getWorldQuaternion(new THREE.Quaternion()));
bones.forEach((b,i)=>{ const pi=bones.indexOf(b.parent); if(pi>=0){ NB[pi].add(NB[i]); const qpI=wq[pi].clone().invert(); NB[i].position.copy(J[i].clone().sub(J[pi]).applyQuaternion(qpI)); NB[i].quaternion.copy(qpI.multiply(wq[i].clone())); }
  else { NB[i].position.copy(J[i]); NB[i].quaternion.copy(wq[i]); } });
const rootB=NB[bones.findIndex(b=>bones.indexOf(b.parent)<0)];
const pos=new Float32Array(nT*3); TP.forEach((p,i)=>{ pos[i*3]=p.x; pos[i*3+1]=p.y; pos[i*3+2]=p.z; });
const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('normal',tg.attributes.normal); g.setAttribute('uv',tg.attributes.uv); g.setIndex(tg.index);
g.setAttribute('skinIndex',new THREE.BufferAttribute(sI,4)); g.setAttribute('skinWeight',new THREE.BufferAttribute(sW,4));
if(map) map.colorSpace=THREE.SRGBColorSpace;
const mesh=new THREE.SkinnedMesh(g,new THREE.MeshStandardMaterial({map,roughness:.75,metalness:0})); mesh.name='body';
const root=new THREE.Group(); root.name='npc'; root.add(rootB); root.add(mesh); root.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(NB));
// try a few big poses (arms forward, arms out, a leg up) and cut the triangles that stretch like a sheet: places where the
// scan joined a hand to a thigh or an arm to the chest
if(!NOCUT){ const saved=NB.map(b=>b.quaternion.clone()), I=g.index.array, nV=nT, rest=TP, bad=new Set(), v=new V3();
  const big=process_env_big, poses=big?[[['LeftArm',1,0,-1.1],['RightArm',1,0,1.1]],[['LeftArm',0,0,1.2],['RightArm',0,0,-1.2]],[['LeftArm',-1,0,0],['RightArm',-1,0,0]],[['LeftUpLeg',-1,0,0],['RightUpLeg',1.2,0,0]]]
    :[[['LeftArm',.6,0,0],['RightArm',-.6,0,0]],[['LeftArm',-.6,0,0],['RightArm',.6,0,0]]];   // walking swing only (bodies whose hands touch the thighs)
  for(const pose of poses){ NB.forEach((b,i)=>b.quaternion.copy(saved[i]));
    for(const [nm,ax,ay,az] of pose){ const b=NB.find(b=>new RegExp(nm+'$').test(b.name)); if(!b) continue; const ang=Math.hypot(ax,ay,az), q=new THREE.Quaternion().setFromAxisAngle(new V3(ax,ay,az).normalize(),ang);
      const qw=b.getWorldQuaternion(new THREE.Quaternion()), qp=b.parent.getWorldQuaternion(new THREE.Quaternion()); b.quaternion.copy(qp.invert().multiply(q.multiply(qw))); }
    root.updateMatrixWorld(true); const PP=[]; for(let i=0;i<nV;i++){ v.copy(rest[i]); mesh.applyBoneTransform(i,v); PP.push(v.clone()); }
    for(let t=0;t<I.length;t+=3){ const a=I[t],b2=I[t+1],c=I[t+2]; let r=0; for(const [x,y] of [[a,b2],[b2,c],[c,a]]){ const d0=rest[x].distanceTo(rest[y]), d1=PP[x].distanceTo(PP[y]); r=Math.max(r,(d1+1e-4)/(d0+.004*H/1.8)); } if(r>2.4) bad.add(t); } }
  NB.forEach((b,i)=>b.quaternion.copy(saved[i])); root.updateMatrixWorld(true);
  const keep=[]; for(let t=0;t<I.length;t+=3) if(!bad.has(t)) keep.push(I[t],I[t+1],I[t+2]); g.setIndex(keep); cut+=bad.size; }
const glb=await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:false});
const u8=new Uint8Array(glb); let s=''; for(let q=0;q<u8.length;q+=32768) s+=String.fromCharCode.apply(null,u8.subarray(q,q+32768));
window.R={b64:btoa(s),angT:+(angT*57.3).toFixed(1),angS:+(angS*57.3).toFixed(1),sx:+sx.toFixed(3),verts:nT,bones:bones.length,hips:J[bones.indexOf(byN('Hips'))].toArray().map(v=>+v.toFixed(3)),cut}; window.done=true;
</script></body></html>""" % (CDN, CDN, H, 'true' if BIG else 'false', 'true' if NOCUT else 'false')
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader']); pg = b.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    tdir = TGT.parent; mtl = TGT.with_suffix('.mtl').read_text(); tex = [l.split(None, 1)[1].strip() for l in mtl.splitlines() if l.startswith('map_Kd')]
    def route(rt):
        u = rt.request.url
        if u == 'http://conv.local/': return rt.fulfill(body=HTML, headers={'Content-Type': 'text/html'})
        if u == 'http://conv.local/src.fbx': return rt.fulfill(body=SRC.read_bytes(), headers={'Content-Type': 'application/octet-stream'})
        if u == 'http://conv.local/t/t.obj': return rt.fulfill(body=TGT.read_bytes(), headers={'Content-Type': 'text/plain'})
        if u == 'http://conv.local/t/t.mtl': return rt.fulfill(body=mtl, headers={'Content-Type': 'text/plain'})
        if u.startswith('http://conv.local/t/'): return rt.fulfill(body=(tdir / u.rsplit('/', 1)[1]).read_bytes(), headers={'Content-Type': 'image/png'})
        if u.startswith(CDN): return rt.fulfill(body=(THREE / u[len(CDN):]).read_bytes(), headers={'Content-Type': 'application/javascript'})
        return rt.abort()
    pg.route('**/*', route); pg.goto('http://conv.local/'); pg.wait_for_function('window.done===true||window.onerror', timeout=600000)
    r = pg.evaluate('window.R'); OUT.write_bytes(base64.b64decode(r.pop('b64'))); print(json.dumps(r), errs[:3]); b.close()
