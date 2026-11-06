import {DualGridDetector} from './square-vision.js?v=3';
import {SquareDecoder} from './square.js?v=3';
import {GridDetector} from './vision.js?v=3';
import {SignalDecoder} from './protocol.js?v=3';
let detector,square,legacy,normal,mirrored,found,lastTime;
function reset(){detector=new DualGridDetector();square=new SquareDecoder();legacy=new GridDetector();normal=new SignalDecoder();mirrored=new SignalDecoder();found=0;lastTime=-Infinity;}
function mirror(bits){let value=0;for(let i=0;i<9;i++)if(bits&(1<<i))value|=1<<(Math.floor(i/3)*3+2-i%3);return value;}
function answer(final=false){const result=final?(square.finish()??normal.finish()??mirrored.finish()):(square.result??normal.packets.result??mirrored.packets.result);const progress=[square.progress,normal.packets.progress,mirrored.packets.progress].sort((a,b)=>b.received-a.received)[0];return{result,found,progress};}
reset();
self.onmessage=({data})=>{try{
 if(data.type==='reset'){reset();self.postMessage({ready:true});return;}
 if(data.type==='finish'){self.postMessage({...answer(true),type:'finish'});return;}
 if(data.time<=lastTime){self.postMessage({...answer(),type:'frame'});return;}lastTime=data.time;
 const pixels=new Uint8ClampedArray(data.pixels),banks=detector.detect(pixels,data.width,data.height);let grid=null;
 if(!banks)grid=legacy.detect(pixels,data.width,data.height);
 if(banks||grid)found++;square.add(banks,data.time);normal.add(grid?.bits??null,data.time);mirrored.add(grid?mirror(grid.bits):null,data.time);
 self.postMessage({...answer(),type:'frame',located:!!(banks||grid)});
}catch(error){self.postMessage({error:error.message||'Could not analyze this frame.'});}};
