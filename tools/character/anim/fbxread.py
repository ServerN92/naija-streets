"""Minimal binary FBX reader (enough for Mixamo animation files): nodes, properties, arrays."""
import struct, zlib, sys

class Node:
    __slots__ = ('name', 'props', 'children')
    def __init__(s, name, props, children): s.name, s.props, s.children = name, props, children
    def find(s, name): return next((c for c in s.children if c.name == name), None)
    def findall(s, name): return [c for c in s.children if c.name == name]
    def __repr__(s): return f'<{s.name} {s.props[:3]} [{len(s.children)}]>'

def read(path):
    data = open(path, 'rb').read()
    assert data[:20] == b'Kaydara FBX Binary  ', 'not a binary FBX'
    ver = struct.unpack_from('<I', data, 23)[0]
    big = ver >= 7500
    pos = 27
    def prop(p):
        t = chr(data[p]); p += 1
        if t == 'Y': return struct.unpack_from('<h', data, p)[0], p + 2
        if t == 'C': return bool(data[p]), p + 1
        if t == 'I': return struct.unpack_from('<i', data, p)[0], p + 4
        if t == 'F': return struct.unpack_from('<f', data, p)[0], p + 4
        if t == 'D': return struct.unpack_from('<d', data, p)[0], p + 8
        if t == 'L': return struct.unpack_from('<q', data, p)[0], p + 8
        if t in 'SR':
            n = struct.unpack_from('<I', data, p)[0]; p += 4; v = data[p:p + n]
            return (v.decode('utf-8', 'replace') if t == 'S' else v), p + n
        if t in 'fdlib':
            n, enc, clen = struct.unpack_from('<III', data, p); p += 12
            raw = data[p:p + clen]; p += clen
            if enc: raw = zlib.decompress(raw)
            fmt = {'f': 'f', 'd': 'd', 'l': 'q', 'i': 'i', 'b': '?'}[t]
            return list(struct.unpack('<%d%s' % (n, fmt), raw)), p
        raise ValueError('prop type ' + t)
    def node(p):
        if big: end, nprops, plen = struct.unpack_from('<QQQ', data, p); p += 24
        else: end, nprops, plen = struct.unpack_from('<III', data, p); p += 12
        nl = data[p]; p += 1
        if end == 0: return None, p
        name = data[p:p + nl].decode(); p += nl
        props = []
        for _ in range(nprops):
            v, p = prop(p); props.append(v)
        kids = []
        while p < end:
            c, p2 = node(p)
            if c is None: p = p2; break
            kids.append(c); p = p2
        return Node(name, props, kids), end
    top = []
    while pos < len(data) - 13 - (25 if big else 13):
        n, p2 = node(pos)
        if n is None: break
        top.append(n); pos = p2
    return ver, Node('root', [], top)

if __name__ == '__main__':
    for f in sys.argv[1:]:
        ver, root = read(f)
        objs = root.find('Objects')
        kinds = {}
        for c in objs.children: kinds[c.name] = kinds.get(c.name, 0) + 1
        models = [c for c in objs.children if c.name == 'Model']
        names = [m.props[1].split('\x00')[0] for m in models]
        stacks = [c.props[1].split('\x00')[0] for c in objs.children if c.name == 'AnimationStack']
        print(f, 'v', ver, kinds)
        print('   models', len(names), names[:6], '| stacks', stacks)
