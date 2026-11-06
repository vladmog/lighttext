import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32 as oracleCRC } from 'node:zlib';
import { encode, crc32, PacketDecoder, SignalDecoder } from '../dist/protocol.js';
import { GridDetector } from '../dist/vision.js';
import { raster } from './fixtures.mjs';
const text = 'Hello, WORLD! 0123456789:;\n\t  Aaa… café 日本語 🚀\n';
function feed(bytes, decoder = new PacketDecoder()) { for (const b of bytes) decoder.push(b); return decoder; }
test('CRC agrees with published check vector and independent Node oracle', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  for (let n=0;n<100;n++) { const b=Uint8Array.from({length:n},(_,i)=>(i*43+n)&255); assert.equal(crc32(b),oracleCRC(b)); }
});
test('UTF-8 and whitespace survive byte-exact round trips including every ASCII character', () => {
  for (const s of [text, Array.from({length:95},(_,i)=>String.fromCharCode(i+32)).join('')+'\n\t', 'a'.repeat(1000), '\n\t  \n']) {
    const encoded=encode(s); assert.equal(feed(encoded.symbols).result,s);
    const first=encoded.symbols; assert.equal(Buffer.from(first.slice(21,21+first[20])).toString(), Buffer.from(s).subarray(0,first[20]).toString());
  }
});
test('payload corruption and truncation do not produce accepted text', () => {
  const a=encode(text).symbols; const bad=a.slice();bad[23]^=1;
  assert.equal(feed(bad).result,null); assert.equal(feed(a.slice(0,-1)).result,null);
  assert.equal(feed(Uint8Array.from({length:5000},(_,i)=>(i*97)&255)).result,null);
});
test('repeated packets recover losses across passes', () => {
  const s='0123456789'.repeat(20), encoded=encode(s), d=new PacketDecoder();
  const corrupt=encoded.symbols.slice();corrupt[30]^=1;
  feed(corrupt,d);assert.equal(d.result,null);
  feed(encoded.symbols.slice(0,89),d);assert.equal(d.result,s);
});
test('clock groups preserve repeated bytes with asynchronous 15/24/30/60 fps sampling', () => {
  const s='aaaaAAA  00\n\t', bytes=encode(s).symbols;
  for(const fps of [15,24,30,60]) for(const phase of [.005,.04,.11]) {
    const d=new SignalDecoder();
    for(let t=phase;t<bytes.length*.25;t+=1/fps) {const i=Math.floor(t/.25);d.add(bytes[i]|((i%2)<<8),t);}
    assert.equal(d.finish(),s,`fps=${fps}, phase=${phase}`);
  }
});
test('a corrupted frame is outvoted; a missing symbol cannot silently change text', () => {
  const bytes=encode('mississippi').symbols,d=new SignalDecoder();
  for(let i=0;i<bytes.length;i++) for(let f=0;f<6;f++) d.add((bytes[i]^(f===3?16:0))|((i%2)<<8),i*.25+f/24);
  assert.equal(d.finish(),'mississippi');
  const lost=new SignalDecoder();
  for(let i=0;i<bytes.length;i++) if(i!==15) for(let f=0;f<6;f++) lost.add(bytes[i]|((i%2)<<8),i*.25+f/24);
  assert.equal(lost.finish(),null);
});
test('independent raster fixtures: all 512 states', () => {
  const detector=new GridDetector();
  for(let bits=0;bits<512;bits++) {const f=raster(bits);assert.equal(detector.detect(f.data,f.width,f.height)?.bits,bits,`state ${bits}`);}
});
test('independent raster fixtures: rotation, perspective, scale, exposure, clutter and motion', () => {
  const detector=new GridDetector();
  for(let n=0;n<36;n++) {
    const bits=(n*73)&511,f=raster(bits,{angle:n*Math.PI/18,size:30,px:.04,py:-.025,tx:155+Math.sin(n)*5,ty:130+Math.cos(n)*5,light:170,dark:35,clutter:true});
    assert.equal(detector.detect(f.data,f.width,f.height)?.bits,bits,`angle ${n*10}`);
  }
});
test('no signal and cropped anchors are rejected', () => {
  const d=new GridDetector();assert.equal(d.detect(new Uint8ClampedArray(320*260*4),320,260),null);
  const f=raster(355,{tx:20});assert.equal(d.detect(f.data,f.width,f.height),null);
});

test('programming punctuation and indentation survive exactly', () => {
  const code = "function greet(x = [1, 2]) {\n\treturn `hi ${x[0]}`; // a | b & c \\ d\n}\n/* <> : ; ' \" ~ ^ % $ @ # ! ? _ */";
  assert.equal(feed(encode(code).symbols).result, code);
});
