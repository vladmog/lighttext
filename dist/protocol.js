// LTX1/LTX2: UTF-8 packets; CRC-32/ISO-HDLC; eight data dots plus one clock dot.
export const SYMBOL_MS = 250;
export const CHUNK_SIZE = 64;
export const COUNTDOWN_MS = 3000;
// The 32-bit wire length is a format bound, not the former 8 KiB product cap.
export const MAX_BYTES = 0xffffffff;
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
export function measureText(text, symbolMs = SYMBOL_MS) {
  const bytes = enc.encode(text).length;
  if (!bytes) throw new Error('Enter a message first.');
  if (bytes > MAX_BYTES) throw new Error('This document exceeds the wire format capacity. Split it into smaller documents.');
  if (!(symbolMs > 0)) throw new Error('Transmission period must be positive.');
  const packets = Math.ceil(bytes / CHUNK_SIZE), symbols = bytes + packets * (bytes > 8192 ? 29 : 25);
  return { bytes, packets, symbols, seconds: symbols * symbolMs / 1000 };
}
export function encode(text) { return encodeBytes(enc.encode(text)); }
export function encodeBytes(bytes, compressed = false) {
  if (!bytes.length) throw new Error('Enter a message first.');
  if (bytes.length > MAX_BYTES) throw new Error('This document exceeds the wire format capacity. Split it into smaller documents.');
  // Keep existing short-message recordings compatible; LTX2 widens chunk indexes
  // and counts to 32 bits so large documents do not wrap at 65,535 chunks.
  const extended = compressed || bytes.length > 8192, header = extended ? 25 : 21;
  const id = crc32(bytes), count = Math.ceil(bytes.length / CHUNK_SIZE);
  const symbols = new Uint8Array(bytes.length + count * (header + 4));
  let offset = 0;
  for (let index = 0; index < count; index++) {
    const chunk = bytes.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
    const p = symbols.subarray(offset, offset + header + 4 + chunk.length);
    p.set(MAGIC); if (extended) p[3] = compressed ? 51 : 50;
    put32(p, 8, id); put32(p, 12, bytes.length);
    if (extended) { put32(p, 16, index); put32(p, 20, count); p[24] = chunk.length; }
    else { p[16] = index >>> 8; p[17] = index & 255; p[18] = count >>> 8; p[19] = count & 255; p[20] = chunk.length; }
    p.set(chunk, header); put32(p, header + chunk.length, crc32(p.subarray(8, header + chunk.length)));
    offset += p.length;
  }
  return { symbols, bytes: bytes.length, packets: count, seconds: symbols.length * SYMBOL_MS / 1000 };
}
export function duration(seconds) {
  const n = Math.max(0, Math.ceil(seconds));
  if (n < 60) return `${n} sec`;
  if (n < 3600) return `${Math.floor(n / 60)} min ${n % 60} sec`;
  if (n < 86400) return `${Math.floor(n / 3600)} hr ${Math.floor(n % 3600 / 60)} min`;
  return `${Math.floor(n / 86400)} days ${Math.floor(n % 86400 / 3600)} hr`;
}
export class PacketDecoder {
  constructor() { this.buffer = []; this.messages = new Map(); this.result = null; this.checked = 0; this.bad = 0; }
  push(byte) {
    this.buffer.push(byte);
    while (this.buffer.length >= 8) {
      if (!MAGIC.every((b, i) => i === 3 ? [49, 50, 51].includes(this.buffer[i]) : this.buffer[i] === b)) { this.buffer.shift(); continue; }
      const compressed = this.buffer[3] === 51, extended = this.buffer[3] !== 49, header = extended ? 25 : 21;
      if (this.buffer.length < header) return;
      const h = Uint8Array.from(this.buffer.slice(0, header));
      const id = get32(h, 8), length = get32(h, 12);
      const index = extended ? get32(h, 16) : h[16] * 256 + h[17];
      const count = extended ? get32(h, 20) : h[18] * 256 + h[19], size = h[header - 1];
      if (!length || length > MAX_BYTES || count !== Math.ceil(length / CHUNK_SIZE) || index >= count ||
          size !== Math.min(CHUNK_SIZE, length - index * CHUNK_SIZE)) { this.buffer.shift(); continue; }
      if (this.buffer.length < size + header + 4) return;
      const p = Uint8Array.from(this.buffer.slice(0, size + header + 4));
      if (crc32(p.subarray(8, header + size)) !== get32(p, header + size)) {
        this.bad++; this.buffer.shift(); continue;
      }
      this.buffer.splice(0, size + header + 4); this.checked++;
      const key = `${compressed ? 3 : 1}:${id}:${length}`;
      if (!this.messages.has(key)) {
        // Bound memory even for a video containing many unrelated transmissions.
        if (this.messages.size >= 16) this.messages.delete(this.messages.keys().next().value);
        this.messages.set(key, { id, length, count, chunks: new Map() });
      }
      const m = this.messages.get(key); m.chunks.set(index, p.slice(header, header + size));
      if (m.chunks.size === count) {
        const all = new Uint8Array(length);
        for (const [i, c] of m.chunks) all.set(c, i * CHUNK_SIZE);
        if (crc32(all) === id) { try { this.result = compressed ? all : dec.decode(all); } catch { this.bad++; } }
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
