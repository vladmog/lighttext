import {Receiver}from './codec.js';
const pause=()=>new Promise(r=>setTimeout(r,1));
class Pool{
 constructor(n,signal){this.id=0;this.closed=null;this.pending=new Map();this.signal=signal;this.slots=Array.from({length:n},()=>{const worker=new Worker(new URL('./vision-worker.js',import.meta.url),{type:'module'}),slot={worker,busy:false};worker.onmessage=({data})=>{const p=this.pending.get(data.id);this.pending.delete(data.id);slot.busy=false;if(p)data.error?p.reject(Error(data.error)):p.resolve(data);};worker.onerror=()=>this.close(Error('Image analysis worker failed.'));return slot;});}
 async add(frame){let slot;try{while(!(slot=this.slots.find(s=>!s.busy))){if(this.closed)throw this.closed;this.signal.throwIfAborted();await pause();}if(this.closed)throw this.closed;this.signal.throwIfAborted();slot.busy=true;const id=this.id++;return await new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});slot.worker.postMessage({frame,id},[frame]);});}catch(e){frame.close();throw e;}}
 close(error=Error('Analysis stopped')){this.closed=error;for(const s of this.slots)s.worker.terminate();for(const p of this.pending.values())p.reject(error);this.pending.clear();}
}
export async function analyze(file,{signal,onProgress=()=>{},workers=2,forceCompatibility=false}={}){
 const pool=new Pool(Math.max(1,Math.min(2,workers)),signal),receiver=new Receiver();let frames=0,found=0;const start=performance.now();
 async function ingest(frame){const r=await pool.add(frame);frames++;if(r.found)found++;for(const record of r.records)receiver.add(record);}
 try{
 let meta,supported=false;
 if(!forceCompatibility&&typeof VideoDecoder!=='undefined'){try{const {inspectMP4}=await import('./mp4.js?v=2.0.0');meta=await inspectMP4(file,signal);supported=(await VideoDecoder.isConfigSupported(meta.config)).supported;}catch(e){signal.throwIfAborted();}}
 if(supported){let decoder,error=null;const jobs=new Set();let lastTime=0,stopping=false;
 try{decoder=new VideoDecoder({output:frame=>{if(stopping){frame.close();return;}lastTime=Math.max(lastTime,frame.timestamp/1e6);const job=ingest(frame).catch(e=>{error=e;}).finally(()=>jobs.delete(job));jobs.add(job);},error:e=>{error=e;}});decoder.configure(meta.config);
 for(const s of meta.samples){signal.throwIfAborted();if(error)throw error;while(decoder.decodeQueueSize>=8||jobs.size>=4){signal.throwIfAborted();if(error)throw error;await pause();}const data=await file.slice(s.offset,s.offset+s.size).arrayBuffer();decoder.decode(new EncodedVideoChunk({type:s.is_sync?'key':'delta',timestamp:Math.round(s.cts*1e6/s.timescale),duration:Math.round(s.duration*1e6/s.timescale),data}));onProgress({mode:'Reading',fraction:Math.min(1,lastTime/meta.duration),...receiver.progress,frames});}
 await decoder.flush();await Promise.all(jobs);if(error)throw error;
 }finally{stopping=true;if(decoder&&decoder.state!=='closed')decoder.close();}
 }else{
 const url=URL.createObjectURL(file),v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';
 function event(name){return new Promise((resolve,reject)=>{const cleanup=()=>{clearTimeout(timer);v.removeEventListener(name,ok);v.removeEventListener('error',bad);signal.removeEventListener('abort',abort);},ok=()=>{cleanup();resolve();},bad=()=>{cleanup();reject(Error('This browser cannot read this video.'));},abort=()=>{cleanup();reject(signal.reason||Error('Cancelled'));};const timer=setTimeout(bad,20000);v.addEventListener(name,ok,{once:true});v.addEventListener('error',bad,{once:true});signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});}
 try{const loaded=event('loadeddata');v.src=url;v.load();await loaded;if(!Number.isFinite(v.duration)||v.duration<=0)throw Error('No readable video duration.');const n=Math.ceil(v.duration*30);for(let i=0;i<n;i++){signal.throwIfAborted();const t=Math.min((i+.1)/30,v.duration-.001);if(Math.abs(v.currentTime-t)>1e-7){const sought=event('seeked');v.currentTime=t;await sought;}await ingest(await createImageBitmap(v));onProgress({mode:'Reading · compatibility mode',fraction:(i+1)/n,...receiver.progress,frames});if(await receiver.finish()!==null)break;}}
 finally{v.removeAttribute('src');v.load();URL.revokeObjectURL(url);}
 }
 const result=await receiver.finish();return{result,...receiver.progress,frames,found,seconds:(performance.now()-start)/1000,mode:supported?'VideoDecoder':'compatibility'};
 }finally{pool.close();}
}
