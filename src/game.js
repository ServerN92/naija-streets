import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as CLOCK from './clock.js?v=f75410eca9';
import { MapView } from './mapview.js?v=f75410eca9';
window.__nsOK = true;
// the page and the game code must come from the same release; if a cached page meets newer code, fetch a fresh page
const BUILD='f75410eca9';
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
  low:   {pr:Math.min(DPR,1.25),prMin:.6, px:1.3e6,shadows:false,sh:1024,shR:46, soft:false,msaa:0,bloom:false,post:false,mirror:false,water:0,  draw:210,lod0:55, peds:16,cars:14,fog:1.3, aniso:2,tex:512, aa:true, sky:96},
  medium:{pr:Math.min(DPR,1.5), prMin:.7, px:1.7e6,shadows:true, sh:1024,shR:55, soft:false,msaa:0,bloom:false,post:false,mirror:false,water:0,  draw:300,lod0:80, peds:26,cars:20,fog:1.1, aniso:4,tex:1024,aa:true, sky:128},
  high:  {pr:Math.min(DPR,2),   prMin:.85,px:4.2e6,shadows:true, sh:2048,shR:85, soft:true, msaa:4,bloom:true, post:true, mirror:true, water:512,draw:430,lod0:120,peds:40,cars:28,fog:1,   aniso:8,tex:1024,aa:false,sky:256}};
// pick a starting quality from the graphics chip: weak chips (most phones, Intel HD/UHD laptops) start on Low, strong ones on High
const GPU=(()=>{ try{ const c=document.createElement('canvas'), gl=c.getContext('webgl2')||c.getContext('webgl'), e=gl&&gl.getExtension('WEBGL_debug_renderer_info'); const n=e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):''; const lc=gl&&gl.getExtension('WEBGL_lose_context'); if(lc) lc.loseContext(); return n||''; }catch(err){ return ''; } })();
const GPU_TIER=/SwiftShader|llvmpipe|Microsoft Basic|Mali-[T4]|Mali-G(31|51|52|57|68|72|76)\b|Adreno.{0,12}\b([3-5]\d\d|6[0-3]\d)\b|PowerVR|Intel.{0,40}\b(HD|UHD) Graphics|Apple A(9|10|11|12)\b/i.test(GPU)?'low':
  /NVIDIA|GeForce|RTX|Quadro|Radeon (RX|Pro)|Apple M\d|Adreno.{0,12}\b(7[3-9]\d|8\d\d)\b|Immortalis/i.test(GPU)?'high':'medium';
let qKey=null; try{ qKey=localStorage.getItem('naija-quality'); }catch(e){}
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
const XS=[-560,-420,-300,-150,60,200,330], ZS=[-280,-170,-60,40,120];
const EWW=z=>z===120?20:13, NSW=x=>x===330?15:12, SIDE=5, SLAB=0.15;
const EW_NAME={'-280':'Gerrard Road','-170':'Kingsway Road','-60':'Awolowo Road','40':'Broad Street','120':'Marina'};
const NS_NAME={'-560':'Idumota Road','-420':'Nnamdi Azikiwe Street','-300':'Balogun Street','-150':'Martins Street','60':'Bourdillon Road','200':'Alexander Avenue','330':'Lagoon Drive'};
const BR={x0:346,x1:1046,z:-170,hw:8,top:9,px:696};
function bridgeY(x,z){ if(Math.abs(z-BR.z)<BR.hw+.4 && x>BR.x0 && x<BR.x1){ if(x<430) return sm((x-BR.x0)/84)*BR.top; if(x>962) return sm((BR.x1-x)/84)*BR.top; return BR.top; } return null; }
function onRoad(x,z){
  if(x>=XS[0]-6 && x<=XS[XS.length-1]+7.5 && z>=ZS[0]-6.5 && z<=ZS[ZS.length-1]+10){
    for(const zz of ZS) if(Math.abs(z-zz)<EWW(zz)/2) return true;
    for(const xx of XS) if(Math.abs(x-xx)<NSW(xx)/2) return true;
  }
  return Math.abs(z-BR.z)<7.5 && x>330 && x<1075;
}
function groundY(x,z){ const b=bridgeY(x,z); if(b!==null) return b; return onRoad(x,z)?0:SLAB; }
const LANDS=[{x0:-728,x1:347,z0:-448,z1:144},{x0:1040,x1:1890,z0:-690,z1:390}];
function onLand(x,z,bm=.6){ for(const L of LANDS) if(x>L.x0&&x<L.x1&&z>L.z0&&z<L.z1) return true; return Math.abs(z-BR.z)<BR.hw-bm && x>=338 && x<=1052; }

const PLACES=[]; // things to show on the big map: {name, sub, kind, x, z}
const placeKind=sub=>/AMALA|BUKA|JOLLOF|SUYA|PEPPER|KITCHEN|RICE|DRINKS/.test(sub)?'food':/BARB|SALON|HAIR|PHARMACY|POS|BUREAU|LAUNDRY|PRINT|VULCAN|GENERATOR|REPAIR/.test(sub)?'service':'shop';
/* ================= collision hash ================= */
const colliders=[], CELL=40, hash=new Map();
const hk=(i,j)=>(i+500)*2000+(j+500);
function addCol(b){ colliders.push(b); for(let i=Math.floor(b.x0/CELL);i<=Math.floor(b.x1/CELL);i++) for(let j=Math.floor(b.z0/CELL);j<=Math.floor(b.z1/CELL);j++){ const k=hk(i,j); let a=hash.get(k); if(!a) hash.set(k,a=[]); a.push(b); } }
let qStamp=0; const qOut=[];
function query(x0,z0,x1,z1){ qStamp++; qOut.length=0; for(let i=Math.floor(x0/CELL);i<=Math.floor(x1/CELL);i++) for(let j=Math.floor(z0/CELL);j<=Math.floor(z1/CELL);j++){ const a=hash.get(hk(i,j)); if(a) for(const b of a) if(b._q!==qStamp){ b._q=qStamp; qOut.push(b); } } return qOut; }
function resolveCircle(p,r,list=null){ let hit=false; const cand=list||query(p.x-r,p.z-r,p.x+r,p.z+r);
  for(const b of cand){ const cx=clamp(p.x,b.x0,b.x1), cz=clamp(p.z,b.z0,b.z1); const dx=p.x-cx, dz=p.z-cz, d2=dx*dx+dz*dz;
    if(d2<r*r){ hit=true; if(d2>1e-6){ const d=Math.sqrt(d2); p.x=cx+dx/d*r; p.z=cz+dz/d*r; }
      else { const l=p.x-b.x0, rt=b.x1-p.x, t=p.z-b.z0, bt=b.z1-p.z, m=Math.min(l,rt,t,bt); if(m===l) p.x=b.x0-r; else if(m===rt) p.x=b.x1+r; else if(m===t) p.z=b.z0-r; else p.z=b.z1+r; } } }
  return hit; }
function rayDist(o,d,maxD){ let best=maxD; const ex=o.x+d.x*maxD, ez=o.z+d.z*maxD;
  for(const b of query(Math.min(o.x,ex)-1,Math.min(o.z,ez)-1,Math.max(o.x,ex)+1,Math.max(o.z,ez)+1)){
    let t0=0,t1=best,ok=true;
    for(const [oo,dd,mn,mx] of [[o.x,d.x,b.x0,b.x1],[o.y,d.y,0,b.h],[o.z,d.z,b.z0,b.z1]]){
      if(Math.abs(dd)<1e-8){ if(oo<mn||oo>mx){ ok=false; break; } continue; }
      let ta=(mn-oo)/dd, tb=(mx-oo)/dd; if(ta>tb){ const s=ta; ta=tb; tb=s; } t0=Math.max(t0,ta); t1=Math.min(t1,tb); if(t0>t1){ ok=false; break; } }
    if(ok && t0>0 && t0<best) best=t0; }
  return best; }

/* ================= geometry accumulator ================= */
class Acc{ constructor(){ this.p=[]; this.n=[]; this.u=[]; this.c=[]; }
  quad(A,B,C,D,n,uv,col){ for(const [P,Q] of [[A,uv[0]],[B,uv[1]],[C,uv[2]],[A,uv[0]],[C,uv[2]],[D,uv[3]]]){ this.p.push(P[0],P[1],P[2]); this.n.push(n[0],n[1],n[2]); this.u.push(Q[0],Q[1]); this.c.push(col.r,col.g,col.b); } }
  mesh(mat,shadow=true,receive=true){ if(!this.p.length) return null; const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(this.u,2)); g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
    g.computeBoundingSphere(); const m=new THREE.Mesh(g,mat); m.castShadow=shadow; m.receiveShadow=receive; return m; } }
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
  bungalow:['beigehouse','h',12.5,1],house:['residentialhouse','h',16,1],storey:['two-story_house_3d_model','h',12.5,1],station:['police_station','h',26,1],office:['modernoffice','h',21,1],tlight:['traffic_light','tl',0,0]};
const AV=MANIFEST._v||{}; const murl=f=>{ const u=`assets/models/${f}.glb`, k=AV[u]||MANIFEST[u]; return k?u+'?v='+k:u; };
for(const [,[file,,,lod]] of Object.entries(MODEL_FILES)){ for(const f of lod?[file,file+'_lod1']:[file]){ const u=murl(f); DL.exp[u]=MANIFEST[`assets/models/${f}.glb`]||300000; } }
const HERO_FILES=['character','idle','walk','run','enter_car']; const HERO_URL='assets/characters/hero.glb'+((AV['assets/characters/hero.glb']||MANIFEST['assets/characters/hero.glb'])?'?v='+(AV['assets/characters/hero.glb']||MANIFEST['assets/characters/hero.glb']):''); DL.exp[HERO_URL]=MANIFEST['assets/characters/hero.glb']||720000;
function floatGeo(g){ for(const k of Object.keys(g.attributes)){ const a=g.attributes[k]; if(a.isInterleavedBufferAttribute||!(a.array instanceof Float32Array)){ const n=a.count, s=a.itemSize, f=new Float32Array(n*s);
      for(let i=0;i<n;i++){ f[i*s]=a.getX(i); if(s>1) f[i*s+1]=a.getY(i); if(s>2) f[i*s+2]=a.getZ(i); if(s>3) f[i*s+3]=a.getW(i); } g.setAttribute(k,new THREE.BufferAttribute(f,s)); } } return g; }
function meshOf(gltf){ let mesh=null; gltf.scene.updateMatrixWorld(true); gltf.scene.traverse(o=>{ if(o.isMesh&&!mesh) mesh=o; }); return mesh; }
const modelJobs=Object.entries(MODEL_FILES).map(async([key,[file,front,size,lod]])=>{
  const get=f=>fetchBuf(murl(f)).then(b=>GLL.parseAsync(b,''));
  const res=await Promise.allSettled((lod?[file,file+'_lod1']:[file]).map(get)); if(res[0].status!=='fulfilled') throw res[0].reason;
  const parsed=res.filter(r=>r.status==='fulfilled').map(r=>r.value);
  const out={}; let T=null;
  parsed.forEach((gltf,li)=>{ const mesh=meshOf(gltf); const geo=floatGeo(mesh.geometry.clone()); geo.applyMatrix4(mesh.matrixWorld);
    if(front==='-x') geo.rotateY(Math.PI); else if(front==='+z') geo.rotateY(Math.PI/2);
    geo.computeBoundingBox(); const bb=geo.boundingBox, sz=new THREE.Vector3(); bb.getSize(sz);
    if(!T) T={cx:(bb.min.x+bb.max.x)/2,cz:(bb.min.z+bb.max.z)/2,y0:bb.min.y,sc:front==='tl'?1:size/sz.x};
    geo.translate(-T.cx,-T.y0,-T.cz); if(front==='tl') geo.translate(T.cx,0,T.cz); geo.scale(T.sc,T.sc,T.sc); geo.computeBoundingBox(); geo.computeBoundingSphere(); geo.boundingBox.getSize(sz);
    const mat=mesh.material; if(mat.map){ mat.map.anisotropy=maxAniso; mat.map.colorSpace=THREE.SRGBColorSpace; }
    const bld=front==='h'; mat.side=bld&&li>0?THREE.FrontSide:THREE.DoubleSide; mat.roughness=bld?.9:(front==='tl'?.6:.55); mat.metalness=bld?0:(front==='tl'?.3:.15);
    if(li===0) Object.assign(out,{geo,mat,W:sz.x,D:sz.z,H:sz.y}); else Object.assign(out,{geo1:geo,mat1:mat}); });
  return [key,out]; });
modelJobs.forEach(p=>p.catch(()=>{}));
// the player: one compressed GLB (mesh + idle/walk/run/enter-car); the original FBX files are only a fallback
const heroBufsJob=fetchBuf(HERO_URL).then(b=>GLL.parseAsync(b,'')).then(g=>({gltf:g})).catch(async e=>{ console.warn('hero.glb failed, trying FBX',e);
  for(const n of HERO_FILES){ const u=`assets/characters/${n}.fbx`; DL.exp[u]=MANIFEST[u]||400000; } return {fbx:await Promise.all(HERO_FILES.map(n=>fetchBuf(`assets/characters/${n}.fbx`)))}; });
heroBufsJob.catch(()=>{});
await Promise.race([(async()=>{ const l=document.querySelector('link[href*="fonts.googleapis"]'); if(l&&!l.sheet) await new Promise(r=>{ l.addEventListener('load',r,{once:true}); l.addEventListener('error',r,{once:true}); }); await Promise.all([document.fonts.load('48px Bungee'),document.fonts.load('700 24px "Barlow Semi Condensed"')]); })().catch(()=>{}), new Promise(r=>setTimeout(r,3000))]);
await step('Mixing paint for Lagos Island…', 6);

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
  sign:new THREE.MeshStandardMaterial({map:T.signs.map,emissiveMap:T.signs.em,emissive:0xffffff,emissiveIntensity:0,roughness:.6,polygonOffset:true,polygonOffsetFactor:-1}),
  conc:new THREE.MeshStandardMaterial({map:T.conc,roughness:.85,color:0xe4e0d8}),
  base:new THREE.MeshStandardMaterial({color:0x3a3b3e,roughness:.95}),
};
const FAC_KEYS=['glass','bronze','office','resi','oldmid','shop'];
const TILE={glass:[12.8,28.8],bronze:[12.8,28.8],office:[12,28.8],resi:[12.8,25.6],oldmid:[12,27.2],shop:[20,4.4]};
const TINTS={glass:['#ffffff','#e2f2ff','#dcfff2','#eef0ff'],bronze:['#ffffff','#fff0dc'],office:['#ffffff','#f1ece2','#e6e1d8','#fff6e6'],
  resi:['#fffaf0','#ffe6d2','#e2f0ff','#e4f6e8','#f1e6ff','#ffffff','#fff1c0'],oldmid:['#f6d98b','#f2b8a8','#a9d6e5','#b8e0b0','#e9c46a','#f4a261','#ddd5c8','#c9b8e8','#e7e1d3']};
const A={}; for(const k of [...FAC_KEYS,'roof','zinc','fence','curb','pave','plaza','grass','road2','road4','cross','sign','conc','roadBad2','roadBad4','dirt']) A[k]=new Acc();
const ROAD_MATS=[MAT.road2,MAT.road4,MAT.cross,MAT.roadBad2,MAT.roadBad4,MAT.dirt,MAT.pave,MAT.plaza,MAT.curb];
for(const m of ROAD_MATS){ m.userData.r0=m.roughness; m.userData.c0=m.color.clone(); m.userData.k=m===MAT.dirt?.45:.72; }

/* ================= sky, sun, water ================= */
await step('Hanging the sun over the harbour…', 14);
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

/* ================= land, roads ================= */
await step('Laying asphalt and digging potholes…', 22);
{ // land body (top + seawall)
  for(const L of LANDS){ const g=new THREE.BoxGeometry(L.x1-L.x0,5,L.z1-L.z0); const m=new THREE.Mesh(g,MAT.base); m.position.set((L.x0+L.x1)/2,-2.5,(L.z0+L.z1)/2); m.receiveShadow=true; scene.add(m);
    const side=new Acc(); boxWalls(side,L,-3.5,0.01,6,3,0,0,new THREE.Color('#b6b0a6')); const sm2=side.mesh(MAT.conc,false); scene.add(sm2); }
  const vi={x0:-700,x1:1150,z0:430,z1:900}; const g=new THREE.BoxGeometry(vi.x1-vi.x0,5,vi.z1-vi.z0); const m=new THREE.Mesh(g,MAT.base); m.position.set((vi.x0+vi.x1)/2,-2.4,(vi.z0+vi.z1)/2); scene.add(m);
}
const nodes=[]; const idx=(i,j)=>j*XS.length+i;
for(let j=0;j<ZS.length;j++) for(let i=0;i<XS.length;i++) nodes.push({x:XS[i],z:ZS[j],adj:[],i,j});
const bridgeNode=nodes.length; nodes.push({x:1050,z:BR.z,adj:[],bridge:true});
function link(a,b){ nodes[a].adj.push(b); nodes[b].adj.push(a); }
for(let j=0;j<ZS.length;j++) for(let i=0;i<XS.length-1;i++) link(idx(i,j),idx(i+1,j));
for(let i=0;i<XS.length;i++) for(let j=0;j<ZS.length-1;j++) link(idx(i,j),idx(i,j+1));
link(idx(XS.length-1,1),bridgeNode);
const EDGES=[]; nodes.forEach((n,a)=>n.adj.forEach(b=>EDGES.push([a,b])));
function edgeHalf(a,b){ if(a.bridge||b.bridge) return 7; return a.z===b.z ? EWW(a.z)/2 : NSW(a.x)/2; }
function crossHalf(n,fx){ if(n.bridge) return 0; return Math.abs(fx)>.5 ? NSW(n.x)/2 : EWW(n.z)/2; }

function ribbon(acc,x0,z0,x1,z1,width,yFn,seg=1e9,uT=12,col=WHITE){ const dx=x1-x0,dz=z1-z0,L=Math.hypot(dx,dz),fx=dx/L,fz=dz/L,rx=-fz,rz=fx,hw=width/2; const n=Math.max(1,Math.ceil(L/seg));
  for(let i=0;i<n;i++){ const s0=L*i/n,s1=L*(i+1)/n, ax=x0+fx*s0, az=z0+fz*s0, bx=x0+fx*s1, bz=z0+fz*s1, ya=yFn(ax,az), yb=yFn(bx,bz);
    acc.quad([ax-rx*hw,ya,az-rz*hw],[ax+rx*hw,ya,az+rz*hw],[bx+rx*hw,yb,bz+rz*hw],[bx-rx*hw,yb,bz-rz*hw],[0,1,0],[[s0/uT,0],[s0/uT,1],[s1/uT,1],[s1/uT,0]],col); } }
const flatY=y=>()=>y;
// road segments between intersections
// road condition: Marina, Lagoon Drive and the bridge are good; many inner streets are bad or red earth
const EDGE_COND=new Map(), ekey=(a,b)=>a<b?a+'-'+b:b+'-'+a;
function decideCond(A0,B0){ if(A0.bridge||B0.bridge) return 'good'; if(A0.z===B0.z&&A0.z===120) return 'good'; if(A0.x===B0.x&&A0.x===330) return 'good';
  if(A0.z===B0.z&&A0.z===40) return 'bad'; const r=R(); return r<.38?'bad':r<.62?'dirt':'good'; }
const POTHOLES=[], PH_HASH=new Map(), PHC=8, phk=(i,j)=>i*4096+j;
for(const [a,b] of EDGES){ if(a>b) continue; const A0=nodes[a], B0=nodes[b]; if(A0.bridge||B0.bridge){ EDGE_COND.set(ekey(a,b),'good'); continue; }
  const dx=B0.x-A0.x, dz=B0.z-A0.z, L=Math.hypot(dx,dz), fx=dx/L, fz=dz/L, rx=-fz, rz=fx;
  const sa=crossHalf(A0,fx), sb=crossHalf(B0,fx), w=2*edgeHalf(A0,B0), cond=decideCond(A0,B0); EDGE_COND.set(ekey(a,b),cond);
  ribbon(cond==='dirt'?A.dirt:cond==='bad'?(w>=20?A.roadBad4:A.roadBad2):(w>=20?A.road4:A.road2), A0.x+fx*sa, A0.z+fz*sa, B0.x-fx*sb, B0.z-fz*sb, w, flatY(0.03));
  if(cond!=='good'){ const n=Math.floor((L-sa-sb)/(cond==='dirt'?6.5:8.5));
    for(let k=0;k<n;k++){ const t=rr(sa+3,L-sb-3), lat=rr(-w/2+.9,w/2-.9), x=A0.x+fx*t+rx*lat, z=A0.z+fz*t+rz*lat, big=cond==='dirt';
      const p={x,z,r:big?rr(.6,1.7):rr(.35,1.05),water:R()<(big?.55:.3),depth:big?rr(.5,1):rr(.4,.9),ry:rr(0,6.28)}; POTHOLES.push(p);
      const ci=Math.floor(x/PHC), cj=Math.floor(z/PHC); for(let i=ci-1;i<=ci+1;i++) for(let j=cj-1;j<=cj+1;j++){ const kk=phk(i,j); if(!PH_HASH.has(kk)) PH_HASH.set(kk,[]); PH_HASH.get(kk).push(p); } } } }
function condAt(x,z){ // which kind of road surface is under (x,z)
  for(let j=0;j<ZS.length;j++){ const zz=ZS[j]; if(Math.abs(z-zz)<EWW(zz)/2) for(let i=0;i<XS.length-1;i++) if(x>XS[i]&&x<XS[i+1]) return EDGE_COND.get(ekey(idx(i,j),idx(i+1,j)))||'good'; }
  for(let i=0;i<XS.length;i++){ const xx=XS[i]; if(Math.abs(x-xx)<NSW(xx)/2) for(let j=0;j<ZS.length-1;j++) if(z>ZS[j]&&z<ZS[j+1]) return EDGE_COND.get(ekey(idx(i,j),idx(i,j+1)))||'good'; }
  return null; }
function potholeAt(x,z){ const a=PH_HASH.get(phk(Math.floor(x/PHC),Math.floor(z/PHC))); if(!a) return null; for(const p of a){ const dx=x-p.x, dz=z-p.z; if(dx*dx+dz*dz<p.r*p.r*.8) return p; } return null; }
// intersections
for(const n of nodes){ if(n.bridge) continue; const hx=NSW(n.x)/2, hz=EWW(n.z)/2;
  A.cross.quad([n.x-hx,.04,n.z+hz],[n.x+hx,.04,n.z+hz],[n.x+hx,.04,n.z-hz],[n.x-hx,.04,n.z-hz],[0,1,0],[[0,0],[1,0],[1,1],[0,1]],WHITE); }
// bridge + Lekki approach road
ribbon(A.road2,330+NSW(330)/2,BR.z,1075,BR.z,16,(x,z)=>(bridgeY(x,z)??0)+.03,4);
const PH_SETS=[];   // pothole decals; made into near-only draw sets once CullSet exists
const PH_MAT={dry:new THREE.MeshStandardMaterial({map:texPothole(false),transparent:true,depthWrite:false,roughness:.95,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6}),
  wet:new THREE.MeshStandardMaterial({map:texPothole(true),transparent:true,depthWrite:false,roughness:.06,metalness:.25,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6})};
{ const pg=new THREE.PlaneGeometry(2,2); pg.rotateX(-Math.PI/2);
  for(const wtr of [false,true]){ const list=POTHOLES.filter(p=>p.water===wtr).map(p=>({x:p.x,y:.05,z:p.z,ry:p.ry,sx:p.r*1.15,sz:p.r})); if(list.length) PH_SETS.push([pg,wtr?PH_MAT.wet:PH_MAT.dry,list]); } }

/* ================= blocks & slabs ================= */
const blocks=[];
for(let i=0;i<XS.length-1;i++) for(let j=0;j<ZS.length-1;j++){
  const sx0=XS[i]+NSW(XS[i])/2, sx1=XS[i+1]-NSW(XS[i+1])/2, sz0=ZS[j]+EWW(ZS[j])/2, sz1=ZS[j+1]-EWW(ZS[j+1])/2;
  blocks.push({i,j,sx0,sx1,sz0,sz1,x0:sx0+SIDE,x1:sx1-SIDE,z0:sz0+SIDE,z1:sz1-SIDE,marina:j===ZS.length-2,kind:(i===2&&j===3)?'square':(i===4&&j===2)?'apt':(i===5&&j===2)?'police':'normal'});
}
const bandN={x0:XS[0]-6-160,x1:345,z0:-446,z1:ZS[0]-6.5}, bandW={x0:-726,x1:XS[0]-6,z0:ZS[0]-6.5,z1:130};
const promS={x0:-726,x1:346,z0:130,z1:143.5};
const promE1={x0:337.5,x1:346,z0:-286.5,z1:BR.z-7.5}, promE2={x0:337.5,x1:346,z0:BR.z+7.5,z1:130};
const lekki={x0:1046,x1:1888,z0:-688,z1:388};
for(const b of blocks){ if(b.kind==='square') continue; slab(A.pave,A.curb,{x0:b.sx0,x1:b.sx1,z0:b.sz0,z1:b.sz1},SLAB); }
for(const r of [bandN,bandW,promS,promE1,promE2]) slab(A.pave,A.curb,r,SLAB);
slab(A.pave,A.curb,{x0:lekki.x0,x1:lekki.x1,z0:lekki.z0,z1:BR.z-7.5},SLAB);
slab(A.pave,A.curb,{x0:lekki.x0,x1:lekki.x1,z0:BR.z+7.5,z1:lekki.z1},SLAB);
slab(A.pave,A.curb,{x0:1075,x1:lekki.x1,z0:BR.z-7.5,z1:BR.z+7.5},SLAB);
for(const b of blocks) if(b.kind==='normal' && b.sx0>=0) topQ(A.grass,{x0:b.x0,x1:b.x1,z0:b.z0,z1:b.z1},SLAB+.012,WHITE,6);

/* ================= buildings ================= */
await step('Building face-me-I-face-you houses…', 34);
const MODELS={}; for(const r of await Promise.allSettled(modelJobs)){ if(r.status==='fulfilled'){ const [k,v]=r.value; MODELS[k]=v; } else console.warn('A 3D model could not load; using a built-in one.',r.reason); }
const HOUSES=!!(MODELS.bungalow&&MODELS.storey&&MODELS.house&&MODELS.station);
const roofProps={tank:[],ac:[],avi:[],tankB:[]};
const signSpots=[];
let signIdx=0;
function addBuilding(b,{collide=true,crown=true}={}){
  const type=b.type, tw=TILE[type][0], th=TILE[type][1];
  const col=new THREE.Color(b.col||pick(TINTS[type]||['#ffffff']));
  const base=b.shop?4.4:0, y0=b.y0??SLAB, top=y0+b.h;
  const zinc=!b.noZinc && b.h<17 && (type==='oldmid'||type==='resi') && R()<.82;
  if(b.shop) boxWalls(A.shop,b,y0,y0+4.4,TILE.shop[0],TILE.shop[1],ri(0,3)/4,0,WHITE);
  if(top>y0+base+.05) boxWalls(A[type],b,y0+base,top+(zinc?0:.9),tw,th,ri(0,7)/8,0,col);
  if(zinc){ const rise=addZinc(b,top,col); if(collide) addCol({x0:b.x0,x1:b.x1,z0:b.z0,z1:b.z1,h:top+rise}); return; }
  if(b.shop && top<=y0+base+.05) boxWalls(A.shop,b,top,top+.9,TILE.shop[0],TILE.shop[1],0,0,WHITE);
  const rc=new THREE.Color().setHSL(.08,.05,rr(.55,.75));
  boxWalls(A.roof,b,top,top+.9,4,4,0,0,rc,true);
  topQ(A.roof,b,top,rc,8);
  if(collide) addCol({x0:b.x0,x1:b.x1,z0:b.z0,z1:b.z1,h:top+1});
  const w=b.x1-b.x0, d=b.z1-b.z0;
  if(crown && b.h>65 && R()<.75){ const ins=rr(.12,.24); const c2={x0:b.x0+w*ins,x1:b.x1-w*ins,z0:b.z0+d*ins,z1:b.z1-d*ins,h:rr(6,18),type,col:'#ffffff',y0:top}; addBuilding(c2,{collide:false,crown:false});
    roofProps.avi.push({x:(c2.x0+c2.x1)/2,y:top+c2.h+1.6,z:(c2.z0+c2.z1)/2}); }
  else if(b.h>45) roofProps.avi.push({x:(b.x0+b.x1)/2,y:top+1.6,z:(b.z0+b.z1)/2});
  if(b.h<45 && (type==='oldmid'||type==='resi')){ const n=ri(1,3); for(let k=0;k<n;k++){ const t={x:rr(b.x0+1.6,b.x1-1.6),y:top,z:rr(b.z0+1.6,b.z1-1.6),sy:rr(.9,1.2)}; (R()<.7?roofProps.tank:roofProps.tankB).push(t); }
    if(R()<.6) roofProps.ac.push({x:rr(b.x0+1.5,b.x1-1.5),y:top+.3,z:rr(b.z0+1.5,b.z1-1.5),ry:R()*3}); }
}
const norm3=(x,y,z)=>{ const l=Math.hypot(x,y,z); return [x/l,y/l,z/l]; };
function addZinc(b,top,col){ const oh=.4, w=b.x1-b.x0, d=b.z1-b.z0, rise=Math.min(w,d)*rr(.16,.26), zc=new THREE.Color(pick(['#ffffff','#ead8c6','#d2c9bf','#f2e4d0','#c9b8a6']));
  const x0=b.x0-oh,x1=b.x1+oh,z0=b.z0-oh,z1=b.z1+oh,T=top,Y=top+rise;
  if(w>=d){ const zm=(b.z0+b.z1)/2, L=x1-x0, s=Math.hypot(zm-z0,rise);
    A.zinc.quad([x1,T,z0],[x0,T,z0],[x0,Y,zm],[x1,Y,zm],norm3(0,zm-z0,-rise),[[0,0],[L/2,0],[L/2,s/2],[0,s/2]],zc);
    A.zinc.quad([x0,T,z1],[x1,T,z1],[x1,Y,zm],[x0,Y,zm],norm3(0,z1-zm,rise),[[0,0],[L/2,0],[L/2,s/2],[0,s/2]],zc);
    A.fence.quad([b.x0,T,b.z0],[b.x0,T,b.z1],[b.x0,Y,zm],[b.x0,Y,zm],[-1,0,0],[[0,0],[d/6,0],[d/12,rise/3],[d/12,rise/3]],col);
    A.fence.quad([b.x1,T,b.z1],[b.x1,T,b.z0],[b.x1,Y,zm],[b.x1,Y,zm],[1,0,0],[[0,0],[d/6,0],[d/12,rise/3],[d/12,rise/3]],col); }
  else { const xm=(b.x0+b.x1)/2, L=z1-z0, s=Math.hypot(xm-x0,rise);
    A.zinc.quad([x0,T,z0],[x0,T,z1],[xm,Y,z1],[xm,Y,z0],norm3(-rise,xm-x0,0),[[0,0],[L/2,0],[L/2,s/2],[0,s/2]],zc);
    A.zinc.quad([x1,T,z1],[x1,T,z0],[xm,Y,z0],[xm,Y,z1],norm3(rise,x1-xm,0),[[0,0],[L/2,0],[L/2,s/2],[0,s/2]],zc);
    A.fence.quad([b.x0,T,b.z1],[b.x1,T,b.z1],[xm,Y,b.z1],[xm,Y,b.z1],[0,0,1],[[0,0],[w/6,0],[w/12,rise/3],[w/12,rise/3]],col);
    A.fence.quad([b.x1,T,b.z0],[b.x0,T,b.z0],[xm,Y,b.z0],[xm,Y,b.z0],[0,0,-1],[[0,0],[w/6,0],[w/12,rise/3],[w/12,rise/3]],col); }
  return rise; }
function signOn(b,blk){ // shop sign on the road-facing wall
  const dS=blk.z1-b.z1, dN=b.z0-blk.z0, dE=blk.x1-b.x1, dW=b.x0-blk.x0, m=Math.min(dS,dN,dE,dW); if(m>7) return;
  const k=signIdx++%SIGNS.length, cxm=(b.x0+b.x1)/2, czm=(b.z0+b.z1)/2; PLACES.push({name:SIGNS[k][0],sub:SIGNS[k][1],kind:placeKind(SIGNS[k][1]),x:cxm,z:czm,r:Math.max(b.x1-b.x0,b.z1-b.z0)/2}); const len=(m===dS||m===dN)?b.x1-b.x0:b.z1-b.z0; const w=Math.min(len*.85,6.4), h=w/4, o=.12;
  let p0,p1; if(m===dS){ p0=[cxm-w/2,b.z1+o]; p1=[cxm+w/2,b.z1+o]; } else if(m===dN){ p0=[cxm+w/2,b.z0-o]; p1=[cxm-w/2,b.z0-o]; } else if(m===dE){ p0=[b.x1+o,czm+w/2]; p1=[b.x1+o,czm-w/2]; } else { p0=[b.x0-o,czm-w/2]; p1=[b.x0-o,czm+w/2]; }
  const y0=SLAB+4.5, y1=y0+h, u0=(k%4)/4, u1=u0+.25, v1=1-Math.floor(k/4)/8, v0=v1-1/8;
  const dx=p1[0]-p0[0], dz=p1[1]-p0[1], L=Math.hypot(dx,dz);
  A.sign.quad([p0[0],y0,p0[1]],[p1[0],y0,p1[1]],[p1[0],y1,p1[1]],[p0[0],y1,p0[1]],[-dz/L,0,dx/L],[[u0,v0],[u1,v0],[u1,v1],[u0,v1]],WHITE); }
function genLots(x0,z0,x1,z1,maxS,out){ const w=x1-x0, d=z1-z0; if(w<9||d<9) return;
  if(w>maxS||d>maxS){ if(w>=d){ const s=x0+w*rr(.36,.64); genLots(x0,z0,s,z1,maxS,out); genLots(s,z0,x1,z1,maxS,out); } else { const s=z0+d*rr(.36,.64); genLots(x0,z0,x1,s,maxS,out); genLots(x0,s,x1,z1,maxS,out); } }
  else out.push({x0,z0,x1,z1}); }
function planLot(l,ctx){
  const cx=(l.x0+l.x1)/2, ins=rr(1.4,3.2); const b={x0:l.x0+ins,x1:l.x1-ins,z0:l.z0+ins,z1:l.z1-ins};
  if(b.x1-b.x0<6||b.z1-b.z0<6) return null;
  const r=R();
  if(ctx==='marina'){ if(r<.3){ b.h=rr(15,26); b.type='office'; } else if(r<.38){ b.h=rr(24,34); b.type='glass'; } else { b.h=3.4*ri(0,3)+4.4; b.type='oldmid'; b.shop=true; } }
  else if(ctx==='island'){ if(r<.88){ b.h=3.4*ri(0,2)+4.4; b.type='oldmid'; b.shop=true; } else { b.h=rr(11,17); b.type='office'; } }
  else if(ctx==='ikoyi'){ if(r<.35){ b.villa=true; b.h=rr(6,8.5); b.type='resi'; } else if(r<.7){ b.h=3.4*ri(0,2)+4.4; b.type='oldmid'; b.shop=true; } else { b.h=3.2*ri(2,4)+.4; b.type='resi'; } }
  else if(ctx==='ikoyiM'){ if(r<.25){ b.h=rr(16,26); b.type='resi'; } else { b.h=3.4*ri(0,3)+4.4; b.type='oldmid'; b.shop=true; } }
  else { if(r<.12){ b.h=rr(11,17); b.type=pick(['office','resi']); } else if(r<.55){ b.h=3.4*ri(1,2)+.6; b.type='resi'; } else { b.h=3.4*ri(0,2)+4.4; b.type='oldmid'; b.shop=R()<.4; } }
  return b; }
function fillRect(rect,ctx,maxS,blk,collide=true){ const lots=[]; genLots(rect.x0,rect.z0,rect.x1,rect.z1,maxS,lots);
  for(const l of lots){ const b=planLot(l,ctx); if(!b) continue;
    if(b.villa){ const f={x0:l.x0+.4,x1:l.x1-.4,z0:l.z0+.4,z1:l.z1-.4}; const fc=new THREE.Color(pick(['#efe6d6','#e9dcc5','#f4efe6','#dfe6e8']));
      boxWalls(A.fence,f,SLAB,SLAB+2.3,6,3,0,0,fc); boxWalls(A.fence,f,SLAB,SLAB+2.3,6,3,0,0,fc,true); topQ(A.fence,{x0:f.x0-.05,x1:f.x1+.05,z0:f.z0-.05,z1:f.z1+.05},SLAB+2.3,fc,4);
      const t=.25; for(const r2 of [{x0:f.x0,x1:f.x1,z0:f.z0,z1:f.z0+t},{x0:f.x0,x1:f.x1,z0:f.z1-t,z1:f.z1},{x0:f.x0,x1:f.x0+t,z0:f.z0,z1:f.z1},{x0:f.x1-t,x1:f.x1,z0:f.z0,z1:f.z1}]) if(collide) addCol({...r2,h:SLAB+2.4});
      const ins=rr(3.5,5.5); Object.assign(b,{x0:l.x0+ins,x1:l.x1-ins,z0:l.z0+ins,z1:l.z1-ins}); if(b.x1-b.x0<5||b.z1-b.z0<5) continue; }
    addBuilding(b,{collide}); if(b.shop && blk) signOn(b,blk); } }

const houseInst={};
function addHouse(key,x,z,ry,sc){ (houseInst[key]||(houseInst[key]=[])).push({x,z,ry,sc}); }
const WALLC=['#e9dcc5','#d9cdb8','#efe6d6','#cfc3ae','#e3d2b6','#bfb3a0'];
function compoundWall(l,face,collide){ const t=.22, h=2.1, i=.5, x0=l.x0+i, x1=l.x1-i, z0=l.z0+i, z1=l.z1-i, g=1.9, cxm=(x0+x1)/2, czm=(z0+z1)/2, fc=new THREE.Color(pick(WALLC)), segs=[];
  const Hs=(za,xa,xb)=>segs.push({x0:xa,x1:xb,z0:za-t/2,z1:za+t/2}), Vs=(xa,za,zb)=>segs.push({x0:xa-t/2,x1:xa+t/2,z0:za,z1:zb});
  if(face==='s'){ Hs(z1,x0,cxm-g); Hs(z1,cxm+g,x1); } else Hs(z1,x0,x1);
  if(face==='n'){ Hs(z0,x0,cxm-g); Hs(z0,cxm+g,x1); } else Hs(z0,x0,x1);
  if(face==='e'){ Vs(x1,z0,czm-g); Vs(x1,czm+g,z1); } else Vs(x1,z0,z1);
  if(face==='w'){ Vs(x0,z0,czm-g); Vs(x0,czm+g,z1); } else Vs(x0,z0,z1);
  for(const r of segs){ if(r.x1-r.x0<.05||r.z1-r.z0<.05) continue; boxWalls(A.fence,r,SLAB,SLAB+h,6,3,0,0,fc); topQ(A.fence,r,SLAB+h,fc,4); if(collide) addCol({...r,h:SLAB+h}); } }
function fillGhetto(rect,blk,collide=true){ const lots=[]; genLots(rect.x0,rect.z0,rect.x1,rect.z1,27,lots);
  for(const l of lots){ const w=l.x1-l.x0, d=l.z1-l.z0, cx=(l.x0+l.x1)/2, cz=(l.z0+l.z1)/2;
    let face='s', dm=1e9; const ds={s:blk.z1-l.z1,n:l.z0-blk.z0,e:blk.x1-l.x1,w:l.x0-blk.x0}; for(const k in ds) if(ds[k]<dm){ dm=ds[k]; face=k; }
    if(dm<3&&R()<.42){ const b=planLot(l,'island'); if(b){ b.h=R()<.6?4.4:7.8; addBuilding(b,{collide}); if(blk.real) signOn(b,blk); } continue; }
    const rot90=face==='e'||face==='w', ry={s:0,n:Math.PI,e:Math.PI/2,w:-Math.PI/2}[face];
    if(MODELS.office&&blk.main&&dm<4&&w>=17&&d>=17&&officeN<9&&R()<.45){ const M=MODELS.office; let ow=M.W, od=M.D; if(rot90){ const t=ow; ow=od; od=t; } const sc=Math.min((w-2)/ow,(d-2)/od,1);
      if(sc>.7){ addHouse('office',cx,cz,ry,sc); officeN++; if(collide) addCol({x0:cx-ow*sc/2,x1:cx+ow*sc/2,z0:cz-od*sc/2,z1:cz+od*sc/2,h:M.H*sc+SLAB}); PLACES.push({name:['Eko Microfinance Bank','Unity Office Plaza','Naija Tech Hub','Lagos Trust Bank','Mainland Insurance','Oluwole Chambers','Ajose Towers','First Street Bank','Ikeja Telecom'][officeN-1],sub:'Offices',kind:'office',x:cx,z:cz,r:Math.max(ow,od)*sc/2}); continue; } }
    const key=pick(w>=15&&d>=15?['house','storey','bungalow','storey']:['bungalow','storey']), M=MODELS[key];
    let fw=M.W, fd=M.D; if(rot90){ const t=fw; fw=fd; fd=t; }
    const sc=Math.min((w-3)/fw,(d-3)/fd,1.1)*rr(.95,1);
    if(sc<.66){ const b=planLot(l,'island'); if(b){ addBuilding(b,{collide}); if(b.shop&&blk.real) signOn(b,blk); } continue; }
    addHouse(key,cx,cz,ry,sc); if(collide) addCol({x0:cx-fw*sc/2,x1:cx+fw*sc/2,z0:cz-fd*sc/2,z1:cz+fd*sc/2,h:M.H*sc+SLAB});
    if(R()<.7) compoundWall(l,face,collide); } }
const STATION={x:265,z:0,label:null}; let officeN=0;
for(const blk of blocks){ blk.real=true; blk.main=blk.marina||blk.i===5||blk.j===0;
  if(HOUSES&&blk.kind!=='square'){
    if(blk.kind==='apt'){ for(const r of [{x0:blk.x0,x1:73,z0:blk.z0,z1:blk.z1},{x0:113,x1:blk.x1,z0:blk.z0,z1:blk.z1},{x0:73,x1:113,z0:blk.z0,z1:-7}]) fillGhetto(r,blk);
      addBuilding({x0:78,x1:108,z0:-2,z1:22,h:10.6,type:'resi',col:'#f1dfc2',noZinc:true},{crown:false}); continue; }
    if(blk.kind==='police'){ const M=MODELS.station; STATION.z=blk.z1-M.D/2-1.5; addHouse('station',STATION.x,STATION.z,0,1);
      addCol({x0:STATION.x-M.W/2,x1:STATION.x+M.W/2,z0:STATION.z-M.D/2,z1:STATION.z+M.D/2,h:M.H+SLAB});
      for(const r of [{x0:blk.x0,x1:STATION.x-M.W/2-2,z0:blk.z0,z1:blk.z1},{x0:STATION.x+M.W/2+2,x1:blk.x1,z0:blk.z0,z1:blk.z1},{x0:STATION.x-M.W/2-2,x1:STATION.x+M.W/2+2,z0:blk.z0,z1:STATION.z-M.D/2-2}]) fillGhetto(r,blk);
      continue; }
    fillGhetto({x0:blk.x0,x1:blk.x1,z0:blk.z0,z1:blk.z1},blk); continue; }
  const isl=blk.sx0<0, ctx=blk.marina?(isl?'marina':'ikoyiM'):(isl?'island':'ikoyi'), maxS=blk.marina?(isl?46:44):(isl?28:40);
  if(blk.kind==='square') continue;
  if(blk.kind==='apt'){ const ax={x0:78,x1:108,z0:-2,z1:22};
    for(const r of [{x0:blk.x0,x1:73,z0:blk.z0,z1:blk.z1},{x0:113,x1:blk.x1,z0:blk.z0,z1:blk.z1},{x0:73,x1:113,z0:blk.z0,z1:-7}]) fillRect(r,ctx,maxS,blk);
    addBuilding({...ax,h:10.6,type:'resi',col:'#f1dfc2',noZinc:true},{crown:false}); continue; }
  fillRect({x0:blk.x0,x1:blk.x1,z0:blk.z0,z1:blk.z1},ctx,maxS,blk);
}
if(HOUSES){ fillGhetto({x0:bandN.x0+2,x1:bandN.x1-12,z0:bandN.z0+2,z1:bandN.z1-SIDE},{x0:-1e9,x1:1e9,z0:-1e9,z1:bandN.z1-SIDE});
  fillGhetto({x0:bandW.x0+2,x1:bandW.x1-SIDE,z0:bandW.z0+SIDE,z1:bandW.z1-12},{x0:-1e9,x1:bandW.x1-SIDE,z0:-1e9,z1:1e9}); }
else { fillRect({x0:bandN.x0+2,x1:bandN.x1-12,z0:bandN.z0+2,z1:bandN.z1-SIDE},'island',34,null);
  fillRect({x0:bandW.x0+2,x1:bandW.x1-SIDE,z0:bandW.z0+SIDE,z1:bandW.z1-12},'island',30,null); }
/* per-instance culling + level of detail: only instances near the camera (or inside the shadow area) are drawn */
const CULLS=[]; const _fr=new THREE.Frustum(), _pm=new THREE.Matrix4(), _sph=new THREE.Sphere();
class CullSet{ // levels: [{geo,mat,dist,shadow}] sorted by dist ; items: {x,y,z,ry,sc|sx,sy,sz,r}
  constructor(levels,items,{shadowDist=0,layer=1,name=''}={}){
    // only things near the player go into the shadow map: a shadow-casting level is split at the shadow area's edge
    const SR=Q.shR+10, exp=[]; for(const L of levels){ const prev=exp.length?exp[exp.length-1].dist:0;
      if(L.shadow&&L.dist>SR&&prev<SR){ exp.push({...L,dist:SR,shadow:true}); exp.push({...L,shadow:false}); } else if(L.shadow&&prev>=SR) exp.push({...L,shadow:false}); else exp.push(L); }
    levels=exp; this.items=items; this.levels=levels; this.shadowDist=shadowDist; this.name=name;
    for(const it of items){ _e.set(it.rx||0,it.ry||0,it.rz||0,'YXZ'); _q.setFromEuler(_e); _p.set(it.x,it.y??SLAB,it.z); if(it.sc!==undefined) _s.setScalar(it.sc); else _s.set(it.sx??1,it.sy??1,it.sz??1); _m.compose(_p,_q,_s); it.m=_m.toArray(); it.lv=-1;
      if(!it.r){ const g=levels[0].geo; if(!g.boundingSphere) g.computeBoundingSphere(); const c=g.boundingSphere.center, ry=it.ry||0; it.r=g.boundingSphere.radius*Math.max(_s.x,_s.y,_s.z); it.cy=(it.y??SLAB)+c.y*_s.y;
        it.wx=it.x+(c.x*Math.cos(ry)+c.z*Math.sin(ry))*_s.x; it.wz=it.z+(-c.x*Math.sin(ry)+c.z*Math.cos(ry))*_s.z; } }
    this.col=items.length&&items[0].col; this.meshes=levels.map(L=>{ const im=new THREE.InstancedMesh(L.geo,L.mat,items.length); im.count=0; if(this.col) im.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(items.length*3),3); im.frustumCulled=false; im.castShadow=!!L.shadow; im.receiveShadow=true; im.layers.set(layer); scene.add(im); return im; });
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
        let l=0; while(l<n-1&&d>L[l].dist) l++;
        ms[l].instanceMatrix.array.set(it.m,cnt[l]*16); if(this.col){ const a=ms[l].instanceColor.array, j=cnt[l]*3; a[j]=it.col.r; a[j+1]=it.col.g; a[j+2]=it.col.b; } cnt[l]++; } }
    for(let l=0;l<n;l++){ const im=ms[l]; if(im.count!==cnt[l]||cnt[l]) { im.count=cnt[l]; im.instanceMatrix.clearUpdateRanges(); im.instanceMatrix.addUpdateRange(0,cnt[l]*16); im.instanceMatrix.needsUpdate=true; if(this.col) im.instanceColor.needsUpdate=true; } im.visible=cnt[l]>0; } } }
for(const [g,m,l] of PH_SETS) new CullSet([{geo:g,mat:m,dist:Math.min(140,Q.draw*.6),shadow:false}],l,{shadowDist:0,layer:0,name:'potholes'});
function updateCulls(){ camera.updateMatrixWorld(); _pm.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm); const cx=camera.position.x, cz=camera.position.z; for(const c of CULLS) c.update(cx,cz); }
function modelLevels(M,near,far,shadowNear=true){ return M.geo1?[{geo:M.geo,mat:M.mat,dist:near,shadow:shadowNear},{geo:M.geo1,mat:M.mat1,dist:far,shadow:false}]:[{geo:M.geo,mat:M.mat,dist:far,shadow:shadowNear}]; }
if(HOUSES){
  for(const key in houseInst){ const M=MODELS[key]; new CullSet(modelLevels(M,key==='station'||key==='office'?Q.lod0*1.6:Q.lod0,Q.draw+40),houseInst[key].map(h=>({x:h.x,y:SLAB,z:h.z,ry:h.ry,sc:h.sc})),{shadowDist:Q.shR,name:key}); }
  const lab=new THREE.Sprite(new THREE.SpriteMaterial({map:texLabel('POLICE STATION','#1d3a8a','#ffffff'),fog:false})); lab.scale.set(5.5,1.05,1); lab.position.set(STATION.x,SLAB+MODELS.station.H+2.2,STATION.z+MODELS.station.D/2); lab.layers.set(1); scene.add(lab); }
fillRect({x0:1092,x1:1500,z0:-640,z1:BR.z-14},'far',50,null);
fillRect({x0:1092,x1:1500,z0:BR.z+14,z1:360},'far',50,null);
fillRect({x0:-650,x1:1080,z0:455,z1:720},'far',60,null,false);

/* apartment entrance details */
const APT={door:{x:93,z:22.1},front:{x:93,z:24.4}};
{ const canopy=new THREE.Mesh(new THREE.BoxGeometry(6,.25,3),MAT.conc); canopy.position.set(93,SLAB+3.6,23.4); canopy.castShadow=true; scene.add(canopy);
  for(const sx of [-2.7,2.7]){ const p=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,3.5,10),MAT.conc); p.position.set(93+sx,SLAB+1.75,24.7); p.castShadow=true; scene.add(p); }
  const door=new THREE.Mesh(new THREE.BoxGeometry(2.4,2.8,.12),new THREE.MeshStandardMaterial({color:0x2a2018,roughness:.5,emissive:0xffb873,emissiveIntensity:.0})); door.position.set(93,SLAB+1.4,22.06); scene.add(door); APT.doorMesh=door;
  const ring=new THREE.Mesh(new THREE.RingGeometry(.9,1.15,48),new THREE.MeshBasicMaterial({color:0xF2B705,transparent:true,opacity:.8,depthWrite:false,fog:false})); ring.rotation.x=-Math.PI/2; ring.position.set(93,SLAB+.04,24.4); ring.layers.set(1); scene.add(ring); APT.ring=ring;
  const lab=new THREE.Sprite(new THREE.SpriteMaterial({map:texLabel('YOUR HOUSE'),transparent:true,depthTest:true,fog:false})); lab.scale.set(4.2,.8,1); lab.position.set(93,SLAB+5.2,24); lab.layers.set(1); scene.add(lab); APT.label=lab; }

/* ================= Freedom Square ================= */
const SQ=blocks.find(b=>b.kind==='square');
const flags=[];
{ const r={x0:SQ.sx0,x1:SQ.sx1,z0:SQ.sz0,z1:SQ.sz1}; slab(A.plaza,A.curb,r,SLAB,8);
  const cx=(r.x0+r.x1)/2, cz=(r.z0+r.z1)/2;
  for(const [gx,gz] of [[-1,-1],[1,-1],[-1,1],[1,1]]) topQ(A.grass,{x0:cx+gx*14-(gx<0?30:0),x1:cx+gx*14+(gx>0?30:0),z0:cz+gz*9-(gz<0?16:0),z1:cz+gz*9+(gz>0?16:0)},SLAB+.012,WHITE,6);
  const stone=new THREE.MeshStandardMaterial({color:0xece6da,roughness:.6}); const gold=new THREE.MeshStandardMaterial({color:0xd4a437,metalness:1,roughness:.25});
  const base=new THREE.Mesh(new THREE.BoxGeometry(9,1.4,9),stone); base.position.set(cx,SLAB+.7,cz);
  const base2=new THREE.Mesh(new THREE.BoxGeometry(6,1.2,6),stone); base2.position.set(cx,SLAB+2,cz);
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.9,28,4,1),stone); shaft.rotation.y=Math.PI/4; shaft.position.set(cx,SLAB+16.6,cz);
  const tip=new THREE.Mesh(new THREE.ConeGeometry(1.25,2.6,4),gold); tip.rotation.y=Math.PI/4; tip.position.set(cx,SLAB+31.9,cz);
  for(const m of [base,base2,shaft,tip]){ m.castShadow=m.receiveShadow=true; scene.add(m); }
  addCol({x0:cx-4.5,x1:cx+4.5,z0:cz-4.5,z1:cz+4.5,h:33});
  const [fc,fg]=cv(128,64); fg.fillStyle='#008751'; fg.fillRect(0,0,128,64); fg.fillStyle='#fff'; fg.fillRect(43,0,42,64); const flagT=tx(fc,true,false);
  const flagM=new THREE.MeshStandardMaterial({map:flagT,side:THREE.DoubleSide,roughness:.8});
  const pole=new THREE.MeshStandardMaterial({color:0xcfd3d6,metalness:.9,roughness:.3});
  [-14,0,14].forEach(dx=>{ const px=cx+dx, pz=r.z1-6; const p=new THREE.Mesh(new THREE.CylinderGeometry(.09,.13,14,10),pole); p.position.set(px,SLAB+7,pz); p.castShadow=true; scene.add(p);
    const fgeo=new THREE.PlaneGeometry(3.6,1.8,18,8); fgeo.translate(1.8,0,0); const f=new THREE.Mesh(fgeo,flagM); f.position.set(px+.1,SLAB+12.9,pz); f.castShadow=true; scene.add(f); flags.push({mesh:f,base:fgeo.attributes.position.array.slice(),ph:MR()*6}); });
  const benchG=mergeList([box(2,.08,.5,0,.48,0),box(2,.5,.08,0,.75,-.22),box(.1,.45,.45,-.9,.23,0),box(.1,.45,.45,.9,.23,0)]);
  const benches=[]; for(const s of [-1,1]) for(let k=-3;k<=3;k++) if(k) benches.push({x:cx+k*9,y:SLAB,z:cz+s*20,ry:s>0?Math.PI:0});
  inst(benchG,new THREE.MeshStandardMaterial({color:0x6b5440,roughness:.7}),benches);
  const lab=new THREE.Sprite(new THREE.SpriteMaterial({map:texLabel('FREEDOM SQUARE','#16A06B','#F7EFDF'),fog:false})); lab.scale.set(7,1.3,1); lab.position.set(cx,SLAB+4.2,cz+5); lab.layers.set(1); scene.add(lab); }

function box(w,h,d,x,y,z,rz=0,ry=0){ const g=new THREE.BoxGeometry(w,h,d); if(rz) g.rotateZ(rz); if(ry) g.rotateY(ry); g.translate(x,y,z); return g; }
function mergeList(list){ const arr=list.map(g=>{ const n=g.index?g.toNonIndexed():g; for(const k of Object.keys(n.attributes)) if(!['position','normal','uv'].includes(k)) n.deleteAttribute(k); return n; }); return mergeGeometries(arr,false); }

/* ================= Link Bridge ================= */
await step('Stringing the Link Bridge cables…', 46);
const bridgeParts={cableMat:null,deckLights:null};
{ const deck=new Acc(), rail=new Acc(); const zN=BR.z-BR.hw, zS=BR.z+BR.hw; const stepX=6; const cc=new THREE.Color('#d8d4cc');
  for(let x=BR.x0;x<BR.x1;x+=stepX){ const xa=x, xb=Math.min(x+stepX,BR.x1), ya=bridgeY(xa+.01,BR.z)??0, yb=bridgeY(xb-.01,BR.z)??0;
    deck.quad([xb,ya-1.5+(yb-ya),zN],[xa,ya-1.5,zN],[xa,ya,zN],[xb,yb,zN],[0,0,-1],[[0,0],[1,0],[1,1],[0,1]],cc);
    deck.quad([xa,ya-1.5,zS],[xb,yb-1.5,zS],[xb,yb,zS],[xa,ya,zS],[0,0,1],[[0,0],[1,0],[1,1],[0,1]],cc);
    deck.quad([xa,ya-1.5,zN],[xb,yb-1.5,zN],[xb,yb-1.5,zS],[xa,ya-1.5,zS],[0,-1,0],[[0,0],[1,0],[1,1],[0,1]],cc);
    for(const zr of [zN+.25,zS-.25]){ const s=zr<BR.z?-1:1;
      rail.quad(s<0?[xb,yb,zr]:[xa,ya,zr], s<0?[xa,ya,zr]:[xb,yb,zr], s<0?[xa,ya+1.05,zr]:[xb,yb+1.05,zr], s<0?[xb,yb+1.05,zr]:[xa,ya+1.05,zr],[0,0,s],[[0,0],[1,0],[1,1],[0,1]],cc);
      rail.quad(s>0?[xb,yb,zr-.01*s]:[xa,ya,zr-.01*s], s>0?[xa,ya,zr-.01*s]:[xb,yb,zr-.01*s], s>0?[xa,ya+1.05,zr-.01*s]:[xb,yb+1.05,zr-.01*s], s>0?[xb,yb+1.05,zr-.01*s]:[xa,ya+1.05,zr-.01*s],[0,0,-s],[[0,0],[1,0],[1,1],[0,1]],cc); } }
  scene.add(deck.mesh(MAT.conc)); scene.add(rail.mesh(MAT.conc));
  addCol({x0:BR.x0+60,x1:BR.x1-60,z0:zN-.5,z1:zN+.35,h:1}); addCol({x0:BR.x0+60,x1:BR.x1-60,z0:zS-.35,z1:zS+.5,h:1});
  const piers=[]; for(let x=BR.x0+40;x<BR.x1-30;x+=48){ if(Math.abs(x-BR.px)<30) continue; const y=bridgeY(x,BR.z); if(y<2.5) continue; piers.push({x,y:-2,z:BR.z,sy:y-1.5+2}); }
  const pierG=new THREE.BoxGeometry(2.6,1,11); pierG.translate(0,.5,0); inst(pierG,MAT.conc.clone(),piers);
  const pyl=new THREE.MeshStandardMaterial({color:0xeeeae2,roughness:.55});
  const beam=(p,q,w)=>{ const d=new THREE.Vector3().subVectors(q,p), L=d.length(); const m=new THREE.Mesh(new THREE.BoxGeometry(w,L,w),pyl); m.position.copy(p).addScaledVector(d,.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()); m.castShadow=m.receiveShadow=true; scene.add(m); };
  const apex=new THREE.Vector3(BR.px,98,BR.z);
  beam(new THREE.Vector3(BR.px,-2,BR.z-10.5),apex,2.4); beam(new THREE.Vector3(BR.px,-2,BR.z+10.5),apex,2.4);
  beam(new THREE.Vector3(BR.px,BR.top-1.2,BR.z-9.7),new THREE.Vector3(BR.px,BR.top-1.2,BR.z+9.7),1.6);
  beam(apex,new THREE.Vector3(BR.px,108,BR.z),1.8);
  addCol({x0:BR.px-1.6,x1:BR.px+1.6,z0:BR.z-12,z1:BR.z-8.2,h:100}); addCol({x0:BR.px-1.6,x1:BR.px+1.6,z0:BR.z+8.2,z1:BR.z+12,h:100});
  const cables=[]; const up=new THREE.Vector3(0,1,0);
  for(const sx of [-1,1]) for(const sz of [-1,1]) for(let k=1;k<=11;k++){
    const ay=96-k*2.6, lean=10.5*(98-ay)/100; const a=new THREE.Vector3(BR.px+sx*1.2,ay,BR.z+sz*lean); const bx=BR.px+sx*k*27; const b=new THREE.Vector3(bx,(bridgeY(bx,BR.z)??0)+.9,BR.z+sz*7.6);
    const d=new THREE.Vector3().subVectors(b,a), L=d.length(); _q.setFromUnitVectors(up,d.clone().normalize()); _e.setFromQuaternion(_q,'YXZ');
    cables.push({x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2,rx:_e.x,ry:_e.y,rz:_e.z,sy:L}); }
  bridgeParts.cableMat=new THREE.MeshStandardMaterial({color:0xe6e9ec,metalness:.6,roughness:.35,emissive:0xff2fa0,emissiveIntensity:0});
  inst(new THREE.CylinderGeometry(.09,.09,1,6),bridgeParts.cableMat,cables,{shadow:false});
  const bl=[]; for(let x=BR.x0+10;x<BR.x1;x+=18){ const y=bridgeY(x,BR.z)??0; bl.push({x,y:y+1.15,z:BR.z-BR.hw+.25},{x,y:y+1.15,z:BR.z+BR.hw-.25}); }
  bridgeParts.deckLightMat=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x8fd8ff,emissiveIntensity:0});
  inst(new THREE.SphereGeometry(.16,8,6),bridgeParts.deckLightMat,bl,{shadow:false});
  // Lekki barrier
  const stripe=(()=>{ const [c,g]=cv(128,32); for(let i=0;i<8;i++){ g.fillStyle=i%2?'#f2f2f2':'#d0312d'; g.fillRect(i*16,0,16,32); } return tx(c,true,true); })();
  const bar=new THREE.Mesh(new THREE.BoxGeometry(.6,1.1,15),new THREE.MeshStandardMaterial({map:stripe,roughness:.6})); bar.position.set(1068,SLAB+.55,BR.z); bar.castShadow=true; scene.add(bar);
  addCol({x0:1067.6,x1:1068.4,z0:BR.z-7.6,z1:BR.z+7.6,h:1.2});
  const ls=new THREE.Sprite(new THREE.SpriteMaterial({map:texLabel('LEKKI · ROAD WORKS AHEAD','#d0312d','#ffffff'),fog:false})); ls.scale.set(8,1.5,1); ls.position.set(1068,SLAB+3.2,BR.z); ls.layers.set(1); scene.add(ls); }

/* ================= billboards ================= */
const billboardMats=[];
{ const bbs=[[texBillboard('LAGOS NO DEY CARRY LAST','Eko o ni baje · Since forever','#0f6e78','#16a06b','#ffffff')],[texBillboard('NAIJA STREETS','The city is yours · Coming soon','#111111','#3a2412','#F2B705')],[texBillboard('JOLLOF FRIDAY','Mama Put · Broad Street · Open till late','#c0392b','#e8590c','#fff3bf')]];
  const places=[{x:-80,z:139,ry:Math.PI,y:SLAB+10},{x:343.5,z:-110,ry:-Math.PI/2,y:SLAB+10},{x:-240,z:47.6,ry:Math.PI,y:SLAB+9}];
  const legM=new THREE.MeshStandardMaterial({color:0x40444a,metalness:.7,roughness:.4});
  places.forEach((p,i)=>{ const m=new THREE.MeshStandardMaterial({map:bbs[i][0],emissiveMap:bbs[i][0],emissive:0xffffff,emissiveIntensity:0,roughness:.55}); const g=new THREE.Group();
    const face=new THREE.Mesh(new THREE.PlaneGeometry(14,5.25),m); face.position.y=p.y; const back=new THREE.Mesh(new THREE.BoxGeometry(14.3,5.5,.3),legM); back.position.set(0,p.y,-.18);
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(.35,.45,p.y-2.6,10),legM); leg.position.y=(p.y-2.6)/2; g.add(face,back,leg); g.traverse(o=>{if(o.isMesh){o.castShadow=true;}});
    g.position.set(p.x,0,p.z); g.rotation.y=p.ry; scene.add(g); billboardMats.push(m); addCol({x0:p.x-.5,x1:p.x+.5,z0:p.z-.5,z1:p.z+.5,h:p.y+3}); }); }
/* ================= finalize static meshes ================= */
await step('Painting windows and shop signs…', 56);
for(const k of [...FAC_KEYS,'roof','zinc','fence']){ const m=A[k].mesh(MAT[k]); if(m) scene.add(m); }
for(const k of ['curb','pave','plaza','grass','road2','road4','cross','sign','roadBad2','roadBad4','dirt']){ const m=A[k].mesh(MAT[k],false,true); if(m) scene.add(m); }

/* ================= props ================= */
await step('Planting palms on the Marina…', 64);
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
const palms=[];
function addPalm(x,z){ if(onRoad(x,z)) return; if(Math.abs(x+80)<4&&z>134) return; palms.push({x,y:SLAB,z,sy:rr(7,11.5),rx:rr(-.13,.13),ry:rr(0,6.28)}); }
for(let x=-715;x<340;x+=rr(11,15)) addPalm(x,138.5);
for(let z=-280;z<126;z+=rr(12,16)) if(Math.abs(z-BR.z)>14) addPalm(342,z);
for(let x=SQ.sx0+5;x<SQ.sx1-3;x+=12){ addPalm(x,SQ.sz0+4.5); addPalm(x,SQ.sz1-4.5); }
for(let x=1082;x<1300;x+=rr(14,20)){ addPalm(x,BR.z-11); addPalm(x,BR.z+11); }
const trunkM=new THREE.MeshStandardMaterial({color:0x7a6450,roughness:.95});
{ const trunkG=new THREE.CylinderGeometry(.16,.27,1,7,6); trunkG.translate(0,.5,0); new CullSet([{geo:trunkG,mat:trunkM,dist:Q.draw*.8,shadow:true}],palms,{shadowDist:35});
  const fr=palms.map(p=>({x:p.x+p.sy*Math.sin(p.ry)*Math.sin(p.rx),y:p.y+p.sy*Math.cos(p.rx),z:p.z+p.sy*Math.cos(p.ry)*Math.sin(p.rx),ry:R()*6.28}));
  new CullSet([{geo:frondGeo(),mat:new THREE.MeshStandardMaterial({color:0x3f7d32,roughness:.8,side:THREE.DoubleSide}),dist:Q.draw*.8,shadow:true}],fr,{shadowDist:35}); }
{ const trees=[];
  for(const [a,b] of EDGES){ if(a>b) continue; const A0=nodes[a],B0=nodes[b]; if(A0.bridge||B0.bridge||Math.min(A0.x,B0.x)<0) continue;
    const dx=B0.x-A0.x,dz=B0.z-A0.z,L=Math.hypot(dx,dz),fx=dx/L,fz=dz/L,rx=-fz,rz=fx,hw=edgeHalf(A0,B0);
    for(let s=crossHalf(A0,fx)+10;s<L-crossHalf(B0,fx)-8;s+=rr(15,22)) for(const sd of [-1,1]){ if(R()<.2) continue; const x=A0.x+fx*s+rx*sd*(hw+4.2), z=A0.z+fz*s+rz*sd*(hw+4.2);
      if(Math.abs(x-93)<8&&Math.abs(z-30)<8) continue;
      trees.push({x,y:SLAB,z,ry:R()*6,sx:rr(.8,1.15),sy:rr(.85,1.2),sz:rr(.8,1.15),col:new THREE.Color().setHSL(rr(.24,.33),rr(.35,.55),rr(.2,.3))}); } }
  const tt=new THREE.CylinderGeometry(.16,.24,4.4,7); tt.translate(0,2.2,0); new CullSet([{geo:tt,mat:trunkM,dist:Q.draw*.75,shadow:true}],trees.map(t=>({...t,col:undefined})),{shadowDist:35});
  const blob=(r,x,y,z)=>{ const g=new THREE.IcosahedronGeometry(r,1); g.translate(x,y,z); return g; };
  new CullSet([{geo:mergeList([blob(2.3,0,5.4,0),blob(1.7,1.4,4.8,.6),blob(1.8,-1.2,5,-.8),blob(1.5,.2,6.6,.3)]),mat:new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,flatShading:true}),dist:Q.draw*.75,shadow:true}],trees,{shadowDist:40}); }
const poles=[], heads=[], pools=[];
function lampsAlong(x0,z0,x1,z1,hw,stepL,yFn){ const dx=x1-x0,dz=z1-z0,L=Math.hypot(dx,dz),fx=dx/L,fz=dz/L,rx=-fz,rz=fx;
  for(let s=10;s<L-6;s+=stepL) for(const sd of [-1,1]){ const bx=x0+fx*s+rx*sd*(hw+.9), bz=z0+fz*s+rz*sd*(hw+.9), ax=-rx*sd, az=-rz*sd, ry=Math.atan2(-az,ax), y=yFn(bx,bz);
    poles.push({x:bx,y,z:bz,ry}); const hx=bx+ax*1.75, hz=bz+az*1.75; heads.push({x:hx,y:y+7.84,z:hz,ry}); pools.push({x:hx,y:yFn(hx,hz)+.08,z:hz,sx:15,sz:15}); } }
for(const [a,b] of EDGES){ if(a>b) continue; const A0=nodes[a],B0=nodes[b]; if(A0.bridge||B0.bridge) continue; const dx=B0.x-A0.x,dz=B0.z-A0.z,L=Math.hypot(dx,dz),fx=dx/L,fz=dz/L,sa=crossHalf(A0,fx),sb=crossHalf(B0,fx);
  lampsAlong(A0.x+fx*sa,A0.z+fz*sa,B0.x-fx*sb,B0.z-fz*sb,edgeHalf(A0,B0),34,()=>SLAB); }
lampsAlong(352,BR.z,1040,BR.z,6.85,36,(x)=>bridgeY(x,BR.z)??0);
const poleG=mergeList([(()=>{ const g=new THREE.CylinderGeometry(.08,.13,8,8); g.translate(0,4,0); return g; })(),box(1.85,.1,.1,.92,7.92,0)]);
new CullSet([{geo:poleG,mat:new THREE.MeshStandardMaterial({color:0x50555b,metalness:.7,roughness:.45}),dist:Q.draw*.7,shadow:true}],poles,{shadowDist:30});
const lampHeadMat=new THREE.MeshStandardMaterial({color:0xfff4dc,emissive:0xffbe6a,emissiveIntensity:0});
new CullSet([{geo:box(.62,.1,.3,0,0,0),mat:lampHeadMat,dist:Q.draw*.7,shadow:false}],heads,{shadowDist:0});
const poolG=new THREE.PlaneGeometry(1,1); poolG.rotateX(-Math.PI/2);
const POOLS=new CullSet([{geo:poolG,mat:new THREE.MeshBasicMaterial({map:T.glow,color:0xffa04a,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false}),dist:110,shadow:false}],pools,{shadowDist:0,name:'pools'}); POOLS.off=true;
const poolMesh=POOLS.meshes[0];
{ const wp=[]; const wire=(a,b,sag)=>{ let px=a.x,py=a.y,pz=a.z; for(let i=1;i<=8;i++){ const t=i/8, x=a.x+(b.x-a.x)*t, z=a.z+(b.z-a.z)*t, y=a.y+(b.y-a.y)*t-sag*4*t*(1-t); wp.push(px,py,pz,x,y,z); px=x; py=y; pz=z; } };
  const bySide=new Map(); for(const p of poles){ if(p.y>SLAB+.01) continue; const k=Math.round(p.ry*100); if(!bySide.has(k)) bySide.set(k,[]); bySide.get(k).push(p); }
  for(const list of bySide.values()){ for(const p of list){ let best=null,bd=40; for(const q of list){ if(q===p) continue; const d=Math.hypot(q.x-p.x,q.z-p.z); if(d<bd&&(q.x>p.x+.1||(Math.abs(q.x-p.x)<.1&&q.z>p.z))){ bd=d; best=q; } }
    if(best){ wire({x:p.x,y:p.y+7.3,z:p.z},{x:best.x,y:best.y+7.3,z:best.z},rr(.6,1.1)); wire({x:p.x,y:p.y+6.9,z:p.z},{x:best.x,y:best.y+6.9,z:best.z},rr(.7,1.3)); } } }
  const wg=new THREE.BufferGeometry(); wg.setAttribute('position',new THREE.Float32BufferAttribute(wp,3)); scene.add(new THREE.LineSegments(wg,new THREE.LineBasicMaterial({color:0x14110f}))); }
/* traffic lights */
const CYCLE=30;
for(const n of nodes) if(!n.bridge) n.tlo=MR()*CYCLE;
function lightAt(n,fx){ const t=(T0+n.tlo)%CYCLE; if(Math.abs(fx)>.5) return t<12?'g':t<15?'y':'r'; return t<15?'r':t<27?'g':'y'; }
const tlPoles=[], tlHeads=[], tlLamps=[], tlRefs=[], TLM=MODELS.tlight;
// lens centres on the traffic light model (pole at the origin, arm along -x, lamps facing +z)
const TL_LENS=[[-3.757,4.11],[-3.757,3.815],[-3.757,3.52]], TL_LZ=.175;
nodes.forEach(n=>{ if(n.bridge) return; for(const mi of n.adj){ const m=nodes[mi]; if(m.bridge) continue; const dx=n.x-m.x, dz=n.z-m.z, L=Math.hypot(dx,dz), fx=dx/L, fz=dz/L, rx=-fz, rz=fx;
  const px=n.x-fx*(crossHalf(n,fx)+1.4)+rx*(edgeHalf(m,n)+1.1), pz=n.z-fz*(crossHalf(n,fx)+1.4)+rz*(edgeHalf(m,n)+1.1), ry=Math.atan2(-fx,-fz);
  tlPoles.push({x:px,y:SLAB,z:pz,ry,cross:Math.abs(fx)>.5?NS_NAME[n.x]:EW_NAME[n.z]});
  if(TLM){ const c=Math.cos(ry), sn=Math.sin(ry); for(const [lx,ly] of TL_LENS) tlLamps.push({x:px+lx*c+TL_LZ*sn,y:SLAB+ly,z:pz-lx*sn+TL_LZ*c,ry}); }
  else { tlHeads.push({x:px,y:SLAB+4.25,z:pz,ry}); for(let k=0;k<3;k++) tlLamps.push({x:px-fx*.18,y:SLAB+4.58-k*.33,z:pz-fz*.18}); }
  tlRefs.push({n,fx}); } });
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
  tlRefs.forEach((r,i)=>{ const st=lightAt(r.n,r.fx);
    tlLampMesh.setColorAt(i*3,  st==='r'?_tc.setRGB(hot,.06*hot,.03*hot):_tc.setRGB(.16,.02,.02));
    tlLampMesh.setColorAt(i*3+1,st==='y'?_tc.setRGB(hot,.65*hot,.05*hot):_tc.setRGB(.16,.11,.02));
    tlLampMesh.setColorAt(i*3+2,st==='g'?_tc.setRGB(.08*hot,hot,.45*hot):_tc.setRGB(.02,.13,.06)); });
  tlLampMesh.instanceColor.needsUpdate=true; }
{ const posts=[]; for(let x=-724;x<346;x+=2.5) posts.push({x,y:SLAB,z:143.3}); for(let z=-445;z<143;z+=2.5) if(Math.abs(z-BR.z)>8.5) posts.push({x:346.6,y:SLAB,z});
  const steel=new THREE.MeshStandardMaterial({color:0xb9c0c6,metalness:.85,roughness:.3});
  const pg=new THREE.CylinderGeometry(.05,.05,1.05,6); pg.translate(0,.525,0); inst(pg,steel,posts,{shadow:false});
  const zA=BR.z-8.5, zB=BR.z+8.5;
  scene.add(new THREE.Mesh(mergeList([box(1070,.07,.07,-189,SLAB+1.05,143.3),box(1070,.05,.05,-189,SLAB+.55,143.3),box(.07,.07,zA+445,346.6,SLAB+1.05,(zA-445)/2),box(.07,.07,143-zB,346.6,SLAB+1.05,(143+zB)/2)]),steel)); }

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

const player={x:APT.front.x,z:APT.front.z+1.2,y:SLAB,yaw:0,speed:0,ph:0};
let mode='walk', started=false, busy=false, T0=0;
let rig=makeHuman({f:false,skin:skinMat('#5a3825'),top:ankMat(5),bottom:clothMat('#1a1a1c'),shoe:clothMat('#f2f2f2'),hairM:clothMat('#141110')});
scene.add(rig.root);

function sidewalkPts(a,b,side){ const dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz),fx=dx/L,fz=dz/L,rx=-fz,rz=fx,o=(edgeHalf(a,b)+2.6)*side,sa=crossHalf(a,fx)+2.6,sb=crossHalf(b,fx)+2.6;
  return [{x:a.x+fx*sa+rx*o,z:a.z+fz*sa+rz*o},{x:b.x-fx*sb+rx*o,z:b.z-fz*sb+rz*o}]; }
const peds=[];
function placePed(p,dmin,dmax){ for(let t=0;t<60;t++){ const [a,b]=mpick(EDGES); if(nodes[a].bridge||nodes[b].bridge) continue; const [s,e]=sidewalkPts(nodes[a],nodes[b],p.side); const u=MR(), x=s.x+(e.x-s.x)*u, z=s.z+(e.z-s.z)*u, d=Math.hypot(x-player.x,z-player.z);
  if(d<dmin||d>dmax) continue; Object.assign(p,{a,b,x,z,q:[e],state:'walk',fall:0,phone:false,speed:p.v,yaw:Math.atan2(e.x-x,e.z-z)}); return true; } return false; }
function pedPlan(p){ const opts=nodes[p.b].adj.filter(n=>n!==p.a&&!nodes[n].bridge); const nb=opts.length?mpick(opts):p.a; p.a=p.b; p.b=nb; p.q=sidewalkPts(nodes[p.a],nodes[p.b],p.side); }
function replanPed(p){ let bi=0,bd=1e9; nodes.forEach((n,i)=>{ if(n.bridge) return; const d=Math.hypot(n.x-p.x,n.z-p.z); if(d<bd){bd=d;bi=i;} }); p.b=bi; p.a=-1; pedPlan(p); p.state='walk'; }
for(let i=0;i<Q.peds;i++){ const h=randomHuman(); scene.add(h.root); const p={h,x:0,z:0,y:SLAB,yaw:0,speed:0,v:mrr(1.15,1.6),ph:MR()*6,state:'walk',q:[],a:0,b:0,side:MR()<.5?-1:1,timer:0,phone:false,fall:0,vx:0,vz:0,lod:-1}; peds.push(p); if(!placePed(p,4,140)) placePed(p,0,3000); }

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
function laneOff(a,b){ const hw=edgeHalf(a,b); return hw>=10?4.6:hw*.45; }
function lineSeg(ia,ib){ const a=nodes[ia],b=nodes[ib],dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz),fx=dx/L,fz=dz/L,rx=-fz,rz=fx,off=laneOff(a,b),sa=crossHalf(a,fx)+1.2,sb=crossHalf(b,fx)+1.2;
  const p0={x:a.x+fx*sa+rx*off,z:a.z+fz*sa+rz*off}, p2={x:b.x-fx*sb+rx*off,z:b.z-fz*sb+rz*off}; return {k:0,p0,p2,len:Math.max(.1,Math.hypot(p2.x-p0.x,p2.z-p0.z)),fx,fz,rx,rz,off}; }
function turnSeg(ia,ib,ic){ const s1=lineSeg(ia,ib), s2=lineSeg(ib,ic), b=nodes[ib], P0=s1.p2, P2=s2.p0, dot=s1.fx*s2.fx+s1.fz*s2.fz; let C;
  if(dot>.9) C={x:(P0.x+P2.x)/2,z:(P0.z+P2.z)/2};
  else if(dot<-.9){ const k=s1.off*2+6; C={x:(P0.x+P2.x)/2+s1.fx*k,z:(P0.z+P2.z)/2+s1.fz*k}; }
  else C={x:b.x+s1.rx*s1.off+s2.rx*s2.off,z:b.z+s1.rz*s1.off+s2.rz*s2.off};
  let len=0,px=P0.x,pz=P0.z; for(let i=1;i<=12;i++){ const t=i/12,u=1-t,x=u*u*P0.x+2*u*t*C.x+t*t*P2.x,z=u*u*P0.z+2*u*t*C.z+t*t*P2.z; len+=Math.hypot(x-px,z-pz); px=x; pz=z; }
  return {k:1,p0:P0,p1:C,p2:P2,len:Math.max(.1,len)}; }
function segPos(sg,s,o){ const t=clamp(s/sg.len,0,1);
  if(sg.k===0){ o.x=sg.p0.x+(sg.p2.x-sg.p0.x)*t; o.z=sg.p0.z+(sg.p2.z-sg.p0.z)*t; o.dx=sg.fx; o.dz=sg.fz; }
  else { const u=1-t; o.x=u*u*sg.p0.x+2*u*t*sg.p1.x+t*t*sg.p2.x; o.z=u*u*sg.p0.z+2*u*t*sg.p1.z+t*t*sg.p2.z; o.dx=2*u*(sg.p1.x-sg.p0.x)+2*t*(sg.p2.x-sg.p1.x); o.dz=2*u*(sg.p1.z-sg.p0.z)+2*t*(sg.p2.z-sg.p1.z); if(Math.abs(o.dx)+Math.abs(o.dz)<1e-6){ o.dx=1; o.dz=0; } }
  return o; }
const _sp={x:0,z:0,dx:1,dz:0};
function placeCar(v,dmin,dmax){ for(let t=0;t<60;t++){ const [a,b]=mpick(EDGES); const seg=lineSeg(a,b); if(seg.len<10) continue; const s=mrr(0,seg.len); segPos(seg,s,_sp);
  const d=Math.hypot(_sp.x-player.x,_sp.z-player.z); if(d<dmin||d>dmax) continue; let clash=false; for(const o of vehicles) if(o!==v&&Math.hypot(o.x-_sp.x,o.z-_sp.z)<11){ clash=true; break; } if(clash) continue;
  const D=v.c.def; v.ai={a,b,s,seg,na:-1,maxV:mrr(D.maxV[0],D.maxV[1]),wait:0,ghost:0,stuck:0,cond:EDGE_COND.get(ekey(a,b))}; v.parked=false; v.x=_sp.x; v.z=_sp.z; v.h=Math.atan2(-_sp.dz,_sp.dx); v.speed=v.ai.maxV*.6; v.y=groundY(v.x,v.z); return true; } return false; }
const myCar=newVehicle('okada','#b3261e',true); Object.assign(myCar,{x:98,z:34.4,h:Math.PI,y:0,keep:1});
for(const [type,x,z,h] of [['danfo',64.9,-22,Math.PI/2],['keke',122,34.5,Math.PI],['sedan',140,34.3,Math.PI],['danfo',-150+4.9,80,Math.PI/2],['danfo',-300+4.9,-20,Math.PI/2],['police',STATION.x-11,34.2,Math.PI],['police',STATION.x+9,34.2,Math.PI],['bus',-80,128.5,Math.PI]]){ const v=newVehicle(type,'#f2b705',true); Object.assign(v,{x,z,h,y:0,keep:1}); }
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
  tg.fillStyle='rgba(0,0,0,.45)'; tg.fillRect(0,296,640,64); tg.fillStyle='#fff'; tg.font='600 26px "Barlow Semi Condensed", "Arial Narrow", sans-serif'; tg.textAlign='left'; tg.fillText('BREAKING: Jollof Friday confirmed on Broad Street',20,338);
  add(new THREE.PlaneGeometry(1.9,1.07),new THREE.MeshBasicMaterial({map:tx(tc,true,false),color:new THREE.Color(1.3,1.3,1.3)}),-5.86,1.55,.2,Math.PI/2,false);
  // dining
  add(new THREE.BoxGeometry(1.7,.06,.95),woodM,3.1,.76,2.4); for(const [x,z] of [[2.35,2.0],[3.85,2.0],[2.35,2.8],[3.85,2.8]]) add(new THREE.BoxGeometry(.06,.73,.06),woodM,x,.365,z); solid(2.2,4.0,1.85,2.95);
  for(const [x,z,ry] of [[2.6,1.6,0],[3.6,1.6,0],[2.6,3.2,Math.PI],[3.6,3.2,Math.PI]]){ const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=ry;
    const s=new THREE.Mesh(new THREE.BoxGeometry(.45,.05,.45),woodM); s.position.y=.46; const bk=new THREE.Mesh(new THREE.BoxGeometry(.45,.5,.05),woodM); bk.position.set(0,.72,-.2); g.add(s,bk);
    for(const [lx,lz] of [[-.19,-.19],[.19,-.19],[-.19,.19],[.19,.19]]){ const l=new THREE.Mesh(new THREE.BoxGeometry(.04,.46,.04),woodM); l.position.set(lx,.23,lz); g.add(l); }
    g.traverse(o=>{ if(o.isMesh){ o.castShadow=o.receiveShadow=true; } }); S.add(g); solid(x-.25,x+.25,z-.25,z+.25); }
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
  return {scene:S,cols,fan:blades,exit:{x:0,z:4.3}};
}
const INT=buildInterior();

/* ================= your character (Mixamo) ================= */
await step('Loading your character…', 91);
let WALK_V=2.6, RUN_V=6.2, hero=null;
try{
  const src=await heroBufsJob; let cObj, CL;
  if(src.gltf){ cObj=src.gltf.scene; const byName=n=>src.gltf.animations.find(a=>a.name===n); CL=[byName('idle'),byName('walk'),byName('run'),byName('enter_car')]; }
  else { const fl=new FBXLoader(); const [c,iO,wO,rO,eO]=src.fbx.map(b=>fl.parse(b,'')); cObj=c; CL=[iO,wO,rO,eO].map(o=>o.animations[0]); }
  const bb=new THREE.Box3().setFromObject(cObj), hgt=bb.max.y-bb.min.y; if(hgt>10) cObj.scale.setScalar(1.85/hgt);
  cObj.traverse(o=>{ if(o.isMesh){ const om=Array.isArray(o.material)?o.material[0]:o.material, map=om&&om.map; if(map){ map.colorSpace=THREE.SRGBColorSpace; map.anisotropy=maxAniso; }
    o.material=new THREE.MeshStandardMaterial({map:map||null,color:map?0xffffff:0x8a6a50,roughness:.72,metalness:0,emissive:0xffffff,emissiveMap:map||null,emissiveIntensity:0}); HERO_MATS.push(o.material); o.castShadow=true; o.receiveShadow=true; o.frustumCulled=false; o.layers.set(1); } });
  const root=new THREE.Group(); root.rotation.order='YXZ'; root.add(cObj);
  const inPlace=c=>{ for(const t of c.tracks) if(/Hips\.position$/.test(t.name)){ const v=t.values, x0=v[0], z0=v[2]; for(let i=0;i<v.length;i+=3){ v[i]=x0; v[i+2]=z0; } } return c; };
  const mixer=new THREE.AnimationMixer(cObj);
  const act={idle:mixer.clipAction(inPlace(CL[0])),walk:mixer.clipAction(inPlace(CL[1])),run:mixer.clipAction(inPlace(CL[2])),car:mixer.clipAction(CL[3])};
  act.car.setLoop(THREE.LoopOnce,1); act.car.clampWhenFinished=true;
  for(const k of ['idle','walk','run']){ act[k].play(); act[k].setEffectiveWeight(k==='idle'?1:0); }
  let hips=null; cObj.traverse(o=>{ if(!hips&&o.isBone&&/Hips$/.test(o.name)) hips=o; });
  hero={root,mixer,act,w:{idle:1,walk:0,run:0},carT:0,hips:hips||cObj};
  scene.remove(rig.root); rig={root}; scene.add(root); WALK_V=1.7; RUN_V=4.9;
}catch(e){ console.warn('Character files could not load, using the built-in model.',e); }
function heroAnim(dt,speed){ const a=hero.act; let ti=0,tw=0,tr=0;
  if(speed<.08) ti=1; else if(speed<=WALK_V){ const k=speed/WALK_V; ti=1-k; tw=k; } else { const k=clamp((speed-WALK_V)/(RUN_V-WALK_V),0,1); tw=1-k; tr=k; }
  const s=1-Math.exp(-10*dt), w=hero.w; w.idle+=(ti-w.idle)*s; w.walk+=(tw-w.walk)*s; w.run+=(tr-w.run)*s;
  a.idle.setEffectiveWeight(w.idle); a.walk.setEffectiveWeight(w.walk); a.run.setEffectiveWeight(w.run);
  a.walk.timeScale=clamp(Math.max(speed,1)/1.1,.9,1.8); a.run.timeScale=clamp(Math.max(speed,3)/2.4,1.3,2.2);
  hero.mixer.update(dt); }
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
  night: {turb:2, ray:.4, mie:.002,mieG:.8, exp:.82,sun:C3(0x8ea6ff),sunI:.32,hs:C3(0x33456e),hg:C3(0x15110f),hi:.5, fog:C3(0x0b1322),fd:.0021,win:1.7,lamp:5,  sign:1.1,b0:.95,b1:.5, b2:.55,env:.5,water:C3(0x081a24),head:3,  tail:2.2,spot:180}};
const RAINFOG=C3(0x6f7a84), HAZE=C3(0xc8a273), _c1=new THREE.Color(), _c2=new THREE.Color();
const ENV={hour:12,elev:40,lamp:0,win:0,sign:0,head:.15,tail:.3,spot:0,wet:0,rain:0,cloud:0,haze:0,dim:0,storm:0,night:false,w:null,label:'',icon:'sun',flash:0};
const envScene=new THREE.Scene(); envScene.add(sky); let envRT=null, envKey='', envT=-99, skyT=-99;
const mixK=(f,dw,nw)=>{ const g=LK.golden[f]; const a=g+(LK.day[f]-g)*dw; return a+(LK.night[f]-a)*nw; };
const mixC=(out,f,dw,nw)=>out.copy(LK.golden[f]).lerp(LK.day[f],dw).lerp(LK.night[f],nw);
// clouds: one big soft layer high above the city
const cloudMat=(()=>{ const S=512,[c,g]=cv(S,S); const img=g.createImageData(S,S); const d=img.data; const oct=[[4,.5],[8,.25],[16,.14],[32,.07]];
  const lat={}, LT=f=>lat[f]||(lat[f]=Float32Array.from({length:f*f},()=>R()));
  const vn=(x,y,f)=>{ const A=LT(f), X=x/S*f, Y=y/S*f, xi=Math.floor(X), yi=Math.floor(Y), xf=X-xi, yf=Y-yi, q=(i,j)=>A[((j%f+f)%f)*f+((i%f+f)%f)], u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
    return (q(xi,yi)*(1-u)+q(xi+1,yi)*u)*(1-v)+(q(xi,yi+1)*(1-u)+q(xi+1,yi+1)*u)*v; };
  for(let y=0;y<S;y++) for(let x=0;x<S;x++){ let n=0; for(const [f,a] of oct) n+=vn(x,y,f)*a; const i=(y*S+x)*4; d[i]=d[i+1]=d[i+2]=255; d[i+3]=Math.max(0,Math.min(255,(n-.42)*520)); }
  g.putImageData(img,0,0); const t=tx(c,true,true,512); t.repeat.set(5,5);
  const [ac,ag]=cv(256,256); const gr=ag.createRadialGradient(128,128,20,128,128,128); gr.addColorStop(0,'#fff'); gr.addColorStop(.7,'#fff'); gr.addColorStop(1,'#000'); ag.fillStyle=gr; ag.fillRect(0,0,256,256);
  return new THREE.MeshBasicMaterial({map:t,alphaMap:tx(ac,false,false),transparent:true,depthWrite:false,fog:false,opacity:0,color:0xffffff}); })();
const veil=new THREE.Mesh(new THREE.SphereGeometry(2600,24,12),new THREE.MeshBasicMaterial({color:0xc8a273,transparent:true,opacity:0,fog:false,depthWrite:false,side:THREE.BackSide,toneMapped:false})); veil.renderOrder=-2; veil.frustumCulled=false; veil.visible=false; scene.add(veil);
const clouds=new THREE.Mesh(new THREE.PlaneGeometry(7000,7000),cloudMat); clouds.rotation.x=Math.PI/2; clouds.position.y=520; clouds.renderOrder=-1; clouds.frustumCulled=false; scene.add(clouds);
// rain: streaks animated on the GPU, wrapped around the camera
const RAIN_N=Q===QUAL.low?1400:Q===QUAL.medium?2600:4200, RB=[46,26,46];
const rain=(()=>{ const pos=new Float32Array(RAIN_N*6), sd=new Float32Array(RAIN_N*2);
  for(let i=0;i<RAIN_N;i++){ const x=MR()*RB[0], y=MR()*RB[1], z=MR()*RB[2]; pos.set([x,y,z,x,y,z],i*6); sd[i*2]=0; sd[i*2+1]=1; }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('tip',new THREE.BufferAttribute(sd,1));
  const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0},cam:{value:new THREE.Vector3()},box:{value:new THREE.Vector3(...RB)},op:{value:0},col:{value:new THREE.Color(.75,.8,.86)}},
    vertexShader:`attribute float tip; uniform float time; uniform vec3 cam; uniform vec3 box; varying float vA;
      void main(){ vec3 p=position; vec3 vel=vec3(1.4,-17.,0.6); p+=vel*time; p=mod(p-cam+box*.5,box)-box*.5+cam; p-=vel*.045*tip; vA=1.-tip*.75;
        gl_Position=projectionMatrix*viewMatrix*vec4(p,1.); }`,
    fragmentShader:`uniform float op; uniform vec3 col; varying float vA; void main(){ gl_FragColor=vec4(col,op*vA); }`});
  const L=new THREE.LineSegments(g,m); L.frustumCulled=false; L.visible=false; scene.add(L); return L; })();
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
  veil.material.color.copy(scene.fog.color); veil.material.opacity=Math.min(.86,w.haze*.74+w.rain*.42+w.storm*.28+Math.max(0,w.cloud-.5)*.35); veil.visible=veil.material.opacity>.02&&mode!=='interior'; veil.position.copy(camera.position);
  renderer.toneMappingExposure=mixK('exp',dw,nw)*(1-w.dim*.4*(1-nw))+ENV.flash*.35;
  WU.sunDirection.value.copy(lightDir).normalize(); mixC(WU.waterColor.value,'water',dw,nw); WU.sunColor.value.setRGB(1-nw*.55,1-nw*.5,1-nw*.3).multiplyScalar(1-w.dim*.8);
  ENV.lamp=Math.max(mixK('lamp',dw,nw), dark>.55?2.4*(dark-.55)/.45:0); ENV.win=Math.max(mixK('win',dw,nw),dark*.9); ENV.sign=Math.max(mixK('sign',dw,nw),dark*.6);
  ENV.head=Math.max(mixK('head',dw,nw),dark*2); ENV.tail=Math.max(mixK('tail',dw,nw),dark*1.6); ENV.spot=Math.max(mixK('spot',dw,nw),dark*120); ENV.night=nw>.5;
  for(const k of FAC_KEYS) MAT[k].emissiveIntensity=Math.min(1.25,ENV.win)*(k==='shop'?.38:k==='oldmid'||k==='resi'?.7:1); MAT.sign.emissiveIntensity=ENV.sign*.8;
  fillLight.intensity=Math.max(0,(nw*.9+w.dim*.35*(1-dw))*7); for(const m of billboardMats) m.emissiveIntensity=ENV.sign*.9;
  { const lift=fillLight.intensity/7; for(const m of HERO_MATS) m.emissiveIntensity=lift*.32; HUMAN_MAT.emissiveIntensity=lift*.14; }
  lampHeadMat.emissiveIntensity=ENV.lamp; POOLS.off=!(ENV.lamp>1); bridgeParts.deckLightMat.emissiveIntensity=ENV.lamp*.8; if(!ENV.night) bridgeParts.cableMat.emissiveIntensity=0; else bridgeParts.cableMat.emissiveIntensity=1.3;
  CM.head.emissiveIntensity=ENV.head; CM.tail.emissiveIntensity=ENV.tail; APT.doorMesh.material.emissiveIntensity=Math.min(1.2,ENV.win*.8);
  stars.visible=nw>.4&&w.cloud<.6; stars.material.opacity=.8*Math.min(1,(nw-.4)*3)*(1-w.cloud)*(1-veil.material.opacity);
  if(bloom){ bloom.strength=mixK('b0',dw,nw)+ENV.flash; bloom.radius=mixK('b1',dw,nw); bloom.threshold=mixK('b2',dw,nw); }
  // clouds and rain
  cloudMat.opacity=Math.min(.96,w.cloud*1.05); cloudMat.color.setRGB(1,1,1).multiplyScalar((1-nw*.9)*(1-w.dim*.55)+.06).lerp(_c1.copy(sun.color),dw<.5&&nw<.5?.35:0);
  cloudMat.map.offset.x+=dt*.0016; cloudMat.map.offset.y+=dt*.0007; clouds.position.x=camera.position.x; clouds.position.z=camera.position.z;
  rain.visible=w.rain>.02&&mode!=='interior'; if(rain.visible){ const ru=rain.material.uniforms; ru.time.value=(ru.time.value+dt)%600; ru.cam.value.copy(camera.position); ru.op.value=Math.min(.78,w.rain*.62+w.storm*.2); ru.col.value.setRGB(.6,.64,.7).multiplyScalar(1-nw*.55); }
  // wet roads shine
  const wet=ENV.wet; for(const m of ROAD_MATS){ m.roughness=m.userData.r0*(1-wet*m.userData.k); m.color.copy(m.userData.c0).multiplyScalar(1-wet*.26); }
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
let toastT=0; function toast(msg,dur=2.6){ const t=$('#toast'); t.textContent=msg; t.hidden=false; t.onclick=null; toastT=dur; }
function locationName(){ if(mode==='interior') return 'Your room · Obalende'; const x=mode==='drive'?drive.v.x:player.x, z=mode==='drive'?drive.v.z:player.z;
  if(x>BR.x0-2&&x<BR.x1&&Math.abs(z-BR.z)<12) return 'Link Bridge'; if(x>1040) return 'Lekki';
  if(z>130) return x<0?'Marina · Isale Eko':'Marina · Obalende';
  if(x>SQ.sx0&&x<SQ.sx1&&z>SQ.sz0&&z<SQ.sz1) return 'Freedom Square · Isale Eko';
  if(Math.hypot(x-STATION.x,z-STATION.z)<22) return 'Obalende Police Station';
  let best='',bd=1e9; for(const zz of ZS){ const d=Math.abs(z-zz); if(d<bd&&x>XS[0]-10&&x<XS[XS.length-1]+10){ bd=d; best=EW_NAME[zz]; } }
  for(const xx of XS){ const d=Math.abs(x-xx); if(d<bd&&z>ZS[0]-10&&z<ZS[ZS.length-1]+12){ bd=d; best=NS_NAME[xx]; } }
  const dist=x<0?'Isale Eko':'Obalende'; return best?`${best} · ${dist}`:dist; }
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
const MMB={x0:-760,z0:-700,x1:1900,z1:920,ppm:.72}; let mmCache=null;
const COND_COL={good:'#8d939e',bad:'#7b7468',dirt:'#9a6440'};
function buildMinimapCache(){ const W=Math.ceil((MMB.x1-MMB.x0)*MMB.ppm), H=Math.ceil((MMB.z1-MMB.z0)*MMB.ppm); mmCache=document.createElement('canvas'); mmCache.width=W; mmCache.height=H;
  const g=mmCache.getContext('2d'); g.fillStyle='#163a4c'; g.fillRect(0,0,W,H); g.scale(MMB.ppm,MMB.ppm); g.translate(-MMB.x0,-MMB.z0); drawWorldMap(g); }
function drawWorldMap(g){ g.fillStyle='#2a2e35'; for(const L of LANDS) g.fillRect(L.x0,L.z0,L.x1-L.x0,L.z1-L.z0); g.fillRect(-700,430,1850,470);
  g.fillStyle='#24493a'; g.fillRect(SQ.sx0,SQ.sz0,SQ.sx1-SQ.sx0,SQ.sz1-SQ.sz0);
  g.fillStyle='#3e434c'; for(const b of colliders) g.fillRect(b.x0,b.z0,b.x1-b.x0,b.z1-b.z0);
  g.lineCap='butt';
  for(const [a,b] of EDGES){ if(a>b) continue; const A0=nodes[a],B0=nodes[b]; if(A0.bridge||B0.bridge) continue; g.strokeStyle=COND_COL[EDGE_COND.get(ekey(a,b))||'good']; g.lineWidth=2*edgeHalf(A0,B0); g.beginPath(); g.moveTo(A0.x,A0.z); g.lineTo(B0.x,B0.z); g.stroke(); }
  g.fillStyle='#8d939e'; for(const n of nodes){ if(n.bridge) continue; const hx=NSW(n.x)/2, hz=EWW(n.z)/2; g.fillRect(n.x-hx,n.z-hz,hx*2,hz*2); }
  g.strokeStyle='#b3b9c3'; g.lineWidth=15; g.beginPath(); g.moveTo(330,BR.z); g.lineTo(1070,BR.z); g.stroke();
  const ap=APT.front; g.fillStyle='#F2B705'; g.fillRect(78,-2,30,24); }
// GPS: shortest path over the road graph
function routeTo(x0,z0,x1,z1){ const near=(x,z)=>{ let bi=0,bd=1e9; nodes.forEach((n,i)=>{ const d=Math.hypot(n.x-x,n.z-z); if(d<bd){ bd=d; bi=i; } }); return bi; };
  const s=near(x0,z0), t=near(x1,z1), N=nodes.length, dist=new Float64Array(N).fill(1e18), prev=new Int32Array(N).fill(-1), done=new Uint8Array(N); dist[s]=0;
  for(let it=0;it<N;it++){ let u=-1,bd=1e18; for(let i=0;i<N;i++) if(!done[i]&&dist[i]<bd){ bd=dist[i]; u=i; } if(u<0||u===t) break; done[u]=1;
    for(const w of nodes[u].adj){ const nd=dist[u]+Math.hypot(nodes[w].x-nodes[u].x,nodes[w].z-nodes[u].z); if(nd<dist[w]){ dist[w]=nd; prev[w]=u; } } }
  const path=[]; for(let u=t;u>=0;u=prev[u]){ path.unshift([nodes[u].x,nodes[u].z]); if(u===s) break; } path.unshift([x0,z0]); path.push([x1,z1]); return path; }
const STREETS=[]; for(const [a,b] of EDGES){ if(a>b) continue; const A0=nodes[a],B0=nodes[b]; if(A0.bridge||B0.bridge) continue; if(A0.z===B0.z) STREETS.push({name:EW_NAME[A0.z],x:(A0.x+B0.x)/2,z:A0.z}); else STREETS.push({name:NS_NAME[A0.x],x:A0.x,z:(A0.z+B0.z)/2,vertical:true}); }
PLACES.push({name:'Your house',sub:'Home',kind:'home',x:APT.front.x,z:APT.front.z},{name:'Obalende Police Station',sub:'Police',kind:'police',x:STATION.x,z:STATION.z},
  {name:'Freedom Square',sub:'Landmark',kind:'place',x:(SQ.sx0+SQ.sx1)/2,z:(SQ.sz0+SQ.sz1)/2},{name:'Link Bridge',sub:'Bridge to Lekki',kind:'place',x:BR.px,z:BR.z},{name:'Marina waterfront',sub:'Lagoon side',kind:'place',x:-200,z:138});
const fmtDist=m=>m<1000?Math.round(m/10)*10+' m':(m/1000).toFixed(1)+' km';
const mapView=new MapView({root:$('#bigmap'),canvas:$('#bmCanvas'),image:null,bounds:MMB,places:PLACES,streets:STREETS,routeTo,fmtDist,
  getPlayer:()=>{ if(mode==='interior') return {x:APT.front.x,z:APT.front.z,dir:0}; const v=mode==='drive'?drive.v:null; return v?{x:v.x,z:v.z,dir:Math.PI/2-v.h}:{x:player.x,z:player.z,dir:Math.PI-player.yaw}; },
  onRoute:d=>{ if(d) toast('GPS set: follow the yellow line'); }});
function drawMinimap(){ const S=mm.width, R0=S/2, sc=R0/150, px=mode==='drive'?drive.v.x:player.x, pz=mode==='drive'?drive.v.z:player.z;
  mg.save(); mg.clearRect(0,0,S,S); mg.beginPath(); mg.arc(R0,R0,R0,0,Math.PI*2); mg.clip(); mg.fillStyle='#163a4c'; mg.fillRect(0,0,S,S);
  const phi=Math.atan2(Math.cos(camState.yaw),Math.sin(camState.yaw)), th=-Math.PI/2-phi;
  mg.translate(R0,R0); mg.rotate(th); mg.scale(sc,sc); mg.translate(-px,-pz);
  if(!mmCache) buildMinimapCache(); mg.drawImage(mmCache,MMB.x0,MMB.z0,MMB.x1-MMB.x0,MMB.z1-MMB.z0);
  const rt=mapView.route; if(rt&&rt.length>1){ mg.lineJoin='round'; mg.lineCap='round'; mg.strokeStyle='#F2B705'; mg.lineWidth=7; mg.beginPath(); rt.forEach(([x,z],i)=>i?mg.lineTo(x,z):mg.moveTo(x,z)); mg.stroke(); }
  mg.fillStyle='#e7e1d3'; for(const v of vehicles){ if(v===drive.v) continue; if(Math.abs(v.x-px)>200||Math.abs(v.z-pz)>200) continue; mg.save(); mg.translate(v.x,v.z); mg.rotate(-v.h); mg.fillStyle=v.type==='police'?'#7fa6ff':'#e7e1d3'; mg.fillRect(-2.6,-1.1,5.2,2.2); mg.restore(); }
  mg.restore();
  const c=Math.cos(th), s=Math.sin(th);
  const mark=(wx,wz,col,label)=>{ let dx=(wx-px)*sc, dz=(wz-pz)*sc, sx=dx*c-dz*s, sy=dx*s+dz*c; const d=Math.hypot(sx,sy), lim=R0-18; if(d>lim){ sx*=lim/d; sy*=lim/d; }
    mg.fillStyle=col; mg.beginPath(); mg.arc(R0+sx,R0+sy,15,0,7); mg.fill(); mg.fillStyle='#0E1014'; mg.font='20px Bungee, Impact, sans-serif'; mg.textAlign='center'; mg.textBaseline='middle'; mg.fillText(label,R0+sx,R0+sy+1); };
  mark(APT.front.x,APT.front.z,'#F2B705','H'); mark(STATION.x,STATION.z,'#4c7dff','P'); if(mapView.dest) mark(mapView.dest.x,mapView.dest.z,'#ffffff','•');
  mg.fillStyle='#F7EFDF'; mg.font='22px Bungee, Impact, sans-serif'; mg.textAlign='center'; mg.textBaseline='middle'; mg.fillText('N',R0+s*(R0-24),R0-c*(R0-24));
  const hd=mode==='drive'?Math.atan2(-Math.sin(drive.v.h),Math.cos(drive.v.h)):Math.atan2(Math.cos(player.yaw),Math.sin(player.yaw));
  mg.save(); mg.translate(R0,R0); mg.rotate(hd+th); mg.fillStyle='#F7EFDF'; mg.strokeStyle='#0E1014'; mg.lineWidth=4; mg.beginPath(); mg.moveTo(20,0); mg.lineTo(-13,-13); mg.lineTo(-6,0); mg.lineTo(-13,13); mg.closePath(); mg.stroke(); mg.fill(); mg.restore(); }
function openMap(){ if(!mmCache) buildMinimapCache(); mapView.image=mmCache; mapView.open(); for(const kk in K) K[kk]=false; joy.x=joy.y=0; if(document.pointerLockElement) document.exitPointerLock(); }
function nearestVehicle(maxD=3.9){ let best=null,bd=maxD; for(const v of vehicles){ const d=Math.hypot(v.x-player.x,v.z-player.z); if(d<bd&&Math.abs(v.speed)<7){ bd=d; best=v; } } return best; }
const nearDoor=()=>Math.hypot(player.x-APT.front.x,player.z-APT.front.z)<2.4;
const nearExit=()=>Math.hypot(player.x-INT.exit.x,player.z-INT.exit.z)<1.2;
let locTick=0, mmTick=0, lastPrompt='', routeTick=0, lastMode=''; const SPEEDO=$('#speedo'), SPD=$('#spd');
function updateHUD(dt){ if(!started) return;
  locTick-=dt; if(locTick<=0){ locTick=.3; $('#loc').textContent=locationName(); }
  clockTick-=dt; if(clockTick<=0){ clockTick=.5; updateClockHUD(); }
  let txt=''; if(!busy){ if(mode==='walk'){ if(nearDoor()) txt='Enter your house'; else { const v=nearestVehicle(); if(v){ const nm=(VT[v.type]||{name:'car'}).name; txt=v.ai?`Take this ${nm}`:(v===myCar?'Ride your okada':`Drive the ${nm}`); } } }
    else if(mode==='drive'){ if(Math.abs(drive.speed)<3) txt='Get out'; } else if(mode==='interior'&&nearExit()&&T0-enteredAt>.8) txt='Go back outside'; }
  if(txt!==lastPrompt){ lastPrompt=txt; $('#prompt').hidden=!txt; $('#promptTxt').textContent=txt; }
  if(mode==='drive'){ if(SPEEDO.hidden) SPEEDO.hidden=false; const k=Math.round(Math.abs(drive.speed)*3.6); if(k!==SPEEDO.k){ SPEEDO.k=k; SPD.textContent=k; } } else if(!SPEEDO.hidden) SPEEDO.hidden=true;
  if(toastT>0&&!mapView.isOpen){ toastT-=dt; if(toastT<=0) $('#toast').hidden=true; }
  if(mode!==lastMode){ lastMode=mode; const dv=mode==='drive'; $('#tHorn').hidden=!dv; $('#tBrake').hidden=!dv; $('#tRun').hidden=dv||mode==='enter'; $('#mmWrap').style.visibility=mode==='interior'?'hidden':'visible'; }
  if(mapView.dest&&mode!=='interior'){ const me=mapView.getPlayer(), pl=mapView.dest.place, near=14+(pl&&pl.r?pl.r:0); if(Math.hypot(me.x-mapView.dest.x,me.z-mapView.dest.z)<near){ mapView.clearRoute(); toast('You don reach! GPS cleared.'); } else { routeTick-=dt; if(routeTick<=0){ routeTick=1.5; mapView.recompute(); } } }
  if(mapView.isOpen){ mapView.draw(); return; }
  if(mode!=='interior'){ mmTick=(mmTick+1)%3; if(!mmTick) drawMinimap(); } }

/* ================= camera ================= */
const camState={yaw:0,pitch:.26,zoom:1,last:-10,dist:4.3,shake:0};
const _t=new THREE.Vector3(), _d=new THREE.Vector3(), _c=new THREE.Vector3();
function updateCamera(dt){ let dist;
  if(mode==='drive'){ const v=drive.v; _t.set(v.x,v.y+1.5,v.z); dist=7.8+Math.abs(drive.speed)*.04;
    if(T0-camState.last>1.0){ const want=Math.atan2(Math.cos(v.h),-Math.sin(v.h)), k=Math.abs(drive.speed)>1?2.6:.6; camState.yaw=lerpA(camState.yaw,want,1-Math.exp(-k*dt)); camState.pitch+=(.2-camState.pitch)*(1-Math.exp(-2*dt)); } }
  else { _t.set(player.x,player.y+1.55,player.z); dist=mode==='interior'?2.7:4.3; }
  dist*=camState.zoom; const cp=Math.cos(camState.pitch); _d.set(-Math.sin(camState.yaw)*cp,Math.sin(camState.pitch),-Math.cos(camState.yaw)*cp);
  if(mode!=='drive'){ _t.x+=-Math.cos(camState.yaw)*.35; _t.z+=Math.sin(camState.yaw)*.35; }
  let d=dist; if(mode!=='interior'){ d=Math.max(.7,Math.min(d,rayDist(_t,_d,dist)-.3)); }
  camState.dist+=(d-camState.dist)*(d<camState.dist?1:1-Math.exp(-4*dt));
  _c.copy(_t).addScaledVector(_d,camState.dist);
  if(mode==='interior'){ _c.x=clamp(_c.x,-5.75,5.75); _c.z=clamp(_c.z,-4.75,4.75); _c.y=clamp(_c.y,.5,3.0); }
  else { const gy=groundY(_c.x,_c.z)+.35; if(_c.y<gy) _c.y=gy; if(_c.y<water.position.y+.7) _c.y=water.position.y+.7; }
  if(camState.shake>0){ camState.shake=Math.max(0,camState.shake-dt*2.5); const s=camState.shake*.25; _c.x+=(MR()-.5)*s; _c.y+=(MR()-.5)*s; _c.z+=(MR()-.5)*s; }
  camera.position.copy(_c); camera.lookAt(_t);
  const fov=mode==='drive'?60+Math.min(14,Math.abs(drive.speed)*.4):(mode==='interior'?66:58); if(Math.abs(camera.fov-fov)>.05){ camera.fov+=(fov-camera.fov)*(1-Math.exp(-3*dt)); camera.updateProjectionMatrix(); } }

/* ================= input ================= */
const K={}, joy={x:0,y:0}; let touchRun=false, touchBrake=false, touchUI=false;
function inputVec(){ let f=0,s=0; if(K.w||K.arrowup) f+=1; if(K.s||K.arrowdown) f-=1; if(K.d||K.arrowright) s+=1; if(K.a||K.arrowleft) s-=1; f-=joy.y; s+=joy.x; return [clamp(f,-1,1),clamp(s,-1,1)]; }
// physical key positions, so AZERTY / other layouts still use the WASD spot
const CODE={KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d',ArrowUp:'arrowup',ArrowDown:'arrowdown',ArrowLeft:'arrowleft',ArrowRight:'arrowright',ShiftLeft:'shift',ShiftRight:'shift',Space:' ',KeyE:'e',KeyF:'f',KeyH:'h',KeyM:'m',KeyC:'c',Escape:'escape',Enter:'enter'};
const keyOf=e=>CODE[e.code]||(e.key||'').toLowerCase();
addEventListener('keydown',e=>{ const k=keyOf(e); if(k===' '||k.startsWith('arrow')) e.preventDefault(); if(!started||e.repeat) return;
  if(k==='escape'){ if(mapView.isOpen) mapView.close(); $('#settings').hidden=true; return; }
  if(k==='m'&&!K.m){ K.m=true; if(mapView.isOpen) mapView.close(); else if(mode!=='interior') openMap(); return; }
  if(mapView.isOpen) return;
  if(!K[k]){ if(k==='e'||k==='f') action(); else if(k==='c') $('#settings').hidden=!$('#settings').hidden; else if(k==='h'&&mode==='drive') horn(); } K[k]=true; });
addEventListener('keyup',e=>{ K[keyOf(e)]=false; });
addEventListener('blur',()=>{ for(const k in K) K[k]=false; joy.x=joy.y=0; });
addEventListener('pointerdown',()=>{ if(AC&&started&&AC.state!=='running'&&!document.hidden) AC.resume(); },{passive:true});
document.addEventListener('visibilitychange',()=>{ if(document.hidden){ for(const kk in K) K[kk]=false; joy.x=joy.y=0; touchBrake=false; if(AC&&AC.state==='running') AC.suspend(); } else { if(AC&&started) AC.resume(); lastT=performance.now(); } });
const cvs=renderer.domElement; let dragging=false;
function look(dx,dy){ camState.yaw-=dx*.0028; camState.pitch=clamp(camState.pitch+dy*.0022,-.15,1.15); camState.last=T0; }
function lockPointer(){ try{ const p=cvs.requestPointerLock(); if(p&&p.catch) p.catch(()=>{}); }catch(_){} }
cvs.addEventListener('pointerdown',e=>{ if(!started||e.pointerType!=='mouse') return; $('#settings').hidden=true; dragging=true; if(document.pointerLockElement!==cvs) lockPointer(); $('#lookhint').hidden=true; });
addEventListener('pointerup',()=>{ dragging=false; });
document.addEventListener('mousemove',e=>{ if(!started||mapView.isOpen) return; if(document.pointerLockElement===cvs||(dragging&&e.buttons)) look(e.movementX,e.movementY); });
cvs.addEventListener('wheel',e=>{ e.preventDefault(); camState.zoom=clamp(camState.zoom+(e.deltaY>0?.08:-.08),.55,1.8); },{passive:false});
$('#setBtn').addEventListener('click',()=>{ $('#settings').hidden=!$('#settings').hidden; });
$('#mmWrap').addEventListener('click',()=>{ if(started) openMap(); });
$('#prompt').addEventListener('pointerdown',e=>{ e.preventDefault(); e.stopPropagation(); action(); });
document.querySelectorAll('#qual button').forEach(b=>{ b.setAttribute('aria-pressed',b.dataset.q===qKey?'true':'false');
  b.addEventListener('click',()=>{ if(b.dataset.q===qKey){ toast(b.textContent+' graphics already on'); return; } try{ localStorage.setItem('naija-quality',b.dataset.q); }catch(e){} toast('Restarting with '+b.textContent.toLowerCase()+' graphics…'); setTimeout(()=>location.reload(),700); }); });
document.querySelectorAll('#snd button').forEach(b=>b.addEventListener('click',()=>setSound(b.dataset.s==='on'))); setSound(soundOn);
function enableTouchUI(){ if(touchUI) return; touchUI=true; document.body.classList.add('touchui'); $('#touch').hidden=false; $('#keys').hidden=true; $('#lookhint').hidden=true;
  const zl=$('#zoneL'), zr=$('#zoneR'), jo=$('#joy'), jk=$('#joyK'); let jid=null,jx=0,jy=0; const lp=new Map(); let pinch=0;
  zl.addEventListener('pointerdown',e=>{ $('#settings').hidden=true; jid=e.pointerId; jx=e.clientX; jy=e.clientY; jo.hidden=false; jo.style.left=jx+'px'; jo.style.top=jy+'px'; try{ zl.setPointerCapture(jid); }catch(_){} });
  zl.addEventListener('pointermove',e=>{ if(e.pointerId!==jid) return; let dx=e.clientX-jx, dy=e.clientY-jy; const d=Math.hypot(dx,dy), m=50; if(d>m){ dx*=m/d; dy*=m/d; } joy.x=dx/m; joy.y=dy/m; jk.style.transform=`translate(${dx}px,${dy}px)`; });
  const jend=e=>{ if(e.pointerId!==jid) return; jid=null; joy.x=joy.y=0; jo.hidden=true; jk.style.transform=''; }; zl.addEventListener('pointerup',jend); zl.addEventListener('pointercancel',jend);
  zr.addEventListener('pointerdown',e=>{ $('#settings').hidden=true; lp.set(e.pointerId,{x:e.clientX,y:e.clientY}); try{ zr.setPointerCapture(e.pointerId); }catch(_){} if(lp.size===2){ const [a,b]=[...lp.values()]; pinch=Math.hypot(a.x-b.x,a.y-b.y); } });
  zr.addEventListener('pointermove',e=>{ const p=lp.get(e.pointerId); if(!p) return;
    if(lp.size>=2){ p.x=e.clientX; p.y=e.clientY; const [a,b]=[...lp.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y); if(pinch>10) camState.zoom=clamp(camState.zoom*pinch/d,.55,1.8); pinch=d; return; }
    look((e.clientX-p.x)*1.6,(e.clientY-p.y)*1.6); p.x=e.clientX; p.y=e.clientY; });
  const lend=e=>{ lp.delete(e.pointerId); pinch=0; }; zr.addEventListener('pointerup',lend); zr.addEventListener('pointercancel',lend);
  $('#tE').addEventListener('pointerdown',e=>{ e.preventDefault(); action(); });
  $('#tRun').addEventListener('pointerdown',e=>{ e.preventDefault(); touchRun=!touchRun; $('#tRun').classList.toggle('on',touchRun); });
  const tb=$('#tBrake'); tb.addEventListener('pointerdown',e=>{ e.preventDefault(); touchBrake=true; tb.classList.add('on'); }); for(const ev of ['pointerup','pointercancel','pointerleave']) tb.addEventListener(ev,()=>{ touchBrake=false; tb.classList.remove('on'); });
  $('#tHorn').addEventListener('pointerdown',e=>{ e.preventDefault(); horn(); }); }
if(isTouch) enableTouchUI(); else addEventListener('touchstart',()=>enableTouchUI(),{once:true,passive:true});
let rotateSeen=false; function checkRotate(){ if(started&&innerWidth>innerHeight) rotateSeen=true; const show=touchUI&&started&&!rotateSeen&&innerHeight>innerWidth&&innerWidth<700; $('#rotate').hidden=!show; }
$('#rotateOk').addEventListener('click',()=>{ rotateSeen=true; checkRotate(); }); addEventListener('resize',checkRotate);

/* ================= actions ================= */
let enteredAt=0;
async function fadeSwap(fn){ busy=true; $('#fade').classList.add('on'); await new Promise(r=>setTimeout(r,380)); fn(); await frameWait(); $('#fade').classList.remove('on'); busy=false; }
function action(){ if(busy||!started) return;
  if(mode==='walk'){ if(nearDoor()) return enterApt(); const v=nearestVehicle(); if(v) return enterCar(v); }
  else if(mode==='drive'){ if(Math.abs(drive.speed)<3) exitCar(); else toast('Slow down first'); }
  else if(mode==='interior'){ if(nearExit()&&T0-enteredAt>.8) exitApt(); } }
const OPEN_RIDE={okada:1,keke:1};
function fleeFrom(v,n){ const hx=Math.cos(v.h), hz=-Math.sin(v.h), lx=hz, lz=-hx; const far=peds.slice().sort((a,b)=>Math.hypot(b.x-player.x,b.z-player.z)-Math.hypot(a.x-player.x,a.z-player.z));
  for(let i=0;i<n&&i<far.length;i++){ const p=far[i], side=i%2?-1:1; Object.assign(p,{x:v.x+lx*1.6*side+hx*mrr(-1,1),z:v.z+lz*1.6*side+hz*mrr(-1,1),y:SLAB,state:'flee',timer:mrr(4,6),fall:0,phone:false,yaw:Math.atan2(lx*side,lz*side)+mrr(-.6,.6)}); } }
function enterCar(v){
  if(v.ai){ v.ai=null; v.speed=0; v.jacked=true; fleeFrom(v,Math.max(1,Math.min(6,(v.c.seats||[]).length)));
    toast(v.type==='danfo'?'Danfo don change hand! Driver and passengers ran off.':v.type==='okada'?'"My okada!" The rider ran off.':v.type==='keke'?'"Ah, my keke!" The driver ran off.':v.type==='police'?'You took a police van. Wahala dey!':mpick(['"Oga, no wahala!" The driver bolted.','"Take am, take am!" The driver ran off.'])); }
  v.parked=false; drive.v=v; drive.speed=0; drive.steer=0; camState.last=-10;
  if(OPEN_RIDE[v.type]){ mode='drive'; seatHero(v); return; }
  if(hero){ const hx=Math.cos(v.h), hz=-Math.sin(v.h), lx=hz, lz=-hx, ow=v.c.def.W/2+1.0, sx=v.x+lx*ow+hx*.35, sz=v.z+lz*ow+hz*.35;
    Object.assign(player,{x:sx,z:sz,yaw:Math.atan2(-lx,-lz),speed:0}); player.y=groundY(sx,sz); rig.root.position.set(player.x,player.y,player.z); rig.root.rotation.y=player.yaw;
    const a=hero.act; for(const k of ['idle','walk','run']){ a[k].setEffectiveWeight(0); hero.w[k]=0; } a.car.reset(); a.car.paused=false; a.car.timeScale=1.7; a.car.setEffectiveWeight(1); a.car.play(); hero.carT=0; mode='enter'; return; }
  mode='drive'; rig.root.visible=false; }
// the player sits on okada / in keke and is seen riding
function seatHero(v){ const st=(SEATS[v.type]||[])[0]; if(!st||!v.c.hi){ rig.root.visible=false; return; }
  if(hero){ const a=hero.act; for(const k of ['idle','walk','run']){ a[k].setEffectiveWeight(0); hero.w[k]=0; } a.car.reset(); a.car.setEffectiveWeight(1); a.car.play(); a.car.time=a.car.getClip().duration-.02; a.car.paused=true; hero.mixer.update(0);
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
  unseatHero(); player.y=groundY(player.x,player.z); player.yaw=Math.atan2(hx,hz); player.speed=0; v.speed=0; v.parked=true; drive.v=null; drive.speed=0; mode='walk'; rig.root.visible=true; headSpot.intensity=0; BEAM.visible=false; }
function enterApt(){ fadeSwap(()=>{ mode='interior'; enteredAt=T0; INT.scene.add(rig.root); Object.assign(player,{x:0,z:3.3,y:0,yaw:Math.PI,speed:0}); Object.assign(camState,{yaw:Math.PI,pitch:.22,dist:2.7}); setScene(INT.scene); toast('Home sweet home'); }); }
function exitApt(){ fadeSwap(()=>{ mode='walk'; scene.add(rig.root); Object.assign(player,{x:APT.front.x,z:APT.front.z+.8,y:SLAB,yaw:0,speed:0}); Object.assign(camState,{yaw:0,pitch:.26,dist:4.3}); setScene(scene); }); }
function bump(s){ camState.shake=Math.min(1.2,camState.shake+s*.04); if(s>6) thud(); }

/* ================= simulation ================= */
function updateWalk(dt,inside){
  const [f,s]=inputVec(), cy=camState.yaw, fx=Math.sin(cy), fz=Math.cos(cy), rx=-Math.cos(cy), rz=Math.sin(cy);
  let mx=fx*f+rx*s, mz=fz*f+rz*s; const len=Math.hypot(mx,mz), run=K.shift||touchRun, target=len>.12?(run?RUN_V:WALK_V)*Math.min(1,len):0;
  player.speed+=(target-player.speed)*Math.min(1,dt*(target>player.speed?6:10));
  if(len>.12) player.yaw=lerpA(player.yaw,Math.atan2(mx/len,mz/len),1-Math.exp(-12*dt));
  const nx=player.x+Math.sin(player.yaw)*player.speed*dt, nz=player.z+Math.cos(player.yaw)*player.speed*dt;
  if(inside){ const c={x:clamp(nx,-5.6,5.6),z:clamp(nz,-4.6,4.6)}; resolveCircle(c,.32,INT.cols); player.x=c.x; player.z=c.z; player.y=0; }
  else { let x=nx, z=nz; if(!onLand(x,player.z)) x=player.x; if(!onLand(x,z)) z=player.z; const c={x,z}; resolveCircle(c,.34); player.x=c.x; player.z=c.z;
    for(const v of vehicles){ const dx=player.x-v.x, dz=player.z-v.z; if(Math.abs(dx)>4||Math.abs(dz)>4) continue; const hx=Math.cos(v.h), hz=-Math.sin(v.h), al=dx*hx+dz*hz, lat=-dx*hz+dz*hx, ex=v.c.def.L/2+.3-Math.abs(al), ey=v.c.def.W/2+.3-Math.abs(lat);
      if(ex>0&&ey>0){ if(ey<ex){ const g=Math.sign(lat)||1; player.x+=-hz*g*ey; player.z+=hx*g*ey; } else { const g=Math.sign(al)||1; player.x+=hx*g*ex; player.z+=hz*g*ex; } } }
    const gy=groundY(player.x,player.z); player.y+=(gy-player.y)*Math.min(1,dt*14); }
  player.ph+=dt*(player.speed<3?player.speed*4.3:10+(player.speed-3)*.3);
  rig.root.position.set(player.x,player.y,player.z); rig.root.rotation.y=player.yaw;
  if(hero){ heroAnim(dt,player.speed); return; } const sn=player.speed<.05?0:(player.speed<=2.6?player.speed/2.6:1+(player.speed-2.6)/3.6); animHuman(rig,player.ph,sn,T0,false); }
function updateDrive(dt){ const v=drive.v, [f,s]=inputVec(), hb=K[' ']||touchBrake; let sp=drive.speed;
  const DT=({bus:[.5,22],keke:[.6,16],danfo:[.8,28],okada:[1.15,31],police:[1,40]})[v.type]||[1,38];
  if(f>.1) sp+=(sp<-.2?18:9.5*DT[0]*Math.max(0,1-sp/DT[1]))*dt*f; else if(f<-.1){ sp+=(sp>.4?-20:-6)*dt*(-f); if(sp<-9) sp=-9; } else { const dec=(1.6+Math.abs(sp)*.1)*dt; sp=Math.abs(sp)<=dec?0:sp-Math.sign(sp)*dec; }
  if(hb){ const dec=24*dt; sp=Math.abs(sp)<=dec?0:sp-Math.sign(sp)*dec; }
  const maxSt=.6/(1+Math.abs(sp)/14); drive.steer+=(-s*maxSt-drive.steer)*Math.min(1,dt*6);
  v.h+=sp/2.7*Math.tan(drive.steer)*(hb&&Math.abs(sp)>4?1.5:1)*dt;
  const surf=condAt(v.x,v.z), lim=surf==='dirt'?(v.type==='okada'?.72:.55):surf==='bad'?.85:1; if(Math.abs(sp)>DT[1]*lim) sp-=Math.sign(sp)*Math.min(Math.abs(sp)-DT[1]*lim,dt*(surf==='dirt'?7:4));
  const fx=Math.cos(v.h), fz=-Math.sin(v.h); let nx=v.x+fx*sp*dt, nz=v.z+fz*sp*dt;
  { const ph=bumpPothole(v,fx,fz,Math.abs(sp),true); if(ph){ const hit=ph.depth*Math.min(Math.abs(sp),16); camState.shake=Math.min(1.4,camState.shake+hit*.08); if(hit>3){ clunk(Math.min(1,hit/10)); sp*=1-Math.min(.22,hit*.012); } if(hit>9&&!ph.told){ ph.told=1; toast(mpick(['Ehn! This pothole no get mercy','Lagos road wahala!','Small small, this road don spoil'])); } } }
  if(!onLand(nx,nz,1.2)||!onLand(nx+fx*2.2,nz+fz*2.2,1.2)||!onLand(nx-fx*2.2,nz-fz*2.2,1.2)){ nx=v.x; nz=v.z; if(Math.abs(sp)>4) bump(Math.abs(sp)); sp*=-.25; }
  const P={x:nx,z:nz}; let hit=false;
  const cr=v.c.def.W/2*.95, ck=Math.max(0,v.c.def.L/2-cr);
  for(const k of (ck>.2?[ck,-ck]:[0])){ const c={x:P.x+fx*k,z:P.z+fz*k}, ox=c.x, oz=c.z; if(resolveCircle(c,cr)){ hit=true; P.x+=c.x-ox; P.z+=c.z-oz; } }
  if(hit){ if(Math.abs(sp)>6){ bump(Math.abs(sp)); sp*=.55; } sp*=Math.max(0,1-dt*5); }
  for(const o of vehicles){ if(o===v) continue; const dx=o.x-P.x, dz=o.z-P.z; if(Math.abs(dx)>5||Math.abs(dz)>5) continue; const d=Math.hypot(dx,dz), lim=(v.c.def.L+o.c.def.L)/2*.7;
    if(d<lim&&d>.01){ const push=lim-d; P.x-=dx/d*push; P.z-=dz/d*push; if(Math.abs(sp)>4){ bump(Math.abs(sp)); if(o.ai){ o.ai.wait=3; if(MR()<.7) setTimeout(horn,250); } } sp*=.5; } }
  v.x=P.x; v.z=P.z; drive.speed=sp; v.speed=sp; player.x=v.x; player.z=v.z;
  headSpot.intensity=ENV.spot; const bo=Math.min(.7,ENV.spot/220); BEAM.visible=bo>.03; if(BEAM.visible){ const d=v.c.def.L/2+9; BEAM.position.set(v.x+fx*d,groundY(v.x+fx*d,v.z+fz*d)+.06,v.z+fz*d); BEAM.rotation.set(-Math.PI/2,Math.atan2(-fx,-fz),0); BEAM.material.opacity=bo; } }
function updateTraffic(dt){
  for(const v of vehicles){ const ai=v.ai; if(!ai) continue; const fx=Math.cos(v.h), fz=-Math.sin(v.h);
    const sc=ai.seg.k===0?(ai.cond||'good'):'good'; let target=ai.seg.k===1?6.5:ai.maxV*(sc==='dirt'?.5:sc==='bad'?.7:1), waiting=false; if(ai.wait>0){ ai.wait-=dt; target=0; waiting=true; }
    if(ai.seg.k===0){ const nb=nodes[ai.b], dist=ai.seg.len-ai.s;
      if(v.type==='danfo'&&ai.stopAt>0&&ai.s>=ai.stopAt){ ai.stopAt=-1; ai.wait=mrr(4,8); target=0; waiting=true; }
      if(!nb.bridge){ const st=lightAt(nb,ai.seg.fx); if(st!=='g'&&!(st==='y'&&dist<8)){ const lim=Math.max(0,(dist-.8)*.8); if(lim<target){ target=lim; if(dist<30) waiting=true; } } } }
    if(ai.ghost>0) ai.ghost-=dt; else {
      for(const o of vehicles){ if(o===v) continue; const dx=o.x-v.x, dz=o.z-v.z; if(Math.abs(dx)>16||Math.abs(dz)>16) continue; const ah=dx*fx+dz*fz; if(ah<=0||ah>22) continue;
        if(Math.abs(-dx*fz+dz*fx)<(v.c.def.W+o.c.def.W)/2+.12){ const lim=Math.max(0,(ah-((v.c.def.L+o.c.def.L)/2+1.8))*1.3); if(lim<target){ target=lim; if(o.ai&&o.ai.waiting) waiting=true; } } }
      const chk=(x,z)=>{ const dx=x-v.x, dz=z-v.z, ah=dx*fx+dz*fz; if(ah>0&&ah<9&&Math.abs(-dx*fz+dz*fx)<1.7) target=0; };
      if(mode==='walk'||mode==='enter') chk(player.x,player.z); for(const p of peds) if(p.state!=='down'&&Math.abs(p.x-v.x)<10&&Math.abs(p.z-v.z)<10) chk(p.x,p.z); }
    ai.waiting=waiting;
    v.speed+=clamp(target-v.speed,-10*dt,3.5*dt);
    if(waiting||v.speed>.5) ai.stuck=0; else if(target<.2){ ai.stuck+=dt; if(ai.stuck>8){ ai.ghost=2.5; ai.stuck=0; } }
    ai.s+=v.speed*dt; let guard=0;
    while(ai.s>=ai.seg.len&&guard++<4){ ai.s-=ai.seg.len; if(ai.seg.k===0){ const opts=nodes[ai.b].adj.filter(n=>n!==ai.a); ai.na=opts.length?mpick(opts):ai.a; ai.seg=turnSeg(ai.a,ai.b,ai.na); } else { ai.a=ai.b; ai.b=ai.na; ai.seg=lineSeg(ai.a,ai.b); ai.cond=EDGE_COND.get(ekey(ai.a,ai.b)); ai.stopAt=(v.type==='danfo'&&MR()<.35)?ai.seg.len*mrr(.3,.65):-1; } }
    segPos(ai.seg,ai.s,_sp); v.x=_sp.x; v.z=_sp.z; v.h=Math.atan2(-_sp.dz,_sp.dx);
    if((v.x-player.x)**2+(v.z-player.z)**2>340*340) placeCar(v,120,250); } }
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
  c.g.position.set(v.x,v.y+v.bob,v.z); c.g.rotation.set(v.lean,v.h,Math.atan((yA-yB)/4)*.9+v.pitch);
  const near=d2<HI_D*HI_D||v===drive.v; if(c.hi){ c.hi.visible=near||!c.lo.children.length; c.lo.visible=!c.hi.visible; }
  if(c.occ){ c.occ.visible=c.hi.visible&&d2<OCC_D*OCC_D&&!!v.ai; }
  if(!near&&c.lo&&c.lo.children.length) return;
  for(const wh of c.wheels){ wh.spin.rotation.z-=v.speed*dt/(wh.r||c.def.r); if(wh.front&&!wh.bar) wh.piv.rotation.y=v.steerVis; }
  if(c.steerG) c.steerG.userData.inner.rotation.y=v.steerVis*1.15; }
function knock(p,v,fx,fz,sp){ p.state='down'; p.timer=3.6; p.fall=0; p.phone=false; p.vx=fx*sp*.45; p.vz=fz*sp*.45; p.yaw=Math.atan2(-fx,-fz);
  if(v===drive.v){ drive.speed*=.85; bump(sp*.5); toast(mpick(['Ah! Sorry o!','Ewo! Watch the road!','LASTMA go hear this one o!'])); } }
function updatePeds(dt){
  for(const p of peds){ const dxp=p.x-player.x, dzp=p.z-player.z, d2=dxp*dxp+dzp*dzp;
    if(d2>230*230){ p.h.root.visible=false; placePed(p,70,170); continue; }
    if(p.state!=='down') for(const v of vehicles){ const sp=Math.abs(v.speed); if(sp<2.5) continue; const dx=p.x-v.x, dz=p.z-v.z; if(Math.abs(dx)>4||Math.abs(dz)>4) continue; const fx=Math.cos(v.h), fz=-Math.sin(v.h);
      if(Math.abs(dx*fx+dz*fz)<v.c.def.L/2+.3&&Math.abs(-dx*fz+dz*fx)<v.c.def.W/2+.35){ knock(p,v,fx,fz,sp); break; } }
    if(p.state==='down'){ p.timer-=dt; p.x+=p.vx*dt; p.z+=p.vz*dt; p.vx*=Math.exp(-4*dt); p.vz*=Math.exp(-4*dt); p.fall=p.timer>1.2?Math.min(1,p.fall+dt*4):Math.max(0,p.fall-dt*1.8);
      if(p.timer<=0){ p.state='flee'; p.timer=mrr(3,5); p.fall=0; p.yaw+=Math.PI+mrr(-.6,.6); } }
    else if(p.state==='idle'){ p.speed=Math.max(0,p.speed-dt*4); p.timer-=dt; if(p.timer<=0){ p.state='walk'; p.phone=false; } }
    else if(p.state==='flee'){ p.timer-=dt; p.speed=4.6; const c={x:p.x+Math.sin(p.yaw)*p.speed*dt,z:p.z+Math.cos(p.yaw)*p.speed*dt}; if(resolveCircle(c,.35)) p.yaw+=Math.PI*.5*dt*6; if(!onLand(c.x,c.z)){ p.yaw+=Math.PI; } else { p.x=c.x; p.z=c.z; } if(p.timer<=0) replanPed(p); }
    else { const t=p.q[0]; if(!t){ pedPlan(p); continue; } const dx=t.x-p.x, dz=t.z-p.z, d=Math.hypot(dx,dz);
      if(d<.5){ p.q.shift(); if(!p.q.length){ if(MR()<.08){ p.state='idle'; p.timer=mrr(3,7); p.phone=MR()<.6; } pedPlan(p); } }
      else { p.speed+=(p.v-p.speed)*Math.min(1,dt*3); p.x+=dx/d*p.speed*dt; p.z+=dz/d*p.speed*dt; p.yaw=lerpA(p.yaw,Math.atan2(dx,dz),Math.min(1,dt*6)); } }
    const vis=d2<150*150; p.h.root.visible=vis; if(!vis) continue;
    const lod=d2<45*45?1:0; if(lod!==p.lod){ p.lod=lod; p.h.root.traverse(o=>{ if(o.isMesh) o.castShadow=!!lod; }); }
    const gy=groundY(p.x,p.z); p.y+=(gy-p.y)*Math.min(1,dt*12);
    p.h.root.position.set(p.x,p.y+p.fall*.12,p.z); p.h.root.rotation.y=p.yaw; p.h.root.rotation.x=-p.fall*1.45;
    const sn=p.state==='flee'?2:p.state==='down'?0:p.speed/1.4; p.ph+=dt*(p.state==='flee'?10:p.speed*4.4);
    animHuman(p.h,p.ph,sn,T0+p.v*7,p.phone&&p.state==='idle'); } }
function updateWorld(dt){ WU.time.value=(WU.time.value+dt*.6)%1000; if(WU._n){ WU._n.offset.x+=dt*.004; WU._n.offset.y+=dt*.0025; }
  { const on=Math.floor(T0*4)%2===0; polRed.color.setRGB(on?3:.2,on?.15:.02,on?.1:.02); polBlue.color.setRGB(on?.1:.15,on?.2:.35,on?.3:3); }
  { const f=mode==='drive'?drive.v:player; fillLight.position.set(f.x-Math.sin(camState.yaw)*1.2,(f.y||0)+3.2,f.z-Math.cos(camState.yaw)*1.2); }
  const fo=mode==='drive'?drive.v:player; sun.position.set(fo.x+lightDir.x*260,lightDir.y*260,fo.z+lightDir.z*260); sun.target.position.set(fo.x,0,fo.z);
  // keep the shadow map steady: move the light in whole shadow-texel steps
  { const tex=(sun.shadow.camera.right-sun.shadow.camera.left)/Q.sh; sun.position.x=Math.round(sun.position.x/tex)*tex; sun.position.z=Math.round(sun.position.z/tex)*tex; sun.target.position.x=Math.round(sun.target.position.x/tex)*tex; sun.target.position.z=Math.round(sun.target.position.z/tex)*tex; }
  if(Math.abs(camera.position.x-(SQ.sx0+SQ.sx1)/2)<160&&Math.abs(camera.position.z-(SQ.sz0+SQ.sz1)/2)<160) for(const fl of flags){ const pos=fl.mesh.geometry.attributes.position, a=pos.array, b=fl.base; for(let i=0;i<a.length;i+=3){ const x=b[i], k=x/3.6; a[i+2]=Math.sin(x*2.2-T0*6+fl.ph)*.2*k+Math.sin(b[i+1]*3+T0*4)*.03*k; } pos.needsUpdate=true; fl.mesh.geometry.computeVertexNormals(); }
  aviMat.emissiveIntensity=ENV.lamp>.3?(Math.sin(T0*3)>.2?3:.3):.6;
  if(ENV.night) bridgeParts.cableMat.emissive.setHSL((T0*.04)%1,.85,.5);
  PH_MAT.wet.opacity=.62+.38*ENV.wet; PH_MAT.wet.roughness=.22-.18*ENV.wet; PH_MAT.dry.color.setScalar(1-ENV.wet*.25);
  APT.ring.material.opacity=.45+.35*Math.sin(T0*3); APT.ring.scale.setScalar(1+.08*Math.sin(T0*3)); }
const _up=new THREE.Vector3(0,1,0);
// Low quality has no real-time sun shadows; soft dark spots under people and vehicles keep them standing on the ground
const BLOBS=(()=>{ if(Q.shadows) return null; const [c,g]=cv(64,64); const gr=g.createRadialGradient(32,32,2,32,32,31); gr.addColorStop(0,'rgba(0,0,0,.55)'); gr.addColorStop(.6,'rgba(0,0,0,.32)'); gr.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle=gr; g.fillRect(0,0,64,64);
  const geo=new THREE.PlaneGeometry(1,1); geo.rotateX(-Math.PI/2);
  const im=new THREE.InstancedMesh(geo,new THREE.MeshBasicMaterial({map:tx(c,true,false),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-5,polygonOffsetUnits:-5,fog:true}),96);
  im.count=0; im.frustumCulled=false; im.renderOrder=1; scene.add(im); return im; })();
function updateBlobs(){ if(!BLOBS) return; let n=0; const cx=camera.position.x, cz=camera.position.z, a=BLOBS.instanceMatrix.array;
  const put=(x,y,z,sx,sz,ry)=>{ if(n>=96) return; _q.setFromAxisAngle(_up,ry); _p.set(x,y+.03,z); _s.set(sx,1,sz); _m.compose(_p,_q,_s); _m.toArray(a,n*16); n++; };
  if(mode!=='interior'){
    if(mode!=='drive') put(player.x,player.y,player.z,1.1,1.1,0);
    for(const v of vehicles){ if(!v.c.g.visible) continue; const dx=v.x-cx, dz=v.z-cz; if(dx*dx+dz*dz>90*90) continue; put(v.x,v.y,v.z,v.c.def.L*1.05,v.c.def.W*1.25,v.h); }
    for(const p of peds){ if(!p.h.root.visible||p.state==='down') continue; const dx=p.x-cx, dz=p.z-cz; if(dx*dx+dz*dz>60*60) continue; put(p.x,p.y,p.z,.95,.95,0); } }
  BLOBS.count=n; BLOBS.instanceMatrix.needsUpdate=true; }
let recycleT=0;
function recycleCars(dt){ recycleT-=dt; if(recycleT>0) return; recycleT=2;
  for(const v of vehicles){ if(v.ai||v===drive.v||!v.jacked) continue; if(Math.hypot(v.x-player.x,v.z-player.z)>150&&placeCar(v,120,250)){ v.jacked=false; v.parked=false; } } }

/* ================= main loop ================= */
await step('Waking up the city…', 94);
await Promise.race([clockSync,new Promise(r=>setTimeout(r,2500))]).catch(()=>{});
CLOCK.keepSynced(5);
updateEnv(0,true);
{ const hid=[rain,stars,poolMesh,clouds].filter(o=>o&&!o.visible); for(const o of hid) o.visible=true; renderer.compile(scene,camera); for(const o of hid) o.visible=false; } renderer.compile(INT.scene,camera);
try{ KTX2.dispose(); }catch(e){}   // all textures are decoded; free the decoder workers
{ const rt=new THREE.WebGLRenderTarget(64,64); renderer.setRenderTarget(rt); renderer.render(INT.scene,camera); renderer.setRenderTarget(null); rt.dispose(); }
for(const k in A) A[k]=null;   // free the city building buffers (the meshes keep their own copy)
clearInterval(progTimer);
let warm=0, perfAcc=0, perfN=0, prCool=3, errShown=0;
function applyPR(){ renderer.setPixelRatio(PR); renderer.setSize(innerWidth,innerHeight); if(composer){ composer.setPixelRatio(PR); composer.setSize(innerWidth,innerHeight); } }
function reportErr(e){ console.error(e); if(errShown++<1&&started) toast('Small hitch. The game kept running.'); }
function simulate(dt){
  if(started&&!busy&&!mapView.isOpen){ if(mode==='walk') updateWalk(dt,false); else if(mode==='interior') updateWalk(dt,true); else if(mode==='enter') updateEnter(dt); else updateDrive(dt); }
  else if(mapView.isOpen&&mode==='drive'){ drive.speed=0; drive.v.speed=0; }
  updateEnv(dt); updateStorm(dt);
  if(mode!=='interior'){ updateTraffic(dt); updatePeds(dt); updateLights(dt); for(const v of vehicles) syncCar(v,dt); updateWorld(dt); recycleCars(dt); } else INT.fan.rotation.y+=dt*4;
  if(!started){ rig.root.position.set(player.x,player.y,player.z); if(hero) heroAnim(dt,0); else animHuman(rig,0,0,T0,false); camState.yaw+=dt*.05; }
  updateCamera(dt); updateBlobs(); updateHUD(dt); updateAudio(); }
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
    peds(b){ for(const p of peds) p.h.root.visible=b; }, cars(b){ for(const v of vehicles) v.c.g.visible=b; },
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
loadTxt.textContent='Lagos is ready.'; loadBar.style.width='100%';
const eb=$('#enterBtn'); eb.hidden=false; eb.focus();
eb.addEventListener('click',()=>{ started=true; lastT=performance.now(); camState.yaw=0; $('#loading').classList.add('gone'); setTimeout(()=>{ $('#loading').hidden=true; },650); $('#hud').hidden=false; initAudio(); checkRotate();
  if(!touchUI){ try{ const p=cvs.requestPointerLock(); if(p&&p.catch) p.catch(()=>{ $('#lookhint').hidden=false; }); }catch(_){ $('#lookhint').hidden=false; } }
  updateClockHUD(); toast(`${CLOCK.fmtHour(ENV.hour)} in Lagos · ${wLabel()}. Your okada is parked by the road.`,4.5); });
document.addEventListener('pointerlockchange',()=>{ if(!document.pointerLockElement&&started&&!touchUI&&!mapView.isOpen) $('#lookhint').hidden=false; else $('#lookhint').hidden=true; });
