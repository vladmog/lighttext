// LTX1: UTF-8 packets; CRC-32/ISO-HDLC; eight data dots plus one clock dot.
export const SYMBOL_MS = 250;
export const CHUNK_SIZE = 64;
export const MAX_BYTES = 8192;
export const MAGIC = Uint8Array.of(76, 84, 88, 49, 166, 57, 197, 114);
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function put32(a, p, v) { new DataView(a.buffer, a.byteOffset, a.byteLength).setUint32(p, v); }
function get32(a, p) { return new DataView(a.buffer, a.byteOffset, a.byteLength).getUint32(p); }
export function encode(text) {
  const bytes = enc.encode(text);
  if (!bytes.length) throw new Error('Enter a message first.');
  if (bytes.length > MAX_BYTES) throw new Error('Keep the message under 8 KB. Shorter messages are faster to record.');
  const id = crc32(bytes), count = Math.ceil(bytes.length / CHUNK_SIZE), packets = [];
  for (let index = 0; index < count; index++) {
    const chunk = bytes.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
    const p = new Uint8Array(25 + chunk.length);
    p.set(MAGIC); put32(p, 8, id); put32(p, 12, bytes.length);
    p[16] = index >>> 8; p[17] = index & 255;
    p[18] = count >>> 8; p[19] = count & 255; p[20] = chunk.length;
    p.set(chunk, 21); put32(p, 21 + chunk.length, crc32(p.subarray(8, 21 + chunk.length)));
    packets.push(p);
  }
  const symbols = new Uint8Array(packets.reduce((n, p) => n + p.length, 0));
  let offset = 0; for (const p of packets) { symbols.set(p, offset); offset += p.length; }
  return { symbols, bytes: bytes.length, packets: count, seconds: symbols.length * SYMBOL_MS / 1000 };
}
export class PacketDecoder {
  constructor() { this.buffer = []; this.messages = new Map(); this.result = null; this.checked = 0; this.bad = 0; }
  push(byte) {
    this.buffer.push(byte);
    while (this.buffer.length >= 8) {
      if (!MAGIC.every((b, i) => this.buffer[i] === b)) { this.buffer.shift(); continue; }
      if (this.buffer.length < 21) return;
      const h = Uint8Array.from(this.buffer.slice(0, 21));
      const id = get32(h, 8), length = get32(h, 12), index = h[16] * 256 + h[17];
      const count = h[18] * 256 + h[19], size = h[20];
      if (!length || length > MAX_BYTES || count !== Math.ceil(length / CHUNK_SIZE) || index >= count ||
          size !== Math.min(CHUNK_SIZE, length - index * CHUNK_SIZE)) { this.buffer.shift(); continue; }
      if (this.buffer.length < size + 25) return;
      const p = Uint8Array.from(this.buffer.slice(0, size + 25));
      if (crc32(p.subarray(8, 21 + size)) !== get32(p, 21 + size)) {
        this.bad++; this.buffer.shift(); continue;
      }
      this.buffer.splice(0, size + 25); this.checked++;
      const key = `${id}:${length}`;
      if (!this.messages.has(key)) {
        // Bound memory even for a video containing many unrelated transmissions.
        if (this.messages.size >= 16) this.messages.delete(this.messages.keys().next().value);
        this.messages.set(key, { id, length, count, chunks: new Map() });
      }
      const m = this.messages.get(key); m.chunks.set(index, p.slice(21, 21 + size));
      if (m.chunks.size === count) {
        const all = new Uint8Array(length);
        for (const [i, c] of m.chunks) all.set(c, i * CHUNK_SIZE);
        if (crc32(all) === id) { try { this.result = dec.decode(all); } catch { this.bad++; } }
      }
    }
  }
  get progress() {
    let best = { received: 0, total: 0 };
    for (const m of this.messages.values()) if (m.chunks.size > best.received) best = { received: m.chunks.size, total: m.count };
    return best;
  }
}
// Aggregate repeated camera observations by clock phase. Never infer a missing byte.
export class SignalDecoder {
  constructor() { this.packets = new PacketDecoder(); this.group = null; this.pending = []; this.lastTime = null; }
  commit() {
    if (!this.group) return;
    let winner = -1, max = 0, total = 0;
    for (const [value, n] of this.group.votes) { total += n; if (n > max) { winner = value; max = n; } }
    if (max >= 2 && max / total >= 0.6) this.packets.push(winner);
    else this.packets.buffer = []; // Uncertain symbol breaks this packet, subsequent magic resynchronizes.
  }
  add(value, time) {
    if (this.lastTime !== null && time - this.lastTime > 0.4) {
      this.commit(); this.group = null; this.pending = []; this.packets.buffer = [];
    }
    this.lastTime = time;
    if (value === null) return;
    const clock = value >>> 8, byte = value & 255;
    if (!this.group) { this.group = { clock, votes: new Map([[byte, 1]]) }; return; }
    if (clock === this.group.clock) {
      this.pending = []; this.group.votes.set(byte, (this.group.votes.get(byte) || 0) + 1); return;
    }
    this.pending.push(byte);
    if (this.pending.length < 2) return;
    this.commit(); this.group = { clock, votes: new Map() };
    for (const b of this.pending) this.group.votes.set(b, (this.group.votes.get(b) || 0) + 1);
    this.pending = [];
  }
  finish() { this.commit(); this.group = null; return this.packets.result; }
}
