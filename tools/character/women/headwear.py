"""Gele (the big Nigerian head tie) and a simple head scarf, built for one of the women's heads.
Run after women_lib.py (uses head_frame, mesh_obj, skin_to, new_mat, inp, log)."""
import bpy, math, random
from mathutils import Vector

def _frame(name):
    rig = bpy.data.objects['NW_' + name.replace(' ', '_')]; body = bpy.data.objects[name + '.body']
    F = head_frame(rig, body)
    hv = [p for p in F['V'] if p.z > F['eyez'] - .01 and (p - F['ctr']).length < .2]
    F['w'] = max(p.x for p in hv) - min(p.x for p in hv); F['d'] = max(p.y for p in hv) - min(p.y for p in hv)
    F['top'] = max(p.z for p in hv); F['cy'] = (max(p.y for p in hv) + min(p.y for p in hv)) / 2
    return rig, body, F

def fabric(nm, base, accent, sheen=.6, scale=38., kind='aso'):
    """Shiny aso-oke / damask cloth: two colours in a woven stripe and a soft pattern."""
    m, nt, b = new_mat(nm)
    tc = nt.nodes.new('ShaderNodeTexCoord'); w = nt.nodes.new('ShaderNodeTexWave'); w.inputs['Scale'].default_value = scale
    w.wave_type = 'BANDS'; w.inputs['Distortion'].default_value = 2.; w.inputs['Detail'].default_value = 3.
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale * 1.6
    nt.links.new(tc.outputs['Object'], w.inputs['Vector']); nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].position = .42; ramp.color_ramp.elements[1].position = .58
    ramp.color_ramp.elements[0].color = (*base, 1); ramp.color_ramp.elements[1].color = (*accent, 1)
    mx = nt.nodes.new('ShaderNodeMath'); mx.operation = 'ADD'; nt.links.new(w.outputs['Fac'], mx.inputs[0]); nt.links.new(nz.outputs['Fac'], mx.inputs[1])
    mm = nt.nodes.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; mm.inputs[1].default_value = .5; nt.links.new(mx.outputs[0], mm.inputs[0])
    nt.links.new(mm.outputs[0], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = .38
    for k, v in (('Sheen Weight', sheen), ('Sheen Roughness', .35), ('Specular IOR Level', .45), ('Metallic', .15 if kind == 'aso' else 0.)):
        i = inp(b, k)
        if i: i.default_value = v
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .25; bump.inputs['Distance'].default_value = .0006
    nt.links.new(w.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    try: m.use_backface_culling = False
    except Exception: pass
    return m

def wrap(F, U=48, V=14, grow=.016, front=.05, side=.012, back=-.035, folds=7, amp=.0045, crown=.0):
    """The cloth wound round the head: an egg-shaped shell over the skull, its lower edge at the forehead, over the ears, to the nape."""
    cx, cy, ez = F['ctr'].x, F['cy'], F['eyez']
    a, b = F['w'] / 2 + grow, F['d'] / 2 + grow * 1.1
    zc = ez + .005; c = F['top'] - zc + grow * 1.15 + crown
    verts, faces = [], []
    for j in range(V + 1):
        for i in range(U):
            th = 2 * math.pi * i / U   # 0 = front (-y)
            fr = (1 + math.cos(th)) / 2   # 1 at the front, 0 at the back
            sd = abs(math.sin(th))
            e = (front * fr + back * (1 - fr)) * (1 - sd) + side * sd   # edge height above the eyes
            v = j / V; z0 = ez + e; zt = zc + c
            z = z0 + (zt - z0) * (1 - (1 - v) ** 1.0)
            t = max(0., min(1., (z - zc) / c)); r = math.sqrt(max(0., 1 - t * t)) if z > zc else 1.
            fold = 1 + amp / max(a, b) * math.sin(v * folds * math.pi * 2 + th * 1.5) * (1 - v * .6)
            x = cx + math.sin(th) * a * r * fold; y = cy - math.cos(th) * b * r * fold
            verts.append(Vector((x, y, z)))
    for j in range(V):
        for i in range(U):
            a0 = j * U + i; a1 = j * U + (i + 1) % U; faces.append((a0, a1, a1 + U, a0 + U))
    top = len(verts); verts.append(Vector((cx, cy, zc + c))); faces += [((V) * U + i, (V) * U + (i + 1) % U, top) for i in range(U)]
    return verts, faces

def fan(F, n=7, spread=150, height=.15, reach=.11, width=.06, pleats=6, depth=.007, tilt=25, seed=4):
    """The gele's fan of stiff pleated cloth standing up at the back of the head."""
    rnd = random.Random(seed); cx, cy = F['ctr'].x, F['cy']; z0 = F['top'] + .005
    verts, faces = [], []
    for k in range(n):
        ang = math.radians(-spread / 2 + spread * k / (n - 1))   # 0 = straight back
        dirh = Vector((math.sin(ang), math.cos(ang) * .9 + .1, 0)).normalized()
        anchor = Vector((cx + dirh.x * F['w'] * .18, cy + F['d'] * .12 + dirh.y * F['d'] * .12, z0 - .01))
        side = Vector((dirh.y, -dirh.x, 0))
        hk = height * (.75 + .5 * math.cos(ang * .9)) * (.92 + .16 * rnd.random()); rk = reach * (.8 + .4 * rnd.random())
        L, W = 9, pleats * 2
        base = len(verts)
        for i in range(L + 1):
            t = i / L
            up = math.sin(t * math.pi * .55) * hk + t * .01
            out = rk * t * (1 + .3 * t) + .01
            cen = anchor + dirh * out + Vector((0, 0, up)) + Vector((0, 0, -math.sin(math.radians(tilt)) * out * .3))
            wk = width * (.55 + .9 * t) * (1 - .25 * t * t)
            for s in range(W + 1):
                u = s / W - .5; zig = depth * (1 if s % 2 else -1) * (.4 + .6 * t)
                nrm = (dirh * math.cos(math.radians(tilt)) + Vector((0, 0, -.4))).normalized()
                p = cen + side * (u * wk) + nrm * zig + Vector((0, 0, u * wk * .25 * math.sin(ang)))
                verts.append(p)
        for i in range(L):
            for s in range(W):
                q = base + i * (W + 1) + s; faces.append((q, q + 1, q + W + 2, q + W + 1))
    return verts, faces

def gele(name, base=(.04, .12, .55), accent=(.85, .62, .16), knot=True):
    rig, body, F = _frame(name)
    for o in list(bpy.data.objects):
        if o.get('nw_headwear') == name: bpy.data.objects.remove(o, do_unlink=True)
    coll = body.users_collection[0]; mat = fabric('NW_Gele_' + name, base, accent)
    v1, f1 = wrap(F, crown=.012)
    v2, f2 = fan(F)
    off = len(v1); verts = v1 + v2; faces = f1 + [tuple(i + off for i in f) for f in f2]
    o = mesh_obj(name + '.gele', verts, faces, coll); o.data.materials.append(mat); o['nw_headwear'] = name
    skin_to(o, rig, {'mixamorig:Head': [1.] * len(verts)})
    so = o.modifiers.new('Solid', 'SOLIDIFY'); so.thickness = .0018; so.offset = 1
    sub = o.modifiers.new('Smooth', 'SUBSURF'); sub.levels = 1; sub.render_levels = 1
    log('gele', name, len(verts), 'verts', len(faces), 'faces')
    return o

def scarf(name, base=(.75, .32, .05), accent=(.05, .35, .15)):
    """A plain head scarf (for the hawker): a snug wrap with a knot of two short tails at the nape."""
    rig, body, F = _frame(name)
    for o in list(bpy.data.objects):
        if o.get('nw_headwear') == name: bpy.data.objects.remove(o, do_unlink=True)
    coll = body.users_collection[0]; mat = fabric('NW_Scarf_' + name, base, accent, sheen=.3, scale=22., kind='cotton')
    v1, f1 = wrap(F, grow=.009, front=.055, side=.02, back=-.05, folds=4, amp=.003)
    # the knot: two short tails hanging at the back
    cx, cy, ez = F['ctr'].x, F['cy'], F['eyez']; kn = Vector((cx, cy + F['d'] / 2 + .012, ez - .02))
    verts = list(v1); faces = list(f1)
    for sgn in (-1, 1):
        b0 = len(verts); L, W = 6, 3
        for i in range(L + 1):
            t = i / L
            for s in range(W + 1):
                u = s / W - .5
                verts.append(kn + Vector((sgn * (.012 + .02 * t) + u * .035, .01 + .015 * t, -.09 * t)))
        for i in range(L):
            for s in range(W):
                q = b0 + i * (W + 1) + s; faces.append((q, q + 1, q + W + 2, q + W + 1))
    o = mesh_obj(name + '.scarf', verts, faces, coll); o.data.materials.append(mat); o['nw_headwear'] = name
    skin_to(o, rig, {'mixamorig:Head': [1.] * len(verts)})
    so = o.modifiers.new('Solid', 'SOLIDIFY'); so.thickness = .0015; so.offset = 1
    sub = o.modifiers.new('Smooth', 'SUBSURF'); sub.levels = 1; sub.render_levels = 1
    log('scarf', name, len(verts), 'verts')
    return o

# ---- gele v2: layered bands round the head and one wide pleated fan behind ------------------------------------
def band(F, tilt, h0, h1, grow, U=56, V=3, ripple=.004, phase=0.):
    """One turn of cloth round the head: a ribbon on a tilted ring, from height h0 to h1 above the eyes (at the front)."""
    cx, cy, ez = F['ctr'].x, F['cy'], F['eyez']; a0, b0 = F['w'] / 2 + grow, F['d'] / 2 + grow * 1.1
    verts, faces = [], []
    for j in range(V + 1):
        hj = h0 + (h1 - h0) * j / V
        for i in range(U):
            th = 2 * math.pi * i / U; fr = math.cos(th)   # +1 front, -1 back
            z = ez + hj + math.radians(tilt) * .09 * (-fr)   # the ring tilts: lower at the back
            zz = (z - (ez + .005)) / (F['top'] - ez + grow)
            r = math.sqrt(max(.05, 1 - max(0., zz) ** 2))
            bulge = 1 + .18 * math.sin(math.pi * j / V) * (grow / .02) * .3 + ripple / a0 * math.sin(th * 9 + phase + j)
            verts.append(Vector((cx + math.sin(th) * a0 * r * bulge, cy - math.cos(th) * b0 * r * bulge, z)))
    for j in range(V):
        for i in range(U):
            a = j * U + i; b = j * U + (i + 1) % U; faces.append((a, b, b + U, a + U))
    return verts, faces

def crown_cap(F, grow, U=40, V=8):
    """The top of the head under the fan."""
    cx, cy, ez = F['ctr'].x, F['cy'], F['eyez']; a, b = F['w'] / 2 + grow, F['d'] / 2 + grow * 1.1
    zc = ez + .005; c = F['top'] - zc + grow
    verts, faces = [], []
    for j in range(V + 1):
        t = .55 + .45 * j / V; r = math.sqrt(max(0., 1 - t * t))
        for i in range(U):
            th = 2 * math.pi * i / U; verts.append(Vector((cx + math.sin(th) * a * r, cy - math.cos(th) * b * r, zc + c * t)))
    for j in range(V):
        for i in range(U):
            p = j * U + i; q = j * U + (i + 1) % U; faces.append((p, q, q + U, p + U))
    return verts, faces

def fan2(F, span=210, height=.15, side_h=.06, flare=32, pleats=34, depth=.009, U=70, V=8, back_push=.02):
    """One accordion fan standing round the back of the head, tallest at the back, flaring outward like a crown."""
    cx, cy, ez = F['ctr'].x, F['cy'], F['eyez']; a, b = F['w'] / 2 + .022, F['d'] / 2 + .026
    z0 = F['top'] - .03
    verts, faces = [], []
    for j in range(V + 1):
        t = j / V
        for i in range(U + 1):
            u = i / U; th = math.radians(180 - span / 2 + span * u)   # 180 = straight back
            back = (1 - math.cos(th)) / 2   # 1 at the back
            h = side_h + (height - side_h) * back ** 1.4
            zig = depth * (1 if (i * pleats // U) % 2 else -1) * (.3 + .7 * t)
            out = math.tan(math.radians(flare)) * h * t * t + back_push * back * t
            rx, ry = math.sin(th), -math.cos(th)
            rr = 1 + (out + zig) / max(a, b)
            verts.append(Vector((cx + rx * a * rr * (.82 + .18 * (1 - t)), cy + ry * b * rr * (.82 + .18 * (1 - t)) + back_push * back * t, z0 + h * t)))
    for j in range(V):
        for i in range(U):
            p = j * (U + 1) + i; faces.append((p, p + 1, p + U + 2, p + U + 1))
    return verts, faces

def fabric2(nm, base, accent, gold=.45):
    """Aso-oke: a fine woven diamond pattern in two colours, a little metallic."""
    m, nt, b = new_mat(nm)
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Rotation'].default_value = (0, 0, math.radians(45))
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    ch = nt.nodes.new('ShaderNodeTexChecker'); ch.inputs['Scale'].default_value = 140.; nt.links.new(mp.outputs['Vector'], ch.inputs['Vector'])
    ch.inputs['Color1'].default_value = (*base, 1); ch.inputs['Color2'].default_value = (*[min(1, c * 1.35) for c in base], 1)
    wv = nt.nodes.new('ShaderNodeTexWave'); wv.inputs['Scale'].default_value = 14.; wv.wave_type = 'BANDS'; wv.inputs['Distortion'].default_value = .5
    nt.links.new(tc.outputs['Object'], wv.inputs['Vector'])
    rm = nt.nodes.new('ShaderNodeMapRange'); rm.inputs['From Min'].default_value = .86; rm.inputs['From Max'].default_value = .9; nt.links.new(wv.outputs['Fac'], rm.inputs['Value'])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'
    nt.links.new(rm.outputs['Result'], next(s for s in mx.inputs if s.name == 'Factor' and s.type == 'VALUE'))
    nt.links.new(ch.outputs['Color'], next(s for s in mx.inputs if s.name == 'A' and s.type == 'RGBA'))
    next(s for s in mx.inputs if s.name == 'B' and s.type == 'RGBA').default_value = (*accent, 1)
    nt.links.new(next(o for o in mx.outputs if o.type == 'RGBA'), b.inputs['Base Color'])
    nt.links.new(rm.outputs['Result'], b.inputs['Metallic'])
    b.inputs['Roughness'].default_value = .32
    for k, v in (('Sheen Weight', .25), ('Sheen Roughness', .4), ('Specular IOR Level', .5)):
        i = inp(b, k)
        if i: i.default_value = v
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .2; bump.inputs['Distance'].default_value = .0004
    nt.links.new(ch.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m

def gele2(name, base=(.22, .01, .035), accent=(.95, .7, .22)):
    rig, body, F = _frame(name)
    for o in list(bpy.data.objects):
        if o.get('nw_headwear') == name: bpy.data.objects.remove(o, do_unlink=True)
    coll = body.users_collection[0]; mat = fabric2('NW_Gele_' + name, base, accent)
    parts = [wrap(F, grow=.014, front=.05, side=.012, back=-.045, folds=5, amp=.003, crown=.006),
             band(F, 22, .045, .085, .02, phase=0.), band(F, 14, .075, .115, .026, phase=1.3), band(F, 8, .1, .14, .03, phase=2.4),
             fan2(F)]
    verts, faces = [], []
    for v, f in parts:
        off = len(verts); verts += v; faces += [tuple(i + off for i in q) for q in f]
    o = mesh_obj(name + '.gele', verts, faces, coll); o.data.materials.append(mat); o['nw_headwear'] = name
    skin_to(o, rig, {'mixamorig:Head': [1.] * len(verts)})
    so = o.modifiers.new('Solid', 'SOLIDIFY'); so.thickness = .002; so.offset = 1
    sub = o.modifiers.new('Smooth', 'SUBSURF'); sub.levels = 1; sub.render_levels = 1
    log('gele2', name, len(verts), 'verts', len(faces), 'faces')
    return o
