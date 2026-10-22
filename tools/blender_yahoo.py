# Naija Streets: the yahoo boy's setup, built in Blender. yh_desk: a black computer desk with two monitors (one showing a
# chat window, one a spreadsheet), a PC tower with a blue fan light, keyboard, mouse, a headset on a stand, a router, an
# energy drink can and a phone; a gaming chair (red and black) in front. About 1.6 m wide, 0.75 m desk height. Z up, front -Y
# (the chair side). Exported to Documents/naija_rooms/yahoo/yh_desk.glb.
#
# It never builds inside a project you have open: run from Blender's UI with your own .blend open, it starts a second
# Blender in the background (no window, factory settings) that builds and exports, and your file is not touched.
import bpy, bmesh, math, os, time, traceback, subprocess

HERE = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms')
OUT = os.path.join(HERE, 'yahoo'); os.makedirs(OUT, exist_ok=True)
LOGF = os.path.join(HERE, 'yahoo_log.txt')
def log(*a):
    with open(LOGF, 'a') as f: f.write(time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a) + '\n')

if not bpy.app.background:
    open(LOGF, 'w').write('yahoo: starting a background Blender\n')
    p = subprocess.Popen([bpy.app.binary_path, '--background', '--factory-startup', '--python', os.path.join(HERE, 'blender_yahoo.py')],
                         stdout=open(os.path.join(HERE, 'yahoo_bg.txt'), 'w'), stderr=subprocess.STDOUT, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    print('YAHOO BACKGROUND STARTED', p.pid)
else:
    def lin(h):
        h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c)
    MATS = {}
    def mat(name, hexc, rough=.6, metal=0.0, emit=None):
        if name in MATS: return MATS[name]
        m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*lin(hexc), 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
        if emit: b.inputs['Emission Color'].default_value = (*lin(emit), 1); b.inputs['Emission Strength'].default_value = 2.0
        MATS[name] = m; return m
    def screen_mat(name, kind):
        """A monitor picture painted into a small image: a chat window or a spreadsheet."""
        W, H = 256, 160; img = bpy.data.images.new(name + '_img', W, H); px = [0.0] * (W * H * 4)
        def rect(x0, y0, x1, y1, col):
            for y in range(max(0, y0), min(H, y1)):
                for x in range(max(0, x0), min(W, x1)):
                    i = (y * W + x) * 4; px[i:i + 3] = col; px[i + 3] = 1.0
        if kind == 'chat':
            rect(0, 0, W, H, (.07, .09, .12)); rect(0, H - 22, W, H, (.12, .55, .35))
            for k in range(6):
                y = H - 40 - k * 22; left = k % 2 == 0
                rect(12 if left else 110, y, 140 if left else 244, y + 16, (.2, .22, .26) if left else (.1, .45, .3))
            rect(0, 0, W, 18, (.15, .17, .2)); rect(8, 4, 200, 14, (.3, .32, .36))
        else:
            rect(0, 0, W, H, (.95, .96, .97)); rect(0, H - 18, W, H, (.13, .45, .25))
            for r in range(8): rect(0, r * 18, W, r * 18 + 1, (.8, .82, .85))
            for c in range(6): rect(c * 44, 0, c * 44 + 1, H - 18, (.8, .82, .85))
            for r in range(7):
                for c in range(5): rect(c * 44 + 4, r * 18 + 5, c * 44 + 22 + (r * 7 + c * 5) % 16, r * 18 + 13, (.25, .25, .3) if c else (.1, .4, .7))
        img.pixels = px; img.pack()
        m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']; t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
        nt.links.new(t.outputs['Color'], b.inputs['Base Color']); nt.links.new(t.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = 1.4; b.inputs['Roughness'].default_value = .2
        return m
    parts = []
    def box(name, x, y, z, w, d, h, m, bevel=0.0):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + h / 2)); o = bpy.context.active_object; o.name = name; o.scale = (w, d, h); bpy.ops.object.transform_apply(scale=True)
        o.data.materials.append(m)
        if bevel: bv = o.modifiers.new('b', 'BEVEL'); bv.width = bevel; bv.segments = 2; bpy.ops.object.modifier_apply(modifier='b')
        parts.append(o); return o
    def cyl(name, x, y, z, r, h, m, rot=None, seg=24):
        bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=h, location=(x, y, z + h / 2)); o = bpy.context.active_object; o.name = name
        if rot: o.rotation_euler = rot
        o.data.materials.append(m); parts.append(o); return o
    try:
        open(LOGF, 'a').write('yahoo build %s background=%s\n' % (bpy.app.version_string, bpy.app.background))
        for o in list(bpy.context.scene.objects): bpy.data.objects.remove(o, do_unlink=True)
        black = mat('yh_black', '#15161a', .5); steel = mat('yh_steel', '#8a8f96', .35, .8); dark = mat('yh_dark', '#26282e', .55)
        red = mat('yh_red', '#b3261e', .55); white = mat('yh_white', '#e8e6e0', .5); blue = mat('yh_blue', '#2a7bd8', .4, 0, '#2a9bff')
        chat = screen_mat('yh_chat', 'chat'); sheet = screen_mat('yh_sheet', 'sheet'); bezel = mat('yh_bezel', '#0b0c0e', .3)
        # the desk: top, two side panels, a back panel
        box('top', 0, 0, .72, 1.6, .7, .03, black, .006)
        for sx in (-.76, .76): box('side', sx, 0, 0, .04, .66, .72, dark)
        box('back', 0, .32, .1, 1.5, .03, .6, dark)
        # the PC tower under the desk on the right, with a fan light
        box('tower', .55, .05, .0, .2, .45, .44, black, .004); box('fan', .45, -.16, .12, .003, .12, .12, blue)
        # two monitors on stands (the right one turned a little)
        for i, (mx, ang, sm) in enumerate(((-.36, .08, chat), (.36, -.1, sheet))):
            base = cyl('mbase%d' % i, mx, .18, .75, .12, .015, steel); stem = box('mstem%d' % i, mx, .2, .765, .04, .03, .2, steel)
            bz = box('mbezel%d' % i, mx, .2, .9, .62, .025, .37, bezel, .004); sc = box('mscreen%d' % i, mx, .186, .92, .58, .004, .33, sm)
            for o in (bz, sc, stem, base): o.rotation_euler = (0, 0, ang)
        # keyboard, mouse, headset on its stand, router, a phone and an energy drink
        box('keys', -.1, -.14, .75, .44, .14, .02, dark, .004); box('mouse', .24, -.16, .75, .06, .1, .03, dark, .01)
        cyl('hstand', .68, -.1, .75, .05, .01, steel); cyl('hpole', .68, -.1, .76, .008, .22, steel); cyl('hband', .68, -.1, .96, .09, .03, black, rot=(math.radians(90), 0, 0), seg=20)
        box('router', -.66, .2, .75, .18, .12, .03, white); cyl('ant', -.72, .24, .78, .005, .12, black); cyl('ant2', -.6, .24, .78, .005, .12, black)
        box('phone', -.5, -.2, .75, .07, .14, .008, black); cyl('can', .5, -.22, .75, .03, .12, red)
        # the gaming chair: seat, back, headrest, star base, wheels
        box('seat', 0, -.72, .42, .5, .5, .1, black, .02); box('seatred', 0, -.72, .52, .3, .42, .012, red, .006)
        box('cback', 0, -.5, .5, .5, .1, .62, black, .03); box('cbackred', 0, -.555, .58, .28, .012, .4, red, .006); box('chead', 0, -.5, 1.12, .3, .1, .14, black, .03)
        for sy in (-.28, .28): box('arm', sy, -.7, .5, .06, .3, .18, dark, .01)
        cyl('gas', 0, -.72, .1, .035, .32, steel)
        cyl('base', 0, -.72, .03, .3, .04, black, seg=5)   # a five-point base
        for k in range(5):
            a = k * math.pi * 2 / 5 + math.pi / 5; cyl('wheel%d' % k, math.cos(a) * .27, -.72 + math.sin(a) * .27, 0, .03, .04, dark, rot=(math.radians(90), 0, a))
        # join and export
        for o in parts: o.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); ob = bpy.context.active_object; ob.name = 'yh_desk'
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        for p in ob.data.polygons: p.use_smooth = False
        path = os.path.join(OUT, 'yh_desk.glb')
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
        log('exported', path, len(ob.data.polygons), 'faces', round(os.path.getsize(path) / 1024, 1), 'KB')
        try:
            sc = bpy.context.scene; cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
            cam.location = (2.3, -3.1, 1.6); cam.rotation_euler = (math.radians(70), 0, math.radians(36))
            sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (math.radians(50), 0, math.radians(30)); sc.collection.objects.link(sun)
            if sc.world is None: sc.world = bpy.data.worlds.new('w')
            sc.world.use_nodes = True; bg = sc.world.node_tree.nodes.get('Background')
            if bg: bg.inputs[0].default_value = (.5, .5, .55, 1); bg.inputs[1].default_value = 1.0
            sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
            sc.render.resolution_x, sc.render.resolution_y = 900, 600; sc.render.filepath = os.path.join(OUT, 'yh_desk_preview.png'); bpy.ops.render.render(write_still=True)
        except Exception: log('preview failed', traceback.format_exc())
        log('ALL DONE'); print('YAHOO OK')
    except Exception:
        log('FAILED', traceback.format_exc()); print(traceback.format_exc())
