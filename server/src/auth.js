// Passwords, sign-in tokens, names and the limits that stop guessing and spam.
import crypto from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

// a password is never stored: only a salted scrypt hash of it
export function hashPass(pass, salt = crypto.randomBytes(16)) {
  return new Promise((res, rej) => crypto.scrypt(String(pass).normalize('NFKC'), salt, 32, SCRYPT, (e, k) => e ? rej(e) : res({ salt, hash: k })));
}
export async function checkPass(pass, salt, hash) {
  const { hash: h } = await hashPass(pass, Buffer.from(salt));
  const want = Buffer.from(hash);
  return h.length === want.length && crypto.timingSafeEqual(h, want);
}
// the phone keeps a random token; the server keeps only its SHA-256
export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const tokenHash = t => crypto.createHash('sha256').update(String(t)).digest();
export const codeHash = c => crypto.createHash('sha256').update('reset:' + String(c)).digest();
export const newCode = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');

const RESERVED = /^(admin|administrator|mod|moderator|staff|support|system|server|naija|naijastreets|police|official|owner|dev|developer|null|undefined|guest|everyone|anthropic|claude)$/i;
const BAD_ANY = ['fuck', 'nigger', 'nigga', 'cunt'];   // starred wherever they appear
const BAD_WORD = ['shit', 'bitch', 'whore', 'pussy', 'dick', 'rape', 'porn', 'sex', 'ashawo', 'olosho'];   // only as whole words (Dickson, Essex are fine)

export function checkName(u) {
  u = String(u || '').trim();
  if (u.length < 3) return [null, 'Username: at least 3 letters.'];
  if (u.length > 16) return [null, 'Username: 16 letters at most.'];
  if (!/^[A-Za-z0-9_]+$/.test(u)) return [null, 'Username: only letters, numbers and _ (no spaces).'];
  if (!/[A-Za-z]/.test(u)) return [null, 'Username: put at least one letter in it.'];
  const l = u.toLowerCase().replace(/_/g, ''), parts = u.toLowerCase().split(/[_0-9]+/);
  if (RESERVED.test(u) || RESERVED.test(l) || BAD_ANY.some(w => l.includes(w)) || parts.some(w => BAD_WORD.includes(w))) return [null, 'That username is not allowed. Pick another one.'];
  return [u, null];
}
export function checkPassText(p, name) {
  p = String(p || '');
  if (p.length < 6) return 'Password: at least 6 characters.';
  if (p.length > 72) return 'Password: 72 characters at most.';
  if (name && p.toLowerCase() === String(name).toLowerCase()) return 'Your password cannot be your username.';
  if (/^(123456|1234567|12345678|123456789|password|qwerty|111111|000000|abc123)$/i.test(p)) return 'That password is too easy to guess.';
  return null;
}
export function checkEmail(e) {
  e = String(e || '').trim();
  if (!e) return ['', null];
  if (e.length > 120 || !/^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[A-Za-z]{2,}$/.test(e)) return [null, 'That email does not look right.'];
  return [e.toLowerCase(), null];
}

// chat text: one line, no control characters, no links (scams), bad words starred out
export function cleanChat(m) {
  let s = String(m || '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length > 120) s = s.slice(0, 120);
  s = s.replace(/\b(https?:\/\/|www\.)\S+/gi, '***').replace(/\b\S+\.(com|net|org|ng|io|xyz|link|ly|me|co)(\/\S*)?\b/gi, '***');
  const star = x => x[0] + '*'.repeat(x.length - 1);
  for (const w of BAD_ANY) s = s.replace(new RegExp(w + '\\w*', 'gi'), star);
  for (const w of BAD_WORD) s = s.replace(new RegExp(`\\b${w}(s|es)?\\b`, 'gi'), star);
  return s;
}

// a token bucket: `cap` actions at once, refilled at `rate` per second
export class Bucket {
  constructor(cap, rate) { this.cap = cap; this.rate = rate; this.n = cap; this.t = Date.now(); }
  fill(now = Date.now()) { this.n = Math.min(this.cap, this.n + (now - this.t) / 1000 * this.rate); this.t = now; }
  take(k = 1, now = Date.now()) { this.fill(now); if (this.n < k) return false; this.n -= k; return true; }
  // take what is there, up to k; returns how much was taken
  takeUpTo(k, now = Date.now()) { this.fill(now); const g = Math.max(0, Math.min(k, Math.floor(this.n))); this.n -= g; return g; }
}
// many buckets by key (an IP address, a username); idle ones are forgotten
export class Limits {
  constructor(cap, rate) { this.cap = cap; this.rate = rate; this.m = new Map(); }
  take(key, k = 1) {
    let b = this.m.get(key); if (!b) { b = new Bucket(this.cap, this.rate); this.m.set(key, b); }
    return b.take(k);
  }
  prune() { const now = Date.now(); for (const [k, b] of this.m) { b.fill(now); if (b.n >= b.cap) this.m.delete(k); } }
}
