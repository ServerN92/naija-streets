import os
W0 = r'C:\Users\user\Documents\naija_rooms\women'; M0 = r'C:\Users\user\Documents\naija_rooms\men'
for _f in ('women_lib.py', 'face_transfer.py', 'head_swap.py', 'hair_fit.py', 'headwear.py', 'women_cloth.py', 'women_export.py'):
    exec(compile(open(os.path.join(W0, _f), encoding='utf8').read(), _f, 'exec'), globals())
for _f in ('men_lib.py', 'men_cloth.py', 'build_men.py'):
    _p = os.path.join(M0, _f)
    if os.path.exists(_p): exec(compile(open(_p, encoding='utf8').read(), _f, 'exec'), globals())
