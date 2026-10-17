"""Fabric pictures for the women's clothes (original designs): the old prints from cloth/gen_textures.py plus new ones
(more Ankara prints, sequins, rib knit, satin noise). Writes to ./tex_cloth (copied next to naija_women.blend)."""
import os, sys, math, numpy as np
from PIL import Image, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'cloth'))
import gen_textures as G
G.OUT = OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'tex_cloth'); os.makedirs(OUT, exist_ok=True)
N = G.N; xx, yy = G.xx, G.yy

def sequins(name, c1, c2, seed=7):
    """little round sequins in offset rows: colour + height (domed discs) + a sparkle mask for roughness"""
    rng = np.random.default_rng(seed)
    n = 32; col = np.zeros((N, N, 3)); h = np.zeros((N, N)); rough = np.full((N, N), .55)
    a = np.array(G.hexrgb(c1)); b = np.array(G.hexrgb(c2))
    u = xx * n; v = yy * n
    for off in (0, .5):
        cu = np.floor(u + off) - off + .5; cv = np.floor(v * 1.0) + .5 if off == 0 else np.floor(v + .5) - .5 + .5
        cv = (np.floor(v + (0 if off == 0 else .5)) + .5 - (0 if off == 0 else .5))
        d = np.hypot(u - cu, v - cv)
        disc = d < .52
        # each sequin a little tilted: brightness varies
        k = (np.floor(cu * 13.1 + cv * 7.7)).astype(int)
        t = (np.sin(k * 12.9898) * 43758.5453) % 1
        shade = .55 + .6 * t
        col[disc] = (a * (1 - t[disc, None] * .35) + b * (t[disc, None] * .35)) * shade[disc, None]
        h[disc] = np.maximum(h[disc], 1 - (d[disc] / .52) ** 2)
        rough[disc] = .12 + .2 * (1 - t[disc])
    gap = col.sum(2) == 0
    col[gap] = a * .25
    G.save(name + '.png', col); G.save(name + '_h.png', np.stack([h] * 3, -1)); G.save(name + '_rough.png', np.stack([rough] * 3, -1))

def rib(name, seed=3):
    """fine rib knit for tops and bodycon dresses (grey-scale height + slight colour change)"""
    w = (np.sin(xx * N * math.pi / 5) * .5 + .5) ** .7
    rng = np.random.default_rng(seed)
    n = np.array(Image.fromarray((rng.random((N, 64)) * 255).astype(np.uint8)).resize((N, N), Image.BILINEAR)) / 255.
    G.save(name + '_h.png', np.stack([w * .85 + n * .15] * 3, -1))

def leopard(name, bg, spot, ring, seed=11):
    """an original rosette animal print"""
    rng = np.random.default_rng(seed)
    col = np.ones((N, N, 3)) * G.hexrgb(bg)
    for _ in range(70):
        cx, cy = rng.random(2); r = .02 + .025 * rng.random()
        d, dx, dy = G.tile_dist(cx, cy)
        ang = np.arctan2(dy, dx); wob = 1 + .25 * np.sin(ang * 3 + rng.random() * 6) + .15 * np.sin(ang * 5)
        rr = d / (r * wob)
        col[(rr > .7) & (rr < 1.05) & (np.sin(ang * 4 + rng.random() * 6) > -.6)] = G.hexrgb(ring)
        col[rr < .6] = G.hexrgb(spot)
    G.save(name + '.png', col * (.92 + .1 * G.wax_noise(seed))[..., None])

if __name__ == '__main__':
    G.ankara_circles('ankara_a.png', '#1d2a6b', '#f28c1e', '#ffd23f', '#e8452c', 1)
    G.ankara_diamonds('ankara_b.png', '#5b1a6e', '#f2b705', '#26a69a', '#f25c54', 2)
    G.ankara_fans('ankara_c.png', '#0d6e6e', '#f7c948', '#e2533c', '#fdf4e3', 3)
    G.ankara_circles('ankara_d.png', '#8a1c2b', '#f6c544', '#1f9e89', '#ffffff', 4)
    G.ankara_fans('ankara_e.png', '#f2a007', '#7a1f5c', '#1d6fb8', '#fff6e0', 5)       # gold, plum, blue
    G.ankara_diamonds('ankara_f.png', '#0b5d3b', '#f5d142', '#e85d27', '#fbf3e4', 6)    # green, yellow, orange
    G.ankara_circles('ankara_g.png', '#e8457a', '#1b1b4a', '#f6c544', '#ffffff', 7)     # pink, navy, gold
    G.ankara_fans('ankara_h.png', '#2a1a12', '#c98a2b', '#e6dcc8', '#9c2b1f', 8)        # brown, ochre, cream
    G.denim()
    G.damask('damask_gold', '#c99a3c', '#e8c26a'); G.damask('damask_wine', '#6d1630', '#8a2340'); G.damask('damask_blue', '#1c3f8f', '#2f5bc0')
    G.lace('lace_peach', '#e9b89a'); G.lace('lace_white', '#efe9e1'); G.lace('lace_wine', '#7a1830'); G.lace('lace_green', '#1f7a4c'); G.lace('lace_gold', '#d6a94a')
    sequins('sequin_gold', '#e8c06a', '#fff1c4', 7); sequins('sequin_silver', '#c9ccd3', '#ffffff', 8); sequins('sequin_red', '#b3122e', '#ff6a7d', 9)
    rib('rib'); leopard('leopard', '#d9a45c', '#2a1a10', '#3a2414')
