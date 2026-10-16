/* ================= the guide =================
   The first time a player meets anything in the game, a short card tells them how it works:
   a welcome tour when they first walk into Lagos, a tour of the phone, and one tip the first time they
   drive, ride okada, skate, fight, get wanted, land in the cell, get a weapon, open the map, follow GPS,
   take a delivery job, visit Oga Shege, go inside, use the camera or open Gist.
   Each one shows once (kept in this browser); Settings → Tips can switch them off or show them all again.
   The words follow how you play: keys on a computer, the screen buttons on a phone.
   The game passes in `api`: state() (what is happening now), touch(), unlock(), calm(), closeSettings(), click(). */

const CSS = `
.gd{position:fixed;inset:0;z-index:90;pointer-events:none;font-family:var(--fb,system-ui)}
.gd-dim{position:fixed;inset:0;pointer-events:auto}
.gd-dim.full{background:rgba(4,5,9,.62)}
.gd-ring{position:fixed;border:3px solid #F2B705;border-radius:14px;pointer-events:none;box-sizing:border-box;transition:left .32s cubic-bezier(.2,.9,.3,1),top .32s cubic-bezier(.2,.9,.3,1),width .32s cubic-bezier(.2,.9,.3,1),height .32s cubic-bezier(.2,.9,.3,1),border-radius .32s}
.gd-ring.dim{box-shadow:0 0 18px 2px rgba(242,183,5,.55)}
.gd-shade{position:fixed;background:rgba(4,5,9,.62);pointer-events:none;transition:all .32s cubic-bezier(.2,.9,.3,1)}
.gd-ring::after{content:'';position:absolute;inset:-3px;border-radius:inherit;border:3px solid #F2B705;animation:gdPulse 1.5s ease-out infinite}
@keyframes gdPulse{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(1.35)}}
.gd-card{position:fixed;left:0;top:0;width:min(340px,calc(100vw - 24px));box-sizing:border-box;background:linear-gradient(180deg,#1d2029,#12141a);color:#F7EFDF;border:1.5px solid rgba(242,183,5,.6);border-radius:16px;padding:13px 16px 15px;box-shadow:0 18px 50px rgba(0,0,0,.6);pointer-events:auto;animation:gdIn .3s cubic-bezier(.2,.9,.3,1);-webkit-user-select:none;user-select:none}
@keyframes gdIn{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:none}}
.gd-top{display:flex;align-items:center;gap:8px;min-height:22px}
.gd-tag{font-family:var(--fd,Impact,sans-serif);font-size:11px;letter-spacing:.04em;background:#F2B705;color:#0E1014;border-radius:6px;padding:3px 7px 2px}
.gd-step{font-size:14px;color:#BDB5A6;font-weight:700}
.gd-dots{display:flex;gap:5px;margin-left:auto}.gd-dots i{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.22)}.gd-dots i.on{background:#F2B705}
.gd-card h3{font-family:var(--fd,Impact,sans-serif);font-weight:400;font-size:19px;line-height:1.1;margin:9px 0 6px;color:#F2B705}
.gd-card p{font-size:17px;line-height:1.36;margin:0 0 13px;font-weight:500}
.gd-card kbd{font-family:var(--fd,Impact,sans-serif);font-size:12px;line-height:1.35;background:#F7EFDF;color:#0E1014;border-radius:5px;padding:2px 6px 1px;box-shadow:0 2px 0 #9b927f;margin:0 1px;white-space:nowrap;display:inline-block;vertical-align:1px}
.gd-card .tb{display:inline-block;font-family:var(--fd,Impact,sans-serif);font-size:11.5px;line-height:1.35;background:#F2B705;color:#0E1014;border-radius:999px;padding:2px 8px 1px;white-space:nowrap;vertical-align:1px}
.gd-card .tg{display:inline-block;font-family:var(--fd,Impact,sans-serif);font-size:11.5px;line-height:1.35;background:rgba(12,14,18,.9);color:#F7EFDF;border:1.5px solid rgba(255,255,255,.45);border-radius:999px;padding:1px 8px 0;white-space:nowrap;vertical-align:1px}
.gd-row{display:flex;gap:8px;align-items:center}
.gd-row button{border:none;cursor:pointer;min-height:44px;border-radius:11px;font:inherit}
.gd-next{margin-left:auto;font-family:var(--fd,Impact,sans-serif)!important;font-size:15px!important;background:#F2B705;color:#0E1014;padding:10px 18px 9px}
.gd-prev{background:rgba(255,255,255,.1);color:#F7EFDF;font-weight:700!important;font-size:15px!important;padding:10px 14px}
.gd-skip{background:none!important;color:#BDB5A6;font-weight:700!important;font-size:14px!important;text-decoration:underline;padding:8px 2px!important;min-height:0!important}
.gd-bar{position:absolute;left:16px;right:16px;bottom:6px;height:3px;border-radius:2px;background:rgba(255,255,255,.12);overflow:hidden}.gd-bar i{display:block;height:100%;background:#F2B705;transform-origin:0 50%;animation:gdBar linear forwards}
@keyframes gdBar{from{transform:scaleX(1)}to{transform:scaleX(0)}}
.gd-arr{position:absolute;width:16px;height:16px;background:#1d2029;border:1.5px solid rgba(242,183,5,.6);transform:rotate(45deg);box-sizing:border-box}
.gd-keys{display:flex;align-items:flex-end;gap:14px;margin:4px 0 12px}
.gd-wasd{display:grid;grid-template-columns:repeat(3,30px);gap:4px}.gd-wasd kbd{display:grid!important;place-items:center;height:28px;padding:0!important;font-size:14px!important}.gd-wasd kbd:nth-child(1){grid-column:2;grid-row:1}.gd-wasd kbd:nth-child(2){grid-column:1;grid-row:2}.gd-wasd kbd:nth-child(3){grid-column:2;grid-row:2}.gd-wasd kbd:nth-child(4){grid-column:3;grid-row:2}
.gd-shift kbd{height:28px;display:grid!important;place-items:center;padding:0 10px!important;font-size:12px!important}
.gd-mouse{width:30px;height:44px}
.gd-ghost{position:fixed;pointer-events:none;display:grid;place-items:center;color:#fff;font-family:var(--fd,Impact,sans-serif);font-size:13px;letter-spacing:.04em;text-shadow:0 1px 4px rgba(0,0,0,.8)}
.gd-joy{width:120px;height:120px;border-radius:50%;border:2.5px solid rgba(255,255,255,.75);background:rgba(0,0,0,.25)}
.gd-joy i{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,255,255,.9);animation:gdJoy 2.4s ease-in-out infinite}
.gd-joy span,.gd-look span{position:absolute;bottom:-26px;left:50%;transform:translateX(-50%);white-space:nowrap}
@keyframes gdJoy{0%,100%{transform:none}25%{transform:translate(0,-34px)}50%{transform:translate(30px,-10px)}75%{transform:translate(-30px,-10px)}}
.gd-look{width:170px;height:70px}
.gd-look i{position:absolute;top:50%;left:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:rgba(255,255,255,.9);box-shadow:0 0 0 8px rgba(255,255,255,.2);animation:gdLook 2.4s ease-in-out infinite}
.gd-look b{position:absolute;left:0;right:0;top:50%;height:3px;margin-top:-1.5px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.8),transparent)}
@keyframes gdLook{0%,100%{transform:translateX(-60px)}50%{transform:translateX(60px)}}
@media (max-height:440px),(max-width:560px){.gd-card{width:min(300px,calc(100vw - 20px));padding:10px 13px 12px;border-radius:14px}.gd-card h3{font-size:16px;margin:6px 0 4px}.gd-card p{font-size:15px;margin-bottom:9px}.gd-row button{min-height:40px}.gd-next{font-size:14px!important;padding:8px 14px 7px}.gd-keys{margin:2px 0 8px}}
`;

/* how the words are written: [W] is a key on the keyboard, {ATTACK} a yellow screen button, <ATTACK> a dark one */
const fmt = s => s.replace(/\[([^\]]+)\]/g, '<kbd>$1</kbd>').replace(/\{([^}]+)\}/g, '<span class="tb">$1</span>').replace(/<<([^>]+)>>/g, '<span class="tg">$1</span>');

/* ---- every tip. ctx: where it may show (play = walking about in the game). when: the moment it is for.
   Tours (tour:true) darken the screen and wait for NEXT; the others are small cards that go by themselves. */
const TIPS = [
  { id: 'welcome', tour: true, ctx: 'play', when: (s, g) => s.mode === 'walk' && g.played > 2.5,
    steps: [
      { t: 'Welcome to Mushin!', vis: 'move', k: 'Walk with [W] [A] [S] [D]. Hold [Shift] to run. Move your mouse to look around.',
        m: 'Put your left thumb on the left side and drag to walk. Push far to run. Swipe on the right side to look around.', posM: 'top' },
      { t: 'The E button', k: 'When a yellow sign like this shows, press [E]. It opens doors, starts cars and okada, buys things and talks to people.',
        m: 'When the yellow {E} button shows, tap it. It opens doors, starts cars and okada, buys things and talks to people.', atK: '#prompt', atM: '#tE|#prompt' },
      { t: 'Your map', at: '#mmWrap', k: 'Click the map or press [M] to see all of Lagos. Pick any place and press SET GPS: a yellow line shows you the way.',
        m: 'Tap the map to see all of Lagos. Pick any place and tap SET GPS: a yellow line shows you the way.' },
      { t: 'Your phone', at: '#phoneBtn', k: 'Click here or press [P]. Book a ride, find work, call people, snap photos and see the Gist. A red number here means something new.',
        m: 'Tap here for your phone. Book a ride, find work, call people, snap photos and see the Gist. A red number here means something new.' },
      { t: 'Your money', at: '#cash', k: 'This is your money. Do Oya Work jobs on your phone to make more. Spend it on rides, cars, the hotel and the market.' },
      { t: 'Settings and tips', at: '#setBtn', k: 'Graphics, sound and all the keys are here. You can also see these tips again from here.',
        m: 'Graphics, sound and moving your buttons are here. You can also see these tips again from here.', last: "OYA, LET'S GO!" },
    ] },
  { id: 'phone', tour: true, ctx: 'phone', when: s => s.phoneHome,
    steps: [
      { t: 'Your apps', at: '[data-g=apps]', k: 'Oya Ride books a car or okada. Oya Work gives you jobs that pay. Maps, Photos, Wallet, Weather, and Police to call 112.' },
      { t: 'Calls, chats and Gist', at: '[data-g=dock]', k: 'Phone calls people. Messages has your texts. Gist shows wetin people dey post around you. Camera snaps photos and selfies.' },
      { t: 'Home button', at: '[data-g=home]', k: 'Inside any app, tap <<HOME>> to come back to this home screen. The white bar at the bottom of the phone does the same.', ping: true },
      { t: 'Back button', at: '[data-g=back]', k: '<<BACK>> takes you one step back inside an app, like from a chat to all your messages.' },
      { t: 'Put it away', at: '[data-g=close]', k: '<<CLOSE>> puts the phone away. [P] or [Esc] works too. No popups: when something new comes, the red number on the phone button tells you.',
        m: '<<CLOSE>> puts the phone away. No popups: when something new comes, the red number on the phone button tells you.', last: 'GOT IT' },
    ] },
  { id: 'camera', ctx: 'cam', at: '[data-g=shutter]', t: 'Camera', k: 'Click the big circle or press [Enter] to snap. SELFIE turns the camera to face you. You can still walk while you aim. [Esc] closes.',
    m: 'Tap the big circle to snap. SELFIE turns the camera to face you. You can still walk with your left thumb. ✕ closes.' },
  { id: 'gist', ctx: 'phone', at: '[data-g=gisttabs]', t: 'Gist', k: 'For you: wetin people dey post. Around you: wetin dey happen near you now. My profile: your own posts. Tap + to post your photo.' },
  { id: 'map', ctx: 'map', when: s => s.map, pos: 'top', t: 'The big map', k: 'Drag to move, scroll to zoom. Click any place, then SET GPS: a yellow line on the road shows you the way. [M] or [Esc] closes.',
    m: 'Drag to move, pinch to zoom. Tap any place, then SET GPS: a yellow line on the road shows you the way.' },
  { id: 'jail', ctx: 'play', when: s => s.jail, at: '#jailBox', t: 'Police cell', k: 'Wait for the time to finish and they go release you. Next time, run before they catch you!' },
  { id: 'wanted', ctx: 'play', when: s => s.stars > 0, at: '#stars', t: 'Police dey find you!', k: 'The stars show how hard police dey look for you. Run far, hide, and stay out of their sight until the stars go. If they catch you, na cell.' },
  { id: 'fight', ctx: 'play', when: s => s.foe, atM: '#tPunch', t: 'Fight!',
    k: '[J] or click: punch (jab, cross, jab…). [K] or right click: kick. [L] or [Q]: dodge. [G]: slam him down. Running in, [J] is a takedown.',
    m: 'Tap <<ATTACK>> again and again: jab, cross, kick. <<JUMP>> dodges. <<GRAB>> slams him down.' },
  { id: 'drive', ctx: 'play', when: s => s.veh && s.veh !== 'skate' && !s.ride, atM: '#tBrake', t: s => s.veh === 'okada' ? 'Riding okada' : 'Driving',
    k: 'Hold [W] to go, [S] to slow down or reverse, [A] [D] to turn. [Space] brakes hard, [H] blows the horn. Stop, then press [E] to come down.',
    m: 'Drag the left side: up to go, down to slow or reverse, left and right to turn. {BRAKE} stops hard, <<HORN>> clears the road. Stop, then tap {E} to come down.' },
  { id: 'skate', ctx: 'play', when: s => s.veh === 'skate', atM: '#tSk2', t: 'Skateboard',
    k: 'Push with [W] ([Shift] pushes harder), [S] brakes, [A] [D] carve. [Space] = OLLIE. Tricks: [J] kickflip, [K] heelflip, [L] shove-it (on the ground they jump for you). Hold [Space] in the air to grab the board. Land clean to score.',
    m: 'Drag the left side to push and carve. <<OLLIE>> jumps. <<FLIP>> and <<SPIN>> do tricks (they jump for you). Hold <<OLLIE>> in the air to grab the board. Land clean to score.' },
  { id: 'board', ctx: 'play', when: s => s.board && s.mode === 'walk', at: '#weap', atM: '#tPunch|#weap', t: 'Your skateboard',
    k: 'You dey carry your board. Press [E] or [J] to put it down and ride. [1]–[6] or [Tab] changes what you hold.',
    m: 'You dey carry your board. Tap <<RIDE>> to put it down and ride. Tap the name under your money to change what you hold.' },
  { id: 'ride', ctx: 'play', when: s => s.ride, t: 'Your ride', k: 'Sit back, the driver go carry you reach. When the car stops, press [E] to come down anywhere.',
    m: 'Sit back, the driver go carry you reach. When the car stops, tap {E} to come down anywhere.' },
  { id: 'job', ctx: 'play', also: ['gps'], when: s => s.job, at: '#job', t: 'Delivery job', k: 'Follow the yellow line to the PICK UP ring and collect the load. Then carry am to the green DROP OFF ring before the time finish. Late = small pay.' },
  { id: 'gps', ctx: 'play', when: s => s.dest && s.mode !== 'interior', at: '#mmWrap', t: 'Follow the line', k: 'Follow the yellow line on your small map. When you reach, it clears by itself.' },
  { id: 'weapon', ctx: 'play', when: s => s.armed && s.mode === 'walk', at: '#weap', t: 'You get weapon',
    k: 'Press [1]–[6] or [Tab] (or click here) to change. Hold right mouse to aim, click to fire or throw, [R] reloads. [G] with a weapon robs the person in front of you.',
    m: 'Tap here to change weapon. <<GRAB>> aims and robs, <<ATTACK>> fires or throws.' },
  { id: 'shop', ctx: 'shop', when: s => s.shop, pos: 'top', t: 'Oga Shege', k: 'He sells weapons. Buy what you fit afford, then change weapon with [1]–[6] or [Tab].',
    m: 'He sells weapons. Buy what you fit afford, then tap the weapon name under your money to change.' },
  { id: 'inside', ctx: 'play', when: s => s.mode === 'interior' && !s.jail, t: 'Inside', k: 'Walk to things and press [E] when the sign shows: bed, TV, kitchen, wardrobe and more. Go back to the door and press [E] to go outside.',
    m: 'Walk to things and tap {E} when it shows: bed, TV, kitchen, wardrobe and more. Go back to the door and tap {E} to go outside.' },
  { id: 'moves', ctx: 'play', when: (s, g) => s.mode === 'walk' && g.sinceWelcome > 50, atM: '#tJump', t: 'More moves',
    k: '[Space] jumps, [X] crouches (and [X] again stands), [X] while running slides. The mouse [Wheel] brings the camera closer or farther.',
    m: '<<JUMP>> jumps, <<CROUCH>> crouches, and <<CROUCH>> while running slides. Settings → Phone buttons lets you move them.' },
];

export function createGuide(api) {
  { const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); }
  const KEY = 'naija-guide';
  const D = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })(); D.seen = D.seen || {};
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { } };
  const el = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };
  const root = el('div', 'gd'); root.hidden = true; document.body.append(root);
  const G = { played: 0, sinceWelcome: -1, cur: null, step: 0, shownT: 0, gap: 0, pend: [], evalT: 0, ctx: 'off' };
  const byId = id => TIPS.find(t => t.id === id);
  const seen = id => !!D.seen[id];
  const mark = id => { D.seen[id] = 1; const t = byId(id); if (t && t.also) for (const a of t.also) D.seen[a] = 1; save(); };

  // ---- the parts on screen
  const dim = el('div', 'gd-dim'), ring = el('div', 'gd-ring'), card = el('div', 'gd-card'), shades = [0, 1, 2, 3].map(() => el('div', 'gd-shade'));
  // the dark around the thing being shown: four plain boxes around a hole (cheap for any phone)
  function shade(r) { const [a, b, c, d] = shades; if (!r) { for (const x of shades) x.hidden = true; return; } for (const x of shades) x.hidden = false;
    const W = innerWidth, H = innerHeight, L = Math.max(0, r.left), T = Math.max(0, r.top), R2 = Math.min(W, r.right), B = Math.min(H, r.bottom);
    Object.assign(a.style, { left: 0, top: 0, width: W + 'px', height: T + 'px' }); Object.assign(b.style, { left: 0, top: B + 'px', width: W + 'px', height: Math.max(0, H - B) + 'px' });
    Object.assign(c.style, { left: 0, top: T + 'px', width: L + 'px', height: Math.max(0, B - T) + 'px' }); Object.assign(d.style, { left: R2 + 'px', top: T + 'px', width: Math.max(0, W - R2) + 'px', height: Math.max(0, B - T) + 'px' }); }
  let ghosts = [];
  dim.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); });
  card.addEventListener('pointerdown', e => e.stopPropagation());

  function ctxNow(s) { if (!s.on) return 'off'; if (s.cam) return 'cam'; if (s.map) return 'map'; if (s.shop) return 'shop'; if (s.phone) return 'phone'; if (s.panel) return 'panel'; return 'play'; }
  const touch = () => !!api.touch();
  function stepsOf(tip) { return tip.steps || [tip]; }
  function textOf(st) { return fmt(touch() ? (st.m || st.k) : st.k); }
  function targetOf(st) {
    const sel = touch() ? (st.atM || st.at) : (st.atK || st.at); if (!sel) return null;
    if (sel.startsWith('ghost:')) return ghosts.find(g => g.dataset.k === sel.slice(6)) || null;
    for (const one of sel.split('|')) { const e = document.querySelector(one); if (e && visible(e)) return e; }
    return null;
  }
  function visible(e) { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) return false;
    const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > .05; }

  function makeGhosts(st) {
    for (const g of ghosts) g.remove(); ghosts = [];
    if (st.vis === 'move' && touch()) {
      const j = el('div', 'gd-ghost gd-joy', '<i></i><span>WALK</span>'); j.dataset.k = 'joy'; j.style.left = (Math.max(80, innerWidth * .16)) + 'px'; j.style.top = (innerHeight * .64) + 'px'; j.style.transform = 'translate(-50%,-50%)';
      const l = el('div', 'gd-ghost gd-look', '<b></b><i></i><span>LOOK</span>'); l.dataset.k = 'look'; l.style.left = (innerWidth * .66) + 'px'; l.style.top = (innerHeight * .74) + 'px'; l.style.transform = 'translate(-50%,-50%)';
      ghosts.push(j, l); root.append(j, l);
    }
  }

  function render() {
    const tip = G.cur, S = stepsOf(tip), st = S[G.step], n = S.length, tour = !!tip.tour; G.wasTouch = touch();
    makeGhosts(st);
    const title = typeof st.t === 'function' ? st.t(api.state()) : st.t;
    card.innerHTML = '';
    const top = el('div', 'gd-top'); top.append(el('span', 'gd-tag', tour ? (tip.id === 'welcome' ? 'HOW TO PLAY' : 'YOUR PHONE') : 'TIP'));
    if (n > 1) { top.append(el('span', 'gd-step', `${G.step + 1} / ${n}`)); const dots = el('div', 'gd-dots'); for (let i = 0; i < n; i++) dots.append(el('i', i === G.step ? 'on' : '')); top.append(dots); }
    card.append(top, el('h3', null, title));
    if (st.vis === 'move' && !touch()) card.append(el('div', 'gd-keys', '<div class="gd-wasd"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div><div class="gd-shift"><kbd>SHIFT</kbd></div><svg class="gd-mouse" viewBox="0 0 30 44" fill="none" stroke="#F7EFDF" stroke-width="2.2"><rect x="2" y="2" width="26" height="40" rx="13"/><path d="M15 2v14"/><rect x="13" y="8" width="4" height="7" rx="2" fill="#F2B705" stroke="none"/></svg>'));
    card.append(el('p', null, textOf(st)));
    const row = el('div', 'gd-row');
    if (tour) {
      const skip = el('button', 'gd-skip', 'Skip'); skip.type = 'button'; skip.onclick = () => finish(true); row.append(skip);
      if (G.step > 0) { const pv = el('button', 'gd-prev', 'Back'); pv.type = 'button'; pv.onclick = () => go(-1); row.append(pv); }
      const nx = el('button', 'gd-next', G.step === n - 1 ? (st.last || 'GOT IT') : 'NEXT'); nx.type = 'button'; nx.onclick = () => go(1); row.append(nx);
    } else {
      const ok = el('button', 'gd-next', 'GOT IT'); ok.type = 'button'; ok.onclick = () => finish(); row.append(ok);
      const dur = tipDur(st); const bar = el('div', 'gd-bar'); const bi = el('i'); bi.style.animationDuration = dur + 's'; bar.append(bi); card.append(bar); G.dur = dur;
    }
    card.append(row);
    card.append(G.arr = el('i', 'gd-arr'));
    ring.className = 'gd-ring' + (tour ? ' dim' : '');
    document.querySelectorAll('.iph-sb.ping').forEach(b => b.classList.remove('ping'));
    if (st.ping) { const b = document.querySelector('[data-g=home]'); if (b) b.classList.add('ping'); }
    card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    G.target = null; layout(true);
  }
  const tipDur = st => Math.max(9, Math.min(16, textOf(st).replace(/<[^>]+>/g, '').split(/\s+/).length * .42));

  function layout(first) {
    const tip = G.cur; if (!tip) return; const st = stepsOf(tip)[G.step], tour = !!tip.tour;
    const tg = targetOf(st); G.target = tg;
    const W = innerWidth, H = innerHeight, m = 10, gap = 16, cw = card.offsetWidth, ch = card.offsetHeight;
    dim.className = 'gd-dim' + (tour && !tg ? ' full' : ''); dim.hidden = !tour;
    if (!tg) {
      ring.hidden = true; G.arr.hidden = true; shade(null);
      const tst = document.getElementById('toast'), tb = !tour && tst && !tst.hidden && tst.offsetParent !== null ? tst.getBoundingClientRect().bottom + 12 : 0;   // stay clear of a message on screen
      const pos = (touch() && st.posM) || st.pos || tip.pos, y = Math.max(tb, pos === 'top' ? (tour ? 12 : Math.min(78, H * .16)) : tour ? (H - ch) / 2 : Math.max(70, H * .2));
      card.style.transition = first ? 'none' : 'top .3s ease, left .3s ease';
      card.style.left = Math.round((W - cw) / 2) + 'px'; card.style.top = Math.round(Math.max(m, Math.min(H - ch - m, y))) + 'px'; return;
    }
    const r0 = tg.getBoundingClientRect(), pad = 6, r = { left: r0.left - pad, top: r0.top - pad, right: r0.right + pad, bottom: r0.bottom + pad };
    r.w = r.right - r.left; r.h = r.bottom - r.top;
    shade(tour ? r : null); for (const x of shades) x.style.transition = first ? 'none' : '';
    ring.hidden = false; Object.assign(ring.style, { left: r.left + 'px', top: r.top + 'px', width: r.w + 'px', height: r.h + 'px', borderRadius: (Math.abs(r.w - r.h) < 8 && r.w < 140) ? '50%' : '16px' });
    const space = { bottom: H - r.bottom - gap - m - ch, top: r.top - gap - m - ch, left: r.left - gap - m - cw, right: W - r.right - gap - m - cw };
    const side = ['bottom', 'top', 'left', 'right'].sort((a, b) => space[b] - space[a])[0];   // the side with the most room
    const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2; let x, y;
    if (side === 'bottom' || side === 'top') { x = cx - cw / 2; y = side === 'bottom' ? r.bottom + gap : r.top - gap - ch; }
    else { y = cy - ch / 2; x = side === 'right' ? r.right + gap : r.left - gap - cw; }
    x = Math.max(m, Math.min(W - cw - m, x)); y = Math.max(m, Math.min(H - ch - m, y));
    card.style.transition = first ? 'none' : 'top .3s ease, left .3s ease'; card.style.left = Math.round(x) + 'px'; card.style.top = Math.round(y) + 'px';
    const a = G.arr; a.hidden = false; a.style.left = a.style.top = a.style.right = a.style.bottom = '';
    const bd = '1.5px solid rgba(242,183,5,.6)'; a.style.borderTop = a.style.borderLeft = a.style.borderRight = a.style.borderBottom = bd;
    if (side === 'bottom') { a.style.top = '-9px'; a.style.left = Math.max(14, Math.min(cw - 30, cx - x - 8)) + 'px'; a.style.borderRight = a.style.borderBottom = 'none'; }
    else if (side === 'top') { a.style.bottom = '-9px'; a.style.left = Math.max(14, Math.min(cw - 30, cx - x - 8)) + 'px'; a.style.borderLeft = a.style.borderTop = 'none'; }
    else if (side === 'right') { a.style.left = '-9px'; a.style.top = Math.max(14, Math.min(ch - 30, cy - y - 8)) + 'px'; a.style.borderTop = a.style.borderRight = 'none'; }
    else { a.style.right = '-9px'; a.style.top = Math.max(14, Math.min(ch - 30, cy - y - 8)) + 'px'; a.style.borderBottom = a.style.borderLeft = 'none'; }
    if (first) { ring.style.transition = 'none'; void ring.offsetWidth; ring.style.transition = ''; }
  }

  function show(tip) {
    G.cur = tip; G.step = G.resume && G.resume.id === tip.id ? G.resume.step : 0; G.resume = null; G.shownT = 0;
    root.hidden = false; root.textContent = ''; root.append(dim, ...shades, ring, card); render();
    if (tip.tour) { api.unlock && api.unlock(); api.calm && api.calm(); }
  }
  function hide() { G.cur = null; root.hidden = true; for (const g of ghosts) g.remove(); ghosts = []; document.querySelectorAll('.iph-sb.ping').forEach(b => b.classList.remove('ping')); G.gap = 2.2; }
  function go(d) { api.click && api.click(); const n = stepsOf(G.cur).length; G.step += d; if (G.step < 0) G.step = 0; if (G.step >= n) { finish(); return; } render(); }
  function finish(skipAll) { const tip = G.cur; if (!tip) return; mark(tip.id); if (tip.id === 'welcome') G.sinceWelcome = 0;
    if (skipAll && tip.id === 'welcome') { /* skipping the welcome only skips the tour; the small tips still come when they are needed */ }
    hide(); }
  // the tour waits for its own keys: Enter / Space / → next, ← back, Esc skips; nothing reaches the game meanwhile
  addEventListener('keydown', e => { if (!G.cur || !G.cur.tour) return; if (e.target && e.target.tagName === 'INPUT') return;
    const k = e.key; e.stopImmediatePropagation(); e.preventDefault(); if (e.repeat) return;
    if (k === 'Enter' || k === ' ' || k === 'ArrowRight') go(1); else if (k === 'ArrowLeft' || k === 'Backspace') go(-1); else if (k === 'Escape') finish(true); }, true);
  addEventListener('resize', () => { if (G.cur) { makeGhosts(stepsOf(G.cur)[G.step]); layout(true); } });

  // ---- every frame: watch the game, start the next tip when its moment comes, keep the card on its target
  function update(dt) {
    if (D.off) { if (G.cur) hide(); return; }
    const now = performance.now(); dt = Math.min(1, (now - (G.last || now)) / 1000); G.last = now;   // real seconds, whatever the game's clock does
    const s = api.state(); if (!s) return; const ctx = ctxNow(s); G.ctx = ctx;
    if (G.sinceWelcome < 0 && seen('welcome') && !G.cur) G.sinceWelcome = 0;
    if (s.on && ctx === 'play') { G.played += dt; if (G.sinceWelcome >= 0) G.sinceWelcome += dt; }
    if (G.cur) {
      const tip = G.cur;
      if (tip.ctx !== ctx || (tip.id === 'phone' && !s.phone)) {   // the moment passed (map closed, phone put away…): come back to it later
        if (!tip.tour && G.shownT > 3) mark(tip.id); else if (tip.tour) G.resume = { id: tip.id, step: G.step };
        hide(); return; }
      G.shownT += dt; if (!tip.tour && G.shownT > G.dur) { mark(tip.id); hide(); return; }
      if (touch() !== G.wasTouch) render();   // a tablet that was just touched: switch the words to the screen buttons
      layout(false); return;
    }
    if (G.gap > 0) { G.gap -= dt; return; }
    G.evalT -= dt; if (G.evalT > 0) return; G.evalT = .25;
    for (const p of G.pend) p.age += .25; G.pend = G.pend.filter(p => p.age < 25 && !seen(p.id));
    for (const tip of TIPS) { if (seen(tip.id) || !tip.when || G.pend.some(p => p.id === tip.id)) continue; if (tip.id !== 'welcome' && !seen('welcome') && tip.ctx === 'play') continue;
      if (tip.ctx === ctx && tip.when(s, G)) G.pend.push({ id: tip.id, age: 0 }); }
    const next = G.pend.find(p => { const t = byId(p.id); return t.ctx === ctx && (!t.when || t.when(s, G) || !t.tour); });
    if (next) { G.pend = G.pend.filter(p => p !== next); show(byId(next.id)); }
  }
  // the phone and camera call this the first time they open something
  function hit(id) { if (D.off || seen(id) || G.pend.some(p => p.id === id) || (G.cur && G.cur.id === id)) return; G.pend.push({ id, age: 0 }); }

  // ---- Settings → Tips
  function wire() {
    const seg = document.getElementById('tipsSeg'), again = document.getElementById('tipsAgain');
    const paint = () => { if (seg) for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String((b.dataset.t === 'off') === !!D.off)); };
    if (seg) for (const b of seg.querySelectorAll('button')) b.addEventListener('click', () => { D.off = b.dataset.t === 'off'; save(); paint(); });
    if (again) again.addEventListener('click', () => { D.seen = {}; D.off = false; save(); paint(); G.pend = []; G.sinceWelcome = -1; G.played = 3; G.gap = .4; api.closeSettings && api.closeSettings(); });
    paint();
  }
  wire();

  function test(cmd) {
    if (cmd === 'reset') { D.seen = {}; D.off = false; save(); G.pend = []; G.sinceWelcome = -1; return 1; }
    if (cmd === 'next') { if (G.cur) go(1); return G.cur ? `${G.cur.id}:${G.step}` : 'none'; }
    if (cmd === 'done') { if (G.cur) finish(); return 1; }
    if (cmd === 'skip') { for (const t of TIPS) D.seen[t.id] = 1; save(); if (G.cur) hide(); return 1; }
    if (cmd && cmd.startsWith('unsee:')) { for (const id of cmd.slice(6).split(',')) delete D.seen[id]; save(); return 1; }
    if (cmd === 'cur') return G.cur ? `${G.cur.id}:${G.step}` : 'none';
    if (cmd && cmd.startsWith('show:')) { const t = byId(cmd.slice(5)); if (t) { delete D.seen[t.id]; show(t); } return t ? 1 : 0; }
    if (cmd && cmd.startsWith('step:')) { if (G.cur) { G.step = +cmd.slice(5); render(); } return 1; }
    return JSON.stringify({ cur: G.cur && G.cur.id, step: G.step, ctx: G.ctx, gap: G.gap, ev: G.evalT, last: Math.round(performance.now() - (G.last || 0)), pend: G.pend.map(p => p.id), seen: Object.keys(D.seen) });
  }
  return { update, hit, test, busy: () => !!(G.cur && G.cur.tour), isOn: () => !D.off };
}
