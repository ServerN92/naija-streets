// A small WebSocket server (RFC 6455), so the game server needs nothing from npm.
// Text messages only (the game speaks JSON). Client frames must be masked; big or broken frames close the line.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// answer the browser's "upgrade to WebSocket" request; returns the connection or null
export function accept(req, socket, head, opt = {}) {
  const key = req.headers['sec-websocket-key'];
  const up = String(req.headers.upgrade || '').toLowerCase();
  if (up !== 'websocket' || !key || req.headers['sec-websocket-version'] !== '13') {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    return null;
  }
  const acc = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  socket.setNoDelay(true);
  socket.setTimeout(0);
  return new Conn(socket, head, opt);
}

class Conn extends EventEmitter {
  constructor(socket, head, opt) {
    super();
    this.s = socket;
    this.max = opt.maxMsg || 4096;          // biggest message we take (bytes)
    this.maxOut = opt.maxOut || 512 * 1024;  // a phone that stops reading gets dropped past this
    this.buf = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
    this.frag = null; this.fragN = 0;
    this.open = true; this.alive = true;
    socket.on('data', d => this._data(d));
    socket.on('close', () => this._gone(1006));
    socket.on('error', () => this._gone(1006));
    if (this.buf.length) setImmediate(() => this._data(Buffer.alloc(0)));
  }
  _gone(code) {
    if (this._done) return; this._done = true; this.open = false;
    clearTimeout(this._kill); this.emit('close', code);
  }
  _fail(code) { this.close(code); }
  _data(d) {
    if (!this.open) return;
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      const b = this.buf; if (b.length < 2) return;
      const b0 = b[0], b1 = b[1], fin = !!(b0 & 0x80), op = b0 & 0x0f;
      if (b0 & 0x70) return this._fail(1002);       // no extensions
      if (!(b1 & 0x80)) return this._fail(1002);    // clients must mask
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; if (b.readUInt32BE(2)) return this._fail(1009); len = b.readUInt32BE(6); off = 10; }
      if (len > this.max) return this._fail(1009);
      if (b.length < off + 4 + len) return;
      const m0 = b[off], m1 = b[off + 1], m2 = b[off + 2], m3 = b[off + 3];
      const p = Buffer.allocUnsafe(len);
      for (let i = 0, j = off + 4; i < len; i++, j++) {
        const k = i & 3; p[i] = b[j] ^ (k === 0 ? m0 : k === 1 ? m1 : k === 2 ? m2 : m3);
      }
      this.buf = b.subarray(off + 4 + len);
      if (op >= 8) {                                  // control frames
        if (!fin || len > 125) return this._fail(1002);
        if (op === 8) { this.close(1000); return; }
        if (op === 9) { this._frame(10, p); continue; }
        if (op === 10) { this.alive = true; continue; }
        return this._fail(1002);
      }
      if (op === 1 || op === 2) {
        if (this.frag) return this._fail(1002);
        if (fin) { if (op === 1) this._msg(p); continue; }
        this.frag = { op, parts: [p] }; this.fragN = len; continue;
      }
      if (op === 0) {
        if (!this.frag) return this._fail(1002);
        this.fragN += len; if (this.fragN > this.max) return this._fail(1009);
        this.frag.parts.push(p);
        if (fin) { const f = this.frag; this.frag = null; if (f.op === 1) this._msg(Buffer.concat(f.parts)); }
        continue;
      }
      return this._fail(1002);
    }
  }
  _msg(p) { this.alive = true; this.emit('message', p.toString('utf8')); }
  _frame(op, p) {
    if (!this.open || this.s.destroyed) return false;
    const n = p.length; let h;
    if (n < 126) { h = Buffer.allocUnsafe(2); h[1] = n; }
    else if (n < 65536) { h = Buffer.allocUnsafe(4); h[1] = 126; h.writeUInt16BE(n, 2); }
    else { h = Buffer.allocUnsafe(10); h[1] = 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(n, 6); }
    h[0] = 0x80 | op;
    this.s.write(h); this.s.write(p);
    if (this.s.writableLength > this.maxOut) { this.s.destroy(); this._gone(1008); return false; }
    return true;
  }
  send(text) { return this._frame(1, Buffer.from(text, 'utf8')); }
  ping() { this.alive = false; return this._frame(9, Buffer.alloc(0)); }
  get backlog() { return this.s.writableLength; }
  close(code = 1000, reason = '') {
    if (!this.open) return;
    const r = Buffer.from(String(reason).slice(0, 100), 'utf8'), p = Buffer.allocUnsafe(2 + r.length);
    p.writeUInt16BE(code, 0); r.copy(p, 2);
    try { this._frame(8, p); } catch (e) { /* the line is already gone */ }
    this.open = false;
    try { this.s.end(); } catch (e) { /* ignore */ }
    this._kill = setTimeout(() => { try { this.s.destroy(); } catch (e) { /* ignore */ } this._gone(code); }, 2000);
  }
}
