"""Dirty, worn fabric pictures for the rags (how the player starts): tileable cotton with stains, fading and frayed weave.
Writes rag_white.png and rag_khaki.png to the folder given (the women's tex_cloth, which the men share)."""
import os, sys, numpy as np
from PIL import Image
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
N = 512
def fbm(seed, octaves=(4, 8, 16, 32, 64), gains=(1, .6, .4, .25, .15)):
    r = np.random.default_rng(seed); out = np.zeros((N, N))
    for f, g in zip(octaves, gains):
        spec = np.zeros((N, N), complex); k = np.fft.fftfreq(N) * N
        KX, KY = np.meshgrid(k, k); R = np.hypot(KX, KY)
        band = np.exp(-((R - f) / (f * .5)) ** 2)
        spec = band * np.exp(2j * np.pi * r.random((N, N)))
        x = np.real(np.fft.ifft2(spec)); x /= np.abs(x).max() + 1e-9; out += g * x
    return out / np.abs(out).max()
def weave():
    y, x = np.mgrid[0:N, 0:N] / N
    return .5 + .25 * np.sin(2 * np.pi * x * 96) * np.sin(2 * np.pi * y * 96) + .25 * np.sin(2 * np.pi * (x + y) * 48)
def make(name, base, stain, seed):
    b = np.array(base) / 255.; s = np.array(stain) / 255.
    big = fbm(seed); mid = fbm(seed + 1, (16, 32), (1, .5)); fine = fbm(seed + 2, (96, 160), (1, .7))
    st = np.clip((big - .15) * 2.2, 0, 1) ** 1.5                      # large brown stains
    rings = np.clip(1 - np.abs(big - .15) * 18, 0, 1) * .5           # darker edges round them (dried water)
    col = b[None, None] * (1 - st[..., None] * .7) + s[None, None] * st[..., None] * .7
    col *= (1 - rings[..., None] * .35)
    col *= (.86 + .1 * mid[..., None] + .06 * fine[..., None]) * (.9 + .1 * weave()[..., None])
    grime = np.clip(fbm(seed + 3, (6, 12), (1, .6)) * 1.5, 0, 1) * .25   # overall grime
    col *= (1 - grime[..., None])
    Image.fromarray((np.clip(col, 0, 1) ** (1 / 1.0) * 255).astype(np.uint8)).save(os.path.join(OUT, name))
make('rag_white.png', (206, 198, 178), (120, 92, 58), 11)
make('rag_khaki.png', (128, 112, 82), (70, 54, 36), 21)
print('ok')
