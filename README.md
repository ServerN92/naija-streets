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
- `assets/maps/` – real street maps from OpenStreetMap (.json); `lagos_world.json` is the city you play in (Mushin + Ikeja)
- `tools/` – model shrinking (`lod.py`, `bake.py`), OpenStreetMap conversion (`osm_world.py`, `convert.py`), `manifest.py`, `stamp.py`,
  big Meshy/Tripo models (`fbxbin.py`, `rebake.py`, `autorig.py`)

## The city: Mushin
The streets, buildings, markets, schools, railway and footpaths are the real Mushin (Lagos) from OpenStreetMap:
about 4,800 street pieces and 24,000 buildings over 3.3 × 3.3 km, with Ladipo, Mushin and Idi-Oro markets, Papa Ajao,
Fadeyi, Onipanu and Idi-Araba. Rebuilding it from a fresh OpenStreetMap export (.osm from openstreetmap.org → Export):
```
python3 tools/osm_world.py Mushin.osm assets/maps/mushin_world.json
```
The same command works for another area (Oshodi, Ajegunle). The game loads `lagos_world.json`: Mushin with Ikeja joined
on (see below).

## Ikeja Under Bridge
West of Mushin, behind a police checkpoint, is a second city: the real streets of Ikeja from OpenStreetMap (about
13,600 buildings), with Computer Village, Alausa, Oba Akran and the flyovers. The district is inspired by Ikeja Under
Bridge; the shops, gangs and people in it are made up.
- **The checkpoint.** One road joins the two cities, through a toll gate with barrier arms, booths and a police post
  (built in Blender, `tools/blender_underbridge.py`). Press E to pay ₦300 and the arms lift. Officers search you: carry
  an AK, grenades or molotovs and they take a ₦10,000 "settle", or seize the guns if you can't pay. Come while wanted and
  they open fire. Walk into the shut gate and you are pushed back; drive through it fast and it breaks, and they come for you.
- **Flyovers.** Mobolaji Bank-Anthony Way, Oba Akran, the Ikeja Flyover and Agege Motor Road are raised decks on piers.
  Drive up the ramp at either end; you can't get out up there. Traffic uses the Mobolaji and Oba Akran ones too. Under the decks are shacks,
  containers and stalls, and area boys stand at the drums (with fires at night).
- **Crime.** Pickpockets brush past and run (catch them and the money drops); armed robbers come in pairs at night, and
  under the bridge by day: press E to hand over 40% of your cash, or fight. At night the boys at the drums warn you off,
  then fight.
- **Chairman.** The Under Bridge black market, by the chop shop (on your map). Guns and bullets 15% cheaper than Oga
  Shege, a bulletproof vest (a blue bar under your health: it takes most of a bullet, blade or blow until it wears out),
  Chairman's card (the checkpoint police wave you through free, no search, for 20 minutes), and when you are wanted,
  one phone call that makes your stars go (₦6,000 a star).
- **One chance.** In Under Bridge a danfo, keke or taxi may slow down by you with a cheap fare to the toll gate, and an
  OYA RIDE cab you book there can be one too. Most of them are traps: a few seconds into the ride the "passengers" turn
  on you. Give them everything (they leave you ₦200 for transport), fight (your odds depend on your weapon and health:
  win and they run, drop money and leave you the motor; lose and they beat you and take it all), or jump out of the
  moving motor and keep your money.
- **No police inside.** What happens in Under Bridge stays there: fights, shootings and killings bring no stars, and
  stars you bring in fade away. The police wait at the checkpoint.
- **Cults.** Three made-up cults share Under Bridge and are always at war: the Red Scorpions (west, red berets), the Blue
  Mambas (middle, blue) and the Yellow Hornets (east, yellow). Each has a base (on your map) with its Capo and boys, and
  the boys at the drums belong to the cult whose turf it is. At night strangers get warned, then beaten; day and night
  two of the cults shoot it out in a street every minute or two. Talk to a Capo to join (₦20,000, then put down three of
  the other cults). As a member your boys greet you, the other cult hunts
  you, the base pays you a share over time, and the Capo can send three armed boys to follow you and fight for you for
  three minutes (₦3,000). Hit your own people and they throw you out; ₦50,000 settles them if you want to leave.
- **Kidnappers.** Masked men in buses grab people off the street and take them to their den (a fenced yard with an
  unfinished house, on your map). Stop the bus (shoot it, wreck it or block it) and the person runs free: the family
  pays you. Get there too late and they hold the person in the den: fight the guards, press E by the post to untie
  them, and the family pays when they are out. At night, alone, they may come for you: fight them off, or wake up tied
  in the den. Pay the ransom (60% of your cash, they give your things back), or press E again and again to work the
  rope loose, take your things from the sack by the generator, and run for the gate past the guards.
- **Bandits.** At night okadas come in fast, two masked bandits on each, shooting into the air. Keep away, or fight:
  the vigilante pays ₦10,000 for every bandit you put down. They ride off after a minute or two.
- **The forest.** A block at the south edge of Under Bridge is bush now (no new land): tall trees, thick bushes, rocks
  and earth tracks, and in a clearing the bandits' camp (on your map) with tents, a cooking fire, the post they tie
  people to and their olive pickup. Walk in and they shoot.
- **Taken by the bandits.** Their pickup comes for you with masked men in the back (or a man walking past grabs you):
  one throws you over his shoulder (press E again and again to kick free), they throw you in the truck, drive you to
  the camp and tie you to the post. Pay the ransom (70% of your cash, from ₦20,000), or work the rope loose, take your
  things from the sack by the tents and run into the bush.
- **Hard men, big money.** Armed gang fighters take as many bullets as you do and slide or jump out of the line of fire
  like you. Every one that falls drops ₦100,000–250,000 (₦300,000 for a Capo), and wiping out a whole group (a clash
  side, a base, the den, the raiders, the camp) pays ₦200,000–500,000 more.
- **The chop shop.** Bring any car that isn't yours to the yellow ring by the "WE BUY ANY CAR" sign and press E: they
  pay by type and damage, no questions (a police van also brings heat).

Rebuilding the joined map (Ikeja from an OpenStreetMap export, then merged on to Mushin with the toll road and flyovers):
```
python3 tools/osm_world.py ikeja.osm /tmp/ikeja_world.json
python3 tools/merge_district.py assets/maps/mushin_world.json /tmp/ikeja_world.json assets/maps/lagos_world.json
```
The Under Bridge props are built in Blender by `tools/blender_underbridge.py` (gate, police post, piers, shacks) and
`tools/blender_underbridge2.py` (cult berets, bandit masks, cult bases, kidnappers' den) and `tools/blender_forest.py`
(the bandits' truck, forest trees, bushes, rocks, tents, cooking fire, log, post, the third cult's base); run any of them
inside Blender, or headless with `python3 tools/glb_build.py -m blender_forest`.
The kidnap moves (a bandit carrying you over his shoulder, walking and standing; you hanging over it; you tied at the
post) are keyed in Blender by `tools/blender_carry.py` (with `tools/carry_src.json` next to it) into
`assets/people/moves4.glb`; until that file is in, the game bends the arms and body itself.
Both cities are one map; far things are hidden by distance, as in Mushin.

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
pick the frame for where they are in their step, one instanced draw per character and frame. Tunde and the city's women
are in the crowd too (in the first outfit of their part). People in danfos, buses, kekes, cars and on okadas are the same characters posed once for
the seat (drivers, passengers, okada riders and the pillion, the danfo conductor at the door, police in the pickup).
The old box people are gone.

Adding a character or a move: export from Mixamo as FBX *with skin*, then
```
python3 tools/npc_convert.py /tmp/npc            # edit CAST and MOVES at the top first
sh tools/npc_pack.sh /tmp/npc /path/to/gltfpack  # shrink (gltfpack built with texture compression)
cp /tmp/npc/out/*.glb assets/people/
```
and add the character to `CAST` in `src/game.js` (height, how common, what it does); the crowd and seat poses are made from it when it loads.

## The city's women
Nine women made in Blender (`tools/character/women`): Amaka, Ada, Chioma, Bisi, Kemi, Funmi, Mama Nkechi, Iya Basira and
Sgt Halima. Four body types (curvy, slim-thick, slim, big), a sculpted head with real eyes, lipstick and her own skin tone,
fitted hair (cornrows, afro, bun, ponytail, long, bob, short) or a gele / scarf, and eleven outfits each, cut from her own
body: Ankara gown, iro & buba with gele, bodycon mini, crop top & jeans, tee & joggers, office suit, fitness, sequin club
dress, satin night wear (that one stays at home), the police uniform (fitted black shirt, tight black skirt, belt, beret,
court shoes) and rags (torn and dirty). Sgt Halima, the policewoman, has the biggest hips and backside of all (a shape of
our own on top of MakeHuman's, `add_booty` in `women_lib.py`). One file each, `assets/people/p_<id>.glb` (about 2 MB).

Each session a few of them are in town (4 on Low, 5 on Medium, 6 on High, so phones load less) and they play the parts the
city's Mixamo women used to play, in that part's outfits (`ROLE_W` in `src/game.js`): the mama (Mama Nkechi or Iya Basira
in iro & buba or a gown), the lady in red, the lady in black, the lady in a suit, the girl, and the policewoman who comes
with the vans (Sgt Halima or Bisi, in uniform). The hawker is still the Mixamo one. On police duty, you wear your own
person's police uniform.

Making them again: build the women in `naija_women.blend` (`build_women.py`, then `dress()` in `women_cloth.py`), export from
Blender with `women_export.py` (`export(name)`: rest-pose parts, weights, the skin, face and gele colours baked to pictures),
then outside Blender:
```
python3 tools/character/women/women_glb.py <export dir> <tex_cloth dir> out/
gltfpack -i out/p_amaka.glb -o assets/people/p_amaka.glb -tc -tl 1024 -cc -kn -km -ke -kv
python3 tools/manifest.py
```
The body is one mesh: its second colour set says which outfits cover each point, and the game draws only the skin the
outfit leaves showing (`setOutfit` in `src/char2.js`). Fabrics come from `cloth_tex.py`.

## The city's men
Nine men made in Blender like the women (`tools/character/men`): Tunde, Emeka, Dayo, Chidi, Musa, Femi, Segun, Baba Sule and
Sgt Okon. Six body types (slim, athletic, muscular, average, oga with a belly, old), a sculpted head joined onto the body's
own neck, brows and beards painted on (stubble, moustache, goatee, full, grey), a short cut (low, fade, 360 waves, grey) or
dreads, and eleven outfits each: senator, kaftan & cap, Super Eagles jersey, tee & jeans, office suit, singlet & shorts,
hoodie & joggers, Ankara shirt, polo & chinos, the police uniform (black shirt and trousers, belt, beret, boots) and rags
(torn and dirty). One file each, `assets/people/p_<id>.glb` (about 1.8 MB).

Each session a few of them are in town, and they play the parts the city's Mixamo men used to play (`ROLE_M` in
`src/game.js`): the baba (Baba Sule or Segun, in a kaftan or senator), the area boys (in singlets, jerseys and hoodies) and
the policeman who comes with the vans (Sgt Okon, Chidi or Musa in uniform). The schoolboys are still the Mixamo ones.

Making them again: `build()` in `tools/character/men/build_men.py`, `dress_m()` in `men_cloth.py`, `export_m()` in
`men_export.py` (all in `naija_men.blend`, after `mload.py`), then outside Blender the same `women_glb.py` and gltfpack as
for the women. Outfit parts are named `o<i>~` with i in base 36 (0-9, then a: the eleventh).

## Your profile
The first time, you type a name and choose man or woman (and who you are). It is kept on the device and cannot be changed
afterwards. A woman picks one of the city's nine women and walks, runs and fights with women's moves; the wardrobe shows her
nine outfits, and the looks of your own side only. A man picks one of the nine men, with his eleven outfits.

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

## A new life: from under the bridge
Everybody starts with nothing: ₦1,000, torn clothes (the "Rags" outfit) and a tent in the camp under the flyover nearest
your old house. Your old flat is for sale (₦650,000, a red FOR SALE board over the door). The businesses were taken
back too: every buka, barbing salon and POS stand is for sale again (server v7; what each was, with its till, is kept
in the `before7` table and its old owner gets a notice once at the next sign-in), and your farm goes back to the farm
officer to collect again. The way up:
- **Your tent** (yellow ring): sleep (you rest, but not fully: mosquitoes) and change into clothes you own.
- **Bend-down boutique** next to it: every outfit of your person has a price (Singlet ₦2,500 up to the Office suit
  ₦50,000; women from Joggers ₦5,000 to the Office suit ₦40,000). What you have not bought is locked in the wardrobe.
  The police uniform still comes by itself when you go on duty.
- **Room to let** (green ring): the landlord of the nearest face-me-I-face-you house rents you a room by the game day
  (₦3,000 a day, ₦8,000 for 3, ₦17,000 for 7). Rent runs only while you play (a game day is two real hours). Inside
  (`int_faceme`): a mattress on the floor to sleep, clothes on the nails, a kerosene stove for indomie, a radio, and the
  back door to the compound toilet (free) and, by the bucket, a bucket bath (free while your rent is paid).
- **The flat**: the agent sells it only to somebody who has rented a room before. Once it is yours it is home again.
- **Public toilet** (blue ring, ₦50) by your tent: one at a time. People from the camp come to use it; when somebody is
  inside, press E to join the line and wait; they wait for you too. The door swings open as people go in and out.
- **The WC bar** under your health fills slowly (about 40 minutes of play). At three quarters you are told; full, you
  cannot run until you use a toilet (the public one, your room's, or a bath in your flat).

Where you sleep, your rent, your clothes and the toilet bar are saved on the phone (`naija-life`); signed in, on your
account (`server/src/life.js`, kept in the `life` table). The first time this version runs, everybody starts over: the
phone's money, cars, guns and hotel room are cleared, and the server's database migration v6 sets every account to
₦1,000 (what each had is kept in the `before6` table).

The pieces were made in the user's Blender with `tools/blender_life.py` (public toilet and its door, your tent, the
boutique, the room): `tools/blender_rooms/life_job.py` runs it in a separate background Blender, so the file open in
Blender is never touched, writes each outside piece as faces with a colour per corner (`Documents/naija_rooms/life`),
and bakes the room's light with `rooms_all.py`. `python3 tools/life_pack.py <that folder>` packs the pieces into
`assets/models/ns_*.glb`.

## Gated estates (Banana Island style)
Four walled estates of 27 mansions each, on ground cleared of the old houses and streets: **Pearl Haven Estate** just
past the flyover by your tent (Agege Motor Road), **Royal Palm Estate** (Agege Motor Road, east), **Emerald Gardens
Estate** (Bello Street) and **Diamond Court Estate** (Oba Akran Avenue, Ikeja). Each is 244 × 452 m: the grand gate with
its name on the beam, security on the island and gatehouses, a boulevard with palms and twin lamps, three streets and a
back drive. 24 mansions stand on 52 × 48 m plots, 3 palaces on 76 × 60 m at the back.
- **Prices by house type:** Tropical Veranda Villa ₦30M, Courtyard Villa ₦35M, Grand Classic ₦40M, Mediterranean ₦45M,
  Contemporary Wood ₦50M, Dark Minimal ₦55M, Glass Modern ₦60M, White and Gold Luxe ₦70M, Penthouse Mansion ₦90M,
  Palace ₦100M.
- **Buy a house** at its gate (red FOR SALE board) or at the **estate office** (gold ring by the gatehouses). Its gate
  opens for you (a closed plot gate is solid), the board turns green (YOUR HOUSE) and the first house you buy becomes
  home: you start the game inside your gate. "Make this your home" moves you to another house you own.
- **Buy the whole estate** at the office: ₦2,500,000,000, less what you already paid for houses there. Every gate opens.

The mansions were made in the user's Blender (the Pearl Haven kit, `lib/game_export.py` in `Documents/naija_homes`):
`assets/models/est_S1..S10.glb` (walls and roofs `GR_`, small things `GD_`, plot gates `GT_`), a `_lod1` for far away,
`est_gate.glb` and `est_styles.json` (sizes, doors, gates and palms of every type). The palette colours become vertex
colours, so all ten types draw with five shared materials; houses, gates and palms load when you come within 1.3 km,
walls you bump into are made only for an estate you come near. Bought houses are kept in the life record (`est`,
`estAll`, `estHome`; checked by `server/src/life.js`); the server takes spends of any size (a house is more than one
₦5M message).

## Naija Home: furnish and arrange your house
Your flat in Mushin and every estate house you own can be furnished the way you like. 48 pieces (sofas, armchairs,
rugs, TVs, beds, wardrobes, dining sets, fridge and cooker, piano, pool table, aquarium, gaming corner...) from ₦45k
to ₦4.5M.
- **The NAIJA HOME app** on your phone: pick a piece, pick the house, pay. The price is 20% more than the showroom plus
  a delivery fee (₦15k + 8%). In about 3 minutes a big NAIJA HOME box stands by the door of that house: press E to carry
  it inside.
- **The NAIJA HOME showroom** in Ikeja GRA, next to Adunni's Fashion House (near NAIJA MOTORS): every piece on show with
  its price tag. Press E in front of one to buy it at the showroom price, no delivery fee; the box waits inside the house
  you pick in about 5 minutes.
- **Open the box** inside your house (E) and you are in design mode: the walls between you and the room drop, you see
  the floor from above. Drag a piece to move it (it keeps to the rooms and won't sit on another piece; rugs can go under
  things), ⟲ Turn by 45°, 📦 Pack away into your store, 🧺 Your store to bring a piece back, 🛒 Buy more to order from
  the app without leaving. **🛋 Arrange** starts design mode any time you are inside.
- Up to 150 pieces in a house and 300 in all your houses, 60 boxes waiting. Kept in the life record (`deco`: piece,
  storey, x, z, turn per house; `store`; `boxes`), checked by `server/src/life.js` (messages up to 32 KB).

Made in the user's Blender (`Documents/naija_homes`): `lib/catalogue.py` builds each piece (`assets/models/fur_<id>.glb`,
`furniture.json` with names, sizes and prices, the pictures in `fur_thumbs.webp`) and the delivery box; `lib/int_export.py`
exports every estate house type empty, storey by storey (`int_est_<type>_<storey>.glb`: one `WALL_n` per wall so it can
drop, `ROOM`, the stairs and door marks; `int_est.json` has the rooms); `lib/showroom.py` builds the showroom
(`set_gra_naijahome.glb` outside, `int_naija_home.glb` the hall with a `MARK_slot_<id>` for every piece). The game side
is `src/home.js` (store, boxes, design mode) and the Naija Home app in `src/phone.js`.

## Money
Cash is at the top left (kept on the device; a new life starts with ₦1,000). People you floor or kill drop their money: walk
over it to take it. With a weapon in your hand, G next to someone is a robbery: hands up, money on the floor, then they
run, and the people around run too. Market and shop sellers carry the day's sales. Jobs pay, rides cost the fare,
waking up at LUTH costs a hospital bill, and an arrest costs a fine.

## Online: other players, chat, money on the server

PLAY ONLINE on the title screen (or Settings → Online account): sign in or make an account with a username and a
password. The email is optional and only used to send a 6-digit code if you forget the password. Signed in, the
other players near you (160 m, the nearest 30) are really there: their own person and outfit, walking, running,
swagger, jumps, crouch, slide, prone, fights, the phone, and the motor or okada they ride, with their name over their
head. The chat button (Enter on a computer) talks to the people near you (60 m, a bubble over your head) or to all
Lagos. Tap a name in the open chat to mute that player (kept on this phone). Links are cut out of chat; bad words are
starred.

While you are signed in, your money is kept on the server: the same on every phone, and nobody can just type in more.
Money made in the game is capped by time (₦250k at once, then ₦150 a second); a new account brings up to ₦50,000 of
what you had as a guest; signing out gives back the guest money that stayed on the phone.

The server is `server/` (Node 22, no npm packages: its own WebSocket, Node's SQLite, scrypt password hashes). Run it
with `cd server && npm start` (port 8080; a game page on localhost connects to `ws://localhost:8080/ws` by itself),
test it with `npm test`. It runs on Fly.io as `naija-streets-lagos` (London, one machine, accounts on a 1 GB volume).
`.github/workflows/server.yml` tests and deploys it on every push that changes `server/`, using the repository secret
`FLY_API_TOKEN`. Reset emails switch on when the Fly secrets `RESEND_API_KEY` and `MAIL_FROM` are set (resend.com).
Players' code is `src/online.js` (the game passes in what it needs, like the farm).

## Online business: the buka
Eight bukas stand by big roads: five near your house in Mushin, then Idi-Oro Market, Mushin Market, Ladipo Market and
Computer Village (Buka on the big map). One nobody owns says BUKA FOR SALE on its board. Signed in online, stand at the
counter and press E: buy it for ₦100,000 (two businesses each at most) and your buka's name goes up on the board for
everyone. At the counter: collect the till; cook food (10 plates at a time; ingredients cost 40% of the usual plate
price; the pots hold 60 plates, bigger pots 120 and 200); set your prices (cheaper sells faster); hire Iya Basira the
cook (₦8,000 for 6 real hours, ₦28,000 for 24) so it sells while you are away (otherwise it is open only while you
stand there); more benches (more customers); rename the board; sell it back for half (with the till). Customers come by
themselves: more at breakfast, lunch and evening, few at night, more with a longer menu. Any signed-in player can eat at
an open buka (+40 health) and pays the owner. The cook stands behind the counter and customers wait at the table while
it is open.

The server runs it all (`server/src/biz.js`: stock, prices, customers, the till, saved in SQLite) and sends the boards
to everyone; `src/business.js` draws the bukas, the boards and the people and runs the menus. The model is made in
Blender by `tools/blender_buka.py` (the farm's kit: colours per corner, light baked in, photo detail on wood, zinc and
concrete) as `assets/models/bk_buka.glb` + `bk_buka_lod1.glb`.

## Online business: the barbing salon
Six barbing salons (Barbing salon on the big map): three near your house, Idi-Oro Market, Mushin Market and Computer
Village. Painted shipping containers on blocks, made in Blender by `tools/blender_barber.py` (`bb_barber.glb`). Buy one
for ₦80,000 at the door (two businesses each at most). Keep supplies on the shelf (₦6,000 for 30 cuts: blades,
clipper oil, powder, aftershave) and fuel in the generator: NEPA light comes and goes (it can change every 20 real
minutes, a little differently in each part of town; the dot on the board is yellow when there is light), and without
light every cut burns fuel (₦5,500 a 5-litre jerrycan, 20 litres in the tank). No supplies, or no light and no fuel:
closed. Set your prices (low cut ₦1,500, botako ₦1,000, fade with a design ₦2,500, beard trim ₦800, wash, cut and
style ₦3,000); people come most in the evening, after work. Barber Sunday cuts for you while you are away (₦9,000 for
6 hours, ₦32,000 for 24). A second chair (₦45,000) and an AC (₦60,000; twice the fuel without light) bring more
people. Any signed-in player can get a cut (+10 health) and pays the owner.

## Online business: the POS stand
Six POS stands (POS on the big map): three near your house, Idi-Oro Market, Mushin Market and Computer Village. A big
green and white umbrella over a little kiosk with the POS machine, the cash box and a banner by the road
(`tools/blender_pos.py`, `ps_pos.glb`). Buy one for ₦60,000. The money you work with is your own: cash in the box
(you put in ₦20k, ₦50k or ₦100k from your pocket; it holds ₦500k) pays out withdrawals, and the POS wallet (e-money)
fills up from them; transfers, airtime and bills go the other way. Fund the wallet from your pocket, do a bank run
(the wallet comes back as cash for the box, ₦100), or send the wallet to yourself (₦50). Each customer pays your fee
(withdrawal ₦200, transfer ₦100, airtime ₦50, bills ₦150; set your own) into the till; customers come in the day,
few at night. The network jams sometimes (the board says NETWORK JAM); a second SIM (₦25,000) nearly always finds
one that works; a second machine (₦50,000) serves two at once; Mama Nkechi minds it while you are away (₦7,000 for
6 hours, ₦25,000 for 24). Selling it back gives you the cash and the e-money in full, plus half the price and upgrades.

Players send money to each other at any open POS: the username and the amount (₦100 to ₦200,000); it arrives at once
(even when they are offline), the agent keeps 1% (₦100 to ₦2,000), and it comes out of the POS wallet, so a POS with
an empty wallet cannot send.

## Online business: the farmer sells to the bukas
Your farm's tomatoes, cassava and yams can go to real players' bukas. In the Oya Farm phone app (signed in online), the
"Online market" part: pick your price (cheap, fair or dear: tomatoes ₦600 / ₦1,000 / ₦1,500 each, cassava ₦600 /
₦800 / ₦1,100, yams ₦1,100 / ₦1,500 / ₦2,000; the produce buyer in the market pays far less) and put 10 up for sale at
a time (5 sales at once, 200 a day). They leave your store; if nobody buys in 2 days, or you take a sale down, they come
back. A buka owner buys them at the counter (Cook food → Buy produce from farmers) into the buka's pantry, and the
money goes straight to the farmer (even offline, with a message). Cooking with farm produce costs much less: 2 for 10
plates (tomatoes for jollof, yams for amala and pounded yam, cassava for eba), 15% of the plate price instead of 40%.
The market is on the server (`server/src/biz.js`, saved in SQLite); the farm store is on your phone (`src/farm.js`).

## Agberos robbing a man
About every 5 minutes, somewhere in front of you (a corner off a side street, by day and evening, never near the police
station), three or four agberos surround a man and rob him; he begs them ("Senior man, abeg…"). Walk on, or step in: they
all fight you (no police stars for beating robbers off a man). Beat them and his money (₦1,500 to ₦3,000) is there: talk to
him (E) and keep it, or give it back: then he finds your house, room or tent later and pays you ₦5,000, and the area
respects you (people greet you in the street; with enough respect the next robbers may run when they see you coming, and
the man gives you ₦1,000). Lose and they rob you too: 30% of your pocket, ₦5,000 at most.

## Agberos on the road: the danfo's ticket for the day
At 18 bus stops and main-road spots (AGBERO POST on the map) two union boys in orange vests wait. A danfo comes: one runs
after it and bangs the side, the driver stops and the conductor pays ₦200, once a game day (2 real hours) for each danfo,
by its plate number. Drive a danfo yourself and they step into the road and wave you down: pay (E) and no other post
stops you that day; drive on (or run one down) and they chase you throwing stones, and the next post that day wants ₦400.
**Online, in the park union:** you collect yourself. Stand by a danfo that has stopped (at a bus stop, in traffic) and press
E: the server gives you half (₦100) at once and keeps the oga's half aside; at the end of the game day it all goes to the
chairman's bank account in one credit alert, with a line from each boy on both bank histories ("Street tickets ×12,
oga's half"). Each paid crew boy of the chairman brings ₦1,000 a day from the bus stops too. 40 danfos a day per boy at
most (the street danfos live on each player's phone, so the server caps it); in the park itself the bays' tickets count.
With Chairman Kasali in the seat, the old man takes the oga's half. The chairman sees the day's road money at the office.

## Online: banks and transfers
Every player has a bank account: one of three Lagos banks (**Gidi Bank**, **Zobo Bank**, **Agege Trust Bank**; made-up
names, set in `server/src/bank.js`) and a 10-digit account number nobody else has (with a check digit like a real
NUBAN, so a typo or the wrong bank is caught). Players who were already playing got theirs when the server started; new
ones get theirs at sign-up. The phone's **Bank** app shows your bank, number (Copy), balance and transfers.
**Send money:** put the account number, pick the bank, and the app shows whose account it is (name enquiry) before you
send; amount (₦100 to ₦200,000 at a time, ₦1,000,000 a day, 20 sends an hour) and a narration. Same bank: free; another
bank: ₦10 (up to ₦5,000), ₦25 (up to ₦50,000), ₦50 (more). It arrives at once, even when they are offline; they get a
credit alert (on screen and as a text from their bank), you get a debit alert and a receipt. **Receive** shows your
details to give out. A send that is resent after the line drops is not paid twice. As a guest the app is only your cash.

## Online: the motor park union (agbero to chairman)
Mushin Motor Park has a union office in the yard (built in Blender: `tools/blender_park.py`, the office, its boards
and the chairman's aso-oke fila). Signed in online, join the union at the secretary's table (₦5,000) and you wear the
orange union vest: you are an agbero. Every danfo that loads in a bay pays a ticket (₦300 at first); a yellow TICKET
marker floats over it, and the first agbero standing by it collects it (E). You keep 50% (60% as a senior agbero at 40
respect, 70% as a head agbero at 120; every ticket is 1 respect); the rest is the chairman's return. Danfos nobody
collects from are done by the street touts, and the chairman still gets a quarter.
The chairman (green vest and fila, name on the office board) sets the ticket (₦200 to ₦600: dearer tickets, fewer
danfos), pays his boys by the day (₦6,000 a boy), sacks agberos for a day, or steps down. When no player holds the seat,
Chairman Kasali does, with six boys.
Every 30 real minutes the park holds its meeting (the time is on the fare board). A head agbero who declared before it
(paying ₦3,000 for each boy, 2 to 12) fights the chairman's crew in the yard: the chairman's boys in union vests, the
challenger's in red caps, brawling; players fight too (agberos pick a side at the office), and every enemy boy a player
knocks down counts. The side with boys left standing wins (after 3 minutes, the most boys; a tie keeps the chairman). A
challenger who wins is the new chairman, with the boys that stood; everyone in Lagos hears about it. No police come
into the park for the fight. Everything is on the server (`server/src/park.js`, saved in SQLite); `src/park.js` draws it.

## Online: fighting other players
Signed in online, you can fight other players with the same moves as on the street (punch, kick, the heavy kick, the
drop kick). Your phone says where a blow landed; the server checks it (both on foot, close enough for that blow, you
facing them, not too fast) and counts it: 100 points knock somebody out, and they come back slowly when nobody hits
you for a while. The one hit staggers and loses health on their own phone. A knock-out puts them down for a few
seconds; the winner takes 10% of their pocket money (₦2,000 at most, only from ₦1,000 up), and they cannot be hit
again for two minutes. A player who just came online is safe for 45 seconds, until they throw a blow themselves.
The police leave fights between players alone for now. During the fight for the chair at the motor park, knocking
out a player of the other side puts them out of that fight for a while. The fights are on the server (`server/src/pvp.js`).

## Online: the police force and wanted players
Signed in online, your wanted stars show on your name for everybody near you (red ★). They come from the street police
on your phone (street crimes) and from the server: knocking out a player gives a star (two if they were police on
duty), hitting an officer on duty one; the server's stars go one by one when you keep quiet (one every 2.5 minutes).
Join the police at the front desk of Mushin police station (with no stars on you) and go on duty: you wear the black
uniform and beret, your name gets a blue dot, and you see every wanted player in Lagos: a list with distance and
direction, and red stars on your minimap. Knock a wanted player down, or reach one who surrenders (a wanted player near
an officer can press E to surrender), then press E to arrest them: they go to the cell, lose their stars and pay the
usual fine; the force pays you ₦5,000 for each star the server saw itself and ₦1,500 for each street star (₦25,000 at
most, not again for the same person within half an hour, ₦80,000 a day). Arrests raise your rank: Corporal at 3,
Sergeant 10, Inspector 25, ASP 60, CSP 120. Officers on duty never take pocket money. An officer who knocks out somebody
who is not wanted is suspended from duty for a day and gets two stars himself. The police are on the server
(`server/src/law.js`); `src/police.js` draws the desk, the list and the prompts.

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

## Sound: the city you hear
Real recordings instead of computer beeps (`src/sound.js`, the files in `assets/sounds`, made with
`tools/sound_build.py` + `tools/sound_recipes.py` from Freesound recordings; credits in `assets/sounds/CREDITS.md`,
linked from Settings). Most of the street is Nigerian field recordings by SFXAFRIK.
- **Where you are:** main roads roar with traffic and horns; at bus stops and the motor park the conductors shout their
  routes (in 3-D, from the stop); markets have hawkers calling; quiet streets have people, dogs and goats; at night the
  crickets come out, at dawn the cocks crow; rain drums on the zinc (louder inside and by your tent); the airport hall hums.
- **Places:** the call to prayer from the nearest mosque five times a day, church singing in the morning and evening,
  generators humming at night and whenever NEPA takes the light in that part of town (it changes every two game hours).
- **Vehicles:** the nearest vehicles run their own engines in 3-D (okada, keke, danfo and BRT, cars, tankers), rising
  with their speed; they honk, more when traffic is stuck. Your own engine follows your speed and the gas; hard braking
  screeches; crashes, car doors, the police siren where the police van is, the jet taking off at the airport.
- **In a car:** windows up. In a closed car (yours, a taxi or a danfo you ride in) the street outside goes nearly quiet
  and dull, nobody's horn blares in, the area boys' speakers fade: you hear your engine and the radio. Step out and the
  city comes back. On an okada you hear everything; in a keke a little less.
- **Settings:** volume sliders for the city, vehicles, voices, effects and music (kept on the phone). Files load only
  when first needed and are kept on the phone after (songs stream).
- **Music** (free Afrobeats, amapiano, highlife and street songs from Pixabay, credited in `CREDITS.md`): the car radio
  has three stations (Gbedu FM, Piano Radio, Highlife Gold): press **N** or the RADIO button to change station, the last
  press turns it off; in a danfo or cab you ride, the driver's radio plays. At home and in your rented room, the radio.
  The night clubs play their DJ inside (airhorn, scratches between songs) and you hear the bass through the walls outside
  at night. About one street corner in eight has the area boys' speaker box playing loud, by day and into the night.
  Real artists' songs can only go in with their (or their label's) permission.
- **Our own Lagos recordings** (made by the game's maker): walk or drive into any market and the market recording fades
  in, and fades out again as you leave (over the last 18 m); danfo conductors call their routes from the door when a
  danfo stops at a bus stop or passes near you (right beside you when you ride in one); the agbero and the conductor
  argue over the ticket when the boys stop a danfo; a man begs the agberos robbing him; the boys at the corners argue
  (and in any small fight); a real fight near you (three or more fighting: cult boys, agberos, the park brawl) has the
  crowd's roar; now and then a man walks past you talking on the phone.
- **Talking:** people greet you, complain when you bump them, quarrel and ask why you are staring, out loud, once the
  recorded Pidgin lines are in (`say_greet`, `say_bump`, `say_angry`, `say_stare`; women's lines end in `_f`).

## The airport road: toll gate, car park, impound yard
Agege Motor Road leads north to Murtala Muhammed Airport. The road is open all the way to the terminal (the city's
ground and the airport's ground now meet with no gap).
- **Toll gate (₦300):** two lanes in, each with a booth and a barrier arm. Stop by the booth and press E to pay; the arm
  lifts. A closed arm stops you; hit it fast and it breaks: airport security calls the police (one star). Going round
  the plaza (grass, the exit lanes) does the same. Leaving is free. People on foot use the walkway on the side, free.
  OYA RIDE taxis pay and pass by themselves.
- **No okada, no keke** past the toll (red boards on both sides before it). Ride one in and security seizes it to the
  **impound yard** next to the toll; pay ₦5,000 at its office to get it back (it waits outside the gate). An okada ride
  on OYA RIDE drops you at the toll and you walk in.
- **Car park (free):** marked bays on both sides of the road in front of the terminal, most taken by other cars. Stop in a
  free bay and get out: your car waits there. Walk over the zebra crossings to the terminal doors.
The pieces (`ns_airtoll`, `ns_airtoll_arm`, `ns_bansign`, `ns_carpark`, `ns_impound`) were made in the user's Blender with
`tools/blender_airport_landside.py` (job `airport` of `tools/blender_rooms/life_job.py`) and packed with
`tools/life_pack.py`.

**The road itself** (`set_airroad`, made in Blender with `tools/blender_airroad.py`, job `road`): a dual carriageway that
carries on Agege Motor Road's two carriageways, two lanes each way on clean asphalt (wheel paths, a little dust at the
kerbs), a raised kerb painted black and white round a green grass median with a row of palm trees (the Sketchfab palm from
Naija Ground, `ns_palm` + a light copy far away) and double street lamps between them that light up at night; lane lines,
a yellow line along the median, SLOW / AIRPORT / CITY and arrows painted on the road, drains, kerbs and sidewalks of
interlocking stones (red and charcoal). The median narrows into the toll's centre island and opens at the link road and
the car park aisles; there is a driveway to the impound yard and the drop-off road in front of the terminal. Cars can't
cross the median (people step over it). It loads as you come near and replaces the old flat road.

## Police checkpoints
Three police roadblocks stand on the busy roads of Mushin by day (drums, a striped plank, a plank of nails, the officers'
umbrella and bench; built in Blender, `tools/blender_checkpoint.py`). Drive up and they wave you down: stop next to them
and press E. "Roger" them (₦100 okada or keke, ₦200 a car, ₦300 a danfo or bus, ₦500 a tanker or Benz), or show your
papers: in your own motor they may let you go, or say your papers "don expire" (settle ₦1,000 or argue). In a motor that
is not yours they know you stole it. Carry guns and they search you: settle ₦5,000 or lose the guns. Wanted, and they
come for you. Drive past without stopping: a star, and over the nails at speed you damage the motor. On foot they
sometimes stop and search you (settle ₦200). The Chairman's card from Under Bridge gets you waved through.

## On the street
People gisting in a group get a speech bubble over their heads, a quarrel a red one, a phone call a ringing phone.
The dead are taken away as soon as you look away.

## More vehicles
A few seconds into the game a blue car, a black Benz, a fuel tanker (main roads only), a black power bike and a sport
bike load in the background and join the traffic (the Benz and sport bike are rare; a Benz is also parked at the hotel).
Take any of them like other vehicles: the sport bike is the fastest thing on the road, the tanker the slowest.
They also pick up passengers and come as OYA RIDE cabs. Your skateboard waits by your door next to the okada: E to ride
(you stand side-on), E to step off. It doesn't knock people over. When you're not on it, pick it up (G, or PICK UP on a
phone): it goes in your weapon switch as Skateboard (7, Tab, or tap the weapon name). With it in your hand (it hangs from
your right hand by the back truck), E or RIDE drops it at your feet and you're on it. Leave it far away on the road and
it waits in your bag.

## Phone controls and full screen
The buttons show only what you can do right now. On foot with your fists: JUMP over CROUCH. Running, CROUCH becomes
SLIDE (see Crouch, slide and jump below). Crouched you kneel, and creep about when you move; tap again (or jump) to stand. GRAB and ATTACK come up when someone is right by you or a fight is on; E when
there is a vehicle, a door or a place to use (the prompt says what); a gun or a throw gives AIM and FIRE/THROW. On a
keyboard X crouches or slides. The minimap sits small in the top right, away from the move pad. On phones and tablets the
game goes full screen when you tap ENTER (Settings → Full screen to turn it off); on an iPhone, Add to Home Screen.
The two on-foot buttons sit one above the other on the right. Settings → Phone buttons → Move and size buttons lets you
drag every button where your thumb likes it, make them bigger or smaller (they spread apart so they never overlap) and
more see-through; Reset puts them back. The layout is kept on that phone, upright and sideways separately.

## Crouch, slide and jump (moves3)
Real Mixamo moves (Y Bot, FBX without skin, 30 fps), put together by `tools/character/anim/make_moves3.py` (see
`mix3.py`) into `assets/people/moves3.glb` and fitted to whoever you are when the game starts:
- **Crouch** is CODM's: still, you go down on one knee (`Idle Crouching`); moving, you creep low (`Walk Crouching
  Forward`, made at 1.64 m/s, played at your speed). Aiming the rifle you hold it as made; otherwise (rifle on your back, or empty hands)
  the kneel takes the resting arms of `Crouching Idle` and the creep takes the chest and loose arms of `Crouched
  Walking`, kept where they are in the world, so nothing holds an invisible rifle.
- **Slide** (`Running Slide`): from a run you drop and slide; your speed follows the move. Keep running and you come up
  into the run, let go and you end crouched. JUMP jumps you out of it.
- **Jump**: standing you spring up (`Standing Jump`); moving you leap and land running (`Standing Jump Running` and its
  `Landing`). Crouched, JUMP stands you up.
- **Aim while you slide or crouch:** with the gun up you can still slide (from a run) or crouch (walking), and keep
  shooting.
- **Prone:** hold CROUCH for 2 seconds and you lie flat (`Crouch To Prone`, `Prone Idle`); move and you crawl (`Prone
  Forward`); aiming the rifle you shoot lying down. Tap CROUCH or JUMP to come back up to the kneel (`Prone To Crouch`).
- **Climb:** JUMP (it says CLIMB) in front of a fence or wall you can reach. Up to about 1.4 m you vault it with a hand on
  top (`Jump Over Obstacle`); up to 2.6 m you run up it and pull yourself on (`Sprint To Wall Climb`), and a thin wall you
  drop down the other side (`Jumping Down`). Each climb carries its floor (`mix3.floor`), raised or lowered to the real
  wall's height. You can stand on what you climbed; step off and you fall.
- **Women** (Amaka, Ada, Lin) move like women: Mixamo's female idle, walk (1.6 m/s), run (4.9 m/s), standing jump and
  running jump (`F Idle`, `F Walk`, `F Run`, `F Standing Jump`, `F Running Jump`), and at a slow stroll the catwalk
  (`F Catwalk Walk`). Crouch, slide, prone and climbs are the same moves for everyone.
To rebuild: put the FBX files in one folder, `python3 tools/character/anim/make_moves3.py <folder> raw.glb`, then
`gltfpack -i raw.glb -o assets/people/moves3.glb -cc -kn -af 30` and `python3 tools/manifest.py`.

## Camera
Settings → Camera: **Turn speed** (how fast the view turns under your finger or mouse) and **Follow** (the camera swings
round behind you as you move, so you don't keep turning it; "Follow more" swings faster, "Free" never). It waits while
you turn it yourself or aim, and doesn't swing round when you run towards it. Kept on this device.

## Skating, bike and car skills
- **Skateboard:** W pushes with the back foot up to top speed (hold Shift or push the stick all the way for faster
  pushes); then he stands and rolls, and only pushes again once the board has slowed to about 70% of it. S or BRAKE
  drags the foot, A/D carve (no sharper than about 0.65 g sideways, so fast turns are wide). Space (OLLIE on phones) pops
  an ollie. Tricks: J kickflip, K heelflip, I 360 flip, L shove-it, O (or L with A/D) a 360 spin of board and rider
  (on phones FLIP, FLIP with the stick left = heelflip, up = 360 flip, SPIN = shove-it, SPIN with the stick left/right =
  360 spin). Pressed on the ground a trick pops the ollie for you; pressed in the air it comes next. Press and hold
  OLLIE again in the air (the button says GRAB) for an Indy grab: the back hand takes the toe edge, points grow while
  you hold it. Tricks in one jump make a combo (DOUBLE, TRIPLE…); land it straight or you bail and fall. Rough roads slow
  you, walls and people throw you off.
  The skater's body is not a set of fixed poses: `src/skater.js` works it out every frame from the ride. To push he turns
  to face the nose, the back foot comes down on the road and stays on that spot while the board rolls past it (the board
  only gains speed while the foot is down), then it swings forward for the next push or back onto the tail. Carving, he
  leans as far as the speed and the turn need (tan lean = speed × turn rate / g; the board leans about half as much).
  The ollie is a quick squat, the tail snapping down so the board pivots on its back wheels, the front foot dragging it
  level, the legs tucking at the top and then giving like a spring on the landing. The arms swing like damped pendulums
  from the body's real pushes, turns, pop and landing. The feet stay on the deck by two-bone IK, so it fits any body; the
  back foot rides over the back bolts and slides onto the kicked-up tail (its height and slope read from the model) to pop.
- **Bikes:** Shift (WHEELIE) lifts the front wheel, handbrake while straight is a stoppie, J (HOP) is a bunny hop.
- **Drifts:** handbrake (Space/BRAKE) while turning at speed slides cars and bikes with tyre smoke; hold it for DRIFT points.
- Every skill shows its name and points; big ones (300+) pay a little cash. Your best combo is kept.
- **Vehicle health:** cars take many more knocks before smoke, fire and the blast (a car about 11 hits at 70 km/h,
  bikes fewer, buses and the tanker more; a tanker blast is bigger).
Models: `assets/models/car_blue.glb`, `car_benz.glb`, `tanker.glb`, `bike_naked.glb`, `bike_sport.glb`, `skateboard.glb`
(each with a `_lod1` far version), listed in `LATE_FILES` in `src/game.js`. The skateboard is built in Blender by
`tools/blender_skateboard.py` (an 8.1" × 32" street deck with kicked nose and tail and concave, black grip, a green-white-
green Naija graphic underneath, trucks with red bushings, 54 mm wheels with green cores; vertex colours, no textures):
paste it into Blender's Scripting tab and Run, it writes both files to Documents/naija_skateboard. Without Blender:
`python3 tools/glb_build.py -m blender_skateboard`.

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
At home, walk to the wardrobe and press E to change your clothes (in your tent: your bag; in your room: the nails on the
wall). Only clothes you have bought at the boutique can be worn. You keep your own face: each look lends you its body
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

## Picture and messages
When the phone is busy (screen recording, heat) the game draws fewer pixels to keep moving, but never softer than three
quarters of the full picture, only after two slow spells in a row, and it comes back sharp quickly. Settings, Graphics:
**Always sharp** never softens it. The messages at the top are see-through glass (white text on a light dark glass,
blurred behind on computers), smaller on phones, and fade away.

## Last step: sharper picture on phones
When the game is finished, the very last job is a sharp upscale for phones, like AMD FSR 1 (DLSS can't run in browsers).
Phones draw the game smaller than the screen; the browser stretches it and it looks soft. The two shaders in
`tools/sharpen_shaders.js` (Catmull-Rom upscale, then FSR's RCAS sharpening) make leaves, signs and windows clearly crisper
for very little cost. Hook them in after the scene is drawn whenever the pixel ratio is below the screen's.

Map data © OpenStreetMap contributors, ODbL.

## The Central Bank of Nigeria

Blender: `naija_rooms/cbn` (cbn_ext.py outside, cbn_hall.py and cbn_office.py inside, worker jobs c01, c03 and c10).
It stands where the city quarter's old bank was (that part of set_city is cut away). Outside: the fence with razor wire, four
watchtowers, the vehicle gate (boom arms, tyre killer, road blocker, guard house, inspection canopy, sandbag post, an APC), the
pedestrian gate with its screening kiosk, staff and VIP parking, the bullion bay with armoured vans, CCTV all round. Armed
guards stand at their posts: hit one or fire a gun on the grounds and they all come for you. Inside (int_cbn_hall): the
queue belts, X-ray, walk-through detectors and the search table; weapons are kept in the locker until you leave; the speed
gates let you through only once the detector clears you; reception, the lounge and four lifts. The lift takes you to the
12th floor (int_cbn_office): the Banking Supervision unit, 14 staff typing at their own desks and computers, the head of
unit's glass office, the meeting room, the copier and the water cooler, and your own desk by the window (one paid shift a day).

### Working at the CBN (server/src/cbn.js, the CBN app on the phone)
The best-paid job in the game, and the hardest to get. Apply on the CBN app with a letter (why you want to work with us).
The Governor (a player: the highest-ranked worker) reads the letters, accepts or rejects them and can write a message back;
rejected players can try again after a day. While the Governor's seat is empty, the Board reads the letters (after about
30 minutes; it wants a serious letter) so the bank can fill up until someone climbs to the top. Staff only go up to the
12th floor. One shift a day at your own desk (2 minutes seated, typing; walk off and the day is lost) pays by position:

| Position | Shifts | Pay a shift |
|---|---|---|
| Clerk | 0 | ₦100,000 |
| Officer | 5 | ₦150,000 |
| Senior Officer | 12 | ₦250,000 |
| Manager | 22 | ₦400,000 |
| Assistant Director | 35 | ₦550,000 |
| Director | 50 + Governor's approval | ₦700,000 |
| Deputy Governor | 70 + Governor's approval | ₦850,000 |
| Governor (one seat) | 100 + approval while the seat is empty | ₦1,000,000 |

A Governor away for 7 days loses the seat (back to Deputy Governor). Wanted players cannot apply.

## Credits: the Central Bank

From Sketchfab (CC BY 4.0 unless marked "Sketchfab Standard"):
- X-ray: "Baggage Scanner" by Anom404 (Sketchfab Standard) — https://sketchfab.com/3d-models/6db2b2392c2b45948f7a70286853fa29
- Detectors: "Metal detector (entrance)" by menX1151 — https://sketchfab.com/3d-models/e05f5f48b3eb4fa88fc5c7548a3a324a
- Speed gates: "Simple turnstile" by LUMENE — https://sketchfab.com/3d-models/b0fb9ddd343544a681ae108591bf0277
- Queue belts: "Poste_separador_queue_Barrier" by eventdesignws — https://sketchfab.com/3d-models/d9146a68827e4b1c854991bb9872046e
- Sofas: "Modern Sofa" by 3dimentionalben — https://sketchfab.com/3d-models/ac92f6e97eaa43c4ad6cb8f7c65ac43f
- Plants: "Monstera Deliciosa Potted Mid-Century plant" by ChubbyPanda — https://sketchfab.com/3d-models/1ab9bf841df04c07b1819be596327629
- Chairs: "Office Chair Modern" by thethieme — https://sketchfab.com/3d-models/675f34f7304e4d92812a41e9750539aa
- Monitors: "Computer Monitor Lowpoly Model" by marcoZakaria — https://sketchfab.com/3d-models/1d4ee42eda804b02b05b63721921c1d7
- Copier: "MFP Office Printer" by nokillnando — https://sketchfab.com/3d-models/d55f6fca7c3d45c883bbff770672970d
- Water cooler: "Water cooler" by tboiston — https://sketchfab.com/3d-models/4b88c4c4e94c497ca39f831f374e89fc
- Coffee: "coffee machine" by maxdragon — https://sketchfab.com/3d-models/6784e4f16a7248518cd5ef1118a2198a
- Filing cabinets: "Filing cabinet - green" by sousinho (Sketchfab Standard) — https://sketchfab.com/3d-models/f79a828774b84838b8f9d36d02920361

## Credits: the women
Bodies, shoes and some hair from MakeHuman (MPFB, CC0). From Sketchfab, used under CC BY 4.0:
- The head: "Female Head Base Mesh" by snailpot_maysachan — https://sketchfab.com/3d-models/dcb462e129924a7ca0232f4b11830208
- Cornrows (Amaka): "Cornrow Braids Hairstyle" by OCBacon — https://sketchfab.com/3d-models/c8052613e7894027a272e5af04ca8da4
- Afro (Ada): "Hair, Afro Style (Rose) - Character Items (Free)" by continuumreed — https://sketchfab.com/3d-models/4b2ab828306a4369a0665d9860b13541
- Bun (Sgt Halima): "Messy Low Bun Female Hairstyle" by CliffUnderside — https://sketchfab.com/3d-models/db7a61ea9f2c45ddb0b7571972f9738f

## Credits: the men
Bodies, shoes and clothes' bases from MakeHuman (MPFB, CC0). From Sketchfab, used under CC BY 4.0:
- The head: "Male Head Sculpt" by kleyyer — https://sketchfab.com/kleyyer
- Dreads (Femi): "Short Dreadlocks" by tikoavp — https://sketchfab.com/tikoavp

## Credits: farm animals
The farm's cows and hen are scanned models from Sketchfab, used under CC BY 4.0, rigged and animated for the game
in Blender (tools/blender_animals_real.py):
- Brown zebu cow: "Low poly Realistic cow 3d modle free" by rt699448 — https://sketchfab.com/3d-models/b47bf894ce6641fd9c033aaa260ca902
- Holstein cow: "Realistic Holstein Cow - Game Ready Asset" by Hdjusj — https://sketchfab.com/3d-models/0bd2f1c0c79a4b5b9d36e67f0f700c5e
- Hen: "Realistic Brown Chicken Hen - Game Ready Asset" by Hdjusj — https://sketchfab.com/3d-models/43f9097171404f3cadce8b5fea33ce95
