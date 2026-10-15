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
- `index.html`, `src/game.js` – the game; `src/clock.js` – shared world clock and weather; `src/mapview.js` – big map;
  `src/skater.js` – the skateboarders' bodies (yours and the street skaters')
- `sw.js`, `manifest.webmanifest` – offline cache and "Add to Home Screen"
- `assets/models/` – vehicles and buildings (.glb with meshopt geometry and KTX2 textures, plus `_lod1` far versions)
- `assets/characters/` – the player (`hero.glb`; the original Mixamo .fbx files are a fallback)
- `assets/people/` – the city's people (one .glb each) and `moves.glb` (every move, shared by all of them)
- `assets/maps/` – real street maps from OpenStreetMap (.json); `mushin_world.json` is the city you play in
- `tools/` – model shrinking (`lod.py`, `bake.py`), OpenStreetMap conversion (`osm_world.py`, `convert.py`), `manifest.py`, `stamp.py`,
  big Meshy/Tripo models (`fbxbin.py`, `rebake.py`, `autorig.py`)

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
A few young people skate along the edge of the road (2 on Low, 3 otherwise), with the same body physics as you: they push,
carve and ollie now and then, keep off the highways, wait for people and cars in their way, and cars wait for them. Drive
into one and he falls off, gets up and rides on.

## Shared time and weather
Every player computes the same game time and weather from the server clock (the HTTP Date header), so day, night,
rain and harmattan change for everyone at the same moment. One game day lasts 2 hours: morning, afternoon and evening
about 35 minutes each, and the night (20:00 to 05:00) comes late and passes in about 8 minutes, bright and moonlit. Weather
can change every 40 minutes and follows the Lagos seasons (harmattan December–February). Rain hardly falls: a short
shower of about 9 minutes, mostly in April–October, then it clears to cloud and the roads dry.

## People
Nine characters from Mixamo live in the city: mama, lady_red, lady_black, hawker, baba, areaboy, schoolboy, girl and
suit_lady. Women walk, run, stand, talk and dance with women's moves (Walking, Goofy Running, Idle, Talking, Thinking,
Bashful, Macarena, Salsa, ...).
They walk the pavements, gist at shop fronts, hold junction corners, stand at compound gates and wave down danfos at
bus stops; they answer when you walk into them or horn at them. The nearest ones get the real body and moves
(Low 8, Medium 14, High 24). Farther away the same person is drawn by the crowd: when a character loads, its body is cut
down to about 2,200 triangles (1,500 on Low; meshoptimizer's simplifier, `src/libs/meshopt_simplifier.js`), takes its
colours from its own texture and is posed once in 8 walking frames, 6 running, standing, texting and lying; far walkers
pick the frame for where they are in their step, one instanced draw per character and frame. Tunde, Amaka and Ada are in
the crowd too (first outfit). People in danfos, buses, kekes, cars and on okadas are the same characters posed once for
the seat (drivers, passengers, okada riders and the pillion, the danfo conductor at the door, police in the pickup).
The old box people are gone.

Adding a character or a move: export from Mixamo as FBX *with skin*, then
```
python3 tools/npc_convert.py /tmp/npc            # edit CAST and MOVES at the top first
sh tools/npc_pack.sh /tmp/npc /path/to/gltfpack  # shrink (gltfpack built with texture compression)
cp /tmp/npc/out/*.glb assets/people/
```
and add the character to `CAST` in `src/game.js` (height, how common, what it does); the crowd and seat poses are made from it when it loads.

## Your profile
The first time, you type a name and choose man or woman. It is kept on the device and cannot be changed afterwards.
A woman plays as the girl in the white crop top and walks, runs and fights with women's moves; the wardrobe shows
the looks of your own side only.

## Life, fighting and the police
People are solid: they step around each other, and you can't walk through them. Bump into someone hard and he may
shove you back; shove a hothead twice and he fights. Stand and stare at someone too long and he asks "Wetin you dey
look?"; area boys and some others then fight you, the rest walk off.

Your life bar is always at the top left. Fights are fast: J or click punches (jab, cross, jab… presses made during a
blow come out as soon as it allows), K or right click kicks, and a kick after two punches is the finisher that floors
him. L or Q dodges (a quick slip that blows can't touch; hit straight after and it lands harder). G next to the man you
are fighting slams him down ("jack" him); hit someone lying on the floor and you go down on him and keep hitting, blood
spreading, until he stops moving. Running turns a punch into a takedown and a kick into a drop kick. Each blow carries
you onto your man and freezes for a moment when it lands.

Phones have few buttons: ATTACK (tap, tap, tap = jab, cross and the kick that floors him; running: a takedown; with a
gun FIRE, with a bomb THROW), JUMP (it turns into DODGE when a fight is on), E, and GRAB, which shows only when someone
is close (ROB with a weapon in hand, AIM with a gun). The joystick walks when pushed a little and runs when pushed all
the way. Tap the weapon name at the top to change weapon.
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
Pick Okada instead of Car for a bike man: cheaper, and he comes anywhere. On dirt roads and quiet back streets cars
won't come ("No car fit reach where you dey"), but the okada does; you ride on the back. "Main road" drops you at the
nearest big road.

## Carrying passengers
Drive a danfo, bus, keke, okada or car past a bus stop and people wave you down; now and then someone by the road waves
too. Stop by them and they get in (danfo 3, bus 4, keke 2, car 2, okada 1), tell you where they are going (the route
shows on the minimap) and pay when you stop there: the farther, the more. Too slow and they pay less; get out on the way
and they leave without paying.

## Your phone: OYA WORK
The second tab on the phone lists delivery jobs (a parcel, a crate of drinks, a birthday cake…). Take one, go to the
yellow PICK UP ring (the route is on the minimap), then reach the green DROP OFF ring before the time runs out, on foot,
driving or in an OYA RIDE. Late, and the customer pays only part; busted or wasted, and the package is gone. Urgent
jobs pay more and give less time.

## Money
Cash is at the top left (kept on the device; you start with ₦5,000). People you floor or kill drop their money: walk
over it to take it. With a weapon in your hand, G next to someone is a robbery: hands up, money on the floor, then they
run, and the people around run too. Market and shop sellers carry the day's sales. Jobs pay, rides cost the fare,
waking up at LUTH costs a hospital bill, and an arrest costs a fine.

## Weapons: Oga Shege's black market
Oga Shege hides in a zinc-fenced corner at the back of a market, away from the crowd (a red G on the minimap and on the
big map, where the Guns chip shows only him). His boys smoke at the gap in the fence and stop you: ₦100 to pass (E).
They don't let you push through; hit them and it's a fight. Inside, he stands at his table and sells a
police baton (₦8,000), a katana (₦25,000), an AK-47 with 30 bullets (₦120,000), more bullets (₦4,500 for 30), grenades
(₦15,000 for 3) and petrol bombs (₦6,000 for 3). Press E near him. 1–6 or Tab (phones: tap the weapon name) picks fists,
baton, katana, AK, grenade or petrol bomb. The baton and katana go in your right hand and
hit far harder (the katana kills); the AK rides on your back until you use it. Aim with the right mouse button or K
(phones: AIM), fire with the left button or J (phones: FIRE), R reloads. Firing without aiming helps only a little: it
picks someone right in front of you, and the bullets spread, so aiming is a skill. Gunshots empty the street.
Grenades and petrol bombs are thrown the same way (at the crosshair when aiming): a grenade bounces and goes off after two
seconds; a petrol bomb breaks and the ground burns for about ten seconds, setting people (and you) on fire. Models: `assets/models/weapon_ak.glb`, `weapon_katana.glb`, `weapon_baton.glb`
(the hands are put on the rifle by two-bone IK each frame).

## The police: 1 to 5 stars
Stars grow with the crime: a few punches at strangers, a robbery, a gunshot near people or a stolen car give one star,
and small crimes never go past two. Killings go up to three. Only attacking the police goes higher: hitting an officer
gives two stars, shooting at one three, and each officer killed more. If the police see it themselves (an officer or
a police car close by), a van comes for you at once. Otherwise somebody calls them and they take their time (about
40–55 seconds for one star, less for more), drive to where it happened and ask the people there. Still around, or in
their sight, and they come after you; long gone (or hiding indoors), and they give up and your stars clear.
When a van chases you and gets close it stops and
the officers jump out (`assets/people/police_f.glb`, `police_m.glb`, rigged by `tools/autorig.py`).
- 1 star: they run you down and grab you, no beating. Stand still next to them and you are BUSTED (cell at Mushin police
  station, a fine, and they take your AK and bombs, sometimes the katana). The cell time grows with every arrest:
  20 s, 40 s, 1 min, 1 min 10 s, 2 min, then 3 min each time. It is saved, so reloading the game puts you back in the
  cell with the time you had left. Stop your car near them and they walk to your
  door and pull you out.
- 2 stars: batons too if you fight back or keep running; a beating ends in handcuffs.
- 3 stars: rifles. They find a clear line and shoot in bursts (never below three stars).
- 4 stars: a second van, faster shooting. 5 stars: a third van, and roadblocks: a van across the road ahead of you with
  officers behind it.
Kill an officer and his rifle lies on the ground: walk over it to take it (or 20 bullets if you have one). Get far
away and keep quiet and the stars fade; when they reach zero the officers walk back to the van and drive off.
Bullets that get you are WASTED: you wake up at LUTH.

A fight, a killing or a kidnapping also brings a police van to the spot (late, after the call): it parks anyhow, an officer walks to the scene
and the driver stands at his door while everyone still fighting or lying there walks into the van, then the officers
climb back in and it drives off. If you were part of it, you go too.

## Explosions and wrecks
Cars take damage from bullets, hard crashes and blasts: first smoke from the bonnet, then fire (everybody jumps out), then
a blast that throws people down or kills them and sets the cars around alight. The burnt wreck stays until you are far
away. Flames and smoke are soft dots drawn in two batches (one draw each), so a burning street stays cheap on phones.

## Rope tolls
On some side streets two area boys hold a rope across the road with a ₦200 TO PASS sign. Press E to pay and they drop the
rope. Walk past without paying and they fight you (their friends join); drive through and the rope breaks: they chase
you throwing stones, then give up and tie it again. Traffic pays and passes.

## On the street
People gisting in a group get a speech bubble over their heads, a quarrel a red one, a phone call a ringing phone.
The dead are taken away as soon as you look away.

## More vehicles
A few seconds into the game a blue car, a black Benz, a fuel tanker (main roads only), a black power bike and a sport
bike load in the background and join the traffic (the Benz and sport bike are rare; a Benz is also parked at the hotel).
Take any of them like other vehicles: the sport bike is the fastest thing on the road, the tanker the slowest.
They also pick up passengers and come as OYA RIDE cabs. Your skateboard waits by your door next to the okada: E to ride
(you stand side-on), E to step off. It doesn't knock people over.

## Phone controls and full screen
The buttons show only what you can do right now. On foot with your fists: CROUCH and JUMP. Running, CROUCH becomes
SLIDE (like CODM: you slide along the ground and end crouched; keep running and you come straight up). Crouched you
creep about; tap again (or jump) to stand. GRAB and ATTACK come up when someone is right by you or a fight is on; E when
there is a vehicle, a door or a place to use (the prompt says what); a gun or a throw gives AIM and FIRE/THROW. On a
keyboard X crouches or slides. The minimap sits small in the top right, away from the move pad. On phones and tablets the
game goes full screen when you tap ENTER (Settings → Full screen to turn it off); on an iPhone, Add to Home Screen.
The two on-foot buttons sit one above the other on the right. Settings → Phone buttons → Move and size buttons lets you
drag every button where your thumb likes it, make them bigger or smaller (they spread apart so they never overlap) and
more see-through; Reset puts them back. The layout is kept on that phone, upright and sideways separately.

## Skating, bike and car skills
- **Skateboard:** W pushes with the back foot (hold Shift or push the stick all the way for faster pushes), S or BRAKE
  drags the foot, A/D carve. Space (OLLIE on phones) pops an ollie; in the air J kickflip, K heelflip, L shove-it,
  I 360 flip (on phones FLIP, FLIP with the stick left = heelflip, up = 360 flip, SPIN = shove-it). Tricks in one jump make
  a combo (DOUBLE, TRIPLE…); land it straight or you bail and fall. Rough roads slow you, walls and people throw you off.
  The skater's body is not a set of fixed poses: `src/skater.js` works it out every frame from the ride. To push he turns
  to face the nose, the back foot comes down on the road and stays on that spot while the board rolls past it (the board
  only gains speed while the foot is down), then it swings forward for the next push or back onto the tail. Carving, he
  leans as far as the speed and the turn need (tan lean = speed × turn rate / g; the board leans about half as much).
  The ollie is a quick squat, the tail snapping down so the board pivots on its back wheels, the front foot dragging it
  level, the legs tucking at the top and then giving like a spring on the landing. The arms swing like damped pendulums
  from the body's real pushes, turns, pop and landing. The feet stay on the deck by two-bone IK, so it fits any body.
- **Bikes:** Shift (WHEELIE) lifts the front wheel, handbrake while straight is a stoppie, J (HOP) is a bunny hop.
- **Drifts:** handbrake (Space/BRAKE) while turning at speed slides cars and bikes with tyre smoke; hold it for DRIFT points.
- Every skill shows its name and points; big ones (300+) pay a little cash. Your best combo is kept.
- **Vehicle health:** cars take many more knocks before smoke, fire and the blast (a car about 11 hits at 70 km/h,
  bikes fewer, buses and the tanker more; a tanker blast is bigger).
Models: `assets/models/car_blue.glb`, `car_benz.glb`, `tanker.glb`, `bike_naked.glb`, `bike_sport.glb`, `skateboard.glb`
(each with a `_lod1` far version), listed in `LATE_FILES` in `src/game.js`.

## Doors and the way to your hotel room
Every door you can walk into (hotels, clubs, the police station, the car stand) has a pulsing ring on the ground and a
bobbing arrow; hotels also say ENTER · name, and your hotel says YOUR HOTEL · ROOM 203 once you book. Inside a hotel a
gold trail of arrows on the floor leads to where you go next: reception if you have no room, then the lift, then your
room's door on your floor.

## Eko Grand Hotel
The office tower a short walk from your house is the hotel. Walk to the yellow ring at its door and press E to enter the lounge
bar (`assets/models/hotel_bar.glb`, downloaded only when you come near). Women dance on the floor there.

## Your home
The inside of your house is a whole flat made in Blender (`assets/models/room.glb`): sitting room with TV wall, sofas,
POP ceiling and chandelier, dining table for six, kitchen (cabinets, granite tops, sink, gas cooker and hood, fridge,
microwave, gas cylinder), bathroom (toilet, vanity and mirror, shower, water heater, bucket and bowl), hallway, and your
bedroom (with wardrobe, AC and curtains). `tools/build_flat.py` builds it inside Blender from your bedroom room
(run in Blender's Python console: `exec(open(r'...\build_flat.py').read())`); it keeps a backup copy, puts everything new
in the "Flat" collection, can be run again, and exports `room.glb`. Pack that with
`gltfpack -i room.glb -o assets/models/room.glb -kn -km -cc` (keep the names) and run `tools/manifest.py`.

The game reads the flat by object names: `Front_Door` is the way in and out (else `Door`), `Wardrobe…` is where you
change clothes (else the bookshelf `Shelf_…`), `Window_Glass…` shows a Lagos street and the biggest lets the sun in,
each `Ceiling_Lamp…` (and the bedside `Lamp_Shade`) lights its room, and `Wall…` pieces stop you and the camera.
Anything between knee and head height blocks walking. Wood, tiles and granite are pictures mapped by material name
(`Oak Floor`, `Walnut`, `Floor Tile`, `Bath Tile`, `Bath Floor`, `Kitchen Tile`, `Granite` → `assets/models/*.jpg`).
A side with no wall gets one. If the file cannot load, the old built-in flat is used.

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

Very big models (a 300 MB Meshy FBX with millions of triangles) go through three steps:
```
python3 tools/fbxbin.py big.fbx /tmp/big          # binary FBX -> OBJ + its texture (no Blender needed)
GLTFPACK=/path/to/gltfpack python3 tools/rebake.py /tmp/big/big.obj /tmp/big/big.jpg /tmp/small big 20000 1024   # fewer triangles, texture re-baked
THREE_DIR=/path/to/three python3 tools/autorig.py MIXAMO_RIGGED.fbx /tmp/small/big.obj person.glb 1.75   # a person: weights from a Mixamo-rigged copy
```
Tripo models made of many parts (each with its own colour picture) first go through `tools/parts_convert.py`, which
packs every part's picture into one atlas. Vehicles keep their own textures when gltfpack can simplify them
(`gltfpack -i model.glb -o out.glb -si R -se 0.05 -tc -tl 1024`); ones with too many UV seams are re-baked with
`NORMALS=1 DILATE=1 python3 tools/rebake.py ...` (bake from the outward-facing surface, fill texture gutters first).

`autorig.py` works best on a T-pose body; arms that touch the thighs (A-pose) stretch when the arms move (`--nocut` keeps
the mesh whole, `--gentle` cuts less).

## Last step: sharper picture on phones
When the game is finished, the very last job is a sharp upscale for phones, like AMD FSR 1 (DLSS can't run in browsers).
Phones draw the game smaller than the screen; the browser stretches it and it looks soft. The two shaders in
`tools/sharpen_shaders.js` (Catmull-Rom upscale, then FSR's RCAS sharpening) make leaves, signs and windows clearly crisper
for very little cost. Hook them in after the scene is drawn whenever the pixel ratio is below the screen's.

Map data © OpenStreetMap contributors, ODbL.
