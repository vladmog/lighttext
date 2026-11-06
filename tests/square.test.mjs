import test from 'node:test';import assert from 'node:assert/strict';
import {encodeSquare,measureSquare,SquareDecoder,bankSlot,PATTERNS_PER_SECOND} from '../dist/square.js';
function feedPass(decoder,words,{start=0,step=0,drop=-1,corrupt=-1,fade=true}={}){for(let i=0;i<words.length;i++){
 const now=bankSlot(words[i]^(i===corrupt?1:0),step+i),old=i?bankSlot(words[i-1],step+i-1):[0,0];
 decoder.add(now.map((bits,bank)=>(i===drop&&bank===(step+i)%2)?null:{bits:bits||(fade?old[bank]:0),strength:bits?1:fade?.4:0}),start+i/30);
}return start+words.length/30;}
test('square standard is 30/s with exact packed estimates',()=>{assert.equal(PATTERNS_PER_SECOND,30);for(const s of ['Hi','π🚀\n\t','x'.repeat(9000)]){const data=encodeSquare(s),estimate=measureSquare(s);assert.equal(estimate.symbols,data.symbols.length);assert.equal(data.seconds,data.symbols.length/30);assert.equal(estimate.seconds,data.seconds);}});
test('streaming square decoder handles Unicode, whitespace and large text',()=>{for(const text of ['Hello ()[]{} | \n\t 🚀','x'.repeat(200),'const a=1;\n\t'.repeat(1000)]){const data=encodeSquare(text),decoder=new SquareDecoder();feedPass(decoder,data.symbols);assert.equal(decoder.finish(),text);}});
test('CRC rejects corrupt and incomplete square streams',()=>{const data=encodeSquare('Uncorrupted text only');for(const opts of [{drop:18},{corrupt:18}]){const d=new SquareDecoder();feedPass(d,data.symbols,{...opts,fade:false});assert.equal(d.finish(),null);}const d=new SquareDecoder();feedPass(d,data.symbols.slice(0,10));assert.equal(d.finish(),null);});
test('validated packets recover across passes and bit alignments',()=>{const text='Repeat packets.\n'.repeat(20),data=encodeSquare(text),decoder=new SquareDecoder();const time=feedPass(decoder,data.symbols,{drop:30});feedPass(decoder,data.symbols,{start:time,step:data.symbols.length,drop:100});assert.equal(decoder.finish(),text);});
test('mid-pass entry resynchronizes on the following pass',()=>{const text='Start midway.\n\t',data=encodeSquare(text),decoder=new SquareDecoder();const time=feedPass(decoder,data.symbols.slice(12),{step:12});feedPass(decoder,data.symbols,{start:time,step:data.symbols.length});assert.equal(decoder.finish(),text);});

test('square detector reads independent rotated and fading checkerboard fixtures',async()=>{
 const {raster}=await import('./square-fixtures.mjs');const {DualGridDetector}=await import('../dist/square-vision.js');
 for(const angle of [0,.2,-.4,Math.PI/2])for(const strength of [.3,.5,1]){
  const a=bankSlot(12345,0)[0],b=bankSlot(6789,1)[1],f=raster([a,b],{angle,strengths:[strength,1]});
  assert.deepEqual(new DualGridDetector().detect(f.data,f.width,f.height)?.map(b=>b?.bits),[a,b]);
 }
});
