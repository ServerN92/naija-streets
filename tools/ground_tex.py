"""Make the ground and cloud pictures: red laterite earth with stones and dry grass, a tropical lawn, and a cloud layer.

    python3 tools/ground_tex.py        # writes into assets/models/, then run tools/manifest.py

Every picture tiles seamlessly (all noise is periodic and every stone and blade wraps around the edges).
Each ground gets a colour picture (.jpg) and a bump picture (_n.jpg, a normal map) so stones and tufts catch the sun.
Needs numpy and Pillow. The same seed always gives the same pictures.
"""
import os, numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'assets', 'models')
S = 1024
rng = np.random.default_rng(23)


def fbm(size, octaves, seed, power=2.0):
    """Periodic fractal noise in 0..1 made by colouring white noise in frequency space (it tiles by construction)."""
    r = np.random.default_rng(seed)
    f = np.fft.fftfreq(size)
    k = np.sqrt(f[:, None] ** 2 + f[None, :] ** 2)
    k[0, 0] = 1
    hi = 2.0 ** octaves / size                       # finest detail kept: 2^octaves waves across the picture
    amp = np.where(k > hi, 0, k ** (-power / 2))
    amp[0, 0] = 0
    ph = np.fft.fft2(r.standard_normal((size, size)))
    n = np.real(np.fft.ifft2(ph * amp))
    n -= n.min(); n /= n.max()
    return n


def blur(a, r):
    """Periodic box blur (three passes ~ gaussian)."""
    for _ in range(3):
        for ax in (0, 1):
            acc = np.zeros_like(a)
            for d in range(-r, r + 1):
                acc += np.roll(a, d, axis=ax)
            a = acc / (2 * r + 1)
    return a


def stamp(h, col, cx, cy, rx, ry, ang, height, c, rough=0.0):
    """A stone: an elliptic dome added to the height map and painted, wrapping round the picture edges."""
    R = int(max(rx, ry)) + 2
    ys, xs = np.mgrid[-R:R + 1, -R:R + 1].astype(np.float32)
    ca, sa = np.cos(ang), np.sin(ang)
    u = (xs * ca + ys * sa) / rx
    v = (-xs * sa + ys * ca) / ry
    d = u * u + v * v
    if rough:
        d = d * (1 + rough * np.sin(np.arctan2(v, u) * 5 + cx))
    m = d < 1
    dome = np.sqrt(np.clip(1 - d, 0, 1)) * height
    iy = (np.arange(-R, R + 1) + int(cy)) % S
    ix = (np.arange(-R, R + 1) + int(cx)) % S
    sub = h[np.ix_(iy, ix)]
    h[np.ix_(iy, ix)] = np.where(m, np.maximum(sub, dome + sub * .3), sub)
    shade = (0.82 + 0.3 * np.sqrt(np.clip(1 - d, 0, 1)))[..., None]   # rounded: brighter in the middle
    cs = col[np.ix_(iy, ix)]
    col[np.ix_(iy, ix)] = np.where(m[..., None], np.array(c, np.float32) * shade, cs)


def blade(h, col, x, y, length, ang, width, c, height):
    """A blade of grass: a short tapering stroke, wrapping round the edges."""
    n = max(2, int(length))
    for i in range(n):
        t = i / n
        px = int(x + np.cos(ang) * i) % S
        py = int(y + np.sin(ang) * i) % S
        w = max(1, int(width * (1 - t)))
        for o in range(-(w // 2), w - w // 2):
            qx, qy = (px + int(-np.sin(ang) * o)) % S, (py + int(np.cos(ang) * o)) % S
            col[qy, qx] = np.array(c, np.float32) * (0.75 + 0.45 * t)
            h[qy, qx] = max(h[qy, qx], height * (1 - t * .5))


def normal_map(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.stack([-dx, dy, np.ones_like(h)], -1)   # three.js normal maps: +Y up in the picture
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return ((n * .5 + .5) * 255).astype(np.uint8)


def save(col, h, name, strength, ao=0.55):
    # ambient occlusion from the bumps: hollows a bit darker
    cav = np.clip((blur(h, 2) - h) * 2.5, 0, 1)
    c = col * (1 - ao * cav)[..., None]
    Image.fromarray(np.clip(c, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name + '.jpg'), quality=86, optimize=True, progressive=True)
    Image.fromarray(normal_map(h, strength)).resize((S // 2, S // 2), Image.LANCZOS).save(os.path.join(OUT, name + '_n.jpg'), quality=88, optimize=True)   # bumps need less detail: half size
    print(name, os.path.getsize(os.path.join(OUT, name + '.jpg')) // 1024, 'KB +', os.path.getsize(os.path.join(OUT, name + '_n.jpg')) // 1024, 'KB')


GRAVEL = [[150, 120, 95], [185, 150, 120], [120, 95, 80], [205, 175, 140], [128, 72, 44], [160, 152, 140]]


def laterite():
    """Mushin's red earth: compacted laterite, dusty patches, tyre-smoothed spots, gravel, stones and dry grass tufts."""
    big, mid, fine = fbm(S, 3, 1), fbm(S, 6, 2), fbm(S, 9, 3, 1.2)
    base = np.array([138, 84, 52], np.float32)        # laterite red-brown
    dusty = np.array([176, 132, 96], np.float32)      # dry dust on top
    dark = np.array([96, 56, 34], np.float32)         # damp, packed earth
    t = np.clip((big - .45) * 2.4, 0, 1)[..., None]
    col = base * (1 - t) + dusty * t
    d = np.clip((mid - .6) * 3, 0, 1)[..., None]
    col = col * (1 - d * .6) + dark * d * .6
    col *= (0.86 + 0.28 * fine)[..., None]
    col += (rng.standard_normal((S, S, 1)) * 7)       # grain
    h = fine * .35 + mid * .5
    # gravel: thousands of tiny stones
    for _ in range(5200):
        r = rng.uniform(1.2, 3.2)
        g = rng.uniform(.55, 1.0)
        c = [v * g for v in GRAVEL[rng.integers(len(GRAVEL))]]
        stamp(h, col, rng.uniform(0, S), rng.uniform(0, S), r, r * rng.uniform(.6, 1), rng.uniform(0, 3.14), r * .5, c)
    # bigger stones, laterite nodules and broken concrete
    for _ in range(170):
        r = rng.uniform(4, 11)
        kind = rng.random()
        c = ([118, 66, 40] if kind < .45 else [165, 158, 148] if kind < .75 else [92, 84, 76])
        k = rng.uniform(.8, 1.15); c = [v * k for v in c]
        stamp(h, col, rng.uniform(0, S), rng.uniform(0, S), r, r * rng.uniform(.55, .95), rng.uniform(0, 3.14), r * .55, c, rough=.12)
    # dry grass tufts in clumps where the ground is less trodden
    for _ in range(120):
        cx, cy = rng.uniform(0, S), rng.uniform(0, S)
        if mid[int(cy), int(cx)] < .45:
            continue
        green = rng.random() < .45
        for _ in range(rng.integers(14, 40)):
            ang = rng.uniform(0, 6.28)
            c = ([86, 112, 46] if green else [158, 140, 82])
            k = rng.uniform(.75, 1.15); c = [v * k for v in c]
            blade(h, col, cx + rng.normal(0, 5), cy + rng.normal(0, 5), rng.uniform(5, 13), ang, rng.uniform(1.5, 3), c, .9)
    save(col, h, 'ground_laterite', 3.2)


def lawn():
    """Tropical lawn of a school field or park: mixed green and sun-dried grass with bare red earth showing through."""
    big, mid, fine = fbm(S, 3, 11), fbm(S, 6, 12), fbm(S, 9, 13, 1.2)
    green = np.array([74, 110, 44], np.float32)
    dry = np.array([150, 140, 78], np.float32)
    earth = np.array([132, 86, 56], np.float32)
    t = np.clip((big - .5) * 2.2, 0, 1)[..., None]
    col = green * (1 - t) + dry * t
    bare = np.clip((mid - .72) * 5, 0, 1)[..., None]
    col = col * (1 - bare) + earth * bare
    col *= (0.8 + 0.35 * fine)[..., None]
    h = fine * .3
    for _ in range(26000):
        x, y = rng.uniform(0, S), rng.uniform(0, S)
        if bare[int(y), int(x), 0] > .6 and rng.random() < .85:
            continue
        mix = big[int(y), int(x)]
        c = np.array([70, 112, 40]) * (1 - mix) + np.array([168, 156, 88]) * mix
        c = c * rng.uniform(.65, 1.25)
        blade(h, col, x, y, rng.uniform(3, 8), rng.uniform(0, 6.28), rng.uniform(1, 2.2), c, .7)
    for _ in range(500):
        r = rng.uniform(1.2, 3)
        g = rng.uniform(.6, 1)
        stamp(h, col, rng.uniform(0, S), rng.uniform(0, S), r, r * .8, rng.uniform(0, 3), r * .5, [150 * g, 120 * g, 95 * g])
    save(col, h, 'grass_lawn', 2.6, ao=.65)


def clouds():
    """A layer of puffy fair-weather cumulus seen from below: dense centres a little greyer, soft bright edges.
    The alpha is the cloud; the colour carries the shading. Tiles seamlessly."""
    n = fbm(512, 4, 31, 3.0) * .75 + fbm(512, 6, 32, 2.4) * .25
    cells = fbm(512, 3, 33)                            # big gaps of blue sky between cloud groups
    d = np.clip((n - .5) * 3.0 + (cells - .5) * 1.4, 0, 1)
    d = blur(d, 1) ** 1.2
    thick = blur(d, 3)
    shade = 1 - .2 * np.clip(thick * 1.3, 0, 1)        # thick middles a bit grey
    rim = np.clip(d - thick, 0, 1) * .6                # bright, sun-lit edges
    c = np.clip(shade + rim, 0, 1)
    rgb = np.stack([c * 252, c * 250, c * 247], -1)
    a = np.clip(d * 1.25, 0, 1) * 255
    img = np.concatenate([rgb, a[..., None]], -1).astype(np.uint8)
    Image.fromarray(img, 'RGBA').save(os.path.join(OUT, 'clouds.png'), optimize=True)
    print('clouds', os.path.getsize(os.path.join(OUT, 'clouds.png')) // 1024, 'KB')


if __name__ == '__main__':
    laterite()
    lawn()
    clouds()
