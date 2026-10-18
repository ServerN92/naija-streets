"""Pack the "new life" pieces made in the user's Blender (tools/blender_life.py -> Documents/naija_rooms/life/<name>.json:
every face with a colour per corner, and the marks) into game models, the same kind of .glb as the other Blender pieces
(one mesh, vertex colours, Y up, front toward +Z, marks in the node's extras).

    python3 tools/life_pack.py <folder with the .json files>
"""
import sys, os, json, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glb_build

src = sys.argv[1] if len(sys.argv) > 1 else '.'
for f in sorted(glob.glob(os.path.join(src, 'ns_*.json'))):
    d = json.load(open(f))
    faces = [([tuple(p) for p in pts], [tuple(c) + (1.0,) for c in cols]) for pts, cols in d['faces']]
    glb_build.write_glb(d['name'], faces, d.get('marks') or None)
    print(d['name'], len(faces), 'faces', os.path.getsize(os.path.join(glb_build.OUT, d['name'] + '.glb')) // 1024, 'KB')
