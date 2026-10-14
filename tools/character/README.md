# The new people: Tunde, Amaka and Ada

How `assets/people/p_tunde.glb`, `p_amaka.glb`, `p_ada.glb` and `moves2.glb` were made.

- `char/make_humans.py` (here `make_humans.py`) runs inside Blender with the MPFB (MakeHuman) add-on: bodies, faces, hair and renders.
- `cloth/` builds the eight outfits around each body (`outfits.py`, `garments.py`) and their fabrics (`gen_textures.py`).
- `charbuild/build_char.py Tunde Amaka Ada` writes one game file per person: body, eyes, hair, the four outfits and shoes on a
  Mixamo-named skeleton whose bones are turned like Mixamo's (so the game's moves play on it as they are).
- `anim/make_moves2.py <folder of Mixamo FBX> moves2.glb` turns the Mixamo moves (Idle, Walking, Swagger Walk, Female Walking,
  Running, Jump, Female Jump; Y Bot, without skin, 30 fps) into `moves2.glb`.
- Shrink for the game: `gltfpack -i out/tunde.glb -o p_tunde.glb -tc -tl 1024 -cc -kn -km -ke` and
  `gltfpack -i moves2_raw.glb -o moves2.glb -cc -kn -af 30`, then `python3 tools/manifest.py`.

In the game, `src/char2.js` fits moves onto them and switches outfits; `src/game.js` (look for `V2`) wears them.
The scripts still point at the folders they were made in; change the paths at the top before running them again.

## Mixamo people (Dayo, Tobi, Emeka, Femi, Mike, Chris, Lin)

`mixamo/mxconvert.py OUT_DIR` turns Mixamo FBX files (character with skin) into `assets/people/p_<name>.glb`: the browser
(three.js) does the shape and skin from a copy of the FBX without pictures (`fbxstrip.py`), and Python adds each material's
diffuse, normal and roughness pictures (`fbxtex.py`). Then `gltfpack -i out/mx_x.glb -o p_x.glb -tc -tl 1024 -cc -kn -km`.
Women's body shape (slim / curvy / thick) is made in the game (`shapeBody` in `src/char2.js`).
