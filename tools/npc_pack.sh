#!/bin/sh
# Shrink converted characters for the game (run after tools/npc_convert.py OUT_DIR).
#   sh tools/npc_pack.sh OUT_DIR /path/to/gltfpack
# Characters: 20% of the triangles, KTX2 textures (1024 max), compressed. Moves: 20 keys per second, compressed.
set -e
D="$1"; P="$2"; mkdir -p "$D/out"
for f in "$D"/raw/*.glb; do
  n=$(basename "$f")
  if [ "$n" = moves.glb ]; then "$P" -i "$f" -o "$D/out/$n" -cc -kn -af 20
  else "$P" -i "$f" -o "$D/out/$n" -si 0.2 -tc -tl 1024 -cc -kn; fi
done
ls -l "$D/out"
