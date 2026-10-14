"""Pictures for the game characters, made to match the Blender materials (baked: skin tone, dark irises, braids, coils,
embroidery panels). Everything returns (bytes, mime)."""
import io, math, os, numpy as np
from PIL import Image, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src'); CLOTH = os.path.join(HERE, '..', 'cloth', 'tex')

def enc(im, kind='jpg', q=86):
    b = io.BytesIO()
    if kind == 'jpg': im.convert('RGB').save(b, 'JPEG', quality=q, optimize=True, progressive=False); return b.getvalue(), 'image/jpeg'
    im.save(b, 'PNG', optimize=True); return b.getvalue(), 'image/png'

def lin(a): return np.where(a <= .04045, a / 12.92, ((a + .055) / 1.055) ** 2.4)
def srgb(a): a = np.clip(a, 0, 1); return np.where(a <= .0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - .055)
def arr(im): return np.asarray(im.convert('RGB'), np.float32) / 255.
def img(a): return Image.fromarray((np.clip(a, 0, 1) * 255 + .5).astype(np.uint8))

def skin(path, tone, value, size=1024):
    """the Blender skin: picture -> saturation .85, value x 'value' (in linear light) -> times the skin tone"""
    a = lin(arr(Image.open(path).resize((size, size), Image.LANCZOS)))
    mx = a.max(2, keepdims=True); mn = a.min(2, keepdims=True)
    grey = mx                                   # HSV value
    a = grey + (a - grey) * .85                 # less saturation, same value
    a = a * value * np.array(tone)[None, None]
    return enc(img(srgb(a)), 'jpg', 88)

def normal(path, size=1024): return enc(Image.open(path).convert('RGB').resize((size, size), Image.LANCZOS), 'jpg', 90)

def eyes(path, size=512):
    """MakeHuman's brown eye, the iris turned a deep brown (same mask as in Blender)"""
    a = arr(Image.open(path).resize((size, size), Image.LANCZOS)); la = lin(a)
    bw = la @ np.array([.2126, .7152, .0722])
    f = np.clip((.5 - bw) / (.5 - .22), 0, 1)[..., None]
    dark = la * np.array([.3, .17, .1])
    return enc(img(srgb(la * (1 - f) + dark * f)), 'jpg', 90)

def strands(path, size=256):
    """brows / lashes: keep only the shape (alpha); the colour comes from the material"""
    im = Image.open(path).convert('RGBA').resize((size, size), Image.LANCZOS)
    a = np.asarray(im)[..., 3]
    out = np.zeros((size, size, 4), np.uint8); out[..., :3] = 255; out[..., 3] = a
    return enc(Image.fromarray(out, 'RGBA'), 'png')

def coils(size=256, cells=10, seed=7):
    """short afro: each texel says how high the coil rises there (alpha); the fuzz shells cut it at rising heights"""
    rng = np.random.default_rng(seed)
    pts = rng.random((cells * cells, 2))
    yy, xx = np.mgrid[0:size, 0:size] / size
    d = np.full((size, size), 9.)
    for ox in (-1, 0, 1):
        for oy in (-1, 0, 1):
            for p in pts:
                d = np.minimum(d, np.hypot(xx - p[0] - ox, yy - p[1] - oy))
    h = np.clip(1 - d * cells / .75, 0, 1) ** .8
    n = np.array(Image.fromarray((rng.random((size // 8, size // 8)) * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC)) / 255.
    base = np.array([.012, .009, .008]); lift = .6 + 1.4 * h[..., None] + .3 * (n[..., None] - .5)
    col = srgb(base * lift)
    out = np.zeros((size, size, 4), np.uint8); out[..., :3] = (col * 255).astype(np.uint8); out[..., 3] = (np.clip(h, 0, 1) * 255).astype(np.uint8)
    return enc(Image.fromarray(out, 'RGBA'), 'png')

def braid(w=64, h=128):
    """three strands crossing every stitch (the Blender braid shader, baked) + its normal map"""
    yy, xx = np.mgrid[0:h, 0:w]
    U = (xx + .5) / w; Vv = 1 - (yy + .5) / h
    ab = np.abs(np.mod(U * 2, 1) - .5); tri = np.abs(np.mod(Vv + ab, 1) - .5)
    base = np.array([.012, .009, .008]); t = np.clip(tri / .5, 0, 1)[..., None]
    col = srgb(base * (.45 + (2.6 - .45) * t))
    hgt = tri / .5
    gx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)); gy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0))
    nrm = np.stack([-gx * 1.5, gy * 1.5, np.ones_like(gx)], -1); nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    return enc(img(col), 'png'), enc(img(nrm * .5 + .5), 'png')

def height_normal(path, size=512, k=2.):
    hgt = np.asarray(Image.open(path).convert('L').resize((size, size), Image.LANCZOS), np.float32) / 255.
    gx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)); gy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0))
    nrm = np.stack([-gx * k, gy * k, np.ones_like(gx)], -1); nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    return enc(img(nrm * .5 + .5), 'jpg', 90)

def fabric(name, size=1024, q=86):
    return enc(Image.open(os.path.join(CLOTH, name)).convert('RGB').resize((size, size), Image.LANCZOS), 'jpg', q)

def joggers_stripes(w=512, h=64, base='#16161a', stripe='#eeeeee'):
    """design-uv picture for the legs: two stripes down the outer side (U = .25 on both legs)"""
    c0 = np.array([int(base[i:i + 2], 16) for i in (1, 3, 5)]) / 255.; c1 = np.array([int(stripe[i:i + 2], 16) for i in (1, 3, 5)]) / 255.
    U = (np.arange(w) + .5) / w
    m = (np.abs(np.abs(U - .25) - .016) < .005).astype(float)
    row = c0[None] * (1 - m[:, None]) + c1[None] * m[:, None]
    return enc(img(np.repeat(row[None], h, 0)), 'png')

def emb_panel(emb, base_hex, thread_hex, size_px=1024, damask=None, damask_tile_px=None):
    """the front panel (Emb uv): plain or damask cloth with the embroidery on top"""
    e = Image.open(os.path.join(CLOTH, emb)).convert('RGBA').resize((size_px, size_px), Image.LANCZOS)
    a = np.asarray(e, np.float32)[..., 3:4] / 255.
    c0 = np.array([int(base_hex[i:i + 2], 16) for i in (1, 3, 5)]) / 255.; c1 = np.array([int(thread_hex[i:i + 2], 16) for i in (1, 3, 5)]) / 255.
    if damask:
        d = Image.open(os.path.join(CLOTH, damask)).convert('RGB').resize((damask_tile_px, damask_tile_px), Image.LANCZOS)
        reps = size_px // damask_tile_px + 2
        big = Image.new('RGB', (damask_tile_px * reps, damask_tile_px * reps))
        for i in range(reps):
            for j in range(reps): big.paste(d, (i * damask_tile_px, j * damask_tile_px))
        bg = np.asarray(big.crop((0, 0, size_px, size_px)), np.float32) / 255.
    else: bg = np.broadcast_to(c0, (size_px, size_px, 3))
    out = bg * (1 - a) + c1[None, None] * a
    return enc(img(out), 'jpg', 88)

def shoe(path, size=512): return enc(Image.open(path).convert('RGB').resize((size, size), Image.LANCZOS), 'jpg', 85)
