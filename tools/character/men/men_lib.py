"""Naija Streets: the new men (MakeHuman / MPFB in the user's own Blender), made like the women (tools/character/women).
Run inside Blender (naija_men.blend) after the women's scripts (they hold the shared helpers): mload.py does it all.
Body types: Slim, Athletic, Muscular (big and strong), Average, Oga (big belly), Old.
The new head is "Male Head Sculpt" by kleyyer (Sketchfab, CC BY), with eyeballs, brows and beards made here."""
import bpy, bmesh, os, math, time
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

W = r'C:\Users\user\Documents\naija_rooms\men'
REN = os.path.join(W, 'renders'); os.makedirs(REN, exist_ok=True)
LOGF = os.path.join(W, 'men_log.txt')
NC = W
TEXC = os.path.join(r'C:\Users\user\Documents\naija_rooms\women', 'tex_cloth')

# ---- the bodies ----------------------------------------------------------------------------------------------------
MBODY = {
    'Slim': dict(phen=dict(gender=1., age=.42, muscle=.55, weight=.36, proportions=1., height=.66),
                 targets=[T('measure-waist-circ-decr', .3), T('stomach-tone-incr', .6)]),
    'Athletic': dict(phen=dict(gender=1., age=.45, muscle=.88, weight=.55, proportions=1., height=.6),
                     targets=[T('torso-vshape-incr', .7), T('measure-shoulder-dist-incr', .35), T('torso-muscle-pectoral-incr', .5), T('torso-muscle-dorsi-incr', .45),
                              T('stomach-tone-incr', 1.), T('measure-waist-circ-decr', .35)] + both('upperarm-muscle-incr', .5) + both('upperarm-shoulder-muscle-incr', .5)),
    'Muscular': dict(phen=dict(gender=1., age=.48, muscle=1., weight=.78, proportions=.9, height=.62),
                     targets=[T('torso-vshape-incr', 1.), T('measure-shoulder-dist-incr', .6), T('torso-muscle-pectoral-incr', 1.), T('torso-muscle-dorsi-incr', 1.),
                              T('measure-neck-circ-incr', .1), T('stomach-tone-incr', .8), T('measure-thigh-circ-incr', .4)] + both('upperarm-muscle-incr', 1.) + both('upperarm-shoulder-muscle-incr', 1.)),
    'Average': dict(phen=dict(gender=1., age=.48, muscle=.55, weight=.55, proportions=.9, height=.55), targets=[]),
    'Oga': dict(phen=dict(gender=1., age=.62, muscle=.38, weight=1., proportions=.8, height=.52),
                targets=[T('stomach-pregnant-incr', .75), T('measure-waist-circ-incr', .6), T('torso-scale-depth-incr', .35), T('neck-double-incr', .5),
                         T('measure-neck-circ-incr', .4)] + both('upperarm-fat-incr', .5)),
    'Old': dict(phen=dict(gender=1., age=.88, muscle=.4, weight=.45, proportions=.8, height=.5), targets=[T('stomach-pregnant-incr', .2)]),
}
HANDSOME = [T('head-fat-decr', .3), T('neck-scale-horiz-incr', .2)]   # the head itself is the sculpt's; this is just the neck under it
YOUNG_M, MIDDLE_M, OLD_M = 'young_african_male/young_african_male.mhmat', 'middleage_african_male/middleage_african_male.mhmat', 'old_african_male/old_african_male.mhmat'
# hair: ('cap', style) a short cut (low, fade, waves; colour), ('mh', proxy), ('dl', object in the file), ('bald', None)
# beard: None, 'stubble', 'goatee', 'full', 'moustache'
SKIN['brown'] = (.082, .041, .023)   # (between medium and dark)
# shape (the men's own reshape below): nose = nostril width, proj = how far the nose sticks out (<1 flatter), lips = fullness,
# jaw, cheeks (+mm), face_len
MEN = {
    'Tunde':   dict(body='Athletic', tone='dark',    age=.42, skin=YOUNG_M,  hair=('cap', 'fade'),  beard='stubble', lips=None, shape=dict(nose=1.45, proj=.86, lips=1.35, jaw=1.03)),
    'Emeka':   dict(body='Slim',     tone='brown',   age=.40, skin=YOUNG_M,  hair=('cap', 'waves'), beard=None,      lips=None, shape=dict(nose=1.4, proj=.88, lips=1.3, face_len=1.03)),
    'Dayo':    dict(body='Average',  tone='dark',    age=.45, skin=YOUNG_M,  hair=('cap', 'low'),   beard='moustache', lips=None, shape=dict(nose=1.5, proj=.85, lips=1.4, cheeks=1.)),
    'Chidi':   dict(body='Muscular', tone='deep',    age=.47, skin=YOUNG_M,  hair=('bald', None),   beard='full',    lips=None, shape=dict(nose=1.55, proj=.84, lips=1.4, jaw=1.08)),
    'Musa':    dict(body='Slim',     tone='brown',   age=.46, skin=YOUNG_M,  hair=('cap', 'low'),   beard='full',    lips=None, shape=dict(nose=1.25, proj=.95, lips=1.2, face_len=1.04)),
    'Femi':    dict(body='Average',  tone='dark',    age=.38, skin=YOUNG_M,  hair=('dl', 'HAIR_dreads'), beard='goatee', lips=None, shape=dict(nose=1.45, proj=.86, lips=1.38)),
    'Segun':   dict(body='Oga',      tone='dark',    age=.62, skin=MIDDLE_M, hair=('cap', 'low'),   beard='moustache', lips=None, shape=dict(nose=1.5, proj=.86, lips=1.35, cheeks=4., jaw=1.12)),
    'Baba Sule': dict(body='Old',    tone='brown',   age=.88, skin=OLD_M,    hair=('cap', 'grey'),  beard='grey',    lips=None, shape=dict(nose=1.4, proj=.9, lips=1.25, cheeks=-1.)),
    'Sgt Okon': dict(body='Athletic', tone='deep',   age=.5,  skin=MIDDLE_M, hair=('cap', 'low'),   beard='moustache', lips=None, shape=dict(nose=1.5, proj=.86, lips=1.35, jaw=1.06)),
}
for _p in MEN.values():   # natural lips: a little darker and redder than his skin
    _c = SKIN[_p['tone']]; _p['lips'] = _p.get('lips') or (_c[0] * .85, _c[1] * .62, _c[2] * .62)
PEOPLE = MEN

def make_man(name, x=0., subdiv=1, clothes=(), with_hair=True):
    from bl_ext.blender_org.mpfb.services import AssetService
    P = MEN[name]; B = MBODY[P['body']]; HS = svc()
    info = HS._create_default_human_info_dict()
    phen = dict(B['phen']); phen['age'] = P['age']; phen['race'] = dict(african=1., asian=0., caucasian=0.)
    hair = P['hair'][1] + '/' + P['hair'][1] + '.mhclo' if with_hair and P['hair'][0] == 'mh' else ''
    info.update(name=name, phenotype=phen, rig='mixamo', eyes='high-poly/high-poly.mhclo', eyebrows='eyebrow001/eyebrow001.mhclo', eyelashes='eyelashes01/eyelashes01.mhclo',
                teeth='teeth_base/teeth_base.mhclo', tongue='tongue01/tongue01.mhclo', hair=hair, proxy='',
                targets=merge(B['targets'], HANDSOME), clothes=list(clothes), skin_mhmat=P['skin'], skin_material_type='MAKESKIN', eyes_material_type='MAKESKIN')
    st = HS.get_default_deserialization_settings(); st['subdiv_levels'] = subdiv; st['load_clothes'] = bool(clothes)
    bpy.ops.object.select_all(action='DESELECT')
    body = HS.deserialize_from_dict(info, st); rig = body.parent or body
    rig.location.x = x; rig.name = 'NW_' + name.replace(' ', '_')
    for o in [rig] + list(rig.children_recursive): o['nw'] = name
    tune(name, rig, body, str(AssetService.find_asset_absolute_path(P['skin'], 'skins')), dict(skin=SKIN[P['tone']], lips=P.get('lips') or tuple(c * .8 for c in SKIN.get(P['tone'], SKIN['dark']))))
    makeup_masks(name, rig, body)
    log('man', name, P['body'], 'height', round(body.dimensions.z, 3))
    return rig, body

PREVIEW_WEAR_M = ('male_casualsuit02/male_casualsuit02.mhclo',)
def lineup_bodies():
    """the six body types side by side, front and side"""
    clear(); out = []
    for i, nm in enumerate(MBODY):
        P = dict(body=nm, tone='dark', age=MBODY[nm]['phen']['age'], skin=YOUNG_M if nm != 'Old' else OLD_M, hair=('bald', None), beard=None, lips=None, shape={})
        MEN['_' + nm] = P
        out.append(make_man('_' + nm, x=(i - 2.5) * 1.0, clothes=PREVIEW_WEAR_M, with_hair=False))
    studio(cx=0., width=6.)
    return out

# ---- the donor head: one cleaned mesh, and eyeballs fitted into its eye openings -------------------------------------
DONOR = 'MN_FaceDonor'
def donor_mesh():
    d = bpy.data.objects.get(DONOR)
    if d: return d
    parts = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Object_')]
    bm = bmesh.new()
    for o in parts:
        me = o.data.copy(); me.transform(o.matrix_world); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=.00005)
    me = bpy.data.meshes.new(DONOR); bm.to_mesh(me); bm.free()
    d = bpy.data.objects.new(DONOR, me); bpy.context.scene.collection.objects.link(d); d.hide_render = True
    return d

EYES = 'MN_Eyes'
def make_eyes(out=.0012, rings=24, segs=32):
    """the sculpt's eyes are closed shapes under the lids: fit a sphere to each one and put a real eyeball just in front of it"""
    old = bpy.data.objects.get(EYES)
    if old: return old
    D = donor_mesh(); me = D.data; mw = D.matrix_world
    bvh = BVHTree.FromPolygons([mw @ v.co for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
    bm = bmesh.new()
    for side, (cx, cz) in (('R', (-.0401, .0676)), ('L', (.0396, .0676))):
        pts = []
        for ix in range(-6, 7):
            for iz in range(-3, 4):
                x, z = cx + ix * .0015, cz + iz * .0012
                h = bvh.ray_cast(Vector((x, -1, z)), Vector((0, 1, 0)), 3)
                if h[0] is not None: pts.append(h[0])
        # least squares sphere through the eye's surface points
        import numpy as np
        A = np.array([[2 * p.x, 2 * p.y, 2 * p.z, 1.] for p in pts]); b = np.array([p.x ** 2 + p.y ** 2 + p.z ** 2 for p in pts])
        c = np.linalg.lstsq(A, b, rcond=None)[0]; ctr = Vector(c[:3]); r = math.sqrt(c[3] + ctr.length_squared)
        r = max(.011, min(.02, r))
        front = min(p.y for p in pts); ctr.y = front + r - out   # (the eye's front just in front of the sculpt's)
        log('eye', side, 'centre', tuple(round(v, 4) for v in ctr), 'radius', round(r, 4), 'from', len(pts), 'points')
        res = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
        R = Matrix.Rotation(math.radians(90), 4, 'X')   # poles to the front and back, so the iris is round
        bmesh.ops.transform(bm, matrix=Matrix.Translation(ctr) @ R, verts=res['verts'])
    me2 = bpy.data.meshes.new(EYES); bm.to_mesh(me2); bm.free()
    o = bpy.data.objects.new(EYES, me2); bpy.context.scene.collection.objects.link(o); o.hide_render = True; o.hide_set(True)
    for p in me2.polygons: p.use_smooth = True
    return o

def donor_eyes():
    e = make_eyes(); P = [e.matrix_world @ v.co for v in e.data.vertices]; cx = sum(p.x for p in P) / len(P)
    return _two_centres(P, cx)

HEAD_PARTS = (('MN_Eyes', 'eyes'),)
EYE = dict(k=1.55, white=(.36, .33, .3))
LIPS = dict(z=-80., ax=25., up=9.5, dn=10.5, y=-26)
BLUSH = None

# ---- brows and beards, painted on the new head (in the sculpt's millimetres from between the eyes) -----------------------
def _sm(x, a, b):
    t = max(0., min(1., (x - a) / (b - a))); return t * t * (3 - 2 * t)

def face_paint(name, h):
    P = MEN.get(name, {}); ocx, ocy, oz, dcx, dcy, dmx, dmy, s = h['nw_T']
    me = h.data; brow, beard, liner = [], [], []
    kind = P.get('beard')
    for v in me.vertices:
        q = v.co; x = ((q.x - ocx) / s + dcx - dmx) * 1000.; y = ((q.y - ocy) / s + dcy - dmy) * 1000.; z = ((q.z - oz) / s) * 1000.
        ax = abs(x); front = 1 - _sm(y, -10, 5)
        # brows: a thick arch over each eye, darker in the middle
        t = (ax - 14) / 44.; zc = 17 + 7 * math.sin(math.pi * min(1., max(0., t))) - 4 * max(0., t - .7)
        bw = (1 - _sm(abs(z - zc), 3.2, 5.5)) * _sm(ax, 12, 17) * (1 - _sm(ax, 56, 62)) * front
        brow.append(bw * (.95 if P.get('beard') != 'grey' else .6))
        # lash line: round the eye opening (an ellipse 14 x 5.5 mm round each eye), thicker on top
        ex = (ax - 40.) / 14.5; ez = z / (6. if z > 0 else 5.)
        e = math.sqrt(ex * ex + ez * ez)
        liner.append((1 - _sm(abs(e - 1.06), .06, .2 if z > 0 else .12)) * (1. if z > 0 else .55) * front)
        # beard
        b = 0.
        if kind:
            lip = ((x / 26.) ** 2 + ((z + 80) / 8.5) ** 2) < 1
            must = (1 - _sm(ax, 24, 31)) * _sm(z, -74, -71) * (1 - _sm(z, -60, -55)) * _sm(-y, 16, 24)   # over the top lip
            chin = _sm(-z, 90, 96) * (1 - _sm(ax, 22, 30)) * front                                       # under the bottom lip, the chin
            jaw_z = -100 + .55 * max(0., ax - 20)                                                       # the jaw line rises toward the ears
            cheek = _sm(jaw_z + 30 - z, 0, 10) * _sm(ax, 18, 26) * (1 - _sm(ax, 78, 86)) * (1 - _sm(y, 20, 35))
            under = _sm(-z, 105, 112) * (1 - _sm(-z, 150, 165)) * (1 - _sm(y, 10, 30))                   # under the chin, down the neck a little
            if kind == 'moustache': b = must
            elif kind == 'goatee': b = max(must, chin * (1 - _sm(ax, 14, 20)))
            elif kind in ('full', 'grey'): b = max(must, chin, cheek, under * .9)
            elif kind == 'stubble': b = max(must, chin, cheek, under) * .45
            if lip: b *= .0
        beard.append(b)
    for key, vals in (('mk_brow', brow), ('mk_beard', beard), ('mk_liner', liner)):
        a = me.attributes.get(key) or me.attributes.new(key, 'FLOAT', 'POINT'); a.data.foreach_set('value', vals)
    log('face paint', name, 'beard', kind, round(sum(beard), 1), 'brow', round(sum(brow), 1))

def reshape(me, SP, dm, s, sh):
    """(the men's sculpt) a broader nose with a flatter tip, fuller lips, and the women's jaw / cheeks / face length"""
    k_len, k_jaw, d_ch = sh.get('face_len', 1.), sh.get('jaw', 1.), sh.get('cheeks', 0.)
    k_nose, k_proj, k_lips = sh.get('nose', 1.), sh.get('proj', 1.), sh.get('lips', 1.)
    for v, p in zip(me.vertices, SP):
        r = (p - dm) * 1000.; x, y, z = r.x, r.y, r.z; dx = dy = dz = 0.
        neck_fade = 1 - _sm(z, -118, -136) if z < -118 else 1.
        if k_len != 1 and z < 0: dz += z * (k_len - 1) * _sm(-y, -10, 30) * neck_fade
        if k_jaw != 1: dx += x * (k_jaw - 1) * _sm(-z, 60, 88) * neck_fade
        if d_ch:
            g = math.exp(-(((abs(x) - 48) / 24) ** 2 + ((z + 52) / 30) ** 2)) * _sm(-y, -5, 15)
            dx += math.copysign(d_ch * g, x); dy -= d_ch * .4 * g
        if k_nose != 1:   # the nostrils and the lower nose, wider
            g = math.exp(-((x / 22) ** 2 + ((z + 49) / 13) ** 2)) * _sm(-y, 14, 26)
            dx += x * (k_nose - 1) * g
        if k_proj != 1:   # the tip and the bridge, less far out
            g = math.exp(-((x / 15) ** 2 + ((z + 36) / 20) ** 2)) * _sm(-y, 30, 42)
            dy += (y + 34) * (k_proj - 1) * g
        if k_lips != 1:
            e = (x / 27) ** 2 + ((z + 76) / 14) ** 2
            g = max(0., 1 - e) ** 1.5 * _sm(-y, 20, 28)
            dy += (y + 24) * (k_lips - 1) * g; dz += (z + 76) * (k_lips - 1) * g * .6
        v.co.x += dx * s / 1000.; v.co.y += dy * s / 1000.; v.co.z += dz * s / 1000.

def hairline_fn(front):
    """the men's hairline, metres above eye level by angle round the head (0 the front, 90 the ear, 180 the nape): a sideburn
    in front of the ear, a taper up over it (the ears are at 84-113 degrees, their tops 8 mm over eye level), down to the nape"""
    KN = [(0, front), (30, front - .004), (55, front - .014), (68, front - .028), (75, .004), (79, -.02), (82, -.02), (85, .006), (89, .015),
          (112, .016), (122, .004), (140, -.026), (160, -.048), (180, -.056)]
    def hl(a):
        a = abs(a)
        for (a0, v0), (a1, v1) in zip(KN, KN[1:]):
            if a <= a1: t = (a - a0) / (a1 - a0); return v0 + (v1 - v0) * (t * t * (3 - 2 * t))
        return KN[-1][1]
    return hl

NECK_JOIN = True   # head_swap: the new neck zipped onto the body's own cut edge
NECK_HIDE = -.028  # (cut along the body's edge loop nearest this far under the seam)

def head_scalp(name, front=.056, thick=0., fade=False):
    """The men's scalp cap: the head's own surface clipped exactly along the hairline (a clean line, not the mesh's zigzag),
    a little thicker inside (short hair has some depth), with a 'cut' value rising from 0 at the line (soft edge, fade)."""
    h = bpy.data.objects[name + '.head']; rig = h.parent
    old = bpy.data.objects.get(name + '.scalp')
    if old: bpy.data.objects.remove(old, do_unlink=True)
    mods = [m for m in h.modifiers if m.type == 'SUBSURF']
    for m in mods: m.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get(); dg.update(); e = h.evaluated_get(dg); me = e.to_mesh(); mw = h.matrix_world; nm3 = mw.to_3x3().inverted().transposed()
    V = [mw @ v.co for v in me.vertices]; N = [(nm3 @ v.normal).normalized() for v in me.vertices]; polys = [tuple(p.vertices) for p in me.polygons]; e.to_mesh_clear()
    for m in mods: m.show_viewport = True
    eyes = bpy.data.objects[name + '.eyes']; ez = sum((eyes.matrix_world @ v.co).z for v in eyes.data.vertices) / len(eyes.data.vertices)
    hv = [p for p in V if p.z > ez - .01]; ctr = Vector(((min(p.x for p in hv) + max(p.x for p in hv)) / 2, (min(p.y for p in hv) + max(p.y for p in hv)) / 2, ez + .025))
    hl = hairline_fn(front); H, A = [], []
    for p in V:
        d = p - ctr; a = math.degrees(math.atan2(d.x, -d.y)); A.append(abs(a))
        H.append(-1. if (d.length > .17 or p.z < ez - .1) else p.z - ez - hl(a))
    verts, nrm, hh, aa, idx, ek = [], [], [], [], {}, {}
    def keep(i):
        if i not in idx: idx[i] = len(verts); verts.append(V[i]); nrm.append(N[i]); hh.append(H[i]); aa.append(A[i])
        return idx[i]
    def cut(i, j):
        k = (min(i, j), max(i, j))
        if k not in ek:
            t = H[i] / (H[i] - H[j]); ek[k] = len(verts); verts.append(V[i].lerp(V[j], t)); nrm.append(N[i].lerp(N[j], t).normalized()); hh.append(0.); aa.append(A[i])
        return ek[k]
    faces = []
    for poly in polys:
        hs = [H[i] for i in poly]
        if max(hs) <= 0: continue
        if min(hs) > 0: faces.append([keep(i) for i in poly]); continue
        out = []
        for k in range(len(poly)):
            i, j = poly[k], poly[(k + 1) % len(poly)]
            if H[i] > 0: out.append(keep(i))
            if (H[i] > 0) != (H[j] > 0): out.append(cut(i, j) if H[i] > 0 else cut(j, i))
        if len(set(out)) >= 3: faces.append(out)
    cutv, P = [], []
    for p, n, hv_, a in zip(verts, nrm, hh, aa):
        w = .008 + (.02 * _sm(a, 50, 95) if fade else 0.)
        c = max(0., min(1., hv_ / w)); cutv.append(c)
        P.append(p + n * (.0006 + thick * min(1., hv_ / .01)))
    m, nt, b = new_mat('NW_Scalp'); b.inputs['Base Color'].default_value = (.02, .015, .012, 1); b.inputs['Roughness'].default_value = .85
    o = mesh_obj(name + '.scalp', P, faces, h.users_collection[0], attrs={'cut': cutv})
    o.data.materials.append(m)
    skin_to(o, rig, {'mixamorig:Head': [1.] * len(P)})
    sub = o.modifiers.new('Smooth', 'SUBSURF'); sub.levels = 1; sub.render_levels = 1
    o['nw_head'] = name
    log('scalp', name, len(P), 'verts', len(faces), 'faces')
    return o

# ---- short hair: the scalp cap as a haircut ----------------------------------------------------------------------------
CUTS = {'low': dict(front=.054, col=(.006, .005, .004), thick=.0018), 'fade': dict(front=.056, col=(.006, .005, .004), fade=1, thick=.0014),
        'waves': dict(front=.054, col=(.005, .004, .0035), waves=1, thick=.0018), 'grey': dict(front=.05, col=(.055, .052, .05), thick=.0015)}

def haircut(name, style):
    c = CUTS[style]; o = head_scalp(name, front=c['front'], thick=c['thick'], fade=bool(c.get('fade')))
    m, nt, b = new_mat('NW_Cut_' + name); L = nt.links
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 900.; nz.inputs['Detail'].default_value = 6.; L.new(tc.outputs['Object'], nz.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = .7; mr.inputs['To Max'].default_value = 1.6; L.new(nz.outputs['Fac'], mr.inputs['Value'])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
    next(i for i in mx.inputs if i.name == 'Factor' and i.type == 'VALUE').default_value = 1.
    next(i for i in mx.inputs if i.name == 'A' and i.type == 'RGBA').default_value = (*c['col'], 1)
    L.new(mr.outputs['Result'], next(i for i in mx.inputs if i.name == 'B' and i.type == 'RGBA'))
    L.new(next(o_ for o_ in mx.outputs if o_.type == 'RGBA'), b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = .85
    i = inp(b, 'Specular IOR Level')
    if i: i.default_value = .15
    # a soft hairline: the cap's edge attribute ('cut', 0 at the edge) as alpha
    at0 = nt.nodes.new('ShaderNodeAttribute'); at0.attribute_name = 'cut'
    mr0 = nt.nodes.new('ShaderNodeMapRange'); mr0.inputs['From Min'].default_value = 0.; mr0.inputs['From Max'].default_value = .45; L.new(at0.outputs['Fac'], mr0.inputs['Value'])
    L.new(mr0.outputs['Result'], b.inputs['Alpha'])
    try: m.surface_render_method = 'DITHERED'
    except Exception: pass
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .5; bump.inputs['Distance'].default_value = .0006; L.new(nz.outputs['Fac'], bump.inputs['Height'])
    if c.get('waves'):   # 360 waves: rings round the crown
        wv = nt.nodes.new('ShaderNodeTexWave'); wv.wave_type = 'RINGS'; wv.inputs['Scale'].default_value = 26.; wv.inputs['Distortion'].default_value = 2.
        L.new(tc.outputs['Object'], wv.inputs['Vector'])
        ad = nt.nodes.new('ShaderNodeMath'); ad.operation = 'ADD'; L.new(nz.outputs['Fac'], ad.inputs[0]); L.new(wv.outputs['Fac'], ad.inputs[1])
        L.new(ad.outputs[0], bump.inputs['Height']); bump.inputs['Strength'].default_value = .9
    L.new(bump.outputs['Normal'], b.inputs['Normal'])
    o.data.materials.clear(); o.data.materials.append(m)
    if c.get('fade'):   # a fade: the cap thins out low on the sides and back (its edge 'cut' attribute already rises to 1 inside)
        at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'cut'
        mr2 = nt.nodes.new('ShaderNodeMapRange'); mr2.inputs['From Max'].default_value = .8; L.new(at.outputs['Fac'], mr2.inputs['Value'])
        L.new(mr2.outputs['Result'], b.inputs['Alpha'])
        try: m.surface_render_method = 'DITHERED'
        except Exception: pass
    o['nw_hair'] = 1
    return o
