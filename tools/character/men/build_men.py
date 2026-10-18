"""Build the nine men with the new head: body, head (with his own small changes), eyes, brows and beard, his haircut or hair.
Run in naija_men.blend after mload.py: build(name, x) for each; men are placed 1 m apart (build_all)."""
import bpy, bmesh, time

def dreads_src():
    """'Short Dreadlocks' by tikoavp (Sketchfab, CC BY) as one dark mesh, without the head it came on"""
    o = bpy.data.objects.get('HAIR_dreads')
    if o: return o
    parts = [p for p in bpy.data.objects if p.type == 'MESH' and p.name.startswith('NurbsPath') and p.name.endswith('_Dreads_0')]
    bm = bmesh.new()
    for p in parts:
        me = p.data.copy(); me.transform(p.matrix_world); bm.from_mesh(me); bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new('HAIR_dreads'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('HAIR_dreads', me); bpy.context.scene.collection.objects.link(o)
    for p in me.polygons: p.use_smooth = True
    m, nt, b = new_mat('NW_Dreads'); L = nt.links
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 300.; nz.inputs['Detail'].default_value = 8.
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = .6; mr.inputs['To Max'].default_value = 1.5; L.new(nz.outputs['Fac'], mr.inputs['Value'])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
    next(i for i in mx.inputs if i.name == 'Factor' and i.type == 'VALUE').default_value = 1.
    next(i for i in mx.inputs if i.name == 'A' and i.type == 'RGBA').default_value = (.016, .012, .01, 1)
    L.new(mr.outputs['Result'], next(i for i in mx.inputs if i.name == 'B' and i.type == 'RGBA'))
    L.new(next(x for x in mx.outputs if x.type == 'RGBA'), b.inputs['Base Color']); b.inputs['Roughness'].default_value = .7
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .6; L.new(nz.outputs['Fac'], bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    me.materials.append(m)
    for p in parts: p.hide_render = True; p.hide_set(True)
    hd = bpy.data.objects.get('Head__0')
    if hd: hd.hide_render = True; hd.hide_set(True)
    return o

def dreads_mat():
    m = bpy.data.materials.get('NW_Dreads3')
    if m: return m
    m, nt, b = new_mat('NW_Dreads3'); L = nt.links
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 300.; nz.inputs['Detail'].default_value = 8.
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = .6; mr.inputs['To Max'].default_value = 1.5; L.new(nz.outputs['Fac'], mr.inputs['Value'])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
    next(i for i in mx.inputs if i.name == 'Factor' and i.type == 'VALUE').default_value = 1.
    next(i for i in mx.inputs if i.name == 'A' and i.type == 'RGBA').default_value = (.006, .0045, .0038, 1)
    L.new(mr.outputs['Result'], next(i for i in mx.inputs if i.name == 'B' and i.type == 'RGBA'))
    L.new(next(x for x in mx.outputs if x.type == 'RGBA'), b.inputs['Base Color']); b.inputs['Roughness'].default_value = .85
    i = inp(b, 'Specular IOR Level')
    if i: i.default_value = .2
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .7; L.new(nz.outputs['Fac'], bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m

def trim_front(h, name):
    """dreads off his face: the locks in front of his ears that hang below his brows go (as if tied back)"""
    H = head_of(name); me = h.data
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); seen = set(); kill = []
    for v0 in bm.verts:
        if v0.index in seen: continue
        part = []; st = [v0]; seen.add(v0.index)
        while st:
            v = st.pop(); part.append(v)
            for e in v.link_edges:
                w = e.other_vert(v)
                if w.index not in seen: seen.add(w.index); st.append(w)
        zs = [v.co.z for v in part]; ys = [v.co.y for v in part]
        if min(zs) < H['eyez'] + .065 and sum(ys) / len(ys) < H['cy'] - .01: kill += part
        elif min(zs) < H['eyez'] - .09: kill += part   # (nothing past the jaw)
    bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(me); bm.free()
    log('dreads trimmed', name, len(kill), 'points off')

def to_head(h, name):
    rig = bpy.data.objects['NW_' + name.replace(' ', '_')]
    mw = h.matrix_world.copy(); h.parent = rig; h.matrix_world = mw
    g = h.vertex_groups.get('mixamorig:Head') or h.vertex_groups.new(name='mixamorig:Head'); g.add(list(range(len(h.data.vertices))), 1., 'REPLACE')
    if not any(m.type == 'ARMATURE' for m in h.modifiers): m = h.modifiers.new('Armature', 'ARMATURE'); m.object = rig
    h['nw'] = name; h['nw_hair'] = 1

def build(name, x):
    t = time.time(); P = MEN[name]
    for o in list(bpy.data.objects):
        if o.get('nw') == name: bpy.data.objects.remove(o, do_unlink=True)
    r, b = make_man(name, x=x, clothes=PREVIEW_WEAR_M)
    kind, src = P['hair']; mh = None
    if kind == 'mh':
        o = next((c for c in r.children_recursive if src in c.name), None)
        if o:
            mh = as_mesh([o], 'HAIR_' + name.replace(' ', '_')); mh.data.materials.clear()
            for sl in o.material_slots: mh.data.materials.append(sl.material)
            bpy.data.objects.remove(o, do_unlink=True)
    h, parts = swap(name, size=P.get('size', 1.0), shape=P.get('shape')); eye_mats(name)
    b.data.materials[0] = h.data.materials[0]   # one skin for head and body: the join can't show
    if kind == 'cap': haircut(name, src)
    elif kind == 'mh' and mh: head_scalp(name, front=.056); fit(mh, name, width=None, lift=.003); to_head(mh, name)
    elif kind == 'dl':
        head_scalp(name, front=.056)
        hh = dreads_src().copy(); hh.data = hh.data.copy(); hh.name = 'HAIR_' + name.replace(' ', '_'); bpy.context.scene.collection.objects.link(hh)
        hh.hide_render = False; hh.hide_set(False); fit(hh, name, **P.get('hair_fit', dict(lift=.006)))
        trim_front(hh, name); hh.data.materials.clear(); hh.data.materials.append(dreads_mat())
        for pl in hh.data.polygons: pl.material_index = 0
        to_head(hh, name)
    log('built', name, round(time.time() - t, 1), 's')

def build_all(names=None):
    names = names or list(k for k in MEN if not k.startswith('_'))
    for i, nm in enumerate(names): build(nm, (i - 4) * 1.0)
