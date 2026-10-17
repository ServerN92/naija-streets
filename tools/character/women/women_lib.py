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
PRETTY = [T('head-oval', .5), T('chin-width-decr', .25), T('chin-height-decr', .1), T('nose-scale-horiz-decr', .3), T('nose-flaring-decr', .3),
          T('nose-point-width-decr', .35), T('nose-width1-decr', .2), T('nose-width2-decr', .2), T('nose-volume-decr', .2),
          T('mouth-upperlip-volume-incr', .15), T('mouth-lowerlip-volume-incr', .2)] + both('eye-scale-incr', .25) + both('cheek-bones-incr', .4)

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
    try: sc.view_settings.view_transform = 'AgX'
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
