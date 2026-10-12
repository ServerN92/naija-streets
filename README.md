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

Life on the streets: traffic moves fast on the highways and big roads, so people never walk across them: they use the footbridges; hawkers walk out between the cars when the light turns
red and run back on green; at the motor park conductors call out, the queue climbs into a danfo and it leaves full,
then another rolls in; pupils stand at the school gates in school hours; in the markets the mallams and market women
sell from their stalls and crowds of shoppers go from stall to stall. People only dance at the hotel.

## Shared time and weather
Every player computes the same game time and weather from the server clock (the HTTP Date header), so day, night,
rain and harmattan change for everyone at the same moment. One game day lasts 48 minutes, and the night (20:00 to 05:00)
flies past in about 3 of them, bright and moonlit; weather can change every 16 minutes and follows the Lagos seasons (rain April–October,
harmattan December–February).

## People
Nine characters from Mixamo live in the city: mama, lady_red, lady_black, hawker, baba, areaboy, schoolboy, girl and
suit_lady. Women walk, run, stand, talk and dance with women's moves (Walking, Goofy Running, Idle, Talking, Thinking,
Bashful, Macarena, Salsa, ...).
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

## Your profile
The first time, you type a name and choose man or woman. It is kept on the device and cannot be changed afterwards.
A woman plays as the girl in the white crop top and walks, runs and fights with women's moves; the wardrobe shows
the looks of your own side only.

## Life, fighting and the police
Your life bar is always at the top left. Fights are fast: J or click punches (jab, cross, jab… presses made during a
blow come out as soon as it allows), K or right click kicks, and a kick after two punches is the finisher that floors
him. L or Q dodges (a quick slip that blows can't touch; hit straight after and it lands harder). G next to the man you
are fighting slams him down ("jack" him); hit someone lying on the floor and you go down on him and keep hitting, blood
spreading, until he stops moving. Running turns a punch into a takedown and a kick into a drop kick. Phones: the red
buttons (PUNCH, KICK, DODGE) and GRAB. Each blow carries you onto your man and freezes for a moment when it lands.
Area boys circle you, step into their blows and sometimes slip yours. You are stronger than anyone on the street, but a
gang of area boys can beat you to death, and so can a fast car; you wake up at the LUTH gate in Idi-Araba with full life
and no stars. People bleed when hit; a person hit hard by a car twice (or once at highway speed) dies.
Moves made from other moves for now (until the Mixamo ones arrive): the ground punches (crouched legs from Standing Up,
arms from Punching), the dodge (Big Side Hit, and its mirror), hands up (Hand Raising mirrored onto both arms).

G (phones: GRAB) picks someone up over your shoulder; G again puts them down. Area boys who see it come to beat you.
E at a car with someone in it is a carjack: you walk to the driver's door and threaten him (Threatening); he climbs out
with his hands up and runs, passengers too, and some area boys come back fighting for their car.

## Your phone: OYA RIDE
P (phones: the phone button at the top) takes out your phone; you hold it in your right hand
(`assets/models/phone.glb`). Pick where you are going: a driver accepts and drives to the street nearest you by the real
streets (one-ways included), with an OYA RIDE sign on the roof and a T on the minimap. Walk to the car and press E
(or Get in on the phone). He drives you there through the traffic with the route on the minimap; skip the ride from the
phone, or get down anywhere when the car is slow. You pay the fare shown (cash).

A fight, a killing or a kidnapping brings the nearest police van to the spot. It parks anyhow and everyone still
fighting or lying there walks into the van (the officers stay inside until a police officer model is added). If you
were part of it, or the police catch you with wanted stars, you spend three minutes in the cell at Mushin police
station with the others, then they let you out.

## Eko Grand Hotel
The office tower a short walk from your house is the hotel. Walk to the yellow ring at its door and press E to enter the lounge
bar (`assets/models/hotel_bar.glb`, downloaded only when you come near). Women dance on the floor there.

## Wardrobe
At home, walk to the wardrobe and press E to change your clothes. You keep your own face: each look lends you its body
and clothes, its head and neck are cut away (with loose braids) and your own head and neck are skinned onto its
skeleton, so they move with it. Men pick from the men's clothes, women from the women's. Shirt and trousers can be dyed
(a dress, kaftan or thobe takes one colour); the dye keeps the cloth's folds and prints and leaves skin alone.
Extra full looks (`outfit_suit`, `outfit_thobe`, `outfit_tracksuit`, `outfit_dress_pink`, `outfit_casual`) show up by
themselves once `assets/people/<id>.glb` exists: rig the model in Mixamo, download FBX *with skin*, convert and pack it
like a character (above), name it after its id, and run `tools/manifest.py`. `tools/mixamo_prep.py` turns a Tripo/Meshy
FBX into a Mixamo upload (`name:casual` repaints a revealing outfit as a top and jeans).

## Billboards
`assets/models/billboard.glb` (Poly by Google) stands along the main roads, angled to the traffic, with six Lagos ads
drawn in the game; they light up at night.

## Trees
Street trees and palms are 8-view pictures of real tree models (`tools/impostor.py`), drawn in one batch per kind.

## Adding a new model
Export from Tripo or Meshy as GLB, then make a light near version and a far version, for example:
`python3 tools/lod.py big.glb assets/models/name.glb 3000 1024 /path/to/gltfpack` and the same with `700 512` for `name_lod1.glb`.
Add it to `MODEL_FILES` in `src/game.js`, run the two commands above, commit and push.

Map data © OpenStreetMap contributors, ODbL.
