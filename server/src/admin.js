// The owner's page: /admin on the game server. Who signed up, who is online, money, bans.
// Locked with ADMIN_TOKEN (a Fly secret). Without it the page does not exist.
import crypto from 'node:crypto';
import { Limits } from './auth.js';

const tries = new Limits(10, 10 / 900);   // 10 wrong keys per 15 minutes from one address

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
    list: q(`SELECT id, name, email, created, seen, cash, banned FROM users WHERE (? = '' OR lname LIKE ?) ORDER BY id DESC LIMIT ? OFFSET ?`),
    listSeen: q(`SELECT id, name, email, created, seen, cash, banned FROM users WHERE (? = '' OR lname LIKE ?) ORDER BY seen DESC LIMIT ? OFFSET ?`),
    listCash: q(`SELECT id, name, email, created, seen, cash, banned FROM users WHERE (? = '' OR lname LIKE ?) ORDER BY cash DESC LIMIT ? OFFSET ?`),
    n: q(`SELECT COUNT(*) n FROM users WHERE (? = '' OR lname LIKE ?)`),
    total: q('SELECT COUNT(*) n FROM users'),
    since: q('SELECT COUNT(*) n FROM users WHERE created >= ?'),
    active: q('SELECT COUNT(*) n FROM users WHERE seen >= ?'),
    banned: q('SELECT COUNT(*) n FROM users WHERE banned = 1'),
    setBan: q('UPDATE users SET banned=? WHERE id=?'),
    byDay: q(`SELECT date(created/1000, 'unixepoch') d, COUNT(*) n FROM users WHERE created >= ? GROUP BY d ORDER BY d`),
    biz: q('SELECT b.kind, b.name, b.till, u.name owner FROM biz b JOIN users u ON u.id = b.owner WHERE b.owner = ?'),
  };

  function json(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }); res.end(JSON.stringify(body)); }
  function readBody(req) { return new Promise(r => { let s = ''; req.on('data', d => { s += d; if (s.length > 4096) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(s || '{}')); } catch (e) { r({}); } }); }); }

  async function api(req, res, url, ip) {
    if (!okKey(req.headers.authorization)) {
      if (!tries.take(ip)) return json(res, 429, { e: 'Too many tries. Wait 15 minutes.' });
      return json(res, 401, { e: 'Wrong key.' });
    }
    const t = Date.now(), p = url.pathname.slice('/admin/api/'.length);
    if (p === 'stats') {
      return json(res, 200, {
        total: S.total.get().n, online: world.online, banned: S.banned.get().n,
        newToday: S.since.get(t - 864e5).n, new7: S.since.get(t - 7 * 864e5).n,
        active1: S.active.get(t - 864e5).n, active7: S.active.get(t - 7 * 864e5).n, active30: S.active.get(t - 30 * 864e5).n,
        byDay: S.byDay.all(t - 30 * 864e5),
      });
    }
    if (p === 'users') {
      const s = String(url.searchParams.get('q') || '').toLowerCase().replace(/[%_]/g, ''), like = '%' + s + '%';
      const page = Math.max(0, +url.searchParams.get('page') || 0), per = 50;
      const sort = url.searchParams.get('sort'); const st = sort === 'seen' ? S.listSeen : sort === 'cash' ? S.listCash : S.list;
      const rows = st.all(s, like, per, page * per).map(u => ({ ...u, online: world.isOnline(u.id) }));
      return json(res, 200, { n: S.n.get(s, like).n, page, per, rows });
    }
    if (p === 'user' && req.method === 'GET') {
      const id = +url.searchParams.get('id'); const u = db.userById(id); if (!u) return json(res, 404, { e: 'No such player.' });
      const { salt, hash, ...pub } = u;
      return json(res, 200, { ...pub, online: world.isOnline(id), biz: S.biz.all(id), life: db.lifeGet(id) });
    }
    if (p === 'ban' && req.method === 'POST') {
      const b = await readBody(req); const id = +b.id | 0, on = b.banned ? 1 : 0;
      if (!db.userById(id)) return json(res, 404, { e: 'No such player.' });
      S.setBan.run(on, id); if (on) { db.dropSessions(id); world.kick(id, 'Your account has been blocked.'); }
      log('admin', on ? 'ban' : 'unban', id);
      return json(res, 200, { ok: 1 });
    }
    json(res, 404, { e: 'Unknown.' });
  }

  function handle(req, res, url, ip) {
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:" });
      res.end(PAGE); return true;
    }
    if (url.pathname.startsWith('/admin/api/')) { api(req, res, url, ip).catch(e => { log('admin error', e); json(res, 500, { e: 'Error.' }); }); return true; }
    return false;
  }
  return { handle };
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Naija Streets · Admin</title>
<style>
:root{color-scheme:dark}body{margin:0;background:#0E1014;color:#F7EFDF;font:15px/1.4 system-ui,sans-serif}
header{display:flex;gap:16px;align-items:center;padding:14px 18px;border-bottom:1px solid #2a2d33}h1{font-size:18px;margin:0;color:#F2B705}
main{padding:18px;max-width:1100px;margin:0 auto}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:18px}
.card{background:#171a20;border:1px solid #2a2d33;border-radius:10px;padding:12px}.card b{display:block;font-size:24px;color:#F2B705}.card span{color:#BDB5A6;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #22252b;white-space:nowrap}th{color:#BDB5A6;font-weight:600;cursor:pointer}
.on{color:#16A06B}.ban{color:#D0573E}button{font:inherit;border:0;border-radius:8px;padding:6px 10px;cursor:pointer;background:#2a2d33;color:#F7EFDF}button.red{background:#D0573E;color:#fff}
input{font:inherit;background:#171a20;color:#F7EFDF;border:1px solid #2a2d33;border-radius:8px;padding:8px 10px}
#login{display:flex;flex-direction:column;gap:10px;max-width:320px;margin:80px auto}.muted{color:#BDB5A6}.bar{display:flex;gap:10px;align-items:center;margin:10px 0}
.chart{display:flex;align-items:flex-end;gap:2px;height:60px;margin:6px 0 14px}.chart i{flex:1;background:#16A06B;min-height:1px}
</style></head><body>
<header><h1>NAIJA STREETS · ADMIN</h1><span class="muted" id="who"></span><span style="flex:1"></span><button id="out" hidden>Lock</button></header>
<main>
<div id="login"><label>Admin key<br><input id="key" type="password" autocomplete="current-password" style="width:100%"></label><button id="go">Open</button><div id="lerr" class="ban"></div></div>
<div id="app" hidden>
<div class="cards" id="cards"></div>
<div class="muted">New players, last 30 days</div><div class="chart" id="chart"></div>
<div class="bar"><input id="q" placeholder="Search username"><span class="muted" id="count"></span><span style="flex:1"></span><button id="prev">‹</button><span id="pg"></span><button id="next">›</button></div>
<table><thead><tr><th data-s="id">#</th><th>Name</th><th>Email</th><th data-s="id">Joined</th><th data-s="seen">Last seen</th><th data-s="cash">₦</th><th>Status</th><th></th></tr></thead><tbody id="rows"></tbody></table>
</div></main>
<script>
const $=s=>document.querySelector(s);let KEY=null,page=0,sort='id',q='';
try{KEY=sessionStorage.getItem('nsAdminKey')}catch(e){}
const api=async(p,o={})=>{const r=await fetch('/admin/api/'+p,{...o,headers:{Authorization:'Bearer '+KEY,'Content-Type':'application/json',...(o.headers||{})}});const j=await r.json();if(r.status===401){lock();throw new Error(j.e)}if(!r.ok)throw new Error(j.e||r.status);return j};
const ago=t=>{if(!t)return'—';const d=Date.now()-t;if(d<6e4)return'now';if(d<36e5)return Math.floor(d/6e4)+' min';if(d<864e5)return Math.floor(d/36e5)+' h';return Math.floor(d/864e5)+' d'};
const date=t=>new Date(t).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'});
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function lock(){KEY=null;try{sessionStorage.removeItem('nsAdminKey')}catch(e){}$('#app').hidden=true;$('#login').hidden=false;$('#out').hidden=true}
async function open(){try{await stats();await users();$('#login').hidden=true;$('#app').hidden=false;$('#out').hidden=false;try{sessionStorage.setItem('nsAdminKey',KEY)}catch(e){}}catch(e){$('#lerr').textContent=e.message;KEY=null}}
async function stats(){const s=await api('stats');$('#cards').innerHTML=[['Players',s.total],['Online now',s.online],['New today',s.newToday],['New, 7 days',s.new7],['Active today',s.active1],['Active, 7 days',s.active7],['Active, 30 days',s.active30],['Blocked',s.banned]].map(([k,v])=>'<div class="card"><b>'+v+'</b><span>'+k+'</span></div>').join('');
const m=Math.max(1,...s.byDay.map(d=>d.n));const days=[];for(let i=29;i>=0;i--){const d=new Date(Date.now()-i*864e5).toISOString().slice(0,10);const f=s.byDay.find(x=>x.d===d);days.push(f?f.n:0)}$('#chart').innerHTML=days.map(n=>'<i style="height:'+(n/m*100)+'%" title="'+n+'"></i>').join('')}
async function users(){const u=await api('users?q='+encodeURIComponent(q)+'&page='+page+'&sort='+sort);$('#count').textContent=u.n+' players';$('#pg').textContent=(u.page+1)+' / '+Math.max(1,Math.ceil(u.n/u.per));
$('#rows').innerHTML=u.rows.map(r=>'<tr><td class="muted">'+r.id+'</td><td><b>'+esc(r.name)+'</b></td><td class="muted">'+esc(r.email||'')+'</td><td>'+date(r.created)+'</td><td>'+ago(r.seen)+'</td><td>'+Number(r.cash).toLocaleString('en-NG')+'</td><td>'+(r.banned?'<span class="ban">blocked</span>':r.online?'<span class="on">● online</span>':'<span class="muted">offline</span>')+'</td><td><button data-id="'+r.id+'" data-b="'+(r.banned?0:1)+'" class="'+(r.banned?'':'red')+'">'+(r.banned?'Unblock':'Block')+'</button></td></tr>').join('')||'<tr><td colspan="8" class="muted">Nobody yet.</td></tr>'}
$('#go').onclick=()=>{KEY=$('#key').value.trim();$('#key').value='';open()};$('#key').onkeydown=e=>{if(e.key==='Enter')$('#go').click()};$('#out').onclick=lock;
$('#q').oninput=()=>{q=$('#q').value;page=0;users()};$('#prev').onclick=()=>{if(page>0){page--;users()}};$('#next').onclick=()=>{page++;users()};
document.querySelectorAll('th[data-s]').forEach(th=>th.onclick=()=>{sort=th.dataset.s;page=0;users()});
$('#rows').onclick=async e=>{const b=e.target.closest('button');if(!b)return;const on=b.dataset.b==='1';if(on&&!confirm('Block this player? They will be signed out and cannot sign in again until unblocked.'))return;b.disabled=true;try{await api('ban',{method:'POST',body:JSON.stringify({id:+b.dataset.id,banned:on})});await users();await stats()}catch(err){alert(err.message);b.disabled=false}};
if(KEY)open();setInterval(()=>{if(KEY&&!$('#app').hidden)stats().catch(()=>{})},30000);
</script></body></html>`;
