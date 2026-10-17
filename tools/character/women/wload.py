import os
W0 = r'C:\Users\user\Documents\naija_rooms\women'
for _f in ('women_lib.py', 'face_transfer.py', 'head_swap.py', 'hair_fit.py', 'headwear.py', 'women_cloth.py', 'women_export.py'):
    exec(compile(open(os.path.join(W0, _f), encoding='utf8').read(), _f, 'exec'), globals())
