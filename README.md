# Lighttext

A small, entirely client-side text-over-light experiment. Write text, display it as
white dots, record it with another device, then decode the recording locally.
Designed for desktop and mobile browsers. No accounts, database, analytics,
external libraries, uploaded videos, or persistence of user messages.

## Use

- **Transmit:** enter text, press Play, and record all five fixed markers. After a
  three-second countdown, the message repeats until stopped. Record two full
  passes to give packet recovery another opportunity. The estimated time to the first complete transmission is shown before playback,
  including the countdown and framing. Remaining time updates during each pass.
  Open UTF-8 plain-text documents and code files with **Open text file**. Keep the transmitting page in the foreground.
- **Decode:** choose a recording and wait, then Copy. Tabs, spaces, newlines,
  programming punctuation (including pipes), and Unicode are supported. Plain
  ASCII characters take one data symbol; other Unicode characters may use more.
- Keep the entire grid visible, in focus, and large in the recording. Avoid glare.
  Ordinary video mode is preferred. Browser support for camera video codecs varies;
  a compatible MP4 is the most practical fallback if a file cannot be opened.

The app does not transmit or persist user content. GitHub serves its static files
and may keep its own ordinary hosting/access logs; the app does not control those.
Messages are optically encoded, **not encrypted**. CRC checks detect accidental
corruption, not malicious manipulation.

## Run locally

Requires Python 3 to serve the files; no build or package installation:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:8765. Clipboard and optional fullscreen/wake lock use browser
capabilities with fallbacks. The fixed fullscreen-like stage works where the
Fullscreen API is unavailable. Video analysis runs in a worker and reads local
file object URLs. A Content Security Policy prohibits network connections.

## Checks

```sh
npm test
```

Requires Node 24+ (the independent CRC oracle uses `node:zlib.crc32`). Tests cover
all 512 grid states, perspective/rotation/exposure/clutter, Unicode and programming
symbols, timing, damaged packets, truncation and recovery across repeated passes.

Optional browser QA requires Playwright and Chromium. Run the local server first.
Install the test dependency outside the production bundle, then run:

```sh
npm install --no-save playwright
npx playwright install chromium
node tests/browser.mjs
node tests/roundtrip.mjs
```

Set `CHROME_PATH` to use installed Chrome, or `PLAYWRIGHT_MODULE` to an existing
Playwright module. `qa/` contains ignored local screenshots and generated fixtures.
The round-trip test records the actual transmitter canvas, then uploads that file
through the real decoder UI. Independent generated moving/perspective video is
also decoded. These are synthetic checks, not real camera recordings.

## Hosting

`.github/workflows/pages.yml` tests and deploys `dist/` to GitHub Pages on pushes to
`main`. Enable GitHub Pages with **GitHub Actions** as its source. All assets use
relative paths, so a repository URL works without a domain or server configuration.

## Protocol (LTX1 and LTX2)

A 5×5 lattice has five always-lit orientation markers: four corners and the middle
of the top edge. Other perimeter positions stay black. The inner 3×3 is read in
row-major order: eight byte bits, least significant first, then a clock bit in the
bottom-right cell. The clock flips for every symbol, including equal consecutive
bytes and loop boundaries. The transmitter holds each symbol for at least 250 ms
and does not skip symbols when rendering is delayed.

Text is UTF-8, split into 64-byte chunks. Each packet contains:

| Field | Bytes |
| --- | ---: |
| Magic `4c 54 58 31 a6 39 c5 72` | 8 |
| Complete-message CRC-32 | 4 |
| Complete-message byte length | 4 |
| Chunk index, zero-based | 2 |
| Chunk count | 2 |
| Chunk byte length | 1 |
| Chunk payload | 1–64 |
| Packet CRC-32, covering everything after magic except this CRC | 4 |

Multibyte integers are big-endian. CRC is CRC-32/ISO-HDLC. The receiver retains
validated chunks across repeated passes and requires both packet and full-message
checks before presenting text. It tries mirrored readings too. The former 8 KiB application cap has been removed. Messages above 8 KiB use
LTX2: magic byte 3 becomes `32` (hex), chunk index and count each widen to four
bytes, chunk length moves to byte 24, and payload starts at byte 25. LTX2 adds
29 framing/check bytes per chunk. The decoder accepts both versions. The 32-bit
message-length field permits up to 4,294,967,295 bytes in the format; available
browser memory imposes a much lower practical limit. Long messages can take hours
or days at four symbols per second; no two-hour video cap is imposed by the app.
Existing short-message recordings remain compatible. Reopen the updated app on
both devices for large-document support. Repetition is the recovery mechanism;
there is no claim of forward error correction within a damaged packet.

The decoder samples the local video at 15 observations per second using sequential
seeks with backpressure. Slower devices take longer rather than silently dropping
analysis work. Images are reduced to at most 640 pixels on the longer side. Bright
components identify marker candidates; a projective transform locates the inner
grid. Anchor sizes, dark perimeter cells, off-lattice spots and contrast reject
bad geometry. Stable clock groups vote on data bytes; CRC rejects corrupt packets.

## Verification boundaries

See `ACCEPTANCE.md` and `VERIFICATION.md`. Real handheld recordings, rolling shutter,
screen refresh banding, glare, heavy blur, and performance on physical iOS/Android
hardware remain to be measured. No promise of compatibility with every phone or
video codec. Missing/occluded markers and unreadable data produce a retry message,
not guessed text. Browser textareas use LF line endings.
