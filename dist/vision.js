const ANCHORS = [[0, 0], [2, 0], [4, 0], [4, 4], [0, 4]];
const DARK = [[1, 0], [3, 0], [0, 1], [0, 2], [0, 3], [4, 1], [4, 2], [4, 3], [1, 4], [2, 4], [3, 4]];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (a, b, c) => (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
export function homography(q) {
  const [a, b, c, d] = q;
  const dx1 = b.x - c.x, dx2 = d.x - c.x, dx3 = a.x - b.x + c.x - d.x;
  const dy1 = b.y - c.y, dy2 = d.y - c.y, dy3 = a.y - b.y + c.y - d.y;
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) < 1e-6) return null;
  const g = (dx3 * dy2 - dx2 * dy3) / det, h = (dx1 * dy3 - dx3 * dy1) / det;
  return [b.x - a.x + g * b.x, d.x - a.x + h * d.x, a.x,
          b.y - a.y + g * b.y, d.y - a.y + h * d.y, a.y, g, h];
}
export function project(h, x, y) {
  x /= 4; y /= 4; const z = h[6] * x + h[7] * y + 1;
  return { x: (h[0] * x + h[1] * y + h[2]) / z, y: (h[3] * x + h[4] * y + h[5]) / z };
}
function mean(gray, w, h, point, radius) {
  const x = Math.round(point.x), y = Math.round(point.y), r = Math.max(1, Math.floor(radius));
  if (x - r < 0 || y - r < 0 || x + r >= w || y + r >= h) return NaN;
  let sum = 0, count = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) {
    sum += gray[(y + dy) * w + x + dx]; count++;
  }
  return sum / count;
}
function blobs(gray, w, h, threshold) {
  const seen = new Uint8Array(w * h), queue = new Int32Array(w * h), out = [];
  for (let start = 0; start < gray.length; start++) {
    if (seen[start] || gray[start] < threshold) continue;
    let head = 0, tail = 1, sx = 0, sy = 0, minX = w, maxX = 0, minY = h, maxY = 0;
    queue[0] = start; seen[start] = 1;
    while (head < tail) {
      const i = queue[head++], x = i % w, y = Math.floor(i / w);
      sx += x; sy += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const n of [x > 0 ? i - 1 : -1, x + 1 < w ? i + 1 : -1, y > 0 ? i - w : -1, y + 1 < h ? i + w : -1]) {
        if (n >= 0 && !seen[n] && gray[n] >= threshold) { seen[n] = 1; queue[tail++] = n; }
      }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (tail >= 5 && tail < w * h * 0.018 && bw / bh > 0.3 && bw / bh < 3.3 && tail / (bw * bh) > 0.4)
      out.push({ x: sx / tail, y: sy / tail, r: Math.sqrt(tail / Math.PI), area: tail });
  }
  return out.sort((a, b) => b.area - a.area).slice(0, 45);
}
function readGrid(gray, w, height, q, marker, spots) {
  const h = homography(q); if (!h) return null;
  const edge = Math.min(...q.map((p, i) => dist(p, q[(i + 1) % 4])));
  if (edge < 35) return null;
  // Circle sizes must agree with the local perspective scale at all anchors.
  for (const [x,y,spot] of [[0,0,q[0]],[4,0,q[1]],[4,4,q[2]],[0,4,q[3]],[2,0,marker]]) {
    if (!spot) return null;
    const o=project(h,x,y), u=project(h,x+.175,y), v=project(h,x,y+.175);
    const expected=Math.sqrt(Math.abs((u.x-o.x)*(v.y-o.y)-(u.y-o.y)*(v.x-o.x)));
    if (spot.r / expected < .55 || spot.r / expected > 1.65) return null;
  }
  const r = edge / 4 * 0.11;
  if (marker && dist(project(h, 2, 0), marker) > Math.max(2.5, marker.r * 0.9)) return null;
  const whites = ANCHORS.map(([x, y]) => mean(gray, w, height, project(h, x, y), r));
  const blacks = DARK.map(([x, y]) => mean(gray, w, height, project(h, x, y), r));
  const lo = blacks.reduce((s, v) => s + v, 0) / blacks.length, hi = Math.min(...whites);
  if (!Number.isFinite(lo + hi) || hi - lo < 55 || Math.max(...blacks) > lo + (hi - lo) * 0.45) return null;
  let bits = 0, confidence = 1;
  for (let i = 0; i < 9; i++) {
    const v = mean(gray, w, height, project(h, 1 + i % 3, 1 + Math.floor(i / 3)), r);
    const n = (v - lo) / (hi - lo);
    if (!Number.isFinite(n) || (n > 0.25 && n < 0.75)) return null;
    if (n >= 0.5) bits |= 1 << i;
    confidence = Math.min(confidence, Math.abs(n - 0.5) * 2);
  }
  // Reject accidental quadrilaterals made from background lights: every bright
  // blob inside the candidate must belong to a permitted lattice position.
  const [a,b,c,d,e,f,g,k] = h;
  const inv = [e-f*k,c*k-b,b*f-c*e,f*g-d,a-c*g,c*d-a*f,d*k-e*g,b*g-a*k,a*e-b*d];
  for (const spot of spots) {
    const z = inv[6]*spot.x + inv[7]*spot.y + inv[8];
    const x = 4*(inv[0]*spot.x + inv[1]*spot.y + inv[2])/z;
    const y = 4*(inv[3]*spot.x + inv[4]*spot.y + inv[5])/z;
    if (x < -.25 || x > 4.25 || y < -.25 || y > 4.25) continue;
    const ix = Math.round(x), iy = Math.round(y);
    const permitted = ANCHORS.some(([ax,ay]) => ix === ax && iy === ay) ||
      (ix >= 1 && ix <= 3 && iy >= 1 && iy <= 3 && (bits & (1 << ((iy-1)*3+ix-1))));
    if (!permitted || Math.hypot(x-ix,y-iy) > .26) return null;
  }
  return { bits, corners: q, confidence, h };
}
export class GridDetector {
  constructor() { this.previous = null; }
  detect(data, w, h) {
    const gray = new Uint8Array(w * h), hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) { const k = i * 4; gray[i] = Math.round(data[k] * .2126 + data[k + 1] * .7152 + data[k + 2] * .0722); hist[gray[i]]++; }
    let max = 255, n = 0;
    for (; max > 0; max--) { n += hist[max]; if (n >= gray.length * .002) break; }
    if (max < 65) { this.previous = null; return null; }
    const spots = blobs(gray, w, h, Math.max(55, max * .65));
    if (spots.length < 5) { this.previous = null; return null; }
    if (this.previous) {
      const q = this.previous.map(p => spots.reduce((best, s) => dist(s, p) < dist(best, p) ? s : best));
      const moved = q.every((p, i) => dist(p, this.previous[i]) < Math.max(18, p.r * 4));
      if (new Set(q).size === 4 && moved) {
        const m = project(homography(q) || [0,0,-1000,0,0,-1000,0,0], 2, 0), marker = spots.find(s => dist(m, s) < Math.max(3, s.r));
        const result = marker && readGrid(gray, w, h, q, marker, spots);
        if (result) { this.previous = q; return result; }
      }
    }
    // Candidate top edges must contain the permanent direction marker.
    const tops = [];
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
      const a = spots[i], b = spots[j], length = dist(a, b);
      if (length < 35 || length / (a.r + b.r) < 6 || length / (a.r + b.r) > 24) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      for (const m of spots) {
        if (m === a || m === b) continue;
        const t = ((m.x - a.x) * dx + (m.y - a.y) * dy) / (length * length);
        const error = Math.abs(dx * (m.y - a.y) - dy * (m.x - a.x)) / length;
        if (t > .28 && t < .72 && error < Math.max(1.6, m.r * .55) && m.r / a.r > .45 && m.r / a.r < 2.2)
          tops.push({ a, b, m, length });
      }
    }
    tops.sort((a, b) => b.length - a.length);
    let best = null, bestArea = 0;
    for (const { a, b, m, length } of tops.slice(0, 80)) {
      const rest = spots.filter(s => s !== a && s !== b && s !== m && s.r / a.r > .4 && s.r / a.r < 2.5);
      for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) {
        let c = rest[i], d = rest[j];
        if (cross(a, b, c) * cross(a, b, d) <= 0) continue;
        // Order the lower edge opposite the top edge; both reflection directions are tested below.
        if (cross(a, b, c) * cross(b, c, d) <= 0) [c, d] = [d, c];
        const q = [a, b, c, d], signs = q.map((p, k) => cross(p, q[(k + 1) % 4], q[(k + 2) % 4]));
        if (!signs.every(s => s > 0) && !signs.every(s => s < 0)) continue;
        const edges = q.map((p, k) => dist(p, q[(k + 1) % 4]));
        if (Math.min(...edges) < length * .35 || Math.max(...edges) > length * 2.6) continue;
        const area = Math.abs(q.reduce((sum, p, k) => sum + p.x * q[(k + 1) % 4].y - p.y * q[(k + 1) % 4].x, 0)) / 2;
        if (area < bestArea || area < length * length * .25) continue;
        // Positive winding gives upright reading in ordinary (non-mirrored) recordings.
        const ordered = signs[0] > 0 ? q : [b, a, d, c];
        const result = readGrid(gray, w, h, ordered, m, spots);
        if (result) { best = result; bestArea = area; }
      }
    }
    this.previous = best?.corners || null;
    return best;
  }
}
