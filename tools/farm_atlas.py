"""Build assets/models/fm_detail.jpg: the farm's photo-detail atlas (4 x 2 cells of 512 px, all CC0 from Poly Haven).
Each cell is normalised to a mean of 0.5 grey so the game shader (farmDetail in src/game.js) multiplies it onto the model's
own colours: only the photo's pattern (grain, rust, cracks, blades) is added, the colour stays the model's.
Cell k (0..7) is material class k+1 (blender_farm.py CLS_NAMES).   python3 tools/farm_atlas.py TEXDIR"""
import sys, numpy as np
from PIL import Image, ImageFilter
SRC = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/uploads/naija_rooms/tex/farm'
N = 512
# name, luminance contrast (std), how much of the photo's own colour to keep, blur
CELLS = [('raw_plank_wall', .085, .6, 0), ('rusty_metal_sheet', .075, .45, 0), ('clay_plaster', .05, .3, 1.2), ('concrete_wall_007', .065, .3, 0),
         ('red_laterite_soil_stones', .08, .35, 0), ('leafy_grass', .09, .55, 0), ('cracked_red_ground', .09, .3, 0), None]
out = np.full((N * 2, N * 4, 3), .5, np.float32)
for k, c in enumerate(CELLS):
    if not c: continue
    name, std, keep, blur = c
    im = Image.open(f'{SRC}/{name}.jpg').convert('RGB').resize((N, N), Image.LANCZOS)
    if blur: im = im.filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(im, np.float32) / 255
    a = a - a.reshape(-1, 3).mean(0)                      # zero mean per channel
    L = a @ np.array([.3, .59, .11], np.float32)
    chroma = a - L[..., None]
    s = std / max(1e-6, L.std())
    cell = .5 + (L[..., None] + chroma * keep) * s
    x, y = k % 4, k // 4
    out[y * N:(y + 1) * N, x * N:(x + 1) * N] = cell
Image.fromarray((np.clip(out, 0, 1) * 255 + .5).astype(np.uint8)).save('assets/models/fm_detail.jpg', quality=88)
print('atlas', out.shape)
