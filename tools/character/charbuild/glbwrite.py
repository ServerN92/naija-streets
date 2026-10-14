"""A small glTF 2.0 binary writer: skinned meshes, PBR materials, embedded images, texture transforms."""
import json, struct, numpy as np

class GLB:
    def __init__(self):
        self.js = dict(asset=dict(version='2.0', generator='naija-streets charbuild'), scene=0, scenes=[dict(nodes=[])], nodes=[], meshes=[], materials=[],
                       textures=[], images=[], samplers=[], accessors=[], bufferViews=[], buffers=[], skins=[])
        self.bin = bytearray(); self.used = set()

    def view(self, data, target=None):
        while len(self.bin) % 4: self.bin.append(0)
        v = dict(buffer=0, byteOffset=len(self.bin), byteLength=len(data))
        if target: v['target'] = target
        self.bin += data; self.js['bufferViews'].append(v); return len(self.js['bufferViews']) - 1

    def acc(self, arr, kind, target=None, minmax=False, normalized=False):
        arr = np.ascontiguousarray(arr)
        ct = {np.dtype('float32'): 5126, np.dtype('uint16'): 5123, np.dtype('uint32'): 5125, np.dtype('uint8'): 5121}[arr.dtype]
        n = arr.shape[0]
        a = dict(bufferView=self.view(arr.tobytes(), target), componentType=ct, count=n, type=kind)
        if normalized: a['normalized'] = True
        if minmax:
            a['min'] = arr.reshape(n, -1).min(0).tolist(); a['max'] = arr.reshape(n, -1).max(0).tolist()
        self.js['accessors'].append(a); return len(self.js['accessors']) - 1

    def sampler(self, wrap='repeat'):
        w = {'repeat': 10497, 'clamp': 33071, 'mirror': 33648}[wrap]
        s = dict(magFilter=9729, minFilter=9987, wrapS=w, wrapT=w)
        if s in self.js['samplers']: return self.js['samplers'].index(s)
        self.js['samplers'].append(s); return len(self.js['samplers']) - 1

    def image(self, data, mime, name=None):
        im = dict(bufferView=self.view(data), mimeType=mime)
        if name: im['name'] = name
        self.js['images'].append(im); return len(self.js['images']) - 1

    def texture(self, img, wrap='repeat'):
        self.js['textures'].append(dict(source=img, sampler=self.sampler(wrap))); return len(self.js['textures']) - 1

    def material(self, name, color=(1, 1, 1, 1), tex=None, texcoord=0, scale=None, rough=.7, metal=0., normal=None, normal_scale=1., alpha=None, cutoff=.5,
                 double=True, extras=None, emissive=None):
        m = dict(name=name, pbrMetallicRoughness=dict(baseColorFactor=list(color), metallicFactor=metal, roughnessFactor=rough), doubleSided=double)
        def tinfo(t, tc, sc):
            d = dict(index=t)
            if tc: d['texCoord'] = tc
            if sc is not None:
                d.setdefault('extensions', {})['KHR_texture_transform'] = dict(scale=list(sc)); self.used.add('KHR_texture_transform')
                if tc: d['extensions']['KHR_texture_transform']['texCoord'] = tc
            return d
        if tex is not None: m['pbrMetallicRoughness']['baseColorTexture'] = tinfo(tex, texcoord, scale)
        if normal is not None:
            m['normalTexture'] = tinfo(normal, texcoord, scale); m['normalTexture']['scale'] = normal_scale
        if alpha: m['alphaMode'] = alpha
        if alpha == 'MASK': m['alphaCutoff'] = cutoff
        if extras: m['extras'] = extras
        if emissive: m['emissiveFactor'] = list(emissive)
        self.js['materials'].append(m); return len(self.js['materials']) - 1

    def node(self, **kw):
        self.js['nodes'].append({k: v for k, v in kw.items() if v is not None}); return len(self.js['nodes']) - 1

    def save(self, path):
        js = self.js
        if self.used: js['extensionsUsed'] = sorted(self.used)
        for k in [k for k, v in js.items() if isinstance(v, list) and not v]: del js[k]
        while len(self.bin) % 4: self.bin.append(0)
        js['buffers'] = [dict(byteLength=len(self.bin))]
        j = json.dumps(js, separators=(',', ':')).encode()
        while len(j) % 4: j += b' '
        out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(j) + 8 + len(self.bin))
        out += struct.pack('<II', len(j), 0x4E4F534A) + j + struct.pack('<II', len(self.bin), 0x004E4942) + bytes(self.bin)
        open(path, 'wb').write(out); return len(out)
