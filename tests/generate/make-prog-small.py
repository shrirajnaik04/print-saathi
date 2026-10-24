# Makes tests/fixtures/prog-small.jpg: a synthetic 1600x1200 progressive JPEG (no customer content), used by
# EngineHostileInputTest to prove a progressive photo within the phone's budget still decodes.
# Usage: python tests/generate/make-prog-small.py
from PIL import Image

im = Image.new('RGB', (1600, 1200))
px = im.load()
for y in range(0, 1200, 4):
    for x in range(0, 1600, 4):
        c = ((x * 255) // 1600, (y * 255) // 1200, 128)
        for dy in range(4):
            for dx in range(4):
                px[x + dx, y + dy] = c
im.save('tests/fixtures/prog-small.jpg', 'JPEG', quality=85, progressive=True)
