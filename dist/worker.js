import { GridDetector } from './vision.js';
import { SignalDecoder } from './protocol.js';
let detector = new GridDetector(), normal = new SignalDecoder(), mirrored = new SignalDecoder(), found = 0;
function mirror(bits) { let v = 0; for (let i = 0; i < 9; i++) if (bits & (1 << i)) v |= 1 << (Math.floor(i / 3) * 3 + 2 - i % 3); return v; }
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'reset') { detector = new GridDetector(); normal = new SignalDecoder(); mirrored = new SignalDecoder(); found = 0; self.postMessage({ ready: true }); return; }
    if (data.type === 'finish') { self.postMessage({ result: normal.finish() ?? mirrored.finish(), found, progress: normal.packets.progress }); return; }
    const grid = detector.detect(new Uint8ClampedArray(data.pixels), data.width, data.height);
    if (grid) found++;
    normal.add(grid?.bits ?? null, data.time);
    mirrored.add(grid ? mirror(grid.bits) : null, data.time);
    const progress = normal.packets.progress.received >= mirrored.packets.progress.received ? normal.packets.progress : mirrored.packets.progress;
    self.postMessage({ result: normal.packets.result ?? mirrored.packets.result, found, progress, located: !!grid });
  } catch (error) { self.postMessage({ error: error.message || 'Could not analyze this frame.' }); }
};
