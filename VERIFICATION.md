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
