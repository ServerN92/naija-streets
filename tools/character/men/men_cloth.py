"""Clothes for the nine men (and the police uniform for the officers), built from each man's own body like the women's
(women_cloth.py: gshell / tube / build_piece / cloth_mat). Eleven outfits: senator, kaftan & cap, football jersey,
tee & jeans, office suit, singlet & shorts, hoodie & joggers, Ankara shirt, polo & chinos, police, and rags (torn, dirty:
how the player starts). Run in naija_men.blend after mload.py (women_cloth.py is loaded first; this replaces its tables)."""
import bpy, os, math, time, traceback
import numpy as np
from mathutils import Vector

# ------------------------------------------------------------------ helpers
def strip_front(b, w0, w1, ztop, zbot, out_y=.02):
    """a strip down the front centre (a tie): w0 wide at ztop, w1 at zbot"""
    V = b.V; cx = b.neck[0]; t = np.clip((ztop - V[:, 2]) / max(.01, ztop - zbot), 0, 1); w = w0 + (w1 - w0) * t
    return np.min(np.stack([w / 2 - np.abs(V[:, 0] - cx), ztop - V[:, 2], V[:, 2] - zbot, (b.neck[1] - out_y) - V[:, 1]]), 0)

def front_patch(b, half_w, ztop, zbot):
    V = b.V; cx = b.neck[0]
    s = np.min(np.stack([half_w - np.abs(V[:, 0] - cx), ztop - V[:, 2], V[:, 2] - zbot, (b.neck[1] - .02) - V[:, 1]]), 0)
    s[b.part != 'torso'] = -1.
    return s

def collar(b, nl, width=.03, front=.03, name='collar', ease=.011):
    """a shirt collar: a band just above the neckline, standing a little off the neck"""
    front_m = b.V[:, 1] < b.neck[1] - .02
    band = np.where(front_m, front, width)
    return gshell(b, [nl + .012, band - nl, cut_sleeve(b, -.2)], ease, min_ease=ease * .85, exclude=HEADFEET + ARMS, relax=6, name=name)

def waist_band(b, top, h=.035, ease=.0095, name='belt'):
    return gshell(b, [cut_below(b, top + .002), cut_above(b, top - h)], ease, min_ease=ease * .9, exclude=LOWER_EX + ('neck',), relax=6, name=name)

def trousers(b, top, ease=.012, leg=.03, ankle=.024, t=1.93, name='trousers'):
    return gshell(b, [cut_below(b, top), cut_leg(b, t)], ease_map(b, ease, leg=leg, ankle=ankle), min_ease=ease * .7, exclude=LOWER_EX, name=name)

def shirt(b, hem, sleeve, ease=.011, arm=.013, nl=None, name='shirt'):
    nl = neckline(b, .045, .006) if nl is None else nl
    return gshell(b, [nl, cut_above(b, hem), cut_sleeve(b, sleeve)], ease_map(b, ease, arm), min_ease=ease * .7, exclude=HEADFEET, name=name)

def tail(b, z_top, z_bot, ease=.02, name='tail', folds=None):
    """a top's skirt below the hips: hangs as one tube (does not split between the legs)"""
    return tube(b, z_top, z_bot, ['torso', 'legL', 'legR'], ease=ease, min_ease=ease * .6, weights_mix=('Hips', lambda z: .35 + .3 * smoothstep(b.hip[2], z_bot, z)),
                folds=folds, name=name, step=.016)

# ------------------------------------------------------------------ head wear (head_piece, beret: women_cloth.py)
def kufi(person, name='kufi'):
    """a round cap (with the kaftan): straight sides, a flat top"""
    line = lambda a: .05 - .03 * smoothstep(60, 170, a)
    return head_piece(person, line, lambda h, a, p: .005 + .01 * smoothstep(.0, .05, h), name)

# ------------------------------------------------------------------ the outfits
def o_senator(b):
    hem = b.crotch_z - .1
    top = shirt(b, b.hip[2] + .02, 1.9, ease=.013, arm=.014, nl=neckline(b, .04, .008), name='senator')
    tl = tail(b, b.hip[2] + .04, hem, ease=.022, name='senator_tail')
    pl = gshell(b, [strip_front(b, .03, .03, b.neck[2] - .04, b.spine1[2] - .02, out_y=.03)], .019, min_ease=.0175, exclude=HEADFEET + ARMS, relax=4, name='placket')
    return [(top, 'senator'), (tl, 'senator'), (pl, 'senator_trim'), (trousers(b, b.spine[2] + .02), 'senator')]

def o_kaftan(b):
    top = shirt(b, b.spine[2] - .02, 1.95, ease=.016, arm=.02, nl=neckline(b, .035, .006, v_depth=.06, v_width=.25), name='kaftan')
    tl = tail(b, b.spine[2] + .0, b.ankle + .05, ease=.036, name='kaftan_tail', folds=(9, lambda z: .003 * smoothstep(b.crotch_z, b.ankle, z), .4))
    return [(top, 'kaftan'), (tl, 'kaftan'), (sandals(b), 'slides')]

def o_jersey(b):
    j = shirt(b, b.hip[2] - .05, .5, ease=.022, arm=.022, nl=neckline(b, .05, .01, v_depth=.035, v_width=.35), name='jersey')
    sh = gshell(b, [cut_below(b, b.spine[2] + .02), cut_leg(b, .78)], ease_map(b, .014, leg=.03), min_ease=.01, exclude=LOWER_EX, name='shorts')
    return [(j, 'jersey'), (sh, 'jshorts')]

def o_tee_jeans(b):
    tee = shirt(b, b.hip[2] + .035, .45, ease=.014, arm=.016, nl=neckline(b, .05, .01), name='tee')
    top = b.spine[2] + .005
    jeans = trousers(b, top, ease=.009, leg=.02, ankle=.016, t=1.92, name='jeans')
    return [(tee, 'tee'), (jeans, 'denim'), (waist_band(b, top, ease=.0105, name='waistband'), 'denim_band'), (pockets(b), 'denim_band')]

def o_suit(b):
    nl = neckline(b, .045, .006)
    sh = shirt(b, b.hip[2] - .06, 1.85, ease=.009, arm=.011, nl=nl, name='shirt')
    tie = gshell(b, [strip_front(b, .03, .075, b.neck[2] - .035, b.spine[2] + .06, out_y=.03)], .0135, min_ease=.012, exclude=HEADFEET + ARMS, relax=4, name='tie')
    vbot = b.spine1[2] - .01; vd = (b.neck[2] - .02) - vbot
    jnl = neckline(b, .02, -.012, v_depth=vd, v_width=.8)
    jacket = gshell(b, [jnl, cut_above(b, b.hip[2] - .1), cut_sleeve(b, 1.88)], ease_map(b, .019, .018), min_ease=.015, exclude=HEADFEET, name='jacket')
    front = b.V[:, 1] < b.neck[1] - .02
    band = np.where(front, .07, .032)
    lapel = gshell(b, [jnl, band - jnl, b.V[:, 2] - (vbot + .015), cut_sleeve(b, -.2)], .022, min_ease=.021, exclude=HEADFEET + ARMS, relax=6, name='lapels')
    return [(sh, 'shirt_w'), (collar(b, nl, name='shirt_collar', ease=.0105), 'shirt_w'), (tie, 'tie'), (jacket, 'jacket'), (lapel, 'lapel'),
            (button(b, vbot - .03, .022), 'button'), (trousers(b, b.spine[2] + .02, ease=.012, leg=.026, ankle=.022), 'jacket')]

def o_singlet(b):
    bz = b.bust[2]
    tank = gshell(b, [neckline(b, .11, .05, sharp=2.2), armholes(b, .115, rz=.13, dz=-.02), cut_sleeve(b, -.3), cut_above(b, b.hip[2] - .06)],
                  ease_map(b, .006), min_ease=.005, exclude=HEADFEET, name='singlet')
    sh = gshell(b, [cut_below(b, b.spine[2] + .01), cut_leg(b, .92)], ease_map(b, .014, leg=.026), min_ease=.01, exclude=LOWER_EX, name='cargo')
    return [(tank, 'singlet'), (sh, 'cargo'), (waist_band(b, b.spine[2] + .01, ease=.0155, name='cargo_band'), 'cargo'), (sandals(b), 'slides')]

def o_hoodie(b):
    hd = shirt(b, b.hip[2] - .07, 1.9, ease=.02, arm=.02, nl=neckline(b, .035, .004), name='hoodie')
    pocket = gshell(b, [front_patch(b, .1, b.spine[2] - .02, b.hip[2] - .06)], .026, min_ease=.024, exclude=HEADFEET + ARMS, relax=4, name='pouch')
    jog = gshell(b, [cut_below(b, b.spine[2] + .02), cut_leg(b, 1.9)], ease_map(b, .009, leg=.02, ankle=.007), min_ease=.006, exclude=LOWER_EX, name='joggers')
    return [(hd, 'hoodie'), (pocket, 'hoodie'), (jog, 'jog')]

def o_ankara(b):
    nl = neckline(b, .05, .006, v_depth=.03, v_width=.3)
    sh = shirt(b, b.hip[2] - .07, .42, ease=.014, arm=.018, nl=nl, name='ankara_shirt')
    return [(sh, 'ankara'), (collar(b, nl, name='ankara_collar', ease=.0155), 'ankara'), (trousers(b, b.spine[2] + .02), 'plain_trousers')]

def o_polo(b):
    nl = neckline(b, .045, .006, v_depth=.02, v_width=.2)
    sh = shirt(b, b.spine[2] - .03, .4, ease=.011, arm=.015, nl=nl, name='polo')   # (tucked in)
    top = b.spine[2] + .01
    return [(sh, 'polo'), (collar(b, nl, name='polo_collar', ease=.0135), 'polo'), (trousers(b, top, ease=.016, leg=.028, ankle=.02, name='chinos'), 'chinos'),
            (waist_band(b, top, ease=.019, name='chino_belt'), 'belt')]

def o_police(b):
    nl = neckline(b, .045, .005, v_depth=.025, v_width=.35)
    sh = shirt(b, b.spine[2] - .03, .42, ease=.009, arm=.012, nl=nl, name='pshirt')        # tucked in
    top = b.spine[2] + .015
    tr = trousers(b, top, ease=.012, leg=.028, ankle=.022, name='ptrousers')
    pk = gshell(b, [np.min(np.stack([.05 - np.abs(np.abs(b.V[:, 0] - b.neck[0]) - .075), (b.bust[2] + .05) - b.V[:, 2], b.V[:, 2] - (b.bust[2] - .04),
                                      (b.neck[1] - .03) - b.V[:, 1]]), 0)], .0135, min_ease=.0125, exclude=HEADFEET + ARMS, relax=4, name='pockets')   # two chest pockets
    return [(sh, 'police'), (collar(b, nl, name='pcollar', ease=.0115), 'police'), (pk, 'police'), (tr, 'police'),
            (waist_band(b, top, h=.04, ease=.0125, name='pbelt'), 'pbelt'), (button(b, top - .02, .0135, r=.016, name='buckle'), 'buckle')]

def o_rags(b):
    bz = b.bust[2]
    tank = gshell(b, [neckline(b, .1, .05, sharp=2.2), armholes(b, .115, rz=.13, dz=-.02), cut_sleeve(b, -.3),
                      ragged(b, b.hip[2] - .04, .035, seed=4), holes(b, 5, .008, .016, ('torso',), b.hip[2] + .02, b.bust[2] - .03, seed=5)],
                  ease_map(b, .009), min_ease=.007, exclude=HEADFEET, name='rag_top')
    sh = gshell(b, [cut_below(b, b.spine[2] + .01), cut_leg(b, .95) + .025 * np.sin(b.phi * 7 + 1.3), holes(b, 4, .01, .022, ('legL', 'legR'), b.knee + .08, b.crotch_z, seed=8)],
                ease_map(b, .014, leg=.024), min_ease=.01, exclude=LOWER_EX, name='rag_shorts')
    return [(tank, 'rag_top'), (sh, 'rag_shorts'), (sandals(b), 'rag_slides')]

# name: (recipe, MakeHuman shoes or None, head wear)
OUTFITS = {
    'senator': (o_senator, 'shoes03', None), 'kaftan': (o_kaftan, None, 'kufi'), 'jersey': (o_jersey, 'shoes06', None), 'tee_jeans': (o_tee_jeans, 'shoes05', None),
    'suit': (o_suit, 'shoes03', None), 'singlet': (o_singlet, None, None), 'hoodie': (o_hoodie, 'shoes05', None), 'ankara': (o_ankara, 'shoes01', None),
    'polo': (o_polo, 'shoes01', None), 'police': (o_police, 'shoes04', 'beret'), 'rags': (o_rags, None, None),
}
NAMES = {'senator': 'Senator', 'kaftan': 'Kaftan & cap', 'jersey': 'Super Eagles', 'tee_jeans': 'Tee & jeans', 'suit': 'Office suit', 'singlet': 'Singlet & shorts',
         'hoodie': 'Hoodie', 'ankara': 'Ankara shirt', 'polo': 'Polo & chinos', 'police': 'Police', 'rags': 'Rags'}

# ------------------------------------------------------------------ fabrics
ROLE = {
    'senator': dict(rough=.62, weave='twill'), 'senator_trim': dict(rough=.5, weave=None, sheen=.3),
    'kaftan': dict(rough=.6, weave='plain', sheen=.15), 'kufi': dict(rough=.7, weave='knit'),
    'jersey': dict(rough=.45, weave='knit', spec=.3), 'jshorts': dict(rough=.5, weave='knit', spec=.25),
    'tee': dict(rough=.75, weave='knit'),
    'denim': dict(img='denim.png', bump_img='denim_h.png', tile=.12, rough=.8, tint='#8f9bba'),
    'denim_band': dict(img='denim.png', bump_img='denim_h.png', tile=.12, rough=.8, tint='#808cab'),
    'shirt_w': dict(rough=.45, weave='plain', sheen=.2), 'tie': dict(rough=.35, weave='twill', sheen=.5, spec=.35),
    'jacket': dict(rough=.72, weave='twill'), 'lapel': dict(rough=.5, weave=None, sheen=.3, spec=.25),
    'button': dict(color='#1a1a1a', rough=.3, weave=None),
    'singlet': dict(rough=.8, weave='rib'), 'cargo': dict(rough=.85, weave='twill'),
    'hoodie': dict(rough=.9, weave='fleece'), 'jog': dict(rough=.85, weave='fleece'),
    'ankara': dict(kind='print', tile=.3, rough=.55, weave='plain'), 'plain_trousers': dict(rough=.7, weave='twill'),
    'polo': dict(rough=.7, weave='knit'), 'chinos': dict(rough=.75, weave='twill'), 'belt': dict(color='#2a1a10', rough=.4, weave=None, spec=.3),
    'police': dict(color='#121419', rough=.7, weave='twill'), 'pbelt': dict(color='#0b0b0c', rough=.3, weave=None, spec=.45, coat=.5),
    'buckle': dict(color='#c8c8c8', rough=.25, metal=1., weave=None), 'beret': dict(color='#0d0e10', rough=.95, weave='fleece'),
    'slides': dict(rough=.6, weave=None), 'rag_slides': dict(color='#4a4038', rough=.95, weave=None),
    'rag_top': dict(img='rag_white.png', tile=.35, rough=.95, weave='plain'), 'rag_shorts': dict(img='rag_khaki.png', tile=.35, rough=.95, weave='twill'),
}
PAL = {   # (gele: none for the men; the women's show() looks for it)
    'Tunde':     dict(senator='#1d2d5c', senator_trim='#c9a24a', kaftan='#f3efe6', kufi='#f3efe6', jersey='#0f8a4a', jshorts='#f2f2f2', tee='#f2f2f2', shirt_w='#ffffff', tie='#7a1830',
                      jacket='#1d1f24', lapel='#1d1f24', singlet='#f2f2f2', cargo='#6b6a4a', hoodie='#2b2b2e', jog='#2b2b2e', jog_s='#ffffff', ankara='ankara_b', plain_trousers='#141414',
                      polo='#1d2d5c', chinos='#c8b48a', slides='#141414', gele=None),
    'Emeka':     dict(senator='#f2efe6', senator_trim='#3a2a1e', kaftan='#1d2d5c', kufi='#1d2d5c', jersey='#0f8a4a', jshorts='#f2f2f2', tee='#7a1830', shirt_w='#e9f0f7', tie='#1d2d5c',
                      jacket='#2b3a55', lapel='#2b3a55', singlet='#f2f2f2', cargo='#3d3a30', hoodie='#7a1830', jog='#141414', jog_s='#7a1830', ankara='ankara_e', plain_trousers='#1d2d5c',
                      polo='#f2f2f2', chinos='#2b3a55', slides='#7a1830', gele=None),
    'Dayo':      dict(senator='#0b5d3b', senator_trim='#f2efe6', kaftan='#e9e3d6', kufi='#7a1830', jersey='#0f8a4a', jshorts='#f2f2f2', tee='#141414', shirt_w='#ffffff', tie='#0b5d3b',
                      jacket='#3a3a40', lapel='#3a3a40', singlet='#f2f2f2', cargo='#5b5a3a', hoodie='#5b6b4a', jog='#3a3a40', jog_s='#ffffff', ankara='ankara_g', plain_trousers='#141414',
                      polo='#0b5d3b', chinos='#e9e3d6', slides='#141414', gele=None),
    'Chidi':     dict(senator='#141414', senator_trim='#c9a24a', kaftan='#141414', kufi='#141414', jersey='#0f8a4a', jshorts='#f2f2f2', tee='#141414', shirt_w='#ffffff', tie='#141414',
                      jacket='#141414', lapel='#141414', singlet='#f2f2f2', cargo='#2b2b2e', hoodie='#141414', jog='#141414', jog_s='#c9a24a', ankara='ankara_a', plain_trousers='#141414',
                      polo='#141414', chinos='#3a3a40', slides='#141414', gele=None),
    'Musa':      dict(senator='#e9e3d6', senator_trim='#0b5d3b', kaftan='#ffffff', kufi='#e9e3d6', jersey='#0f8a4a', jshorts='#f2f2f2', tee='#26a69a', shirt_w='#ffffff', tie='#7a1830',
                      jacket='#5a4a3a', lapel='#5a4a3a', singlet='#f2f2f2', cargo='#6b5a40', hoodie='#3a3a40', jog='#3a3a40', jog_s='#26a69a', ankara='ankara_c', plain_trousers='#3a2a1e',
                      polo='#e9e3d6', chinos='#3a2a1e', slides='#3a2a1e', gele=None),
    'Femi':      dict(senator='#5b1a6e', senator_trim='#f2efe6', kaftan='#5b1a6e', kufi='#5b1a6e', jersey='#0f8a4a', jshorts='#f2f2f2', tee='#f2b705', shirt_w='#ffffff', tie='#5b1a6e',
                      jacket='#2b2b2e', lapel='#2b2b2e', singlet='#f2f2f2', cargo='#4a4a30', hoodie='#f2b705', jog='#141414', jog_s='#f2b705', ankara='ankara_h', plain_trousers='#141414',
                      polo='#f2b705', chinos='#141414', slides='#f2b705', gele=None),
    'Segun':     dict(senator='#3a2a1e', senator_trim='#c9a24a', kaftan='#c9a24a', kufi='#3a2a1e', jersey='#0f8a4a', jshorts='#f2f2f2', tee='#f2f2f2', shirt_w='#ffffff', tie='#3a2a1e',
                      jacket='#3a2a1e', lapel='#3a2a1e', singlet='#f2f2f2', cargo='#3a3a40', hoodie='#3a3a40', jog='#3a3a40', jog_s='#ffffff', ankara='ankara_d', plain_trousers='#3a2a1e',
                      polo='#7a1830', chinos='#3a2a1e', slides='#3a2a1e', gele=None),
    'Baba Sule': dict(senator='#e9e3d6', senator_trim='#3a2a1e', kaftan='#e9e3d6', kufi='#7a1830', jersey='#0f8a4a', jshorts='#f2f2f2', tee='#e9e3d6', shirt_w='#ffffff', tie='#3a2a1e',
                      jacket='#5a4a3a', lapel='#5a4a3a', singlet='#f2f2f2', cargo='#5a4a3a', hoodie='#5a4a3a', jog='#3a3a40', jog_s='#ffffff', ankara='ankara_f', plain_trousers='#3a2a1e',
                      polo='#e9e3d6', chinos='#5a4a3a', slides='#3a2a1e', gele=None),
    'Sgt Okon':  dict(senator='#1d2d5c', senator_trim='#f2efe6', kaftan='#f3efe6', kufi='#1d2d5c', jersey='#0f8a4a', jshorts='#f2f2f2', tee='#1d2d5c', shirt_w='#ffffff', tie='#1d2d5c',
                      jacket='#1d1f24', lapel='#1d1f24', singlet='#f2f2f2', cargo='#3d3a30', hoodie='#1d2d5c', jog='#1d2d5c', jog_s='#ffffff', ankara='ankara_c', plain_trousers='#141414',
                      polo='#1d2d5c', chinos='#c8b48a', slides='#141414', gele=None),
}

def spec_for(name, role):
    s = dict(ROLE[role]); p = PAL[name]; k = s.pop('kind', None)
    if k == 'print': s['img'] = p[role] + '.png'
    elif role == 'lapel': s['color'] = p['jacket']
    elif 'img' not in s and 'color' not in s: s['color'] = p.get(role, '#808080')
    if role == 'jog': s['stripes'] = p['jog_s']
    return s

# ------------------------------------------------------------------ dressing
def head_wear(person, outfit, kind, coll, rig):
    nm = f'{person}.{outfit}.{kind}'
    o = bpy.data.objects.get(nm)
    if o: bpy.data.objects.remove(o, do_unlink=True)
    piece = beret(person) if kind == 'beret' else kufi(person)
    o = build_piece(person, outfit, piece, kind if kind in ROLE else 'beret', rig, coll)
    o.modifiers['Thickness'].thickness = .004
    return o

def dress_m(person, keys):
    t = time.time()
    rig, body, b = body_of(person)
    coll = body.users_collection[0]; made = []
    for key in keys:
        clear_outfit(person, key)
        fn, shoes, head = OUTFITS[key]
        try:
            for piece, role in fn(b): made.append(build_piece(person, key, piece, role, rig, coll))
            if shoes:
                s = add_shoes(person, rig, body, shoes)
                L = set(filter(None, s.get('nw_outfits', '').split(','))); L.add(key); s['nw_outfits'] = ','.join(sorted(L))
            if head: made.append(head_wear(person, key, head, coll, rig))
            log('dressed', person, key, round(time.time() - t, 1), 's')
        except Exception: log('outfit failed', person, key, traceback.format_exc())
    return made

def show_m(person, key):
    """him in one outfit (None: the MakeHuman preview clothes)"""
    show(person, key)
    body = bpy.data.objects[person + '.body']
    for o in bpy.data.objects:
        if o.get('nw') == person and o.type == 'MESH' and 'casualsuit' in o.name: o.hide_render = o.hide_viewport = key is not None
    for md in body.modifiers:
        if md.type == 'MASK' and md.name.startswith('Delete.') and 'casualsuit' in md.name: md.show_render = md.show_viewport = key is None

def unhide_all():
    """undo the hiding done for one-man pictures"""
    for o in bpy.data.objects:
        if o.get('_hid'): o.hide_render = False; del o['_hid']

def solo(person):
    """only him in the pictures (unhide_all() undoes it)"""
    for o in bpy.data.objects:
        if o.get('nw') and o.get('nw') != person and not o.hide_render: o.hide_render = True; o['_hid'] = 1
