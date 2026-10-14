"""Naija Streets: the base man and woman (MakeHuman / MPFB), with portrait and full-body pictures.
Run in Blender's Python console:
    exec(open(r'C:\\Users\\DELL\\Downloads\\naija_char\\make_humans.py').read())
Can be run again: it rebuilds the two characters. Pictures go to naija_char\\renders."""
import bpy, os, math, time, traceback, json
from mathutils import Vector, Euler
NC = r'C:\Users\DELL\Downloads\naija_char'
REN = os.path.join(NC, 'renders'); os.makedirs(REN, exist_ok=True)
LOGF = os.path.join(NC, 'make_log.txt'); open(LOGF, 'w').close()
def log(*a):
    s = time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a); print(s)
    open(LOGF, 'a', encoding='utf-8').write(s + '\n')

BROWN_EYES = {"Clearcoat": 0.4000000059604645, "Clearcoat Roughness": 0.0, "EyeWhiteColor": [0.92, 0.89, 0.86, 1.0], "InnerLayerRoughness": 0.05000000074505806, "IrisBumpStrength": 0.30000001192092896, "IrisClockwiseMult": 3.5, "IrisFeatureScale": 16.899999618530273, "IrisMajorColor": [0.075, 0.036, 0.016, 1.0], "IrisMinorColor": [0.028, 0.013, 0.006, 1.0], "IrisRadialMult": 0.30000001192092896, "IrisSection1End": 0.10000000149011612, "IrisSection2End": 0.800000011920929, "IrisSection3End": 0.8500000238418579, "IrisSection4Color": [0.012, 0.006, 0.003, 1.0], "IrisToEyeWhiteRelation": 0.38999998569488525, "OuterLayerAlpha": 0.0, "OuterLayerColor": [1.0, 1.0, 1.0, 1.0], "OuterLayerIOR": 1.3300000429153442, "OuterLayerRoughness": 0.0, "OuterLayerTransmission": 0.0, "PupilColor": [0.0, 0.0, 0.0, 1.0], "PupilSize": 0.30000001192092896}
T = lambda name, v: {'target': name, 'value': v}
def both(name, v): return [T('l-' + name, v), T('r-' + name, v)]
THICK = [T('buttocks-volume-incr', 1.), T('hip-scale-horiz-incr', .5), T('hip-scale-depth-incr', .3), T('measure-hips-circ-incr', .55), T('measure-waist-circ-decr', .55),
         T('stomach-tone-incr', .6), T('measure-bust-circ-incr', .35), T('measure-thigh-circ-incr', .45), T('measure-shoulder-dist-decr', .1)] + both('upperleg-fat-incr', .45) + both('upperarm-fat-incr', .1)
PRETTY = [T('head-oval', .5), T('chin-width-decr', .25), T('chin-height-decr', .1), T('nose-scale-horiz-decr', .35), T('nose-flaring-decr', .35), T('nose-point-width-decr', .4),
          T('nose-width1-decr', .25), T('nose-width2-decr', .25), T('nose-volume-decr', .25), T('nose-scale-vert-decr', .1), T('mouth-scale-horiz-decr', .08),
          T('mouth-upperlip-volume-decr', .1), T('mouth-lowerlip-volume-decr', .05)] + both('eye-scale-incr', .25) + both('cheek-bones-incr', .4)
FEM = dict(gender=0.0, age=.48, muscle=.45, weight=.66, proportions=.9, height=.55, cupsize=.92, firmness=.85)
PEOPLE = {
    'Tunde': dict(x=-.9, phen=dict(gender=1.0, age=.5, muscle=.68, weight=.56, proportions=.85, height=.52, cupsize=.5, firmness=.5, race=dict(african=1., asian=0., caucasian=0.)),
                  skin='mindfront_skin_male_african_middleage/mindfront_skin_male_african_middleage.mhmat', brows='eyebrow001/eyebrow001.mhclo', lashes='eyelashes01/eyelashes01.mhclo', hair='',
                  tone=(.42, .29, .21), value=1.0, hairdo=dict(kind='full'), clothes=[],
                  targets=[T('head-oval', .25), T('head-square', .2), T('chin-width-incr', .15), T('chin-prominent-incr', .15), T('neck-scale-horiz-incr', .25), T('torso-vshape-incr', .35),
                           T('nose-scale-horiz-incr', .3), T('nose-flaring-incr', .35), T('nose-width2-incr', .2), T('mouth-upperlip-volume-incr', .35), T('mouth-lowerlip-volume-incr', .3), T('mouth-scale-horiz-incr', .12), T('eyebrows-trans-down', .2)] + both('eye-scale-incr', .12) + both('cheek-bones-incr', .3)),
    'Amaka': dict(x=0., phen=dict(FEM, race=dict(african=.9, asian=0., caucasian=.1)),
                  skin='young_african_female/young_african_female.mhmat', brows='eyebrow010/eyebrow010.mhclo', lashes='eyelashes04/eyelashes04.mhclo', hair='',
                  tone=(1., .84, .7), value=1.75, hairdo=dict(kind='braids', length=.72, seed=3, cuffs=0, spacing=.016), clothes=[],
                  targets=THICK + PRETTY),
    'Ada': dict(x=.9, phen=dict(FEM, height=.5, race=dict(african=1., asian=0., caucasian=0.)),
                skin='young_african_female/young_african_female.mhmat', brows='eyebrow010/eyebrow010.mhclo', lashes='eyelashes04/eyelashes04.mhclo', hair='',
                tone=(.55, .38, .28), value=1.0, hairdo=dict(kind='braids', length=.42, seed=11, cuffs=9, spacing=.015), clothes=[],
                targets=THICK + PRETTY[:6] + [T('nose-flaring-decr', .15), T('mouth-upperlip-volume-incr', .15), T('mouth-lowerlip-volume-incr', .15)] + both('eye-scale-incr', .25) + both('cheek-bones-incr', .45)),
}
def short_paths():
    # This Blender (Microsoft Store) keeps add-on files in a very long folder, past Windows' 260-letter limit, so some
    # MakeHuman files could not be unpacked there. Use copies in naija_char instead.
    import zipfile
    from bl_ext.user_default.mpfb.services import LocationService, AssetService
    sysd = os.path.join(NC, 'mpfb', 'data')
    if not os.path.exists(os.path.join(sysd, 'targets', 'macrodetails', 'proportions', 'female-young-averagemuscle-averageweight-idealproportions.target.gz')):
        z = zipfile.ZipFile(os.path.join(NC, 'downloads', 'mpfb-2.0.18.zip')); n = 0
        for m in z.infolist():
            i = m.filename.find('data/')
            if i < 0 or m.is_dir() or (i > 0 and m.filename[i - 1] != '/'): continue
            dst = os.path.join(sysd, m.filename[i + 5:].replace('/', os.sep)); os.makedirs(os.path.dirname(dst), exist_ok=True)
            with z.open(m) as src, open(dst, 'wb') as out: out.write(src.read()); n += 1
        log('unpacked MPFB data:', n, 'files')
    usr = os.path.join(NC, 'mpfb_user', 'data')
    for pk in ('makehuman_system_assets', 'skins02', 'eyebrows01', 'bodyparts05'):
        mark = os.path.join(usr, '.' + pk)
        if os.path.exists(mark): continue
        zipfile.ZipFile(os.path.join(NC, 'downloads', pk + '_cc0.zip')).extractall(usr); open(mark, 'w').close(); log('unpacked pack', pk)
    LocationService._mpfb_data = sysd; LocationService._user_data = usr
    AssetService.update_all_asset_lists()
    log('MPFB data ->', sysd, '| user data ->', usr, '| skins:', len(os.listdir(os.path.join(usr, 'skins'))))

def services():
    from bl_ext.user_default.mpfb.services import HumanService, ObjectService
    return HumanService, ObjectService

KEEP = ('NC_Cam', 'NC_Key', 'NC_Fill', 'NC_Rim', 'NC_Floor')
def clean():
    for o in list(bpy.data.objects):
        if o.name not in KEEP: bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials):
        for d in list(coll):
            if d.users == 0: coll.remove(d)

def make(name, p):
    HumanService, ObjectService = services()
    info = HumanService._create_default_human_info_dict()
    info.update(name=name, phenotype=p['phen'], rig='mixamo', eyes='high-poly/high-poly.mhclo', eyebrows=p['brows'], eyelashes=p['lashes'], teeth='teeth_base/teeth_base.mhclo',
                tongue='tongue01/tongue01.mhclo', hair=p['hair'], proxy='', targets=p['targets'], clothes=p.get('clothes', []), skin_mhmat=p['skin'], skin_material_type='MAKESKIN',
                eyes_material_type='MAKESKIN')
    st = HumanService.get_default_deserialization_settings(); st['subdiv_levels'] = 1; st['load_clothes'] = bool(p.get('clothes'))
    bpy.ops.object.select_all(action='DESELECT')
    body = HumanService.deserialize_from_dict(info, st)
    rig = body.parent or body
    rig.location.x = p['x']
    for o in [rig] + list(rig.children_recursive): o['naija_char'] = 1
    dims = [o.dimensions.z for o in [body]]
    log('made', name, 'rig', rig.name, 'parts', [c.name for c in rig.children_recursive], 'height', round(body.dimensions.z, 3))
    from bl_ext.user_default.mpfb.services import AssetService
    tune(name, rig, body, AssetService.find_asset_absolute_path(p['skin'], 'skins'), p)
    hd = p.get('hairdo')
    if hd:
        try:
            F = head_frame(rig, body); coll = body.users_collection[0]
            if hd['kind'] == 'full': full_hair(name, F, coll)
            else: braids(name, F, coll, length=hd.get('length', .68), seed=hd.get('seed', 3), cuffs=hd.get('cuffs', 0), spacing=hd.get('spacing', .021))
        except Exception: log('hair failed', name, traceback.format_exc())
    if p.get('cut'):
        try: low_cut(name, rig, body, **p['cut'])
        except Exception: log('low cut failed', traceback.format_exc())
    return rig, body

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
def skin_material(name, mhmat, tone=(.5, .35, .26), value=1.0):
    tx = mhmat_textures(mhmat); log('skin textures', name, {k: os.path.basename(v) for k, v in tx.items()})
    m, nt, b = new_mat(f'NC_Skin_{name}')
    d = keep_tex(tx.get('diffuseTexture'))
    if d:
        t = tex_node(nt, d, (-700, 120))
        hsv = nt.nodes.new('ShaderNodeHueSaturation'); hsv.location = (-420, 120); hsv.inputs['Saturation'].default_value = .85; hsv.inputs['Value'].default_value = value
        nt.links.new(t.outputs['Color'], hsv.inputs['Color'])
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.location = (-200, 120)
        next(i for i in mix.inputs if i.name == 'Factor' and i.type == 'VALUE').default_value = 1.0
        nt.links.new(hsv.outputs['Color'], next(i for i in mix.inputs if i.name == 'A' and i.type == 'RGBA'))
        next(i for i in mix.inputs if i.name == 'B' and i.type == 'RGBA').default_value = (tone[0], tone[1], tone[2], 1)
        mixo = next(o for o in mix.outputs if o.type == 'RGBA')
        nt.links.new(mixo, b.inputs['Base Color'])
        sc = inp(b, 'Subsurface Color')
        if sc: nt.links.new(mixo, sc)
    else:
        b.inputs['Base Color'].default_value = (.18, .1, .06, 1)
    nm = keep_tex(tx.get('normalmapTexture'))
    if nm:
        t = tex_node(nt, nm, (-700, -250), True); n = nt.nodes.new('ShaderNodeNormalMap'); n.location = (-250, -250); n.inputs['Strength'].default_value = .6
        nt.links.new(t.outputs['Color'], n.inputs['Color']); nt.links.new(n.outputs['Normal'], b.inputs['Normal'])
    for k, v in (('Roughness', .58), ('Subsurface Weight', .12), ('Subsurface Scale', .004), ('Specular IOR Level', .34), ('Coat Weight', 0.), ('Coat Roughness', .35)):
        i = inp(b, k)
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
        nt.links.new(next(o for o in mix.outputs if o.type == 'RGBA'), b.inputs['Base Color'])
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
        if o == body: mat = skin_material(name, skin, p.get('tone', (.5, .35, .26)), p.get('value', 1.0))
        elif 'brow' in n or 'lash' in n: mat = strand_material(o.name, src, (.025, .02, .018))
        elif any(h in n for h in ('short', 'afro', 'braid', 'bob', 'long', 'ponytail', 'hair')): mat = strand_material(o.name, src, (.05, .038, .03))
        else: continue
        log('material', o.name, '<-', src.name if src else None, [os.path.basename(i.filepath) for _, i in (images(src.node_tree) if src and src.node_tree else [])][:3])
        for sl in o.material_slots: sl.material = mat


def low_cut(name, rig, body, front=.072, fade=.012):
    """A Lagos low cut: a thin shell over the scalp with a stubble look, its edge fading at a natural hairline."""
    import bmesh
    eyes = next((c for c in rig.children_recursive if 'high-poly' in c.name or 'low-poly' in c.name), None)
    pb = rig.pose.bones.get('mixamorig:Head')
    hb = rig.matrix_world @ pb.head; eyez = (eyes.matrix_world @ eyes.data.vertices[0].co).z if eyes else hb.z + .1
    if eyes:
        zs = [(eyes.matrix_world @ v.co).z for v in eyes.data.vertices]; eyez = sum(zs) / len(zs)
    ctr = Vector((hb.x, hb.y + .01, eyez + .02))
    # hairline height above the eyes, by angle round the head (0 = front)
    KN = [(0, front), (35, front - .006), (65, front - .025), (95, .028), (125, .0), (155, -.045), (180, -.06)]
    def hl(a):
        a = abs(a)
        for (a0, v0), (a1, v1) in zip(KN, KN[1:]):
            if a <= a1: t = (a - a0) / (a1 - a0); return v0 + (v1 - v0) * (t * t * (3 - 2 * t))
        return KN[-1][1]
    dg = bpy.context.evaluated_depsgraph_get()
    cap = body.copy(); cap.data = body.data.copy(); cap.name = f'{name}.lowcut'; cap.data.name = cap.name
    for c in body.users_collection: c.objects.link(cap)
    cap['naija_char'] = 1
    if cap.data.shape_keys:
        bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = cap; cap.select_set(True)
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for md in list(cap.modifiers):
        if md.type in ('MASK', 'SUBSURF'): cap.modifiers.remove(md)
    bm = bmesh.new(); bm.from_mesh(cap.data); bm.verts.ensure_lookup_table()
    mw = cap.matrix_world; keep = {}
    for v in bm.verts:
        w = mw @ v.co; d = w - ctr
        if d.length > .16 or w.z < eyez - .09: continue
        a = math.degrees(math.atan2(d.x, -d.y)); h = w.z - eyez - hl(a)
        if h > -.002: keep[v.index] = max(0., min(1., (h + .002) / fade))
    # keep only the scalp faces; drop helpers (they sit outside the body)
    body_vg = cap.vertex_groups.get('body')
    dl = bm.verts.layers.deform.verify()
    drop = [f for f in bm.faces if not all(v.index in keep for v in f.verts) or (body_vg and any(body_vg.index not in v[dl] for v in f.verts))]
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    fade_l = bm.verts.layers.float.new('cut')
    for v in bm.verts:
        v[fade_l] = keep.get(v.index, 1.)
    for v in bm.verts: v.co += v.normal * .0018
    bm.to_mesh(cap.data); bm.free()
    m, nt, b = new_mat(f'NC_LowCut_{name}')
    at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'cut'; at.location = (-700, -150)
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.location = (-700, 150); nz.inputs['Scale'].default_value = 900; nz.inputs['Detail'].default_value = 2
    rmp = nt.nodes.new('ShaderNodeMapRange'); rmp.location = (-480, 150); rmp.inputs['From Min'].default_value = .38; rmp.inputs['From Max'].default_value = .6
    nt.links.new(nz.outputs['Fac'], rmp.inputs['Value'])
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.location = (-250, 0)
    nt.links.new(rmp.outputs['Result'], mul.inputs[0]); nt.links.new(at.outputs['Fac'], mul.inputs[1])
    mx = nt.nodes.new('ShaderNodeMath'); mx.operation = 'MULTIPLY'; mx.location = (-80, 0); mx.inputs[1].default_value = .93
    nt.links.new(mul.outputs[0], mx.inputs[0]); nt.links.new(mx.outputs[0], b.inputs['Alpha'])
    b.inputs['Base Color'].default_value = (.012, .009, .008, 1); b.inputs['Roughness'].default_value = .85
    i = inp(b, 'Specular IOR Level')
    if i: i.default_value = .1
    try: m.surface_render_method = 'DITHERED'
    except Exception: pass
    cap.data.materials.clear(); cap.data.materials.append(m)
    log('low cut', cap.name, len(cap.data.vertices), 'verts')


# ======================================================================== HAIR
# Built on the scalp of each character: a full short afro for men (a shell that is thick on top and fades at a natural
# hairline), and long braids for women (each braid hangs from its own root, falls under gravity round the head and body,
# and gets a braided pattern). All hair follows the head bone (braids also the chest), so it moves with the character.
from mathutils.bvhtree import BVHTree
import random
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
    o = bpy.data.objects.new(name, me); coll.objects.link(o); o['naija_char'] = 1
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
def hair_material(name, base=(.012, .009, .008), coily=True, alpha_attr='cut', layer=None, layers=5):
    """Dark coily hair. Low specular: a strong specular turns very dark hair grey under the studio lights.
    layer=None is the solid base shell; layer=i (0..layers-1) is one of the fuzz shells above it, cut into tufts."""
    m, nt, b = new_mat(name)
    b.inputs['Base Color'].default_value = (*base, 1); b.inputs['Roughness'].default_value = .55
    i = inp(b, 'Specular IOR Level')
    if i: i.default_value = .06
    def mth(op, x, y=None, loc=(0, 0), clamp=False):
        n = nt.nodes.new('ShaderNodeMath'); n.operation = op; n.location = loc; n.use_clamp = clamp
        for k, v in enumerate((x, y)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[k].default_value = v
            else: nt.links.new(v, n.inputs[k])
        return n.outputs[0]
    tc = nt.nodes.new('ShaderNodeTexCoord'); tc.location = (-1200, 0)
    vor = nt.nodes.new('ShaderNodeTexVoronoi'); vor.location = (-1000, 100); vor.inputs['Scale'].default_value = 420
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.location = (-1000, -200); nz.inputs['Scale'].default_value = 160; nz.inputs['Detail'].default_value = 6
    fz = nt.nodes.new('ShaderNodeTexNoise'); fz.location = (-1000, -450); fz.inputs['Scale'].default_value = 900; fz.inputs['Detail'].default_value = 3
    for t in (vor, nz, fz): nt.links.new(tc.outputs['Object'], t.inputs['Vector'])
    dist = vor.outputs['Distance']
    if coily:
        h = mth('ADD', dist, nz.outputs['Fac'], (-750, -60))
        bump = nt.nodes.new('ShaderNodeBump'); bump.location = (-300, -250); bump.inputs['Strength'].default_value = .3; bump.inputs['Distance'].default_value = .0004
        nt.links.new(h, bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    # colour: darker down in the hair, a touch lighter on the tips of the tufts
    lift = .55 if layer is None else .7 + .9 * (layer + 1) / layers
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.location = (-600, 200); mr.inputs['From Min'].default_value = .0; mr.inputs['From Max'].default_value = .6
    nt.links.new(dist, mr.inputs['Value'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.location = (-300, 200)
    nt.links.new(mr.outputs['Result'], next(s for s in mix.inputs if s.name == 'Factor' and s.type == 'VALUE'))
    next(s for s in mix.inputs if s.name == 'A' and s.type == 'RGBA').default_value = tuple(c * lift * 1.5 for c in base) + (1,)
    next(s for s in mix.inputs if s.name == 'B' and s.type == 'RGBA').default_value = tuple(c * lift * .6 for c in base) + (1,)
    nt.links.new(next(o for o in mix.outputs if o.type == 'RGBA'), b.inputs['Base Color'])
    alpha = None
    if alpha_attr:
        # a soft, broken hairline instead of a hard edge
        at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = alpha_attr; at.location = (-1000, -700)
        jit = mth('SUBTRACT', fz.outputs['Fac'], .5, (-750, -600))
        e = mth('ADD', at.outputs['Fac'], mth('MULTIPLY', jit, .9, (-600, -600)), (-450, -650))
        alpha = mth('MULTIPLY', mth('SUBTRACT', e, .3, (-300, -650)), 3., (-150, -650), clamp=True)
    if layer is not None:
        # fuzz shell: only the middles of the voronoi cells (the coils) reach this high
        r = .5 * (1 - (layer + 1) / (layers + 1)) ** .7
        tuft = mth('LESS_THAN', mth('ADD', dist, mth('MULTIPLY', nz.outputs['Fac'], .25, (-750, 300)), (-600, 350)), r + .12, (-450, 350))
        alpha = tuft if alpha is None else mth('MULTIPLY', alpha, tuft, (0, -500))
    if alpha is not None:
        nt.links.new(alpha, b.inputs['Alpha'])
        try: m.surface_render_method = 'DITHERED'
        except Exception: pass
    return m
def full_hair(name, F, coll, front=.07, top=.026, sides=.011, back=.014, layers=5):
    """A short full afro: a solid dark base shell, then fuzz shells cut into little coils, so the edge looks soft."""
    sc = scalp(F, front)
    def thick(h, a, p):
        a = abs(a); side = max(0., 1 - abs(a - 90) / 40)
        base = (top * (1 - side) + sides * side) if a < 135 else back
        crown = .55 + .45 * max(0., min(1., (p.z - F['eyez'] - .05) / .06))
        return base * crown * max(0., min(1., (h + .002) / .02))
    out = shell(f'{name}.hair', F, sc, lambda h, a, p: thick(h, a, p) * .6, coll, hair_material(f'NC_Hair_{name}'))
    for i in range(layers):
        k = .6 + .55 * (i + 1) / layers
        shell(f'{name}.hair.fuzz{i}', F, sc, lambda h, a, p, k=k: thick(h, a, p) * k, coll, hair_material(f'NC_HairFuzz{i}_{name}', layer=i, layers=layers))
    return out
def braid_material(name, base=(.012, .009, .008)):
    m, nt, b = new_mat(name)
    b.inputs['Roughness'].default_value = .45
    i = inp(b, 'Specular IOR Level')
    if i: i.default_value = .14
    uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.location = (-1200, 0)
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); sep.location = (-1000, 0); nt.links.new(uvn.outputs['UV'], sep.inputs[0])
    def math(op, a, b=None, loc=(0, 0)):
        n = nt.nodes.new('ShaderNodeMath'); n.operation = op; n.location = loc
        for k, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[k].default_value = v
            else: nt.links.new(v, n.inputs[k])
        return n.outputs[0]
    # a chevron pattern: the three strands crossing every stitch
    u2 = math('MULTIPLY', sep.outputs['X'], 2., (-800, 100)); fr = math('FRACT', u2, None, (-650, 100)); ce = math('SUBTRACT', fr, .5, (-500, 100))
    ab = math('ABSOLUTE', ce, None, (-350, 100)); ph = math('ADD', sep.outputs['Y'], ab, (-200, 0)); fr2 = math('FRACT', ph, None, (-50, 0))
    tri = math('ABSOLUTE', math('SUBTRACT', fr2, .5, (100, 0)), None, (250, 0))
    bump = nt.nodes.new('ShaderNodeBump'); bump.location = (450, -200); bump.inputs['Strength'].default_value = .45; bump.inputs['Distance'].default_value = .0008
    nt.links.new(tri, bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    rmp = nt.nodes.new('ShaderNodeValToRGB'); rmp.location = (450, 150); e = rmp.color_ramp.elements
    e[0].position = 0.; e[0].color = (base[0] * .45, base[1] * .45, base[2] * .45, 1); e[1].position = .5; e[1].color = (base[0] * 2.6, base[1] * 2.4, base[2] * 2.2, 1)
    nt.links.new(tri, rmp.inputs[0]); nt.links.new(rmp.outputs['Color'], b.inputs['Base Color'])
    return m
def braids(name, F, coll, length=.68, spacing=.016, radius=.0042, front=.075, seed=3, cuffs=0, over_shoulder=.14):
    rnd = random.Random(seed)
    sc = scalp(F, front); V, Nn = F['V'], F['N']
    bvh = BVHTree.FromPolygons(V, F['polys'])
    cands = [i for i, (h, a) in sc.items() if h > .004]
    edge = [i for i in cands if sc[i][0] < .012]; inner = [i for i in cands if sc[i][0] >= .012]
    rnd.shuffle(edge); rnd.shuffle(inner); roots = []
    for pool, sp in ((edge, spacing * .78), (inner, spacing)):
        for i in pool:
            p = V[i]
            if all((p - V[j]).length > sp for j in roots): roots.append(i)
    log('braid roots', len(roots))
    eyez, neckz, ctr = F['eyez'], F['neckz'], F['ctr']
    N = 30; strands = []; dropped = 0
    def push(p, margin):
        loc, nrm, _, dist = bvh.find_nearest(p, .05)
        if loc is None: return p
        d = p - loc
        if d.dot(nrm) < 0: return loc + nrm * margin           # inside the body: out along the face
        if dist < margin and dist > 1e-6: return loc + d * (margin / dist)   # too close: straight away from it
        return p
    for k, i in enumerate(roots):
        root = V[i]; n = Nn[i]; d = root - ctr; side = 1 if d.x > .004 else -1 if d.x < -.004 else rnd.choice((-1, 1))
        a = abs(math.degrees(math.atan2(d.x, -d.y)))
        fwd = 30 < a < 100 and rnd.random() < over_shoulder / .55
        L = length * rnd.uniform(.93, 1.05) * (.82 if a < 25 else 1.)
        seg = L / N
        P = [root + n * .002]
        P.append(P[0] + n * seg)
        dirv = Vector((side * (1.2 if a < 60 else .5), 1.0, -.4)).normalized()
        for j in range(2, N + 1): P.append(P[-1] + dirv * seg)
        Q = [p.copy() for p in P]
        for step in range(220):
            for j in range(2, N + 1):
                p = P[j]; v = (p - Q[j]) * .82; Q[j] = p.copy()
                f = Vector((0, 0, -1.))
                if p.z > neckz + .02: f += Vector((side * .7, .9, 0)) if a < 60 else Vector((side * .35, 1.0, 0))
                elif fwd and p.z > neckz - .25: f += Vector((side * .2, -.9, 0))
                P[j] = p + v + f * .0007
            for it in range(4):
                P[1] = P[0] + n * seg
                for j in range(1, N):
                    a_, b_ = P[j], P[j + 1]; dv = b_ - a_; ln = dv.length or 1e-6
                    corr = dv * ((ln - seg) / ln)
                    if j == 1: P[j + 1] = b_ - corr
                    else: P[j] = a_ + corr * .5; P[j + 1] = b_ - corr * .5
                for j in range(2, N + 1):
                    q = push(P[j], radius + .0025)
                    # keep the face clear: anything in front of the face slides to its side
                    fx = q.x - ctr.x
                    if q.y < ctr.y - .025 and abs(fx) < .075 and neckz - .04 < q.z < eyez + .065:
                        q = Vector((ctr.x + side * .075, q.y, q.z))
                    P[j] = q
        # drop the odd braid that ends up standing up or sticking out from the head
        up = any(P[j].z > P[0].z + .02 for j in range(N // 3, N + 1))
        out = any(math.hypot(P[j].x - ctr.x, P[j].y - ctr.y) > .2 and P[j].z > neckz + .03 for j in range(N + 1))
        if up or out: dropped += 1; continue
        strands.append((P, k, fwd))
    # tubes with a braid pattern
    verts, faces, uvs, wh, wc = [], [], [], [], []
    S = 8
    for P, k, fwd in strands:
        pts = P[:]
        for _ in range(1):   # smooth
            q = [pts[0]]
            for a_, b_ in zip(pts, pts[1:]): q += [a_.lerp(b_, .25), a_.lerp(b_, .75)]
            q.append(pts[-1]); pts = q
        Ltot = sum((b_ - a_).length for a_, b_ in zip(pts, pts[1:])); s = 0.
        t0 = (pts[1] - pts[0]).normalized(); nx = t0.orthogonal().normalized()
        base = len(verts); rings = 0
        for j, p in enumerate(pts):
            if j: s += (p - pts[j - 1]).length
            t = ((pts[min(j + 1, len(pts) - 1)] - pts[max(j - 1, 0)])).normalized()
            nx = (nx - t * nx.dot(t)).normalized(); bx = t.cross(nx)
            u = s / Ltot
            r = radius * (1.9 - .9 * min(1., u / .04)) if u < .04 else radius * (1. if u < .9 else max(.3, 1 - (u - .9) * 7))
            for m_ in range(S):
                th = m_ / S * 2 * math.pi
                verts.append(p + (nx * math.cos(th) + bx * math.sin(th)) * r)
                uvs.append((m_ / S, s / .011))
                hz = p.z
                w_head = max(0., min(1., (hz - (neckz - .1)) / .14))
                wh.append(w_head); wc.append(1 - w_head)
            rings += 1
        for j in range(rings - 1):
            for m_ in range(S):
                a0 = base + j * S + m_; a1 = base + j * S + (m_ + 1) % S
                faces.append((a0, a1, a1 + S, a0 + S))
        tip = len(verts); verts.append(pts[-1] + (pts[-1] - pts[-2]).normalized() * .004); uvs.append((0, s / .011)); wh.append(wh[-1]); wc.append(wc[-1])
        last = base + (rings - 1) * S
        for m_ in range(S): faces.append((last + m_, last + (m_ + 1) % S, tip))
    o = mesh_obj(f'{name}.braids', verts, faces, coll, uvs=uvs)
    o.data.materials.append(braid_material(f'NC_Braid_{name}'))
    skin_to(o, F['rig'], {'mixamorig:Head': wh, 'mixamorig:Spine2': wc})
    log('braids', name, len(strands), 'braids', len(verts), 'verts', 'dropped', dropped)
    # gold cuffs on a few braids
    if cuffs:
        cv, cf = [], []
        gold, nt, b = new_mat('NC_Gold'); b.inputs['Base Color'].default_value = (.95, .7, .25, 1); b.inputs['Metallic'].default_value = 1.; b.inputs['Roughness'].default_value = .25
        for P, k, fwd in rnd.sample(strands, min(cuffs, len(strands))):
            for at in (.22, .55):
                j = int(at * N); p = P[j]; t = (P[j + 1] - P[j - 1]).normalized(); nx = t.orthogonal().normalized(); bx = t.cross(nx)
                b0 = len(cv)
                for e in (-1, 1):
                    for m_ in range(12):
                        th = m_ / 12 * 2 * math.pi; cv.append(p + t * e * .006 + (nx * math.cos(th) + bx * math.sin(th)) * radius * 1.55)
                for m_ in range(12): cf.append((b0 + m_, b0 + (m_ + 1) % 12, b0 + 12 + (m_ + 1) % 12, b0 + 12 + m_))
        co = mesh_obj(f'{name}.cuffs', cv, cf, coll); co.data.materials.append(gold)
        skin_to(co, F['rig'], {'mixamorig:Head': [0.] * len(cv), 'mixamorig:Spine2': [1.] * len(cv)})
    # dark hair at the roots, under the braids, so no bald patches show
    base_m = hair_material(f'NC_BraidBase_{name}', base=(.012, .009, .008), coily=True)
    shell(f'{name}.braidbase', F, sc, lambda h, a, p: .0015 * max(0., min(1., (h + .002) / .006)), coll, base_m)
    return o

def head_pos(rig):
    pb = rig.pose.bones.get('mixamorig:Head') or next((b for b in rig.pose.bones if b.name.lower().endswith('head')), None)
    return rig.matrix_world @ (pb.head + (pb.tail - pb.head) * .45) if pb else rig.location + Vector((0, 0, 1.65))

def studio(col):
    sc = bpy.context.scene
    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try: sc.render.engine = eng; break
        except Exception: pass
    try: sc.eevee.taa_render_samples = 64
    except Exception: pass
    try: sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Punchy'; sc.view_settings.exposure = -.4
    except Exception:
        try: sc.view_settings.view_transform = 'Filmic'
        except Exception: pass
    w = sc.world or bpy.data.worlds.new('World'); sc.world = w
    try:
        w.use_nodes = True
    except Exception: pass
    bg = next((n for n in w.node_tree.nodes if n.type == 'BACKGROUND'), None)
    if bg: bg.inputs[0].default_value = (.4, .42, .45, 1); bg.inputs[1].default_value = .45
    def area(name, loc, rot, energy, color, size):
        ld = bpy.data.lights.get(name) or bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.color = color; ld.size = size
        o = bpy.data.objects.get(name) or bpy.data.objects.new(name, ld)
        if o.name not in col.objects: col.objects.link(o)
        o.location = loc; o.rotation_euler = Euler([math.radians(a) for a in rot]); o['naija_char'] = 1
    area('NC_Key', (-1.6, -2.4, 2.6), (60, 0, -35), 520, (1., .93, .85), 1.6)
    area('NC_Fill', (2.2, -2.0, 1.6), (75, 0, 48), 170, (.85, .9, 1.), 2.0)
    area('NC_Rim', (.5, 2.6, 2.4), (-60, 0, 170), 480, (1., .95, .9), 1.2)
    # floor
    me = bpy.data.meshes.get('NC_Floor')
    if not me:
        import bmesh; bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6); me = bpy.data.meshes.new('NC_Floor'); bm.to_mesh(me); bm.free()
        m = bpy.data.materials.new('NC_Floor'); m.diffuse_color = (.2, .2, .22, 1)
        try:
            m.use_nodes = True; b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Base Color'].default_value = (.12, .12, .13, 1); b.inputs['Roughness'].default_value = .6
        except Exception: pass
        me.materials.append(m)
    fo = bpy.data.objects.get('NC_Floor') or bpy.data.objects.new('NC_Floor', me)
    if fo.name not in col.objects: col.objects.link(fo)
    fo['naija_char'] = 1
    cam = bpy.data.objects.get('NC_Cam')
    if not cam:
        cd = bpy.data.cameras.new('NC_Cam'); cam = bpy.data.objects.new('NC_Cam', cd); col.objects.link(cam)
    cam['naija_char'] = 1; sc.camera = cam
    return cam

def look(cam, target, frm, lens):
    cam.location = frm; d = Vector(target) - Vector(frm); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = lens

def shot(path, w, h):
    sc = bpy.context.scene; sc.render.resolution_x = w; sc.render.resolution_y = h; sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'; sc.render.filepath = path
    bpy.ops.render.render(write_still=True); log('render', os.path.basename(path))

def main():
    log('start'); short_paths(); clean()
    col = bpy.data.collections.get('NaijaChar') or bpy.data.collections.new('NaijaChar')
    if bpy.context.scene.collection.children.get('NaijaChar') is None: bpy.context.scene.collection.children.link(col)
    made = {}
    for name, p in PEOPLE.items():
        try: made[name] = make(name, p)
        except Exception: log('FAILED making', name, traceback.format_exc())
    try:
        exec(open(os.path.join(NC, 'dress.py'), encoding='utf-8').read(), globals())
        dress_all(made); show_outfit(0)
    except Exception: log('dressing failed', traceback.format_exc())
    cam = studio(col)
    for name, (rig, body) in made.items():
        h = head_pos(rig)
        look(cam, h + Vector((0, 0, -.02)), h + Vector((.18, -.95, .05)), 85); shot(os.path.join(REN, f'{name}_face.png'), 1000, 1000)
        look(cam, h + Vector((0, 0, -.02)), h + Vector((-.55, -.75, .08)), 85); shot(os.path.join(REN, f'{name}_face_side.png'), 1000, 1000)
        look(cam, h + Vector((0, 0, -.25)), h + Vector((1.2, 1.7, .1)), 60); shot(os.path.join(REN, f'{name}_back.png'), 1000, 1000)
    look(cam, (0, 0, .9), (0, -5.2, 1.15), 50); shot(os.path.join(REN, 'both_front.png'), 1400, 1000)
    look(cam, (0, 0, .9), (3.2, -4.2, 1.3), 50); shot(os.path.join(REN, 'both_34.png'), 1400, 1000)
    try: render_outfits(made)
    except Exception: log('outfit renders failed', traceback.format_exc())
    try: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(NC, 'naija_character.blend')); log('saved naija_character.blend')
    except Exception as e: log('save failed', e)
    log('DONE')

DIAG = os.path.join(NC, 'diag.py')
_d = open(DIAG, encoding='utf-8').read() if os.path.exists(DIAG) else ''
try:
    if _d.strip() and not _d.startswith('#off'): exec(_d, globals())
    else: main()
except Exception: log('ERROR', traceback.format_exc())
