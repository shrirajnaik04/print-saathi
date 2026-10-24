"""Spike (e) fixture variants that look like real phone files (Gate 2 finding 5), from the 108 MP fixture.

  108mp-420.jpg        baseline JPEG, 4:2:0 chroma (what phone cameras write)
  108mp-prog-odd.jpg   progressive JPEG, 4:2:0, odd size 11999x8999
  48mp-odd.png         PNG, odd size 7999x5999 (screenshots / exports)

`raw <file> <out.rgba>` decodes any of them to full-resolution raw RGBA (Pillow's libjpeg-turbo/zlib), for
scripts/quality/area-ref.mjs to make the exact area-average reference. (PIL's own BOX resize is NOT used: it
samples filter weights instead of integrating partial pixel coverage, measured 36.8 dB off on hard edges.)
Dev-only tool (Pillow on the build PC); nothing here ships in the app.
Usage: python tests/generate/make-variants.py make
       python tests/generate/make-variants.py raw <file> <out.rgba>
"""
import os
import sys

from PIL import Image

Image.MAX_IMAGE_PIXELS = 200_000_000
DIR = "tests/fixtures-large"


def make():
    src = Image.open(os.path.join(DIR, "108mp.jpg")).convert("RGB")
    src.save(os.path.join(DIR, "108mp-420.jpg"), quality=90, subsampling=2)
    src.crop((0, 0, 11999, 8999)).save(os.path.join(DIR, "108mp-prog-odd.jpg"), quality=90, subsampling=2, progressive=True)
    # Covers the colour strips, the noisy texture band and the checkerboard (the hard content).
    src.crop((2000, 3000, 9999, 8999)).save(os.path.join(DIR, "48mp-odd.png"), compress_level=6)
    for n in ("108mp-420.jpg", "108mp-prog-odd.jpg", "48mp-odd.png"):
        p = os.path.join(DIR, n)
        im = Image.open(p)
        print(f"{n}: {im.size[0]}x{im.size[1]} {im.format} progressive={im.info.get('progressive', 0)} {os.path.getsize(p)} bytes")


def raw(path, out):
    im = Image.open(path).convert("RGBA")
    with open(out, "wb") as f:
        f.write(im.tobytes())
    print(f"{im.size[0]}x{im.size[1]}")


if __name__ == "__main__":
    if sys.argv[1] == "make":
        make()
    elif sys.argv[1] == "raw":
        raw(sys.argv[2], sys.argv[3])
