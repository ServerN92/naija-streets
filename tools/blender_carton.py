"""Naija Streets: the carton bed outside your tent, made in Blender.

Three flattened cartons on the ground, overlapping (each one draping over the one under it, corners curling up, the old
fold lines pressed in, cut edges showing the corrugated flute), a folded ankara wrapper for a pillow at the head end,
rubber slippers by the feet and a black nylon bag with your things. The head end is -X; the body lies along X.
One material, one 2048 atlas (carton_atlas.jpg, painted in Python). Exported to Documents/naija_rooms/carton/ns_carton.glb.
Run: blender -b --factory-startup --python blender_carton.py
"""
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix, noise
random.seed(11)
HERE = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms', 'carton')
OUT = os.path.join(HERE, 'ns_carton.glb')
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
img = bpy.data.images.load(os.path.join(HERE, 'carton_atlas.jpg'))
mat = bpy.data.materials.new('NS_Carton'); mat.use_nodes = True
bs = mat.node_tree.nodes['Principled BSDF']; tx = mat.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img
mat.node_tree.links.new(tx.outputs[0], bs.inputs['Base Color']); bs.inputs['Roughness'].default_value = .92
# atlas regions (u0, v0, u1, v1) in UV space (v up)
RG = {'s1': (0, .5, .5, 1), 's2': (.5, .5, 1, 1), 's3': (0, .25, .5, .5), 'edge': (.5, .25, 1, .5), 'cloth': (0, 0, .5, .25), 'slip': (.5, 0, .75, .25), 'nylon': (.75, 0, 1, .25)}
def reg(r, u, v): u0, v0, u1, v1 = RG[r]; return (u0 + (u1 - u0) * u, v0 + (v1 - v0) * v)

SHEETS = [  # name, centre, size, turn (deg), crease along local u (fraction) or v, region
    ('s3', (-.52, .44), (.88, .44), 9, ('u', .5), 's3'),
    ('s2', (.46, .01), (.99, .86), -2.5, ('v', .58), 's2'),
    ('s1', (-.43, -.01), (.98, .82), 3, ('u', .68), 's1')]
TH = .0045
placed = []   # (centre, size, turn, top-height function) of the sheets already down

def inside(p, c, s, a, pad=0):
    ca, sa = math.cos(-a), math.sin(-a); d = p.to_2d() - Vector(c); x = d.x * ca - d.y * sa; y = d.x * sa + d.y * ca
    return max(abs(x) - s[0] / 2, abs(y) - s[1] / 2) <= pad, (x, y)

def base_z(p):
    """how high the sheets already down lift this point (a soft step over each edge)"""
    z = 0
    for c, s, a, top in placed:
        ca, sa = math.cos(-a), math.sin(-a); d = p.to_2d() - Vector(c); x = d.x * ca - d.y * sa; y = d.x * sa + d.y * ca
        out = max(abs(x) - s[0] / 2, abs(y) - s[1] / 2)            # <0 inside
        k = max(0, min(1, (.035 - out) / .07))                      # ramps over 7 cm across the edge below
        z = max(z, top(p) * (k * k * (3 - 2 * k)))
    return z

def sheet(name, c, s, deg, crease, region):
    a = math.radians(deg); nu, nv = 46, 38; bm = bmesh.new(); grid = []
    ph = random.random() * 50
    for j in range(nv + 1):
        row = []
        for i in range(nu + 1):
            u, v = i / nu, j / nv; lx, ly = (u - .5) * s[0], (v - .5) * s[1]
            p = Vector((c[0] + lx * math.cos(a) - ly * math.sin(a), c[1] + lx * math.sin(a) + ly * math.cos(a), 0))
            z = base_z(p) + .0015
            e = min(u, 1 - u, v, 1 - v)                               # curl: the edges and most of all the corners lift
            cu = max(0, .09 - min(u, 1 - u) * s[0]) / .09; cv = max(0, .09 - min(v, 1 - v) * s[1]) / .09
            z += .012 * (cu * cv) ** 1.3 * (.6 + .8 * (noise.noise(Vector((u * 3 + ph, v * 3, 0))) * .5 + .5)) + .004 * max(cu, cv) ** 2
            z += .0025 * (noise.noise(Vector((u * 6 + ph, v * 6, 1))) * .5 + .5)  # not flat: crumpled a little, pressed by bodies
            f, at = crease; d = (u - at) * s[0] if f == 'u' else (v - at) * s[1]
            z -= .003 * math.exp(-(d / .012) ** 2)                    # the old fold line pressed in
            z = max(z, base_z(p) + TH + .0012)                         # never below its own underside
            row.append(bm.verts.new((p.x, p.y, z)))
        grid.append(row)
    uv = bm.loops.layers.uv.new('UVMap'); bot = []
    for j in range(nv + 1):
        bot.append([bm.verts.new((grid[j][i].co.x, grid[j][i].co.y, max(0.0003, grid[j][i].co.z - TH))) for i in range(nu + 1)])
    for j in range(nv):
        for i in range(nu):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            for l, (ii, jj) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))): l[uv].uv = reg(region, ii / nu, jj / nv)
            g = bm.faces.new((bot[j + 1][i], bot[j + 1][i + 1], bot[j][i + 1], bot[j][i]))
            for l in g.loops: l[uv].uv = reg('s3', .5, .5)            # underside: plain board
    ring = [(i, 0) for i in range(nu)] + [(nu, j) for j in range(nv)] + [(i, nv) for i in range(nu, 0, -1)] + [(0, j) for j in range(nv, 0, -1)]
    L = 0
    for k in range(len(ring)):                                         # the cut edges: corrugated flute
        (i0, j0), (i1, j1) = ring[k], ring[(k + 1) % len(ring)]
        f = bm.faces.new((grid[j0][i0], bot[j0][i0], bot[j1][i1], grid[j1][i1])); seg = (grid[j1][i1].co - grid[j0][i0].co).length
        for l, (uu, vv) in zip(f.loops, ((L, 1), (L, 0), (L + seg, 0), (L + seg, 1))): l[uv].uv = reg('edge', (uu * 4) % 1 if False else min(.999, (uu % .25) * 4), .2 + .6 * vv)
        L += seg
    me = bpy.data.meshes.new(name); bm.normal_update(); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    # remember this sheet's top so the next one drapes over it
    pts = [(Vector((vv.co.x, vv.co.y, 0)), vv.co.z) for vv in me.vertices if vv.co.z > .0006]
    def top(p, c=c, s=s, a=a, me=me):
        ok, (x, y) = inside(p, c, s, a); return TH + .0025 + .0015
    placed.append((c, s, a, top)); return ob

obs = [sheet(*S) for S in SHEETS]

def mesh_from(obj, region, squash=None):
    """unwrap an object into an atlas region (box-projected) and apply its modifiers"""
    bpy.context.view_layer.objects.active = obj; obj.select_set(True)
    for m in list(obj.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.cube_project(cube_size=.5); bpy.ops.object.mode_set(mode='OBJECT')
    me = obj.data; uvl = me.uv_layers.active.data
    for l in uvl: u, v = l.uv; l.uv = reg(region, (u % 1) * .98 + .01, (v % 1) * .98 + .01)
    me.materials.clear(); me.materials.append(mat); obj.select_set(False)
    for p in me.polygons: p.use_smooth = True
    return obj

# the pillow: an ankara wrapper folded into a soft bundle at the head end
bpy.ops.mesh.primitive_cube_add(size=1, location=(-.78, -.02, .006 + TH + .045)); pw = bpy.context.active_object; pw.name = 'pillow'
pw.scale = (.2, .17, .042); pw.rotation_euler.z = math.radians(-6); bpy.ops.object.transform_apply(scale=True, rotation=True)
m = pw.modifiers.new('b', 'BEVEL'); m.width = .03; m.segments = 4
m = pw.modifiers.new('s', 'SUBSURF'); m.levels = 2
t = bpy.data.textures.new('lumps', 'CLOUDS'); t.noise_scale = .12
m = pw.modifiers.new('d', 'DISPLACE'); m.texture = t; m.strength = .012
mesh_from(pw, 'cloth')
for v in pw.data.vertices:                                          # flatter underneath, sitting on the board
    if v.co.z < .006 + TH + .01: v.co.z = .006 + TH + .002 + (v.co.z - (.006 + TH)) * .2
# a second fold of the wrapper hanging off the pillow onto the carton
bpy.ops.mesh.primitive_plane_add(size=1, location=(-.58, -.02, .006 + TH + .004)); fl = bpy.context.active_object; fl.name = 'flap'
fl.scale = (.16, .3, 1); bpy.ops.object.transform_apply(scale=True)
m = fl.modifiers.new('s', 'SUBDIVIDE') if False else fl.modifiers.new('s', 'SUBSURF'); m.levels = 3; m.subdivision_type = 'SIMPLE'
bpy.context.view_layer.objects.active = fl; bpy.ops.object.modifier_apply(modifier='s')
for v in fl.data.vertices:
    k = max(0, (-.58 + .16 - v.co.x) / .32 + .5); v.co.z += .03 * max(0, 1 - (v.co.x + .74) / .12) * 1.0 + .003 * noise.noise(v.co * 20)
m = fl.modifiers.new('t', 'SOLIDIFY'); m.thickness = .003
mesh_from(fl, 'cloth')

# rubber slippers beside the feet
for k, (x, y, a) in enumerate(((1.02, -.52, 14), (.9, -.6, -8))):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.5, depth=1, location=(x, y, .011)); s = bpy.context.active_object; s.name = 'slipper%d' % k
    s.scale = (.135, .052, .011); s.rotation_euler.z = math.radians(a); bpy.ops.object.transform_apply(scale=True, rotation=True)
    m = s.modifiers.new('b', 'BEVEL'); m.width = .004; m.segments = 2
    mesh_from(s, 'slip')
    for l in s.data.uv_layers.active.data: u, v = l.uv; l.uv = (u, RG['slip'][1] + (v - RG['slip'][1]) * .45)   # blue half
    bpy.ops.mesh.primitive_torus_add(major_radius=.045, minor_radius=.007, location=(x + .035 * math.cos(math.radians(a)), y + .035 * math.sin(math.radians(a)), .022))
    st = bpy.context.active_object; st.name = 'strap%d' % k; st.scale = (1, 1.15, .55); st.rotation_euler = (math.radians(90), 0, math.radians(a + 90)); bpy.ops.object.transform_apply(scale=True, rotation=True)
    bm = bmesh.new(); bm.from_mesh(st.data); bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -.002], context='VERTS'); bm.to_mesh(st.data); bm.free()
    st.location.z = .02; mesh_from(st, 'slip')
    for l in st.data.uv_layers.active.data: u, v = l.uv; l.uv = (u, RG['slip'][1] + .14 + (v - RG['slip'][1]) * .4)   # white half

# the black nylon bag with your things, by the head
bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=.5, location=(-.98, .46, .07)); ng = bpy.context.active_object; ng.name = 'nylon'
ng.scale = (.27, .22, .15); bpy.ops.object.transform_apply(scale=True)
t2 = bpy.data.textures.new('bag', 'CLOUDS'); t2.noise_scale = .06
m = ng.modifiers.new('d', 'DISPLACE'); m.texture = t2; m.strength = .03
mesh_from(ng, 'nylon')
for v in ng.data.vertices:
    if v.co.z < .02: v.co.z = .02 + (v.co.z - .02) * .15
# the knot on top
bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=.03, radius2=.008, depth=.06, location=(-.98, .46, .16)); kn = bpy.context.active_object; kn.name = 'knot'; mesh_from(kn, 'nylon')

# one object, origin at the middle of the bed on the ground
for o in bpy.data.objects: o.select_set(o.type == 'MESH')
bpy.context.view_layer.objects.active = obs[0]; bpy.ops.object.join(); bed = bpy.context.active_object; bed.name = 'ns_carton'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
print('tris', sum(len(p.vertices) - 2 for p in bed.data.polygons), 'size', [round(x, 3) for x in bed.dimensions])
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_draco_mesh_compression_enable=True,
                          export_draco_mesh_compression_level=6, export_image_format='JPEG', export_jpeg_quality=88, export_apply=True)
# a preview from above and from the side
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
sc.render.resolution_x, sc.render.resolution_y = 1200, 700
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = 1.2
bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, -.001)); gr = bpy.context.active_object; gm = bpy.data.materials.new('g'); gm.use_nodes = True
gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.32, .2, .12, 1); gr.data.materials.append(gm)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.5; sun.rotation_euler = (math.radians(40), math.radians(15), math.radians(30)); sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 35
for nm, loc in (('top', (0, -.01, 2.6)), ('side', (1.6, -1.9, .9))):
    cam.location = loc; d = Vector((0, 0, 0)) - Vector(loc); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(HERE, 'carton_' + nm + '.png'); bpy.ops.render.render(write_still=True)
print('carton exported to', OUT)
