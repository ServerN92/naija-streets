"""The boutique's second rail: dress every woman in the seven new outfits (women_cloth.NEW_KEYS) and export her for the game.
Runs in a background Blender on naija_women.blend (never saved):  blender --background naija_women.blend --python women_more.py -- [names]"""
import bpy, os, sys, time, traceback
W0 = r'C:\Users\user\Documents\naija_rooms\women'
exec(compile(open(os.path.join(W0, 'wload.py'), encoding='utf8').read(), 'wload.py', 'exec'), globals())
only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
names = only or list(WOMEN)
log('women_more start', names)
for name in names:
    try:
        t = time.time(); dress(name, NEW_KEYS); export(name); log('women_more', name, 'done', round(time.time() - t), 's')
    except Exception: log('women_more failed', name, traceback.format_exc())
log('women_more done')
