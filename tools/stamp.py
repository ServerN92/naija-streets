"""Stamp one release id into the page and the game code before publishing.

The page (index.html) and the game code (src/*.js) must always come from the same
release. Run this after every change and before pushing:

    python3 tools/stamp.py

It hashes the current sources and writes the id into:
  index.html  <meta name="ns-build">  and  src/game.js?v=...
  src/game.js const BUILD and the ?v= of its own imports
"""
import hashlib, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = {'index.html': ROOT / 'index.html', 'game': ROOT / 'src' / 'game.js'}
PATTERNS = {
    'index.html': [r'(<meta name="ns-build" content=")([^"]*)(")', r'(src/game\.js\?v=)([^"]*)(")'],
    'game': [r"(const BUILD=')([^']*)(')", r"(\./clock\.js\?v=)([^']*)(')", r"(\./mapview\.js\?v=)([^']*)(')", r"(\./char2\.js\?v=)([^']*)(')", r"(\./phone\.js\?v=)([^']*)(')"],
}

def neutral(text, key):
    for p in PATTERNS[key]:
        text = re.sub(p, lambda m: m.group(1) + 'X' + m.group(3), text)
    return text

h = hashlib.sha1()
for key, f in FILES.items():
    h.update(neutral(f.read_text(), key).encode())
for extra in ['src/clock.js', 'src/mapview.js', 'src/char2.js', 'src/phone.js']:
    h.update((ROOT / extra).read_bytes())
build = h.hexdigest()[:10]

for key, f in FILES.items():
    t = f.read_text(); n = 0
    for p in PATTERNS[key]:
        t, k = re.subn(p, lambda m: m.group(1) + build + m.group(3), t); n += k
    assert n == len(PATTERNS[key]), f'{f.name}: expected {len(PATTERNS[key])} stamps, found {n}'
    f.write_text(t)
print('release', build)
