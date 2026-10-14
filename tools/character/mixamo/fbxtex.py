"""Textures of a Mixamo FBX: for every material, its diffuse / normal / specular / gloss picture (embedded content)."""
import sys, os, io, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'anim'))
from fbxread import read

def materials(path):
    ver, root = read(path); objs = root.find('Objects'); con = root.find('Connections')
    name = lambda n: n.props[1].split('\x00')[0] if isinstance(n.props[1], str) else str(n.props[1])
    mats = {n.props[0]: name(n) for n in objs.findall('Material')}
    texs = {}
    for n in objs.findall('Texture'):
        fn = n.find('RelativeFilename') or n.find('FileName'); texs[n.props[0]] = dict(name=name(n), file=(fn.props[0] if fn else ''))
    vids = {}
    for n in objs.findall('Video'):
        c = n.find('Content'); fn = n.find('RelativeFilename') or n.find('Filename')
        if c and c.props and isinstance(c.props[0], (bytes, bytearray)) and len(c.props[0]) > 100: vids[n.props[0]] = dict(name=name(n), file=(fn.props[0] if fn else ''), data=c.props[0])
    tex_vid, out = {}, {}
    for c in con.findall('C'):
        if c.props[0] == 'OO' and c.props[1] in vids and c.props[2] in texs: tex_vid[c.props[2]] = c.props[1]
    for c in con.findall('C'):
        if c.props[0] == 'OP' and c.props[1] in texs and c.props[2] in mats:
            slot = c.props[3]; v = tex_vid.get(c.props[1])
            if v is None:   # same picture used twice: find a video with the same file name
                f = os.path.basename(texs[c.props[1]]['file'].replace('\\', '/'))
                v = next((k for k, vv in vids.items() if os.path.basename(vv['file'].replace('\\', '/')) == f), None)
            if v is None: continue
            out.setdefault(mats[c.props[2]], {})[slot] = os.path.basename(vids[v]['file'].replace('\\', '/'))
    pics = {os.path.basename(v['file'].replace('\\', '/')): v['data'] for v in vids.values()}
    return out, pics

if __name__ == '__main__':
    m, p = materials(sys.argv[1])
    print(json.dumps(m, indent=1)); print({k: len(v) for k, v in p.items()})
