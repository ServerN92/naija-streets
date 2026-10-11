# Naija Streets

Open-world 3D game set in Lagos. Runs in the browser (phones, tablets, computers) with three.js. No build step.

## Play locally
Any static server works, for example `python3 -m http.server 8000`, then open http://localhost:8000

Testing a time or weather on your own machine only: `http://localhost:8000/?dev=1&hour=21&weather=rain`
(weather: clear, cloudy, rain, storm, harmattan). These switches are ignored on the live site.

## Before every publish
```
python3 tools/manifest.py   # if any model or character file changed (sizes drive the loading bar and cache keys)
python3 tools/stamp.py      # always: ties index.html and src/*.js to one release so phones never mix versions
```
Then commit and push. GitHub Pages serves the `main` branch.

## Folders
- `index.html`, `src/game.js` – the game; `src/clock.js` – shared world clock and weather; `src/mapview.js` – big map
- `sw.js`, `manifest.webmanifest` – offline cache and "Add to Home Screen"
- `assets/models/` – vehicles and buildings (.glb with meshopt geometry and KTX2 textures, plus `_lod1` far versions)
- `assets/characters/` – the player (`hero.glb`; the original Mixamo .fbx files are a fallback)
- `assets/people/` – the city's people (one .glb each) and `moves.glb` (every move, shared by all of them)
- `assets/maps/` – real street maps of Mushin, Oshodi and Ajegunle from OpenStreetMap (.json)
- `tools/` – model shrinking (`lod.py`, `bake.py`), OpenStreetMap conversion (`convert.py`), `manifest.py`, `stamp.py`

## Shared time and weather
Every player computes the same game time and weather from the server clock (the HTTP Date header), so day, night,
rain and harmattan change for everyone at the same moment. One game day lasts 48 minutes; weather can change every
16 minutes and follows the Lagos seasons (rain April–October, harmattan December–February).

## People
Seven characters from Mixamo live in the city: mama, lady_red, lady_black, hawker, baba, areaboy and schoolboy.
They walk the pavements, gist at shop fronts, hold junction corners, stand at compound gates and wave down danfos at
bus stops; they answer when you walk into them or horn at them. The nearest ones get the real body and moves
(Low 8, Medium 14, High 24); farther away the same person is a light look-alike in the same colours.

Adding a character or a move: export from Mixamo as FBX *with skin*, then
```
python3 tools/npc_convert.py /tmp/npc            # edit CAST and MOVES at the top first
sh tools/npc_pack.sh /tmp/npc /path/to/gltfpack  # shrink (gltfpack built with texture compression)
cp /tmp/npc/out/*.glb assets/people/
```
and add the character to `CAST` in `src/game.js` (height, how common, what it does, far look-alike colours).

## Adding a new model
Export from Tripo or Meshy as GLB, then make a light near version and a far version, for example:
`python3 tools/lod.py big.glb assets/models/name.glb 3000 1024 /path/to/gltfpack` and the same with `700 512` for `name_lod1.glb`.
Add it to `MODEL_FILES` in `src/game.js`, run the two commands above, commit and push.

Map data © OpenStreetMap contributors, ODbL.
