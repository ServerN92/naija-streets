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
- `assets/maps/` – real street maps from OpenStreetMap (.json); `mushin_world.json` is the city you play in
- `tools/` – model shrinking (`lod.py`, `bake.py`), OpenStreetMap conversion (`osm_world.py`, `convert.py`), `manifest.py`, `stamp.py`

## The city: Mushin
The streets, buildings, markets, schools, railway and footpaths are the real Mushin (Lagos) from OpenStreetMap:
about 4,800 street pieces and 24,000 buildings over 3.3 × 3.3 km, with Ladipo, Mushin and Idi-Oro markets, Papa Ajao,
Fadeyi, Onipanu and Idi-Araba. Rebuilding it from a fresh OpenStreetMap export (.osm from openstreetmap.org → Export):
```
python3 tools/osm_world.py Mushin.osm assets/maps/mushin_world.json
```
The same command works for another area (Oshodi, Ajegunle); the game loads `mushin_world.json`.

Life on the streets: people cross the big roads by footbridge; hawkers walk out between the cars when the light turns
red and run back on green; at the motor park conductors call out, the queue climbs into a danfo and it leaves full,
then another rolls in; pupils stand at the school gates in school hours; in the markets the mallams and market women
sell from their stalls and people stop to buy.

## Shared time and weather
Every player computes the same game time and weather from the server clock (the HTTP Date header), so day, night,
rain and harmattan change for everyone at the same moment. One game day lasts 48 minutes, and the night (20:00 to 05:00)
flies past in about 3 of them, bright and moonlit; weather can change every 16 minutes and follows the Lagos seasons (rain April–October,
harmattan December–February).

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

## Fighting
On foot: J or click to punch, K or right click to kick, Space to jump; running turns a punch into a takedown and a kick
into a drop kick (phones: the red buttons). Area boys fight back in a group; other people run or quarrel. Hitting
people raises your wanted stars, and a police van comes for you along the streets; get caught and you are taken to
Mushin police station.

## Eko Grand Hotel
The office tower a short walk from your house is the hotel. Walk to the yellow ring at its door and press E to enter the lounge
bar (`assets/models/hotel_bar.glb`, downloaded only when you come near).

## Wardrobe
At home, walk to the wardrobe and press E to change your look: your usual character or any of the city's people.
Extra full looks (`outfit_suit`, `outfit_thobe`, `outfit_tracksuit`, `outfit_dress_pink`, `outfit_casual`) show up by
themselves once `assets/people/<id>.glb` exists: rig the model in Mixamo, download FBX *with skin*, convert and pack it
like a character (above), name it after its id, and run `tools/manifest.py`. `tools/mixamo_prep.py` turns a Tripo/Meshy
FBX into a Mixamo upload (`name:casual` repaints a revealing outfit as a top and jeans).

## Trees
Street trees and palms are 8-view pictures of real tree models (`tools/impostor.py`), drawn in one batch per kind.

## Adding a new model
Export from Tripo or Meshy as GLB, then make a light near version and a far version, for example:
`python3 tools/lod.py big.glb assets/models/name.glb 3000 1024 /path/to/gltfpack` and the same with `700 512` for `name_lod1.glb`.
Add it to `MODEL_FILES` in `src/game.js`, run the two commands above, commit and push.

Map data © OpenStreetMap contributors, ODbL.
