"""The EFCC uniform for the officers who come after you (Sgt Okon, Chidi, Musa; Sgt Halima, Bisi): a black long-sleeve shirt,
a black tactical vest with EFCC in yellow across the back and small on the left chest, a white name tag with his/her name on
the right chest, black cargo trousers, belt and boots. The letters are real geometry pressed onto the vest (raycast onto it),
weighted like the vest under them, so they move with the body.
Runs after mload.py (men) or wload.py (women):  blender --background naija_men.blend --python efcc_more.py -- m [names]"""
import bpy, bmesh, os, time, traceback
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

MALE = 'senator' in OUTFITS            # (mload replaces the women's tables with the men's)
EFCC_Y = '#f2c200'
ROLE.update({
    'efcc': dict(color='#30343b', rough=.72, weave='twill'), 'efcc_vest': dict(color='#0b0c0e', rough=.85, weave='twill'),
    'efcc_cargo': dict(color='#16181c', rough=.8, weave='twill'), 'efcc_belt': dict(color='#0b0b0c', rough=.3, weave=None, spec=.45, coat=.5),
    'efcc_y': dict(color=EFCC_Y, rough=.55, weave=None), 'efcc_tag': dict(color='#ecebe4', rough=.4, weave=None), 'efcc_ink': dict(color='#141414', rough=.5, weave=None),
    'buckle': dict(color='#c8c8c8', rough=.25, metal=1., weave=None)})
TAGS = {'Sgt Okon': 'OKON', 'Chidi': 'CHIDI', 'Musa': 'MUSA', 'Sgt Halima': 'HALIMA', 'Bisi': 'BISI'}

def _trousers(b, top, ease=.014, name='efcc_cargo'):
    return gshell(b, [cut_below(b, top), cut_leg(b, 1.93)], ease_map(b, ease, leg=.03, ankle=.026), min_ease=ease * .7, exclude=LOWER_EX, name=name)

def o_efcc(b):
    waist = b.spine[2]
    nl = neckline(b, .04, .005, v_depth=.03, v_width=.3)
    sh = gshell(b, [nl, cut_above(b, waist - .04), cut_sleeve(b, 1.88)], ease_map(b, .009 if MALE else .0055, .013 if MALE else .009),
                min_ease=.005 if MALE else .0035, exclude=HEADFEET, name='efcc_shirt')
    vest = gshell(b, [neckline(b, .06, .015, v_depth=.035, v_width=.35), armholes(b, .14 if MALE else .12, rz=.135, dz=-.025), cut_sleeve(b, -.3),
                      cut_above(b, b.hip[2] - .01)], ease_map(b, .034 if MALE else .026), min_ease=.028 if MALE else .021, exclude=HEADFEET + ARMS, relax=10, name='efcc_vest')
    top = waist + .012
    belt = gshell(b, [cut_below(b, top + .002), cut_above(b, top - .04)], .017, min_ease=.0155, exclude=LOWER_EX + ('neck',), relax=6, name='efcc_belt')
    P = [(sh, 'efcc'), (vest, 'efcc_vest'), (_trousers(b, top, .014 if MALE else .009), 'efcc_cargo'), (belt, 'efcc_belt'),
         (button(b, top - .02, .02, r=.016, name='buckle'), 'buckle')]
    return P

OUTFITS['efcc'] = (o_efcc, 'shoes04', None)
NAMES['efcc'] = 'EFCC'
if MALE: SW_M['efcc'] = ('#121419', '#121419')

# ------------------------------------------------------------------ letters pressed onto the vest
_FONT = None
def _font():
    global _FONT
    if _FONT is None:
        for p in (r'C:\Windows\Fonts\arialbd.ttf', r'C:\Windows\Fonts\impact.ttf'):
            if os.path.exists(p): _FONT = bpy.data.fonts.load(p, check_existing=True); break
    return _FONT

def _text_2d(text, size):
    """the text as flat triangles: (verts (n,2), faces), centred"""
    cu = bpy.data.curves.new('efcc_t', 'FONT'); cu.body = text; cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    cu.resolution_u = 3; f = _font()
    if f: cu.font = f
    ob = bpy.data.objects.new('efcc_t', cu); bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:])
    V = np.array([(v.co.x, v.co.y) for v in bm.verts]); F = [[v.index for v in fc.verts] for fc in bm.faces]
    bm.free(); bpy.data.objects.remove(ob); bpy.data.curves.remove(cu); bpy.data.meshes.remove(me)
    return V, F

def _grid_2d(w, h, nx=8, ny=3):
    xs = np.linspace(-w / 2, w / 2, nx + 1); ys = np.linspace(-h / 2, h / 2, ny + 1)
    V = np.array([(x, y) for y in ys for x in xs]); F = []
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i; F += [[a, a + 1, a + nx + 2], [a, a + nx + 2, a + nx + 1]]
    return V, F

def _press(host, V2, F, cx, cz, back, lift):
    """put 2-D shapes on the host's surface, seen from the front (back=False) or from behind"""
    hm = host.data; HV = [v.co.copy() for v in hm.vertices]
    bvh = BVHTree.FromPolygons(HV, [list(p.vertices) for p in hm.polygons])
    sgn = 1. if back else -1.                      # the side the viewer is on (y)
    out = []; ok = []
    for x, y in V2:
        wx = cx - x if back else cx + x; o = Vector((wx, sgn * 2., cz + y)); d = Vector((0, -sgn, 0))
        hit = bvh.ray_cast(o, d)
        if hit[0] is None: out.append((wx, 0., cz + y)); ok.append(False); continue
        p = hit[0] + Vector((0, sgn * lift, 0)); out.append(tuple(p)); ok.append(True)
    F = [f for f in F if all(ok[i] for i in f)]
    return np.array(out), F, sgn

def _decal_obj(person, key, host, parts, role, name):
    """one object from several pressed shapes, weighted like the vest under it"""
    P = []; F = []; sgns = []
    for (Vp, Fp, sg) in parts:
        n0 = len(P); P += [tuple(v) for v in Vp]; F += [[i + n0 for i in f] for f in Fp]; sgns += [sg] * len(Fp)
    me = bpy.data.meshes.new(f'{person}.{key}.{name}'); me.from_pydata(P, [], F); me.update()
    for poly, sg in zip(me.polygons, sgns):          # face the viewer
        if poly.normal.y * sg < 0: poly.flip()
    me.update()
    for nm in ('UVMap', 'Design'): me.uv_layers.new(name=nm)
    for nm in ('side', 'part'):
        at = me.attributes.new(nm, 'FLOAT', 'POINT'); at.data.foreach_set('value', np.zeros(len(P), np.float32))
    o = bpy.data.objects.new(me.name, me); host.users_collection[0].objects.link(o)
    o['nw'] = person; o['nw_cloth'] = key; me.materials.append(cloth_mat(person, role))
    kd = KDTree(len(host.data.vertices))
    for v in host.data.vertices: kd.insert(v.co, v.index)
    kd.balance()
    groups = {g.index: o.vertex_groups.new(name=g.name) for g in host.vertex_groups}
    for i, p in enumerate(P):
        _, j, _ = kd.find(Vector(p))
        for g in host.data.vertices[j].groups:
            if g.weight > 1e-4: groups[g.group].add([i], g.weight, 'REPLACE')
    arm = o.modifiers.new('Armature', 'ARMATURE'); rig = host.parent; arm.object = rig; arm.use_deform_preserve_volume = False
    o.parent = rig; o.matrix_parent_inverse = rig.matrix_world.inverted()
    return o

def add_prints(person, key='efcc'):
    rig, body, b = body_of(person)
    vest = next(o for o in bpy.data.objects if o.get('nw') == person and o.get('nw_cloth') == key and o.type == 'MESH' and o.name.split('.')[-1].startswith('efcc_vest'))
    cx = b.neck[0]; bz = b.bust[2]
    big = .16 if MALE else .135
    yel = [_press(vest, *_text_2d('EFCC', big), cx, bz + .05, True, .0045)]
    chest_x = .085 if MALE else .075
    yel.append(_press(vest, *_text_2d('EFCC', .045), cx + chest_x, bz + .06, False, .0045))     # the wearer's left chest
    _decal_obj(person, key, vest, yel, 'efcc_y', 'efcc_print')
    tag = TAGS.get(person, person.split()[-1].upper())
    tw = max(.075, .0155 * len(tag) + .025)
    plate = _press(vest, *_grid_2d(tw, .028), cx - chest_x, bz + .06, False, .0042)
    _decal_obj(person, key, vest, [plate], 'efcc_tag', 'efcc_tag')
    ink = _press(vest, *_text_2d(tag, .02), cx - chest_x, bz + .06, False, .0055)
    _decal_obj(person, key, vest, [ink], 'efcc_ink', 'efcc_name')
    log('efcc prints', person, tag)
