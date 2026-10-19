"""Build the game's sounds (assets/sounds) from the downloaded recordings (Freesound previews, see CREDITS below).

    python3 tools/sound_build.py <folder with <id>.mp3>            build everything in RECIPES
    python3 tools/sound_build.py <folder> --look <id> [...]         a picture of a recording (loudness + spectrum) to choose cuts

Beds become seamless loops (the end cross-faded into the start), engines short loops, the rest one-shots; every file is
levelled (beds and engines by loudness, one-shots by peak) and written as MP3 (beds stereo 80 kb/s, the rest mono 64 kb/s).
assets/sounds/sounds.json lists each sound with its gain (and, for engines, how its pitch follows the speed);
assets/sounds/CREDITS.md credits every recording.
"""
import sys, os, json, subprocess, math
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'sounds')
SR = 44100

# id: (title, author, licence)
SRC = {
    582367: ('AMBTraf Ambience traffic Van Bus Truck car siren', 'SFXAFRIK', 'CC BY 4.0'),
    582935: ('AMBTraf Ambience bus stop close perspective conductors 01', 'SFXAFRIK', 'CC0'),
    582955: ('AMBTraf Ambience bus stop close perspective conductors 02', 'SFXAFRIK', 'CC BY 4.0'),
    582962: ('AMBTraf Ambience market hawker traffic near road', 'SFXAFRIK', 'CC BY 4.0'),
    582964: ('AMBTraf Ambience (estate: birds, voices, car door, motorcycle)', 'SFXAFRIK', 'CC BY 4.0'),
    727132: ('Amb ogun state activies people afternoon local dog bark village yoruba footsteps goat bleat', 'SFXAFRIK', 'CC BY 4.0'),
    608207: ('AMBUrbn Amb night cricket distant voices traffic light wind low rumble', 'SFXAFRIK', 'CC BY 4.0'),
    727136: ('Amb village night cricket yoruba church rural area distant traffic', 'SFXAFRIK', 'CC BY 4.0'),
    727135: ('Amb village fire footsteps chicks cock crow bike passby distant traffic light activity', 'SFXAFRIK', 'CC BY 4.0'),
    132823: ('Rain on Corrugated Iron', 'Benboncan', 'CC BY 4.0'),
    243778: ('peal of thunder close', 'bastipictures', 'CC0'),
    367175: ('generator small 01', 'DiscoverSound', 'CC0'),
    222808: ('pull-start-idleup', 'gthall', 'CC0'),
    255231: ('Islamic Call to Prayer (Dhuhr Adhan), Hamtramck, MI', 'RJStefanski', 'CC BY 3.0'),
    333226: ('Kuala Lumpur Airport ambience, Terminal P6', 'gladkiy', 'CC0'),
    465054: ('Airbus A340-500 takeoff', 'Sonicwave32', 'CC0'),
    518175: ('Motorcycle Engine_0km', 'Cmart94', 'CC BY 4.0'),
    518173: ('Motorcycle Engine_30km', 'Cmart94', 'CC BY 4.0'),
    261059: ('Auto Rickshaw - Start, Idle, Some Revving', 'kalhan', 'CC BY 4.0'),
    261062: ('Auto Rickshaw - Start, Ride, Stop, Some Talking', 'kalhan', 'CC BY 4.0'),
    453994: ('engine idle van diesel exhaust CBC microwave truck side1', 'kyles', 'CC0'),
    425844: ('Renault Master dCi135 Ext Start Up Idle Drive Away', 'Soundholder', 'CC BY 3.0'),
    147242: ('Car Engine Loop', 'qubodup', 'CC BY 4.0'),
    154758: ('Car Engine Idling', 'jpkweli', 'CC0'),
    453415: ('bus coach ext diesel truck engine idle throaty', 'kyles', 'CC0'),
    423990: ('Car horn beep beep two beeps', 'AmishRob', 'CC0'),
    153049: ('Motorcycle-horn', 'Xampi8', 'CC BY 3.0'),
    513741: ('Truck Horn', 'danlucaz', 'CC0'),
    504565: ('Bus Truck Horn Blast', 'DominikBraun', 'CC BY 4.0'),
    454687: ('Passenger car braking, tyres screeching', 'YleArkisto', 'CC BY 4.0'),
    237375: ('Car Crash', 'squareal', 'CC0'),
    556689: ('Car Door open and close', 'NachtmahrTV', 'CC0'),
    70936: ('police.wav', 'guitarguy1985', 'CC0'),
}

# name: dict(src, a=start s, d=length s, kind='bed'|'loop'|'shot', level, extra json fields)
RECIPES = {}


def load(folder, i, stereo=True):
    p = os.path.join(folder, f'{i}.mp3')
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-f', 'f32le', '-ac', '2' if stereo else '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32)
    return x.reshape(-1, 2) if stereo else x.reshape(-1, 1)


def rms_db(x):
    return 20 * math.log10(max(1e-9, float(np.sqrt(np.mean(x.astype(np.float64) ** 2)))))


def loopify(x, xf):
    """the last xf samples cross-fade into the first: plays round without a click"""
    n = len(x) - xf; out = x[:n].copy()
    t = np.linspace(0, 1, xf, dtype=np.float32)[:, None]
    out[:xf] = x[n:] * np.cos(t * np.pi / 2) + x[:xf] * np.sin(t * np.pi / 2)
    return out


def fade(x, a=.01, b=.05):
    n = len(x); fa = min(n // 4, int(a * SR)); fb = min(n // 4, int(b * SR))
    if fa: x[:fa] *= np.linspace(0, 1, fa, dtype=np.float32)[:, None]
    if fb: x[-fb:] *= np.linspace(1, 0, fb, dtype=np.float32)[:, None]
    return x


def encode(x, name, kbps):
    ch = x.shape[1]
    p = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', str(ch), '-i', '-', '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', p],
                   input=np.clip(x, -1, 1).astype(np.float32).tobytes(), check=True)
    return os.path.getsize(p)


def build(folder, only=None):
    os.makedirs(OUT, exist_ok=True)
    meta = {}; cache = {}; used = set()
    for name, R in RECIPES.items():
        if only and name not in only: continue
        kind = R['kind']; stereo = kind == 'bed'
        if not os.path.exists(os.path.join(folder, f'{R["src"]}.mp3')): print(f'{name:16s} (no recording {R["src"]} yet)'); continue
        key = (R['src'], stereo)
        if key not in cache: cache[key] = load(folder, R['src'], stereo)
        x = cache[key]; a = int((R.get('a') or 0) * SR); d = int(R['d'] * SR) if R.get('d') else len(x) - a
        if kind in ('bed', 'loop'):
            xf = int(R.get('xf', 2.0 if kind == 'bed' else .25) * SR)
            seg = x[a:a + d + xf].copy()
            if R.get('hp'): seg = hpf(seg, R['hp'])
            y = loopify(seg, xf)
            y *= 10 ** ((R.get('level', -24 if kind == 'bed' else -20) - rms_db(y)) / 20)
        else:
            y = x[a:a + d].copy()
            if R.get('hp'): y = hpf(y, R['hp'])
            if R.get('level') is not None: y *= 10 ** ((R['level'] - rms_db(y)) / 20)
            else: y *= 10 ** (-3 / 20) / max(1e-6, float(np.max(np.abs(y))))
            y = fade(y, R.get('fi', .01), R.get('fo', .06))
        pk = float(np.max(np.abs(y)))
        if pk > .98: y *= .98 / pk
        size = encode(y, name, 80 if kind == 'bed' else 64)
        m = {'gain': R.get('gain', 1.0), 'dur': round(len(y) / SR, 2), 'src': R['src']}
        for k in ('r0', 'r1'):
            if k in R: m[k] = R[k]
        meta[name] = m; used.add(R['src'])
        print(f'{name:16s} {kind:5s} {len(y)/SR:6.1f}s {size//1024:5d} KB  from {R["src"]}')
    old = {}
    pj = os.path.join(OUT, 'sounds.json')
    if only and os.path.exists(pj): old = json.load(open(pj))
    old.update(meta); json.dump(old, open(pj, 'w'), indent=0)
    srcs = sorted({m['src'] for m in old.values()})
    with open(os.path.join(OUT, 'CREDITS.md'), 'w') as f:
        f.write('# Sound credits\n\nRecordings from [Freesound](https://freesound.org), cut, levelled and looped for the game.\n'
                'CC0 needs no credit (listed anyway, with thanks); CC BY sounds are used under their licence.\n\n')
        for i in srcs:
            t, a, l = SRC[i]
            f.write(f'- "{t}" by {a} (https://freesound.org/s/{i}/), {l}\n')
    print(len(old), 'sounds,', round(sum(os.path.getsize(os.path.join(OUT, n + '.mp3')) for n in old) / 1e6, 2), 'MB')


def hpf(x, hz):
    """high-pass through ffmpeg (fast, any length)"""
    ch = x.shape[1]
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', str(ch), '-i', '-', '-af', f'highpass=f={hz}:poles=2', '-f', 'f32le', '-'],
                         input=x.astype(np.float32).tobytes(), capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, ch).copy()


def look(folder, ids, out_dir):
    """loudness over time (0.1 s steps) drawn above the spectrum, with a time scale"""
    from PIL import Image, ImageDraw
    os.makedirs(out_dir, exist_ok=True)
    for i in ids:
        x = load(folder, int(i), False)[:, 0]; n = len(x) / SR
        sp = os.path.join(out_dir, f'spec_{i}.png')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(folder, f'{i}.mp3'), '-lavfi', 'showspectrumpic=s=1600x300:legend=0:fscale=log:color=intensity:stop=9000', sp], check=True)
        W = 1600; step = int(.1 * SR); env = [rms_db(x[k:k + step]) for k in range(0, len(x), step)]
        img = Image.new('RGB', (W, 520), (20, 20, 24)); d = ImageDraw.Draw(img)
        for k, e in enumerate(env):
            px = int(k / len(env) * W); h = int(max(0, e + 60) / 60 * 180); d.line([(px, 200), (px, 200 - h)], fill=(240, 200, 60))
        for s in range(0, int(n) + 1, 5 if n < 60 else 10):
            px = int(s / n * W); d.line([(px, 200), (px, 210)], fill=(255, 255, 255)); d.text((px + 2, 202), str(s), fill=(255, 255, 255))
        img.paste(Image.open(sp).convert('RGB').resize((W, 300)), (0, 216))
        d.text((6, 4), f'{i}  {n:.1f}s  rms {rms_db(x):.1f} dB', fill=(255, 255, 255))
        img.save(os.path.join(out_dir, f'look_{i}.png')); os.remove(sp)
        print('look', i, round(n, 1), 's')


if __name__ == '__main__':
    folder = sys.argv[1]
    if '--look' in sys.argv:
        look(folder, sys.argv[sys.argv.index('--look') + 1:], os.path.join(folder, 'look'))
    else:
        exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sound_recipes.py')).read())
        build(folder, sys.argv[2:] or None)
