"""Seamless tile textures for the flat (floor, bathroom, kitchen, granite)."""
import numpy as np
from PIL import Image
R = np.random.default_rng(7)
def pnoise(n, sigma):   # periodic smooth noise, 0..1
    w = R.standard_normal((n, n)); f = np.fft.fftfreq(n)[:, None]**2 + np.fft.fftfreq(n)[None, :]**2
    a = np.real(np.fft.ifft2(np.fft.fft2(w) * np.exp(-f * (n / sigma)**2 * 2)))
    return (a - a.min()) / (a.max() - a.min())
def fbm(n, sig=(64, 24, 8)): return sum(pnoise(n, s) * (0.6**i) for i, s in enumerate(sig)) / sum(0.6**i for i in range(len(sig)))
def grout(n, cols, rows, px, offset_rows=False):
    y, x = np.mgrid[0:n, 0:n]; tw, th = n / cols, n / rows
    row = (y // th).astype(int); xs = x + (row % 2) * (tw / 2 if offset_rows else 0)
    gx = np.minimum(xs % tw, tw - xs % tw); gy = np.minimum(y % th, th - y % th)
    d = np.minimum(gx, gy); tid = row * 1000 + (xs // tw).astype(int) % cols
    return d, tid
def veins(n, k=3.0):
    y, x = np.mgrid[0:n, 0:n] / n; t = fbm(n, (40, 16, 6))
    v = np.abs(np.sin((x * 2 + y * 1) * np.pi * 2 + t * 9 * k / 3))
    return np.clip(1 - v / 0.06, 0, 1) * (pnoise(n, 30) > .45)
def save(a, name, q=84):
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(name, quality=q, optimize=True, progressive=True); print(name)
def tilemap(n, cols, rows, base, var, groutc, gpx, vein=0, offset=False, speck=0, bevel=0):
    d, tid = grout(n, cols, rows, gpx, offset)
    ids = np.unique(tid); shade = {i: R.uniform(-var, var) for i in ids}
    s = np.vectorize(shade.get)(tid)
    img = np.ones((n, n, 3)) * np.array(base, float)
    img += (s[..., None] + (fbm(n) - .5)[..., None] * var * 1.4)
    if vein: img -= veins(n)[..., None] * vein
    if speck:
        sp = R.random((n, n)); img[sp > 1 - speck] += 45; img[sp < speck] -= 35
    if bevel: img -= (np.clip(1 - (d - gpx) / bevel, 0, 1) ** 2)[..., None] * 22
    m = (d < gpx)[..., None]; img = np.where(m, np.array(groutc, float), img)
    return img
save(tilemap(1024, 2, 2, (226, 216, 196), 5, (184, 176, 162), 2.2, vein=26), 'tile_floor.jpg')          # 60x60 cream porcelain, 1.2 m
save(tilemap(512, 2, 1, (226, 224, 220), 4, (196, 194, 190), 1.6, vein=22), 'tile_bath.jpg')            # 30x60 light marble, 0.6 m
save(tilemap(512, 2, 2, (78, 78, 80), 4, (128, 126, 122), 1.6, speck=.02), 'tile_bathfloor.jpg')        # 30x30 charcoal, 0.6 m
save(tilemap(512, 4, 8, (238, 238, 233), 3, (204, 202, 196), 1.6, offset=True, bevel=5), 'tile_kitchen.jpg')  # subway 15x7.5, 0.6 m
g = np.ones((512, 512, 3)) * np.array((42, 40, 38), float) + (fbm(512) - .5)[..., None] * 20
sp = R.random((512, 512)); g[sp > .965] = (118, 110, 100); g[sp < .03] = (16, 16, 16); g[(sp > .5) & (sp < .515)] = (160, 150, 138)
save(g, 'granite.jpg', 80)                                                                               # dark granite, 1 m
