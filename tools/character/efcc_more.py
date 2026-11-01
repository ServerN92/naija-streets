"""Dress the EFCC officers in their uniform and export them for the game. Background Blender, the file is never saved:
  blender --background naija_men.blend   --python efcc_more.py -- m [names]
  blender --background naija_women.blend --python efcc_more.py -- f [names]"""
import bpy, os, sys, time, traceback
R0 = r'C:\Users\user\Documents\naija_rooms'
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['m']
male = args[0] == 'm'
ld = os.path.join(R0, 'men', 'mload.py') if male else os.path.join(R0, 'women', 'wload.py')
exec(compile(open(ld, encoding='utf8').read(), os.path.basename(ld), 'exec'), globals())
exec(compile(open(os.path.join(R0, 'efcc_cloth.py'), encoding='utf8').read(), 'efcc_cloth.py', 'exec'), globals())
names = args[1:] or (['Sgt Okon', 'Chidi', 'Musa'] if male else ['Sgt Halima', 'Bisi'])
log('efcc_more start', names)
for name in names:
    try:
        t = time.time()
        (dress_m if male else dress)(name, (NEW_KEYS_M if male else NEW_KEYS) + ['efcc']); add_prints(name)
        (export_m if male else export)(name); log('efcc_more', name, 'done', round(time.time() - t), 's')
    except Exception: log('efcc_more failed', name, traceback.format_exc())
log('efcc_more done')
