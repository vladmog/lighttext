import {crc32} from './protocol.js?v=7';
export async function restoreText(value) {
 if(value===null||typeof value==='string')return value;
 if(value.length<8)throw new Error('Invalid compressed document.');
 const view=new DataView(value.buffer,value.byteOffset,value.byteLength),length=view.getUint32(0),crc=view.getUint32(4);
 if(!length)throw new Error('Invalid compressed document length.');
 const reader=new Blob([value.subarray(8)]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
 const chunks=[];let size=0;
 try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>length)throw new Error('Compressed document exceeds its declared length.');chunks.push(item.value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}
 if(size!==length)throw new Error('Incomplete compressed document.');
 const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
 if(crc32(raw)!==crc)throw new Error('Compressed document failed its integrity check.');
 return new TextDecoder('utf-8',{fatal:true}).decode(raw);
}
