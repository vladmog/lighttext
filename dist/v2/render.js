import {cellsFor} from './codec.js';
export function paint(canvas,record,index,{size=canvas.width}={}){if(canvas.width!==size)canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,size,size);ctx.fillStyle='#fff';const pitch=size/19;function dot(x,y,r){ctx.beginPath();ctx.arc((x+1)*pitch,(y+1)*pitch,r*pitch,0,Math.PI*2);ctx.fill();}for(const[x,y]of[[0,0],[8.5,0],[17,0],[17,17],[0,17]])dot(x,y,.32);if(!record)return;const cells=cellsFor(record),bank=index%2;let i=0;for(let y=0;y<16;y++)for(let x=0;x<16;x++)if((x+y)%2===bank){if(cells[i])dot(x+1,y+1,.22);i++;}}
export class Timeline{
 constructor(total,rate,start){this.total=total;this.period=1000/rate;this.deadline=start;this.index=0;this.last=-Infinity;this.stalled=false;}
 next(now){if(this.index>=this.total||now+.05<this.deadline||now-this.last<this.period*.8)return null;const i=this.index++;if(now-this.deadline>this.period)this.stalled=true;this.last=now;this.deadline=Math.max(this.deadline+this.period,now+this.period*.8);return i;}
 get end(){return this.index>=this.total?this.last+this.period:Infinity;}
}
