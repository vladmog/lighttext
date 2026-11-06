## Version 2.0.0

The new 16×16 format passed user phone testing before promotion. Automated checks cover independent FEC arithmetic, missing units, CRC rejection, exact document recovery, mixed-bank images, and scheduler timing. WebKit and Chrome browser video round trips and a deliberately failed native-reader import passed for the integrated main app in Chrome and WebKit. All 38 automated tests passed. Broader physical-device coverage remains unverified. Earlier evidence below applies to the earlier format.

# Verification — 2026-11-05

## Passed

- Ten Node test groups: independent CRC check vector and Node CRC oracle;
  every printable ASCII character, programming punctuation, UTF-8, tabs/spaces/LF;
  corrupt and truncated packets rejected; repeated-pass packet recovery;
  15/24/30/60 fps timing observations at several phase offsets; repeated bytes;
  corrupted-frame voting and missing-symbol rejection.
- All 512 possible data-grid states detected in independently rasterized images.
- Independent fixtures at 36 rotations with perspective distortion, motion,
  reduced contrast and background spots. Missing/cropped marker and blank-image
  rejection fixtures also pass. These are bounded fixtures, not all scene types.
- Headless installed Chrome: desktop 1280×900, portrait 393×852, landscape 852×393.
  Transmit, Stop, mode switching, help, file selection, cancellation and Copy work.
  No horizontal overflow. Screenshots inspected. Fresh touch/mobile-emulated
  contexts tested at both phone sizes with device scale factor 2.
- An independently encoded and drawn 30 fps WebM with motion and perspective
  passes through the actual browser file input, worker and decoder. Result is
  exactly `Hi{}|` + LF + TAB + `9`. Clipboard contents checked independently.
- A recording of the actual transmitter canvas passes through the decoder UI:
  exactly `aA0|` + LF + TAB. This exercises both modes together.
- Desktop Chrome with mobile viewport emulation recovered the first fixture in
  approximately 1.3 seconds. This is a desktop measurement, **not phone hardware
  performance**; decode stops as soon as a complete checked message is recovered.
- No page errors or external application requests during browser QA. Production
  assets are roughly 56 KB on disk and contain no third-party runtime dependency,
  fetch call, content storage API, account integration or analytics. CSP blocks
  connections. Local video object URLs are revoked and workers terminated.

## Not yet verified

- Physical iPhone/Safari or Android recordings and processing speed/battery use.
- Rolling shutter, display refresh bands, heavy shake, glare, severe perspective,
  out-of-focus recording, and low light on real camera hardware.
- Every browser/video-codec combination. HEVC/MOV availability depends on browser
  and platform. The decoder reports unreadable files rather than uploading them.

The release is a working browser prototype, not a certified optical link. Do not
claim the synthetic tests prove reliable decoding from arbitrary phone footage.

Local QA artifacts are ignored under `qa/`; they contain synthetic text only.

## Document and timing update

- Removed the 8 KiB product limit; added backward-compatible LTX2 for large text.
- Exact round trip for a UTF-8 code document above 8 KiB; corruption still rejected.
- Checked an extended packet index of 65,536 and count of 65,537 beyond 4 MiB.
- Timing estimate uses encoded UTF-8 size, framing overhead, transmission period,
  and startup countdown. In-flight remaining time adapts to observed symbol timing.
- Plain-text file input added. Physical recordings of large documents have not
  been tested; extended-format verification is at the protocol level.
- The separate local speed lab is not part of this repository or deployment.

## Square standard update

The main transmitter now uses the 6×6 alternating grid at a nominal 30 patterns/s.
All 19 protocol and image tests pass, including documents above 8 KiB and extended
chunk indices above 4 MiB. The browser test recorded the actual square transmitter,
decoded exact Unicode/whitespace, checked cancellation and clipboard, and decoded
an older 3×3 video. Desktop, portrait and landscape screenshots were inspected.
A roughly 30 KB text document loaded through the file picker with an estimate.
These browser recordings are synthetic; the user separately reported the local
square speed test worked at 30 patterns/s on their setup. This is not a claim of
universal phone performance.

## Lossless compression update

All 22 tests pass, including an independent Node gzip oracle, compressed optical
stream recovery, original-document CRC/length checks, malformed gzip rejection,
and the unchanged legacy tests. The browser recorded and decoded a compressed
Unicode/whitespace message exactly; legacy video, cancellation, Copy, document
input and desktop/mobile layouts also passed. A 13,062-byte application source
sample fell from 362.1 to 127.4 seconds per pass (65% shorter); this is a measured
sample, not a guaranteed saving for other documents.

## Single transmission and recovery (1.2.0)

All 27 tests pass. Recovery tests omit each of 33 packets in a 32-data-plus-parity
message, exercise partial groups, one loss in each group, reject two losses in
one group and corrupt parity, and check the final CRC even with a recomputed
packet CRC. A single optical symbol stream with missing observations reconstructs
exactly. The browser records one compressed transmission through completion,
checks that the canvas stays stopped, and decodes exact text. Legacy recording,
Copy, cancellation and large-document input also pass. This is synthetic evidence;
physical phone recordings of the new recovery format remain to be checked.
