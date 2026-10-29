"""Write one man out of naija_men.blend for the game builder (women/women_glb.py, run outside Blender), as
women_export.py does for the women: every part in the rest pose with its corners' normals and uvs, skin weights, the
skeleton, his eleven outfits and how each cloth looks; skin and face (with brows and beard) baked into pictures.
Output: <men>/export/<Name>/ (parts.npz, parts.json, *.png). Run after mload.py (uses women_export's grab / bake / flat)."""
import bpy, os, re, json
import numpy as np

EXP_M = os.path.join(W, 'export')
IDS_M = {'Baba Sule': 'p_sule', 'Sgt Okon': 'p_okon'}
def man_id(name): return IDS_M.get(name, 'p_' + name.lower())

# the wardrobe buttons: the colour of the top and of the bottom of each outfit (a role of his palette, or a colour)
SW_M = {'senator': ('senator', 'senator'), 'kaftan': ('kaftan', 'kaftan'), 'jersey': ('jersey', 'jshorts'), 'tee_jeans': ('tee', '#3d5687'),
        'suit': ('jacket', 'jacket'), 'singlet': ('singlet', 'cargo'), 'hoodie': ('hoodie', 'jog'), 'ankara': ('ankara', 'plain_trousers'),
        'polo': ('polo', 'chinos'), 'police': ('#121419', '#121419'), 'rags': ('#b9b09a', '#7a6a4e'),
        'agbada': ('agbada', 'agbada_in'), 'nativeset': ('ankara2', 'ankara2'), 'baggy': ('bomber', '#3d5687')}

def cut_colour(o):
    """the haircut's colour (its material mixes a flat colour with noise)"""
    m = o.material_slots[0].material if o.material_slots else None
    if m and m.node_tree:
        mx = next((n for n in m.node_tree.nodes if n.type == 'MIX' and n.blend_type == 'MULTIPLY'), None)
        if mx:
            a = next((i for i in mx.inputs if i.name == 'A' and i.type == 'RGBA'), None)
            if a is not None and not a.is_linked: return tuple(a.default_value)[:3]
    return flat(m)['color'] if m else (.02, .015, .012)

def export_m(name):
    rig = bpy.data.objects['NW_' + slug(name)]; body = bpy.data.objects[name + '.body']
    folder = os.path.join(EXP_M, slug(name)); os.makedirs(folder, exist_ok=True)
    origin = np.array(rig.location, np.float64)
    bones = [b.name for b in rig.data.bones]; bix = {b: i for i, b in enumerate(bones)}
    mw = rig.matrix_world
    skel = [dict(name=b.name, head=list(np.array(mw @ b.head_local) - origin), tail=list(np.array(mw @ b.tail_local) - origin), parent=b.parent.name if b.parent else None)
            for b in rig.data.bones]
    parts, arrays = [], {}
    def add(o, kind, mats, extra=None, keep=(), attrs=()):
        k = f'p{len(parts)}'; d = grab(o, origin, bix, keep, attrs)
        for a, v in d.items(): arrays[f'{k}_{a}'] = v
        parts.append(dict(key=k, name=o.name, kind=kind, mats=mats, **(extra or {}))); return k
    add(body, 'body', [dict(kind='bake', img=bake(body, os.path.join(folder, 'skin.png'), 1024), rough=.55)], keep=KEEP_MASKS)
    h = bpy.data.objects[name + '.head']
    add(h, 'head', [dict(kind='bake', img=bake(h, os.path.join(folder, 'face.png'), 1024), rough=.5)])
    add(bpy.data.objects[name + '.eyes'], 'eyes', [dict(kind='eye', iris=(.035, .016, .008))], attrs=('eye_a',))
    sc = bpy.data.objects.get(name + '.scalp')
    if sc: add(sc, 'scalp', [dict(kind='flat', color=cut_colour(sc), rough=.85)])
    for o in bpy.data.objects:   # his own hair (the dreads)
        if o.get('nw') != name or o.type != 'MESH' or o.get('nw_cloth') or o == sc or not o.get('nw_hair'): continue
        add(o, 'hair', [dict(kind='flat', color=cut_colour(o), rough=.85)], dict(hide=[]))
    keys = list(OUTFITS); outfits = []
    for i, k in enumerate(keys):
        fn, shoes, head = OUTFITS[k]; p = PAL[name]
        sw = []
        for r in SW_M[k]:
            v = r if r.startswith('#') else p.get(r, '#808080')
            sw.append(swatch(v, folder))
        outfits.append(dict(id=k, name=NAMES[k], shoes=shoes, sw=sw))
        for o in bpy.data.objects:
            if o.get('nw') != name or o.get('nw_cloth') != k or o.type != 'MESH': continue
            mats = []
            for s in o.material_slots:
                mn = s.material.name if s.material else ''
                role = 'sole' if mn == 'NW_Fab_sole' else mn[len(f'NW_Fab_{name}_'):] if mn.startswith(f'NW_Fab_{name}_') else None
                mats.append(dict(kind='cloth', role=role, spec=spec_for(name, role) if role in ROLE else {'color': '#1a1716', 'rough': .6}))
            add(o, 'cloth', mats, dict(outfit=i, piece=re.sub(r'\.\d+$', '', o.name).split('.')[-1], head=1 if head and o.name.endswith('.' + head) else 0), attrs=('part', 'side'))
    for o in rig.children:
        if o.get('nw_shoe') and o.get('nw_outfits'):
            im = next((n.image for s in o.material_slots if s.material for n in s.material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
            ois = [keys.index(x) for x in o.get('nw_outfits', '').split(',') if x in keys]
            if ois: add(o, 'shoe', [dict(kind='image', img=copy_image(im, folder), rough=.6) if im else flat(o.material_slots[0].material)], dict(outfits=ois, shoe=o['nw_shoe']))
    meta = dict(person=name, id=man_id(name), male=True, skin=list(SKIN[MEN[name]['tone']]), height=float(body.dimensions.z), outfits=outfits, bones=skel, parts=parts,
                eye=dict(k=EYE['k'], white=list(EYE['white'])))
    np.savez_compressed(os.path.join(folder, 'parts.npz'), **arrays)
    json.dump(meta, open(os.path.join(folder, 'parts.json'), 'w'), indent=1)
    log('exported', name, len(parts), 'parts', sum(v.nbytes for v in arrays.values()) // 1000, 'kB')
    return folder
