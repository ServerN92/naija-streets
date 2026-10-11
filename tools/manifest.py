"""Write assets/manifest.json: the byte size of every downloadable asset (for the loading bar) and,
under "_v", a short content hash used as its cache key, so a changed file always reaches players."""
import json, os, hashlib
root = os.path.join(os.path.dirname(__file__), '..')
out, ver = {}, {}
for d in ['assets/models', 'assets/characters']:
    for f in sorted(os.listdir(os.path.join(root, d))):
        p = os.path.join(root, d, f)
        out[f'{d}/{f}'] = os.path.getsize(p)
        ver[f'{d}/{f}'] = hashlib.sha1(open(p, 'rb').read()).hexdigest()[:8]
out['_v'] = ver
json.dump(out, open(os.path.join(root, 'assets/manifest.json'), 'w'), indent=0)
print(len(ver), 'files', round(sum(v for k, v in out.items() if k != '_v') / 1e6, 2), 'MB')
