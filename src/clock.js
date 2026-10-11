// Shared world clock and weather.
// Every player computes the same game time and the same weather from one
// global timeline (server time from the HTTP Date header, device clock as fallback),
// so day, night, rain and harmattan change for everyone at the same moment.

export const DAY_MINUTES = 48;          // one full game day lasts 48 real minutes
export const WEATHER_SLOT_MIN = 16;     // weather can change every 16 real minutes
const BLEND_MS = 100 * 1000;            // weather changes fade in over 100 seconds
const LAT = 6.5 * Math.PI / 180;        // Lagos

let offset = 0, synced = false, bestRtt = Infinity, lastSync = 0;
const qs = new URLSearchParams(location.search);
// testing only (?dev=1&hour=21&weather=rain), and only on a developer's own machine, so a shared link can't show
// a player a different time or weather from everyone else
const localHost = /^(localhost|127\.0\.0\.1|\[::1\])$|\.local$/.test(location.hostname);
const dev = localHost && qs.get('dev') === '1';
const devHour = dev && qs.has('hour') ? parseFloat(qs.get('hour')) : null;
const devWeather = dev ? qs.get('weather') : null;

// One sample: server time = Date header (1 s resolution, +0.5 s) + Age (if a CDN served a cached copy) + half the round trip.
async function sample(url) {
  const t0 = performance.now();
  const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
  const t1 = performance.now();
  const d = r.headers.get('date'); if (!d) return null;
  const age = parseFloat(r.headers.get('age') || '0') || 0;
  const server = Date.parse(d) + 500 + age * 1000 + (t1 - t0) / 2;
  if (!isFinite(server)) return null;
  return { off: server - Date.now(), rtt: t1 - t0 };
}
// Several quick samples; keep the one with the shortest round trip (least network delay error).
export async function syncClock(n = 3) {
  const base = location.href.split('#')[0].split('?')[0] + '?clock=' + Date.now();
  let got = false;
  for (let i = 0; i < n; i++) {
    try {
      const s = await sample(base + '-' + i);   // a new address each time, so no cache can answer
      if (s && (s.rtt <= bestRtt * 1.5 || Date.now() - lastSync > 10 * 60000)) {
        if (s.rtt < bestRtt || !synced) { offset = s.off; bestRtt = s.rtt; }
        synced = true; got = true; lastSync = Date.now();
      }
    } catch (e) { break; }
  }
  return got;
}
// re-check every few minutes (phones drift, sleep, change networks)
export function keepSynced(everyMin = 5) { setInterval(() => { if (!document.hidden) { bestRtt = Infinity; syncClock(2); } }, everyMin * 60000); }
export const isSynced = () => synced;
export const now = () => Date.now() + offset;

// game hour 0..24 ; each cycle starts at 06:00. Days are long and nights are very short:
// real minutes spent on each part of the day (they add up to DAY_MINUTES)
const PARTS = [[6, 18, 36], [18, 20, 5], [20, 29, 3], [29, 30, 4]];   // [from hour, to hour (past midnight = +24), real minutes]
export function gameHour(t = now()) {
  if (devHour !== null && isFinite(devHour)) return ((devHour % 24) + 24) % 24;
  const day = DAY_MINUTES * 60000; let m = ((((t % day) + day) % day) / day) * DAY_MINUTES;   // real minutes into this cycle
  for (const [a, b, len] of PARTS) { if (m < len) return (a + (b - a) * m / len) % 24; m -= len; }
  return 6;
}
export function fmtHour(h) { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); }

// sun direction for Lagos: returns {elev, azim} in degrees (azim: 0 = north, 90 = east)
export function sunAngles(h, t = now()) {
  const doy = Math.floor((t / 86400000) % 365.25);
  const decl = -23.44 * Math.cos(2 * Math.PI * (doy + 10) / 365) * Math.PI / 180;
  const ha = (h - 12.4) * 15 * Math.PI / 180;
  const sinE = Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(ha);
  const elev = Math.asin(sinE);
  const cosA = (Math.sin(decl) - Math.sin(elev) * Math.sin(LAT)) / (Math.cos(elev) * Math.cos(LAT));
  let az = Math.acos(Math.max(-1, Math.min(1, cosA)));
  if (ha > 0) az = 2 * Math.PI - az;
  return { elev: elev * 180 / Math.PI, azim: az * 180 / Math.PI };
}

// ---------- weather ----------
export const WEATHERS = {
  clear:     { label: 'Sunny',      icon: 'sun',   cloud: .12, rain: 0,   haze: 0,   dim: 0 },
  cloudy:    { label: 'Cloudy',     icon: 'cloud', cloud: .72, rain: 0,   haze: 0,   dim: .35 },
  rain:      { label: 'Rain',       icon: 'rain',  cloud: .95, rain: .65, haze: 0,   dim: .62 },
  storm:     { label: 'Heavy rain', icon: 'storm', cloud: 1,   rain: 1,   haze: 0,   dim: .78 },
  harmattan: { label: 'Harmattan',  icon: 'haze',  cloud: .25, rain: 0,   haze: 1,   dim: .3 },
};
function hash(n) { let x = (n | 0) ^ 0x9e3779b9; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; }
function weatherForSlot(slot) {
  if (devWeather && WEATHERS[devWeather]) return devWeather;
  const month = new Date(slot * WEATHER_SLOT_MIN * 60000).getUTCMonth(); // 0 = Jan
  const r = hash(slot);
  const rainy = month >= 3 && month <= 9;            // April–October
  const harm = month === 11 || month <= 1;           // December–February
  if (rainy) return r < .40 ? 'clear' : r < .62 ? 'cloudy' : r < .88 ? 'rain' : 'storm';
  if (harm) return r < .45 ? 'harmattan' : r < .82 ? 'clear' : r < .95 ? 'cloudy' : 'rain';
  return r < .6 ? 'clear' : r < .85 ? 'cloudy' : r < .97 ? 'rain' : 'storm';
}
// blended weather state at time t
export function weatherAt(t = now()) {
  const slotMs = WEATHER_SLOT_MIN * 60000, slot = Math.floor(t / slotMs), into = t - slot * slotMs;
  const cur = weatherForSlot(slot), prev = weatherForSlot(slot - 1);
  const k = Math.min(1, into / BLEND_MS), s = k * k * (3 - 2 * k);
  const A = WEATHERS[prev], B = WEATHERS[cur], mix = f => A[f] + (B[f] - A[f]) * s;
  // roads stay wet for a while after rain (two slots back counts too)
  const prev2 = WEATHERS[weatherForSlot(slot - 2)];
  // roads dry over ~1.7 slots after the rain stops: one smooth decay across slot boundaries
  const wetFromPast = Math.max(A.rain * Math.max(0, 1 - into / (slotMs * 1.7)), prev2.rain * Math.max(0, 1 - (into + slotMs) / (slotMs * 1.7)));
  const rain = mix('rain');
  return { key: s > .5 ? cur : prev, label: WEATHERS[s > .5 ? cur : prev].label, icon: WEATHERS[s > .5 ? cur : prev].icon,
    cloud: mix('cloud'), rain, haze: mix('haze'), dim: mix('dim'), wet: Math.min(1, Math.max(rain * 1.4, wetFromPast)),
    storm: (cur === 'storm' ? s : 0) + (prev === 'storm' ? 1 - s : 0), next: cur };
}
