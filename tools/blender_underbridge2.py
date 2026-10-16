"""Naija Streets: Under Bridge gangs kit (cults, kidnappers, bandits), built in Blender and exported for the game.

  hat_beret     - a cult beret with a badge (the game tints it red or blue), sits on the head
  hat_mask      - a black head wrap with an eye slit (kidnappers and bandits), fits round the head
  ub_base_red   - a cult "base": painted wall with the cult's band and sign, tarp shade, benches, an old sofa, speaker
  ub_base_blue  - the same base for the other cult
  ub_den        - the kidnappers' den: a zinc-fenced yard with a gate, an unfinished block house with rebar on the roof,
                  mattresses, a chain post, plastic chairs, a generator
Each as one mesh, one material, a colour per face corner, Z up, front toward -Y (= +Z in the game); plus a lighter _lod1.

Run inside Blender (Scripting > New > paste > Run Script): the pieces appear in a collection "NS Under Bridge Gangs" and
the .glb files go to Documents/naija_ikeja/models. Or headless: python3 tools/glb_build.py -m blender_underbridge2
"""
import bpy, bmesh, math, os

OUT = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_ikeja', 'models')


def hexc(h, k=1.0):
    h = h.lstrip('#')
    return tuple(min(1.0, int(h[i:i + 2], 16) / 255 * k) for i in (0, 2, 4)) + (1.0,)


def _sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def _dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def newell(pts):
    n = [0.0, 0.0, 0.0]
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1])
    return n


def hf(*a):
    s = 0.0
    for i, t in enumerate(a):
        s += (t + 1.37) * (12.9898 + 7.233 * i)
    x = math.sin(s) * 43758.5453
    return x - math.floor(x)


class Builder:
    """Collects faces into one bmesh with a colour per face corner; faces are turned to face `out` (or away from a part's middle)."""

    def __init__(self, detail=True):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.color.new('Col')
        self.detail = detail
        self.coll = None

    def face(self, pts, c, out=None, shade=None):
        pts = [tuple(p) for p in pts]
        if out is not None and _dot(newell(pts), out) < 0:
            pts = pts[::-1]
            if shade: shade = shade[::-1]
        vs = [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(vs)
        for i, l in enumerate(f.loops):
            l[self.col] = hexc(c, shade[i] if shade else 1.0)
        return f

    def solid(self, faces, c, centre=None, grime=None):
        if centre is None:
            ps = [p for f in faces for p in f]
            centre = tuple(sum(p[i] for p in ps) / len(ps) for i in range(3))
        for f in faces:
            m = tuple(sum(p[i] for p in f) / len(f) for i in range(3))
            self.face(f, c, _sub(m, centre), [grime(p[2]) for p in f] if grime else None)

    def box(self, x0, x1, y0, y1, z0, z1, c, grime=None, bottom=True):
        x0, x1 = min(x0, x1), max(x0, x1); y0, y1 = min(y0, y1), max(y0, y1); z0, z1 = min(z0, z1), max(z0, z1)
        P = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        Q = [(4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)] + ([(0, 1, 2, 3)] if bottom else [])
        self.solid([[P[i] for i in q] for q in Q], c, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), grime)

    def prism(self, base, z0, z1, c, grime=None, top=True, bottom=False):
        """an upright prism on the polygon base [(x, y)...] (convex)"""
        a = [(x, y, z0) for x, y in base]; b = [(x, y, z1) for x, y in base]; n = len(base)
        faces = [[a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]] for i in range(n)]
        if top: faces.append(b)
        if bottom: faces.append(a)
        cx = sum(p[0] for p in base) / n; cy = sum(p[1] for p in base) / n
        self.solid(faces, c, (cx, cy, (z0 + z1) / 2), grime)

    def cyl(self, cx, cy, z0, z1, r, n, c, top=True):
        self.prism([(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)], z0, z1, c, top=top)

    def finish(self, name):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me); self.bm.free()
        try:
            me.color_attributes.active_color_index = 0
            me.color_attributes.render_color_index = 0
        except Exception:
            pass
        ob = bpy.data.objects.new(name, me)
        (self.coll or bpy.context.scene.collection).objects.link(ob)
        mat = bpy.data.materials.get('NS_House') or make_material()
        me.materials.append(mat)
        return ob


def make_material():
    m = bpy.data.materials.new('NS_House')
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    b = nt.nodes.get('Principled BSDF')
    ca = nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = 'Col'
    nt.links.new(ca.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = .85
    return m


CONC = '#a6a299'; CONC2 = '#8e8a82'; POSTERS = ['#d63b2f', '#f2c12e', '#2e6fd6', '#f4f1e8', '#1f9a52', '#e86a1e', '#7a3fa0']
ZINC = '#9aa0a4'; ZINC2 = '#7f868b'; RUST = '#8a4b2a'; WOOD = '#8a5d3b'; WOOD2 = '#6f4a2e'; TARP = '#2f6fb3'
GRIME = lambda z: .78 + .22 * min(1.0, z / 2.2)



BLOCK = '#9b978f'; BLOCK2 = '#8a867e'; PAINT = '#ece8de'; CHAIR = '#f1f1ee'


# ================================================================ hats (made around the head bone: origin at the top of the neck)
def hat_beret(detail):
    B = Builder(detail)
    n = 16 if detail else 8
    # a soft disc tipped to the right, over a band that sits on the head
    band, top = [], []
    for i in range(n):
        a = 2 * math.pi * i / n
        band.append((.098 * math.cos(a), .108 * math.sin(a), .155))
        dz = .02 * math.cos(a)                               # lower on the right side (x > 0)
        top.append((.128 * math.cos(a) + .018, .132 * math.sin(a) - .006, .205 - dz))
    lip = [(p[0] * 1.02, p[1] * 1.02, p[2] - .012) for p in band]
    for i in range(n):
        j = (i + 1) % n
        B.face([lip[i], lip[j], band[j], band[i]], '#cfcfcf', (band[i][0], band[i][1], 0))
        B.face([band[i], band[j], top[j], top[i]], '#e6e6e6', (band[i][0], band[i][1], -.2))
    cz = sum(p[2] for p in top) / n
    for i in range(n):
        j = (i + 1) % n
        B.face([top[i], top[j], (.02, -.006, cz + .02)], '#f2f2f2', (0, 0, 1))
    if detail:                                                # the badge on the front
        B.box(-.03, .0, -.118, -.106, .172, .2, '#d4af37')
    return B.finish('hat_beret' + ('' if detail else '_lod1'))


def hat_mask(detail):
    B = Builder(detail)
    n = 14 if detail else 8
    rows = [(-.035, .085, .095), (.02, .1, .11), (.075, .108, .118), (.13, .104, .114), (.18, .09, .1), (.22, .062, .07), (.245, .02, .025)]
    ring = lambda z, rx, ry: [(rx * math.cos(2 * math.pi * i / n), ry * math.sin(2 * math.pi * i / n), z) for i in range(n)]
    R = [ring(*r) for r in rows]
    for k in range(len(R) - 1):
        for i in range(n):
            j = (i + 1) % n
            f = [R[k][i], R[k][j], R[k + 1][j], R[k + 1][i]]
            m = tuple(sum(p[q] for p in f) / 4 for q in range(3))
            front = m[1] < -.06 and abs(m[0]) < .07
            c = '#2a1c14' if (front and k == 2) else '#161616' if (i + k) % 2 else '#1d1d1f'   # the eye slit shows skin
            B.face(f, c, (m[0], m[1], m[2] - .1))
    B.face(R[-1], '#161616', (0, 0, 1))
    if detail:                                                # the knot at the back
        B.box(-.02, .02, .1, .13, .07, .11, '#161616')
    return B.finish('hat_mask' + ('' if detail else '_lod1'))


# ================================================================ a cult base
def _base(detail, band, name):
    B = Builder(detail)
    # the back wall: blocks, painted, the cult's band across it and a round emblem
    B.box(-4.0, 4.0, 2.3, 2.6, 0, 2.5, PAINT, GRIME)
    B.box(-4.05, 4.05, 2.25, 2.65, 2.5, 2.62, '#c9c4b8')
    for x in (-4.0, 4.0):                                      # short side walls
        B.box(x - .15, x + .15, -.5, 2.6, 0, 1.4, PAINT, GRIME)
    B.box(-4.0, 4.0, 2.27, 2.3, 1.05, 1.75, band)
    ring = [(0 + 1.0 * math.cos(2 * math.pi * i / 20), 2.265, 1.4 + 1.0 * math.sin(2 * math.pi * i / 20)) for i in range(20)]
    B.face(ring, '#141414', (0, -1, 0))
    ring2 = [(0 + .82 * math.cos(2 * math.pi * i / 20), 2.26, 1.4 + .82 * math.sin(2 * math.pi * i / 20)) for i in range(20)]
    B.face(ring2, band, (0, -1, 0))
    for s in (-1, 1):                                          # two crossed bars in the emblem
        B.face([(-.62, 2.255, 1.4 - s * .55), (-.48, 2.255, 1.4 - s * .69), (.62, 2.255, 1.4 + s * .55), (.48, 2.255, 1.4 + s * .69)], '#141414', (0, -1, 0))
    # tarp shade on four poles, in the cult colour
    for x in (-3.4, 3.4):
        for y in (-2.2, 2.0):
            B.box(x - .05, x + .05, y - .05, y + .05, 0, 2.7, '#5a5a5a')
    B.solid([[(-3.7, -2.5, 2.55), (3.7, -2.5, 2.55), (3.7, 2.2, 2.75), (-3.7, 2.2, 2.75)],
             [(-3.7, -2.5, 2.58), (3.7, -2.5, 2.58), (3.7, 2.2, 2.78), (-3.7, 2.2, 2.78)]], band, (0, 0, 1.5))
    # benches, an old sofa, a speaker, crates
    for x0, x1, y in ((-3.3, -1.1, .2), (1.1, 3.3, .2)):
        B.box(x0, x1, y - .2, y + .2, .42, .48, WOOD)
        for x in (x0 + .2, x1 - .2):
            B.box(x - .12, x + .12, y - .15, y + .15, 0, .42, BLOCK)
    B.box(-1.0, 1.0, 1.35, 2.15, 0, .45, '#6b2a2a')            # the sofa
    B.box(-1.0, 1.0, 1.85, 2.2, .45, 1.0, '#5e2424')
    for x in (-1.0, .82):
        B.box(x, x + .18, 1.35, 2.2, .45, .7, '#5e2424')
    if detail:
        B.box(2.5, 3.1, 1.6, 2.15, 0, 1.1, '#1a1a1a')           # speaker box
        B.face([(2.8 + .2 * math.cos(2 * math.pi * i / 10), 1.595, .75 + .2 * math.sin(2 * math.pi * i / 10)) for i in range(10)], '#3a3a3a', (0, -1, 0))
        for i, (x, y) in enumerate(((-3.2, 1.7), (-2.6, 1.8), (-3.0, 1.2))):   # beer crates
            B.box(x - .25, x + .25, y - .18, y + .18, i * .0, .32, '#1f6b3a' if i % 2 else '#c48a1a')
        B.box(-.3, .3, -.9, -.5, 0, .5, '#8a5d3b')               # a little table
    return B.finish(name + ('' if detail else '_lod1'))


def base_red(detail): return _base(detail, '#b3221c', 'ub_base_red')
def base_blue(detail): return _base(detail, '#1f4fa8', 'ub_base_blue')


# ================================================================ the kidnappers' den
def den(detail):
    B = Builder(detail)
    X, Y, H = 8.0, 7.0, 2.4
    n = 1 if not detail else 1
    # zinc fence round the yard, a gate gap in the front (y = -Y) between x = -1.6 and 1.6
    segs = [((-X, -Y), (-1.6, -Y)), ((1.6, -Y), (X, -Y)), ((X, -Y), (X, Y)), ((X, Y), (-X, Y)), ((-X, Y), (-X, -Y))]
    for (ax, ay), (bx, by) in segs:
        L = math.hypot(bx - ax, by - ay); k = max(1, int(L / 1.0)) if detail else 1
        ux, uy = (bx - ax) / L, (by - ay) / L; nx, ny = uy, -ux
        for i in range(k):
            t0, t1 = L * i / k, L * (i + 1) / k
            p0 = (ax + ux * t0, ay + uy * t0); p1 = (ax + ux * t1, ay + uy * t1)
            c = (RUST if hf(i, ax, by) > .8 else ZINC if i % 2 == 0 else ZINC2) if detail else ZINC
            for s, cc in ((1, c), (-1, ZINC2)):
                o = .03 * s
                pts = [(p0[0] + nx * o, p0[1] + ny * o, 0), (p1[0] + nx * o, p1[1] + ny * o, 0), (p1[0] + nx * o, p1[1] + ny * o, H), (p0[0] + nx * o, p0[1] + ny * o, H)]
                B.face(pts, cc, (nx * s, ny * s, 0), [GRIME(p[2]) for p in pts])
        if detail:
            for i in range(k + 1):
                t = L * i / k
                B.box(ax + ux * t - .05, ax + ux * t + .05, ay + uy * t - .05, ay + uy * t + .05, 0, H + .1, WOOD2)
    # the gate leaf, swung open into the yard
    B.box(1.5, 1.6, -Y, -Y + 3.0, 0, H, RUST)
    for x in (-1.7, 1.7):
        B.box(x - .1, x + .1, -Y - .1, -Y + .1, 0, H + .3, BLOCK2)
    # the unfinished house at the back: block walls on three sides, pillars, slab, rebar sticking up
    hx0, hx1, hy0, hy1, hh = -5.5, 5.5, .8, 6.6, 3.0
    for x in (hx0, 0.0, hx1):
        for y in (hy0, hy1):
            B.box(x - .2, x + .2, y - .2, y + .2, 0, hh, BLOCK2, GRIME)
    B.box(hx0, hx1, hy1 - .1, hy1 + .1, 0, hh, BLOCK, GRIME)                     # back wall
    for x in (hx0, hx1):                                                       # side walls, half built
        B.box(x - .1, x + .1, hy0, hy1, 0, 2.1, BLOCK, GRIME)
    B.box(-1.2, 1.2, hy0 - .1, hy0 + .1, 0, hh, BLOCK, GRIME)                  # a stub of front wall in the middle
    B.box(hx0 - .3, hx1 + .3, hy0 - .3, hy1 + .3, hh, hh + .22, '#a9a59c')      # the roof slab
    if detail:
        for x in (hx0, 0.0, hx1):
            for y in (hy0, hy1):
                for dx, dy in ((-.1, -.1), (.1, -.1), (-.1, .1), (.1, .1)):
                    B.box(x + dx - .012, x + dx + .012, y + dy - .012, y + dy + .012, hh + .22, hh + 1.0, '#6a4630')
        # blocks stacked by the wall, a heap of sand
        for i in range(6):
            B.box(-7.2 + (i % 3) * .45, -6.8 + (i % 3) * .45, 4.5 + (i // 3) * .25, 4.7 + (i // 3) * .25, 0, .22 * (1 + i % 2), BLOCK)
        B.solid([[(-7.5, -3.0, 0), (-5.5, -3.0, 0), (-6.5, -2.0, .8)], [(-5.5, -3.0, 0), (-5.5, -1.0, 0), (-6.5, -2.0, .8)],
                 [(-5.5, -1.0, 0), (-7.5, -1.0, 0), (-6.5, -2.0, .8)], [(-7.5, -1.0, 0), (-7.5, -3.0, 0), (-6.5, -2.0, .8)]], '#c9a46a', (-6.5, -2.0, .2))
    # inside: two old mattresses, the post with the chain, a lamp
    for x in (-4.3, -2.2):
        B.box(x, x + 1.4, 4.4, 6.3, 0, .18, '#8f8a6a')
    B.box(2.9, 3.1, 4.0, 4.2, 0, 1.6, WOOD2)
    if detail:
        for i in range(6):
            B.box(3.0 - .025, 3.0 + .025, 4.2 + i * .1, 4.3 + i * .1, .5 - i * .08, .55 - i * .08, '#5a5a5a')
    # in the yard: plastic chairs round a table, a generator, a drum
    B.box(-.5, .5, -3.0, -2.2, .7, .75, CHAIR)
    for x in (-.45, .45):
        for y in (-2.95, -2.25):
            B.box(x - .025, x + .025, y - .025, y + .025, 0, .7, CHAIR)
    for cx, cy in ((-1.2, -2.6), (1.2, -2.6), (0, -3.6)):
        B.box(cx - .22, cx + .22, cy - .22, cy + .22, .42, .46, CHAIR)
        B.box(cx - .22, cx + .22, cy + (.2 if cy > -3 else -.24), cy + (.24 if cy > -3 else -.2), .46, .9, CHAIR)
    B.box(5.0, 6.0, -4.5, -3.8, 0, .7, '#c23a2a')                              # generator
    B.box(5.1, 5.9, -4.4, -3.9, .7, .78, '#1a1a1a')
    B.cyl(-5.0, -5.0, 0, .88, .3, 10 if detail else 6, '#2a4a7a')               # a water drum
    return B.finish('ub_den' + ('' if detail else '_lod1'))


BUILDS = (hat_beret, hat_mask, base_red, base_blue, den)


def export(ob, path):
    vl = bpy.context.view_layer
    for o in vl.objects:
        o.select_set(False)
    ob.select_set(True)
    vl.objects.active = ob
    loc = ob.location.copy(); ob.location = (0, 0, 0)
    args = dict(filepath=path, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                export_texcoords=False, export_normals=True, export_materials='EXPORT', export_vertex_color='ACTIVE')
    for drop in ([], ['export_vertex_color'], ['export_vertex_color', 'export_texcoords']):
        a = {k: v for k, v in args.items() if k not in drop}
        try:
            bpy.ops.export_scene.gltf(**a)
            break
        except TypeError:
            continue
    ob.location = loc



def main():
    os.makedirs(OUT, exist_ok=True)
    sc = bpy.context.scene
    coll = bpy.data.collections.get('NS Under Bridge Gangs') or bpy.data.collections.new('NS Under Bridge Gangs')
    if coll.name not in sc.collection.children:
        sc.collection.children.link(coll)
    for ob in [o for o in bpy.data.objects if o.name.startswith(('ub_base', 'ub_den', 'hat_'))]:
        bpy.data.objects.remove(ob, do_unlink=True)
    made = []
    for i, fn in enumerate(BUILDS):
        for detail in (True, False):
            ob = fn(detail)
            if ob.name not in coll.objects:
                for c in list(ob.users_collection):
                    c.objects.unlink(ob)
                coll.objects.link(ob)
            export(ob, os.path.join(OUT, ob.name + '.glb'))
            small = ob.name.startswith('hat_')
            ob.location = (i * 20 - 40, 200 if detail else 230, 0)
            if small:
                ob.scale = (8, 8, 8)
            if not detail:
                ob.hide_set(True)
            made.append(ob.name)
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            sp = area.spaces.active
            sp.shading.type = 'SOLID'
            sp.shading.color_type = 'VERTEX'
            sp.clip_end = 2000
            r3 = sp.region_3d
            r3.view_location = (0, 200, 2)
            r3.view_distance = 70
            from mathutils import Euler
            r3.view_rotation = Euler((math.radians(62), 0, math.radians(-20)), 'XYZ').to_quaternion()
    print('Under Bridge gangs kit exported to', OUT, made)
    return made


if __name__ == '__main__':
    main()
