"""Build all nine women with the new head: body, head (with her own small changes), eyes, scalp cap, hair or head tie.
Run in naija_women.blend after women_lib, face_transfer, head_swap, hair_fit, headwear."""
import bpy, time

LOOK = {   # her head size, face changes, hair
    'Amaka':       dict(size=1.04, shape={}, hair=('dl', 'HAIR_cornrows', dict(scale=1.0, lift=.006))),
    'Ada':         dict(size=1.03, shape=dict(nose=1.12, lips=1.12, cheeks=1.), hair=('dl', 'HAIR_afro', dict(width=.30, lift=.03))),
    'Chioma':      dict(size=1.04, shape=dict(cheeks=2., face_len=.97, nose=1.05), hair=('mh', 'ponytail01', {})),
    'Bisi':        dict(size=1.03, shape=dict(jaw=.96, lips=1.05), hair=('mh', 'long01', {})),
    'Kemi':        dict(size=1.02, shape=dict(face_len=1.04, cheeks=-1., nose=1.08), hair=('mh', 'short02', {})),
    'Funmi':       dict(size=1.04, shape=dict(jaw=1.04, cheeks=1.), hair=('mh', 'bob02', {})),
    'Mama Nkechi': dict(size=1.07, shape=dict(cheeks=5., jaw=1.12, face_len=.98, nose=1.15), hair=('gele', None, {})),
    'Iya Basira':  dict(size=1.06, shape=dict(cheeks=4., jaw=1.1, nose=1.18), hair=('scarf', None, {})),
    'Sgt Halima':  dict(size=1.04, shape=dict(nose=.95, face_len=1.02), hair=('dl', 'HAIR_bun', dict(scale=1.0, lift=.004))),
}

def to_head(h, name):
    rig = bpy.data.objects['NW_' + name.replace(' ', '_')]
    mw = h.matrix_world.copy(); h.parent = rig; h.matrix_world = mw
    g = h.vertex_groups.get('mixamorig:Head') or h.vertex_groups.new(name='mixamorig:Head'); g.add(list(range(len(h.data.vertices))), 1., 'REPLACE')
    if not any(m.type == 'ARMATURE' for m in h.modifiers): m = h.modifiers.new('Armature', 'ARMATURE'); m.object = rig
    h['nw'] = name; h['nw_hair'] = 1

def build(name, x):
    t = time.time(); P = LOOK[name]
    for n in ('HAIR_cornrows', 'HAIR_afro', 'HAIR_bun'):   # the downloaded hairs are kept: let go of her before she is rebuilt
        hh = bpy.data.objects.get(n)
        if hh and hh.get('nw') == name:
            mw = hh.matrix_world.copy(); hh.parent = None; hh.matrix_world = mw; del hh['nw']
            for m in list(hh.modifiers):
                if m.type == 'ARMATURE': hh.modifiers.remove(m)
    for o in list(bpy.data.objects):
        if o.get('nw') == name: bpy.data.objects.remove(o, do_unlink=True)
    r, b = make_woman(name, x=x, clothes=PREVIEW_WEAR)
    kind, src, opt = P['hair']
    mh = None
    if kind == 'mh':   # her MakeHuman hair becomes a plain mesh, fitted to the new head below
        o = next((c for c in r.children_recursive if src in c.name), None)
        if o:
            mh = as_mesh([o], 'HAIR_' + name.replace(' ', '_')); mh.data.materials.clear()
            for sl in o.material_slots: mh.data.materials.append(sl.material)
            bpy.data.objects.remove(o, do_unlink=True)
    h, parts = swap(name, size=P['size'], shape=P['shape']); eye_mats(name)
    if kind in ('dl', 'mh'): head_scalp(name, front=.052)
    if kind == 'dl':
        hh = bpy.data.objects[src]; hh.hide_render = False; fit(hh, name, **opt); to_head(hh, name)
    elif kind == 'mh' and mh:
        fit(mh, name, width=None, lift=.004); to_head(mh, name)
    elif kind == 'gele': gele2(name)
    elif kind == 'scarf': scarf(name)
    log('built', name, round(time.time() - t, 1), 's')
