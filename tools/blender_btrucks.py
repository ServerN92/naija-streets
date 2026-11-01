"""Bake the three bandit trucks (and the gun) into one mesh + one texture each, export for the game.
Run: blender --background bt_trucks_src.blend --python bt_bake.py"""
import bpy, os, time, traceback
OUT = r'C:\Users\user\Documents\naija_rooms\vehicles\bt_out'; os.makedirs(OUT, exist_ok=True)
LOG = open(os.path.join(OUT, 'bake_log.txt'), 'w')
def log(*a): LOG.write(time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a) + '\n'); LOG.flush()
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 4; sc.cycles.device = 'CPU'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.get_devices()
    for t in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
        try: prefs.compute_device_type = t; prefs.get_devices(); 
        except Exception: continue
        if any(d.type == t for d in prefs.devices): 
            for d in prefs.devices: d.use = True
            sc.cycles.device = 'GPU'; break
except Exception: pass
log('device', sc.cycles.device)

def bake(tag, size, name):
    objs = [o for o in bpy.data.objects if o.type == 'MESH' and o.get('bt') == tag]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    ob = bpy.context.active_object; ob.name = name
    me = ob.data
    src = me.uv_layers[0].name if me.uv_layers else None
    if not src: me.uv_layers.new(name='UVMap'); src = 'UVMap'
    for uv in me.uv_layers: uv.active_render = (uv.name == src)
    bk = me.uv_layers.new(name='bake'); me.uv_layers.active = bk
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004, area_weight=0.6, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new(name + '_bake', size, size, alpha=False)
    for s in ob.material_slots:
        m = s.material
        if not m: continue
        m.use_nodes = True; nt = m.node_tree
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = img; n.name = '_bake'
        for x in nt.nodes: x.select = False
        n.select = True; nt.nodes.active = n
    sc.render.bake.use_pass_direct = False; sc.render.bake.use_pass_indirect = False; sc.render.bake.use_pass_color = True
    sc.render.bake.margin = 6; sc.render.bake.target = 'IMAGE_TEXTURES'
    t = time.time(); bpy.ops.object.bake(type='DIFFUSE'); log('baked', name, round(time.time() - t, 1), 's')
    p = os.path.join(OUT, name + '.png'); img.filepath_raw = p; img.file_format = 'PNG'; img.save()
    # one material with the baked picture, only the bake UVs kept
    mat = bpy.data.materials.new(name + '_M'); mat.use_nodes = True; nt = mat.node_tree
    bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = img
    nt.links.new(tx.outputs['Color'], bs.inputs['Base Color']); bs.inputs['Roughness'].default_value = .7; bs.inputs['Metallic'].default_value = 0
    me.materials.clear(); me.materials.append(mat)
    for uv in list(me.uv_layers):
        if uv.name != 'bake': me.uv_layers.remove(uv)
    me.uv_layers['bake'].active_render = True
    return ob

def export(ob, path):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_apply=True, export_image_format='JPEG', export_jpeg_quality=90,
                              export_materials='EXPORT', export_normals=True, export_texcoords=True, export_yup=True)
    log('exported', path, os.path.getsize(path))

def lod(ob, ratio, path):
    c = ob.copy(); c.data = ob.data.copy(); bpy.context.scene.collection.objects.link(c)
    d = c.modifiers.new('dec', 'DECIMATE'); d.ratio = ratio
    export(c, path)

try:
    for tag, name, sz in [('t1', 'bt_technical', 2048), ('t2', 'bt_hilux', 2048), ('t3', 'bt_rusty', 2048), ('gun', 'bt_gun', 512)]:
        ob = bake(tag, sz, name)
        # each truck on its own: back to x=0 (the gun is at its pivot already)
        if tag != 'gun':
            xs = [v.co.x for v in ob.data.vertices]; cx = (min(xs) + max(xs)) / 2
            for v in ob.data.vertices: v.co.x -= cx
            ob.location = (0, 0, 0)
        else: ob.location = (0, 0, 0)
        export(ob, os.path.join(OUT, name + '.glb'))
        if tag != 'gun': lod(ob, .3, os.path.join(OUT, name + '_lod1.glb'))
        ob.hide_render = True; ob.hide_set(True)
    log('ALL DONE')
except Exception:
    log('FAILED', traceback.format_exc())
