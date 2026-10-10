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
window.__nsOK = true;

const $ = s => document.querySelector(s);
const loadTxt = $('#loadTxt'), loadBar = $('#loadBar');
const frameWait = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
async function step(txt, p) { loadTxt.textContent = txt; loadBar.style.width = p + '%'; await frameWait(); }

/* ================= helpers ================= */
function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const R = mulberry32(90210);
const rr = (a,b) => a + R()*(b-a), ri = (a,b) => Math.floor(rr(a,b+1)), pick = a => a[Math.floor(R()*a.length)];
const MR = Math.random, mrr = (a,b) => a + MR()*(b-a), mpick = a => a[Math.floor(MR()*a.length)];
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const sm = t => { t = clamp(t,0,1); return t*t*(3-2*t); };
const lerpA = (a,b,t) => { let d = ((b-a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI; return a + d*t; };
const isTouch = matchMedia('(pointer: coarse)').matches;

/* ================= renderer ================= */
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias:false, powerPreference:'high-performance' }); }
catch(e){ window.__nsFail('Your browser could not start WebGL. Try Chrome or Edge on a computer.'); throw e; }
const QUAL={low:{pr:.75,sh:1024,msaa:0,bloom:false,water:128,draw:230,peds:18,cars:14,fog:1.35},
  medium:{pr:1,sh:2048,msaa:0,bloom:true,water:256,draw:330,peds:30,cars:22,fog:1.12},
  high:{pr:Math.min(window.devicePixelRatio||1,1.5),sh:4096,msaa:4,bloom:true,water:512,draw:450,peds:46,cars:30,fog:1}};
let qKey=null; try{ qKey=localStorage.getItem('naija-quality'); }catch(e){}
if(!QUAL[qKey]) qKey=isTouch?'low':'medium'; const Q=QUAL[qKey];
const PR=Q.pr; renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .6;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('#view').appendChild(renderer.domElement);
renderer.domElement.tabIndex = 0;
const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xe0a77c, 0.0019);
const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.3, 9000);
camera.layers.enable(1);
const pmrem = new THREE.PMREMGenerator(renderer);

/* ================= canvas textures ================= */
function cv(w,h){ const c = document.createElement('canvas'); c.width=w; c.height=h; return [c, c.getContext('2d')]; }
function tx(c, srgb=true, rep=true){ const t = new THREE.CanvasTexture(c); if(srgb) t.colorSpace = THREE.SRGBColorSpace; if(rep){ t.wrapS = t.wrapT = THREE.RepeatWrapping; } t.anisotropy = maxAniso; return t; }
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
function texCross(){ const S=512,[c,g]=cv(S,S); asphalt(g,S,S); g.fillStyle='#ebe7dd';
  for(let x=40;x<472;x+=34){ g.fillRect(x,10,17,50); g.fillRect(x,452,17,50); }
  for(let y=40;y<472;y+=34){ g.fillRect(10,y,50,17); g.fillRect(452,y,50,17); }
  return tx(c,true,false); }
function texAnkara(p){ const S=256,[c,g]=cv(S,S); g.fillStyle=p[0]; g.fillRect(0,0,S,S);
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
function fitFont(g,text,maxW,size,fam,weight=''){ let s=size; g.font=`${weight} ${s}px ${fam}`; while(g.measureText(text).width>maxW && s>12){ s-=2; g.font=`${weight} ${s}px ${fam}`; } return s; }
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
  const t=tx(c,true,false), te=tx(e,true,false); return {map:t, em:te}; }
function texBillboard(l1,l2,bgA,bgB,fg){ const [c,g]=cv(1024,384); const gr=g.createLinearGradient(0,0,1024,384); gr.addColorStop(0,bgA); gr.addColorStop(1,bgB); g.fillStyle=gr; g.fillRect(0,0,1024,384);
  g.fillStyle='rgba(255,255,255,.07)'; for(let i=0;i<14;i++){ g.beginPath(); g.arc(rr(0,1024),rr(0,384),rr(30,140),0,7); g.fill(); }
  g.fillStyle=fg; g.textAlign='center'; g.textBaseline='middle'; fitFont(g,l1,940,120,'Bungee'); g.fillText(l1,512,160); fitFont(g,l2,900,46,'"Barlow Semi Condensed"','700'); g.fillText(l2,512,290); return tx(c,true,false); }
function texLabel(text, bg='#F2B705', fg='#0E1014', w=1024, h=192){ const [c,g]=cv(w,h); g.fillStyle=bg; const r=h/2; g.beginPath(); g.roundRect?g.roundRect(8,8,w-16,h-16,r-8):g.rect(8,8,w-16,h-16); g.fill();
  g.fillStyle=fg; g.textAlign='center'; g.textBaseline='middle'; fitFont(g,text,w-80,96,'Bungee'); g.fillText(text,w/2,h/2+4); const t=tx(c,true,false); return t; }

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

/* ================= boot ================= */
await Promise.race([Promise.all([document.fonts.load('48px Bungee'),document.fonts.load('700 24px "Barlow Semi Condensed"')]).catch(()=>{}), new Promise(r=>setTimeout(r,3000))]);
await step('Loading danfos, kekes and houses…', 3);
const MODEL_FILES={danfo:['yellowvan','-x',4.8],keke:['three-wheeled','-x',2.75],bus:['citybus','+z',10.5],police:['police_pickup','-x',5.3],okada:['red_motorcycle','-x',2.05],
  bungalow:['beigehouse','h',12.5],house:['residentialhouse','h',16],storey:['two-story_house_3d_model','h',12.5],station:['police_station','h',26]};
let MODELS=null;
try{
  const L=new GLTFLoader(), out={}; let done=0;
  await Promise.all(Object.entries(MODEL_FILES).map(async([key,[file,front,size]])=>{
    const r=await fetch(`assets/models/${file}.glb`); if(!r.ok) throw new Error(file+' '+r.status); const buf=await r.arrayBuffer();
    const gltf=await new Promise((res,rej)=>L.parse(buf,'',res,rej));
    let mesh=null; gltf.scene.updateMatrixWorld(true); gltf.scene.traverse(o=>{ if(o.isMesh&&!mesh) mesh=o; });
    const geo=mesh.geometry.clone(); geo.applyMatrix4(mesh.matrixWorld);
    if(front==='-x') geo.rotateY(Math.PI); else if(front==='+z') geo.rotateY(Math.PI/2);
    geo.computeBoundingBox(); let bb=geo.boundingBox; const sz=new THREE.Vector3(); bb.getSize(sz); const sc=size/sz.x;
    geo.translate(-(bb.min.x+bb.max.x)/2,-bb.min.y,-(bb.min.z+bb.max.z)/2); geo.scale(sc,sc,sc); geo.computeBoundingBox(); geo.computeBoundingSphere(); geo.boundingBox.getSize(sz);
    const mat=mesh.material; if(mat.map){ mat.map.anisotropy=maxAniso; mat.map.colorSpace=THREE.SRGBColorSpace; } mat.side=THREE.DoubleSide; mat.roughness=front==='h'?.88:.5; mat.metalness=front==='h'?0:.2;
    out[key]={geo,mat,W:sz.x,D:sz.z,H:sz.y}; loadTxt.textContent=`Loading danfos, kekes and houses… ${++done}/9`; }));
  MODELS=out;
}catch(e){ console.warn('3D models could not load, using built-in ones.',e); }
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
const ANK=ANKP.map(texAnkara);

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
  sign:new THREE.MeshStandardMaterial({map:T.signs.map,emissiveMap:T.signs.em,emissive:0xffffff,emissiveIntensity:0,roughness:.6,polygonOffset:true,polygonOffsetFactor:-1}),
  conc:new THREE.MeshStandardMaterial({map:T.conc,roughness:.85,color:0xe4e0d8}),
  base:new THREE.MeshStandardMaterial({color:0x3a3b3e,roughness:.95}),
};
const FAC_KEYS=['glass','bronze','office','resi','oldmid','shop'];
const TILE={glass:[12.8,28.8],bronze:[12.8,28.8],office:[12,28.8],resi:[12.8,25.6],oldmid:[12,27.2],shop:[20,4.4]};
const TINTS={glass:['#ffffff','#e2f2ff','#dcfff2','#eef0ff'],bronze:['#ffffff','#fff0dc'],office:['#ffffff','#f1ece2','#e6e1d8','#fff6e6'],
  resi:['#fffaf0','#ffe6d2','#e2f0ff','#e4f6e8','#f1e6ff','#ffffff','#fff1c0'],oldmid:['#f6d98b','#f2b8a8','#a9d6e5','#b8e0b0','#e9c46a','#f4a261','#ddd5c8','#c9b8e8','#e7e1d3']};
const A={}; for(const k of [...FAC_KEYS,'roof','zinc','fence','curb','pave','plaza','grass','road2','road4','cross','sign','conc']) A[k]=new Acc();

/* ================= sky, sun, water ================= */
await step('Hanging the sun over the harbour…', 14);
const hemi=new THREE.HemisphereLight(0xffc6a0,0x5a4636,.55); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffb26b,2.6); sun.castShadow=true;
sun.shadow.mapSize.set(Q.sh,Q.sh);
Object.assign(sun.shadow.camera,{left:-95,right:95,top:95,bottom:-95,near:1,far:600});
sun.shadow.bias=-0.0003; sun.shadow.normalBias=0.06; sun.shadow.camera.layers.enable(1); sun.shadow.camera.updateProjectionMatrix();
scene.add(sun, sun.target);
const sky=new Sky(); sky.scale.setScalar(8000); scene.add(sky);
const sunDir=new THREE.Vector3(), lightDir=new THREE.Vector3();
const water=new Water(new THREE.PlaneGeometry(9000,9000),{textureWidth:Q.water,textureHeight:Q.water,waterNormals:texWaterNormals(),sunDirection:new THREE.Vector3(0,1,0),sunColor:0xffffff,waterColor:0x1a3b48,distortionScale:2.4,fog:true});
water.rotation.x=-Math.PI/2; water.position.y=-1.6; scene.add(water);
const starGeo=new THREE.BufferGeometry(); { const a=[]; for(let i=0;i<1600;i++){ const th=MR()*Math.PI*2, ph=Math.acos(MR()*0.95); a.push(Math.sin(ph)*Math.cos(th)*5000, Math.cos(ph)*5000, Math.sin(ph)*Math.sin(th)*5000); } starGeo.setAttribute('position',new THREE.Float32BufferAttribute(a,3)); }
const stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xffffff,size:1.6,sizeAttenuation:false,fog:false,transparent:true,opacity:.8})); stars.visible=false; scene.add(stars);

/* ================= land, roads ================= */
await step('Laying asphalt on the Marina…', 22);
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
for(const [a,b] of EDGES){ if(a>b) continue; const A0=nodes[a], B0=nodes[b]; if(A0.bridge||B0.bridge) continue;
  const dx=B0.x-A0.x, dz=B0.z-A0.z, L=Math.hypot(dx,dz), fx=dx/L, fz=dz/L;
  const sa=crossHalf(A0,fx), sb=crossHalf(B0,fx), w=2*edgeHalf(A0,B0);
  ribbon(w>=20?A.road4:A.road2, A0.x+fx*sa, A0.z+fz*sa, B0.x-fx*sb, B0.z-fz*sb, w, flatY(0.03)); }
// intersections
for(const n of nodes){ if(n.bridge) continue; const hx=NSW(n.x)/2, hz=EWW(n.z)/2;
  A.cross.quad([n.x-hx,.04,n.z+hz],[n.x+hx,.04,n.z+hz],[n.x+hx,.04,n.z-hz],[n.x-hx,.04,n.z-hz],[0,1,0],[[0,0],[1,0],[1,1],[0,1]],WHITE); }
// bridge + Lekki approach road
ribbon(A.road2,330+NSW(330)/2,BR.z,1075,BR.z,16,(x,z)=>(bridgeY(x,z)??0)+.03,4);

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
  const k=signIdx++%SIGNS.length, cxm=(b.x0+b.x1)/2, czm=(b.z0+b.z1)/2; const len=(m===dS||m===dN)?b.x1-b.x0:b.z1-b.z0; const w=Math.min(len*.85,6.4), h=w/4, o=.12;
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
  else { if(r<.5){ b.h=rr(35,140); b.type=pick(['glass','bronze','office']); } else { b.h=rr(15,45); b.type=pick(['resi','office']); } }
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
    const key=pick(w>=15&&d>=15?['house','storey','bungalow','storey']:['bungalow','storey']), M=MODELS[key];
    let fw=M.W, fd=M.D; if(rot90){ const t=fw; fw=fd; fd=t; }
    const sc=Math.min((w-3)/fw,(d-3)/fd,1.1)*rr(.95,1);
    if(sc<.66){ const b=planLot(l,'island'); if(b){ addBuilding(b,{collide}); if(b.shop&&blk.real) signOn(b,blk); } continue; }
    addHouse(key,cx,cz,ry,sc); if(collide) addCol({x0:cx-fw*sc/2,x1:cx+fw*sc/2,z0:cz-fd*sc/2,z1:cz+fd*sc/2,h:M.H*sc+SLAB});
    if(R()<.7) compoundWall(l,face,collide); } }
const STATION={x:265,z:0,label:null};
for(const blk of blocks){ blk.real=true;
  if(MODELS&&blk.kind!=='square'){
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
if(MODELS){ fillGhetto({x0:bandN.x0+2,x1:bandN.x1-12,z0:bandN.z0+2,z1:bandN.z1-SIDE},{x0:-1e9,x1:1e9,z0:-1e9,z1:bandN.z1-SIDE});
  fillGhetto({x0:bandW.x0+2,x1:bandW.x1-SIDE,z0:bandW.z0+SIDE,z1:bandW.z1-12},{x0:-1e9,x1:bandW.x1-SIDE,z0:-1e9,z1:1e9}); }
else { fillRect({x0:bandN.x0+2,x1:bandN.x1-12,z0:bandN.z0+2,z1:bandN.z1-SIDE},'island',34,null);
  fillRect({x0:bandW.x0+2,x1:bandW.x1-SIDE,z0:bandW.z0+SIDE,z1:bandW.z1-12},'island',30,null); }
const houseChunks=[];
if(MODELS){ const CH=160, up=new THREE.Vector3(0,1,0);
  for(const key in houseInst){ const M=MODELS[key], by=new Map();
    for(const h of houseInst[key]){ const k=Math.floor(h.x/CH)+','+Math.floor(h.z/CH); if(!by.has(k)) by.set(k,[]); by.get(k).push(h); }
    for(const list of by.values()){ const im=new THREE.InstancedMesh(M.geo,M.mat,list.length);
      list.forEach((h,i)=>{ _q.setFromAxisAngle(up,h.ry); _p.set(h.x,SLAB,h.z); _s.setScalar(h.sc); _m.compose(_p,_q,_s); im.setMatrixAt(i,_m); });
      im.instanceMatrix.needsUpdate=true; im.computeBoundingSphere(); im.castShadow=true; im.receiveShadow=true; im.layers.set(1); scene.add(im); houseChunks.push(im); } }
  const lab=new THREE.Sprite(new THREE.SpriteMaterial({map:texLabel('POLICE STATION','#1d3a8a','#ffffff'),fog:false})); lab.scale.set(5.5,1.05,1); lab.position.set(STATION.x,SLAB+MODELS.station.H+2.2,STATION.z+MODELS.station.D/2); lab.layers.set(1); scene.add(lab); }
let chunkTick=0;
function updateChunks(dt){ chunkTick-=dt; if(chunkTick>0) return; chunkTick=.4; for(const im of houseChunks){ const d=im.boundingSphere.center.distanceTo(camera.position)-im.boundingSphere.radius; im.visible=d<Q.draw; im.castShadow=d<140; } }
fillRect({x0:1092,x1:1500,z0:-640,z1:BR.z-14},'far',50,null);
fillRect({x0:1092,x1:1500,z0:BR.z+14,z1:360},'far',50,null);
fillRect({x0:-650,x1:1080,z0:455,z1:720},'far',60,null,false);

/* apartment entrance details */
const APT={door:{x:93,z:22.1},front:{x:93,z:24.4}};
{ const canopy=new THREE.Mesh(new THREE.BoxGeometry(6,.25,3),MAT.conc); canopy.position.set(93,SLAB+3.6,23.4); canopy.castShadow=true; scene.add(canopy);
  for(const sx of [-2.7,2.7]){ const p=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,3.5,10),MAT.conc); p.position.set(93+sx,SLAB+1.75,24.7); p.castShadow=true; scene.add(p); }
  const door=new THREE.Mesh(new THREE.BoxGeometry(2.4,2.8,.12),new THREE.MeshStandardMaterial({color:0x2a2018,roughness:.5,emissive:0xffb873,emissiveIntensity:.0})); door.position.set(93,SLAB+1.4,22.06); scene.add(door); APT.doorMesh=door;
  const ring=new THREE.Mesh(new THREE.RingGeometry(.9,1.15,48),new THREE.MeshBasicMaterial({color:0xF2B705,transparent:true,opacity:.8,depthWrite:false,fog:false})); ring.rotation.x=-Math.PI/2; ring.position.set(93,SLAB+.04,24.4); ring.layers.set(1); scene.add(ring); APT.ring=ring;
  const lab=new THREE.Sprite(new THREE.SpriteMaterial({map:texLabel('YOUR APARTMENT'),transparent:true,depthTest:true,fog:false})); lab.scale.set(4.2,.8,1); lab.position.set(93,SLAB+5.2,24); lab.layers.set(1); scene.add(lab); APT.label=lab; }

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
  const pierG=new THREE.BoxGeometry(2.6,1,11); pierG.translate(0,.5,0); inst(pierG,MAT.conc,piers);
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
for(const k of ['curb','pave','plaza','grass','road2','road4','cross','sign']){ const m=A[k].mesh(MAT[k],false,true); if(m) scene.add(m); }

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
{ const trunkG=new THREE.CylinderGeometry(.16,.27,1,7,6); trunkG.translate(0,.5,0); inst(trunkG,trunkM,palms);
  const fr=palms.map(p=>({x:p.x+p.sy*Math.sin(p.ry)*Math.sin(p.rx),y:p.y+p.sy*Math.cos(p.rx),z:p.z+p.sy*Math.cos(p.ry)*Math.sin(p.rx),ry:R()*6.28}));
  inst(frondGeo(),new THREE.MeshStandardMaterial({color:0x3f7d32,roughness:.8,side:THREE.DoubleSide}),fr); }
{ const trees=[], tcols=[];
  for(const [a,b] of EDGES){ if(a>b) continue; const A0=nodes[a],B0=nodes[b]; if(A0.bridge||B0.bridge||Math.min(A0.x,B0.x)<0) continue;
    const dx=B0.x-A0.x,dz=B0.z-A0.z,L=Math.hypot(dx,dz),fx=dx/L,fz=dz/L,rx=-fz,rz=fx,hw=edgeHalf(A0,B0);
    for(let s=crossHalf(A0,fx)+10;s<L-crossHalf(B0,fx)-8;s+=rr(15,22)) for(const sd of [-1,1]){ if(R()<.2) continue; const x=A0.x+fx*s+rx*sd*(hw+4.2), z=A0.z+fz*s+rz*sd*(hw+4.2);
      if(Math.abs(x-93)<8&&Math.abs(z-30)<8) continue;
      trees.push({x,y:SLAB,z,ry:R()*6,sx:rr(.8,1.15),sy:rr(.85,1.2),sz:rr(.8,1.15)}); tcols.push(new THREE.Color().setHSL(rr(.24,.33),rr(.35,.55),rr(.2,.3))); } }
  const tt=new THREE.CylinderGeometry(.16,.24,4.4,7); tt.translate(0,2.2,0); inst(tt,trunkM,trees);
  const blob=(r,x,y,z)=>{ const g=new THREE.IcosahedronGeometry(r,1); g.translate(x,y,z); return g; };
  inst(mergeList([blob(2.3,0,5.4,0),blob(1.7,1.4,4.8,.6),blob(1.8,-1.2,5,-.8),blob(1.5,.2,6.6,.3)]),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,flatShading:true}),trees,{colors:tcols}); }
const poles=[], heads=[], pools=[];
function lampsAlong(x0,z0,x1,z1,hw,stepL,yFn){ const dx=x1-x0,dz=z1-z0,L=Math.hypot(dx,dz),fx=dx/L,fz=dz/L,rx=-fz,rz=fx;
  for(let s=10;s<L-6;s+=stepL) for(const sd of [-1,1]){ const bx=x0+fx*s+rx*sd*(hw+.9), bz=z0+fz*s+rz*sd*(hw+.9), ax=-rx*sd, az=-rz*sd, ry=Math.atan2(-az,ax), y=yFn(bx,bz);
    poles.push({x:bx,y,z:bz,ry}); const hx=bx+ax*1.75, hz=bz+az*1.75; heads.push({x:hx,y:y+7.84,z:hz,ry}); pools.push({x:hx,y:yFn(hx,hz)+.08,z:hz,sx:15,sz:15}); } }
for(const [a,b] of EDGES){ if(a>b) continue; const A0=nodes[a],B0=nodes[b]; if(A0.bridge||B0.bridge) continue; const dx=B0.x-A0.x,dz=B0.z-A0.z,L=Math.hypot(dx,dz),fx=dx/L,fz=dz/L,sa=crossHalf(A0,fx),sb=crossHalf(B0,fx);
  lampsAlong(A0.x+fx*sa,A0.z+fz*sa,B0.x-fx*sb,B0.z-fz*sb,edgeHalf(A0,B0),34,()=>SLAB); }
lampsAlong(352,BR.z,1040,BR.z,6.85,36,(x)=>bridgeY(x,BR.z)??0);
const poleG=mergeList([(()=>{ const g=new THREE.CylinderGeometry(.08,.13,8,8); g.translate(0,4,0); return g; })(),box(1.85,.1,.1,.92,7.92,0)]);
inst(poleG,new THREE.MeshStandardMaterial({color:0x50555b,metalness:.7,roughness:.45}),poles);
const lampHeadMat=new THREE.MeshStandardMaterial({color:0xfff4dc,emissive:0xffbe6a,emissiveIntensity:0});
inst(box(.62,.1,.3,0,0,0),lampHeadMat,heads,{shadow:false});
const poolG=new THREE.PlaneGeometry(1,1); poolG.rotateX(-Math.PI/2);
const poolMesh=inst(poolG,new THREE.MeshBasicMaterial({map:T.glow,color:0xffa04a,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false}),pools,{shadow:false,layer:1});
poolMesh.receiveShadow=false; poolMesh.visible=false;
{ const wp=[]; const wire=(a,b,sag)=>{ let px=a.x,py=a.y,pz=a.z; for(let i=1;i<=8;i++){ const t=i/8, x=a.x+(b.x-a.x)*t, z=a.z+(b.z-a.z)*t, y=a.y+(b.y-a.y)*t-sag*4*t*(1-t); wp.push(px,py,pz,x,y,z); px=x; py=y; pz=z; } };
  const bySide=new Map(); for(const p of poles){ if(p.y>SLAB+.01) continue; const k=Math.round(p.ry*100); if(!bySide.has(k)) bySide.set(k,[]); bySide.get(k).push(p); }
  for(const list of bySide.values()){ for(const p of list){ let best=null,bd=40; for(const q of list){ if(q===p) continue; const d=Math.hypot(q.x-p.x,q.z-p.z); if(d<bd&&(q.x>p.x+.1||(Math.abs(q.x-p.x)<.1&&q.z>p.z))){ bd=d; best=q; } }
    if(best){ wire({x:p.x,y:p.y+7.3,z:p.z},{x:best.x,y:best.y+7.3,z:best.z},rr(.6,1.1)); wire({x:p.x,y:p.y+6.9,z:p.z},{x:best.x,y:best.y+6.9,z:best.z},rr(.7,1.3)); } } }
  const wg=new THREE.BufferGeometry(); wg.setAttribute('position',new THREE.Float32BufferAttribute(wp,3)); scene.add(new THREE.LineSegments(wg,new THREE.LineBasicMaterial({color:0x14110f}))); }
/* traffic lights */
const CYCLE=30;
for(const n of nodes) if(!n.bridge) n.tlo=MR()*CYCLE;
function lightAt(n,fx){ const t=(T0+n.tlo)%CYCLE; if(Math.abs(fx)>.5) return t<12?'g':t<15?'y':'r'; return t<15?'r':t<27?'g':'y'; }
const tlPoles=[], tlHeads=[], tlLamps=[], tlRefs=[];
nodes.forEach(n=>{ if(n.bridge) return; for(const mi of n.adj){ const m=nodes[mi]; if(m.bridge) continue; const dx=n.x-m.x, dz=n.z-m.z, L=Math.hypot(dx,dz), fx=dx/L, fz=dz/L, rx=-fz, rz=fx;
  const px=n.x-fx*(crossHalf(n,fx)+1.4)+rx*(edgeHalf(m,n)+1.1), pz=n.z-fz*(crossHalf(n,fx)+1.4)+rz*(edgeHalf(m,n)+1.1);
  tlPoles.push({x:px,y:SLAB,z:pz}); tlHeads.push({x:px,y:SLAB+4.25,z:pz,ry:Math.atan2(-fx,-fz)});
  for(let k=0;k<3;k++) tlLamps.push({x:px-fx*.18,y:SLAB+4.58-k*.33,z:pz-fz*.18}); tlRefs.push({n,fx}); } });
{ const tp=new THREE.CylinderGeometry(.07,.09,4.4,8); tp.translate(0,2.2,0); inst(tp,new THREE.MeshStandardMaterial({color:0x2b2e33,metalness:.6,roughness:.45}),tlPoles);
  inst(box(.42,1.15,.32,0,0,0),new THREE.MeshStandardMaterial({color:0x17191c,roughness:.6}),tlHeads); }
const tlLampMesh=inst(new THREE.SphereGeometry(.12,10,8),new THREE.MeshBasicMaterial({color:0xffffff}),tlLamps,{shadow:false,colors:tlLamps.map(()=>new THREE.Color(.1,.1,.1))});
const _tc=new THREE.Color(); let tlTick=0;
function updateLights(dt){ tlTick-=dt; if(tlTick>0) return; tlTick=.2; const hot=curTime==='day'?1.5:3.2;
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
{ const lathe=pts=>new THREE.LatheGeometry(pts.map(p=>new THREE.Vector2(p[0],p[1])),18);
  HG.torsoM=lathe([[.001,0],[.15,0],[.165,.08],[.155,.22],[.175,.36],[.2,.46],[.175,.53],[.07,.585],[.001,.59]]); HG.torsoM.scale(1,1,.62);
  HG.torsoF=lathe([[.001,0],[.165,0],[.17,.08],[.13,.24],[.16,.36],[.17,.45],[.15,.52],[.06,.565],[.001,.57]]); HG.torsoF.scale(1,1,.66);
  HG.neck=new THREE.CylinderGeometry(.045,.05,.12,10);
  HG.head=new THREE.SphereGeometry(.105,20,16); HG.head.scale(.92,1.1,1);
  HG.hair=new THREE.SphereGeometry(.113,20,12,0,Math.PI*2,0,Math.PI*.52); HG.hair.scale(.95,1,1.04);
  HG.gele=new THREE.SphereGeometry(.17,18,12,0,Math.PI*2,0,Math.PI*.6); HG.gele.scale(1.15,.8,1.05);
  HG.eye=new THREE.SphereGeometry(.013,8,6); HG.nose=new THREE.SphereGeometry(.018,8,6);
  HG.uarm=new THREE.CapsuleGeometry(.047,.2,4,10); HG.sleeve=new THREE.CapsuleGeometry(.06,.1,4,10);
  HG.farm=new THREE.CapsuleGeometry(.04,.19,4,10); HG.hand=new THREE.SphereGeometry(.045,10,8);
  HG.thigh=new THREE.CapsuleGeometry(.072,.3,4,10); HG.shin=new THREE.CapsuleGeometry(.056,.32,4,10);
  HG.foot=new THREE.BoxGeometry(.1,.07,.25); HG.skirt=new THREE.CylinderGeometry(.17,.27,.62,18,1,true); }
const mc=new Map(); const sMat=(k,o)=>{ if(!mc.has(k)) mc.set(k,new THREE.MeshStandardMaterial(o)); return mc.get(k); };
const skinMat=c=>sMat('s'+c,{color:c,roughness:.5}), clothMat=c=>sMat('c'+c,{color:c,roughness:.88}), ankMat=i=>sMat('a'+i,{map:ANK[i],roughness:.82});
const eyeMat=sMat('eye',{color:0x0c0a09,roughness:.2});
const SKINS=['#5a3825','#6b4429','#7b5032','#4a2c1a','#8a5b3a','#3f2616'], TOPS=['#f4f1ea','#1b1b1f','#22396b','#a3262a','#e0b100','#2f6b45','#7a7f87','#d9673b','#f2f2f2'], BOTS=['#23324f','#1a1a1c','#6e6253','#2c3d2f','#e9e4d8','#3b2f28'], SHOES=['#141414','#f2f2f2','#5a3b22'];
function makeHuman(o){
  const root=new THREE.Group(); root.rotation.order='YXZ';
  const hips=new THREE.Group(); hips.position.y=.93; root.add(hips);
  const torso=new THREE.Group(); hips.add(torso);
  const add=(geo,mat,parent,x,y,z)=>{ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; m.layers.set(1); parent.add(m); return m; };
  add(o.f?HG.torsoF:HG.torsoM,o.top,torso,0,-.04,0); add(HG.neck,o.skin,torso,0,.58,0);
  const head=new THREE.Group(); head.position.y=.7; torso.add(head); add(HG.head,o.skin,head,0,0,0);
  if(o.gele) add(HG.gele,o.gele,head,0,.06,-.01); else add(HG.hair,o.hairM,head,0,.012,-.006);
  add(HG.eye,eyeMat,head,.034,.018,.094); add(HG.eye,eyeMat,head,-.034,.018,.094); add(HG.nose,o.skin,head,0,-.01,.104);
  const arm=s=>{ const sh=new THREE.Group(); sh.position.set(.2*s,.47,0); torso.add(sh); add(HG.sleeve,o.top,sh,0,-.07,0); add(HG.uarm,o.skin,sh,0,-.15,0);
    const el=new THREE.Group(); el.position.y=-.29; sh.add(el); add(HG.farm,o.skin,el,0,-.13,0); add(HG.hand,o.skin,el,0,-.27,0); return [sh,el]; };
  const [la,lel]=arm(1), [ra,rel]=arm(-1);
  const leg=s=>{ const hp=new THREE.Group(); hp.position.set(.092*s,.02,0); hips.add(hp); add(HG.thigh,o.f?o.skin:o.bottom,hp,0,-.21,0);
    const kn=new THREE.Group(); kn.position.y=-.43; hp.add(kn); add(HG.shin,o.f?o.skin:o.bottom,kn,0,-.2,0); add(HG.foot,o.shoe,kn,0,-.43,.045); return [hp,kn]; };
  const [ll,lk]=leg(1), [rl,rk]=leg(-1);
  if(o.f) add(HG.skirt,o.bottom,hips,0,-.27,0);
  return {root,hips,torso,head,la,ra,lel,rel,ll,rl,lk,rk};
}
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
const VT={danfo:{maxV:[10,14],name:'danfo'},keke:{maxV:[7,10],name:'keke'},okada:{maxV:[9,14],name:'okada'},bus:{maxV:[8,11],name:'BRT bus'},police:{maxV:[12,16],name:'police van'}};
const polRed=new THREE.MeshBasicMaterial({color:new THREE.Color(3,.15,.1)}), polBlue=new THREE.MeshBasicMaterial({color:new THREE.Color(.15,.35,3)});
function seatedRider(){ const h=randomHuman(); const r=h.root; r.rotation.y=Math.PI/2; r.position.set(-.18,-.08,0);
  h.ll.rotation.x=h.rl.rotation.x=-1.35; h.lk.rotation.x=h.rk.rotation.x=1.45; h.la.rotation.set(-1.05,0,.25); h.ra.rotation.set(-1.05,0,-.25); h.lel.rotation.x=h.rel.rotation.x=-.45; h.torso.rotation.x=.22;
  r.traverse(o=>{ if(o.isMesh) o.castShadow=true; }); return r; }
function makeCar(type,color){
  if(MODELS&&MODELS[type]){ const M=MODELS[type], g=new THREE.Group(); g.rotation.order='YZX'; const m=new THREE.Mesh(M.geo,M.mat); m.castShadow=true; m.receiveShadow=true; m.layers.set(1); g.add(m);
    let rider=null; if(type==='okada'){ rider=seatedRider(); g.add(rider); }
    if(type==='police'){ for(const [mat,zz] of [[polRed,.3],[polBlue,-.3]]){ const b=new THREE.Mesh(new THREE.SphereGeometry(.1,10,8),mat); b.position.set(M.W*.04,M.H+.02,zz); b.layers.set(1); g.add(b); } }
    return {g,wheels:[],rider,def:{L:M.W,W:M.D,H:M.H,r:.35,maxV:VT[type].maxV},type}; }
  const D=CAR_T[type], G=carGeos(type), g=new THREE.Group(); g.rotation.order='YZX';
  const pm=paintMat(color,type==='danfo'?.15:.55);
  for(const [geo,mat] of [[G.paint,pm],[G.glass,CM.glass],[G.trim,CM.trim],[G.head,CM.head],[G.tail,CM.tail]]){ const m=new THREE.Mesh(geo,mat); m.castShadow=true; m.receiveShadow=true; m.layers.set(1); g.add(m); }
  const wheels=[]; for(const sx of [1,-1]) for(const sz of [1,-1]){ const piv=new THREE.Group(); piv.position.set(sx*D.base,D.r,sz*(D.W/2+.02)); const spin=new THREE.Group(); if(sz<0) spin.scale.z=-1; piv.add(spin);
    for(const [geo,mat] of [[G.tire,CM.tire],[G.rim,CM.chrome]]){ const m=new THREE.Mesh(geo,mat); m.castShadow=true; m.layers.set(1); spin.add(m); } g.add(piv); wheels.push({piv,spin,front:sx>0}); }
  return {g,wheels,def:D,type}; }
const CAR_COLORS=['#111214','#f1f1ee','#8d939a','#1d3557','#7a0f12','#2b4b3a','#c4c8cc','#3a2a1e','#0f4c81','#b0b6bb'];
const vehicles=[];
function newVehicle(type,color){ if(!MODELS) type=({keke:'sedan',okada:'sedan',bus:'suv',police:'suv'})[type]||type; const c=makeCar(type,color); scene.add(c.g); const v={c,type,x:0,z:0,y:0,h:0,speed:0,ai:null,parked:true}; vehicles.push(v); return v; }
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
  const D=v.c.def; v.ai={a,b,s,seg,na:-1,maxV:mrr(D.maxV[0],D.maxV[1]),wait:0,ghost:0,stuck:0}; v.parked=false; v.x=_sp.x; v.z=_sp.z; v.h=Math.atan2(-_sp.dz,_sp.dx); v.speed=v.ai.maxV*.6; v.y=groundY(v.x,v.z); return true; } return false; }
const myCar=newVehicle('okada','#b3261e'); Object.assign(myCar,{x:98,z:35.4,h:Math.PI,y:0});
for(const [type,x,z,h] of [['danfo',64.9,-22,Math.PI/2],['keke',122,35.2,Math.PI],['danfo',-150+4.9,80,Math.PI/2],['danfo',-300+4.9,-20,Math.PI/2],['police',STATION.x-11,34.9,Math.PI],['police',STATION.x+9,34.9,Math.PI],['bus',-80,128.5,Math.PI]]){ const v=newVehicle(type,'#f2b705'); Object.assign(v,{x,z,h,y:0}); }
for(let i=0;i<Q.cars;i++){ const r=MR(), type=r<.32?'danfo':r<.56?'keke':r<.8?'okada':r<.9?'police':'bus'; const v=newVehicle(type,type==='danfo'?'#f2b705':mpick(CAR_COLORS)); if(!placeCar(v,12,260)) placeCar(v,0,3000); }
const drive={v:null,speed:0,steer:0};
const headSpot=new THREE.SpotLight(0xfff0d0,0,70,.5,.55,1.1); const headTgt=new THREE.Object3D(); headSpot.target=headTgt; scene.add(headSpot,headTgt);

/* ================= interior ================= */
await step('Furnishing your Ikoyi apartment…', 88);
function buildInterior(){
  const S=new THREE.Scene(); S.background=new THREE.Color(0x14100d); S.fog=new THREE.FogExp2(0x14100d,.0001);
  const envRT=pmrem.fromScene(new RoomEnvironment(),.04); S.environment=envRT.texture; S.environmentIntensity=.35;
  S.add(new THREE.HemisphereLight(0xfff0dc,0x2a1d14,.55));
  const pl=new THREE.PointLight(0xffd2a0,26,16,1.6); pl.position.set(0,2.72,.4); pl.castShadow=true; pl.shadow.mapSize.set(1024,1024); pl.shadow.bias=-.004; pl.shadow.camera.layers.enable(1); S.add(pl);
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
  tg.textAlign='center'; tg.fillStyle='#F2B705'; tg.font='64px Bungee'; tg.fillText('NAIJA STREETS',320,150); tg.fillStyle='#fff'; tg.font='700 30px "Barlow Semi Condensed"'; tg.fillText('LIVE · Third Mainland traffic is moving small small',320,210);
  tg.fillStyle='rgba(0,0,0,.45)'; tg.fillRect(0,296,640,64); tg.fillStyle='#fff'; tg.font='600 26px "Barlow Semi Condensed"'; tg.textAlign='left'; tg.fillText('BREAKING: Jollof Friday confirmed on Broad Street',20,338);
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
  return {scene:S,cols,fan:blades,exit:{x:0,z:4.3}};
}
const INT=buildInterior();

/* ================= your character (Mixamo) ================= */
await step('Loading your character…', 91);
let WALK_V=2.6, RUN_V=6.2, hero=null;
try{
  const fl=new FBXLoader();
  const load=async u=>{ const r=await fetch(u); if(!r.ok) throw new Error(u+' '+r.status); return fl.parse(await r.arrayBuffer(),''); };
  const [cObj,iO,wO,rO,eO]=await Promise.all(['character','idle','walk','run','enter_car'].map(n=>load(`assets/characters/${n}.fbx`)));
  const bb=new THREE.Box3().setFromObject(cObj), hgt=bb.max.y-bb.min.y; if(hgt>10) cObj.scale.setScalar(1.85/hgt);
  cObj.traverse(o=>{ if(o.isMesh){ const om=Array.isArray(o.material)?o.material[0]:o.material, map=om&&om.map; if(map){ map.colorSpace=THREE.SRGBColorSpace; map.anisotropy=maxAniso; }
    o.material=new THREE.MeshStandardMaterial({map:map||null,color:map?0xffffff:0x8a6a50,roughness:.72,metalness:0}); o.castShadow=true; o.receiveShadow=true; o.frustumCulled=false; o.layers.set(1); } });
  const root=new THREE.Group(); root.rotation.order='YXZ'; root.add(cObj);
  const inPlace=c=>{ for(const t of c.tracks) if(/Hips\.position$/.test(t.name)){ const v=t.values, x0=v[0], z0=v[2]; for(let i=0;i<v.length;i+=3){ v[i]=x0; v[i+2]=z0; } } return c; };
  const mixer=new THREE.AnimationMixer(cObj);
  const act={idle:mixer.clipAction(inPlace(iO.animations[0])),walk:mixer.clipAction(inPlace(wO.animations[0])),run:mixer.clipAction(inPlace(rO.animations[0])),car:mixer.clipAction(eO.animations[0])};
  act.car.setLoop(THREE.LoopOnce,1); act.car.clampWhenFinished=true;
  for(const k of ['idle','walk','run']){ act[k].play(); act[k].setEffectiveWeight(k==='idle'?1:0); }
  hero={root,mixer,act,w:{idle:1,walk:0,run:0},carT:0};
  scene.remove(rig.root); rig={root}; scene.add(root); WALK_V=1.7; RUN_V=4.9;
}catch(e){ console.warn('Character files could not load, using the built-in model.',e); }
function heroAnim(dt,speed){ const a=hero.act; let ti=0,tw=0,tr=0;
  if(speed<.08) ti=1; else if(speed<=WALK_V){ const k=speed/WALK_V; ti=1-k; tw=k; } else { const k=clamp((speed-WALK_V)/(RUN_V-WALK_V),0,1); tw=1-k; tr=k; }
  const s=1-Math.exp(-10*dt), w=hero.w; w.idle+=(ti-w.idle)*s; w.walk+=(tw-w.walk)*s; w.run+=(tr-w.run)*s;
  a.idle.setEffectiveWeight(w.idle); a.walk.setEffectiveWeight(w.walk); a.run.setEffectiveWeight(w.run);
  a.walk.timeScale=clamp(Math.max(speed,1)/1.1,.9,1.8); a.run.timeScale=clamp(Math.max(speed,3)/2.4,1.3,2.2);
  hero.mixer.update(dt); }
function updateEnter(dt){ hero.carT+=dt; hero.mixer.update(dt); const [f]=inputVec(); const dur=hero.act.car.getClip().duration/hero.act.car.timeScale;
  if(hero.carT>dur*.86||(hero.carT>.7&&(Math.abs(f)>.5||K[' ']))) finishEnter(); }
function finishEnter(){ const a=hero.act; a.car.stop(); a.idle.setEffectiveWeight(1); hero.w.idle=1; hero.w.walk=hero.w.run=0; mode='drive'; rig.root.visible=false; }

/* ================= post-processing ================= */
const rtMain=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType,samples:Q.msaa});
const composer=new EffectComposer(renderer,rtMain);
const renderPass=new RenderPass(scene,camera); composer.addPass(renderPass);
const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth/2,innerHeight/2),.3,.55,.86); composer.addPass(bloom); bloom.enabled=Q.bloom;
composer.addPass(new OutputPass());
composer.setSize(innerWidth,innerHeight);
addEventListener('resize',()=>{ renderer.setSize(innerWidth,innerHeight); composer.setSize(innerWidth,innerHeight); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); });

/* ================= time of day ================= */
const TIMES={
  day:{elev:56,azim:140,turb:4,ray:1.1,mie:.004,mieG:.8,exp:.52,sun:0xfff1dc,sunI:3.4,hs:0xbfd6ff,hg:0x8c7a60,hi:.85,fog:0xc4ccd0,fd:.0015,win:0,lamp:0,sign:0,bloom:[.22,.45,.92],env:1,water:0x0d4a5c,stars:false,head:.15,tail:.3,spot:0},
  golden:{elev:6.5,azim:252,turb:9,ray:2.4,mie:.009,mieG:.86,exp:.6,sun:0xffaf68,sunI:2.8,hs:0xffc7a2,hg:0x5a4636,hi:.55,fog:0xd9a079,fd:.0018,win:.45,lamp:.8,sign:.25,bloom:[.32,.55,.86],env:1,water:0x173947,stars:false,head:1,tail:1,spot:40},
  night:{elev:-5,azim:252,turb:2,ray:.4,mie:.002,mieG:.8,exp:.82,sun:0x8ea6ff,sunI:.32,hs:0x33456e,hg:0x15110f,hi:.5,fog:0x0b1322,fd:.0021,win:1.7,lamp:5,sign:1.1,bloom:[.95,.5,.55],env:.5,water:0x081a24,stars:true,head:3,tail:2.2,spot:180}};
const envScene=new THREE.Scene(); let envRT=null, curTime='golden';
function setTime(key){ curTime=key; const t=TIMES[key], u=sky.material.uniforms;
  u.turbidity.value=t.turb; u.rayleigh.value=t.ray; u.mieCoefficient.value=t.mie; u.mieDirectionalG.value=t.mieG;
  sunDir.setFromSphericalCoords(1,THREE.MathUtils.degToRad(90-t.elev),THREE.MathUtils.degToRad(t.azim)); u.sunPosition.value.copy(sunDir);
  if(key==='night') lightDir.setFromSphericalCoords(1,THREE.MathUtils.degToRad(48),THREE.MathUtils.degToRad(200)); else lightDir.copy(sunDir);
  sun.color.set(t.sun); sun.intensity=t.sunI; hemi.color.set(t.hs); hemi.groundColor.set(t.hg); hemi.intensity=t.hi;
  scene.fog.color.set(t.fog); scene.fog.density=t.fd*Q.fog; renderer.toneMappingExposure=t.exp;
  const wu=water.material.uniforms; wu.sunDirection.value.copy(lightDir).normalize(); wu.waterColor.value.set(t.water); wu.sunColor.value.set(key==='night'?0x7080b0:0xffffff);
  for(const k of FAC_KEYS) MAT[k].emissiveIntensity=t.win; MAT.sign.emissiveIntensity=t.sign; for(const m of billboardMats) m.emissiveIntensity=t.sign*.9;
  lampHeadMat.emissiveIntensity=t.lamp; poolMesh.visible=t.lamp>1; aviMat.emissiveIntensity=t.lamp>0?3:.6;
  bridgeParts.deckLightMat.emissiveIntensity=t.lamp*.8; bridgeParts.cableMat.emissiveIntensity=key==='night'?1.3:0;
  CM.head.emissiveIntensity=t.head; CM.tail.emissiveIntensity=t.tail; APT.doorMesh.material.emissiveIntensity=key==='day'?0:(key==='night'?1.2:.4);
  stars.visible=t.stars; bloom.strength=t.bloom[0]; bloom.radius=t.bloom[1]; bloom.threshold=t.bloom[2];
  envScene.add(sky); if(envRT) envRT.dispose(); envRT=pmrem.fromScene(envScene); scene.add(sky); scene.environment=envRT.texture; scene.environmentIntensity=t.env;
  document.querySelectorAll('.tod button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.t===key?'true':'false')); }
function cycleTime(){ const o=['day','golden','night']; setTime(o[(o.indexOf(curTime)+1)%3]); toast(curTime==='day'?'Daytime in Lagos':curTime==='golden'?'Golden hour':'Lagos at night'); }

/* ================= audio ================= */
let AC=null, eng=null;
function initAudio(){ try{ AC=new (window.AudioContext||window.webkitAudioContext)(); const o=AC.createOscillator(); o.type='sawtooth'; const o2=AC.createOscillator(); o2.type='triangle'; const f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=420; const g=AC.createGain(); g.gain.value=0;
  o.connect(f); o2.connect(f); f.connect(g); g.connect(AC.destination); o.start(); o2.start(); eng={o,o2,g,f}; }catch(e){ AC=null; eng=null; } }
function updateAudio(){ if(!eng) return; const on=mode==='drive', sp=on?Math.abs(drive.speed):0, t=AC.currentTime; eng.g.gain.setTargetAtTime(on?.045:0,t,.15); const fr=36+sp*3.1;
  eng.o.frequency.setTargetAtTime(fr,t,.08); eng.o2.frequency.setTargetAtTime(fr*.5,t,.08); eng.f.frequency.setTargetAtTime(300+sp*25,t,.1); }
function horn(){ if(!AC) return; const t=AC.currentTime, g=AC.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.07,t+.02); g.gain.setValueAtTime(.07,t+.38); g.gain.linearRampToValueAtTime(0,t+.45); g.connect(AC.destination);
  for(const fq of [392,494]){ const o=AC.createOscillator(); o.type='square'; o.frequency.value=fq; o.connect(g); o.start(t); o.stop(t+.5); } }
function thud(){ if(!AC) return; const t=AC.currentTime, n=AC.createBufferSource(), b=AC.createBuffer(1,Math.floor(AC.sampleRate*.25),AC.sampleRate), d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,3);
  n.buffer=b; const f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=380; const g=AC.createGain(); g.gain.value=.5; n.connect(f); f.connect(g); g.connect(AC.destination); n.start(t); }

/* ================= HUD ================= */
let toastT=0; function toast(msg,dur=2.4){ const t=$('#toast'); t.textContent=msg; t.hidden=false; toastT=dur; }
function locationName(){ if(mode==='interior') return 'Your Apartment · Ikoyi'; const x=mode==='drive'?drive.v.x:player.x, z=mode==='drive'?drive.v.z:player.z;
  if(x>BR.x0-2&&x<BR.x1&&Math.abs(z-BR.z)<12) return 'Lekki-Ikoyi Link Bridge'; if(x>1040) return 'Lekki Phase 1';
  if(z>130) return x<0?'Marina Waterfront · Lagos Island':'Marina Waterfront · Ikoyi';
  if(x>SQ.sx0&&x<SQ.sx1&&z>SQ.sz0&&z<SQ.sz1) return 'Freedom Square · Lagos Island';
  let best='',bd=1e9; for(const zz of ZS){ const d=Math.abs(z-zz); if(d<bd&&x>XS[0]-10&&x<XS[XS.length-1]+10){ bd=d; best=EW_NAME[zz]; } }
  for(const xx of XS){ const d=Math.abs(x-xx); if(d<bd&&z>ZS[0]-10&&z<ZS[ZS.length-1]+12){ bd=d; best=NS_NAME[xx]; } }
  const dist=x<0?'Lagos Island':'Ikoyi'; return best?`${best} · ${dist}`:dist; }
const mm=$('#mm'), mg=mm.getContext('2d');
const MMB={x0:-760,z0:-470,x1:1120,z1:920,ppm:1.2}; let mmCache=null;
function buildMinimapCache(){ const W=Math.ceil((MMB.x1-MMB.x0)*MMB.ppm), H=Math.ceil((MMB.z1-MMB.z0)*MMB.ppm); mmCache=document.createElement('canvas'); mmCache.width=W; mmCache.height=H;
  const g=mmCache.getContext('2d'); g.fillStyle='#163a4c'; g.fillRect(0,0,W,H); g.scale(MMB.ppm,MMB.ppm); g.translate(-MMB.x0,-MMB.z0);
  g.fillStyle='#2a2e35'; for(const L of LANDS) g.fillRect(L.x0,L.z0,L.x1-L.x0,L.z1-L.z0); g.fillRect(-700,430,1850,470);
  g.fillStyle='#24493a'; g.fillRect(SQ.sx0,SQ.sz0,SQ.sx1-SQ.sx0,SQ.sz1-SQ.sz0);
  g.fillStyle='#3e434c'; for(const b of colliders) g.fillRect(b.x0,b.z0,b.x1-b.x0,b.z1-b.z0);
  g.strokeStyle='#8d939e'; g.lineCap='butt';
  for(const z of ZS){ g.lineWidth=EWW(z); g.beginPath(); g.moveTo(XS[0]-6,z); g.lineTo(XS[XS.length-1]+7,z); g.stroke(); }
  for(const x of XS){ g.lineWidth=NSW(x); g.beginPath(); g.moveTo(x,ZS[0]-6); g.lineTo(x,ZS[ZS.length-1]+10); g.stroke(); }
  g.strokeStyle='#b3b9c3'; g.lineWidth=15; g.beginPath(); g.moveTo(330,BR.z); g.lineTo(1070,BR.z); g.stroke();
  const ap=APT.front; g.fillStyle='#F2B705'; g.fillRect(ap.x-15,ap.z-24,30,22); }
function drawMinimap(){ const S=mm.width, R0=S/2, sc=R0/150, px=mode==='drive'?drive.v.x:player.x, pz=mode==='drive'?drive.v.z:player.z;
  mg.save(); mg.clearRect(0,0,S,S); mg.beginPath(); mg.arc(R0,R0,R0,0,Math.PI*2); mg.clip(); mg.fillStyle='#163a4c'; mg.fillRect(0,0,S,S);
  const phi=Math.atan2(Math.cos(camState.yaw),Math.sin(camState.yaw)), th=-Math.PI/2-phi;
  mg.translate(R0,R0); mg.rotate(th); mg.scale(sc,sc); mg.translate(-px,-pz);
  if(!mmCache) buildMinimapCache(); mg.drawImage(mmCache,MMB.x0,MMB.z0,MMB.x1-MMB.x0,MMB.z1-MMB.z0);
  mg.fillStyle='#e7e1d3'; for(const v of vehicles){ if(v===drive.v) continue; mg.save(); mg.translate(v.x,v.z); mg.rotate(-v.h); mg.fillRect(-2.6,-1.1,5.2,2.2); mg.restore(); }
  mg.restore();
  const c=Math.cos(th), s=Math.sin(th);
  const mark=(wx,wz,col,label)=>{ let dx=(wx-px)*sc, dz=(wz-pz)*sc, sx=dx*c-dz*s, sy=dx*s+dz*c; const d=Math.hypot(sx,sy), lim=R0-18; if(d>lim){ sx*=lim/d; sy*=lim/d; }
    mg.fillStyle=col; mg.beginPath(); mg.arc(R0+sx,R0+sy,15,0,7); mg.fill(); mg.fillStyle='#0E1014'; mg.font='20px Bungee'; mg.textAlign='center'; mg.textBaseline='middle'; mg.fillText(label,R0+sx,R0+sy+1); };
  mark(APT.front.x,APT.front.z,'#F2B705','H');
  mg.fillStyle='#F7EFDF'; mg.font='22px Bungee'; mg.textAlign='center'; mg.textBaseline='middle'; mg.fillText('N',R0+s*(R0-24),R0-c*(R0-24));
  const hd=mode==='drive'?Math.atan2(-Math.sin(drive.v.h),Math.cos(drive.v.h)):Math.atan2(Math.cos(player.yaw),Math.sin(player.yaw));
  mg.save(); mg.translate(R0,R0); mg.rotate(hd+th); mg.fillStyle='#F7EFDF'; mg.strokeStyle='#0E1014'; mg.lineWidth=4; mg.beginPath(); mg.moveTo(20,0); mg.lineTo(-13,-13); mg.lineTo(-6,0); mg.lineTo(-13,13); mg.closePath(); mg.stroke(); mg.fill(); mg.restore(); }
function nearestVehicle(maxD=3.9){ let best=null,bd=maxD; for(const v of vehicles){ const d=Math.hypot(v.x-player.x,v.z-player.z); if(d<bd&&Math.abs(v.speed)<7){ bd=d; best=v; } } return best; }
const nearDoor=()=>Math.hypot(player.x-APT.front.x,player.z-APT.front.z)<2.4;
const nearExit=()=>Math.hypot(player.x-INT.exit.x,player.z-INT.exit.z)<1.5;
let locTick=0, mmTick=0, lastPrompt='';
function updateHUD(dt){ if(!started) return;
  locTick-=dt; if(locTick<=0){ locTick=.3; $('#loc').textContent=locationName(); }
  let txt=''; if(!busy){ if(mode==='walk'){ if(nearDoor()) txt='Enter your apartment'; else { const v=nearestVehicle(); if(v){ const nm=(VT[v.type]||{name:'car'}).name; txt=v.ai?`Take this ${nm}`:(v===myCar?'Ride your okada':`Drive the ${nm}`); } } }
    else if(mode==='drive'){ if(Math.abs(drive.speed)<3) txt='Get out'; } else if(mode==='interior'&&nearExit()) txt='Go back outside'; }
  if(txt!==lastPrompt){ lastPrompt=txt; $('#prompt').hidden=!txt; $('#promptTxt').textContent=txt; }
  const so=$('#speedo'); if(mode==='drive'){ so.hidden=false; $('#spd').textContent=Math.round(Math.abs(drive.speed)*3.6); } else if(!so.hidden) so.hidden=true;
  if(toastT>0){ toastT-=dt; if(toastT<=0) $('#toast').hidden=true; }
  mm.style.visibility=mode==='interior'?'hidden':'visible'; if(mode!=='interior'){ mmTick^=1; if(mmTick) drawMinimap(); } }

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
const K={}, joy={x:0,y:0}; let touchRun=false, touchBrake=false;
function inputVec(){ let f=0,s=0; if(K.w||K.arrowup) f+=1; if(K.s||K.arrowdown) f-=1; if(K.d||K.arrowright) s+=1; if(K.a||K.arrowleft) s-=1; f-=joy.y; s+=joy.x; return [clamp(f,-1,1),clamp(s,-1,1)]; }
addEventListener('keydown',e=>{ const k=e.key.toLowerCase(); if(k===' '||k.startsWith('arrow')) e.preventDefault(); if(!started) return;
  if(!K[k]){ if(k==='e'||k==='f') action(); else if(k==='t') cycleTime(); else if(k==='c') $('#help').hidden=!$('#help').hidden; else if(k==='h'&&mode==='drive') horn(); } K[k]=true; });
addEventListener('keyup',e=>{ K[e.key.toLowerCase()]=false; });
addEventListener('blur',()=>{ for(const k in K) K[k]=false; });
const cvs=renderer.domElement; let dragging=false;
function look(dx,dy){ camState.yaw-=dx*.0028; camState.pitch=clamp(camState.pitch+dy*.0022,-.15,1.15); camState.last=T0; }
function lockPointer(){ try{ const p=cvs.requestPointerLock(); if(p&&p.catch) p.catch(()=>{}); }catch(_){} }
cvs.addEventListener('pointerdown',e=>{ if(!started||e.pointerType!=='mouse') return; dragging=true; if(document.pointerLockElement!==cvs) lockPointer(); $('#lookhint').hidden=true; });
addEventListener('pointerup',()=>{ dragging=false; });
document.addEventListener('mousemove',e=>{ if(!started) return; if(document.pointerLockElement===cvs||(dragging&&e.buttons)) look(e.movementX,e.movementY); });
cvs.addEventListener('wheel',e=>{ e.preventDefault(); camState.zoom=clamp(camState.zoom+(e.deltaY>0?.08:-.08),.55,1.8); },{passive:false});
document.querySelectorAll('.tod button').forEach(b=>b.addEventListener('click',()=>setTime(b.dataset.t)));
$('#helpBtn').addEventListener('click',()=>{ $('#help').hidden=!$('#help').hidden; });
document.querySelectorAll('#qual button').forEach(b=>{ b.setAttribute('aria-pressed',b.dataset.q===qKey?'true':'false');
  b.addEventListener('click',()=>{ if(b.dataset.q===qKey) return; try{ localStorage.setItem('naija-quality',b.dataset.q); }catch(e){} toast('Restarting with '+b.dataset.q+' graphics…'); setTimeout(()=>location.reload(),600); }); });
if(isTouch){ $('#touch').hidden=false; $('#promptKey').textContent='E';
  const zl=$('#zoneL'), zr=$('#zoneR'), jo=$('#joy'), jk=$('#joyK'); let jid=null,jx=0,jy=0,lid=null,lx=0,ly=0;
  zl.addEventListener('pointerdown',e=>{ jid=e.pointerId; jx=e.clientX; jy=e.clientY; jo.hidden=false; jo.style.left=jx+'px'; jo.style.top=jy+'px'; zl.setPointerCapture(jid); });
  zl.addEventListener('pointermove',e=>{ if(e.pointerId!==jid) return; let dx=e.clientX-jx, dy=e.clientY-jy; const d=Math.hypot(dx,dy), m=50; if(d>m){ dx*=m/d; dy*=m/d; } joy.x=dx/m; joy.y=dy/m; jk.style.transform=`translate(${dx}px,${dy}px)`; });
  const jend=e=>{ if(e.pointerId!==jid) return; jid=null; joy.x=joy.y=0; jo.hidden=true; jk.style.transform=''; }; zl.addEventListener('pointerup',jend); zl.addEventListener('pointercancel',jend);
  zr.addEventListener('pointerdown',e=>{ lid=e.pointerId; lx=e.clientX; ly=e.clientY; zr.setPointerCapture(lid); });
  zr.addEventListener('pointermove',e=>{ if(e.pointerId!==lid) return; look((e.clientX-lx)*1.6,(e.clientY-ly)*1.6); lx=e.clientX; ly=e.clientY; });
  const lend=e=>{ if(e.pointerId===lid) lid=null; }; zr.addEventListener('pointerup',lend); zr.addEventListener('pointercancel',lend);
  $('#tE').addEventListener('pointerdown',e=>{ e.preventDefault(); action(); });
  $('#tRun').addEventListener('pointerdown',e=>{ e.preventDefault(); touchRun=!touchRun; $('#tRun').classList.toggle('on',touchRun); });
  const tb=$('#tBrake'); tb.addEventListener('pointerdown',e=>{ e.preventDefault(); touchBrake=true; }); for(const ev of ['pointerup','pointercancel','pointerleave']) tb.addEventListener(ev,()=>{ touchBrake=false; });
  $('#tHorn').addEventListener('pointerdown',e=>{ e.preventDefault(); horn(); }); }

/* ================= actions ================= */
async function fadeSwap(fn){ busy=true; $('#fade').classList.add('on'); await new Promise(r=>setTimeout(r,380)); fn(); await frameWait(); $('#fade').classList.remove('on'); busy=false; }
function action(){ if(busy) return;
  if(mode==='walk'){ if(nearDoor()) return enterApt(); const v=nearestVehicle(); if(v) return enterCar(v); }
  else if(mode==='drive'){ if(Math.abs(drive.speed)<3) exitCar(); else toast('Slow down first'); }
  else if(mode==='interior'){ if(nearExit()) exitApt(); } }
function enterCar(v){
  if(v.ai){ v.ai=null; v.speed=0; let p=peds[0],pd=-1; for(const q of peds){ const d=Math.hypot(q.x-player.x,q.z-player.z); if(d>pd){ pd=d; p=q; } }
    const hx=Math.cos(v.h), hz=-Math.sin(v.h), lx=hz, lz=-hx; Object.assign(p,{x:v.x+lx*1.6,z:v.z+lz*1.6,state:'flee',timer:4.5,fall:0,phone:false,yaw:Math.atan2(lx,lz)+mrr(-.5,.5)});
    toast(v.type==='danfo'?'Danfo don change hand! The driver ran off.':v.type==='okada'?'"My okada!" The rider ran off.':v.type==='police'?'You took a police van. Wahala dey!':mpick(['"Oga, no wahala!" The driver bolted.','"Take am, take am!" The driver ran off.'])); }
  v.parked=false; drive.v=v; drive.speed=0; drive.steer=0; camState.last=-10;
  if(hero){ const hx=Math.cos(v.h), hz=-Math.sin(v.h), lx=hz, lz=-hx, ow=v.c.def.W/2+1.0, sx=v.x+lx*ow+hx*.35, sz=v.z+lz*ow+hz*.35;
    Object.assign(player,{x:sx,z:sz,yaw:Math.atan2(-lx,-lz),speed:0}); player.y=groundY(sx,sz); rig.root.position.set(player.x,player.y,player.z); rig.root.rotation.y=player.yaw;
    const a=hero.act; for(const k of ['idle','walk','run']){ a[k].setEffectiveWeight(0); hero.w[k]=0; } a.car.reset(); a.car.timeScale=1.7; a.car.setEffectiveWeight(1); a.car.play(); hero.carT=0; mode='enter'; return; }
  mode='drive'; rig.root.visible=false; }
function exitCar(){ const v=drive.v, hx=Math.cos(v.h), hz=-Math.sin(v.h); let placed=false;
  for(const [lx,lz] of [[hz,-hx],[-hz,hx]]){ const c={x:v.x+lx*1.8,z:v.z+lz*1.8}; if(onLand(c.x,c.z)&&!resolveCircle({...c},.34)){ player.x=c.x; player.z=c.z; placed=true; break; } }
  if(!placed){ player.x=v.x+hx*3.3; player.z=v.z+hz*3.3; }
  player.y=groundY(player.x,player.z); player.yaw=Math.atan2(hx,hz); player.speed=0; v.speed=0; v.parked=true; drive.v=null; drive.speed=0; mode='walk'; rig.root.visible=true; headSpot.intensity=0; }
function enterApt(){ fadeSwap(()=>{ mode='interior'; INT.scene.add(rig.root); Object.assign(player,{x:0,z:3.6,y:0,yaw:Math.PI,speed:0}); Object.assign(camState,{yaw:Math.PI,pitch:.22,dist:2.7}); renderPass.scene=INT.scene; toast('Home sweet home · Ikoyi'); }); }
function exitApt(){ fadeSwap(()=>{ mode='walk'; scene.add(rig.root); Object.assign(player,{x:APT.front.x,z:APT.front.z+.8,y:SLAB,yaw:0,speed:0}); Object.assign(camState,{yaw:0,pitch:.26,dist:4.3}); renderPass.scene=scene; }); }
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
  const fx=Math.cos(v.h), fz=-Math.sin(v.h); let nx=v.x+fx*sp*dt, nz=v.z+fz*sp*dt;
  if(!onLand(nx,nz,1.2)||!onLand(nx+fx*2.2,nz+fz*2.2,1.2)||!onLand(nx-fx*2.2,nz-fz*2.2,1.2)){ nx=v.x; nz=v.z; if(Math.abs(sp)>4) bump(Math.abs(sp)); sp*=-.25; }
  const P={x:nx,z:nz}; let hit=false;
  const cr=v.c.def.W/2*.95, ck=Math.max(0,v.c.def.L/2-cr);
  for(const k of (ck>.2?[ck,-ck]:[0])){ const c={x:P.x+fx*k,z:P.z+fz*k}, ox=c.x, oz=c.z; if(resolveCircle(c,cr)){ hit=true; P.x+=c.x-ox; P.z+=c.z-oz; } }
  if(hit){ if(Math.abs(sp)>6){ bump(Math.abs(sp)); sp*=.55; } sp*=Math.max(0,1-dt*5); }
  for(const o of vehicles){ if(o===v) continue; const dx=o.x-P.x, dz=o.z-P.z; if(Math.abs(dx)>5||Math.abs(dz)>5) continue; const d=Math.hypot(dx,dz), lim=(v.c.def.L+o.c.def.L)/2*.7;
    if(d<lim&&d>.01){ const push=lim-d; P.x-=dx/d*push; P.z-=dz/d*push; if(Math.abs(sp)>4){ bump(Math.abs(sp)); if(o.ai){ o.ai.wait=3; if(MR()<.7) setTimeout(horn,250); } } sp*=.5; } }
  v.x=P.x; v.z=P.z; drive.speed=sp; v.speed=sp;
  headSpot.position.set(v.x+fx*2.5,v.y+.85,v.z+fz*2.5); headTgt.position.set(v.x+fx*18,v.y,v.z+fz*18); headSpot.intensity=TIMES[curTime].spot; }
function updateTraffic(dt){
  for(const v of vehicles){ const ai=v.ai; if(!ai) continue; const fx=Math.cos(v.h), fz=-Math.sin(v.h);
    let target=ai.seg.k===1?6.5:ai.maxV, waiting=false; if(ai.wait>0){ ai.wait-=dt; target=0; waiting=true; }
    if(ai.seg.k===0){ const nb=nodes[ai.b], dist=ai.seg.len-ai.s;
      if(v.type==='danfo'&&ai.stopAt>0&&ai.s>=ai.stopAt){ ai.stopAt=-1; ai.wait=mrr(4,8); target=0; waiting=true; }
      if(!nb.bridge){ const st=lightAt(nb,ai.seg.fx); if(st!=='g'&&!(st==='y'&&dist<8)){ const lim=Math.max(0,(dist-.8)*.8); if(lim<target){ target=lim; if(dist<30) waiting=true; } } } }
    if(ai.ghost>0) ai.ghost-=dt; else {
      for(const o of vehicles){ if(o===v) continue; const dx=o.x-v.x, dz=o.z-v.z; if(Math.abs(dx)>16||Math.abs(dz)>16) continue; const ah=dx*fx+dz*fz; if(ah<=0||ah>22) continue;
        if(Math.abs(-dx*fz+dz*fx)<1.9){ const lim=Math.max(0,(ah-((v.c.def.L+o.c.def.L)/2+1.8))*1.3); if(lim<target){ target=lim; if(o.ai&&o.ai.waiting) waiting=true; } } }
      const chk=(x,z)=>{ const dx=x-v.x, dz=z-v.z, ah=dx*fx+dz*fz; if(ah>0&&ah<9&&Math.abs(-dx*fz+dz*fx)<1.7) target=0; };
      if(mode==='walk'||mode==='enter') chk(player.x,player.z); for(const p of peds) if(p.state!=='down'&&Math.abs(p.x-v.x)<10&&Math.abs(p.z-v.z)<10) chk(p.x,p.z); }
    ai.waiting=waiting;
    v.speed+=clamp(target-v.speed,-10*dt,3.5*dt);
    if(waiting||v.speed>.5) ai.stuck=0; else if(target<.2){ ai.stuck+=dt; if(ai.stuck>8){ ai.ghost=2.5; ai.stuck=0; } }
    ai.s+=v.speed*dt; let guard=0;
    while(ai.s>=ai.seg.len&&guard++<4){ ai.s-=ai.seg.len; if(ai.seg.k===0){ const opts=nodes[ai.b].adj.filter(n=>n!==ai.a); ai.na=opts.length?mpick(opts):ai.a; ai.seg=turnSeg(ai.a,ai.b,ai.na); } else { ai.a=ai.b; ai.b=ai.na; ai.seg=lineSeg(ai.a,ai.b); ai.stopAt=(v.type==='danfo'&&MR()<.35)?ai.seg.len*mrr(.3,.65):-1; } }
    segPos(ai.seg,ai.s,_sp); v.x=_sp.x; v.z=_sp.z; v.h=Math.atan2(-_sp.dz,_sp.dx);
    if((v.x-player.x)**2+(v.z-player.z)**2>340*340) placeCar(v,120,250); } }
function syncCar(v,dt){ const c=v.c, fx=Math.cos(v.h), fz=-Math.sin(v.h), d2=(v.x-camera.position.x)**2+(v.z-camera.position.z)**2; c.g.visible=d2<420*420; if(!c.g.visible) return;
  const gy=groundY(v.x,v.z); v.y+=(gy-v.y)*Math.min(1,dt*10); const yA=groundY(v.x+fx*2,v.z+fz*2), yB=groundY(v.x-fx*2,v.z-fz*2);
  c.g.position.set(v.x,v.y,v.z); c.g.rotation.set(0,v.h,Math.atan((yA-yB)/4)*.9);
  if(c.rider) c.rider.visible=!!(v.ai||v===drive.v);
  const spin=v.speed*dt/c.def.r; for(const w of c.wheels){ w.spin.rotation.z-=spin; if(w.front) w.piv.rotation.y=v===drive.v?drive.steer:0; } }
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
function updateWorld(dt){ water.material.uniforms.time.value+=dt*.6; updateChunks(dt);
  { const on=Math.floor(T0*4)%2===0; polRed.color.setRGB(on?3:.2,on?.15:.02,on?.1:.02); polBlue.color.setRGB(on?.1:.15,on?.2:.35,on?.3:3); }
  const fo=mode==='drive'?drive.v:player; sun.position.set(fo.x+lightDir.x*260,lightDir.y*260,fo.z+lightDir.z*260); sun.target.position.set(fo.x,0,fo.z);
  for(const fl of flags){ const pos=fl.mesh.geometry.attributes.position, a=pos.array, b=fl.base; for(let i=0;i<a.length;i+=3){ const x=b[i], k=x/3.6; a[i+2]=Math.sin(x*2.2-T0*6+fl.ph)*.2*k+Math.sin(b[i+1]*3+T0*4)*.03*k; } pos.needsUpdate=true; fl.mesh.geometry.computeVertexNormals(); }
  if(curTime!=='day') aviMat.emissiveIntensity=Math.sin(T0*3)>.2?3:.3;
  if(curTime==='night') bridgeParts.cableMat.emissive.setHSL((T0*.04)%1,.85,.5);
  APT.ring.material.opacity=.45+.35*Math.sin(T0*3); APT.ring.scale.setScalar(1+.08*Math.sin(T0*3)); }

/* ================= main loop ================= */
await step('Waking up the city…', 94);
setTime('golden');
renderer.compile(scene,camera); renderer.compile(INT.scene,camera);
const clock=new THREE.Clock();
function loop(){ const dt=Math.min(clock.getDelta(),.05); T0+=dt;
  if(started&&!busy){ if(mode==='walk') updateWalk(dt,false); else if(mode==='interior') updateWalk(dt,true); else if(mode==='enter') updateEnter(dt); else updateDrive(dt); }
  if(mode!=='interior'){ updateTraffic(dt); updatePeds(dt); updateLights(dt); for(const v of vehicles) syncCar(v,dt); updateWorld(dt); } else INT.fan.rotation.y+=dt*4;
  if(!started){ rig.root.position.set(player.x,player.y,player.z); if(hero) heroAnim(dt,0); else animHuman(rig,0,0,T0,false); camState.yaw+=dt*.05; }
  updateCamera(dt); updateHUD(dt); updateAudio(); composer.render(dt); }
renderer.setAnimationLoop(loop);
window.__nsReady=true;
loadTxt.textContent='Lagos is ready.'; loadBar.style.width='100%';
const eb=$('#enterBtn'); eb.hidden=false; eb.focus();
eb.addEventListener('click',()=>{ started=true; camState.yaw=0; $('#loading').classList.add('gone'); setTimeout(()=>{ $('#loading').hidden=true; },650); $('#hud').hidden=false; initAudio();
  if(!isTouch){ $('#help').hidden=false; setTimeout(()=>{ $('#help').hidden=true; },9000); try{ const p=cvs.requestPointerLock(); if(p&&p.catch) p.catch(()=>{ $('#lookhint').hidden=false; }); }catch(_){ $('#lookhint').hidden=false; } }
  toast('Golden hour in Ikoyi. Your car is parked across the walkway.',4); });
document.addEventListener('pointerlockchange',()=>{ if(!document.pointerLockElement&&started&&!isTouch) $('#lookhint').hidden=false; else $('#lookhint').hidden=true; });
