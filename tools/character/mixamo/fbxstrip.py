"""Copy a binary FBX without its embedded pictures (Video 'Content' emptied), so a browser can open a huge one."""
import struct, sys

def strip(src, dst):
    data = open(src, 'rb').read(); ver = struct.unpack_from('<I', data, 23)[0]; big = ver >= 7500
    H = 25 if big else 13
    def prop_len(p):
        t = chr(data[p])
        if t in 'YC': return 1 + (2 if t == 'Y' else 1)
        if t in 'IF': return 5
        if t in 'DL': return 9
        if t in 'SR': return 5 + struct.unpack_from('<I', data, p + 1)[0]
        if t in 'fdlib': return 13 + struct.unpack_from('<III', data, p + 1)[2]
        raise ValueError(t)
    def node(p, base):   # returns (bytes, next p) ; base = file offset where this node will be written
        if big: end, nprops, plen = struct.unpack_from('<QQQ', data, p); hl = 24
        else: end, nprops, plen = struct.unpack_from('<III', data, p); hl = 12
        nl = data[p + hl]
        if end == 0: return None, p + hl + 1
        name = data[p + hl + 1:p + hl + 1 + nl]
        q = p + hl + 1 + nl; props = bytearray()
        for _ in range(nprops):
            L = prop_len(q); chunk = data[q:q + L]
            if name == b'Content' and chunk[:1] == b'R': chunk = b'R' + struct.pack('<I', 0)
            props += chunk; q += L
        head_len = hl + 1 + nl; body = bytearray(); cpos = base + head_len + len(props)
        kids_present = q < end
        while q < end:
            c, q2 = node(q, cpos)
            if c is None: q = q2; break
            body += c; cpos += len(c); q = q2
        if kids_present: body += b'\x00' * (hl + 1)
        total = head_len + len(props) + len(body); nend = base + total
        hdr = struct.pack('<QQQ', nend, nprops, len(props)) if big else struct.pack('<III', nend, nprops, len(props))
        return bytes(hdr + bytes([nl]) + name + props + body), end
    out = bytearray(data[:27]); p = 27
    while p < len(data) - H - 160:
        n, p2 = node(p, len(out))
        if n is None: break
        out += n; p = p2
    out += b'\x00' * (H)   # null record
    out += data[p + H:] if p + H <= len(data) else b''   # footer as it was
    open(dst, 'wb').write(out); return len(data), len(out)

if __name__ == '__main__': print(strip(sys.argv[1], sys.argv[2]))
