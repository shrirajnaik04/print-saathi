"""Checks that every JPEG image in a PDF is grey data only (every pixel R = G = B, chroma 128).
Independent of the app: Pillow decodes each DCT image stream. Usage: python scripts/quality/check-grey-pdf.py <file.pdf>
Exit 1 if any pixel is not grey. Prints counts only (never image content)."""
import io
import re
import sys

from PIL import Image

data = open(sys.argv[1], 'rb').read()
images = pixels = not_grey = 0
for m in re.finditer(rb'<<([^>]*?/Subtype\s*/Image.*?)>>\s*stream\r?\n', data, re.S):
    d = m.group(1)
    length = re.search(rb'/Length\s+(\d+)', d)
    if not length or b'/DCTDecode' not in d:
        continue
    im = Image.open(io.BytesIO(data[m.end(): m.end() + int(length.group(1))])).convert('RGB')
    images += 1
    for p in im.getdata():
        pixels += 1
        not_grey += not (p[0] == p[1] == p[2])
print(f'images {images}, pixels {pixels}, not grey {not_grey}')
sys.exit(1 if not_grey or not images else 0)
