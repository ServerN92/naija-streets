"""The boutique's second rail for the men: dress every man in the three new outfits (men_cloth.NEW_KEYS_M) and export him.
Runs in a background Blender on naija_men.blend (never saved):  blender --background naija_men.blend --python men_more.py -- [names]
(no --factory-startup: the baggy jeans want MakeHuman's sneakers, so the add-on must load)"""
import bpy, os, sys, time, traceback
M0 = r'C:\Users\user\Documents\naija_rooms\men'
exec(compile(open(os.path.join(M0, 'mload.py'), encoding='utf8').read(), 'mload.py', 'exec'), globals())
only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
names = only or list(MEN)
log('men_more start', names)
for name in names:
    try:
        t = time.time(); dress_m(name, NEW_KEYS_M); export_m(name); log('men_more', name, 'done', round(time.time() - t), 's')
    except Exception: log('men_more failed', name, traceback.format_exc())
log('men_more done')
