"""Fabric pictures for Naija Streets clothes (all original designs). Tileable where they repeat."""
import numpy as np, math, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont
OUT = os.path.join(os.path.dirname(__file__), 'tex'); os.makedirs(OUT, exist_ok=True)
N = 1024
yy, xx = np.mgrid[0:N, 0:N] / N

def save(name, a, mode='RGB'):
    a = np.clip(a, 0, 1)
    Image.fromarray((a * 255).astype(np.uint8), mode).save(os.path.join(OUT, name)); print('wrote', name)

def hexrgb(h): return np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])

def wax_noise(seed, scale=6):
    """the crackle / uneven dye of real wax print"""
    rng = np.random.default_rng(seed)
    g = rng.random((scale, scale))
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((N, N), Image.BICUBIC)
    a = np.array(im) / 255.
    fine = np.array(Image.fromarray((rng.random((N // 4, N // 4)) * 255).astype(np.uint8)).resize((N, N), Image.BILINEAR)) / 255.
    return a * .6 + fine * .4

def tile_dist(cx, cy):
    """distance to a point in a tiling (wraps), in tile units"""
    dx = np.abs(xx - cx); dx = np.minimum(dx, 1 - dx); dy = np.abs(yy - cy); dy = np.minimum(dy, 1 - dy)
    return np.hypot(dx, dy), dx, dy

def ankara_circles(name, bg, c1, c2, c3, seed):
    """bold concentric rings and dotted halos on a deep ground"""
    col = np.ones((N, N, 3)) * hexrgb(bg)
    pts = [(.25, .25, .2), (.75, .75, .2), (.75, .25, .11), (.25, .75, .11), (0, .5, .07), (.5, 0, .07), (.5, .5, .06)]
    for (cx, cy, R) in pts:
        d, _, _ = tile_dist(cx, cy)
        rings = (np.sin(d / R * math.pi * 4.5) > 0) & (d < R)
        col[rings] = hexrgb(c1)
        col[(d < R * .32)] = hexrgb(c2)
        col[(d < R * .15)] = hexrgb(c3)
        halo = (d > R * 1.05) & (d < R * 1.18)
        ang = np.arctan2(yy - cy, xx - cx)
        dots = halo & (np.sin(ang * 26) > .3)
        col[dots] = hexrgb(c2)
    # leaf strokes in the gaps
    for (cx, cy) in [(.5, .25), (.0, .25), (.5, .75), (.0, .75)]:
        d, dx, dy = tile_dist(cx, cy)
        leaf = (np.abs(dx) / .085) ** 2 + (np.abs(dy) / .03) ** 2 < 1
        col[leaf] = hexrgb(c3)
        vein = leaf & (np.abs(dy) < .004)
        col[vein] = hexrgb(bg)
    n = wax_noise(seed)
    col *= (.86 + .2 * n)[..., None]
    save(name, col)

def ankara_diamonds(name, bg, c1, c2, c3, seed):
    """diamonds and zigzags, with a crackled dye"""
    col = np.ones((N, N, 3)) * hexrgb(bg)
    u = (xx * 4) % 1; v = (yy * 4) % 1
    dia = np.abs(u - .5) + np.abs(v - .5)
    col[dia < .42] = hexrgb(c1)
    col[dia < .3] = hexrgb(bg)
    col[dia < .22] = hexrgb(c2)
    col[dia < .1] = hexrgb(c3)
    zig = np.abs(((xx * 8) % 1) - .5) * .25
    band = np.abs(((yy * 4) % 1) - zig - .0) < .02
    col[band & (dia > .42)] = hexrgb(c3)
    dots = (np.hypot(u - 0, v - 0) < .07) | (np.hypot(u - 1, v - 0) < .07) | (np.hypot(u, v - 1) < .07) | (np.hypot(u - 1, v - 1) < .07)
    col[dots] = hexrgb(c2)
    n = wax_noise(seed)
    col *= (.86 + .2 * n)[..., None]
    save(name, col)

def ankara_fans(name, bg, c1, c2, c3, seed):
    """overlapping fans / scallops (a favourite Lagos party print)"""
    col = np.ones((N, N, 3)) * hexrgb(bg)
    rows = 5
    for r in range(rows * 2 + 2):
        for c in range(rows + 2):
            cx = (c + (.5 if r % 2 else 0)) / rows; cy = r / (rows * 2) + .0
            d, dx, dy = tile_dist(cx % 1, cy % 1)
            R = .5 / rows * 1.0
            below = ((yy - cy) % 1) < .5
            m = (d < R)
            ring = (np.sin(d / R * math.pi * 5) > 0)
            col[m & ring] = hexrgb(c1)
            col[m & ~ring] = hexrgb(c2)
            col[d < R * .25] = hexrgb(c3)
    n = wax_noise(seed)
    col *= (.86 + .2 * n)[..., None]
    save(name, col)

def denim():
    rng = np.random.default_rng(5)
    # twill: diagonal ridges + slubby threads
    tw = (np.sin((xx + yy) * N * math.pi / 3.2) * .5 + .5)
    slub = np.array(Image.fromarray((rng.random((N, 32)) * 255).astype(np.uint8)).resize((N, N), Image.BILINEAR)) / 255.
    base = hexrgb('#2c4677')
    light = hexrgb('#7d97c2')
    a = .25 + .35 * tw + .25 * slub + .15 * rng.random((N, N))
    col = base[None, None] * (1 - a[..., None] * .5) + light[None, None] * (a[..., None] * .5)
    save('denim.png', col)
    save('denim_h.png', np.stack([tw * .7 + .3 * slub] * 3, -1))

def damask(name, base, hi, seed=3):
    """tone-on-tone brocade: the pattern shows in shine, so it also writes a roughness map"""
    col = np.ones((N, N, 3)) * hexrgb(base)
    m = np.zeros((N, N), bool)
    for (cx, cy) in [(.25, .25), (.75, .75)]:
        d, dx, dy = tile_dist(cx, cy)
        ang = np.arctan2(dy, dx)
        petal = d < .17 * (.55 + .45 * np.abs(np.cos(ang * 2.5)))
        m |= petal & ~(d < .05)
        m |= (d < .025)
    for (cx, cy) in [(.75, .25), (.25, .75)]:
        d, dx, dy = tile_dist(cx, cy)
        m |= (np.abs(dx) + np.abs(dy) < .11) & ~(np.abs(dx) + np.abs(dy) < .085)
        m |= (np.abs(dx) + np.abs(dy) < .04)
    col[m] = hexrgb(hi)
    save(name + '.png', col)
    save(name + '_rough.png', np.stack([np.where(m, .25, .75)] * 3, -1))

def lace(name, base, seed=9):
    """cord lace: raised floral cord on a fine net"""
    col = np.ones((N, N, 3)) * hexrgb(base)
    h = np.zeros((N, N))
    net = ((np.sin(xx * N * math.pi / 6) > .6) | (np.sin(yy * N * math.pi / 6) > .6)).astype(float)
    h += net * .25
    for (cx, cy, R) in [(.25, .25, .13), (.75, .75, .13), (.75, .25, .07), (.25, .75, .07)]:
        d, dx, dy = tile_dist(cx, cy)
        ang = np.arctan2(dy, dx)
        flower = np.abs(d - R * (.6 + .4 * np.abs(np.cos(ang * 3)))) < .006
        h[flower] = 1
        h[np.abs(d - R * .3) < .005] = 1
        h[d < R * .12] = .8
    h = np.array(Image.fromarray((h * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))) / 255.
    col = col * (.82 + .25 * h[..., None])
    save(name + '.png', col)
    save(name + '_h.png', np.stack([h] * 3, -1))

def font(sz):
    for f in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf']:
        if os.path.exists(f): return ImageFont.truetype(f, sz)
    return ImageFont.load_default()

def jersey():
    """wrap-round picture for the torso: U = round the body (front in the middle), V = hem (0) to neck (1)"""
    W, H = 2048, 1024
    im = Image.new('RGB', (W, H), '#0e8a44'); d = ImageDraw.Draw(im)
    # chevrons across the front
    for k in range(6):
        y = 380 + k * 70
        d.polygon([(W * .33, y), (W * .5, y + 120), (W * .67, y), (W * .67, y + 26), (W * .5, y + 146), (W * .33, y + 26)], fill='#0b7a3b')
    # white side panels
    for x0 in (W * .2, W * .8):
        d.rectangle([x0 - 40, 0, x0 + 40, H], fill='#f4f4ef')
    # collar trim and hem band
    d.rectangle([0, 0, W, 30], fill='#f4f4ef')
    # back number and name: seen from behind, U runs right-to-left, so they are drawn mirrored across the seam
    back = Image.new('RGBA', (900, H), (0, 0, 0, 0)); bd = ImageDraw.Draw(back)
    bd.text((450, 500), '10', fill='#f4f4ef', font=font(330), anchor='mm')
    bd.text((450, 250), 'NAIJA', fill='#f4f4ef', font=font(90), anchor='mm')
    im.paste(back.crop((450, 0, 900, H)), (0, 0), back.crop((450, 0, 900, H)))
    im.paste(back.crop((0, 0, 450, H)), (W - 450, 0), back.crop((0, 0, 450, H)))
    # small chest badge (an original eagle-less star mark)
    cx, cy = W * .56, 300
    pts = [(cx + 38 * math.cos(a) * (1 if i % 2 == 0 else .45), cy + 38 * math.sin(a) * (1 if i % 2 == 0 else .45)) for i, a in enumerate(np.linspace(-math.pi / 2, 3 * math.pi / 2, 11)[:-1])]
    d.polygon(pts, fill='#f4f4ef')
    im.save(os.path.join(OUT, 'jersey.png')); print('wrote jersey.png')

def embroidery(name, size_m, motif, col='#d8b25a'):
    """RGBA overlay in a front-projected square of size_m metres: x across (-1..1), y from the neck down."""
    S = 1024; im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    c = tuple(int(col[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
    sc = S / size_m
    X = lambda x: S / 2 + x * sc; Y = lambda y: y * sc       # y metres below the top
    w = max(3, int(.0065 * sc))
    if motif == 'senator':
        # a placket line of stitched loops down the centre, and a neck band
        for side in (-1, 1):
            d.line([(X(side * .012), Y(.06)), (X(side * .012), Y(.32))], fill=c, width=w)
        for k in range(14):
            y = .07 + k * .018
            d.ellipse([X(-.008), Y(y), X(.008), Y(y + .012)], outline=c, width=max(1, w // 2))
        for k in range(40):
            a = k / 39 * math.pi
            x = math.cos(a) * .095; y = .02 + math.sin(a) * .06
            d.ellipse([X(x) - w, Y(y) - w, X(x) + w, Y(y) + w], fill=c)
    elif motif == 'agbada':
        # the big chest piece: a spiral medallion under the neck and stitched swirls out to the sides
        for r in np.linspace(.03, .16, 8):
            d.arc([X(-r), Y(.18 - r), X(r), Y(.18 + r)], 200, 340, fill=c, width=w)
        for side in (-1, 1):
            for k in range(6):
                cx = side * (.09 + k * .025); cy = .25 + k * .035
                d.ellipse([X(cx) - .018 * sc, Y(cy) - .018 * sc, X(cx) + .018 * sc, Y(cy) + .018 * sc], outline=c, width=w)
            d.line([(X(side * .02), Y(.08)), (X(side * .06), Y(.45))], fill=c, width=w)
        d.rectangle([X(-.1), Y(.42), X(.1), Y(.44)], fill=c)
        for k in range(9):
            x = -.09 + k * .0225
            d.polygon([(X(x), Y(.44)), (X(x + .011), Y(.47)), (X(x + .0225), Y(.44))], outline=c)
    im.save(os.path.join(OUT, name)); print('wrote', name)

if __name__ == '__main__':
    ankara_circles('ankara_a.png', '#1d2a6b', '#f28c1e', '#ffd23f', '#e8452c', 1)      # indigo, orange, yellow
    ankara_diamonds('ankara_b.png', '#5b1a6e', '#f2b705', '#26a69a', '#f25c54', 2)     # purple, gold, teal
    ankara_fans('ankara_c.png', '#0d6e6e', '#f7c948', '#e2533c', '#fdf4e3', 3)          # teal, gold, red
    ankara_circles('ankara_d.png', '#8a1c2b', '#f6c544', '#1f9e89', '#ffffff', 4)       # wine, gold, green
    denim()
    damask('damask_cream', '#e9e0cc', '#f3ecdc')
    damask('damask_gold', '#c99a3c', '#e8c26a')
    damask('damask_wine', '#6d1630', '#8a2340')
    lace('lace_peach', '#e9b89a')
    lace('lace_white', '#efe9e1')
    jersey()
    embroidery('emb_senator.png', .4, 'senator', '#d8b25a')
    embroidery('emb_agbada.png', .55, 'agbada', '#c9a24a')
