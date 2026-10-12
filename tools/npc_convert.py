"""Turn Mixamo FBX exports (character + one move each) into game files, using three.js in headless Chromium.

  python3 tools/npc_convert.py OUT_DIR

Writes OUT_DIR/raw/<id>.glb (one skinned character, no moves, scaled to metres) and OUT_DIR/raw/moves.glb
(every move on one skeleton, in place: hips x/z removed, hips height stored as a fraction of its first-frame height so a move
fits any character; the game measures the small foot offset of each move per character). Shrink them afterwards with tools/npc_pack.sh.
Edit CAST and MOVES below when new files arrive.
"""
import sys, base64, json
from pathlib import Path
from playwright.sync_api import sync_playwright

UP = Path('/root/.claude/uploads/aed368e3-68f2-530f-b05a-29430b01870d')
THREE = Path('/tmp/claude-0/-home-claude-naija-streets/aed368e3-68f2-530f-b05a-29430b01870d/scratchpad/play/three')
CDN = 'https://cdn.jsdelivr.net/npm/three@0.165.0/'
OUT = Path(sys.argv[1]); (OUT / 'raw').mkdir(parents=True, exist_ok=True)
ONLY_MOVES = '--moves' in sys.argv

# character id -> FBX that carries the mesh
CAST = {
    'mama':      '912c0023-Standing_Arguing.fbx',   # woman, leopard romper, red top
    'schoolboy': 'e7dd8595-Start_Walking.fbx',      # boy in school uniform
    'lady_black':'c822877e-Idle_4.fbx',             # young woman, black dress
    'lady_red':  'ea7d9e82-Idle_3.fbx',             # young woman, red dress
    'hawker':    'de1e9434-Walk.fbx',               # market woman with a tray of tomatoes on her head
    'baba':      'de9bc8d6-Idle.fbx',               # old man in white kaftan and cap
    'areaboy':   'deb24a60-Fighting_Idle.fbx',      # young man, green shirt, shorts, slippers
    'girl':      '0a4d2050-Talking.fbx',            # young woman, white crop top, plaid skirt, boots (the female player)
    'suit_lady': 'f30ad6e2-Idle.fbx',               # woman in a grey trouser suit
}
# move name -> FBX that carries it
MOVES = {
    'walk': 'de1e9434-Walk.fbx', 'idle_1': 'ed29d936-Idle_1.fbx', 'idle_baba': 'de9bc8d6-Idle.fbx', 'idle_2': 'f2758762-Idle_2.fbx',
    'idle_3': 'ea7d9e82-Idle_3.fbx', 'idle_4': 'c822877e-Idle_4.fbx', 'sassy': 'e86c3977-Dwarf_Idle.fbx', 'talk': '712a2c6f-Talking.fbx',
    'argue': '912c0023-Standing_Arguing.fbx', 'no': 'f857bc66-No.fbx', 'hail': '0c331530-Hand_Raising.fbx', 'text': '2a3ff53b-Texting.fbx',
    'text_walk': '5d678b39-Texting_And_Walking.fbx', 'phone': '2053a253-Pacing_And_Talking_On_A_Phone.fbx',
    'fight_idle': 'deb24a60-Fighting_Idle.fbx', 'start_walk': 'e7dd8595-Start_Walking.fbx',
    # fighting and other moves (one areaboy rig; its standing hips height is 1.0, so lying moves keep their low hips)
    'punch': ('0ab3578a-Punching.fbx', {'ref': 1.0}), 'kick': ('0ca35c48-Mma_Kick_1.fbx', {'ref': 1.0}),
    'drop_kick': ('bf1c69f3-Drop_Kick.fbx', {'ref': 1.0}), 'hit_head': ('5ae4ad2d-Medium_Hit_To_Head.fbx', {'ref': 1.0}),
    'hit_body': ('59807b18-Kidney_Hit.fbx', {'ref': 1.0}), 'hit_side': ('1058b71b-Big_Side_Hit.fbx', {'ref': 1.0}),
    'uppercut': ('c9d06f30-Receiving_An_Uppercut.fbx', {'ref': 1.0}),
    'takedown_a': ('c85ac27a-Double_Leg_Takedown_-_Attacker.fbx', {'ref': 1.0, 'root': True}),
    'takedown_v': ('b5fd3be9-Double_Leg_Takedown_-_Victim.fbx', {'ref': 1.0, 'root': True}),
    'kip_up': ('73e56ecf-Kip_Up.fbx', {'ref': 1.0}), 'stand_up': ('d8cefe39-Standing_Up.fbx', {'ref': 1.0}),
    'jump': ('6aaadc30-Jump.fbx', {'ref': 1.0}), 'situps': ('7d17ce49-Situps.fbx', {'ref': 1.0}),
    'pushups': ('4e78b3e7-Push_Up_To_Idle.fbx', {'ref': 1.0, 'cut': 'rise'}),
    # women's moves (one girl rig; her standing hips height is 0.977 m, so dances, lying and runs keep their true height)
    'f_walk': ('dd3f5df2-Walking_1.fbx', {'ref': 97.7}), 'f_catwalk': ('adbdebbf-Catwalk_Walking.fbx', {'ref': 97.7}),
    'f_run': ('1d786623-Goofy_Running.fbx', {'ref': 97.7}), 'f_start_walk': ('6ab3fef9-Female_Start_Walking.fbx', {'ref': 97.7}),
    'f_stop_walk': ('82b5bc4f-Female_Stop_Walking.fbx', {'ref': 97.7}), 'f_idle': ('7856c4e7-Idle_3.fbx', {'ref': 97.7}),
    'f_talk': ('0a4d2050-Talking.fbx', {'ref': 97.7}), 'f_think': ('936491b5-Thinking.fbx', {'ref': 97.7}),
    'f_bashful': ('48781c16-Bashful.fbx', {'ref': 97.7}), 'f_lie': ('e7e6311b-Female_Laying_Pose.fbx', {'ref': 97.7}),
    'f_fight_idle': ('3f6ae2f3-Standing_Idle_To_Fight_Idle.fbx', {'ref': 97.7, 'cut': 'last'}),
    'dance_macarena': ('ffe97785-Macarena_Dance.fbx', {'ref': 97.7}), 'dance_1': ('262036bd-Dancing_1.fbx', {'ref': 97.7}),
    'dance_salsa': ('d7434904-Salsa_Dancing.fbx', {'ref': 97.7}),
    'idle_suit': ('f30ad6e2-Idle.fbx', {'ref': 101.0}),
    'threaten': ('b1e85720-Threatening.fbx', {}),   # pointing and shouting: the carjack
}
ONLY = next((a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('--only=')), None)   # convert just these characters (moves are always rebuilt)
SKELETON_FROM = 'mama'   # a rig with every bone (65, fingers included) to carry the moves

HTML = """<!doctype html><html><body><script type="importmap">{"imports":{"three":"%sbuild/three.module.js","three/addons/":"%sexamples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
const load=async n=>{ const o=new FBXLoader().parse(await (await fetch('http://conv.local/'+n)).arrayBuffer(),'');
  const maps=[]; o.traverse(m=>{ if(m.isMesh) (Array.isArray(m.material)?m.material:[m.material]).forEach(x=>{ if(x.map) maps.push(x.map); }); });
  for(let i=0;i<80&&maps.some(t=>!t.image||!t.image.width);i++) await new Promise(r=>setTimeout(r,100)); return o; };
const b64=ab=>{ const u8=new Uint8Array(ab); let s=''; for(let k=0;k<u8.length;k+=32768) s+=String.fromCharCode.apply(null,u8.subarray(k,k+32768)); return btoa(s); };
const hipsY=o=>{ let y=null; o.traverse(b=>{ if(b.isBone&&/Hips$/.test(b.name)&&y===null) y=b.position.y; }); return y; };
// one character: skinned mesh with a plain material, scaled to metres
window.character=async(file)=>{ const o=await load(file); o.animations=[];
  o.traverse(m=>{ if(m.isMesh){ const x=Array.isArray(m.material)?m.material[0]:m.material; m.material=new THREE.MeshStandardMaterial({map:x.map||null,color:x.map?0xffffff:0x8a6a50,roughness:.75,metalness:0}); if(m.material.map) m.material.map.colorSpace=THREE.SRGBColorSpace; } });
  o.updateMatrixWorld(true); const bb=new THREE.Box3().setFromObject(o,true), h=bb.max.y-bb.min.y; const unit=h>20?.01:1;
  const root=new THREE.Group(); root.name='npc'; o.scale.multiplyScalar(unit); root.add(o); root.updateMatrixWorld(true);
  const glb=await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:false});
  return {b64:b64(glb),height:+(h*unit).toFixed(3),unit,hipsY:hipsY(o),verts:(()=>{ let n=0; o.traverse(m=>{ if(m.isMesh) n+=m.geometry.attributes.position.count; }); return n; })()}; };
// all moves on one skeleton, made in place and size-free
window.moves=async(skelFile,list)=>{ const sk=await load(skelFile); const bones=[]; sk.traverse(b=>{ if(b.isBone) bones.push(b); });
  const root=bones[0]; let top=root; while(top.parent&&top.parent.isBone) top=top.parent;
  const holder=new THREE.Group(); holder.name='moves'; holder.add(top); const clips=[], info=[];
  for(const [name,file,opt] of list){ const o=await load(file); let k=o.animations[0].clone(); k.name=name; const y0=hipsY(o);
    k.tracks=k.tracks.filter(t=>!/\\.scale$/.test(t.name));
    // hips height as a fraction of standing height (opt.ref: the rig's standing height, for moves that start on the ground);
    // sideways travel removed, unless the move needs it (opt.root: two people moving together)
    for(const t of k.tracks){ if(/Hips\\.position$/.test(t.name)){ const v=t.values; const ry=opt.ref||v[1]||y0||1, x0=v[0], z0=v[2];
      for(let i=0;i<v.length;i+=3){ v[i]=opt.root?(v[i]-x0)/ry:0; v[i+1]=v[i+1]/ry; v[i+2]=opt.root?(v[i+2]-z0)/ry:0; } } }
    if(opt.cut==='rise'){ const t=k.tracks.find(t=>/Hips\\.position$/.test(t.name)), v=t.values, n=v.length/3; let e=n; for(let i=1;i<n;i++) if(v[i*3+1]>.6){ e=i; break; }
      k=THREE.AnimationUtils.subclip(k,name,0,Math.max(2,e-4),30); }   // only the part before the person stands up
    if(opt.cut==='last'){ const n=Math.round(k.duration*30); k=THREE.AnimationUtils.subclip(k,name,Math.max(0,n-3),n,30); }   // the pose it ends in (fists up), held
    clips.push(k); info.push([name,+k.duration.toFixed(2),k.tracks.length]); }
  const glb=await new GLTFExporter().parseAsync(holder,{binary:true,animations:clips,onlyVisible:false});
  return {b64:b64(glb),info}; };
window.ready=true;
</script></body></html>""" % (CDN, CDN)

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    def route(rt):
        u = rt.request.url
        if u == 'http://conv.local/': return rt.fulfill(body=HTML, headers={'Content-Type': 'text/html'})
        if u.startswith('http://conv.local/'): return rt.fulfill(body=(UP / u.rsplit('/', 1)[1]).read_bytes(), headers={'Content-Type': 'application/octet-stream'})
        if u.startswith(CDN): return rt.fulfill(body=(THREE / u[len(CDN):]).read_bytes(), headers={'Content-Type': 'application/javascript'})
        return rt.abort()
    pg.route('**/*', route); pg.goto('http://conv.local/'); pg.wait_for_function('window.ready===true', timeout=60000)
    meta = {}
    for cid, f in ([] if ONLY_MOVES else [(c, f) for c, f in CAST.items() if not ONLY or c in ONLY]):
        r = pg.evaluate(f'window.character({json.dumps(f)})', None)
        (OUT / 'raw' / f'{cid}.glb').write_bytes(base64.b64decode(r.pop('b64'))); meta[cid] = r; print(cid, r, flush=True)
    mv = [[n, f, {}] if isinstance(f, str) else [n, f[0], f[1]] for n, f in MOVES.items()]
    r = pg.evaluate(f'window.moves({json.dumps(CAST[SKELETON_FROM])},{json.dumps(mv)})')
    (OUT / 'raw' / 'moves.glb').write_bytes(base64.b64decode(r['b64'])); print('moves', r['info'], flush=True)
    if meta:
        mp = OUT / 'raw' / 'meta.json'; old = json.load(open(mp)) if mp.exists() else {}; old.update(meta); json.dump(old, open(mp, 'w'), indent=1)
    print('errors', errs[:5]); b.close()
