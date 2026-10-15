import bpy, os, math, time
OUT = os.path.join(os.path.expanduser('~'), 'Documents', 'naija_rooms')
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
with bpy.data.libraries.load(os.path.join(OUT, 'family_suite_v2_src.blend'), link=False) as (src, dst): dst.collections = ['Suite']; dst.worlds = list(src.worlds)
SRC = dst.collections[0]; sc = bpy.context.scene; sc.collection.children.link(SRC)
if dst.worlds: sc.world = dst.worlds[0]
for o in SRC.objects:
    o.hide_viewport = False; o.hide_render = False
    if o.type == 'CAMERA': bpy.data.objects.remove(o, do_unlink=True)
cam = bpy.data.cameras.new('TopCam'); cam.type = 'ORTHO'; cam.ortho_scale = 13; co = bpy.data.objects.new('TopCam', cam)
co.location = (0, 0, 2.95); co.rotation_euler = (0, 0, 0); SRC.objects.link(co); sc.camera = co
sc.render.engine = 'CYCLES'; sc.cycles.samples = 48; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 780, 650; sc.render.resolution_percentage = 100
sc.render.filepath = os.path.join(OUT, 'diag_top.png'); sc.render.image_settings.file_format = 'PNG'
t = time.time(); bpy.ops.render.render(write_still=True)
open(os.path.join(OUT, 'export_log.txt'), 'a').write('diag render %d s\n' % (time.time() - t))
