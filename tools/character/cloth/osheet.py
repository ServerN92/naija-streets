import sys
from PIL import Image
i = sys.argv[1]; out = sys.argv[2]
def L(f, w, h): return Image.open(f).convert('RGB').resize((w, h), Image.LANCZOS)
W = Image.new('RGB', (1500, 1000 + 400), (30, 30, 30))
W.paste(L(f'outfit{i}_front.png', 750, 500), (0, 0)); W.paste(L(f'outfit{i}_34.png', 750, 500), (750, 0))
W.paste(L(f'outfit{i}_back.png', 750, 500), (0, 500))
for k, n in enumerate(['Tunde', 'Amaka', 'Ada']): W.paste(L(f'{n}_o{i}.png', 250, 312), (750 + k * 250, 500))
W = W.crop((0, 0, 1500, 1000)); W.save(out, quality=88)
