# Phase 19 — photo notes left out of the print file (self-audit finding, 2026-10-24)

## The finding

Phase 19 put an original JPEG into the print file as its own bytes. That copy also carried the photo's **notes**:

- EXIF: where and when it was taken, the phone;
- XMP and IPTC;
- comments and colour profile;
- anything after the picture: a second picture, a depth map, an HDR layer.

The print service and the printer then received them all. Before Phase 19, re-saving the photo dropped them. The owner
asked for the picture "as is"; the photo's location data is no part of the print.

## The fix

The engine now copies **only the picture**, byte for byte (`JpegAsIs.pictureOnly`):

- **Kept:** the tables, the frame and every scan, so the photo decodes to the very same pixels. The Adobe note stays,
  because it says how the colours are stored.
- **Dropped:** every other APPn note, comments, and anything after the end mark.
- **Turns:** the camera's turn is read before the copy, so photos still print upright.
- **Bad files:** a cut or broken file is never copied; it is decoded as before.

## Evidence

- `JpegAsIsDeviceTest-api35.xml` (emulator Medium_Tablet, API 35), 3/3:
  - **Same picture:** the copy equals `pictureOnly(original)`, and every decoded pixel equals the original's.
  - **No notes:** no `Exif` and no `ICC_PROFILE`, even though place and time were added to the test photo.
  - **Turn kept:** the camera's turn is still returned.
- JVM `JpegAsIsTest` (10 tests):
  - baseline and progressive photos with EXIF, XMP, IPTC, a comment, a profile and a trailing picture come out exactly
    equal to the plain picture;
  - the Adobe note stays;
  - cut files give null;
  - 300 randomly damaged files never throw.
- Device smoke `../../phase-18/2026-10-24/device-smoke-api35/adjust-smoke.json`:
  - `originalPhotoInTheFileByteForByte`: the picture data is inside the print file;
  - `photoNotesLeftOutOfThePrintFile`: a gallery photo with EXIF leaves no EXIF in the print file.
