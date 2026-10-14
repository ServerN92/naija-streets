import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as CLOCK from './clock.js?v=4ed87630ae';
import * as C2 from './char2.js?v=4ed87630ae';
import { MapView } from './mapview.js?v=4ed87630ae';
window.__nsOK = true;
// the page and the game code must come from the same release; if a cached page meets newer code, fetch a fresh page
const BUILD='4ed87630ae';
{ const m=document.querySelector('meta[name="ns-build"]'), hb=m&&m.content; let n=0; try{ n=+(sessionStorage.getItem('ns-reload')||0); }catch(e){}
  if(hb!==BUILD&&n<2&&!/[?&]fresh=/.test(location.search)){ try{ sessionStorage.setItem('ns-reload',String(n+1)); }catch(e){} location.replace(location.pathname+'?fresh='+Date.now()); await new Promise(()=>{}); }
  try{ sessionStorage.removeItem('ns-reload'); }catch(e){} }
{ const e=document.getElementById('loadErr'); if(e){ e.hidden=true; e.textContent=''; } }

const PERF=/[?&]perf=1/.test(location.search);   // ?perf=1 shows a speed panel (fps, draw calls) for testing on real phones
const $ = s => document.querySelector(s);
const loadTxt = $('#loadTxt'), loadBar = $('#loadBar');
let lastT = performance.now();
// wait for the screen to update; if the tab is in the background (no frames), carry on anyway so loading never stalls
const frameWait = () => new Promise(r => { let done=false; const f=()=>{ if(!done){ done=true; r(); } }; requestAnimationFrame(() => requestAnimationFrame(f)); setTimeout(f, 150); });

/* ================= helpers ================= */
function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const R = mulberry32(90210);
const rr = (a,b) => a + R()*(b-a), ri = (a,b) => Math.floor(rr(a,b+1)), pick = a => a[Math.floor(R()*a.length)];
const MR = Math.random, mrr = (a,b) => a + MR()*(b-a), mpick = a => a[Math.floor(MR()*a.length)];
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const sm = t => { t = clamp(t,0,1); return t*t*(3-2*t); };
const lerpA = (a,b,t) => { let d = ((b-a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI; return a + d*t; };
const isTouch = matchMedia('(pointer: coarse)').matches || matchMedia('(any-pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
const DPR = Math.min(window.devicePixelRatio||1, 3);

/* ================= renderer ================= */
// quality presets. pr = target pixel ratio (dynamic resolution may lower it to keep 60 fps)
const QUAL={
  // shadows: real-time sun shadows (Low uses soft blob shadows instead); px: most pixels the screen may draw (keeps big screens smooth)
  low:   {pr:Math.min(DPR,1.25),prMin:.6, px:1.3e6,shadows:false,sh:1024,shR:46, soft:false,msaa:0,bloom:false,post:false,mirror:false,water:0,  draw:210,lod0:55, peds:16,cars:14,npc:8, npcR:30,spots:14, fog:1.3, aniso:2,tex:512, aa:true, sky:96},
  medium:{pr:Math.min(DPR,1.5), prMin:.7, px:1.7e6,shadows:true, sh:1024,shR:55, soft:false,msaa:0,bloom:false,post:false,mirror:false,water:0,  draw:300,lod0:80, peds:26,cars:20,npc:14,npcR:45,spots:22,fog:1.1, aniso:4,tex:1024,aa:true, sky:128},
  high:  {pr:Math.min(DPR,2),   prMin:.85,px:4.2e6,shadows:true, sh:2048,shR:85, soft:true, msaa:4,bloom:true, post:true, mirror:true, water:512,draw:430,lod0:120,peds:40,cars:28,npc:24,npcR:65,spots:30,fog:1,   aniso:8,tex:1024,aa:false,sky:256}};
// pick a starting quality from the graphics chip: weak chips (most phones, Intel HD/UHD laptops) start on Low, strong ones on High
const GPU=(()=>{ try{ const c=document.createElement('canvas'), gl=c.getContext('webgl2')||c.getContext('webgl'), e=gl&&gl.getExtension('WEBGL_debug_renderer_info'); const n=e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):''; const lc=gl&&gl.getExtension('WEBGL_lose_context'); if(lc) lc.loseContext(); return n||''; }catch(err){ return ''; } })();
const GPU_TIER=/SwiftShader|llvmpipe|Microsoft Basic|Mali-[T4]|Mali-G(31|51|52|57|68|72|76)\b|Adreno.{0,12}\b([3-5]\d\d|6[0-3]\d)\b|PowerVR|Intel.{0,40}\b(HD|UHD) Graphics|Apple A(9|10|11|12)\b/i.test(GPU)?'low':
  /NVIDIA|GeForce|RTX|Quadro|Radeon (RX|Pro)|Apple M\d|Adreno.{0,12}\b(7[3-9]\d|8\d\d)\b|Immortalis/i.test(GPU)?'high':'medium';
let qKey=null; try{ qKey=localStorage.getItem('naija-quality'); }catch(e){}
// the player's profile: a name, and man or woman, chosen once on this device (it cannot be changed afterwards)
let PROFILE=null; try{ PROFILE=JSON.parse(localStorage.getItem('naija-profile')||'null'); }catch(e){} if(!PROFILE||!(PROFILE.g==='m'||PROFILE.g==='f')) PROFILE=null;
const isF=()=>!!PROFILE&&PROFILE.g==='f';
if(!QUAL[qKey]) qKey=GPU_TIER==='high'&&isTouch?'medium':GPU_TIER; const Q=QUAL[qKey];
// never draw more pixels than the preset's budget: a 1080p laptop or a big tablet gets a slightly lower internal resolution
Q.prTop=Q.pr; const fitPR=()=>Math.max(Q.prMin,Math.min(Q.prTop,Math.sqrt(Q.px/Math.max(1,innerWidth*innerHeight)))); Q.pr=fitPR();
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias:Q.aa, powerPreference:'high-performance', stencil:false }); }
catch(e){ window.__nsFail('Your browser could not start 3D graphics (WebGL). Update your browser or try Chrome.'); throw e; }
let PR=Q.pr; renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .6;
renderer.shadowMap.enabled = Q.shadows;
renderer.shadowMap.type = Q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
$('#view').appendChild(renderer.domElement);
renderer.domElement.tabIndex = 0;
const maxAniso = Math.min(Q.aniso, renderer.capabilities.getMaxAnisotropy());
let ctxLost=false;
renderer.domElement.addEventListener('webglcontextlost',e=>{ e.preventDefault(); ctxLost=true; const o=$('#ctxlost'); if(o) o.hidden=false; });
renderer.domElement.addEventListener('webglcontextrestored',()=>location.reload());

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xe0a77c, 0.0019);
const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.3, 9000);
camera.layers.enable(1);
const pmrem = new THREE.PMREMGenerator(renderer);

/* ================= canvas textures ================= */
function cv(w,h){ const c = document.createElement('canvas'); c.width=w; c.height=h; return [c, c.getContext('2d')]; }
function shrink(c,lim=Q.tex){ if(c.width<=lim&&c.height<=lim) return c; const k=lim/Math.max(c.width,c.height); const [d,g]=cv(Math.max(1,Math.round(c.width*k)),Math.max(1,Math.round(c.height*k))); g.imageSmoothingQuality='high'; g.drawImage(c,0,0,d.width,d.height); c.width=c.height=1; return d; }
function tx(c, srgb=true, rep=true, lim=Q.tex){ c=shrink(c,lim); const t = new THREE.CanvasTexture(c); if(srgb) t.colorSpace = THREE.SRGBColorSpace; if(rep){ t.wrapS = t.wrapT = THREE.RepeatWrapping; } t.anisotropy = maxAniso; return t; }
function grain(g,w,h,amt){ const im=g.getImageData(0,0,w,h), d=im.data; for(let i=0;i<d.length;i+=4){ const n=(R()-.5)*amt; d[i]+=n; d[i+1]+=n; d[i+2]+=n; } g.putImageData(im,0,0); }
function hs(hex,f){ const n=parseInt(hex.slice(1),16); return `rgb(${Math.min(255,(n>>16)*f)|0},${Math.min(255,((n>>8)&255)*f)|0},${Math.min(255,(n&255)*f)|0})`; }
const warmLit = () => `rgb(255,${ri(198,226)},${ri(138,178)})`;

function texGlass(base, band, mull){
  const S=1024,C=8,F=8,cw=S/C,fh=S/F;
  const [c,g]=cv(S,S), [e,ge]=cv(S,S); ge.fillStyle='#000'; ge.fillRect(0,0,S,S);
  for(let f=0;f<F;f++) for(let k=0;k<C;k++){
    const x=k*cw, y=f*fh;
    const gr=g.createLinearGradient(x,y,x+cw*.6,y+fh); gr.addColorStop(0,hs(base,rr(1,1.4))); gr.addColorStop(1,hs(base,rr(.6,.9)));
    g.fillStyle=gr; g.fillRect(x,y,cw,fh);
    g.fillStyle=band; g.fillRect(x,y+fh-24,cw,24);
    if(R()<.3){ ge.fillStyle = R()<.78 ? warmLit() : `rgb(${ri(185,215)},${ri(215,235)},255)`; ge.globalAlpha=rr(.5,1); ge.fillRect(x+5,y+5,cw-10,fh-34); ge.globalAlpha=1;
      if(R()<.45){ ge.fillStyle='rgba(0,0,0,.6)'; ge.fillRect(x+5,y+5,cw-10,rr(8,44)); } }
  }
  g.fillStyle=mull; for(let k=0;k<=C;k++) g.fillRect(k*cw-3,0,6,S); for(let f=0;f<=F;f++) g.fillRect(0,f*fh-3,S,6);
  return { map:tx(c), em:tx(e) };
}
function texOffice(){
  const S=1024,F=8,fh=128,mw=128;
  const [c,g]=cv(S,S),[e,ge]=cv(S,S),[m,gm]=cv(S,S);
  ge.fillStyle='#000'; ge.fillRect(0,0,S,S); gm.fillStyle='rgb(0,228,0)'; gm.fillRect(0,0,S,S);
  g.fillStyle='#d8d1c4'; g.fillRect(0,0,S,S); grain(g,S,S,20);
  for(let f=0;f<F;f++){
    const y=f*fh, wy=y+44, wh=fh-54;
    const gr=g.createLinearGradient(0,wy,0,wy+wh); gr.addColorStop(0,'#4a6272'); gr.addColorStop(1,'#1b252c'); g.fillStyle=gr; g.fillRect(0,wy,S,wh);
    gm.fillStyle='rgb(0,26,215)'; gm.fillRect(0,wy,S,wh);
    g.fillStyle='#aaa293'; g.fillRect(0,wy+wh,S,7);
    g.fillStyle='rgba(0,0,0,.08)'; g.fillRect(0,wy+wh+7,S,14);
    for(let k=0;k<S/mw;k++) if(R()<.3){ ge.fillStyle=warmLit(); ge.globalAlpha=rr(.5,1); ge.fillRect(k*mw+5,wy+3,mw-10,wh-6); ge.globalAlpha=1; }
  }
  g.fillStyle='#8c9397'; gm.fillStyle='rgb(0,110,150)';
  for(let k=0;k<=S/mw;k++){ g.fillRect(k*mw-4,0,8,S); gm.fillRect(k*mw-4,0,8,S); }
  return { map:tx(c), em:tx(e), rm:tx(m,false) };
}
function texResi(){
  const S=1024,C=4,F=8,cw=256,fh=128;
  const [c,g]=cv(S,S),[e,ge]=cv(S,S),[m,gm]=cv(S,S);
  ge.fillStyle='#000'; ge.fillRect(0,0,S,S); gm.fillStyle='rgb(0,235,0)'; gm.fillRect(0,0,S,S);
  g.fillStyle='#f2ede4'; g.fillRect(0,0,S,S); grain(g,S,S,16);
  for(let f=0;f<F;f++) for(let k=0;k<C;k++){
    const x=k*cw, y=f*fh, wx=x+66, wy=y+26, ww=124, wh=70;
    g.fillStyle='rgba(60,50,40,.10)'; g.fillRect(wx+10,wy+wh,ww-20,rr(20,40));
    g.fillStyle='#fbfbfb'; g.fillRect(wx-6,wy-6,ww+12,wh+12);
    const gr=g.createLinearGradient(wx,wy,wx+ww,wy+wh); gr.addColorStop(0,'#5d7586'); gr.addColorStop(1,'#1f2c36'); g.fillStyle=gr; g.fillRect(wx,wy,ww,wh);
    gm.fillStyle='rgb(0,20,210)'; gm.fillRect(wx,wy,ww,wh);
    g.fillStyle='#e9e9e9'; g.fillRect(wx+ww/2-2,wy,4,wh);
    if(R()<.3){ ge.fillStyle=warmLit(); ge.globalAlpha=rr(.55,1); ge.fillRect(wx,wy,ww,wh); ge.globalAlpha=1; if(R()<.5){ge.fillStyle='rgba(0,0,0,.5)';ge.fillRect(wx,wy,ww/2-2,wh);} }
    if(k%2===0){
      g.fillStyle='#cfc7ba'; g.fillRect(x+16,y+fh-16,cw-32,10);
      g.fillStyle='#4a4a4a'; for(let bx=x+18;bx<x+cw-18;bx+=11) g.fillRect(bx,y+76,2,fh-92); g.fillRect(x+16,y+74,cw-32,4);
    } else {
      g.fillStyle='#f6f6f4'; g.fillRect(x+198,y+58,42,30); g.fillStyle='#b9b9b6'; for(let gy=y+62;gy<y+86;gy+=5) g.fillRect(x+202,gy,34,2);
      g.fillStyle='rgba(50,45,40,.12)'; g.fillRect(x+210,y+88,18,rr(18,36));
    }
  }
  return { map:tx(c), em:tx(e), rm:tx(m,false) };
}
function texOld(){
  const S=1024,C=4,F=8,cw=256,fh=128;
  const [c,g]=cv(S,S),[e,ge]=cv(S,S),[m,gm]=cv(S,S);
  ge.fillStyle='#000'; ge.fillRect(0,0,S,S); gm.fillStyle='rgb(0,240,0)'; gm.fillRect(0,0,S,S);
  g.fillStyle='#ece4d4'; g.fillRect(0,0,S,S); grain(g,S,S,34);
  for(let i=0;i<60;i++){ g.fillStyle=`rgba(${ri(60,90)},${ri(55,80)},${ri(40,60)},${rr(.03,.08)})`; g.beginPath(); g.ellipse(rr(0,S),rr(0,S),rr(20,90),rr(10,50),0,0,Math.PI*2); g.fill(); }
  for(let f=0;f<F;f++) for(let k=0;k<C;k++){
    const x=k*cw, y=f*fh, wx=x+76, wy=y+24, ww=104, wh=72;
    const st=g.createLinearGradient(0,wy+wh,0,wy+wh+rr(30,70)); st.addColorStop(0,'rgba(55,45,35,.28)'); st.addColorStop(1,'rgba(55,45,35,0)'); g.fillStyle=st; g.fillRect(wx+6,wy+wh,ww-12,70);
    g.fillStyle='#3b3833'; g.fillRect(wx-5,wy-5,ww+10,wh+10);
    const lit=R()<.3;
    for(let sy=wy;sy<wy+wh;sy+=8){ g.fillStyle='#c9d1d4'; g.fillRect(wx,sy,ww,4); g.fillStyle='#38424a'; g.fillRect(wx,sy+4,ww,4); gm.fillStyle='rgb(0,40,160)'; gm.fillRect(wx,sy,ww,4);
      if(lit){ ge.fillStyle=warmLit(); ge.globalAlpha=.85; ge.fillRect(wx,sy+4,ww,4); ge.globalAlpha=1; } }
    if(R()<.55){ g.fillStyle='#232323'; for(let bx=wx+4;bx<wx+ww;bx+=12) g.fillRect(bx,wy-3,2,wh+6); g.fillRect(wx-3,wy+wh/2-1,ww+6,2); }
    g.fillStyle='#d2c8b6'; g.fillRect(wx-10,wy+wh+5,ww+20,6);
  }
  return { map:tx(c), em:tx(e), rm:tx(m,false) };
}
function texShop(){
  const S=1024,H=256,sw=256;
  const [c,g]=cv(S,H),[e,ge]=cv(S,H),[m,gm]=cv(S,H);
  ge.fillStyle='#000'; ge.fillRect(0,0,S,H); gm.fillStyle='rgb(0,230,0)'; gm.fillRect(0,0,S,H);
  const fas=['#c0392b','#1f6fb2','#1e8449','#e0a800','#7d3c98','#d35400','#0e7c86'];
  for(let k=0;k<4;k++){
    const x=k*sw;
    g.fillStyle=pick(fas); g.fillRect(x,0,sw,54); g.fillStyle='rgba(255,255,255,.25)'; g.fillRect(x,48,sw,4);
    if(k%2===0){
      g.fillStyle='#8a9096'; g.fillRect(x+14,58,sw-28,H-58);
      for(let y=62;y<H;y+=7){ g.fillStyle='#727980'; g.fillRect(x+14,y,sw-28,2); }
      g.fillStyle='rgba(0,0,0,.25)'; g.fillRect(x+14,H-10,sw-28,10);
    } else {
      g.fillStyle='#231d19'; g.fillRect(x+14,58,sw-28,H-58);
      for(let s=0;s<3;s++){ const sy=84+s*52; g.fillStyle='#5a4a3c'; g.fillRect(x+20,sy+34,sw-40,4);
        for(let bx=x+22;bx<x+sw-26;bx+=ri(12,22)){ g.fillStyle=`hsl(${ri(0,360)},${ri(50,80)}%,${ri(40,60)}%)`; g.fillRect(bx,sy+ri(4,16),ri(8,16),34-ri(4,16)); } }
      g.fillStyle='rgba(180,215,230,.16)'; g.fillRect(x+14,58,sw-28,H-58);
      gm.fillStyle='rgb(0,30,200)'; gm.fillRect(x+14,58,sw-28,H-58);
      ge.fillStyle='rgb(255,214,160)'; ge.globalAlpha=.75; ge.fillRect(x+14,58,sw-28,H-58); ge.globalAlpha=1;
    }
    g.fillStyle='#d8d0c2'; g.fillRect(x,54,14,H-54); g.fillRect(x+sw-14,54,14,H-54);
    ge.fillStyle='rgba(255,255,255,.18)'; ge.fillRect(x,0,sw,50);
  }
  return { map:tx(c), em:tx(e), rm:tx(m,false) };
}
function texConcrete(base='#9b9890', size=512, amt=30){ const [c,g]=cv(size,size); g.fillStyle=base; g.fillRect(0,0,size,size); grain(g,size,size,amt);
  for(let i=0;i<30;i++){ g.fillStyle=`rgba(0,0,0,${rr(.02,.06)})`; g.beginPath(); g.ellipse(rr(0,size),rr(0,size),rr(10,70),rr(10,50),rr(0,3),0,7); g.fill(); } return tx(c); }
function texPavers(){ const S=512,[c,g]=cv(S,S); g.fillStyle='#5f5952'; g.fillRect(0,0,S,S);
  const cols=['#8d857a','#968c80','#877d71','#9c7f70','#a28472','#8f877c'];
  for(let r=0;r<S/32;r++) for(let k=-1;k<S/64+1;k++){ const x=k*64+(r%2?32:0), y=r*32; g.fillStyle=pick(cols); g.fillRect(x+2,y+2,60,28); }
  grain(g,S,S,18); return tx(c); }
function texPlaza(){ const S=512,[c,g]=cv(S,S); g.fillStyle='#b9b0a2'; g.fillRect(0,0,S,S);
  for(let y=0;y<S;y+=128) for(let x=0;x<S;x+=128){ g.fillStyle=((x+y)/128)%2?'#c8bfb0':'#ada395'; g.fillRect(x+2,y+2,124,124); }
  grain(g,S,S,14); return tx(c); }
function texGrass(){ const S=512,[c,g]=cv(S,S); g.fillStyle='#4d7a36'; g.fillRect(0,0,S,S);
  for(let i=0;i<9000;i++){ g.fillStyle=`hsl(${ri(80,110)},${ri(35,55)}%,${ri(22,40)}%)`; g.fillRect(rr(0,S),rr(0,S),2,rr(2,5)); } return tx(c); }
// red-earth ground of Mushin: laterite, dust, footpaths and tufts of grass
function texGround(){ const S=512,[c,g]=cv(S,S); g.fillStyle='#8a6446'; g.fillRect(0,0,S,S); grain(g,S,S,34);
  for(let i=0;i<120;i++){ g.fillStyle=`rgba(${ri(100,150)},${ri(66,96)},${ri(40,62)},${rr(.18,.45)})`; g.beginPath(); g.ellipse(rr(0,S),rr(0,S),rr(10,70),rr(6,30),rr(0,3),0,7); g.fill(); }
  for(let i=0;i<70;i++){ g.fillStyle=`rgba(${ri(150,180)},${ri(130,150)},${ri(100,120)},${rr(.12,.3)})`; g.beginPath(); g.ellipse(rr(0,S),rr(0,S),rr(8,40),rr(4,18),rr(0,3),0,7); g.fill(); }   // dusty patches
  for(let i=0;i<60;i++){ const x=rr(0,S), y=rr(0,S); for(let k=0;k<ri(6,22);k++){ g.fillStyle=`hsla(${ri(70,100)},${ri(30,50)}%,${ri(20,32)}%,.85)`; g.fillRect(x+rr(-10,10),y+rr(-6,6),2,rr(3,7)); } }   // grass tufts
  for(let i=0;i<700;i++){ g.fillStyle=R()<.5?'rgba(215,190,160,.6)':'rgba(60,38,26,.6)'; const r=rr(1,3); g.fillRect(rr(0,S),rr(0,S),r,r); }   // stones
  return tx(c); }
function texAsph(){ const S=512,[c,g]=cv(S,S); asphalt(g,S,S);
  for(let i=0;i<14;i++){ g.fillStyle=R()<.5?`rgba(18,18,20,${rr(.15,.3)})`:`rgba(95,92,86,${rr(.1,.2)})`; g.beginPath(); g.ellipse(rr(0,S),rr(0,S),rr(20,90),rr(10,50),rr(0,3),0,7); g.fill(); }
  return tx(c); }
function texSand(){ const S=512,[c,g]=cv(S,S); g.fillStyle='#b58d62'; g.fillRect(0,0,S,S); grain(g,S,S,30);
  for(let i=0;i<90;i++){ g.fillStyle=`rgba(${ri(150,200)},${ri(120,160)},${ri(80,110)},${rr(.15,.35)})`; g.beginPath(); g.ellipse(rr(0,S),rr(0,S),rr(10,50),rr(6,24),rr(0,3),0,7); g.fill(); }
  for(let i=0;i<300;i++){ g.fillStyle='rgba(90,64,40,.5)'; g.fillRect(rr(0,S),rr(0,S),2,2); } return tx(c); }
function asphalt(g,W,H){ g.fillStyle='#3a3b3e'; g.fillRect(0,0,W,H); grain(g,W,H,28);
  for(let i=0;i<10;i++){ g.fillStyle=`rgba(0,0,0,${rr(.05,.12)})`; g.beginPath(); g.ellipse(rr(0,W),rr(0,H),rr(20,80),rr(8,30),0,0,7); g.fill(); } }
function texRoad(lanes){ const [c,g]=cv(512,256); asphalt(g,512,256);
  g.fillStyle='#e9e6dc'; g.fillRect(0,10,512,5); g.fillRect(0,241,512,5);
  if(lanes===2){ g.fillStyle='#f0ede4'; g.fillRect(0,125,250,6); }
  else { g.fillStyle='#f2b705'; g.fillRect(0,119,512,5); g.fillRect(0,132,512,5); g.fillStyle='#f0ede4'; g.fillRect(0,62,250,5); g.fillRect(0,189,250,5); }
  return tx(c); }
function texRoadBad(lanes){ const W=512,H=256,[c,g]=cv(W,H); g.fillStyle='#3d3d3e'; g.fillRect(0,0,W,H); grain(g,W,H,34);
  for(let i=0;i<9;i++){ g.fillStyle=R()<.5?`rgba(20,20,22,${rr(.15,.3)})`:`rgba(90,88,84,${rr(.12,.25)})`; g.fillRect(rr(0,W),rr(18,H-40),rr(40,140),rr(20,70)); }   // old patches
  g.strokeStyle='rgba(12,12,12,.75)'; for(let i=0;i<26;i++){ g.lineWidth=rr(.8,2.2); g.beginPath(); let x=rr(0,W), y=rr(10,H-10); g.moveTo(x,y); for(let k=0;k<ri(3,8);k++){ x+=rr(-30,30); y+=rr(-14,14); g.lineTo(x,y); } g.stroke(); } // cracks
  g.fillStyle='rgba(205,200,186,.55)'; if(lanes===2){ for(let x=0;x<W;x+=64) if(R()<.55) g.fillRect(x,125,rr(14,40),5); } else { g.fillStyle='rgba(242,183,5,.45)'; for(let x=0;x<W;x+=8) if(R()<.6) g.fillRect(x,121,8,5); }
  // broken, sandy edges
  for(const top of [true,false]){ g.fillStyle='rgba(150,124,92,.9)'; g.beginPath(); g.moveTo(0,top?0:H); let x=0; while(x<=W){ const d=8+Math.abs(Math.sin(x*.05+(top?0:2)))*10+R()*9; g.lineTo(x,top?d:H-d); x+=rr(6,14); } g.lineTo(W,top?0:H); g.closePath(); g.fill();
    for(let i=0;i<40;i++){ const x=rr(0,W), y=top?rr(4,30):H-rr(4,30); g.fillStyle=`rgba(${ri(120,160)},${ri(98,124)},${ri(72,92)},${rr(.4,.8)})`; g.beginPath(); g.ellipse(x,y,rr(3,12),rr(2,6),rr(0,3),0,7); g.fill(); } }
  for(let i=0;i<400;i++){ g.fillStyle=`rgba(${ri(120,160)},${ri(110,140)},${ri(90,120)},.6)`; g.fillRect(rr(0,W),rr(0,H),2,2); }
  return tx(c); }
function texDirt(){ const W=512,H=256,[c,g]=cv(W,H); const gr=g.createLinearGradient(0,0,0,H); gr.addColorStop(0,'#94603d'); gr.addColorStop(.5,'#9e6741'); gr.addColorStop(1,'#8c5a39'); g.fillStyle=gr; g.fillRect(0,0,W,H); grain(g,W,H,40);
  for(let i=0;i<70;i++){ g.fillStyle=`rgba(${ri(90,130)},${ri(50,75)},${ri(30,45)},${rr(.15,.4)})`; g.beginPath(); g.ellipse(rr(0,W),rr(0,H),rr(10,60),rr(5,24),rr(0,3),0,7); g.fill(); }
  for(const y of [56,86,170,200]){ g.fillStyle='rgba(60,34,20,.32)'; for(let x=0;x<W;x+=3) g.fillRect(x,y+Math.sin(x/37)*4+rr(-1,1),3,rr(9,15)); } // tyre ruts
  for(let i=0;i<600;i++){ g.fillStyle=R()<.5?'rgba(210,190,160,.7)':'rgba(70,45,30,.7)'; const r=rr(1,3.2); g.fillRect(rr(0,W),rr(0,H),r,r); } // stones
  for(const y0 of [0,H-14]) for(let x=0;x<W;x+=ri(8,30)){ g.fillStyle=`hsla(${ri(75,100)},40%,${ri(22,32)}%,.8)`; g.fillRect(x,y0+rr(0,6),rr(4,12),rr(4,9)); } // grass at edges
  return tx(c); }
function texPothole(water){ const S=256,[c,g]=cv(S,S); const pts=[], n=18; for(let i=0;i<n;i++){ const a=i/n*Math.PI*2, r=S*.34*rr(.72,1.12); pts.push([S/2+Math.cos(a)*r,S/2+Math.sin(a)*r*rr(.8,1)]); }
  const path=(k)=>{ g.beginPath(); pts.forEach(([x,y],i)=>{ const X=S/2+(x-S/2)*k, Y=S/2+(y-S/2)*k; i?g.lineTo(X,Y):g.moveTo(X,Y); }); g.closePath(); };
  if(water){ path(1); const gr=g.createRadialGradient(S/2,S/2,10,S/2,S/2,S*.4); gr.addColorStop(0,'rgba(58,44,30,.96)'); gr.addColorStop(1,'rgba(92,70,46,.88)'); g.fillStyle=gr; g.fill(); path(1); g.strokeStyle='rgba(120,92,62,.8)'; g.lineWidth=7; g.stroke(); }
  else { path(1.16); g.fillStyle='rgba(95,90,82,.85)'; g.fill(); path(1); const gr=g.createRadialGradient(S/2,S/2,8,S/2,S/2,S*.38); gr.addColorStop(0,'rgba(18,15,12,1)'); gr.addColorStop(1,'rgba(48,42,36,1)'); g.fillStyle=gr; g.fill();
    for(let i=0;i<60;i++){ g.fillStyle=`rgba(${ri(120,170)},${ri(110,150)},${ri(90,120)},.9)`; g.fillRect(rr(S*.25,S*.75),rr(S*.25,S*.75),rr(2,6),rr(2,5)); } }
  return tx(c,true,false,256); }
function texCross(){ const S=512,[c,g]=cv(S,S); asphalt(g,S,S); g.fillStyle='#ebe7dd';
  for(let x=40;x<472;x+=34){ g.fillRect(x,10,17,50); g.fillRect(x,452,17,50); }
  for(let y=40;y<472;y+=34){ g.fillRect(10,y,50,17); g.fillRect(452,y,50,17); }
  return tx(c,true,false); }
function texAnkara(p){ const S=256,[c,g]=cv(S,S); if(typeof ANKC!=='undefined') ANKC.push(c); g.fillStyle=p[0]; g.fillRect(0,0,S,S);
  for(let y=0;y<4;y++) for(let x=0;x<4;x++){ const cx=x*64+32, cy=y*64+32;
    if((x+y)%2===0){ [[28,p[1]],[20,p[2]],[12,p[3]],[5,p[1]]].forEach(([r,col])=>{ g.fillStyle=col; g.beginPath(); g.arc(cx,cy,r,0,7); g.fill(); }); }
    else { g.fillStyle=p[2]; g.beginPath(); g.moveTo(cx,cy-26); g.lineTo(cx+26,cy); g.lineTo(cx,cy+26); g.lineTo(cx-26,cy); g.closePath(); g.fill();
      g.fillStyle=p[3]; g.beginPath(); g.moveTo(cx,cy-13); g.lineTo(cx+13,cy); g.lineTo(cx,cy+13); g.lineTo(cx-13,cy); g.closePath(); g.fill();
      g.fillStyle=p[1]; for(const [dx,dy] of [[-22,-22],[22,-22],[-22,22],[22,22]]){ g.beginPath(); g.arc(cx+dx,cy+dy,4,0,7); g.fill(); } } }
  const t=tx(c); t.repeat.set(3,2); return t; }
function texGlow(){ const S=128,[c,g]=cv(S,S); const gr=g.createRadialGradient(64,64,0,64,64,64); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.35,'rgba(255,255,255,.45)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,S,S); return tx(c,true,false); }
function texWaterNormals(){ const S=256, h=new Float32Array(S*S);
  const W=[[3,1,0,1],[1,4,1.3,1],[5,2,2.1,.7],[2,7,.7,.5],[8,3,4.2,.4],[11,6,1.9,.3],[4,13,3.3,.25],[17,9,.4,.15],[23,5,2.6,.12]];
  for(let y=0;y<S;y++) for(let x=0;x<S;x++){ let v=0; for(const [kx,ky,ph,a] of W) v+=a*Math.sin(2*Math.PI*(kx*x+ky*y)/S+ph); h[y*S+x]=v; }
  const [c,g]=cv(S,S), im=g.createImageData(S,S);
  for(let y=0;y<S;y++) for(let x=0;x<S;x++){ const dx=h[y*S+(x+1)%S]-h[y*S+(x-1+S)%S], dy=h[((y+1)%S)*S+x]-h[((y-1+S)%S)*S+x];
    let nx=-dx*1.6, ny=-dy*1.6, nz=1; const l=Math.hypot(nx,ny,nz); nx/=l; ny/=l; nz/=l; const i=(y*S+x)*4;
    im.data[i]=(nx*.5+.5)*255; im.data[i+1]=(ny*.5+.5)*255; im.data[i+2]=(nz*.5+.5)*255; im.data[i+3]=255; }
  g.putImageData(im,0,0); return tx(c,false,true); }
function texZinc(){ const S=512,[c,g]=cv(S,S);
  for(let k=0;k<4;k++){ const sx=k*128, rusty=R()<.65, b=rusty?[150+ri(-25,20),80+ri(-15,15),44+ri(-10,10)]:[168+ri(-10,10),170+ri(-10,10),168+ri(-10,10)];
    for(let x=0;x<128;x++){ const f=.8+.2*Math.sin(x/128*Math.PI*16); g.fillStyle=`rgb(${b[0]*f|0},${b[1]*f|0},${b[2]*f|0})`; g.fillRect(sx+x,0,1,S); } }
  for(let i=0;i<80;i++){ g.fillStyle=`rgba(${ri(95,145)},${ri(42,62)},${ri(20,36)},${rr(.15,.45)})`; g.beginPath(); g.ellipse(rr(0,S),rr(0,S),rr(6,40),rr(10,80),0,0,7); g.fill(); }
  g.fillStyle='rgba(30,20,15,.35)'; for(let y=0;y<S;y+=128) g.fillRect(0,y,S,3);
  grain(g,S,S,30); return tx(c); }
function fitFont(g,text,maxW,size,fam,weight=''){ const F=fam+(fam.includes('Bungee')?", Impact, 'Arial Black', sans-serif":", 'Arial Narrow', Arial, sans-serif"); let s=size; g.font=`${weight} ${s}px ${F}`; while(g.measureText(text).width>maxW && s>12){ s-=2; g.font=`${weight} ${s}px ${F}`; } return s; }
const SIGNS=[["GOD'S TIME IS THE BEST","SUPERMARKET · PROVISIONS"],["BLESSED HANDS","UNISEX BARBING SALON"],["NO FOOD FOR LAZY MAN","VENTURES NIG. LTD"],["MAMA PUT","HOT AMALA · EWEDU · GBEGIRI"],
["EKO PHONES","ACCESSORIES & REPAIRS"],["DIVINE FAVOUR","PHARMACY & STORES"],["JUST JOLLOF","KITCHEN · TAKEAWAY"],["ALHAJI MUSA","TEXTILES & LACE"],["CHIDI & SONS","ELECTRONICS"],["IYA BASIRAT","BUKA · RICE & STEW"],
["OMO NAIJA","FASHION HOUSE"],["GRACE ABOUND","POS · BUREAU DE CHANGE"],["LAGOS FRESH","MINI MART"],["AUNTY NGOZI","PEPPER SOUP JOINT"],["POWER BANK","& GENERATOR REPAIRS"],["FAITH","VULCANIZER & AUTO"],
["MERCY DAY","PRINTING PRESS"],["ENIOLA","HAIR & BEAUTY"],["BIG MOTHER","ASUN · SUYA · DRINKS"],["CORNERSTONE","BUILDING MATERIALS"],["KAYODE","LAUNDRY & DRY CLEANING"],["HALLELUJAH","BOOKSHOP"],["ZAINAB","AFRICAN FABRICS"],["OGA JOE","SPARE PARTS"]];
function texSigns(){ const [c,g]=cv(2048,1024), [e,ge]=cv(2048,1024); ge.fillStyle='#000'; ge.fillRect(0,0,2048,1024);
  const bgs=[['#c0392b','#fff'],['#1d4fa3','#ffe066'],['#1e7a46','#fff'],['#f2b705','#1a1a1a'],['#6c2e91','#fff'],['#0f6e78','#fff'],['#e8e2d4','#b3261e'],['#111','#f2b705']];
  SIGNS.forEach(([a,b],i)=>{ const x=(i%4)*512, y=Math.floor(i/4)*128; const [bg,fg]=bgs[i%bgs.length];
    g.fillStyle=bg; g.fillRect(x,y,512,128); g.strokeStyle='rgba(255,255,255,.55)'; g.lineWidth=4; g.strokeRect(x+8,y+8,496,112);
    g.fillStyle=fg; g.textAlign='center'; g.textBaseline='middle'; fitFont(g,a,460,52,'Bungee'); g.fillText(a,x+256,y+52);
    fitFont(g,b,440,26,'"Barlow Semi Condensed"','700'); g.fillText(b,x+256,y+97);
    ge.fillStyle=bg; ge.globalAlpha=.5; ge.fillRect(x,y,512,128); ge.globalAlpha=1; ge.fillStyle=fg; ge.textAlign='center'; ge.textBaseline='middle'; fitFont(ge,a,460,52,'Bungee'); ge.fillText(a,x+256,y+52); });
  const t=tx(c,true,false,Q.tex<1024?1024:2048), te=tx(e,true,false,512); return {map:t, em:te}; }
function texBillboard(l1,l2,bgA,bgB,fg){ const [c,g]=cv(1024,384); const gr=g.createLinearGradient(0,0,1024,384); gr.addColorStop(0,bgA); gr.addColorStop(1,bgB); g.fillStyle=gr; g.fillRect(0,0,1024,384);
  g.fillStyle='rgba(255,255,255,.07)'; for(let i=0;i<14;i++){ g.beginPath(); g.arc(rr(0,1024),rr(0,384),rr(30,140),0,7); g.fill(); }
  g.fillStyle=fg; g.textAlign='center'; g.textBaseline='middle'; fitFont(g,l1,940,120,'Bungee'); g.fillText(l1,512,160); fitFont(g,l2,900,46,'"Barlow Semi Condensed"','700'); g.fillText(l2,512,290); return tx(c,true,false,1024); }
function texLabel(text, bg='#F2B705', fg='#0E1014', w=1024, h=192){ const [c,g]=cv(w,h); g.fillStyle=bg; const r=h/2; g.beginPath(); g.roundRect?g.roundRect(8,8,w-16,h-16,r-8):g.rect(8,8,w-16,h-16); g.fill();
  g.fillStyle=fg; g.textAlign='center'; g.textBaseline='middle'; fitFont(g,text,w-80,96,'Bungee'); g.fillText(text,w/2,h/2+4); const t=tx(c,true,false,1024); return t; }

/* ================= world constants ================= */
// The city is real Mushin, Lagos, from OpenStreetMap (tools/osm_world.py -> assets/maps/mushin_world.json).
// No raised pavements here: roads, compounds and markets all sit on the same red earth.
const SLAB=0;
const PLACES=[]; // things to show on the big map: {name, sub, kind, x, z} (+ door: shop front and which way it faces)
const GATES=[];  // house fronts and compound gates facing the street (people stand there)
const placeKind=sub=>/AMALA|BUKA|JOLLOF|SUYA|PEPPER|KITCHEN|RICE|DRINKS/.test(sub)?'food':/BARB|SALON|HAIR|PHARMACY|POS|BUREAU|LAUNDRY|PRINT|VULCAN|GENERATOR|REPAIR/.test(sub)?'service':'shop';
let WB={x:1650,z:1650};   // half size of the map (set when the map loads)
function onLand(x,z,bm=.6){ return Math.abs(x)<WB.x-bm&&Math.abs(z)<WB.z-bm; }
/* ================= collision hash =================
   Boxes can be turned (ob: centre, axis cos/sin, half sizes) and can float (y0: bottom, h: top), e.g. footbridge rails. */
const colliders=[], CELL=40, hash=new Map();
const hk=(i,j)=>(i+500)*2000+(j+500);
function addCol(b){ if(b.y0===undefined) b.y0=0; colliders.push(b); for(let i=Math.floor(b.x0/CELL);i<=Math.floor(b.x1/CELL);i++) for(let j=Math.floor(b.z0/CELL);j<=Math.floor(b.z1/CELL);j++){ const k=hk(i,j); let a=hash.get(k); if(!a) hash.set(k,a=[]); a.push(b); } return b; }
// a turned box: centre, half sizes along its own axes (u = angle ang, v = u turned 90 degrees), top height
function addOB(cx,cz,hx,hz,ang,h,y0=0){ const c=Math.cos(ang), s=Math.sin(ang), ex=Math.abs(c*hx)+Math.abs(s*hz), ez=Math.abs(s*hx)+Math.abs(c*hz);
  return addCol({x0:cx-ex,x1:cx+ex,z0:cz-ez,z1:cz+ez,h,y0,ob:{cx,cz,c,s,hx,hz}}); }
let qStamp=0; const qOut=[];
function query(x0,z0,x1,z1){ qStamp++; qOut.length=0; for(let i=Math.floor(x0/CELL);i<=Math.floor(x1/CELL);i++) for(let j=Math.floor(z0/CELL);j<=Math.floor(z1/CELL);j++){ const a=hash.get(hk(i,j)); if(a) for(const b of a) if(b._q!==qStamp){ b._q=qStamp; qOut.push(b); } } return qOut; }
// push a circle (radius r, feet at height y) out of every box it overlaps
function resolveCircle(p,r,list=null,y=0){ let hit=false; const cand=list||query(p.x-r,p.z-r,p.x+r,p.z+r);
  for(const b of cand){ if(b.y0>y+1.4||b.h<y+.25) continue;
    if(b.ob){ const o=b.ob, dx=p.x-o.cx, dz=p.z-o.cz, lu=dx*o.c+dz*o.s, lv=-dx*o.s+dz*o.c, cu=clamp(lu,-o.hx,o.hx), cv=clamp(lv,-o.hz,o.hz), du=lu-cu, dv=lv-cv, d2=du*du+dv*dv;
      if(d2<r*r){ hit=true; let nu=lu, nv=lv; if(d2>1e-6){ const d=Math.sqrt(d2); nu=cu+du/d*r; nv=cv+dv/d*r; }
        else { const m0=o.hx-lu, m1=lu+o.hx, m2=o.hz-lv, m3=lv+o.hz, m=Math.min(m0,m1,m2,m3); if(m===m0) nu=o.hx+r; else if(m===m1) nu=-o.hx-r; else if(m===m2) nv=o.hz+r; else nv=-o.hz-r; }
        p.x=o.cx+nu*o.c-nv*o.s; p.z=o.cz+nu*o.s+nv*o.c; } continue; }
    const cx=clamp(p.x,b.x0,b.x1), cz=clamp(p.z,b.z0,b.z1); const dx=p.x-cx, dz=p.z-cz, d2=dx*dx+dz*dz;
    if(d2<r*r){ hit=true; if(d2>1e-6){ const d=Math.sqrt(d2); p.x=cx+dx/d*r; p.z=cz+dz/d*r; }
      else { const l=p.x-b.x0, rt=b.x1-p.x, t=p.z-b.z0, bt=b.z1-p.z, m=Math.min(l,rt,t,bt); if(m===l) p.x=b.x0-r; else if(m===rt) p.x=b.x1+r; else if(m===t) p.z=b.z0-r; else p.z=b.z1+r; } } }
  return hit; }
// how far the camera can look along a ray before it hits a building
function rayDist(o,d,maxD){ let best=maxD; const ex=o.x+d.x*maxD, ez=o.z+d.z*maxD;
  for(const b of query(Math.min(o.x,ex)-1,Math.min(o.z,ez)-1,Math.max(o.x,ex)+1,Math.max(o.z,ez)+1)){
    let t0=0,t1=best,ok=true, ox=o.x, oz=o.z, dx=d.x, dz=d.z, x0=b.x0, x1=b.x1, z0=b.z0, z1=b.z1;
    if(b.ob){ const q=b.ob, rx=o.x-q.cx, rz=o.z-q.cz; ox=rx*q.c+rz*q.s; oz=-rx*q.s+rz*q.c; dx=d.x*q.c+d.z*q.s; dz=-d.x*q.s+d.z*q.c; x0=-q.hx; x1=q.hx; z0=-q.hz; z1=q.hz; }
    SL.t0=0; SL.t1=best; ok=rslab(ox,dx,x0,x1)&&rslab(o.y,d.y,b.y0,b.h)&&rslab(oz,dz,z0,z1); t0=SL.t0;   // no arrays per box: this runs every frame
    if(ok && t0>0 && t0<best) best=t0; }
  return best; }
const SL={t0:0,t1:0};
function rslab(oo,dd,mn,mx){ if(Math.abs(dd)<1e-8) return !(oo<mn||oo>mx); let ta=(mn-oo)/dd, tb=(mx-oo)/dd; if(ta>tb){ const s=ta; ta=tb; tb=s; } if(ta>SL.t0) SL.t0=ta; if(tb<SL.t1) SL.t1=tb; return SL.t0<=SL.t1; }

/* ================= geometry accumulator ================= */
class Acc{ constructor(){ this.p=[]; this.n=[]; this.u=[]; this.c=[]; }
  quad(A,B,C,D,n,uv,col){ for(const [P,Q] of [[A,uv[0]],[B,uv[1]],[C,uv[2]],[A,uv[0]],[C,uv[2]],[D,uv[3]]]){ this.p.push(P[0],P[1],P[2]); this.n.push(n[0],n[1],n[2]); this.u.push(Q[0],Q[1]); this.c.push(col.r,col.g,col.b); } }
  tri(A,B,C,n,uv,col){ for(const [P,Q] of [[A,uv[0]],[B,uv[1]],[C,uv[2]]]){ this.p.push(P[0],P[1],P[2]); this.n.push(n[0],n[1],n[2]); this.u.push(Q[0],Q[1]); this.c.push(col.r,col.g,col.b); } }
  mesh(mat,shadow=true,receive=true){ if(!this.p||!this.p.length){ this.p=this.n=this.u=this.c=null; return null; } const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(this.u,2)); g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
    this.p=this.n=this.u=this.c=null;   // the plain arrays are big: let them go
    g.computeBoundingSphere(); freeAfterUpload(g); const m=new THREE.Mesh(g,mat); m.castShadow=shadow; m.receiveShadow=receive; return m; } }
// static city geometry is needed only on the graphics card: once uploaded, drop the copy in memory (phones have little)
function freeAfterUpload(g){ for(const k in g.attributes) g.attributes[k].onUpload(function(){ this.array=new this.array.constructor(1); }); if(g.index) g.index.onUpload(function(){ this.array=new this.array.constructor(1); }); }
const WHITE=new THREE.Color(1,1,1);
function wallQ(acc,p0,p1,y0,y1,tw,th,u0,v0,col){ const dx=p1[0]-p0[0], dz=p1[1]-p0[1], L=Math.hypot(dx,dz); if(L<1e-3) return; const n=[-dz/L,0,dx/L];
  const ua=u0, ub=u0+L/tw, va=v0, vb=v0+(y1-y0)/th;
  acc.quad([p0[0],y0,p0[1]],[p1[0],y0,p1[1]],[p1[0],y1,p1[1]],[p0[0],y1,p0[1]],n,[[ua,va],[ub,va],[ub,vb],[ua,vb]],col); }
function boxWalls(acc,b,y0,y1,tw,th,u0,v0,col,inward=false){ const {x0,x1,z0,z1}=b;
  const pts = inward ? [[x0,z1],[x0,z0],[x1,z0],[x1,z1],[x0,z1]] : [[x0,z1],[x1,z1],[x1,z0],[x0,z0],[x0,z1]];
  let u=u0; for(let i=0;i<4;i++){ wallQ(acc,pts[i],pts[i+1],y0,y1,tw,th,u,v0,col); u+=Math.hypot(pts[i+1][0]-pts[i][0],pts[i+1][1]-pts[i][1])/tw; } }
function topQ(acc,b,y,col,ts=8){ const {x0,x1,z0,z1}=b; acc.quad([x0,y,z1],[x1,y,z1],[x1,y,z0],[x0,y,z0],[0,1,0],[[x0/ts,-z1/ts],[x1/ts,-z1/ts],[x1/ts,-z0/ts],[x0/ts,-z0/ts]],col); }
function slab(accTop,accSide,b,y,ts=4){ topQ(accTop,b,y,WHITE,ts); boxWalls(accSide,b,0,y,2,2,0,0,WHITE); }

/* ================= instancing helper ================= */
const _m=new THREE.Matrix4(), _q=new THREE.Quaternion(), _e=new THREE.Euler(), _p=new THREE.Vector3(), _s=new THREE.Vector3();
function inst(geo,mat,list,{shadow=true,layer=1,colors=null}={}){ if(!list.length) return null; const im=new THREE.InstancedMesh(geo,mat,list.length);
  list.forEach((t,i)=>{ _e.set(t.rx||0,t.ry||0,t.rz||0,'YXZ'); _q.setFromEuler(_e); _p.set(t.x,t.y,t.z); _s.set(t.sx??1,t.sy??1,t.sz??1); _m.compose(_p,_q,_s); im.setMatrixAt(i,_m); if(colors) im.setColorAt(i,colors[i]); });
  im.instanceMatrix.needsUpdate=true; if(colors) im.instanceColor.needsUpdate=true; im.castShadow=shadow; im.receiveShadow=true; im.layers.set(layer); scene.add(im); return im; }

/* ================= boot: all downloads start at once, with real progress ================= */
const BASIS_PATH='https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/basis/';
const KTX2=new KTX2Loader().setTranscoderPath(BASIS_PATH).detectSupport(renderer);
const GLL=new GLTFLoader().setKTX2Loader(KTX2).setMeshoptDecoder(MeshoptDecoder);
const DL={got:{},exp:{}}; let buildP=0, buildTxt='Starting the engine…';
const dlFrac=()=>{ let g=0,e=0; for(const k in DL.exp){ e+=DL.exp[k]; g+=Math.min(DL.got[k]||0,DL.exp[k]); } return e?g/e:0; };
const dlMB=()=>{ let g=0,e=0; for(const k in DL.exp){ e+=DL.exp[k]; g+=Math.min(DL.got[k]||0,DL.exp[k]); } return [g/1048576,e/1048576]; };
function showProgress(){ const f=dlFrac(), [g,e]=dlMB(); loadBar.style.width=(Math.min(99,(f*.62+buildP*.38)*100)).toFixed(1)+'%';
  loadTxt.textContent=buildTxt+(e>0&&f<.999?`  ·  ${g.toFixed(1)} / ${e.toFixed(1)} MB`:''); }
async function step(txt,p){ buildTxt=txt; buildP=p/100; showProgress(); await frameWait(); }
const progTimer=setInterval(showProgress,250);
async function fetchBuf(url,tries=3){ for(let a=0;a<tries;a++){ const ctl=new AbortController(); let timer=setTimeout(()=>ctl.abort(),45000);
  try{ const r=await fetch(url,{signal:ctl.signal}); if(!r.ok) throw new Error(url+' '+r.status);
    const len=+r.headers.get('content-length')||0; if(!DL.exp[url]&&len) DL.exp[url]=len;
    if(!r.body||!r.body.getReader){ const b=await r.arrayBuffer(); DL.got[url]=b.byteLength; clearTimeout(timer); return b; }
    const rd=r.body.getReader(), parts=[]; let got=0;
    for(;;){ const {done,value}=await rd.read(); if(done) break; parts.push(value); got+=value.length; DL.got[url]=got; clearTimeout(timer); timer=setTimeout(()=>ctl.abort(),30000); }
    clearTimeout(timer); const out=new Uint8Array(got); let o=0; for(const q of parts){ out.set(q,o); o+=q.length; } DL.got[url]=DL.exp[url]||got; return out.buffer;
  }catch(e){ clearTimeout(timer); DL.got[url]=0; if(a===tries-1) throw e; await new Promise(r=>setTimeout(r,900*(a+1))); } } }
let MANIFEST={}; try{ const r=await fetch('assets/manifest.json',{cache:'no-cache'}); if(r.ok) MANIFEST=await r.json(); }catch(e){}
const clockSync=CLOCK.syncClock();
// key: [file, front direction, real size (m) along x after turning, has a low-detail file]
const MODEL_FILES={danfo:['yellowvan','-x',4.8,1],keke:['three-wheeled','-x',2.75,1],bus:['citybus','+z',10.5,1],police:['police_pickup','-x',5.3,1],okada:['red_motorcycle','-x',2.05,1],sedan:['sedancar','-x',4.55,1],
  bungalow:['ns_bungalow','h',12.5,1],house:['ns_house','h',16,1],storey:['ns_storey','h',12.5,1],station:['police_station','h',26,1],office:['modernoffice','h',21,1],tlight:['traffic_light','tl',0,0]};
const AV=MANIFEST._v||{}; const murl=f=>{ const u=`assets/models/${f}.glb`, k=AV[u]||MANIFEST[u]; return k?u+'?v='+k:u; };
// the map: real Mushin (roads, buildings, markets, schools...) from OpenStreetMap
const WORLD_URL=(()=>{ const u='assets/maps/mushin_world.json', k=AV[u]||MANIFEST[u]; return k?u+'?v='+k:u; })(); DL.exp[WORLD_URL]=MANIFEST['assets/maps/mushin_world.json']||1230000;
const worldJob=fetchBuf(WORLD_URL).then(b=>JSON.parse(new TextDecoder().decode(b))); worldJob.catch(()=>{});
for(const [,[file,,,lod]] of Object.entries(MODEL_FILES)){ for(const f of lod?[file,file+'_lod1']:[file]){ const u=murl(f); DL.exp[u]=MANIFEST[`assets/models/${f}.glb`]||300000; } }
const HERO_FILES=['character','idle','walk','run','enter_car']; const HERO_URL='assets/characters/hero.glb'+((AV['assets/characters/hero.glb']||MANIFEST['assets/characters/hero.glb'])?'?v='+(AV['assets/characters/hero.glb']||MANIFEST['assets/characters/hero.glb']):''); DL.exp[HERO_URL]=MANIFEST['assets/characters/hero.glb']||720000;
function floatGeo(g){ for(const k of Object.keys(g.attributes)){ const a=g.attributes[k]; if(a.isInterleavedBufferAttribute||!(a.array instanceof Float32Array)){ const n=a.count, s=a.itemSize, f=new Float32Array(n*s);
      for(let i=0;i<n;i++){ f[i*s]=a.getX(i); if(s>1) f[i*s+1]=a.getY(i); if(s>2) f[i*s+2]=a.getZ(i); if(s>3) f[i*s+3]=a.getW(i); } g.setAttribute(k,new THREE.BufferAttribute(f,s)); } } return g; }
function meshOf(gltf){ let mesh=null; gltf.scene.updateMatrixWorld(true); gltf.scene.traverse(o=>{ if(o.isMesh&&!mesh) mesh=o; }); return mesh; }
/* colour grading for the Blender houses (tools/blender_houses.py): their paint is pure and bright, which burns out
   under the Lagos sun. Whites come down to a warm, slightly weathered cream, every colour loses a little saturation
   and gets a sun-faded warm cast, so the houses sit in the dusty street instead of shining. */
function gradeHouse(geo){ const c=geo.attributes.color; if(!c) return;
  for(let i=0;i<c.count;i++){ let r=c.getX(i), g=c.getY(i), b=c.getZ(i); const l=.2126*r+.7152*g+.0722*b;
    const hi=Math.min(1,Math.max(0,(l-.45)/.45)), k=.8*(1-.2*hi*hi*(3-2*hi));            // pull the brights down hardest
    r=(r+(l-r)*.18)*k*1.0; g=(g+(l-g)*.18)*k*.955; b=(b+(l-b)*.18)*k*.88;                // less saturated, warmer
    c.setXYZ(i,r,g,b); } c.needsUpdate=true; }
const modelJobs=Object.entries(MODEL_FILES).map(async([key,[file,front,size,lod]])=>{
  const get=f=>fetchBuf(murl(f)).then(b=>GLL.parseAsync(b,''));
  const res=await Promise.allSettled((lod?[file,file+'_lod1']:[file]).map(get)); if(res[0].status!=='fulfilled') throw res[0].reason;
  const parsed=res.filter(r=>r.status==='fulfilled').map(r=>r.value);
  const out={}; let T=null;
  parsed.forEach((gltf,li)=>{ const mesh=meshOf(gltf); const geo=floatGeo(mesh.geometry.clone()); geo.applyMatrix4(mesh.matrixWorld);
    if(file.startsWith('ns_')) gradeHouse(geo);
    if(front==='-x') geo.rotateY(Math.PI); else if(front==='+z') geo.rotateY(Math.PI/2);
    geo.computeBoundingBox(); const bb=geo.boundingBox, sz=new THREE.Vector3(); bb.getSize(sz);
    if(!T) T={cx:(bb.min.x+bb.max.x)/2,cz:(bb.min.z+bb.max.z)/2,y0:bb.min.y,sc:front==='tl'?1:size/sz.x};
    geo.translate(-T.cx,-T.y0,-T.cz); if(front==='tl') geo.translate(T.cx,0,T.cz); geo.scale(T.sc,T.sc,T.sc); geo.computeBoundingBox(); geo.computeBoundingSphere(); geo.boundingBox.getSize(sz);
    const mat=mesh.material; if(mat.map){ mat.map.anisotropy=maxAniso; mat.map.colorSpace=THREE.SRGBColorSpace; }
    const bld=front==='h'; mat.side=bld&&li>0?THREE.FrontSide:THREE.DoubleSide; mat.roughness=bld?.9:(front==='tl'?.6:.55); mat.metalness=bld?0:(front==='tl'?.3:.15);
    if(li===0) Object.assign(out,{geo,mat,W:sz.x,D:sz.z,H:sz.y,cz0:T.cz,sc0:T.sc}); else Object.assign(out,{geo1:geo,mat1:mat}); });
  return [key,out]; });
modelJobs.forEach(p=>p.catch(()=>{}));
// trees: one picture strip per kind, the real tree seen from 8 sides (tools/impostor.py)
const TREE_FILES=['tree_oak','tree_oak_big','tree_palm']; for(const f of TREE_FILES){ DL.exp[murl(f)]=MANIFEST[`assets/models/${f}.glb`]||130000; }
const treeJobs=TREE_FILES.map(f=>fetchBuf(murl(f)).then(b=>GLL.parseAsync(b,'')).then(g=>{ const m=meshOf(g); m.geometry.computeBoundingBox(); const sz=m.geometry.boundingBox.getSize(new THREE.Vector3()); return [f,{geo:m.geometry,map:m.material.map,W:sz.x,H:sz.y}]; }));
treeJobs.forEach(p=>p.catch(()=>{}));
// the player: one compressed GLB (mesh + idle/walk/run/enter-car); the original FBX files are only a fallback
const heroBufsJob=fetchBuf(HERO_URL).then(b=>GLL.parseAsync(b,'')).then(g=>({gltf:g})).catch(async e=>{ console.warn('hero.glb failed, trying FBX',e);
  for(const n of HERO_FILES){ const u=`assets/characters/${n}.fbx`; DL.exp[u]=MANIFEST[u]||400000; } return {fbx:await Promise.all(HERO_FILES.map(n=>fetchBuf(`assets/characters/${n}.fbx`)))}; });
heroBufsJob.catch(()=>{});
await Promise.race([(async()=>{ const l=document.querySelector('link[href*="fonts.googleapis"]'); if(l&&!l.sheet) await new Promise(r=>{ l.addEventListener('load',r,{once:true}); l.addEventListener('error',r,{once:true}); }); await Promise.all([document.fonts.load('48px Bungee'),document.fonts.load('700 24px "Barlow Semi Condensed"')]); })().catch(()=>{}), new Promise(r=>setTimeout(r,3000))]);
await step('Mixing paint for Mushin…', 6);

const T = {};
T.glass=texGlass('#2e5466','#16242c','#a3adb3');
T.bronze=texGlass('#3a2e22','#1a140f','#6e6458');
T.office=texOffice(); T.resi=texResi(); T.old=texOld(); T.shop=texShop();
T.roof=texConcrete('#8f8c85',512,34); T.zinc=texZinc(); T.wall=texConcrete('#d9d2c4',256,24); T.conc=texConcrete('#a8a49c',256,26);
T.pavers=texPavers(); T.plaza=texPlaza(); T.grass=texGrass();
T.road2=texRoad(2); T.road4=texRoad(4); T.cross=texCross(); T.glow=texGlow();
T.signs=texSigns();
const ANKP=[['#e8590c','#0b7285','#ffd43b','#2b2b2b'],['#5f3dc4','#f08c00','#e64980','#fff3bf'],['#2b8a3e','#fab005','#c92a2a','#f8f9fa'],['#1864ab','#ff922b','#fcc419','#212529'],['#a61e4d','#20c997','#ffe066','#343a40'],['#f2b705','#111111','#16a06b','#f7efdf']];
const ANKC=[]; const ANK=ANKP.map(texAnkara);

const facMat=(t,o={})=>new THREE.MeshStandardMaterial({map:t.map,emissiveMap:t.em,emissive:0xffffff,emissiveIntensity:0,vertexColors:true,roughness:o.rough??1,metalness:o.metal??1,roughnessMap:t.rm||null,metalnessMap:t.rm||null,...(o.extra||{})});
const MAT={
  glass:facMat(T.glass,{rough:.12,metal:.85}), bronze:facMat(T.bronze,{rough:.14,metal:.85}),
  office:facMat(T.office), resi:facMat(T.resi), oldmid:facMat(T.old), shop:facMat(T.shop),
  roof:new THREE.MeshStandardMaterial({map:T.roof,vertexColors:true,roughness:.95}),
  zinc:new THREE.MeshStandardMaterial({map:T.zinc,vertexColors:true,metalness:.55,roughness:.62,side:THREE.DoubleSide}),
  fence:new THREE.MeshStandardMaterial({map:T.wall,vertexColors:true,roughness:.92}),
  curb:new THREE.MeshStandardMaterial({map:T.conc,roughness:.9,color:0xd8d4cc}),
  pave:new THREE.MeshStandardMaterial({map:T.pavers,roughness:.92}),
  plaza:new THREE.MeshStandardMaterial({map:T.plaza,roughness:.75}),
  grass:new THREE.MeshStandardMaterial({map:T.grass,roughness:1}),
  road2:new THREE.MeshStandardMaterial({map:T.road2,roughness:.88,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),
  road4:new THREE.MeshStandardMaterial({map:T.road4,roughness:.88,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),
  cross:new THREE.MeshStandardMaterial({map:T.cross,roughness:.88,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}),
  roadBad2:new THREE.MeshStandardMaterial({map:texRoadBad(2),roughness:.9,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),
  roadBad4:new THREE.MeshStandardMaterial({map:texRoadBad(4),roughness:.9,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),
  dirt:new THREE.MeshStandardMaterial({map:texDirt(),roughness:.97,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),
  asph:new THREE.MeshStandardMaterial({map:texAsph(),roughness:.88,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}),
  ground:new THREE.MeshStandardMaterial({map:texGround(),roughness:1,polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:2}),
  sand:new THREE.MeshStandardMaterial({map:texSand(),roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),
  lot:new THREE.MeshStandardMaterial({map:T.conc,roughness:.92,color:0xc9c2b6,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),
  lawn:new THREE.MeshStandardMaterial({map:T.grass,roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),
  sign:new THREE.MeshStandardMaterial({map:T.signs.map,emissiveMap:T.signs.em,emissive:0xffffff,emissiveIntensity:0,roughness:.6,polygonOffset:true,polygonOffsetFactor:-1}),
  conc:new THREE.MeshStandardMaterial({map:T.conc,roughness:.85,color:0xe4e0d8}),
  base:new THREE.MeshStandardMaterial({color:0x3a3b3e,roughness:.95}),
};
/* Real ground pictures (tools/ground_tex.py): red laterite with gravel, stones and dry grass, and a tropical lawn,
   each with a bump picture so stones catch the sun. They load in the background; the painted ground shows until they arrive.
   The shader hides the repeat: a second, much bigger copy of the same picture is blended in by a slow blotchy mask,
   and the whole ground is lightened and darkened in wide patches, so no two 16 m squares look alike. */
const GTEX=(()=>{ const tl=new THREE.TextureLoader(), u=f=>{ const p=`assets/models/${f}`, k=AV[p]||MANIFEST[p]; return k?p+'?v='+k:p; };
  const load=(f,srgb)=>tl.loadAsync(u(f)).then(t=>{ if(srgb) t.colorSpace=THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=maxAniso; return t; }).catch(()=>null);
  return {ground:Promise.all([load('ground_laterite.jpg',true),load('ground_laterite_n.jpg',false)]), lawn:Promise.all([load('grass_lawn.jpg',true),load('grass_lawn_n.jpg',false)]), clouds:load('clouds.png',true)}; })();
function antiTile(m,big=.19,mac=.045){ m.onBeforeCompile=sh=>{ sh.fragmentShader=sh.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
    vec4 sampledDiffuseColor=texture2D(map,vMapUv);
    vec2 uvB=mat2(.8,-.6,.6,.8)*vMapUv*${big.toFixed(3)}+vec2(.37,.11);
    vec4 farC=texture2D(map,uvB);
    float macro=texture2D(map,vMapUv*${mac.toFixed(3)}+vec2(.21,.63)).g;
    float k=smoothstep(.3,.6,texture2D(map,vMapUv*${(mac*.6).toFixed(3)}).r);
    sampledDiffuseColor=mix(sampledDiffuseColor,farC,k*.5);
    sampledDiffuseColor.rgb*=.8+.5*smoothstep(.2,.7,macro);
    diffuseColor*=sampledDiffuseColor;
  #endif`); }; m.customProgramCacheKey=()=>'antitile'+big+mac; }
GTEX.ground.then(([c,n])=>{ if(!c) return; for(const m of [MAT.ground]){ m.map=c; if(n){ m.normalMap=n; m.normalScale.set(.9,.9); } m.color.setHex(0xffffff); m.userData.c0=m.color.clone(); antiTile(m); m.needsUpdate=true; } });
// dirt roads keep their ruts and grassy edges, and get the real earth's grain and bumps on top
GTEX.ground.then(([c,n])=>{ if(!c) return; const m=MAT.dirt; m.userData.detail=c; if(n){ m.normalMap=n; m.normalScale.set(.8,.8); }
  m.onBeforeCompile=sh=>{ sh.uniforms.detailMap={value:c}; sh.fragmentShader='uniform sampler2D detailMap;\n'+sh.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    float dl=dot(texture2D(detailMap,vMapUv*vec2(1.,2.)).rgb,vec3(.2126,.7152,.0722))/.138; diffuseColor.rgb*=clamp(mix(1.,dl,.8),.55,1.45);`); };
  m.customProgramCacheKey=()=>'dirt-detail'; m.needsUpdate=true; });
GTEX.lawn.then(([c,n])=>{ if(!c) return; for(const m of [MAT.lawn,MAT.grass]){ m.map=c; if(n){ m.normalMap=n; m.normalScale.set(.7,.7); } antiTile(m,.23,.05); m.needsUpdate=true; } });
const FAC_KEYS=['glass','bronze','office','resi','oldmid','shop'];
const TILE={glass:[12.8,28.8],bronze:[12.8,28.8],office:[12,28.8],resi:[12.8,25.6],oldmid:[12,27.2],shop:[20,4.4]};
const TINTS={glass:['#ffffff','#e2f2ff','#dcfff2','#eef0ff'],bronze:['#ffffff','#fff0dc'],office:['#ffffff','#f1ece2','#e6e1d8','#fff6e6'],
  resi:['#fffaf0','#ffe6d2','#e2f0ff','#e4f6e8','#f1e6ff','#ffffff','#fff1c0'],oldmid:['#f6d98b','#f2b8a8','#a9d6e5','#b8e0b0','#e9c46a','#f4a261','#ddd5c8','#c9b8e8','#e7e1d3']};
const A={}; for(const k of [...FAC_KEYS,'roof','zinc','fence','curb','pave','plaza','grass','road2','road4','cross','sign','conc','roadBad2','roadBad4','dirt','asph','sand','lot','lawn']) A[k]=new Acc();
const ROAD_MATS=[MAT.road2,MAT.road4,MAT.cross,MAT.roadBad2,MAT.roadBad4,MAT.dirt,MAT.pave,MAT.plaza,MAT.curb,MAT.asph,MAT.ground,MAT.sand,MAT.lot];
// how much shine rain gives each surface: earth and sand only get damp (never a mirror), tar and concrete a soft sheen
const WET_K=new Map([[MAT.dirt,.3],[MAT.ground,.3],[MAT.sand,.25],[MAT.lot,.4],[MAT.pave,.4],[MAT.plaza,.45],[MAT.curb,.35]]);
for(const m of ROAD_MATS){ m.userData.r0=m.roughness; m.userData.c0=m.color.clone(); m.userData.k=WET_K.get(m)??.55; }

/* ================= sky, sun, water ================= */
await step('Hanging the sun over Mushin…', 14);
const hemi=new THREE.HemisphereLight(0xffc6a0,0x5a4636,.55); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffb26b,2.6); sun.castShadow=Q.shadows;
sun.shadow.mapSize.set(Q.sh,Q.sh);
Object.assign(sun.shadow.camera,{left:-Q.shR,right:Q.shR,top:Q.shR,bottom:-Q.shR,near:1,far:600});
sun.shadow.bias=-0.0003; sun.shadow.normalBias=0.06; sun.shadow.camera.layers.enable(1); sun.shadow.camera.updateProjectionMatrix();
scene.add(sun, sun.target);
// no extra lamp follows the player any more (every light costs every pixel); at night the player and people get a soft self-glow instead
const fillLight={intensity:0,position:new THREE.Vector3(),visible:true};
const sky=new Sky(); sky.scale.setScalar(8000);
// The sky is drawn into a small cube picture every couple of seconds and shown as the background: the full sky
// formula used to run for every pixel of the screen, which cost phones and laptops a quarter of each frame.
const skyCube=(()=>{ const ht=renderer.capabilities.isWebGL2&&renderer.extensions.has('EXT_color_buffer_float'); return new THREE.WebGLCubeRenderTarget(Q.sky,{type:ht?THREE.HalfFloatType:THREE.UnsignedByteType,generateMipmaps:false}); })();
const skyCam=new THREE.CubeCamera(1,20000,skyCube); scene.background=skyCube.texture;
const sunDir=new THREE.Vector3(), lightDir=new THREE.Vector3();
let water, WU;
if(Q.mirror){ water=new Water(new THREE.PlaneGeometry(9000,9000),{textureWidth:Q.water,textureHeight:Q.water,waterNormals:texWaterNormals(),sunDirection:new THREE.Vector3(0,1,0),sunColor:0xffffff,waterColor:0x1a3b48,distortionScale:2.4,fog:true}); WU=water.material.uniforms; }
else { const wn=texWaterNormals(); wn.repeat.set(700,700); const wm=new THREE.MeshStandardMaterial({color:0x1a3b48,roughness:.08,metalness:.1,normalMap:wn,normalScale:new THREE.Vector2(.35,.35),envMapIntensity:1.15});
  water=new THREE.Mesh(new THREE.PlaneGeometry(9000,9000),wm); WU={time:{value:0},sunDirection:{value:new THREE.Vector3()},waterColor:{value:wm.color},sunColor:{value:new THREE.Color()},_n:wn}; }
water.rotation.x=-Math.PI/2; water.position.y=-1.6; scene.add(water);
const starGeo=new THREE.BufferGeometry(); { const a=[]; for(let i=0;i<1600;i++){ const th=MR()*Math.PI*2, ph=Math.acos(MR()*0.95); a.push(Math.sin(ph)*Math.cos(th)*5000, Math.cos(ph)*5000, Math.sin(ph)*Math.sin(th)*5000); } starGeo.setAttribute('position',new THREE.Float32BufferAttribute(a,3)); }
const stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xffffff,size:1.6,sizeAttenuation:false,fog:false,transparent:true,opacity:.8})); stars.visible=false; scene.add(stars);

/* ================= the map: real Mushin roads (OpenStreetMap) ================= */
await step('Laying the roads of Mushin…', 22);
const WD=await worldJob; WB={x:WD.half[0]-4,z:WD.half[1]-4};
water.visible=false; water.position.y=-40;   // no lagoon in Mushin
// road classes: 0 expressway 1 trunk 2 primary 3 secondary 4 tertiary 5 unclassified 6 residential 7 living street 8 service lane 9 track
const nodes=[]; for(let i=0;i<WD.nodes.length;i+=2) nodes.push({i:nodes.length,x:WD.nodes[i],z:WD.nodes[i+1],adj:[],wadj:[],out:[],ed:[],r:0,deg:0,ax:0,tl:false,tlo:0});
const ROADS=[], EK=new Map(), ek=(a,b)=>a<b?a*65536+b:b*65536+a;
const wayHash=w=>(Math.imul(w+1,2654435761)>>>0)%1000/1000;
for(let k=0;k<WD.edges.length;k+=7){ const [a,b,c,w,n,f,way]=WD.edges.slice(k,k+7), A0=nodes[a], B0=nodes[b], dx=B0.x-A0.x, dz=B0.z-A0.z, len=Math.hypot(dx,dz)||.01, h=wayHash(way);
  // road surface: unpaved streets are red earth; many residential streets are broken asphalt; the big roads are mostly fine
  const cond=(f&2)?'dirt':c>=5?(h<.5?'bad':'good'):c>=3?(h<.22?'bad':'good'):'good';
  const e={i:ROADS.length,a,b,c,w,hw:w/2,name:n>=0?WD.names[n]:'',f,way,len,fx:dx/len,fz:dz/len,cond,ow:!!(f&1),drive:!!(f&8),br:!!(f&4)};
  ROADS.push(e); EK.set(ek(a,b),e); A0.ed.push(e); B0.ed.push(e); A0.adj.push(b); B0.adj.push(a);
  if(c>0&&c<9){ A0.wadj.push(b); B0.wadj.push(a); }      // nobody walks along the expressway
  if(e.drive){ A0.out.push(b); if(!e.ow) B0.out.push(a); } }
const edgeOf=(a,b)=>EK.get(ek(a,b));
for(const n of nodes){ n.deg=n.ed.length; n.big=Math.min(9,...n.ed.filter(e=>e.drive).map(e=>e.c)); if(n.deg>=3){ let r=0,bw=-1; for(const e of n.ed){ r=Math.max(r,e.hw); if(e.w>bw){ bw=e.w; const o=e.a===n.i?1:-1; n.ax=Math.atan2(e.fz*o,e.fx*o); } } n.r=r+.6; } }
const EDGES=[]; for(const n of nodes) for(const m of n.out) EDGES.push([n.i,m]);   // every way a car may drive along a piece
function edgeHalf(a,b){ const e=edgeOf(a.i,b.i); return e?e.hw:3; }
function crossHalf(n){ return n.r; }
// road pieces by area, for "which road am I on" questions
const RG=new Map(), RGC=30, rgk=(i,j)=>(i+300)*1000+(j+300);
for(const e of ROADS){ const A0=nodes[e.a],B0=nodes[e.b], pad=e.hw+3;
  for(let i=Math.floor((Math.min(A0.x,B0.x)-pad)/RGC);i<=Math.floor((Math.max(A0.x,B0.x)+pad)/RGC);i++) for(let j=Math.floor((Math.min(A0.z,B0.z)-pad)/RGC);j<=Math.floor((Math.max(A0.z,B0.z)+pad)/RGC);j++){ const k=rgk(i,j); let L=RG.get(k); if(!L) RG.set(k,L=[]); L.push(e); } }
const roadsNear=(x,z)=>RG.get(rgk(Math.floor(x/RGC),Math.floor(z/RGC)))||[];
function segD(e,x,z){ const A0=nodes[e.a], t=clamp((x-A0.x)*e.fx+(z-A0.z)*e.fz,0,e.len); return Math.hypot(x-A0.x-e.fx*t,z-A0.z-e.fz*t); }
function roadAt(x,z,extra=0){ let best=null,bd=1e9; for(const e of roadsNear(x,z)){ const d=segD(e,x,z)-e.hw-extra; if(d<0&&d<bd){ bd=d; best=e; } } return best; }
function nearestRoad(x,z,filter=null){ let best=null,bd=1e9; for(const e of roadsNear(x,z)){ if(filter&&!filter(e)) continue; const d=segD(e,x,z)-e.hw; if(d<bd){ bd=d; best=e; } } return best?[best,bd]:[null,1e9]; }
const onRoad=(x,z)=>!!roadAt(x,z);
function condAt(x,z){ const e=roadAt(x,z,.3); return e?e.cond:null; }
function groundY(){ return 0; }

// ---- the ground, then parks, school fields, market yards and filling stations
{ const W2=2*WB.x+600, D2=2*WB.z+600, g=new THREE.PlaneGeometry(W2,D2); g.rotateX(-Math.PI/2);
  const uv=g.attributes.uv; for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*W2/16,uv.getY(i)*D2/16);
  const m=new THREE.Mesh(g,MAT.ground); m.receiveShadow=true; scene.add(m); }
const AREAS=WD.areas.map(a=>({...a,pts:(()=>{ const o=[]; for(let i=0;i<a.p.length;i+=2) o.push([a.p[i],a.p[i+1]]); return o; })()}));
function inPoly(pts,x,z){ let ins=false; for(let i=0,j=pts.length-1;i<pts.length;j=i++){ const [xi,zi]=pts[i],[xj,zj]=pts[j]; if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi+1e-12)+xi) ins=!ins; } return ins; }
function areaAt(x,z,kinds){ for(const a of AREAS) if((!kinds||kinds.includes(a.k))&&inPoly(a.pts,x,z)) return a; return null; }
const AREA_ACC={pitch:'lawn',grassland:'lawn',scrub:'lawn',farmland:'lawn',park:'lawn',recreation_ground:'lawn',school:'sand',marketplace:'lot',retail:'lot',parking:'lot',fuel:'lot',hospital:'lawn'};
for(const a of AREAS){ const k=AREA_ACC[a.k]; if(!k||a.pts.length<3) continue; const acc=A[k], y=.012;
  const contour=a.pts.map(([x,z])=>new THREE.Vector2(x,z)); let tris; try{ tris=THREE.ShapeUtils.triangulateShape(contour,[]); }catch(e){ continue; }
  for(const [i0,i1,i2] of tris){ let P0=a.pts[i0],P1=a.pts[i1],P2=a.pts[i2]; const cr=(P1[0]-P0[0])*(P2[1]-P0[1])-(P1[1]-P0[1])*(P2[0]-P0[0]); if(cr>0){ const t=P1; P1=P2; P2=t; }
    acc.tri([P0[0],y,P0[1]],[P1[0],y,P1[1]],[P2[0],y,P2[1]],[0,1,0],[[P0[0]/8,-P0[1]/8],[P1[0]/8,-P1[1]/8],[P2[0]/8,-P2[1]/8]],WHITE); } }

// ---- road surfaces: each piece is a strip; bends meet in a clean mitre, junctions get a paved patch
const RY=.03;
// a strip that lies over another road (the two halves of a dual carriageway meeting, a slip road) gets plain asphalt, so painted lines never cross
function overlapsRoad(e){ const A0=nodes[e.a]; for(const k of [.25,.5,.75]){ const x=A0.x+e.fx*e.len*k, z=A0.z+e.fz*e.len*k;
    for(const o of roadsNear(x,z)){ if(o===e||o.a===e.a||o.a===e.b||o.b===e.a||o.b===e.b) continue; if(segD(o,x,z)<(e.hw+o.hw)*.85) return true; } } return false; }
function roadAcc(e){ const wide=e.w>=12&&!e.ow; if(e.cond==='dirt') return A.dirt; if(overlapsRoad(e)) return A.asph; return e.cond==='bad'?(wide?A.roadBad4:A.roadBad2):(wide?A.road4:A.road2); }
function endCorners(e,atA){ const n=nodes[atA?e.a:e.b], Rx=-e.fz, Rz=e.fx, hw=e.hw;
  if(n.deg>=3){ const s=atA?Math.min(n.r,e.len*.5):Math.max(e.len-n.r,e.len*.5), A0=nodes[e.a], px=A0.x+e.fx*s, pz=A0.z+e.fz*s; return [[px-Rx*hw,pz-Rz*hw],[px+Rx*hw,pz+Rz*hw]]; }
  if(n.deg===2){ const o=n.ed[0]===e?n.ed[1]:n.ed[0], oth=nodes[o.a===n.i?o.b:o.a]; let d1x,d1z,d2x,d2z;
    if(atA){ const L=Math.hypot(n.x-oth.x,n.z-oth.z)||1; d1x=(n.x-oth.x)/L; d1z=(n.z-oth.z)/L; d2x=e.fx; d2z=e.fz; } else { const L=Math.hypot(oth.x-n.x,oth.z-n.z)||1; d1x=e.fx; d1z=e.fz; d2x=(oth.x-n.x)/L; d2z=(oth.z-n.z)/L; }
    let mx=-d1z-d2z, mz=d1x+d2x; const ml=Math.hypot(mx,mz); if(ml<.2){ return [[n.x-Rx*hw,n.z-Rz*hw],[n.x+Rx*hw,n.z+Rz*hw]]; } mx/=ml; mz/=ml;
    const k=Math.min(hw*2.5,hw/Math.max(.3,mx*Rx+mz*Rz)); return [[n.x-mx*k,n.z-mz*k],[n.x+mx*k,n.z+mz*k]]; }
  return [[n.x-Rx*hw,n.z-Rz*hw],[n.x+Rx*hw,n.z+Rz*hw]]; }
for(const e of ROADS){ const A0=nodes[e.a], B0=nodes[e.b]; if(A0.deg>=3&&B0.deg>=3&&A0.r+B0.r>=e.len) continue;
  const [am,ap]=endCorners(e,true), [bm,bp]=endCorners(e,false), acc=roadAcc(e), uT=e.cond==='dirt'?9:11, L=e.len/uT, u0=(e.way*.37)%1;
  acc.quad([am[0],RY,am[1]],[ap[0],RY,ap[1]],[bp[0],RY,bp[1]],[bm[0],RY,bm[1]],[0,1,0],[[u0,0],[u0,1],[u0+L,1],[u0+L,0]],WHITE); }
for(const n of nodes){ if(n.deg<3) continue; const arms=n.ed.map(e=>{ const o=e.a===n.i?1:-1; return {e,ux:e.fx*o,uz:e.fz*o,ang:Math.atan2(e.fz*o,e.fx*o)}; }).sort((p,q)=>p.ang-q.ang);
  const pts=[]; for(const a of arms){ const Rx=-a.uz, Rz=a.ux, r=Math.min(n.r,a.e.len*.5), px=n.x+a.ux*r, pz=n.z+a.uz*r; pts.push([px-Rx*a.e.hw,pz-Rz*a.e.hw],[px+Rx*a.e.hw,pz+Rz*a.e.hw]); }
  const wide=n.ed.reduce((a,e)=>e.w>a.w?e:a,n.ed[0]), acc=wide.cond==='dirt'||n.ed.filter(e=>e.cond==='dirt').length*2>n.ed.length?A.dirt:A.asph, y=RY+.004;
  for(let i=0;i<pts.length;i++){ const p=pts[i], q=pts[(i+1)%pts.length]; acc.tri([n.x,y,n.z],[q[0],y,q[1]],[p[0],y,p[1]],[0,1,0],[[n.x/8,-n.z/8],[q[0]/8,-q[1]/8],[p[0]/8,-p[1]/8]],WHITE); } }
// potholes and puddles on broken streets (fewer on the big roads)
const POTHOLES=[], PH_HASH=new Map(), PHC=8, phk=(i,j)=>i*4096+j;
for(const e of ROADS){ if(e.cond==='good'||e.c===8) continue; const A0=nodes[e.a], B0=nodes[e.b], sa=A0.r, sb=B0.r, n=Math.floor((e.len-sa-sb)/(e.cond==='dirt'?7:10)), rx=-e.fz, rz=e.fx;
  for(let k=0;k<n;k++){ const t=rr(sa+2,e.len-sb-2), lat=rr(-e.hw+.8,e.hw-.8), x=A0.x+e.fx*t+rx*lat, z=A0.z+e.fz*t+rz*lat, big=e.cond==='dirt';
    const p={x,z,r:big?rr(.6,1.6):rr(.35,1),water:R()<(big?.55:.3),depth:big?rr(.5,1):rr(.4,.9),ry:rr(0,6.28)}; POTHOLES.push(p);
    const ci=Math.floor(x/PHC), cj=Math.floor(z/PHC); for(let i=ci-1;i<=ci+1;i++) for(let j=cj-1;j<=cj+1;j++){ const kk=phk(i,j); if(!PH_HASH.has(kk)) PH_HASH.set(kk,[]); PH_HASH.get(kk).push(p); } } }
function potholeAt(x,z){ const a=PH_HASH.get(phk(Math.floor(x/PHC),Math.floor(z/PHC))); if(!a) return null; for(const p of a){ const dx=x-p.x, dz=z-p.z; if(dx*dx+dz*dz<p.r*p.r*.8) return p; } return null; }
const PH_SETS=[];   // pothole decals; made into near-only draw sets once CullSet exists
const PH_MAT={dry:new THREE.MeshStandardMaterial({map:texPothole(false),transparent:true,depthWrite:false,roughness:.95,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6}),
  wet:new THREE.MeshStandardMaterial({map:texPothole(true),transparent:true,depthWrite:false,roughness:.06,metalness:.25,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6})};
{ const pg=new THREE.PlaneGeometry(2,2); pg.rotateX(-Math.PI/2);
  for(const wtr of [false,true]){ const list=POTHOLES.filter(p=>p.water===wtr).map(p=>({x:p.x,y:.05,z:p.z,ry:p.ry,sx:p.r*1.15,sz:p.r})); if(list.length) PH_SETS.push([pg,wtr?PH_MAT.wet:PH_MAT.dry,list]); } }


// railway: the Lagos–Ibadan line runs through Mushin (ballast, sleepers and two rails per track)
const RAILS=WD.rail.map(r=>{ const o=[]; for(let i=0;i<r.p.length;i+=2) o.push([r.p[i],r.p[i+1]]); return o; });
{ const bal=new Acc(), steel=new Acc(), BC=new THREE.Color('#8f8a82'), SC=new THREE.Color('#7d7f82');
  const T_SL=(()=>{ const [c,g]=cv(256,256); g.fillStyle='#77726b'; g.fillRect(0,0,256,256); grain(g,256,256,40); for(let y=0;y<256;y+=32){ g.fillStyle='#4f4031'; g.fillRect(28,y+6,200,14); g.fillStyle='rgba(0,0,0,.25)'; g.fillRect(28,y+18,200,3); } return tx(c); })();
  for(const pts of RAILS) for(let i=0;i+1<pts.length;i++){ const [x0,z0]=pts[i],[x1,z1]=pts[i+1], L=Math.hypot(x1-x0,z1-z0); if(L<.1) continue; const fx=(x1-x0)/L, fz=(z1-z0)/L, rx=-fz, rz=fx, hw=1.9, y=.05;
    bal.quad([x0-rx*hw,y,z0-rz*hw],[x0+rx*hw,y,z0+rz*hw],[x1+rx*hw,y,z1+rz*hw],[x1-rx*hw,y,z1-rz*hw],[0,1,0],[[0,0],[1,0],[1,L/2.4],[0,L/2.4]],WHITE);
    for(const o of [-.72,.72]){ const a=[x0+rx*o,z0+rz*o], b=[x1+rx*o,z1+rz*o], w=.04, y1=.22;
      steel.quad([a[0]-rx*w,y1,a[1]-rz*w],[a[0]+rx*w,y1,a[1]+rz*w],[b[0]+rx*w,y1,b[1]+rz*w],[b[0]-rx*w,y1,b[1]-rz*w],[0,1,0],[[0,0],[1,0],[1,1],[0,1]],SC);
      for(const s of [-1,1]) steel.quad([a[0]+rx*w*s,.05,a[1]+rz*w*s],[b[0]+rx*w*s,.05,b[1]+rz*w*s],[b[0]+rx*w*s,y1,b[1]+rz*w*s],[a[0]+rx*w*s,y1,a[1]+rz*w*s],[rx*s,0,rz*s],[[0,0],[1,0],[1,1],[0,1]],SC); } }
  const bm=bal.mesh(new THREE.MeshStandardMaterial({map:T_SL,roughness:1,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),false,true); if(bm) scene.add(bm);
  const sm2=steel.mesh(new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,metalness:.8,roughness:.35,side:THREE.DoubleSide}),false,true); if(sm2) scene.add(sm2); }
// open drains and streams: dark water between concrete edges
{ const wa=new Acc(), ed=new Acc(), WC=new THREE.Color('#2c2a22'), EC=new THREE.Color('#9a958c');
  for(const wv of WD.water){ const p=wv.p, hw=wv.k==='stream'?2.2:1.1; for(let i=0;i+3<p.length;i+=2){ const x0=p[i],z0=p[i+1],x1=p[i+2],z1=p[i+3], L=Math.hypot(x1-x0,z1-z0); if(L<.1) continue; const fx=(x1-x0)/L, fz=(z1-z0)/L, rx=-fz, rz=fx, y=.02;
    if(roadAt((x0+x1)/2,(z0+z1)/2)) continue;
    wa.quad([x0-rx*hw,y,z0-rz*hw],[x0+rx*hw,y,z0+rz*hw],[x1+rx*hw,y,z1+rz*hw],[x1-rx*hw,y,z1-rz*hw],[0,1,0],[[0,0],[1,0],[1,L/4],[0,L/4]],WC);
    for(const [qa,qb] of [[-hw-.3,-hw],[hw,hw+.3]]) ed.quad([x0+rx*qa,.06,z0+rz*qa],[x0+rx*qb,.06,z0+rz*qb],[x1+rx*qb,.06,z1+rz*qb],[x1+rx*qa,.06,z1+rz*qa],[0,1,0],[[0,0],[1,0],[1,1],[0,1]],EC); } }
  const wm=wa.mesh(new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.15,metalness:.2,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),false,true); if(wm) scene.add(wm);
  const em=ed.mesh(new THREE.MeshStandardMaterial({map:T.conc,vertexColors:true,roughness:.9,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}),false,true); if(em) scene.add(em); }

/* ================= buildings ================= */
await step('Building face-me-I-face-you houses…', 34);
const MODELS={}; for(const r of await Promise.allSettled(modelJobs)){ if(r.status==='fulfilled'){ const [k,v]=r.value; MODELS[k]=v; } else console.warn('A 3D model could not load; using a built-in one.',r.reason); }
const HOUSES=!!(MODELS.bungalow&&MODELS.storey&&MODELS.house&&MODELS.station);
const TREES={}; for(const r of await Promise.allSettled(treeJobs)) if(r.status==='fulfilled') TREES[r.value[0]]=r.value[1];
// each tree is one picture that turns to face you and shows the side of the real tree you are looking at (one draw call per kind)
function treeMat(t,frames=8){ if(t.map){ t.map.colorSpace=THREE.SRGBColorSpace; t.map.anisotropy=Math.min(4,maxAniso); }
  const m=new THREE.MeshStandardMaterial({map:t.map,alphaTest:.5,side:THREE.DoubleSide,roughness:.95,metalness:0});   // standard, so the sky lights it like the rest of the city
  m.onBeforeCompile=sh=>{ sh.vertexShader=sh.vertexShader
    .replace('#include <uv_vertex>',`#include <uv_vertex>
      vec3 bbO=instanceMatrix[3].xyz; float bbS=length(instanceMatrix[0].xyz), bbSy=length(instanceMatrix[1].xyz), bbYaw=atan(-instanceMatrix[0].z,instanceMatrix[0].x);
      vec3 bbN=cameraPosition-bbO; bbN.y=0.; bbN=normalize(bbN+vec3(1e-4,0.,0.)); vec3 bbR=vec3(bbN.z,0.,-bbN.x);
      float bbF=mod(floor((atan(bbN.x,bbN.z)-bbYaw)/6.2831853*${frames}.+.5),${frames}.);
      vMapUv=vec2((uv.x+bbF)/${frames}.,uv.y);
      vec3 bbW=bbO+bbR*position.x*bbS+vec3(0.,position.y*bbSy,0.);`)
    .replace('#include <defaultnormal_vertex>','vec3 transformedNormal=normalize(mat3(viewMatrix)*normalize(bbN+vec3(0.,.45,0.)));')
    .replace('#include <project_vertex>','vec4 mvPosition=viewMatrix*vec4(bbW,1.); gl_Position=projectionMatrix*mvPosition;')
    .replace('#include <worldpos_vertex>','vec4 worldPosition=vec4(bbW,1.);'); };
  m.customProgramCacheKey=()=>'tree-billboard-'+frames; return m; }

const roofProps={tank:[],ac:[],avi:[],tankB:[]};
const signSpots=[]; let signIdx=0;
const KIND=WD.kinds;   // house shop block kiosk market school hospital industrial worship bank fuel
const BLD=[]; for(let i=0;i<WD.bld.length;i+=8){ const [cx,cz,w,d,ang,k,face,front]=WD.bld.slice(i,i+8); BLD.push({cx,cz,w,d,ang,c:Math.cos(ang),s:Math.sin(ang),kind:KIND[k],face,front,i:BLD.length,skip:false}); }
for(const b of BLD) b.gap=Math.max(0,b.front-(b.face%2===0?b.w:b.d)/2);   // front = centre to road edge; gap = wall to road edge
// the direction a building's front looks (toward its street), and helpers for its outline
const FACE_DIR=b=>{ const u=[b.c,b.s], v=[-b.s,b.c]; return [u,v,[-u[0],-u[1]],[-v[0],-v[1]]][b.face]; };
const WALL_OF_FACE=[1,0,3,2];
function obCorners(cx,cz,hw,hd,c,s){ const P=(u,v)=>[cx+c*u-s*v,cz+s*u+c*v]; return [P(-hw,hd),P(hw,hd),P(hw,-hd),P(-hw,-hd)]; }
function bCorners(b,ins=0){ return obCorners(b.cx,b.cz,b.w/2-ins,b.d/2-ins,b.c,b.s); }
function obWalls(acc,K,y0,y1,tw,th,u0,v0,col){ let u=u0; for(let i=0;i<4;i++){ const p0=K[i], p1=K[(i+1)%4]; wallQ(acc,p0,p1,y0,y1,tw,th,u,v0,col); u+=Math.hypot(p1[0]-p0[0],p1[1]-p0[1])/tw; } }
function obTop(acc,K,y,col,ts=8){ acc.quad([K[0][0],y,K[0][1]],[K[1][0],y,K[1][1]],[K[2][0],y,K[2][1]],[K[3][0],y,K[3][1]],[0,1,0],K.map(p=>[p[0]/ts,-p[1]/ts]),col); }
// rectangles that must stay clear (your house, the hotel, the police station, the motor park, footbridge stairs)
const KEEP=[];
function rectHit(b,r){ // two turned rectangles overlap? (separating axis test)
  const A1=bCorners(b), B1=obCorners(r.cx,r.cz,r.hw,r.hd,Math.cos(r.ang),Math.sin(r.ang));
  for(const [P,Qp] of [[A1,B1],[B1,A1]]) for(let i=0;i<4;i++){ const p0=P[i], p1=P[(i+1)%4], nx=-(p1[1]-p0[1]), nz=p1[0]-p0[0]; let a0=1e9,a1=-1e9,b0=1e9,b1=-1e9;
    for(const q of P){ const d=q[0]*nx+q[1]*nz; a0=Math.min(a0,d); a1=Math.max(a1,d); } for(const q of Qp){ const d=q[0]*nx+q[1]*nz; b0=Math.min(b0,d); b1=Math.max(b1,d); } if(a1<b0||b1<a0) return false; }
  return true; }
const BGRID=new Map(), BGC=40; for(const b of BLD){ const k=rgk(Math.floor(b.cx/BGC),Math.floor(b.cz/BGC)); let L=BGRID.get(k); if(!L) BGRID.set(k,L=[]); L.push(b); }
function bldNear(x,z,r){ const out=[]; for(let i=Math.floor((x-r)/BGC);i<=Math.floor((x+r)/BGC);i++) for(let j=Math.floor((z-r)/BGC);j<=Math.floor((z+r)/BGC);j++){ const L=BGRID.get(rgk(i,j)); if(L) out.push(...L); } return out; }
function keepOut(r){ KEEP.push(r); for(const b of bldNear(r.cx,r.cz,Math.hypot(r.hw,r.hd)+30)) if(!b.skip&&rectHit(b,r)) b.skip=true; }
const roadClassAt=b=>{ const f=FACE_DIR(b), x=b.cx+f[0]*(b.front+1), z=b.cz+f[1]*(b.front+1), [e]=nearestRoad(x,z); return e; };
const frontLen=b=>b.face%2===0?b.d:b.w, depthLen=b=>b.face%2===0?b.w:b.d;
function frontPoint(b,o=0){ const f=FACE_DIR(b), h=depthLen(b)/2+o; return {x:b.cx+f[0]*h,z:b.cz+f[1]*h,nx:f[0],nz:f[1]}; }

// ---- special places, chosen from the real map: your house, the hotel, the police station, the motor park
const SITES={};
{ // your house: a family house on a quiet street, close to a main road, near the heart of Mushin
  let best=null, bd=1e18; for(const b of BLD){ if(b.kind!=='house'||b.gap>4||b.gap<.5) continue; const ar=b.w*b.d; if(ar<110||ar>260||frontLen(b)<9) continue;
    const e=roadClassAt(b); if(!e||e.c<5||e.c>7||!e.drive) continue; const d=Math.hypot(b.cx-60,b.cz+40); if(d<bd){ bd=d; best=b; } }
  SITES.home=best; }
const HOME=SITES.home;
function siteNear(o,minD,maxD,cls,minFront,score){ let best=null, bs=1e18; for(const b of BLD){ if(b.skip||b===HOME||!(b.kind==='block'||b.kind==='shop'||b.kind==='bank')) continue; const d=Math.hypot(b.cx-o.cx,b.cz-o.cz); if(d<minD||d>maxD) continue;
    if(frontLen(b)<minFront||b.gap>5) continue; const e=roadClassAt(b); if(!e||e.c>cls||!e.drive) continue; const s=score(b,d); if(s<bs){ bs=s; best=b; } } return best; }
SITES.hotel=siteNear(HOME,140,700,4,15,(b,d)=>d*.6-b.w*b.d*.15);
SITES.station=siteNear(HOME,250,900,3,18,(b,d)=>Math.abs(d-450)-b.w*b.d*.05);
for(const k of ['hotel','station']) if(SITES[k]){ const b=SITES[k]; b.skip=true; b.special=k; }
if(HOME) HOME.special='home';

// ---- footbridges over the big roads: the real ones from the map, plus a few where crowds cross (market, bus stops)
const FOOTB=[];
function addFootbridge(e,t){ const A0=nodes[e.a], cx=A0.x+e.fx*t, cz=A0.z+e.fz*t, rx=-e.fz, rz=e.fx;
  // span every lane (dual carriageways are two roads side by side)
  let l0=-e.hw, l1=e.hw; for(let s=e.hw;s<40;s+=.5){ if(roadAt(cx+rx*s,cz+rz*s,.2)) l1=s; else if(s>l1+3) break; } for(let s=e.hw;s<40;s+=.5){ if(roadAt(cx-rx*s,cz-rz*s,.2)) l0=-s; else if(s>-l0+3) break; }
  l0-=1.4; l1+=1.4; const H=6.4, Ls=12;
  for(const o of FOOTB) if(Math.hypot(o.cx-cx,o.cz-cz)<150) return null;
  const fb={cx,cz,dx:e.fx,dz:e.fz,rx,rz,l0,l1,H,Ls,ang:Math.atan2(rz,rx),e};
  FOOTB.push(fb);
  // stairs run along the road on both sides, away from the deck; keep that ground clear
  for(const [l,sg] of [[l0-1.25,1],[l1+1.25,-1]]){ const mx=cx+rx*l+e.fx*sg*(1.2+Ls/2), mz=cz+rz*l+e.fz*sg*(1.2+Ls/2); keepOut({cx:mx,cz:mz,hw:Ls/2+1.6,hd:1.6,ang:Math.atan2(e.fz,e.fx)}); }
  const mid=(l0+l1)/2; keepOut({cx:cx+rx*mid,cz:cz+rz*mid,hw:(l1-l0)/2+1,hd:1.6,ang:Math.atan2(rz,rx)});
  return fb; }
{ const mainNear=(x,z,R2)=>{ let best=null,bd=1e9; for(const e of ROADS){ if(e.c>2||e.len<26) continue; const A0=nodes[e.a], t=clamp((x-A0.x)*e.fx+(z-A0.z)*e.fz,10,e.len-10), px=A0.x+e.fx*t, pz=A0.z+e.fz*t, d=Math.hypot(px-x,pz-z); if(d<bd&&d<R2){ bd=d; best=[e,t]; } } return best; };
  for(const f of WD.foot){ if(!f.br) continue; const p=f.p, x=(p[0]+p[p.length-2])/2, z=(p[1]+p[p.length-1])/2, [e,d]=nearestRoad(x,z,q=>q.c<=4); if(e&&d<4){ const A0=nodes[e.a]; addFootbridge(e,clamp((x-A0.x)*e.fx+(z-A0.z)*e.fz,8,e.len-8)); } }
  for(const [x,z] of [[828,16],[1150,512],[HOME?HOME.cx:0,HOME?HOME.cz:0],[343,-170],[-300,-650],[600,-1250],[494,1000]]){ const r=mainNear(x,z,450); if(r) addFootbridge(r[0],r[1]); } }

// ---- motor park by Mushin station: danfos load here for Oshodi, Yaba, Ojota and Ikeja
{ const st=WD.pois.station[0]||[1167,-541]; let best=null, bs=1e18;
  for(const e of ROADS){ if(e.c>4||!e.drive||e.len<40) continue; const A0=nodes[e.a], t=clamp((st[0]-A0.x)*e.fx+(st[1]-A0.z)*e.fz,20,e.len-20), px=A0.x+e.fx*t, pz=A0.z+e.fz*t;
    for(const sd of [-1,1]){ const D=34, L=58, o=e.hw+1.5+D/2, cx=px-e.fz*o*sd, cz=pz+e.fx*o*sd; let bad=0;
      for(const r of RAILS) for(const [x,z] of r) if(Math.hypot(x-cx,z-cz)<D) bad+=1e6;
      for(let k=-2;k<=2;k++) for(let j=-1;j<=1;j++){ const x=cx+e.fx*k*L/5-e.fz*sd*j*D/3, z=cz+e.fz*k*L/5+e.fx*sd*j*D/3, q=roadAt(x,z); if(q&&q!==e) bad+=500; }
      const s=Math.hypot(cx-st[0],cz-st[1])+bad; if(s<bs){ bs=s; best={cx,cz,hw:L/2,hd:D/2,ang:Math.atan2(e.fz,e.fx),e,t,sd,gate:{x:px-e.fz*(e.hw+.5)*sd,z:pz+e.fx*(e.hw+.5)*sd}}; } } }
  if(best){ keepOut(best); SITES.park=best; } }

// ---- markets: stalls fill the open ground of the real market areas
const MARKETS=AREAS.filter(a=>a.k==='marketplace'||a.k==='retail').map(a=>({a,name:a.n&&a.n!=='Market'?a.n:'',stalls:[]}));
{ let k=0; for(const m of MARKETS) if(!m.name) m.name=['Mushin Market','Idi-Oro Market','Olateju Market'][k++]||'Market'; }

// ---- what each building looks like
const houseInst={};
function addHouse(key,x,z,ry,sx,sy,sz,col){ (houseInst[key]||(houseInst[key]=[])).push({x,z,ry,sx,sy,sz,col}); }
const WALLC=['#e9dcc5','#d9cdb8','#efe6d6','#cfc3ae','#e3d2b6','#bfb3a0'];
const HOUSE_TINT=['#f4ecdc','#efdcc0','#ead6c4','#e2e6d2','#dfe2e2','#f0deb4','#e8e0d4','#f2d9c8'];   // Lagos house paints: cream, sand, peach, pale green, grey, ochre
const norm3=(x,y,z)=>{ const l=Math.hypot(x,y,z); return [x/l,y/l,z/l]; };
// a gable zinc roof over a turned box (ridge along the long side)
function obZinc(b,K,top,col,hw,hd){ const oh=.4, rise=Math.min(hw,hd)*2*rr(.16,.26), zc=new THREE.Color(pick(['#ffffff','#ead8c6','#d2c9bf','#f2e4d0','#c9b8a6'])), c=b.c, s=b.s;
  const W3=(u,y,v)=>[b.cx+c*u-s*v,y,b.cz+s*u+c*v], N3=(nu,ny,nv)=>{ const n=norm3(nu,ny,nv); return [c*n[0]-s*n[2],n[1],s*n[0]+c*n[2]]; }, T=top, Y=top+rise;
  if(hw>=hd){ const L=2*hw+2*oh, sl=Math.hypot(hd+oh,rise);
    A.zinc.quad(W3(hw+oh,T,-hd-oh),W3(-hw-oh,T,-hd-oh),W3(-hw-oh,Y,0),W3(hw+oh,Y,0),N3(0,hd+oh,-rise),[[0,0],[L/2,0],[L/2,sl/2],[0,sl/2]],zc);
    A.zinc.quad(W3(-hw-oh,T,hd+oh),W3(hw+oh,T,hd+oh),W3(hw+oh,Y,0),W3(-hw-oh,Y,0),N3(0,hd+oh,rise),[[0,0],[L/2,0],[L/2,sl/2],[0,sl/2]],zc);
    A.fence.tri(W3(-hw,T,-hd),W3(-hw,T,hd),W3(-hw,Y,0),N3(-1,0,0),[[0,0],[hd/3,0],[hd/6,rise/3]],col); A.fence.tri(W3(hw,T,hd),W3(hw,T,-hd),W3(hw,Y,0),N3(1,0,0),[[0,0],[hd/3,0],[hd/6,rise/3]],col); }
  else { const L=2*hd+2*oh, sl=Math.hypot(hw+oh,rise);
    A.zinc.quad(W3(-hw-oh,T,-hd-oh),W3(-hw-oh,T,hd+oh),W3(0,Y,hd+oh),W3(0,Y,-hd-oh),N3(-rise,hw+oh,0),[[0,0],[L/2,0],[L/2,sl/2],[0,sl/2]],zc);
    A.zinc.quad(W3(hw+oh,T,hd+oh),W3(hw+oh,T,-hd-oh),W3(0,Y,-hd-oh),W3(0,Y,hd+oh),N3(rise,hw+oh,0),[[0,0],[L/2,0],[L/2,sl/2],[0,sl/2]],zc);
    A.fence.tri(W3(-hw,T,hd),W3(hw,T,hd),W3(0,Y,hd),N3(0,0,1),[[0,0],[hw/3,0],[hw/6,rise/3]],col); A.fence.tri(W3(hw,T,-hd),W3(-hw,T,-hd),W3(0,Y,-hd),N3(0,0,-1),[[0,0],[hw/3,0],[hw/6,rise/3]],col); }
  return rise; }
// shop sign on the street wall, and a place on the map
function signOnB(b,y0=4.5){ const K=bCorners(b), wi=WALL_OF_FACE[b.face], p0=K[wi], p1=K[(wi+1)%4], dx=p1[0]-p0[0], dz=p1[1]-p0[1], L=Math.hypot(dx,dz); if(L<3) return;
  const k=signIdx++%SIGNS.length, mx=(p0[0]+p1[0])/2, mz=(p0[1]+p1[1])/2, nx=-dz/L, nz=dx/L, w=Math.min(L*.85,6.4), h=w/4, o=.12, fx=dx/L, fz=dz/L;
  const a=[mx-fx*w/2+nx*o,mz-fz*w/2+nz*o], c=[mx+fx*w/2+nx*o,mz+fz*w/2+nz*o], y1=y0+h, u0=(k%4)/4, u1=u0+.25, v1=1-Math.floor(k/4)/8, v0=v1-1/8;
  A.sign.quad([a[0],y0,a[1]],[c[0],y0,c[1]],[c[0],y1,c[1]],[a[0],y1,a[1]],[nx,0,nz],[[u0,v0],[u1,v0],[u1,v1],[u0,v1]],WHITE);
  PLACES.push({name:SIGNS[k][0],sub:SIGNS[k][1],kind:placeKind(SIGNS[k][1]),x:mx,z:mz,r:Math.max(b.w,b.d)/2,door:{x:mx,z:mz,nx,nz,m:b.front}}); }
// one plain building on a turned footprint: shop floor, upper floors, zinc or flat roof
function obBuilding(b,o={}){ const hw=b.w/2, hd=b.d/2, K=bCorners(b), type=o.type||pick(['oldmid','resi','oldmid']), col=new THREE.Color(o.col||pick(TINTS[type]||WALLC)), y0=0;
  const shop=!!o.shop, base=shop?4.4:0, top=o.h??(shop?4.4+3.4*ri(0,1):3.4*ri(1,2)+.6);
  if(shop) obWalls(A.shop,K,y0,y0+4.4,TILE.shop[0],TILE.shop[1],ri(0,3)/4,0,WHITE);
  const zinc=o.zinc??(top<12&&R()<.8);
  if(top>base+.05) obWalls(A[type],K,base,top+(zinc?0:.9),TILE[type][0],TILE[type][1],ri(0,7)/8,0,col);
  let rise=0; if(zinc) rise=obZinc(b,K,top,col,hw,hd); else { const rc=new THREE.Color().setHSL(.08,.05,rr(.55,.75)); obWalls(A.roof,bCorners(b,-.02).reverse().slice(0),top,top+.9,4,4,0,0,rc); obTop(A.roof,K,top+.02,rc,8); }
  if(!zinc&&top<14&&R()<.7){ const n=ri(1,2); for(let k=0;k<n;k++){ const u=rr(-hw+1.4,hw-1.4), v=rr(-hd+1.4,hd-1.4); (R()<.7?roofProps.tank:roofProps.tankB).push({x:b.cx+b.c*u-b.s*v,y:top,z:b.cz+b.s*u+b.c*v,sy:rr(.9,1.2)}); } }
  addOB(b.cx,b.cz,hw,hd,b.ang,top+rise+.9);
  if(shop&&o.sign!==false) signOnB(b); return top; }
// a kiosk: a painted container shop with a sloping zinc roof (POS, recharge cards, pure water)
const KIOSK_COL=['#2f7bbf','#d23c2c','#f2b705','#1f8a5c','#e8e1d4','#7a4fb0','#e46b1e'];
function obKiosk(b){ const hw=b.w/2, hd=b.d/2, K=bCorners(b), h=rr(2.4,2.9), col=new THREE.Color(pick(KIOSK_COL)); obWalls(A.fence,K,0,h,3,3,0,0,col);
  const zc=new THREE.Color('#c9b8a6'), W3=(u,y,v)=>[b.cx+b.c*u-b.s*v,y,b.cz+b.s*u+b.c*v], oh=.35;
  A.zinc.quad(W3(-hw-oh,h+.35,-hd-oh),W3(-hw-oh,h+.35,hd+oh),W3(hw+oh,h-.05,hd+oh),W3(hw+oh,h-.05,-hd-oh),[0,1,0],[[0,0],[1,0],[1,1],[0,1]],zc);
  addOB(b.cx,b.cz,hw,hd,b.ang,h+.4); }
// an open market shed: posts and a zinc roof, stalls underneath
function obShed(b){ const hw=b.w/2, hd=b.d/2, h=3.1, W3=(u,y,v)=>[b.cx+b.c*u-b.s*v,y,b.cz+b.s*u+b.c*v], zc=new THREE.Color(pick(['#c9b8a6','#b9a896','#d2c9bf']));
  A.zinc.quad(W3(-hw,h,-hd),W3(-hw,h+.5,hd),W3(hw,h+.5,hd),W3(hw,h,-hd),[0,1,0],[[0,0],[1,0],[1,1],[0,1]],zc);
  for(let u=-hw+.3;u<=hw-.2;u+=Math.max(3,(b.w-.6)/Math.max(1,Math.round((b.w-.6)/4)))) for(const v of [-hd+.3,hd-.3]){ const [x,,z]=W3(u,0,v); SHED_POSTS.push({x,y:0,z,sy:h+(v>0?.5:0)}); addCol({x0:x-.12,x1:x+.12,z0:z-.12,z1:z+.12,h:h}); }
  MARKET_SHEDS.push(b); }
const SHED_POSTS=[], MARKET_SHEDS=[];

// the three house models are fitted to each real footprint: front to the street, scaled to the plot
const MODEL_PICK=[['bungalow',.42],['storey',.33],['house',.25]];
function fitHouse(b){ if(!HOUSES) return false; const fw=frontLen(b), dd=depthLen(b), f=FACE_DIR(b), ry=Math.atan2(f[0],f[1]);
  let r=R(), key='bungalow'; for(const [k,p] of MODEL_PICK){ if(r<p){ key=k; break; } r-=p; }
  if(key==='house'&&fw<12) key='storey';
  const M=MODELS[key]; let s=Math.min(fw/M.W,dd/M.D);
  if(s<.55||s>1.5){ for(const k of ['bungalow','storey','house']){ const M2=MODELS[k], s2=Math.min(fw/M2.W,dd/M2.D); if(s2>=.55&&s2<=1.5){ key=k; s=s2; break; } } }
  const MM=MODELS[key]; if(s<.55||s>1.5) return false;
  const sx=Math.min(fw/MM.W,s*1.22), sz=Math.min(dd/MM.D,s*1.22), sy=clamp(Math.sqrt(sx*sz)*rr(.95,1.08),.6,1.45);
  const col=new THREE.Color(pick(HOUSE_TINT)); addHouse(key,b.cx,b.cz,ry,sx,sy,sz,col);
  addOB(b.cx,b.cz,MM.W*sx/2,MM.D*sz/2,-ry,MM.H*sy);
  b.model=key; b.mh=MM.H*sy; return true; }
const SCHOOL_N=['Mushin Community Primary School','Ansar-Ud-Deen Primary School','St. Agnes Primary School','Olateju Junior Grammar School','Ishaga Grammar School'];
const SCHOOLS=AREAS.filter(a=>a.k==='school'&&a.a>2000).map((a,i)=>({a,name:SCHOOL_N[i%SCHOOL_N.length],signed:false}));
let builtN=0;
for(const b of BLD){ if(b.skip||b.special) continue; const ar=b.w*b.d;
  switch(b.kind){
    case 'house': if(!fitHouse(b)) obBuilding(b,{type:pick(['oldmid','resi']),h:ar<70?3.4:3.4*ri(1,2)+.6}); if(b.gap<5&&b.gap>.6&&R()<.06){ const p=frontPoint(b,.9); GATES.push({x:p.x,z:p.z,nx:p.nx,nz:p.nz}); } break;
    case 'shop': obBuilding(b,{shop:true,type:'oldmid'}); break;
    case 'kiosk': obKiosk(b); break;
    case 'market': obShed(b); break;
    case 'school': { const sc=SCHOOLS.find(s=>inPoly(s.a.pts,b.cx,b.cz)); obBuilding(b,{type:'resi',col:pick(['#e8f0ff','#fff4d6','#e0ecff']),h:ar>250?7.4:4,zinc:true}); if(sc&&!sc.signed&&ar>150){ sc.signed=true; sc.b=b; } break; }
    case 'hospital': obBuilding(b,{type:'office',col:'#f4f8f6',h:3.4*ri(1,3)+.8,zinc:false}); break;
    case 'industrial': obBuilding(b,{type:'office',col:pick(['#d9d4cb','#c8ccd0']),h:rr(7,9.5),zinc:R()<.4}); break;
    case 'worship': obBuilding(b,{type:'resi',col:'#f6f1e6',h:7.5,zinc:false}); break;
    case 'bank': obBuilding(b,{type:'glass',h:3.4*ri(2,3)+.6,zinc:false}); break;
    case 'fuel': obBuilding(b,{type:'office',col:'#ffffff',h:3.6,zinc:false}); break;
    default: obBuilding(b,{h:ar>600?3.4*ri(2,3)+.6:undefined,zinc:ar>900?false:undefined});
  } builtN++; }
/* per-instance culling + level of detail: only instances near the camera (or inside the shadow area) are drawn */
const CULLS=[]; const _fr=new THREE.Frustum(), _pm=new THREE.Matrix4(), _sph=new THREE.Sphere();
class CullSet{ // levels: [{geo,mat,dist,shadow}] sorted by dist ; items: {x,y,z,ry,sc|sx,sy,sz,r}
  constructor(levels,items,{shadowDist=0,layer=1,name=''}={}){
    // only things near the player go into the shadow map: a shadow-casting level is split at the shadow area's edge
    const SR=Q.shR+10, exp=[]; for(const L of levels){ const prev=exp.length?exp[exp.length-1].dist:0;
      if(L.shadow&&L.dist>SR&&prev<SR){ exp.push({...L,dist:SR,shadow:true}); exp.push({...L,shadow:false}); } else if(L.shadow&&prev>=SR) exp.push({...L,shadow:false}); else exp.push(L); }
    levels=exp; this.items=items; this.levels=levels; this.shadowDist=shadowDist; this.name=name;
    for(const it of items){ _e.set(it.rx||0,it.ry||0,it.rz||0,'YXZ'); _q.setFromEuler(_e); _p.set(it.x,it.y??SLAB,it.z); if(it.sc!==undefined) _s.setScalar(it.sc); else _s.set(it.sx??1,it.sy??1,it.sz??1); _m.compose(_p,_q,_s); it.m=_m.toArray(new Float32Array(16)); it.lv=-1;
      if(!it.r){ const g=levels[0].geo; if(!g.boundingSphere) g.computeBoundingSphere(); const c=g.boundingSphere.center, ry=it.ry||0; it.r=g.boundingSphere.radius*Math.max(_s.x,_s.y,_s.z); it.cy=(it.y??SLAB)+c.y*_s.y;
        it.wx=it.x+(c.x*Math.cos(ry)+c.z*Math.sin(ry))*_s.x; it.wz=it.z+(-c.x*Math.sin(ry)+c.z*Math.cos(ry))*_s.z; } }
    this.cap=Math.min(items.length,3500); this.col=items.length&&items[0].col; this.meshes=levels.map(L=>{ const im=new THREE.InstancedMesh(L.geo,L.mat,this.cap); im.count=0; if(this.col) im.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(this.cap*3),3); im.frustumCulled=false; im.castShadow=!!L.shadow; im.receiveShadow=true; im.layers.set(layer); scene.add(im); return im; });
    this.maxD=levels[levels.length-1].dist; CULLS.push(this);
    // bucket items into 48 m cells so whole groups can be skipped at once
    for(const it of items){ if(it.wx===undefined){ it.wx=it.x; it.wz=it.z; } }
    const cells=new Map(); for(const it of items){ const k=Math.floor(it.wx/48)+','+Math.floor(it.wz/48); if(!cells.has(k)) cells.set(k,[]); cells.get(k).push(it); }
    this.cells=[...cells.values()].map(list=>{ let x=0,z=0,y=0; for(const it of list){ x+=it.wx; z+=it.wz; y+=it.cy??it.y??0; } x/=list.length; z/=list.length; y/=list.length; let r=0; for(const it of list) r=Math.max(r,Math.hypot(it.wx-x,it.wz-z)+it.r); return {x,y,z,r,list}; }); }
  update(cx,cz){ if(this.off){ for(const m of this.meshes) m.visible=false; return; } const ms=this.meshes, cnt=this._c||(this._c=ms.map(()=>0)), L=this.levels, n=L.length, sd=this.shadowDist, maxD=this.maxD; cnt.fill(0);
    for(const C of this.cells){ const cdx=C.x-cx, cdz=C.z-cz, cd=Math.sqrt(cdx*cdx+cdz*cdz); if(cd-C.r>maxD) continue;
      if(cd-C.r>sd){ _sph.center.set(C.x,C.y,C.z); _sph.radius=C.r+4; if(!_fr.intersectsSphere(_sph)) continue; }
      const inner=cd+C.r<sd;
      for(const it of C.list){ const dx=it.wx-cx, dz=it.wz-cz, d=Math.sqrt(dx*dx+dz*dz)-it.r; if(d>maxD) continue;
        if(!inner&&d>sd){ _sph.center.set(it.wx,it.cy??it.y,it.wz); _sph.radius=it.r; if(!_fr.intersectsSphere(_sph)) continue; }
        let l=0; while(l<n-1&&d>L[l].dist) l++; if(cnt[l]>=this.cap) continue;
        ms[l].instanceMatrix.array.set(it.m,cnt[l]*16); if(this.col){ const a=ms[l].instanceColor.array, j=cnt[l]*3; a[j]=it.col.r; a[j+1]=it.col.g; a[j+2]=it.col.b; } cnt[l]++; } }
    for(let l=0;l<n;l++){ const im=ms[l]; if(im.count!==cnt[l]||cnt[l]) { im.count=cnt[l]; im.instanceMatrix.clearUpdateRanges(); im.instanceMatrix.addUpdateRange(0,cnt[l]*16); im.instanceMatrix.needsUpdate=true; if(this.col) im.instanceColor.needsUpdate=true; } im.visible=cnt[l]>0; } } }
for(const [g,m,l] of PH_SETS) new CullSet([{geo:g,mat:m,dist:Math.min(140,Q.draw*.6),shadow:false}],l,{shadowDist:0,layer:0,name:'potholes'});
function updateCulls(){ camera.updateMatrixWorld(); _pm.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm); const cx=camera.position.x, cz=camera.position.z; for(const c of CULLS) c.update(cx,cz);
  if(typeof WIRES!=='undefined') for(const w of WIRES){ const sp=w.geometry.boundingSphere; w.visible=Math.hypot(sp.center.x-cx,sp.center.z-cz)-sp.radius<Math.min(170,Q.draw*.6); } }
function modelLevels(M,near,far,shadowNear=true){ return M.geo1?[{geo:M.geo,mat:M.mat,dist:near,shadow:shadowNear},{geo:M.geo1,mat:M.mat1,dist:far,shadow:false}]:[{geo:M.geo,mat:M.mat,dist:far,shadow:shadowNear}]; }

// far away, a house is just a box with a roof (same footprint, same tint): thousands of houses for very little
function farBox(M,wallHex,roofHex){ const W=M.W, D=M.D, H=M.H*.7, Y=M.H, g=new THREE.BufferGeometry(), P=[], N=[], C=[], wc=new THREE.Color(wallHex), rc=new THREE.Color(roofHex);
  const q=(a,b,c,d,n,col)=>{ for(const p of [a,b,c,a,c,d]){ P.push(...p); N.push(...n); C.push(col.r,col.g,col.b); } }, hw=W/2, hd=D/2;
  q([-hw,0,hd],[hw,0,hd],[hw,H,hd],[-hw,H,hd],[0,0,1],wc); q([hw,0,-hd],[-hw,0,-hd],[-hw,H,-hd],[hw,H,-hd],[0,0,-1],wc);
  q([hw,0,hd],[hw,0,-hd],[hw,H,-hd],[hw,H,hd],[1,0,0],wc); q([-hw,0,-hd],[-hw,0,hd],[-hw,H,hd],[-hw,H,-hd],[-1,0,0],wc);
  q([-hw-.3,H,hd+.3],[hw+.3,H,hd+.3],[hw+.3,Y,0],[-hw-.3,Y,0],norm3(0,1,1),rc); q([hw+.3,H,-hd-.3],[-hw-.3,H,-hd-.3],[-hw-.3,Y,0],[hw+.3,Y,0],norm3(0,1,-1),rc);
  for(const s of [-1,1]){ const a=[s*hw,H,s*hd], b2=[s*hw,H,-s*hd], c=[s*hw,Y,0]; for(const p of [a,b2,c]){ P.push(...p); N.push(s,0,0); C.push(wc.r,wc.g,wc.b); } }
  g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(C,3)); g.computeBoundingSphere(); return g; }
const FAR_MAT=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95});
if(HOUSES){ const farC={bungalow:['#ece6da','#8e3125'],storey:['#ece6da','#4b555c'],house:['#ece6da','#3e5f6f']};   // walls and roof of the Blender houses (tools/blender_houses.py)
  for(const key in houseInst){ const M=MODELS[key], fc=farC[key]||['#ddd','#777'], lv=[{geo:M.geo,mat:M.mat,dist:Q.lod0,shadow:true}];
    if(M.geo1) lv.push({geo:M.geo1,mat:M.mat1,dist:Math.max(Q.lod0+30,Q.draw*.55),shadow:false});
    lv.push({geo:farBox(M,fc[0],fc[1]),mat:FAR_MAT,dist:Q.draw+40,shadow:false});
    new CullSet(lv,houseInst[key].map(h=>({x:h.x,y:0,z:h.z,ry:h.ry,sx:h.sx,sy:h.sy,sz:h.sz,col:h.col})),{shadowDist:Q.shR,name:key}); } }
// your house, the hotel and the police station
const STATION={x:0,z:0,label:null,front:{x:0,z:0,ry:0}};
function placeModelOn(b,key,label,col){ const M=MODELS[key], f=FACE_DIR(b), ry=Math.atan2(f[0],f[1]), fw=frontLen(b), dd=depthLen(b), s=Math.min(fw/M.W,dd/M.D,1.15), sc=Math.max(.6,s);
  new CullSet(modelLevels(M,Q.lod0*1.6,Q.draw+60),[{x:b.cx,y:0,z:b.cz,ry,sc}],{shadowDist:Q.shR,name:key});
  addOB(b.cx,b.cz,M.W*sc/2,M.D*sc/2,-ry,M.H*sc);
  const fp=frontPoint(b,0), hd=M.D*sc/2, door={x:b.cx+f[0]*(hd+1.8),z:b.cz+f[1]*(hd+1.8),ry:Math.atan2(-f[0],-f[1])};
  if(label){ const lab=new THREE.Sprite(new THREE.SpriteMaterial({map:texLabel(label,col,'#ffffff'),fog:false})); lab.scale.set(5.5,1.05,1); lab.position.set(b.cx+f[0]*(hd+.3),M.H*sc+2.2,b.cz+f[1]*(hd+.3)); lab.layers.set(1); scene.add(lab); }
  return {x:b.cx,z:b.cz,ry,sc,M,door,face:f,hd}; }
if(HOUSES&&SITES.station){ const r=placeModelOn(SITES.station,'station','POLICE STATION','#1d3a8a'); Object.assign(STATION,{x:r.x,z:r.z,front:{x:r.door.x,z:r.door.z,ry:r.ry}}); }
let HOTEL_SITE=null; if(MODELS.office&&SITES.hotel){ const r=placeModelOn(SITES.hotel,'office',null); HOTEL_SITE={x:r.x,z:r.z,door:{x:r.door.x,z:r.door.z,ry:r.ry},hx:r.M.W*r.sc/2,hz:r.M.D*r.sc/2}; }

/* apartment entrance details: your house is a real Mushin house, with a canopy, a lit door and a ring to walk into */
const APT={door:{x:0,z:0},front:{x:0,z:0},ry:0};
{ const b=HOME; let f=[0,1];
  if(b){ f=FACE_DIR(b); const key=MODELS.storey?'storey':'bungalow';
    if(HOUSES){ const M=MODELS[key], fw=frontLen(b), dd=depthLen(b), s=clamp(Math.min(fw/M.W,dd/M.D),.7,1.2), ry=Math.atan2(f[0],f[1]);
      new CullSet(modelLevels(M,Q.lod0*1.6,Q.draw+60),[{x:b.cx,y:0,z:b.cz,ry,sc:s}],{shadowDist:Q.shR,name:'home'}); addOB(b.cx,b.cz,M.W*s/2,M.D*s/2,-ry,M.H*s);
      // the Blender storey house has its own front door, steps and balcony: the lit door sits on its real front wall
      const own=MODEL_FILES[key][0]==='ns_storey', k=own?M.sc0*s:1, hd=own?(6.75-M.cz0)*k:M.D*s/2; APT.door={x:b.cx+f[0]*hd,z:b.cz+f[1]*hd}; APT.own=own?k:0; }
    else { obBuilding(b,{type:'resi',h:6.8,zinc:true}); const hd=depthLen(b)/2; APT.door={x:b.cx+f[0]*hd,z:b.cz+f[1]*hd}; } }
  APT.front={x:APT.door.x+f[0]*2.3,z:APT.door.z+f[1]*2.3}; APT.ry=Math.atan2(f[0],f[1]); APT.nx=f[0]; APT.nz=f[1];
  const g=new THREE.Group(); g.position.set(APT.door.x,0,APT.door.z); g.rotation.y=APT.ry; scene.add(g);
  if(!APT.own){ const canopy=new THREE.Mesh(new THREE.BoxGeometry(4.2,.22,2.2),MAT.conc); canopy.position.set(0,3.25,1.05); canopy.castShadow=true; g.add(canopy);
    for(const sx of [-1.95,1.95]){ const b=new THREE.Mesh(new THREE.BoxGeometry(.14,.5,2),MAT.conc); b.position.set(sx,2.95,1); g.add(b); } }   // cantilever brackets, nothing for the camera to sit in
  const dk=APT.own||1, door=new THREE.Mesh(APT.own?new THREE.BoxGeometry(1.2*dk,2.3*dk,.06):new THREE.BoxGeometry(1.5,2.6,.12),new THREE.MeshStandardMaterial({color:0x5b3a22,roughness:.5,emissive:0xffb873,emissiveIntensity:0}));
  if(APT.own) door.position.set(0,(.5+1.15)*dk,.06*dk); else door.position.set(0,1.3,.08); g.add(door); APT.doorMesh=door;
  const ring=new THREE.Mesh(new THREE.RingGeometry(.9,1.15,48),new THREE.MeshBasicMaterial({color:0xF2B705,transparent:true,opacity:.8,depthWrite:false,fog:false})); ring.rotation.x=-Math.PI/2; ring.position.set(APT.front.x,.05,APT.front.z); ring.layers.set(1); scene.add(ring); APT.ring=ring;
  const lab=new THREE.Sprite(new THREE.SpriteMaterial({map:texLabel('YOUR HOUSE'),transparent:true,depthTest:true,fog:false})); lab.scale.set(4.2,.8,1); lab.position.set(APT.door.x+f[0]*1.6,5.2,APT.door.z+f[1]*1.6); lab.layers.set(1); scene.add(lab); APT.label=lab; }

function box(w,h,d,x,y,z,rz=0,ry=0){ const g=new THREE.BoxGeometry(w,h,d); if(rz) g.rotateZ(rz); if(ry) g.rotateY(ry); g.translate(x,y,z); return g; }
function mergeList(list){ const arr=list.map(g=>{ const n=g.index?g.toNonIndexed():g; for(const k of Object.keys(n.attributes)) if(!['position','normal','uv'].includes(k)) n.deleteAttribute(k); return n; }); return mergeGeometries(arr,false); }


/* ================= footbridges: steps up, a deck across the road, steps down ================= */
await step('Raising the footbridges…', 46);
{ const steel=new THREE.MeshStandardMaterial({color:0x2f7a4c,metalness:.5,roughness:.5}), deckM=new THREE.MeshStandardMaterial({map:T.conc,roughness:.9,color:0xc8c2b8}), parts=[], decks=[];
  const add=(g,m)=>{ const mesh=new THREE.Mesh(g,m); mesh.castShadow=true; mesh.receiveShadow=true; mesh.layers.set(1); scene.add(mesh); };
  for(const fb of FOOTB){ const {cx,cz,dx,dz,rx,rz,l0,l1,H,Ls}=fb, span=l1-l0, mid=(l0+l1)/2, dang=Math.atan2(rz,rx), rang=Math.atan2(dz,dx);
    const at=(l,t)=>[cx+rx*l+dx*t,cz+rz*l+dz*t];
    // deck and rails
    { const [x,z]=at(mid,0), g=box(span+2.4,.35,2.4,0,0,0); g.rotateY(-dang); g.translate(x,H-.17,z); decks.push(g);
      // side rails leave the stair openings free (stair A comes up on the +t side at the l0 end, stair B on the -t side at the l1 end); end rails close the landings
      const rail=(la,lb,s)=>{ const len=lb-la, g2=box(len,1.05,.06,0,0,0); g2.rotateY(-dang); const [px,pz]=at((la+lb)/2,s); g2.translate(px,H+.52,pz); parts.push(g2); addOB(px,pz,len/2,.08,dang,H+1.1,H-.4); };
      rail(l0,l1+2.5,1.15); rail(l0-2.5,l1,-1.15);
      for(const l of [l0-2.5,l1+2.5]){ const g3=box(.06,1.05,2.3,0,0,0); g3.rotateY(-dang); const [px,pz]=at(l,0); g3.translate(px,H+.52,pz); parts.push(g3); addOB(px,pz,.08,1.15,dang,H+1.1,H-.4); }
      // roof shade over the deck, like the Lagos ones
      const rf=box(span+2.4,.08,2.9,0,0,0); rf.rotateY(-dang); rf.translate(x,H+2.6,z); parts.push(rf);
      for(const l of [l0-1.2,l0+span*.33,l0+span*.66,l1+1.2]) for(const s of [-1.1,1.1]){ const [px,pz]=at(l,s), p=new THREE.CylinderGeometry(.06,.06,2.6,6); p.translate(px,H+1.3,pz); parts.push(p); } }
    // pillars at the road edges (and the middle of a dual carriageway)
    for(const l of [l0+.3,l1-.3,...(span>20?[mid]:[])]) { const [px,pz]=at(l,0); if(roadAt(px,pz,.3)) continue; const p=new THREE.CylinderGeometry(.32,.38,H,10); p.translate(px,H/2,pz); parts.push(p); addCol({x0:px-.4,x1:px+.4,z0:pz-.4,z1:pz+.4,h:H}); }
    // stairs: along the road on each side, going down away from the deck
    fb.stairs=[];
    for(const [l,sg] of [[l0-1.25,1],[l1+1.25,-1]]){ const st={l,sg,t0:1.2*sg}; fb.stairs.push(st);
      const n=24; for(let k=0;k<n;k++){ const t=1.2+Ls*(k+.5)/n, y=H*(1-(k+.5)/n), [px,pz]=at(l,t*sg), g=box(Ls/n+.02,.18,2.2,0,0,0); g.rotateY(-rang); g.translate(px,y-.09,pz); decks.push(g); }
      const landing=box(2.6,.3,2.5,0,0,0); landing.rotateY(-rang); const [lx,lz]=at(l,.3*sg); landing.translate(lx,H-.15,lz); decks.push(landing);
      // side walls of the stairs (the way up is only from the bottom end)
      for(const s of [-1.15,1.15]){ const [px,pz]=at(l+s,(1.2+Ls/2)*sg); addOB(px,pz,Ls/2,.1,rang,H+1,0); const g=new THREE.BoxGeometry(Ls,.9,.06);
        const sh=g.attributes.position; for(let i=0;i<sh.count;i++){ const x=sh.getX(i); sh.setY(i,sh.getY(i)+H*(.5-x*sg/Ls)+.45); } g.rotateY(-rang); g.translate(px,0,pz); parts.push(g); } }
    PLACES.push({name:'Footbridge',sub:'Cross the road safely',kind:'place',x:cx,z:cz,minor:true}); }
  if(decks.length) add(mergeList(decks),deckM); if(parts.length) add(mergeList(parts),steel); }
// height of the walking surface for someone at (x,z) who is now at height y (footbridge steps and decks)
function walkY(x,z,y=0){ for(const fb of FOOTB){ const ox=x-fb.cx, oz=z-fb.cz; if(Math.abs(ox)>60||Math.abs(oz)>60) continue; const l=ox*fb.rx+oz*fb.rz, t=ox*fb.dx+oz*fb.dz;
    if(Math.abs(t)<1.25&&l>fb.l0-2.5&&l<fb.l1+2.5&&y>fb.H-2.2) return fb.H;
    for(const st of fb.stairs){ if(Math.abs(l-st.l)>1.1) continue; const tt=t*st.sg; if(tt>-.2&&tt<1.2+fb.Ls+.3){ const k=clamp((tt-1.2)/fb.Ls,0,1); const h=fb.H*(1-k); if(h<y+1.4||k>=1) return Math.max(0,h); } } }
  return 0; }

/* ================= billboards =================
   Big roadside billboards (assets/models/billboard.glb) along the main roads, angled to the traffic, each with an ad of
   the city; they light up at night. One drawing for all the frames and one per ad. (If the model can't load, simple boards.) */
const billboardMats=[];
{ const ADS=[texBillboard('LAGOS NO DEY CARRY LAST','Eko o ni baje · Since forever','#0f6e78','#16a06b','#ffffff'),texBillboard('NAIJA STREETS','The city is yours · Coming soon','#111111','#3a2412','#F2B705'),
    texBillboard('JOLLOF FRIDAY','Mama Put · Agege Motor Road · Open till late','#c0392b','#e8590c','#fff3bf'),texBillboard('MUSHIN NO DEY SLEEP','Ojuwoye market · Open every day','#5f3dc4','#e64980','#fff3bf'),
    texBillboard('OYA RIDE','Book am for your phone · Lagos rides, sharp sharp','#F2B705','#e8590c','#0E1014'),texBillboard('SHARP SHARP BANK','Send money, no wahala · Open your account today','#1c3d8f','#0b7285','#ffffff')];
  const sites=[], main=ROADS.filter(e=>e.c<=3&&e.len>60), _yA=new THREE.Vector3(0,1,0);
  for(let tries=0;tries<500&&sites.length<18;tries++){ const e=pick(main), A0=nodes[e.a], t=rr(20,e.len-20), sd=R()<.5?-1:1, o=e.hw+3.2, x=A0.x+e.fx*t-e.fz*o*sd, z=A0.z+e.fz*t+e.fx*o*sd;
    if(resolveCircle({x,z},1.4)||roadAt(x,z,1.2)||sites.some(q=>Math.hypot(q.x-x,q.z-z)<130)) continue;
    const nx=e.fz*sd, nz=-e.fx*sd, tw=(R()<.5?-1:1)*.5, cx=nx*Math.cos(tw)-nz*Math.sin(tw), cz=nx*Math.sin(tw)+nz*Math.cos(tw);   // facing the road, turned toward one way of the traffic
    sites.push({x,z,cx,cz,ad:sites.length%ADS.length}); }
  let done=false;
  try{ const g=await GLL.parseAsync(await fetchBuf(murl('billboard')),''); g.scene.updateMatrixWorld(true);
    const tris=[]; let map=null; const a=new THREE.Vector3(), b=new THREE.Vector3(), c=new THREE.Vector3();
    g.scene.traverse(m=>{ if(!m.isMesh) return; map=map||m.material.map; const G=m.geometry.index?m.geometry.toNonIndexed():m.geometry, P=G.attributes.position, U=G.attributes.uv;
      for(let i=0;i<P.count;i+=3){ a.fromBufferAttribute(P,i).applyMatrix4(m.matrixWorld); b.fromBufferAttribute(P,i+1).applyMatrix4(m.matrixWorld); c.fromBufferAttribute(P,i+2).applyMatrix4(m.matrixWorld);
        const n=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)); tris.push({p:[a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z],uv:[0,1,2].map(k=>[U.getX(i+k),U.getY(i+k)]).flat(),ar:n.length()/2,nx:n.normalize().x}); } });
    let y0=1e9,y1=-1e9; for(const t of tris) for(let k=1;k<9;k+=3){ y0=Math.min(y0,t.p[k]); y1=Math.max(y1,t.p[k]); }
    const face=tris.filter(t=>t.nx<-.9).sort((p,q)=>q.ar-p.ar).slice(0,2);
    const fx0=face[0].p[0], low=tris.filter(t=>(t.p[1]+t.p[4]+t.p[7])/3<y0+(y1-y0)*.35); let px=0,pz=0; for(const t of low){ px+=(t.p[0]+t.p[3]+t.p[6])/3; pz+=(t.p[2]+t.p[5]+t.p[8])/3; } px/=low.length||1; pz/=low.length||1;
    let fz0=1e9,fz1=-1e9,uu0=1e9,uu1=-1e9,vv0=1e9,vv1=-1e9; for(const t of face){ for(let k=2;k<9;k+=3){ fz0=Math.min(fz0,t.p[k]); fz1=Math.max(fz1,t.p[k]); } for(let k=0;k<6;k+=2){ uu0=Math.min(uu0,t.uv[k]); uu1=Math.max(uu1,t.uv[k]); vv0=Math.min(vv0,t.uv[k+1]); vv1=Math.max(vv1,t.uv[k+1]); } }
    const K=11.5/(y1-y0), cz=(fz0+fz1)/2;   // 11.5 m tall; the board's face on the local x=0 plane, centred; base on the ground
    const geo=list=>{ const pos=[], uv=[]; for(const t of list){ for(let k=0;k<9;k+=3) pos.push((t.p[k]-fx0)*K,(t.p[k+1]-y0)*K,(t.p[k+2]-cz)*K); uv.push(...t.uv); }
      const G=new THREE.BufferGeometry(); G.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); G.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); G.computeVertexNormals(); return G; };
    const frameG=geo(tris.filter(t=>!face.includes(t))), faceG=geo(face);
    if(map) map.colorSpace=THREE.SRGBColorSpace;
    const frameM=new THREE.MeshStandardMaterial({map,roughness:.6,metalness:.35}), place=(it,M)=>{ const th=Math.atan2(it.cz,-it.cx); _q.setFromAxisAngle(_yA,th); _p.set(it.x,0,it.z); _s.set(1,1,1); M.compose(_p,_q,_s); };
    const fr=new THREE.InstancedMesh(frameG,frameM,sites.length); fr.castShadow=true; fr.receiveShadow=true; sites.forEach((it,i)=>{ place(it,_m); fr.setMatrixAt(i,_m); }); fr.computeBoundingSphere(); scene.add(fr);
    ADS.forEach((t,k)=>{ const its=sites.filter(it=>it.ad===k); if(!its.length) return; t.repeat.set(1/(uu1-uu0),1/(vv1-vv0)); t.offset.set(-uu0/(uu1-uu0),-vv0/(vv1-vv0));
      const m=new THREE.MeshStandardMaterial({map:t,emissiveMap:t,emissive:0xffffff,emissiveIntensity:0,roughness:.5}); billboardMats.push(m);
      const im=new THREE.InstancedMesh(faceG,m,its.length); im.castShadow=true; its.forEach((it,i)=>{ place(it,_m); im.setMatrixAt(i,_m); }); im.computeBoundingSphere(); scene.add(im); });
    for(const it of sites){ const th=Math.atan2(it.cz,-it.cx), lx=(px-fx0)*K, lz=(pz-cz)*K, wx=it.x+lx*Math.cos(th)+lz*Math.sin(th), wz=it.z-lx*Math.sin(th)+lz*Math.cos(th); addCol({x0:wx-.6,x1:wx+.6,z0:wz-.6,z1:wz+.6,h:12}); }
    done=true; }catch(e){ console.warn('billboard model could not load, using simple boards',e); }
  if(!done){ const legM=new THREE.MeshStandardMaterial({color:0x40444a,metalness:.7,roughness:.4});
    for(const it of sites){ const y=9, t=ADS[it.ad], m=new THREE.MeshStandardMaterial({map:t,emissiveMap:t,emissive:0xffffff,emissiveIntensity:0,roughness:.55}); const g=new THREE.Group();
      const face=new THREE.Mesh(new THREE.PlaneGeometry(14,5.25),m); face.position.y=y; const back=new THREE.Mesh(new THREE.BoxGeometry(14.3,5.5,.3),legM); back.position.set(0,y,-.18);
      const leg=new THREE.Mesh(new THREE.CylinderGeometry(.35,.45,y-2.6,10),legM); leg.position.y=(y-2.6)/2; g.add(face,back,leg); g.traverse(o2=>{if(o2.isMesh){o2.castShadow=true;}});
      g.position.set(it.x,0,it.z); g.lookAt(it.x+it.cx,0,it.z+it.cz); scene.add(g); billboardMats.push(m); addCol({x0:it.x-.5,x1:it.x+.5,z0:it.z-.5,z1:it.z+.5,h:y+3}); } } }

/* ================= props ================= */
await step('Planting trees and stringing wires…', 64);
{ const tankG=new THREE.CylinderGeometry(.7,.7,1.6,14); tankG.translate(0,.8,0);
  inst(tankG,new THREE.MeshStandardMaterial({color:0x161616,roughness:.45}),roofProps.tank);
  inst(tankG,new THREE.MeshStandardMaterial({color:0x1d4f9c,roughness:.45}),roofProps.tankB);
  inst(box(1,.7,.7,0,0,0),new THREE.MeshStandardMaterial({color:0xefefec,roughness:.6}),roofProps.ac); }
const aviMat=new THREE.MeshStandardMaterial({color:0x330000,emissive:0xff1a1a,emissiveIntensity:0});
inst(new THREE.SphereGeometry(.35,8,6),aviMat,roofProps.avi,{shadow:false});


function frondGeo(){ const P=[]; const tri=(a,b,c)=>P.push(...a,...b,...c); const n=12;
  for(let k=0;k<n;k++){ const a=k/n*Math.PI*2+(k%2)*.18, ca=Math.cos(a), sa=Math.sin(a), px=-sa, pz=ca, lift=.45+R()*.45, len=3.3+R()*.9; let prev=null;
    for(let s=0;s<=9;s++){ const t=s/9, r=t*len, y=lift*t*2.1-2.5*t*t, w=.55*Math.sin(Math.PI*Math.min(1,t*1.12))+.02, cx=ca*r, cz=sa*r;
      const L=[cx+px*w,y-.06*w,cz+pz*w], Rt=[cx-px*w,y-.06*w,cz-pz*w], C=[cx,y+.07,cz];
      if(prev){ tri(prev.L,C,L); tri(prev.L,prev.C,C); tri(prev.C,Rt,C); tri(prev.C,prev.R,Rt); } prev={L,R:Rt,C}; } }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.computeVertexNormals(); return g; }
const trunkM=new THREE.MeshStandardMaterial({color:0x7a6450,roughness:.95});
const TREE_SHADE=(()=>{ const [c,g]=cv(64,64); const gr=g.createRadialGradient(32,32,2,32,32,31); gr.addColorStop(0,'rgba(0,0,0,.42)'); gr.addColorStop(.7,'rgba(0,0,0,.2)'); gr.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle=gr; g.fillRect(0,0,64,64);
  const geo=new THREE.PlaneGeometry(1,1); geo.rotateX(-Math.PI/2); return {geo,mat:new THREE.MeshBasicMaterial({map:tx(c,true,false),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3})}; })();
function plantTrees(kind,items,dist){ const t=TREES[kind]; new CullSet([{geo:t.geo,mat:treeMat(t),dist,shadow:false}],items,{shadowDist:0,name:kind});
  new CullSet([{geo:TREE_SHADE.geo,mat:TREE_SHADE.mat,dist:Math.min(dist,Q.draw*.45),shadow:false}],items.map(it=>({x:it.x,y:(it.y??SLAB)+.03,z:it.z,sx:t.W*.62*it.sx,sy:1,sz:t.W*.62*it.sx})),{shadowDist:0,name:kind+'-shade'}); }

// trees: along the streets wherever a house leaves room, more in schools, the hospital grounds and the parks
{ const trees=[], palms=[]; const free=(x,z,r)=>onLand(x,z,2)&&!roadAt(x,z,.4)&&!resolveCircle({x,z},r);
  for(const e of ROADS){ if(e.c>6||e.c===0) continue; const A0=nodes[e.a], step0=e.c<=3?16:30;
    for(let t=A0.r+6;t<e.len-6;t+=rr(step0,step0*1.6)) for(const sd of [-1,1]){ if(R()<.45) continue; const o=e.hw+rr(1.3,2.4), x=A0.x+e.fx*t-e.fz*o*sd, z=A0.z+e.fz*t+e.fx*o*sd;
      if(Math.hypot(x-APT.front.x,z-APT.front.z)<6||!free(x,z,1.1)) continue; (e.c<=3&&R()<.5?palms:trees).push({x,y:0,z,ry:R()*6,sx:rr(.75,1.1),sy:rr(.8,1.15),sz:rr(.75,1.1)}); } }
  for(const a of AREAS){ if(!['school','hospital','pitch','grassland','scrub','park','farmland'].includes(a.k)) continue; let n=Math.min(60,Math.floor(a.a/900));
    let xs=a.pts.map(p=>p[0]), zs=a.pts.map(p=>p[1]); const x0=Math.min(...xs), x1=Math.max(...xs), z0=Math.min(...zs), z1=Math.max(...zs);
    for(let k=0;k<n*6&&n>0;k++){ const x=rr(x0,x1), z=rr(z0,z1); if(!inPoly(a.pts,x,z)||!free(x,z,1.4)) continue; if(a.k==='pitch'&&R()<.8) continue; (R()<.35?palms:trees).push({x,y:0,z,ry:R()*6,sx:rr(.8,1.15),sy:rr(.85,1.2),sz:rr(.8,1.15)}); n--; } }
  if(TREES.tree_oak&&TREES.tree_oak_big){ const pk=t=>(Math.floor(t.x*7.3+t.z*13.1)&1)===0, mk=t=>{ const k=(t.sx+t.sz)/2*.95; return {x:t.x,y:t.y,z:t.z,ry:t.ry,sx:k,sy:t.sy*.95,sz:k}; };
    plantTrees('tree_oak',trees.filter(pk).map(mk),Q.draw*.8); plantTrees('tree_oak_big',trees.filter(t=>!pk(t)).map(mk),Q.draw*.8); }
  if(TREES.tree_palm&&palms.length) plantTrees('tree_palm',palms.map(p=>{ const k=rr(.8,1.25); return {x:p.x,y:0,z:p.z,ry:p.ry,sx:k,sy:k,sz:k}; }),Q.draw*.85);
  for(const t of [...trees,...palms]) addCol({x0:t.x-.3,x1:t.x+.3,z0:t.z-.3,z1:t.z+.3,h:4}); }
// ---- market stalls: tables of tomatoes, pepper, onions, yams and cloth under umbrellas and sheds
const STALLS=[];
{ const free=(x,z)=>onLand(x,z,2)&&!roadAt(x,z,1.2)&&!resolveCircle({x,z},1.5);
  for(const m of MARKETS){ const pts=m.a.pts, xs=pts.map(p=>p[0]), zs=pts.map(p=>p[1]), x0=Math.min(...xs), x1=Math.max(...xs), z0=Math.min(...zs), z1=Math.max(...zs);
    const [e]=nearestRoad((x0+x1)/2,(z0+z1)/2), ax=e?e.fx:1, az=e?e.fz:0, bx=-az, bz=ax, lim=m.a.a>60000?260:150, cx0=(x0+x1)/2, cz0=(z0+z1)/2, ext=Math.hypot(x1-x0,z1-z0)/2;
    for(let i=-ext;i<ext&&m.stalls.length<lim;i+=3.3) for(let j=-ext;j<ext&&m.stalls.length<lim;j+=4.8){ const x=cx0+ax*i+bx*j, z=cz0+az*i+bz*j;
      if(!inPoly(pts,x,z)||!free(x,z)) continue; 
      const st={x,z,ang:Math.atan2(az,ax),side:(Math.round(j/4.8)&1)?1:-1,goods:ri(0,5),m}; m.stalls.push(st); STALLS.push(st); }
    for(const b of MARKET_SHEDS) if(inPoly(pts,b.cx,b.cz)){ const n=Math.max(1,Math.floor(Math.max(b.w,b.d)/3.4)), long=b.w>=b.d, L=Math.max(b.w,b.d);
      for(let k=0;k<n;k++){ const t=-L/2+L*(k+.5)/n, x=b.cx+(long?b.c*t:-b.s*t), z=b.cz+(long?b.s*t:b.c*t); const st={x,z,ang:long?b.ang:b.ang+Math.PI/2,side:1,goods:ri(0,5),m,shed:true}; m.stalls.push(st); STALLS.push(st); } } }
  if(STALLS.length){ const tables=[], umb=[], goods=[[],[],[],[],[],[]];
    const GC=['#c8261e','#e85d14','#a8743d','#e9d9b0','#5b8f2e','#3d64b8'];
    for(const st of STALLS){ tables.push({x:st.x,y:0,z:st.z,ry:-st.ang}); if(!st.shed) umb.push({x:st.x+Math.sin(st.ang)*.4,y:0,z:st.z-Math.cos(st.ang)*.4,ry:R()*6,col:new THREE.Color(pick(['#d23c2c','#2f7bbf','#f2b705','#1f8a5c','#e46b1e','#ffffff']))});
      for(let k=-1;k<=1;k++) goods[st.goods].push({x:st.x+Math.cos(st.ang)*k*.55,y:.82,z:st.z+Math.sin(st.ang)*k*.55,ry:R()*6,sx:rr(.8,1.1),sy:rr(.7,1.1),sz:rr(.8,1.1)});
      addOB(st.x,st.z,.95,.5,st.ang,.9); }
    const tg=mergeList([box(1.9,.06,.95,0,.8,0),box(.06,.8,.06,-.88,.4,-.42),box(.06,.8,.06,.88,.4,-.42),box(.06,.8,.06,-.88,.4,.42),box(.06,.8,.06,.88,.4,.42)]);
    const D=Q.draw*.5; new CullSet([{geo:tg,mat:new THREE.MeshStandardMaterial({color:0x7a5a3c,roughness:.85}),dist:D,shadow:true}],tables,{shadowDist:30,name:'stalls'});
    const ug=(()=>{ const c=new THREE.ConeGeometry(1.5,.55,10,1,true); c.translate(0,2.45,0); const p=new THREE.CylinderGeometry(.03,.03,2.4,5); p.translate(0,1.2,0); return mergeList([c,p]); })();
    new CullSet([{geo:ug,mat:new THREE.MeshStandardMaterial({color:0xffffff,roughness:.8,side:THREE.DoubleSide}),dist:D,shadow:true}],umb,{shadowDist:30,name:'umbrellas'});
    const mound=new THREE.SphereGeometry(.24,8,6,0,Math.PI*2,0,Math.PI/2); goods.forEach((list,i)=>{ if(list.length) new CullSet([{geo:i===4?new THREE.BoxGeometry(.5,.32,.4):mound,mat:new THREE.MeshStandardMaterial({color:GC[i],roughness:.7}),dist:D*.8,shadow:false}],list,{shadowDist:0,name:'goods'}); }); }
  for(const m of MARKETS){ if(!m.stalls.length) continue; let x=0,z=0; for(const st of m.stalls){ x+=st.x; z+=st.z; } x/=m.stalls.length; z/=m.stalls.length; m.x=x; m.z=z; PLACES.push({name:m.name,sub:'Market',kind:'shop',x,z}); } }
// ---- the motor park: a concrete yard, sheds with benches, a big sign and loading bays
{ const pk=SITES.park; if(pk){ const c=Math.cos(pk.ang), s=Math.sin(pk.ang), K=obCorners(pk.cx,pk.cz,pk.hw,pk.hd,c,s);
    obTop(A.lot,K,.02,WHITE,6);
    const W3=(u,y,v)=>[pk.cx+c*u-s*v,y,pk.cz+s*u+c*v], fs=pk.sd;   // fs: the far side from the road, in local v
    // shelter along the back
    const shed={cx:W3(0,0,fs*(pk.hd-3.5))[0],cz:W3(0,0,fs*(pk.hd-3.5))[2],w:pk.hw*1.6,d:4,ang:pk.ang,c,s}; const zc=new THREE.Color('#bfb3a3');
    { const hw=shed.w/2, hd=shed.d/2, W4=(u,y,v)=>[shed.cx+c*u-s*v,y,shed.cz+s*u+c*v]; A.zinc.quad(W4(-hw,3.4,-hd),W4(-hw,3.9,hd),W4(hw,3.9,hd),W4(hw,3.4,-hd),[0,1,0],[[0,0],[1,0],[1,1],[0,1]],zc);
      for(let u=-hw;u<=hw+.1;u+=hw/3) for(const v of [-hd,hd]){ const [x,,z]=W4(u,0,v); SHED_POSTS.push({x,y:0,z,sy:3.6}); addCol({x0:x-.1,x1:x+.1,z0:z-.1,z1:z+.1,h:3.6}); }
      const bench=[]; for(let u=-hw+1.5;u<hw-1;u+=3){ const [x,,z]=W4(u,0,fs>0?hd*.4:-hd*.4); bench.push({x,y:0,z,ry:-pk.ang}); }
      inst(mergeList([box(2.2,.08,.45,0,.46,0),box(.08,.46,.4,-1,.23,0),box(.08,.46,.4,1,.23,0)]),new THREE.MeshStandardMaterial({color:0x5c4632,roughness:.8}),bench); }
    // the sign by the gate
    { const g=pk.gate, lab=new THREE.Sprite(new THREE.SpriteMaterial({map:texLabel('MUSHIN MOTOR PARK','#F2B705','#0E1014'),fog:false})); lab.scale.set(7,1.3,1); const [x,,z]=W3(-pk.hw+4,0,-fs*(pk.hd-1)); lab.position.set(x,4.6,z); lab.layers.set(1); scene.add(lab);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,4,8),new THREE.MeshStandardMaterial({color:0x444444})); pole.position.set(x,2,z); scene.add(pole); }
    // bays: where danfos park nose-in, side by side
    // danfos park side by side in front of the shelter, nose to the road so they can drive straight out
    const fwx=s*fs, fwz=-c*fs; pk.bays=[]; for(let k=0;k<7;k++){ const u=-pk.hw+6+k*((pk.hw*2-12)/6); const [x,,z]=W3(u,0,fs*(pk.hd-10)); pk.bays.push({x,z,h:Math.atan2(-fwz,fwx),u,fwx,fwz}); }
    pk.queue=W3(0,0,fs*(pk.hd-5.6)); pk.fs=fs;
    PLACES.push({name:'Mushin Motor Park',sub:'Danfos to Oshodi, Yaba, Ojota, Ikeja',kind:'place',x:pk.cx,z:pk.cz}); } }
// ---- schools: a wall round the compound, a sign at the gate, and a sandy field
for(const sc of SCHOOLS){ const pts=sc.a.pts; let gate=null, gd=1e9; const segsW=[];
  for(let i=0;i<pts.length;i++){ const p=pts[i], q=pts[(i+1)%pts.length], L=Math.hypot(q[0]-p[0],q[1]-p[1]); if(L<1) continue; const mx=(p[0]+q[0])/2, mz=(p[1]+q[1])/2, [e,d]=nearestRoad(mx,mz); if(e&&d<gd&&L>8){ gd=d; gate={i,mx,mz}; } segsW.push([p,q,i]); }
  const fc=new THREE.Color('#d8cfbe');
  for(const [p,q,i] of segsW){ const L=Math.hypot(q[0]-p[0],q[1]-p[1]), ux=(q[0]-p[0])/L, uz=(q[1]-p[1])/L; const parts=gate&&gate.i===i?[[0,L/2-2],[L/2+2,L]]:[[0,L]];
    for(const [a,b] of parts){ for(let t=a;t<b-.2;t+=4){ const t2=Math.min(b,t+4), x0=p[0]+ux*t, z0=p[1]+uz*t, x1=p[0]+ux*t2, z1=p[1]+uz*t2, mx=(x0+x1)/2, mz=(z0+z1)/2;
        if(roadAt(mx,mz,.3)||resolveCircle({x:mx,z:mz},.2)) continue; wallQ(A.fence,[x0,z0],[x1,z1],0,2.2,6,3,0,0,fc); wallQ(A.fence,[x1,z1],[x0,z0],0,2.2,6,3,0,0,fc); addOB(mx,mz,(t2-t)/2,.12,Math.atan2(uz,ux),2.2); } } }
  if(gate){ sc.gate=gate; const lab=new THREE.Sprite(new THREE.SpriteMaterial({map:texLabel(sc.name.toUpperCase(),'#1d3a8a','#ffffff',1400,192),fog:false})); lab.scale.set(8,1.1,1); lab.position.set(gate.mx,3.4,gate.mz); lab.layers.set(1); scene.add(lab); }
  let x=0,z=0; for(const p of pts){ x+=p[0]; z+=p[1]; } sc.x=x/pts.length; sc.z=z/pts.length; PLACES.push({name:sc.name,sub:'School',kind:'place',x:sc.x,z:sc.z}); }
// ---- filling stations: a canopy over the pumps, the brand on a pole
for(const a of AREAS){ if(a.k!=='fuel') continue; let x=0,z=0; for(const p of a.pts){ x+=p[0]; z+=p[1]; } x/=a.pts.length; z/=a.pts.length; const [e]=nearestRoad(x,z), ang=e?Math.atan2(e.fz,e.fx):0, c=Math.cos(ang), s=Math.sin(ang);
  const brand=a.n||'Filling station', col={Conoil:'#e31b23',Total:'#ee2a24',Mobil:'#1f4fa3'}[a.n]||'#16A06B';
  const can=new THREE.Mesh(new THREE.BoxGeometry(16,.7,9),new THREE.MeshStandardMaterial({color:0xf4f4f2,roughness:.5,emissive:new THREE.Color(col),emissiveIntensity:.15})); can.position.set(x,5.2,z); can.rotation.y=-ang; can.castShadow=true; scene.add(can);
  for(const u of [-6,6]) for(const v of [-3,3]){ const px=x+c*u-s*v, pz=z+s*u+c*v, p=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,5,8),MAT.conc); p.position.set(px,2.5,pz); scene.add(p); addCol({x0:px-.25,x1:px+.25,z0:pz-.25,z1:pz+.25,h:5}); }
  for(const u of [-3,3]){ const px=x+c*u, pz=z+s*u, pm=new THREE.Mesh(new THREE.BoxGeometry(.8,1.6,.5),new THREE.MeshStandardMaterial({color:new THREE.Color(col),roughness:.5})); pm.position.set(px,.8,pz); pm.rotation.y=-ang; scene.add(pm); addOB(px,pz,.45,.3,ang,1.6); }
  const lab=new THREE.Sprite(new THREE.SpriteMaterial({map:texLabel(brand.toUpperCase(),col,'#ffffff'),fog:false})); lab.scale.set(4.5,.9,1); lab.position.set(x,6.6,z); lab.layers.set(1); scene.add(lab);
  PLACES.push({name:brand+' filling station',sub:'Fuel',kind:'service',x,z}); }
// ---- Mushin railway station: a platform, a shelter and a name board
for(const st of WD.pois.station){ const [x,z]=st; let best=null,bd=1e9; for(const r of RAILS) for(let i=0;i+1<r.length;i++){ const [x0,z0]=r[i],[x1,z1]=r[i+1], L=Math.hypot(x1-x0,z1-z0)||1, fx=(x1-x0)/L, fz=(z1-z0)/L, t=clamp((x-x0)*fx+(z-z0)*fz,0,L), px=x0+fx*t, pz=z0+fz*t, d=Math.hypot(px-x,pz-z); if(d<bd){ bd=d; best={px,pz,fx,fz}; } }
  if(!best) continue; const ang=Math.atan2(best.fz,best.fx), c=Math.cos(ang), s=Math.sin(ang), side=((x-best.px)*-best.fz+(z-best.pz)*best.fx)>=0?1:-1, o=5.2*side, cx=best.px-best.fz*o, cz=best.pz+best.fx*o;
  const pl=new THREE.Mesh(new THREE.BoxGeometry(80,.9,5),MAT.conc); pl.position.set(cx,.45,cz); pl.rotation.y=-ang; pl.receiveShadow=true; pl.castShadow=true; scene.add(pl);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(40,.3,5.6),new THREE.MeshStandardMaterial({color:0x2f6b4f,roughness:.6})); roof.position.set(cx-best.fz*side*.3,4.6,cz+best.fx*side*.3); roof.rotation.y=-ang; roof.castShadow=true; scene.add(roof);
  addOB(cx,cz,40,2.5,ang,.9);
  const lab=new THREE.Sprite(new THREE.SpriteMaterial({map:texLabel('MUSHIN STATION','#16A06B','#ffffff'),fog:false})); lab.scale.set(6,1.15,1); lab.position.set(cx,5.6,cz); lab.layers.set(1); scene.add(lab);
  PLACES.push({name:'Mushin Station',sub:'Lagos–Ibadan railway',kind:'place',x:cx,z:cz}); }
// ---- big names on the map: LUTH, banks, churches, mosques, clinics
for(const a of AREAS){ if(a.k==='hospital'&&a.n){ let x=0,z=0; for(const p of a.pts){ x+=p[0]; z+=p[1]; } PLACES.push({name:a.n,sub:'Teaching hospital',kind:'place',x:x/a.pts.length,z:z/a.pts.length}); } }
// the LUTH gate on the road nearest the hospital grounds: you wake up here after dying
const LUTH=(()=>{ const a=AREAS.find(a=>a.k==='hospital'); let best=null, bd=1e9;
  if(a){ const P=a.pts; for(let i=0;i<P.length;i++){ const [x0,z0]=P[i], [x1,z1]=P[(i+1)%P.length], L=Math.hypot(x1-x0,z1-z0)||1;
    for(let t=0;t<=L;t+=6){ const x=x0+(x1-x0)*t/L, z=z0+(z1-z0)*t/L; if(!onLand(x,z,40)) continue; const [e,d]=nearestRoad(x,z,q=>q.drive&&q.c<=4); if(e&&d<bd){ bd=d; best={x,z,e}; } } } }
  if(!best) return {x:APT.front.x,z:APT.front.z,ry:APT.ry};
  const e=best.e, A0=nodes[e.a], t=clamp((best.x-A0.x)*e.fx+(best.z-A0.z)*e.fz,0,e.len), rx=A0.x+e.fx*t, rz=A0.z+e.fz*t, dx=best.x-rx, dz=best.z-rz, l=Math.hypot(dx,dz)||1, nx=dx/l, nz=dz/l;
  const o=e.hw+1.4, p={x:rx+nx*o,z:rz+nz*o}; resolveCircle(p,.5); const gx=rx+nx*(e.hw+6), gz=rz+nz*(e.hw+6), ang=Math.atan2(-e.fz,e.fx);
  // gate: two pillars and a sign
  for(const sd of [-1,1]){ const px=gx-e.fz*4.6*sd, pz=gz+e.fx*4.6*sd, m=new THREE.Mesh(new THREE.BoxGeometry(.7,4.4,.7),MAT.conc); m.position.set(px,2.2,pz); m.castShadow=true; m.layers.set(1); scene.add(m); addCol({x0:px-.4,x1:px+.4,z0:pz-.4,z1:pz+.4,h:4.4}); }
  { const m=new THREE.Mesh(new THREE.BoxGeometry(9.9,.6,.5),MAT.conc); m.position.set(gx,4.5,gz); m.rotation.y=ang; m.castShadow=true; m.layers.set(1); scene.add(m);
    const lab=new THREE.Sprite(new THREE.SpriteMaterial({map:texLabel('LUTH · TEACHING HOSPITAL','#16A06B','#ffffff'),fog:false})); lab.scale.set(6.4,1.05,1); lab.position.set(gx,5.6,gz); lab.layers.set(1); scene.add(lab); }
  PLACES.push({name:'LUTH gate',sub:'You wake up here after a bad day',kind:'service',x:gx,z:gz,minor:true});
  return {x:p.x,z:p.z,ry:Math.atan2(-nx,-nz),gx,gz}; })();
for(const [x,z,n] of WD.pois.bank) PLACES.push({name:n,sub:'Bank',kind:'service',x,z});
for(const [x,z,n] of WD.pois.worship) PLACES.push({name:n,sub:/Islam|Mosque|Masjid/i.test(n)?'Mosque':'Church',kind:'place',x,z,minor:true});
for(const [x,z,n] of WD.pois.clinic) PLACES.push({name:n,sub:'Clinic',kind:'service',x,z});
if(SHED_POSTS.length){ const pg=new THREE.CylinderGeometry(.07,.07,1,6); pg.translate(0,.5,0); new CullSet([{geo:pg,mat:new THREE.MeshStandardMaterial({color:0x6b5a48,roughness:.8}),dist:Q.draw*.6,shadow:false}],SHED_POSTS,{shadowDist:0,name:'sheds'}); }
/* ================= finalize static meshes ================= */
await step('Painting windows and shop signs…', 66);
for(const k of [...FAC_KEYS,'roof','zinc','fence']){ const m=A[k].mesh(MAT[k]); if(m) scene.add(m); }
for(const k of ['curb','pave','plaza','grass','road2','road4','cross','sign','roadBad2','roadBad4','dirt','asph','sand','lot','lawn']){ const m=A[k].mesh(MAT[k],false,true); if(m) scene.add(m); }
// street lamps on the big roads, and the overhead wires between them
const poles=[], heads=[], pools=[], WIRES=[];
{ const wp=[]; const wire=(a,b,sag)=>{ let px=a.x,py=a.y,pz=a.z; for(let i=1;i<=8;i++){ const t=i/8, x=a.x+(b.x-a.x)*t, z=a.z+(b.z-a.z)*t, y=a.y+(b.y-a.y)*t-sag*4*t*(1-t); wp.push(px,py,pz,x,y,z); px=x; py=y; pz=z; } };
  for(const e of ROADS){ if(e.c>4||e.c===0) continue; const A0=nodes[e.a], sides=e.c<=2&&!e.ow?[-1,1]:[e.ow?1:(e.way%2?1:-1)], stepL=e.c<=2?34:40;
    for(const sd of sides){ let prev=null; for(let t=A0.r+8;t<e.len-6;t+=stepL){ const o=e.hw+.9, bx=A0.x+e.fx*t-e.fz*o*sd, bz=A0.z+e.fz*t+e.fx*o*sd;
        if(resolveCircle({x:bx,z:bz},.35)||roadAt(bx,bz,.1)){ prev=null; continue; } const ax=e.fz*sd, az=-e.fx*sd, ry=Math.atan2(-az,ax);
        poles.push({x:bx,y:0,z:bz,ry}); const hx=bx+ax*1.75, hz=bz+az*1.75; heads.push({x:hx,y:7.84,z:hz,ry}); pools.push({x:hx,y:.08,z:hz,sx:15,sz:15}); addCol({x0:bx-.15,x1:bx+.15,z0:bz-.15,z1:bz+.15,h:8});
        const cur={x:bx,y:7.3,z:bz}; if(prev) { wire(prev,cur,rr(.6,1.1)); wire({x:prev.x,y:6.9,z:prev.z},{x:bx,y:6.9,z:bz},rr(.7,1.3)); } prev=cur; } } }
  // electric poles with sagging wires along the residential streets (NEPA lines)
  const wpoles=[]; for(const e of ROADS){ if(e.c<5||e.c>7||e.len<30) continue; const A0=nodes[e.a], sd=e.way%2?1:-1; let prev=null;
    for(let t=A0.r+5;t<e.len-4;t+=rr(28,36)){ const o=e.hw+.45, x=A0.x+e.fx*t-e.fz*o*sd, z=A0.z+e.fz*t+e.fx*o*sd; if(resolveCircle({x,z},.25)||roadAt(x,z,.05)){ prev=null; continue; }
      wpoles.push({x,y:0,z,ry:Math.atan2(e.fx,e.fz)}); addCol({x0:x-.13,x1:x+.13,z0:z-.13,z1:z+.13,h:7}); const cur={x,y:6.4,z}; if(prev){ wire(prev,cur,rr(.5,.9)); wire({x:prev.x,y:6.05,z:prev.z},{x,y:6.05,z},rr(.6,1)); } prev=cur; } }
  if(wpoles.length){ const wpg=mergeList([(()=>{ const g=new THREE.CylinderGeometry(.09,.13,6.8,6); g.translate(0,3.4,0); return g; })(),box(1.3,.09,.09,0,6.35,0)]); new CullSet([{geo:wpg,mat:new THREE.MeshStandardMaterial({color:0x5a4634,roughness:.9}),dist:Q.draw*.6,shadow:true}],wpoles,{shadowDist:30,name:'wpoles'}); }
  const WT=new Map(), wm=new THREE.LineBasicMaterial({color:0x14110f}); for(let i=0;i<wp.length;i+=6){ const k=rgk(Math.floor(wp[i]/160),Math.floor(wp[i+2]/160)); let L=WT.get(k); if(!L) WT.set(k,L=[]); L.push(wp[i],wp[i+1],wp[i+2],wp[i+3],wp[i+4],wp[i+5]); }
  for(const L of WT.values()){ const wg=new THREE.BufferGeometry(); wg.setAttribute('position',new THREE.Float32BufferAttribute(L,3)); wg.computeBoundingSphere(); const wl=new THREE.LineSegments(wg,wm); scene.add(wl); WIRES.push(wl); } }
const poleG=mergeList([(()=>{ const g=new THREE.CylinderGeometry(.08,.13,8,8); g.translate(0,4,0); return g; })(),box(1.85,.1,.1,.92,7.92,0)]);
new CullSet([{geo:poleG,mat:new THREE.MeshStandardMaterial({color:0x50555b,metalness:.7,roughness:.45}),dist:Q.draw*.7,shadow:true}],poles,{shadowDist:30});
const lampHeadMat=new THREE.MeshStandardMaterial({color:0xfff4dc,emissive:0xffbe6a,emissiveIntensity:0});
new CullSet([{geo:box(.62,.1,.3,0,0,0),mat:lampHeadMat,dist:Q.draw*.7,shadow:false}],heads,{shadowDist:0});
const poolG=new THREE.PlaneGeometry(1,1); poolG.rotateX(-Math.PI/2);
const POOLS=new CullSet([{geo:poolG,mat:new THREE.MeshBasicMaterial({map:T.glow,color:0xffa04a,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false}),dist:110,shadow:false}],pools,{shadowDist:0,name:'pools'}); POOLS.off=true;
const poolMesh=POOLS.meshes[0];
/* traffic lights: at the real signals on the map, and where two big roads cross */
const CYCLE=30;
{ for(const j of WD.pois.signals) if(nodes[j]) nodes[j].tl=true;
  for(const n of nodes){ if(n.deg<3) continue; const big=n.ed.filter(e=>e.c<=4&&e.drive); if(big.length>=3&&new Set(big.map(e=>e.way)).size>=2&&big.some(e=>e.c<=3)) n.tl=true; }
  // the carriageways of one junction share one light cycle
  const tl=nodes.filter(n=>n.tl); for(const n of tl) n.tlg=n; for(const n of tl) for(const m of tl) if(m!==n&&Math.hypot(m.x-n.x,m.z-n.z)<36) m.tlg=n.tlg;
  for(const n of tl){ if(n.tlg===n) n.tlo=MR()*CYCLE; } for(const n of tl) n.tlo=n.tlg.tlo, n.ax=n.tlg.ax; }
function lightAt(n,fx,fz){ const t=(T0+n.tlo)%CYCLE, along=Math.abs(fx*Math.cos(n.ax)+fz*Math.sin(n.ax))>.7; if(along) return t<12?'g':t<15?'y':'r'; return t<15?'r':t<27?'g':'y'; }
const tlPoles=[], tlHeads=[], tlLamps=[], tlRefs=[], TLM=MODELS.tlight;
const TL_LENS=[[-3.757,4.11],[-3.757,3.815],[-3.757,3.52]], TL_LZ=.175;
nodes.forEach(n=>{ if(!n.tl) return; for(const e of n.ed){ if(!e.drive||e.c>5) continue; const m=nodes[e.a===n.i?e.b:e.a]; if(e.ow&&e.b!==n.i) continue;   // only roads that bring cars in
  const dx=n.x-m.x, dz=n.z-m.z, L=Math.hypot(dx,dz), fx=dx/L, fz=dz/L, rx=-fz, rz=fx;
  const px=n.x-fx*(n.r+1.4)+rx*(e.hw+1.1), pz=n.z-fz*(n.r+1.4)+rz*(e.hw+1.1), ry=Math.atan2(-fx,-fz);
  if(resolveCircle({x:px,z:pz},.2)) continue;
  const cross=(n.ed.find(o=>o!==e&&o.name&&o.name!==e.name)||e).name||'Mushin';
  tlPoles.push({x:px,y:SLAB,z:pz,ry,cross}); addCol({x0:px-.15,x1:px+.15,z0:pz-.15,z1:pz+.15,h:5});
  if(TLM){ const c=Math.cos(ry), sn=Math.sin(ry); for(const [lx,ly] of TL_LENS) tlLamps.push({x:px+lx*c+TL_LZ*sn,y:SLAB+ly,z:pz-lx*sn+TL_LZ*c,ry}); }
  else { tlHeads.push({x:px,y:SLAB+4.25,z:pz,ry}); for(let k=0;k<3;k++) tlLamps.push({x:px-fx*.18,y:SLAB+4.58-k*.33,z:pz-fz*.18}); }
  tlRefs.push({n,fx,fz,e}); } });
if(TLM){ // drop the New York street plates that came with the model; we put Lagos names on instead
  const g=TLM.geo, P=g.attributes.position, I=g.index.array, keep=[];
  for(let t=0;t<I.length;t+=3){ const a=I[t],b=I[t+1],c=I[t+2], cx=(P.getX(a)+P.getX(b)+P.getX(c))/3, cy=(P.getY(a)+P.getY(b)+P.getY(c))/3, cz=(P.getZ(a)+P.getZ(b)+P.getZ(c))/3;
    if(cy>2.8&&cy<3.65&&cx>-1&&(cx>.12||cz>.12)) continue; keep.push(a,b,c); }
  g.setIndex(keep); g.computeBoundingSphere();
  new CullSet([{geo:g,mat:TLM.mat,dist:Q.draw+40,shadow:true}],tlPoles.map(t=>({x:t.x,y:SLAB,z:t.z,ry:t.ry})),{shadowDist:Q.shR*.8,name:'tlight'});
  const names=[...new Set(tlPoles.map(t=>t.cross))], [sc,sg]=cv(512,64*names.length);
  names.forEach((nm,i)=>{ sg.fillStyle='#0b6e4f'; sg.fillRect(0,i*64,512,64); sg.strokeStyle='#e8f1ec'; sg.lineWidth=4; sg.strokeRect(5,i*64+5,502,54); sg.fillStyle='#ffffff'; sg.textAlign='center'; sg.textBaseline='middle';
    fitFont(sg,nm.toUpperCase(),470,34,'"Barlow Semi Condensed"','700'); sg.fillText(nm.toUpperCase(),256,i*64+33); });
  const st=tx(sc,true,false,1024), acc=new Acc();
  for(const t of tlPoles){ const k=names.indexOf(t.cross), c=Math.cos(t.ry), sn=Math.sin(t.ry), w=(lx,lz)=>[t.x+lx*c+lz*sn,t.z-lx*sn+lz*c], v1=1-k/names.length, v0=1-(k+1)/names.length;
    const A1=w(-.12,.03), B1=w(-1.55,.03), y0=SLAB+3.02, y1=SLAB+3.3; acc.quad([B1[0],y0,B1[1]],[A1[0],y0,A1[1]],[A1[0],y1,A1[1]],[B1[0],y1,B1[1]],[sn,0,c],[[0,v0],[1,v0],[1,v1],[0,v1]],WHITE); }
  const sm=acc.mesh(new THREE.MeshStandardMaterial({map:st,roughness:.5,side:THREE.DoubleSide}),false,true); if(sm){ sm.layers.set(1); scene.add(sm); } }
else { const tp=new THREE.CylinderGeometry(.07,.09,4.4,8); tp.translate(0,2.2,0); inst(tp,new THREE.MeshStandardMaterial({color:0x2b2e33,metalness:.6,roughness:.45}),tlPoles);
  inst(box(.42,1.15,.32,0,0,0),new THREE.MeshStandardMaterial({color:0x17191c,roughness:.6}),tlHeads); }
const tlLampMesh=inst(TLM?new THREE.CircleGeometry(.105,14):new THREE.SphereGeometry(.12,10,8),new THREE.MeshBasicMaterial({color:0xffffff}),tlLamps,{shadow:false,colors:tlLamps.map(()=>new THREE.Color(.1,.1,.1))});
const _tc=new THREE.Color(); let tlTick=0;
function updateLights(dt){ tlTick-=dt; if(tlTick>0) return; tlTick=.2; const hot=ENV.night||ENV.dim>.6?3.2:1.7;
  tlRefs.forEach((r,i)=>{ const st=lightAt(r.n,r.fx,r.fz);
    tlLampMesh.setColorAt(i*3,  st==='r'?_tc.setRGB(hot,.06*hot,.03*hot):_tc.setRGB(.16,.02,.02));
    tlLampMesh.setColorAt(i*3+1,st==='y'?_tc.setRGB(hot,.65*hot,.05*hot):_tc.setRGB(.16,.11,.02));
    tlLampMesh.setColorAt(i*3+2,st==='g'?_tc.setRGB(.08*hot,hot,.45*hot):_tc.setRGB(.02,.13,.06)); });
  tlLampMesh.instanceColor.needsUpdate=true; }


/* ================= people ================= */
await step('Dressing the people in Ankara…', 72);
const HG={};
{ const lathe=pts=>new THREE.LatheGeometry(pts.map(p=>new THREE.Vector2(p[0],p[1])),12);
  HG.torsoM=lathe([[.001,0],[.15,0],[.165,.08],[.155,.22],[.175,.36],[.2,.46],[.175,.53],[.07,.585],[.001,.59]]); HG.torsoM.scale(1,1,.62);
  HG.torsoF=lathe([[.001,0],[.165,0],[.17,.08],[.13,.24],[.16,.36],[.17,.45],[.15,.52],[.06,.565],[.001,.57]]); HG.torsoF.scale(1,1,.66);
  HG.neck=new THREE.CylinderGeometry(.045,.05,.12,10);
  HG.head=new THREE.SphereGeometry(.105,14,11); HG.head.scale(.92,1.1,1);
  HG.hair=new THREE.SphereGeometry(.113,14,8,0,Math.PI*2,0,Math.PI*.52); HG.hair.scale(.95,1,1.04);
  HG.gele=new THREE.SphereGeometry(.17,14,8,0,Math.PI*2,0,Math.PI*.6); HG.gele.scale(1.15,.8,1.05);
  HG.eye=new THREE.SphereGeometry(.013,6,4); HG.nose=new THREE.SphereGeometry(.018,6,4);
  HG.uarm=new THREE.CapsuleGeometry(.047,.2,3,8); HG.sleeve=new THREE.CapsuleGeometry(.06,.1,3,8);
  HG.farm=new THREE.CapsuleGeometry(.04,.19,3,8); HG.hand=new THREE.SphereGeometry(.045,8,6);
  HG.thigh=new THREE.CapsuleGeometry(.072,.3,3,8); HG.shin=new THREE.CapsuleGeometry(.056,.32,3,8);
  HG.foot=new THREE.BoxGeometry(.1,.07,.25); HG.skirt=new THREE.CylinderGeometry(.17,.27,.62,12,1,true); }
const mc=new Map(); const sMat=(k,o)=>{ if(!mc.has(k)) mc.set(k,new THREE.MeshStandardMaterial(o)); return mc.get(k); };
const skinMat=c=>sMat('s'+c,{color:c,roughness:.5}), clothMat=c=>sMat('c'+c,{color:c,roughness:.88}), ankMat=i=>sMat('a'+i,{map:ANK[i],roughness:.82});
const eyeMat=sMat('eye',{color:0x0c0a09,roughness:.2});
const SKINS=['#5a3825','#6b4429','#7b5032','#4a2c1a','#8a5b3a','#3f2616'], TOPS=['#f4f1ea','#1b1b1f','#22396b','#a3262a','#e0b100','#2f6b45','#7a7f87','#d9673b','#f2f2f2'], BOTS=['#23324f','#1a1a1c','#6e6253','#2c3d2f','#e9e4d8','#3b2f28'], SHOES=['#141414','#f2f2f2','#5a3b22'];
// Each person is ONE skinned mesh (one draw call): body parts are glued to 12 bones, colours live in vertex colours,
// Ankara prints come from one shared texture atlas.
const HUMAN_ATLAS=(()=>{ const [c,g]=cv(1024,512); g.fillStyle='#fff'; g.fillRect(0,0,1024,512);
  ANKC.forEach((src,i)=>{ const cx=(i%4)*256, cy=Math.floor(i/4)*256; for(let ty=0;ty<2;ty++) for(let tx_=0;tx_<3;tx_++) g.drawImage(src,cx+tx_*256/3,cy+ty*128,256/3+.5,128.5); });
  const t=tx(c,true,false,1024); return t; })();
const HUMAN_MAT=new THREE.MeshStandardMaterial({map:HUMAN_ATLAS,vertexColors:true,roughness:.72,emissive:new THREE.Color(.55,.48,.42),emissiveIntensity:0});
const HERO_MATS=[];
const _bp=new THREE.Vector3();
function makeHuman(o){
  const paint=m=>{ if(!m) return {c:new THREE.Color(0x141110)}; if(m.map){ const i=ANK.indexOf(m.map); return i>=0?{a:i}:{c:new THREE.Color(1,1,1)}; } return {c:m.color.clone()}; };
  const B=[]; const bone=(parent,x,y,z)=>{ const b=new THREE.Bone(); b.position.set(x,y,z); if(parent) parent.add(b); B.push(b); return b; };
  const rootB=bone(null,0,0,0), hips=bone(rootB,0,.93,0), torso=bone(hips,0,0,0), head=bone(torso,0,.7,0);
  const la=bone(torso,.2,.47,0), lel=bone(la,0,-.29,0), ra=bone(torso,-.2,.47,0), rel=bone(ra,0,-.29,0);
  const ll=bone(hips,.092,.02,0), lk=bone(ll,0,-.43,0), rl=bone(hips,-.092,.02,0), rk=bone(rl,0,-.43,0);
  rootB.updateMatrixWorld(true);
  const parts=[]; const add=(geo,m,b,x,y,z)=>parts.push({geo,p:paint(m),b,x,y,z});
  add(o.f?HG.torsoF:HG.torsoM,o.top,torso,0,-.04,0); add(HG.neck,o.skin,torso,0,.58,0); add(HG.head,o.skin,head,0,0,0);
  if(o.gele) add(HG.gele,o.gele,head,0,.06,-.01); else add(HG.hair,o.hairM,head,0,.012,-.006);
  add(HG.eye,eyeMat,head,.034,.018,.094); add(HG.eye,eyeMat,head,-.034,.018,.094); add(HG.nose,o.skin,head,0,-.01,.104);
  for(const [sh,el] of [[la,lel],[ra,rel]]){ add(HG.sleeve,o.top,sh,0,-.07,0); add(HG.uarm,o.skin,sh,0,-.15,0); add(HG.farm,o.skin,el,0,-.13,0); add(HG.hand,o.skin,el,0,-.27,0); }
  for(const [hp,kn] of [[ll,lk],[rl,rk]]){ add(HG.thigh,o.f?o.skin:o.bottom,hp,0,-.21,0); add(HG.shin,o.f?o.skin:o.bottom,kn,0,-.2,0); add(HG.foot,o.shoe,kn,0,-.43,.045); }
  if(o.f) add(HG.skirt,o.bottom,hips,0,-.27,0);
  const geos=parts.map(pt=>{ const g=pt.geo.clone(); for(const k of Object.keys(g.attributes)) if(!['position','normal','uv'].includes(k)) g.deleteAttribute(k);
    pt.b.getWorldPosition(_bp); g.translate(_bp.x+pt.x,_bp.y+pt.y,_bp.z+pt.z); const n=g.attributes.position.count, bi=B.indexOf(pt.b);
    const col=new Float32Array(n*3), si=new Uint16Array(n*4), sw=new Float32Array(n*4), uv=g.attributes.uv;
    const cc=pt.p.c||WHITE; for(let i=0;i<n;i++){ col[i*3]=cc.r; col[i*3+1]=cc.g; col[i*3+2]=cc.b; si[i*4]=bi; sw[i*4]=1;
      if(pt.p.a!==undefined){ const k=pt.p.a, cu=(k%4), cr=Math.floor(k/4), u=clamp(uv.getX(i),0,1), v=clamp(uv.getY(i),0,1); uv.setXY(i,(cu*256+3+u*250)/1024,1-(cr*256+3+(1-v)*250)/512); }
      else uv.setXY(i,.64,.27); }
    g.setAttribute('color',new THREE.BufferAttribute(col,3)); g.setAttribute('skinIndex',new THREE.BufferAttribute(si,4)); g.setAttribute('skinWeight',new THREE.BufferAttribute(sw,4)); return g; });
  const geo=mergeGeometries(geos,false); geos.forEach(g=>g.dispose());
  const mesh=new THREE.SkinnedMesh(geo,HUMAN_MAT); mesh.add(rootB); mesh.bind(new THREE.Skeleton(B)); mesh.castShadow=true; mesh.receiveShadow=true; mesh.layers.set(1);
  const root=new THREE.Group(); root.rotation.order='YXZ'; root.add(mesh);
  return {root,mesh,hips,torso,head,la,ra,lel,rel,ll,rl,lk,rk};
}
// fixed poses for people sitting in or standing on vehicles
function poseSeat(h,kind){ const r=h.root;
  if(kind==='bike'){ h.ll.rotation.set(-1.25,0,.32); h.rl.rotation.set(-1.25,0,-.32); h.lk.rotation.x=h.rk.rotation.x=1.5; h.la.rotation.set(-1.05,0,.32); h.ra.rotation.set(-1.05,0,-.32); h.lel.rotation.x=h.rel.rotation.x=-.4; h.torso.rotation.x=.25; }
  else if(kind==='stand'){ h.la.rotation.set(-2.6,0,.25); h.lel.rotation.x=-.3; h.ra.rotation.set(.1,0,-.2); h.rel.rotation.x=-.3; h.torso.rotation.set(0,0,-.12); h.head.rotation.y=-.6; }
  else if(kind==='bed'){ h.ll.rotation.x=h.rl.rotation.x=-1.45; h.lk.rotation.x=h.rk.rotation.x=1.35; h.la.rotation.set(-.4,0,.15); h.ra.rotation.set(-.4,0,-.15); h.lel.rotation.x=h.rel.rotation.x=-1.1; h.torso.rotation.x=-.05; }
  else { h.ll.rotation.set(-1.5,0,.05); h.rl.rotation.set(-1.5,0,-.05); h.lk.rotation.x=h.rk.rotation.x=1.45; h.la.rotation.set(-1.05,0,.12); h.ra.rotation.set(-1.05,0,-.12); h.lel.rotation.x=h.rel.rotation.x=-.75; h.torso.rotation.x=.05; }
  r.traverse(o=>{ if(o.isMesh) o.castShadow=false; }); return h; }
function animHuman(h,ph,s,t,phone){
  if(s<.04){ const b=Math.sin(t*1.8)*.012; h.torso.rotation.set(b,0,0); h.hips.rotation.y=0; h.hips.position.y=.93;
    h.ll.rotation.x=h.rl.rotation.x=0; h.lk.rotation.x=h.rk.rotation.x=.02; h.la.rotation.set(.04,0,.07); h.ra.rotation.set(.04,0,-.07); h.lel.rotation.x=-.12; h.rel.rotation.x=-.12;
    if(phone){ h.ra.rotation.set(-.55,0,-.25); h.rel.rotation.x=-2.25; h.head.rotation.y=-.15; } else h.head.rotation.y=Math.sin(t*.4)*.25; return; }
  const a=Math.min(s,1), run=clamp(s-1,0,1), sw=Math.sin(ph);
  const legA=.42*a+.36*run, armA=.32*a+.5*run;
  h.ll.rotation.x=-sw*legA; h.rl.rotation.x=sw*legA;
  h.lk.rotation.x=Math.max(0,Math.cos(ph))*(.7*a+.75*run)+.05; h.rk.rotation.x=Math.max(0,-Math.cos(ph))*(.7*a+.75*run)+.05;
  h.la.rotation.set(sw*armA,0,.07); h.ra.rotation.set(-sw*armA,0,-.07);
  h.lel.rotation.x=-.2-.15*a-.95*run; h.rel.rotation.x=h.lel.rotation.x;
  h.hips.position.y=.93-.035*run+Math.abs(Math.cos(ph))*(.022*a+.035*run);
  h.torso.rotation.set(.03*a+.2*run,-sw*(.06*a+.1*run),0); h.hips.rotation.y=sw*.05*a; h.head.rotation.y=0;
}
function randomHuman(){ const f=MR()<.45, ai=()=>Math.floor(MR()*ANK.length);
  return makeHuman({f,skin:skinMat(mpick(SKINS)),top:MR()<.45?ankMat(ai()):clothMat(mpick(TOPS)),bottom:f?(MR()<.6?ankMat(ai()):clothMat(mpick(BOTS))):clothMat(mpick(BOTS)),shoe:clothMat(mpick(SHOES)),hairM:clothMat('#141110'),gele:f&&MR()<.45?ankMat(ai()):null}); }

// ---- the cast: real people made in Mixamo (assets/people). Up close each one is the real body with real moves;
// farther away the same person is drawn as a cheap look-alike in the same colours, so nobody "changes clothes".
// h: height (m); w: how common; idle: what they do standing alone; tw: chance to text while walking;
// look (far look-alike): skin, top, bottom, shoes, hair/cap/tray
const CAST={
  mama:      {f:1,h:1.75,w:1.2,idle:['idle_1','idle_2','talk'],          tw:.1, look:['#6b4429','#d42a26','#a27b4c','#c0392b','#141110']},
  lady_red:  {f:1,h:1.74,w:1,  idle:['idle_3','sassy','text'],           tw:.3, look:['#7b5032','#c81e1e','#c81e1e','#c0392b','#141110']},
  lady_black:{f:1,h:1.73,w:1,  idle:['idle_4','text','sassy'],           tw:.3, look:['#9a6a45','#18181a','#18181a','#d9b38c','#141110']},
  hawker:    {f:1,h:1.84,w:.8, idle:['idle_2','idle_1'],                 tw:0,  look:['#4a2c1a','#1aa3a8','#7a2b3a','#3b2f28','#d9482b'], tray:1},
  baba:      {f:0,h:1.77,w:.7, idle:['idle_baba','idle_1'],              tw:0,  look:['#3f2616','#f2f0ea','#f2f0ea','#5a3b22','#23407a']},
  areaboy:   {f:0,h:1.80,w:1.3,idle:['fight_idle','idle_1','phone','text'], tw:.25,look:['#5a3825','#2f6b45','#3a3a3c','#141414','#141110']},
  schoolboy: {f:0,h:1.45,w:.6, idle:['idle_1','text','idle_2'],          tw:.15,look:['#4a2c1a','#dde8f4','#1f2d4d','#141414','#141110']},
  girl:      {f:1,h:1.68,w:.8, idle:['f_idle','f_talk','f_think','f_bashful','text'], tw:.35,look:['#5a3825','#f0eeea','#55565c','#141414','#141110'],fight:1},   // the female player's body too
  suit_lady: {f:1,h:1.72,w:.45,idle:['idle_suit','f_talk','f_think','phone'], tw:.2, look:['#7b5032','#5a5d68','#4a4d58','#3a3028','#141110']},
  // the police (only come with the vans): a plain-clothes officer in a POLICE cap, and a heavy policewoman in black tactical kit
  police_m:  {f:0,h:1.80,w:0,  idle:['idle_1','phone'],                  tw:0,  look:['#3a2416','#f2f2f0','#1b2433','#3a2a20','#141414'],cop:1},
  police_f:  {f:1,h:1.68,w:0,  idle:['idle_2','idle_1'],                 tw:0,  look:['#c99a7a','#1c1d22','#1c1d22','#0e0e10','#3a2a1a'],cop:1,fight:1}};
Object.assign(CAST,{   // our own people (Tunde, Amaka, Ada): each copy wears one of their four outfits
  p_tunde:{f:0,h:1.80,w:.45,idle:['idle_1','idle_2','phone','text'],tw:.2,look:['#3a2416','#0e8a44','#16161a','#eeeeee','#141110'],v2:1},
  p_amaka:{f:1,h:1.70,w:.45,idle:['f_idle','f_talk','text','f_think'],tw:.3,look:['#7b5032','#f5f1ea','#4a6492','#eeeeee','#141110'],v2:1},
  p_ada:  {f:1,h:1.66,w:.45,idle:['f_idle','f_talk','text','f_bashful'],tw:.3,look:['#3f2616','#561869','#e9b004','#111111','#141110'],v2:1}});
if(isF()) CAST.girl.w=0;   // she is you: no copies of you walking the streets
function castHuman(id){ const c=CAST[id], L=c.look; const h=makeHuman({f:!!c.f,skin:skinMat(L[0]),top:clothMat(L[1]),bottom:clothMat(L[2]),shoe:clothMat(L[3]),hairM:clothMat(L[4]),gele:c.tray?clothMat(L[4]):null});
  h.root.scale.setScalar((c.tray?c.h-.12:c.h)/1.76); return h; }
// school runs (07:00–08:30, 13:30–15:30 game time) bring out the schoolboys; late night has fewer hawkers and babas
function pickCast(hour){ const school=hour!=null&&((hour>=7&&hour<8.5)||(hour>=13.5&&hour<15.5)), night=hour!=null&&(hour>=21||hour<5.5); let tot=0; const w={};
  for(const k in CAST){ let x=CAST[k].w; if(k==='schoolboy') x*=school?5:night?0:.5; if(night&&(k==='baba'||k==='hawker')) x*=.3; if(night&&k==='areaboy') x*=1.6; w[k]=x; tot+=x; }
  let r=MR()*tot; for(const k in w){ r-=w[k]; if(r<=0) return k; } return 'mama'; }
const LOOKS={};   // spare look-alikes per cast, reused when people come and go
function getLook(id){ const L=LOOKS[id]; if(L&&L.length) return L.pop(); const h=castHuman(id); h.root.visible=false; scene.add(h.root); return h; }
function returnLook(p){ if(!p.h) return; p.h.root.visible=false; p.h.root.rotation.x=0; (LOOKS[p.cast]||(LOOKS[p.cast]=[])).push(p.h); p.h=null; }

const player={x:APT.front.x+APT.nx*1.2,z:APT.front.z+APT.nz*1.2,y:SLAB,yaw:APT.ry,speed:0,ph:0};
let mode='walk', started=false, busy=false, T0=0;
let rig=makeHuman({f:false,skin:skinMat('#5a3825'),top:ankMat(5),bottom:clothMat('#1a1a1c'),shoe:clothMat('#f2f2f2'),hairM:clothMat('#141110')});
scene.add(rig.root);

// walkers keep to the edge of the street (in Mushin the houses come right up to the road): just off the asphalt where there is room,
// on the edge of the road where there is not (cars give them room)
const SIDE_OFF=new Map();
function sideOff(e,side){ const k=e.i*2+(side>0?1:0); let o=SIDE_OFF.get(k); if(o!==undefined) return o; const A0=nodes[e.a]; o=e.hw+.9;
  let wet=0; for(let t=4;t<e.len-3;t+=6){ const x=A0.x+e.fx*t-e.fz*o*side, z=A0.z+e.fz*t+e.fx*o*side; if(resolveCircle({x,z},.35)){ o=Math.max(e.hw-.3,1.2); break; }
    const r=roadAt(x,z); if(r&&r!==e&&r.c<=4&&r.a!==e.a&&r.a!==e.b&&r.b!==e.a&&r.b!==e.b) wet++; }
  if(wet>=2) o=-1;   // this side is the other half of a dual carriageway: no pavement here
  SIDE_OFF.set(k,o); return o; }
// a person's walking line along a street; on a dual carriageway everyone keeps to the outer pavement
function sidewalkPts(a,b,side){ const e=edgeOf(a.i,b.i), dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz)||1,fx=dx/L,fz=dz/L,rx=-fz,rz=fx; let sg=side*(e&&e.a!==a.i?-1:1), oo=e?sideOff(e,sg):3;
  if(oo<0&&e){ const o2=sideOff(e,-sg); if(o2>0){ oo=o2; side=-side; } else oo=e.hw+.9; } const o=oo*side,sa=Math.min(a.r+1,L*.45),sb=Math.min(b.r+1,L*.45);
  return [{x:a.x+fx*sa+rx*o,z:a.z+fz*sa+rz*o},{x:b.x-fx*sb+rx*o,z:b.z-fz*sb+rz*o}]; }
const peds=[];
const walkable=e=>e.c>0&&e.c<9;
// a random street piece near (x,z): looks in a ring between dmin and dmax around the player
function streetNear(x,z,dmin,dmax,ok){ for(let t=0;t<40;t++){ const a=MR()*Math.PI*2, r=dmin+(dmax-dmin)*Math.sqrt(MR()), L=roadsNear(x+Math.cos(a)*r,z+Math.sin(a)*r); if(!L.length) continue; const e=mpick(L); if(ok(e)) return e; } return null; }
function placePed(p,dmin,dmax){ for(let t=0;t<30;t++){ const e=streetNear(player.x,player.z,dmin,dmax,walkable); if(!e) continue; const rev=MR()<.5, a=rev?e.b:e.a, b=rev?e.a:e.b; const [s,f]=sidewalkPts(nodes[a],nodes[b],p.side); const u=MR(), x=s.x+(f.x-s.x)*u, z=s.z+(f.z-s.z)*u, d=Math.hypot(x-player.x,z-player.z);
  if(d<dmin||d>dmax) continue; Object.assign(p,{a,b,x,z,q:[f],state:'walk',fall:0,phone:false,speed:p.v,yaw:Math.atan2(f.x-x,f.z-z)}); return true; } return false; }
const bigRoad=e=>!!e&&(e.c<=2||e.w>=11);
// would walking from (a→b) on to (b→n) take this person across a big road at the junction b?
function crossesBig(p,n){ const A=nodes[p.a], B=nodes[p.b], N=nodes[n]; const [,P1]=sidewalkPts(A,B,p.side), [P2]=sidewalkPts(B,N,p.side);
  for(const e of B.ed){ if(!bigRoad(e)) continue; const o=nodes[e.a===B.i?e.b:e.a], L=Math.hypot(o.x-B.x,o.z-B.z)||1, k=Math.min(1,25/L), ex=B.x+(o.x-B.x)*k, ez=B.z+(o.z-B.z)*k;
    if(segX(P1.x,P1.z,P2.x,P2.z,B.x,B.z,ex,ez)) return true; } return false; }
function segX(ax,az,bx,bz,cx,cz,dx,dz){ const d1=(bx-ax)*(cz-az)-(bz-az)*(cx-ax), d2=(bx-ax)*(dz-az)-(bz-az)*(dx-ax), d3=(dx-cx)*(az-cz)-(dz-cz)*(ax-cx), d4=(dx-cx)*(bz-cz)-(dz-cz)*(bx-cx); return d1*d2<0&&d3*d4<0; }
function pedPlan(p){ const all=nodes[p.b].wadj.filter(n=>n!==p.a), opts=all.filter(n=>!crossesBig(p,n)); let nb=opts.length?mpick(opts):p.a;
  if(nb===p.a) p.side=-p.side;   // turning back: stay on the same pavement
  p.a=p.b; p.b=nb; if(p.a===p.b||!edgeOf(p.a,p.b)){ replanPed(p); return; } p.q=sidewalkPts(nodes[p.a],nodes[p.b],p.side); }
function replanPed(p){ const [e]=nearestRoad(p.x,p.z,walkable); if(!e){ placePed(p,20,140); return; } const A0=nodes[e.a], B0=nodes[e.b], toB=(p.x-A0.x)*e.fx+(p.z-A0.z)*e.fz<e.len/2;
  p.a=toB?e.a:e.b; p.b=toB?e.b:e.a; const dx=nodes[p.b].x-nodes[p.a].x, dz=nodes[p.b].z-nodes[p.a].z; p.side=(-dz*(p.x-nodes[p.a].x)+dx*(p.z-nodes[p.a].z))>=0?1:-1;   // the pavement they are already on
  p.q=sidewalkPts(nodes[p.a],nodes[p.b],p.side); p.state='walk'; p.carried=false; }
const newPed=(cast,state)=>({h:cast?getLook(cast):null,cast,body:null,x:0,z:0,y:SLAB,yaw:0,speed:0,v:mrr(1.15,1.6),ph:MR()*6,state,q:[],a:0,b:0,side:MR()<.5?-1:1,timer:0,phone:false,fall:0,vx:0,vz:0,lod:-1,cool:0,startT:0,tw:false,act:null,spot:null,dc:1e9});
// walkers on the pavements
for(let i=0;i<Q.peds;i++){ const p=newPed(pickCast(),'walk'); p.tw=MR()<CAST[p.cast].tw; peds.push(p); if(!placePed(p,4,140)) placePed(p,0,3000); }
// people who stand in groups at shop fronts, corners, gates and bus stops (given a place when the player comes near)
const SHOP_N=Q===QUAL.low?20:Q===QUAL.medium?30:42;   // extra people for the markets
for(let i=0;i<Q.spots+SHOP_N;i++) peds.push(newPed(null,'off'));

/* ================= cars ================= */
await step('Fuelling the danfos…', 82);
const paintCache=new Map();
function paintMat(hex,metal=.55){ const k=hex+'|'+metal; if(!paintCache.has(k)) paintCache.set(k,new THREE.MeshPhysicalMaterial({color:hex,metalness:metal,roughness:.3,clearcoat:1,clearcoatRoughness:.06})); return paintCache.get(k); }
const CM={glass:new THREE.MeshPhysicalMaterial({color:0x0b1118,metalness:.9,roughness:.05}),trim:new THREE.MeshStandardMaterial({color:0x121212,roughness:.6}),
  chrome:new THREE.MeshStandardMaterial({color:0xd6dade,metalness:1,roughness:.2}),tire:new THREE.MeshStandardMaterial({color:0x161616,roughness:.92}),
  head:new THREE.MeshStandardMaterial({color:0xf4f4f0,emissive:0xfff2d8,emissiveIntensity:.15,roughness:.2}),tail:new THREE.MeshStandardMaterial({color:0x5a0505,emissive:0xff1a14,emissiveIntensity:.3,roughness:.3})};
const CAR_T={
  sedan:{L:4.6,W:1.78,r:.33,base:1.38,bumperY:.42,headY:.7,tailY:.8,body:[[-2.28,.3],[2.25,.3],[2.33,.55],[2.28,.72],[2.05,.84],[1.0,.93],[-1.45,.97],[-2.2,.93],[-2.33,.72],[-2.32,.45]],cabin:[[1.02,.92],[.18,1.36],[-.86,1.38],[-1.58,.96]],roof:[.18,-.86,1.38],maxV:[12,16.5]},
  suv:{L:4.85,W:1.9,r:.41,base:1.45,bumperY:.52,headY:.88,tailY:.95,body:[[-2.38,.4],[2.33,.4],[2.42,.68],[2.38,.95],[2.2,1.05],[1.15,1.12],[-2.3,1.15],[-2.42,.92],[-2.42,.55]],cabin:[[1.18,1.11],[.55,1.72],[-2.12,1.75],[-2.3,1.14]],roof:[.55,-2.12,1.74],maxV:[12,17]},
  danfo:{L:4.9,W:1.86,r:.34,base:1.5,bumperY:.5,headY:.8,tailY:.85,body:[[-2.42,.36],[2.3,.36],[2.43,.62],[2.43,1.02],[2.3,1.92],[2.02,2.06],[-2.32,2.06],[-2.43,1.92],[-2.43,.6]],cabin:null,maxV:[10,14]}};
function extr(pts,depth,bev){ const s=new THREE.Shape(); s.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<pts.length;i++) s.lineTo(pts[i][0],pts[i][1]); s.closePath();
  const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:bev>0,bevelThickness:bev,bevelSize:bev,bevelSegments:3,steps:1,curveSegments:4}); g.translate(0,0,-depth/2); return g; }
const carGeoCache={};
function carGeos(type){ if(carGeoCache[type]) return carGeoCache[type]; const D=CAR_T[type], W=D.W, hw=W/2;
  const paint=[extr(D.body,W,.06)], glass=[], trim=[], head=[], tail=[];
  const fx=Math.max(...D.body.map(p=>p[0]))+.06, bx=Math.min(...D.body.map(p=>p[0]))-.06;
  if(D.cabin){ glass.push(extr(D.cabin,W*.86,.04)); const [ra,rb,ry]=D.roof, belt=D.cabin[0][1];
    paint.push(box(ra-rb,.07,W*.84,(ra+rb)/2,ry+.03,0), box(.1,ry-belt,W*.88,(ra+rb)/2-.05,(ry+belt)/2,0), box(.14,.1,.2,D.cabin[0][0]-.2,belt+.08,hw+.12), box(.14,.1,.2,D.cabin[0][0]-.2,belt+.08,-hw-.12)); }
  else { glass.push(box(4.1,.46,.03,-.2,1.66,hw+.07),box(4.1,.46,.03,-.2,1.66,-hw-.07),box(.04,.62,W*.84,fx-.07,1.5,0,.14),box(.04,.5,W*.8,bx+.02,1.62,0));
    trim.push(box(4.7,.09,.02,0,1.08,hw+.075),box(4.7,.09,.02,0,1.08,-hw-.075),box(4.7,.09,.02,0,1.26,hw+.075),box(4.7,.09,.02,0,1.26,-hw-.075));
    paint.push(box(.14,.1,.22,fx-.25,1.25,hw+.14),box(.14,.1,.22,fx-.25,1.25,-hw-.14)); }
  trim.push(box(.14,.22,W*.96,fx,D.bumperY,0),box(.14,.22,W*.96,bx,D.bumperY,0),box(D.L*.78,.18,W*.8,0,D.r*.95,0),box(.05,.16,W*.46,fx+.03,D.bumperY+.22,0));
  head.push(box(.06,.12,.34,fx-.02,D.headY,hw-.24),box(.06,.12,.34,fx-.02,D.headY,-hw+.24));
  tail.push(box(.06,.14,.34,bx+.02,D.tailY,hw-.22),box(.06,.14,.34,bx+.02,D.tailY,-hw+.22));
  const r=D.r, tire=new THREE.CylinderGeometry(r,r,.24,22); tire.rotateX(Math.PI/2);
  const rimC=new THREE.CylinderGeometry(r*.62,r*.62,.25,16); rimC.rotateX(Math.PI/2);
  const rim=mergeList([rimC,...[0,1,2,3,4].map(i=>{ const g=new THREE.BoxGeometry(.045,r*1.12,.02); g.rotateZ(i*Math.PI*2/5); g.translate(0,0,.13); return g; })]);
  return carGeoCache[type]={paint:mergeList(paint),glass:mergeList(glass),trim:mergeList(trim),head:mergeList(head),tail:mergeList(tail),tire,rim}; }
const VT={danfo:{maxV:[10,14],name:'danfo'},keke:{maxV:[7,10],name:'keke'},okada:{maxV:[9,14],name:'okada'},bus:{maxV:[8,11],name:'BRT bus'},police:{maxV:[12,16],name:'police van'},sedan:{maxV:[11,15.5],name:'car'},suv:{maxV:[11,15],name:'car'}};
const polRed=new THREE.MeshBasicMaterial({color:new THREE.Color(3,.15,.1)}), polBlue=new THREE.MeshBasicMaterial({color:new THREE.Color(.15,.35,3)});
// ---- wheels: the models are one solid mesh, so the wheel (and bike fork/handlebar) triangles are cut out at load time
// and put on their own pivots so they can roll and steer.  r = tyre radius, hw = half tyre width (m)
const WHEEL={danfo:{r:.33,hw:.14},sedan:{r:.315,hw:.13},police:{r:.38,hw:.16},bus:{r:.5,hw:.18},keke:{r:.21,hw:.09,single:'front',bar:1},okada:{r:.31,hw:.08,single:'both',bike:1,bar:1}};
const SPLIT={};
function splitVehicle(type){ if(SPLIT[type]) return SPLIT[type]; const M=MODELS[type], cfg=WHEEL[type]; if(!cfg) return null;
  const geo=M.geo, P=geo.attributes.position, I=geo.index.array, n=P.count;
  const low=[]; for(let i=0;i<n;i++) if(P.getY(i)<Math.max(.045,M.H*.03)) low.push([P.getX(i),P.getZ(i)]);
  const grp={}; for(const [x,z] of low){ const f=x>0, single=cfg.single==='both'||(cfg.single==='front'&&f); if(single&&Math.abs(z)>cfg.hw) continue; const k=(f?'f':'r')+(single?'c':(z>0?'R':'L')); (grp[k]||(grp[k]=[])).push([x,z]); }
  const wheels=[]; for(const k in grp){ const pts=grp[k]; if(pts.length<3) continue;
    // contact patch = densest 5 cm bin along x (ignores stands, mud flaps, exhausts)
    const bins=new Map(); for(const p of pts){ const b=Math.round(p[0]/.05); bins.set(b,(bins.get(b)||0)+1); } let bb=0,bc=-1; for(const [b,c] of bins) if(c>bc){ bc=c; bb=b; }
    const near=pts.filter(p=>Math.abs(p[0]-bb*.05)<.22); let cx=near.reduce((s,p)=>s+p[0],0)/near.length; const cz=k[1]==='c'?0:near.reduce((s,p)=>s+p[1],0)/near.length;
    // radius from the tyre's outer edge at axle height (front tyres: front edge, rear tyres: back edge)
    let r=cfg.r; if(cfg.bike||k[1]==='c') for(let it=0;it<2;it++){ let ext=0; for(let i=0;i<n;i++){ const x=P.getX(i), y=P.getY(i), z=P.getZ(i); if(Math.abs(y-r)<.05&&Math.abs(z-cz)<cfg.hw&&Math.abs(x-cx)<r*1.5){ const e=k[0]==='f'?x-cx:cx-x; if(e>ext) ext=e; } } if(ext>0) r=clamp(ext,cfg.r*.75,cfg.r*1.3); }
    wheels.push({k,x:cx,y:r,z:cz,r,front:k[0]==='f'}); }
  for(const ax of ['f','r']){ const pair=wheels.filter(w=>w.k[0]===ax&&w.k[1]!=='c'); if(pair.length===2){ const mx=(pair[0].x+pair[1].x)/2, mz=(Math.abs(pair[0].z)+Math.abs(pair[1].z))/2; for(const w of pair){ w.x=mx; w.z=Math.sign(w.z)*mz; } } }
  const fw=wheels.find(w=>w.front&&w.k[1]==='c')||wheels.find(w=>w.front);
  // steering head for bikes / keke: axis from the front axle tilted back
  let head=null; if(cfg.bar&&fw){ head=cfg.bike?{x:fw.x-.31,y:1.0}:{x:fw.x-.1,y:.95}; }
  const parts=wheels.map(()=>[]), steer=[], body=[];
  const axDx=head?head.x-fw.x:0, axDy=head?head.y-fw.y:1, axL=Math.hypot(axDx,axDy);
  for(let t=0;t<I.length;t+=3){ const a=I[t],b=I[t+1],c=I[t+2]; const cx=(P.getX(a)+P.getX(b)+P.getX(c))/3, cy=(P.getY(a)+P.getY(b)+P.getY(c))/3, cz=(P.getZ(a)+P.getZ(b)+P.getZ(c))/3;
    let put=-1; for(let w=0;w<wheels.length;w++){ const W=wheels[w]; if(Math.abs(cz-W.z)<cfg.hw&&Math.hypot(cx-W.x,cy-W.y)<W.r*1.03){ put=w; break; } }
    if(put>=0){ parts[put].push(a,b,c); continue; }
    if(head){ // fork, mudguard, headlight and handlebar turn with the front wheel
      const px=cx-fw.x, py=cy-fw.y, tt=clamp((px*axDx+py*axDy)/(axL*axL),0,1.15), ddx=px-axDx*tt, ddy=py-axDy*tt, dl=Math.hypot(ddx,ddy);
      let st=false;
      if(cfg.bike){ st=(dl<.12&&Math.abs(cz)<.14&&cy<1.02)||(cy>.9&&cy<1.32&&cx>head.x-.32&&cx<head.x+.2&&Math.abs(cz)<.5)||(Math.hypot(cx-fw.x,cy-fw.y)<fw.r*1.3&&cy>fw.y&&Math.abs(cz)<.13)||(cx>head.x-.05&&cx<fw.x+.12&&cy>.66&&cy<.98&&Math.abs(cz)<.17); }
      else { st=(Math.hypot(cx-fw.x,cy-fw.y)<fw.r*1.35&&Math.abs(cz)<.16&&cy<fw.y+fw.r*1.4)||(cy>.92&&cy<1.18&&cx>fw.x-1.0&&cx<fw.x-.45&&Math.abs(cz)<.42&&cfg.bar===1&&type==='keke'&&false); }
      if(st){ steer.push(a,b,c); continue; } }
    body.push(a,b,c); }
  const sub=ix=>{ const g=new THREE.BufferGeometry(); for(const k in geo.attributes) g.setAttribute(k,geo.attributes[k]); g.setIndex(ix); g.computeBoundingSphere(); return g; };
  return SPLIT[type]={wheels:wheels.map((w,i)=>({...w,geo:sub(parts[i])})),steer:steer.length?sub(steer):null,head,fw,body:sub(body),axis:head?Math.atan2(-axDx,axDy):0}; }
// ---- who sits where (vehicle frame: +x forward, +z right, y up).  kind: seat pose
const SEATS={okada:[{x:-.12,y:.86,z:0,k:'bike',drv:1},{x:-.62,y:.92,z:0,k:'bike',p:.35}],
  keke:[{x:.28,y:.72,z:0,k:'seat',drv:1},{x:-.62,y:.7,z:-.28,k:'seat',p:.6},{x:-.62,y:.7,z:.28,k:'seat',p:.45}],
  danfo:[{x:1.3,y:1.0,z:-.44,k:'seat',drv:1},{x:1.3,y:1.0,z:.42,k:'seat',p:.6},{x:.3,y:1.0,z:-.45,k:'seat',p:.75},{x:.3,y:1.0,z:.1,k:'seat',p:.6},{x:-.6,y:1.0,z:-.45,k:'seat',p:.7},{x:-.6,y:1.0,z:.3,k:'seat',p:.6},{x:-1.5,y:1.0,z:-.2,k:'seat',p:.5},{x:.75,y:.28,z:1.02,k:'stand',p:.85,ry:-.35}],
  bus:[{x:4.4,y:1.15,z:-.75,k:'seat',drv:1},{x:2.6,y:1.15,z:.65,k:'seat',p:.6},{x:1.2,y:1.15,z:-.65,k:'seat',p:.6},{x:-.4,y:1.15,z:.65,k:'seat',p:.6},{x:-2.2,y:1.15,z:-.65,k:'seat',p:.5},{x:-3.6,y:1.15,z:.65,k:'seat',p:.5}],
  police:[{x:.42,y:.98,z:-.42,k:'seat',drv:1},{x:.42,y:.98,z:.42,k:'seat',p:.6},{x:-1.45,y:1.02,z:-.62,k:'bed',p:.85,ry:-Math.PI/2},{x:-1.45,y:1.02,z:.62,k:'bed',p:.85,ry:Math.PI/2}],
  sedan:[{x:.1,y:.62,z:-.38,k:'seat',drv:1},{x:.1,y:.62,z:.38,k:'seat',p:.35},{x:-.85,y:.62,z:0,k:'seat',p:.25}]};
const POLICE_TOP=paintCloth('#2d3b2a'), POLICE_BOT=paintCloth('#20261d');
function paintCloth(c){ return clothMat(c); }
function bakePose(h){ const sm=h.mesh; h.root.updateMatrixWorld(true); const g=sm.geometry, P=g.attributes.position, n=P.count, out=new Float32Array(n*3), v=new THREE.Vector3();
  for(let i=0;i<n;i++){ v.fromBufferAttribute(P,i); sm.applyBoneTransform(i,v); out[i*3]=v.x; out[i*3+1]=v.y; out[i*3+2]=v.z; }
  const ng=new THREE.BufferGeometry(); ng.setAttribute('position',new THREE.BufferAttribute(out,3)); ng.setAttribute('uv',g.attributes.uv); ng.setAttribute('color',g.attributes.color); ng.setIndex(g.index); ng.computeVertexNormals(); ng.computeBoundingSphere();
  const m=new THREE.Mesh(ng,HUMAN_MAT); m.receiveShadow=true; m.layers.set(1); h.root.remove(sm); h.root.add(m); h.mesh=m; return h; }
// seated people are baked once into a handful of looks per pose and then shared (fast loading, little memory)
const SEAT_LOOKS={}, SEAT_VARIANTS={seat:10,bike:6,stand:4,bed:4};
function seatLook(kind,police){ const key=kind+(police?'P':''), list=SEAT_LOOKS[key]||(SEAT_LOOKS[key]=[]), max=police?3:(SEAT_VARIANTS[kind]||6);
  if(list.length<max&&(list.length===0||MR()<.6)){ const h=police?makeHuman({f:false,skin:skinMat(mpick(SKINS)),top:POLICE_TOP,bottom:POLICE_BOT,shoe:clothMat('#141414'),hairM:clothMat('#141110')}):randomHuman();
    poseSeat(h,kind); bakePose(h); list.push(h.mesh.geometry); }
  return mpick(list); }
function seatHuman(seat,police){ const root=new THREE.Group(); root.rotation.order='YXZ'; const m=new THREE.Mesh(seatLook(seat.k,police),HUMAN_MAT); m.receiveShadow=true; m.castShadow=false; m.layers.set(1); root.add(m);
  root.rotation.y=Math.PI/2+(seat.ry||0); root.position.set(seat.x,seat.y-.86,seat.z); if(seat.k==='stand') root.position.y=seat.y; return {root,mesh:m}; }
function makeCar(type,color,empty=false){
  if(MODELS[type]){ const M=MODELS[type], S=splitVehicle(type), g=new THREE.Group(); g.rotation.order='YZX';
    const hi=new THREE.Group(), lo=new THREE.Group(); g.add(hi,lo); const mk=(geo,mat,par)=>{ const m=new THREE.Mesh(geo,mat); m.castShadow=true; m.receiveShadow=true; m.layers.set(1); par.add(m); return m; };
    const wheels=[]; let steerG=null;
    if(S){ mk(S.body,M.mat,hi);
      if(S.head){ steerG=new THREE.Group(); steerG.position.set(S.head.x,S.head.y,0); steerG.rotation.z=S.axis; hi.add(steerG); const inner=new THREE.Group(); steerG.add(inner); const frame=new THREE.Group(); frame.rotation.z=-S.axis; inner.add(frame);
        const fr2=new THREE.Group(); fr2.position.set(-S.head.x,-S.head.y,0); frame.add(fr2); if(S.steer) mk(S.steer,M.mat,fr2); steerG.userData.inner=inner; steerG.userData.frame=fr2; }
      for(const W of S.wheels){ const piv=new THREE.Group(); piv.position.set(W.x,W.y,W.z); const spin=new THREE.Group(); piv.add(spin); const m=mk(W.geo,M.mat,spin); m.position.set(-W.x,-W.y,-W.z);
        const onBar=steerG&&W===S.fw; if(onBar){ steerG.userData.frame.add(piv); } else hi.add(piv); wheels.push({piv,spin,front:W.front,bar:onBar,r:W.r}); } }
    else mk(M.geo,M.mat,hi);
    if(M.geo1) mk(M.geo1,M.mat1,lo); lo.visible=false;
    if(type==='police'){ for(const [mat,zz] of [[polRed,.3],[polBlue,-.3]]){ const b=new THREE.Mesh(new THREE.SphereGeometry(.1,10,8),mat); b.position.set(M.W*.04,M.H+.02,zz); b.layers.set(1); g.add(b); } }
    const occ=new THREE.Group(); hi.add(occ); const seats=[]; if(!empty) for(const st of SEATS[type]||[]){ if(!st.drv&&MR()>st.p) continue; const h=seatHuman(st,type==='police'); occ.add(h.root); seats.push({st,h}); }
    return {g,hi,lo,wheels,steerG,occ,seats,def:{L:M.W,W:M.D,H:M.H,r:(S&&S.wheels[0]?S.wheels[0].r:.35),maxV:VT[type].maxV},type}; }
  const D=CAR_T[type], G=carGeos(type), g=new THREE.Group(); g.rotation.order='YZX';
  const pm=paintMat(color,type==='danfo'?.15:.55);
  for(const [geo,mat] of [[G.paint,pm],[G.glass,CM.glass],[G.trim,CM.trim],[G.head,CM.head],[G.tail,CM.tail]]){ const m=new THREE.Mesh(geo,mat); m.castShadow=true; m.receiveShadow=true; m.layers.set(1); g.add(m); }
  const wheels=[]; for(const sx of [1,-1]) for(const sz of [1,-1]){ const piv=new THREE.Group(); piv.position.set(sx*D.base,D.r,sz*(D.W/2+.02)); const spin=new THREE.Group(); if(sz<0) spin.scale.z=-1; piv.add(spin);
    for(const [geo,mat] of [[G.tire,CM.tire],[G.rim,CM.chrome]]){ const m=new THREE.Mesh(geo,mat); m.castShadow=true; m.layers.set(1); spin.add(m); } g.add(piv); wheels.push({piv,spin,front:sx>0}); }
  return {g,wheels,def:D,type}; }
const CAR_COLORS=['#111214','#f1f1ee','#8d939a','#1d3557','#7a0f12','#2b4b3a','#c4c8cc','#3a2a1e','#0f4c81','#b0b6bb'];
const vehicles=[];
function newVehicle(type,color,empty=false){ if(!MODELS[type]) type=({keke:'sedan',okada:'sedan',bus:'suv',police:'suv',sedan:'sedan'})[type]||type; const c=makeCar(type,color,empty); scene.add(c.g); const v={c,type,x:0,z:0,y:0,h:0,speed:0,ai:null,parked:true,bob:0,bobV:0,pitch:0,steerVis:0,lastH:0,lean:0,phCool:0}; vehicles.push(v); return v; }
function laneOff(a,b){ const e=edgeOf(a.i,b.i); if(!e) return 1.5; if(e.ow) return e.w>=8?e.w*.2:0; return e.hw>=10?4.6:e.hw*.45; }
function lineSeg(ia,ib){ const a=nodes[ia],b=nodes[ib],dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz)||.1,fx=dx/L,fz=dz/L,rx=-fz,rz=fx,off=laneOff(a,b),sa=Math.min(a.deg>=3?a.r+1.2:1.2,L*.45),sb=Math.min(b.deg>=3?b.r+1.2:1.2,L*.45);
  const p0={x:a.x+fx*sa+rx*off,z:a.z+fz*sa+rz*off}, p2={x:b.x-fx*sb+rx*off,z:b.z-fz*sb+rz*off}; return {k:0,p0,p2,len:Math.max(.1,Math.hypot(p2.x-p0.x,p2.z-p0.z)),fx,fz,rx,rz,off}; }
function turnSeg(ia,ib,ic){ const s1=lineSeg(ia,ib), s2=lineSeg(ib,ic), b=nodes[ib], P0=s1.p2, P2=s2.p0, dot=s1.fx*s2.fx+s1.fz*s2.fz; let C;
  if(dot>.9) C={x:(P0.x+P2.x)/2,z:(P0.z+P2.z)/2};
  else if(dot<-.9){ const k=s1.off*2+6; C={x:(P0.x+P2.x)/2+s1.fx*k,z:(P0.z+P2.z)/2+s1.fz*k}; }
  else C={x:b.x+s1.rx*s1.off+s2.rx*s2.off,z:b.z+s1.rz*s1.off+s2.rz*s2.off};
  let len=0,px=P0.x,pz=P0.z; for(let i=1;i<=12;i++){ const t=i/12,u=1-t,x=u*u*P0.x+2*u*t*C.x+t*t*P2.x,z=u*u*P0.z+2*u*t*C.z+t*t*P2.z; len+=Math.hypot(x-px,z-pz); px=x; pz=z; }
  return {k:1,p0:P0,p1:C,p2:P2,len:Math.max(.1,len),node:ib,vmax:dot>.96?99:dot>.7?11:dot>0?7.5:5.5}; }
function segPos(sg,s,o){ const t=clamp(s/sg.len,0,1);
  if(sg.k===0){ o.x=sg.p0.x+(sg.p2.x-sg.p0.x)*t; o.z=sg.p0.z+(sg.p2.z-sg.p0.z)*t; o.dx=sg.fx; o.dz=sg.fz; }
  else { const u=1-t; o.x=u*u*sg.p0.x+2*u*t*sg.p1.x+t*t*sg.p2.x; o.z=u*u*sg.p0.z+2*u*t*sg.p1.z+t*t*sg.p2.z; o.dx=2*u*(sg.p1.x-sg.p0.x)+2*t*(sg.p2.x-sg.p1.x); o.dz=2*u*(sg.p1.z-sg.p0.z)+2*t*(sg.p2.z-sg.p1.z); if(Math.abs(o.dx)+Math.abs(o.dz)<1e-6){ o.dx=1; o.dz=0; } }
  return o; }
const _sp={x:0,z:0,dx:1,dz:0};
// traffic keeps mostly to the big roads: a car is put on a drivable street near the player, busier roads more often
const carRoad=e=>e.drive&&(e.c<=4||MR()<.35)&&(v_big(e));
function v_big(e){ return e.len>=10; }
function placeCar(v,dmin,dmax,toward=false,at=null){ const CF=toward?(at?fieldTo(driveNode(at.x,at.z)):mode!=='drive'?goalField(chaseGoal()):chaseField()):null, O=at||player;   // toward: facing the way that leads to you (or to 'at')
  for(let t=0;t<50;t++){ const e=streetNear(O.x,O.z,dmin,dmax,carRoad); if(!e) continue; if(CF&&e.ow&&CF[e.b]>CF[e.a]&&t<40) continue;
  const rev=e.ow?false:CF?CF[e.a]<CF[e.b]:MR()<.5, a=rev?e.b:e.a, b=rev?e.a:e.b;
  const seg=lineSeg(a,b); if(seg.len<6) continue; const s=mrr(0,seg.len); segPos(seg,s,_sp);
  const d=Math.hypot(_sp.x-O.x,_sp.z-O.z); if(d<dmin||d>dmax) continue; if(CF&&t<40&&(CF[b]>Math.max(220,d*2.5+80)||d<90&&(O.x-_sp.x)*_sp.dx+(O.z-_sp.z)*_sp.dz<0)) continue;   // a street that really leads to you, not one that goes the long way round
  let clash=false; for(const o of vehicles) if(o!==v&&Math.hypot(o.x-_sp.x,o.z-_sp.z)<11){ clash=true; break; } if(clash) continue;
  if((v.type==='bus')&&e.c>4) continue;   // big buses stay on the main roads
  const D=v.c.def; v.ai={a,b,s,seg,na:-1,maxV:mrr(D.maxV[0],D.maxV[1]),wait:0,ghost:0,stuck:0,cond:e.cond,ec:e.c}; v.parked=false; v.x=_sp.x; v.z=_sp.z; v.h=Math.atan2(-_sp.dz,_sp.dx); v.speed=v.ai.maxV*.6; v.y=groundY(v.x,v.z); return true; } return false; }
// parked by the kerb: a spot on the street edge near (x,z), the vehicle along the street
function kerbSpot(x,z,len,filter=e=>e.c>=4&&e.c<9){ const [e]=nearestRoad(x,z,filter); if(!e) return null; const A0=nodes[e.a], t=clamp((x-A0.x)*e.fx+(z-A0.z)*e.fz,A0.r+len/2+1,e.len-nodes[e.b].r-len/2-1);
  if(e.len<A0.r+nodes[e.b].r+len+2) return null; const sd=((x-A0.x)*-e.fz+(z-A0.z)*e.fx)>=0?1:-1, o=e.hw-1.05;
  return {x:A0.x+e.fx*t-e.fz*o*sd,z:A0.z+e.fz*t+e.fx*o*sd,h:Math.atan2(-e.fz,e.fx)+(sd<0?Math.PI:0)}; }
const myCar=newVehicle('okada','#b3261e',true); { const k=kerbSpot(APT.front.x+APT.nx*1.5,APT.front.z+APT.nz*1.5,2.2); Object.assign(myCar,k?{x:k.x,z:k.z,h:k.h}:{x:APT.front.x+3,z:APT.front.z,h:0},{y:0,keep:1}); }
{ const rx=-APT.nz, rz=APT.nx, sx=-Math.cos(STATION.front.ry), sz=Math.sin(STATION.front.ry);
  const spots=[['keke',APT.front.x+rx*14+APT.nx*2,APT.front.z+rz*14+APT.nz*2],['sedan',APT.front.x-rx*16+APT.nx*2,APT.front.z-rz*16+APT.nz*2],['police',STATION.front.x+sx*7,STATION.front.z+sz*7],['police',STATION.front.x-sx*7,STATION.front.z-sz*7]];
  if(HOTEL_SITE) spots.push(['sedan',HOTEL_SITE.door.x+4,HOTEL_SITE.door.z]);
  for(const [type,x,z] of spots){ const k=kerbSpot(x,z,type==='bus'?11:5,e=>e.c<9); if(!k) continue; let clash=false; for(const o of vehicles) if(Math.hypot(o.x-k.x,o.z-k.z)<6) clash=true; if(clash) continue; const v=newVehicle(type,'#f2b705',true); Object.assign(v,{x:k.x,z:k.z,h:k.h,y:0,keep:1}); } }
for(let i=0;i<Q.cars;i++){ const r=MR(), type=r<.27?'danfo':r<.47?'keke':r<.67?'okada':r<.85?'sedan':r<.93?'police':'bus'; const v=newVehicle(type,type==='danfo'?'#f2b705':mpick(CAR_COLORS)); if(!placeCar(v,12,260)) placeCar(v,0,3000); }
const drive={v:null,speed:0,steer:0};
const headSpot={intensity:0,position:new THREE.Vector3(),visible:true}, headTgt={position:new THREE.Vector3()};
// headlight beam: a soft glowing cone on the road in front of your vehicle (a real spot light cost every pixel on screen)
const BEAM=(()=>{ const [c,g]=cv(128,256); g.filter='blur(10px)'; const gr=g.createLinearGradient(0,256,0,0); gr.addColorStop(0,'rgba(255,240,215,1)'); gr.addColorStop(.55,'rgba(255,236,205,.55)'); gr.addColorStop(1,'rgba(255,230,200,0)');
  g.fillStyle=gr; g.beginPath(); g.moveTo(52,252); g.lineTo(76,252); g.lineTo(122,14); g.lineTo(6,14); g.closePath(); g.fill(); g.filter='none';
  const m=new THREE.Mesh(new THREE.PlaneGeometry(9,18),new THREE.MeshBasicMaterial({map:tx(c,true,false),color:0xfff0d0,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-8,polygonOffsetUnits:-8}));
  m.rotation.order='YXZ'; m.renderOrder=3; m.visible=false; m.frustumCulled=false; scene.add(m); return m; })();

/* ================= interior ================= */
await step('Furnishing your room…', 88);
function buildInterior(){
  const S=new THREE.Scene(); S.background=new THREE.Color(0x14100d); S.fog=new THREE.FogExp2(0x14100d,.0001);
  const envRT=pmrem.fromScene(new RoomEnvironment(),.04); S.environment=envRT.texture; S.environmentIntensity=.35;
  S.add(new THREE.HemisphereLight(0xfff0dc,0x2a1d14,.55));
  const pl=new THREE.PointLight(0xffd2a0,26,16,1.6); pl.position.set(0,2.72,.4); pl.castShadow=false; S.add(pl);
  const pl2=new THREE.PointLight(0xffc68a,10,9,1.6); pl2.position.set(-4.2,2.5,-2.8); S.add(pl2);
  const spot=new THREE.SpotLight(0xffb06a,70,24,.65,.6,1.3); spot.position.set(1.8,2.6,-7.5); spot.target.position.set(-.5,0,1.5); spot.castShadow=true; spot.shadow.mapSize.set(1024,1024); spot.shadow.camera.layers.enable(1); S.add(spot,spot.target);
  const add=(geo,mat,x,y,z,ry=0,cast=true)=>{ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); m.rotation.y=ry; m.castShadow=cast; m.receiveShadow=true; S.add(m); return m; };
  const cols=[], solid=(x0,x1,z0,z1)=>cols.push({x0,x1,z0,z1,h:3});
  const [wc,wg]=cv(512,512); wg.fillStyle='#6b4a32'; wg.fillRect(0,0,512,512);
  for(let y=0;y<512;y+=32) for(let x=-ri(0,200);x<512;){ const w=ri(150,260); wg.fillStyle=`hsl(${ri(20,30)},${ri(35,48)}%,${ri(25,36)}%)`; wg.fillRect(x+1,y+1,w-2,30); x+=w; }
  grain(wg,512,512,14); for(let i=0;i<300;i++){ wg.fillStyle='rgba(0,0,0,.05)'; wg.fillRect(rr(0,512),rr(0,512),rr(30,120),1); }
  const woodT=tx(wc); woodT.repeat.set(3,2.5);
  const floorM=new THREE.MeshStandardMaterial({map:woodT,roughness:.4}), wallM=new THREE.MeshStandardMaterial({color:0xece4d6,roughness:.92}), accentM=new THREE.MeshStandardMaterial({color:0x1f3d3a,roughness:.85}), ceilM=new THREE.MeshStandardMaterial({color:0xf6f2ea,roughness:.95});
  const W=12,D=10,H=3.2;
  add(new THREE.PlaneGeometry(W,D).rotateX(-Math.PI/2),floorM,0,0,0,0,false);
  add(new THREE.PlaneGeometry(W,D).rotateX(Math.PI/2),ceilM,0,H,0,0,false);
  add(new THREE.PlaneGeometry(W,H),wallM,0,H/2,-D/2,0,false); add(new THREE.PlaneGeometry(W,H),wallM,0,H/2,D/2,Math.PI,false);
  add(new THREE.PlaneGeometry(D,H),accentM,-W/2,H/2,0,Math.PI/2,false); add(new THREE.PlaneGeometry(D,H),wallM,W/2,H/2,0,-Math.PI/2,false);
  const baseM=new THREE.MeshStandardMaterial({color:0x2e2018,roughness:.6});
  add(new THREE.BoxGeometry(W,.12,.03),baseM,0,.06,-D/2+.02,0,false); add(new THREE.BoxGeometry(W,.12,.03),baseM,0,.06,D/2-.02,0,false);
  add(new THREE.BoxGeometry(.03,.12,D),baseM,-W/2+.02,.06,0,0,false); add(new THREE.BoxGeometry(.03,.12,D),baseM,W/2-.02,.06,0,0,false);
  // window with a golden-hour view of the city
  const [vc,vg]=cv(1024,460); const skg=vg.createLinearGradient(0,0,0,460); skg.addColorStop(0,'#2c4a6e'); skg.addColorStop(.55,'#e89a5c'); skg.addColorStop(1,'#f6c27a'); vg.fillStyle=skg; vg.fillRect(0,0,1024,460);
  vg.fillStyle='rgba(255,220,160,.95)'; vg.beginPath(); vg.arc(760,300,34,0,7); vg.fill();
  for(let i=0;i<48;i++){ const w=rr(18,64), h=rr(60,280), x=rr(-20,1024); vg.fillStyle=`rgb(${ri(30,55)},${ri(32,50)},${ri(45,66)})`; vg.fillRect(x,460-h,w,h);
    for(let k=0;k<h/14;k++) for(let j=0;j<w/10-1;j++) if(R()<.22){ vg.fillStyle='rgba(255,210,140,.85)'; vg.fillRect(x+3+j*10,460-h+6+k*14,4,6); } }
  vg.fillStyle='#1d3c4c'; vg.fillRect(0,425,1024,35);
  add(new THREE.PlaneGeometry(4.4,2.0),new THREE.MeshBasicMaterial({map:tx(vc,true,false),color:new THREE.Color(1.25,1.18,1.1)}),1.6,1.7,-D/2+.02,0,false);
  const frameM=new THREE.MeshStandardMaterial({color:0x2a2d31,metalness:.6,roughness:.4});
  for(const [w,h,x,y] of [[4.6,.1,1.6,2.75],[4.6,.1,1.6,.65],[.1,2.1,-.65,1.7],[.1,2.1,3.85,1.7],[.06,2.0,1.6,1.7]]) add(new THREE.BoxGeometry(w,h,.08),frameM,x,y,-D/2+.05,0,false);
  add(new THREE.BoxGeometry(4.7,.06,.3),new THREE.MeshStandardMaterial({color:0xf1ece2,roughness:.6}),1.6,.62,-D/2+.15,0,false);
  const curtM=new THREE.MeshStandardMaterial({color:0xc8b08a,roughness:.95});
  add(new THREE.BoxGeometry(.7,2.7,.12),curtM,-1.05,1.75,-D/2+.18,0,false); add(new THREE.BoxGeometry(.7,2.7,.12),curtM,4.25,1.75,-D/2+.18,0,false);
  // door
  add(new THREE.BoxGeometry(1.1,2.25,.06),new THREE.MeshStandardMaterial({color:0x4a2e1c,roughness:.45}),0,1.125,D/2-.04,0,false);
  for(const [w,h,x,y] of [[1.3,.1,0,2.3],[.1,2.3,-.62,1.15],[.1,2.3,.62,1.15]]) add(new THREE.BoxGeometry(w,h,.1),baseM,x,y,D/2-.05,0,false);
  add(new THREE.SphereGeometry(.04,10,8),CM.chrome,.42,1.05,D/2-.1,0,false);
  add(new THREE.BoxGeometry(1.1,.015,.6),new THREE.MeshStandardMaterial({color:0x5a4632,roughness:1}),0,.008,D/2-.5,0,false);
  // living area
  const rugT=texAnkara(ANKP[0]); rugT.repeat.set(2,2.6);
  add(new THREE.PlaneGeometry(3.2,4.2).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({map:rugT,roughness:1}),-2.7,.01,.2,0,false);
  const fab=new THREE.MeshStandardMaterial({color:0x4b4f57,roughness:.95});
  add(new THREE.BoxGeometry(1.0,.42,3.1),fab,-.95,.21,.2); add(new THREE.BoxGeometry(.24,.62,3.1),fab,-.42,.58,.2);
  add(new THREE.BoxGeometry(1.0,.6,.22),fab,-.95,.3,-1.45); add(new THREE.BoxGeometry(1.0,.6,.22),fab,-.95,.3,1.85);
  for(const z of [-.7,.2,1.1]) add(new THREE.BoxGeometry(.8,.12,.85),fab,-1.0,.48,z);
  [[-.62,.8,-.6,1],[-.62,.8,.5,3],[-.62,.8,1.3,5]].forEach(([x,y,z,i])=>{ const m=add(new THREE.BoxGeometry(.14,.42,.5),ankMat(i),x,y,z); m.rotation.z=.18; });
  solid(-1.5,-.3,-1.6,2.0);
  const woodM=new THREE.MeshStandardMaterial({color:0x5b3a24,roughness:.4});
  add(new THREE.BoxGeometry(.8,.06,1.4),woodM,-2.7,.42,.2); for(const [x,z] of [[-3.0,-.4],[-3.0,.8],[-2.4,-.4],[-2.4,.8]]) add(new THREE.CylinderGeometry(.03,.03,.4,8),woodM,x,.2,z);
  add(new THREE.CylinderGeometry(.11,.09,.22,16),new THREE.MeshStandardMaterial({color:0xd9cbb3,roughness:.35}),-2.7,.56,.6); solid(-3.15,-2.25,-.55,.95);
  add(new THREE.BoxGeometry(.5,.5,2.6),new THREE.MeshStandardMaterial({color:0x2a211b,roughness:.5}),-5.72,.25,.2); solid(-6,-5.45,-1.1,1.5);
  add(new THREE.BoxGeometry(.07,1.15,2.0),new THREE.MeshStandardMaterial({color:0x0b0b0b,roughness:.3,metalness:.4}),-5.9,1.55,.2);
  const [tc,tg]=cv(640,360); const tgr=tg.createLinearGradient(0,0,640,360); tgr.addColorStop(0,'#0f6e78'); tgr.addColorStop(1,'#16a06b'); tg.fillStyle=tgr; tg.fillRect(0,0,640,360);
  tg.textAlign='center'; tg.fillStyle='#F2B705'; tg.font="64px Bungee, Impact, 'Arial Black', sans-serif"; tg.fillText('NAIJA STREETS',320,150); tg.fillStyle='#fff'; tg.font='700 30px "Barlow Semi Condensed", "Arial Narrow", sans-serif'; tg.fillText('LIVE · Third Mainland traffic is moving small small',320,210);
  tg.fillStyle='rgba(0,0,0,.45)'; tg.fillRect(0,296,640,64); tg.fillStyle='#fff'; tg.font='600 26px "Barlow Semi Condensed", "Arial Narrow", sans-serif'; tg.textAlign='left'; tg.fillText('BREAKING: Jollof Friday confirmed at Ladipo Market',20,338);
  add(new THREE.PlaneGeometry(1.9,1.07),new THREE.MeshBasicMaterial({map:tx(tc,true,false),color:new THREE.Color(1.3,1.3,1.3)}),-5.86,1.55,.2,Math.PI/2,false);
  // dining
  add(new THREE.BoxGeometry(1.7,.06,.95),woodM,3.1,.76,2.4); for(const [x,z] of [[2.35,2.0],[3.85,2.0],[2.35,2.8],[3.85,2.8]]) add(new THREE.BoxGeometry(.06,.73,.06),woodM,x,.365,z); solid(2.2,4.0,1.85,2.95);
  for(const [x,z,ry] of [[2.6,1.6,0],[3.6,1.6,0],[2.6,3.2,Math.PI],[3.6,3.2,Math.PI]]){ const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=ry;
    const s=new THREE.Mesh(new THREE.BoxGeometry(.45,.05,.45),woodM); s.position.y=.46; const bk=new THREE.Mesh(new THREE.BoxGeometry(.45,.5,.05),woodM); bk.position.set(0,.72,-.2); g.add(s,bk);
    for(const [lx,lz] of [[-.19,-.19],[.19,-.19],[-.19,.19],[.19,.19]]){ const l=new THREE.Mesh(new THREE.BoxGeometry(.04,.46,.04),woodM); l.position.set(lx,.23,lz); g.add(l); }
    g.traverse(o=>{ if(o.isMesh){ o.castShadow=o.receiveShadow=true; } }); S.add(g); solid(x-.25,x+.25,z-.25,z+.25); }
  // wardrobe against the back wall: one door with an ankara panel, one with a long mirror
  { const wx=-3.6, wz=-D/2+.31, darkW=new THREE.MeshStandardMaterial({color:0x3a2416,roughness:.45}), doorW=new THREE.MeshStandardMaterial({color:0x6a4429,roughness:.38});
    add(new THREE.BoxGeometry(2.0,2.25,.6),darkW,wx,1.125,wz); add(new THREE.BoxGeometry(2.12,.08,.68),darkW,wx,2.29,wz+.02);
    for(const s of [-1,1]){ add(new THREE.BoxGeometry(.96,2.06,.04),doorW,wx+s*.495,1.15,wz+.31,0,false);
      add(new THREE.CylinderGeometry(.014,.014,.3,8),CM.chrome,wx+s*.07,1.15,wz+.35,0,false); }
    add(new THREE.PlaneGeometry(.7,1.55),ankMat(2),wx-.495,1.2,wz+.335,0,false);
    add(new THREE.PlaneGeometry(.7,1.7),new THREE.MeshStandardMaterial({color:0xdde4e8,metalness:1,roughness:.05}),wx+.495,1.2,wz+.335,0,false);
    solid(wx-1.05,wx+1.05,-D/2,wz+.36); }
  // standing AC, plant, shelf, art
  add(new THREE.BoxGeometry(.55,1.75,.34),new THREE.MeshStandardMaterial({color:0xf4f4f2,roughness:.5}),5.45,.875,-4.6);
  const ventM=new THREE.MeshStandardMaterial({color:0x9a9a98}); for(let i=0;i<6;i++) add(new THREE.BoxGeometry(.42,.02,.02),ventM,5.45,1.25+i*.06,-4.42,0,false);
  add(new THREE.BoxGeometry(.06,.03,.01),new THREE.MeshStandardMaterial({color:0x000000,emissive:0x33ccff,emissiveIntensity:3}),5.45,1.62,-4.42,0,false); solid(5.1,5.8,-4.9,-4.3);
  add(new THREE.CylinderGeometry(.28,.22,.5,16),new THREE.MeshStandardMaterial({color:0xb8573a,roughness:.7}),5.2,.25,4.2);
  const leafM=new THREE.MeshStandardMaterial({color:0x2f6b3a,roughness:.8,flatShading:true}); for(let i=0;i<6;i++) add(new THREE.IcosahedronGeometry(rr(.25,.4),0),leafM,5.2+rr(-.2,.2),.72+i*.17,4.2+rr(-.2,.2)); solid(4.9,5.5,3.9,4.5);
  add(new THREE.BoxGeometry(1.8,.04,.3),woodM,-3.2,1.2,D/2-.17); add(new THREE.BoxGeometry(1.8,.04,.3),woodM,-3.2,1.75,D/2-.17);
  for(const sy of [1.22,1.77]) for(let i=0;i<10;i++){ const h=rr(.2,.3); add(new THREE.BoxGeometry(.07,h,.2),clothMat(mpick(['#a3262a','#22396b','#2f6b45','#e0b100','#f4f1ea','#1b1b1f'])),-3.95+i*.15,sy+h/2,D/2-.2); }
  const artT=texAnkara(ANKP[4]); artT.repeat.set(1,1);
  add(new THREE.BoxGeometry(.04,1.27,1.92),new THREE.MeshStandardMaterial({color:0x1a1a1a}),W/2-.03,1.75,-.6,0,false);
  add(new THREE.PlaneGeometry(1.8,1.15),new THREE.MeshStandardMaterial({map:artT,roughness:.7}),W/2-.06,1.75,-.6,-Math.PI/2,false);
  add(new THREE.CylinderGeometry(.35,.35,.04,24),new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffe2b8,emissiveIntensity:2.2}),-3.2,3.17,-2.6,0,false);
  const fan=new THREE.Group(); fan.position.set(0,3.0,.4); const fm=new THREE.MeshStandardMaterial({color:0xe9e5dd,roughness:.5});
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.12,16),fm); const rod=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,.2,8),fm); rod.position.y=.15; fan.add(hub,rod);
  const blades=new THREE.Group(); for(let i=0;i<3;i++){ const b=new THREE.Mesh(new THREE.BoxGeometry(1.15,.02,.17),woodM); b.position.x=.65; const p=new THREE.Group(); p.rotation.y=i*Math.PI*2/3; p.add(b); blades.add(p); }
  fan.add(blades); fan.traverse(o=>{ if(o.isMesh) o.castShadow=true; }); S.add(fan);
  { const byMat=new Map(), drop=[]; S.updateMatrixWorld(true);
    S.traverse(o=>{ if(!o.isMesh||o.parent===null) return; let p=o; while(p){ if(p===fan) return; p=p.parent; } const k=o.material.uuid; if(!byMat.has(k)) byMat.set(k,{mat:o.material,cast:false,list:[]}); const e=byMat.get(k); e.cast=e.cast||o.castShadow;
      const g=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()); for(const a of Object.keys(g.attributes)) if(!['position','normal','uv'].includes(a)) g.deleteAttribute(a); if(!g.attributes.uv) g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2)); g.applyMatrix4(o.matrixWorld); e.list.push(g); drop.push(o); });
    for(const o of drop) o.parent.remove(o);
    for(const e of byMat.values()){ const m=new THREE.Mesh(mergeGeometries(e.list,false),e.mat); m.castShadow=e.cast; m.receiveShadow=true; S.add(m); } }
  return {scene:S,cols,fan:blades,exit:{x:0,z:4.3},ward:{x:-3.6,z:-3.75}};
}
const INT=buildInterior();
// rooms you can be inside: your flat and the hotel lounge share the same walking, camera and exit code
Object.assign(INT,{bounds:{x0:-5.6,x1:5.6,z0:-4.6,z1:4.6},cam:{x0:-5.75,x1:5.75,z0:-4.75,z1:4.75,y0:.5,y1:3},label:'Your room · Mushin',camDist:2.7,
  out:()=>({x:APT.front.x+APT.nx*.8,z:APT.front.z+APT.nz*.8,ry:APT.ry}),update:dt=>{ if(INT.fan) INT.fan.rotation.y+=dt*4; }});
let ROOM=INT;
/* ================= your home, built in Blender (assets/models/room.glb) =================
   The inside of your house is the flat made in Blender (sitting room, dining, kitchen, bathroom, hallway and your bedroom),
   exported as glTF. The game finds what it needs by the object names: the front door (Front_Door; else Door) is the way in
   and out, a wardrobe (Wardrobe…) is where you change clothes, window glass (Window_Glass…) shows the street and lets the
   sun in, each ceiling lamp (Ceiling_Lamp…) and the bedside Lamp_Shade light their room, walls (Wall…) stop you and the
   camera. Wood, tiles and granite are pictures mapped by material name (TEXMAP). Walls missing on a side are added.
   Until the file is in (or if it cannot load), the old built-in flat is used. */
const MYROOM={ready:false,loading:null};
const texUrl=f=>{ const u=`assets/models/${f}`, k=AV[u]||MANIFEST[u]; return k?u+'?v='+k:u; };
const WOOD_T=2*Math.PI*19/60;
const TEXMAP={'Oak Floor':['wood_oak.jpg',WOOD_T,.4],'Walnut':['wood_walnut.jpg',WOOD_T,.45],'Floor Tile':['tile_floor.jpg',1.2,.22],'Bath Tile':['tile_bath.jpg',.6,.15],
  'Bath Floor':['tile_bathfloor.jpg',.6,.5],'Kitchen Tile':['tile_kitchen.jpg',.6,.12],'Granite':['granite.jpg',1,.25]};
function loadMyRoom(){ if(MYROOM.loading) return MYROOM.loading;
  const u=murl('room'); DL.exp[u]=MANIFEST['assets/models/room.glb']||560000;
  const tl=new THREE.TextureLoader(), tex=f=>tl.loadAsync(texUrl(f)).then(t=>{ t.colorSpace=THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=Math.min(8,maxAniso); return t; }).catch(()=>null);
  MYROOM.loading=fetchBuf(u).then(b=>GLL.parseAsync(b,'')).then(async g=>{ const used=new Set(); g.scene.traverse(o=>{ if(o.isMesh&&o.material) used.add(o.material.name); });
      const names=Object.keys(TEXMAP).filter(n=>used.has(n)), tx=await Promise.all(names.map(n=>tex(TEXMAP[n][0]))), texs={}; names.forEach((n,i)=>{ if(tx[i]) texs[n]=tx[i]; });
      buildMyRoom(g,texs); MYROOM.ready=true; })
    .catch(e=>{ console.warn('room.glb could not load; the built-in room stays',e); MYROOM.failed=true; });
  return MYROOM.loading; }
// a Lagos view for the windows: sky, low roofs, zinc and palms (one picture shared by all windows)
let LAGOS_VIEW=null;
function lagosView(){ if(LAGOS_VIEW) return LAGOS_VIEW; const [c,g]=cv(1024,512), sk=g.createLinearGradient(0,0,0,512); sk.addColorStop(0,'#7fb3e0'); sk.addColorStop(.6,'#cfe2ef'); sk.addColorStop(1,'#f1e6cf'); g.fillStyle=sk; g.fillRect(0,0,1024,512);
  const rnd=seeded(5); for(let i=0;i<70;i++){ const w=40+rnd()*110, h=60+rnd()*150, x=rnd()*1080-40, y=512-h*(.55+rnd()*.45);
    g.fillStyle=`hsl(${20+rnd()*30},${20+rnd()*25}%,${62+rnd()*18}%)`; g.fillRect(x,y,w,512-y);
    g.fillStyle=`hsl(${15+rnd()*20},${18+rnd()*20}%,${30+rnd()*25}%)`; g.beginPath(); g.moveTo(x-6,y); g.lineTo(x+w/2,y-14-rnd()*12); g.lineTo(x+w+6,y); g.fill();   // zinc roof
    g.fillStyle='rgba(40,48,58,.55)'; for(let k=0;k<3;k++) g.fillRect(x+8+k*(w/3),y+16,Math.max(6,w/6),18); }
  g.strokeStyle='#4b3a2a'; g.lineWidth=5; for(let i=0;i<5;i++){ const x=80+rnd()*880, b=512, t=200+rnd()*90; g.beginPath(); g.moveTo(x,b); g.quadraticCurveTo(x+10,(b+t)/2,x+4,t); g.stroke();
    g.fillStyle='#2f5a2a'; for(let k=0;k<7;k++){ const a=k/7*Math.PI*2; g.beginPath(); g.ellipse(x+4+Math.cos(a)*30,t+Math.sin(a)*10,34,7,a,0,7); g.fill(); } }
  g.strokeStyle='rgba(30,30,30,.6)'; g.lineWidth=2; g.beginPath(); g.moveTo(0,250); g.quadraticCurveTo(512,290,1024,240); g.stroke();   // power line
  return LAGOS_VIEW=tx(c,true,false); }
function buildMyRoom(g,texs){ const S=new THREE.Scene(); S.background=new THREE.Color(0x1a1714);
  const envRT=pmrem.fromScene(new RoomEnvironment(),.04); S.environment=envRT.texture; S.environmentIntensity=.45;
  const root=g.scene; root.updateMatrixWorld(true);
  const nameOf=o=>{ for(let q=o;q&&q!==root;q=q.parent) if(q.name&&!/^mesh_\d+(_\d+)?$/.test(q.name)) return q.name; return ''; };   // packed files keep the names on the parent node
  const parts=[]; root.traverse(o=>{ if(!o.isMesh) return; const n=nameOf(o); const geo=floatGeo(o.geometry.clone()); geo.applyMatrix4(o.matrixWorld); geo.computeBoundingBox();
    parts.push({name:n||'',geo,mat:o.material,bb:geo.boundingBox.clone()}); });
  const named=re=>parts.filter(p=>re.test(p.name)), boxOf=list=>{ const b=new THREE.Box3(); for(const p of list) b.union(p.bb); return b; };
  const floors=named(/^Floor(?!_?Lamp)/i), floorB=floors.length?boxOf(floors):boxOf(parts), x0=floorB.min.x, x1=floorB.max.x, z0=floorB.min.z, z1=floorB.max.z, cx=(x0+x1)/2, cz=(z0+z1)/2;
  const ceilB=boxOf(named(/^Ceiling(_[A-Z]$|$)/i)), H=ceilB.isEmpty()?3:ceilB.min.y;
  const matBy=name=>{ const p=parts.find(q=>q.mat&&q.mat.name===name); return p?p.mat:null; };
  // a side without a wall gets one (plaster, like the others)
  const walls=named(/^Wall/i), plaster=matBy('Wall Plaster')||new THREE.MeshStandardMaterial({color:0xd1c7b3,roughness:.85});
  for(const [ax,v,out] of [['x',x0,-1],['x',x1,1],['z',z0,-1],['z',z1,1]]){
    const has=walls.some(w=>ax==='x'?(out<0?w.bb.max.x<=v+.06&&w.bb.max.x>=v-.25:w.bb.min.x>=v-.06&&w.bb.min.x<=v+.25):(out<0?w.bb.max.z<=v+.06&&w.bb.max.z>=v-.25:w.bb.min.z>=v-.06&&w.bb.min.z<=v+.25));
    if(has) continue; const t=.15, geo=ax==='x'?new THREE.BoxGeometry(t,H,z1-z0):new THREE.BoxGeometry(x1-x0,H,t);
    geo.translate(ax==='x'?v+out*t/2:cx,H/2,ax==='x'?cz:v+out*t/2); geo.computeBoundingBox(); parts.push({name:'Wall_Added',geo,mat:plaster,bb:geo.boundingBox.clone()}); }
  // wood, tiles, granite: a picture mapped on each face by its direction (TEXMAP: file, metres per picture, roughness)
  const texMats={};
  for(const p of parts){ const nm=p.mat&&p.mat.name, tex=nm&&texs[nm]; if(!tex) continue; const rep=TEXMAP[nm][1];
    const G=p.geo.index?p.geo.toNonIndexed():p.geo; if(!G.attributes.normal) G.computeVertexNormals(); const P=G.attributes.position, N=G.attributes.normal, uv=new Float32Array(P.count*2);
    for(let i=0;i<P.count;i++){ const nx=Math.abs(N.getX(i)), ny=Math.abs(N.getY(i)), nz=Math.abs(N.getZ(i)), x=P.getX(i), y=P.getY(i), z=P.getZ(i);
      const [u,v]=ny>=nx&&ny>=nz?[x,z]:nz>=nx?[x,y]:[z,y]; uv[i*2]=u/rep; uv[i*2+1]=v/rep; }
    G.setAttribute('uv',new THREE.BufferAttribute(uv,2)); p.geo=G; p.mat=texMats[nm]||(texMats[nm]=new THREE.MeshStandardMaterial({map:tex,roughness:TEXMAP[nm][2],metalness:0,name:nm})); }
  // glass you can see through without the cost of real refraction
  const glassM=new THREE.MeshStandardMaterial({color:0xdfeeff,transparent:true,opacity:.12,roughness:.05,metalness:.2,depthWrite:false});
  for(const p of parts) if(p.mat&&(p.mat.name==='Glass'||p.mat.transmission>0)) p.mat=glassM;
  // one draw per material
  const byMat=new Map(); for(const p of parts){ const k=p.mat||plaster; if(!byMat.has(k)) byMat.set(k,[]); const G=p.geo.index?p.geo.toNonIndexed():p.geo;
    for(const a of Object.keys(G.attributes)) if(!['position','normal','uv'].includes(a)) G.deleteAttribute(a); if(!G.attributes.normal) G.computeVertexNormals(); if(!G.attributes.uv) G.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(G.attributes.position.count*2),2)); byMat.get(k).push(G); }
  for(const [mat,list] of byMat){ const m=new THREE.Mesh(mergeGeometries(list,false),mat), flat=/Floor|^Rug/.test(mat.name||'');
    m.castShadow=!flat&&mat!==glassM; m.receiveShadow=mat!==glassM; if(mat===glassM) m.renderOrder=2; S.add(m); }
  // windows: a view of the street; the biggest lets the sun in
  const glass=named(/^Window_Glass/i).sort((a,b)=>{ const s=p=>{ const z=p.bb.getSize(new THREE.Vector3()); return Math.max(z.x,z.z)*z.y; }; return s(b)-s(a); });
  glass.forEach((w,i)=>{ const b=w.bb, c=b.getCenter(new THREE.Vector3()), sz=b.getSize(new THREE.Vector3()), alongX=sz.x<sz.z, n=alongX?new THREE.Vector3(Math.sign(c.x-cx)||1,0,0):new THREE.Vector3(0,0,Math.sign(c.z-cz)||1);
    const v=new THREE.Mesh(new THREE.PlaneGeometry((alongX?sz.z:sz.x)*2.6,sz.y*2.6),new THREE.MeshBasicMaterial({map:lagosView(),fog:false}));
    v.position.copy(c).addScaledVector(n,2.4); v.position.y=c.y+.3; v.lookAt(c.x,v.position.y,c.z); S.add(v);
    if(i===0){ // the sun comes in from this side; walls and ceilings cast shadows, so it only reaches the floor through windows
      const sun=new THREE.DirectionalLight(0xfff0dc,2.4), ctr=new THREE.Vector3(cx,0,cz), dir=n.clone().multiplyScalar(6).add(new THREE.Vector3(0,4.2,0)).normalize(), R=Math.hypot(x1-x0,z1-z0)/2+.6;
      sun.position.copy(ctr).addScaledVector(dir,R+8); sun.target.position.copy(ctr);
      sun.castShadow=true; const sm=Q.sh||1024; sun.shadow.mapSize.set(sm,sm); const sc=sun.shadow.camera; sc.left=-R; sc.right=R; sc.top=R; sc.bottom=-R; sc.near=.5; sc.far=2*R+16;
      sun.shadow.bias=-.0005; sun.shadow.normalBias=.03; sc.layers.enable(1); S.add(sun,sun.target); } });
  S.add(new THREE.HemisphereLight(0xe2e9f2,0x3b2c20,.8));
  // a warm light under each ceiling lamp (lamps made of several pieces share one light), and the bedside lamp
  const lamps=new Map(); for(const p of named(/^Ceiling_Lamp/i)){ const k=p.name.replace(/[._]\d+$/,''); lamps.set(k,(lamps.get(k)||new THREE.Box3()).union(p.bb)); }
  for(const [,b] of lamps){ const c=b.getCenter(new THREE.Vector3()), low=c.y<2.4, s=b.getSize(new THREE.Vector3()); const l=new THREE.PointLight(0xffe2c4,low?6:(s.x*s.z>.2?16:12),low?6:10,1.7); l.position.set(c.x,c.y-(low?.12:.2),c.z); S.add(l); }
  if(!lamps.size){ const l=new THREE.PointLight(0xffe2c4,16,11,1.7); l.position.set(cx,H-.3,cz); S.add(l); }
  for(const p of named(/^Lamp_Shade/i)){ const c=p.bb.getCenter(new THREE.Vector3()); const l=new THREE.PointLight(0xffbf78,3,4.5,2); l.position.copy(c); S.add(l); }
  // where you can walk: anything between knee and head height blocks a 10 cm cell. The camera is stopped by full-height walls.
  const CS=.1, gw=Math.ceil((x1-x0)/CS)+1, gd=Math.ceil((z1-z0)/CS)+1, grid=new Uint8Array(gw*gd), camG=new Uint8Array(gw*gd), a=new THREE.Vector3(), b=new THREE.Vector3(), c=new THREE.Vector3(), e=.006;
  for(const p of parts){ if(/^(Floor(?!_?Lamp)|Ceiling|Rug|Skirt|Doormat|POP)/i.test(p.name)) continue; const G=p.geo, P=G.attributes.position, I=G.index, nT=(I?I.count:P.count)/3;
    const wallFull=/^Wall/i.test(p.name)&&p.bb.min.y<1.2&&p.bb.max.y>2.0;
    for(let t=0;t<nT;t++){ const i0=I?I.getX(t*3):t*3, i1=I?I.getX(t*3+1):t*3+1, i2=I?I.getX(t*3+2):t*3+2; a.fromBufferAttribute(P,i0); b.fromBufferAttribute(P,i1); c.fromBufferAttribute(P,i2);
      const ya=Math.min(a.y,b.y,c.y), yb=Math.max(a.y,b.y,c.y); if(yb<.3||ya>1.7) continue;
      const ax=Math.min(a.x,b.x,c.x), bx=Math.max(a.x,b.x,c.x), az=Math.min(a.z,b.z,c.z), bz=Math.max(a.z,b.z,c.z), ex=bx-ax>3*e?e:0, ez=bz-az>3*e?e:0;   // a hair inside, so a wall ending on a cell line does not block the next cell (thin glass still blocks)
      const gi0=Math.max(0,Math.floor((ax+ex-x0)/CS)), gi1=Math.min(gw-1,Math.floor((bx-ex-x0)/CS)), gj0=Math.max(0,Math.floor((az+ez-z0)/CS)), gj1=Math.min(gd-1,Math.floor((bz-ez-z0)/CS));
      for(let j=gj0;j<=gj1;j++) for(let i=gi0;i<=gi1;i++){ grid[j*gw+i]=1; if(wallFull) camG[j*gw+i]=1; } } }
  const cell=(x,z)=>{ const i=Math.floor((x-x0)/CS), j=Math.floor((z-z0)/CS); return i<1||j<1||i>=gw-1||j>=gd-1?1:grid[j*gw+i]; };
  const R=.19, free=(x,z,r=R)=>!cell(x-r,z)&&!cell(x+r,z)&&!cell(x,z-r)&&!cell(x,z+r)&&!cell(x,z)&&!cell(x-r*.7,z-r*.7)&&!cell(x+r*.7,z-r*.7)&&!cell(x-r*.7,z+r*.7)&&!cell(x+r*.7,z+r*.7);
  const nearFree=(x,z)=>{ if(free(x,z)) return {x,z}; for(let r=.1;r<3;r+=.1) for(let k=0;k<24;k++){ const q={x:x+Math.cos(k/24*6.283)*r,z:z+Math.sin(k/24*6.283)*r}; if(free(q.x,q.z)) return q; } return {x:cx,z:cz}; };
  const camWall=(x,z)=>{ const i=Math.floor((x-x0)/CS), j=Math.floor((z-z0)/CS); return i<0||j<0||i>=gw||j>=gd?0:camG[j*gw+i]; };
  // which way an object faces: across its thin side, toward the side you can stand on
  const facing=bb=>{ const c=bb.getCenter(new THREE.Vector3()), sz=bb.getSize(new THREE.Vector3()), thinX=sz.x<sz.z, d=(thinX?sz.x:sz.z)/2;
    let best=null; for(const s of [1,-1]){ const n=thinX?new THREE.Vector3(s,0,0):new THREE.Vector3(0,0,s); let k=1;
      for(let r=.12;r<.5;r+=.05) if(cell(c.x+n.x*(d+r),c.z+n.z*(d+r))){ k=0; break; }   // a wall right behind it: that is its back
      if(k) for(const r of [.45,.7,1.0]) if(free(c.x+n.x*(d+r),c.z+n.z*(d+r))) k++; if(!best||k>best.k) best={n,k}; }
    return {c,sz,n:best.n,d}; };
  // the front door: the way out, and where you come in (facing into the flat)
  let exit={x:cx,z:z1-.8}, spawn={x:cx,z:z1-1.2,ry:Math.PI};
  { let L=named(/^Front_?Door$/i); if(!L.length) L=named(/^Door(?!_?Handle|_?Knob|_?Frame|_?Panel|_?Lever)/i); const d=boxOf(L);
    if(!d.isEmpty()){ const {c,n,d:h}=facing(d); const q=nearFree(c.x+n.x*(h+.5),c.z+n.z*(h+.5)), s=nearFree(c.x+n.x*(h+1.0),c.z+n.z*(h+1.0)); exit={x:q.x,z:q.z}; spawn={x:s.x,z:s.z,ry:Math.atan2(n.x,n.z)}; } }
  // the wardrobe: stand in front of it to change clothes (falls back to the bookshelf, then the middle of the room)
  let ward={x:cx,z:cz}, wardYaw=0; { const wb=boxOf(named(/wardrobe|closet|cupboard/i)), sb=boxOf(named(/^Shelf/i)), B=!wb.isEmpty()?wb:!sb.isEmpty()?sb:null;
    if(B){ const {c,n,d}=facing(B), q=nearFree(c.x+n.x*(d+.55),c.z+n.z*(d+.55)); ward=q; wardYaw=Math.atan2(n.x,n.z); } }
  const step=(nx,nz)=>{ if(free(nx,nz)){ player.x=nx; player.z=nz; return true; } return false; };
  let home=null; try{ home=homeSpots({named,boxOf,facing,free,nearFree}); }catch(e){ console.warn('home spots',e); }   // sofas, TV, cooker, shower, bed, speaker, bucket
  Object.assign(INT,{scene:S,cols:[],grid:{grid,gw,gd,x0:x0,z0:z0,CS},free,exit,spawn,ward,wardYaw,fan:null,home,camDist:2.3,label:floors.length>1?'Your flat · Mushin':'Your room · Mushin',
    bounds:{x0:x0+.3,x1:x1-.3,z0:z0+.3,z1:z1-.3},cam:{x0:x0+.18,x1:x1-.18,z0:z0+.18,z1:z1-.18,y0:.45,y1:H-.15},
    // walking: straight on if free; else slide along what you hit, or turn a little toward a doorway
    move(nx,nz){ const ox=player.x, oz=player.z, dx=nx-ox, dz=nz-oz; player.y=0; if(step(nx,nz)) return;
      if(Math.abs(dx)>1e-5&&step(nx,oz)) return; if(Math.abs(dz)>1e-5&&step(ox,nz)) return;
      for(const a of [.45,-.45,.9,-.9]){ const cs=Math.cos(a), sn=Math.sin(a), k=Math.cos(a); if(step(ox+(dx*cs-dz*sn)*k,oz+(dx*sn+dz*cs)*k)) return; } },
    // the camera stops in front of the wall between you and it
    camHit(t,d,dist){ const L=Math.hypot(d.x,d.z); if(L<1e-4) return dist; for(let s=.1;s<dist;s+=.05) if(camWall(t.x+d.x*s,t.z+d.z*s)) return s; return dist; },
    update(){} }); }

/* ================= your character (Mixamo) ================= */
await step('Loading your character…', 91);
let WALK_V=2.6, RUN_V=6.2, hero=null, HERO_RUN=null, HERO_CAR=null;
try{
  const src=await heroBufsJob; let cObj, CL;
  if(src.gltf){ cObj=src.gltf.scene; const byName=n=>src.gltf.animations.find(a=>a.name===n); CL=[byName('idle'),byName('walk'),byName('run'),byName('enter_car')]; }
  else { const fl=new FBXLoader(); const [c,iO,wO,rO,eO]=src.fbx.map(b=>fl.parse(b,'')); cObj=c; CL=[iO,wO,rO,eO].map(o=>o.animations[0]); }
  const bb=new THREE.Box3().setFromObject(cObj), hgt=bb.max.y-bb.min.y; if(hgt>10) cObj.scale.setScalar(1.85/hgt);
  cObj.traverse(o=>{ if(o.isMesh){ const om=Array.isArray(o.material)?o.material[0]:o.material, map=om&&om.map; if(map){ map.colorSpace=THREE.SRGBColorSpace; map.anisotropy=maxAniso; }
    o.material=new THREE.MeshStandardMaterial({map:map||null,color:map?0xffffff:0x8a6a50,roughness:.72,metalness:0,emissive:0xffffff,emissiveMap:map||null,emissiveIntensity:0}); HERO_MATS.push(o.material); o.castShadow=true; o.receiveShadow=true; o.frustumCulled=false; o.layers.set(1); } });
  const root=new THREE.Group(); root.rotation.order='YXZ'; root.add(cObj);
  const inPlace=c=>{ for(const t of c.tracks) if(/Hips\.position$/.test(t.name)){ const v=t.values, x0=v[0], z0=v[2]; for(let i=0;i<v.length;i+=3){ v[i]=x0; v[i+2]=z0; } } return c; };
  HERO_RUN=CL[2]?CL[2].clone():null;   // people borrow the run when they flee
  let hips=null; cObj.traverse(o=>{ if(!hips&&o.isBone&&/Hips$/.test(o.name)) hips=o; });
  if(hips&&CL[3]){ const k=CL[3].clone(), hp=hips.position; k.name='enter_car'; k.tracks=k.tracks.filter(t=>!/\.scale$/.test(t.name));   // getting into a car, for other looks
    for(const t of k.tracks) if(/Hips\.position$/.test(t.name)){ const v=t.values; for(let i=0;i<v.length;i+=3){ v[i]=(v[i]-hp.x)/hp.y; v[i+1]/=hp.y; v[i+2]=(v[i+2]-hp.z)/hp.y; } } HERO_CAR=k; }
  const mixer=new THREE.AnimationMixer(cObj);
  const act={idle:mixer.clipAction(inPlace(CL[0])),walk:mixer.clipAction(inPlace(CL[1])),run:mixer.clipAction(inPlace(CL[2])),car:mixer.clipAction(CL[3])};
  act.car.setLoop(THREE.LoopOnce,1); act.car.clampWhenFinished=true;
  for(const k of ['idle','walk','run']){ act[k].play(); act[k].setEffectiveWeight(k==='idle'?1:0); }
  hero={root,mixer,act,w:{idle:1,walk:0,run:0,text:0,phone:0,fight:0},ov:null,carT:0,hips:hips||cObj,cObj,hipsRest:hips?hips.position.clone():null,still:0,fid:null,rest:snapRest(cObj)};
  scene.remove(rig.root); rig={root}; scene.add(root); WALK_V=1.7; RUN_V=4.9; { let l2=null; try{ l2=localStorage.getItem('naija-look2'); }catch(e){} if(isF()||(PROFILE&&l2!=='me')) root.visible=false; }   // you appear once your own person (Tunde, Amaka, Ada) is on
}catch(e){ console.warn('Character files could not load, using the built-in model.',e); }
function heroQuiet(){ const a=hero.act; for(const k of ['idle','walk','walk2','run','text','phone']) if(a[k]){ a[k].setEffectiveWeight(0); hero.w[k]=0; } hero.fid=null; hero.still=0;
  if(a.fight_idle) a.fight_idle.setEffectiveWeight(0); hero.w.fight=0; if(hero.ov){ hero.ov.a.stop(); hero.ov=null; } FIGHT.cx=FIGHT.cz=0; }
function heroAnim(dt,speed){ const a=hero.act; let ti=0,tw=0,tr=0;
  // stand still for a while and you take out your phone (moves arrive with the people files)
  if(speed<.08){ ti=1; hero.still+=dt; if(PHONE.open&&a.text&&hero.fid!=='text'&&!hero.ov){ hero.fid='text'; a.text.reset().play(); } else if(!hero.fid&&hero.still>8&&started&&(mode==='walk'||mode==='interior')&&(a.text||a.phone)){ hero.fid=a.phone&&(!a.text||MR()<.3)?'phone':'text'; a[hero.fid].reset().play(); } }
  // (the new people's walks slow right down instead of mixing with standing)
  else { hero.still=0; hero.fid=null; const wb=hero.look&&hero.look.wv?Math.min(WALK_V,.6):WALK_V; if(speed<=WALK_V){ const k=Math.min(1,speed/wb); ti=1-k; tw=k; } else if(CARRY.p) tw=1; else { const k=clamp((speed-WALK_V)/(RUN_V-WALK_V),0,1); tw=1-k; tr=k; } }
  const s=1-Math.exp(-10*dt), w=hero.w; w.idle+=(ti-w.idle)*s; w.walk+=(tw-w.walk)*s; w.run+=(tr-w.run)*s;
  const hd=FIGHT.stop>0?dt*.1:dt; FIGHT.stop=Math.max(0,FIGHT.stop-dt);   // hit-stop: a heavy blow freezes the moment
  { const o=hero.ov, b=FIGHT.buf; if(b&&(T0-b.t>.5)) FIGHT.buf=null; else if(b&&(!o||(o.atk&&o.t>=o.cancel*o.dur))){ FIGHT.buf=null; playerAttack(b.kind); } }   // a press made during a blow comes out as soon as it can
  const ow=heroOverlay(hd), base=1-ow;   // a punch, kick, jump or hit plays over the walk
  // fists up while a fight is on
  w.fight+=((((FIGHT.near||T0-FIGHT.lastAtk<4)&&!FIGHT.ko&&a.fight_idle&&mode==='walk')?1:0)-w.fight)*(1-Math.exp(-6*dt)); if(w.fight>.05) hero.fid=null;
  let f=0; for(const n of ['text','phone']) if(a[n]){ w[n]+=((hero.fid===n?1:0)-w[n])*(1-Math.exp(-4*dt)); a[n].setEffectiveWeight(w[n]*base); f+=w[n]; }
  const idleW=w.idle*(1-Math.min(1,f)), fw=a.fight_idle?w.fight:0;
  a.idle.setEffectiveWeight(idleW*(1-fw)*base); if(a.fight_idle) a.fight_idle.setEffectiveWeight(idleW*fw*base);
  const LK=hero.look; hero.k2=(hero.k2||0)+(((a.walk2&&speed>.05&&speed<1.05&&!CARRY.p)?1:0)-(hero.k2||0))*(1-Math.exp(-8*dt)); const k2=a.walk2?hero.k2:0;   // slow steps: the swagger
  a.walk.setEffectiveWeight(w.walk*(1-k2)*base); if(a.walk2) a.walk2.setEffectiveWeight(w.walk*k2*base); a.run.setEffectiveWeight(w.run*base);
  if(LK&&LK.wv){ a.walk.timeScale=clamp(Math.max(speed,.5)/LK.wv,.6,CARRY.p?2.5:1.6); if(a.walk2) a.walk2.timeScale=clamp(Math.max(speed,.4)/LK.w2v,.6,1.3); a.run.timeScale=clamp(Math.max(speed,2.5)/LK.rv,.7,1.5); }   // each move at the speed it was made for
  else { a.walk.timeScale=clamp(Math.max(speed,1)/1.1,.9,CARRY.p?2.5:1.8); a.run.timeScale=clamp(Math.max(speed,3)/2.4,1.3,2.2); }
  if(hero.look){ const L=hero.look, O=L.off, ov=hero.ov; let y=((O[L.idle]||0)*idleW*(1-fw)+(O.fight_idle||0)*idleW*fw+((O.walk||0)*(1-k2)+(O.walk2||0)*k2)*w.walk+(O.run||0)*w.run)*base; if(ov) y+=(O[ov.name]||0)*ow;   // keep this body's feet on the floor
    hero.cObj.position.y=L.y0+y; }
  hero.mixer.update(hd); phoneInHand(); heroWeapon(); carryArms(); }
const HERO_RIDE={okada:{x:0,y:.08,z:0,ry:0},keke:{x:0,y:.08,z:0,ry:0},danfo:{x:0,y:.04,z:0,ry:0},bus:{x:0,y:.04,z:0,ry:0},police:{x:0,y:.04,z:0,ry:0},sedan:{x:0,y:.02,z:0,ry:0}};
function updateEnter(dt){ hero.carT+=dt; hero.mixer.update(dt); const [f]=inputVec(); const dur=hero.act.car.getClip().duration/hero.act.car.timeScale;
  if(hero.carT>dur*.86||(hero.carT>.7&&(Math.abs(f)>.5||K[' ']))) finishEnter(); }
function finishEnter(){ mode='drive'; seatHero(drive.v); }

/* ================= post-processing (Medium/High only) ================= */
let composer=null, bloom=null, renderPass=null, curScene=scene;
if(Q.post){ const rtMain=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType,samples:Q.msaa});
  composer=new EffectComposer(renderer,rtMain); renderPass=new RenderPass(scene,camera); composer.addPass(renderPass);
  bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth/2,innerHeight/2),.3,.55,.86); composer.addPass(bloom); bloom.enabled=Q.bloom;
  composer.addPass(new OutputPass()); composer.setPixelRatio(PR); composer.setSize(innerWidth,innerHeight); }
function onResize(){ Q.pr=fitPR(); if(PR>Q.pr) PR=Q.pr; renderer.setPixelRatio(PR); renderer.setSize(innerWidth,innerHeight); if(composer){ composer.setPixelRatio(PR); composer.setSize(innerWidth,innerHeight); } camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize',onResize); addEventListener('orientationchange',()=>setTimeout(onResize,250));
function setScene(sc){ curScene=sc; if(renderPass) renderPass.scene=sc; }
let usePost=true;
function renderFrame(dt){ if(PERF) renderer.info.reset(); if(composer&&usePost) composer.render(dt); else renderer.render(curScene,camera); }

/* ================= world clock: sun, sky and weather (the same for every player) ================= */
const C3=h=>new THREE.Color(h);
const LK={
  day:   {turb:3.2,ray:1.25,mie:.004,mieG:.8, exp:.5,sun:C3(0xfff1dc),sunI:3.9, hs:C3(0xbfd6ff),hg:C3(0x8c7a60),hi:.62,fog:C3(0xc4ccd0),fd:.0015,win:0,  lamp:0,  sign:0,  b0:.22,b1:.45,b2:.92,env:.85,water:C3(0x0d4a5c),head:.15,tail:.3, spot:0},
  golden:{turb:9, ray:2.4,mie:.009,mieG:.86,exp:.6, sun:C3(0xffaf68),sunI:2.8, hs:C3(0xffc7a2),hg:C3(0x5a4636),hi:.55,fog:C3(0xd9a079),fd:.0018,win:.45,lamp:.8, sign:.25,b0:.32,b1:.55,b2:.86,env:1, water:C3(0x173947),head:1,  tail:1,  spot:40},
  night: {turb:2, ray:.4, mie:.002,mieG:.8, exp:1.02,sun:C3(0x9fb4ff),sunI:.8,hs:C3(0x6478a6),hg:C3(0x2c2824),hi:1, fog:C3(0x22324c),fd:.0019,win:1.7,lamp:5,  sign:1.1,b0:.95,b1:.5, b2:.55,env:.72,water:C3(0x143444),head:3,  tail:2.2,spot:180}};   // a bright moonlit night: players should still see the city
const RAINFOG=C3(0x6f7a84), HAZE=C3(0xc8a273), _c1=new THREE.Color(), _c2=new THREE.Color();
const ENV={hour:12,elev:40,lamp:0,win:0,sign:0,head:.15,tail:.3,spot:0,wet:0,rain:0,cloud:0,haze:0,dim:0,storm:0,night:false,w:null,label:'',icon:'sun',flash:0};
const envScene=new THREE.Scene(); envScene.add(sky); let envRT=null, envKey='', envT=-99, skyT=-99;
const mixK=(f,dw,nw)=>{ const g=LK.golden[f]; const a=g+(LK.day[f]-g)*dw; return a+(LK.night[f]-a)*nw; };
const mixC=(out,f,dw,nw)=>out.copy(LK.golden[f]).lerp(LK.day[f],dw).lerp(LK.night[f],nw);
// clouds: one big soft layer of cumulus high above the city (assets/models/clouds.png, tools/ground_tex.py).
// "cover" decides how much of the sky they fill: scattered fair-weather clouds on a sunny day, a closed grey deck in the rain.
const cloudMat=(()=>{ const [ac,ag]=cv(256,256); const gr=ag.createRadialGradient(128,128,20,128,128,128); gr.addColorStop(0,'#fff'); gr.addColorStop(.7,'#fff'); gr.addColorStop(1,'#000'); ag.fillStyle=gr; ag.fillRect(0,0,256,256);
  const [pc]=cv(4,4); const m=new THREE.MeshBasicMaterial({map:tx(pc,true,true,4),alphaMap:tx(ac,false,false),transparent:true,depthWrite:false,fog:false,opacity:0,color:0xffffff});
  const cover={value:.45}; m.userData.cover=cover;
  m.onBeforeCompile=sh=>{ sh.uniforms.cover=cover;
    sh.fragmentShader='uniform float cover;\n'+sh.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
      vec4 sampledDiffuseColor=texture2D(map,vMapUv);
      float cA=max(smoothstep(1.-cover,1.-cover+.32,sampledDiffuseColor.a),smoothstep(.82,1.,cover)*.94);   // rain: a closed grey deck
      float grey=mix(1.,.55,smoothstep(.55,1.,cover));
      diffuseColor*=vec4(sampledDiffuseColor.rgb*grey,cA);
    #endif`); };
  m.customProgramCacheKey=()=>'clouds-cover';
  GTEX.clouds.then(t=>{ if(!t) return; t.repeat.set(4,4); m.map=t; m.needsUpdate=true; });
  return m; })();
const veil=new THREE.Mesh(new THREE.SphereGeometry(2600,24,12),new THREE.MeshBasicMaterial({color:0xc8a273,transparent:true,opacity:0,fog:false,depthWrite:false,side:THREE.BackSide,toneMapped:false})); veil.renderOrder=-2; veil.frustumCulled=false; veil.visible=false; scene.add(veil);
const clouds=new THREE.Mesh(new THREE.PlaneGeometry(7000,7000),cloudMat); clouds.rotation.x=Math.PI/2; clouds.position.y=520; clouds.renderOrder=-1; clouds.frustumCulled=false; scene.add(clouds);
/* rain, in three layers, all moved on the GPU around the camera:
   - drops: thousands of thin streaks that face the camera, each with its own speed, length and brightness, tapered at both
     ends like a drop smeared by motion; they slant with the wind and fade very close and far away
   - curtain: sheets of falling rain at ~30 m, so distant streets go grey and soft behind the downpour
   - splashes: little rings that open on the ground around you and die away, each time in a new place */
const RAIN_N=Q===QUAL.low?2600:Q===QUAL.medium?5000:9000, SPL_N=Q===QUAL.low?140:Q===QUAL.medium?260:480, RB=[40,22,40];
const RAINU={time:{value:0},cam:{value:new THREE.Vector3()},box:{value:new THREE.Vector3(...RB)},op:{value:0},col:{value:new THREE.Color(.75,.8,.86)},wind:{value:new THREE.Vector2(1.2,.5)}};
const rain=(()=>{ const G=new THREE.Group(); G.visible=false; scene.add(G);
  // drops
  const g=new THREE.InstancedBufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,0, .5,0,0, .5,1,0, -.5,1,0],3)); g.setIndex([0,1,2,0,2,3]);
  const off=new Float32Array(RAIN_N*3), rnd=new Float32Array(RAIN_N*3); for(let i=0;i<RAIN_N;i++){ off.set([MR()*RB[0],MR()*RB[1],MR()*RB[2]],i*3); rnd.set([MR(),MR(),MR()],i*3); }
  g.setAttribute('off',new THREE.InstancedBufferAttribute(off,3)); g.setAttribute('rnd',new THREE.InstancedBufferAttribute(rnd,3)); g.instanceCount=RAIN_N;
  const dm=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:RAINU,
    vertexShader:`attribute vec3 off; attribute vec3 rnd; uniform float time; uniform vec3 cam; uniform vec3 box; uniform vec2 wind; varying float vA; varying vec2 vC;
      void main(){ float sp=7.5+rnd.x*3.5; vec3 vel=vec3(wind.x,-sp,wind.y); vec3 p=off+vel*time; p=mod(p-cam+box*.5,box)-box*.5+cam;
        vec3 dir=normalize(vel); float len=sp*(.05+rnd.y*.035);               // a drop smeared over ~1/20 s
        vec3 toC=normalize(cameraPosition-p); vec3 rt=normalize(cross(dir,toC));
        float d=distance(p,cameraPosition); float w=.008+.005*rnd.z+d*.0012;   // a touch wider far away so they never vanish into single pixels
        vec3 q=p-dir*len*position.y+rt*w*position.x*2.;
        vA=(.45+.55*rnd.z)*smoothstep(.6,2.2,d)*(1.-smoothstep(box.x*.32,box.x*.5,d)); vC=position.xy;
        gl_Position=projectionMatrix*viewMatrix*vec4(q,1.); }`,
    fragmentShader:`uniform float op; uniform vec3 col; varying float vA; varying vec2 vC;
      void main(){ float side=1.-abs(vC.x)*2.; float tip=smoothstep(0.,.25,vC.y)*smoothstep(1.,.55,vC.y); float a=op*vA*side*tip*1.6; if(a<.004) discard; gl_FragColor=vec4(col*(1.1-vC.y*.25),a); }`});
  const drops=new THREE.Mesh(g,dm); drops.frustumCulled=false; G.add(drops);
  // curtain: a ring of falling sheets painted with streaks
  const [c,cg]=cv(256,512); cg.clearRect(0,0,256,512); for(let i=0;i<260;i++){ const x=rr(0,256), y=rr(-60,512), l=rr(30,110); const gr=cg.createLinearGradient(x,y,x+l*.06,y+l); gr.addColorStop(0,'rgba(255,255,255,0)'); gr.addColorStop(.5,`rgba(255,255,255,${rr(.25,.7)})`); gr.addColorStop(1,'rgba(255,255,255,0)'); cg.strokeStyle=gr; cg.lineWidth=rr(.8,1.8); cg.beginPath(); cg.moveTo(x,y); cg.lineTo(x+l*.06,y+l); cg.stroke(); }
  const ct=new THREE.CanvasTexture(c); ct.wrapS=ct.wrapT=THREE.RepeatWrapping; ct.repeat.set(10,1.6);
  const cm=new THREE.MeshBasicMaterial({map:ct,transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:false,opacity:0,color:0xc8ccd2});
  const curtain=new THREE.Mesh(new THREE.CylinderGeometry(30,30,60,32,1,true),cm); curtain.frustumCulled=false; curtain.renderOrder=1; G.add(curtain);
  const ct2=ct.clone(); ct2.repeat.set(7,1.1); const cm2=cm.clone(); cm2.map=ct2; const curtain2=new THREE.Mesh(new THREE.CylinderGeometry(55,55,80,32,1,true),cm2); curtain2.frustumCulled=false; G.add(curtain2);
  // splashes: rings opening on the ground
  const sgeo=new THREE.InstancedBufferGeometry(); sgeo.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,-1, 1,0,-1, 1,0,1, -1,0,1],3)); sgeo.setIndex([0,2,1,0,3,2]);
  const sr=new Float32Array(SPL_N*2); for(let i=0;i<SPL_N;i++) sr.set([MR(),MR()],i*2); sgeo.setAttribute('rnd',new THREE.InstancedBufferAttribute(sr,2)); sgeo.instanceCount=SPL_N;
  const sm=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:RAINU,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6,
    vertexShader:`attribute vec2 rnd; uniform float time; uniform vec3 cam; varying float vT; varying vec2 vP;
      float h(float n){ return fract(sin(n)*43758.5453); }
      void main(){ float rate=2.2+rnd.y*1.6; float cyc=time*rate+rnd.x*7.; float k=floor(cyc); vT=fract(cyc);
        vec2 at=cam.xz+(vec2(h(k*12.9+rnd.x*78.2),h(k*39.3+rnd.y*11.7))-.5)*28.;
        float r=.05+vT*(.14+.08*rnd.y); vP=position.xz;
        gl_Position=projectionMatrix*viewMatrix*vec4(at.x+position.x*r,.035,at.y+position.z*r,1.); }`,
    fragmentShader:`uniform float op; uniform vec3 col; varying float vT; varying vec2 vP;
      void main(){ float d=length(vP); float ring=smoothstep(.62,.86,d)*smoothstep(1.,.88,d); float dot=(1.-smoothstep(0.,.35,d))*(1.-smoothstep(0.,.25,vT));
        float a=(ring*.8+dot)*(1.-vT)*op*1.1; if(a<.01) discard; gl_FragColor=vec4(col*1.15,a); }`});
  const spl=new THREE.Mesh(sgeo,sm); spl.frustumCulled=false; G.add(spl);
  G.userData={drops,curtain,curtain2,cm,cm2,ct,ct2,spl};
  return G; })();
function updateEnv(dt,force=false){
  const t=CLOCK.now(), h=CLOCK.gameHour(t), sa=CLOCK.sunAngles(h,t), w=CLOCK.weatherAt(t), e=sa.elev;
  ENV.hour=h; ENV.elev=e; ENV.w=w; ENV.label=w.label; ENV.icon=w.icon; ENV.rain=w.rain; ENV.cloud=w.cloud; ENV.haze=w.haze; ENV.dim=w.dim; ENV.storm=w.storm;
  ENV.wet+=((w.wet)-ENV.wet)*Math.min(1,dt*.05+(force?1:0));
  const dw=sm((e-3)/19), nw=sm((1.5-e)/8.5), dark=Math.min(1,nw+w.dim*.55*(1-nw)*(1-dw*.4));
  const u=sky.material.uniforms;
  u.turbidity.value=mixK('turb',dw,nw)+w.cloud*7+w.haze*11; u.rayleigh.value=mixK('ray',dw,nw)*(1-w.cloud*.55)*(1-w.haze*.4); u.mieCoefficient.value=mixK('mie',dw,nw)+w.haze*.02+w.cloud*.004; u.mieDirectionalG.value=mixK('mieG',dw,nw);
  sunDir.setFromSphericalCoords(1,THREE.MathUtils.degToRad(90-e),THREE.MathUtils.degToRad(180-sa.azim)); u.sunPosition.value.copy(sunDir);
  if(e<-1) lightDir.setFromSphericalCoords(1,THREE.MathUtils.degToRad(48),THREE.MathUtils.degToRad(200)); else lightDir.setFromSphericalCoords(1,THREE.MathUtils.degToRad(90-Math.max(e,14)),THREE.MathUtils.degToRad(180-sa.azim));
  mixC(sun.color,'sun',dw,nw); const fade=e>=-1?sm((e+1)/6):sm((-1-e)/6);
  sun.intensity=(e>=-1?mixK('sunI',dw,nw):LK.night.sunI)*fade*(1-w.dim*.82);
  mixC(hemi.color,'hs',dw,nw); mixC(hemi.groundColor,'hg',dw,nw); hemi.intensity=mixK('hi',dw,nw)*(1+w.dim*.12*(1-nw))+ENV.flash*2.5;
  if(w.cloud>.3){ _c1.copy(hemi.color); hemi.color.lerp(_c2.setRGB(.62,.66,.7),Math.min(1,(w.cloud-.3))*(1-nw)*.8); }
  mixC(scene.fog.color,'fog',dw,nw); scene.fog.color.lerp(_c1.copy(RAINFOG).multiplyScalar(1-nw*.85),w.rain*.75).lerp(_c2.copy(HAZE).multiplyScalar(1-nw*.8),w.haze*.8);
  scene.fog.density=mixK('fd',dw,nw)*Q.fog*(1+w.rain*2.2+w.storm*1.6+w.haze*6.5);
  // sky veil: the sky and far city fade into rain grey or harmattan dust, like real bad-weather days
  veil.material.color.copy(scene.fog.color); veil.material.opacity=Math.min(.86,w.haze*.74+w.rain*.42+w.storm*.28+Math.max(0,w.cloud-.5)*.35+nw*.5);   // at night it tints the black sky a deep moonlit blue veil.visible=veil.material.opacity>.02&&mode!=='interior'; veil.position.copy(camera.position);
  renderer.toneMappingExposure=mixK('exp',dw,nw)*(1-w.dim*.4*(1-nw))+ENV.flash*.35;
  WU.sunDirection.value.copy(lightDir).normalize(); mixC(WU.waterColor.value,'water',dw,nw); WU.sunColor.value.setRGB(1-nw*.55,1-nw*.5,1-nw*.3).multiplyScalar(1-w.dim*.8);
  ENV.lamp=Math.max(mixK('lamp',dw,nw), dark>.55?2.4*(dark-.55)/.45:0); ENV.win=Math.max(mixK('win',dw,nw),dark*.9); ENV.sign=Math.max(mixK('sign',dw,nw),dark*.6);
  ENV.head=Math.max(mixK('head',dw,nw),dark*2); ENV.tail=Math.max(mixK('tail',dw,nw),dark*1.6); ENV.spot=Math.max(mixK('spot',dw,nw),dark*120); ENV.night=nw>.5;
  for(const k of FAC_KEYS) MAT[k].emissiveIntensity=Math.min(1.25,ENV.win)*(k==='shop'?.38:k==='oldmid'||k==='resi'?.7:1); MAT.sign.emissiveIntensity=ENV.sign*.8;
  fillLight.intensity=Math.max(0,(nw*.9+w.dim*.35*(1-dw))*7); for(const m of billboardMats) m.emissiveIntensity=ENV.sign*.9;
  { const lift=fillLight.intensity/7; for(const m of HERO_MATS) m.emissiveIntensity=lift*.32; HUMAN_MAT.emissiveIntensity=lift*.14; }
  lampHeadMat.emissiveIntensity=ENV.lamp; POOLS.off=!(ENV.lamp>1);
  CM.head.emissiveIntensity=ENV.head; CM.tail.emissiveIntensity=ENV.tail; APT.doorMesh.material.emissiveIntensity=Math.min(1.2,ENV.win*.8);
  stars.visible=nw>.4&&w.cloud<.6; stars.material.opacity=.8*Math.min(1,(nw-.4)*3)*(1-w.cloud)*(1-veil.material.opacity);
  if(bloom){ bloom.strength=mixK('b0',dw,nw)+ENV.flash; bloom.radius=mixK('b1',dw,nw); bloom.threshold=mixK('b2',dw,nw); }
  // clouds and rain
  cloudMat.userData.cover.value=Math.min(1,.42+w.cloud*.62); cloudMat.opacity=cloudMat.map.image&&cloudMat.map.image.width>4?.97:0; cloudMat.color.setRGB(1,1,1).multiplyScalar((1-nw*.9)*(1-w.dim*.55)+.06).lerp(_c1.copy(sun.color),dw<.5&&nw<.5?.35:0);
  cloudMat.map.offset.x+=dt*.0016; cloudMat.map.offset.y+=dt*.0007; clouds.position.x=camera.position.x; clouds.position.z=camera.position.z;
  rain.visible=w.rain>.02&&mode!=='interior'; if(rain.visible){ const ru=RAINU, R2=rain.userData; ru.time.value=(ru.time.value+dt)%600; ru.cam.value.copy(camera.position); ru.op.value=Math.min(.95,w.rain*.75+w.storm*.3);
    const lit=(1-nw*.6)*(1-w.dim*.25); ru.col.value.setRGB(.74,.77,.82).multiplyScalar(lit).lerp(_c1.copy(hemi.color),.15); ru.wind.value.set(1.2+w.storm*4.5,.5+w.storm*2);
    R2.curtain.position.copy(camera.position); R2.curtain2.position.copy(camera.position); R2.ct.offset.y+=dt*.9; R2.ct.offset.x+=dt*.02*(1+w.storm*3); R2.ct2.offset.y+=dt*.7;
    R2.cm.color.copy(scene.fog.color).lerp(_c2.setRGB(1,1,1),.35); R2.cm2.color.copy(R2.cm.color); R2.cm.opacity=Math.min(.5,w.rain*.3+w.storm*.22); R2.cm2.opacity=R2.cm.opacity*.8; }
  // wet roads shine
  const wet=ENV.wet; for(const m of ROAD_MATS){ m.roughness=m.userData.r0*(1-wet*m.userData.k); m.color.copy(m.userData.c0).multiplyScalar(1-wet*.34); }
  // re-light reflections when the sky has changed enough
  // re-light reflections only when the sky really changed: every ~12° of sun in the day, ~5° around sunrise/sunset, or a weather change
  const key=(e>22?'d'+Math.round(e/12):'l'+Math.round(Math.max(-8,e)/5))+'|'+Math.round(w.cloud*4)+'|'+Math.round(w.haze*4);
  if(force||(T0-skyT>2&&mode!=='interior')){ skyT=T0; skyCam.update(renderer,envScene); }   // background sky picture
  if(force||(key!==envKey&&T0-envT>20&&mode!=='interior')){ envKey=key; envT=T0; const old=envRT; envRT=pmrem.fromCubemap(skyCube.texture); scene.environment=envRT.texture; if(old) old.dispose(); }
  scene.environmentIntensity=mixK('env',dw,nw)*(1-w.dim*.35);
}
let flashT=0, nextFlash=8;
function updateStorm(dt){ ENV.flash=Math.max(0,ENV.flash-dt*5); if(ENV.storm<.3||mode==='interior') return; nextFlash-=dt; if(nextFlash<=0){ nextFlash=mrr(7,22)/(ENV.storm+.2); ENV.flash=1.3; setTimeout(()=>thunder(mrr(.5,1)),mrr(300,2200)); } }
/* ================= audio ================= */
let AC=null, eng=null, master=null, rainG=null, soundOn=true; try{ soundOn=localStorage.getItem('naija-sound')!=='off'; }catch(e){}
function noiseBuf(sec){ const b=AC.createBuffer(1,Math.floor(AC.sampleRate*sec),AC.sampleRate), d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; return b; }
function initAudio(){ if(AC) return; try{ AC=new (window.AudioContext||window.webkitAudioContext)(); master=AC.createGain(); master.gain.value=soundOn?1:0; master.connect(AC.destination);
  const o=AC.createOscillator(); o.type='sawtooth'; const o2=AC.createOscillator(); o2.type='triangle'; const f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=420; const g=AC.createGain(); g.gain.value=0;
  o.connect(f); o2.connect(f); f.connect(g); g.connect(master); o.start(); o2.start(); eng={o,o2,g,f};
  const rn=AC.createBufferSource(); rn.buffer=noiseBuf(2.5); rn.loop=true; const bp=AC.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=2600; bp.Q.value=.35; rainG=AC.createGain(); rainG.gain.value=0; rn.connect(bp); bp.connect(rainG); rainG.connect(master); rn.start();
  if(AC.state==='suspended') AC.resume(); }catch(e){ AC=null; eng=null; } }
function setSound(on){ soundOn=on; try{ localStorage.setItem('naija-sound',on?'on':'off'); }catch(e){} if(master) master.gain.setTargetAtTime(on?1:0,AC.currentTime,.05); document.querySelectorAll('#snd button').forEach(b=>b.setAttribute('aria-pressed',(b.dataset.s==='on')===on?'true':'false')); }
function updateAudio(){ if(!eng) return; const on=mode==='drive', sp=on?Math.abs(drive.speed):0, t=AC.currentTime; const big=on&&(drive.v.type==='bus'||drive.v.type==='danfo'); eng.g.gain.setTargetAtTime(on?(drive.v.type==='okada'?.035:.045):0,t,.15); const fr=(big?30:drive.v&&drive.v.type==='okada'?48:36)+sp*3.1;
  eng.o.frequency.setTargetAtTime(fr,t,.08); eng.o2.frequency.setTargetAtTime(fr*.5,t,.08); eng.f.frequency.setTargetAtTime(300+sp*25,t,.1);
  rainG.gain.setTargetAtTime(mode==='interior'?ENV.rain*.025:ENV.rain*.085+ENV.storm*.03,t,.6); }
function horn(){ if(!AC) return; const t=AC.currentTime, g=AC.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.07,t+.02); g.gain.setValueAtTime(.07,t+.38); g.gain.linearRampToValueAtTime(0,t+.45); g.connect(master);
  for(const fq of [392,494]){ const o=AC.createOscillator(); o.type='square'; o.frequency.value=fq; o.connect(g); o.start(t); o.stop(t+.5); } }
function burst(dur,freq,gain,decay=3){ if(!AC) return; const t=AC.currentTime, n=AC.createBufferSource(), b=AC.createBuffer(1,Math.floor(AC.sampleRate*dur),AC.sampleRate), d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,decay);
  n.buffer=b; const f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=freq; const g=AC.createGain(); g.gain.value=gain; n.connect(f); f.connect(g); g.connect(master); n.start(t); }
function thud(){ burst(.25,380,.5); }
function clunk(k){ burst(.16,260,.25+.35*k,4); }
function thunder(k){ burst(2.6,140,.6*k,1.6); }

/* ================= HUD ================= */
// people talk to a woman as a woman
const SHE=[[/\bmy son\b/g,'my daughter'],[/\bOga\b/g,'Madam'],[/\bsir!/g,'ma!'],[/\bUncle\b/g,'Aunty'],[/\bboy!/g,'girl!'],[/\bBoss\b/g,'Madam'],[/\bmy guy\b/g,'my sister'],[/\bguy man\b/g,'fine girl']];
let toastT=0; function toast(msg,dur=2.6){ if(isF()&&/"/.test(msg)) for(const [a,b] of SHE) msg=msg.replace(a,b); const t=$('#toast'); t.textContent=msg; t.hidden=false; t.onclick=null; toastT=dur; }
const DISTRICTS=WD.pois.place.map(([x,z,n])=>({x,z,n}));
function districtAt(x,z){ let best='Mushin',bd=1e18; for(const d of DISTRICTS){ const q=(d.x-x)**2+(d.z-z)**2; if(q<bd){ bd=q; best=d.n; } } return best; }
function locationName(){ if(mode==='interior') return ROOM.label; const x=mode==='drive'?drive.v.x:player.x, z=mode==='drive'?drive.v.z:player.z, dist=districtAt(x,z);
  if(Math.hypot(x-STATION.x,z-STATION.z)<26) return 'Mushin Police Station';
  if(SITES.park&&Math.hypot(x-SITES.park.cx,z-SITES.park.cz)<34) return 'Mushin Motor Park';
  for(const m of MARKETS) if(m.stalls.length&&inPoly(m.a.pts,x,z)) return `${m.name} · ${dist}`;
  for(const sc of SCHOOLS) if(inPoly(sc.a.pts,x,z)) return sc.name;
  { const h=areaAt(x,z,['hospital']); if(h&&h.n) return 'LUTH · Idi-Araba'; }
  let best=null,bd=30; for(const e of roadsNear(x,z)){ if(!e.name) continue; const d=segD(e,x,z)-e.hw; if(d<bd){ bd=d; best=e.name; } }
  return best?`${best} · ${dist}`:dist; }
const ICONS={sun:'<circle cx="12" cy="12" r="4.5" fill="#F2B705"/><g stroke="#F2B705" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></g>',
  moon:'<path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.6A7 7 0 0 1 15.5 3.5z" fill="#d9def2"/>',
  cloud:'<path d="M7 18h10.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.4A3.4 3.4 0 0 0 7 18z" fill="#cfd5dc"/>',
  rain:'<path d="M7 14h10.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.4A3.4 3.4 0 0 0 7 14z" fill="#aeb8c2"/><g stroke="#7fc0ff" stroke-width="2" stroke-linecap="round"><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/></g>',
  storm:'<path d="M7 13h10.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.4A3.4 3.4 0 0 0 7 13z" fill="#8c96a1"/><path d="M12.5 13l-3 5h3l-1.5 4 4-6h-3l1.5-3z" fill="#F2B705"/>',
  haze:'<g stroke="#d8b98a" stroke-width="2.2" stroke-linecap="round"><path d="M4 8h12M7 12h13M4 16h11M8 20h9"/></g><circle cx="18" cy="6" r="2.6" fill="#e9c98f"/>'};
let clockTick=0, lastIcon='';
const wLabel=()=>ENV.label==='Sunny'&&(ENV.night||ENV.elev<-2)?'Clear':ENV.label;
function updateClockHUD(){ $('#clockT').textContent=CLOCK.fmtHour(ENV.hour); $('#clockW').textContent=wLabel();
  const ic=ENV.icon==='sun'&&ENV.night?'moon':ENV.icon; if(ic!==lastIcon){ lastIcon=ic; $('#wIcon').innerHTML=ICONS[ic]||ICONS.sun; } }
const mm=$('#mm'), mg=mm.getContext('2d');
// the whole map as one picture for the big map (sharp detail is drawn on top when you zoom in)
const MMB={x0:-WB.x-20,z0:-WB.z-20,x1:WB.x+20,z1:WB.z+20,ppm:.45}; let mmCache=null;
const COND_COL={good:'#8d939e',bad:'#7b7468',dirt:'#9a6440'};
const AREA_COL={pitch:'#2c4a30',grassland:'#2c4a30',scrub:'#2c4a30',farmland:'#2c4a30',park:'#2c4a30',school:'#3a3550',marketplace:'#4a3a28',retail:'#4a3a28',parking:'#34383e',fuel:'#34383e',hospital:'#46303a',industrial:'#2f3134'};
function buildMinimapCache(){ const W=Math.ceil((MMB.x1-MMB.x0)*MMB.ppm), H=Math.ceil((MMB.z1-MMB.z0)*MMB.ppm); mmCache=document.createElement('canvas'); mmCache.width=W; mmCache.height=H;
  const g=mmCache.getContext('2d',{willReadFrequently:true}); g.fillStyle='#1f2226'; g.fillRect(0,0,W,H); g.scale(MMB.ppm,MMB.ppm); g.translate(-MMB.x0,-MMB.z0); drawWorldMap(g,MMB.x0,MMB.z0,MMB.x1,MMB.z1,true); }
// draw the city (areas, buildings, roads, railway) into a 2D canvas already set to world metres
function drawWorldMap(g,x0,z0,x1,z1,all=false){ g.fillStyle='#2a2d31'; g.fillRect(x0,z0,x1-x0,z1-z0);
  for(const a of AREAS){ const col=AREA_COL[a.k]; if(!col) continue; g.fillStyle=col; g.beginPath(); a.pts.forEach(([x,z],i)=>i?g.lineTo(x,z):g.moveTo(x,z)); g.closePath(); g.fill(); }
  g.fillStyle='#454a52'; const bl=all?BLD:(()=>{ const o=[]; for(let i=Math.floor(x0/BGC);i<=Math.floor(x1/BGC);i++) for(let j=Math.floor(z0/BGC);j<=Math.floor(z1/BGC);j++){ const L=BGRID.get(rgk(i,j)); if(L) o.push(...L); } return o; })();
  // one small path per building: a single path of thousands of overlapping shapes (market kiosks) can take the canvas minutes to fill
  for(const b of bl){ if(b.skip&&!b.special) continue; const K=bCorners(b); g.beginPath(); g.moveTo(K[0][0],K[0][1]); g.lineTo(K[1][0],K[1][1]); g.lineTo(K[2][0],K[2][1]); g.lineTo(K[3][0],K[3][1]); g.closePath(); g.fill(); }
  g.lineCap='round'; g.lineJoin='round';
  for(const r of RAILS){ g.strokeStyle='#5d5a55'; g.lineWidth=4; g.beginPath(); r.forEach(([x,z],i)=>i?g.lineTo(x,z):g.moveTo(x,z)); g.stroke(); }
  for(const cls of [9,8,7,6,5,4,3,2,1,0]) for(const e of ROADS){ if(e.c!==cls) continue; const A0=nodes[e.a],B0=nodes[e.b]; if(!all&&(Math.max(A0.x,B0.x)<x0-20||Math.min(A0.x,B0.x)>x1+20||Math.max(A0.z,B0.z)<z0-20||Math.min(A0.z,B0.z)>z1+20)) continue;
    g.strokeStyle=e.c<=2?'#d9b45a':e.c<=4?'#b9bec6':COND_COL[e.cond]; g.lineWidth=Math.max(e.w,all?5:2); g.beginPath(); g.moveTo(A0.x,A0.z); g.lineTo(B0.x,B0.z); g.stroke(); }
  if(SITES.park){ const pk=SITES.park, K=obCorners(pk.cx,pk.cz,pk.hw,pk.hd,Math.cos(pk.ang),Math.sin(pk.ang)); g.fillStyle='#5a5f66'; g.beginPath(); K.forEach(([x,z],i)=>i?g.lineTo(x,z):g.moveTo(x,z)); g.closePath(); g.fill(); }
  g.fillStyle='#F2B705'; g.beginPath(); g.arc(APT.door.x,APT.door.z,7,0,7); g.fill(); }
// the minimap: a sharp picture of the 700 m around you, redrawn when you get near its edge
const MINI={c:document.createElement('canvas'),x:1e9,z:1e9,R:350,ppm:1.4}; MINI.g=MINI.c.getContext('2d',{willReadFrequently:true});   // drawn on the processor (fast for many small shapes)
function miniTile(px,pz){ if(Math.abs(px-MINI.x)<160&&Math.abs(pz-MINI.z)<160) return; const S=Math.ceil(MINI.R*2*MINI.ppm); MINI.c.width=MINI.c.height=S; MINI.x=px; MINI.z=pz;
  const g=MINI.g; g.setTransform(MINI.ppm,0,0,MINI.ppm,0,0); g.translate(-(px-MINI.R),-(pz-MINI.R)); drawWorldMap(g,px-MINI.R,pz-MINI.R,px+MINI.R,pz+MINI.R); }
// GPS: shortest path over the street graph (a small heap keeps it quick on 4,000 junctions)
function nearestNode(x,z){ let bi=0,bd=1e18; for(const e of roadsNear(x,z)) for(const i of [e.a,e.b]){ const d=(nodes[i].x-x)**2+(nodes[i].z-z)**2; if(d<bd){ bd=d; bi=i; } } if(bd<1e18) return bi;
  nodes.forEach((n,i)=>{ const d=(n.x-x)**2+(n.z-z)**2; if(d<bd){ bd=d; bi=i; } }); return bi; }
function dijkstra(s,next,N=nodes.length){ const dist=new Float64Array(N).fill(1e18), prev=new Int32Array(N).fill(-1), H=[]; dist[s]=0; H.push([0,s]);
  const up=i=>{ while(i>0){ const p=(i-1)>>1; if(H[p][0]<=H[i][0]) break; [H[p],H[i]]=[H[i],H[p]]; i=p; } }, down=i=>{ for(;;){ let m=i; const l=2*i+1, r=l+1; if(l<H.length&&H[l][0]<H[m][0]) m=l; if(r<H.length&&H[r][0]<H[m][0]) m=r; if(m===i) break; [H[m],H[i]]=[H[i],H[m]]; i=m; } };
  while(H.length){ const [d,u]=H[0]; const last=H.pop(); if(H.length){ H[0]=last; down(0); } if(d>dist[u]) continue;
    for(const w of next(u)){ const nd=d+Math.hypot(nodes[w].x-nodes[u].x,nodes[w].z-nodes[u].z); if(nd<dist[w]){ dist[w]=nd; prev[w]=u; H.push([nd,w]); up(H.length-1); } } }
  return {dist,prev}; }
function routeTo(x0,z0,x1,z1){ const s=nearestNode(x0,z0), t=nearestNode(x1,z1), {prev}=dijkstra(s,u=>nodes[u].adj);
  const path=[]; for(let u=t;u>=0;u=prev[u]){ path.unshift([nodes[u].x,nodes[u].z]); if(u===s) break; } path.unshift([x0,z0]); path.push([x1,z1]); return path; }
// street names for the big map: one label per named street, along the road
const STREETS=[]; { const byWay=new Map(); for(const e of ROADS){ if(!e.name||e.len<25) continue; const k=e.name; if(!byWay.has(k)) byWay.set(k,[]); byWay.get(k).push(e); }
  for(const [name,list] of byWay){ list.sort((p,q)=>q.len-p.len); const used=[]; for(const e of list){ const A0=nodes[e.a], x=A0.x+e.fx*e.len/2, z=A0.z+e.fz*e.len/2; if(used.some(u=>Math.hypot(u[0]-x,u[1]-z)<420)) continue; used.push([x,z]); let ang=Math.atan2(e.fz,e.fx); if(ang>Math.PI/2) ang-=Math.PI; if(ang<-Math.PI/2) ang+=Math.PI; STREETS.push({name,x,z,ang}); if(used.length>=4) break; } } }
PLACES.push({name:'Your house',sub:'Home',kind:'home',x:APT.front.x,z:APT.front.z},{name:'Mushin Police Station',sub:'Police · Area D',kind:'police',x:STATION.x,z:STATION.z});
for(const d of DISTRICTS) PLACES.push({name:d.n,sub:'Neighbourhood',kind:'place',x:d.x,z:d.z,minor:true});
const fmtDist=m=>m<1000?Math.round(m/10)*10+' m':(m/1000).toFixed(1)+' km';
const mapView=new MapView({root:$('#bigmap'),canvas:$('#bmCanvas'),image:null,bounds:MMB,places:PLACES,streets:STREETS,routeTo,fmtDist,
  detail:(g,x0,z0,x1,z1)=>drawWorldMap(g,x0,z0,x1,z1),
  getPlayer:()=>{ if(mode==='interior'){ const o=ROOM.out(); return {x:o.x,z:o.z,dir:0}; } const v=mode==='drive'?drive.v:null; return v?{x:v.x,z:v.z,dir:Math.PI/2-v.h}:{x:player.x,z:player.z,dir:Math.PI-player.yaw}; },
  onRoute:d=>{ if(d) toast('GPS set: follow the yellow line'); }});
function drawMinimap(){ const S=mm.width, R0=S/2, sc=R0/150, px=mode==='drive'?drive.v.x:player.x, pz=mode==='drive'?drive.v.z:player.z;
  miniTile(px,pz);
  mg.save(); mg.clearRect(0,0,S,S); mg.beginPath(); mg.arc(R0,R0,R0,0,Math.PI*2); mg.clip(); mg.fillStyle='#1f2226'; mg.fillRect(0,0,S,S);
  const phi=Math.atan2(Math.cos(camState.yaw),Math.sin(camState.yaw)), th=-Math.PI/2-phi;
  mg.translate(R0,R0); mg.rotate(th); mg.scale(sc,sc); mg.translate(-px,-pz);
  mg.drawImage(MINI.c,MINI.x-MINI.R,MINI.z-MINI.R,MINI.R*2,MINI.R*2);
  const rt=mapView.route; if(rt&&rt.length>1){ mg.lineJoin='round'; mg.lineCap='round'; mg.strokeStyle='#F2B705'; mg.lineWidth=7; mg.beginPath(); rt.forEach(([x,z],i)=>i?mg.lineTo(x,z):mg.moveTo(x,z)); mg.stroke(); }
  for(const v of vehicles){ if(v===drive.v) continue; if(Math.abs(v.x-px)>200||Math.abs(v.z-pz)>200) continue; mg.save(); mg.translate(v.x,v.z); mg.rotate(-v.h); mg.fillStyle=v.type==='police'?'#7fa6ff':'#e7e1d3'; mg.fillRect(-2.6,-1.1,5.2,2.2); mg.restore(); }
  mg.restore();
  const c=Math.cos(th), s=Math.sin(th);
  const mark=(wx,wz,col,label)=>{ let dx=(wx-px)*sc, dz=(wz-pz)*sc, sx=dx*c-dz*s, sy=dx*s+dz*c; const d=Math.hypot(sx,sy), lim=R0-18; if(d>lim){ sx*=lim/d; sy*=lim/d; }
    mg.fillStyle=col; mg.beginPath(); mg.arc(R0+sx,R0+sy,15,0,7); mg.fill(); mg.fillStyle='#0E1014'; mg.font='20px Bungee, Impact, sans-serif'; mg.textAlign='center'; mg.textBaseline='middle'; mg.fillText(label,R0+sx,R0+sy+1); };
  mark(APT.front.x,APT.front.z,'#F2B705','H'); mark(STATION.x,STATION.z,'#4c7dff','P'); if(RIDE.v&&RIDE.state!=='riding') mark(RIDE.v.x,RIDE.v.z,'#F2B705','T'); if(mapView.dest) mark(mapView.dest.x,mapView.dest.z,'#ffffff','•');
  mg.fillStyle='#F7EFDF'; mg.font='22px Bungee, Impact, sans-serif'; mg.textAlign='center'; mg.textBaseline='middle'; mg.fillText('N',R0+s*(R0-24),R0-c*(R0-24));
  const hd=mode==='drive'?Math.atan2(-Math.sin(drive.v.h),Math.cos(drive.v.h)):Math.atan2(Math.cos(player.yaw),Math.sin(player.yaw));
  mg.save(); mg.translate(R0,R0); mg.rotate(hd+th); mg.fillStyle='#F7EFDF'; mg.strokeStyle='#0E1014'; mg.lineWidth=4; mg.beginPath(); mg.moveTo(20,0); mg.lineTo(-13,-13); mg.lineTo(-6,0); mg.lineTo(-13,13); mg.closePath(); mg.stroke(); mg.fill(); mg.restore(); }
function openMap(){ if(!mmCache) buildMinimapCache(); mapView.image=mmCache; mapView.open(); for(const kk in K) K[kk]=false; joy.x=joy.y=0; if(document.pointerLockElement) document.exitPointerLock(); }
function nearestVehicle(maxD=3.9){ let best=null,bd=maxD; for(const v of vehicles){ if(v.wreck||v.fire) continue; const d=Math.hypot(v.x-player.x,v.z-player.z); if(d<bd&&Math.abs(v.speed)<7){ bd=d; best=v; } } return best; }
const nearDoor=()=>Math.hypot(player.x-APT.front.x,player.z-APT.front.z)<2.4;
const nearExit=()=>Math.hypot(player.x-ROOM.exit.x,player.z-ROOM.exit.z)<(ROOM===INT?1.2:1.8);
let locTick=0, mmTick=0, lastPrompt='', routeTick=0, lastMode=''; const SPEEDO=$('#speedo'), SPD=$('#spd');
function updateHUD(dt){ if(!started) return;
  locTick-=dt; if(locTick<=0){ locTick=.3; $('#loc').textContent=locationName(); }
  clockTick-=dt; if(clockTick<=0){ clockTick=.5; updateClockHUD(); }
  let txt=''; if(!busy){ if(mode==='walk'){ if(DEALER.open) txt=''; else if(rideHere()) txt='Enter your ride'; else if(nearDealer()) txt='Talk to Oga Shege (black market)'; else if(nearToll()) txt=`Pay ${naira(TOLL_FEE)} to pass`; else if(nearDoor()) txt='Enter your house'; else if(nearHotel()) txt='Enter Eko Grand Hotel'; else { const v=nearestVehicle(); if(v){ const nm=(VT[v.type]||{name:'car'}).name; txt=v===RIDE.v?'Enter your ride':v.ai?`Take this ${nm}`:(v===myCar?'Ride your okada':`Drive the ${nm}`); } } }
    else if(mode==='drive'){ if(!drive.ride&&nearToll()) txt=`Pay ${naira(TOLL_FEE)} to pass`; else if(Math.abs(drive.speed)<3) txt=drive.ride?'Get down here':'Get out'; } else if(mode==='interior'){ if(WARD.open) txt=''; else if(HL.act) txt=homePrompt(); else if(nearExit()&&T0-enteredAt>.8) txt='Go back outside'; else if(nearWard()) txt='Change clothes'; else txt=homePrompt(); } }
  if(txt!==lastPrompt){ lastPrompt=txt; $('#prompt').hidden=!txt; $('#promptTxt').textContent=txt; }
  if(mode==='drive'){ if(SPEEDO.hidden) SPEEDO.hidden=false; const k=Math.round(Math.abs(drive.speed)*3.6); if(k!==SPEEDO.k){ SPEEDO.k=k; SPD.textContent=k; } } else if(!SPEEDO.hidden) SPEEDO.hidden=true;
  if(toastT>0&&!mapView.isOpen){ toastT-=dt; if(toastT<=0) $('#toast').hidden=true; }
  if(mode!==lastMode){ lastMode=mode; const dv=mode==='drive'&&!drive.ride; $('#tHorn').hidden=!dv; $('#tBrake').hidden=!dv; $('#phoneBtn').hidden=!(mode==='walk'||(mode==='drive'&&drive.ride)); if(PHONE.open&&$('#phoneBtn').hidden) closePhone(); const fb=mode==='walk'&&fightReady(); for(const id of ['#tPunch','#tJump']) $(id).hidden=!fb; if(!fb) $('#tGrab').hidden=true; TB.k=null; weapHUD(true); $('#mmWrap').style.visibility=mode==='interior'?'hidden':'visible'; }
  if(mapView.dest&&mode!=='interior'){ const me=mapView.getPlayer(), pl=mapView.dest.place, near=14+(pl&&pl.r?pl.r:0); if(Math.hypot(me.x-mapView.dest.x,me.z-mapView.dest.z)<near){ const job=pl&&pl.job; mapView.clearRoute(); if(!job) toast('You don reach! GPS cleared.'); } else { routeTick-=dt; if(routeTick<=0){ routeTick=1.5; mapView.recompute(); } } }
  if(mapView.isOpen){ mapView.draw(); return; }
  if(mode!=='interior'){ mmTick=(mmTick+1)%3; if(!mmTick) drawMinimap(); } }

/* ================= camera ================= */
const camState={yaw:APT.ry,pitch:.26,zoom:1,last:-10,dist:4.3,shake:0};
const _t=new THREE.Vector3(), _d=new THREE.Vector3(), _c=new THREE.Vector3();
function updateCamera(dt){ let dist;
  if(mode==='drive'){ const v=drive.v; _t.set(v.x,v.y+1.5,v.z); dist=7.8+Math.abs(drive.speed)*.04;
    if(T0-camState.last>1.0){ const want=Math.atan2(Math.cos(v.h),-Math.sin(v.h)), k=Math.abs(drive.speed)>1?2.6:.6; camState.yaw=lerpA(camState.yaw,want,1-Math.exp(-k*dt)); camState.pitch+=(.2-camState.pitch)*(1-Math.exp(-2*dt)); } }
  else { _t.set(player.x+FIGHT.cx,player.y+(WARD.open?1.02:HL.act?HL.act.camH:1.55),player.z+FIGHT.cz); dist=mode==='interior'?(WARD.open?2.3:ROOM.camDist):gunOut()&&ARMS.aim?2.1:4.3; }
  dist*=camState.zoom; const cp=Math.cos(camState.pitch); _d.set(-Math.sin(camState.yaw)*cp,Math.sin(camState.pitch),-Math.cos(camState.yaw)*cp);
  if(mode!=='drive'){ let side=gunOut()&&ARMS.aim?.6:.35;   // over the shoulder; with the wardrobe open, you stand in the clear part of the screen
    if(WARD.open) side=-(WARD.px/2)/(innerWidth/2)*Math.tan(camera.fov*Math.PI/360)*camera.aspect*camState.dist;
    _t.x+=-Math.cos(camState.yaw)*side; _t.z+=Math.sin(camState.yaw)*side; }
  let d=dist; if(mode!=='interior'){ d=Math.max(.7,Math.min(d,rayDist(_t,_d,dist)-.3)); } else if(ROOM.camHit) d=Math.max(.35,Math.min(d,ROOM.camHit(_t,_d,dist)-.2));
  camState.dist+=(d-camState.dist)*(d<camState.dist?1:1-Math.exp(-4*dt));
  _c.copy(_t).addScaledVector(_d,camState.dist);
  if(mode==='interior'){ const b=ROOM.cam; _c.x=clamp(_c.x,b.x0,b.x1); _c.z=clamp(_c.z,b.z0,b.z1); _c.y=clamp(_c.y,b.y0,b.y1); }
  else { const gy=groundY(_c.x,_c.z)+.35; if(_c.y<gy) _c.y=gy; if(_c.y<water.position.y+.7) _c.y=water.position.y+.7; }
  if(camState.shake>0){ camState.shake=Math.max(0,camState.shake-dt*2.5); const s=camState.shake*.25; _c.x+=(MR()-.5)*s; _c.y+=(MR()-.5)*s; _c.z+=(MR()-.5)*s; }
  camera.position.copy(_c); camera.lookAt(_t);
  const fov=mode==='drive'?60+Math.min(14,Math.abs(drive.speed)*.4):(mode==='interior'?66:gunOut()&&ARMS.aim?50:58); if(Math.abs(camera.fov-fov)>.05){ camera.fov+=(fov-camera.fov)*(1-Math.exp(-3*dt)); camera.updateProjectionMatrix(); } }

/* ================= input ================= */
const K={}, joy={x:0,y:0}; let touchRun=false, touchBrake=false, touchUI=false;
function inputVec(){ if(WARD.open) return [0,0]; let f=0,s=0; if(K.w||K.arrowup) f+=1; if(K.s||K.arrowdown) f-=1; if(K.d||K.arrowright) s+=1; if(K.a||K.arrowleft) s-=1; f-=joy.y; s+=joy.x; return [clamp(f,-1,1),clamp(s,-1,1)]; }
// physical key positions, so AZERTY / other layouts still use the WASD spot
const CODE={KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d',ArrowUp:'arrowup',ArrowDown:'arrowdown',ArrowLeft:'arrowleft',ArrowRight:'arrowright',ShiftLeft:'shift',ShiftRight:'shift',Space:' ',KeyE:'e',KeyF:'f',KeyH:'h',KeyJ:'j',KeyK:'k',KeyM:'m',KeyC:'c',KeyG:'g',Escape:'escape',Enter:'enter'};
const keyOf=e=>CODE[e.code]||(e.key||'').toLowerCase();
addEventListener('keydown',e=>{ if(e.target&&e.target.tagName==='INPUT') return;   // typing your name
  const k=keyOf(e); if(k===' '||k==='tab'||k.startsWith('arrow')) e.preventDefault(); if(!started||e.repeat) return;
  if(DEALER.open&&(k==='escape'||k==='e')){ closeShop(); K[k]=true; return; }
  if(k==='escape'){ if(mapView.isOpen) mapView.close(); $('#settings').hidden=true; closeWard(); closePhone(); return; }
  if(k==='m'&&!K.m){ K.m=true; if(mapView.isOpen) mapView.close(); else if(mode!=='interior') openMap(); return; }
  if(mapView.isOpen) return;
  if(!K[k]){ if(k==='e'||k==='f') action(); else if(k==='g') carryGrab(); else if(k==='c') $('#settings').hidden=!$('#settings').hidden; else if(k==='h'&&mode==='drive'){ horn(); hornHeard(); } else if(k==='j'){ if(gunOut()) ARMS.trig=true; else playerAttack('punch'); } else if(k==='k'){ if(gunOut()) ARMS.aim=!ARMS.aim; else playerAttack('kick'); } else if(k==='l'||k==='q') playerDodge(); else if(k==='p') togglePhone(); else if(k>='1'&&k<='6') selectWeapon(WEAP_ORDER[+k-1]); else if(k==='tab') cycleWeapon(); else if(k==='r') reload(); else if(k===' '&&mode==='walk') playerJump(); } K[k]=true; });
addEventListener('keyup',e=>{ const k=keyOf(e); K[k]=false; if(k==='j') ARMS.trig=false; });
addEventListener('blur',()=>{ for(const k in K) K[k]=false; joy.x=joy.y=0; });
addEventListener('pointerdown',()=>{ if(AC&&started&&AC.state!=='running'&&!document.hidden) AC.resume(); },{passive:true});
document.addEventListener('visibilitychange',()=>{ if(document.hidden){ for(const kk in K) K[kk]=false; joy.x=joy.y=0; touchBrake=false; if(AC&&AC.state==='running') AC.suspend(); } else { if(AC&&started) AC.resume(); lastT=performance.now(); } });
const cvs=renderer.domElement; let dragging=false;
function look(dx,dy){ const a=gunOut()&&ARMS.aim; camState.yaw-=dx*(a?.0021:.0028); camState.pitch=clamp(camState.pitch+dy*(a?.0017:.0022),a?-.6:-.15,1.15); camState.last=T0; }
function lockPointer(){ try{ const p=cvs.requestPointerLock(); if(p&&p.catch) p.catch(()=>{}); }catch(_){} }
cvs.addEventListener('contextmenu',e=>e.preventDefault());
cvs.addEventListener('pointerdown',e=>{ if(!started||e.pointerType!=='mouse') return; if(document.pointerLockElement===cvs&&mode==='walk'){ if(gunOut()){ if(e.button===0) ARMS.trig=true; else if(e.button===2) ARMS.aim=true; } else if(e.button===0) playerAttack('punch'); else if(e.button===2) playerAttack('kick'); }
  $('#settings').hidden=true; dragging=true; if(document.pointerLockElement!==cvs) lockPointer(); $('#lookhint').hidden=true; });
addEventListener('pointerup',()=>{ dragging=false; });
document.addEventListener('mouseup',e=>{ if(e.button===0) ARMS.trig=false; else if(e.button===2&&!touchUI) ARMS.aim=false; });
document.addEventListener('mousemove',e=>{ if(!started||mapView.isOpen) return; if(document.pointerLockElement===cvs||(dragging&&e.buttons)) look(e.movementX,e.movementY); });
cvs.addEventListener('wheel',e=>{ e.preventDefault(); camState.zoom=clamp(camState.zoom+(e.deltaY>0?.08:-.08),.55,1.8); },{passive:false});
$('#setBtn').addEventListener('click',()=>{ $('#settings').hidden=!$('#settings').hidden; if(!$('#settings').hidden) closePhone(); });
$('#phoneBtn').addEventListener('click',()=>togglePhone()); $('#shopDone').addEventListener('click',()=>closeShop()); $('#weap').addEventListener('click',()=>cycleWeapon()); $('#phClose').addEventListener('click',()=>closePhone()); document.querySelectorAll('.ph-tab').forEach(t=>t.addEventListener('click',()=>{ PHONE.tab=t.dataset.tab; phoneUI(); }));
$('#mmWrap').addEventListener('click',()=>{ if(started) openMap(); });
$('#prompt').addEventListener('pointerdown',e=>{ e.preventDefault(); e.stopPropagation(); action(); });
document.querySelectorAll('#qual button').forEach(b=>{ b.setAttribute('aria-pressed',b.dataset.q===qKey?'true':'false');
  b.addEventListener('click',()=>{ if(b.dataset.q===qKey){ toast(b.textContent+' graphics already on'); return; } try{ localStorage.setItem('naija-quality',b.dataset.q); }catch(e){} toast('Restarting with '+b.textContent.toLowerCase()+' graphics…'); setTimeout(()=>location.reload(),700); }); });
document.querySelectorAll('#snd button').forEach(b=>b.addEventListener('click',()=>setSound(b.dataset.s==='on'))); setSound(soundOn);
function enableTouchUI(){ if(touchUI) return; touchUI=true; document.body.classList.add('touchui'); $('#touch').hidden=false; $('#keys').hidden=true; $('#lookhint').hidden=true;
  const zl=$('#zoneL'), zr=$('#zoneR'), jo=$('#joy'), jk=$('#joyK'); let jid=null,jx=0,jy=0; const lp=new Map(); let pinch=0;
  zl.addEventListener('pointerdown',e=>{ $('#settings').hidden=true; jid=e.pointerId; jx=e.clientX; jy=e.clientY; jo.hidden=false; jo.style.left=jx+'px'; jo.style.top=jy+'px'; try{ zl.setPointerCapture(jid); }catch(_){} });
  zl.addEventListener('pointermove',e=>{ if(e.pointerId!==jid) return; let dx=e.clientX-jx, dy=e.clientY-jy; const d=Math.hypot(dx,dy), m=50; if(d>m){ dx*=m/d; dy*=m/d; } joy.x=dx/m; joy.y=dy/m; jk.style.transform=`translate(${dx}px,${dy}px)`; jo.classList.toggle('run',Math.hypot(joy.x,joy.y)>.88); });
  const jend=e=>{ if(e.pointerId!==jid) return; jid=null; joy.x=joy.y=0; jo.hidden=true; jk.style.transform=''; jo.classList.remove('run'); }; zl.addEventListener('pointerup',jend); zl.addEventListener('pointercancel',jend);
  zr.addEventListener('pointerdown',e=>{ $('#settings').hidden=true; lp.set(e.pointerId,{x:e.clientX,y:e.clientY}); try{ zr.setPointerCapture(e.pointerId); }catch(_){} if(lp.size===2){ const [a,b]=[...lp.values()]; pinch=Math.hypot(a.x-b.x,a.y-b.y); } });
  zr.addEventListener('pointermove',e=>{ const p=lp.get(e.pointerId); if(!p) return;
    if(lp.size>=2){ p.x=e.clientX; p.y=e.clientY; const [a,b]=[...lp.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y); if(pinch>10) camState.zoom=clamp(camState.zoom*pinch/d,.55,1.8); pinch=d; return; }
    look((e.clientX-p.x)*1.6,(e.clientY-p.y)*1.6); p.x=e.clientX; p.y=e.clientY; });
  const lend=e=>{ lp.delete(e.pointerId); pinch=0; }; zr.addEventListener('pointerup',lend); zr.addEventListener('pointercancel',lend);
  $('#tE').addEventListener('pointerdown',e=>{ e.preventDefault(); action(); });
  $('#tGrab').addEventListener('pointerdown',e=>{ e.preventDefault(); if(gunOut()) ARMS.aim=!ARMS.aim; else carryGrab(); });
  const tb=$('#tBrake'); tb.addEventListener('pointerdown',e=>{ e.preventDefault(); touchBrake=true; tb.classList.add('on'); }); for(const ev of ['pointerup','pointercancel','pointerleave']) tb.addEventListener(ev,()=>{ touchBrake=false; tb.classList.remove('on'); });
  $('#tHorn').addEventListener('pointerdown',e=>{ e.preventDefault(); horn(); hornHeard(); });
  $('#tPunch').addEventListener('pointerdown',e=>{ e.preventDefault(); tapAttack(); }); for(const ev of ['pointerup','pointercancel','pointerleave']) $('#tPunch').addEventListener(ev,()=>{ ARMS.trig=false; });
  $('#tJump').addEventListener('pointerdown',e=>{ e.preventDefault(); if(fightNear()) playerDodge(); else playerJump(); }); }
// one ATTACK button: tap, tap, tap = jab, cross and the kick that floors him (running: a takedown); with a gun it fires
function tapAttack(){ if(gunOut()){ ARMS.trig=true; return; } const nxt=T0-FIGHT.swingT<1.05?FIGHT.chain+1:0; playerAttack(nxt>=2&&FIGHT.chain>=0?'kick':'punch'); }
// a fight going on around you: JUMP becomes DODGE
const fightNear=()=>mode==='walk'&&(FIGHT.near||(FIGHT.foe&&FIGHT.foeT>0&&FIGHT.foe.state!=='down'&&FIGHT.foe.state!=='dead'&&Math.hypot(FIGHT.foe.x-player.x,FIGHT.foe.z-player.z)<5)||COPS.list.some(p=>p.atk&&Math.hypot(p.x-player.x,p.z-player.z)<4));
// the buttons that show only when they can do something: GRAB (or ROB, or AIM with a gun), JUMP or DODGE
const TB={t:0,k:null};
function touchButtons(dt){ if(!touchUI||mode!=='walk'||!fightReady()) return; if((TB.t-=dt)>0) return; TB.t=.15;
  let g='', cls='';
  if(gunOut()){ g='AIM'; cls=ARMS.aim?'on':''; }
  else if(CARRY.p) g='DROP';
  else { const f=pickFoe(2.4,1.6); if(f&&f.state!=='down'&&f.state!=='dead'){ g=ARMS.cur!=='fists'&&!f.cop&&!f.dealer&&!f.looted&&!(f.state==='fight'||f.state==='hurt')?'ROB':'GRAB'; } else { let n=null; for(const p of peds){ if(p.state==='off'||p.state==='dead'||p.carried) continue; if(Math.abs(p.x-player.x)<1.9&&Math.abs(p.z-player.z)<1.9&&Math.hypot(p.x-player.x,p.z-player.z)<1.9){ n=p; break; } } if(n) g='GRAB'; } }
  const j=fightNear()?'DODGE':'JUMP', k=g+'|'+cls+'|'+j; if(k===TB.k) return; TB.k=k;
  const b=$('#tGrab'); b.hidden=!g; if(g){ b.textContent=g; b.classList.toggle('on',cls==='on'); b.classList.toggle('fightb',g==='ROB'); }
  const J=$('#tJump'); J.textContent=j; J.classList.toggle('fightb',j==='DODGE'); }
if(isTouch) enableTouchUI(); else addEventListener('touchstart',()=>enableTouchUI(),{once:true,passive:true});
let rotateSeen=false; function checkRotate(){ if(started&&innerWidth>innerHeight) rotateSeen=true; const show=touchUI&&started&&!rotateSeen&&innerHeight>innerWidth&&innerWidth<700; $('#rotate').hidden=!show; }
$('#rotateOk').addEventListener('click',()=>{ rotateSeen=true; checkRotate(); }); addEventListener('resize',checkRotate);

/* ================= actions ================= */
let enteredAt=0;
async function fadeSwap(fn){ busy=true; $('#fade').classList.add('on'); await new Promise(r=>setTimeout(r,380)); fn(); await frameWait(); $('#fade').classList.remove('on'); busy=false; }
function action(){ if(busy||!started) return;
  if(mode==='walk'){ if(DEALER.open) return closeShop(); if(rideHere()) return rideEnter(); if(nearDealer()) return openShop(); { const tg=nearToll(); if(tg) return payToll(tg); } if(nearDoor()) return enterApt(); if(nearHotel()) return enterHotel(); if(JACK.go||(hero&&hero.ov&&hero.ov.name==='threaten')) return; const v=nearestVehicle(); if(v&&v===RIDE.v){ if(RIDE.state==='waiting'||Math.abs(v.speed)<1.5) rideEnter(); return; } if(v) return v.ai?carjack(v):enterCar(v); }
  else if(mode==='drive'){ { const tg=nearToll(); if(tg&&!drive.ride) return payToll(tg); } if(drive.ride){ if(Math.abs(drive.speed)<3) rideExit(true); else toast('Tell am to stop first, or skip the ride on your phone'); return; } if(Math.abs(drive.speed)<3) exitCar(); else toast('Slow down first'); }
  else if(mode==='interior'){ if(WARD.open) closeWard(); else if(HL.act) homeAction(); else if(nearExit()&&T0-enteredAt>.8) exitApt(); else if(nearWard()) openWard(); else homeAction(); } }
const OPEN_RIDE={okada:1,keke:1};
function fleeFrom(v,n){ const hx=Math.cos(v.h), hz=-Math.sin(v.h), lx=hz, lz=-hx; const far=peds.filter(p=>p.state!=='off'&&!p.spot).sort((a,b)=>Math.hypot(b.x-player.x,b.z-player.z)-Math.hypot(a.x-player.x,a.z-player.z));
  for(let i=0;i<n&&i<far.length;i++){ const p=far[i], side=i%2?-1:1; Object.assign(p,{x:v.x+lx*1.6*side+hx*mrr(-1,1),z:v.z+lz*1.6*side+hz*mrr(-1,1),y:SLAB,state:'flee',timer:mrr(4,6),fall:0,phone:false,yaw:Math.atan2(lx*side,lz*side)+mrr(-.6,.6)}); } }
// the driver of a car you take: pulled out on your side and thrown on the ground
function pullOut(v){ const p=freePed(); if(!p) return; const hx=Math.cos(v.h), hz=-Math.sin(v.h), lx=hz, lz=-hx, ow=v.c.def.W/2+.7;
  wakePed(p,MR()<.45?'areaboy':mpick(['baba','areaboy','schoolboy'])); const c={x:v.x+lx*ow+hx*.4,z:v.z+lz*ow+hz*.4}; resolveCircle(c,.3);
  Object.assign(p,{x:c.x,z:c.z,y:0,state:'down',timer:mrr(2,3),downT:.5,got:0,fall:0,vx:lx*1.6,vz:lz*1.6,yaw:Math.atan2(-lx,-lz),carjacked:true,hp:HP0(p.cast)}); p.seq=(p.seq||0)+1; }
function enterCar(v){
  if(v.ai){ v.ai=null; v.speed=0; v.jacked=true; pullOut(v); fleeFrom(v,Math.max(0,Math.min(5,(v.c.seats||[]).length-1)));
    addHeat(.45); incident(v.x,v.z,'carjack');
    toast(v.type==='danfo'?'Danfo don change hand! Driver and passengers ran off.':v.type==='okada'?'"My okada!" The rider ran off.':v.type==='keke'?'"Ah, my keke!" The driver ran off.':v.type==='police'?'You took a police van. Wahala dey!':mpick(['"Oga, no wahala!" The driver bolted.','"Take am, take am!" The driver ran off.'])); }
  v.parked=false; drive.v=v; drive.speed=0; drive.steer=0; camState.last=-10;
  if(OPEN_RIDE[v.type]){ mode='drive'; seatHero(v); return; }
  if(hero){ const hx=Math.cos(v.h), hz=-Math.sin(v.h), lx=hz, lz=-hx, ow=v.c.def.W/2+1.0, sx=v.x+lx*ow+hx*.35, sz=v.z+lz*ow+hz*.35;
    Object.assign(player,{x:sx,z:sz,yaw:Math.atan2(-lx,-lz),speed:0}); player.y=groundY(sx,sz); rig.root.position.set(player.x,player.y,player.z); rig.root.rotation.y=player.yaw;
    const a=hero.act; heroQuiet(); a.car.reset(); a.car.paused=false; a.car.timeScale=1.7; a.car.setEffectiveWeight(1); a.car.play(); hero.carT=0; mode='enter'; return; }
  mode='drive'; rig.root.visible=false; }
/* ---- carjack: you walk to the driver's door, threaten, and the driver climbs out with hands up and runs (an area boy may fight you for it) */
const JACK={go:null};
const doorOf=(v,out)=>{ const hx=Math.cos(v.h), hz=-Math.sin(v.h), lx=hz, lz=-hx, o=OPEN_RIDE[v.type], ow=v.c.def.W/2+(o?.75:out), fw=o?0:.35; return {x:v.x+lx*ow+hx*fw,z:v.z+lz*ow+hz*fw,lx,lz,hx,hz}; };
function carjack(v){ if(mode!=='walk'||FIGHT.ko||(hero&&hero.ov&&hero.ov.lock)) return; if(CARRY.p) carryDrop();
  if(!hero||!hero.act.threaten){ v.ai=null; v.speed=0; v.jacked=true; jackOut(v); return enterCar(v); }   // no threatening move yet: the driver just runs
  v.ai=null; v.speed=0; v.jacked=true; v.parked=false; const d=doorOf(v,1.15), c={x:d.x,z:d.z}; resolveCircle(c,.34); JACK.go={x:c.x,z:c.z,v,t:0}; player.speed=Math.max(player.speed,1); }
function jackThreaten(v){ if(mode!=='walk'||FIGHT.ko){ return; } const d=doorOf(v,1.15); player.yaw=Math.atan2(-d.lx,-d.lz); player.speed=0;
  if(v.type==='police') addHeat(1.65,CAP.kill); else addHeat(.45); incident(v.x,v.z,'carjack');
  toast(v.type==='police'?'"Officer, come down! This van na my own now!"':mpick(['"Comot for the motor! Now now!"','"Oya come down! Come down sharp sharp!"','"Driver! Commot before I vex!"']),2.2);
  if(!heroDo('threaten',{force:true,ts:1.6,from:.05,to:.6,hits:[[.38,()=>jackOut(v)]],onEnd:()=>{ if(mode==='walk'&&!FIGHT.ko&&!drive.v&&Math.hypot(player.x-v.x,player.z-v.z)<6) enterCar(v); }})){ jackOut(v); enterCar(v); } }
function jackOut(v){ if(v.out) return; v.out=true; const p=freePed(); fleeFrom(v,Math.max(0,Math.min(5,(v.c.seats||[]).length-1)));
  if(!p) return; const d=doorOf(v,.5); wakePed(p,v.type==='police'?'areaboy':MR()<.4?'areaboy':mpick(['baba','areaboy','schoolboy','mama','lady_black']));
  const c={x:d.x+d.hx*.9,z:d.z+d.hz*.9}; resolveCircle(c,.3);
  Object.assign(p,{x:c.x,z:c.z,y:0,speed:0,atk:null,hp:HP0(p.cast),fall:0,phone:false}); react(p,'hands_up',player.x,player.z,mrr(1,1.4)); p.seq=(p.seq||0)+1;
  if(p.cast==='areaboy'&&MR()<.35) p.fightAfter=true; else p.fleeAfter=true;
  setTimeout(()=>toast(p.fightAfter?'"Ehen? You wan take my motor? I go show you!"':v.type==='okada'?'"Take am! Na only okada I get o!"':v.type==='danfo'?'"Everybody come down! Run!"':mpick(['"Take am! Take am! No wahala!"','"Oga abeg, no kill me!"','"Ah! Na my daily bread o!"']),2.2),450); }
// the player sits on okada / in keke and is seen riding
function seatHero(v){ const st=(SEATS[v.type]||[])[0]; if(!st||!v.c.hi){ rig.root.visible=false; return; }
  if(hero){ const a=hero.act; heroQuiet(); a.car.reset(); a.car.setEffectiveWeight(1); a.car.play(); a.car.time=a.car.getClip().duration-.02; a.car.paused=true; hero.mixer.update(0);
    v.c.hi.add(rig.root); rig.root.position.set(0,0,0); rig.root.rotation.set(0,0,0); rig.root.updateMatrixWorld(true);
    const hp=hero.hips.getWorldPosition(new THREE.Vector3()); v.c.hi.worldToLocal(hp); const RS=HERO_RIDE[v.type]||{x:0,y:0,z:0,ry:0};
    rig.root.rotation.y=RS.ry; rig.root.updateMatrixWorld(true); const hp2=hero.hips.getWorldPosition(new THREE.Vector3()); v.c.hi.worldToLocal(hp2);
    rig.root.position.set(st.x+RS.x-hp2.x,(st.y+RS.y)-hp2.y,st.z+RS.z-hp2.z); }
  else { v.c.hi.add(rig.root); poseSeat(rig,st.k); rig.root.position.set(st.x,st.y-.86,st.z); rig.root.rotation.set(0,Math.PI/2,0); }
  rig.root.visible=true; }
function unseatHero(){ if(rig.root.parent!==scene){ scene.add(rig.root); rig.root.rotation.set(0,0,0); } rig.root.traverse(o=>{ if(o.isMesh) o.castShadow=true; }); if(hero){ const a=hero.act; a.car.stop(); a.car.paused=false; a.idle.setEffectiveWeight(1); hero.w.idle=1; hero.w.walk=hero.w.run=0; } }
function exitCar(){ const v=drive.v, hx=Math.cos(v.h), hz=-Math.sin(v.h); let placed=false;
  for(const [lx,lz] of [[hz,-hx],[-hz,hx]]){ for(const dd of [v.c.def.W/2+.8,v.c.def.W/2+1.4]){ const c={x:v.x+lx*dd,z:v.z+lz*dd}; let clear=onLand(c.x,c.z)&&!resolveCircle({...c},.34);
      if(clear) for(const o of vehicles){ if(o!==v&&Math.hypot(o.x-c.x,o.z-c.z)<o.c.def.L/2+.4){ clear=false; break; } }
      if(clear){ player.x=c.x; player.z=c.z; placed=true; break; } } if(placed) break; }
  if(!placed){ for(const s of [1,-1]){ const c={x:v.x+hx*(v.c.def.L/2+1)*s,z:v.z+hz*(v.c.def.L/2+1)*s}; if(onLand(c.x,c.z)&&!resolveCircle({...c},.34)){ player.x=c.x; player.z=c.z; placed=true; break; } } }
  if(!placed){ player.x=v.x; player.z=v.z; }
  unseatHero(); player.y=groundY(player.x,player.z); player.yaw=Math.atan2(hx,hz); player.speed=0; v.speed=0; v.parked=true; drive.v=null; drive.speed=0; drive.ride=false; mode='walk'; rig.root.visible=true; headSpot.intensity=0; BEAM.visible=false; }
async function enterApt(){ if(busy) return;
  if(!MYROOM.ready&&!MYROOM.failed&&MANIFEST['assets/models/room.glb']){ toast('Opening your room…',4); busy=true; try{ await loadMyRoom(); }catch(e){} busy=false; }
  fadeSwap(()=>{ ROOM=INT; mode='interior'; enteredAt=T0; INT.scene.add(rig.root); const s=INT.spawn||{x:0,z:3.3,ry:Math.PI};
    Object.assign(player,{x:s.x,z:s.z,y:0,yaw:s.ry,speed:0}); Object.assign(camState,{yaw:s.ry,pitch:.22,dist:INT.camDist}); setScene(INT.scene); if(INT.home) homeDirt(); toast(INT.home&&HL.dirt.length>2?'Home sweet home. The house don dirty small: the broom dey near the bucket.':'Home sweet home'); }); }
function exitApt(){ closeWard(); homeLeave(); fadeSwap(()=>{ const o=ROOM.out(); mode='walk'; ROOM=INT; scene.add(rig.root); Object.assign(player,{x:o.x,z:o.z,y:groundY(o.x,o.z),yaw:o.ry,speed:0}); Object.assign(camState,{yaw:o.ry,pitch:.26,dist:4.3}); setScene(scene); }); }
function bump(s){ camState.shake=Math.min(1.2,camState.shake+s*.04); if(s>6) thud(); }

/* ================= simulation ================= */
function updateWalk(dt,inside){
  const [f,s]=inputVec(), cy=camState.yaw, fx=Math.sin(cy), fz=Math.cos(cy), rx=-Math.cos(cy), rz=Math.sin(cy);
  let mx=fx*f+rx*s, mz=fz*f+rz*s, jd=0;
  const jg=JACK.go; if(jg&&!inside){ jg.t+=dt; const dx=jg.x-player.x, dz=jg.z-player.z; jd=Math.hypot(dx,dz); if(jd<.2||jg.t>1.6||FIGHT.ko){ JACK.go=null; jackThreaten(jg.v); jd=0; } else { mx=dx/jd; mz=dz/jd; } }   // walking up to the driver's door
  const len=Math.hypot(mx,mz), jl=Math.hypot(joy.x,joy.y), run=K.shift||touchRun||jl>.88; let target=len>.12?(run?RUN_V:WALK_V*Math.min(1,jl>0?Math.max(.45,jl/.8):len)):0; if(CARRY.p) target=Math.min(target,RUN_V*.55); if(jd) target=Math.min(RUN_V*.75,jd*6);
  const ov=hero&&hero.ov, held=FIGHT.ko||(ov&&ov.lock);
  if(held){ target=0; if(ov&&ov.lunge){ const [a0,a1,v]=ov.lunge, k=ov.t/ov.dur; if(k>a0&&k<a1){ target=v; player.speed=v; } }
    else if(ov&&ov.foe&&ov.foe.state!=='off'){ const q=ov.foe, k=ov.t/ov.dur, dx=q.x-player.x, dz=q.z-player.z, d=Math.hypot(dx,dz);   // a blow carries you onto your man, turning with him
      if(k<ov.until+.1) player.yaw=lerpA(player.yaw,Math.atan2(dx,dz),1-Math.exp(-20*dt));
      if(k<ov.until){ const v=clamp((d-ov.stand)/Math.max(.05,(ov.until-k)*ov.dur),0,7); target=v; player.speed=v; } } }
  player.speed+=(target-player.speed)*Math.min(1,dt*(target>player.speed?6:(held?16:10)));
  const strafe=!inside&&aimingNow();
  if(strafe){ player.yaw=lerpA(player.yaw,Math.atan2(AIM.dir.x,AIM.dir.z),1-Math.exp(-(ARMS.aim?30:14)*dt)); target=Math.min(target,WALK_V*.85); }
  else if(len>.12&&!held) player.yaw=lerpA(player.yaw,Math.atan2(mx/len,mz/len),1-Math.exp(-12*dt));
  else if(!held&&!inside&&(FIGHT.near||T0-FIGHT.lastAtk<3)){ const t=lockFoe(); if(t) player.yaw=lerpA(player.yaw,Math.atan2(t.x-player.x,t.z-player.z),1-Math.exp(-10*dt)); }   // in a fight you keep facing your man
  let ex=0, ez=0; const DS=FIGHT.dash; if(DS){ DS.t+=dt; const k=Math.max(0,1-DS.t/DS.dur)*1.6; ex=DS.vx*k*dt; ez=DS.vz*k*dt; if(DS.t>=DS.dur) FIGHT.dash=null; }   // a dodge slides you aside
  if(strafe&&len>.12){ ex+=mx/len*player.speed*dt; ez+=mz/len*player.speed*dt; }
  const nx=player.x+(strafe?0:Math.sin(player.yaw)*player.speed*dt)+ex, nz=player.z+(strafe?0:Math.cos(player.yaw)*player.speed*dt)+ez;
  if(inside){ if(ROOM.move) ROOM.move(nx,nz); else { const b=ROOM.bounds, c={x:clamp(nx,b.x0,b.x1),z:clamp(nz,b.z0,b.z1)}; resolveCircle(c,.32,ROOM.cols); player.x=c.x; player.z=c.z; player.y=0; } }
  else { let x=nx, z=nz; if(!onLand(x,player.z)) x=player.x; if(!onLand(x,z)) z=player.z; const c={x,z}; resolveCircle(c,.34,null,player.y); player.x=c.x; player.z=c.z;
    if(player.y<2) for(const v of vehicles){ const dx=player.x-v.x, dz=player.z-v.z; if(Math.abs(dx)>4||Math.abs(dz)>4) continue; const hx=Math.cos(v.h), hz=-Math.sin(v.h), al=dx*hx+dz*hz, lat=-dx*hz+dz*hx, ex=v.c.def.L/2+.3-Math.abs(al), ey=v.c.def.W/2+.3-Math.abs(lat);
      if(ex>0&&ey>0){ if(ey<ex){ const g=Math.sign(lat)||1; player.x+=-hz*g*ey; player.z+=hx*g*ey; } else { const g=Math.sign(al)||1; player.x+=hx*g*ex; player.z+=hz*g*ex; }
        if(Math.abs(v.speed)>5&&FIGHT.carT<=0&&!FIGHT.dead&&v!==drive.v) carHitPlayer(v,Math.abs(v.speed)); } }
    const gy=walkY(player.x,player.z,player.y); player.y+=(gy-player.y)*Math.min(1,dt*14); }
  player.ph+=dt*(player.speed<3?player.speed*4.3:10+(player.speed-3)*.3);
  rig.root.position.set(player.x,player.y,player.z); rig.root.rotation.y=player.yaw;
  if(hero){ heroAnim(dt,player.speed); return; } const sn=player.speed<.05?0:(player.speed<=2.6?player.speed/2.6:1+(player.speed-2.6)/3.6); animHuman(rig,player.ph,sn,T0,false); }
function updateDrive(dt){ const v=drive.v, [f,s]=inputVec(), hb=K[' ']||touchBrake; let sp=drive.speed;
  if(drive.ride){ drive.speed=v.speed; player.x=v.x; player.z=v.z; headSpot.intensity=0; BEAM.visible=false; return; }   // in a booked ride the driver drives
  const DT=({bus:[.5,22],keke:[.6,16],danfo:[.8,28],okada:[1.15,31],police:[1,40]})[v.type]||[1,38];
  if(f>.1) sp+=(sp<-.2?18:9.5*DT[0]*Math.max(0,1-sp/DT[1]))*dt*f; else if(f<-.1){ sp+=(sp>.4?-20:-6)*dt*(-f); if(sp<-9) sp=-9; } else { const dec=(1.6+Math.abs(sp)*.1)*dt; sp=Math.abs(sp)<=dec?0:sp-Math.sign(sp)*dec; }
  if(hb){ const dec=24*dt; sp=Math.abs(sp)<=dec?0:sp-Math.sign(sp)*dec; }
  const maxSt=.6/(1+Math.abs(sp)/14); drive.steer+=(-s*maxSt-drive.steer)*Math.min(1,dt*6);
  v.h+=sp/2.7*Math.tan(drive.steer)*(hb&&Math.abs(sp)>4?1.5:1)*dt;
  const surf=condAt(v.x,v.z), lim=surf==='dirt'?(v.type==='okada'?.72:.55):surf==='bad'?.85:1; if(Math.abs(sp)>DT[1]*lim) sp-=Math.sign(sp)*Math.min(Math.abs(sp)-DT[1]*lim,dt*(surf==='dirt'?7:4));
  const fx=Math.cos(v.h), fz=-Math.sin(v.h); let nx=v.x+fx*sp*dt, nz=v.z+fz*sp*dt;
  { const ph=bumpPothole(v,fx,fz,Math.abs(sp),true); if(ph){ const hit=ph.depth*Math.min(Math.abs(sp),16); camState.shake=Math.min(1.4,camState.shake+hit*.08); if(hit>3){ clunk(Math.min(1,hit/10)); sp*=1-Math.min(.22,hit*.012); } if(hit>9&&!ph.told){ ph.told=1; toast(mpick(['Ehn! This pothole no get mercy','Lagos road wahala!','Small small, this road don spoil'])); } } }
  if(!onLand(nx,nz,1.2)||!onLand(nx+fx*2.2,nz+fz*2.2,1.2)||!onLand(nx-fx*2.2,nz-fz*2.2,1.2)){ nx=v.x; nz=v.z; if(Math.abs(sp)>4) bump(Math.abs(sp)); if(Math.abs(sp)>8) carDamage(v,(Math.abs(sp)-8)*3); sp*=-.25; }
  const P={x:nx,z:nz}; let hit=false;
  const cr=v.c.def.W/2*.95, ck=Math.max(0,v.c.def.L/2-cr);
  for(const k of (ck>.2?[ck,-ck]:[0])){ const c={x:P.x+fx*k,z:P.z+fz*k}, ox=c.x, oz=c.z; if(resolveCircle(c,cr)){ hit=true; P.x+=c.x-ox; P.z+=c.z-oz; } }
  if(hit){ if(Math.abs(sp)>6){ bump(Math.abs(sp)); carDamage(v,(Math.abs(sp)-6)*4.5); sp*=.55; } sp*=Math.max(0,1-dt*5); }
  for(const o of vehicles){ if(o===v) continue; const dx=o.x-P.x, dz=o.z-P.z; if(Math.abs(dx)>5||Math.abs(dz)>5) continue; const d=Math.hypot(dx,dz), lim=(v.c.def.L+o.c.def.L)/2*.7;
    if(d<lim&&d>.01){ const push=lim-d; P.x-=dx/d*push; P.z-=dz/d*push; if(Math.abs(sp)>4){ bump(Math.abs(sp)); if(Math.abs(sp)>7){ carDamage(v,(Math.abs(sp)-7)*3.5); carDamage(o,(Math.abs(sp)-7)*4); } if(o.ai){ o.ai.wait=3; if(MR()<.7) setTimeout(horn,250); } } sp*=.5; } }
  v.x=P.x; v.z=P.z; drive.speed=sp; v.speed=sp; player.x=v.x; player.z=v.z;
  headSpot.intensity=ENV.spot; const bo=Math.min(.7,ENV.spot/220); BEAM.visible=bo>.03; if(BEAM.visible){ const d=v.c.def.L/2+9; BEAM.position.set(v.x+fx*d,groundY(v.x+fx*d,v.z+fz*d)+.06,v.z+fz*d); BEAM.rotation.set(-Math.PI/2,Math.atan2(-fx,-fz),0); BEAM.material.opacity=bo; } }
function pickTurn(ai,opts){ if(opts.length===1) return opts[0]; const a=nodes[ai.a], b=nodes[ai.b], fx=(b.x-a.x), fz=(b.z-a.z), L=Math.hypot(fx,fz)||1; let tot=0; const w=[];
  for(const n of opts){ const e=edgeOf(ai.b,n), c=nodes[n], dx=c.x-b.x, dz=c.z-b.z, dl=Math.hypot(dx,dz)||1, straight=(fx*dx+fz*dz)/(L*dl); let k=(e&&e.c<=4?3:e&&e.c<=6?1:.35)*(1+Math.max(0,straight)*1.5); w.push(k); tot+=k; }
  let r=MR()*tot; for(let i=0;i<opts.length;i++){ r-=w[i]; if(r<=0) return opts[i]; } return opts[opts.length-1]; }
// someone standing just ahead of a car, in its lane (people up on a footbridge don't count)
function inPath(v,fx,fz,x,z){ const dx=x-v.x, dz=z-v.z, ah=dx*fx+dz*fz; return ah>0&&ah<9&&Math.abs(-dx*fz+dz*fx)<1.7; }
// how fast traffic moves on each kind of road: the highways and big roads really move (so people use the footbridges)
const ROAD_PACE=(c,chase)=>c<=1?1.6:c===2?1.3:c<=4?1:chase?1:.8;
const brakeTo=d=>Math.sqrt(Math.max(0,d)*12);   // the speed from which a car can still stop in d metres (6 m/s²)
function updateTraffic(dt){
  for(const v of vehicles){ const ai=v.ai; if(!ai) continue; const fx=Math.cos(v.h), fz=-Math.sin(v.h);
    const sc=ai.seg.k===0?(ai.cond||'good'):'good'; let target=ai.seg.k===1?Math.min((ai.seg.vmax||6.5)*(ai.chase?1.3:1),ai.maxV):ai.maxV*(sc==='dirt'?(ai.chase?.75:.5):sc==='bad'?(ai.chase?.85:.7):1)*ROAD_PACE(ai.ec,ai.chase), waiting=false; if(ai.wait>0){ ai.wait-=dt; target=0; waiting=true; }
    if(ai.seg.k===0){ const nb=nodes[ai.b], dist=ai.seg.len-ai.s;
      if(v.type==='danfo'&&ai.stopAt>0&&ai.s>=ai.stopAt){ ai.stopAt=-1; ai.wait=mrr(4,8); target=0; waiting=true; }
      if(nb.tl&&!ai.chase){ const st=lightAt(nb,ai.seg.fx,ai.seg.fz); if(st!=='g'&&!(st==='y'&&dist<8)){ const lim=Math.min(brakeTo(dist-.8),Math.max(0,(dist-.8)*.8)+1.2*Math.min(1,dist/6)); if(lim<target){ target=lim; if(dist<30) waiting=true; } } }
      else if(nb.deg>=3&&dist<10&&!ai.chase){   // no lights: wait for whoever is already crossing, and give way to the bigger road
        let stop=nb.occ&&nb.occ!==v&&nb.occ.ai&&T0-nb.occT<5;
        if(!stop&&nb.big!==undefined&&ai.ec>nb.big+1) for(const o of vehicles){ const oa=o.ai; if(o===v||!oa||oa.b!==nb.i||oa.seg.k!==0||oa.ec>nb.big+1||Math.abs(o.speed)<1.5) continue; if(oa.seg.len-oa.s<22){ stop=true; break; } }
        if(stop){ const lim=Math.max(0,(dist-2)*.8); if(lim<target){ target=lim; waiting=true; } } } }
    if(ai.goal){ const G=ai.goal, dx=G.x-v.x, dz=G.z-v.z, ah=dx*fx+dz*fz, lat=Math.abs(-dx*fz+dz*fx);   // a booked ride pulls up level with you (or your stop)
      if(lat<11&&ah>-3&&ah<40) target=Math.min(target,Math.max(0,ah*.7)); G.near=lat<11&&Math.abs(ah)<4; }
    if(ai.chase){ const G=ai.raid?RAID:player, dx=G.x-v.x, dz=G.z-v.z, ah=dx*fx+dz*fz, lat=Math.abs(-dx*fz+dz*fx), at=ai.raid?RAID.node:CHASE.at, cg=!ai.raid&&mode!=='drive'?CHASE.g:null, mine=cg?(ai.a===cg.a&&ai.b===cg.b)||(ai.a===cg.b&&ai.b===cg.a):ai.a===at||ai.b===at;   // police pull up beside you
      if((mine||lat<22)&&ah>-3&&ah<45) target=Math.min(target,Math.max(0,ah*.8)); ai.near=mine&&lat<45&&Math.abs(ah)<6; }   // (on the street nearest you they stop level with you and wait, even if you are back from the road)
    if(ai.ghost>0) ai.ghost-=dt; else {
      const look=Math.max(22,Math.abs(v.speed)*2.4+8);   // fast cars look further ahead
      for(const o of vehicles){ if(o===v) continue; const dx=o.x-v.x, dz=o.z-v.z; if(Math.abs(dx)>look||Math.abs(dz)>look) continue; const ah=dx*fx+dz*fz; if(ah<=0||ah>look) continue;
        if(Math.abs(-dx*fz+dz*fx)<(v.c.def.W+o.c.def.W)/2+.12){ const gap=ah-((v.c.def.L+o.c.def.L)/2+1.8), os=Math.max(0,(Math.cos(o.h)*fx-Math.sin(o.h)*fz)*o.speed);
          const lim=Math.max(0,Math.min(gap*1.3+os*.9,brakeTo(gap)+os*.95)); if(lim<target){ target=lim; if(o.ai&&o.ai.waiting) waiting=true; } } }
      if((mode==='walk'||mode==='enter')&&inPath(v,fx,fz,player.x,player.z)) target=0;
      for(const p of peds) if(p.state!=='down'&&p.state!=='off'&&p.state!=='dead'&&!p.carried&&p.y<1&&Math.abs(p.x-v.x)<10&&Math.abs(p.z-v.z)<10&&inPath(v,fx,fz,p.x,p.z)) target=0; }
    if(ai.hs){ const r=busStopFor(v,ai,fx,fz,target); target=r; if(target===0) waiting=true; }
    ai.waiting=waiting;
    v.speed+=clamp(target-v.speed,-10*dt,3.5*dt);
    if((waiting&&!ai.chase)||v.speed>.5) ai.stuck=0; else if(target<.2&&!ai.near){ ai.stuck+=dt; if(ai.stuck>(ai.chase?2.5:8)){ ai.ghost=2.5; ai.stuck=0; } }   // police push through
    ai.s+=v.speed*dt; let guard=0;
    while(ai.s>=ai.seg.len&&guard++<4){ ai.s-=ai.seg.len;
      if(ai.seg.k===0){ const out=nodes[ai.b].out; let opts=out.filter(n=>n!==ai.a); if(v.type==='bus') { const big=opts.filter(n=>{ const e=edgeOf(ai.b,n); return e&&e.c<=4; }); if(big.length) opts=big; }
        if(!opts.length){ if(out.includes(ai.a)) opts=[ai.a]; else { placeCar(v,120,250); break; } }
        ai.na=ai.chase||ai.goal?chaseTurn(v,opts):pickTurn(ai,opts); ai.seg=turnSeg(ai.a,ai.b,ai.na); const nd=nodes[ai.b]; if(nd.deg>=3){ nd.occ=v; nd.occT=T0; } }
      else { const passed=nodes[ai.b]; if(passed.occ===v) passed.occ=null; ai.a=ai.b; ai.b=ai.na; ai.seg=lineSeg(ai.a,ai.b); const e=edgeOf(ai.a,ai.b); ai.cond=e?e.cond:'good'; ai.ec=e?e.c:6; ai.stopAt=(v.type==='danfo'&&MR()<.35&&ai.ec<=6)?ai.seg.len*mrr(.3,.65):-1; } }
    segPos(ai.seg,ai.s,_sp); v.x=_sp.x; v.z=_sp.z; v.h=Math.atan2(-_sp.dz,_sp.dx);
    if(!v.taxi&&(v.x-player.x)**2+(v.z-player.z)**2>340*340) placeCar(v,120,250); } }
const HI_D=Q===QUAL.low?34:Q===QUAL.medium?50:70, OCC_D=Q===QUAL.low?30:Q===QUAL.medium?45:60;
function bumpPothole(v,fx,fz,sp,isPlayer){ if(v.phCool>0||sp<1.5) return null; const L=v.c.def.L*.32;
  for(const s of [1,-1]){ const p=potholeAt(v.x+fx*L*s,v.z+fz*L*s); if(p){ v.phCool=.32; v.bobV-=p.depth*Math.min(sp,14)*(v.type==='okada'?.13:.085)*(isPlayer?1.6:1); v.pitchV=(v.pitchV||0)+s*p.depth*Math.min(sp,12)*.012; return p; } } return null; }
function syncCar(v,dt){ const c=v.c, fx=Math.cos(v.h), fz=-Math.sin(v.h), d2=(v.x-camera.position.x)**2+(v.z-camera.position.z)**2, far=Q.draw+40; c.g.visible=d2<far*far&&mode!=='interior'; if(!c.g.visible) return;
  const sp=Math.abs(v.speed); v.phCool-=dt;
  if(v!==drive.v&&d2<80*80) bumpPothole(v,fx,fz,sp,false);
  const surf=condAt(v.x,v.z); if(surf==='dirt'&&sp>2&&MR()<dt*6) v.bobV+=(MR()-.5)*Math.min(1,sp/9)*(v.type==='okada'?.9:.5); else if(surf==='bad'&&sp>3&&MR()<dt*3) v.bobV+=(MR()-.5)*.3;
  v.bobV+=(-95*v.bob-10*v.bobV)*dt; v.bob+=v.bobV*dt; v.bob=clamp(v.bob,-.14,.12); v.pitchV=(v.pitchV||0)*Math.exp(-6*dt); v.pitch=(v.pitch||0)+v.pitchV*dt*8; v.pitch*=Math.exp(-5*dt);
  const gy=groundY(v.x,v.z); v.y+=(gy-v.y)*Math.min(1,dt*10); const yA=groundY(v.x+fx*2,v.z+fz*2), yB=groundY(v.x-fx*2,v.z-fz*2);
  let w=(v.h-v.lastH); w=((w+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI; v.lastH=v.h; const om=dt>0?w/dt:0;
  const steer=v===drive.v?drive.steer:clamp(Math.atan(om*c.def.L*.62/Math.max(sp,1.5)),-.55,.55); v.steerVis+=(steer-v.steerVis)*Math.min(1,dt*8);
  const leanT=v.type==='okada'||v.type==='keke'?clamp(-om*sp*(v.type==='okada'?.075:.02),-.5,.5):0; v.lean+=(leanT-v.lean)*Math.min(1,dt*5);
  c.g.position.set(v.x,v.y+v.bob-(v.wreck?.12:0),v.z); c.g.rotation.set(v.lean+(v.wreck?.07:0),v.h,Math.atan((yA-yB)/4)*.9+v.pitch+(v.wreck?.03:0));
  const near=d2<HI_D*HI_D||v===drive.v; if(c.hi){ c.hi.visible=near||!c.lo.children.length; c.lo.visible=!c.hi.visible; }
  if(c.occ){ c.occ.visible=c.hi.visible&&d2<OCC_D*OCC_D&&!!v.ai; }
  if(!near&&c.lo&&c.lo.children.length) return;
  for(const wh of c.wheels){ wh.spin.rotation.z-=v.speed*dt/(wh.r||c.def.r); if(wh.front&&!wh.bar) wh.piv.rotation.y=v.steerVis; }
  if(c.steerG) c.steerG.userData.inner.rotation.y=v.steerVis*1.15; }
// hit by a car: knocked down and hurt; a second hard hit (or one at highway speed) kills
function knock(p,v,fx,fz,sp){ if(sp>=7) p.carHits=(p.carHits||0)+(sp>=15?2:1); bleed(p.x,1,p.z,fx,fz,sp>=7?10:4,sp*.35);
  if(p.carHits>=2) return killPed(p,fx,fz,sp*.5,v===drive.v?'car':'traffic');
  if(sp>=7) bloodPool(p.x+fx*1.5,p.z+fz*1.5,.7,2.5);
  p.state='down'; p.timer=3.6; p.kx=v.x; p.kz=v.z; p.downT=0; p.got=0; p.atk=null; p.seq=(p.seq||0)+1; p.fall=0; p.phone=false; p.vx=fx*sp*.45; p.vz=fz*sp*.45; p.yaw=Math.atan2(-fx,-fz);
  if(v===drive.v){ drive.speed*=.85; bump(sp*.5); toast(mpick(['Ah! Sorry o!','Ewo! Watch the road!','LASTMA go hear this one o!'])); } }
// someone dies: they lie where they fell in a spreading pool; people scream and run; if you did it the police come
function killPed(p,ux,uz,push,how){ if(p.state==='dead') return; if(p.spot){ const s=p.spot; s.peds=s.peds.filter(q=>q!==p); p.spot=null; }
  Object.assign(p,{state:'dead',deadT:0,timer:0,downT:0,fall:0,atk:null,hp:0,vx:ux*push,vz:uz*push,speed:0,phone:false,yaw:Math.atan2(-ux,-uz),carried:false}); p.seq=(p.seq||0)+1;
  bleed(p.x,1.1,p.z,ux,uz,16,2.6); p.pool=bloodPool(p.x+ux*push*.25,p.z+uz*push*.25,1.7,5);
  for(const q of peds){ if(q===p||!(q.state==='walk'||q.state==='idle'||q.state==='spot'||q.state==='react')) continue; const d=Math.hypot(q.x-p.x,q.z-p.z); if(d>28) continue;
    if(MR()<.65){ q.state='flee'; q.timer=mrr(4,8); q.yaw=Math.atan2(q.x-p.x,q.z-p.z)+mrr(-.5,.5); } else react(q,MR()<.5?'no':'argue',p.x,p.z,mrr(3,5)); }
  const near=Math.hypot(p.x-player.x,p.z-player.z)<60;
  if(how==='car'||how==='fight'||how==='gun'||how==='blast'||how==='fire'){ if(p.cop){ addHeat(1.3,CAP.cop); FIGHT.heat=Math.max(FIGHT.heat,2.65); } else addHeat(p.cast==='areaboy'?.6:1,CAP.kill); incident(p.x,p.z,'kill'); }
  if(how==='fight'||how==='gun'||how==='blast') lootPed(p,1.2);
  if(near&&sayT<=0){ sayT=6; toast(mpick(['"Ah! Dem don kill person o!"','"Jesus! Somebody call ambulance!"','"Blood of Jesus! E don die!"']),3); } }
let NPCF=0, NWALK=0;
// is this point on screen (inside the camera's view, walls aside)?
const _frus=new THREE.Frustum(), _fm=new THREE.Matrix4(), _fsph=new THREE.Sphere(); let frusF=-1;
function inView(x,y,z,r=1){ if(frusF!==NPCF){ frusF=NPCF; camera.updateMatrixWorld(); _fm.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse); _frus.setFromProjectionMatrix(_fm); } _fsph.center.set(x,y,z); _fsph.radius=r; return _frus.intersectsSphere(_fsph); }
function updatePeds(dt){ NPCF++; if(NPCF%30===0){ NWALK=0; for(const p of peds) if(p.state==='walk'&&!p.spot) NWALK++; }
  for(const p of peds){ if(p.state==='off') continue;
    const dxp=p.x-player.x, dzp=p.z-player.z, d2=dxp*dxp+dzp*dzp;
    if(d2>230*230&&!p.spot&&p.state!=='xbr'&&p.state!=='tsell'&&p.state!=='shop'&&!p.carried){ if(p.cop||p.toll){ offPed(p); continue; } if(p.body) freeBody(p);
      if(NWALK>Q.peds){ offPed(p); NWALK--; continue; }   // people who ran off after a fight go back to the pool
      p.h.root.visible=false; recast(p); placePed(p,70,170); continue; }
    if(p.cool>0) p.cool-=dt;
    if(p.state!=='down'&&p.state!=='dead'&&p.state!=='board'&&p.state!=='getup'&&p.state!=='takedown'&&p.state!=='arrest'&&!p.carried&&p.y<1) for(const v of vehicles){ const sp=Math.abs(v.speed); if(sp<2.5) continue; const dx=p.x-v.x, dz=p.z-v.z; if(Math.abs(dx)>4||Math.abs(dz)>4) continue; const fx=Math.cos(v.h), fz=-Math.sin(v.h);
      if(Math.abs(dx*fx+dz*fz)<v.c.def.L/2+.3&&Math.abs(-dx*fz+dz*fx)<v.c.def.W/2+.35){ knock(p,v,fx,fz,sp); break; } }
    if(p.state==='dead'){ p.deadT+=dt; { const c={x:p.x+p.vx*dt,z:p.z+p.vz*dt}; resolveCircle(c,.3); if(onLand(c.x,c.z)){ p.x=c.x; p.z=c.z; } } p.vx*=Math.exp(-4*dt); p.vz*=Math.exp(-4*dt);
      p.fall=Math.min(1,p.fall+dt*4); if(p.deadT>200||(p.deadT>25&&d2>150*150)||(p.deadT>8&&NPCF%10===0&&!inView(p.x,p.y+.4,p.z,1.3))){ offPed(p); continue; } }   // taken away as soon as you look away
    else if(p.state==='down'){ p.timer-=dt; p.downT=(p.downT||0)+dt; { const c={x:p.x+p.vx*dt,z:p.z+p.vz*dt}; resolveCircle(c,.3); if(onLand(c.x,c.z)){ p.x=c.x; p.z=c.z; } } p.vx*=Math.exp(-4*dt); p.vz*=Math.exp(-4*dt);
      p.fall=p.body?0:p.timer>1.2?Math.min(1,p.fall+dt*4):Math.max(0,p.fall-dt*1.8);
      if(p.timer<=0){ p.fall=0;   // get up (a real body plays the getting-up move), then quarrel or run
        const C=PEOPLE.casts[p.cast]; if(p.body&&!p.got&&C&&C.clips.stand_up){ p.got=1; p.gu=p.cast==='areaboy'&&C.clips.kip_up&&MR()<.5?'kip_up':'stand_up'; p.state='getup'; p.timer=durOf(p,p.gu)/(p.gu==='stand_up'?1.7:1.1); p.seq=(p.seq||0)+1; }
        else afterDown(p); } }
    else if(p.state==='getup'){ p.speed=0; p.timer-=dt; if(p.timer<=0) afterDown(p); }
    else if(p.state==='hurt'){ p.speed=0; p.timer-=dt; { const c={x:p.x+p.vx*dt,z:p.z+p.vz*dt}; resolveCircle(c,.3); if(onLand(c.x,c.z)){ p.x=c.x; p.z=c.z; } } p.vx*=Math.exp(-5*dt); p.vz*=Math.exp(-5*dt); if(p.timer<=0) afterHurt(p); }
    else if(p.state==='fight') fightPed(p,dt);
    else if(p.state==='takedown'){ p.speed=0; p.timer-=dt; if(p.timer<=0){ if(p.body&&p.body.hips){ const h=p.body.hips.getWorldPosition(_fv); p.x=h.x; p.z=h.z; p.body.clip=null; }   // where the move left them (switch pose at once)
        p.hp=(p.hp??HP0(p.cast))-34; Object.assign(p,{state:'down',timer:mrr(3,4.5),downT:1,got:0,vx:0,vz:0}); if(p.hp<=0) p.beaten=true; } }
    else if(p.state==='idle'){ p.speed=Math.max(0,p.speed-dt*4); p.timer-=dt; if(p.timer<=0){ p.state='walk'; p.phone=false; p.startT=1.6; } }
    else if(p.state==='react'){ p.speed=Math.max(0,p.speed-dt*5); p.yaw=lerpA(p.yaw,p.ry,Math.min(1,dt*5)); p.timer-=dt; if(p.timer<=0) endReact(p); }
    else if(p.state==='spot') spotPed(p,dt);
    else if(p.state==='board'){ boardPed(p,dt); if(p.state==='off') continue; }
    else if(p.state==='xbr'){ crossPed(p,dt); if(p.state==='off') continue; }
    else if(p.state==='tsell') tradePed(p,dt);
    else if(p.state==='arrest'){ if(!RAID.v){ p.state='flee'; p.timer=mrr(3,5); } }   // walked to the van by updateRaid
    else if(p.state==='carried'){ carriedPed(p); }
    else if(p.state==='shop') shopPed(p,dt);
    else if(p.state==='cop'||p.state==='copguard'||p.state==='toll'||p.state==='tollchase'){}   // updateCops / updateTolls move them
    else if(p.state==='flee'){ p.timer-=dt; p.speed=4.6; const c={x:p.x+Math.sin(p.yaw)*p.speed*dt,z:p.z+Math.cos(p.yaw)*p.speed*dt}; if(resolveCircle(c,.35)) p.yaw+=Math.PI*.5*dt*6; if(!onLand(c.x,c.z)){ p.yaw+=Math.PI; } else { p.x=c.x; p.z=c.z; } if(p.timer<=0) replanPed(p); }
    else { const t=p.q[0]; if(!t){ pedPlan(p); continue; } const dx=t.x-p.x, dz=t.z-p.z, d=Math.hypot(dx,dz);
      if(d<.5){ p.q.shift(); if(!p.q.length){ if(MR()<.08){ p.state='idle'; p.timer=mrr(3,7); p.phone=MR()<.6&&!CAST[p.cast].tray; p.stand=p.phone?(MR()<.55?'text':'phone'):mpick(CAST[p.cast].idle); } pedPlan(p); } }
      else { let vt=p.tw?Math.min(p.v,1.05):p.v; if(p.startT>0){ p.startT-=dt; vt*=clamp(1-p.startT/1.6,.15,1); }   // getting going after standing
        p.speed+=(vt-p.speed)*Math.min(1,dt*3); p.x+=dx/d*p.speed*dt; p.z+=dz/d*p.speed*dt; p.yaw=lerpA(p.yaw,Math.atan2(dx,dz),Math.min(1,dt*6)); } }
    // walk into someone and they answer you
    if(mode==='walk'&&started&&d2<1.8*1.8&&!(p.cool>0)&&!p.dealer&&(p.state==='walk'||p.state==='idle'||p.state==='spot')) bumped(p);
    if(p.state!=='xbr'&&!p.carried){ const gy=groundY(p.x,p.z); p.y+=(gy-p.y)*Math.min(1,dt*12); }
    if(p.body){ p.h.root.visible=false; poseBody(p,dt); if(p.cop) pedWeapon(p); else if(p.carried&&CARRY.p===p) carryPose(p); pedPhone(p); continue; }
    const vis=d2<150*150; p.h.root.visible=vis; if(!vis) continue;
    const lod=d2<45*45?1:0; if(lod!==p.lod){ p.lod=lod; p.h.root.traverse(o=>{ if(o.isMesh) o.castShadow=!!lod; }); }
    p.h.root.position.set(p.x,p.y+p.fall*.12,p.z); p.h.root.rotation.y=p.yaw; p.h.root.rotation.x=-p.fall*1.45;
    const still=p.state==='down'||p.state==='dead'||p.state==='spot'||p.state==='react'||p.state==='hurt'||p.state==='getup'||p.state==='takedown';
    const sn=p.state==='flee'?2:still?0:p.speed/1.4; p.ph+=dt*(p.state==='flee'?10:p.speed*4.4);
    animHuman(p.h,p.ph,sn,T0+p.v*7,(p.phone&&p.state==='idle')||((p.state==='spot'||p.state==='react')&&(p.act==='text'||p.act==='phone'))); } }
function updateWorld(dt){ WU.time.value=(WU.time.value+dt*.6)%1000; if(WU._n){ WU._n.offset.x+=dt*.004; WU._n.offset.y+=dt*.0025; }
  { const on=Math.floor(T0*4)%2===0; polRed.color.setRGB(on?3:.2,on?.15:.02,on?.1:.02); polBlue.color.setRGB(on?.1:.15,on?.2:.35,on?.3:3); }
  { const f=mode==='drive'?drive.v:player; fillLight.position.set(f.x-Math.sin(camState.yaw)*1.2,(f.y||0)+3.2,f.z-Math.cos(camState.yaw)*1.2); }
  const fo=mode==='drive'?drive.v:player; sun.position.set(fo.x+lightDir.x*260,lightDir.y*260,fo.z+lightDir.z*260); sun.target.position.set(fo.x,0,fo.z);
  // keep the shadow map steady: move the light in whole shadow-texel steps
  { const tex=(sun.shadow.camera.right-sun.shadow.camera.left)/Q.sh; sun.position.x=Math.round(sun.position.x/tex)*tex; sun.position.z=Math.round(sun.position.z/tex)*tex; sun.target.position.x=Math.round(sun.target.position.x/tex)*tex; sun.target.position.z=Math.round(sun.target.position.z/tex)*tex; }
  aviMat.emissiveIntensity=ENV.lamp>.3?(Math.sin(T0*3)>.2?3:.3):.6;
  PH_MAT.wet.opacity=.62+.38*ENV.wet; PH_MAT.wet.roughness=.22-.18*ENV.wet; PH_MAT.dry.color.setScalar(1-ENV.wet*.25);
  APT.ring.material.opacity=.45+.35*Math.sin(T0*3); APT.ring.scale.setScalar(1+.08*Math.sin(T0*3)); }
const _up=new THREE.Vector3(0,1,0);
// Low quality has no real-time sun shadows; soft dark spots under people and vehicles keep them standing on the ground
const BLOBS=(()=>{ if(Q.shadows) return null; const [c,g]=cv(64,64); const gr=g.createRadialGradient(32,32,2,32,32,31); gr.addColorStop(0,'rgba(0,0,0,.55)'); gr.addColorStop(.6,'rgba(0,0,0,.32)'); gr.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle=gr; g.fillRect(0,0,64,64);
  const geo=new THREE.PlaneGeometry(1,1); geo.rotateX(-Math.PI/2);
  const im=new THREE.InstancedMesh(geo,new THREE.MeshBasicMaterial({map:tx(c,true,false),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-5,polygonOffsetUnits:-5,fog:true}),96);
  im.count=0; im.frustumCulled=false; im.renderOrder=1; scene.add(im); return im; })();
/* ================= over their heads: who is gisting, quarrelling or on a call =================
   A speech bubble with dots for people talking in a group, a red one for a quarrel, a ringing phone for a call.
   Only for the nearest people with a real body (a few small pictures, redrawn three times a second). */
const HEADS={pool:[],tex:null,t:0,list:[]};
function iconTex(){ if(HEADS.tex) return HEADS.tex; const T={};
  const bubble=(g,fill,edge)=>{ g.fillStyle=fill; g.strokeStyle=edge; g.lineWidth=4; g.beginPath(); g.moveTo(14,8); g.lineTo(50,8); g.quadraticCurveTo(60,8,60,18); g.lineTo(60,36); g.quadraticCurveTo(60,46,50,46); g.lineTo(30,46); g.lineTo(18,58); g.lineTo(20,46); g.lineTo(14,46); g.quadraticCurveTo(4,46,4,36); g.lineTo(4,18); g.quadraticCurveTo(4,8,14,8); g.closePath(); g.fill(); g.stroke(); };
  const make=fn=>{ const [c,g]=cv(64,64); fn(g); const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t; };
  T.talk=[1,2,3].map(n=>make(g=>{ bubble(g,'#fff8e8','#1b1d22'); g.fillStyle='#1b1d22'; for(let i=0;i<n;i++){ g.beginPath(); g.arc(18+i*14,27,5,0,6.29); g.fill(); } }));
  T.argue=[0,1,2].map(n=>make(g=>{ bubble(g,'#e2452f','#3a0d07'); g.fillStyle='#fff'; g.font='bold 30px sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(n===1?'!!':n===2?'?!':'!',32,28+(n===1?-2:0)); }));
  T.phone=[0,1,2].map(n=>make(g=>{ g.fillStyle='#2fa65a'; g.strokeStyle='#0d3a1f'; g.lineWidth=4; g.beginPath(); g.arc(26,34,22,0,6.29); g.fill(); g.stroke();
    g.save(); g.translate(26,34); g.rotate(-.6); g.fillStyle='#fff'; g.fillRect(-4,-13,8,26); g.fillRect(-9,-15,18,7); g.fillRect(-9,8,18,7); g.restore();   // the handset
    g.strokeStyle='#fff8e8'; g.lineWidth=3.5; for(let i=0;i<=n;i++){ g.beginPath(); g.arc(30,28,26+i*7,-1.25,-.25); g.stroke(); } }));
  return HEADS.tex=T; }
function iconKind(p){ if(!p.body||p.dc>24) return null; const a=p.state==='spot'||p.state==='react'?p.act:p.state==='idle'?p.stand:null;
  if(a==='phone') return 'phone'; if(a==='argue') return 'argue'; if(a==='talk'&&(p.state==='react'||p.spot&&p.spot.peds.length>=2)) return 'talk'; return null; }
function updateIcons(dt){ if(mode==='interior'){ for(const s of HEADS.pool) s.visible=false; return; }
  if((HEADS.t-=dt)<=0){ HEADS.t=.25; const c=[]; for(const p of peds){ if(p.state==='off') continue; const k=iconKind(p); if(k) c.push([p.dc,p,k]); } c.sort((a,b)=>a[0]-b[0]); HEADS.list=c.slice(0,8); }
  const T=iconTex(); let i=0;
  for(const [,p,k] of HEADS.list){ if(!p.body||p.state==='off'||iconKind(p)!==k) continue;
    let s=HEADS.pool[i]; if(!s){ s=new THREE.Sprite(new THREE.SpriteMaterial({map:T.talk[0],transparent:true,depthWrite:false,fog:false})); s.layers.set(1); s.renderOrder=3; scene.add(s); HEADS.pool.push(s); }
    const f=Math.floor(T0*3+(p.icoOff??(p.icoOff=Math.floor(MR()*3))))%3; s.material.map=T[k][f]; const h=(CAST[p.cast]?CAST[p.cast].h:1.7)+.42+Math.sin(T0*3+i)*.03;
    s.position.set(p.x,p.y+h,p.z); s.scale.setScalar(k==='phone'?.42:.5); s.visible=true; i++; }
  for(;i<HEADS.pool.length;i++) HEADS.pool[i].visible=false; }

/* ================= blood: drops that fly from a hit, and pools under the hurt and the dead ================= */
const BLOOD=(()=>{ const N=Q===QUAL.low?90:160, M=40;
  const drops=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.032,0),new THREE.MeshBasicMaterial({color:0x6e0707,fog:true}),N); drops.count=0; drops.frustumCulled=false; scene.add(drops);
  const [c,g]=cv(128,128); for(let i=0;i<9;i++){ const r=i?mrr(10,26):40, x=i?64+mrr(-30,30):64, y=i?64+mrr(-30,30):64, gr=g.createRadialGradient(x,y,1,x,y,r);
    gr.addColorStop(0,'rgba(92,6,6,.95)'); gr.addColorStop(.7,'rgba(80,4,4,.85)'); gr.addColorStop(1,'rgba(60,0,0,0)'); g.fillStyle=gr; g.beginPath(); g.arc(x,y,r,0,7); g.fill(); }
  const geo=new THREE.PlaneGeometry(1,1); geo.rotateX(-Math.PI/2);
  const pools=new THREE.InstancedMesh(geo,new THREE.MeshStandardMaterial({map:tx(c,true,false),transparent:true,depthWrite:false,roughness:.18,metalness:.15,polygonOffset:true,polygonOffsetFactor:-5,polygonOffsetUnits:-5}),M);
  pools.count=0; pools.frustumCulled=false; pools.renderOrder=1; scene.add(pools); return {drops,pools,d:[],p:[],N,M}; })();
// a spray of drops from someone's body (dx,dz: the way the hit pushed them)
function bleed(x,y,z,dx,dz,n=6,spd=2){ if(mode==='interior') return; for(let i=0;i<n;i++){ if(BLOOD.d.length>=BLOOD.N) BLOOD.d.shift();
  BLOOD.d.push({x:x+mrr(-.1,.1),y,z:z+mrr(-.1,.1),vx:dx*spd*mrr(.3,1)+mrr(-.7,.7),vy:mrr(.4,2.2),vz:dz*spd*mrr(.3,1)+mrr(-.7,.7),s:mrr(.6,1.5)}); } }
// a pool that spreads on the ground; it dries away after a couple of minutes
function bloodPool(x,z,size,grow=3){ if(BLOOD.p.length>=BLOOD.M){ const i=BLOOD.p.findIndex(o=>o.small); BLOOD.p.splice(i>=0?i:0,1); } const o={x,z,size,s:0,grow,t:0,ry:MR()*6.28,small:size<.4}; BLOOD.p.push(o); return o; }
function updateBlood(dt){ const D=BLOOD.d, a=BLOOD.drops.instanceMatrix.array; let n=0;
  for(let i=D.length-1;i>=0;i--){ const d=D[i]; d.vy-=9.8*dt; d.x+=d.vx*dt; d.y+=d.vy*dt; d.z+=d.vz*dt; if(d.y<.02){ if(MR()<.22) bloodPool(d.x,d.z,mrr(.14,.3),.15); D.splice(i,1); } }
  for(const d of D){ _p.set(d.x,d.y,d.z); _s.setScalar(d.s); _q.identity(); _m.compose(_p,_q,_s); _m.toArray(a,n*16); n++; }
  BLOOD.drops.count=n; BLOOD.drops.instanceMatrix.needsUpdate=true;
  const P=BLOOD.p, b=BLOOD.pools.instanceMatrix.array; let m=0;
  for(let i=P.length-1;i>=0;i--){ const o=P[i]; o.t+=dt; const life=o.small?70:150; if(o.t>life+8||Math.abs(o.x-player.x)>260||Math.abs(o.z-player.z)>260) P.splice(i,1); }
  for(const o of P){ const life=o.small?70:150, k=Math.min(1,o.t/o.grow), fade=o.t>life?Math.max(0,1-(o.t-life)/8):1, sz=o.size*Math.sqrt(k)*fade;
    _q.setFromAxisAngle(_up,o.ry); _p.set(o.x,.035,o.z); _s.set(sz,1,sz*.8); _m.compose(_p,_q,_s); _m.toArray(b,m*16); m++; }
  BLOOD.pools.count=m; BLOOD.pools.instanceMatrix.needsUpdate=true; }
/* ---- stones and grass tufts in 3D on the open ground around you
   The ground is cut into 3 m cells; each cell always gets the same stones and tufts (seeded by its position), never on a
   road, a building or a market yard, thicker grass on lawns and school fields. Only the cells near the camera are drawn,
   as two instanced meshes (two draw calls). The tufts sway in the wind on the GPU. */
const SCAT=(()=>{ const CELL=3, RAD=Q===QUAL.low?20:Q===QUAL.medium?28:38, NG=Q===QUAL.low?500:Q===QUAL.medium?1100:2200, NS=Q===QUAL.low?220:Q===QUAL.medium?420:800;
  const offs=[]; const rc=Math.ceil(RAD/CELL); for(let i=-rc;i<=rc;i++) for(let j=-rc;j<=rc;j++){ const d=Math.hypot(i,j)*CELL; if(d<=RAD+CELL) offs.push([i,j,d]); } offs.sort((a,b)=>a[2]-b[2]);
  // grass tuft: three crossed cards with a painted clump of blades
  const [c,g]=cv(128,128); for(let k=0;k<46;k++){ const x0=rr(18,110), h=rr(55,122), lean=rr(-26,26), w=rr(2.2,4.6), dry=R()<.35;
    g.strokeStyle=dry?`hsl(${ri(38,52)},${ri(28,42)}%,${ri(38,54)}%)`:`hsl(${ri(68,95)},${ri(26,42)}%,${ri(20,34)}%)`; g.lineWidth=w; g.lineCap='round';
    g.beginPath(); g.moveTo(x0,128); g.quadraticCurveTo(x0+lean*.3,128-h*.6,x0+lean,128-h); g.stroke(); }
  const gt=tx(c,true,false,128); gt.wrapS=gt.wrapT=THREE.ClampToEdgeWrapping;
  const parts=[]; for(let k=0;k<3;k++){ const p=new THREE.PlaneGeometry(.62,.42); p.translate(0,.21,0); p.rotateY(k*Math.PI/3); parts.push(p); }
  const tg=mergeGeometries(parts); const nrm=tg.attributes.normal; for(let i=0;i<nrm.count;i++) nrm.setXYZ(i,0,1,0);   // lit like the ground it grows from
  const wind={value:0};
  const tm=new THREE.MeshStandardMaterial({map:gt,alphaTest:.42,side:THREE.DoubleSide,roughness:1,color:0xcfc8b8});
  tm.onBeforeCompile=sh=>{ sh.uniforms.wtime=wind; sh.vertexShader='uniform float wtime;\n'+sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    #ifdef USE_INSTANCING
      vec3 iw=instanceMatrix[3].xyz; float sway=sin(wtime*1.6+iw.x*.35+iw.z*.27)*.5+sin(wtime*2.7+iw.z*.5)*.25;
      transformed.x+=sway*.07*uv.y; transformed.z+=sway*.04*uv.y;
    #endif`); };
  tm.customProgramCacheKey=()=>'tufts';
  const tufts=new THREE.InstancedMesh(tg,tm,NG); tufts.count=0; tufts.frustumCulled=false; tufts.receiveShadow=Q.shadows; scene.add(tufts);
  // stones: a lumpy, flattened ball; every stone gets its own size, squash and colour
  const sg0=new THREE.IcosahedronGeometry(1,1); sg0.deleteAttribute('normal'); sg0.deleteAttribute('uv'); const sg=mergeVertices(sg0); const sp=sg.attributes.position;
  for(let i=0;i<sp.count;i++){ const k=.78+R()*.4; sp.setXYZ(i,sp.getX(i)*k,Math.max(-.25,sp.getY(i))*k,sp.getZ(i)*k); } sg.computeVertexNormals();
  const stones=new THREE.InstancedMesh(sg,new THREE.MeshStandardMaterial({roughness:.92,metalness:0}),NS); stones.count=0; stones.frustumCulled=false; stones.receiveShadow=Q.shadows; scene.add(stones);
  stones.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(NS*3),3);
  const SCOL=[0x8a4a2c,0x9c5a36,0x7a6e62,0xa59a8c,0x5e5650,0xb0805a].map(h=>new THREE.Color(h));
  const cache=new Map(); let lastK=null, lastT=-9;
  const NO_GRASS=new Set(['marketplace','retail','parking','fuel','industrial']);
  function inBld(x,z){ for(const b of bldNear(x,z,1)){ if(b.skip) continue; const dx=x-b.cx, dz=z-b.cz, u=b.c*dx+b.s*dz, v=-b.s*dx+b.c*dz; if(Math.abs(u)<b.w/2+.4&&Math.abs(v)<b.d/2+.4) return true; } return false; }
  function cellItems(i,j){ const key=i*100003+j; let it=cache.get(key); if(it) return it;
    let s=(Math.imul(i,73856093)^Math.imul(j,19349663))>>>0; const rnd=()=>{ s=(Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; };
    const cx=(i+.5)*CELL, cz=(j+.5)*CELL, ar=areaAt(cx,cz), kind=ar?ar.k:'';
    const lawn=AREA_ACC[kind]==='lawn', yard=NO_GRASS.has(kind)||AREA_ACC[kind]==='lot';
    const nG=yard?0:lawn?5+Math.floor(rnd()*4):kind==='school'?Math.floor(rnd()*2):(rnd()<.55?Math.floor(rnd()*4):0);   // tufts come in clumps
    const nS=lawn?(rnd()<.2?1:0):yard?(rnd()<.3?1:0):Math.floor(rnd()*3);
    it={g:[],s:[]}; const ccx=cx+(rnd()-.5)*CELL*.6, ccz=cz+(rnd()-.5)*CELL*.6;
    for(let k=0;k<nG;k++){ const x=lawn?cx+(rnd()-.5)*CELL:ccx+(rnd()-.5)*1.6, z=lawn?cz+(rnd()-.5)*CELL:ccz+(rnd()-.5)*1.6; if(roadAt(x,z,.9)||inBld(x,z)) continue; it.g.push(x,z,rnd()*6.28,.55+rnd()*.9); }
    for(let k=0;k<nS;k++){ const x=cx+(rnd()-.5)*CELL, z=cz+(rnd()-.5)*CELL; if(roadAt(x,z,.5)||inBld(x,z)) continue; const big=rnd()<.15; it.s.push(x,z,rnd()*6.28,big?.12+rnd()*.16:.04+rnd()*.07,.45+rnd()*.5,Math.floor(rnd()*SCOL.length)); }
    if(cache.size>30000) cache.clear(); cache.set(key,it); return it; }
  const _M=new THREE.Matrix4(), _P=new THREE.Vector3(), _Q=new THREE.Quaternion(), _S=new THREE.Vector3(), _Y=new THREE.Vector3(0,1,0);
  function update(dt){ wind.value=(wind.value+dt*(1+ENV.storm*2.5+ENV.rain))%1000; const on=mode!=='interior'; tufts.visible=stones.visible=on; if(!on) return;
    const ci=Math.floor(camera.position.x/CELL), cj=Math.floor(camera.position.z/CELL), k=ci+','+cj; if(k===lastK&&T0-lastT<1.5) return; lastK=k; lastT=T0;
    let ng=0, ns=0; const ta=tufts.instanceMatrix.array, sa=stones.instanceMatrix.array, scol=stones.instanceColor.array;
    for(const [di,dj] of offs){ if(ng>=NG&&ns>=NS) break; const it=cellItems(ci+di,cj+dj);
      for(let n=0;n<it.g.length&&ng<NG;n+=4){ _Q.setFromAxisAngle(_Y,it.g[n+2]); const sc=it.g[n+3]; _P.set(it.g[n],0,it.g[n+1]); _S.set(sc,sc*(.8+.4*((n*7)%5)/4),sc); _M.compose(_P,_Q,_S).toArray(ta,ng*16); ng++; }
      for(let n=0;n<it.s.length&&ns<NS;n+=6){ _Q.setFromAxisAngle(_Y,it.s[n+2]); const sc=it.s[n+3]; _P.set(it.s[n],sc*.18,it.s[n+1]); _S.set(sc,sc*it.s[n+4],sc*(.7+it.s[n+4]*.5)); _M.compose(_P,_Q,_S).toArray(sa,ns*16); SCOL[it.s[n+5]].toArray(scol,ns*3); ns++; } }
    tufts.count=ng; stones.count=ns; tufts.instanceMatrix.needsUpdate=true; stones.instanceMatrix.needsUpdate=true; stones.instanceColor.needsUpdate=true; }
  return {update,tufts,stones}; })();
function updateBlobs(){ if(!BLOBS) return; let n=0; const cx=camera.position.x, cz=camera.position.z, a=BLOBS.instanceMatrix.array;
  const put=(x,y,z,sx,sz,ry)=>{ if(n>=96) return; _q.setFromAxisAngle(_up,ry); _p.set(x,y+.03,z); _s.set(sx,1,sz); _m.compose(_p,_q,_s); _m.toArray(a,n*16); n++; };
  if(mode!=='interior'){
    if(mode!=='drive') put(player.x,player.y,player.z,1.1,1.1,0);
    for(const v of vehicles){ if(!v.c.g.visible) continue; const dx=v.x-cx, dz=v.z-cz; if(dx*dx+dz*dz>90*90) continue; put(v.x,v.y,v.z,v.c.def.L*1.05,v.c.def.W*1.25,v.h); }
    for(const p of peds){ if(p.state==='off'||p.state==='down'||p.state==='dead'||p.carried||!(p.body||p.h.root.visible)) continue; const dx=p.x-cx, dz=p.z-cz; if(dx*dx+dz*dz>60*60) continue; put(p.x,p.y,p.z,.95,.95,0); } }
  BLOBS.count=n; BLOBS.instanceMatrix.needsUpdate=true; }
let recycleT=0;
function recycleCars(dt){ recycleT-=dt; if(recycleT>0) return; recycleT=2;
  for(const v of vehicles){ if(v.ai||v===drive.v||!v.jacked||v.fire) continue; if(Math.hypot(v.x-player.x,v.z-player.z)>150&&(!v.wreck||!inView(v.x,1,v.z,4))&&placeCar(v,120,250)){ if(v.wreck) unwreck(v); v.jacked=false; v.parked=false; } } }

/* ================= real people: who they are, what they do, where =================
   mama (leopard romper)    haggles and argues at shop fronts, gists, waits at bus stops
   lady_red, lady_black     gist at shops, text while walking, wave down danfos at bus stops
   hawker (tomato tray)     walks the streets, sells at shop fronts (no phone moves: her tray would tilt)
   baba (white kaftan)      stands at compound gates and by your house, talks, takes calls
   areaboy (green shirt)    holds junction corners day and night: play-fights, argues, talks, phones
   schoolboy (uniform)      out at school times (07:00–08:30, 13:30–15:30 game time), gists at corners
   Walk into anyone and they answer (greeting, or a quarrel if you run into them); horn at them and they wave you off;
   knock someone down and they get up and argue with the driver. Danfos and kekes stop for people who wave at bus stops. */
function seeded(s){ return ()=>{ s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const SPOTS=[];
{ const SR=seeded(4242), pk=a=>a[Math.floor(SR()*a.length)];
  const free=(x,z)=>onLand(x,z)&&!onRoad(x,z)&&!resolveCircle({x,z},.3);
  const addSpot=(type,cx,cz,mem,o={})=>{ const n=mem.length, out=[];
    for(let i=0;i<n;i++){ let dx,dz,ry;
      if(o.pos){ [dx,dz,ry]=o.pos[i]; }
      else if(o.row){ const t=(i-(n-1)/2)*1.3; dx=o.ex*t; dz=o.ez*t; ry=o.face+(SR()-.5)*.5; }
      else if(n===1){ dx=dz=0; ry=o.face; }
      else { const a=(o.rot||0)+i/n*Math.PI*2, r=n===2?.62:.78; dx=Math.sin(a)*r; dz=Math.cos(a)*r; ry=Math.atan2(-dx,-dz); }
      if(!o.skipFree&&!free(cx+dx,cz+dz)) return false; out.push({cast:mem[i][0],acts:mem[i][1],dx,dz,ry}); }
    const sp={type,x:cx,z:cz,m:out,on:false,peds:[],boarding:0,hailV:null,...o}; delete sp.pos; SPOTS.push(sp); return sp; };
  const ACT={mama:['talk','argue','idle_2','no'],lady_red:['talk','sassy','idle_3','no'],lady_black:['talk','idle_4','sassy','no'],hawker:['idle_2','talk','no','idle_1'],
    baba:['talk','idle_baba','no','phone'],areaboy:['talk','fight_idle','argue','idle_1','phone'],schoolboy:['talk','idle_1','no','text']};
  const WAIT={mama:['idle_1','idle_2','phone'],lady_red:['idle_3','text'],lady_black:['idle_4','text'],hawker:['idle_2'],baba:['idle_baba','idle_1'],areaboy:['idle_1','text','phone'],schoolboy:['idle_1','text']};
  // shop fronts: haggling over tomatoes, friends gisting, a hawker selling, someone on a call
  const SHOP=[[['mama',['argue','no','talk']],['hawker',['idle_2','no','talk']]],[['lady_red',ACT.lady_red],['lady_black',ACT.lady_black]],
    [['lady_red',ACT.lady_red],['lady_black',ACT.lady_black],['mama',['talk','idle_2']]],[['mama',ACT.mama],['lady_black',['no','talk','idle_4']]],
    [['baba',['talk','idle_baba']],['areaboy',['talk','idle_1','phone']]],[['hawker',ACT.hawker],['lady_red',['talk','text','idle_3']]],[['mama',['phone','talk']]]];
  for(const pl of PLACES){ const d=pl.door; if(!d||SR()>.45) continue; const o=1.6;
    addSpot('gist',d.x+d.nx*o,d.z+d.nz*o,pk(SHOP),{rot:SR()*6.28,face:Math.atan2(d.nx,d.nz),day:true}); }
  // junction corners: area boys (day and night); near the schools, schoolboys gather after school
  const nearSchool=(x,z)=>SCHOOLS.some(sc=>sc.x!==undefined&&Math.hypot(sc.x-x,sc.z-z)<450);
  for(const n of nodes){ if(n.deg<3||n.big===0||n.ed.every(e=>e.c>=8)) continue; const arms=n.ed.map(e=>{ const o=e.a===n.i?1:-1; return {e,ang:Math.atan2(e.fz*o,e.fx*o)}; }).sort((p,q)=>p.ang-q.ang);
    for(let i=0;i<arms.length;i++){ const r=SR(); if(r>.3) continue; const p=arms[i], q=arms[(i+1)%arms.length]; let gap=q.ang-p.ang; if(gap<=0) gap+=Math.PI*2; if(gap<.6) continue;
      const mid=p.ang+gap/2, d=Math.max(n.r+2.2,(Math.max(p.e.hw,q.e.hw)+2)/Math.max(.35,Math.sin(Math.min(gap,Math.PI)/2))), x=n.x+Math.cos(mid)*d, z=n.z+Math.sin(mid)*d;
      if(r<.2||!nearSchool(x,z)){ const m=[['areaboy',ACT.areaboy],['areaboy',ACT.areaboy]]; if(SR()<.5) m.push(SR()<.6?['areaboy',ACT.areaboy]:['lady_black',['sassy','talk','text']]); addSpot('corner',x,z,m,{rot:SR()*6.28}); }
      else { const m=[['schoolboy',ACT.schoolboy],['schoolboy',ACT.schoolboy]]; if(SR()<.6) m.push(['schoolboy',ACT.schoolboy]); addSpot('school',x,z,m,{rot:SR()*6.28,school:true,day:true}); } } }
  // house fronts: the baba of the house, sometimes with his wife
  for(const g of GATES){ if(SR()>.5) continue; const x=g.x+g.nx*.6, z=g.z+g.nz*.6, face=Math.atan2(g.nx,g.nz);
    if(SR()<.7) addSpot('gate',x,z,[['baba',['idle_baba','idle_baba','phone','talk']]],{face,day:true});
    else addSpot('gate',x+g.nx*.4,z+g.nz*.4,[['baba',['talk','idle_baba']],['mama',['talk','idle_2','no']]],{rot:SR()*6.28,day:true}); }
  // your neighbour by your house
  { const rx=-APT.nz, rz=APT.nx; addSpot('home',APT.front.x+rx*2.4+APT.nx*.4,APT.front.z+rz*2.4+APT.nz*.4,[['baba',['idle_baba','talk','idle_baba','phone']]],{face:Math.atan2(-rx,-rz),day:true}); }
  // young men working out on the football pitches
  for(const a of AREAS){ if(a.k!=='pitch'||a.a<1500) continue; let x=0,z=0; for(const p of a.pts){ x+=p[0]; z+=p[1]; } x/=a.pts.length; z/=a.pts.length;
    for(const [dx,dz] of [[0,0],[9,6],[-10,-5]]) addSpot('workout',x+dx,z+dz,[['areaboy',['situps']],['schoolboy',['pushups','situps']],['areaboy',['pushups','idle_1']]],{rot:SR()*6.28,day:true}); }
  // bus stops at the kerb of the big roads (and the real ones on the map): people wait, then wave down danfos, kekes, buses and okadas
  const RIDERS=['lady_red','lady_black','mama','schoolboy','areaboy','baba','mama','lady_red'];
  const stopOn=(e,u,side,real)=>{ const A0=nodes[e.a], dx=e.fx*e.len, dz=e.fz*e.len, rx=-e.fz, rz=e.fx, off=e.hw+1.3, cx=A0.x+dx*u+rx*off*side, cz=A0.z+dz*u+rz*off*side, n=2+(SR()<.5?1:0)+(real?1:0), m=[];
    for(let i=0;i<n;i++){ const c=pk(RIDERS); m.push([c,WAIT[c]]); }
    // ex/ez: which way traffic on this side drives; ox/oz: a point on the centre line; nx/nz: towards this kerb
    const ex=e.fx*side, ez=e.fz*side; return addSpot('stop',cx,cz,m,{row:true,ex,ez,face:Math.atan2(-rx*side,-rz*side),nx:rx*side,nz:rz*side,ox:A0.x,oz:A0.z,off,name:real||''}); };
  for(const e of ROADS){ if(e.c>4||!e.drive||e.len<35) continue; const sides=e.ow?[1]:[-1,1];
    for(const side of sides){ if(SR()>(e.c<=2?.45:.22)) continue; stopOn(e,.38+SR()*.24,side,''); } }
  for(const [x,z,name] of WD.pois.stops){ const [e]=nearestRoad(x,z,q=>q.drive&&q.c<=6); if(!e) continue; const A0=nodes[e.a], u=clamp(((x-A0.x)*e.fx+(z-A0.z)*e.fz)/e.len,.2,.8), side=((x-A0.x)*-e.fz+(z-A0.z)*e.fx)>=0?1:-1;
    if(e.ow&&side<0) continue; stopOn(e,u,side,name||'Bus stop'); }
  // markets: a mallam or a market woman behind most stalls (they come out where you are), customers in front pricing and bargaining
  const SELL={baba:['talk','idle_baba','no','phone','idle_baba'],mama:['talk','argue','idle_2','no','idle_1'],hawker:['talk','idle_2','no']};
  const BUY={lady_red:['talk','argue','no','idle_3','sassy'],lady_black:['talk','no','argue','idle_4'],mama:['argue','no','talk','idle_2'],areaboy:['talk','no','idle_1','phone'],schoolboy:['idle_1','talk','no'],baba:['talk','no','idle_baba']};
  for(const m of MARKETS){ let k=0; for(const st of m.stalls){ if(SR()>.62||k>=160) continue; const c=Math.cos(st.ang), s2=Math.sin(st.ang), vx=-s2, vz=c, sd=st.side;
      const sx=st.x-vx*sd*1.05, sz=st.z-vz*sd*1.05, seller=SR()<.45?'baba':SR()<.75?'mama':'hawker', mem=[[seller,SELL[seller]]], pos=[[0,0,Math.atan2(vx*sd,vz*sd)]];
      const nb=SR()<.35?0:SR()<.7?1:2; for(let i=0;i<nb;i++){ const who=pk(['lady_red','lady_black','mama','mama','areaboy','schoolboy','baba']), u=(i-(nb-1)/2)*.9, bx=st.x+vx*sd*1.25+c*u-sx, bz=st.z+vz*sd*1.25+s2*u-sz; mem.push([who,BUY[who]]); pos.push([bx,bz,Math.atan2(-vx*sd,-vz*sd)]); }
      if(addSpot('market',sx,sz,mem,{pos,day:true,market:m})) k++; } }
  // the motor park: a queue under the shelter, conductors calling their routes by the danfos
  if(SITES.park&&SITES.park.queue){ const pk2=SITES.park, c=Math.cos(pk2.ang), s2=Math.sin(pk2.ang), [qx,,qz]=pk2.queue, face=Math.atan2(-s2*pk2.fs*-1,c*pk2.fs*-1);
    for(let g=0;g<3;g++){ const u=(g-1)*9, x=qx+c*u, z=qz+s2*u, n=4, m=[]; for(let i=0;i<n;i++){ const who=pk(RIDERS); m.push([who,WAIT[who]]); }
      addSpot('park',x,z,m,{row:true,ex:c,ez:s2,face:Math.atan2(s2*pk2.fs,-c*pk2.fs),skipFree:true,park:pk2}); }
    for(const bay of pk2.bays.filter((b,i)=>i%2===0)){ const x=bay.x+c*3.2, z=bay.z+s2*3.2; addSpot('tout',x,z,[['areaboy',['hail','talk','hail','argue']]],{face:Math.atan2(-bay.fwx,-bay.fwz),skipFree:true,park:pk2}); } }
  // school compounds: pupils in groups in the yard during school hours
  for(const sc of SCHOOLS){ if(sc.x===undefined) continue; let n=0; for(let t=0;t<80&&n<4;t++){ const x=sc.x+rr(-30,30), z=sc.z+rr(-30,30); if(!inPoly(sc.a.pts,x,z)) continue;
      const m=[['schoolboy',['talk','idle_1','no','text']],['schoolboy',['idle_1','talk','idle_2']],['schoolboy',['talk','no','idle_1']]]; if(addSpot('pupils',x,z,m,{rot:SR()*6.28,hours:[7.3,13.4]})) n++; } } }


// ---- loading the characters and moves (after the title screen shows, so the game starts as fast as before)
const PEOPLE={n:0,clips:{},casts:{}};
const purl=f=>{ const u=`assets/people/${f}.glb`, k=AV[u]||MANIFEST[u]; return k?u+'?v='+k:u; };
const _fv=new THREE.Vector3();
const cloneCast=C=>{ const o=SkeletonUtils.clone(C.tpl); if(C.v2) C2.setOutfit(o,(MR()*4)|0); return o; };   // one of our people: a random outfit
// a move made on one skeleton, fitted to another: drop bones it lacks, put the hips at this rig's own height
const ROOTMOVE=new Set(['takedown_a','takedown_v','enter_car']);   // moves where the body travels (stored as a fraction of hip height)
function fitClip(src,names,hp){ const k=src.clone(); k.tracks=k.tracks.filter(t=>names.has(t.name.split('.')[0])); const travel=ROOTMOVE.has(src.name);
  for(const t of k.tracks) if(/Hips\.position$/.test(t.name)){ const v=t.values; for(let i=0;i<v.length;i+=3){ v[i]=travel?hp.x+v[i]*hp.y:hp.x; v[i+1]*=hp.y; v[i+2]=travel?hp.z+v[i+2]*hp.y:hp.z; } } return k; }
function setupCast(id,g,c=CAST[id]){ const tpl=g.scene; let mesh=null, hips=null; const names=new Set(), feet=[];
  tpl.traverse(o=>{ if(o.isSkinnedMesh&&!mesh) mesh=o; if(o.isBone){ names.add(o.name); if(!hips&&/Hips$/.test(o.name)) hips=o; if(/(Foot|ToeBase)$/.test(o.name)) feet.push(o); } });
  if(!mesh||!hips) throw new Error('no skinned body in '+id);
  const map=mesh.material.map; if(map){ map.colorSpace=THREE.SRGBColorSpace; map.anisotropy=Math.min(4,maxAniso); }
  mesh.material=new THREE.MeshStandardMaterial({map:map||null,color:map?0xffffff:0x8a6a50,roughness:.72,metalness:0,emissive:0xffffff,emissiveMap:map||null,emissiveIntensity:0}); HERO_MATS.push(mesh.material);
  mesh.castShadow=Q.shadows; mesh.receiveShadow=true; mesh.layers.set(1);
  tpl.updateMatrixWorld(true); const bb=new THREE.Box3().setFromObject(tpl,true); mesh.computeBoundingSphere(); mesh.boundingSphere.radius*=1.35;
  const rest=feet.map(b=>b.getWorldPosition(_fv).y), hp=hips.position.clone(), mixer=new THREE.AnimationMixer(tpl), clips={}, off={};
  for(const n in PEOPLE.clips){ if((c.tray&&/^(text|phone|text_walk|fight_idle)$/.test(n))||(c.f&&n==='fight_idle')||(!c.f&&/^(f_|dance_)/.test(n))) continue;   // tray would tilt; dresses tear in a boxing crouch; women's moves stay with women
    const k=fitClip(PEOPLE.clips[n],names,hp); if(k.tracks.length<10) continue; clips[n]=k;
    if(feet.length){ const a=mixer.clipAction(k).play(), lows=[];   // how far this move lifts or sinks the feet: put them back on the ground
      for(let i=0;i<8;i++){ mixer.setTime(k.duration*(i+.5)/8); tpl.updateMatrixWorld(true); let lo=1e9; feet.forEach((b,j)=>{ lo=Math.min(lo,b.getWorldPosition(_fv).y-rest[j]); }); lows.push(lo); }
      a.stop(); lows.sort((x,y)=>x-y); off[n]=clamp(-(lows[3]+lows[4])/2,-.25,.25); } }
  mixer.stopAllAction(); mixer.uncacheRoot(tpl); tpl.updateMatrixWorld(true);
  if(c.f) for(const [a,b] of [['walk','f_walk'],['run','f_run'],['start_walk','f_start_walk'],['lie','f_lie'],...(c.fight?[['fight_idle','f_fight_idle']]:[])]) if(clips[b]){ clips[a]=clips[b]; off[a]=off[b]; }   // women walk, run, fall and stand like women
  PEOPLE.casts[id]={tpl,clips,off,y0:-bb.min.y,sc:c.h/Math.max(.5,bb.max.y-bb.min.y),f:!!c.f,idle0:['f_idle','idle_suit','idle_1','idle_baba','idle_2','idle_3','idle_4'].find(n=>clips[n]&&c.idle.includes(n))||'idle_1'};
  if(CAST[id]) PEOPLE.n++; if(map) renderer.initTexture(map); }
function heroMoves(){ if(!hero||!hero.cObj||!hero.hipsRest) return; const names=new Set(); hero.cObj.traverse(o=>{ if(o.isBone) names.add(o.name); }); const own=hero.look&&hero.look.clips;
  for(const n of ['text','phone','fight_idle','punch','kick','drop_kick','hit_head','hit_body','hit_side','hit_side_m','uppercut','stand_up','kip_up','jump','takedown_a','lie','threaten','gp','rise','hands_up']){ let k=null;
    if(own) k=own[n]; else if(PEOPLE.clips[n]) k=fitClip(PEOPLE.clips[n],names,hero.hipsRest); if(!k||k.tracks.length<10) continue; const a=hero.mixer.clipAction(k); hero.act[n]=a;
    if(n==='text'||n==='phone'||n==='fight_idle'){ a.play(); a.setEffectiveWeight(0); } }
  for(const [n,src] of [['punch_b','punch'],['gp_b','gp']]) if(hero.act[src]){ const k=hero.act[src].getClip().clone(); k.name=n; hero.act[n]=hero.mixer.clipAction(k); }
  lastMode=null; }   // show the fight buttons
async function loadPeople(){
  if(PROFILE){ loadV2(savedLook()); const me=savedLook(); if(CAST[me]) CAST[me].w=0; }   // your own person comes in alongside the moves (and no copies of you on the street)
  try{ const mv=await GLL.parseAsync(await fetchBuf(purl('moves')),''); for(const k of mv.animations) PEOPLE.clips[k.name]=k;
    if(HERO_RUN){ const k=HERO_RUN.clone(); k.name='run'; k.tracks=k.tracks.filter(t=>!/\.scale$/.test(t.name));
      for(const t of k.tracks) if(/Hips\.position$/.test(t.name)){ const v=t.values, y0=v[1]||1; for(let i=0;i<v.length;i+=3){ v[i]=0; v[i+1]/=y0; v[i+2]=0; } } PEOPLE.clips.run=k; }
    if(PEOPLE.clips.stand_up) PEOPLE.clips.lie=THREE.AnimationUtils.subclip(PEOPLE.clips.stand_up,'lie',0,3,30);   // the first moment of getting up = lying on the ground
    try{ synthMoves(); }catch(e){ console.warn('moves',e); }
    try{ heroMoves(); }catch(e){ console.warn(e); }
    PEOPLE.clipsIn=true; applySavedLook();
    let mine=null; try{ mine=localStorage.getItem('naija-look2'); }catch(e){} if(isF()&&!(mine&&LOOK_LIST.some(l=>l.id===mine&&l.f===1&&!l.file))) mine='girl';
    for(const id of Object.keys(CAST).sort((a,b)=>(b===mine)-(a===mine)||(isV2(a)-isV2(b))||CAST[b].w-CAST[a].w)){   // our big people files come last
      try{ if(isV2(id)){ if(await loadV2(id)) npcV2(id); } else setupCast(id,await GLL.parseAsync(await fetchBuf(purl(id)),'')); }catch(e){ console.warn('person '+id+' could not load',e); }
      if(id===mine) applySavedLook();   // you get your own body as soon as it is in
      await new Promise(r=>setTimeout(r,30)); }
  }catch(e){ console.warn('people files could not load; the city keeps its simple walkers',e); }
  PEOPLE.done=true; addGuests(); applySavedLook(); loadPhone(); }   // the texture decoder stays ready for the hotel and outfits, which load later

// ---- bodies: only the people nearest the camera get a real body (Low 8 within 30 m, Medium 14 / 45 m, High 24 / 65 m)
const BODY_POOL={}, BODIES=[]; let bodySlot=0;
const FROM_START=new Set(['start_walk','hail','no','argue']);
function makeBody(id){ const C=PEOPLE.casts[id], inner=cloneCast(C), root=new THREE.Group(); root.rotation.order='YXZ'; root.scale.setScalar(C.sc); root.add(inner); inner.position.y=C.y0; root.visible=false; scene.add(root);
  let hips=null; inner.traverse(o=>{ if(!hips&&o.isBone&&/Hips$/.test(o.name)) hips=o; });
  const b={id,root,inner,hips,mixer:new THREE.AnimationMixer(inner),acts:{},cur:null,clip:null,seq:-1,oy:0,acc:0,p:null,slot:bodySlot++}; BODIES.push(b); return b; }
function takeBody(id){ if(BODIES.length>=Q.npc+4){ let drop=null; for(const k in BODY_POOL) if(BODY_POOL[k].length){ drop=BODY_POOL[k].pop(); break; } if(!drop) return null;   // swap a spare body of someone else
    scene.remove(drop.root); drop.mixer.stopAllAction(); drop.mixer.uncacheRoot(drop.inner); drop.inner.traverse(o=>{ if(o.isSkinnedMesh) o.skeleton.dispose(); }); BODIES.splice(BODIES.indexOf(drop),1); }
  return makeBody(id); }
function freeBody(p){ const b=p.body; if(!b) return; dropPedWeapon(p); p.body=null; p.lod=-1; b.p=null; b.root.visible=false; b.mixer.stopAllAction(); b.cur=null; b.clip=null; (BODY_POOL[b.id]||(BODY_POOL[b.id]=[])).push(b); }
function bodyPlay(b,name,fade=.3,again=false){ if(b.clip===name&&!again) return b.cur; const C=PEOPLE.casts[b.id]; if(!C.clips[name]){ name=C.idle0; if(b.clip===name&&!again) return b.cur; } const k=C.clips[name]; if(!k) return null;
  const a=b.acts[name]||(b.acts[name]=b.mixer.clipAction(k)); if(again&&b.cur===a){ a.reset(); a.play(); return a; }
  a.reset(); a.setEffectiveWeight(1); a.setEffectiveTimeScale(1); if(ONCE.has(name)){ a.setLoop(THREE.LoopOnce,1); a.clampWhenFinished=true; } else if(!FROM_START.has(name)) a.time=MR()*k.duration; a.play();
  const first=!b.clip; if(b.cur&&b.cur!==a){ if(first) b.cur.stop(); else a.crossFadeFrom(b.cur,fade,false); }
  b.cur=a; b.clip=name; if(first) b.mixer.update(0); return a; }
function poseBody(p,dt){ const b=p.body, C=PEOPLE.casts[b.id], cl=C.clips, st=p.state; let name=C.idle0, ts=1;
  if(st==='walk'||st==='board'||st==='xbr'||st==='arrest'||st==='shop'){ if(st==='walk'&&p.startT>0&&cl.start_walk) name='start_walk';
    else if(p.speed>.12){ name=st==='walk'&&p.tw&&cl.text_walk?'text_walk':'walk'; ts=clamp(p.speed/(name==='walk'?1.35:1.14),.55,1.7); } }
  else if(st==='tsell'){ if(p.speed>.15){ name=p.speed>1.6&&cl.run?'run':'walk'; ts=clamp(p.speed/1.35,.5,1.8); } else name=p.act&&cl[p.act]?p.act:C.idle0; }
  else if(st==='idle') name=p.stand||C.idle0;
  else if(st==='spot'||st==='react') name=p.act||C.idle0;
  else if(st==='flee'){ if(cl.run){ name='run'; ts=clamp(p.speed/2.4,1.3,2.2); } else { name='walk'; ts=1.8; } }
  else if(st==='fight'){ if(p.dodgeT>0&&cl[p.dclip]){ name=p.dclip; ts=2.4; } else if(p.atk){ name=p.atk; ts=AI_INFO[p.atk].ts; } else if(p.speed>.3){ name=p.speed>2.4&&cl.run?'run':'walk'; ts=name==='run'?clamp(p.speed/2.4,1.2,2):clamp(p.speed/1.35,.7,1.6); } else name=cl.fight_idle?'fight_idle':C.idle0; }
  else if(st==='hurt'){ name=p.react||'hit_head'; ts=1.6; }
  else if(st==='down'){ name=(p.downT||0)<.45&&cl.uppercut?'uppercut':cl.lie?'lie':C.idle0; ts=name==='uppercut'?1.4:1; }   // knocked back, then lying
  else if(st==='dead'){ name=p.deadT<.4&&cl.uppercut?'uppercut':cl.lie?'lie':C.idle0; ts=1.4; }
  else if(st==='carried'){ name=cl.lie?'lie':C.idle0; }
  else if(st==='getup'){ name=p.gu; ts=p.gu==='stand_up'?1.7:1.1; }
  else if(st==='dealer'){ name=cl.phone&&Math.hypot(p.x-player.x,p.z-player.z)>9?'phone':cl.idle_1?'idle_1':C.idle0; }
  else if(st==='takedown'){ name='takedown_v'; ts=1.7; }
  else if(st==='toll'){ name=cl[p.tact]?p.tact:(cl.idle_1?'idle_1':C.idle0); }
  else if(st==='tollchase'){ if(p.speed>.3){ name=p.speed>2.4&&cl.run?'run':'walk'; ts=name==='run'?clamp(p.speed/2.4,1.2,2):clamp(p.speed/1.35,.7,1.6); } else name=cl.argue?'argue':C.idle0; }
  else if(st==='cop'||st==='copguard'){ if(p.atk){ name=p.atk; ts=AI_INFO[p.atk].ts; } else if(p.speed>.3){ name=p.speed>2.4&&cl.run?'run':'walk'; ts=name==='run'?clamp(p.speed/2.4,1.2,2):clamp(p.speed/1.35,.7,1.6); } else name=p.near&&cl.fight_idle?'fight_idle':cl.idle_1?'idle_1':C.idle0; }
  const again=b.seq!==p.seq&&ONCE.has(name); b.seq=p.seq; const a=bodyPlay(b,name,name==='lie'?.5:.25,again); if(a) a.timeScale=ts;
  b.root.position.set(p.x,p.y,p.z); b.root.rotation.set(0,p.yaw,0);
  if(p.jolt>0){ b.root.position.y+=p.jolt*.06; b.root.rotation.z=p.jolt*.05; p.jolt=Math.max(0,p.jolt-dt*7); }   // a blow on the floor shakes the body
  if(st==='shop'&&p.speed<=.12&&p.act&&cl[p.act]&&b.clip!==p.act) bodyPlay(b,p.act,.3);
  b.oy+=((C.off[b.clip]||0)-b.oy)*Math.min(1,dt*6); b.inner.position.y=C.y0+b.oy;
  if(p.stopT>0){ p.stopT-=dt; b.acc+=dt*.1; } else b.acc+=dt; const k=p.cop||p.carried||p.dc<14?1:p.dc<30?2:3; if((NPCF+b.slot)%k===0){ b.mixer.update(b.acc); b.acc=0; } }   // far bodies move at a lower rate
const _cd=new THREE.Vector3();
function assignBodies(){ if(!PEOPLE.n) return; const R=Q.npcR, cx=camera.position.x, cz=camera.position.z; camera.getWorldDirection(_cd); const list=[];
  for(const p of peds){ if(p.state==='off'){ if(p.body) freeBody(p); continue; } const dx=p.x-cx, dz=p.z-cz; p.dc=Math.hypot(dx,dz);
    if(!PEOPLE.casts[p.cast]||p.dc>(p.body?R+5:R)+(p.state==='fight'||p.state==='takedown'||p.cop?12:0)){ if(p.body) freeBody(p); continue; }
    const busyNow=p.state==='fight'||p.state==='hurt'||p.state==='down'||p.state==='dead'||p.state==='getup'||p.state==='takedown'||p.carried||p.cop&&p.state!=='walk';
    list.push([p.dc*(dx*_cd.x+dz*_cd.z<-2?2.5:1)-(p.body?4:0)-(busyNow?60:0),p]); }   // people in view first, fighters before all
  list.sort((a,b)=>a[0]-b[0]); let made=0;
  for(let i=0;i<list.length;i++){ const p=list[i][1]; if(i>=Q.npc){ if(p.body) freeBody(p); continue; } if(p.body) continue;
    const pool=BODY_POOL[p.cast]; let b=pool&&pool.length?pool.pop():null; if(!b&&made<1){ made++; b=takeBody(p.cast); } if(!b) continue;   // at most one new body per check: no hitches
    p.body=b; b.p=p; b.root.visible=true; b.cur=null; b.clip=null; b.oy=0; b.acc=0; } }

// ---- what people do
let sayT=0;
const SAY={areaboy:['"Oga, anything for the boys?"','"How far, my guy!"','"Boss, you go settle us?"'],baba:['"Ah, my son! How is work?"','"Greet your mother for me o."'],
  mama:['"My pikin, how you dey?"','"Abeg, come buy something!"'],hawker:['"Fine tomato! I go do am cheap for you!"','"Customer, come buy!"'],
  lady_red:['"Hey! How far?"','"You dey this area?"'],lady_black:['"Hi! You dey alright?"','"Ehen? How far?"'],schoolboy:['"Good %s sir!"','"Uncle, good %s!"']};
const BUMP=['"Ah ah! You no dey look road?"','"Oga, calm down o!"','"Wetin be this one now?"','"Abeg, mind yourself!"'];
function react(p,act,tx,tz,dur){ if(p.state!=='react') p.prev=p.state; p.state='react'; if(CAST[p.cast].tray&&(act==='text'||act==='phone')) act='no';
  p.act=act; p.ry=Math.atan2(tx-p.x,tz-p.z); p.timer=dur; p.cool=12; p.replan=false; }
function endReact(p){ if(p.fightAfter){ p.fightAfter=false; p.state='fight'; p.atk=null; p.atkT=.3; return; }
  if(p.fleeAfter){ p.fleeAfter=false; p.state='flee'; p.timer=mrr(3,5); p.yaw=Math.atan2(p.x-player.x,p.z-player.z); return; }
  if(p.spot){ p.state='spot'; p.act=null; nextAct(p); return; }
  if(p.prev==='idle'){ p.state='idle'; p.timer=mrr(1,3); return; }
  if(p.replan||!p.q.length) replanPed(p); p.state='walk'; p.startT=1.6; }
function bumped(p){ const fast=player.speed>WALK_V*1.3;
  react(p,fast?(MR()<.6?'argue':'no'):(MR()<.6?'talk':'sassy'),player.x,player.z,fast?mrr(3,4.5):mrr(2.5,4));   // slow: greet and wave; fast: quarrel
  if(sayT<=0&&MR()<.75){ sayT=7; const h=ENV.hour; toast(fast?mpick(BUMP):mpick(SAY[p.cast]||['"How far?"']).replace('%s',h<12?'morning':h<16?'afternoon':'evening'),2.4); } }
function hornHeard(){ if(mode!=='drive'||!drive.v) return; const v=drive.v, fx=Math.cos(v.h), fz=-Math.sin(v.h); let n=0;
  for(const p of peds){ if(!(p.state==='walk'||p.state==='idle'||p.state==='spot')||p.cool>0) continue; const dx=p.x-v.x, dz=p.z-v.z, ah=dx*fx+dz*fz; if(ah<-4||ah>24||Math.abs(-dx*fz+dz*fx)>10) continue;
    react(p,(p.cast==='areaboy'||p.cast==='mama')&&MR()<.6?'argue':'no',v.x,v.z,mrr(2.5,4)); p.cool=6; n++; }
  if(n&&sayT<=0&&MR()<.5){ sayT=6; toast(mpick(['"Who you dey horn for?!"','"We hear you o!"','"Abeg, no vex us with horn!"']),2.2); } }
function nextAct(p){ const L=p.acts&&p.acts.length?p.acts:CAST[p.cast].idle; let a=mpick(L); if(a===p.act&&L.length>1) a=mpick(L.filter(x=>x!==p.act));
  const C=PEOPLE.casts[p.cast], k=C&&C.clips[a], d=k?k.duration:6; p.act=a; p.timer=clamp(d<6?d*Math.ceil(mrr(1,2.5)):d,3.5,a==='argue'?9:a==='phone'?14:11); }
function spotPed(p,dt){ const s=p.spot; p.speed=0; let ry=p.home?p.home.ry:p.yaw;
  if(s&&s.hailV){ if(p.hv!==s.hailV){ p.hv=s.hailV; p.wants=MR()<.7; } if(p.wants){ ry=Math.atan2(s.hailV.x-p.x,s.hailV.z-p.z); p.act='hail'; p.timer=.4; } }
  if(p.act==='hail'&&!(s&&s.hailV&&p.wants)) p.timer=0;
  p.timer-=dt; if(p.timer<=0) nextAct(p);
  p.yaw=lerpA(p.yaw,ry,Math.min(1,dt*4)); }
const HAIL={danfo:1,keke:1,bus:1,okada:1}, BOARD={danfo:2,keke:2,bus:3};
function hailCheck(s){ let best=null, bd=1e9;
  for(const v of vehicles){ if(!HAIL[v.type]||!(v.ai||(mode==='drive'&&v===drive.v))||Math.abs(v.speed)<.5&&!(v.ai&&v.ai.hs===s)) continue;
    const fx=Math.cos(v.h), fz=-Math.sin(v.h); if(Math.abs(fx*s.ex+fz*s.ez)<.9) continue;   // driving along this road
    const ah=(s.x-v.x)*fx+(s.z-v.z)*fz, vl=(v.x-s.ox)*s.nx+(v.z-s.oz)*s.nz; if(ah<-1||ah>45||vl<0||vl>s.off) continue;   // coming, in the lane by the kerb
    if(ah<bd){ bd=ah; best=v; } }
  if(best!==s.hailV&&best&&!best.ai&&sayT<=0&&s.peds.length){ sayT=8; toast(best.type==='okada'?'"Okada! Okada!" Someone wants a ride.':'"Oshodi! Oshodi!" People are waving you down.',2.6); }
  s.hailV=best;
  if(best&&best.ai&&!best.ai.hs&&best.ai.hsSkip!==s&&BOARD[best.type]&&s.peds.some(p=>p.state==='spot'&&p.wants)){ if(MR()<.75){ best.ai.hs=s; best.ai.hsT=0; } else best.ai.hsSkip=s; } }
function busStopFor(v,ai,fx,fz,target){ const s=ai.hs, ah=(s.x-v.x)*fx+(s.z-v.z)*fz;
  if(!s.on||ah<-6){ ai.hs=null; ai.hsT=0; return target; }
  if(!ai.hsT){ if(ah<2.4&&Math.abs(v.speed)<1.2){ ai.hsT=1; ai.wait=Math.max(ai.wait,mrr(3.5,5.5)); boardAt(s,v); return 0; } return Math.min(target,Math.max(0,(ah-1.6)*.75)); }
  if(s.boarding>0&&ai.wait<.3) ai.wait=.3;   // wait while someone is still climbing in
  return target; }
function boardAt(s,v){ const c=s.peds.filter(p=>p.state==='spot').sort((a,b)=>(b.wants?1:0)-(a.wants?1:0)), n=Math.min(c.length,1+Math.floor(MR()*BOARD[v.type]));
  for(let i=0;i<n;i++){ const p=c[i]; p.state='board'; p.bv=v; p.timer=7; p.speed=0; s.boarding++; } }
function boardPed(p,dt){ const v=p.bv; p.timer-=dt; let done=p.timer<=0||!v||!(v.ai||v.loading);
  if(!done){ const fx=Math.cos(v.h), fz=-Math.sin(v.h), sg=-(p.x-v.x)*fz+(p.z-v.z)*fx>=0?1:-1, o=v.c.def.W/2+.3, back=v.c.def.L*.12;
    const tx=v.x-fz*sg*o-fx*back, tz=v.z+fx*sg*o-fz*back, dx=tx-p.x, dz=tz-p.z, d=Math.hypot(dx,dz);
    if(d<.45) done=true; else { p.speed+=(1.5-p.speed)*Math.min(1,dt*3); const st=Math.min(d,p.speed*dt); p.x+=dx/d*st; p.z+=dz/d*st; p.yaw=lerpA(p.yaw,Math.atan2(dx,dz),Math.min(1,dt*8)); } }
  if(done){ const s=p.spot; if(s){ s.boarding=Math.max(0,s.boarding-1); s.peds=s.peds.filter(q=>q!==p); } offPed(p); } }
function offPed(p){ if(p.body) freeBody(p); dropPedWeapon(p); returnLook(p); p.state='off'; p.spot=null; p.home=null; p.bv=null; p.hv=null;
  Object.assign(p,{hp:null,beaten:false,looted:false,kos:0,cop:0,block:0,toll:null,burnT:0,van:null,wid:null,mad:0,after:null,fleeAfter:false,fightAfter:false,carjacked:false,copHit:0,atk:null,stuckT:0,stuckN:0,detT:0}); }   // back to the pool as nobody in particular
function recast(p){ if(MR()<.35){ const c=pickCast(ENV.hour); if(c!==p.cast){ returnLook(p); p.cast=c; p.h=getLook(c); p.lod=-1; } } p.tw=MR()<CAST[p.cast].tw; p.startT=0; p.cool=0; }
function spotOn(s){ s.on=true; s.peds=[]; s.boarding=0; s.hailV=null; const night=ENV.hour>=21||ENV.hour<5.5;
  for(const m of s.m){ const p=peds.find(q=>q.state==='off'); if(!p) break; const c=night&&m.cast==='schoolboy'?'areaboy':m.cast;
    p.cast=c; p.h=getLook(c); p.lod=-1; p.spot=s; p.home=m; p.acts=m.acts.filter(a=>!(CAST[c].tray&&(a==='text'||a==='phone')));
    p.x=s.x+m.dx; p.z=s.z+m.dz; p.y=groundY(p.x,p.z); p.yaw=m.ry; p.speed=0; p.fall=0; p.vx=p.vz=0; p.cool=0; p.state='spot'; p.act=null; p.hv=null; p.wants=false; nextAct(p); p.timer*=.2+MR()*.8;
    s.peds.push(p); } }
function spotOff(s){ for(const p of s.peds) if(p.spot===s) offPed(p); s.peds=[]; s.on=false; s.hailV=null; }
function updateSpots(){ const h=ENV.hour, school=(h>=7&&h<8.5)||(h>=13.5&&h<15.5), night=h>=21.5||h<5.5, f=mode==='drive'&&drive.v?drive.v:player;
  let cand=null, cd=110*110, far=null, fd=0;
  for(const s of SPOTS){ const d2=(s.x-f.x)**2+(s.z-f.z)**2, ok=!(s.school&&!school)&&!(s.day&&night)&&!(s.hours&&!(h>=s.hours[0]&&h<s.hours[1]));
    if(s.on){ if(d2>145*145||!ok){ spotOff(s); continue; } if(s.type==='stop') hailCheck(s); if(d2>fd&&!s.boarding){ fd=d2; far=s; } continue; }
    if(ok&&d2<cd){ cd=d2; cand=s; } }
  if(!cand) return; let free=0; for(const p of peds) if(p.state==='off') free++;
  if(free>=cand.m.length) spotOn(cand); else if(far&&fd>cd*2.2&&fd>60*60) spotOff(far);   // move people to where the player is
}
let spotT=0, bodyT=0;
function updatePeople(dt){ if(sayT>0) sayT-=dt; if((spotT-=dt)<=0){ spotT=.5; updateSpots(); } if((bodyT-=dt)<=0){ bodyT=.2; assignBodies(); }
  updateCrossers(dt); updateTraders(dt); updatePark(dt); updateShoppers(dt); }
const freePed=()=>peds.find(q=>q.state==='off');
function wakePed(p,c){ p.cast=c; p.h=getLook(c); p.lod=-1; p.spot=null; p.home=null; Object.assign(p,{fall:0,vx:0,vz:0,cool:0,act:null,hv:null,wants:false,speed:0,phone:false}); }
// ---- people crossing the big roads by footbridge: up the steps, over the deck, down, and on along the street
const XB={t:0};
function fbPath(fb,fromA){ const at=(l,t)=>[fb.cx+fb.rx*l+fb.dx*t,fb.cz+fb.rz*l+fb.dz*t], [A,B]=fromA?fb.stairs:[fb.stairs[1],fb.stairs[0]], P=[], put=(xz,y)=>P.push({x:xz[0],z:xz[1],y});
  put(at(A.l,(1.2+fb.Ls+2.2)*A.sg),0); put(at(A.l,(1.2+fb.Ls)*A.sg),0); put(at(A.l,1.2*A.sg),fb.H); put(at(A.l,0),fb.H); put(at(B.l,0),fb.H); put(at(B.l,1.2*B.sg),fb.H); put(at(B.l,(1.2+fb.Ls)*B.sg),0); put(at(B.l,(1.2+fb.Ls+2.2)*B.sg),0); return P; }
function updateCrossers(dt){ if((XB.t-=dt)>0) return; XB.t=1.6; const f=mode==='drive'&&drive.v?drive.v:player, h=ENV.hour;
  for(const fb of FOOTB){ fb.crossers=(fb.crossers||[]).filter(p=>p.state==='xbr'&&p.fb===fb); if(Math.hypot(fb.cx-f.x,fb.cz-f.z)>140||h>=22||h<5.5||fb.crossers.length>=4||MR()<.3) continue;
    const fromA=MR()<.5, path=fbPath(fb,fromA), s0=path[0]; if(Math.hypot(s0.x-f.x,s0.z-f.z)<30) continue; const p=freePed(); if(!p) return; wakePed(p,pickCast(h));
    Object.assign(p,{path,pi:1,fb,x:s0.x,z:s0.z,y:0,state:'xbr',speed:.8,yaw:Math.atan2(path[1].x-s0.x,path[1].z-s0.z),tw:false}); fb.crossers.push(p); } }
function crossPed(p,dt){ const t=p.path[p.pi], prev=p.path[p.pi-1]; if(!t){ p.state='walk'; p.fb=null; p.y=0; replanPed(p); return; }
  const dx=t.x-p.x, dz=t.z-p.z, d=Math.hypot(dx,dz); if(d<.25){ p.pi++; return; }
  p.speed+=(1.2-p.speed)*Math.min(1,dt*3); const st=Math.min(d,p.speed*dt); p.x+=dx/d*st; p.z+=dz/d*st; p.yaw=lerpA(p.yaw,Math.atan2(dx,dz),Math.min(1,dt*6));
  const seg=Math.hypot(t.x-prev.x,t.z-prev.z)||1; p.y=prev.y+(t.y-prev.y)*clamp(1-(d-st)/seg,0,1); }
// ---- hawkers in the traffic: when the light goes red they walk out between the lanes with their trays, and run back on green
const TRADE=[], TR={t:0};
for(const r of tlRefs){ const e=r.e; if(!e||e.ow||e.w<9||e.len<40||e.c>3) continue; const n=r.n, rx=-r.fz, rz=r.fx, S0={x:n.x-r.fx*(n.r+3),z:n.z-r.fz*(n.r+3)};
  const kerb={x:S0.x+rx*(e.hw+1),z:S0.z+rz*(e.hw+1)}; if(resolveCircle({...kerb},.3)) continue; TRADE.push({r,e,n,S0,kerb,fx:r.fx,fz:r.fz,rx,rz,peds:[]}); }
function updateTraders(dt){ if((TR.t-=dt)>0) return; TR.t=1.3; const f=mode==='drive'&&drive.v?drive.v:player, h=ENV.hour, open=h>=6.5&&h<20.5;
  for(const T of TRADE){ T.peds=T.peds.filter(p=>p.state==='tsell'&&p.tr===T); const d=Math.hypot(T.S0.x-f.x,T.S0.z-f.z);
    if(d>130||!open){ for(const p of T.peds) if(p.ph2==='wait') offPed(p); continue; }
    if(T.peds.length<2&&Math.hypot(T.kerb.x-f.x,T.kerb.z-f.z)>22&&MR()<.6){ const p=freePed(); if(!p) return; wakePed(p,MR()<.72?'hawker':'areaboy');
      const back=rr(1,9), hx=T.kerb.x-T.fx*back, hz=T.kerb.z-T.fz*back; Object.assign(p,{tr:T,ph2:'wait',home2:{x:hx,z:hz},x:hx,z:hz,y:0,state:'tsell',yaw:Math.atan2(-T.rx,-T.rz),timer:0}); T.peds.push(p); } } }
function tradePed(p,dt){ const T=p.tr, light=T.n.tl?lightAt(T.n,T.fx,T.fz):'g', red=light==='r'; let tx=null, tz=null, vt=0;
  if(p.ph2==='wait'){ p.act='idle_2'; if(red){ p.timer+=dt; if(p.timer>1.5+MR()*2){ p.ph2='out'; const b=rr(4,26); p.tgt={x:T.S0.x-T.fx*b+T.rx*.25,z:T.S0.z-T.fz*b+T.rz*.25}; } } else p.timer=0; }
  if(p.ph2==='out'){ if(!red){ p.ph2='back'; } else { tx=p.tgt.x; tz=p.tgt.z; vt=1.35; if(Math.hypot(tx-p.x,tz-p.z)<.3){ p.ph2='sell'; p.timer=0; } } }
  if(p.ph2==='sell'){ if(!red){ p.ph2='back'; } else { p.timer+=dt; const k=(Math.sin(p.timer*.6)+1)/2; tx=T.S0.x-T.fx*(4+24*k)+T.rx*.25; tz=T.S0.z-T.fz*(4+24*k)+T.rz*.25; vt=.45; p.act='hail'; } }
  if(p.ph2==='back'){ tx=p.home2.x; tz=p.home2.z; vt=1.9; if(Math.hypot(tx-p.x,tz-p.z)<.3){ p.ph2='wait'; p.timer=0; } }
  if(tx!==null){ const dx=tx-p.x, dz=tz-p.z, d=Math.hypot(dx,dz); if(d>.05){ p.speed+=(vt-p.speed)*Math.min(1,dt*4); const st=Math.min(d,p.speed*dt); p.x+=dx/d*st; p.z+=dz/d*st; if(d>.3) p.yaw=lerpA(p.yaw,Math.atan2(dx,dz),Math.min(1,dt*7)); } else p.speed=0; }
  else p.speed=0;
  if(p.ph2==='sell'&&p.speed<.5) p.yaw=lerpA(p.yaw,Math.atan2(T.rx,T.rz),Math.min(1,dt*3));   // show the tray to the drivers
  if(p.ph2==='wait') p.yaw=lerpA(p.yaw,Math.atan2(-T.rx,-T.rz),Math.min(1,dt*3)); }
// ---- markets: crowds of shoppers from stall to stall while you are there, pricing, bargaining, on the phone
const SHOP={t:0,peds:[]};
for(const M of MARKETS){ if(!M.stalls.length) continue; let x=0,z=0; for(const st of M.stalls){ x+=st.x; z+=st.z; } M.cx=x/M.stalls.length; M.cz=z/M.stalls.length; M.r=0; for(const st of M.stalls) M.r=Math.max(M.r,Math.hypot(st.x-M.cx,st.z-M.cz)); }
const SHOP_ACTS={mama:['talk','argue','no','idle_2'],lady_red:['talk','text','sassy','idle_3'],lady_black:['talk','no','text','idle_4'],baba:['talk','no','idle_baba','phone'],areaboy:['talk','phone','idle_1','text'],schoolboy:['idle_1','talk'],hawker:['talk','idle_2','no'],girl:['f_talk','f_think','text','f_bashful'],suit_lady:['f_talk','phone','f_think']};
const shopCast=()=>mpick(['mama','mama','lady_red','lady_black','baba','areaboy','hawker','suit_lady',...(isF()?[]:['girl'])]);
function shopFront(M,near){ let L=M.stalls; if(near){ const c=L.filter(st=>Math.abs(st.x-near.x)<26&&Math.abs(st.z-near.z)<26); if(c.length>2) L=c; } const st=mpick(L), c=Math.cos(st.ang), s2=Math.sin(st.ang), vx=-s2, vz=c, sd=st.side, u=mrr(-.9,.9), o=mrr(1.3,2);
  const t={x:st.x+vx*sd*o+c*u,z:st.z+vz*sd*o+s2*u,ry:Math.atan2(-vx*sd,-vz*sd)}; resolveCircle(t,.3); return t; }
function shopNext(p){ p.tgt=shopFront(p.mk,p); p.shopT=0; }
function shopPed(p,dt){ if(p.shopT>0){ p.shopT-=dt; p.speed=Math.max(0,p.speed-dt*3); p.yaw=lerpA(p.yaw,p.tgt.ry,Math.min(1,dt*4)); if(p.shopT<=0){ p.act=null; shopNext(p); } return; }
  const dx=p.tgt.x-p.x, dz=p.tgt.z-p.z, d=Math.hypot(dx,dz); if(d<.45){ p.shopT=mrr(3,11); p.act=mpick(SHOP_ACTS[p.cast]||['talk']); p.speed=0; return; }
  p.speed+=(p.v*.75-p.speed)*Math.min(1,dt*3); const c={x:p.x+dx/d*p.speed*dt,z:p.z+dz/d*p.speed*dt}; if(resolveCircle(c,.3)) p.stuckT=(p.stuckT||0)+dt; p.x=c.x; p.z=c.z; p.yaw=lerpA(p.yaw,Math.atan2(dx,dz),Math.min(1,dt*6));
  if(p.stuckT>2.5){ p.stuckT=0; shopNext(p); } }
function updateShoppers(dt){ if((SHOP.t-=dt)>0) return; SHOP.t=.8; const f=mode==='drive'&&drive.v?drive.v:player, h=ENV.hour, open=h>=6.5&&h<20;
  SHOP.peds=SHOP.peds.filter(p=>p.state==='shop');
  let M=null, md=1e9; for(const m of MARKETS){ if(!m.stalls.length) continue; const d=Math.hypot(m.cx-f.x,m.cz-f.z)-m.r; if(d<md){ md=d; M=m; } }
  for(const p of SHOP.peds) if(!open||p.mk!==M||md>140||Math.hypot(p.x-f.x,p.z-f.z)>80) offPed(p);   // the crowd stays around you
  if(!M||!open||md>110) return; SHOP.peds=SHOP.peds.filter(p=>p.state==='shop');
  for(let k=0;k<3&&SHOP.peds.length<SHOP_N;k++){ const p=freePed(); if(!p) return;
    let t=null; camera.getWorldDirection(_cd); for(let i=0;i<14;i++){ const c=shopFront(M,{x:f.x+mrr(-45,45),z:f.z+mrr(-45,45)}); const d=Math.hypot(c.x-f.x,c.z-f.z), behind=(c.x-camera.position.x)*_cd.x+(c.z-camera.position.z)*_cd.z<0;
      if(d>8&&d<62&&(d>22||behind)){ t=c; break; } } if(!t) return;   // new shoppers appear out of sight
    wakePed(p,shopCast()); Object.assign(p,{state:'shop',mk:M,x:t.x,z:t.z,y:0,yaw:t.ry,tgt:t,shopT:mrr(1,8),act:mpick(SHOP_ACTS[p.cast]||['talk']),tw:false,speed:0}); SHOP.peds.push(p); } }
// ---- the motor park: danfos wait in their bays, the conductors call, the queue climbs in and the bus leaves full; another rolls in
const PARK={t:12,ready:false,made:0};
// a danfo for a bay: one that drove off earlier and is now far from you comes back round, so the number of vehicles stays fixed
function parkVehicle(bay){ const f=mode==='drive'&&drive.v?drive.v:player; let v=vehicles.find(o=>o.fromPark&&o.ai&&!o.ai.chase&&!o.taxi&&o!==drive.v&&!o.jacked&&Math.hypot(o.x-f.x,o.z-f.z)>130);
  if(!v){ if(PARK.made>=10) return null; v=newVehicle('danfo','#f2b705'); v.fromPark=true; PARK.made++; }   // seated driver and passengers show once it drives off
  Object.assign(v,{x:bay.x,z:bay.z,h:bay.h,y:0,keep:1,bay,ai:null,speed:0,loading:false,leaving:null}); bay.v=v; return v; }
function updatePark(dt){ const pk=SITES.park; if(!pk) return; if(!PARK.ready){ PARK.ready=true; pk.bays.forEach((b,i)=>{ if(i!==3) parkVehicle(b); }); }
  // a danfo driving out of its bay to the road
  for(const b of pk.bays){ const v=b.v; if(!v||!v.leaving) continue; if(v===drive.v){ b.v=null; v.leaving=null; v.bay=null; continue; }
    const L=v.leaving; L.t+=dt; v.speed=Math.min(4,L.t*1.8); v.x+=b.fwx*v.speed*dt; v.z+=b.fwz*v.speed*dt;
    if(Math.hypot(v.x-b.x,v.z-b.z)>L.dist){ const e=pk.e, A0=nodes[e.a], t=clamp((v.x-A0.x)*e.fx+(v.z-A0.z)*e.fz,2,e.len-2); let a=e.a, bb=e.b; if(!e.ow&&MR()<.5){ a=e.b; bb=e.a; }
      const seg=lineSeg(a,bb), s=a===e.a?clamp(t-(e.len-seg.len)/2,0,seg.len):clamp(e.len-t-(e.len-seg.len)/2,0,seg.len); segPos(seg,s,_sp);
      v.ai={a,b:bb,s,seg,na:-1,maxV:mrr(10,14),wait:0,ghost:2,stuck:0,cond:e.cond,ec:e.c}; v.x=_sp.x; v.z=_sp.z; v.h=Math.atan2(-_sp.dz,_sp.dx); v.keep=0; v.leaving=null; v.bay=null; b.v=null; b.refill=T0+mrr(25,45); } }
  for(const b of pk.bays){ const v=b.v; if(v&&v.loading&&T0>v.loading){ v.loading=false; if(!v.jacked&&v!==drive.v) v.leaving={t:0,dist:Math.max(6,Math.abs(pk.hd-7)+3)}; } }   // full: off it goes
  if(PARK.clearT&&T0>PARK.clearT){ PARK.clearT=0; for(const s of SPOTS) if(s.type==='park'&&s.on&&s.peds.length<s.m.length&&!s.boarding) spotOff(s); }   // the queue fills up again
  for(const b of pk.bays) if(!b.v&&b.refill&&T0>b.refill){ const f=mode==='drive'&&drive.v?drive.v:player; if(Math.hypot(b.x-f.x,b.z-f.z)>30){ if(parkVehicle(b)) b.refill=0; else b.refill=T0+20; } }
  if((PARK.t-=dt)>0) return; PARK.t=mrr(22,38); const f=mode==='drive'&&drive.v?drive.v:player; if(Math.hypot(pk.cx-f.x,pk.cz-f.z)>160) return;
  // load one danfo from the queue, then send it off
  const bays=pk.bays.filter(b=>b.v&&!b.v.leaving&&b.v!==drive.v&&!b.v.jacked); if(!bays.length) return; const bay=mpick(bays), v=bay.v;
  const q=SPOTS.filter(s=>s.type==='park'&&s.on).flatMap(s=>s.peds.filter(p=>p.state==='spot')); const n=Math.min(q.length,ri(2,5));
  for(let i=0;i<n;i++){ const p=q[i]; p.state='board'; p.bv=v; p.timer=8; p.speed=0; if(p.spot) p.spot.boarding++; }
  v.loading=T0+(n?7:2.5); PARK.clearT=T0+16;
  if(sayT<=0&&Math.hypot(pk.cx-f.x,pk.cz-f.z)<45){ sayT=6; toast(mpick(['"Oshodi! Oshodi! Enter with your change o!"','"Yaba, Yaba! One chance remain!"','"Ojota! Ikeja! Oya, enter, we dey go!"']),2.8); }
}

/* ================= fighting =================
   On foot: J or left click = punch (jab, cross, jab…), K or right click = kick (after two punches: the finisher that floors him),
   L or Q = dodge, G next to the man you fight = slam him down, Space = jump. Punch while running into someone = takedown,
   kick while running = drop kick. Hit someone lying on the floor and you go down and keep hitting until he stops moving. Area boys fight back (their friends join); other people run or quarrel.
   Hitting ordinary people brings the police: stars go up, a police van comes for you, and if it catches you
   you are taken to Mushin police station. Get far away and keep quiet and the stars fade. */
const FIGHT={hp:100,calmT:99,heat:0,crimeT:99,lastAtk:-99,near:false,ko:false,dead:false,koT:0,arrestT:0,cop:null,foe:null,foeT:0,cx:0,cz:0,warned:0,combo:0,lastHit:-9,carT:0,
  chain:0,swingT:-9,buf:null,stop:0,dash:null,inv:0,dodgeCool:0,counter:0};
// your blows: which move (and which part of it), how fast, when it lands (fraction of the part), reach, damage, when the next blow can cut in,
// how close you stand to land it. Punches alternate jab and cross; a kick after two punches is the finisher that puts them down.
const MOVE_INFO={
  jab:{act:'punch',from:0,to:.44,ts:1.75,hits:[.75],reach:1.45,dmg:10,cancel:.8,stand:.95,how:'punch'},
  cross:{act:'punch_b',from:.4,to:.82,ts:1.7,hits:[.33],reach:1.5,dmg:13,cancel:.6,stand:.95,how:'punch'},
  kick:{act:'kick',from:0,to:.8,ts:2,hits:[.59],reach:1.95,dmg:20,cancel:.72,stand:1.3,how:'kick'},
  heavy:{act:'kick',from:0,to:.85,ts:1.75,hits:[.55],reach:2,dmg:26,cancel:.9,stand:1.3,how:'kick',knock:3.2},
  drop_kick:{act:'drop_kick',ts:1.5,hits:[.48],reach:2.6,dmg:38,cancel:1,lunge:[.15,.5,6],how:'drop_kick',knock:4},
  gp:{act:'gp',from:0,to:.44,ts:1.6,hits:[.75],dmg:13,cancel:.8},
  gp2:{act:'gp_b',from:.4,to:.82,ts:1.6,hits:[.33],dmg:15,cancel:.6}};
// the street's blows (area boys)
const AI_INFO={punch:{ts:1.55,hits:[.33,.53],reach:1.5},kick:{ts:1.6,hits:[.47],reach:1.95}};
const ONCE=new Set(['punch','punch_b','kick','drop_kick','hit_head','hit_body','hit_side','hit_side_m','uppercut','stand_up','kip_up','takedown_a','takedown_v','jump','threaten','gp','gp_b','rise']);
const HP0=c=>c==='areaboy'?110:c==='police_f'||c==='police_m'?140:70;
const durOf=(p,n)=>{ const C=PEOPLE.casts[p.cast], k=C&&C.clips[n]; return k?k.duration:1.2; };
const fightReady=()=>!!(hero&&hero.act.punch);
function whoosh(){ burst(.16,1500,.16,1.4); }
function smack(k=1){ burst(.06,2600,.32*k,6); burst(.22,320,.5*k,3); }
// moves made from other moves: hands up (the raised hand of a taxi hail, mirrored onto the other arm), punching down at someone on
// the floor (crouched legs and back from getting up, arms from the punch), rising from that crouch, and a dodge to the other side
function mirrorClip(k,name){ return new THREE.AnimationClip(name,k.duration,k.tracks.map(t=>{ const [b,pr]=t.name.split('.'), nb=/Left/.test(b)?b.replace('Left','Right'):/Right/.test(b)?b.replace('Right','Left'):b, v=t.values.slice();
  if(pr==='quaternion') for(let i=0;i<v.length;i+=4){ v[i+1]=-v[i+1]; v[i+2]=-v[i+2]; } else if(pr==='position') for(let i=0;i<v.length;i+=3) v[i]=-v[i];
  return new t.constructor(nb+'.'+pr,t.times.slice(),v); })); }
function synthMoves(){ const C=PEOPLE.clips, at=(tr,t)=>Array.from(tr.createInterpolant().evaluate(t)), held=(tr,v,d)=>new tr.constructor(tr.name,[0,d],[...v,...v]);
  if(C.hail&&!C.hands_up){ const t=1.6, by=new Map(C.hail.tracks.map(k=>[k.name,k]));
    C.hands_up=new THREE.AnimationClip('hands_up',1,C.hail.tracks.map(k=>{ const [b,pr]=k.name.split('.'); let v=at(k,t);
      if(/Left(Shoulder|Arm|ForeArm|Hand)/.test(b)&&pr==='quaternion'){ const r=by.get(k.name.replace('Left','Right')); if(r){ const q=at(r,t); v=[q[0],-q[1],-q[2],q[3]]; } } return held(k,v,1); })); }
  if(C.punch&&C.stand_up&&!C.gp){ const t=2.6, LOW=/(Hips|UpLeg|Leg|Foot|ToeBase|Toe_End|Spine\d?|Neck|Head)\./, d=C.punch.duration;
    C.gp=new THREE.AnimationClip('gp',d,[...C.stand_up.tracks.filter(k=>LOW.test(k.name)).map(k=>held(k,at(k,t),d)),...C.punch.tracks.filter(k=>!LOW.test(k.name)).map(k=>k.clone())]); }
  if(C.stand_up&&!C.rise) C.rise=THREE.AnimationUtils.subclip(C.stand_up,'rise',Math.round(2.6*30),Math.round(4.3*30),30);
  if(C.hit_side&&!C.hit_side_m) C.hit_side_m=mirrorClip(C.hit_side,'hit_side_m'); }
// ---- the player's moves (played over walking/standing); from/to play only part of a move
function heroDo(name,o={}){ if(!hero) return false; const a=hero.act[name]; if(!a) return false; const cur=hero.ov;
  if(cur&&cur.lock&&!o.force) return false;
  if(cur&&cur.a!==a) cur.a.fadeOut(o.atk&&cur.atk?.08:.15);
  const cd=a.getClip().duration, f0=o.from||0, f1=o.to||1, ts=o.ts||1;
  a.reset(); if(ONCE.has(name)){ a.setLoop(THREE.LoopOnce,1); a.clampWhenFinished=true; } a.timeScale=ts; a.time=f0*cd; a.setEffectiveWeight(0); a.play();
  hero.ov={name,a,t:0,dur:(f1-f0)*cd/ts,hits:(o.hits||[]).map(([at,fn])=>({at,fn,done:false})),lock:o.lock!==false,pause:!!o.pause,lunge:o.lunge||null,root:!!o.root,onEnd:o.onEnd||null,
    atk:o.atk||null,cancel:o.cancel??1,heavy:!!o.heavy,inW:o.atk&&cur&&cur.atk?.05:.1,foe:o.foe||null,stand:o.stand||1,until:o.until||0};
  return true; }
function heroEnd(){ const o=hero.ov; if(!o) return; hero.ov=null;
  if(o.root){ const p=hero.hips.getWorldPosition(_fv); player.x=p.x; player.z=p.z; FIGHT.cx=FIGHT.cz=0; }   // the move travelled: keep where it ended
  if(o.root) o.a.stop(); else o.a.fadeOut(.2); if(o.onEnd) o.onEnd(); }
function heroOverlay(dt){ const o=hero.ov; if(!o) return 0; o.t+=dt;
  if(o.root){ const p=hero.hips.getWorldPosition(_fv); FIGHT.cx=p.x-player.x; FIGHT.cz=p.z-player.z; }
  if(o.pause){ const w=Math.min(1,o.t/.35); o.a.setEffectiveWeight(w); return w; }
  for(const h of o.hits) if(!h.done&&o.t>=h.at*o.dur){ h.done=true; h.fn(); }
  if(hero.ov!==o) return 1;   // a hit can start another move (a knock-down, a death)
  const w=Math.min(1,o.t/o.inW)*(o.root?1:clamp((o.dur-o.t)/Math.min(.18,o.dur*.3),0,1)); o.a.setEffectiveWeight(w);   // a travelling move ends at full strength, then you stand where it left you
  if(o.t>=o.dur){ heroEnd(); return 0; } return w; }
// pick who the player is hitting: the nearest person in front, within reach (a little help with aiming)
function pickFoe(reach,cone=1.2){ let best=null, bs=1e9; const fx=Math.sin(player.yaw), fz=Math.cos(player.yaw);
  for(const p of peds){ if(p.state==='off'||p.state==='down'||p.state==='dead'||p.state==='getup'||p.state==='takedown'||p.state==='arrest'||p.carried) continue; const dx=p.x-player.x, dz=p.z-player.z, d=Math.hypot(dx,dz); if(d>reach||d<.05) continue;
    const ang=Math.acos(clamp((dx*fx+dz*fz)/d,-1,1)); if(ang>cone) continue; const s=d+ang*1.2+(FIGHT.attackers&&FIGHT.attackers.includes(p)?-.6:0); if(s<bs){ bs=s; best=p; } } return best; }
const segDur=mi=>{ const a=hero.act[mi.act]; return a?((mi.to||1)-(mi.from||0))*a.getClip().duration/mi.ts:.5; };
function playerAttack(kind){ if(mode!=='walk'||!fightReady()||FIGHT.ko||busy||mapView.isOpen||JACK.go) return; if(CARRY.p){ carryDrop(); return; }
  const o=hero.ov; if(o&&o.lock&&!(o.atk&&o.t>=o.cancel*o.dur)){ FIGHT.buf={kind,t:T0}; return; } FIGHT.buf=null;   // too early: it comes out when this blow allows
  const low=groundFoe(), up=low&&pickFoe(1.8,1); if(low&&hero.act.gp&&!(up&&(up.state==='fight'||up.state==='hurt'))) return groundPound(low,kind);   // someone on the floor beside you (and nobody standing in your face): you go down on them
  const running=player.speed>WALK_V*1.3&&!(o&&o.atk); let foe=pickFoe(running?3.6:3.3,running?1.2:2.5);
  if(kind==='punch'&&running&&foe&&foe.body&&hero.act.takedown_a&&Math.hypot(foe.x-player.x,foe.z-player.z)<2.6&&!(foe.cast==='areaboy'&&foe.atk)) return takedown(foe);
  FIGHT.chain=T0-FIGHT.swingT<1.05?FIGHT.chain+1:0; FIGHT.swingT=T0;
  const name=kind==='kick'?(running&&hero.act.drop_kick?'drop_kick':FIGHT.chain>=2?'heavy':'kick'):(FIGHT.chain%2?'cross':'jab'); if(name==='heavy'||name==='drop_kick') FIGHT.chain=-1;
  swing(name,foe); }
function swing(name,foe){ const mi=MOVE_INFO[name];
  if(foe){ player.yaw=Math.atan2(foe.x-player.x,foe.z-player.z); aiDodge(foe); }
  heroDo(mi.act,{force:true,from:mi.from,to:mi.to,ts:mi.ts,atk:name,cancel:mi.cancel,heavy:!!mi.knock,lunge:mi.lunge||null,foe:mi.lunge?null:foe,stand:mi.stand,until:mi.hits[0],hits:mi.hits.map(at=>[at,()=>landHit(name,foe)])});
  FIGHT.lastAtk=T0; whoosh(); }
// you hit harder than anyone on the street; blows in a row hit harder still, and a blow right after a dodge hits hardest
function landHit(name,foe){ const mi=MOVE_INFO[name]; let p=foe&&foe.state!=='off'&&foe.state!=='dead'&&foe.state!=='down'&&!foe.carried?foe:null;
  const rch=mi.reach+((WEAPONS[ARMS.cur].reach)||0);
  if(p){ const dx=p.x-player.x, dz=p.z-player.z, d=Math.hypot(dx,dz), fwd=(dx*Math.sin(player.yaw)+dz*Math.cos(player.yaw))/(d||1); if(d>rch+.5||fwd<.3) p=null; }
  if(!p) p=pickFoe(rch,.95);
  if(!p) return;
  if(p.dodgeT>0){ if(sayT<=0&&MR()<.5){ sayT=3; toast(mpick(['"You no fit touch me!"','"Too slow!"','"Ehen? Na so?"']),1.3); } return; }   // he slipped it
  FIGHT.combo=T0-FIGHT.lastHit<1.1?Math.min(5,FIGHT.combo+1):1; FIGHT.lastHit=T0;
  const W=WEAPONS[ARMS.cur], wm=W.melee||1, counter=T0<FIGHT.counter, dmg=mi.dmg*mrr(.9,1.1)*1.3*(1+.15*(FIGHT.combo-1))*(counter?1.6:1)*wm; if(counter) FIGHT.counter=0;
  const ux=Math.sin(player.yaw), uz=Math.cos(player.yaw);
  bleed(p.x,mi.how==='punch'?1.55:1.25,p.z,ux,uz,((mi.knock?10:mi.how==='kick'?6:4)+(FIGHT.combo>2?3:0))*(W.blade?2.2:1),1.8);
  if(W.blade&&mi.how==='punch'&&(p.hp??HP0(p.cast))-dmg<=0){ p.hp=0; killPed(p,ux,uz,1.4,'fight'); camState.shake=Math.min(1,camState.shake+.4); smack(1.3); return; }   // a blade does not just knock you down
  FIGHT.stop=mi.knock?.11:.07; p.stopT=FIGHT.stop;
  hurtPed(p,dmg,mi.how,mi.knock||(counter&&mi.how==='kick'?3:0)); camState.shake=Math.min(1,camState.shake+(mi.knock?.5:.28)); smack(mi.knock?1.3:1); }
// somebody lying on the floor near you
function groundFoe(){ let best=null, bd=2.3; for(const p of peds){ if(p.state!=='down'||p.carried||p.y>.5) continue; const d=Math.hypot(p.x-player.x,p.z-player.z); if(d<bd){ bd=d; best=p; } } return best; }
function groundPound(p,kind){ FIGHT.chain=T0-FIGHT.swingT<1.1?FIGHT.chain+1:0; FIGHT.swingT=T0;
  const name=FIGHT.chain%2?'gp2':'gp', mi=MOVE_INFO[name], d=Math.hypot(p.x-player.x,p.z-player.z), ts=kind==='kick'?mi.ts*.85:mi.ts; player.yaw=Math.atan2(p.x-player.x,p.z-player.z);
  heroDo(mi.act,{force:true,from:mi.from,to:mi.to,ts,atk:name,cancel:mi.cancel,foe:p,stand:.8,until:mi.hits[0],hits:mi.hits.map(at=>[at,()=>groundHit(p,mi.dmg*(kind==='kick'?1.35:1))])}); FIGHT.lastAtk=T0; whoosh(); }
// each blow on the floor: blood, the body jolts, and after enough of them the person dies there
function groundHit(p,dmg){ if(p.state!=='down'||Math.hypot(p.x-player.x,p.z-player.z)>2.5) return; p.hp=(p.hp??0)-dmg*mrr(.9,1.15); p.timer=Math.max(p.timer,2.4); p.jolt=1; p.stopT=.08; FIGHT.stop=.08; FIGHT.lastHit=T0; FIGHT.foe=p; FIGHT.foeT=4;
  const ux=Math.sin(player.yaw), uz=Math.cos(player.yaw); bleed(p.x,.35,p.z,ux*.3,uz*.3,7,1.2); if(p.pool&&BLOOD.p.includes(p.pool)) p.pool.size=Math.min(1.9,p.pool.size+.22); else p.pool=bloodPool(p.x,p.z,.6,2);
  crime(p,1); incident(p.x,p.z,'fight'); camState.shake=Math.min(1,camState.shake+.3); smack(1.1);
  if(p.hp<=-55){ sayT=0; killPed(p,ux,uz,0,'fight'); }
  else if(sayT<=0&&MR()<.35){ sayT=3; toast(mpick(['"Abeg! Abeg!"','"I don hear! I don hear!"','"Ahh! Leave me!"','"Help! Dem wan kill me!"']),1.6); } }
// GTA-style dodge: a quick slip to the side (or back) that blows can't touch; hit them straight after for a harder blow
function playerDodge(){ if(mode!=='walk'||!hero||!hero.act.hit_side||FIGHT.ko||busy||mapView.isOpen||CARRY.p||JACK.go||T0<FIGHT.dodgeCool) return;
  const o=hero.ov; if(o&&o.lock&&!o.atk&&!/^hit_(head|body)$/.test(o.name)) return;
  const [f,s]=inputVec(), cy=camState.yaw; let dx=Math.sin(cy)*f-Math.cos(cy)*s, dz=Math.cos(cy)*f+Math.sin(cy)*s, l=Math.hypot(dx,dz);
  if(l<.2){ dx=-Math.sin(player.yaw); dz=-Math.cos(player.yaw); l=1; } dx/=l; dz/=l;   // no direction: a step back
  const side=dx*-Math.cos(player.yaw)+dz*Math.sin(player.yaw);
  FIGHT.dash={vx:dx*7.5,vz:dz*7.5,t:0,dur:.3}; FIGHT.inv=T0+.42; FIGHT.dodgeCool=T0+.55; FIGHT.buf=null;
  heroDo(side<0&&hero.act.hit_side_m?'hit_side_m':'hit_side',{force:true,ts:2.3,from:0,to:.55}); whoosh(); }
// an area boy sees your blow coming and slips it, now and then
function aiDodge(p){ if(p.state!=='fight'||p.atk||!p.body||p.dodgeT>0||MR()>.2) return; const dx=p.x-player.x, dz=p.z-player.z, d=Math.hypot(dx,dz)||1, s=MR()<.5?1:-1;
  p.dodgeT=.38; p.dvx=(-dz/d*s*.8+dx/d*.6)*4.2; p.dvz=(dx/d*s*.8+dz/d*.6)*4.2; p.dclip=s>0?'hit_side':'hit_side_m'; p.seq=(p.seq||0)+1; }
// who you are fighting: the nearest attacker, or the last person you hit
function lockFoe(){ let best=null, bd=5; for(const p of FIGHT.attackers||[]){ const d=Math.hypot(p.x-player.x,p.z-player.z); if(d<bd){ bd=d; best=p; } }
  if(!best&&FIGHT.foe&&FIGHT.foeT>0&&FIGHT.foe.state!=='off'&&FIGHT.foe.state!=='dead'&&Math.hypot(FIGHT.foe.x-player.x,FIGHT.foe.z-player.z)<4) best=FIGHT.foe; return best; }
// a car runs into you: thrown down (and up again), or killed if it was fast
function carHitPlayer(v,sp){ FIGHT.carT=1.5; const fx=Math.cos(v.h), fz=-Math.sin(v.h); player.x+=fx*Math.min(3,sp*.18); player.z+=fz*Math.min(3,sp*.18);
  if(v.ai){ v.ai.wait=Math.max(v.ai.wait,3); setTimeout(horn,200); } v.speed*=.4;
  hitPlayer((sp-4)*9,v,'car'); if(FIGHT.dead) return;
  FIGHT.ko=true; FIGHT.koT=0; player.speed=0; heroDo('uppercut',{force:true,ts:1.3,onEnd:()=>heroDo('lie',{force:true,pause:true})});
  if(sayT<=0){ sayT=5; toast(mpick(['"Driver! You wan kill person?!"','"Ah! Watch where you dey drive!"']),2.4); } }
function playerJump(){ if(mode!=='walk'||!hero||!hero.act.jump||FIGHT.ko||busy) return; if(hero.ov) return; heroDo('jump',{ts:1.35,lock:false}); }
// paired move ("jack" him): you grab them by the legs and slam them on the floor, and you are down there with them to keep hitting
const TK=.34;   // the part of the takedown up to the slam
function takedown(foe){ player.yaw=Math.atan2(foe.x-player.x,foe.z-player.z); const fx=Math.sin(player.yaw), fz=Math.cos(player.yaw);
  Object.assign(foe,{x:player.x+fx*1.5,z:player.z+fz*1.5,yaw:player.yaw+Math.PI,state:'takedown',speed:0,timer:TK*durOf(foe,'takedown_v')/1.7,atk:null,dodgeT:0}); foe.seq=(foe.seq||0)+1;
  player.speed=0; FIGHT.buf=null; FIGHT.chain=0; heroDo('takedown_a',{force:true,ts:1.7,to:TK,root:true,onEnd:()=>{ if(!FIGHT.ko) heroDo('rise',{force:true,ts:1.5,lock:false}); }});
  FIGHT.lastAtk=T0; crime(foe,1.2); provoke(foe); camState.shake=Math.min(1,camState.shake+.2); setTimeout(()=>smack(1.4),TK*7250/1.7*.8); }
// ---- people getting hit
function hurtPed(p,dmg,how,knock=0){ if(p.hp==null) p.hp=HP0(p.cast); p.hp-=dmg; incident(p.x,p.z,'fight'); crime(p,how==='drop_kick'?1.5:1); if(p.cop){ p.mad=1; FIGHT.heat=Math.max(FIGHT.heat,1.65); FIGHT.crimeT=0; }   // touch an officer: two stars
  const dx=p.x-player.x, dz=p.z-player.z, d=Math.hypot(dx,dz)||1, ux=dx/d, uz=dz/d; FIGHT.foe=p; FIGHT.foeT=4;
  if(p.hp<=0||knock) koPed(p,ux,uz,knock||2.4);
  else { if(p.state!=='hurt') p.after=p.state==='fight'?'fight':null; p.state='hurt'; p.react=how==='punch'?mpick(['hit_head','hit_head','hit_body']):how==='kick'?mpick(['hit_side','hit_body']):'uppercut';
    p.timer=durOf(p,p.react)/1.6*.85; p.vx=ux*(how==='punch'?1:2); p.vz=uz*(how==='punch'?1:2); p.speed=0; p.atk=null; p.dodgeT=0; p.seq=(p.seq||0)+1; p.yaw=Math.atan2(-ux,-uz); }
  provoke(p); }
function koPed(p,ux,uz,push){ lootPed(p); p.kos=(p.kos||0)+1; if(p.kos>=3||p.hp<-45) return killPed(p,ux,uz,push,'fight');   // beaten again and again: they don't get up
  bloodPool(p.x+ux*push*.3,p.z+uz*push*.3,.55,2);
  Object.assign(p,{state:'down',timer:mrr(4,6),downT:0,got:0,fall:0,vx:ux*push,vz:uz*push,atk:null,hp:0,beaten:true,yaw:Math.atan2(-ux,-uz)}); p.seq=(p.seq||0)+1;
  if(sayT<=0&&MR()<.6){ sayT=5; toast(p.cast==='areaboy'?mpick(['"Ehn! You don finish me!"','"I go come back o!"']):mpick(['"Help! Help o!"','"Somebody call police!"']),2.2); } }
// area boys stand up for each other; everybody else runs
function provoke(p){ const now=T0;
  if(p.cast==='areaboy'&&!p.beaten) p.after='fight';
  let joined=0;
  for(const q of peds){ if(q===p||q.state==='off'||q.state==='down'||q.state==='dead'||q.state==='getup'||q.state==='arrest'||q.carried) continue; const d=Math.hypot(q.x-p.x,q.z-p.z); if(d>14) continue;
    if(q.cast==='areaboy'&&!q.beaten){ if(q.state!=='fight'&&q.state!=='hurt'){ q.state='fight'; q.atk=null; q.atkT=mrr(.4,1.4); joined++; } }
    else if(q.state==='walk'||q.state==='idle'||q.state==='spot'||q.state==='react'){ if(MR()<.6){ q.state='flee'; q.timer=mrr(4,7); q.yaw=Math.atan2(q.x-player.x,q.z-player.z)+mrr(-.5,.5); } else react(q,'no',player.x,player.z,mrr(1.5,3)); } }
  if(joined&&sayT<=0){ sayT=6; toast(mpick(['"You wan try us?!"','"Na who send you come here?"','"Boys, enter am!"']),2.2); } }
function afterHurt(p){ if(p.cop){ p.state=p.cast==='police_m'?'copguard':'cop'; p.mad=1; p.atk=null; p.atkT=mrr(.2,.6); return; }
  if(p.after==='fight'&&!p.beaten&&p.cast==='areaboy'){ p.state='fight'; p.atk=null; p.atkT=mrr(.3,.9); return; }
  if(p.spot&&MR()<.3){ react(p,'argue',player.x,player.z,mrr(3,4)); return; }
  if(MR()<.35&&(p.cast==='mama'||p.cast==='baba')){ react(p,'argue',player.x,player.z,mrr(3,5)); if(sayT<=0){ sayT=5; toast(mpick(['"You dey mad?!"','"Na me you go beat?!"','"Shameless boy!"']),2.2); } p.fleeAfter=true; return; }
  p.state='flee'; p.timer=mrr(4,7); p.yaw=Math.atan2(p.x-player.x,p.z-player.z)+mrr(-.4,.4); }
function afterDown(p){ p.hp=Math.max(p.hp||0,35); if(p.cop){ p.state=p.cast==='police_m'?'copguard':'cop'; p.mad=1; p.atk=null; p.atkT=.4; return; }
  if(p.carjacked){ p.carjacked=false; if(p.cast==='areaboy'&&MR()<.65&&mode==='walk'){ p.state='fight'; p.atk=null; p.atkT=.6; toast('"You don thief my motor?! Come here!"',2.4); return; } }
  if(p.spot&&!p.beaten){ react(p,MR()<.7?'argue':'no',p.kx??player.x,p.kz??player.z,mrr(4,6)); return; }
  if(p.beaten){ p.state='flee'; p.timer=mrr(5,8); p.yaw=Math.atan2(p.x-player.x,p.z-player.z); if(p.cast==='areaboy'&&sayT<=0&&MR()<.5){ sayT=5; toast('"Oga, we don hear! No vex!"',2.2); } return; }
  if(MR()<.55){ react(p,MR()<.7?'argue':'no',p.kx??player.x,p.kz??player.z,mrr(4,6)); p.replan=true; if(sayT<=0&&Math.hypot(p.x-player.x,p.z-player.z)<30){ sayT=6; toast(mpick(['"You wan kill me?!"','"Driver, you dey craze?!"','"Na so una dey drive for this Lagos!"']),2.4); } }
  else { p.state='flee'; p.timer=mrr(3,5); p.yaw+=Math.PI+mrr(-.6,.6); } }
// an area boy in a fight: close in, keep a little space, swing when ready (two at a time; the rest wait their turn)
function fightPed(p,dt){ const dx=player.x-p.x, dz=player.z-p.z, d=Math.hypot(dx,dz);
  if(mode!=='walk'||FIGHT.ko||d>30){ p.giveUp=(p.giveUp||0)+dt; if(p.giveUp>4){ calmPed(p); return; } } else p.giveUp=0;
  if(p.dodgeT>0){ p.dodgeT-=dt; const c={x:p.x+p.dvx*dt,z:p.z+p.dvz*dt}; resolveCircle(c,.32); if(onLand(c.x,c.z)){ p.x=c.x; p.z=c.z; } p.yaw=lerpA(p.yaw,Math.atan2(dx,dz),Math.min(1,dt*6)); if(p.dodgeT<=0) p.atkT=Math.min(p.atkT,.25); return; }   // slipped your blow: straight back at you
  p.yaw=lerpA(p.yaw,Math.atan2(dx,dz),Math.min(1,dt*10)); p.atkT=(p.atkT||0)-dt;
  if(p.atk){ p.speed=0; p.atkTime+=dt; const mi=AI_INFO[p.atk], dur=durOf(p,p.atk)/mi.ts;
    if(p.atkTime<dur*.3&&d>1){ const c={x:p.x+dx/d*2.2*dt,z:p.z+dz/d*2.2*dt}; resolveCircle(c,.32); if(onLand(c.x,c.z)){ p.x=c.x; p.z=c.z; } }   // stepping into the blow
    for(let i=0;i<mi.hits.length;i++) if(!p.fired[i]&&p.atkTime>=mi.hits[i]*dur){ p.fired[i]=1; const fwd=(dx*Math.sin(p.yaw)+dz*Math.cos(p.yaw))/(d||1); if(d<mi.reach+.2&&fwd>.5) hitPlayer(p.atk==='kick'?9:5,p); else whoosh(); }
    if(p.atkTime>=dur){ p.atk=null; p.atkT=mrr(.7,1.6); } return; }
  const front=FIGHT.attackers.indexOf(p)<2, want=front?1.25:2.8;
  let mvx=0, mvz=0;
  if(d>want+.3){ const sp=d>7?3.8:front?2.3:1.5; p.speed+=(sp-p.speed)*Math.min(1,dt*5); mvx=dx/d; mvz=dz/d; }
  else if(d<want-.4){ p.speed=1; mvx=-dx/d; mvz=-dz/d; }
  else { if(front&&p.atkT>0){ if(!p.sd||MR()<dt*.6) p.sd=MR()<.5?1:-1; p.speed=.9; mvx=-dz/d*p.sd; mvz=dx/d*p.sd; }   // circling you, looking for an opening
    else p.speed=Math.max(0,p.speed-dt*6);
    if(front&&p.atkT<=0&&!FIGHT.ko&&!(hero&&hero.ov&&(hero.ov.name==='takedown_a'||hero.ov.name==='threaten'))){ p.atk=MR()<.65?'punch':'kick'; p.atkTime=0; p.fired=[]; p.seq=(p.seq||0)+1; } }
  for(const q of FIGHT.attackers){ if(q===p) continue; const ex=p.x-q.x, ez=p.z-q.z, e=Math.hypot(ex,ez); if(e<.9&&e>.01){ mvx+=ex/e*.8; mvz+=ez/e*.8; } }   // don't stand inside each other
  if(p.speed>0&&(mvx||mvz)){ const l=Math.hypot(mvx,mvz)||1, c={x:p.x+mvx/l*p.speed*dt,z:p.z+mvz/l*p.speed*dt}; resolveCircle(c,.32); if(onLand(c.x,c.z)){ p.x=c.x; p.z=c.z; } } }
function calmPed(p){ p.atk=null; p.giveUp=0; if(p.spot){ p.state='spot'; p.act=null; nextAct(p); } else { replanPed(p); p.startT=1.6; } }
// you are tougher than the people on the street, but a gang of area boys can still beat you to death
function hitPlayer(dmg,from,how){ if(FIGHT.ko||FIGHT.dead||busy||mode==='interior'||(hero&&hero.ov&&hero.ov.name==='takedown_a')) return;
  if(T0<FIGHT.inv&&how!=='car'){ FIGHT.counter=T0+1.2; whoosh(); return; }   // dodged: your next blow lands harder
  FIGHT.hp-=dmg/1.5; FIGHT.calmT=0; camState.shake=Math.min(1.2,camState.shake+.45); thud();
  { const ux=from?player.x-from.x:0, uz=from?player.z-from.z:0, l=Math.hypot(ux,uz)||1; bleed(player.x,1.5,player.z,ux/l,uz/l,how==='car'?10:3,1.4); } if(CARRY.p) carryDrop(true);
  if(FIGHT.hp<=0){ if(how==='baton'){ FIGHT.hp=1; busted(); return; } playerDie(how||'beaten'); return; }
  if(how==='shot'&&(MR()<.7||aimingNow())) return;   // a bullet: a jolt, not always a stagger
  const o=hero&&hero.ov; if(!o||!o.lock||(o.atk&&!o.heavy)) heroDo(MR()<.6?'hit_head':'hit_body',{force:true,ts:1.8}); FIGHT.chain=0; FIGHT.buf=null; }
// dead: you fall, the screen goes dark, and you wake up at LUTH with your stars gone
function playerDie(how){ if(FIGHT.dead) return; FIGHT.hp=0; FIGHT.ko=true; FIGHT.dead=true; FIGHT.koT=0; player.speed=0; carryDrop(true);
  if(mode==='drive'&&drive.v){ drive.speed=0; drive.v.speed=0; }
  else heroDo('uppercut',{force:true,ts:1.2,onEnd:()=>heroDo('lie',{force:true,pause:true})});
  bloodPool(player.x,player.z,1.4,4); for(const p of FIGHT.attackers) calmPed(p); bigMsg('WASTED','wasted');
  toast(how==='car'?'You were hit by a car. You don die!':how==='crash'?'You crashed. You don die!':how==='shot'?'Police bullets got you. You don die!':how==='blast'?'The blast got you. You don die!':how==='fire'?'The fire got you. You don die!':'The area boys beat you finish. You don die!',3.2);
  setTimeout(()=>{ fadeSwap(()=>{ if(mode==='drive') exitCar(); if(hero&&hero.ov){ hero.ov.a.stop(); hero.ov=null; } releaseCop(); clearCops(); if(RAID.v) leaveRaid(true); FIGHT.heat=0; FIGHT.ko=false; FIGHT.dead=false; FIGHT.hp=100; FIGHT.calmT=99;
    Object.assign(player,{x:LUTH.x,z:LUTH.z,yaw:LUTH.ry,speed:0}); player.y=0; camState.yaw=LUTH.ry; camState.pitch=.26;
    const bill=Math.min(CASH.n,Math.round(Math.max(1500,CASH.n*.1)/50)*50); addCash(-bill); ARMS.aim=false; ARMS.trig=false;
    toast(`You woke up at LUTH, Idi-Araba. The doctors don patch you up (bill ${naira(bill)}). Take am easy o!`,5); }); },3600); }
// ---- the police
function crime(p,k=1){ const civ=p.cast!=='areaboy'&&!p.cop; addHeat((civ?.15:.05)*k);
  if(COPS.near<35||FIGHT.cop&&Math.hypot(FIGHT.cop.x-player.x,FIGHT.cop.z-player.z)<35) addHeat(.25*k); }   // the police saw it
// stars grow with how bad the crime is: small crimes (fights, robbery, gunfire, a stolen car) stop at two stars,
// killings at three; only attacking the police goes higher
const CAP={minor:1.95,kill:3.55,cop:5.4};
function addHeat(a,cap=CAP.minor){ if(FIGHT.heat<cap) FIGHT.heat=Math.min(cap,FIGHT.heat+a); FIGHT.crimeT=0; }
const HEAT_MAX=5.4, starCount=()=>FIGHT.heat>=4.6?5:FIGHT.heat>=3.6?4:FIGHT.heat>=2.6?3:FIGHT.heat>=1.6?2:FIGHT.heat>=.8?1:0;   // GTA-style 1–5 stars
function dispatchCop(){ let best=null, bd=1e18; for(const v of vehicles){ if(v.type!=='police'||!v.ai||v===drive.v||v.ai.raid||v===RAID.v||isCopVan(v)||v.ai.chase) continue; const d=(v.x-player.x)**2+(v.z-player.z)**2; if(d<bd){ bd=d; best=v; } }
  if(!best){ for(const v of vehicles){ if(v.type==='police'&&!v.ai&&v!==drive.v&&!v.jacked&&!v.raid&&v!==RAID.v&&!v.copsOut&&!v.block){ best=v; break; } } if(!best||!placeCar(best,60,110,true)) return null; }   // a van from the station
  else if(bd>150*150) placeCar(best,60,110,true);   // close enough to arrive within half a minute
  best.ai.chase=true; best.ai.maxV0=best.ai.maxV0||best.ai.maxV; best.ai.maxV=Math.max(15,best.ai.maxV0*1.4); return best; }
function releaseCop(){ const v=FIGHT.cop; if(v&&v.ai){ v.ai.chase=false; if(v.ai.maxV0) v.ai.maxV=v.ai.maxV0; } FIGHT.cop=null; FIGHT.arrestT=0; }
// police follow the real streets to you: driving distance from every junction to where you are (one-way streets respected), refreshed as you move
const CHASE={at:-1,t:-99,dist:null,inn:null};
// the junction of the nearest drivable street (looks up to ~60 m around)
function driveNode(x,z){ let best=-1, bd=1e18; const ci=Math.floor(x/RGC), cj=Math.floor(z/RGC);
  for(let i=ci-2;i<=ci+2;i++) for(let j=cj-2;j<=cj+2;j++){ const L=RG.get(rgk(i,j)); if(L) for(const e of L){ if(!e.drive) continue; const d=segD(e,x,z); if(d<bd){ bd=d; const A0=nodes[e.a], B0=nodes[e.b]; best=Math.hypot(A0.x-x,A0.z-z)<Math.hypot(B0.x-x,B0.z-z)?e.a:e.b; } } }
  return best>=0?best:nearestNode(x,z); }
function chaseField(){ const f=mode==='drive'&&drive.v?drive.v:player, s=driveNode(f.x,f.z); if(CHASE.dist&&(s===CHASE.at||Math.abs(T0-CHASE.t)<.5)) return CHASE.dist;
  if(!CHASE.inn){ CHASE.inn=nodes.map(()=>[]); for(const n of nodes) for(const w of n.out) CHASE.inn[w].push(n.i); }
  CHASE.dist=dijkstra(s,u=>CHASE.inn[u]).dist; CHASE.at=s; CHASE.t=T0; return CHASE.dist; }
// on foot: the police drive to the kerb nearest you (into your street from either end), not just to the nearest junction
function chaseGoal(){ const f=mode==='drive'&&drive.v?drive.v:player; if(!CHASE.g||Math.hypot(CHASE.g.px-f.x,CHASE.g.pz-f.z)>10){ CHASE.g=goalAt(f.x,f.z); CHASE.g.px=f.x; CHASE.g.pz=f.z; } return CHASE.g; }
function chaseTurn(v,opts){ const g=v.ai.goal||(v.ai.chase&&!v.ai.raid&&mode!=='drive'?chaseGoal():null);
  if(g){ const at=v.ai.b, D=goalField(g); if(at===g.a&&opts.includes(g.b)) return g.b; if(at===g.b&&!g.ow&&opts.includes(g.a)) return g.a;   // into the street where you wait
    let best=opts[0], bd=1e19; for(const n of opts){ const d=D[n]+Math.hypot(nodes[n].x-nodes[at].x,nodes[n].z-nodes[at].z); if(d<bd){ bd=d; best=n; } } return best; }
  const G=v.ai.raid?RAID:player, D=v.ai.raid?fieldTo(RAID.node):chaseField(), b=nodes[v.ai.b]; let best=opts[0], bd=1e18;
  for(const n of opts){ const d=D[n]+Math.hypot(nodes[n].x-b.x,nodes[n].z-b.z)+(D[n]>=1e17?(nodes[n].x-G.x)**2+(nodes[n].z-G.z)**2:0); if(d<bd){ bd=d; best=n; } } return best; }
// driving distance from every junction to one fixed junction (a crime scene); a few are kept
const FIELDS=new Map();
function fieldTo(s){ let d=FIELDS.get(s); if(d) return d; if(!CHASE.inn){ CHASE.inn=nodes.map(()=>[]); for(const n of nodes) for(const w of n.out) CHASE.inn[w].push(n.i); }
  d=dijkstra(s,u=>CHASE.inn[u]).dist; FIELDS.set(s,d); if(FIELDS.size>4) FIELDS.delete(FIELDS.keys().next().value); return d; }
// caught: into the van, and into the cell at Mushin police station for three minutes (with whoever else they picked up)
function arrest(){ releaseCop(); clearCops(); FIGHT.heat=0; carryDrop(true);
  { const fine=Math.round(CASH.n*.15/50)*50, lost=[]; if(fine>0){ addCash(-fine); lost.push(naira(fine)); } if(ARMS.own.ak){ delete ARMS.own.ak; ARMS.mag=0; ARMS.ammo=0; lost.push('your AK-47'); } if(ARMS.own.gren||ARMS.own.molo){ delete ARMS.own.gren; delete ARMS.own.molo; lost.push('your bombs'); } if(ARMS.own.katana&&MR()<.5){ delete ARMS.own.katana; lost.push('your katana'); }
    if(!ARMS.own[ARMS.cur]) ARMS.cur='fists'; ARMS.aim=false; ARMS.trig=false; saveArms(); if(lost.length) setTimeout(()=>toast('Police seized '+lost.join(' and ')+'.',3.2),2600); }
  for(const p of FIGHT.attackers||[]) if(Math.hypot(p.x-player.x,p.z-player.z)<25){ JAIL.add(p.cast); offPed(p); }
  if(RAID.v){ for(const p of RAID.sus) if(p.state==='arrest'){ JAIL.add(p.cast); offPed(p); } leaveRaid(true); }
  fadeSwap(()=>{ if(mode==='drive') exitCar(); if(hero&&hero.ov){ hero.ov.a.stop(); hero.ov=null; } FIGHT.ko=false; FIGHT.hp=100; for(const p of FIGHT.attackers) calmPed(p); enterJail(); }); }
/* ================= carrying someone off (the street does not like it) =================
   G (or GRAB on a phone) next to someone picks them up over your shoulder; G again puts them down.
   Area boys who see it come for you; everyone else runs, and the police are called. */
const CARRY={p:null,t:0,cry:0};
function carryGrab(){ if(CARRY.p){ carryDrop(); return; } if(mode!=='walk'||busy||FIGHT.ko||!hero||(hero.ov&&hero.ov.lock&&!(hero.ov.atk&&hero.ov.t>=hero.ov.cancel*hero.ov.dur))||JACK.go) return;
  { const f=pickFoe(2.6,1.6); if(f&&f.body&&hero.act.takedown_a&&(f.state==='fight'||f.state==='hurt'||f===FIGHT.foe)&&!(f.atk&&f.cast==='areaboy')&&ARMS.cur==='fists') return takedown(f); }   // in a fight, GRAB slams him down
  if(ARMS.cur!=='fists'){ const v=pickFoe(2.8,1.4); if(v&&!v.cop&&!v.dealer&&!v.looted&&(v.state==='walk'||v.state==='idle'||v.state==='spot'||v.state==='react'||v.state==='shop'||v.state==='tsell')){ player.yaw=Math.atan2(v.x-player.x,v.z-player.z); return robPed(v); }
    if(v&&v.looted){ toast('"I don give you everything!"',1.6); return; } }   // a weapon in your hand: GRAB robs
  let best=null, bd=1.9; for(const p of peds){ if(!(p.state==='walk'||p.state==='idle'||p.state==='spot'||p.state==='react'||p.state==='flee'||p.state==='down'||p.state==='hurt'||p.state==='shop')) continue; const d=Math.hypot(p.x-player.x,p.z-player.z); if(d<bd){ bd=d; best=p; } }
  if(!best){ toast('Nobody close enough to carry.',1.6); return; }
  const p=best; if(p.spot){ const s=p.spot; s.peds=s.peds.filter(q=>q!==p); p.spot=null; }
  Object.assign(p,{state:'carried',carried:true,speed:0,atk:null,fall:1,vx:0,vz:0,timer:0}); p.seq=(p.seq||0)+1; CARRY.p=p; CARRY.t=0; CARRY.cry=2.5; player.speed=0;
  addHeat(.9); incident(player.x,player.z,'kidnap'); witnessCarry(p);
  toast(mpick(['"Leave me! Help! Help o!"','"Wetin you dey do?! Put me down!"','"Thief! Kidnapper! Help!"']),2.6); }
function witnessCarry(v){ let boys=0; for(const q of peds){ if(q===v||q.state==='off'||q.state==='dead'||q.carried||q.state==='arrest') continue; const d=Math.hypot(q.x-player.x,q.z-player.z); if(d>34) continue;
    if(q.cast==='areaboy'&&!q.beaten){ if(q.state!=='fight'&&q.state!=='hurt'&&q.state!=='down'&&q.state!=='getup'){ if(q.spot){ const s=q.spot; s.peds=s.peds.filter(o=>o!==q); q.spot=null; } q.state='fight'; q.atk=null; q.atkT=mrr(.6,1.6); boys++; } }
    else if(d<26&&(q.state==='walk'||q.state==='idle'||q.state==='spot'||q.state==='shop')){ q.state='flee'; q.timer=mrr(4,7); q.yaw=Math.atan2(q.x-player.x,q.z-player.z)+mrr(-.5,.5); } }
  if(boys) setTimeout(()=>{ toast(mpick(['"Hey! Drop am! You wan kidnap person for our area?!"','"Boys! Kidnapper! Catch am!"']),2.8); },1400); }
function carryDrop(quiet){ const p=CARRY.p; if(!p) return; CARRY.p=null; p.carried=false; const fx=Math.sin(player.yaw), fz=Math.cos(player.yaw);
  const c={x:player.x+fx*.9,z:player.z+fz*.9}; resolveCircle(c,.3); Object.assign(p,{x:c.x,z:c.z,y:0,state:'down',timer:mrr(1.6,2.6),downT:1,got:0,fall:1,vx:fx*.5,vz:fz*.5,kx:player.x,kz:player.z}); p.seq=(p.seq||0)+1;
  if(!quiet&&sayT<=0){ sayT=4; toast(mpick(['"God punish you! I go report you!"','"Ah! Thank God!"']),2.2); } }
function carriedPed(p){ if(CARRY.p!==p){ p.carried=false; p.state='down'; p.timer=1.5; p.y=0; } }
// a fireman's carry: their middle on your right shoulder, their back hanging down behind you, legs down your front
const _cv=()=>new THREE.Vector3(), _cq=new THREE.Quaternion(), _cm=new THREE.Matrix4();
function carryFrame(){ const f=new THREE.Vector3(Math.sin(player.yaw),0,Math.cos(player.yaw)), u=new THREE.Vector3(0,1,0); return {f,u,r:new THREE.Vector3().crossVectors(f,u)}; }
function carryPose(p){ const b=p.body; if(!b||!hero||!b.hips) return; const C=b.bc||(b.bc={}), sh=boneOf(hero.cObj,/RightArm$/,ARMS.bones||(ARMS.bones={}),'ru'); if(!sh) return;
  const {f,u,r}=carryFrame(), S=sh.getWorldPosition(_cv());
  const H=S.clone().addScaledVector(u,.17).addScaledVector(r,-.11).addScaledVector(f,.03);
  const Y=u.clone().multiplyScalar(-.8).addScaledVector(f,-.6).normalize(), Z=f.clone().addScaledVector(Y,-f.dot(Y)).normalize(), X=new THREE.Vector3().crossVectors(Y,Z);
  const hips=b.hips; hips.parent.updateWorldMatrix(true,false); _cq.setFromRotationMatrix(_cm.makeBasis(X,Y,Z));
  hips.quaternion.copy(hips.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(_cq)); hips.position.copy(hips.parent.worldToLocal(H.clone())); hips.updateMatrixWorld(true);
  const aim=(n,cn,dir)=>{ const bn=boneOf(b.inner,new RegExp(n+'$'),C,n), ch=boneOf(b.inner,new RegExp(cn+'$'),C,cn); if(!bn||!ch) return; const a=bn.getWorldPosition(_cv()), c=ch.getWorldPosition(_cv()); turnBone(bn,c,a.clone().addScaledVector(dir,a.distanceTo(c))); };
  const L=u.clone().multiplyScalar(-.8).addScaledVector(f,.6).normalize(), L2=u.clone().multiplyScalar(-1).addScaledVector(f,.12).normalize(), A=u.clone().multiplyScalar(-1).addScaledVector(f,-.12).normalize();
  for(const s of ['Left','Right']){ aim(s+'UpLeg',s+'Leg',L); aim(s+'Leg',s+'Foot',L2); aim(s+'Arm',s+'ForeArm',A); aim(s+'ForeArm',s+'Hand',A); } }
// your right arm holds their legs; you lean into the weight
function carryArms(){ if(!CARRY.p||!hero||mode!=='walk') return; const B=ARMS.bones||(ARMS.bones={}), c=hero.cObj;
  const ru=boneOf(c,/RightArm$/,B,'ru'), rl=boneOf(c,/RightForeArm$/,B,'rl'), rh=boneOf(c,/RightHand$/,B,'rh'), sp=boneOf(c,/Spine1$/,B,'sp1'); if(!ru||!rl||!rh) return;
  const {f,u,r}=carryFrame();
  if(sp){ sp.getWorldQuaternion(_iq2); _iq.setFromAxisAngle(r,-.16-Math.min(.1,player.speed*.025)); _iq.multiply(_iq2); sp.parent.getWorldQuaternion(_iq2); sp.quaternion.copy(_iq2.invert().multiply(_iq)); sp.updateMatrixWorld(true); }
  const S=ru.getWorldPosition(_cv()), T=S.clone().addScaledVector(f,.2).addScaledVector(u,-.1).addScaledVector(r,.02);
  ik2(ru,rl,rh,T,S.clone().addScaledVector(r,.3).addScaledVector(u,-.45).addScaledVector(f,.15)); }
// over your shoulder, every frame after you move
function updateCarry(dt){ const p=CARRY.p; if(!p) return; CARRY.t+=dt;
  if(p.state!=='carried'||mode!=='walk'){ carryDrop(true); return; }
  p.x=player.x; p.z=player.z; p.y=player.y+1.3; p.yaw=player.yaw+Math.PI/2;
  if((CARRY.cry-=dt)<=0){ CARRY.cry=mrr(5,9); if(sayT<=0){ sayT=3; toast(mpick(['"Help! Help o!"','"Put me down!"','"Somebody help me!"']),1.8); } if(MR()<.5) witnessCarry(p); FIGHT.crimeT=0; } }
/* ================= police raids =================
   A fight, a killing or someone carried off brings the nearest police van (within about 400 m) to the spot. It parks anyhow,
   and everyone still fighting, hurt or lying there is ordered into the van (the officers stay inside until a police model
   arrives); if you were part of it, you go too. Then the van drives off to the station. */
const RAID={v:null,x:0,z:0,node:-1,phase:'',t:0,cool:0,kind:'',sus:[],cops:[]};
function incident(x,z,kind){ if(mode==='interior'||RAID.cool>0||!started) return;
  if(RAID.v){ if(Math.hypot(RAID.x-x,RAID.z-z)<60) RAID.seen=T0; return; }
  let best=null, bd=420*420; for(const v of vehicles){ if(v.type!=='police'||!v.ai||v===drive.v||isCopVan(v)||v.ai.chase) continue; const d=(v.x-x)**2+(v.z-z)**2; if(d<bd){ bd=d; best=v; } }
  if(!best){ if(kind==='fight'&&MR()<.5){ RAID.cool=12; return; }   // not every scuffle gets a van
    best=vehicles.find(v=>v.type==='police'&&!v.ai&&v!==drive.v&&!v.jacked&&!v.raid&&v!==FIGHT.cop&&!v.copsOut&&!v.block); if(!best||!placeCar(best,100,180,true,{x,z})) return; }
  Object.assign(RAID,{v:best,x,z,node:driveNode(x,z),phase:'drive',t:0,kind,sus:[],seen:T0});
  const ai=best.ai; ai.chase=true; ai.raid=true; ai.maxV0=ai.maxV0||ai.maxV; ai.maxV=Math.max(14,ai.maxV0*1.35);
  if(Math.hypot(x-player.x,z-player.z)<150&&sayT<=0){ sayT=4; toast(kind==='kill'?'"Somebody don call police! Run!"':'People are calling the police…',2.6); } }
// the van stops anyhow: half on the kerb, at an angle
function parkRough(v){ const e=edgeOf(v.ai.a,v.ai.b)||edgeOf(v.ai.b,v.ai.a); v.ai=null; v.raid=true; v.parked=true; v.speed=0;
  if(e){ const sd=((RAID.x-v.x)*-e.fz+(RAID.z-v.z)*e.fx)>=0?1:-1, push=Math.max(0,e.hw-1.2); v.x+=-e.fz*sd*push; v.z+=e.fx*sd*push; } v.h+=(MR()<.5?1:-1)*mrr(.25,.5); }
function pickSuspects(){ const out=[];
  for(const p of peds){ if(out.length>=6) break; if(p.state==='off'||p.state==='dead'||p.carried||p.state==='xbr'||p.state==='board'||p.state==='tsell') continue; if(Math.hypot(p.x-RAID.x,p.z-RAID.z)>24) continue;
    if(!(p.state==='fight'||p.state==='hurt'||p.state==='down'||p.state==='getup'||p.state==='takedown'||(p.cast==='areaboy'&&p.hp!=null))) continue;
    if(p.spot){ const s=p.spot; s.peds=s.peds.filter(q=>q!==p); p.spot=null; } Object.assign(p,{state:'arrest',speed:0,atk:null,timer:0,fall:0,vx:0,vz:0}); p.seq=(p.seq||0)+1; out.push(p); }
  return out; }
function leaveRaid(now){ const v=RAID.v, g=(RAID.cops||[]).filter(q=>q.state==='copguard'&&q.van===v&&q.cop);
  if(!now&&v&&g.length&&RAID.phase!=='board'&&!v.ai&&v!==drive.v){ RAID.phase='board'; RAID.t=0; for(const p of RAID.sus) if(p.state==='arrest'){ p.state='flee'; p.timer=mrr(3,5); p.yaw=MR()*6.28; } RAID.sus=[]; return; }   // the officers get back in first
  if(now) for(const q of g) offPed(q); RAID.cops=[]; endRaid(); }
function endRaid(){ const v=RAID.v; RAID.v=null; RAID.cool=25; RAID.phase=''; for(const p of RAID.sus) if(p.state==='arrest'){ p.state='flee'; p.timer=mrr(3,5); p.yaw=MR()*6.28; }
  if(!v) return; v.raid=false; v.parked=false; if(v.ai){ v.ai.chase=false; v.ai.raid=false; if(v.ai.maxV0) v.ai.maxV=v.ai.maxV0; return; }
  backOnRoad(v); }   // back onto the road and away to the station
function updateRaid(dt){ if(RAID.cool>0) RAID.cool-=dt; const v=RAID.v; if(!v) return; RAID.t+=dt;
  if(v===drive.v||v.jacked){ RAID.v=null; RAID.cool=30; v.raid=false; RAID.cops=[]; return; }   // you took their van!
  if(RAID.phase==='drive'){ if(!v.ai){ leaveRaid(); return; } const d=Math.hypot(v.x-RAID.x,v.z-RAID.z);
    if((d<28&&Math.abs(v.speed)<1.5)||d<9){ parkRough(v); RAID.phase='load'; RAID.t=0; RAID.sus=pickSuspects(); raidCops(v);
      if(Math.hypot(v.x-player.x,v.z-player.z)<70){ sayT=5; toast(RAID.sus.length?'Police: "Nobody move! Everybody wey dey fight, enter motor!"':'Police: "Wetin happen here? Who do am?"',3); } }
    else if(RAID.t>100) leaveRaid();
    return; }
  if(RAID.phase==='board'){ const g=(RAID.cops||[]).filter(q=>q.state==='copguard'&&q.van===v&&q.cop); if(!g.length||RAID.t>14){ for(const q of g) offPed(q); RAID.cops=[]; endRaid(); } return; }
  if(RAID.phase==='load'){ const dp=Math.hypot(player.x-v.x,player.z-v.z);
    if(mode==='walk'&&!busy&&!FIGHT.dead&&dp<24&&(starCount()>0||T0-FIGHT.lastAtk<60||FIGHT.near||CARRY.p)){ arrest(); return; }   // you were in it too
    let left=0; const fx=Math.cos(v.h), fz=-Math.sin(v.h), dx=v.x-fx*(v.c.def.L/2+.9), dz=v.z-fz*(v.c.def.L/2+.9);
    for(const p of RAID.sus){ if(p.state!=='arrest') continue; left++; const ex=dx-p.x, ez=dz-p.z, d=Math.hypot(ex,ez);
      if(d<.8){ JAIL.add(p.cast); offPed(p); continue; } p.speed+=(1.25-p.speed)*Math.min(1,dt*3); const st=Math.min(d,p.speed*dt); p.x+=ex/d*st; p.z+=ez/d*st; p.yaw=lerpA(p.yaw,Math.atan2(ex,ez),Math.min(1,dt*6)); }
    if((!left&&RAID.t>6)||RAID.t>35) leaveRaid(); } }
let sirenNodes=null;
function siren(on,vol){ if(!AC) return; if(!sirenNodes){ const o=AC.createOscillator(), g=AC.createGain(); o.type='square'; g.gain.value=0; o.connect(g); g.connect(master); o.start(); sirenNodes={o,g}; }
  const t=AC.currentTime; sirenNodes.g.gain.setTargetAtTime(on?vol*.025:0,t,.1); if(on) sirenNodes.o.frequency.setTargetAtTime(Math.floor(t*2.2)%2?720:960,t,.02); }
// ---- every frame
function updateFight(dt){ FIGHT.attackers=peds.filter(p=>p.state==='fight').sort((a,b)=>Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z));
  FIGHT.near=FIGHT.attackers.some(p=>Math.hypot(p.x-player.x,p.z-player.z)<8);
  if(FIGHT.foeT>0) FIGHT.foeT-=dt; if(FIGHT.carT>0) FIGHT.carT-=dt;
  // health comes back when you stop fighting
  FIGHT.calmT+=dt; if(!FIGHT.ko&&FIGHT.calmT>5&&FIGHT.hp<100) FIGHT.hp=Math.min(100,FIGHT.hp+dt*5);
  if(FIGHT.ko){ FIGHT.koT+=dt; if(!FIGHT.dead&&FIGHT.koT>3.2&&hero&&hero.ov&&hero.ov.name==='lie'){ heroDo('stand_up',{force:true,ts:1.8,onEnd:()=>{ FIGHT.ko=false; FIGHT.calmT=0; }}); } }
  // stars fade when nobody is chasing you
  FIGHT.crimeT+=dt; const cop=FIGHT.cop, cd=cop?Math.hypot(cop.x-player.x,cop.z-player.z):1e9;
  if(FIGHT.crimeT>20&&Math.min(cd,COPS.near)>150) FIGHT.heat=Math.max(0,FIGHT.heat-dt*.03);   // about half a minute per star, once the police lose you
  const st=starCount();
  if(st>=1&&!FIGHT.cop&&mode!=='interior'){ FIGHT.cop=dispatchCop(); if(FIGHT.cop&&FIGHT.warned<T0-20){ FIGHT.warned=T0; toast('Police don hear! Run or hide.',3); } }
  if(st===0&&FIGHT.cop){ releaseCop(); toast('Police don give up. You dey free.',2.6); }
  if(FIGHT.cop&&((!FIGHT.cop.ai&&!FIGHT.cop.copsOut)||FIGHT.cop===drive.v)){ FIGHT.cop=null; }
  if(FIGHT.cop&&FIGHT.cop.ai&&FIGHT.cop.noCops){ const near=cd<(mode==='drive'?9:FIGHT.cop.ai&&FIGHT.cop.ai.near?45:26)&&Math.abs(FIGHT.cop.speed)<2.5&&!busy; FIGHT.arrestT=near?FIGHT.arrestT+dt:Math.max(0,FIGHT.arrestT-dt*.5);
    if(near&&FIGHT.arrestT<dt*1.5&&sayT<=0){ sayT=4; toast('Police: "Stop there! Oya, enter motor!"',2.4); }
    if(FIGHT.arrestT>1.8) arrest(); }
  siren(!!FIGHT.cop&&cd<180&&mode!=='interior',1-Math.min(1,cd/180)); }
function updateFightHUD(){ const show=started&&mode!=='interior';   // your life bar is always there on the street
  if(show){ cashHUD(); weapHUD(); touchButtons(1/30); } else if(!$('#weap').hidden) $('#weap').hidden=true;
  if($('#vitals').hidden===show){ $('#vitals').hidden=!show; document.body.classList.toggle('vit',show); } if(!show) return;   // phones: the minimap moves down under the bars
  const hp=Math.round(FIGHT.hp); if(hp!==FIGHT.shownHp){ FIGHT.shownHp=hp; $('#hpFill').style.width=hp+'%'; $('#hpFill').classList.toggle('low',hp<35); }
  const s=starCount(); if(s!==FIGHT.shownStars){ FIGHT.shownStars=s; { const e=$('#stars'); e.textContent='★'.repeat(s); const i=document.createElement('i'); i.textContent='★'.repeat(5-s); e.append(i); } $('#stars').hidden=s===0; }
  $('#stars').classList.toggle('chase',!!FIGHT.cop);
  const f=FIGHT.foe, fs=f&&FIGHT.foeT>0&&f.state!=='off'; if($('#foe').hidden===!!fs) $('#foe').hidden=!fs;
  if(fs){ const nm=({areaboy:'AREA BOY',mama:'MAMA',baba:'BABA',hawker:'HAWKER',schoolboy:'SCHOOLBOY'})[f.cast]||'LADY'; if($('#foeName').textContent!==nm) $('#foeName').textContent=nm; $('#foeFill').style.width=Math.max(0,Math.round((f.hp??HP0(f.cast))/HP0(f.cast)*100))+'%'; } }

/* ================= wardrobe: change your clothes at home =================
   Each look lends you its clothes: the body of one of the city's people (or an outfit made in Mixamo, assets/people/outfit_*.glb,
   once its file is in the game) with its head cut away and yours put on, so you keep your face. Men pick from the men's clothes,
   women from the women's. Shirt and trousers can be dyed. The choice is kept on this device. */
const LOOK_LIST=[
  {id:'me',name:'Classic you',f:0,sw:['#55633f','#1d1d20']},
  {id:'areaboy',name:'Street green',f:0},
  {id:'baba',name:'White kaftan',f:0,robe:1},
  {id:'outfit_suit',name:'Gold print suit',f:0,h:1.84,idle:['idle_1'],sw:['#8a6a3a','#2a2218'],file:1},
  {id:'outfit_thobe',name:'White thobe',f:0,robe:1,h:1.82,idle:['idle_1'],sw:['#f2f0ea','#f2f0ea'],file:1},
  {id:'outfit_tracksuit',name:'Black tracksuit',f:0,h:1.8,idle:['idle_1'],sw:['#2a2a2e','#141416'],file:1},
  {id:'girl',name:'Classic you',f:1},
  {id:'suit_lady',name:'Grey trouser suit',f:1},
  {id:'mama',name:'Ankara mama',f:1,robe:1,hair:'Neck'},
  {id:'lady_red',name:'Red dress',f:1,robe:1},
  {id:'lady_black',name:'All black',f:1},
  {id:'outfit_dress_pink',name:'Pink dress',f:1,robe:1,h:1.72,idle:['idle_3'],sw:['#ead3d8','#ead3d8'],file:1},
  {id:'outfit_casual',name:'Mustard and jeans',f:1,h:1.72,idle:['idle_4'],sw:['#cc9438','#2b3b5e'],file:1}];
/* ================= home life: sit, watch TV, cook and eat, bath, sleep, music and dance, sweep =================
   The flat's furniture (found by name in room.glb) gives the places: sofas and chairs to sit, the TV, the cooker, the
   dining table, the shower, the bed, the soundbar and the bucket. Walk up and press E. Moving again (or E) stands you up.
   Moves: the real Mixamo ones when they are in moves2.glb (v2_sit, v2_eat…), else poses made in code (src/char2.js POSES). */
const HL={act:null,music:null,tv:0,tvT:0,food:0,broom:null,dirt:[],fx:null,clips:null,clipsFor:null,danceI:0};
function homeSpots(H){ const {named,boxOf,facing,free,nearFree}=H, V=THREE.Vector3, out={spots:[],free,nearFree};
  const bb=re=>boxOf(named(re)), ok=b=>!b.isEmpty(), ctr=b=>b.getCenter(new V()), size=b=>b.getSize(new V());
  const tvB=bb(/^TV_Screen$/), coffee=bb(/^CoffeeTable_Top$/), dining=bb(/^Dining_Top$/), desk=bb(/^Desk_Top$/);
  if(ok(tvB)){ const f=facing(tvB); out.tv={c:ctr(tvB),sz:size(tvB),n:f.n.clone()}; }
  // seats along a sofa (or one chair), facing what stands in front of it; you walk up from the front, or from behind a dining chair
  const seats=(b,kind,target,{depth=.24,y=.47,max=3,from='front'}={})=>{ if(!ok(b)) return; const c=ctr(b), s=size(b);
    let n; if(target&&ok(target)){ const t=ctr(target), dx=t.x-c.x, dz=t.z-c.z; n=Math.abs(dx)>Math.abs(dz)?new V(Math.sign(dx),0,0):new V(0,0,Math.sign(dz)); } else n=facing(b).n.clone();
    const alongX=Math.abs(n.z)>.5, len=alongX?s.x:s.z, thin=alongX?s.z:s.x, k=Math.max(1,Math.min(max,Math.round(len/.68))), yaw=Math.atan2(n.x,n.z);
    let kd=kind; if(kind==='sit'&&out.tv){ const d=out.tv.c.clone().sub(c); d.y=0; d.normalize(); if(d.dot(n)>.8) kd='tv'; }
    for(let i=0;i<k;i++){ const u=(i+.5)/k-.5, hx=c.x+(alongX?u*len:0)+n.x*(thin/2-depth), hz=c.z+(alongX?0:u*len)+n.z*(thin/2-depth);
      const a=from==='back'?.48:-.62, at=nearFree(hx-n.x*a,hz-n.z*a); out.spots.push({kind:kd,x:hx,z:hz,y,yaw,at,r:.55,n:n.clone()}); } };
  const front=ok(coffee)?coffee:tvB;
  seats(bb(/^Sofa3_Cushions$/),'sit',front); seats(bb(/^Sofa_(Base|Cushion)/),'sit',front); seats(bb(/^Armchair_Cushions$/),'sit',front,{max:1});
  const dc=named(/^DiningChair_.*_Seat$/); for(const p of dc) seats(p.bb,'dine',dining,{depth:.2,max:1,from:'back'});
  if(!dc.length&&ok(dining)){ const c=ctr(dining), sz=size(dining), alongX=sz.x>=sz.z, len=alongX?sz.x:sz.z, thin=alongX?sz.z:sz.x, k=Math.max(1,Math.round(len/.8));   // chairs packed together in the file: seats all round the table
    const put=(x,z,nx,nz)=>{ const at=nearFree(x-nx*.48,z-nz*.48); out.spots.push({kind:'dine',x,z,y:.47,yaw:Math.atan2(nx,nz),at,r:.55,n:new V(nx,0,nz)}); };
    for(const sg of [1,-1]) for(let i=0;i<k;i++){ const u=((i+.5)/k-.5)*len, o=thin/2+.28; if(alongX) put(c.x+u,c.z+sg*o,0,-sg); else put(c.x+sg*o,c.z+u,-sg,0); }
    for(const sg of [1,-1]){ const o=len/2+.33; if(alongX) put(c.x+sg*o,c.z,-sg,0); else put(c.x,c.z+sg*o,0,-sg); } }
  seats(bb(/^Chair_Seat$/),'sit',desk,{depth:.2,y:.5,max:1,from:'back'});
  if(ok(dining)) out.table=dining;
  // the cooker and its pot
  const ck=bb(/^Cooker_(Top|Body)$/); if(ok(ck)){ const f=facing(ck), c=f.c, q=nearFree(c.x+f.n.x*(f.d+.36),c.z+f.n.z*(f.d+.36));
    out.spots.push({kind:'cook',x:q.x,z:q.z,y:0,yaw:Math.atan2(-f.n.x,-f.n.z),at:q,r:.75});
    const pot=bb(/^Pot_Jollof$/); out.pot=ok(pot)?ctr(pot):new V(c.x,ck.max.y+.1,c.z); out.potTop=ok(pot)?pot.max.y:ck.max.y+.15; out.burnY=bb(/^Cooker_Top$/).max.y||ck.max.y; }
  // the shower: you stand in the middle, facing out through the glass
  const sm=bb(/^Shower_Metal$/), sh=ok(sm)?sm:bb(/^Shower_(Tray|Screen)$/); if(ok(sh)){ const c=ctr(sh), scr=bb(/^Shower_Screen$/); let n=facing(sh).n.clone();
    if(ok(scr)){ const d=ctr(scr).sub(c); d.y=0; n=Math.abs(d.x)>Math.abs(d.z)?new V(Math.sign(d.x),0,0):new V(0,0,Math.sign(d.z)); }
    const at=nearFree(c.x+n.x*.95,c.z+n.z*.95), tray=bb(/^Shower_Tray$/); out.spots.push({kind:'bath',x:c.x,z:c.z,y:ok(tray)?tray.max.y:0,yaw:Math.atan2(n.x,n.z),at,r:.8,n});
    out.shower={c,top:Math.min(2.1,sh.max.y),sz:size(sh)}; }
  // the bed: lie along it, head to the headboard
  const mt=bb(/^Mattress$/), hb=bb(/^Bed_Headboard$/); if(ok(mt)){ const c=ctr(mt), s=size(mt), alongX=s.x>s.z, dir=alongX?new V(1,0,0):new V(0,0,1);
    if(ok(hb)){ const h=ctr(hb); if((alongX?h.x-c.x:h.z-c.z)<0) dir.negate(); }
    const side=alongX?new V(0,0,1):new V(1,0,0), w=(alongX?s.z:s.x)/2; let at=null;
    for(const sg of [1,-1]){ const q={x:c.x+side.x*sg*(w+.4)-dir.x*.2,z:c.z+side.z*sg*(w+.4)-dir.z*.2}; if(free(q.x,q.z)){ at=q; break; } }
    const bl=bb(/^Blanket$/); out.spots.push({kind:'bed',x:c.x,z:c.z,y:Math.max(mt.max.y,ok(bl)?bl.max.y-.02:0),dir,at:at||nearFree(c.x+side.x*(w+.4),c.z+side.z*(w+.4)),r:.85,len:alongX?s.x:s.z}); }
  // the soundbar (or any speaker) plays music
  const sb=bb(/^(Soundbar|Speaker)/i); if(ok(sb)){ const c=ctr(sb), n=out.tv?out.tv.n:facing(sb).n; out.spots.push({kind:'music',x:c.x,z:c.z,y:0,at:nearFree(c.x+n.x*.9,c.z+n.z*.9),r:.9}); out.sb={c,sz:size(sb),n:n.clone()}; }
  // the bucket: take the broom
  const bk=bb(/^Bucket$/); if(ok(bk)){ const c=ctr(bk); out.spots.push({kind:'clean',x:c.x,z:c.z,y:0,at:nearFree(c.x,c.z+.01),r:.8}); out.bucket=c; }
  out.floors=named(/^Floor(?!_?Lamp)/i).map(p=>p.bb.clone());
  return out; }

// ---- the moves for the house, made once per body
function snapRest(o){ const m=new Map(); o.traverse(b=>{ if(b.isBone) m.set(b,[b.position.clone(),b.quaternion.clone()]); }); return m; }   // a body's bones as it came (its rest pose)
function homeInfo(){ const r=hero.root, p=r.position.clone(), ry=r.rotation.y, yo=hero.cObj.position.y; r.position.set(0,0,0); r.rotation.set(0,0,0); hero.cObj.position.y=0;
  if(hero.rest) for(const [b,[pp,q]] of hero.rest){ b.position.copy(pp); b.quaternion.copy(q); }
  const D=C2.skeletonInfo(hero.cObj); r.position.copy(p); r.rotation.y=ry; hero.cObj.position.y=yo; hero.mixer.update(0); r.updateMatrixWorld(true); return D; }
function homeClips(){ if(HL.clipsFor===hero.cObj&&HL.clips) return HL.clips; const D=homeInfo(), C={}, names=new Set(); hero.cObj.traverse(o=>{ if(o.isBone) names.add(o.name); });
  const own=hero.look&&hero.look.clips, fit=n=>own&&own[n]?own[n]:(PEOPLE.clips[n]?fitClip(PEOPLE.clips[n],names,hero.hipsRest):null);
  const M=V2.movesDone, mv=n=>{ const c=M&&M.g.animations.find(a=>a.name===n); return c?C2.retargetClip(c,M.S,D,{norm:true}):null; };
  for(const k of ['sit','eat','cook','sweep','bath']) C[k]=mv('v2_'+k)||C2.poseClip(D,'home_'+k,C2.POSES[k]);   // the real Mixamo move when it is in, else the made pose
  C.tv=mv('v2_tv')||C.sit; C.sleep=mv('v2_sleep')||fit('f_lie')||fit('lie')||C.sit;
  C.dance=['v2_dance1','v2_dance2','v2_dance3'].map(mv).filter(Boolean); if(!C.dance.length) C.dance=['dance_1','dance_salsa','dance_macarena'].map(fit).filter(Boolean);
  C.info=D; HL.clips=C; HL.clipsFor=hero.cObj; return C; }
// where a move puts the head, hips and feet (relative to the body's own spot), to fit it on a bed or a seat
function homeMeasure(clip,t){ const r=hero.root, p=r.position.clone(), ry=r.rotation.y; r.position.set(0,0,0); r.rotation.set(0,0,0);
  const m=new THREE.AnimationMixer(hero.cObj), a=m.clipAction(clip).play(); m.setTime(t); r.updateMatrixWorld(true); const D=HL.clips.info, P=n=>{ const b=D.nodes.get(n); return b?b.getWorldPosition(new THREE.Vector3()):null; };
  const head=P('Head'), hips=P('Hips'), fl=P('LeftFoot'), fr=P('RightFoot'), feet=fl&&fr?fl.clone().add(fr).multiplyScalar(.5):hips.clone();
  let lo=1e9; for(const n of ['Head','Hips','LeftFoot','RightFoot','LeftHand','RightHand','Spine2','LeftLeg','RightLeg']){ const q=P(n); if(q) lo=Math.min(lo,q.y); }
  a.stop(); m.stopAllAction(); m.uncacheRoot(hero.cObj); r.position.copy(p); r.rotation.y=ry; hero.mixer.update(0); r.updateMatrixWorld(true); return {head,hips,feet,lo}; }

// ---- things you see: the TV picture, fire and steam, shower water, a plate of jollof, the broom, dirt, the speaker lights
function homeFx(){ const R=INT.home; if(HL.fx&&HL.fx.scene===INT.scene) return HL.fx; const S=INT.scene, fx={scene:S};
  const soft=(()=>{ const [c,g]=cv(64,64), gr=g.createRadialGradient(32,32,2,32,32,30); gr.addColorStop(0,'rgba(255,255,255,.9)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,64,64); return tx(c,false,false); })();
  if(R.tv){ const [c,g]=cv(320,180), t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; const m=new THREE.Mesh(new THREE.PlaneGeometry(R.tv.sz.x>R.tv.sz.z?R.tv.sz.x*.97:R.tv.sz.z*.97,R.tv.sz.y*.95),new THREE.MeshBasicMaterial({map:t,toneMapped:false}));
    m.position.copy(R.tv.c).addScaledVector(R.tv.n,.006); m.lookAt(m.position.clone().add(R.tv.n)); m.visible=false; m.layers.enableAll(); S.add(m); fx.tv={m,c,g,t,last:-1,ch:0,glow:new THREE.PointLight(0x88aaff,0,4,2)}; fx.tv.glow.position.copy(R.tv.c).addScaledVector(R.tv.n,.6); S.add(fx.tv.glow); }
  if(R.pot){ const fm=new THREE.MeshBasicMaterial({color:0xff8a2a,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false}), fb=new THREE.MeshBasicMaterial({color:0x3a7bff,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false});
    const g=new THREE.Group(); for(let i=0;i<10;i++){ const a=i/10*Math.PI*2, m=new THREE.Mesh(new THREE.ConeGeometry(.018,.06,6),i%2?fm:fb); m.position.set(Math.cos(a)*.1,.03,Math.sin(a)*.1); g.add(m); }
    g.position.set(R.pot.x,R.burnY,R.pot.z); g.visible=false; S.add(g); fx.fire=g; fx.fireL=new THREE.PointLight(0xff9a40,0,2.5,2); fx.fireL.position.set(R.pot.x,R.burnY+.15,R.pot.z); S.add(fx.fireL); }
  const steamM=new THREE.SpriteMaterial({map:soft,color:0xffffff,transparent:true,opacity:0,depthWrite:false}); fx.steam=[];
  for(let i=0;i<14;i++){ const s=new THREE.Sprite(steamM.clone()); s.visible=false; S.add(s); fx.steam.push({s,t:Math.random(),src:null}); }
  if(R.shower){ const n=260, P=new Float32Array(n*6), geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(P,3)); const w=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0xcfe6ff,transparent:true,opacity:.55,depthWrite:false}));
    w.frustumCulled=false; w.visible=false; S.add(w); fx.water={w,P,n,seed:new Float32Array(n*3).map(()=>Math.random())}; }
  { const g=new THREE.Group(), plate=new THREE.Mesh(new THREE.CylinderGeometry(.14,.11,.025,24),new THREE.MeshStandardMaterial({color:0xf4f1ea,roughness:.3}));
    const rice=new THREE.Mesh(new THREE.SphereGeometry(.1,18,10,0,Math.PI*2,0,Math.PI/2.2),new THREE.MeshStandardMaterial({color:0xd8571e,roughness:.85})); rice.scale.y=.45; rice.position.y=.012;
    const meat=new THREE.Mesh(new THREE.SphereGeometry(.035,10,8),new THREE.MeshStandardMaterial({color:0x6b3416,roughness:.6})); meat.scale.set(1.4,.8,1); meat.position.set(.05,.04,.03);
    const pl=new THREE.Mesh(new THREE.BoxGeometry(.05,.012,.03),new THREE.MeshStandardMaterial({color:0xe8a33a,roughness:.5})); pl.position.set(-.06,.03,.04); pl.rotation.y=.6;   // dodo
    g.add(plate,rice,meat,pl); g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } }); g.visible=false; S.add(g); fx.plate=g; }
  { const g=new THREE.Group(), straw=new THREE.MeshStandardMaterial({color:0xc9a35a,roughness:.95,side:THREE.DoubleSide}), tie=new THREE.MeshStandardMaterial({color:0x7a3b1c,roughness:.8});
    const bun=new THREE.Mesh(new THREE.ConeGeometry(.075,.74,14,1,true),straw); bun.rotation.x=Math.PI; bun.position.y=.37;   // a Nigerian broom: a bundle of palm sticks tied at the top, fanning out
    const band=new THREE.Mesh(new THREE.CylinderGeometry(.02,.022,.07,10),tie); band.position.y=.07; g.add(bun,band);
    g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.layers.set(1); } }); fx.broom=g; }   // a Nigerian broom: a long handle and a bundle of straw
  { const g=new THREE.Group(), m=new THREE.Mesh(new THREE.CylinderGeometry(.008,.006,.32,6),new THREE.MeshStandardMaterial({color:0x8a5a2b,roughness:.6})); m.position.y=.1; g.add(m); fx.spoon=g; }
  { const [c,g]=cv(128,128); for(let i=0;i<26;i++){ const x=64+(Math.random()-.5)*70, y=64+(Math.random()-.5)*70, r=6+Math.random()*16, gr=g.createRadialGradient(x,y,1,x,y,r); gr.addColorStop(0,'rgba(70,48,26,.7)'); gr.addColorStop(1,'rgba(70,48,26,0)'); g.fillStyle=gr; g.fillRect(0,0,128,128); }
    fx.dirtM=new THREE.MeshBasicMaterial({map:tx(c,true,false),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}); }
  if(R.sb){ const leds=[]; for(let i=0;i<5;i++){ const m=new THREE.Mesh(new THREE.BoxGeometry(.04,.012,.004),new THREE.MeshBasicMaterial({color:0x33ff88,toneMapped:false})); const along=Math.abs(R.sb.n.z)>.5;
      m.position.set(R.sb.c.x+(along?(i-2)*.06:0),R.sb.c.y,R.sb.c.z+(along?0:(i-2)*.06)).addScaledVector(R.sb.n,R.sb.sz.z/2+.003); m.lookAt(m.position.clone().add(R.sb.n)); m.visible=false; S.add(m); leds.push(m); } fx.leds=leds; }
  return HL.fx=fx; }
// the TV: a few Naija channels drawn live (news with a ticker, a music video, football)
const TV_CH=[['NTA','Lagos traffic: Third Mainland is moving small small','BREAKING: Jollof Friday confirmed at Ladipo Market'],['AFRO HITS','Now playing: Mushin Vibes (official video)','Request your song: text 3344'],['SUPER SPORT','LIVE: Super Eagles 2 - 1 Black Stars','Goal! What a strike from outside the box']];
function drawTV(dt){ const F=HL.fx, T=F&&F.tv; if(!T) return; const on=HL.tv>0; T.m.visible=on; T.glow.intensity=on?.8+Math.sin(T0*7)*.15:0; if(!on) return;
  if(T0-T.last<.1) return; T.last=T0; const g=T.g, W=320, H=180, ch=TV_CH[T.ch%TV_CH.length], t=T0;
  if(T.ch%3===0){ g.fillStyle='#0d3b66'; g.fillRect(0,0,W,H); g.fillStyle='#e9eef5'; g.fillRect(16,20,110,96); g.fillStyle='#7b5032'; g.beginPath(); g.arc(71,58,22,0,7); g.fill(); g.fillStyle='#1d2a44'; g.fillRect(40,82,62,34);
    g.fillStyle='#fff'; g.font='bold 15px sans-serif'; g.fillText(ch[0]+' NEWS',140,40); g.font='12px sans-serif'; g.fillText('Lagos · Live',140,60); g.fillStyle='#F2B705'; g.fillRect(140,72,160,3); }
  else if(T.ch%3===1){ const hue=(t*40)%360; g.fillStyle=`hsl(${hue},70%,22%)`; g.fillRect(0,0,W,H); for(let i=0;i<5;i++){ g.fillStyle=`hsla(${(hue+i*60)%360},90%,60%,.35)`; g.beginPath(); g.arc(60+i*55,90+Math.sin(t*3+i)*30,26+Math.sin(t*5+i)*8,0,7); g.fill(); }
    for(let i=0;i<3;i++){ const x=90+i*70, b=Math.sin(t*6+i*1.7)*8; g.fillStyle='#111'; g.beginPath(); g.arc(x,58+b,10,0,7); g.fill(); g.fillRect(x-9,70+b,18,40); g.fillRect(x-20+Math.sin(t*6+i)*6,74+b,10,26); g.fillRect(x+10-Math.sin(t*6+i)*6,74+b,10,26); g.fillRect(x-9,110,7,30+b*.3); g.fillRect(x+2,110,7,30-b*.3); } }
  else { g.fillStyle='#2f8a3c'; g.fillRect(0,0,W,H); g.strokeStyle='rgba(255,255,255,.8)'; g.lineWidth=2; g.strokeRect(10,14,300,140); g.beginPath(); g.moveTo(160,14); g.lineTo(160,154); g.stroke(); g.beginPath(); g.arc(160,84,24,0,7); g.stroke();
    for(let i=0;i<10;i++){ const x=40+((i*53+t*(i%2?18:-14))%240+240)%240, y=30+(i*37)%110; g.fillStyle=i<5?'#e8f1ff':'#ffd23a'; g.fillRect(x,y,5,9); } g.fillStyle='#fff'; g.beginPath(); g.arc(160+Math.sin(t*1.3)*90,84+Math.cos(t*1.7)*40,3,0,7); g.fill(); }
  g.fillStyle='rgba(0,0,0,.6)'; g.fillRect(0,H-26,W,26); g.fillStyle='#fff'; g.font='bold 12px sans-serif'; const msg=ch[1]+'   ·   '+ch[2]+'   ·   '; const w=g.measureText(msg).width, off=(t*40)%w; g.fillText(msg,8-off,H-9); g.fillText(msg,8-off+w,H-9);
  g.fillStyle='#F2B705'; g.fillRect(W-62,6,56,16); g.fillStyle='#111'; g.font='bold 10px sans-serif'; g.fillText(ch[0],W-58,18); T.t.needsUpdate=true; }
function steamAt(src,dt,rate){ const F=HL.fx; if(!F) return; for(const p of F.steam){ if(p.src!==src&&p.src) continue; if(!src){ p.s.visible=false; continue; }
    p.src=src; p.t+=dt*rate; if(p.t>1){ p.t-=1; p.ox=(Math.random()-.5)*src.w; p.oz=(Math.random()-.5)*src.w; } const k=p.t; p.s.visible=true;
    p.s.position.set(src.x+(p.ox||0)*(1+k),src.y+k*src.h,src.z+(p.oz||0)*(1+k)); const sc=src.s0+k*src.s1; p.s.scale.set(sc,sc,sc); p.s.material.opacity=Math.sin(k*Math.PI)*src.a; } }
function steamOff(src){ const F=HL.fx; if(!F) return; for(const p of F.steam) if(p.src===src||!src){ p.src=null; p.s.visible=false; } }
function showerWater(on,dt){ const F=HL.fx, W=F&&F.water, R=INT.home; if(!W) return; W.w.visible=on; if(!on) return; const c=R.shower.c, top=R.shower.top-.08, P=W.P;
  for(let i=0;i<W.n;i++){ const a=W.seed[i*3]*6.283, r=Math.sqrt(W.seed[i*3+1])*.22, ph=(W.seed[i*3+2]+T0*1.9)%1, y=top-ph*top, x=c.x+Math.cos(a)*r*(1+ph*.6), z=c.z+Math.sin(a)*r*(1+ph*.6);
    P[i*6]=x; P[i*6+1]=y; P[i*6+2]=z; P[i*6+3]=x; P[i*6+4]=Math.max(.02,y-.09); P[i*6+5]=z; } W.w.geometry.attributes.position.needsUpdate=true; }
function handBone(side='Right'){ let hb=null; hero.cObj.traverse(o=>{ if(!hb&&o.isBone&&new RegExp(side+'Hand$').test(o.name)) hb=o; }); return hb; }
function holdProp(obj,side='Right',pos=[0,.06,.02],rot=[0,0,0]){ const hb=handBone(side); if(!hb||!obj) return; hero.cObj.updateMatrixWorld(true); const s=new THREE.Vector3(); hb.matrixWorld.decompose(_p,_q,s);
  obj.scale.setScalar(1/s.x); obj.position.set(pos[0]/s.x,pos[1]/s.x,pos[2]/s.x); obj.rotation.set(rot[0],rot[1],rot[2]); hb.add(obj); }
function dropProp(obj){ if(obj&&obj.parent) obj.parent.remove(obj); }

// ---- sound: an afrobeat loop for the speaker, the shower, the pot frying, the broom
function homeMusic(on){ if(!AC) initAudio(); if(!AC) return; if(!on){ if(HL.music){ clearInterval(HL.music.iv); HL.music.g.gain.setTargetAtTime(0,AC.currentTime,.2); const g=HL.music.g; setTimeout(()=>g.disconnect(),1500); HL.music=null; } return; }
  if(HL.music) return; const g=AC.createGain(); g.gain.value=0; g.connect(master); g.gain.setTargetAtTime(.5,AC.currentTime,.3); const bpm=108, st=60/bpm/4, M={g,iv:0,next:AC.currentTime+.08,step:0,beat:0};
  const BASS=[0,null,null,0,null,null,7,null,0,null,null,0,null,5,null,null], ROOT=[55,55,65.4,49];
  const hit=(t,dur,f0,f1,type,gain)=>{ const o=AC.createOscillator(), e=AC.createGain(); o.type=type; o.frequency.setValueAtTime(f0,t); if(f1) o.frequency.exponentialRampToValueAtTime(f1,t+dur); e.gain.setValueAtTime(gain,t); e.gain.exponentialRampToValueAtTime(.001,t+dur); o.connect(e); e.connect(g); o.start(t); o.stop(t+dur+.02); };
  const noise=(t,dur,f,gain,type='highpass')=>{ const n=AC.createBufferSource(); n.buffer=HL.nb||(HL.nb=noiseBuf(1)); const fl=AC.createBiquadFilter(); fl.type=type; fl.frequency.value=f; const e=AC.createGain(); e.gain.setValueAtTime(gain,t); e.gain.exponentialRampToValueAtTime(.001,t+dur); n.connect(fl); fl.connect(e); e.connect(g); n.start(t,Math.random()*.5); n.stop(t+dur+.02); };
  const tick=()=>{ while(M.next<AC.currentTime+.12){ const t=M.next, s=M.step%16, bar=Math.floor(M.step/16)%4, root=ROOT[bar];
      if(s===0||s===6||s===8||s===14) hit(t,.32,120,42,'sine',.55);   // kick
      if(s===4||s===12) noise(t,.16,1400,.32,'bandpass');   // clap
      if(s===3||s===11) hit(t,.05,620,null,'square',.05);   // rim
      noise(t,.04,7000,s%2?.05:.09);   // shaker
      if(BASS[s]!==null) hit(t,.22,root*Math.pow(2,BASS[s]/12),null,'triangle',.28);   // log drum bass
      if(s===2||s===10) for(const k of [0,4,7]) hit(t,.12,root*4*Math.pow(2,k/12),null,'triangle',.035);   // chords on the off-beat
      if(s%4===2&&bar%2===1) hit(t,.1,root*8*Math.pow(2,[0,3,5,7][(M.step>>2)%4]/12),null,'square',.018);   // a little lead
      M.beat=s; M.step++; M.next+=st; } };
  tick(); M.iv=setInterval(tick,25); HL.music=M; }
function homeLoop(kind,on){ if(!AC) return; const L=HL.loops||(HL.loops={}); if(on&&!L[kind]){ const n=AC.createBufferSource(); n.buffer=noiseBuf(2); n.loop=true; const f=AC.createBiquadFilter(), g=AC.createGain();
    if(kind==='shower'){ f.type='bandpass'; f.frequency.value=3200; f.Q.value=.6; g.gain.value=.0; g.gain.setTargetAtTime(.1,AC.currentTime,.3); }
    else if(kind==='fry'){ f.type='highpass'; f.frequency.value=2500; g.gain.value=0; g.gain.setTargetAtTime(.035,AC.currentTime,.3); }
    else { f.type='lowpass'; f.frequency.value=700; g.gain.value=0; g.gain.setTargetAtTime(.025,AC.currentTime,.3); }   // TV murmur
    n.connect(f); f.connect(g); g.connect(master); n.start(); L[kind]={n,g}; }
  else if(!on&&L[kind]){ const {n,g}=L[kind]; g.gain.setTargetAtTime(0,AC.currentTime,.15); setTimeout(()=>{ try{ n.stop(); }catch(e){} g.disconnect(); },800); delete L[kind]; } }

// ---- dirt: it builds up while you are out (one spot every 25 minutes, up to 8); sweep it with the broom
function homeDirt(){ const R=INT.home, F=homeFx(); for(const d of HL.dirt) dropProp(d.m); HL.dirt=[]; if(!R||!R.floors.length) return;
  let last=0; try{ last=+localStorage.getItem('naija-swept')||0; }catch(e){} const n=last?Math.min(8,Math.floor((Date.now()-last)/(25*60e3))):6; let tries=0;
  while(HL.dirt.length<n&&tries++<400){ const b=R.floors[Math.floor(Math.random()*R.floors.length)], x=b.min.x+.3+Math.random()*(b.max.x-b.min.x-.6), z=b.min.z+.3+Math.random()*(b.max.z-b.min.z-.6);
    if(!R.free(x,z,.3)||HL.dirt.some(d=>Math.hypot(d.x-x,d.z-z)<1.2)) continue; const s=.45+Math.random()*.35, m=new THREE.Mesh(new THREE.PlaneGeometry(s,s).rotateX(-Math.PI/2),F.dirtM.clone()); m.position.set(x,.012,z); m.rotation.y=Math.random()*6; F.scene.add(m); HL.dirt.push({x,z,m,k:1}); } }

// ---- where you are near, and what E does there
const HOME_LABEL={sit:'Sit down',tv:'Watch TV',dine:()=>HL.food?'Sit and eat your jollof':'Sit down',cook:()=>HL.food?'':'Cook jollof',bath:'Take a bath',bed:'Sleep',music:()=>HL.music?'Stop the music':'Play music',clean:()=>HL.broom?'Put the broom down':'Sweep the house'};
function homeNear(){ const R=INT.home; if(!R||ROOM!==INT||mode!=='interior'||!hero) return null; let best=null, bd=1e9;
  for(const s of R.spots){ const d=Math.hypot(player.x-s.at.x,player.z-s.at.z); if(d<s.r&&d<bd){ const L=HOME_LABEL[s.kind], t=typeof L==='function'?L():L; if(t){ best={s,label:t}; bd=d; } } }
  if(!best&&HL.music&&!HL.broom) best={s:{kind:'dance'},label:'Dance'};   // music on: dance anywhere
  return best; }
function homePrompt(){ const A=HL.act; if(A) return A.prompt?A.prompt():A.kind==='dance'?'Stop dancing':A.kind==='bed'?'Get up':'Stand up'; const n=homeNear(); return n?n.label:''; }
function homeAction(){ if(HL.act){ if(HL.act.stop!==false) homeStop(); return true; } const n=homeNear(); if(!n) return false; homeStart(n.s); return true; }

// ---- starting and stopping
function homeStart(s){ const C=homeClips(), R=INT.home, F=homeFx(); let clip=null, A={kind:s.kind,s,t:0,lock:true,camH:1.0,yaw:s.yaw||0,at:s.at};
  if(s.kind==='music'){ const on=!HL.music; homeMusic(on); toast(on?mpick(['Music don start! Press E anywhere to dance.','Afrobeat dey play. Shake body!']):'Music off'); return; }
  if(s.kind==='clean'){ if(HL.broom){ dropProp(HL.broom); HL.broom=null; toast('Broom don go back'); return; }
    if(!HL.dirt.length){ toast('Your house clean well well already'); return; } HL.broom=F.broom; holdProp(HL.broom,'Right',[0,.05,.02],[0,0,0]); toast(`Sweep the dirty spots: ${HL.dirt.length} to go`,3.5); return; }
  if(s.kind==='cook'&&HL.food) return;
  if(HL.broom){ dropProp(HL.broom); HL.broom=null; }
  heroQuiet(); if(PHONE.open) closePhone();
  if(s.kind==='sit'||s.kind==='tv'||s.kind==='dine'){ const eat=s.kind==='dine'&&HL.food; clip=eat?C.eat:s.kind==='tv'?C.tv:C.sit; const m=homeMeasure(clip,0);
    A.p1=new THREE.Vector3(s.x,s.y+.09-m.hips.y,s.z); A.camH=Math.max(.6,m.head.y+(s.y+.09-m.hips.y)-.12);
    if(s.kind==='tv'){ HL.tv=1; if(HL.fx.tv) HL.fx.tv.ch=Math.floor(Math.random()*3); }
    if(eat){ const tb=R.table, p=new THREE.Vector3(s.x+s.n.x*.42,tb?tb.max.y+.012:.78,s.z+s.n.z*.42); if(tb){ p.x=clamp(p.x,tb.min.x+.15,tb.max.x-.15); p.z=clamp(p.z,tb.min.z+.15,tb.max.z-.15); }
      F.plate.position.copy(p); F.plate.visible=true; holdProp(F.spoon,'Right',[0,.05,.02],[1.2,0,0]); A.eatT=0; A.prompt=()=>A.eatT<10?`Eating… ${Math.round(A.eatT*10)}%`:'Stand up'; } }
  else if(s.kind==='cook'){ clip=C.cook; A.p1=new THREE.Vector3(s.x,0,s.z); A.camH=1.35; holdProp(F.spoon,'Right',[0,.05,.02],[1.4,0,0]); A.cookT=0; homeLoop('fry',true); A.prompt=()=>`Cooking jollof… ${Math.round(A.cookT/14*100)}%`; }
  else if(s.kind==='bath'){ clip=C.bath; A.p1=new THREE.Vector3(s.x,s.y,s.z); A.camH=1.35; A.fade=true; A.bathT=0; A.prompt=()=>A.bathT<12?`Bathing… ${Math.round(A.bathT/12*100)}%`:'Come out'; }
  else if(s.kind==='bed'){ clip=C.sleep; const m=homeMeasure(clip,Math.min(.5,clip.duration*.3)), a=new THREE.Vector3(m.head.x-m.feet.x,0,m.head.z-m.feet.z), mid=m.head.clone().add(m.feet).multiplyScalar(.5);
    const yaw=Math.atan2(s.dir.x,s.dir.z)-Math.atan2(a.x,a.z), cs=Math.cos(yaw), sn=Math.sin(yaw), rx=mid.x*cs+mid.z*sn, rz=-mid.x*sn+mid.z*cs;
    A.yaw=yaw; A.p1=new THREE.Vector3(s.x-rx,s.y-(m.lo-.06),s.z-rz); A.camH=s.y+.35; A.fade=true; A.sleepT=0; A.prompt=()=>A.sleepT<4?'Sleeping… Zzz':'Get up'; }
  else if(s.kind==='dance'){ const list=C.dance; if(!list.length){ toast('No dance moves yet'); return; } clip=list[HL.danceI++%list.length]; A.p1=new THREE.Vector3(player.x,0,player.z); A.yaw=player.yaw; A.camH=1.3; A.at={x:player.x,z:player.z}; A.danceT=0; }
  if(!clip) return;
  A.action=hero.mixer.clipAction(clip); A.action.reset().play(); A.action.setEffectiveWeight(0); A.clip=clip;
  A.p0=new THREE.Vector3(player.x,player.y,player.z); A.y0=player.yaw; HL.act=A;
  const CAMY={tv:.95,cook:.75,bath:Math.PI,bed:Math.PI+.9,dance:Math.PI+.3};   // where the camera looks from: beside you to the TV and the pot, in front for the rest
  const front=()=>{ camState.yaw=A.yaw+(CAMY[s.kind]!==undefined?CAMY[s.kind]:Math.PI+.55); camState.pitch=s.kind==='bed'?.55:s.kind==='cook'?.32:.18; camState.last=T0; };
  if(A.fade){ fadeSwap(()=>{ A.t=1; rig.root.position.copy(A.p1); rig.root.rotation.y=A.yaw; A.action.setEffectiveWeight(1); for(const k of ['idle','walk','walk2','run']) if(hero.act[k]) hero.act[k].setEffectiveWeight(0); front(); if(s.kind==='bath'){ homeLoop('shower',true); } }); }
  else front(); }
function homeStop(){ const A=HL.act; if(!A||A.leaving) return; A.leaving=true; A.lt=0;
  const done=()=>{ const F=HL.fx; A.action.stop(); dropProp(F.spoon); if(A.kind!=='dine'||!HL.food) F.plate.visible=false; homeLoop('fry',false); homeLoop('shower',false); showerWater(false); steamOff(null); if(F.fire) F.fire.visible=false; if(F.fireL) F.fireL.intensity=0;
    if(A.kind==='tv') HL.tvT=8;
    Object.assign(player,{x:A.at.x,z:A.at.z,y:0,speed:0}); player.yaw=A.kind==='dance'?A.yaw:A.kind==='bed'?player.yaw:A.yaw+Math.PI*(A.kind==='bath'?0:0); rig.root.position.set(player.x,0,player.z); rig.root.rotation.y=player.yaw;
    hero.w.idle=1; hero.act.idle.setEffectiveWeight(1); HL.act=null; camState.pitch=.22; };
  if(A.fade) fadeSwap(done); else A.doneSoon=done; }

// ---- every frame while doing something
function updateHomeAct(dt){ const A=HL.act, F=HL.fx; A.t+=dt; const [f,s]=inputVec();
  if(!A.leaving&&A.t>.8&&(Math.abs(f)>.4||Math.abs(s)>.4)&&!(A.kind==='cook'&&A.cookT<14)) homeStop();   // walk off and you stand up (the pot needs you to the end)
  const k=Math.min(1,A.t/.4), e=k*k*(3-2*k); let wa=Math.min(1,A.t/.35); if(A.leaving){ A.lt+=dt; wa=Math.max(0,1-A.lt/.3); }
  if(A.leaving&&!A.fade){ rig.root.position.lerpVectors(A.p1,new THREE.Vector3(A.at.x,0,A.at.z),Math.min(1,A.lt/.3)); } else if(!A.fade||A.t<1){ rig.root.position.lerpVectors(A.p0,A.p1,e); } else rig.root.position.copy(A.p1);
  rig.root.rotation.y=A.fade?A.yaw:lerpA(A.y0,A.yaw,e);
  for(const n of ['idle','walk','walk2','run','text','phone','fight_idle']){ const a=hero.act[n]; if(a) a.setEffectiveWeight(n==='idle'?1-wa:0); } A.action.setEffectiveWeight(wa);
  player.x=rig.root.position.x; player.z=rig.root.position.z; player.y=0; player.speed=0;
  hero.mixer.update(dt); phoneInHand(); heroWeapon();
  // what each thing does over time
  if(A.kind==='dine'&&HL.food&&!A.leaving){ A.eatT+=dt; if(A.eatT>=10){ HL.food=0; F.plate.visible=false; dropProp(F.spoon); FIGHT.hp=Math.min(100,FIGHT.hp+45); toast(mpick(['Belle don full! That jollof sweet die.','Chop finish. Body don strong again!']),3.5);
      const s=A.s, C=homeClips(); A.action.stop(); A.action=hero.mixer.clipAction(C.sit); A.action.reset().play(); A.prompt=null; } }
  if(A.kind==='cook'&&!A.leaving){ A.cookT+=dt; const R=INT.home; if(F.fire){ F.fire.visible=true; F.fire.children.forEach((m,i)=>{ m.scale.y=.7+Math.random()*.7; }); } if(F.fireL) F.fireL.intensity=1.2+Math.random()*.6;
    steamAt({x:R.pot.x,y:R.potTop,z:R.pot.z,w:.12,h:.7,s0:.12,s1:.4,a:.35},dt,.6);
    if(A.cookT>=14){ HL.food=1; toast('Jollof don ready! Go chop am for the dining table.',4); homeStop(); } }
  if(A.kind==='bath'&&A.t>=1&&!A.leaving){ A.bathT+=dt; showerWater(true,dt); const R=INT.home; steamAt({x:R.shower.c.x,y:1.2,z:R.shower.c.z,w:.4,h:1.1,s0:.3,s1:.7,a:.22},dt,.35);
    if(A.bathT>=12&&!A.told){ A.told=1; toast(mpick(['You don baff! You dey fresh like new money.','Clean body, clean mind. You dey shine!']),3.5); } }
  if(A.kind==='bed'&&A.t>=1&&!A.leaving){ A.sleepT+=dt; if(A.sleepT>=4&&!A.told){ A.told=1; FIGHT.hp=100; toast('You sleep well. Body don rest!',3.5); } }
  if(A.kind==='dance'&&!A.leaving){ A.danceT+=dt; if(!HL.music){ homeStop(); } else if(A.danceT>9){ const C=homeClips(), next=C.dance[HL.danceI++%C.dance.length]; if(next&&next!==A.clip){ const na=hero.mixer.clipAction(next); na.reset().play(); A.action.crossFadeTo(na,.5,false); A.action=na; A.clip=next; } A.danceT=0; } }
  if(A.leaving&&!A.fade&&A.lt>=.3&&A.doneSoon){ const d=A.doneSoon; A.doneSoon=null; d(); } }
// every frame inside: the TV, the speaker lights, sweeping the dirt
function homeTick(dt){ if(ROOM!==INT||!INT.home) return; const F=homeFx();
  if(HL.tvT>0){ HL.tvT-=dt; if(HL.tvT<=0&&!(HL.act&&HL.act.kind==='tv')) HL.tv=0; } if(HL.act&&HL.act.kind==='tv') HL.tv=1;
  if(F.tv&&HL.tv&&(T0%20)<dt) F.tv.ch++; drawTV(dt); homeLoop('tv',HL.tv>0&&!HL.music);
  if(F.leds){ const b=HL.music?HL.music.beat:0; F.leds.forEach((m,i)=>{ m.visible=!!HL.music&&(i<=((b*7)%5)); }); }
  if(HL.broom&&!HL.act){ for(const d of HL.dirt){ const dd=Math.hypot(player.x-d.x,player.z-d.z); if(dd<.6){ d.k-=dt*.9; d.m.material.opacity=Math.max(0,d.k); if(!d.sw){ d.sw=1; burst(.25,1800,.12,2); } else if(Math.random()<dt*3) burst(.2,1800,.08,2); } }
    const left=HL.dirt.filter(d=>d.k>0); if(left.length<HL.dirt.length){ for(const d of HL.dirt) if(d.k<=0) dropProp(d.m); HL.dirt=left;
      if(!left.length){ try{ localStorage.setItem('naija-swept',String(Date.now())); }catch(e){} addCash(500); toast('Your house dey shine! Landlord don dash you ₦500.',4); dropProp(HL.broom); HL.broom=null; } else toast(`${left.length} dirty spot${left.length>1?'s':''} remain`,1.6); } }
  // sweeping: the broom swings while you walk over dirt
  if(HL.broom&&!HL.act&&HL.dirt.some(d=>Math.hypot(player.x-d.x,player.z-d.z)<.6)){ const C=homeClips(); if(!HL.sweepA){ HL.sweepA=hero.mixer.clipAction(C.sweep); HL.sweepA.reset().play(); } HL.sweepW=Math.min(1,(HL.sweepW||0)+dt*4); }
  else HL.sweepW=Math.max(0,(HL.sweepW||0)-dt*4);
  if(HL.sweepA){ HL.sweepA.setEffectiveWeight(HL.sweepW); if(HL.sweepW<=0&&!HL.broom){ HL.sweepA.stop(); HL.sweepA=null; } } }
// leaving the house: everything off
function homeLeave(){ if(HL.act){ const A=HL.act; A.action.stop(); HL.act=null; hero.act.idle.setEffectiveWeight(1); } homeMusic(false); homeLoop('tv',false); homeLoop('fry',false); homeLoop('shower',false); HL.tv=0; HL.tvT=0;
  if(HL.broom){ dropProp(HL.broom); HL.broom=null; } if(HL.sweepA){ HL.sweepA.stop(); HL.sweepA=null; } const F=HL.fx; if(F){ dropProp(F.spoon); F.plate.visible=false; showerWater(false); steamOff(null); if(F.fire) F.fire.visible=false; } }

const WARD={open:false,cur:'me',busy:false,base:null,body:null,px:0};
addEventListener('resize',()=>{ if(WARD.open) WARD.px=$('#ward').getBoundingClientRect().right; });
/* ================= clothes only: you keep your own head; the wardrobe changes what you wear, and its colours =================
   Every look is a Mixamo body on the same skeleton. Your head (the man you start as, or the girl) is cut from your own body by
   its skin weights and fixed to the outfit's head bone; the outfit's own head is cut away. Shirts and trousers are recoloured
   in the shader: each vertex knows if it belongs to the upper body (shirt) or the hips and legs (trousers), and skin is left alone. */
const HEADB=/(Neck|Head|HeadTop_End|LeftEye|RightEye)$/, bname=n=>n.replace(/^.*mixamorig\d*:?/,'');
const skinW=(mesh,test)=>{ const sk=mesh.skeleton, g=mesh.geometry, si=g.attributes.skinIndex, sw=g.attributes.skinWeight, n=si.count, out=new Float32Array(n), hit=sk.bones.map(b=>test(b.name));
  const gi=[a=>si.getX(a),a=>si.getY(a),a=>si.getZ(a),a=>si.getW(a)], gw=[a=>sw.getX(a),a=>sw.getY(a),a=>sw.getZ(a),a=>sw.getW(a)];
  for(let i=0;i<n;i++){ let w=0; for(let k=0;k<4;k++){ const wi=gw[k](i); if(wi>0&&hit[gi[k](i)]) w+=wi; } out[i]=w; } return out; };
// which part of the clothes each vertex is: 0 skin/hands/feet/head, 1 shirt (body and arms), 2 trousers (hips and legs)
function partAttr(mesh){ const up=skinW(mesh,n=>/(Spine\d?|Shoulder|Arm)$/.test(n)), lo=skinW(mesh,n=>/(Hips|Leg)$/.test(n)), n=up.length, a=new Float32Array(n);
  for(let i=0;i<n;i++){ const o=1-up[i]-lo[i]; a[i]=up[i]>=lo[i]&&up[i]>o?1:lo[i]>o?2:0; } return new THREE.BufferAttribute(a,1); }
const skinnedOf=o=>{ let m=null; o.traverse(x=>{ if(!m&&x.isSkinnedMesh) m=x; }); return m; };
// a cast's body without its head and neck (shared by everyone who wears it)
// a texture's colours on the CPU (the GPU draws it once into a small target), for telling hair from cloth
function texPixels(map,W=256){ if(map.pix) return map.pix; const rt=new THREE.WebGLRenderTarget(W,W), sc=new THREE.Scene(), cam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms:{map:{value:map}},vertexShader:'varying vec2 u; void main(){ u=uv; gl_Position=vec4(position.xy,0.,1.); }',fragmentShader:'uniform sampler2D map; varying vec2 u; void main(){ gl_FragColor=vec4(texture2D(map,u).rgb,1.); }'})));
  const was=renderer.getRenderTarget(), data=new Uint8Array(W*W*4); renderer.setRenderTarget(rt); renderer.render(sc,cam); renderer.readRenderTargetPixels(rt,0,0,W,W,data); renderer.setRenderTarget(was);
  rt.dispose(); sc.children[0].geometry.dispose(); sc.children[0].material.dispose(); return map.pix={W,data}; }
// hair: dark, greyish texels (braids), only above a given bone's height
function hairVerts(m,below){ const map=m.material.map, g=m.geometry; if(!map||!g.attributes.uv) return null; let px; try{ px=texPixels(map); }catch(e){ return null; }
  map.updateMatrix(); const UV=g.attributes.uv, P=g.attributes.position, n=UV.count, out=new Uint8Array(n), u=new THREE.Vector2(), v=new THREE.Vector3(), {W,data}=px;
  const bb=m.skeleton.bones.findIndex(b=>new RegExp(below+'$').test(b.name)), y0=bb<0?-1e9:new THREE.Vector3().setFromMatrixPosition(_m.copy(m.skeleton.boneInverses[bb]).invert()).y;
  for(let i=0;i<n;i++){ v.fromBufferAttribute(P,i).applyMatrix4(m.bindMatrix); if(v.y<y0) continue;
    u.fromBufferAttribute(UV,i).applyMatrix3(map.matrix); const x=Math.floor((u.x-Math.floor(u.x))*W), y=Math.floor((u.y-Math.floor(u.y))*W), k=(y*W+x)*4;
    const r=Math.pow(data[k]/255,1/2.2), gg=Math.pow(data[k+1]/255,1/2.2), b=Math.pow(data[k+2]/255,1/2.2), mx=Math.max(r,gg,b), mn=Math.min(r,gg,b);
    if(mx<.42&&mx-mn<.13) out[i]=1; } return out; }
function headless(C,L){ if(C.headless) return C.headless; const m=skinnedOf(C.tpl), g=m.geometry, hw=skinW(m,n=>HEADB.test(n)), I=g.index, P=g.attributes.position, n=P.count, keep=[];
  const hair=L&&L.hair?hairVerts(m,L.hair):null;
  // loose pieces hanging from the head (braids, long hair, earrings) go too: join vertices that touch, then drop small pieces tied to the head
  const up=new Int32Array(n).map((_,i)=>i), find=i=>{ while(up[i]!==i){ up[i]=up[up[i]]; i=up[i]; } return i; }, join=(a,b)=>{ a=find(a); b=find(b); if(a!==b) up[a]=b; };
  const at=new Map(); for(let i=0;i<n;i++){ const k=Math.round(P.getX(i)*1e4)+','+Math.round(P.getY(i)*1e4)+','+Math.round(P.getZ(i)*1e4), j=at.get(k); if(j===undefined) at.set(k,i); else join(i,j); }
  const cut=[]; for(let t=0;t<I.count;t+=3){ const a=I.getX(t), b=I.getX(t+1), c=I.getX(t+2); if((hw[a]+hw[b]+hw[c])/3<.5&&!(hair&&hair[a]+hair[b]+hair[c]>=2)){ cut.push(a,b,c); join(a,b); join(a,c); } }   // pieces as they are once head and hair are off
  const size=new Map(), head=new Map(); for(let i=0;i<n;i++){ const r=find(i); size.set(r,(size.get(r)||0)+1); if(hw[i]>(head.get(r)||0)) head.set(r,hw[i]); }
  let big=0; for(const k of size.values()) big=Math.max(big,k);
  const drop=r=>size.get(r)<big*.25&&((head.get(r)||0)>=.25||(hair&&size.get(r)<n*.03));   // bits of braid left hanging go too
  for(let t=0;t<cut.length;t+=3) if(!drop(find(cut[t]))) keep.push(cut[t],cut[t+1],cut[t+2]);
  const h=new THREE.BufferGeometry(); for(const k in g.attributes) h.setAttribute(k,g.attributes[k]); h.setIndex(keep); h.setAttribute('part',partAttr(m));
  h.boundingSphere=g.boundingSphere; h.boundingBox=g.boundingBox; return C.headless=h; }
// your head and neck, cut once from your own body: each vertex in the head bone's rest frame, with its bone names and weights,
// so it can be skinned onto any outfit's skeleton and bend with that body's neck
let MY_HEAD=null;
function myHead(){ if(MY_HEAD&&MY_HEAD.f===isF()) return MY_HEAD; const G=PEOPLE.casts.girl, src=isF()?(G&&G.tpl):(WARD.base?WARD.base.body:hero.cObj), xs=isF()?(G?G.sc:1):1; if(!src) return null;
  src.updateMatrixWorld(true); const m=skinnedOf(src); if(!m) return null; const sk=m.skeleton, hi=sk.bones.findIndex(b=>/Head$/.test(b.name)); if(hi<0) return null;
  const g=m.geometry, hw=skinW(m,n=>HEADB.test(n)), hh=skinW(m,n=>/(Head|HeadTop_End|LeftEye|RightEye)$/.test(n)), I=g.index, P=g.attributes.position, UV=g.attributes.uv, SI=g.attributes.skinIndex, SW=g.attributes.skinWeight;
  const toLocal=new THREE.Matrix4().multiplyMatrices(sk.boneInverses[hi],m.bindMatrix), map=new Map(), pos=[], uv=[], nk=[], bones=[], wts=[], idx=[], v=new THREE.Vector3();
  const vert=i=>{ let j=map.get(i); if(j!==undefined) return j; v.fromBufferAttribute(P,i).applyMatrix4(toLocal); j=pos.length/3; pos.push(v.x,v.y,v.z); if(UV) uv.push(UV.getX(i),UV.getY(i)); nk.push(1-hh[i]);
    bones.push(bname(sk.bones[SI.getX(i)].name),bname(sk.bones[SI.getY(i)].name),bname(sk.bones[SI.getZ(i)].name),bname(sk.bones[SI.getW(i)].name)); wts.push(SW.getX(i),SW.getY(i),SW.getZ(i),SW.getW(i)); map.set(i,j); return j; };
  for(let t=0;t<I.count;t+=3){ const a=I.getX(t), b=I.getX(t+1), c=I.getX(t+2); if((hw[a]+hw[b]+hw[c])/3>=.3) idx.push(vert(a),vert(b),vert(c)); }
  const s=new THREE.Vector3(); sk.bones[hi].matrixWorld.decompose(_p,_q,s);
  const mat=(m.material.dressOrig||m.material).clone(); HERO_MATS.push(mat);   // on the neck, only skin comes along: your old collar stays behind
  mat.onBeforeCompile=sh=>{ sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float nk;\nvarying float vNk;').replace('#include <begin_vertex>','#include <begin_vertex>\nvNk=nk;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying float vNk;\n'+SKIN_GLSL).replace('#include <map_fragment>','#include <map_fragment>\nif(vNk>.45&&skinLike(diffuseColor.rgb)<.5) discard;'); };
  mat.customProgramCacheKey=()=>'myhead';
  return MY_HEAD={pos,uv,nk,bones,wts,idx,mat,s:s.x*xs,f:isF()}; }
// put your head on an outfit: a skinned mesh on the outfit's own bones, sized like yours
function putHead(inner){ const H=myHead(), om=skinnedOf(inner); if(!H||!om) return null; const sk=om.skeleton, hi=sk.bones.findIndex(b=>/Head$/.test(b.name)); if(hi<0) return null;
  inner.updateMatrixWorld(true); const s=new THREE.Vector3(); sk.bones[hi].matrixWorld.decompose(_p,_q,s); const k=H.s/s.x;
  const back=new THREE.Matrix4().multiplyMatrices(sk.boneInverses[hi],om.bindMatrix).invert(), byName=new Map(sk.bones.map((b,i)=>[bname(b.name),i])), n=H.pos.length/3;
  const pos=new Float32Array(n*3), si=new Uint16Array(n*4), sw=new Float32Array(n*4), v=new THREE.Vector3();
  for(let i=0;i<n;i++){ v.set(H.pos[i*3]*k,H.pos[i*3+1]*k,H.pos[i*3+2]*k).applyMatrix4(back); pos[i*3]=v.x; pos[i*3+1]=v.y; pos[i*3+2]=v.z;
    let left=0; for(let q=0;q<4;q++){ const bi=byName.get(H.bones[i*4+q]), w=H.wts[i*4+q]; if(bi===undefined){ left+=w; continue; } si[i*4+q]=bi; sw[i*4+q]=w; }
    if(left>0){ si[i*4+3]=hi; sw[i*4+3]+=left; } }   // a bone the outfit lacks: that share follows the head
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(pos,3)); if(H.uv.length) geo.setAttribute('uv',new THREE.Float32BufferAttribute(H.uv,2));
  geo.setAttribute('nk',new THREE.Float32BufferAttribute(H.nk,1)); geo.setAttribute('skinIndex',new THREE.BufferAttribute(si,4)); geo.setAttribute('skinWeight',new THREE.BufferAttribute(sw,4)); geo.setIndex(H.idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
  const m=new THREE.SkinnedMesh(geo,H.mat); m.name='myHead'; m.position.copy(om.position); m.quaternion.copy(om.quaternion); m.scale.copy(om.scale);
  m.castShadow=true; m.receiveShadow=true; m.frustumCulled=false; m.layers.mask=om.layers.mask; om.parent.add(m); m.bind(sk,om.bindMatrix); return m; }
const SKIN_GLSL=`float skinLike(vec3 c){ vec3 s=pow(max(c,vec3(0.)),vec3(1./2.2)); float mx=max(s.r,max(s.g,s.b)), mn=min(s.r,min(s.g,s.b)), sat=mx>0.?(mx-mn)/mx:0.;
  return (s.r>=s.g&&s.g>=s.b&&s.r-s.b>.07&&sat>.18&&sat<.78&&mx>.1&&mx<.92)?1.:0.; }`;
// recolouring: a copy of the body's material that tints shirt and trousers (texture detail kept, skin untouched)
function dressMat(base){ const m=base.clone(), u={sCol:{value:new THREE.Color(1,1,1)},pCol:{value:new THREE.Color(1,1,1)},sOn:{value:0},pOn:{value:0}}; m.dress=u; m.dressOrig=base;
  m.onBeforeCompile=sh=>{ Object.assign(sh.uniforms,u);
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float part;\nvarying float vPart;').replace('#include <begin_vertex>','#include <begin_vertex>\nvPart=part;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
varying float vPart; uniform vec3 sCol; uniform vec3 pCol; uniform float sOn; uniform float pOn;
${SKIN_GLSL}
vec3 dye(vec3 c,vec3 a,vec3 t){ vec3 Y=vec3(.2126,.7152,.0722); return t*clamp(dot(c,Y)/max(dot(a,Y),.03),.4,1.6); }`)
      .replace('#include <map_fragment>',`#include <map_fragment>
if(vPart>.5&&skinLike(diffuseColor.rgb)<.5&&(vPart<1.5?sOn:pOn)>.5){
#ifdef USE_MAP
  vec3 avg=texture2D(map,vMapUv,5.).rgb;
#else
  vec3 avg=diffuseColor.rgb;
#endif
  diffuseColor.rgb=dye(diffuseColor.rgb,avg,vPart<1.5?sCol:pCol); }`)
      .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance=emissive*diffuseColor.rgb;'); };
  m.customProgramCacheKey=()=>'dress'; return m; }
const SHIRTS=[['orig','As it comes',null],['white','White','#f2f0ea'],['black','Black','#1d1d20'],['red','Red','#b3201e'],['blue','Royal blue','#2347a8'],['yellow','Yellow','#e9b81c'],['green','Green','#2f7a3f'],['purple','Purple','#6a3591'],['orange','Orange','#d9692a'],['pink','Pink','#e58cb0']];
const TROUSERS=[['orig','As it comes',null],['black','Black','#1b1b1e'],['jeans','Blue jeans','#3b5a86'],['khaki','Khaki','#a99068'],['white','White','#ecebe6'],['grey','Grey','#6e7075'],['brown','Brown','#5b3b24'],['navy','Navy','#1f2a4a']];
WARD.colors={s:'orig',p:'orig'}; try{ const c=JSON.parse(localStorage.getItem('naija-colours')||'null'); if(c&&c.s&&c.p) WARD.colors=c; }catch(e){}
// the body you have on right now gets its colours
const isRobe=()=>{ const L=LOOK_LIST.find(l=>l.id===WARD.cur); return !!(L&&L.robe); };
// (our people keep their outfits' colours; Mixamo people can be recoloured)
function applyColours(){ if(!hero||(hero.look&&hero.look.v2&&!hero.look.mx)) return; const S=SHIRTS.find(x=>x[0]===WARD.colors.s)||SHIRTS[0], T=isRobe()?S:(TROUSERS.find(x=>x[0]===WARD.colors.p)||TROUSERS[0]);
  hero.cObj.traverse(o=>{ if(!o.isSkinnedMesh||o.name==='myHead') return; let m=o.material; if(!m.dress){ const b=m; m=b.dressed||(b.dressed=dressMat(b)); o.material=m; if(!HERO_MATS.includes(m)) HERO_MATS.push(m); if(!o.geometry.attributes.part) o.geometry.setAttribute('part',partAttr(o)); }
    const u=m.dress; u.sOn.value=S[2]?1:0; u.pOn.value=T[2]?1:0; if(S[2]) u.sCol.value.set(S[2]).convertSRGBToLinear(); if(T[2]) u.pCol.value.set(T[2]).convertSRGBToLinear(); }); }
const lookFile=L=>!!(L.file&&(MANIFEST[`assets/people/${L.id}.glb`]||AV[`assets/people/${L.id}.glb`]));
// men see the men's looks, women the women's (the moves always follow who you are)
const lookShown=L=>L.f===(isF()?1:0)&&(L.id==='me'||(L.file?lookFile(L):!!CAST[L.id]));
const baseLook=()=>isF()?'girl':'me';
const lookOk=L=>L.id==='me'||!!PEOPLE.casts[L.id]||(lookFile(L)&&PEOPLE.done);
const nearWard=()=>!!hero&&mode==='interior'&&ROOM===INT&&Math.hypot(player.x-INT.ward.x,player.z-INT.ward.z)<1.4;
/* ================= the new people: Tunde, Amaka and Ada =================
   Made in Blender from MakeHuman bodies (tools/character). One file each (assets/people/p_*.glb): body, hair and four outfits on a
   Mixamo skeleton whose bones are turned like Mixamo's, so the game's moves (fighting, phone, getting up…) play on it as they are.
   Their own idle, walk, swagger, run and jump come from moves2.glb, fitted bone by bone (src/char2.js). */
const V2={list:[{id:'p_dayo',name:'Dayo',f:0,mx:1},{id:'p_tobi',name:'Tobi',f:0,mx:1},{id:'p_emeka',name:'Emeka',f:0,mx:1},{id:'p_femi',name:'Femi',f:0,mx:1},{id:'p_mike',name:'Mike',f:0,mx:1},{id:'p_chris',name:'Chris',f:0,mx:1},
    {id:'p_amaka',name:'Amaka',f:1},{id:'p_ada',name:'Ada',f:1},{id:'p_lin',name:'Lin',f:1,mx:1,shape:1},
    {id:'p_tunde',name:'Tunde',f:0,npc:1}],   // mx: Mixamo people (their own clothes; colours change); npc: only walks the streets
  moves:null,job:{},casts:{},fit:{},shape:{},
  sw:{p_tunde:[['#0e8a44','#16161a'],['#1b2b55','#1b2b55'],['#eae1ce','#a8741c'],['#eeeeea','#8a7a52']],
      p_amaka:[['#f5f1ea','#4a6492'],['#c0102c','#c0102c'],['#1b2766','#ea871c'],['#126c4f','#d54e38']],
      p_ada:[['#e8457a','#4a6492'],['#0f7a5a','#0f7a5a'],['#561869','#e9b004'],['#cec9c2','#861a29']]}};
try{ const s=JSON.parse(localStorage.getItem('naija-fit')||'null'); if(s&&typeof s==='object') V2.fit=s; }catch(e){}
try{ const s=JSON.parse(localStorage.getItem('naija-shape')||'null'); if(s&&typeof s==='object') V2.shape=s; }catch(e){}
// a woman's body shape (Mixamo women): slim as she comes, curvy or thick
const SHAPES=[['slim','Slim',0],['curvy','Curvy',.55],['thick','Thick',1]];
const shapeAmt=id=>(SHAPES.find(x=>x[0]===(V2.shape[id]||'curvy'))||SHAPES[1])[2];
function setShape(id,k){ V2.shape[id]=k; try{ localStorage.setItem('naija-shape',JSON.stringify(V2.shape)); }catch(e){} const C=V2.casts[id]; if(C&&C.shape) C2.shapeBody(C.tpl,C.info,shapeAmt(id)); }
const pickable=f=>V2.list.filter(p=>p.f===f&&!p.npc);
const isV2=id=>typeof id==='string'&&id.startsWith('p_');
const v2Of=id=>V2.list.find(p=>p.id===id);
// who you are: the person on your profile (or the first of your kind)
const myPerson=()=>{ const f=isF()?1:0, c=PROFILE&&PROFILE.c, p=pickable(f).find(p=>p.id===c); return p?p.id:pickable(f)[0].id; };
const savedLook=()=>{ let id=null; try{ id=localStorage.getItem('naija-look2'); }catch(e){} const f=isF()?1:0;
  if(isV2(id)){ const p=v2Of(id); return p&&p.f===f&&!p.npc?id:myPerson(); } const L=LOOK_LIST.find(l=>l.id===id); return L&&L.f===f?id:myPerson(); };
function v2Moves(){ return V2.moves||(V2.moves=fetchBuf(purl('moves2')).then(b=>GLL.parseAsync(b,'')).then(g=>(V2.movesDone={g,S:C2.skeletonInfo(g.scene)}))); }
// one person, ready to wear: every move fitted, and how far each one lifts or sinks the feet
function loadV2(id){ if(V2.casts[id]) return Promise.resolve(V2.casts[id]); const P=v2Of(id); if(!P) return Promise.resolve(null);
  return V2.job[id]||(V2.job[id]=(async()=>{
    const [g,M]=await Promise.all([fetchBuf(purl(id)).then(b=>GLL.parseAsync(b,'')),v2Moves()]);
    while(!PEOPLE.clipsIn){ if(PEOPLE.done) throw new Error('no moves'); await new Promise(r=>setTimeout(r,200)); }   // the game's moves (moves.glb) first
    const ch=C2.prepChar(g,{maxAniso:Math.min(4,maxAniso),layer:1,shadows:Q.shadows}), tpl=ch.root, D=ch.info, hips=D.nodes.get('Hips'); if(!hips) throw new Error('no hips in '+id);
    for(const m of ch.mats) HERO_MATS.push(m);
    if(P.shape) C2.shapeBody(tpl,D,shapeAmt(id));   // her body shape
    const names=new Set(); tpl.traverse(o=>{ if(o.isBone) names.add(o.name); }); const hp=hips.position.clone(), clips={}, off={};
    const add=(n,k)=>{ if(!k||k.tracks.length<10) return; k.name=n; clips[n]=k; off[n]=C2.footOffset(tpl,D,k); };
    for(const n in PEOPLE.clips){ if(!P.f&&/^f_/.test(n)&&n!=='f_lie') continue; add(n,fitClip(PEOPLE.clips[n],names,hp)); }   // (men keep the lying pose and the dances, for the house)
    const nclips={...clips}, noff={...off};   // as a person on the street: the city's own walks
    if(P.f) for(const [a,b] of [['walk','f_walk'],['run','f_run'],['start_walk','f_start_walk'],['lie','f_lie'],['fight_idle','f_fight_idle']]) if(nclips[b]){ nclips[a]=nclips[b]; noff[a]=noff[b]; }
    const mv=n=>{ const c=M.g.animations.find(a=>a.name===n); return c?C2.retargetClip(c,M.S,D,{norm:true}):null; };
    add('idle',mv('v2_idle')); add('walk',mv(P.f?'v2_fwalk':'v2_walk')); add('run',mv('v2_run')); add('jump',mv(P.f?'v2_fjump':'v2_jump')); if(!P.f) add('walk2',mv('v2_swagger'));
    if(P.f) for(const [a,b] of [['start_walk','f_start_walk'],['lie','f_lie'],['fight_idle','f_fight_idle']]) if(clips[b]){ clips[a]=clips[b]; off[a]=off[b]; }   // women stand, fall and fight like women
    if(!clips.idle||!clips.walk) throw new Error('moves missing for '+id);
    tpl.updateMatrixWorld(true); for(const m of ch.mats) if(m.map) renderer.initTexture(m.map);
    return V2.casts[id]={tpl,clips,off,y0:0,sc:1,f:P.f,idle0:'idle',v2:true,mx:!!P.mx,shape:!!P.shape,info:D,meta:ch.meta,wv:P.f?.93:1.77,rv:P.f?4.2:4.7,w2v:.92,npc:{clips:nclips,off:noff}};
  })().catch(e=>{ console.warn('person '+id+' could not load',e); delete V2.job[id]; return null; })); }
const fitOf=id=>{ const i=+V2.fit[id]; return i>=0&&i<4?i:0; };
// Tunde, Amaka and Ada walk the streets too, each in one of their outfits
function npcV2(id){ const C=V2.casts[id], c=CAST[id]; if(!C||!c||PEOPLE.casts[id]) return; const cl=C.npc.clips;
  PEOPLE.casts[id]={tpl:C.tpl,clips:cl,off:C.npc.off,y0:0,sc:1,f:!!c.f,v2:true,idle0:['f_idle','idle_suit','idle_1','idle_baba','idle_2','idle_3','idle_4'].find(n=>cl[n]&&c.idle.includes(n))||'idle_1'}; PEOPLE.n++; }
function wearFit(i){ const id=WARD.cur; if(!isV2(id)||!hero) return; C2.setOutfit(hero.cObj,i); V2.fit[id]=i; try{ localStorage.setItem('naija-fit',JSON.stringify(V2.fit)); }catch(e){} }
// put on a look: the body is swapped inside the same character, so walking, driving and fighting carry on as before
async function wearLook(id,save=true){ if(!hero||WARD.busy) return false; const v2=isV2(id), L=v2?v2Of(id):LOOK_LIST.find(l=>l.id===id); if(!L) return false; if(id===WARD.cur) return true;
  let C=null;
  if(v2){ C=V2.casts[id]; if(!C){ WARD.busy=true; try{ C=await loadV2(id); }catch(e){} WARD.busy=false; } if(!C||!hero) return false; }
  else if(id!=='me'){ C=PEOPLE.casts[id];
    if(!C&&lookFile(L)&&PEOPLE.done){ WARD.busy=true; try{ setupCast(id,await GLL.parseAsync(await fetchBuf(purl(id)),''),L); }catch(e){ console.warn('look '+id+' could not load',e); } WARD.busy=false; C=PEOPLE.casts[id]; }
    if(!C||!C.clips.walk||!C.clips[C.idle0]) return false; }
  if(mode==='drive'||mode==='enter'||hero.ov) return false;
  if(C&&!v2&&id!==baseLook()) myHead();   // your own head, cut before your body comes off (the new people have their own)
  if(!WARD.base) WARD.base={body:hero.cObj,mixer:hero.mixer,act:hero.act,hips:hero.hips,hipsRest:hero.hipsRest,rest:hero.rest};
  heroQuiet(); hero.act.car.stop();
  if(WARD.body){ hero.root.remove(WARD.body); hero.mixer.stopAllAction(); hero.mixer.uncacheRoot(hero.cObj); hero.cObj.traverse(o=>{ if(o.isSkinnedMesh) o.skeleton.dispose(); }); WARD.body=null; }
  else hero.root.remove(WARD.base.body);
  if(!C){ const B=WARD.base; hero.root.add(B.body); Object.assign(hero,{cObj:B.body,mixer:B.mixer,act:B.act,hips:B.hips,hipsRest:B.hipsRest,rest:B.rest,look:null}); }
  else { const inner=SkeletonUtils.clone(C.tpl), wrap=new THREE.Group(); wrap.scale.setScalar(C.sc); inner.position.y=C.y0; wrap.add(inner); hero.root.add(wrap); WARD.body=wrap;
    let hips=null; const names=new Set(); inner.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; o.frustumCulled=false; } if(o.isBone){ names.add(o.name); if(!hips&&/Hips$/.test(o.name)) hips=o; } });
    if(v2) C2.setOutfit(inner,fitOf(id));   // the outfit you chose last time
    else if(id!==baseLook()){ const sm=skinnedOf(inner); if(sm) sm.geometry=headless(C,L); hero.root.updateMatrixWorld(true); putHead(inner); }   // their clothes, your face
    const mixer=new THREE.AnimationMixer(inner), cl=C.clips, act={idle:mixer.clipAction(cl[C.idle0]),walk:mixer.clipAction(cl.walk),run:mixer.clipAction(cl.run||cl.walk.clone())}; if(cl.walk2) act.walk2=mixer.clipAction(cl.walk2);
    act.car=mixer.clipAction(HERO_CAR?fitClip(HERO_CAR,names,hips.position):cl[C.idle0].clone()); act.car.setLoop(THREE.LoopOnce,1); act.car.clampWhenFinished=true;
    Object.assign(hero,{cObj:inner,mixer,act,hips,hipsRest:hips.position.clone(),rest:snapRest(inner),look:{clips:cl,off:C.off,idle:C.idle0,y0:C.y0,v2:v2?id:null,mx:!!C.mx,wv:C.wv,rv:C.rv,w2v:C.w2v}}); }
  const a=hero.act; for(const k of ['idle','walk','walk2','run']) if(a[k]){ a[k].play(); a[k].setEffectiveWeight(k==='idle'?1:0); } Object.assign(hero.w,{idle:1,walk:0,run:0,text:0,phone:0,fight:0}); hero.k2=0;
  WALK_V=C&&C.v2&&C.f?1.45:1.7;   // her walk is a sway, a little slower
  if(C||!a.punch) heroMoves(); hero.mixer.update(0);
  WARD.cur=id; if(save) try{ localStorage.setItem('naija-look2',id); }catch(e){}
  applyColours(); lastMode=null; return true; }
// the look you chose last time comes back once the people files are in
function applySavedLook(){ if(!PROFILE) return; let id=savedLook();
  if(id===WARD.cur){ applyColours(); bodyReady(); return; } if(id==='me'){ applyColours(); }
  if(WARD.want===id) return; WARD.want=id; let n=0;
  const go=()=>{ if(WARD.want!==id) return; if(id===WARD.cur){ WARD.want=null; bodyReady(); return; } if(n++>150){ WARD.want=null; bodyReady(); return; }
    const v2=isV2(id), L2=v2?null:LOOK_LIST.find(l=>l.id===id);
    if(!hero||busy||WARD.busy||mode==='drive'||mode==='enter'||hero.ov||!(v2?true:(id==='me'||PEOPLE.casts[id]||(L2&&L2.file&&PEOPLE.done)))){ setTimeout(go,400); return; }
    wearLook(id,false).then(ok=>{ if(ok){ WARD.want=null; bodyReady(); return; }
      if(v2&&V2.casts[id]){ setTimeout(go,400); return; }   // ready, just not this moment
      if((v2||(L2&&L2.file))&&id!==baseLook()){ id=baseLook(); WARD.want=id; } setTimeout(go,400); }); };
  go(); }
// a woman never shows up as the man you start with: her body has to be on first
const bodyReady=()=>{ if(rig&&rig.root) rig.root.visible=true; const eb=$('#enterBtn'); if(eb&&eb.dataset.wait){ delete eb.dataset.wait; eb.disabled=false; eb.textContent=eb.dataset.label||'ENTER LAGOS'; } };
function wardUI(){ const box=$('#looks'); box.textContent=''; const f=isF()?1:0, h=t=>{ const e=document.createElement('h3'); e.textContent=t; box.appendChild(e); };
  const cur=WARD.cur, mine=isV2(cur);
  h('Who you are');
  for(const P of pickable(f)){ const b=document.createElement('button'); b.type='button'; b.className='lookb who';
    const im=document.createElement('img'); im.src=`assets/people/face_${P.id.slice(2)}.jpg`; im.alt=''; const sp=document.createElement('span'); sp.textContent=P.name; b.append(im,sp);
    b.setAttribute('aria-pressed',P.id===cur?'true':'false');
    b.addEventListener('click',async()=>{ if(WARD.busy||P.id===WARD.cur) return; if(!V2.casts[P.id]) toast(`Getting ${P.name} ready…`,5);
      const done=await wearLook(P.id); if(done&&PROFILE){ PROFILE.c=P.id; try{ localStorage.setItem('naija-profile',JSON.stringify(PROFILE)); }catch(e){} }
      toast(done?`You are ${P.name}.`:'Not ready yet. Try again soon.'); wardUI(); });
    box.appendChild(b); }
  const P0=v2Of(cur), mx=!!(P0&&P0.mx);
  if(mine&&P0.shape){ h('Body shape'); const r=document.createElement('div'); r.className='swatches';
    for(const [k,name] of SHAPES){ const b=document.createElement('button'); b.type='button'; b.className='lookb'; b.style.width='auto'; b.style.flex='1'; b.textContent=name; b.setAttribute('aria-pressed',(V2.shape[cur]||'curvy')===k?'true':'false');
      b.addEventListener('click',()=>{ setShape(cur,k); wardUI(); }); r.appendChild(b); } box.appendChild(r); }
  if(mine&&!mx){ const C=V2.casts[cur], outs=(C&&C.meta&&C.meta.outfits)||[], fi=fitOf(cur); h('Clothes');
    outs.forEach((o,i)=>{ const b=document.createElement('button'); b.type='button'; b.className='lookb'; const sw=(V2.sw[cur]||[])[i]||['#888','#666'];
      const ic=document.createElement('i'); ic.style.background=`linear-gradient(${sw[0]} 0 55%,${sw[1]} 55% 100%)`; const sp=document.createElement('span'); sp.textContent=o.name; b.append(ic,sp);
      b.setAttribute('aria-pressed',i===fi?'true':'false');
      b.addEventListener('click',()=>{ if(i===fitOf(cur)) return; wearFit(i); toast(mpick(['Looking sharp!','Fresh! Lagos go notice.','You don change. Correct!'])); wardUI(); });
      box.appendChild(b); }); }
  h(mine?'Classic looks':'Clothes');
  for(const L of LOOK_LIST){ if(L.f!==f||!lookShown(L)) continue;
    const b=document.createElement('button'); b.type='button'; b.className='lookb'; const c=CAST[L.id], sw=L.sw||(c?[c.look[1],c.look[2]]:['#888','#666']);
    const i=document.createElement('i'); i.style.background=`linear-gradient(${sw[0]} 0 55%,${sw[1]} 55% 100%)`; const sp=document.createElement('span'); sp.textContent=L.name; b.append(i,sp);
    const ok=lookOk(L); b.disabled=!ok; if(!ok){ const sm=document.createElement('small'); sm.textContent='still arriving'; b.appendChild(sm); }
    b.setAttribute('aria-pressed',L.id===WARD.cur?'true':'false');
    b.addEventListener('click',async()=>{ if(WARD.busy||L.id===WARD.cur) return; if(L.id!=='me'&&!PEOPLE.casts[L.id]) toast('Getting dressed…',4);
      const done=await wearLook(L.id); toast(done?(L.id===baseLook()?'Back to your classic look':mpick(['Looking sharp!','Fresh! Lagos go notice.','You don change. Correct!'])):'That look is not ready yet. Try again soon.'); wardUI(); });
    box.appendChild(b); }
  // colours: shirt and trousers (a dress, kaftan or thobe takes one colour)
  const row=(title,list,key)=>{ h(title); const r=document.createElement('div'); r.className='swatches';
    for(const [k,name,hex] of list){ const b=document.createElement('button'); b.type='button'; b.className='sw'+(hex?'':' orig'); b.title=name; b.setAttribute('aria-label',title+': '+name);
      if(hex) b.style.background=hex; b.setAttribute('aria-pressed',WARD.colors[key]===k?'true':'false');
      b.addEventListener('click',()=>{ WARD.colors[key]=k; try{ localStorage.setItem('naija-colours',JSON.stringify(WARD.colors)); }catch(e){} applyColours(); wardUI(); });
      r.appendChild(b); } box.appendChild(r); };
  if(mine&&!mx) return;   // our people's outfits keep their own colours
  const robe=isRobe(); row(robe?(f?'Dress colour':'Robe colour'):'Shirt colour',SHIRTS,'s'); if(!robe) row(f?'Trousers / skirt colour':'Trousers colour',TROUSERS,'p'); }
function openWard(){ if(WARD.open||!hero||busy) return; WARD.open=true; $('#settings').hidden=true; if(document.pointerLockElement) document.exitPointerLock(); wardUI(); $('#ward').hidden=false; $('#lookhint').hidden=true; WARD.px=$('#ward').getBoundingClientRect().right; lastPrompt=null;
  player.speed=0; player.yaw=INT.wardYaw||0; camState.yaw=player.yaw+Math.PI; camState.pitch=.08; camState.last=T0; }   // turn round to face the room, camera in front: a mirror view
function closeWard(){ if(!WARD.open) return; WARD.open=false; $('#ward').hidden=true; lastPrompt=null; }
$('#wardDone').addEventListener('click',closeWard);

/* ================= your phone: OYA RIDE =================
   P (or the phone button) takes out your phone. Pick where you are going: a car comes to the street nearest you, its OYA RIDE
   sign on the roof; walk to it and press E. It drives you there through the traffic (or skip the ride), and you pay the driver.
   While you use the phone you hold it in your right hand. */
const PHONE={open:false,mesh:null,loading:null,body:null,q:'',tab:'ride'};
const PHONE_POSE={x:0,y:.08,z:0,rx:0,ry:1.5708,rz:0};   // in the right hand: flat in the palm along the fingers, screen up to your face (metres, radians)
const RIDE={v:null,state:null,dest:null,goal:null,t:0,fare:0,who:'',car:'',plate:'',sign:null};
const RIDE_WHO=['Tunde','Emeka','Musa','Chinedu','Bayo','Ibrahim','Segun','Kelechi','Femi','Yusuf'], RIDE_CAR=['Toyota Corolla','Honda Accord','Toyota Camry','Kia Rio','Hyundai Elantra'];
function loadPhone(){ if(PHONE.loading) return PHONE.loading;
  return PHONE.loading=fetchBuf(murl('phone')).then(b=>GLL.parseAsync(b,'')).then(g=>{ const o=g.scene; o.traverse(m=>{ if(m.isMesh){ const x=m.material; if(x.map) x.map.colorSpace=THREE.SRGBColorSpace; m.material=new THREE.MeshStandardMaterial({map:x.map||null,roughness:.35,metalness:.2,emissive:0xffffff,emissiveMap:x.map||null,emissiveIntensity:.12}); m.castShadow=false; m.layers.set(1); m.frustumCulled=false; } });
    const w=new THREE.Group(); w.add(o); w.visible=false; PHONE.mesh=w; }).catch(e=>console.warn('phone',e)); }
// people texting or on a call hold a phone too (the nearest few)
const PHONE_POOL=[];
function pedPhone(p){ const b=p.body, want=!!b&&!!PHONE.mesh&&p.dc<26&&(b.clip==='text'||b.clip==='phone'||b.clip==='text_walk');
  if(p.phm&&(!want||p.phmB!==b)){ if(p.phm.parent) p.phm.parent.remove(p.phm); PHONE_POOL.push(p.phm); p.phm=null; }
  if(!want||p.phm) return; const hand=boneOf(b.inner,/RightHand$/,b.bc||(b.bc={}),'RightHand'); if(!hand) return;
  let m=PHONE_POOL.pop(); if(!m){ m=new THREE.Group(); m.add(PHONE.mesh.children[0].clone()); }
  hand.updateWorldMatrix(true,false); const sc=new THREE.Vector3(); hand.matrixWorld.decompose(_p,_q,sc); m.scale.setScalar(1/sc.x); m.position.set(PHONE_POSE.x/sc.x,PHONE_POSE.y/sc.x,PHONE_POSE.z/sc.x); m.rotation.set(PHONE_POSE.rx,PHONE_POSE.ry,PHONE_POSE.rz); hand.add(m); p.phm=m; p.phmB=b; }
// the phone shows in your hand while it is open, or when you stand texting or calling
function phoneInHand(){ const m=PHONE.mesh; if(!hero) return; const w=hero.w, want=mode==='walk'||mode==='interior'?(PHONE.open||w.text>.35||w.phone>.35):false; if(!m){ if(want) loadPhone(); return; }
  if(want&&PHONE.body!==hero.cObj){ let hb=null; hero.cObj.traverse(o=>{ if(!hb&&o.isBone&&/RightHand$/.test(o.name)) hb=o; }); if(!hb) return; hero.cObj.updateMatrixWorld(true);
    const s=new THREE.Vector3(); hb.matrixWorld.decompose(_p,_q,s); m.scale.setScalar(1/s.x); m.position.set(PHONE_POSE.x/s.x,PHONE_POSE.y/s.x,PHONE_POSE.z/s.x); m.rotation.set(PHONE_POSE.rx,PHONE_POSE.ry,PHONE_POSE.rz); hb.add(m); PHONE.body=hero.cObj; }
  if(m.visible!==want) m.visible=want; }
function togglePhone(){ if(PHONE.open) closePhone(); else openPhone(); }
function openPhone(){ if(!started||busy||PHONE.open||mode==='interior'||mode==='enter'||(mode==='drive'&&!drive.ride)) return; loadPhone(); PHONE.open=true; closeWard(); $('#settings').hidden=true;
  if(document.pointerLockElement) document.exitPointerLock(); phoneUI(); $('#phone').hidden=false; $('#phoneBtn').setAttribute('aria-pressed','true'); }
function closePhone(){ if(!PHONE.open) return; PHONE.open=false; $('#phone').hidden=true; $('#phoneBtn').setAttribute('aria-pressed','false'); if(hero&&hero.fid==='text') hero.fid=null; }
const fareOf=pl=>Math.max(500,Math.round((500+Math.hypot(pl.x-player.x,pl.z-player.z)*1.3/1000*350)/50)*50);
const naira=n=>'₦'+n.toLocaleString('en-NG');
const kmOf=d=>d<950?Math.round(d/10)*10+' m':(d/1000).toFixed(1)+' km';
const POPULAR=/^(Your house|Eko Grand Hotel|Mushin Motor Park|Mushin Police Station|Mushin Station|LUTH gate)$|Market$/;
function phoneUI(){ const b=$('#phBody'); if(!b) return; b.textContent=''; const el=(t,c,x)=>{ const e=document.createElement(t); if(c) e.className=c; if(x!=null) e.textContent=x; return e; };
  const btn=(c,x,fn)=>{ const e=el('button','ph-btn '+c,x); e.type='button'; e.addEventListener('click',fn); return e; };
  $('#phTime').textContent=$('#clockT').textContent;
  document.querySelectorAll('.ph-tab').forEach(t=>t.classList.toggle('on',t.dataset.tab===PHONE.tab)); if(PHONE.tab==='work'){ workUI(b,el,btn); return; }
  if(!RIDE.state){
    b.append(el('h3','ph-h','Where you dey go?'));
    const q=el('input','phq'); q.type='search'; q.placeholder='Search a place'; q.value=PHONE.q; q.setAttribute('aria-label','Search a place'); b.append(q);
    const list=el('div','ph-list'); b.append(list);
    const fill=()=>{ list.textContent=''; const s=PHONE.q.trim().toLowerCase(), seen=new Set();
      const ok=pl=>pl.name&&pl.name!=='Footbridge'&&!seen.has(pl.name)&&Math.hypot(pl.x-player.x,pl.z-player.z)>60&&(!pl.minor||pl.sub==='Neighbourhood'||pl.name==='LUTH gate');
      const row=pl=>{ seen.add(pl.name); const d=Math.hypot(pl.x-player.x,pl.z-player.z), r=el('button','ph-row'); r.type='button'; const t=el('span'); t.append(el('b',null,pl.name),el('small',null,(pl.sub||'')+' · '+kmOf(d*1.3)));
        r.append(t,el('span','fare',naira(fareOf(pl)))); r.addEventListener('click',()=>bookRide(pl)); list.append(r); };
      const all=PLACES.filter(ok);
      if(s){ all.filter(pl=>(pl.name+' '+(pl.sub||'')).toLowerCase().includes(s)).sort((a,c)=>Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(c.x-player.x,c.z-player.z)).slice(0,30).forEach(row); }
      else { list.append(el('h4','ph-k','Popular')); all.filter(pl=>POPULAR.test(pl.name)).slice(0,10).forEach(row);
        list.append(el('h4','ph-k','Near you')); all.filter(pl=>!seen.has(pl.name)).sort((a,c)=>Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(c.x-player.x,c.z-player.z)).slice(0,25).forEach(row); }
      if(!list.children.length) list.append(el('p','ph-note','No place like that. Try another name.')); };
    q.addEventListener('input',()=>{ PHONE.q=q.value; fill(); }); q.addEventListener('keydown',e=>e.stopPropagation()); fill(); return; }
  const d=RIDE.dest, card=el('div','ph-card'); card.append(el('b',null,RIDE.who),el('span',null,`${RIDE.car} · ${RIDE.plate}`),el('span',null,`To ${d.name} · ${naira(RIDE.fare)}, cash`)); b.append(card);
  const live=el('p','ph-live'); live.id='phLive'; b.append(live);
  if(RIDE.state==='waiting') b.append(btn('go','Get in',()=>{ if(rideHere()) rideEnter(); else toast('Walk to the car first, then get in.',2); }));
  if(RIDE.state==='coming'||RIDE.state==='waiting') b.append(btn('no','Cancel ride',()=>cancelRide('You cancelled the ride.')));
  if(RIDE.state==='riding'){ b.append(btn('go','Skip the ride',skipRide),btn('no','Get down here',()=>rideExit(true))); }
  phoneLive(); }
function phoneLive(){ const e=$('#phLive'); if(!e||!RIDE.v) return; const v=RIDE.v, G=RIDE.goal;
  const t=RIDE.state==='coming'?`${RIDE.who} dey come · ${(()=>{ const D=goalField(G), d=Math.min(D[v.ai?v.ai.b:0]||1e9,3000), m=Math.round(d/7/60); return m<1?'less than a minute':m+' min'; })()} away`:RIDE.state==='waiting'?`${RIDE.who} don reach. Walk to the car with the OYA RIDE sign and press E.`:`On the way · ${kmOf(Math.min(goalField(G)[v.ai?v.ai.b:0]||0,9e4))} left`;
  if(e.textContent!==t) e.textContent=t; }
// the street point nearest a place, where a car can stop: the street (its two ends) and how far along it
function goalAt(x,z){ const [e]=nearestRoad(x,z,e=>e.drive);
  if(!e){ const n=driveNode(x,z); return {x:nodes[n].x,z:nodes[n].z,a:n,b:n,ta:0,tb:0,ow:false,near:false,D:null}; }
  const A0=nodes[e.a], t=clamp((x-A0.x)*e.fx+(z-A0.z)*e.fz,0,e.len); return {x:A0.x+e.fx*t,z:A0.z+e.fz*t,a:e.a,b:e.b,ta:t,tb:e.len-t,ow:!!e.ow,near:false,D:null}; }
const kerbPoint=(x,z)=>{ const g=goalAt(x,z); return {x:g.x,z:g.z}; };
// driving distance from every junction to that point (into the street from either end, or only the right end of a one-way)
function goalField(g){ if(g.D) return g.D; const Da=fieldTo(g.a), Db=g.ow||g.a===g.b?null:fieldTo(g.b), D=new Float64Array(Da.length); for(let i=0;i<D.length;i++) D[i]=Math.min(Da[i]+g.ta,Db?Db[i]+g.tb:1e18); return g.D=D; }
// a free car, put on a street one or two minutes' drive from you (by the real streets, one-ways and all), heading your way
function pickCab(g){ const ok=v=>v.ai&&(v.type==='sedan'||v.type==='suv')&&!v.ai.chase&&!v.ai.goal&&v!==drive.v&&!v.jacked&&!v.raid&&v!==RAID.v;
  const c=vehicles.filter(ok).sort((a,b)=>Math.hypot(b.x-player.x,b.z-player.z)-Math.hypot(a.x-player.x,a.z-player.z)); if(!c.length) return null;
  const D=goalField(g), opts=[];
  for(let tries=0;tries<2&&!opts.length;tries++){ const lo=tries?40:90, hi=tries?400:240;
    for(const n of nodes){ const dn=D[n.i]; if(dn<lo||dn>hi||Math.hypot(n.x-player.x,n.z-player.z)<55) continue;
      for(const m of n.out){ if(D[m]>=dn) continue; const e=edgeOf(n.i,m); if(e&&e.drive&&e.len>12) opts.push([n.i,m]); } } }
  for(let t=0;t<20&&opts.length;t++){ const [a,b]=mpick(opts), seg=lineSeg(a,b), sp=mrr(.2,.6)*seg.len; segPos(seg,sp,_sp);
    if(vehicles.some(o=>Math.hypot(o.x-_sp.x,o.z-_sp.z)<11)) continue; const v=c[0], e=edgeOf(a,b), DF=v.c.def;
    v.ai={a,b,s:sp,seg,na:-1,maxV:mrr(DF.maxV[0],DF.maxV[1])*1.2,wait:0,ghost:0,stuck:0,cond:e.cond,ec:e.c}; v.parked=false; v.x=_sp.x; v.z=_sp.z; v.h=Math.atan2(-_sp.dz,_sp.dx); v.speed=v.ai.maxV*.6; v.y=groundY(v.x,v.z); return v; }
  return placeCar(c[0],110,190,true)?c[0]:null; }
function rideSign(v,on){ if(RIDE.sign){ RIDE.sign.parent&&RIDE.sign.parent.remove(RIDE.sign); RIDE.sign.material.map.dispose(); RIDE.sign.material.dispose(); RIDE.sign=null; }
  if(on){ const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:texLabel('OYA RIDE','#F2B705','#0E1014'),fog:false})); sp.scale.set(1.6,.3,1); sp.position.set(0,((v.c.def.roof&&v.c.def.roof[2])||1.45)+.32,0); sp.layers.set(1); v.c.g.add(sp); RIDE.sign=sp; } }
function bookRide(pl){ if(RIDE.state) return; if(mode!=='walk'){ toast('Book your ride when you are on foot.'); return; } if(CASH.n<fareOf(pl)){ toast(`You no get enough money for this ride (${naira(fareOf(pl))}). Do some OYA WORK first.`,3); return; }
  const g=goalAt(player.x,player.z), dk=kerbPoint(pl.x,pl.z), v=pickCab(g); if(!v){ toast('"No driver dey around now. Try again small time."',2.6); return; }
  Object.assign(RIDE,{v,state:'coming',dest:{...pl,rx:dk.x,rz:dk.z},goal:g,t:0,hint:false,fare:fareOf(pl),who:mpick(RIDE_WHO),car:mpick(RIDE_CAR),plate:mpick(['LND','KJA','AAA','EKY','MUS','APP'])+' '+(100+Math.floor(MR()*899))+' '+mpick(['XA','GH','KT','BD','FE'])});
  v.taxi=true; v.ai.goal=g; rideSign(v,true); toast(`${RIDE.who} don accept your ride. He dey come!`,2.6); phoneUI(); }
function cancelRide(msg){ const v=RIDE.v; if(!v) return; if(RIDE.state==='riding'){ rideExit(true); return; }
  if(v.ai){ v.ai.goal=null; v.ai.wait=0; } v.taxi=false; rideSign(v,false); Object.assign(RIDE,{v:null,state:null,dest:null,goal:null}); if(msg) toast(msg,2.6); if(PHONE.open) phoneUI(); }
const rideHere=()=>!!RIDE.v&&(RIDE.state==='waiting'||RIDE.state==='coming')&&Math.abs(RIDE.v.speed)<1.5&&Math.hypot(RIDE.v.x-player.x,RIDE.v.z-player.z)<4.4;
function rideEnter(){ const v=RIDE.v, d=RIDE.dest; if(!v||!v.ai) return; closeWard(); RIDE.state='riding'; RIDE.t=0; RIDE.goal=goalAt(d.rx,d.rz); v.ai.goal=RIDE.goal; v.ai.wait=1.2;
  drive.v=v; drive.ride=true; drive.speed=0; drive.steer=0; mode='drive'; rig.root.visible=false; carryDrop(true); player.speed=0; camState.last=-10; lastMode=null;
  mapView.setDest(d.x,d.z,d); toast(`Oya, we dey go ${d.name}. Sit back, relax.`,2.6); if(PHONE.open) phoneUI(); }
function rideExit(early){ const v=RIDE.v; if(!v) return; drive.ride=false; if(mode==='drive'&&drive.v===v) exitCar();
  v.parked=false; if(v.ai){ v.ai.goal=null; v.ai.wait=2.5; } v.taxi=false; rideSign(v,false); if(early) mapView.clearRoute();
  Object.assign(RIDE,{v:null,state:null,dest:null,goal:null}); lastMode=null; if(PHONE.open) phoneUI(); }
function arriveRide(){ const d=RIDE.dest, f=Math.min(CASH.n,RIDE.fare), w=RIDE.who; rideExit(false); mapView.clearRoute(); addCash(-f); if(JOB.state) jobRoute(); toast(`You don reach ${d.name}! ${w} collect ${naira(f)}. "Thank you o, safe journey!"`,3.6); }
function skipRide(){ const v=RIDE.v, G=RIDE.goal; if(!v||RIDE.state!=='riding') return;
  fadeSwap(()=>{ if(!placeCar(v,12,45,true,{x:G.x,z:G.z})){ v.x=G.x; v.z=G.z; } v.ai.goal=G; G.near=false; v.ai.wait=0; player.x=v.x; player.z=v.z; camState.last=-10; }); }
function updateRide(dt){ const R=RIDE, v=R.v; if(!v) return; R.t+=dt;
  if(R.state!=='riding'&&!v.ai){ cancelRide('Your driver had to go. Book again.'); return; }   // someone took the car
  if(v.ai&&v.ai.goal!==R.goal) v.ai.goal=R.goal;   // keep the destination if the car was moved
  if(R.state==='coming'){ const G=R.goal;
    if((G.near||Math.hypot(v.x-player.x,v.z-player.z)<9)&&Math.abs(v.speed)<.5){ R.state='waiting'; R.t=0; toast(`${R.who} don reach! The car with the OYA RIDE sign. Press E to enter.`,3.2); if(PHONE.open) phoneUI(); }
    else if(R.t>100){ placeCar(v,35,70,true); v.ai.goal=G; R.t=50; }   // stuck somewhere: he takes a shorter way
    else if(Math.hypot(player.x-G.x,player.z-G.z)>30){ Object.assign(G,goalAt(player.x,player.z)); } }   // you walked off: he comes to where you are now
  else if(R.state==='waiting'){ v.speed=0; if(v.ai) v.ai.wait=1; if(R.t>80) cancelRide(`${R.who} don wait tire. He don go.`); else if(Math.hypot(player.x-v.x,player.z-v.z)>60){ R.state='coming'; v.ai.wait=0; Object.assign(R.goal,goalAt(player.x,player.z)); } }
  else if(R.state==='riding'){ if(mode!=='drive'||drive.v!==v){ rideExit(true); return; } player.x=v.x; player.z=v.z;
    if(R.goal.near&&Math.abs(v.speed)<.5&&R.t>2) arriveRide(); else if(R.t>300) skipRide();
    else if(R.t>18&&!R.hint&&!PHONE.open){ R.hint=true; toast(`Long ride? Open your phone (${touchUI?'phone button':'P'}) to skip it.`,3); } }
  if(PHONE.open) phoneLive(); }

/* ================= OYA WORK: delivery jobs on your phone =================
   Pick a job, collect the package at the yellow ring, drop it at the next one before the time runs out (walk, drive,
   take an okada or a ride: anything goes). Late, and the customer pays only part. Busted or wasted, and the package is gone. */
const JOB={state:null,offers:null,offT:-99,pick:null,drop:null,pay:0,limit:0,t:0,what:'',who:'',ring:null,label:null,shownT:null};
const JOB_WHAT=['a parcel','phone parts','a bag of rice','office documents','a crate of drinks','aso-ebi fabric','generator parts','a birthday cake','a carton of indomie','medicine for a pharmacy'];
const JOB_WHO=['Mama Nkechi','Alhaji Musa','Chief Adebayo','Iya Bisi','Brother Emeka','Oga Tunde','Madam Grace','Uncle Sule','Aunty Funmi','Mr Okafor'];
const jobOk=pl=>pl.name&&pl.name!=='Footbridge'&&pl.name!=='Oga Shege'&&!(pl.minor&&pl.sub!=='Neighbourhood');
function jobOffers(){ if(JOB.offers&&T0-JOB.offT<120) return JOB.offers; const all=PLACES.filter(jobOk), out=[];
  for(let t=0;t<60&&out.length<3;t++){ const a=mpick(all), da=Math.hypot(a.x-player.x,a.z-player.z); if(da<60||da>650) continue;
    const b=mpick(all), d=Math.hypot(b.x-a.x,b.z-a.z); if(b===a||d<250||d>1700||out.some(o=>o.a===a||o.b===b)) continue;
    const fast=MR()<.3, pay=Math.round((1500+d*3.6)*(fast?1.7:1)/50)*50, limit=Math.round((d*1.35/(fast?7.5:5.5)+45)/5)*5;
    out.push({a,b,d,pay,limit,fast,what:mpick(JOB_WHAT),who:mpick(JOB_WHO)}); }
  JOB.offers=out; JOB.offT=T0; return out; }
function jobRing(x,z,col,text){ if(!JOB.ring){ const m=new THREE.Mesh(new THREE.RingGeometry(1.5,1.85,40),new THREE.MeshBasicMaterial({color:0xf2b705,transparent:true,opacity:.8,depthWrite:false,fog:false,side:THREE.DoubleSide})); m.rotation.x=-Math.PI/2; scene.add(m); JOB.ring=m; }
  JOB.ring.material.color.set(col); JOB.ring.position.set(x,groundY(x,z)+.05,z); JOB.ring.visible=true;
  if(JOB.label){ JOB.label.parent&&JOB.label.parent.remove(JOB.label); JOB.label.material.map.dispose(); JOB.label.material.dispose(); }
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:texLabel(text,col===0xf2b705?'#F2B705':'#3fc27a','#0E1014'),fog:false,depthTest:false})); sp.scale.set(2.2,.42,1); sp.position.set(x,groundY(x,z)+2.6,z); sp.layers.set(1); scene.add(sp); JOB.label=sp; }
function jobRoute(){ const k=JOB.state==='pick'?JOB.pick:JOB.drop; if(k) mapView.setDest(k.x,k.z,{name:k.name,job:true}); }
function takeJob(o){ if(JOB.state) return; const pa=kerbPoint(o.a.x,o.a.z), pb=kerbPoint(o.b.x,o.b.z);
  Object.assign(JOB,{state:'pick',pick:{x:pa.x,z:pa.z,name:o.a.name},drop:{x:pb.x,z:pb.z,name:o.b.name},pay:o.pay,limit:o.limit,t:0,what:o.what,who:o.who,fast:o.fast,offers:null});
  jobRing(pa.x,pa.z,0xf2b705,'PICK UP'); jobRoute(); toast(`${o.who}: "Come carry ${o.what} for ${o.a.name}. I go pay you ${naira(o.pay)}."`,3.4); closePhone(); }
function endJob(msg,t=3.2){ if(JOB.ring) JOB.ring.visible=false; if(JOB.label){ JOB.label.parent&&JOB.label.parent.remove(JOB.label); JOB.label.material.map.dispose(); JOB.label.material.dispose(); JOB.label=null; }
  const was=JOB.state; Object.assign(JOB,{state:null,pick:null,drop:null}); if(was&&mapView.dest&&mapView.dest.place&&mapView.dest.place.job) mapView.clearRoute(); if(msg) toast(msg,t); $('#job').hidden=true; JOB.shownT=null; if(PHONE.open) phoneUI(); }
function updateJob(dt){ if(!JOB.state) return; if(JOB.ring&&JOB.ring.visible){ JOB.ring.material.opacity=.55+.3*Math.sin(T0*4); }
  if(FIGHT.dead||COPS.bust){ endJob(FIGHT.dead?'The package got lost while you were at LUTH. Job failed.':'Police took the package. Job failed.'); return; }
  const f=mode==='drive'&&drive.v?drive.v:player, slow=mode!=='drive'||Math.abs(drive.speed)<4;
  if(JOB.state==='pick'){ const k=JOB.pick; if(mode!=='interior'&&slow&&Math.hypot(f.x-k.x,f.z-k.z)<(mode==='drive'?5:2.6)){ JOB.state='drop'; JOB.t=0; jobRing(JOB.drop.x,JOB.drop.z,0x3fc27a,'DROP OFF'); jobRoute();
      toast(`You collected ${JOB.what}. Take am reach ${JOB.drop.name} in ${fmtClock(JOB.limit)}!`,3); } }
  else if(JOB.state==='drop'){ JOB.t+=dt; const k=JOB.drop;
    if(mode!=='interior'&&slow&&Math.hypot(f.x-k.x,f.z-k.z)<(mode==='drive'?5:2.6)){ const late=JOB.t>JOB.limit, pay=late?Math.round(JOB.pay*.3/50)*50:JOB.pay; addCash(pay);
      endJob(late?`Late! The customer vex. Na only ${naira(pay)} dem pay you.`:`Delivered! ${JOB.who} paid you ${naira(pay)}. "Correct person!"`,3.4); return; } }
  const left=JOB.state==='drop'?JOB.limit-JOB.t:null, txt=JOB.state==='pick'?`Pick up: ${JOB.pick.name}`:`Deliver to ${JOB.drop.name} · ${left>0?fmtClock(left):'late!'}`;
  if(txt!==JOB.shownT){ JOB.shownT=txt; const e=$('#job'); e.textContent=txt; e.hidden=mode==='interior'; e.classList.toggle('late',left!==null&&left<=15); } }
const fmtClock=s=>{ s=Math.max(0,Math.ceil(s)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); };
function workUI(b,el,btn){ b.append(el('h3','ph-h','OYA WORK'));
  if(JOB.state){ const card=el('div','ph-card'); card.append(el('b',null,JOB.who),el('span',null,`${JOB.what[0].toUpperCase()+JOB.what.slice(1)}`),el('span',null,JOB.state==='pick'?`Pick up at ${JOB.pick.name}`:`Deliver to ${JOB.drop.name}`),el('span',null,`Pay ${naira(JOB.pay)}`)); b.append(card);
    b.append(btn('no','Drop this job',()=>endJob('You dropped the job.'))); return; }
  b.append(el('p','ph-note','Carry packages across Mushin. Walk, drive or take a ride: just reach on time.'));
  const list=el('div','ph-list'); b.append(list);
  for(const o of jobOffers()){ const r=el('button','ph-row'); r.type='button'; const t=el('span');
    t.append(el('b',null,(o.fast?'URGENT · ':'')+o.what[0].toUpperCase()+o.what.slice(1)),el('small',null,`${o.a.name} → ${o.b.name} · ${kmOf(o.d*1.3)} · ${fmtClock(o.limit)}`));
    r.append(t,el('span','fare',naira(o.pay))); r.addEventListener('click',()=>takeJob(o)); list.append(r); }
  if(!list.children.length) list.append(el('p','ph-note','No work right now. Check again soon.')); }

/* ================= money: the naira in your pocket =================
   Kept on this device; you start with ₦5,000. Floor or kill someone and their money drops (walk over it to take it);
   G next to someone with a weapon in your hand robs them (shop and market sellers carry more). Jobs on the phone pay too. */
const CASH={n:5000,shown:null,drops:[],geo:null,mat:null,flashT:0,flash:0};
try{ const c=localStorage.getItem('naija-cash'); if(c!==null&&isFinite(+c)) CASH.n=+c; }catch(e){}
function addCash(d){ d=Math.round(d); if(!d) return; CASH.n=Math.max(0,CASH.n+d); try{ localStorage.setItem('naija-cash',String(CASH.n)); }catch(e){} CASH.flash=d>0?1:-1; CASH.flashT=1.4; }
const CASH_OF={areaboy:[300,3500],mama:[500,4500],baba:[800,6000],suit_lady:[3000,15000],lady_red:[500,5000],lady_black:[500,5000],hawker:[200,2500],schoolboy:[50,600],girl:[500,4000],police_m:[2000,9000],police_f:[2000,9000]};
const cashOf=(c,k=1)=>{ const r=CASH_OF[c]||[300,3000]; return Math.max(50,Math.round(mrr(r[0],r[1])*k/50)*50); };
function dropCash(x,z,amt){ if(amt<=0||mode==='interior') return;
  if(!CASH.geo){ CASH.geo=new THREE.BoxGeometry(.18,.06,.1); CASH.mat=new THREE.MeshStandardMaterial({color:0x3a9c5a,emissive:0x2a8a48,emissiveIntensity:.55,roughness:.6}); }
  const m=new THREE.Mesh(CASH.geo,CASH.mat); m.position.set(x,.06,z); m.castShadow=true; scene.add(m); CASH.drops.push({x,z,amt,t:0,m}); if(CASH.drops.length>24){ const o=CASH.drops.shift(); scene.remove(o.m); } }
// someone's money falls out when you floor them (once each)
function lootPed(p,k=1){ if(p.looted||p.carried) return; p.looted=true; const a=cashOf(p.cast,k); if(a>0) dropCash(p.x+mrr(-.4,.4),p.z+mrr(-.4,.4),a); }
function updateMoney(dt){ for(let i=CASH.drops.length-1;i>=0;i--){ const d=CASH.drops[i]; d.t+=dt; d.m.position.y=.08+Math.sin(d.t*3)*.03; d.m.rotation.y+=dt*1.6;
    if(mode==='walk'&&!FIGHT.ko&&Math.hypot(player.x-d.x,player.z-d.z)<1.25){ addCash(d.amt); scene.remove(d.m); CASH.drops.splice(i,1); toast('+'+naira(d.amt),1.4); continue; }
    if(d.t>150){ scene.remove(d.m); CASH.drops.splice(i,1); } }
  if(CASH.flashT>0){ CASH.flashT-=dt; if(CASH.flashT<=0) $('#cash').className='cash'; } }
function cashHUD(){ if(CASH.shown!==CASH.n){ CASH.shown=CASH.n; const e=$('#cash'); e.textContent=naira(CASH.n); if(CASH.flashT>0) e.className='cash '+(CASH.flash>0?'up':'down'); } }
// a robbery: hands up, money on the floor, then they run (and the street remembers)
const SELLER=/^(market|gist)$/;
function robPed(p){ const seller=!!(p.spot&&SELLER.test(p.spot.type)), amt=seller?cashOf(p.cast,3)+Math.round(mrr(4000,20000)/50)*50:cashOf(p.cast,1.4);
  if(p.spot){ const s=p.spot; s.peds=s.peds.filter(q=>q!==p); p.spot=null; }
  Object.assign(p,{speed:0,atk:null}); react(p,'hands_up',player.x,player.z,mrr(1.8,2.4)); p.fleeAfter=true; p.looted=true; p.seq=(p.seq||0)+1;
  setTimeout(()=>{ if(p.state!=='off') dropCash(p.x+(player.x-p.x)*.4,p.z+(player.z-p.z)*.4,amt); },650);
  addHeat(seller?1:.8); incident(p.x,p.z,'robbery');
  toast(seller?mpick(['"Take everything! Na all today sales be this!"','"Abeg no kill me! Take the money!"']):mpick(['"Take am! Take am!"','"Abeg, na all I get be this!"','"No wound me o! Take my money!"']),2.4);
  for(const q of peds){ if(q===p||!(q.state==='walk'||q.state==='idle'||q.state==='spot'||q.state==='shop')) continue; if(Math.hypot(q.x-p.x,q.z-p.z)<22&&q.cast!=='areaboy'){ q.state='flee'; q.timer=mrr(4,7); q.yaw=Math.atan2(q.x-player.x,q.z-player.z)+mrr(-.5,.5); } } }

/* ================= weapons =================
   Bought from the black market (Oga Shege's corner, marked on the map). 1–4 (or the weapon button) to choose:
   fists, police baton, katana, AK-47. Blades and the baton hit much harder than fists; the AK shoots (aim with the right
   mouse button or AIM, fire with the left button / J or FIRE, R reloads). Kept on this device. */
const WEAPONS={
  fists:{name:'Fists'},
  baton:{name:'Police baton',file:'weapon_baton',len:.62,price:8000,melee:1.7,reach:.3},
  katana:{name:'Katana',file:'weapon_katana',len:1.02,price:25000,melee:2.9,reach:.55,blade:1},
  ak:{name:'AK-47',file:'weapon_ak',len:.88,price:120000,gun:1,dmg:34,rate:.11,mag:30},
  gren:{name:'Grenade',throw:1,price:15000,pack:3},
  molo:{name:'Petrol bomb',throw:1,price:6000,pack:3}};
const WEAP_ORDER=['fists','baton','katana','ak','gren','molo'], AMMO_PACK={n:30,price:4500};
const ARMS={own:{fists:1},cur:'fists',mag:0,ammo:0,lib:{},loading:{},aim:false,trig:false,fireT:0,reloadT:0,held:null,heldOn:null,shots:0,lastShot:-9,recoil:0};
try{ const a=JSON.parse(localStorage.getItem('naija-arms')||'null'); if(a&&a.own) Object.assign(ARMS,{own:{...a.own,fists:1},cur:a.own[a.cur]?a.cur:'fists',mag:a.mag|0,ammo:a.ammo|0}); }catch(e){}
const saveArms=()=>{ try{ localStorage.setItem('naija-arms',JSON.stringify({own:ARMS.own,cur:ARMS.cur,mag:ARMS.mag,ammo:ARMS.ammo})); }catch(e){} };
const gunOut=()=>!!(WEAPONS[ARMS.cur].gun||WEAPONS[ARMS.cur].throw)&&mode==='walk';   // a gun, or something to throw: aim and fire/throw
// each model is turned so +z points along the blade or barrel and the grip sits at the origin
const GRIP={ak:{rot:[0,Math.PI/2,0],grip:[.62,-.42],fore:[.3,-.12],muzzle:0},katana:{rot:[Math.PI/2,0,0],grip:[.87,0]},baton:{rot:[0,-Math.PI/2,0],grip:[.92,0]}};
function loadWeapon(id){ const W=WEAPONS[id]; if(W.throw&&!ARMS.lib[id]){ const w=new THREE.Group(), m=throwMesh(id); m.rotation.x=Math.PI/2; w.add(m); ARMS.lib[id]={w,L:.2,H:.1,fore:null,muzzle:new THREE.Vector3()}; } if(!W.file||ARMS.lib[id]) return Promise.resolve(ARMS.lib[id]); if(ARMS.loading[id]) return ARMS.loading[id];
  return ARMS.loading[id]=fetchBuf(murl(W.file)).then(b=>GLL.parseAsync(b,'')).then(g=>{ const o=g.scene, G=GRIP[id];
    o.traverse(m=>{ if(m.isMesh){ if(m.material.map) m.material.map.colorSpace=THREE.SRGBColorSpace; m.material.roughness=.5; m.material.metalness=id==='ak'?.4:.6; m.castShadow=true; } });
    o.rotation.set(...G.rot); const w=new THREE.Group(); w.add(o); w.updateMatrixWorld(true); const bb=new THREE.Box3().setFromObject(w), sz=bb.getSize(new THREE.Vector3()), k=W.len/sz.z;
    o.scale.multiplyScalar(k); w.updateMatrixWorld(true); bb.setFromObject(w);
    // grip: a fraction of the length from the tip (z) and of the height from the top (y)
    const L=bb.max.z-bb.min.z, Hh=bb.max.y-bb.min.y, gz=bb.max.z-G.grip[0]*L, gy=bb.max.y+G.grip[1]*Hh*(id==='ak'?1:0)-(id==='ak'?0:Hh/2);
    o.position.set(-(bb.min.x+bb.max.x)/2,-gy,-gz); const lib={w,L,H:Hh,fore:G.fore?new THREE.Vector3(0,(bb.max.y+G.fore[1]*Hh)-gy,(bb.max.z-G.fore[0]*L)-gz):null,muzzle:new THREE.Vector3(0,(bb.max.y-.12*Hh)-gy,bb.max.z-gz)};
    ARMS.lib[id]=lib; return lib; }).catch(e=>{ console.warn('weapon',id,e); delete ARMS.loading[id]; }); }
const cloneWeapon=id=>{ const L=ARMS.lib[id]; return L?L.w.clone(true):null; };
// in the hand. The Mixamo right hand: +x out of the thumb side of the fist, +y along the fingers, +z out of the palm.
// A handle goes through the fist along +x, tipped a little towards the fingers; g = the point of the weapon in the fist.
const HOLD={katana:{tilt:.35,edge:1,g:[0,0,-.035]},baton:{tilt:.25,edge:0,g:[.07,0,-.012]},gren:{tilt:0,edge:0,g:[0,0,0]},molo:{tilt:-1,edge:0,g:[0,0,.02]}};
const HAND_G=new THREE.Vector3(0,.082,.028);   // the middle of the fist
function holdOf(id){ const H=HOLD[id]; if(H.q) return H; const X=new THREE.Vector3(1,0,0), Y=new THREE.Vector3(0,1,0), Z=new THREE.Vector3(0,0,1);
  const z=X.clone().multiplyScalar(Math.cos(H.tilt)).addScaledVector(Y,Math.sin(H.tilt)).normalize();
  const x=(H.edge?Y.clone().negate():Z.clone()); x.addScaledVector(z,-x.dot(z)).normalize(); const y=new THREE.Vector3().crossVectors(z,x);   // katana: the edge (model -x) faces where the knuckles face
  H.q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z)); H.p=HAND_G.clone().sub(new THREE.Vector3(...H.g).applyQuaternion(H.q)); return H; }
function boneOf(root,re,cache,key){ if(cache&&cache[key]&&cache[key].parent) return cache[key]; let b=null; root.traverse(o=>{ if(!b&&o.isBone&&re.test(o.name)) b=o; }); if(cache) cache[key]=b; return b; }
const _wv=new THREE.Vector3(), _wv2=new THREE.Vector3(), _wq=new THREE.Quaternion(), _ws=new THREE.Vector3();
// the hero's weapon: in the right hand (blades, baton), on the back (AK), or in both hands while aiming (placed each frame)
function heroWeapon(){ if(!hero) return; const id=ARMS.cur, want=(mode==='walk'||mode==='interior')&&!HL.act&&!HL.broom?id:'fists';
  if(ARMS.heldId!==want||ARMS.heldOn!==hero.cObj||!ARMS.held){ if(ARMS.held&&ARMS.held.parent) ARMS.held.parent.remove(ARMS.held); ARMS.held=null; ARMS.heldId=want; ARMS.heldOn=hero.cObj; ARMS.bones={};
    if(want!=='fists'){ if(!ARMS.lib[want]){ loadWeapon(want).then(()=>{ ARMS.heldId=null; }); return; } ARMS.held=cloneWeapon(want); } }
  const w=ARMS.held; if(!w) return;
  const hand=boneOf(hero.cObj,/RightHand$/,ARMS.bones,'hand'), chest=boneOf(hero.cObj,/Spine2$/,ARMS.bones,'chest'); if(!hand||!chest) return;
  const aiming=want==='ak'&&(aimingNow()||ARMS.trig&&ARMS.mag>0)&&mode==='walk';
  if(want!=='ak'){ attachTo(w,hand,holdOf(want)); return; }
  if(w.parent!==scene){ if(w.parent) w.parent.remove(w); scene.add(w); w.scale.setScalar(1); }
  if(!aiming){ slingOn(w,hero.cObj,ARMS.bones,player.yaw); return; }
  aimArms(hero.cObj,ARMS.bones,w,AIM.dir,ARMS.recoil); }
function attachTo(w,b,H){ if(w.parent!==b){ if(w.parent) w.parent.remove(w); b.add(w); }
  b.updateWorldMatrix(true,false); b.matrixWorld.decompose(_wv,_wq,_ws); w.scale.setScalar(1/_ws.x); w.position.copy(H.p).multiplyScalar(1/_ws.x); w.quaternion.copy(H.q); }
// the rifle on the back: flat against it, barrel up over the left shoulder
function slingOn(w,root,cache,yaw){ const ch=boneOf(root,/Spine2$/,cache,'chest'), nk=boneOf(root,/Neck$/,cache,'neck'); if(!ch||!nk) return;
  const C=ch.getWorldPosition(_wv), u=nk.getWorldPosition(_wv2).sub(C).normalize(), f=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)); f.addScaledVector(u,-f.dot(u)).normalize();
  const r=new THREE.Vector3().crossVectors(f,u), z=u.clone().multiplyScalar(.8).addScaledVector(r,-.6).normalize(), x=f.clone().negate(); x.addScaledVector(z,-x.dot(z)).normalize(); const y=new THREE.Vector3().crossVectors(z,x);
  w.quaternion.setFromRotationMatrix(_wm.makeBasis(x,y,z)); w.position.copy(C).addScaledVector(f,-.2).addScaledVector(u,.03).sub(_wv2.set(0,-.02,.1).applyQuaternion(w.quaternion)); }
const _wm=new THREE.Matrix4();
// ---- aiming a rifle: the gun at the right shoulder pointing along `dir`, the hands brought onto it (two-bone IK)
const _ia=new THREE.Vector3(), _ib=new THREE.Vector3(), _ic=new THREE.Vector3(), _id=new THREE.Vector3(), _ie=new THREE.Vector3(), _iq=new THREE.Quaternion(), _iq2=new THREE.Quaternion();
function turnBone(b,from,to){ b.getWorldPosition(_ia); _ib.subVectors(from,_ia).normalize(); _ic.subVectors(to,_ia).normalize(); if(_ib.lengthSq()<1e-8||_ic.lengthSq()<1e-8) return;
  _iq.setFromUnitVectors(_ib,_ic); b.getWorldQuaternion(_iq2); _iq.multiply(_iq2); b.parent.getWorldQuaternion(_iq2); b.quaternion.copy(_iq2.invert().multiply(_iq)); b.updateMatrixWorld(true); }
function ik2(up,lo,hand,T,pole){ const A=up.getWorldPosition(new THREE.Vector3()), B=lo.getWorldPosition(new THREE.Vector3()), C=hand.getWorldPosition(new THREE.Vector3());
  const la=A.distanceTo(B), lb=B.distanceTo(C); const d=clamp(A.distanceTo(T),Math.abs(la-lb)+1e-3,la+lb-1e-3), dir=_id.subVectors(T,A).normalize();
  const ca=clamp((la*la+d*d-lb*lb)/(2*la*d),-1,1), sa=Math.sqrt(1-ca*ca); const pd=_ie.subVectors(pole,A); pd.addScaledVector(dir,-pd.dot(dir)); if(pd.lengthSq()<1e-8) pd.set(0,-1,0); pd.normalize();
  const E=A.clone().addScaledVector(dir,la*ca).addScaledVector(pd,la*sa); turnBone(up,B,E); turnBone(lo,hand.getWorldPosition(new THREE.Vector3()),T); }
function aimArms(root,cache,w,dir,kick=0){ const sh=boneOf(root,/RightShoulder$/,cache,'rs'), chest=boneOf(root,/Spine2$/,cache,'chest'), spine=boneOf(root,/Spine1$/,cache,'sp1'), head=boneOf(root,/Head$/,cache,'head');
  const ru=boneOf(root,/RightArm$/,cache,'ru'), rl=boneOf(root,/RightForeArm$/,cache,'rl'), rh=boneOf(root,/RightHand$/,cache,'rh'), lu=boneOf(root,/LeftArm$/,cache,'lu'), ll=boneOf(root,/LeftForeArm$/,cache,'ll'), lh=boneOf(root,/LeftHand$/,cache,'lh');
  if(!sh||!ru||!rl||!rh||!lu||!ll||!lh||!chest) return;
  const up=new THREE.Vector3(0,1,0), d=dir.clone().normalize(), right=new THREE.Vector3().crossVectors(d,up).normalize(), up2=new THREE.Vector3().crossVectors(right,d).normalize();
  if(spine){ const pitch=Math.asin(clamp(d.y,-.9,.9)); const fw=new THREE.Vector3(d.x,0,d.z).normalize(); const ax=new THREE.Vector3().crossVectors(fw,up).normalize(); spine.getWorldQuaternion(_iq2); _iq.setFromAxisAngle(ax,-pitch*.45); _iq.multiply(_iq2); spine.parent.getWorldQuaternion(_iq2); spine.quaternion.copy(_iq2.invert().multiply(_iq)); spine.updateMatrixWorld(true); }
  const S=ru.getWorldPosition(new THREE.Vector3()); const L=ARMS.lib.ak;
  const G=S.clone().addScaledVector(d,.30-kick*.05).addScaledVector(right,-.07).addScaledVector(up2,-.09);   // the pistol grip, in front of the right shoulder
  const m=new THREE.Matrix4().makeBasis(right.clone().negate(),up2,d); w.quaternion.setFromRotationMatrix(m); w.position.copy(G); w.updateMatrixWorld(true);
  const fore=L&&L.fore?L.fore.clone().applyQuaternion(w.quaternion).add(G):G.clone().addScaledVector(d,.3);
  const chestP=chest.getWorldPosition(new THREE.Vector3());
  ik2(ru,rl,rh,G,G.clone().addScaledVector(right,.35).addScaledVector(up2,-.45));
  ik2(lu,ll,lh,fore,chestP.clone().addScaledVector(right,-.45).addScaledVector(up2,-.55));
  if(head){ head.getWorldQuaternion(_iq2); const hf=new THREE.Vector3(0,0,1).applyQuaternion(_iq2); hf.y=0; hf.normalize(); const df=new THREE.Vector3(d.x,0,d.z).normalize(); _iq.setFromUnitVectors(hf,df); _iq.multiply(_iq2); head.parent.getWorldQuaternion(_iq2); head.quaternion.copy(_iq2.invert().multiply(_iq)); } }
// ---- bullets: what a shot from o along d hits first (people, you, cars, walls, the ground)
function rayCyl(o,d,cx,cz,r,y0,y1){ const ox=o.x-cx, oz=o.z-cz, a=d.x*d.x+d.z*d.z; if(a<1e-9) return -1; const b=2*(d.x*ox+d.z*oz), c=ox*ox+oz*oz-r*r, D=b*b-4*a*c; if(D<0) return -1;
  const s=Math.sqrt(D); for(const t of [(-b-s)/(2*a),(-b+s)/(2*a)]){ if(t<=0) continue; const y=o.y+d.y*t; if(y>=y0&&y<=y1) return t; } return -1; }
function raySphere(o,d,x,y,z,r){ const ox=o.x-x, oy=o.y-y, oz=o.z-z, b=ox*d.x+oy*d.y+oz*d.z, c=ox*ox+oy*oy+oz*oz-r*r, D=b*b-c; if(D<0) return -1; const t=-b-Math.sqrt(D); return t>0?t:-1; }
function rayCar(o,d,v){ const fx=Math.cos(v.h), fz=-Math.sin(v.h), rx=o.x-v.x, rz=o.z-v.z, lx=rx*fx+rz*fz, lz=-rx*fz+rz*fx, dlx=d.x*fx+d.z*fz, dlz=-d.x*fz+d.z*fx, D=v.c.def, Hh=v.type==='bus'||v.type==='danfo'?2.3:v.type==='okada'||v.type==='pbike'?1.1:1.55;
  SL.t0=0; SL.t1=1e9; return rslab(lx,dlx,-D.L/2,D.L/2)&&rslab(o.y,d.y,(v.y||0)+.2,(v.y||0)+Hh)&&rslab(lz,dlz,-D.W/2,D.W/2)?SL.t0:-1; }
function rayHit(o,d,maxD,shooter){ let best={t:maxD,kind:null}; const tw=rayDist(o,d,maxD); if(tw<best.t) best={t:tw,kind:'world'};
  if(d.y<-1e-4){ const tg=(walkY(o.x,o.z,0)-o.y)/d.y; if(tg>0&&tg<best.t) best={t:tg,kind:'ground'}; }
  for(const p of peds){ if(p===shooter||p.state==='off'||p.carried) continue; const dx=p.x-o.x, dz=p.z-o.z; if(dx*dx+dz*dz>(best.t+2)*(best.t+2)) continue;
    if(p.state==='down'||p.state==='dead'||p.state==='takedown'){ const t=raySphere(o,d,p.x,p.y+.25,p.z,.5); if(t>0&&t<best.t) best={t,kind:'ped',p,head:false}; continue; }
    const t=rayCyl(o,d,p.x,p.z,.3,p.y+.05,p.y+1.72); if(t>0&&t<best.t) best={t,kind:'ped',p,head:o.y+d.y*t-p.y>1.5}; }
  if(shooter!==player&&shooter){ if(mode==='walk'){ const t=rayCyl(o,d,player.x,player.z,.32,player.y,player.y+1.8); if(t>0&&t<best.t) best={t,kind:'player'}; } }
  for(const v of vehicles){ const dx=v.x-o.x, dz=v.z-o.z; if(dx*dx+dz*dz>(best.t+6)*(best.t+6)||!v.c.g.visible&&v!==drive.v) continue; const t=rayCar(o,d,v); if(t>0&&t<best.t) best={t,kind:v===drive.v&&shooter!==player?'player':'veh',v,inCar:v===drive.v}; }
  return best; }
// tracers, muzzle flashes and dust: small pools made once
const FX={tr:[],fl:[],dust:null,dd:[]};
function fxInit(){ if(FX.dust) return; for(let i=0;i<10;i++){ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(6),3)); const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xffe08a,transparent:true,opacity:.9,depthWrite:false,fog:false})); l.visible=false; l.frustumCulled=false; scene.add(l); FX.tr.push({l,t:0}); }
  const [c,g2]=cv(64,64), gr=g2.createRadialGradient(32,32,2,32,32,30); gr.addColorStop(0,'rgba(255,250,220,1)'); gr.addColorStop(.35,'rgba(255,190,80,.9)'); gr.addColorStop(1,'rgba(255,120,0,0)'); g2.fillStyle=gr; g2.fillRect(0,0,64,64);
  const tex=new THREE.CanvasTexture(c); for(let i=0;i<6;i++){ const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,fog:false})); s.visible=false; s.scale.setScalar(.45); scene.add(s); FX.fl.push({s,t:0}); }
  FX.dust=new THREE.InstancedMesh(new THREE.BoxGeometry(.05,.05,.05),new THREE.MeshBasicMaterial({color:0xb9ab92}),60); FX.dust.count=0; FX.dust.frustumCulled=false; scene.add(FX.dust); }
function tracer(a,b){ fxInit(); const T=FX.tr.find(x=>!x.l.visible)||FX.tr[0], p=T.l.geometry.attributes.position; p.setXYZ(0,a.x,a.y,a.z); p.setXYZ(1,b.x,b.y,b.z); p.needsUpdate=true; T.l.visible=true; T.t=.06; }
function flash(p){ fxInit(); const F=FX.fl.find(x=>!x.s.visible)||FX.fl[0]; F.s.position.copy(p); F.s.visible=true; F.t=.05; F.s.material.rotation=MR()*6.28; }
function puff(p,n=6,col){ fxInit(); for(let i=0;i<n;i++){ if(FX.dd.length>=60) FX.dd.shift(); FX.dd.push({x:p.x,y:p.y+.05,z:p.z,vx:mrr(-1.2,1.2),vy:mrr(.6,2.4),vz:mrr(-1.2,1.2),t:.6}); } }
function updateFX(dt){ if(!FX.dust) return; for(const T of FX.tr) if(T.l.visible&&(T.t-=dt)<=0) T.l.visible=false; for(const F of FX.fl) if(F.s.visible&&(F.t-=dt)<=0) F.s.visible=false;
  let n=0; for(let i=FX.dd.length-1;i>=0;i--){ const d=FX.dd[i]; d.t-=dt; if(d.t<=0){ FX.dd.splice(i,1); continue; } d.vy-=9*dt; d.x+=d.vx*dt; d.y=Math.max(.02,d.y+d.vy*dt); d.z+=d.vz*dt; _m.makeTranslation(d.x,d.y,d.z); FX.dust.setMatrixAt(n++,_m); }
  FX.dust.count=n; FX.dust.instanceMatrix.needsUpdate=true; }
function gunshot(v=1){ if(!AC||v<.03) return; burst(.13,3400,.85*v,8); burst(.45,170,.7*v,2.6); }
// one bullet
function shoot(o,dir,shooter,{dmg=34,range=140,spread=0,muzzle=null}={}){ const d=dir.clone(); if(spread){ d.x+=(MR()-.5)*spread; d.y+=(MR()-.5)*spread; d.z+=(MR()-.5)*spread; d.normalize(); }
  const h=rayHit(o,d,range,shooter), end=o.clone().addScaledVector(d,h.t); tracer(muzzle||o,end);
  if(h.kind==='ped') bulletPed(h.p,dmg*(h.head?3:1),d,shooter,h.head);
  else if(h.kind==='player') bulletPlayer(h.inCar?dmg*.35:dmg,shooter);
  else if(h.kind==='veh'){ puff(end,4); bulletCar(h.v,shooter); } else if(h.kind) puff(end,6);
  return h; }
function bulletPed(p,dmg,d,shooter,head){ const mine=shooter===player; if(p.hp==null) p.hp=HP0(p.cast); p.hp-=dmg; FIGHT.foe=p; FIGHT.foeT=4;
  bleed(p.x,head?1.62:1.25,p.z,d.x,d.z,head?12:7,2.4); p.stopT=.05;
  if(mine){ crime(p,.6); if(p.cop){ p.mad=1; FIGHT.heat=Math.min(HEAT_MAX,Math.max(FIGHT.heat+.5,2.65)); } }   // shooting at the police: three stars
  if(p.hp<=0){ killPed(p,d.x,d.z,head?1.6:1.1,mine?'gun':'shot'); return; }
  if(p.state==='down'||p.state==='dead') return;
  if(p.cop){ p.copHit=.25; return; }
  if(p.state!=='hurt') p.after=null; p.beaten=true; p.state='hurt'; p.react=head?'hit_head':mpick(['hit_body','hit_side']); p.timer=durOf(p,p.react)/1.6*.8; p.vx=d.x*1.5; p.vz=d.z*1.5; p.speed=0; p.atk=null; p.seq=(p.seq||0)+1; p.yaw=Math.atan2(-d.x,-d.z);
  if(p.spot){ const s=p.spot; s.peds=s.peds.filter(q=>q!==p); p.spot=null; } }
function bulletPlayer(dmg,shooter){ hitPlayer(dmg*1.5,shooter,'shot'); }
function bulletCar(v,shooter){ carDamage(v,shooter===player?9:2.5,shooter===player); if(shooter!==player||!v.ai||v===drive.v||v.type==='police'||v.fire) return; if(MR()<.45){ v.ai=null; v.speed=0; v.jacked=true; jackOut(v); } else { v.ai.wait=0; v.ai.ghost=1.5; } }
// gunshots empty the street around them
const PANIC={t:-9};
function shotsFired(x,z,mine){ if(T0-PANIC.t<.8) return; PANIC.t=T0; let seen=false;
  for(const p of peds){ if(p.state==='off'||p.cop||p.dealer) continue; const dd=Math.hypot(p.x-x,p.z-z); if(dd>80) continue; if(dd<70) seen=true;
    if(p.state==='walk'||p.state==='idle'||p.state==='spot'||p.state==='react'||p.state==='shop'||p.state==='tsell'||p.state==='fight'&&p.cast!=='areaboy'){
      if(p.spot){ const s=p.spot; s.peds=s.peds.filter(q=>q!==p); p.spot=null; } p.state='flee'; p.timer=mrr(6,10); p.atk=null; p.yaw=Math.atan2(p.x-x,p.z-z)+mrr(-.5,.5); p.phone=false; } }
  if(mine&&(seen||FIGHT.cop)){ const first=T0-(FIGHT.lastGun||-99)>12; FIGHT.lastGun=T0; addHeat(first?.85:.04); incident(x,z,'shooting');
    if(first&&sayT<=0){ sayT=4; toast(mpick(['"Gunshot! Everybody run!"','"Jesus! Dem dey shoot!"','"Hide! Hide!"']),2); } } }
// ---- your gun
const AIM={dir:new THREE.Vector3(0,0,1),pt:new THREE.Vector3(),t:-9,target:null};
const aimingNow=()=>gunOut()&&!FIGHT.ko&&(ARMS.aim||T0-ARMS.lastShot<1.4);
function camFwd(v){ return camera.getWorldDirection(v); }
// what the crosshair is on (a little help onto people near it: more on a touch screen)
const _af=new THREE.Vector3();
function crosshair(){ camFwd(_af); const o=camera.position, h=rayHit(o,_af,160,player); AIM.pt.copy(o).addScaledVector(_af,h.t);
  if(h.kind!=='ped'){ const lim=touchUI?.05:.02; let best=null, bc=Math.cos(lim);
    for(const p of peds){ if(p.state==='off'||p.state==='dead'||p.carried||p.dealer&&p.state==='dealer') continue; const ty=p.y+(p.state==='down'?.25:1.25), dx=p.x-o.x, dy=ty-o.y, dz=p.z-o.z, dd=Math.hypot(dx,dy,dz); if(dd>70||dd<1) continue;
      const c=(dx*_af.x+dy*_af.y+dz*_af.z)/dd; if(c>bc){ _wv2.set(dx/dd,dy/dd,dz/dd); if(rayDist(o,_wv2,dd)<dd-.5) continue; bc=c; best=p; AIM.pt.set(p.x,ty,p.z); } } }
  AIM.dir.set(AIM.pt.x-player.x,AIM.pt.y-(player.y+1.4),AIM.pt.z-player.z).normalize(); }
// on a phone (or firing without aiming) the gun picks the nearest threat in front of you
function autoTarget(){ let best=null, bs=1e9; const fx=Math.sin(player.yaw), fz=Math.cos(player.yaw);
  for(const p of peds){ if(p.state==='off'||p.state==='dead'||p.state==='down'||p.carried||p.dealer) continue; const dx=p.x-player.x, dz=p.z-player.z, d=Math.hypot(dx,dz); if(d>45||d<.5) continue;
    const c=(dx*fx+dz*fz)/d; if(c<.9||d>30) continue; const pri=(p.cop&&starCount()>0?0:p.state==='fight'?2:6)+d*.12+(1-c)*8; if(pri<bs){ const o=_wv.set(player.x,player.y+1.4,player.z), dd=_wv2.set(dx,p.y+1.3-o.y,dz).normalize(); if(rayDist(o,dd,d)<d-.4) continue; bs=pri; best=p; } }
  return best; }
function reload(){ if(ARMS.reloadT>0||ARMS.mag>=WEAPONS.ak.mag||ARMS.ammo<=0) return; ARMS.reloadT=1.7; burst(.08,900,.25,5); setTimeout(()=>burst(.06,1400,.3,6),900); }
function fireOnce(){ const L=ARMS.lib.ak; if(!L||!ARMS.held) return; ARMS.mag--; ARMS.fireT=WEAPONS.ak.rate; ARMS.recoil=1; ARMS.lastShot=T0; saveArms();
  const muzzle=L.muzzle.clone().applyMatrix4(ARMS.held.matrixWorld); let o, d;
  if(ARMS.aim){ o=muzzle.clone(); d=AIM.pt.clone().sub(o); if(d.lengthSq()<.04) camFwd(d); d.normalize(); }
  else { const t=AIM.target&&AIM.target.state!=='off'&&AIM.target.state!=='dead'?AIM.target:autoTarget(); AIM.target=t; o=muzzle.clone();
    d=t?new THREE.Vector3(t.x-o.x,t.y+(t.state==='down'?.25:1.25)-o.y,t.z-o.z).normalize():new THREE.Vector3(Math.sin(player.yaw),-.02,Math.cos(player.yaw)); }
  shoot(o,d,player,{dmg:WEAPONS.ak.dmg,spread:ARMS.aim?.014:.065,muzzle}); flash(muzzle); gunshot(1); shotsFired(player.x,player.z,true); camState.shake=Math.min(1,camState.shake+.06); if(ARMS.aim) camState.pitch=Math.max(-.6,camState.pitch-.005); }
function updateArms(dt){ ARMS.fireT-=dt; ARMS.recoil*=Math.exp(-14*dt); if(ARMS.pend&&!(hero&&hero.ov&&hero.ov.lock)) selectWeapon(ARMS.pend);   // chosen during a swing: switch when it ends
  if(ARMS.reloadT>0){ ARMS.reloadT-=dt; if(ARMS.reloadT<=0){ const n=Math.min(WEAPONS.ak.mag-ARMS.mag,ARMS.ammo); ARMS.mag+=n; ARMS.ammo-=n; saveArms(); } }
  if(!gunOut()){ ARMS.trig=false; return; }
  // where the gun points: the crosshair when aiming, else the target it picked, else straight ahead
  if(ARMS.aim){ if(!ARMS.aimOn){ ARMS.aimOn=true; ARMS.aimT=T0; } if(T0-ARMS.aimT<.4) camState.pitch+=(Math.min(camState.pitch,.03)-camState.pitch)*(1-Math.exp(-12*dt)); }   // raising the gun brings the view up level
  else ARMS.aimOn=false;
  if(ARMS.aim) crosshair(); else if(AIM.target&&AIM.target.state!=='off'&&T0-ARMS.lastShot<1.4){ const t=AIM.target; AIM.dir.set(t.x-player.x,t.y+1.25-(player.y+1.4),t.z-player.z).normalize(); }
  else AIM.dir.set(Math.sin(player.yaw),0,Math.cos(player.yaw));
  if(WEAPONS[ARMS.cur].throw){ if(ARMS.cur==='molo'&&ARMS.held&&MR()<dt*14){ const q=ARMS.held.localToWorld(_wv2.set(0,0,.2)); flame(q.x,q.y,q.z,.22); } if(ARMS.trig&&!FIGHT.ko&&!busy){ ARMS.trig=false; throwOnce(); } return; }   // a throw per press
  if(ARMS.trig&&ARMS.fireT<=0&&ARMS.reloadT<=0&&!FIGHT.ko&&!busy){ if(ARMS.mag>0) fireOnce(); else if(ARMS.ammo>0) reload(); else { ARMS.fireT=.4; burst(.03,2000,.2,8); if(sayT<=0){ sayT=3; toast('No bullets left. Oga Shege sells them.',2); } } } }
function selectWeapon(id){ if(!ARMS.own[id]||ARMS.cur===id){ ARMS.pend=null; return; } if(hero&&hero.ov&&hero.ov.lock){ ARMS.pend=id; return; } ARMS.pend=null; ARMS.cur=id; ARMS.aim=false; ARMS.trig=false; AIM.target=null; saveArms(); if(WEAPONS[id].file) loadWeapon(id); lastMode=null; weapHUD(true);
  toast(WEAPONS[id].name+(id==='ak'?` · ${ARMS.mag}/${ARMS.ammo}`:''),1.2); }
function cycleWeapon(){ const own=WEAP_ORDER.filter(k=>ARMS.own[k]); if(own.length<2){ toast('Only your fists. Buy weapons from Oga Shege (the black market on your map).',2.6); return; } selectWeapon(own[(own.indexOf(ARMS.cur)+1)%own.length]); }
function weapHUD(force){ const id=ARMS.cur, t=id==='ak'?`AK-47 ${ARMS.mag}/${ARMS.ammo}${ARMS.reloadT>0?' ·reload':''}`:WEAPONS[id].throw?`${WEAPONS[id].name} ×${ARMS.own[id]|0}`:WEAPONS[id].name; if(force||t!==ARMS.shownT){ ARMS.shownT=t; $('#weap').textContent=t; $('#weap').hidden=!started||mode==='interior'; }
  const g=WEAPONS[id].gun?'FIRE':WEAPONS[id].throw?'THROW':'ATTACK'; if(g!==ARMS.shownG||force){ ARMS.shownG=g; $('#tPunch').textContent=g; TB.k=null; }
  const x=gunOut()&&ARMS.aim; if($('#xhair').hidden===x) $('#xhair').hidden=!x; }

/* ================= fire, smoke and explosions =================
   Flames and smoke are soft dots drawn in two batches (one draw each), so a burning street costs little.
   Cars take damage from bullets, crashes and blasts: smoke from the bonnet, then fire, then a blast that leaves a burnt
   wreck (until you are far away). A blast throws people down or kills them, and the cars around catch. */
const PFX={sets:null,scale:400};
function pfxInit(){ if(PFX.sets) return PFX.sets;
  const [c,g]=cv(64,64), gr=g.createRadialGradient(32,32,1,32,32,31); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.35,'rgba(255,255,255,.75)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,64,64);
  const tex=new THREE.CanvasTexture(c);
  const VS='attribute float psize; attribute vec4 pcol; varying vec4 vC; uniform float scale; void main(){ vC=pcol; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=min(psize*scale/max(.2,-mv.z),480.); gl_Position=projectionMatrix*mv; }';
  const FS='uniform sampler2D map; varying vec4 vC; void main(){ vec4 t=texture2D(map,gl_PointCoord); gl_FragColor=vec4(vC.rgb*t.rgb,vC.a*t.a); if(gl_FragColor.a<.01) discard;\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}';
  const mk=(n,add)=>{ const geo=new THREE.BufferGeometry(), pos=new Float32Array(n*3), col=new Float32Array(n*4), size=new Float32Array(n);
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('pcol',new THREE.BufferAttribute(col,4).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('psize',new THREE.BufferAttribute(size,1).setUsage(THREE.DynamicDrawUsage)); geo.setDrawRange(0,0);
    const mat=new THREE.ShaderMaterial({uniforms:{map:{value:tex},scale:PFX.u||(PFX.u={value:400})},vertexShader:VS,fragmentShader:FS.replace('#include <tonemapping_fragment>',add?'':'#include <tonemapping_fragment>'),transparent:true,depthWrite:false,blending:add?THREE.AdditiveBlending:THREE.NormalBlending});
    const pts=new THREE.Points(geo,mat); pts.frustumCulled=false; pts.renderOrder=add?6:5; scene.add(pts); return {geo,pos,col,size,n,list:[],pts}; };
  return PFX.sets={smoke:mk(Q===QUAL.low?110:170,false),fire:mk(Q===QUAL.low?150:230,true)}; }
// one dot: where, how fast, how long, size from s0 to s1, colour (fire goes white-yellow, orange, red as it ages)
function emit(kind,x,y,z,vx,vy,vz,life,s0,s1,r,g,b,a){ const S=pfxInit()[kind]; if(S.list.length>=S.n) S.list.shift(); S.list.push({x,y,z,vx,vy,vz,t:0,life,s0,s1,r,g,b,a}); }
function flame(x,y,z,k=1){ emit('fire',x+mrr(-.25,.25)*k,y,z+mrr(-.25,.25)*k,mrr(-.3,.3),mrr(1.4,2.6)*k,mrr(-.3,.3),mrr(.5,.9),.8*k,.25*k,1,.62,.28,.85); }
function smokePuff(x,y,z,k=1,dark=.18){ emit('smoke',x+mrr(-.3,.3),y,z+mrr(-.3,.3),mrr(-.25,.25),mrr(.8,1.6),mrr(-.25,.25),mrr(2.2,3.6)*k,.6*k,2.6*k,dark,dark,dark*1.05,.45); }
function updatePFX(dt){ if(!PFX.sets) return; PFX.u.value=renderer.domElement.height/(2*Math.tan(camera.fov*Math.PI/360));
  for(const kind in PFX.sets){ const S=PFX.sets[kind], L=S.list, fire=kind==='fire'; let n=0;
    for(let i=L.length-1;i>=0;i--){ const p=L[i]; p.t+=dt; if(p.t>=p.life){ L.splice(i,1); continue; } }
    for(const p of L){ const k=p.t/p.life; p.vx*=1-dt*(fire?1.5:.6); p.vz*=1-dt*(fire?1.5:.6); p.vy=fire?p.vy+dt*.8:p.vy*(1-dt*.25); p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt; if(p.y<.05){ p.y=.05; p.vy=Math.abs(p.vy)*.2; }
      S.pos[n*3]=p.x; S.pos[n*3+1]=p.y; S.pos[n*3+2]=p.z; S.size[n]=p.s0+(p.s1-p.s0)*k;
      if(fire){ const h=1-k; S.col[n*4]=Math.min(1.6,p.r*(1.2*h+.6)); S.col[n*4+1]=p.g*h*h+.08; S.col[n*4+2]=p.b*h*h*h; S.col[n*4+3]=p.a*Math.min(1,(1-k)*1.6); }
      else { S.col[n*4]=p.r; S.col[n*4+1]=p.g; S.col[n*4+2]=p.b; S.col[n*4+3]=p.a*Math.min(1,k*6)*(1-k); }
      n++; }
    S.geo.setDrawRange(0,n); if(n){ S.geo.attributes.position.needsUpdate=true; S.geo.attributes.pcol.needsUpdate=true; S.geo.attributes.psize.needsUpdate=true; } } }
// the flash of a blast and the black mark it leaves on the ground
const BOOM={fl:[],sc:[],scI:0};
function boomFlash(x,y,z,k){ if(!BOOM.fl.length){ fxInit(); const map=FX.fl[0].s.material.map; for(let i=0;i<3;i++){ const s=new THREE.Sprite(new THREE.SpriteMaterial({map,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,fog:false,color:0xff9a4a})); s.visible=false; scene.add(s); BOOM.fl.push({s,t:9,k:1}); } }
  const F=BOOM.fl.find(f=>f.t>.5)||BOOM.fl[0]; F.s.position.set(x,y,z); F.t=0; F.k=k; F.s.visible=true; }
function scorch(x,z,r){ if(!BOOM.sc.length){ const [c,g]=cv(64,64), gr=g.createRadialGradient(32,32,2,32,32,31); gr.addColorStop(0,'rgba(8,6,5,.92)'); gr.addColorStop(.55,'rgba(14,11,9,.6)'); gr.addColorStop(1,'rgba(20,16,12,0)'); g.fillStyle=gr; g.fillRect(0,0,64,64);
    const mat=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}), geo=new THREE.PlaneGeometry(1,1); geo.rotateX(-Math.PI/2);
    for(let i=0;i<8;i++){ const m=new THREE.Mesh(geo,mat); m.visible=false; m.renderOrder=1; scene.add(m); BOOM.sc.push(m); } }
  const m=BOOM.sc[BOOM.scI++%BOOM.sc.length]; m.position.set(x,groundY(x,z)+.03,z); m.scale.set(r*2,1,r*2); m.rotation.y=MR()*6.28; m.visible=true; }
function updateBoom(dt){ for(const F of BOOM.fl){ if(!F.s.visible) continue; F.t+=dt; const k=F.t/.42; if(k>=1){ F.s.visible=false; continue; } F.s.scale.setScalar((2+k*9)*F.k); F.s.material.opacity=1-k; } }
function boomSound(d){ const v=clamp(1.15-d/140,.08,1); burst(1.6,70,1.1*v,1.4); burst(.5,700,.75*v,3.5); burst(.2,2600,.35*v,6); }
// a blast at (x,y,z): power 1 = a grenade, a car is a little more. byMe: you caused it (stars, money from the dead)
function explode(x,y,z,power=1,byMe=true){ const R=6.2*power;
  boomFlash(x,y+.6,z,power); scorch(x,z,1.6*power); boomSound(Math.hypot(x-camera.position.x,z-camera.position.z));
  for(let i=0;i<40*power;i++){ const a=MR()*6.28, s=mrr(1.5,6.5)*power; emit('fire',x+Math.cos(a)*.4,y+.3,z+Math.sin(a)*.4,Math.cos(a)*s,mrr(1.5,6.5)*power,Math.sin(a)*s,mrr(.45,1.1),mrr(1.8,3.2)*power,.6,1,.6,.25,1); }
  for(let i=0;i<18*power;i++){ const a=MR()*6.28, s=mrr(.5,2.5); emit('smoke',x+Math.cos(a)*.8,y+.5,z+Math.sin(a)*.8,Math.cos(a)*s,mrr(1.2,3),Math.sin(a)*s,mrr(3,5.5),1.6*power,5*power,.12,.11,.1,.6); }
  puff({x,y,z},18,null);
  const dc=Math.hypot(x-player.x,z-player.z); camState.shake=Math.min(1.6,camState.shake+Math.max(0,1.5-dc/25));
  for(const p of peds){ if(p.state==='off'||p.carried) continue; const dx=p.x-x, dz=p.z-z, d=Math.hypot(dx,dz); if(d>R) continue; const ux=dx/(d||1), uz=dz/(d||1);
    if(p.state==='dead'){ p.vx+=ux*3; p.vz+=uz*3; continue; }
    if(d<R*.45||p.hp!=null&&p.hp<35) killPed(p,ux,uz,7*(1-d/R)+2,byMe?'blast':'shot'); else { if(p.hp==null) p.hp=HP0(p.cast); p.hp-=60*(1-d/R); if(p.state==='down') continue; koPed(p,ux,uz,5*(1-d/R)+1.5); } }
  if(mode==='walk'&&!FIGHT.dead){ const d=Math.hypot(player.x-x,player.z-z); if(d<R){ const k=Math.pow(1-d/R,1.3); FIGHT.hp-=k*150; FIGHT.calmT=0; bleed(player.x,1.2,player.z,(player.x-x)/(d||1),(player.z-z)/(d||1),8,2);
      if(FIGHT.hp<=0) playerDie('blast'); else if(k>.25&&!FIGHT.ko&&hero){ FIGHT.ko=true; FIGHT.koT=0; carryDrop(true); heroDo('uppercut',{force:true,ts:1.2,onEnd:()=>heroDo('lie',{force:true,pause:true})}); } } }
  for(const v of vehicles){ const d=Math.hypot(v.x-x,v.z-z); if(d>R*1.3||v.wreck) continue; carDamage(v,140*(1-d/(R*1.3)),byMe); if(v.ai){ v.ai.wait=Math.max(v.ai.wait,2); }
    if(v===drive.v&&!FIGHT.dead){ FIGHT.hp-=60*(1-d/(R*1.3)); camState.shake=1.6; if(FIGHT.hp<=0) playerDie('blast'); } }
  shotsFired(x,z,byMe); if(byMe) addHeat(.5); }
// cars: damage, smoke, fire, blast, wreck
const WRECK_MATS=new Map();
function wreckMat(m){ let w=WRECK_MATS.get(m); if(!w){ w=new THREE.MeshStandardMaterial({map:m.map||null,color:0x2a2522,roughness:1,metalness:.05}); WRECK_MATS.set(m,w); } return w; }
function carDamage(v,amt,byMe=true){ if(!v||v.wreck||amt<=0) return; v.dmg=(v.dmg||0)+amt; if(byMe) v.byMe=true;
  if(v.dmg>=100&&!v.fire){ v.fire=T0; v.fireT=v===drive.v?mrr(5,7):mrr(3.5,6);   // it catches fire: everybody out
    if(v.ai&&v!==drive.v){ v.ai=null; v.speed=0; v.jacked=true; jackOut(v); }
    if(v===RIDE.v) cancelRide('Your ride caught fire. Book another one.');
    if(v===drive.v) toast(mpick(['Your motor don catch fire! Comot quick!','Fire! Jump out before e burst!']),3);
    else if(Math.hypot(v.x-player.x,v.z-player.z)<50&&sayT<=0){ sayT=4; toast(mpick(['"Fire! The motor go burst! Run!"','"Commot for there! E go explode!"']),2.4); } } }
function wreckCar(v){ v.wreck=true; v.fire=0; v.ai=null; v.speed=0; v.parked=true; v.jacked=true; v.wreckT=T0; v.taxi=false; if(v.copsOut){ v.copsOut=null; } if(v===FIGHT.cop) FIGHT.cop=null; COPS.extra=COPS.extra.filter(x=>x!==v);
  v.c.g.traverse(o=>{ if(o.isMesh&&o.material&&!o.userData.m0){ o.userData.m0=o.material; o.material=wreckMat(o.material); } }); }
function unwreck(v){ v.wreck=false; v.dmg=0; v.fire=0; v.byMe=false; v.out=false; v.c.g.traverse(o=>{ if(o.isMesh&&o.userData.m0){ o.material=o.userData.m0; o.userData.m0=null; } }); }
function blowCar(v){ const me=!!v.byMe; if(v===drive.v){ const inside=mode==='drive'; if(inside) exitCar(); wreckCar(v); explode(v.x,(v.y||0)+.8,v.z,1.2,me); if(inside&&!FIGHT.dead) playerDie('blast'); return; }
  wreckCar(v); explode(v.x,(v.y||0)+.8,v.z,1.2,me); if(me) addHeat(.6); }
function updateCars(dt){ const near=(x,z,r)=>Math.abs(x-camera.position.x)<r&&Math.abs(z-camera.position.z)<r;
  for(const v of vehicles){ if(!v.dmg) continue; const fx=Math.cos(v.h), fz=-Math.sin(v.h), ex=v.x+fx*v.c.def.L*.32, ez=v.z+fz*v.c.def.L*.32, ey=(v.y||0)+(v.c.def.H||1.4)*.75;
    if(v.wreck){ const a=T0-v.wreckT; if(near(v.x,v.z,140)){ if(a<7&&MR()<dt*22) flame(v.x+mrr(-.6,.6),ey,v.z+mrr(-.6,.6),1.2); if(a<40&&MR()<dt*(a<8?10:3)) smokePuff(v.x,ey+.3,v.z,1.3,.1); } continue; }
    if(v.fire){ if(near(v.x,v.z,160)){ if(MR()<dt*30) flame(ex,ey,ez,1+(T0-v.fire)/v.fireT); if(MR()<dt*8) smokePuff(ex,ey+.4,ez,1.1,.1); } if(T0-v.fire>v.fireT) blowCar(v); continue; }
    if(v.dmg>=55&&near(v.x,v.z,120)&&MR()<dt*(v.dmg>=80?9:4)) smokePuff(ex,ey,ez,.8,v.dmg>=80?.2:.45); } }

/* ================= grenades, petrol bombs and stones =================
   Thrown things fly in an arc, bounce off walls and the ground. A grenade goes off after two seconds; a petrol bomb
   breaks where it lands and the ground burns for a while: people in it catch fire and run, cars in it go up.
   (Area boys throw stones at a car that broke their rope.) */
const THROWN=[], FIRES=[];
function throwMesh(kind){ const g=new THREE.Group();
  if(kind==='gren'){ const b=new THREE.Mesh(new THREE.SphereGeometry(.05,10,8),new THREE.MeshStandardMaterial({color:0x3d4a2a,roughness:.7,metalness:.3})); b.scale.set(1,1.25,1); g.add(b);
    const top=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.04,8),new THREE.MeshStandardMaterial({color:0x8c8c8c,metalness:.7,roughness:.3})); top.position.y=.07; g.add(top); }
  else if(kind==='molo'){ const glass=new THREE.Mesh(new THREE.CylinderGeometry(.035,.04,.2,10),new THREE.MeshStandardMaterial({color:0x3a6b2a,roughness:.15,metalness:.1,transparent:true,opacity:.85})); g.add(glass);
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(.014,.03,.07,8),glass.material); neck.position.y=.13; g.add(neck);
    const rag=new THREE.Mesh(new THREE.BoxGeometry(.04,.06,.03),new THREE.MeshStandardMaterial({color:0xe8e0cc,roughness:1})); rag.position.y=.19; g.add(rag); g.userData.rag=rag; }
  else { const s=new THREE.Mesh(new THREE.DodecahedronGeometry(.07),new THREE.MeshStandardMaterial({color:0x6e665c,roughness:1})); g.add(s); }
  g.traverse(o=>{ if(o.isMesh) o.castShadow=true; }); return g; }
// launch speed to land on (tx,ty,tz) from o (the low arc), within reach
function lob(o,tx,ty,tz,sp){ const dx=tx-o.x, dz=tz-o.z, d=Math.max(.5,Math.hypot(dx,dz)), dy=ty-o.y, g=9.8, v2=sp*sp, disc=v2*v2-g*(g*d*d+2*dy*v2);
  let ang=disc>=0?Math.atan((v2-Math.sqrt(disc))/(g*d)):Math.PI/4; ang=clamp(ang,-.3,1.1); return {vx:dx/d*Math.cos(ang)*sp,vy:Math.sin(ang)*sp,vz:dz/d*Math.cos(ang)*sp}; }
function throwThing(kind,o,v,by){ const m=throwMesh(kind); m.position.copy(o); scene.add(m); THROWN.push({kind,m,x:o.x,y:o.y,z:o.z,vx:v.vx,vy:v.vy,vz:v.vz,t:0,by,bounces:0,spin:mrr(6,12)}); whoosh(); }
function updateThrown(dt){ for(let i=THROWN.length-1;i>=0;i--){ const T=THROWN[i]; T.t+=dt; const px=T.x, py=T.y, pz=T.z; T.vy-=9.8*dt; T.x+=T.vx*dt; T.y+=T.vy*dt; T.z+=T.vz*dt;
    T.m.position.set(T.x,T.y,T.z); T.m.rotation.x+=T.spin*dt; T.m.rotation.z+=T.spin*.6*dt;
    if(T.kind==='molo'&&MR()<dt*40) flame(T.x,T.y+.15,T.z,.35);
    let hit=null;
    // walls: the segment just travelled
    { const dx=T.x-px, dy=T.y-py, dz=T.z-pz, L=Math.hypot(dx,dy,dz); if(L>1e-4){ _cdv.set(dx/L,dy/L,dz/L); _co.set(px,py,pz); const t=rayDist(_co,_cdv,L); if(t<L-1e-3){ hit='wall'; T.x=px+_cdv.x*(t-.05); T.y=py+_cdv.y*(t-.05); T.z=pz+_cdv.z*(t-.05); } } }
    // cars and people
    if(!hit) for(const v of vehicles){ if(Math.abs(v.x-T.x)>4||Math.abs(v.z-T.z)>4) continue; const fx=Math.cos(v.h), fz=-Math.sin(v.h), rx=T.x-v.x, rz=T.z-v.z, D=v.c.def; if(Math.abs(rx*fx+rz*fz)<D.L/2&&Math.abs(-rx*fz+rz*fx)<D.W/2&&T.y<(v.y||0)+(D.H||1.5)){ hit=v; break; } }
    if(!hit&&T.kind!=='gren'){ if(T.by!==player&&mode==='walk'&&Math.hypot(T.x-player.x,T.z-player.z)<.45&&T.y>player.y&&T.y<player.y+1.8) hit='player';
      else for(const p of peds){ if(p===T.by||p.state==='off'||p.state==='dead'||p.carried) continue; if(Math.abs(p.x-T.x)<.4&&Math.abs(p.z-T.z)<.4&&T.y>p.y&&T.y<p.y+1.75){ hit=p; break; } } }
    const gy=walkY(T.x,T.z,0); if(!hit&&T.y<=gy+.06) hit='ground';
    if(hit){ if(T.kind==='molo'){ petrolFire(T.x,T.z,T.by===player); if(hit.c) carDamage(hit,40,T.by===player); else if(hit.cast) ignite(hit,T.by===player); burst(.25,1800,.4,5); scene.remove(T.m); THROWN.splice(i,1); continue; }
      if(T.kind==='stone'){ if(hit==='player') hitPlayer(6,T.by,'stone'); else if(hit.c){ clunk(.7); if(hit===drive.v){ camState.shake=Math.min(1,camState.shake+.25); carDamage(hit,3,false); } } else if(hit.cast&&hit!==T.by){ hurtPed(hit,6,'punch'); } if(hit!=='ground'&&hit!=='wall'||T.bounces>0){ scene.remove(T.m); THROWN.splice(i,1); continue; } }
      // bounce (grenades roll to a stop)
      T.bounces++; if(hit==='ground'){ T.y=gy+.06; T.vy=Math.abs(T.vy)*.32; T.vx*=.55; T.vz*=.55; if(Math.abs(T.vy)<.6) T.vy=0; } else { T.vx*=-.35; T.vz*=-.35; T.vy*=.5; } clunk(.15); }
    if(T.kind==='gren'&&T.t>2.3){ explode(T.x,T.y,T.z,1,T.by===player); scene.remove(T.m); THROWN.splice(i,1); continue; }
    if(T.t>8){ scene.remove(T.m); THROWN.splice(i,1); } } }
// a pool of burning petrol
function petrolFire(x,z,byMe){ FIRES.push({x,z,r:2.4,t:0,life:mrr(8,11),byMe}); scorch(x,z,1.8); for(let i=0;i<24;i++){ const a=MR()*6.28, s=mrr(1,3.5); emit('fire',x,walkY(x,z,0)+.2,z,Math.cos(a)*s,mrr(1,3),Math.sin(a)*s,mrr(.5,1),mrr(1,1.8),.3,1,.75,.35,1); }
  if(byMe){ addHeat(.5); incident(x,z,'fight'); } shotsFired(x,z,false); }
function ignite(p,byMe){ if(p.state==='off'||p.state==='dead') return; if(!(p.burnT>0)&&sayT<=0&&Math.hypot(p.x-player.x,p.z-player.z)<40){ sayT=3; toast(mpick(['"Fire! Fire! Help me!"','"Jesus! I dey burn!"','"Water! Somebody bring water!"']),2); }
  p.burnT=mrr(4,6); p.burnBy=byMe; if(p.spot){ const s=p.spot; s.peds=s.peds.filter(q=>q!==p); p.spot=null; }
  if(p.state!=='down'&&p.state!=='hurt'&&!p.cop){ p.state='flee'; p.timer=p.burnT; p.yaw=MR()*6.28; p.atk=null; } if(byMe) crime(p,1); }
function updateFires(dt){ for(let i=FIRES.length-1;i>=0;i--){ const F=FIRES[i]; F.t+=dt; if(F.t>F.life){ FIRES.splice(i,1); continue; } const k=Math.min(1,(F.life-F.t)/2), y=walkY(F.x,F.z,0)+.05;
    if(Math.abs(F.x-camera.position.x)<150&&Math.abs(F.z-camera.position.z)<150){ for(let n=0;n<5;n++) if(MR()<dt*18*k){ const a=MR()*6.28, r=Math.sqrt(MR())*F.r; flame(F.x+Math.cos(a)*r,y,F.z+Math.sin(a)*r,1+MR()*.7); } if(MR()<dt*3*k) smokePuff(F.x,y+1,F.z,1.2,.08); }
    for(const p of peds){ if(p.state==='off'||p.state==='dead'||p.carried||p.burnT>0) continue; if(Math.abs(p.x-F.x)<F.r&&Math.abs(p.z-F.z)<F.r&&Math.hypot(p.x-F.x,p.z-F.z)<F.r) ignite(p,F.byMe); }
    for(const v of vehicles){ if(!v.wreck&&Math.hypot(v.x-F.x,v.z-F.z)<F.r+v.c.def.W/2) carDamage(v,28*dt,F.byMe); }
    if(mode==='walk'&&!FIGHT.dead&&Math.hypot(player.x-F.x,player.z-F.z)<F.r){ FIGHT.burnT=Math.max(FIGHT.burnT||0,2.5); } }
  // people on fire: they run and scream, and burn down
  for(const p of peds){ if(!(p.burnT>0)||p.state==='off') continue; p.burnT-=dt; if(p.state==='dead'){ if(MR()<dt*10) flame(p.x,p.y+.3,p.z,.7); continue; }
    if(MR()<dt*24) flame(p.x+mrr(-.2,.2),p.y+mrr(.4,1.5),p.z+mrr(-.2,.2),.7); if(p.hp==null) p.hp=HP0(p.cast); p.hp-=22*dt; if(p.hp<=0){ killPed(p,0,0,.2,p.burnBy?'fire':'shot'); p.burnT=2; } }
  if(FIGHT.burnT>0&&!FIGHT.dead){ FIGHT.burnT-=dt; if(mode==='walk'){ if(MR()<dt*24) flame(player.x+mrr(-.2,.2),player.y+mrr(.3,1.5),player.z+mrr(-.2,.2),.7); FIGHT.hp-=14*dt; FIGHT.calmT=0; if(FIGHT.hp<=0) playerDie('fire'); else if(T0-(FIGHT.burnSaid||-9)>4){ FIGHT.burnSaid=T0; toast('You dey burn! Run comot!',1.6); } } else FIGHT.burnT=0; } }
// your throw: at the crosshair when aiming, else at the threat in front of you (or as far as a good throw goes)
function throwOnce(){ const id=ARMS.cur, n=ARMS.own[id]|0; if(n<=0||ARMS.fireT>0) return; ARMS.fireT=.9;
  heroDo('punch',{force:true,from:.05,to:.5,ts:1.4,atk:null});
  setTimeout(()=>{ if(mode!=='walk'||ARMS.cur!==id) return; const hand=hero&&boneOf(hero.cObj,/RightHand$/,ARMS.bones,'hand'), o=hand?hand.getWorldPosition(new THREE.Vector3()):new THREE.Vector3(player.x,player.y+1.6,player.z); o.y=Math.max(o.y,player.y+1.4);
    let tx, ty, tz; if(ARMS.aim){ crosshair(); tx=AIM.pt.x; ty=AIM.pt.y; tz=AIM.pt.z; } else { const t=autoTarget(); if(t){ tx=t.x; ty=t.y+.2; tz=t.z; } else { tx=player.x+Math.sin(player.yaw)*14; tz=player.z+Math.cos(player.yaw)*14; ty=walkY(tx,tz,0); } }
    const dd=Math.hypot(tx-o.x,tz-o.z); if(dd>26){ const k=26/dd; tx=o.x+(tx-o.x)*k; tz=o.z+(tz-o.z)*k; ty=walkY(tx,tz,0); }
    throwThing(id,o,lob(o,tx,ty,tz,16),player); ARMS.own[id]=(ARMS.own[id]|0)-1; if(ARMS.own[id]<=0){ delete ARMS.own[id]; ARMS.cur='fists'; ARMS.heldId=null; } saveArms(); weapHUD(true); },260); }

/* ================= the black market: Oga Shege's corner =================
   A man with a table on a side street a few minutes from your house sells a police baton, a katana, an AK-47 and its bullets. */
const DEALER={x:0,z:0,ry:0,ped:null,deadT:0,open:false,stall:null};
{ const main=ROADS.filter(e=>e.c>=6&&e.len>30&&!e.br), A=APT.front; let best=null;
  for(let t=0;t<400&&!best;t++){ const e=pick(main), A0=nodes[e.a], s=rr(8,e.len-8), sd=R()<.5?1:-1, o=e.hw+1.5, x=A0.x+e.fx*s-e.fz*o*sd, z=A0.z+e.fz*s+e.fx*o*sd, d=Math.hypot(x-A.x,z-A.z);
    if(d<170||d>330||resolveCircle({x,z},.8)||roadAt(x,z,.4)) continue; best={x,z,ry:Math.atan2(e.fz*sd,-e.fx*sd)}; }
  if(best){ Object.assign(DEALER,best); PLACES.push({name:'Oga Shege',sub:'Black market: weapons and bullets',kind:'shop',x:best.x,z:best.z});
    const g=new THREE.Group(), wood=new THREE.MeshStandardMaterial({color:0x6b4a2e,roughness:.8}), top=new THREE.Mesh(new THREE.BoxGeometry(1.4,.06,.7),wood); top.position.y=.8; g.add(top);
    for(const [lx,lz] of [[-.62,-.28],[.62,-.28],[-.62,.28],[.62,.28]]){ const l=new THREE.Mesh(new THREE.BoxGeometry(.06,.8,.06),wood); l.position.set(lx,.4,lz); g.add(l); }
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,2.3,6),new THREE.MeshStandardMaterial({color:0x888888})); pole.position.set(.5,1.15,0); g.add(pole);
    const um=new THREE.Mesh(new THREE.ConeGeometry(1.25,.5,10,1,true),new THREE.MeshStandardMaterial({color:0xc0392b,side:THREE.DoubleSide,roughness:.8})); um.position.set(.5,2.3,0); g.add(um);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.9,1.12,36),new THREE.MeshBasicMaterial({color:0xd0573e,transparent:true,opacity:.7,depthWrite:false,fog:false})); ring.rotation.x=-Math.PI/2; ring.position.set(0,.04,-1.1); g.add(ring);
    g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } }); const fx=Math.sin(best.ry), fz=Math.cos(best.ry);
    g.position.set(best.x+fx*.9,0,best.z+fz*.9); g.rotation.y=best.ry; scene.add(g); DEALER.stall=g;
    addCol({x0:g.position.x-.6,x1:g.position.x+.6,z0:g.position.z-.6,z1:g.position.z+.6,h:.85}); } }
// lay the goods on the table once the models are in
function dressStall(){ if(DEALER.dressed||!DEALER.stall) return; DEALER.dressed=true; Promise.all(['katana','ak','baton'].map(loadWeapon)).then(()=>{ const g=DEALER.stall;
  [['ak',[-.1,.86,-.05],[-Math.PI/2,0,Math.PI/2]],['katana',[.15,.86,.18],[-Math.PI/2,0,1.4]],['baton',[-.35,.86,.22],[-Math.PI/2,0,.4]]].forEach(([id,p,r])=>{ const w=cloneWeapon(id); if(!w) return; w.position.set(...p); w.rotation.set(...r); g.add(w); }); }); }
function updateDealer(dt){ if(!DEALER.stall||mode==='interior') return; const d=Math.hypot(player.x-DEALER.x,player.z-DEALER.z);
  if(d<90) dressStall();
  const p=DEALER.ped;
  if(p&&(p.state==='off'||p.state==='dead'||p.cast!=='areaboy')){ if(p.state==='dead') DEALER.deadT=T0+180; DEALER.ped=null; if(p.state!=='dead') p.dealer=false; return; }
  if(!p&&d<120&&T0>DEALER.deadT){ const q=freePed(); if(!q) return; wakePed(q,'areaboy'); Object.assign(q,{x:DEALER.x,z:DEALER.z,y:0,yaw:DEALER.ry,state:'dealer',speed:0,hp:150,dealer:true}); q.seq=(q.seq||0)+1; DEALER.ped=q; return; }
  if(!p) return;
  if(d>150){ offPed(p); p.dealer=false; DEALER.ped=null; return; }
  if(p.state==='walk'||p.state==='idle'){ p.state='dealer'; }   // back to his corner once things are calm
  if(p.state==='dealer'){ const back=Math.hypot(p.x-DEALER.x,p.z-DEALER.z); if(back>.6){ p.x+=(DEALER.x-p.x)*Math.min(1,dt*2); p.z+=(DEALER.z-p.z)*Math.min(1,dt*2); }
    p.yaw=lerpA(p.yaw,d<8?Math.atan2(player.x-p.x,player.z-p.z):DEALER.ry,Math.min(1,dt*3)); } }
const nearDealer=()=>!!DEALER.ped&&DEALER.ped.state==='dealer'&&mode==='walk'&&Math.hypot(player.x-DEALER.x,player.z-DEALER.z)<2.6;
function openShop(){ if(DEALER.open) return; DEALER.open=true; closePhone(); $('#settings').hidden=true; if(document.pointerLockElement) document.exitPointerLock(); shopUI(); $('#shop').hidden=false; lastPrompt=null;
  Promise.all(['baton','katana','ak'].map(loadWeapon)); if(sayT<=0){ sayT=4; toast(mpick(['"My guy, wetin you need? Everything dey."','"Oga, quick quick. Police dey around."','"Na original market. Cash only."']),2.4); } }
function closeShop(){ if(!DEALER.open) return; DEALER.open=false; $('#shop').hidden=true; lastPrompt=null; }
function shopUI(){ const b=$('#shopBody'); b.textContent=''; const el=(t,c,x)=>{ const e=document.createElement(t); if(c) e.className=c; if(x!=null) e.textContent=x; return e; };
  $('#shopCash').textContent='You have '+naira(CASH.n);
  const row=(name,sub,price,owned,buy)=>{ const r=el('div','sh-row'), t=el('span'); t.append(el('b',null,name),el('small',null,sub)); const btn=el('button','sh-buy',owned?'Yours':naira(price)); btn.type='button';
    btn.disabled=owned||CASH.n<price; if(!owned&&CASH.n<price) btn.title='Not enough money'; btn.addEventListener('click',()=>{ if(owned||CASH.n<price) return; addCash(-price); buy(); saveArms(); shopUI(); cashHUD(); }); r.append(t,btn); b.append(r); };
  row('Police baton','Hits hard, floors people',WEAPONS.baton.price,!!ARMS.own.baton,()=>{ ARMS.own.baton=1; selectWeapon('baton'); toast('"E go knock person well well."',2); });
  row('Katana','A long blade. People bleed and fall',WEAPONS.katana.price,!!ARMS.own.katana,()=>{ ARMS.own.katana=1; selectWeapon('katana'); toast('"This one sharp pass razor. Carry am well."',2.2); });
  row('AK-47','Rifle, comes with 30 bullets',WEAPONS.ak.price,!!ARMS.own.ak,()=>{ ARMS.own.ak=1; ARMS.mag=WEAPONS.ak.mag; selectWeapon('ak'); toast('"Na correct one be this. Police no go like am o."',2.4); });
  row(`Bullets ×${AMMO_PACK.n}`,ARMS.own.ak?`You have ${ARMS.mag+ARMS.ammo}`:'For the AK-47',AMMO_PACK.price,false,()=>{ ARMS.ammo+=AMMO_PACK.n; toast(`+${AMMO_PACK.n} bullets`,1.4); });
  b.querySelectorAll('.sh-buy').forEach((x,i)=>{ if(i===3&&!ARMS.own.ak){ x.disabled=true; x.textContent='Need AK'; } });
  for(const id of ['gren','molo']){ const W=WEAPONS[id]; row(`${W.name}s ×${W.pack}`,`You have ${ARMS.own[id]|0}. Aim, then throw`,W.price,false,()=>{ ARMS.own[id]=(ARMS.own[id]|0)+W.pack; selectWeapon(id); weapHUD(true); toast(id==='gren'?'"Pull the pin, throw am far. No hold am o!"':'"Light am, throw am. Na fire be dis."',2.4); }); } }

/* ================= police on foot =================
   A van that is after you stops when it gets close and the officers jump out. One or two stars: they run you down to arrest
   you (stand still next to them, or get beaten down with a baton, and you are BUSTED). Three stars and up they carry rifles
   and shoot. Four stars bring a second van, five a third, and roadblocks on the road ahead when you drive. Hit an officer
   and the stars climb; kill one and his rifle lies there for the taking. */
const COPS={list:[],extra:[],addT:0,cuffT:0,cuffSaid:-9,bust:false,block:null,blockT:20,near:1e9};
const isCopVan=v=>!!v&&(v===FIGHT.cop||COPS.extra.includes(v));
// a van back onto the street from wherever it stopped
function backOnRoad(v){ const [e]=nearestRoad(v.x,v.z,q=>q.drive); if(!e){ v.parked=true; return false; }
  const fx=Math.cos(v.h), fz=-Math.sin(v.h), fwd=fx*e.fx+fz*e.fz>=0||e.ow; const a=fwd?e.a:e.b, b=fwd?e.b:e.a, A0=nodes[e.a], t=clamp((v.x-A0.x)*e.fx+(v.z-A0.z)*e.fz,0,e.len);
  const seg=lineSeg(a,b), sg=clamp(fwd?t-(e.len-seg.len)/2:e.len-t-(e.len-seg.len)/2,0,seg.len); segPos(seg,sg,_sp);
  v.ai={a,b,s:sg,seg,na:-1,maxV:mrr(10,14),wait:1.5,ghost:3,stuck:0,cond:e.cond,ec:e.c}; v.parked=false; v.x=_sp.x; v.z=_sp.z; v.h=Math.atan2(-_sp.dz,_sp.dx); return true; }
// a door of the van (side -1 left, 1 right; back = how far behind the middle)
function vanDoor(v,side,back=0){ const fx=Math.cos(v.h), fz=-Math.sin(v.h), rx=Math.sin(v.h), rz=Math.cos(v.h), D=v.c.def, o=D.W/2+.6;
  return {x:v.x+fx*(D.L*.12-back)+rx*side*o,z:v.z+fz*(D.L*.12-back)+rz*side*o}; }
function makeCop(v,cast,x,z,st){ const q=freePed(); if(!q) return null; wakePed(q,cast); const c={x,z}; resolveCircle(c,.34);
  Object.assign(q,{x:c.x,z:c.z,y:groundY(c.x,c.z),yaw:Math.atan2(player.x-c.x,player.z-c.z),state:st,cop:1,van:v,cm:'chase',hp:HP0(cast),wid:starCount()>=3?'ak':'baton',fireT:mrr(.5,1.3),burst:0,atk:null,atkT:mrr(.3,.8),speed:0,losT:0,los:false,mad:0,near:false,aimOn:false,aimDir:new THREE.Vector3(0,0,1),recoil:0});
  q.seq=(q.seq||0)+1; return q; }
// out of the van: two officers (three from four stars)
function deployCops(v){ if(v.copsOut||!v.ai||mode==='interior') return false; const S=starCount(), n=S>=4?3:2, out=[];
  for(let i=0;i<n;i++){ const d=vanDoor(v,i%2?1:-1,i>1?v.c.def.L*.35:0), q=makeCop(v,'police_f',d.x,d.z,'cop'); if(q) out.push(q); }
  if(!out.length){ v.noCops=true; return false; }
  v.ai=null; v.parked=true; v.speed=0; v.copsOut=out; v.copT=T0;
  if(sayT<=0&&Math.hypot(v.x-player.x,v.z-player.z)<70){ sayT=4; toast(S>=3?mpick(['Police: "Drop am! Drop your weapon now!"','Police: "Na you we dey find! No move!"']):mpick(['Police: "Stop there! Hands up!"','Police: "Oya, stand there! No run!"']),2.6); }
  return true; }
// everyone back in: the van drives on (after you if it is still chasing)
function copsAboard(v){ v.copsOut=null; v.parked=false; if(!backOnRoad(v)) return; if(isCopVan(v)&&starCount()>0){ v.ai.chase=true; v.ai.maxV0=v.ai.maxV; v.ai.maxV=Math.max(15,v.ai.maxV*1.4); } }
function copDead(p){ const v=p.van; if(v&&v.copsOut){ v.copsOut=v.copsOut.filter(q=>q!==p); if(!v.copsOut.length){ v.copsOut=null; v.jacked=true; v.parked=true; if(v===FIGHT.cop) FIGHT.cop=null; COPS.extra=COPS.extra.filter(x=>x!==v); } }   // nobody left: the van stands there
  if(p.wid&&p.wid!=='fists') dropWeapon(p.x+mrr(-.5,.5),p.z+mrr(-.5,.5),p.wid); p.van=null; }
// the street walk of an officer: run, slide along walls, stay on land
function copMove(p,dx,dz,sp,dt){ p.speed+=(sp-p.speed)*Math.min(1,dt*5); if(p.speed<.05) return; let d=Math.hypot(dx,dz)||1; dx/=d; dz/=d;
  if(p.detT>0){ p.detT-=dt; const c=Math.cos(p.detA), s=Math.sin(p.detA), x=dx*c-dz*s; dz=dx*s+dz*c; dx=x; }   // round a wall
  for(const q of COPS.list){ if(q===p) continue; const ex=p.x-q.x, ez=p.z-q.z, e=Math.hypot(ex,ez); if(e<1.1&&e>.01){ dx+=ex/e*.9; dz+=ez/e*.9; } }   // spread out
  d=Math.hypot(dx,dz)||1; dx/=d; dz/=d;
  const c={x:p.x+dx*p.speed*dt,z:p.z+dz*p.speed*dt}; resolveCircle(c,.32);
  if(onLand(c.x,c.z)){ const moved=Math.hypot(c.x-p.x,c.z-p.z); p.x=c.x; p.z=c.z; p.stuckT=moved<p.speed*dt*.35?(p.stuckT||0)+dt:0; } else p.stuckT=(p.stuckT||0)+dt;
  if(p.stuckT>.7&&!(p.detT>0)){ p.detT=1.3; p.detA=(MR()<.5?1:-1)*1.25; p.stuckT=0; p.stuckN=(p.stuckN||0)+1; } }
const _co=new THREE.Vector3(), _cdv=new THREE.Vector3();
function copShoot(p,d){ const S=starCount(), L=ARMS.lib.ak, inCar=mode==='drive'&&drive.v, T=inCar?drive.v:player, ty=(inCar?(T.y||0)+1:player.y+1.2);
  if(p.wm&&L&&p.wm.parent===scene) _co.copy(L.muzzle).applyMatrix4(p.wm.matrixWorld); else _co.set(p.x,p.y+1.45,p.z);
  _cdv.set(T.x-_co.x,ty-_co.y,T.z-_co.z).normalize(); const fast=inCar?Math.min(.06,Math.abs(drive.speed)*.004):player.speed>3?.035:0;
  shoot(_co.clone(),_cdv,p,{dmg:S>=5?9:S>=4?8:6,spread:.024+d*.001+fast,range:90,muzzle:_co.clone()}); COPS.shots=(COPS.shots||0)+1; flash(_co); gunshot(clamp(1-d/110,.12,.9)); p.recoil=1; shotsFired(p.x,p.z,false); }
// one officer, every frame
function copPed(p,dt){ const S=starCount(), v=p.van, inCar=mode==='drive'&&drive.v, T=inCar?drive.v:player, dx=T.x-p.x, dz=T.z-p.z, d=Math.hypot(dx,dz);
  if(p.cast==='police_m'){ p.state='copguard'; return; }   // he keeps watch by the van
  p.wid=p.block||S>=3?'ak':'baton'; p.near=false; p.aimOn=false; p.recoil=(p.recoil||0)*Math.exp(-12*dt);
  if(p.block&&S>0&&mode!=='interior'&&!FIGHT.dead){ p.speed=0; p.aimOn=true; p.aimDir.set(dx,(inCar?(T.y||0)+1:player.y+1.2)-(p.y+1.4),dz).normalize(); p.yaw=lerpA(p.yaw,Math.atan2(dx,dz),Math.min(1,dt*6));   // a roadblock: they stay behind the van and shoot
    if((p.losT-=dt)<=0){ p.losT=.3; _co.set(p.x,p.y+1.45,p.z); _cdv.copy(p.aimDir); p.los=d<65&&rayDist(_co,_cdv,d)>=d-.6; }
    if(p.los&&(p.fireT-=dt)<=0){ if(p.burst>0){ p.burst--; p.fireT=.14; copShoot(p,d); } else { p.burst=3+Math.floor(MR()*3); p.fireT=mrr(.4,.9); } } return; }
  const carAway=inCar&&(S>=3?d>45:d>35||Math.abs(drive.speed)>7&&d>10);   // you drove off
  const lost=S===0||mode==='interior'||FIGHT.dead||COPS.bust||d>150||carAway;
  p.cm=lost?'back':'chase';
  if(p.cm==='back'){ p.atk=null;
    if(!v||v===drive.v||!v.copsOut){ p.van=null; if(S===0||d>60){ p.state='walk'; replanPed(p); } else copMove(p,-dx,-dz,1.4,dt); return; }   // no van to go back to
    const door=vanDoor(v,p.x-v.x>0?1:-1), ex=door.x-p.x, ez=door.z-p.z, e=Math.hypot(ex,ez);
    if(e<1.1){ v.copsOut=v.copsOut.filter(q=>q!==p); offPed(p); if(!v.copsOut.length) copsAboard(v); return; }
    copMove(p,ex,ez,S===0&&e<40?1.5:4.2,dt); p.yaw=lerpA(p.yaw,Math.atan2(ex,ez),Math.min(1,dt*8)); if((p.stuckN||0)>6){ v.copsOut=v.copsOut.filter(q=>q!==p); offPed(p); if(!v.copsOut.length) copsAboard(v); } return; }
  if((p.losT-=dt)<=0){ p.losT=.3; _co.set(p.x,p.y+1.45,p.z); _cdv.set(dx,(inCar?(T.y||0)+1:player.y+1.3)-_co.y,dz).normalize(); p.los=d<70&&rayDist(_co,_cdv,d)>=d-.6; }
  const face=Math.atan2(dx,dz);
  if(p.atk){ p.speed=0; p.atkTime+=dt; const mi=AI_INFO[p.atk], dur=durOf(p,p.atk)/mi.ts; p.yaw=lerpA(p.yaw,face,Math.min(1,dt*10));
    if(p.atkTime<dur*.3&&d>1) copMove(p,dx,dz,2.2,dt);
    for(let i=0;i<mi.hits.length;i++) if(!p.fired[i]&&p.atkTime>=mi.hits[i]*dur){ p.fired[i]=1; if(!inCar&&d<mi.reach+.35) hitPlayer(p.atk==='kick'?9:8,p,'baton'); else whoosh(); }
    if(p.atkTime>=dur){ p.atk=null; p.atkT=mrr(.5,1.1); } return; }
  if(p.wid==='ak'){   // rifles: get a clear line, stop, shoot in bursts
    p.aimDir.set(dx,(inCar?(T.y||0)+1:player.y+1.2)-(p.y+1.4),dz).normalize(); p.aimOn=true;
    if(!p.los||d>36){ copMove(p,dx,dz,d>8?4.4:2.2,dt); p.yaw=lerpA(p.yaw,face,Math.min(1,dt*8)); return; }
    copMove(p,dx,dz,d>14?1.2:0,dt); p.yaw=lerpA(p.yaw,face,Math.min(1,dt*9));
    if(Math.abs(Math.atan2(Math.sin(face-p.yaw),Math.cos(face-p.yaw)))<.35&&!FIGHT.dead&&(p.fireT-=dt)<=0){
      if(p.burst>0){ p.burst--; p.fireT=.14; copShoot(p,d); } else { p.burst=2+Math.floor(MR()*4); p.fireT=S>=4?mrr(.35,.85):mrr(.7,1.5); } }
    return; }
  // in your car: to your door, and they pull you out
  if(inCar){ const dr=doorOf(drive.v,1), ex=dr.x-p.x, ez=dr.z-p.z, e=Math.hypot(ex,ez); p.near=false;
    if(e>.9){ copMove(p,ex,ez,e>5?4.5:2,dt); p.yaw=lerpA(p.yaw,Math.atan2(ex,ez),Math.min(1,dt*9)); return; }
    p.speed=0; p.yaw=lerpA(p.yaw,face,Math.min(1,dt*9)); if(Math.abs(drive.speed)<2.5) COPS.pulling=true; return; }
  // batons: run you down; stand still and you are cuffed, fight back and you are beaten (one star: they only grab you)
  p.yaw=lerpA(p.yaw,face,Math.min(1,dt*9)); p.near=d<4;
  if(d>1.35){ copMove(p,dx,dz,d>5?4.5:2.4,dt); return; } p.speed=Math.max(0,p.speed-dt*8);
  const resist=p.mad||S>=2&&(T0-FIGHT.lastAtk<5||(player.speed>3.2&&(p.close=(p.close||0)+dt)>1.6))||FIGHT.hp<=0;
  if(FIGHT.ko&&!FIGHT.dead||!resist&&player.speed<3.2){ COPS.cuffing=true; return; }
  if(!resist) return;
  if((p.atkT-=dt)<=0&&!(hero&&hero.ov&&hero.ov.name==='takedown_a')){ p.atk=MR()<.75?'punch':'kick'; p.atkTime=0; p.fired=[]; p.seq=(p.seq||0)+1; p.close=0; } }
// officers at a raid: one walks to the scene and watches, the driver stands at his door
function copGuard(p,dt){ const v=p.van;
  if(v&&v===drive.v){ p.van=null; if(p.cast==='police_f'){ p.state='cop'; p.mad=1; } else { p.state='walk'; replanPed(p); } return; }
  if(!v||!RAID.v||v!==RAID.v||RAID.phase==='board'){ if(v&&v!==drive.v&&!v.ai){ const door=vanDoor(v,p.cast==='police_m'?-1:1), ex=door.x-p.x, ez=door.z-p.z, e=Math.hypot(ex,ez);
      if(e<1.1||(p.stuckN||0)>6){ offPed(p); return; } copMove(p,ex,ez,1.5,dt); p.yaw=lerpA(p.yaw,Math.atan2(ex,ez),Math.min(1,dt*8)); return; }
    offPed(p); return; }
  const tx=p.cast==='police_m'?vanDoor(v,-1).x:RAID.x+(p.gx||0), tz=p.cast==='police_m'?vanDoor(v,-1).z:RAID.z+(p.gz||0), ex=tx-p.x, ez=tz-p.z, e=Math.hypot(ex,ez);
  if(e>.8) { copMove(p,ex,ez,1.35,dt); p.yaw=lerpA(p.yaw,Math.atan2(ex,ez),Math.min(1,dt*6)); }
  else { p.speed=Math.max(0,p.speed-dt*4); p.yaw=lerpA(p.yaw,Math.atan2(RAID.x-p.x,RAID.z-p.z)+(p.cast==='police_m'?0:Math.atan2(player.x-p.x,player.z-p.z)-Math.atan2(RAID.x-p.x,RAID.z-p.z))*.5,Math.min(1,dt*3)); } }
function raidCops(v){ const d1=vanDoor(v,-1), d2=vanDoor(v,1); const a=makeCop(v,'police_m',d1.x,d1.z,'copguard'), b=makeCop(v,'police_f',d2.x,d2.z,'copguard');
  for(const q of [a,b]) if(q){ q.wid='baton'; const r=mrr(2.5,4), t=MR()*6.28; q.gx=Math.sin(t)*r; q.gz=Math.cos(t)*r; }
  RAID.cops=[a,b].filter(Boolean); }
// the weapon in an officer's hands (only when he has a real body near you)
function pedWeapon(p){ const b=p.body, id=(p.state==='cop'||p.state==='copguard')?p.wid:null;
  if(p.wm&&(p.wmB!==b||p.wmId!==id)){ if(p.wm.parent) p.wm.parent.remove(p.wm); p.wm=null; }
  if(!b||!id||id==='fists') return; if(!p.wm){ if(!ARMS.lib[id]){ loadWeapon(id); return; } p.wm=cloneWeapon(id); p.wmB=b; p.wmId=id; p.wc={}; }
  if(id!=='ak'){ const hand=boneOf(b.inner,/RightHand$/,p.wc,'hand'); if(hand) attachTo(p.wm,hand,holdOf(id)); return; }
  if(p.wm.parent!==scene){ if(p.wm.parent) p.wm.parent.remove(p.wm); scene.add(p.wm); p.wm.scale.setScalar(1); }
  if(p.aimOn) aimArms(b.inner,p.wc,p.wm,p.aimDir,p.recoil||0); else slingOn(p.wm,b.inner,p.wc,p.yaw); }
function dropPedWeapon(p){ if(p.wm){ if(p.wm.parent) p.wm.parent.remove(p.wm); p.wm=null; } if(p.phm){ if(p.phm.parent) p.phm.parent.remove(p.phm); PHONE_POOL.push(p.phm); p.phm=null; } }
// weapons on the ground: walk over them to take them
const PICKS=[];
function dropWeapon(x,z,id){ if(!ARMS.lib[id]||mode==='interior') return; const w=cloneWeapon(id); w.rotation.order='YXZ'; w.rotation.set(0,MR()*6.28,Math.PI/2); w.position.set(x,groundY(x,z)+.035,z); scene.add(w);
  PICKS.push({x,z,id,w,t:0}); if(PICKS.length>8){ const o=PICKS.shift(); scene.remove(o.w); } }
function updatePicks(dt){ for(let i=PICKS.length-1;i>=0;i--){ const k=PICKS[i]; k.t+=dt; let take=false;
    if(mode==='walk'&&!FIGHT.ko&&Math.hypot(player.x-k.x,player.z-k.z)<1.1){
      if(k.id==='ak'){ if(!ARMS.own.ak){ ARMS.own.ak=1; ARMS.mag=Math.max(ARMS.mag,20); toast('You took the officer\'s AK-47 (20 bullets). 4 to use it.',2.6); } else { ARMS.ammo+=20; toast('+20 bullets',1.4); } take=true; }
      else if(k.id==='baton'&&!ARMS.own.baton){ ARMS.own.baton=1; toast('You took a police baton. 2 to use it.',2.2); take=true; }
      if(take){ saveArms(); weapHUD(true); } }
    if(take||k.t>150){ scene.remove(k.w); PICKS.splice(i,1); } } }
// pulled out of your car by the police, then cuffed
function copPullOut(){ if(mode!=='drive'||!drive.v||busy||COPS.bust) return; const v=drive.v; drive.speed=0; v.speed=0;
  toast(mpick(['Police: "Come down! Come down from that motor!"','Police: "Oya, comot for the motor now!"']),2.4); exitCar(); if(mode==='walk') busted(); }
// busted: the cuffs go on
function busted(){ if(COPS.bust||FIGHT.dead||busy) return; const down=FIGHT.ko; COPS.bust=true; FIGHT.ko=true; player.speed=0; ARMS.aim=false; ARMS.trig=false; carryDrop(true); bigMsg('BUSTED','busted');
  if(!down&&hero&&hero.act.hands_up&&mode==='walk') heroDo('hands_up',{force:true,pause:true});
  toast(mpick(['Police: "You don finish! Enter motor!"','Police: "Oya, hands for back! You dey under arrest."']),2.6);
  setTimeout(()=>{ COPS.bust=false; arrest(); },2200); }
function bigMsg(t,cls){ const e=$('#big'); e.textContent=t; e.className='big '+cls; e.hidden=false; clearTimeout(bigMsg.t); bigMsg.t=setTimeout(()=>{ e.hidden=true; },3600); }
// a roadblock: a van across the road ahead of you, officers behind it with rifles
function roadblock(){ const v0=drive.v; if(!v0||COPS.block) return; const fx=Math.cos(v0.h), fz=-Math.sin(v0.h); let best=null, bc=.93;
  for(const n of nodes){ const dx=n.x-v0.x, dz=n.z-v0.z, d=Math.hypot(dx,dz); if(d<90||d>170||!n.out.length) continue; const c=(dx*fx+dz*fz)/d; if(c>bc){ bc=c; best=n; } }
  if(!best) return; const van=vehicles.find(v=>v.type==='police'&&!v.ai&&v!==drive.v&&!v.jacked&&!v.raid&&!v.copsOut&&v!==RAID.v); if(!van) return;
  const ax=best.x-v0.x, az=best.z-v0.z, al=Math.hypot(ax,az), ux=ax/al, uz=az/al;
  Object.assign(van,{x:best.x,z:best.z,y:groundY(best.x,best.z),h:Math.atan2(-ux,-uz)+Math.PI/2,speed:0,ai:null,parked:true,block:true}); van.c.g.visible=true;
  const cops=[]; for(const s of [-1,1]){ const q=makeCop(van,'police_f',best.x+ux*2.6+uz*s*1.8,best.z+uz*2.6-ux*s*1.8,'cop'); if(q){ q.wid='ak'; q.block=1; cops.push(q); } }
  van.copsOut=cops; COPS.block={v:van,t:T0}; }
function updateBlock(dt,S){ const B=COPS.block;
  if(!B){ if(S>=5&&mode==='drive'&&drive.v&&Math.abs(drive.speed)>6&&(COPS.blockT-=dt)<=0){ COPS.blockT=mrr(25,40); roadblock(); } return; }
  const v=B.v, d=Math.hypot(v.x-player.x,v.z-player.z);
  if(d>200||T0-B.t>90||v===drive.v){ COPS.block=null; v.block=false; if(v.copsOut){ for(const q of v.copsOut) if(q.state!=='dead') offPed(q); v.copsOut=null; } if(v!==drive.v){ v.jacked=true; v.parked=true; } } }
// after an arrest or a death: the officers get back in and the vans drive off
function clearCops(){ for(const p of peds) if(p.cop&&(p.state==='cop'||p.state==='copguard')) offPed(p);
  for(const v of vehicles) if(v.copsOut&&v!==drive.v){ v.copsOut=null; if(v.block){ v.block=false; v.jacked=true; } else { v.parked=false; backOnRoad(v); } }
  COPS.extra=[]; COPS.block=null; COPS.cuffT=0; }
// every frame: which vans are after you, officers out when they get close
function updateCops(dt){ const S=starCount(); COPS.cuffing=false; COPS.pulling=false; COPS.near=1e9; COPS.list=peds.filter(p=>p.cop&&(p.state==='cop'||p.state==='copguard'));
  for(const p of peds){ if(!p.cop||p.state==='off') continue; if(p.state==='dead'){ if(p.van||p.wid) { copDead(p); p.wid=null; } continue; }
    if(p.state==='cop') copPed(p,dt); else if(p.state==='copguard') copGuard(p,dt);
    if(p.state!=='off'&&p.state!=='walk') COPS.near=Math.min(COPS.near,Math.hypot(p.x-player.x,p.z-player.z)); }
  if(COPS.cuffing&&!COPS.bust){ if(COPS.cuffT===0&&T0-COPS.cuffSaid>6){ COPS.cuffSaid=T0; toast(mpick(['Police: "Hands up! No try am!"','Police: "Stand there! You dey under arrest!"']),2); } COPS.cuffT+=dt; if(COPS.cuffT>1.7) busted(); }
  else COPS.cuffT=Math.max(0,COPS.cuffT-dt*2);
  if(COPS.pulling&&!COPS.bust){ COPS.pullT=(COPS.pullT||0)+dt; if(COPS.pullT>.9){ COPS.pullT=0; copPullOut(); } } else COPS.pullT=0;
  // more vans as the stars go up
  const want=mode==='interior'?0:S>=5?2:S>=4?1:0;
  COPS.extra=COPS.extra.filter(v=>v.type==='police'&&v!==drive.v&&(v.copsOut||v.ai&&v.ai.chase));
  while(COPS.extra.length>want){ const v=COPS.extra.pop(); if(v.ai){ v.ai.chase=false; if(v.ai.maxV0) v.ai.maxV=v.ai.maxV0; } }
  if(COPS.extra.length<want&&(COPS.addT-=dt)<=0){ COPS.addT=5; const v=dispatchCop(); if(v) COPS.extra.push(v); }
  for(const v of [FIGHT.cop,...COPS.extra]){ if(!v||v.copsOut||!v.ai||busy) continue;
    if(mode==='drive'&&drive.v){ const d=Math.hypot(v.x-drive.v.x,v.z-drive.v.z); v.slowP=Math.abs(drive.speed)<2.5&&d<60?(v.slowP||0)+dt:0; let far=false;   // you stopped: they come for you
      if(v.slowP>.5&&d<60&&v.ai.chase){ const D=goalField(chaseGoal()), fx=Math.cos(v.h), fz=-Math.sin(v.h); far=D[v.ai.b]>d*2.5+40||(drive.v.x-v.x)*fx+(drive.v.z-v.z)*fz<-4; }
      if(v.slowP>1&&(d<24||far)) deployCops(v); continue; }
    if(mode!=='walk') continue; const d=Math.hypot(v.x-player.x,v.z-player.z);
    v.slowFor=Math.abs(v.speed)<1.2?(v.slowFor||0)+dt:0; let far=false;
    if(d<70&&v.ai.chase){ const D=goalField(chaseGoal()), fx=Math.cos(v.h), fz=-Math.sin(v.h); far=D[v.ai.b]>d*2.5+40||(player.x-v.x)*fx+(player.z-v.z)*fz<-4; }   // close, but the way round by road is long (or you are behind them): they stop and run
    if(d<30||far||(d<55&&v.slowFor>1.5)||(d<110&&v.slowFor>6)) deployCops(v); }
  updateBlock(dt,S); }

/* ================= rope toll: area boys block a street with a rope =================
   On some side streets two area boys hold a rope across the road: ₦200 to pass (E). Cars that pay go through;
   walk past without paying and they fight you (their friends join); drive through and the rope breaks: they chase
   you, throwing stones, then give up and tie it again. */
const TOLLS=[], TOLL_FEE=200;
{ const cand=ROADS.filter(e=>e.drive&&!e.br&&e.c>=6&&e.len>=26&&e.hw<=5.5), avoid=[APT.front,{x:DEALER.x,z:DEALER.z},STATION.front];
  if(HOTEL_SITE) avoid.push(HOTEL_SITE);
  for(let t=0;t<900&&TOLLS.length<16&&cand.length;t++){ const e=pick(cand), A=nodes[e.a], m=e.len*rr(.35,.65), x=A.x+e.fx*m, z=A.z+e.fz*m;
    if(avoid.some(o=>Math.hypot(o.x-x,o.z-z)<170)||TOLLS.some(g=>Math.hypot(g.x-x,g.z-z)<280)) continue;
    TOLLS.push({x,z,fx:e.fx,fz:e.fz,rx:-e.fz,rz:e.fx,hw:e.hw,st:'up',t:0,boys:[],rope:null,sign:null,on:false,prevS:null,brokeT:-99}); } }
const ropeMat=new THREE.MeshStandardMaterial({color:0xd9b26a,roughness:.9});
function tollRope(g){ if(g.rope) return; const w=g.hw+.55, pts=[]; for(let i=0;i<=8;i++){ const u=i/8*2-1; pts.push(new THREE.Vector3(g.rx*w*u,1.02-.38*(1-u*u),g.rz*w*u)); }
  const m=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),24,.02,5,false),ropeMat); m.castShadow=true; m.position.set(g.x,groundY(g.x,g.z),g.z); g.rope=m;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:texLabel('₦200 TO PASS','#F2B705','#0E1014',768,160),fog:false})); sp.scale.set(1.5,.31,1); sp.position.set(0,1.75,0); m.add(sp); g.sign=sp; }
function tollOn(g){ g.on=true; g.st='up'; g.prevS=null; tollRope(g); scene.add(g.rope); g.rope.visible=true; g.rope.position.y=groundY(g.x,g.z); g.boys=[];
  for(const s of [-1,1]){ const q=freePed(); if(!q) break; wakePed(q,'areaboy'); const bx=g.x+g.rx*s*(g.hw+.9), bz=g.z+g.rz*s*(g.hw+.9);
    Object.assign(q,{x:bx,z:bz,y:groundY(bx,bz),yaw:Math.atan2(-g.rx*s,-g.rz*s),state:'toll',toll:g,post:{x:bx,z:bz,ry:Math.atan2(-g.rx*s,-g.rz*s)},speed:0,tact:'idle_1'}); q.seq=(q.seq||0)+1; g.boys.push(q); } }
function tollOff(g){ g.on=false; if(g.rope) g.rope.visible=false; for(const q of g.boys) if(q.toll===g&&(q.state==='toll'||q.state==='tollchase')) offPed(q); g.boys=[]; }
const tollBoys=g=>g.boys.filter(q=>q.toll===g&&q.state==='toll'&&Math.hypot(q.x-q.post.x,q.z-q.post.z)<1.5);
function nearToll(){ const f=mode==='drive'&&drive.v?drive.v:player; if(mode!=='walk'&&mode!=='drive') return null;
  for(const g of TOLLS){ if(!g.on||g.st!=='up'||!tollBoys(g).length) continue; const dx=f.x-g.x, dz=f.z-g.z, s=dx*g.fx+dz*g.fz, l=Math.abs(dx*g.rx+dz*g.rz); if(Math.abs(s)<(mode==='drive'?8:4)&&l<g.hw+1.5) return g; } return null; }
function payToll(g){ if(CASH.n<TOLL_FEE){ toast('"No money? Then go back where you come from!"',2.4); return; } addCash(-TOLL_FEE); g.st='down'; g.t=12; g.paid=true;
  toast(mpick(['"Thank you boss! Pass!"','"Correct person! Oya pass."','"Na so! God bless you, oga."']),2.2); for(const q of g.boys) q.tact='talk'; }
function tollAngry(g,car){ const bs=g.boys.filter(q=>q.toll===g&&(q.state==='toll'||q.state==='tollchase'));
  if(car){ g.st='broken'; g.brokeT=T0; if(g.rope) g.rope.visible=false; for(const q of bs){ q.state='tollchase'; q.chaseT=0; q.stoneT=mrr(.6,1.2); q.speed=0; q.seq=(q.seq||0)+1; }
    toast(mpick(['"Hey! You don break our rope! Catch am!"','"Thief! You no go pay?! Stone am!"']),2.6); }
  else { for(const q of bs){ q.state='fight'; q.atk=null; q.atkT=mrr(.3,.9); q.toll=null; } toast(mpick(['"You no go pay? You wan try us?!"','"Who you be? Pay or fight!"']),2.4); if(bs[0]) provoke(bs[0]); } }
function updateTolls(dt){ if(mode==='interior') return; const f=mode==='drive'&&drive.v?drive.v:player;
  for(const g of TOLLS){ const d=Math.hypot(f.x-g.x,f.z-g.z);
    if(!g.on){ if(d<120&&T0-g.brokeT>25) tollOn(g); continue; }
    if(d>165){ tollOff(g); continue; }
    if(g.st==='down'&&(g.t-=dt)<=0){ g.st='up'; g.paid=false; for(const q of g.boys) q.tact='idle_1'; }
    if(g.st==='broken'&&T0-g.brokeT>25&&tollBoys(g).length){ g.st='up'; if(g.rope) g.rope.visible=true; }
    if(g.rope){ const held=tollBoys(g).length>0, y0=groundY(g.x,g.z); g.rope.visible=g.st!=='broken'&&held; const ty=y0+(g.st==='down'?-.97:0); g.rope.position.y+=(ty-g.rope.position.y)*Math.min(1,dt*4); g.sign.visible=g.st==='up'; }
    // traffic pays and passes
    if(g.st==='up') for(const v of vehicles){ if(!v.ai||Math.abs(v.x-g.x)>10||Math.abs(v.z-g.z)>10) continue; if(Math.hypot(v.x-g.x,v.z-g.z)<9){ g.st='down'; g.t=3; break; } }
    // you: across the rope without paying?
    const dx=f.x-g.x, dz=f.z-g.z, s=dx*g.fx+dz*g.fz, l=Math.abs(dx*g.rx+dz*g.rz);
    if(l<g.hw+1.3&&g.prevS!==null&&Math.sign(s)!==Math.sign(g.prevS)&&Math.abs(s)<7&&g.st==='up'&&tollBoys(g).length) tollAngry(g,mode==='drive');
    g.prevS=l<g.hw+3?s:null;
    for(const q of g.boys){ if(q.toll!==g) continue;
      if(q.state==='toll'){ const e=Math.hypot(q.x-q.post.x,q.z-q.post.z); if(e>.5){ copMove(q,q.post.x-q.x,q.post.z-q.z,e>3?3.5:1.3,dt); q.yaw=lerpA(q.yaw,Math.atan2(q.post.x-q.x,q.post.z-q.z),Math.min(1,dt*8)); continue; }
        q.speed=0; const near=d<16&&g.st==='up'; q.tact=near?'hail':g.st==='down'&&g.paid?'talk':'idle_1'; q.yaw=lerpA(q.yaw,near?Math.atan2(f.x-q.x,f.z-q.z):q.post.ry,Math.min(1,dt*4)); }
      else if(q.state==='tollchase'){ q.chaseT+=dt; const ex=f.x-q.x, ez=f.z-q.z, e=Math.hypot(ex,ez);
        if(mode==='walk'&&e<8){ q.state='fight'; q.atk=null; q.atkT=.4; q.toll=null; continue; }   // you came out of the car
        if(q.chaseT>14||e>45){ q.state='toll'; continue; }   // they give up and go back to their rope
        q.yaw=lerpA(q.yaw,Math.atan2(ex,ez),Math.min(1,dt*8)); copMove(q,ex,ez,e>10?4.6:1.5,dt);
        if((q.stoneT-=dt)<=0&&e<24){ q.stoneT=mrr(1.1,2); q.speed=0; const o=new THREE.Vector3(q.x,q.y+1.6,q.z), tv=lob(o,f.x+mrr(-.6,.6),(f.y||0)+1,f.z+mrr(-.6,.6),15); throwThing('stone',o,tv,q);
          if(sayT<=0){ sayT=3; toast(mpick(['"Stone am! Stone am!"','"Come back here!"','"You go pay for that rope!"']),1.8); } } } } } }

/* ================= Eko Grand Hotel: walk in to the lounge bar =================
   The office tower nearest your house is the hotel. Its lounge (assets/models/hotel_bar.glb) loads the first time you come
   near, so nobody downloads it unless they visit. Inside: tables, a stage and the bar, with a few guests. */
const HOTEL={ready:false,loading:null,place:null,door:null,label:'Eko Grand Hotel',camDist:3,guests:[]};
{ if(HOTEL_SITE){ const best={name:'Eko Grand Hotel',sub:'Hotel and lounge bar',kind:'place',x:HOTEL_SITE.x,z:HOTEL_SITE.z}; PLACES.push(best); HOTEL.place=best;
    HOTEL.door={...HOTEL_SITE.door};
    const d=HOTEL.door, lab=new THREE.Sprite(new THREE.SpriteMaterial({map:texLabel('EKO GRAND HOTEL','#6b1f2a','#F7EFDF'),fog:false})); lab.scale.set(6,1.15,1); lab.position.set(d.x,SLAB+4.6,d.z); lab.layers.set(1); scene.add(lab);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.9,1.15,40),new THREE.MeshBasicMaterial({color:0xF2B705,transparent:true,opacity:.7,depthWrite:false,fog:false})); ring.rotation.x=-Math.PI/2; ring.position.set(d.x,groundY(d.x,d.z)+.04,d.z); ring.layers.set(1); scene.add(ring); HOTEL.ring=ring; } }
const nearHotel=()=>!!HOTEL.door&&Math.hypot(player.x-HOTEL.door.x,player.z-HOTEL.door.z)<2.2;
function loadHotel(){ if(!HOTEL.loading){ const u=murl('hotel_bar'); DL.exp[u]=MANIFEST['assets/models/hotel_bar.glb']||3500000;
    HOTEL.loading=fetchBuf(u).then(b=>GLL.parseAsync(b,'')).then(g=>{ buildHotel(g); HOTEL.ready=true; }); HOTEL.loading.catch(e=>{ console.warn('hotel failed',e); HOTEL.loading=null; }); }
  return HOTEL.loading; }
function buildHotel(g){ const S=new THREE.Scene(); S.background=new THREE.Color(0x120c08);
  const envRT=pmrem.fromScene(new RoomEnvironment(),.04); S.environment=envRT.texture; S.environmentIntensity=.55;
  S.add(new THREE.HemisphereLight(0xffe2bd,0x2a1a10,1.1)); const key=new THREE.DirectionalLight(0xffd9a8,1.4); key.position.set(4,12,8); S.add(key);
  const mesh=meshOf(g), geo=floatGeo(mesh.geometry.clone()); geo.applyMatrix4(mesh.matrixWorld); geo.computeBoundingBox();   // plain floats (the file is packed)
  let bb=geo.boundingBox, k=22/(bb.max.x-bb.min.x); geo.scale(k,k,k); geo.computeBoundingBox(); bb=geo.boundingBox;
  // the floor: the biggest flat, upward-facing level near the bottom (the underside of the base faces down)
  const P=geo.attributes.position, I=geo.index, nT=I.count/3, hist=new Map(), a=new THREE.Vector3(), b=new THREE.Vector3(), c=new THREE.Vector3(), n=new THREE.Vector3(), H=bb.max.y-bb.min.y;
  for(let t=0;t<nT;t++){ a.fromBufferAttribute(P,I.getX(t*3)); b.fromBufferAttribute(P,I.getX(t*3+1)); c.fromBufferAttribute(P,I.getX(t*3+2)); n.subVectors(b,a).cross(_fv.subVectors(c,a)); const ar=n.length()/2; if(ar<1e-6) continue; n.normalize();
    if(n.y<.9) continue; const y=(a.y+b.y+c.y)/3; if(y>bb.min.y+H*.3) continue; const key2=Math.round(y/.05); hist.set(key2,(hist.get(key2)||0)+ar); }
  let floor=bb.min.y, top=0; for(const [kk,v] of hist) if(v>top){ top=v; floor=kk*.05; }
  geo.translate(-(bb.min.x+bb.max.x)/2,-floor,-(bb.min.z+bb.max.z)/2); geo.computeBoundingBox(); bb=geo.boundingBox; geo.computeBoundingSphere();
  const mat=mesh.material; if(mat.map){ mat.map.colorSpace=THREE.SRGBColorSpace; mat.map.anisotropy=Math.min(4,maxAniso); } mat.side=THREE.DoubleSide; mat.roughness=.8; mat.metalness=.05;
  const room=new THREE.Mesh(geo,mat); room.receiveShadow=true; S.add(room);
  const W=bb.max.x-bb.min.x, D=bb.max.z-bb.min.z, top2=bb.max.y; const x0=bb.min.x, z0=bb.min.z;
  // the open front gets a wall with the door, and a dark ceiling closes the top
  const wallM=new THREE.MeshStandardMaterial({color:0x3a2418,roughness:.85}); const fz=bb.max.z+.1;
  for(const [cx,w] of [[-(W/4+.75),W/2-1.5],[W/4+.75,W/2-1.5]]){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,top2,.25),wallM); m.position.set(cx,top2/2,fz); S.add(m); }
  { const m=new THREE.Mesh(new THREE.BoxGeometry(3,top2-2.6,.25),wallM); m.position.set(0,2.6+(top2-2.6)/2,fz); S.add(m); }
  { const m=new THREE.Mesh(new THREE.PlaneGeometry(W,D),new THREE.MeshStandardMaterial({color:0x1d130d,roughness:.9,side:THREE.DoubleSide})); m.rotation.x=Math.PI/2; m.position.set(0,top2,0); S.add(m); }
  { const sign=new THREE.Sprite(new THREE.SpriteMaterial({map:texLabel('EXIT · MUSHIN','#16A06B','#ffffff'),fog:false})); sign.scale.set(2.2,.42,1); sign.position.set(0,2.95,fz-.2); S.add(sign); }
  // where you can walk: anything between knee and head height blocks a 25 cm cell
  const CS=.25, gw=Math.ceil(W/CS)+1, gd=Math.ceil(D/CS)+1, grid=new Uint8Array(gw*gd);
  for(let t=0;t<nT;t++){ a.fromBufferAttribute(P,I.getX(t*3)); b.fromBufferAttribute(P,I.getX(t*3+1)); c.fromBufferAttribute(P,I.getX(t*3+2));
    const y0=Math.min(a.y,b.y,c.y), y1=Math.max(a.y,b.y,c.y); if(y1<.3||y0>1.7) continue;
    const i0=Math.max(0,Math.floor((Math.min(a.x,b.x,c.x)-x0)/CS)), i1=Math.min(gw-1,Math.floor((Math.max(a.x,b.x,c.x)-x0)/CS)), j0=Math.max(0,Math.floor((Math.min(a.z,b.z,c.z)-z0)/CS)), j1=Math.min(gd-1,Math.floor((Math.max(a.z,b.z,c.z)-z0)/CS));
    if((i1-i0)*(j1-j0)>400) continue; for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++) grid[j*gw+i]=1; }
  const cell=(x,z)=>{ const i=Math.floor((x-x0)/CS), j=Math.floor((z-z0)/CS); return i<1||j<1||i>=gw-1||j>=gd-1?1:grid[j*gw+i]; };
  const free=(x,z,r=.28)=>!cell(x-r,z)&&!cell(x+r,z)&&!cell(x,z-r)&&!cell(x,z+r)&&!cell(x,z);
  // way in: the free spot nearest the front door
  let spawn={x:0,z:bb.max.z-1.2}; for(let s=0;s<60&&!free(spawn.x,spawn.z,.4);s++) spawn.z-=.25;
  Object.assign(HOTEL,{scene:S,free,spawn,grid:{grid,gw,gd,x0,z0,CS},exit:{x:spawn.x,z:spawn.z},floor:0,bounds:{x0:bb.min.x+.3,x1:bb.max.x-.3,z0:bb.min.z+.3,z1:bb.max.z-.3},cam:{x0:bb.min.x+.4,x1:bb.max.x-.4,z0:bb.min.z+.4,z1:bb.max.z-.2,y0:.5,y1:top2-.4},
    out:()=>HOTEL.door, cols:[],
    move(nx,nz){ if(free(nx,nz)){ player.x=nx; player.z=nz; } else if(free(nx,player.z)) player.x=nx; else if(free(player.x,nz)) player.z=nz; player.y=0; },
    update(dt){ for(const gs of HOTEL.guests) gs.mixer.update(dt); } });
  addGuests(); }
// a few guests: standing at tables, chatting, on the phone, and someone behind the bar
function addGuests(){ if(!HOTEL.scene||HOTEL.guests.length||!PEOPLE.n) return; const S=HOTEL.scene, spots=[], rnd=seeded(77);
  for(let tries=0;tries<600&&spots.length<7;tries++){ const x=HOTEL.bounds.x0+rnd()*(HOTEL.bounds.x1-HOTEL.bounds.x0), z=HOTEL.bounds.z0+rnd()*(HOTEL.bounds.z1-HOTEL.bounds.z0)*.85;
    if(!HOTEL.free(x,z,.45)||Math.hypot(x-HOTEL.spawn.x,z-HOTEL.spawn.z)<4||spots.some(s=>Math.hypot(s.x-x,s.z-z)<2.6)) continue;
    let best=null, bd=9; for(let a=0;a<12;a++){ const ang=a/12*Math.PI*2; for(let r=.5;r<1.6;r+=.25){ if(HOTEL.free(x+Math.sin(ang)*r,z+Math.cos(ang)*r,.05)) continue; if(r<bd){ bd=r; best=ang; } break; } }
    if(best===null) continue; spots.push({x,z,yaw:best}); }   // face the nearest table
  const who=[['lady_red',['talk','sassy','idle_3']],['baba',['talk','idle_baba']],['lady_black',['phone','idle_4','text']],['mama',['talk','argue','idle_2']],['areaboy',['idle_1','text']],['lady_red',['idle_3','text']],['baba',['phone','idle_baba']]];
  spots.forEach((s,i)=>{ const [id,acts]=who[i%who.length], C=PEOPLE.casts[id]; if(!C) return; const inner=cloneCast(C), root=new THREE.Group(); root.scale.setScalar(C.sc); root.add(inner); inner.position.y=C.y0;
    root.position.set(s.x,0,s.z); root.rotation.y=s.yaw; S.add(root); const mixer=new THREE.AnimationMixer(inner), clip=C.clips[acts[0]]||C.clips[C.idle0]; if(clip){ const a=mixer.clipAction(clip); a.play(); a.time=Math.random()*clip.duration; inner.position.y=C.y0+(C.off[clip.name]||0); }
    HOTEL.guests.push({root,mixer}); });
  // the dance floor: women dancing (the only place in town where people dance)
  const dancers=[['lady_red','dance_salsa'],['lady_black','dance_macarena'],[isF()?'suit_lady':'girl','dance_1'],['mama','dance_salsa']], floor=[];
  for(let tries=0;tries<900&&floor.length<dancers.length;tries++){ const x=HOTEL.bounds.x0+rnd()*(HOTEL.bounds.x1-HOTEL.bounds.x0), z=HOTEL.bounds.z0+rnd()*(HOTEL.bounds.z1-HOTEL.bounds.z0)*.85;
    if(!HOTEL.free(x,z,.8)||Math.hypot(x-HOTEL.spawn.x,z-HOTEL.spawn.z)<3||spots.some(s=>Math.hypot(s.x-x,s.z-z)<1.6)||floor.some(s=>Math.hypot(s.x-x,s.z-z)<1.3)) continue;
    if(floor.length&&Math.hypot(floor[0].x-x,floor[0].z-z)>4.5) continue; floor.push({x,z}); }
  floor.forEach((s,i)=>{ const [id,dn]=dancers[i], C=PEOPLE.casts[id]; if(!C||!C.clips[dn]) return; const inner=cloneCast(C), root=new THREE.Group(); root.scale.setScalar(C.sc); root.add(inner); inner.position.y=C.y0+(C.off[dn]||0);
    root.position.set(s.x,0,s.z); root.rotation.y=rnd()*6.28; S.add(root); const mixer=new THREE.AnimationMixer(inner), a=mixer.clipAction(C.clips[dn]); a.play(); a.time=rnd()*C.clips[dn].duration; HOTEL.guests.push({root,mixer}); }); }
async function enterHotel(){ if(busy) return;
  if(!HOTEL.ready){ toast('Opening Eko Grand Hotel…',4); busy=true; try{ await loadHotel(); }catch(e){} busy=false; if(!HOTEL.ready){ toast('The hotel is closed for now. Try again soon.'); return; } }
  addGuests();
  fadeSwap(()=>{ ROOM=HOTEL; mode='interior'; enteredAt=T0; HOTEL.scene.add(rig.root); Object.assign(player,{x:HOTEL.spawn.x,z:HOTEL.spawn.z,y:0,yaw:Math.PI,speed:0}); Object.assign(camState,{yaw:Math.PI,pitch:.22,dist:3}); setScene(HOTEL.scene);
    toast('Welcome to Eko Grand Hotel. The lounge is open.',3); }); }
// start downloading the lounge when you walk near the hotel, so the door opens at once
let hotelPeek=0; function hotelPrefetch(dt){ if(!MYROOM.loading&&MANIFEST['assets/models/room.glb']&&Math.hypot(player.x-APT.front.x,player.z-APT.front.z)<60) loadMyRoom();
  if(HOTEL.loading||!HOTEL.door||(hotelPeek-=dt)>0) return; hotelPeek=1; if(Math.hypot(player.x-HOTEL.door.x,player.z-HOTEL.door.z)<70) loadHotel(); }

/* ================= the cell at Mushin police station: three minutes, with whoever else was picked up ================= */
const JAIL={room:null,left:0,taken:[],people:[],talkT:0};
JAIL.add=c=>{ if(!c) return; JAIL.taken.unshift(c); if(JAIL.taken.length>5) JAIL.taken.length=5; };
function buildJail(){ const S=new THREE.Scene(); S.background=new THREE.Color(0x0b0a09); S.fog=new THREE.Fog(0x0b0a09,7,16);
  S.add(new THREE.HemisphereLight(0xd8d2c0,0x2a2620,.65)); const bulb=new THREE.PointLight(0xffd9a0,14,11,1.5); bulb.position.set(0,2.75,0); S.add(bulb);
  const sun=new THREE.SpotLight(0xfff2d0,30,12,.5,.7,1.2); sun.position.set(1.6,3.6,-4.2); sun.target.position.set(-.5,0,.8); S.add(sun,sun.target);
  const add=(g,m,x,y,z,ry=0)=>{ const o=new THREE.Mesh(g,m); o.position.set(x,y,z); o.rotation.y=ry; S.add(o); return o; };
  // dirty plaster with scribbles, and a rough concrete floor
  const [wc,wg]=cv(512,512); wg.fillStyle='#9c9381'; wg.fillRect(0,0,512,512); grain(wg,512,512,26);
  for(let i=0;i<40;i++){ const x=rr(0,512), y=rr(260,512), gr=wg.createLinearGradient(x,y,x,y+rr(60,200)); gr.addColorStop(0,'rgba(60,50,35,.35)'); gr.addColorStop(1,'rgba(60,50,35,0)'); wg.fillStyle=gr; wg.fillRect(x,y,rr(4,18),200); }
  wg.fillStyle='rgba(40,34,26,.55)'; wg.fillRect(0,440,512,72); wg.font='bold 34px sans-serif'; wg.fillStyle='rgba(30,30,40,.55)'; wg.fillText('JESUS IS LORD',60,220); wg.fillText('|||| ||||  ||',300,300); wg.fillText('BABA GOD DEY',230,120);
  const wallT=tx(wc); wallT.repeat.set(1.4,1); const wallM=new THREE.MeshStandardMaterial({map:wallT,roughness:.95});
  const floorM=new THREE.MeshStandardMaterial({map:T.conc,color:0x8a8478,roughness:.9}); const W=6.4, D=5.2, H=3.1;
  add(new THREE.PlaneGeometry(W,D+3).rotateX(-Math.PI/2),floorM,0,0,.6);
  add(new THREE.PlaneGeometry(W,D+3).rotateX(Math.PI/2),new THREE.MeshStandardMaterial({color:0x4a463e,roughness:1}),0,H,.6);
  add(new THREE.PlaneGeometry(W,H),wallM,0,H/2,-D/2); add(new THREE.PlaneGeometry(D,H),wallM,-W/2,H/2,0,Math.PI/2); add(new THREE.PlaneGeometry(D,H),wallM,W/2,H/2,0,-Math.PI/2);
  add(new THREE.PlaneGeometry(W,H),new THREE.MeshStandardMaterial({color:0x2c2924,roughness:1}),0,H/2,D/2+2.6,Math.PI);   // the corridor wall beyond the bars
  // bars across the front, with the locked door
  const barG=[]; for(let x=-W/2+.12;x<=W/2;x+=.16){ const g=new THREE.CylinderGeometry(.022,.022,H,6); g.translate(x,H/2,D/2); barG.push(g); }
  for(const y of [.12,1.1,2.2,H-.06]){ const g=new THREE.BoxGeometry(W,.06,.06); g.translate(0,y,D/2); barG.push(g); }
  const steel=new THREE.MeshStandardMaterial({color:0x2d3236,metalness:.6,roughness:.45}); add(mergeList(barG),steel,0,0,0);
  // a high barred window letting in daylight
  add(new THREE.PlaneGeometry(1.1,.55),new THREE.MeshBasicMaterial({color:0xfff4d6}),1.6,2.45,-D/2+.01);
  { const g=[]; for(let i=0;i<5;i++){ const b=new THREE.CylinderGeometry(.018,.018,.6,6); b.translate(1.6-.44+i*.22,2.45,-D/2+.04); g.push(b); } add(mergeList(g),steel,0,0,0); }
  // a concrete bench along the back and one side, a bucket, a worn mat
  const benchM=new THREE.MeshStandardMaterial({color:0x6f6a60,roughness:.9}); add(new THREE.BoxGeometry(W-.2,.45,.6),benchM,0,.225,-D/2+.3); add(new THREE.BoxGeometry(.6,.45,D-1.4),benchM,-W/2+.3,.225,-.1);
  add(new THREE.CylinderGeometry(.17,.14,.35,14),new THREE.MeshStandardMaterial({color:0x3a6f8f,roughness:.6}),W/2-.45,.175,-D/2+.5);
  add(new THREE.PlaneGeometry(1.6,.9).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:0x5c3b2a,roughness:1}),1.2,.01,-.6);
  const bulbM=new THREE.Mesh(new THREE.SphereGeometry(.06,10,8),new THREE.MeshBasicMaterial({color:0xfff0c8})); bulbM.position.set(0,2.8,0); S.add(bulbM);
  const room={scene:S,bounds:{x0:-W/2+.35,x1:W/2-.35,z0:-D/2+.85,z1:D/2-.3},cam:{x0:-W/2+.25,x1:W/2-.25,z0:-D/2+.25,z1:D/2+2.3,y0:.6,y1:H-.25},cols:[],
    label:'Cell · Mushin police station',camDist:2.8,exit:{x:1e9,z:1e9},out:()=>({x:STATION.front.x,z:STATION.front.z,ry:STATION.front.ry}),
    update(dt){ for(const q of JAIL.people) q.mixer.update(dt); JAIL.left-=dt; const s2=Math.max(0,Math.ceil(JAIL.left)); $('#jailT').textContent=`${Math.floor(s2/60)}:${String(s2%60).padStart(2,'0')}`;
      if((JAIL.talkT-=dt)<=0&&JAIL.people.length){ JAIL.talkT=mrr(16,26); toast(mpick(['"Wetin you do wey dem carry you?"','"Na wrong place dem carry me o!"','"Officer, I no do anything!"','"Who get credit? Make I call my mama."','"This cell hot like oven."','"Dem go release us soon. Calm down."']),3); }
      if(JAIL.left<=0&&!busy) leaveJail(); } };
  return room; }
// the people inside: whoever was picked up with you, then a few others (men with men, women with women)
function jailInmates(){ const R=JAIL.room, S=R.scene; for(const q of JAIL.people) S.remove(q.root); JAIL.people.length=0;
  const pool=isF()?['mama','lady_red','lady_black','hawker','suit_lady']:['areaboy','baba','areaboy','schoolboy']; const who=[];
  for(const c of JAIL.taken) if(PEOPLE.casts[c]&&CAST[c]&&(!!CAST[c].f===isF())&&who.length<4) who.push(c);
  for(let t=0;t<12&&who.length<4;t++){ const c=mpick(pool); if(PEOPLE.casts[c]) who.push(c); }
  const spots=[[-2.4,-1.9,.5,'idle'],[-.8,-2.05,0,'talk'],[1.9,-1.5,-.6,'argue'],[-2.6,.6,1.4,'lie']];
  who.forEach((c,i)=>{ const C=PEOPLE.casts[c], [x,z,ry,a]=spots[i]; const inner=cloneCast(C), root=new THREE.Group(); root.scale.setScalar(C.sc); root.add(inner); inner.position.y=C.y0;
    root.position.set(x,0,z); root.rotation.y=ry; S.add(root); const mixer=new THREE.AnimationMixer(inner);
    const nm=a==='idle'?C.idle0:a==='talk'?(C.clips.f_talk?'f_talk':'talk'):a, clip=C.clips[nm]||C.clips[C.idle0]; if(clip){ const ac=mixer.clipAction(clip); ac.play(); ac.time=MR()*clip.duration; inner.position.y=C.y0+(C.off[nm]||0); }
    JAIL.people.push({root,mixer}); });
  R.cols=JAIL.people.map(q=>({x0:q.root.position.x-.3,x1:q.root.position.x+.3,z0:q.root.position.z-.3,z1:q.root.position.z+.3,h:2})); }
function enterJail(){ if(!JAIL.room) JAIL.room=buildJail(); jailInmates(); const R=JAIL.room; ROOM=R; mode='interior'; enteredAt=T0; R.scene.add(rig.root);
  Object.assign(player,{x:0,z:1.6,y:0,yaw:Math.PI,speed:0}); Object.assign(camState,{yaw:Math.PI,pitch:.24,dist:2.8}); setScene(R.scene);
  JAIL.left=180; JAIL.talkT=6; $('#jailBox').hidden=false; toast('Police don lock you for cell. Wait 3 minutes and they go release you.',5); }
function leaveJail(){ fadeSwap(()=>{ const o=ROOM.out(); mode='walk'; ROOM=INT; scene.add(rig.root); Object.assign(player,{x:o.x,z:o.z,y:0,yaw:o.ry,speed:0}); Object.assign(camState,{yaw:o.ry,pitch:.26,dist:4.3});
  setScene(scene); $('#jailBox').hidden=true; JAIL.taken.length=0; toast('Your time don finish. Police release you. Behave yourself o!',4.5); }); }

/* ================= main loop ================= */
await step('Waking up the city…', 94);
await Promise.race([clockSync,new Promise(r=>setTimeout(r,2500))]).catch(()=>{});
CLOCK.keepSynced(5);
updateEnv(0,true);
{ const hid=[rain,stars,poolMesh,clouds].filter(o=>o&&!o.visible); for(const o of hid) o.visible=true; renderer.compile(scene,camera); for(const o of hid) o.visible=false; } renderer.compile(INT.scene,camera);
{ const rt=new THREE.WebGLRenderTarget(64,64); renderer.setRenderTarget(rt); renderer.render(INT.scene,camera); renderer.setRenderTarget(null); rt.dispose(); }
for(const k in A) A[k]=null;   // free the city building buffers (the meshes keep their own copy)
clearInterval(progTimer);
let warm=0, perfAcc=0, perfN=0, prCool=3, errShown=0;
function applyPR(){ renderer.setPixelRatio(PR); renderer.setSize(innerWidth,innerHeight); if(composer){ composer.setPixelRatio(PR); composer.setSize(innerWidth,innerHeight); } }
function reportErr(e){ console.error(e); if(errShown++<1&&started) toast('Small hitch. The game kept running.'); }
function simulate(dt){
  if(started&&!busy&&!mapView.isOpen){ if(mode==='walk') updateWalk(dt,false); else if(mode==='interior'){ if(HL.act) updateHomeAct(dt); else updateWalk(dt,true); homeTick(dt); } else if(mode==='enter') updateEnter(dt); else updateDrive(dt); }
  else if(mapView.isOpen&&mode==='drive'){ drive.speed=0; drive.v.speed=0; }
  updateEnv(dt); updateStorm(dt);
  if(mode!=='interior'){ updateTraffic(dt); updatePeople(dt); updateFight(dt); updateCops(dt); updateRaid(dt); updateCarry(dt); updateRide(dt); updateMoney(dt); updateJob(dt); updatePicks(dt); updateArms(dt); updateDealer(dt); updateTolls(dt); updatePeds(dt); updateIcons(dt); updateCars(dt); updateThrown(dt); updateFires(dt); updateFX(dt); updatePFX(dt); updateBoom(dt); updateBlood(dt); updateLights(dt); for(const v of vehicles) syncCar(v,dt); updateWorld(dt); recycleCars(dt); hotelPrefetch(dt); } else ROOM.update(dt);
  if(!started){ rig.root.position.set(player.x,player.y,player.z); if(hero) heroAnim(dt,0); else animHuman(rig,0,0,T0,false); camState.yaw+=dt*.05; }
  updateCamera(dt); updateBlobs(); SCAT.update(dt); updateHUD(dt); if(started) updateFightHUD(); updateAudio(); }
// dynamic resolution: if frames run long, draw fewer pixels; if the browser itself caps at 30 fps (iOS Low Power Mode),
// one test step down shows no gain, so the original sharpness is restored and kept
let capped30=false, probe=null;
function tuneResolution(avg,ivs){ const goal=capped30?33.4:16.7;
  if(capped30&&avg<20) capped30=false;   // Low Power Mode was switched off
  if(probe){ const gained=avg<probe.avg*.9; if(!gained&&probe.avg>28&&probe.avg<38){ capped30=true; PR=probe.pr; applyPR(); } probe=null; prCool=6; return; }
  if(avg>goal*1.32&&PR>Q.prMin+.01){ const m=ivs.slice().sort((a,b)=>a-b), tight=m[Math.floor(m.length*.85)]-m[Math.floor(m.length*.15)]<2.5;
    if(!capped30&&tight&&avg>30&&avg<37){ probe={pr:PR,avg}; PR=Math.max(Q.prMin,PR*.8); applyPR(); prCool=4; return; }   // a big test step: a slow phone gains, a capped browser doesn't
    PR=Math.max(Q.prMin,PR-.12); applyPR(); prCool=4; }
  else if(avg<goal*1.08&&PR<Q.pr-.01&&prCool<=0){ PR=Math.min(Q.pr,PR+.06); applyPR(); prCool=5; } }
const perfIv=[];
function loop(ts){ const t=typeof ts==='number'?ts:performance.now(), raw=t-lastT;
  if(raw<10.5) return;   // 120 Hz+ screens: draw at ~60 fps to save battery and heat
  lastT=t; const dt=Math.min(raw/1000,.05);
  if(!started&&warm>8){ warm++; return; }   // nothing to draw behind the title screen
  T0+=dt; warm++;
  try{ simulate(dt); }catch(e){ reportErr(e); }
  try{ if(mode!=='interior') updateCulls(); renderFrame(dt); }catch(e){ reportErr(e); }
  if(started&&!ctxLost&&!document.hidden){ if(raw>250){ perfAcc=perfN=0; perfIv.length=0; return; }   // back from another app: don't count that gap
    perfAcc+=raw; perfN++; perfIv.push(raw); if(perfN>=40){ const avg=perfAcc/perfN; perfAcc=perfN=0; prCool-=.7; tuneResolution(avg,perfIv); perfIv.length=0; } } }
if(PERF){ renderer.info.autoReset=false; const el=document.createElement('div'); el.id='perfPanel'; el.style.cssText='position:fixed;left:8px;bottom:8px;z-index:70;background:rgba(0,0,0,.72);color:#9f9;font:12px/1.35 monospace;padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre';
  if(!/[?&]perf=show/.test(location.search)) el.hidden=true;   // numbers stay available to tests; shown only with ?perf=show
  document.body.appendChild(el); let fr=[], tLast=performance.now();
  const gpu=(()=>{ try{ const gl=renderer.getContext(), e=gl.getExtension('WEBGL_debug_renderer_info'); return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):''; }catch(e){ return ''; } })();
  (function tick(t){ fr.push(t-tLast); tLast=t; if(fr.length>=30){ const a=fr.slice().sort((x,y)=>x-y), avg=a.reduce((s,x)=>s+x,0)/a.length, i=renderer.info.render;
      el.textContent=`${(1000/avg).toFixed(0)} fps  avg ${avg.toFixed(1)} ms  p95 ${a[Math.floor(a.length*.95)].toFixed(1)} ms\ncalls ${i.calls}  tris ${(i.triangles/1000).toFixed(0)}k  px ${renderer.domElement.width}x${renderer.domElement.height} (x${PR.toFixed(2)})\n${qKey} ${gpu.replace(/ANGLE \(|, D3D11\)|Direct3D11 vs_5_0 ps_5_0/g,'').slice(0,60)}`; window.__nsPerf={fps:1000/avg,avg,p95:a[Math.floor(a.length*.95)],calls:i.calls,tris:i.triangles,pr:PR}; fr=[]; }
    requestAnimationFrame(tick); })(performance.now());
  // test switches for profiling on a real device (only with ?perf=1)
  window.__ns={ renderer, Q, get PR(){ return PR; },
    setPR(v){ PR=v; applyPR(); }, lockPR(v){ Q.prMin=Q.pr=v; PR=v; applyPR(); },
    shadows(b){ renderer.shadowMap.enabled=b; sun.castShadow=b; scene.traverse(o=>{ if(o.material) o.material.needsUpdate=true; }); },
    post(b){ usePost=b; }, bloom(b){ if(bloom) bloom.enabled=b; },
    show(name,b){ const m={clouds,veil,rain,stars,water,sky}; if(m[name]) m[name].visible=b; },
    peds(b){ for(const p of peds) if(p.h) p.h.root.visible=b; for(const bd of BODIES) bd.root.visible=b&&!!bd.p; }, cars(b){ for(const v of vehicles) v.c.g.visible=b; },
    culls(b){ for(const c of CULLS) c.off=!b; }, cullNames:()=>CULLS.map(c=>c.name||'?'),
    cullOne(name,b){ for(const c of CULLS) if(c.name===name) c.off=!b; },
    hideStatic(b){ scene.children.forEach(o=>{ if(o.isMesh&&!o.isInstancedMesh&&o.geometry&&o.geometry.attributes.position&&o.geometry.attributes.position.count>20000) o.visible=!b; }); },
    stats(){ return {...window.__nsPerf}; },
    // measures the real cost of drawing one frame (CPU + graphics card), even when the tab is in the background
    bench(n=30){ const gl=renderer.getContext(), px=new Uint8Array(4); const one=()=>{ if(mode!=='interior') updateCulls(); renderFrame(1/60); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px); };
      for(let i=0;i<5;i++) one(); const t=[]; for(let i=0;i<n;i++){ const a=performance.now(); one(); t.push(performance.now()-a); } t.sort((x,y)=>x-y);
      return {med:+t[n>>1].toFixed(2), p90:+t[Math.floor(n*.9)].toFixed(2), calls:renderer.info.render.calls, tris:renderer.info.render.triangles, px:[renderer.domElement.width,renderer.domElement.height]}; },
    sim(sec=1){ for(let i=0;i<sec*60;i++){ T0+=1/60; simulate(1/60); } },
    start(){ if(!started) $('#enterBtn').click(); },
    scene, camera, sun, hemi, fillLight, headSpot,
    env(b){ scene.environment=b?envRT.texture:null; }, fog(b){ scene.fog.density=b?.0017:0; },
    light(name,b){ const L={sun,hemi,fill:fillLight,spot:headSpot}[name]; if(L) L.visible=b; },
    shadowType(t){ renderer.shadowMap.type=THREE[t]; scene.traverse(o=>{ if(o.material) o.material.needsUpdate=true; }); sun.shadow.map&&sun.shadow.map.dispose(); sun.shadow.map=null; },
    shadowSize(n){ sun.shadow.mapSize.set(n,n); if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map=null; } },
    swapMat(kind){ // test cheaper shading: 'lambert' turns every standard material into a Lambert one (cannot be undone without reload)
      const cache=new Map(); scene.traverse(o=>{ if(!o.material||Array.isArray(o.material)) return; const m=o.material; if(!m.isMeshStandardMaterial) return; if(!cache.has(m)){ const n=kind==='basic'?new THREE.MeshBasicMaterial({map:m.map,color:m.color,vertexColors:m.vertexColors,side:m.side,transparent:m.transparent,opacity:m.opacity}):new THREE.MeshLambertMaterial({map:m.map,color:m.color,vertexColors:m.vertexColors,side:m.side,transparent:m.transparent,opacity:m.opacity,emissive:m.emissive,emissiveMap:m.emissiveMap,emissiveIntensity:m.emissiveIntensity}); cache.set(m,n); } o.material=cache.get(m); }); return cache.size; },
    cpu(n=60){ const t=performance.now(); for(let i=0;i<n;i++){ T0+=1/60; simulate(1/60); updateCulls(); } return +((performance.now()-t)/n).toFixed(3); } }; }
renderer.setAnimationLoop(loop);
window.__nsReady=true;
setTimeout(loadPeople,200);   // the real people arrive while the title screen shows (the walkers are look-alikes until then)
loadTxt.textContent='Lagos is ready.'; loadBar.style.width='100%';
const eb=$('#enterBtn');
// ---- profile: the first time, you choose a name and man or woman (kept on this device; it cannot be changed later)
{ const PF=$('#prof'), PN=$('#profName'), PW=$('#pwho'); let pickG=null, pickC=null;
  const who=()=>{ PW.textContent=`${PROFILE.name} · ${(v2Of(myPerson())||{}).name||(PROFILE.g==='f'?'Woman':'Man')}`; PW.hidden=false; PF.hidden=true; };
  const ok=()=>{ eb.disabled=!(pickG&&pickC&&PN.value.trim().length>=2); };
  if(PROFILE) who();
  else { PF.hidden=false; $('#loading').classList.add('pf'); eb.dataset.label=eb.textContent='CREATE & ENTER'; eb.disabled=true;
    // first man or woman, then the people of that kind (their faces), then (for some women) a body shape
    const PL=$('#ppl'), PS=$('#pshape');
    const shapes=P=>{ PS.textContent=''; PS.hidden=!P.shape; if(!P.shape) return; const l=document.createElement('span'); l.textContent='Body'; PS.appendChild(l);
      for(const [k,name] of SHAPES){ const b=document.createElement('button'); b.type='button'; b.className='psb'; b.textContent=name; b.setAttribute('aria-pressed',(V2.shape[P.id]||'curvy')===k?'true':'false');
        b.addEventListener('click',()=>{ setShape(P.id,k); for(const c of PS.querySelectorAll('button')) c.setAttribute('aria-pressed',c===b?'true':'false'); }); PS.appendChild(b); } };
    const people=()=>{ PL.textContent=''; PS.hidden=true;
      for(const P of pickable(pickG==='f'?1:0)){ const b=document.createElement('button'); b.type='button'; b.className='ppc'; b.setAttribute('aria-pressed','false');
        const im=document.createElement('img'); im.src=`assets/people/face_${P.id.slice(2)}.jpg`; im.alt=''; const sp=document.createElement('span'); sp.textContent=P.name; b.append(im,sp);
        b.addEventListener('click',()=>{ pickC=P.id; for(const c of PL.children) c.setAttribute('aria-pressed',c===b?'true':'false'); shapes(P); ok(); loadV2(P.id); });   // start bringing them in
        PL.appendChild(b); }
      PL.hidden=false; };
    for(const b of document.querySelectorAll('.pgb')) b.addEventListener('click',()=>{ if(pickG===b.dataset.g) return; pickG=b.dataset.g; pickC=null; for(const c of document.querySelectorAll('.pgb')) c.setAttribute('aria-pressed',c===b?'true':'false'); people(); ok(); });
    PN.addEventListener('input',ok); PN.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!eb.disabled) eb.click(); }); }
  eb.makeProfile=()=>{ if(PROFILE) return; PROFILE={name:PN.value.trim().slice(0,16),g:pickG,c:pickC,t:Date.now()}; try{ localStorage.setItem('naija-profile',JSON.stringify(PROFILE)); }catch(e){} who();
    if(isF()){ CAST.girl.w=0; for(const p of peds) if(p.cast==='girl'&&p.state!=='off'&&!p.spot) recast(p); } }; }
if(PROFILE&&WARD.cur!==savedLook()){ eb.dataset.wait=1; eb.disabled=true; eb.dataset.label='ENTER LAGOS'; eb.textContent=isV2(savedLook())?`GETTING ${(v2Of(savedLook()).name).toUpperCase()} READY…`:(isF()?'GETTING HER READY…':'GETTING READY…'); setTimeout(()=>{ if(eb.dataset.wait) bodyReady(); },25000); }   // never stuck on a slow connection
eb.hidden=false; if(PROFILE) eb.focus(); else $('#profName').focus();
eb.addEventListener('click',()=>{ if(!PROFILE){ eb.makeProfile(); if(WARD.cur!==savedLook()){ rig.root.visible=false; applySavedLook(); setTimeout(()=>{ rig.root.visible=true; },12000); } }   // her body arrives in a moment
  started=true; lastT=performance.now(); camState.yaw=0; $('#loading').classList.add('gone'); setTimeout(()=>{ $('#loading').hidden=true; },650); $('#hud').hidden=false; initAudio(); checkRotate();
  if(!touchUI){ try{ const p=cvs.requestPointerLock(); if(p&&p.catch) p.catch(()=>{ $('#lookhint').hidden=false; }); }catch(_){ $('#lookhint').hidden=false; } }
  updateClockHUD(); toast(`${CLOCK.fmtHour(ENV.hour)} in Lagos · ${wLabel()}. Your okada is parked by the road.`,4.5); });
document.addEventListener('pointerlockchange',()=>{ if(!document.pointerLockElement&&started&&!touchUI&&!mapView.isOpen) $('#lookhint').hidden=false; else $('#lookhint').hidden=true; });
