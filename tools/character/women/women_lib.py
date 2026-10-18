"""Naija Streets: the new women (MakeHuman / MPFB in the user's own Blender).
Run inside Blender (the naija_women.blend file), e.g.
    exec(open(r'C:\\Users\\user\\Documents\\naija_rooms\\women\\women_lib.py').read()); lineup()
Body types (Lagos names): Lepa (slim), Figure 8 (slim waist, big front and back), Slim-thick (fit, with hips), Orobo (full).
"""
import bpy, os, math, time, json
from mathutils import Vector

W = r'C:\Users\user\Documents\naija_rooms\women'
REN = os.path.join(W, 'renders'); os.makedirs(REN, exist_ok=True)
LOGF = os.path.join(W, 'women_log.txt')
def log(*a):
    s = time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a); print(s)
    open(LOGF, 'a', encoding='utf-8').write(s + '\n')

def T(name, v): return {'target': name, 'value': v}
def both(name, v): return [T('l-' + name, v), T('r-' + name, v)]

# ---- the four bodies -------------------------------------------------------------------------------------------
BODY = {
    'Lepa': dict(   # slim: long legs, small waist, light hips
        phen=dict(gender=0., age=.45, muscle=.48, weight=.34, proportions=1., height=.62, cupsize=.55, firmness=.8),
        targets=[T('measure-waist-circ-decr', .45), T('hip-scale-horiz-incr', .12), T('buttocks-volume-incr', .25), T('stomach-tone-incr', .5),
                 T('measure-shoulder-dist-decr', .15)]),
    'Figure 8': dict(   # coke-bottle: tiny waist, big bust and backside, full thighs
        phen=dict(gender=0., age=.45, muscle=.45, weight=.6, proportions=1., height=.55, cupsize=1., firmness=.9),
        targets=[T('measure-waist-circ-decr', 1.), T('buttocks-volume-incr', 1.), T('hip-scale-horiz-incr', .75), T('hip-scale-depth-incr', .55),
                 T('measure-hips-circ-incr', .9), T('measure-bust-circ-incr', .55), T('measure-underbust-circ-decr', .3), T('stomach-tone-incr', .8),
                 T('measure-thigh-circ-incr', .55), T('measure-shoulder-dist-decr', .15)] + both('upperleg-fat-incr', .5)),
    'Slim-thick': dict(   # fit, toned, with hips and backside
        phen=dict(gender=0., age=.45, muscle=.62, weight=.5, proportions=1., height=.57, cupsize=.75, firmness=.9),
        targets=[T('measure-waist-circ-decr', .6), T('buttocks-volume-incr', .75), T('hip-scale-horiz-incr', .45), T('hip-scale-depth-incr', .3),
                 T('measure-hips-circ-incr', .5), T('stomach-tone-incr', 1.), T('measure-thigh-circ-incr', .35)] + both('upperleg-fat-incr', .25)),
    'Orobo': dict(   # full and big all round: big bust, big hips and backside, soft belly
        phen=dict(gender=0., age=.5, muscle=.35, weight=1., proportions=.8, height=.52, cupsize=1., firmness=.55),
        targets=[T('buttocks-volume-incr', 1.), T('hip-scale-horiz-incr', .75), T('hip-scale-depth-incr', .5), T('measure-hips-circ-incr', .8),
                 T('measure-bust-circ-incr', .8), T('measure-waist-circ-incr', .35), T('stomach-pregnant-incr', .35), T('torso-scale-horiz-incr', .25),
                 T('measure-thigh-circ-incr', .6), T('neck-scale-horiz-incr', .3)] + both('upperleg-fat-incr', .7) + both('upperarm-fat-incr', .7) + both('lowerarm-fat-incr', .3)),
}
PRETTY = ([T('head-oval', .85), T('head-invertedtriangular', .35), T('head-fat-decr', .55), T('head-scale-horiz-decr', .18), T('head-scale-vert-incr', .05),
           T('forehead-scale-vert-decr', .2), T('forehead-temple-decr', .2),
           T('chin-width-decr', .75), T('chin-height-decr', .15), T('chin-prominent-incr', .2), T('chin-bones-decr', .6), T('chin-jaw-drop-decr', .3),
           T('nose-scale-horiz-decr', .6), T('nose-width1-decr', .5), T('nose-width2-decr', .5), T('nose-width3-decr', .4), T('nose-point-width-decr', .7),
           T('nose-flaring-decr', .6), T('nose-nostrils-width-decr', .6), T('nose-volume-decr', .5), T('nose-scale-vert-decr', .25), T('nose-point-up', .3),
           T('nose-hump-decr', .3), T('nose-base-up', .15),
           T('mouth-scale-horiz-decr', .3), T('mouth-upperlip-volume-decr', .08), T('mouth-lowerlip-volume-incr', .08), T('mouth-upperlip-width-decr', .25),
           T('mouth-lowerlip-width-decr', .25), T('mouth-cupidsbow-incr', .5), T('mouth-angles-up', .12), T('mouth-trans-up', .08),
           T('eyebrows-trans-up', .3), T('eyebrows-angle-up', .25), T('neck-scale-horiz-decr', .25), T('measure-neck-height-incr', .2)]
          + both('eye-scale-incr', .38) + both('eye-height2-decr', .14) + both('eye-eyefold-down', .2)
          + both('eye-corner2-up', .38) + both('eye-corner1-down', .12) + both('eye-trans-out', .08) + both('eye-bag-decr', .8) + both('eye-eyefold-angle-up', .3)
          + both('cheek-bones-incr', .3) + both('cheek-volume-decr', .3) + both('cheek-inner-decr', .25) + both('ear-scale-decr', .2))

MPFB_DATA = r'C:\Users\user\Documents\naija_rooms\mpfb\data'   # a copy of MPFB's data at a short path (this Blender's own folder is past Windows' 260-letter limit)
def svc():
    from bl_ext.blender_org.mpfb.services import HumanService, LocationService, AssetService
    if LocationService._mpfb_data != MPFB_DATA:
        LocationService._mpfb_data = MPFB_DATA; AssetService.update_all_asset_lists()
    return HumanService

def clear(tag='nw'):
    for o in list(bpy.data.objects):
        if o.get(tag) or (o.name.startswith('Human') and not o.get('nw_keep')): bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images):
        for d in list(coll):
            if d.users == 0: coll.remove(d)

def make(name, body, x=0., race=None, extra=(), skin='young_african_female/young_african_female.mhmat', brows='eyebrow010/eyebrow010.mhclo',
         lashes='eyelashes04/eyelashes04.mhclo', hair='', subdiv=1, rig='mixamo', clothes=()):
    HS = svc(); B = BODY[body]
    info = HS._create_default_human_info_dict()
    phen = dict(B['phen']); phen['race'] = race or dict(african=1., asian=0., caucasian=0.)
    info.update(name=name, phenotype=phen, rig=rig, eyes='high-poly/high-poly.mhclo', eyebrows=brows, eyelashes=lashes,
                teeth='teeth_base/teeth_base.mhclo', tongue='tongue01/tongue01.mhclo', hair=hair, proxy='',
                targets=list(B['targets']) + list(PRETTY) + list(extra), clothes=list(clothes), skin_mhmat=skin, skin_material_type='MAKESKIN', eyes_material_type='MAKESKIN')
    st = HS.get_default_deserialization_settings(); st['subdiv_levels'] = subdiv; st['load_clothes'] = bool(clothes)
    bpy.ops.object.select_all(action='DESELECT')
    bodyo = HS.deserialize_from_dict(info, st)
    rigo = bodyo.parent or bodyo
    rigo.location.x = x
    for o in [rigo] + list(rigo.children_recursive): o['nw'] = name
    log('made', name, body, 'height', round(bodyo.dimensions.z, 3))
    return rigo, bodyo

# ---- materials (from tools/character/make_humans.py: skin with a tone, strands for hair/brows/lashes, Nigerian-brown eyes)
NC = W
def images(nt, out=None):
    out = [] if out is None else out
    for nd in nt.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image: out.append((nd.label or nd.name, nd.image))
        elif nd.type == 'GROUP' and nd.node_tree: images(nd.node_tree, out)
    return out
def mhmat_textures(path):
    t = {}
    try:
        for line in open(path, encoding='utf-8', errors='ignore'):
            k, _, v = line.strip().partition(' ')
            if k.endswith('Texture') and v: t[k] = os.path.join(os.path.dirname(path), v.replace('/', os.sep)) if not os.path.isabs(v) else v
    except Exception as e: log('mhmat read failed', path, e)
    return t
def keep_tex(img_path):
    if not img_path or not os.path.exists(img_path): return None
    dst = os.path.join(NC, 'tex', os.path.basename(img_path))
    if not os.path.exists(dst):
        os.makedirs(os.path.dirname(dst), exist_ok=True); import shutil; shutil.copy(img_path, dst)
    return bpy.data.images.load(dst, check_existing=True)
def new_mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (500, 0)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled'); b.location = (200, 0); nt.links.new(b.outputs[0], out.inputs[0])
    return m, nt, b
def inp(node, *names):
    for n in names:
        if n in node.inputs: return node.inputs[n]
def tex_node(nt, img, loc, non_color=False):
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; t.location = loc
    if non_color:
        try: img.colorspace_settings.name = 'Non-Color'
        except Exception: pass
    return t
SKIN = {'fair': (.2, .11, .066), 'caramel': (.15, .077, .044), 'medium': (.105, .052, .029), 'dark': (.064, .032, .018), 'deep': (.042, .021, .012)}   # linear
def lin(c): return tuple(((x / 255 + .055) / 1.055) ** 2.4 for x in c) if max(c) > 1 else tuple(c)
def img_mean(img):
    try:
        import numpy as np
        px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)[::53][:, :3]
        if img.colorspace_settings.name.lower().startswith('srgb'): px = np.where(px <= .04045, px / 12.92, ((px + .055) / 1.055) ** 2.4)
        return float((px[:, 0] * .2126 + px[:, 1] * .7152 + px[:, 2] * .0722).mean())
    except Exception: return .3
def skin_material(name, mhmat, tone=(.5, .35, .26), value=1.0, skin=None, lips=(.4, .08, .1), detail=0.):
    tx = mhmat_textures(mhmat); log('skin textures', name, {k: os.path.basename(v) for k, v in tx.items()})
    m, nt, b = new_mat(f'NC_Skin_{name}')
    L = nt.links; col = tuple(skin or SKIN['caramel'])
    def mth(op, x, y=None, clamp=False):
        n = nt.nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for k, v in enumerate((x, y)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[k].default_value = v
            else: L.new(v, n.inputs[k])
        return n.outputs[0]
    def mix(fac, a, bcol, mode='MIX'):
        n = nt.nodes.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = mode
        f = next(i for i in n.inputs if i.name == 'Factor' and i.type == 'VALUE'); A = next(i for i in n.inputs if i.name == 'A' and i.type == 'RGBA'); B = next(i for i in n.inputs if i.name == 'B' and i.type == 'RGBA')
        for sock, v in ((f, fac), (A, a), (B, bcol)):
            if isinstance(v, tuple): sock.default_value = v
            elif isinstance(v, (int, float)): sock.default_value = v
            else: L.new(v, sock)
        return next(o for o in n.outputs if o.type == 'RGBA')
    d = keep_tex(tx.get('diffuseTexture'))
    base = (*col, 1)
    if d and detail > 0:
        t = tex_node(nt, d, (-900, 120)); bw = nt.nodes.new('ShaderNodeRGBToBW'); L.new(t.outputs['Color'], bw.inputs[0])
        mean = img_mean(d)
        k = mth('ADD', mth('MULTIPLY', mth('SUBTRACT', bw.outputs[0], mean), detail / max(.05, mean)), 1.)   # 1 +- a little detail
        kc = nt.nodes.new('ShaderNodeCombineColor'); [L.new(k, kc.inputs[i]) for i in range(3)]
        cur = mix(1., base, kc.outputs[0], 'MULTIPLY')
    else:   # an even tone with a soft noise, the same as the new heads
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 90.; nz.inputs['Detail'].default_value = 8.
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = .93; mr.inputs['To Max'].default_value = 1.07; L.new(nz.outputs['Fac'], mr.inputs['Value'])
        kc = nt.nodes.new('ShaderNodeCombineColor'); [L.new(mr.outputs['Result'], kc.inputs[i]) for i in range(3)]
        cur = mix(1., base, kc.outputs[0], 'MULTIPLY')
    def attr(nm):
        a = nt.nodes.new('ShaderNodeAttribute'); a.attribute_name = nm; a.attribute_type = 'GEOMETRY'; return a.outputs['Fac']
    # blush, brows filled in, eyeliner, lipstick
    cur = mix(mth('MULTIPLY', attr('mk_blush'), .22), cur, (.75, .18, .16, 1), 'MULTIPLY')
    cur = mix(mth('MULTIPLY', attr('mk_brow'), .35), cur, (.02, .012, .01, 1))
    cur = mix(mth('MULTIPLY', attr('mk_liner'), .7), cur, (.006, .004, .004, 1))
    lipf = attr('mk_lips')
    cur = mix(mth('MULTIPLY', lipf, .8), cur, (*lips, 1))
    L.new(cur, b.inputs['Base Color'])
    sc = inp(b, 'Subsurface Color')
    if sc: L.new(cur, sc)
    nm = keep_tex(tx.get('normalmapTexture'))
    if nm:
        t = tex_node(nt, nm, (-700, -250), True); n = nt.nodes.new('ShaderNodeNormalMap'); n.inputs['Strength'].default_value = .35
        L.new(t.outputs['Color'], n.inputs['Color']); L.new(n.outputs['Normal'], b.inputs['Normal'])
    rough = mth('SUBTRACT', .55, mth('MULTIPLY', lipf, .3))   # glossy lips
    L.new(rough, b.inputs['Roughness'])
    for k_, v in (('Subsurface Weight', .15), ('Subsurface Scale', .005), ('Specular IOR Level', .38), ('Coat Weight', 0.), ('Sheen Weight', .05)):
        i = inp(b, k_)
        if i: i.default_value = v
    i = inp(b, 'Subsurface Radius')
    if i: i.default_value = (1.0, .35, .18)
    return m
def strand_material(name, src_mat, tint):
    # hair, brows, lashes: the strand picture as alpha, coloured near-black
    imgs = images(src_mat.node_tree) if src_mat and src_mat.node_tree else []
    img = imgs[0][1] if imgs else None
    m, nt, b = new_mat(f'NC_Strand_{name}')
    if img:
        t = tex_node(nt, img, (-600, 100))
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.location = (-250, 120)
        next(i for i in mix.inputs if i.name == 'Factor' and i.type == 'VALUE').default_value = 1.0
        bw = nt.nodes.new('ShaderNodeRGBToBW'); bw.location = (-420, 160); nt.links.new(t.outputs['Color'], bw.inputs[0])
        A = next(i for i in mix.inputs if i.name == 'A' and i.type == 'RGBA'); nt.links.new(bw.outputs[0], A)
        next(i for i in mix.inputs if i.name == 'B' and i.type == 'RGBA').default_value = (tint[0], tint[1], tint[2], 1)
        nt.links.new(next(o for o in mix.outputs if o.type == 'RGBA'), b.inputs['Base Color'])
        nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
    else:
        b.inputs['Base Color'].default_value = (tint[0], tint[1], tint[2], 1)
    b.inputs['Roughness'].default_value = .8
    i = inp(b, 'Specular IOR Level')
    if i: i.default_value = .15
    try: m.surface_render_method = 'DITHERED'
    except Exception:
        try: m.blend_method = 'HASHED'
        except Exception: pass
    return m
def eye_material(name, src_mat):
    imgs = images(src_mat.node_tree) if src_mat and src_mat.node_tree else []
    m, nt, b = new_mat(f'NC_Eye_{name}')
    if imgs:
        t = tex_node(nt, imgs[0][1], (-700, 100))
        # a bigger iris: pull the picture in toward the nearer of the two irises (MakeHuman's are small, so the eyes stare)
        uvn = nt.nodes.new('ShaderNodeUVMap'); VM = lambda op: (lambda n: (setattr(n, 'operation', op), n)[1])(nt.nodes.new('ShaderNodeVectorMath'))
        c1, c2 = (.705, .702, 0.), (.289, .29, 0.)
        d1 = VM('DISTANCE'); nt.links.new(uvn.outputs['UV'], d1.inputs[0]); d1.inputs[1].default_value = c1
        d2 = VM('DISTANCE'); nt.links.new(uvn.outputs['UV'], d2.inputs[0]); d2.inputs[1].default_value = c2
        lt = nt.nodes.new('ShaderNodeMath'); lt.operation = 'LESS_THAN'; nt.links.new(d1.outputs['Value'], lt.inputs[0]); nt.links.new(d2.outputs['Value'], lt.inputs[1])
        mc = nt.nodes.new('ShaderNodeMix'); mc.data_type = 'VECTOR'
        nt.links.new(lt.outputs[0], next(i for i in mc.inputs if i.name == 'Factor' and i.type == 'VALUE'))
        next(i for i in mc.inputs if i.name == 'A' and i.type == 'VECTOR').default_value = c2; next(i for i in mc.inputs if i.name == 'B' and i.type == 'VECTOR').default_value = c1
        cv = next(o for o in mc.outputs if o.type == 'VECTOR')
        sub = VM('SUBTRACT'); nt.links.new(uvn.outputs['UV'], sub.inputs[0]); nt.links.new(cv, sub.inputs[1])
        scl = VM('SCALE'); nt.links.new(sub.outputs['Vector'], scl.inputs[0]); scl.inputs['Scale'].default_value = 1 / 1.38
        add = VM('ADD'); nt.links.new(scl.outputs['Vector'], add.inputs[0]); nt.links.new(cv, add.inputs[1])
        nt.links.new(add.outputs['Vector'], t.inputs['Vector'])
        # the iris (the dark part of the picture) becomes a deep brown; the white of the eye stays
        bw = nt.nodes.new('ShaderNodeRGBToBW'); bw.location = (-480, -60); nt.links.new(t.outputs['Color'], bw.inputs[0])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.location = (-300, -60); mr.inputs['From Min'].default_value = .22; mr.inputs['From Max'].default_value = .5
        mr.inputs['To Min'].default_value = 1.; mr.inputs['To Max'].default_value = 0.
        nt.links.new(bw.outputs[0], mr.inputs['Value'])
        # the iris keeps the picture's detail but goes a deep Nigerian brown
        dk = nt.nodes.new('ShaderNodeMix'); dk.data_type = 'RGBA'; dk.blend_type = 'MULTIPLY'; dk.location = (-300, 250)
        next(i for i in dk.inputs if i.name == 'Factor' and i.type == 'VALUE').default_value = 1.
        nt.links.new(t.outputs['Color'], next(i for i in dk.inputs if i.name == 'A' and i.type == 'RGBA'))
        next(i for i in dk.inputs if i.name == 'B' and i.type == 'RGBA').default_value = (.3, .17, .1, 1)
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.location = (-120, 100)
        nt.links.new(mr.outputs['Result'], next(i for i in mix.inputs if i.name == 'Factor' and i.type == 'VALUE'))
        nt.links.new(t.outputs['Color'], next(i for i in mix.inputs if i.name == 'A' and i.type == 'RGBA'))
        nt.links.new(next(o for o in dk.outputs if o.type == 'RGBA'), next(i for i in mix.inputs if i.name == 'B' and i.type == 'RGBA'))
        sw = nt.nodes.new('ShaderNodeMix'); sw.data_type = 'RGBA'; sw.blend_type = 'MULTIPLY'   # the white of the eye a little softer
        next(i for i in sw.inputs if i.name == 'Factor' and i.type == 'VALUE').default_value = 1.
        nt.links.new(next(o for o in mix.outputs if o.type == 'RGBA'), next(i for i in sw.inputs if i.name == 'A' and i.type == 'RGBA'))
        next(i for i in sw.inputs if i.name == 'B' and i.type == 'RGBA').default_value = (.8, .76, .72, 1)
        nt.links.new(next(o for o in sw.outputs if o.type == 'RGBA'), b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = .35; i = inp(b, 'Coat Weight')
    if i: i.default_value = .12
    i = inp(b, 'Coat Roughness')
    if i: i.default_value = .06
    i = inp(b, 'Specular IOR Level')
    if i: i.default_value = .3
    return m
def eyes_split(o, iris_mat):
    # the eye texture holds both eyeballs and, in its corner, a clear disc used by the cornea over each eye:
    # faces mapped to that corner get a glassy see-through material
    import bmesh
    bm = bmesh.new(); bm.from_mesh(o.data); uv = bm.loops.layers.uv.active
    m_c, nt, b = new_mat('NC_Cornea'); b.inputs['Base Color'].default_value = (1, 1, 1, 1); b.inputs['Roughness'].default_value = .02; b.inputs['Alpha'].default_value = 0.
    i = inp(b, 'Specular IOR Level')
    if i: i.default_value = 1.0
    try: m_c.surface_render_method = 'BLENDED'
    except Exception: pass
    o.data.materials.clear(); o.data.materials.append(iris_mat); o.data.materials.append(m_c)
    n = 0
    for f in bm.faces:
        us = [l[uv].uv for l in f.loops]; u = sum(q.x for q in us) / len(us); v = sum(q.y for q in us) / len(us)
        f.material_index = 1 if (u > .8 and v < .2) else 0; n += f.material_index
    bm.to_mesh(o.data); bm.free()
    log('eyes', o.name, 'cornea faces', n, 'of', len(o.data.polygons))
def tune(name, rig, body, skin, p):
    for o in [body] + list(rig.children_recursive):
        if o.type != 'MESH' or not o.material_slots: continue
        n = o.name.lower(); src = o.material_slots[0].material
        if 'high-poly' in n or 'low-poly' in n:
            eyes_split(o, eye_material(o.name, src)); continue
        if o == body: mat = skin_material(name, skin, skin=p.get('skin'), lips=p.get('lips', (.4, .08, .1)))
        elif 'brow' in n or 'lash' in n: mat = strand_material(o.name, src, (.025, .02, .018))
        elif any(h in n for h in ('short', 'afro', 'braid', 'bob', 'long', 'ponytail', 'hair')): mat = strand_material(o.name, src, (.018, .014, .012))
        else: continue
        log('material', o.name, '<-', src.name if src else None, [os.path.basename(i.filepath) for _, i in (images(src.node_tree) if src and src.node_tree else [])][:3])
        for sl in o.material_slots: sl.material = mat


# ---- the photo studio ------------------------------------------------------------------------------------------
def studio(cx=0., width=4., h=1.7, front=True, tag='nw_studio'):
    for o in list(bpy.data.objects):
        if o.get(tag): bpy.data.objects.remove(o, do_unlink=True)
    sc = bpy.context.scene
    def add(o):
        sc.collection.objects.link(o); o[tag] = 1; return o
    cam = add(bpy.data.objects.new('NW_Cam', bpy.data.cameras.new('NW_Cam')))
    cam.data.lens = 50; d = max(4.2, width * 1.55)
    cam.location = (cx, -d, h * .55); cam.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = cam
    for nm, loc, en, sz in (('NW_Key', (cx - 2.5, -3.5, 3.2), 900, 3.), ('NW_Fill', (cx + 3., -2.5, 1.8), 350, 4.), ('NW_Rim', (cx, 3., 2.8), 600, 3.)):
        L = add(bpy.data.objects.new(nm, bpy.data.lights.new(nm, 'AREA'))); L.data.energy = en; L.data.size = sz; L.location = loc
        L.rotation_euler = (Vector((cx, 0, 1.)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    fl = bpy.data.meshes.new('NW_Floor'); fl.from_pydata([(-30, -30, 0), (30, -30, 0), (30, 30, 0), (-30, 30, 0)], [], [(0, 1, 2, 3)])
    F = add(bpy.data.objects.new('NW_Floor', fl)); m = bpy.data.materials.get('NW_FloorMat') or bpy.data.materials.new('NW_FloorMat')
    m.use_nodes = True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.32, .3, .29, 1); m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .9
    F.data.materials.append(m)
    w = sc.world or bpy.data.worlds.new('World'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    if bg: bg.inputs[0].default_value = (.42, .44, .48, 1); bg.inputs[1].default_value = .6
    sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else sc.render.engine
    sc.render.resolution_x, sc.render.resolution_y = 1600, 900; sc.render.film_transparent = False
    try: sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Base Contrast'; sc.view_settings.exposure = -.45
    except Exception:
        try: sc.view_settings.view_transform = 'Standard'; sc.view_settings.exposure = -.3
        except Exception: pass
    return cam

def shot(fn, cam=None):
    sc = bpy.context.scene
    if cam: sc.camera = cam
    sc.render.filepath = os.path.join(REN, fn)
    bpy.ops.render.render(write_still=True)
    log('render', fn); return sc.render.filepath

PREVIEW_WEAR = ('female_sportsuit01/female_sportsuit01.mhclo',)   # previews are always dressed
def lineup(sub=1):
    """The four bodies side by side, front and side views."""
    clear(); names = list(BODY); xs = [(-1.5 + i) * 1.0 for i in range(len(names))]
    out = []
    for nm, x in zip(names, xs): out.append(make(nm, nm, x=x, subdiv=sub, clothes=PREVIEW_WEAR))
    studio(cx=0., width=4.)
    shot('bodies_front.png')
    for rig, _ in out: rig.rotation_euler.z = math.radians(90)
    shot('bodies_side.png')
    for rig, _ in out: rig.rotation_euler.z = 0
    bpy.ops.wm.save_mainfile()
    return out

# ---- the nine women ------------------------------------------------------------------------------------------------
BROWS, LASHES = 'eyebrow003/eyebrow003.mhclo', 'eyelashes04/eyelashes04.mhclo'
TONES = {'fair': ((1., .8, .6), 1.5), 'caramel': ((.95, .72, .52), 1.32), 'medium': ((.82, .6, .44), 1.14), 'dark': ((.62, .43, .3), 1.0), 'deep': ((.48, .33, .24), .92)}
YOUNG, MIDDLE = 'young_african_female/young_african_female.mhmat', 'middleage_african_female/middleage_african_female.mhmat'
WOMEN = {
    'Amaka': dict(body='Figure 8', tone='caramel', age=.46, skin=YOUNG, hair='', lips=(.14, .025, .03), face=[T('head-oval', .1)]),
    'Ada': dict(body='Lepa', tone='dark', age=.45, skin=YOUNG, hair='', lips=(.08, .015, .02), face=[T('nose-scale-horiz-decr', -.15), T('mouth-lowerlip-volume-incr', .15)] + both('cheek-bones-incr', .15)),
    'Chioma': dict(body='Slim-thick', tone='fair', age=.43, skin=YOUNG, hair='ponytail01/ponytail01.mhclo', lips=(.2, .045, .05), face=[T('head-round', .25), T('mouth-dimples-in', .4)] + both('cheek-volume-incr', .35)),
    'Bisi': dict(body='Figure 8', tone='caramel', age=.46, skin=YOUNG, hair='long01/long01.mhclo', lips=(.22, .008, .015), face=[T('head-diamond', .3)] + both('eye-corner2-up', .1)),
    'Kemi': dict(body='Lepa', tone='deep', age=.45, skin=YOUNG, hair='short02/short02.mhclo', lips=(.05, .012, .015), face=[T('measure-neck-height-incr', .15)] + both('cheek-bones-incr', .2)),
    'Funmi': dict(body='Slim-thick', tone='medium', age=.52, skin=YOUNG, hair='bob02/bob02.mhclo', lips=(.12, .035, .03), face=[T('head-oval', -.15), T('head-square', .12)]),
    'Mama Nkechi': dict(body='Orobo', tone='dark', age=.68, skin=MIDDLE, hair='', lips=(.08, .018, .02), face=[T('head-round', .4), T('head-fat-incr', .9), T('neck-double-incr', .35)] + both('cheek-volume-incr', .6)),
    'Iya Basira': dict(body='Orobo', tone='medium', age=.62, skin=MIDDLE, hair='', lips=(.09, .03, .025), face=[T('head-fat-incr', .75), T('nose-scale-horiz-decr', -.2)] + both('cheek-volume-incr', .4)),
    'Sgt Halima': dict(body='Figure 8', tone='fair', age=.5, skin=YOUNG, hair='', lips=(.14, .03, .035), face=[T('nose-scale-vert-incr', .2), T('chin-prominent-incr', .1)], booty=1.),   # the policewoman: big hips and backside
}

def merge(*lists):
    """One value per target (MakeHuman takes each target once); values add up, held to 1."""
    out = {}
    for L in lists:
        for t in L: out[t['target']] = max(-1., min(1., out.get(t['target'], 0.) + t['value']))
    return [T(k, v) for k, v in out.items()]

def make_woman(name, x=0., subdiv=1, clothes=(), with_hair=True, brows=None, lashes=None):
    from bl_ext.blender_org.mpfb.services import AssetService
    P = WOMEN[name]; B = BODY[P['body']]; HS = svc()
    info = HS._create_default_human_info_dict()
    phen = dict(B['phen']); phen['age'] = P['age']; phen['race'] = dict(african=1., asian=0., caucasian=0.)
    info.update(name=name, phenotype=phen, rig='mixamo', eyes='high-poly/high-poly.mhclo', eyebrows=brows or P.get('brows', BROWS), eyelashes=lashes or P.get('lashes', LASHES),
                teeth='teeth_base/teeth_base.mhclo', tongue='tongue01/tongue01.mhclo', hair=P['hair'] if with_hair else '', proxy='',
                targets=merge(B['targets'], PRETTY, P['face']), clothes=list(clothes), skin_mhmat=P['skin'], skin_material_type='MAKESKIN', eyes_material_type='MAKESKIN')
    st = HS.get_default_deserialization_settings(); st['subdiv_levels'] = subdiv; st['load_clothes'] = bool(clothes)
    bpy.ops.object.select_all(action='DESELECT')
    body = HS.deserialize_from_dict(info, st); rig = body.parent or body
    rig.location.x = x; rig.name = 'NW_' + name.replace(' ', '_')
    for o in [rig] + list(rig.children_recursive): o['nw'] = name
    tune(name, rig, body, str(AssetService.find_asset_absolute_path(P['skin'], 'skins')), dict(skin=SKIN[P['tone']], lips=P.get('lips', (.4, .08, .1))))
    if P.get('booty'): add_booty(body, rig, P['booty'])
    makeup_masks(name, rig, body)
    log('woman', name, P['body'], 'height', round(body.dimensions.z, 3))
    return rig, body

def add_booty(body, rig, k=1.):
    """a rounder, bigger backside and wider hips than MakeHuman's own targets go: a shape key of our own on top of them"""
    import numpy as np
    me = body.data
    if not me.shape_keys: body.shape_key_add(name='Basis', from_mix=False)
    for nm in ('NW_Booty', 'NW_tmp'):
        kb = me.shape_keys.key_blocks.get(nm)
        if kb: body.shape_key_remove(kb)
    tmp = body.shape_key_add(name='NW_tmp', from_mix=True); n = len(me.vertices)
    P = np.zeros(n * 3); tmp.data.foreach_get('co', P); P = P.reshape(-1, 3); body.shape_key_remove(tmp)
    M = np.array(body.matrix_world); Pw = P @ M[:3, :3].T + M[:3, 3]
    h = np.array(rig.matrix_world @ rig.pose.bones['mixamorig:Hips'].head)
    D = np.zeros((n, 3))
    for s in (-1., 1.):
        d = (Pw - (h + [s * .085, .075, -.075])) / [.085, .085, .11]
        g = np.exp(-(d ** 2).sum(1)) * (Pw[:, 1] > h[1] - .01)                  # each cheek, out behind her (+Y is her back)
        D += g[:, None] * np.array([s * .01, .056, -.006]) * k
        d2 = (Pw - (h + [s * .15, 0., -.06])) / [.06, .1, .12]
        g2 = np.exp(-(d2 ** 2).sum(1)); D += g2[:, None] * np.array([s * .013, .004, 0.]) * k   # the hips, wider
    D[np.abs(Pw[:, 0] - h[0]) > .26] = 0.                                          # (never her hands)
    Dl = D @ np.linalg.inv(M[:3, :3]).T
    basis = me.shape_keys.key_blocks[0]; B = np.zeros(n * 3); basis.data.foreach_get('co', B)
    kb = body.shape_key_add(name='NW_Booty', from_mix=False); kb.data.foreach_set('co', (B.reshape(-1, 3) + Dl).ravel()); kb.value = 1.
    log('booty', body.name, round(float(np.abs(D).max()), 3), 'm')

def head_at(rig):
    pb = rig.pose.bones.get('mixamorig:Head') or rig.pose.bones.get('head')
    return rig.matrix_world @ pb.head if pb else rig.location + Vector((0, 0, 1.55))

def portrait(rig, fn, yaw=-25, d=1.05, res=(700, 800), up=.06):
    """A head-and-shoulders picture of one woman."""
    sc = bpy.context.scene; h = head_at(rig)
    cam = bpy.data.objects.get('NW_PCam') or bpy.data.objects.new('NW_PCam', bpy.data.cameras.new('NW_PCam'))
    if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
    cam['nw_studio'] = 1; cam.data.lens = 85
    a = math.radians(yaw); tgt = h + Vector((0, 0, up))
    cam.location = tgt + Vector((math.sin(a) * d, -math.cos(a) * d, .02))
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    old = (sc.render.resolution_x, sc.render.resolution_y); sc.render.resolution_x, sc.render.resolution_y = res
    prev = sc.camera; sc.camera = cam
    try: shot(fn)
    finally:
        sc.camera = prev; sc.render.resolution_x, sc.render.resolution_y = old

# ---- a dark cap over the scalp (from make_humans.py), so no grey skin shows between braids or at a parting
def head_frame(rig, body):
    dg = bpy.context.evaluated_depsgraph_get(); ev = body.evaluated_get(dg); me = ev.to_mesh()
    mw = ev.matrix_world.copy(); nm = mw.to_3x3().inverted().transposed()
    V = [mw @ v.co for v in me.vertices]; N = [(nm @ v.normal).normalized() for v in me.vertices]
    polys = [tuple(p.vertices) for p in me.polygons]
    ev.to_mesh_clear()
    eyes = next((c for c in rig.children_recursive if 'high-poly' in c.name or 'low-poly' in c.name), None)
    pb = rig.pose.bones.get('mixamorig:Head'); hb = rig.matrix_world @ pb.head
    if eyes:
        zs = [(eyes.matrix_world @ v.co).z for v in eyes.data.vertices]; eyez = sum(zs) / len(zs)
    else: eyez = hb.z + .1
    hv = [p for p in V if p.z > eyez - .01 and (p - hb).length < .3]
    xs = [p.x for p in hv]; ys = [p.y for p in hv]
    ctr = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, eyez + .025))
    neck = rig.matrix_world @ rig.pose.bones['mixamorig:Neck'].head
    log('head frame: eye z', round(eyez, 3), 'centre', tuple(round(c, 3) for c in ctr), 'head verts', len(hv), 'neck z', round(neck.z, 3))
    return dict(V=V, N=N, polys=polys, eyez=eyez, ctr=ctr, neckz=neck.z, rig=rig)
def hairline_fn(front):
    KN = [(0, front), (35, front - .006), (65, front - .022), (95, .042), (125, .008), (155, -.04), (180, -.058)]
    def hl(a):
        a = abs(a)
        for (a0, v0), (a1, v1) in zip(KN, KN[1:]):
            if a <= a1: t = (a - a0) / (a1 - a0); return v0 + (v1 - v0) * (t * t * (3 - 2 * t))
        return KN[-1][1]
    return hl
def scalp(F, front=.072):
    hl = hairline_fn(front); out = {}
    for i, p in enumerate(F['V']):
        d = p - F['ctr']
        if d.length > .17 or p.z < F['eyez'] - .1: continue
        a = math.degrees(math.atan2(d.x, -d.y)); h = p.z - F['eyez'] - hl(a)
        if h > -.004: out[i] = (h, a)
    log('scalp verts', len(out))
    return out
def skin_to(obj, rig, groups):
    # weights: groups = {bone_name: [w per vertex]}
    for bn, ws in groups.items():
        vg = obj.vertex_groups.new(name=bn)
        for i, w in enumerate(ws):
            if w > 0: vg.add([i], w, 'REPLACE')
    md = obj.modifiers.new('Armature', 'ARMATURE'); md.object = rig
    obj.parent = rig; obj.matrix_parent_inverse = rig.matrix_world.inverted()
def mesh_obj(name, verts, faces, coll, attrs=None, uvs=None):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], [], faces); me.update()
    for an, vals in (attrs or {}).items():
        at = me.attributes.new(an, 'FLOAT', 'POINT'); at.data.foreach_set('value', vals)
    if uvs:
        uvl = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li in poly.loop_indices: uvl.data[li].uv = uvs[me.loops[li].vertex_index]
    for poly in me.polygons: poly.use_smooth = True
    o = bpy.data.objects.new(name, me); coll.objects.link(o); o['naija_char'] = 1; o['nw'] = name.split('.')[0]
    return o
def shell(name, F, sc, thick, coll, mat, offset=.0012):
    """a shell over the scalp: thick(h, a, p) gives the hair thickness at each point"""
    idx = {}; verts = []; cut = []
    for i, (h, a) in sc.items():
        p = F['V'][i]; n = F['N'][i]; t = thick(h, a, p)
        idx[i] = len(verts); verts.append(p + n * (offset + t)); cut.append(max(0., min(1., (h + .004) / .012)))
    faces = [tuple(idx[v] for v in poly) for poly in F['polys'] if all(v in idx for v in poly)]
    o = mesh_obj(name, verts, faces, coll, attrs={'cut': cut})
    o.data.materials.append(mat)
    skin_to(o, F['rig'], {'mixamorig:Head': [1.] * len(verts)})
    sub = o.modifiers.new('Smooth', 'SUBSURF'); sub.levels = 1; sub.render_levels = 1
    log('shell', name, len(verts), 'verts', len(faces), 'faces')
    return o

def scalp_cap(name, front=.072):
    rig = bpy.data.objects['NW_' + name.replace(' ', '_')]; body = bpy.data.objects[name + '.body']
    old = bpy.data.objects.get(name + '.scalp')
    if old: bpy.data.objects.remove(old, do_unlink=True)
    F = head_frame(rig, body); sc = scalp(F, front)
    m, nt, b = new_mat('NW_Scalp'); b.inputs['Base Color'].default_value = (.02, .015, .012, 1); b.inputs['Roughness'].default_value = .85
    i = inp(b, 'Specular IOR Level')
    if i: i.default_value = .05
    o = shell(name + '.scalp', F, sc, lambda h, a, p: 0., body.users_collection[0], m, offset=.0008)
    return o

# ---- make-up masks on the body: lips, eyeliner on the lash line, brows filled in, a little blush ----------------
def _target_mag(name):
    import gzip
    p = os.path.join(MPFB_DATA, 'targets')
    for root, ds, fs in os.walk(p):
        if name + '.target.gz' in fs:
            out = {}
            for ln in gzip.open(os.path.join(root, name + '.target.gz'), 'rt'):
                q = ln.split()
                if len(q) == 4:
                    try: out[int(q[0])] = (float(q[1]) ** 2 + float(q[2]) ** 2 + float(q[3]) ** 2) ** .5
                    except ValueError: pass
            return out
    return {}

def _rest_positions(body):
    """The body's vertices with its shape (targets) but no subdivision or masks, in world space."""
    off = [m for m in body.modifiers if m.type in ('SUBSURF', 'MASK') and m.show_viewport]
    for m in off: m.show_viewport = False
    try:
        dg = bpy.context.evaluated_depsgraph_get(); dg.update(); e = body.evaluated_get(dg); me = e.to_mesh()
        V = [body.matrix_world @ v.co for v in me.vertices]; e.to_mesh_clear()
    finally:
        for m in off: m.show_viewport = True
    return V

def _near(V, obj, r0, r1):
    from mathutils.kdtree import KDTree
    dg = bpy.context.evaluated_depsgraph_get(); e = obj.evaluated_get(dg); me = e.to_mesh()
    P = [obj.matrix_world @ v.co for v in me.vertices]; e.to_mesh_clear()
    kd = KDTree(len(P))
    for i, p in enumerate(P): kd.insert(p, i)
    kd.balance()
    out = [0.] * len(V)
    for i, v in enumerate(V):
        _, _, d = kd.find(v)
        if d is not None and d < r1: out[i] = 1. if d <= r0 else (r1 - d) / (r1 - r0)
    return out

def makeup_masks(name, rig, body):
    V = _rest_positions(body); n = len(V); me = body.data
    if len(me.vertices) != n: log('makeup: vertex count differs', len(me.vertices), n); return
    def put(key, vals):
        a = me.attributes.get(key) or me.attributes.new(key, 'FLOAT', 'POINT'); a.data.foreach_set('value', [float(max(0., min(1., x))) for x in vals])
    def from_targets(names, lo, hi):
        mag = [0.] * n
        for t in names:
            for i, m in _target_mag(t).items():
                if i < n: mag[i] = max(mag[i], m)
        mx = max(mag) or 1.
        return [0. if x / mx < lo else 1. if x / mx > hi else ((x / mx - lo) / (hi - lo)) ** .7 for x in mag]
    put('mk_lips', from_targets(['mouth-upperlip-volume-incr', 'mouth-lowerlip-volume-incr'], .12, .45))
    put('mk_blush', from_targets(['l-cheek-bones-incr', 'r-cheek-bones-incr'], .2, .9))
    kids = list(rig.children_recursive)
    lash = next((o for o in kids if 'eyelash' in o.name), None); brow = next((o for o in kids if 'eyebrow' in o.name), None)
    if lash: put('mk_liner', _near(V, lash, .001, .0026))
    if brow: put('mk_brow', _near(V, brow, .002, .005))
    log('makeup masks', name, 'lash' if lash else '-', 'brow' if brow else '-')
