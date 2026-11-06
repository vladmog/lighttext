# Lighttext acceptance gates

Agreed scope: static GitHub Pages app, desktop and mobile, two modes, no account,
database, telemetry, uploads, or persistence of user content. A 5×5 lattice has
four permanent white corner dots plus the permanent top-center direction dot.
Only the inner 3×3 changes. Text, including whitespace, must survive exactly.

Before implementation the workspace contained no app, so all gates were unmet.

1. Independent known CRC vector and Unicode/whitespace fixtures round-trip exactly.
2. Corrupt, incomplete, and unrelated signals cannot produce accepted text.
   Repeated transmissions can recover complete validated packets across losses.
3. Independently rendered image fixtures exercise automatic grid detection,
   perspective, rotation, scale, brightness variation, clutter, and motion.
4. A generated video passes through the actual file-input / browser video path
   and produces exactly the original text. Synthetic evidence is labeled.
5. Browser checks at desktop, 393×852, and 852×393: working mode buttons,
   transmission/stop, decoder/cancel/copy, keyboard access, no horizontal overflow,
   usable touch targets and safe-area padding. Inspect screenshots.
6. No third-party runtime requests, remote fonts, content storage, or backend.
7. GitHub Pages serves the tested static assets, if publishing access is available.
8. Real phone recordings in Safari/iOS and Android, including handheld motion,
   must pass before broad camera reliability or device performance is claimed.
   This requires physical recordings and cannot be replaced by generated tests.
