import {MatrixDetector} from './vision.js';
const detector=new MatrixDetector(),detailDetector=new MatrixDetector();let canvas,ctx,detail,detailCtx;
self.onmessage=({data})=>{const{frame,id}=data;try{
 const width=frame.displayWidth||frame.width,height=frame.displayHeight||frame.height,scale=Math.min(1,960/Math.max(width,height)),w=Math.round(width*scale),h=Math.round(height*scale);
 if(!canvas){canvas=new OffscreenCanvas(w,h);ctx=canvas.getContext('2d',{willReadFrequently:true});}if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 ctx.drawImage(frame,0,0,w,h);const image=ctx.getImageData(0,0,w,h);let result=detector.detect(image.data,w,h);
 // Locate cheaply, then use native-region pixels if the dots are small/unclear.
 if(result&&scale<1){const q=result.corners,edge=Math.min(...q.map((p,i)=>Math.hypot(p.x-q[(i+1)%4].x,p.y-q[(i+1)%4].y)));
  if(result.records.length===0||edge<300){const margin=edge/17,actualX=w/width,actualY=h/height,sx=Math.max(0,Math.floor((Math.min(...q.map(p=>p.x))-margin)/actualX)),sy=Math.max(0,Math.floor((Math.min(...q.map(p=>p.y))-margin)/actualY)),ex=Math.min(width,Math.ceil((Math.max(...q.map(p=>p.x))+margin)/actualX)),ey=Math.min(height,Math.ceil((Math.max(...q.map(p=>p.y))+margin)/actualY)),sw=ex-sx,sh=ey-sy,factor=Math.min(1,1200/Math.max(sw,sh)),dw=Math.round(sw*factor),dh=Math.round(sh*factor);
   if(!detail){detail=new OffscreenCanvas(dw,dh);detailCtx=detail.getContext('2d',{willReadFrequently:true});}if(detail.width!==dw||detail.height!==dh){detail.width=dw;detail.height=dh;}
   detailCtx.drawImage(frame,sx,sy,sw,sh,0,0,dw,dh);const pixels=detailCtx.getImageData(0,0,dw,dh),refined=detailDetector.detect(pixels.data,dw,dh);if(refined&&refined.records.length>result.records.length)result=refined;
  }
 }
 self.postMessage({id,records:result?.records||[],found:!!result});
}catch(e){self.postMessage({id,error:e.message});}finally{frame.close();}};
