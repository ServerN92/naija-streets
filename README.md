# Naija Streets

Open-world 3D game set in Lagos. Runs in the browser with three.js. No build step.

## Play locally
Any static server works, for example: `python3 -m http.server 8000`, then open http://localhost:8000

## Folders
- `index.html`, `src/game.js` – the game
- `assets/models/` – vehicles and buildings (.glb, optimized)
- `assets/characters/` – Mixamo character and animations (.fbx)
- `assets/maps/` – real street maps of Mushin, Oshodi and Ajegunle from OpenStreetMap (.json)
- `tools/` – scripts that shrink heavy AI models (`bake.py`) and convert OpenStreetMap exports (`convert.py`)

## Adding a new model
Export from Tripo or Meshy as GLB with about 20k faces, put it in `assets/models/`, and add it to `MODEL_FILES` in `src/game.js`.
Very heavy models can be shrunk with: `python3 tools/bake.py input.glb assets/models/output.glb 56 2048`

Map data © OpenStreetMap contributors, ODbL.
