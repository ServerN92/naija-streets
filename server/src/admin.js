// The owner's page: /admin on the game server. Who signed up, who is online, money, ranks, seats, blocks.
// Locked with ADMIN_TOKEN (a Fly secret). Without it the page does not exist. Every action is written to admin_log.
import crypto from 'node:crypto';
import { Limits } from './auth.js';
import { rankName, LAW } from './law.js';

const tries = new Limits(10, 10 / 900);   // 10 wrong keys per 15 minutes from one address
const COLS = 'id, name, email, created, seen, cash, banned, ban_until, ban_why, frozen';

export function createAdmin({ db, world, token, log = () => {} }) {
  if (!token) return { handle: () => false };
  const want = Buffer.from(String(token));
  const okKey = h => {
    const m = /^Bearer (.+)$/.exec(String(h || '')); if (!m) return false;
    const got = Buffer.from(m[1]);
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  };
  const q = s => db.raw.prepare(s);
  const S = {
    list: { id: q(`SELECT ${COLS} FROM users WHERE (? = '' OR lname LIKE ?) ORDER BY id DESC LIMIT ? OFFSET ?`),
      seen: q(`SELECT ${COLS} FROM users WHERE (? = '' OR lname LIKE ?) ORDER BY seen DESC LIMIT ? OFFSET ?`),
      cash: q(`SELECT ${COLS} FROM users WHERE (? = '' OR lname LIKE ?) ORDER BY cash DESC LIMIT ? OFFSET ?`),
      name: q(`SELECT ${COLS} FROM users WHERE (? = '' OR lname LIKE ?) ORDER BY lname LIMIT ? OFFSET ?`) },
    n: q(`SELECT COUNT(*) n FROM users WHERE (? = '' OR lname LIKE ?)`),
    total: q('SELECT COUNT(*) n FROM users'),
    since: q('SELECT COUNT(*) n FROM users WHERE created >= ?'),
    active: q('SELECT COUNT(*) n FROM users WHERE seen >= ?'),
    blocked: q('SELECT COUNT(*) n FROM users WHERE banned = 1 OR ban_until > ?'),
    cashSum: q('SELECT COALESCE(SUM(cash),0) s FROM users'),
    byDay: q(`SELECT date(created/1000, 'unixepoch') d, COUNT(*) n FROM users WHERE created >= ? GROUP BY d ORDER BY d`),
    ledger: q('SELECT t, d, bal, k FROM ledger WHERE uid=? ORDER BY t DESC LIMIT 30'),
    bank: q('SELECT bank, acct FROM bank WHERE uid=?'),
    logs: q('SELECT * FROM admin_log ORDER BY id DESC LIMIT 200'),
    userLogs: q('SELECT * FROM admin_log WHERE uid=? ORDER BY id DESC LIMIT 50'),
  };
  const now = () => Date.now();
  const status = (u, t) => u.banned ? 'blocked' : u.ban_until > t ? 'timed' : world.isOnline(u.id) ? 'online' : 'offline';
  const row = (u, t) => ({ id: u.id, name: u.name, email: u.email, created: u.created, seen: u.seen, cash: u.cash, frozen: !!u.frozen,
    status: status(u, t), banUntil: u.ban_until > t ? u.ban_until : 0, banWhy: u.ban_why || '' });
  const record = (a, u, detail) => { db.adminLog(now(), a, u && u.id, u && u.name, detail); log('admin', a, u && u.name, detail || ''); };

  function json(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }); res.end(JSON.stringify(body)); }
  function readBody(req) { return new Promise(r => { let s = ''; req.on('data', d => { s += d; if (s.length > 8192) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(s || '{}')); } catch (e) { r({}); } }); }); }

  function profile(u, t) {
    const parkSt = world.park.state, chair = parkSt && parkSt.chair === u.id;
    return { ...row(u, t), law: world.law.info(u.id), chair, biz: world.biz.all().filter(b => b.owner === u.id), bank: S.bank.get(u.id) || null,
      life: db.lifeGet(u.id), ledger: S.ledger.all(u.id), logs: S.userLogs.all(u.id) };
  }

  // the owner's actions on one player
  const ACT = {
    cash(u, b) {
      const n = Math.round(+b.n); if (!(n >= 0) || n > 1e9) throw 'Amount: 0 to 1,000,000,000.';
      const mode = b.mode === 'take' ? 'take' : b.mode === 'set' ? 'set' : 'give';
      const next = world.setCash(u.id, mode === 'set' ? { set: n, why: 'admin set' } : { delta: mode === 'take' ? -n : n, why: 'admin ' + mode });
      record('cash', u, `${mode} ₦${n.toLocaleString('en-NG')} → ₦${Number(next).toLocaleString('en-NG')}`);
      return { cash: next };
    },
    block(u, b) {
      const hours = Math.max(0, Math.min(24 * 3650, +b.hours || 0)), why = String(b.why || '').slice(0, 120).trim();
      const until = hours ? now() + hours * 3600e3 : 0;
      db.setBlock(u.id, !hours, until, why); db.dropSessions(u.id);
      world.kick(u.id, (hours ? `Blocked for ${hours >= 48 ? Math.round(hours / 24) + ' days' : hours + ' hours'}` : 'Your account has been blocked') + (why ? ': ' + why : '.'));
      record('block', u, (hours ? hours + 'h' : 'permanent') + (why ? ' — ' + why : ''));
      return { ok: 1 };
    },
    unblock(u) { db.setBlock(u.id, 0, 0, null); record('unblock', u, ''); return { ok: 1 }; },
    kick(u) { const did = world.kick(u.id, 'Signed out by the server.'); record('kick', u, did ? '' : 'was offline'); return { ok: 1, did }; },
    freeze(u, b) { db.setFrozen(u.id, !!b.on); record(b.on ? 'freeze' : 'unfreeze', u, ''); return { ok: 1 }; },
    police(u, b) {
      const patch = {};
      if (b.cop != null) patch.cop = !!b.cop;
      if (b.rank != null) { const r = LAW.ranks.find(x => x[1] === b.rank); if (!r) throw 'Unknown rank.'; patch.cop = true; patch.arrests = r[0]; }
      if (b.suspendHours != null) patch.banHours = Math.max(0, Math.min(24 * 365, +b.suspendHours || 0));
      const r = world.law.admin(u.id, patch);
      record('police', u, Object.entries(b).filter(([k]) => k !== 'id' && k !== 'a').map(([k, v]) => `${k}=${v}`).join(' ') + ` → ${r.cop ? r.rank : 'civilian'}`);
      return { law: r };
    },
    chair(u, b) { const r = world.park.admin(b.on ? u.id : null); if (!r) throw 'Could not change the seat.'; record('chair', u, b.on ? 'made chairman' : 'removed from the seat'); return { chair: r }; },
    biz(u, b) {
      const id = String(b.biz || ''); const cur = world.biz.get(id); if (!cur) throw 'No such business.';
      if (b.on && cur.owner && cur.owner !== u.id) throw `${cur.oname} owns it. Take it from them first.`;
      const r = world.biz.admin(id, b.on ? u.id : null); if (!r) throw 'Could not change the owner.';
      record('biz', u, (b.on ? 'given ' : 'taken ') + id); return { biz: r };
    },
  };

  async function api(req, res, url, ip) {
    if (!okKey(req.headers.authorization)) {
      if (!tries.take(ip)) return json(res, 429, { e: 'Too many tries. Wait 15 minutes.' });
      return json(res, 401, { e: 'Wrong key.' });
    }
    const t = now(), p = url.pathname.slice('/admin/api/'.length);
    if (p === 'stats') {
      const parkSt = world.park.state;
      return json(res, 200, {
        total: S.total.get().n, online: world.online, blocked: S.blocked.get(t).n, cash: S.cashSum.get().s,
        newToday: S.since.get(t - 864e5).n, new7: S.since.get(t - 7 * 864e5).n,
        active1: S.active.get(t - 864e5).n, active7: S.active.get(t - 7 * 864e5).n, active30: S.active.get(t - 30 * 864e5).n,
        byDay: S.byDay.all(t - 30 * 864e5), chair: parkSt ? { id: parkSt.chair, name: parkSt.cname } : null,
        ranks: LAW.ranks.map(r => r[1]), biz: world.biz.all(),
      });
    }
    if (p === 'users') {
      const s = String(url.searchParams.get('q') || '').toLowerCase().replace(/[%_]/g, ''), like = '%' + s + '%';
      const page = Math.max(0, +url.searchParams.get('page') || 0), per = 50;
      const st = S.list[url.searchParams.get('sort')] || S.list.id;
      return json(res, 200, { n: S.n.get(s, like).n, page, per, rows: st.all(s, like, per, page * per).map(u => row(u, t)) });
    }
    if (p === 'user') {
      const u = db.userById(+url.searchParams.get('id')); if (!u) return json(res, 404, { e: 'No such player.' });
      return json(res, 200, profile(u, t));
    }
    if (p === 'log') return json(res, 200, { rows: S.logs.all() });
    if (p === 'act' && req.method === 'POST') {
      const b = await readBody(req), u = db.userById(+b.id | 0), fn = ACT[b.a];
      if (!u) return json(res, 404, { e: 'No such player.' }); if (!fn) return json(res, 400, { e: 'Unknown action.' });
      try { const r = fn(u, b); return json(res, 200, { ...r, user: profile(db.userById(u.id), now()) }); }
      catch (e) { if (typeof e === 'string') return json(res, 400, { e }); throw e; }
    }
    json(res, 404, { e: 'Unknown.' });
  }

  function handle(req, res, url, ip) {
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src data:" });
      res.end(PAGE); return true;
    }
    if (url.pathname.startsWith('/admin/api/')) { api(req, res, url, ip).catch(e => { log('admin error', e); json(res, 500, { e: 'Error.' }); }); return true; }
    return false;
  }
  return { handle };
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Naija Streets · Control Room</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bungee&family=Barlow+Semi+Condensed:wght@500;600;700&display=swap">
<style>
:root{--ink:#0E1014;--panel:#15181E;--line:rgba(255,255,255,.1);--cream:#F7EFDF;--muted:#BDB5A6;--danfo:#F2B705;--flag:#16A06B;--rust:#D0573E;--blue:#4f86f0;--fd:'Bungee',Impact,sans-serif;--fb:'Barlow Semi Condensed',system-ui,sans-serif;color-scheme:dark}
[hidden]{display:none!important}*{box-sizing:border-box}body{margin:0;background:radial-gradient(120% 80% at 80% 0%,#1d2a1f 0%,var(--ink) 55%);color:var(--cream);font:16px/1.4 var(--fb);min-height:100vh}
a{color:var(--danfo)}button{font:600 15px var(--fb);color:var(--cream);background:rgba(255,255,255,.08);border:1px solid var(--line);border-radius:10px;padding:8px 14px;cursor:pointer}
button:hover{background:rgba(255,255,255,.14)}button:disabled{opacity:.45;cursor:default}button.y{background:var(--danfo);color:var(--ink);border-color:transparent}button.g{background:var(--flag);color:#fff;border-color:transparent}button.r{background:var(--rust);color:#fff;border-color:transparent}button.sm{padding:5px 10px;font-size:13px}
input,select{font:500 15px var(--fb);background:#0b0d11;color:var(--cream);border:1px solid var(--line);border-radius:10px;padding:9px 12px;min-width:0}input:focus,select:focus{outline:2px solid var(--danfo);outline-offset:1px}
header{display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid var(--line);background:rgba(0,0,0,.35);position:sticky;top:0;z-index:5}
.brand{font:22px var(--fd);letter-spacing:.04em;line-height:1}.brand b{color:var(--danfo)}.brand i{color:var(--flag);font-style:normal}.sub{color:var(--muted);font-size:13px;margin-left:2px}
nav{display:flex;gap:6px;margin-left:auto}nav button{background:transparent;border-color:transparent;color:var(--muted)}nav button.on{color:var(--cream);background:rgba(255,255,255,.08)}
main{padding:20px;max-width:1180px;margin:0 auto}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px}.card b{display:block;font:26px var(--fd);color:var(--danfo)}.card b.g{color:var(--flag)}.card b.r{color:var(--rust)}.card span{color:var(--muted);font-size:13px;text-transform:uppercase;letter-spacing:.06em}
h2{font:16px var(--fd);letter-spacing:.04em;color:var(--muted);margin:26px 0 10px}
.chart{display:flex;align-items:flex-end;gap:3px;height:70px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:10px}.chart i{flex:1;background:linear-gradient(to top,var(--flag),#2bd08a);border-radius:3px 3px 0 0;min-height:2px}
.bar{display:flex;gap:10px;align-items:center;margin:12px 0;flex-wrap:wrap}.grow{flex:1}
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);cursor:pointer;background:rgba(0,0,0,.25)}tr:last-child td{border-bottom:0}tbody tr{cursor:pointer}tbody tr:hover{background:rgba(255,255,255,.04)}
.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.03em}.pill.online{background:rgba(22,160,107,.2);color:#3fd49a}.pill.offline{background:rgba(255,255,255,.07);color:var(--muted)}.pill.blocked{background:rgba(208,87,62,.2);color:#ff8d73}.pill.timed{background:rgba(242,183,5,.18);color:var(--danfo)}
.muted{color:var(--muted)}.right{text-align:right}
#login{max-width:360px;margin:12vh auto;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:26px;display:flex;flex-direction:column;gap:12px}#login h1{font:28px var(--fd);margin:0;color:var(--danfo)}
.drawer{position:fixed;inset:0 0 0 auto;width:min(560px,100%);background:#111317;border-left:1px solid var(--line);box-shadow:-20px 0 60px rgba(0,0,0,.6);z-index:10;overflow:auto;padding:20px;transform:translateX(100%);transition:transform .25s}.drawer.open{transform:none}
.dh{display:flex;align-items:center;gap:12px}.dh h1{font:24px var(--fd);margin:0}.x{margin-left:auto}
.sec{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:12px}.sec h3{margin:0 0 10px;font:13px var(--fd);letter-spacing:.06em;color:var(--muted)}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}.row input{flex:1;min-width:90px}
.kv{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:14px}.kv span{color:var(--muted)}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--danfo);color:var(--ink);font-weight:700;padding:10px 16px;border-radius:12px;z-index:20;opacity:0;transition:opacity .2s}.toast.on{opacity:1}.toast.bad{background:var(--rust);color:#fff}
.log{font-size:14px}.log td:first-child{color:var(--muted)}
@media (max-width:640px){main{padding:12px}th:nth-child(3),td:nth-child(3){display:none}}
</style></head><body>
<header><div><div class="brand"><b>NAIJA</b> <i>STREETS</i></div><div class="sub">CONTROL ROOM</div></div><nav id="nav" hidden><button data-v="home" class="on">Overview</button><button data-v="players">Players</button><button data-v="log">Log</button><button id="lock">Lock</button></nav></header>
<main>
<div id="login"><h1>CONTROL ROOM</h1><div class="muted">Owner's key</div><input id="key" type="password" autocomplete="current-password"><button class="y" id="go">OPEN</button><div id="lerr" style="color:#ff8d73"></div></div>
<div id="home" hidden><div class="cards" id="cards"></div><h2>NEW PLAYERS · LAST 30 DAYS</h2><div class="chart" id="chart"></div><h2>LAGOS NOW</h2><div class="cards" id="now"></div></div>
<div id="players" hidden><div class="bar"><input id="q" placeholder="Search by username" style="flex:1;max-width:320px"><span class="muted" id="count"></span><span class="grow"></span><button id="prev">‹</button><span id="pg"></span><button id="next">›</button></div>
<table><thead><tr><th data-s="name">Player</th><th data-s="id">Joined</th><th>Email</th><th data-s="seen">Last seen</th><th data-s="cash" class="right">Pocket ₦</th><th>Status</th></tr></thead><tbody id="rows"></tbody></table></div>
<div id="log" hidden><table class="log"><thead><tr><th>When</th><th>Action</th><th>Player</th><th>Detail</th></tr></thead><tbody id="logrows"></tbody></table></div>
</main>
<div class="drawer" id="drawer"></div><div class="toast" id="toast"></div>
<script>
const $=s=>document.querySelector(s);let KEY=null,page=0,sort='id',q='',ST=null,U=null;
try{KEY=sessionStorage.getItem('nsAdminKey')}catch(e){}
const api=async(p,o={})=>{const r=await fetch('/admin/api/'+p,{...o,headers:{Authorization:'Bearer '+KEY,'Content-Type':'application/json'}});const j=await r.json();if(r.status===401){lock();throw new Error(j.e)}if(!r.ok)throw new Error(j.e||('Error '+r.status));return j};
const N=n=>Number(n||0).toLocaleString('en-NG');
const ago=t=>{if(!t)return'—';const d=Date.now()-t;if(d<6e4)return'just now';if(d<36e5)return Math.floor(d/6e4)+' min ago';if(d<864e5)return Math.floor(d/36e5)+' h ago';return Math.floor(d/864e5)+' d ago'};
const left=t=>{const d=t-Date.now();if(d<=0)return'';return d<36e5?Math.ceil(d/6e4)+' min':d<864e5?Math.ceil(d/36e5)+' h':Math.ceil(d/864e5)+' d'};
const date=t=>t?new Date(t).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}):'—';const dt=t=>new Date(t).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pill=u=>'<span class="pill '+u.status+'">'+(u.status==='timed'?'blocked '+left(u.banUntil):u.status)+'</span>';
let tt;function toast(m,bad){const t=$('#toast');t.textContent=m;t.className='toast on'+(bad?' bad':'');clearTimeout(tt);tt=setTimeout(()=>t.className='toast',2600)}
function lock(){KEY=null;try{sessionStorage.removeItem('nsAdminKey')}catch(e){}$('#nav').hidden=true;view('login')}
function view(v){for(const id of['login','home','players','log'])$('#'+id).hidden=id!==v;document.querySelectorAll('#nav [data-v]').forEach(b=>b.classList.toggle('on',b.dataset.v===v));if(v==='home')stats();if(v==='players')users();if(v==='log')logs()}
async function open(){try{await stats();$('#nav').hidden=false;view('home');try{sessionStorage.setItem('nsAdminKey',KEY)}catch(e){}}catch(e){$('#lerr').textContent=e.message;KEY=null}}
async function stats(){const s=ST=await api('stats');$('#cards').innerHTML=[['Players',s.total],['Online now',s.online,'g'],['New today',s.newToday],['New · 7 days',s.new7],['Active today',s.active1],['Active · 7 days',s.active7],['Active · 30 days',s.active30],['Blocked',s.blocked,'r'],['₦ in all pockets',N(s.cash)]].map(([k,v,c])=>'<div class="card"><b class="'+(c||'')+'">'+v+'</b><span>'+k+'</span></div>').join('');
const m=Math.max(1,...s.byDay.map(d=>d.n));const days=[];for(let i=29;i>=0;i--){const d=new Date(Date.now()-i*864e5).toISOString().slice(0,10);const f=s.byDay.find(x=>x.d===d);days.push([d,f?f.n:0])}$('#chart').innerHTML=days.map(([d,n])=>'<i style="height:'+Math.max(3,n/m*100)+'%" title="'+d+': '+n+'"></i>').join('');
const owned=s.biz.filter(b=>b.owner);$('#now').innerHTML='<div class="card"><b style="font-size:18px">'+esc(s.chair&&s.chair.id?s.chair.name:'Chairman Kasali (NPC)')+'</b><span>Park chairman</span></div><div class="card"><b>'+owned.length+' / '+s.biz.length+'</b><span>Businesses owned</span></div>'}
async function users(){const u=await api('users?q='+encodeURIComponent(q)+'&page='+page+'&sort='+sort);$('#count').textContent=u.n+' players';$('#pg').textContent=(u.page+1)+' / '+Math.max(1,Math.ceil(u.n/u.per));
$('#rows').innerHTML=u.rows.map(r=>'<tr data-id="'+r.id+'"><td><b>'+esc(r.name)+'</b> <span class="muted">#'+r.id+'</span></td><td>'+date(r.created)+'</td><td class="muted">'+esc(r.email||'')+'</td><td>'+ago(r.seen)+'</td><td class="right">'+N(r.cash)+'</td><td>'+pill(r)+(r.frozen?' <span class="pill timed">frozen</span>':'')+'</td></tr>').join('')||'<tr><td colspan="6" class="muted">Nobody yet.</td></tr>'}
async function logs(){const l=await api('log');$('#logrows').innerHTML=l.rows.map(r=>'<tr><td>'+dt(r.t)+'</td><td><b>'+esc(r.a)+'</b></td><td>'+(r.uid?'<a href="#" data-id="'+r.uid+'">'+esc(r.name)+'</a>':'')+'</td><td class="muted">'+esc(r.detail||'')+'</td></tr>').join('')||'<tr><td colspan="4" class="muted">Nothing yet.</td></tr>'}
async function show(id){U=await api('user?id='+id);draw();$('#drawer').classList.add('open')}
function draw(){const u=U,ranks=ST?ST.ranks:[],free=(ST?ST.biz:[]).filter(b=>!b.owner);
$('#drawer').innerHTML='<div class="dh"><h1>'+esc(u.name)+'</h1>'+pill(u)+(u.frozen?' <span class="pill timed">bank frozen</span>':'')+'<button class="x" id="close">✕</button></div>'
+'<div class="sec"><div class="kv"><span>Player #</span><b>'+u.id+'</b><span>Email</span><b>'+esc(u.email||'—')+'</b><span>Joined</span><b>'+date(u.created)+'</b><span>Last seen</span><b>'+ago(u.seen)+'</b><span>Pocket</span><b>₦'+N(u.cash)+'</b><span>Bank</span><b>'+(u.bank?esc(u.bank.bank.toUpperCase())+' · '+u.bank.acct:'no account')+'</b><span>Police</span><b>'+(u.law.cop?esc(u.law.rank)+' · '+u.law.arrests+' arrests':'civilian')+(u.law.ban?' · suspended '+left(Date.now()+u.law.ban):'')+'</b><span>Park</span><b>'+(u.chair?'CHAIRMAN':'—')+'</b><span>Businesses</span><b>'+(u.biz.length?u.biz.map(b=>esc(b.name||b.id)).join(', '):'none')+'</b>'+(u.banWhy?'<span>Block reason</span><b>'+esc(u.banWhy)+'</b>':'')+'</div></div>'
+'<div class="sec"><h3>MONEY</h3><div class="row"><input id="amt" type="number" min="0" step="100" placeholder="Amount ₦"><button class="g" data-act="cash" data-mode="give">Give</button><button class="r" data-act="cash" data-mode="take">Seize</button><button data-act="cash" data-mode="set">Set to</button></div><div class="row"><button class="sm" data-act="freeze" data-on="'+(u.frozen?0:1)+'">'+(u.frozen?'Unfreeze bank':'Freeze bank')+'</button></div></div>'
+'<div class="sec"><h3>POLICE</h3><div class="row"><select id="rank"><option value="">Rank…</option>'+ranks.map(r=>'<option'+(u.law.cop&&u.law.rank===r?' selected':'')+'>'+r+'</option>').join('')+'</select><button data-act="police" data-k="rank">Set rank</button>'+(u.law.cop?'<button class="r" data-act="police" data-k="fire">Fire from force</button>':'<button class="g" data-act="police" data-k="hire">Hire as Constable</button>')+'</div><div class="row"><input id="susp" type="number" min="0" placeholder="Suspend · hours"><button data-act="police" data-k="suspend">Suspend</button>'+(u.law.ban?'<button data-act="police" data-k="lift">Lift suspension</button>':'')+'</div></div>'
+'<div class="sec"><h3>MOTOR PARK</h3><div class="row">'+(u.chair?'<button class="r" data-act="chair" data-on="0">Remove from the chairman seat</button>':'<button class="y" data-act="chair" data-on="1">Make park chairman</button>')+'</div></div>'
+'<div class="sec"><h3>BUSINESSES</h3><div class="row"><select id="bizsel"><option value="">For sale…</option>'+free.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.kind)+' · '+esc(b.id)+'</option>').join('')+'</select><button class="g" data-act="biz" data-on="1">Give</button></div>'+(u.biz.length?'<div class="row">'+u.biz.map(b=>'<button class="sm r" data-act="biz" data-on="0" data-biz="'+esc(b.id)+'">Take '+esc(b.name||b.id)+'</button>').join('')+'</div>':'')+'</div>'
+'<div class="sec"><h3>ACCOUNT</h3>'+(u.status==='blocked'||u.status==='timed'?'<div class="row"><button class="g" data-act="unblock">Unblock</button></div>':'<div class="row"><input id="bh" type="number" min="0" placeholder="Hours (0 = for good)" style="max-width:170px"><input id="bw" placeholder="Reason the player sees"><button class="r" data-act="block">Block</button></div>')+'<div class="row"><button class="sm" data-act="kick">Sign out now</button></div></div>'
+'<div class="sec"><h3>MONEY TRAIL</h3><table class="log"><tbody>'+(u.ledger.map(l=>'<tr><td>'+dt(l.t)+'</td><td class="right" style="color:'+(l.d>=0?'#3fd49a':'#ff8d73')+'">'+(l.d>=0?'+':'')+N(l.d)+'</td><td class="right">'+N(l.bal)+'</td><td class="muted">'+esc(l.k||'')+'</td></tr>').join('')||'<tr><td class="muted">Nothing yet.</td></tr>')+'</tbody></table></div>'
+'<div class="sec"><h3>ADMIN HISTORY</h3><table class="log"><tbody>'+(u.logs.map(l=>'<tr><td>'+dt(l.t)+'</td><td><b>'+esc(l.a)+'</b></td><td class="muted">'+esc(l.detail||'')+'</td></tr>').join('')||'<tr><td class="muted">Nothing yet.</td></tr>')+'</tbody></table></div>';
$('#close').onclick=()=>$('#drawer').classList.remove('open')}
async function act(b){const a=b.dataset.act,body={id:U.id,a};let ask='';
if(a==='cash'){body.mode=b.dataset.mode;body.n=+$('#amt').value;if(!(body.n>=0))return toast('Type an amount.',1);ask=(body.mode==='give'?'Give ₦':body.mode==='take'?'Seize ₦':'Set pocket to ₦')+N(body.n)+' — '+U.name+'?'}
if(a==='freeze')body.on=b.dataset.on==='1';
if(a==='police'){const k=b.dataset.k;if(k==='rank'){body.rank=$('#rank').value;if(!body.rank)return toast('Pick a rank.',1)}if(k==='hire')body.cop=true;if(k==='fire')body.cop=false;if(k==='suspend'){body.suspendHours=+$('#susp').value;if(!(body.suspendHours>0))return toast('Hours?',1)}if(k==='lift')body.suspendHours=0}
if(a==='chair')body.on=b.dataset.on==='1';
if(a==='biz'){body.on=b.dataset.on==='1';body.biz=body.on?$('#bizsel').value:b.dataset.biz;if(!body.biz)return toast('Pick a business.',1)}
if(a==='block'){body.hours=+$('#bh').value||0;body.why=$('#bw').value;ask=(body.hours?'Block '+U.name+' for '+body.hours+' hours?':'Block '+U.name+' for good?')}
if(a==='kick')ask='Sign '+U.name+' out now?';
if(ask&&!confirm(ask))return;
document.querySelectorAll('#drawer button').forEach(x=>x.disabled=true);
try{const r=await api('act',{method:'POST',body:JSON.stringify(body)});U=r.user;draw();toast('Done.');users();if(!$('#home').hidden)stats()}catch(e){toast(e.message,1);draw()}}
$('#go').onclick=()=>{KEY=$('#key').value.trim();$('#key').value='';open()};$('#key').onkeydown=e=>{if(e.key==='Enter')$('#go').click()};$('#lock').onclick=lock;
document.querySelectorAll('#nav [data-v]').forEach(b=>b.onclick=()=>view(b.dataset.v));
$('#q').oninput=()=>{q=$('#q').value;page=0;users()};$('#prev').onclick=()=>{if(page>0){page--;users()}};$('#next').onclick=()=>{page++;users()};
document.querySelectorAll('th[data-s]').forEach(th=>th.onclick=()=>{sort=th.dataset.s;page=0;users()});
$('#rows').onclick=e=>{const tr=e.target.closest('tr[data-id]');if(tr)show(+tr.dataset.id)};$('#logrows').onclick=e=>{const a=e.target.closest('a[data-id]');if(a){e.preventDefault();show(+a.dataset.id)}};
$('#drawer').onclick=e=>{const b=e.target.closest('button[data-act]');if(b)act(b)};
if(KEY)open();else view('login');setInterval(()=>{if(KEY&&!$('#home').hidden)stats().catch(()=>{})},30000);
</script></body></html>`;
