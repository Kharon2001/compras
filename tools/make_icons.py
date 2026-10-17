"""Genera los iconos PNG de la app sin dependencias (zlib + distancias con antialiasing)."""
import math, struct, sys, zlib, os

def write_png(path, w, h, rows):
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) \
        + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)

def lerp(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
def cov(d): return max(0.0, min(1.0, 0.5 - d))
def seg(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)

def icon(S, path):
    R = 0.31 * S
    c = S / 2
    pts = [(0.385 * S, 0.505 * S), (0.468 * S, 0.588 * S), (0.632 * S, 0.418 * S)]
    hw = 0.034 * S
    rows = []
    for y in range(S):
        row = []
        for x in range(S):
            px, py = x + 0.5, y + 0.5
            col = lerp((255, 255, 255), (243, 240, 232), py / S)
            a = cov(math.hypot(px - c, py - c) - R)
            if a:
                col = lerp(col, lerp((255, 226, 70), (255, 196, 0), (py - c + R) / (2 * R)), a)
                d = min(seg(px, py, *pts[0], *pts[1]), seg(px, py, *pts[1], *pts[2])) - hw
                col = lerp(col, (28, 22, 0), cov(d) * a)
            row += [int(round(v)) for v in col]
        rows.append(row)
    write_png(path, S, S, rows)

out = sys.argv[1]
for size, name in [(180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')]:
    icon(size, os.path.join(out, name))
