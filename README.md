# Lighttext

Transmit text as flashing white dots and decode a recording entirely on your device.
No accounts, analytics, uploads, or persistence of messages. GitHub Pages serves static
assets; a Content Security Policy blocks application network connections.

## Use

Enter text or open a UTF-8 document, then Play. Record the entire square from the
three-second countdown through **Transmission complete**. Playback sends once and
stays in the current browser window. Decode the recording and copy the verified
text, preserving Unicode, punctuation, tabs, spaces and line breaks.

Version **2.0.0** uses the phone-tested 16×16 alternating grid at 12 patterns per
second. Patterns identify their own transfer, group and position. Each full group
contains 32 data patterns and eight Reed-Solomon repair patterns, allowing any eight
missing patterns to be recovered. Short messages use smaller groups and at least
nine patterns (0.75 seconds of transmission), rather than full-size recovery packets.
Gzip is selected only when it reduces the total number of patterns. The estimate
uses that exact prepared transmission. There is no arbitrary 8 KiB document cap;
practical limits remain browser memory and transmission time.

The video reader uses native decoded frames and up to two image-analysis workers.
If native reading is unavailable or its module cannot load, it uses paused video
seeks. Record CRC16, final message CRC32, strict UTF-8, and bounded decompression
must pass before text is shown. These detect accidental damage, not malicious
modification; optical transmission is not encryption.

Earlier recordings remain accessible through **Help → earlier-format decoder**.
Both transmitting and receiving devices should use version 2 for new recordings.

## Run and test

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
npm test
```

Node 24+ is used in CI. No production build or runtime package installation is
required. MP4Box 2.5.0 is bundled locally under its BSD-3-Clause license (included
in `dist/v2/vendor/MP4BOX-LICENSE`); no CDN is contacted.

Tests include independent finite-field arithmetic and raster oracles, erasures,
corruption rejection, compression, document sizes, exact whitespace, perspective,
mixed brightness and scheduler timing. Browser QA also checks actual transmitter
video round trips and the native-reader syntax-error fallback in WebKit.

A user phone test passed before promotion. This is not a guarantee for all phones,
codecs, distances or lighting. Keep the square large, sharp and free of glare.

## Hosting and privacy

GitHub Actions runs tests and deploys `dist/` from `main`. Relative asset paths
support repository Pages hosting. The version is shown in Help.
Private recordings, recovered text, diagnostic frames and local QA artifacts must
never be committed or uploaded to GitHub. Only synthetic fixtures belong in tests.
