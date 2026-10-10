"""Write assets/manifest.json with the byte size of every downloadable asset (used for the loading bar)."""
import json, os
root = os.path.join(os.path.dirname(__file__), '..')
out = {}
for d in ['assets/models', 'assets/characters']:
    for f in sorted(os.listdir(os.path.join(root, d))):
        out[f'{d}/{f}'] = os.path.getsize(os.path.join(root, d, f))
json.dump(out, open(os.path.join(root, 'assets/manifest.json'), 'w'), indent=0)
print(len(out), 'files', round(sum(out.values()) / 1e6, 2), 'MB')
