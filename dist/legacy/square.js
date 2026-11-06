import {encode,encodeBytes,measureText,PacketDecoder,crc32} from './protocol.js?v=8';
export const PATTERNS_PER_SECOND=30;
export const SYMBOL_MS=1000/PATTERNS_PER_SECOND;
export function pack14(bytes){const out=new Uint16Array(Math.ceil(bytes.length*8/14));let word=0,count=0,index=0;for(const byte of bytes)for(let bit=0;bit<8;bit++){word|=((byte>>>bit)&1)<<count;if(++count===14){out[index++]=word;word=0;count=0;}}if(count)out[index]=word;return out;}
export function measureSquare(text){const p=measureText(text),symbols=Math.ceil((p.symbols+2)*8/14);return{bytes:p.bytes,packets:p.packets,symbols,seconds:symbols/PATTERNS_PER_SECOND};}
export function encodeSquare(text){const p=encode(text),bytes=new Uint8Array(p.symbols.length+2);bytes.set(p.symbols);bytes.set([85,170],p.symbols.length);const symbols=pack14(bytes);return{symbols,bytes:p.bytes,packets:p.packets,seconds:symbols.length/PATTERNS_PER_SECOND};}
// Compression changes the byte envelope, never the optical cells or packet checks.
export async function prepareSquare(text) {
 const raw=new TextEncoder().encode(text);
 const wrap=(packet,compressed=false)=>{const bytes=new Uint8Array(packet.symbols.length+2);bytes.set(packet.symbols);bytes.set([85,170],packet.symbols.length);const symbols=pack14(bytes);return {symbols,bytes:raw.length,packets:packet.packets,recoveryPackets:packet.recoveryPackets,seconds:symbols.length/PATTERNS_PER_SECOND,compressed};};
 const plain=wrap(encodeBytes(raw,false,true));
 if(typeof CompressionStream==='undefined')return plain;
 const zipped=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 const envelope=new Uint8Array(8+zipped.length),view=new DataView(envelope.buffer);
 view.setUint32(0,raw.length);view.setUint32(4,crc32(raw));envelope.set(zipped,8);
 const packed=wrap(encodeBytes(envelope,true,true),true);
 return packed.symbols.length<plain.symbols.length?packed:plain;
}
function parity(value){let out=0;for(;value;value>>>=1)out^=value&1;return out;}
export function bankSlot(word,index){const banks=[0,0],data=(word&16383)|((Math.floor(index/2)%4)<<14);banks[index%2]=data|65536|(parity(data)<<17);return banks;}
function reflect(value){let out=0;for(let i=0;i<18;i++)if(value&(1<<i))out|=1<<(Math.floor(i/3)*3+2-i%3);return out;}
class Receiver{
 constructor(mirrored){this.mirrored=mirrored;this.runs=[null,null];this.queue=[];this.previous=null;const messages=new Map();this.parsers=Array.from({length:8},(_,shift)=>{const decoder=new PacketDecoder();decoder.messages=messages;return{decoder,shift,skip:shift,byte:0,count:0};});}
 breakStream(){for(const p of this.parsers){p.skip=p.shift;p.byte=0;p.count=0;p.decoder.buffer=[];}}
 commit(event){
  // A mixed exposure can create a parity-valid but out-of-order sequence label.
  // Discard only an isolated outlier when the already-observed next event
  // resumes exactly where the stream should continue. CRC remains mandatory.
  if(this.previous!==null&&event.token!==((this.previous+1)%8)&&this.queue[0]?.token===((this.previous+1)%8))return;
  if(this.previous!==null&&event.token!==((this.previous+1)%8))this.breakStream();this.previous=event.token;
  const votes=[...event.votes].sort((a,b)=>b[1]-a[1]);if(!votes.length||(votes[1]&&votes[0][1]<=votes[1][1]*1.05)){this.breakStream();return;}
  const word=votes[0][0];for(const p of this.parsers)for(let bit=0;bit<14;bit++){if(p.skip){p.skip--;continue;}p.byte|=((word>>>bit)&1)<<p.count;if(++p.count===8){p.decoder.push(p.byte);p.byte=0;p.count=0;}}
 }
 order(){this.queue.sort((a,b)=>a.start-b.start);for(let i=0;i+1<this.queue.length;i++)if(Math.abs(this.queue[i].start-this.queue[i+1].start)<1e-7&&((this.queue[i].token-this.queue[i+1].token+8)%8)===1)[this.queue[i],this.queue[i+1]]=[this.queue[i+1],this.queue[i]];}
 add(banks,time){
  if(!banks)return;
  for(let input=0;input<2;input++){
   const sample=banks[input];if(!sample||sample.bits===null)continue;const bank=this.mirrored?1-input:input,bits=this.mirrored?reflect(sample.bits):sample.bits;
   if(!(bits&65536)||parity(bits&65535)!==((bits>>>17)&1))continue;
   const sequence=(bits>>>14)&3,word=bits&16383,strength=Math.max(.01,Math.min(1,sample.strength??1));let run=this.runs[bank];
   if(!run||run.sequence!==sequence){run={sequence,token:sequence*2+bank,start:time,votes:new Map()};this.runs[bank]=run;this.queue.push(run);}
   run.votes.set(word,(run.votes.get(word)||0)+strength*strength);
  }
  this.order();while(this.queue.length>3)this.commit(this.queue.shift());
 }
 finish(){this.order();while(this.queue.length)this.commit(this.queue.shift());return this.result;}
 get result(){return this.parsers.find(p=>p.decoder.result!==null)?.decoder.result??null;}
 get progress(){return this.parsers[0].decoder.progress;}
}
export class SquareDecoder{
 constructor(){this.normal=new Receiver(false);this.mirrored=new Receiver(true);this.lastTime=-Infinity;}
 add(banks,time){if(time<=this.lastTime)return;this.lastTime=time;this.normal.add(banks,time);this.mirrored.add(banks,time);}
 finish(){return this.normal.finish()??this.mirrored.finish();}
 get result(){return this.normal.result??this.mirrored.result;}
 get progress(){return this.normal.progress.received>=this.mirrored.progress.received?this.normal.progress:this.mirrored.progress;}
}
