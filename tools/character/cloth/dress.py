# Naija Streets: dress the characters (run from make_humans.py; uses its log/new_mat/inp/look/shot helpers).
# Builds the eight outfits from garments.py / outfits.py on each body, gives them fabrics, poses everyone in a relaxed
# arms-down stance, and renders each outfit.
import sys, importlib, numpy as np
if NC not in sys.path: sys.path.insert(0, NC)
import garments as G, outfits as O
importlib.reload(G); importlib.reload(O)
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree
TEX = os.path.join(NC, 'tex')

# ------------------------------------------------------------------ reading the body
def body_arrays(rig, body):
    keep = []
    for md in body.modifiers:
        if md.type == 'SUBSURF' or (md.type == 'MASK' and md.name.startswith('Delete.')):
            keep.append((md, md.show_viewport)); md.show_viewport = False
        if md.type == 'ARMATURE': md.use_deform_preserve_volume = False
    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); ev = body.evaluated_get(dg); me = ev.to_mesh()
    mw = body.matrix_world
    V = np.array([tuple(mw @ v.co) for v in me.vertices])
    F = [list(p.vertices) for p in me.polygons]
    names = [g.name for g in body.vertex_groups]
    W = {n: np.zeros(len(V)) for n in names if n.startswith('mixamorig:')}
    for v in me.vertices:
        for g in v.groups:
            n = names[g.group]
            if n in W: W[n][v.index] = g.weight
    ev.to_mesh_clear()
    for md, s in keep: md.show_viewport = s
    rig.data.pose_position = 'POSE'
    J, par = {}, {}
    for b in rig.data.bones:
        J[b.name] = (np.array(rig.matrix_world @ b.head_local), np.array(rig.matrix_world @ b.tail_local))
        par[b.name.split(':')[-1]] = b.parent.name.split(':')[-1] if b.parent else None
    log('body arrays', body.name, len(V), 'verts', len(F), 'faces', len(W), 'bones')
    return V, F, W, J, par

def make_nearest(V):
    trees = {}
    def build(ids):
        kd = KDTree(len(ids))
        for j, i in enumerate(ids): kd.insert(Vector(V[i]), j)
        kd.balance(); return kd
    allids = np.arange(len(V)); full = build(allids)
    def nearest(P, k=1, mask=None):
        if mask is None: kd, ids = full, allids
        else:
            key = hash(mask.tobytes())
            if key not in trees: ii = np.nonzero(mask)[0]; trees[key] = (build(ii), ii)
            kd, ids = trees[key]
        if k == 1: return ids[np.array([kd.find(Vector(p))[1] for p in P], int)]
        out = np.zeros((len(P), k), int)
        for n, p in enumerate(P):
            r = kd.find_n(Vector(p), k); js = [x[1] for x in r]
            js += [js[-1]] * (k - len(js)); out[n] = js
        return ids[out]
    return nearest

# ------------------------------------------------------------------ fabrics
def hexc(h, a=1.):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x ** 2.2 for x in c) + (a,)

FAB = {
    'jersey': dict(img='jersey.png', uv='Design', rough=.5, weave='knit', slots={1: 'jersey_sleeve', 2: 'jersey_sleeve'}),
    'jersey_sleeve': dict(color='#0e8a44', rough=.5, weave='knit', cuff='#f4f4ef'),
    'joggers': dict(color='#16161a', rough=.8, weave='fleece', stripes='#eeeeee'),
    'senator': dict(color='#1b2b55', rough=.62, weave='twill', emb='emb_senator.png', emb_size=.4, emb_color='#c8952e'),
    'senator_trim': dict(color='#1b2b55', rough=.62, weave='twill'),
    'buba': dict(color='#ece2cc', rough=.65, weave='plain'),
    'buba_trim': dict(color='#ece2cc', rough=.65, weave='plain'),
    'agbada': dict(img='damask_cream.png', rough_img='damask_cream_rough.png', tile=.32, weave='plain', emb='emb_agbada.png', emb_size=.55, emb_color='#a8741c'),
    'fila': dict(color='#5e0f28', rough=.9, weave='velvet', sheen=.35),
    'singlet': dict(color='#eeeeea', rough=.85, weave='rib'),
    'cargo': dict(color='#8a7a52', rough=.88, weave='twill'),
    'slides': dict(color='#15151a', rough=.45, weave=None),
    'croptop': dict(color='#f5f1ea', rough=.7, weave='rib'),
    'denim': dict(img='denim.png', bump_img='denim_h.png', tile=.12, rough=.8),
    'bodycon': dict(color='#c0102c', rough=.45, weave='rib'),
    'ankara1': dict(img='ankara_a.png', tile=.34, rough=.55, weave='plain'),
    'ankara2': dict(img='ankara_c.png', tile=.3, rough=.55, weave='plain'),
    'lace': dict(img='lace_green.png', bump_img='lace_green_h.png', tile=.16, rough=.5),
    'gele': dict(img='damask_gold.png', rough_img='damask_gold_rough.png', tile=.18, spec=.6, metal=.35),
    'sandals': dict(color='#c79a3a', rough=.35, metal=.7, weave=None),
}
VARIANT = {
    'Ada': {'croptop': dict(color='#e8457a'), 'bodycon': dict(color='#0f7a5a'), 'ankara1': dict(img='ankara_b.png'), 'ankara2': dict(img='ankara_d.png'),
            'lace': dict(img='lace_white.png', bump_img='lace_white_h.png'), 'gele': dict(img='damask_wine.png', rough_img='damask_wine_rough.png', metal=.15), 'sandals': dict(color='#111111', metal=0., rough=.5)},
}

def img(name):
    p = os.path.join(TEX, name)
    if not os.path.exists(p): return None
    im = bpy.data.images.load(p, check_existing=True)
    if name not in _RELOADED: im.reload(); _RELOADED.add(name)      # pick up pictures changed on disk
    return im
_RELOADED = set()

def fabric(person, key):
    spec = dict(FAB[key]); spec.update(VARIANT.get(person, {}).get(key, {}))
    name = f'NC_Fab_{person}_{key}'
    m, nt, b = new_mat(name)
    L = lambda x, y: (x, y)
    def node(t, loc, **kw):
        n = nt.nodes.new(t); n.location = loc
        for k, v in kw.items(): setattr(n, k, v)
        return n
    def uvnode(mapname, scale=1., loc=(-1300, 0)):
        u = node('ShaderNodeUVMap', loc); u.uv_map = mapname
        if scale == 1.: return u.outputs['UV']
        mp = node('ShaderNodeMapping', (loc[0] + 200, loc[1])); mp.inputs['Scale'].default_value = (scale, scale, 1)
        nt.links.new(u.outputs['UV'], mp.inputs['Vector']); return mp.outputs['Vector']
    col_out = None; height = None
    tile = spec.get('tile', .3)
    if spec.get('img'):
        t = node('ShaderNodeTexImage', (-800, 300)); t.image = img(spec['img'])
        t.interpolation = 'Cubic'
        if spec.get('uv') == 'Design': t.extension = 'REPEAT'; nt.links.new(uvnode('Design', 1., (-1200, 300)), t.inputs['Vector'])
        else: nt.links.new(uvnode('UVMap', 1 / tile, (-1200, 300)), t.inputs['Vector'])
        col_out = t.outputs['Color']
    else:
        col_out = None; b.inputs['Base Color'].default_value = hexc(spec.get('color', '#808080'))
    if spec.get('rough_img'):
        t = node('ShaderNodeTexImage', (-800, 0)); t.image = img(spec['rough_img']); t.image.colorspace_settings.name = 'Non-Color'
        nt.links.new(uvnode('UVMap', 1 / tile, (-1200, 0)), t.inputs['Vector']); nt.links.new(t.outputs['Color'], b.inputs['Roughness'])
    else: b.inputs['Roughness'].default_value = spec.get('rough', .7)
    if spec.get('bump_img'):
        t = node('ShaderNodeTexImage', (-800, -300)); t.image = img(spec['bump_img']); t.image.colorspace_settings.name = 'Non-Color'
        nt.links.new(uvnode('UVMap', 1 / tile, (-1200, -300)), t.inputs['Vector']); height = t.outputs['Color']
    weave = spec.get('weave', 'plain')
    if weave and height is None:
        uvm = uvnode('UVMap', 1., (-1200, -500))
        if weave in ('knit', 'rib'):
            w = node('ShaderNodeTexWave', (-800, -500)); w.wave_type = 'BANDS'; w.bands_direction = 'X'
            w.inputs['Scale'].default_value = 260 if weave == 'knit' else 160; w.inputs['Distortion'].default_value = 1.5
            nt.links.new(uvm, w.inputs['Vector']); height = w.outputs['Fac']
        elif weave == 'twill':
            w = node('ShaderNodeTexWave', (-800, -500)); w.wave_type = 'BANDS'; w.bands_direction = 'DIAGONAL'; w.inputs['Scale'].default_value = 300
            nt.links.new(uvm, w.inputs['Vector']); height = w.outputs['Fac']
        else:
            w = node('ShaderNodeTexNoise', (-800, -500)); w.inputs['Scale'].default_value = 900 if weave != 'velvet' else 300; w.inputs['Detail'].default_value = 4
            nt.links.new(uvm, w.inputs['Vector']); height = w.outputs['Fac']
    if spec.get('stripes'):   # joggers: two stripes down the outer side of each leg
        at = node('ShaderNodeAttribute', (-1100, 600)); at.attribute_name = 'side'
        du = uvnode('Design', 1., (-1300, 700)); sep = node('ShaderNodeSeparateXYZ', (-1100, 750)); nt.links.new(du, sep.inputs[0])
        def mth(op, a, bb=None, loc=(0, 0)):
            n = node('ShaderNodeMath', loc); n.operation = op
            for k, v in enumerate((a, bb)):
                if v is None: continue
                if isinstance(v, (int, float)): n.inputs[k].default_value = v
                else: nt.links.new(v, n.inputs[k])
            return n.outputs[0]
        centre = mth('MULTIPLY_ADD', at.outputs['Fac'], -.25, loc=(-900, 650)); n0 = centre.node; n0.inputs[2].default_value = .5
        dist = mth('ABSOLUTE', mth('SUBTRACT', sep.outputs['X'], centre, (-750, 700)), None, (-600, 700))
        s1 = mth('LESS_THAN', mth('ABSOLUTE', mth('SUBTRACT', dist, .016, (-450, 700)), None, (-300, 700)), .005, (-150, 700))
        s1 = mth('MULTIPLY', s1, mth('ABSOLUTE', at.outputs['Fac'], None, (-300, 550)), (0, 650))
        mx = node('ShaderNodeMix', (200, 400)); mx.data_type = 'RGBA'
        nt.links.new(s1, next(i for i in mx.inputs if i.name == 'Factor' and i.type == 'VALUE'))
        next(i for i in mx.inputs if i.name == 'A' and i.type == 'RGBA').default_value = hexc(spec['color'])
        next(i for i in mx.inputs if i.name == 'B' and i.type == 'RGBA').default_value = hexc(spec['stripes'])
        col_out = next(o for o in mx.outputs if o.type == 'RGBA')
    if spec.get('emb'):        # embroidery seen from the front
        t = node('ShaderNodeTexImage', (-500, 650)); t.image = img(spec['emb']); t.extension = 'CLIP'; t.interpolation = 'Cubic'
        nt.links.new(uvnode('Emb', 1., (-900, 900)), t.inputs['Vector'])
        mx = node('ShaderNodeMix', (300, 300)); mx.data_type = 'RGBA'
        nt.links.new(t.outputs['Alpha'], next(i for i in mx.inputs if i.name == 'Factor' and i.type == 'VALUE'))
        a_in = next(i for i in mx.inputs if i.name == 'A' and i.type == 'RGBA')
        if col_out is not None: nt.links.new(col_out, a_in)
        else: a_in.default_value = hexc(spec.get('color', '#808080'))
        next(i for i in mx.inputs if i.name == 'B' and i.type == 'RGBA').default_value = hexc(spec['emb_color'])
        col_out = next(o for o in mx.outputs if o.type == 'RGBA')
        if height is not None:
            ad = node('ShaderNodeMath', (100, -400)); ad.operation = 'ADD'; nt.links.new(height, ad.inputs[0]); nt.links.new(t.outputs['Alpha'], ad.inputs[1]); height = ad.outputs[0]
        else: height = t.outputs['Alpha']
    if col_out is not None: nt.links.new(col_out, b.inputs['Base Color'])
    if height is not None:
        bp = node('ShaderNodeBump', (300, -400)); bp.inputs['Strength'].default_value = .25; bp.inputs['Distance'].default_value = .0006
        nt.links.new(height, bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    for k, v in (('Specular IOR Level', spec.get('spec', .14)), ('Sheen Weight', spec.get('sheen', 0.)), ('Sheen Roughness', .45), ('Metallic', spec.get('metal', 0.))):
        i = inp(b, k)
        if i: i.default_value = v
    i = inp(b, 'Sheen Tint')
    if i and spec.get('color'): i.default_value = hexc(spec['color'])
    return m

# ------------------------------------------------------------------ building the pieces
def emb_uv(P, b):
    c = b.neck; top = c[2] + .02
    u = (P[:, 0] - c[0]) / .6 + .5; v = 1 - (top - P[:, 2]) / .6
    back = P[:, 1] > c[1] + .02
    u = np.where(back, -1., u); v = np.where(back, -1., v)
    return np.stack([u, v], 1)

def emb_uv_sized(P, b, size):
    c = b.neck; top = c[2] + .02
    u = (P[:, 0] - c[0]) / size + .5; v = 1 - (top - P[:, 2]) / size
    back = P[:, 1] > c[1] + .02
    return np.stack([np.where(back, -1., u), np.where(back, -1., v)], 1)

def orient(P, F):
    """make the faces point outwards (away from the vertical axis through the piece)."""
    c = P.mean(0); s = 0.
    for f in F[::max(1, len(F) // 400)]:
        a, b_, cc = P[f[0]], P[f[1]], P[f[2]]
        n = np.cross(b_ - a, cc - a); d = (a + b_ + cc) / 3 - c; d[2] *= .2
        s += n @ d
    return F if s >= 0 else [list(reversed(f)) for f in F]

def build_piece(person, piece, fkey, rig, coll, oi, oname, b, posed_uv=None):
    P = piece['verts']; F = orient(P, piece['faces'])
    me = bpy.data.meshes.new(f'{person}.{oname}.{piece["name"]}')
    me.from_pydata([tuple(p) for p in P], [], F); me.update()
    lp = np.array([l.vertex_index for l in me.loops])
    euv = posed_uv if posed_uv is not None else emb_uv_sized(P, b, FAB.get(fkey, {}).get('emb_size', .5))
    if len(lp) == sum(len(f) for f in F):
        u1, u2 = G.loop_uvs(piece, F)
    else:
        log('uv: face count changed for', me.name); u1, u2 = piece['uv'][lp], piece['duv'][lp]
    for nm, arr in (('UVMap', u1), ('Design', u2), ('Emb', euv[lp])):
        uvl = me.uv_layers.new(name=nm); uvl.data.foreach_set('uv', np.asarray(arr, np.float32).ravel())
    side = np.where(np.isin(piece['part'], [1, 3]), 1., np.where(np.isin(piece['part'], [2, 4]), -1., 0.))
    for nm, arr in (('side', side), ('part', piece['part'].astype(float))):
        at = me.attributes.new(nm, 'FLOAT', 'POINT'); at.data.foreach_set('value', np.asarray(arr, np.float32))
    for poly in me.polygons: poly.use_smooth = True
    o = bpy.data.objects.new(me.name, me); coll.objects.link(o)
    o['naija_char'] = 1; o['nc_cloth'] = 1; o['nc_outfit'] = oi; o['nc_person'] = person
    m = fabric(person, fkey); me.materials.append(m)
    slots = FAB.get(fkey, {}).get('slots')
    if slots:
        idx = {}
        for pid, k2 in slots.items():
            if k2 not in idx: me.materials.append(fabric(person, k2)); idx[k2] = len(me.materials) - 1
        pv = piece['part']
        for poly in me.polygons:
            vals = [pv[v] for v in poly.vertices]; pid = max(set(vals), key=vals.count)
            if int(pid) in slots: poly.material_index = idx[slots[int(pid)]]
    for bn, w in piece['weights'].items():
        vg = o.vertex_groups.new(name=bn); nz = np.nonzero(w > 1e-4)[0]
        for i in nz: vg.add([int(i)], float(w[i]), 'REPLACE')
    sol = o.modifiers.new('Thickness', 'SOLIDIFY'); sol.thickness = .0016; sol.offset = 1.; sol.use_even_offset = True
    arm = o.modifiers.new('Armature', 'ARMATURE'); arm.object = rig; arm.use_deform_preserve_volume = False
    sub = o.modifiers.new('Smooth', 'SUBSURF'); sub.levels = 0; sub.render_levels = 1
    o.parent = rig; o.matrix_parent_inverse = rig.matrix_world.inverted()
    return o

SHOES = {'street': 'shoes05', 'senator': 'shoes01', 'agbada': 'shoes04', 'hustle': None, 'jeans': 'shoes05', 'bodycon': None, 'gown': None, 'wrapper': None}

def add_shoes(person, rig, body, names):
    from bl_ext.user_default.mpfb.services import HumanService, AssetService
    out = {}
    for sn in names:
        try:
            path = AssetService.find_asset_absolute_path(f'{sn}/{sn}.mhclo', 'clothes')
            o = HumanService.add_mhclo_asset(path, body, asset_type='Clothes', subdiv_levels=1, material_type='MAKESKIN')
            o['naija_char'] = 1; out[sn] = o
            for md in o.modifiers:
                if md.type == 'ARMATURE': md.use_deform_preserve_volume = False
        except Exception: log('shoes failed', sn, traceback.format_exc())
    return out

def pose_rig(rig, R):
    """set the pose bones so the rig bends the arms by the world rotations R (matching garments.pose_matrices)."""
    rw = rig.matrix_world.to_3x3().normalized()
    for pb in rig.pose.bones:
        k = pb.name.split(':')[-1]
        if k not in R: continue
        B = rw @ pb.bone.matrix_local.to_3x3().normalized()
        Rm = Matrix([list(r) for r in R[k]])
        pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (B.inverted() @ Rm @ B).to_quaternion()

def dress(person, rig, body, ladies):
    V, F, W, J, par = body_arrays(rig, body)
    b = G.Body(V, F, W, J, make_nearest(V))
    Jn = {k.split(':')[-1]: v for k, v in J.items()}
    R = G.arms_down(Jn); M = G.pose_matrices(Jn, par, R)
    # the same body, posed, for cloth that hangs (the agbada)
    A = G.blend(b.V, {k: b.Wm[:, i] for i, k in enumerate(b.bones)}, M); Vp = G.apply(b.V, A)
    Jp = {k: (M[k.split(':')[-1]][:3, :3] @ h + M[k.split(':')[-1]][:3, 3], M[k.split(':')[-1]][:3, :3] @ t + M[k.split(':')[-1]][:3, 3]) for k, (h, t) in J.items()}
    bp = None
    coll = body.users_collection[0]
    table = O.LADIES if ladies else O.MEN
    shoes = add_shoes(person, rig, body, sorted({s for k, s in SHOES.items() if s and k in table}))
    made = []
    for oi, (oname, fn) in enumerate(table.items()):
        try:
            pieces = fn(b)
            if ladies and oname in ('bodycon', 'gown', 'wrapper'): pieces.append((G.slides(b, name='sandals'), 'sandals'))
            for piece, fkey in pieces:
                puv = None
                if piece['name'] == 'agbada':
                    if bp is None: bp = G.Body(Vp, F, W, Jp, make_nearest(Vp))
                    piece = G.robe(bp, bp.leg['L'][2][2] + .17, name='agbada')
                    puv = emb_uv_sized(piece['verts'], bp, FAB['agbada']['emb_size'])
                    piece['verts'] = G.unapply(piece['verts'], G.blend(piece['verts'], piece['weights'], M))
                o = build_piece(person, piece, fkey, rig, coll, oi, oname, b, posed_uv=puv)
                made.append(o)
            log('outfit', person, oname, [p['name'] for p, f in pieces])
        except Exception: log('outfit failed', person, oname, traceback.format_exc())
    for sn, o in shoes.items():
        o['nc_outfits'] = ','.join(str(i) for i, (on, fn) in enumerate(table.items()) if SHOES.get(on) == sn)
    pose_rig(rig, R)
    return dict(shoes=shoes, table=list(table.keys()))

def show_outfit(i):
    for o in bpy.data.objects:
        if 'nc_outfit' in o: o.hide_render = o.hide_viewport = (o['nc_outfit'] != i)
        if 'nc_outfits' in o:
            on = str(i) in o['nc_outfits'].split(',')
            o.hide_render = o.hide_viewport = not on
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.name.endswith('.body'):
            for md in o.modifiers:
                if md.type == 'MASK' and md.name.startswith('Delete.'):
                    sn = md.name[len('Delete.'):]
                    sh = next((s for s in bpy.data.objects if s.name.endswith('.' + sn) and s.parent == o.parent), None)
                    on = bool(sh) and str(i) in sh.get('nc_outfits', '').split(',')
                    md.show_render = md.show_viewport = on

def clear_clothes():
    for o in list(bpy.data.objects):
        if o.get('nc_cloth') or ('nc_outfits' in o) or (o.type == 'MESH' and '.shoes0' in o.name):
            bpy.data.objects.remove(o, do_unlink=True)
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.name.endswith('.body'):
            for md in list(o.modifiers):
                if md.type == 'MASK' and md.name.startswith('Delete.'): o.modifiers.remove(md)
        if o.type == 'ARMATURE':
            for pb in o.pose.bones: pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0)

OUTFIT_NAMES = [('street', 'jeans'), ('senator', 'bodycon'), ('agbada', 'gown'), ('hustle', 'wrapper')]

def render_outfits(people):
    cam = studio(bpy.data.collections.get('NaijaChar'))
    for i, (mn, fnm) in enumerate(OUTFIT_NAMES):
        show_outfit(i)
        look(cam, (0, 0, .92), (0, -5.4, 1.2), 50); shot(os.path.join(REN, f'outfit{i}_front.png'), 1500, 1000)
        look(cam, (0, 0, .92), (3.3, -4.3, 1.35), 50); shot(os.path.join(REN, f'outfit{i}_34.png'), 1500, 1000)
        look(cam, (0, 0, .92), (-.4, 5.3, 1.25), 50); shot(os.path.join(REN, f'outfit{i}_back.png'), 1500, 1000)
        for name, (rig, body) in people.items():
            h = head_pos(rig)
            look(cam, h + Vector((0, 0, -.35)), h + Vector((.75, -1.75, -.15)), 55); shot(os.path.join(REN, f'{name}_o{i}.png'), 800, 1000)
    show_outfit(0)

def dress_all(people):
    clear_clothes()
    for name, (rig, body) in people.items():
        try: dress(name, rig, body, ladies=name != 'Tunde')
        except Exception: log('dress failed', name, traceback.format_exc())
