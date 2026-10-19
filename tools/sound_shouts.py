"""Find people shouting in a street recording (conductors calling out, hawkers): voiced (a clear pitch between
110 and 480 Hz), louder than what is around them, the pitch moving like speech (not a steady horn). Prints the best
candidates and draws a sheet of their spectra (0-4 kHz, linear) to check by eye.

    python3 tools/sound_shouts.py <file.mp3> [n=24] [sheet.png]
"""
import sys, subprocess, math
import numpy as np

SR = 16000


def load(p):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-ac', '1', '-ar', str(SR), '-af', 'highpass=f=100,lowpass=f=4000', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def frames(x, n=640, h=160):
    k = 1 + (len(x) - n) // h
    idx = np.arange(n)[None, :] + h * np.arange(k)[:, None]
    return x[idx] * np.hanning(n)[None, :].astype(np.float32)


def analyse(x):
    F = frames(x)
    S = np.abs(np.fft.rfft(F, 1024, axis=1)) ** 2
    f = np.fft.rfftfreq(1024, 1 / SR)
    band = S[:, (f > 300) & (f < 3000)].sum(1)
    e = 10 * np.log10(band + 1e-12)
    # pitch strength: autocorrelation of each frame (via the power spectrum), peak in 110-480 Hz
    ac = np.fft.irfft(S, 1024, axis=1)[:, :200]; ac /= (ac[:, :1] + 1e-12)
    lo, hi = int(SR / 480), int(SR / 110)
    lag = lo + np.argmax(ac[:, lo:hi], axis=1); r = ac[np.arange(len(ac)), lag]
    pitch = SR / lag
    # loudness against the surroundings (median over 6 s)
    w = 600; pad = np.pad(e, (w // 2, w // 2), mode='edge')
    from numpy.lib.stride_tricks import sliding_window_view
    med = np.median(sliding_window_view(pad, w + 1)[::10], axis=1)
    med = np.interp(np.arange(len(e)), np.arange(len(med)) * 10, med)
    prom = e - med
    return e, r, pitch, prom


def segments(r, pitch, prom, hop=.01):
    on = (r > .45) & (prom > 4)
    segs = []; k = 0; n = len(on)
    while k < n:
        if not on[k]: k += 1; continue
        j = k; gap = 0
        while j < n and gap < 15:
            gap = 0 if on[j] else gap + 1; j += 1
        j -= gap
        d = (j - k) * hop
        if .35 <= d <= 2.8:
            seg = slice(k, j); v = on[seg]
            lp = np.log2(pitch[seg][v]); var = float(np.std(lp)) if v.sum() > 3 else 0
            jumps = float(np.mean(np.abs(np.diff(lp)) > .08)) if v.sum() > 4 else 0
            score = float(np.mean(prom[seg][v])) * float(np.mean(r[seg][v])) * min(1, var * 6) * (1 - .6 * min(1, jumps * 3))
            segs.append((score, k * hop, j * hop, float(np.median(pitch[seg][v])), var))
        k = j + 1
    segs.sort(reverse=True)
    return segs


def sheet(x, segs, out, n):
    from PIL import Image, ImageDraw
    cols = 4; W, H = 360, 170; rows = math.ceil(min(n, len(segs)) / cols)
    img = Image.new('RGB', (cols * W, rows * H), (10, 10, 12)); d = ImageDraw.Draw(img)
    for q, (s, a, b, p, v) in enumerate(segs[:n]):
        a0 = max(0, a - .25); b0 = b + .25; y = x[int(a0 * SR):int(b0 * SR)]
        F = frames(y, 512, 64); S = 10 * np.log10(np.abs(np.fft.rfft(F, 512, axis=1)) ** 2 + 1e-10)[:, :129]   # 0-4 kHz
        S = np.clip((S - S.max() + 70) / 70, 0, 1)
        im = Image.fromarray((S.T[::-1] * 255).astype(np.uint8)).resize((W - 8, H - 26)).convert('RGB')
        cx, cy = (q % cols) * W, (q // cols) * H
        img.paste(im, (cx + 4, cy + 22)); d.text((cx + 4, cy + 4), f'#{q} {a:.2f}-{b:.2f}s  f0 {p:.0f}  s {s:.1f}', fill=(255, 220, 90))
    img.save(out)


if __name__ == '__main__':
    p = sys.argv[1]; n = int(sys.argv[2]) if len(sys.argv) > 2 else 24
    x = load(p); e, r, pitch, prom = analyse(x); segs = segments(r, pitch, prom)
    for q, (s, a, b, f0, v) in enumerate(segs[:n]): print(f'#{q} {a:7.2f} {b:7.2f}  dur {b-a:4.2f}  f0 {f0:4.0f}  var {v:.2f}  score {s:5.2f}')
    if len(sys.argv) > 3: sheet(x, segs, sys.argv[3], n)
