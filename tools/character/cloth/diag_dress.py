# quick: re-dress the characters already in the scene and render the outfits (no rebuild of bodies)
exec(open(os.path.join(NC, 'dress.py'), encoding='utf-8').read(), globals())
people = {}
for nm in PEOPLE:
    rig = bpy.data.objects.get(nm); body = bpy.data.objects.get(nm + '.body')
    if rig and body: people[nm] = (rig, body)
log('re-dressing', list(people))
dress_all(people)
render_outfits(people)
try: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(NC, 'naija_character.blend')); log('saved')
except Exception as e: log('save failed', e)
log('DIAG DONE')
