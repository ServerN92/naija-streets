"""Write one woman out of naija_women.blend for the game builder (women_glb.py, run outside Blender):
every part in the rest pose (A-pose) with its corners' normals and uvs, skin weights (4 per vertex), the skeleton,
the outfits and how each material looks; the made-in-Blender colours (skin, face with lipstick, gele) baked into pictures,
and the hair / shoe pictures copied next to it.  Output: <W>/export/<Name>/ (parts.npz, parts.json, *.png).
Run after women_lib.py, head_swap.py, headwear.py, women_cloth.py (wload.py)."""
import bpy, os, re, json, math, shutil
import numpy as np

EXP = os.path.join(W, 'export')
KEEP_MASKS = ('Hide helpers', 'NW_HideOldHead')

def slug(name): return name.replace(' ', '_')

def evaluated(o, keep_masks=()):
    """the part in the rest pose: no subdivision, no thickness, only the masks asked for"""
    rig = o.parent if o.parent and o.parent.type == 'ARMATURE' else None
    saved = []
    for md in o.modifiers:
        if md.type in ('SUBSURF', 'SOLIDIFY', 'MASK'):
            saved.append((md, md.show_viewport)); md.show_viewport = md.type == 'MASK' and md.name in keep_masks
    pp = rig.data.pose_position if rig else None
    if rig: rig.data.pose_position = 'REST'
    bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    ev = o.evaluated_get(dg); me = ev.to_mesh()
    return ev, me, saved, rig, pp

def release(ev, saved, rig, pp):
    ev.to_mesh_clear()
    for md, s in saved: md.show_viewport = s
    if rig: rig.data.pose_position = pp

def grab(o, origin, bone_index, keep_masks=(), attrs=()):
    ev, me, saved, rig, pp = evaluated(o, keep_masks)
    try:
        n, nl, npo = len(me.vertices), len(me.loops), len(me.polygons)
        co = np.zeros(n * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
        M = np.array(o.matrix_world, np.float64); V = co @ M[:3, :3].T + M[:3, 3] - origin
        L = np.zeros(nl, np.int32); me.loops.foreach_get('vertex_index', L)
        LS = np.zeros(npo, np.int32); me.polygons.foreach_get('loop_start', LS)
        LT = np.zeros(npo, np.int32); me.polygons.foreach_get('loop_total', LT)
        MI = np.zeros(npo, np.int32); me.polygons.foreach_get('material_index', MI)
        N = np.zeros(nl * 3, np.float32); me.corner_normals.foreach_get('vector', N); N = N.reshape(-1, 3)
        Nm = np.linalg.inv(M[:3, :3]).T; N = N @ Nm.T; N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
        out = dict(V=V.astype(np.float32), L=L, LS=LS, LT=LT, MI=MI, N=N.astype(np.float32))
        for uv in me.uv_layers:
            a = np.zeros(nl * 2, np.float32); uv.data.foreach_get('uv', a); out['UV_' + uv.name] = a.reshape(-1, 2)
        for nm in attrs:
            at = me.attributes.get(nm)
            if at and at.domain == 'POINT' and at.data_type == 'FLOAT':
                a = np.zeros(n, np.float32); at.data.foreach_get('value', a); out['A_' + nm] = a
        # skin weights: the four strongest bones of each vertex
        names = [g.name for g in o.vertex_groups]
        JI = np.zeros((n, 4), np.uint8); JW = np.zeros((n, 4), np.float32)
        for v in me.vertices:
            ws = sorted(((g.weight, bone_index[names[g.group]]) for g in v.groups if g.group < len(names) and names[g.group] in bone_index and g.weight > 1e-4), reverse=True)[:4]
            s = sum(w for w, _ in ws)
            for k, (w, j) in enumerate(ws): JI[v.index, k] = j; JW[v.index, k] = w / s if s > 0 else 0
        out['JI'] = JI; out['JW'] = JW
        return out
    finally: release(ev, saved, rig, pp)

# ------------------------------------------------------------------ baking the made-in-Blender colours
def ensure_uv(o):
    if o.data.uv_layers: return
    vis = (o.hide_viewport, o.hide_get(), o.hide_select)
    o.hide_viewport = False; o.hide_set(False); o.hide_select = False
    if bpy.context.object and bpy.context.object.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.02)
    bpy.ops.object.mode_set(mode='OBJECT')
    o.hide_viewport, _, o.hide_select = vis; o.hide_set(vis[1])

def bake(o, path, size=1024):
    """the material's base colour as a picture over the part's uvs (an emission bake, so light plays no part)"""
    sc = bpy.context.scene; eng = sc.render.engine; sc.render.engine = 'CYCLES'
    try: sc.cycles.samples = 2
    except Exception: pass
    vis = (o.hide_viewport, o.hide_render, o.hide_get(), o.hide_select)
    o.hide_viewport = False; o.hide_render = False; o.hide_set(False); o.hide_select = False
    masks = [(md, md.show_render, md.show_viewport) for md in o.modifiers if md.type == 'MASK' and md.name.startswith('Delete.')]
    for md, _, _ in masks: md.show_render = md.show_viewport = False
    others = [x for x in sc.objects if x.type == 'MESH' and x is not o and not x.hide_render]
    for x in others: x.hide_render = True                 # Cycles only needs this one part
    img = bpy.data.images.new('NW_bake_' + os.path.basename(path), size, size, alpha=False)
    undo = []
    for m in [s.material for s in o.material_slots if s.material]:
        nt = m.node_tree; P = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None); out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
        if not P or not out: continue
        em = nt.nodes.new('ShaderNodeEmission'); bc = P.inputs['Base Color']
        if bc.is_linked: nt.links.new(bc.links[0].from_socket, em.inputs['Color'])
        else: em.inputs['Color'].default_value = bc.default_value
        old = out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].is_linked else None
        nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
        tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = img
        for n in nt.nodes: n.select = False
        tx.select = True; nt.nodes.active = tx
        undo.append((nt, em, tx, old, out))
    try:
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        o.data.uv_layers.active = o.data.uv_layers[0]
        bpy.ops.object.bake(type='EMIT', margin=6, use_clear=True)
        img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    finally:
        for nt, em, tx, old, out in undo:
            if old: nt.links.new(old, out.inputs['Surface'])
            nt.nodes.remove(em); nt.nodes.remove(tx)
        bpy.data.images.remove(img)
        for md, r, v in masks: md.show_render = r; md.show_viewport = v
        o.hide_viewport, o.hide_render, _, o.hide_select = vis; o.hide_set(vis[2])
        for x in others: x.hide_render = False
        sc.render.engine = eng
    log('baked', o.name, '->', os.path.basename(path))
    return os.path.basename(path)

def copy_image(img, folder):
    fn = os.path.basename(img.filepath_from_user() or img.name) or (img.name + '.png')
    if not os.path.splitext(fn)[1]: fn += '.png'
    dst = os.path.join(folder, fn)
    if img.packed_file: open(dst, 'wb').write(img.packed_file.data)
    else:
        src = bpy.path.abspath(img.filepath_from_user())
        if os.path.exists(src): shutil.copy(src, dst)
        else: img.filepath_raw = dst; img.file_format = 'PNG'; img.save()
    return fn

def principled(m): return next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if m and m.use_nodes else None
def flat(m):
    P = principled(m); c = tuple(P.inputs['Base Color'].default_value)[:3] if P else (.5, .5, .5)
    return dict(kind='flat', color=c, rough=P.inputs['Roughness'].default_value if P else .6)

def hair_mat(m, folder):
    """a hair material: its picture (kept with its alpha) and the dark tint it is multiplied by in Blender"""
    nt = m.node_tree; texs = [n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image]
    if not texs: return flat(m)
    mix = next((n for n in nt.nodes if n.type == 'MIX' and n.blend_type == 'MULTIPLY'), None)
    tint = None
    if mix:
        for s in mix.inputs:
            if s.type == 'RGBA' and not s.is_linked: tint = tuple(s.default_value)[:3]
    col = next((t for t in texs if 'normal' not in t.image.name.lower()), texs[0]); nrm = next((t for t in texs if 'normal' in t.image.name.lower()), None)
    mr = next((n for n in nt.nodes if n.type == 'MAP_RANGE'), None)
    P = principled(m)
    d = dict(kind='hair', img=copy_image(col.image, folder), tint=tint, alpha=bool(P and P.inputs['Alpha'].is_linked),
             range=(mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value) if mr else None, rough=P.inputs['Roughness'].default_value if P else .5)
    if nrm: d['normal'] = copy_image(nrm.image, folder)
    return d

def export(name):
    rig = bpy.data.objects['NW_' + slug(name)]; body = bpy.data.objects[name + '.body']
    folder = os.path.join(EXP, slug(name)); os.makedirs(folder, exist_ok=True)
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
    # body and face
    add(body, 'body', [dict(kind='bake', img=bake(body, os.path.join(folder, 'skin.png'), 1024), rough=.55)], keep=KEEP_MASKS)
    h = bpy.data.objects[name + '.head']
    add(h, 'head', [dict(kind='bake', img=bake(h, os.path.join(folder, 'face.png'), 1024), rough=.5)])
    add(bpy.data.objects[name + '.eyes'], 'eyes', [dict(kind='eye', iris=(.035, .016, .008))], attrs=('eye_a',))
    for nm in ('brows', 'liner', 'scalp'):
        o = bpy.data.objects.get(name + '.' + nm)
        if o: add(o, nm, [flat(s.material) for s in o.material_slots])
    # hair (hidden under a gele outfit) and her everyday head wear
    gele_outfits = [k for k, (fn, sh, hd) in OUTFITS.items() if (hd == 'gele' and PAL[name]['gele'] is not None) or hd == 'beret']   # (her hair is under a gele or a beret)
    for o in bpy.data.objects:
        if o.get('nw') != name or o.type != 'MESH' or o.get('nw_cloth'): continue
        if o.get('nw_hair'):
            add(o, 'hair', [hair_mat(s.material, folder) for s in o.material_slots], dict(hide=gele_outfits))
        elif o.get('nw_headwear') == name:
            ensure_uv(o)
            add(o, 'hair', [dict(kind='bake', img=bake(o, os.path.join(folder, slug(o.name.split('.')[-1]) + '.png'), 512), rough=.45)], dict(hide=gele_outfits))
    # the outfits
    keys = list(OUTFITS)
    outfits = []
    for i, k in enumerate(keys):
        fn, shoes, head = OUTFITS[k]; p = PAL[name]
        top = {'gown': p['gown'], 'iro_buba': p['buba'], 'bodycon': p['bodycon'], 'jeans': p['crop'], 'joggers': p['tee'], 'office': p['blazer'], 'fitness': p['bra'],
               'club': p['sequin'], 'night': p['satin'], 'police': '#121419', 'rags': '#b9b09a'}[k]
        bot = {'gown': p['gown'], 'iro_buba': p['iro'], 'bodycon': p['bodycon'], 'jeans': '#3d5687', 'joggers': p['jog'], 'office': p['blazer'], 'fitness': p['leggings'],
               'club': p['sequin'], 'night': p['satin'], 'police': '#121419', 'rags': '#7a6a4e'}[k]
        outfits.append(dict(id=k, name=NAMES[k], shoes=shoes, sw=[swatch(top, folder), swatch(bot, folder)]))
        for o in bpy.data.objects:
            if o.get('nw') != name or o.get('nw_cloth') != k or o.type != 'MESH': continue
            if o.name.endswith('.gele'):
                ensure_uv(o)
                add(o, 'cloth', [dict(kind='bake', img=bake(o, os.path.join(folder, f'gele_{k}.png'), 512), rough=.45)], dict(outfit=i, piece='gele', head=1))
                continue
            mats = []
            for s in o.material_slots:
                mn = s.material.name if s.material else ''
                role = 'sole' if mn == 'NW_Fab_sole' else mn[len(f'NW_Fab_{name}_'):] if mn.startswith(f'NW_Fab_{name}_') else None
                mats.append(dict(kind='cloth', role=role, spec=spec_for(name, role) if role in ROLE else {'color': '#1a1716', 'rough': .6}))
            add(o, 'cloth', mats, dict(outfit=i, piece=re.sub(r'\.\d+$', '', o.name).split('.')[-1]), attrs=('part', 'side'))
    for o in rig.children:
        if o.get('nw_shoe'):
            im = next((n.image for s in o.material_slots if s.material for n in s.material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
            ois = [keys.index(x) for x in o.get('nw_outfits', '').split(',') if x in keys]
            add(o, 'shoe', [dict(kind='image', img=copy_image(im, folder), rough=.6) if im else flat(o.material_slots[0].material)], dict(outfits=ois, shoe=o['nw_shoe']))
    meta = dict(person=name, id='p_' + {'Mama Nkechi': 'nkechi', 'Iya Basira': 'basira', 'Sgt Halima': 'halima'}.get(name, name.lower()), skin=list(SKIN[WOMEN[name]['tone']]),
                height=float(body.dimensions.z), outfits=outfits, bones=skel, parts=parts)
    np.savez_compressed(os.path.join(folder, 'parts.npz'), **arrays)
    json.dump(meta, open(os.path.join(folder, 'parts.json'), 'w'), indent=1)
    log('exported', name, len(parts), 'parts', sum(v.nbytes for v in arrays.values()) // 1000, 'kB')
    return folder

def swatch(v, folder):
    """the wardrobe button colour: a hex colour, or the average of a print"""
    if isinstance(v, str) and v.startswith('#'): return v
    p = os.path.join(TEXC, v + '.png')
    if not os.path.exists(p): return '#888888'
    im = bpy.data.images.load(p, check_existing=True); px = np.array(im.pixels[:]).reshape(-1, 4)[::97, :3].mean(0)
    s = [((c * 12.92) if c <= .0031308 else (1.055 * c ** (1 / 2.4) - .055)) for c in px] if im.colorspace_settings.name != 'sRGB' else list(px)
    return '#' + ''.join('%02x' % int(max(0, min(1, c)) * 255) for c in s)
