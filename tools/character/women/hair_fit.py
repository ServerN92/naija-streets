"""Fit a downloaded hairstyle onto one of the women: one mesh, turned to face the same way, scaled to her head, sat on her scalp."""
import bpy, math
from mathutils import Vector, Matrix

def ev_verts(o):
    dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); me = e.to_mesh()
    vs = [o.matrix_world @ v.co for v in me.vertices]; e.to_mesh_clear(); return vs

def as_mesh(objs, name):
    """Join the parts into one mesh with its transforms applied (modifiers applied too)."""
    dg = bpy.context.evaluated_depsgraph_get(); parts = []
    for o in objs:
        e = o.evaluated_get(dg); me = bpy.data.meshes.new_from_object(e, depsgraph=dg); me.transform(o.matrix_world)
        n = bpy.data.objects.new(name + '_p', me); bpy.context.scene.collection.objects.link(n); parts.append(n)
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1: bpy.ops.object.join()
    h = bpy.context.view_layer.objects.active; h.name = name; h.data.name = name; h['nw_hair'] = 1
    return h

def head_of(woman):
    b = bpy.data.objects[woman + '.body']; vs = ev_verts(b)
    eyes = bpy.data.objects[woman + '.high-poly']; ez = sum((eyes.matrix_world @ v.co).z for v in eyes.data.vertices) / len(eyes.data.vertices)
    hd = [v for v in vs if v.z > ez - .01]
    x0, x1 = min(v.x for v in hd), max(v.x for v in hd); y0, y1 = min(v.y for v in hd), max(v.y for v in hd)
    return dict(cx=(x0 + x1) / 2, cy=(y0 + y1) / 2, top=max(v.z for v in hd), w=x1 - x0, d=y1 - y0, eyez=ez)

def fit(h, woman, rotz=0., rotx=0., width=None, scale=None, lift=.0, back=.0, cap=.1):
    """rotz/rotx in degrees about the hair's cap; width: wanted cap width (m) or scale; lift/back: nudge up / toward the back of the head."""
    H = head_of(woman); vs = [h.matrix_world @ v.co for v in h.data.vertices]; top = max(v.z for v in vs)
    cp = [v for v in vs if v.z > top - cap]; c = Vector(((min(v.x for v in cp) + max(v.x for v in cp)) / 2, (min(v.y for v in cp) + max(v.y for v in cp)) / 2, top))
    R = Matrix.Rotation(math.radians(rotz), 4, 'Z') @ Matrix.Rotation(math.radians(rotx), 4, 'X')
    me = h.data; me.transform(h.matrix_world); h.matrix_world = Matrix.Identity(4)
    me.transform(Matrix.Translation(-c)); me.transform(R)
    vs = [v.co for v in me.vertices]; top = max(v.z for v in vs); cp = [v for v in vs if v.z > top - cap]
    cw = max(v.x for v in cp) - min(v.x for v in cp); s = scale or ((width or H['w'] * 1.1) / cw)
    me.transform(Matrix.Scale(s, 4))
    vs = [v.co for v in me.vertices]; top = max(v.z for v in vs); cp = [v for v in vs if v.z > top - cap]
    c = Vector(((min(v.x for v in cp) + max(v.x for v in cp)) / 2, (min(v.y for v in cp) + max(v.y for v in cp)) / 2, top))
    me.transform(Matrix.Translation(Vector((H['cx'], H['cy'] + back, H['top'] + lift)) - c))
    me.update(); return s, H

def dark_hair(h, tint=(.03, .022, .018), rough=.5):
    """Make a downloaded hair black-brown: its picture's light and dark kept as detail, its alpha kept, its normal map kept."""
    for i, m in enumerate(h.data.materials):
        if not m or not m.node_tree: continue
        nt = m.node_tree; texs = [n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image]
        col = next((t for t in texs if 'base' in t.image.name.lower() or 'diff' in t.image.name.lower() or 'color' in t.image.name.lower()), texs[0] if texs else None)
        nrm = next((t for t in texs if 'normal' in t.image.name.lower()), None)
        nm = bpy.data.materials.new('NW_Hair_' + h.name + '_' + str(i)); nm.use_nodes = True; N = nm.node_tree
        for n in list(N.nodes): N.nodes.remove(n)
        out = N.nodes.new('ShaderNodeOutputMaterial'); b = N.nodes.new('ShaderNodeBsdfPrincipled'); N.links.new(b.outputs[0], out.inputs[0])
        if col:
            t = N.nodes.new('ShaderNodeTexImage'); t.image = col.image
            bw = N.nodes.new('ShaderNodeRGBToBW'); N.links.new(t.outputs['Color'], bw.inputs[0])
            mr = N.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = .45; mr.inputs['To Max'].default_value = 1.2; N.links.new(bw.outputs[0], mr.inputs['Value'])
            mx = N.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
            next(s for s in mx.inputs if s.name == 'Factor' and s.type == 'VALUE').default_value = 1.
            A = next(s for s in mx.inputs if s.name == 'A' and s.type == 'RGBA'); A.default_value = (tint[0], tint[1], tint[2], 1)
            N.links.new(mr.outputs['Result'], next(s for s in mx.inputs if s.name == 'B' and s.type == 'RGBA'))
            N.links.new(next(o for o in mx.outputs if o.type == 'RGBA'), b.inputs['Base Color'])
            if col.image.channels == 4 or col.image.depth in (32, 64): N.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
        else:
            b.inputs['Base Color'].default_value = (.35, .26, .1, 1) if i else (tint[0], tint[1], tint[2], 1)   # (beads: gold-brown)
        if nrm:
            t2 = N.nodes.new('ShaderNodeTexImage'); t2.image = nrm.image; nrm.image.colorspace_settings.name = 'Non-Color'
            nm_ = N.nodes.new('ShaderNodeNormalMap'); N.links.new(t2.outputs['Color'], nm_.inputs['Color']); N.links.new(nm_.outputs['Normal'], b.inputs['Normal'])
        b.inputs['Roughness'].default_value = rough
        try: b.inputs['Specular IOR Level'].default_value = .3
        except Exception: pass
        try: nm.surface_render_method = 'DITHERED'
        except Exception: pass
        h.data.materials[i] = nm
