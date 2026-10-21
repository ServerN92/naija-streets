/* ================= your phone =================
   A smartphone in your hand: home screen with widgets and apps, like a real one.
   Apps: Phone (contacts, keypad, calls — 112 brings the police), Messages, Gist (the Lagos social feed: what people
   post and what is happening around you), Camera (photos and selfies of the game), Photos, Oya Ride, Oya Work, Maps,
   Wallet, Weather, Settings. The game passes in `api` (its own functions); this file only draws and runs the phone. */

const CSS = `
.iph-wrap{position:absolute;right:calc(14px + var(--sr));bottom:calc(10px + var(--sb));z-index:7;pointer-events:auto;display:flex;align-items:flex-start;gap:10px}
/* the buttons beside the phone: Close, Home, Back. Big, round and named, so nobody has to guess */
.iph-side{display:flex;flex-direction:column;align-items:center;gap:12px;padding-top:4px;min-width:60px;margin-right:4px}
.iph-sb{display:flex;flex-direction:column;align-items:center;gap:5px;border:none;background:none;padding:0;color:#fff;cursor:pointer;font-family:var(--fb,system-ui);font-weight:700;font-size:13px;line-height:1;letter-spacing:.03em;text-transform:uppercase;text-shadow:0 1px 3px rgba(0,0,0,.9)}
.iph-sb i{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:rgba(12,14,18,.8);border:1.5px solid rgba(255,255,255,.28);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 4px 14px rgba(0,0,0,.4);transition:transform .12s,opacity .2s}
.iph-sb svg{width:22px;height:22px}
.iph-sb.home i{background:#fff;color:#0e1014;border-color:#fff}
.iph-sb:active i{transform:scale(.88)}
.iph-sb:disabled{opacity:.32;cursor:default}
.iph-sb.home.ping i{animation:sbPing 1.3s ease-out 3}
@keyframes sbPing{0%{box-shadow:0 0 0 0 rgba(255,255,255,.75)}100%{box-shadow:0 0 0 18px rgba(255,255,255,0)}}
@media (max-height:440px){.iph-side{gap:8px;padding-top:0}.iph-sb i{width:42px;height:42px}.iph-sb{font-size:11px;gap:3px}}
/* what the phone itself says when you do something (no popups from outside) */
.iph-hud{position:absolute;left:50%;bottom:15cqw;transform:translateX(-50%);z-index:70;background:rgba(36,36,42,.94);color:#fff;font-size:3.6cqw;font-weight:600;padding:2.2cqw 4.4cqw;border-radius:6cqw;white-space:nowrap;max-width:86%;overflow:hidden;text-overflow:ellipsis;pointer-events:none;animation:hudIn .22s ease-out;box-shadow:0 2cqw 5cqw rgba(0,0,0,.4)}
@keyframes hudIn{from{opacity:0;transform:translate(-50%,40%)}to{opacity:1;transform:translateX(-50%)}}
.iph{--w:clamp(236px,calc((100vh - 70px - var(--st) - var(--sb)) * .465),320px);width:var(--w);height:min(calc(var(--w) * 2.16),calc(100vh - 24px - var(--st) - var(--sb)));
  border-radius:calc(var(--w) * .165);background:#08080a;padding:calc(var(--w) * .03);box-sizing:border-box;container-type:inline-size;position:relative;
  box-shadow:0 0 0 1.5px #4a4d55,0 0 0 4px #17181c,0 0 0 5px #2b2d33,0 26px 60px rgba(0,0,0,.65);transform-origin:100% 100%;animation:iphUp .32s cubic-bezier(.2,.9,.25,1)}
@keyframes iphUp{from{transform:translateY(40%) scale(.92);opacity:0}to{transform:none;opacity:1}}
.iph::before{content:'';position:absolute;right:-6px;top:22%;width:3px;height:12%;border-radius:2px;background:#2b2d33}
.iph::after{content:'';position:absolute;left:-6px;top:18%;width:3px;height:7%;border-radius:2px;background:#2b2d33;box-shadow:0 calc(var(--w) * .2) 0 #2b2d33}
.iph-scr{position:relative;width:100%;height:100%;border-radius:calc(var(--w) * .135);overflow:hidden;background:#000;color:#fff;
  font-family:-apple-system,'SF Pro Text','Segoe UI',Roboto,'Helvetica Neue',system-ui,sans-serif;font-size:max(10.5px,4.3cqw);line-height:1.3;-webkit-user-select:none;user-select:none}
:where(.iph-scr) button{font-family:inherit;color:inherit;border:none;background:none;padding:0;cursor:pointer}
.iph-wall{position:absolute;inset:0;background-size:cover;background-position:center}
.iph-st{position:absolute;left:0;right:0;top:0;height:11.5cqw;display:flex;align-items:center;justify-content:space-between;padding:0 6.5cqw 0 8.5cqw;z-index:30;font-weight:600;font-size:4.1cqw;pointer-events:none;text-shadow:0 0 6px rgba(0,0,0,.25)}
.iph-isl{position:absolute;left:50%;top:2.6cqw;width:29cqw;height:8.4cqw;margin-left:-14.5cqw;border-radius:5cqw;background:#000;z-index:31;transition:width .35s,margin .35s,height .35s;display:flex;align-items:center;justify-content:center;gap:2cqw;font-size:3.2cqw;color:#7cff9c;overflow:hidden}
.iph-isl.wide{width:62cqw;margin-left:-31cqw;height:9.4cqw}
.iph-sig{display:flex;align-items:center;gap:1.1cqw;font-size:3.3cqw}
.iph-bars{display:inline-flex;align-items:flex-end;gap:.5cqw;height:2.8cqw}.iph-bars i{width:.85cqw;background:#fff;border-radius:.3cqw}
.iph-bat{width:6.2cqw;height:2.9cqw;border:.35cqw solid rgba(255,255,255,.55);border-radius:.9cqw;padding:.3cqw;box-sizing:border-box;position:relative}
.iph-bat::after{content:'';position:absolute;right:-1cqw;top:.8cqw;width:.6cqw;height:1.1cqw;border-radius:0 .3cqw .3cqw 0;background:rgba(255,255,255,.55)}
.iph-bat i{display:block;height:100%;background:#fff;border-radius:.4cqw}
.iph-home{position:absolute;inset:0;padding:13.5cqw 5.5cqw 0;transition:transform .3s,opacity .3s,filter .3s}
.iph-home.away{transform:scale(.9);opacity:0;filter:blur(4px);pointer-events:none}
.iph-wid{display:grid;grid-template-columns:1fr 1fr;gap:4.6cqw;margin-bottom:5cqw}
.iph-w{height:40cqw;border-radius:6cqw;padding:3.6cqw 4cqw;box-sizing:border-box;background:rgba(30,30,40,.35);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);display:flex;flex-direction:column;justify-content:space-between;text-align:left}
.iph-w small{font-size:3.1cqw;font-weight:600;opacity:.85;text-transform:uppercase;letter-spacing:.03em}
.iph-w .ph-big{font-size:11cqw;font-weight:300;line-height:1}
.iph-w .mid{font-size:4cqw;font-weight:600}
.iph-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4.4cqw 0;justify-items:center}
.iph-ic{display:flex;flex-direction:column;align-items:center;gap:1.3cqw;width:19cqw;position:relative}
.iph-ic span{font-size:max(8.5px,2.95cqw);font-weight:500;text-shadow:0 1px 3px rgba(0,0,0,.5);white-space:nowrap}
.iph-ico{width:15cqw;height:15cqw;border-radius:3.7cqw;display:grid;place-items:center;box-shadow:0 1cqw 2.4cqw rgba(0,0,0,.28);position:relative;overflow:hidden}
.iph-ico svg{width:62%;height:62%}
.iph-ic:active .iph-ico{filter:brightness(.75)}
.iph-badge{position:absolute;right:.4cqw;top:-1.2cqw;min-width:5.2cqw;height:5.2cqw;border-radius:2.6cqw;background:#ff3b30;color:#fff;font-size:3.2cqw;font-weight:700;display:grid;place-items:center;padding:0 1.2cqw;box-sizing:border-box;z-index:2}
.iph-dots{display:flex;justify-content:center;gap:1.6cqw;margin:4cqw 0}.iph-dots i{width:1.8cqw;height:1.8cqw;border-radius:50%;background:rgba(255,255,255,.4)}.iph-dots i.on{background:#fff}
.iph-dock{position:absolute;left:3.4cqw;right:3.4cqw;bottom:3.4cqw;height:22cqw;border-radius:8.5cqw;background:rgba(255,255,255,.2);backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);display:flex;align-items:center;justify-content:space-around}
.iph-dock .iph-ic span{display:none}
.iph-bar{position:absolute;left:50%;bottom:1.7cqw;width:34cqw;height:1.4cqw;margin-left:-17cqw;border-radius:1cqw;background:#fff;z-index:40;opacity:.9}
.iph-barhit{position:absolute;left:25%;right:25%;bottom:0;height:6cqw;z-index:41}
.iph-app{position:absolute;inset:0;background:#0d0f13;display:flex;flex-direction:column;z-index:20;animation:iphApp .26s cubic-bezier(.2,.9,.3,1)}
.iph-app.light{background:#f2f2f7;color:#111}
@keyframes iphApp{from{transform:scale(.35);opacity:0;border-radius:20cqw}to{transform:none;opacity:1}}
.iph-nav{flex:none;padding:12.5cqw 4.6cqw 2cqw;display:flex;align-items:flex-end;justify-content:space-between;gap:2cqw;min-height:9cqw}
.iph-nav h1{margin:0;font-size:7.6cqw;font-weight:800;letter-spacing:-.02em;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.iph-back{font-size:4.4cqw;color:#0a84ff!important;display:flex;align-items:center;gap:.6cqw;white-space:nowrap}
.iph-back b{font-size:7cqw;line-height:.8;font-weight:400}
.iph-act{font-size:6.4cqw;color:#0a84ff!important;min-width:8cqw}
.iph-body{flex:1;overflow-y:auto;overflow-x:hidden;padding:1cqw 4.2cqw 9cqw;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;user-select:text;-webkit-user-select:text}
.iph-body::-webkit-scrollbar{width:0}
.iph-seg{display:flex;background:rgba(118,118,128,.24);border-radius:2.4cqw;padding:.6cqw;margin:0 0 3cqw}.iph-seg button{flex:1;padding:1.6cqw 0;border-radius:1.9cqw;font-size:3.5cqw;font-weight:600;color:inherit;opacity:.85}.iph-seg button.on{background:rgba(255,255,255,.18);opacity:1}
.light .iph-seg button.on{background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.15)}
.iph-list{background:rgba(255,255,255,.06);border-radius:3.6cqw;overflow:hidden;margin:0 0 4cqw}.light .iph-list{background:#fff}
.iph-li{display:flex;align-items:center;gap:3cqw;width:100%;padding:2.6cqw 3.4cqw;text-align:left;border-bottom:1px solid rgba(255,255,255,.07);box-sizing:border-box;min-height:12cqw}
.light .iph-li{border-bottom-color:rgba(0,0,0,.07)}
.iph-li:last-child{border-bottom:none}
.iph-li .tx{flex:1;min-width:0}.iph-li b{display:block;font-size:4cqw;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.iph-li small{display:block;font-size:3.2cqw;opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.iph-li .rt{font-size:3.3cqw;opacity:.6;white-space:nowrap}
.iph-av{flex:none;width:10cqw;height:10cqw;border-radius:50%;display:grid;place-items:center;font-size:5cqw;font-weight:700;color:#fff;overflow:hidden}
.iph-h{font-size:3.2cqw;text-transform:uppercase;letter-spacing:.05em;opacity:.55;margin:4cqw 1cqw 1.6cqw;font-weight:600}
.iph-btn{display:block;width:100%;padding:3cqw;border-radius:3cqw;font-weight:700;font-size:4cqw;background:#0a84ff;color:#fff!important;margin:2.4cqw 0;text-align:center}
.iph-btn.gray{background:rgba(255,255,255,.12)}.light .iph-btn.gray{background:#e5e5ea;color:#111!important}
.iph-btn.red{background:#ff3b30}
.iph-in{width:100%;box-sizing:border-box;padding:2.8cqw 3.4cqw;border-radius:3cqw;border:none;background:rgba(118,118,128,.24);color:inherit;font:inherit;font-size:max(12px,4cqw);outline:none;margin:0 0 2.4cqw}
.iph-chips{display:flex;flex-wrap:wrap;gap:1.8cqw;margin:1cqw 0 2.4cqw}.iph-chips button{padding:1.8cqw 3cqw;border-radius:4cqw;background:rgba(118,118,128,.24);font-size:3.5cqw;font-weight:600}
.iph-note{font-size:3.5cqw;opacity:.65;margin:2cqw 1cqw}
.fm-btn{flex:none;padding:1.6cqw 3cqw;border-radius:4cqw;background:#2e7d1f;color:#fff!important;font-size:3.2cqw;font-weight:700;white-space:nowrap}.fm-btn.off{background:rgba(120,120,128,.18);color:#333!important;font-weight:600}
/* gist (social) */
.gx-post{background:rgba(255,255,255,.05);border-radius:4cqw;padding:3.4cqw;margin:0 0 3.4cqw}
.gx-hd{display:flex;align-items:center;gap:2.6cqw;margin-bottom:2cqw}.gx-hd .iph-av{width:9cqw;height:9cqw;font-size:4.6cqw}
.gx-hd b{font-size:3.8cqw;font-weight:700}.gx-hd small{display:block;font-size:3.1cqw;opacity:.55}
.gx-v{display:inline-grid;place-items:center;width:3.6cqw;height:3.6cqw;border-radius:50%;background:#1d9bf0;color:#fff;font-size:2.4cqw;margin-left:1cqw;vertical-align:.2cqw}
.gx-tx{font-size:3.9cqw;margin:0 0 2.4cqw;white-space:pre-wrap;word-wrap:break-word}
.gx-media{width:100%;aspect-ratio:1/1;border-radius:3cqw;overflow:hidden;margin-bottom:2.4cqw;display:grid;place-items:center;font-size:24cqw;background:#222;position:relative}
.gx-media img{width:100%;height:100%;object-fit:cover;display:block}
.gx-media em{position:absolute;left:3cqw;right:3cqw;bottom:3cqw;font-style:normal;font-size:4.2cqw;font-weight:800;text-align:center;text-shadow:0 1px 4px rgba(0,0,0,.6)}
.gx-acts{display:flex;gap:5cqw;font-size:3.6cqw;opacity:.85}.gx-acts button{display:flex;align-items:center;gap:1.2cqw}.gx-acts .liked{color:#ff3b5c}
.gx-cm{font-size:3.5cqw;margin:1.6cqw 0 0;opacity:.85}.gx-cm b{font-weight:700;margin-right:1cqw}
.gx-new{position:absolute;right:5cqw;bottom:8cqw;width:13cqw;height:13cqw;border-radius:50%;background:linear-gradient(135deg,#ff7a18,#d6249f);color:#fff!important;font-size:8cqw;box-shadow:0 2cqw 5cqw rgba(0,0,0,.45);z-index:5}
.gx-around{display:flex;gap:3cqw;align-items:center;padding:3cqw;border-radius:3.6cqw;background:rgba(255,255,255,.06);margin:0 0 2.4cqw}.gx-around i{font-style:normal;font-size:7cqw}
.gx-around b{display:block;font-size:3.8cqw}.gx-around small{font-size:3.2cqw;opacity:.6}
/* messages */
.mx-th{display:flex;flex-direction:column;gap:1.6cqw}
.mx-b{max-width:78%;padding:2.2cqw 3.4cqw;border-radius:4.4cqw;font-size:3.9cqw;white-space:pre-wrap;word-wrap:break-word}
.mx-b.them{align-self:flex-start;background:#26262a;border-bottom-left-radius:1.2cqw}.mx-b.me{align-self:flex-end;background:#0a84ff;border-bottom-right-radius:1.2cqw}
.mx-t{align-self:center;font-size:3cqw;opacity:.5;margin:2cqw 0}
/* calls */
.cx{position:absolute;inset:0;z-index:50;background:linear-gradient(180deg,#2c3e50,#0b0f17);display:flex;flex-direction:column;align-items:center;padding:20cqw 6cqw 8cqw;box-sizing:border-box;animation:iphApp .25s}
.cx .iph-av{width:26cqw;height:26cqw;font-size:12cqw;margin-bottom:3cqw}
.cx h2{margin:0;font-size:7.4cqw;font-weight:600}.cx p.s{margin:1cqw 0 0;opacity:.7;font-size:3.8cqw}
.cx-say{flex:1;width:100%;overflow-y:auto;margin:5cqw 0 3cqw;display:flex;flex-direction:column;gap:2cqw}
.cx-say div{background:rgba(255,255,255,.12);border-radius:3.6cqw;padding:2.4cqw 3.4cqw;font-size:3.8cqw;animation:iphApp .2s}
.cx-say div.me{background:rgba(10,132,255,.45);align-self:flex-end}
.cx-ch{width:100%;display:flex;flex-direction:column;gap:2cqw;margin-bottom:3cqw}.cx-ch button{padding:2.8cqw;border-radius:3cqw;background:rgba(255,255,255,.16);font-weight:600;font-size:3.8cqw}
.cx-end{width:17cqw;height:17cqw;border-radius:50%;background:#ff3b30;display:grid;place-items:center;flex:none}
.cx-end svg{width:52%;height:52%}
/* keypad */
.kp-num{text-align:center;font-size:9cqw;font-weight:300;min-height:12cqw;margin:2cqw 0 4cqw;letter-spacing:.06em}
.kp{display:grid;grid-template-columns:repeat(3,1fr);gap:4cqw 6cqw;padding:0 6cqw}
.kp button{aspect-ratio:1;border-radius:50%;background:rgba(255,255,255,.14);font-size:8cqw;font-weight:400;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}
.kp button small{font-size:2.4cqw;letter-spacing:.15em;opacity:.8;margin-top:.6cqw}
.kp .call{background:#30d158}
/* photos */
.px-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.8cqw;margin:0 -4.2cqw}.px-grid button{aspect-ratio:1;overflow:hidden;background:#222}.px-grid img{width:100%;height:100%;object-fit:cover;display:block}
.px-view img{width:100%;border-radius:2cqw;display:block;margin-bottom:2cqw}
/* wallet / weather */
.wx-card{border-radius:5cqw;padding:5cqw;margin:0 0 4cqw;background:linear-gradient(135deg,#0f9b58,#0b5e3c);box-shadow:0 2cqw 6cqw rgba(0,0,0,.35)}
.wx-card small{opacity:.8;font-size:3.3cqw}
.bk-top{display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:4cqw;letter-spacing:.02em}
.bk-top i{font-style:normal;font-size:3cqw;font-weight:600;opacity:.8}
.bk-acct{display:flex;align-items:center;gap:2cqw;margin:2.4cqw 0 0;font-size:4.6cqw;font-weight:700;letter-spacing:.06em;font-variant-numeric:tabular-nums}
.bk-acct button{font-size:3cqw;font-weight:700;padding:1cqw 2.4cqw;border-radius:3cqw;background:rgba(255,255,255,.22);letter-spacing:0}
.bk-row{display:flex;gap:2.4cqw}.bk-row .iph-btn{flex:1}
.bk-banks{display:flex;gap:1.8cqw;margin:0 0 2.4cqw}
.bk-banks button{flex:1;padding:2.4cqw 1cqw;border-radius:3cqw;font-size:3.2cqw;font-weight:700;background:rgba(118,118,128,.24);border:2px solid transparent;line-height:1.15}
.bk-banks button.on{color:#fff;border-color:#fff}
.bk-name{font-size:3.6cqw;font-weight:700;margin:-1cqw 1cqw 2.4cqw;min-height:4.4cqw}
.bk-name.ok{color:#30d158}.bk-name.bad{color:#ff6b5e}
.bk-fee{font-size:3.4cqw;opacity:.7;margin:0 1cqw 2cqw}
.bk-rc{background:rgba(255,255,255,.07);border-radius:4cqw;padding:4cqw;margin:0 0 3cqw}
.bk-rc div{display:flex;justify-content:space-between;gap:3cqw;font-size:3.6cqw;padding:1.2cqw 0;border-bottom:1px solid rgba(255,255,255,.07)}
.bk-rc div:last-child{border-bottom:none}.bk-rc div span{opacity:.6}.bk-rc div b{text-align:right}
.bk-ok{text-align:center;font-size:12cqw;margin:2cqw 0 0}.bk-big{text-align:center;font-size:7.5cqw;font-weight:800;margin:0 0 3cqw}
.bk-err{color:#ff6b5e;font-size:3.5cqw;font-weight:600;margin:0 1cqw 2cqw}.wx-card .ph-big{font-size:10cqw;font-weight:700;margin:1cqw 0}
.wt{text-align:center;padding-top:4cqw}.wt .t{font-size:22cqw;font-weight:200;line-height:1}.wt .c{font-size:5cqw;font-weight:600;margin:1cqw 0}
.wt-hours{display:flex;justify-content:space-between;background:rgba(255,255,255,.12);border-radius:4cqw;padding:3cqw;margin:5cqw 0}.wt-hours div{text-align:center;font-size:3.3cqw}.wt-hours i{display:block;font-style:normal;font-size:5.4cqw;margin:1cqw 0}
/* the camera: the game itself is the viewfinder */
.camui{position:fixed;inset:0;z-index:12;pointer-events:none;color:#fff;font-family:-apple-system,'Segoe UI',Roboto,system-ui,sans-serif}
.camui .g{position:absolute;inset:0;background:linear-gradient(90deg,transparent calc(33.3% - .5px),rgba(255,255,255,.28) calc(33.3% - .5px),rgba(255,255,255,.28) calc(33.3% + .5px),transparent calc(33.3% + .5px),transparent calc(66.6% - .5px),rgba(255,255,255,.28) calc(66.6% - .5px),rgba(255,255,255,.28) calc(66.6% + .5px),transparent calc(66.6% + .5px)),linear-gradient(0deg,transparent calc(33.3% - .5px),rgba(255,255,255,.28) calc(33.3% - .5px),rgba(255,255,255,.28) calc(33.3% + .5px),transparent calc(33.3% + .5px),transparent calc(66.6% - .5px),rgba(255,255,255,.28) calc(66.6% - .5px),rgba(255,255,255,.28) calc(66.6% + .5px),transparent calc(66.6% + .5px))}
.camui .top{position:absolute;left:0;right:0;top:0;padding:calc(10px + var(--st)) calc(16px + var(--sr)) 10px calc(16px + var(--sl));display:flex;justify-content:space-between;align-items:center;background:linear-gradient(rgba(0,0,0,.45),transparent)}
.camui .side{position:absolute;right:calc(18px + var(--sr));top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:22px}
.camui button{pointer-events:auto;border:none;background:none;color:#fff;cursor:pointer;font:inherit}
.camui .shut{width:74px;height:74px;border-radius:50%;border:5px solid #fff;background:rgba(255,255,255,.18);box-shadow:0 2px 12px rgba(0,0,0,.4)}
.camui .shut:active{background:#fff}
.camui .rnd{width:46px;height:46px;border-radius:50%;background:rgba(0,0,0,.45);display:grid;place-items:center;font-size:20px}
.camui .thumb{width:46px;height:46px;border-radius:10px;overflow:hidden;border:2px solid #fff;background:#222}.camui .thumb img{width:100%;height:100%;object-fit:cover}
.camui .modes{display:flex;gap:16px;font-weight:700;font-size:14px;letter-spacing:.08em;background:rgba(0,0,0,.4);border-radius:20px;padding:6px 14px}.camui .modes button{opacity:.6}.camui .modes button.on{opacity:1;color:#ffd60a}
.camui .zoom{font-size:13px;font-weight:700;background:rgba(0,0,0,.45);border-radius:14px;padding:4px 10px}
.camflash{position:fixed;inset:0;background:#fff;z-index:13;pointer-events:none;animation:camFl .35s ease-out forwards}
@keyframes camFl{from{opacity:.95}to{opacity:0}}
body.ph-cam .hud>*:not(.camui):not(#touch):not(#toast){visibility:hidden}
body.ph-cam #mmWrap,body.ph-cam #phoneBtn,body.ph-cam #touch .tbtns{visibility:hidden}
/* the phone button in the corner: an app icon of its own, with the number of new things on it */
#phoneBtn{position:relative;width:44px;height:44px;border-radius:12px;padding:0;border:none;background:none;backdrop-filter:none;-webkit-backdrop-filter:none;overflow:visible}
#phoneBtn .pb-ic{position:absolute;inset:0;border-radius:12px;overflow:hidden;display:grid;place-items:center;background:linear-gradient(155deg,#ffe36e 0%,#f2b705 45%,#d98000 100%);box-shadow:0 4px 12px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.65),inset 0 -2px 0 rgba(0,0,0,.18);transition:transform .15s}
#phoneBtn .pb-ic::before{content:'';position:absolute;left:-30%;right:-30%;top:-70%;height:100%;border-radius:50%;background:linear-gradient(rgba(255,255,255,.5),rgba(255,255,255,0))}
#phoneBtn .pb-ic svg{position:relative;width:39px;height:39px;filter:drop-shadow(0 1.5px 1.5px rgba(0,0,0,.35))}
#phoneBtn:active .pb-ic{transform:scale(.9)}
#phoneBtn[aria-pressed="true"]{background:none}
#phoneBtn[aria-pressed="true"] .pb-ic{box-shadow:0 0 0 2px #0e1014,0 0 0 4px #fff,0 4px 12px rgba(0,0,0,.45)}
#phoneBtn .pb-n{position:absolute;right:-8px;top:-8px;min-width:21px;height:21px;padding:0 5px;box-sizing:border-box;border-radius:11px;background:#ff3b30;color:#fff;font:700 12px/17px -apple-system,'Segoe UI',Roboto,system-ui,sans-serif;text-align:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45);z-index:2}
#phoneBtn .pb-n[hidden]{display:none}
#phoneBtn.bump .pb-ic{animation:pbBump .6s}
#phoneBtn.bump .pb-n{animation:pbPop .45s}
@keyframes pbBump{0%,100%{transform:none}25%{transform:scale(1.15) rotate(-8deg)}55%{transform:scale(.95) rotate(5deg)}80%{transform:rotate(-2deg)}}
@keyframes pbPop{0%{transform:scale(.3)}70%{transform:scale(1.25)}100%{transform:none}}
@media (max-height:420px){.iph-wrap{bottom:calc(6px + var(--sb))}}
`;

/* ---- icons (simple glyphs drawn here) */
const SV = (p, vb = '0 0 24 24') => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICONS = {
  phone: ['linear-gradient(180deg,#5cf27a,#21c04a)', '#fff', SV('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" fill="#fff" stroke="none"/>')],
  msg: ['linear-gradient(180deg,#67f07f,#2bc24c)', '#fff', SV('<path d="M12 3C6.5 3 2 6.6 2 11c0 2.5 1.4 4.7 3.6 6.2L4.8 21l4.2-2.2c.9.2 1.9.3 3 .3 5.5 0 10-3.6 10-8.1S17.5 3 12 3z" fill="#fff" stroke="none"/>')],
  gist: ['linear-gradient(45deg,#feda75,#fa7e1e 30%,#d62976 60%,#962fbf 85%,#4f5bd5)', '#fff', SV('<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M15.5 9.5a4 4 0 1 0 .5 3.5h-3.5"/><circle cx="17.5" cy="6.5" r="1" fill="#fff"/>')],
  camera: ['linear-gradient(180deg,#e9e9ee,#9a9aa2)', '#2a2a2e', SV('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" fill="#2a2a2e" stroke="none"/><circle cx="12" cy="13.5" r="4" fill="#cfcfd6" stroke="#2a2a2e" stroke-width="1.5"/><circle cx="12" cy="13.5" r="2" fill="#2a2a2e" stroke="none"/>')],
  photos: ['#fff', '#000', SV('<g stroke="none"><ellipse cx="12" cy="6.2" rx="2.4" ry="4" fill="#fbbc05"/><ellipse cx="12" cy="17.8" rx="2.4" ry="4" fill="#4285f4"/><ellipse cx="6.2" cy="12" rx="4" ry="2.4" fill="#34a853"/><ellipse cx="17.8" cy="12" rx="4" ry="2.4" fill="#ea4335"/><ellipse cx="7.9" cy="7.9" rx="2.4" ry="4" transform="rotate(-45 7.9 7.9)" fill="#a8d64a" opacity=".9"/><ellipse cx="16.1" cy="16.1" rx="2.4" ry="4" transform="rotate(-45 16.1 16.1)" fill="#9b59f5" opacity=".9"/><ellipse cx="16.1" cy="7.9" rx="2.4" ry="4" transform="rotate(45 16.1 7.9)" fill="#ff8a1c" opacity=".9"/><ellipse cx="7.9" cy="16.1" rx="2.4" ry="4" transform="rotate(45 7.9 16.1)" fill="#21c3d6" opacity=".9"/></g>')],
  ride: ['linear-gradient(180deg,#ffd23f,#f2b705)', '#0e1014', SV('<path d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11" stroke="#0e1014"/><rect x="3" y="11" width="18" height="6" rx="2" fill="#0e1014" stroke="none"/><circle cx="7.5" cy="17.5" r="1.8" fill="#0e1014" stroke="#f2b705" stroke-width="1.2"/><circle cx="16.5" cy="17.5" r="1.8" fill="#0e1014" stroke="#f2b705" stroke-width="1.2"/>')],
  work: ['linear-gradient(180deg,#1fcf8a,#0f9b58)', '#fff', SV('<path d="M3.5 8.5 12 4l8.5 4.5v7L12 20l-8.5-4.5z" fill="rgba(255,255,255,.18)"/><path d="M3.5 8.5 12 13l8.5-4.5M12 13v7M7.8 6.2l8.5 4.6"/>')],
  maps: ['linear-gradient(180deg,#e8f5e9,#c9e7c4)', '#2a2a2e', SV('<path d="M2 18 9 4l4 8 3-5 6 11" stroke="#fff" stroke-width="3.2"/><path d="M2 18 9 4l4 8 3-5 6 11" stroke="#f5b400" stroke-width="1.6"/><circle cx="15.5" cy="8.5" r="3.6" fill="#ff3b30" stroke="#fff" stroke-width="1.4"/><circle cx="15.5" cy="8.5" r="1.2" fill="#fff" stroke="none"/>')],
  wallet: ['linear-gradient(180deg,#2b2b30,#0c0c0e)', '#fff', SV('<rect x="3" y="5" width="18" height="5" rx="1.5" fill="#ff9500" stroke="none"/><rect x="3" y="8" width="18" height="5" rx="1.5" fill="#30d158" stroke="none"/><rect x="3" y="11" width="18" height="8" rx="2" fill="#0a84ff" stroke="none"/><path d="M15 15h3" stroke="#fff"/>')],
  weather: ['linear-gradient(180deg,#4facfe,#1e6fd9)', '#fff', SV('<circle cx="9" cy="9" r="3.5" fill="#ffd60a" stroke="none"/><path d="M8 19h9a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.5A2.8 2.8 0 0 0 8 19z" fill="#fff" stroke="none"/>')],
  settings: ['linear-gradient(180deg,#a2a2a8,#6e6e75)', '#fff', SV('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')],
  farm: ['linear-gradient(180deg,#8fd14f,#3e8e1f)', '#fff', SV('<path d="M3 20h18" stroke="#fff"/><path d="M12 20V9" stroke="#fff" stroke-width="2.2"/><path d="M12 13c-3.5 0-5.5-2.2-5.5-5.5 3.3 0 5.5 2 5.5 5.5zM12 11c0-3.6 2.2-6 6-6 0 3.8-2.4 6-6 6z" fill="#fff" stroke="none"/>')],
  sos: ['linear-gradient(180deg,#ff5e57,#d0021b)', '#fff', SV('<path d="M12 2.5 4 5.5v6c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10v-6z" fill="rgba(255,255,255,.18)"/><path d="M12 7.5v5M9.5 10h5"/><text x="12" y="19" text-anchor="middle" font-size="5.4" font-weight="800" fill="#fff" stroke="none" font-family="Arial">112</text>')],
};
const icon = k => { const [bg, fg, svg] = ICONS[k]; const d = document.createElement('div'); d.className = 'iph-ico'; d.style.background = bg; d.style.color = fg; d.innerHTML = svg; return d; };
// the corner button: a little phone with the Lagos dusk on its screen and a few apps, tilted like it is in your hand
const PB_SVG = `<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="pbS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26195c"/><stop offset=".55" stop-color="#b3457c"/><stop offset="1" stop-color="#ffb35c"/></linearGradient></defs>
<g transform="rotate(-9 16 16)"><rect x="8.6" y="2.4" width="14.8" height="27.2" rx="3.9" fill="#121318"/><rect x="9.9" y="3.7" width="12.2" height="24.6" rx="2.8" fill="url(#pbS)"/>
<rect x="14" y="4.7" width="4" height="1.5" rx=".75" fill="#000"/>
<g><rect x="11.2" y="8.6" width="2.5" height="2.5" rx=".7" fill="#34c759"/><rect x="14.75" y="8.6" width="2.5" height="2.5" rx=".7" fill="#0a84ff"/><rect x="18.3" y="8.6" width="2.5" height="2.5" rx=".7" fill="#ffd60a"/>
<rect x="11.2" y="12.3" width="2.5" height="2.5" rx=".7" fill="#ff375f"/><rect x="14.75" y="12.3" width="2.5" height="2.5" rx=".7" fill="#ff9f0a"/><rect x="18.3" y="12.3" width="2.5" height="2.5" rx=".7" fill="#fff"/></g>
<path d="M9.9 24.6v-3.4h1.6v-2.2h1.4v3h1.2v-4.2h1.5v4.6h1.3v-2.4h1.5v1.5h1.2v-3.2h1.3v3.6h1.2v3.7z" fill="#2a1638"/><rect x="13.7" y="26.4" width="4.6" height=".8" rx=".4" fill="#fff" opacity=".85"/></g></svg>`;
const SB_ICON = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.2 2.8 11a1 1 0 0 0 1.3 1.5l.9-.8V20a1 1 0 0 0 1 1h4v-5.5h4V21h4a1 1 0 0 0 1-1v-8.3l.9.8a1 1 0 0 0 1.3-1.5z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
};

/* ---- the Lagos wallpaper: dusk over the city, the bridge and the lagoon (drawn here) */
const WALL_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 650' preserveAspectRatio='xMidYMax slice'><defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#1b1145'/><stop offset='.45' stop-color='#7a2f73'/><stop offset='.72' stop-color='#ec7a3c'/><stop offset='.86' stop-color='#ffc46b'/></linearGradient><linearGradient id='w' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#c86a4a'/><stop offset='1' stop-color='#2a1840'/></linearGradient></defs><rect width='300' height='650' fill='url(#s)'/><circle cx='205' cy='470' r='34' fill='#ffd27a' opacity='.9'/><g fill='#2a1638' opacity='.95'><rect x='8' y='420' width='26' height='140'/><rect x='38' y='380' width='20' height='180'/><rect x='62' y='440' width='30' height='120'/><rect x='96' y='350' width='18' height='210'/><rect x='118' y='400' width='34' height='160'/><rect x='156' y='455' width='22' height='105'/><rect x='228' y='410' width='24' height='150'/><rect x='256' y='372' width='20' height='188'/><rect x='278' y='430' width='22' height='130'/><path d='M100 350l5-14 5 14z'/></g><g fill='#ffd98a' opacity='.55'><rect x='42' y='392' width='3' height='3'/><rect x='50' y='410' width='3' height='3'/><rect x='100' y='370' width='3' height='3'/><rect x='106' y='395' width='3' height='3'/><rect x='124' y='420' width='3' height='3'/><rect x='140' y='440' width='3' height='3'/><rect x='260' y='392' width='3' height='3'/><rect x='266' y='420' width='3' height='3'/></g><path d='M0 540 Q75 505 150 540 T300 540' stroke='#1a0f2c' stroke-width='5' fill='none'/><g stroke='#1a0f2c' stroke-width='3'><line x1='37' y1='528' x2='37' y2='560'/><line x1='112' y1='526' x2='112' y2='560'/><line x1='188' y1='526' x2='188' y2='560'/><line x1='262' y1='528' x2='262' y2='560'/></g><rect y='558' width='300' height='92' fill='url(#w)'/><g stroke='#ffd27a' stroke-width='2' opacity='.5'><line x1='180' y1='572' x2='230' y2='572'/><line x1='190' y1='590' x2='222' y2='590'/><line x1='198' y1='608' x2='214' y2='608'/></g></svg>`;
const WALLS = [
  { n: 'Lagos dusk', css: `url("data:image/svg+xml,${encodeURIComponent(WALL_SVG)}")` },
  { n: 'Green white green', css: 'linear-gradient(90deg,#0b8a4f 0 33%,#f4f1e8 33% 67%,#0b8a4f 67%)' },
  { n: 'Danfo yellow', css: 'radial-gradient(120% 70% at 30% 20%,#ffe27a,#f2b705 45%,#b07d00)' },
  { n: 'Midnight', css: 'radial-gradient(90% 60% at 70% 20%,#3b4cca,transparent 60%),radial-gradient(80% 60% at 20% 80%,#a1287a,transparent 60%),#07070d' },
];

/* ---- the people of Lagos online */
const FOLK = [
  { h: 'lagos_traffic', n: 'Lagos Traffic', c: '#e74c3c', e: '🚦', v: 1 }, { h: 'mushin_gist', n: 'Mushin Gist', c: '#8e44ad', e: '🗞️', v: 1 },
  { h: 'mamaput_joy', n: 'Mama Put Joy', c: '#e67e22', e: '🍲' }, { h: 'tunde_wey_dey', n: 'Tunde', c: '#2980b9', e: '😎' },
  { h: 'ada_lagos_babe', n: 'Adaeze', c: '#d35486', e: '💅' }, { h: 'danfo_sege', n: 'Sege Danfo', c: '#c9a10a', e: '🚐' },
  { h: 'idi_oro_boys', n: 'Idi-Oro Boys', c: '#16a085', e: '⚽' }, { h: 'nepa_watch', n: 'NEPA Watch', c: '#34495e', e: '💡' },
  { h: 'ladipo_parts', n: 'Ladipo Spare Parts', c: '#7f8c8d', e: '🔧' }, { h: 'eko_grand', n: 'Eko Grand Hotel', c: '#6b1f2a', e: '🏨', v: 1 },
  { h: 'owambe_queen', n: 'Owambe Queen', c: '#c0392b', e: '👑' }, { h: 'pastor_dele', n: 'Pastor Dele', c: '#2c3e50', e: '🙏' },
  { h: 'chidi_phones', n: 'Chidi Phones', c: '#27ae60', e: '📱' }, { h: 'area_fada', n: 'Area Fada', c: '#5d4037', e: '💪' },
  { h: 'nurse_bisi', n: 'Nurse Bisi', c: '#3498db', e: '🩺' }, { h: 'mushin_police', n: 'Mushin Police', c: '#1a3a6b', e: '👮', v: 1 },
  { h: 'dj_kunle', n: 'DJ Kunle', c: '#9b59b6', e: '🎧' }, { h: 'aunty_kemi', n: 'Aunty Kemi', c: '#e91e63', e: '🛍️' },
];
const who = h => FOLK.find(f => f.h === h) || FOLK[0];
const POSTS = {
  traffic: [['lagos_traffic', 'Hold-up for {road} no be here o 😩 Na one hour I don stand for one place'], ['danfo_sege', 'Agbero don block {road} again. Find another way!'], ['tunde_wey_dey', 'Okada men for {road} dey ride like say dem get two lives 😂'], ['lagos_traffic', '{road}: moving small small. {area} side clear.']],
  food: [['mamaput_joy', 'Jollof dey my side today with plenty meat 🍛 Come {market} before e finish!', '🍛', 'JOLLOF TODAY'], ['mamaput_joy', 'Amala, ewedu and gbegiri. ₦1,500 only. Na {area} we dey 🥣', '🥣'], ['tunde_wey_dey', 'Who wan chop suya tonight? {area} suya man na correct person 🔥', '🍢']],
  market: [['aunty_kemi', 'Tomato price for {market} don go up again 😤 ₦{n} for one basket!', '🍅', '₦{n}?!'], ['mushin_gist', '{market} full today. Pickpocket dey o, hold your phone well 👀'], ['aunty_kemi', 'Fresh pepper don land for {market}. Come buy before evening 🌶️', '🌶️']],
  vibes: [['tunde_wey_dey', 'Mushin to the world 🌍'], ['pastor_dele', 'No matter wetin happen today, God dey run Lagos 🙏'], ['ada_lagos_babe', 'Who sabi better hair salon for {area}? 💇🏾‍♀️'], ['idi_oro_boys', 'Football for {area} field 5pm. Bring your boot ⚽', '⚽', 'MATCH 5PM'], ['area_fada', 'Respect yourself for {area}. Na we get this side 💪'], ['chidi_phones', 'New phones don land! iPhone, Samsung, Tecno. {market} shop 12 📱', '📱', 'NEW STOCK']],
  nepa: [['nepa_watch', 'NEPA don take light for {area} again 😤'], ['nepa_watch', 'Light don come for {area}!!! UP NEPA 🙌', '💡'], ['tunde_wey_dey', 'Gen noise full {area}. Person no fit sleep 🔊']],
  rain: [['mushin_gist', 'Rain don start for {area} ☔ Everybody don run enter shade', '🌧️'], ['lagos_traffic', 'Flood don cover part of {road}. Drive slow abeg 🌊']],
  sun: [['ada_lagos_babe', 'Sun dey hot like oven for Lagos today 🥵'], ['mamaput_joy', 'Cold zobo dey my side ₦300. This heat no be joke 🥤', '🥤']],
  night: [['dj_kunle', 'Tonight na tonight!! Club dey burst for {area} 🔥🎧', '🎧', 'TONIGHT'], ['owambe_queen', 'Owambe for {area} this night. Aso ebi na gold 👑', '👑'], ['tunde_wey_dey', 'Lagos no dey sleep. {road} still busy for this night 🌃']],
  hotel: [['eko_grand', 'Eko Grand Hotel, Ikeja GRA ⭐⭐⭐⭐⭐ Rooms from ₦25,000, suites up to the Presidential. Pool, golf, The Cellar wine bar and VELVET club 🏨', '🏨', 'BOOK NOW']],
  police: [['mushin_police', 'Report crime: call 112. We dey for you 👮'], ['lagos_traffic', 'Police checkpoint for {road}. Carry your papers 📄']],
};
const EVENTS = {
  police: [['lagos_traffic', 'Police van dey rush go {place} 🚨 Wetin happen?'], ['mushin_gist', 'Siren full {area} now now 🚔']],
  hero: [['mushin_gist', 'Somebody chase agberos wey dey rob one Baba for {place} 💪 Na real hero be that!'], ['tunde_wey_dey', 'Omo! One guy fight 4 agberos for {place} and give Baba him money back 🙌'], ['ada_lagos_babe', 'Good people still dey Lagos o. {place} today 🙏']],
  fight: [['mushin_gist', 'Fight don start for {place}! People dey gather 😳'], ['tunde_wey_dey', 'Who be this guy wey dey fight for {place}? 😂']],
  shots: [['mushin_gist', 'Gunshot for {place}!! Everybody take cover 😱'], ['ada_lagos_babe', 'I hear gbosa gbosa for {area} just now. Una dey alright?']],
  explosion: [['lagos_traffic', 'Motor don burst for {place}!! 🔥🔥 Avoid that road', '🔥', 'FIRE!'], ['mushin_gist', 'Fire for {place}! Call fire service! 🚒']],
  arrest: [['mushin_gist', 'Police don carry one guy for {place} 😂 E dey shout say na mistake'], ['mushin_police', 'One suspect don dey our custody. Crime no pay 👮']],
  wanted: [['mushin_police', 'We dey find one suspect for {area}. If you see am, call 112.'], ['mushin_gist', 'Police dey find person for {area} o. Wetin e do? 👀']],
  crash: [['lagos_traffic', 'Accident for {place} 😢 Drive with care'], ['danfo_sege', 'See as somebody jam motor for {place} 🤦🏾']],
  farm: [['mushin_gist', 'New farmer for Oya Farm Settlement! Maize, cassava, cow and fowl 🚜🌽', '🚜', 'NEW FARMER'], ['mamaput_joy', 'Fresh food from Mushin farm dey come! Support our farmers 🙌🏾']],
  harvest: [['mushin_gist', 'Farmers for Oya Farm Settlement don harvest {what} today 🌽 Market go full!'], ['aunty_kemi', 'Fresh {what} from the farm. Price go come down small 😄']],
  market: [['aunty_kemi', 'Farm people bring fresh goods come {place} today 🧺 Correct!'], ['mamaput_joy', 'I don buy fresh tomato from the farm guy for {place} 🍅']],
  carbuy: [['ladipo_parts', 'Congrats to our customer wey buy new whip today 🚗🔥 Come Ladipo for parts!', '🚗', 'NEW WHIP']],
};
const CMTS = ['😂😂😂', 'Na wa o', 'E choke!', 'Lagos no dey carry last', 'Omo!', 'True talk 💯', 'Where exactly?', 'God abeg 🙏', 'Make una dey careful o', 'I dey there now!', 'This one na cruise 😂', 'Sharp!', 'Who get am?', 'Wahala be like bicycle 🚲'];
const MYCMTS = ['Fine pic 🔥', 'Correct guy!', 'Where this place?', 'You too much 😂', 'Mushin to the world!', 'Omo this one sweet', 'Send me this pic', 'Who snap you?', 'Big man ting 💯', 'Na here I dey every day 😂', 'Lagos life 🌍', 'Clean!'];
const CARDBG = ['linear-gradient(135deg,#ff9a44,#fc6076)', 'linear-gradient(135deg,#43e97b,#38f9d7)', 'linear-gradient(135deg,#667eea,#764ba2)', 'linear-gradient(135deg,#f7971e,#ffd200)', 'linear-gradient(135deg,#f953c6,#b91d73)', 'linear-gradient(135deg,#00c6ff,#0072ff)', 'linear-gradient(135deg,#c31432,#240b36)'];

/* ---- contacts and what they say on the phone */
const CONTACTS = [
  { id: 'mama', n: 'Mama', c: '#e91e63', e: '👩🏾', num: '0803 555 0101', lines: [['Hello my pikin! You don chop today?', 'Make you no forget to buy bread when you dey come house.', 'God go keep you. Bye bye.'], ['Ah! Na you? I dey market now.', 'Abeg take care of yourself for that Mushin. Bye.']] },
  { id: 'chidi', n: 'Chidi (Paddy)', c: '#27ae60', e: '🧑🏾', num: '0806 555 0123', lines: [['Guy! Wetin dey sup?', 'Tonight we dey go club, you dey inside?', 'Oya na, holla me later.'], ['Bros, I dey shop. Customer full ground.', 'Call me back later abeg.']] },
  { id: 'shege', n: 'Oga Shege', c: '#3e2723', e: '🕶️', num: '0909 555 0666', den: true, lines: [['Who be this?', '...', 'Ehen. If you need anything, come my corner for market. No talk too much for phone.']] },
  { id: 'ride', n: 'Oya Ride Help', c: '#f2b705', e: '🚕', num: '0700 OYA RIDE', lines: [['Welcome to Oya Ride. Your ride, our pride.', 'To book ride, open the Oya Ride app for your phone.', 'Thank you for choosing Oya Ride.']] },
  { id: 'hotel', n: 'Eko Grand Hotel', c: '#6b1f2a', e: '🏨', num: '0201 555 0200', place: 'Eko Grand Hotel', lines: [['Eko Grand Hotel, Ikeja GRA, good day. How may we help you?', 'Rooms from ₦25,000 and suites up to ₦750,000. Pool, golf, spa, wine bar and VELVET club. Come to reception make we book you.', 'Thank you for calling Eko Grand.']] },
  { id: 'mech', n: 'Baba Ladipo (Mechanic)', c: '#795548', e: '🔧', num: '0805 555 0177', lines: [['Hello, Baba Ladipo here.', 'If your motor spoil, bring am come Ladipo. I go fix am sharp sharp.', 'Ok bye bye.']] },
  { id: 'police', n: 'Police Emergency', c: '#1a3a6b', e: '👮', num: '112', police: true },
];

const pick = a => a[Math.floor(Math.random() * a.length)];
const rr = (a, b) => a + Math.random() * (b - a);
const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
function h(tag, cls, ...kids) { const e = document.createElement(tag); if (cls) e.className = cls; for (const k of kids) { if (k == null || k === false) continue; e.append(k instanceof Node ? k : String(k)); } return e; }
function btn(cls, kids, fn, label) { const b = h('button', cls); b.type = 'button'; if (label) b.setAttribute('aria-label', label); [].concat(kids).forEach(k => k != null && b.append(k instanceof Node ? k : String(k))); if (fn) b.addEventListener('click', e => { e.stopPropagation(); fn(e); }); return b; }
function av(p, size) { const a = h('div', 'iph-av'); a.style.background = p.c; a.textContent = p.e || (p.n || '?')[0]; if (size) { a.style.width = a.style.height = size; } return a; }

export function createPhone(api) {
  { const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); }
  const wrap = document.getElementById('phone');
  wrap.className = 'iph-wrap';
  const KEY = 'naija-phone2';
  const S = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })();
  S.photos = S.photos || []; S.mine = S.mine || []; S.followers = S.followers ?? 37; S.wall = S.wall ?? 0; S.recents = S.recents || []; S.tx = S.tx || []; S.threads = S.threads || null; S.name = S.name || '';
  const save = () => { for (let i = 0; i < 4; i++) { try { localStorage.setItem(KEY, JSON.stringify(S)); return; } catch (e) { if (S.photos.length > 4) S.photos.splice(S.photos.length - 3, 3); else return; } } };
  const R = { open: false, app: null, view: null, feed: [], seeded: false, badge: { gist: 0, msg: 0 }, cam: false, selfie: false, call: null, gistTab: 'feed', phoneTab: 'contacts', dial: '' };

  // ---- the phone itself
  const dev = h('div', 'iph'), scr = h('div', 'iph-scr'); dev.append(scr); wrap.append(dev);
  // beside the phone: Close, Home (always back to the home screen) and Back (one step back inside an app)
  const side = h('div', 'iph-side'), sideBtn = (b, k, label) => { b.className = 'iph-sb ' + k; b.innerHTML = `<i>${SB_ICON[k]}</i><span>${label}</span>`; b.dataset.g = k; b.setAttribute('aria-label', label === 'Close' ? 'Put the phone away' : label); return b; };
  const xBtn = document.getElementById('phClose') || h('button'); xBtn.type = 'button'; sideBtn(xBtn, 'close', 'Close');
  const homeB = sideBtn(btn('', [], () => { api.click && api.click(); toHome(); }), 'home', 'Home');
  const backB = sideBtn(btn('', [], () => { api.click && api.click(); goBack(); }), 'back', 'Back');
  side.append(xBtn, homeB, backB); wrap.prepend(side);
  side.addEventListener('pointerdown', e => e.stopPropagation());
  // the phone button in the corner: drawn here, with the count of new messages and Gist on it
  const pBtn = document.getElementById('phoneBtn'), pbN = h('span', 'pb-n'); pbN.hidden = true; let pbLast = 0;
  if (pBtn) { pBtn.innerHTML = `<span class="pb-ic">${PB_SVG}</span>`; pBtn.append(pbN); pBtn.addEventListener('animationend', () => pBtn.classList.remove('bump')); }
  dev.addEventListener('pointerdown', e => e.stopPropagation());
  dev.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
  const wall = h('div', 'iph-wall'); scr.append(wall);
  const setWall = () => { const w = S.wall; wall.style.background = typeof w === 'number' ? (WALLS[w] || WALLS[0]).css : `url(${(S.photos.find(p => p.id === w) || {}).src || ''}) center/cover`; if (typeof w === 'number') wall.style.backgroundSize = 'cover'; };
  const st = h('div', 'iph-st'), timeEl = h('span'); timeEl.id = 'phTime';
  const sig = h('div', 'iph-sig'), bars = h('span', 'iph-bars'); for (const k of [1.1, 1.7, 2.3, 2.8]) { const i = h('i'); i.style.height = k + 'cqw'; bars.append(i); }
  const bat = h('span', 'iph-bat'), batI = h('i'); bat.append(batI); sig.append(h('span', null, 'MTN'), bars, h('span', null, '5G'), bat); st.append(timeEl, sig); scr.append(st);
  const isl = h('div', 'iph-isl'); scr.append(isl);
  const home = h('div', 'iph-home'); scr.append(home);
  const bar = h('div', 'iph-bar'), barHit = btn('iph-barhit', [], () => toHome(), 'Home'); scr.append(bar, barHit);

  const APPS = [
    ['ride', 'Oya Ride', () => openApp('ride')], ['work', 'Oya Work', () => openApp('work')], ['farm', 'Oya Farm', () => openApp('farm')], ['maps', 'Maps', () => { api.openMap(); }], ['photos', 'Photos', () => openApp('photos')],
    ['wallet', 'Bank', () => openApp('wallet')], ['weather', 'Weather', () => openApp('weather')], ['sos', 'Police', () => { openApp('phone'); startCall(CONTACTS.find(c => c.police)); }], ['settings', 'Settings', () => openApp('settings')],
  ];
  const DOCK = [['phone', 'Phone', () => openApp('phone')], ['msg', 'Messages', () => openApp('msg')], ['gist', 'Gist', () => openApp('gist')], ['camera', 'Camera', () => openCamera()]];
  const badges = {};
  function appIcon([k, label, fn]) { const b = btn('iph-ic', [icon(k), h('span', null, label)], e => { const r = b.getBoundingClientRect(), s = scr.getBoundingClientRect(); R.origin = `${r.left - s.left + r.width / 2}px ${r.top - s.top + r.height / 3}px`; api.click && api.click(); fn(); }, label); b.dataset.g = k;
    if (k === 'gist' || k === 'msg') { const bd = h('div', 'iph-badge'); bd.hidden = true; b.append(bd); (badges[k] = badges[k] || []).push(bd); } return b; }
  let widT, widW, widC, widWi, widB, w2s = () => { };
  function buildHome() {
    home.textContent = '';
    const wid = h('div', 'iph-wid');
    const w1 = h('div', 'iph-w'); widT = h('div', 'ph-big'); widW = h('div', 'mid'); w1.append(h('small', null, 'Mushin, Lagos'), widT, widW);
    const w2 = btn('iph-w', [], () => openApp('wallet'), 'Wallet'); widC = h('div', 'mid'); widWi = h('small'); widC.style.fontSize = '6.4cqw'; widB = h('small', null, 'Wallet'); w2.append(widB, widC, widWi);
    w2s = () => { const b = BK.me && bankOf(BK.me.bank); w2.style.background = b ? `linear-gradient(135deg,${b.c}cc,${b.c2}cc)` : 'linear-gradient(135deg,rgba(15,155,88,.75),rgba(11,94,60,.75))'; }; w2s();
    wid.append(w1, w2); home.append(wid);
    const grid = h('div', 'iph-grid'); grid.dataset.g = 'apps'; APPS.forEach(a => grid.append(appIcon(a))); home.append(grid);
    const dots = h('div', 'iph-dots'); dots.append(h('i', 'on'), h('i')); home.append(dots);
    const dock = h('div', 'iph-dock'); dock.dataset.g = 'dock'; DOCK.forEach(a => dock.append(appIcon(a))); home.append(dock);
    refreshHome(); setBadges();
  }
  function refreshHome() {
    const t = api.clock(); timeEl.textContent = t; if (widT) { widT.textContent = t; widW.textContent = `${wxIcon()} ${api.weather()} · ${temp()}°`; widC.textContent = api.naira(api.cash()); widWi.textContent = BK.me ? '••' + BK.me.acct.slice(-4) + ' · Balance' : 'Balance'; widB.textContent = BK.me ? bankOf(BK.me.bank).name : 'Wallet'; w2s(); }
    const lvl = Math.max(.12, 1 - ((Date.now() / 60000) % 240) / 300); batI.style.width = Math.round(lvl * 100) + '%'; batI.style.background = lvl < .2 ? '#ff3b30' : '#fff';
  }
  const temp = () => { const hr = api.hour(), base = 27 + 5 * Math.cos((hr - 14) / 24 * 6.283); return Math.round(base - api.rain() * 4); };
  const wxIcon = () => { const w = (api.weather() || '').toLowerCase(), hr = api.hour(); return /storm|thunder/.test(w) ? '⛈️' : /rain/.test(w) ? '🌧️' : /cloud|haz|harmat/.test(w) ? '⛅' : (hr < 6.3 || hr > 18.7) ? '🌙' : '☀️'; };
  function setBadges() { for (const k in badges) for (const b of badges[k]) { const n = R.badge[k] || 0; b.hidden = !n; b.textContent = n > 9 ? '9+' : n; }
    const n = Object.values(R.badge).reduce((a, b) => a + b, 0); pbN.hidden = !n; pbN.textContent = n > 99 ? '99+' : n;
    if (pBtn) { pBtn.setAttribute('aria-label', n ? `Your phone, ${n} new` : 'Your phone'); if (n > pbLast) { pBtn.classList.remove('bump'); void pBtn.offsetWidth; pBtn.classList.add('bump'); } } pbLast = n; }

  // ---- apps: one screen at a time, with a back button
  function frameApp(title, { light = false, back = null, right = null } = {}) {
    const same = R.view && R.view.dataset.app === R.app + ':' + title, sc0 = same && R.body ? R.body.scrollTop : 0; if (R.view) R.view.remove(); home.classList.add('away');
    const v = h('div', 'iph-app' + (light ? ' light' : '')); v.dataset.app = R.app + ':' + title; if (R.origin) v.style.transformOrigin = R.origin; if (same) v.style.animation = 'none';
    const nav = h('div', 'iph-nav'), t = h('h1', null, title);
    if (back) nav.append(btn('iph-back', [h('b', null, '‹'), back[0]], back[1]));
    else nav.append(t);
    if (back) { t.style.fontSize = '4.6cqw'; t.style.textAlign = 'center'; nav.append(t); }
    nav.append(right || h('span', 'iph-act'));
    const body = h('div', 'iph-body'); v.append(nav, body); scr.insertBefore(v, isl); R.view = v; R.body = body; R.back = back ? back[1] : goHome; syncNav(); if (sc0) requestAnimationFrame(() => { body.scrollTop = sc0; }); return body;
  }
  function goHome() { R.app = null; R.back = null; if (R.view) { const v = R.view; v.style.transition = 'transform .22s, opacity .22s'; v.style.transform = 'scale(.4)'; v.style.opacity = '0'; setTimeout(() => v.remove(), 220); R.view = null; } home.classList.remove('away'); refreshHome(); setBadges(); syncNav(); }
  function toHome() { if (R.call) endCall(true); const b = scr.querySelector('.iph-hud'); if (b) b.remove(); goHome(); }
  function goBack() { if (R.call) { endCall(); return; } if (!R.app) return; (R.back || goHome)(); }
  function syncNav() { backB.disabled = !(R.app || R.call); }
  function phToast(t) { const o = scr.querySelector('.iph-hud'); if (o) o.remove(); const d = h('div', 'iph-hud', t); scr.append(d); setTimeout(() => d.remove(), 1900); }
  function openApp(k, arg) { R.app = k; ({ ride: rideApp, work: workApp, farm: farmApp, gist: gistApp, msg: msgApp, phone: phoneApp, photos: photosApp, wallet: walletApp, weather: weatherApp, settings: settingsApp })[k](arg); }

  function rideApp() { const b = frameApp('Oya Ride'); b.id = 'phBody'; b.style.paddingTop = '0'; R.view.querySelector('h1').style.color = '#f2b705'; api.rideUI(); }
  function farmApp() {   // Oya Farm: your beds, animals, store, the pickup, today's prices (the farm itself is in src/farm.js)
    const d = api.farm && api.farm(); const b = frameApp('Oya Farm', { light: true }); R.view.querySelector('h1').style.color = '#2e7d1f';
    if (!d) { b.append(h('div', 'iph-note', 'The farm is still loading. Try again small time.')); return; }
    for (const sec of d.sections) { if (sec.h) b.append(h('div', 'iph-h', sec.h)); const L = h('div', 'iph-list');
      for (const r of sec.rows) { const row = h('div', 'iph-li'), tx = h('div', 'tx'); tx.append(h('b', null, r.name), r.sub ? h('small', null, r.sub) : null); if (r.warn) tx.firstChild.style.color = '#d0451b'; row.append(tx);
        if (r.btn) { const bb = btn('fm-btn' + (r.off ? ' off' : ''), [r.btn], () => { if (r.off || !r.act) return; r.act(); setTimeout(() => { if (R.app === 'farm') openApp('farm'); }, 60); }); row.append(bb); }
        L.append(row); }
      b.append(L); } }
  function workApp() { const b = frameApp('Oya Work'); b.id = 'phBody'; b.style.paddingTop = '0'; R.view.querySelector('h1').style.color = '#1fcf8a'; api.workUI(); }

  // ---------------------------------------------------------------- Gist: the Lagos social feed
  const fill = s => s.replace(/\{(\w+)\}/g, (m, k) => {
    if (k === 'n') return (Math.round(rr(18, 45)) * 1000).toLocaleString('en-NG');
    const L = api.names(k); return L && L.length ? pick(L) : 'Mushin'; });
  function npcPost(tpl, extra = {}, t = Date.now()) {
    const [hh, txt, em, cap] = tpl; const p = { id: 'p' + Math.random().toString(36).slice(2, 9), h: hh, t, text: fill(txt), likes: Math.round(rr(4, 380)), cm: [], liked: false, ...extra };
    if (em) p.card = { e: em, bg: pick(CARDBG), cap: cap ? fill(cap) : '' };
    const n = Math.floor(rr(0, 3.2)); for (let i = 0; i < n; i++) p.cm.push({ h: pick(FOLK).h, t: pick(CMTS) });
    p.cmN = p.cm.length + Math.floor(rr(0, 14)); return p;
  }
  function moodKeys() { const hr = api.hour(), w = (api.weather() || '').toLowerCase(), k = ['traffic', 'food', 'market', 'vibes', 'vibes', 'nepa', 'police', 'hotel'];
    if (/rain|storm/.test(w)) k.push('rain', 'rain'); else if (hr > 10 && hr < 17) k.push('sun'); if (hr > 19 || hr < 3) k.push('night', 'night'); return k; }
  function seedFeed() { if (R.seeded) return; R.seeded = true; const now = Date.now(), keys = moodKeys();
    for (let i = 0; i < 14; i++) R.feed.push(npcPost(pick(POSTS[pick(keys)]), {}, now - (i * rr(4, 22) + rr(1, 5)) * 60000)); }
  function feedAll() { S.mine.forEach(p => { p.h = 'me'; }); return [...R.feed, ...S.mine].sort((a, b) => b.t - a.t); }
  const meP = () => ({ n: S.name || api.playerName() || 'You', c: '#0a84ff', e: '🙂', h: 'me' });
  function postEl(p, full) {
    const u = p.h === 'me' ? meP() : who(p.h), el = h('div', 'gx-post'), hd = h('div', 'gx-hd'), nm = h('b', null, u.n); if (u.v) nm.append(h('span', 'gx-v', '✓'));
    const meta = h('div'); meta.append(nm, h('small', null, `@${p.h === 'me' ? (S.name || 'you').toLowerCase().replace(/\W+/g, '_') : p.h} · ${ago(p.t)}${p.where ? ' · ' + p.where : ''}`)); hd.append(av(u), meta); el.append(hd);
    if (p.text) el.append(h('p', 'gx-tx', p.text));
    if (p.img || p.card) { const m = h('div', 'gx-media'); if (p.img) { const ph = S.photos.find(q => q.id === p.img); const im = h('img'); im.alt = 'photo'; im.src = ph ? ph.src : ''; m.append(im); } else { m.style.background = p.card.bg; m.append(p.card.e); if (p.card.cap) m.append(h('em', null, p.card.cap)); } el.append(m); }
    const acts = h('div', 'gx-acts'), lk = btn(p.liked ? 'liked' : '', [p.liked ? '♥' : '♡', ' ', String(p.likes)], () => { p.liked = !p.liked; p.likes += p.liked ? 1 : -1; if (p.h === 'me') save(); lk.className = p.liked ? 'liked' : ''; lk.textContent = (p.liked ? '♥ ' : '♡ ') + p.likes; }, 'Like');
    acts.append(lk, btn('', ['💬 ', String(p.cmN ?? p.cm.length)], () => openApp('gist', { post: p.id }), 'Comments'), btn('', ['↗'], () => phToast('Link don copy ✓'), 'Share')); el.append(acts);
    for (const c of (full ? p.cm : p.cm.slice(0, 2))) { const cu = c.h === 'me' ? meP() : who(c.h), d = h('p', 'gx-cm'); d.append(h('b', null, cu.n), c.t); el.append(d); }
    if (!full && p.cm.length > 2) el.append(btn('gx-cm', [`View all ${p.cm.length} comments`], () => openApp('gist', { post: p.id })));
    return el;
  }
  function findPost(id) { return R.feed.find(p => p.id === id) || S.mine.find(p => p.id === id); }
  function gistApp(arg = {}) {
    seedFeed(); R.badge.gist = 0; setBadges();
    if (arg.post) { const p = findPost(arg.post); const b = frameApp('Post', { back: ['Gist', () => openApp('gist')] }); if (!p) return; b.append(postEl(p, true));
      const inp = h('input', 'iph-in'); inp.placeholder = 'Add a comment…'; inp.maxLength = 120; inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') send(inp.value); });
      const chips = h('div', 'iph-chips'); ['😂😂', 'Na wa o', 'E choke! 🔥', 'Where exactly?', 'God abeg 🙏'].forEach(t => chips.append(btn('', [t], () => send(t))));
      const send = t => { t = (t || '').trim(); if (!t) return; p.cm.push({ h: 'me', t }); p.cmN = (p.cmN || 0) + 1; if (p.h === 'me') save(); openApp('gist', { post: p.id }); if (p.h !== 'me' && Math.random() < .6) setTimeout(() => { p.cm.push({ h: p.h, t: pick(['😂 you sabi', 'Thank you o', 'True!', 'Abeg no vex', 'You dey there too?']) }); p.cmN++; if (R.app === 'gist') openApp('gist', { post: p.id }); }, rr(4000, 9000)); };
      b.append(chips, inp); return; }
    if (arg.compose) return compose(arg.compose);
    const b = frameApp('Gist', { right: btn('iph-act', ['＋'], () => compose(), 'New post') });
    const seg = h('div', 'iph-seg'); seg.dataset.g = 'gisttabs'; [['feed', 'For you'], ['around', 'Around you'], ['me', 'My profile']].forEach(([k, l]) => seg.append(btn(R.gistTab === k ? 'on' : '', [l], () => { R.gistTab = k; openApp('gist'); })));
    b.append(seg);
    if (R.gistTab === 'feed') feedAll().slice(0, 40).forEach(p => b.append(postEl(p)));
    else if (R.gistTab === 'around') { const L = api.around(); b.append(h('div', 'iph-note', `Wetin dey happen near ${api.where()}`)); if (!L.length) b.append(h('div', 'iph-note', 'Everywhere calm for now. Check back small time.'));
      for (const a of L) { const r = h('div', 'gx-around'), t = h('div'); t.append(h('b', null, a.text), h('small', null, a.sub || '')); r.append(h('i', null, a.icon || '📍'), t); b.append(r); } }
    else { const me = meP(), top = h('div', 'gx-around'); top.append(av(me, '16cqw')); const t = h('div'); t.append(h('b', null, me.n), h('small', null, `${S.followers} followers · ${S.mine.length} posts`)); top.append(t); b.append(top);
      b.append(btn('iph-btn', ['New post'], () => compose()));
      if (!S.mine.length) b.append(h('div', 'iph-note', 'You never post anything. Snap something with Camera and share am!'));
      S.mine.slice().sort((a, c) => c.t - a.t).forEach(p => { p.h = 'me'; b.append(postEl(p)); }); }
    const fab = btn('gx-new', ['＋'], () => compose(), 'New post'); fab.dataset.g = 'gistnew'; R.view.append(fab); api.guide && api.guide('gist');
  }
  function compose(photoId) {
    const b = frameApp('New post', { back: ['Cancel', () => openApp('gist')] }); let sel = photoId || (S.photos[0] && S.photos[0].id) || null;
    const prev = h('div', 'gx-media'); prev.style.aspectRatio = '4/3'; const showSel = () => { prev.textContent = ''; const ph = S.photos.find(p => p.id === sel); if (ph) { const im = h('img'); im.src = ph.src; im.alt = 'photo'; prev.append(im); } else { prev.style.background = '#1c1c1e'; prev.style.fontSize = '4cqw'; prev.append(h('span', null, 'No photo. Pick one below or post only text.')); } };
    showSel(); b.append(prev);
    if (S.photos.length) { const g = h('div', 'px-grid'); g.style.margin = '0 0 3cqw'; S.photos.slice(0, 9).forEach(p => { const im = h('img'); im.src = p.src; im.alt = ''; g.append(btn('', [im], () => { sel = p.id; showSel(); })); }); b.append(g); }
    else b.append(btn('iph-btn gray', ['📷 Snap a photo first'], () => openCamera()));
    const inp = h('input', 'iph-in'); inp.placeholder = 'Wetin dey your mind?'; inp.maxLength = 160; inp.addEventListener('keydown', e => e.stopPropagation());
    const chips = h('div', 'iph-chips'); ['Mushin to the world 🌍', 'Lagos life 🔥', 'Who dey here? 😂', 'Correct vibes only', 'Na my area be this'].forEach(t => chips.append(btn('', [t], () => { inp.value = t; })));
    b.append(inp, chips, btn('iph-btn', ['Post'], () => {
      const text = inp.value.trim(); if (!text && !sel) { phToast('Write something or pick a photo'); return; }
      const p = { id: 'm' + Date.now().toString(36), h: 'me', t: Date.now(), text, img: sel, likes: 0, cm: [], cmN: 0, where: api.where() }; S.mine.push(p); if (S.mine.length > 30) S.mine.shift(); save();
      R.gistTab = 'me'; openApp('gist'); phToast('Your post don land ✓'); reactTo(p); }));
  }
  function reactTo(p) {   // people like and comment on your post over the next minutes; you get followers
    const total = Math.round(rr(.15, .6) * S.followers + rr(3, 18) + (p.img ? 10 : 0)); let given = 0;
    const step = () => { if (given >= total) return; const k = Math.min(total - given, Math.ceil(rr(1, total / 4 + 1))); given += k; const q = S.mine.find(x => x.id === p.id); if (!q) return; q.likes += k;
      if (Math.random() < .55) { const u = pick(FOLK); q.cm.push({ h: u.h, t: pick(MYCMTS) }); q.cmN = q.cm.length; notify('gist', `@${u.h}`, `commented: ${q.cm[q.cm.length - 1].t}`); }
      else notify('gist', 'Gist', `${k} people like your post`, true);
      if (Math.random() < .5) S.followers += Math.ceil(rr(1, 5)); save(); if (R.app === 'gist' && R.gistTab === 'me' && !R.call) openApp('gist'); setTimeout(step, rr(9000, 26000)); };
    setTimeout(step, rr(5000, 12000));
  }
  let nextPost = Date.now() + rr(40000, 80000);
  function tickGist() { if (Date.now() < nextPost) return; nextPost = Date.now() + rr(55000, 120000); seedFeed(); const p = npcPost(pick(POSTS[pick(moodKeys())])); R.feed.unshift(p); if (R.feed.length > 60) R.feed.pop(); notify('gist', '@' + p.h, p.text, true); }
  // something happened in the game: people post about it a little later
  const evLast = {};
  function gistEvent(kind, d = {}) { const L = EVENTS[kind]; if (!L || (evLast[kind] && Date.now() - evLast[kind] < 45000)) return; evLast[kind] = Date.now(); seedFeed();
    setTimeout(() => { const tpl = pick(L), place = d.place || api.where(), area = d.area || place; const p = npcPost([tpl[0], tpl[1].replace('{place}', place).replace('{area}', area).replace('{what}', d.what || 'food'), tpl[2], tpl[3]]); p.likes = Math.round(rr(20, 600)); R.feed.unshift(p); notify('gist', '@' + p.h, p.text); }, rr(6000, 18000)); }

  // ---------------------------------------------------------------- Messages
  const TH0 = () => [
    { id: 'mama', n: 'Mama', c: '#e91e63', e: '👩🏾', m: [{ t: Date.now() - 3600e3, x: 'Where you dey? Buy bread come house when you dey come.' }, { t: Date.now() - 3500e3, x: 'And no follow bad friends for that Mushin o!' }], unread: 2, rep: ['Ok Mama', 'I dey come now', 'I don chop'], ans: ['God bless you my pikin', 'Ehen, make you hurry', 'Ok o. Take care'] },
    { id: 'chidi', n: 'Chidi (Paddy)', c: '#27ae60', e: '🧑🏾', m: [{ t: Date.now() - 7200e3, x: 'Bros, you go come club tonight? 🎉' }], unread: 1, rep: ['I dey come', 'I no fit today', 'Which club?'], ans: ['Correct! 🔥', 'Ah you dey whine me 😂', 'The one wey dey Mushin na. Na there we dey'] },
    { id: 'bank', n: 'Bank', c: '#0f9b58', e: '🏦', m: [{ t: Date.now() - 86400e3, x: 'Welcome to mobile banking. Your money dey safe with us.' }], unread: 0, rep: [] },
    { id: 'oyaride', n: 'Oya Ride', c: '#f2b705', e: '🚕', m: [{ t: Date.now() - 86400e3 * 2, x: 'Thanks for joining Oya Ride! Book car or okada anytime from the app.' }], unread: 0, rep: [] },
  ];
  if (!S.threads) S.threads = TH0();
  R.badge.msg = S.threads.reduce((a, t) => a + (t.unread || 0), 0);
  function thread(id, n, c, e) { let t = S.threads.find(x => x.id === id); if (!t) { t = { id, n, c, e, m: [], unread: 0, rep: [] }; S.threads.unshift(t); } else if (id === 'bank') { t.n = n; t.c = c; } return t; }
  function sms(id, n, c, e, x) { const t = thread(id, n, c, e); t.m.push({ t: Date.now(), x }); if (t.m.length > 40) t.m.shift(); S.threads = [t, ...S.threads.filter(q => q !== t)];
    if (R.app === 'msg' && R.thread === id) openApp('msg', id); else { t.unread = (t.unread || 0) + 1; R.badge.msg++; notify('msg', n, x); } save(); }
  function msgApp(id) {
    if (id) { const t = S.threads.find(x => x.id === id); R.thread = id; if (!t) return; R.badge.msg = Math.max(0, R.badge.msg - (t.unread || 0)); t.unread = 0; save(); setBadges();
      const b = frameApp(t.n, { back: ['Back', () => { R.thread = null; openApp('msg'); }] }), th = h('div', 'mx-th');
      let last = 0; for (const m of t.m) { if (m.t - last > 1800e3) th.append(h('div', 'mx-t', new Date(m.t).toLocaleString('en-NG', { weekday: 'short', hour: '2-digit', minute: '2-digit' }))); last = m.t; th.append(h('div', 'mx-b ' + (m.me ? 'me' : 'them'), m.x)); }
      b.append(th); if (t.rep && t.rep.length) { const ch = h('div', 'iph-chips'); t.rep.forEach((r, i) => ch.append(btn('', [r], () => { t.m.push({ t: Date.now(), x: r, me: 1 }); save(); openApp('msg', id); if (t.ans) setTimeout(() => sms(t.id, t.n, t.c, t.e, t.ans[i] || pick(t.ans)), rr(2500, 6000)); }))); b.append(ch); }
      setTimeout(() => { b.scrollTop = b.scrollHeight; }, 30); return; }
    R.thread = null; const b = frameApp('Messages'), L = h('div', 'iph-list');
    for (const t of S.threads) { const last = t.m[t.m.length - 1]; const r = btn('iph-li', [], () => openApp('msg', t.id)), tx = h('div', 'tx'); tx.append(h('b', null, t.n), h('small', null, last ? last.x : '')); r.append(av(t), tx, h('span', 'rt', last ? ago(last.t) : '')); if (t.unread) r.append(h('span', 'iph-badge', t.unread)); r.lastChild.style && (r.lastChild.style.position = 'static'); L.append(r); }
    b.append(L);
  }

  // ---------------------------------------------------------------- Phone: contacts, recents, keypad, calls
  function phoneApp() {
    const b = frameApp('Phone'), seg = h('div', 'iph-seg'); [['contacts', 'Contacts'], ['recents', 'Recents'], ['keypad', 'Keypad']].forEach(([k, l]) => seg.append(btn(R.phoneTab === k ? 'on' : '', [l], () => { R.phoneTab = k; openApp('phone'); }))); b.append(seg);
    if (R.phoneTab === 'contacts') { const sos = btn('iph-btn red', ['🚨  Call police (112)'], () => startCall(CONTACTS.find(c => c.police))); b.append(sos); const L = h('div', 'iph-list');
      for (const c of CONTACTS) { const r = btn('iph-li', [], () => startCall(c)), tx = h('div', 'tx'); tx.append(h('b', null, c.n), h('small', null, c.num)); r.append(av(c), tx, h('span', 'rt', '📞')); L.append(r); } b.append(L); }
    else if (R.phoneTab === 'recents') { if (!S.recents.length) b.append(h('div', 'iph-note', 'No calls yet.')); const L = h('div', 'iph-list');
      for (const r0 of S.recents.slice(0, 20)) { const c = CONTACTS.find(c => c.id === r0.id) || { n: r0.num, c: '#555', e: '📞', num: r0.num }; const r = btn('iph-li', [], () => startCall(c.id ? c : { n: r0.num, num: r0.num, c: '#555', e: '📞', unknown: true })), tx = h('div', 'tx'); tx.append(h('b', null, c.n), h('small', null, r0.out ? 'Outgoing' : 'Missed')); r.append(av(c), tx, h('span', 'rt', ago(r0.t))); L.append(r); } if (L.children.length) b.append(L); }
    else { const num = h('div', 'kp-num', R.dial || ' '), kp = h('div', 'kp'), sub = { 2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL', 6: 'MNO', 7: 'PQRS', 8: 'TUV', 9: 'WXYZ', 0: '+' };
      for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']) kp.append(btn('', [k, sub[k] ? h('small', null, sub[k]) : null], () => { if (R.dial.length < 14) R.dial += k; num.textContent = R.dial; api.beep && api.beep(700 + (+k || 5) * 40, .08); }));
      kp.append(h('span'), btn('call', [ICONS.phone[2] ? (() => { const s = h('span'); s.innerHTML = ICONS.phone[2]; s.firstChild.style.width = '45%'; return s; })() : '📞'], () => { const d = R.dial.replace(/\D/g, ''); if (!d) return; const c = /^(112|199|767|911)$/.test(d) ? CONTACTS.find(c => c.police) : CONTACTS.find(c => c.num.replace(/\D/g, '') === d) || { n: R.dial, num: R.dial, c: '#555', e: '📞', unknown: true }; R.dial = ''; startCall(c); }, 'Call'), btn('', ['⌫'], () => { R.dial = R.dial.slice(0, -1); num.textContent = R.dial || ' '; }, 'Delete'));
      b.append(num, kp); }
  }
  function startCall(c) {
    endCall(true); S.recents.unshift({ id: c.id || null, num: c.num, t: Date.now(), out: 1 }); S.recents.length = Math.min(S.recents.length, 30); save();
    const box = h('div', 'cx'), status = h('p', 's', 'calling…'), say = h('div', 'cx-say'), ch = h('div', 'cx-ch');
    const end = btn('cx-end', [], () => endCall(), 'End call'); end.innerHTML = SV('<path d="M3 15.5c5-4.6 13-4.6 18 0l-2.4 2.4-3.6-1.6v-2.6a12 12 0 0 0-6 0v2.6l-3.6 1.6z" fill="#fff" stroke="none"/>');
    box.append(av(c), h('h2', null, c.n), status, say, ch, end); scr.append(box);
    isl.classList.add('wide'); isl.textContent = '📞 ' + c.n;
    const C = R.call = { c, box, status, say, ch, t0: 0, timers: [], on: true }; syncNav();
    const later = (ms, fn) => { const id = setTimeout(() => { if (R.call === C) fn(); }, ms); C.timers.push(id); };
    const line = (txt, me) => { const d = h('div', me ? 'me' : null, txt); say.append(d); say.scrollTop = say.scrollHeight; };
    const ring = n => { for (let i = 0; i < n; i++) later(i * 1600, () => api.beep && api.beep(425, .5, .25)); };
    const choose = (opts) => { ch.textContent = ''; for (const [l, fn] of opts) ch.append(btn('', [l], () => { ch.textContent = ''; fn(); })); };
    const timer = () => { C.t0 = Date.now(); const tk = () => { if (R.call !== C) return; const s = Math.floor((Date.now() - C.t0) / 1000); status.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; later(500, tk); }; tk(); };
    if (c.unknown) { ring(2); later(3300, () => { status.textContent = 'not reachable'; line('The number you are trying to call is not reachable at the moment. Please try again later.'); later(4800, () => endCall()); }); return; }
    if (c.police) { ring(1); later(1500, () => { timer(); line('112 Emergency. Wetin happen?');
      const where = kind => { line(kind, true); later(900, () => { line('Where e dey happen?'); const near = api.nearPlaces(5);
        choose([[`📍 Here (${api.where()})`, () => send(null, kind)], ...near.map(p => [`${p.name} · ${p.dist}`, () => send(p, kind)]), ['Another place…', () => more(kind)]]); }); };
      const more = kind => { ch.textContent = ''; const inp = h('input', 'iph-in'); inp.placeholder = 'Type the place name'; inp.addEventListener('keydown', e => e.stopPropagation()); const L = h('div', 'cx-ch');
        const fillL = () => { L.textContent = ''; api.searchPlaces(inp.value, 6).forEach(p => L.append(btn('', [`${p.name} · ${p.dist}`], () => { ch.textContent = ''; send(p, kind); }))); };
        inp.addEventListener('input', fillL); ch.append(inp, L); fillL(); setTimeout(() => inp.focus(), 50); };
      const send = (p, kind) => { line(p ? p.name : 'For where I dey now', true); const r = api.callPolice(p, kind);
        later(1200, () => { if (r && r.ok) { line(`Okay. Our men dey come ${p ? p.name : 'your side'} now now. Dem go reach in about ${r.eta}.`); later(2200, () => line('Stay safe. No go near trouble.')); later(4800, () => endCall()); sms('police', 'Police 112', '#1a3a6b', '👮', `Your report don reach us. Patrol team don move go ${p ? p.name : r.where}. Ref: LAG-${Math.floor(rr(10000, 99999))}`); gistEvent('police', { place: p ? p.name : r.where }); }
          else { line(r && r.msg ? r.msg : 'All our vans dey another place now. We go come as soon as we fit.'); later(3500, () => endCall()); } }); };
      later(900, () => choose([['🥊 Fight / people dey fight', () => where('Fight dey happen')], ['🔫 Robbery or gun', () => where('Robbery! Dem get gun')], ['🚗 Accident', () => where('Accident happen')], ['👀 Suspicious people', () => where('Some people dey do somehow')]])); }); return; }
    ring(1 + Math.floor(Math.random() * 2)); const L = pick(c.lines);
    later(1600 + Math.random() * 1500, () => { timer(); let t = 0; L.forEach((x, i) => later(t += 1100 + x.length * 38, () => line(x)));
      if (c.den) later(t + 600, () => { const p = api.denPlace && api.denPlace(); if (p) { api.setDest(p); line('(Oga Shege don send you location. Check your map.)', true); } });
      if (c.place) later(t + 600, () => { const p = api.searchPlaces(c.place, 1)[0]; if (p) { choose([['📍 Show me the way', () => { api.setDest(p); line('Okay, I dey come.', true); later(1200, () => endCall()); }], ['Bye', () => endCall()]]); } });
      later(t + (c.place ? 9000 : 2600), () => endCall()); });
  }
  function endCall(quiet) { const C = R.call; if (!C) return; R.call = null; syncNav(); C.timers.forEach(clearTimeout); isl.classList.remove('wide'); isl.textContent = ''; if (quiet) { C.box.remove(); return; } C.status.textContent = 'call ended'; setTimeout(() => C.box.remove(), 700); }

  // ---------------------------------------------------------------- Camera and Photos
  const camui = h('div', 'camui'); camui.hidden = true; const grid = h('div', 'g');
  const top = h('div', 'top'), modes = h('div', 'modes'), mPhoto = btn('on', ['PHOTO'], () => setSelfie(false)), mSelfie = btn('', ['SELFIE'], () => setSelfie(true)); modes.append(mPhoto, mSelfie);
  top.append(btn('rnd', ['✕'], () => closeCamera(), 'Close camera'), modes, h('span', 'zoom', '1×'));
  const cside = h('div', 'side'), thumb = btn('thumb', [], () => { closeCamera(); api.reopen(); openApp('photos'); }, 'Your photos'), shut = btn('shut', [], () => shoot(), 'Take photo'), flip = btn('rnd', ['🔄'], () => setSelfie(!R.selfie), 'Selfie camera');
  shut.dataset.g = 'shutter'; modes.dataset.g = 'modes'; cside.append(flip, shut, thumb); camui.append(grid, top, cside);
  (document.querySelector('.hud') || document.body).append(camui);
  function setThumb() { thumb.textContent = ''; const p = S.photos[0]; if (p) { const im = h('img'); im.src = p.src; im.alt = ''; thumb.append(im); } }
  function setSelfie(on) { R.selfie = on; mPhoto.className = on ? '' : 'on'; mSelfie.className = on ? 'on' : ''; }
  function openCamera() { if (!api.canCamera()) { phToast('You no fit use camera now'); return; } R.cam = true; setSelfie(false); setThumb(); camui.hidden = false; wrap.hidden = true; document.body.classList.add('ph-cam'); api.camMode(true); api.guide && api.guide('camera'); }
  function closeCamera() { if (!R.cam) return; R.cam = false; R.selfie = false; camui.hidden = true; document.body.classList.remove('ph-cam'); api.camMode(false); if (R.open) wrap.hidden = false; }
  async function shoot() {
    if (R.shooting) return; R.shooting = true; api.beep && api.beep(1800, .05, .3);
    try { const cvs = await api.snap(); const W = 720, H = Math.round(W * cvs.height / cvs.width), c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(cvs, 0, 0, W, H);
      const src = c.toDataURL('image/jpeg', .78); S.photos.unshift({ id: 'ph' + Date.now().toString(36), t: Date.now(), src, where: api.where() }); if (S.photos.length > 24) S.photos.length = 24; save(); setThumb();
      const f = h('div', 'camflash'); document.body.append(f); setTimeout(() => f.remove(), 400); }
    catch (e) { api.toast('Camera no work this time.'); }
    R.shooting = false;
  }
  function photosApp(id) {
    if (id) { const p = S.photos.find(x => x.id === id); const b = frameApp('Photo', { back: ['Photos', () => openApp('photos')] }); if (!p) return; const v = h('div', 'px-view'), im = h('img'); im.src = p.src; im.alt = 'photo'; v.append(im, h('div', 'iph-note', `${p.where || ''} · ${ago(p.t)} ago`)); b.append(v,
      btn('iph-btn', ['Post on Gist'], () => openApp('gist', { compose: p.id })), btn('iph-btn gray', ['Set as wallpaper'], () => { S.wall = p.id; save(); setWall(); phToast('Wallpaper don change ✓'); }),
      btn('iph-btn red', ['Delete'], () => { S.photos = S.photos.filter(x => x !== p); if (S.wall === p.id) { S.wall = 0; setWall(); } save(); openApp('photos'); })); return; }
    const b = frameApp('Photos', { right: btn('iph-act', ['📷'], () => openCamera(), 'Camera') });
    if (!S.photos.length) { b.append(h('div', 'iph-note', 'No photos yet. Open Camera and snap Lagos!'), btn('iph-btn', ['Open Camera'], () => openCamera())); return; }
    const g = h('div', 'px-grid'); S.photos.forEach(p => { const im = h('img'); im.src = p.src; im.alt = 'photo'; im.loading = 'lazy'; g.append(btn('', [im], () => openApp('photos', p.id))); }); b.append(h('div', 'iph-note', `${S.photos.length} photos`), g);
  }

  // ---------------------------------------------------------------- Wallet, Weather, Settings
  // ---------------------------------------------------------------- Bank: your account (a bank, a 10-digit number), send money to other players
  // (online: the server keeps the accounts; as a guest it is only the cash you carry)
  const BK = { me: null, banks: {}, hist: [], rules: null, view: 'home', f: null, rc: null, want: false };
  const BANKS0 = { gidi: { name: 'Gidi Bank', c: '#0f8a4a', c2: '#06512b' }, zobo: { name: 'Zobo Bank', c: '#9b1f4f', c2: '#560c2a' }, agege: { name: 'Agege Trust Bank', c: '#c77d0a', c2: '#6e4204' } };
  const bankOf = k => BK.banks[k] || BANKS0[k] || { name: 'Bank', c: '#0f9b58', c2: '#0b5e3c' };
  const acctFmt = a => a ? a.slice(0, 3) + ' ' + a.slice(3, 6) + ' ' + a.slice(6) : '';
  const feeOf = (n, same) => same ? 0 : n <= 5000 ? 10 : n <= 50000 ? 25 : 50;
  const bkAlert = (x, msg) => { const b = BK.me ? bankOf(BK.me.bank) : null; sms('bank', b ? b.name : 'Bank', b ? b.c : '#0f9b58', '🏦', msg); };
  const rcRows = (rows) => { const d = h('div', 'bk-rc'); for (const [k, v] of rows) { if (v == null || v === '') continue; const r = h('div'); r.append(h('span', null, k), h('b', null, v)); d.append(r); } return d; };
  function bankMsg(m) {   // what the server says about your account
    if (m.t === 'bkout') { BK.me = null; BK.hist = []; BK.view = 'home'; BK.f = null; if (R.app === 'wallet') openApp('wallet'); refreshHome(); return; }
    if (m.t === 'bk') { BK.me = m.me; BK.banks = m.banks || BK.banks; BK.hist = m.hist || []; BK.rules = m.rules || BK.rules;
      // money that came while you were away: the alerts now
      const seen = (S.bkSeen = S.bkSeen || {}), last = seen[m.me.acct]; const inc = BK.hist.filter(x => x.d > 0 && (last == null ? Date.now() - x.t < 864e5 : x.id > last)).slice(0, 3);
      for (const x of inc.reverse()) bkAlert(x, `Credit Alert!\nAcct: ••${m.me.acct.slice(-4)}\nAmt: ${api.naira(x.d)}\nFrom: ${x.who} (${bankOf(x.bank).name})${x.note ? `\nDesc: ${x.note}` : ''}`);
      seen[m.me.acct] = BK.hist.reduce((a, x) => Math.max(a, x.id), last || 0); save();
      if (R.app === 'wallet') openApp('wallet'); refreshHome(); return; }
    if (m.t === 'bkname') { const f = BK.f; if (!f || f.acct !== m.acct || f.bank !== m.bank) return; f.name = m.name; f.self = !!m.me; f.nmsg = m.name ? '' : m.m || 'Account not found.'; f.asking = false; if (R.app === 'wallet' && BK.view === 'send') openApp('wallet'); return; }
    if (m.t === 'bksent') { const x = m.tx; if (x && !BK.hist.some(y => y.id === x.id)) BK.hist.unshift(x); BK.rc = x; BK.f = null; BK.view = 'done';
      if (x && !m.again) { bkAlert(x, `Debit Alert!\nAcct: ••${BK.me ? BK.me.acct.slice(-4) : ''}\nAmt: ${api.naira(-x.d)}${x.fee ? `\nFee: ${api.naira(x.fee)}` : ''}\nTo: ${x.who} (${bankOf(x.bank).name})${x.note ? `\nDesc: ${x.note}` : ''}\nBal: ${api.naira(api.cash())}`); S.bkSeen = S.bkSeen || {}; }
      if (R.app === 'wallet') openApp('wallet'); refreshHome(); return; }
    if (m.t === 'bktx') { const x = m.tx; if (!x || BK.hist.some(y => y.id === x.id)) return; BK.hist.unshift(x); if (BK.me) { (S.bkSeen = S.bkSeen || {})[BK.me.acct] = Math.max(S.bkSeen[BK.me.acct] || 0, x.id); save(); }
      setTimeout(() => bkAlert(x, `Credit Alert!\nAcct: ••${BK.me ? BK.me.acct.slice(-4) : ''}\nAmt: ${api.naira(x.d)}\nFrom: ${x.who} (${bankOf(x.bank).name})${x.note ? `\nDesc: ${x.note}` : ''}\nBal: ${api.naira(api.cash())}`), 300);
      if (R.app === 'wallet' && BK.view === 'home') openApp('wallet'); refreshHome(); return; }
    if (m.t === 'err') { if (BK.f) { BK.f.err = m.m; BK.f.busy = false; BK.f.asking = false; if (BK.view === 'confirm') BK.view = 'send'; } if (R.app === 'wallet') openApp('wallet'); else api.toast(m.m, 3); return; }
  }
  function walletApp() {
    const online = api.online && api.online();
    if (!online || !BK.me) { BK.view = 'home';
      const b = frameApp('Bank'), card = h('div', 'wx-card'); card.append(h('div', 'bk-top', 'Wallet', h('i', null, 'cash')), h('div', 'ph-big', api.naira(api.cash())), h('small', null, 'The money you carry')); b.append(card);
      if (online) { b.append(h('div', 'iph-note', 'Opening your bank account…')); if (!BK.want) { BK.want = true; api.bankSend && api.bankSend({ a: 'me' }); setTimeout(() => { BK.want = false; }, 5000); } }
      else { b.append(h('div', 'iph-note', 'Sign in online to get your own bank account: a bank, a 10-digit account number, and send money to other players.')); if (api.openOnline) b.append(btn('iph-btn', ['Go online'], () => api.openOnline())); }
      b.append(btn('iph-btn gray', ['💼 Find work (Oya Work)'], () => openApp('work'))); localTx(b); return; }
    const me = BK.me, bk = bankOf(me.bank);
    if (BK.view === 'send' || BK.view === 'confirm') return sendView(BK.view === 'confirm');
    if (BK.view === 'done' && BK.rc) { const x = BK.rc, b = frameApp('Transfer', { back: ['Bank', () => { BK.view = 'home'; BK.rc = null; openApp('wallet'); }] });
      b.append(h('div', 'bk-ok', '✅'), h('div', 'bk-big', api.naira(-x.d)), h('div', 'iph-note', 'Transfer successful'));
      b.append(rcRows([['To', x.who], ['Bank', bankOf(x.bank).name], ['Account', acctFmt(x.acct)], ['Fee', x.fee ? api.naira(x.fee) : 'Free (same bank)'], ['Narration', x.note], ['Ref', 'TRF' + String(x.id).padStart(8, '0')], ['Time', new Date(x.t).toLocaleString('en-NG', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })]]));
      b.append(btn('iph-btn', ['Done'], () => { BK.view = 'home'; BK.rc = null; openApp('wallet'); }), btn('iph-btn gray', ['Send again'], () => { BK.f = { acct: x.acct, bank: x.bank, name: x.who, n: '', note: '' }; BK.view = 'send'; openApp('wallet'); })); return; }
    if (BK.view === 'receive') { const b = frameApp('Receive money', { back: ['Bank', () => { BK.view = 'home'; openApp('wallet'); }] });
      b.append(h('div', 'iph-note', 'Give these to the person who wants to send you money:'), rcRows([['Account name', me.name], ['Account number', acctFmt(me.acct)], ['Bank', bk.name]]));
      b.append(btn('iph-btn', ['Copy my details'], () => copy(`${me.name}\n${me.acct}\n${bk.name}`, 'Your details don copy ✓'))); return; }
    const b = frameApp('Bank'), card = h('div', 'wx-card'); card.style.background = `linear-gradient(135deg,${bk.c},${bk.c2})`;
    const ac = h('div', 'bk-acct', acctFmt(me.acct)); ac.append(btn('', ['Copy'], () => copy(me.acct, 'Account number don copy ✓'), 'Copy account number'));
    card.append(h('div', 'bk-top', bk.name, h('i', null, 'Savings')), h('div', 'ph-big', api.naira(api.cash())), h('small', null, me.name + ' · Available balance'), ac); b.append(card);
    const row = h('div', 'bk-row'); row.append(btn('iph-btn', ['↗ Send money'], () => { BK.f = { acct: '', bank: '', name: null, n: '', note: '' }; BK.view = 'send'; openApp('wallet'); }), btn('iph-btn gray', ['↙ Receive'], () => { BK.view = 'receive'; openApp('wallet'); })); b.append(row);
    b.append(h('div', 'iph-h', 'Transfers')); if (!BK.hist.length) b.append(h('div', 'iph-note', 'No transfer yet. Send your account number to your guys!'));
    const L = h('div', 'iph-list');
    for (const x of BK.hist.slice(0, 25)) { const r = h('div', 'iph-li'), tx = h('div', 'tx'), inn = x.d > 0; tx.append(h('b', null, (inn ? 'From ' : 'To ') + x.who), h('small', null, `${bankOf(x.bank).name}${x.note ? ' · ' + x.note : ''} · ${ago(x.t)}`));
      const amt = h('span', 'rt', (inn ? '+' : '−') + api.naira(Math.abs(x.d))); amt.style.opacity = 1; amt.style.color = inn ? '#30d158' : '#ff6b5e'; r.append(h('div', 'iph-av', inn ? '⬇' : '⬆'), tx, amt); r.firstChild.style.background = inn ? '#14532d' : '#4a1d1a'; L.append(r); }
    if (L.children.length) b.append(L);
    localTx(b);
  }
  function localTx(b) { b.append(h('div', 'iph-h', 'Recent')); if (!S.tx.length) b.append(h('div', 'iph-note', 'No transaction yet.')); const L = h('div', 'iph-list');
    for (const t of S.tx.slice(0, 30)) { const r = h('div', 'iph-li'), tx = h('div', 'tx'); tx.append(h('b', null, t.d > 0 ? 'Credit' : 'Debit'), h('small', null, t.w || '')); const amt = h('span', 'rt', (t.d > 0 ? '+' : '−') + api.naira(Math.abs(t.d))); amt.style.opacity = 1; amt.style.color = t.d > 0 ? '#30d158' : '#ff6b5e'; r.append(h('div', 'iph-av', t.d > 0 ? '⬇' : '⬆'), tx, amt); r.firstChild.style.background = t.d > 0 ? '#14532d' : '#4a1d1a'; L.append(r); }
    if (L.children.length) b.append(L); }
  function copy(text, msg) { try { navigator.clipboard.writeText(text).then(() => phToast(msg), () => phToast(text)); } catch (e) { phToast(text); } }
  function sendView(confirm) {
    const f = BK.f || (BK.f = { acct: '', bank: '', name: null, n: '', note: '' }), me = BK.me;
    const n = parseInt(String(f.n).replace(/\D/g, ''), 10) || 0, fee = f.bank ? feeOf(n, f.bank === me.bank) : 0;
    if (confirm) { const b = frameApp('Confirm', { back: ['Edit', () => { BK.view = 'send'; openApp('wallet'); }] });
      b.append(h('div', 'bk-big', api.naira(n)), rcRows([['To', f.name], ['Bank', bankOf(f.bank).name], ['Account', acctFmt(f.acct)], ['Fee', fee ? api.naira(fee) : 'Free (same bank)'], ['Total', api.naira(n + fee)], ['Narration', f.note]]));
      if (f.err) b.append(h('div', 'bk-err', f.err));
      b.append(btn('iph-btn', [f.busy ? 'Sending…' : 'Send ' + api.naira(n)], () => { if (f.busy) return; f.busy = true; f.err = ''; f.q = f.q || ('t' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
        if (!api.bankSend({ a: 'send', acct: f.acct, bank: f.bank, n, note: f.note, q: f.q })) { f.busy = false; f.err = 'No network. Check that you are online.'; } openApp('wallet');
        setTimeout(() => { if (BK.f === f && f.busy) { f.busy = false; f.err = 'No answer from the bank. Check your history before you send again.'; if (R.app === 'wallet') openApp('wallet'); } }, 9000); }),
        btn('iph-btn gray', ['Cancel'], () => { BK.view = 'home'; BK.f = null; openApp('wallet'); })); return; }
    const b = frameApp('Send money', { back: ['Bank', () => { BK.view = 'home'; BK.f = null; openApp('wallet'); }] });
    // people you sent to before
    const ben = []; for (const x of BK.hist) if (x.d < 0 && x.acct && !ben.some(y => y.acct === x.acct)) ben.push(x);
    if (ben.length) { b.append(h('div', 'iph-h', 'Send again')); const ch = h('div', 'iph-chips'); ben.slice(0, 6).forEach(x => ch.append(btn('', [x.who], () => { f.acct = x.acct; f.bank = x.bank; f.name = x.who; f.nmsg = ''; f.err = ''; openApp('wallet'); }))); b.append(ch); }
    b.append(h('div', 'iph-h', 'Account number'));
    const ai = h('input', 'iph-in'); ai.inputMode = 'numeric'; ai.maxLength = 10; ai.placeholder = '10 digits'; ai.value = f.acct; ai.autocomplete = 'off';
    const nm = h('div', 'bk-name' + (f.name ? ' ok' : f.nmsg ? ' bad' : ''), f.asking ? 'Checking…' : f.name ? '✓ ' + f.name + (f.self ? ' (you)' : '') : f.nmsg || '');
    const ask = () => { f.name = null; f.nmsg = ''; if (f.acct.length === 10 && f.bank) { f.asking = true; nm.className = 'bk-name'; nm.textContent = 'Checking…'; api.bankSend({ a: 'name', acct: f.acct, bank: f.bank }); } else { nm.textContent = ''; } };
    ai.addEventListener('keydown', e => e.stopPropagation()); ai.addEventListener('input', () => { const v = ai.value.replace(/\D/g, '').slice(0, 10); if (v !== ai.value) ai.value = v; if (v !== f.acct) { f.acct = v; f.err = ''; ask(); } });
    b.append(ai, h('div', 'iph-h', 'Bank'));
    const bs = h('div', 'bk-banks'); for (const k of Object.keys(BK.banks).length ? Object.keys(BK.banks) : Object.keys(BANKS0)) { const B = bankOf(k), x = btn(f.bank === k ? 'on' : '', [B.name], () => { if (f.bank === k) return; f.bank = k; f.err = ''; ask(); openApp('wallet'); }); if (f.bank === k) x.style.background = B.c; bs.append(x); }
    b.append(bs, nm, h('div', 'iph-h', 'Amount'));
    const mi = h('input', 'iph-in'); mi.inputMode = 'numeric'; mi.placeholder = '₦ how much'; mi.value = n ? n.toLocaleString('en-NG') : ''; mi.addEventListener('keydown', e => e.stopPropagation());
    const feeL = h('div', 'bk-fee', f.bank ? (fee ? `Fee ${api.naira(fee)} (another bank)` : 'No fee (same bank)') : 'Same bank: no fee. Another bank: ₦10 to ₦50.');
    mi.addEventListener('input', () => { const v = parseInt(mi.value.replace(/\D/g, ''), 10) || 0; f.n = v ? String(v) : ''; f.err = ''; const fe = f.bank ? feeOf(v, f.bank === me.bank) : 0; feeL.textContent = f.bank ? (fe ? `Fee ${api.naira(fe)} (another bank)` : 'No fee (same bank)') : feeL.textContent; });
    mi.addEventListener('change', () => { const v = parseInt(mi.value.replace(/\D/g, ''), 10) || 0; mi.value = v ? v.toLocaleString('en-NG') : ''; });
    const qk = h('div', 'iph-chips'); [1000, 5000, 10000, 50000].forEach(v => qk.append(btn('', [api.naira(v)], () => { f.n = String(v); f.err = ''; openApp('wallet'); })));
    b.append(mi, qk, feeL, h('div', 'iph-h', 'Narration (optional)'));
    const ni = h('input', 'iph-in'); ni.maxLength = 40; ni.placeholder = 'e.g. for food'; ni.value = f.note || ''; ni.addEventListener('keydown', e => e.stopPropagation()); ni.addEventListener('input', () => { f.note = ni.value; });
    b.append(ni);
    if (f.err) b.append(h('div', 'bk-err', f.err));
    b.append(btn('iph-btn', ['Continue'], () => { const v = parseInt(String(f.n).replace(/\D/g, ''), 10) || 0, Rl = BK.rules || { least: 100, most: 200000 };
      const e = f.acct.length !== 10 ? 'Put the 10-digit account number.' : !f.bank ? 'Pick their bank.' : f.asking ? 'Wait, checking the account…' : !f.name ? (f.nmsg || 'Account not found.') : f.self ? 'That one is your own account.' : v < Rl.least || v > Rl.most ? `Send between ${api.naira(Rl.least)} and ${api.naira(Rl.most)}.` : v + feeOf(v, f.bank === me.bank) > api.cash() ? 'Insufficient funds.' : '';
      if (e) { f.err = e; openApp('wallet'); return; } f.n = String(v); f.q = null; BK.view = 'confirm'; openApp('wallet'); }));
  }
  function weatherApp() { const b = frameApp('Weather'); R.view.style.background = 'linear-gradient(180deg,#3a7bd5,#1c3f7a)'; const w = h('div', 'wt'); w.append(h('div', 'c', 'Mushin, Lagos'), h('div', 't', temp() + '°'), h('div', 'c', `${wxIcon()} ${api.weather()}`), h('small', null, `${api.clock()} · Feels like ${temp() + 3}°`));
    const hrs = h('div', 'wt-hours'), h0 = api.hour(); for (let i = 0; i < 6; i++) { const hr = (Math.floor(h0) + i * 2) % 24, d = h('div'); const tt = Math.round(27 + 5 * Math.cos((hr - 14) / 24 * 6.283) - api.rain() * 4 * (i < 2 ? 1 : .5)); d.append(h('span', null, i ? `${hr}:00` : 'Now'), h('i', null, (hr < 7 || hr > 18) ? '🌙' : i < 2 ? wxIcon() : '⛅'), h('span', null, tt + '°')); hrs.append(d); }
    w.append(hrs, h('div', 'iph-note', api.rain() > .2 ? 'Rain dey fall. Carry umbrella and drive slow.' : 'Normal Lagos weather. Drink water, the sun no dey play.')); b.append(w); }
  function settingsApp() { const b = frameApp('Settings'); b.append(h('div', 'iph-h', 'Your name on Gist')); const inp = h('input', 'iph-in'); inp.value = S.name || api.playerName() || ''; inp.maxLength = 20; inp.addEventListener('keydown', e => e.stopPropagation()); inp.addEventListener('change', () => { S.name = inp.value.trim(); save(); }); b.append(inp);
    b.append(h('div', 'iph-h', 'Wallpaper')); const g = h('div', 'px-grid'); g.style.margin = '0';
    WALLS.forEach((w, i) => { const d = h('div'); d.style.cssText = `width:100%;height:100%;background:${w.css};background-size:cover;outline:${S.wall === i ? '3px solid #0a84ff' : 'none'};outline-offset:-3px`; g.append(btn('', [d], () => { S.wall = i; save(); setWall(); openApp('settings'); }, w.n)); });
    b.append(g, h('div', 'iph-note', 'Tip: open any photo in Photos to use it as wallpaper.'), h('div', 'iph-h', 'About'), h('div', 'iph-note', 'NaijaPhone 15 · MTN 5G · Storage: ' + S.photos.length + ' photos')); }

  // ---------------------------------------------------------------- notifications
  // nothing pops up, inside the phone or outside it: new things only raise the red number on the apps and on the phone button
  function notify(app, title, text, quiet) {
    if (app === 'gist') { if (quiet || (R.open && R.app === 'gist')) return; R.badge.gist++; }
    setBadges();
  }

  // ---------------------------------------------------------------- what the game tells the phone
  let cashQ = 0, cashT = null, cashW = '';
  function event(kind, d = {}) {
    if (kind === 'cash') { const t = { d: d.d, t: Date.now(), w: d.why || api.where() }; S.tx.unshift(t); if (S.tx.length > 40) S.tx.length = 40; save(); cashQ += d.d; cashW = t.w; clearTimeout(cashT);
      cashT = setTimeout(() => { if (Math.abs(cashQ) >= 100) bkAlert(null, `${cashQ > 0 ? 'Credit' : 'Debit'} Alert! Acct: ••${BK.me ? BK.me.acct.slice(-4) : '4521'}\nAmt: ${api.naira(Math.abs(cashQ))}\nDesc: ${cashW}\nBal: ${api.naira(api.cash())}`); cashQ = 0; }, 2500); if (R.app === 'wallet' && (BK.view === 'home' || !BK.me)) openApp('wallet'); refreshHome(); return; }
    if (kind === 'bank') { bankMsg(d); return; }
    if (kind === 'sms') { sms(d.id, d.n, d.c, d.e, d.x); return; }
    if (kind === 'ride') { sms('oyaride', 'Oya Ride', '#f2b705', '🚕', `Your ${d.bike ? 'okada' : 'car'} to ${d.name} don book. Driver: ${d.who}. Fare: ${api.naira(d.fare)}, pay cash. Safe journey!`); return; }
    gistEvent(kind, d);
  }

  // ---------------------------------------------------------------- open, close, every frame
  function open() { R.open = true; wrap.hidden = false; setWall(); if (!home.firstChild) buildHome(); refreshHome(); setBadges(); if (R.app === 'ride' || R.app === 'work') openApp(R.app); else if (!R.app) { home.classList.remove('away'); } syncNav(); }
  function close() { R.open = false; endCall(true); closeCamera(); wrap.hidden = true; }
  let tk = 0;
  function tick(dt) { tk += dt; if (tk < 1) return; tk = 0; if (!api.started()) return; tickGist(); if (R.open) { timeEl.textContent = api.clock(); if (!R.app) refreshHome(); } }
  // the selfie camera: in front of you, at arm's length, looking back at your face
  // the phone camera: what you see from your own eyes, or (selfie) from arm's length in front, looking back at your face
  function camHook(cam) { if (!R.cam) return false; const p = api.pose();
    if (R.selfie) { const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      cam.position.set(p.x + fx * 1.05 - rx * .18, p.y + 1.62, p.z + fz * 1.05 - rz * .18); cam.lookAt(p.x, p.y + 1.55, p.z); return true; }
    const pp = p.cp - .22, sx = Math.sin(p.cy), cz = Math.cos(p.cy), ex = p.x + sx * .45, ez = p.z + cz * .45, ey = p.y + 1.62;
    cam.position.set(ex, ey, ez); cam.lookAt(ex + sx * Math.cos(pp), ey - Math.sin(pp), ez + cz * Math.cos(pp)); return true; }
  const cam = () => R.cam;
  function test(what) { if (what === 'dispatch') return JSON.stringify(api.callPolice(api.nearPlaces(1)[0], 'Fight')); if (what === 'camera') { if (!R.open) api.reopen(); openCamera(); return 1; } if (what === 'shoot') { shoot(); return 1; } if (what === 'selfie') { setSelfie(true); return 1; } if (what === 'closecam') { closeCamera(); return 1; } if (what === 'home') { toHome(); return 1; } if (what === 'back') { goBack(); return 1; } if (what === 'badge') return pbN.hidden ? 0 : pbN.textContent; if (what.startsWith && what.startsWith('sms:')) { sms('mama', 'Mama', '#e91e63', '👩🏾', what.slice(4)); return 1; } if (what === 'gistev') { R.badge.gist++; setBadges(); return 1; } if (what === 'police') { openApp('phone'); startCall(CONTACTS.find(c => c.police)); return 1; } if (what && what.startsWith('call:')) { openApp('phone'); startCall(CONTACTS.find(c => c.id === what.slice(5))); return 1; } if (what && what.startsWith('tap:')) { const b = [...scr.querySelectorAll('button')].find(x => x.textContent.includes(what.slice(4))); if (b) { b.click(); return 1; } return 0; } openApp(what); return 1; }
  setBadges();
  return { open, close, event, tick, camHook, cam, closeCamera, test, back: goBack, home: toHome, isOpen: () => R.open, app: () => R.app, bank: () => ({ me: BK.me, view: BK.view, f: BK.f, hist: BK.hist.length, rc: BK.rc }) };
}
