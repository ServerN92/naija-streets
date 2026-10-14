"""The eight Naija Streets outfits, as recipes over garments.py. Each outfit is a list of pieces with a fabric name."""
import numpy as np, math
from garments import shell, tube, robe, fila, gele, slides, neckline, cut_above, cut_below, cut_sleeve, cut_leg, cut_armhole, cut_tank, smoothstep

HEADFEET = ('head', 'handL', 'handR', 'footL', 'footR')

def ease_map(b, torso, arm=None, leg=None, ankle=None):
    e = np.full(b.n, float(torso))
    if arm is not None: e[np.isin(b.part, ['armL', 'armR', 'handL', 'handR'])] = arm
    if leg is not None:
        m = np.isin(b.part, ['legL', 'legR', 'footL', 'footR']); e[m] = leg
        if ankle is not None: e[m] = leg + (ankle - leg) * smoothstep(1.55, 1.9, b.tl[m])
    return e

# ---------------------------------------------------------------- men
def m_street(b):
    tee = shell(b, [neckline(b, .045, .0), cut_above(b, b.hip[2] - .07), cut_sleeve(b, .5)], ease_map(b, .017, .019), min_ease=.012,
                exclude=HEADFEET, name='jersey')
    jog = shell(b, [cut_below(b, b.hip[2] + .06), cut_leg(b, 1.9)], ease_map(b, .007, leg=.02, ankle=.006), min_ease=.005,
                exclude=('armL', 'armR', 'handL', 'handR', 'footL', 'footR'), name='joggers')
    return [(tee, 'jersey'), (jog, 'joggers')]

def m_senator(b):
    top = shell(b, [neckline(b, .012, -.012), cut_above(b, b.crotch_z + .02), cut_sleeve(b, 1.93)], ease_map(b, .012, .014), min_ease=.008,
                exclude=HEADFEET, name='senator_top')
    knee = b.leg['L'][1][2]
    skirt = tube(b, b.hip[2] + .02, (b.crotch_z + knee) / 2 - .02, ['torso', 'legL', 'legR'], ease=lambda z: .011 + .007 * smoothstep(b.hip[2], b.crotch_z, z), min_ease=.008,
                 flare=lambda z: 1.0 + .03 * smoothstep(b.hip[2], b.crotch_z - .1, z), weights_mix=('Hips', .5), name='senator_tail')
    trousers = shell(b, [cut_below(b, b.hip[2] + .05), cut_leg(b, 1.95)], ease_map(b, .016, leg=.03, ankle=.032), min_ease=.01,
                     exclude=('armL', 'armR', 'handL', 'handR', 'footL', 'footR'), name='senator_trousers')
    collar = tube(b, b.neck[2] + .025, b.neck[2] - .012, ['neck', 'torso'], ease=.009, min_ease=.006, step=.006, slab=.01, K=56,
                  weights_mix=('Neck', .6), name='collar')
    return [(top, 'senator'), (skirt, 'senator'), (trousers, 'senator'), (collar, 'senator_trim')]

def m_agbada(b):
    inner = m_senator(b)
    inner = [(p, 'buba' if f != 'senator_trim' else 'buba_trim') for p, f in inner if p['name'] != 'senator_tail']
    gown = robe(b, b.leg['L'][2][2] + .17, name='agbada')
    cap = fila(b, name='fila')
    return inner + [(gown, 'agbada'), (cap, 'fila')]

def m_hustle(b):
    vest = shell(b, [neckline(b, .13, .03, sharp=4), cut_tank(b), cut_sleeve(b, -.3), cut_above(b, b.hip[2] - .07)], ease_map(b, .009), min_ease=.006,
                 exclude=HEADFEET, name='singlet')
    shorts = shell(b, [cut_below(b, b.hip[2] + .05), cut_leg(b, .93)], ease_map(b, .02, leg=.03), min_ease=.012,
                   exclude=('armL', 'armR', 'handL', 'handR', 'footL', 'footR'), name='cargo')
    return [(vest, 'singlet'), (shorts, 'cargo'), (slides(b), 'slides')]

# ---------------------------------------------------------------- ladies
def f_jeans(b):
    crop = shell(b, [neckline(b, .055, .012), cut_above(b, (b.spine[2] + b.spine1[2]) / 2 + .035), cut_sleeve(b, .32)], ease_map(b, .005, .007), min_ease=.004,
                 exclude=HEADFEET, name='croptop')
    jeans = shell(b, [cut_below(b, b.spine[2] - .005), cut_leg(b, 1.93)], ease_map(b, .005, leg=.005, ankle=.004), min_ease=.0035,
                  exclude=('armL', 'armR', 'handL', 'handR', 'footL', 'footR'), name='jeans')
    return [(crop, 'croptop'), (jeans, 'denim')]

def f_bodycon(b):
    top = shell(b, [neckline(b, .075, .02), cut_above(b, b.hip[2] - .03), cut_sleeve(b, .28)], ease_map(b, .0045, .006), min_ease=.0035,
                exclude=HEADFEET, name='bodycon_top')
    knee = b.leg['L'][1][2]
    skirt = tube(b, b.hip[2] - .01, knee + .13, ['torso', 'legL', 'legR'], ease=.004, min_ease=.003, name='bodycon_skirt', step=.015,
                 weights_mix=('Hips', lambda z: .4 * smoothstep(knee + .13, b.hip[2], z)))   # the hem follows the thighs, so legs don't come through it
    return [(top, 'bodycon'), (skirt, 'bodycon')]

def f_gown(b):
    top = shell(b, [neckline(b, .085, .03), cut_above(b, b.hip[2] - .02), cut_sleeve(b, .3)], ease_map(b, .005, .008), min_ease=.004,
                exclude=HEADFEET, name='gown_top')
    knee = b.leg['L'][1][2]; ank = b.leg['L'][2][2]
    skirt = tube(b, b.hip[2], ank - .03, ['torso', 'legL', 'legR'], ease=lambda z: .006 if z > knee else .006 + .02 * smoothstep(knee, ank, z), min_ease=.004,
                 flare=lambda z: 1.0 + .55 * smoothstep(knee + .05, ank - .03, z) ** 1.4,
                 folds=(12, lambda z: .028 * smoothstep(knee + .05, ank, z), .3), weights_mix=('Hips', lambda z: .3 + .4 * smoothstep(knee, ank, z)), name='gown_skirt', step=.016)
    return [(top, 'ankara1'), (skirt, 'ankara1')]

def f_wrapper(b):
    ub = (b.spine1[2] + b.spine2[2]) / 2
    buba = shell(b, [neckline(b, .05, .01), cut_above(b, ub - .01), cut_sleeve(b, .62)], ease_map(b, .014, .02), min_ease=.009, exclude=HEADFEET, name='buba')
    buba_tail = tube(b, ub + .01, b.hip[2] - .09, ['torso', 'legL', 'legR'], ease=.02, min_ease=.012, weights_mix=('Spine', .4), name='buba_tail',
                     folds=(7, lambda z: .004 * smoothstep(ub, b.hip[2] - .1, z), 1.1))
    ank = b.leg['L'][2][2]
    wrap = tube(b, b.spine[2] + .01, ank - .005, ['torso', 'legL', 'legR'], ease=.012, min_ease=.008,
                flare=lambda z: 1.0 + .06 * smoothstep(b.crotch_z, ank, z), folds=(6, lambda z: .007 * smoothstep(b.crotch_z, ank, z), 2.),
                weights_mix=('Hips', lambda z: .3 + .3 * smoothstep(b.crotch_z, ank, z)), name='iro')
    return [(buba, 'lace'), (buba_tail, 'lace'), (wrap, 'ankara2'), (gele(b), 'gele')]

MEN = {'street': m_street, 'senator': m_senator, 'agbada': m_agbada, 'hustle': m_hustle}
LADIES = {'jeans': f_jeans, 'bodycon': f_bodycon, 'gown': f_gown, 'wrapper': f_wrapper}
