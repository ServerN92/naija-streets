# Naija Streets - Eko Grand Hotel, Family Suite (room, parlour, kitchen, bathroom)
# Built in Blender with real materials. Walls are separate objects named WALL_* so the game can drop the walls
# between the camera and you (the Sims view).
import bpy, math, random
from mathutils import Vector
random.seed(7)

# ---------------------------------------------------------------- clean scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections):
    if c.name.startswith('Suite'): bpy.data.collections.remove(c)
for m in list(bpy.data.materials):
    if m.users == 0: bpy.data.materials.remove(m)
COL = bpy.data.collections.new('Suite'); bpy.context.scene.collection.children.link(COL)

# ---------------------------------------------------------------- materials
def _nodes(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (600, 0)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled'); b.location = (300, 0)
    nt.links.new(b.outputs[0], out.inputs[0])
    tc = nt.nodes.new('ShaderNodeTexCoord'); tc.location = (-900, 0)
    return m, nt, b, tc

def hexrgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4)) + (1,)

def lin(c):  # sRGB -> linear for node colours
    f = lambda v: v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
    return (f(c[0]), f(c[1]), f(c[2]), 1)

def plain(name, col, rough=.5, metal=0, bump=0):
    m, nt, b, tc = _nodes(name)
    b.inputs['Base Color'].default_value = lin(hexrgb(col)); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if bump:
        n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 60; nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump; nt.links.new(n.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs[0], b.inputs['Normal'])
    return m

def wood_floor(name, c1, c2):
    m, nt, b, tc = _nodes(name)
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1, 1, 1); nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    br = nt.nodes.new('ShaderNodeTexBrick'); br.inputs['Scale'].default_value = 1.0
    br.inputs['Mortar Size'].default_value = .004; br.inputs['Brick Width'].default_value = 1.2; br.inputs['Row Height'].default_value = .19
    br.offset = .37; br.inputs['Color1'].default_value = lin(hexrgb(c1)); br.inputs['Color2'].default_value = lin(hexrgb(c2)); br.inputs['Mortar'].default_value = (.05, .03, .02, 1)
    nt.links.new(mp.outputs[0], br.inputs['Vector'])
    wv = nt.nodes.new('ShaderNodeTexWave'); wv.inputs['Scale'].default_value = 3; wv.inputs['Distortion'].default_value = 6; wv.inputs['Detail'].default_value = 3
    nt.links.new(mp.outputs[0], wv.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = .35
    nt.links.new(br.outputs['Color'], mix.inputs[6]); nt.links.new(wv.outputs['Color'], mix.inputs[7]); nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = .32
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .25; nt.links.new(br.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs[0], b.inputs['Normal'])
    return m

def tiles(name, c1, grout, size=.6, rough=.15, vary=.06):
    m, nt, b, tc = _nodes(name)
    br = nt.nodes.new('ShaderNodeTexBrick'); br.offset = 0; br.inputs['Scale'].default_value = 1 / size
    br.inputs['Brick Width'].default_value = 1; br.inputs['Row Height'].default_value = 1; br.inputs['Mortar Size'].default_value = .012
    a = hexrgb(c1); br.inputs['Color1'].default_value = lin(a); br.inputs['Color2'].default_value = lin(tuple(max(0, v - vary) for v in a[:3]) + (1,))
    br.inputs['Mortar'].default_value = lin(hexrgb(grout)); nt.links.new(tc.outputs['Object'], br.inputs['Vector'])
    nt.links.new(br.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = rough
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .3; bp.invert = True; nt.links.new(br.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs[0], b.inputs['Normal'])
    return m

def marble(name, base, vein):
    m, nt, b, tc = _nodes(name)
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 2.5; n.inputs['Detail'].default_value = 12; n.inputs['Distortion'].default_value = 3
    nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
    r = nt.nodes.new('ShaderNodeValToRGB'); r.color_ramp.elements[0].position = .46; r.color_ramp.elements[0].color = lin(hexrgb(vein))
    r.color_ramp.elements[1].position = .52; r.color_ramp.elements[1].color = lin(hexrgb(base))
    nt.links.new(n.outputs['Fac'], r.inputs[0]); nt.links.new(r.outputs[0], b.inputs['Base Color']); b.inputs['Roughness'].default_value = .08
    return m

def fabric(name, col):
    m, nt, b, tc = _nodes(name)
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 400; nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = .25
    mix.inputs[6].default_value = lin(hexrgb(col)); nt.links.new(n.outputs['Color'], mix.inputs[7]); nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = .95; b.inputs['Sheen Weight'].default_value = .4
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .15; nt.links.new(n.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs[0], b.inputs['Normal'])
    return m

def glow(name, col, strength=8):
    m, nt, b, tc = _nodes(name)
    b.inputs['Base Color'].default_value = lin(hexrgb(col)); b.inputs['Emission Color'].default_value = lin(hexrgb(col)); b.inputs['Emission Strength'].default_value = strength
    return m

def glass(name, tint='#cfe3ea'):
    m, nt, b, tc = _nodes(name)
    b.inputs['Base Color'].default_value = lin(hexrgb(tint)); b.inputs['Roughness'].default_value = .02; b.inputs['Transmission Weight'].default_value = 1
    if hasattr(m, 'surface_render_method'): m.surface_render_method = 'BLENDED'
    return m

M = dict(
    floor=wood_floor('Oak floor', '#8a5a36', '#6e4426'),
    tile=tiles('Kitchen tiles', '#d8d2c6', '#9a948a', .6),
    btile=tiles('Bath tiles', '#e9ece9', '#b9bdb9', .3, .08, .03),
    wall=plain('Wall paint warm white', '#eee6da', .85, bump=.05),
    accent=plain('Wall terracotta', '#a8573a', .85, bump=.05),
    ceil=plain('Ceiling', '#f6f3ee', .9),
    skirt=plain('Skirting', '#f3f0ea', .4),
    walnut=plain('Walnut', '#4a2e1c', .35),
    oak=plain('Light oak', '#a27a52', .4),
    marble=marble('Marble', '#ece8e2', '#8f8a85'),
    blackm=marble('Black marble', '#1d1c1b', '#6d6a66'),
    sofa=fabric('Sofa linen', '#b8ab98'),
    terra=fabric('Terracotta velvet', '#9c4a2f'),
    ankara=fabric('Ankara cushion', '#d18a1e'),
    teal=fabric('Teal cushion', '#1f5f5c'),
    duvet=fabric('White duvet', '#f2efe9'),
    throw=fabric('Bed throw', '#7a3b26'),
    rug=fabric('Rug', '#c9b79c'),
    curtain=fabric('Curtain', '#c96f3f'),
    brass=plain('Brass', '#c9a25a', .25, 1),
    chrome=plain('Chrome', '#d9dde0', .08, 1),
    black=plain('Matt black', '#1b1b1c', .5),
    whitep=plain('White gloss', '#f4f4f2', .12),
    porc=plain('Porcelain', '#f7f7f5', .05),
    leaf=plain('Leaf', '#2f6b34', .55),
    pot=plain('Clay pot', '#9a5a3c', .8),
    screen=glow('TV screen', '#1d3a5a', 1.5),
    lamp=glow('Lamp shade glow', '#ffd9a8', 4),
    bulb=glow('Bulb', '#fff1d6', 25),
    glass=glass('Glass'),
    city=glow('Window view', '#9cc4e8', 2.0),
    steel=plain('Brushed steel', '#b8bcbe', .3, 1),
    art1=plain('Art 1', '#d18a1e', .7), art2=plain('Art 2', '#1f5f5c', .7), art3=plain('Art 3', '#a8573a', .7),
)

# ---------------------------------------------------------------- geometry helpers
def box(name, x, y, z, sx, sy, sz, mat, bevel=.008, seg=2, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + sz / 2))
    o = bpy.context.active_object; o.name = name; o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        md = o.modifiers.new('Bevel', 'BEVEL'); md.width = min(bevel, sx / 2.2, sy / 2.2, sz / 2.2); md.segments = seg; md.limit_method = 'ANGLE'
    o.data.materials.append(mat)
    for c in o.users_collection: c.objects.unlink(o)
    COL.objects.link(o)
    if bevel:
        try: bpy.ops.object.shade_auto_smooth()
        except Exception: pass
    return o

def cyl(name, x, y, z, r, h, mat, n=24, r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=n, radius1=r, radius2=r if r2 is None else r2, depth=h, location=(x, y, z + h / 2))
    o = bpy.context.active_object; o.name = name; o.data.materials.append(mat)
    for c in o.users_collection: c.objects.unlink(o)
    COL.objects.link(o); bpy.ops.object.shade_smooth()
    return o

def soft(o, lvl=2, bev=None):  # cushions: rounded and soft
    if bev: o.modifiers['Bevel'].width = bev; o.modifiers['Bevel'].segments = 4
    return o

# ---------------------------------------------------------------- the shell: 12 x 10 m, 3.2 m high
W, D, H, T = 12.0, 10.0, 3.2, .15
x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
# floors: wood in parlour & bedroom, tiles in kitchen, small tiles in bath
box('FLOOR_wood', 0, 0, -.05, W, D, .05, M['floor'], 0)
box('FLOOR_kitchen', 3.5, -2.5, 0, 5.0, 5.0, .006, M['tile'], 0)     # x 1..6, y -5..0
box('FLOOR_bath', 4.25, 3.0, 0, 3.5, 4.0, .006, M['btile'], 0)        # x 2.5..6, y 1..5
ceil = box('CEILING', 0, 0, H, W, D, .05, M['ceil'], 0)

def wall(name, ax, a0, a1, at, mat=None, doors=(), h=H):
    """A straight wall from a0 to a1 along x (ax='x', at = y) or along y (ax='y', at = x), with door gaps (c, w, dh)."""
    mat = mat or M['wall']; segs = []; cur = a0
    for (c, w, dh) in sorted(doors):
        segs.append((cur, c - w / 2, 0, h)); segs.append((c - w / 2, c + w / 2, dh, h)); cur = c + w / 2
    segs.append((cur, a1, 0, h))
    for i, (s0, s1, z0, z1) in enumerate(segs):
        if s1 - s0 < .01: continue
        L = s1 - s0; m = (s0 + s1) / 2
        if ax == 'x': o = box(f'WALL_{name}_{i}', m, at, z0, L, T, z1 - z0, mat, 0)
        else: o = box(f'WALL_{name}_{i}', at, m, z0, T, L, z1 - z0, mat, 0)
        if z0 == 0:  # skirting board on both faces
            if ax == 'x': box(f'WALL_{name}_{i}_skirt', m, at, 0, L, T + .03, .1, M['skirt'], .003)
            else: box(f'WALL_{name}_{i}_skirt', at, m, 0, T + .03, L, .1, M['skirt'], .003)
    return segs

# outer walls (front door in the -y wall at x=-4, a big window in the +y wall of the parlour)
wall('front', 'x', x0, x1, y0, doors=[(-4.0, 1.1, 2.2)])
wall('back_l', 'x', x0, -1.5, y1)                 # parlour back wall (window cut below)
wall('back_r', 'x', -1.5, x1, y1)
wall('left', 'y', y0, y1, x0, M['accent'])
wall('right', 'y', y0, y1, x1)
# inner walls: bedroom (x -6..-1.5? no): layout
#   parlour  x -6..1,  y -5..1   (with dining)        kitchen x 1..6, y -5..0  (open to parlour)
#   bedroom  x -6..2.5, y 1..5                         bathroom x 2.5..6, y 1..5
wall('bed_front', 'x', x0, 2.5, 1.0, doors=[(-1.0, 1.3, 2.2)])
wall('bath_front', 'x', 2.5, x1, 1.0, doors=[(3.4, 1.0, 2.2)])
wall('bath_side', 'y', 1.0, y1, 2.5)
box('kitchen_pass', 1.0, -1.0, 0, .15, 2.0, 1.05, M['walnut'], .01)   # low half wall / breakfast bar base
box('kitchen_bar', 1.0, -1.0, 1.05, .55, 2.2, .05, M['marble'], .01)

# window in the parlour/bedroom back wall: glass with a lit Lagos view behind
for wx, ww in ((-3.8, 3.0),):
    box('WALL_backwin_frame', wx, y1 - .02, .9, ww + .1, .2, .08, M['black'], .005)
box('window_view', -3.8, y1 + .3, .5, 6, .02, 2.4, M['city'], 0)
# window opening in the bedroom back wall: carve by replacing the back_l wall with pieces
for o in [o for o in COL.objects if o.name.startswith('WALL_back_l_0') and 'skirt' not in o.name]: bpy.data.objects.remove(o, do_unlink=True)
box('WALL_back_l_a', (x0 + -5.3) / 2, y1, 0, abs(-5.3 - x0), T, H, M['wall'], 0)
box('WALL_back_l_b', (-2.3 + -1.5) / 2, y1, 0, .8, T, H, M['wall'], 0)
box('WALL_back_l_sill', -3.8, y1, 0, 3.0, T, .9, M['wall'], 0)
box('WALL_back_l_head', -3.8, y1, 2.6, 3.0, T, H - 2.6, M['wall'], 0)
box('window_glass', -3.8, y1, .9, 3.0, .02, 1.7, M['glass'], 0)
for i in range(4): box(f'window_mullion_{i}', -5.3 + i * 1.0, y1, .9, .05, .06, 1.7, M['black'], 0)
# curtains: soft folds
for side in (-1, 1):
    for k in range(7):
        box(f'curtain_{side}_{k}', -3.8 + side * (1.75 + k * .07), y1 - .18 - (k % 2) * .05, .05, .09, .06, 2.6, M['curtain'], .03)
box('curtain_rail', -3.8, y1 - .2, 2.7, 4.2, .04, .04, M['brass'], .01)

# door frames + open door leaves
def door_frame(name, x, y, w, ax='x'):
    for s in (-1, 1):
        if ax == 'x': box(f'{name}_jamb{s}', x + s * (w / 2 + .03), y, 0, .06, T + .04, 2.25, M['walnut'], .005)
        else: box(f'{name}_jamb{s}', x, y + s * (w / 2 + .03), 0, T + .04, .06, 2.25, M['walnut'], .005)
    if ax == 'x': box(f'{name}_head', x, y, 2.2, w + .12, T + .04, .06, M['walnut'], .005)
door_frame('door_main', -4.0, y0, 1.1); door_frame('door_bed', -1.0, 1.0, 1.3); door_frame('door_bath', 3.4, 1.0, 1.0)
leaf = box('door_main_leaf', -4.55, y0 + .5, 0, .05, 1.0, 2.18, M['walnut'], .01)
box('door_main_handle', -4.5, y0 + .9, 1.0, .03, .14, .03, M['brass'], .005)

# ---------------------------------------------------------------- parlour
box('rug_parlour', -3.3, -2.4, .0, 4.2, 3.0, .012, M['rug'], .004)
# 3-seater sofa facing +y? -> the TV is on the left wall; sofa faces -x
def sofa(name, x, y, L, facing, mat, cush):
    # facing: direction the seat looks (-x/+x/-y/+y)
    rot = {'-x': 0, '+x': math.pi, '-y': math.pi / 2, '+y': -math.pi / 2}[facing]
    parts = []
    parts.append(box(f'{name}_base', 0, 0, .1, .9, L, .32, mat, .04))
    parts.append(box(f'{name}_back', .37, 0, .1, .2, L, .78, mat, .06))
    for s in (-1, 1): parts.append(box(f'{name}_arm{s}', 0, s * (L / 2 - .1), .1, .9, .2, .55, mat, .06))
    n = max(1, round((L - .4) / .62))
    for i in range(n):
        cy = -(L - .4) / 2 + (i + .5) * (L - .4) / n
        parts.append(box(f'{name}_seat{i}', -.05, cy, .42, .72, (L - .4) / n - .02, .16, mat, .07))
        parts.append(box(f'{name}_backc{i}', .24, cy, .5, .2, (L - .4) / n - .04, .42, mat, .08))
        parts.append(box(f'{name}_pillow{i}', .14, cy, .62, .14, .38, .38, cush if i % 2 == 0 else M['teal'], .09))
    for s in ((-1, -1), (-1, 1), (1, -1), (1, 1)): parts.append(cyl(f'{name}_leg', s[0] * .38, s[1] * (L / 2 - .08), 0, .025, .1, M['brass'], 10))
    for p in parts:
        v = Vector(p.location); p.location = (x + v.x * math.cos(rot) - v.y * math.sin(rot), y + v.x * math.sin(rot) + v.y * math.cos(rot), v.z); p.rotation_euler.z = rot
    return parts
sofa('sofa3', -1.6, -2.4, 2.4, '-x', M['sofa'], M['ankara'])
sofa('chairL', -3.3, -4.2, 1.0, '+y', M['terra'], M['ankara'])
sofa('chairR', -3.3, -0.6, 1.0, '-y', M['terra'], M['teal'])
# coffee table: marble top on brass legs
box('coffee_top', -3.4, -2.4, .38, 1.3, .7, .04, M['marble'], .01)
for sx in (-1, 1):
    for sy in (-1, 1): cyl('coffee_leg', -3.4 + sx * .58, -2.4 + sy * .28, 0, .02, .38, M['brass'], 10)
box('coffee_book', -3.6, -2.5, .42, .28, .2, .05, M['art2'], .005); cyl('coffee_vase', -3.1, -2.3, .42, .06, .22, M['porc'], 16, .04)
# TV wall on the left wall
box('tv_console', -5.75, -2.4, 0, .45, 2.2, .5, M['walnut'], .01)
box('tv_frame', -5.9, -2.4, 1.05, .05, 1.65, .95, M['black'], .005); box('tv_screen', -5.87, -2.4, 1.08, .02, 1.58, .88, M['screen'], 0)
box('tv_panel', -5.9, -2.4, .5, .03, 2.6, 2.3, M['oak'], .004)
# dining table for 4 between parlour and kitchen
box('dining_top', -.4, -4.0, .74, 1.6, .9, .04, M['oak'], .01)
for sx in (-1, 1):
    for sy in (-1, 1): box('dining_leg', -.4 + sx * .7, -4.0 + sy * .35, 0, .06, .06, .74, M['walnut'], .005)
for sx in (-1, 1):
    for side in (-1, 1):
        cx, cy = -.4 + sx * .4, -4.0 + side * .62
        box('dchair_seat', cx, cy, .44, .45, .45, .06, M['terra'], .03)
        box('dchair_back', cx, cy + side * .2, .5, .45, .05, .5, M['walnut'], .01)
        for lx in (-1, 1):
            for ly in (-1, 1): box('dchair_leg', cx + lx * .19, cy + ly * .19, 0, .035, .035, .44, M['walnut'], .003)
cyl('pendant_cord', -.4, -4.0, 1.9, .004, 1.3, M['black'], 6)
cyl('pendant_shade', -.4, -4.0, 1.6, .28, .3, M['brass'], 32, .08)
cyl('pendant_bulb', -.4, -4.0, 1.58, .07, .06, M['bulb'], 16)
# plants and art
def plant(name, x, y, h=1.4):
    cyl(f'{name}_pot', x, y, 0, .22, .42, M['pot'], 20, .17)
    for k in range(9):
        a = k / 9 * 6.283; l = box(f'{name}_leaf{k}', x + math.cos(a) * .15, y + math.sin(a) * .15, .42 + k * .05, .06, .38, .02, M['leaf'], .01)
        l.rotation_euler = (random.uniform(.5, 1.1), 0, a)
    cyl(f'{name}_stem', x, y, .4, .02, h - .6, M['leaf'], 6)
plant('plant1', -5.5, -4.5); plant('plant2', .6, -.4, 1.2)
box('art_big', -1.4, y0 + .09, 1.2, 1.4, .03, 1.0, M['black'], .004)
box('art_big_c1', -1.6, y0 + .11, 1.3, .55, .01, .8, M['art1'], 0); box('art_big_c2', -1.15, y0 + .11, 1.3, .35, .01, .8, M['art2'], 0)
# AC split unit
box('ac_unit', -5.85, 0.0, 2.5, .22, 1.0, .3, M['whitep'], .03)

# ---------------------------------------------------------------- kitchen (x 1..6, y -5..0)
box('k_base_back', 3.5, -4.7, 0, 5.0, .6, .88, M['walnut'], .01)
box('k_top_back', 3.5, -4.7, .88, 5.0, .62, .04, M['blackm'], .005)
box('k_base_side', 5.7, -2.6, 0, .6, 2.6, .88, M['walnut'], .01)
box('k_top_side', 5.7, -2.6, .88, .62, 2.6, .04, M['blackm'], .005)
for i in range(8): box(f'k_door_{i}', 1.3 + i * .6, -4.39, .1, .56, .02, .72, M['oak'], .004)
for i in range(8): box(f'k_handle_{i}', 1.3 + i * .6, -4.37, .7, .2, .02, .02, M['brass'], .004)
box('k_upper', 3.2, -4.82, 1.5, 4.4, .36, .75, M['oak'], .01)
box('k_splash', 3.5, -4.97, .92, 5.0, .02, .58, M['tile'], 0)
box('k_hob', 2.6, -4.65, .925, .6, .5, .012, M['black'], .003)
for hx in (-1, 1):
    for hy in (-1, 1): cyl('k_ring', 2.6 + hx * .15, -4.65 + hy * .12, .937, .07, .003, M['steel'], 20)
box('k_hood', 2.6, -4.8, 1.55, .7, .4, .25, M['steel'], .01); box('k_hood_chim', 2.6, -4.85, 1.8, .3, .25, 1.4, M['steel'], .005)
box('k_sink', 4.2, -4.65, .9, .7, .45, .03, M['steel'], .005); cyl('k_tap', 4.2, -4.88, .92, .015, .32, M['chrome'], 10)
box('k_fridge', 5.6, -.6, 0, .75, .7, 1.9, M['steel'], .02); box('k_fridge_handle', 5.22, -.4, .9, .03, .03, .7, M['chrome'], .005)
box('k_micro', 5.7, -3.3, .92, .45, .35, .28, M['black'], .01)
cyl('k_kettle', 5.65, -2.2, .92, .09, .22, M['steel'], 18, .07)
for i, c in enumerate(('#e8b923', '#c0392b', '#2f6b34')): cyl(f'k_jar{i}', 1.6 + i * .18, -4.8, .92, .06, .18, plain(f'jar{i}', c, .3), 16)
for i in range(3):  # bar stools
    cyl(f'stool_seat{i}', .45, -1.6 + i * .6, .72, .19, .05, M['terra'], 24); cyl(f'stool_post{i}', .45, -1.6 + i * .6, 0, .025, .72, M['brass'], 10); cyl(f'stool_base{i}', .45, -1.6 + i * .6, 0, .2, .02, M['brass'], 24)
cyl('k_light', 3.5, -2.5, H - .05, .25, .04, M['bulb'], 32)

# ---------------------------------------------------------------- bedroom (x -6..2.5, y 1..5)
box('rug_bed', -2.6, 3.2, 0, 3.0, 2.4, .012, M['rug'], .004)
# king bed, head against the left wall
bx, by = -4.2, 3.0
box('bed_frame', bx, by, .1, 2.2, 2.0, .25, M['walnut'], .02)
box('bed_mattress', bx + .05, by, .35, 2.05, 1.9, .25, M['duvet'], .08)
box('bed_duvet', bx + .35, by, .58, 1.5, 1.96, .07, M['duvet'], .05)
box('bed_throw', bx + .75, by, .64, .5, 2.0, .03, M['throw'], .015)
box('bed_headboard', -5.85, by, .1, .12, 2.3, 1.35, M['terra'], .05)
for i in range(4): box(f'bed_tuft{i}', -5.78, by - .9 + i * .6, .5, .02, .5, .8, M['terra'], .04)
for s in (-1, 1):
    box(f'pillow{s}', -5.35, by + s * .45, .62, .4, .7, .18, M['duvet'], .08)
    box(f'pillowc{s}', -5.05, by + s * .3, .64, .2, .45, .32, M['ankara'] if s < 0 else M['teal'], .08)
    box(f'nightstand{s}', -5.7, by + s * 1.5, 0, .5, .5, .55, M['walnut'], .01)
    cyl(f'lamp_base{s}', -5.7, by + s * 1.5, .55, .07, .28, M['brass'], 16)
    cyl(f'lamp_shade{s}', -5.7, by + s * 1.5, .83, .2, .28, M['lamp'], 24, .15)
box('wardrobe', 1.6, 4.6, 0, 1.6, .65, 2.4, M['oak'], .01)
for i in range(2): box(f'wardrobe_door{i}', 1.2 + i * .8, 4.26, .05, .78, .02, 2.3, M['oak'], .004)
box('dresser', -1.0, 4.75, 0, 1.4, .45, .78, M['walnut'], .01); box('dresser_mirror', -1.0, 4.95, 1.0, 1.0, .03, .9, M['chrome'], .005)
box('single_bed', 1.3, 2.0, .1, 1.9, .95, .35, M['duvet'], .05)
box('single_head', 2.3, 2.0, .1, .08, 1.0, .9, M['walnut'], .01)
cyl('bed_light', -2.5, 3.0, H - .05, .3, .04, M['bulb'], 32)

# ---------------------------------------------------------------- bathroom (x 2.5..6, y 1..5)
box('b_vanity', 3.2, 4.7, 0, 1.3, .55, .82, M['walnut'], .01); box('b_vanity_top', 3.2, 4.7, .82, 1.32, .57, .04, M['marble'], .005)
cyl('b_basin', 3.2, 4.65, .86, .22, .12, M['porc'], 32, .18); cyl('b_tap', 3.2, 4.9, .86, .015, .25, M['chrome'], 10)
box('b_mirror', 3.2, 4.96, 1.15, 1.1, .02, .9, M['chrome'], .005)
box('b_toilet_base', 5.5, 4.45, 0, .38, .55, .4, M['porc'], .1); box('b_toilet_tank', 5.5, 4.85, .4, .4, .2, .4, M['porc'], .04)
box('b_shower_tray', 5.3, 1.9, 0, 1.3, 1.6, .05, M['porc'], .02)
box('b_shower_glass', 4.62, 2.0, .05, .02, 1.4, 2.0, M['glass'], 0)
cyl('b_shower_head', 5.75, 1.9, 2.1, .12, .02, M['chrome'], 20); cyl('b_shower_pipe', 5.9, 1.9, 1.0, .015, 1.15, M['chrome'], 8)
box('b_towel_rail', 2.62, 3.4, 1.1, .05, .7, .02, M['chrome'], .005); box('b_towel', 2.66, 3.4, .75, .04, .5, .38, M['teal'], .02)
cyl('b_light', 4.25, 3.0, H - .05, .2, .04, M['bulb'], 32)
# bathroom walls: tiled lower half
for (nm, x, y, sx, sy) in (('btile_back', 4.25, 4.9, 3.5, .02), ('btile_right', 5.9, 3.0, .02, 4.0)):
    box(f'WALL_{nm}', x, y, 0, sx, sy, 1.4, M['btile'], 0)

# ---------------------------------------------------------------- lights for the Blender view
def light(name, x, y, z, kind='POINT', power=120, col=(1, .86, .7), size=.3):
    ld = bpy.data.lights.new(name, kind); ld.energy = power; ld.color = col
    if kind == 'AREA': ld.size = size
    else: ld.shadow_soft_size = size
    o = bpy.data.objects.new(name, ld); o.location = (x, y, z); COL.objects.link(o); return o
light('L_parlour', -3.0, -2.5, 2.9, 'AREA', 260, size=1.2)
light('L_dining', -.4, -4.0, 1.5, 'POINT', 60, size=.1)
light('L_kitchen', 3.5, -2.5, 3.0, 'AREA', 220, size=1.0)
light('L_bed', -2.5, 3.0, 3.0, 'AREA', 200, size=1.0)
light('L_lamp1', -5.7, 1.5, 1.0, 'POINT', 25, size=.1); light('L_lamp2', -5.7, 4.5, 1.0, 'POINT', 25, size=.1)
light('L_bath', 4.25, 3.0, 3.0, 'AREA', 120, (.95, .95, 1), .6)
sun = bpy.data.lights.new('Sun', 'SUN'); sun.energy = 2.5; so = bpy.data.objects.new('Sun', sun); so.rotation_euler = (math.radians(50), math.radians(10), math.radians(200)); COL.objects.link(so)

# ---------------------------------------------------------------- the Sims view: camera high at 45 deg, front walls cut low
CUT = []
for o in COL.objects:
    if o.name.startswith('WALL_front') or o.name.startswith('WALL_right') or o.name.startswith('WALL_bath_front') or o.name.startswith('WALL_bed_front'):
        CUT.append(o)
for o in CUT:   # walls down, like the Sims: cut to 35 cm in the preview
    hz = o.dimensions.z; bottom = o.location.z - hz / 2
    if bottom < .05 and hz > .35: o.scale.z = .35 / hz; o.location.z = .175
    elif bottom >= .05: o.hide_viewport = True; o.hide_render = True
ceil.hide_viewport = True; ceil.hide_render = True
cam = bpy.data.cameras.new('SimsCam'); cam.lens = 28
co = bpy.data.objects.new('SimsCam', cam); COL.objects.link(co)
co.location = (8.5, -11.5, 10.5); co.rotation_euler = (math.radians(50), 0, math.radians(36))
bpy.context.scene.camera = co

sc = bpy.context.scene
try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
except Exception:
    try: sc.render.engine = 'BLENDER_EEVEE'
    except Exception: pass
sc.render.resolution_x, sc.render.resolution_y = 1600, 900
try: sc.eevee.use_raytracing = True
except Exception: pass
sc.view_settings.view_transform = 'AgX' if 'AgX' in [v.identifier for v in type(sc.view_settings).bl_rna.properties['view_transform'].enum_items] else 'Filmic'
w = sc.world or bpy.data.worlds.new('World'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes.get('Background')
if bg: bg.inputs[0].default_value = (.35, .45, .6, 1); bg.inputs[1].default_value = .6

# look through the camera in rendered mode
for win in bpy.context.window_manager.windows:
    for area in win.screen.areas:
        if area.type == 'VIEW_3D':
            sp = area.spaces[0]; sp.shading.type = 'RENDERED'; sp.overlay.show_overlays = False
            sp.region_3d.view_perspective = 'CAMERA'
print('Family Suite built:', len(COL.objects), 'objects')
