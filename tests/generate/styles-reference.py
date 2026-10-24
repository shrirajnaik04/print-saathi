import sys
import math
def rnd(x): return min(255, max(0, math.floor(x + 0.5)))
def Y(r,g,b): return 0.299*r + 0.587*g + 0.114*b
def sat(c, f):
    y = Y(*c); return [y + (v - y) * f for v in c]
def con(c, f): return [128 + (v - 128) * f for v in c]
def vibrant(c): return [rnd(v) for v in con(sat(c, 1.25), 1.08)]
def soft(c):
    c = con(c, 0.90); c = [v + 6 for v in c]; return [rnd(v) for v in sat(c, 0.92)]
cols = [(0,0,0),(255,255,255),(128,128,128),(200,40,40),(40,160,60),(30,60,220),(250,220,120),(90,70,50)]
for name,f in (('vibrant',vibrant),('soft',soft)):
    print(name, [tuple(f(c)) for c in cols])
# sharp black LUT for given levels
def sharp(v, black, white):
    t = min(1, max(0, (v - black) / (white - black)))
    return rnd(255 * t ** (1/0.85))
print('sharp ramp b90 w160', [sharp(v,90,160) for v in (0,90,100,125,128,150,160,200,255)])
print('sharp b20 w230', [sharp(v,20,230) for v in (0,20,64,128,200,230,255)])

# ---- OCV Black reference (Phase 8 gate I2): the same arithmetic as Styles.ocv, without strips. ----
def clamp255(x): return min(255, max(0, math.floor(x + 0.5)))

def ocv(grey, w, h):
    sw, sh = (w + 7) // 8, (h + 7) // 8
    mx = [0] * (sw * sh)
    for y in range(h):
        for x in range(w):
            i = (y // 8) * sw + x // 8
            mx[i] = max(mx[i], grey[y * w + x])
    wide = [0] * (sw * sh)
    for cy in range(sh):
        for cx in range(sw):
            m = 0
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    yy = min(sh - 1, max(0, cy + dy)); xx = min(sw - 1, max(0, cx + dx))
                    m = max(m, mx[yy * sw + xx])
            wide[cy * sw + cx] = m
    c = [float(v) for v in wide]
    for _ in range(2):
        tmp = [0.0] * len(c)
        for cy in range(sh):
            for cx in range(sw):
                s = 0.0
                for d in range(-2, 3): s += c[cy * sw + min(sw - 1, max(0, cx + d))]
                tmp[cy * sw + cx] = s / 5
        out = [0.0] * len(c)
        for cy in range(sh):
            for cx in range(sw):
                s = 0.0
                for d in range(-2, 3): s += tmp[min(sh - 1, max(0, cy + d)) * sw + cx]
                out[cy * sw + cx] = s / 5
        c = out
    def at(cx, cy): return c[min(sh - 1, max(0, cy)) * sw + min(sw - 1, max(0, cx))]
    flat = [0] * (w * h)
    for y in range(h):
        fy = (y + 0.5) / 8 - 0.5; cy = math.floor(fy); ty = fy - cy
        for x in range(w):
            fx = (x + 0.5) / 8 - 0.5; cx = math.floor(fx); tx = fx - cx
            b = (at(cx, cy) * (1 - tx) + at(cx + 1, cy) * tx) * (1 - ty) + (at(cx, cy + 1) * (1 - tx) + at(cx + 1, cy + 1) * tx) * ty
            flat[y * w + x] = clamp255(255.0 * grey[y * w + x] / max(b, 1.0))
    win = max(15, (min(w, h) // 16) | 1); half = win // 2
    S = [[0] * (w + 1) for _ in range(h + 1)]
    for y in range(h):
        line = 0
        for x in range(w):
            line += flat[y * w + x]
            S[y + 1][x + 1] = S[y][x + 1] + line
    stride = (w + 7) // 8
    res = bytearray([0xFF] * (stride * h))
    for y in range(h):
        ya, yb = max(0, y - half), min(h - 1, y + half) + 1
        for x in range(w):
            xa, xb = max(0, x - half), min(w - 1, x + half) + 1
            s = S[yb][xb] - S[ya][xb] - S[yb][xa] + S[ya][xa]
            n = (yb - ya) * (xb - xa)
            v = flat[y * w + x]
            if v < 80 or v * n * 100 < s * 85:
                res[y * stride + x // 8] &= ~(0x80 >> (x % 8)) & 0xFF
    return bytes(res)

def golden_page(w, h):
    """Paper darkening to the right, text strokes, a dark photo block (the same page as StylesTest.goldenPage)."""
    g = [0] * (w * h)
    for y in range(h):
        for x in range(w):
            paper = 235 - 90 * x // w
            text = (y // 30) % 2 == 0 and 10 <= y % 30 <= 14 and (x // 20) % 3 != 2
            v = paper - 110 if text else paper
            if 40 <= x < 120 and 60 <= y < 140: v = 60 + 80 * (x - 40) // 80
            g[y * w + x] = min(255, max(0, v))
    return g

if __name__ == '__main__' and len(sys.argv) > 1:
    W, H = 300, 200
    data = ocv(golden_page(W, H), W, H)
    open(sys.argv[1], 'wb').write(data)
    print('ocv golden', len(data), 'bytes, black pixels', sum(8 - bin(b).count('1') for b in data))
